// ================= v7: wave variety, stage hazards, boss checkpoints =================
// Every stage runs its own 3-wave lineup, so no two stages play the same:
//   DOGFIGHT  shoot down the quota          GATE RUN  thread the gates before the clock runs out
//   AA STRIKE destroy the marked AA sites    BOMBERS   stop the bomber formation before it crosses the map
//   HOLD OUT  survive the swarm              ACE SQUADRON  three elite pilots, all at once
const LINEUP = [
  ['dogfight', 'gates', 'strike'],     // OCEAN ISLES
  ['bombers', 'dogfight', 'survive'],  // DESERT CANYON (sandstorms)
  ['gates', 'bombers', 'squadron'],    // DEEP SPACE
  ['strike', 'bombers', 'survive'],    // NIGHT FRONT (lightning)
];
let wtype = 'dogfight', wv = {};
const lapK = () => 1 + 0.5 * lapN();
const waveName = t => WAVES[t].name;
const lineupText = i => LINEUP[i].map(waveName).join(' &middot; ') + ' &middot; BOSS';
function waveBonus(pts, sub) {
  pts = Math.round(pts * lapK()); killPts += pts;
  popup(player.x, player.y + 4, player.z, sub ? sub + ' +' + pts : '+' + pts, true, true);
}
// bots in a wave that must be chased down wherever they are
const keepBot = b => b.bomber || b.squad;

