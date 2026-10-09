// Furniture: materials, parametric builders and the add-item catalog.
// Every builder returns a Group with origin at the floor centre of its footprint, front facing +Z,
// sized by p.w (x), p.d (z), p.h (y) in metres.
import * as THREE from 'three';
import { Kit, roundRect, arcBand, archShape, archFrame } from './kit.js';
import { MAT } from './materials.js';
import { rng } from './util.js';

const FM = {};
export const FURN_MAT = FM;
const tintCache = new Map();
export function tint(base, hex) {
  if (hex == null) return base;
  const key = base.uuid + '|' + hex;
  let m = tintCache.get(key);
  if (!m) { m = base.clone(); m.color = new THREE.Color(hex); m.userData = { ...base.userData }; tintCache.set(key, m); }
  return m;
}

function C(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function T(c, rep = true) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
// fast per-pixel noise helpers (thousands of fillRect calls are slow on some canvases)
function noiseCanvas(W, H, fn) {
  const [c, x] = C(W, H), im = x.createImageData(W, H), d = im.data;
  for (let y = 0, i = 0; y < H; y++) for (let xx = 0; xx < W; xx++, i += 4) { const v = fn(xx, y); d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  return [c, x];
}
function weaveTex() {
  const r = rng(301), out = [0, 0, 0];
  const [c] = noiseCanvas(256, 256, (x, y) => { const v = 238 + (r() - 0.5) * 16 - (y % 2 ? 0 : 5) - (x % 3 === 0 ? 3 : 0); out[0] = out[1] = out[2] = v; return out; });
  return T(c);
}
function tuftTex() {
  const S = 256, [c, x] = C(S); x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
  const n = 4, s = S / n;
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) {
    const cx = i * s + (j % 2 ? s / 2 : 0), cy = j * s / 2 * 1.0 + s / 4;
    const g = x.createRadialGradient(cx, cy, 2, cx, cy, s * 0.62);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.75, 'rgba(225,225,225,1)'); g.addColorStop(1, 'rgba(170,170,170,1)');
    x.fillStyle = g; x.beginPath(); x.moveTo(cx, cy - s / 2); x.lineTo(cx + s / 2, cy); x.lineTo(cx, cy + s / 2); x.lineTo(cx - s / 2, cy); x.closePath(); x.fill();
  }
  x.strokeStyle = 'rgba(110,110,110,0.55)'; x.lineWidth = 1.6;
  for (let k = -n; k <= 2 * n; k++) { x.beginPath(); x.moveTo(k * s / 2, 0); x.lineTo(k * s / 2 + S, S); x.stroke(); x.beginPath(); x.moveTo(k * s / 2, 0); x.lineTo(k * s / 2 - S, S); x.stroke(); }
  x.fillStyle = 'rgba(60,60,60,0.8)';
  for (let j = 0; j <= 2 * n; j++) for (let i = 0; i <= n; i++) { x.beginPath(); x.arc(i * s + (j % 2 ? s / 2 : 0), j * s / 2, 3, 0, 7); x.fill(); }
  return T(c);
}
// white shell with a fine staggered perforation (photo 4's terrace chairs)
function perfTex() {
  const [c, x] = C(128); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(96,98,100,0.85)';
  const n = 8, s = 128 / n;
  for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) { x.beginPath(); x.arc(i * s + (j % 2 ? s / 2 : 0), j * s + s / 2, s * 0.22, 0, 7); x.fill(); }
  return T(c);
}
function quiltTex() {
  const [c, x] = C(256); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(80,80,80,0.5)'; x.lineWidth = 2;
  const s = 64;
  for (let j = -1; j <= 4; j++) for (let i = -1; i <= 4; i++) { x.beginPath(); x.arc(i * s + (j % 2 ? s / 2 : 0), j * s * 0.86, s * 0.62, 0, 7); x.stroke(); }
  return T(c);
}
function channelTex(n = 8) {
  const [c, x] = C(256, 64); const w = 256 / n;
  for (let i = 0; i < n; i++) { const g = x.createLinearGradient(i * w, 0, (i + 1) * w, 0); g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.2, '#f4f4f4'); g.addColorStop(0.7, '#e6e6e6'); g.addColorStop(1, '#a6a6a6'); x.fillStyle = g; x.fillRect(i * w, 0, w, 64); }
  return T(c);
}
function rugTex(kind) {
  const r = rng(kind === 'pink' ? 411 : kind === 'sheep' ? 421 : 401), out = [0, 0, 0];
  if (kind === 'pink' || kind === 'sheep') {
    const base = kind === 'pink' ? [233, 185, 195] : [243, 239, 231], amp = kind === 'pink' ? 34 : 26;
    const col = new Float32Array(256).map(() => r() - 0.5);
    const [c] = noiseCanvas(256, 256, (x, y) => { const k = (r() - 0.5) * 0.7 + col[(x + ((y / 3) | 0)) & 255] * 0.6; out[0] = base[0] + k * amp; out[1] = base[1] + k * amp * 0.9; out[2] = base[2] + k * amp * 0.9; return out; });
    return T(c);
  }
  const bands = []; for (let i = 0; i < 90; i++) bands.push([r() * 512, 2 + r() * 12, (r() - 0.5) * 70]);
  const row = new Float32Array(512);
  for (const [y0, hgt, k] of bands) for (let y = Math.floor(y0); y < Math.min(512, y0 + hgt); y++) row[y] += k;
  const [c, x] = noiseCanvas(512, 512, (xx, y) => {
    const streak = Math.sin((xx * 0.021 + y * 0.004)) * 6 + (r() - 0.5) * 26 + row[y] * (0.6 + 0.4 * Math.sin(xx * 0.013 + y * 0.002));
    out[0] = 205 + streak; out[1] = 195 + streak * 0.95; out[2] = 180 + streak * 0.9; return out;
  });
  x.strokeStyle = 'rgba(150,138,122,0.8)'; x.lineWidth = 10; x.strokeRect(5, 5, 502, 502);
  return T(c, false);
}
function mosaicTex() {
  const W = 256, H = 384; const [c, x] = C(W, H); const r = rng(431);
  const [f, fx] = C(W, H);
  fx.fillStyle = '#000'; fx.fillRect(0, 0, W, H);
  const blob = (cx, cy, rx, ry, a) => { fx.save(); fx.translate(cx, cy); fx.rotate(a); const g = fx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); fx.scale(1, ry / rx); fx.fillStyle = g; fx.beginPath(); fx.arc(0, 0, rx, 0, 7); fx.fill(); fx.restore(); };
  for (let i = 0; i < 26; i++) { const t = i / 26; blob(60 + Math.sin(t * 5) * 70 + t * 80, 40 + t * 300, 30 + r() * 40, 10 + r() * 20, -0.8 + r() * 0.6); }
  const d = fx.getImageData(0, 0, W, H).data, s = 6;
  x.fillStyle = '#16161a'; x.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += s) for (let xx = 0; xx < W; xx += s) {
    const v = d[((y + 3) * W + xx + 3) * 4] / 255, j = r() * 0.25;
    const t = Math.min(1, v + j * v);
    const col = t > 0.75 ? [236, 230, 218] : t > 0.45 ? [188, 170, 146] : t > 0.2 ? [104, 92, 80] : [26 + r() * 20, 26 + r() * 18, 30 + r() * 18];
    x.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; x.fillRect(xx + 0.5, y + 0.5, s - 1, s - 1);
  }
  return T(c, false);
}
function neonTex(text) {
  const [c, x] = C(512, 256); x.clearRect(0, 0, 512, 256);
  x.font = 'italic 600 120px "Brush Script MT", "Segoe Script", cursive';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = '#ff4fd8'; x.shadowBlur = 18; x.fillStyle = '#ffd2f6';
  for (let i = 0; i < 2; i++) x.fillText(text, 256, 132);
  const t = T(c, false); return t;
}
function artTex(seed) {
  const [c, x] = C(256, 320); const r = rng(seed);
  x.fillStyle = '#efe9df'; x.fillRect(0, 0, 256, 320);
  const pal = ['#b8862f', '#2c3e50', '#c9b8a3', '#7d5a44', '#1f1f1f', '#d9c7a8'];
  for (let i = 0; i < 7; i++) { x.fillStyle = pal[(r() * pal.length) | 0]; x.globalAlpha = 0.75; x.beginPath(); x.arc(r() * 256, r() * 320, 20 + r() * 90, 0, 7); x.fill(); }
  x.globalAlpha = 1; return T(c, false);
}

export function buildFurnitureMaterials() {
  const std = (n, p, s = 1) => { const m = new THREE.MeshStandardMaterial(p); m.name = n; m.userData.s = s; FM[n] = m; return m; };
  const vel = (n, p, s = 1) => { const m = new THREE.MeshPhysicalMaterial({ roughness: 0.82, sheen: 1, sheenRoughness: 0.45, ...p }); m.name = n; m.userData.s = s; FM[n] = m; return m; };
  const weave = weaveTex();
  vel('tufted', { color: 0xcdbfaa, map: tuftTex(), sheenColor: new THREE.Color(0xfff2e0) }, 0.62);
  vel('velvetBlue', { color: 0x1c4a73, map: quiltTex(), sheenColor: new THREE.Color(0x8ab8e8) }, 0.42);
  vel('velvetTaupe', { color: 0x8c7c6a, map: weave, sheenColor: new THREE.Color(0xd8c8b4) }, 0.3);
  vel('velvetBeige', { color: 0xdccfbd, map: channelTex(8), sheenColor: new THREE.Color(0xffffff) }, 0.22);
  vel('velvetPink', { color: 0xe7b6c1, map: weave, sheenColor: new THREE.Color(0xffe6ee) }, 0.3);
  vel('velvetChannel', { color: 0x9a8f84, map: channelTex(10), sheenColor: new THREE.Color(0xe8dccf) }, 0.5);
  std('fabricWhite', { color: 0xebe8e2, map: weave, roughness: 0.95 }, 0.3);
  std('canvas', { color: 0xebe8e2, map: weave, roughness: 0.95, side: THREE.DoubleSide, emissive: 0x7c7872, emissiveMap: weave }, 0.3);   // parasol canopies: light shows through from below
  std('fabricGray', { color: 0x9b968f, map: weave, roughness: 0.95 }, 0.3);
  std('fabricLinen', { color: 0xdad5cc, map: weave, roughness: 0.95 }, 0.3);
  std('leatherBlack', { color: 0x1c1c1d, roughness: 0.42 });
  std('lacquerTaupe', { color: 0xa39b90, roughness: 0.45 });
  std('lacquerGray', { color: 0xd8d6d1, roughness: 0.5 });
  std('grayGloss', { color: 0x8f8b85, roughness: 0.14 });
  std('ceramic', { color: 0xf7f7f5, roughness: 0.12 });
  std('plasticWhite', { color: 0xf3f3f1, roughness: 0.32 });
  std('perfWhite', { color: 0xf6f6f4, map: perfTex(), roughness: 0.35, side: THREE.DoubleSide }, 0.11);
  std('plasticGray', { color: 0x9aa09f, roughness: 0.5 });
  std('aluWhite', { color: 0xf0eee9, roughness: 0.38, metalness: 0.2 });
  std('teak', { map: MAT.walnut.map, color: 0xe2c49a, roughness: 0.6 }, 0.8);
  std('teakPale', { color: 0xcfc3b0, roughness: 0.75 });   // weathered, whitewashed slats (photo 7)
  std('stoneTop', { color: 0xe6e0d4, roughness: 0.55 });
  std('glassAqua', { color: 0x63cdbd, transparent: true, opacity: 0.62, roughness: 0.04, metalness: 0.1 });
  std('glassSmoke', { color: 0x2a2d30, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.2 });
  std('glassClear', { color: 0xe6f2f2, transparent: true, opacity: 0.28, roughness: 0.03, metalness: 0.1 });
  std('shade', { color: 0xf3eee4, emissive: 0xfff0d4, emissiveIntensity: 0.4, roughness: 0.9, side: THREE.DoubleSide });
  std('amber', { color: 0xf1c27a, emissive: 0xffae42, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 });
  std('bulb', { color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 2.0 });
  std('rugBeige', { map: rugTex('beige'), roughness: 1 });
  std('rugPink', { map: rugTex('pink'), roughness: 1 });
  std('sheep', { map: rugTex('sheep'), roughness: 1 });
  std('mosaic', { map: mosaicTex(), roughness: 0.6 });
  const nt = neonTex('Heaven');
  std('neon', { map: nt, emissive: 0xff4fd8, emissiveMap: nt, emissiveIntensity: 2.2, transparent: true, depthWrite: false });
  FM.neon.userData.noShadow = true;
  std('art1', { map: artTex(441), roughness: 0.9 });
  std('art2', { map: artTex(457), roughness: 0.9 });
  std('toyRed', { color: 0xd8564f, roughness: 0.5 });
  std('toyYellow', { color: 0xf0c64a, roughness: 0.5 });
  std('toyBlue', { color: 0x4a8fd8, roughness: 0.5 });
  std('candle', { color: 0x3b3835, roughness: 0.6 });
  std('flame', { color: 0xffd28a, emissive: 0xffb45a, emissiveIntensity: 2.5 });
  for (const k of ['glassAqua', 'glassSmoke', 'glassClear']) FM[k].userData.noShadow = true;
  return FM;
}

