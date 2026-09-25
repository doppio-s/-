'use strict';
/* =========================================================
   flight.io — free-roam plane shooter for CrazyGames
   ========================================================= */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// ---------- load bundled three.js ----------
let THREE;
THREE = window.THREE_LIB;   // bundled three.js is loaded as a classic script (no blob/dynamic import, works in sandboxed previews)
if (!THREE) {
  $('loading').textContent = 'Could not load the game. Please refresh the page.';
  throw new Error('three.js failed to load');
}

// ---------- CrazyGames SDK wrapper (works without SDK too) ----------
const CG = {
  sdk: null, env: 'none', want: false, sent: false, lastCall: 0, syncTimer: null,
  async init() {
    try {
      if (window.CrazyGames && window.CrazyGames.SDK) {
        const sdk = window.CrazyGames.SDK;
        await Promise.race([sdk.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('SDK init timeout')), 5000))]);
        this.sdk = sdk;
        this.env = sdk.environment || 'none';
      }
    } catch (e) { console.warn('[CG] init failed', e); this.sdk = null; this.env = 'none'; }
  },
  get active() { return !!this.sdk && (this.env === 'crazygames' || this.env === 'local'); },
  call(fn) { if (!this.active) return; try { const r = fn(this.sdk); if (r && r.catch) r.catch(() => {}); } catch (e) { console.warn('[CG]', e); } },
  loadingStart() { this.call(s => s.game.loadingStart()); },
  loadingStop() { this.call(s => s.game.loadingStop()); },
  // the SDK throttles gameplayStart/Stop calls closer than 1s apart, so sync the latest wanted state at a safe pace
  gameplayStart() { this.want = true; this.sync(); },
  gameplayStop() { this.want = false; this.sync(); },
  sync() {
    if (this.want === this.sent) return;
    const wait = 1100 - (Date.now() - this.lastCall);
    if (wait > 0) { if (!this.syncTimer) this.syncTimer = setTimeout(() => { this.syncTimer = null; this.sync(); }, wait); return; }
    this.sent = this.want; this.lastCall = Date.now();
    const on = this.sent;
    this.call(s => on ? s.game.gameplayStart() : s.game.gameplayStop());
  },
  happytime() { this.call(s => s.game.happytime()); },
  // resolves 'ok' | 'error' | 'noads'
  ad(type) {
    return Promise.resolve('noads');
    return new Promise(resolve => {
      let done = false, started = false;
      const finish = r => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
      const timer = setTimeout(() => { if (!started) finish('error'); }, 8000);
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => { started = true; Sound.setAdMute(true); },
          adFinished: () => { Sound.setAdMute(false); finish('ok'); },
          adError: (err) => { Sound.setAdMute(false); console.warn('[CG] ad error', err); finish('error'); },
        });
      } catch (e) { Sound.setAdMute(false); finish('error'); }
    });
  },
};

// ---------- storage (SDK data module, falls back to localStorage) ----------
const Store = {
  async get(k) {
    try { if (CG.active && CG.sdk.data) { const v = await Promise.resolve(CG.sdk.data.getItem(k)); if (v !== null && v !== undefined) return v; } } catch (e) {}
    try { return localStorage.getItem('pptest_' + k); } catch (e) { return null; }
  },
  set(k, v) {
    v = String(v);
    try { if (CG.active && CG.sdk.data) { const r = CG.sdk.data.setItem(k, v); if (r && r.catch) r.catch(() => {}); } } catch (e) {}
    try { localStorage.setItem('pptest_' + k, v); } catch (e) {}
  },
};