const WAVES = {
  dogfight: {
    name: 'DOGFIGHT',
    start() { waveQuota = 6 + (wave - 1) * 2 + stageIdx() * 2 + lapN() * 4; return 'SHOOT DOWN ' + waveQuota; },
    update() {
      if (botSpawnCd <= 0 && bots.length < maxBotsNow() && bots.length + waveKills < waveQuota) {
        const b = spawnBot(); if (b) loopBuff(b);
        botSpawnCd = rand(0.9, 1.8) / (1 + lvT / 90);
      }
    },
    kill() { if (++waveKills >= waveQuota) waveCleared(); },
    label() { return Math.max(0, waveQuota - waveKills) + ' LEFT'; },
  },

  // ---- GATE RUN: a chain of rings; each one resets a short clock ----
  gates: {
    name: 'GATE RUN',
    start() {
      const n = 6 + lapN(), list = [];
      let px = player.x, py = player.y, pz = player.z, h = player.a;
      for (let k = 0; k < n; k++) {
        let x, y, z, ok = false;
        for (let t = 0; t < 14 && !ok; t++) {
          const dh = h + rand(-0.75, 0.75), d = rand(80, 100);
          x = px + Math.cos(dh) * d; z = pz + Math.sin(dh) * d;
          y = isSpace() ? clamp(py + rand(-35, 35), ALT_MIN + 25, ALT_MAX - 25) : clamp(py + rand(-14, 14), 20, ALT_MAX - 14);
          if (Math.abs(x) > MAP - 40 || Math.abs(z) > MAP - 40) { h = Math.atan2(-pz, -px); continue; }
          ok = !isSpace() || TORI.every(T => torusDist(T, { x, y, z }) > 16);
          if (ok) h = dh;
        }
        const nx = x - px, ny = y - py, nz = z - pz, nl = Math.hypot(nx, ny, nz) || 1;
        const g = { x, y, z, n: [nx / nl, ny / nl, nz / nl], R: 8.5, scale: 3, prev: 0, mesh: makeGate() };
        g.mesh.position.set(x, y, z); g.mesh.lookAt(x + g.n[0], y + g.n[1], z + g.n[2]); g.mesh.visible = false; scene.add(g.mesh);
        list.push(g); px = x; py = y; pz = z;
      }
      if (isSpace()) for (const r of ROCKS) if (list.some(g => dist3(g, r) < r.r + 16)) { placeRock(r, true); r.mesh.position.set(r.x, r.y, r.z); }
      wv = { list, i: 0, got: 0, streak: 0, t: 0 };
      armGate();
      return 'FLY THROUGH ' + n + ' GATES';
    },
    update(dt) {
      if (botSpawnCd <= 0 && bots.length < Math.min(2, maxBotsNow())) { const b = spawnBot(); if (b) loopBuff(b); botSpawnCd = rand(3, 5); }
      const g = wv.list[wv.i]; if (!g) return;
      wv.t -= dt;
      const rx = player.x - g.x, ry = player.y - g.y, rz = player.z - g.z;
      const s = rx * g.n[0] + ry * g.n[1] + rz * g.n[2];
      const radial = Math.sqrt(Math.max(0, rx * rx + ry * ry + rz * rz - s * s));
      if (g.prev < 0 && s >= 0 && radial < g.R + 1.2) passGate(g);
      else if (wv.t <= 0) missGate(g);
      else g.prev = s;
      if (wv.t < 3 && wv.t + dt >= Math.ceil(wv.t) && wv.t > 0) Sound.tone(880, 0.06, 'square', 0.05);
      for (const [k, q] of wv.list.entries()) if (q.mesh.visible) {
        const cur = k === wv.i;
        q.mesh.scale.setScalar(cur ? 1 + Math.sin(time * 6) * 0.05 : 0.9);
        q.mesh.userData.ring.material.color.set(cur ? (wv.t < 3 && Math.floor(time * 6) % 2 ? 0xff5c7a : 0xffd24a) : 0x62f5ec);
        q.mesh.userData.disc.material.opacity = cur ? 0.16 : 0.05;
        q.mesh.rotation.z += dt * (cur ? 1.2 : 0.4);
      }
    },
    end() { for (const g of wv.list || []) scene.remove(g.mesh); },
    label() { return 'GATE ' + Math.min(wv.i + 1, wv.list.length) + '/' + wv.list.length + ' · ' + Math.max(0, Math.ceil(wv.t)) + 's'; },
    marks() { const g = wv.list[wv.i]; return g ? [{ o: g, cls: 'gate', lbl: 'GATE ' }] : []; },
  },

  // ---- AA STRIKE: marked flak sites on the islands; fighters defend them ----
  strike: {
    name: 'AA STRIKE',
    start() {
      const n = 4 + (stageIdx() >= 3 ? 1 : 0) + lapN();
      const spots = ISLANDS.filter(o => o.r >= 8 && o.tx !== undefined && Math.abs(o.tx) < MAP - 15 && Math.abs(o.tz) < MAP - 15)
        .map(o => ({ o, d: Math.hypot(o.tx - player.x, o.tz - player.z) })).filter(s => s.d > 55).sort((a, b) => a.d - b.d).slice(0, n + 4);
      for (let i = spots.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [spots[i], spots[j]] = [spots[j], spots[i]]; }
      const list = [];
      for (const { o } of spots.slice(0, n)) {
        let t = turrets.find(t => !t.dead && !t.carrier && Math.hypot(t.x - o.tx, t.z - o.tz) < 3);
        if (!t) { const mesh = makeTurret(); mesh.position.set(o.tx, o.ty - 0.4, o.tz); scene.add(mesh); t = { x: o.tx, y: o.ty + 2, z: o.tz, cd: rand(1, 3), dead: false, mesh, scale: 1.2 }; turrets.push(t); }
        Object.assign(t, { hp: Math.ceil(8 * lapK()), pts: 350, strike: true });
        const beam = new THREE.Mesh(G.cyl, beaconMat); beam.scale.set(0.35, 40, 0.35); beam.position.y = 20; t.mesh.add(beam); t.beam = beam;
        list.push(t);
      }
      wv = { list };
      if (!list.length) { wtype = 'dogfight'; return WAVES.dogfight.start(); }   // no islands here
      return 'DESTROY ' + list.length + ' AA SITES';
    },
    update() {
      if (botSpawnCd <= 0 && bots.length < Math.min(3, maxBotsNow())) { const b = spawnBot(); if (b) loopBuff(b); botSpawnCd = rand(2.2, 3.8); }
      beaconMat.opacity = 0.28 + Math.sin(time * 5) * 0.12;
    },
    kill(o) {
      if (!o || !o.strike) return;
      if (o.beam) { o.mesh.remove(o.beam); o.beam = null; }
      const left = wv.list.filter(t => !t.dead).length;
      popup(o.x, o.y + 5, o.z, left ? 'AA SITE DOWN · ' + left + ' LEFT' : 'ALL AA SITES DOWN', true);
      if (!left) { waveBonus(1200, 'STRIKE COMPLETE'); waveCleared('STRIKE COMPLETE'); }
    },
    end() { for (const t of wv.list || []) { t.strike = false; if (t.beam) { t.mesh.remove(t.beam); t.beam = null; } } },
    label() { return 'AA SITES ' + wv.list.filter(t => !t.dead).length + ' LEFT'; },
  },

  // ---- BOMBERS: a formation crosses the map; every one that gets through costs a heart ----
  bombers: {
    name: 'BOMBERS',
    start() {
      const n = 3 + (stageIdx() >= 2 ? 1 : 0) + lapN(), E = MAP - 30;
      let bestK = null;
      for (let k = 0; k < 10; k++) {   // a flight line that passes close to you and is long from both ends
        const th = rand(0, Math.PI * 2), dx = Math.cos(th), dz = Math.sin(th);
        const ox = player.x + rand(-25, 25), oz = player.z + rand(-25, 25);
        const lim = (p, d) => d > 0 ? [(-E - p) / d, (E - p) / d] : d < 0 ? [(E - p) / d, (-E - p) / d] : [-1e9, 1e9];
        const [a0, a1] = lim(ox, dx), [b0, b1] = lim(oz, dz), t0 = Math.max(a0, b0), t1 = Math.min(a1, b1);
        const score = Math.min(-t0, t1);
        if (!bestK || score > bestK.score) bestK = { score, dx, dz, sx: ox + dx * t0, sz: oz + dz * t0, len: t1 - t0 };
      }
      const { dx, dz, sx, sz, len } = bestK, px = -dz, pz = dx;
      const cy = isSpace() ? clamp(player.y + rand(-25, 25), ALT_MIN + 30, ALT_MAX - 30) : rand(34, 48);
      const list = [];
      for (let i = 0; i < n; i++) {
        const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 15, back = Math.ceil(i / 2) * 14;
        const x = sx - dx * back + px * side, z = sz - dz * back + pz * side;
        const b = spawnBot('heavy', { x, y: cy, z }); if (!b) continue;
        Object.assign(b, { x, z, y: cy, a: Math.atan2(dz, dx), bomber: true, hp: Math.ceil(12 * lapK()), pts: 500, scale: 2.2, spd: 0.55, gunCd: rand(1, 2),
          sx: sx + px * side, sz: sz + pz * side, dx, dz, len, cy, trailT: 0 });
        scene.remove(b.mesh); b.mesh = makePlane(0x3b3f4f, 0xffb13b, 'brick'); b.mesh.scale.setScalar(1.45 * 2.2); scene.add(b.mesh); orientPlane(b, 0);
        list.push(b);
      }
      for (let i = 0; i < 2; i++) { const e = spawnBot('normal', list[0]); if (e) loopBuff(e); }
      wv = { list, esc: 0, n: list.length };
      Sound.sfxSiren();
      return 'STOP ' + list.length + ' BOMBERS BEFORE THEY CROSS';
    },
    update() {
      if (botSpawnCd <= 0 && bots.filter(b => !b.bomber).length < Math.min(2, maxBotsNow())) { const b = spawnBot(); if (b) loopBuff(b); botSpawnCd = rand(3, 5); }
      for (const b of wv.list) {
        if (b.dead) continue;
        if ((b.x - b.sx) * b.dx + (b.z - b.sz) * b.dz >= b.len) {   // made it across
          b.dead = true; b.escaped = true; removeBot(b); wv.esc++;
          banner('BOMBER GOT THROUGH', player.hp > 1 ? '-1 ♥' : 'LAST HEART SPARED', '#ff5c7a');
          if (player.hp > 1) { player.hp--; const fl = $('dmgFlash'); fl.classList.remove('hit'); void fl.offsetWidth; fl.classList.add('hit'); Sound.sfxHit(); shake = 0.3; updateHud(true); }
        }
      }
      bots = bots.filter(b => !b.dead);
      if (wv.list.every(b => b.dead)) {
        if (!wv.esc) waveBonus(2000, 'PERFECT INTERCEPT');
        waveCleared(wv.esc ? 'INTERCEPT OVER' : 'PERFECT INTERCEPT', (wv.n - wv.esc) + '/' + wv.n + ' BOMBERS DOWN');
      }
    },
    kill(o) {
      if (!o || !o.bomber) return;
      hitStop(0.18, 0.25); shockwave(o.x, o.y, o.z, 16, 0xffb13b, 0.5);
      const left = wv.list.filter(b => !b.dead).length;
      if (left) popup(o.x, o.y + 5, o.z, 'BOMBER DOWN · ' + left + ' LEFT', true);
    },
    label() { const down = wv.list.filter(b => b.dead && !b.escaped).length; return 'BOMBERS ' + down + '/' + wv.n + ' DOWN' + (wv.esc ? ' · ' + wv.esc + ' THROUGH' : ''); },
    marks() { return wv.list.filter(b => !b.dead && Math.hypot(b.x - player.x, b.z - player.z) >= 170).map(b => ({ o: b, cls: 'bomb', lbl: 'BOMBER ' })); },
  },

  // ---- HOLD OUT: a swarm with more attackers at once; just stay alive ----
  survive: {
    name: 'HOLD OUT',
    start() { wv = { t: 30 + (stageIdx() >= 3 ? 5 : 0), kills: 0 }; wv.max = wv.t; botSpawnCd = 0.3; return 'SURVIVE ' + wv.t + ' SECONDS'; },
    update(dt) {
      if (botSpawnCd <= 0 && bots.length < Math.min(10, maxBotsNow() + 3)) { const b = spawnBot(); if (b) loopBuff(b); botSpawnCd = rand(0.4, 0.9); }
      const before = wv.t; wv.t -= dt;
      if (wv.t < 5 && Math.ceil(wv.t) !== Math.ceil(before)) Sound.tone(660, 0.08, 'square', 0.06);
      if (wv.t <= 0) { waveBonus(1500, 'SURVIVED'); waveCleared('SURVIVED', wv.kills + ' SHOT DOWN'); }
    },
    kill() { wv.kills++; },
    label() { return 'HOLD OUT ' + Math.max(0, Math.ceil(wv.t)) + 's'; },
  },

  // ---- ACE SQUADRON: three gold-trimmed elites fly in together ----
  squadron: {
    name: 'ACE SQUADRON',
    start() {
      const n = 3 + lapN(), f = fwdOf(player), side = Math.random() < 0.5 ? -1 : 1;
      const at = { x: clamp(player.x + f[0] * 130 - f[2] * 50 * side, -MAP + 30, MAP - 30), y: clampAlt(player.y + 8), z: clamp(player.z + f[2] * 130 + f[0] * 50 * side, -MAP + 30, MAP - 30) };
      const list = [];
      for (let i = 0; i < n; i++) {
        const b = spawnBot('ace', { x: at.x + i * 6, y: at.y, z: at.z + i * 6 }); if (!b) continue;
        Object.assign(b, { squad: true, hp: Math.ceil(7 * lapK()), pts: 700, spd: 1.18 });
        scene.remove(b.mesh); b.mesh = makePlane(0x1c1d2a, 0xffc83d, 'falcon'); scene.add(b.mesh); orientPlane(b, 0);
        list.push(b);
      }
      wv = { list };
      Sound.sfxSiren();
      return list.length + ' ELITES INBOUND';
    },
    update() {
      if (wv.list.every(b => b.dead)) { waveBonus(1500, 'SQUADRON DOWN'); waveCleared('SQUADRON DOWN'); }
    },
    kill(o) { if (o && o.squad) { const left = wv.list.filter(b => !b.dead).length; if (left) popup(o.x, o.y + 5, o.z, 'ACE DOWN · ' + left + ' LEFT', true); } },
    label() { return 'ACES ' + wv.list.filter(b => !b.dead).length + ' LEFT'; },
  },
};

