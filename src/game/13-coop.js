// ================= STINGER CO-OP: FRONT pilot + REAR gunner =================
// The FRONT device runs the real game in a STINGER and streams a compact snapshot of the world
// 15x a second. The REAR device draws that world from the gunner's seat, aims the tail gun
// freely and sends each shot to FRONT, where it becomes a real bullet that can hit things.
const COOP_HZ = 15, PROF = ["ballistic", "cannon", "rotary", "laser", "ion", "plasma", "bio", "grav", "orb", "fire", "beam", "balanced"];
const coop = {
  seat: null, sendT: 0, n: 0, nid: 0, looks: new Set(), fx: [], ev: [], gunBul: new Map(), hm: 0,
  aim: { y: 0, p: 0 }, fireCd: 0, snapA: null, snapB: null, atA: 0, atB: 0,
  mb: new Map(), mm: new Map(), mp: new Map(), mt: new Map(), mboss: null, bb: "", theme: -1, dn: false,
};
const cid = o => o.nid || (o.nid = ++coop.nid);
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
const bossKind = B => B.serpent ? "serpent" : B.titan ? "titan" : B.ace ? "ace" : B.carrier ? "carrier" : "fortress";

function startCoop(seat) {
  coop.seat = seat;
  Net.savedPlane = garage.plane; garage.plane = "viper"; applyLook();   // both seats share one STINGER
  if (seat === "front") {
    const warp = window.__warpStage; window.__warpStage = 0;
    try { startRun(); } finally { window.__warpStage = warp; }
    netGame = "coop";
    Object.assign(coop, { sendT: 0, n: 0, looks: new Set(), fx: [], ev: [], gunBul: new Map(), hm: 0 });
    $("coopTag").textContent = "REAR GUNNER: " + (Net.partner ? Net.partner.name : "ONLINE"); $("coopTag").classList.remove("hidden");
  } else startCoopGunner();
}
function coopEnd() {
  coopClearMirror();
  document.body.classList.remove("gunner");
  if (Net.savedPlane) { garage.plane = Net.savedPlane; Net.savedPlane = null; applyLook(); }
  coop.seat = null;
}