// ---------- sound (WebAudio synth, no files) ----------
const Sound = {
  ctx: null, master: null, musicG: null, muted: false, adMuted: false, hidden: false,
  step: 0, nextT: 0, timer: null, mode: 'normal', drums: false,
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicG = this.ctx.createGain();
      this.musicG.gain.value = 0.32;
      this.musicG.connect(this.master);
      this.sfxG = this.ctx.createGain(); this.sfxG.connect(this.master);
      createEngineAudio(); applyAudio();
      this.apply();
      this.nextT = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.sched(), 60);
      this.resume();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') && !this.adMuted && !this.hidden) this.ctx.resume().catch(() => {}); },
  apply() {
    if (!this.master) return;
    const v = (this.muted || this.adMuted) ? 0 : 0.7;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(v, this.ctx.currentTime);
  },
  setMuted(m) { this.muted = m; this.apply(); updateMuteBtn(); Store.set('muted', m ? '1' : '0'); },
  setAdMute(m) {
    this.adMuted = m; this.apply();
    if (!this.ctx) return;
    if (m) this.ctx.suspend().catch(() => {}); else this.resume();
  },
  setHidden(h) {
    this.hidden = h;
    if (!this.ctx) return;
    if (h) this.ctx.suspend().catch(() => {}); else this.resume();
  },
  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxG || this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.3, freq = 800, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.sfxG || this.master); s.start(t);
  },
  // music: happy 4-chord loop; turns dark and faster for bosses, drums kick in during flight
  sched() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.nextT < now - 0.05) this.nextT = now + 0.05;
    while (this.nextT < now + 0.25) {
      this.playStep(this.step, this.nextT);
      this.nextT += this.mode === 'titan' ? 0.12 : this.mode === 'boss' ? 0.14 : 0.16;
      this.step = (this.step + 1) % 64;
    }
  },
  drum(kind, t) {
    const c = this.ctx;
    if (kind === 'kick') {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(this.musicG); o.start(t); o.stop(t + 0.25);
      return;
    }
    const hat = kind === 'hat', len = Math.floor(c.sampleRate * (hat ? 0.035 : 0.14));
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = hat ? 'highpass' : 'bandpass'; f.frequency.value = hat ? 7000 : 1800;
    const g = c.createGain(); g.gain.value = hat ? 0.1 : 0.38;
    s.connect(f); f.connect(g); g.connect(this.musicG); s.start(t);
  },
  playStep(s, t) {
    const dark = this.mode !== 'normal';
    const chords = dark
      ? [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66], [164.81, 207.65, 246.94]]
      : [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];
    const ch = chords[Math.floor(s / 16)];
    const i = s % 16;
    const note = (f, d, type, v) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.musicG); o.start(t); o.stop(t + d + 0.02);
    };
    if (i % 4 === 0) note(ch[0] / 2, 0.3, dark ? 'sawtooth' : 'triangle', dark ? 0.2 : 0.35);
    if (i % 4 === 2) note(ch[2] / 2, 0.15, 'triangle', 0.18);
    if (dark && i % 2 === 1) note(ch[0] / 2, 0.1, 'sawtooth', 0.1);
    const arp = [0, 1, 2, 1, 2, 0, 1, 2];
    if (i % 2 === 0) note(ch[arp[(i / 2) % 8]] * 2, 0.14, 'square', 0.035);
    const mel = [0, -1, 2, -1, 1, -1, 2, 1, 0, -1, 1, -1, 2, -1, -1, -1];
    if (mel[i] >= 0) note(ch[mel[i]] * 4, 0.22, dark ? 'square' : 'sine', dark ? 0.03 : 0.06);
    if (this.drums) {
      if (i % 4 === 0) this.drum('kick', t);
      if (i % 8 === 4) this.drum('snare', t);
      if (dark || i % 2 === 1) this.drum('hat', t);
      if (this.mode === 'titan' && (i === 14 || i === 15)) this.drum('snare', t);
    }
  },
  // sfx
  sfxFlap() { this.tone(300, 0.12, 'sine', 0.08, 520); },
  sfxStar() { this.tone(988, 0.1, 'square', 0.07); this.tone(1319, 0.18, 'square', 0.07, null, 0.07); },
  sfxCrash() { this.noise(0.5, 0.45, 1200); this.tone(220, 0.5, 'sawtooth', 0.15, 50); },
  sfxOver() { [523, 392, 330, 262].forEach((f, k) => this.tone(f, 0.22, 'triangle', 0.15, null, 0.12 * k)); },
  sfxRevive() { [392, 523, 659, 784].forEach((f, k) => this.tone(f, 0.18, 'square', 0.07, null, 0.08 * k)); },
  sfxClick() { this.tone(660, 0.07, 'square', 0.06); },
  sfxFanfare(big) {
    const notes = big ? [523, 659, 784, 1046, 1318] : [659, 880, 1175];
    notes.forEach((f, k) => { this.tone(f, 0.18, 'square', 0.06, null, 0.07 * k); this.tone(f / 2, 0.22, 'triangle', 0.08, null, 0.07 * k); });
  },
  sfxSiren() { for (let i = 0; i < 4; i++) this.tone(420, 0.38, 'sawtooth', 0.07, 880, i * 0.42); },
};

