import { useMemo, useState } from 'react';
import { decodePob, parsePobXml, previewPob, type PobDocument } from './pobImport';
import type { LoadoutState } from './loadout';

export default function PobImportPanel({ onImport }: { onImport: (slots: LoadoutState['slots']) => void }) {
  const [text, setText] = useState(''); const [document, setDocument] = useState<PobDocument | null>(null);
  const [setId, setSetId] = useState(''); const [secondWeapons, setSecondWeapons] = useState(false);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const preview = useMemo(() => document ? previewPob(document, setId, secondWeapons) : null, [document, setId, secondWeapons]);
  async function parse(input: string) {
    setBusy(true); setDocument(null); setError('');
    try {
      const parsed = parsePobXml(await decodePob(input));
      const active = parsed.sets.find((set) => set.id === parsed.activeSet) ?? parsed.sets[0]!;
      setSetId(active.id); setSecondWeapons(active.secondWeapons); setDocument(parsed);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法读取此 PoB2 文件。'); }
    finally { setBusy(false); }
  }
  return <details className="lo-backup"><summary>从 PoB2 导入整套装备</summary>
    <p className="lo-footnote">在 PoB2 导出分享代码，或选择本地 XML。先预览，再替换本页整套装备；原有角色面板基准会清除。技能、天赋和 PoB 伤害计算不在此次导入范围内。</p>
    <textarea aria-label="PoB2 分享代码或 XML" rows={4} disabled={busy} value={text} onChange={(event) => { setText(event.target.value); setDocument(null); setError(''); }} placeholder="粘贴 PoB2 分享代码或 XML（暂不支持分享网址）" />
    <div className="lo-actions"><button type="button" className="wb-button" disabled={busy || !text.trim()} onClick={() => { void parse(text); }}>{busy ? '正在解析…' : '预览 PoB2 装备'}</button>
      <label>选择 XML 文件<input aria-label="PoB2 XML 文件" type="file" accept=".xml,.txt" disabled={busy} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        setDocument(null);
        if (file.size > 3_000_000) { setError('文件超过 3 MB。'); return; }
        setBusy(true);
        void file.text().then((input) => parse(input)).catch(() => { setError('无法读取文件。'); setBusy(false); });
      }} /></label></div>
    {error && <p className="lo-alert" role="alert">{error}</p>}
    {document && preview && <div className="lo-pob-preview">
      <label>装备组<select aria-label="PoB2 装备组" value={setId} onChange={(event) => { setSetId(event.target.value); setSecondWeapons(document.sets.find((set) => set.id === event.target.value)?.secondWeapons ?? false); }}>{document.sets.map((set) => <option key={set.id} value={set.id}>{set.title}</option>)}</select></label>
      <label><input type="checkbox" checked={secondWeapons} onChange={(event) => setSecondWeapons(event.target.checked)} />使用第二套武器</label>
      <p>可导入 {preview.imported.length} 件。未导入的栏位将留空，不会保留旧装备混入新方案。</p>
      <ul>{preview.imported.map((entry) => <li key={entry}>{entry}</li>)}</ul>
      {preview.warnings.length > 0 && <ul className="lo-warnings">{preview.warnings.map((entry, index) => <li key={index}>{entry}</li>)}</ul>}
      <button type="button" className="wb-button primary" disabled={!preview.imported.length} onClick={() => { onImport(preview.slots); setDocument(null); }}>确认替换整套装备（{preview.imported.length} 件）</button>
    </div>}
  </details>;
}
