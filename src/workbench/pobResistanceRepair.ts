import { LOADOUT_SLOTS, type LoadoutState } from './loadout';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { samePobEquipmentFacts } from './pobRepair';
import { RESISTANCE_GOALS } from './resistanceModel';

export function needsPobResistanceRepair(state: LoadoutState): boolean {
  const ref = state.source?.reference;
  return !!ref && RESISTANCE_GOALS.some(({ key }) => ref.values[key] === undefined && ref.effective?.[key] !== undefined);
}

/** Supplement the original measured anchor, including when the user has since
 * changed worn gear. Never attach an updated build's totals to an older anchor. */
export function supplementPobResistances(state: LoadoutState, xml: string): LoadoutState {
  const source = state.source;
  if (!source) throw new Error('请先导入 PoB2 角色。');
  const document = parsePobXml(xml), preview = previewPob(document, source.setId, source.secondWeapons);
  const imported = pobImportSource(document, source.setId, source.secondWeapons, preview.slots);
  if (!imported.reference) throw new Error('原存档没有当前装备组的角色抗性，请在 PoB2 保存当前方案后重新导入。');
  let original: LoadoutState['slots'];
  try { original = Object.fromEntries(JSON.parse(source.equipmentSignature) as [string, string][]); }
  catch { throw new Error('原装备基准无法核对，请重新预览导入。'); }
  if (!LOADOUT_SLOTS.every(({ id }) => samePobEquipmentFacts(original[id] ?? '', preview.slots[id] ?? ''))) throw new Error('原存档的装备已变化，请预览导入新方案；没有覆盖当前装备。');
  const reference = source.reference ?? { values: {}, caps: {}, effective: {} };
  const values = { ...reference.values }, caps = { ...reference.caps }, effective = { ...reference.effective };
  for (const { key } of RESISTANCE_GOALS) {
    values[key] ??= imported.reference.values[key];
    caps[key] ??= imported.reference.caps[key];
    effective[key] ??= imported.reference.effective?.[key];
  }
  return { ...state, source: { ...source, reference: { ...reference, values, caps, effective } } };
}