function updateMuteBtn() {
  $('btnMute').innerHTML = Sound.muted
    ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2.3" fill="none" stroke-linecap="round"/></svg>';
  $('btnMute').setAttribute('aria-label', Sound.muted ? 'Sound off' : 'Sound on');
}



// extra sound effects for the shooter
Object.assign(Sound, {
  sfxShoot() { this.tone(880, 0.07, 'square', 0.05, 440); },
  sfxEnemyShoot() { this.tone(330, 0.1, 'square', 0.035, 180); },
  sfxEmpty() { this.tone(160, 0.05, 'square', 0.05); },
  sfxHit() { this.noise(0.25, 0.4, 2000); this.tone(200, 0.25, 'sawtooth', 0.12, 80); },
  sfxBoom() { this.noise(0.45, 0.35, 900); this.tone(140, 0.4, 'triangle', 0.18, 40); },
  sfxAmmo() { [660, 880, 1100].forEach((f, k) => this.tone(f, 0.08, 'square', 0.06, null, 0.05 * k)); },
  sfxHeart() { [523, 659, 784, 1046].forEach((f, k) => this.tone(f, 0.12, 'sine', 0.12, null, 0.06 * k)); },
  sfxSpeed() { this.tone(400, 0.35, 'sawtooth', 0.06, 1200); },
});

// ---------- renderer / scene ----------
const IS_TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('loading').textContent = 'WebGL is not available in this browser.';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const ALT = 20;          // flight altitude
let MAP = 280;           // playable half-size (bigger in deep space)
const SKY = 0xa9e3ff;
const scene = new THREE.Scene();
const HORIZON = 0xc4ecff;
scene.background = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#3a9bff'); gr.addColorStop(0.45, '#8fd3ff'); gr.addColorStop(0.62, '#c4ecff'); gr.addColorStop(1, '#c4ecff');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
scene.fog = new THREE.Fog(HORIZON, 70, 300);
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 700);

const hemi = new THREE.HemisphereLight(0xffffff, 0x6fa8d8, 1.45); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 200 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.3;
scene.add(sun, sun.target);

const G = {
  sph: new THREE.SphereGeometry(1, 24, 16),
  sphLo: new THREE.SphereGeometry(1, 10, 7),
  sphMid: new THREE.SphereGeometry(1, 16, 11),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 18),
  torus: new THREE.TorusGeometry(1, 0.16, 10, 36),
  capsule: new THREE.CapsuleGeometry(1, 2, 8, 16),
};
const matCache = {};
const M = (color, o = {}) => {
  const k = color + JSON.stringify(o);
  return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o }));
};
function part(geo, mat, sx, sy, sz, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}

