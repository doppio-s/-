
// ---------- game state ----------
// states: loading, title, garage, daily, ready, playing, dying, over, paused
let state = 'loading', best = 0, revived = false, busy = false, lastAdTime = 0;
let gameTime = 0, kills = 0, killPts = 0, shake = 0, dieTimer = 0, speedLevel = 0, emptyToastT = 0, emptySfxT = 0, runCoinsGiven = 0;
const ALT_MIN = 7, ALT_MAX = 70;
// final boss: at 3:00 every enemy is wiped out and the OMEGA TITAN arrives
const TITAN_AT = 180;
let titanPhase = 'none', titanT = 0, titanWarned = false, titanSlain = false, supplyT = 14;
const titanLock = () => titanPhase === 'intro' || titanPhase === 'fight';
// hit-stop / slow motion (real-time duration, game-time scale)
let slowT = 0, slowScale = 1;
function hitStop(dur, scale) {
  if (slowT <= 0 || scale <= slowScale) slowScale = scale;
  slowT = Math.max(slowT, dur);
}

// ---------- aircraft ----------
// Starter parts are included; alternative components are permanent coin unlocks.
const PARTS = {
  engine: [
    {id:'stock',name:'Piston',desc:'Reliable balanced propulsion.',speed:1,turn:1},
    {id:'turbo',cost:160,name:'Turbocharger',desc:'+18% speed / −10% turn',speed:1.18,turn:.9},
    {id:'torque',cost:140,name:'Vector drive',desc:'+15% turn / −8% speed',speed:.92,turn:1.15}
  ],
  wing: [
    {id:'standard',name:'Cruiser wings',desc:'Balanced lift and handling.'},
    {id:'swept',cost:100,name:'Swept wings',desc:'+10% speed / −12% turn',speed:1.1,turn:.88},
    {id:'acro',cost:120,name:'Winglets',desc:'+22% turn / −8% speed',speed:.92,turn:1.22}
  ],
  weapon: [
    {id:'balanced',name:'Service gun',desc:'Balanced damage and cadence.'},
    {id:'rapid',cost:180,name:'Rotary gun',desc:'+35% fire rate / −22% damage',fire:1.35,damage:.78},
    {id:'heavy',cost:240,name:'Heavy cannon',desc:'+65% damage / −35% fire rate',fire:.65,damage:1.65}
  ],
  armor: [
    {id:'standard',name:'Standard hull',desc:'Balanced protection.'},
    {id:'light',cost:100,name:'Light alloy',desc:'+12% speed / −1 heart',speed:1.12,hp:-1},
    {id:'heavy',cost:200,name:'Reinforced hull',desc:'+2 hearts / −14% speed',speed:.86,hp:2}
  ]
};
function ownsPart(slot,id){return PARTS[slot]?.[0].id===id||garage.ownedParts?.[slot]?.includes(id);}
function restoreParts(g){
 garage.ownedParts={};
 for(const [slot,items] of Object.entries(PARTS)){
  garage.ownedParts[slot]=[items[0].id,...items.slice(1).filter(p=>Array.isArray(g.ownedParts?.[slot])&&g.ownedParts[slot].includes(p.id)).map(p=>p.id)];
  garage.loadout[slot]=items.some(p=>p.id===g.loadout?.[slot])&&ownsPart(slot,g.loadout[slot])?g.loadout[slot]:items[0].id;
 }
}
function partStats(){
  const s={speed:1,turn:1,fire:1,damage:1,hp:0};
  for(const slot of Object.keys(PARTS)){
    const p=PARTS[slot].find(p=>p.id===garage.loadout[slot])||PARTS[slot][0];
    for(const k of ['speed','turn','fire','damage'])s[k]*=p[k]??1;
    s.hp+=p.hp||0;
  }
  return s;
}
function decoratePlane(root){
  const b=root.userData.body, l=garage.loadout, metal=M(0x233c53), silver=M(0xb7d4db), orange=M(0xff9b4a);
  for(const side of [-1,1]){
    const radius=l.weapon==='heavy'?.23:l.weapon==='rapid'?.14:.09;
    const gun=part(G.cyl,metal,radius,l.weapon==='heavy'?2.1:1.15,radius,1,-.26,side*1.2,b);gun.rotation.z=Math.PI/2;
    if(l.weapon==='heavy'){const muzzle=part(G.cyl,orange,.29,.26,.29,2.02,-.26,side*1.2,b);muzzle.rotation.z=Math.PI/2;part(G.box,metal,.65,.4,.42,.05,-.25,side*1.2,b);}
    if(l.weapon==='rapid')for(let j=0;j<5;j++){const t=part(G.cyl,silver,.065,1.5,.065,1.15, -.26+Math.cos(j*1.257)*.18,side*1.2+Math.sin(j*1.257)*.18,b);t.rotation.z=Math.PI/2;}
    if(l.engine==='turbo'){const e=part(G.cyl,metal,.34,1.3,.34,-.7,-.3,side*.85,b);e.rotation.z=Math.PI/2;const rim=part(G.cyl,orange,.36,.16,.36,-1.38,-.3,side*.85,b);rim.rotation.z=Math.PI/2;part(G.sph,M(0xff8040,{emissive:0xff4800,emissiveIntensity:1.3}),.25,.25,.25,-1.48,-.3,side*.85,b);}
    if(l.engine==='torque'){part(G.box,orange,.85,.35,.46,-1.1,.12,side*.85,b);const vent=part(G.cyl,metal,.24,.3,.24,-1.5,.12,side*.85,b);vent.rotation.z=Math.PI/2;}
    if(l.wing==='acro'){const f=part(G.box,silver,.8,1.05,.16,.1,.4,side*2.22,b);f.rotation.x=side*.2;part(G.box,orange,.82,.18,.18,.1,.92,side*2.12,b);}
    if(l.wing==='swept'){const w=part(G.box,silver,1.75,.18,1.65,-.45,.04,side*1.9,b);w.rotation.y=side*.65;const stripe=part(G.box,orange,.22,.2,1.5,-.28,.06,side*1.95,b);stripe.rotation.y=side*.65;}
    if(l.armor==='heavy'){part(G.box,metal,1.8,.65,.25,-.2,-.06,side*.68,b);for(const x of [-.85,.4])part(G.sph,silver,.09,.09,.05,x,.12,side*.83,b);part(G.box,orange,.25,.66,.27,-.5,-.06,side*.68,b);}
    if(l.armor==='light'){part(G.box,silver,1.15,.24,.17,-.45,.3,side*.53,b);for(let i=0;i<3;i++)part(G.box,metal,.12,.26,.19,-.85+i*.32,.3,side*.53,b);}
    part(G.sph,M(side<0?0xff4545:0x53ffc3,{emissive:side<0?0xff2020:0x20ff90,emissiveIntensity:.5}),.08,.08,.08,.1,.06,side*2.28,b);
  }
  // Engine upgrade rings make permanent progression visible too.
  for(let i=0;i<garage.lv.engine;i++){const ring=part(G.torus,orange,.45,.45,.45,1.05-i*.14,0,0,b);ring.rotation.y=Math.PI/2;}
}
function renderParts(){
  $('partList').innerHTML=Object.entries(PARTS).map(([slot,items])=>`<fieldset><legend>${slot}</legend><div class="partOptions">${items.map(p=>`<button class="partCard ${garage.loadout[slot]===p.id?'equipped':''}" data-slot="${slot}" data-part="${p.id}" aria-pressed="${garage.loadout[slot]===p.id}"><span>${p.name}</span><small>${p.desc}</small><em>${garage.loadout[slot]===p.id?'EQUIPPED':ownsPart(slot,p.id)?'EQUIP':p.cost+' COINS'}</em></button>`).join('')}</div></fieldset>`).join('');
  const stats=[['CRUISE',Math.round(playerSpeed()/speedMul()*12)+' km/h'],['HANDLING',Math.round(turnRate()/2.7*100)+'%'],['HULL',maxHp()+' HP'],['DAMAGE',gunDmg().toFixed(2)],['FIRE RATE',(1/fireGap()).toFixed(1)+'/s']];
  $('buildStats').innerHTML=stats.map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('');
  $('previewName').textContent=planeNow().name;
}

