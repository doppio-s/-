const $ = id => document.getElementById(id),
  clamp = (v, a, b) => v < a ? a : v > b ? b : v,
  rand = (a, b) => a + Math.random() * (b - a),
  lerp = (a, b, t) => a + (b - a) * t,
  wrapA = a => {
    for (; a > Math.PI;) a -= Math.PI * 2;
    for (; a < -Math.PI;) a += Math.PI * 2;
    return a
  };
let THREE;
if (THREE = window.THREE_LIB, !THREE) throw $("loading").textContent = "Could not load the game. Please refresh the page.", new Error("three.js failed to load");
const CG = {
    sdk: null,
    env: "none",
    want: !1,
    sent: !1,
    lastCall: 0,
    syncTimer: null,
    async init() {
      try {
        if (window.CrazyGames && window.CrazyGames.SDK) {
          const sdk = window.CrazyGames.SDK;
          await Promise.race([sdk.init(), new Promise((_, rej) => setTimeout(() => rej(new Error("SDK init timeout")), 5e3))]), this.sdk = sdk, this.env = sdk.environment || "none"
        }
      } catch (e) {
        console.warn("[CG] init failed", e), this.sdk = null, this.env = "none"
      }
    },
    get active() {
      return !!this.sdk && (this.env === "crazygames" || this.env === "local")
    },
    call(fn) {
      if (this.active) try {
        const r = fn(this.sdk);
        r && r.catch && r.catch(() => {})
      } catch (e) {
        console.warn("[CG]", e)
      }
    },
    loadingStart() {
      this.call(s2 => s2.game.loadingStart())
    },
    loadingStop() {
      this.call(s2 => s2.game.loadingStop())
    },
    gameplayStart() {
      this.want = !0, this.sync()
    },
    gameplayStop() {
      this.want = !1, this.sync()
    },
    sync() {
      if (this.want === this.sent) return;
      const wait = 1100 - (Date.now() - this.lastCall);
      if (wait > 0) {
        this.syncTimer || (this.syncTimer = setTimeout(() => {
          this.syncTimer = null, this.sync()
        }, wait));
        return
      }
      this.sent = this.want, this.lastCall = Date.now();
      const on = this.sent;
      this.call(s2 => on ? s2.game.gameplayStart() : s2.game.gameplayStop())
    },
    happytime() {
      this.call(s2 => s2.game.happytime())
    },
    ad(type) {
      /*TEST{*/ return Promise.resolve("noads"); /*}TEST*/
      if (!this.active) return Promise.resolve("noads");   // no ad network outside CrazyGames: never block the player
      return new Promise(resolve => {
        let done = false, started = false;
        const finish = r => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
        const timer = setTimeout(() => { started || finish("error"); }, 8e3);
        try {
          this.sdk.ad.requestAd(type, {
            adStarted: () => { started = true; Sound.setAdMute(true); },
            adFinished: () => { Sound.setAdMute(false); finish("ok"); },
            adError: err => { Sound.setAdMute(false); console.warn("[CG] ad error", err); finish("error"); }
          });
        } catch (e) { Sound.setAdMute(false); finish("error"); }
      });
    }
  },
  Store = {
    async get(k) {
      try {
        if (CG.active && CG.sdk.data) {
          const v = await Promise.resolve(CG.sdk.data.getItem(k));
          if (v != null) return v
        }
      } catch {}
      try {
        return localStorage.getItem((/*TEST{*/"pptest_" || /*}TEST*/"pp_") + k)
      } catch {
        return null
      }
    },
    set(k, v) {
      v = String(v);
      try {
        if (CG.active && CG.sdk.data) {
          const r = CG.sdk.data.setItem(k, v);
          r && r.catch && r.catch(() => {})
        }
      } catch {}
      try {
        localStorage.setItem((/*TEST{*/"pptest_" || /*}TEST*/"pp_") + k, v)
      } catch {}
    }
  },
  Sound = {
    ctx: null,
    master: null,
    musicG: null,
    muted: !1,
    adMuted: !1,
    hidden: !1,
    step: 0,
    nextT: 0,
    timer: null,
    mode: "normal",
    drums: !1,
    init() {
      if (this.ctx) {
        this.resume();
        return
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) try {
        this.ctx = new AC, this.master = this.ctx.createGain(), this.master.connect(this.ctx.destination), this.musicG = this.ctx.createGain(), this.musicG.gain.value = .32, this.musicG.connect(this.master), this.sfxG = this.ctx.createGain(), this.sfxG.connect(this.master), createEngineAudio(), applyAudio(), this.apply(), this.nextT = this.ctx.currentTime + .1, this.timer = setInterval(() => this.sched(), 60), this.resume()
      } catch {
        this.ctx = null
      }
    },
    resume() {
      this.ctx && (this.ctx.state === "suspended" || this.ctx.state === "interrupted") && !this.adMuted && !this.hidden && this.ctx.resume().catch(() => {})
    },
    apply() {
      if (!this.master) return;
      const v = this.muted || this.adMuted ? 0 : .7;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime), this.master.gain.setValueAtTime(v, this.ctx.currentTime)
    },
    setMuted(m) {
      this.muted = m, this.apply(), updateMuteBtn(), Store.set("muted", m ? "1" : "0")
    },
    setAdMute(m) {
      this.adMuted = m, this.apply(), this.ctx && (m ? this.ctx.suspend().catch(() => {}) : this.resume())
    },
    setHidden(h) {
      this.hidden = h, this.ctx && (h ? this.ctx.suspend().catch(() => {}) : this.resume())
    },
    tone(freq, dur, type = "sine", vol = .2, slideTo = null, delay = 0, dest = null) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + delay,
        o = this.ctx.createOscillator(),
        g = this.ctx.createGain();
      o.type = type, o.frequency.setValueAtTime(freq, t), slideTo && o.frequency.exponentialRampToValueAtTime(slideTo, t + dur), g.gain.setValueAtTime(1e-4, t), g.gain.exponentialRampToValueAtTime(Math.max(1e-4, vol), t + .01), g.gain.exponentialRampToValueAtTime(1e-4, t + dur), o.connect(g), g.connect(dest || this.sfxG || this.master), o.start(t), o.stop(t + dur + .02)
    },
    noise(dur, vol = .3, freq = 800, delay = 0) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + delay,
        len = Math.max(1, Math.floor(this.ctx.sampleRate * dur)),
        buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate),
        d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s2 = this.ctx.createBufferSource();
      s2.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass", f.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = vol, s2.connect(f), f.connect(g), g.connect(this.sfxG || this.master), s2.start(t)
    },
    sched() {
      if (!this.ctx || this.ctx.state !== "running") return;
      const now = this.ctx.currentTime;
      for (this.nextT < now - .05 && (this.nextT = now + .05); this.nextT < now + .25;) this.playStep(this.step, this.nextT), this.nextT += this.mode === "titan" ? .12 : this.mode === "boss" ? .14 : .16, this.step = (this.step + 1) % 64
    },
    drum(kind, t) {
      const c = this.ctx;
      if (kind === "kick") {
        const o = c.createOscillator(),
          g2 = c.createGain();
        o.type = "sine", o.frequency.setValueAtTime(155, t), o.frequency.exponentialRampToValueAtTime(42, t + .16), g2.gain.setValueAtTime(.6, t), g2.gain.exponentialRampToValueAtTime(1e-4, t + .22), o.connect(g2), g2.connect(this.musicG), o.start(t), o.stop(t + .25);
        return
      }
      const hat = kind === "hat",
        len = Math.floor(c.sampleRate * (hat ? .035 : .14)),
        buf = c.createBuffer(1, len, c.sampleRate),
        d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s2 = c.createBufferSource();
      s2.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = hat ? "highpass" : "bandpass", f.frequency.value = hat ? 7e3 : 1800;
      const g = c.createGain();
      g.gain.value = hat ? .1 : .38, s2.connect(f), f.connect(g), g.connect(this.musicG), s2.start(t)
    },
    playStep(s2, t) {
      const dark = this.mode !== "normal",
        ch = (dark ? [
          [220, 261.63, 329.63],
          [174.61, 220, 261.63],
          [196, 246.94, 293.66],
          [164.81, 207.65, 246.94]
        ] : [
          [261.63, 329.63, 392],
          [220, 261.63, 329.63],
          [174.61, 220, 261.63],
          [196, 246.94, 293.66]
        ])[Math.floor(s2 / 16)],
        i = s2 % 16,
        note = (f, d, type, v) => {
          const o = this.ctx.createOscillator(),
            g = this.ctx.createGain();
          o.type = type, o.frequency.value = f, g.gain.setValueAtTime(1e-4, t), g.gain.exponentialRampToValueAtTime(v, t + .01), g.gain.exponentialRampToValueAtTime(1e-4, t + d), o.connect(g), g.connect(this.musicG), o.start(t), o.stop(t + d + .02)
        };
      i % 4 === 0 && note(ch[0] / 2, .3, dark ? "sawtooth" : "triangle", dark ? .2 : .35), i % 4 === 2 && note(ch[2] / 2, .15, "triangle", .18), dark && i % 2 === 1 && note(ch[0] / 2, .1, "sawtooth", .1);
      const arp = [0, 1, 2, 1, 2, 0, 1, 2];
      i % 2 === 0 && note(ch[arp[i / 2 % 8]] * 2, .14, "square", .035);
      const mel = [0, -1, 2, -1, 1, -1, 2, 1, 0, -1, 1, -1, 2, -1, -1, -1];
      mel[i] >= 0 && note(ch[mel[i]] * 4, .22, dark ? "square" : "sine", dark ? .03 : .06), this.drums && (i % 4 === 0 && this.drum("kick", t), i % 8 === 4 && this.drum("snare", t), (dark || i % 2 === 1) && this.drum("hat", t), this.mode === "titan" && (i === 14 || i === 15) && this.drum("snare", t))
    },
    sfxFlap() {
      this.tone(300, .12, "sine", .08, 520)
    },
    sfxStar() {
      this.tone(988, .1, "square", .07), this.tone(1319, .18, "square", .07, null, .07)
    },
    sfxCrash() {
      this.noise(.5, .45, 1200), this.tone(220, .5, "sawtooth", .15, 50)
    },
    sfxOver() {
      [523, 392, 330, 262].forEach((f, k) => this.tone(f, .22, "triangle", .15, null, .12 * k))
    },
    sfxRevive() {
      [392, 523, 659, 784].forEach((f, k) => this.tone(f, .18, "square", .07, null, .08 * k))
    },
    sfxClick() {
      this.tone(660, .07, "square", .06)
    },
    sfxFanfare(big) {
      (big ? [523, 659, 784, 1046, 1318] : [659, 880, 1175]).forEach((f, k) => {
        this.tone(f, .18, "square", .06, null, .07 * k), this.tone(f / 2, .22, "triangle", .08, null, .07 * k)
      })
    },
    sfxSiren() {
      for (let i = 0; i < 4; i++) this.tone(420, .38, "sawtooth", .07, 880, i * .42)
    }
  };

function updateMuteBtn() {
  $("btnMute").innerHTML = Sound.muted ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2.3" fill="none" stroke-linecap="round"/></svg>', $("btnMute").setAttribute("aria-label", Sound.muted ? "Sound off" : "Sound on")
}
Object.assign(Sound, {
  sfxShoot() {
    this.tone(880, .07, "square", .05, 440)
  },
  sfxEnemyShoot() {
    this.tone(330, .1, "square", .035, 180)
  },
  sfxEmpty() {
    this.tone(160, .05, "square", .05)
  },
  sfxHit() {
    this.noise(.25, .4, 2e3), this.tone(200, .25, "sawtooth", .12, 80)
  },
  sfxBoom() {
    this.noise(.45, .35, 900), this.tone(140, .4, "triangle", .18, 40)
  },
  sfxAmmo() {
    [660, 880, 1100].forEach((f, k) => this.tone(f, .08, "square", .06, null, .05 * k))
  },
  sfxHeart() {
    [523, 659, 784, 1046].forEach((f, k) => this.tone(f, .12, "sine", .12, null, .06 * k))
  },
  sfxSpeed() {
    this.tone(400, .35, "sawtooth", .06, 1200)
  }
});
const IS_TOUCH = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: $("c"),
    antialias: !0,
    powerPreference: "high-performance"
  })
} catch (e) {
  throw $("loading").textContent = "WebGL is not available in this browser.", e
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2)), renderer.shadowMap.enabled = !0, renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const ALT = 20;
// playable half-size; the world, obstacles and space field are generated to match
const MAP_BASE = 560, MAP_K = MAP_BASE / 280;
let MAP = MAP_BASE;
const SKY = 11133951,
  scene = new THREE.Scene,
  HORIZON = 12905727;
scene.background = (() => {
  const c = document.createElement("canvas");
  c.width = 4, c.height = 256;
  const g = c.getContext("2d"),
    gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#3a9bff"), gr.addColorStop(.45, "#8fd3ff"), gr.addColorStop(.62, "#c4ecff"), gr.addColorStop(1, "#c4ecff"), g.fillStyle = gr, g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  return t.colorSpace = THREE.SRGBColorSpace, t
})(), scene.fog = new THREE.Fog(HORIZON, 70, 300);
const camera = new THREE.PerspectiveCamera(62, 1, .5, 700),
  hemi = new THREE.HemisphereLight(16777215, 7317720, 1.45);
scene.add(hemi);
const sun = new THREE.DirectionalLight(16774880, 2.2);
sun.castShadow = !0, sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048), Object.assign(sun.shadow.camera, {
  left: -55,
  right: 55,
  top: 55,
  bottom: -55,
  near: 1,
  far: 200
}), sun.shadow.bias = -4e-4, sun.shadow.normalBias = .3, scene.add(sun, sun.target);
const G = {
    sph: new THREE.SphereGeometry(1, 24, 16),
    sphLo: new THREE.SphereGeometry(1, 10, 7),
    sphMid: new THREE.SphereGeometry(1, 16, 11),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
    box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(1, 1, 18),
    torus: new THREE.TorusGeometry(1, .16, 10, 36),
    capsule: new THREE.CapsuleGeometry(1, 2, 8, 16)
  },
  matCache = {},
  M = (color, o = {}) => {
    const k = color + JSON.stringify(o);
    return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({
      color,
      roughness: .55,
      metalness: 0,
      ...o
    }))
  };

function part(geo, mat, sx, sy, sz, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  return m.scale.set(sx, sy, sz), m.position.set(x, y, z), m.castShadow = !0, m.receiveShadow = !0, parent.add(m), m
}
const spaceGeometry = new Map;

function spaceHull(key, points, depth) {
  if (spaceGeometry.has(key)) return spaceGeometry.get(key);
  const shape = new THREE.Shape;
  points.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z)), shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: !1,
    steps: 1
  });
  return geo.translate(0, 0, -depth / 2), geo.rotateX(Math.PI / 2), geo.computeVertexNormals(), spaceGeometry.set(key, geo), geo
}

function makeSpacecraft(bodyCol, wingCol, shape) {
  const root = new THREE.Group,
    body = new THREE.Group;
  root.add(body), body.rotation.order = "ZXY";
  const hull = M(shape === "spectre" ? 2634822 : 13228261, {
      metalness: .55,
      roughness: .36
    }),
    dark = M(1452089, {
      metalness: .5,
      roughness: .4
    }),
    trim = M(wingCol, {
      metalness: .3
    }),
    accent = M(bodyCol),
    glass = M(6219757, {
      emissive: 556188,
      emissiveIntensity: .4,
      metalness: .5,
      roughness: .15
    }),
    glow = M(shape === "halo" ? 11967999 : 6941439, {
      emissive: shape === "halo" ? 8474879 : 1489151,
      emissiveIntensity: 1.8
    }),
    plate = (key, points, depth, mat, y = 0) => part(spaceHull(key, points, depth), mat, 1, 1, 1, 0, y, 0, body),
    engine = (x, y, z, size = .28) => {
      const t = part(G.cyl, dark, size, .7, size, x, y, z, body);
      t.rotation.z = Math.PI / 2;
      const e = part(G.cyl, glow, size * .8, .12, size * .8, x - .4, y, z, body);
      e.rotation.z = Math.PI / 2;
      const c = part(G.cone, glow, size * .65, .85, size * .65, x - .8, y, z, body);
      return c.rotation.z = Math.PI / 2, [t, e, c]
    },
    anim = { ail: [], elev: [], rud: [], discs: [], sweep: [], foils: [], burner: null },
    adopt = (pv, list) => { for (const m of list) m.position.sub(pv.position), pv.add(m); };
  if (plate("space-spine", [
      [3.1, 0],
      [1.2, .42],
      [-1.9, .52],
      [-2.3, .24],
      [-2.3, -.24],
      [-1.9, -.52],
      [1.2, -.42]
    ], .42, hull), plate("space-canopy", [
      [1.7, 0],
      [.5, .31],
      [-.6, .28],
      [-.85, 0],
      [-.6, -.28],
      [.5, -.31]
    ], .2, glass, .32), plate("space-nose-stripe", [
      [2.85, 0],
      [1.25, .12],
      [1.25, -.12]
    ], .04, accent, .23), shape === "lancer")
    for (const s2 of [-1, 1]) {
      const pv = new THREE.Group;
      pv.position.set(.55, 0, s2 * .35), pv.userData.side = s2, body.add(pv), anim.sweep.push(pv);
      const wm = plate("lancer-wing" + s2, [
        [.8, s2 * .3],
        [-.3, s2 * 1.9],
        [-1.8, s2 * 2.3],
        [-1.3, s2 * .4]
      ], .14, hull, -.08), tm = part(G.box, trim, 2.2, .13, .18, -.5, -.02, s2 * 1.45, body);
      tm.rotation.y = s2 * .45;
      const rail = part(G.cyl, dark, .09, 2.1, .09, .1, -.1, s2 * 1.85, body);
      rail.rotation.z = Math.PI / 2, adopt(pv, [wm, tm, rail]), engine(-1.6, 0, s2 * .62, .26)
    } else if (shape === "seraph")
      for (const s2 of [-1, 1])
        for (const up of [-1, 1]) {
          const pv = new THREE.Group;
          pv.position.set(0, up * .2, s2 * .4), pv.userData.side = s2, pv.userData.up = up, body.add(pv), anim.foils.push(pv);
          const wing = plate("seraph-wing" + s2 + up, [
            [.7, s2 * .35],
            [1, s2 * 1.5],
            [-1.4, s2 * 2.65],
            [-1.8, s2 * .4]
          ], .13, hull, up * .2);
          wing.rotation.x = up * s2 * .28;
          const tr = part(G.box, trim, 1, .13, .35, -.8, up * .84, s2 * 2.05, body);
          tr.rotation.y = s2 * .55, adopt(pv, [wing, tr, ...engine(-1.4, up * .8, s2 * 1.7, .22)])
        } else if (shape === "spectre") {
          plate("spectre-wing", [
            [2.2, 0],
            [-1.25, 3.05],
            [-2.15, 2.65],
            [-1.4, .8],
            [-2.25, 0],
            [-1.4, -.8],
            [-2.15, -2.65],
            [-1.25, -3.05]
          ], .18, hull, -.13);
          for (const s2 of [-1, 1]) plate("spectre-trim" + s2, [
            [.9, s2 * .7],
            [-1.2, s2 * 2.7],
            [-1.4, s2 * 2.4],
            [.6, s2 * .7]
          ], .045, trim, 0), engine(-1.65, -.03, s2 * .85, .32)
        } else if (shape === "halo") {
    const gold = M(16767370, {
        metalness: .7,
        roughness: .25,
        emissive: 6965776,
        emissiveIntensity: .4
      }),
      node = M(16777215, {
        emissive: 13215999,
        emissiveIntensity: 2.4
      }),
      mkRing = (r, mat, x, dir, tilt) => {
        const holder = new THREE.Group;
        holder.position.set(x, 0, 0), holder.rotation.set(tilt, Math.PI / 2, 0), body.add(holder);
        const spin = new THREE.Group;
        spin.name = "halo-spin", spin.userData.dir = dir, holder.add(spin), part(G.torus, mat, r, r, r, 0, 0, 0, spin);
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2;
          part(G.sph, node, .17, .17, .17, Math.cos(a) * r, Math.sin(a) * r, 0, spin)
        }
      };
    mkRing(1.75, hull, -.85, 1, 0);
    const light = part(G.torus, glow, 1.46, 1.46, 1.46, -.9, 0, 0, body);
    light.rotation.y = Math.PI / 2, mkRing(2.05, gold, -1.05, -1, .35);
    for (const s2 of [-1, 1]) {
      part(G.box, dark, .5, .18, 2, -.85, 0, s2 * .9, body), part(G.box, gold, .8, .24, .25, -.5, 0, s2 * 2, body), engine(-1.5, 0, s2 * 2, .31);
      const fin = part(G.box, gold, 1.1, .9, .08, -1.2, .55, s2 * .35, body);
      fin.rotation.x = -s2 * .35
    }
    part(G.cone, glow, .22, .9, .22, 2.9, .05, 0, body).rotation.z = -Math.PI / 2
  }
  return root.userData = {
    body,
    props: [],
    anim
  }, root.scale.setScalar(shape === "halo" ? 1.5 : 1.85), addExhaust(root, shape), root
}

// ================= v16: ALIEN airframes — ORB, MANTIS, MOTHERSHIP =================
function makeAlien(bodyCol, wingCol, shape) {
  const root = new THREE.Group, body = new THREE.Group;
  root.add(body), body.rotation.order = "ZXY";
  const hull = M(shape === "mantis" ? 0x2f5a3a : shape === "mothership" ? 0x3b2c5e : 0xb8c0cc, { metalness: .75, roughness: .25 }),
    dark = M(0x1a1d2a, { metalness: .6, roughness: .35 }),
    trim = M(wingCol, { metalness: .4 }),
    dome = M(0x9dffe0, { emissive: 0x2aa37a, emissiveIntensity: .6, metalness: .3, roughness: .1, transparent: !0, opacity: .8 }),
    glow = M(0xffffff, { emissive: shape === "mothership" ? 0xb070ff : 0x6bff7a, emissiveIntensity: 2.4 }),
    ringOf = (r, mat, y, dir, nodes = 8, nodeMat = glow) => {
      const holder = new THREE.Group;
      holder.position.set(0, y, 0), holder.rotation.x = Math.PI / 2, body.add(holder);
      const spin = new THREE.Group;
      spin.name = "halo-spin", spin.userData.dir = dir, holder.add(spin), part(G.torus, mat, r, r, r * .6, 0, 0, 0, spin);
      for (let i = 0; i < nodes; i++) { const a = i / nodes * Math.PI * 2; part(G.sph, nodeMat, .16, .16, .16, Math.cos(a) * r, Math.sin(a) * r, 0, spin); }
    };
  if (shape === "orb") {
    part(G.sph, hull, 1.7, .5, 1.7, 0, 0, 0, body);
    part(G.sph, dome, .8, .62, .8, .15, .32, 0, body);
    part(G.sph, dark, 1.1, .3, 1.1, 0, -.25, 0, body);
    ringOf(1.75, M(0x2aff6a, { emissive: 0x18c050, emissiveIntensity: .6, metalness: .4 }), 0, 1, 10);
    part(G.cone, glow, .16, .6, .16, 1.85, 0, 0, body).rotation.z = -Math.PI / 2;
  } else if (shape === "mantis") {
    // segmented insect body along +x, big compound eyes, glowing membrane wings, raptor forelimbs
    part(G.sph, hull, .75, .5, .55, 1.2, .05, 0, body);
    part(G.sph, hull, .95, .55, .6, 0, 0, 0, body);
    part(G.sph, M(bodyCol, { metalness: .4 }), 1.5, .45, .5, -1.6, -.05, 0, body);
    for (const s of [-1, 1]) {
      part(G.sph, M(0x9dff4a, { emissive: 0x4aff2a, emissiveIntensity: 1.4 }), .32, .32, .32, 1.7, .22, s * .3, body);
      for (const [x, len, ang] of [[.3, 2.6, .35], [-.3, 2.2, .7]]) {
        const w = part(G.box, M(0xb8ffcc, { emissive: 0x3aff7a, emissiveIntensity: .5, transparent: !0, opacity: .45 }), 1.1, .04, len, x - .3, .35, s * len * .5, body);
        w.rotation.y = s * ang, w.rotation.x = s * .12;
      }
      const claw = part(G.cone, trim, .12, .9, .12, 2.1, -.35, s * .35, body);
      claw.rotation.z = -Math.PI / 2 - .3;
    }
  } else {   // mothership: wide layered saucer, counter-rotating rings, glowing underside
    part(G.sph, hull, 2.4, .55, 2.4, 0, 0, 0, body);
    part(G.sph, dark, 1.7, .5, 1.7, 0, -.35, 0, body);
    part(G.sph, M(0xc77dff, { emissive: 0x7a2aff, emissiveIntensity: .7, transparent: !0, opacity: .85, roughness: .1 }), 1.05, .7, 1.05, 0, .38, 0, body);
    ringOf(2.45, M(0x9a6aff, { emissive: 0x5a20c0, emissiveIntensity: .5, metalness: .5 }), .05, 1, 12);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4, fin = part(G.box, M(bodyCol, { metalness: .4 }), .9, .7, .12, Math.cos(a) * 1.6, .45, Math.sin(a) * 1.6, body); fin.rotation.y = -a; }
    ringOf(1.85, M(0x2a1a44, { metalness: .6 }), -.3, -1, 6, M(0xffffff, { emissive: 0x6ff7ff, emissiveIntensity: 2.2 }));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(G.sph, glow, .22, .12, .22, Math.cos(a) * 1.3, -.62, Math.sin(a) * 1.3, body); }
    part(G.cone, glow, .2, .8, .2, 2.6, 0, 0, body).rotation.z = -Math.PI / 2;
  }
  return root.userData = { body, props: [] }, root.scale.setScalar(shape === "mothership" ? 1.45 : shape === "orb" ? 1.6 : 1.7), addExhaust(root, shape), root;
}
// ---------- alien abilities ----------
let tractorT = 0, gravWell = null;
function alienBlink(pw) {
  const f = fwdOf(player), D = 45 * SPEED_K * pw, ox = player.x, oy = player.y, oz = player.z;
  let d = 0;
  for (let s = 4; s <= D; s += 4) {
    const x = ox + f[0] * s, y = clamp(oy + f[1] * s, ALT_MIN, ALT_MAX), z = oz + f[2] * s;
    if (obstInside(x, y, z, 3) || boss && boss.carrier && dnMetal({ x, y, z }) || Math.abs(x) > MAP || Math.abs(z) > MAP) break;
    d = s;
  }
  for (let s = 0; s < d; s += 3) addPart(ox + f[0] * s, oy + f[1] * s, oz + f[2] * s, rand(-1, 1), rand(-1, 1), rand(-1, 1), .35, .5, Math.random() < .5 ? 0x6bff7a : 0x9dffe0, .7);
  shockwave(ox, oy, oz, 10, 0x6bff7a, .35);
  player.x = ox + f[0] * d, player.y = clamp(oy + f[1] * d, ALT_MIN, ALT_MAX), player.z = oz + f[2] * d;
  typeof dnState !== "undefined" && dnState && (dnState.prev = { x: player.x, y: player.y, z: player.z });
  shockwave(player.x, player.y, player.z, 12, 0x9dffe0, .35), player.invul = Math.max(player.invul, .45), loseMissileLocks();
  Sound.tone(1800, .12, "sine", .08, 300), Sound.tone(260, .2, "sine", .1, 1200, .05), fovKick = 1.2;
  toast(d < D * .5 ? "BLINK \xB7 BLOCKED" : "BLINK");
}
function alienWellStart(pw) {
  const f = fwdOf(player), D = 60 * SPEED_K;
  const x = player.x + f[0] * D, y = clamp(player.y + f[1] * D, ALT_MIN + 4, ALT_MAX - 4), z = player.z + f[2] * D;
  gravWell && gravWell.mesh && scene.remove(gravWell.mesh);
  const g = new THREE.Group;
  part(G.sph, new THREE.MeshBasicMaterial({ color: 0x05010a }), 5, 5, 5, 0, 0, 0, g);
  const r1 = part(G.torus, new THREE.MeshBasicMaterial({ color: 0xb070ff, transparent: !0, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: !1 }), 9, 9, 2, 0, 0, 0, g);
  const r2 = part(G.torus, new THREE.MeshBasicMaterial({ color: 0x6ff7ff, transparent: !0, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: !1 }), 14, 14, 2, 0, 0, 0, g);
  r1.rotation.x = 1.2, r2.rotation.x = -1.3, g.position.set(x, y, z), scene.add(g);
  gravWell = { x, y, z, t: 4 * pw, R: 110 * SPEED_K, mesh: g, r1, r2, dmgT: 0 };
  Sound.tone(60, 1.2, "sine", .3, 25), Sound.tone(900, .6, "sawtooth", .04, 120), toast("GRAVITY WELL");
}
function alienWellEnd() {
  const w = gravWell;
  if (!w) return;
  gravWell = null, scene.remove(w.mesh);
  shockwave(w.x, w.y, w.z, w.R * .45, 0xb070ff, .6), ring(w.x, w.y, w.z, w.R * .45, 0xb070ff, 30, 60), shake = Math.max(shake, .3), Sound.sfxBoom();
  let n = 0;
  for (const b of [...bots]) !b.dead && dist3(b, w) < w.R * .4 && (hitBot(b, 6), n++);
  boss && !boss.dead && !boss.carrier && dist3(boss, w) < w.R * .4 && (hitBoss(6, w), n++);
  bots = bots.filter(b => !b.dead), n && toast("IMPLOSION \xB7 " + n + " HIT");
}
function updateAlien(dt) {
  if (tractorT > 0) {
    tractorT = Math.max(0, tractorT - dt);
    const f = fwdOf(player), R = 70 * SPEED_K, cone = (o, rr) => {
      const dx = o.x - player.x, dy = o.y - player.y, dz = o.z - player.z, d = Math.hypot(dx, dy, dz);
      return d > 1 && d < rr && (dx * f[0] + dy * f[1] + dz * f[2]) / d > .78;
    };
    const tx = player.x + f[0] * 18, ty = player.y + f[1] * 18, tz = player.z + f[2] * 18, k = Math.min(1, dt * 2.6);
    for (const b of bots) if (!b.dead && cone(b, R)) b.x += (tx - b.x) * k, b.y += (ty - b.y) * k, b.z += (tz - b.z) * k, b.stun = Math.max(b.stun || 0, .25), b.specialCharge = 0;
    const v = playerSpeed() + 58;
    for (const bl of bullets) if (bl.enemy && bl.life > 0 && cone(bl, R)) bl.enemy = !1, bl.refl = 1, bl.vx = f[0] * v, bl.vy = f[1] * v, bl.vz = f[2] * v, bl.life = 1.3;
    for (const m of missiles) if (m.enemy && !m.dead && cone(m, R)) {
      explode(m.x, m.y, m.z, .4), removeMissile(m);
      for (let i = -1; i <= 1; i++) bullets.length < MAXB && bullets.push({ x: m.x, y: m.y, z: m.z, vx: (f[0] + i * f[2] * .08) * v, vy: f[1] * v, vz: (f[2] - i * f[0] * .08) * v, life: 1.3, enemy: !1, refl: 1, profile: "plasma" });
    }
    missiles = missiles.filter(m => !m.dead);
    if (Math.random() < dt * 50) { const s = rand(4, R * .9), sp = s * .35; addPart(player.x + f[0] * s + rand(-sp, sp), player.y + f[1] * s + rand(-sp, sp) * .5, player.z + f[2] * s + rand(-sp, sp), -f[0] * 30, -f[1] * 30, -f[2] * 30, .3, .5, 0x9dff4a, .9); }
  }
  const w = gravWell;
  if (w) {
    w.t -= dt, w.dmgT -= dt, w.r1.rotation.z += dt * 4, w.r2.rotation.z -= dt * 2.5;
    const pulse = 1 + Math.sin(time * 9) * .08;
    w.mesh.scale.setScalar(pulse * Math.min(1, (4 - Math.max(0, w.t - 0)) * 3 + .3));
    const hit = w.dmgT <= 0;
    hit && (w.dmgT = .5);
    for (const b of bots) {
      if (b.dead) continue;
      const d = dist3(b, w);
      if (d > w.R) continue;
      const k = Math.min(1, dt * (1.6 - d / w.R));
      b.x += (w.x - b.x) * k, b.y += (w.y - b.y) * k, b.z += (w.z - b.z) * k, b.stun = Math.max(b.stun || 0, .2), b.specialCharge = 0;
      hit && hitBot(b, 1);
    }
    boss && !boss.dead && !boss.carrier && hit && dist3(boss, w) < w.R * .6 && hitBoss(1, w);
    for (const bl of bullets) bl.enemy && bl.life > 0 && dist3(bl, w) < w.R && (bl.life = 0);
    for (const m of missiles) m.enemy && !m.dead && dist3(m, w) < w.R && (explode(m.x, m.y, m.z, .4), removeMissile(m));
    missiles = missiles.filter(m => !m.dead), bots = bots.filter(b => !b.dead);
    Math.random() < dt * 40 && (() => { const a = rand(0, 6.3), r = rand(w.R * .3, w.R * .8); addPart(w.x + Math.cos(a) * r, w.y + rand(-8, 8), w.z + Math.sin(a) * r, -Math.cos(a) * r * 1.5, 0, -Math.sin(a) * r * 1.5, .5, .6, Math.random() < .5 ? 0xb070ff : 0x6ff7ff, 1); })();
    w.t <= 0 && alienWellEnd();
  }
}

// ================= v17: PRISM — a crystal starfighter that fires a continuous BEAM instead of bullets =================
function makePrism(bodyCol, wingCol) {
  const root = new THREE.Group, body = new THREE.Group;
  root.add(body), body.rotation.order = "ZXY";
  const crystal = M(0x8af2ff, { emissive: 0x2ab8ff, emissiveIntensity: .9, metalness: .2, roughness: .05, transparent: !0, opacity: .88, flatShading: !0 }),
    hull = M(0xdfe8f2, { metalness: .7, roughness: .25 }), trim = M(wingCol, { metalness: .4 }),
    core = M(0xffffff, { emissive: 0x8af2ff, emissiveIntensity: 2.6 });
  // double-pointed crystal fuselage
  const nose = part(G.cone, crystal, .55, 2.6, .55, 1.25, 0, 0, body);
  nose.rotation.z = -Math.PI / 2;
  const tail = part(G.cone, crystal, .55, 1.6, .55, -.8, 0, 0, body);
  tail.rotation.z = Math.PI / 2;
  part(G.sph, core, .28, .28, .28, .1, 0, 0, body);
  // swept blade wings with floating crystal shards at the tips
  for (const s of [-1, 1]) {
    const w = part(G.box, hull, 1.6, .08, 2.2, -.4, -.05, s * 1.25, body);
    w.rotation.y = s * .5;
    part(G.box, trim, 1.2, .1, .14, -.7, 0, s * 2.1, body).rotation.y = s * .5;
    const shard = part(G.cone, crystal, .2, .9, .2, -.2, .15, s * 2.35, body);
    shard.rotation.z = -Math.PI / 2;
    const fin = part(G.box, hull, .8, .6, .06, -1.1, .35, s * .45, body);
    fin.rotation.x = -s * .4;
  }
  // the emitter lens at the very tip
  part(G.sph, core, .16, .16, .16, 2.55, 0, 0, body);
  return root.userData = { body, props: [] }, root.scale.setScalar(1.7), addExhaust(root, "prism"), root;
}
const BEAM_GEO = new THREE.CylinderGeometry(1, 1, 1, 14, 1, !0);
let beamHitting = !1, beamFx = null, beamTick = 0, beamHumT = 0, overT = 0;
const isBeamPlane = () => garage.plane === "prism";
function ensureBeam() {
  if (beamFx) return beamFx;
  const g = new THREE.Group, add = THREE.AdditiveBlending;
  const outer = part(BEAM_GEO, new THREE.MeshBasicMaterial({ color: 0x3ad8ff, side: THREE.DoubleSide, transparent: !0, opacity: .35, blending: add, depthWrite: !1 }), .75, 1, .75, 0, 0, 0, g);
  const mid = part(BEAM_GEO, new THREE.MeshBasicMaterial({ color: 0x8af2ff, side: THREE.DoubleSide, transparent: !0, opacity: .6, blending: add, depthWrite: !1 }), .38, 1, .38, 0, 0, 0, g);
  const inner = part(BEAM_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: !0, opacity: .95, blending: add, depthWrite: !1 }), .16, 1, .16, 0, 0, 0, g);
  for (const m of [outer, mid, inner]) m.castShadow = !1, m.receiveShadow = !1;
  const tip = part(G.sph, new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: !0, opacity: .8, blending: add, depthWrite: !1 }), 1.3, 1.3, 1.3, 0, 0, 0, scene);
  tip.visible = !1, g.visible = !1, scene.add(g);
  return beamFx = { g, outer, mid, inner, tip };
}
const _bq = new THREE.Quaternion(), _bup = new THREE.Vector3(0, 1, 0), _bdir = new THREE.Vector3();
function hideBeam() { beamFx && (beamFx.g.visible = !1, beamFx.tip.visible = !1); }
function updateBeam(dt) {
  const fx = ensureBeam(), over = overT > 0, free = over || stormTime > 0;
  if (!(firing() && state === "playing" && player.alive)) return hideBeam();
  if (!free && player.ammo <= 0) {
    hideBeam();
    return emptySfxT <= 0 && (Sound.sfxEmpty(), emptySfxT = .35), void (emptyToastT <= 0 && (toast("Beam cells empty! Grab the yellow boxes"), emptyToastT = 4));
  }
  const f = fwdOf(player), ox = player.x + f[0] * 3.2, oy = player.y + f[1] * 3.2 - .15, oz = player.z + f[2] * 3.2, R = 85 * SPEED_K;
  let end = R;
  for (let s = 4; s < R; s += 4) {
    const x = ox + f[0] * s, y = oy + f[1] * s, z = oz + f[2] * s;
    if (obstInside(x, y, z, 0) || boss && boss.carrier && dnMetal({ x, y, z }) || y < floorY()) { end = s; break; }
  }
  // who is on the line
  const hits = [], along = o => { const dx = o.x - ox, dy = o.y - oy, dz = o.z - oz, t = dx * f[0] + dy * f[1] + dz * f[2]; return [t, Math.hypot(dx - f[0] * t, dy - f[1] * t, dz - f[2] * t)]; },
    wide = over ? 2.2 : 1;
  for (const b of bots) { if (b.dead) continue; const [t, d] = along(b); t > 0 && t < end && d < 2.6 * (b.scale || 1) * wide && hits.push({ o: b, t, k: "bot" }); }
  for (const tu of turrets) { if (tu.dead || tu.carrier && !dnCoreLockable(tu)) continue; const [t, d] = along(tu); t > 0 && t < end && d < (tu.hitR || 3) * wide && hits.push({ o: tu, t, k: "tur" }); }
  if (boss && !boss.dead && !(boss.cloakT > 0) && !boss.carrier) { const [t] = along(boss); if (t > 0 && t < end) { const p = { x: ox + f[0] * t, y: oy + f[1] * t, z: oz + f[2] * t }; bossDist(p) < (over ? 3 : 1) && hits.push({ o: boss, t, k: "boss" }); } }
  hits.sort((a, b) => a.t - b.t);
  const struck = over ? hits : hits.slice(0, 1);
  struck.length && !over && (end = struck[0].t);
  // enemy fire caught in the beam is burned away
  for (const bl of bullets) if (bl.enemy && bl.life > 0) { const [t, d] = along(bl); t > 0 && t < end && d < 1.6 * wide && (bl.life = 0); }
  for (const m of missiles) if (m.enemy && !m.dead) { const [t, d] = along(m); t > 0 && t < end && d < 2.2 * wide && (explode(m.x, m.y, m.z, .5, 0x8af2ff), removeMissile(m)); }
  missiles = missiles.filter(m => !m.dead);
  // damage ticks (10 per second); ammo drains like a gun
  beamTick -= dt;
  if (beamTick <= 0) {
    beamTick = .1;
    free || (player.ammo = Math.max(0, player.ammo - 1), updateHud(!0));
    const dmg = gunDmg() * .85 * planeNow().fire * (stormTime > 0 ? 2 : 1) * (over ? 1.6 : 1);
    beamHitting = !0;
    for (const h of struck) h.k === "boss" ? hitBoss(dmg, { x: h.o.x, y: h.o.y, z: h.o.z }) : h.k === "tur" ? hitTurret(h.o, dmg) : hitBot(h.o, dmg);
    beamHitting = !1, struck.length && flashReticle("hit"), bots = bots.filter(b => !b.dead);
  }
  // visuals: a stretched triple cylinder from the emitter to the impact
  const pulse = 1 + Math.sin(time * 60) * .12, th = (over ? 2.4 : 1) * pulse;
  fx.g.visible = !0, fx.g.position.set(ox + f[0] * end / 2, oy + f[1] * end / 2, oz + f[2] * end / 2);
  fx.g.quaternion.copy(_bq.setFromUnitVectors(_bup, _bdir.set(f[0], f[1], f[2]).normalize()));
  fx.outer.scale.set(.5 * th, end, .5 * th), fx.mid.scale.set(.24 * th, end, .24 * th), fx.inner.scale.set(.1 * th, end, .1 * th);
  fx.outer.material.color.set(over ? 0xffffff : 0x3ad8ff);
  const ex = ox + f[0] * end, ey = oy + f[1] * end, ez = oz + f[2] * end;
  fx.tip.visible = end < R - 1, fx.tip.position.set(ex, ey, ez), fx.tip.scale.setScalar((struck.length ? 1.8 : 1.2) * th);
  if (end < R - 1 && Math.random() < dt * 40) addPart(ex, ey, ez, rand(-8, 8), rand(-3, 9), rand(-8, 8), .3, .45, Math.random() < .5 ? 0x8af2ff : 0xffffff, .6);
  // hum
  beamHumT -= dt, beamHumT <= 0 && (beamHumT = .09, Sound.tone(over ? 150 : 210, .11, "sawtooth", .018, over ? 160 : 220), Sound.tone(over ? 900 : 1320, .1, "sine", .02));
}

// ================= v20: HERO airframes — iconic silhouettes with moving control surfaces =================
function heroPivot(parent, x, y, z) { const g = new THREE.Group; g.position.set(x, y, z), parent.add(g); return g; }
function heroProp(body, x, y, z, blades, r, mat, hub, anim, lite) {
  const pr = new THREE.Group;
  pr.position.set(x, y, z), body.add(pr), part(G.cone, hub, .26 * r, .5 * r, .26 * r, .2 * r, 0, 0, pr).rotation.z = -Math.PI / 2;
  for (let i = 0; i < blades; i++) { const b = part(G.box, mat, .06, 1.05 * r, .2 * r, 0, 0, 0, pr); b.geometry = G.box; b.position.set(0, Math.cos(i / blades * Math.PI * 2) * .5 * r, Math.sin(i / blades * Math.PI * 2) * .5 * r), b.rotation.x = i / blades * Math.PI * 2; }
  if (!lite) { const disc = part(G.cyl, heroDiscMat, 1.05 * r, .01, 1.05 * r, .02, 0, 0, pr); disc.rotation.z = Math.PI / 2, disc.castShadow = !1, anim.discs.push(disc); }
  return pr;
}
const heroDiscMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: !0, opacity: .12, depthWrite: !1 });
const heroDummy = new THREE.Object3D;
function makeHero(bodyCol, wingCol, shape, lite) {
  const root = new THREE.Group, body = new THREE.Group;
  root.add(body), body.rotation.order = "ZXY";
  const mb = M(bodyCol), mw = M(wingCol), mwhite = M(0xffffff), mdark = M(0x2a2f3a), mblack = M(0x14161c),
    mglass = M(0x9fd8ff, { roughness: .1, metalness: .3 }), mmetal = M(0x9aa3ad, { metalness: .7, roughness: .3 }),
    props = [], anim = { ail: [], elev: [], rud: [], discs: [], sweep: [], foils: [], burner: null },
    surf = (arr, x, y, z, sx, sy, sz, mat, piv = [0, 0, 0]) => { const p = heroPivot(body, x + piv[0], y + piv[1], z + piv[2]); part(G.box, mat, sx, sy, sz, -sx / 2, 0, 0, p); arr.push(p); return p; };
  const deco = lite ? () => heroDummy : part;
  let hullR = .5, noseX = 1.6;
  if (shape === "classic") {       // RED FOX: long-nosed pony fighter, belly scoop, bubble canopy, invasion stripes
    const f = part(G.capsule, mb, .48, .72, .48, 0, 0, 0, body); f.rotation.z = Math.PI / 2;
    const n = part(G.capsule, mb, .44, .3, .44, .95, .02, 0, body); n.rotation.z = Math.PI / 2;
    props.push(heroProp(body, 1.95, .02, 0, 4, 1, mdark, mw, anim, lite));
    part(G.sph, mglass, .55, .38, .34, .1, .46, 0, body);
    part(G.box, mdark, 1, .26, .36, -.35, -.48, 0, body);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) deco(G.box, mblack, .14, .08, .08, 1.15 + k * .2, .18, s * .42, body);
    for (const s of [-1, 1]) {
      const w = part(G.box, mw, 1.05, .1, 1.7, .2, -.3, s * 1.15, body); w.rotation.x = s * .07;
      const t = part(G.box, mw, .7, .08, 1.1, .05, -.24, s * 2.4, body); t.rotation.x = s * .07;
      surf(anim.ail, -.35, -.22, s * 2.3, .3, .06, 1, mw);
      part(G.box, mw, .5, .06, .7, -1.7, .08, s * .45, body);
      surf(anim.elev, -1.95, .08, s * .45, .25, .05, .7, mw);
      for (const [c, x] of [[mwhite, -.9], [mblack, -1.02], [mwhite, -1.14]]) { const r = deco(G.cyl, c, .44, .1, .44, x, 0, 0, body); r.rotation.z = Math.PI / 2; }
    }
    part(G.box, mb, .75, .75, .07, -1.6, .42, 0, body);
    surf(anim.rud, -1.95, .45, 0, .3, .7, .06, mw);
    hullR = .48, noseX = .95;
  } else if (shape === "swift") {  // KESTREL: slim interceptor with elliptical wings and roundels
    const f = part(G.capsule, mb, .4, .9, .4, 0, 0, 0, body); f.rotation.z = Math.PI / 2;
    props.push(heroProp(body, 2.05, 0, 0, 3, .95, mdark, mwhite, anim, lite));
    part(G.sph, mglass, .5, .32, .3, .15, .38, 0, body);
    for (const s of [-1, 1]) {
      part(G.sph, mw, .95, .08, 2.05, .05, -.2, s * 1.45, body);
      for (const [c, r] of [[M(0x1e4fa8), .32], [mwhite, .21], [M(0xd02b2b), .11]]) { const d = deco(G.cyl, c, r, .02, r, .1, -.14 + r * .01, s * 2, body); d.castShadow = !1; }
      deco(G.box, mdark, .5, .14, .22, -.1, -.33, s * .9, body);
      surf(anim.ail, -.55, -.2, s * 2.3, .25, .05, .8, mw);
      part(G.sph, mw, .42, .06, .7, -1.75, .1, s * .45, body);
      surf(anim.elev, -2.05, .1, s * .45, .2, .04, .6, mw);
    }
    part(G.sph, mb, .5, .62, .06, -1.7, .45, 0, body);
    surf(anim.rud, -2.05, .45, 0, .22, .6, .05, mw);
    hullR = .4, noseX = 1.05;
  } else if (shape === "brick") {  // BULLDOG: stout biplane, radial engine, N-struts and flying wires, fixed gear
    const f = part(G.capsule, mb, .7, .55, .7, 0, 0, 0, body); f.rotation.z = Math.PI / 2;
    const cowl = part(G.cyl, mdark, .78, .5, .78, 1.3, .02, 0, body); cowl.rotation.z = Math.PI / 2;
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, c = deco(G.cyl, mmetal, .12, .3, .12, 1.45, Math.cos(a) * .58, Math.sin(a) * .58, body); c.rotation.z = Math.PI / 2; }
    props.push(heroProp(body, 1.72, .02, 0, 2, 1.25, M(0x6b4a2e), mdark, anim, lite));
    part(G.sph, mglass, .42, .28, .36, -.15, .66, 0, body);
    for (const y of [1.05, -.4]) {
      part(G.box, mw, 1.05, .1, 5, .25, y, 0, body);
      for (const s of [-1, 1]) part(G.sph, mw, .525, .05, .3, .25, y, s * 2.5, body);
    }
    for (const s of [-1, 1]) {
      for (const x of [.6, -.1]) part(G.cyl, mdark, .06, 1.45, .06, x, .32, s * 1.9, body);
      const w1 = deco(G.cyl, mmetal, .02, 2.1, .02, .25, .32, s * 1.55, body); w1.rotation.x = s * .75;
      const w2 = deco(G.cyl, mmetal, .02, 2.1, .02, .25, .32, s * 1.55, body); w2.rotation.x = -s * .75;
      surf(anim.ail, -.28, 1.05, s * 2, .25, .06, 1.1, mw);
      const leg = deco(G.cyl, mdark, .06, .7, .06, .6, -.75, s * .55, body); leg.rotation.x = -s * .35;
      const wheel = deco(G.torus, mblack, .3, .3, .6, .6, -1.05, s * .75, body); wheel.rotation.y = 0;
      const gun = deco(G.cyl, mblack, .05, .8, .05, .9, .72, s * .18, body); gun.rotation.z = Math.PI / 2;
      part(G.box, mw, .5, .06, .7, -1.45, .15, s * .45, body);
      surf(anim.elev, -1.7, .15, s * .45, .22, .05, .6, mw);
    }
    part(G.box, mb, .6, .8, .07, -1.4, .55, 0, body);
    surf(anim.rud, -1.7, .55, 0, .25, .75, .06, mw);
    hullR = .7, noseX = .8;
  } else if (shape === "twin") {   // FORK-TAIL: twin-boom fighter, central gondola, props on both booms
    const pod = part(G.capsule, mb, .45, .45, .45, .45, .05, 0, body); pod.rotation.z = Math.PI / 2;
    part(G.sph, mglass, .5, .36, .32, .55, .4, 0, body);
    part(G.box, mw, 1.05, .1, 5.6, .2, -.05, 0, body);
    for (const s of [-1, 1]) {
      const boom = part(G.capsule, mb, .3, 1.15, .3, -.45, -.02, s * 1.3, body); boom.rotation.z = Math.PI / 2;
      const nac = part(G.capsule, mw, .36, .35, .36, .95, -.02, s * 1.3, body); nac.rotation.z = Math.PI / 2;
      props.push(heroProp(body, 1.72, -.02, s * 1.3, 3, .75, mdark, mw, anim, lite));
      part(G.box, mb, .55, .7, .06, -2.3, .3, s * 1.3, body);
      surf(anim.rud, -2.58, .3, s * 1.3, .2, .6, .05, mw);
      surf(anim.ail, -.35, -.02, s * 2.35, .25, .06, .9, mw);
      deco(G.box, mmetal, .4, .05, .12, 1.05, .1, s * .12, body);
    }
    part(G.box, mw, .5, .07, 2.7, -2.35, .08, 0, body);
    const el = heroPivot(body, -2.6, .08, 0); part(G.box, mw, .22, .05, 2.5, -.11, 0, 0, el); anim.elev.push(el);
    hullR = .45, noseX = 1;
  } else {                          // falcon — TALON: swept jet, side intakes, canted twin fins, afterburner can
    const f = part(G.capsule, mb, .45, 1.05, .45, 0, 0, 0, body); f.rotation.z = Math.PI / 2;
    const nose = part(G.cone, mwhite, .44, 1.4, .44, 2.55, 0, 0, body); nose.rotation.z = -Math.PI / 2;
    part(G.sph, mglass, .75, .36, .34, .75, .38, 0, body);
    for (const s of [-1, 1]) {
      part(G.box, mdark, .9, .4, .28, .45, -.08, s * .52, body);
      const w = part(G.box, mw, 1.5, .1, 2.2, -.45, -.08, s * 1.35, body); w.rotation.y = s * .6;
      surf(anim.ail, -1.25, -.08, s * 1.85, .3, .06, .9, mw);
      const fin = part(G.box, mb, .9, .95, .08, -1.55, .58, s * .42, body); fin.rotation.x = -s * .3;
      const tw = part(G.box, mw, .7, .07, 1, -1.65, .05, s * .72, body); tw.rotation.y = s * .45;
      surf(anim.elev, -2, .05, s * .72, .2, .05, .8, mw);
    }
    const noz = part(G.torus, mdark, .4, .4, .9, -2.05, 0, 0, body); noz.rotation.y = Math.PI / 2;
    const burner = part(G.cone, new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: !0, opacity: .0, blending: THREE.AdditiveBlending, depthWrite: !1 }), .32, 1.4, .32, -2.7, 0, 0, body);
    burner.rotation.z = Math.PI / 2, anim.burner = burner;
    hullR = .45, noseX = 1.4;
  }
  return root.userData = { body, props, anim, hullR, noseX }, root.scale.setScalar(1.85), addExhaust(root, shape), root;
}
// ---------- control-surface / moving-part animation (player and enemies) ----------
function animatePlaneParts(p, dt) {
  const a = p.mesh && p.mesh.userData.anim;
  if (!a) return;
  const me = p === player, x = me ? player.sx || 0 : clamp((p.roll || 0) / .85, -1, 1), y = me ? player.sy || 0 : clamp((p.p || 0) * 2, -1, 1),
    boost = me ? player.boosting || ramTime > 0 : p.ramTime > 0, aim = me && (aiming() || firing()), k = Math.min(1, dt * 12);
  for (const s of a.ail) s.rotation.z = lerp(s.rotation.z, (s.position.z > 0 ? 1 : -1) * x * .5, k);
  for (const s of a.elev) s.rotation.z = lerp(s.rotation.z, -y * .45, k);
  for (const s of a.rud) s.rotation.y = lerp(s.rotation.y, -x * .35, k);
  for (const d of a.discs) d.material.opacity = .1;
  const sw = boost ? .6 : 0;
  for (const s of a.sweep) s.rotation.y = lerp(s.rotation.y, -s.userData.side * sw, Math.min(1, dt * 4));
  for (const s of a.foils) s.rotation.x = lerp(s.rotation.x, s.userData.up * s.userData.side * (aim ? .38 : 0), Math.min(1, dt * 6));
  if (a.burner) { const t = boost ? .85 : .25; a.burner.material.opacity = lerp(a.burner.material.opacity, t * (1 + Math.sin(time * 50) * .15), k), a.burner.scale.y = lerp(a.burner.scale.y, boost ? 2.4 : 1, k); }
}
// ---------- wingtip vapour trails in hard turns / at high speed ----------
let vaporT = 0;
function updateVapor(dt) {
  if (state !== "playing" || !player.alive || adsK > .6) return;
  const pullHard = Math.abs(player.yawS || 0) > 1.35 || player.boosting && (player.ve || 1) > 1.3 || masteryLevel(garage.plane) >= 10;
  if (!pullHard || (vaporT -= dt) > 0) return;
  vaporT = .025;
  const span = 3.9, rx = -Math.sin(player.a), rz = Math.cos(player.a), cr = Math.cos(player.roll || 0), sr = Math.sin(player.roll || 0), f = fwdOf(player),
    col = masteryLevel(garage.plane) >= 10 ? (planeNow().id === "halo" ? 0xd0b1ff : 0xffd24a) : 0xffffff;
  for (const s of [-1, 1]) addPart(player.x + rx * span * cr * s - f[0] * 1.5, player.y - sr * span * s, player.z + rz * span * cr * s - f[2] * 1.5, 0, 0, 0, .9, .16, col, .5);
}

// ================= v20: STINGER (pod fighter) and THUNDERHEAD (twin-hull bomber) =================
function makeViper(bodyCol, wingCol) {
  const root = new THREE.Group, body = new THREE.Group;
  root.add(body), body.rotation.order = "ZXY";
  const hull = M(0x3a3f4a, { metalness: .6, roughness: .35 }), trim = M(wingCol, { metalness: .4 }), dark = M(0x15171c),
    glow = M(0xffffff, { emissive: 0xff5a3a, emissiveIntensity: 2.4 }), win = M(0x9fe8ff, { emissive: 0x2a8ab8, emissiveIntensity: .8, metalness: .3, roughness: .1 });
  part(G.sph, hull, .8, .8, .8, 0, 0, 0, body);
  const ring = part(G.torus, trim, .62, .62, 1.2, .52, 0, 0, body); ring.rotation.y = Math.PI / 2;
  part(G.sph, win, .42, .42, .42, .5, .02, 0, body);
  // crescent wing: a half-torus arching over the pod from side to side, with blade tips
  const arc = new THREE.Mesh(new THREE.TorusGeometry(1.9, .2, 8, 28, Math.PI), hull);
  arc.rotation.y = Math.PI / 2, arc.position.set(-.1, -.1, 0), arc.scale.set(1, 1, 1.4), arc.castShadow = !0, body.add(arc);
  for (const s of [-1, 1]) {
    const blade = part(G.box, trim, 1.4, .08, .5, -.1, -.15, s * 1.95, body); blade.rotation.x = s * .25;
    const gun = part(G.cyl, dark, .07, .9, .07, .6, -.55, s * .25, body); gun.rotation.z = Math.PI / 2;
    part(G.sph, glow, .09, .09, .09, 1.05, -.55, s * .25, body);
  }
  const eng = part(G.cyl, glow, .3, .12, .3, -.8, 0, 0, body); eng.rotation.z = Math.PI / 2;
  return root.userData = { body, props: [], hullR: .8, noseX: .2 }, root.scale.setScalar(1.6), addExhaust(root, "viper"), root;
}
function makeAnvil(bodyCol, wingCol) {
  const root = new THREE.Group, body = new THREE.Group;
  root.add(body), body.rotation.order = "ZXY";
  const mb = M(bodyCol), mw = M(wingCol), hull = M(0x6b7280, { metalness: .5, roughness: .4 }), dark = M(0x1e222a),
    glass = M(0x9fd8ff, { roughness: .1, metalness: .3 }), glow = M(0xffffff, { emissive: 0xffa040, emissiveIntensity: 2 });
  for (const s of [-1, 1]) {
    const f = part(G.capsule, hull, .42, .95, .42, 0, 0, s * .85, body); f.rotation.z = Math.PI / 2;
    part(G.sph, glass, .35, .26, .3, 1.35, .1, s * .85, body);
    const e = part(G.cyl, glow, .3, .1, .3, -2.05, 0, s * .85, body); e.rotation.z = Math.PI / 2;
    part(G.box, mb, .7, .8, .07, -1.7, .5, s * .85, body);
    const w = part(G.box, mw, 1.2, .12, 2.2, -.1, -.05, s * 2.4, body); w.rotation.y = s * .2;
    for (const z of [1.9, 2.8]) { const n = part(G.capsule, dark, .2, .3, .2, .15, -.2, s * z, body); n.rotation.z = Math.PI / 2; }
  }
  part(G.box, hull, 1.6, .3, 1.7, -.1, -.02, 0, body);
  part(G.box, dark, 1.2, .2, .9, -.15, -.25, 0, body);   // bomb bay
  part(G.box, mw, .5, .06, 2.4, -1.75, .1, 0, body);
  return root.userData = { body, props: [], hullR: .42, noseX: 1 }, root.scale.setScalar(1.8), addExhaust(root, "anvil"), root;
}
// ---------- CARPET BOMB: bombs fall straight down from the bay ----------
let bombs = [], bombT = 0, bombDrop = 0, flipT = 0, flipDir = 1;
const bombMatA = M(0x2a2e36, { metalness: .5 }), bombMatB = M(0xffb040, { emissive: 0xff7a00, emissiveIntensity: .8 });
function dropBomb() {
  const g = new THREE.Group;
  const c = part(G.capsule, bombMatA, .32, .45, .32, 0, 0, 0, g);
  part(G.sph, bombMatB, .18, .18, .18, 0, -.75, 0, g);
  for (const r of [0, Math.PI / 2]) { const f = part(G.box, bombMatA, .6, .5, .05, 0, .9, 0, g); f.rotation.y = r; }
  g.position.set(player.x, player.y - 1.8, player.z), scene.add(g);
  bombs.push({ x: player.x + rand(-.6, .6), y: player.y - 1.8, z: player.z + rand(-.6, .6), vy: -6, life: 7, mesh: g });
  Sound.tone(420, .18, "triangle", .04, 160);
}
function bombBlast(b) {
  const R = 16;
  explode(b.x, b.y, b.z, 1.3), shockwave(b.x, b.y, b.z, R, 0xffa040, .45), Sound.sfxBoom(), shake = Math.max(shake, .12);
  for (const t of [...turrets]) !t.dead && dist3(t, b) < R + (t.hitR || 3) && hitTurret(t, 7);
  for (const o of [...bots]) !o.dead && dist3(o, b) < R && hitBot(o, 6);
  boss && !boss.dead && !boss.carrier && dist3(boss, b) < R + 6 && hitBoss(5, b);
  bots = bots.filter(o => !o.dead);
}
function updateBombs(dt) {
  if (bombT > 0 && state === "playing") { bombT -= dt, bombDrop -= dt; bombDrop <= 0 && (bombDrop = .14, dropBomb()); }
  for (const b of bombs) {
    b.vy -= 40 * dt, b.y += b.vy * dt, b.life -= dt, b.mesh.position.set(b.x, b.y, b.z);
    let hit = b.y <= floorY() + .5 || b.life <= 0 || obstInside(b.x, b.y, b.z, 0) || boss && boss.carrier && dnMetal(b);
    if (!hit) for (const t of turrets) if (!t.dead && dist3(t, b) < (t.hitR || 3) + 1) { hit = !0; break; }
    if (!hit) for (const o of bots) if (!o.dead && dist3(o, b) < 3.5) { hit = !0; break; }
    hit && (b.dead = !0, scene.remove(b.mesh), bombBlast(b));
  }
  bombs = bombs.filter(b => !b.dead);
  // SPLIT-S reversal (STINGER): a half-loop that swaps your heading in a blink
  if (flipT > 0) {
    const d = Math.min(flipT, dt);
    flipT -= dt, player.a = wrapA(player.a + Math.PI * d / .6), player.rollFx = flipDir * (1 - flipT / .6) * Math.PI * 2, player.invul = Math.max(player.invul, .15);
    flipT <= 0 && (player.rollFx = 0, snapCamera());
  }
}
function clearBombs() { for (const b of bombs) scene.remove(b.mesh); bombs = [], bombT = 0, flipT = 0; }

// ================= v20: AIRFRAME MASTERY — every plane grows with its pilot =================
const CALLSIGNS = { classic: "RED FOX", swift: "KESTREL", brick: "BULLDOG", twin: "FORK-TAIL", falcon: "TALON", lancer: "NEEDLE", seraph: "CHERUB", spectre: "NIGHTJAR", halo: "CROWN", orb: "WISP", mantis: "PREYER", mothership: "MATRIARCH", prism: "LUMEN", viper: "STINGER", anvil: "THUNDERHEAD" };
const MASTERY_UNLOCKS = [[2, "Callsign plate"], [3, "Kill marks on the fuselage"], [5, "Nose art"], [7, "Ace trim"], [10, "Legend vapour trails"]];
const masteryNeed = lv => 150 * lv * (lv + 1) / 2;   // xp needed to reach lv+1
function masteryOf(id) { garage.mastery || (garage.mastery = {}); return garage.mastery[id] || (garage.mastery[id] = { xp: 0, kills: 0 }); }
function masteryLevel(id) { const xp = masteryOf(id).xp; let lv = 1; for (; lv < 10 && xp >= masteryNeed(lv);) lv++; return lv; }
const masteryBonus = () => 1 + .005 * (masteryLevel(garage.plane) - 1);
let runXp = 0, runPlaneKills = 0;
function gainXp(n) { state === "playing" || state === "dying" ? runXp += n : 0; }
function bankMastery() {
  if (!runXp && !runPlaneKills) return null;
  const id = garage.plane, m = masteryOf(id), before = masteryLevel(id);
  m.xp += Math.round(runXp), m.kills += runPlaneKills;
  const gained = Math.round(runXp), after = masteryLevel(id);
  runXp = 0, runPlaneKills = 0, saveGarage();
  const unlocked = MASTERY_UNLOCKS.filter(([l]) => l > before && l <= after).map(u => u[1]);
  return { id, gained, before, after, unlocked };
}
function masteryLine(r) {
  if (!r) return "";
  const nm = `“${CALLSIGNS[r.id] || r.id.toUpperCase()}”`, lvl = r.after > r.before ? ` \xB7 LEVEL UP ${r.before} → ${r.after}` : ` \xB7 LV ${r.after}`;
  return `${nm} +${r.gained} XP${lvl}${r.unlocked.length ? " \xB7 UNLOCKED: " + r.unlocked.join(", ") : ""}`;
}
// ---------- cosmetic unlocks painted onto the model ----------
const masteryTex = {};
function noseArtTex(id) {
  if (masteryTex[id]) return masteryTex[id];
  const c = document.createElement("canvas");
  c.width = 256, c.height = 128;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 256, 128);
  if (id === "classic" || id === "falcon" || id === "brick") {   // shark mouth
    g.fillStyle = "#b0101a", g.beginPath(), g.moveTo(8, 64), g.quadraticCurveTo(120, 8, 250, 40), g.lineTo(250, 88), g.quadraticCurveTo(120, 120, 8, 64), g.fill();
    g.fillStyle = "#fff";
    for (let i = 0; i < 9; i++) { const x = 40 + i * 23; g.beginPath(), g.moveTo(x, 40 - i * .8), g.lineTo(x + 11, 58), g.lineTo(x + 22, 38 - i * .8), g.fill(), g.beginPath(), g.moveTo(x, 90 + i * .8), g.lineTo(x + 11, 70), g.lineTo(x + 22, 90 + i * .8), g.fill(); }
    g.fillStyle = "#111", g.beginPath(), g.arc(200, 30, 9, 0, 7), g.fill();
  } else {                                                         // emblem: star in a ring with a lightning bolt
    g.strokeStyle = "#ffd24a", g.lineWidth = 8, g.beginPath(), g.arc(128, 64, 52, 0, 7), g.stroke();
    g.fillStyle = "#ffd24a", g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 18 : 42, a = i / 10 * Math.PI * 2 - Math.PI / 2; g.lineTo(128 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.fill(), g.fillStyle = "#1a1a1a", g.beginPath(), g.moveTo(134, 30), g.lineTo(112, 70), g.lineTo(128, 70), g.lineTo(118, 100), g.lineTo(146, 56), g.lineTo(130, 56), g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t.colorSpace = THREE.SRGBColorSpace, masteryTex[id] = t;
}
const starGeo = (() => { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? .4 : 1, a = i / 10 * Math.PI * 2 + Math.PI / 2; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return new THREE.ShapeGeometry(sh); })();
function decorateMastery(root, id) {
  const b = root.userData.body;
  if (!b) return;
  const lv = masteryLevel(id), m = masteryOf(id), R = (root.userData.hullR || .5) + .015, nx = root.userData.noseX || 1.2;
  if (lv >= 3) {
    const n = Math.min(12, Math.floor(m.kills / 10)), mat = new THREE.MeshBasicMaterial({ color: 0xffd24a, side: THREE.DoubleSide });
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) { const st = new THREE.Mesh(starGeo, mat); st.scale.setScalar(.07), st.position.set(.45 - (i % 6) * .17, .12 - Math.floor(i / 6) * .17, s * R), s < 0 && (st.rotation.y = Math.PI), b.add(st); }
  }
  if (lv >= 5) {
    const mat = new THREE.MeshBasicMaterial({ map: noseArtTex(id), transparent: !0, side: THREE.DoubleSide, depthWrite: !1 });
    for (const s of [-1, 1]) { const q = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .55), mat); q.position.set(nx - .05, -.05, s * (R + .01)), s < 0 && (q.rotation.y = Math.PI), b.add(q); }
  }
  if (lv >= 7) {
    const gold = M(0xffd24a, { metalness: .7, roughness: .25, emissive: 0x6a4a00, emissiveIntensity: .4 });
    for (const s of [-1, 1]) part(G.box, gold, .16, .04, 1.8, .15, .02, s * 1.6, b);
    part(G.box, gold, .6, .05, .09, -1.2, .02, 0, b);
  }
}

// ================= v20: sortie launch cinematic, hangar showcase swoop, per-airframe engine voices =================
let launchT = 0, previewSwoopT = 0, rearView = !1, rearSwingT = 0;
const LAUNCH_DUR = 2.6;
function startLaunchCine() {
  launchT = LAUNCH_DUR;
  const id = garage.plane, lv = masteryLevel(id);
  banner(`“${CALLSIGNS[id] || planeNow().name}”`, `${planeNow().name} \xB7 PILOT LV ${lv}`, "#ffd24a");
  Sound.tone(70, 1.6, "sawtooth", .05, 240), Sound.tone(140, 1.4, "triangle", .03, 520, .3), Sound.noise(1.2, .05, 900);
}
// returns true when the cinematic camera took over this frame
function launchCamera(dt) {
  if (launchT <= 0) return !1;
  state === "playing" && (launchT = Math.min(launchT, .6));
  launchT = Math.max(0, launchT - dt);
  const k = 1 - launchT / LAUNCH_DUR, e = k * k * (3 - 2 * k), ang = player.a + lerp(1.75, Math.PI, e), dist = lerp(9.5, 15 * camK, e), h = lerp(1.4, 5.8 * camK, e);
  camPos.set(player.x + Math.cos(ang) * dist, player.y + h, player.z + Math.sin(ang) * dist);
  const f = fwdOf(player);
  camLook.set(player.x + f[0] * lerp(0, 40, e), player.y + lerp(.3, 1.2, e), player.z + f[2] * lerp(0, 40, e));
  camA = wrapA(ang + Math.PI), camP = 0;
  return !0;
}
const ENGINE_VOICE = {
  classic: ["sawtooth", "triangle", 1, 2.01, 0, 0], swift: ["sawtooth", "triangle", 1.25, 2.5, 0, 0], brick: ["sawtooth", "square", .7, 1.4, 11, 18],
  twin: ["sawtooth", "sawtooth", 1, 1.035, 0, 0], falcon: ["sine", "sawtooth", 3.2, 4.8, 0, 0], lancer: ["sine", "triangle", 3.8, 5.7, 0, 0],
  seraph: ["triangle", "sine", 2.6, 3.9, 0, 0], spectre: ["sine", "sine", 1.6, 2.4, 0, 0], halo: ["sine", "triangle", 2.2, 3.3, 3, 25],
  prism: ["sine", "sine", 3, 4.5, 7, 10], viper: ["sawtooth", "square", 4.2, 6.3, 22, 40], anvil: ["sawtooth", "triangle", .55, 1.1, 6, 10]
};

function makePlane(bodyCol, wingCol, shape = "classic", lite) { const m = makePlaneBase(bodyCol, wingCol, shape, lite); m.userData.look = [bodyCol, wingCol, shape]; return m; }
function makePlaneBase(bodyCol, wingCol, shape = "classic", lite) {
  if (["classic", "swift", "brick", "twin", "falcon"].includes(shape)) return makeHero(bodyCol, wingCol, shape, lite);
  if (shape === "viper") return makeViper(bodyCol, wingCol);
  if (shape === "anvil") return makeAnvil(bodyCol, wingCol);
  if (shape === "prism") return makePrism(bodyCol, wingCol);
  if (["orb", "mantis", "mothership"].includes(shape)) return makeAlien(bodyCol, wingCol, shape);
  if (["lancer", "seraph", "spectre", "halo"].includes(shape)) return makeSpacecraft(bodyCol, wingCol, shape);
  const root = new THREE.Group,
    body = new THREE.Group;
  root.add(body), body.rotation.order = "ZXY";
  const mb = M(bodyCol),
    mw = M(wingCol),
    mwhite = M(16777215),
    mglass = M(10479615, {
      roughness: .15
    }),
    mdark = M(3810128),
    props = [],
    addProp = (x, y, z, s2 = 1) => {
      const pr = new THREE.Group;
      pr.position.set(x, y, z), body.add(pr), part(G.sph, mdark, .17 * s2, .17 * s2, .17 * s2, 0, 0, 0, pr), part(G.box, mdark, .08, 2 * s2, .24 * s2, 0, 0, 0, pr), part(G.box, mdark, .08, .24 * s2, 2 * s2, 0, 0, 0, pr), props.push(pr)
    };
  if (shape === "falcon") {
    const fus = part(G.capsule, mb, .55, .95, .55, 0, 0, 0, body);
    fus.rotation.z = Math.PI / 2;
    const nose = part(G.cone, mwhite, .5, 1.3, .5, 2.35, 0, 0, body);
    nose.rotation.z = -Math.PI / 2;
    for (const sd of [-1, 1]) {
      const w = part(G.box, mw, 1.3, .14, 2.3, -.35, -.05, sd * 1.35, body);
      w.rotation.y = sd * .55;
      const fin = part(G.box, mb, .8, .9, .09, -1.5, .55, sd * .38, body);
      fin.rotation.z = .35;
      const tw = part(G.box, mw, .6, .08, .9, -1.55, .05, sd * .7, body);
      tw.rotation.y = sd * .4
    }
    part(G.sph, mglass, .75, .42, .42, .6, .42, 0, body);
    const eng = part(G.cyl, M(16757051, {
      emissive: 16738816
    }), .36, .3, .36, -2.05, 0, 0, body);
    eng.rotation.z = Math.PI / 2
  } else {
    const fat = shape === "brick" ? .8 : shape === "swift" ? .5 : .62,
      len = shape === "swift" ? .98 : .8,
      fus = part(G.capsule, mb, fat, len, fat, 0, 0, 0, body);
    fus.rotation.z = Math.PI / 2;
    const noseX = 1.55 + (len - .8) * 2 + (fat - .62) * .8;
    if (part(G.sph, mwhite, fat * .8, fat * .8, fat * .8, noseX, 0, 0, body), addProp(noseX + .5, 0, 0), shape === "swift")
      for (const sd of [-1, 1]) {
        const w = part(G.sph, mw, .6, .12, 1.35, -.1, -.1, sd * 1.05, body);
        w.rotation.y = sd * .42
      } else part(G.sph, mw, .78, .14, 2.5, .25, -.12, 0, body);
    if (shape === "brick") {
      part(G.sph, mw, .78, .14, 2.4, .25, 1.25, 0, body);
      for (const sd of [-1, 1]) part(G.cyl, mdark, .07, 1.35, .07, .25, .56, sd * 1.5, body)
    }
    if (shape === "twin")
      for (const sd of [-1, 1]) {
        const e = part(G.capsule, mb, .3, .38, .3, .55, -.1, sd * 1.3, body);
        e.rotation.z = Math.PI / 2, addProp(1.55, -.1, sd * 1.3, .6)
      }
    part(G.sph, mw, .42, .1, 1.05, -1.4 - (len - .8), .12, 0, body), part(G.sph, mb, .48, .66, .1, -1.4 - (len - .8), .55, 0, body), part(G.sph, mglass, .58, .44, .44, .35, fat * .78, 0, body);
    const st = part(G.cyl, mwhite, fat * 1.08, .24, fat * 1.08, -.6, 0, 0, body);
    st.rotation.z = Math.PI / 2
  }
  return root.userData = {
    body,
    props
  }, root.scale.setScalar(1.85), addExhaust(root, shape), root
}

function orientPlane(p, dt) {
  p.mesh.position.set(p.x, p.y, p.z), p.mesh.rotation.y = -p.a, p.mesh.userData.body.rotation.set(p.roll + (p.rollFx || 0), 0, p.p || 0);
  for (const pr of p.mesh.userData.props) pr.rotation.x += dt * 45;
  const sp = p.mesh.__spin || (p.mesh.__spin = spinPartsOf(p.mesh));
  for (const g of sp) g.rotation.z += dt * 3.2 * g.userData.dir * (p === player && (player.boosting || ramTime > 0) ? 3 : 1);
  animatePlaneParts(p, dt)
}

function spinPartsOf(root) {
  const a = [];
  return root.traverse(o => {
    o.name === "halo-spin" && a.push(o)
  }), a
}

function makeTurret() {
  const g = new THREE.Group;
  part(G.cyl, M(8094868), 1.7, 1.4, 1.7, 0, .7, 0, g);
  const head = new THREE.Group;
  head.position.y = 1.6, g.add(head), part(G.sph, M(5595258), 1.25, 1, 1.25, 0, 0, 0, head), part(G.sph, M(16726843, {
    emissive: 11141120
  }), .28, .28, .28, -.9, .5, 0, head);
  const barrels = new THREE.Group;
  head.add(barrels);
  for (const sd of [-1, 1]) part(G.cyl, M(2829634), .2, 2.8, .2, 0, 1.3, sd * .42, barrels);
  return g.userData = {
    head,
    barrels
  }, g.scale.setScalar(1.3), g
}

const ALIEN_IDS = ["orb", "mantis", "mothership"],
  ALIEN_COL = { orb: 0x7dff6a, mantis: 0xc6ff3b, mothership: 0xc77dff },
  isAlienPlane = () => ALIEN_IDS.includes(garage.plane),
  alienCol = () => ALIEN_COL[garage.plane] || 0x7dff6a;
// alien missiles: a pulsing plasma orb wrapped in spinning energy rings
function makeAlienMissile(col) {
  const g = new THREE.Group, add = THREE.AdditiveBlending;
  part(G.sph, new THREE.MeshBasicMaterial({ color: 0xffffff }), .28, .28, .28, 0, 0, 0, g);
  const halo = part(G.sph, new THREE.MeshBasicMaterial({ color: col, transparent: !0, opacity: .55, blending: add, depthWrite: !1 }), .62, .62, .62, 0, 0, 0, g);
  const ring = new THREE.Group;
  g.add(ring);
  for (const r of [0, Math.PI / 2]) { const t = part(G.torus, new THREE.MeshBasicMaterial({ color: col, transparent: !0, opacity: .9, blending: add, depthWrite: !1 }), .75, .75, .5, 0, 0, 0, ring); t.rotation.y = r; }
  const tail = part(G.cone, new THREE.MeshBasicMaterial({ color: col, transparent: !0, opacity: .35, blending: add, depthWrite: !1 }), .35, 1.6, .35, -1, 0, 0, g);
  tail.rotation.z = Math.PI / 2;
  return g.userData.alien = { halo, ring }, g.scale.setScalar(1.6), g;
}
function makeMissile(enemy) {
  const g = new THREE.Group,
    b = part(G.capsule, M(enemy ? 3817301 : 16777215), .22, .55, .22, 0, 0, 0, g);
  b.rotation.z = Math.PI / 2;
  const tip = part(G.sph, M(enemy ? 16726843 : 16731501), .23, .23, .23, .78, 0, 0, g);
  for (const r of [0, Math.PI / 2]) {
    const f = part(G.box, M(enemy ? 16726843 : 16765503), .35, .04, .75, -.6, 0, 0, g);
    f.rotation.x = r
  }
  return g.scale.setScalar(1.6), g
}

function canvasTex(size, draw, rep) {
  const c = document.createElement("canvas");
  c.width = c.height = size, draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  return t.wrapS = t.wrapT = THREE.RepeatWrapping, t.repeat.set(rep, rep), t.colorSpace = THREE.SRGBColorSpace, t.anisotropy = 4, t
}
const seaTex = canvasTex(256, (g, s2) => {
    g.fillStyle = "#3db6ec", g.fillRect(0, 0, s2, s2), g.strokeStyle = "#7fd6f7", g.lineWidth = 6, g.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const x = Math.random() * s2,
        y = Math.random() * s2;
      g.beginPath(), g.moveTo(x, y), g.quadraticCurveTo(x + 14, y - 10, x + 28, y), g.quadraticCurveTo(x + 42, y + 10, x + 56, y), g.stroke()
    }
  }, 90 * MAP_K),
  sea = new THREE.Mesh(new THREE.PlaneGeometry(1600 * MAP_K, 1600 * MAP_K), new THREE.MeshStandardMaterial({
    map: seaTex,
    roughness: .35
  }));
sea.rotation.x = -Math.PI / 2, sea.receiveShadow = !0, scene.add(sea);

function instanced(geo, mat, list, cast = !0) {
  const im = new THREE.InstancedMesh(geo, mat, list.length),
    m4 = new THREE.Matrix4,
    q = new THREE.Quaternion,
    e = new THREE.Euler,
    v = new THREE.Vector3,
    sc = new THREE.Vector3,
    col = new THREE.Color;
  return list.forEach((d, i) => {
    e.set(0, d.ry || 0, 0), q.setFromEuler(e), m4.compose(v.set(d.x, d.y, d.z), q, sc.set(d.sx, d.sy, d.sz)), im.setMatrixAt(i, m4), im.setColorAt(i, col.set(d.c === void 0 ? 16777215 : d.c))
  }), im.castShadow = cast, im.receiveShadow = !0, scene.add(im), im
}
const ISLANDS = [],
  WORLD = {};
withSeed(20240925, function() {   // seeded so every device builds the same world (netplay)
  const islands = ISLANDS;
  for (let tries = 0; islands.length < Math.round(70 * MAP_K * MAP_K * .85) && tries < 3e4; tries++) {
    const x = rand(-MAP - 80, MAP + 80),
      z = rand(-MAP - 80, MAP + 80),
      r = rand(6, 16);
    islands.every(o => Math.hypot(o.x - x, o.z - z) > o.r + r + 14) && islands.push({
      x,
      z,
      r
    })
  }
  const sand = [],
    hills = [],
    trunks = [],
    leaves = [],
    greens = [7328618, 5816399, 9101931, 5224546];
  for (const o of islands) {
    sand.push({
      x: o.x,
      y: .4,
      z: o.z,
      sx: o.r,
      sy: .9,
      sz: o.r * rand(.8, 1),
      ry: rand(0, 6),
      c: 16769441
    });
    const n = 1 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const hr = o.r * rand(.45, .7),
        a = rand(0, 6.3),
        d = rand(0, o.r * .3),
        hy = hr * rand(.45, .8);
      hills.push({
        x: o.x + Math.cos(a) * d,
        y: .6,
        z: o.z + Math.sin(a) * d,
        sx: hr,
        sy: hy,
        sz: hr,
        c: greens[i % 4]
      }), i === 0 && (o.tx = o.x + Math.cos(a) * d, o.tz = o.z + Math.sin(a) * d, o.ty = .6 + hy)
    }
    const t = 2 + (Math.random() * 4 | 0);
    for (let i = 0; i < t; i++) {
      const a = rand(0, 6.3),
        d = o.r * rand(.6, .85),
        x = o.x + Math.cos(a) * d,
        z = o.z + Math.sin(a) * d,
        h = rand(2.2, 3.2);
      trunks.push({
        x,
        y: 1 + h / 2,
        z,
        sx: .35,
        sy: h,
        sz: .35,
        c: 11036218
      }), leaves.push({
        x,
        y: 1 + h + .8,
        z,
        sx: rand(1.3, 1.9),
        sy: rand(1.2, 1.6),
        sz: rand(1.3, 1.9),
        c: greens[Math.random() * 4 | 0]
      })
    }
  }
  const white = M(16777215);
  WORLD.sand = {
    im: instanced(G.cyl, white, sand, !1),
    list: sand
  }, WORLD.hills = {
    im: instanced(G.sphMid, white, hills),
    list: hills
  }, WORLD.trunks = {
    im: instanced(G.cyl, white, trunks),
    list: trunks
  }, WORLD.leaves = {
    im: instanced(G.sphLo, white, leaves),
    list: leaves
  };
  const puffs = [];
  for (let i = 0; i < Math.round(110 * MAP_K * MAP_K * .85); i++) {
    const cx = rand(-MAP - 80, MAP + 80),
      cz = rand(-MAP - 80, MAP + 80),
      cy = rand(7, 11),
      n = 4 + (Math.random() * 3 | 0),
      s2 = rand(.8, 1.4);
    for (let k = 0; k < n; k++) {
      const r = rand(2.6, 4.6) * s2;
      puffs.push({
        x: cx + (k - n / 2) * 3.4 * s2 + rand(-1, 1),
        y: cy + rand(-.6, 1.4),
        z: cz + rand(-2.5, 2.5) * s2,
        sx: r,
        sy: r * .8,
        sz: r,
        c: 16777215
      })
    }
  }
  WORLD.puffs = instanced(G.sphLo, new THREE.MeshStandardMaterial({   // low-poly: there are ~1900 of them
    color: 16777215,
    roughness: 1,
    emissive: 3820122
  }), puffs);
  const high = [];
  for (let i = 0; i < Math.round(70 * MAP_K * MAP_K * .85); i++) {
    const cx = rand(-MAP - 100, MAP + 100),
      cz = rand(-MAP - 100, MAP + 100),
      cy = rand(34, 52),
      n = 3 + (Math.random() * 3 | 0),
      s2 = rand(1, 1.8);
    for (let k = 0; k < n; k++) {
      const r = rand(2.8, 4.8) * s2;
      high.push({
        x: cx + (k - n / 2) * 3.6 * s2,
        y: cy + rand(-.8, 1.2),
        z: cz + rand(-2.5, 2.5) * s2,
        sx: r,
        sy: r * .7,
        sz: r,
        c: 16777215
      })
    }
  }
  WORLD.high = instanced(G.sphLo, new THREE.MeshStandardMaterial({
    color: 16777215,
    roughness: 1,
    emissive: 5595242
  }), high, !1);
  const posts = [],
    tops = [];
  for (let i = -MAP; i <= MAP; i += 16)
    for (const [x, z] of [
        [i, -MAP - 6],
        [i, MAP + 6],
        [-MAP - 6, i],
        [MAP + 6, i]
      ]) {
      const red = (i / 16 | 0) % 2 === 0;
      posts.push({
        x,
        y: 9,
        z,
        sx: .9,
        sy: 18,
        sz: .9,
        c: red ? 16731501 : 16777215
      }), tops.push({
        x,
        y: 18.5,
        z,
        sx: 1.4,
        sy: 1.4,
        sz: 1.4,
        c: red ? 16777215 : 16731501
      })
    }
  WORLD.posts = instanced(G.cyl, white, posts), WORLD.tops = instanced(G.sphLo, white, tops)
});
const MAXB = 480,
  MAXP = 800,
  bulletMesh = new THREE.InstancedMesh(G.sphLo, new THREE.MeshBasicMaterial({
    color: 16777215
  }), MAXB);
bulletMesh.frustumCulled = !1, bulletMesh.count = 0, scene.add(bulletMesh);
const partMesh = new THREE.InstancedMesh(G.sphLo, new THREE.MeshStandardMaterial({
  color: 16777215,
  roughness: 1
}), MAXP);
partMesh.frustumCulled = !1, partMesh.count = 0, partMesh.castShadow = !1, scene.add(partMesh);
const _m4 = new THREE.Matrix4,
  _q = new THREE.Quaternion,
  _v = new THREE.Vector3,
  _s = new THREE.Vector3,
  _c = new THREE.Color,
  _e = new THREE.Euler;
bulletMesh.setColorAt(0, _c.set(16777215)), partMesh.setColorAt(0, _c.set(16777215));
const SW = [],
  swGeo = new THREE.RingGeometry(.84, 1, 64);
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(swGeo, new THREE.MeshBasicMaterial({
    color: 16777215,
    transparent: !0,
    opacity: 0,
    depthWrite: !1,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: !1
  }));
  m.visible = !1, m.frustumCulled = !1, scene.add(m), SW.push({
    m,
    t: 1,
    dur: 1,
    r: 1
  })
}

function shockwave(x, y, z, r, col, dur = .5) {
  const s2 = SW.find(s3 => s3.t >= s3.dur) || SW.reduce((a, b) => a.t / a.dur > b.t / b.dur ? a : b);
  s2.t = 0, s2.dur = dur, s2.r = r, s2.m.position.set(x, y, z), s2.m.material.color.set(col), s2.m.visible = !0, s2.m.scale.setScalar(.01)
}

function updateShockwaves(dt) {
  for (const s2 of SW) {
    if (s2.t >= s2.dur) continue;
    s2.t += dt;
    const k = Math.min(1, s2.t / s2.dur),
      e = 1 - Math.pow(1 - k, 3);
    s2.m.scale.setScalar(Math.max(.01, s2.r * e)), s2.m.material.opacity = (1 - k) * .9, s2.m.quaternion.copy(camera.quaternion), k >= 1 && (s2.m.visible = !1)
  }
}

function makeAmmoBox(missile) {
  const g = new THREE.Group,
    inner = new THREE.Group;
  if (g.add(inner), part(G.box, M(missile ? 16731469 : 16752451), 2.2, 1.5, 1.6, 0, 0, 0, inner), part(G.box, M(missile ? 16777215 : 16765503), 2.3, .35, 1.7, 0, .35, 0, inner), missile)
    for (const sd of [-1, 1]) {
      const m = part(G.capsule, M(16777215, {
        emissive: 3355443
      }), .22, .6, .22, 0, 1.2, sd * .4, inner);
      m.rotation.z = Math.PI / 2
    } else
      for (let i = -1; i <= 1; i++) part(G.capsule, M(16765503, {
        emissive: 6702080
      }), .2, .3, .2, i * .55, 1.35, 0, inner);
  const ring2 = new THREE.Mesh(G.torus, new THREE.MeshBasicMaterial({
    color: missile ? 16752543 : 16773754,
    transparent: !0,
    opacity: .8
  }));
  return ring2.rotation.x = Math.PI / 2, ring2.scale.setScalar(2.4), ring2.position.y = -1.4, g.add(ring2), g.userData.inner = inner, g.userData.ring = ring2, g
}

function makeHeart() {
  const g = new THREE.Group,
    inner = new THREE.Group;
  g.add(inner);
  const m = M(16731501, {
    emissive: 5574688
  });
  part(G.sph, m, .85, .85, .7, -.55, .35, 0, inner), part(G.sph, m, .85, .85, .7, .55, .35, 0, inner);
  const c = part(G.cone, m, 1.3, 1.6, .7, 0, -.75, 0, inner);
  c.rotation.z = Math.PI;
  const ring2 = new THREE.Mesh(G.torus, new THREE.MeshBasicMaterial({
    color: 16753602,
    transparent: !0,
    opacity: .8
  }));
  return ring2.rotation.x = Math.PI / 2, ring2.scale.setScalar(2.4), ring2.position.y = -1.8, g.add(ring2), g.userData.inner = inner, g.userData.ring = ring2, g
}
let state = "loading",
  best = 0,
  revived = !1,
  busy = !1,
  lastAdTime = 0,
  gameTime = 0,
  kills = 0,
  killPts = 0,
  shake = 0,
  dieTimer = 0,
  speedLevel = 0,
  emptyToastT = 0,
  emptySfxT = 0,
  runCoinsGiven = 0,
  ALT_MIN = 7,
  ALT_MAX = 70;
const TITAN_AT = 180;
let titanPhase = "none",
  titanT = 0,
  titanWarned = !1,
  titanSlain = !1,
  supplyT = 14;
const titanLock = () => titanPhase === "intro" || titanPhase === "fight",
  ACE_AT = 300;
let acePhase = "none",
  aceT = 0,
  aceWarned = !1,
  aceSlain = !1;
const aceLock = () => acePhase === "intro" || acePhase === "fight",
  duelLock = () => titanLock() || aceLock() || typeof carrierLock == "function" && carrierLock() || typeof serpentLock == "function" && serpentLock();
let slowT = 0,
  slowScale = 1;

function hitStop(dur, scale) {
  (slowT <= 0 || scale <= slowScale) && (slowScale = scale), slowT = Math.max(slowT, dur)
}
const PARTS = {
  engine: [{
    id: "stock",
    name: "Piston",
    desc: "Reliable balanced propulsion.",
    speed: 1,
    turn: 1
  }, {
    id: "turbo",
    cost: 160,
    name: "Turbocharger",
    desc: "+18% speed / \u221210% turn",
    speed: 1.18,
    turn: .9
  }, {
    id: "torque",
    cost: 140,
    name: "Vector drive",
    desc: "+15% turn / \u22128% speed",
    speed: .92,
    turn: 1.15
  }],
  wing: [{
    id: "standard",
    name: "Cruiser wings",
    desc: "Balanced lift and handling."
  }, {
    id: "swept",
    cost: 100,
    name: "Swept wings",
    desc: "+10% speed / \u221212% turn",
    speed: 1.1,
    turn: .88
  }, {
    id: "acro",
    cost: 120,
    name: "Winglets",
    desc: "+22% turn / \u22128% speed",
    speed: .92,
    turn: 1.22
  }],
  weapon: [{
    id: "balanced",
    name: "Service gun",
    desc: "Balanced damage and cadence."
  }, {
    id: "rapid",
    cost: 180,
    name: "Rotary gun",
    desc: "+35% fire rate / \u221222% damage",
    fire: 1.35,
    damage: .78
  }, {
    id: "heavy",
    cost: 240,
    name: "Heavy cannon",
    desc: "+65% damage / \u221235% fire rate",
    fire: .65,
    damage: 1.65
  }],
  armor: [{
    id: "standard",
    name: "Standard hull",
    desc: "Balanced protection."
  }, {
    id: "light",
    cost: 100,
    name: "Light alloy",
    desc: "+12% speed / \u22121 armor",
    speed: 1.12,
    hp: -1
  }, {
    id: "heavy",
    cost: 200,
    name: "Reinforced hull",
    desc: "+2 armor / \u221214% speed",
    speed: .86,
    hp: 2
  }]
};

function ownsPart(slot, id) {
  return PARTS[slot]?.[0].id === id || garage.ownedParts?.[slot]?.includes(id)
}

function restoreParts(g) {
  garage.ownedParts = {};
  for (const [slot, items] of Object.entries(PARTS)) garage.ownedParts[slot] = [items[0].id, ...items.slice(1).filter(p => Array.isArray(g.ownedParts?.[slot]) && g.ownedParts[slot].includes(p.id)).map(p => p.id)], garage.loadout[slot] = items.some(p => p.id === g.loadout?.[slot]) && ownsPart(slot, g.loadout[slot]) ? g.loadout[slot] : items[0].id
}

function partStats() {
  const s2 = {
    speed: 1,
    turn: 1,
    fire: 1,
    damage: 1,
    hp: 0
  };
  for (const slot of Object.keys(PARTS)) {
    const p = PARTS[slot].find(p2 => p2.id === garage.loadout[slot]) || PARTS[slot][0];
    for (const k of ["speed", "turn", "fire", "damage"]) s2[k] *= p[k] ?? 1;
    s2.hp += p.hp || 0
  }
  return s2
}

function decoratePlane(root) {
  const b = root.userData.body,
    l = garage.loadout,
    metal = M(2309203),
    silver = M(12047579),
    orange = M(16751434);
  for (const side of [-1, 1]) {
    const radius = l.weapon === "heavy" ? .23 : l.weapon === "rapid" ? .14 : .09,
      gun = part(G.cyl, metal, radius, l.weapon === "heavy" ? 2.1 : 1.15, radius, 1, -.26, side * 1.2, b);
    if (gun.rotation.z = Math.PI / 2, l.weapon === "heavy") {
      const muzzle = part(G.cyl, orange, .29, .26, .29, 2.02, -.26, side * 1.2, b);
      muzzle.rotation.z = Math.PI / 2, part(G.box, metal, .65, .4, .42, .05, -.25, side * 1.2, b)
    }
    if (l.weapon === "rapid")
      for (let j = 0; j < 5; j++) {
        const t = part(G.cyl, silver, .065, 1.5, .065, 1.15, -.26 + Math.cos(j * 1.257) * .18, side * 1.2 + Math.sin(j * 1.257) * .18, b);
        t.rotation.z = Math.PI / 2
      }
    if (l.engine === "turbo") {
      const e = part(G.cyl, metal, .34, 1.3, .34, -.7, -.3, side * .85, b);
      e.rotation.z = Math.PI / 2;
      const rim = part(G.cyl, orange, .36, .16, .36, -1.38, -.3, side * .85, b);
      rim.rotation.z = Math.PI / 2, part(G.sph, M(16744512, {
        emissive: 16730112,
        emissiveIntensity: 1.3
      }), .25, .25, .25, -1.48, -.3, side * .85, b)
    }
    if (l.engine === "torque") {
      part(G.box, orange, .85, .35, .46, -1.1, .12, side * .85, b);
      const vent = part(G.cyl, metal, .24, .3, .24, -1.5, .12, side * .85, b);
      vent.rotation.z = Math.PI / 2
    }
    if (l.wing === "acro") {
      const f = part(G.box, silver, .8, 1.05, .16, .1, .4, side * 2.22, b);
      f.rotation.x = side * .2, part(G.box, orange, .82, .18, .18, .1, .92, side * 2.12, b)
    }
    if (l.wing === "swept") {
      const w = part(G.box, silver, 1.75, .18, 1.65, -.45, .04, side * 1.9, b);
      w.rotation.y = side * .65;
      const stripe = part(G.box, orange, .22, .2, 1.5, -.28, .06, side * 1.95, b);
      stripe.rotation.y = side * .65
    }
    if (l.armor === "heavy") {
      part(G.box, metal, 1.8, .65, .25, -.2, -.06, side * .68, b);
      for (const x of [-.85, .4]) part(G.sph, silver, .09, .09, .05, x, .12, side * .83, b);
      part(G.box, orange, .25, .66, .27, -.5, -.06, side * .68, b)
    }
    if (l.armor === "light") {
      part(G.box, silver, 1.15, .24, .17, -.45, .3, side * .53, b);
      for (let i = 0; i < 3; i++) part(G.box, metal, .12, .26, .19, -.85 + i * .32, .3, side * .53, b)
    }
    part(G.sph, M(side < 0 ? 16729413 : 5504963, {
      emissive: side < 0 ? 16719904 : 2162576,
      emissiveIntensity: .5
    }), .08, .08, .08, .1, .06, side * 2.28, b)
  }
  for (let i = 0; i < garage.lv.engine; i++) {
    const ring2 = part(G.torus, orange, .45, .45, .45, 1.05 - i * .14, 0, 0, b);
    ring2.rotation.y = Math.PI / 2
  }
}

function renderParts() {
  $("partList").innerHTML = Object.entries(PARTS).map(([slot, items]) => `<fieldset><legend>${slot}</legend><div class="partOptions">${items.map(p=>`<button class="partCard ${garage.loadout[slot]===p.id?"equipped":""}" data-slot="${slot}" data-part="${p.id}" aria-pressed="${garage.loadout[slot]===p.id}"><span>${p.name}</span><small>${p.desc}</small><em>${garage.loadout[slot]===p.id?"EQUIPPED":ownsPart(slot,p.id)?"EQUIP":p.cost+" COINS"}</em></button>`).join("")}</div></fieldset>`).join("");
  const stats = [
    ["CRUISE", Math.round(playerSpeed() / speedMul() * 12) + " km/h"],
    ["HANDLING", Math.round(turnRate() / TURN_BASE * 100) + "%"],
    ["HULL", HEARTS + " \u2665 \xB7 ARMOR " + armorOf(planeNow())],
    ["DAMAGE", gunDmg().toFixed(2)],
    ["FIRE RATE", (1 / fireGap()).toFixed(1) + "/s"]
  ];
  $("buildStats").innerHTML = stats.map(([k, v]) => `<div><small>${k}</small><strong>${v}</strong></div>`).join(""), $("previewName").textContent = planeNow().name
}
const PLANES = [{
  id: "classic",
  name: "CLASSIC",
  desc: "Balanced all-rounder",
  cost: 0,
  hp: 0,
  turn: 1,
  speed: 1,
  guns: 1,
  fire: 1,
  missiles: 2,
  shape: "classic"
}, {
  id: "swift",
  name: "SWIFT",
  desc: "Very agile, but no armor at all",
  cost: 300,
  hp: -1,
  turn: 1.28,
  speed: 1.08,
  guns: 1,
  fire: 1.1,
  missiles: 2,
  shape: "swift"
}, {
  id: "brick",
  name: "BRICK",
  desc: "Biplane: heavy armor, slower turns",
  cost: 450,
  hp: 2,
  turn: .85,
  speed: .95,
  guns: 1,
  fire: .9,
  missiles: 3,
  shape: "brick"
}, {
  id: "twin",
  name: "TWIN",
  desc: "Fires two guns at once",
  cost: 650,
  hp: 0,
  turn: 1,
  speed: 1,
  guns: 2,
  fire: 1,
  missiles: 2,
  shape: "twin"
}, {
  id: "falcon",
  name: "FALCON X",
  desc: "Day 7 reward: twin guns, armor 4, 4 missiles",
  cost: null,
  hp: 1,
  turn: 1.2,
  speed: 1.1,
  guns: 2,
  fire: 1.2,
  missiles: 4,
  shape: "falcon"
}];
PLANES.push({
  id: "lancer",
  name: "LANCER",
  desc: "Needle interceptor: fast, light, precise",
  cost: 500,
  hp: -1,
  turn: 1.18,
  speed: 1.22,
  guns: 1,
  fire: 1.1,
  missiles: 2,
  shape: "lancer"
}, {
  id: "seraph",
  name: "SERAPH",
  desc: "Split-wing starfighter: twin guns, balanced speed",
  cost: 800,
  hp: 0,
  turn: 1.08,
  speed: 1.06,
  guns: 2,
  fire: 1,
  missiles: 3,
  shape: "seraph"
}, {
  id: "spectre",
  name: "SPECTRE",
  desc: "Flying-wing bomber: armored, heavy missile load",
  cost: 950,
  hp: 2,
  turn: .78,
  speed: .94,
  guns: 1,
  fire: .9,
  missiles: 6,
  shape: "spectre"
}, {
  id: "halo",
  name: "HALO",
  desc: "Ring-drive flagship: triple ion cannons, top speed and agility",
  cost: 1100,
  hp: 1,
  turn: 1.35,
  speed: 1.2,
  guns: 3,
  fire: 1.1,
  missiles: 4,
  shape: "halo"
}, {
  id: "orb",
  name: "ORB",
  desc: "Alien scout saucer: blinks through space, razor handling, light hull",
  cost: 700,
  hp: -1,
  turn: 1.45,
  speed: 1.05,
  guns: 1,
  fire: 1.3,
  missiles: 2,
  shape: "orb"
}, {
  id: "mantis",
  name: "MANTIS",
  desc: "Alien hunter: tractor beam, twin plasma guns",
  cost: 900,
  hp: 0,
  turn: 1.2,
  speed: 1.1,
  guns: 2,
  fire: 1.1,
  missiles: 3,
  shape: "mantis"
}, {
  id: "mothership",
  name: "MOTHERSHIP",
  desc: "Alien command saucer: gravity wells, triple plasma, heavy hull",
  cost: 1250,
  hp: 2,
  turn: 1.1,
  speed: 1.12,
  guns: 3,
  fire: 1.05,
  missiles: 5,
  shape: "mothership"
}, {
  id: "prism",
  name: "PRISM",
  desc: "Crystal starfighter: fires a continuous beam instead of bullets",
  cost: 1000,
  hp: 0,
  turn: 1.15,
  speed: 1.12,
  guns: 1,
  fire: 1,
  missiles: 3,
  shape: "prism"
}, {
  id: "viper",
  name: "STINGER",
  desc: "Pod fighter: blistering speed, can swing its view, guns and missiles to the rear",
  cost: 850,
  hp: -1,
  turn: 1.32,
  speed: 1.18,
  guns: 2,
  fire: 1.1,
  missiles: 2,
  shape: "viper"
}, {
  id: "anvil",
  name: "THUNDERHEAD",
  desc: "Twin-hull heavy bomber: carpet-bombs everything below it",
  cost: 750,
  hp: 3,
  turn: .85,
  speed: 1,
  guns: 2,
  fire: 1,
  missiles: 5,
  shape: "anvil"
});
// price and performance line up: every step up the price list is a step up in overall power
const STAT_TUNE = {
  classic: [0, 0, 1, 1, 1, 1, 2], swift: [300, -1, 1.28, 1.08, 1, 1.1, 2], brick: [450, 2, 1, 1.02, 1, 1.02, 4], lancer: [500, -1, 1.22, 1.26, 1, 1.12, 2],
  twin: [650, 0, 1.08, 1.08, 2, 1.05, 3], orb: [700, -1, 1.5, 1.08, 1, 1.3, 2], anvil: [750, 3, .85, 1, 2, 1, 5], seraph: [800, 0, 1.18, 1.16, 2, 1.05, 3],
  viper: [850, -1, 1.32, 1.18, 2, 1.1, 2], mantis: [900, 0, 1.25, 1.17, 2, 1.12, 3], spectre: [950, 2, 1, 1.1, 2, 1.08, 6], falcon: [null, 1, 1.18, 1.12, 2, 1.15, 4],
  prism: [1050, 1, 1.24, 1.2, 1, 1.6, 3], mothership: [1250, 2, 1.1, 1.1, 3, 1, 5], halo: [1400, 1, 1.3, 1.2, 3, 1.08, 4]
};
for (const p of PLANES) { const t = STAT_TUNE[p.id]; t && ([p.cost, p.hp, p.turn, p.speed, p.guns, p.fire, p.missiles] = t); }
// shop prices: three bargains, everything else doubled. p.tierCost keeps the power grade (abilities, lock speed) on the tuned line
const PRICE_SET = { swift: 150, orb: 500, viper: 350 };
for (const p of PLANES) { p.tierCost = p.cost; if (p.cost) p.cost = PRICE_SET[p.id] ?? p.cost * 2; }
// armor: extra hits spread over the 3 fixed hearts. Cheap airframes are fragile
const PLANE_ARMOR = { classic: 0, swift: 0, viper: 1, orb: 1, brick: 5, lancer: 2, twin: 3, anvil: 6, seraph: 3, mantis: 4, spectre: 5, falcon: 4, prism: 4, mothership: 6, halo: 5 };
// handling: every airframe turned too sharply, so the spread between them is squeezed too
for (const p of PLANES) { p.armor = PLANE_ARMOR[p.id] ?? 0; p.turn = 1 + (p.turn - 1) * .6; }
PLANES.sort((a, b) => (a.cost == null ? 2000 : a.cost) - (b.cost == null ? 2000 : b.cost));
const UPGRADES = [{
    id: "engine",
    name: "ENGINE",
    desc: "Sharper turns and climbs",
    max: 5
  }, {
    id: "guns",
    name: "GUNS",
    desc: "Faster fire rate",
    max: 5
  }, {
    id: "power",
    name: "POWER",
    desc: "More damage per bullet",
    max: 5
  }, {
    id: "armor",
    name: "ARMOR",
    desc: "+1 armor per level (one more hit)",
    max: 3
  }, {
    id: "ammo",
    name: "AMMO",
    desc: "More bullets, missiles and flares",
    max: 5
  }],
  UP_COST = [40, 80, 140, 220, 320],
  PAINTS = [{
    id: "classic",
    name: "Classic",
    body: 16731501,
    wing: 16765503,
    cost: 0
  }, {
    id: "sky",
    name: "Sky",
    body: 3902719,
    wing: 16777215,
    cost: 60
  }, {
    id: "mint",
    name: "Mint",
    body: 3068322,
    wing: 16773754,
    cost: 60
  }, {
    id: "grape",
    name: "Grape",
    body: 9133302,
    wing: 16757734,
    cost: 60
  }, {
    id: "gold",
    name: "Gold",
    body: 16761370,
    wing: 16739133,
    cost: 150
  }, {
    id: "stealth",
    name: "Stealth",
    body: 3817301,
    wing: 10479615,
    cost: 150
  }],
  DAILY = [{
    coins: 50
  }, {
    coins: 75
  }, {
    coins: 100
  }, {
    coins: 125
  }, {
    coins: 150
  }, {
    coins: 200
  }, {
    plane: "falcon",
    coins: 500
  }],
  garage = {
    coins: 0,
    lv: {
      engine: 0,
      guns: 0,
      power: 0,
      armor: 0,
      ammo: 0
    },
    paints: ["classic"],
    paint: "classic",
    planes: ["classic"],
    plane: "classic",
    loadout: {
      engine: "stock",
      wing: "standard",
      weapon: "balanced",
      armor: "standard"
    },
    daily: {
      day: 0,
      last: ""
    }
  };

function loadGarage(raw) {
  try {
    const g = JSON.parse(raw || "{}") || {};
    restoreParts(g), Number.isFinite(g.coins) && g.coins >= 0 && (garage.coins = Math.floor(g.coins));
    for (const u of UPGRADES) {
      const v = g.lv && g.lv[u.id];
      Number.isInteger(v) && (garage.lv[u.id] = clamp(v, 0, u.max))
    }
    Array.isArray(g.paints) && (garage.paints = ["classic", ...g.paints.filter(id => id !== "classic" && PAINTS.some(p => p.id === id))]), garage.paints.includes(g.paint) && (garage.paint = g.paint), Array.isArray(g.planes) && (garage.planes = ["classic", ...g.planes.filter(id => id !== "classic" && PLANES.some(p => p.id === id))]), garage.planes.includes(g.plane) && (garage.plane = g.plane), g.daily && Number.isInteger(g.daily.day) && typeof g.daily.last == "string" && (garage.daily = {
      day: clamp(g.daily.day, 0, 6),
      last: g.daily.last
    })
  } catch {}
}
const saveGarage = () => Store.set("garage", JSON.stringify(garage)),
  planeNow = () => PLANES.find(p => p.id === garage.plane) || PLANES[0],
  tierOf = p => clamp((p.tierCost == null ? 1000 : p.tierCost) / 1400, 0, 1),
  planeTier = () => tierOf(planeNow()),
  tierGrade = t => t < .15 ? "C" : t < .45 ? "B" : t < .7 ? "A" : t < .95 ? "S" : "S+",
  lockRangeOf = p => Math.round(150 + 100 * tierOf(p)),
  lockRingOf = p => .26 + .14 * tierOf(p),
  boostSecsOf = p => 1 / (.3 * (1 - .35 * tierOf(p))),
  paintNow = () => PAINTS.find(p => p.id === garage.paint) || PAINTS[0],
  armorOf = (p, mod = partStats()) => Math.max(0, p.armor + garage.lv.armor + mod.hp + run.hp),
  maxHp = () => netHpMax || HEARTS + armorOf(planeNow()),
  maxAmmo = () => Math.round((40 + 10 * garage.lv.ammo) * (1 + .5 * run.ammo)),
  startAmmo = () => 12 + 6 * garage.lv.ammo,
  ammoBox = () => Math.round((8 + 2 * garage.lv.ammo) * (1 + .5 * run.ammo)),
  maxMsl = () => 9 + 2 * run.msl,
  maxFlr = () => 9 + 3 * run.flare,
  startMissiles = () => planeNow().missiles + Math.floor(garage.lv.ammo / 2),
  startFlares = () => 3 + Math.floor(garage.lv.ammo / 2),
  turnRate = () => TURN_BASE * masteryBonus() * (1 + .1 * garage.lv.engine) * (1 + .1 * planeTier()) * planeNow().turn * partStats().turn * (1 + .1 * run.spd),
  fireGap = () => .15 / ((1 + .15 * garage.lv.guns) * planeNow().fire * partStats().fire * (1 + .2 * run.fire)),
  gunDmg = () => (1 + .5 * garage.lv.power) * partStats().damage * (1 + .25 * run.dmg),
  todayStr = () => {
    const d = new Date;
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
  },
  canClaimDaily = () => garage.daily.last !== todayStr(),
  player = {
    x: 0,
    y: ALT,
    z: 0,
    a: -Math.PI / 2,
    p: 0,
    roll: 0,
    hp: 3,
    ammo: 12,
    missiles: 2,
    flares: 3,
    invul: 0,
    fireCd: 0,
    mslCd: 0,
    flareCd: 0,
    trailT: 0,
    alive: !0,
    mesh: makePlane(16731501, 16765503)
  };
scene.add(player.mesh);

function applyLook() {
  const vis = player.mesh.visible,
    pt = paintNow();
  scene.remove(player.mesh), player.mesh = makePlane(pt.body, pt.wing, planeNow().shape), player.mesh.visible = vis, decoratePlane(player.mesh), decorateMastery(player.mesh, garage.plane), scene.add(player.mesh), orientPlane(player, 0), refreshPreview()
}
let bots = [],
  bullets = [],
  parts = [],
  pickups = [],
  missiles = [],
  decoys = [],
  turrets = [],
  botSpawnCd = 0,
  heartCd = 20,
  mslWarnT = 0,
  boss = null,
  bossCount = 0,
  nextBossAt = 75,
  bossWarnT = 0,
  combo = 0,
  comboT = 0,
  bestCombo = 0,
  tutorialDone = !1,
  tipList = [],
  tipT = 0,
  overShownAt = 0;
const COMBO_WINDOW = 4,
  BOT_COLORS = [
    [5082111, 16777215],
    [3655546, 16777215],
    [10185983, 16765168],
    [16752451, 3810128]
  ],
  SPEED_K = 2,
  speedMul = () => 1,
  playerSpeed = () => cruiseSpeed() * (player.ve || 1),
  cruiseSpeed = () => (ringBoostT > 0 ? 1.35 : 1) * (1 + .08 * planeTier()) * masteryBonus() * 15 * SPEED_K * speedMul() * planeNow().speed * partStats().speed * (1 + .1 * run.spd) * (ramTime > 0 ? 1.65 : 1),
  botSpeed = () => 13.2 * SPEED_K,
  scoreNow = () => Math.floor(gameTime) * 10 + killPts,
  runCoins = () => Math.floor(scoreNow() / 50) * 3,
  maxBotsNow = () => Math.min(8, 2 + Math.floor(lvT / 22)),
  input = {
    mouseX: 0,
    mouseY: 0,
    mouseActive: !1,
    mouseFire: !1,
    keyFire: !1,
    touchFire: !1,
    ads: !1,
    adsToggle: !1,
    touchId: null,
    touchX: 0,
    touchY: 0,
    touchX0: 0,
    touchY0: 0,
    left: !1,
    right: !1,
    up: !1,
    down: !1,
    boost: !1,
    brake: !1,
    tBoost: !1,
    tBrake: !1
  };
let steerNow = 0,
  climbNow = 0;
const firing = () => input.mouseFire || input.keyFire || input.touchFire,
  aiming = () => (input.ads || input.adsToggle) && state === "playing",
  fwdOf = e => {
    const cp = Math.cos(e.p || 0);
    return [Math.cos(e.a) * cp, Math.sin(e.p || 0), Math.sin(e.a) * cp]
  },
  dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
  clampAlt = y => clamp(y, ALT_MIN + 3, ALT_MAX - 5);

function spawnBot(force, at) {
  for (let t = 0; t < 12; t++) {
    let x, z;
    if (at) x = clamp(at.x + rand(-14, 14), -MAP + 12, MAP - 12), z = clamp(at.z + rand(-14, 14), -MAP + 12, MAP - 12);
    else {
      const ang = rand(0, Math.PI * 2),
        d = rand(95, 125);
      if (x = player.x + Math.cos(ang) * d, z = player.z + Math.sin(ang) * d, Math.abs(x) > MAP - 10 || Math.abs(z) > MAP - 10) continue
    }
    const r = Math.random(),
      needAce = lvT > 70 && !bots.some(o => o.kind === "ace") && Math.random() < .6,
      kind = force || (needAce || lvT > 70 && r < Math.min(.3, .1 + lvT / 900) ? "ace" : lvT > 45 && r < Math.min(.55, .3 + lvT / 600) ? "heavy" : "normal"),
      col = kind === "ace" ? [9117229, 2829634] : kind === "heavy" ? [2829634, 16726843] : BOT_COLORS[Math.random() * BOT_COLORS.length | 0],
      b = {
        x,
        y: clampAlt(at ? at.y + rand(-6, 6) : player.y + (isSpace() ? rand(-45, 45) : rand(-14, 14))),
        z,
        a: Math.atan2(player.z - z, player.x - x),
        p: 0,
        roll: 0,
        kind,
        hp: kind === "heavy" ? 8 : kind === "ace" ? 4 : 1,
        heavy: kind === "heavy",
        scale: kind === "heavy" ? 1.6 : 1,
        spd: kind === "heavy" ? .8 : kind === "ace" ? 1.12 : 1,
        pts: kind === "heavy" ? 300 : kind === "ace" ? 400 : 100,
        fireCd: rand(2.5, 4),
        mslCd: rand(4, 7),
        wander: 0,
        wanderT: 0,
        side: Math.random() < .5 ? -1 : 1,
        trailT: 0,
        mesh: makePlane(col[0], col[1], kind === "heavy" ? "brick" : kind === "ace" ? "falcon" : "classic", !0)
      };
    return kind === "heavy" && b.mesh.scale.setScalar(1.45 * 1.6), force || configureEnemyAirframe(b), scene.add(b.mesh), bots.push(b), orientPlane(b, 0), b
  }
  return null
}

function removeBot(b) {
  scene.remove(b.mesh)
}

function setupTurrets() {
  if (turrets.forEach(t => scene.remove(t.mesh)), turrets = [], !themeFlag("noTurrets"))
    for (const o of ISLANDS) {
      if (o.r < 8 || o.tx === void 0 || Math.abs(o.x) > MAP - 10 || Math.abs(o.z) > MAP - 10 || Math.hypot(o.x, o.z) < 60 || Math.random() > .5) continue;
      const mesh = makeTurret();
      mesh.position.set(o.tx, o.ty - .4, o.tz), scene.add(mesh), turrets.push({
        x: o.tx,
        y: o.ty + 2,
        z: o.tz,
        hp: 6,
        cd: rand(1, 3),
        dead: !1,
        mesh,
        scale: 1.2,
        pts: 150
      })
    }
}

function gunSide(guns, g) {
  return guns === 1 ? 0 : guns === 2 ? (g ? 1 : -1) * 1.3 : [-1.5, 0, 1.5][g % 3]
}

function fire(from, isEnemy, aimAt) {
  if (bullets.length >= MAXB) return;
  const spd = isEnemy ? botSpeed() + 30 : playerSpeed() + 58;
  let [dx, dy, dz] = fwdOf(from);
  if (!isEnemy && stormTime > 0) { stormHeat = Math.min(1, stormHeat + .035); const sp = .012 + .07 * stormHeat; dx += rand(-sp, sp), dy += rand(-sp, sp) * .6, dz += rand(-sp, sp); }
  if (aimAt) {
    const tx = aimAt.x - from.x,
      ty = aimAt.y - from.y,
      tz = aimAt.z - from.z,
      l = Math.hypot(tx, ty, tz) || 1;
    dx = tx / l, dy = ty / l, dz = tz / l
  }
  const guns = isEnemy ? from.guns || 1 : planeNow().guns;
  for (let g = 0; g < guns; g++) {
    const side = gunSide(guns, g),
      ox = -Math.sin(from.a) * side,
      oz = Math.cos(from.a) * side,
      x0 = from.x + dx * 2.8 + ox,
      y0 = from.y + dy * 2.8,
      z0 = from.z + dz * 2.8 + oz;
    bullets.push({
      x: x0,
      y: y0,
      z: z0,
      vx: dx * spd,
      vy: dy * spd,
      vz: dz * spd,
      life: isEnemy ? 1.9 : 1.1,
      enemy: isEnemy,
      src: isEnemy ? srcName(from) : null,
      dmg: isEnemy ? from.dmg || 1 : void 0,
      profile: shotProfile(from, isEnemy)
    })
  }
}

// who fired: shown in the hit log so every attack's damage can be checked
function srcName(o) {
  return o.src || (o.titan ? "TITAN" : o.ace && o.boss ? "FALCON ZERO" : o.carrier ? "LEVIATHAN" : o.boss ? "SKY FORTRESS" : o.bomber ? "BOMBER TAIL GUN" : o.squad ? "SQUADRON ACE" : o.kind === "ace" ? "ACE FIGHTER" : o.heavy ? "HEAVY FIGHTER" : o.airframe ? o.airframe.toUpperCase() : "FIGHTER");
}
function orb(x, y, z, dx, dy, dz, spd, life = 4.5) {
  if (bullets.length >= MAXB) return;
  const l = Math.hypot(dx, dy, dz) || 1;
  bullets.push({
    x,
    y,
    z,
    vx: dx / l * spd,
    vy: dy / l * spd,
    vz: dz / l * spd,
    life,
    enemy: !0,
    src: "TITAN ORB",
    profile: "orb",
    r: 2.3
  })
}

function missileTarget(from) {
  const f = fwdOf(from);
  let best2 = null,
    bestScore = 1e9;
  for (const t of targetables()) {
    if (t.dead) continue;
    const dx = t.x - from.x,
      dy = t.y - from.y,
      dz = t.z - from.z,
      d = Math.hypot(dx, dy, dz);
    if (d > (t === boss ? 140 : 110)) continue;
    const off = Math.acos(clamp((dx * f[0] + dy * f[1] + dz * f[2]) / Math.max(d, .01), -1, 1));
    if (off > .9) continue;
    const sc = d + off * 60;
    sc < bestScore && (bestScore = sc, best2 = t)
  }
  return best2
}

function launchMissile(from, enemy) {
  const f = fwdOf(from),
    spd = enemy ? playerSpeed() * 1.3 + 6 : playerSpeed() + 42,
    m = {
      x: from.x + f[0] * 3,
      y: from.y + f[1] * 3 - .8,
      z: from.z + f[2] * 3,
      vx: f[0] * spd,
      vy: f[1] * spd,
      vz: f[2] * spd,
      spd,
      enemy,
      target: enemy ? player : missileTarget(from),
      turn: enemy ? 1.7 : 3.2,
      life: enemy ? 6.5 : 3.5,
      trailT: 0,
      mesh: !enemy && isAlienPlane() ? makeAlienMissile(alienCol()) : makeMissile(enemy),
      alien: !enemy && isAlienPlane() ? alienCol() : 0,
      src: enemy ? srcName(from) + " MISSILE" : null
    };
  return !enemy && adsK > .4 && (m.mesh.visible = !1, m.hideT = .18), scene.add(m.mesh), missiles.push(m), Sound.sfxMissile(enemy), m
}

function removeMissile(m) {
  scene.remove(m.mesh), m.dead = !0
}

function dropFlares() {
  for (let i = 0; i < 3; i++) {
    const f = fwdOf(player),
      sd = (i - 1) * 6;
    decoys.push({
      x: player.x - f[0] * 3,
      y: player.y - 1,
      z: player.z - f[2] * 3,
      vx: -f[0] * 6 - Math.sin(player.a) * sd,
      vy: -3,
      vz: -f[2] * 6 + Math.cos(player.a) * sd,
      life: 2.2
    })
  }
  for (const m of missiles) m.enemy && m.target === player && dist3(m, player) < 90 && (m.target = decoys[decoys.length - 1 - (Math.random() * 3 | 0)]);
  Sound.tone(900, .25, "triangle", .08, 300)
}

function addPart(x, y, z, vx, vy, vz, life, size, color, grow = 0, grav = 0) {
  parts.length >= MAXP && parts.shift(), parts.push({
    x,
    y,
    z,
    vx,
    vy,
    vz,
    life,
    max: life,
    size,
    color,
    grow,
    grav
  })
}

function explode(x, y, z, big = 1, alien = 0) {
  const cols = alien ? [alien, 16777215, alien, 0x6ff7ff] : [16731501, 16763904, 16752451, 16777215];
  for (let i = 0; i < 26 * big; i++) {
    const a = rand(0, Math.PI * 2),
      e = rand(-.6, 1.2),
      v = rand(6, 18) * Math.sqrt(big);
    addPart(x, y, z, Math.cos(a) * v, e * v * .6, Math.sin(a) * v, rand(.4, .9), rand(.5, 1.1) * big, cols[i % 4])
  }
  for (let i = 0; i < 8; i++) addPart(x + rand(-1, 1), y, z + rand(-1, 1), rand(-2, 2), rand(1, 4), rand(-2, 2), rand(.8, 1.3), rand(1, 1.6), 9079456, 1.6);
  for (let i = 0; i < 2; i++) addPart(x, y, z, 0, 0, 0, .14, 1.5 * big, i ? 16774064 : 16777215, 2);
  if (big >= .9) {
    for (let i = 0; i < 7 * big; i++) addPart(x, y, z, rand(-9, 9), rand(2, 10), rand(-9, 9), rand(1, 1.6), rand(.3, .55), i % 2 ? 3817301 : 5988981, 0, 18);
    for (let i = 0; i < 10 * big; i++) {
      const a = rand(0, 6.3),
        v = rand(22, 38);
      addPart(x, y, z, Math.cos(a) * v, rand(-8, 14), Math.sin(a) * v, rand(.25, .45), .28, 16774856, .2)
    }
    shockwave(x, y, z, 7 * big, 16765578, .45)
  }
}

function spawnPickup(type, x, z, y) {
  if (x === void 0) {
    for (let t = 0; t < 15; t++) {
      const a = rand(0, Math.PI * 2),
        d = rand(30, 150);
      if (x = player.x + Math.cos(a) * d, z = player.z + Math.sin(a) * d, Math.abs(x) < MAP - 12 && Math.abs(z) < MAP - 12) break
    }
    x = clamp(x, -MAP + 12, MAP - 12), z = clamp(z, -MAP + 12, MAP - 12)
  }
  y === void 0 && (y = clampAlt(player.y + rand(-12, 12)));
  const mesh = type === "heart" ? makeHeart() : makeAmmoBox(type === "missile");
  mesh.position.set(x, y, z), scene.add(mesh), pickups.push({
    type,
    x,
    y,
    z,
    mesh,
    t: rand(0, 6)
  })
}

function removePickup(p) {
  scene.remove(p.mesh)
}

function showOnly(id) {
  for (const s2 of ["title", "pause", "over", "garage", "daily", "netScreen", "duelEnd"]) $(s2).classList.toggle("hidden", s2 !== id)
}

function setHud(on) {
  $("hud").classList.toggle("hidden", !on), $("btnPause").classList.toggle("hidden", !on), $("radar").classList.toggle("hidden", !on), $("btnFire").classList.toggle("hidden", !(on && IS_TOUCH)), $("btnAds").classList.toggle("hidden", !(on && IS_TOUCH)), $("weaponBtns").classList.toggle("hidden", !on), $("thrBtns").classList.toggle("hidden", !(on && IS_TOUCH)), $("flt").classList.toggle("hidden", !on), on || ($("stallWarn").hidden = !0),on || ($("warn").classList.add("hidden"), $("combo").classList.add("hidden"), $("bossBar").classList.add("hidden"), $("lowHp").classList.remove("on"), hideTip())
}

function clearInput() {
  steerNow = 0, climbNow = 0, input.mouseActive = !1, input.mouseFire = input.keyFire = input.touchFire = input.ads = input.adsToggle = !1, $("btnAds").classList.remove("on"), input.left = input.right = input.up = input.down = !1, input.boost = input.brake = input.tBoost = input.tBrake = !1, input.touchId = null, $("btnFire").classList.remove("on"), $("btnBoost").classList.remove("on"), $("btnBrake").classList.remove("on")
}

function clearWorld() {
  bots.forEach(removeBot), bots = [], pickups.forEach(removePickup), pickups = [], missiles.forEach(m => scene.remove(m.mesh)), missiles = [], bullets = [], parts = [], decoys = [], boss && scene.remove(boss.mesh), boss && boss.serpent && boss.segs.forEach(s => scene.remove(s.g)), turrets = turrets.filter(t => t.carrier ? (scene.remove(t.mesh), !1) : !t.sCore), dirPhase === "wave" && endWave(), clearMines(), resetRun(), resetHazards(), dirPhase = "none", wv = {}, boss = null, bossWarnT = 0, combo = 0, comboT = 0, $("bossBar").classList.add("hidden"), $("bossBar").classList.remove("titan", "ace", "shield"), $("bossWarn").classList.add("hidden"), $("combo").classList.add("hidden"), hideCine(), slowT = 0, slowScale = 1, clearPopups(), clearHitLog(), hideTip(), clearHitFx()
}

function resetDemoPlane() {
  Object.assign(player, {
    x: 0,
    y: ALT,
    z: 0,
    a: -Math.PI / 2,
    p: 0,
    roll: 0,
    alive: !0
  }), player.mesh.visible = !0, snapCamera()
}

function renderClears() { const e = $("clearStar"); e.classList.toggle("hidden", !clearCount), e.textContent = "\u2605 CLEARED" + (clearCount > 1 ? " \xD7" + clearCount : "") + " \xB7"; }
function toTitle() {
  bankMastery(), renderClears();
  CG.gameplayStop(), applyTheme(0), $("upgrade").classList.add("hidden"), ramTime = rollTime = shieldTime = stormTime = cloakTime = 0, player.rollFx = 0, shieldMesh.visible = !1, state = "title", clearWorld(), clearInput(), resetDemoPlane(), $("titleBest").textContent = best, $("titleCoins").textContent = garage.coins, $("dailyBadge").hidden = !canClaimDaily(), setHud(!1), $("hint").classList.add("hidden"), renderCheckpoints(), showOnly("title")
}

function openDaily() {
  state === "title" && (state = "daily", renderDaily(), showOnly("daily"))
}

function openGarage() {
  bankMastery();
  applyTheme(0), $("upgrade").classList.add("hidden"), ramTime = rollTime = shieldTime = stormTime = cloakTime = 0, player.rollFx = 0, shieldMesh.visible = !1, CG.gameplayStop(), state = "garage", clearWorld(), clearInput(), resetDemoPlane(), setHud(!1), $("hint").classList.add("hidden"), renderGarage(), showOnly("garage")
}

function startRun(cp) {
  cp = +cp || window.__warpStage || 0, clearWorld(), clearInput(), resetSpecial(), Object.assign(player, {
    x: 0,
    y: ALT,
    z: 0,
    a: -Math.PI / 2,
    p: 0,
    roll: 0,
    hp: maxHp(),
    ammo: startAmmo(),
    missiles: startMissiles(),
    flares: startFlares(),
    invul: 0,
    fireCd: 0,
    mslCd: 0,
    flareCd: 0,
    alive: !0,
    ve: 1,
    heat: 0,
    ovh: !1,
    stall: !1,
    boosting: !1,
    braking: !1
  }), player.mesh.visible = !0, snapCamera(), runCleared = !1, gameTime = 0, kills = 0, killPts = 0, runCoinsGiven = 0, revived = !1, speedLevel = 0, botSpawnCd = 3, heartCd = 20, bossCount = 0, nextBossAt = 1e9, bestCombo = 0, startTips(), titanPhase = "none", titanT = 0, titanWarned = !1, titanSlain = !1, supplyT = 14, acePhase = "none", aceT = 0, aceWarned = !1, aceSlain = !1, carrierPhase = "none", carrierT = 0, carrierWarned = !1, carrierSunk = !1, runCheckpoint = CP_BOSS[cp] ? cp : 0, runReached = 0, initDirector(runCheckpoint || 1, !!runCheckpoint), runCheckpoint && grantCheckpointUpgrades(runCheckpoint);
  for (let i = 0; i < 7; i++) spawnPickup("ammo");
  spawnPickup("missile"), setupTurrets(), enterReady(), startLaunchCine()
}

function enterReady() {
  state = "ready", clearInput(), showOnly(null), setHud(!0), $("hint").innerHTML = IS_TOUCH ? "DRAG anywhere: a JOYSTICK appears &middot; TAP to start" : "Mouse sideways BANKS &middot; pull back to turn hard &middot; SHIFT boost &middot; CLICK to start", $("hint").classList.remove("hidden"), updateHud(!0), fltCache = "", updateFlightHud(), CG.gameplayStart()
}

function beginPlaying() {
  state === "ready" && !(netGame === "duel" && duel.countT > 0) && (state = "playing", $("hint").classList.add("hidden"))
}

function pauseGame() {
  if (netGame) { netPause(); return }
  state !== "playing" && state !== "ready" || (state = "paused", clearInput(), hideTip(), $("bossWarn").classList.add("hidden"), CG.gameplayStop(), $("hint").classList.add("hidden"), $("btnPause").classList.add("hidden"), $("btnFire").classList.add("hidden"), $("btnAds").classList.add("hidden"), $("weaponBtns").classList.add("hidden"), $("thrBtns").classList.add("hidden"), $("flt").classList.add("hidden"), $("stallWarn").hidden = !0, $("btnSpecial").classList.add("hidden"), specialHudKey = "off", showOnly("pause"))
}

function resumeGame() {
  if (netHold) { netResume(); return }
  state === "paused" && enterReady()
}

// hearts are fixed at 3; armor adds hits to them. player.hp counts every remaining hit
const HEARTS = 3, TURN_BASE = 1.9;
// enemy attack power in hits (1 hit = 1 armor pip, or a heart with no armor left in it); anything not listed does 1
const ENEMY_DMG = { missile: 3, flak: 2 };
function heartCaps() { const A = maxHp() - HEARTS, b = Math.floor(A / HEARTS), x = A % HEARTS; return Array.from({ length: HEARTS }, (_, i) => 1 + b + (i < x ? 1 : 0)); }
function heartBase(hp = player.hp) { let c = 0; for (const cap of heartCaps()) { if (hp <= c + cap) return c; c += cap; } return c; }   // hits left below the current heart
function heartTop(hp = player.hp) { let c = 0; for (const cap of heartCaps()) { c += cap; if (hp < c) return c; } return c; }    // current heart topped up
const heartsLeft = () => { let c = 0, n = 0; for (const cap of heartCaps()) { if (player.hp > c) n++; c += cap; } return n; };
function damage(whole, why, src, amt = 1) {
  if (player.invul > 0 || state !== "playing" || rollTime > 0) return;
  if (shieldTime > 0) {
    for (let i = 0; i < 10; i++) addPart(player.x, player.y, player.z, rand(-8, 8), rand(-8, 8), rand(-8, 8), .3, .45, 8385535, .4);
    Sound.tone(900, .08, "triangle", .08, 1400), player.invul = .25;
    return
  }
  const h0 = player.hp, n0 = heartsLeft();
  whole ? (player.hp = heartBase(), shake = .6, popup(player.x, player.y + 3, player.z, (why ? why + " " : "") + "-1 \u2665", !0)) : player.hp = Math.max(0, player.hp - amt), player.invul = 1.6, shake = Math.max(shake, amt > 1 ? .5 : .35);
  logHit(why || src || "HIT", h0 - player.hp, n0 - heartsLeft());
  const fl = $("dmgFlash");
  fl.classList.remove("hit"), fl.offsetWidth, fl.classList.add("hit"), Sound.sfxHit(), explode(player.x, player.y, player.z, .4), hitStop(.12, .3), updateHud(!0), player.hp <= 0 && crash()
}

// hit log (HUD, left): what hit you and what it cost, so enemy attack power can be checked in play
const hitLogRows = [];
function logHit(what, hits, hearts) {
  const el = document.createElement("div");
  el.innerHTML = `<b>${hearts ? (hits > 1 ? "-" + hits + " \xB7 " : "") + "-" + hearts + " \u2665" : "-" + hits + " ARMOR"}</b> ${String(what).replace(/[!]+$/, "")}<small>${player.hp}/${maxHp()}</small>`;
  hearts && el.classList.add("heart");
  $("hitLog").prepend(el), hitLogRows.unshift({ el, t: performance.now() });
  for (; hitLogRows.length > 5;) hitLogRows.pop().el.remove();
}
function updateHitLog() {
  const now = performance.now();
  for (let i = hitLogRows.length - 1; i >= 0; i--) { const r = hitLogRows[i], age = now - r.t; age > 7e3 ? (r.el.remove(), hitLogRows.splice(i, 1)) : r.el.style.opacity = age > 5e3 ? (1 - (age - 5e3) / 2e3).toFixed(2) : ""; }
  $("hitLog").hidden = state !== "playing" && state !== "paused" && state !== "ready";
}
function clearHitLog() { for (const r of hitLogRows) r.el.remove(); hitLogRows.length = 0; }
function crash() {
  ramTime = rollTime = shieldTime = stormTime = cloakTime = 0, player.rollFx = 0, shieldMesh.visible = !1, state = "dying", dieTimer = 1.6, shake = .6, clearInput(), CG.gameplayStop(), explode(player.x, player.y, player.z, 1.2), Sound.sfxBoom(), hitStop(.7, .3), $("btnPause").classList.add("hidden"), $("btnFire").classList.add("hidden"), $("btnAds").classList.add("hidden"), $("weaponBtns").classList.add("hidden"), $("thrBtns").classList.add("hidden"), $("flt").classList.add("hidden"), $("stallWarn").hidden = !0, $("btnSpecial").classList.add("hidden"), specialHudKey = "off", $("warn").classList.add("hidden"), $("mslWarn").hidden = !0, $("lowHp").classList.remove("on"), $("bossWarn").classList.add("hidden"), hideTip()
}

function showOver() {
  state = "over", setHud(!1);
  const mr = bankMastery();
  $("finalMastery").textContent = masteryLine(mr), $("finalMastery").classList.toggle("up", !!mr && mr.after > mr.before);
  const sc = scoreNow(),
    isNew = !runCheckpoint && sc > best;
  if (isNew) {
    const had = best > 0;
    best = sc, Store.set("best", best), had && CG.happytime()
  }
  const earned = runCoins() - runCoinsGiven;
  earned > 0 && (runCoinsGiven += earned, garage.coins += earned, saveGarage()), $("finalScore").textContent = sc, $("finalTime").textContent = Math.floor(gameTime) + "s", $("finalKills").textContent = kills, $("finalBosses").textContent = stage + "-" + Math.max(1, wave), overShownAt = performance.now(), $("finalBest").textContent = best, $("finalCoins").textContent = runCoins(), $("finalCoinTotal").textContent = garage.coins, $("newBest").classList.toggle("hidden", !isNew), $("titanBadge").classList.toggle("hidden", !titanSlain), $("aceBadge").classList.toggle("hidden", !aceSlain), $("carrierBadge").classList.toggle("hidden", !carrierSunk), $("btnRevive").classList.add("hidden"), $("cpNote").classList.toggle("hidden", !runCheckpoint);
  const retry = !runCleared && (runReached || runCheckpoint);
  $("overTitle").textContent = runCleared ? "MISSION COMPLETE" : "SORTIE COMPLETE", $("over").classList.toggle("cleared", runCleared), $("clearBadge").classList.toggle("hidden", !runCleared), runCleared && ($("finalBosses").textContent = "\u2605 5");
  $("btnRetryCp").classList.toggle("hidden", !retry), retry && ($("btnRetryCp").innerHTML = "&#8635; RETRY S" + retry + " " + CP_BOSS[retry]), $("btnRevive").innerHTML = '<span class="adTag">AD</span>CONTINUE', setOverButtons(!0), runCleared && $("btnRevive").classList.add("hidden"), showOnly("over"), runCleared ? Sound.sfxFanfare(!0) : Sound.sfxOver()
}

function setOverButtons(on) {
  for (const id of ["btnRevive", "btnAgain", "btnOverGarage", "btnRetryCp"]) $(id).disabled = !on
}

function revive() {
  revived = !0;
  for (const b of bots) dist3(b, player) < 90 && (explode(b.x, b.y, b.z, .6), removeBot(b), b.dead = !0);
  bots = bots.filter(b => !b.dead), bullets = bullets.filter(b => !b.enemy);
  for (const m of missiles) m.enemy && removeMissile(m);
  missiles = missiles.filter(m => !m.dead), Object.assign(player, {
    x: clamp(player.x, -MAP + 20, MAP - 20),
    z: clamp(player.z, -MAP + 20, MAP - 20),
    y: ALT,
    p: 0,
    roll: 0,
    hp: maxHp(),
    ammo: Math.max(player.ammo, startAmmo()),
    missiles: Math.max(player.missiles, startMissiles()),
    flares: Math.max(player.flares, startFlares()),
    invul: 2.5,
    ve: 1,
    stall: !1,
    alive: !0
  }), player.mesh.visible = !0, snapCamera(), botSpawnCd = 3, Sound.sfxRevive(), enterReady()
}
const coinHtml = n => '<span class="coin"></span>' + n,
  hex = n => "#" + n.toString(16).padStart(6, "0");

function renderGarage() {
  $("gCoins").textContent = garage.coins, renderParts(), renderFleet(), $("upList").innerHTML = UPGRADES.map(u => {
    const lv = garage.lv[u.id],
      maxed = lv >= u.max,
      cost = UP_COST[lv],
      pips = Array.from({
        length: u.max
      }, (_, i) => `<i class="${i<lv?"on":""}"></i>`).join("");
    return `<div class="upRow"><div class="upTxt"><b>${u.name}</b><small>${u.desc}</small><span class="pips">${pips}</span></div><button class="btn buy" id="buy-${u.id}" data-up="${u.id}"${maxed||garage.coins<cost?" disabled":""}>${maxed?"MAX":coinHtml(cost)}</button></div>`
  }).join(""), $("paintList").innerHTML = PAINTS.map(p => {
    const own = garage.paints.includes(p.id),
      sel = garage.paint === p.id;
    return `<button class="swatch${sel?" sel":""}" id="paint-${p.id}" data-paint="${p.id}"${!own&&garage.coins<p.cost?" disabled":""}><span class="sw" style="background:linear-gradient(135deg,${hex(p.body)} 50%,${hex(p.wing)} 50%)"></span><span class="nm">${p.name}</span><span class="pc">${sel?"ON":own?"USE":coinHtml(p.cost)}</span></button>`
  }).join("")
}

function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id),
    lv = garage.lv[id];
  !u || lv >= u.max || garage.coins < UP_COST[lv] || (garage.coins -= UP_COST[lv], garage.lv[id] = lv + 1, saveGarage(), Sound.sfxAmmo(), applyLook(), renderGarage(), toast(`${u.name} upgraded to LV ${lv+1}`))
}

function choosePlane(id) {
  const p = PLANES.find(x => x.id === id);
  if (p) {
    if (!garage.planes.includes(id)) {
      if (p.cost === null || garage.coins < p.cost) return;
      garage.coins -= p.cost, garage.planes.push(id), toast(`${p.name} unlocked`)
    }
    garage.plane = id, saveGarage(), Sound.sfxHeart(), applyLook(), renderGarage()
  }
}

function choosePaint(id) {
  const p = PAINTS.find(x => x.id === id);
  if (p) {
    if (!garage.paints.includes(id)) {
      if (garage.coins < p.cost) return;
      garage.coins -= p.cost, garage.paints.push(id), toast(`${p.name} paint unlocked`)
    }
    garage.paint = id, saveGarage(), Sound.sfxHeart(), applyLook(), renderGarage()
  }
}
$("garage").addEventListener("click", e => {
  const b = e.target.closest("button[data-up],button[data-paint],button[data-plane]");
  !b || b.disabled || state !== "garage" || (Sound.init(), b.dataset.up ? requestPurchase("upgrade", b.dataset.up) : b.dataset.plane ? requestPurchase("plane", b.dataset.plane) : requestPurchase("paint", b.dataset.paint))
});

function renderDaily() {
  const d = garage.daily,
    can = canClaimDaily();
  $("dailyList").innerHTML = DAILY.map((r, i) => {
    const done = i < d.day,
      today = i === d.day && can,
      what = r.plane ? garage.planes.includes(r.plane) ? coinHtml(r.coins) : "FALCON X" : coinHtml(r.coins);
    return `<div class="dTile${done?" done":""}${today?" today":""}${r.plane?" big":""}"><b>DAY ${i+1}</b><span>${what}</span>${done?"<i>&#10003;</i>":""}</div>`
  }).join(""), $("btnClaim").disabled = !can, $("btnClaim").textContent = can ? "CLAIM" : "COME BACK TOMORROW"
}

function claimDaily() {
  if (state !== "daily" || !canClaimDaily()) return;
  const r = DAILY[garage.daily.day];
  r.plane && !garage.planes.includes(r.plane) ? (garage.planes.push(r.plane), toast("FALCON X unlocked! Equip it in the GARAGE")) : (garage.coins += r.coins, toast(`+${r.coins} coins`)), garage.daily = {
    day: (garage.daily.day + 1) % 7,
    last: todayStr()
  }, saveGarage(), Sound.sfxRevive(), renderDaily(), garage.daily.day === 0 && $("dailyList").querySelectorAll(".dTile").forEach(t => t.classList.add("done"))
}
let time = 0;

function turnToward(e, desired, rate, dt) {
  const d = wrapA(desired - e.a),
    step = clamp(d, -rate * dt, rate * dt);
  e.a = wrapA(e.a + step), e.roll = lerp(e.roll, clamp(d * 1.3, -.85, .85), Math.min(1, dt * 6))
}

const joyR = () => Math.max(52, Math.min(window.innerWidth, window.innerHeight) * .19);
const softDz = (v, dz) => Math.abs(v) <= dz ? 0 : Math.sign(v) * (Math.abs(v) - dz) / (1 - dz);
function readSteer() {
  let x = 0,
    y = 0;
  if (input.left || input.right || input.up || input.down) x = (input.right ? 1 : 0) - (input.left ? 1 : 0), y = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  else if (input.touchId !== null) {
    const R = joyR();
    let dx = input.touchX - input.touchX0, dy = input.touchY - input.touchY0;
    const d = Math.hypot(dx, dy);
    d > R && (input.touchX0 += dx * (1 - R / d), input.touchY0 += dy * (1 - R / d), dx *= R / d, dy *= R / d);
    x = softDz(dx / R, .06), y = softDz(-dy / R, .06)
  } else if (input.mouseActive && input.pointerMode !== "touch") {
    const w = window.innerWidth,
      h = window.innerHeight;
    x = clamp((input.mouseX - w / 2) / (w * .36), -1, 1), y = clamp(-(input.mouseY - h / 2) / (h * .36), -1, 1), x = softDz(x, .05), y = softDz(y, .07)
  }
  steerNow = x, climbNow = y
}

function playerMissile() {
  if (state !== "playing" || player.mslCd > 0) return;
  if (player.missiles <= 0) {
    Sound.sfxEmpty(), toast("No missiles! Red boxes have more");
    return
  }
  const full = targetables().filter(t => !t.dead && t.lock >= 1).sort((a, b) => dist3(a, player) - dist3(b, player)),
    src = rearView ? { ...player, a: player.a + Math.PI, p: -(player.p || 0) } : player;   // tail gunner: fire aft
  if (full.length) {
    for (let i = 0; i < 1; i++) {
      const sd = (i % 2 ? 1 : -1) * (1.8 + Math.floor(i / 2) * .9),
        ox = -Math.sin(player.a) * sd,
        oz = Math.cos(player.a) * sd,
        m = launchMissile({
          ...src,
          x: player.x + ox,
          y: player.y - 1.2,
          z: player.z + oz,
          a: src.a + (i % 2 ? 1 : -1) * (.12 + Math.floor(i / 2) * .12),
          p: (src.p || 0) + .1
        }, !1);
      m.target = full[i], m.sure = !0, m.life = 9, m.turn = 10, full[i].lock = 0
    }
    player.missiles -= 1, Sound.sfxLock(), toast("LOCKED \xB7 GUARANTEED HIT")
  } else {
    const best2 = aiming() ? targetables().filter(t => !t.dead && t.lock > 0).sort((a, b) => b.lock - a.lock)[0] : null;
    player.missiles--;
    const m = launchMissile(src, !1);
    best2 && (m.target = best2, m.turn = 3.2 + best2.lock * 6, best2.lock = 0)
  }
  player.mslCd = .8, updateHud(!0)
}

function playerFlare() {
  if (!(state !== "playing" || player.flareCd > 0)) {
    if (player.flares <= 0) {
      Sound.sfxEmpty(), toast("No flares left");
      return
    }
    player.flares--, player.flareCd = 1, dropFlares(), updateHud(!0)
  }
}

// v8 PRO flight model: bank-to-turn, energy (speed) management, stall, boost with heat
const ctl = { steer: 1, aim: 1 };
const FLT = { ROLL: 3.2, LEVEL: 5, BANK: 1.35, PITCH: 1.05, CRUISE: 1, BOOST: 1.55, BRAKE: .62, GRAV: .36, BLEED: .15, STALL: .5, RECOVER: .7, HEAT_UP: .3, HEAT_DN: .22 };
let fltCache = "", stallSfxT = 0;
// the reactor vent blasts hot air straight up once the lid is open: an updraft that carries you out
function dnUpdraft() {
  if (!dnArena || !dnState || !dnState.lidOpen) return !1;
  const l = dnLocal(player);
  return l.x > DN_SHAFT.x0 - 10 && l.x < DN_SHAFT.x1 + 10 && l.z > DN_SHAFT.z0 - 10 && l.z < DN_SHAFT.z1 + 10 && l.y > -DN.DECK && l.y < DN.TOP + 60;
}
function updateFlightHud() {
  const k = Math.round(playerSpeed() * 18), ve = player.ve || 1,
    mode = player.stall ? "STALL" : player.ovh ? "OVERHEAT" : player.boosting ? "BOOST" : player.braking ? "BRAKE" : "CRUISE",
    key = k + "|" + mode + "|" + Math.round((player.heat || 0) * 40) + "|" + Math.round(ve * 40);
  if (key === fltCache) return;
  fltCache = key;
  $("fltSpd").textContent = k, $("fltMode").textContent = mode, $("flt").dataset.mode = mode.toLowerCase();
  $("fltSpdBar").style.width = (clamp(ve / 1.8, 0, 1) * 100).toFixed(1) + "%";
  $("fltHeat").style.width = ((player.heat || 0) * 100).toFixed(1) + "%", $("fltHeatBar").classList.toggle("hot", !!player.ovh);
  $("btnBoost").classList.toggle("hot", !!player.ovh);
}
// below ALT_MIN you are skimming the water; touch it and you lose a whole heart and skip back up
const SEA_Y = 1.6;
let pullUpT = 0;
function seaCheck(dt) {
  pullUpT -= dt;
  if (state !== "playing") return;
  if (player.y < ALT_MIN - 1 && player.p < 0 && pullUpT <= 0) pullUpT = 1.5, toast("PULL UP!"), Sound.tone(700, .1, "square", .06), Sound.tone(700, .1, "square", .06, null, .15);
  if (player.y > SEA_Y + .05) return;
  for (let i = 0; i < 30; i++) addPart(player.x + rand(-3, 3), .6, player.z + rand(-3, 3), rand(-8, 8), rand(6, 18), rand(-8, 8), rand(.5, 1), rand(.5, 1.1), i % 2 ? 16777215 : 10477823, 0, 22);
  shockwave(player.x, .8, player.z, 12, 16777215, .45), Sound.noise(.5, .35, 900), Sound.tone(120, .4, "sine", .2, 50);
  player.invul <= 0 && !(shieldTime > 0) ? damage(!0, themeNow === 1 ? "GROUND!" : themeNow === 4 ? "CLOUD SEA!" : "SPLASH!") : shieldTime > 0 && popup(player.x, player.y + 2, player.z, "SHIELD");
  player.y = ALT_MIN + 5, player.p = .35, player.prS = 0, player.ve = Math.max(player.ve || 1, .9), player.stall = !1;
}
function updatePlayer(dt) {
  const tr = turnRate(),
    outside = Math.abs(player.x) > MAP || Math.abs(player.z) > MAP,
    space = isSpace(),
    draft = dnUpdraft();
  readSteer();
  const sens = (aiming() ? .5 * ctl.aim : 1) * ctl.steer;
  state === "playing" && gainXp(dt * .5);
  player.ve == null && (player.ve = 1, player.heat = 0);
  // ---- throttle ----
  const wantBoost = (input.boost || input.tBoost) && state === "playing", wantBrake = (input.brake || input.tBrake) && state === "playing";
  const wasBoost = player.boosting;
  player.boosting = wantBoost && !player.ovh, player.braking = wantBrake && !player.boosting, player.boosting && !wasBoost && Sound.sfxBoost();
  if (player.boosting) {
    player.heat = Math.min(1, player.heat + FLT.HEAT_UP * (1 - .35 * planeTier()) * dt);
    player.heat >= 1 && (player.ovh = !0, player.boosting = !1, toast("ENGINE OVERHEAT \xB7 BOOST OFFLINE"), Sound.sfxEmpty());
  } else player.heat = Math.max(0, player.heat - FLT.HEAT_DN * dt * (player.braking ? 1.4 : 1)), player.ovh && player.heat < .3 && (player.ovh = !1, toast("BOOST READY"));
  // ---- roll (bank) ----
  const keyIn = input.left || input.right || input.up || input.down, sk = Math.min(1, dt * (keyIn ? 12 : 30)),
    expo = v => Math.sign(v) * (.3 * Math.abs(v) + .7 * v * v);
  player.sx = lerp(player.sx || 0, expo(steerNow), sk), player.sy = lerp(player.sy || 0, expo(climbNow), sk);
  Math.abs(player.sx) < .002 && (player.sx = 0), Math.abs(player.sy) < .002 && (player.sy = 0);
  let x = player.sx, y = player.sy;
  const auth = player.stall ? .35 : 1;
  if (outside) {
    const want = wrapA(Math.atan2(-player.z, -player.x) - player.a);
    x = clamp(want * 2 - player.roll, -1, 1), y = 0;
  }
  // stick = bank angle: let go and the wings level at once (no leftover input)
  const tBank = x * FLT.BANK * sens, rr = (Math.abs(x) > .03 ? FLT.ROLL : FLT.LEVEL) * auth;
  player.roll += clamp(tBank - player.roll, -rr * dt, rr * dt);
  // the turn follows the stick: let go and the heading stops changing at once (wings level visually)
  const eb = Math.sign(player.roll) * Math.min(Math.abs(player.roll), Math.abs(tBank)) * (Math.sign(tBank) === Math.sign(player.roll) ? 1 : 0),
    sb = Math.sin(eb), cb = Math.cos(player.roll);
  // ---- turn: bank angle x corner speed; pulling while banked tightens it ----
  const ve = player.ve,
    corner = ve < .8 ? Math.max(.35, ve / .8) : ve > 1.1 ? 1 / (1 + (ve - 1.1) * .9) : 1,
    pull = clamp(1 + .6 * y * Math.abs(sb), .5, 1.6),
    yawT = tr * .86 * sb * corner * pull * (player.stall ? .4 : 1) * (aiming() ? .65 : 1),
    yaw = player.yawS = lerp(player.yawS || 0, yawT, Math.min(1, dt * 14));
  player.a = wrapA(player.a + yaw * dt);
  // ---- pitch: a rate, split by bank (a banked pull turns instead of climbing) ----
  const pmax = space || dnArena ? 1.15 : .85;
  // stick = nose attitude: let go and the nose returns to level
  // stick = pitch RATE: let go and the nose stays where it points (no snap back)
  let pr = y * FLT.PITCH * sens * auth * (.25 + .75 * Math.max(0, cb));
  player.stall && !space && (pr = Math.min(pr, 0) - 1.6 * clamp(player.p + .75, 0, 2));
  player.prS = lerp(player.prS || 0, pr, Math.min(1, dt * 14)), player.p = clamp(player.p + player.prS * dt, -pmax, pmax);
  space && player.y <= ALT_MIN + 1 && player.p < 0 && (player.p = lerp(player.p, 0, Math.min(1, dt * 8))), player.y >= ALT_MAX - 1 && player.p > 0 && (player.p = lerp(player.p, 0, Math.min(1, dt * 8)));
  // ---- energy: thrust toward the throttle setting, gravity on climbs/dives, bleed in hard turns ----
  const tgt = player.boosting ? FLT.BOOST : player.braking ? FLT.BRAKE : FLT.CRUISE,
    eng = 1 + .08 * garage.lv.engine,
    thrust = (tgt - ve) * (tgt > ve ? (player.boosting ? 1.15 : .7) * eng : .9),
    tf = Math.abs(yaw) / Math.max(.01, tr);
  player.ve = clamp(ve + (thrust - (space || draft ? -(draft ? .5 : 0) : FLT.GRAV * Math.sin(player.p)) - FLT.BLEED * tf * tf) * dt, .3, 1.8);
  // ---- stall ----
  if (!space && !draft && state === "playing") {
    if (!player.stall && player.ve < FLT.STALL) player.stall = !0, toast("STALL \xB7 NOSE DOWN TO RECOVER"), Sound.tone && Sound.tone(140, .35, "sawtooth", .06, 90);
    else if (player.stall && player.ve > FLT.RECOVER) player.stall = !1, popup(player.x, player.y + 3, player.z, "RECOVERED");
  } else player.stall = !1, space && (player.ve = Math.max(player.ve, .55));
  player.stall && (shake = Math.max(shake, .05), stallSfxT -= dt, stallSfxT <= 0 && Sound.tone && (Sound.tone(220, .12, "square", .035, 180), stallSfxT = .45));
  $("stallWarn").hidden = !player.stall;
  // ---- move ----
  const spd = playerSpeed(), cp = Math.cos(player.p);
  player.x += Math.cos(player.a) * cp * spd * dt, player.z += Math.sin(player.a) * cp * spd * dt, player.y = clamp(player.y + (Math.sin(player.p) * spd + (draft ? 14 : 0)) * dt, space ? ALT_MIN : SEA_Y, ALT_MAX), space || seaCheck(dt), updateFlightHud(), $("warn").classList.toggle("hidden", !outside), player.invul > 0 && (player.invul -= dt), player.fireCd -= dt, player.mslCd -= dt, player.flareCd -= dt, emptyToastT -= dt, emptySfxT -= dt, (isBeamPlane() ? updateBeam(dt) : (hideBeam(), firing() && player.fireCd <= 0 && (stormTime > 0 ? (pFire(), player.fireCd = fireGap() / 2.5, Sound.sfxShoot(), muzzleFlash()) : player.ammo > 0 ? (pFire(), player.ammo--, player.fireCd = fireGap(), Sound.sfxShoot(), updateHud(!0), muzzleFlash()) : (player.fireCd = .15, emptySfxT <= 0 && (Sound.sfxEmpty(), emptySfxT = .35), emptyToastT <= 0 && (toast("Out of ammo! Grab the yellow boxes"), emptyToastT = 4)))))
}
const attackLimit = () => dirPhase === "wave" && wtype === "survive" ? 4 : lvT < 90 ? 2 : 3;

function initEnemyTactics(b) {
  b.phase = "orbit", b.phaseTime = rand(2, 5), b.passTime = 0, b.attackSpent = !1, b.approach = ["front", "left", "right"][Math.floor(Math.random() * 3)], b.orbitSide = b.approach === "left" ? -1 : b.approach === "right" ? 1 : Math.random() < .5 ? -1 : 1, b.standoff = rand(65, 100), b.altOffset = rand(-12, 12), b.orbitAge = 0
}

function enemyAttackSpent(b) {
  if (b.phase === "retreat") return;
  b.phase = "retreat", b.phaseTime = rand(3.5, 5.5), b.attackSpent = !1, b.specialCharge = 0, b.ramTime = 0, b.escapeHeading = b.a + b.orbitSide * rand(.5, 1.05);
  const px = b.x + Math.cos(b.escapeHeading) * 80,
    pz = b.z + Math.sin(b.escapeHeading) * 80;
  b.escapeX = clamp(px, -MAP + 20, MAP - 20), b.escapeZ = clamp(pz, -MAP + 20, MAP - 20)
}

function allocateAttackSlots() {
  if (!player.alive) return;
  let slots = attackLimit() - bots.filter(b => !b.dead && b.phase === "attack").length;
  const waiting = bots.filter(b => !b.dead && b.phase === "orbit" && b.phaseTime <= 0 && dist3(b, player) < 155).sort((a, b) => b.orbitAge - a.orbitAge);
  for (const b of waiting) {
    if (slots <= 0) break;
    (Math.cos(player.a) * (b.x - player.x) + Math.sin(player.a) * (b.z - player.z)) / Math.max(1, Math.hypot(b.x - player.x, b.z - player.z)) < -.15 && b.orbitAge < 14 || (b.phase = "attack", b.passTime = rand(5, 8), b.attackSpent = !1, b.orbitAge = 0, slots--)
  }
}

function updateBots(dt, hostile) {
  const ps = playerSpeed(),
    pf = fwdOf(player),
    psBase = cruiseSpeed() * Math.min(1, player.ve || 1) / (ramTime > 0 ? 1.65 : 1);
  for (const b of bots) b.phase || initEnemyTactics(b);
  hostile && allocateAttackSlots();
  for (const b of bots) {
    if (b.dead) continue;
    if (b.bomber && !(b.stun > 0)) {
      updateBomber(b, dt, hostile);
      continue
    }
    if (b.stun > 0) {
      b.stun -= dt;
      const bs0 = botSpeed() * b.spd * .45,
        cp0 = Math.cos(b.p);
      b.roll += dt * 5, b.x += Math.cos(b.a) * cp0 * bs0 * dt, b.z += Math.sin(b.a) * cp0 * bs0 * dt, Math.random() < dt * 12 && addPart(b.x + rand(-1.5, 1.5), b.y + rand(-1, 1), b.z + rand(-1.5, 1.5), 0, rand(1, 3), 0, .3, .35, Math.random() < .5 ? 11967999 : 6941439, .4), b.stun <= 0 && (b.roll = 0);
      continue
    }
    let bs = botSpeed() * b.spd;
    const dx = player.x - b.x,
      dy = player.y - b.y,
      dz = player.z - b.z,
      dh = Math.hypot(dx, dz),
      d = Math.hypot(dh, dy);
    b.fireCd -= dt, b.mslCd -= dt, b.phaseTime -= dt;
    let tx, tz, ty = player.y,
      desired;
    if (!hostile || !player.alive) tx = b.x + Math.cos(b.a) * 30, tz = b.z + Math.sin(b.a) * 30, ty = b.y;
    else if (b.phase === "retreat") tx = b.escapeX, tz = b.escapeZ, ty = clampAlt(player.y + b.altOffset), bs = Math.max(bs, psBase * 1.1), (b.phaseTime <= 0 || Math.hypot(tx - b.x, tz - b.z) < 12) && initEnemyTactics(b);
    else if (b.phase === "orbit") {
      b.orbitAge += dt, b.specialCd = Math.max(0, (b.specialCd || 0) - dt);
      const ahead = b.approach === "front" ? b.standoff : b.standoff * .55,
        side = b.orbitSide * (b.approach === "front" ? 38 : b.standoff * .8),
        sway = Math.sin(time * .35 + b.side * 3) * 12;
      tx = player.x + pf[0] * ahead - pf[2] * (side + sway), tz = player.z + pf[2] * ahead + pf[0] * (side + sway), ty = clampAlt(player.y + b.altOffset), bs = Math.max(bs, psBase * 1.05), Math.hypot(tx - b.x, tz - b.z) < 18 && (tx += Math.cos(b.a + b.orbitSide) * 30, tz += Math.sin(b.a + b.orbitSide) * 30)
    } else {
      b.passTime -= dt, updateEnemySpecial(b, dt, d, !0), b.attackSpent && !(b.ramTime > 0) && enemyAttackSpent(b), b.phase === "attack" && (b.passTime <= 0 && !(b.ramTime > 0) || d < 11 && !(b.ramTime > 0)) && enemyAttackSpent(b);
      const lead = d / (bs + 30) * .45;
      tx = player.x + pf[0] * ps * lead, tz = player.z + pf[2] * ps * lead, ty = player.y + pf[1] * ps * lead, b.ability === "rear" && d < 65 && (tx = player.x + pf[0] * 70, tz = player.z + pf[2] * 70, ty = player.y), b.phase === "retreat" && (tx = b.escapeX, tz = b.escapeZ, ty = clampAlt(player.y + b.altOffset)), b.ramTime > 0 && (bs *= 1.6)
    }
    if (tx = clamp(tx, -MAP + 15, MAP - 15), tz = clamp(tz, -MAP + 15, MAP - 15), desired = Math.atan2(tz - b.z, tx - b.x), b.phase !== "attack") {
      let sx = 0,
        sz = 0;
      for (const other of bots) {
        if (other === b || other.dead) continue;
        const ox = b.x - other.x,
          oz = b.z - other.z,
          od = Math.hypot(ox, oz);
        od > 0 && od < 14 && (sx += ox / od * (14 - od), sz += oz / od * (14 - od))
      }
      desired = Math.atan2(Math.sin(desired) + sz * .14, Math.cos(desired) + sx * .14), d < 28 && (desired = Math.atan2(b.z - player.z, b.x - player.x))
    }
    const av = obstAvoid(b);
    av && (desired = wrapA(b.a + av.turn), b.avoidUp = .6);
    Math.abs(b.x) > MAP - 6 || Math.abs(b.z) > MAP - 6 ? desired = Math.atan2(-b.z, -b.x) : b.ramTime > 0 && (desired = b.ramHeading), turnToward(b, desired, b.heavy ? 1.5 : 2, dt);
    const pl = isSpace() || dnArena ? 1 : .55;
    let pitch = clamp(Math.atan2(ty - b.y, Math.max(1, Math.hypot(tx - b.x, tz - b.z))), -pl, pl);
    b.avoidUp > 0 && (pitch = Math.max(pitch, .45), b.avoidUp -= dt);
    b.y <= ALT_MIN + 1 && pitch < 0 && (pitch = 0), b.y >= ALT_MAX - 1 && pitch > 0 && (pitch = 0), b.p = lerp(b.p, pitch, Math.min(1, dt * 2.5));
    const cp = Math.cos(b.p);
    if (b.x += Math.cos(b.a) * cp * bs * dt, b.z += Math.sin(b.a) * cp * bs * dt, b.y = clamp(b.y + Math.sin(b.p) * bs * dt, ALT_MIN, ALT_MAX), hostile && player.alive && b.phase === "attack" && !b.attackSpent && !(b.specialCharge > 0) && !(b.ramTime > 0)) {
      if (b.kind === "ace" && !b.airframe && b.mslCd <= 0 && d > 20 && d < 90) launchMissile(b, !0), b.mslCd = rand(9, 13), enemyAttackSpent(b);
      else if (d < 50 && b.fireCd <= 0) {
        const f = fwdOf(b);
        Math.acos(clamp((dx * f[0] + dy * f[1] + dz * f[2]) / Math.max(d, .001), -1, 1)) < .22 && (fire(b, !0), Sound.sfxEnemyShoot(b), b.fireCd = rand(2.5, 4), enemyAttackSpent(b))
      }
    }
    if (b.trailT -= dt, b.trailT <= 0) {
      const f = fwdOf(b);
      b.trailT = .09, addPart(b.x - f[0] * 2.4 * b.scale, b.y - f[1] * 2.4 * b.scale, b.z - f[2] * 2.4 * b.scale, 0, .5, 0, .5, .45 * b.scale, 16777215, .8)
    }
  }
  for (const b of bots) !keepBot(b) && Math.hypot(b.x - player.x, b.z - player.z) > (dnArena ? 1400 : 230) && (removeBot(b), b.dead = !0);
  bots = bots.filter(b => !b.dead)
}

function hitBot(b, dmg) {
  if (!b.dead) {
    if (turrets.includes(b)) {
      hitTurret(b, dmg);
      return
    }
    if (b.hpMax == null && (b.hpMax = b.hp), b.hp -= dmg, b.hp <= 0) {
      killBot(b);
      return
    }
    for (let i = 0; i < 6; i++) addPart(b.x, b.y, b.z, rand(-6, 6), rand(-3, 6), rand(-6, 6), .35, .4, i % 2 ? 16769610 : 16777215);
    hitFx(b, dmg)
  }
}

function killBot(b) {
  b.dead || (b.dead = !0, kills++, gainXp(12), runPlaneKills++, awardKill(b.x, b.y, b.z, b.pts), waveKill(b), explode(b.x, b.y, b.z, b.heavy ? 1.6 : 1), dist3(b, player) < 60 && (shake = Math.max(shake, .16)), removeBot(b), Sound.sfxBoom(), b.kind === "ace" ? spawnPickup("missile", b.x, b.z, clampAlt(b.y)) : (b.heavy || Math.random() < .45) && spawnPickup("ammo", b.x, b.z, clampAlt(b.y)), updateHud(!0))
}

function hitTurret(t, dmg) {
  if (!t.dead) {
    if (t.sCore) {
      serpentCoreHit(t, dmg);
      return
    }
    if (t.core) {
      hitReactor(t, dmg);
      return
    }
    t.hpMax == null && (t.hpMax = t.hp), t.hp -= dmg;
    for (let i = 0; i < 6; i++) addPart(t.x, t.y, t.z, rand(-6, 6), rand(0, 8), rand(-6, 6), .35, .4, i % 2 ? 16769610 : 16777215);
    if (t.hp > 0) {
      hitFx(t, dmg);
      return
    }
    t.dead = !0, kills++, awardKill(t.x, t.y, t.z, t.pts), t.carrier || waveKill(t), explode(t.x, t.y, t.z, 1.4), Sound.sfxBoom(), wreckTurret(t), spawnPickup("ammo", t.x, t.z, clampAlt(t.y + 12)), t.carrier && carrierPartDown(), updateHud(!0)
  }
}

function wreckTurret(t) {
  t.mesh.userData.head.visible = !1, t.mesh.children[0].material = M(4475477)
}

function updateTurrets(dt) {
  for (const t of turrets) {
    if (t.dead || t.core || t.sCore) continue;
    const dx = player.x - t.x,
      dy = player.y - t.y,
      dz = player.z - t.z,
      dh = Math.hypot(dx, dz),
      {
        head,
        barrels
      } = t.mesh.userData;
    if (dh < 110 && (head.rotation.y = -Math.atan2(dz, dx), barrels.rotation.z = -(Math.PI / 2 - Math.atan2(dy, Math.max(dh, 1)))), t.cd -= dt, t.stun > 0) {
      t.stun -= dt, Math.random() < dt * 10 && addPart(t.x, t.y + 1, t.z, rand(-2, 2), rand(1, 4), rand(-2, 2), .3, .4, 11967999, .4);
      continue
    }
    if (!t.noFlak && state === "playing" && player.alive && !playerHidden() && gameTime > 12 && dh < 80 && dy < 50 && t.cd <= 0) {
      const f = fwdOf(player),
        lead = Math.hypot(dh, dy) / (botSpeed() + 30),
        ps = playerSpeed(),
        aim = {
          x: player.x + f[0] * ps * lead + rand(-2, 2),
          y: player.y + f[1] * ps * lead + rand(-1.5, 1.5),
          z: player.z + f[2] * ps * lead + rand(-2, 2)
        };
      fire({
        x: t.x,
        y: t.y + 1.5,
        z: t.z,
        a: 0,
        p: 0,
        src: t.carrier ? "LEVIATHAN GUN" : "AA GUN",
        dmg: t.carrier ? 1 : ENEMY_DMG.flak
      }, !0, aim), Sound.sfxEnemyShoot(), t.cd = rand(1.8, 2.8) / Math.min(1.8, 1 + lvT / 150)
    }
  }
}

function updateMissiles(dt) {
  let warn = !1;
  for (const m of missiles) {
    if (m.dead) continue;
    m.life -= dt;
    let tgt = m.target && !m.target.dead && (m.target.life === void 0 || m.target.life > 0) ? m.target : null;
    if (m.sure && !tgt) {
      let bd = 150;
      for (const t of targetables()) {
        if (t.dead) continue;
        const d = dist3(t, m);
        d < bd && (bd = d, tgt = t)
      }
      m.target = tgt
    }
    if (tgt && m.sure) {
      m.spd = Math.max(m.spd, 70);
      const tx = tgt.x - m.x,
        ty = tgt.y - m.y,
        tz = tgt.z - m.z,
        tl = Math.hypot(tx, ty, tz) || 1,
        k = Math.min(1, dt * 9);
      let nx = lerp(m.vx / m.spd, tx / tl, k),
        ny = lerp(m.vy / m.spd, ty / tl, k),
        nz = lerp(m.vz / m.spd, tz / tl, k);
      const nl = Math.hypot(nx, ny, nz) || 1;
      m.vx = nx / nl * m.spd, m.vy = ny / nl * m.spd, m.vz = nz / nl * m.spd, (tl < m.spd * dt * 1.5 || m.life < 7.5 && tl < 12) && (m.x = tgt.x - m.vx * dt, m.y = tgt.y - m.vy * dt, m.z = tgt.z - m.vz * dt)
    } else if (tgt) {
      const tx = tgt.x - m.x,
        ty = tgt.y - m.y,
        tz = tgt.z - m.z,
        tl = Math.hypot(tx, ty, tz) || 1,
        nx = m.vx / m.spd + tx / tl * m.turn * dt,
        ny = m.vy / m.spd + ty / tl * m.turn * dt,
        nz = m.vz / m.spd + tz / tl * m.turn * dt,
        nl = Math.hypot(nx, ny, nz) || 1;
      m.vx = nx / nl * m.spd, m.vy = ny / nl * m.spd, m.vz = nz / nl * m.spd
    }
    if (m.x += m.vx * dt, m.y += m.vy * dt, m.z += m.vz * dt, m.trailT -= dt, m.trailT <= 0 && (m.trailT = .03, addPart(m.x - m.vx / m.spd * 1.5, m.y - m.vy / m.spd * 1.5, m.z - m.vz / m.spd * 1.5, 0, .3, 0, m.alien ? .35 : .6, m.alien ? .4 : .4, m.alien || (m.enemy ? 12303304 : 16777215), m.alien ? .9 : 1.2)), m.alien && m.mesh.userData.alien && (m.mesh.userData.alien.ring.rotation.x += dt * 14, m.mesh.userData.alien.halo.scale.setScalar(.62 * (1 + Math.sin(time * 30) * .2))), m.enemy) {
      if (m.target === player && (warn = !0), tgt && tgt !== player && dist3(m, tgt) < 3) {
        explode(m.x, m.y, m.z, .5), removeMissile(m);
        continue
      }
      if (state === "playing" && dist3(m, player) < 2.4) {
        explode(m.x, m.y, m.z, .8), removeMissile(m), damage(!1, null, m.src || "MISSILE", ENEMY_DMG.missile);
        continue
      }
    } else {
      if (tgt && tgt.aceFlare && dist3(m, tgt) < 3) {
        explode(m.x, m.y, m.z, .7), removeMissile(m);
        continue
      }
      for (const t of [...bots, ...turrets])
        if (!t.dead && dist3(m, t) < 3 * (t.scale || 1)) {
          (m.alien ? (explode(m.x, m.y, m.z, 1, m.alien), shockwave(m.x, m.y, m.z, 7, m.alien, .3), Sound.sfxAlienBoom()) : (explode(m.x, m.y, m.z, 1), Sound.sfxBoom())), hitBot(t, m.dmg || 5);
          for (const o of bots) !o.dead && o !== t && dist3(o, m) < 6 && hitBot(o, 2);
          removeMissile(m);
          break
        } if (!m.dead && boss && !boss.dead && !(m.sure && boss.carrier) && bossDist(m) < 1 && (m.alien ? (explode(m.x, m.y, m.z, 1, m.alien), Sound.sfxAlienBoom()) : (explode(m.x, m.y, m.z, 1), Sound.sfxBoom()), hitBoss((m.dmg || 5) * (boss.titan ? m.sure ? 3 : 2 : 1), m), flashReticle("hit"), removeMissile(m)), m.dead) continue
    }(m.life <= 0 || m.y < floorY() + .5) && (m.y < floorY() + .5 && addPart(m.x, .8, m.z, 0, 6, 0, .6, 1, 16777215, 1.5), removeMissile(m))
  }
  missiles = missiles.filter(m => !m.dead), bots = bots.filter(b => !b.dead);
  const w = warn && state === "playing";
  $("mslWarn").hidden = !w, w && (mslWarnT -= dt, mslWarnT <= 0 && (mslWarnT = .45, Sound.tone(1320, .08, "square", .05)));
  for (const d of decoys) d.life -= dt, d.x += d.vx * dt, d.y += d.vy * dt, d.z += d.vz * dt, d.vy -= 4 * dt, Math.random() < .8 && addPart(d.x, d.y, d.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), .35, .7, Math.random() < .5 ? 16769162 : 16752451, .4);
  decoys = decoys.filter(d => d.life > 0)
}

function update(dt) {
  if (time += dt, updateSpace(dt), updateAsteroids(dt), updateObstacles(dt), updateHazards(dt), updateHitFx(dt), (state === "playing" || state === "dying" || state === "over") && updateMines(dt), seaTex.offset.x = (seaTex.offset.x + dt * .004) % 1, state === "title" || state === "garage" || state === "daily" || state === "netmenu" || state === "netend") player.a = wrapA(player.a + dt * .35), player.roll = lerp(player.roll, .35, dt * 3), player.p = 0, player.x += Math.cos(player.a) * 12 * dt, player.z += Math.sin(player.a) * 12 * dt, player.y = ALT + Math.sin(time * 2) * .3;
  else if (state === "ready") player.roll = lerp(player.roll, 0, dt * 4), player.p = lerp(player.p, 0, dt * 4);
  else if (state === "playing") {
    gameTime += dt, updateSpecial(dt), updatePlayer(dt), updateTitanFlow(dt), updateAceFlow(dt), updateCarrierFlow(dt), updateSerpentFlow(dt), botSpawnCd -= dt, updateDirector(dt), updateBots(dt, !playerHidden()), updateTurrets(dt), updateMissiles(dt);
    for (const p of pickups) Math.hypot(p.x - player.x, p.z - player.z) > 240 && (removePickup(p), p.gone = !0);
    pickups = pickups.filter(p => !p.gone), pickups.filter(p => p.type === "ammo").length < 7 && spawnPickup("ammo"), pickups.filter(p => p.type === "missile").length < 2 && spawnPickup("missile"), heartCd -= dt, heartCd <= 0 && (heartCd = 20, player.hp < maxHp() && !pickups.some(p => p.type === "heart") && spawnPickup("heart"));
    for (const p of pickups)
      if (dist3(p, player) < 4 + 5 * run.mag) {
        p.gone = !0, removePickup(p), p.type === "ammo" ? (player.ammo = Math.min(maxAmmo(), player.ammo + ammoBox()), Sound.sfxAmmo(), bumpAmmo(), popup(p.x, p.y, p.z, "+" + ammoBox() + " AMMO")) : p.type === "missile" ? (player.missiles = Math.min(maxMsl(), player.missiles + 2), player.flares = Math.min(maxFlr(), player.flares + 1), Sound.sfxAmmo(), toast("+2 MISSILES  +1 FLARE")) : player.hp < maxHp() ? (player.hp = Math.min(maxHp(), heartTop()), Sound.sfxHeart(), popup(p.x, p.y, p.z, "+1 \u2665", !0)) : (killPts += 500, Sound.sfxHeart(), popup(p.x, p.y, p.z, "FULL HP +500", !0));
        for (let i = 0; i < 16; i++) addPart(p.x, p.y, p.z, rand(-10, 10), rand(-2, 10), rand(-10, 10), .55, .4, p.type === "ammo" ? 16769610 : p.type === "missile" ? 16735324 : 16743068);
        shockwave(p.x, p.y, p.z, 5, p.type === "ammo" ? 16769610 : p.type === "missile" ? 16735324 : 16743068, .35), updateHud(!0)
      } pickups = pickups.filter(p => !p.gone);
    for (const b of bots)
      if (!b.dead && dist3(b, player) < (ramTime > 0 ? 4.8 : 3.4) * b.scale) {
        const hurt = player.invul <= 0 && ramTime <= 0;
        ramTime > 0 && (ramTime = Math.min(ramTime + .5, 4), player.ramChain = (player.ramChain || 0) + 1, player.ramChain > 1 && popup(player.x, player.y + 4, player.z, "RAM CHAIN x" + player.ramChain, !0));
        killBot(b), hurt && damage(!0, b.ramTime > 0 ? "ENEMY RAM" : "COLLISION")
      } if (bots = bots.filter(b => !b.dead), boss && !boss.dead && bossDist(player) < .5 && player.invul <= 0 && (ramTime > 0 ? (hitBoss(8, player), player.invul = .8, shake = .3) : damage(!0, "COLLISION")), updateBoss(dt, !0), updateCombo(dt), updateTips(dt), player.trailT -= dt, player.trailT <= 0) {
      const f = fwdOf(player);
      player.trailT = .05, addPart(player.x - f[0] * 2.6, player.y - f[1] * 2.6, player.z - f[2] * 2.6, 0, .5, 0, .55, .5, 16777215, .8)
    }
  } else if (state === "dying" || state === "over") {
    if (player.alive) {
      const fallT = 1.6 - dieTimer;
      if (player.x += Math.cos(player.a) * 8 * dt, player.z += Math.sin(player.a) * 8 * dt, player.y -= dt * (10 + Math.max(0, fallT) * 40), player.roll += dt * 9, player.p = lerp(player.p, -.9, dt * 2), Math.random() < .5 && addPart(player.x, player.y, player.z, rand(-1, 1), 2, rand(-1, 1), .9, rand(.8, 1.3), 5592426, 1.4), player.y <= floorY() + .8 || isSpace() && fallT > 1.3) {
        player.alive = !1, player.mesh.visible = !1;
        for (let i = 0; i < 30; i++) addPart(player.x, .8, player.z, rand(-7, 7), rand(6, 16), rand(-7, 7), rand(.5, 1), rand(.5, 1), i % 2 ? 16777215 : 10477823)
      }
    }
    state === "dying" && (dieTimer -= dt, dieTimer <= 0 && showOver()), updateBots(dt, !1), updateBoss(dt, !1), updateTurrets(dt), updateMissiles(dt)
  }
  if (state === "playing" || state === "dying" || state === "over") {
    for (const b of bullets)
      if (b.x += b.vx * dt, b.y += b.vy * dt, b.z += b.vz * dt, b.life -= dt, b.y < floorY() + .3 && (b.life = 0), b.enemy) state === "playing" && dist3(b, player) < (b.r || 1.9) + (shieldTime > 0 ? 1.4 : 0) && (shieldTime > 0 ? (b.enemy = !1, b.refl = 1, b.vx *= -1.3, b.vy *= -1.3, b.vz *= -1.3, b.life = 1.4, Sound.tone(1500, .05, "triangle", .05, 2200)) : (b.life = 0, damage(!1, null, b.src || "BULLET", b.dmg || 1)));
      else {
        for (const bot of bots)
          if (!bot.dead && dist3(b, bot) < 2.5 * bot.scale) {
            b.life = 0, hitBot(bot, pDmg(b)), flashReticle("hit");
            break
          } if (b.life > 0) {
          for (const t of turrets)
            if (!t.dead && dist3(b, t) < (t.hitR || 3)) {
              b.life = 0, hitTurret(t, pDmg(b)), flashReticle("hit");
              break
            }
        }
        b.life > 0 && boss && !boss.dead && !(boss.dodgeT > 0) && bossDist(b) < 0 && (b.life = 0, hitBoss(pDmg(b), b), flashReticle("hit"))
      } bullets = bullets.filter(b => b.life > 0), bots = bots.filter(b => !b.dead)
  }
  for (const p of pickups) {
    if (p.t += dt, state === "playing" && (p.magnet && (p.mt = (p.mt || 0) + dt) > .7 || run.mag && dist3(p, player) < 14 + 16 * run.mag)) {
      const dx = player.x - p.x,
        dy = player.y - p.y,
        dz = player.z - p.z,
        dl = Math.hypot(dx, dy, dz) || 1,
        v = Math.max(45, playerSpeed() * 1.6) * dt;
      p.x += dx / dl * Math.min(v, dl), p.y += dy / dl * Math.min(v, dl), p.z += dz / dl * Math.min(v, dl), p.mesh.position.set(p.x, p.y, p.z), Math.random() < .5 && addPart(p.x, p.y, p.z, 0, 0, 0, .35, .5, 16743068, .5)
    }
    p.mesh.userData.inner.rotation.y = p.t * 1.6, p.mesh.userData.inner.position.y = Math.sin(p.t * 3) * .4, p.mesh.userData.ring.scale.setScalar(2.2 + Math.sin(p.t * 4) * .25)
  }
  for (const p of parts) p.life -= dt, p.grav && (p.vy -= p.grav * dt), p.x += p.vx * dt, p.y += p.vy * dt, p.z += p.vz * dt, p.vx *= .96, p.vz *= .96, p.vy *= .96;
  parts = parts.filter(p => p.life > 0), shake > 0 && (shake -= dt), player.mesh.visible = player.alive && adsK < .6 && !(player.invul > 0 && state === "playing" && Math.floor(time * 12) % 2 === 0) && !(cloakTime > 0 && Math.floor(time * 20) % 3 !== 0), shieldMesh.visible && (shieldMesh.position.set(player.x, player.y, player.z), shieldMesh.material.opacity = .16 + Math.sin(time * 9) * .06), orientPlane(player, dt);
  for (const b of bots) orientPlane(b, dt);
  for (const m of missiles) m.hideT > 0 && (m.hideT -= dt) <= 0 && (m.mesh.visible = !0), m.mesh.position.set(m.x, m.y, m.z), m.mesh.rotation.set(0, -Math.atan2(m.vz, m.vx), Math.atan2(m.vy, Math.hypot(m.vx, m.vz)), "YZX");
  (state === "playing" || state === "ready") && updateHud(!1)
}
const _camT = new THREE.Vector3;
let camSnap = !0;
const camPos = new THREE.Vector3(0, ALT + 5, 12),
  camLook = new THREE.Vector3(0, ALT, -20);
let camK = 1,
  camA = -Math.PI / 2,
  camP = 0,
  adsK = 0,
  baseFov = 60,
  fovKick = 1;

function snapCamera() {
  camSnap = !0, player.sx = player.sy = player.yawS = player.prS = 0, camA = player.a, camP = player.p || 0
}

function updateCamera(dt) {
  if (state === "mirror" && netGame === "coop") { coopGunnerCamera(dt); return }
  if (adsK = lerp(adsK, aiming() ? 1 : 0, Math.min(1, dt * 10)), fovKick = lerp(fovKick, state === "playing" && ramTime > 0 ? 1.16 : state === "playing" && player.boosting ? 1.1 : player.braking ? .96 : 1, Math.min(1, dt * 6)), state !== "dying" && state !== "over") {
    const aimA = player.a + (rearView ? Math.PI : 0), lag = wrapA(aimA - camA);
    camA = Math.abs(lag) > 2.2 && rearSwingT <= 0 ? aimA : wrapA(camA + lag * Math.min(1, dt * (rearSwingT > 0 ? 7 : 5.5 + 3 * adsK))), camP = lerp(camP, (rearView ? -1 : 1) * (player.p || 0), Math.min(1, dt * 6));
    const cp = Math.cos(camP * .8),
      spp = Math.sin(camP * .8),
      fx2 = Math.cos(camA) * cp,
      fy = spp,
      fz2 = Math.sin(camA) * cp,
      lx = Math.sin(camA),
      lz = -Math.cos(camA),
      B = lerp(15 * camK * dnCamK, -1.2, adsK),
      L = lerp(5.5 * camK * dnCamK, 0, adsK),
      U = lerp(5.8 * camK * dnCamK, .9, adsK);
    _camT.set(player.x - fx2 * B + lx * L, Math.max(isSpace() ? -1e9 : 2.5, player.y - fy * B + U), player.z - fz2 * B + lz * L);
    camSnap || _camT.distanceTo(camPos) > 40 ? (camPos.copy(_camT), camSnap = !1) : camPos.lerp(_camT, Math.min(1, dt * (adsK > .5 ? 40 : 22)));
    const lf = [Math.cos(camA) * Math.cos(camP), Math.sin(camP), Math.sin(camA) * Math.cos(camP)];
    camLook.set(player.x + lf[0] * 40 + lx * 1.5 * (1 - adsK), player.y + lf[1] * 40 + 1.2 * (1 - adsK), player.z + lf[2] * 40 + lz * 1.5 * (1 - adsK))
  } else camLook.lerp(_v.set(player.x, Math.max(player.y, 1), player.z), Math.min(1, dt * 3));
  launchT > 0 && state !== "dying" && state !== "over" && launchCamera(dt);
  const fov = lerp(baseFov, baseFov * .62, adsK) * fovKick;
  Math.abs(camera.fov - fov) > .05 && (camera.fov = fov, camera.updateProjectionMatrix()), camera.position.copy(camPos), shake > 0 && camera.position.add(_v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * 1.2)), camera.lookAt(camLook), (state === "playing" || state === "ready") && camera.rotateZ(-(player.roll || 0) * (.2 + .35 * adsK));
  const fx = Math.cos(camA),
    fz = Math.sin(camA),
    sy = isSpace() || dnArena ? player.y : 0;
  sun.target.position.set(player.x + fx * 35, sy, player.z + fz * 35), sun.position.set(sun.target.position.x + 30, sy + 90, sun.target.position.z + 25)
}
const reticle = $("reticle"),
  markerBox = $("markers"),
  steerKnob = $("steerKnob"),
  MARKS = [],
  PICKS = [];
for (let i = 0; i < 18; i++) {
  const m = document.createElement("div");
  m.className = "mk", m.innerHTML = "<i><em><u></u></em></i><b></b>", m.hidden = !0, markerBox.appendChild(m), MARKS.push(m)
}
for (let i = 0; i < 10; i++) {
  const q = document.createElement("div");
  q.className = "pk", q.hidden = !0, markerBox.appendChild(q), PICKS.push(q)
}
const _pv = new THREE.Vector3;

function toScreen(x, y, z) {
  return _pv.set(x, y, z).applyMatrix4(camera.matrixWorldInverse), _pv.z > -1 ? null : (_pv.set(x, y, z).project(camera), {
    x: (_pv.x + 1) / 2 * window.innerWidth,
    y: (1 - _pv.y) / 2 * window.innerHeight
  })
}

// ================= v13: first-person COCKPIT while aiming — ANALOG (prop-era) vs HI-TECH (glass HUD) aircraft =================
const COCKPITS = {
  // analog: riveted frame, round dials, reflector gunsight, prop blur
  classic: { type: "analog", frame: "#6b4a2e", edge: "#a8784a", panel: "#3b2a1e", face: "#f3e6c8", ink: "#2a1a10", hud: "#ff9d2e", sight: "ring" },
  swift:   { type: "analog", frame: "#4a5a66", edge: "#8fa4b2", panel: "#2c353d", face: "#eef0e6", ink: "#1a2228", hud: "#ffb03b", sight: "ring2" },
  brick:   { type: "analog", frame: "#4a4f3a", edge: "#7f8660", panel: "#2f3326", face: "#d9d8c0", ink: "#20231a", hud: "#ff8a2e", sight: "heavy", slits: 1 },
  twin:    { type: "analog", frame: "#7a2a2a", edge: "#c86060", panel: "#3a1616", face: "#fff1d6", ink: "#3a1010", hud: "#ffb82e", sight: "twin" },
  // hi-tech: frameless canopy, projected HUD (ladder, tapes), glass MFDs
  falcon:  { type: "tech", hud: "#7dff9a", glass: "#0b1a12", sight: "ladder" },
  lancer:  { type: "tech", hud: "#ff5ce6", glass: "#1a0b1a", sight: "lance" },
  seraph:  { type: "tech", hud: "#ffd24a", glass: "#1a160b", sight: "halo" },
  spectre: { type: "tech", hud: "#3ff0d0", glass: "#051312", sight: "bracket", tint: .18 },
  halo:    { type: "tech", hud: "#6ff7ff", glass: "#0a0618", sight: "hex", neon: 1 }
};
let ckKey = "", ckOn = !1, ckAmt = 0, ckGeo = null;
const ckStyle = () => COCKPITS[planeNow().id] || COCKPITS.classic, ckF = v => (+v).toFixed(1);
function ckSight(st) {
  const c = st.hud, sw = 'stroke="' + c + '" fill="none" stroke-linecap="round"';
  switch (st.sight) {
    case "ring": return `<circle cx="60" cy="60" r="34" ${sw} stroke-width="2.5"/><circle cx="60" cy="60" r="3" fill="${c}"/>` + [0, 90, 180, 270].map(a => `<line x1="60" y1="24" x2="60" y2="36" ${sw} stroke-width="2.5" transform="rotate(${a} 60 60)"/>`).join("");
    case "ring2": return `<circle cx="60" cy="60" r="36" ${sw} stroke-width="2"/><circle cx="60" cy="60" r="20" ${sw} stroke-width="1.5"/><circle cx="60" cy="60" r="2.5" fill="${c}"/>`;
    case "heavy": return `<circle cx="60" cy="60" r="30" ${sw} stroke-width="4"/><line x1="60" y1="14" x2="60" y2="48" ${sw} stroke-width="4"/><line x1="60" y1="72" x2="60" y2="106" ${sw} stroke-width="4"/><line x1="14" y1="60" x2="48" y2="60" ${sw} stroke-width="4"/><line x1="72" y1="60" x2="106" y2="60" ${sw} stroke-width="4"/>`;
    case "twin": return `<circle cx="42" cy="60" r="16" ${sw} stroke-width="2.5"/><circle cx="78" cy="60" r="16" ${sw} stroke-width="2.5"/><circle cx="60" cy="60" r="3" fill="${c}"/>`;
    case "ladder": return `<path d="M50 60 L60 50 L70 60 L60 70 Z" ${sw} stroke-width="2.5"/><line x1="20" y1="60" x2="42" y2="60" ${sw} stroke-width="2.5"/><line x1="78" y1="60" x2="100" y2="60" ${sw} stroke-width="2.5"/>`;
    case "lance": return `<path d="M52 60 L60 40 L68 60 L60 80 Z" ${sw} stroke-width="2.5"/><circle cx="60" cy="60" r="2.5" fill="${c}"/><line x1="24" y1="60" x2="44" y2="60" ${sw} stroke-width="2.5"/><line x1="76" y1="60" x2="96" y2="60" ${sw} stroke-width="2.5"/>`;
    case "halo": return `<path d="M22 64 A40 40 0 0 1 98 64" ${sw} stroke-width="3"/><circle cx="60" cy="60" r="5" ${sw} stroke-width="2"/><circle cx="60" cy="60" r="1.8" fill="${c}"/>`;
    case "bracket": return `<path d="M30 42 V30 H42 M78 30 H90 V42 M90 78 V90 H78 M42 90 H30 V78" ${sw} stroke-width="2.5"/><circle cx="60" cy="60" r="2" fill="${c}"/>`;
    case "prism": return `<path d="M60 26 L80 60 L60 94 L40 60 Z" ${sw} stroke-width="2.2"/><line x1="60" y1="8" x2="60" y2="24" ${sw} stroke-width="2"/><line x1="60" y1="96" x2="60" y2="112" ${sw} stroke-width="2"/><line x1="12" y1="60" x2="36" y2="60" ${sw} stroke-width="2"/><line x1="84" y1="60" x2="108" y2="60" ${sw} stroke-width="2"/><circle cx="60" cy="60" r="3" fill="${c}"/>`;
    case "eye": return `<path d="M14 60 Q60 18 106 60 Q60 102 14 60 Z" ${sw} stroke-width="2.5"/><circle cx="60" cy="60" r="11" ${sw} stroke-width="2.5"/><ellipse cx="60" cy="60" rx="3" ry="9" fill="${c}"/>`;
    case "tri": return `<path d="M60 22 L96 84 L24 84 Z" ${sw} stroke-width="2.5"/><path d="M60 44 L78 74 L42 74 Z" ${sw} stroke-width="1.5" opacity=".6"/><circle cx="60" cy="63" r="2.5" fill="${c}"/>`;
    case "spiral": return `<g class="ckSpin"><path d="M60 60 m0 -6 a6 6 0 1 1 -6 6 a12 12 0 1 1 12 12 a20 20 0 1 1 -20 -20 a30 30 0 1 1 30 30" ${sw} stroke-width="2.2"/></g><circle cx="60" cy="60" r="2.5" fill="${c}"/>`;
    case "hex": return `<g class="ckSpin"><path d="M60 22 L93 41 L93 79 L60 98 L27 79 L27 41 Z" ${sw} stroke-width="2.5"/><path d="M60 34 L82 47 L82 73 L60 86 L38 73 L38 47 Z" stroke="#ff4dd2" fill="none" stroke-width="1.5" stroke-dasharray="4 4"/></g><circle cx="60" cy="60" r="3" fill="${c}"/>`;
  }
  return "";
}
// ---------- ANALOG: riveted greenhouse canopy, dashboard of round dials, reflector gunsight glass, prop blur ----------
function ckAnalog(W, H, st) {
  const m = Math.min(W, H), top = H * .085, panelY = H * (IS_TOUCH ? .8 : .72), pw = Math.max(12, W * (st.slits ? .05 : .03));
  let g = `<defs><radialGradient id="ckVig" cx=".5" cy=".45" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1a0e00" stop-opacity=".55"/></radialGradient>
    <linearGradient id="ckMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${st.edge}"/><stop offset=".25" stop-color="${st.frame}"/><stop offset="1" stop-color="${st.panel}"/></linearGradient>
    <linearGradient id="ckRefl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#bfe8ff" stop-opacity=".06"/></linearGradient></defs>`;
  g += `<rect width="${W}" height="${H}" fill="#ffd9a0" opacity=".06"/><rect width="${W}" height="${H}" fill="url(#ckVig)"/>`;
  // prop blur: a faint spinning disc in front of the nose
  g += `<g transform="translate(${ckF(W / 2)} ${ckF(H * .47)})"><circle r="${ckF(m * .42)}" fill="#fff" opacity=".045"/><circle r="${ckF(m * .42)}" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="3"/><g class="ckProp" opacity=".12"><path d="M0 0 L${ckF(-m * .06)} ${ckF(-m * .41)} Q0 ${ckF(-m * .44)} ${ckF(m * .06)} ${ckF(-m * .41)} Z M0 0 L${ckF(-m * .06)} ${ckF(m * .41)} Q0 ${ckF(m * .44)} ${ckF(m * .06)} ${ckF(m * .41)} Z" fill="#2a1a08"/></g></g>`;
  // canopy: top bow, windscreen side frames, cross bars, rivets
  g += `<path d="M0 0 H${W} V${ckF(top * 1.7)} Q${ckF(W / 2)} ${ckF(top * .3)} 0 ${ckF(top * 1.7)} Z" fill="url(#ckMetal)" stroke="#0008" stroke-width="3"/>`;
  for (const s of [-1, 1]) {
    const X = v => ckF(s < 0 ? v : W - v), x0 = W * .13, x1 = W * .24;
    g += `<path d="M${X(x0)} ${ckF(top)} L${X(x0 + pw)} ${ckF(top)} L${X(x1 + pw)} ${ckF(panelY)} L${X(x1)} ${ckF(panelY)} Z" fill="url(#ckMetal)" stroke="#0008" stroke-width="2"/>`;
    g += `<path d="M${X(0)} ${ckF(H * .42)} L${X(x0 + (x1 - x0) * .42)} ${ckF(H * .4)}" stroke="${st.frame}" stroke-width="${ckF(pw * .7)}"/>`;
    for (let k = 1; k < 7; k++) { const t = k / 7; g += `<circle cx="${X(x0 + (x1 - x0) * t + pw / 2)}" cy="${ckF(top + (panelY - top) * t)}" r="2.4" fill="${st.edge}"/>`; }
    if (st.slits) g += `<path d="M${X(0)} 0 H${X(W * .1)} L${X(W * .17)} ${ckF(panelY)} H${X(0)} Z" fill="${st.frame}" opacity=".94" stroke="#0008" stroke-width="2"/>` + [.28, .48].map(f => `<rect x="${ckF(s < 0 ? W * .015 : W * .925)}" y="${ckF(H * f)}" width="${ckF(W * .06)}" height="${ckF(H * .04)}" rx="3" fill="#000a"/>`).join("");
  }
  for (let k = 0; k < 18; k++) g += `<circle cx="${ckF((W / 18) * (k + .5))}" cy="${ckF(top * .45 + Math.abs(k - 8.5) * top * .07)}" r="2.6" fill="${st.edge}"/>`;
  // reflector gunsight: a tilted glass pane on a post in the middle
  const gw = m * .2, gh = m * .16, gy = H * .5;
  g += `<rect x="${ckF(W / 2 - m * .012)}" y="${ckF(gy + gh * .5)}" width="${ckF(m * .024)}" height="${ckF(panelY - gy - gh * .5)}" fill="${st.frame}" stroke="#0008"/>`;
  g += `<path d="M${ckF(W / 2 - gw / 2)} ${ckF(gy - gh / 2)} L${ckF(W / 2 + gw / 2)} ${ckF(gy - gh / 2)} L${ckF(W / 2 + gw * .45)} ${ckF(gy + gh / 2)} L${ckF(W / 2 - gw * .45)} ${ckF(gy + gh / 2)} Z" fill="url(#ckRefl)" stroke="${st.edge}" stroke-width="2.5"/>`;
  // dashboard
  g += `<path d="M0 ${H} V${ckF(panelY + H * .02)} Q${ckF(W / 2)} ${ckF(panelY - H * .05)} ${W} ${ckF(panelY + H * .02)} V${H} Z" fill="${st.panel}" stroke="${st.edge}" stroke-width="3"/>`;
  const R = Math.min((H - panelY) * .36, W * .045), gyD = panelY + (H - panelY) * .52;
  const face = (x, extra) => `<g transform="translate(${ckF(x)} ${ckF(gyD)})"><circle r="${ckF(R * 1.12)}" fill="#111" stroke="${st.edge}" stroke-width="2"/><circle r="${ckF(R)}" fill="${st.face}"/>${extra}</g>`;
  const ticks = n => [...Array(n)].map((_, k) => `<line x1="0" y1="${ckF(-R * .92)}" x2="0" y2="${ckF(-R * .74)}" stroke="${st.ink}" stroke-width="${k % 2 ? 1 : 2}" transform="rotate(${ckF(-135 + k * 270 / (n - 1))})"/>`).join("");
  const lab = t => `<text y="${ckF(R * .5)}" text-anchor="middle" font-size="${ckF(R * .24)}" font-family="Georgia,serif" font-weight="700" fill="${st.ink}">${t}</text>`;
  const needle = (id, col = "#111") => `<line id="${id}" x1="0" y1="${ckF(R * .15)}" x2="0" y2="${ckF(-R * .82)}" stroke="${col}" stroke-width="${ckF(Math.max(2, R * .07))}" stroke-linecap="round"/>`;
  const hub = `<circle r="3" fill="${st.ink}"/>`, xs = [.3, .4, .5, .6, .7].map(f => W * f);
  g += face(xs[0], ticks(11) + lab("AIRSPEED") + needle("ckAsi") + hub);
  g += face(xs[1], ticks(11) + lab("ALT") + needle("ckAlt2", "#666") + needle("ckAlt") + hub);
  g += `<g transform="translate(${ckF(xs[2])} ${ckF(gyD)})"><defs><clipPath id="ckBallC"><circle r="${ckF(R)}"/></clipPath></defs><circle r="${ckF(R * 1.12)}" fill="#111" stroke="${st.edge}" stroke-width="2"/><g clip-path="url(#ckBallC)"><g id="ckBall"><rect x="${ckF(-R * 3)}" y="${ckF(-R * 3)}" width="${ckF(R * 6)}" height="${ckF(R * 3)}" fill="#4a9ad8"/><rect x="${ckF(-R * 3)}" y="0" width="${ckF(R * 6)}" height="${ckF(R * 3)}" fill="#7a5230"/><line x1="${ckF(-R * 3)}" y1="0" x2="${ckF(R * 3)}" y2="0" stroke="#fff" stroke-width="2"/>${[-2, -1, 1, 2].map(k => `<line x1="${ckF(-R * .25)}" y1="${ckF(k * R * .3)}" x2="${ckF(R * .25)}" y2="${ckF(k * R * .3)}" stroke="#fff" stroke-width="1.2"/>`).join("")}</g></g><path d="M${ckF(-R * .6)} 0 H${ckF(-R * .2)} L0 ${ckF(R * .15)} L${ckF(R * .2)} 0 H${ckF(R * .6)}" stroke="#ff9d2e" stroke-width="3" fill="none"/></g>`;
  g += face(xs[3], `<g id="ckCompass">${["N", "E", "S", "W"].map((t, k) => `<text y="${ckF(-R * .55)}" text-anchor="middle" dominant-baseline="middle" font-size="${ckF(R * .3)}" font-family="Georgia,serif" font-weight="700" fill="${t === "N" ? "#b01010" : st.ink}" transform="rotate(${k * 90})">${t}</text>`).join("")}${[...Array(12)].map((_, k) => `<line x1="0" y1="${ckF(-R * .92)}" x2="0" y2="${ckF(-R * .8)}" stroke="${st.ink}" transform="rotate(${k * 30 + 15})"/>`).join("")}</g><path d="M0 ${ckF(-R * .4)} L${ckF(R * .12)} ${ckF(R * .2)} L0 ${ckF(R * .1)} L${ckF(-R * .12)} ${ckF(R * .2)} Z" fill="#ff9d2e"/>`);
  g += face(xs[4], ticks(7) + `<path d="M${ckF(R * .74 * Math.sin(.87))} ${ckF(-R * .74 * Math.cos(.87))} A${ckF(R * .74)} ${ckF(R * .74)} 0 0 1 ${ckF(R * .74 * Math.sin(2.36))} ${ckF(-R * .74 * Math.cos(2.36))}" stroke="#c02020" stroke-width="4" fill="none"/>` + lab("ENG TEMP") + needle("ckTemp") + hub);
  // toggle switches + brass name plate
  for (let k = 0; k < 4; k++) g += `<g transform="translate(${ckF(W * (.2 + k * .018))} ${ckF(gyD + R * .2)})"><rect x="-4" y="-7" width="8" height="14" rx="2" fill="#222"/><line x1="0" y1="0" x2="0" y2="-11" stroke="#ccc" stroke-width="3" stroke-linecap="round"/></g>`;
  const pwid = Math.max(70, W * .09), ph = Math.max(14, R * .38);
  g += `<rect x="${ckF(W / 2 - pwid / 2)}" y="${ckF(panelY + H * .005)}" width="${ckF(pwid)}" height="${ckF(ph)}" rx="3" fill="#c8b27a" stroke="#0006"/><text x="${ckF(W / 2)}" y="${ckF(panelY + H * .005 + ph * .74)}" text-anchor="middle" font-size="${ckF(ph * .66)}" font-family="Georgia,serif" font-weight="700" fill="#2a1a08">${planeNow().name}</text>`;
  return { svg: g, analog: !0, R };
}
// ---------- HI-TECH: frameless canopy, projected HUD (pitch ladder, heading / speed / altitude tapes), glass MFDs ----------
function ckTech(W, H, st) {
  const c = st.hud, m = Math.min(W, H), cy = H * .5, consY = H * (IS_TOUCH ? .88 : .84), glow = st.neon ? 'filter="url(#ckGlow)"' : "";
  let g = `<defs><filter id="ckGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="ckScan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="${c}" opacity=".08"/></pattern>
    <linearGradient id="ckCanopy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".22"/><stop offset=".12" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>`;
  if (st.tint) g += `<rect width="${W}" height="${H}" fill="#062a26" opacity="${st.tint}"/>`;
  g += `<rect width="${W}" height="${H}" fill="url(#ckCanopy)"/><path d="M0 ${ckF(H * .06)} Q${ckF(W / 2)} ${ckF(-H * .03)} ${W} ${ckF(H * .06)}" stroke="${c}" stroke-opacity=".45" stroke-width="2" fill="none" ${glow}/>`;
  const tw = Math.min(W * .34, 420), ty = H * .12, off = Math.min(W * (IS_TOUCH ? .22 : .3), m * .62), sx = W / 2 - off, ax = W / 2 + off, th = m * .36;
  g += `<g ${glow} font-family="Consolas,'Courier New',monospace" font-weight="700" fill="${c}" stroke-linecap="round">`;
  g += `<g id="ckLadder"></g><g id="ckHdg" transform="translate(${ckF(W / 2)} ${ckF(ty)})"></g><path d="M${ckF(W / 2 - 7)} ${ckF(ty + 20)} L${ckF(W / 2)} ${ckF(ty + 12)} L${ckF(W / 2 + 7)} ${ckF(ty + 20)}" stroke="${c}" stroke-width="2" fill="none"/>`;
  g += `<g id="ckSpdT" transform="translate(${ckF(sx)} ${ckF(cy)})"></g><g id="ckAltT" transform="translate(${ckF(ax)} ${ckF(cy)})"></g>`;
  g += `<rect x="${ckF(sx - 60)}" y="${ckF(cy - 13)}" width="58" height="26" fill="#000a" stroke="${c}" stroke-width="2"/><text id="ckSpdN" x="${ckF(sx - 31)}" y="${ckF(cy + 6)}" text-anchor="middle" font-size="16">0</text>`;
  g += `<rect x="${ckF(ax + 2)}" y="${ckF(cy - 13)}" width="62" height="26" fill="#000a" stroke="${c}" stroke-width="2"/><text id="ckAltN" x="${ckF(ax + 33)}" y="${ckF(cy + 6)}" text-anchor="middle" font-size="16">0</text>`;
  g += `<text x="${ckF(sx - 31)}" y="${ckF(cy - th / 2 - 8)}" text-anchor="middle" font-size="12">SPD</text><text x="${ckF(ax + 33)}" y="${ckF(cy - th / 2 - 8)}" text-anchor="middle" font-size="12">ALT</text>`;
  g += `<text id="ckMode" x="${ckF(sx - 31)}" y="${ckF(cy + th / 2 + 20)}" text-anchor="middle" font-size="12">CRZ</text><text id="ckG" x="${ckF(ax + 33)}" y="${ckF(cy + th / 2 + 20)}" text-anchor="middle" font-size="12">1.0G</text></g>`;
  // console with three glass MFDs
  g += `<path d="M0 ${H} V${ckF(consY + H * .03)} L${ckF(W * .28)} ${ckF(consY)} H${ckF(W * .72)} L${W} ${ckF(consY + H * .03)} V${H} Z" fill="#05080c" fill-opacity=".92" stroke="${c}" stroke-opacity=".5" stroke-width="2"/>`;
  const mh = (H - consY) * .78, mw = Math.min(W * .12, mh * 1.6), my = consY + (H - consY) * .13, fs = Math.max(8, mh * .16);
  const mfd = (x, inner) => `<g transform="translate(${ckF(x - mw / 2)} ${ckF(my)})"><rect width="${ckF(mw)}" height="${ckF(mh)}" rx="4" fill="${st.glass}" stroke="${c}" stroke-opacity=".7" stroke-width="1.5"/><rect width="${ckF(mw)}" height="${ckF(mh)}" rx="4" fill="url(#ckScan)"/>${inner}</g>`;
  const T = (x, y, s, t, extra = "") => `<text x="${ckF(x)}" y="${ckF(y)}" font-size="${ckF(s)}" fill="${c}" font-family="Consolas,monospace" ${extra}>${t}</text>`;
  g += mfd(W * .36, `<g transform="translate(${ckF(mw / 2)} ${ckF(mh * .56)})"><circle r="${ckF(mh * .36)}" fill="none" stroke="${c}" stroke-opacity=".5"/><circle r="${ckF(mh * .18)}" fill="none" stroke="${c}" stroke-opacity=".3"/><g class="ckSweep"><line x1="0" y1="0" x2="0" y2="${ckF(-mh * .36)}" stroke="${c}" stroke-width="2"/></g><path d="M0 -4 L3 3 L-3 3 Z" fill="${c}"/></g>` + T(4, fs, fs, "RDR"));
  g += mfd(W * .5, T(mw / 2, mh * .3, fs * 1.05, planeNow().name, 'text-anchor="middle" font-weight="700"') + T(mw / 2, mh * .56, fs, "SYS OK", 'id="ckSys" text-anchor="middle"') + `<rect x="${ckF(mw * .12)}" y="${ckF(mh * .7)}" width="${ckF(mw * .76)}" height="${ckF(mh * .12)}" fill="none" stroke="${c}" stroke-opacity=".6"/><rect id="ckHeatT" x="${ckF(mw * .12)}" y="${ckF(mh * .7)}" width="0" height="${ckF(mh * .12)}" fill="${c}"/>`);
  g += mfd(W * .64, T(4, fs, fs, "WPN") + T(mw / 2, mh * .52, fs * 1.05, "MSL 0", 'id="ckWpn" text-anchor="middle" font-weight="700"') + T(mw / 2, mh * .8, fs * .95, "FLR 0", 'id="ckFlr" text-anchor="middle"'));
  return { svg: g, analog: !1, th, tw, mw };
}
// ---------- ALIEN: organic eye-shaped viewport, pulsing veins, floating holograms written in alien glyphs ----------
Object.assign(COCKPITS, {
  orb:        { type: "alien", hud: "#7dff6a", flesh: "#1c0f2a", vein: "#7dff6a", sight: "eye" },
  mantis:     { type: "alien", hud: "#c6ff3b", flesh: "#10200f", vein: "#c6ff3b", sight: "tri" },
  mothership: { type: "alien", hud: "#c77dff", flesh: "#140a22", vein: "#6ff7ff", sight: "spiral" },
  prism: { type: "tech", hud: "#8af2ff", glass: "#061820", sight: "prism", neon: 1 },
  viper: { type: "tech", hud: "#ff5a3a", glass: "#200806", sight: "bracket" },
  anvil: { type: "analog", frame: "#4a4f5a", edge: "#8a93a0", panel: "#262a31", face: "#e8e4d6", ink: "#1a1c20", hud: "#ffb040", sight: "heavy", slits: 1 }
});
const ckGlyphs = ["M-4 -5 L4 -5 M0 -5 L0 5", "M-4 5 L0 -5 L4 5 Z", "M-4 -4 A4 4 0 1 0 4 -4", "M-4 0 H4 M-2 -5 L-2 5 M2 -5 L2 5", "M0 -5 L4 0 L0 5 L-4 0 Z", "M-4 -5 V5 H4", "M-4 -5 L4 5 M4 -5 L-4 5", "M-4 5 Q0 -9 4 5", "M0 -5 V5 M-4 -1 A4 4 0 0 0 4 -1", "M-4 -5 H4 L-4 5 H4"];
const ckAlienNum = (n, c, sz) => String(Math.max(0, Math.round(n))).split("").map((d, i) => `<path transform="translate(${i * sz * 1.1} 0) scale(${sz / 10})" d="${ckGlyphs[+d]}" stroke="${c}" stroke-width="${ckF(20 / sz)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
function ckAlien(W, H, st) {
  const c = st.hud, m = Math.min(W, H), cx = W / 2, top = H * .07, bot = H * (IS_TOUCH ? .86 : .8);
  // almond "eye" window with organic lobes, cut out of a living membrane
  const win = `M${ckF(W * .04)} ${ckF(H * .46)} C${ckF(W * .12)} ${ckF(top - H * .02)} ${ckF(W * .36)} ${ckF(top)} ${ckF(cx)} ${ckF(top + H * .015)} C${ckF(W * .64)} ${ckF(top)} ${ckF(W * .88)} ${ckF(top - H * .02)} ${ckF(W * .96)} ${ckF(H * .46)} C${ckF(W * .9)} ${ckF(bot - H * .04)} ${ckF(W * .64)} ${ckF(bot)} ${ckF(cx)} ${ckF(bot - H * .03)} C${ckF(W * .36)} ${ckF(bot)} ${ckF(W * .1)} ${ckF(bot - H * .04)} ${ckF(W * .04)} ${ckF(H * .46)} Z`;
  let g = `<defs><radialGradient id="ckFlesh" cx=".5" cy=".5" r=".7"><stop offset=".55" stop-color="${st.flesh}" stop-opacity=".2"/><stop offset="1" stop-color="${st.flesh}"/></radialGradient>
    <mask id="ckWin"><rect width="${W}" height="${H}" fill="#fff"/><path d="${win}" fill="#000"/></mask>
    <filter id="ckGlowA" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  g += `<rect width="${W}" height="${H}" fill="${c}" opacity=".035"/>`;
  g += `<rect width="${W}" height="${H}" fill="${st.flesh}" mask="url(#ckWin)"/><rect width="${W}" height="${H}" fill="url(#ckFlesh)" mask="url(#ckWin)"/>`;
  g += `<path d="${win}" fill="none" stroke="${c}" stroke-width="3" stroke-opacity=".7" filter="url(#ckGlowA)" class="ckPulse"/>`;
  // veins crawling in from the edges
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 14; k++) {
    const side = k % 2 ? 1 : -1, y0 = H * (.1 + rnd() * .8), x0 = side < 0 ? 0 : W, x1 = side < 0 ? W * (.03 + rnd() * .08) : W * (.89 + rnd() * .08);
    g += `<path d="M${ckF(x0)} ${ckF(y0)} Q${ckF((x0 + x1) / 2)} ${ckF(y0 + (rnd() - .5) * H * .2)} ${ckF(x1)} ${ckF(y0 + (rnd() - .5) * H * .12)}" stroke="${st.vein}" stroke-opacity=".35" stroke-width="${ckF(1 + rnd() * 2.5)}" fill="none" class="ckPulse"/>`;
  }
  for (let k = 0; k < 10; k++) { const x = W * (.1 + rnd() * .8), y = rnd() < .5 ? top * rnd() * .8 : bot + (H - bot) * (.15 + rnd() * .7); g += `<circle cx="${ckF(x)}" cy="${ckF(y)}" r="${ckF(2 + rnd() * 4)}" fill="${st.vein}" opacity=".45" class="ckPulse"/>`; }
  // floating holograms: speed ring (left), altitude column (right), heat core (bottom), heading glyph band (top)
  const hr = m * .075, lx = W * .17, rx = W * .83, hy = H * .5;
  g += `<g filter="url(#ckGlowA)" fill="none" stroke="${c}">`;
  g += `<g transform="translate(${ckF(lx)} ${ckF(hy)})"><circle r="${ckF(hr)}" stroke-opacity=".3" stroke-width="2"/><circle id="ckAspd" r="${ckF(hr)}" stroke-width="5" stroke-dasharray="0 999" transform="rotate(-90)" stroke-linecap="round"/><g id="ckAspdN" transform="translate(${ckF(-hr * .55)} ${ckF(hr * .05)})"></g></g>`;
  g += `<g transform="translate(${ckF(rx)} ${ckF(hy)})">${[...Array(8)].map((_, k) => `<rect id="ckAb${k}" x="${ckF(-hr * .5)}" y="${ckF(hr - k * hr * .26)}" width="${ckF(hr)}" height="${ckF(hr * .16)}" rx="3" stroke-width="1.5"/>`).join("")}<g id="ckAaltN" transform="translate(${ckF(-hr * .6)} ${ckF(hr * 1.55)})"></g></g>`;
  g += `<g transform="translate(${ckF(cx)} ${ckF(bot + (H - bot) * .45)})"><circle r="${ckF(hr * .55)}" stroke-width="2" stroke-opacity=".6"/><circle id="ckCore" r="${ckF(hr * .2)}" fill="${c}" fill-opacity=".7" stroke="none"/></g>`;
  g += `<g id="ckAhdg" transform="translate(${ckF(cx)} ${ckF(top + H * .05)})"></g>`;
  g += `</g>`;
  return { svg: g, alien: !0, hr };
}
function updateAlienCockpit(G) {
  const c = G.st.hud, ve = player.ve || 1, alt = Math.round(player.y * 5), hdg = ((player.a * 57.2958 + 90) % 360 + 360) % 360, circ = 2 * Math.PI * G.hr;
  ckAttr("ckAspd", "stroke-dasharray", `${ckF(clamp((ve - .3) / 1.5, 0, 1) * circ)} 999`), ckAttr("ckAspd", "stroke", player.stall ? "#ff3b5c" : c);
  const sp = Math.round(playerSpeed() * 18);
  G.lsp !== sp && (G.lsp = sp, $("ckAspdN").innerHTML = ckAlienNum(sp, c, G.hr * .28));
  const lvl = Math.round(clamp(player.y / Math.max(1, ALT_MAX), 0, 1) * 8);
  for (let k = 0; k < 8; k++) ckAttr("ckAb" + k, "fill", k < lvl ? c : "none");
  G.lalt !== alt && (G.lalt = alt, $("ckAaltN").innerHTML = ckAlienNum(alt, c, G.hr * .22));
  ckAttr("ckCore", "r", ckF(G.hr * (.18 + (player.heat || 0) * .36) * (1 + Math.sin(time * 8) * .06))), ckAttr("ckCore", "fill", player.ovh ? "#ff3b5c" : c);
  if (!G.hdgBuilt) {
    G.hdgBuilt = !0;
    let hd = `<defs><clipPath id="ckAhC"><rect x="${ckF(-G.W * .2)}" y="-14" width="${ckF(G.W * .4)}" height="28"/></clipPath></defs><g clip-path="url(#ckAhC)"><g id="ckAhM">`;
    for (let d = -60; d <= 420; d += 15) hd += `<g transform="translate(${ckF(d * G.W * .004)} 0)">${ckAlienNum((((d % 360) + 360) % 360) / 15, c, 9)}</g>`;
    $("ckAhdg").innerHTML = hd + "</g></g>";
  }
  ckAttr("ckAhM", "transform", `translate(${ckF(-hdg * G.W * .004)} 0)`);
}

function buildCockpit() {
  const W = window.innerWidth, H = window.innerHeight, st = ckStyle(), key = W + "x" + H + planeNow().id;
  if (key === ckKey) return;
  ckKey = key;
  const r = st.type === "analog" ? ckAnalog(W, H, st) : st.type === "alien" ? ckAlien(W, H, st) : ckTech(W, H, st);
  ckGeo = { ...r, W, H, st };
  $("cockpit").innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${r.svg}</svg>`;
  $("ckSight").innerHTML = `<svg viewBox="0 0 120 120" width="120" height="120" style="filter:drop-shadow(0 0 ${st.neon ? 4 : 2}px ${st.hud})">${ckSight(st)}</svg>`;
  $("lockUI").style.setProperty("--c", st.hud);
  document.body.classList.toggle("ck-analog", !!r.analog), document.body.classList.toggle("ck-alien", !!r.alien), document.body.classList.toggle("ck-tech", !r.analog && !r.alien);
}
const ckAttr = (id, k, v) => { const e = document.getElementById(id); e && e.setAttribute(k, v); };
function updateCockpit(dt) {
  const want = state === "playing" && aiming() && player.alive;
  ckAmt = clamp(ckAmt + (want ? 1 : -1) * dt * 7, 0, 1);
  const on = ckAmt > .02;
  if (on !== ckOn) ckOn = on, document.body.classList.toggle("cockpit", on), on || ($("lockUI").style.removeProperty("--c"), ckKey = "", document.body.classList.remove("ck-analog", "ck-tech", "ck-alien"));
  if (!on) return;
  buildCockpit();
  const el = $("cockpit");
  el.style.opacity = ckAmt.toFixed(2), el.style.transform = `translateY(${((1 - ckAmt) * 40).toFixed(1)}px)`;
  const G = ckGeo, W = G.W, H = G.H, deg = 57.2958, rollS = (player.roll || 0) * .82 * deg, pD = (player.p || 0) * deg,
    hdg = ((player.a * deg + 90) % 360 + 360) % 360, kts = Math.round(playerSpeed() * 18), alt = Math.round(player.y * 5), ve = player.ve || 1;
  if (G.analog) {
    ckAttr("ckAsi", "transform", `rotate(${ckF(-135 + clamp((ve - .3) / 1.5, 0, 1) * 270)})`);
    ckAttr("ckAlt", "transform", `rotate(${ckF((alt % 1000) / 1000 * 360)})`), ckAttr("ckAlt2", "transform", `rotate(${ckF(alt / 10000 * 360)}) scale(.7)`);
    ckAttr("ckTemp", "transform", `rotate(${ckF(-135 + clamp(.2 + (player.heat || 0) * .75, 0, 1) * 270)})`);
    ckAttr("ckCompass", "transform", `rotate(${ckF(-hdg)})`);
    ckAttr("ckBall", "transform", `rotate(${ckF(-rollS)}) translate(0 ${ckF(clamp(pD, -40, 40) * G.R / 45)})`);
    return;
  }
  if (G.alien) return updateAlienCockpit(G);
  const k = H / Math.max(20, camera.fov), c = G.st.hud;
  if (!G.built || Math.abs(G.k - k) > .5) {
    G.built = !0, G.k = k;
    let lad = `<defs><clipPath id="ckLadC"><rect x="${ckF(-W / 2)}" y="${ckF(-H * .4)}" width="${W}" height="${ckF(H * .8)}"/></clipPath><clipPath id="ckHdgC"><rect x="${ckF(-G.tw / 2)}" y="-20" width="${ckF(G.tw)}" height="34"/></clipPath><clipPath id="ckTapeC"><rect x="-20" y="${ckF(-G.th / 2)}" width="40" height="${ckF(G.th)}"/></clipPath></defs><g transform="translate(${ckF(W / 2)} ${ckF(H / 2)})" clip-path="url(#ckLadC)"><g id="ckLadM">`;
    for (let d = -80; d <= 80; d += 10) {
      const y = -d * k, w = d === 0 ? W * .3 : W * .07, gap = d === 0 ? W * .05 : W * .03, dash = d < 0 ? ' stroke-dasharray="7 5"' : "", tk = d ? `v${d > 0 ? 6 : -6}` : "";
      lad += `<path d="M${ckF(-gap - w)} ${ckF(y)} H${ckF(-gap)} ${tk} M${ckF(gap + w)} ${ckF(y)} H${ckF(gap)} ${tk}" stroke="${c}" stroke-width="${d ? 1.8 : 2.4}" fill="none"${dash}/>`;
      d && (lad += `<text x="${ckF(-gap - w - 6)}" y="${ckF(y + 4)}" text-anchor="end" font-size="11">${Math.abs(d)}</text><text x="${ckF(gap + w + 6)}" y="${ckF(y + 4)}" font-size="11">${Math.abs(d)}</text>`);
    }
    $("ckLadder").innerHTML = lad + "</g></g>";
    let hd = `<g clip-path="url(#ckHdgC)"><g id="ckHdgM">`;
    for (let d = -60; d <= 420; d += 5) {
      const x = d * (G.tw / 80), v = ((d % 360) + 360) % 360;
      hd += `<line x1="${ckF(x)}" y1="0" x2="${ckF(x)}" y2="${d % 10 ? 5 : 9}" stroke="${c}" stroke-width="1.5"/>` + (d % 10 ? "" : `<text x="${ckF(x)}" y="-5" text-anchor="middle" font-size="11">${v === 0 ? "N" : v === 90 ? "E" : v === 180 ? "S" : v === 270 ? "W" : String(v / 10).padStart(2, "0")}</text>`);
    }
    $("ckHdg").innerHTML = hd + "</g></g>";
    const tape = side => { let t = `<g clip-path="url(#ckTapeC)"><g class="ckTapeM">`; const px = G.th / 8; for (let q = -8; q <= 8; q++) t += `<line x1="0" y1="${ckF(q * px)}" x2="${side * (q % 2 ? 6 : 11)}" y2="${ckF(q * px)}" stroke="${c}" stroke-width="1.5"/>`; return t + `</g></g><line x1="0" y1="${ckF(-G.th / 2)}" x2="0" y2="${ckF(G.th / 2)}" stroke="${c}" stroke-width="1.5"/>`; };
    $("ckSpdT").innerHTML = tape(1), $("ckAltT").innerHTML = tape(-1);
  }
  ckAttr("ckLadM", "transform", `rotate(${ckF(-rollS)}) translate(0 ${ckF(pD * k)})`);
  ckAttr("ckHdgM", "transform", `translate(${ckF(-hdg * (G.tw / 80))} 0)`);
  const tpx = G.th / 8, tmove = (id, val, step) => { const e = document.querySelector("#" + id + " .ckTapeM"); e && e.setAttribute("transform", `translate(0 ${ckF(((val / step) % 2) * tpx)})`); };
  tmove("ckSpdT", kts, 20), tmove("ckAltT", alt, 50);
  $("ckSpdN").textContent = kts, $("ckAltN").textContent = alt;
  $("ckMode").textContent = player.stall ? "STALL" : player.ovh ? "OVHT" : player.boosting ? "BOOST" : player.braking ? "BRAKE" : "CRZ";
  $("ckG").textContent = (1 + Math.abs(player.yawS || 0) * ve * .9).toFixed(1) + "G";
  ckAttr("ckHeatT", "width", ckF((player.heat || 0) * G.mw * .76)), ckAttr("ckHeatT", "fill", player.ovh ? "#ff3b5c" : c);
  $("ckSys").textContent = player.stall ? "! STALL !" : player.ovh ? "! OVERHEAT !" : "SYS OK";
  $("ckWpn").textContent = "MSL " + player.missiles, $("ckFlr").textContent = "FLR " + player.flares;
}

function updateAimUI() {
  const show = state === "playing" || state === "ready" || state === "mirror";
  if (reticle.hidden = !show, markerBox.hidden = !show, $("steerPad").hidden = !show || input.pointerMode === "touch", !show) {
    $("mslWarn").hidden = !0, $("joy").hidden = $("leadPip").hidden = !0, hideBeam();
    return
  }
  const W = window.innerWidth,
    H = window.innerHeight,
    f = fwdOf(player),
    rv = rearView ? -45 : 45,
    r = toScreen(player.x + f[0] * rv, player.y + f[1] * rv, player.z + f[2] * rv);
  r && (reticle.style.transform = `translate(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px)`, reticleAt = r), reticle.classList.toggle("ads", aiming());
  {
    const jy = $("joy"), on = state === "playing" && input.touchId !== null;
    if (jy.hidden = !on, on) {
      const R = joyR();
      jy.style.transform = `translate(${input.touchX0.toFixed(1)}px,${input.touchY0.toFixed(1)}px)`, jy.firstChild.style.width = jy.firstChild.style.height = (R * 2).toFixed(0) + "px", jy.lastChild.style.transform = `translate(${(steerNow * R).toFixed(1)}px,${(-climbNow * R).toFixed(1)}px)`;
    }
    // lead pip: where to put the gun cross so the bullets meet the closest enemy ahead
    let best = null, bd = 1e9;
    const f2 = fwdOf(player).map(v => rearView ? -v : v), cands = boss && !boss.dead && !boss.carrier && !(boss.cloakT > 0) ? [...bots, boss] : bots;
    for (const t of cands) {
      if (t.dead) continue;
      const dx = t.x - player.x, dy = t.y - player.y, dz = t.z - player.z, d = Math.hypot(dx, dy, dz);
      if (d < 8 || d > 170 || (dx * f2[0] + dy * f2[1] + dz * f2[2]) / d < .8) continue;
      d < bd && (bd = d, best = t);
    }
    const lp = $("leadPip");
    let shown = !1;
    for (const t of cands) {
      const now = time;
      if (t._lt !== void 0 && now > t._lt) { const q = Math.min(1, (now - t._lt) * 8); t._vx = lerp(t._vx || 0, (t.x - t._lx) / (now - t._lt), q), t._vy = lerp(t._vy || 0, (t.y - t._ly) / (now - t._lt), q), t._vz = lerp(t._vz || 0, (t.z - t._lz) / (now - t._lt), q); }
      t._lx = t.x, t._ly = t.y, t._lz = t.z, t._lt = now;
    }
    if (best && state === "playing") {
      const tt = isBeamPlane() ? 0 : bd / (playerSpeed() + 58), q = toScreen(best.x + (best._vx || 0) * tt, best.y + (best._vy || 0) * tt, best.z + (best._vz || 0) * tt);
      q && (shown = !0, lp.style.transform = `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px)`, lp.classList.toggle("on", !!r && Math.hypot(q.x - r.x, q.y - r.y) < 22));
    }
    lp.hidden = !shown;
  }
  const list = [];
  for (const b of bots) Math.hypot(b.x - player.x, b.z - player.z) < 170 && list.push({
    o: b,
    cls: b.bomber ? "bomb" : b.kind === "ace" ? "ace" : "",
    lbl: b.bomber ? "BOMBER " : b.airframe ? b.specialCharge > 0 ? "CHARGING " : b.airframe.toUpperCase() + " " : b.kind === "ace" ? "ACE " : b.heavy ? "HEAVY " : ""
  });
  for (const e of dnMarks()) list.push(e);
  for (const t of turrets) !t.dead && !t.carrier && (t.core ? boss && boss.phase === 2 : t.strike || t.sCore || Math.hypot(t.x - player.x, t.z - player.z) < 110) && list.push(t.core ? {
    o: t,
    cls: "boss",
    lbl: "REACTOR "
  } : t.strike || t.sCore ? {
    o: t,
    cls: "tgt",
    lbl: t.sCore ? "SCALE " : "TARGET "
  } : {
    o: t,
    cls: "tur",
    lbl: t.launcher ? "SAM " : "AA ",
    noArrow: !0
  });
  list.unshift(...waveMarks(), ...netMarks());
  for (const m of missiles) m.enemy && m.target === player && list.push({
    o: m,
    cls: "msl",
    lbl: "MISSILE "
  });
  boss && !boss.dead && !(boss.cloakT > 0) && list.unshift({
    o: boss,
    cls: boss.ace ? "boss ace" : "boss",
    lbl: boss.serpent ? boss.phase === 1 ? "ARMORED " : "SERPENT " : boss.titan ? "TITAN " : boss.ace ? boss.ramCharge > 0 || boss.ramT > 0 ? "RAM! " : boss.shieldT > 0 ? "SHIELD " : "FALCON " : "BOSS "
  });
  let n = 0;
  for (const it of list) {
    if (n >= MARKS.length) break;
    const b = it.o,
      dx = b.x - player.x,
      dz = b.z - player.z,
      d = Math.hypot(dx, b.y - player.y, dz),
      p = toScreen(b.x, b.y + .6 * (b.scale || 1), b.z),
      on = p && p.x > 20 && p.x < W - 20 && p.y > 20 && p.y < H - 20;
    if (!on && it.noArrow || on && b.lock > 0 && aiming()) continue;
    const m = MARKS[n++];
    if (m.hidden = !1, on) {
      const sz = clamp(900 * (b.scale || 1) / Math.max(d, 1), 24, b.titan ? 160 : 90);
      m.className = "mk " + it.cls, m.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`, m.firstChild.style.transform = m.lastChild.style.left = m.lastChild.style.transform = "", m.firstChild.style.width = m.firstChild.style.height = sz.toFixed(0) + "px", m.lastChild.textContent = it.lbl + Math.round(d) + "m", m.lastChild.style.top = (sz / 2 + 4).toFixed(0) + "px";
      const hurt = b.hpMax > 1 && b.hp < b.hpMax && b !== boss && !b.core;
      m.firstChild.firstChild.style.display = hurt ? "" : "none", hurt && (m.firstChild.firstChild.firstChild.style.width = clamp(b.hp / b.hpMax * 100, 0, 100).toFixed(0) + "%"), b.hitT > 0 && (m.className += " hit")
    } else {
      const rel = p ? Math.atan2(p.x - W / 2, -(p.y - H / 2)) : wrapA(Math.atan2(dz, dx) - camA),
        big = b === boss,
        ax = W / 2 + Math.sin(rel) * (W / 2 - (big ? 80 : 60)),
        ay = clamp(H / 2 - Math.cos(rel) * (H / 2 - (big ? 80 : 60)), 70, H - (big ? 170 : 140));
      m.className = "mk off " + it.cls + (big ? " big" + (b.ace ? " aceB" : "") : "") + (d < 45 || it.cls === "msl" ? " near" : ""), m.style.transform = `translate(${ax.toFixed(1)}px,${ay.toFixed(1)}px)`, m.firstChild.style.transform = `translate(-50%,-50%) rotate(${rel.toFixed(3)}rad)`, m.firstChild.style.width = m.firstChild.style.height = "";
      const lb = m.lastChild;
      big ? (lb.textContent = (b.ace ? "FALCON " : it.lbl) + Math.round(d) + "m", lb.style.left = (-Math.sin(rel) * 44).toFixed(0) + "px", lb.style.top = (Math.cos(rel) * 44).toFixed(0) + "px", lb.style.transform = "translate(-50%,-50%)") : (lb.textContent = "", lb.style.left = lb.style.transform = "")
    }
  }
  for (; n < MARKS.length; n++) MARKS[n].hidden = !0;
  n = 0;
  for (const pk of pickups) {
    if (n >= PICKS.length) break;
    if (dist3(pk, player) > 130) continue;
    const p = toScreen(pk.x, pk.y + 3.2, pk.z);
    if (!p || p.x < 0 || p.x > W || p.y < 0 || p.y > H) continue;
    const q = PICKS[n++];
    q.hidden = !1, q.className = "pk " + pk.type, q.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`
  }
  for (; n < PICKS.length; n++) PICKS[n].hidden = !0;
  steerKnob.style.transform = `translate(${(steerNow*22).toFixed(1)}px,${(-climbNow*22).toFixed(1)}px)`, updatePopups(), updateHitLog()
}

function syncInstances() {
  let n = 0;
  for (const b of bullets) {
    if (b.profile === "plasma" || b.profile === "bio" || b.profile === "grav") {
      const s2 = (b.profile === "grav" ? 1.25 : b.profile === "bio" ? .7 : .8) * (1 + Math.sin(time * 26 + n) * .18);
      _q.setFromEuler(_e.set(0, -Math.atan2(b.vz, b.vx), Math.atan2(b.vy, Math.hypot(b.vx, b.vz)), "YZX")), _m4.compose(_v.set(b.x, b.y, b.z), _q, _s.set(b.profile === "bio" ? s2 * 2.2 : s2, s2, s2)), bulletMesh.setMatrixAt(n, _m4), bulletMesh.setColorAt(n, _c.set(b.enemy ? 16732772 : SHOT_COLORS[b.profile])), n++;
      continue
    }
    if (b.profile === "orb" || b.profile === "fire") {
      const s2 = (b.profile === "fire" ? 1.7 : 1.35) + Math.sin(time * 20 + n) * .2;
      _q.identity(), _m4.compose(_v.set(b.x, b.y, b.z), _q, _s.set(s2, s2, s2)), bulletMesh.setMatrixAt(n, _m4), bulletMesh.setColorAt(n, _c.set(b.profile === "fire" ? n % 3 ? 16746027 : 16768586 : n % 3 ? 16726996 : 16765684)), n++;
      continue
    }
    _q.setFromEuler(_e.set(0, -Math.atan2(b.vz, b.vx), Math.atan2(b.vy, Math.hypot(b.vx, b.vz)), "YZX"));
    const beam = b.profile === "laser" || b.profile === "ion";
    _m4.compose(_v.set(b.x, b.y, b.z), _q, beam ? _s.set(2.8, .22, .22) : b.profile === "cannon" ? _s.set(1.35, .65, .65) : _s.set(1, .42, .42)), bulletMesh.setMatrixAt(n, _m4), bulletMesh.setColorAt(n, _c.set(b.enemy ? 16732772 : SHOT_COLORS[b.profile] || 16773194)), n++
  }
  bulletMesh.count = n, bulletMesh.instanceMatrix.needsUpdate = !0, bulletMesh.instanceColor && (bulletMesh.instanceColor.needsUpdate = !0), n = 0, _q.identity();
  for (const p of parts) {
    const f = p.life / p.max,
      s2 = p.grow ? p.size * (.6 + (1 - f) * p.grow) * Math.min(1, f * 3) : p.size * f;
    _m4.compose(_v.set(p.x, p.y, p.z), _q, _s.set(s2, s2, s2)), partMesh.setMatrixAt(n, _m4), partMesh.setColorAt(n, _c.set(p.color)), n++
  }
  partMesh.count = n, partMesh.instanceMatrix.needsUpdate = !0, partMesh.instanceColor && (partMesh.instanceColor.needsUpdate = !0)
}
const rctx = $("radar").getContext("2d");

function drawRadar() {
  if ($("radar").classList.contains("hidden")) return;
  const S = 260,
    R = 124,
    range = 160,
    cx = S / 2;
  rctx.clearRect(0, 0, S, S), rctx.fillStyle = "rgba(58,35,80,0.55)", rctx.beginPath(), rctx.arc(cx, cx, R, 0, Math.PI * 2), rctx.fill(), rctx.strokeStyle = "rgba(255,255,255,0.35)", rctx.lineWidth = 3, rctx.beginPath(), rctx.arc(cx, cx, R * .5, 0, Math.PI * 2), rctx.stroke(), rctx.strokeStyle = "#fff", rctx.lineWidth = 6, rctx.beginPath(), rctx.arc(cx, cx, R, 0, Math.PI * 2), rctx.stroke(), rctx.save(), rctx.beginPath(), rctx.arc(cx, cx, R - 3, 0, Math.PI * 2), rctx.clip();
  const rot = -player.a - Math.PI / 2,
    cr = Math.cos(rot),
    sr = Math.sin(rot);
  rctx.save(), rctx.translate(cx, cx), rctx.rotate(rot), rctx.translate(-cx, -cx), rctx.strokeStyle = "#ff4d6d", rctx.lineWidth = 5, rctx.strokeRect(cx + (-MAP - player.x) / range * R, cx + (-MAP - player.z) / range * R, MAP * 2 / range * R, MAP * 2 / range * R), rctx.restore();
  const dot = (o, col, r, shape) => {
    let dx = (o.x - player.x) / range * R,
      dz = (o.z - player.z) / range * R;
    const d = Math.hypot(dx, dz);
    d > R - 8 && (dx *= (R - 8) / d, dz *= (R - 8) / d);
    const x = cx + dx * cr - dz * sr,
      y = cx + dx * sr + dz * cr,
      dy = (o.y || 0) - player.y;
    rctx.fillStyle = col, rctx.beginPath(), shape === "sq" ? rctx.rect(x - r, y - r, r * 2, r * 2) : dy > 8 ? (rctx.moveTo(x, y - r * 1.2), rctx.lineTo(x + r, y + r * .8), rctx.lineTo(x - r, y + r * .8)) : dy < -8 ? (rctx.moveTo(x, y + r * 1.2), rctx.lineTo(x + r, y - r * .8), rctx.lineTo(x - r, y - r * .8)) : rctx.arc(x, y, r, 0, Math.PI * 2), rctx.fill()
  };
  for (const p of pickups) dot(p, p.type === "ammo" ? "#ffe24a" : p.type === "missile" ? "#ff9f43" : "#ff7a9c", 7);
  for (const t of turrets) t.dead || dot(t, t.sCore ? "#7ff3ff" : t.strike ? "#ff2d55" : "#ffa94d", t.strike || t.sCore ? 10 : 7, "sq");
  if (boss && boss.serpent && !boss.dead) for (const s of boss.segs) dot(s, "#1f8a7a", 5);
  for (const b of bots) dot(b, b.bomber ? "#ffd24a" : b.squad ? "#ffc83d" : b.kind === "ace" ? "#ff00aa" : "#ff3b3b", b.bomber ? 13 : b.heavy ? 11 : 9);
  netGame === "duel" && duel.rival && duel.rival.alive && dot(duel.rival, "#ff5c8a", 12);
  for (const m of waveMarks()) m.cls === "gate" && dot(m.o, Math.floor(time * 4) % 2 ? "#ffd24a" : "#ffffff", 9, "sq");
  boss && !boss.dead && !(boss.cloakT > 0) && dot(boss, boss.titan ? Math.floor(time * 6) % 2 ? "#ff2d55" : "#ffd24a" : "#ffbb58", boss.titan ? 20 : 15, "sq"), rctx.restore(), rctx.save(), rctx.translate(cx, cx), rctx.rotate(-Math.PI / 2), rctx.fillStyle = "#fff", rctx.beginPath(), rctx.moveTo(16, 0), rctx.lineTo(-10, 10), rctx.lineTo(-5, 0), rctx.lineTo(-10, -10), rctx.closePath(), rctx.fill(), rctx.restore()
}
let hudCache = "";

function updateHud(force) {
  const key = [scoreNow(), player.hp, maxHp(), player.ammo, player.missiles, player.flares, speedMul().toFixed(1), Math.round(player.y)].join("|");
  if (!force && key === hudCache) return;
  hudCache = key, $("score").innerHTML = scoreNow() + "<small> pts</small>";
  let h = "";
  { let c = 0; for (const cap of heartCaps()) { const f = clamp(player.hp - c, 0, cap); c += cap; h += '<span class="h' + (f === 0 ? " off" : f < cap ? " part" : "") + '">&#9829;' + (cap > 1 ? "<i>" + "<b></b>".repeat(f) + "<b class=o></b>".repeat(cap - f) + "</i>" : "") + "</span>"; } }
  $("hearts").innerHTML = h, $("ammo").textContent = player.ammo, $("ammoRow").classList.toggle("empty", player.ammo === 0), $("ammoRow").classList.toggle("low", player.ammo > 0 && player.ammo <= 5), $("lowHp").classList.toggle("on", state === "playing" && heartsLeft() === 1), $("speed").textContent = "ALT " + Math.round(player.y * 5) + "m", $("mslN").textContent = player.missiles, $("flrN").textContent = player.flares, $("btnMsl").classList.toggle("empty", player.missiles === 0), $("btnFlare").classList.toggle("empty", player.flares === 0)
}

function bumpAmmo() {
  const r = $("ammoRow");
  r.classList.add("bump"), setTimeout(() => r.classList.remove("bump"), 150)
}
let toastT = null;

function toast(msg) {
  const t = $("toast");
  t.textContent = msg, t.classList.add("show"), clearTimeout(toastT), toastT = setTimeout(() => t.classList.remove("show"), 2e3)
}

function resize() {
  const w = window.innerWidth || 960,
    h = window.innerHeight || 600;
  renderer.setSize(w, h), camera.aspect = w / h, baseFov = w / h < 1 ? 80 : w / h < 1.3 ? 68 : 60, camera.fov = baseFov, camK = w / h < .8 ? 1.2 : 1, camera.updateProjectionMatrix()
}
window.addEventListener("resize", resize);
let last = performance.now();

let smDt = 1 / 60, perfAvg = 1 / 60, perfT = 0, perfLvl = 0;
function perfGovern(rf) {
  if (state !== "playing") return;
  perfAvg += (rf - perfAvg) * .05, perfT += rf;
  if (perfT < 2.5 || perfAvg < .022 || perfLvl >= 2) return;
  perfT = 0, perfLvl++;
  if (perfLvl === 1) renderer.setPixelRatio(1), resize();
  else sun.castShadow = !1, renderer.shadowMap.enabled = !1, scene.traverse(o => { o.material && (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = !0); });
}
function frame(now) {
  const rf = Math.min((now - last) / 1e3, .03333333333333333);
  last = now, smDt += (rf - smDt) * (Math.abs(rf - smDt) > .02 ? 1 : .3), perfGovern(rf);
  const raw = smDt;
  let dt = raw;
  slowT > 0 && (slowT -= raw, dt *= slowScale, slowT <= 0 && (slowScale = 1)), state !== "paused" && state !== "loading" && update(dt), netTick(raw), updateCamera(dt), updateEngineAudio(), renderPreview(raw), camera.updateMatrixWorld(), updateAimUI(), updateCockpit(raw), updateLocks(dt), updateNova(dt), updateCombatFx(dt, raw), updateSpecialHud(), syncInstances(), drawRadar(), window.__noRender || renderer.render(scene, camera), requestAnimationFrame(frame)
}
$("audioDialog").addEventListener("click", e => { (e.target === $("audioDialog") || e.target.closest("[data-close]")) && $("audioDialog").close(); });
const cvs = $("c");
cvs.addEventListener("pointerdown", e => {
  if (e.preventDefault(), Sound.init(), e.pointerType === "mouse") {
    if (input.pointerMode = "mouse", input.mouseX = e.clientX, input.mouseY = e.clientY, input.mouseActive = !0, e.button === 2) {
      state === "playing" && (input.ads = !0);
      return
    }
    if (e.button !== 0) return;
    if (state === "ready") {
      beginPlaying();
      return
    }
    (state === "playing" || state === "mirror") && (input.mouseFire = !0)
  } else input.pointerMode = "touch", input.mouseActive = !1, input.touchId === null && (cvs.setPointerCapture(e.pointerId), input.touchId = e.pointerId, input.touchX = input.touchX0 = e.clientX, input.touchY = input.touchY0 = e.clientY), state === "ready" && beginPlaying()
}), window.addEventListener("pointermove", e => {
  e.pointerType === "mouse" && input.pointerMode !== "touch" && (!IS_TOUCH || e.buttons) ? (input.mouseX = e.clientX, input.mouseY = e.clientY, input.mouseActive = !0) : e.pointerId === input.touchId && (input.touchX = e.clientX, input.touchY = e.clientY)
});
const endPointer = e => {
  e.pointerType === "mouse" && (e.button === 2 ? input.ads = !1 : input.mouseFire = !1), e.pointerId === input.touchId && (input.touchId = null, input.mouseActive = !1, steerNow = 0, climbNow = 0, input.touchX = input.touchX0, input.touchY = input.touchY0), IS_TOUCH && e.pointerType === "mouse" && (input.mouseActive = !1, steerNow = 0, climbNow = 0)
};
window.addEventListener("pointerup", endPointer), document.addEventListener("mouseleave", () => {
  input.mouseActive = !1
}), window.addEventListener("pointercancel", endPointer), cvs.addEventListener("lostpointercapture", endPointer), window.addEventListener("blur", () => {
  clearInput(), state === "playing" && pauseGame()
}), document.addEventListener("contextmenu", e => e.preventDefault());
for (const [id, k] of [["btnBoost", "tBoost"], ["btnBrake", "tBrake"]]) {
  const el = $(id);
  el.addEventListener("pointerdown", e => { e.preventDefault(), e.stopPropagation(), Sound.init(), state === "ready" && beginPlaying(), state === "playing" && (input[k] = !0, el.classList.add("on")) });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(ev, () => { input[k] = !1, el.classList.remove("on") });
}
const fireBtn = $("btnFire");
fireBtn.addEventListener("pointerdown", e => {
  e.preventDefault(), e.stopPropagation(), Sound.init(), state === "ready" && beginPlaying(), (state === "playing" || state === "mirror") && (input.touchFire = !0, fireBtn.classList.add("on"))
});
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) fireBtn.addEventListener(ev, () => {
  input.touchFire = !1, fireBtn.classList.remove("on")
});

function tapBtn(id, fn) {
  $(id).addEventListener("pointerdown", e => {
    e.preventDefault(), e.stopPropagation(), Sound.init(), state === "ready" && beginPlaying(), fn()
  })
}
tapBtn("btnMsl", playerMissile), tapBtn("btnFlare", playerFlare), tapBtn("btnAds", () => {
  state === "playing" && (input.adsToggle = !input.adsToggle, $("btnAds").classList.toggle("on", input.adsToggle))
});
const KEY_LEFT = ["ArrowLeft", "KeyA"],
  KEY_RIGHT = ["ArrowRight", "KeyD"],
  KEY_UP = ["ArrowUp", "KeyW"],
  KEY_DOWN = ["ArrowDown", "KeyS"],
  KEY_FIRE = ["Space", "KeyJ", "Enter"],
  KEY_MSL = ["KeyE", "KeyK"],
  KEY_FLARE = ["KeyF", "KeyL"],
  KEY_ADS = ["KeyX"],
  KEY_BOOST = ["ShiftLeft", "ShiftRight"],
  KEY_BRAKE = ["KeyZ", "KeyC", "ControlLeft"],
  GAME_KEYS = [...KEY_LEFT, ...KEY_RIGHT, ...KEY_UP, ...KEY_DOWN, ...KEY_FIRE, ...KEY_MSL, ...KEY_FLARE, ...KEY_ADS, ...KEY_BOOST, ...KEY_BRAKE];
window.addEventListener("keydown", e => {
  if ($("audioDialog").open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const c = e.code;
  if (GAME_KEYS.includes(c)) {
    if (state === "title" && (c === "Space" || c === "Enter")) {
      e.preventDefault(), e.repeat || (Sound.init(), Sound.sfxClick(), startRun());
      return
    }
    if (state === "over" && (c === "Space" || c === "Enter")) {
      e.preventDefault(), !e.repeat && !busy && performance.now() - overShownAt > 700 && $("btnAgain").click();
      return
    }
    if (state !== "ready" && state !== "playing" && state !== "mirror") {
      c === "Space" && e.preventDefault();
      return
    }
    if (e.preventDefault(), Sound.init(), state === "ready" && (e.repeat || beginPlaying(), KEY_FIRE.includes(c))) return;
    KEY_LEFT.includes(c) && (input.left = !0, input.mouseActive = !1), KEY_RIGHT.includes(c) && (input.right = !0, input.mouseActive = !1), KEY_UP.includes(c) && (input.up = !0, input.mouseActive = !1), KEY_DOWN.includes(c) && (input.down = !0, input.mouseActive = !1), KEY_FIRE.includes(c) && (state === "playing" || state === "mirror") && !e.repeat && (input.keyFire = !0), KEY_MSL.includes(c) && !e.repeat && playerMissile(), KEY_FLARE.includes(c) && !e.repeat && playerFlare(), KEY_ADS.includes(c) && (input.ads = !0), KEY_BOOST.includes(c) && (input.boost = !0), KEY_BRAKE.includes(c) && (input.brake = !0)
  } else(c === "Escape" || c === "KeyP") && (state === "playing" || state === "ready" || state === "mirror" ? pauseGame() : state === "paused" && resumeGame())
}), window.addEventListener("keyup", e => {
  const c = e.code;
  KEY_LEFT.includes(c) && (input.left = !1), KEY_RIGHT.includes(c) && (input.right = !1), KEY_UP.includes(c) && (input.up = !1), KEY_DOWN.includes(c) && (input.down = !1), KEY_FIRE.includes(c) && (input.keyFire = !1), KEY_ADS.includes(c) && (input.ads = !1), KEY_BOOST.includes(c) && (input.boost = !1), KEY_BRAKE.includes(c) && (input.brake = !1)
}), document.addEventListener("visibilitychange", () => {
  document.hidden ? (clearInput(), (state === "playing" || state === "ready") && pauseGame(), Sound.setHidden(!0)) : Sound.setHidden(!1)
});

function onBtn(id, fn) {
  $(id).addEventListener("click", e => {
    e.preventDefault(), e.currentTarget.blur(), Sound.init(), fn()
  }), $(id).addEventListener("pointerdown", e => e.stopPropagation())
}
onBtn("btnPlay", () => {
  state === "title" && (Sound.sfxClick(), startRun())
}), onBtn("btnGarage", () => {
  state === "title" && (Sound.sfxClick(), openGarage())
}), onBtn("btnDaily", () => {
  state === "title" && (Sound.sfxClick(), openDaily())
}), onBtn("btnClaim", () => {
  Sound.sfxClick(), claimDaily()
}), onBtn("btnDailyClose", () => {
  state === "daily" && (Sound.sfxClick(), toTitle())
}), onBtn("btnGarageBack", () => {
  state === "garage" && (Sound.sfxClick(), toTitle())
}), onBtn("btnGaragePlay", () => {
  state === "garage" && (Sound.sfxClick(), startRun())
}), onBtn("btnPause", () => {
  Sound.sfxClick(), pauseGame()
}), onBtn("btnResume", () => {
  Sound.sfxClick(), resumeGame()
}), onBtn("btnPauseMenu", () => {
  netHold ? (Sound.sfxClick(), netLeave()) : state === "paused" && (Sound.sfxClick(), toTitle())
}), onBtn("btnMute", () => {
  Sound.setMuted(!Sound.muted), Sound.muted || Sound.sfxClick()
}), onBtn("btnOverGarage", () => {
  state !== "over" || busy || (Sound.sfxClick(), netGame ? netLeave() : openGarage())
}), onBtn("btnRevive", async () => {
  if (state !== "over" || busy || revived) return;
  busy = !0, setOverButtons(!1), $("btnRevive").textContent = "Loading ad...";
  const r = await CG.ad("rewarded");
  busy = !1, state === "over" && (r === "ok" || r === "noads" ? (lastAdTime = Date.now(), revive()) : ($("btnRevive").innerHTML = '<span class="adTag">AD</span>CONTINUE', setOverButtons(!0), toast("No ad available right now. Try again later!")))
}), onBtn("btnAgain", async () => {
  if (netGame) { state === "over" && (Sound.sfxClick(), netBackToLobby()); return }
  state !== "over" || busy || (Sound.sfxClick(), !(CG.active && Date.now() - lastAdTime > 12e4 && (busy = !0, setOverButtons(!1), lastAdTime = Date.now(), await CG.ad("midgame"), busy = !1, state !== "over")) && startRun())
});
let pendingPurchase = null;

function purchaseOffer(type, id, slot) {
  if (type === "part") {
    const p2 = PARTS[slot]?.find(p3 => p3.id === id);
    return p2 ? {
      name: p2.name,
      detail: p2.desc,
      cost: ownsPart(slot, id) ? 0 : p2.cost,
      owned: ownsPart(slot, id)
    } : null
  }
  if (type === "upgrade") {
    const p2 = UPGRADES.find(p3 => p3.id === id),
      lv = garage.lv[id];
    return !p2 || lv >= p2.max ? null : {
      name: p2.name + " \xB7 LV " + (lv + 1),
      detail: p2.desc,
      cost: UP_COST[lv],
      owned: !1
    }
  }
  const p = (type === "plane" ? PLANES : type === "paint" ? PAINTS : []).find(p2 => p2.id === id);
  if (!p) return null;
  const owned = (type === "plane" ? garage.planes : garage.paints).includes(id);
  return !owned && p.cost === null ? null : {
    name: p.name,
    detail: type === "plane" ? p.desc : "Aircraft paint",
    cost: owned ? 0 : p.cost,
    owned
  }
}

function completePurchase(type, id, slot) {
  const offer = purchaseOffer(type, id, slot);
  state !== "garage" || !offer || garage.coins < offer.cost || (type === "part" ? (offer.owned || (garage.coins -= offer.cost, garage.ownedParts ??= {}, garage.ownedParts[slot] ??= [PARTS[slot][0].id], garage.ownedParts[slot].push(id)), garage.loadout[slot] = id, saveGarage(), Sound.sfxAmmo(), applyLook(), renderGarage()) : type === "upgrade" ? buyUpgrade(id) : type === "plane" ? choosePlane(id) : choosePaint(id))
}

function requestPurchase(type, id, slot) {
  const offer = purchaseOffer(type, id, slot);
  if (!(!offer || state !== "garage")) {
    if (offer.owned) {
      completePurchase(type, id, slot);
      return
    }
    pendingPurchase = {
      type,
      id,
      slot,
      cost: offer.cost
    }, $("purchaseTitle").textContent = offer.name, $("purchaseDetail").textContent = offer.detail, $("purchaseBalance").textContent = garage.coins < offer.cost ? `${offer.cost} COINS \xB7 Balance ${garage.coins} / Need ${offer.cost-garage.coins} more` : `${offer.cost} COINS \xB7 Balance ${garage.coins} \u2192 After purchase ${garage.coins-offer.cost}`, $("confirmPurchase").innerHTML = garage.coins < offer.cost ? "NOT ENOUGH COINS" : `BUY \xB7 ${coinHtml(offer.cost)}`, $("confirmPurchase").disabled = garage.coins < offer.cost, $("purchaseDialog").showModal()
  }
}
$("cancelPurchase").addEventListener("click", () => {
  $("purchaseDialog").close()
}), $("purchaseDialog").addEventListener("close", () => {
  pendingPurchase = null
}), $("purchaseDialog").addEventListener("cancel", () => {
  pendingPurchase = null
}), $("confirmPurchase").addEventListener("click", () => {
  const p = pendingPurchase;
  if (pendingPurchase = null, !p) return;
  const offer = purchaseOffer(p.type, p.id, p.slot);
  offer && offer.cost === p.cost && completePurchase(p.type, p.id, p.slot), $("purchaseDialog").close()
});
const ABILITIES = {
    rear: {
      name: "REAR BURST",
      cooldown: 5,
      time: 0,
      description: "Fires a fan straight behind you (no ammo) and swats missiles on your tail. Any hit cuts the cooldown in half."
    },
    roll: {
      name: "BARREL ROLL",
      cooldown: 5,
      time: 0.6,
      description: "Snap-roll toward your stick: untouchable, chasing missiles lose track, and you regain flying speed \u2014 the stall escape."
    },
    shield: {
      name: "IRON SHIELD",
      cooldown: 18,
      time: 5,
      description: "An energy bubble that absorbs everything, reflects bullets back at the shooter and lets you scrape rocks and hull unharmed."
    },
    storm: {
      name: "BULLET STORM",
      cooldown: 15,
      time: 4,
      description: "2.5x fire rate with no ammo cost. The cone widens the longer you fire, and your boost heat cools while it lasts."
    },
    sonic: {
      name: "SONIC BOOM",
      cooldown: 12,
      time: 0,
      description: "Break the sound barrier: jump to top speed with an empty heat gauge. A shockwave clears enemy fire and a second one follows in your wake."
    },
    ram: {
      name: "RAM DASH",
      cooldown: 12,
      time: 2,
      description: "Boosted ramming run: smash aircraft on contact. Every kill extends the dash by 0.5s \u2014 chain them."
    },
    swarm: {
      name: "SWARM PODS",
      cooldown: 14,
      time: 0,
      description: "Free micro-missiles that go for your locked targets first. A full lock-on doubles the salvo."
    },
    cloak: {
      name: "PHANTOM CLOAK",
      cooldown: 16,
      time: 4,
      description: "Vanish: enemies lose you and missiles go blind. Your first hit from the shadows deals 3x damage."
    },
    tailgun: {
      name: "TAIL GUNNER",
      cooldown: 1,
      time: 0,
      description: "Toggle: swing the view round to your six and fire your guns and missiles backwards. Press again to face forward."
    },
    carpet: {
      name: "CARPET BOMB",
      cooldown: 12,
      time: 3,
      description: "Open the bay: a string of bombs falls straight down, flattening AA sites, bombers and dreadnought hardware below you."
    },
    overcharge: {
      name: "OVERCHARGE",
      cooldown: 14,
      time: 3,
      description: "The beam swells into a piercing lance: it burns through every target in line, costs no ammo and hits 60% harder."
    },
    blink: {
      name: "BLINK",
      cooldown: 6,
      time: 0,
      description: "Teleport forward in a flash of green light. Untouchable for a moment and every missile loses you. Stops short of walls."
    },
    tractor: {
      name: "TRACTOR BEAM",
      cooldown: 14,
      time: 3,
      description: "A beam in front of you drags enemies into your guns and freezes them, and catches their bullets and missiles to throw back."
    },
    well: {
      name: "GRAVITY WELL",
      cooldown: 18,
      time: 4,
      description: "Open a black hole ahead: it swallows enemy fire, drags every enemy in and crushes them, then implodes."
    },
    nova: {
      name: "HALO NOVA",
      cooldown: 18,
      time: 0,
      description: "The flagship\u2019s signature: a colossal ion ring that stuns everything within 180m for 3s, erases enemy fire and fully cools your engine."
    }
  },
  AIRFRAME_ABILITY = {
    viper: "tailgun",
    anvil: "carpet",
    prism: "overcharge",
    orb: "blink",
    mantis: "tractor",
    mothership: "well",
    classic: "rear",
    swift: "roll",
    brick: "shield",
    twin: "storm",
    falcon: "sonic",
    lancer: "ram",
    seraph: "swarm",
    spectre: "cloak",
    halo: "nova"
  },
  ENEMY_ABILITY = {
    viper: "ram",
    anvil: "salvo",
    prism: "rear",
    orb: "ram",
    mantis: "salvo",
    mothership: "salvo",
    classic: "rear",
    swift: "ram",
    brick: "ram",
    twin: "rear",
    falcon: "salvo",
    lancer: "ram",
    seraph: "salvo",
    spectre: "salvo",
    halo: "rear"
  },
  abilityOf = id => ABILITIES[AIRFRAME_ABILITY[id] || "rear"],
  abilPowOf = p => 1 + .5 * tierOf(p),
  abilCdOf = p => 1 - .2 * tierOf(p),
  abilPow = () => abilPowOf(planeNow()),
  abilityInfoOf = p => { const a = abilityOf(p.id); return { ...a, cooldown: Math.round(a.cooldown * abilCdOf(p)), time: +(a.time * abilPowOf(p)).toFixed(1) }; };
let rearTag = 0, rearRefund = 0, ambushT = 0, rollTotal = 1.1, stormHeat = 0, sonicTrail = null;
function pDmg(b) {
  let d = gunDmg();
  b.rearTag && b.rearTag === rearTag && rearRefund !== rearTag && (rearRefund = rearTag, specialCooldown *= .5, popup(player.x, player.y + 3, player.z, "TAIL CLEAR \xB7 COOLDOWN -50%", !0));
  ambushT > 0 && (ambushT = 0, cloakTime = 0, d *= 3, popup(b.x, b.y + 2, b.z, "AMBUSH x3", !0), Sound.tone(220, .3, "sawtooth", .09, 880), shake = Math.max(shake, .2));
  b.refl && (d *= 1.5);
  return d;
}
let specialCooldown = 0,
  ramTime = 0,
  rollTime = 0,
  rollDir = 1,
  shieldTime = 0,
  stormTime = 0,
  cloakTime = 0,
  lastThreatStage = 0;

function resetSpecial() {
  specialCooldown = 0, ramTime = rollTime = shieldTime = stormTime = cloakTime = 0, ambushT = 0, sonicTrail = null, tractorT = 0, overT = 0, rearView = !1, clearBombs(), gravWell && (scene.remove(gravWell.mesh), gravWell = null), player.rollFx = 0, lastThreatStage = 0, shieldMesh.visible = !1
}
const abilityActive = () => ramTime > 0 || rollTime > 0 || shieldTime > 0 || stormTime > 0 || cloakTime > 0 || tractorT > 0 || !!gravWell || overT > 0 || rearView || bombT > 0,
  playerHidden = () => cloakTime > 0,
  shieldMesh = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({
    color: 8385535,
    transparent: !0,
    opacity: .22,
    depthWrite: !1,
    blending: THREE.AdditiveBlending
  }));
shieldMesh.scale.setScalar(5.2), shieldMesh.visible = !1, scene.add(shieldMesh);
const novaFx = {
    t: 9,
    x: 0,
    y: 0,
    z: 0
  },
  novaGeo = new THREE.TorusGeometry(1, .025, 8, 120),
  novaRing = new THREE.Mesh(novaGeo, new THREE.MeshBasicMaterial({
    color: 13215999,
    transparent: !0,
    opacity: .8,
    depthWrite: !1,
    blending: THREE.AdditiveBlending
  })),
  novaRing2 = new THREE.Mesh(novaGeo, new THREE.MeshBasicMaterial({
    color: 6941439,
    transparent: !0,
    opacity: .6,
    depthWrite: !1,
    blending: THREE.AdditiveBlending
  }));
novaRing.rotation.x = novaRing2.rotation.x = Math.PI / 2, novaRing.visible = novaRing2.visible = !1, scene.add(novaRing, novaRing2);

function updateNova(dt) {
  if (novaFx.t >= .9) {
    novaRing.visible && (novaRing.visible = novaRing2.visible = !1);
    return
  }
  novaFx.t += dt;
  const k = Math.min(1, novaFx.t / .9),
    e = 1 - Math.pow(1 - k, 3);
  novaRing.position.set(novaFx.x, novaFx.y, novaFx.z), novaRing2.position.copy(novaRing.position), novaRing.scale.set(90 * e, 90 * e, 40), novaRing2.scale.set(72 * e, 72 * e, 30), novaRing.material.opacity = .85 * (1 - k), novaRing2.material.opacity = .6 * (1 - k)
}

function pFire() { rearView ? fireRear(player, !1, Math.max(2, planeNow().guns)) : fire(player, !1); }
function fireRear(from, enemy, count, tag) {
  for (let i = 0; i < count && bullets.length < MAXB; i++) {
    const a = from.a + Math.PI + (i - (count - 1) / 2) * .11,
      p = -(from.p || 0),
      v = enemy ? botSpeed() + 30 : playerSpeed() + 58,
      dx = Math.cos(a) * Math.cos(p),
      dy = Math.sin(p),
      dz = Math.sin(a) * Math.cos(p);
    bullets.push({
      x: from.x + dx * 4,
      y: from.y + dy * 4,
      z: from.z + dz * 4,
      vx: dx * v,
      vy: dy * v,
      vz: dz * v,
      life: 1.5,
      enemy,
      src: enemy ? srcName(from) + " REAR GUN" : null,
      rearTag: tag || 0,
      profile: shotProfile(from, enemy)
    })
  }
  Sound.shot(shotProfile(from, enemy), enemy)
}

function launchSalvo(from, enemy, count) {
  const targets = enemy ? [player] : targetables().filter(t => !t.dead && dist3(t, from) < (t === boss ? 140 : 120)).sort((a, b) => dist3(a, from) - dist3(b, from));
  for (let i = 0; i < count; i++) {
    const shot = {
        ...from,
        a: from.a + (i - (count - 1) / 2) * .24
      },
      m = launchMissile(shot, enemy);
    m.target = targets.length ? targets[i % targets.length] : null
  }
}

function ring(x, y, z, r, col, n = 36, spd = 40) {
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    addPart(x + Math.cos(a) * r * .1, y, z + Math.sin(a) * r * .1, Math.cos(a) * spd, rand(-1, 1), Math.sin(a) * spd, .45, .42, col, .5)
  }
}

function loseMissileLocks() {
  for (const m of missiles) m.enemy && m.target === player && (m.target = null)
}

function activateSpecial() {
  if (state !== "playing" || specialCooldown > 0 || !player.alive) return;
  const kind = AIRFRAME_ABILITY[garage.plane] || "rear",
    spec = abilityOf(garage.plane);
  const pw = abilPow();
  let refund = !1;
  if (shockwave(player.x, player.y, player.z, 9, 10479586, .35), kind === "ram") ramTime = spec.time * pw, player.ramChain = 0, Sound.sfxBoost(), toast("RAM DASH \xB7 SMASH TO CHAIN");
  else if (kind === "rear") {
    rearTag++, fireRear(player, !1, 5 + Math.round(2 * (pw - 1) * 2), rearTag);
    const f = fwdOf(player);
    for (const m of missiles) if (m.enemy && !m.dead && dist3(m, player) < 40 * SPEED_K && (m.x - player.x) * f[0] + (m.z - player.z) * f[2] < 0) explode(m.x, m.y, m.z, .5), removeMissile(m), refund = !0;
    missiles = missiles.filter(m => !m.dead), toast("REAR BURST")
  }
  else if (kind === "roll") rollTotal = rollTime = spec.time * pw, rollDir = steerNow < -.05 ? -1 : steerNow > .05 ? 1 : Math.random() < .5 ? -1 : 1, loseMissileLocks(), player.ve = Math.max(player.ve || 1, 1.2), player.stall = !1, player.heat = Math.max(0, (player.heat || 0) - .25), Sound.sfxBoost(), toast("BARREL ROLL \xB7 SPEED RECOVERED");
  else if (kind === "shield") shieldTime = spec.time * pw, shieldMesh.visible = !0, Sound.tone(300, .5, "sine", .15, 900), Sound.tone(600, .4, "triangle", .06, 1200, .05), toast("IRON SHIELD \xB7 REFLECTING");
  else if (kind === "storm") stormTime = spec.time * pw, stormHeat = 0, Sound.tone(180, .35, "sawtooth", .08, 520), toast("BULLET STORM \xB7 NO AMMO COST");
  else if (kind === "sonic") {
    const R = 30 * SPEED_K * pw;
    ring(player.x, player.y, player.z, R, 14677759, 48, 55), shockwave(player.x, player.y, player.z, R, 14677759, .5), shake = Math.max(shake, .35), Sound.sfxBoom(), Sound.tone(90, .6, "sine", .3, 30);
    for (const b of bullets) b.enemy && dist3(b, player) < R * 1.2 && (b.life = 0);
    for (const m of missiles) m.enemy && !m.dead && dist3(m, player) < R * 1.45 && (explode(m.x, m.y, m.z, .5), removeMissile(m));
    missiles = missiles.filter(m => !m.dead);
    for (const b of [...bots]) !b.dead && dist3(b, player) < R && hitBot(b, 4);
    boss && !boss.dead && bossDist(player) < R && hitBoss(6, player), bots = bots.filter(b => !b.dead);
    player.ve = 1.8, player.heat = 0, player.ovh = !1, player.stall = !1, sonicTrail = { x: player.x, y: player.y, z: player.z, t: .4, R: R * .8 }, fovKick = 1.25, toast("SONIC BOOM \xB7 MACH 1")
  } else if (kind === "swarm") {
    const ts = targetables().filter(t => !t.dead && dist3(t, player) < 150 * SPEED_K && !(t.carrier && !dnCoreLockable(t))).sort((a, b) => (b.lock || 0) - (a.lock || 0) || dist3(a, player) - dist3(b, player)),
      full = ts.some(t => t.lock >= 1), n = Math.min(16, Math.round(6 * pw) * (full ? 2 : 1)), spread = Math.min(ts.length, full ? 2 : 3) || 1;
    for (let i = 0; i < n; i++) {
      const m = launchMissile({ ...player, a: player.a + (i - (n - 1) / 2) * (1.8 / n), p: (player.p || 0) + (i % 2 ? .12 : -.12) }, !1);
      m.dmg = 2, m.target = ts.length ? ts[i % spread] : null, m.mesh.scale.setScalar(1)
    }
    toast(ts.length ? (full ? "LOCKED SWARM \xB7 x2 PODS" : "SWARM PODS AWAY") : "SWARM PODS \xB7 NO TARGETS")
  } else if (kind === "cloak") cloakTime = spec.time * pw, ambushT = cloakTime + 1.2, loseMissileLocks(), Sound.tone(900, .5, "sine", .08, 200), toast("PHANTOM CLOAK \xB7 AMBUSH READY");
  else if (kind === "nova") {
    const NR = 90 * SPEED_K * (pw / 1.5);
    novaFx.t = 0, novaFx.x = player.x, novaFx.y = player.y, novaFx.z = player.z, novaRing.visible = novaRing2.visible = !0, ring(player.x, player.y, player.z, NR, 13215999, 28, 105), ring(player.x, player.y, player.z, NR, 6941439, 20, 80);
    const fl = $("novaFlash");
    fl.classList.remove("on"), fl.offsetWidth, fl.classList.add("on"), shake = Math.max(shake, .45), Sound.tone(1400, .8, "sawtooth", .06, 60), Sound.tone(70, .9, "sine", .3, 25), Sound.noise(.7, .2, 3200), Sound.sfxBoom();
    let n = 0;
    player.heat = 0, player.ovh = !1;
    for (const b of bullets) b.enemy && dist3(b, player) < NR && (b.life = 0);
    for (const m of missiles) m.enemy && !m.dead && dist3(m, player) < NR && (explode(m.x, m.y, m.z, .5), removeMissile(m));
    missiles = missiles.filter(m => !m.dead);
    for (const b of [...bots]) !b.dead && dist3(b, player) < NR && (b.stun = 3, b.specialCharge = 0, b.ramTime = 0, hitBot(b, 3), n++);
    for (const t of turrets) !t.dead && dist3(t, player) < NR && (t.stun = 3, hitTurret(t, 3), n++);
    boss && !boss.dead && dist3(boss, player) < NR * 1.17 && (boss.stun = boss.titan ? 1 : 2.5, hitBoss(8, player), n++), bots = bots.filter(b => !b.dead), toast("HALO NOVA \xB7 " + n + " HIT")
  }
  else if (kind === "tailgun") rearView = !rearView, rearSwingT = .7, Sound.tone(rearView ? 520 : 780, .15, "square", .05, rearView ? 260 : 1100), toast(rearView ? "TAIL GUNNER \xB7 FIRING AFT" : "FACING FORWARD");
  else if (kind === "carpet") bombT = spec.time * pw, bombDrop = 0, Sound.tone(180, .4, "square", .05, 90), toast("BOMB BAY OPEN");
  else if (kind === "overcharge") overT = spec.time * pw, shockwave(player.x, player.y, player.z, 14, 0x8af2ff, .4), Sound.tone(120, .8, "sawtooth", .08, 600), Sound.tone(2400, .5, "sine", .04, 800), toast("OVERCHARGE \xB7 PIERCING BEAM");
  else if (kind === "blink") alienBlink(pw);
  else if (kind === "tractor") tractorT = spec.time * pw, Sound.tone(140, .6, "sawtooth", .06, 420), toast("TRACTOR BEAM");
  else if (kind === "well") alienWellStart(pw);
  specialCooldown = spec.cooldown * (1 - .2 * run.cd) * abilCdOf(planeNow()), refund && (rearRefund = rearTag, specialCooldown *= .5, popup(player.x, player.y + 3, player.z, "TAIL CLEAR \xB7 COOLDOWN -50%", !0)), updateHud(!0), updateSpecialHud()
}

function updateSpecial(dt) {
  updateAlien(dt), overT = Math.max(0, overT - dt), rearSwingT = Math.max(0, rearSwingT - dt), updateBombs(dt);
  if (specialCooldown = Math.max(0, specialCooldown - dt), ramTime = Math.max(0, ramTime - dt), stormTime = Math.max(0, stormTime - dt), garage.plane === "halo" && Math.random() < dt * 30) {
    const a = rand(0, 6.3),
      f = fwdOf(player);
    addPart(player.x - f[0] * 3 + Math.cos(a) * -Math.sin(player.a) * 3.6, player.y + Math.sin(a) * 3.6, player.z - f[2] * 3 + Math.cos(a) * Math.cos(player.a) * 3.6, -f[0] * 4, 0, -f[2] * 4, .45, .35, Math.random() < .5 ? 13215999 : 6941439, .5)
  }
  if (cloakTime = Math.max(0, cloakTime - dt), shieldTime > 0 ? (shieldTime -= dt, shieldMesh.visible = shieldTime > 0 && (shieldTime > 1 || Math.floor(time * 10) % 2 === 0)) : shieldMesh.visible = !1, rollTime > 0) {
    rollTime = Math.max(0, rollTime - dt);
    const k = 1 - rollTime / rollTotal;
    player.rollFx = rollDir * k * Math.PI * 2;
    const side = rollTime > 0 ? 42 * rollDir : 0;
    player.x += -Math.sin(player.a) * side * dt, player.z += Math.cos(player.a) * side * dt, rollTime <= 0 && (player.rollFx = 0)
  }
  if (ramTime > 0) {
    const f = fwdOf(player);
    for (const s2 of [-1, 1]) addPart(player.x - f[0] * 3 - s2 * f[2] * 2, player.y, player.z - f[2] * 3 + s2 * f[0] * 2, 0, 0, 0, .35, .55, 6485484, .8)
  }
  stormTime > 0 && (player.heat = Math.max(0, (player.heat || 0) - .45 * dt)), ambushT = Math.max(0, ambushT - dt);
  if (sonicTrail && (sonicTrail.t -= dt) <= 0) {
    const T = sonicTrail;
    sonicTrail = null, shockwave(T.x, T.y, T.z, T.R, 14677759, .45), ring(T.x, T.y, T.z, T.R, 14677759, 30, 45), Sound.tone(70, .5, "sine", .25, 30);
    for (const b of [...bots]) !b.dead && dist3(b, T) < T.R && hitBot(b, 3);
    for (const b of bullets) b.enemy && dist3(b, T) < T.R && (b.life = 0);
    bots = bots.filter(b => !b.dead)
  }
  if (stormTime > 0 && Math.random() < dt * 20) {
    const f = fwdOf(player);
    addPart(player.x + f[0] * 3, player.y, player.z + f[2] * 3, rand(-3, 3), rand(-3, 3), rand(-3, 3), .2, .35, 16770154, .5)
  }
  cloakTime > 0 && Math.random() < dt * 25 && addPart(player.x + rand(-2, 2), player.y + rand(-1, 1), player.z + rand(-2, 2), 0, 0, 0, .4, .4, 11967999, .6), lastThreatStage = lvT >= 150 ? 3 : lvT >= 90 ? 2 : lvT >= 45 ? 1 : 0
}
let specialHudKey = "";

function updateSpecialHud() {
  if (!(state === "playing" || state === "ready")) {
    specialHudKey !== "off" && (specialHudKey = "off", $("btnSpecial").classList.add("hidden"));
    return
  }
  const spec = abilityOf(garage.plane),
    act = abilityActive(),
    label = act ? "ACTIVE" : specialCooldown > 0 ? Math.ceil(specialCooldown) + "s" : "READY",
    disabled = state !== "playing" || specialCooldown > 0,
    clock = Math.floor(gameTime / 60) + ":" + String(Math.floor(gameTime % 60)).padStart(2, "0"),
    threat = directorLabel(),
    key = [spec.name, label, disabled, act, clock, threat].join("|");
  key !== specialHudKey && (specialHudKey = key, $("btnSpecial").classList.remove("hidden"), $("specialName").textContent = spec.name, $("specialState").textContent = label, $("btnSpecial").disabled = disabled, $("btnSpecial").classList.toggle("active", act), $("btnSpecial").classList.toggle("ready", !disabled), $("survivalClock").textContent = clock, $("threatLabel").textContent = threat, $("threatLabel").classList.toggle("boss", dirPhase === "boss" || !!boss || duelLock()))
}

function enemyAirframeAt(seconds, roll, active) {
  const cap = seconds >= 150 ? 3 : seconds >= 90 ? 2 : 1;
  if (seconds < 45 || active >= cap || roll > .6) return null;
  const pool = seconds >= 150 ? ["lancer", "brick", "twin", "seraph", "spectre", "halo"] : seconds >= 90 ? ["lancer", "brick", "twin", "seraph"] : ["lancer", "brick"];
  return pool[Math.min(pool.length - 1, Math.floor(roll / .6 * pool.length))]
}

function configureEnemyAirframe(b) {
  const id = enemyAirframeAt(lvT, Math.random(), bots.filter(b2 => !b2.dead && b2.airframe).length);
  if (!id) return;
  const p = PLANES.find(p2 => p2.id === id);
  b.airframe = id, b.ability = ENEMY_ABILITY[id], b.specialCd = rand(5, 8), b.specialCharge = 0, b.ramTime = 0, b.hp = Math.max(5, 6 + p.hp), b.heavy = p.hp >= 2, b.scale = b.heavy ? 1.2 : 1, b.spd = p.speed * (b.heavy ? .85 : 1), b.guns = p.guns, b.pts = 350 + (b.heavy ? 100 : 0), b.mesh = makePlane(14044249, 16755284, p.shape, !0), b.heavy && b.mesh.scale.multiplyScalar(1.2)
}

function updateEnemySpecial(b, dt, d, hostile) {
  if (!(!hostile || !player.alive || !b.airframe)) {
    if (b.ramTime = Math.max(0, (b.ramTime || 0) - dt), b.specialCd -= dt, b.specialCharge > 0) b.specialCharge -= dt, addPart(b.x, b.y + 2, b.z, 0, 1, 0, .25, .65, 16758347, .4), b.specialCharge <= 0 && (b.ability === "ram" ? (b.ramTime = 1.65, b.ramHeading = Math.atan2(player.z - b.z, player.x - b.x)) : b.ability === "rear" ? fireRear(b, !0, 3) : missiles.filter(m => m.enemy && !m.dead).length <= 4 && launchSalvo(b, !0, 2), b.specialCd = b.ability === "rear" ? 6 : 12, b.attackSpent = !0);
    else if (b.specialCd <= 0 && d > 12 && d < 85) {
      const f = fwdOf(b),
        dot = ((player.x - b.x) * f[0] + (player.y - b.y) * f[1] + (player.z - b.z) * f[2]) / Math.max(d, .01);
      (b.ability === "rear" && dot < -.7 && d < 48 || b.ability === "ram" && dot > .6 || b.ability === "salvo") && (b.specialCharge = 1.2, toast(b.ability === "ram" ? "ENEMY RAM CHARGING" : b.ability === "rear" ? "ENEMY REAR GUN" : "ENEMY MISSILE LOCK"), Sound.sfxEmpty())
    }
  }
}
$("btnSpecial").addEventListener("pointerdown", e => {
  e.preventDefault(), e.stopPropagation(), Sound.init(), activateSpecial()
}), $("btnSpecial").addEventListener("click", e => {
  e.detail === 0 && (Sound.init(), activateSpecial())
}), window.addEventListener("keydown", e => {
  e.code === "KeyQ" && !e.repeat && !$("audioDialog").open && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && (e.preventDefault(), Sound.init(), activateSpecial())
});
let previewRenderer = null,
  previewScene = null,
  previewCamera = null,
  previewPlane = null,
  previewBoostUntil = 0;

function refreshPreview() {
  if (!previewScene) return;
  previewPlane && previewScene.remove(previewPlane);
  const candidate = isFleetView() ? PLANES.find(p => p.id === inspectedPlane) : null,
    pt = paintNow();
  previewPlane = candidate ? makePlane(pt.body, pt.wing, candidate.shape) : player.mesh.clone(!0), previewPlane.position.set(0, 0, 0), previewPlane.rotation.set(0, 0, 0), previewPlane.visible = !0, candidate && (decoratePlane(previewPlane), decorateMastery(previewPlane, candidate.id)), previewSwoopT = 1, Sound.ctx && Sound.tone(300, .35, "sine", .03, 900);
  const shown = candidate || planeNow();
  previewCamera.position.set(7, 4, 7).multiplyScalar(["lancer", "seraph", "spectre", "halo"].includes(shown.shape) ? 1.35 : 1), previewCamera.lookAt(0, 0, 0), previewScene.add(previewPlane)
}

function renderPreview(dt) {
  if (state !== "garage") return;
  if (!previewRenderer) {
    previewRenderer = new THREE.WebGLRenderer({
      canvas: $("planePreview"),
      alpha: !0,
      antialias: !0
    }), previewRenderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)), previewScene = new THREE.Scene, previewScene.add(new THREE.HemisphereLight(14284543, 4543846, 2.4));
    const light = new THREE.DirectionalLight(16765088, 3);
    light.position.set(4, 8, 4), previewScene.add(light), previewCamera = new THREE.PerspectiveCamera(38, 1, .1, 100), previewCamera.position.set(7, 4, 7), previewCamera.lookAt(0, 0, 0), refreshPreview()
  }
  const w = $("planePreview").clientWidth,
    h = $("planePreview").clientHeight;
  if (w < 1 || h < 1) return;
  const size = previewRenderer.getSize(new THREE.Vector2);
  (size.x !== w || size.y !== h) && (previewRenderer.setSize(w, h, !1), previewCamera.aspect = w / h, previewCamera.updateProjectionMatrix()), previewSwoopT = Math.max(0, previewSwoopT - dt * 1.3), previewPlane.rotation.y += dt * (.27 + 7 * previewSwoopT * previewSwoopT), previewPlane.position.x = -4 * previewSwoopT * previewSwoopT;
  for (const g of previewPlane.__spin || (previewPlane.__spin = spinPartsOf(previewPlane))) g.rotation.z += dt * 3.2 * (g.userData.dir || 1);
  previewPlane.position.y = Math.sin(performance.now() * .001) * .13;
  const previewFov = performance.now() < previewBoostUntil ? 48 : 38;
  previewCamera.fov = lerp(previewCamera.fov, previewFov, Math.min(1, dt * 7)), previewCamera.updateProjectionMatrix(), previewPlane.traverse(o => {
    o.name === "boost-flame" && (o.visible = performance.now() < previewBoostUntil, o.visible && (o.scale.x = 1 + Math.sin(performance.now() * .06) * .12))
  }), previewRenderer.render(previewScene, previewCamera)
}
$("partList").addEventListener("click", e => {
  const b = e.target.closest("[data-part]");
  !b || state !== "garage" || (Sound.init(), Sound.sfxClick(), requestPurchase("part", b.dataset.part, b.dataset.slot), $("partList").querySelector(`[data-slot="${b.dataset.slot}"][data-part="${b.dataset.part}"]`).focus({
    preventScroll: !0
  }))
}), $("btnPreviewBoost").addEventListener("click", () => {
  Sound.init(), Sound.sfxBoost(), previewBoostUntil = performance.now() + 4e3
}), document.querySelector(".garageTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-section]");
  if (b) {
    for (const el of document.querySelectorAll("[data-page]")) el.classList.toggle("hidden", el.dataset.page !== b.dataset.section);
    for (const el of document.querySelectorAll("[data-section]")) {
      const on = el === b;
      el.classList.toggle("active", on), el.setAttribute("aria-pressed", on)
    }
    Sound.init(), Sound.sfxClick(), b.dataset.section === "fleet" ? (inspectedPlane = inspectedPlane || garage.plane, renderFleet()) : (renderParts(), $("aircraftOffer").classList.add("hidden"), $("btnGaragePlay").textContent = "TAKE OFF \u2197", document.querySelector(".previewNote").textContent = "Live build \xB7 parts change your aircraft"), refreshPreview()
  }
});
const audioMix = {
  music: .35,
  sfx: .8,
  engine: .45
};
let engineGain = null,
  engineOsc = null,
  engineHarmonic = null,
  engineAlien = null,
  ALIEN_VOICE = ["sine", "sine", 1.9, 2.85, 5.5, 14];

function createEngineAudio() {
  const ctx = Sound.ctx;
  engineGain = ctx.createGain(), engineGain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass", filter.frequency.value = 420, engineOsc = ctx.createOscillator(), engineOsc.type = "sawtooth", engineOsc.frequency.value = 55, engineHarmonic = ctx.createOscillator(), engineHarmonic.type = "triangle", engineHarmonic.frequency.value = 110, engineOsc.connect(filter), engineHarmonic.connect(filter), filter.connect(engineGain), engineGain.connect(Sound.master), engineOsc.start(), engineHarmonic.start()
}

function applyAudio() {
  Sound.musicG && Sound.musicG.gain.setTargetAtTime(audioMix.music * .6, Sound.ctx.currentTime, .05), Sound.sfxG && Sound.sfxG.gain.setTargetAtTime(audioMix.sfx, Sound.ctx.currentTime, .05);
  for (const key of Object.keys(audioMix)) $(key + "Volume").value = Math.round(audioMix[key] * 100), $(key + "Value").textContent = Math.round(audioMix[key] * 100) + "%"
}

function loadAudio(raw) {
  try {
    const a = JSON.parse(raw || "{}");
    for (const k of Object.keys(audioMix)) Number.isFinite(a[k]) && (audioMix[k] = clamp(a[k], 0, 1))
  } catch {}
  applyAudio()
}

function updateEngineAudio() {
  if (!engineGain || Sound.ctx.state !== "running") return;
  const active = state === "playing" || state === "ready",
    t = Sound.ctx.currentTime;
  engineGain.gain.setTargetAtTime(active ? audioMix.engine * (ramTime > 0 || player.boosting ? .1 : .065) : 0, t, .12);
  const rpm = 48 + playerSpeed() * 1.7 + Math.abs(climbNow) * 9 + (garage.loadout.engine === "turbo" ? 18 : 0), al = isAlienPlane();
  const vo = al ? ALIEN_VOICE : ENGINE_VOICE[garage.plane] || ENGINE_VOICE.classic;
  vo !== engineAlien && (engineAlien = vo, engineOsc.type = vo[0], engineHarmonic.type = vo[1]);
  const wob = vo[4] ? Math.sin(time * vo[4]) * vo[5] : 0;
  engineOsc.frequency.setTargetAtTime(Math.max(20, rpm * vo[2] + wob), t, .06), engineHarmonic.frequency.setTargetAtTime(Math.max(20, rpm * vo[3] + wob * 1.5), t, .06)
}
function applyControls() {
  for (const k of ["steer", "aim"]) $(k + "Sens").value = Math.round(ctl[k] * 100), $(k + "SensValue").textContent = Math.round(ctl[k] * 100) + "%";
}
function loadControls(raw) {
  try { const a = JSON.parse(raw || "{}"); for (const k of ["steer", "aim"]) Number.isFinite(a[k]) && (ctl[k] = clamp(a[k], .4, 1.6)); } catch {}
  applyControls();
}
for (const k of ["steer", "aim"]) $(k + "Sens").addEventListener("input", e => {
  ctl[k] = clamp(Number(e.target.value) / 100, .4, 1.6), applyControls(), Store.set("controls", JSON.stringify(ctl));
});
for (const key of Object.keys(audioMix)) $(key + "Volume").addEventListener("input", e => {
  audioMix[key] = Number(e.target.value) / 100, applyAudio(), Store.set("audio", JSON.stringify(audioMix))
});
$("btnAudio").addEventListener("click", () => {
  busy || (Sound.init(), (state === "playing" || state === "ready") && pauseGame(), $("audioDialog").showModal(), $("audioDialog").scrollTop = 0)
}), Sound.sfxShoot = function() {
  this.noise(.075, .1, 1900), this.tone(150, .065, "triangle", .12, 55)
}, Sound.sfxBoom = function() {
  this.noise(.65, .4, 680), this.noise(.13, .2, 2100), this.tone(85, .65, "sine", .3, 27)
};
const portraitPhone = matchMedia("(pointer:coarse) and (orientation:portrait)");
portraitPhone.addEventListener("change", () => {
  portraitPhone.matches && (state === "playing" || state === "ready") && pauseGame()
});
let inspectedPlane = null;
const thumbnailCache = new Map,
  AIRFRAME_STORIES = {
    viper: {
      role: "THE HORNET",
      headline: "Sting and twist.",
      detail: "A tiny armoured pod under a crescent wing, screaming engines and twin guns that can swing to fire aft.",
      accent: "#ff5a3a"
    },
    anvil: {
      role: "THE BOMBER",
      headline: "Weather from above.",
      detail: "Two hulls, one bomb bay. Slow to turn and hard to kill \u2014 whatever flies or stands beneath it has a bad day.",
      accent: "#ffb040"
    },
    prism: {
      role: "THE LIGHTBRINGER",
      headline: "No bullets. Just light.",
      detail: "A double-pointed crystal hull with a lens at the tip. Hold fire for a continuous beam that hits the instant you aim \u2014 no lead needed.",
      accent: "#8af2ff"
    },
    orb: {
      role: "THE VISITOR",
      headline: "Here. Then gone.",
      detail: "A palm-sized saucer with a spinning rim. Blinks through space and turns on a coin, but can't take much.",
      accent: "#7dff6a"
    },
    mantis: {
      role: "THE HUNTER",
      headline: "It pulls you in.",
      detail: "A living alien hunter with glowing membrane wings. Its tractor beam drags prey into twin plasma guns.",
      accent: "#c6ff3b"
    },
    mothership: {
      role: "THE MOTHERSHIP",
      headline: "Gravity bends to it.",
      detail: "A layered command saucer with counter-rotating rings. Triple plasma, a heavy hull and wells that swallow the sky.",
      accent: "#c77dff"
    },
    lancer: {
      role: "THE INTERCEPTOR",
      headline: "A blade through the sky.",
      detail: "Needle nose, swept wings and blue twin thrusters. High speed with a lighter hull.",
      accent: "#68e7f2"
    },
    seraph: {
      role: "THE STARFIGHTER",
      headline: "Four wings. Pure presence.",
      detail: "Split-level swept wings with four glowing engines. Twin guns and balanced flight.",
      accent: "#ffbb75"
    },
    spectre: {
      role: "THE SHADOW BOMBER",
      headline: "A shadow with a payload.",
      detail: "A wide, angular flying wing. Reinforced hull and six missiles, with slower handling.",
      accent: "#93b9ff"
    },
    halo: {
      role: "THE FLAGSHIP",
      headline: "The crown of the fleet.",
      detail: "Twin counter-rotating ring drives and triple ion cannons. The fastest, most agile airframe in the hangar \u2014 and still armored.",
      accent: "#d0b1ff"
    },
    classic: {
      role: "THE ALL-ROUNDER",
      headline: "Your first taste of freedom.",
      detail: "A dependable single-prop aircraft. Balanced handling for every sortie.",
      accent: "#f3b864"
    },
    swift: {
      role: "THE DOGFIGHTER",
      headline: "Own every turn.",
      detail: "Slim fuselage. Swept wings. Fast handling for pilots who stay on the move.",
      accent: "#72d8cc"
    },
    brick: {
      role: "THE FLYING FORTRESS",
      headline: "Built to take the hit.",
      detail: "Stacked biplane wings and a reinforced airframe. Heavy armor, with slower turns.",
      accent: "#e9b577"
    },
    twin: {
      role: "THE DOUBLE THREAT",
      headline: "Two guns. One target.",
      detail: "Distinctive twin wing engines. Fires two bullets at once for concentrated firepower.",
      accent: "#90bdfa"
    },
    falcon: {
      role: "THE DAY 7 REWARD",
      headline: "Earn your jet age.",
      detail: "Swept jet silhouette, twin fins and a glowing exhaust. Twin guns, four missiles and an extra heart.",
      accent: "#c7adff"
    }
  };

function isFleetView() {
  return !document.querySelector('[data-page="fleet"]').classList.contains("hidden")
}

function makeFleetThumbnails() {
  const pt = paintNow(),
    key = pt.body + ":" + pt.wing;
  if (thumbnailCache.has(key)) return thumbnailCache.get(key);
  const r = new THREE.WebGLRenderer({
    alpha: !0,
    antialias: !0,
    preserveDrawingBuffer: !0
  });
  r.setSize(440, 230, !1), r.setPixelRatio(1);
  const s2 = new THREE.Scene;
  s2.add(new THREE.HemisphereLight(15793407, 4019041, 2.2));
  const light = new THREE.DirectionalLight(16769472, 3);
  light.position.set(5, 8, 6), s2.add(light);
  const cam = new THREE.PerspectiveCamera(34, 440 / 230, .1, 100);
  cam.position.set(9, 5, 10), cam.lookAt(0, 0, 0);
  const images = {};
  for (const p of PLANES) {
    const model = makePlane(pt.body, pt.wing, p.shape);
    s2.add(model), r.render(s2, cam), images[p.id] = r.domElement.toDataURL("image/png"), s2.remove(model)
  }
  return r.dispose(), r.forceContextLoss(), thumbnailCache.set(key, images), images
}

function renderFleet() {
  if (!isFleetView()) return;
  inspectedPlane = inspectedPlane || garage.plane;
  const thumbs = makeFleetThumbnails();
  $("planeList").innerHTML = PLANES.map(p => {
    const own = garage.planes.includes(p.id),
      equipped = garage.plane === p.id,
      story = AIRFRAME_STORIES[p.id],
      status = "LV " + masteryLevel(p.id) + " \xB7 " + (equipped ? "IN YOUR HANGAR" : own ? "OWNED" : p.cost === null ? "DAY 7 REWARD" : "LOCKED") + " \xB7 GRADE " + tierGrade(tierOf(p));
    return `<button class="aircraftCard ${inspectedPlane===p.id?"inspected":""}" style="--air-accent:${story.accent}" data-inspect="${p.id}" aria-pressed="${inspectedPlane===p.id}" aria-label="Inspect ${p.name}"><div class="aircraftVisual"><span class="aircraftStatus">${status}</span><img src="${thumbs[p.id]}" alt="${p.name} aircraft design" width="440" height="230"></div><div class="aircraftInfo"><small>${story.role}</small><b>${p.name}</b><p>${story.headline}</p><em class="abilTag">&#9733; ${abilityOf(p.id).name}</em><div class="aircraftPrice"><span>${own?"INSPECT AIRCRAFT":p.cost===null?"7 DAILY CLAIMS":coinHtml(p.cost)}</span><span aria-hidden="true">\u2197</span></div></div></button>`
  }).join(""), renderAircraftOffer()
}

function renderAircraftOffer() {
  const p = PLANES.find(p2 => p2.id === inspectedPlane) || planeNow(),
    story = AIRFRAME_STORIES[p.id],
    own = garage.planes.includes(p.id),
    equipped = garage.plane === p.id;
  $("previewName").textContent = p.name, $("btnGaragePlay").textContent = `FLY ${planeNow().name} \u2197`;
  const disabled = equipped || !own && (p.cost === null || garage.coins < p.cost),
    label = equipped ? "EQUIPPED" : own ? "EQUIP AIRCRAFT" : p.cost === null ? "DAY 7 REWARD" : `UNLOCK \xB7 ${p.cost} COINS`,
    note = own ? "" : p.cost === null ? `Claim your daily bonus ${7-garage.daily.day} more time${7-garage.daily.day===1?"":"s"} to unlock.` : garage.coins < p.cost ? `${p.cost-garage.coins} more coins needed` : "Ready to join your hangar";
  $("aircraftOffer").classList.remove("hidden");
  const special = abilityInfoOf(p), mLv = masteryLevel(p.id), mXp = masteryOf(p.id).xp, mPrev = mLv > 1 ? masteryNeed(mLv - 1) : 0, mNext = mLv < 10 ? masteryNeed(mLv) : mXp, nextU = MASTERY_UNLOCKS.find(u => u[0] > mLv),
    mastery = `<div class="mastery"><b>\u201C${CALLSIGNS[p.id] || p.name}\u201D \xB7 PILOT LV ${mLv}</b><div class="mbar"><i style="width:${mLv >= 10 ? 100 : Math.round((mXp - mPrev) / Math.max(1, mNext - mPrev) * 100)}%"></i></div><small>${mLv >= 10 ? "LEGEND \xB7 every unlock earned" : `${mXp - mPrev} / ${mNext - mPrev} XP \xB7 next: ${nextU[1]} at LV ${nextU[0]}`} \xB7 ${masteryOf(p.id).kills} kills</small></div>`;
  $("aircraftOffer").innerHTML = `${mastery}<span class="offerRole">${story.role}</span><p>${story.detail}</p><div class="abilityInfo"><b>${special.name} \xB7 Q</b><p>${special.description}</p>${tierOf(p) > .05 ? `<small>GRADE ${tierGrade(tierOf(p))} \xB7 +${Math.round((abilPowOf(p) - 1) * 100)}% ability power</small><br>` : ""}<small>${special.cooldown}s cooldown</small></div><button class="btn offerBuy" data-plane="${p.id}" ${disabled?"disabled":""}>${label}</button><small>${note}</small>`;
  const mod = partStats(),
    values = [
      ["GRADE", tierGrade(tierOf(p))],
      ["CRUISE", Math.round(180 * (1 + .08 * tierOf(p)) * p.speed * mod.speed) + " km/h"],
      ["HANDLING", Math.round(2.7 * (1 + .1 * garage.lv.engine) * (1 + .1 * tierOf(p)) * p.turn * mod.turn / 2.7 * 100) + "%"],
      ["ARMOR", armorOf(p, mod) + " \xB7 " + (HEARTS + armorOf(p, mod)) + " HITS"],
      ["GUNS", p.guns],
      ["MISSILES", p.missiles + Math.floor(garage.lv.ammo / 2)],
      ["LOCK-ON", lockRangeOf(p) + "m \xB7 " + Math.round(lockRingOf(p) / .3 * 100) + "%"],
      ["LOCK SPEED", Math.round((.9 + .6 * tierOf(p)) * 100) + "%"],
      ["BOOST", boostSecsOf(p).toFixed(1) + " s"]
    ];
  $("buildStats").innerHTML = values.map(([k, v]) => `<div><small>${k}</small><strong>${v}</strong></div>`).join(""), document.querySelector(".previewNote").textContent = "Preview with your current paint & components"
}
$("planeList").addEventListener("click", e => {
  const b = e.target.closest("[data-inspect]");
  !b || state !== "garage" || (inspectedPlane = b.dataset.inspect, Sound.init(), Sound.sfxClick(), renderFleet(), refreshPreview(), $("planeList").querySelector(`[data-inspect="${inspectedPlane}"]`).focus({
    preventScroll: !0
  }))
});

function weaponProfile(id, weapon = "balanced") {
  return weapon === "heavy" ? "cannon" : weapon === "rapid" ? "rotary" : id === "viper" ? "laser" : id === "anvil" ? "cannon" : id === "prism" ? "beam" : id === "orb" ? "plasma" : id === "mantis" ? "bio" : id === "mothership" ? "grav" : id === "spectre" ? "cannon" : id === "halo" ? "ion" : ["lancer", "seraph", "falcon"].includes(id) ? "laser" : id === "twin" ? "rotary" : "ballistic"
}

function shotProfile(from, enemy) {
  return weaponProfile(enemy ? from.airframe || "classic" : garage.plane, enemy ? "balanced" : garage.loadout.weapon)
}
const SHOT_COLORS = {
  ballistic: 16770154,
  cannon: 16756050,
  rotary: 16772784,
  laser: 6550271,
  ion: 13015807,
  plasma: 8257386,
  bio: 13041467,
  grav: 13073919,
  beam: 9106175
};

function addExhaust(root, shape) {
  const body = root.userData.body,
    jet = ["lancer", "seraph", "spectre", "halo", "falcon", "orb", "mantis", "mothership", "prism", "viper", "anvil"].includes(shape),
    material = addExhaust.materials || (addExhaust.materials = [new THREE.MeshBasicMaterial({
      color: 16738085,
      transparent: !0,
      opacity: .7,
      depthWrite: !1,
      blending: THREE.AdditiveBlending
    }), new THREE.MeshBasicMaterial({
      color: 16771987,
      transparent: !0,
      opacity: .9,
      depthWrite: !1,
      blending: THREE.AdditiveBlending
    }), new THREE.MeshBasicMaterial({
      color: 4378623,
      transparent: !0,
      opacity: .7,
      depthWrite: !1,
      blending: THREE.AdditiveBlending
    })]);
  for (const side of [-1, 1]) {
    const flame = new THREE.Group;
    flame.name = "boost-flame", flame.position.set(jet ? -2.4 : -1.9, -.12, side * (jet ? .66 : .42)), flame.visible = !1, body.add(flame);
    const outer = new THREE.Mesh(G.cone, material[jet ? 2 : 0]);
    outer.rotation.z = Math.PI / 2, outer.position.x = -.9, outer.scale.set(.32, 2.1, .32), flame.add(outer);
    const core = new THREE.Mesh(G.cone, material[1]);
    core.rotation.z = Math.PI / 2, core.position.x = -.45, core.scale.set(.18, 1.3, .18), flame.add(core)
  }
}

function flamesOf(mesh) {
  if (!mesh.userData.flames) {
    const f = [];
    mesh.traverse(o => {
      o.name === "boost-flame" && f.push(o)
    }), mesh.userData.flames = f
  }
  return mesh.userData.flames
}

function animateExhaust(entity, boost, dt) {
  if (!entity?.mesh) return;
  const pulse = 1 + Math.sin(time * 65) * .13;
  for (const o of flamesOf(entity.mesh)) !boost && !o.visible || (o.visible = boost, boost && o.scale.set(pulse, 1 + Math.sin(time * 41) * .1, 1));
  if (boost && Math.random() < Math.min(1, dt * 40)) {
    const f = fwdOf(entity),
      jet = ["lancer", "seraph", "spectre", "halo", "falcon", "orb", "mantis", "mothership", "prism", "viper", "anvil"].includes(entity.airframe || garage.plane);
    addPart(entity.x - f[0] * 5, entity.y - f[1] * 5, entity.z - f[2] * 5, -f[0] * 8, -f[1] * 8, -f[2] * 8, .3, .6, jet ? 7462911 : 16755270, 1.4)
  }
}
let speedLineCache = -1;

function updateCombatFx(dt, raw) {
  updateVapor(dt);
  animateExhaust(player, state === "playing" && (ramTime > 0 || player.boosting), dt);
  for (const b of bots) animateExhaust(b, state === "playing" && b.ramTime > 0, dt);
  updateShockwaves(raw);
  const sl = state === "playing" ? clamp((ramTime > 0 ? .85 : 0) + (player.boosting ? .5 : 0) + (rollTime > 0 ? .4 : 0) + (speedMul() - 1.5) * .3 + (slowT > 0 && slowScale < .5 ? .35 : 0), 0, .9) : 0;
  Math.abs(sl - speedLineCache) > .02 && (speedLineCache = sl, $("speedLines").style.opacity = sl.toFixed(2)), Sound.mode = duelLock() ? "titan" : boss && !boss.dead ? "boss" : "normal", Sound.drums = state === "playing" || state === "ready"
}
Sound.shot = function(profile, enemy = !1) {
  const v = enemy ? .45 : 1;
  profile === "beam" ? (this.tone(210, .35, "sawtooth", .05 * v, 220), this.tone(1320, .3, "sine", .05 * v, 1300)) : profile === "plasma" ? (this.tone(420, .16, "sine", .12 * v, 1500), this.tone(2400, .06, "sine", .03 * v, 900)) : profile === "bio" ? (this.tone(180, .12, "square", .05 * v, 90), this.tone(640, .1, "sawtooth", .03 * v, 1300), this.noise(.05, .04 * v, 3800)) : profile === "grav" ? (this.tone(90, .32, "sine", .22 * v, 45), this.tone(520, .22, "triangle", .05 * v, 160), this.tone(1040, .12, "sine", .025 * v, 260, .03)) : profile === "cannon" ? (this.noise(.17, .2 * v, 800), this.tone(100, .24, "sine", .32 * v, 28), this.tone(220, .045, "triangle", .12 * v, 60)) : profile === "laser" ? (this.tone(1450, .19, "sawtooth", .045 * v, 130), this.tone(2100, .1, "sine", .07 * v, 360)) : profile === "ion" ? (this.tone(620, .3, "sine", .13 * v, 95), this.tone(940, .24, "triangle", .07 * v, 140, .025)) : profile === "rotary" ? (this.noise(.045, .09 * v, 2600), this.tone(190, .045, "square", .04 * v, 75)) : (this.noise(.075, .1 * v, 1900), this.tone(150, .065, "triangle", .12 * v, 55))
}, Sound.sfxShoot = function() {
  this.shot(weaponProfile(garage.plane, garage.loadout.weapon))
}, Sound.sfxEnemyShoot = function(from) {
  this.shot(weaponProfile(from?.airframe || "classic"), !0)
}, Sound.sfxBoost = function() {
  if (isAlienPlane()) return this.tone(110, .7, "sine", .18, 880), this.tone(1760, .5, "sine", .03, 220), void this.noise(.5, .06, 4200);
  this.noise(.85, .15, 650), this.tone(65, .6, "sine", .2, 190), this.tone(180, .4, "sawtooth", .035, 650)
}, Sound.sfxMissile = function(enemy) {
  if (!enemy && isAlienPlane()) return this.tone(160, .35, "sine", .12, 1600), this.tone(1900, .25, "triangle", .04, 320, .05), this.tone(95, .3, "sine", .1, 60), void this.noise(.12, .04, 5200);
  this.noise(.28, enemy ? .05 : .13, 1300), this.tone(190, .27, "triangle", enemy ? .035 : .07, 950)
}, Sound.sfxLock = function() {
  if (isAlienPlane()) return this.tone(523, .12, "sine", .06, 540), this.tone(659, .12, "sine", .06, 680, .06), void this.tone(988, .2, "sine", .07, 1040, .12);
  this.tone(740, .07, "sine", .07), this.tone(1110, .09, "sine", .07, null, .075)
}, Sound.sfxAlienBoom = function() {
  this.tone(260, .55, "sine", .28, 32), this.tone(1500, .3, "sawtooth", .03, 180), this.noise(.3, .12, 2600)
}, $("btnTestWeapon").addEventListener("click", () => {
  Sound.init();
  const id = isFleetView() && state === "garage" ? inspectedPlane : garage.plane;
  Sound.shot(weaponProfile(id, garage.loadout.weapon))
});

function targetables() {
  if (netGame === "duel") return duel.rival && duel.rival.alive ? [duel.rival] : [];
  return boss && !boss.dead && !(boss.cloakT > 0) && !boss.carrier && !(boss.serpent && !serpentTargetable()) ? [...bots, ...turrets, boss] : [...bots, ...turrets]
}

function banner(title, sub = "", col = "#ffbb58") {
  const s2 = $("streak");
  s2.style.setProperty("--sc", col), s2.innerHTML = `<b>${title}</b>${sub?`<small>${sub}</small>`:""}`, s2.classList.remove("show"), s2.offsetWidth, s2.classList.add("show")
}

function killFlash() {
  const k = $("killFlash");
  k.classList.remove("on"), k.offsetWidth, k.classList.add("on")
}

function pulseScore() {
  const s2 = $("score");
  s2.classList.remove("pulse"), s2.offsetWidth, s2.classList.add("pulse")
}
const STREAKS = {
  2: ["DOUBLE KILL", "#62f5ec"],
  3: ["TRIPLE KILL", "#ffbb58"],
  4: ["MULTI KILL", "#ff9b4a"],
  5: ["RAMPAGE", "#ff5c7a"],
  7: ["UNSTOPPABLE", "#c9a8ff"],
  10: ["GODLIKE", "#ffd24a"]
};

function awardKill(x, y, z, pts, big = !1) {
  combo = comboT > 0 ? combo + 1 : 1, comboT = COMBO_WINDOW;
  const mul = big ? 1 : Math.min(3, 1 + (combo - 1) * .5),
    got = Math.round(pts * mul / 10) * 10;
  killPts += got, bestCombo = Math.max(bestCombo, combo), popup(x, y, z, "+" + got, big || combo >= 3, big && pts >= 5e3), flashReticle("kill"), killFlash(), pulseScore(), big || hitStop(.05, .2);
  const st = STREAKS[combo] || (combo > 10 && combo % 5 === 0 ? ["GODLIKE x" + combo, "#ffd24a"] : null);
  if (!big && st && (banner(st[0], "x" + (mul % 1 ? mul.toFixed(1) : mul) + " SCORE", st[1]), hitStop(.14, .18), Sound.sfxFanfare(combo >= 5)), combo >= 2) {
    const shown = Math.min(3, 1 + (combo - 1) * .5);
    $("comboN").textContent = "x" + (shown % 1 ? shown.toFixed(1) : shown), $("combo").querySelector("small").textContent = combo + " KILL COMBO";
    const c = $("combo");
    c.classList.remove("hidden", "bump"), c.offsetWidth, c.classList.add("bump"), Sound.tone(520 + Math.min(combo, 8) * 90, .12, "triangle", .08), Sound.tone(780 + Math.min(combo, 8) * 90, .14, "triangle", .06, null, .06)
  }
}

function updateCombo(dt) {
  if (!(comboT <= 0)) {
    if (comboT -= dt, comboT <= 0) {
      combo = 0, $("combo").classList.add("hidden");
      return
    }
    combo >= 2 && ($("comboBar").style.width = (comboT / COMBO_WINDOW * 100).toFixed(1) + "%")
  }
}
let hitMarkT = 0;

function flashReticle(kind) {
  kind === "hit" && (hitMarkT > performance.now() || reticle.classList.contains("kill")) || (hitMarkT = performance.now() + 90, reticle.classList.remove("hit", "kill"), reticle.offsetWidth, reticle.classList.add(kind), clearTimeout(flashReticle.t), flashReticle.t = setTimeout(() => reticle.classList.remove("hit", "kill"), kind === "kill" ? 360 : 170))
}
const pops = [];

function popup(x, y, z, text, big, mega) {
  pops.length >= 12 && pops.shift().el.remove();
  const el = document.createElement("div");
  el.className = "pop" + (mega ? " mega" : big ? " big" : ""), el.textContent = text, $("popups").appendChild(el), pops.push({
    x,
    y: y + 2,
    z,
    el,
    until: performance.now() + 1e3
  })
}

function updatePopups() {
  const now = performance.now();
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    if (now > p.until) {
      p.el.remove(), pops.splice(i, 1);
      continue
    }
    const sp = toScreen(p.x, p.y, p.z);
    if (!sp) {
      p.el.style.visibility = "hidden";
      continue
    }
    p.el.style.visibility = "", p.el.style.transform = `translate(${sp.x.toFixed(0)}px,${sp.y.toFixed(0)}px) translate(-50%,-50%)`
  }
}

function clearPopups() {
  for (const p of pops) p.el.remove();
  pops.length = 0
}

function muzzleFlash() {
  const f = fwdOf(player),
    guns = planeNow().guns;
  for (let g = 0; g < guns; g++) {
    const side = gunSide(guns, g),
      ox = -Math.sin(player.a) * side,
      oz = Math.cos(player.a) * side;
    addPart(player.x + f[0] * 3.4 + ox, player.y + f[1] * 3.4 - .3, player.z + f[2] * 3.4 + oz, f[0] * 20, f[1] * 20, f[2] * 20, .06, .55, 16773280, .8)
  }
}

function startTips() {
  tipT = 0, tipList = tutorialDone ? [] : [
    [.6, IS_TOUCH ? "Drag anywhere for a <b>JOYSTICK</b> \xB7 let go = fly straight" : "Mouse left/right <b>BANKS</b> \xB7 bank, then pull back to <b>TURN HARD</b>"],
    [6, IS_TOUCH ? "Hold <b>BOOST</b> for speed (watch the heat) \xB7 <b>BRAKE</b> makes chasers overshoot" : "<b>SHIFT</b> boost (watch the heat) \xB7 <b>Z</b> brake makes chasers overshoot"],
    [9, "Put the <b>+</b> on the pink <b>&#9670;</b> lead mark and fire to hit moving planes"],
    [13, "Climbs and hard turns burn speed \xB7 too slow = <b>STALL</b> \u2014 dive or boost to recover"],
    [18, IS_TOUCH ? "Hold <b>FIRE</b> to shoot \xB7 fly through <b>yellow boxes</b> to reload" : "Hold <b>CLICK</b> to shoot \xB7 fly through <b>yellow boxes</b> to reload"],
    [24, IS_TOUCH ? "Tap <b>AIM</b> and keep an enemy in the ring to <b>LOCK ON</b>" : "Hold <b>RIGHT-CLICK</b> (or <b>X</b>) and keep an enemy in the ring to <b>LOCK ON</b>"],
    [30, IS_TOUCH ? "At <b>LOCK</b>, <b>MSL</b> fires a missile that never misses" : "At <b>LOCK</b>, <b>E</b> fires a missile that never misses"],
    [36, IS_TOUCH ? "<b>FLARE</b> fools enemy missiles \xB7 <b>SPECIAL</b> = your aircraft\u2019s own ability" : "<b>F</b> drops flares \xB7 <b>Q</b> = your aircraft\u2019s own ability"],
    [43, "Chain kills quickly for a <b>COMBO</b> bonus"],
    [50, "Clear <b>3 waves</b> to face the stage <b>BOSS</b>"]
  ]
}

function hideTip() {
  $("tip").classList.remove("show"), tipT = 0
}

function updateTips(dt) {
  if (tipT > 0 && (tipT -= dt, tipT <= 0 && $("tip").classList.remove("show")), !tipList.length || gameTime < tipList[0][0]) return;
  const [, html] = tipList.shift();
  $("tip").innerHTML = html, $("tip").classList.add("show"), tipT = 5, tipList.length || (tutorialDone = !0, Store.set("tut10", "1"))
}

function makeBoss() {
  const g = new THREE.Group,
    body = new THREE.Group;
  g.add(body), body.rotation.order = "ZXY";
  const hull = M(4608875, {
      roughness: .5
    }),
    dark = M(1910584),
    red = M(14044249),
    gold = M(16759640, {
      metalness: .3
    }),
    env = part(G.capsule, hull, 3.4, 4.2, 3.4, 0, 0, 0, body);
  env.rotation.z = Math.PI / 2;
  for (const x of [-3.6, 3.2]) {
    const r = part(G.torus, red, 3.45, 3.45, 3.45, x, 0, 0, body);
    r.rotation.y = Math.PI / 2
  }
  part(G.sph, red, 1.6, 1.6, 1.6, 8.9, 0, 0, body);
  for (const [y, z, sx, sy, sz] of [
      [2.6, 0, 3.2, 3.2, .35],
      [-2.6, 0, 3.2, 3.2, .35],
      [0, 2.6, 3.2, .35, 3.2],
      [0, -2.6, 3.2, .35, 3.2]
    ]) part(G.box, red, sx, sy, sz, -8, y, z, body);
  part(G.box, dark, 6, 1.5, 2, .5, -3.9, 0, body);
  const win = M(16773544, {
    emissive: 16762186,
    emissiveIntensity: 1.2
  });
  for (let i = 0; i < 5; i++)
    for (const sd of [-1, 1]) part(G.box, win, .55, .45, .1, -1.4 + i * .95, -3.7, sd * 1.02, body);
  const props = [];
  for (const sd of [-1, 1]) {
    const pod = part(G.capsule, dark, .55, .9, .55, -1, -3.2, sd * 3.2, body);
    pod.rotation.z = Math.PI / 2, part(G.box, dark, .4, .3, 2, -1, -3.3, sd * 2.2, body);
    const pr = new THREE.Group;
    pr.position.set(-2.4, -3.2, sd * 3.2), body.add(pr), part(G.box, gold, .1, 2.8, .35, 0, 0, 0, pr), part(G.box, gold, .1, .35, 2.8, 0, 0, 0, pr), props.push(pr)
  }
  const guns = [];
  for (const [x, y] of [
      [3, 3.3],
      [1.5, -4.8]
    ]) {
    const head = new THREE.Group;
    head.position.set(x, y, 0), body.add(head), part(G.sph, dark, .9, .7, .9, 0, 0, 0, head);
    const bar = new THREE.Group;
    head.add(bar);
    for (const sd of [-1, 1]) {
      const b = part(G.cyl, M(2829634), .16, 2, .16, 1, 0, sd * .3, bar);
      b.rotation.z = Math.PI / 2
    }
    guns.push({
      head,
      bar,
      lx: x,
      ly: y
    })
  }
  const glow = part(G.sph, M(16735324, {
    emissive: 16719920,
    emissiveIntensity: 1.5
  }), .5, .5, .5, 9.9, .4, 0, body);
  return g.userData = {
    body,
    props,
    guns,
    glow
  }, g
}

function bossDist(o) {
  if (boss.carrier) return carrierDist(o);
  if (boss.serpent) return serpentDist(o);
  if (boss.ace) return dist3(o, boss) - 3.4;
  const k = boss.k || 1,
    ca = Math.cos(boss.a),
    sa = Math.sin(boss.a),
    dx = o.x - boss.x,
    dy = o.y - boss.y,
    dz = o.z - boss.z,
    t = clamp(dx * ca + dz * sa, -8 * k, 9 * k);
  return Math.hypot(dx - ca * t, dy, dz - sa * t) - (boss.titan ? 5.4 : dy < -2 ? 4.8 : 3.9) * k
}

function announceBoss() {
  bossWarnT = 3, $("bossWarn").innerHTML = "<small>WARNING</small>BOSS INBOUND", $("bossWarn").classList.remove("hidden");
  for (let i = 0; i < 6; i++) Sound.tone(i % 2 ? 440 : 660, .22, "square", .06, null, i * .25)
}

function spawnBoss() {
  $("bossWarn").classList.add("hidden");
  const n = bossCount,
    side = Math.random() < .5 ? -1 : 1,
    ang = player.a + side * rand(.5, 1.1),
    d = 115,
    x = clamp(player.x + Math.cos(ang) * d, -MAP + 40, MAP - 40),
    z = clamp(player.z + Math.sin(ang) * d, -MAP + 40, MAP - 40),
    max = 45 + 25 * n;
  boss = {
    x,
    y: clamp(player.y + 8, 22, 50),
    z,
    a: Math.atan2(player.z - z, player.x - x),
    p: 0,
    roll: 0,
    hp: max,
    max,
    scale: 3.5,
    boss: !0,
    pts: 1500 + 500 * n,
    gunCd: [2, 3],
    burst: [0, 0],
    burstT: [0, 0],
    mslCd: 6,
    orbit: side,
    dying: 0,
    dead: !1,
    drops: 3,
    enraged: !1,
    mesh: makeBoss()
  }, scene.add(boss.mesh), $("bossName").textContent = "SKY FORTRESS" + (n ? " MK " + (n + 1) : ""), $("bossFill").style.width = "100%", $("bossBar").classList.remove("titan", "ace", "shield"), $("bossBar").classList.remove("hidden");
  for (let i = 0; i < 3; i++) spawnPickup("ammo");
  spawnPickup("missile"), banner("SKY FORTRESS", "SHOOT IT DOWN", "#ffbb58")
}

function hitBoss(dmg, at) {
  if (!(!boss || boss.dead)) {
    if (boss.intro > 0) {
      for (let i = 0; i < 4; i++) addPart(at.x, at.y, at.z, rand(-6, 6), rand(-3, 6), rand(-6, 6), .3, .4, 8385535);
      return
    }
    if (boss.serpent) {
      serpentHit(dmg, at);
      return
    }
    if (!(boss.ace && aceBlocks(at)) && !(boss.carrier && carrierBlocks(at))) {
      boss.hp -= dmg;
      for (let i = 0; i < 5; i++) addPart(at.x, at.y, at.z, rand(-6, 6), rand(-3, 6), rand(-6, 6), .35, .45, i % 2 ? 16769610 : 16777215);
      if (boss.hp > 0 && hitFx(boss, dmg, at), $("bossFill").style.width = Math.max(0, boss.hp / boss.max * 100).toFixed(1) + "%", boss.titan) {
        boss.hp <= 0 && killTitan();
        return
      }
      if (boss.carrier) {
        carrierBar(), boss.hp <= 0 && killCarrier();
        return
      }
      if (boss.ace) {
        aceDamaged(dmg), boss.hp <= 0 && killAce();
        return
      }
      for (; boss.drops > 0 && boss.hp <= boss.max * boss.drops / 4;) boss.drops--, spawnPickup("ammo", boss.x + rand(-6, 6), boss.z + rand(-6, 6), clampAlt(boss.y - 6)), explode(boss.x + rand(-5, 5), boss.y + rand(-2, 2), boss.z + rand(-5, 5), .8);
      !boss.enraged && boss.hp <= boss.max / 2 && (boss.enraged = !0, banner("ENRAGED", "SKY FORTRESS", "#ff5c7a")), boss.hp <= 0 && killBoss()
    }
  }
}

function killBoss() {
  gainXp(150);
  boss.dead = !0, boss.dying = 1.6, bossCount++, kills++, awardKill(boss.x, boss.y + 4, boss.z, boss.pts, !0), bossHeart(boss, 1), $("bossBar").classList.add("hidden"), shake = .5, Sound.sfxBoom(), hitStop(.7, .25), banner("BOSS DOWN", "+" + boss.pts, "#ffd24a"), Sound.sfxFanfare(!0);
  for (const m of missiles) m.enemy && (explode(m.x, m.y, m.z, .5), removeMissile(m));
  missiles = missiles.filter(m => !m.dead), nextBossAt = 1e9, CG.happytime()
}

function updateBoss(dt, hostile) {
  if (boss && boss.titan) {
    updateTitan(dt, hostile);
    return
  }
  if (boss && boss.ace) {
    updateAce(dt, hostile);
    return
  }
  if (boss && boss.carrier) {
    updateCarrier(dt, hostile);
    return
  }
  if (boss && boss.serpent) {
    updateSerpent(dt, hostile);
    return
  }
  if (!boss) {
    const titanSoon = titanPhase === "none" && gameTime > TITAN_AT - 25 || acePhase === "none" && gameTime > ACE_AT - 25 || carrierPhase === "none" && gameTime > CARRIER_AT - 25;
    bossWarnT > 0 && ($("bossWarn").classList.toggle("hidden", state !== "playing"), bossWarnT -= dt, bossWarnT <= 0 && (hostile && !duelLock() ? spawnBoss() : $("bossWarn").classList.add("hidden")));
    return
  }
  const B = boss,
    ud = B.mesh.userData;
  for (const pr of ud.props) pr.rotation.x += dt * 18;
  if (ud.glow.material.emissiveIntensity = 1 + Math.sin(time * (B.enraged ? 14 : 6)), B.dead) B.dying -= dt, B.y -= dt * 7, B.roll += dt * .5, B.p = lerp(B.p, -.35, dt), Math.random() < dt * 9 && (explode(B.x + rand(-8, 8) * Math.cos(B.a), B.y + rand(-3, 3), B.z + rand(-8, 8) * Math.sin(B.a), .9), Sound.sfxBoom()), B.dying <= 0 && (explode(B.x, B.y, B.z, 2.6), shockwave(B.x, B.y, B.z, 40, 16777215, .7), shake = Math.max(shake, .45), Sound.sfxBoom(), state === "playing" && (spawnPickup("missile", B.x - 5, B.z, clampAlt(B.y)), spawnPickup("ammo", B.x, B.z + 5, clampAlt(B.y))), scene.remove(B.mesh), boss = null);
  else if (B.stun > 0) B.stun -= dt, Math.random() < dt * 14 && addPart(B.x + rand(-8, 8) * Math.cos(B.a), B.y + rand(-3, 3), B.z + rand(-8, 8) * Math.sin(B.a), 0, rand(1, 3), 0, .35, .6, 11967999, .5);
  else {
    const dx = player.x - B.x,
      dz = player.z - B.z,
      dh = Math.hypot(dx, dz),
      d = Math.hypot(dh, player.y - B.y),
      around = Math.atan2(B.z - player.z, B.x - player.x) + B.orbit * .55;
    let tx = player.x + Math.cos(around) * 55,
      tz = player.z + Math.sin(around) * 55;
    (!hostile || !player.alive) && (tx = B.x + Math.cos(B.a) * 40, tz = B.z + Math.sin(B.a) * 40), tx = clamp(tx, -MAP + 30, MAP - 30), tz = clamp(tz, -MAP + 30, MAP - 30), turnToward(B, Math.atan2(tz - B.z, tx - B.x), .55, dt), B.roll *= .4;
    const spd = d > 90 ? Math.max(14 * SPEED_K, playerSpeed() * .85) : (9 + bossCount * 1.5) * SPEED_K;
    B.x += Math.cos(B.a) * spd * dt, B.z += Math.sin(B.a) * spd * dt, B.y += clamp(clamp(player.y + 7, 20, 52) - B.y, -4, 4) * dt;
    const ca = Math.cos(B.a),
      sa = Math.sin(B.a),
      rate = (B.enraged ? 1.5 : 1) * (1 + bossCount * .15);
    ud.guns.forEach((gn, i) => {
      const wx = B.x + gn.lx * ca,
        wy = B.y + gn.ly,
        wz = B.z + gn.lx * sa,
        gx = player.x - wx,
        gy = player.y - wy,
        gz = player.z - wz,
        gh = Math.hypot(gx, gz);
      if (gn.head.rotation.y = -(Math.atan2(gz, gx) - B.a), gn.bar.rotation.z = Math.atan2(gy, Math.max(gh, 1)), !(!hostile || !player.alive || state !== "playing" || playerHidden()) && (B.gunCd[i] -= dt * rate, B.gunCd[i] <= 0 && d < 85 && (B.burst[i] = 3, B.gunCd[i] = rand(2.2, 3)), B.burst[i] > 0 && (B.burstT[i] -= dt) <= 0)) {
        B.burst[i]--, B.burstT[i] = .14;
        const f = fwdOf(player),
          ps = playerSpeed(),
          lead = Math.hypot(gh, gy) / (botSpeed() + 30);
        fire({
          x: wx,
          y: wy,
          z: wz,
          a: 0,
          p: 0,
          src: "FORTRESS GUN"
        }, !0, {
          x: player.x + f[0] * ps * lead + rand(-1.8, 1.8),
          y: player.y + f[1] * ps * lead + rand(-1.2, 1.2),
          z: player.z + f[2] * ps * lead + rand(-1.8, 1.8)
        }), Sound.sfxEnemyShoot()
      }
    }), hostile && player.alive && state === "playing" && !playerHidden() && (B.mslCd -= dt * rate, B.mslCd <= 0 && d > 25 && d < 110 && missiles.filter(m => m.enemy && !m.dead).length <= 3 && (launchMissile({
      src: "FORTRESS",
      x: B.x,
      y: B.y - 4,
      z: B.z,
      a: Math.atan2(dz, dx),
      p: Math.atan2(player.y - B.y + 4, Math.max(dh, 1))
    }, !0), B.mslCd = rand(7, 9)))
  }
  B.mesh.position.set(B.x, B.y, B.z), B.mesh.rotation.y = -B.a, ud.body.rotation.set(B.roll, 0, B.p)
}

function makeTitan() {
  const g = new THREE.Group,
    body = new THREE.Group;
  g.add(body), body.rotation.order = "ZXY";
  const hull = M(1777454, {
      metalness: .6,
      roughness: .35
    }),
    plate = M(3028560, {
      metalness: .5,
      roughness: .4
    }),
    red = M(16723285, {
      emissive: 12582958,
      emissiveIntensity: 1.4
    }),
    gold = M(16761677, {
      metalness: .7,
      roughness: .25,
      emissive: 5913088,
      emissiveIntensity: .5
    }),
    dark = M(724502),
    fire2 = M(16738858, {
      emissive: 16726528,
      emissiveIntensity: 2.6
    }),
    env = part(G.capsule, hull, 3.6, 5, 3.6, 0, 0, 0, body);
  env.rotation.z = Math.PI / 2;
  for (const x of [-5, -1.5, 2]) {
    const r = part(G.torus, plate, 3.8, 3.8, 3.8, x, 0, 0, body);
    r.rotation.y = Math.PI / 2
  }
  for (const x of [-3.3, .3, 3.8]) {
    const r = part(G.torus, red, 3.66, 3.66, 3.66, x, 0, 0, body);
    r.rotation.y = Math.PI / 2
  }
  const prow = part(G.cone, gold, 2.4, 5, 2.4, 10.8, 0, 0, body);
  prow.rotation.z = -Math.PI / 2;
  const core = part(G.sph, red, 1.5, 1.5, 1.5, 7.4, 2.2, 0, body);
  part(G.box, dark, 2.4, .5, 3.4, 7.4, 1.4, 0, body);
  for (let i = 0; i < 5; i++) {
    const b = part(G.box, gold, 1.2, 1.6 - i * .18, .18, 4 - i * 2.3, 4, 0, body);
    b.rotation.z = .5
  }
  for (const sd of [-1, 1]) {
    const w = part(G.box, plate, 7.5, .55, 9.5, -1.2, -.6, sd * 7.2, body);
    w.rotation.y = sd * .38;
    const edge = part(G.box, red, 7, .6, .35, -2.6, -.5, sd * 11.2, body);
    edge.rotation.y = sd * .38;
    for (const zz of [5.2, 8.8]) {
      const pod = part(G.capsule, hull, .95, 2.2, .95, -2, -1.2, sd * zz, body);
      pod.rotation.z = Math.PI / 2, part(G.sph, fire2, .85, .85, .85, -4.4, -1.2, sd * zz, body)
    }
  }
  for (const [y, z, sx, sy, sz] of [
      [3, 0, 3.6, 3.8, .4],
      [-3, 0, 3.6, 3.8, .4],
      [0, 3, 3.6, .4, 3.8],
      [0, -3, 3.6, .4, 3.8]
    ]) part(G.box, red, sx, sy, sz, -9.4, y, z, body);
  const haloHolder = new THREE.Group;
  haloHolder.position.set(-11.5, 0, 0), haloHolder.rotation.y = Math.PI / 2, body.add(haloHolder);
  const halo = new THREE.Group;
  haloHolder.add(halo), part(G.torus, red, 5.2, 5.2, 5.2, 0, 0, 0, halo), part(G.torus, gold, 6, 6, 6, 0, 0, 0, halo);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    part(G.sph, fire2, .45, .45, .45, Math.cos(a) * 5.6, Math.sin(a) * 5.6, 0, halo)
  }
  const guns = [];
  for (const [x, y] of [
      [5, 3.9],
      [-1.5, 3.9],
      [3, -4.3],
      [-3.5, -4.3]
    ]) {
    const head = new THREE.Group;
    head.position.set(x, y, 0), body.add(head), part(G.sph, dark, 1.1, .8, 1.1, 0, 0, 0, head);
    const bar = new THREE.Group;
    head.add(bar);
    for (const sd of [-1, 1]) {
      const b = part(G.cyl, M(2829634), .2, 2.6, .2, 1.3, 0, sd * .36, bar);
      b.rotation.z = Math.PI / 2
    }
    guns.push({
      head,
      bar,
      lx: x,
      ly: y
    })
  }
  return g.userData = {
    body,
    props: [],
    guns,
    glow: core,
    halo
  }, g.scale.setScalar(1.9), g
}

function hideCine() {
  const c = $("cine");
  c.classList.remove("on"), setTimeout(() => {
    c.classList.contains("on") || c.classList.add("hidden")
  }, 550)
}

function setCine(sub, title, line) {
  $("cineSub").innerHTML = sub, $("cineTitle").textContent = title, $("cineLine").innerHTML = line
}

function showCine() {
  const c = $("cine");
  c.classList.remove("hidden"), c.offsetWidth, c.classList.add("on")
}

function updateTitanFlow(dt) {
  titanPhase === "none" || (titanPhase === "intro" ? (titanT -= dt, Math.random() < dt * 6 && shockwave(player.x + rand(-60, 60), player.y + rand(-10, 30), player.z + rand(-60, 60), rand(10, 25), 16723285, .6), titanT <= 0 && (titanPhase = "fight", hideCine(), spawnTitan())) : titanPhase === "fight" && boss && boss.titan && !boss.dead && (supplyT -= dt, supplyT <= 0 && (supplyT = 14, spawnPickup("ammo"), spawnPickup("ammo"), Math.random() < .5 && spawnPickup("missile"), toast("SUPPLY DROP INBOUND"))))
}

function startTitanIntro() {
  titanPhase = "intro", titanT = 3.4, $("bossWarn").classList.add("hidden"), bossWarnT = 0;
  let n = 0;
  for (const b of bots) b.dead || (b.dead = !0, explode(b.x, b.y, b.z, 1.1), removeBot(b), n++);
  bots = [];
  for (const t of turrets) t.dead || (t.dead = !0, explode(t.x, t.y, t.z, 1.1), wreckTurret(t), n++);
  boss && (explode(boss.x, boss.y, boss.z, 2.2), scene.remove(boss.mesh), boss = null, n += 5), $("bossBar").classList.add("hidden");
  for (const m of missiles) m.enemy && removeMissile(m);
  missiles = missiles.filter(m => !m.dead), bullets = bullets.filter(b => !b.enemy), n && (killPts += n * 100, popup(player.x, player.y + 4, player.z, "SKY CLEARED +" + n * 100, !0)), Object.assign(player, {
    hp: maxHp(),
    ammo: maxAmmo(),
    missiles: Math.min(maxMsl(), Math.max(player.missiles, 6)),
    flares: Math.min(maxFlr(), player.flares + 3),
    invul: 4.5
  }), shockwave(player.x, player.y, player.z, 120, 16777215, 1.1), shockwave(player.x, player.y, player.z, 80, 16723285, .9), shake = .6, hitStop(1.1, .2), killFlash(), Sound.sfxBoom(), Sound.tone(55, 1.6, "sawtooth", .22, 30), Sound.sfxSiren(), setCine("STAGE " + stage + " &middot; BOSS", "OMEGA TITAN", "THE SKY IS CLEARED &mdash; IT'S JUST YOU AND IT"), showCine(), updateHud(!0)
}

function spawnTitan() {
  const ang = player.a + rand(-.35, .35),
    d = 150,
    x = clamp(player.x + Math.cos(ang) * d, -MAP + 40, MAP - 40),
    z = clamp(player.z + Math.sin(ang) * d, -MAP + 40, MAP - 40),
    hp = Math.round(160 + 110 * gunDmg() * planeNow().guns);
  boss = {
    x,
    y: clamp(player.y + 12, 26, 55),
    z,
    a: Math.atan2(player.z - z, player.x - x),
    p: 0,
    roll: 0,
    hp,
    max: hp,
    scale: 6,
    k: 1.9,
    titan: !0,
    boss: !0,
    pts: 1e4,
    phase: 1,
    gunCd: [1, 1.6, 2.2, 2.8],
    burst: [0, 0, 0, 0],
    burstT: [0, 0, 0, 0],
    mslCd: 6,
    novaCd: 4,
    novaCharge: 0,
    spiralT: 0,
    spiralA: 0,
    orbit: 1,
    orbitT: 12,
    dying: 0,
    dead: !1,
    intro: 2.2,
    mesh: makeTitan()
  }, scene.add(boss.mesh), $("bossName").textContent = "OMEGA TITAN \xB7 PHASE 1", $("bossFill").style.width = "100%", $("bossBar").classList.remove("ace", "shield"), $("bossBar").classList.add("titan"), $("bossBar").classList.remove("hidden"), banner("OMEGA TITAN", "DESTROY IT", "#ff2d55"), shockwave(boss.x, boss.y, boss.z, 60, 16723285, .9), Sound.tone(40, 2, "sawtooth", .25, 90), Sound.sfxBoom();
  for (let i = 0; i < 3; i++) spawnPickup("ammo");
  spawnPickup("missile")
}

function titanShift(ph) {
  const B = boss;
  $("bossName").textContent = "OMEGA TITAN \xB7 " + (ph === 2 ? "PHASE 2" : "OVERDRIVE"), banner(ph === 2 ? "PHASE 2" : "OVERDRIVE", ph === 2 ? "SPIRAL STORM" : "THE TITAN IS ENRAGED", ph === 2 ? "#ff7a2d" : "#ff2d55"), shockwave(B.x, B.y, B.z, 70, ph === 2 ? 16742957 : 16723285, .8), explode(B.x, B.y, B.z, 2), shake = Math.max(shake, .5), hitStop(.35, .2), Sound.sfxSiren(), Sound.sfxBoom(), B.intro = 1.2;
  for (let i = 0; i < 2; i++) spawnPickup("ammo");
  if (spawnPickup("missile"), ph === 3)
    for (let i = 0; i < 2; i++) {
      const e = spawnBot("ace", B);
      e && (e.hp = 6, e.pts = 500)
    }
}

function titanNova(B) {
  const n = B.phase >= 3 ? 40 : 30,
    ty = clamp((player.y - B.y) / 70, -.35, .35);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + B.spiralA;
    orb(B.x, B.y, B.z, Math.cos(a), ty, Math.sin(a), 30, 5)
  }
  if (B.phase >= 3) {
    const toP = Math.atan2(player.z - B.z, player.x - B.x);
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2;
      orb(B.x, B.y, B.z, Math.cos(a) * Math.cos(toP + Math.PI / 2), Math.sin(a), Math.cos(a) * Math.sin(toP + Math.PI / 2), 26, 5)
    }
  }
  shockwave(B.x, B.y, B.z, 32, 16726996, .6), Sound.tone(900, .5, "sawtooth", .08, 120), Sound.noise(.4, .2, 2400)
}

function updateTitan(dt, hostile) {
  const B = boss,
    ud = B.mesh.userData,
    k = B.k;
  if (ud.halo.rotation.z += dt * (B.phase >= 3 ? 4.5 : 1.6), ud.glow.material.emissiveIntensity = 1.6 + Math.sin(time * (B.phase >= 3 ? 18 : 7)) + (B.novaCharge > 0 ? 2 : 0), B.dead) {
    if (B.dying -= dt, B.y -= dt * 5, B.roll += dt * .35, B.p = lerp(B.p, -.3, dt), Math.random() < dt * 16) {
      const o = rand(-10, 10) * k;
      explode(B.x + o * Math.cos(B.a), B.y + rand(-4, 4), B.z + o * Math.sin(B.a), 1.3), Sound.sfxBoom(), shake = Math.max(shake, .25)
    }
    B.dying <= 0 && (explode(B.x, B.y, B.z, 4), explode(B.x + 8, B.y, B.z, 2.5), explode(B.x - 8, B.y, B.z - 6, 2.5), shockwave(B.x, B.y, B.z, 90, 16777215, 1.1), shockwave(B.x, B.y, B.z, 60, 16765514, .9), shockwave(B.x, B.y, B.z, 35, 16723285, .7), shake = .9, hitStop(.8, .2), killFlash(), Sound.sfxBoom(), Sound.tone(45, 1.5, "sine", .35, 20), state === "playing" && (spawnPickup("missile", B.x, B.z + 6, clampAlt(B.y)), spawnPickup("ammo", B.x, B.z - 6, clampAlt(B.y))), scene.remove(B.mesh), boss = null, titanPhase = "done")
  } else {
    B.intro > 0 && (B.intro -= dt);
    const dx = player.x - B.x,
      dz = player.z - B.z,
      dh = Math.hypot(dx, dz),
      d = Math.hypot(dh, player.y - B.y),
      hpf = B.hp / B.max,
      ph = hpf > 2 / 3 ? 1 : hpf > 1 / 3 ? 2 : 3;
    ph > B.phase && (B.phase = ph, titanShift(ph)), B.orbitT -= dt, B.orbitT <= 0 && (B.orbitT = rand(9, 14), B.orbit = -B.orbit);
    const around = Math.atan2(B.z - player.z, B.x - player.x) + B.orbit * .5;
    let tx = player.x + Math.cos(around) * 75,
      tz = player.z + Math.sin(around) * 75;
    (!hostile || !player.alive) && (tx = B.x + Math.cos(B.a) * 40, tz = B.z + Math.sin(B.a) * 40), tx = clamp(tx, -MAP + 30, MAP - 30), tz = clamp(tz, -MAP + 30, MAP - 30);
    const stunned = B.stun > 0;
    stunned && (B.stun -= dt, Math.random() < dt * 14 && addPart(B.x + rand(-12, 12), B.y + rand(-4, 4), B.z + rand(-12, 12), 0, rand(1, 3), 0, .35, .8, 11967999, .5)), turnToward(B, Math.atan2(tz - B.z, tx - B.x), .7, dt), B.roll *= .4;
    const spd = (d > 110 ? Math.max(18 * SPEED_K, playerSpeed() * .95) : (12 + B.phase * 2.5) * SPEED_K) * (stunned ? .4 : 1);
    B.x += Math.cos(B.a) * spd * dt, B.z += Math.sin(B.a) * spd * dt, B.y += clamp(clamp(player.y + 10, 24, 56) - B.y, -5, 5) * dt;
    const attack = hostile && player.alive && state === "playing" && !playerHidden() && B.intro <= 0 && !stunned,
      rate = [1, 1, 1.3, 1.75][B.phase],
      ca = Math.cos(B.a),
      sa = Math.sin(B.a);
    if (ud.guns.forEach((gn, i) => {
        const wx = B.x + gn.lx * k * ca,
          wy = B.y + gn.ly * k,
          wz = B.z + gn.lx * k * sa,
          gx = player.x - wx,
          gy = player.y - wy,
          gz = player.z - wz,
          gh = Math.hypot(gx, gz);
        if (gn.head.rotation.y = -(Math.atan2(gz, gx) - B.a), gn.bar.rotation.z = Math.atan2(gy, Math.max(gh, 1)), !!attack && (B.gunCd[i] -= dt * rate, B.gunCd[i] <= 0 && d < 125 && (B.burst[i] = 4, B.gunCd[i] = rand(1.8, 2.6)), B.burst[i] > 0 && (B.burstT[i] -= dt) <= 0)) {
          B.burst[i]--, B.burstT[i] = .1;
          const f = fwdOf(player),
            ps = playerSpeed(),
            lead = Math.hypot(gh, gy) / (botSpeed() + 30);
          fire({
            x: wx,
            y: wy,
            z: wz,
            a: 0,
            p: 0,
            airframe: "lancer",
            src: "TITAN GUN"
          }, !0, {
            x: player.x + f[0] * ps * lead + rand(-2, 2),
            y: player.y + f[1] * ps * lead + rand(-1.4, 1.4),
            z: player.z + f[2] * ps * lead + rand(-2, 2)
          }), i === 0 && Sound.sfxEnemyShoot({
            airframe: "lancer"
          })
        }
      }), attack) {
      if (B.phase >= 2) {
        B.spiralT -= dt;
        const arms = B.phase >= 3 ? 4 : 3,
          ty = clamp((player.y - B.y) / 90, -.3, .3);
        for (; B.spiralT <= 0;) {
          B.spiralT += B.phase >= 3 ? .07 : .1, B.spiralA += .21 * B.orbit;
          for (let a = 0; a < arms; a++) {
            const ang = B.spiralA + a * Math.PI * 2 / arms;
            orb(B.x, B.y, B.z, Math.cos(ang), ty, Math.sin(ang), 24, 4.5)
          }
        }
      }
      if (B.novaCharge > 0) {
        B.novaCharge -= dt;
        for (let i = 0; i < 3; i++) {
          const a = rand(0, 6.3),
            r = rand(14, 22);
          addPart(B.x + Math.cos(a) * r, B.y + rand(-6, 6), B.z + Math.sin(a) * r, -Math.cos(a) * r * 1.6, 0, -Math.sin(a) * r * 1.6, .5, .7, 16726996, .3)
        }
        B.novaCharge <= 0 && titanNova(B)
      } else B.novaCd -= dt * rate, B.novaCd <= 0 && (B.novaCharge = 1.1, B.novaCd = rand(6.5, 8.5), Sound.tone(200, 1.1, "sawtooth", .07, 1400));
      if (B.mslCd -= dt * rate, B.mslCd <= 0 && d > 25 && d < 130 && missiles.filter(m => m.enemy && !m.dead).length <= 4) {
        const count = B.phase >= 3 ? 3 : 2;
        for (let i = 0; i < count; i++) {
          const sd = (i - (count - 1) / 2) * 9 * k;
          launchMissile({
            src: "TITAN",
            x: B.x - sa * sd,
            y: B.y - 2,
            z: B.z + ca * sd,
            a: Math.atan2(dz, dx) + (i - (count - 1) / 2) * .3,
            p: Math.atan2(player.y - B.y, Math.max(dh, 1))
          }, !0)
        }
        B.mslCd = rand(8, 10)
      }
    }
    Math.random() < dt * 30 && addPart(B.x - ca * 11 * k + rand(-3, 3), B.y + rand(-3, 3), B.z - sa * 11 * k + rand(-3, 3), -ca * 12, rand(-1, 1), -sa * 12, .5, 1.1, B.phase >= 3 ? 16723285 : 16742957, .6)
  }
  B.mesh.position.set(B.x, B.y, B.z), B.mesh.rotation.y = -B.a, ud.body.rotation.set(B.roll, 0, B.p)
}

function killTitan() {
  gainXp(200);
  const B = boss;
  B.dead = !0, B.dying = 3.4, bossCount++, kills++, titanSlain = !0, awardKill(B.x, B.y + 8, B.z, B.pts, !0), bossHeart(B, 2), $("bossBar").classList.add("hidden"), shake = .8, hitStop(1.6, .18), killFlash(), banner("TITAN DOWN", "+10000 PTS \xB7 +300 COINS", "#ffd24a"), Sound.sfxFanfare(!0), Sound.sfxBoom();
  for (const m of missiles) m.enemy && (explode(m.x, m.y, m.z, .5), removeMissile(m));
  missiles = missiles.filter(m => !m.dead), bullets = bullets.filter(b => !b.enemy);
  for (const b of bots) explode(b.x, b.y, b.z, 1), removeBot(b), b.dead = !0;
  bots = [], garage.coins += 300, saveGarage(), nextBossAt = 1e9, CG.happytime()
}
const LOCK_RANGE = 170,
  MAX_LOCKS = 1,
  lockUI = $("lockUI"),
  lockRing = $("lockRing"),
  LKS = [];
for (let i = 0; i < 8; i++) {
  const el = document.createElement("div");
  el.className = "lk", el.hidden = !0, el.innerHTML = '<svg viewBox="-50 -50 100 100"><path class="br" d="M-46-24V-46H-24M24-46H46V-24M46 24V46H24M-24 46H-46V24"/><circle class="trk" r="34"/><circle class="prog" r="34" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90)"/><path class="dia" d="M0-17L17 0L0 17L-17 0Z"/></svg><b></b><i></i>', lockUI.appendChild(el), LKS.push(el)
}
let reticleAt = {
    x: innerWidth / 2,
    y: innerHeight / 2
  },
  lockHudKey = "";
const lockRadius = () => Math.min(innerWidth, innerHeight) * lockRingOf(planeNow());

function updateLocks(dt) {
  const on = aiming() && state === "playing" && player.alive,
    R = lockRadius();
  let locking = 0;
  const cand = [];
  if (on)
    for (const t of targetables()) {
      if (t.dead) continue;
      const d = dist3(t, player);
      if (d > lockRangeOf(planeNow()) || t.carrier && !dnCoreLockable(t)) continue;
      const sp = toScreen(t.x, t.y, t.z);
      if (!sp) continue;
      const dc = Math.hypot(sp.x - reticleAt.x, sp.y - reticleAt.y);
      dc > R || cand.push({
        t,
        d,
        cen: dc / R
      })
    }
  cand.sort((a, b) => (b.t.lock || 0) - (a.t.lock || 0) || a.cen - b.cen);
  const active = new Set;
  for (const c of cand) {
    if (locking >= MAX_LOCKS) break;
    locking++, active.add(c.t);
    const t = c.t,
      before = t.lock || 0,
      rate = .5 * (1.7 - c.cen) * (c.d < 70 ? 1.25 : 1) * (t === boss ? .75 : 1) * (1 + .5 * run.lock) * (.9 + .6 * planeTier());
    t.lock = Math.min(1, before + rate * dt), before < 1 && t.lock >= 1 ? (isAlienPlane() ? (Sound.tone(880, .14, "sine", .06, 1320), Sound.tone(1320, .2, "sine", .05, 1980, .08)) : (Sound.tone(1560, .06, "square", .06), Sound.tone(2080, .1, "square", .06, null, .07))) : Math.floor(before * 5) < Math.floor(t.lock * 5) && (isAlienPlane() ? Sound.tone(300 + t.lock * 500, .09, "sine", .04, 420 + t.lock * 700) : Sound.tone(620 + t.lock * 900, .045, "sine", .05))
  }
  for (const t of targetables()) t.lock && !active.has(t) && (t.lock = Math.max(0, t.lock - dt * (on ? .7 : 2)));
  drawLocks(on, R)
}

function drawLocks(on, R) {
  lockUI.hidden = !on;
  let n = 0,
    full = 0;
  if (on) {
    lockRing.style.width = lockRing.style.height = (R * 2).toFixed(0) + "px", lockRing.style.transform = `translate(${(reticleAt.x-R).toFixed(1)}px,${(reticleAt.y-R).toFixed(1)}px)`;
    for (const t of targetables()) {
      if (t.dead || !t.lock || n >= LKS.length) continue;
      const sp = toScreen(t.x, t.y + .4 * (t.scale || 1), t.z);
      if (!sp) continue;
      const el = LKS[n++],
        d = dist3(t, player),
        sz = clamp(1100 * (t.scale || 1) / Math.max(d, 1), 44, t === boss ? 150 : 104),
        done = t.lock >= 1;
      done && full++, el.hidden = !1, el.className = "lk" + (done ? " full" : ""), el.style.width = el.style.height = sz.toFixed(0) + "px", el.style.transform = `translate(${(sp.x-sz/2).toFixed(1)}px,${(sp.y-sz/2).toFixed(1)}px)`, el.querySelector(".prog").setAttribute("stroke-dasharray", (t.lock * 100).toFixed(1) + " 100"), el.querySelector("b").textContent = done ? "LOCK" : "HIT " + Math.round(35 + 65 * t.lock) + "%", el.querySelector("i").textContent = (t === boss ? t.titan ? "TITAN " : t.ace ? "ACE " : "BOSS " : "") + Math.round(d) + "m"
    }
  }
  for (let i = n; i < LKS.length; i++) LKS[i].hidden = !0;
  const key = on + "|" + full + "|" + player.missiles;
  if (key !== lockHudKey) {
    lockHudKey = key;
    const k = IS_TOUCH ? "MSL" : "E";
    $("lockCount").textContent = full ? player.missiles ? `TARGET LOCKED \xB7 [${k}] FIRE` : "TARGET LOCKED \xB7 NO MISSILES" : "HOLD A TARGET IN THE RING", $("lockCount").classList.toggle("hot", full > 0), $("btnMsl").classList.toggle("locked", on && full > 0 && player.missiles > 0), $("lockN").textContent = on && full > 0 && player.missiles > 0 ? "LOCK" : ""
  }
}
const hitFlashing = new Set;
let hitSfxT = 0;

function hitMats(o) {
  if (o._hitMats) return o._hitMats;
  const list = [],
    seen = new Map;
  return o.mesh.traverse(n => {
    if (!n.isMesh || !n.material || !n.material.isMeshStandardMaterial) return;
    let c = seen.get(n.material);
    c || (c = n.material.clone(), seen.set(n.material, c), list.push({
      m: c,
      e: c.emissive.clone(),
      ei: c.emissiveIntensity
    })), n.material = c
  }), o._hitMats = list
}

function hitFx(o, dmg, at) {
  if (!o || !o.mesh) return;
  const huge = o.titan || o.carrier || o.serpent;
  o.hpMax == null && (o.hpMax = o.max || o.hp + dmg), o._bs == null && (o._bs = o.mesh.scale.x), o.hitT = huge ? .07 : .11, o.hitDur = o.hitT, o.hitK = huge ? .35 : o.boss ? .7 : 1, hitMats(o), hitFlashing.add(o);
  const p = at || o;
  for (let i = 0; i < 4; i++) addPart(p.x, p.y, p.z, rand(-9, 9), rand(-4, 9), rand(-9, 9), .22, .5, 16777215, .3);
  huge || beamHitting || shockwave(p.x, p.y, p.z, 3.5 * (o.scale || 1), 16777215, .16), dmgNumber(o, dmg);
  const now = performance.now();
  if (now > hitSfxT) {
    hitSfxT = now + 45;
    const k = clamp(1 - o.hp / (o.hpMax || 1), 0, 1);
    Sound.tone(900 + k * 700, .035, "square", .045), Sound.tone(180, .06, "triangle", .08, 90)
  }
  if (o.boss || o.titan || o.ace || o.carrier) {
    const bb = $("bossBar");
    bb.classList.remove("hit"), bb.offsetWidth, bb.classList.add("hit")
  }
}

function updateHitFx(dt) {
  for (const o of hitFlashing) {
    o.hitT -= dt;
    const k = Math.max(0, o.hitT / o.hitDur);
    for (const it of o._hitMats) k > 0 ? (it.m.emissive.setRGB(1, 1, 1), it.m.emissiveIntensity = Math.max(it.ei, 1.4 * k * o.hitK)) : (it.m.emissive.copy(it.e), it.m.emissiveIntensity = it.ei);
    const punch = o.titan || o.carrier ? 0 : o.boss ? .06 : .2;
    o.mesh.scale.setScalar(o._bs * (1 + punch * k)), k <= 0 && hitFlashing.delete(o)
  }
}

function clearHitFx() {
  for (const o of hitFlashing) o.hitT = 0;
  updateHitFx(0), hitFlashing.clear()
}

function dmgNumber(o, dmg) {
  const now = performance.now(),
    v = Math.max(1, Math.round(dmg * 10));
  if (o._dmgPop && pops.includes(o._dmgPop) && now - o._dmgPop.t0 < 350) {
    const q2 = o._dmgPop;
    q2.sum += v, q2.el.textContent = q2.sum, q2.until = now + 600, q2.x = o.x, q2.y = o.y + 2.5 * (o.scale || 1), q2.z = o.z, q2.t0 = now, q2.el.classList.remove("bump"), q2.el.offsetWidth, q2.el.classList.add("bump");
    return
  }
  if (pops.length >= 12) {
    const i = pops.findIndex(q3 => q3.dmg);
    pops.splice(i >= 0 ? i : 0, 1)[0].el.remove()
  }
  const el = document.createElement("div");
  el.className = "pop dmg", el.textContent = v, $("popups").appendChild(el);
  const q = {
    x: o.x + rand(-1, 1),
    y: o.y + 2.5 * (o.scale || 1),
    z: o.z + rand(-1, 1),
    el,
    until: now + 600,
    dmg: !0,
    sum: v,
    t0: now
  };
  pops.push(q), o._dmgPop = q
}

function updateAceFlow(dt) {
  acePhase !== "none" && acePhase === "intro" && (aceT -= dt, aceT <= 0 && (acePhase = "fight", hideCine(), spawnAce()))
}

function startAceIntro() {
  acePhase = "intro", aceT = 3, $("bossWarn").classList.add("hidden"), bossWarnT = 0;
  let n = 0;
  for (const b of bots) b.dead || (b.dead = !0, explode(b.x, b.y, b.z, 1.1), removeBot(b), n++);
  bots = [];
  for (const t of turrets) t.dead || (t.dead = !0, explode(t.x, t.y, t.z, 1.1), wreckTurret(t), n++);
  boss && (scene.remove(boss.mesh), boss = null), $("bossBar").classList.add("hidden");
  for (const m of missiles) m.enemy && removeMissile(m);
  missiles = missiles.filter(m => !m.dead), bullets = bullets.filter(b => !b.enemy), n && (killPts += n * 100, popup(player.x, player.y + 4, player.z, "SKY CLEARED +" + n * 100, !0)), Object.assign(player, {
    hp: maxHp(),
    ammo: maxAmmo(),
    missiles: Math.min(maxMsl(), Math.max(player.missiles, 6)),
    flares: Math.min(maxFlr(), player.flares + 3),
    invul: 4
  }), shockwave(player.x, player.y, player.z, 110, 16777215, 1), shockwave(player.x, player.y, player.z, 70, 6485484, .8), shake = .5, hitStop(.9, .2), killFlash(), Sound.sfxBoom(), Sound.sfxSiren(), setCine("STAGE " + stage + " &middot; BOSS", "FALCON ZERO", "A DUEL IN THE ASTEROID FIELD &mdash; ONE ON ONE"), showCine(), updateHud(!0)
}

function makeAce() {
  const mesh = makePlane(1316383, 16723285, "falcon"),
    b = mesh.userData.body,
    glow = M(16723285, {
      emissive: 16711733,
      emissiveIntensity: 2.2
    });
  for (const sd of [-1, 1]) part(G.box, glow, 1.6, .06, .12, -.3, .02, sd * 2.25, b).rotation.y = sd * .55, part(G.sph, glow, .12, .12, .12, .2, .05, sd * 2.4, b);
  part(G.box, M(16765514, {
    metalness: .6,
    roughness: .3
  }), 1.4, .08, .5, .9, .55, 0, b);
  const shield = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({
    color: 8385535,
    transparent: !0,
    opacity: .3,
    depthWrite: !1,
    blending: THREE.AdditiveBlending
  }));
  return shield.scale.setScalar(2.4), shield.visible = !1, mesh.add(shield), mesh.userData.shield = shield, mesh.scale.setScalar(2.2), mesh
}

function spawnAce() {
  const ang = player.a + rand(-.5, .5),
    d = 130,
    x = clamp(player.x + Math.cos(ang) * d, -MAP + 40, MAP - 40),
    z = clamp(player.z + Math.sin(ang) * d, -MAP + 40, MAP - 40),
    hp = Math.round(52 + 34 * gunDmg() * planeNow().guns);
  boss = {
    x,
    y: clampAlt(player.y + 6),
    z,
    a: Math.atan2(player.z - z, player.x - x),
    p: 0,
    roll: 0,
    rollFx: 0,
    hp,
    max: hp,
    scale: 1.3,
    ace: !0,
    boss: !0,
    pts: 15e3,
    phase: 1,
    intro: 1.8,
    fireCd: 2,
    burst: 0,
    burstT: 0,
    mslCd: 8,
    sonicCd: 6,
    dodgeT: 0,
    dodgeCd: 0,
    dodgeDir: 1,
    dodges: 0,
    flares: 2,
    flareCd: 0,
    flareRegen: 18,
    shieldT: 0,
    shieldCd: 6,
    ramCd: 9,
    ramCharge: 0,
    ramT: 0,
    cloakT: 0,
    cloakCd: 24,
    tailT: 0,
    extendT: 0,
    extendA: 0,
    extendUp: 0,
    dmgWin: 0,
    breakCd: 6,
    weave: rand(0, 6),
    trailT: 0,
    dying: 0,
    dead: !1,
    mesh: makeAce()
  }, scene.add(boss.mesh), $("bossName").textContent = "ACE \xB7 FALCON ZERO", $("bossFill").style.width = "100%", $("bossBar").classList.remove("titan"), $("bossBar").classList.add("ace"), $("bossBar").classList.remove("hidden"), banner("FALCON ZERO", "ENGAGE", "#62f5ec"), shockwave(boss.x, boss.y, boss.z, 30, 16723285, .6), Sound.sfxBoost(), Sound.tone(90, .9, "sine", .25, 30)
}

function aceShield(B, why) {
  B.shieldT = B.phase >= 2 ? 2.4 : 2, B.shieldCd = B.phase >= 2 ? 13 : 16, B.dmgWin = 0, B.mesh.userData.shield.visible = !0, shockwave(B.x, B.y, B.z, 12, 8385535, .4), Sound.tone(300, .5, "sine", .15, 900), Sound.tone(600, .4, "triangle", .06, 1200, .05), popup(B.x, B.y + 3, B.z, why || "SHIELD UP")
}

function aceBlocks(at) {
  const B = boss;
  if (B.shieldT > 0) {
    for (let i = 0; i < 5; i++) addPart(at.x, at.y, at.z, rand(-8, 8), rand(-4, 8), rand(-8, 8), .3, .4, 8385535);
    return Sound.tone(1400, .04, "triangle", .04, 900), !0
  }
  return B.dodgeT > 0
}

function aceDamaged(dmg) {
  const B = boss;
  if (B.dmgWin += dmg, B.cloakT > 0 && (B.cloakT = 0, B.mesh.visible = !0, shockwave(B.x, B.y, B.z, 12, 11967999, .35), popup(B.x, B.y + 3, B.z, "REVEALED"), Sound.tone(600, .15, "square", .06, 300)), B.phase === 1 && B.hp <= B.max / 2) {
    B.phase = 2, $("bossName").textContent = "ACE \xB7 FALCON ZERO \xB7 UNLEASHED", banner("UNLEASHED", "FALCON ZERO STOPS HOLDING BACK", "#ff2d55"), shockwave(B.x, B.y, B.z, 40, 16723285, .6), hitStop(.3, .2), Sound.sfxSiren(), B.flares = Math.max(B.flares, 2), aceShield(B, "SHIELD UP"), spawnPickup("ammo"), spawnPickup("missile");
    return
  }
  B.shieldCd <= 0 && B.dmgWin >= B.max * (B.phase >= 2 ? .12 : .15) && aceShield(B)
}

function aceFlares(B) {
  B.flares--, B.flareCd = 1.4;
  const f = fwdOf(B),
    made = [];
  for (let i = 0; i < 4; i++) {
    const sd = (i - 1.5) * 7,
      d = {
        x: B.x - f[0] * 3,
        y: B.y - 1,
        z: B.z - f[2] * 3,
        vx: -f[0] * 8 - Math.sin(B.a) * sd,
        vy: rand(-4, 2),
        vz: -f[2] * 8 + Math.cos(B.a) * sd,
        life: 2.4,
        aceFlare: !0
      };
    decoys.push(d), made.push(d)
  }
  let fooled = 0;
  for (const m of missiles) !m.enemy && !m.dead && m.target === B && dist3(m, B) < 80 && (m.target = made[fooled % made.length], m.sure = !1, m.turn = 5, fooled++);
  popup(B.x, B.y + 3, B.z, "FLARES!"), Sound.tone(900, .25, "triangle", .08, 300), Sound.tone(700, .25, "triangle", .06, 250, .08)
}

function updateAce(dt, hostile) {
  const B = boss,
    ud = B.mesh.userData;
  if (B.dead) {
    if (B.dying -= dt, B.y -= dt * (8 + (1.8 - B.dying) * 20), B.roll += dt * 10, B.p = lerp(B.p, -.8, dt * 2), B.x += Math.cos(B.a) * 14 * dt, B.z += Math.sin(B.a) * 14 * dt, Math.random() < .7 && addPart(B.x, B.y, B.z, rand(-1, 1), 2, rand(-1, 1), .9, rand(.9, 1.5), Math.random() < .3 ? 16742957 : 3817301, 1.4), Math.random() < dt * 8 && (explode(B.x, B.y, B.z, .7), Sound.sfxBoom()), B.dying <= 0 || B.y < 1) {
      explode(B.x, Math.max(B.y, 1), B.z, 3), shockwave(B.x, Math.max(B.y, 1), B.z, 60, 16777215, .9), shockwave(B.x, Math.max(B.y, 1), B.z, 35, 16723285, .7), shake = .7, killFlash(), Sound.sfxBoom(), state === "playing" && (spawnPickup("missile"), spawnPickup("ammo")), scene.remove(B.mesh), boss = null, acePhase = "done";
      return
    }
    orientPlane(B, dt);
    return
  }
  const ph2 = B.phase >= 2;
  B.intro > 0 && (B.intro -= dt), B.stun > 0 && (B.stun -= dt, B.dodgeCd = Math.max(B.dodgeCd, .1), B.fireCd = Math.max(B.fireCd, .1)), B.fireCd -= dt, B.mslCd -= dt, B.sonicCd -= dt, B.dodgeCd -= dt, B.flareCd -= dt, B.shieldCd -= dt, B.breakCd -= dt, B.ramCd -= dt, B.cloakCd -= dt, B.dmgWin = Math.max(0, B.dmgWin - dt * B.max * .04), B.flareRegen -= dt, B.flareRegen <= 0 && (B.flareRegen = ph2 ? 14 : 18, B.flares = Math.min(3, B.flares + 1)), B.shieldT > 0 ? (B.shieldT -= dt, ud.shield.visible = B.shieldT > 0 && (B.shieldT > .6 || Math.floor(time * 12) % 2 === 0), ud.shield.material.opacity = .22 + Math.sin(time * 14) * .08) : ud.shield.visible = !1, $("bossBar").classList.toggle("shield", B.shieldT > 0);
  const pf = fwdOf(player),
    dx = player.x - B.x,
    dy = player.y - B.y,
    dz = player.z - B.z,
    d = Math.hypot(dx, dy, dz) || 1,
    toMe = -(pf[0] * dx + pf[1] * dy + pf[2] * dz) / d,
    engaged = hostile && player.alive && !playerHidden();
  if (B.mineCd = (B.mineCd ?? 4) - dt, engaged && state === "playing" && B.intro <= 0 && B.mineCd <= 0 && toMe > .45 && d < 75 && !(B.cloakT > 0) && (B.mineCd = ph2 ? 9 : 12, dropMine(B)), B.dodgeT > 0) {
    B.dodgeT -= dt;
    const k = 1 - Math.max(0, B.dodgeT) / .55;
    B.rollFx = B.dodgeDir * k * Math.PI * 2;
    const side = 34 * B.dodgeDir;
    B.x += -Math.sin(B.a) * side * dt, B.z += Math.cos(B.a) * side * dt, B.y = clampAlt(B.y + B.dodgeUp * 14 * dt), Math.random() < .6 && addPart(B.x, B.y, B.z, 0, 0, 0, .35, .5, 16735370, .8), B.dodgeT <= 0 && (B.rollFx = 0)
  } else if (B.dodgeCd <= 0 && B.intro <= 0)
    for (const b of bullets) {
      if (b.enemy) continue;
      const rx = B.x - b.x,
        ry = B.y - b.y,
        rz = B.z - b.z,
        vv = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz,
        t = (rx * b.vx + ry * b.vy + rz * b.vz) / vv;
      if (t < 0 || t > .45) continue;
      const cx = rx - b.vx * t,
        cy = ry - b.vy * t,
        cz = rz - b.vz * t;
      if (!(cx * cx + cy * cy + cz * cz > 16)) {
        if (B.dodgeCd = ph2 ? 1.4 : 1.9, Math.random() < (ph2 ? .55 : .4)) {
          const side = -Math.sin(B.a) * cx + Math.cos(B.a) * cz;
          B.dodgeDir = side >= 0 ? 1 : -1, B.dodgeUp = cy >= 0 ? .6 : -.6, B.dodgeT = .55, B.dodges++, Sound.sfxBoost(), B.dodges % 2 === 1 && !(B.cloakT > 0) && popup(B.x, B.y + 3, B.z, "EVADED")
        }
        break
      }
    }
  let threat = null;
  for (const m of missiles)
    if (!m.enemy && !m.dead && m.target === B && dist3(m, B) < (m.sure ? 55 : 40)) {
      threat = m;
      break
    } if (threat && B.intro <= 0 && (B.flares > 0 && B.flareCd <= 0 ? aceFlares(B) : B.flares <= 0 && B.shieldT <= 0 && B.shieldCd <= 0 && dist3(threat, B) < 20 && aceShield(B, "SHIELD!")), (B.lock || 0) > .6 && B.lock < 1 && B.breakCd <= 0 && (B.lock = 0, B.breakCd = ph2 ? 12 : 16, B.dodgeDir = Math.random() < .5 ? -1 : 1, B.dodgeUp = rand(-.8, .8), B.dodgeT = .55, popup(B.x, B.y + 3, B.z, "LOCK BROKEN"), Sound.tone(500, .2, "square", .06, 200)), B.ramCharge > 0) {
    B.ramCharge -= dt;
    for (let i = 0; i < 2; i++) addPart(B.x + rand(-2, 2), B.y + rand(-2, 2), B.z + rand(-2, 2), rand(-4, 4), rand(-4, 4), rand(-4, 4), .3, .6, 16723285, .5);
    B.ramCharge <= 0 && (B.ramT = ph2 ? 1.8 : 1.5, B.shieldT = Math.max(B.shieldT, B.ramT + .2), ud.shield.visible = !0, B.ramHeading = Math.atan2(player.z - B.z, player.x - B.x), B.ramPitch = clamp(Math.atan2(player.y - B.y, Math.hypot(player.x - B.x, player.z - B.z)), -.5, .5), shockwave(B.x, B.y, B.z, 16, 16723285, .4), Sound.sfxBoost(), Sound.tone(120, .8, "sawtooth", .12, 60))
  } else if (B.ramT > 0) {
    B.ramT -= dt;
    const rs = Math.max(34, playerSpeed() * 2.1),
      cpr = Math.cos(B.ramPitch);
    B.ramHeading += clamp(wrapA(Math.atan2(player.z - B.z, player.x - B.x) - B.ramHeading), -.9 * dt, .9 * dt), B.a = B.ramHeading, B.p = B.ramPitch, B.roll = lerp(B.roll, 0, dt * 6), B.x += Math.cos(B.a) * cpr * rs * dt, B.z += Math.sin(B.a) * cpr * rs * dt, B.y = clamp(B.y + Math.sin(B.p) * rs * dt, ALT_MIN, ALT_MAX);
    for (const sd of [-1, 1]) addPart(B.x - Math.sin(B.a) * sd * 3, B.y, B.z + Math.cos(B.a) * sd * 3, 0, 0, 0, .4, .8, 16735370, 1);
    state === "playing" && dist3(B, player) < 6.5 && player.invul <= 0 && (damage(!1, null, "FALCON ZERO RAM"), shockwave(player.x, player.y, player.z, 14, 16723285, .35), B.ramT = 0, B.breakCd = 0), B.ramT <= 0 && (B.dodgeDir = Math.random() < .5 ? -1 : 1), animateExhaust(B, !0, dt), orientPlane(B, dt);
    return
  } else engaged && state === "playing" && B.intro <= 0 && B.cloakT <= 0 && B.dodgeT <= 0 && B.ramCd <= 0 && d > 30 && d < 95 && (B.ramCd = ph2 ? 13 : 17, B.ramCharge = 1.3, banner("SHIELD RAM", "GET OUT OF THE WAY", "#ff2d55"), Sound.sfxSiren(), popup(B.x, B.y + 3, B.z, "RAM INCOMING"));
  if (B.cloakT > 0) B.cloakT -= dt, B.lock = 0, Math.random() < dt * 10 && addPart(B.x + rand(-3, 3), B.y + rand(-1.5, 1.5), B.z + rand(-3, 3), 0, 0, 0, .35, .35, 11967999, .5), ud.cloak = !0, B.cloakT <= 0 && (ud.cloak = !1, B.mesh.visible = !0, shockwave(B.x, B.y, B.z, 14, 11967999, .4), Sound.tone(200, .4, "sine", .12, 900), popup(B.x, B.y + 3, B.z, "AMBUSH!"), B.fireCd = 0, B.burst = 0);
  else if (engaged && state === "playing" && B.intro <= 0 && B.ramCharge <= 0 && B.cloakCd <= 0 && (toMe > .5 || B.hp < B.max * .75)) {
    B.cloakT = ph2 ? 2.8 : 2.2, B.cloakCd = ph2 ? 20 : 26, B.lock = 0;
    for (const m of missiles) !m.enemy && m.target === B && (m.target = null, m.sure = !1);
    shockwave(B.x, B.y, B.z, 12, 11967999, .4), Sound.tone(900, .5, "sine", .08, 200), popup(B.x, B.y + 3, B.z, "CLOAKED"), toast("FALCON ZERO VANISHED \u2014 WATCH YOUR SIX")
  }
  B.mesh.visible = !(B.cloakT > 0) || Math.floor(time * 8) % 4 === 0;
  const baseSpd = cruiseSpeed() * Math.min(1, player.ve || 1) / (ramTime > 0 ? 1.65 : 1);
  let tx, ty, tz, spd;
  const onTail = engaged && toMe < -.3 && d < 60 && !(B.cloakT > 0);
  if (B.extendT > 0 ? B.extendT -= dt : onTail ? (B.tailT += dt, B.tailT > (ph2 ? 3.8 : 2.8) && (B.tailT = 0, B.extendT = rand(2.8, 3.8), B.extendA = B.a + (Math.random() < .5 ? -1 : 1) * rand(.7, 1.1), B.extendUp = rand(-12, 14))) : B.tailT = Math.max(0, B.tailT - dt * .5), B.weave += dt * (ph2 ? 3.4 : 2.6), !engaged) tx = B.x + Math.cos(B.a) * 40, tz = B.z + Math.sin(B.a) * 40, ty = B.y, spd = baseSpd;
  else if (d < 16) {
    const sa = B.a + Math.PI / 2 * (B.dodgeDir || 1);
    tx = B.x + Math.cos(sa) * 40, tz = B.z + Math.sin(sa) * 40, ty = clampAlt(B.y + 8), spd = baseSpd * 1.2
  } else if (B.cloakT > 0) tx = player.x - pf[0] * 30, ty = player.y + 3, tz = player.z - pf[2] * 30, spd = baseSpd * 1.35;
  else if (B.extendT > 0) tx = B.x + Math.cos(B.extendA) * 50, tz = B.z + Math.sin(B.extendA) * 50, ty = clampAlt(B.y + B.extendUp), spd = baseSpd * 1.25;
  else if (toMe > .55) {
    const wa = B.a + Math.sin(B.weave) * 1.1;
    tx = B.x + Math.cos(wa) * 40, tz = B.z + Math.sin(wa) * 40, ty = clampAlt(B.y + Math.cos(B.weave * .8) * 16), spd = baseSpd * (ph2 ? 1.25 : 1.15)
  } else {
    const ps = playerSpeed(),
      lead = d / (botSpeed() + 30) * .5,
      behind = d > 45 ? 0 : 30;
    tx = player.x - pf[0] * behind + pf[0] * ps * lead, ty = player.y - pf[1] * behind + pf[1] * ps * lead + 2, tz = player.z - pf[2] * behind + pf[2] * ps * lead, spd = baseSpd * (d > 60 ? 1.3 : d > 45 ? 1.05 : .92) * (ph2 ? 1.08 : 1)
  }
  tx = clamp(tx, -MAP + 20, MAP - 20), tz = clamp(tz, -MAP + 20, MAP - 20);
  let desired = Math.atan2(tz - B.z, tx - B.x);
  (Math.abs(B.x) > MAP - 10 || Math.abs(B.z) > MAP - 10) && (desired = Math.atan2(-B.z, -B.x)), turnToward(B, desired, ph2 ? 2.9 : 2.4, dt);
  let pitch = clamp(Math.atan2(ty - B.y, Math.max(1, Math.hypot(tx - B.x, tz - B.z))), -.6, .6);
  B.y <= ALT_MIN + 1 && pitch < 0 && (pitch = 0), B.y >= ALT_MAX - 1 && pitch > 0 && (pitch = 0), B.p = lerp(B.p, pitch, Math.min(1, dt * 3)), spd = Math.max(20, spd) * (B.dodgeT > 0 ? 1.1 : 1);
  const cp = Math.cos(B.p);
  if (B.x += Math.cos(B.a) * cp * spd * dt, B.z += Math.sin(B.a) * cp * spd * dt, B.y = clamp(B.y + Math.sin(B.p) * spd * dt, ALT_MIN, ALT_MAX), engaged && state === "playing" && B.intro <= 0 && B.cloakT <= 0 && B.ramCharge <= 0 && !(B.extendT > 0)) {
    const f = fwdOf(B),
      off = Math.acos(clamp((dx * f[0] + dy * f[1] + dz * f[2]) / d, -1, 1));
    if (B.burst <= 0 && B.fireCd <= 0 && d < 70 && off < .22 && (B.burst = ph2 ? 4 : 3, B.fireCd = ph2 ? 1.5 : 2), B.burst > 0 && (B.burstT -= dt) <= 0) {
      B.burst--, B.burstT = .08;
      const ps = playerSpeed(),
        lead = d / (botSpeed() + 30);
      fire({
        ...B,
        guns: 2,
        airframe: "falcon"
      }, !0, {
        x: player.x + pf[0] * ps * lead,
        y: player.y + pf[1] * ps * lead,
        z: player.z + pf[2] * ps * lead
      }), Sound.sfxEnemyShoot({
        airframe: "falcon"
      })
    }
    if (B.mslCd <= 0 && d > 30 && d < 100 && off < .9 && (launchMissile(B, !0), B.mslCd = rand(12, 16), popup(B.x, B.y + 3, B.z, "FOX TWO")), ph2 && B.sonicCd <= 0 && d < 24) {
      B.sonicCd = 9, shockwave(B.x, B.y, B.z, 30, 14677759, .5), ring(B.x, B.y, B.z, 30, 14677759, 40, 55);
      for (const b of bullets) !b.enemy && dist3(b, B) < 32 && (b.life = 0);
      d < 13 && damage(!1, null, "SONIC BOOM"), shake = Math.max(shake, .35), Sound.sfxBoom(), Sound.tone(90, .6, "sine", .3, 30), popup(B.x, B.y + 3, B.z, "SONIC BOOM")
    }
  }
  if (B.trailT -= dt, B.trailT <= 0) {
    B.trailT = .03;
    const f = fwdOf(B);
    for (const sd of [-1, 1]) addPart(B.x - f[0] * 4 - Math.sin(B.a) * sd * 4.8, B.y - f[1] * 4, B.z - f[2] * 4 + Math.cos(B.a) * sd * 4.8, 0, 0, 0, .6, .35, sd < 0 ? 16723285 : 16777215, .6)
  }
  animateExhaust(B, !0, dt), orientPlane(B, dt)
}

function killAce() {
  gainXp(200);
  const B = boss;
  B.dead = !0, B.dying = 1.8, bossCount++, kills++, aceSlain = !0, bossHeart(B, 1), B.mesh.userData.shield.visible = !1, B.rollFx = 0, B.cloakT = 0, B.ramT = 0, B.ramCharge = 0, B.mesh.visible = !0, awardKill(B.x, B.y + 4, B.z, B.pts, !0), $("bossBar").classList.add("hidden"), $("bossBar").classList.remove("ace", "shield"), shake = .6, hitStop(1.4, .15), killFlash(), banner("ACE DOWN", "+15000 PTS \xB7 +500 COINS", "#ffd24a"), Sound.sfxFanfare(!0), Sound.sfxBoom();
  for (const m of missiles) m.enemy && (explode(m.x, m.y, m.z, .5), removeMissile(m));
  missiles = missiles.filter(m => !m.dead), bullets = bullets.filter(b => !b.enemy), garage.coins += 500, saveGarage(), nextBossAt = 1e9, CG.happytime()
}

function bossHeart(B, n = 1) {
  if (state === "playing") {
    for (let i = 0; i < n; i++) {
      spawnPickup("heart", B.x + rand(-4, 4), B.z + rand(-4, 4), clampAlt(B.y + 2));
      const p = pickups[pickups.length - 1];
      p.magnet = !0, p.mt = -.4 * i
    }
    popup(B.x, B.y + 6, B.z, "\u2665 DROPPED", !0)
  }
}
const CARRIER_AT = 480;
let carrierPhase = "none",
  carrierT = 0,
  carrierWarned = !1,
  carrierSunk = !1;
const carrierLock = () => carrierPhase === "intro" || carrierPhase === "fight",
  SHIP_Y = 36,
  SHIP_BOW = 100,
  SHIP_STERN = -70,
  SHIP_HW = 55,
  SHIP_HH = 8,
  shipHalfW = x => SHIP_HW * (SHIP_BOW - x) / (SHIP_BOW - SHIP_STERN),
  HANGAR = {
    x0: -32,
    x1: -12,
    hh: 6
  },
  TOWER = {
    x0: -66,
    x1: -38,
    hz: 10,
    y0: SHIP_HH,
    y1: 24
  };

// ================= v8: IRON LEVIATHAN — a 4 km flying dreadnought with a maze inside =================
// Ship-local frame: +x toward the bow, z across, y up; the ship never turns (local = world - centre).
const DN = { SX: 1000, SY: 420, SZ: 0, BOW: 2600, STERN: -1400, HW: 1200, TOP: 150, DECK: 30, CELL: 60, MX0: -1400, MZ0: -300 };
// '#' wall · '.' corridor · 'R' reactor hall · 'D' blast door · 'L' laser curtain · 'T' ceiling turret ; entrance at the stern (column 0)
const MAZE = [
  '################',
  '##.....#.......#',
  '##.###.#.#####.#',
  '##.#...#...#RRR#',
  '..T.####.#.DRRR#',
  '..#.L.T....#RRR#',
  '##.#.#######.#.#',
  '##...#..D..L...#',
  '######.###.#####',
  '################'];
const DN_GW = 16, DN_GH = 10;
const DN_TOWER = { x0: -1300, x1: -950, hz: 260, y1: 520 };
const DN_SHAFT = { x0: -680, x1: -500, z0: -120, z1: 60 };   // the reactor hall's vent, straight up through the top plating
const DN_ROOM = { x: -590, z: -30 };
const dnHalfW = x => DN.HW * (DN.BOW - x) / (DN.BOW - DN.STERN);
const dnLocal = o => ({ x: o.x - DN.SX, y: o.y - DN.SY, z: o.z - DN.SZ });
const dnWorld = (x, y, z) => ({ x: x + DN.SX, y: y + DN.SY, z: z + DN.SZ });
const dnCellC = (i, j) => [DN.MX0 + DN.CELL * (i + 0.5), DN.MZ0 + DN.CELL * (j + 0.5)];
let dnArena = false, dnCamK = 1, dnState = null;
function dnCell(lx, lz) { const i = Math.floor((lx - DN.MX0) / DN.CELL), j = Math.floor((lz - DN.MZ0) / DN.CELL); return i >= 0 && i < DN_GW && j >= 0 && j < DN_GH ? [i, j] : null; }
function dnInHull(l) { return l.x >= DN.STERN && l.x <= DN.BOW && Math.abs(l.z) <= dnHalfW(l.x) && Math.abs(l.y) <= DN.TOP; }
function dnDoorOpenness(key) { const d = dnState && dnState.doors[key]; return d ? d.open : 1; }
function dnMetal(o) {
  if (!dnState) return false;
  const l = dnLocal(o);
  if (l.x > DN_TOWER.x0 && l.x < DN_TOWER.x1 && Math.abs(l.z) < DN_TOWER.hz && l.y >= DN.TOP && l.y < DN_TOWER.y1) return true;
  if (!dnInHull(l)) return false;
  if (dnState.lidOpen && l.y > -DN.DECK && l.x > DN_SHAFT.x0 && l.x < DN_SHAFT.x1 && l.z > DN_SHAFT.z0 && l.z < DN_SHAFT.z1) return false;
  if (Math.abs(l.y) > DN.DECK) return true;
  const c = dnCell(l.x, l.z); if (!c) return true;
  const ch = MAZE[c[1]][c[0]];
  if (ch === '#') return true;
  if (c[0] === 0 && !dnState.hangarOpen) return true;
  if (ch === 'D' && dnDoorOpenness(c[0] + ',' + c[1]) < 0.6) return true;
  return false;
}
const dnInside = o => { const l = dnLocal(o); return dnInHull(l) || (l.y > -DN.DECK && l.y < DN.DECK + 10 && dnCell(l.x, l.z) && l.x < DN.MX0 + DN.CELL); };
const dnInHall = o => { const l = dnLocal(o); return Math.abs(l.x - DN_ROOM.x) < 95 && Math.abs(l.z - DN_ROOM.z) < 95 && l.y > -DN.DECK && l.y < DN.TOP + 20; };

// ---- construction ----
function dnSlab(points, holes, y0, y1, mat) {
  const sh = new THREE.Shape(); points.forEach(([x, z], k) => k ? sh.lineTo(x, z) : sh.moveTo(x, z)); sh.closePath();
  for (const h of holes) { const p = new THREE.Path(); h.forEach(([x, z], k) => k ? p.lineTo(x, z) : p.moveTo(x, z)); p.closePath(); sh.holes.push(p); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, y1, 0); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
function dnInstanced(geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach((d, k) => { m4.compose(v.set(d[0], d[1], d[2]), q, s.set(d[3], d[4], d[5])); im.setMatrixAt(k, m4); });
  im.castShadow = false; im.receiveShadow = true; return im;
}
function makeDreadnought() {
  const g = new THREE.Group(); g.position.set(DN.SX, DN.SY, DN.SZ);
  const hull = new THREE.MeshStandardMaterial({ color: 0x6b7482, metalness: 0.35, roughness: 0.6 });
  const under = new THREE.MeshStandardMaterial({ color: 0x3c4350, metalness: 0.3, roughness: 0.7 });
  const wallM = new THREE.MeshStandardMaterial({ color: 0x4a5566, roughness: 0.75, emissive: 0x0e1626 });
  const glowB = new THREE.MeshBasicMaterial({ color: 0x7fd8ff }), glowY = new THREE.MeshBasicMaterial({ color: 0xffc04a }), glowR = new THREE.MeshBasicMaterial({ color: 0xff4040 });
  const W = [[DN.BOW, 0], [DN.STERN, DN.HW], [DN.STERN, -DN.HW]];
  const mazeX1 = DN.MX0 + DN.CELL * DN_GW, mazeZ0 = DN.MZ0, mazeZ1 = DN.MZ0 + DN.CELL * DN_GH;
  // top plating (with the reactor vent), bottom plating, and the deck layer notched for the maze block
  g.add(dnSlab(W, [[[DN_SHAFT.x0, DN_SHAFT.z0], [DN_SHAFT.x1, DN_SHAFT.z0], [DN_SHAFT.x1, DN_SHAFT.z1], [DN_SHAFT.x0, DN_SHAFT.z1]]], DN.DECK, DN.TOP, hull));
  g.add(dnSlab(W, [], -DN.TOP, -DN.DECK, under));
  g.add(dnSlab([[DN.BOW, 0], [DN.STERN, DN.HW], [DN.STERN, mazeZ1], [mazeX1, mazeZ1], [mazeX1, mazeZ0], [DN.STERN, mazeZ0], [DN.STERN, -DN.HW]], [], -DN.DECK, DN.DECK, hull));
  // maze walls, ceiling lights, and yellow guide lights along the way to the reactor
  const walls = [], lights = [], guide = [];
  const path = dnPath();
  for (let j = 0; j < DN_GH; j++) for (let i = 0; i < DN_GW; i++) {
    const ch = MAZE[j][i], [x, z] = dnCellC(i, j);
    if (ch === '#') walls.push([x, 0, z, DN.CELL, DN.CELL * 1.0, DN.CELL]);
    else if (ch !== 'R') lights.push([x, DN.DECK - 0.8, z, 30, 1, 5]);
  }
  for (const [i, j] of path) { const [x, z] = dnCellC(i, j); guide.push([x, -DN.DECK + 0.6, z, 6, 1, 6]); }
  g.add(dnInstanced(G.box, wallM, walls));
  g.add(dnInstanced(G.box, glowB, lights));
  g.add(dnInstanced(G.box, glowY, guide));
  // reactor hall: dark ring walls with glowing seams
  for (const a of [0, 1, 2, 3]) { const s = part(G.box, glowR, a % 2 ? 2 : 176, 3, a % 2 ? 176 : 2, DN_ROOM.x + (a === 1 ? 88 : a === 3 ? -88 : 0), 0, DN_ROOM.z + (a === 0 ? 88 : a === 2 ? -88 : 0), g); s.castShadow = false; }
  // stern hangar mouth: glowing frame + armored door
  const mouthZ = dnCellC(0, 4)[1] - DN.CELL / 2, mouthW = DN.CELL * 2;
  for (const [y, h] of [[DN.DECK + 2, 4], [-DN.DECK - 2, 4]]) part(G.box, glowY, 6, h, mouthW + 12, DN.STERN - 2, y, mouthZ + mouthW / 2, g);
  for (const z of [mouthZ - 4, mouthZ + mouthW + 4]) part(G.box, glowY, 6, DN.DECK * 2 + 8, 4, DN.STERN - 2, 0, z, g);
  const door = part(G.box, M(0x8a93a2, { metalness: 0.5 }), 6, DN.DECK * 2, mouthW, DN.STERN - 1, 0, mouthZ + mouthW / 2, g);
  // vent hatch over the reactor hall (opens for the escape)
  const lid = part(G.box, M(0x5a626e, { metalness: 0.5 }), DN_SHAFT.x1 - DN_SHAFT.x0, 4, DN_SHAFT.z1 - DN_SHAFT.z0, (DN_SHAFT.x0 + DN_SHAFT.x1) / 2, DN.DECK + 2, (DN_SHAFT.z0 + DN_SHAFT.z1) / 2, g);
  // command tower
  part(G.box, hull, DN_TOWER.x1 - DN_TOWER.x0, 220, DN_TOWER.hz * 2, (DN_TOWER.x0 + DN_TOWER.x1) / 2, DN.TOP + 110, 0, g);
  part(G.box, under, 300, 90, DN_TOWER.hz * 2 + 120, (DN_TOWER.x0 + DN_TOWER.x1) / 2, DN.TOP + 265, 0, g);
  part(G.box, new THREE.MeshBasicMaterial({ color: 0x9fe7ff }), 302, 8, DN_TOWER.hz * 2 + 122, (DN_TOWER.x0 + DN_TOWER.x1) / 2, DN.TOP + 270, 0, g);
  for (const sd of [-1, 1]) part(G.sph, hull, 45, 45, 45, (DN_TOWER.x0 + DN_TOWER.x1) / 2, DN.TOP + 340, sd * 150, g);
  // engines
  for (const z of [-900, -520, 520, 900]) {
    const e = part(G.cyl, under, 120, 120, 120, DN.STERN - 60, 0, z, g); e.rotation.z = Math.PI / 2;
    const f = part(G.cyl, glowB, 100, 6, 100, DN.STERN - 123, 0, z, g); f.rotation.z = Math.PI / 2;
  }
  // surface detail for scale
  const rnd = obstRng(99), greeb = [];
  for (let k = 0; k < 320; k++) {
    const x = DN.STERN + 80 + rnd() * (DN.BOW - DN.STERN - 400), w = dnHalfW(x) * 0.85, z = (rnd() * 2 - 1) * w;
    if (x > DN_TOWER.x0 - 30 && x < DN_TOWER.x1 + 30 && Math.abs(z) < DN_TOWER.hz + 70) continue;
    if (x > DN_SHAFT.x0 - 20 && x < DN_SHAFT.x1 + 20 && z > DN_SHAFT.z0 - 20 && z < DN_SHAFT.z1 + 20) continue;
    const sx = 20 + rnd() * 90, sy = 6 + rnd() * 30, sz = 20 + rnd() * 90;
    greeb.push([x, DN.TOP + sy / 2, z, sx, sy, sz]);
    if (k % 3 === 0) greeb.push([x, -DN.TOP - sy / 2, z, sx, sy, sz]);
  }
  g.add(dnInstanced(G.box, under, greeb));
  const edge = [];
  for (let x = DN.STERN + 40; x < DN.BOW - 60; x += 80) for (const sd of [-1, 1]) edge.push([x, 0, sd * (dnHalfW(x) + 1), 5, 5, 5]);
  g.add(dnInstanced(G.sphLo, glowR, edge));
  g.userData = { door, lid };
  return g;
}
// shortest route from the stern mouth to the reactor hall (for the floor guide lights)
function dnPath() {
  const start = [[0, 4], [0, 5]], seen = new Map(), q = [];
  for (const s of start) { seen.set(s + '', null); q.push(s); }
  let end = null;
  while (q.length) {
    const c = q.shift();
    if (MAZE[c[1]][c[0]] === 'R') { end = c; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [c[0] + dx, c[1] + dz];
      if (n[0] < 0 || n[0] >= DN_GW || n[1] < 0 || n[1] >= DN_GH || MAZE[n[1]][n[0]] === '#' || seen.has(n + '')) continue;
      seen.set(n + '', c); q.push(n);
    }
  }
  const out = []; for (let c = end; c; c = seen.get(c + '')) out.push(c);
  return out.reverse();
}
function dnPartMesh(kind) {
  const g = new THREE.Group(), head = new THREE.Group();
  if (kind === 'gen') {
    g.add(part(G.cyl, M(0x3c4350), 34, 10, 34, 0, 5, 0, g));
    part(G.sph, new THREE.MeshStandardMaterial({ color: 0x9fe7ff, emissive: 0x2a8cff, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }), 28, 20, 28, 0, 10, 0, head);
    const r = part(G.torus, new THREE.MeshBasicMaterial({ color: 0x7ff3ff }), 32, 32, 32, 0, 12, 0, head); r.rotation.x = Math.PI / 2;
  } else if (kind === 'bay') {
    g.add(part(G.box, M(0x2a303b), 96, 6, 76, 0, 3, 0, g));
    part(G.box, new THREE.MeshBasicMaterial({ color: 0xff8c3a }), 80, 1, 60, 0, 6.6, 0, head);
    for (let k = -3; k <= 3; k++) part(G.box, M(0x1a1e26), 2, 1.2, 60, k * 11, 7.2, 0, head);
  } else if (kind === 'pylon') {
    g.add(part(G.cyl, M(0x2a303b), 7, 8, 7, 0, -DN.DECK + 4, 0, g));
    part(G.cyl, new THREE.MeshStandardMaterial({ color: 0xffb08a, emissive: 0xff5a2a, emissiveIntensity: 2 }), 4, DN.DECK * 2 - 12, 4, 0, 0, 0, head);
  } else {   // core
    g.add(part(G.cyl, M(0x2a303b), 10, DN.DECK * 2, 10, 0, 0, 0, g));
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x9fe7ff, emissive: 0x2a8cff, emissiveIntensity: 1.8 });
    part(G.sph, coreMat, 16, 16, 16, 0, 0, 0, head);
    for (let k = 0; k < 3; k++) { const r = part(G.torus, M(0x4a5260, { metalness: 0.6 }), 21 + k * 3, 21 + k * 3, 21 + k * 3, 0, 0, 0, head); r.rotation.set(k * 1.1, k * 0.7, 0); }
    const shield = part(G.sph, new THREE.MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: 0.25, depthWrite: false }), 26, 26, 26, 0, 0, 0, g);
    g.userData.coreMat = coreMat; g.userData.shield = shield;
  }
  g.add(head); g.userData.head = head; g.userData.barrels = new THREE.Group();
  return g;
}
const DN_GENS = [[-1150, -520], [-1150, 520], [-800, -420], [-800, 420]];
const DN_BAYS = [[-1050, -820], [-1050, 820], [-620, -700], [-620, 700], [-250, -480], [-250, 480]];
const DN_GUNS_TOP = [[-1350, -420], [-1350, 420], [-950, -640], [-950, 640], [-700, -220], [-700, 160], [-420, -620], [-420, 620], [-150, -300], [-150, 300], [150, 0], [-1380, 0]];
const DN_GUNS_BOT = [[-1200, -300], [-1200, 300], [-700, -500], [-700, 500], [-300, 0]];

function dnSetArena(on) {
  dnArena = on;
  if (on) { MAP = 3300; ALT_MIN = 7; ALT_MAX = 1150; camera.far = 7000; scene.fog.near = 300; scene.fog.far = 5200; sea.scale.set(6, 6, 1); WORLD.posts.visible = WORLD.tops.visible = false; }
  else {
    camera.far = 700; sea.scale.set(1, 1, 1);
    if (themeNow >= 0) { const t = THEMES[themeNow]; scene.fog.near = t.fogN; scene.fog.far = t.fogF; WORLD.posts.visible = WORLD.tops.visible = !t.noIslands; }
    if (!isSpace()) { MAP = MAP_BASE; ALT_MIN = 7; ALT_MAX = 70; }
    player.y = clamp(player.y, ALT_MIN, ALT_MAX);
  }
  camera.updateProjectionMatrix();
}
function spawnCarrier() {
  dnSetArena(true);
  // the player starts well behind the stern, looking up at the whole ship
  Object.assign(player, { x: DN.SX + DN.STERN - 700, y: DN.SY + 60, z: 0, a: 0, p: 0, roll: 0, invul: 4 }); snapCamera();
  pickups.forEach(removePickup); pickups = [];
  const coreHp = Math.round(60 + 40 * gunDmg() * planeNow().guns);
  dnState = { hangarOpen: false, lidOpen: false, doors: {}, lasers: [], escapeT: 0, prev: { x: player.x, y: player.y, z: player.z }, msgT: 0, launchIx: 0 };
  for (let j = 0; j < DN_GH; j++) for (let i = 0; i < DN_GW; i++) if (MAZE[j][i] === 'D') dnState.doors[i + ',' + j] = { i, j, open: 1, t: rand(0, 4), mesh: null };
  boss = { x: DN.SX, y: DN.SY, z: DN.SZ, a: 0, p: 0, roll: 0, hp: coreHp, max: coreHp, scale: 30, carrier: true, boss: true, pts: 30000,
    phase: 1, parts: [], core: null, fall: 0, dying: 0, dead: false, intro: 1.5, mesh: makeDreadnought(), shieldMsgT: 0 };
  scene.add(boss.mesh);
  // blast doors and laser curtains
  for (const d of Object.values(dnState.doors)) {
    const [x, z] = dnCellC(d.i, d.j), alongX = MAZE[d.j][d.i - 1] !== '#' || MAZE[d.j][d.i + 1] !== '#';
    d.mesh = part(G.box, M(0x8a93a2, { metalness: 0.5, emissive: 0x331100 }), alongX ? 6 : DN.CELL, DN.CELL, alongX ? DN.CELL : 6, x, 0, z, boss.mesh);
    const stripe = part(G.box, new THREE.MeshBasicMaterial({ color: 0xffb13b }), alongX ? 6.5 : DN.CELL, 4, alongX ? DN.CELL : 6.5, 0, -24, 0, d.mesh); stripe.scale.set(1 / (alongX ? 6 : DN.CELL), 4 / DN.CELL, 1 / (alongX ? DN.CELL : 6));
  }
  for (let j = 0; j < DN_GH; j++) for (let i = 0; i < DN_GW; i++) if (MAZE[j][i] === 'L') {
    const [x, z] = dnCellC(i, j), alongX = MAZE[j][i - 1] !== '#', grp = new THREE.Group(); grp.position.set(x, 0, z); boss.mesh.add(grp);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.9 });
    for (let k = -2; k <= 2; k++) { const beam = new THREE.Mesh(G.cyl, mat); beam.scale.set(0.8, DN.CELL, 0.8); beam.position.set(alongX ? 0 : k * 11, 0, alongX ? k * 11 : 0); grp.add(beam); }
    dnState.lasers.push({ i, j, grp, mat, t: rand(0, 3), on: false });
  }
  const mk = (kind, lx, ly, lz, hp, hitR, pts, extra = {}) => {
    const mesh = kind === 'gun' || kind === 'iturret' ? makeTurret() : dnPartMesh(kind);
    const w = dnWorld(lx, ly, lz); mesh.position.set(w.x, w.y, w.z);
    if (ly < 0 && kind !== 'pylon' && kind !== 'core') mesh.rotation.x = Math.PI;   // hangs under the hull / from a ceiling
    if (kind === 'gun') mesh.scale.setScalar(2.4);
    scene.add(mesh);
    const t = { x: w.x, y: w.y + (ly < 0 ? -3 : 3), z: w.z, hp, hpMax: hp, cd: rand(1, 2.5), dead: false, mesh, scale: hitR / 3, hitR, pts, carrier: true,
      noFlak: !(kind === 'gun' || kind === 'iturret'), dnKind: kind, core: kind === 'core', inner: kind === 'pylon' || kind === 'core' || kind === 'iturret', ...extra };
    turrets.push(t); if (kind === 'core') boss.core = t; else boss.parts.push(t);
    return t;
  };
  for (const [x, z] of DN_GENS) mk('gen', x, DN.TOP, z, 34, 26, 800);
  for (const [x, z] of DN_BAYS) mk('bay', x, DN.TOP, z, 30, 34, 700, { launchT: rand(2, 6) });
  for (const [x, z] of DN_GUNS_TOP) mk('gun', x, DN.TOP, z, 16, 6, 300);
  for (const [x, z] of DN_GUNS_BOT) mk('gun', x, -DN.TOP, z, 16, 6, 300);
  for (let j = 0; j < DN_GH; j++) for (let i = 0; i < DN_GW; i++) if (MAZE[j][i] === 'T') { const [x, z] = dnCellC(i, j); mk('iturret', x, DN.DECK - 4, z, 10, 4, 250); }
  for (const [ox, oz] of [[-60, -60], [60, -60], [-60, 60], [60, 60]]) mk('pylon', DN_ROOM.x + ox, 0, DN_ROOM.z + oz, 22, 8, 900);
  mk('core', DN_ROOM.x, 0, DN_ROOM.z, coreHp, 22, 0);
  $('bossBar').classList.remove('ace', 'shield'); $('bossBar').classList.add('titan', 'shield'); $('bossBar').classList.remove('hidden');
  carrierBar();
  banner('IRON LEVIATHAN', 'KNOCK OUT THE 4 SHIELD GENERATORS', '#69c8ff');
  toast('Launch bays keep sending fighters — destroy them to stop it');
  Sound.tone(30, 3, 'sawtooth', 0.28, 60); Sound.sfxBoom();
  for (let i = 0; i < 4; i++) spawnPickup('ammo', player.x + rand(40, 160), player.z + rand(-80, 80), player.y + rand(-20, 20));
  spawnPickup('missile', player.x + 120, player.z, player.y);
}
const dnLeft = kind => boss && boss.parts ? boss.parts.filter(t => t.dnKind === kind && !t.dead).length : 0;
function carrierBar() {
  const B = boss; if (!B || !B.carrier || !dnState) return;
  let name, f;
  if (B.phase === 1) { const n = dnLeft('gen'); name = 'IRON LEVIATHAN · SHIELD GENERATORS ' + n + '/4'; f = n / 4; }
  else if (B.phase === 2) { const n = dnLeft('pylon'); name = 'HANGAR OPEN · REACTOR PYLONS ' + n + '/4'; f = n / 4; }
  else if (B.phase === 3) { name = 'CORE EXPOSED · DESTROY IT'; f = Math.max(0, B.core.hp / B.max); }
  else { name = 'ESCAPE! · ' + Math.max(0, Math.ceil(dnState.escapeT)) + 's · UP THROUGH THE VENT OR BACK OUT'; f = Math.max(0, dnState.escapeT / 40); }
  $('bossName').textContent = name; $('bossFill').style.width = (f * 100).toFixed(1) + '%';
}
function placeCarrierParts() {}
function carrierPartDown() {
  const B = boss; if (!B || !B.carrier || B.dead) return;
  if (B.phase === 1 && dnLeft('gen') === 0) {
    B.phase = 2; dnState.hangarOpen = true;
    banner('SHIELDS DOWN', 'THE HANGAR IS OPEN · FLY INSIDE', '#ff7a2d');
    toast('Follow the yellow floor lights to the reactor');
    Sound.sfxSiren(); Sound.sfxBoom(); shake = Math.max(shake, 0.4);
  } else if (B.phase === 2 && dnLeft('pylon') === 0) {
    B.phase = 3; $('bossBar').classList.remove('shield');
    const ud = B.core.mesh.userData; ud.shield.visible = false; ud.coreMat.color.set(0xffb08a); ud.coreMat.emissive.set(0xff3b1a); ud.coreMat.emissiveIntensity = 2.6;
    banner('CORE EXPOSED', 'DESTROY THE REACTOR CORE', '#ff2d55'); Sound.sfxSiren();
  }
  carrierBar();
}
function carrierBlocks(at) {
  for (let i = 0; i < 3; i++) addPart(at.x, at.y, at.z, rand(-5, 5), rand(0, 5), rand(-5, 5), 0.3, 0.4, 0x9fdcff);
  if (Math.random() < 0.2) Sound.tone(1200, 0.04, 'triangle', 0.04);
  if (boss && (boss.shieldMsgT || 0) <= 0 && !dnInside(player) && boss.phase === 1) { boss.shieldMsgT = 5; toast('ARMORED HULL · hit the SHIELD GENERATORS'); }
  return true;
}
function hitReactor(t, dmg) {
  const B = boss; if (!B || !B.carrier || B.dead) return;
  for (let i = 0; i < 6; i++) addPart(t.x, t.y, t.z, rand(-8, 8), rand(-8, 8), rand(-8, 8), 0.35, 0.6, B.phase === 3 ? 0xffe24a : 0x9fdcff);
  if (B.phase !== 3) { if ((B.shieldMsgT || 0) <= 0) { B.shieldMsgT = 3; toast(B.phase < 2 ? 'The core is deep inside the ship' : 'CORE SHIELDED · destroy the 4 pylons'); } return; }
  t.hp -= dmg; B.hp = t.hp; if (t.hp > 0 && typeof hitFx === 'function') hitFx(t, dmg);
  Sound.tone(260, 0.05, 'square', 0.06); carrierBar();
  if (t.hp <= 0) { t.dead = true; dnCoreDown(); }
}
function dnCoreDown() {
  const B = boss, c = B.core;
  explode(c.x, c.y, c.z, 3); shockwave(c.x, c.y, c.z, 60, 0xffb13b, 0.7); c.mesh.visible = false;
  B.phase = 4; dnState.escapeT = 40; dnState.lidOpen = true;
  awardKill(c.x, c.y, c.z, 5000, true);
  banner('CORE BREACHED', 'ESCAPE BEFORE IT BLOWS · 40s', '#ff2d55');
  toast('Climb out through the open vent above the hall!');
  Sound.sfxSiren(); shake = Math.max(shake, 0.6); hitStop(0.6, 0.25); carrierBar();
}
function killCarrier() {   // player got out: the whole ship comes apart
  gainXp(300);
  const B = boss;
  B.dead = true; B.dying = 7; bossCount++; kills++; carrierSunk = true;
  awardKill(player.x, player.y + 6, player.z, B.pts, true);
  bossHeart({ x: player.x, y: player.y, z: player.z }, 2);
  $('bossBar').classList.add('hidden'); $('bossBar').classList.remove('titan', 'shield');
  shake = 0.8; hitStop(1.2, 0.2); killFlash();
  banner('LEVIATHAN DOWN', '+30000 PTS · +800 COINS', '#ffd24a');
  Sound.sfxFanfare(true); Sound.sfxBoom();
  for (const m of missiles) if (m.enemy) { explode(m.x, m.y, m.z, 0.5); removeMissile(m); }
  missiles = missiles.filter(m => !m.dead); bullets = bullets.filter(b => !b.enemy);
  for (const b of bots) { explode(b.x, b.y, b.z, 1); removeBot(b); b.dead = true; }
  bots = [];
  for (const t of B.parts) if (!t.dead) { t.dead = true; t.mesh.visible = false; }
  garage.coins += 800; saveGarage();
  nextBossAt = 1e9;
  CG.happytime();
}
function dnCleanup() {
  if (boss && boss.carrier) { for (const t of [...boss.parts, boss.core]) if (t) scene.remove(t.mesh); }
  turrets = turrets.filter(t => !t.carrier);
  dnState = null; dnSetArena(false); dnCamK = 1;
}
function updateCarrier(dt, hostile) {
  const B = boss, S = dnState;
  B.shieldMsgT = (B.shieldMsgT || 0) - dt;
  const ud = B.mesh.userData;
  if (B.dead) {   // chain explosions along 4 km of hull, then it drops into the sea
    B.dying -= dt; B.fall += dt; B.y -= dt * (2 + B.fall * 14); B.mesh.position.y = B.y; B.mesh.rotation.z = lerp(B.mesh.rotation.z, -0.08, dt * 0.3);
    for (let k = 0; k < 3; k++) if (Math.random() < dt * 10) {
      const x = DN.STERN + Math.random() * (DN.BOW - DN.STERN), z = (Math.random() * 2 - 1) * dnHalfW(x) * 0.8;
      const w = dnWorld(x, rand(-DN.TOP, DN.TOP), z); w.y += B.y - DN.SY;
      if (dist3(w, player) < 2500) { explode(w.x, w.y, w.z, 3); if (Math.random() < 0.3) Sound.sfxBoom(); }
    }
    shake = Math.max(shake, 0.12);
    if (B.dying <= 0) {
      shockwave(player.x, player.y, player.z, 200, 0xffffff, 1.2); killFlash(); Sound.tone(35, 2, 'sine', 0.35, 18);
      scene.remove(B.mesh); dnCleanup(); boss = null; carrierPhase = 'done';
    }
    return;
  }
  if (B.intro > 0) B.intro -= dt;
  // ---- hard collisions for the player: slide along walls, crash damage ----
  if (state === 'playing' && player.alive) {
    if (dnMetal(player)) {
      const p = S.prev, nx = player.x, ny = player.y, nz = player.z;
      player.x = p.x; player.y = p.y; player.z = p.z;
      if (!dnMetal({ x: nx, y: p.y, z: p.z })) player.x = nx;
      if (!dnMetal({ x: player.x, y: p.y, z: nz })) player.z = nz;
      if (!dnMetal({ x: player.x, y: ny, z: player.z })) player.y = ny;
      if (dnMetal(player)) { player.x = p.x; player.y = p.y; player.z = p.z; }
      shieldTime > 0 || (player.ve = Math.max(.45, (player.ve || 1) * .8));
      if (player.invul <= 0) { shieldTime > 0 ? popup(player.x, player.y + 2, player.z, 'SHIELD') : damage(!0, 'HULL!'); }
      shake = Math.max(shake, 0.25);
      for (let i = 0; i < 6; i++) addPart(player.x, player.y, player.z, rand(-6, 6), rand(-4, 6), rand(-6, 6), 0.4, 0.45, 0xffe08a, 0.5);
    }
    S.prev = { x: player.x, y: player.y, z: player.z };
  }
  const inside = dnInside(player);
  dnCamK = lerp(dnCamK, inside ? 0.55 : 1, Math.min(1, dt * 4));
  // shots and enemies against the hull
  for (const b of bullets) if (b.life > 0 && dnMetal(b)) b.life = 0;
  for (const b of bots) if (!b.dead && dnMetal(b)) crashBot(b, 'SMASHED!');
  // door + hatch animation
  ud.door.position.y = lerp(ud.door.position.y, S.hangarOpen ? DN.DECK * 2 + 4 : 0, Math.min(1, dt * 1.5));
  ud.lid.position.x = lerp(ud.lid.position.x, S.lidOpen ? (DN_SHAFT.x0 + DN_SHAFT.x1) / 2 + 190 : (DN_SHAFT.x0 + DN_SHAFT.x1) / 2, Math.min(1, dt * 1.2));
  ud.lid.position.y = S.lidOpen ? DN.TOP + 2 : DN.DECK + 2;
  for (const d of Object.values(S.doors)) {   // blast doors cycle: open 2.4s, shut 1.4s
    d.t = (d.t + dt) % 4.2;
    const want = d.t < 2.4 ? 1 : d.t < 2.7 ? 1 - (d.t - 2.4) / 0.3 : d.t < 3.9 ? 0 : (d.t - 3.9) / 0.3;
    d.open = want; d.mesh.position.y = d.open * (DN.CELL - 4);
    if (!d.warn && d.t > 2.0 && d.t < 2.4 && inside && dist3(dnWorld(...(([x, z]) => [x, 0, z])(dnCellC(d.i, d.j))), player) < 160) { d.warn = true; Sound.tone(520, 0.12, 'square', 0.05); }
    if (d.t < 2.0) d.warn = false;
  }
  const pc = inside ? dnCell(player.x - DN.SX, player.z - DN.SZ) : null;
  for (const L of S.lasers) {   // laser curtains: 1.6s on / 1.6s off, blinking warning first
    L.t = (L.t + dt) % 3.2; const on = L.t < 1.6, warn = L.t > 2.9;
    L.on = on; L.grp.visible = on || (warn && Math.floor(time * 16) % 2 === 0); L.mat.opacity = on ? 0.9 : 0.35;
    if (on && pc && pc[0] === L.i && pc[1] === L.j && state === 'playing' && player.invul <= 0) { damage(!1, null, 'LASER'); popup(player.x, player.y + 2, player.z, 'LASER!'); }
  }
  // core visuals
  if (B.core && !B.core.dead) { const h = B.core.mesh.userData.head; h.rotation.y += dt * 0.8; h.rotation.x += dt * 0.5; }
  for (const t of B.parts) if (t.dnKind === 'gen' && !t.dead) t.mesh.userData.head.rotation.y += dt * 0.6;
  // hint + phase checks
  if (B.phase === 2 && inside && !S.enteredMsg) { S.enteredMsg = true; banner('INSIDE THE LEVIATHAN', 'FOLLOW THE YELLOW LIGHTS', '#ffb13b'); }
  if (B.phase === 3 && dnInHall(player) && !S.hallMsg) { S.hallMsg = true; toast('Lock on to the CORE and fire!'); }
  if (B.phase === 4) {
    S.escapeT -= dt; carrierBar();
    if (Math.floor(S.escapeT) !== Math.floor(S.escapeT + dt)) Sound.tone(S.escapeT < 10 ? 1200 : 800, 0.08, 'square', 0.06);
    if (Math.random() < dt * 8) { const l = dnLocal(player); const w = dnWorld(l.x + rand(-80, 80), rand(-DN.DECK, DN.DECK), l.z + rand(-80, 80)); explode(w.x, w.y, w.z, 1.2); shake = Math.max(shake, 0.2); }
    if (!inside && state === 'playing') { killCarrier(); return; }
    if (S.escapeT <= 0 && state === 'playing') { S.escapeT = 0; revived = true; rollTime = shieldTime = 0; player.hp = 1; player.invul = 0; damage(!1, null, 'CORE BLAST'); banner('CAUGHT IN THE BLAST', '', '#ff2d55'); return; }
  }
  // enemy activity
  const act = hostile && player.alive && state === 'playing' && !playerHidden() && !(B.intro > 0);
  if (act && B.phase < 4) {
    for (const t of B.parts) {
      if (t.dnKind !== 'bay' || t.dead) continue;   // launch bays push fighters out
      t.launchT -= dt;
      if (t.launchT <= 0 && bots.length < 8 && dist3(t, player) < 1100) {
        t.launchT = rand(5, 8);
        const e = spawnBot(Math.random() < 0.2 + lvT / 2400 ? 'ace' : 'normal', { x: t.x, y: t.y + 10, z: t.z });
        if (e) {
          e.x = t.x; e.y = t.y + 14; e.z = t.z; e.a = rand(0, Math.PI * 2); e.p = 0.5; e.pts = e.kind === 'ace' ? 450 : 150;
          if (typeof loopBuff === 'function') loopBuff(e); orientPlane(e, 0);
          for (let i = 0; i < 14; i++) addPart(t.x, t.y + 6, t.z, rand(-6, 6), rand(4, 12), rand(-6, 6), 0.7, 1.4, 0xffc27a, 1.2);
          Sound.sfxBoost();
        }
      }
    }
  }
}
function dnMarks() {   // objective markers for the HUD
  const B = boss, out = [];
  if (!B || !B.carrier || B.dead || !dnState) return out;
  const inside = dnInside(player);
  if (B.phase === 1) {
    for (const t of B.parts) if (!t.dead && t.dnKind === 'gen') out.push({ o: t, cls: 'boss', lbl: 'GENERATOR ' });
    for (const t of B.parts) if (!t.dead && t.dnKind === 'bay' && dist3(t, player) < 1400) out.push({ o: t, cls: 'tgt', lbl: 'LAUNCH BAY ' });
  } else if (B.phase === 2) {
    if (!inside) { const w = dnWorld(DN.STERN - 20, 0, 0); out.push({ o: { ...w, scale: 6 }, cls: 'gate', lbl: 'HANGAR ' }); }
    else for (const t of B.parts) if (!t.dead && t.dnKind === 'pylon') out.push({ o: t, cls: 'boss', lbl: 'PYLON ' });
  } else if (B.phase === 3) out.push({ o: B.core, cls: 'boss', lbl: 'CORE ' });
  else { const w = dnWorld((DN_SHAFT.x0 + DN_SHAFT.x1) / 2, DN.TOP + 30, (DN_SHAFT.z0 + DN_SHAFT.z1) / 2); out.push({ o: { ...w, scale: 6 }, cls: 'gate', lbl: 'EXIT ' }); }
  if (inside || B.phase === 1) for (const t of B.parts) if (!t.dead && t.dnKind === 'iturret' && dist3(t, player) < 200) out.push({ o: t, cls: 'tur', lbl: 'AA ', noArrow: true });
  if (!inside) for (const t of B.parts) if (!t.dead && t.dnKind === 'gun' && dist3(t, player) < 180) out.push({ o: t, cls: 'tur', lbl: 'AA ', noArrow: true });
  return out;
}
function carrierDist(o) { return dnMetal(o) ? -1 : 1; }
function playerInHangar() { return dnInside(player); }
const dnCoreLockable = t => !t.inner || (dnInside(player) && (!t.core || (boss && boss.phase === 3 && dnInHall(player))));

// ================= v8: stage terrain obstacles — the player AND enemies collide with them =================
const OBST = [];   // { kind: 'cyl', x, z, r, y0, y1 } vertical cylinders · { kind: 'box', x, z, hx, hz, y0, y1 } axis-aligned boxes
const UNDERS = [];   // fly-under gaps for the slalom: { x, y, z, ax } — ax is the open axis
let obstGroup = null, closeCallT = 0;
function clearObstacles() { if (obstGroup) scene.remove(obstGroup); obstGroup = null; OBST.length = 0; UNDERS.length = 0; }
function obstRng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// run fn with Math.random (and so rand()) replaced by a seeded generator
function withSeed(seed, fn) { const mr = Math.random; Math.random = obstRng(seed); try { return fn(); } finally { Math.random = mr; } }
function obstFreeSpot(rnd, r, keep) {
  for (let k = 0; k < 40; k++) {
    const x = (rnd() * 2 - 1) * (MAP - 30), z = (rnd() * 2 - 1) * (MAP - 30);
    if (Math.hypot(x, z) < keep + r) continue;   // keep the spawn area in the middle open
    if (OBST.some(o => Math.hypot(o.x - x, o.z - z) < (o.r || Math.max(o.hx, o.hz)) + r + 22)) continue;
    return [x, z];
  }
  return null;
}
const OBST_K = Math.round(MAP_K * MAP_K * .8);
function buildObstacles(i) {
  clearObstacles();
  const t = THEMES[i]; if (!t) return;
  obstGroup = new THREE.Group(); scene.add(obstGroup);
  const rnd = obstRng(1234 + i * 77);
  const cyl = (x, z, r, y0, y1) => OBST.push({ kind: 'cyl', x, z, r, y0, y1 });
  const box = (x, z, hx, hz, y0, y1) => OBST.push({ kind: 'box', x, z, hx, hz, y0, y1 });
  const add = (geo, mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; obstGroup.add(m); return m; };
  // island hills are solid everywhere the islands are shown
  if (!t.noIslands) for (const h of WORLD.hills.list) cyl(h.x, h.z, h.sx * 0.8, -5, h.y + h.sy * 0.8);
  if (i === 0) {   // OCEAN ISLES: tall sea stacks to weave between
    const rock = M(0x8a7f74, { roughness: 0.95, flatShading: true }), moss = M(0x5fae55, { roughness: 1 });
    for (let k = 0; k < 16 * OBST_K; k++) {
      const r = 5 + rnd() * 5, h = 30 + rnd() * 28, p = obstFreeSpot(rnd, r, 55); if (!p) continue;
      const [x, z] = p;
      add(G.cyl, rock, r, h * 0.55, r, x, h * 0.275, z);
      add(G.cyl, rock, r * 0.8, h * 0.35, r * 0.8, x + r * 0.1, h * 0.55 + h * 0.175, z);
      add(G.cyl, rock, r * 0.62, h * 0.12, r * 0.62, x, h * 0.9 + h * 0.06, z - r * 0.1);
      add(G.sph, moss, r * 0.66, r * 0.3, r * 0.66, x, h, z);
      cyl(x, z, r * 0.95, -5, h + 1);
    }
  } else if (i === 1) {   // DESERT CANYON: layered mesas, needle spires and stone arches
    const bands = [0xb85c36, 0xd4804a, 0xc0643a, 0xe0a060].map(c => M(c, { roughness: 1, flatShading: true }));
    for (let k = 0; k < 5 * OBST_K; k++) {   // arches (placed first so they always find room): two legs and a beam, axis-aligned
      const span = 34 + rnd() * 16, h = 30 + rnd() * 16, along = k % 2 === 0, p = obstFreeSpot(rnd, span * 0.6, 70); if (!p) continue;
      const [x, z] = p, leg = 5;
      for (const sd of [-1, 1]) {
        const lx = x + (along ? sd * span / 2 : 0), lz = z + (along ? 0 : sd * span / 2);
        add(G.cyl, bands[1], leg, h, leg, lx, h / 2, lz); cyl(lx, lz, leg, -5, h);
      }
      const bx = along ? span / 2 + leg : leg, bz = along ? leg : span / 2 + leg;
      add(G.box, bands[3], bx * 2, 7, bz * 2, x, h + 3.5, z); box(x, z, bx, bz, h, h + 7);
      UNDERS.push({ x, z, y: h * 0.5, ax: along ? 'z' : 'x' });
    }
    for (let k = 0; k < 12 * OBST_K; k++) {
      const r = 16 + rnd() * 18, h = 38 + rnd() * 22, p = obstFreeSpot(rnd, r, 60); if (!p) continue;
      const [x, z] = p;
      for (let b = 0; b < 4; b++) add(G.cyl, bands[b], r * (1 - b * 0.05), h / 4, r * (1 - b * 0.05), x, h / 8 + b * h / 4, z);
      cyl(x, z, r, -5, h);
    }
    for (let k = 0; k < 12 * OBST_K; k++) {
      const r = 3 + rnd() * 2.5, h = 44 + rnd() * 22, p = obstFreeSpot(rnd, r, 50); if (!p) continue;
      const [x, z] = p;
      add(G.cone, bands[k % 4], r * 1.3, h, r * 1.3, x, h / 2, z);
      cyl(x, z, r, -5, h * 0.92);
    }
  } else if (i === 4) {   // CLOUD SEA: floating rock islands hanging over the clouds
    const rock = M(0x8a7aa0, { roughness: 0.9, flatShading: true }), moss = M(0xffb0d0, { roughness: 0.8 }), fall = M(0xffffff, { roughness: 0.3, transparent: true, opacity: 0.55 });
    for (let k = 0; k < 11 * OBST_K; k++) {
      const p = obstFreeSpot(rnd, 16, 60); if (!p) continue;
      const [x, z] = p, r = 9 + rnd() * 9, y = 22 + rnd() * 30, h = r * (1.1 + rnd() * 0.5);
      add(G.cone, rock, r, h, r, x, y - h / 2, z).rotation.x = Math.PI;   // inverted cone of rock
      add(G.sph, moss, r * 1.05, r * 0.35, r * 1.05, x, y, z);
      add(G.cyl, fall, 1.4, y, 1.4, x + r * 0.6, y / 2, z);               // a thin cloud-fall to the sea
      cyl(x, z, r, y - h, y + r * 0.35);
    }
  } else if (i === 3) {   // NIGHT FRONT: sea platforms and blinking radio masts
    const steel = M(0x4a5260, { metalness: 0.5, roughness: 0.5 }), deck = M(0x2c323b), lamp = M(0xff3b3b, { emissive: 0xff1010, emissiveIntensity: 2 }), win = M(0xffe08a, { emissive: 0xffb13b, emissiveIntensity: 1.5 });
    for (let k = 0; k < 8 * OBST_K; k++) {
      const p = obstFreeSpot(rnd, 26, 60); if (!p) continue;
      const [x, z] = p, top = 22 + rnd() * 8;
      for (const [ox, oz] of [[-15, -10], [15, -10], [-15, 10], [15, 10]]) { add(G.cyl, steel, 1.8, top, 1.8, x + ox, top / 2, z + oz); cyl(x + ox, z + oz, 2, -5, top); }
      add(G.box, deck, 40, 5, 30, x, top + 2.5, z); box(x, z, 20, 15, top, top + 5);
      UNDERS.push({ x, z, y: Math.max(12, top * 0.5), ax: 'z' });
      add(G.box, steel, 14, 9, 10, x - 6, top + 9.5, z - 3); box(x - 6, z - 3, 7, 5, top + 5, top + 14);
      add(G.box, win, 14.2, 1.2, 10.2, x - 6, top + 11, z - 3);
      const m = add(G.sph, lamp, 1, 1, 1, x + 12, top + 7, z + 8); m.userData.blink = true;
      add(G.cyl, steel, 0.6, 12, 0.6, x + 12, top + 1, z + 8);
    }
    for (let k = 0; k < 10 * OBST_K; k++) {
      const p = obstFreeSpot(rnd, 5, 55); if (!p) continue;
      const [x, z] = p, h = 52 + rnd() * 14;
      add(G.cyl, steel, 1.6, h, 1.6, x, h / 2, z);
      for (let q = 1; q < 4; q++) add(G.box, steel, 7 - q, 0.6, 0.6, x, h * q / 4, z);
      const m = add(G.sph, lamp, 1.2, 1.2, 1.2, x, h + 0.8, z); m.userData.blink = true;
      cyl(x, z, 2.4, -5, h + 1.5);
    }
  }
}
// push o out of any obstacle; returns true if it was inside
function obstPush(o, pad) {
  let hit = false;
  for (const c of OBST) {
    if (o.y > c.y1 + pad || o.y < c.y0 - pad) continue;
    if (c.kind === 'cyl') {
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), need = c.r + pad;
      if (d >= need) continue;
      const side = need - d, top = c.y1 + pad - o.y;
      if (top < side && top > 0) o.y = c.y1 + pad; else { const k = need / (d || 1); o.x = c.x + (d ? dx : 1) * k; o.z = c.z + (d ? dz : 0) * k; }
      hit = true;
    } else {
      const px = c.hx + pad - Math.abs(o.x - c.x), pz = c.hz + pad - Math.abs(o.z - c.z);
      if (px <= 0 || pz <= 0) continue;
      const pt = c.y1 + pad - o.y, pb = o.y - (c.y0 - pad), m = Math.min(px, pz, pt, pb);
      if (m === pt) o.y = c.y1 + pad; else if (m === pb) o.y = c.y0 - pad;
      else if (m === px) o.x = c.x + Math.sign(o.x - c.x || 1) * (c.hx + pad); else o.z = c.z + Math.sign(o.z - c.z || 1) * (c.hz + pad);
      hit = true;
    }
  }
  return hit;
}
const OBST_CELL = 40, obstGrid = new Map();
let obstGridN = -1;
function obstCells() {
  if (obstGridN === OBST.length) return;
  obstGridN = OBST.length, obstGrid.clear();
  for (const c of OBST) {
    const ex = (c.r || c.hx) + 8, ez = (c.r || c.hz) + 8;
    for (let gx = Math.floor((c.x - ex) / OBST_CELL); gx <= Math.floor((c.x + ex) / OBST_CELL); gx++)
      for (let gz = Math.floor((c.z - ez) / OBST_CELL); gz <= Math.floor((c.z + ez) / OBST_CELL); gz++) {
        const k = gx * 4096 + gz; obstGrid.has(k) || obstGrid.set(k, []); obstGrid.get(k).push(c);
      }
  }
}
function obstInside(x, y, z, pad = 0) {
  obstCells();
  for (const c of obstGrid.get(Math.floor(x / OBST_CELL) * 4096 + Math.floor(z / OBST_CELL)) || []) {
    if (y > c.y1 + pad || y < c.y0 - pad) continue;
    if (c.kind === 'cyl' ? Math.hypot(x - c.x, z - c.z) < c.r + pad : Math.abs(x - c.x) < c.hx + pad && Math.abs(z - c.z) < c.hz + pad) return true;
  }
  return false;
}
const obstacleClear = (x, y, z, pad) => !obstInside(x, y, z, pad) && !(boss && boss.carrier && dnMetal({ x, y, z }));
// enemies look ahead and swerve (and climb) around what's in front of them
function obstAvoid(b) {
  const f = fwdOf(b);
  for (const d of [14 * SPEED_K, 26 * SPEED_K]) {
    const x = b.x + f[0] * d, y = b.y + f[1] * d, z = b.z + f[2] * d;
    let blocked = obstInside(x, y, z, 4) || (boss && boss.carrier && dnMetal({ x, y, z }));
    if (!blocked && themeFlag('asteroids')) for (const r of ROCKS) if (r.mesh.visible && (x - r.x) ** 2 + (y - r.y) ** 2 + (z - r.z) ** 2 < (r.r + 5) ** 2) { blocked = true; break; }
    if (!blocked && isSpace()) for (const T of TORI) if (torusDist(T, { x, y, z }) < 5) { blocked = true; break; }
    if (blocked) return { turn: (b.side || 1) * 1.4, up: true };
  }
  return null;
}
function crashBot(b, why) {
  if (b.dead) return;
  popup(b.x, b.y + 3, b.z, why || 'CRASHED!');
  b.pts = Math.round((b.pts || 100) * 0.5);
  killBot(b);
}
function updateObstacles(dt) {
  if (obstGroup) { const on = Math.floor(time * 2) % 2 === 0; for (const m of obstGroup.children) if (m.userData.blink) m.visible = on; }
  if (!OBST.length || (state !== 'playing' && state !== 'dying' && state !== 'over')) return;
  closeCallT -= dt;
  // skimming terrain at speed without touching it pays out
  if (state === 'playing' && player.alive && closeCallT <= 0 && (player.ve || 1) > .75 && obstInside(player.x, player.y, player.z, 5.5) && !obstInside(player.x, player.y, player.z, 2.2)) {
    const pts = Math.round(120 * lapK()); killPts += pts; closeCallT = 1.4;
    popup(player.x, player.y + 3, player.z, 'CLOSE CALL +' + pts, true); Sound.tone(1250, .08, 'triangle', .05);
  }
  if (state === 'playing' && player.alive && obstPush(player, 1.8)) {
    shieldTime > 0 || (player.ve = Math.max(.45, (player.ve || 1) * .8));
    if (player.invul <= 0) { shieldTime > 0 ? popup(player.x, player.y + 2, player.z, 'SHIELD') : damage(!0, 'CRASH!'); }
    shake = Math.max(shake, 0.25);
    for (let i = 0; i < 6; i++) addPart(player.x, player.y, player.z, rand(-6, 6), rand(-2, 6), rand(-6, 6), 0.5, 0.5, 0x9a8a7a, 0.6);
  }
  for (const b of bots) if (!b.dead && obstInside(b.x, b.y, b.z, 1.5 * (b.scale || 1))) crashBot(b);
  if (boss && !boss.dead && boss.ace) obstPush(boss, 3.5);
  for (const b of bullets) if (b.life > 0 && obstInside(b.x, b.y, b.z, 0)) { b.life = 0; if (Math.random() < 0.3) addPart(b.x, b.y, b.z, rand(-3, 3), rand(0, 4), rand(-3, 3), 0.3, 0.4, 0x9a8a7a, 0.4); }
  for (const m of missiles) if (!m.dead && !m.sure && obstInside(m.x, m.y, m.z, 0)) { explode(m.x, m.y, m.z, 0.7); removeMissile(m); }
  missiles = missiles.filter(m => !m.dead);
  bots = bots.filter(b => !b.dead);
}


function updateCarrierFlow(dt) {
  carrierPhase === "intro" ? (carrierT -= dt, carrierT <= 0 && (carrierPhase = "fight", hideCine(), spawnCarrier())) : carrierPhase === "fight" && boss && boss.carrier && !boss.dead && !dnInside(player) && (supplyT -= dt, supplyT <= 0 && (supplyT = 13, spawnPickup("ammo"), spawnPickup("ammo"), Math.random() < .6 && spawnPickup("missile"), toast("SUPPLY DROP INBOUND")))
}

function startCarrierIntro() {
  carrierPhase = "intro", carrierT = 3.2, $("bossWarn").classList.add("hidden"), bossWarnT = 0;
  let n = 0;
  for (const b of bots) b.dead || (b.dead = !0, explode(b.x, b.y, b.z, 1.1), removeBot(b), n++);
  bots = [];
  for (const t of turrets) t.dead || (t.dead = !0, explode(t.x, t.y, t.z, 1.1), wreckTurret(t), n++);
  boss && (scene.remove(boss.mesh), boss = null), $("bossBar").classList.add("hidden");
  for (const m of missiles) m.enemy && removeMissile(m);
  missiles = missiles.filter(m => !m.dead), bullets = bullets.filter(b => !b.enemy), n && (killPts += n * 100, popup(player.x, player.y + 4, player.z, "SKY CLEARED +" + n * 100, !0)), Object.assign(player, {
    hp: maxHp(),
    ammo: maxAmmo(),
    missiles: Math.min(maxMsl(), Math.max(player.missiles, 6)),
    flares: Math.min(maxFlr(), player.flares + 3),
    invul: 4
  }), shockwave(player.x, player.y, player.z, 110, 16777215, 1), shockwave(player.x, player.y, player.z, 70, 6932735, .8), shake = .5, hitStop(.9, .2), killFlash(), Sound.sfxBoom(), Sound.sfxSiren(), Sound.tone(50, 1.8, "sawtooth", .2, 35), setCine("STAGE " + stage + " &middot; BOSS", "IRON LEVIATHAN", "A 4 KM DREADNOUGHT &mdash; DROP ITS SHIELDS, FLY INSIDE, KILL THE CORE"), showCine(), updateHud(!0)
}

const THEMES = [{
  sky: ["#3a9bff", "#8fd3ff", "#c4ecff"],
  fog: 12905727,
  fogN: 70,
  fogF: 300,
  sea: "#3db6ec",
  seaLine: "#7fd6f7",
  hemi: [16777215, 7317720, 1.45],
  sun: [16774880, 2.2],
  cloud: [16777215, 3820122],
  high: [16777215, 5595242],
  sand: 16769441,
  hills: [7328618, 5816399, 9101931, 5224546],
  trunk: 11036218,
  leaves: [7328618, 5816399, 9101931, 5224546]
}, {
  sky: ["#d9604e", "#f3a863", "#ffe0a8"],
  fog: 16107922,
  fogN: 60,
  fogF: 280,
  sea: "#dcae6c",
  seaLine: "#f0cd92",
  hemi: [16769208, 10119749, 1.3],
  sun: [16761466, 2.5],
  cloud: [16770764, 5913130],
  high: [16767416, 6963248],
  sand: 13867614,
  hills: [12608570, 11096110, 13926474, 12082230],
  trunk: 7049018,
  leaves: [7313978, 8367684, 6261296, 8826956],
  sandstorm: !0
}, {
  sky: ["#02030c", "#070a26", "#141440"],
  fog: 658470,
  fogN: 140,
  fogF: 560,
  sea: "#0a0c26",
  seaLine: "#141440",
  hemi: [12630271, 3156064, 1.2],
  sun: [16773856, 2.3],
  cloud: [15394559, 3813472],
  high: [16777215, 3156048],
  stars: !0,
  asteroids: !0,
  space: !0,
  noIslands: !0,
  noTurrets: !0,
  noHigh: !0
}, {
  sky: ["#030816", "#0b1a3c", "#26396a"],
  fog: 1582666,
  fogN: 60,
  fogF: 280,
  sea: "#1a3868",
  seaLine: "#2f5a92",
  hemi: [9414911, 660520, .75],
  sun: [12374271, 1.15],
  cloud: [6976664, 1054760],
  high: [5595258, 659488],
  sand: 6251636,
  hills: [2902586, 2507318, 3429958, 2771e3],
  trunk: 3811872,
  leaves: [2179119, 2771510, 1849898, 2573876],
  stars: !0,
  lightning: !0
}, {
  // CLOUD SEA: a sunset above an endless cloud floor; the sky serpent's hunting ground
  sky: ["#5a3fc8", "#ff8fbf", "#ffd9a8"],
  fog: 0xffd8e8,
  fogN: 80,
  fogF: 330,
  sea: "#f6ecff",
  seaLine: "#ffffff",
  hemi: [0xfff0ff, 0xb08ad8, 1.4],
  sun: [0xffd2a8, 2.4],
  cloud: [0xffffff, 0x8a6aa0],
  high: [0xfff4fb, 0x7a5a90],
  sand: 0xd8c8f0,
  hills: [0xc8b0e8, 0xb89ad8, 0xd8c0f0, 0xa88ac8],
  trunk: 0x8a6a9a,
  leaves: [0xffc0dc, 0xffb0d0, 0xf8c8e8, 0xffd0e4],
  noIslands: !0,
  noTurrets: !0
}];
let themeNow = -1;
const starDome = (() => {
  const pos = new Float32Array(4200);
  for (let i = 0; i < 1400; i++) {
    const u = Math.random(),
      th = rand(0, Math.PI * 2),
      phi = Math.acos(1 - u * 2);
    pos[i * 3] = Math.sin(phi) * Math.cos(th) * 620, pos[i * 3 + 1] = Math.cos(phi) * 620, pos[i * 3 + 2] = Math.sin(phi) * Math.sin(th) * 620
  }
  const g = new THREE.BufferGeometry;
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color: 16777215,
    size: 2,
    sizeAttenuation: !1,
    fog: !1,
    transparent: !0,
    opacity: .9
  }));
  return p.visible = !1, p.frustumCulled = !1, scene.add(p), p
})();

function paintSky(t) {
  const c = scene.background.image,
    g = c.getContext("2d"),
    gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, t.sky[0]), gr.addColorStop(.45, t.sky[1]), gr.addColorStop(.62, t.sky[2]), gr.addColorStop(1, t.sky[2]), g.fillStyle = gr, g.fillRect(0, 0, c.width, c.height), scene.background.needsUpdate = !0
}

function paintSea(t) {
  const c = seaTex.image,
    g = c.getContext("2d"),
    s2 = c.width;
  g.fillStyle = t.sea, g.fillRect(0, 0, s2, s2), g.strokeStyle = t.seaLine, g.lineWidth = 6, g.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * s2,
      y = Math.random() * s2;
    g.beginPath(), g.moveTo(x, y), g.quadraticCurveTo(x + 14, y - 10, x + 28, y), g.quadraticCurveTo(x + 42, y + 10, x + 56, y), g.stroke()
  }
  seaTex.needsUpdate = !0
}

function recolor(w, fn) {
  const c = new THREE.Color;
  w.list.forEach((d, i) => w.im.setColorAt(i, c.set(fn(d, i)))), w.im.instanceColor && (w.im.instanceColor.needsUpdate = !0)
}

function applyTheme(i) {
  if (i === themeNow) return;
  themeNow = i;
  const t = THEMES[i];
  paintSky(t), paintSea(t), scene.fog.color.set(t.fog), scene.fog.near = t.fogN, scene.fog.far = t.fogF, hemi.color.set(t.hemi[0]), hemi.groundColor.set(t.hemi[1]), hemi.intensity = t.hemi[2], sun.color.set(t.sun[0]), sun.intensity = t.sun[1], WORLD.puffs.material.color.set(t.cloud[0]), WORLD.puffs.material.emissive.set(t.cloud[1]), WORLD.high.material.color.set(t.high[0]), WORLD.high.material.emissive.set(t.high[1]), WORLD.high.visible = !t.noHigh;
  for (const k of ["sand", "hills", "trunks", "leaves"]) WORLD[k].im.visible = !t.noIslands;
  WORLD.posts.visible = WORLD.tops.visible = !t.noIslands, t.noIslands || (recolor(WORLD.sand, () => t.sand), recolor(WORLD.hills, (d, k) => t.hills[k % 4]), recolor(WORLD.trunks, () => t.trunk), recolor(WORLD.leaves, (d, k) => t.leaves[k % 4])), starDome.visible = !!t.stars, setSpace(!!t.space), buildObstacles(i), setAsteroids(!!t.asteroids)
}
const themeFlag = k => themeNow >= 0 && !!THEMES[themeNow][k],
  SPACE = {
    map: 800,
    altMin: -140,
    altMax: 230
  },
  isSpace = () => themeFlag("space"),
  floorY = () => isSpace() ? -1e9 : 0;
let ringBoostT = 0;
const TORI = [];

function buildTori() { TORI.length || withSeed(777, buildToriBody); }
function buildToriBody() {
  if (TORI.length) return;
  const rockM = new THREE.MeshStandardMaterial({
      color: 8023396,
      roughness: 1,
      flatShading: !0
    }),
    metalM = new THREE.MeshStandardMaterial({
      color: 10134708,
      metalness: .6,
      roughness: .35
    }),
    lightM = new THREE.MeshBasicMaterial({
      color: 8385535
    });
  [
    [0, 40, -170],
    [150, 90, 60],
    [-190, -30, 110],
    [250, 150, -220],
    [-260, 120, -150],
    [60, -90, 260],
    [-80, 190, 20],
    [300, -40, 250]
  ].forEach(([x0, y, z0], i) => {
    const x = x0 * 1.8, z = z0 * 1.8, station = i % 2 === 1,
      R = station ? rand(46, 62) : rand(34, 52),
      r = station ? rand(5, 7) : rand(8, 12),
      g = new THREE.TorusGeometry(R, r, station ? 14 : 9, station ? 64 : 26);
    if (!station) {
      const p = g.attributes.position,
        v = new THREE.Vector3,
        seen = new Map;
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        const key = v.x.toFixed(2) + v.y.toFixed(2) + v.z.toFixed(2);
        seen.has(key) || seen.set(key, new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(r * .22)), v.add(seen.get(key)), p.setXYZ(k, v.x, v.y, v.z)
      }
      g.computeVertexNormals()
    }
    const mesh = new THREE.Mesh(g, station ? metalM : rockM);
    if (mesh.position.set(x, y, z), mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), 0), mesh.receiveShadow = !0, mesh.visible = !1, scene.add(mesh), station)
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2,
          l = new THREE.Mesh(G.sphLo, lightM);
        l.position.set(Math.cos(a) * (R - r), Math.sin(a) * (R - r), 0), l.scale.setScalar(1.1), mesh.add(l)
      }
    TORI.push({
      mesh,
      R,
      r,
      station,
      tumble: i === 3 || i === 6 ? rand(.12, .2) : 0,
      spin: station ? rand(.15, .3) : 0,
      side: 0,
      cd: 0,
      inv: new THREE.Quaternion,
      n: new THREE.Vector3
    })
  })
}
const _tv = new THREE.Vector3;

function torusDist(T, o) {
  return _tv.set(o.x, o.y, o.z).sub(T.mesh.position).applyQuaternion(T.inv), Math.hypot(Math.hypot(_tv.x, _tv.y) - T.R, _tv.z) - T.r
}

function setSpace(on) {
  buildTori();
  for (const T of TORI) T.mesh.visible = on;
  sea.visible = !on, WORLD.puffs.visible = !on, MAP = on ? SPACE.map : MAP_BASE, ALT_MIN = on ? SPACE.altMin : 7, ALT_MAX = on ? SPACE.altMax : 70, on || (player.y = clamp(player.y, ALT_MIN, ALT_MAX))
}

function updateSpace(dt) {
  if (ringBoostT = Math.max(0, ringBoostT - dt), starDome.position.copy(camera.position), !!isSpace()) {
    for (const T of TORI) T.tumble && (T.mesh.rotation.x += T.tumble * dt), T.spin && T.mesh.rotateZ(T.spin * dt), T.inv.copy(T.mesh.quaternion).invert(), T.n.set(0, 0, 1).applyQuaternion(T.mesh.quaternion);
    if (!(state !== "playing" && state !== "dying" && state !== "over")) {
      for (const T of TORI) {
        if (state === "playing" && player.alive) {
          const d = torusDist(T, player);
          if (d < 1.6) {
            const gx = torusDist(T, {
                x: player.x + .6,
                y: player.y,
                z: player.z
              }) - torusDist(T, {
                x: player.x - .6,
                y: player.y,
                z: player.z
              }),
              gy = torusDist(T, {
                x: player.x,
                y: player.y + .6,
                z: player.z
              }) - torusDist(T, {
                x: player.x,
                y: player.y - .6,
                z: player.z
              }),
              gz = torusDist(T, {
                x: player.x,
                y: player.y,
                z: player.z + .6
              }) - torusDist(T, {
                x: player.x,
                y: player.y,
                z: player.z - .6
              }),
              gl = Math.hypot(gx, gy, gz) || 1,
              push = 1.6 - d;
            player.x += gx / gl * push, player.y += gy / gl * push, player.z += gz / gl * push, player.invul <= 0 && damage(!0, T.station ? "STATION HULL!" : "ROCK RING!"), shake = Math.max(shake, .25)
          }
          const rx = player.x - T.mesh.position.x,
            ry = player.y - T.mesh.position.y,
            rz = player.z - T.mesh.position.z,
            s2 = rx * T.n.x + ry * T.n.y + rz * T.n.z,
            side = s2 >= 0 ? 1 : -1,
            radial = Math.sqrt(Math.max(0, rx * rx + ry * ry + rz * rz - s2 * s2));
          T.cd -= dt, T.side && side !== T.side && radial < T.R - T.r && T.cd <= 0 && (T.cd = 2, ringBoostT = 1.4, killPts += 250, popup(player.x, player.y + 3, player.z, "RING +250", !0), shockwave(player.x, player.y, player.z, 18, 8385535, .45), Sound.tone(880, .12, "triangle", .08), Sound.tone(1320, .18, "triangle", .08, null, .08), updateHud(!0)), T.side = side
        }
        for (const b of bullets) b.life > 0 && torusDist(T, b) < 0 && (b.life = 0);
        for (const b of bots) !b.dead && torusDist(T, b) < 1 && crashBot(b);
        for (const m of missiles) !m.dead && !m.sure && torusDist(T, m) < 0 && (explode(m.x, m.y, m.z, .7), removeMissile(m))
      }
      missiles = missiles.filter(m => !m.dead)
    }
  }
}
const ROCKS = [],
  rockGeos = [0, 1, 2, 3].map(() => {
    const g = new THREE.IcosahedronGeometry(1, 1),
      p = g.attributes.position,
      v = new THREE.Vector3,
      seen = new Map;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const key = v.x.toFixed(3) + v.y.toFixed(3) + v.z.toFixed(3);
      seen.has(key) || seen.set(key, rand(.78, 1.18)), v.multiplyScalar(seen.get(key)), p.setXYZ(i, v.x, v.y, v.z)
    }
    return g.computeVertexNormals(), g
  }),
  rockMats = [8220776, 6971998, 9075306].map(c => new THREE.MeshStandardMaterial({
    color: c,
    roughness: 1,
    flatShading: !0
  }));

function placeRock(r, far) {
  for (let k = 0; k < 20 && (r.x = rand(-MAP + 25, MAP - 25), r.z = rand(-MAP + 25, MAP - 25), r.y = isSpace() ? rand(ALT_MIN + 15, ALT_MAX - 15) : rand(14, 64), !(!far || Math.hypot(r.x - player.x, r.y - player.y, r.z - player.z) > 45 + r.r)); k++);
}

function setAsteroids(on) { withSeed(4242, () => setAsteroidsBody(on)); }
function setAsteroidsBody(on) {
  if (on && !ROCKS.length)
    for (let i = 0; i < 280; i++) {
      const big = Math.random() < .12,
        huge = i % 35 === 0,
        r = huge ? rand(24, 30) : big ? rand(11, 16) : rand(3, 8.5),
        mesh = new THREE.Mesh(rockGeos[i % 4], rockMats[i % 3]);
      mesh.scale.setScalar(r), mesh.castShadow = !1, mesh.receiveShadow = !0, scene.add(mesh), ROCKS.push({
        r,
        x: 0,
        y: 0,
        z: 0,
        vx: rand(-1.2, 1.2),
        vz: rand(-1.2, 1.2),
        sx: rand(-.3, .3),
        sy: rand(-.3, .3),
        mesh
      })
    }
  for (const r of ROCKS) r.mesh.visible = on, on && (placeRock(r, !0), r.mesh.position.set(r.x, r.y, r.z))
}

function pushOut(o, r, pad) {
  const dx = o.x - r.x,
    dy = o.y - r.y,
    dz = o.z - r.z,
    d = Math.hypot(dx, dy, dz) || 1,
    need = r.r + pad;
  return d >= need ? !1 : (o.x = r.x + dx / d * need, o.y = r.y + dy / d * need, o.z = r.z + dz / d * need, !0)
}

function updateAsteroids(dt) {
  if (themeFlag("asteroids")) {
    for (const r of ROCKS) r.x += r.vx * dt, r.z += r.vz * dt, Math.abs(r.x) > MAP - 20 && (r.vx = -Math.sign(r.x) * Math.abs(r.vx)), Math.abs(r.z) > MAP - 20 && (r.vz = -Math.sign(r.z) * Math.abs(r.vz)), r.mesh.position.set(r.x, r.y, r.z), r.mesh.rotation.x += r.sx * dt, r.mesh.rotation.y += r.sy * dt;
    if (!(state !== "playing" && state !== "dying" && state !== "over")) {
      for (const r of ROCKS) {
        const rr = r.r * r.r;
        if (state === "playing" && player.alive && pushOut(player, r, 1.8)) {
          player.invul <= 0 && damage(!0, "ASTEROID!"), shake = Math.max(shake, .25);
          for (let i = 0; i < 6; i++) addPart(player.x, player.y, player.z, rand(-6, 6), rand(-6, 6), rand(-6, 6), .5, .5, 9075306, .6)
        }
        for (const b of bullets) {
          if (b.life <= 0) continue;
          const dx = b.x - r.x,
            dy = b.y - r.y,
            dz = b.z - r.z;
          dx * dx + dy * dy + dz * dz < rr && (b.life = 0, Math.random() < .4 && addPart(b.x, b.y, b.z, rand(-3, 3), rand(-3, 3), rand(-3, 3), .3, .4, 10127994, .4))
        }
        for (const m of missiles) {
          if (m.dead || m.sure) continue;
          const dx = m.x - r.x,
            dy = m.y - r.y,
            dz = m.z - r.z;
          dx * dx + dy * dy + dz * dz < rr && (explode(m.x, m.y, m.z, .7), removeMissile(m))
        }
        for (const b of bots) !b.dead && (b.x - r.x) ** 2 + (b.y - r.y) ** 2 + (b.z - r.z) ** 2 < (r.r + 1.5 * (b.scale || 1)) ** 2 && crashBot(b);
        boss && !boss.dead && boss.ace && pushOut(boss, r, 3.5)
      }
      missiles = missiles.filter(m => !m.dead)
    }
  }
}
let mines = [];
const mineMat = new THREE.MeshBasicMaterial({
  color: 16726876
});

function dropMine(B) {
  const f = fwdOf(B),
    mesh = new THREE.Mesh(G.sphLo, mineMat);
  mesh.scale.setScalar(1.1), scene.add(mesh), mines.push({
    x: B.x - f[0] * 4,
    y: B.y - f[1] * 4,
    z: B.z - f[2] * 4,
    t: 1.3,
    mesh
  }), Sound.tone(220, .12, "square", .07), Sound.tone(180, .12, "square", .07, null, .15), popup(B.x, B.y + 3, B.z, "SONIC MINE")
}

function clearMines() {
  for (const m of mines) scene.remove(m.mesh);
  mines = []
}

function updateMines(dt) {
  for (const m of mines)
    if (m.t -= dt, m.mesh.position.set(m.x, m.y, m.z), m.mesh.visible = m.t > .5 || Math.floor(m.t * 16) % 2 === 0, !(m.t > 0)) {
      shockwave(m.x, m.y, m.z, 36, 10476799, .75), shockwave(m.x, m.y, m.z, 22, 16777215, .5), Sound.tone(60, 1.1, "sine", .35, 30, .08), Sound.tone(1800, .9, "sine", .05, 900, .08), Sound.noise(.8, .25, 700, .08), shake = Math.max(shake, dist3(m, player) < 40 ? .4 : .15), state === "playing" && dist3(m, player) < 17 && damage(!1, null, "SONIC MINE");
      for (const r of ROCKS) r.mesh.visible && dist3(m, r) < r.r + 12 && (explode(r.x, r.y, r.z, 1.3), placeRock(r, !0));
      scene.remove(m.mesh), m.dead = !0
    } mines = mines.filter(m => !m.dead)
}
const STAGES = [{
    name: "OCEAN ISLES",
    boss: "fortress",
    col: "#62f5ec"
  }, {
    name: "DESERT CANYON",
    boss: "titan",
    col: "#ffb13b",
    hz: "SANDSTORMS"
  }, {
    name: "DEEP SPACE",
    boss: "ace",
    col: "#c9a8ff",
    hz: "NO GROUND, NO CEILING"
  }, {
    name: "NIGHT FRONT",
    boss: "carrier",
    col: "#8fb4ff",
    hz: "LIGHTNING STORM"
  }, {
    name: "CLOUD SEA",
    boss: "serpent",
    col: "#ff9ac2",
    hz: "SERPENT TERRITORY"
  }],
  WAVE_T = [
    [15, 40, 65],
    [90, 110, 130],
    [150, 170, 190],
    [205, 225, 245],
    [265, 285, 305]
  ],
  LAP_T = 70;
let stage = 1,
  wave = 0,
  dirPhase = "none",
  dirT = 0,
  waveKills = 0,
  waveQuota = 0,
  bossSeen = !1,
  lvT = 0,
  dirCine = !1,
  pendingNext = null;
const run = {
  fire: 0,
  dmg: 0,
  hp: 0,
  msl: 0,
  spd: 0,
  cd: 0,
  ammo: 0,
  mag: 0,
  lock: 0,
  flare: 0
};

function resetRun() {
  for (const k of Object.keys(run)) run[k] = 0
}
const STAGE_N = 5,
  stageIdx = () => (stage - 1) % STAGE_N,
  lapN = () => Math.floor((stage - 1) / STAGE_N),
  waveT = w => WAVE_T[stageIdx()][w] + lapN() * LAP_T;

function initDirector(n, toBoss) {
  stage = n, wave = 0, bossSeen = !1, dirCine = !1, toBoss && (tipList = []), applyTheme(stageIdx()), lvT = waveT(toBoss ? 2 : 0), dirPhase = toBoss ? "bossPre" : "intro", dirT = toBoss ? 1.2 : 3.2
}

function directorLabel() {
  if (netLabel) return netLabel;
  const L = "STAGE " + stage;
  return dirPhase === "wave" ? L + " \xB7 " + WAVES[wtype].name + " \xB7 " + WAVES[wtype].label() : dirPhase === "boss" || dirPhase === "bossPre" ? L + " \xB7 BOSS" : dirPhase === "intro" ? L + " \xB7 " + STAGES[stageIdx()].name : dirPhase === "waveClear" || dirPhase === "rest" ? L + " \xB7 WAVE " + wave + " CLEAR" : dirPhase === "stageClear" ? L + " CLEAR" : L
}

function loopBuff(b) {
  lapN() && (b.hp = Math.ceil(b.hp * (1 + .5 * lapN())), b.pts = Math.round(b.pts * (1 + .5 * lapN())))
}

function startWave() {
  wave++, lvT = waveT(wave - 1), waveKills = 0, wv = {}, botSpawnCd = .6, wtype = LINEUP[stageIdx()][wave - 1];
  const goal = WAVES[wtype].start();
  dirPhase = "wave", banner("WAVE " + wave + "/3 \xB7 " + WAVES[wtype].name, goal, STAGES[stageIdx()].col), Sound.tone(440, .15, "square", .06), Sound.tone(660, .2, "square", .06, null, .12)
}

function waveKill(o) {
  if (dirPhase !== "wave") return;
  const w = WAVES[wtype];
  w.kill && w.kill(o)
}

function endWave() {
  const w = WAVES[wtype];
  w && w.end && w.end()
}

function waveCleared(title = "WAVE CLEAR", sub) {
  gainXp(40);
  if (dirPhase === "wave") {
    endWave(), dirPhase = "waveClear", dirT = 1.8;
    for (const b of bots) b.dead || (b.dead = !0, explode(b.x, b.y, b.z, .8), removeBot(b));
    bots = [];
    for (const m of missiles) m.enemy && removeMissile(m);
    missiles = missiles.filter(m => !m.dead), bullets = bullets.filter(b => !b.enemy), player.ammo = Math.min(maxAmmo(), player.ammo + ammoBox()), banner(title, (sub ? sub + " &middot; " : "") + (wave < 3 ? "CHOOSE AN UPGRADE" : "BOSS INCOMING"), "#ffd24a"), Sound.sfxFanfare(!1), updateHud(!0)
  }
}

function startBossFight() {
  dirPhase = "boss", bossSeen = !1, lvT = waveT(2);
  const kind = STAGES[stageIdx()].boss;
  stage <= STAGE_N && reachCheckpoint(stage), kind === "fortress" ? announceBoss() : kind === "titan" ? (titanPhase = "none", titanWarned = !1, startTitanIntro()) : kind === "ace" ? (acePhase = "none", aceWarned = !1, startAceIntro()) : kind === "serpent" ? (serpentPhase = "none", startSerpentIntro()) : (carrierPhase = "none", carrierWarned = !1, startCarrierIntro())
}

// ---- game clear: all 5 stages done ----
let runCleared = !1, clearCount = 0;
function gameClear() {
  runCleared = !0, dirPhase = "cleared", dirT = 6, player.invul = 999;
  for (const b of bots) b.dead || (b.dead = !0, explode(b.x, b.y, b.z, .8), removeBot(b));
  bots = [], bullets = bullets.filter(b => !b.enemy);
  for (const m of missiles) m.enemy && removeMissile(m);
  missiles = missiles.filter(m => !m.dead);
  for (const t of turrets) t.dead || (t.dead = !0, explode(t.x, t.y, t.z, 1), t.mesh.userData.head && wreckTurret(t));
  const hpBonus = player.hp * 1e3, bonus = 5e4 + hpBonus, coins = 1e3;
  killPts += bonus, garage.coins += coins, clearCount++, Store.set("clears", clearCount), saveGarage();
  clearCheckpoint(stage);
  setCine("ALL " + STAGE_N + " STAGES CLEARED", "MISSION COMPLETE", "CLEAR BONUS +" + bonus + " &middot; +" + coins + " COINS");
  showCine(), killFlash(), hitStop(1.2, .2), shake = .4, Sound.sfxFanfare(!0), CG.happytime(), updateHud(!0);
  banner("MISSION COMPLETE", "ALL CLEAR", "#ffd24a");
}
function updateGameClear(dt) {
  player.invul = 999;
  // fireworks over the clouds
  if (Math.random() < dt * 5) {
    const a = rand(0, 6.3), r = rand(25, 70), x = player.x + Math.cos(a) * r + fwdOf(player)[0] * 40, z = player.z + Math.sin(a) * r + fwdOf(player)[2] * 40, y = player.y + rand(10, 30),
      col = [16769354, 16735370, 8385535, 6485484, 16777215][Math.random() * 5 | 0];
    shockwave(x, y, z, rand(12, 22), col, .6);
    for (let i = 0; i < 26; i++) { const u = rand(0, 6.3), w = rand(-1, 1), v = rand(14, 24); addPart(x, y, z, Math.cos(u) * Math.sqrt(1 - w * w) * v, w * v, Math.sin(u) * Math.sqrt(1 - w * w) * v, rand(.8, 1.3), .45, col, 0, 6); }
    Sound.tone(rand(500, 900), .12, "triangle", .05, rand(1200, 1800));
  }
  (dirT -= dt) <= 0 && (hideCine(), dirPhase = "none", ramTime = rollTime = shieldTime = stormTime = cloakTime = 0, CG.gameplayStop(), showOver());
}
function stageCleared() {
  if (stage >= STAGE_N) { gameClear(); return }   // the SKY SERPENT is the last boss: beating it clears the game
  dirPhase = "stageClear", dirT = 2.4;
  for (const b of bots) b.dead || (b.dead = !0, explode(b.x, b.y, b.z, .8), removeBot(b));
  bots = [], stage <= STAGE_N && clearCheckpoint(stage);
  const bonus = 1e3 * stage,
    coins = 40 * stage;
  killPts += bonus, garage.coins += coins, saveGarage(), banner("STAGE " + stage + " CLEAR", "+" + bonus + " PTS \xB7 +" + coins + " COINS", "#ffd24a"), Sound.sfxFanfare(!0), updateHud(!0)
}

function nextStage() {
  gainXp(120);
  stage++, wave = 0, bossSeen = !1, dirCine = !1;
  const f = $("stageFade");
  f.classList.remove("on"), f.offsetWidth, f.classList.add("on"), applyTheme(stageIdx()), resetHazards(), setupTurrets(), Object.assign(player, {
    x: 0,
    y: ALT,
    z: 0,
    a: -Math.PI / 2,
    p: 0,
    roll: 0
  }), snapCamera(), pickups.forEach(removePickup), pickups = [];
  for (let i = 0; i < 6; i++) spawnPickup("ammo");
  spawnPickup("missile"), lvT = waveT(0), Object.assign(player, {
    ammo: Math.max(player.ammo, maxAmmo()),
    invul: 2
  }), dirPhase = "intro", dirT = 3.2, updateHud(!0)
}

function updateDirector(dt) {
  if (dirPhase === "intro") {
    if (!dirCine) {
      dirCine = !0;
      const S = STAGES[stageIdx()];
      setCine("STAGE " + stage + (lapN() ? " &middot; LAP " + (lapN() + 1) : "") + (S.hz ? " &middot; " + S.hz : ""), S.name, lineupText(stageIdx())), showCine(), Sound.tone(330, .5, "triangle", .1, 660)
    }(dirT -= dt) <= 0 && (hideCine(), startWave())
  } else if (dirPhase === "wave") WAVES[wtype].update(dt);
  else if (dirPhase === "waveClear")(dirT -= dt) <= 0 && (wave < 3 ? openUpgrade("WAVE " + wave + " CLEAR", () => {
    dirPhase = "rest", dirT = 1.2
  }) : startBossFight());
  else if (dirPhase === "rest")(dirT -= dt) <= 0 && startWave();
  else if (dirPhase === "bossPre")(dirT -= dt) <= 0 && startBossFight();
  else if (dirPhase === "boss") {
    if (boss && !boss.dead) {
      if (bossSeen = !0, !boss.lapScaled) {
        boss.lapScaled = !0;
        const k = 1 + .6 * lapN();
        if (boss.hp *= k, boss.max *= k, boss.parts)
          for (const t of boss.parts) t.hp *= k
      }
      if (!boss.titan && !boss.ace && !boss.carrier && !boss.serpent && botSpawnCd <= 0 && bots.length < Math.min(3, maxBotsNow())) {
        const b = spawnBot();
        b && loopBuff(b), botSpawnCd = rand(2, 3.5)
      }
    }
    bossSeen && !boss && !duelLock() && bossWarnT <= 0 && stageCleared()
  } else if (dirPhase === "cleared") updateGameClear(dt);
  else dirPhase === "stageClear" && (dirT -= dt) <= 0 && openUpgrade("STAGE " + stage + " CLEAR", nextStage)
}
const UPS = [{
  id: "fire",
  big: "+20%",
  name: "RAPID FIRE",
  desc: "Faster gun fire rate",
  max: 5,
  apply() {
    run.fire++
  }
}, {
  id: "dmg",
  big: "+25%",
  name: "HEAVY ROUNDS",
  desc: "More damage per bullet",
  max: 5,
  apply() {
    run.dmg++
  }
}, {
  id: "hp",
  big: "+1 ARMOR",
  name: "HULL PLATING",
  desc: "+1 armor for this run, and repair one hit",
  max: 3,
  apply() {
    run.hp++, player.hp = Math.min(maxHp(), player.hp + 1)
  }
}, {
  id: "msl",
  big: "+2",
  name: "MISSILE RACK",
  desc: "Missile capacity up, full reload",
  max: 3,
  apply() {
    run.msl++, player.missiles = maxMsl()
  }
}, {
  id: "spd",
  big: "+10%",
  name: "AFTERBURNER",
  desc: "More speed and sharper turns",
  max: 3,
  apply() {
    run.spd++
  }
}, {
  id: "cd",
  big: "-20%",
  name: "QUICK CHARGE",
  desc: "Special ability recharges faster",
  max: 3,
  apply() {
    run.cd++, specialCooldown *= .8
  }
}, {
  id: "ammo",
  big: "+50%",
  name: "AMMO BELT",
  desc: "Bigger ammo capacity, full reload",
  max: 3,
  apply() {
    run.ammo++, player.ammo = maxAmmo()
  }
}, {
  id: "mag",
  big: "PULL",
  name: "MAGNET",
  desc: "Pickups fly to you from far away",
  max: 2,
  apply() {
    run.mag++
  }
}, {
  id: "lock",
  big: "+50%",
  name: "FAST LOCK",
  desc: "Lock-on builds up faster",
  max: 2,
  apply() {
    run.lock++
  }
}, {
  id: "flare",
  big: "+3",
  name: "COUNTERMEASURES",
  desc: "Flare capacity up, full reload",
  max: 3,
  apply() {
    run.flare++, player.flares = maxFlr()
  }
}, {
  id: "repair",
  big: "FULL \u2665",
  name: "FIELD REPAIR",
  desc: "Restore every heart and all armor",
  max: 0,
  apply() {
    player.hp = maxHp()
  },
  avail: () => player.hp < maxHp()
}];

function rollUpgrades(n) {
  const pool = UPS.filter(u => (u.max ? run[u.id] < u.max : !0) && (!u.avail || u.avail()));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const pick = pool.slice(0, n),
    rep = pool.find(u => u.id === "repair");
  return rep && player.hp <= maxHp() / 2 && !pick.includes(rep) && (pick[pick.length - 1] = rep), pick
}

function openUpgrade(title, next) {
  state = "upgrade", clearInput(), hideTip(), CG.gameplayStop();
  for (const id of ["btnPause", "btnFire", "btnAds", "weaponBtns", "btnSpecial", "thrBtns", "flt"]) $(id).classList.add("hidden");
  specialHudKey = "off", $("mslWarn").hidden = !0;
  const picks = rollUpgrades(3);
  $("upTitle").textContent = title, $("upCards").innerHTML = picks.map((u, i) => `<button class="upCard" data-pick="${u.id}"><span class="k">${i+1}</span><strong>${u.big}</strong><b>${u.name}</b><small>${u.desc}</small><em>${u.max?"LV "+run[u.id]+" \u2192 "+(run[u.id]+1)+" / "+u.max:"INSTANT"}</em></button>`).join(""), pendingNext = next, $("upgrade").classList.remove("hidden"), Sound.tone(523, .12, "triangle", .08), Sound.tone(784, .18, "triangle", .08, null, .1)
}

function pickUpgrade(id) {
  if (state !== "upgrade") return;
  const u = UPS.find(u2 => u2.id === id);
  if (!u) return;
  u.apply(), $("upgrade").classList.add("hidden"), state = "playing", setHud(!0), CG.gameplayStart(), updateHud(!0), Sound.sfxRevive(), popup(player.x, player.y + 3, player.z, u.name, !0);
  const n = pendingNext;
  pendingNext = null, n && n()
}
$("upCards").addEventListener("click", e => {
  const b = e.target.closest("[data-pick]");
  b && (e.preventDefault(), Sound.init(), pickUpgrade(b.dataset.pick))
}), $("upgrade").addEventListener("pointerdown", e => e.stopPropagation()), window.addEventListener("keydown", e => {
  if (state !== "upgrade" || e.repeat) return;
  const i = ["Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].indexOf(e.code) % 3;
  if (i < 0) return;
  const b = $("upCards").children[i];
  b && (e.preventDefault(), pickUpgrade(b.dataset.pick))
})/*TEST{*/, $("bossWarp").addEventListener("click", e => {
  const b = e.target.closest("[data-warp]");
  !b || state !== "title" || (e.preventDefault(), Sound.init(), Sound.sfxClick(), startRun(+b.dataset.warp))
}), $("bossWarp").addEventListener("pointerdown", e => e.stopPropagation())/*}TEST*/;
const LINEUP = [
  ["dogfight", "slalom", "strike"],
  ["bombers", "slalom", "survive"],
  ["gates", "bombers", "squadron"],
  ["slalom", "bombers", "survive"],
  ["gates", "squadron", "survive"]
];
let wtype = "dogfight",
  wv = {};
const lapK = () => 1 + .5 * lapN(),
  waveName = t => WAVES[t].name,
  lineupText = i => LINEUP[i].map(waveName).join(" &middot; ") + " &middot; BOSS";

function waveBonus(pts, sub) {
  pts = Math.round(pts * lapK()), killPts += pts, popup(player.x, player.y + 4, player.z, sub ? sub + " +" + pts : "+" + pts, !0, !0)
}
const keepBot = b => b.bomber || b.squad,
  WAVES = {
    dogfight: {
      name: "DOGFIGHT",
      start() {
        return waveQuota = 6 + (wave - 1) * 2 + stageIdx() * 2 + lapN() * 4, "SHOOT DOWN " + waveQuota
      },
      update() {
        if (botSpawnCd <= 0 && bots.length < maxBotsNow() && bots.length + waveKills < waveQuota) {
          const b = spawnBot();
          b && loopBuff(b), botSpawnCd = rand(.9, 1.8) / (1 + lvT / 90)
        }
      },
      kill() {
        ++waveKills >= waveQuota && waveCleared()
      },
      label() {
        return Math.max(0, waveQuota - waveKills) + " LEFT"
      }
    },
    gates: {
      name: "GATE RUN",
      start() {
        const n = 6 + lapN(),
          list = [];
        let px = player.x,
          py = player.y,
          pz = player.z,
          h = player.a;
        for (let k = 0; k < n; k++) {
          let x, y, z, ok = !1;
          for (let t = 0; t < 14 && !ok; t++) {
            const dh = h + rand(-.75, .75),
              d = rand(80, 100);
            if (x = px + Math.cos(dh) * d, z = pz + Math.sin(dh) * d, y = isSpace() ? clamp(py + rand(-35, 35), ALT_MIN + 25, ALT_MAX - 25) : clamp(py + rand(-14, 14), 20, ALT_MAX - 14), Math.abs(x) > MAP - 40 || Math.abs(z) > MAP - 40) {
              h = Math.atan2(-pz, -px);
              continue
            }
            ok = obstacleClear(x, y, z, 14) && (!isSpace() || TORI.every(T => torusDist(T, {
              x,
              y,
              z
            }) > 16)), ok && (h = dh)
          }
          const nx = x - px,
            ny = y - py,
            nz = z - pz,
            nl = Math.hypot(nx, ny, nz) || 1,
            g = {
              x,
              y,
              z,
              n: [nx / nl, ny / nl, nz / nl],
              R: 8.5,
              scale: 3,
              prev: 0,
              mesh: makeGate()
            };
          g.mesh.position.set(x, y, z), g.mesh.lookAt(x + g.n[0], y + g.n[1], z + g.n[2]), g.mesh.visible = !1, scene.add(g.mesh), list.push(g), px = x, py = y, pz = z
        }
        if (isSpace())
          for (const r of ROCKS) list.some(g => dist3(g, r) < r.r + 16) && (placeRock(r, !0), r.mesh.position.set(r.x, r.y, r.z));
        return wv = {
          list,
          i: 0,
          got: 0,
          streak: 0,
          t: 0
        }, armGate(), "FLY THROUGH " + n + " GATES"
      },
      update(dt) {
        if (botSpawnCd <= 0 && bots.length < Math.min(2, maxBotsNow())) {
          const b = spawnBot();
          b && loopBuff(b), botSpawnCd = rand(3, 5)
        }
        const g = wv.list[wv.i];
        if (!g) return;
        wv.t -= dt;
        const rx = player.x - g.x,
          ry = player.y - g.y,
          rz = player.z - g.z,
          s2 = rx * g.n[0] + ry * g.n[1] + rz * g.n[2],
          radial = Math.sqrt(Math.max(0, rx * rx + ry * ry + rz * rz - s2 * s2));
        g.prev < 0 && s2 >= 0 && radial < g.R + 1.2 ? passGate(g) : wv.t <= 0 ? missGate(g) : g.prev = s2, wv.t < 3 && wv.t + dt >= Math.ceil(wv.t) && wv.t > 0 && Sound.tone(880, .06, "square", .05);
        for (const [k, q] of wv.list.entries())
          if (q.mesh.visible) {
            const cur = k === wv.i;
            q.mesh.scale.setScalar(cur ? 1 + Math.sin(time * 6) * .05 : .9), q.mesh.userData.ring.material.color.set(cur ? wv.t < 3 && Math.floor(time * 6) % 2 ? 16735354 : 16765514 : 6485484), q.mesh.userData.disc.material.opacity = cur ? .16 : .05, q.mesh.rotation.z += dt * (cur ? 1.2 : .4)
          }
      },
      end() {
        for (const g of wv.list || []) scene.remove(g.mesh)
      },
      label() {
        return "GATE " + Math.min(wv.i + 1, wv.list.length) + "/" + wv.list.length + " \xB7 " + Math.max(0, Math.ceil(wv.t)) + "s"
      },
      marks() {
        const g = wv.list[wv.i];
        return g ? [{
          o: g,
          cls: "gate",
          lbl: "GATE "
        }] : []
      }
    },
    strike: {
      name: "AA STRIKE",
      start() {
        const n = 4 + (stageIdx() >= 3 ? 1 : 0) + lapN(),
          spots = ISLANDS.filter(o => o.r >= 8 && o.tx !== void 0 && Math.abs(o.tx) < MAP - 15 && Math.abs(o.tz) < MAP - 15).map(o => ({
            o,
            d: Math.hypot(o.tx - player.x, o.tz - player.z)
          })).filter(s2 => s2.d > 55).sort((a, b) => a.d - b.d).slice(0, n + 4);
        for (let i = spots.length - 1; i > 0; i--) {
          const j = Math.random() * (i + 1) | 0;
          [spots[i], spots[j]] = [spots[j], spots[i]]
        }
        const list = [];
        for (const {
            o
          }
          of spots.slice(0, n)) {
          let t = turrets.find(t2 => !t2.dead && !t2.carrier && Math.hypot(t2.x - o.tx, t2.z - o.tz) < 3);
          if (!t) {
            const mesh = makeTurret();
            mesh.position.set(o.tx, o.ty - .4, o.tz), scene.add(mesh), t = {
              x: o.tx,
              y: o.ty + 2,
              z: o.tz,
              cd: rand(1, 3),
              dead: !1,
              mesh,
              scale: 1.2
            }, turrets.push(t)
          }
          Object.assign(t, {
            hp: Math.ceil(8 * lapK()),
            pts: 350,
            strike: !0
          });
          const beam = new THREE.Mesh(G.cyl, beaconMat);
          beam.scale.set(.35, 40, .35), beam.position.y = 20, t.mesh.add(beam), t.beam = beam, list.push(t)
        }
        return wv = {
          list
        }, list.length ? "DESTROY " + list.length + " AA SITES" : (wtype = "dogfight", WAVES.dogfight.start())
      },
      update() {
        if (botSpawnCd <= 0 && bots.length < Math.min(3, maxBotsNow())) {
          const b = spawnBot();
          b && loopBuff(b), botSpawnCd = rand(2.2, 3.8)
        }
        beaconMat.opacity = .28 + Math.sin(time * 5) * .12
      },
      kill(o) {
        if (!o || !o.strike) return;
        o.beam && (o.mesh.remove(o.beam), o.beam = null);
        const left = wv.list.filter(t => !t.dead).length;
        popup(o.x, o.y + 5, o.z, left ? "AA SITE DOWN \xB7 " + left + " LEFT" : "ALL AA SITES DOWN", !0), left || (waveBonus(1200, "STRIKE COMPLETE"), waveCleared("STRIKE COMPLETE"))
      },
      end() {
        for (const t of wv.list || []) t.strike = !1, t.beam && (t.mesh.remove(t.beam), t.beam = null)
      },
      label() {
        return "AA SITES " + wv.list.filter(t => !t.dead).length + " LEFT"
      }
    },
    bombers: {
      name: "BOMBERS",
      start() {
        const n = 3 + (stageIdx() >= 2 ? 1 : 0) + lapN(),
          E = MAP - 30;
        let bestK = null;
        for (let k = 0; k < 10; k++) {
          const th = rand(0, Math.PI * 2),
            dx2 = Math.cos(th),
            dz2 = Math.sin(th),
            ox = player.x + rand(-25, 25),
            oz = player.z + rand(-25, 25),
            lim = (p, d) => d > 0 ? [(-E - p) / d, (E - p) / d] : d < 0 ? [(E - p) / d, (-E - p) / d] : [-1e9, 1e9],
            [a0, a1] = lim(ox, dx2),
            [b02, b1] = lim(oz, dz2),
            t0 = Math.max(a0, b02, -240),
            t1 = Math.min(a1, b1, 260),
            score = Math.min(-t0, t1);
          (!bestK || score > bestK.score) && (bestK = {
            score,
            dx: dx2,
            dz: dz2,
            sx: ox + dx2 * t0,
            sz: oz + dz2 * t0,
            len: t1 - t0
          })
        }
        const {
          dx,
          dz,
          sx,
          sz,
          len
        } = bestK, px = -dz, pz = dx, cy = isSpace() ? clamp(player.y + rand(-25, 25), ALT_MIN + 30, ALT_MAX - 30) : rand(34, 48), list = [];
        for (let i = 0; i < n; i++) {
          const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 15,
            back = Math.ceil(i / 2) * 14,
            x = sx - dx * back + px * side,
            z = sz - dz * back + pz * side,
            b = spawnBot("heavy", {
              x,
              y: cy,
              z
            });
          b && (Object.assign(b, {
            x,
            z,
            y: cy,
            a: Math.atan2(dz, dx),
            bomber: !0,
            hp: Math.ceil(12 * lapK()),
            pts: 500,
            scale: 2.2,
            spd: .55,
            gunCd: rand(1, 2),
            sx: sx + px * side,
            sz: sz + pz * side,
            dx,
            dz,
            len,
            cy,
            trailT: 0
          }), scene.remove(b.mesh), b.mesh = makePlane(3882831, 16757051, "brick", !0), b.mesh.scale.setScalar(1.45 * 2.2), scene.add(b.mesh), orientPlane(b, 0), list.push(b))
        }
        for (let i = 0; i < 2; i++) {
          const e = spawnBot("normal", list[0]);
          e && loopBuff(e)
        }
        return wv = {
          list,
          esc: 0,
          n: list.length
        }, Sound.sfxSiren(), "STOP " + list.length + " BOMBERS BEFORE THEY CROSS"
      },
      update() {
        if (botSpawnCd <= 0 && bots.filter(b => !b.bomber).length < Math.min(2, maxBotsNow())) {
          const b = spawnBot();
          b && loopBuff(b), botSpawnCd = rand(3, 5)
        }
        for (const b of wv.list)
          if (!b.dead && (b.x - b.sx) * b.dx + (b.z - b.sz) * b.dz >= b.len && (b.dead = !0, b.escaped = !0, removeBot(b), wv.esc++, banner("BOMBER GOT THROUGH", heartsLeft() > 1 ? "-1 \u2665" : "LAST HEART SPARED", "#ff5c7a"), heartsLeft() > 1)) {
            player.hp = heartBase();
            const fl = $("dmgFlash");
            fl.classList.remove("hit"), fl.offsetWidth, fl.classList.add("hit"), Sound.sfxHit(), shake = .3, updateHud(!0)
          } bots = bots.filter(b => !b.dead), wv.list.every(b => b.dead) && (wv.esc || waveBonus(2e3, "PERFECT INTERCEPT"), waveCleared(wv.esc ? "INTERCEPT OVER" : "PERFECT INTERCEPT", wv.n - wv.esc + "/" + wv.n + " BOMBERS DOWN"))
      },
      kill(o) {
        if (!o || !o.bomber) return;
        hitStop(.18, .25), shockwave(o.x, o.y, o.z, 16, 16757051, .5);
        const left = wv.list.filter(b => !b.dead).length;
        left && popup(o.x, o.y + 5, o.z, "BOMBER DOWN \xB7 " + left + " LEFT", !0)
      },
      label() {
        return "BOMBERS " + wv.list.filter(b => b.dead && !b.escaped).length + "/" + wv.n + " DOWN" + (wv.esc ? " \xB7 " + wv.esc + " THROUGH" : "")
      },
      marks() {
        return wv.list.filter(b => !b.dead && Math.hypot(b.x - player.x, b.z - player.z) >= 170).map(b => ({
          o: b,
          cls: "bomb",
          lbl: "BOMBER "
        }))
      }
    },
    survive: {
      name: "HOLD OUT",
      start() {
        return wv = {
          t: 30 + (stageIdx() >= 3 ? 5 : 0),
          kills: 0
        }, wv.max = wv.t, botSpawnCd = .3, "SURVIVE " + wv.t + " SECONDS"
      },
      update(dt) {
        if (botSpawnCd <= 0 && bots.length < Math.min(10, maxBotsNow() + 3)) {
          const b = spawnBot();
          b && loopBuff(b), botSpawnCd = rand(.4, .9)
        }
        const before = wv.t;
        wv.t -= dt, wv.t < 5 && Math.ceil(wv.t) !== Math.ceil(before) && Sound.tone(660, .08, "square", .06), wv.t <= 0 && (waveBonus(1500, "SURVIVED"), waveCleared("SURVIVED", wv.kills + " SHOT DOWN"))
      },
      kill() {
        wv.kills++
      },
      label() {
        return "HOLD OUT " + Math.max(0, Math.ceil(wv.t)) + "s"
      }
    },
    squadron: {
      name: "ACE SQUADRON",
      start() {
        const n = 3 + lapN(),
          f = fwdOf(player),
          side = Math.random() < .5 ? -1 : 1,
          at = {
            x: clamp(player.x + f[0] * 130 - f[2] * 50 * side, -MAP + 30, MAP - 30),
            y: clampAlt(player.y + 8),
            z: clamp(player.z + f[2] * 130 + f[0] * 50 * side, -MAP + 30, MAP - 30)
          },
          list = [];
        for (let i = 0; i < n; i++) {
          const b = spawnBot("ace", {
            x: at.x + i * 6,
            y: at.y,
            z: at.z + i * 6
          });
          b && (Object.assign(b, {
            squad: !0,
            hp: Math.ceil(7 * lapK()),
            pts: 700,
            spd: 1.18
          }), scene.remove(b.mesh), b.mesh = makePlane(1842474, 16762941, "falcon", !0), scene.add(b.mesh), orientPlane(b, 0), list.push(b))
        }
        return wv = {
          list
        }, Sound.sfxSiren(), list.length + " ELITES INBOUND"
      },
      update() {
        wv.list.every(b => b.dead) && (waveBonus(1500, "SQUADRON DOWN"), waveCleared("SQUADRON DOWN"))
      },
      kill(o) {
        if (o && o.squad) {
          const left = wv.list.filter(b => !b.dead).length;
          left && popup(o.x, o.y + 5, o.z, "ACE DOWN \xB7 " + left + " LEFT", !0)
        }
      },
      label() {
        return "ACES " + wv.list.filter(b => !b.dead).length + " LEFT"
      }
    }
  },
  beaconMat = new THREE.MeshBasicMaterial({
    color: 16726876,
    transparent: !0,
    opacity: .3,
    depthWrite: !1
  });

function makeGate() {
  const g = new THREE.Group,
    ring2 = new THREE.Mesh(new THREE.TorusGeometry(8.5, .75, 10, 40), new THREE.MeshBasicMaterial({
      color: 16765514
    })),
    disc = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshBasicMaterial({
      color: 16773808,
      transparent: !0,
      opacity: .12,
      side: THREE.DoubleSide,
      depthWrite: !1
    }));
  g.add(ring2, disc);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2,
      l = new THREE.Mesh(G.sphLo, new THREE.MeshBasicMaterial({
        color: 16777215
      }));
    l.position.set(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 0), l.scale.setScalar(1.1), g.add(l)
  }
  return g.userData = {
    ring: ring2,
    disc
  }, g
}

// ================= v8: SLALOM RUN — gates threaded beside rocks and UNDER arches / sea platforms =================
function slalomGates(n) {
  const out = [], used = new Set();
  let px = player.x, pz = player.z, h = player.a, side = Math.random() < .5 ? -1 : 1;
  const nearUnder = o => UNDERS.some(u => Math.hypot(u.x - o.x, u.z - o.z) < 34);
  const cands = [...OBST.filter(o => o.kind === "cyl" && o.y1 > 22 && o.r < 30 && !nearUnder(o)).map(o => ({ o })), ...UNDERS.map(u => ({ u }))];
  for (let tries = 0; out.length < n && tries < n * 4; tries++) {
    let best = null, bs = 1e9;
    for (const c of cands) {
      if (used.has(c)) continue;
      const q = c.o || c.u, dx = q.x - px, dz = q.z - pz, d = Math.hypot(dx, dz);
      if (d < 45 || d > 240 || Math.abs(q.x) > MAP - 30 || Math.abs(q.z) > MAP - 30) continue;
      const sc = d + Math.abs(wrapA(Math.atan2(dz, dx) - h)) * 70 - (c.u ? 45 : 0);
      sc < bs && (bs = sc, best = c);
    }
    if (!best) break;
    used.add(best);
    let x, y, z, nv;
    if (best.u) {   // straight through the gap underneath
      const u = best.u;
      x = u.x, y = u.y, z = u.z;
      nv = u.ax === "x" ? [Math.sign(x - px) || 1, 0, 0] : [0, 0, Math.sign(z - pz) || 1];
    } else {        // hug the rock, alternating sides
      const o = best.o, dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, off = o.r + 9.5;
      x = o.x - uz * off * side, z = o.z + ux * off * side, y = clamp(rand(16, Math.min(o.y1 - 8, ALT_MAX - 12)), 14, ALT_MAX - 12), side = -side;
      if (obstInside(x, y, z, 7) || Math.abs(x) > MAP - 20 || Math.abs(z) > MAP - 20) continue;
      const nx = x - px, nz = z - pz, nl = Math.hypot(nx, nz) || 1;
      nv = [nx / nl, 0, nz / nl];
      let clear = !0;
      for (let t = -24; t <= 24 && clear; t += 3) obstInside(x + nv[0] * t, y, z + nv[2] * t, 2.5) && (clear = !1);
      if (!clear) continue;
    }
    out.push({ x, y, z, n: nv }), px = x + nv[0] * 30, pz = z + nv[2] * 30, h = Math.atan2(nv[2], nv[0]);
  }
  return out;
}
WAVES.slalom = Object.assign({}, WAVES.gates, {
  name: "SLALOM RUN",
  start() {
    const spots = slalomGates(6 + lapN());
    if (spots.length < 4) return wtype = "gates", WAVES.gates.start();
    const list = spots.map(s => {
      const g = { ...s, R: 8.5, scale: 3, prev: 0, mesh: makeGate() };
      return g.mesh.position.set(g.x, g.y, g.z), g.mesh.lookAt(g.x + g.n[0], g.y + g.n[1], g.z + g.n[2]), g.mesh.visible = !1, scene.add(g.mesh), g;
    });
    return wv = { list, i: 0, got: 0, streak: 0, t: 0, slalom: !0 }, armGate(), "SLALOM \xB7 " + list.length + " GATES \xB7 HUG THE ROCKS";
  }
});

function armGate() {
  const g = wv.list[wv.i];
  if (!g) return;
  const from = wv.i ? wv.list[wv.i - 1] : player,
    d = dist3(from, g);
  wv.t = clamp(d / Math.max(10, cruiseSpeed()) * 2.4 + (wv.slalom ? 4 : 3), 6, wv.slalom ? 13 : 11), g.prev = -1;
  for (const [k, q] of wv.list.entries()) q.mesh.visible = k === wv.i || k === wv.i + 1
}

function passGate(g) {
  wv.got++, wv.streak++;
  const pts = Math.round((250 + 50 * wv.streak) * lapK());
  killPts += pts, ringBoostT = 1.4, popup(g.x, g.y + 3, g.z, "GATE " + (wv.i + 1) + "/" + wv.list.length + " +" + pts, !0), shockwave(g.x, g.y, g.z, 16, 16765514, .45), Sound.tone(880 + wv.streak * 60, .12, "triangle", .08), Sound.tone(1320 + wv.streak * 60, .18, "triangle", .08, null, .08), nextGate(g)
}

function missGate(g) {
  wv.streak = 0, popup(player.x, player.y + 3, player.z, "GATE MISSED"), Sound.tone(220, .25, "sawtooth", .07, 110), nextGate(g)
}

function nextGate(g) {
  if (scene.remove(g.mesh), wv.i++, updateHud(!0), wv.i < wv.list.length) {
    armGate();
    return
  }
  const all = wv.got === wv.list.length;
  all && (waveBonus(1500, "PERFECT RUN"), player.ammo = maxAmmo()), waveCleared(all ? "PERFECT RUN" : "GATE RUN OVER", wv.got + "/" + wv.list.length + " GATES")
}

function waveMarks() {
  const w = WAVES[wtype];
  return dirPhase === "wave" && w && w.marks ? w.marks() : []
}

function updateBomber(b, dt, hostile) {
  const gx = b.sx + b.dx * (b.len + 40),
    gz = b.sz + b.dz * (b.len + 40);
  turnToward(b, Math.atan2(gz - b.z, gx - b.x), .6, dt), b.p = lerp(b.p, clamp((b.cy - b.y) * .05, -.2, .2), Math.min(1, dt * 2));
  const bs = botSpeed() * b.spd,
    cp = Math.cos(b.p);
  b.x += Math.cos(b.a) * cp * bs * dt, b.z += Math.sin(b.a) * cp * bs * dt, b.y = clamp(b.y + Math.sin(b.p) * bs * dt, ALT_MIN, ALT_MAX), b.roll = lerp(b.roll, 0, dt * 2), b.gunCd -= dt;
  const f = fwdOf(b),
    dx = player.x - b.x,
    dy = player.y - b.y,
    dz = player.z - b.z,
    d = Math.hypot(dx, dy, dz) || 1;
  if (hostile && player.alive && state === "playing" && d < 58 && (dx * f[0] + dy * f[1] + dz * f[2]) / d < .25 && b.gunCd <= 0 && (fire(b, !0, {
      x: player.x + rand(-2.5, 2.5),
      y: player.y + rand(-1.5, 1.5),
      z: player.z + rand(-2.5, 2.5)
    }), Sound.sfxEnemyShoot(b), b.gunCd = rand(.8, 1.4) / Math.min(1.6, lapK())), b.trailT -= dt, b.trailT <= 0) {
    b.trailT = .07;
    for (const sd of [-1, 1]) addPart(b.x - f[0] * 5 - Math.sin(b.a) * sd * 4, b.y - .5, b.z - f[2] * 5 + Math.cos(b.a) * sd * 4, 0, .6, 0, .8, .7, 14540253, 1)
  }
}
const HZ = {
    sandCd: 12,
    sandT: 0,
    fogK: 0,
    wx: 0,
    wz: 0,
    boltCd: 5,
    bolts: [],
    flash: 0,
    farCd: 4
  },
  boltGeo = new THREE.CylinderGeometry(7, 7, 170, 24, 1, !0),
  boltSeg = new THREE.CylinderGeometry(.5, .5, 1, 6),
  boltMat = new THREE.MeshBasicMaterial({
    color: 15923199,
    fog: !1
  }),
  _up = new THREE.Vector3(0, 1, 0),
  _bv = new THREE.Vector3;

function resetHazards() {
  HZ.sandT = 0, HZ.sandCd = 12, HZ.fogK = 0, HZ.boltCd = 5, HZ.flash = 0, HZ.farCd = 4;
  for (const b of HZ.bolts) scene.remove(b.mesh);
  if (HZ.bolts = [], themeNow >= 0) {
    const t = THEMES[themeNow];
    scene.fog.color.set(t.fog), scene.fog.near = t.fogN, scene.fog.far = t.fogF, hemi.intensity = t.hemi[2]
  }
}
const _fc = new THREE.Color,
  _sandC = new THREE.Color(14264426);

function updateHazards(dt) {
  if (themeNow < 0) return;
  const t = THEMES[themeNow],
    live = state === "playing";
  if (t.sandstorm && live && dirPhase === "wave") {
    if (HZ.sandT > 0) HZ.sandT -= dt;
    else if ((HZ.sandCd -= dt) <= 0) {
      HZ.sandT = 10, HZ.sandCd = rand(20, 28);
      const a = rand(0, Math.PI * 2);
      HZ.wx = Math.cos(a), HZ.wz = Math.sin(a), banner("SANDSTORM", "VISIBILITY DROPPING &middot; TRUST YOUR RADAR", "#ffb13b"), Sound.noise(2.5, .12, 500), Sound.tone(90, 2, "sine", .08, 60)
    }
  } else live ? HZ.sandT = 0 : HZ.sandT = Math.min(HZ.sandT, 0);
  const target = HZ.sandT > 0 ? 1 : 0;
  if (HZ.fogK || target) {
    HZ.fogK = clamp(HZ.fogK + (target ? dt * .7 : -dt * .5), 0, 1);
    const k = HZ.fogK;
    if (scene.fog.near = lerp(t.fogN, 8, k), scene.fog.far = lerp(t.fogF, 95, k), scene.fog.color.copy(_fc.set(t.fog).lerp(_sandC, k)), live && k > .2) {
      player.x += HZ.wx * 5 * k * dt, player.z += HZ.wz * 5 * k * dt;
      for (let i = 0; i < 3; i++) addPart(player.x + rand(-26, 26) - HZ.wx * 20, player.y + rand(-10, 10), player.z + rand(-26, 26) - HZ.wz * 20, HZ.wx * 40, rand(-1, 1), HZ.wz * 40, .8, rand(.2, .45), 14725242)
    }
  }
  if (t.lightning && live && (dirPhase === "wave" || dirPhase === "boss")) {
    if ((HZ.boltCd -= dt) <= 0) {
      HZ.boltCd = dirPhase === "boss" ? rand(6, 9) : rand(3.2, 5.5);
      const f = fwdOf(player),
        lead = playerSpeed() * 1.4,
        spot = Math.random() < .45 ? 0 : rand(8, 22),
        sa = rand(0, Math.PI * 2),
        x = clamp(player.x + f[0] * lead + Math.cos(sa) * spot, -MAP + 10, MAP - 10),
        z = clamp(player.z + f[2] * lead + Math.sin(sa) * spot, -MAP + 10, MAP - 10),
        mesh = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({
          color: 12574975,
          transparent: !0,
          opacity: .08,
          depthWrite: !1,
          side: THREE.DoubleSide
        }));
      mesh.position.set(x, 85, z), scene.add(mesh), HZ.bolts.push({
        x,
        z,
        t: 1.4,
        mesh,
        fired: !1
      }), Sound.tone(1200, 1.3, "sine", .025, 2400)
    }(HZ.farCd -= dt) <= 0 && (HZ.farCd = rand(4, 9), HZ.flash = Math.max(HZ.flash, .45), Sound.noise(1.6, .06, 220, .6));
    for (let i = 0; i < 2; i++) addPart(player.x + rand(-30, 30), player.y + rand(8, 20), player.z + rand(-30, 30), 0, -60, 0, .35, .12, 12572415)
  }
  for (const b of HZ.bolts) b.t -= dt, b.fired ? b.t <= -.18 && (scene.remove(b.mesh), b.dead = !0) : (b.mesh.material.opacity = .08 + (1 - b.t / 1.4) * .3 + (Math.floor(time * 14) % 2 ? .08 : 0), b.t <= 0 && strikeBolt(b));
  HZ.bolts = HZ.bolts.filter(b => !b.dead), HZ.flash > 0 && (HZ.flash = Math.max(0, HZ.flash - dt * 3), hemi.intensity = t.hemi[2] + HZ.flash * 3)
}

function strikeBolt(b) {
  b.fired = !0, scene.remove(b.mesh);
  const g = new THREE.Group;
  let px = b.x + rand(-6, 6),
    py = 170,
    pz = b.z + rand(-6, 6);
  for (let k = 0; k < 9; k++) {
    const ny = k === 8 ? 0 : py - 18.88888888888889,
      nx = k === 8 ? b.x : b.x + rand(-5, 5),
      nz = k === 8 ? b.z : b.z + rand(-5, 5),
      s2 = new THREE.Mesh(boltSeg, boltMat),
      len = Math.hypot(nx - px, ny - py, nz - pz);
    s2.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2), s2.scale.set(1, len, 1), s2.quaternion.setFromUnitVectors(_up, _bv.set(nx - px, ny - py, nz - pz).normalize()), g.add(s2), px = nx, py = ny, pz = nz
  }
  scene.add(g), b.mesh = g, HZ.flash = 1;
  const dh = Math.hypot(player.x - b.x, player.z - b.z);
  shockwave(b.x, clamp(player.y, 1, 60), b.z, 14, 12574975, .4), Sound.noise(.9, .4, 500), Sound.tone(55, 1, "sine", .3, 30), Sound.noise(.15, .25, 4e3), shake = Math.max(shake, dh < 40 ? .45 : .15), state === "playing" && dh < 7.5 && (damage(!1, null, "LIGHTNING"), popup(player.x, player.y + 2, player.z, "LIGHTNING!"));
  if (state === "playing") for (const e of bots) !e.dead && !e.bomber && Math.hypot(e.x - b.x, e.z - b.z) < 7.5 && (popup(e.x, e.y + 3, e.z, "STRUCK!"), killBot(e))
}
const CP_BOSS = {
    1: "SKY FORTRESS",
    2: "OMEGA TITAN",
    3: "FALCON ZERO",
    4: "IRON LEVIATHAN",
    5: "SKY SERPENT"
  },
  checkpoints = {
    5: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0
  };
let runCheckpoint = 0,
  runReached = 0;

function loadCheckpoints(raw) {
  try {
    const c = JSON.parse(raw || "{}");
    for (const k of Object.keys(checkpoints)) Number.isInteger(c[k]) && (checkpoints[k] = clamp(c[k], 0, 2))
  } catch {}
}
const saveCheckpoints = () => Store.set("checkpoints", JSON.stringify(checkpoints));

function reachCheckpoint(n) {
  CP_BOSS[n] && (runReached = Math.max(runReached, n), checkpoints[n] < 1 && (checkpoints[n] = 1, saveCheckpoints()), toast("CHECKPOINT SAVED \xB7 STAGE " + n + " " + CP_BOSS[n]))
}

function clearCheckpoint(n) {
  CP_BOSS[n] && checkpoints[n] < 2 && (checkpoints[n] = 2, saveCheckpoints())
}

function renderCheckpoints() {
  $("cpRow").classList.toggle("hidden", !Object.values(checkpoints).some(v => v > 0));
  for (const n of Object.keys(CP_BOSS)) {
    const b = $("btnCp-" + n);
    b.classList.toggle("hidden", !checkpoints[n]), b.innerHTML = `&#9654; S${n} ${CP_BOSS[n]}${checkpoints[n]>=2?' <span class="cpDone">&#10003;</span>':""}`
  }
}

function grantCheckpointUpgrades(n) {
  const k = 3 * (n - 1) + 2,
    got = [];
  for (let i = 0; i < k; i++) {
    const u = rollUpgrades(3).find(u2 => u2.id !== "repair");
    if (!u) break;
    u.apply(), got.push(u.name)
  }
  Object.assign(player, {
    hp: maxHp(),
    ammo: maxAmmo(),
    missiles: Math.max(player.missiles, Math.min(maxMsl(), 6)),
    flares: Math.max(player.flares, 4)
  }), got.length && toast("CHECKPOINT \xB7 " + got.length + " UPGRADES EQUIPPED")
}
for (const n of Object.keys(CP_BOSS)) onBtn("btnCp-" + n, () => {
  state === "title" && (Sound.sfxClick(), startRun(+n))
});
onBtn("btnRetryCp", () => {
  state !== "over" || busy || (Sound.sfxClick(), startRun(runReached || runCheckpoint))
});