// ---------- plane models (nose = +x, right wing = +z) ----------
// Angular airframes: polygonal hulls, distinctive wing plans and emissive thrusters.
const spaceGeometry=new Map();
function spaceHull(key,points,depth){
  if(spaceGeometry.has(key))return spaceGeometry.get(key);
  const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1});geo.translate(0,0,-depth/2);geo.rotateX(Math.PI/2);geo.computeVertexNormals();spaceGeometry.set(key,geo);return geo;
}
function makeSpacecraft(bodyCol,wingCol,shape){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);body.rotation.order='ZXY';
  const hull=M(shape==='spectre'?0x283446:0xc9d8e5,{metalness:.55,roughness:.36}),dark=M(0x162839,{metalness:.5,roughness:.4});
  const trim=M(wingCol,{metalness:.3}),accent=M(bodyCol),glass=M(0x5ee7ed,{emissive:0x087c9c,emissiveIntensity:.4,metalness:.5,roughness:.15});
  const glow=M(shape==='halo'?0xb69dff:0x69eaff,{emissive:shape==='halo'?0x8150ff:0x16b8ff,emissiveIntensity:1.8});
  const plate=(key,points,depth,mat,y=0)=>part(spaceHull(key,points,depth),mat,1,1,1,0,y,0,body);
  const engine=(x,y,z,size=.28)=>{const t=part(G.cyl,dark,size,.7,size,x,y,z,body);t.rotation.z=Math.PI/2;const e=part(G.cyl,glow,size*.8,.12,size*.8,x-.4,y,z,body);e.rotation.z=Math.PI/2;part(G.cone,glow,size*.65,.85,size*.65,x-.8,y,z,body).rotation.z=Math.PI/2;};
  plate('space-spine',[[3.1,0],[1.2,.42],[-1.9,.52],[-2.3,.24],[-2.3,-.24],[-1.9,-.52],[1.2,-.42]],.42,hull);
  plate('space-canopy',[[1.7,0],[.5,.31],[-.6,.28],[-.85,0],[-.6,-.28],[.5,-.31]],.2,glass,.32);
  plate('space-nose-stripe',[[2.85,0],[1.25,.12],[1.25,-.12]],.04,accent,.23);
  if(shape==='lancer'){
    for(const s of [-1,1]){
      plate('lancer-wing'+s,[[.8,s*.3],[-.3,s*1.9],[-1.8,s*2.3],[-1.3,s*.4]],.14,hull,-.08);
      part(G.box,trim,2.2,.13,.18,-.5,-.02,s*1.45,body).rotation.y=s*.45;
      const rail=part(G.cyl,dark,.09,2.1,.09,.1,-.1,s*1.85,body);rail.rotation.z=Math.PI/2;
      engine(-1.6,0,s*.62,.26);
    }
  }else if(shape==='seraph'){
    for(const s of [-1,1])for(const up of [-1,1]){
      const wing=plate('seraph-wing'+s+up,[[.7,s*.35],[1,s*1.5],[-1.4,s*2.65],[-1.8,s*.4]],.13,hull,up*.2);wing.rotation.x=up*s*.28;
      part(G.box,trim,1,.13,.35,-.8,up*.84,s*2.05,body).rotation.y=s*.55;
      engine(-1.4,up*.8,s*1.7,.22);
    }
  }else if(shape==='spectre'){
    plate('spectre-wing',[[2.2,0],[-1.25,3.05],[-2.15,2.65],[-1.4,.8],[-2.25,0],[-1.4,-.8],[-2.15,-2.65],[-1.25,-3.05]],.18,hull,-.13);
    for(const s of [-1,1]){plate('spectre-trim'+s,[[.9,s*.7],[-1.2,s*2.7],[-1.4,s*2.4],[.6,s*.7]],.045,trim,0);engine(-1.65,-.03,s*.85,.32);}
  }else if(shape==='halo'){
    const gold=M(0xffd98a,{metalness:.7,roughness:.25,emissive:0x6a4a10,emissiveIntensity:.4});
    const node=M(0xffffff,{emissive:0xc9a8ff,emissiveIntensity:2.4});
    const mkRing=(r,mat,x,dir,tilt)=>{
      const holder=new THREE.Group();holder.position.set(x,0,0);holder.rotation.set(tilt,Math.PI/2,0);body.add(holder);
      const spin=new THREE.Group();spin.name='halo-spin';spin.userData.dir=dir;holder.add(spin);
      part(G.torus,mat,r,r,r,0,0,0,spin);
      for(let i=0;i<6;i++){const a=i/6*Math.PI*2;part(G.sph,node,.17,.17,.17,Math.cos(a)*r,Math.sin(a)*r,0,spin);}
    };
    mkRing(1.75,hull,-.85,1,0);
    const light=part(G.torus,glow,1.46,1.46,1.46,-.9,0,0,body);light.rotation.y=Math.PI/2;
    mkRing(2.05,gold,-1.05,-1,.35);
    for(const s of [-1,1]){part(G.box,dark,.5,.18,2,-.85,0,s*.9,body);part(G.box,gold,.8,.24,.25,-.5,0,s*2,body);engine(-1.5,0,s*2,.31);
      const fin=part(G.box,gold,1.1,.9,.08,-1.2,.55,s*.35,body);fin.rotation.x=-s*.35;}
    part(G.cone,glow,.22,.9,.22,2.9,.05,0,body).rotation.z=-Math.PI/2;
  }
  root.userData={body,props:[]};root.scale.setScalar(shape==='halo'?1.5:1.85);addExhaust(root,shape);return root;
}