const PLANES = [
  { id: 'classic', name: 'CLASSIC', desc: 'Balanced all-rounder', cost: 0, hp: 0, turn: 1, speed: 1, guns: 1, fire: 1, missiles: 2, shape: 'classic' },
  { id: 'swift', name: 'SWIFT', desc: 'Very agile, but only 2 hearts', cost: 300, hp: -1, turn: 1.28, speed: 1.08, guns: 1, fire: 1.1, missiles: 2, shape: 'swift' },
  { id: 'brick', name: 'BRICK', desc: 'Biplane: +2 hearts, slower turns', cost: 450, hp: 2, turn: 0.85, speed: 0.95, guns: 1, fire: 0.9, missiles: 3, shape: 'brick' },
  { id: 'twin', name: 'TWIN', desc: 'Fires two guns at once', cost: 650, hp: 0, turn: 1, speed: 1, guns: 2, fire: 1, missiles: 2, shape: 'twin' },
  { id: 'falcon', name: 'FALCON X', desc: 'Day 7 reward: twin guns, +1 heart, 4 missiles', cost: null, hp: 1, turn: 1.2, speed: 1.1, guns: 2, fire: 1.2, missiles: 4, shape: 'falcon' },
];
PLANES.push(
  {id:'lancer',name:'LANCER',desc:'Needle interceptor: fast, light, precise',cost:500,hp:-1,turn:1.18,speed:1.22,guns:1,fire:1.1,missiles:2,shape:'lancer'},
  {id:'seraph',name:'SERAPH',desc:'Split-wing starfighter: twin guns, balanced speed',cost:800,hp:0,turn:1.08,speed:1.06,guns:2,fire:1,missiles:3,shape:'seraph'},
  {id:'spectre',name:'SPECTRE',desc:'Flying-wing bomber: armored, heavy missile load',cost:950,hp:2,turn:.78,speed:.94,guns:1,fire:.9,missiles:6,shape:'spectre'},
  {id:'halo',name:'HALO',desc:'Ring-drive flagship: triple ion cannons, top speed and agility',cost:1100,hp:1,turn:1.35,speed:1.2,guns:3,fire:1.1,missiles:4,shape:'halo'}
);
// ---------- garage (persistent, bought with coins) ----------
const UPGRADES = [
  { id: 'engine', name: 'ENGINE', desc: 'Sharper turns and climbs', max: 5 },
  { id: 'guns', name: 'GUNS', desc: 'Faster fire rate', max: 5 },
  { id: 'power', name: 'POWER', desc: 'More damage per bullet', max: 5 },
  { id: 'armor', name: 'ARMOR', desc: '+1 heart per level', max: 3 },
  { id: 'ammo', name: 'AMMO', desc: 'More bullets, missiles and flares', max: 5 },
];
const UP_COST = [40, 80, 140, 220, 320];
const PAINTS = [
  { id: 'classic', name: 'Classic', body: 0xff4d6d, wing: 0xffd23f, cost: 0 },
  { id: 'sky', name: 'Sky', body: 0x3b8cff, wing: 0xffffff, cost: 60 },
  { id: 'mint', name: 'Mint', body: 0x2ed1a2, wing: 0xfff27a, cost: 60 },
  { id: 'grape', name: 'Grape', body: 0x8b5cf6, wing: 0xffb3e6, cost: 60 },
  { id: 'gold', name: 'Gold', body: 0xffc21a, wing: 0xff6b3d, cost: 150 },
  { id: 'stealth', name: 'Stealth', body: 0x3a3f55, wing: 0x9fe7ff, cost: 150 },
];
const DAILY = [{ coins: 50 }, { coins: 75 }, { coins: 100 }, { coins: 125 }, { coins: 150 }, { coins: 200 }, { plane: 'falcon', coins: 500 }];
const garage = { coins: 0, lv: { engine: 0, guns: 0, power: 0, armor: 0, ammo: 0 }, paints: ['classic'], paint: 'classic',
  planes: ['classic'], plane: 'classic', loadout: { engine: 'stock', wing: 'standard', weapon: 'balanced', armor: 'standard' }, daily: { day: 0, last: '' } };
