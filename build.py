#!/usr/bin/env python3
"""Assemble flight-test.html: src/index.html + bundled three.js (vendor) + src/game.js."""
import re
from pathlib import Path

root = Path(__file__).parent
three = (root / 'vendor/three.module.min.js').read_text()
m = re.search(r'export\{([^}]*)\};?\s*$', three)
if not m:
    raise SystemExit('three.module.min.js: export list not found')
pairs = []
for item in m.group(1).split(','):
    item = item.strip()
    local, _, name = item.partition(' as ')
    pairs.append(f'{name or local}:{local}')
bundle = '(function(){\n' + three[:m.start()] + '\nwindow.THREE_LIB=Object.freeze({' + ','.join(pairs) + '});\n})();'

page = (root / 'src/index.html').read_text()
game = '\n'.join(p.read_text() for p in sorted((root / 'src/game').glob('*.js')))
for name, text in (('three', bundle), ('game', game)):
    if '</script' in text:
        raise SystemExit(f'{name}: contains </script')
page = page.replace('/*@@THREE@@*/', bundle).replace('/*@@GAME@@*/', game)
(root / 'flight-test.html').write_text(page)
print('wrote flight-test.html', len(page), 'bytes')
