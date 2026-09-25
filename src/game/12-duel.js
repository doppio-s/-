// ================= DUEL: 1 vs 1 over the passphrase link =================
// Each device flies its own plane and streams its position 20x a second. Gun hits are decided
// by the shooter (what you see is what you hit), missiles fly on the target's device so flares
// work there. Every shoot-down scores a point; first to 5 wins.
const DUEL_WIN = 5;
const duel = { me: 0, them: 0, rival: null, buf: [], sendT: 0, over: false, countT: 0, deadSent: false, hitT: 0, beamT: 0, endT: 0, rHp: 3, rMax: 3 };
const DUEL_SPAWNS = [[-220, 0], [220, 0], [0, -220], [0, 220]];

function startDuel() {
  const warp = window.__warpStage; window.__warpStage = 0;
  try { startRun(); } finally { window.__warpStage = warp; }
  netGame = "duel";
  // arena: the OCEAN ISLES with no waves, no AA guns, no bosses
  dirPhase = "none"; tipList = [];
  turrets.forEach(t => scene.remove(t.mesh)); turrets = [];
  hideCine(); $("hint").classList.add("hidden");
  Object.assign(duel, { me: 0, them: 0, buf: [], sendT: 0, over: false, countT: 3.2, deadSent: false, hitT: 0, endT: 0 });
  duelSpawn(Net.isHost ? 0 : 1);
  if (duel.rival) scene.remove(duel.rival.mesh);
  const P = Net.partner || { body: 0xd64c59, wing: 0xffaa54, plane: "classic", name: "RIVAL" };
  const mesh = makePlane(P.body, P.wing, P.plane); scene.add(mesh); mesh.visible = false;
  duel.rival = { x: 0, y: -99, z: 0, a: 0, p: 0, roll: 0, rollFx: 0, mesh, scale: 1.3, lock: 0, dead: false, rival: true, alive: false, name: P.name || "RIVAL", inv: false, ck: false };
  netLabel = "DUEL \u00b7 FIRST TO " + DUEL_WIN;
  duelHud(); $("duelBar").classList.remove("hidden");
}
function duelSpawn(i) {
  const [x, z] = DUEL_SPAWNS[i];
  Object.assign(player, { x, y: 32, z, a: Math.atan2(-z, -x), p: 0, roll: 0, rollFx: 0, hp: maxHp(), ammo: maxAmmo(), missiles: startMissiles(), flares: startFlares(), invul: 3, alive: true, ve: 1, stall: false });
  player.mesh.visible = true; snapCamera();
}
function duelRespawn() {
  const R = duel.rival;
  let best = 0, bd = -1;
  DUEL_SPAWNS.forEach(([x, z], i) => { const d = R && R.alive ? Math.hypot(x - R.x, z - R.z) : Math.random() * 100; d > bd && (bd = d, best = i); });
  duelSpawn(best);
  state = "playing"; setHud(true); resetSpecial(); updateHud(true);
  duel.deadSent = false;
  banner("BACK IN THE FIGHT", duel.me + " - " + duel.them, "#62f5ec");
}
function duelHud() {
  const R = duel.rival;
  $("duelMe").textContent = "YOU " + duel.me;
  $("duelThem").textContent = duel.them + " " + (R ? R.name : "RIVAL");
  $("duelMid").textContent = "FIRST TO " + DUEL_WIN;
  $("duelThemHp").textContent = R && R.alive ? "♥".repeat(Math.max(0, Math.ceil(duel.rHp))) + "♡".repeat(Math.max(0, duel.rMax - Math.ceil(duel.rHp))) : R ? "RESPAWNING…" : "";
}
// my plane went down: the rival scores; when the dying fall ends we respawn (or the match is over)
function duelDied() {
  if (duel.over) return;
  duelRespawn();
}
function duelScored(mine) {
  mine ? duel.me++ : duel.them++;
  duelHud();
  if (mine) { banner("SPLASH ONE!", duel.me + " - " + duel.them, "#ffd24a"); killFlash(); Sound.sfxFanfare(!1); killPts += 1e3; }
  if (!duel.over && (duel.me >= DUEL_WIN || duel.them >= DUEL_WIN)) { duel.over = true; duel.endT = 2.2; banner(duel.me >= DUEL_WIN ? "VICTORY" : "DEFEAT", duel.me + " - " + duel.them, duel.me >= DUEL_WIN ? "#ffd24a" : "#ff5c7a"); }
}
function duelShowEnd() {
  state = "netend"; clearInput(); setHud(false); CG.gameplayStop();
  const win = duel.me > duel.them;
  $("duelEndTitle").textContent = win ? "YOU WIN" : "YOU LOSE";
  $("duelEndScore").textContent = duel.me + " - " + duel.them;
  $("duelBar").classList.add("hidden");
  showOnly("duelEnd");
  win ? Sound.sfxFanfare(!0) : Sound.sfxOver();
}
function duelEnd() {
  if (duel.rival) { scene.remove(duel.rival.mesh); duel.rival = null; }
  duel.buf = [];
}
function duelOnData(d) {
  const R = duel.rival; if (!R) return;
  if (d.t === "s") {
    duel.buf.push({ at: performance.now(), x: d.x, y: d.y, z: d.z, a: d.a, p: d.p, r: d.r });
    duel.buf.length > 8 && duel.buf.shift();
    R.alive = !!d.al; R.inv = !!d.iv; R.ck = !!d.ck; duel.rHp = d.hp; duel.rMax = d.mx;
    return;
  }
  if (d.t === "f" && R.alive) {   // the rival fired: harmless tracers so I can see it
    const a = d.a + (d.rv ? Math.PI : 0), p = d.rv ? -d.p : d.p, spd = 80;
    for (let g = 0; g < (d.g || 1); g++) {
      const side = gunSide(d.g || 1, g), ox = -Math.sin(d.a) * side, oz = Math.cos(d.a) * side;
      bullets.length < MAXB && bullets.push({ x: d.x + Math.cos(a) * Math.cos(p) * 3 + ox, y: d.y + Math.sin(p) * 3, z: d.z + Math.sin(a) * Math.cos(p) * 3 + oz,
        vx: Math.cos(a) * Math.cos(p) * spd, vy: Math.sin(p) * spd, vz: Math.sin(a) * Math.cos(p) * spd, life: 1.1, enemy: !1, ghost: !0, profile: "laser" });
    }
    Sound.sfxEnemyShoot();
    return;
  }
  if (d.t === "m") {   // the rival's missile flies here, at me
    const m = launchMissile({ x: d.x, y: d.y, z: d.z, a: Math.atan2(d.vz, d.vx), p: Math.asin(clamp(d.vy / (Math.hypot(d.vx, d.vy, d.vz) || 1), -1, 1)), src: R.name }, !0);
    m.src = R.name + " MISSILE";
    return;
  }
  if (d.t === "fl") {   // the rival popped flares: my missiles on it may go for them
    const made = [];
    for (let i = 0; i < 3; i++) { const dcy = { x: R.x + rand(-2, 2), y: R.y - 1, z: R.z + rand(-2, 2), vx: rand(-6, 6), vy: -3, vz: rand(-6, 6), life: 2.2 }; decoys.push(dcy); made.push(dcy); }
    for (const m of missiles) !m.enemy && m.target === R && dist3(m, R) < 90 && Math.random() < .65 && (m.target = made[(Math.random() * 3) | 0], m.sure = !1);
    return;
  }
  if (d.t === "hit") {
    if (state !== "playing") return;
    d.w === "ram" ? damage(!0, R.name + " RAM") : damage(!1, null, R.name + (d.w === "msl" ? " MISSILE" : " GUN"), d.n || 1);
    return;
  }
  if (d.t === "dead") { duelScored(true); return; }
}
function updateDuel(dt) {
  if (netGame !== "duel") return;
  const R = duel.rival; if (!R) return;
  // countdown, then both planes are released together
  if (duel.countT > 0) {
    duel.countT -= dt;
    const n = Math.ceil(duel.countT - .2), el = $("netCount");
    el.classList.remove("hidden"); el.textContent = n > 0 ? n : "FIGHT!";
    if (n !== duel.lastN) { duel.lastN = n; Sound.tone(n > 0 ? 520 : 880, .15, "square", .07); }
    if (duel.countT <= 0) { el.classList.add("hidden"); state === "ready" && beginPlaying(); }
  }
  if (duel.over && (duel.endT -= dt) <= 0 && state !== "netend") { duelShowEnd(); return; }
  // stream my plane
  if ((duel.sendT -= dt) <= 0) {
    duel.sendT = .05;
    Net.send({ t: "s", x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2), a: +player.a.toFixed(3), p: +(player.p || 0).toFixed(3), r: +((player.roll || 0) + (player.rollFx || 0)).toFixed(3),
      hp: player.hp, mx: maxHp(), al: player.alive && state === "playing" ? 1 : 0, iv: player.invul > 0 ? 1 : 0, ck: cloakTime > 0 ? 1 : 0 });
  }
  if (state === "dying" && !duel.deadSent) { duel.deadSent = true; Net.send({ t: "dead" }); duelScored(false); }
  // rival pose: interpolate ~110ms behind the newest packet
  const B = duel.buf, now = performance.now() - 110;
  if (B.length) {
    let k = B.length - 1;
    for (let i = B.length - 1; i > 0; i--) if (B[i - 1].at <= now) { k = i; break; }
    const b1 = B[k], b0 = B[Math.max(0, k - 1)], span = b1.at - b0.at, u = span > 0 ? clamp((now - b0.at) / span, 0, 1.3) : 1;
    R.x = lerp(b0.x, b1.x, u); R.y = lerp(b0.y, b1.y, u); R.z = lerp(b0.z, b1.z, u);
    R.a = b0.a + wrapA(b1.a - b0.a) * u; R.p = lerp(b0.p, b1.p, u); R.roll = lerp(b0.r, b1.r, u);
  }
  R.dead = !R.alive;
  R.mesh.visible = R.alive && !(R.ck && Math.floor(time * 8) % 5 !== 0) && !(R.inv && Math.floor(time * 12) % 2 === 0);
  if (R.alive) orientPlane(R, dt);
  if (!R.alive) R.lock = 0;
  duelHud();
  if (state !== "playing" || !R.alive) return;
  // my gun hits (shooter-authoritative)
  duel.hitT -= dt;
  let hit = 0;
  for (const b of bullets) if (!b.enemy && !b.ghost && b.life > 0 && dist3(b, R) < 2.8) { b.life = 0; hit++; for (let i = 0; i < 5; i++) addPart(b.x, b.y, b.z, rand(-6, 6), rand(-3, 6), rand(-6, 6), .3, .4, i % 2 ? 0xffe24a : 0xffffff); }
  if (isBeamPlane() && firing() && (duel.beamT -= dt) <= 0) {   // beam planes: anything held in the beam's line
    const f = fwdOf(player), dx = R.x - player.x, dy = R.y - player.y, dz = R.z - player.z, dd = Math.hypot(dx, dy, dz) || 1;
    if (dd < 150 && (dx * f[0] + dy * f[1] + dz * f[2]) / dd > .995) { hit++; duel.beamT = .3; }
  }
  if (hit) { flashReticle("hit"); Sound.tone(900, .04, "square", .05); if (duel.hitT <= 0) { duel.hitT = .12; Net.send({ t: "hit", n: 1, w: "gun" }); } }
  // my missiles reaching it just burst here; the damage is decided on the rival's device
  for (const m of missiles) if (!m.enemy && !m.dead && dist3(m, R) < 3.2) { explode(m.x, m.y, m.z, .9); Sound.sfxBoom(); removeMissile(m); }
  missiles = missiles.filter(m => !m.dead);
  // mid-air collision
  if (player.invul <= 0 && !R.inv && dist3(player, R) < 3.8) {
    if (ramTime > 0) { Net.send({ t: "hit", n: 3, w: "ram" }); player.invul = .8; shake = .3; }
    else damage(!0, "MID-AIR COLLISION");
  }
}
// hooks: tell the rival when I fire, launch missiles and pop flares
{
  const _pFire = pFire;
  pFire = function () { _pFire(); netGame === "duel" && Net.send({ t: "f", x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2), a: +player.a.toFixed(3), p: +(player.p || 0).toFixed(3), g: rearView ? Math.max(2, planeNow().guns) : planeNow().guns, rv: rearView ? 1 : 0 }); };
  const _launch = launchMissile;
  launchMissile = function (from, enemy) {
    const m = _launch(from, enemy);
    netGame === "duel" && !enemy && Net.send({ t: "m", x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2), vx: +m.vx.toFixed(2), vy: +m.vy.toFixed(2), vz: +m.vz.toFixed(2) });
    return m;
  };
  const _flares = dropFlares;
  dropFlares = function () { _flares(); netGame === "duel" && Net.send({ t: "fl" }); };
}
const netMarks = () => netGame === "duel" && duel.rival && duel.rival.alive && duel.rival.mesh.visible ? [{ o: duel.rival, cls: "boss ace", lbl: duel.rival.name + " " }] : netGame === "coop" ? coopMarks() : [];