function loadGarage(raw) {
  try {
    const g = JSON.parse(raw || '{}') || {};
    restoreParts(g);
    if (Number.isFinite(g.coins) && g.coins >= 0) garage.coins = Math.floor(g.coins);
    for (const u of UPGRADES) { const v = g.lv && g.lv[u.id]; if (Number.isInteger(v)) garage.lv[u.id] = clamp(v, 0, u.max); }
    if (Array.isArray(g.paints)) garage.paints = ['classic', ...g.paints.filter(id => id !== 'classic' && PAINTS.some(p => p.id === id))];
    if (garage.paints.includes(g.paint)) garage.paint = g.paint;
    if (Array.isArray(g.planes)) garage.planes = ['classic', ...g.planes.filter(id => id !== 'classic' && PLANES.some(p => p.id === id))];
    if (garage.planes.includes(g.plane)) garage.plane = g.plane;
    if (g.daily && Number.isInteger(g.daily.day) && typeof g.daily.last === 'string') garage.daily = { day: clamp(g.daily.day, 0, 6), last: g.daily.last };
  } catch (e) {}
}
const saveGarage = () => Store.set('garage', JSON.stringify(garage));
const planeNow = () => PLANES.find(p => p.id === garage.plane) || PLANES[0];
const paintNow = () => PAINTS.find(p => p.id === garage.paint) || PAINTS[0];
const maxHp = () => Math.max(1, 3 + garage.lv.armor + planeNow().hp + partStats().hp);
const maxAmmo = () => 40 + 10 * garage.lv.ammo;
const startAmmo = () => 12 + 6 * garage.lv.ammo;
const ammoBox = () => 8 + 2 * garage.lv.ammo;
const startMissiles = () => planeNow().missiles + Math.floor(garage.lv.ammo / 2);
const startFlares = () => 3 + Math.floor(garage.lv.ammo / 2);
const turnRate = () => 2.7 * (1 + 0.1 * garage.lv.engine) * planeNow().turn * partStats().turn;
const fireGap = () => 0.15 / ((1 + 0.15 * garage.lv.guns) * planeNow().fire * partStats().fire);
const gunDmg = () => (1 + 0.5 * garage.lv.power) * partStats().damage;
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const canClaimDaily = () => garage.daily.last !== todayStr();

const player = { x: 0, y: ALT, z: 0, a: -Math.PI / 2, p: 0, roll: 0, hp: 3, ammo: 12, missiles: 2, flares: 3, invul: 0, fireCd: 0, mslCd: 0, flareCd: 0,
  trailT: 0, alive: true, mesh: makePlane(0xff4d6d, 0xffd23f) };
scene.add(player.mesh);
function applyLook() {   // plane shape + paint
  const vis = player.mesh.visible, pt = paintNow();
  scene.remove(player.mesh);
  player.mesh = makePlane(pt.body, pt.wing, planeNow().shape); player.mesh.visible = vis;
  decoratePlane(player.mesh);
  scene.add(player.mesh); orientPlane(player, 0);
  refreshPreview();
}
let bots = [], bullets = [], parts = [], pickups = [], missiles = [], decoys = [], turrets = [];
let botSpawnCd = 0, heartCd = 20, mslWarnT = 0;
let boss = null, bossCount = 0, nextBossAt = 75, bossWarnT = 0;
let combo = 0, comboT = 0, bestCombo = 0, tutorialDone = false, tipList = [], tipT = 0, overShownAt = 0;
const COMBO_WINDOW = 4;
const BOT_COLORS = [[0x4d8bff, 0xffffff], [0x37c77a, 0xffffff], [0x9b6cff, 0xffd0f0], [0xff9f43, 0x3a2350]];

