import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useSavedLoadout, writeSavedLoadout } from './loadoutStore';
import { emptyLoadout, LOADOUT_STORAGE_KEY, serializeLoadout } from './loadout';
import { BOOTS_SAMPLE, BOOTS_UPGRADE } from './fixtures/fullGear';

function SavedView({ id }: { id: string }) {
  const saved = useSavedLoadout();
  return <div data-testid={id}>{Object.keys(saved.state.slots).length} items · {saved.error}</div>;
}
describe('shared character snapshot persistence', () => {
  it('notifies mounted views and protects newer changes from stale writers', () => {
    render(<><SavedView id="first" /><SavedView id="second" /></>);
    expect(screen.getByTestId('first')).toHaveTextContent('0 items');
    act(() => { expect(writeSavedLoadout({ ...emptyLoadout(), slots: { boots: BOOTS_SAMPLE } }, '')).toBe(''); });
    expect(screen.getByTestId('first')).toHaveTextContent('1 items');
    expect(screen.getByTestId('second')).toHaveTextContent('1 items');
    act(() => { expect(writeSavedLoadout(emptyLoadout(), '')).toContain('另一页面'); });
    expect(screen.getByTestId('first')).toHaveTextContent('1 items');
    act(() => { localStorage.setItem(LOADOUT_STORAGE_KEY, serializeLoadout(emptyLoadout())); window.dispatchEvent(new StorageEvent('storage', { key: LOADOUT_STORAGE_KEY })); });
    expect(screen.getByTestId('second')).toHaveTextContent('0 items');
  });
  it('persists only quotes matching current item text and preserves unreadable data until deliberate recovery', () => {
    const state = { ...emptyLoadout(), slots: { boots: BOOTS_UPGRADE }, quotes: { boots: {
      itemText: BOOTS_SAMPLE, league: 'Test', amount: 10, currency: 'divine' as const, at: new Date().toISOString(), url: 'https://www.pathofexile.com/trade2', conditions: 'old reference',
    } } };
    expect(writeSavedLoadout(state, '')).toBe('');
    expect(JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY)!)).not.toHaveProperty('quotes');
    localStorage.setItem(LOADOUT_STORAGE_KEY, 'broken JSON');
    render(<SavedView id="broken" />);
    expect(screen.getByTestId('broken')).toHaveTextContent('不是有效的 JSON');
    expect(localStorage.getItem(LOADOUT_STORAGE_KEY)).toBe('broken JSON');
  });
});
