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
  it('launches PoB2 only on click and explains the game import/save step', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal('fetch', network);
    const onRead = vi.fn(() => Promise.resolve()), user = userEvent.setup();
    render(<LocalPobImport onRead={onRead} currentFile="Current.xml" />);
    expect(screen.getByRole('button', { name: '打开 PoB2' })).toBeVisible();
    expect(network).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '打开 PoB2' }));
    expect(network).toHaveBeenCalledWith('/api/workbench/pob/launch', expect.objectContaining({ method: 'POST', body: '{}' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Ctrl+S');
    expect(onRead).not.toHaveBeenCalled();
  });
  it('refreshes and previews the current file rather than the most recently saved other build', async () => {
    const modifiedAt = '2026-10-23T10:00:00Z';
    const network = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, installed: true, builds: [
        { id: 'other', name: 'Other.xml', modifiedAt: '2026-10-23T11:00:00Z' }, { id: 'current', name: 'Current.xml', modifiedAt },
      ] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, xml: '<PathOfBuilding2/>', name: 'Current.xml', modifiedAt })));
    vi.stubGlobal('fetch', network);
    const onRead = vi.fn(() => Promise.resolve()), user = userEvent.setup();
    render(<LocalPobImport onRead={onRead} currentFile="Current.xml" savedAt={modifiedAt} />);
    await user.click(screen.getByRole('button', { name: '保存后重新读取' }));
    expect(network.mock.calls[0]![0]).toBe('/api/workbench/pob/builds');
    expect(JSON.parse(network.mock.calls[1]![1]!.body as string)).toEqual({ id: 'current' });
    expect(onRead).toHaveBeenCalledWith('<PathOfBuilding2/>', { name: 'Current.xml', modifiedAt });
    expect(await screen.findByRole('status')).toHaveTextContent('文件保存时间未变化');
  });
  it('requires an explicit choice when the current file is missing or duplicated instead of silently changing characters', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, installed: true, builds: [
      { id: 'a', name: 'First/Current.xml' }, { id: 'b', name: 'Second/Current.xml' },
    ] })));
    vi.stubGlobal('fetch', network);
    const onRead = vi.fn(() => Promise.resolve()), user = userEvent.setup();
    render(<LocalPobImport onRead={onRead} currentFile="Current.xml" />);
    await user.click(screen.getByRole('button', { name: '保存后重新读取' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('没有唯一匹配');
    expect(screen.getByRole('combobox', { name: '本机 PoB2 角色' })).toHaveValue('');
    expect(network).toHaveBeenCalledTimes(1); expect(onRead).not.toHaveBeenCalled();
  });
});
