import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

// This entry belongs to a personal local workbench. It must describe that product and
// load its own assets, without claiming the upstream public site's identity or hosting.
describe('local workbench entry metadata', () => {
  it('identifies the Simplified Chinese workbench', () => {
    expect(doc.documentElement.lang).toBe('zh-CN');
    expect(doc.title).toContain('PoE2 制作工坊');
    const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    expect(description).toContain('本地');
    expect(description).toContain('繁体装备导入');
    expect(description).toContain('简体词缀检索');
    expect(description).toContain('官方交易搜索');
  });

  it('loads the local React entry and an existing local icon', () => {
    expect(doc.querySelector('script[type="module"]')?.getAttribute('src')).toBe('/src/main.tsx');
    const icon = doc.querySelector('link[rel="icon"]')?.getAttribute('href') ?? '';
    expect(icon).toMatch(/^\/[\w.-]+\.svg$/);
    expect(existsSync(`public${icon}`)).toBe(true);
  });

  it('does not advertise the upstream public site as this local installation', () => {
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull();
    expect(doc.querySelector('meta[property="og:url"]')).toBeNull();
    expect(doc.querySelector('meta[name="twitter:url"]')).toBeNull();
    expect(html).not.toMatch(/https?:\/\/(?:www\.)?poe2htc\.com/i);
  });
});
