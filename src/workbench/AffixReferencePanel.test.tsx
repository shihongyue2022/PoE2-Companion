import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EquipmentTradePanel from './EquipmentTradePanel';

afterEach(() => vi.unstubAllGlobals());
it('unifies missing affix research and exposes only opt-in verified official conditions in English', async () => {
  const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, name: 'Igniferis', url: 'https://poe2db.tw/us/Igniferis', checkedAt: new Date().toISOString(), cached: false,
    modifiers: [{ english: '+(10—20)% to Fire Resistance', origin: 'explicit' }, { english: '(20—30)% increased Mana Regeneration Rate', origin: 'explicit' }] })));
  vi.stubGlobal('fetch', network);
  const user = userEvent.setup();
  const raw = '物品種類: 項鍊\n稀有度: 傳奇\n烈焰之擊\n赤紅項鍊\n--------\n+17%火焰抗性';
  render(<EquipmentTradePanel raw={raw} league="Test" onLeague={() => {}} />);
  expect(network).not.toHaveBeenCalled();
  await user.click(screen.getByText('词缀资料 · 已识别 1/1'));
  await waitFor(() => expect(screen.getByText(/已读取 2 条英文资料/)).toBeVisible());
  expect(JSON.parse(network.mock.calls[0]![1]!.body as string)).toEqual({ name: 'Igniferis' });
  const checkbox = screen.getByRole('checkbox', { name: /搜索属性：.*魔力/ });
  expect(checkbox).not.toBeChecked();
  await user.click(screen.getByText(/^调整搜索条件/));
  await user.click(checkbox);
  const query = JSON.parse(new URL(screen.getByRole('link', { name: '打开官方交易搜索' }).getAttribute('href')!).searchParams.get('q')!);
  expect(query.query.name).toBe('Igniferis');
  expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
  expect(new Set(query.query.stats.flatMap((group: { filters: { id: string }[] }) => group.filters).map((entry: { id: string }) => entry.id.split('.').pop())).size).toBe(2);
  expect(query.query.stats[0].filters.some((entry: { value?: { min?: number } }) => entry.value?.min === 20)).toBe(false);
  expect(screen.queryByText('未加入交易条件的文字')).toBeNull();
});