const speedMul = () => Math.min(2.6, 1 + gameTime / 80);
const playerSpeed = () => 15 * speedMul() * planeNow().speed * partStats().speed * (ramTime > 0 ? 1.65 : 1);
const botSpeed = () => 13.2 * Math.min(2.3, 1 + gameTime / 95);
const scoreNow = () => Math.floor(gameTime) * 10 + killPts;
const runCoins = () => Math.floor(scoreNow() / 50) * 3;
const maxBotsNow = () => Math.min(8, 2 + Math.floor(gameTime / 22));

// ---------- input ----------
const input = { mouseX: 0, mouseY: 0, mouseActive: false, mouseFire: false, keyFire: false, touchFire: false, ads: false, adsToggle: false,
  touchId: null, touchX: 0, touchY: 0, touchX0: 0, touchY0: 0, left: false, right: false, up: false, down: false };
let steerNow = 0, climbNow = 0;   // -1..1 each, shown on the steering pad
const firing = () => input.mouseFire || input.keyFire || input.touchFire;
const aiming = () => (input.ads || input.adsToggle) && state === 'playing';

// 3D helpers
const fwdOf = e => { const cp = Math.cos(e.p || 0); return [Math.cos(e.a) * cp, Math.sin(e.p || 0), Math.sin(e.a) * cp]; };
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clampAlt = y => clamp(y, ALT_MIN + 3, ALT_MAX - 5);

// ---------- entities ----------
// force: 'normal'|'heavy'|'ace' to skip the random pick; at: spawn near this point (boss escorts)
function spawnBot(force, at) {
  for (let t = 0; t < 12; t++) {
    let x, z;
    if (at) { x = clamp(at.x + rand(-14, 14), -MAP + 12, MAP - 12); z = clamp(at.z + rand(-14, 14), -MAP + 12, MAP - 12); }
    else {
      const ang = rand(0, Math.PI * 2), d = rand(95, 125);
      x = player.x + Math.cos(ang) * d; z = player.z + Math.sin(ang) * d;
      if (Math.abs(x) > MAP - 10 || Math.abs(z) > MAP - 10) continue;
    }
    const r = Math.random(), needAce = gameTime > 70 && !bots.some(o => o.kind === 'ace') && Math.random() < 0.6;
    const kind = force || (needAce || (gameTime > 70 && r < Math.min(0.3, 0.1 + gameTime / 900)) ? 'ace'
      : gameTime > 45 && r < Math.min(0.55, 0.3 + gameTime / 600) ? 'heavy' : 'normal');
    const col = kind === 'ace' ? [0x8b1e2d, 0x2b2d42] : kind === 'heavy' ? [0x2b2d42, 0xff3b3b] : BOT_COLORS[(Math.random() * BOT_COLORS.length) | 0];
    const b = { x, y: at ? clampAlt(at.y + rand(-6, 6)) : clampAlt(player.y + rand(-14, 14)), z, a: Math.atan2(player.z - z, player.x - x), p: 0, roll: 0, kind,
      hp: kind === 'heavy' ? 8 : kind === 'ace' ? 4 : 1, heavy: kind === 'heavy', scale: kind === 'heavy' ? 1.6 : 1,
      spd: kind === 'heavy' ? 0.8 : kind === 'ace' ? 1.12 : 1, pts: kind === 'heavy' ? 300 : kind === 'ace' ? 400 : 100,
      fireCd: rand(2.5, 4), mslCd: rand(4, 7), wander: 0, wanderT: 0, side: Math.random() < 0.5 ? -1 : 1, trailT: 0,
      mesh: makePlane(col[0], col[1], kind === 'heavy' ? 'brick' : kind === 'ace' ? 'falcon' : 'classic') };
    if (kind === 'heavy') b.mesh.scale.setScalar(1.45 * 1.6);
    if (!force) configureEnemyAirframe(b);
    scene.add(b.mesh); bots.push(b); orientPlane(b, 0);
    return b;
  }
  return null;
}
function removeBot(b) { scene.remove(b.mesh); }

function setupTurrets() {
  turrets.forEach(t => scene.remove(t.mesh)); turrets = [];
  for (const o of ISLANDS) {
    if (o.r < 8 || o.tx === undefined || Math.abs(o.x) > MAP - 10 || Math.abs(o.z) > MAP - 10 || Math.hypot(o.x, o.z) < 60 || Math.random() > 0.5) continue;
    const mesh = makeTurret(); mesh.position.set(o.tx, o.ty - 0.4, o.tz); scene.add(mesh);
    turrets.push({ x: o.tx, y: o.ty + 2, z: o.tz, hp: 6, cd: rand(1, 3), dead: false, mesh, scale: 1.2, pts: 150 });
  }
}

