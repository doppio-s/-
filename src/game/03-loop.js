
// ---------- update ----------
let time = 0;
function turnToward(e, desired, rate, dt) {
  const d = wrapA(desired - e.a);
  const step = clamp(d, -rate * dt, rate * dt);
  e.a = wrapA(e.a + step);
  e.roll = lerp(e.roll, clamp(d * 1.3, -0.85, 0.85), Math.min(1, dt * 6));
}

function readSteer() {
  let x = 0, y = 0;
  if (input.left || input.right || input.up || input.down) {
    x = (input.right ? 1 : 0) - (input.left ? 1 : 0); y = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  } else if (input.touchId !== null) {
    const s = Math.min(window.innerWidth, window.innerHeight) * 0.22;
    x = clamp((input.touchX - input.touchX0) / s, -1, 1); y = clamp(-(input.touchY - input.touchY0) / s, -1, 1);
  } else if (input.mouseActive && input.pointerMode !== "touch") {
    const w = window.innerWidth, h = window.innerHeight;
    x = clamp((input.mouseX - w / 2) / (w * 0.3), -1, 1); y = clamp(-(input.mouseY - h / 2) / (h * 0.3), -1, 1);
    if (Math.abs(x) < 0.05) x = 0;
    if (Math.abs(y) < 0.08) y = 0;
  }
  steerNow = x; climbNow = y;
}
function playerMissile() {
  if (state !== 'playing' || player.mslCd > 0) return;
  if (player.missiles <= 0) { Sound.sfxEmpty(); toast('No missiles! Red boxes have more'); return; }
  const full = targetables().filter(t => !t.dead && t.lock >= 1).sort((a, b) => dist3(a, player) - dist3(b, player));
  if (full.length) {   // locked: one guaranteed missile
    const n = 1;
    for (let i = 0; i < n; i++) {
      const sd = (i % 2 ? 1 : -1) * (1.8 + Math.floor(i / 2) * 0.9), ox = -Math.sin(player.a) * sd, oz = Math.cos(player.a) * sd;
      const m = launchMissile({ ...player, x: player.x + ox, y: player.y - 1.2, z: player.z + oz, a: player.a + (i % 2 ? 1 : -1) * (0.12 + Math.floor(i / 2) * 0.12), p: (player.p || 0) + 0.1 }, false);
      m.target = full[i]; m.sure = true; m.life = 9; m.turn = 10; full[i].lock = 0;
    }
    player.missiles -= n; Sound.sfxLock();
    toast('LOCKED · GUARANTEED HIT');
  } else {   // partial lock sharpens the missile's tracking
    const best = aiming() ? targetables().filter(t => !t.dead && t.lock > 0).sort((a, b) => b.lock - a.lock)[0] : null;
    player.missiles--; const m = launchMissile(player, false);
    if (best) { m.target = best; m.turn = 3.2 + best.lock * 6; best.lock = 0; }
  }
  player.mslCd = 0.8; updateHud(true);
}
function playerFlare() {
  if (state !== 'playing' || player.flareCd > 0) return;
  if (player.flares <= 0) { Sound.sfxEmpty(); toast('No flares left'); return; }
  player.flares--; player.flareCd = 1; dropFlares(); updateHud(true);
}
function updatePlayer(dt) {
  const spd = playerSpeed(), tr = turnRate();
  const outside = Math.abs(player.x) > MAP || Math.abs(player.z) > MAP;
  readSteer();
  const sens = aiming() ? 0.5 : 1;   // ADS: slower, more precise steering
  if (outside) { turnToward(player, Math.atan2(-player.z, -player.x), tr, dt); steerNow = 0; }
  else {
    player.a = wrapA(player.a + steerNow * tr * sens * dt);
    player.roll = lerp(player.roll, clamp(steerNow * 0.8, -0.85, 0.85), Math.min(1, dt * 6));
  }
  let tp = climbNow * 0.6 * (aiming() ? 0.6 : 1);
  if (player.y <= ALT_MIN + 1 && tp < 0) tp = 0;
  if (player.y >= ALT_MAX - 1 && tp > 0) tp = 0;
  player.p = lerp(player.p, tp, Math.min(1, dt * (3 + garage.lv.engine * 0.4)));
  const cp = Math.cos(player.p);
  player.x += Math.cos(player.a) * cp * spd * dt;
  player.z += Math.sin(player.a) * cp * spd * dt;
  player.y = clamp(player.y + Math.sin(player.p) * spd * dt, ALT_MIN, ALT_MAX);
  $('warn').classList.toggle('hidden', !outside);

  if (player.invul > 0) player.invul -= dt;
  player.fireCd -= dt; player.mslCd -= dt; player.flareCd -= dt; emptyToastT -= dt; emptySfxT -= dt;
  if (firing() && player.fireCd <= 0) {
    if (stormTime > 0) {
      fire(player, false); player.fireCd = fireGap() / 2.5; Sound.sfxShoot(); muzzleFlash();
    } else if (player.ammo > 0) {
      fire(player, false); player.ammo--; player.fireCd = fireGap(); Sound.sfxShoot(); updateHud(true); muzzleFlash();
    } else {
      player.fireCd = 0.15;
      if (emptySfxT <= 0) { Sound.sfxEmpty(); emptySfxT = 0.35; }
      if (emptyToastT <= 0) { toast('Out of ammo! Grab the yellow boxes'); emptyToastT = 4; }
    }
  }
}