// ---- meshes ----
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.3, depthWrite: false });
function makeGate() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.75, 10, 40), new THREE.MeshBasicMaterial({ color: 0xffd24a }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  g.add(ring, disc);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, l = new THREE.Mesh(G.sphLo, new THREE.MeshBasicMaterial({ color: 0xffffff })); l.position.set(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 0); l.scale.setScalar(1.1); g.add(l); }
  g.userData = { ring, disc };
  return g;
}
function armGate() {
  const g = wv.list[wv.i]; if (!g) return;
  const from = wv.i ? wv.list[wv.i - 1] : player, d = dist3(from, g);
  wv.t = clamp(d / Math.max(10, playerSpeed()) * 2.4 + 3, 6, 11);
  g.prev = -1;
  for (const [k, q] of wv.list.entries()) q.mesh.visible = k === wv.i || k === wv.i + 1;
}
function passGate(g) {
  wv.got++; wv.streak++;
  const pts = Math.round((250 + 50 * wv.streak) * lapK()); killPts += pts;
  ringBoostT = 1.4;
  popup(g.x, g.y + 3, g.z, 'GATE ' + (wv.i + 1) + '/' + wv.list.length + ' +' + pts, true);
  shockwave(g.x, g.y, g.z, 16, 0xffd24a, 0.45);
  Sound.tone(880 + wv.streak * 60, 0.12, 'triangle', 0.08); Sound.tone(1320 + wv.streak * 60, 0.18, 'triangle', 0.08, null, 0.08);
  nextGate(g);
}
function missGate(g) {
  wv.streak = 0;
  popup(player.x, player.y + 3, player.z, 'GATE MISSED'); Sound.tone(220, 0.25, 'sawtooth', 0.07, 110);
  nextGate(g);
}
function nextGate(g) {
  scene.remove(g.mesh); wv.i++; updateHud(true);
  if (wv.i < wv.list.length) { armGate(); return; }
  const all = wv.got === wv.list.length;
  if (all) { waveBonus(1500, 'PERFECT RUN'); player.ammo = maxAmmo(); }
  waveCleared(all ? 'PERFECT RUN' : 'GATE RUN OVER', wv.got + '/' + wv.list.length + ' GATES');
}
function waveMarks() { const w = WAVES[wtype]; return dirPhase === 'wave' && w && w.marks ? w.marks() : []; }

