
// ---------- boot ----------
$('titleKeys').innerHTML = IS_TOUCH
  ? ['Drag anywhere to steer &amp; climb', 'FIRE to shoot', 'MSL / FLARE / SPECIAL buttons', 'AIM to lock on'].map(t => `<span style="white-space:nowrap">${t}</span>`).join(' &middot; ')
  : ['Mouse or WASD: steer &amp; climb', 'Click / Space: fire', 'Right-click / Shift: aim &amp; lock-on', 'E: missile', 'F: flare', 'Q: special'].map(t => `<span style="white-space:nowrap">${t}</span>`).join(' &middot; ');
if (IS_TOUCH) document.body.classList.add('touch');
resize();
requestAnimationFrame(frame);
await CG.init();
CG.loadingStart();
const b0 = parseInt(await Store.get('best'), 10);
best = isFinite(b0) && b0 > 0 ? b0 : 0;
Sound.muted = (await Store.get('muted')) === '1';
loadGarage(await Store.get('garage'));
// ===== TEST BUILD: everything unlocked (separate save, never ship this file) =====
garage.coins = Math.max(garage.coins, 99999);
garage.planes = PLANES.map(p => p.id); garage.paints = PAINTS.map(p => p.id);
for (const [slot, items] of Object.entries(PARTS)) garage.ownedParts[slot] = items.map(p => p.id);
saveGarage();
loadAudio(await Store.get('audio'));
tutorialDone = (await Store.get('tut')) === '1';
// test hook: open the page with #titan to jump straight to 2:55
if (location.hash === '#ace') {
  window.__skipToAce = true;
  window.__dbg = { set: o => { if (boss) Object.assign(boss, o); player.invul = 999; player.ammo = 99; }, face: () => { if (boss) player.a = Math.atan2(boss.z - player.z, boss.x - player.x); }, msl: () => { if (!boss) return; player.a = Math.atan2(boss.z - player.z, boss.x - player.x); const m = launchMissile(player, false); m.target = boss; m.sure = true; m.life = 9; m.turn = 10; }, shoot: () => { if (!boss) return; const dx = boss.x - player.x, dy = boss.y - player.y, dz = boss.z - player.z, l = Math.hypot(dx, dy, dz), v = 80; bullets.push({ x: player.x, y: player.y, z: player.z, vx: dx / l * v, vy: dy / l * v, vz: dz / l * v, life: 1.5, enemy: false, profile: 'ballistic' }); }, hit: d => boss && hitBoss(d, player), info: () => ({ state, acePhase, boss: boss && { hp: boss.hp, max: boss.max, phase: boss.phase, dead: boss.dead, shield: boss.shieldT, flares: boss.flares, dodges: boss.dodges, cloak: boss.cloakT, ram: boss.ramT, ramCharge: boss.ramCharge, d: Math.round(dist3(boss, player)) } }) };
}
if (location.hash === '#titan') {
  window.__skipToTitan = true;
  window.__dbg = { hit: d => boss && hitBoss(d, boss), face: () => { if (boss) { player.a = Math.atan2(boss.z - player.z, boss.x - player.x); player.invul = 99; } }, info: () => ({ state, titanPhase, boss: boss && { hp: boss.hp, max: boss.max, phase: boss.phase, dead: boss.dead }, bullets: bullets.length }) };
}
applyLook();
updateMuteBtn();
lastAdTime = Date.now();
CG.loadingStop();
$('loading').classList.add('hidden');
toTitle();
// Daily rewards remain available from the menu without blocking first play.
