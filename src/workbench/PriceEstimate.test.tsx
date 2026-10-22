import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PriceEstimate } from './PriceEstimate';
import { buildFlexibleTrade } from './tradeSearch';

const query = buildFlexibleTrade({ league: 'Test', baseId: 'Rings', rows: [] }).query;
const url = 'https://www.pathofexile.com/trade2/search/poe2/Test?q=example';
const sample = {
  ok: true, total: 100, fetched: 3, priced: 3, duplicateSellers: 0,
  groups: [{ currency: 'divine', count: 3, min: 10, max: 30, median: 20, p25: 15, p75: 25 }],
  sampledAt: '2026-10-22T00:00:00Z', cached: false, url, warnings: ['这是低价样本。'],
};

afterEach(() => vi.restoreAllMocks());

describe('local listing estimate UI', () => {
  it('requests only on demand by default and shows labeled, same-currency sample intervals', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(sample)));
    const callback = vi.fn();
    render(<PriceEstimate query={query} url={url} league="Test" onEstimate={callback} />);
    expect(network).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '获取挂牌估价' }));
    expect(await screen.findByText('15–25 神圣石')).toBeInTheDocument();
    expect(screen.getByText(/低价样本中间 50% 区间/)).toBeInTheDocument();
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready', message: '低价样本参考 15–25 神圣石' }));
  });

  it('automatically queries once per stable clipboard query and reports anonymous denial honestly', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ok: false, error: { kind: 'login', message: '官方交易拒绝了匿名请求，请在官网查看挂单。' }, url,
    }), { status: 502 }));
    const callback = vi.fn();
    const view = render(<PriceEstimate query={query} url={url} league="Test" auto onEstimate={callback} />);
    await waitFor(() => expect(callback).toHaveBeenCalled(), { timeout: 2000 });
    view.rerender(<PriceEstimate query={{ ...query }} url={url} league="Test" auto onEstimate={vi.fn()} />);
    expect(network).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('拒绝了匿名请求');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', url }));
    expect(screen.getByRole('link', { name: /在官方交易网站核对挂单/ })).toHaveAttribute('href', url);
  });

  it('clears old results when the user changes query conditions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(sample)));
    const view = render(<PriceEstimate query={query} url={url} league="Test" />);
    fireEvent.click(screen.getByRole('button', { name: '获取挂牌估价' }));
    await screen.findByText('15–25 神圣石');
    const other = buildFlexibleTrade({ league: 'Test', baseId: 'Amulets', rows: [] }).query;
    view.rerender(<PriceEstimate query={other} url={url} league="Test" />);
    expect(screen.queryByText('15–25 神圣石')).not.toBeInTheDocument();
  });

  it('aborts an old item request and discards its late response before estimating a replacement', async () => {
    let respond: ((response: Response) => void) | undefined;
    const network = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { respond = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify(sample)));
    const callback = vi.fn();
    const view = render(<PriceEstimate query={query} url={url} league="Test" onEstimate={callback} />);
    fireEvent.click(screen.getByRole('button', { name: '获取挂牌估价' }));
    const signal = network.mock.calls[0]?.[1]?.signal;
    const other = buildFlexibleTrade({ league: 'Test', baseId: 'Amulets', rows: [] }).query;
    view.rerender(<PriceEstimate query={other} url={url} league="Test" onEstimate={callback} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      respond?.(new Response(JSON.stringify(sample)));
      await Promise.resolve();
    });
    expect(callback).not.toHaveBeenCalled();
    expect(screen.queryByText('15–25 神圣石')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '获取挂牌估价' }));
    expect(await screen.findByText('15–25 神圣石')).toBeInTheDocument();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
