// ================= STAGE 5 BOSS: SKY SERPENT =================
// A long cloud dragon. Its hide is armored: break the 5 glowing scales on its back first,
// then the whole body is open (head hits do double). It breathes fire, dives into the cloud
// sea and bursts up under you, and in phase 2 calls lightning and sheds razor scales.
// Flying into its body is a collision: a whole heart.
let serpentPhase = "none", serpentT = 0, serpentSlain = false;
const serpentLock = () => serpentPhase === "intro" || serpentPhase === "fight";
const SERP = { N: 20, SP: 4.4, CORES: [3, 6, 9, 12, 15] };
const serpMat = {
  hide: M(0x1f8a7a, { roughness: 0.45, metalness: 0.15 }),
  hideDark: M(0x14574f, { roughness: 0.5 }),
  belly: M(0xffd27a, { roughness: 0.6 }),
  fin: M(0xff5c8a, { roughness: 0.4 }),
  horn: M(0xf4ecd8, { roughness: 0.35 }),
  eye: M(0xffe24a, { emissive: 0xffb000, emissiveIntensity: 3 }),
  core: M(0x7ff3ff, { emissive: 0x39d0ff, emissiveIntensity: 2.6 }),
};
const mouthMat = new THREE.MeshBasicMaterial({ color: 0xff8a2d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

function makeSerpentHead() {
  const g = new THREE.Group();
  part(G.sph, serpMat.hide, 4.2, 2.5, 2.8, 0, 0, 0, g);
  part(G.sph, serpMat.hide, 3, 1.5, 2, 3.6, -0.2, 0, g);                  // snout
  part(G.sph, serpMat.belly, 3.2, 0.9, 1.8, 3, -1.3, 0, g);               // lower jaw
  for (const sd of [-1, 1]) {
    part(G.sph, serpMat.eye, 0.55, 0.55, 0.55, 2.6, 0.9, sd * 1.45, g);
    const h = part(G.cone, serpMat.horn, 0.5, 4.2, 0.5, -1.6, 2.2, sd * 1.2, g); h.rotation.z = 1.15; h.rotation.x = -sd * 0.35;
    const w = part(G.cyl, serpMat.fin, 0.08, 5, 0.08, 5.2, -0.4, sd * 1.1, g); w.rotation.z = 1.35; w.rotation.x = sd * 0.5;   // whiskers
  }
  for (let k = 0; k < 4; k++) { const c = part(G.cone, serpMat.fin, 0.45, 1.6 - k * 0.2, 0.45, 0.8 - k * 1.3, 2.3 - k * 0.2, 0, g); c.rotation.z = 0.5; }
  const mouth = new THREE.Mesh(G.sph, mouthMat); mouth.position.set(5.6, -0.7, 0); g.add(mouth);
  g.userData = { mouth };
  scene.add(g);
  return g;
}
function makeSerpentSeg(i) {
  const t = i / (SERP.N - 1), r = 3.1 - t * 2.1, g = new THREE.Group();
  part(G.sph, i % 2 ? serpMat.hide : serpMat.hideDark, r * 1.25, r, r, 0, 0, 0, g);
  part(G.sph, serpMat.belly, r * 1.1, r * 0.55, r * 0.8, 0, -r * 0.55, 0, g);
  const sp = part(G.cone, serpMat.fin, r * 0.25, r * 0.9, r * 0.25, 0, r * 1.05, 0, g); sp.rotation.z = 0.4;
  if (i === 2 || i === 9) for (const sd of [-1, 1]) {   // flowing fins
    const f = part(G.box, serpMat.fin, r * 1.6, 0.15, r * 2.2, -r * 0.4, 0, sd * r * 1.4, g); f.rotation.x = sd * 0.5; f.rotation.y = sd * 0.3;
  }
  if (i === SERP.N - 1) { const f = part(G.box, serpMat.fin, 4, 0.2, 5, -3, 0, 0, g); f.rotation.x = Math.PI / 2; }   // tail fan
  let core = null;
  if (SERP.CORES.includes(i)) { core = new THREE.Group(); part(G.sph, serpMat.core, 1.35, 1.35, 1.35, 0, 0, 0, core); core.position.set(0, r * 0.95, 0); g.add(core); }
  scene.add(g);
  return { g, r, x: 0, y: 0, z: 0, core };
}

function updateSerpentFlow(dt) {
  if (serpentPhase === "intro" && (serpentT -= dt) <= 0) { serpentPhase = "fight"; hideCine(); spawnSerpent(); }
}
function startSerpentIntro() {
  serpentPhase = "intro"; serpentT = 3;
  $("bossWarn").classList.add("hidden"); bossWarnT = 0;
  let n = 0;
  for (const b of bots) b.dead || (b.dead = true, explode(b.x, b.y, b.z, 1.1), removeBot(b), n++);
  bots = [];
  for (const m of missiles) m.enemy && removeMissile(m);
  missiles = missiles.filter(m => !m.dead); bullets = bullets.filter(b => !b.enemy);
  n && (killPts += n * 100, popup(player.x, player.y + 4, player.z, "SKY CLEARED +" + n * 100, true));
  Object.assign(player, { hp: maxHp(), ammo: maxAmmo(), missiles: Math.min(maxMsl(), Math.max(player.missiles, 6)), flares: Math.min(maxFlr(), player.flares + 3), invul: 4 });
  shockwave(player.x, player.y, player.z, 110, 0xffffff, 1); shake = 0.5; hitStop(0.9, 0.2); killFlash();
  Sound.sfxSiren(); Sound.tone(70, 2.2, "sawtooth", 0.12, 40); Sound.noise(2, 0.12, 300);
  setCine("STAGE " + stage + " &middot; BOSS", "SKY SERPENT", "BREAK THE GLOWING SCALES &mdash; THEN GO FOR THE HEAD");
  showCine(); updateHud(true);
}
function spawnSerpent() {
  const f = fwdOf(player), ex = clamp(player.x + f[0] * 110, -MAP + 40, MAP - 40), ez = clamp(player.z + f[2] * 110, -MAP + 40, MAP - 40);
  const pw = gunDmg() * planeNow().guns, coreHp = Math.round(8 + 5 * pw), max = Math.round(70 + 45 * pw);
  const B = boss = {
    serpent: true, boss: true, x: ex, y: -30, z: ez, a: Math.atan2(player.z - ez, player.x - ex), p: 1.2, roll: 0, h: [0, 1, 0],
    hp: max, max, scale: 3, pts: 20000, phase: 1, intro: 2.2, mode: "rise", modeT: 0, orbitA: rand(0, 6.3), orbitDir: Math.random() < 0.5 ? -1 : 1,
    breathCd: 5, diveCd: 14, chargeCd: 9, shardCd: 5, boltCd: 3, breathT: 0, fireT: 0, blockMsgT: 0, dying: 0, dead: false,
    trail: [], segs: [], parts: [], mesh: makeSerpentHead(),
  };
  for (let i = 0; i < SERP.N; i++) B.segs.push(makeSerpentSeg(i));
  for (let k = 0; k < SERP.N * SERP.SP / 0.5 + 8; k++) B.trail.push({ x: ex, y: -30 - (SERP.N * SERP.SP) + k * 0.5, z: ez });   // coiled straight down under the clouds
  for (const i of SERP.CORES) {
    const s = B.segs[i], t = { x: 0, y: 0, z: 0, hp: coreHp, sCore: true, seg: i, mesh: s.core, scale: 1.4, hitR: 3.2, pts: 400, dead: false, cd: 0 };
    B.parts.push(t); turrets.push(t);
  }
  scene.add(B.mesh);
  $("bossName").textContent = "SKY SERPENT · SCALES 5/5"; $("bossFill").style.width = "100%";
  $("bossBar").classList.remove("titan", "ace", "shield"); $("bossBar").classList.remove("hidden");
  banner("SKY SERPENT", "BREAK THE GLOWING SCALES", "#7ff3ff");
  Sound.sfxBoom(); Sound.tone(55, 1.6, "sawtooth", 0.2, 35); Sound.tone(220, 1.2, "square", 0.05, 90);
  for (let i = 0; i < 40; i++) addPart(ex + rand(-8, 8), 1, ez + rand(-8, 8), rand(-10, 10), rand(10, 30), rand(-10, 10), rand(0.8, 1.4), rand(0.8, 1.6), 0xffffff, 0.5, 18);
  shockwave(ex, 1, ez, 40, 0xffffff, 0.8);
}

// signed distance from o to the serpent's body (negative = inside)
function serpentDist(o) {
  const B = boss;
  if (Math.abs(o.x - B.x) > 140 || Math.abs(o.z - B.z) > 140) return 99;
  let d = dist3(o, B) - 3.2;
  for (const s of B.segs) { const e = Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z) - s.r; if (e < d) d = e; }
  return d;
}
const serpentTargetable = () => boss && boss.serpent && boss.phase >= 2;
function serpentBar() {
  const B = boss; if (!B) return;
  if (B.phase === 1) {
    const left = B.parts.filter(t => !t.dead);
    $("bossName").textContent = "SKY SERPENT · SCALES " + left.length + "/" + B.parts.length;
    const tot = B.parts.reduce((a, t) => a + (t.max0 || t.hp), 0), now = left.reduce((a, t) => a + Math.max(0, t.hp), 0);
    $("bossFill").style.width = (tot ? now / tot * 100 : 0).toFixed(1) + "%";
  } else $("bossFill").style.width = Math.max(0, B.hp / B.max * 100).toFixed(1) + "%";
}
// hits on the body: armored until the scales are gone; the head takes double after that
function serpentHit(dmg, at) {
  const B = boss;
  if (B.phase === 1) {
    for (let i = 0; i < 4; i++) addPart(at.x, at.y, at.z, rand(-6, 6), rand(-3, 6), rand(-6, 6), 0.3, 0.4, 0x7ff3ff);
    Sound.tone(1400, 0.03, "triangle", 0.03, 900);
    if (B.blockMsgT <= 0) { B.blockMsgT = 2.5; popup(at.x, at.y + 3, at.z, "ARMORED · HIT THE GLOWING SCALES"); }
    return;
  }
  const head = dist3(at, B) < 7;
  if (head) { dmg *= 2; if (Math.random() < 0.3) popup(B.x, B.y + 4, B.z, "HEAD x2"); }
  B.hp -= dmg;
  for (let i = 0; i < 5; i++) addPart(at.x, at.y, at.z, rand(-6, 6), rand(-3, 6), rand(-6, 6), 0.35, 0.45, i % 2 ? 0xffe24a : 0xffffff);
  B.hp > 0 && hitFx(B, dmg, at);
  serpentBar();
  B.hp <= 0 && killSerpent();
}
function serpentCoreHit(t, dmg) {
  const B = boss;
  if (t.dead || !B || !B.serpent || B.dead || B.intro > 0) return;
  t.hpMax == null && (t.hpMax = t.hp); t.hp -= dmg;
  for (let i = 0; i < 6; i++) addPart(t.x, t.y, t.z, rand(-6, 6), rand(0, 8), rand(-6, 6), 0.35, 0.4, i % 2 ? 0x7ff3ff : 0xffffff);
  if (t.hp > 0) { hitFx(t, dmg); serpentBar(); return; }
  t.dead = true; kills++; awardKill(t.x, t.y, t.z, t.pts); t.mesh.visible = false;
  explode(t.x, t.y, t.z, 1.6); shockwave(t.x, t.y, t.z, 20, 0x7ff3ff, 0.5); hitStop(0.25, 0.2); shake = Math.max(shake, 0.35);
  Sound.sfxBoom(); Sound.tone(90, 0.7, "sawtooth", 0.14, 45);
  const left = B.parts.filter(q => !q.dead).length;
  popup(t.x, t.y + 5, t.z, left ? "SCALE BROKEN · " + left + " LEFT" : "ALL SCALES BROKEN", true);
  spawnPickup("ammo", t.x, t.z, clampAlt(t.y));
  if (!left) {
    B.phase = 2; B.mode = "swim"; B.modeT = 0; B.chargeCd = 3; B.boltCd = 2; B.shardCd = 4;
    $("bossName").textContent = "SKY SERPENT · ENRAGED";
    banner("HEAD EXPOSED", "THE SERPENT IS ENRAGED", "#ff5c8a");
    hitStop(0.4, 0.2); Sound.sfxSiren(); Sound.tone(50, 1.8, "sawtooth", 0.22, 30);
    spawnPickup("missile"); spawnPickup("ammo");
  }
  serpentBar(); updateHud(true);
}
function serpentBolt(x, z) {
  const mesh = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
  mesh.position.set(x, 85, z); scene.add(mesh);
  HZ.bolts.push({ x, z, t: 1.4, mesh, fired: false });
}
function serpentFire(B, spread, n, spd, life) {   // a cone of fire from the mouth toward the player
  const hx = B.x + B.h[0] * 6, hy = B.y + B.h[1] * 6, hz = B.z + B.h[2] * 6;
  const dx = player.x - hx, dy = player.y - hy, dz = player.z - hz, d = Math.hypot(dx, dy, dz) || 1, ya = Math.atan2(dz, dx), pa = Math.asin(clamp(dy / d, -1, 1));
  for (let i = 0; i < n && bullets.length < MAXB; i++) {
    const a = ya + rand(-spread, spread), p = pa + rand(-spread, spread) * 0.6;
    bullets.push({ x: hx, y: hy, z: hz, vx: Math.cos(a) * Math.cos(p) * spd, vy: Math.sin(p) * spd, vz: Math.sin(a) * Math.cos(p) * spd, life, enemy: true, src: "SERPENT FIRE", profile: "fire", r: 2 });
  }
}

function updateSerpent(dt, hostile) {
  const B = boss, ud = B.mesh.userData;
  B.blockMsgT -= dt;
  if (B.lapScaled && !B.coreMaxSet) { B.coreMaxSet = true; for (const t of B.parts) t.max0 = t.hp; serpentBar(); }
  if (B.dead) {   // the body breaks apart from the tail up, then the head falls
    B.dying -= dt; B.deathT = (B.deathT || 0) - dt;
    if (B.deathT <= 0 && B.segs.length) {
      B.deathT = 0.11; const s = B.segs.pop();
      explode(s.x, s.y, s.z, 1.2 + s.r * 0.2); scene.remove(s.g); Sound.sfxBoom();
    }
    if (!B.segs.length) { B.y -= dt * 18; B.mesh.position.set(B.x, B.y, B.z); B.mesh.rotation.z -= dt * 1.5; Math.random() < 0.6 && addPart(B.x, B.y, B.z, rand(-2, 2), 3, rand(-2, 2), 0.9, 1.4, 0x3a3f55, 1.4); }
    if (B.dying <= 0 || (!B.segs.length && B.y < -5)) {
      explode(B.x, Math.max(B.y, 1), B.z, 3.2); shockwave(B.x, Math.max(B.y, 1), B.z, 70, 0xffffff, 1); shake = 0.7; killFlash();
      for (const s of B.segs) scene.remove(s.g);
      scene.remove(B.mesh);
      turrets = turrets.filter(t => !t.sCore);
      boss = null; serpentPhase = "done";
      state === "playing" && (spawnPickup("missile"), spawnPickup("ammo"));
    }
    return;
  }
  const ph2 = B.phase >= 2, engaged = hostile && player.alive && !playerHidden() && state === "playing";
  B.intro > 0 && (B.intro -= dt);
  if (B.stun > 0) B.stun -= dt;
  const dx = player.x - B.x, dy = player.y - B.y, dz = player.z - B.z, d = Math.hypot(dx, dy, dz) || 1;
  const baseSpd = Math.max(22, playerSpeed() * 0.88) * (ph2 ? 1.12 : 1);
  let tx, ty, tz, spd = baseSpd, turn = ph2 ? 1.9 : 1.5;
  B.modeT -= dt;
  // ---- choose what to do ----
  if (B.mode === "swim" && engaged && B.intro <= 0) {
    B.breathCd -= dt; B.diveCd -= dt; ph2 && (B.chargeCd -= dt);
    if (B.breathCd <= 0 && d < 110 && B.y > 6) { B.mode = "breath"; B.modeT = 2.8; B.breathCd = ph2 ? rand(6, 8) : rand(8, 10); Sound.tone(110, 1, "sawtooth", 0.1, 260); popup(B.x, B.y + 5, B.z, "INHALING..."); }
    else if (B.diveCd <= 0) { B.mode = "dive"; B.modeT = 9; B.diveCd = ph2 ? rand(13, 16) : rand(16, 20); B.diveStep = 0; }
    else if (ph2 && B.chargeCd <= 0 && d > 40 && d < 120) { B.mode = "charge"; B.modeT = 2.4; B.chargeCd = rand(9, 12); banner("SERPENT CHARGE", "GET OUT OF ITS PATH", "#ff5c8a"); Sound.sfxSiren(); }
  }
  // ---- steering target per mode ----
  if (B.mode === "rise") {   // bursting out of the cloud sea
    tx = B.x + Math.cos(B.a) * 8; tz = B.z + Math.sin(B.a) * 8; ty = player.y + 25; spd = 42; turn = 1.2;
    if (B.y > player.y + 12 || B.modeT < -4) B.mode = "swim";
  } else if (B.mode === "breath") {
    tx = player.x; ty = player.y; tz = player.z; spd = baseSpd * 0.45; turn = 2.4;
    const charging = B.modeT > 1.6;
    mouthMat.opacity = charging ? (1 - (B.modeT - 1.6) / 1.2) * 0.8 : 0.9; ud.mouth.scale.setScalar(charging ? 1 + (1 - (B.modeT - 1.6) / 1.2) * 1.5 : 2.2 + Math.sin(time * 40) * 0.3);
    if (!charging && engaged && (B.fireT -= dt) <= 0) { B.fireT = 0.07; serpentFire(B, ph2 ? 0.3 : 0.24, ph2 ? 4 : 3, 36, 2.6); if (Math.random() < 0.3) Sound.noise(0.15, 0.12, 500); }
    if (B.modeT <= 0) { B.mode = "swim"; mouthMat.opacity = 0; }
  } else if (B.mode === "dive") {
    if (B.diveStep === 0) {   // plunge under the clouds
      tx = B.x + Math.cos(B.a) * 30; tz = B.z + Math.sin(B.a) * 30; ty = -45; spd = baseSpd * 1.2; turn = 2.2;
      if (B.y < -28) {
        const f = fwdOf(player), lead = playerSpeed() * 2.2;
        B.ex = clamp(player.x + f[0] * lead, -MAP + 30, MAP - 30); B.ez = clamp(player.z + f[2] * lead, -MAP + 30, MAP - 30);
        B.diveStep = 1; B.warnT = 1.6; toast("THE CLOUDS ARE CHURNING BELOW YOU");
      }
    } else if (B.diveStep === 1) {   // circle underneath the strike point while the surface churns
      tx = B.ex; tz = B.ez; ty = -50; spd = baseSpd * 2.2; turn = 4;
      B.warnT -= dt;
      if (Math.random() < 0.7) addPart(B.ex + rand(-10, 10), 1, B.ez + rand(-10, 10), rand(-4, 4), rand(4, 12), rand(-4, 4), 0.6, rand(0.8, 1.4), 0xffffff, 0.6, 10);
      if (Math.floor(B.warnT * 3) !== Math.floor((B.warnT + dt) * 3)) { shockwave(B.ex, 1, B.ez, 14, 0xff5c8a, 0.4); Sound.tone(300, 0.1, "square", 0.05); }
      if (B.warnT <= 0) { B.diveStep = 2; B.x = B.ex; B.z = B.ez; B.y = Math.min(B.y, -30); B.h = [0, 1, 0]; Sound.sfxBoom(); Sound.tone(60, 1, "sawtooth", 0.2, 30); }
    } else {   // straight up through the mark
      tx = B.x; tz = B.z; ty = ALT_MAX + 20; spd = 60; turn = 0.3;
      if (B.y > -1 && !B.splashed) { B.splashed = true; shockwave(B.x, 1, B.z, 30, 0xffffff, 0.7); for (let i = 0; i < 40; i++) addPart(B.x + rand(-5, 5), 1, B.z + rand(-5, 5), rand(-12, 12), rand(15, 35), rand(-12, 12), rand(0.8, 1.4), rand(0.8, 1.6), 0xffffff, 0.5, 18); }
      if (B.y > player.y + 22 || B.modeT <= 0) { B.mode = "swim"; B.splashed = false; }
    }
  } else if (B.mode === "charge") {
    const lunge = B.modeT < 1.6;
    tx = player.x; ty = player.y; tz = player.z; spd = lunge ? Math.max(48, playerSpeed() * 1.7) : baseSpd * 0.3; turn = lunge ? 1.1 : 3;
    lunge || Math.random() < 0.5 && addPart(B.x, B.y, B.z, rand(-6, 6), rand(-6, 6), rand(-6, 6), 0.3, 0.8, 0xff5c8a, 0.5);
    if (B.modeT <= 0 || (lunge && d < 8)) B.mode = "swim";
  } else {   // swim: orbit the player through the clouds, weaving up and down
    B.orbitA += dt * (ph2 ? 0.42 : 0.32) * B.orbitDir;
    const R = ph2 ? 62 : 78;
    tx = player.x + Math.cos(B.orbitA) * R; tz = player.z + Math.sin(B.orbitA) * R;
    ty = clamp(player.y + Math.sin(time * 0.8) * 16, 12, ALT_MAX - 6);
  }
  if (B.mode !== "dive" && B.mode !== "rise") ty = Math.max(ty, 10);
  tx = clamp(tx, -MAP + 20, MAP - 20); tz = clamp(tz, -MAP + 20, MAP - 20);
  // ---- steer the head (3D heading, limited turn rate) ----
  const ex = tx - B.x, ey = ty - B.y, ez = tz - B.z, el = Math.hypot(ex, ey, ez) || 1, k = Math.min(1, turn * dt);
  B.h = [B.h[0] + (ex / el - B.h[0]) * k, B.h[1] + (ey / el - B.h[1]) * k, B.h[2] + (ez / el - B.h[2]) * k];
  const hl = Math.hypot(...B.h) || 1; B.h = B.h.map(v => v / hl);
  if (B.stun > 0) spd *= 0.3;
  B.x += B.h[0] * spd * dt; B.y += B.h[1] * spd * dt; B.z += B.h[2] * spd * dt;
  B.y = Math.min(B.y, ALT_MAX + 25);
  B.a = Math.atan2(B.h[2], B.h[0]); B.p = Math.asin(clamp(B.h[1], -1, 1));
  B.mesh.position.set(B.x, B.y, B.z); B.mesh.rotation.set(0, -B.a, B.p, "YZX");
  B.mesh.rotation.x = Math.sin(time * 3) * 0.12;
  // ---- body follows the head's path ----
  const last = B.trail[B.trail.length - 1];
  if (!last || Math.hypot(B.x - last.x, B.y - last.y, B.z - last.z) >= 0.5) B.trail.push({ x: B.x, y: B.y, z: B.z });
  const keep = Math.ceil(SERP.N * SERP.SP / 0.5) + 30;
  B.trail.length > keep && B.trail.splice(0, B.trail.length - keep);
  let j = B.trail.length - 1, acc = 0, px = B.x, py = B.y, pz = B.z;
  for (let i = 0; i < B.segs.length; i++) {
    const want = (i + 1) * SERP.SP + 1.5;
    while (j > 0) {
      const q = B.trail[j], L = Math.hypot(q.x - px, q.y - py, q.z - pz);
      if (acc + L >= want) { const u = (want - acc) / (L || 1); px += (q.x - px) * u; py += (q.y - py) * u; pz += (q.z - pz) * u; acc = want; break; }
      acc += L; px = q.x; py = q.y; pz = q.z; j--;
    }
    const s = B.segs[i], prev = i ? B.segs[i - 1] : B;
    s.x = px; s.y = py; s.z = pz;
    const fx = prev.x - px, fy = prev.y - py, fz = prev.z - pz;
    s.g.position.set(px, py, pz); s.g.rotation.set(0, -Math.atan2(fz, fx), Math.atan2(fy, Math.hypot(fx, fz)), "YZX");
    s.g.rotation.x = Math.sin(time * 3 - i * 0.45) * 0.25;
    if (s.core) s.core.children[0].scale.setScalar(1.35 * (1 + Math.sin(time * 6 + i) * 0.1));
  }
  for (const t of B.parts) { const s = B.segs[t.seg]; t.x = s.x; t.y = s.y + s.r * 0.95; t.z = s.z; }
  // ---- phase 2 extras: lightning around you, razor scales from the body ----
  if (ph2 && engaged && B.intro <= 0) {
    if ((B.boltCd -= dt) <= 0) {
      B.boltCd = rand(3.5, 5.5); const f = fwdOf(player), lead = playerSpeed() * 1.3;
      for (let i = 0; i < 2; i++) serpentBolt(clamp(player.x + f[0] * lead + rand(-18, 18), -MAP + 10, MAP - 10), clamp(player.z + f[2] * lead + rand(-18, 18), -MAP + 10, MAP - 10));
      Sound.tone(80, 1, "sawtooth", 0.1, 50);
    }
    const above = B.segs.filter(s => s.y > 4);   // shards from under the clouds would die instantly
    if ((B.shardCd -= dt) <= 0 && d < 120 && above.length > 4) {
      B.shardCd = rand(5, 7);
      for (const s of above) if (Math.random() < 0.4) for (let q = 0; q < 6 && bullets.length < MAXB; q++) {
        const a = q / 6 * Math.PI * 2 + rand(0, 1), up = rand(-0.4, 0.4);
        bullets.push({ x: s.x, y: s.y, z: s.z, vx: Math.cos(a) * 22, vy: up * 22, vz: Math.sin(a) * 22, life: 2.4, enemy: true, src: "SCALE SHARD", profile: "orb", r: 1.6 });
      }
      popup(B.x, B.y + 5, B.z, "SCALE STORM"); Sound.noise(0.4, 0.2, 2500);
    }
  }
  // trailing mist
  if (Math.random() < 0.6) { const s = B.segs[(Math.random() * B.segs.length) | 0]; addPart(s.x, s.y, s.z, 0, 0.5, 0, 0.9, s.r * 0.6, 0xe8f7ff, 0.8); }
}
function killSerpent() {
  const B = boss;
  gainXp(250);
  B.dead = true; B.dying = 4; B.deathT = 0; bossCount++; kills++; serpentSlain = true;
  bossHeart(B, 1); mouthMat.opacity = 0;
  awardKill(B.x, B.y + 4, B.z, B.pts, true);
  $("bossBar").classList.add("hidden");
  shake = 0.6; hitStop(1.4, 0.15); killFlash();
  banner("SERPENT SLAIN", "+20000 PTS · +600 COINS", "#ffd24a");
  Sound.sfxFanfare(true); Sound.sfxBoom(); Sound.tone(45, 2.2, "sawtooth", 0.2, 25);
  for (const m of missiles) m.enemy && (explode(m.x, m.y, m.z, 0.5), removeMissile(m));
  missiles = missiles.filter(m => !m.dead); bullets = bullets.filter(b => !b.enemy);
  for (const t of B.parts) t.dead = true;
  garage.coins += 600; saveGarage(); CG.happytime();
}
