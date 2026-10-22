import { useRef, useEffect, useState } from 'react';

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
export default function LocalPobImport({ onRead, disabled }: { onRead: (xml: string, file?: { name: string; modifiedAt?: string }) => Promise<void>; disabled?: boolean }) {
  const [builds, setBuilds] = useState<SavedBuild[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false), [listed, setListed] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function act(action: 'launch' | 'builds' | 'build') {
    if (busy || disabled) return;
    const task = new AbortController(); controller.current?.abort(); controller.current = task;
    setBusy(true); setError(''); setNotice('');
    try {
      const value = await request(action, action === 'builds' ? undefined : action === 'build' ? { id: selected } : {}, task.signal);
      if (task.signal.aborted) return;
      if (action === 'builds') {
        const entries = value.builds as SavedBuild[];
        if (!Array.isArray(entries)) throw new Error('角色列表格式无效。');
        setBuilds(entries); setListed(true); setSelected(entries.some((entry) => entry.id === selected) ? selected : entries[0]?.id ?? '');
        if (value.installed !== true) setNotice('请先双击项目中的 start-pob2.cmd，配置官方 PoB2 便携版。');
      } else if (action === 'launch') setNotice('已打开 PoB2。首次请在官网完成授权，导入角色装备后按 Ctrl+S 保存，再回来刷新列表。');
      else {
        if (typeof value.xml !== 'string') throw new Error('未能读取角色 XML。');
        if (typeof value.name === 'string') await onRead(value.xml, { name: value.name, modifiedAt: typeof value.modifiedAt === 'string' ? value.modifiedAt : undefined });
        else await onRead(value.xml);
      }
    } catch (failure) { if (!task.signal.aborted) setError(failure instanceof Error ? failure.message : '本机角色读取失败。'); }
    finally { if (!task.signal.aborted) setBusy(false); }
  }
  return <section className="lo-local-pob" aria-label="本机 PoB2 角色导入">
    <h4>直接读取本机 PoB2 角色</h4>
    <p className="lo-footnote">首次在 PoB2 授权并导入游戏角色，按 Ctrl+S 保存。之后点击刷新、选中角色并读取，无需复制代码。只读取本项目便携版 Builds 文件夹中的装备方案。</p>
    <div className="lo-actions">
      <button type="button" className="wb-button" disabled={busy || disabled} onClick={() => { void act('launch'); }}>打开 PoB2</button>
      <button type="button" className="wb-button" disabled={busy || disabled} onClick={() => { void act('builds'); }}>{busy ? '正在处理…' : '刷新已保存角色'}</button>
    </div>
    {listed && !builds.length && <p>没有已保存角色。请先在此 PoB2 中导入角色并按 Ctrl+S，再刷新列表。</p>}
    {!!builds.length && <div className="lo-actions"><label>已保存角色<select aria-label="本机 PoB2 角色" value={selected} disabled={busy || disabled} onChange={(event) => setSelected(event.target.value)}>
      {builds.map((build) => <option key={build.id} value={build.id}>{build.name} · {new Date(build.modifiedAt).toLocaleString('zh-CN', { hour12: false })}</option>)}</select></label>
      <button type="button" className="wb-button primary" disabled={!selected || busy || disabled} onClick={() => { void act('build'); }}>读取角色并预览</button></div>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="lo-alert">{error}</p>}
    <p className="lo-footnote">读取与预览不会替换现有装备；下方确认后才导入。这里显示上次保存的数据，换装后请在 PoB2 重新导入角色并保存。</p>
  </section>;
}