function gunSide(guns, g) { return guns === 1 ? 0 : guns === 2 ? (g ? 1 : -1) * 1.3 : [-1.5, 0, 1.5][g % 3]; }
function fire(from, isEnemy, aimAt) {
  if (bullets.length >= MAXB) return;
  const spd = isEnemy ? botSpeed() + 30 : playerSpeed() + 58;
  let [dx, dy, dz] = fwdOf(from);
  if (aimAt) { const tx = aimAt.x - from.x, ty = aimAt.y - from.y, tz = aimAt.z - from.z, l = Math.hypot(tx, ty, tz) || 1; dx = tx / l; dy = ty / l; dz = tz / l; }
  const guns = isEnemy ? (from.guns || 1) : planeNow().guns;
  for (let g = 0; g < guns; g++) {
    const side = gunSide(guns, g);   // twin guns sit on the wings, a third on the nose
    const ox = -Math.sin(from.a) * side, oz = Math.cos(from.a) * side;
    const x0 = from.x + dx * 2.8 + ox, y0 = from.y + dy * 2.8, z0 = from.z + dz * 2.8 + oz;
    bullets.push({ x: x0, y: y0, z: z0, vx: dx * spd, vy: dy * spd, vz: dz * spd, life: isEnemy ? 1.9 : 1.1, enemy: isEnemy, profile: shotProfile(from,isEnemy) });
  }
}
// big slow energy orbs (final boss bullet-hell)
function orb(x, y, z, dx, dy, dz, spd, life = 4.5) {
  if (bullets.length >= MAXB) return;
  const l = Math.hypot(dx, dy, dz) || 1;
  bullets.push({ x, y, z, vx: dx / l * spd, vy: dy / l * spd, vz: dz / l * spd, life, enemy: true, profile: 'orb', r: 2.3 });
}

// missiles: the player's home onto the enemy nearest the nose; enemy ones chase the player (or a flare)
function missileTarget(from) {
  const f = fwdOf(from); let best = null, bestScore = 1e9;
  for (const t of targetables()) {
    if (t.dead) continue;
    const dx = t.x - from.x, dy = t.y - from.y, dz = t.z - from.z, d = Math.hypot(dx, dy, dz);
    if (d > (t === boss ? 140 : 110)) continue;
    const off = Math.acos(clamp((dx * f[0] + dy * f[1] + dz * f[2]) / Math.max(d, 0.01), -1, 1));
    if (off > 0.9) continue;
    const sc = d + off * 60;
    if (sc < bestScore) { bestScore = sc; best = t; }
  }
  return best;
}
function launchMissile(from, enemy) {
  const f = fwdOf(from), spd = enemy ? playerSpeed() * 1.3 + 6 : playerSpeed() + 42;
  const m = { x: from.x + f[0] * 3, y: from.y + f[1] * 3 - 0.8, z: from.z + f[2] * 3, vx: f[0] * spd, vy: f[1] * spd, vz: f[2] * spd, spd,
    enemy, target: enemy ? player : missileTarget(from), turn: enemy ? 1.7 : 3.2, life: enemy ? 6.5 : 3.5, trailT: 0, mesh: makeMissile(enemy) };
  if (!enemy && adsK > 0.4) { m.mesh.visible = false; m.hideT = 0.18; }
  scene.add(m.mesh); missiles.push(m);
  Sound.sfxMissile(enemy);
  return m;
}
function removeMissile(m) { scene.remove(m.mesh); m.dead = true; }
function dropFlares() {
  for (let i = 0; i < 3; i++) {
    const f = fwdOf(player), sd = (i - 1) * 6;
    decoys.push({ x: player.x - f[0] * 3, y: player.y - 1, z: player.z - f[2] * 3,
      vx: -f[0] * 6 - Math.sin(player.a) * sd, vy: -3, vz: -f[2] * 6 + Math.cos(player.a) * sd, life: 2.2 });
  }
  // every enemy missile close enough goes for a flare instead
  for (const m of missiles) if (m.enemy && m.target === player && dist3(m, player) < 90) m.target = decoys[decoys.length - 1 - ((Math.random() * 3) | 0)];
  Sound.tone(900, 0.25, 'triangle', 0.08, 300);
}

function addPart(x, y, z, vx, vy, vz, life, size, color, grow = 0, grav = 0) {
  if (parts.length >= MAXP) parts.shift();
  parts.push({ x, y, z, vx, vy, vz, life, max: life, size, color, grow, grav });
}
function explode(x, y, z, big = 1) {
  const cols = [0xff4d6d, 0xffcc00, 0xff9f43, 0xffffff];
  for (let i = 0; i < 26 * big; i++) {
    const a = rand(0, Math.PI * 2), e = rand(-0.6, 1.2), v = rand(6, 18) * Math.sqrt(big);
    addPart(x, y, z, Math.cos(a) * v, e * v * 0.6, Math.sin(a) * v, rand(0.4, 0.9), rand(0.5, 1.1) * big, cols[i % 4]);
  }
  for (let i = 0; i < 8; i++) addPart(x + rand(-1, 1), y, z + rand(-1, 1), rand(-2, 2), rand(1, 4), rand(-2, 2), rand(0.8, 1.3), rand(1, 1.6), 0x8a8aa0, 1.6);
  for (let i = 0; i < 2; i++) addPart(x, y, z, 0, 0, 0, 0.14, 1.5 * big, i ? 0xfff3b0 : 0xffffff, 2);   // flash core
  if (big >= 0.9) {
    for (let i = 0; i < 7 * big; i++) addPart(x, y, z, rand(-9, 9), rand(2, 10), rand(-9, 9), rand(1, 1.6), rand(0.3, 0.55), i % 2 ? 0x3a3f55 : 0x5b6275, 0, 18);   // debris
    for (let i = 0; i < 10 * big; i++) { const a = rand(0, 6.3), v = rand(22, 38); addPart(x, y, z, Math.cos(a) * v, rand(-8, 14), Math.sin(a) * v, rand(0.25, 0.45), 0.28, 0xfff6c8, 0.2); }   // sparks
    shockwave(x, y, z, 7 * big, 0xffd28a, 0.45);
  }
}

