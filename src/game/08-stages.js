// ================= v6: stages, waves and in-run upgrades =================
const STAGES = [
  { name: 'OCEAN ISLES', boss: 'fortress', col: '#62f5ec' },
  { name: 'DESERT CANYON', boss: 'titan', col: '#ffb13b' },
  { name: 'DEEP SPACE', boss: 'ace', col: '#c9a8ff', line: 'NO GROUND, NO CEILING &middot; CLIMB, DIVE AND THREAD THE RINGS' },
  { name: 'NIGHT FRONT', boss: 'carrier', col: '#8fb4ff' },
];
// difficulty clock (lvT) for waves 1-3 of each stage; every lap of the 4 stages adds LAP_T
const WAVE_T = [[15, 40, 65], [90, 110, 130], [150, 170, 190], [205, 225, 245]], LAP_T = 70;
let stage = 1, wave = 0, dirPhase = 'none', dirT = 0, waveKills = 0, waveQuota = 0, bossSeen = false, lvT = 0, dirCine = false, pendingNext = null;
const run = { fire: 0, dmg: 0, hp: 0, msl: 0, spd: 0, cd: 0, ammo: 0, mag: 0, lock: 0, flare: 0 };
function resetRun() { for (const k of Object.keys(run)) run[k] = 0; }
const stageIdx = () => (stage - 1) % 4, lapN = () => Math.floor((stage - 1) / 4);
const waveT = w => WAVE_T[stageIdx()][w] + lapN() * LAP_T;

