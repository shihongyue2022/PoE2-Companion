import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
describe('hosted workbench boundaries', () => {
  it('resolves public art under the deployment prefix without changing external URLs', async () => {
    vi.stubEnv('BASE_URL', '/apps/poe2-companion/');
    const { publicAssetUrl } = await import('./workbenchRuntime');
    expect(publicAssetUrl('/images/skills/test.png')).toBe('/apps/poe2-companion/images/skills/test.png');
    expect(publicAssetUrl('https://web.poecdn.com/item.png')).toBe('https://web.poecdn.com/item.png');
  });
  it('does not probe desktop APIs or subscribe to clipboard events in hosted builds', async () => {
    vi.stubEnv('VITE_WORKBENCH_HOSTED', '1');
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    const events = vi.fn(); vi.stubGlobal('EventSource', events);
    const { loadCompanionView, subscribeCompanion, publishCompanion } = await import('./companion');
    expect(await loadCompanionView('?equipment=test', new AbortController().signal)).toBeNull();
    subscribeCompanion(vi.fn())();
    await publishCompanion('test', { status: 'ready', message: 'test' });
    const { requireLocalService } = await import('./workbenchRuntime');
    expect(requireLocalService).toThrow('浏览器版');
    expect(network).not.toHaveBeenCalled(); expect(events).not.toHaveBeenCalled();
  });
  it('retains local services for ordinary builds', async () => {
    vi.stubEnv('VITE_WORKBENCH_HOSTED', '');
    const { HOSTED_WORKBENCH, requireLocalService } = await import('./workbenchRuntime');
    expect(HOSTED_WORKBENCH).toBe(false); expect(requireLocalService).not.toThrow();
  });
});
