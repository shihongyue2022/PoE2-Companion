import { useEffect, useRef, useState } from 'react';
import { POB_REVIEW_MARKER, readOriginalLocalPob, repairPobEquipment } from './pobRepair';
import type { LoadoutContext } from './loadoutIntegration';

export default function PobItemRepair({ raw, context, onRepair, auto = false }: { raw: string; context?: LoadoutContext; onRepair: (raw: string) => void; auto?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const currentRecover = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => { currentRecover.current = () => recover(); });
  const canRecover = raw.includes(POB_REVIEW_MARKER) && !!context?.state.source?.fileName;
  useEffect(() => {
    const timer = auto && canRecover ? window.setTimeout(() => { void currentRecover.current(); }, 100) : undefined;
    return () => window.clearTimeout(timer);
  }, [auto, canRecover]);
  useEffect(() => () => controller.current?.abort(), []);
  const count = raw.split(POB_REVIEW_MARKER).length - 1;
  if (!count) return null;
  async function recover(file?: File) {
    if (busy) return;
    const task = new AbortController(); controller.current?.abort(); controller.current = task;
    setBusy(true); setError(''); setNotice('');
    try {
      if (file && file.size > 3_000_000) throw new Error('XML 超过 3 MB 限制。');
      const xml = file ? await file.text() : context?.state.source ? await readOriginalLocalPob(context.state.source, task.signal) : '';
      if (task.signal.aborted) return;
      if (!xml) throw new Error('请选择原 PoB2 XML 文件。');
      const fixed = repairPobEquipment(xml, raw, context ? { slot: context.slot, source: context.state.source } : undefined);
      if (fixed.raw === raw) { setNotice(`原文件仍有 ${fixed.remaining} 条数值需要核对。请复制游戏文本确认，不会强行移除标记。`); return; }
      onRepair(fixed.raw);
    } catch (reason) { if (!task.signal.aborted) setError(reason instanceof Error ? reason.message : '重新识别失败。'); }
    finally { if (!task.signal.aborted) setBusy(false); }
  }
  return <section className="wb-inline-warning wb-pob-repair" aria-label="修复 PoB 装备识别">
    <strong>{count} 条词缀带有旧 PoB 待核对标记，未用于数值评分</strong>
    <p>这不代表全部词缀都无法识别。读取原文件重新核对，只更新这件装备的识别记录；若装备已变化，会停止并保留当前记录。</p>
    <div className="wb-actions"><button type="button" className="wb-button" disabled={busy || !context?.state.source?.fileName} onClick={() => { void recover(); }}>{busy ? '正在核对原始 PoB2…' : '从本机 PoB2 重新识别此装备'}</button>
      <label>或选择原 PoB2 XML<input aria-label="用于修复识别的 PoB2 XML" type="file" accept=".xml,text/xml,application/xml" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void recover(file); event.target.value = ''; }} /></label></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
