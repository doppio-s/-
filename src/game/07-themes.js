// ================= v6: stage themes, star dome, asteroid field, sonic mines =================
const THEMES = [
  { sky: ['#3a9bff', '#8fd3ff', '#c4ecff'], fog: 0xc4ecff, fogN: 70, fogF: 300, sea: '#3db6ec', seaLine: '#7fd6f7',
    hemi: [0xffffff, 0x6fa8d8, 1.45], sun: [0xfff6e0, 2.2], cloud: [0xffffff, 0x3a4a5a], high: [0xffffff, 0x55606a],
    sand: 0xffe1a1, hills: [0x6fd36a, 0x58c04f, 0x8ae26b, 0x4fb862], trunk: 0xa8663a, leaves: [0x6fd36a, 0x58c04f, 0x8ae26b, 0x4fb862] },
  { sky: ['#d9604e', '#f3a863', '#ffe0a8'], fog: 0xf5c992, fogN: 60, fogF: 280, sea: '#dcae6c', seaLine: '#f0cd92',
    hemi: [0xffe0b8, 0x9a6a45, 1.3], sun: [0xffc27a, 2.5], cloud: [0xffe6cc, 0x5a3a2a], high: [0xffd9b8, 0x6a4030],
    sand: 0xd39a5e, hills: [0xc0643a, 0xa9502e, 0xd4804a, 0xb85c36], trunk: 0x6b8f3a, leaves: [0x6f9a3a, 0x7fae44, 0x5f8a30, 0x86b04c] },
  { sky: ['#02030c', '#070a26', '#141440'], fog: 0x0a0c26, fogN: 140, fogF: 560, sea: '#0a0c26', seaLine: '#141440',
    hemi: [0xc0b8ff, 0x302860, 1.2], sun: [0xfff2e0, 2.3], cloud: [0xeae6ff, 0x3a3060], high: [0xffffff, 0x302850],
    stars: true, asteroids: true, space: true, noIslands: true, noTurrets: true, noHigh: true },
  { sky: ['#030816', '#0b1a3c', '#26396a'], fog: 0x18264a, fogN: 60, fogF: 280, sea: '#1a3868', seaLine: '#2f5a92',
    hemi: [0x8fa8ff, 0x0a1428, 0.75], sun: [0xbcd0ff, 1.15], cloud: [0x6a7498, 0x101828], high: [0x55607a, 0x0a1020],
    sand: 0x5f6474, hills: [0x2c4a3a, 0x264236, 0x345646, 0x2a4838], trunk: 0x3a2a20, leaves: [0x21402f, 0x2a4a36, 0x1c3a2a, 0x274634], stars: true },
];
let themeNow = -1;
// star dome for the high-altitude and night stages
const starDome = (() => {
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random(), th = rand(0, Math.PI * 2), phi = Math.acos(1 - u * 2);   // whole sky
    pos[i * 3] = Math.sin(phi) * Math.cos(th) * 620; pos[i * 3 + 1] = Math.cos(phi) * 620; pos[i * 3 + 2] = Math.sin(phi) * Math.sin(th) * 620;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
  p.visible = false; p.frustumCulled = false; scene.add(p); return p;
})();
function paintSky(t) {
  const c = scene.background.image, g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, t.sky[0]); gr.addColorStop(0.45, t.sky[1]); gr.addColorStop(0.62, t.sky[2]); gr.addColorStop(1, t.sky[2]);
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height); scene.background.needsUpdate = true;
}
function paintSea(t) {
  const c = seaTex.image, g = c.getContext('2d'), s = c.width;
  g.fillStyle = t.sea; g.fillRect(0, 0, s, s);
  g.strokeStyle = t.seaLine; g.lineWidth = 6; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y - 10, x + 28, y); g.quadraticCurveTo(x + 42, y + 10, x + 56, y); g.stroke();
  }
  seaTex.needsUpdate = true;
}
function recolor(w, fn) {
  const c = new THREE.Color();
  w.list.forEach((d, i) => w.im.setColorAt(i, c.set(fn(d, i))));
  if (w.im.instanceColor) w.im.instanceColor.needsUpdate = true;
}
function applyTheme(i) {
  if (i === themeNow) return;
  themeNow = i;
  const t = THEMES[i];
  paintSky(t); paintSea(t);
  scene.fog.color.set(t.fog); scene.fog.near = t.fogN; scene.fog.far = t.fogF;
  hemi.color.set(t.hemi[0]); hemi.groundColor.set(t.hemi[1]); hemi.intensity = t.hemi[2];
  sun.color.set(t.sun[0]); sun.intensity = t.sun[1];
  WORLD.puffs.material.color.set(t.cloud[0]); WORLD.puffs.material.emissive.set(t.cloud[1]);
  WORLD.high.material.color.set(t.high[0]); WORLD.high.material.emissive.set(t.high[1]);
  WORLD.high.visible = !t.noHigh;
  for (const k of ['sand', 'hills', 'trunks', 'leaves']) WORLD[k].im.visible = !t.noIslands;
  WORLD.posts.visible = WORLD.tops.visible = !t.noIslands;
  if (!t.noIslands) {
    recolor(WORLD.sand, () => t.sand);
    recolor(WORLD.hills, (d, k) => t.hills[k % 4]);
    recolor(WORLD.trunks, () => t.trunk);
    recolor(WORLD.leaves, (d, k) => t.leaves[k % 4]);
  }
  starDome.visible = !!t.stars;
  setSpace(!!t.space);
  setAsteroids(!!t.asteroids);
}
const themeFlag = k => themeNow >= 0 && !!THEMES[themeNow][k];

