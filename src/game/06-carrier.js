// ================= v4: boss hearts + 8:00 IRON LEVIATHAN carrier =================
// every boss kill pops out a heart that homes in on the player (full health = bonus points)
function bossHeart(B, n = 1) {
  if (state !== 'playing') return;
  for (let i = 0; i < n; i++) {
    spawnPickup('heart', B.x + rand(-4, 4), B.z + rand(-4, 4), clampAlt(B.y + 2));
    const p = pickups[pickups.length - 1]; p.magnet = true; p.mt = -0.4 * i;
  }
  popup(B.x, B.y + 6, B.z, '♥ DROPPED', true);
}

const CARRIER_AT = 480;
let carrierPhase = 'none', carrierT = 0, carrierWarned = false, carrierSunk = false;
const carrierLock = () => carrierPhase === 'intro' || carrierPhase === 'fight';
// ---- IRON LEVIATHAN: a flying wedge-shaped dreadnought with a hangar you can fly straight through ----
const SHIP_Y = 36;                       // hover height of the hull's centre plane
const SHIP_BOW = 100, SHIP_STERN = -70, SHIP_HW = 55, SHIP_HH = 8;
const shipHalfW = x => SHIP_HW * (SHIP_BOW - x) / (SHIP_BOW - SHIP_STERN);
const HANGAR = { x0: -32, x1: -12, hh: 6 };   // tunnel across the ship (along local z)
const TOWER = { x0: -66, x1: -38, hz: 10, y0: SHIP_HH, y1: 24 };

