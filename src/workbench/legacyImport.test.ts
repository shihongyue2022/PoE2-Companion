import { describe, expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import type { ExistingItem } from '../lib/engine';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { parseWorkbenchItem } from './itemImport';
import { recoverLegacyImport } from './legacyImport';

const data = loadShippedPatch('data/patches/0.5.0');
const imported = parseWorkbenchItem(data, BREACH_RING_SAMPLE)!;
const item: ExistingItem = { baseId: 'Rings', level: 79, rarity: 'rare', prefixes: imported.prefixes.slice(0, 1), suffixes: imported.suffixes.slice(1) };
const saved = { raw: BREACH_RING_SAMPLE, item, warnings: ['未识别：{ 已褻瀆 前綴 "電極的"(階層: 1) }'] };
describe('recovering saved advanced-header imports', () => {
  it('recovers missing flagged modifiers from complete original text', () => {
    const result = recoverLegacyImport(data, saved)!;
    expect(result.prefixes).toHaveLength(3); expect(result.suffixes).toHaveLength(3);
    expect(result.prefixes.some((entry) => entry.desecrated)).toBe(true);
    expect(result.suffixes.some((entry) => entry.fractured)).toBe(true);
    expect(item.prefixes).toHaveLength(1);
  });
  it('does not overwrite manual edits, unrelated warnings or still-unresolved text', () => {
    expect(recoverLegacyImport(data, { ...saved, actualRollsInvalid: true })).toBeNull();
    expect(recoverLegacyImport(data, { ...saved, warnings: ['未知属性'] })).toBeNull();
    expect(recoverLegacyImport(data, { ...saved, item: { ...item, level: 82 } })).toBeNull();
    expect(recoverLegacyImport(data, { ...saved, raw: saved.raw + '\n未知的新词缀' })).toBeNull();
  });
});