// ---- deep space (stage 3): a huge 3D volume with donut rings to thread and asteroid walls ----
const SPACE = { map: 440, altMin: -140, altMax: 230 };
const isSpace = () => themeFlag('space');
const floorY = () => isSpace() ? -1e9 : 0;
let ringBoostT = 0;
const TORI = [];
function buildTori() {
  if (TORI.length) return;
  const rockM = new THREE.MeshStandardMaterial({ color: 0x7a6d64, roughness: 1, flatShading: true });
  const metalM = new THREE.MeshStandardMaterial({ color: 0x9aa4b4, metalness: 0.6, roughness: 0.35 });
  const lightM = new THREE.MeshBasicMaterial({ color: 0x7ff3ff });
  const spots = [[0, 40, -170], [150, 90, 60], [-190, -30, 110], [250, 150, -220], [-260, 120, -150], [60, -90, 260], [-80, 190, 20], [300, -40, 250]];
  spots.forEach(([x, y, z], i) => {
    const station = i % 2 === 1, R = station ? rand(46, 62) : rand(34, 52), r = station ? rand(5, 7) : rand(8, 12);
    const g = new THREE.TorusGeometry(R, r, station ? 14 : 9, station ? 64 : 26);
    if (!station) {   // lumpy rock ring
      const p = g.attributes.position, v = new THREE.Vector3(), seen = new Map();
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k); const key = v.x.toFixed(2) + v.y.toFixed(2) + v.z.toFixed(2);
        if (!seen.has(key)) seen.set(key, new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(r * 0.22));
        v.add(seen.get(key)); p.setXYZ(k, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(g, station ? metalM : rockM);
    mesh.position.set(x, y, z); mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), 0);
    mesh.receiveShadow = true; mesh.visible = false; scene.add(mesh);
    if (station) for (let k = 0; k < 16; k++) {   // guide lights on the inner rim
      const a = k / 16 * Math.PI * 2, l = new THREE.Mesh(G.sphLo, lightM);
      l.position.set(Math.cos(a) * (R - r), Math.sin(a) * (R - r), 0); l.scale.setScalar(1.1); mesh.add(l);
    }
    TORI.push({ mesh, R, r, station, tumble: i === 3 || i === 6 ? rand(0.12, 0.2) : 0, spin: station ? rand(0.15, 0.3) : 0, side: 0, cd: 0,
      inv: new THREE.Quaternion(), n: new THREE.Vector3() });
  });
}
const _tv = new THREE.Vector3();
function torusDist(T, o) {
  _tv.set(o.x, o.y, o.z).sub(T.mesh.position).applyQuaternion(T.inv);
  return Math.hypot(Math.hypot(_tv.x, _tv.y) - T.R, _tv.z) - T.r;
}
function setSpace(on) {
  buildTori();
  for (const T of TORI) T.mesh.visible = on;
  sea.visible = !on;
  WORLD.puffs.visible = !on;
  MAP = on ? SPACE.map : 280; ALT_MIN = on ? SPACE.altMin : 7; ALT_MAX = on ? SPACE.altMax : 70;
  if (!on) player.y = clamp(player.y, ALT_MIN, ALT_MAX);
}
function updateSpace(dt) {
  ringBoostT = Math.max(0, ringBoostT - dt);
  starDome.position.copy(camera.position);
  if (!isSpace()) return;
  for (const T of TORI) {
    if (T.tumble) T.mesh.rotation.x += T.tumble * dt;
    if (T.spin) T.mesh.rotateZ(T.spin * dt);
    T.inv.copy(T.mesh.quaternion).invert();
    T.n.set(0, 0, 1).applyQuaternion(T.mesh.quaternion);
  }
  if (state !== 'playing' && state !== 'dying' && state !== 'over') return;
  for (const T of TORI) {
    // hull contact: bounce off the tube
    if (state === 'playing' && player.alive) {
      const d = torusDist(T, player);
      if (d < 1.6) {
        const e = 0.6, gx = torusDist(T, { x: player.x + e, y: player.y, z: player.z }) - torusDist(T, { x: player.x - e, y: player.y, z: player.z });
        const gy = torusDist(T, { x: player.x, y: player.y + e, z: player.z }) - torusDist(T, { x: player.x, y: player.y - e, z: player.z });
        const gz = torusDist(T, { x: player.x, y: player.y, z: player.z + e }) - torusDist(T, { x: player.x, y: player.y, z: player.z - e });
        const gl = Math.hypot(gx, gy, gz) || 1, push = 1.6 - d;
        player.x += gx / gl * push; player.y += gy / gl * push; player.z += gz / gl * push;
        if (player.invul <= 0) { damage(); popup(player.x, player.y + 2, player.z, T.station ? 'STATION HULL!' : 'ROCK RING!'); }
        shake = Math.max(shake, 0.25);
      }
      // thread the ring: bonus points and a short slipstream boost
      const rx = player.x - T.mesh.position.x, ry = player.y - T.mesh.position.y, rz = player.z - T.mesh.position.z;
      const s = rx * T.n.x + ry * T.n.y + rz * T.n.z, side = s >= 0 ? 1 : -1;
      const radial = Math.sqrt(Math.max(0, rx * rx + ry * ry + rz * rz - s * s));
      T.cd -= dt;
      if (T.side && side !== T.side && radial < T.R - T.r && T.cd <= 0) {
        T.cd = 2; ringBoostT = 1.4; killPts += 250;
        popup(player.x, player.y + 3, player.z, 'RING +250', true); shockwave(player.x, player.y, player.z, 18, 0x7ff3ff, 0.45);
        Sound.tone(880, 0.12, 'triangle', 0.08); Sound.tone(1320, 0.18, 'triangle', 0.08, null, 0.08); updateHud(true);
      }
      T.side = side;
    }
    for (const b of bullets) if (b.life > 0 && torusDist(T, b) < 0) b.life = 0;
    for (const m of missiles) if (!m.dead && !m.sure && torusDist(T, m) < 0) { explode(m.x, m.y, m.z, 0.7); removeMissile(m); }
  }
  missiles = missiles.filter(m => !m.dead);
}

