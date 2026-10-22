param(
    [string]$BaseUrl = 'http://127.0.0.1:5173',
    [switch]$ValidateOnly
)

# Windows PowerShell 5.1 reads this file as UTF-8 with BOM.
# ValidateOnly compiles the companion without registering keys, reading the
# clipboard, sending input, contacting the workbench, or showing a window.
$ErrorActionPreference = 'Stop'
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
    throw '请使用 start-hotkeys.cmd 启动，快捷键助手需要 STA 线程。'
}
$workbenchUri = [Uri]$BaseUrl
if ($workbenchUri.Scheme -ne 'http' -or $workbenchUri.Host -ne '127.0.0.1' -or
    $workbenchUri.AbsolutePath -ne '/' -or $workbenchUri.Query -or $workbenchUri.UserInfo) {
    throw '快捷键助手仅连接 http://127.0.0.1:端口 的本地工坊。'
}

$companionCode = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace PoE2WorkbenchHotkeys {
    internal static class Native {
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);
        [DllImport("user32.dll")] internal static extern bool UnregisterHotKey(IntPtr hWnd, int id);
        [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll")] internal static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] internal static extern uint GetClipboardSequenceNumber();
        internal static bool Down(int key) { return (GetAsyncKeyState(key) & 0x8000) != 0; }
        internal static bool GameIsForeground() {
            uint processId;
            GetWindowThreadProcessId(GetForegroundWindow(), out processId);
            try {
                using (Process process = Process.GetProcessById((int)processId)) {
                    return Program.IsSupportedGameProcess(process.ProcessName);
                }
            } catch { return false; }
        }
    }

    internal sealed class HotkeyWindow : NativeWindow, IDisposable {
        internal event Action<int> Pressed;
        internal HotkeyWindow() {
            CreateHandle(new CreateParams { Caption = "PoE2 Workbench Hotkeys", Parent = new IntPtr(-3) });
        }
        protected override void WndProc(ref Message message) {
            if (message.Msg == 0x0312 && Pressed != null) Pressed(message.WParam.ToInt32());
            base.WndProc(ref message);
        }
        public void Dispose() {
            Native.UnregisterHotKey(Handle, 1);
            Native.UnregisterHotKey(Handle, 2);
            DestroyHandle();
        }
    }

    // Showing this tool window does not take keyboard focus away from the game.
    internal sealed class StatusPanel : Form {
        internal readonly Label Heading = new Label();
        internal readonly TextBox Description = new TextBox();
        internal readonly Label Item = new Label();
        internal readonly Button OpenWorkbench = new Button();
        internal readonly Button OpenResult = new Button();
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams {
            get { CreateParams value = base.CreateParams; value.ExStyle |= 0x08000000; return value; }
        }
        internal StatusPanel() {
            Text = "PoE2 做装工坊 · 快捷查价";
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(600, 440);
            FormBorderStyle = FormBorderStyle.FixedToolWindow;
            ShowInTaskbar = false; TopMost = true; StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(24, 29, 23); ForeColor = Color.FromArgb(230, 234, 218);
            Font = new Font("Microsoft YaHei UI", 9F);
            Heading.SetBounds(16, 14, 568, 36); Heading.Font = new Font(Font, FontStyle.Bold);
            Description.SetBounds(16, 56, 568, 292);
            Description.Multiline = true; Description.ReadOnly = true; Description.BorderStyle = BorderStyle.None;
            Description.BackColor = BackColor; Description.ForeColor = ForeColor; Description.ScrollBars = ScrollBars.Vertical;
            Item.SetBounds(16, 360, 568, 28); Item.AutoEllipsis = true;
            OpenWorkbench.SetBounds(16, 398, 180, 32); OpenWorkbench.Text = "在工坊查看";
            OpenResult.SetBounds(206, 398, 180, 32); OpenResult.Text = "打开官方交易"; OpenResult.Enabled = false;
            Button hide = new Button(); hide.SetBounds(396, 398, 188, 32); hide.Text = "收起 (Esc)";
            hide.Click += delegate { Hide(); };
            foreach (Button button in new Button[] { OpenWorkbench, OpenResult, hide }) {
                button.FlatStyle = FlatStyle.Flat; button.ForeColor = ForeColor; button.BackColor = Color.FromArgb(47, 57, 42);
            }
            Controls.AddRange(new Control[] { Heading, Description, Item, OpenWorkbench, OpenResult, hide });
            FormClosing += delegate(object sender, FormClosingEventArgs args) {
                if (args.CloseReason == CloseReason.UserClosing) { args.Cancel = true; Hide(); }
            };
        }
        internal void Display(string title, string description, string item) {
            Heading.Text = title; Description.Text = description; Item.Text = item;
            Description.SelectionStart = 0; Description.SelectionLength = 0; Description.ScrollToCaret();
            if (!Visible) {
                Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
                Location = new Point(area.Right - Width - 20, area.Bottom - Height - 20);
                Show();
            }
        }
    }

    internal sealed class LocalClient : WebClient {
        internal LocalClient() { Encoding = Encoding.UTF8; Proxy = null; }
        protected override WebRequest GetWebRequest(Uri address) {
            WebRequest request = base.GetWebRequest(address);
            request.Timeout = 5000;
            return request;
        }
    }

    internal sealed class CompanionContext : ApplicationContext {
        private readonly string origin;
        private readonly string launcherPath;
        private readonly HotkeyWindow window;
        private readonly StatusPanel panel;
        private readonly NotifyIcon tray;
        private readonly System.Windows.Forms.Timer timer;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private LocalClient postClient, pollClient;
        private int generation, capturePhase;
        private string mode = "trade", resultId, resultUrl, itemSummary = "";
        private uint clipboardSequence;
        private DateTime captureDeadline, postDeadline, pollDeadline, nextPoll, resultDeadline;
        private bool escapeWasDown, disposed;

        internal CompanionContext(string baseUrl, string startupScript) {
            origin = baseUrl.TrimEnd('/');
            launcherPath = startupScript;
            window = new HotkeyWindow();
            uint modifiers = 0x0001 | 0x0002 | 0x4000; // Alt + Ctrl + no repeat
            bool priceKey = Native.RegisterHotKey(window.Handle, 1, modifiers, (uint)Keys.D);
            bool checkpointKey = Native.RegisterHotKey(window.Handle, 2, modifiers, (uint)Keys.G);
            if (!priceKey || !checkpointKey) {
                window.Dispose();
                throw new InvalidOperationException("Ctrl+Alt+D 或 Ctrl+Alt+G 已被其他程序占用。请关闭冲突程序后重新启动。");
            }
            panel = new StatusPanel();
            panel.OpenWorkbench.Click += delegate { OpenWorkbench(); };
            panel.OpenResult.Click += delegate { if (!String.IsNullOrEmpty(resultUrl)) OpenUrl(resultUrl); };
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("打开做装工坊", null, delegate { OpenWorkbench(); });
            menu.Items.Add("显示快捷键说明", null, delegate {
                panel.Display("游戏内快捷键", "鼠标指向装备：\r\nCtrl+Alt+D：高级复制装备并查价\r\nCtrl+Alt+G：高级复制并核对当前制作锚点\r\n\r\n请先启动并打开本地工坊。Esc 收起面板。\r\n网页负责计算；本助手只发送一次 Ctrl+Alt+C 高级复制。", itemSummary);
            });
            menu.Items.Add("退出快捷键助手", null, delegate { ExitThread(); });
            tray = new NotifyIcon { Icon = SystemIcons.Information, Text = "PoE2 工坊 · Ctrl+Alt+D 查价 · Ctrl+Alt+G 核对", ContextMenuStrip = menu, Visible = true };
            tray.DoubleClick += delegate { OpenWorkbench(); };
            window.Pressed += BeginCapture;
            timer = new System.Windows.Forms.Timer { Interval = 100 };
            timer.Tick += Tick; timer.Start();
            tray.ShowBalloonTip(4000, "PoE2 快捷键助手已启动", "游戏内指向装备：Ctrl+Alt+D 查价，Ctrl+Alt+G 核对制作锚点。右键托盘图标可退出。", ToolTipIcon.Info);
        }

        private void BeginCapture(int hotkey) {
            if (!Native.GameIsForeground()) return;
            generation++;
            CancelRequests();
            resultId = null; resultUrl = null; itemSummary = ""; panel.OpenResult.Enabled = false;
            mode = hotkey == 2 ? "checkpoint" : "trade";
            capturePhase = 1; captureDeadline = DateTime.UtcNow.AddSeconds(3);
            panel.Display(mode == "trade" ? "正在读取装备…" : "正在核对制作锚点…", "请松开快捷键，保持鼠标指向装备。", "");
        }

        private void Tick(object sender, EventArgs args) {
            DateTime now = DateTime.UtcNow;
            bool escapeDown = Native.Down((int)Keys.Escape);
            if (escapeDown && !escapeWasDown && panel.Visible) panel.Hide();
            escapeWasDown = escapeDown;
            if (capturePhase != 0) {
                if (!Native.GameIsForeground()) { capturePhase = 0; DisplayError("已取消：游戏窗口失去焦点，请回到游戏后重试。"); }
                else if (capturePhase == 1) {
                    if (now > captureDeadline) { capturePhase = 0; DisplayError("请松开 Ctrl、Alt、Shift 后重新尝试。"); }
                    else if (!Native.Down(0x11) && !Native.Down(0x12) && !Native.Down(0x10)) {
                        clipboardSequence = Native.GetClipboardSequenceNumber();
                        capturePhase = 2; captureDeadline = now.AddMilliseconds(1800);
                        try { SendKeys.SendWait("^%c"); } // One advanced-copy gesture; retain affix tiers and flags.
                        catch { capturePhase = 0; DisplayError("无法高级复制装备。请手动 Ctrl+Alt+C 后在工坊粘贴。"); }
                    }
                } else if (Native.GetClipboardSequenceNumber() != clipboardSequence) {
                    try {
                        string raw = Clipboard.ContainsText() ? Clipboard.GetText(TextDataFormat.UnicodeText) : "";
                        if (!String.IsNullOrEmpty(raw)) { capturePhase = 0; Submit(raw); }
                        else if (now > captureDeadline) { capturePhase = 0; DisplayError("复制内容不是装备文字。请将鼠标指向装备后重试。"); }
                    } catch (ExternalException) {
                        if (now > captureDeadline) { capturePhase = 0; DisplayError("剪贴板持续被占用，请稍后重试。"); }
                    }
                } else if (now > captureDeadline) {
                    capturePhase = 0; DisplayError("没有读到新的装备文字。请确认鼠标指向装备；也可手动 Ctrl+Alt+C 高级复制，在工坊粘贴。");
                }
            }
            if (postClient != null && now > postDeadline) {
                generation++; postClient.CancelAsync(); postClient.Dispose(); postClient = null;
                DisplayError("本地工坊没有及时响应。请检查工坊是否已启动，然后重新使用快捷键。");
            }
            if (pollClient != null && now > pollDeadline) { pollClient.CancelAsync(); pollClient.Dispose(); pollClient = null; nextPoll = now.AddSeconds(2); }
            if (resultId != null && now > resultDeadline) {
                resultId = null;
                panel.Display("请在工坊查看", "等待计算结果已超时。点击“在工坊查看”，确认网页已打开、装备已导入。", itemSummary);
            } else if (resultId != null && pollClient == null && now >= nextPoll) Poll();
        }

        private void Submit(string raw) {
            if (!Program.IsEquipmentText(raw)) {
                DisplayError("未读到带有稀有度和物品等级的装备文字。请指向装备后重试；支持英文、繁体和简体。"); return;
            }
            string[] lines = raw.Replace("\r", "").Split('\n');
            List<string> names = new List<string>();
            for (int index = 0; index < Math.Min(lines.Length, 7); index++) {
                if (index > 1 && lines[index].Trim().Length > 0 && !lines[index].StartsWith("---")) names.Add(lines[index].Trim());
                if (lines[index].StartsWith("---")) break;
            }
            itemSummary = String.Join(" · ", names.ToArray());
            panel.Display("装备已复制，正在发送至工坊…", "请保持本地工坊页面打开。计算结果会显示在这里。", itemSummary);
            int requestGeneration = generation;
            LocalClient client = new LocalClient(); postClient = client; postDeadline = DateTime.UtcNow.AddSeconds(6);
            client.Headers[HttpRequestHeader.ContentType] = "application/json; charset=utf-8";
            client.UploadStringCompleted += delegate(object sender, UploadStringCompletedEventArgs response) {
                if (requestGeneration != generation || disposed) { client.Dispose(); return; }
                postClient = null; client.Dispose();
                if (response.Cancelled || response.Error != null) {
                    WebException connectionError = response.Error as WebException;
                    HttpWebResponse rejected = connectionError == null ? null : connectionError.Response as HttpWebResponse;
                    DisplayError(rejected == null
                        ? "本地工坊服务没有响应。点击“在工坊查看”会启动后台服务；网页打开后请重新查价。也可运行 start-workbench.cmd。"
                        : "工坊拒绝了这次请求（HTTP " + (int)rejected.StatusCode + "）。请在工坊检查装备文本，或稍后重试。"); return;
                }
                try {
                    Dictionary<string, object> payload = json.Deserialize<Dictionary<string, object>>(response.Result);
                    string id = Text(payload, "id");
                    if (!payload.ContainsKey("ok") || !Object.Equals(payload["ok"], true) || String.IsNullOrEmpty(id)) throw new Exception();
                    resultId = id; nextPoll = DateTime.UtcNow; resultDeadline = nextPoll.AddMinutes(3);
                    panel.Display("装备已送入工坊", mode == "trade" ? "等待网页生成查价条件和估价结果。若未打开网页，请点击“在工坊查看”。" : "等待网页核对制作锚点，并比较继续制作与重新买底装的费用。若未打开网页，请点击“在工坊查看”。", itemSummary);
                } catch { DisplayError("本地工坊返回了无效响应，请刷新网页后重试。"); }
            };
            try { client.UploadStringAsync(new Uri(origin + "/api/workbench/clipboard"), "POST", json.Serialize(new { raw = raw, mode = mode })); }
            catch { postClient = null; client.Dispose(); DisplayError("无法发送至本地工坊，请确认 start-workbench.cmd 正在运行。"); }
        }

        private void Poll() {
            string expectedId = resultId; int requestGeneration = generation;
            LocalClient client = new LocalClient(); pollClient = client; pollDeadline = DateTime.UtcNow.AddSeconds(5);
            nextPoll = DateTime.UtcNow.AddSeconds(1);
            client.DownloadStringCompleted += delegate(object sender, DownloadStringCompletedEventArgs response) {
                if (requestGeneration != generation || disposed || !Object.ReferenceEquals(pollClient, client)) { client.Dispose(); return; }
                pollClient = null; client.Dispose();
                if (response.Cancelled || response.Error != null || resultId != expectedId) return;
                try {
                    Dictionary<string, object> payload = json.Deserialize<Dictionary<string, object>>(response.Result);
                    string status = Text(payload, "status"), message = Text(payload, "message"), detail = Text(payload, "detail");
                    string candidate = Text(payload, "url");
                    if (!String.IsNullOrEmpty(candidate) && SafeUrl(candidate)) { resultUrl = candidate; panel.OpenResult.Enabled = true; }
                    if (!String.IsNullOrEmpty(message)) panel.Display(message, detail, itemSummary);
                    if (status == "ready" || status == "complete" || status == "error") resultId = null;
                } catch { /* An in-flight page refresh may momentarily return no result. */ }
            };
            try { client.DownloadStringAsync(new Uri(origin + "/api/workbench/companion-result?id=" + Uri.EscapeDataString(expectedId))); }
            catch { pollClient = null; client.Dispose(); }
        }

        private static string Text(Dictionary<string, object> payload, string key) {
            object value; return payload.TryGetValue(key, out value) && value != null ? Convert.ToString(value) : "";
        }
        private bool SafeUrl(string url) { return Program.IsAllowedResultUrl(origin, url); }
        private void OpenWorkbench() {
            if (!File.Exists(launcherPath)) { OpenUrl(origin + "/?companion=1"); return; }
            try {
                ProcessStartInfo launch = new ProcessStartInfo("powershell.exe",
                    "-NoProfile -ExecutionPolicy Bypass -File \"" + launcherPath + "\" -NoHotkeys -BaseUrl \"" + origin + "\"") {
                    UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
                };
                using (Process started = Process.Start(launch)) { }
                panel.Display("正在连接工坊", "正在检查并启动后台服务，网页会在就绪后打开。请保留网页，然后重新使用快捷键。", itemSummary);
            } catch { DisplayError("无法启动工坊，请手动运行 start-workbench.cmd。"); }
        }
        private void OpenUrl(string url) {
            if (!SafeUrl(url)) return;
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch { DisplayError("无法打开浏览器，请手动访问 " + origin); }
        }
        private void DisplayError(string detail) { panel.Display("需要检查", detail, itemSummary); }
        private void CancelRequests() {
            if (postClient != null) { postClient.CancelAsync(); postClient.Dispose(); postClient = null; }
            if (pollClient != null) { pollClient.CancelAsync(); pollClient.Dispose(); pollClient = null; }
        }
        protected override void ExitThreadCore() {
            disposed = true; timer.Stop(); timer.Dispose(); CancelRequests();
            tray.Visible = false; tray.Dispose(); window.Dispose(); panel.Dispose();
            base.ExitThreadCore();
        }
    }

    public static class Program {
        // These pure helpers are also used for validation without any game input.
        public static bool IsSupportedGameProcess(string name) {
            return !String.IsNullOrEmpty(name) && name.StartsWith("PathOfExile", StringComparison.OrdinalIgnoreCase);
        }
        public static bool IsEquipmentText(string raw) {
            return !String.IsNullOrEmpty(raw) && Encoding.UTF8.GetByteCount(raw) <= 60000 &&
                Regex.IsMatch(raw, @"(?im)^\s*(Rarity|稀有度)\s*[:：]") &&
                Regex.IsMatch(raw, @"(?im)^\s*(Item Level|物品等級|物品等级)\s*[:：]\s*\d{1,3}\s*$");
        }
        public static bool IsAllowedResultUrl(string origin, string url) {
            Uri uri;
            if (!Uri.TryCreate(url, UriKind.Absolute, out uri) || !String.IsNullOrEmpty(uri.UserInfo)) return false;
            return (uri.Scheme == "https" && uri.Host == "www.pathofexile.com" && uri.IsDefaultPort) ||
                (uri.Scheme == "http" && uri.GetLeftPart(UriPartial.Authority) == origin);
        }
        [STAThread]
        public static void Run(string baseUrl, string startupScript) {
            bool created;
            using (Mutex mutex = new Mutex(false, @"Local\PoE2CraftWorkbenchHotkeys", out created)) {
                if (!created) return;
                Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                using (CompanionContext context = new CompanionContext(baseUrl, startupScript)) { Application.Run(context); }
            }
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $companionCode -Language CSharp -ReferencedAssemblies @(
        'System.Windows.Forms', 'System.Drawing', 'System.Web.Extensions', 'System.Core'
    )
    if ($ValidateOnly) {
        Write-Output 'Hotkey companion compiled successfully; no hotkeys registered or input sent.'
        return
    }
    [PoE2WorkbenchHotkeys.Program]::Run($workbenchUri.GetLeftPart([UriPartial]::Authority), (Join-Path $PSScriptRoot 'start-workbench.ps1'))
} catch {
    if ($ValidateOnly) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
        "快捷键助手启动失败：`r`n$($_.Exception.Message)",
        'PoE2 做装工坊',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}