const attackLimit=()=>gameTime<90?2:3;
function initEnemyTactics(b){
 b.phase='orbit';b.phaseTime=rand(2,5);b.passTime=0;b.attackSpent=false;
 b.approach=['front','left','right'][Math.floor(Math.random()*3)];b.orbitSide=b.approach==='left'?-1:b.approach==='right'?1:(Math.random()<.5?-1:1);
 b.standoff=rand(65,100);b.altOffset=rand(-12,12);b.orbitAge=0;
}
function enemyAttackSpent(b){
 if(b.phase==='retreat')return;
 b.phase='retreat';b.phaseTime=rand(3.5,5.5);b.attackSpent=false;b.specialCharge=0;b.ramTime=0;
 // Leave along the current heading with a broad side turn, then establish a new approach.
 b.escapeHeading=b.a+b.orbitSide*rand(.5,1.05);
 const px=b.x+Math.cos(b.escapeHeading)*80,pz=b.z+Math.sin(b.escapeHeading)*80;
 b.escapeX=clamp(px,-MAP+20,MAP-20);b.escapeZ=clamp(pz,-MAP+20,MAP-20);
}
function allocateAttackSlots(){
 if(!player.alive)return;
 let slots=attackLimit()-bots.filter(b=>!b.dead&&b.phase==='attack').length;
 const waiting=bots.filter(b=>!b.dead&&b.phase==='orbit'&&b.phaseTime<=0&&dist3(b,player)<155).sort((a,b)=>b.orbitAge-a.orbitAge);
 for(const b of waiting){if(slots<=0)break;
  const dot=(Math.cos(player.a)*(b.x-player.x)+Math.sin(player.a)*(b.z-player.z))/Math.max(1,Math.hypot(b.x-player.x,b.z-player.z));
  // Prefer entry ahead or abeam; a timeout prevents starvation near map borders.
  if(dot<-.15&&b.orbitAge<14)continue;
  b.phase='attack';b.passTime=rand(5,8);b.attackSpent=false;b.orbitAge=0;slots--;
 }
}
function updateBots(dt,hostile){
 const ps=playerSpeed(),pf=fwdOf(player),psBase=playerSpeed()/(ramTime>0?1.65:1);   // enemies match cruise speed only, so boosting catches them
 for(const b of bots)if(!b.phase)initEnemyTactics(b);
 if(hostile)allocateAttackSlots();
 for(const b of bots){
  if(b.dead)continue;
  if(b.stun>0){   // EMP: drifting, rolling, no weapons
   b.stun-=dt;const bs0=botSpeed()*b.spd*.45,cp0=Math.cos(b.p);b.roll+=dt*5;
   b.x+=Math.cos(b.a)*cp0*bs0*dt;b.z+=Math.sin(b.a)*cp0*bs0*dt;
   if(Math.random()<dt*12)addPart(b.x+rand(-1.5,1.5),b.y+rand(-1,1),b.z+rand(-1.5,1.5),0,rand(1,3),0,.3,.35,Math.random()<.5?0xb69dff:0x69eaff,.4);
   if(b.stun<=0)b.roll=0;
   continue;
  }
  let bs=botSpeed()*b.spd;const dx=player.x-b.x,dy=player.y-b.y,dz=player.z-b.z,dh=Math.hypot(dx,dz),d=Math.hypot(dh,dy);
  b.fireCd-=dt;b.mslCd-=dt;b.phaseTime-=dt;
  let tx,tz,ty=player.y,desired;
  if(!hostile||!player.alive){tx=b.x+Math.cos(b.a)*30;tz=b.z+Math.sin(b.a)*30;ty=b.y;}
  else if(b.phase==='retreat'){
   tx=b.escapeX;tz=b.escapeZ;ty=clampAlt(player.y+b.altOffset);bs=Math.max(bs,psBase*1.1);
   if(b.phaseTime<=0||Math.hypot(tx-b.x,tz-b.z)<12)initEnemyTactics(b);
  }else if(b.phase==='orbit'){
   b.orbitAge+=dt;b.specialCd=Math.max(0,(b.specialCd||0)-dt);
   const ahead=b.approach==='front'?b.standoff:b.standoff*.55,side=b.orbitSide*(b.approach==='front'?38:b.standoff*.8);
   const sway=Math.sin(time*.35+b.side*3)*12;
   tx=player.x+pf[0]*ahead-pf[2]*(side+sway);tz=player.z+pf[2]*ahead+pf[0]*(side+sway);ty=clampAlt(player.y+b.altOffset);
   bs=Math.max(bs,psBase*1.05);if(Math.hypot(tx-b.x,tz-b.z)<18){tx+=Math.cos(b.a+b.orbitSide)*30;tz+=Math.sin(b.a+b.orbitSide)*30;}
  }else{
   b.passTime-=dt;updateEnemySpecial(b,dt,d,true);
   if(b.attackSpent&&!(b.ramTime>0))enemyAttackSpent(b);
   if(b.phase==='attack'&&((b.passTime<=0&&!(b.ramTime>0))||(d<11&&!(b.ramTime>0))))enemyAttackSpent(b);
   const lead=d/(bs+30)*.45;
   tx=player.x+pf[0]*ps*lead;tz=player.z+pf[2]*ps*lead;ty=player.y+pf[1]*ps*lead;
   if(b.ability==='rear'&&d<65){tx=player.x+pf[0]*70;tz=player.z+pf[2]*70;ty=player.y;}
   if(b.phase==='retreat'){tx=b.escapeX;tz=b.escapeZ;ty=clampAlt(player.y+b.altOffset);}
   if(b.ramTime>0)bs*=1.6;
  }
  tx=clamp(tx,-MAP+15,MAP-15);tz=clamp(tz,-MAP+15,MAP-15);
  desired=Math.atan2(tz-b.z,tx-b.x);
  // Personal space avoids overlapping aircraft while staging or breaking away.
  if(b.phase!=='attack'){
   let sx=0,sz=0;for(const other of bots){if(other===b||other.dead)continue;const ox=b.x-other.x,oz=b.z-other.z,od=Math.hypot(ox,oz);if(od>0&&od<14){sx+=ox/od*(14-od);sz+=oz/od*(14-od);}}
   desired=Math.atan2(Math.sin(desired)+sz*.14,Math.cos(desired)+sx*.14);
   if(d<28)desired=Math.atan2(b.z-player.z,b.x-player.x);
  }
  if(Math.abs(b.x)>MAP-6||Math.abs(b.z)>MAP-6)desired=Math.atan2(-b.z,-b.x);
  else if(b.ramTime>0)desired=b.ramHeading;
  turnToward(b,desired,b.heavy?1.5:2,dt);
  let pitch=clamp(Math.atan2(ty-b.y,Math.max(1,Math.hypot(tx-b.x,tz-b.z))),-.55,.55);
  if(b.y<=ALT_MIN+1&&pitch<0)pitch=0;if(b.y>=ALT_MAX-1&&pitch>0)pitch=0;
  b.p=lerp(b.p,pitch,Math.min(1,dt*2.5));const cp=Math.cos(b.p);
  b.x+=Math.cos(b.a)*cp*bs*dt;b.z+=Math.sin(b.a)*cp*bs*dt;b.y=clamp(b.y+Math.sin(b.p)*bs*dt,ALT_MIN,ALT_MAX);
  const canAttack=hostile&&player.alive&&b.phase==='attack'&&!b.attackSpent&&!(b.specialCharge>0)&&!(b.ramTime>0);
  if(canAttack){
   if(b.kind==='ace'&&!b.airframe&&b.mslCd<=0&&d>20&&d<90){launchMissile(b,true);b.mslCd=rand(9,13);enemyAttackSpent(b);}
   else if(d<50&&b.fireCd<=0){const f=fwdOf(b),off=Math.acos(clamp((dx*f[0]+dy*f[1]+dz*f[2])/Math.max(d,.001),-1,1));
    if(off<.22){fire(b,true);Sound.sfxEnemyShoot(b);b.fireCd=rand(2.5,4);enemyAttackSpent(b);}
   }
  }
  b.trailT-=dt;if(b.trailT<=0){const f=fwdOf(b);b.trailT=.09;addPart(b.x-f[0]*2.4*b.scale,b.y-f[1]*2.4*b.scale,b.z-f[2]*2.4*b.scale,0,.5,0,.5,.45*b.scale,0xffffff,.8);}
 }
 for(const b of bots)if(Math.hypot(b.x-player.x,b.z-player.z)>230){removeBot(b);b.dead=true;}
 bots=bots.filter(b=>!b.dead);
}