// ---- asteroid field (stage 3): obstacles that block shots and hurt on contact ----
const ROCKS = [];
const rockGeos = [0, 1, 2, 3].map(() => {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, v = new THREE.Vector3(), seen = new Map();
  for (let i = 0; i < p.count; i++) {   // lumpy but watertight: same jitter for shared vertices
    v.fromBufferAttribute(p, i); const key = v.x.toFixed(3) + v.y.toFixed(3) + v.z.toFixed(3);
    if (!seen.has(key)) seen.set(key, rand(0.78, 1.18));
    v.multiplyScalar(seen.get(key)); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
});
const rockMats = [0x7d7068, 0x6a625e, 0x8a7a6a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
function placeRock(r, far) {
  for (let k = 0; k < 20; k++) {
    r.x = rand(-MAP + 25, MAP - 25); r.z = rand(-MAP + 25, MAP - 25); r.y = isSpace() ? rand(ALT_MIN + 15, ALT_MAX - 15) : rand(14, 64);
    if (!far || Math.hypot(r.x - player.x, r.y - player.y, r.z - player.z) > 45 + r.r) break;
  }
}
function setAsteroids(on) {
  if (on && !ROCKS.length) {
    for (let i = 0; i < 140; i++) {
      const big = Math.random() < 0.12, huge = i % 35 === 0, r = huge ? rand(24, 30) : big ? rand(11, 16) : rand(3, 8.5);
      const mesh = new THREE.Mesh(rockGeos[i % 4], rockMats[i % 3]);
      mesh.scale.setScalar(r); mesh.castShadow = false; mesh.receiveShadow = true; scene.add(mesh);
      ROCKS.push({ r, x: 0, y: 0, z: 0, vx: rand(-1.2, 1.2), vz: rand(-1.2, 1.2), sx: rand(-0.3, 0.3), sy: rand(-0.3, 0.3), mesh });
    }
  }
  for (const r of ROCKS) {
    r.mesh.visible = on;
    if (on) { placeRock(r, true); r.mesh.position.set(r.x, r.y, r.z); }
  }
}
function pushOut(o, r, pad) {   // move o to the rock's surface; returns true if it was inside
  const dx = o.x - r.x, dy = o.y - r.y, dz = o.z - r.z, d = Math.hypot(dx, dy, dz) || 1, need = r.r + pad;
  if (d >= need) return false;
  o.x = r.x + dx / d * need; o.y = r.y + dy / d * need; o.z = r.z + dz / d * need; return true;
}
function updateAsteroids(dt) {
  if (!themeFlag('asteroids')) return;
  for (const r of ROCKS) {
    r.x += r.vx * dt; r.z += r.vz * dt;
    if (Math.abs(r.x) > MAP - 20) r.vx = -Math.sign(r.x) * Math.abs(r.vx);
    if (Math.abs(r.z) > MAP - 20) r.vz = -Math.sign(r.z) * Math.abs(r.vz);
    r.mesh.position.set(r.x, r.y, r.z); r.mesh.rotation.x += r.sx * dt; r.mesh.rotation.y += r.sy * dt;
  }
  if (state !== 'playing' && state !== 'dying' && state !== 'over') return;
  for (const r of ROCKS) {
    const rr = r.r * r.r;
    if (state === 'playing' && player.alive && pushOut(player, r, 1.8)) {
      if (player.invul <= 0) { damage(); popup(player.x, player.y + 2, player.z, 'ASTEROID!'); }
      shake = Math.max(shake, 0.25);
      for (let i = 0; i < 6; i++) addPart(player.x, player.y, player.z, rand(-6, 6), rand(-6, 6), rand(-6, 6), 0.5, 0.5, 0x8a7a6a, 0.6);
    }
    for (const b of bullets) {
      if (b.life <= 0) continue;
      const dx = b.x - r.x, dy = b.y - r.y, dz = b.z - r.z;
      if (dx * dx + dy * dy + dz * dz < rr) { b.life = 0; if (Math.random() < 0.4) addPart(b.x, b.y, b.z, rand(-3, 3), rand(-3, 3), rand(-3, 3), 0.3, 0.4, 0x9a8a7a, 0.4); }
    }
    for (const m of missiles) {
      if (m.dead || m.sure) continue;   // locked missiles thread the gaps: a guaranteed hit stays guaranteed
      const dx = m.x - r.x, dy = m.y - r.y, dz = m.z - r.z;
      if (dx * dx + dy * dy + dz * dz < rr) { explode(m.x, m.y, m.z, 0.7); removeMissile(m); }
    }
    for (const b of bots) if (!b.dead) pushOut(b, r, 2.5 * (b.scale || 1));
    if (boss && !boss.dead && boss.ace) pushOut(boss, r, 3.5);
  }
  missiles = missiles.filter(m => !m.dead);
}

// ---- sonic mines: dropped by FALCON ZERO when you sit on its tail ----
let mines = [];
const mineMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c });
function dropMine(B) {
  const f = fwdOf(B), mesh = new THREE.Mesh(G.sphLo, mineMat);
  mesh.scale.setScalar(1.1); scene.add(mesh);
  mines.push({ x: B.x - f[0] * 4, y: B.y - f[1] * 4, z: B.z - f[2] * 4, t: 1.3, mesh });
  Sound.tone(220, 0.12, 'square', 0.07); Sound.tone(180, 0.12, 'square', 0.07, null, 0.15);
  popup(B.x, B.y + 3, B.z, 'SONIC MINE');
}
function clearMines() { for (const m of mines) scene.remove(m.mesh); mines = []; }
function updateMines(dt) {
  for (const m of mines) {
    m.t -= dt;
    m.mesh.position.set(m.x, m.y, m.z);
    m.mesh.visible = m.t > 0.5 || Math.floor(m.t * 16) % 2 === 0;
    if (m.t > 0) continue;
    // the charge: a beat of silence, then a ringing blast wave
    shockwave(m.x, m.y, m.z, 36, 0x9fdcff, 0.75); shockwave(m.x, m.y, m.z, 22, 0xffffff, 0.5);
    Sound.tone(60, 1.1, 'sine', 0.35, 30, 0.08); Sound.tone(1800, 0.9, 'sine', 0.05, 900, 0.08); Sound.noise(0.8, 0.25, 700, 0.08);
    shake = Math.max(shake, dist3(m, player) < 40 ? 0.4 : 0.15);
    if (state === 'playing' && dist3(m, player) < 17) damage();
    for (const r of ROCKS) if (r.mesh.visible && dist3(m, r) < r.r + 12) { explode(r.x, r.y, r.z, 1.3); placeRock(r, true); }
    scene.remove(m.mesh); m.dead = true;
  }
  mines = mines.filter(m => !m.dead);
}