function makePlane(bodyCol, wingCol, shape = 'classic') {
  if (['lancer','seraph','spectre','halo'].includes(shape)) return makeSpacecraft(bodyCol,wingCol,shape);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body); body.rotation.order = 'ZXY';
  const mb = M(bodyCol), mw = M(wingCol), mwhite = M(0xffffff), mglass = M(0x9fe7ff, { roughness: 0.15 }), mdark = M(0x3a2350);
  const props = [];
  const addProp = (x, y, z, s = 1) => {
    const pr = new THREE.Group(); pr.position.set(x, y, z); body.add(pr);
    part(G.sph, mdark, 0.17 * s, 0.17 * s, 0.17 * s, 0, 0, 0, pr);
    part(G.box, mdark, 0.08, 2.0 * s, 0.24 * s, 0, 0, 0, pr);
    part(G.box, mdark, 0.08, 0.24 * s, 2.0 * s, 0, 0, 0, pr);
    props.push(pr);
  };
  if (shape === 'falcon') {                       // jet-style ace
    const fus = part(G.capsule, mb, 0.55, 0.95, 0.55, 0, 0, 0, body); fus.rotation.z = Math.PI / 2;
    const nose = part(G.cone, mwhite, 0.5, 1.3, 0.5, 2.35, 0, 0, body); nose.rotation.z = -Math.PI / 2;
    for (const sd of [-1, 1]) {
      const w = part(G.box, mw, 1.3, 0.14, 2.3, -0.35, -0.05, sd * 1.35, body); w.rotation.y = sd * 0.55;
      const fin = part(G.box, mb, 0.8, 0.9, 0.09, -1.5, 0.55, sd * 0.38, body); fin.rotation.z = 0.35;
      const tw = part(G.box, mw, 0.6, 0.08, 0.9, -1.55, 0.05, sd * 0.7, body); tw.rotation.y = sd * 0.4;
    }
    part(G.sph, mglass, 0.75, 0.42, 0.42, 0.6, 0.42, 0, body);
    const eng = part(G.cyl, M(0xffb13b, { emissive: 0xff6a00 }), 0.36, 0.3, 0.36, -2.05, 0, 0, body); eng.rotation.z = Math.PI / 2;
  } else {
    const fat = shape === 'brick' ? 0.8 : shape === 'swift' ? 0.5 : 0.62;
    const len = shape === 'swift' ? 0.98 : 0.8;
    const fus = part(G.capsule, mb, fat, len, fat, 0, 0, 0, body); fus.rotation.z = Math.PI / 2;
    const noseX = 1.55 + (len - 0.8) * 2 + (fat - 0.62) * 0.8;
    part(G.sph, mwhite, fat * 0.8, fat * 0.8, fat * 0.8, noseX, 0, 0, body);
    addProp(noseX + 0.5, 0, 0);
    if (shape === 'swift') {
      for (const sd of [-1, 1]) { const w = part(G.sph, mw, 0.6, 0.12, 1.35, -0.1, -0.1, sd * 1.05, body); w.rotation.y = sd * 0.42; }
    } else {
      part(G.sph, mw, 0.78, 0.14, 2.5, 0.25, -0.12, 0, body);
    }
    if (shape === 'brick') {                      // biplane
      part(G.sph, mw, 0.78, 0.14, 2.4, 0.25, 1.25, 0, body);
      for (const sd of [-1, 1]) part(G.cyl, mdark, 0.07, 1.35, 0.07, 0.25, 0.56, sd * 1.5, body);
    }
    if (shape === 'twin') {                       // two extra engines on the wings
      for (const sd of [-1, 1]) {
        const e = part(G.capsule, mb, 0.3, 0.38, 0.3, 0.55, -0.1, sd * 1.3, body); e.rotation.z = Math.PI / 2;
        addProp(1.55, -0.1, sd * 1.3, 0.6);
      }
    }
    part(G.sph, mw, 0.42, 0.1, 1.05, -1.4 - (len - 0.8), 0.12, 0, body);
    part(G.sph, mb, 0.48, 0.66, 0.1, -1.4 - (len - 0.8), 0.55, 0, body);
    part(G.sph, mglass, 0.58, 0.44, 0.44, 0.35, fat * 0.78, 0, body);
    const st = part(G.cyl, mwhite, fat * 1.08, 0.24, fat * 1.08, -0.6, 0, 0, body); st.rotation.z = Math.PI / 2;
  }
  root.userData = { body, props };
  root.scale.setScalar(1.85);
  addExhaust(root,shape);
  return root;
}
function orientPlane(p, dt) {
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.rotation.y = -p.a;
  p.mesh.userData.body.rotation.set(p.roll + (p.rollFx || 0), 0, p.p || 0);
  for (const pr of p.mesh.userData.props) pr.rotation.x += dt * 45;
  const sp = p.mesh.__spin || (p.mesh.__spin = spinPartsOf(p.mesh));
  for (const g of sp) g.rotation.z += dt * 3.2 * g.userData.dir;
}
function spinPartsOf(root) { const a = []; root.traverse(o => { if (o.name === 'halo-spin') a.push(o); }); return a; }
function makeTurret() {
  const g = new THREE.Group();
  part(G.cyl, M(0x7b8494), 1.7, 1.4, 1.7, 0, 0.7, 0, g);
  const head = new THREE.Group(); head.position.y = 1.6; g.add(head);
  part(G.sph, M(0x55607a), 1.25, 1.0, 1.25, 0, 0, 0, head);
  part(G.sph, M(0xff3b3b, { emissive: 0xaa0000 }), 0.28, 0.28, 0.28, -0.9, 0.5, 0, head);
  const barrels = new THREE.Group(); head.add(barrels);
  for (const sd of [-1, 1]) part(G.cyl, M(0x2b2d42), 0.2, 2.8, 0.2, 0, 1.3, sd * 0.42, barrels);
  g.userData = { head, barrels };
  g.scale.setScalar(1.3);
  return g;
}
function makeMissile(enemy) {
  const g = new THREE.Group();
  const b = part(G.capsule, M(enemy ? 0x3a3f55 : 0xffffff), 0.22, 0.55, 0.22, 0, 0, 0, g); b.rotation.z = Math.PI / 2;
  const tip = part(G.sph, M(enemy ? 0xff3b3b : 0xff4d6d), 0.23, 0.23, 0.23, 0.78, 0, 0, g);
  for (const r of [0, Math.PI / 2]) { const f = part(G.box, M(enemy ? 0xff3b3b : 0xffd23f), 0.35, 0.04, 0.75, -0.6, 0, 0, g); f.rotation.x = r; }
  g.scale.setScalar(1.6);
  return g;
}