function initDirector(n, toBoss) {
  stage = n; wave = 0; bossSeen = false; dirCine = false;
  if (toBoss) tipList = [];
  applyTheme(stageIdx());
  lvT = waveT(toBoss ? 2 : 0);
  dirPhase = toBoss ? 'bossPre' : 'intro'; dirT = toBoss ? 1.2 : 3.2;
}
function directorLabel() {
  const L = 'STAGE ' + stage;
  if (dirPhase === 'wave') return L + ' · WAVE ' + wave + '/3 · ' + Math.max(0, waveQuota - waveKills) + ' LEFT';
  if (dirPhase === 'boss' || dirPhase === 'bossPre') return L + ' · BOSS';
  if (dirPhase === 'intro') return L + ' · ' + STAGES[stageIdx()].name;
  if (dirPhase === 'waveClear' || dirPhase === 'rest') return L + ' · WAVE ' + wave + ' CLEAR';
  if (dirPhase === 'stageClear') return L + ' CLEAR';
  return L;
}
function loopBuff(b) { if (lapN()) { b.hp = Math.ceil(b.hp * (1 + 0.5 * lapN())); b.pts = Math.round(b.pts * (1 + 0.5 * lapN())); } }
function startWave() {
  wave++;
  lvT = waveT(wave - 1);
  waveKills = 0; waveQuota = 6 + (wave - 1) * 2 + stageIdx() * 2 + lapN() * 4;
  dirPhase = 'wave'; botSpawnCd = 0.6;
  banner('WAVE ' + wave + ' / 3', 'SHOOT DOWN ' + waveQuota, STAGES[stageIdx()].col);
  Sound.tone(440, 0.15, 'square', 0.06); Sound.tone(660, 0.2, 'square', 0.06, null, 0.12);
}
function waveKill() {
  if (dirPhase !== 'wave') return;
  waveKills++;
  if (waveKills >= waveQuota) waveCleared();
}
function waveCleared() {
  dirPhase = 'waveClear'; dirT = 1.8;
  for (const b of bots) { if (b.dead) continue; b.dead = true; explode(b.x, b.y, b.z, 0.8); removeBot(b); }   // stragglers bail out
  bots = [];
  for (const m of missiles) if (m.enemy) removeMissile(m);
  missiles = missiles.filter(m => !m.dead);
  bullets = bullets.filter(b => !b.enemy);
  player.ammo = Math.min(maxAmmo(), player.ammo + ammoBox());
  banner('WAVE CLEAR', wave < 3 ? 'CHOOSE AN UPGRADE' : 'BOSS INCOMING', '#ffd24a');
  Sound.sfxFanfare(false); updateHud(true);
}
function startBossFight() {
  dirPhase = 'boss'; bossSeen = false; lvT = waveT(2);
  const kind = STAGES[stageIdx()].boss;
  if (kind === 'fortress') announceBoss();
  else if (kind === 'titan') { titanPhase = 'none'; titanWarned = false; startTitanIntro(); }
  else if (kind === 'ace') { acePhase = 'none'; aceWarned = false; startAceIntro(); }
  else { carrierPhase = 'none'; carrierWarned = false; startCarrierIntro(); }
}
function stageCleared() {
  dirPhase = 'stageClear'; dirT = 2.4;
  for (const b of bots) { if (b.dead) continue; b.dead = true; explode(b.x, b.y, b.z, 0.8); removeBot(b); }
  bots = [];
  const bonus = 1000 * stage, coins = 40 * stage;
  killPts += bonus; garage.coins += coins; saveGarage();
  banner('STAGE ' + stage + ' CLEAR', '+' + bonus + ' PTS · +' + coins + ' COINS', '#ffd24a');
  Sound.sfxFanfare(true); updateHud(true);
}
function nextStage() {
  stage++; wave = 0; bossSeen = false; dirCine = false;
  const f = $('stageFade'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  applyTheme(stageIdx()); setupTurrets();
  Object.assign(player, { x: 0, y: ALT, z: 0, a: -Math.PI / 2, p: 0, roll: 0 }); snapCamera();
  pickups.forEach(removePickup); pickups = [];
  for (let i = 0; i < 6; i++) spawnPickup('ammo');
  spawnPickup('missile');
  lvT = waveT(0);
  Object.assign(player, { ammo: Math.max(player.ammo, maxAmmo()), invul: 2 });
  dirPhase = 'intro'; dirT = 3.2;
  updateHud(true);
}
function updateDirector(dt) {
  if (dirPhase === 'intro') {
    if (!dirCine) {
      dirCine = true;
      setCine('STAGE ' + stage + (lapN() ? ' &middot; LAP ' + (lapN() + 1) : ''), STAGES[stageIdx()].name, STAGES[stageIdx()].line || 'CLEAR 3 WAVES &middot; THEN DEFEAT THE BOSS');
      showCine(); Sound.tone(330, 0.5, 'triangle', 0.1, 660);
    }
    if ((dirT -= dt) <= 0) { hideCine(); startWave(); }
  } else if (dirPhase === 'wave') {
    if (botSpawnCd <= 0 && bots.length < maxBotsNow() && bots.length + waveKills < waveQuota) {
      const b = spawnBot(); if (b) loopBuff(b);
      botSpawnCd = rand(0.9, 1.8) / (1 + lvT / 90);
    }
  } else if (dirPhase === 'waveClear') {
    if ((dirT -= dt) <= 0) {
      if (wave < 3) openUpgrade('WAVE ' + wave + ' CLEAR', () => { dirPhase = 'rest'; dirT = 1.2; });
      else startBossFight();
    }
  } else if (dirPhase === 'rest') {
    if ((dirT -= dt) <= 0) startWave();
  } else if (dirPhase === 'bossPre') {
    if ((dirT -= dt) <= 0) startBossFight();
  } else if (dirPhase === 'boss') {
    if (boss && !boss.dead) {
      bossSeen = true;
      if (!boss.lapScaled) {
        boss.lapScaled = true;
        const k = 1 + 0.6 * lapN(); boss.hp *= k; boss.max *= k;
        if (boss.parts) for (const t of boss.parts) t.hp *= k;
      }
      // the fortress brings a small escort
      if (!boss.titan && !boss.ace && !boss.carrier && botSpawnCd <= 0 && bots.length < Math.min(3, maxBotsNow())) { const b = spawnBot(); if (b) loopBuff(b); botSpawnCd = rand(2, 3.5); }
    }
    if (bossSeen && !boss && !duelLock() && bossWarnT <= 0) stageCleared();
  } else if (dirPhase === 'stageClear') {
    if ((dirT -= dt) <= 0) openUpgrade('STAGE ' + stage + ' CLEAR', nextStage);
  }
}

// ---- 1-of-3 upgrades between waves (this run only) ----
const UPS = [
  { id: 'fire', big: '+20%', name: 'RAPID FIRE', desc: 'Faster gun fire rate', max: 5, apply() { run.fire++; } },
  { id: 'dmg', big: '+25%', name: 'HEAVY ROUNDS', desc: 'More damage per bullet', max: 5, apply() { run.dmg++; } },
  { id: 'hp', big: '+1 ♥', name: 'HULL PLATING', desc: 'One more max heart, and repair one', max: 3, apply() { run.hp++; player.hp = Math.min(maxHp(), player.hp + 1); } },
  { id: 'msl', big: '+2', name: 'MISSILE RACK', desc: 'Missile capacity up, full reload', max: 3, apply() { run.msl++; player.missiles = maxMsl(); } },
  { id: 'spd', big: '+10%', name: 'AFTERBURNER', desc: 'More speed and sharper turns', max: 3, apply() { run.spd++; } },
  { id: 'cd', big: '-20%', name: 'QUICK CHARGE', desc: 'Special ability recharges faster', max: 3, apply() { run.cd++; specialCooldown *= 0.8; } },
  { id: 'ammo', big: '+50%', name: 'AMMO BELT', desc: 'Bigger ammo capacity, full reload', max: 3, apply() { run.ammo++; player.ammo = maxAmmo(); } },
  { id: 'mag', big: 'PULL', name: 'MAGNET', desc: 'Pickups fly to you from far away', max: 2, apply() { run.mag++; } },
  { id: 'lock', big: '+50%', name: 'FAST LOCK', desc: 'Lock-on builds up faster', max: 2, apply() { run.lock++; } },
  { id: 'flare', big: '+3', name: 'COUNTERMEASURES', desc: 'Flare capacity up, full reload', max: 3, apply() { run.flare++; player.flares = maxFlr(); } },
  { id: 'repair', big: 'FULL ♥', name: 'FIELD REPAIR', desc: 'Restore every heart', max: 0, apply() { player.hp = maxHp(); }, avail: () => player.hp < maxHp() },
];
function rollUpgrades(n) {
  const pool = UPS.filter(u => (u.max ? run[u.id] < u.max : true) && (!u.avail || u.avail()));
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const pick = pool.slice(0, n);
  const rep = pool.find(u => u.id === 'repair');
  if (rep && player.hp <= maxHp() / 2 && !pick.includes(rep)) pick[pick.length - 1] = rep;   // badly hurt: always offer a repair
  return pick;
}
function openUpgrade(title, next) {
  state = 'upgrade'; clearInput(); hideTip(); CG.gameplayStop();
  for (const id of ['btnPause', 'btnFire', 'btnAds', 'weaponBtns', 'btnSpecial']) $(id).classList.add('hidden');
  specialHudKey = 'off'; $('mslWarn').hidden = true;
  const picks = rollUpgrades(3);
  $('upTitle').textContent = title;
  $('upCards').innerHTML = picks.map((u, i) => `<button class="upCard" data-pick="${u.id}"><span class="k">${i + 1}</span><strong>${u.big}</strong><b>${u.name}</b><small>${u.desc}</small><em>${u.max ? 'LV ' + run[u.id] + ' → ' + (run[u.id] + 1) + ' / ' + u.max : 'INSTANT'}</em></button>`).join('');
  pendingNext = next;
  $('upgrade').classList.remove('hidden');
  Sound.tone(523, 0.12, 'triangle', 0.08); Sound.tone(784, 0.18, 'triangle', 0.08, null, 0.1);
}
function pickUpgrade(id) {
  if (state !== 'upgrade') return;
  const u = UPS.find(u => u.id === id); if (!u) return;
  u.apply();
  $('upgrade').classList.add('hidden');
  state = 'playing'; setHud(true); CG.gameplayStart(); updateHud(true);
  Sound.sfxRevive(); popup(player.x, player.y + 3, player.z, u.name, true);
  const n = pendingNext; pendingNext = null; if (n) n();
}
$('upCards').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { e.preventDefault(); Sound.init(); pickUpgrade(b.dataset.pick); } });
$('upgrade').addEventListener('pointerdown', e => e.stopPropagation());
window.addEventListener('keydown', e => {
  if (state !== 'upgrade' || e.repeat) return;
  const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code) % 3;
  if (i < 0) return;
  const b = $('upCards').children[i]; if (b) { e.preventDefault(); pickUpgrade(b.dataset.pick); }
});

// TEST BUILD: title-screen buttons that start a run right before each boss
$('bossWarp').addEventListener('click', e => {
  const b = e.target.closest('[data-warp]'); if (!b || state !== 'title') return;
  e.preventDefault(); Sound.init(); Sound.sfxClick();
  window.__warpStage = +b.dataset.warp;
  try { startRun(); } finally { window.__warpStage = 0; }
});
$('bossWarp').addEventListener('pointerdown', e => e.stopPropagation());