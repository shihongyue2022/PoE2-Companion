import { useMemo, useState } from 'react';
import { decodePob, parsePobXml, previewPob, pobImportSource, type PobDocument } from './pobImport';
import type { LoadoutState } from './loadout';
import LocalPobImport from './LocalPobImport';
import type { PobSource } from './loadoutSource';
import { LoadoutChangePreview } from './LoadoutSourcePanel';
import { translatePobLabel } from './localization';
import { gemInfo, mainGem } from './pobCombat';

export default function PobImportPanel({ onImport, current }: { onImport: (slots: LoadoutState['slots'], source: PobSource) => void; current?: LoadoutState }) {
  const [text, setText] = useState(''); const [document, setDocument] = useState<PobDocument | null>(null);
  const [setId, setSetId] = useState(''); const [secondWeapons, setSecondWeapons] = useState(false);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name?: string; modifiedAt?: string }>();
  const preview = useMemo(() => document ? previewPob(document, setId, secondWeapons) : null, [document, setId, secondWeapons]);
  async function parse(input: string, file?: { name?: string; modifiedAt?: string }) {
    setBusy(true); setDocument(null); setError('');
    setFileInfo(file);
    try {
      const parsed = parsePobXml(await decodePob(input));
      const active = parsed.sets.find((set) => set.id === parsed.activeSet) ?? parsed.sets[0]!;
      setSetId(active.id); setSecondWeapons(active.secondWeapons); setDocument(parsed);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法读取此 PoB2 文件。'); }
    finally { setBusy(false); }
  }
  return <details className="lo-backup"><summary>从 PoB2 导入整套装备</summary>
    <LocalPobImport disabled={busy} onRead={parse} />
    <p className="lo-footnote">物品底座、已收录传奇名称与词缀以简体中文显示。PoB2 不提供稀有随机名称的中文对照，因此使用「稀有＋底座」作标题；英文原名保留在详情和原始文字中。</p>
    <h4>也可以粘贴分享代码或选择 XML</h4>
    <ol className="lo-import-steps">
      <li>PoB2 打开“导入／导出”（Import/Export），使用官网授权（Authorize with Path of Exile），选择角色后导入装备（Items and Skills）。</li>
      <li>在 Build Sharing 点击 Generate，再点击 Copy，取得这次角色数据的分享代码；也可保存本地 XML。</li>
      <li>在下方粘贴代码或选择 XML，预览栏位，再确认替换整套装备。换装后请在 PoB2 更新角色并重新导出。</li>
    </ol>
    <p className="lo-footnote">先预览，再替换本页整套装备；原有角色面板基准会清除。同时读取主技能、辅助宝石及 PoB2 保存的伤害快照，工坊换装不会自动重算技能伤害。</p>
    <textarea aria-label="PoB2 分享代码或 XML" rows={4} disabled={busy} value={text} onChange={(event) => { setText(event.target.value); setDocument(null); setError(''); }} placeholder="粘贴 PoB2 分享代码或 XML（暂不支持分享网址）" />
    <div className="lo-actions"><button type="button" className="wb-button" disabled={busy || !text.trim()} onClick={() => { void parse(text); }}>{busy ? '正在解析…' : '预览 PoB2 装备'}</button>
      <label>选择 XML 文件<input aria-label="PoB2 XML 文件" type="file" accept=".xml,.txt" disabled={busy} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        setDocument(null);
        if (file.size > 3_000_000) { setError('文件超过 3 MB。'); return; }
        setBusy(true);
        void file.text().then((input) => parse(input, { name: file.name, modifiedAt: new Date(file.lastModified).toISOString() })).catch(() => { setError('无法读取文件。'); setBusy(false); });
      }} /></label></div>
    {error && <p className="lo-alert" role="alert">{error}</p>}
    {document && preview && <div className="lo-pob-preview">
      <p className="lo-footnote">{[fileInfo?.name, document.profile?.level ? `方案等级 ${document.profile.level}` : '', document.profile?.className ? translatePobLabel(document.profile.className) : '', document.profile?.ascendancy ? translatePobLabel(document.profile.ascendancy) : ''].filter(Boolean).join(' · ')}{fileInfo?.modifiedAt ? ` · 保存于 ${new Date(fileInfo.modifiedAt).toLocaleString('zh-CN')}` : ''}</p>
      <label>装备组<select aria-label="PoB2 装备组" value={setId} onChange={(event) => { setSetId(event.target.value); setSecondWeapons(document.sets.find((set) => set.id === event.target.value)?.secondWeapons ?? false); }}>{document.sets.map((set) => <option key={set.id} value={set.id}>{translatePobLabel(set.title)}</option>)}</select></label>
      <label><input type="checkbox" checked={secondWeapons} onChange={(event) => setSecondWeapons(event.target.checked)} />使用第二套武器</label>
      <p>可导入 {preview.imported.length} 件。未导入的栏位将留空，不会保留旧装备混入新方案。</p>
      {document.profile?.combat && <p className="lo-footnote">技能方案 {document.profile.combat.sets.length} 套 · 主技能：{(() => { const gem = mainGem(document.profile.combat); return gem ? gemInfo(gem).label : '未指定'; })()} · 保存的伤害将在“技能与构成”中展示。</p>}
      <ul>{preview.imported.map((entry) => <li key={entry}>{entry}</li>)}</ul>
      {preview.warnings.length > 0 && <ul className="lo-warnings">{preview.warnings.map((entry, index) => <li key={index}>{entry}</li>)}</ul>}
      {current && <LoadoutChangePreview before={current} after={{ ...current, slots: preview.slots }} />}
      <button type="button" className="wb-button primary" disabled={!preview.imported.length} onClick={() => { onImport(preview.slots, pobImportSource(document, setId, secondWeapons, preview.slots, fileInfo, preview.warnings)); setDocument(null); }}>确认替换整套装备（{preview.imported.length} 件）</button>
    </div>}
  </details>;
}