// ---- bomber flight: straight for the far edge, tail gunner covers the six ----
function updateBomber(b, dt, hostile) {
  const gx = b.sx + b.dx * (b.len + 40), gz = b.sz + b.dz * (b.len + 40);
  turnToward(b, Math.atan2(gz - b.z, gx - b.x), 0.6, dt);
  b.p = lerp(b.p, clamp((b.cy - b.y) * 0.05, -0.2, 0.2), Math.min(1, dt * 2));
  const bs = botSpeed() * b.spd, cp = Math.cos(b.p);
  b.x += Math.cos(b.a) * cp * bs * dt; b.z += Math.sin(b.a) * cp * bs * dt; b.y = clamp(b.y + Math.sin(b.p) * bs * dt, ALT_MIN, ALT_MAX);
  b.roll = lerp(b.roll, 0, dt * 2);
  b.gunCd -= dt;
  const f = fwdOf(b), dx = player.x - b.x, dy = player.y - b.y, dz = player.z - b.z, d = Math.hypot(dx, dy, dz) || 1;
  if (hostile && player.alive && state === 'playing' && d < 58 && (dx * f[0] + dy * f[1] + dz * f[2]) / d < 0.25 && b.gunCd <= 0) {
    fire(b, true, { x: player.x + rand(-2.5, 2.5), y: player.y + rand(-1.5, 1.5), z: player.z + rand(-2.5, 2.5) });
    Sound.sfxEnemyShoot(b); b.gunCd = rand(0.8, 1.4) / Math.min(1.6, lapK());
  }
  b.trailT -= dt;
  if (b.trailT <= 0) {
    b.trailT = 0.07;
    for (const sd of [-1, 1]) addPart(b.x - f[0] * 5 - Math.sin(b.a) * sd * 4, b.y - 0.5, b.z - f[2] * 5 + Math.cos(b.a) * sd * 4, 0, 0.6, 0, 0.8, 0.7, 0xdddddd, 1);
  }
}