// ---------- FRONT: stream the world ----------
function coopSnap() {
  const P = player, s = { t: "s", n: ++coop.n, st: state, th: themeNow, dn: dnArena ? 1 : 0,
    p: [r1(P.x), r1(P.y), r1(P.z), r3(P.a), r3(P.p || 0), r3((P.roll || 0) + (P.rollFx || 0))], al: P.alive ? 1 : 0, iv: P.invul > 0 ? 1 : 0,
    hp: P.hp, mh: maxHp(), am: P.ammo, ms: P.missiles, fl: P.flares, gt: r1(gameTime), kp: killPts, kl: kills, lb: directorLabel(), hm: coop.hm };
  coop.hm = 0;
  const near = (o, R) => Math.abs(o.x - P.x) < R && Math.abs(o.z - P.z) < R;
  const Rn = dnArena ? 900 : 300;
  // fighters (+ their look the first time we see them)
  const lk = [];
  s.b = bots.filter(b => !b.dead && near(b, Rn)).map(b => {
    const id = cid(b);
    if (!coop.looks.has(id) && b.mesh.userData.look) { coop.looks.add(id); lk.push([id, ...b.mesh.userData.look, r3(b.mesh.scale.x)]); }
    return [id, r1(b.x), r1(b.y), r1(b.z), r3(b.a), r3(b.p || 0), r3((b.roll || 0) + (b.rollFx || 0))];
  });
  lk.length && (s.lk = lk);
  // boss
  if (boss && boss.mesh) {
    const B = boss, m = B.mesh, q = m.quaternion, bd = m.userData.body;
    B.nid || (B.nid = ++coop.nid);
    s.bs = { k: bossKind(B), id: B.nid, x: r1(m.position.x), y: r1(m.position.y), z: r1(m.position.z), q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)], s: r3(m.scale.x), v: m.visible ? 1 : 0, d: B.dead ? 1 : 0 };
    bd && (s.bs.bq = [r3(bd.quaternion.x), r3(bd.quaternion.y), r3(bd.quaternion.z), r3(bd.quaternion.w)]);
    B.ace && (s.bs.sh = m.userData.shield && m.userData.shield.visible ? 1 : 0);
    if (B.serpent) { s.bs.sg = B.segs.flatMap(g => [r1(g.x), r1(g.y), r1(g.z)]); s.bs.co = B.segs.map(g => g.core ? (B.parts.find(t => t.seg === B.segs.indexOf(g)) || {}).dead ? 0 : 1 : 0); }
  }
  // turrets (a couple of times a second)
  if (coop.n % 6 === 1) s.tu = turrets.filter(t => !t.sCore && t.mesh && near(t, Rn)).map(t => { const mp = t.mesh.position; return [cid(t), r1(mp.x), r1(mp.y), r1(mp.z), t.dead ? 1 : 0, t.dnKind || "std", r3(t.mesh.scale.x), r3(t.mesh.rotation.x)]; });
  s.pk = pickups.filter(p => near(p, 240)).map(p => [cid(p), p.type, r1(p.x), r1(p.y), r1(p.z)]);
  s.ml = missiles.filter(m => !m.dead && near(m, Rn)).slice(0, 30).map(m => [cid(m), r1(m.x), r1(m.y), r1(m.z), Math.round(m.vx), Math.round(m.vy), Math.round(m.vz), m.enemy ? 1 : 0]);
  // bullets near the plane, except the gunner's own (it draws those itself)
  const bl = [];
  let nb = 0;
  for (const b of bullets) {
    if (nb >= 110 || b.gun || b.ghost || b.life <= 0 || !near(b, 170)) continue;
    const pc = PROF.indexOf(b.profile);
    bl.push(Math.round(b.x), Math.round(b.y), Math.round(b.z), Math.round(b.vx), Math.round(b.vy), Math.round(b.vz), b.enemy ? 1 : 0, pc < 0 ? 0 : pc); nb++;
  }
  s.bl = bl;
  if (isSpace() && coop.n % 8 === 2) s.rk = ROCKS.map((r, i) => near(r, 320) ? [i, r1(r.x), r1(r.y), r1(r.z)] : null).filter(Boolean);
  const bo = HZ.bolts.filter(b => !b._sent); bo.forEach(b => b._sent = 1); bo.length && (s.bo = bo.map(b => [r1(b.x), r1(b.z)]));
  coop.fx.length && (s.fx = coop.fx.splice(0, 24));
  coop.ev.length && (s.ev = coop.ev.splice(0));
  const bar = $("bossBar"), bb = [bar.classList.contains("hidden") ? 0 : 1, $("bossName").textContent, $("bossFill").style.width, bar.className].join("|");
  bb !== coop.bb && (coop.bb = bb, s.bb = bb);
  Net.send(s);
}
// the gunner's shot: two real bullets out of the tail, in the gunner's aim
function coopGunnerFire(d) {
  if (state !== "playing" || !player.alive) return;
  const dir = coopAimDir(player, d.y, d.p), f = fwdOf(player), v = playerSpeed(), spd = 80;
  for (const sd of [-.8, .8]) {
    if (bullets.length >= MAXB) break;
    const b = { x: player.x - f[0] * 3 - Math.sin(player.a) * sd, y: player.y - f[1] * 3 + .4, z: player.z - f[2] * 3 + Math.cos(player.a) * sd,
      vx: dir[0] * spd + f[0] * v, vy: dir[1] * spd + f[1] * v, vz: dir[2] * spd + f[2] * v, life: 1.2, enemy: !1, gun: !0, profile: "laser" };
    bullets.push(b); coop.gunBul.set(b, b.life);
  }
  Sound.tone(700, .04, "square", .03, 380);
}
const coopAimDir = (P, ay, ap) => { const yw = P.a + Math.PI + ay, pt = clamp(-(P.p || 0) + ap, -1.4, 1.4); return [Math.cos(yw) * Math.cos(pt), Math.sin(pt), Math.sin(yw) * Math.cos(pt)]; };
function updateCoopPilot(dt) {
  // gunner bullets that vanished early hit something: tell the gunner (hit marker)
  for (const [b, life] of coop.gunBul) if (!bullets.includes(b)) { life > .08 && coop.hm++; coop.gunBul.delete(b); } else coop.gunBul.set(b, b.life);
  if (state !== "over" && (coop.sendT -= dt) <= 0) { coop.sendT = 1 / COOP_HZ; coopSnap(); }
}