function hitBot(b, dmg) {
  if (b.dead) return;
  if (turrets.includes(b)) { hitTurret(b, dmg); return; }
  b.hp -= dmg;
  if (b.hp <= 0) { killBot(b); return; }
  for (let i = 0; i < 6; i++) addPart(b.x, b.y, b.z, rand(-6, 6), rand(-3, 6), rand(-6, 6), 0.35, 0.4, i % 2 ? 0xffe24a : 0xffffff);
  Sound.tone(520, 0.06, 'square', 0.05);
}
function killBot(b) {
  if (b.dead) return;
  b.dead = true; kills++; awardKill(b.x, b.y, b.z, b.pts);
  explode(b.x, b.y, b.z, b.heavy ? 1.6 : 1);
  if (dist3(b, player) < 60) shake = Math.max(shake, 0.16);
  removeBot(b);
  Sound.sfxBoom();
  if (b.kind === 'ace') spawnPickup('missile', b.x, b.z, clampAlt(b.y));
  else if (b.heavy || Math.random() < 0.45) spawnPickup('ammo', b.x, b.z, clampAlt(b.y));
  updateHud(true);
}
function hitTurret(t, dmg) {
  if (t.dead) return;
  t.hp -= dmg;
  for (let i = 0; i < 6; i++) addPart(t.x, t.y, t.z, rand(-6, 6), rand(0, 8), rand(-6, 6), 0.35, 0.4, i % 2 ? 0xffe24a : 0xffffff);
  if (t.hp > 0) { Sound.tone(420, 0.06, 'square', 0.05); return; }
  t.dead = true; kills++; awardKill(t.x, t.y, t.z, t.pts);
  explode(t.x, t.y, t.z, 1.4); Sound.sfxBoom();
  wreckTurret(t);
  spawnPickup('ammo', t.x, t.z, clampAlt(t.y + 12));
  updateHud(true);
}
function wreckTurret(t) { t.mesh.userData.head.visible = false; t.mesh.children[0].material = M(0x444a55); }
function updateTurrets(dt) {
  for (const t of turrets) {
    if (t.dead) continue;
    const dx = player.x - t.x, dy = player.y - t.y, dz = player.z - t.z, dh = Math.hypot(dx, dz);
    const { head, barrels } = t.mesh.userData;
    if (dh < 110) {
      head.rotation.y = -Math.atan2(dz, dx);
      barrels.rotation.z = -(Math.PI / 2 - Math.atan2(dy, Math.max(dh, 1)));
    }
    t.cd -= dt;
    if (t.stun > 0) { t.stun -= dt; if (Math.random() < dt * 10) addPart(t.x, t.y + 1, t.z, rand(-2, 2), rand(1, 4), rand(-2, 2), 0.3, 0.4, 0xb69dff, 0.4); continue; }
    if (state === 'playing' && player.alive && !playerHidden() && gameTime > 12 && dh < 80 && dy < 50 && t.cd <= 0) {
      // flak aimed at where the player is heading
      const f = fwdOf(player), lead = Math.hypot(dh, dy) / (botSpeed() + 30), ps = playerSpeed();
      const aim = { x: player.x + f[0] * ps * lead + rand(-2, 2), y: player.y + f[1] * ps * lead + rand(-1.5, 1.5), z: player.z + f[2] * ps * lead + rand(-2, 2) };
      fire({ x: t.x, y: t.y + 1.5, z: t.z, a: 0, p: 0 }, true, aim);
      Sound.sfxEnemyShoot();
      t.cd = rand(1.8, 2.8) / Math.min(1.8, 1 + gameTime / 150);
    }
  }
}
function updateMissiles(dt) {
  let warn = false;
  for (const m of missiles) {
    if (m.dead) continue;
    m.life -= dt;
    let tgt = m.target && !m.target.dead && (m.target.life === undefined || m.target.life > 0) ? m.target : null;
    if (m.sure && !tgt) {   // locked missile whose target died: take the nearest other one
      let bd = 150; for (const t of targetables()) { if (t.dead) continue; const d = dist3(t, m); if (d < bd) { bd = d; tgt = t; } }
      m.target = tgt;
    }
    if (tgt && m.sure) {   // guaranteed hit: perfect pursuit, always faster than the target
      m.spd = Math.max(m.spd, 70);
      const tx = tgt.x - m.x, ty = tgt.y - m.y, tz = tgt.z - m.z, tl = Math.hypot(tx, ty, tz) || 1, k = Math.min(1, dt * 9);
      let nx = lerp(m.vx / m.spd, tx / tl, k), ny = lerp(m.vy / m.spd, ty / tl, k), nz = lerp(m.vz / m.spd, tz / tl, k); const nl = Math.hypot(nx, ny, nz) || 1;
      m.vx = nx / nl * m.spd; m.vy = ny / nl * m.spd; m.vz = nz / nl * m.spd;
      if (tl < m.spd * dt * 1.5 || (m.life < 7.5 && tl < 12)) { m.x = tgt.x - m.vx * dt; m.y = tgt.y - m.vy * dt; m.z = tgt.z - m.vz * dt; }   // never overshoot
    } else if (tgt) {
      const tx = tgt.x - m.x, ty = tgt.y - m.y, tz = tgt.z - m.z, tl = Math.hypot(tx, ty, tz) || 1;
      const nx = m.vx / m.spd + tx / tl * m.turn * dt, ny = m.vy / m.spd + ty / tl * m.turn * dt, nz = m.vz / m.spd + tz / tl * m.turn * dt, nl = Math.hypot(nx, ny, nz) || 1;
      m.vx = nx / nl * m.spd; m.vy = ny / nl * m.spd; m.vz = nz / nl * m.spd;
    }
    m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    m.trailT -= dt;
    if (m.trailT <= 0) { m.trailT = 0.03; addPart(m.x - m.vx / m.spd * 1.5, m.y - m.vy / m.spd * 1.5, m.z - m.vz / m.spd * 1.5, 0, 0.3, 0, 0.6, 0.4, m.enemy ? 0xbbbbc8 : 0xffffff, 1.2); }
    if (m.enemy) {
      if (m.target === player) warn = true;
      if (tgt && tgt !== player && dist3(m, tgt) < 3) { explode(m.x, m.y, m.z, 0.5); removeMissile(m); continue; }   // fooled by a flare
      if (state === 'playing' && dist3(m, player) < 2.4) { explode(m.x, m.y, m.z, 0.8); removeMissile(m); damage(); continue; }
    } else {
      if (tgt && tgt.aceFlare && dist3(m, tgt) < 3) { explode(m.x, m.y, m.z, 0.7); removeMissile(m); continue; }   // the ace's flare took it
      for (const t of [...bots, ...turrets]) {
        if (!t.dead && dist3(m, t) < 3 * (t.scale || 1)) {
          explode(m.x, m.y, m.z, 1); Sound.sfxBoom();
          hitBot(t, m.dmg || 5);
          for (const o of bots) if (!o.dead && o !== t && dist3(o, m) < 6) hitBot(o, 2);   // splash
          removeMissile(m); break;
        }
      }
      if (!m.dead && boss && !boss.dead && bossDist(m) < 1) {
        explode(m.x, m.y, m.z, 1); Sound.sfxBoom(); hitBoss((m.dmg || 5) * (boss.titan ? (m.sure ? 3 : 2) : 1), m); flashReticle('hit'); removeMissile(m);
      }
      if (m.dead) continue;
    }
    if (m.life <= 0 || m.y < 0.5) { if (m.y < 0.5) addPart(m.x, 0.8, m.z, 0, 6, 0, 0.6, 1, 0xffffff, 1.5); removeMissile(m); }
  }
  missiles = missiles.filter(m => !m.dead);
  bots = bots.filter(b => !b.dead);
  // warning beeps while an enemy missile is chasing the player
  const w = warn && state === 'playing';
  $('mslWarn').hidden = !w;
  if (w) { mslWarnT -= dt; if (mslWarnT <= 0) { mslWarnT = 0.45; Sound.tone(1320, 0.08, 'square', 0.05); } }
  // flares
  for (const d of decoys) {
    d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.vy -= 4 * dt;
    if (Math.random() < 0.8) addPart(d.x, d.y, d.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.35, 0.7, Math.random() < 0.5 ? 0xffe08a : 0xff9f43, 0.4);
  }
  decoys = decoys.filter(d => d.life > 0);
}