function makeCarrier() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.rotation.order = 'ZXY';
  const hull = M(0x69717e, { metalness: 0.35, roughness: 0.55 }), dark = M(0x2a303b, { metalness: 0.3 }), trim = M(0x8a93a2, { metalness: 0.4 });
  const glowB = M(0x9fe7ff, { emissive: 0x2aa8ff, emissiveIntensity: 2 }), glowR = M(0xff5c5c, { emissive: 0xff2020, emissiveIntensity: 2 });
  const glowY = M(0xffe08a, { emissive: 0xffb13b, emissiveIntensity: 1.6 }), glass = M(0x9fe7ff, { emissive: 0x2a6c88, emissiveIntensity: 0.8 });
  const wedge = (key, x0, x1, depth, y, mat) => {
    const pts = x1 >= SHIP_BOW ? [[SHIP_BOW, 0], [x0, shipHalfW(x0)], [x0, -shipHalfW(x0)]] : [[x1, shipHalfW(x1)], [x0, shipHalfW(x0)], [x0, -shipHalfW(x0)], [x1, -shipHalfW(x1)]];
    return part(spaceHull(key, pts, depth), mat, 1, 1, 1, 0, y, 0, body);
  };
  wedge('dn-front', HANGAR.x1, SHIP_BOW, SHIP_HH * 2, 0, hull);
  wedge('dn-rear', SHIP_STERN, HANGAR.x0, SHIP_HH * 2, 0, hull);
  wedge('dn-roof', HANGAR.x0, HANGAR.x1, SHIP_HH - HANGAR.hh, (SHIP_HH + HANGAR.hh) / 2, hull);
  wedge('dn-floor', HANGAR.x0, HANGAR.x1, SHIP_HH - HANGAR.hh, -(SHIP_HH + HANGAR.hh) / 2, hull);
  // dorsal spine and belly plate give the slab some depth
  part(G.box, trim, 150, 2, 7, 15, SHIP_HH + 1, 0, body);
  part(spaceHull('dn-belly', [[80, 0], [-60, 30], [-60, -30]], 2), dark, 1, 1, 1, 0, -SHIP_HH - 1, 0, body);
  // command tower
  part(G.box, hull, TOWER.x1 - TOWER.x0, 10, TOWER.hz * 2, (TOWER.x0 + TOWER.x1) / 2, SHIP_HH + 5, 0, body);
  part(G.box, trim, 20, 6, 28, -52, SHIP_HH + 13, 0, body);
  part(G.box, glass, 20.3, 1.2, 28.3, -52, SHIP_HH + 13.5, 0, body);
  for (const sd of [-1, 1]) part(G.sph, trim, 2.6, 2.6, 2.6, -52, SHIP_HH + 17.5, sd * 8, body);
  const radar = new THREE.Group(); radar.position.set(-58, SHIP_HH + 18, 0); body.add(radar);
  part(G.box, dark, 0.6, 3, 9, 0, 0, 0, radar);
  const beacon = part(G.sph, glowR, 0.8, 0.8, 0.8, -46, SHIP_HH + 17, 0, body);
  // engines
  for (const z of [-30, 0, 30]) {
    const e = part(G.cyl, dark, 6.5, 10, 6.5, SHIP_STERN - 3, 0, z, body); e.rotation.z = Math.PI / 2;
    const f = part(G.cyl, glowB, 5.2, 0.8, 5.2, SHIP_STERN - 8.2, 0, z, body); f.rotation.z = Math.PI / 2;
  }
  // greebles for scale
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) {
    const x = -30 + rnd() * 115, w = shipHalfW(x) * 0.75, z = (rnd() * 2 - 1) * w;
    if (x < -8 && x > -36) continue;
    const sx = 2 + rnd() * 6, sy = 0.8 + rnd() * 2.5, sz = 2 + rnd() * 6;
    part(G.box, rnd() < 0.5 ? trim : dark, sx, sy, sz, x, SHIP_HH + sy / 2, z, body);
  }
  // running lights along both edges
  for (let x = -60; x <= 90; x += 15) for (const sd of [-1, 1]) part(G.sph, sd < 0 ? glowR : glowB, 0.55, 0.55, 0.55, x, 0, sd * (shipHalfW(x) + 0.2), body);
  // hangar: lit ceiling strips, guide lights and glowing mouth frames so it reads as "fly in here"
  for (const x of [-29, -25, -19, -15]) part(G.box, glowB, 0.8, 0.3, 72, x, HANGAR.hh - 0.2, 0, body);
  for (let z = -36; z <= 36; z += 6) part(G.box, glowY, 1.2, 0.3, 1.2, -22, -HANGAR.hh + 0.2, z, body);
  for (const sd of [-1, 1]) for (const x of [HANGAR.x0, HANGAR.x1]) {
    const z = sd * shipHalfW(x);
    part(G.box, glowY, 0.8, HANGAR.hh * 2, 0.8, x, 0, z, body);
  }
  for (const sd of [-1, 1]) for (const y of [-HANGAR.hh, HANGAR.hh]) {
    const bar = part(G.box, glowY, HANGAR.x1 - HANGAR.x0, 0.6, 0.8, (HANGAR.x0 + HANGAR.x1) / 2, y, sd * shipHalfW(-22), body);
    bar.rotation.y = -sd * Math.atan2(SHIP_HW, SHIP_BOW - SHIP_STERN);
  }
  g.userData = { body, radar, beacon };
  return g;
}
function makeReactor() {
  const g = new THREE.Group();
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x9fe7ff, emissive: 0x2a8cff, emissiveIntensity: 1.6 });
  g.add(new THREE.Mesh(G.sph, coreMat)); g.children[0].scale.setScalar(2.8);
  const head = new THREE.Group(); g.add(head);
  const ringM = M(0x4a5260, { metalness: 0.6 });
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(G.torus, ringM); r.scale.setScalar(3.8 + i * 0.6); r.rotation.set(i * 1.1, i * 0.7, 0); head.add(r); }
  const pillar = part(G.cyl, M(0x2a303b), 1.2, HANGAR.hh * 2, 1.2, 0, 0, 0, g);
  g.userData = { head, barrels: new THREE.Group(), coreMat };
  return g;
}
function makeLauncher() {
  const g = new THREE.Group();
  part(G.box, M(0x3a4250), 2.6, 1.2, 2.6, 0, 0.6, 0, g);
  const head = new THREE.Group(); head.position.y = 1.4; g.add(head);
  const barrels = new THREE.Group(); head.add(barrels);
  part(G.box, M(0x4a5260), 2.4, 1.6, 2.2, 0, 0, 0, barrels);
  for (let i = 0; i < 4; i++) { const t = part(G.cyl, M(0xff3b3b, { emissive: 0x660000 }), 0.28, 0.4, 0.28, 1.25, ((i >> 1) - 0.5) * 0.7, ((i & 1) - 0.5) * 0.9, barrels); t.rotation.z = Math.PI / 2; }
  g.userData = { head, barrels };
  g.scale.setScalar(1.6);
  return g;
}
function shipLocal(B, o) { const ca = Math.cos(B.a), sa = Math.sin(B.a), dx = o.x - B.x, dz = o.z - B.z; return { x: dx * ca + dz * sa, y: o.y - B.y, z: -dx * sa + dz * ca }; }
function carrierWorld(B, lx, ly, lz) { const ca = Math.cos(B.a), sa = Math.sin(B.a); return { x: B.x + lx * ca - lz * sa, y: B.y + ly, z: B.z + lx * sa + lz * ca }; }
function carrierDist(o) {   // hull (wedge slab minus the hangar tunnel) plus tower; negative = inside metal
  const B = boss, l = shipLocal(B, o);
  const slope = SHIP_HW / (SHIP_BOW - SHIP_STERN), nrm = Math.hypot(1, slope);
  const side = (Math.abs(l.z) - shipHalfW(l.x)) / nrm;
  const hull = Math.max(SHIP_STERN - l.x, side, Math.abs(l.y) - SHIP_HH);
  const tunnel = Math.max(HANGAR.x0 - l.x, l.x - HANGAR.x1, Math.abs(l.y) - HANGAR.hh);
  const cut = Math.max(hull, -tunnel);
  const tower = Math.max(TOWER.x0 - l.x, l.x - TOWER.x1, Math.abs(l.z) - TOWER.hz, TOWER.y0 - l.y, l.y - TOWER.y1);
  return Math.min(cut, tower);
}
function playerInHangar() {
  if (!boss || !boss.carrier) return false;
  const l = shipLocal(boss, player);
  return l.x > HANGAR.x0 - 2 && l.x < HANGAR.x1 + 2 && Math.abs(l.y) < HANGAR.hh + 1 && Math.abs(l.z) < shipHalfW(l.x) + 12;
}
const CARRIER_GUNS = [[70, 0], [40, -14], [40, 14], [10, -24], [10, 24], [-45, -28]];
const CARRIER_LAUNCHERS = [[-45, 28], [85, 0]];

