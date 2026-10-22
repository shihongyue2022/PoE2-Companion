import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch.ts';
import type { ExistingItem, TargetInput } from '../lib/engineTypes.ts';
import { loadGearTrade } from './market.ts';
import { parseWorkbenchItem } from './itemImport.ts';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing.ts';
import type { FlexibleTradeDocument } from './tradeSearch.ts';
import TradePanel from './TradePanel.tsx';

const data = loadShippedPatch('data/patches/0.5.0');
const tradeData = await loadGearTrade();
const parsed = parseWorkbenchItem(data, BREACH_RING_SAMPLE)!;
const item: ExistingItem = {
  baseId: parsed.baseId!, level: parsed.level!, rarity: parsed.rarity as ExistingItem['rarity'],
  prefixes: parsed.prefixes, suffixes: parsed.suffixes,
};

function show(actualRollsInvalid = false, targets: readonly TargetInput[] = []) {
  return render(<TradePanel data={data} tradeData={tradeData} item={item} targets={targets}
    baseName="Breach Ring" raw={BREACH_RING_SAMPLE} actualRollsInvalid={actualRollsInvalid}
    league="Example League" onLeague={vi.fn()} leagues={[]} leagueError="" />);
}

function query(): FlexibleTradeDocument {
  const href = screen.getByRole('link', { name: /在官方交易网站搜索/ }).getAttribute('href')!;
  return JSON.parse(new URL(href).searchParams.get('q')!) as FlexibleTradeDocument;
}

function statIds(modId: string): readonly string[] {
  return tradeData.rows[tradeData.mods[modId]![0]![0]]!.ids;
}

function gearRow(container: HTMLElement, modId: string): HTMLElement {
  const element = container.querySelector(`[data-mod-id="${modId}"]`);
  expect(element, `${modId} must remain independently editable`).not.toBeNull();
  return element as HTMLElement;
}

const actualValues = [
  ['Rings/FireDamage', 36.5],
  ['Rings/LightningDamage', 34],
  ['Rings/IncreasedMana', 157],
  ['Rings/ItemFoundRarityIncrease', 18],
  ['Rings/AllResistances', 15],
  ['Rings/ColdResistance', 33],
] as const;