function update(dt) {
  time += dt;
  seaTex.offset.x = (seaTex.offset.x + dt * 0.004) % 1;

  if (state === 'title' || state === 'garage' || state === 'daily') {
    player.a = wrapA(player.a + dt * 0.35);
    player.roll = lerp(player.roll, 0.35, dt * 3); player.p = 0;
    player.x += Math.cos(player.a) * 12 * dt; player.z += Math.sin(player.a) * 12 * dt;
    player.y = ALT + Math.sin(time * 2) * 0.3;
  } else if (state === 'ready') {
    player.roll = lerp(player.roll, 0, dt * 4);
    player.p = lerp(player.p, 0, dt * 4);
  } else if (state === 'playing') {
    gameTime += dt;
    updateSpecial(dt);
    updatePlayer(dt);
    updateTitanFlow(dt);
    updateAceFlow(dt);
    // forced speed-up notices
    const lvl = Math.floor(gameTime / 20);
    if (lvl > speedLevel && speedMul() < 2.6) { speedLevel = lvl; banner('SPEED UP', 'x' + speedMul().toFixed(1) + ' THRUST', '#62f5ec'); Sound.sfxSpeed(); }
    // enemies keep coming, more over time (none while the final boss owns the sky)
    botSpawnCd -= dt;
    if (!duelLock() && botSpawnCd <= 0 && bots.length < (boss ? Math.min(3, maxBotsNow()) : maxBotsNow())) { spawnBot(); botSpawnCd = rand(1.2, 2.4) / (1 + gameTime / 45); }
    updateBots(dt, !playerHidden());
    updateTurrets(dt);
    updateMissiles(dt);
    // pickups upkeep
    for (const p of pickups) if (Math.hypot(p.x - player.x, p.z - player.z) > 240) { removePickup(p); p.gone = true; }
    pickups = pickups.filter(p => !p.gone);
    if (pickups.filter(p => p.type === 'ammo').length < 7) spawnPickup('ammo');
    if (pickups.filter(p => p.type === 'missile').length < 2) spawnPickup('missile');
    heartCd -= dt;
    if (heartCd <= 0) { heartCd = 20; if (player.hp < maxHp() && !pickups.some(p => p.type === 'heart')) spawnPickup('heart'); }
    // pickup collection
    for (const p of pickups) {
      if (dist3(p, player) < 4) {
        p.gone = true; removePickup(p);
        if (p.type === 'ammo') { player.ammo = Math.min(maxAmmo(), player.ammo + ammoBox()); Sound.sfxAmmo(); bumpAmmo(); popup(p.x, p.y, p.z, '+' + ammoBox() + ' AMMO'); }
        else if (p.type === 'missile') { player.missiles = Math.min(9, player.missiles + 2); player.flares = Math.min(9, player.flares + 1); Sound.sfxAmmo(); toast('+2 MISSILES  +1 FLARE'); }
        else { player.hp = Math.min(maxHp(), player.hp + 1); Sound.sfxHeart(); popup(p.x, p.y, p.z, '+1 ♥', true); }
        for (let i = 0; i < 16; i++) addPart(p.x, p.y, p.z, rand(-10, 10), rand(-2, 10), rand(-10, 10), 0.55, 0.4, p.type === 'ammo' ? 0xffe24a : p.type === 'missile' ? 0xff5c5c : 0xff7a9c);
        shockwave(p.x, p.y, p.z, 5, p.type === 'ammo' ? 0xffe24a : p.type === 'missile' ? 0xff5c5c : 0xff7a9c, 0.35);
        updateHud(true);
      }
    }
    pickups = pickups.filter(p => !p.gone);
    // ramming
    for (const b of bots) {
      if (!b.dead && dist3(b, player) < (ramTime > 0 ? 4.8 : 3.4) * b.scale) { const hurt = player.invul <= 0 && ramTime <= 0; killBot(b); if (hurt) damage(); }
    }
    bots = bots.filter(b => !b.dead);
    if (boss && !boss.dead && bossDist(player) < 0.5 && player.invul <= 0) {
      if (ramTime > 0) { hitBoss(8, player); player.invul = 0.8; shake = 0.3; }
      else damage();
    }
    updateBoss(dt, true);
    updateCombo(dt);
    updateTips(dt);
    // player trail
    player.trailT -= dt;
    if (player.trailT <= 0) { const f = fwdOf(player); player.trailT = 0.05; addPart(player.x - f[0] * 2.6, player.y - f[1] * 2.6, player.z - f[2] * 2.6, 0, 0.5, 0, 0.55, 0.5, 0xffffff, 0.8); }
  } else if (state === 'dying' || state === 'over') {
    if (player.alive) {   // spiral down into the sea
      const fallT = 1.6 - dieTimer;
      player.x += Math.cos(player.a) * 8 * dt; player.z += Math.sin(player.a) * 8 * dt;
      player.y -= dt * (10 + Math.max(0, fallT) * 40);
      player.roll += dt * 9; player.p = lerp(player.p, -0.9, dt * 2);
      if (Math.random() < 0.5) addPart(player.x, player.y, player.z, rand(-1, 1), 2, rand(-1, 1), 0.9, rand(0.8, 1.3), 0x55556a, 1.4);
      if (player.y <= 0.8) {
        player.alive = false; player.mesh.visible = false;
        for (let i = 0; i < 30; i++) addPart(player.x, 0.8, player.z, rand(-7, 7), rand(6, 16), rand(-7, 7), rand(0.5, 1), rand(0.5, 1), i % 2 ? 0xffffff : 0x9fe0ff);
      }
    }
    if (state === 'dying') { dieTimer -= dt; if (dieTimer <= 0) showOver(); }
    updateBots(dt, false);
    updateBoss(dt, false);
    updateTurrets(dt);
    updateMissiles(dt);
  }

  // bullets
  if (state === 'playing' || state === 'dying' || state === 'over') {
    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
      if (b.y < 0.3) b.life = 0;
      if (b.enemy) {
        if (state === 'playing' && dist3(b, player) < (b.r || 1.9)) { b.life = 0; damage(); }
      } else {
        for (const bot of bots) {
          if (!bot.dead && dist3(b, bot) < 2.5 * bot.scale) { b.life = 0; hitBot(bot, gunDmg()); flashReticle('hit'); break; }
        }
        if (b.life > 0) for (const t of turrets) {
          if (!t.dead && dist3(b, t) < 3) { b.life = 0; hitTurret(t, gunDmg()); flashReticle('hit'); break; }
        }
        if (b.life > 0 && boss && !boss.dead && !(boss.dodgeT > 0) && bossDist(b) < 0) { b.life = 0; hitBoss(gunDmg(), b); flashReticle('hit'); }
      }
    }
    bullets = bullets.filter(b => b.life > 0);
    bots = bots.filter(b => !b.dead);
  }

  // pickups animation
  for (const p of pickups) {
    p.t += dt;
    p.mesh.userData.inner.rotation.y = p.t * 1.6;
    p.mesh.userData.inner.position.y = Math.sin(p.t * 3) * 0.4;
    p.mesh.userData.ring.scale.setScalar(2.2 + Math.sin(p.t * 4) * 0.25);
  }

  // particles
  for (const p of parts) { p.life -= dt; if (p.grav) p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.96; p.vz *= 0.96; p.vy *= 0.96; }
  parts = parts.filter(p => p.life > 0);
  if (shake > 0) shake -= dt;

  // meshes
  player.mesh.visible = player.alive && adsK < 0.6 && !(player.invul > 0 && state === 'playing' && Math.floor(time * 12) % 2 === 0) && !(cloakTime > 0 && Math.floor(time * 20) % 3 !== 0);
  if (shieldMesh.visible) { shieldMesh.position.set(player.x, player.y, player.z); shieldMesh.material.opacity = 0.16 + Math.sin(time * 9) * 0.06; }
  orientPlane(player, dt);
  for (const b of bots) orientPlane(b, dt);
  for (const m of missiles) {
    if (m.hideT > 0 && (m.hideT -= dt) <= 0) m.mesh.visible = true;
    m.mesh.position.set(m.x, m.y, m.z);
    m.mesh.rotation.set(0, -Math.atan2(m.vz, m.vx), Math.atan2(m.vy, Math.hypot(m.vx, m.vz)), 'YZX');
  }
  if (state === 'playing' || state === 'ready') updateHud(false);
}