// ---------- world: sea, islands, clouds, border ----------
function canvasTex(size, draw, rep) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const seaTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#3db6ec'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#7fd6f7'; g.lineWidth = 6; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y - 10, x + 28, y); g.quadraticCurveTo(x + 42, y + 10, x + 56, y); g.stroke();
  }
}, 90);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: seaTex, roughness: 0.35 }));
sea.rotation.x = -Math.PI / 2; sea.receiveShadow = true;
scene.add(sea);

function instanced(geo, mat, list, cast = true) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  list.forEach((d, i) => {
    e.set(0, d.ry || 0, 0); q.setFromEuler(e);
    m4.compose(v.set(d.x, d.y, d.z), q, sc.set(d.sx, d.sy, d.sz));
    im.setMatrixAt(i, m4);
    im.setColorAt(i, col.set(d.c === undefined ? 0xffffff : d.c));
  });
  im.castShadow = cast; im.receiveShadow = true;
  scene.add(im); return im;
}
const ISLANDS = [], WORLD = {};
(function buildWorld() {
  const islands = ISLANDS;
  for (let tries = 0; islands.length < 70 && tries < 4000; tries++) {
    const x = rand(-360, 360), z = rand(-360, 360), r = rand(6, 16);
    if (islands.every(o => Math.hypot(o.x - x, o.z - z) > o.r + r + 14)) islands.push({ x, z, r });
  }
  const sand = [], hills = [], trunks = [], leaves = [];
  const greens = [0x6fd36a, 0x58c04f, 0x8ae26b, 0x4fb862];
  for (const o of islands) {
    sand.push({ x: o.x, y: 0.4, z: o.z, sx: o.r, sy: 0.9, sz: o.r * rand(0.8, 1), ry: rand(0, 6), c: 0xffe1a1 });
    const n = 1 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const hr = o.r * rand(0.45, 0.7), a = rand(0, 6.3), d = rand(0, o.r * 0.3);
      const hy = hr * rand(0.45, 0.8);
      hills.push({ x: o.x + Math.cos(a) * d, y: 0.6, z: o.z + Math.sin(a) * d, sx: hr, sy: hy, sz: hr, c: greens[i % 4] });
      if (i === 0) { o.tx = o.x + Math.cos(a) * d; o.tz = o.z + Math.sin(a) * d; o.ty = 0.6 + hy; }
    }
    const t = 2 + (Math.random() * 4 | 0);
    for (let i = 0; i < t; i++) {
      const a = rand(0, 6.3), d = o.r * rand(0.6, 0.85), x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d, h = rand(2.2, 3.2);
      trunks.push({ x, y: 1 + h / 2, z, sx: 0.35, sy: h, sz: 0.35, c: 0xa8663a });
      leaves.push({ x, y: 1 + h + 0.8, z, sx: rand(1.3, 1.9), sy: rand(1.2, 1.6), sz: rand(1.3, 1.9), c: greens[(Math.random() * 4) | 0] });
    }
  }
  const white = M(0xffffff);
  WORLD.sand = { im: instanced(G.cyl, white, sand, false), list: sand };
  WORLD.hills = { im: instanced(G.sphMid, white, hills), list: hills };
  WORLD.trunks = { im: instanced(G.cyl, white, trunks), list: trunks };
  WORLD.leaves = { im: instanced(G.sphMid, white, leaves), list: leaves };
  // clouds (below flight level, so planes cast shadows on them)
  const puffs = [];
  for (let i = 0; i < 110; i++) {
    const cx = rand(-360, 360), cz = rand(-360, 360), cy = rand(7, 11), n = 4 + (Math.random() * 3 | 0), s = rand(0.8, 1.4);
    for (let k = 0; k < n; k++) {
      const r = rand(2.6, 4.6) * s;
      puffs.push({ x: cx + (k - n / 2) * 3.4 * s + rand(-1, 1), y: cy + rand(-0.6, 1.4), z: cz + rand(-2.5, 2.5) * s, sx: r, sy: r * 0.8, sz: r, c: 0xffffff });
    }
  }
  WORLD.puffs = instanced(G.sphMid, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x3a4a5a }), puffs);
  const high = [];
  for (let i = 0; i < 70; i++) {
    const cx = rand(-380, 380), cz = rand(-380, 380), cy = rand(34, 52), n = 3 + (Math.random() * 3 | 0), s = rand(1, 1.8);
    for (let k = 0; k < n; k++) {
      const r = rand(2.8, 4.8) * s;
      high.push({ x: cx + (k - n / 2) * 3.6 * s, y: cy + rand(-0.8, 1.2), z: cz + rand(-2.5, 2.5) * s, sx: r, sy: r * 0.7, sz: r, c: 0xffffff });
    }
  }
  WORLD.high = instanced(G.sphMid, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x55606a }), high, false);
  // border buoys
  const posts = [], tops = [];
  for (let i = -MAP; i <= MAP; i += 16) {
    for (const [x, z] of [[i, -MAP - 6], [i, MAP + 6], [-MAP - 6, i], [MAP + 6, i]]) {
      const red = ((i / 16) | 0) % 2 === 0;
      posts.push({ x, y: 9, z, sx: 0.9, sy: 18, sz: 0.9, c: red ? 0xff4d6d : 0xffffff });
      tops.push({ x, y: 18.5, z, sx: 1.4, sy: 1.4, sz: 1.4, c: red ? 0xffffff : 0xff4d6d });
    }
  }
  WORLD.posts = instanced(G.cyl, white, posts);
  WORLD.tops = instanced(G.sphLo, white, tops);
})();

