"""Export GGG gem art from pinned PoB/EE2 data, without executing Lua.

Requires Pillow and zstandard. Run from the repository root. The public EE2
items.ndjson snapshot must be downloaded to artifacts/workbench/ee2-items.ndjson.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import urllib.request

from PIL import Image
import zstandard

ROOT = Path(__file__).resolve().parents[2]
POB = ROOT / '.local-tools/pob2-v0.23.1/Data/Skills'
OUT = ROOT / 'public/images/skills'
OUT.mkdir(parents=True, exist_ok=True)
assets = (POB / 'SkillAssets.lua').read_text(encoding='utf8')
coords = {}
for file, body in re.findall(r'\["(gem-icons_[^"]+)"\]=\{(.*?)\n\t\t\}', assets, re.S):
    raw = zstandard.ZstdDecompressor().decompress((POB / file).read_bytes())
    height, width = struct.unpack_from('<II', raw, 12)
    mips = struct.unpack_from('<I', raw, 28)[0]
    fmt, _, _, count, _ = struct.unpack_from('<5I', raw, 128)
    assert fmt in (71, 28), (file, fmt)
    stride = sum(max(1, width >> level) * max(1, height >> level) * 4 if fmt == 28
                 else max(1, ((width >> level) + 3) // 4) * max(1, ((height >> level) + 3) // 4) * 8 for level in range(mips))
    assert len(raw) == 148 + stride * count
    for path, index in re.findall(r'\["([^"]+)"\]=(\d+)', body):
        index = int(index)
        header = bytearray(raw[:148])
        struct.pack_into('<I', header, 140, 1)
        image = Image.open(io.BytesIO(header + raw[148 + stride * (index - 1):148 + stride * index]))
        coords[path] = image.copy()

names = {}
for file in ['act_str.lua', 'act_dex.lua', 'act_int.lua', 'other.lua']:
    text = (POB / file).read_text(encoding='utf8')
    for body in re.split(r'\nskills\[', text)[1:]:
        name = re.search(r'\n\tname = "([^"]+)"', body)
        icon = re.search(r'\n\ticon = "([^"]+)"', body)
        if name and icon and icon[1] in coords:
            names.setdefault(name[1], (icon[1], coords[icon[1]]))

icons = {}
for name, (path, image) in names.items():
    filename = hashlib.sha256(path.encode()).hexdigest()[:16] + '.png'
    image.save(OUT / filename, optimize=True)
    icons[name] = {'url': '/images/skills/' + filename, 'originalPath': path,
                   'sha256': hashlib.sha256((OUT / filename).read_bytes()).hexdigest()}

rows = [json.loads(line) for line in (ROOT / 'artifacts/workbench/ee2-items.ndjson').read_text(encoding='utf8').splitlines()]
gems = [row for row in rows if row.get('namespace') == 'GEM' and row.get('refName') not in icons
        and row.get('icon', '').startswith('https://web.poecdn.com/')]

def download(url):
    content = urllib.request.urlopen(url, timeout=30).read()
    assert content.startswith(b'\x89PNG\r\n\x1a\n')
    filename = hashlib.sha256(content).hexdigest()[:16] + '.png'
    (OUT / filename).write_bytes(content)
    return {'url': '/images/skills/' + filename, 'originalUrl': url, 'sha256': hashlib.sha256(content).hexdigest()}

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = dict(zip(sorted({row['icon'] for row in gems}), pool.map(download, sorted({row['icon'] for row in gems}))))
for row in gems:
    icons[row['refName']] = results[row['icon']]
manifest = {'copyright': 'Skill and gem artwork (c) Grinding Gear Games', 'pobTag': 'v0.23.1',
            'pobSource': 'https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/tree/v0.23.1/src/Data/Skills',
            'ee2Commit': '572c1925e4737d2c5f79143d03280df9660c1d8f',
            'ee2Source': 'https://github.com/Kvan7/Exiled-Exchange-2/blob/572c1925e4737d2c5f79143d03280df9660c1d8f/renderer/public/data/en/items.ndjson',
            'icons': dict(sorted(icons.items()))}
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
index = {'icons': {name: {'url': icon['url']} for name, icon in manifest['icons'].items()}}
(ROOT / 'src/workbench/data/skill-icons.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
print(f'Exported {len(icons)} exact English-name matches; {len(list(OUT.glob("*.png")))} local artwork assets.')