// ---------- camera & render ----------
const camPos = new THREE.Vector3(0, ALT + 5, 12), camLook = new THREE.Vector3(0, ALT, -20);
let camK = 1, camA = -Math.PI / 2, camP = 0, adsK = 0, baseFov = 60, fovKick = 1;
function snapCamera() { camA = player.a; camP = player.p || 0; }
function updateCamera(dt) {
  adsK = lerp(adsK, aiming() ? 1 : 0, Math.min(1, dt * 10));
  fovKick = lerp(fovKick, state === 'playing' && ramTime > 0 ? 1.16 : 1, Math.min(1, dt * 6));
  if (state !== 'dying' && state !== 'over') {
    const lag = wrapA(player.a - camA);
    camA = Math.abs(lag) > 1.4 ? player.a : wrapA(camA + lag * Math.min(1, dt * 8));
    camP = lerp(camP, player.p || 0, Math.min(1, dt * 6));
    const cp = Math.cos(camP * 0.8), spp = Math.sin(camP * 0.8);
    const fx = Math.cos(camA) * cp, fy = spp, fz = Math.sin(camA) * cp, lx = Math.sin(camA), lz = -Math.cos(camA);   // forward / left
    const B = lerp(15 * camK, -1.2, adsK), L = lerp(5.5 * camK, 0, adsK), U = lerp(5.8 * camK, 0.9, adsK);   // ADS = cockpit view
    camPos.set(player.x - fx * B + lx * L, Math.max(2.5, player.y - fy * B + U), player.z - fz * B + lz * L);
    const lf = [Math.cos(camA) * Math.cos(camP), Math.sin(camP), Math.sin(camA) * Math.cos(camP)];
    camLook.set(player.x + lf[0] * 40 + lx * 1.5 * (1 - adsK), player.y + lf[1] * 40 + 1.2 * (1 - adsK), player.z + lf[2] * 40 + lz * 1.5 * (1 - adsK));
  } else {
    camLook.lerp(_v.set(player.x, Math.max(player.y, 1), player.z), Math.min(1, dt * 3));
  }
  const fov = lerp(baseFov, baseFov * 0.62, adsK) * fovKick;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(_v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * 1.2));
  camera.lookAt(camLook);
  const fx = Math.cos(camA), fz = Math.sin(camA);
  sun.target.position.set(player.x + fx * 35, 0, player.z + fz * 35);
  sun.position.set(sun.target.position.x + 30, 90, sun.target.position.z + 25);
}

