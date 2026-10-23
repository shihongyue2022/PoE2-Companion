import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { historyBridge } from './officialHistory';
import { emptyFinance, readFinance, type FinanceState } from './finance';
import TradeTracker from './TradeTracker';

vi.mock('./officialHistory', async (original) => ({ ...await original<typeof import('./officialHistory')>(), historyBridge: vi.fn() }));
const bridge = vi.mocked(historyBridge);
const at = Math.floor((Date.now() - 60000) / 1000);
const result = { payload: { endpoint: 'trade2/history', league: 'Test', fetchedAt: new Date().toISOString(), entries: [
  { id: 'sale', time: at, price: { amount: 12, currency: 'divine' }, item: { name: 'Official Ring' } },
  { id: 'buy', direction: 'buy', time: at, price: { amount: 4, currency: 'divine' }, item: { name: 'Official Boots' } },
] } };
function Harness({ saveOk = true }: { saveOk?: boolean }) {
  const [state, setState] = useState(emptyFinance());
  return <TradeTracker league="Test" state={state} save={(next) => { if (saveOk) setState(readFinance(JSON.stringify(next))); return saveOk; }} onError={vi.fn()} onManual={vi.fn()} />;
}
afterEach(() => { vi.unstubAllGlobals(); bridge.mockReset(); });
function setup(sync: (action: string) => Promise<Record<string, unknown>>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ found: true, events: [] }))));
  bridge.mockImplementation((action) => action === 'ping' ? Promise.resolve({ ready: true, version: '1.1.0' }) : sync(action));
}
it('resumes once on returning from login, updates all totals immediately and reveals the imported currency', async () => {
  let reads = 0;
  setup(() => Promise.resolve(++reads === 1 ? { needsLogin: true, error: '请登录后返回' } : result));
  render(<Harness />); const user = userEvent.setup();
  await screen.findByText('同步桥已连接 · 尚未读取成交');
  await user.click(screen.getByRole('button', { name: '同步官方成交' }));
  await screen.findByText('等待官网登录');
  fireEvent.focus(window); fireEvent.focus(window);
  await screen.findByText(/已同步 2 笔新成交/);
  expect(reads).toBe(2);
  expect(screen.getByLabelText('交易统计通货')).toHaveValue('divine');
  const totals = screen.getByRole('region', { name: '交易追踪器' }).querySelectorAll('.tt-card strong');
  expect([...totals].map((node) => node.textContent)).toEqual(['12', '4', '8']);
  expect(screen.getByRole('button', { name: /神圣石 · 2 笔 · 已记收入 12 · 已记支出 4 · 账本差额 8/ })).toBeVisible();
  expect(screen.getByText('Official Ring')).toBeVisible();
});
it('shows invalid timestamp counts and does not present parsing failure as successful zero-income synchronization', async () => {
  setup(() => Promise.resolve({ payload: { ...result.payload, entries: [{ ...result.payload.entries[0], time: 'bad-date' }] } }));
  render(<Harness />); await screen.findByText('同步桥已连接 · 尚未读取成交');
  await userEvent.click(screen.getByRole('button', { name: '同步官方成交' }));
  await screen.findByText(/未入账原因：时间无效 1 条/);
  expect(screen.getByText(/跳过 1 条（原因见下方）/)).toBeVisible();
  expect(screen.queryByText('Official Ring')).not.toBeInTheDocument();
});
it('does not announce success when ledger persistence fails', async () => {
  setup(() => Promise.resolve(result)); render(<Harness saveOk={false} />);
  await screen.findByText('同步桥已连接 · 尚未读取成交');
  await userEvent.click(screen.getByRole('button', { name: '同步官方成交' }));
  await screen.findByText(/本地账本未保存/);
  expect(screen.queryByText(/账本与收支汇总已刷新/)).not.toBeInTheDocument();
});
it('initially selects a populated currency from a saved ledger', async () => {
  setup(() => Promise.resolve(result));
  const state: FinanceState = { ...emptyFinance(), sessions: [{ id: 's', league: 'Test', startedAt: new Date(at * 1000).toISOString() }],
    entries: [{ id: 'e', sessionId: 's', at: new Date(at * 1000).toISOString(), label: 'Saved Sale', amount: 9, currency: 'divine', kind: 'sale', confirmed: true }] };
  render(<TradeTracker league="Test" state={state} save={vi.fn()} onError={vi.fn()} onManual={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('交易统计通货')).toHaveValue('divine'));
  expect(screen.getByRole('region', { name: '交易追踪器' }).querySelector('.tt-card strong')).toHaveTextContent('9');
});
