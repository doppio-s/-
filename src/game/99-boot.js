// ---------- boot ----------
$("titleKeys").innerHTML = IS_TOUCH ? ["Drag anywhere for a joystick", "BOOST / BRAKE on the left", "FIRE to shoot", "MSL / FLARE / SPECIAL buttons", "AIM to lock on"].map(t => `<span style="white-space:nowrap">${t}</span>`).join(" &middot; ") : ["Mouse or WASD: bank &amp; pitch", "Shift: boost (heat)", "Z: brake", "Click / Space: fire", "Right-click / X: aim &amp; lock-on", "E: missile", "F: flare", "Q: special"].map(t => `<span style="white-space:nowrap">${t}</span>`).join(" &middot; "), IS_TOUCH && document.body.classList.add("touch"), IS_TOUCH && ($("mslWarn").innerHTML = "MISSILE! &nbsp;TAP FLARE"), resize(), requestAnimationFrame(frame), await CG.init(), CG.loadingStart();
const b0 = parseInt(await Store.get("best"), 10);
best = isFinite(b0) && b0 > 0 ? b0 : 0, Sound.muted = await Store.get("muted") === "1", loadGarage(await Store.get("garage"));
/*TEST{*/
// TEST BUILD: everything unlocked (separate save slot)
garage.coins = Math.max(garage.coins, 99999), garage.planes = PLANES.map(p => p.id), garage.paints = PAINTS.map(p => p.id);
for (const [slot, items] of Object.entries(PARTS)) garage.ownedParts[slot] = items.map(p => p.id);
saveGarage();
/*}TEST*/
loadAudio(await Store.get("audio")), loadControls(await Store.get("controls")), loadCheckpoints(await Store.get("checkpoints")), resumeCp = clamp(parseInt(await Store.get("resume"), 10) || 0, 0, 5), clearCount = parseInt(await Store.get("clears"), 10) || 0, renderClears(), renderCheckpoints(), tutorialDone = await Store.get("tut10") === "1";
/*TEST{*/{ const hw = { '#fortress': 1, '#titan': 2, '#ace': 3, '#carrier': 4 }[location.hash]; hw && (window.__warpStage = hw); }/*}TEST*/
applyLook(), updateMuteBtn(), lastAdTime = Date.now(), CG.loadingStop(), $("loading").classList.add("hidden"), toTitle();
/*TEST{*/
// test hooks: #dbg exposes the module scope for headless checks; #serpent warps to stage 5
location.hash === "#dbg" && (window.__dbg = { ev: s => eval(s) });
location.hash === '#serpent' && (window.__warpStage = 5);
/*}TEST*/