// ---------------------------------------------------------------- builders
const B = {};
const M = () => MAT;   // architecture materials (walnut, brass, marble...)

B.sofaTufted = (p) => {
  const k = new Kit(), f = tint(FM.tufted, p.color), { w, d, h } = p;
  k.box(M().brass, w - 0.02, 0.05, d - 0.06, 0, 0, 0.02);
  k.rbox(f, w - 0.12, 0.3, d - 0.1, 0.04, 0, 0.05, 0.03);
  k.rbox(f, w - 0.5, 0.12, d - 0.34, 0.05, 0, 0.35, 0.12);
  k.rbox(f, w, h - 0.05, 0.25, 0.07, 0, 0.05, -d / 2 + 0.125);
  for (const s of [-1, 1]) k.rbox(f, 0.24, 0.6, d, 0.07, s * (w / 2 - 0.12), 0.05, 0);
  return k.build();
};
B.sofa = (p) => {
  const k = new Kit(), f = tint(FM.velvetTaupe, p.color), { w, d, h } = p;
  const arm = 0.18, n = p.seats || Math.max(1, Math.round((w - 2 * arm) / 0.8)), cw = (w - 2 * arm) / n;
  k.box(M().brass, w - 0.08, 0.06, d - 0.08, 0, 0, 0);
  k.rbox(f, w, 0.34, d, 0.03, 0, 0.06, 0);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + arm + cw * (i + 0.5);
    k.rbox(f, cw - 0.02, 0.14, d - 0.3, 0.05, x, 0.4, 0.12);
    k.rbox(f, cw - 0.04, h - 0.42, 0.22, 0.07, x, 0.42, -d / 2 + 0.2, { rx: -0.12 });
  }
  for (const s of [-1, 1]) k.rbox(f, arm, h - 0.2, d, 0.04, s * (w / 2 - arm / 2), 0.06, 0);
  k.rbox(f, w - 2 * arm, h - 0.06 - 0.06, 0.16, 0.03, 0, 0.06, -d / 2 + 0.08);
  return k.build();
};
B.armchair = (p) => B.sofa({ ...p, seats: 1 });
B.barrelChair = (p) => {
  const k = new Kit(), f = tint(FM.velvetBlue, p.color), { w, h } = p, r = w / 2;
  k.cyl(M().brass, r * 0.7, r * 0.72, 0.03, 0, 0, 0, { seg: 40 });
  k.cyl(f, r * 0.96, r * 0.9, 0.34, 0, 0.03, 0, { seg: 40 });
  k.cyl(f, r * 0.82, r * 0.82, 0.12, 0, 0.36, 0.02, { seg: 40 });
  const gap = 1.9, a0 = -Math.PI / 2 + gap / 2, a1 = -Math.PI / 2 + Math.PI * 2 - gap / 2;
  k.ext(f, arcBand(r * 0.74, r, a0, a1, 40), h - 0.37, 0, 0.37, 0, { flat: true, bevel: 0.02 });
  return k.build();
};
B.coffeeTableRect = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.box(M().blackGlass, w * 0.92, 0.08, d * 0.92, 0, 0, 0);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box(M().steelBlack, 0.04, h - 0.11, 0.04, sx * (w / 2 - 0.05), 0.08, sz * (d / 2 - 0.05));
  k.box(FM.glassSmoke, w, 0.02, d, 0, h - 0.03, 0);
  k.box(M().steelBlack, w, 0.03, d, 0, h - 0.045, 0, {});
  k.box(M().walnutGloss, w * 0.8, 0.02, d * 0.8, 0, h * 0.45, 0);
  k.lathe(FM.glassClear, [[0, 0], [0.09, 0.01], [0.11, 0.08], [0.06, 0.16], [0.05, 0.2], [0, 0.2]], w * 0.18, h, -d * 0.1);
  return k.build();
};
B.coffeeTableRound = (p) => {
  const k = new Kit(), { w, h } = p, r = w / 2;
  k.cyl(M().blackGlass, r, r, 0.03, 0, h - 0.03, 0, { seg: 48 });
  for (let i = 0; i < 3; i++) k.box(M().steelBlack, r * 1.4, h - 0.03, 0.025, 0, 0, 0, { ry: i * Math.PI / 3 });
  return k.build();
};
B.sideTable = (p) => {
  const k = new Kit(), { w, h } = p, r = w / 2;
  k.cyl(M().blackGlass, r, r, 0.025, 0, h - 0.025, 0, { seg: 40 });
  k.cyl(M().brass, 0.015, 0.015, h - 0.03, 0, 0.02, 0);
  k.cyl(M().brass, r * 0.6, r * 0.62, 0.02, 0, 0, 0, { seg: 32 });
  return k.build();
};
B.benchBrass = (p) => {
  const k = new Kit(), f = tint(FM.velvetBeige, p.color), { w, d, h } = p, br = M().brass;
  k.rbox(f, w - 0.04, 0.11, d - 0.04, 0.04, 0, h - 0.11, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(br, 0.02, h - 0.09, 0.02, sx * (w / 2 - 0.01), 0, sz * (d / 2 - 0.01));
  for (const y of [0.05, h - 0.12]) for (const sz of [-1, 1]) k.box(br, w, 0.02, 0.02, 0, y, sz * (d / 2 - 0.01));
  for (const y of [0.05, h - 0.12]) for (const sx of [-1, 1]) k.box(br, 0.02, 0.02, d, sx * (w / 2 - 0.01), y, 0);
  return k.build();
};
B.rug = (p) => {
  const k = new Kit(), mat = p.style === 'pink' ? FM.rugPink : p.style === 'sheep' ? FM.sheep : tint(FM.rugBeige, p.color);
  if (p.round) k.cyl(mat, p.w / 2, p.w / 2, p.h, 0, 0, 0, { seg: 48 });
  else if (p.style === 'sheep') {
    const s = new THREE.Shape(), r = rng(7);
    for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2, rr = 0.85 + r() * 0.2 + 0.1 * Math.sin(a * 3); const x = Math.cos(a) * p.w / 2 * rr, y = Math.sin(a) * p.d / 2 * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); }
    k.ext(mat, s, p.h, 0, 0, 0, { flat: true });
  } else k.box(mat, p.w, p.h, p.d, 0, 0, 0);
  const g = k.build();
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return g;
};
B.palmLamp = (p) => {
  const k = new Kit(), br = M().brass, { w, h } = p;
  const top = h - 0.22, R = w / 2;
  k.cyl(br, Math.min(0.16, R * 0.5), Math.min(0.18, R * 0.55), 0.03, 0, 0, 0);
  k.cyl(br, 0.018, 0.03, top - 0.03, 0, 0.03, 0);
  const r = rng(5);
  for (let i = 0; i < 9; i++) {
    // leaves radiate from the top of the stem; tilt > 0 points the tip upward
    const a = (i / 9) * Math.PI * 2 + r() * 0.3, tilt = -0.35 + r() * 0.9, L = R * (0.82 + r() * 0.18);
    const cx = Math.cos(a) * Math.cos(tilt) * L / 2, cz = Math.sin(a) * Math.cos(tilt) * L / 2, cy = top + Math.sin(tilt) * L / 2;
    k.sph(br, L / 2, cx, cy, cz, { s: [1, 0.06, 0.34], ry: -a, rz: tilt, seg: 16, segH: 10 });
  }
  k.sph(br, 0.03, 0, top, 0);
  return k.build();
};
B.diningTable = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.ext(M().walnutGloss, roundRect(w, d, Math.min(0.35, d / 2)), 0.05, 0, h - 0.05, 0, { flat: true });
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.45);
    k.box(M().walnut, 0.09, h - 0.05, d * 0.5, x, 0, 0);
    k.box(M().walnut, 0.14, 0.05, d * 0.72, x, 0, 0);
    k.box(M().brass, 0.15, 0.012, d * 0.73, x, 0.05, 0);
  }
  k.box(M().walnut, w - 0.95, 0.06, 0.08, 0, h - 0.22, 0);
  k.lathe(FM.glassClear, [[0, 0], [0.12, 0.01], [0.16, 0.07], [0.1, 0.14], [0, 0.14]], 0, h, 0);
  return k.build();
};
B.diningChair = (p) => {
  const k = new Kit(), f = tint(FM.velvetBeige, p.color), { w, d, h } = p, wal = M().walnut, br = M().brass;
  const sh = 0.45;
  k.rbox(f, w - 0.04, 0.1, d - 0.08, 0.04, 0, sh - 0.06, 0.02);
  const r = w / 2;
  k.ext(f, arcBand(r - 0.05, r, Math.PI * 0.08, Math.PI * 0.92, 24), h - sh + 0.02, 0, sh - 0.02, 0.05, { flat: true, bevel: 0.015 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.leg(wal, sx * (w / 2 - 0.07), sz * (d / 2 - 0.08), sh - 0.08, 0.012, 0.02, { ax: sz * 0.12, az: -sx * 0.08 });
    k.cyl(br, 0.013, 0.013, 0.05, sx * (w / 2 - 0.07) + sx * 0.0, 0, sz * (d / 2 - 0.08));
  }
  return k.build();
};
B.chandelier = (p) => {
  const k = new Kit(), { w, d, h } = p, br = M().brass;
  k.cyl(br, 0.09, 0.09, 0.03, 0, h - 0.03, 0);
  const yb = 0.18;
  for (const sx of [-1, 1]) k.cyl(br, 0.006, 0.006, h - yb - 0.03, sx * w * 0.25, yb, 0, { seg: 8 });
  k.box(br, w * 0.75, 0.02, 0.02, 0, yb, 0);
  const r = rng(9);
  for (let i = 0; i < 18; i++) {
    const x = (r() - 0.5) * w * 0.9, z = (r() - 0.5) * d * 0.9, y = yb - 0.05 + r() * 0.2;
    k.sph(FM.amber, 0.13, x, y, z, { s: [1, 0.12, 0.35], ry: r() * 3, rz: (r() - 0.5) * 0.8, seg: 12, segH: 8 });
    k.cyl(br, 0.004, 0.004, Math.abs(y - yb) + 0.02, x * 0.5, Math.min(y, yb), z * 0.5, { seg: 6, rz: (x > 0 ? -1 : 1) * 0.4 });
  }
  return k.build();
};
B.sideboard = (p) => {
  const k = new Kit(), { w, d, h } = p, lh = 0.18;
  k.box(M().walnutGloss, w, h - lh, d, 0, lh, 0);
  const n = Math.max(2, Math.round(w / 0.55));
  for (let i = 1; i < n; i++) k.box(M().steelBlack, 0.006, h - lh - 0.04, 0.004, -w / 2 + (w * i) / n, lh + 0.02, d / 2);
  k.box(M().brass, w * 0.9, 0.012, 0.01, 0, h - 0.08, d / 2 + 0.002);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(M().brass, 0.03, lh, 0.03, sx * (w / 2 - 0.12), 0, sz * (d / 2 - 0.06));
  k.lathe(FM.glassClear, [[0, 0], [0.05, 0.01], [0.06, 0.12], [0.04, 0.3], [0, 0.3]], w * 0.3, h, 0);
  k.cyl(M().brass, 0.11, 0.11, 0.015, -w * 0.25, h, 0); k.cyl(M().brass, 0.008, 0.008, 0.25, -w * 0.25, h, 0); k.cyl(M().brass, 0.08, 0.08, 0.012, -w * 0.25, h + 0.14, 0);
  return k.build();
};
B.tripodLamp = (p) => {
  const k = new Kit(), { h } = p, br = M().brass, top = h - 0.42;
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3, R = 0.24;
    const foot = [Math.cos(a) * R, 0, Math.sin(a) * R], tp = [0, top, 0];
    k.tube(br, [foot, [foot[0] * 0.5, top * 0.5, foot[2] * 0.5], tp], 0.011, { seg: 8 });
  }
  k.cyl(br, 0.011, 0.011, 0.14, 0, top, 0);
  k.cyl(FM.shade, 0.23, 0.23, 0.3, 0, top + 0.1, 0, { open: true, seg: 32 });
  k.cyl(FM.bulb, 0.04, 0.04, 0.05, 0, top + 0.15, 0, { seg: 12 });
  return k.build();
};
B.displayShelf = (p) => {
  const k = new Kit(), { w, d, h } = p, st = M().steelBlack, n = p.shelves || 5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(st, 0.025, h, 0.025, sx * (w / 2 - 0.0125), 0, sz * (d / 2 - 0.0125));
  if (p.divider) k.box(st, 0.025, h, 0.025, 0, 0, d / 2 - 0.0125);
  const r = rng(13);
  for (let i = 0; i <= n; i++) {
    const y = 0.08 + i * (h - 0.12) / n;
    k.box(i === 0 || i === n ? st : FM.glassSmoke, w, 0.012, d, 0, y, 0);
    for (const sz of [-1, 1]) k.box(st, w, 0.025, 0.025, 0, y - 0.013, sz * (d / 2 - 0.0125));
    if (i < n && i > 0) {
      for (let j = 0; j < 2; j++) {
        const x = (r() - 0.5) * (w - 0.3), kind = r();
        const mat = kind < 0.33 ? M().brass : kind < 0.66 ? FM.ceramic : FM.glassClear;
        const hh = 0.08 + r() * 0.16;
        k.lathe(mat, [[0, 0], [0.04 + r() * 0.03, 0.005], [0.05 + r() * 0.03, hh * 0.5], [0.025, hh], [0, hh]], x, y + 0.012, 0);
      }
    }
  }
  return k.build();
};
B.barCounter = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.box(M().walnut, w - 0.06, 0.08, d - 0.12, 0, 0, -0.03);
  k.box(M().walnutSlats, w - 0.02, h - 0.12, d - 0.06, 0, 0.08, 0);
  k.box(M().led, w - 0.1, 0.015, 0.012, 0, h - 0.07, d / 2 - 0.02);
  k.box(M().marbleBlack, w + 0.04, 0.04, d + 0.08, 0, h - 0.04, 0.03);
  return k.build();
};
B.barStool = (p) => {
  const k = new Kit(), f = tint(FM.velvetTaupe, p.color), { w, h } = p, br = M().brass, sh = h * 0.68;
  k.cyl(br, w * 0.42, w * 0.44, 0.015, 0, 0, 0, { seg: 32 });
  k.cyl(br, 0.022, 0.022, sh - 0.06, 0, 0.015, 0);
  k.tor(br, w * 0.36, 0.009, 0, sh * 0.42, 0);
  k.rbox(f, w, 0.09, w * 0.92, 0.04, 0, sh - 0.06, 0.02);
  const r = w / 2;
  k.ext(f, arcBand(r - 0.05, r, Math.PI * 0.12, Math.PI * 0.88, 20), h - sh + 0.02, 0, sh - 0.02, 0.04, { flat: true, bevel: 0.012 });
  return k.build();
};
B.console = (p) => {
  const k = new Kit(), { w, d, h } = p, st = M().steelBlack;
  k.box(M().walnut, w, 0.06, d, 0, h - 0.06, 0);
  for (const sx of [-1, 1]) { k.box(st, 0.025, h - 0.06, 0.025, sx * (w / 2 - 0.05), 0, d / 2 - 0.05); k.box(st, 0.025, h - 0.06, 0.025, sx * (w / 2 - 0.05), 0, -d / 2 + 0.05); k.box(st, 0.025, 0.025, d - 0.1, sx * (w / 2 - 0.05), 0.12, 0); }
  k.box(st, w - 0.1, 0.025, 0.025, 0, 0.12, d / 2 - 0.05);
  for (let i = 0; i < 4; i++) { const x = -w / 2 + 0.2 + i * (w - 0.4) / 3; const ch = 0.08 + (i % 2) * 0.05; k.cyl(FM.candle, 0.045, 0.045, ch, x, h, 0); k.cyl(FM.flame, 0.006, 0.006, 0.02, x, h + ch, 0, { seg: 6 }); }
  return k.build();
};
B.toiletWall = (p) => {
  const k = new Kit(), { w, d } = p, ce = FM.ceramic;
  k.box(ce, w * 0.9, 0.32, 0.12, 0, 0.22, -d / 2 + 0.06);
  k.sph(ce, 0.2, 0, 0.36, 0.0, { s: [w / 0.42, 0.5, 1.25] });
  k.rbox(ce, w * 0.92, 0.04, d * 0.78, 0.02, 0, 0.42, 0.02);
  k.box(M().stainless, 0.24, 0.16, 0.012, 0, 0.98, -d / 2 + 0.006);
  return k.build();
};
B.vanityGlass = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.box(M().walnut, w, 0.12, d, 0, h - 0.12, 0);
  const sx = p.sinks === 2 ? [-w / 4, w / 4] : [w * 0.18];
  for (const x of sx) {
    k.lathe(FM.glassAqua, [[0, 0], [0.16, 0.0], [0.2, 0.03], [0.21, 0.13], [0.19, 0.13], [0.18, 0.05], [0, 0.04]], x, h, 0.02, { seg: 40 });
    k.cyl(M().brass, 0.016, 0.016, 0.24, x + 0.0, h, -d / 2 + 0.07);
    k.cyl(M().brass, 0.01, 0.01, 0.14, x, h + 0.22, -d / 2 + 0.07, { rx: Math.PI / 2 });
  }
  k.cyl(FM.ceramic, 0.035, 0.035, 0.16, -w * 0.3, h, -0.05); k.cyl(M().steelBlack, 0.03, 0.03, 0.12, -w * 0.22, h, 0.0);
  return k.build();
};
B.mirrorLED = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.box(M().led, w + 0.04, h + 0.04, 0.01, 0, -0.02, -d / 2 + 0.005);
  k.box(M().mirror, w, h, 0.02, 0, 0, -d / 2 + 0.02);
  return k.build();
};
B.sconce = (p) => {
  const k = new Kit(), { h } = p, br = M().brass;
  k.box(br, 0.08, h, 0.02, 0, 0, -0.04);
  for (let i = 0; i < 7; i++) { const x = -0.035 + i * 0.012, hh = h * (0.55 + 0.45 * Math.sin((i / 6) * Math.PI)); k.cyl(br, 0.006, 0.006, hh, x, (h - hh) / 2, 0); }
  k.cyl(M().led, 0.012, 0.012, h * 0.5, 0, h * 0.25, 0.012, { seg: 8 });
  return k.build();
};
B.kitchenBase = (p) => {
  const k = new Kit(), { w, d, h } = p, body = tint(FM.lacquerGray, p.color);
  k.box(M().steelBlack, w - 0.02, 0.1, d - 0.08, 0, 0, -0.04);
  k.box(body, w, h - 0.14, d - 0.02, 0, 0.1, -0.01);
  k.box(M().steelBlack, w, 0.025, 0.02, 0, h - 0.07, d / 2 - 0.02);
  const n = Math.max(1, Math.round(w / 0.6));
  for (let i = 1; i < n; i++) k.box(M().steelBlack, 0.005, h - 0.18, 0.004, -w / 2 + (w * i) / n, 0.1, d / 2 - 0.01);
  k.box(M().quartz, w, 0.04, d, 0, h - 0.04, 0);
  if (p.sink != null) {
    const x = (p.sink - 0.5) * w;
    k.box(M().stainless, 0.62, 0.008, 0.44, x, h + 0.001, 0.02);
    k.box(M().steelBlack, 0.56, 0.009, 0.38, x, h + 0.002, 0.02);
    k.cyl(M().stainless, 0.02, 0.025, 0.3, x, h, -d / 2 + 0.08);
    k.tube(M().stainless, [[x, h + 0.3, -d / 2 + 0.08], [x, h + 0.42, -d / 2 + 0.12], [x, h + 0.36, -d / 2 + 0.26]], 0.012, { seg: 12 });
  }
  if (p.hob != null) {
    const x = (p.hob - 0.5) * w;
    k.box(M().blackGlass, 0.76, 0.012, 0.5, x, h + 0.001, 0.02);
    for (const [hx, hz, r] of [[-0.22, -0.1, 0.07], [-0.22, 0.13, 0.055], [0.0, 0.02, 0.09], [0.22, -0.1, 0.055], [0.22, 0.13, 0.07]]) k.tor(M().stainless, r, 0.012, x + hx, h + 0.02, 0.02 + hz);
  }
  return k.build();
};
B.kitchenWall = (p) => {
  const k = new Kit(), { w, d, h } = p, body = M().walnutGloss;
  k.box(body, w, h, d, 0, 0, 0);
  const n = Math.max(1, Math.round(w / 0.6));
  for (let i = 1; i < n; i++) k.box(M().steelBlack, 0.005, h - 0.02, 0.004, -w / 2 + (w * i) / n, 0.01, d / 2);
  k.box(M().led, w - 0.06, 0.012, 0.03, 0, -0.012, d / 2 - 0.06);
  if (p.hood != null) { const x = (p.hood - 0.5) * w; k.box(M().stainless, 0.7, 0.06, 0.48, x, -0.06, 0.06); }
  return k.build();
};
B.fridgeTall = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.box(M().walnutGloss, w, h, d - 0.04, 0, 0, -0.02);
  const fw = w - 0.06, fh = Math.min(1.8, h - 0.4);
  k.box(M().stainless, fw / 2 - 0.005, fh * 0.72, 0.04, -fw / 4, fh * 0.28 + 0.06, d / 2 - 0.01);
  k.box(M().stainless, fw / 2 - 0.005, fh * 0.72, 0.04, fw / 4, fh * 0.28 + 0.06, d / 2 - 0.01);
  k.box(M().stainless, fw, fh * 0.26, 0.04, 0, 0.05, d / 2 - 0.01);
  for (const s of [-1, 1]) k.cyl(M().stainless, 0.012, 0.012, 0.7, s * 0.04, fh * 0.45, d / 2 + 0.03);
  k.box(M().blackGlass, 0.18, 0.28, 0.01, -fw / 4, fh * 0.6, d / 2 + 0.012);
  return k.build();
};
B.ovenTower = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.box(M().blackGlass, w, h, d - 0.02, 0, 0, -0.01);
  k.box(M().stainless, w - 0.06, 0.6, 0.02, 0, 0.82, d / 2 - 0.01);
  k.box(M().blackGlass, w - 0.16, 0.36, 0.01, 0, 0.9, d / 2 + 0.005);
  k.cyl(M().stainless, 0.01, 0.01, w - 0.2, (w - 0.2) / 2, 1.36, d / 2 + 0.03, { rz: Math.PI / 2 });
  k.box(M().stainless, w - 0.06, 0.38, 0.02, 0, 1.5, d / 2 - 0.01);
  k.box(M().blackGlass, w - 0.24, 0.26, 0.01, -0.04, 1.55, d / 2 + 0.005);
  return k.build();
};
B.breakfastBar = (p) => {
  const k = new Kit(), { w, d, h } = p, wh = tint(FM.plasticWhite, p.color);
  k.ext(M().quartz, roundRect(w, d, d / 2 - 0.01), 0.05, 0, h - 0.05, 0, { flat: true });
  k.box(wh, w - d, h - 0.05, d * 0.42, 0, 0, -d * 0.25);
  k.box(wh, 0.05, h - 0.05, d - 0.06, w / 2 - d * 0.5, 0, 0);
  return k.build();
};
B.stoolWhite = (p) => {
  const k = new Kit(), { w, h } = p, st = M().steelBlack, sh = h - 0.12;
  k.lathe(FM.plasticWhite, [[0, 0], [w * 0.36, 0.0], [w * 0.47, 0.05], [w * 0.5, 0.12], [w * 0.47, 0.12], [w * 0.42, 0.06], [0, 0.04]], 0, sh, 0, { seg: 32 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, r = w * 0.36; k.tube(st, [[Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r * 0.75, sh * 0.5, Math.sin(a) * r * 0.75], [Math.cos(a) * r * 0.45, sh, Math.sin(a) * r * 0.45]], 0.011, { seg: 8 }); }
  k.tor(st, w * 0.32, 0.008, 0, sh * 0.32, 0);
  return k.build();
};
B.highChair = (p) => {
  const k = new Kit(), { w, d, h } = p, g = FM.plasticGray;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.leg(M().steelBlack, sx * (w / 2 - 0.04), sz * (d / 2 - 0.04), h * 0.62, 0.012, 0.012, { ax: sz * 0.15, az: -sx * 0.12 });
  k.rbox(g, w * 0.7, 0.06, d * 0.55, 0.02, 0, h * 0.58, 0);
  k.rbox(g, w * 0.7, h * 0.4, 0.05, 0.02, 0, h * 0.6, -d * 0.25, { rx: -0.15 });
  k.rbox(FM.plasticWhite, w * 0.8, 0.04, d * 0.35, 0.02, 0, h * 0.78, d * 0.3);
  return k.build();
};
B.wardrobe = (p) => {
  const k = new Kit(), { w, d, h } = p, body = tint(FM.lacquerTaupe, p.color);
  k.box(body, w, h, d, 0, 0, 0);
  const n = Math.max(1, Math.round(w / 0.9)), dw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    if (p.mirror && i === n - 1) k.box(M().mirror, dw - 0.06, h - 0.12, 0.01, x, 0.06, d / 2 + 0.005);
    else {
      const sh = archShape(dw - 0.12, h - 0.3);
      k.ext(M().fluted, sh, 0.012, x, 0.12, d / 2, {});
    }
    k.box(M().steelBlack, 0.012, 0.5, 0.015, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), h * 0.42, d / 2 + 0.01);
    if (i > 0) k.box(M().steelBlack, 0.004, h - 0.04, 0.004, -w / 2 + dw * i, 0.02, d / 2 + 0.002);
  }
  return k.build();
};
B.bedNiche = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.ext(FM.lacquerGray, archFrame(w, h, w - 0.36, h - 0.25), d, 0, 0, -d / 2, {});
  k.box(FM.velvetChannel, w - 0.38, h - 0.3, 0.06, 0, 0, -d / 2 + 0.01);
  const ng = new THREE.PlaneGeometry(0.62, 0.31); ng.translate(0, 1.75, -d / 2 + 0.08);
  k.put(FM.neon, ng);
  k.box(M().led, w - 0.4, 0.01, 0.02, 0, h - 0.27, -d / 2 + 0.07);
  return k.build();
};
B.bedPlatform = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.rbox(tint(FM.velvetChannel, p.color), w, h * 0.6, d, 0.04, 0, 0, 0);
  k.rbox(FM.fabricLinen, w - 0.1, h * 0.4, d - 0.12, 0.06, 0, h * 0.6, 0.02);
  return k.build();
};
B.deskCurved = (p) => {
  const k = new Kit(), { w, d, h } = p, g = tint(FM.grayGloss, p.color);
  k.ext(g, roundRect(w, d, d * 0.45), 0.035, 0, h - 0.035, 0, { flat: true });
  k.box(g, 0.035, h - 0.035, d - 0.1, w / 2 - 0.25, 0, 0);
  k.box(g, w * 0.55, 0.12, 0.02, -w * 0.12, h - 0.16, d / 2 - 0.06);
  return k.build();
};
B.shelvesOpen = (p) => {
  const k = new Kit(), { w, d, h } = p, g = tint(FM.lacquerTaupe, p.color), n = p.shelves || 5;
  for (const sx of [-1, 1]) k.box(g, 0.025, h, d, sx * (w / 2 - 0.0125), 0, 0);
  k.box(g, w, h, 0.012, 0, 0, -d / 2 + 0.006);
  const r = rng(21), toys = [FM.toyRed, FM.toyYellow, FM.toyBlue, FM.velvetPink];
  for (let i = 0; i <= n; i++) {
    const y = i * (h - 0.025) / n; k.box(g, w - 0.05, 0.025, d, 0, y, 0);
    if (i < n && r() < 0.8) { const m = toys[(r() * toys.length) | 0]; k.rbox(m, 0.08 + r() * 0.1, 0.08 + r() * 0.12, 0.08 + r() * 0.06, 0.02, (r() - 0.5) * (w - 0.2), y + 0.025, 0); }
  }
  return k.build();
};
B.pouf = (p) => {
  const k = new Kit(), { w, h } = p, f = tint(FM.velvetPink, p.color);
  k.lathe(f, [[0, 0], [w / 2 - 0.02, 0], [w / 2, 0.03], [w / 2, h - 0.04], [w / 2 - 0.03, h], [0, h]], 0, 0, 0, { seg: 40 });
  return k.build();
};
B.hollywoodMirror = (p) => {
  const k = new Kit(), { w, d, h } = p, mh = h - 0.1, r = w / 2, rc = r - 0.025, yc = 0.1 + mh - r;
  k.box(FM.lacquerGray, w, 0.1, d, 0, 0, 0);
  k.ext(M().mirror, archShape(w - 0.08, mh - 0.04), 0.01, 0, 0.1, -d / 2 + 0.06, {});
  k.ext(FM.plasticWhite, archFrame(w, mh, w - 0.08, mh - 0.04, true), 0.05, 0, 0.1, -d / 2 + 0.04, {});
  // bulbs follow the frame: up one side, over the arch, down the other
  const side = Math.max(0, yc - 0.3), arc = Math.PI * rc, total = 2 * side + arc, n = Math.max(8, Math.round(total / 0.13));
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * total; let x, y;
    if (s < side) { x = -rc; y = 0.3 + s; }
    else if (s < side + arc) { const a = Math.PI - ((s - side) / arc) * Math.PI; x = Math.cos(a) * rc; y = yc + Math.sin(a) * rc; }
    else { x = rc; y = 0.3 + (total - s); }
    k.sph(FM.bulb, 0.02, x, y, -d / 2 + 0.11, { seg: 10, segH: 8 });
  }
  return k.build();
};
B.mosaicArt = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.box(M().steelBlack, w, h, 0.03, 0, 0, -d / 2 + 0.015);
  const g = new THREE.PlaneGeometry(w - 0.06, h - 0.06); g.translate(0, h / 2, -d / 2 + 0.032);
  k.put(FM.mosaic, g);
  return k.build();
};
B.roundMirrors = (p) => {
  const k = new Kit(), { w, h } = p;
  const set = [[-0.3, 0.75, 0.2], [0.05, 0.95, 0.14], [0.22, 0.6, 0.12], [-0.05, 0.35, 0.17], [0.3, 0.2, 0.1]];
  for (const [x, y, r] of set) {
    const sx = x * w / 0.8, sy = y * h, rr = r * Math.min(w / 0.8, h);
    k.cyl(M().steelBlack, rr, rr, 0.025, sx, sy, -0.0, { rx: Math.PI / 2, seg: 36 });
    k.cyl(M().mirror, rr - 0.015, rr - 0.015, 0.03, sx, sy, 0.0, { rx: Math.PI / 2, seg: 36 });
  }
  return k.build();
};
export function setCurtainOpacity(o) {
  const m = B._curtainMat; if (!m || Math.abs(m.opacity - o) < 1e-3) return false;
  m.opacity = o; m.needsUpdate = true; return true;
}
B.curtain = (p) => {
  const k = new Kit(), { w, h } = p, nx = Math.max(8, Math.round(w * 14));
  const g = new THREE.PlaneGeometry(w, h - 0.04, nx, 1), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * Math.PI * 2 / 0.16) * 0.035);
  g.computeVertexNormals(); g.translate(0, (h - 0.04) / 2, 0);
  const m = p._mat || (B._curtainMat || (B._curtainMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.95, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })));
  m.userData.noShadow = true;
  k.put(m, g);
  k.box(M().steelBlack, w, 0.025, 0.04, 0, h - 0.03, 0);
  return k.build();
};
// round stone-topped table on a flared stone pedestal (photo 4)
B.outdoorTable = (p) => {
  const k = new Kit(), { w, h } = p, r = w / 2;
  k.cyl(FM.stoneTop, r, r, 0.04, 0, h - 0.04, 0, { seg: 56 });
  k.cyl(FM.stoneTop, r * 0.2, r * 0.42, h - 0.08, 0, 0.04, 0, { seg: 40 });
  k.cyl(FM.stoneTop, r * 0.44, r * 0.46, 0.04, 0, 0, 0, { seg: 40 });
  k.cyl(FM.stoneTop, r * 0.62, r * 0.2, 0.04, 0, h - 0.08, 0, { seg: 40 });
  return k.build();
};
// white perforated shell armchair on four thin splayed legs (photos 1, 3, 4): the shell wraps the back and sides, highest
// at the back and sweeping down to arms that reach past the seat's middle
function shellGeo(R, t, y0, top, a0, a1, n, s) {
  const P = [], U = [], pt = (a, r, y) => [r * Math.cos(a), y, -r * Math.sin(a)];
  const quad = (A, B, Cc, D, ua, ub, ya, yb) => {
    P.push(...A, ...B, ...Cc, ...A, ...Cc, ...D);
    U.push(ua, A[1] / s, ub, B[1] / s, ub, yb / s, ua, A[1] / s, ub, yb / s, ua, ya / s);
  };
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n, ya = top(a), yb = top(b), ua = a * R / s, ub = b * R / s;
    quad(pt(a, R, y0), pt(b, R, y0), pt(b, R, yb), pt(a, R, ya), ua, ub, ya, yb);
    quad(pt(b, R - t, y0), pt(a, R - t, y0), pt(a, R - t, ya), pt(b, R - t, yb), ub, ua, yb, ya);
    quad(pt(a, R, ya), pt(b, R, yb), pt(b, R - t, yb), pt(a, R - t, ya), ua, ub, ya + t, yb + t);
  }
  for (const [a, sg] of [[a0, 1], [a1, -1]]) {
    const ya = top(a), o = pt(a, R, y0), i0 = pt(a, R - t, y0), o1 = pt(a, R, ya), i1 = pt(a, R - t, ya);
    if (sg > 0) P.push(...o, ...o1, ...i1, ...o, ...i1, ...i0); else P.push(...o, ...i0, ...i1, ...o, ...i1, ...o1);
    for (let k = 0; k < 6; k++) U.push(0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  return g;
}
B.outdoorChair = (p) => {
  const k = new Kit(), { w, d, h } = p, f = tint(FM.perfWhite, p.color), sh = 0.45, R = w / 2, zc = 0.03;
  k.rbox(f, w - 0.08, 0.035, d - 0.1, 0.015, 0, sh - 0.035, 0.03);
  const top = (a) => sh + (h - sh) * (0.42 + 0.58 * Math.max(0, Math.sin(a)));
  k.put(f, shellGeo(R, 0.012, sh - 0.035, top, -0.13 * Math.PI, 1.13 * Math.PI, 36, f.userData.s || 1), 0, 0, zc);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.leg(FM.aluWhite, sx * (w / 2 - 0.07), sz * (d / 2 - 0.08), sh - 0.035, 0.007, 0.011, { ax: sz * 0.13, az: -sx * 0.11 });
  return k.build();
};
B.umbrella = (p) => {
  const k = new Kit(), { w, h } = p, R = w / 2, fab = tint(FM.canvas, p.color);
  k.cyl(FM.aluWhite, 0.022, 0.022, h - 0.1, 0, 0, 0, { seg: 12 });
  k.cyl(fab, 0.03, R, 0.42, 0, h - 0.5, 0, { open: true, seg: 8 });
  k.cyl(fab, R * 0.98, R, 0.12, 0, h - 0.6, 0, { open: true, seg: 8 });
  k.cyl(M().steelBlack, 0.25, 0.28, 0.06, 0, 0, 0, { seg: 24 });
  return k.build();
};
B.cantileverUmbrella = (p) => {
  const k = new Kit(), { w, h } = p, R = w * 0.45, fab = tint(FM.canvas, p.color), st = M().bronze;
  k.box(M().steelBlack, 1.0, 0.06, 0.12, 0, 0, -w * 0.35); k.box(M().steelBlack, 0.12, 0.06, 1.0, 0, 0, -w * 0.35);
  k.cyl(st, 0.04, 0.045, h - 0.2, 0, 0, -w * 0.35, { seg: 12 });
  k.tube(st, [[0, h - 0.25, -w * 0.35], [0, h + 0.05, -w * 0.15], [0, h - 0.05, 0.02]], 0.03, { seg: 16 });
  k.cyl(st, 0.015, 0.015, 0.5, 0, h - 0.55, 0.02);
  k.cyl(fab, 0.03, R, 0.4, 0, h - 0.48, 0.02, { open: true, seg: 8 });
  return k.build();
};
B.cubeLight = (p) => {
  const k = new Kit(), { w, h } = p;
  const m = B._cube || (B._cube = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, emissive: 0xfff6e8, emissiveIntensity: 0.25, roughness: 0.6 }));
  if (p.round) k.sph(m, w / 2, 0, h / 2, 0, { s: [1, h / w, 0.82] });
  else k.rbox(m, w, h, w, 0.03, 0, 0, 0);
  return k.build();
};
// a planter topped with pebbles (photos 1, 3, 10, planted there; kept to pebbles here): a charcoal cube, or with
// p.round a tall white gloss cylinder
B.planter = (p) => {
  const k = new Kit(), { w, d, h } = p, peb = M().pebbles;
  if (p.round) {
    const r = Math.min(w, d) / 2;
    k.cyl(FM.ceramic, r, r * 0.96, h, 0, 0, 0, { seg: 40 });
    k.cyl(peb, r - 0.02, r - 0.02, 0.012, 0, h - 0.004, 0, { seg: 40 });
  } else {
    k.box(M().steelBlack, w, h, d, 0, 0, 0);
    k.box(peb, w - 0.04, 0.012, d - 0.04, 0, h - 0.004, 0);
  }
  return k.build();
};
B.loungeCushions = (p) => {
  const k = new Kit(), { w, d, h } = p, f = tint(FM.fabricWhite, p.color);
  k.rbox(f, w, 0.14, d, 0.05, 0, 0, 0);
  const n = Math.max(1, Math.round(w / 0.62));
  for (let i = 0; i < n; i++) k.rbox(f, w / n - 0.04, h - 0.14, 0.18, 0.07, -w / 2 + (w / n) * (i + 0.5), 0.12, -d / 2 + 0.1, { rx: -0.12 });
  for (let i = 0; i < Math.max(1, n - 1); i++) k.rbox(tint(FM.fabricWhite, 0xdcd8d0), 0.4, 0.36, 0.12, 0.05, -w / 2 + (w / n) * (i + 1), 0.14, -d / 2 + 0.24, { rx: -0.25, ry: 0.2 });
  return k.build();
};
B.glassTable = (p) => {
  const k = new Kit(), { w, d, h } = p, st = M().steelBlack;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(st, 0.025, h, 0.025, sx * (w / 2 - 0.0125), 0, sz * (d / 2 - 0.0125));
  for (const y of [0.0, h - 0.025]) { for (const sz of [-1, 1]) k.box(st, w, 0.025, 0.025, 0, y, sz * (d / 2 - 0.0125)); for (const sx of [-1, 1]) k.box(st, 0.025, 0.025, d, sx * (w / 2 - 0.0125), y, 0); }
  k.box(FM.glassClear, w - 0.03, 0.01, d - 0.03, 0, h - 0.012, 0);
  return k.build();
};
B.sunLounger = (p) => {
  const k = new Kit(), { w, d, h } = p, st = M().steelBlack, f = tint(FM.fabricGray, p.color ?? 0x2b2c2e);
  const sl = d * 0.62;
  k.rbox(st, w, 0.05, sl, 0.02, 0, 0.26, d / 2 - sl / 2);
  k.rbox(f, w - 0.06, 0.04, sl - 0.04, 0.015, 0, 0.3, d / 2 - sl / 2);
  k.rbox(st, w, 0.05, d - sl, 0.02, 0, 0.27, -d / 2 + (d - sl) / 2 + 0.02, { rx: 0.65 });
  k.rbox(f, w - 0.06, 0.04, d - sl - 0.04, 0.015, 0, 0.31, -d / 2 + (d - sl) / 2 + 0.02, { rx: 0.65 });
  for (const sx of [-1, 1]) for (const z of [d / 2 - 0.08, -d / 2 + 0.25]) k.box(st, 0.04, 0.26, 0.04, sx * (w / 2 - 0.04), 0, z);
  void h;
  return k.build();
};
// black glass outdoor kitchen (photo 5; 360° view 10_08): a black glass base lit from below, a black stone counter with an
// inset sink, a gooseneck tap and a two-burner hob; above the sink end a black glass splashback and a deep black glass wall
// cabinet in a slim steel frame (its glass front standing a little proud of its top), a light strip under it; bare wall
// above the hob
B.outdoorKitchen = (p) => {
  const k = new Kit(), { w, d, h } = p, bl = M().blackGlassOut || M().blackGlass, ss = M().stainless, st = M().steelBlack, zb = -d / 2;
  k.box(st, w - 0.06, 0.06, d - 0.10, 0, 0, -0.04);
  k.box(M().led, w - 0.12, 0.006, 0.012, 0, 0.002, d / 2 - 0.08);
  k.box(bl, w, 0.82, d - 0.03, 0, 0.06, -0.015);
  k.box(M().marbleBlack, w + 0.02, 0.04, d, 0, 0.88, 0);
  const xs = -w * 0.2, xh = w * 0.24;
  k.box(ss, 0.46, 0.006, 0.36, xs, 0.92, 0.03);
  k.cyl(st, 0.025, 0.025, 0.003, xs, 0.926, 0.03, { seg: 16 });
  k.cyl(ss, 0.018, 0.02, 0.32, xs, 0.92, zb + 0.07);
  k.tube(ss, [[xs, 1.22, zb + 0.07], [xs, 1.33, zb + 0.13], [xs, 1.27, zb + 0.25]], 0.011, { seg: 10 });
  k.box(bl, 0.44, 0.008, 0.34, xh, 0.92, 0.03);
  for (const hx of [-0.10, 0.10]) k.tor(ss, 0.062, 0.01, xh + hx, 0.935, 0.03);
  const lip = 0.10, top = h - lip, yb = Math.max(1.3, top - 0.72), du = d - 0.06, wu = w * 0.78, xu = -(w - wu) / 2, zf = zb + du;
  k.box(bl, wu, yb - 0.92, 0.012, xu, 0.92, zb + 0.006);
  k.box(M().led, wu - 0.10, 0.006, 0.02, xu, yb - 0.006, zf - 0.05);
  k.box(bl, wu, top - yb, du - 0.01, xu, yb, zb + (du - 0.01) / 2);
  k.box(bl, wu, h - yb, 0.01, xu, yb, zf - 0.005);
  k.box(st, wu, 0.02, 0.014, xu, yb, zf + 0.007);
  for (const sx of [-1, 1]) k.box(st, 0.02, h - yb, 0.014, xu + sx * (wu / 2 - 0.01), yb, zf + 0.007);
  return k.build();
};
B.outdoorBar = (p) => {
  const k = new Kit(), { w, d, h } = p, st = M().steelBlack;
  for (const sx of [-1, 1]) { k.box(st, 0.05, h - 0.04, d, sx * (w / 2 - 0.025), 0, 0); }
  k.box(st, w, 0.03, d - 0.05, 0, 0.3, 0);
  k.box(M().blackGlass, w + 0.06, 0.04, d + 0.06, 0, h - 0.04, 0);
  return k.build();
};
B.shelfRack = (p) => {
  const k = new Kit(), { w, d, h } = p, st = M().steelBlack, n = 4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(st, 0.02, h, 0.02, sx * (w / 2 - 0.01), 0, sz * (d / 2 - 0.01));
  for (let i = 0; i < n; i++) { const y = 0.1 + i * (h - 0.15) / (n - 1); k.box(st, w, 0.012, d, 0, y, 0); }
  return k.build();
};
B.outdoorSofa = (p) => {
  const k = new Kit(), { w, d, h } = p, fr = FM.aluWhite, f = tint(FM.fabricGray, p.color), arm = 0.14;
  const n = p.seats || Math.max(1, Math.round((w - 2 * arm) / 0.75)), cw = (w - 2 * arm) / n;
  k.box(fr, w, 0.06, d, 0, 0.1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(fr, 0.05, 0.1, 0.05, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03));
  for (const sx of [-1, 1]) { k.box(fr, arm, 0.04, d, sx * (w / 2 - arm / 2), 0.1, 0); k.box(FM.teakPale, arm, 0.04, d, sx * (w / 2 - arm / 2), 0.56, 0); k.box(fr, arm * 0.4, 0.42, 0.05, sx * (w / 2 - arm / 2), 0.14, d / 2 - 0.06); k.box(fr, arm * 0.4, 0.42, 0.05, sx * (w / 2 - arm / 2), 0.14, -d / 2 + 0.06); }
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + arm + cw * (i + 0.5);
    k.rbox(f, cw - 0.02, 0.14, d - 0.24, 0.04, x, 0.16, 0.08);
    k.rbox(f, cw - 0.04, h - 0.32, 0.16, 0.05, x, 0.3, -d / 2 + 0.12, { rx: -0.12 });
  }
  k.box(fr, w - 2 * arm, h - 0.2, 0.04, 0, 0.16, -d / 2 + 0.02);
  return k.build();
};
B.outdoorArmchair = (p) => B.outdoorSofa({ ...p, seats: 1 });
B.slatTable = (p) => {
  const k = new Kit(), { w, d, h } = p, fr = FM.aluWhite;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(fr, 0.05, h - 0.03, 0.05, sx * (w / 2 - 0.025), 0, sz * (d / 2 - 0.025));
  k.box(fr, w, 0.03, d, 0, h - 0.06, 0);
  const n = Math.round(w / 0.08);
  for (let i = 0; i < n; i++) k.box(FM.teakPale, w / n - 0.012, 0.025, d - 0.06, -w / 2 + (w / n) * (i + 0.5), h - 0.03, 0);
  return k.build();
};
B.bbq = (p) => {
  const k = new Kit(), { w, d, h } = p, st = M().steelBlack;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(st, 0.035, h - 0.35, 0.035, sx * (w * 0.32), 0, sz * (d / 2 - 0.05));
  k.box(st, w * 0.7, 0.03, d - 0.05, 0, 0.25, 0);
  const lr = (d - 0.08) / 2, ax = h - lr;
  k.box(st, w * 0.68, 0.24, d - 0.08, 0, ax - 0.24, 0);
  k.cyl(st, lr, lr, w * 0.68, w * 0.34, ax, 0, { rz: Math.PI / 2, tl: Math.PI, t0: 0, seg: 20 });
  for (const sx of [-1, 1]) k.box(M().stainless, w * 0.16, 0.02, d * 0.8, sx * (w / 2 - w * 0.08), ax - 0.02, 0);
  for (const sz of [-1, 1]) k.cyl(st, 0.07, 0.07, 0.04, -w * 0.32, 0.07, sz * (d / 2 - 0.05), { rx: Math.PI / 2 });
  return k.build();
};
// ---- generic bathroom fixtures (for rooms not photographed)
B.basinVanity = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.box(FM.lacquerGray, w, 0.45, d - 0.02, 0, h - 0.5, -0.01);
  k.box(M().quartz, w, 0.04, d, 0, h - 0.04, 0);
  const n = p.sinks || (w > 1.2 ? 2 : 1);
  for (let i = 0; i < n; i++) { const x = -w / 2 + (w / n) * (i + 0.5); k.lathe(FM.ceramic, [[0, 0], [0.18, 0], [0.2, 0.12], [0.18, 0.12], [0.16, 0.02], [0, 0.02]], x, h, 0.02, { seg: 32 }); k.cyl(M().stainless, 0.014, 0.014, 0.24, x, h, -d / 2 + 0.06); }
  return k.build();
};
B.showerTray = (p) => {
  const k = new Kit(), { w, d, h } = p;
  k.box(FM.ceramic, w, 0.04, d, 0, 0, 0);
  k.box(FM.glassClear, 0.01, h - 0.05, d * 0.6, w / 2 - 0.01, 0.04, d * 0.2);
  k.cyl(M().stainless, 0.012, 0.012, h - 0.25, -w / 2 + 0.05, 0.25, -d / 2 + 0.05);
  k.cyl(M().stainless, 0.12, 0.12, 0.012, -w / 2 + 0.25, h - 0.02, -d / 2 + 0.25);
  return k.build();
};
B.bathtub = (p) => {
  const k = new Kit(), { w, d, h } = p;
  const g = new THREE.LatheGeometry([[0, 0], [0.75, 0], [0.95, 0.12], [1.0, h - 0.02], [0.96, h], [0.9, h - 0.02], [0.86, 0.14], [0.68, 0.06], [0, 0.06]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
  g.scale(d / 2, 1, w / 2); g.rotateY(Math.PI / 2);
  k.put(FM.ceramic, g);
  k.cyl(M().stainless, 0.02, 0.02, 1.0, w / 2 + 0.15, 0, 0); k.cyl(M().stainless, 0.012, 0.012, 0.22, w / 2 + 0.15, 0.95, 0, { rz: Math.PI / 2 });
  return k.build();
};
// ---- generic library pieces
B.loungeChair = (p) => {
  const k = new Kit(), { w, d, h } = p, ply = M().walnut, le = tint(FM.leatherBlack, p.color), al = M().stainless;
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; k.box(al, 0.05, 0.03, w * 0.42, Math.sin(a) * w * 0.18, 0.02, Math.cos(a) * w * 0.18, { ry: a }); }
  k.cyl(al, 0.03, 0.03, 0.22, 0, 0.03, 0);
  k.rbox(ply, w * 0.82, 0.04, d * 0.55, 0.03, 0, 0.3, 0.06, { rx: -0.12 });
  k.rbox(le, w * 0.78, 0.12, d * 0.52, 0.05, 0, 0.33, 0.06, { rx: -0.12 });
  k.rbox(ply, w * 0.8, h * 0.5, 0.04, 0.03, 0, 0.36, -d * 0.24, { rx: -0.42 });
  k.rbox(le, w * 0.75, h * 0.48, 0.1, 0.05, 0, 0.37, -d * 0.2, { rx: -0.42 });
  k.rbox(ply, w * 0.62, h * 0.24, 0.04, 0.03, 0, h * 0.72, -d * 0.46, { rx: -0.3 });
  k.rbox(le, w * 0.58, h * 0.22, 0.09, 0.04, 0, h * 0.72, -d * 0.42, { rx: -0.3 });
  for (const sx of [-1, 1]) { k.rbox(le, 0.1, 0.06, d * 0.5, 0.025, sx * (w / 2 - 0.06), 0.52, 0.0); k.box(al, 0.02, 0.2, 0.02, sx * (w / 2 - 0.06), 0.34, 0.05); }
  return k.build();
};
B.ottoman = (p) => {
  const k = new Kit(), { w, d, h } = p, ply = M().walnut, le = tint(FM.leatherBlack, p.color), al = M().stainless;
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; k.box(al, 0.04, 0.025, w * 0.4, Math.sin(a) * w * 0.17, 0.02, Math.cos(a) * w * 0.17, { ry: a }); }
  k.cyl(al, 0.025, 0.025, h - 0.18, 0, 0.03, 0);
  k.rbox(ply, w, 0.04, d, 0.03, 0, h - 0.17, 0, { rx: -0.08 });
  k.rbox(le, w - 0.04, 0.13, d - 0.04, 0.05, 0, h - 0.14, 0, { rx: -0.08 });
  return k.build();
};
B.tableRect = (p) => {
  const k = new Kit(), { w, d, h } = p, top = tint(M().walnut, p.color);
  k.box(top, w, 0.04, d, 0, h - 0.04, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(M().steelBlack, 0.045, h - 0.04, 0.045, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06));
  return k.build();
};
B.tableRound = (p) => {
  const k = new Kit(), { w, h } = p, top = tint(M().walnut, p.color);
  k.cyl(top, w / 2, w / 2, 0.04, 0, h - 0.04, 0, { seg: 48 });
  k.cyl(M().steelBlack, 0.05, 0.05, h - 0.04, 0, 0.02, 0);
  k.cyl(M().steelBlack, w * 0.25, w * 0.27, 0.02, 0, 0, 0, { seg: 32 });
  return k.build();
};
B.bookshelf = (p) => {
  const k = new Kit(), { w, d, h } = p, m = tint(p.finish === 'black' ? M().steelBlack : FM.lacquerGray, p.color), n = p.shelves || Math.max(2, Math.round(h / 0.36));
  for (const sx of [-1, 1]) k.box(m, 0.02, h, d, sx * (w / 2 - 0.01), 0, 0);
  k.box(m, w, h, 0.01, 0, 0, -d / 2 + 0.005);
  const r = rng(31);
  for (let i = 0; i <= n; i++) {
    const y = i * (h - 0.02) / n; k.box(m, w - 0.04, 0.02, d, 0, y, 0);
    if (i < n) { let x = -w / 2 + 0.05; while (x < w / 2 - 0.15 && r() < 0.85) { const bw = 0.02 + r() * 0.03, bh = Math.min((h / n) - 0.05, 0.18 + r() * 0.1); const cols = [FM.toyRed, FM.fabricLinen, FM.leatherBlack, FM.velvetTaupe, FM.toyBlue]; k.box(cols[(r() * cols.length) | 0], bw, bh, d * 0.7, x + bw / 2, y + 0.02, 0); x += bw + 0.004; if (r() < 0.1) x += 0.12; } }
  }
  return k.build();
};
B.wallShelf = (p) => { const k = new Kit(); k.box(tint(M().walnut, p.color), p.w, p.h, p.d, 0, 0, 0); return k.build(); };
B.tvUnit = (p) => {
  const k = new Kit(), { w, d, h } = p, inch = p.tv || 65, tvw = inch * 0.0254 * 0.87, tvh = inch * 0.0254 * 0.49;
  k.box(tint(M().walnut, p.color), w, 0.42, d, 0, 0.08, 0);
  for (const sx of [-1, 1]) k.box(M().steelBlack, 0.03, 0.08, d - 0.06, sx * (w / 2 - 0.1), 0, 0);
  k.box(M().steelBlack, tvw, tvh, 0.03, 0, Math.max(0.6, h - tvh), -d / 2 + 0.06);
  k.box(M().blackGlass, tvw - 0.01, tvh - 0.01, 0.002, 0, Math.max(0.6, h - tvh) + 0.005, -d / 2 + 0.076);
  return k.build();
};
B.bed = (p) => {
  const k = new Kit(), { w, d, h } = p, f = tint(FM.fabricLinen, p.color);
  k.rbox(f, w, 0.32, d, 0.03, 0, 0.04, 0);
  k.rbox(f, w + 0.08, h, 0.1, 0.04, 0, 0.04, -d / 2 + 0.05);
  k.rbox(FM.fabricWhite, w - 0.06, 0.22, d - 0.14, 0.05, 0, 0.36, 0.04);
  k.rbox(FM.fabricWhite, w - 0.02, 0.06, d * 0.62, 0.03, 0, 0.56, d * 0.17);
  const n = w > 1.3 ? 2 : 1;
  for (let i = 0; i < n; i++) k.rbox(FM.fabricWhite, w / n - 0.12, 0.14, 0.4, 0.06, -w / 2 + (w / n) * (i + 0.5), 0.58, -d / 2 + 0.36, { rx: -0.25 });
  return k.build();
};
B.nightstand = (p) => {
  const k = new Kit(), { w, d, h } = p, m = tint(M().walnut, p.color);
  k.box(m, w, h - 0.12, d, 0, 0.12, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(M().brass, 0.02, 0.12, 0.02, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04));
  k.box(M().brass, 0.1, 0.01, 0.01, 0, h * 0.6, d / 2 + 0.005);
  return k.build();
};
B.desk = (p) => B.tableRect(p);
B.officeChair = (p) => {
  const k = new Kit(), { w, d, h } = p, f = tint(FM.fabricGray, p.color), al = M().steelBlack;
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; k.box(al, 0.04, 0.03, w * 0.45, Math.sin(a) * w * 0.2, 0.04, Math.cos(a) * w * 0.2, { ry: a }); }
  k.cyl(al, 0.025, 0.03, 0.38, 0, 0.06, 0);
  k.rbox(f, w * 0.85, 0.08, d * 0.8, 0.03, 0, 0.44, 0.03);
  k.rbox(f, w * 0.8, h - 0.56, 0.06, 0.03, 0, 0.56, -d * 0.38, { rx: -0.1 });
  return k.build();
};
B.tableLamp = (p) => {
  const k = new Kit(), { w, h } = p;
  k.lathe(tint(FM.ceramic, p.color), [[0, 0], [w * 0.22, 0], [w * 0.3, h * 0.25], [w * 0.12, h * 0.55], [0.015, h * 0.6], [0, h * 0.6]], 0, 0, 0);
  k.cyl(FM.shade, w * 0.35, w * 0.5, h * 0.4, 0, h * 0.6, 0, { open: true });
  k.sph(FM.bulb, 0.03, 0, h * 0.68, 0);
  return k.build();
};
B.pendant = (p) => {
  const k = new Kit(), { w, h } = p, m = tint(M().brass, p.color);
  k.cyl(M().steelBlack, 0.004, 0.004, h - w * 0.3, 0, w * 0.3, 0, { seg: 6 });
  k.sph(m, w / 2, 0, w * 0.3, 0, { tl: Math.PI / 2, s: [1, 0.6, 1] });
  k.sph(FM.bulb, 0.05, 0, w * 0.2, 0);
  k.cyl(m, 0.05, 0.05, 0.02, 0, h - 0.02, 0);
  return k.build();
};
B.arcLamp = (p) => {
  const k = new Kit(), { w, d, h } = p, st = M().stainless, b = -d / 2 + 0.13, s = d / 2 - 0.2;
  k.box(M().marbleSlab, Math.min(0.4, w), 0.12, 0.26, 0, 0, b);
  k.tube(st, [[0, 0.12, b], [0, h * 0.7, b + 0.05], [0, h - 0.02, (b + s) / 2], [0, h * 0.86, s]], 0.014, { seg: 40 });
  k.sph(st, 0.2, 0, h * 0.8 - 0.06, s, { tl: Math.PI / 2, s: [1, 0.7, 1] });
  k.sph(FM.bulb, 0.05, 0, h * 0.78 - 0.06, s);
  return k.build();
};
B.mirrorRound = (p) => {
  const k = new Kit(), { w } = p;
  k.cyl(tint(M().brass, p.color), w / 2, w / 2, 0.025, 0, w / 2, 0, { rx: Math.PI / 2, seg: 48 });
  k.cyl(M().mirror, w / 2 - 0.02, w / 2 - 0.02, 0.03, 0, w / 2, 0.003, { rx: Math.PI / 2, seg: 48 });
  return k.build();
};
B.artFrame = (p) => {
  const k = new Kit(), { w, h } = p;
  k.box(M().steelBlack, w, h, 0.03, 0, 0, -0.015);
  const g = new THREE.PlaneGeometry(w - 0.06, h - 0.06); g.translate(0, h / 2, 0.002);
  k.put(p._photoMat || (p.style === 2 ? FM.art2 : FM.art1), g);
  return k.build();
};
// photo box: a sized placeholder with the product photo on its front (or top for rugs)
B.photoBox = (p) => {
  const k = new Kit(), { w, d, h } = p;
  const base = tint(FM.lacquerGray, p.color ?? 0xd8d4cc);
  const ph = p._photoMat;
  if (p.shape === 'cylinder') { k.cyl(base, w / 2, w / 2, h, 0, 0, 0, { seg: 40 }); if (ph) { const g = new THREE.PlaneGeometry(w * 0.9, h * 0.9); g.translate(0, h / 2, w / 2 + 0.003); k.put(ph, g); } }
  else if (p.shape === 'rug') { k.box(base, w, Math.max(0.005, h), d, 0, 0, 0); if (ph) { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(0, Math.max(0.005, h) + 0.002, 0); k.put(ph, g); } }
  else if (p.shape === 'panel') { k.box(base, w, h, Math.max(0.01, d), 0, 0, 0); if (ph) { const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, Math.max(0.01, d) / 2 + 0.002); k.put(ph, g); } }
  else { k.box(base, w, h, d, 0, 0, 0); if (ph) { const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, d / 2 + 0.003); k.put(ph, g); } }
  return k.build();
};