// ---- stage hazards: desert sandstorms, night-front lightning ----
const HZ = { sandCd: 12, sandT: 0, fogK: 0, wx: 0, wz: 0, boltCd: 5, bolts: [], flash: 0, farCd: 4 };
const boltGeo = new THREE.CylinderGeometry(7, 7, 170, 24, 1, true);
const boltSeg = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xf2f7ff, fog: false });
const _up = new THREE.Vector3(0, 1, 0), _bv = new THREE.Vector3();
function resetHazards() {
  HZ.sandT = 0; HZ.sandCd = 12; HZ.fogK = 0; HZ.boltCd = 5; HZ.flash = 0; HZ.farCd = 4;
  for (const b of HZ.bolts) scene.remove(b.mesh);
  HZ.bolts = [];
  if (themeNow >= 0) { const t = THEMES[themeNow]; scene.fog.color.set(t.fog); scene.fog.near = t.fogN; scene.fog.far = t.fogF; hemi.intensity = t.hemi[2]; }
}
const _fc = new THREE.Color(), _sandC = new THREE.Color(0xd9a86a);
function updateHazards(dt) {
  if (themeNow < 0) return;
  const t = THEMES[themeNow], live = state === 'playing';
  // sandstorm: every ~25s during waves the fog closes in and a crosswind shoves you around
  if (t.sandstorm && live && dirPhase === 'wave') {
    if (HZ.sandT > 0) HZ.sandT -= dt;
    else if ((HZ.sandCd -= dt) <= 0) {
      HZ.sandT = 10; HZ.sandCd = rand(20, 28);
      const a = rand(0, Math.PI * 2); HZ.wx = Math.cos(a); HZ.wz = Math.sin(a);
      banner('SANDSTORM', 'VISIBILITY DROPPING &middot; TRUST YOUR RADAR', '#ffb13b');
      Sound.noise(2.5, 0.12, 500); Sound.tone(90, 2, 'sine', 0.08, 60);
    }
  } else if (!live) HZ.sandT = Math.min(HZ.sandT, 0);
  else HZ.sandT = 0;
  const target = HZ.sandT > 0 ? 1 : 0;
  if (HZ.fogK || target) {
    HZ.fogK = clamp(HZ.fogK + (target ? dt * 0.7 : -dt * 0.5), 0, 1);
    const k = HZ.fogK;
    scene.fog.near = lerp(t.fogN, 8, k); scene.fog.far = lerp(t.fogF, 95, k);
    scene.fog.color.copy(_fc.set(t.fog).lerp(_sandC, k));
    if (live && k > 0.2) {
      player.x += HZ.wx * 5 * k * dt; player.z += HZ.wz * 5 * k * dt;
      for (let i = 0; i < 3; i++) addPart(player.x + rand(-26, 26) - HZ.wx * 20, player.y + rand(-10, 10), player.z + rand(-26, 26) - HZ.wz * 20, HZ.wx * 40, rand(-1, 1), HZ.wz * 40, 0.8, rand(0.2, 0.45), 0xe0b07a);
    }
  }
  // lightning: a glowing column marks the strike point, then the bolt lands
  if (t.lightning && live && (dirPhase === 'wave' || dirPhase === 'boss')) {
    if ((HZ.boltCd -= dt) <= 0) {
      HZ.boltCd = dirPhase === 'boss' ? rand(6, 9) : rand(3.2, 5.5);
      const f = fwdOf(player), lead = playerSpeed() * 1.4, spot = Math.random() < 0.45 ? 0 : rand(8, 22), sa = rand(0, Math.PI * 2);
      const x = clamp(player.x + f[0] * lead + Math.cos(sa) * spot, -MAP + 10, MAP - 10), z = clamp(player.z + f[2] * lead + Math.sin(sa) * spot, -MAP + 10, MAP - 10);
      const mesh = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
      mesh.position.set(x, 85, z); scene.add(mesh);
      HZ.bolts.push({ x, z, t: 1.4, mesh, fired: false });
      Sound.tone(1200, 1.3, 'sine', 0.025, 2400);
    }
    if ((HZ.farCd -= dt) <= 0) { HZ.farCd = rand(4, 9); HZ.flash = Math.max(HZ.flash, 0.45); Sound.noise(1.6, 0.06, 220, 0.6); }
    for (let i = 0; i < 2; i++) addPart(player.x + rand(-30, 30), player.y + rand(8, 20), player.z + rand(-30, 30), 0, -60, 0, 0.35, 0.12, 0xbfd6ff);
  }
  for (const b of HZ.bolts) {
    b.t -= dt;
    if (!b.fired) {
      b.mesh.material.opacity = 0.08 + (1 - b.t / 1.4) * 0.3 + (Math.floor(time * 14) % 2 ? 0.08 : 0);
      if (b.t <= 0) strikeBolt(b);
    } else if (b.t <= -0.18) { scene.remove(b.mesh); b.dead = true; }
  }
  HZ.bolts = HZ.bolts.filter(b => !b.dead);
  if (HZ.flash > 0) { HZ.flash = Math.max(0, HZ.flash - dt * 3); hemi.intensity = t.hemi[2] + HZ.flash * 3; }
}
function strikeBolt(b) {
  b.fired = true; scene.remove(b.mesh);
  // jagged bolt from the clouds to the sea
  const g = new THREE.Group(); let px = b.x + rand(-6, 6), py = 170, pz = b.z + rand(-6, 6);
  for (let k = 0; k < 9; k++) {
    const ny = k === 8 ? 0 : py - 170 / 9, nx = k === 8 ? b.x : b.x + rand(-5, 5), nz = k === 8 ? b.z : b.z + rand(-5, 5);
    const s = new THREE.Mesh(boltSeg, boltMat), len = Math.hypot(nx - px, ny - py, nz - pz);
    s.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2); s.scale.set(1, len, 1);
    s.quaternion.setFromUnitVectors(_up, _bv.set(nx - px, ny - py, nz - pz).normalize()); g.add(s);
    px = nx; py = ny; pz = nz;
  }
  scene.add(g); b.mesh = g;
  HZ.flash = 1;
  const dh = Math.hypot(player.x - b.x, player.z - b.z);
  shockwave(b.x, clamp(player.y, 1, 60), b.z, 14, 0xbfe0ff, 0.4);
  Sound.noise(0.9, 0.4, 500); Sound.tone(55, 1, 'sine', 0.3, 30); Sound.noise(0.15, 0.25, 4000);
  shake = Math.max(shake, dh < 40 ? 0.45 : 0.15);
  if (state === 'playing' && dh < 7.5) { damage(); popup(player.x, player.y + 2, player.z, 'LIGHTNING!'); }
  for (const e of bots) if (!e.dead && !e.bomber && Math.hypot(e.x - b.x, e.z - b.z) < 7.5) { popup(e.x, e.y + 3, e.z, 'STRUCK!'); killBot(e); }
}

