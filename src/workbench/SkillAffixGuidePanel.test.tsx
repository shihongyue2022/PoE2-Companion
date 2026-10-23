import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import CharacterAnalysisPanel from './CharacterAnalysisPanel';
import EquipmentTradePanel from './EquipmentTradePanel';
import { twisterGuideState } from './fixtures/skillAffixGuide';
import { resolveSkillAffixSearch, type SkillAffixSearch } from './skillAffixGuide';
import type { LoadoutState } from './loadout';

const data = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade();

it('opens a gem inspector without changing main output, then transfers the chosen affix and tier to equipment search', async () => {
  const state = twisterGuideState(), before = JSON.stringify(state), save = vi.fn((_state: LoadoutState) => true), search = vi.fn<(request: SkillAffixSearch) => void>(), user = userEvent.setup();
  const view = render(<CharacterAnalysisPanel state={state} onSave={save} onSelectSlot={vi.fn()} recommendationData={data} recommendationTrade={trade} onSkillSearch={search} />);
  await user.click(screen.getByText('技能与构成 · 旋风'));
  await user.click(within(screen.getByRole('region', { name: '主技能与辅助宝石' })).getByRole('button', { name: '查看旋风增伤词缀' }));
  const guide = screen.getByRole('region', { name: '技能增伤与装备检索' });
  expect(guide).toHaveTextContent('投射物速度的增加／减少');
  expect(save).not.toHaveBeenCalled();
  expect(JSON.stringify(state)).toBe(before);
  await user.selectOptions(within(guide).getByRole('combobox', { name: '筛选技能增伤方向' }), 'projectileSpeed');
  const card = guide.querySelector('article')!;
  expect(card).toHaveTextContent('可出现：');
  const tier = within(card).getByRole('combobox', { name: /检索档位：/ });
  await user.selectOptions(tier, 'tier:1');
  await user.click(within(card).getByRole('button', { name: '检索这条词缀' }));
  expect(save).toHaveBeenCalledTimes(1); expect(search).toHaveBeenCalledTimes(1);
  const request = search.mock.calls[0]![0];
  expect(request.preset).toBe('tier:1');
  expect(save.mock.calls[0]![0].goals.mainSkill).toEqual(request.selection);
  expect(save.mock.calls[0]![0].slots).toEqual(state.slots);
  const target = resolveSkillAffixSearch(state, request, data, trade)!;
  view.unmount();
  render(<EquipmentTradePanel raw={target.raw} league="Test" onLeague={vi.fn()} t1Data={data} t1Trade={trade} skillSearch={request} />);
  expect(screen.getByRole('combobox', { name: '核心属性 1' })).toHaveTextContent('投射物');
  expect(screen.getByRole('combobox', { name: /核心属性要求：/ })).toHaveValue('tier:1');
  const query = JSON.parse(new URL(screen.getByRole('link', { name: '官网核对联合条件 ↗' }).getAttribute('href')!).searchParams.get('q')!);
  expect(query.query.name).toBeUndefined();
  expect(query.query.filters.type_filters.filters.rarity.option).toBe('nonunique');
  expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
});

it('opens support-specific evidence and blocks an inactive skill instead of reusing another skill damage', async () => {
  const state = twisterGuideState(), user = userEvent.setup();
  render(<CharacterAnalysisPanel state={state} onSave={() => true} onSelectSlot={vi.fn()} recommendationData={data} recommendationTrade={trade} />);
  await user.click(screen.getByText('技能与构成 · 旋风'));
  const main = screen.getByRole('region', { name: '主技能与辅助宝石' });
  await user.click(within(main).getByRole('button', { name: '查看投射物加速 III辅助机制' }));
  expect(within(screen.getByRole('region', { name: '技能增伤与装备检索' })).getByRole('link', { name: /投射物加速.*原文/ })).toHaveAttribute('href', 'https://poe2db.tw/us/Projectile_Acceleration_III');
  await user.click(screen.getByText(/全部技能配置/));
  const inactive = screen.getAllByRole('button', { name: '查看旋风增伤词缀' }).find((button) => button.classList.contains('inactive'))!;
  await user.click(inactive);
  expect(screen.getByRole('region', { name: '技能增伤与装备检索' })).toHaveTextContent('此技能未启用');
});
