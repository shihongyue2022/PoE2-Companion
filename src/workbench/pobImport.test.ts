import { describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import { Blob as NodeBlob } from 'node:buffer';
import { decodePob, parsePobXml, previewPob } from './pobImport';
import { parseEquipment, equipmentMetrics, equipmentDisplayName } from './genericEquipment';

const ring = `Rarity: RARE
Dawn Loop
Amethyst Ring
Item Level: 82
Prefix: SomeModId
Implicits: 1
+12% to Chaos Resistance
{range:0.5}+(70-90) to maximum Life
{variant:1}+17% to Fire Resistance
{variant:2}+33% to Cold Resistance
{disabled}+100% to Lightning Resistance`;
const xml = `<PathOfBuilding2><Items activeItemSet="2">
<Item id="7" variant="1"><![CDATA[${ring}]]></Item>
<Item id="8"><![CDATA[Rarity: NORMAL
Sapphire Ring
Item Level: 80
Implicits: 1
+20% to Cold Resistance]]></Item>
<ItemSet id="1" title="Old"><Slot name="Ring 1" itemId="8" /></ItemSet>
<ItemSet id="2" title="Current"><Slot name="Ring 1" itemId="7" /><Slot name="Ring 2" itemId="8" /><Slot name="Ring 3" itemId="7" /><Slot name="Helmet" itemId="0" /></ItemSet>
</Items></PathOfBuilding2>`;

describe('PoB2 whole equipment import', () => {
  it('uses the selected set, exact integral range roll, implicit placement and selected variant', () => {
    const doc = parsePobXml(xml); expect(doc.activeSet).toBe('2');
    const preview = previewPob(doc, doc.activeSet, false);
    expect(preview.imported).toHaveLength(2);
    expect(preview.warnings).toEqual([expect.stringContaining('Ring 3')]);
    const item = parseEquipment(preview.slots.ring1!)!;
    expect(item.itemLevel).toBe(82); expect(item.mods).toHaveLength(3);
    expect(item.mods.every((mod) => mod.searchable)).toBe(true);
    expect(item.mods[0]!.ids).toEqual(expect.arrayContaining([expect.stringMatching(/^implicit\./)]));
    expect(equipmentMetrics(item)).toMatchObject({ life: 80, fireResistance: 17, chaosResistance: 12 });
    expect(item.mods.some((mod) => /SomeModId|Cold|Lightning/.test(mod.raw))).toBe(false);
    expect(previewPob(doc, '1', false).slots.ring1).toContain('Sapphire Ring');
  });
  it('preserves uncertain precision and catalyst effects instead of guessing searchable rolls', () => {
    for (const source of [xml.replace('range:0.5', 'range:0.51'), xml.replace('Item Level: 82', 'Item Level: 82\nCatalystQuality: 20')]) {
      const preview = previewPob(parsePobXml(source), '2', false);
      const item = parseEquipment(preview.slots.ring1!)!;
      expect(preview.warnings).toEqual(expect.arrayContaining([expect.stringContaining('已保留文字')]));
      expect(equipmentMetrics(item).life).toBeUndefined();
      expect(item.mods.some((mod) => !mod.searchable && mod.raw.includes('PoB数值待'))).toBe(true);
    }
  });
  it('reads fixed rolls despite saved ModRange metadata, while unresolved ranges stay excluded', () => {
    const source = `<PathOfBuilding2><Items><Item id="1"><![CDATA[Rarity: RARE
Imported Loop
Amethyst Ring
Item Level: 82
Implicits: 1
+12% to Chaos Resistance
+157 to maximum Mana
+(70-90) to maximum Life
Grants Skill: Spear Throw]]><ModRange id="2" range="0.5"/></Item><Slot name="Ring 1" itemId="1"/></Items></PathOfBuilding2>`;
    const preview = previewPob(parsePobXml(source), '1', false);
    const item = parseEquipment(preview.slots.ring1!)!;
    expect(equipmentMetrics(item)).toMatchObject({ mana: 157, chaosResistance: 12 });
    expect(equipmentMetrics(item).life).toBeUndefined();
    expect(item.mods.find((mod) => mod.text.startsWith('+157'))).toMatchObject({ searchable: true, label: '157最大魔力' });
    expect(item.mods.find((mod) => mod.raw.includes('(70-90)'))).toMatchObject({ searchable: false });
    expect(item.mods.find((mod) => mod.text === 'Grants Skill: Spear Throw')).toMatchObject({ label: '赋予技能: 长矛投掷', searchable: false, ids: [] });
    expect(equipmentDisplayName(item)).toBe('稀有紫晶戒指');
    expect(item.raw).toContain('Imported Loop');
    expect(preview.imported).toEqual(['左戒指：稀有紫晶戒指']);
  });
  it('retains corrupted state despite catalyst uncertainty and handles legacy direct Slots', () => {
    const doc = parsePobXml(`<PathOfBuilding2><Items><Item id="7"><![CDATA[${ring}\nCatalystQuality: 20\nTwice Corrupted]]></Item><Slot name="Ring 1" itemId="7" /></Items></PathOfBuilding2>`);
    expect(parseEquipment(previewPob(doc, '1', false).slots.ring1!)?.doubleCorrupted).toBe(true);
  });
  it('does not import the inactive weapon set or silently accept missing items', () => {
    const doc = parsePobXml(xml.replace('<Slot name="Ring 3" itemId="7" />', '<Slot name="Weapon 1" itemId="99" /><Slot name="Weapon 1 Swap" itemId="98" />'));
    expect(previewPob(doc, '2', false).warnings.join()).toContain('99');
    expect(previewPob(doc, '2', false).warnings.join()).not.toContain('98');
    expect(previewPob(doc, '2', true).warnings.join()).toContain('98');
  });
  it('rejects PoE1, malformed XML, external entities and duplicate item IDs', () => {
    expect(() => parsePobXml(xml.replace(/PathOfBuilding2/g, 'PathOfBuilding'))).toThrow('PoE1');
    expect(() => parsePobXml('<PathOfBuilding2>')).toThrow('格式');
    expect(() => parsePobXml('<!DOCTYPE x>' + xml)).toThrow('外部');
    expect(() => parsePobXml(xml.replace('id="8"', 'id="7"'))).toThrow('重复');
  });
  it('decodes actual zlib base64url share codes locally and rejects URLs', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    try {
      expect(await decodePob(deflateSync(xml).toString('base64url'))).toBe(xml);
      expect(await decodePob(xml)).toBe(xml);
      await expect(decodePob('https://pobb.in/something')).rejects.toThrow('网址');
      await expect(decodePob('not_a_valid_code')).rejects.toThrow('解压');
      await expect(decodePob(deflateSync('a'.repeat(3_000_001)).toString('base64url'))).rejects.toThrow('3 MB');
    } finally { vi.unstubAllGlobals(); }
  });
});
