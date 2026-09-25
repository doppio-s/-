
// =================== FINAL DUEL: ACE "FALCON ZERO" (5:00) ===================
// A single elite Falcon pilot: rolls out of your bullet streams, flares your missiles,
// throws up a shield when you land hits, breaks your lock and hunts your six.
function updateAceFlow(dt) {
  if (acePhase === 'none') {
    if (gameTime < ACE_AT - 5 || titanLock()) return;   // the titan must be dealt with first
    if (!aceWarned) {
      aceWarned = true;
      $('bossWarn').innerHTML = '<small>WARNING &middot; 5:00</small>ACE PILOT INBOUND';
      $('bossWarn').classList.remove('hidden'); bossWarnT = 0;
      Sound.sfxSiren();
    }
    if (gameTime >= ACE_AT && !(boss && !boss.dead)) startAceIntro();
  } else if (acePhase === 'intro') {
    aceT -= dt;
    if (aceT <= 0) { acePhase = 'fight'; hideCine(); spawnAce(); }
  }
}
function startAceIntro() {
  acePhase = 'intro'; aceT = 3;
  reachCheckpoint('ace');
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
  Object.assign(player, { hp: maxHp(), ammo: maxAmmo(), missiles: Math.min(9, Math.max(player.missiles, 6)), flares: Math.min(9, player.flares + 3), invul: 4 });
  shockwave(player.x, player.y, player.z, 110, 0xffffff, 1);
  shockwave(player.x, player.y, player.z, 70, 0x62f5ec, 0.8);
  shake = 0.5; hitStop(0.9, 0.2); killFlash();
  Sound.sfxBoom(); Sound.sfxSiren();
  setCine('FINAL DUEL &middot; 5:00', 'FALCON ZERO', 'THE DEADLIEST ACE IN THE SKY &mdash; ONE ON ONE');
  showCine(); updateHud(true);
}
function makeAce() {
  const mesh = makePlane(0x14161f, 0xff2d55, 'falcon');
  const b = mesh.userData.body;
  const glow = M(0xff2d55, { emissive: 0xff0035, emissiveIntensity: 2.2 });
  for (const sd of [-1, 1]) {
    part(G.box, glow, 1.6, 0.06, 0.12, -0.3, 0.02, sd * 2.25, b).rotation.y = sd * 0.55;   // wingtip light bars
    part(G.sph, glow, 0.12, 0.12, 0.12, 0.2, 0.05, sd * 2.4, b);
  }
  part(G.box, M(0xffd24a, { metalness: 0.6, roughness: 0.3 }), 1.4, 0.08, 0.5, 0.9, 0.55, 0, b);   // gold spine stripe
  const shield = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
  shield.scale.setScalar(2.4); shield.visible = false; mesh.add(shield);
  mesh.userData.shield = shield;
  mesh.scale.setScalar(2.2);
  return mesh;
}
function spawnAce() {
  const ang = player.a + rand(-0.5, 0.5), d = 130;
  const x = clamp(player.x + Math.cos(ang) * d, -MAP + 40, MAP - 40), z = clamp(player.z + Math.sin(ang) * d, -MAP + 40, MAP - 40);
  const hp = Math.round(70 + 45 * gunDmg() * planeNow().guns);
  boss = { x, y: clampAlt(player.y + 6), z, a: Math.atan2(player.z - z, player.x - x), p: 0, roll: 0, rollFx: 0, hp, max: hp, scale: 1.3, ace: true, boss: true,
    pts: 15000, phase: 1, intro: 1.8, fireCd: 2, burst: 0, burstT: 0, mslCd: 8, sonicCd: 6,
    dodgeT: 0, dodgeCd: 0, dodgeDir: 1, dodges: 0, flares: 4, flareCd: 0, flareRegen: 12,
    shieldT: 0, shieldCd: 6, ramCd: 9, ramCharge: 0, ramT: 0, cloakT: 0, cloakCd: 24, tailT: 0, extendT: 0, extendA: 0, extendUp: 0, dmgWin: 0, breakCd: 6, weave: rand(0, 6), trailT: 0, dying: 0, dead: false, mesh: makeAce() };
  scene.add(boss.mesh);
  $('bossName').textContent = 'ACE · FALCON ZERO';
  $('bossFill').style.width = '100%';
  $('bossBar').classList.remove('titan'); $('bossBar').classList.add('ace'); $('bossBar').classList.remove('hidden');
  banner('FALCON ZERO', 'ENGAGE', '#62f5ec');
  shockwave(boss.x, boss.y, boss.z, 30, 0xff2d55, 0.6);
  Sound.sfxBoost(); Sound.tone(90, 0.9, 'sine', 0.25, 30);
}
function aceShield(B, why) {
  B.shieldT = B.phase >= 2 ? 3.2 : 2.6; B.shieldCd = B.phase >= 2 ? 9 : 12; B.dmgWin = 0;
  B.mesh.userData.shield.visible = true;
  shockwave(B.x, B.y, B.z, 12, 0x7ff3ff, 0.4);
  Sound.tone(300, 0.5, 'sine', 0.15, 900); Sound.tone(600, 0.4, 'triangle', 0.06, 1200, 0.05);
  popup(B.x, B.y + 3, B.z, why || 'SHIELD UP');
}
// true = the hit is absorbed (shield up)
function aceBlocks(at) {
  const B = boss;
  if (B.shieldT > 0) {
    for (let i = 0; i < 5; i++) addPart(at.x, at.y, at.z, rand(-8, 8), rand(-4, 8), rand(-8, 8), 0.3, 0.4, 0x7ff3ff);
    Sound.tone(1400, 0.04, 'triangle', 0.04, 900);
    return true;
  }
  if (B.dodgeT > 0) return true;   // mid-roll: nothing touches it
  return false;
}
function aceDamaged(dmg) {
  const B = boss;
  B.dmgWin += dmg;
  if (B.cloakT > 0) {   // any hit breaks the cloak
    B.cloakT = 0; B.mesh.visible = true;
    shockwave(B.x, B.y, B.z, 12, 0xb69dff, 0.35); popup(B.x, B.y + 3, B.z, 'REVEALED'); Sound.tone(600, 0.15, 'square', 0.06, 300);
  }
  if (B.phase === 1 && B.hp <= B.max / 2) {
    B.phase = 2; $('bossName').textContent = 'ACE · FALCON ZERO · UNLEASHED';
    banner('UNLEASHED', 'FALCON ZERO STOPS HOLDING BACK', '#ff2d55');
    shockwave(B.x, B.y, B.z, 40, 0xff2d55, 0.6); hitStop(0.3, 0.2); Sound.sfxSiren();
    B.flares = Math.max(B.flares, 3); aceShield(B, 'SHIELD UP');
    spawnPickup('ammo'); spawnPickup('missile');
    return;
  }
  // takes a beating → shield
  if (B.shieldCd <= 0 && B.dmgWin >= B.max * (B.phase >= 2 ? 0.08 : 0.1)) aceShield(B);
}
function aceFlares(B) {
  B.flares--; B.flareCd = 1.4;
  const f = fwdOf(B), made = [];
  for (let i = 0; i < 4; i++) {
    const sd = (i - 1.5) * 7;
    const d = { x: B.x - f[0] * 3, y: B.y - 1, z: B.z - f[2] * 3, vx: -f[0] * 8 - Math.sin(B.a) * sd, vy: rand(-4, 2), vz: -f[2] * 8 + Math.cos(B.a) * sd, life: 2.4, aceFlare: true };
    decoys.push(d); made.push(d);
  }
  let fooled = 0;
  for (const m of missiles) if (!m.enemy && !m.dead && m.target === B && dist3(m, B) < 80) { m.target = made[fooled % made.length]; m.sure = false; m.turn = 5; fooled++; }
  popup(B.x, B.y + 3, B.z, 'FLARES!');
  Sound.tone(900, 0.25, 'triangle', 0.08, 300); Sound.tone(700, 0.25, 'triangle', 0.06, 250, 0.08);
}
function updateAce(dt, hostile) {
  const B = boss, ud = B.mesh.userData;
  if (B.dead) {   // spiralling, burning fall
    B.dying -= dt; B.y -= dt * (8 + (1.8 - B.dying) * 20); B.roll += dt * 10; B.p = lerp(B.p, -0.8, dt * 2);
    B.x += Math.cos(B.a) * 14 * dt; B.z += Math.sin(B.a) * 14 * dt;
    if (Math.random() < 0.7) addPart(B.x, B.y, B.z, rand(-1, 1), 2, rand(-1, 1), 0.9, rand(0.9, 1.5), Math.random() < 0.3 ? 0xff7a2d : 0x3a3f55, 1.4);
    if (Math.random() < dt * 8) { explode(B.x, B.y, B.z, 0.7); Sound.sfxBoom(); }
    if (B.dying <= 0 || B.y < 1) {
      explode(B.x, Math.max(B.y, 1), B.z, 3); shockwave(B.x, Math.max(B.y, 1), B.z, 60, 0xffffff, 0.9); shockwave(B.x, Math.max(B.y, 1), B.z, 35, 0xff2d55, 0.7);
      shake = 0.7; killFlash(); Sound.sfxBoom();
      if (state === 'playing') { spawnPickup('heart'); spawnPickup('missile'); spawnPickup('ammo'); }
      scene.remove(B.mesh); boss = null; acePhase = 'done';
      banner('SKY OWNED', 'THE HUNT RESUMES', '#62f5ec');
      return;
    }
    orientPlane(B, dt); return;
  }
  const ph2 = B.phase >= 2;
  if (B.intro > 0) B.intro -= dt;
  if (B.stun > 0) { B.stun -= dt; B.dodgeCd = Math.max(B.dodgeCd, 0.1); B.fireCd = Math.max(B.fireCd, 0.1); }
  B.fireCd -= dt; B.mslCd -= dt; B.sonicCd -= dt; B.dodgeCd -= dt; B.flareCd -= dt; B.shieldCd -= dt; B.breakCd -= dt; B.ramCd -= dt; B.cloakCd -= dt;
  B.dmgWin = Math.max(0, B.dmgWin - dt * B.max * 0.04);
  B.flareRegen -= dt; if (B.flareRegen <= 0) { B.flareRegen = ph2 ? 8 : 12; B.flares = Math.min(4, B.flares + 1); }
  if (B.shieldT > 0) { B.shieldT -= dt; ud.shield.visible = B.shieldT > 0 && (B.shieldT > 0.6 || Math.floor(time * 12) % 2 === 0); ud.shield.material.opacity = 0.22 + Math.sin(time * 14) * 0.08; }
  else ud.shield.visible = false;
  $('bossBar').classList.toggle('shield', B.shieldT > 0);

  const pf = fwdOf(player), dx = player.x - B.x, dy = player.y - B.y, dz = player.z - B.z, d = Math.hypot(dx, dy, dz) || 1;
  const toMe = -(pf[0] * dx + pf[1] * dy + pf[2] * dz) / d;   // >0: the ace is in front of the player's guns
  const engaged = hostile && player.alive && !playerHidden();

  // --- evasion: roll out of any bullet stream about to connect ---
  if (B.dodgeT > 0) {
    B.dodgeT -= dt;
    const k = 1 - Math.max(0, B.dodgeT) / 0.55;
    B.rollFx = B.dodgeDir * k * Math.PI * 2;
    const side = 34 * B.dodgeDir;
    B.x += -Math.sin(B.a) * side * dt; B.z += Math.cos(B.a) * side * dt; B.y = clampAlt(B.y + B.dodgeUp * 14 * dt);
    if (Math.random() < 0.6) addPart(B.x, B.y, B.z, 0, 0, 0, 0.35, 0.5, 0xff5c8a, 0.8);
    if (B.dodgeT <= 0) B.rollFx = 0;
  } else if (B.dodgeCd <= 0 && B.intro <= 0) {
    for (const b of bullets) {
      if (b.enemy) continue;
      const rx = B.x - b.x, ry = B.y - b.y, rz = B.z - b.z, vv = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      const t = (rx * b.vx + ry * b.vy + rz * b.vz) / vv;
      if (t < 0 || t > 0.45) continue;
      const cx = rx - b.vx * t, cy = ry - b.vy * t, cz = rz - b.vz * t;
      if (cx * cx + cy * cy + cz * cz > 16) continue;
      B.dodgeCd = ph2 ? 0.75 : 1.1;
      if (Math.random() < (ph2 ? 0.88 : 0.72)) {
        // roll away from the stream's side
        const side = -Math.sin(B.a) * cx + Math.cos(B.a) * cz;
        B.dodgeDir = side >= 0 ? 1 : -1; B.dodgeUp = cy >= 0 ? 0.6 : -0.6; B.dodgeT = 0.55; B.dodges++;
        Sound.sfxBoost();
        if (B.dodges % 2 === 1 && !(B.cloakT > 0)) popup(B.x, B.y + 3, B.z, 'EVADED');
      }
      break;
    }
  }
  // --- countermeasures against the player's missiles ---
  let threat = null;
  for (const m of missiles) if (!m.enemy && !m.dead && m.target === B && dist3(m, B) < (m.sure ? 55 : 40)) { threat = m; break; }
  if (threat && B.intro <= 0) {
    if (B.flares > 0 && B.flareCd <= 0) aceFlares(B);
    else if (B.flares <= 0 && B.shieldT <= 0 && B.shieldCd <= 0 && dist3(threat, B) < 20) aceShield(B, 'SHIELD!');
  }
  // --- breaks a building lock with a hard jink ---
  if ((B.lock || 0) > 0.6 && B.lock < 1 && B.breakCd <= 0) {
    B.lock = 0; B.breakCd = ph2 ? 7 : 10;
    B.dodgeDir = Math.random() < 0.5 ? -1 : 1; B.dodgeUp = rand(-0.8, 0.8); B.dodgeT = 0.55;
    popup(B.x, B.y + 3, B.z, 'LOCK BROKEN'); Sound.tone(500, 0.2, 'square', 0.06, 200);
  }

  // --- SHIELD RAM: telegraph, then a shielded afterburner charge straight through you ---
  if (B.ramCharge > 0) {
    B.ramCharge -= dt;
    for (let i = 0; i < 2; i++) addPart(B.x + rand(-2, 2), B.y + rand(-2, 2), B.z + rand(-2, 2), rand(-4, 4), rand(-4, 4), rand(-4, 4), 0.3, 0.6, 0xff2d55, 0.5);
    if (B.ramCharge <= 0) {
      B.ramT = ph2 ? 1.8 : 1.5; B.shieldT = Math.max(B.shieldT, B.ramT + 0.2); ud.shield.visible = true;
      B.ramHeading = Math.atan2(player.z - B.z, player.x - B.x); B.ramPitch = clamp(Math.atan2(player.y - B.y, Math.hypot(player.x - B.x, player.z - B.z)), -0.5, 0.5);
      shockwave(B.x, B.y, B.z, 16, 0xff2d55, 0.4); Sound.sfxBoost(); Sound.tone(120, 0.8, 'sawtooth', 0.12, 60);
    }
  } else if (B.ramT > 0) {
    B.ramT -= dt;
    const rs = Math.max(34, playerSpeed() * 2.1), cpr = Math.cos(B.ramPitch);
    B.ramHeading += clamp(wrapA(Math.atan2(player.z - B.z, player.x - B.x) - B.ramHeading), -0.9 * dt, 0.9 * dt);   // slight homing
    B.a = B.ramHeading; B.p = B.ramPitch; B.roll = lerp(B.roll, 0, dt * 6);
    B.x += Math.cos(B.a) * cpr * rs * dt; B.z += Math.sin(B.a) * cpr * rs * dt; B.y = clamp(B.y + Math.sin(B.p) * rs * dt, ALT_MIN, ALT_MAX);
    for (const sd of [-1, 1]) addPart(B.x - Math.sin(B.a) * sd * 3, B.y, B.z + Math.cos(B.a) * sd * 3, 0, 0, 0, 0.4, 0.8, 0xff5c8a, 1);
    if (state === 'playing' && dist3(B, player) < 6.5 && player.invul <= 0) { damage(); shockwave(player.x, player.y, player.z, 14, 0xff2d55, 0.35); B.ramT = 0; B.breakCd = 0; }
    if (B.ramT <= 0) { B.dodgeDir = Math.random() < 0.5 ? -1 : 1; }
    animateExhaust(B, true, dt); orientPlane(B, dt);
    return;
  } else if (engaged && state === 'playing' && B.intro <= 0 && B.cloakT <= 0 && B.dodgeT <= 0 && B.ramCd <= 0 && d > 30 && d < 95) {
    B.ramCd = ph2 ? 9 : 13; B.ramCharge = 0.9;
    banner('SHIELD RAM', 'GET OUT OF THE WAY', '#ff2d55'); Sound.sfxSiren();
    popup(B.x, B.y + 3, B.z, 'RAM INCOMING');
  }
  // --- PHANTOM CLOAK: vanishes, slips behind you, then ambushes ---
  if (B.cloakT > 0) {
    B.cloakT -= dt; B.lock = 0;
    if (Math.random() < dt * 10) addPart(B.x + rand(-3, 3), B.y + rand(-1.5, 1.5), B.z + rand(-3, 3), 0, 0, 0, 0.35, 0.35, 0xb69dff, 0.5);
    ud.cloak = true;
    if (B.cloakT <= 0) {   // decloak right on your tail and open fire
      ud.cloak = false; B.mesh.visible = true;
      shockwave(B.x, B.y, B.z, 14, 0xb69dff, 0.4); Sound.tone(200, 0.4, 'sine', 0.12, 900);
      popup(B.x, B.y + 3, B.z, 'AMBUSH!'); B.fireCd = 0; B.burst = 0;
    }
  } else if (engaged && state === 'playing' && B.intro <= 0 && B.ramCharge <= 0 && B.cloakCd <= 0 && (toMe > 0.5 || B.hp < B.max * 0.75)) {
    B.cloakT = ph2 ? 2.8 : 2.2; B.cloakCd = ph2 ? 20 : 26; B.lock = 0;
    for (const m of missiles) if (!m.enemy && m.target === B) { m.target = null; m.sure = false; }
    shockwave(B.x, B.y, B.z, 12, 0xb69dff, 0.4); Sound.tone(900, 0.5, 'sine', 0.08, 200);
    popup(B.x, B.y + 3, B.z, 'CLOAKED'); toast('FALCON ZERO VANISHED — WATCH YOUR SIX');
  }
  B.mesh.visible = !(B.cloakT > 0) || Math.floor(time * 8) % 4 === 0;   // steady shimmer gives it away
  // --- flight: hunt the player's six; weave hard whenever it's in the player's sights ---
  const baseSpd = playerSpeed() / (ramTime > 0 ? 1.65 : 1);
  let tx, ty, tz, spd;
  // don't camp the player's six: after a few seconds on the tail, extend away and come back from a new angle
  const onTail = engaged && toMe < -0.3 && d < 60 && !(B.cloakT > 0);
  if (B.extendT > 0) B.extendT -= dt;
  else if (onTail) {
    B.tailT += dt;
    if (B.tailT > (ph2 ? 3.8 : 2.8)) { B.tailT = 0; B.extendT = rand(2.8, 3.8); B.extendA = B.a + (Math.random() < 0.5 ? -1 : 1) * rand(0.7, 1.1); B.extendUp = rand(-12, 14); }
  } else B.tailT = Math.max(0, B.tailT - dt * 0.5);
  B.weave += dt * (ph2 ? 3.4 : 2.6);
  if (!engaged) { tx = B.x + Math.cos(B.a) * 40; tz = B.z + Math.sin(B.a) * 40; ty = B.y; spd = baseSpd; }
  else if (d < 16) {   // too close: break off to the side
    const sa = B.a + Math.PI / 2 * (B.dodgeDir || 1);
    tx = B.x + Math.cos(sa) * 40; tz = B.z + Math.sin(sa) * 40; ty = clampAlt(B.y + 8); spd = baseSpd * 1.2;
  } else if (B.cloakT > 0) {   // invisible: slip in behind the player
    tx = player.x - pf[0] * 30; ty = player.y + 3; tz = player.z - pf[2] * 30; spd = baseSpd * 1.35;
  } else if (B.extendT > 0) {   // extending: open the distance, then re-engage (often head-on)
    tx = B.x + Math.cos(B.extendA) * 50; tz = B.z + Math.sin(B.extendA) * 50; ty = clampAlt(B.y + B.extendUp); spd = baseSpd * 1.25;
  } else if (toMe > 0.55) {   // defensive: in the crosshair → jink
    const wa = B.a + Math.sin(B.weave) * 1.1;
    tx = B.x + Math.cos(wa) * 40; tz = B.z + Math.sin(wa) * 40; ty = clampAlt(B.y + Math.cos(B.weave * 0.8) * 16);
    spd = baseSpd * (ph2 ? 1.25 : 1.15);
  } else {   // offensive: settle in behind and lead the shot
    const ps = playerSpeed(), lead = d / (botSpeed() + 30) * 0.5;
    const behind = d > 45 ? 0 : 30;
    tx = player.x - pf[0] * behind + pf[0] * ps * lead; ty = player.y - pf[1] * behind + pf[1] * ps * lead + 2; tz = player.z - pf[2] * behind + pf[2] * ps * lead;
    spd = baseSpd * (d > 60 ? 1.3 : d > 45 ? 1.05 : 0.92) * (ph2 ? 1.08 : 1);   // settles slightly slower than you on the tail, so you can turn it around
  }
  tx = clamp(tx, -MAP + 20, MAP - 20); tz = clamp(tz, -MAP + 20, MAP - 20);
  let desired = Math.atan2(tz - B.z, tx - B.x);
  if (Math.abs(B.x) > MAP - 10 || Math.abs(B.z) > MAP - 10) desired = Math.atan2(-B.z, -B.x);
  turnToward(B, desired, ph2 ? 3.4 : 2.8, dt);
  let pitch = clamp(Math.atan2(ty - B.y, Math.max(1, Math.hypot(tx - B.x, tz - B.z))), -0.6, 0.6);
  if (B.y <= ALT_MIN + 1 && pitch < 0) pitch = 0; if (B.y >= ALT_MAX - 1 && pitch > 0) pitch = 0;
  B.p = lerp(B.p, pitch, Math.min(1, dt * 3));
  spd = Math.max(20, spd) * (B.dodgeT > 0 ? 1.1 : 1);
  const cp = Math.cos(B.p);
  B.x += Math.cos(B.a) * cp * spd * dt; B.z += Math.sin(B.a) * cp * spd * dt; B.y = clamp(B.y + Math.sin(B.p) * spd * dt, ALT_MIN, ALT_MAX);

  // --- weapons ---
  if (engaged && state === 'playing' && B.intro <= 0 && B.cloakT <= 0 && B.ramCharge <= 0 && !(B.extendT > 0)) {
    const f = fwdOf(B), off = Math.acos(clamp((dx * f[0] + dy * f[1] + dz * f[2]) / d, -1, 1));
    if (B.burst <= 0 && B.fireCd <= 0 && d < 75 && off < 0.3) { B.burst = ph2 ? 6 : 4; B.fireCd = ph2 ? 0.9 : 1.3; }
    if (B.burst > 0 && (B.burstT -= dt) <= 0) {
      B.burst--; B.burstT = 0.08;
      const ps = playerSpeed(), lead = d / (botSpeed() + 30);
      fire({ ...B, guns: 2, airframe: 'falcon' }, true, { x: player.x + pf[0] * ps * lead, y: player.y + pf[1] * ps * lead, z: player.z + pf[2] * ps * lead });
      Sound.sfxEnemyShoot({ airframe: 'falcon' });
    }
    if (B.mslCd <= 0 && d > 30 && d < 100 && off < 0.9) {
      for (let i = 0; i < (ph2 ? 2 : 1); i++) launchMissile({ ...B, a: B.a + (i ? 0.25 : -0.1) }, true);
      B.mslCd = rand(8, 11); popup(B.x, B.y + 3, B.z, 'FOX TWO');
    }
    // unleashed: sonic boom when you get close — wipes your bullets, hurts up close
    if (ph2 && B.sonicCd <= 0 && d < 24) {
      B.sonicCd = 9;
      shockwave(B.x, B.y, B.z, 30, 0xdff6ff, 0.5); ring(B.x, B.y, B.z, 30, 0xdff6ff, 40, 55);
      for (const b of bullets) if (!b.enemy && dist3(b, B) < 32) b.life = 0;
      if (d < 13) damage();
      shake = Math.max(shake, 0.35); Sound.sfxBoom(); Sound.tone(90, 0.6, 'sine', 0.3, 30);
      popup(B.x, B.y + 3, B.z, 'SONIC BOOM');
    }
  }
  // afterburner + contrails
  B.trailT -= dt;
  if (B.trailT <= 0) {
    B.trailT = 0.03; const f = fwdOf(B);
    for (const sd of [-1, 1]) addPart(B.x - f[0] * 4 - Math.sin(B.a) * sd * 4.8, B.y - f[1] * 4, B.z - f[2] * 4 + Math.cos(B.a) * sd * 4.8, 0, 0, 0, 0.6, 0.35, sd < 0 ? 0xff2d55 : 0xffffff, 0.6);
  }
  animateExhaust(B, true, dt);
  orientPlane(B, dt);
}
function killAce() {
  const B = boss;
  B.dead = true; B.dying = 1.8; bossCount++; kills++; aceSlain = true;
  clearCheckpoint('ace');
  B.mesh.userData.shield.visible = false; B.rollFx = 0; B.cloakT = 0; B.ramT = 0; B.ramCharge = 0; B.mesh.visible = true;
  awardKill(B.x, B.y + 4, B.z, B.pts, true);
  $('bossBar').classList.add('hidden'); $('bossBar').classList.remove('ace', 'shield');
  shake = 0.6; hitStop(1.4, 0.15); killFlash();
  banner('ACE DOWN', '+15000 PTS · +500 COINS', '#ffd24a');
  Sound.sfxFanfare(true); Sound.sfxBoom();
  for (const m of missiles) if (m.enemy) { explode(m.x, m.y, m.z, 0.5); removeMissile(m); }
  missiles = missiles.filter(m => !m.dead);
  bullets = bullets.filter(b => !b.enemy);
  garage.coins += 500; saveGarage();
  nextBossAt = gameTime + 90;
  CG.happytime();
}