// ---- checkpoints: each stage's boss fight is recorded once reached (1) and beaten (2) ----
const CP_BOSS = { 1: 'SKY FORTRESS', 2: 'OMEGA TITAN', 3: 'FALCON ZERO', 4: 'IRON LEVIATHAN' };
const checkpoints = { 1: 0, 2: 0, 3: 0, 4: 0 };
let runCheckpoint = 0, runReached = 0;
function loadCheckpoints(raw) { try { const c = JSON.parse(raw || '{}'); for (const k of Object.keys(checkpoints)) if (Number.isInteger(c[k])) checkpoints[k] = clamp(c[k], 0, 2); } catch (e) {} }
const saveCheckpoints = () => Store.set('checkpoints', JSON.stringify(checkpoints));
function reachCheckpoint(n) {
  if (!CP_BOSS[n]) return;
  runReached = Math.max(runReached, n);
  if (checkpoints[n] < 1) { checkpoints[n] = 1; saveCheckpoints(); }
  toast('CHECKPOINT SAVED · STAGE ' + n + ' ' + CP_BOSS[n]);
}
function clearCheckpoint(n) { if (CP_BOSS[n] && checkpoints[n] < 2) { checkpoints[n] = 2; saveCheckpoints(); } }
function renderCheckpoints() {
  $('cpRow').classList.toggle('hidden', !Object.values(checkpoints).some(v => v > 0));
  for (const n of Object.keys(CP_BOSS)) {
    const b = $('btnCp-' + n);
    b.classList.toggle('hidden', !checkpoints[n]);
    b.innerHTML = `&#9654; S${n} ${CP_BOSS[n]}${checkpoints[n] >= 2 ? ' <span class="cpDone">&#10003;</span>' : ''}`;
  }
}
// a checkpoint run starts with the upgrades a normal run would have picked by then
function grantCheckpointUpgrades(n) {
  const k = 3 * (n - 1) + 2, got = [];
  for (let i = 0; i < k; i++) { const u = rollUpgrades(3).find(u => u.id !== 'repair'); if (!u) break; u.apply(); got.push(u.name); }
  Object.assign(player, { hp: maxHp(), ammo: maxAmmo(), missiles: Math.max(player.missiles, Math.min(maxMsl(), 6)), flares: Math.max(player.flares, 4) });
  if (got.length) toast('CHECKPOINT · ' + got.length + ' UPGRADES EQUIPPED');
}
for (const n of Object.keys(CP_BOSS)) onBtn('btnCp-' + n, () => { if (state !== 'title') return; Sound.sfxClick(); startRun(+n); });
onBtn('btnRetryCp', () => { if (state !== 'over' || busy) return; Sound.sfxClick(); startRun(runReached || runCheckpoint); });
