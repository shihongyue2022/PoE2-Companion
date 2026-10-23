import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AffixReferencePanel from './AffixReferencePanel';
import { parseEquipment } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { mergeReferenceRows } from './affixReference';

afterEach(() => vi.unstubAllGlobals());
it('keeps optional English reference lookup separate from the compact search and never fabricates actual rolls', async () => {
  const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, name: 'Igniferis', url: 'https://poe2db.tw/us/Igniferis', checkedAt: new Date().toISOString(), cached: false,
    modifiers: [{ english: '+(10—20)% to Fire Resistance', origin: 'explicit' }, { english: '(20—30)% increased Mana Regeneration Rate', origin: 'explicit' }] })));
  vi.stubGlobal('fetch', network);
  const raw = '物品種類: 項鍊\n稀有度: 傳奇\n烈焰之擊\n赤紅項鍊\n--------\n+17%火焰抗性';
  const equipment = parseEquipment(raw)!, onReference = vi.fn();
  render(<AffixReferencePanel equipment={equipment} onReference={onReference} />);
  expect(network).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText('词缀资料 · 已识别 1/1'));
  await waitFor(() => expect(screen.getByText(/已读取 2 条英文资料/)).toBeVisible());
  expect(JSON.parse(network.mock.calls[0]![1]!.body as string)).toEqual({ name: 'Igniferis' });
  const merged = mergeReferenceRows(equipmentTradeRows(equipment, 'strict'), onReference.mock.calls[0]![0]);
  const extra = merged.find((row) => row.referenceOnly)!;
  expect(extra.enabled).toBe(false); expect(extra.actualValue).toBeUndefined();
  const query = buildEquipmentTrade({ equipment, league: 'Test', rows: merged.map((row) => row.referenceOnly ? { ...row, enabled: true } : row) }).query;
  expect(query.query.name).toBe('Igniferis');
  expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
  expect(query.query.stats.flatMap((group) => group.filters).some((entry) => entry.value?.min === 20)).toBe(false);
  expect(equipment.raw).toBe(raw);
});
