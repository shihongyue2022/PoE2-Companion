import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocalPobImport from './LocalPobImport';

afterEach(() => vi.unstubAllGlobals());
describe('local PoB2 import actions', () => {
  it('waits for user action, lists saved characters and reads only the selected ID for preview', async () => {
    const network = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, installed: true, builds: [{ id: 'test', name: 'Current.xml', modifiedAt: '2026-10-22T10:00:00Z', size: 10 }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, xml: '<PathOfBuilding2/>' })));
    vi.stubGlobal('fetch', network);
    const onRead = vi.fn(async () => {}), user = userEvent.setup();
    render(<LocalPobImport onRead={onRead} />);
    expect(network).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '刷新已保存角色' }));
    expect(await screen.findByRole('combobox', { name: '本机 PoB2 角色' })).toHaveValue('test');
    expect(onRead).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '读取角色并预览' }));
    expect(onRead).toHaveBeenCalledWith('<PathOfBuilding2/>');
    expect(JSON.parse(network.mock.calls[1]![1]!.body as string)).toEqual({ id: 'test' });
  });
  it('shows missing characters and launch failures instead of importing an empty set', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, installed: true, builds: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: { message: '请先配置 PoB2' } }), { status: 404 })));
    const onRead = vi.fn(async () => {}), user = userEvent.setup();
    render(<LocalPobImport onRead={onRead} />);
    await user.click(screen.getByRole('button', { name: '刷新已保存角色' }));
    expect(await screen.findByText(/没有已保存角色/)).toBeVisible();
    expect(screen.queryByRole('button', { name: '读取角色并预览' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '打开 PoB2' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请先配置 PoB2');
    expect(onRead).not.toHaveBeenCalled();
  });
});