// ---------------------------------------------------------------- catalog
// cat: Seating | Tables | Storage | Beds | Lighting | Decor | Kitchen | Bath | Outdoor
// flags: lib (show in Add panel), wall (snaps to walls), hang (hangs from ceiling), color (default tint)
export const CATALOG = {
  sofaTufted: { name: 'Tufted sofa', cat: 'Seating', b: B.sofaTufted, dims: [3.6, 1.0, 0.78], color: 0xcdbfaa },
  sofa: { name: 'Sofa', cat: 'Seating', b: B.sofa, dims: [2.4, 0.95, 0.8], color: 0x8c7c6a, lib: true },
  armchair: { name: 'Armchair', cat: 'Seating', b: B.armchair, dims: [0.9, 0.9, 0.8], color: 0x8c7c6a, lib: true },
  barrelChair: { name: 'Swivel chair', cat: 'Seating', b: B.barrelChair, dims: [0.86, 0.86, 0.76], color: 0x1c4a73, lib: true },
  loungeChair: { name: 'Lounge chair', cat: 'Seating', b: B.loungeChair, dims: [0.84, 0.85, 0.89], color: 0x1c1c1d, lib: true },
  ottoman: { name: 'Ottoman', cat: 'Seating', b: B.ottoman, dims: [0.66, 0.55, 0.43], color: 0x1c1c1d, lib: true },
  diningChair: { name: 'Dining chair', cat: 'Seating', b: B.diningChair, dims: [0.56, 0.58, 0.84], color: 0xdccfbd, lib: true },
  barStool: { name: 'Bar stool', cat: 'Seating', b: B.barStool, dims: [0.46, 0.46, 1.02], color: 0x8c7c6a, lib: true },
  stoolWhite: { name: 'Counter stool', cat: 'Seating', b: B.stoolWhite, dims: [0.42, 0.42, 0.78], lib: true },
  benchBrass: { name: 'Bench', cat: 'Seating', b: B.benchBrass, dims: [1.6, 0.42, 0.45], color: 0xdccfbd, lib: true },
  pouf: { name: 'Pouf', cat: 'Seating', b: B.pouf, dims: [0.5, 0.5, 0.4], color: 0xe7b6c1, lib: true },
  officeChair: { name: 'Desk chair', cat: 'Seating', b: B.officeChair, dims: [0.62, 0.6, 1.0], color: 0x9b968f, lib: true },
  highChair: { name: 'High chair', cat: 'Seating', b: B.highChair, dims: [0.6, 0.75, 1.0] },
  coffeeTableRect: { name: 'Coffee table', cat: 'Tables', b: B.coffeeTableRect, dims: [1.3, 0.9, 0.38], lib: true },
  coffeeTableRound: { name: 'Round coffee table', cat: 'Tables', b: B.coffeeTableRound, dims: [0.8, 0.8, 0.44], lib: true },
  sideTable: { name: 'Side table', cat: 'Tables', b: B.sideTable, dims: [0.5, 0.5, 0.55], lib: true },
  diningTable: { name: 'Dining table', cat: 'Tables', b: B.diningTable, dims: [2.6, 1.1, 0.76], lib: true },
  tableRect: { name: 'Table', cat: 'Tables', b: B.tableRect, dims: [1.6, 0.9, 0.75], color: null, lib: true },
  tableRound: { name: 'Round table', cat: 'Tables', b: B.tableRound, dims: [1.1, 1.1, 0.75], lib: true },
  desk: { name: 'Desk', cat: 'Tables', b: B.desk, dims: [1.4, 0.7, 0.75], lib: true },
  deskCurved: { name: 'Curved desk', cat: 'Tables', b: B.deskCurved, dims: [1.3, 0.55, 0.74], color: 0x8f8b85 },
  console: { name: 'Console', cat: 'Tables', b: B.console, dims: [1.2, 0.38, 0.85], lib: true },
  sideboard: { name: 'Sideboard', cat: 'Storage', b: B.sideboard, dims: [2.2, 0.48, 0.8], lib: true },
  displayShelf: { name: 'Display shelf', cat: 'Storage', b: B.displayShelf, dims: [1.0, 0.38, 2.3], lib: true },
  bookshelf: { name: 'Bookshelf', cat: 'Storage', b: B.bookshelf, dims: [1.0, 0.35, 1.9], color: null, lib: true },
  wallShelf: { name: 'Wall shelf', cat: 'Storage', b: B.wallShelf, dims: [1.2, 0.25, 0.04], wall: true, elev: 1.4, lib: true },
  wardrobe: { name: 'Wardrobe', cat: 'Storage', b: B.wardrobe, dims: [1.0, 0.6, 2.5], color: 0xa39b90, lib: true },
  tvUnit: { name: 'TV + media unit', cat: 'Storage', b: B.tvUnit, dims: [1.9, 0.42, 1.35], lib: true },
  shelvesOpen: { name: 'Open shelves', cat: 'Storage', b: B.shelvesOpen, dims: [0.4, 0.32, 2.2], color: 0xa39b90 },
  nightstand: { name: 'Nightstand', cat: 'Storage', b: B.nightstand, dims: [0.5, 0.4, 0.55], lib: true },
  bed: { name: 'Bed', cat: 'Beds', b: B.bed, dims: [1.8, 2.1, 1.1], color: 0xdad5cc, lib: true },
  bedPlatform: { name: 'Platform bed', cat: 'Beds', b: B.bedPlatform, dims: [1.4, 2.0, 0.42], color: 0x9a8f84 },
  bedNiche: { name: 'Bed niche', cat: 'Beds', b: B.bedNiche, dims: [1.7, 0.32, 2.55] },
  palmLamp: { name: 'Palm floor lamp', cat: 'Lighting', b: B.palmLamp, dims: [0.7, 0.7, 1.6], lib: true },
  tripodLamp: { name: 'Tripod floor lamp', cat: 'Lighting', b: B.tripodLamp, dims: [0.55, 0.55, 1.72], lib: true },
  arcLamp: { name: 'Arc floor lamp', cat: 'Lighting', b: B.arcLamp, dims: [0.45, 1.6, 2.0], lib: true },
  tableLamp: { name: 'Table lamp', cat: 'Lighting', b: B.tableLamp, dims: [0.35, 0.35, 0.55], color: 0xf7f7f5, lib: true },
  pendant: { name: 'Pendant light', cat: 'Lighting', b: B.pendant, dims: [0.45, 0.45, 1.0], hang: true, color: 0xb88a3e, lib: true },
  chandelier: { name: 'Chandelier', cat: 'Lighting', b: B.chandelier, dims: [1.3, 0.55, 1.1], hang: true, lib: true },
  sconce: { name: 'Wall light', cat: 'Lighting', b: B.sconce, dims: [0.1, 0.1, 0.45], wall: true, elev: 1.55, lib: true },
  rug: { name: 'Rug', cat: 'Decor', b: B.rug, dims: [3.0, 2.0, 0.012], color: null, lib: true },
  rugRound: { name: 'Round rug', cat: 'Decor', b: (p) => B.rug({ ...p, round: true }), dims: [2.0, 2.0, 0.012], lib: true },
  rugPink: { name: 'Shaggy rug', cat: 'Decor', b: (p) => B.rug({ ...p, style: 'pink' }), dims: [2.0, 1.4, 0.03] },
  sheepskin: { name: 'Sheepskin', cat: 'Decor', b: (p) => B.rug({ ...p, style: 'sheep' }), dims: [1.0, 0.7, 0.03] },
  curtain: { name: 'Sheer curtain', cat: 'Decor', b: B.curtain, dims: [2.4, 0.08, 3.0], hang: true, lib: true },
  mirrorLED: { name: 'Backlit mirror', cat: 'Decor', b: B.mirrorLED, dims: [1.1, 0.04, 0.8], wall: true, elev: 1.15, lib: true },
  mirrorRound: { name: 'Round mirror', cat: 'Decor', b: B.mirrorRound, dims: [0.8, 0.04, 0.8], wall: true, elev: 1.1, color: 0xb88a3e, lib: true },
  roundMirrors: { name: 'Mirror cluster', cat: 'Decor', b: B.roundMirrors, dims: [0.8, 0.04, 1.0], wall: true, elev: 1.1 },
  hollywoodMirror: { name: 'Vanity mirror', cat: 'Decor', b: B.hollywoodMirror, dims: [0.8, 0.28, 1.9] },
  mosaicArt: { name: 'Mosaic artwork', cat: 'Decor', b: B.mosaicArt, dims: [1.3, 0.04, 2.0], wall: true, elev: 0.55 },
  artFrame: { name: 'Framed art', cat: 'Decor', b: B.artFrame, dims: [0.8, 0.04, 1.0], wall: true, elev: 1.2, lib: true },
  cubeLight: { name: 'Light cube', cat: 'Outdoor', b: B.cubeLight, dims: [0.42, 0.42, 0.42], lib: true },
  pebbleSeat: { name: 'Pebble seat', cat: 'Outdoor', b: (p) => B.cubeLight({ ...p, round: true }), dims: [0.6, 0.5, 0.32] },
  planter: { name: 'Planter', cat: 'Outdoor', b: B.planter, dims: [0.55, 0.55, 0.72], lib: true },
  planterTall: { name: 'Tall planter', cat: 'Outdoor', b: (p) => B.planter({ ...p, round: true }), dims: [0.36, 0.36, 0.95], lib: true },
  barCounter: { name: 'Bar counter', cat: 'Kitchen', b: B.barCounter, dims: [2.0, 0.6, 1.05], lib: true },
  kitchenBase: { name: 'Base cabinets', cat: 'Kitchen', b: B.kitchenBase, dims: [2.4, 0.62, 0.9], color: 0xd8d6d1, lib: true },
  kitchenWall: { name: 'Wall cabinets', cat: 'Kitchen', b: B.kitchenWall, dims: [2.4, 0.36, 0.85], wall: true, elev: 1.45, lib: true },
  fridgeTall: { name: 'Fridge unit', cat: 'Kitchen', b: B.fridgeTall, dims: [0.95, 0.68, 2.3], lib: true },
  ovenTower: { name: 'Oven tower', cat: 'Kitchen', b: B.ovenTower, dims: [0.66, 0.62, 2.3], lib: true },
  breakfastBar: { name: 'Breakfast counter', cat: 'Kitchen', b: B.breakfastBar, dims: [2.4, 0.9, 0.92], color: 0xf3f3f1, lib: true },
  toiletWall: { name: 'Wall-hung toilet', cat: 'Bath', b: B.toiletWall, dims: [0.38, 0.56, 1.05], lib: true },
  vanityGlass: { name: 'Vanity with glass basin', cat: 'Bath', b: B.vanityGlass, dims: [1.3, 0.5, 0.9], lib: true },
  basinVanity: { name: 'Basin vanity', cat: 'Bath', b: B.basinVanity, dims: [1.2, 0.5, 0.88], lib: true },
  showerTray: { name: 'Shower', cat: 'Bath', b: B.showerTray, dims: [1.0, 1.0, 2.1], lib: true },
  bathtub: { name: 'Freestanding bath', cat: 'Bath', b: B.bathtub, dims: [1.75, 0.85, 0.58], lib: true },
  outdoorTable: { name: 'Outdoor table', cat: 'Outdoor', b: B.outdoorTable, dims: [1.3, 1.3, 0.74], lib: true },
  outdoorChair: { name: 'Outdoor chair', cat: 'Outdoor', b: B.outdoorChair, dims: [0.58, 0.56, 0.8], color: 0xf3f3f1, lib: true },
  umbrella: { name: 'Parasol', cat: 'Outdoor', b: B.umbrella, dims: [3.0, 3.0, 2.6], color: 0xebe8e2, lib: true },
  cantileverUmbrella: { name: 'Cantilever parasol', cat: 'Outdoor', b: B.cantileverUmbrella, dims: [3.0, 3.0, 2.7], color: 0xebe8e2, lib: true },
  loungeCushions: { name: 'Bench cushions', cat: 'Outdoor', b: B.loungeCushions, dims: [2.4, 0.62, 0.55], color: 0xebe8e2, lib: true },
  glassTable: { name: 'Glass table', cat: 'Outdoor', b: B.glassTable, dims: [1.0, 0.6, 0.4], lib: true },
  sunLounger: { name: 'Sun lounger', cat: 'Outdoor', b: B.sunLounger, dims: [0.7, 2.0, 0.6], lib: true },
  outdoorKitchen: { name: 'Outdoor kitchen', cat: 'Outdoor', b: B.outdoorKitchen, dims: [1.4, 0.55, 2.4], lib: true },
  outdoorBar: { name: 'Outdoor bar', cat: 'Outdoor', b: B.outdoorBar, dims: [1.6, 0.5, 1.05], lib: true },
  shelfRack: { name: 'Metal rack', cat: 'Outdoor', b: B.shelfRack, dims: [1.0, 0.4, 1.8], lib: true },
  outdoorSofa: { name: 'Outdoor sofa', cat: 'Outdoor', b: B.outdoorSofa, dims: [2.2, 0.85, 0.75], color: 0xd6d1c8, lib: true },
  outdoorArmchair: { name: 'Outdoor armchair', cat: 'Outdoor', b: B.outdoorArmchair, dims: [0.85, 0.85, 0.75], color: 0xd6d1c8, lib: true },
  slatTable: { name: 'Slatted coffee table', cat: 'Outdoor', b: B.slatTable, dims: [1.2, 0.7, 0.36], lib: true },
  bbq: { name: 'Barbecue grill', cat: 'Outdoor', b: B.bbq, dims: [1.3, 0.6, 1.15], lib: true },
  photoBox: { name: 'Sized box', cat: 'Custom', b: B.photoBox, dims: [0.8, 0.8, 0.8] },
};
export const CATEGORIES = ['Seating', 'Tables', 'Storage', 'Beds', 'Lighting', 'Decor', 'Kitchen', 'Bath', 'Outdoor'];

export function buildItemMesh(type, params) {
  const def = CATALOG[type];
  if (!def) return null;
  const p = { w: def.dims[0], d: def.dims[1], h: def.dims[2], ...params };
  const g = def.b(p);
  g.userData.type = type;
  return g;
}
