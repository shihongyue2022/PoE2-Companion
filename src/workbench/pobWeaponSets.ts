import { LOADOUT_SLOTS, type LoadoutState } from './loadout';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { samePobEquipmentFacts } from './pobRepair';
import { activeWeaponSet, syncWeaponSets } from './weaponSets';

/** Restore the formerly discarded pair from the same saved source only. */
export function supplementPobWeaponSets(state: LoadoutState, xml: string): LoadoutState {
  const source = state.source;
  if (!source || state.weaponSets) return state;
  const document = parsePobXml(xml), preview = previewPob(document, source.setId, source.secondWeapons);
  let original: LoadoutState['slots'];
  try { original = Object.fromEntries(JSON.parse(source.equipmentSignature) as [string, string][]); }
  catch { throw new Error('原装备基准无法核对，请重新预览导入两套武器。'); }
  if (!LOADOUT_SLOTS.every(({ id }) => samePobEquipmentFacts(original[id] ?? '', preview.slots[id] ?? ''))) throw new Error('原存档的装备已变化，请点击“保存后重新读取”确认新方案；未覆盖当前装备。');
  const imported = pobImportSource(document, source.setId, source.secondWeapons, preview.slots);
  return syncWeaponSets({ ...state, source: { ...source, weaponSets: imported.weaponSets },
    weaponSets: { ...imported.weaponSets!, active: activeWeaponSet(state) } });
}