// ---------- REAR: draw the pilot's world ----------
function startCoopGunner() {
  clearWorld(); clearInput(); resetSpecial();
  netGame = "coop"; state = "mirror"; netHpMax = 0;
  coopClearMirror();
  Object.assign(coop, { aim: { y: 0, p: .1 }, fireCd: 0, snapA: null, snapB: null, theme: -1, dn: false, bb: "" });
  Object.assign(player, { x: 0, y: ALT, z: 0, a: -Math.PI / 2, p: 0, roll: 0, rollFx: 0, alive: true, invul: 0 });
  player.mesh.visible = true;
  showOnly(null); setHud(true);
  for (const id of ["weaponBtns", "btnSpecial", "btnAds", "thrBtns", "flt"]) $(id) && $(id).classList.add("hidden");
  document.body.classList.add("gunner"); $("gunSight").classList.remove("hidden");
  $("hint").innerHTML = IS_TOUCH ? "REAR GUNNER &middot; DRAG to aim &middot; FIRE to shoot" : "REAR GUNNER &middot; Mouse / WASD to aim &middot; CLICK / SPACE to shoot";
  $("hint").classList.remove("hidden"); setTimeout(() => state === "mirror" && $("hint").classList.add("hidden"), 5000);
  CG.gameplayStart(); snapCamera();
}
function coopClearMirror() {
  for (const o of coop.mb.values()) scene.remove(o.mesh);
  for (const o of coop.mm.values()) scene.remove(o.mesh);
  for (const o of coop.mp.values()) scene.remove(o.mesh);
  for (const o of coop.mt.values()) scene.remove(o.mesh);
  coop.mb.clear(); coop.mm.clear(); coop.mp.clear(); coop.mt.clear();
  coopDropBoss();
  if (coop.dn) { coop.dn = false; dnSetArena(false); }
  if (coop.seat === "rear") { bots = []; missiles = []; pickups = []; turrets = []; bullets = []; }
}
function coopDropBoss() {
  const M = coop.mboss; if (!M) return;
  scene.remove(M.mesh); M.segs && M.segs.forEach(s => scene.remove(s.g));
  coop.mboss = null; boss = null;
}
function coopOnData(d) {
  if (coop.seat === "front") { d.t === "gf" && coopGunnerFire(d); return; }
  if (d.t === "over") { state === "mirror" && coopMirrorOver(d); return; }
  if (d.t !== "s" || state !== "mirror") return;   // after the run ends, stray snapshots are ignored
  // world setting
  if (d.th !== coop.theme && d.th >= 0) { coop.theme = d.th; applyTheme(d.th); resetHazards(); }
  if (!!d.dn !== coop.dn) { coop.dn = !!d.dn; dnSetArena(coop.dn); }
  coop.snapA = coop.snapB; coop.atA = coop.atB; coop.snapB = d; coop.atB = performance.now();
  // HUD numbers from the pilot
  Object.assign(player, { hp: d.hp, ammo: d.am, missiles: d.ms, flares: d.fl, alive: !!d.al });
  netHpMax = d.mh; netLabel = d.lb; gameTime = d.gt; killPts = d.kp; kills = d.kl;
  player.invul = d.iv ? .2 : 0;
  if (d.hm) { flashReticle("hit"); $("gunSight").classList.add("fire"); setTimeout(() => $("gunSight").classList.remove("fire"), 90); Sound.tone(1100, .03, "square", .04); }
  // fighters
  if (d.lk) for (const [id, body, wing, shape, sc] of d.lk) coop.mb.has(id) || coop.mb.set(id, { look: [body, wing, shape, sc] });
  const seen = new Set();
  for (const e of d.b) {
    const [id, x, y, z, a, p, r] = e; seen.add(id);
    let o = coop.mb.get(id);
    if (!o) { o = { look: [0xd64c59, 0xffaa54, "classic", 1.7] }; coop.mb.set(id, o); }
    if (!o.mesh) { o.mesh = makePlane(o.look[0], o.look[1], o.look[2]); o.mesh.scale.setScalar(o.look[3] || o.mesh.scale.x); scene.add(o.mesh); Object.assign(o, { x, y, z, a, p, roll: r, scale: 1, nid: id }); }
    o.from = [o.x, o.y, o.z, o.a, o.p, o.roll]; o.to = [x, y, z, a, p, r];
  }
  for (const [id, o] of coop.mb) if (o.mesh && !seen.has(id)) { scene.remove(o.mesh); coop.mb.delete(id); }
  bots = [...coop.mb.values()].filter(o => o.mesh);
  // boss
  const bs = d.bs;
  if (!bs || (coop.mboss && coop.mboss.id !== bs.id)) coop.mboss && (!bs || coop.mboss.id !== bs.id) && coopDropBoss();
  if (bs && !coop.mboss) coop.mboss = coopMakeBoss(bs);
  if (bs && coop.mboss) {
    const M = coop.mboss;
    M.from = M.to || [bs.x, bs.y, bs.z]; M.to = [bs.x, bs.y, bs.z];
    M.q0 = M.q1 ? M.q1.clone() : new THREE.Quaternion(...bs.q); M.q1 = new THREE.Quaternion(...bs.q);
    M.mesh.scale.setScalar(bs.s || 1); M.mesh.visible = !!bs.v;
    bs.bq && M.mesh.userData.body && M.mesh.userData.body.quaternion.set(...bs.bq);
    M.mesh.userData.shield && (M.mesh.userData.shield.visible = !!bs.sh);
    if (M.segs && bs.sg) { M.sg0 = M.sg1 || bs.sg; M.sg1 = bs.sg; M.segs.forEach((s, i) => s.core && (s.core.visible = !!(bs.co && bs.co[i]))); }
    Object.assign(boss, { x: bs.x, y: bs.y, z: bs.z, dead: !!bs.d });
  }
  // turrets
  if (d.tu) {
    const keep = new Set();
    for (const [id, x, y, z, dead, kind, sc, rx] of d.tu) {
      keep.add(id);
      let t = coop.mt.get(id);
      if (!t) {
        const mesh = kind === "std" || kind === "gun" || kind === "iturret" ? makeTurret() : dnPartMesh(kind);
        mesh.scale.setScalar(sc); mesh.rotation.x = rx; scene.add(mesh);
        t = { mesh, kind, dead: false, scale: 1.2, hp: 1 }; coop.mt.set(id, t);
      }
      t.mesh.position.set(x, y, z); Object.assign(t, { x, y: y + 2, z });
      if (dead && !t.dead) { t.dead = true; t.mesh.userData.head && wreckTurret(t); }
    }
    for (const [id, t] of coop.mt) if (!keep.has(id)) { scene.remove(t.mesh); coop.mt.delete(id); }
    turrets = [...coop.mt.values()];
  }
  // pickups
  const pkSeen = new Set();
  for (const [id, type, x, y, z] of d.pk) {
    pkSeen.add(id);
    let p = coop.mp.get(id);
    if (!p) { const mesh = type === "heart" ? makeHeart() : makeAmmoBox(type === "missile"); scene.add(mesh); p = { type, mesh, t: rand(0, 6) }; coop.mp.set(id, p); }
    Object.assign(p, { x, y, z }); p.mesh.position.set(x, y, z);
  }
  for (const [id, p] of coop.mp) if (!pkSeen.has(id)) { scene.remove(p.mesh); coop.mp.delete(id); }
  pickups = [...coop.mp.values()];
  // missiles
  const mSeen = new Set();
  for (const [id, x, y, z, vx, vy, vz, en] of d.ml) {
    mSeen.add(id);
    let m = coop.mm.get(id);
    if (!m) { m = { mesh: makeMissile(!!en), enemy: !!en, spd: 1 }; scene.add(m.mesh); coop.mm.set(id, m); }
    Object.assign(m, { x, y, z, vx, vy, vz, spd: Math.hypot(vx, vy, vz) || 1, target: en ? player : null });
  }
  for (const [id, m] of coop.mm) if (!mSeen.has(id)) { scene.remove(m.mesh); coop.mm.delete(id); }
  missiles = [...coop.mm.values()];
  // bullets: the pilot's picture of them, plus my own tracers still in flight
  const mine = bullets.filter(b => b.ghost), bl = d.bl;
  for (let i = 0; i + 7 < bl.length; i += 8) mine.push({ x: bl[i], y: bl[i + 1], z: bl[i + 2], vx: bl[i + 3], vy: bl[i + 4], vz: bl[i + 5], life: .5, enemy: !!bl[i + 6], profile: PROF[bl[i + 7]] || "ballistic", r: 1.9 });
  bullets = mine;
  // rocks, lightning, explosions, banners
  if (d.rk) for (const [i, x, y, z] of d.rk) { const r = ROCKS[i]; r && (r.x = x, r.y = y, r.z = z, r.mesh.position.set(x, y, z)); }
  if (d.bo) for (const [x, z] of d.bo) serpentBolt(x, z);
  if (d.fx) for (const [x, y, z, big] of d.fx) { explode(x, y, z, big); big >= .9 && dist3({ x, y, z }, player) < 120 && Sound.sfxBoom(); }
  if (d.ev) for (const e of d.ev) e[0] === "b" ? banner(e[1], e[2], e[3]) : e[0] === "c" ? setCine(e[1], e[2], e[3]) : e[0] === "cs" ? showCine() : e[0] === "ch" && hideCine();
  if (d.bb) { const [vis, name, w, cls] = d.bb.split("|"); const bar = $("bossBar"); bar.className = cls; bar.classList.toggle("hidden", vis !== "1"); $("bossName").textContent = name; $("bossFill").style.width = w; }
  updateHud(true);
}
function coopMakeBoss(bs) {
  const M = { id: bs.id, k: bs.k };
  if (bs.k === "serpent") {
    M.mesh = makeSerpentHead(); M.segs = [];
    for (let i = 0; i < SERP.N; i++) M.segs.push(makeSerpentSeg(i));
  } else {
    M.mesh = bs.k === "titan" ? makeTitan() : bs.k === "ace" ? makeAce() : bs.k === "carrier" ? makeDreadnought() : makeBoss();
    scene.add(M.mesh);
  }
  boss = { mirror: true, [bs.k === "fortress" ? "fortressMirror" : bs.k]: true, x: bs.x, y: bs.y, z: bs.z, a: 0, p: 0, hp: 1, max: 1, phase: 1, parts: [], scale: bs.k === "carrier" ? 30 : 3, mesh: M.mesh, dead: false, segs: M.segs || [] };
  return M;
}
function coopMirrorOver(d) {
  coopClearMirror();   // the "over" state runs the real boss / fighter updates: nothing mirrored may stay behind
  gameTime = d.gt; killPts = d.kp; kills = d.kl; stage = d.stg; wave = d.wv; runCleared = !!d.cl; runCheckpoint = 0; runReached = 0;
  document.body.classList.remove("gunner"); $("gunSight").classList.add("hidden");
  netLabel = ""; setHud(false);
  showOver();
}
function updateCoopGunner(dt) {
  if (state !== "mirror") return;
  // aim with the usual steering inputs (mouse, touch stick, keys)
  readSteer();
  coop.aim.y = clamp(coop.aim.y + steerNow * 2.4 * dt, -1.9, 1.9);
  coop.aim.p = clamp(coop.aim.p + climbNow * 1.6 * dt, -.9, .9);
  // interpolate from the previous snapshot toward the latest one
  const A = coop.snapA, B = coop.snapB;
  if (B) {
    const span = Math.max(30, coop.atB - (coop.atA || coop.atB - 66)), u = clamp((performance.now() - coop.atB) / span, 0, 1.25);
    const pa = (A || B).p, pb = B.p;
    player.x = lerp(pa[0], pb[0], u); player.y = lerp(pa[1], pb[1], u); player.z = lerp(pa[2], pb[2], u);
    player.a = pa[3] + wrapA(pb[3] - pa[3]) * u; player.p = lerp(pa[4], pb[4], u); player.roll = lerp(pa[5], pb[5], u); player.rollFx = 0;
    for (const o of bots) if (o.to) { const f = o.from, t = o.to; o.x = lerp(f[0], t[0], u); o.y = lerp(f[1], t[1], u); o.z = lerp(f[2], t[2], u); o.a = f[3] + wrapA(t[3] - f[3]) * u; o.p = lerp(f[4], t[4], u); o.roll = lerp(f[5], t[5], u); }
    const M = coop.mboss;
    if (M && M.to) {
      const f = M.from, t = M.to;
      M.mesh.position.set(lerp(f[0], t[0], u), lerp(f[1], t[1], u), lerp(f[2], t[2], u));
      M.q0 && M.mesh.quaternion.slerpQuaternions(M.q0, M.q1, Math.min(1, u));
      boss && Object.assign(boss, { x: M.mesh.position.x, y: M.mesh.position.y, z: M.mesh.position.z });
      if (M.segs && M.sg1) {
        const s0 = M.sg0 || M.sg1, s1 = M.sg1;
        M.segs.forEach((s, i) => { s.x = lerp(s0[i * 3], s1[i * 3], u); s.y = lerp(s0[i * 3 + 1], s1[i * 3 + 1], u); s.z = lerp(s0[i * 3 + 2], s1[i * 3 + 2], u); });
        M.segs.forEach((s, i) => {
          const prev = i ? M.segs[i - 1] : { x: M.mesh.position.x, y: M.mesh.position.y, z: M.mesh.position.z }, fx = prev.x - s.x, fy = prev.y - s.y, fz = prev.z - s.z;
          s.g.position.set(s.x, s.y, s.z); s.g.rotation.set(Math.sin(time * 3 - i * .45) * .25, -Math.atan2(fz, fx), Math.atan2(fy, Math.hypot(fx, fz)), "YZX");
        });
      }
    }
  }
  orientPlane(player, dt);
  player.mesh.visible = player.alive;
  // bullets and missiles keep flying between snapshots
  for (const b of bullets) b.x += b.vx * dt, b.y += b.vy * dt, b.z += b.vz * dt, b.life -= dt;
  bullets = bullets.filter(b => b.life > 0);
  for (const m of missiles) m.x += m.vx * dt, m.y += m.vy * dt, m.z += m.vz * dt;
  // the tail gun
  coop.fireCd -= dt;
  if (firing() && coop.fireCd <= 0 && player.alive) {
    coop.fireCd = .12;
    Net.send({ t: "gf", y: r3(coop.aim.y), p: r3(coop.aim.p) });
    const dir = coopAimDir(player, coop.aim.y, coop.aim.p), f = fwdOf(player), v = playerSpeed(), spd = 80;
    for (const sd of [-.8, .8]) bullets.length < MAXB && bullets.push({ x: player.x - f[0] * 3 - Math.sin(player.a) * sd, y: player.y - f[1] * 3 + .4, z: player.z - f[2] * 3 + Math.cos(player.a) * sd,
      vx: dir[0] * spd + f[0] * v, vy: dir[1] * spd + f[1] * v, vz: dir[2] * spd + f[2] * v, life: 1.2, enemy: !1, ghost: !0, profile: "laser" });
    Sound.shot ? Sound.shot("laser", !1) : Sound.sfxShoot();
  }
  updateHud(false);
  const clock = Math.floor(gameTime / 60) + ":" + String(Math.floor(gameTime % 60)).padStart(2, "0");
  $("survivalClock").textContent !== clock && ($("survivalClock").textContent = clock);
  $("threatLabel").textContent !== netLabel && ($("threatLabel").textContent = netLabel);
}
// the gunner's camera: in the rear seat, looking where the tail gun points
function coopGunnerCamera(dt) {
  const d = coopAimDir(player, coop.aim.y, coop.aim.p), f = fwdOf(player);
  camA = Math.atan2(d[2], d[0]); camP = Math.asin(clamp(d[1], -1, 1));
  camPos.set(player.x - f[0] * 1.6, player.y + 1.9, player.z - f[2] * 1.6);
  camLook.set(camPos.x + d[0] * 40, camPos.y + d[1] * 40, camPos.z + d[2] * 40);
  Math.abs(camera.fov - baseFov) > .05 && (camera.fov = baseFov, camera.updateProjectionMatrix());
  camera.position.copy(camPos); shake > 0 && camera.position.add(_v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * .6));
  camera.lookAt(camLook);
  const sy = isSpace() || dnArena ? player.y : 0;
  sun.target.position.set(player.x, sy, player.z); sun.position.set(player.x + 30, sy + 90, player.z + 25);
}
const coopMarks = () => [];
function updateCoop(dt) {
  if (netGame !== "coop") return;
  coop.seat === "front" ? updateCoopPilot(dt) : updateCoopGunner(dt);
}
// FRONT: forward explosions, banners and title cards to the gunner
{
  const _explode = explode;
  explode = function (x, y, z, big = 1, col) { netGame === "coop" && coop.seat === "front" && coop.fx.length < 60 && coop.fx.push([r1(x), r1(y), r1(z), r3(big)]); return _explode(x, y, z, big, col); };
  const _banner = banner;
  banner = function (t, s = "", c = "#ffbb58") { netGame === "coop" && coop.seat === "front" && coop.ev.push(["b", t, s, c]); return _banner(t, s, c); };
  const _setCine = setCine, _showCine = showCine, _hideCine = hideCine;
  setCine = function (a, b, c) { netGame === "coop" && coop.seat === "front" && coop.ev.push(["c", a, b, c]); return _setCine(a, b, c); };
  showCine = function () { netGame === "coop" && coop.seat === "front" && coop.ev.push(["cs"]); return _showCine(); };
  hideCine = function () { netGame === "coop" && coop.seat === "front" && coop.ev.push(["ch"]); return _hideCine(); };
  const _showOver = showOver;
  showOver = function () {
    if (netGame === "duel") { duelDied(); return; }
    _showOver();
    if (netGame) {
      $("btnRevive").classList.add("hidden"); $("btnRetryCp").classList.add("hidden");
      $("btnAgain").textContent = "BACK TO LOBBY";
      netGame === "coop" && coop.seat === "front" && Net.send({ t: "over", gt: r1(gameTime), kp: killPts, kl: kills, stg: stage, wv: wave, cl: runCleared ? 1 : 0 });
    } else $("btnAgain").textContent = "PLAY AGAIN";
  };
}
function netTick(dt) {
  updateDuel(dt);
  updateCoop(dt);
}
