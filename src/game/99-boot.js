// ---------- boot ----------
$('titleKeys').innerHTML = IS_TOUCH
  ? ['Drag anywhere to steer &amp; climb', 'FIRE to shoot', 'MSL / FLARE / SPECIAL buttons', 'AIM to lock on'].map(t => `<span style="white-space:nowrap">${t}</span>`).join(' &middot; ')
  : ['Mouse or WASD: steer &amp; climb', 'Click / Space: fire', 'Right-click / Shift: aim &amp; lock-on', 'E: missile', 'F: flare', 'Q: special'].map(t => `<span style="white-space:nowrap">${t}</span>`).join(' &middot; ');
if (IS_TOUCH) document.body.classList.add('touch');
if (IS_TOUCH) $('mslWarn').innerHTML = 'MISSILE! &nbsp;TAP FLARE';
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
loadCheckpoints(await Store.get('checkpoints'));
tutorialDone = (await Store.get('tut')) === '1';
// test hook: open the page with #fortress / #titan / #ace / #carrier to start at that stage's boss
{ const hw = { '#fortress': 1, '#titan': 2, '#ace': 3, '#carrier': 4 }[location.hash]; if (hw) window.__warpStage = hw; }
applyLook();
updateMuteBtn();
lastAdTime = Date.now();
CG.loadingStop();
$('loading').classList.add('hidden');
toTitle();
// Daily rewards remain available from the menu without blocking first play.
// test hook: #dbg exposes the module scope for headless checks
if (location.hash === '#dbg') window.__dbg = { ev: s => eval(s) };
