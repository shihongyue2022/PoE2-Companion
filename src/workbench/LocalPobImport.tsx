import { useRef, useEffect, useState } from 'react';
import Icon from './WorkbenchIcon';

interface SavedBuild { id: string; name: string; modifiedAt: string; size: number }
async function request(path: string, body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/workbench/pob/${path}`, body === undefined ? { signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  let value: Record<string, unknown>;
  try { value = await response.json() as Record<string, unknown>; }
  catch { throw new Error('本机 PoB2 接口未就绪，请重新启动工坊。'); }
  if (!response.ok || value.ok !== true) {
    const error = value.error as { message?: string } | undefined;
    throw new Error(error?.message ?? '无法连接本机 PoB2，请重新启动工坊。');
  }
  return value;
}
export default function LocalPobImport({ onRead, disabled, currentFile, savedAt }: { onRead: (xml: string, file?: { name: string; modifiedAt?: string }) => Promise<void>; disabled?: boolean; currentFile?: string; savedAt?: string }) {
  const [builds, setBuilds] = useState<SavedBuild[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false), [listed, setListed] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [watching, setWatching] = useState(true), [newSave, setNewSave] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!watching || !currentFile || !savedAt || disabled || busy) return;
    const task = new AbortController(); let running = false;
    const check = async () => {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const value = await request('builds', undefined, task.signal);
        const entries = value.builds as SavedBuild[];
        const normalize = (name: string) => name.replace(/\\/g, '/').toLowerCase();
        const matches = Array.isArray(entries) ? entries.filter((entry) => typeof entry.name === 'string' && normalize(entry.name) === normalize(currentFile)) : [];
        if (!task.signal.aborted) setNewSave(matches.length === 1 && Number.isFinite(Date.parse(matches[0]!.modifiedAt)) && Date.parse(matches[0]!.modifiedAt) !== Date.parse(savedAt) ? matches[0]!.modifiedAt : '');
      } catch { /* An unavailable watcher must not replace the selected build or throw away gear. */ }
      finally { running = false; }
    };
    const timer = setInterval(() => { void check(); }, 30000);
    const onFocus = () => { void check(); };
    window.addEventListener('focus', onFocus);
    return () => { task.abort(); clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [watching, currentFile, savedAt, disabled, busy]);
  async function act(action: 'launch' | 'builds' | 'build' | 'refresh') {
    if (busy || disabled) return;
    const task = new AbortController(); controller.current?.abort(); controller.current = task;
    setBusy(true); setError(''); setNotice('');
    try {
      let value = await request(action === 'refresh' ? 'builds' : action, action === 'refresh' || action === 'builds' ? undefined : action === 'build' ? { id: selected } : {}, task.signal);
      if (task.signal.aborted) return;
      if (action === 'builds' || action === 'refresh') {
        const entries = value.builds as SavedBuild[];
        if (!Array.isArray(entries)) throw new Error('角色列表格式无效。');
        const normalize = (name: string) => name.replace(/\\/g, '/').toLowerCase();
        const matches = currentFile ? entries.filter((entry) => normalize(entry.name) === normalize(currentFile)) : [];
        const byName = matches.length ? matches : currentFile ? entries.filter((entry) => normalize(entry.name).split('/').at(-1) === normalize(currentFile).split('/').at(-1)) : [];
        const chosen = entries.find((entry) => entry.id === selected) ?? (byName.length === 1 ? byName[0] : !currentFile && entries.length === 1 ? entries[0] : undefined);
        setBuilds(entries); setListed(true); setSelected(chosen?.id ?? (action === 'builds' && !currentFile ? entries[0]?.id ?? '' : ''));
        if (action === 'builds') { if (value.installed !== true) setNotice('请先双击项目中的 start-pob2.cmd，配置官方 PoB2 便携版。'); return; }
        if (!chosen) throw new Error(!entries.length ? '还没有已保存角色。请先在 PoB2 导入并按 Ctrl+S 保存。' : '没有唯一匹配的当前角色文件，请先在下方明确选择要读取的角色。');
        value = await request('build', { id: chosen.id }, task.signal);
        if (task.signal.aborted) return;
      }
      if (action === 'launch') setNotice('已启动 PoB2。打开你的角色方案 → Import/Export Build → 重新导入天赋与珠宝、Items and Skills → Ctrl+S 保存。回到这里点击“保存后重新读取”。首次需要在官网亲自确认授权。');
      else {
        if (typeof value.xml !== 'string') throw new Error('未能读取角色 XML。');
        if (typeof value.name === 'string') await onRead(value.xml, { name: value.name, modifiedAt: typeof value.modifiedAt === 'string' ? value.modifiedAt : undefined });
        else await onRead(value.xml);
        if (!task.signal.aborted) setNotice(currentFile && value.name === currentFile.split(/[\\/]/).at(-1) && savedAt && value.modifiedAt === savedAt
          ? '文件保存时间未变化，读取的仍是原快照。请在 PoB2 重新导入游戏角色并按 Ctrl+S；仅在工坊替换装备不会更新 PoB2 文件。'
          : '已读取已保存快照，请核对下方装备变化，再确认替换整套装备。');
      }
    } catch (failure) { if (!task.signal.aborted) setError(failure instanceof Error ? failure.message : '本机角色读取失败。'); }
    finally { if (!task.signal.aborted) setBusy(false); }
  }
  return <section className="lo-local-pob" aria-label="本机 PoB2 角色导入">
    <h4>更新游戏角色 → PoB2 → 工坊</h4>
    <p className="lo-footnote">① PoB2 重新导入角色 → ② Ctrl+S 保存 → ③ 工坊重新读取并确认。只读本项目便携版 Builds 中的方案。</p>
    {currentFile && <p className="lo-footnote">当前来源：{currentFile}{savedAt ? ` · 保存于 ${new Date(savedAt).toLocaleString('zh-CN', { hour12: false })}` : ''}。</p>}
    {currentFile && <label className="lo-footnote"><input type="checkbox" checked={watching} onChange={(event) => setWatching(event.target.checked)} />每 30 秒检查本角色存档更新（只提示，不自动替换）</label>}
    {newSave && <p role="status" className="lo-notice">发现新的 PoB2 存档：{new Date(newSave).toLocaleString('zh-CN')}。点击“保存后重新读取”预览变化。</p>}
    <div className="lo-actions">
      <button type="button" className="wb-button" disabled={busy || disabled} onClick={() => { void act('launch'); }}><Icon name="external" />打开 PoB2</button>
      <button type="button" className="wb-button primary" disabled={busy || disabled} onClick={() => { void act('refresh'); }}><Icon name="refresh" />{busy ? '正在处理…' : '保存后重新读取'}</button>
      <button type="button" className="wb-text-button" disabled={busy || disabled} onClick={() => { void act('builds'); }}>刷新已保存角色</button>
    </div>
    {listed && !builds.length && <p>没有已保存角色。请先在此 PoB2 中导入角色并按 Ctrl+S，再刷新列表。</p>}
    {!!builds.length && <div className="lo-actions"><label>已保存角色<select aria-label="本机 PoB2 角色" value={selected} disabled={busy || disabled} onChange={(event) => setSelected(event.target.value)}>
      <option value="">请选择角色文件</option>{builds.map((build) => <option key={build.id} value={build.id}>{build.name} · {new Date(build.modifiedAt).toLocaleString('zh-CN', { hour12: false })}</option>)}</select></label>
      <button type="button" className="wb-button primary" disabled={!selected || busy || disabled} onClick={() => { void act('build'); }}>读取角色并预览</button></div>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="lo-alert">{error}</p>}
    <details><summary>取下护符／药剂后仍显示旧装备？</summary><p className="lo-footnote">检查 PoB2 的 Import/Export Build：勾选 Delete equipment，再点击 Items and Skills，按 Ctrl+S。工坊按 XML 的栏位引用读取，不会把物品库里未装备的护符当成已装备；预览里的空栏会清除工坊对应旧物品。若预览仍有护符，说明该存档仍有这些栏位，请检查角色、装备组和保存时间。</p></details>
    <p className="lo-footnote">读取与预览不会替换现有装备；下方确认后才导入。这里只检查 PoB2 保存文件，不直接监控游戏换装。</p>
  </section>;
}
