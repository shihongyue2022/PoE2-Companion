import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TradeTracker from './TradeTracker';
import { emptyFinance } from './finance';
import type { TradeCandidate } from './tradeTracking';

afterEach(() => vi.unstubAllGlobals());
const trade: TradeCandidate = { id: 'log-test', at: new Date(Date.now() - 60000).toISOString(), item: 'Fixture Ring', player: 'Trader', amount: 3, currency: 'divine', currencyText: 'divine', quantity: 1, kind: 'sale', league: 'Test', source: 'log' };
function Harness({ active = true }: { active?: boolean }) {
  const [state, setState] = useState(emptyFinance());
  return <TradeTracker state={state} active={active} league="Test" save={(next) => { setState(next); return true; }} onError={vi.fn()} onManual={vi.fn()} />;
}
it('scans history automatically on first entry and exposes confirmed records hidden by the selected currency', async () => {
  const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ found: true, events: [trade], truncated: false })));
  vi.stubGlobal('fetch', network);
  const user = userEvent.setup(), view = render(<Harness active={false} />);
  expect(network).not.toHaveBeenCalled(); view.rerender(<Harness active />);
  await screen.findByText(trade.item, { exact: true });
  expect(network.mock.calls[0]![0]).toBe('/api/workbench/trade-log?history=1');
  const tracker = screen.getByRole('region', { name: '交易追踪器' });
  expect(tracker.querySelectorAll('.tt-card strong')[0]).toHaveTextContent('0');
  await user.click(screen.getByRole('button', { name: '确认成交' }));
  expect(screen.getByText(/本联盟已有 1 笔确认记录/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: /神圣石 · 1 笔/ }));
  await waitFor(() => expect(tracker.querySelectorAll('.tt-card strong')[0]).toHaveTextContent('3'));
  expect(screen.getByRole('link', { name: /打开官方成交历史/ })).toHaveAttribute('href', 'https://www.pathofexile.com/trade2/history');
});
it('updates pending acceptance after a second poll but still requires actual confirmation', async () => {
  const network = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ found: true, events: [trade], truncated: false })))
    .mockResolvedValue(new Response(JSON.stringify({ found: true, events: [{ ...trade, acceptedAt: new Date().toISOString() }], truncated: false })));
  vi.stubGlobal('fetch', network); const user = userEvent.setup(); render(<Harness />);
  await screen.findByText(trade.item, { exact: true });
  await user.click(screen.getByRole('button', { name: '读取最近 30 天日志' }));
  await screen.findByText('日志出现接受交易提示，仍需核对实际交付。');
  expect(screen.getByRole('button', { name: '确认成交' })).toBeVisible();
});
