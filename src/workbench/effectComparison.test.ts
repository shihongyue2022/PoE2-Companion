import { describe, expect, it } from 'vitest';
import { parseEquipment } from './genericEquipment';
import { compareCandidate, emptyLoadout } from './loadout';
import { REPLACEMENT_BEFORE, REPLACEMENT_AFTER } from './fixtures/weaponReplacement';
import { ordainedPobXml } from './fixtures/ordainedPob';
import { parsePobXml } from './pobImport';

const compare = (after = REPLACEMENT_AFTER, before = REPLACEMENT_BEFORE) => compareCandidate(
  { ...emptyLoadout(), slots: { mainHand: before } }, 'mainHand', parseEquipment(after)!);

describe('weapon replacement verdicts compare semantics instead of clipboard language', () => {
  it('confirms the reported physical improvement with the same mechanics in different languages', () => {
    const result = compare();
    expect(result.status).toBe('upgrade');
    expect(result.paperStatus).toBe('upgrade');
    expect(result.metrics.find((metric) => metric.key === 'physicalDps')).toMatchObject({ before: 398.37, after: 473.9, delta: 75.53, relativeDelta: 18.96 });
    expect(result.metrics.find((metric) => metric.key === 'elementalDps')?.delta).toBe(0);
    expect(result.effects.length).toBeGreaterThan(3);
    expect(result.effects.every((effect) => effect.recognized && !effect.changed)).toBe(true);
    expect(result.metrics.some((metric) => metric.key === 'life')).toBe(false);
    expect(result.warnings.join(' ')).not.toContain('特殊词缀的变化');
  });
  it('keeps a changed granted skill separate from the confirmed physical DPS gain', () => {
    const result = compare(REPLACEMENT_AFTER.replace('等級 19', '等級 18'));
    expect(result.status).toBe('insufficient');
    expect(result.paperStatus).toBe('upgrade');
    expect(result.title).toBe('物品面板提升，整体收益待确认');
    expect(result.effects.some((effect) => effect.changed && effect.before.join('').includes('19') && effect.after.join('').includes('18'))).toBe(true);
  });
  it('marks lost mechanics and genuinely unknown effects instead of assuming zero impact', () => {
    const lost = compare(REPLACEMENT_AFTER.replace('每4秒在你的存在範圍內產生一個神性碎片', ''));
    expect(lost.effects.some((effect) => effect.changed && effect.after.length === 0)).toBe(true);
    expect(lost.status).toBe('insufficient'); expect(lost.paperStatus).toBe('upgrade');
    const unknown = compare(REPLACEMENT_AFTER + '\n尚未支持的自定义机制');
    expect(unknown.effects.some((effect) => !effect.recognized && effect.changed)).toBe(true);
    expect(unknown.status).toBe('insufficient');
  });
  it('retains a physical verdict while refusing to invent missing elemental or total DPS', () => {
    const result = compare(REPLACEMENT_AFTER.replace('元素傷害: 1-257\n', ''), REPLACEMENT_BEFORE.replace('Elemental Damage: 1-257\n', ''));
    expect(result.paperStatus).toBe('upgrade'); expect(result.title).toBe('物品面板提升，整体收益待确认');
    expect(result.metrics.find((metric) => metric.key === 'totalDps')).toMatchObject({ beforeUnknown: true, afterUnknown: true });
    expect(result.warnings.join(' ')).toContain('缺少物品元素伤害面板');
    expect(result.warnings.join(' ')).not.toContain('每插槽效果需要');
  });
  it('does not cancel elemental losses against physical gains', () => {
    expect(compare(REPLACEMENT_AFTER.replace('元素傷害: 1-257', '元素傷害: 1-100')).status).toBe('tradeoff');
  });
  it('does not turn a PoB weapon without printed damage/APS into a zero-DPS baseline', () => {
    const before = parsePobXml(ordainedPobXml()).items['1']!.raw;
    const result = compare(REPLACEMENT_AFTER, before);
    expect(result.metrics.find((metric) => metric.key === 'physicalDps')?.beforeUnknown).toBe(true);
    expect(result.paperStatus).toBe('insufficient');
    expect(result.status).toBe('insufficient');
  });
});
