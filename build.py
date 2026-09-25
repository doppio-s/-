#!/usr/bin/env python3
"""Assemble flight-test.html: src/index.html + bundled three.js (vendor) + src/game/*.js.

The game code is whitespace/comment-minified with esbuild (identifiers are kept, so the
#dbg hook still sees real names). Run `npm install` once first. The output must stay under
1,000,000 bytes: some previews cut files off there, which leaves the page stuck on Loading.
"""
import re
import subprocess
from pathlib import Path

root = Path(__file__).parent
LIMIT = 1_000_000
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

esbuild = root / 'node_modules/.bin/esbuild'
if not esbuild.exists():
    raise SystemExit('esbuild missing: run `npm install` first')


def minify(js):
    r = subprocess.run([str(esbuild), '--loader=js', '--format=esm', '--target=es2022', '--minify-whitespace',
                        '--minify-syntax', '--legal-comments=none', '--log-level=error'],
                       input=js, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit('esbuild failed:\n' + r.stderr)
    return r.stdout


page = (root / 'src/index.html').read_text()
source = '\n'.join(p.read_text() for p in sorted((root / 'src/game').glob('*.js')))

# ace-duel test build: every PLAY starts at stage 3's boss, FALCON ZERO
hook = "{ const hw = { '#fortress': 1, '#titan': 2, '#ace': 3, '#carrier': 4 }[location.hash];"
assert hook in source
builds = {
    'flight-test.html': (source, page),
    'flight-ace-test.html': (source.replace(hook, '{ const hw = 3;', 1),
                             page.replace('<title>flight.io TEST (all unlocked)</title>', '<title>flight.io TEST · ACE DUEL</title>', 1)
                                 .replace('TEST BUILD · ALL UNLOCKED', 'TEST BUILD · ACE DUEL (starts at the stage 3 boss)', 1)),
}
for out, (src, html) in builds.items():
    game = minify(src)
    for name, text in (('three', bundle), ('game', game)):
        if '</script' in text:
            raise SystemExit(f'{name}: contains </script')
    text = html.replace('/*@@THREE@@*/', bundle).replace('/*@@GAME@@*/', game)
    size = len(text.encode())
    if size >= LIMIT:
        raise SystemExit(f'{out}: {size} bytes, over the {LIMIT} byte limit')
    (root / out).write_text(text)
    print('wrote', out, size, 'bytes')