// ---------- aim UI: crosshair, enemy / turret / missile markers, off-screen arrows, steering pad ----------
const reticle = $('reticle'), markerBox = $('markers'), steerKnob = $('steerKnob');
const MARKS = [], PICKS = [];
for (let i = 0; i < 18; i++) {
  const m = document.createElement('div'); m.className = 'mk'; m.innerHTML = '<i></i><b></b>'; m.hidden = true; markerBox.appendChild(m); MARKS.push(m);
}
for (let i = 0; i < 10; i++) { const q = document.createElement('div'); q.className = 'pk'; q.hidden = true; markerBox.appendChild(q); PICKS.push(q); }
const _pv = new THREE.Vector3();
function toScreen(x, y, z) {
  _pv.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
  if (_pv.z > -1) return null;                        // behind the camera
  _pv.set(x, y, z).project(camera);
  return { x: (_pv.x + 1) / 2 * window.innerWidth, y: (1 - _pv.y) / 2 * window.innerHeight };
}
function updateAimUI() {
  const show = state === 'playing' || state === 'ready';
  reticle.hidden = !show; markerBox.hidden = !show; $('steerPad').hidden = !show;
  if (!show) { $('mslWarn').hidden = true; return; }
  const W = window.innerWidth, H = window.innerHeight;
  // crosshair: where the guns point
  const f = fwdOf(player);
  const r = toScreen(player.x + f[0] * 45, player.y + f[1] * 45, player.z + f[2] * 45);
  if (r) { reticle.style.transform = `translate(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px)`; reticleAt = r; }
  reticle.classList.toggle('ads', aiming());
  // markers: enemy planes, turrets in range, missiles chasing you
  const list = [];
  for (const b of bots) if (Math.hypot(b.x - player.x, b.z - player.z) < 170) list.push({ o: b, cls: b.kind === 'ace' ? 'ace' : '', lbl: b.airframe ? (b.specialCharge > 0 ? 'CHARGING ' : b.airframe.toUpperCase() + ' ') : b.kind === 'ace' ? 'ACE ' : b.heavy ? 'HEAVY ' : '' });
  for (const t of turrets) if (!t.dead && Math.hypot(t.x - player.x, t.z - player.z) < 110) list.push({ o: t, cls: 'tur', lbl: 'AA ', noArrow: true });
  for (const m of missiles) if (m.enemy && m.target === player) list.push({ o: m, cls: 'msl', lbl: 'MISSILE ' });
  if (boss && !boss.dead && !(boss.cloakT > 0)) list.unshift({ o: boss, cls: 'boss', lbl: boss.titan ? 'TITAN ' : boss.ace ? (boss.ramCharge > 0 || boss.ramT > 0 ? 'RAM! ' : boss.shieldT > 0 ? 'SHIELD ' : 'ACE ') : 'BOSS ' });
  let n = 0;
  for (const it of list) {
    if (n >= MARKS.length) break;
    const b = it.o, dx = b.x - player.x, dz = b.z - player.z, d = Math.hypot(dx, b.y - player.y, dz);
    const p = toScreen(b.x, b.y + 0.6 * (b.scale || 1), b.z);
    const on = p && p.x > 20 && p.x < W - 20 && p.y > 20 && p.y < H - 20;
    if (!on && it.noArrow) continue;
    if (on && b.lock > 0 && aiming()) continue;
    const m = MARKS[n++]; m.hidden = false;
    if (on) {
      const sz = clamp(900 * (b.scale || 1) / Math.max(d, 1), 24, b.titan ? 160 : 90);
      m.className = 'mk ' + it.cls;
      m.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
      m.firstChild.style.width = m.firstChild.style.height = sz.toFixed(0) + 'px';
      m.lastChild.textContent = it.lbl + Math.round(d) + 'm'; m.lastChild.style.top = (sz / 2 + 4).toFixed(0) + 'px';
    } else {
      const rel = p ? Math.atan2(p.x - W / 2, -(p.y - H / 2)) : wrapA(Math.atan2(dz, dx) - camA);   // 0 = up / straight ahead
      const R0 = Math.min(W, H) * 0.42, ax = W / 2 + Math.sin(rel) * R0, ay = H / 2 - Math.cos(rel) * R0;
      m.className = 'mk off ' + it.cls + (d < 45 || it.cls === 'msl' ? ' near' : '');
      m.style.transform = `translate(${ax.toFixed(1)}px,${ay.toFixed(1)}px) rotate(${rel.toFixed(3)}rad)`;
      m.firstChild.style.width = m.firstChild.style.height = '';
      m.lastChild.textContent = '';
    }
  }
  for (; n < MARKS.length; n++) MARKS[n].hidden = true;
  // pickup markers (on screen only)
  n = 0;
  for (const pk of pickups) {
    if (n >= PICKS.length) break;
    if (dist3(pk, player) > 130) continue;
    const p = toScreen(pk.x, pk.y + 3.2, pk.z);
    if (!p || p.x < 0 || p.x > W || p.y < 0 || p.y > H) continue;
    const q = PICKS[n++]; q.hidden = false; q.className = 'pk ' + pk.type;
    q.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
  }
  for (; n < PICKS.length; n++) PICKS[n].hidden = true;
  steerKnob.style.transform = `translate(${(steerNow * 22).toFixed(1)}px,${(-climbNow * 22).toFixed(1)}px)`;
  updatePopups();
}