// ---------- pooled instanced effects: bullets & particles ----------
const MAXB = 480, MAXP = 800;
const bulletMesh = new THREE.InstancedMesh(G.sphLo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXB);
bulletMesh.frustumCulled = false; bulletMesh.count = 0; scene.add(bulletMesh);
const partMesh = new THREE.InstancedMesh(G.sphLo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), MAXP);
partMesh.frustumCulled = false; partMesh.count = 0; partMesh.castShadow = false; scene.add(partMesh);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();
// make sure instanceColor exists
bulletMesh.setColorAt(0, _c.set(0xffffff)); partMesh.setColorAt(0, _c.set(0xffffff));

// ---------- shockwave rings (camera-facing, additive) ----------
const SW = [], swGeo = new THREE.RingGeometry(0.84, 1, 64);
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(swGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  m.visible = false; m.frustumCulled = false; scene.add(m); SW.push({ m, t: 1, dur: 1, r: 1 });
}
function shockwave(x, y, z, r, col, dur = 0.5) {
  const s = SW.find(s => s.t >= s.dur) || SW.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
  s.t = 0; s.dur = dur; s.r = r; s.m.position.set(x, y, z); s.m.material.color.set(col); s.m.visible = true; s.m.scale.setScalar(0.01);
}
function updateShockwaves(dt) {
  for (const s of SW) {
    if (s.t >= s.dur) continue;
    s.t += dt;
    const k = Math.min(1, s.t / s.dur), e = 1 - Math.pow(1 - k, 3);
    s.m.scale.setScalar(Math.max(0.01, s.r * e));
    s.m.material.opacity = (1 - k) * 0.9;
    s.m.quaternion.copy(camera.quaternion);
    if (k >= 1) s.m.visible = false;
  }
}

