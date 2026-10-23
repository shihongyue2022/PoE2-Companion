import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EquipmentTradePanel from './EquipmentTradePanel';
import { damageRing, damageState } from './fixtures/damageGoal';
import { MORIOR_INVICTUS_SAMPLE } from './fixtures/moriorInvictus';
import { equipmentSignature } from './resistanceModel';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';

const patch = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade();

afterEach(() => vi.unstubAllGlobals());
it('invalidates old prices when the budget changes, retains the selected cores and applies the budget to both sorts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, total: 0, fetched: 0, priced: 0, listings: [], groups: [], sampledAt: new Date().toISOString(), cached: false, warnings: [], url: 'https://www.pathofexile.com/trade2' }))));
  const raw = 'Rarity: Unique\nThe Taming\nPrismatic Ring\n--------\n+26% to all Elemental Resistances\n24% increased Damage for each type of Elemental Ailment on Enemy';
  render(<EquipmentTradePanel raw={raw} league="Test" onLeague={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '添加属性' }));
  const first = screen.getByRole('combobox', { name: '核心属性 1' }), second = screen.getByRole('combobox', { name: '核心属性 2' });
  const original = [(first as HTMLSelectElement).value, (second as HTMLSelectElement).value];
  const scope = screen.getByRole('combobox', { name: /核心属性要求：.*24/ });
  await user.selectOptions(scope, '3');
  await user.click(screen.getByRole('button', { name: '检索提升候选' }));
  await screen.findByText(/匹配 0 件 · 已取 0 件/);
  await user.selectOptions(screen.getByRole('combobox', { name: '升级预算上限档位' }), '25');
  await waitFor(() => expect(screen.queryByText(/匹配 0 件 · 已取 0 件/)).not.toBeInTheDocument());
  expect(first).toHaveValue(original[0]); expect(second).toHaveValue(original[1]); expect(scope).toHaveValue('3');
  expect(within(first).getAllByRole('option').length).toBeGreaterThan(1);
  for (const name of ['官网核对联合条件 ↗', '官网按核心属性降序 ↗']) {
    const query = JSON.parse(new URL(screen.getByRole('link', { name }).getAttribute('href')!).searchParams.get('q')!);
    expect(query.query.filters.trade_filters.filters.price).toEqual({ max: 25, option: 'divine' });
    expect(JSON.stringify(query.query.stats)).toContain('24.72');
    expect(JSON.stringify(query.query.stats)).toContain('26');
  }
});
it.each(['loadout', 'single'])('does not treat an unknown whole-loadout baseline as capped in %s mode', async (mode) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, total: 1, fetched: 1, priced: 1, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false, url: 'https://www.pathofexile.com/trade2',
    listings: [{ id: 'unknown', name: 'Unknown Loop', base: 'Gold Ring', price: { amount: 1, currency: 'divine' }, explicitMods: ['+70 to maximum Life', '+30% to all Elemental Resistances', '+12% to Chaos Resistance'] }] }))));
  const state = damageState(); state.character = undefined; state.source = undefined;
  render(<EquipmentTradePanel raw={damageRing} league="Test" onLeague={vi.fn()} loadoutContext={{ state, slot: 'ring1', raw: damageRing }} />);
  const user = userEvent.setup();
  expect(screen.getByRole('region', { name: '整套抗性约束' })).toHaveTextContent('未知不会视为达标');
  await user.selectOptions(screen.getByRole('combobox', { name: '配装方式' }), mode);
  await user.click(screen.getByRole('button', { name: '检索提升候选' }));
  await screen.findByText(/匹配 1 件 · 已取 1 件/);
  expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(mode === 'single' ? 0 : 1);
  expect(screen.queryByText('整套四抗达标')).not.toBeInTheDocument();
  if (mode === 'loadout') expect(screen.getByText('抗性待核对')).toBeVisible();
});
it('does not send unsupported per-socket resistance totals as ordinary item floors even in single-slot mode', async () => {
  const state = damageState(); state.slots = { body: MORIOR_INVICTUS_SAMPLE };
  state.character!.equipmentSignature = state.source!.equipmentSignature = equipmentSignature(state.slots);
  state.socketEvidence = [{ itemText: MORIOR_INVICTUS_SAMPLE, filled: 5 }];
  render(<EquipmentTradePanel raw={MORIOR_INVICTUS_SAMPLE} league="Test" onLeague={vi.fn()} loadoutContext={{ state, slot: 'body', raw: MORIOR_INVICTUS_SAMPLE }} />);
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '配装方式' }), 'single');
  for (const name of ['官网核对联合条件 ↗', '官网按核心属性降序 ↗']) {
    const query = JSON.parse(new URL(screen.getByRole('link', { name }).getAttribute('href')!).searchParams.get('q')!);
    expect(JSON.stringify(query)).not.toContain('pseudo_total_');
    expect(query.query.name).toBe('Morior Invictus');
  }
});