function spawnPickup(type, x, z, y) {
  if (x === undefined) {
    for (let t = 0; t < 15; t++) {
      const a = rand(0, Math.PI * 2), d = rand(30, 150);
      x = player.x + Math.cos(a) * d; z = player.z + Math.sin(a) * d;
      if (Math.abs(x) < MAP - 12 && Math.abs(z) < MAP - 12) break;
    }
    x = clamp(x, -MAP + 12, MAP - 12); z = clamp(z, -MAP + 12, MAP - 12);
  }
  if (y === undefined) y = clampAlt(player.y + rand(-12, 12));
  const mesh = type === 'heart' ? makeHeart() : makeAmmoBox(type === 'missile');
  mesh.position.set(x, y, z);
  scene.add(mesh);
  pickups.push({ type, x, y, z, mesh, t: rand(0, 6) });
}
function removePickup(p) { scene.remove(p.mesh); }

// ---------- flow ----------
function showOnly(id) { for (const s of ['title', 'pause', 'over', 'garage', 'daily']) $(s).classList.toggle('hidden', s !== id); }
function setHud(on) {
  $('hud').classList.toggle('hidden', !on);
  $('btnPause').classList.toggle('hidden', !on);
  $('radar').classList.toggle('hidden', !on);
  $('btnFire').classList.toggle('hidden', !(on && IS_TOUCH));
  $('btnAds').classList.toggle('hidden', !(on && IS_TOUCH));
  $('weaponBtns').classList.toggle('hidden', !on);
  if (!on) { $('warn').classList.add('hidden'); $('combo').classList.add('hidden'); $('bossBar').classList.add('hidden'); $('lowHp').classList.remove('on'); hideTip(); }
}
function clearInput() {
  steerNow = 0; climbNow = 0; input.mouseActive = false;
  input.mouseFire = input.keyFire = input.touchFire = input.ads = input.adsToggle = false;
  $('btnAds').classList.remove('on');
  input.left = input.right = input.up = input.down = false; input.touchId = null;
  $('btnFire').classList.remove('on');
}
function clearWorld() {
  bots.forEach(removeBot); bots = [];
  pickups.forEach(removePickup); pickups = [];
  missiles.forEach(m => scene.remove(m.mesh)); missiles = [];
  bullets = []; parts = []; decoys = [];
  if (boss) scene.remove(boss.mesh);
  boss = null; bossWarnT = 0; combo = 0; comboT = 0;
  $('bossBar').classList.add('hidden'); $('bossBar').classList.remove('titan'); $('bossWarn').classList.add('hidden'); $('combo').classList.add('hidden');
  hideCine(); slowT = 0; slowScale = 1;
  clearPopups(); hideTip();
}
function resetDemoPlane() {
  Object.assign(player, { x: 0, y: ALT, z: 0, a: -Math.PI / 2, p: 0, roll: 0, alive: true });
  player.mesh.visible = true; snapCamera();
}

function toTitle() {
  CG.gameplayStop();
  ramTime=rollTime=shieldTime=stormTime=cloakTime=0; player.rollFx=0; shieldMesh.visible=false;
  state = 'title';
  clearWorld(); clearInput(); resetDemoPlane();
  $('titleBest').textContent = best;
  $('titleCoins').textContent = garage.coins;
  $('dailyBadge').hidden = !canClaimDaily();
  setHud(false); $('hint').classList.add('hidden');
  showOnly('title');
}
function openDaily() {
  if (state !== 'title') return;
  state = 'daily';
  renderDaily();
  showOnly('daily');
}
function openGarage() {
  ramTime=rollTime=shieldTime=stormTime=cloakTime=0; player.rollFx=0; shieldMesh.visible=false;
  CG.gameplayStop();
  state = 'garage';
  clearWorld(); clearInput(); resetDemoPlane();
  setHud(false); $('hint').classList.add('hidden');
  renderGarage();
  showOnly('garage');
}