function updateCarrierFlow(dt) {
  if (carrierPhase === 'intro') {
    carrierT -= dt;
    if (carrierT <= 0) { carrierPhase = 'fight'; hideCine(); spawnCarrier(); }
  } else if (carrierPhase === 'fight' && boss && boss.carrier && !boss.dead) {
    supplyT -= dt;
    if (supplyT <= 0) { supplyT = 13; spawnPickup('ammo'); spawnPickup('ammo'); if (Math.random() < 0.6) spawnPickup('missile'); toast('SUPPLY DROP INBOUND'); }
  }
}
function startCarrierIntro() {
  carrierPhase = 'intro'; carrierT = 3.2;
  $('bossWarn').classList.add('hidden'); bossWarnT = 0;
  let n = 0;
  for (const b of bots) { if (b.dead) continue; b.dead = true; explode(b.x, b.y, b.z, 1.1); removeBot(b); n++; }
  bots = [];
  for (const t of turrets) if (!t.dead) { t.dead = true; explode(t.x, t.y, t.z, 1.1); wreckTurret(t); n++; }
  if (boss) { scene.remove(boss.mesh); boss = null; }
  $('bossBar').classList.add('hidden');
  for (const m of missiles) if (m.enemy) removeMissile(m);
  missiles = missiles.filter(m => !m.dead);
  bullets = bullets.filter(b => !b.enemy);
  if (n) { killPts += n * 100; popup(player.x, player.y + 4, player.z, 'SKY CLEARED +' + n * 100, true); }
  Object.assign(player, { hp: maxHp(), ammo: maxAmmo(), missiles: Math.min(maxMsl(), Math.max(player.missiles, 6)), flares: Math.min(maxFlr(), player.flares + 3), invul: 4 });
  shockwave(player.x, player.y, player.z, 110, 0xffffff, 1);
  shockwave(player.x, player.y, player.z, 70, 0x69c8ff, 0.8);
  shake = 0.5; hitStop(0.9, 0.2); killFlash();
  Sound.sfxBoom(); Sound.sfxSiren(); Sound.tone(50, 1.8, 'sawtooth', 0.2, 35);
  setCine('STAGE ' + stage + ' &middot; BOSS', 'IRON LEVIATHAN', 'A FLYING DREADNOUGHT &mdash; BREAK ITS GUNS, THEN FLY INSIDE');
  showCine(); updateHud(true);
}
function spawnCarrier() {
  // ahead of the player, broadside on, with the hangar mouth facing them
  const d = 175, lim = MAP - 110;
  const x = clamp(player.x + Math.cos(player.a) * d, -lim, lim), z = clamp(player.z + Math.sin(player.a) * d, -lim, lim);
  const phi = Math.atan2(player.z - z, player.x - x);
  const coreHp = Math.round(45 + 30 * gunDmg() * planeNow().guns);
  boss = { x, y: SHIP_Y, z, a: phi - Math.PI / 2, p: 0, roll: 0, hp: coreHp, max: coreHp, scale: 9, carrier: true, boss: true, pts: 20000,
    phase: 1, parts: [], fall: 0, launchT: 4, ciwsT: 3, ciwsBurst: 0, ciwsBT: 0, dying: 0, dead: false, intro: 1.5, turnDir: Math.random() < 0.5 ? -1 : 1,
    mesh: makeCarrier(), shieldMsgT: 0, core: null };
  scene.add(boss.mesh);
  const mk = (kind, lx, lz) => {
    const mesh = kind === 'gun' ? makeTurret() : kind === 'launcher' ? makeLauncher() : makeReactor(); scene.add(mesh);
    const t = { x: 0, y: 0, z: 0, lx, lz, hp: kind === 'gun' ? 14 : kind === 'launcher' ? 18 : coreHp, cd: rand(1, 2.5), dead: false, mesh, scale: kind === 'core' ? 1.3 : 1.4,
      pts: kind === 'gun' ? 400 : 600, carrier: true, noFlak: kind !== 'gun', launcher: kind === 'launcher', core: kind === 'core', mslCd: rand(3, 6) };
    turrets.push(t); if (kind === 'core') boss.core = t; else boss.parts.push(t);
  };
  for (const [lx, lz] of CARRIER_GUNS) mk('gun', lx, lz);
  for (const [lx, lz] of CARRIER_LAUNCHERS) mk('launcher', lx, lz);
  mk('core', -22, 0);
  placeCarrierParts(boss);
  $('bossBar').classList.remove('ace', 'shield'); $('bossBar').classList.add('titan', 'shield'); $('bossBar').classList.remove('hidden');
  carrierBar();
  banner('IRON LEVIATHAN', 'DESTROY THE HULL DEFENSES', '#69c8ff');
  shockwave(boss.x, boss.y, boss.z, 90, 0x69c8ff, 0.9);
  Sound.tone(38, 2.2, 'sawtooth', 0.25, 70); Sound.sfxBoom();
  for (let i = 0; i < 3; i++) spawnPickup('ammo');
  spawnPickup('missile');
}
function carrierBar() {
  const B = boss; if (!B || !B.carrier) return;
  if (B.phase === 1) {
    const left = B.parts.filter(t => !t.dead).length;
    $('bossName').textContent = 'IRON LEVIATHAN · HULL DEFENSES ' + left + '/' + B.parts.length;
    $('bossFill').style.width = (left / B.parts.length * 100).toFixed(1) + '%';
  } else {
    $('bossName').textContent = 'IRON LEVIATHAN · REACTOR (FLY INSIDE)';
    $('bossFill').style.width = Math.max(0, B.core.hp / B.max * 100).toFixed(1) + '%';
  }
}
function placeCarrierParts(B) {
  for (const t of [...B.parts, B.core]) {
    if (!t) continue;
    const onTop = !t.core, w = carrierWorld(B, t.lx, onTop ? SHIP_HH : 0, t.lz);
    t.x = w.x; t.z = w.z; t.y = w.y + (onTop ? 2 : 0);
    t.mesh.position.set(w.x, w.y + (onTop ? 0.1 : 0), w.z);
    if (t.launcher && !t.dead) t.mesh.userData.head.rotation.y = -Math.atan2(player.z - t.z, player.x - t.x);
    if (t.core) { t.mesh.rotation.y = -B.a; t.mesh.userData.head.rotation.y += 0.02; t.mesh.userData.head.rotation.x += 0.013; }
  }
}
function carrierPartDown() {   // one of its guns/launchers died
  const B = boss; if (!B || !B.carrier || B.dead) return;
  carrierBar();
  if (B.phase === 1 && B.parts.every(t => t.dead)) {
    B.phase = 2; B.intro = 1;
    $('bossBar').classList.remove('shield');
    const cm = B.core.mesh.userData.coreMat; cm.color.set(0xffb08a); cm.emissive.set(0xff3b1a); cm.emissiveIntensity = 2.4;
    carrierBar();
    banner('HANGAR OPEN', 'FLY INSIDE · DESTROY THE REACTOR', '#ff7a2d');
    toast('Fly through the glowing hangar and shoot the REACTOR');
    shockwave(B.x, B.y, B.z, 80, 0xff7a2d, 0.8); shake = Math.max(shake, 0.4); hitStop(0.3, 0.2);
    Sound.sfxSiren(); Sound.sfxBoom();
    spawnPickup('missile'); spawnPickup('ammo'); spawnPickup('ammo');
  }
}
function carrierBlocks(at) {   // the hull itself is always armored — its guns and reactor are the targets
  const B = boss;
  for (let i = 0; i < 3; i++) addPart(at.x, at.y, at.z, rand(-5, 5), rand(0, 5), rand(-5, 5), 0.3, 0.4, 0x9fdcff);
  if (Math.random() < 0.3) Sound.tone(1200, 0.04, 'triangle', 0.04);
  if ((B.shieldMsgT || 0) <= 0) { B.shieldMsgT = 3.5; toast(B.phase === 1 ? 'ARMORED HULL · destroy its guns first' : 'ARMORED HULL · fly into the hangar, hit the REACTOR'); }
  return true;
}
function hitReactor(t, dmg) {   // called from hitTurret for the core
  const B = boss; if (!B || !B.carrier || B.dead) return;
  for (let i = 0; i < 6; i++) addPart(t.x, t.y, t.z, rand(-6, 6), rand(-6, 6), rand(-6, 6), 0.35, 0.45, B.phase === 1 ? 0x9fdcff : 0xffe24a);
  if (B.phase === 1) { if ((B.shieldMsgT || 0) <= 0) { B.shieldMsgT = 3; toast('REACTOR SHIELDED · destroy the hull guns first'); } return; }
  t.hp -= dmg; B.hp = t.hp;
  if (t.hp > 0) { hitFx(t, dmg); hitFx(B, dmg, t); }
  carrierBar();
  if (t.hp <= 0) { t.dead = true; killCarrier(); }
}
function updateCarrier(dt, hostile) {
  const B = boss, ud = B.mesh.userData;
  B.shieldMsgT = (B.shieldMsgT || 0) - dt;
  ud.radar.rotation.y += dt * 2.2;
  ud.beacon.visible = Math.floor(time * 3) % 2 === 0;
  if (B.dead) {   // breaks up and falls into the sea
    B.dying -= dt; B.fall += dt; B.y -= dt * (3 + B.fall * 5); B.roll = lerp(B.roll, 0.35, dt * 0.5); B.p = lerp(B.p, -0.12, dt * 0.4);
    if (Math.random() < dt * 16) { const w = carrierWorld(B, rand(-65, 95), rand(-6, 9), 0); w.z += rand(-20, 20); explode(w.x, w.y, w.z, 1.4); Sound.sfxBoom(); shake = Math.max(shake, 0.2); }
    placeCarrierParts(B);
    if (B.dying <= 0 || B.y < -8) {
      explode(B.x, Math.max(2, B.y), B.z, 4); shockwave(B.x, 3, B.z, 130, 0xffffff, 1.2); shockwave(B.x, 3, B.z, 80, 0x69c8ff, 0.9);
      for (let i = 0; i < 40; i++) addPart(B.x + rand(-40, 40), 0.8, B.z + rand(-40, 40), rand(-4, 4), rand(8, 22), rand(-4, 4), rand(0.8, 1.4), rand(1, 1.8), i % 2 ? 0xffffff : 0x9fe0ff);
      shake = 0.9; killFlash(); Sound.sfxBoom(); Sound.tone(40, 1.8, 'sine', 0.35, 18);
      for (const t of [...B.parts, B.core]) scene.remove(t.mesh);
      turrets = turrets.filter(t => !t.carrier);
      scene.remove(B.mesh); boss = null; carrierPhase = 'done';
      return;
    }
  } else {
    if (B.intro > 0) B.intro -= dt;
    // hold station with a slow yaw; drift back toward the middle if it wanders
    const lim = MAP - 110;
    let turn = 0.02 * B.turnDir;
    if (Math.abs(B.x) > lim || Math.abs(B.z) > lim) { turn = clamp(wrapA(Math.atan2(-B.z, -B.x) - B.a), -0.05, 0.05); }
    const stunned = B.stun > 0; if (stunned) B.stun -= dt;
    B.a = wrapA(B.a + turn * dt);
    const spd = stunned ? 0.5 : 2.5;
    B.x += Math.cos(B.a) * spd * dt; B.z += Math.sin(B.a) * spd * dt;
    B.y = SHIP_Y + Math.sin(time * 0.4) * 1.2;
    if (Math.random() < dt * 24) { const zz = rand(-30, 30), w = carrierWorld(B, SHIP_STERN - 10, rand(-3, 3), zz); addPart(w.x, w.y, w.z, -Math.cos(B.a) * 10, 0, -Math.sin(B.a) * 10, 0.6, rand(1, 1.6), 0x9fe7ff, 1.2); }
    if (B.phase === 2 && Math.random() < dt * 8) { const w = carrierWorld(B, rand(-60, 80), SHIP_HH + 1, rand(-15, 15)); addPart(w.x, w.y, w.z, 0, rand(2, 4), 0, 1.2, rand(0.8, 1.4), Math.random() < 0.3 ? 0xff7a2d : 0x55556a, 1.4); }
    placeCarrierParts(B);
    if (state === 'playing' && player.alive) {
      const d0 = carrierDist(player);
      if (d0 < 0.8) {   // shove back out along the hull normal
        const e = 0.6, gx = carrierDist({ x: player.x + e, y: player.y, z: player.z }) - carrierDist({ x: player.x - e, y: player.y, z: player.z });
        const gy = carrierDist({ x: player.x, y: player.y + e, z: player.z }) - carrierDist({ x: player.x, y: player.y - e, z: player.z });
        const gz = carrierDist({ x: player.x, y: player.y, z: player.z + e }) - carrierDist({ x: player.x, y: player.y, z: player.z - e });
        const gl = Math.hypot(gx, gy, gz) || 1, push = 0.8 - d0;
        player.x += gx / gl * push; player.y = clamp(player.y + gy / gl * push, ALT_MIN, ALT_MAX); player.z += gz / gl * push;
        shake = Math.max(shake, 0.2);
      }
    }
    if (playerInHangar() && !B.wasInside) { B.wasInside = true; if (B.phase === 2) banner('INSIDE THE HANGAR', 'HIT THE REACTOR', '#ffb13b'); }
    else if (!playerInHangar()) B.wasInside = false;
    const act = hostile && player.alive && state === 'playing' && !playerHidden() && !stunned && !(B.intro > 0);
    if (act) {
      const d = dist3(B, player);
      // fighters launched from the hangar mouths
      B.launchT -= dt;
      if (B.launchT <= 0 && bots.length < 6) {
        B.launchT = B.phase === 1 ? rand(6.5, 8.5) : rand(4.5, 6);
        const sd = Math.random() < 0.5 ? -1 : 1, w = carrierWorld(B, -22, 0, sd * (shipHalfW(-22) + 3));
        const e = spawnBot(Math.random() < 0.25 + lvT / 2400 ? 'ace' : 'normal', { x: w.x, y: w.y, z: w.z });
        if (e) {
          e.x = w.x; e.z = w.z; e.y = w.y; e.a = B.a + sd * Math.PI / 2; e.p = 0; e.pts = e.kind === 'ace' ? 450 : 150; loopBuff(e); orientPlane(e, 0);
          for (let i = 0; i < 10; i++) addPart(w.x, w.y, w.z, rand(-3, 3), rand(-2, 2), rand(-3, 3), 0.6, 0.8, 0xffffff, 1); Sound.sfxBoost();
        }
      }
      for (const t of B.parts) {   // missile launchers
        if (!t.launcher || t.dead) continue;
        t.mslCd -= dt;
        if (t.mslCd <= 0 && dist3(t, player) < 150 && missiles.filter(m => m.enemy && !m.dead).length <= 3) {
          t.mslCd = rand(6, 8.5);
          launchMissile({ x: t.x, y: t.y + 2, z: t.z, a: Math.atan2(player.z - t.z, player.x - t.x), p: 0.5 }, true);
        }
      }
      if (B.phase === 2) {   // point-defense bursts from the command tower
        B.ciwsT -= dt;
        if (B.ciwsT <= 0 && d < 130) { B.ciwsT = rand(2, 2.8); B.ciwsBurst = 5; }
        if (B.ciwsBurst > 0 && (B.ciwsBT -= dt) <= 0) {
          B.ciwsBurst--; B.ciwsBT = 0.1;
          const w = carrierWorld(B, -52, TOWER.y1 + 1, 0), f = fwdOf(player), ps = playerSpeed(), lead = dist3(w, player) / (botSpeed() + 30);
          fire({ x: w.x, y: w.y, z: w.z, a: 0, p: 0 }, true, { x: player.x + f[0] * ps * lead + rand(-2, 2), y: player.y + f[1] * ps * lead + rand(-1.2, 1.2), z: player.z + f[2] * ps * lead + rand(-2, 2) });
          Sound.sfxEnemyShoot();
        }
      }
    }
  }
  B.mesh.position.set(B.x, B.y, B.z);
  B.mesh.rotation.y = -B.a;
  ud.body.rotation.set(B.roll, 0, B.p);
}
function killCarrier() {
  const B = boss;
  B.dead = true; B.dying = 4.5; bossCount++; kills++; carrierSunk = true;
  const c = B.core || B;
  explode(c.x, c.y, c.z, 3); shockwave(c.x, c.y, c.z, 40, 0xffb13b, 0.6);
  awardKill(B.x, B.y + 10, B.z, B.pts, true);
  bossHeart({ x: player.x, y: player.y, z: player.z }, 2);
  $('bossBar').classList.add('hidden'); $('bossBar').classList.remove('titan', 'shield');
  shake = 0.8; hitStop(1.5, 0.18); killFlash();
  banner('REACTOR DESTROYED', '+20000 PTS · +800 COINS', '#ffd24a');
  Sound.sfxFanfare(true); Sound.sfxBoom();
  for (const m of missiles) if (m.enemy) { explode(m.x, m.y, m.z, 0.5); removeMissile(m); }
  missiles = missiles.filter(m => !m.dead);
  bullets = bullets.filter(b => !b.enemy);
  for (const b of bots) { explode(b.x, b.y, b.z, 1); removeBot(b); b.dead = true; }
  bots = [];
  for (const t of B.parts) if (!t.dead) { t.dead = true; wreckTurret(t); }
  garage.coins += 800; saveGarage();
  nextBossAt = 1e9;
  CG.happytime();
}