describe('editable official trade comparison panel', () => {
  it('starts with at most three meaningful stats, all sellers, and no hidden base or level filter', () => {
    const { container } = show();
    expect(parsed.prefixes).toHaveLength(3);
    expect(parsed.suffixes).toHaveLength(3);
    const selected = container.querySelectorAll('.wb-trade-filter input[type="checkbox"]:checked');
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThanOrEqual(3);
    expect(screen.getByRole('checkbox', { name: '限定当前底座' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '限制物品等级' })).not.toBeChecked();
    const document = query();
    expect(document.query.type).toBeUndefined();
    expect(document.query.filters.misc_filters).toBeUndefined();
    expect(document.query.status.option).toBe('any');
    expect(document.query.filters.type_filters.filters.category?.option).toBe('accessory.ring');
    expect(document.query.filters.type_filters.filters.rarity?.option).toBe('nonunique');
    const link = screen.getByRole('link', { name: /在官方交易网站搜索/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('can require all six real printed rolls without double-applying quality or using tier lows', () => {
    const { container } = show();
    fireEvent.click(screen.getByRole('button', { name: /全部实际属性/ }));
    const filters = query().query.stats.flatMap((group) => group.filters);
    for (const [modId, value] of actualValues) {
      const element = gearRow(container, modId);
      expect(element).toHaveAttribute('data-origin', 'actual');
      expect(within(element).getByRole('checkbox')).toBeChecked();
      expect(within(element).getByRole('spinbutton', { name: / 下限$/ })).toHaveValue(value);
      expect(within(element).getByRole('spinbutton', { name: / 上限$/ })).toHaveValue(null);
      const aliases = statIds(modId);
      const requested = filters.filter((filter) => aliases.includes(filter.id));
      expect(requested.length).toBeGreaterThan(0);
      expect(requested.every((filter) => filter.value?.min === value && filter.value.max === undefined)).toBe(true);
    }
    expect(container.querySelectorAll('.wb-trade-filter input[type="checkbox"]:checked')).toHaveLength(6);
    expect(query().query.type).toBeUndefined();
    expect(query().query.filters.misc_filters).toBeUndefined();
  });

  it('updates official URL bounds immediately and removes an unchecked attribute entirely', () => {
    const { container } = show();
    fireEvent.click(screen.getByRole('button', { name: /全部实际属性/ }));
    const cold = gearRow(container, 'Rings/ColdResistance');
    const original = screen.getByRole('link', { name: /在官方交易网站搜索/ }).getAttribute('href');
    fireEvent.change(within(cold).getByRole('spinbutton', { name: / 下限$/ }), { target: { value: '25.5' } });
    fireEvent.change(within(cold).getByRole('spinbutton', { name: / 上限$/ }), { target: { value: '40' } });
    expect(screen.getByRole('link', { name: /在官方交易网站搜索/ }).getAttribute('href')).not.toBe(original);
    const aliases = statIds('Rings/ColdResistance');
    expect(query().query.stats.flatMap((group) => group.filters).filter((filter) => aliases.includes(filter.id)))
      .toEqual(aliases.map((id) => ({ id, value: { min: 25.5, max: 40 }, disabled: false })));
    fireEvent.click(within(cold).getByRole('checkbox'));
    expect(query().query.stats.flatMap((group) => group.filters).some((filter) => aliases.includes(filter.id))).toBe(false);
    fireEvent.click(within(cold).getByRole('checkbox'));
    expect(within(cold).getByRole('spinbutton', { name: / 下限$/ })).toHaveValue(25.5);
    expect(query().query.stats.flatMap((group) => group.filters).some((filter) => aliases.includes(filter.id))).toBe(true);
  });

  it('only adds base and level restrictions on request and removes both when relaxing a search', () => {
    show();
    fireEvent.click(screen.getByRole('checkbox', { name: '限定当前底座' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '限制物品等级' }));
    expect(query().query.type).toBe('Breach Ring');
    expect(query().query.filters.misc_filters?.filters.ilvl).toEqual({ min: 79 });
    fireEvent.change(screen.getByRole('spinbutton', { name: '交易最低物等' }), { target: { value: '80' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: '交易最高物等' }), { target: { value: '83' } });
    expect(query().query.filters.misc_filters?.filters.ilvl).toEqual({ min: 80, max: 83 });
    fireEvent.change(screen.getByRole('combobox', { name: '卖家状态' }), { target: { value: 'online' } });
    expect(query().query.status.option).toBe('online');
    fireEvent.click(screen.getByRole('button', { name: '放宽数值与底座限制' }));
    expect(query().query.type).toBeUndefined();
    expect(query().query.filters.misc_filters).toBeUndefined();
    expect(screen.getByRole('checkbox', { name: '限定当前底座' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '限制物品等级' })).not.toBeChecked();
  });

  it('withholds the search URL for invalid bounds and restores it after correction', () => {
    const { container } = show();
    fireEvent.click(screen.getByRole('button', { name: /全部实际属性/ }));
    const mana = gearRow(container, 'Rings/IncreasedMana');
    fireEvent.change(within(mana).getByRole('spinbutton', { name: / 上限$/ }), { target: { value: '100' } });
    expect(screen.getByRole('alert')).toHaveTextContent('下限不能大于上限');
    expect(screen.queryByRole('link', { name: /在官方交易网站搜索/ })).not.toBeInTheDocument();
    fireEvent.change(within(mana).getByRole('spinbutton', { name: / 上限$/ }), { target: { value: '200' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /在官方交易网站搜索/ })).toBeInTheDocument();
  });

  it('clears numeric constraints without losing selected properties and can clear all attributes', () => {
    const { container } = show();
    fireEvent.click(screen.getByRole('button', { name: /全部实际属性/ }));
    fireEvent.click(screen.getByRole('button', { name: '只要求属性存在' }));
    expect(container.querySelectorAll('.wb-trade-filter input[type="checkbox"]:checked')).toHaveLength(6);
    expect(query().query.stats.flatMap((group) => group.filters).every((filter) => filter.value === undefined)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '清空属性条件' }));
    expect(query().query.stats.flatMap((group) => group.filters)).toEqual([]);
    expect(query().query.filters.type_filters.filters.category?.option).toBe('accessory.ring');
    expect(container.querySelectorAll('.wb-trade-filter input[type="checkbox"]:checked')).toHaveLength(0);
  });

  it('uses tier fallback and an explicit warning when edited gear invalidates copied rolls', () => {
    const { container } = show(true);
    expect(screen.getByText(/当前装备经过编辑或模拟，原始复制数值不再用于查价/)).toBeVisible();
    for (const [modId] of actualValues) expect(gearRow(container, modId)).toHaveAttribute('data-origin', 'tier');
    expect(container.querySelector('.wb-trade-filter[data-origin="actual"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /全部实际属性/ }));
    expect(within(gearRow(container, 'Rings/IncreasedMana')).getByRole('spinbutton', { name: / 下限$/ })).toHaveValue(150);
    expect(screen.getByRole('link', { name: /在官方交易网站搜索/ })).toBeInTheDocument();
  });
});

describe('similar high-end market search', () => {
  const minimum = (element: HTMLElement) => within(element).getByRole('spinbutton', { name: / 下限$/ });
  const totalResRow = (container: HTMLElement) => {
    const element = container.querySelector('[data-filter-key="pseudo:elemental-resistance"]');
    expect(element).not.toBeNull();
    return element as HTMLElement;
  };
  const selectedKeys = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.wb-trade-filter')]
    .filter((element) => within(element).getByRole<HTMLInputElement>('checkbox').checked)
    .map((element) => element.dataset.filterKey);

  it('raises three core directions to snapshot T1 while keeping quality-adjusted rolls and leaving crafting goals alone', () => {
    const targets: TargetInput[] = [{ modId: 'Rings/IncreasedMana', tierDisplay: 2 }];
    const beforeItem = JSON.stringify(item);
    const beforeTargets = JSON.stringify(targets);
    const { container } = show(false, targets);
    fireEvent.click(screen.getByRole('checkbox', { name: '限定当前底座' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '限制物品等级' }));
    fireEvent.click(screen.getByRole('button', { name: /找同类顶配/ }));
    expect(selectedKeys(container)).toHaveLength(3);
    expect(within(gearRow(container, 'Rings/IncreasedMana')).getByRole('checkbox')).toBeChecked();
    expect(within(gearRow(container, 'Rings/FireDamage')).getByRole('checkbox')).toBeChecked();
    expect(within(totalResRow(container)).getByRole('checkbox')).toBeChecked();
    expect(minimum(gearRow(container, 'Rings/IncreasedMana'))).toHaveValue(165);
    expect(minimum(gearRow(container, 'Rings/FireDamage'))).toHaveValue(36.5);
    expect(minimum(totalResRow(container))).toHaveValue(86);
    expect(screen.getByRole('combobox', { name: '顶配数值档位' })).toHaveValue('t1');
    expect(screen.getByRole('checkbox', { name: '所选属性不低于当前装备' })).toBeChecked();
    expect(query().query.type).toBeUndefined();
    expect(query().query.filters.misc_filters).toBeUndefined();
    expect(query().query.stats.flatMap((group) => group.filters)).toContainEqual({
      id: 'pseudo.pseudo_total_elemental_resistance', value: { min: 86 }, disabled: false,
    });
    expect(screen.getByText(new RegExp(`规则快照\\s*${data.patch.replace(/\./g, '\\.')}`))).toBeVisible();
    expect(screen.getByRole('button', { name: /对照当前装备/ })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.stringify(item)).toBe(beforeItem);
    expect(JSON.stringify(targets)).toBe(beforeTargets);
  });

  it('reapplies T2, high-roll and perfect references and can turn off the current-item lower bound', () => {
    const { container } = show();
    fireEvent.click(screen.getByRole('button', { name: /找同类顶配/ }));
    const grade = screen.getByRole('combobox', { name: '顶配数值档位' });
    const keep = screen.getByRole('checkbox', { name: '所选属性不低于当前装备' });
    fireEvent.click(keep);
    expect(minimum(gearRow(container, 'Rings/FireDamage'))).toHaveValue(31);
    expect(minimum(gearRow(container, 'Rings/IncreasedMana'))).toHaveValue(165);
    fireEvent.change(grade, { target: { value: 't2' } });
    expect(minimum(gearRow(container, 'Rings/IncreasedMana'))).toHaveValue(150);
    fireEvent.click(keep);
    expect(minimum(gearRow(container, 'Rings/IncreasedMana'))).toHaveValue(157);
    fireEvent.change(grade, { target: { value: 'high' } });
    expect(minimum(gearRow(container, 'Rings/IncreasedMana'))).toHaveValue(176.2);
    fireEvent.change(grade, { target: { value: 'perfect' } });
    expect(minimum(gearRow(container, 'Rings/IncreasedMana'))).toHaveValue(179);
    expect(query().query.filters.misc_filters).toBeUndefined();
  });

  it('preserves a manually chosen subset when changing grade and the current-item lower bound', () => {
    const { container } = show();
    fireEvent.click(screen.getByRole('button', { name: /找同类顶配/ }));
    fireEvent.click(within(gearRow(container, 'Rings/IncreasedMana')).getByRole('checkbox'));
    fireEvent.click(within(gearRow(container, 'Rings/ColdResistance')).getByRole('checkbox'));
    const selected = selectedKeys(container);
    expect(selected).toHaveLength(3);
    expect(within(gearRow(container, 'Rings/IncreasedMana')).getByRole('checkbox')).not.toBeChecked();
    fireEvent.change(screen.getByRole('combobox', { name: '顶配数值档位' }), { target: { value: 'high' } });
    expect(selectedKeys(container)).toEqual(selected);
    fireEvent.click(screen.getByRole('checkbox', { name: '所选属性不低于当前装备' }));
    expect(selectedKeys(container)).toEqual(selected);
    expect(within(gearRow(container, 'Rings/ColdResistance')).getByRole('checkbox')).toBeChecked();
    expect(within(gearRow(container, 'Rings/IncreasedMana')).getByRole('checkbox')).not.toBeChecked();
  });

  it('can retain all original affix directions, warns on ambiguous rarity, and restores a nonduplicated core', () => {
    const { container } = show();
    fireEvent.click(screen.getByRole('button', { name: /找同类顶配/ }));
    fireEvent.click(screen.getByRole('button', { name: '保留全部词缀方向' }));
    expect(selectedKeys(container)).toHaveLength(6);
    for (const [modId] of actualValues) expect(within(gearRow(container, modId)).getByRole('checkbox')).toBeChecked();
    expect(within(totalResRow(container)).getByRole('checkbox')).not.toBeChecked();
    expect(minimum(gearRow(container, 'Rings/IncreasedMana'))).toHaveValue(165);
    const rarity = gearRow(container, 'Rings/ItemFoundRarityIncrease');
    expect(minimum(rarity)).toHaveValue(null);
    expect(rarity.querySelector('.wb-trade-filter-warning')).not.toBeNull();
    const ids = statIds('Rings/ItemFoundRarityIncrease');
    expect(query().query.stats.flatMap((group) => group.filters).filter((filter) => ids.includes(filter.id))
      .every((filter) => filter.value === undefined)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '恢复核心方向' }));
    expect(selectedKeys(container)).toHaveLength(3);
    expect(within(totalResRow(container)).getByRole('checkbox')).toBeChecked();
    expect(within(gearRow(container, 'Rings/AllResistances')).getByRole('checkbox')).not.toBeChecked();
    expect(within(gearRow(container, 'Rings/ColdResistance')).getByRole('checkbox')).not.toBeChecked();
  });
});