it('adds a missing belt chaos suffix and item-level floor using compact preset menus', async () => {
  const raw = 'Rarity: Rare\nExample Belt\nRawhide Belt\n--------\nItem Level: 84\n--------\n+60 to maximum Life';
  render(<EquipmentTradePanel raw={raw} league="Test" onLeague={vi.fn()} t1Data={patch} t1Trade={trade} />);
  const user = userEvent.setup(), property = screen.getByRole('combobox', { name: '核心属性 1' });
  const chaos = within(property).getByRole('option', { name: '混沌抗性 · 后缀 · 可新增' });
  await user.selectOptions(property, chaos.getAttribute('value')!);
  const scope = screen.getByRole('combobox', { name: '核心属性要求：混沌抗性' });
  expect(scope).toHaveValue('tier:3');
  expect(within(scope).getByRole('option', { name: 'T1 · ≥ 24 · 需物等 81' })).toBeVisible();
  await user.selectOptions(scope, 'tier:1');
  await user.click(screen.getByRole('button', { name: '添加属性' }));
  const second = screen.getByRole('combobox', { name: '核心属性 2' });
  await user.selectOptions(second, within(second).getByRole('option', { name: '物品等级 · 当前 84' }).getAttribute('value')!);
  await user.selectOptions(screen.getByRole('combobox', { name: '核心属性要求：物品等级' }), 'level:84');
  for (const name of ['官网核对联合条件 ↗', '官网按核心属性降序 ↗']) {
    const query = JSON.parse(new URL(screen.getByRole('link', { name }).getAttribute('href')!).searchParams.get('q')!);
    expect(query.query.filters.misc_filters.filters.ilvl).toEqual({ min: 84 });
    expect(query.query.stats.flatMap((group: { filters: { value?: { min?: number } }[] }) => group.filters).some((filter: { value?: { min?: number } }) => filter.value?.min === 24)).toBe(true);
  }
  expect(screen.getByRole('button', { name: '优先降序：物品等级' })).toBeDisabled();
});

it('keeps ordinary belt affixes separate from a same-name unique search until the user selects rare alternatives', async () => {
  const raw = 'Rarity: Unique\nMidnight Braid\nRawhide Belt\n--------\nItem Level: 84\n--------\n+41 to maximum Mana\n50% of Damage taken Recouped as Mana';
  render(<EquipmentTradePanel raw={raw} league="Test" onLeague={vi.fn()} t1Data={patch} t1Trade={trade} />);
  expect(screen.queryByRole('option', { name: '混沌抗性 · 后缀 · 可新增' })).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '腰带检索范围' }), 'rare');
  expect(screen.getByRole('option', { name: '混沌抗性 · 后缀 · 可新增' })).toBeInTheDocument();
  const query = JSON.parse(new URL(screen.getByRole('link', { name: '官网核对联合条件 ↗' }).getAttribute('href')!).searchParams.get('q')!);
  expect(query.query.name).toBeUndefined();
  expect(query.query.filters.type_filters.filters.rarity.option).toBe('nonunique');
  expect(JSON.stringify(query)).not.toContain('Recouped');
});
