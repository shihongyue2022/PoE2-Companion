import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PobResistanceSync from './PobResistanceSync';
import { emptyLoadout, LOADOUT_STORAGE_KEY, serializeLoadout } from './loadout';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { combatXml } from './fixtures/pobCombat';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
const xml = combatXml.replace('<Build level="87" mainSocketGroup="3">', '<Build level="87" mainSocketGroup="3"><PlayerStat stat="ChaosResist" value="28"/><PlayerStat stat="ChaosResistOverCap" value="0"/>');
const savedAt = '2026-10-23T00:00:00Z';
function legacy() {
  const document = parsePobXml(xml), { slots } = previewPob(document, '1', false);
  const state = { ...emptyLoadout(), slots, source: pobImportSource(document, '1', false, slots, { name: 'Original.xml', modifiedAt: savedAt }) };
  delete state.source.reference!.values.chaosResistance;
  localStorage.setItem(LOADOUT_STORAGE_KEY, serializeLoadout(state));
  return state;
}
function network(modifiedAt = savedAt) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, builds: [{ id: 'a'.repeat(64), name: 'Original.xml' }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, xml, modifiedAt })));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
it('automatically repairs a legacy local snapshot once and preserves equipment and settings', async () => {
  const before = legacy(), fetcher = network();
  render(<PobResistanceSync />);
  await waitFor(() => expect(JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY)!).source.reference.values.chaosResistance).toBe(28));
  const after = JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY)!);
  expect(after.slots).toEqual(before.slots); expect(after.goals).toEqual(before.goals);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('refuses silently attaching new totals to an older snapshot if the file was saved again', async () => {
  legacy(); network('2026-10-23T01:00:00Z');
  const original = localStorage.getItem(LOADOUT_STORAGE_KEY);
  render(<PobResistanceSync />);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('存档已更新'));
  expect(localStorage.getItem(LOADOUT_STORAGE_KEY)).toBe(original);
});
it('defers background reading until the equipment page becomes active', async () => {
  legacy(); const fetcher = network();
  const view = render(<PobResistanceSync active={false} />);
  expect(fetcher).not.toHaveBeenCalled();
  view.rerender(<PobResistanceSync active />);
  await waitFor(() => expect(JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY)!).source.reference.values.chaosResistance).toBe(28));
});
