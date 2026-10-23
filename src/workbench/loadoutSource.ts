import type { MetricKey, ResistanceKey, LoadoutState } from './loadout';
import { readPobCombat, type PobCombat } from './pobCombat';
import { readWeaponPair, type WeaponSets } from './weaponSets';

export interface PobSource {
  kind: 'pob'; importedAt: string; fileName?: string; savedAt?: string;
  className?: string; ascendancy?: string; level?: number; version?: string;
  setId: string; setTitle: string; secondWeapons: boolean;
  equipmentSignature: string;
  weaponSets?: Pick<WeaponSets, 'first' | 'second'>;
  warnings?: string[];
  combat?: PobCombat;
  reference?: { values: Partial<Record<MetricKey, number>>; caps: Partial<Record<ResistanceKey, number>>; effective?: Partial<Record<ResistanceKey, number>>; fullDps?: number };
}
export interface PreviousLoadout { slots: LoadoutState['slots']; weaponSets?: WeaponSets; source?: PobSource; replacedAt: string;
  after?: { slots: LoadoutState['slots']; weaponSets?: WeaponSets } }
export function readPobSource(value: unknown): PobSource | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (row.kind !== 'pob' || typeof row.importedAt !== 'string' || !Number.isFinite(Date.parse(row.importedAt))
    || typeof row.equipmentSignature !== 'string' || row.equipmentSignature.length > 1_000_000
    || typeof row.setId !== 'string' || row.setId.length > 100 || typeof row.setTitle !== 'string' || row.setTitle.length > 300
    || typeof row.secondWeapons !== 'boolean') return undefined;
  const result: PobSource = { kind: 'pob', importedAt: row.importedAt, equipmentSignature: row.equipmentSignature,
    setId: row.setId, setTitle: row.setTitle, secondWeapons: row.secondWeapons };
  for (const key of ['fileName', 'className', 'ascendancy', 'version'] as const) if (typeof row[key] === 'string' && row[key].length <= 300) result[key] = row[key];
  if (typeof row.savedAt === 'string' && Number.isFinite(Date.parse(row.savedAt))) result.savedAt = row.savedAt;
  if (typeof row.level === 'number' && Number.isInteger(row.level) && row.level > 0 && row.level <= 100) result.level = row.level;
  if (Array.isArray(row.warnings)) result.warnings = row.warnings.filter((warning): warning is string => typeof warning === 'string').slice(0, 50).map((warning) => warning.slice(0, 500));
  result.combat = readPobCombat(row.combat);
  if (row.weaponSets && typeof row.weaponSets === 'object') {
    const sets = row.weaponSets as Record<string, unknown>, first = readWeaponPair(sets.first), second = readWeaponPair(sets.second);
    if (first && second) result.weaponSets = { first, second };
  }
  if (row.reference && typeof row.reference === 'object') {
    const ref = row.reference as Record<string, unknown>;
    const fields: MetricKey[] = ['life', 'mana', 'energyShield', 'armour', 'evasion', 'spirit', 'strength', 'dexterity', 'intelligence', 'movementSpeed', 'fireResistance', 'coldResistance', 'lightningResistance', 'chaosResistance'];
    const values: NonNullable<PobSource['reference']>['values'] = {}, caps: NonNullable<PobSource['reference']>['caps'] = {}, effective: NonNullable<PobSource['reference']>['effective'] = {};
    for (const key of fields) {
      const number = (ref.values as Record<string, unknown> | undefined)?.[key];
      if (typeof number === 'number' && Number.isFinite(number) && number >= -200 && number <= 1e12) values[key] = number;
    }
    for (const key of ['fireResistance', 'coldResistance', 'lightningResistance', 'chaosResistance'] as const) {
      const number = (ref.caps as Record<string, unknown> | undefined)?.[key];
      if (typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 100) caps[key] = number;
      const actual = (ref.effective as Record<string, unknown> | undefined)?.[key];
      if (typeof actual === 'number' && Number.isFinite(actual) && actual >= -200 && actual <= 100) effective[key] = actual;
    }
    const fullDps = typeof ref.fullDps === 'number' && Number.isFinite(ref.fullDps) && ref.fullDps >= 0 && ref.fullDps <= 1e15 ? ref.fullDps : undefined;
    result.reference = { values, caps, effective, ...(fullDps === undefined ? {} : { fullDps }) };
  }
  return result;
}
