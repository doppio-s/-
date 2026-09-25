#!/usr/bin/env python3
"""Assemble flight-test.html: src/index.html + bundled three.js (vendor) + src/game/*.js.

three.js is tree-shaken to the classes the game uses, and the game code is whitespace/comment-minified with esbuild (identifiers are kept, so the
#dbg hook still sees real names). Run `npm install` once first. The output must stay under
1,000,000 bytes: some previews cut files off there, which leaves the page stuck on Loading.
"""
import re
import subprocess
from pathlib import Path

root = Path(__file__).parent
LIMIT = 1_000_000
esbuild = root / 'node_modules/.bin/esbuild'
if not esbuild.exists():
    raise SystemExit('esbuild missing: run `npm install` first')


def three_bundle(game_src):
    """three.js tree-shaken down to the THREE.* names the game uses, exposed as window.THREE_LIB."""
    names = sorted(set(re.findall(r'THREE\.([A-Za-z_][A-Za-z0-9_]*)', game_src)))
    entry = root / 'node_modules/.three-entry.js'
    entry.write_text(f"import {{{','.join(names)}}} from '../vendor/three.module.min.js';\n"
                     f"window.THREE_LIB = Object.freeze({{{','.join(names)}}});\n")
    r = subprocess.run([str(esbuild), str(entry), '--bundle', '--minify', '--format=iife', '--legal-comments=none',
                        '--log-level=error', '--banner:js=/*! three.js r170 | MIT License | Copyright 2010-2024 Three.js Authors */'],
                       capture_output=True, text=True)
    if r.returncode:
        raise SystemExit('three bundle failed:\n' + r.stderr)
    return r.stdout


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
    bundle = three_bundle(src)
    for name, text in (('three', bundle), ('game', game)):
        if '</script' in text:
            raise SystemExit(f'{name}: contains </script')
    text = html.replace('/*@@THREE@@*/', bundle).replace('/*@@GAME@@*/', game)
    size = len(text.encode())
    if size >= LIMIT:
        raise SystemExit(f'{out}: {size} bytes, over the {LIMIT} byte limit')
    (root / out).write_text(text)
    print('wrote', out, size, 'bytes')
