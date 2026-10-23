import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PobWeaponSync from './PobWeaponSync';
import { emptyLoadout, LOADOUT_STORAGE_KEY, serializeLoadout } from './loadout';
import { applyPobLoadout } from './loadoutIntegration';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { dualWeaponsXml } from './fixtures/dualWeapons';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());
const savedAt = '2026-10-23T00:00:00Z';
function legacy() {
  const document = parsePobXml(dualWeaponsXml), preview = previewPob(document, '1', false);
  const state = applyPobLoadout(emptyLoadout(), preview.slots, pobImportSource(document, '1', false, preview.slots, { name: 'Current.xml', modifiedAt: savedAt }));
  delete state.weaponSets; delete state.source!.weaponSets;
  localStorage.setItem(LOADOUT_STORAGE_KEY, serializeLoadout(state));
  return state;
}
describe('safe recovery of legacy weapon pair imports', () => {
  it('restores the missing pair from the exact saved snapshot and preserves the active equipment', async () => {
    const state = legacy();
    const network = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, builds: [{ id: 'a'.repeat(64), name: 'Current.xml' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, xml: dualWeaponsXml, modifiedAt: savedAt })));
    vi.stubGlobal('fetch', network);
    render(<PobWeaponSync />);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY)!).weaponSets?.second.offHand).toContain('Second Shield'));
    expect(JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY)!).slots).toEqual(state.slots);
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('does not silently pull in a newer saved build or overwrite current gear', async () => {
    legacy(); const before = localStorage.getItem(LOADOUT_STORAGE_KEY);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, builds: [{ id: 'a'.repeat(64), name: 'Current.xml' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, xml: dualWeaponsXml, modifiedAt: '2026-10-23T01:00:00Z' }))));
    render(<PobWeaponSync />);
    expect(await screen.findByRole('status')).toHaveTextContent('存档已更新');
    expect(localStorage.getItem(LOADOUT_STORAGE_KEY)).toBe(before);
  });
});