// ---------- pickups ----------
function makeAmmoBox(missile) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  part(G.box, M(missile ? 0xff4d4d : 0xff9f43), 2.2, 1.5, 1.6, 0, 0, 0, inner);
  part(G.box, M(missile ? 0xffffff : 0xffd23f), 2.3, 0.35, 1.7, 0, 0.35, 0, inner);
  if (missile) {
    for (const sd of [-1, 1]) { const m = part(G.capsule, M(0xffffff, { emissive: 0x333333 }), 0.22, 0.6, 0.22, 0, 1.2, sd * 0.4, inner); m.rotation.z = Math.PI / 2; }
  } else {
    for (let i = -1; i <= 1; i++) part(G.capsule, M(0xffd23f, { emissive: 0x664400 }), 0.2, 0.3, 0.2, i * 0.55, 1.35, 0, inner);
  }
  const ring = new THREE.Mesh(G.torus, new THREE.MeshBasicMaterial({ color: missile ? 0xff9f9f : 0xfff27a, transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2; ring.scale.setScalar(2.4); ring.position.y = -1.4; g.add(ring);
  g.userData.inner = inner; g.userData.ring = ring;
  return g;
}
function makeHeart() {
  const g = new THREE.Group(); const inner = new THREE.Group(); g.add(inner);
  const m = M(0xff4d6d, { emissive: 0x551020 });
  part(G.sph, m, 0.85, 0.85, 0.7, -0.55, 0.35, 0, inner);
  part(G.sph, m, 0.85, 0.85, 0.7, 0.55, 0.35, 0, inner);
  const c = part(G.cone, m, 1.3, 1.6, 0.7, 0, -0.75, 0, inner); c.rotation.z = Math.PI;
  const ring = new THREE.Mesh(G.torus, new THREE.MeshBasicMaterial({ color: 0xffa3c2, transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2; ring.scale.setScalar(2.4); ring.position.y = -1.8; g.add(ring);
  g.userData.inner = inner; g.userData.ring = ring;
  return g;
}