function startRun() {
  clearWorld(); clearInput(); resetSpecial();
  Object.assign(player, { x: 0, y: ALT, z: 0, a: -Math.PI / 2, p: 0, roll: 0, hp: maxHp(), ammo: startAmmo(), missiles: startMissiles(), flares: startFlares(),
    invul: 0, fireCd: 0, mslCd: 0, flareCd: 0, alive: true });
  player.mesh.visible = true; snapCamera();
  gameTime = 0; kills = 0; killPts = 0; runCoinsGiven = 0; revived = false; speedLevel = 0; botSpawnCd = 3; heartCd = 20;
  bossCount = 0; nextBossAt = 75; bestCombo = 0; startTips();
  titanPhase = 'none'; titanT = 0; titanWarned = false; titanSlain = false; supplyT = 14;
  if (window.__skipToTitan) { gameTime = TITAN_AT - 8; speedLevel = Math.floor(gameTime / 20); lastThreatStage = 3; nextBossAt = 1e9; }
  for (let i = 0; i < 7; i++) spawnPickup('ammo');
  spawnPickup('missile');
  setupTurrets();
  enterReady();
}

function enterReady() {
  state = 'ready';
  clearInput();
  showOnly(null); setHud(true);
  $('hint').innerHTML = IS_TOUCH ? 'DRAG to steer and climb &middot; TAP to start' : 'Mouse steers (up/down climbs) &middot; CLICK to start';
  $('hint').classList.remove('hidden');
  updateHud(true);
  CG.gameplayStart();
}
function beginPlaying() {
  if (state !== 'ready') return;
  state = 'playing';
  $('hint').classList.add('hidden');
}
function pauseGame() {
  if (state !== 'playing' && state !== 'ready') return;
  state = 'paused'; clearInput(); hideTip(); $('bossWarn').classList.add('hidden');
  CG.gameplayStop();
  $('hint').classList.add('hidden');
  $('btnPause').classList.add('hidden'); $('btnFire').classList.add('hidden'); $('btnAds').classList.add('hidden'); $('weaponBtns').classList.add('hidden'); $('btnSpecial').classList.add('hidden'); specialHudKey = 'off';
  showOnly('pause');
}
function resumeGame() { if (state === 'paused') enterReady(); }

function damage() {
  if (player.invul > 0 || state !== 'playing') return;
  if (rollTime > 0) return;   // barrel roll dodges everything
  if (shieldTime > 0) {   // iron shield soaks the hit
    for (let i = 0; i < 10; i++) addPart(player.x, player.y, player.z, rand(-8, 8), rand(-8, 8), rand(-8, 8), 0.3, 0.45, 0x7ff3ff, 0.4);
    Sound.tone(900, 0.08, 'triangle', 0.08, 1400); player.invul = 0.25; return;
  }
  player.hp--; player.invul = 1.6; shake = 0.35;
  const fl = $('dmgFlash'); fl.classList.remove('hit'); void fl.offsetWidth; fl.classList.add('hit');
  Sound.sfxHit();
  explode(player.x, player.y, player.z, 0.4);
  hitStop(0.12, 0.3);
  updateHud(true);
  if (player.hp <= 0) crash();
}
function crash() {
  ramTime=rollTime=shieldTime=stormTime=cloakTime=0; player.rollFx=0; shieldMesh.visible=false;
  state = 'dying'; dieTimer = 1.6; shake = 0.6; clearInput();
  CG.gameplayStop();
  explode(player.x, player.y, player.z, 1.2);
  Sound.sfxBoom();
  hitStop(0.7, 0.3);
  $('btnPause').classList.add('hidden'); $('btnFire').classList.add('hidden'); $('btnAds').classList.add('hidden'); $('weaponBtns').classList.add('hidden'); $('btnSpecial').classList.add('hidden'); specialHudKey = 'off';
  $('warn').classList.add('hidden'); $('mslWarn').hidden = true;
  $('lowHp').classList.remove('on'); $('bossWarn').classList.add('hidden'); hideTip();
}
function showOver() {
  state = 'over';
  setHud(false);
  const sc = scoreNow(), isNew = sc > best;
  if (isNew) { const had = best > 0; best = sc; Store.set('best', best); if (had) CG.happytime(); }
  // coins: the whole run earns floor(score / 50); only the part not paid out yet is added (continue-safe)
  const earned = runCoins() - runCoinsGiven;
  if (earned > 0) { runCoinsGiven += earned; garage.coins += earned; saveGarage(); }
  $('finalScore').textContent = sc;
  $('finalTime').textContent = Math.floor(gameTime) + 's';
  $('finalKills').textContent = kills;
  $('finalBosses').textContent = bossCount;
  overShownAt = performance.now();
  $('finalBest').textContent = best;
  $('finalCoins').textContent = runCoins();
  $('finalCoinTotal').textContent = garage.coins;
  $('newBest').classList.toggle('hidden', !isNew);
  $('titanBadge').classList.toggle('hidden', !titanSlain);
  $('btnRevive').classList.add('hidden');
  $('btnRevive').innerHTML = '<span class="adTag">AD</span>CONTINUE';
  setOverButtons(true);
  showOnly('over');
  Sound.sfxOver();
}
function setOverButtons(on) { for (const id of ['btnRevive', 'btnAgain', 'btnOverGarage']) $(id).disabled = !on; }

