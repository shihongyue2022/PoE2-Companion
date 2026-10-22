import { describe, expect, it, vi } from 'vitest';
import { createAffixReferenceService, parseEnglishAffixPage } from './affixReference';

const html = `<div class="newItemPopup UniquePopup"><div class="itemName"><span>The Taming</span></div><div class="Stats">
<div class="implicitMod"><span>+(7<span>—</span>10)</span>% to all <a href="Resistances">Elemental Resistances</a></div>
<div class="explicitMod">(10—20)% increased Damage for each type of Elemental Ailment on Enemy</div>
<div class="explicitMod">Wind Skills which can be boosted by Elemental Ground Surfaces count<br/>as being boosted by Ignited, Shocked, and Chilled Ground</div>
</div></div><script>not an affix</script><div class="explicitMod">unrelated historical text</div>`;
const reply = () => new Response(html, { headers: { 'Content-Type': 'text/html' } });

describe('native English affix reference service', () => {
  it('reads only the named item popup, keeps range and wrapped lines, and discards HTML', () => {
    const rows = parseEnglishAffixPage(html, 'The Taming');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ english: '+(7—10)% to all Elemental Resistances', origin: 'implicit' });
    expect(rows[2]!.english).toContain('count\nas being boosted');
    expect(JSON.stringify(rows)).not.toMatch(/script|<a|historical/);
    expect(() => parseEnglishAffixPage(html, 'The Ordained')).toThrow('名称');
    expect(() => parseEnglishAffixPage('<html>Challenge</html>', 'The Taming')).toThrow('未找到');
  });
  it('requests the allowlisted English page only, caches and deduplicates without credentials', async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async () => reply());
    const lookup = createAffixReferenceService({ fetch: network });
    const results = await Promise.all([lookup({ name: 'The Taming' }), lookup({ name: 'The Taming' })]);
    expect(results[0]!.name).toBe('The Taming'); expect(network).toHaveBeenCalledTimes(1);
    expect((await lookup({ name: 'The Taming' })).cached).toBe(true);
    expect(network.mock.calls[0]![0]).toBe('https://poe2db.tw/us/The_Taming');
    expect(network.mock.calls[0]![1]).toMatchObject({ redirect: 'error', headers: { Accept: 'text/html' } });
    expect(network.mock.calls[0]![1]).not.toHaveProperty('credentials');
    for (const name of ['元素之章', 'https://example.com', '../The_Taming', 'Unverified unknown item']) await expect(lookup({ name })).rejects.toThrow('英文');
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('rejects errors, wrong content and oversized responses without making up item modifiers', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('x'.repeat(2_000_001), { headers: { 'Content-Type': 'text/html' } }));
    const lookup = createAffixReferenceService({ fetch: network });
    await expect(lookup({ name: 'The Taming' })).rejects.toThrow('403');
    await expect(lookup({ name: 'The Taming' })).rejects.toThrow('格式');
    await expect(lookup({ name: 'The Taming' })).rejects.toThrow('大小');
  });
});
