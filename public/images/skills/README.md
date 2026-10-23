Skill and gem artwork © Grinding Gear Games. These game assets retain their
original ownership; the repository code license does not relicense the artwork.

Skill icons are exported from the image arrays distributed with Path of Building
Community PoE2 v0.23.1 (`Data/Skills/SkillAssets.lua` and its DDS arrays).
Gem item pictures are downloaded from the exact GGG `web.poecdn.com` URLs in
Exiled Exchange 2 commit `572c1925e4737d2c5f79143d03280df9660c1d8f`.

`manifest.json` records exact English names, original asset
paths or CDN URLs, pinned sources and SHA-256 hashes. No approximate name matching
or generated picture substitutions are used. Assets are served locally so using
the skill buttons does not require a third-party image request.
`src/workbench/data/skill-icons.json` contains only the runtime name-to-URL index.

Regenerate with `python tools/refresh/skill_icons.py` (Pillow, zstandard required).
See the script docstring for input locations.
