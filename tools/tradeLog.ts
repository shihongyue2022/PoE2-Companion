import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { parseTradeMessage, logTimestamp, type TradeLogSummary } from '../src/workbench/tradeTracking';

function defaults(): string[] {
  const roots = [...new Set([process.env['ProgramFiles(x86)'], process.env.ProgramFiles, 'C:\\Program Files (x86)', 'D:\\SteamLibrary', 'E:\\SteamLibrary'].filter((value): value is string => !!value))];
  return roots.flatMap((root) => [join(root, 'Steam', 'steamapps', 'common', 'Path of Exile 2', 'logs', 'Client.txt'), join(root, 'steamapps', 'common', 'Path of Exile 2', 'logs', 'Client.txt')]);
}
export function createTradeLogService(paths: readonly string[] = defaults()) {
  async function read(history = false): Promise<TradeLogSummary> {
    for (const path of paths) {
      const file = await realpath(path).catch(() => null); if (!file) continue;
      const parent = await realpath(join(path, '..')).catch(() => null); if (!parent) continue;
      const rel = relative(parent, file); if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue;
      const handle = await open(file, 'r').catch(() => null); if (!handle) continue;
      try {
        const info = await handle.stat(); if (!info.isFile()) continue;
        const limit = history ? 64 * 1024 * 1024 : 1024 * 1024;
        const start = Math.max(0, info.size - limit);
        const result: TradeLogSummary = { found: true, source: 'PoE2 / logs / Client.txt', modifiedAt: info.mtime.toISOString(), events: [], truncated: start > 0 && history,
          diagnostics: { history, bytesRead: info.size - start, lines: 0, whispers: 0, unmatchedTradeMessages: 0, acceptanceHints: 0 } };
        if (!info.size) return result;
        const decoder = new StringDecoder('utf8'); let carry = '', skipFirst = start > 0;
        const cutoff = Date.now() - 30 * 86400_000;
        const stream = handle.createReadStream({ start, end: info.size - 1, autoClose: false });
        for await (const chunk of stream) {
          const lines = (carry + decoder.write(chunk as Buffer)).split('\n'); carry = lines.pop() ?? '';
          for (let line of lines) {
            if (skipFirst) { skipFirst = false; continue; }
            if (line.length > 16_000) continue;
            line = line.trimEnd();
            const at = logTimestamp(line); if (!at || Date.parse(at) < cutoff || Date.parse(at) > Date.now() + 60_000) continue;
            const diagnostic = result.diagnostics!;
            diagnostic.lines++;
            if (!diagnostic.firstAt || at < diagnostic.firstAt) diagnostic.firstAt = at;
            if (!diagnostic.lastAt || at > diagnostic.lastAt) diagnostic.lastAt = at;
            if (/@(?:From|To|來自|来自|向|傳送給|发送给)\s/i.test(line)) {
              diagnostic.whispers++;
              const id = `log-${createHash('sha256').update(line).digest('hex')}`;
              const event = parseTradeMessage(line, { id, at, source: 'log' });
              if (event) result.events.push(event);
              else if (/(?:would like to buy|want to buy|我想.{0,20}(?:購買|购买)|listed for|標價|标价)/i.test(line)) diagnostic.unmatchedTradeMessages++;
              if (result.events.length > 500) { result.events.shift(); result.truncated = true; }
            } else if (/\]\s*(?::\s*)?(?:Trade accepted\.?|交易(?:已|被)?接受[。.]?)$/i.test(line)) {
              diagnostic.acceptanceHints++;
              const recent = result.events.filter((event) => !event.acceptedAt && Date.parse(at) >= Date.parse(event.at) && Date.parse(at) - Date.parse(event.at) <= 120_000);
              if (recent.length === 1) recent[0]!.acceptedAt = at;
            }
          }
          // Avoid carrying arbitrarily large malformed lines across chunks.
          if (carry.length > 16_000) { carry = ''; skipFirst = true; }
        }
        // An unfinished final line is read again on the next poll, never parsed as a partial price.
        if (result.truncated) result.warning = '本次最多读取日志末尾 64 MiB、保留 500 条线索，不能保证覆盖全部历史。';
        return result;
      } finally { await handle.close(); }
    }
    return { found: false, events: [], truncated: false, warning: '未找到标准 Steam 安装目录下的 Client.txt；可用粘贴按钮导入官方交易密语。' };
  }
  return { read };
}
