import { describe, expect, it } from 'vitest';
import { compareCandidate, deserializeLoadout, emptyLoadout, equipRaw, serializeLoadout } from './loadout';
import { parseEquipment } from './genericEquipment';
import { equipmentSignature, validCharacterPanel } from './characterPanel';

const ring = (fire = 25, life = 70) => `Rarity: Rare\nCinder Band\nGold Ring\n--------\nItem Level: 82\n--------\n+${life} to maximum Life\n+${fire}% to Fire Resistance`;
function calibrated(fire = 189) {
  const inserted = equipRaw(emptyLoadout(), 'ring1', ring());
  if (!inserted.ok) throw new Error(inserted.error);
  const state = inserted.state;
  state.character = { values: { life: 1530, energyShield: 4898, armour: 3773, evasion: 5234,
    fireResistance: fire, coldResistance: 139, lightningResistance: 113, chaosResistance: 57 },
  itemValues: { energyShield: 1398, armour: 1655, evasion: 1427 }, caps: { fireResistance: 75 },
  equipmentSignature: equipmentSignature(state.slots), recordedAt: '2026-10-22T00:00:00.000Z' };
  return state;
}
describe('game character panel calibration', () => {
  it('does not count overcapped resistance gains or safe reductions as effective upgrades/downgrades', () => {
    const state = calibrated();
    const lower = compareCandidate(state, 'ring1', parseEquipment(ring(5))!);
    expect(lower.status).toBe('equal');
    expect(lower.characterResistances[0]).toMatchObject({ before: 189, after: 169, effectiveBefore: 75, effectiveAfter: 75, effectiveDelta: 0 });
    const higher = compareCandidate(state, 'ring1', parseEquipment(ring(45))!);
    expect(higher.status).toBe('equal');
    expect(higher.characterResistances[0]?.overflowAfter).toBe(134);
  });
  it('uses the actual character total for effective resistance and target failures', () => {
    const state = calibrated(75);
    state.goals.minimums.fireResistance = 75;
    const lower = compareCandidate(state, 'ring1', parseEquipment(ring(5))!);
    expect(lower.status).toBe('downgrade');
    expect(lower.characterResistances[0]?.effectiveAfter).toBe(55);
    expect(lower.targets[0]).toMatchObject({ before: 75, after: 55, met: false });
    expect(compareCandidate(calibrated(57), 'ring1', parseEquipment(ring(35))!).characterResistances[0]).toMatchObject({ effectiveBefore: 57, effectiveAfter: 67 });
  });
  it('stores the screenshot item and final values separately without applying a fake scaling multiplier', () => {
    const state = calibrated();
    const restored = deserializeLoadout(serializeLoadout(state)).state!;
    expect(restored.character?.itemValues?.energyShield).toBe(1398);
    expect(restored.character?.values.energyShield).toBe(4898);
    expect(validCharacterPanel(restored)).toBe(true);
    const result = compareCandidate(restored, 'ring1', parseEquipment(ring(25, 90))!);
    expect(result.metrics.find((metric) => metric.key === 'life')).toMatchObject({ before: 70, after: 90, delta: 20 });
    expect(result.warnings.join(' ')).toContain('仍只比较装备贡献');
  });
  it('keeps the measured sheet stale but projects resistance through cumulative equipment changes', () => {
    const inserted = equipRaw(calibrated(), 'ring1', ring(30));
    if (!inserted.ok) throw new Error(inserted.error);
    expect(validCharacterPanel(inserted.state)).toBe(false);
    const result = compareCandidate(inserted.state, 'ring1', parseEquipment(ring(40))!);
    expect(result.characterResistances[0]).toMatchObject({ before: 194, after: 204, effectiveAfter: 75, effectiveDelta: 0 });
    expect(result.status).toBe('equal');
  });
});
