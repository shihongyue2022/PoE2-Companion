import { describe, expect, it } from 'vitest';
import { parsePobXml, previewPob, pobImportSource } from './pobImport';
import { applyPobLoadout, loadoutChanges } from './loadoutIntegration';
import { emptyLoadout } from './loadout';

const charm = 'Rarity: Unique\nNgamahu\'s Chosen\nRuby Charm\n--------\n+10% to Fire Resistance';
const xml = (equipped: boolean) => `<PathOfBuilding2><Items activeItemSet="1"><Item id="1"><![CDATA[${charm}]]></Item><ItemSet id="1">${[1, 2, 3].map((n) => `<Slot name="Charm ${n}" itemId="${equipped ? '1' : '0'}"/>`).join('')}</ItemSet></Items></PathOfBuilding2>`;
function imported(input: string) { const document = parsePobXml(input), preview = previewPob(document, '1', false); return { preview, source: pobImportSource(document, '1', false, preview.slots) }; }
describe('empty PoB charm slots replace previously equipped charms', () => {
  it('clears all three slot references while keeping unassigned library items un-equipped', () => {
    const a = imported(xml(true)), before = applyPobLoadout(emptyLoadout(), a.preview.slots, a.source);
    expect(Object.keys(before.slots)).toHaveLength(3);
    const b = imported(xml(false)), after = applyPobLoadout(before, b.preview.slots, b.source);
    expect(after.slots).toEqual({});
    expect(loadoutChanges(before, after).slots.map((row) => row.revision.status)).toEqual(['removed', 'removed', 'removed']);
    expect(after.lastImport?.equipmentChanges).toBe(3);
  });
});