function revive() {
  revived = true;
  for (const b of bots) if (dist3(b, player) < 90) { explode(b.x, b.y, b.z, 0.6); removeBot(b); b.dead = true; }
  bots = bots.filter(b => !b.dead);
  bullets = bullets.filter(b => !b.enemy);
  for (const m of missiles) if (m.enemy) removeMissile(m);
  missiles = missiles.filter(m => !m.dead);
  Object.assign(player, { x: clamp(player.x, -MAP + 20, MAP - 20), z: clamp(player.z, -MAP + 20, MAP - 20), y: ALT, p: 0, roll: 0,
    hp: maxHp(), ammo: Math.max(player.ammo, startAmmo()), missiles: Math.max(player.missiles, startMissiles()), flares: Math.max(player.flares, startFlares()), invul: 2.5, alive: true });
  player.mesh.visible = true; snapCamera();
  botSpawnCd = 3;
  Sound.sfxRevive();
  enterReady();
}

// ---------- garage screen ----------
const coinHtml = n => '<span class="coin"></span>' + n;
const hex = n => '#' + n.toString(16).padStart(6, '0');
function renderGarage() {
  $('gCoins').textContent = garage.coins;
  renderParts();
  renderFleet();
  $('upList').innerHTML = UPGRADES.map(u => {
    const lv = garage.lv[u.id], maxed = lv >= u.max, cost = UP_COST[lv];
    const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    return `<div class="upRow"><div class="upTxt"><b>${u.name}</b><small>${u.desc}</small><span class="pips">${pips}</span></div>` +
      `<button class="btn buy" id="buy-${u.id}" data-up="${u.id}"${maxed || garage.coins < cost ? ' disabled' : ''}>${maxed ? 'MAX' : coinHtml(cost)}</button></div>`;
  }).join('');
  $('paintList').innerHTML = PAINTS.map(p => {
    const own = garage.paints.includes(p.id), sel = garage.paint === p.id;
    return `<button class="swatch${sel ? ' sel' : ''}" id="paint-${p.id}" data-paint="${p.id}"${!own && garage.coins < p.cost ? ' disabled' : ''}>` +
      `<span class="sw" style="background:linear-gradient(135deg,${hex(p.body)} 50%,${hex(p.wing)} 50%)"></span>` +
      `<span class="nm">${p.name}</span><span class="pc">${sel ? 'ON' : own ? 'USE' : coinHtml(p.cost)}</span></button>`;
  }).join('');
}
function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id), lv = garage.lv[id];
  if (!u || lv >= u.max || garage.coins < UP_COST[lv]) return;
  garage.coins -= UP_COST[lv]; garage.lv[id] = lv + 1;
  saveGarage(); Sound.sfxAmmo(); applyLook(); renderGarage();
  toast(`${u.name} upgraded to LV ${lv + 1}`);
}
function choosePlane(id) {
  const p = PLANES.find(x => x.id === id); if (!p) return;
  if (!garage.planes.includes(id)) {
    if (p.cost === null || garage.coins < p.cost) return;
    garage.coins -= p.cost; garage.planes.push(id);
    toast(`${p.name} unlocked`);
  }
  garage.plane = id;
  saveGarage(); Sound.sfxHeart(); applyLook(); renderGarage();
}
function choosePaint(id) {
  const p = PAINTS.find(x => x.id === id); if (!p) return;
  if (!garage.paints.includes(id)) {
    if (garage.coins < p.cost) return;
    garage.coins -= p.cost; garage.paints.push(id);
    toast(`${p.name} paint unlocked`);
  }
  garage.paint = id;
  saveGarage(); Sound.sfxHeart(); applyLook(); renderGarage();
}
$('garage').addEventListener('click', e => {
  const b = e.target.closest('button[data-up],button[data-paint],button[data-plane]');
  if (!b || b.disabled || state !== 'garage') return;
  Sound.init();
  if (b.dataset.up) requestPurchase('upgrade',b.dataset.up); else if (b.dataset.plane) requestPurchase('plane',b.dataset.plane); else requestPurchase('paint',b.dataset.paint);
});

// ---------- daily bonus (7-day cycle, one claim per calendar day) ----------
function renderDaily() {
  const d = garage.daily, can = canClaimDaily();
  $('dailyList').innerHTML = DAILY.map((r, i) => {
    const done = i < d.day, today = i === d.day && can;
    const what = r.plane ? (garage.planes.includes(r.plane) ? coinHtml(r.coins) : 'FALCON X') : coinHtml(r.coins);
    return `<div class="dTile${done ? ' done' : ''}${today ? ' today' : ''}${r.plane ? ' big' : ''}"><b>DAY ${i + 1}</b><span>${what}</span>${done ? '<i>&#10003;</i>' : ''}</div>`;
  }).join('');
  $('btnClaim').disabled = !can;
  $('btnClaim').textContent = can ? 'CLAIM' : 'COME BACK TOMORROW';
}
function claimDaily() {
  if (state !== 'daily' || !canClaimDaily()) return;
  const r = DAILY[garage.daily.day];
  if (r.plane && !garage.planes.includes(r.plane)) {
    garage.planes.push(r.plane);
    toast('FALCON X unlocked! Equip it in the GARAGE');
  } else {
    garage.coins += r.coins;
    toast(`+${r.coins} coins`);
  }
  garage.daily = { day: (garage.daily.day + 1) % 7, last: todayStr() };
  saveGarage(); Sound.sfxRevive();
  // show the tile just claimed as done even when the cycle wrapped
  renderDaily();
  if (garage.daily.day === 0) $('dailyList').querySelectorAll('.dTile').forEach(t => t.classList.add('done'));
}