function syncInstances() {
  let n = 0;
  for (const b of bullets) {
    if (b.profile === 'orb') {
      const s = 1.35 + Math.sin(time * 20 + n) * 0.2;
      _q.identity();
      _m4.compose(_v.set(b.x, b.y, b.z), _q, _s.set(s, s, s));
      bulletMesh.setMatrixAt(n, _m4);
      bulletMesh.setColorAt(n, _c.set(n % 3 ? 0xff3bd4 : 0xffd2f4));
      n++; continue;
    }
    _q.setFromEuler(_e.set(0, -Math.atan2(b.vz, b.vx), Math.atan2(b.vy, Math.hypot(b.vx, b.vz)), 'YZX'));
    const beam=b.profile==='laser'||b.profile==='ion';
    _m4.compose(_v.set(b.x,b.y,b.z),_q,beam?_s.set(2.8,.22,.22):b.profile==='cannon'?_s.set(1.35,.65,.65):_s.set(1,.42,.42));
    bulletMesh.setMatrixAt(n, _m4);
    bulletMesh.setColorAt(n, _c.set(b.enemy ? 0xff5264 : SHOT_COLORS[b.profile] || 0xfff04a));
    n++;
  }
  bulletMesh.count = n;
  bulletMesh.instanceMatrix.needsUpdate = true; if (bulletMesh.instanceColor) bulletMesh.instanceColor.needsUpdate = true;
  n = 0;
  _q.identity();
  for (const p of parts) {
    const f = p.life / p.max;
    const s = p.grow ? p.size * (0.6 + (1 - f) * p.grow) * Math.min(1, f * 3) : p.size * f;
    _m4.compose(_v.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
    partMesh.setMatrixAt(n, _m4); partMesh.setColorAt(n, _c.set(p.color)); n++;
  }
  partMesh.count = n;
  partMesh.instanceMatrix.needsUpdate = true; if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
}

// radar (heading-up, 160 units). ▲ = above you, ▼ = below you
const rctx = $('radar').getContext('2d');
function drawRadar() {
  if ($('radar').classList.contains('hidden')) return;
  const S = 260, R = 124, range = 160, cx = S / 2;
  rctx.clearRect(0, 0, S, S);
  rctx.fillStyle = 'rgba(58,35,80,0.55)'; rctx.beginPath(); rctx.arc(cx, cx, R, 0, Math.PI * 2); rctx.fill();
  rctx.strokeStyle = 'rgba(255,255,255,0.35)'; rctx.lineWidth = 3;
  rctx.beginPath(); rctx.arc(cx, cx, R * 0.5, 0, Math.PI * 2); rctx.stroke();
  rctx.strokeStyle = '#fff'; rctx.lineWidth = 6; rctx.beginPath(); rctx.arc(cx, cx, R, 0, Math.PI * 2); rctx.stroke();
  rctx.save(); rctx.beginPath(); rctx.arc(cx, cx, R - 3, 0, Math.PI * 2); rctx.clip();
  const rot = -player.a - Math.PI / 2, cr = Math.cos(rot), sr = Math.sin(rot);
  rctx.save(); rctx.translate(cx, cx); rctx.rotate(rot); rctx.translate(-cx, -cx);
  rctx.strokeStyle = '#ff4d6d'; rctx.lineWidth = 5;
  rctx.strokeRect(cx + (-MAP - player.x) / range * R, cx + (-MAP - player.z) / range * R, MAP * 2 / range * R, MAP * 2 / range * R);
  rctx.restore();
  const dot = (o, col, r, shape) => {
    let dx = (o.x - player.x) / range * R, dz = (o.z - player.z) / range * R;
    const d = Math.hypot(dx, dz); if (d > R - 8) { dx *= (R - 8) / d; dz *= (R - 8) / d; }
    const x = cx + dx * cr - dz * sr, y = cx + dx * sr + dz * cr, dy = (o.y || 0) - player.y;
    rctx.fillStyle = col; rctx.beginPath();
    if (shape === 'sq') rctx.rect(x - r, y - r, r * 2, r * 2);
    else if (dy > 8) { rctx.moveTo(x, y - r * 1.2); rctx.lineTo(x + r, y + r * 0.8); rctx.lineTo(x - r, y + r * 0.8); }
    else if (dy < -8) { rctx.moveTo(x, y + r * 1.2); rctx.lineTo(x + r, y - r * 0.8); rctx.lineTo(x - r, y - r * 0.8); }
    else rctx.arc(x, y, r, 0, Math.PI * 2);
    rctx.fill();
  };
  for (const p of pickups) dot(p, p.type === 'ammo' ? '#ffe24a' : p.type === 'missile' ? '#ff9f43' : '#ff7a9c', 7);
  for (const t of turrets) if (!t.dead) dot(t, '#ffa94d', 7, 'sq');
  for (const b of bots) dot(b, b.kind === 'ace' ? '#ff00aa' : '#ff3b3b', b.heavy ? 11 : 9);
  if (boss && !boss.dead && !(boss.cloakT > 0)) dot(boss, boss.titan ? (Math.floor(time * 6) % 2 ? '#ff2d55' : '#ffd24a') : '#ffbb58', boss.titan ? 20 : 15, 'sq');
  rctx.restore();
  rctx.save(); rctx.translate(cx, cx); rctx.rotate(-Math.PI / 2);
  rctx.fillStyle = '#fff'; rctx.beginPath(); rctx.moveTo(16, 0); rctx.lineTo(-10, 10); rctx.lineTo(-5, 0); rctx.lineTo(-10, -10); rctx.closePath(); rctx.fill();
  rctx.restore();
}

// ---------- HUD ----------
let hudCache = '';
function updateHud(force) {
  const key = [scoreNow(), player.hp, maxHp(), player.ammo, player.missiles, player.flares, speedMul().toFixed(1), Math.round(player.y)].join('|');
  if (!force && key === hudCache) return;
  hudCache = key;
  $('score').innerHTML = scoreNow() + '<small> pts</small>';
  let h = '';
  for (let i = 0; i < maxHp(); i++) h += '<span class="h' + (i < player.hp ? '' : ' off') + '">&#9829;</span>';
  $('hearts').innerHTML = h;
  $('ammo').textContent = player.ammo;
  $('ammoRow').classList.toggle('empty', player.ammo === 0);
  $('ammoRow').classList.toggle('low', player.ammo > 0 && player.ammo <= 5);
  $('lowHp').classList.toggle('on', state === 'playing' && player.hp === 1 && maxHp() > 1);
  $('speed').textContent = 'SPEED x' + speedMul().toFixed(1) + '  ALT ' + Math.round(player.y * 5) + 'm';
  $('mslN').textContent = player.missiles;
  $('flrN').textContent = player.flares;
  $('btnMsl').classList.toggle('empty', player.missiles === 0);
  $('btnFlare').classList.toggle('empty', player.flares === 0);
}
function bumpAmmo() { const r = $('ammoRow'); r.classList.add('bump'); setTimeout(() => r.classList.remove('bump'), 150); }

let toastT = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000);
}

function resize() {
  const w = window.innerWidth || 960, h = window.innerHeight || 600;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  baseFov = w / h < 1 ? 80 : w / h < 1.3 ? 68 : 60;
  camera.fov = baseFov;
  camK = w / h < 0.8 ? 1.2 : 1;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const raw = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  let dt = raw;
  if (slowT > 0) { slowT -= raw; dt *= slowScale; if (slowT <= 0) slowScale = 1; }
  if (state !== 'paused' && state !== 'loading') update(dt);
  updateCamera(dt);
  updateEngineAudio();
  renderPreview(raw);
  camera.updateMatrixWorld();
  updateAimUI();
  updateLocks(dt);
  updateNova(dt);
  updateCombatFx(dt, raw);
  updateSpecialHud();
  syncInstances();
  drawRadar();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- input wiring ----------
const cvs = $('c');
cvs.addEventListener('pointerdown', e => {
  e.preventDefault();
  Sound.init();
  if (e.pointerType === 'mouse') {
    input.pointerMode = 'mouse';
    input.mouseX = e.clientX; input.mouseY = e.clientY; input.mouseActive = true;
    if (e.button === 2) { if (state === 'playing') input.ads = true; return; }   // right button: aim down sights
    if (e.button !== 0) return;
    if (state === 'ready') { beginPlaying(); return; }   // the first click only starts the flight
    if (state === 'playing') input.mouseFire = true;
  } else {
    input.pointerMode = 'touch'; input.mouseActive = false;
    if (input.touchId === null) { cvs.setPointerCapture(e.pointerId); input.touchId = e.pointerId; input.touchX = input.touchX0 = e.clientX; input.touchY = input.touchY0 = e.clientY; }
    if (state === 'ready') beginPlaying();
  }
});
window.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' && input.pointerMode !== 'touch' && (!IS_TOUCH || e.buttons)) { input.mouseX = e.clientX; input.mouseY = e.clientY; input.mouseActive = true; }
  else if (e.pointerId === input.touchId) { input.touchX = e.clientX; input.touchY = e.clientY; }
});
const endPointer = e => {
  if (e.pointerType === 'mouse') { if (e.button === 2) input.ads = false; else input.mouseFire = false; }
  if (e.pointerId === input.touchId) {
    input.touchId = null; input.mouseActive = false; steerNow = 0; climbNow = 0;
    input.touchX = input.touchX0; input.touchY = input.touchY0;
  }
  if (IS_TOUCH && e.pointerType === 'mouse') { input.mouseActive = false; steerNow = 0; climbNow = 0; }
};
window.addEventListener('pointerup', endPointer);
document.addEventListener('mouseleave', () => { input.mouseActive = false; });
window.addEventListener('pointercancel', endPointer);
cvs.addEventListener('lostpointercapture', endPointer);
window.addEventListener('blur', () => { clearInput(); if (state === 'playing') pauseGame(); });
document.addEventListener('contextmenu', e => e.preventDefault());

