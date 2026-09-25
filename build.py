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

# ace-duel test build: every PLAY starts at 4:52, right before FALCON ZERO arrives
hook = "{ const hw = { '#fortress': 1, '#titan': 2, '#ace': 3, '#carrier': 4 }[location.hash];"
assert hook in page
ace = page.replace(hook, "{ const hw = 3;", 1).replace('<title>flight.io TEST (all unlocked)</title>', '<title>flight.io TEST · ACE DUEL</title>', 1)
ace = ace.replace('TEST BUILD · ALL UNLOCKED', 'TEST BUILD · ACE DUEL (starts at the stage 3 boss)', 1)
(root / 'flight-ace-test.html').write_text(ace)
print('wrote flight-ace-test.html', len(ace), 'bytes')