const fireBtn = $('btnFire');
fireBtn.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation(); Sound.init();
  if (state === 'ready') beginPlaying();
  if (state === 'playing') { input.touchFire = true; fireBtn.classList.add('on'); }
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) fireBtn.addEventListener(ev, () => { input.touchFire = false; fireBtn.classList.remove('on'); });
function tapBtn(id, fn) {   // weapon buttons: act on press, never steer or shoot the gun
  $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Sound.init(); if (state === 'ready') beginPlaying(); fn(); });
}
tapBtn('btnMsl', playerMissile);
tapBtn('btnFlare', playerFlare);
tapBtn('btnAds', () => { if (state !== 'playing') return; input.adsToggle = !input.adsToggle; $('btnAds').classList.toggle('on', input.adsToggle); });

const KEY_LEFT = ['ArrowLeft', 'KeyA'], KEY_RIGHT = ['ArrowRight', 'KeyD'], KEY_UP = ['ArrowUp', 'KeyW'], KEY_DOWN = ['ArrowDown', 'KeyS'];
const KEY_FIRE = ['Space', 'KeyJ', 'Enter'], KEY_MSL = ['KeyE', 'KeyK'], KEY_FLARE = ['KeyF', 'KeyL'], KEY_ADS = ['ShiftLeft', 'ShiftRight'];
const GAME_KEYS = [...KEY_LEFT, ...KEY_RIGHT, ...KEY_UP, ...KEY_DOWN, ...KEY_FIRE, ...KEY_MSL, ...KEY_FLARE, ...KEY_ADS];
window.addEventListener('keydown', e => {
  if ($('audioDialog').open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const c = e.code;
  if (GAME_KEYS.includes(c)) {
    if (state === 'title' && (c === 'Space' || c === 'Enter')) { e.preventDefault(); if (!e.repeat) { Sound.init(); Sound.sfxClick(); startRun(); } return; }
    if (state === 'over' && (c === 'Space' || c === 'Enter')) { e.preventDefault(); if (!e.repeat && !busy && performance.now() - overShownAt > 700) $('btnAgain').click(); return; }
    if (state !== 'ready' && state !== 'playing') { if (c === 'Space') e.preventDefault(); return; }
    e.preventDefault(); Sound.init();
    if (state === 'ready') { if (!e.repeat) beginPlaying(); if (KEY_FIRE.includes(c)) return; }
    if (KEY_LEFT.includes(c)) { input.left = true; input.mouseActive = false; }
    if (KEY_RIGHT.includes(c)) { input.right = true; input.mouseActive = false; }
    if (KEY_UP.includes(c)) { input.up = true; input.mouseActive = false; }
    if (KEY_DOWN.includes(c)) { input.down = true; input.mouseActive = false; }
    if (KEY_FIRE.includes(c) && state === 'playing' && !e.repeat) input.keyFire = true;
    if (KEY_MSL.includes(c) && !e.repeat) playerMissile();
    if (KEY_FLARE.includes(c) && !e.repeat) playerFlare();
    if (KEY_ADS.includes(c)) input.ads = true;
  } else if (c === 'Escape' || c === 'KeyP') {
    if (state === 'playing' || state === 'ready') pauseGame();
    else if (state === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', e => {
  const c = e.code;
  if (KEY_LEFT.includes(c)) input.left = false;
  if (KEY_RIGHT.includes(c)) input.right = false;
  if (KEY_UP.includes(c)) input.up = false;
  if (KEY_DOWN.includes(c)) input.down = false;
  if (KEY_FIRE.includes(c)) input.keyFire = false;
  if (KEY_ADS.includes(c)) input.ads = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInput(); if (state === 'playing' || state === 'ready') pauseGame(); Sound.setHidden(true); }
  else Sound.setHidden(false);
});

function onBtn(id, fn) {
  $(id).addEventListener('click', e => { e.preventDefault(); e.currentTarget.blur(); Sound.init(); fn(); });
  $(id).addEventListener('pointerdown', e => e.stopPropagation());
}
onBtn('btnPlay', () => { if (state !== 'title') return; Sound.sfxClick(); startRun(); });
onBtn('btnGarage', () => { if (state !== 'title') return; Sound.sfxClick(); openGarage(); });
onBtn('btnDaily', () => { if (state !== 'title') return; Sound.sfxClick(); openDaily(); });
onBtn('btnClaim', () => { Sound.sfxClick(); claimDaily(); });
onBtn('btnDailyClose', () => { if (state !== 'daily') return; Sound.sfxClick(); toTitle(); });
onBtn('btnGarageBack', () => { if (state !== 'garage') return; Sound.sfxClick(); toTitle(); });
onBtn('btnGaragePlay', () => { if (state !== 'garage') return; Sound.sfxClick(); startRun(); });
onBtn('btnPause', () => { Sound.sfxClick(); pauseGame(); });
onBtn('btnResume', () => { Sound.sfxClick(); resumeGame(); });
onBtn('btnPauseMenu', () => { if (state !== 'paused') return; Sound.sfxClick(); toTitle(); });
onBtn('btnMute', () => { Sound.setMuted(!Sound.muted); if (!Sound.muted) Sound.sfxClick(); });
onBtn('btnOverGarage', () => { if (state !== 'over' || busy) return; Sound.sfxClick(); openGarage(); });
onBtn('btnRevive', async () => {
  if (state !== 'over' || busy || revived) return;
  busy = true; setOverButtons(false);
  $('btnRevive').textContent = 'Loading ad...';
  const r = await CG.ad('rewarded');
  busy = false;
  if (state !== 'over') return;
  if (r === 'ok' || r === 'noads') { lastAdTime = Date.now(); revive(); }
  else {
    $('btnRevive').innerHTML = '<span class="adTag">AD</span>CONTINUE';
    setOverButtons(true);
    toast('No ad available right now. Try again later!');
  }
});
onBtn('btnAgain', async () => {
  if (state !== 'over' || busy) return;
  Sound.sfxClick();
  if (CG.active && Date.now() - lastAdTime > 120000) {
    busy = true; setOverButtons(false);
    lastAdTime = Date.now();
    await CG.ad('midgame');
    busy = false;
    if (state !== 'over') return;
  }
  startRun();
});
