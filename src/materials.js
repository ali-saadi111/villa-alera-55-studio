// Procedural textures and the material library, matched to the villa photos:
// white polished marble, Nero Marquina, walnut veneer and slats, limestone cladding,
// brown wood-look facade panels, black steel, brass, bronze window frames.
import * as THREE from 'three';
import { rng } from './util.js';

let ANISO = 4;
const M = {};
export const MAT = M;

function C(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true, rep = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}
function wrapDraw(S, x, y, r, fn) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
    if (x + ox + r < 0 || x + ox - r > S || y + oy + r < 0 || y + oy - r > S) continue;
    fn(x + ox, y + oy);
  }
}
// the same colour at zero alpha: fading to transparent black leaves dark rings
function clear(col) {
  if (col[0] === '#') { const n = parseInt(col.length === 4 ? col.slice(1).split('').map((c) => c + c).join('') : col.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0)`; }
  const m = col.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(','); return `rgba(${p[0]},${p[1]},${p[2]},0)`; }
  return 'rgba(255,255,255,0)';
}
function blobs(ctx, S, rnd, n, r0, r1, colors, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S, r = r0 + rnd() * (r1 - r0);
    const col = colors[(rnd() * colors.length) | 0];
    ctx.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    wrapDraw(S, x, y, r, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, col); g.addColorStop(1, clear(col));
      ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  ctx.globalAlpha = 1;
}
function specks(ctx, S, rnd, n, size, colors, alpha) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * rnd();
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    const s = size * (0.4 + rnd());
    ctx.fillRect(rnd() * S, rnd() * S, s, s);
  }
  ctx.globalAlpha = 1;
}
function vein(ctx, S, rnd, o) {
  let x = rnd() * S, y = rnd() * S, a = o.angle + (rnd() - 0.5) * (o.spread ?? 0.8);
  const pts = [[x, y]];
  for (let i = 0; i < o.steps; i++) {
    a += (rnd() - 0.5) * o.wobble; x += Math.cos(a) * o.len; y += Math.sin(a) * o.len; pts.push([x, y]);
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [w, al] of o.passes) {
    ctx.strokeStyle = o.color; ctx.lineWidth = w; ctx.globalAlpha = al;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  return pts;
}
function grainV(ctx, x0, y0, w, h, rnd, dark, light, density = 0.6) {
  const n = Math.max(4, (w * density) | 0);
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w, amp = 1 + rnd() * 4, f = 0.004 + rnd() * 0.02, ph = rnd() * 6;
    ctx.strokeStyle = rnd() < 0.6 ? dark : light; ctx.globalAlpha = 0.08 + rnd() * 0.22; ctx.lineWidth = 0.6 + rnd() * 1.8;
    ctx.beginPath();
    for (let y = y0; y <= y0 + h; y += 6) {
      const xx = x + Math.sin(y * f + ph) * amp + Math.sin(y * f * 3.1 + ph) * amp * 0.3;
      y === y0 ? ctx.moveTo(xx, y) : ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function grainH(ctx, x0, y0, w, h, rnd, dark, light, density = 0.6) {
  ctx.save(); ctx.translate(x0 + w, y0); ctx.rotate(Math.PI / 2);
  grainV(ctx, 0, 0, h, w, rnd, dark, light, density);
  ctx.restore();
}

// ---------- textures ----------
function marbleWhite(size, joints) {
  const [c, ctx] = C(size); const r = rng(11);
  ctx.fillStyle = '#f3f1ec'; ctx.fillRect(0, 0, size, size);
  blobs(ctx, size, r, 40, size * 0.08, size * 0.3, ['#e7e2da', '#f8f7f4', '#e9e6e0'], 0.5);
  for (let i = 0; i < 9; i++) vein(ctx, size, r, { color: '#b9b0a3', angle: 0.6, steps: 60, len: size / 40, wobble: 0.5, passes: [[size / 90, 0.06], [size / 260, 0.25], [size / 700, 0.5]] });
  for (let i = 0; i < 5; i++) vein(ctx, size, r, { color: '#c8a77a', angle: 0.7, steps: 40, len: size / 50, wobble: 0.6, passes: [[size / 300, 0.18], [size / 900, 0.4]] });
  for (let i = 0; i < 18; i++) vein(ctx, size, r, { color: '#9d968c', angle: 0.5, steps: 22, len: size / 70, wobble: 0.9, passes: [[size / 900, 0.35]] });
  if (joints) {
    ctx.strokeStyle = '#cfc8bc'; ctx.lineWidth = Math.max(1, size / 700); ctx.globalAlpha = 0.9;
    for (let k = 0; k <= 2; k++) { const p = k * size / 2; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  return tex(c);
}
function marbleBlack(size) {
  const [c, ctx] = C(size); const r = rng(23);
  ctx.fillStyle = '#121314'; ctx.fillRect(0, 0, size, size);
  blobs(ctx, size, r, 30, size * 0.1, size * 0.35, ['#1d1f22', '#0b0b0c', '#25272b'], 0.6);
  for (let i = 0; i < 7; i++) vein(ctx, size, r, { color: '#e9e6df', angle: 1.0, steps: 50, len: size / 45, wobble: 0.7, passes: [[size / 220, 0.12], [size / 600, 0.75]] });
  for (let i = 0; i < 26; i++) vein(ctx, size, r, { color: '#cfccc5', angle: r() * 6, spread: 6, steps: 10, len: size / 60, wobble: 1.0, passes: [[size / 1000, 0.55]] });
  return tex(c);
}
function walnutTex(size, slats) {
  const [c, ctx] = C(size); const r = rng(slats ? 37 : 31);
  const n = slats ? 15 : 4;
  for (let i = 0; i < n; i++) {
    const x0 = (i * size) / n, w = size / n;
    const tone = 0.85 + r() * 0.3;
    ctx.fillStyle = `rgb(${(92 * tone) | 0},${(60 * tone) | 0},${(38 * tone) | 0})`;
    ctx.fillRect(x0, 0, w + 1, size);
    grainV(ctx, x0, 0, w, size, r, '#2e1c10', '#a77a52', slats ? 0.9 : 0.5);
    if (slats) {
      const gap = w * 0.24;
      ctx.fillStyle = '#1b120b'; ctx.fillRect(x0 + w - gap, 0, gap, size);
      const g = ctx.createLinearGradient(x0, 0, x0 + w - gap, 0);
      g.addColorStop(0, 'rgba(255,230,200,0.10)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g; ctx.fillRect(x0, 0, w - gap, size);
    }
  }
  return tex(c);
}
function limestoneTex(size, joints = true) {
  const [c, ctx] = C(size); const r = rng(41);
  ctx.fillStyle = '#d8ccb3'; ctx.fillRect(0, 0, size, size);
  const rows = 4, cols = 2;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols + 1; i++) {
    const off = (j % 2) * size / cols / 2, x = i * size / cols - off, y = j * size / rows;
    const t = 0.94 + r() * 0.1;
    ctx.fillStyle = `rgb(${(216 * t) | 0},${(204 * t) | 0},${(179 * t) | 0})`;
    ctx.fillRect(x, y, size / cols, size / rows);
  }
  blobs(ctx, size, r, 70, size * 0.02, size * 0.09, ['#c8b99b', '#e6dcc8', '#cdbfa3'], 0.45);
  specks(ctx, size, r, 2600, size / 400, ['#a99a7d', '#efe7d7', '#8f826a'], 0.5);
  if (joints) {
    ctx.strokeStyle = '#a89a80'; ctx.lineWidth = size / 340;
    for (let j = 0; j <= rows; j++) { const y = j * size / rows; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
    for (let j = 0; j < rows; j++) for (let i = 0; i <= cols; i++) {
      const off = (j % 2) * size / cols / 2, x = i * size / cols - off;
      ctx.beginPath(); ctx.moveTo(x, j * size / rows); ctx.lineTo(x, (j + 1) * size / rows); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + size, j * size / rows); ctx.lineTo(x + size, (j + 1) * size / rows); ctx.stroke();
    }
  }
  return tex(c);
}
function plainNoise(size, base, cols, alpha, seed) {
  const [c, ctx] = C(size); const r = rng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  blobs(ctx, size, r, 50, size * 0.04, size * 0.2, cols, alpha);
  specks(ctx, size, r, 1200, size / 450, cols, alpha * 0.8);
  return tex(c);
}
function planksTex(size, { rows = 12, cols = 2, base = [90, 58, 38], dark = '#2a190e', light = '#9b6f48', gap = '#1d130c', seed = 51, horizontal = true } = {}) {
  const [c, ctx] = C(size); const r = rng(seed);
  const ph = size / rows, pw = size / cols;
  for (let j = 0; j < rows; j++) {
    const off = r() * pw;
    for (let i = -1; i <= cols; i++) {
      const x = i * pw + off, y = j * ph, t = 0.82 + r() * 0.34;
      ctx.fillStyle = `rgb(${(base[0] * t) | 0},${(base[1] * t) | 0},${(base[2] * t) | 0})`;
      ctx.fillRect(x, y, pw, ph);
      grainH(ctx, x, y, pw, ph, r, dark, light, 0.25);
      ctx.fillStyle = gap; ctx.fillRect(x, y, Math.max(1, size / 512), ph);
    }
    ctx.fillStyle = gap; ctx.fillRect(0, j * ph, size, Math.max(1, size / 400));
  }
  const t = tex(c);
  if (!horizontal) { t.rotation = Math.PI / 2; }
  return t;
}
function paversTex(size, n, base, joint, seed) {
  const [c, ctx] = C(size); const r = rng(seed);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const t = 0.94 + r() * 0.1;
    ctx.fillStyle = `rgb(${(base[0] * t) | 0},${(base[1] * t) | 0},${(base[2] * t) | 0})`;
    ctx.fillRect(i * size / n, j * size / n, size / n, size / n);
  }
  blobs(ctx, size, r, 40, size * 0.02, size * 0.08, ['rgba(120,105,80,1)', 'rgba(255,250,240,1)'], 0.12);
  specks(ctx, size, r, 1500, size / 400, ['#9b8f78', '#f2ece0'], 0.45);
  ctx.strokeStyle = joint; ctx.lineWidth = size / 260;
  for (let k = 0; k <= n; k++) { const p = k * size / n; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke(); }
  return tex(c);
}
function pebblesTex(size, seed = 61) {
  const [c, ctx] = C(size); const r = rng(seed);
  ctx.fillStyle = '#2b2d30'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    const x = r() * size, y = r() * size, rx = size * (0.012 + r() * 0.018), ry = rx * (0.55 + r() * 0.35), a = r() * Math.PI;
    const t = 40 + r() * 70;
    wrapDraw(size, x, y, rx, (px, py) => {
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.4, rx * 0.1, 0, 0, rx);
      g.addColorStop(0, `rgb(${t + 45},${t + 47},${t + 50})`); g.addColorStop(1, `rgb(${t * 0.6},${t * 0.62},${t * 0.66})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill(); ctx.restore();
    });
  }
  return tex(c);
}
// light gravel: small rounded stones in creams and greys, densely packed (the forecourt's bed, capture F4)
function gravelTex(size, seed = 63) {
  const [c, ctx] = C(size); const r = rng(seed);
  ctx.fillStyle = '#8a857a'; ctx.fillRect(0, 0, size, size);
  const pal = [[176, 170, 158], [150, 144, 134], [198, 192, 180], [122, 118, 110], [164, 152, 132], [104, 101, 95]];
  for (let i = 0; i < 2600; i++) {
    const x = r() * size, y = r() * size, rx = size * (0.005 + r() * 0.008), ry = rx * (0.6 + r() * 0.35), a = r() * Math.PI;
    const p = pal[(r() * pal.length) | 0], t = 0.9 + r() * 0.2;
    wrapDraw(size, x, y, rx, (px, py) => {
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.4, rx * 0.1, 0, 0, rx);
      g.addColorStop(0, `rgb(${Math.min(255, p[0] * t + 22) | 0},${Math.min(255, p[1] * t + 22) | 0},${Math.min(255, p[2] * t + 22) | 0})`);
      g.addColorStop(1, `rgb(${(p[0] * t * 0.72) | 0},${(p[1] * t * 0.72) | 0},${(p[2] * t * 0.72) | 0})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill(); ctx.restore();
    });
  }
  return tex(c);
}
function roofTileTex(size) {
  const [c, ctx] = C(size); const r = rng(71);
  ctx.fillStyle = '#7d331b'; ctx.fillRect(0, 0, size, size);
  const rows = 8, cols = 6, th = size / rows, tw = size / cols;
  for (let j = 0; j < rows; j++) for (let i = -1; i <= cols; i++) {
    const x = i * tw + (j % 2) * tw / 2, y = j * th, t = 0.85 + r() * 0.3;
    const g = ctx.createLinearGradient(x, 0, x + tw, 0);
    g.addColorStop(0, `rgb(${(150 * t) | 0},${(62 * t) | 0},${(36 * t) | 0})`);
    g.addColorStop(0.5, `rgb(${(196 * t) | 0},${(92 * t) | 0},${(56 * t) | 0})`);
    g.addColorStop(1, `rgb(${(132 * t) | 0},${(52 * t) | 0},${(30 * t) | 0})`);
    ctx.fillStyle = g; ctx.fillRect(x + 1, y, tw - 2, th);
    ctx.fillStyle = 'rgba(40,12,4,0.45)'; ctx.fillRect(x, y + th - size / 90, tw, size / 90);
  }
  return tex(c);
}
function brickTex(size) {
  const [c, ctx] = C(size); const r = rng(81);
  ctx.fillStyle = '#8a8276'; ctx.fillRect(0, 0, size, size);
  const rows = 20, cols = 5, bh = size / rows, bw = size / cols;
  const pal = [[142, 90, 67], [111, 74, 60], [156, 122, 99], [95, 86, 80], [176, 138, 110], [120, 64, 44], [98, 70, 58]];
  for (let j = 0; j < rows; j++) for (let i = -1; i <= cols; i++) {
    const x = i * bw + (j % 2) * bw / 2, y = j * bh, p = pal[(r() * pal.length) | 0], t = 0.85 + r() * 0.3;
    ctx.fillStyle = `rgb(${(p[0] * t) | 0},${(p[1] * t) | 0},${(p[2] * t) | 0})`;
    ctx.fillRect(x + size / 300, y + size / 300, bw - size / 150, bh - size / 150);
    specks(ctx, 0, r, 0, 1, [], 0);
  }
  specks(ctx, size, r, 2000, size / 300, ['#3a2a22', '#d8c4ae'], 0.35);
  return tex(c);
}
function stoneWallTex(size) {
  const [c, ctx] = C(size); const r = rng(91);
  ctx.fillStyle = '#9f9277'; ctx.fillRect(0, 0, size, size);
  let y = 0;
  while (y < size) {
    const h = size * (0.07 + r() * 0.06); let x = -r() * size * 0.2;
    while (x < size) {
      const w = size * (0.12 + r() * 0.22), t = 0.86 + r() * 0.24;
      ctx.fillStyle = `rgb(${(214 * t) | 0},${(202 * t) | 0},${(176 * t) | 0})`;
      ctx.fillRect(x + 2, y + 2, w - 4, Math.min(h, size - y) - 4);
      x += w;
    }
    y += h;
  }
  blobs(ctx, size, r, 60, size * 0.01, size * 0.05, ['#8c7f66', '#efe6d4'], 0.3);
  specks(ctx, size, r, 2500, size / 350, ['#6e644f', '#f5eee0'], 0.4);
  return tex(c);
}
function lawnTex(size) {
  const [c, ctx] = C(size); const r = rng(101);
  ctx.fillStyle = '#6d8a3e'; ctx.fillRect(0, 0, size, size);
  blobs(ctx, size, r, 40, size * 0.05, size * 0.2, ['#5d7a34', '#82a04c', '#6f8f40'], 0.5);
  for (let i = 0; i < 5000; i++) {
    const x = r() * size, y = r() * size, g = 90 + r() * 70;
    ctx.strokeStyle = `rgb(${(g * 0.6) | 0},${g | 0},${(g * 0.35) | 0})`; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return tex(c);
}
function poolTileTex(size, cols = ['#2f8ea3', '#46aec1', '#5cc0cf'], grout = '#d7eef0', seed = 111) {
  const [c, ctx] = C(size); const r = rng(seed);
  const n = 20, s = size / n;
  ctx.fillStyle = grout; ctx.fillRect(0, 0, size, size);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const t = r();
    ctx.fillStyle = t < 0.15 ? cols[0] : t < 0.6 ? cols[1] : cols[2];
    ctx.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
  }
  return tex(c);
}
function flutedTex(size, flutes = 12) {
  const [c, ctx] = C(size, size);
  const w = size / flutes;
  for (let i = 0; i < flutes; i++) {
    const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
    g.addColorStop(0, '#b9b5ae'); g.addColorStop(0.25, '#f4f2ee'); g.addColorStop(0.6, '#e3e0da'); g.addColorStop(1, '#a8a49d');
    ctx.fillStyle = g; ctx.fillRect(i * w, 0, w, size);
  }
  return tex(c);
}
function stripesTex(size) {
  const [c, ctx] = C(size, 32);
  const n = 16, w = size / n;
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#ecdcd6' : '#f3e7e2'; ctx.fillRect(i * w, 0, w, 32); }
  ctx.fillStyle = 'rgba(200,170,160,0.35)';
  for (let i = 0; i < n; i++) ctx.fillRect(i * w, 0, 1, 32);
  return tex(c);
}
function solarTex(size) {
  const [c, ctx] = C(size); ctx.fillStyle = '#c9ccd2'; ctx.fillRect(0, 0, size, size);
  const n = 6;
  for (let j = 0; j < n * 2; j++) for (let i = 0; i < n; i++) {
    const g = ctx.createLinearGradient(0, j * size / (n * 2), 0, (j + 1) * size / (n * 2));
    g.addColorStop(0, '#1e2c4a'); g.addColorStop(1, '#13203a');
    ctx.fillStyle = g; ctx.fillRect(i * size / n + 1, j * size / (n * 2) + 1, size / n - 2, size / (n * 2) - 2);
  }
  return tex(c, true, false);
}
function asphaltTex(size) {
  const [c, ctx] = C(size); const r = rng(121);
  ctx.fillStyle = '#56585b'; ctx.fillRect(0, 0, size, size);
  blobs(ctx, size, r, 50, size * 0.05, size * 0.2, ['#4b4d50', '#636569'], 0.4);
  specks(ctx, size, r, 6000, size / 300, ['#2e3033', '#8a8c90', '#6c6e72'], 0.6);
  return tex(c);
}
function pathTex(size) {
  // stepping slabs separated by black pebbles (the path beside the pool)
  const [c, ctx] = C(size); const r = rng(131);
  const peb = pebblesTex(256, 133).image;
  for (let y = 0; y < size; y += 256) for (let x = 0; x < size; x += 256) ctx.drawImage(peb, x, y);
  const n = 4;
  for (let j = 0; j < n; j++) {
    const y = j * size / n + size * 0.025, h = size / n - size * 0.05;
    ctx.fillStyle = '#e6dcc6'; ctx.fillRect(size * 0.08, y, size * 0.84, h);
    specks(ctx, 0, r, 0, 1, [], 0);
  }
  specks(ctx, size, r, 800, size / 300, ['#b9ad95'], 0.3);
  return tex(c);
}

// ---------- exterior textures, generated per pixel (fast and deterministic)
// tileable value noise: a lattice of n x n random values sampled with smooth bilinear interpolation
function field(n, seed) { const r = rng(seed), f = new Float32Array(n * n); for (let i = 0; i < f.length; i++) f[i] = r() * 2 - 1; return f; }
function sample(f, n, u, v) {
  const x = ((u % n) + n) % n, y = ((v % n) + n) % n;
  const x0 = x | 0, y0 = y | 0, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
  let tx = x - x0, ty = y - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = f[y0 * n + x0], b = f[y0 * n + x1], c = f[y1 * n + x0], d = f[y1 * n + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
// a tileable fractal noise map of N x N (computed once at low resolution, then read with bil())
function fbmMap(N, seed, cells, amps, sx = 1, sy = 1) {
  const F = cells.map((n, i) => ({ n, f: field(n, seed * 31 + i * 7 + 1), a: amps[i] }));
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const L of F) v += sample(L.f, L.n, (x / N) * L.n * sx, (y / N) * L.n * sy) * L.a;
    out[y * N + x] = v;
  }
  return { m: out, N };
}
// bilinear read of a map at texture pixel (x, y) of a W-wide texture (tileable)
function bil(M, x, y, W) {
  const N = M.N, m = M.m, u = (x / W) * N - 0.5, v = (y / W) * N - 0.5;
  const x0 = Math.floor(u), y0 = Math.floor(v), tx = u - x0, ty = v - y0;
  const xa = ((x0 % N) + N) % N, xb = (xa + 1) % N, ya = ((y0 % N) + N) % N, yb = (ya + 1) % N;
  const a = m[ya * N + xa], b = m[ya * N + xb], c = m[yb * N + xa], d = m[yb * N + xb];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
// tileable 1D fractal noise of length L
function line1D(L, seed, periods, amps) {
  const out = new Float32Array(L);
  periods.forEach((p, i) => {
    const r = rng(seed * 13 + i), v = Array.from({ length: p }, () => r() * 2 - 1);
    for (let k = 0; k < L; k++) { const t = (k / L) * p, a = Math.floor(t), f = t - a, s = f * f * (3 - 2 * f); out[k] += (v[a % p] + (v[(a + 1) % p] - v[a % p]) * s) * amps[i]; }
  });
  return out;
}
function pixels(W, H, fn) {
  const [c, x] = C(W, H), im = x.createImageData(W, H), d = im.data, o = [0, 0, 0];
  for (let y = 0, i = 0; y < H; y++) for (let xx = 0; xx < W; xx++, i += 4) { fn(xx, y, o); d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  return [c, x];
}
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// split [0,W) into pieces with lengths between a and b (fractions of W), scaled to fill exactly
function cuts(r, W, a, b) {
  const L = []; let s = 0;
  while (s < W * 0.999) { const l = W * (a + r() * (b - a)); L.push(l); s += l; }
  const k = W / s, out = [0]; let acc = 0;
  for (const l of L) { acc += l * k; out.push(acc); }
  out[out.length - 1] = W; return out;
}
// soft dots drawn with wrap-around (fossil specks, pores)
function dots(ctx, W, r, n, rad, rgb, alpha) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * W, rr = rad * (0.4 + r()), a = alpha * (0.35 + r() * 0.65);
    wrapDraw(W, x, y, rr, (px, py) => { ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; ctx.beginPath(); ctx.ellipse(px, py, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, 7); ctx.fill(); });
  }
}

// Honed cream limestone in large panels laid in running bond. Returns [colour, bump].
function stonePanels({ W = 1024, cols = 2, rows = 4, base = [229, 215, 189], seed = 501, joint = 1.5, jointCol = [186, 171, 144], vary = 0.03, bond = 0.5, cloud = 0.05, specks = 1, joints = true } = {}) {
  const C1 = fbmMap(128, seed, [3, 7, 16, 37], [0.5, 0.3, 0.14, 0.06]);
  const r = rng(seed + 3), pw = W / cols, ph = W / rows;
  const tone = []; for (let j = 0; j < rows; j++) { tone.push([]); for (let i = 0; i <= cols; i++) tone[j].push((r() - 0.5) * 2 * vary); }
  const cell = (x, y) => {
    const j = Math.floor(y / ph), fy = y - j * ph, xs = (((x - (j % 2) * bond * pw) % W) + W) % W, i = Math.floor(xs / pw), fx = xs - i * pw;
    return [j, i, Math.min(fx, pw - fx, fy, ph - fy)];
  };
  const [col, ctx] = pixels(W, W, (x, y, o) => {
    const [j, i, dj] = cell(x, y);
    if (joints && dj < joint) { o[0] = jointCol[0]; o[1] = jointCol[1]; o[2] = jointCol[2]; return; }
    let k = 1 + tone[j][i] + bil(C1, x, y, W) * cloud + (hash(x, y, seed) - 0.5) * 0.03;
    if (joints && dj < joint + 2.5) k -= (joint + 2.5 - dj) * 0.006;
    o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * (k - 0.004);
  });
  if (specks) { dots(ctx, W, rng(seed + 7), Math.round(260 * specks * W / 1024), W / 700, [150, 132, 104], 0.22); dots(ctx, W, rng(seed + 8), Math.round(90 * specks * W / 1024), W / 420, [196, 180, 150], 0.2); }
  const [bump] = pixels(W >> 1, W >> 1, (x, y, o) => {
    const [, , dj] = cell(x * 2, y * 2);
    o[0] = o[1] = o[2] = joints && dj < joint + 1 ? 40 : 205 + (hash(x, y, seed) - 0.5) * 18;
  });
  return [col, bump];
}
// Walnut-look facade panels (large HPL boards): long horizontal grain, rows of boards with staggered joints.
// Wood-decor facade panels (photos 1, 2, 9): rows of long panels with fine horizontal grain and thin dark joints, each panel a
// slightly different tone; 4 rows of 0.6 m and panels 1.2 m long, staggered, when the tile spans 2.4 m. Returns [colour, bump].
function woodPanels({ W = 1024, rows = 4, cols = 2, seed = 601, base = [124, 74, 44] } = {}) {
  const r = rng(seed), ph = W / rows, pw = W / cols, jx = [], tone = [];
  for (let j = 0; j < rows; j++) { jx.push(Math.floor(r() * pw)); tone.push(Array.from({ length: cols }, () => (r() - 0.5) * 0.16)); }
  const L = W * 4, grain = line1D(L, seed, [64, 181, 512, 1301], [0.32, 0.3, 0.22, 0.16]);
  const warp = fbmMap(64, seed + 1, [2, 5], [0.7, 0.3], 1, 2), shade = fbmMap(64, seed + 2, [3, 8], [0.6, 0.4], 1, 3);
  const cell = (x, y) => {
    const j = Math.floor(y / ph), fy = y - j * ph, xs = (((x - jx[j]) % W) + W) % W, i = Math.floor(xs / pw), fx = xs - i * pw;
    return [j, i, Math.min(fy, ph - fy, fx, pw - fx)];
  };
  const [col] = pixels(W, W, (x, y, o) => {
    const [j, i, dj] = cell(x, y);
    if (dj < 1.6) { o[0] = 40; o[1] = 26; o[2] = 18; return; }
    // follow the wavy fibres: read the 1D grain at a warped height (x 4 = sub-pixel detail)
    let yy = (y * 4 + bil(warp, x, y, W) * 70 + j * 997 + i * 431) % L; if (yy < 0) yy += L;
    const g = grain[yy | 0];
    let k = 1 + tone[j][i] + g * 0.36 + bil(shade, x, y, W) * 0.10 + (hash(x, y, seed) - 0.5) * 0.02;
    if (g < -0.3) k -= (-0.3 - g) * 0.5;
    o[0] = base[0] * k; o[1] = base[1] * k * (1 - g * 0.05); o[2] = base[2] * k * (1 - g * 0.1);
  });
  const [bump] = pixels(W >> 1, W >> 1, (x, y, o) => { const [, , dj] = cell(x * 2, y * 2); o[0] = o[1] = o[2] = dj < 2.2 ? 30 : 190; });
  return [col, bump];
}
// Wood-look porcelain planks (0.2 x 1.2 m when the tile spans 2.4 m) with pale grout.
function plankTiles({ W = 1024, rows = 12, cols = 2, seed = 701, base = [98, 72, 55], grout = [170, 160, 148], grain: ga = 0.3, toneVar = 0.14 } = {}) {
  const r = rng(seed), ph = W / rows, pw = W / cols, off = [], tone = [];
  for (let j = 0; j < rows; j++) { off.push(Math.floor(r() * 6) * pw / 6); tone.push([(r() - 0.5) * toneVar, (r() - 0.5) * toneVar, (r() - 0.5) * toneVar]); }
  const L = W * 2, grain = line1D(L, seed, [97, 263, 701], [0.45, 0.35, 0.2]), warp = fbmMap(64, seed + 1, [3, 7], [0.7, 0.3], 1, 2);
  const [col] = pixels(W, W, (x, y, o) => {
    const j = Math.floor(y / ph), fy = y - j * ph, xs = (((x - off[j]) % W) + W) % W, i = Math.floor(xs / pw), fx = xs - i * pw;
    if (Math.min(fy, ph - fy) < 1.3 || Math.min(fx, pw - fx) < 1.3) { o[0] = grout[0]; o[1] = grout[1]; o[2] = grout[2]; return; }
    let yy = (y * 2 + bil(warp, x, y, W) * 30 + i * 577) % L; if (yy < 0) yy += L;
    const k = 1 + tone[j][i] + grain[yy | 0] * ga + (hash(x, y, seed) - 0.5) * 0.035;
    o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k;
  });
  return col;
}
// Square porcelain tiles, gently mottled.
function squareTiles({ W = 512, n = 2, seed = 801, base = [150, 149, 146], joint = [112, 110, 106], cloud = 0.07 } = {}) {
  const r = rng(seed), C1 = fbmMap(96, seed, [3, 8, 21], [0.45, 0.35, 0.2]), s = W / n, tone = [];
  for (let i = 0; i < n * n; i++) tone.push((r() - 0.5) * 0.06);
  return pixels(W, W, (x, y, o) => {
    const i = Math.floor(x / s), j = Math.floor(y / s), fx = x - i * s, fy = y - j * s;
    if (Math.min(fx, s - fx, fy, s - fy) < 1.2) { o[0] = joint[0]; o[1] = joint[1]; o[2] = joint[2]; return; }
    const k = 1 + tone[j * n + i] + bil(C1, x, y, W) * cloud + (hash(x, y, seed) - 0.5) * 0.05;
    o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k;
  })[0];
}
// Dark grey stamped concrete in an irregular ashlar pattern.
function stampedConcrete({ W = 512, seed = 901, base = [88, 90, 93] } = {}) {
  const r = rng(seed), C1 = fbmMap(96, seed, [4, 11, 29], [0.4, 0.35, 0.25]);
  const rows = cuts(r, W, 0.09, 0.2), rowCuts = [], tone = [];
  for (let j = 0; j < rows.length - 1; j++) { const o = r() * W; rowCuts.push(cuts(r, W, 0.12, 0.34).map((v) => v + o)); tone.push(Array.from({ length: 12 }, () => (r() - 0.5) * 0.16)); }
  return pixels(W, W, (x, y, o) => {
    let j = 0; while (j < rows.length - 2 && y >= rows[j + 1]) j++;
    const cs = rowCuts[j], o0 = cs[0], xs = (((x - o0) % W) + W) % W + o0;
    let i = 0; while (i < cs.length - 2 && xs >= cs[i + 1]) i++;
    const d = Math.min(y - rows[j], rows[j + 1] - y, xs - cs[i], cs[i + 1] - xs), n = bil(C1, x, y, W);
    if (d < 2.2 + n * 1.5) { o[0] = base[0] * 0.6; o[1] = base[1] * 0.6; o[2] = base[2] * 0.6; return; }
    const k = 1 + tone[j][i % 12] + n * 0.18 + (hash(x, y, seed) - 0.5) * 0.08;
    o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k;
  })[0];
}
// Split-face (rock-faced) cream stone blocks. Returns [colour, bump].
function splitFace({ W = 512, rows = 8, seed = 1001, base = [216, 202, 174] } = {}) {
  const r = rng(seed), C1 = fbmMap(128, seed, [5, 13, 31, 63], [0.15, 0.25, 0.35, 0.25]), rh = W / rows, rowCuts = [], tone = [];
  for (let j = 0; j < rows; j++) { const o = r() * W; rowCuts.push(cuts(r, W, 0.14, 0.26).map((v) => v + o)); tone.push(Array.from({ length: 10 }, () => (r() - 0.5) * 0.14)); }
  const cell = (x, y) => {
    const j = Math.min(rows - 1, Math.floor(y / rh)), fy = y - j * rh, cs = rowCuts[j], o0 = cs[0], xs = (((x - o0) % W) + W) % W + o0;
    let i = 0; while (i < cs.length - 2 && xs >= cs[i + 1]) i++;
    return [j, i, Math.min(fy, rh - fy, xs - cs[i], cs[i + 1] - xs), fy / rh];
  };
  const [col] = pixels(W, W, (x, y, o) => {
    const [j, i, d, ty] = cell(x, y), n = bil(C1, x, y, W);
    if (d < 2.0 + n * 4) { o[0] = 104; o[1] = 94; o[2] = 80; return; }
    const k = 1 + tone[j][i % 10] + n * 0.34 + (0.5 - ty) * 0.14 + (hash(x, y, seed) - 0.5) * 0.1;
    o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k;
  });
  const [bump] = pixels(W >> 1, W >> 1, (x, y, o) => { const [, , d] = cell(x * 2, y * 2), n = bil(C1, x * 2, y * 2, W); o[0] = o[1] = o[2] = d < 2.6 + n * 4 ? 20 : Math.max(0, Math.min(255, 150 + n * 170)); });
  return [col, bump];
}
// Long thin split-face brick slips in mixed taupes, greys and browns with dark recessed joints (photo 7, 360° views 12_10,
// 13_11): about 0.24 x 0.067 m at the material's 1.2 m repeat. Returns [colour, bump].
function brickSlips({ W = 512, rows = 18, cols = 5, seed = 1101 } = {}) {
  const r = rng(seed), C1 = fbmMap(128, seed, [9, 23, 61], [0.3, 0.4, 0.3]), C2 = fbmMap(128, seed + 7, [31, 77], [0.6, 0.4]);
  const pal = [[150, 136, 124], [120, 112, 108], [172, 150, 130], [136, 110, 92], [156, 120, 98], [104, 98, 96], [184, 170, 152], [142, 126, 114], [126, 100, 84], [164, 140, 120]];
  const rh = W / rows, bw = W / cols, pick = [];
  for (let j = 0; j < rows; j++) { pick.push([]); for (let i = 0; i <= cols; i++) pick[j].push([pal[(r() * pal.length) | 0], 0.84 + r() * 0.28]); }
  const cell = (x, y) => { const j = Math.floor(y / rh), fy = y - j * rh, xs = (((x - (j % 2) * bw * 0.5 - (j % 3) * bw * 0.17) % W) + W) % W, i = Math.floor(xs / bw), fx = xs - i * bw; return [j, i, Math.min(fy, rh - fy), Math.min(fx, bw - fx)]; };
  const [col] = pixels(W, W, (x, y, o) => {
    const [j, i, dy, dx] = cell(x, y);
    if (dy < 1.4 || dx < 1.7) { o[0] = 92; o[1] = 85; o[2] = 78; return; }
    const [c, t] = pick[j][i], k = t * (1 + bil(C1, x, y, W) * 0.24 + bil(C2, x, y, W) * 0.12 + (hash(x, y, seed) - 0.5) * 0.18);
    o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
  });
  const [bump] = pixels(W >> 1, W >> 1, (x, y, o) => { const [, , dy, dx] = cell(x * 2, y * 2); o[0] = o[1] = o[2] = dy < 1.6 || dx < 1.9 ? 25 : 150 + bil(C1, x * 2, y * 2, W) * 60 + bil(C2, x * 2, y * 2, W) * 40; });
  return [col, bump];
}
// Terracotta barrel tiles (columns of rounded channels, courses overlapping). Returns [colour, bump].
function barrelTiles({ W = 512, cols = 8, rows = 5, seed = 1201, base = [200, 100, 60] } = {}) {
  const r = rng(seed), C1 = fbmMap(96, seed, [6, 17, 43], [0.4, 0.35, 0.25]), cw = W / cols, rh = W / rows, tone = [];
  for (let j = 0; j < rows; j++) { tone.push([]); for (let i = 0; i < cols; i++) tone[j].push((r() - 0.5) * 0.16); }
  const prof = (x, y) => {
    const i = Math.floor(x / cw), j = Math.floor(y / rh), ph = (x - i * cw) / cw, ty = (y - j * rh) / rh;
    return [i, j, Math.cos((ph - 0.5) * Math.PI * 2), ty];
  };
  const [col] = pixels(W, W, (x, y, o) => {
    const [i, j, p, ty] = prof(x, y);
    let k = 0.84 + p * 0.18 + tone[j][i] + bil(C1, x, y, W) * 0.08 + (hash(x, y, seed) - 0.5) * 0.05;
    if (ty > 0.9) k -= (ty - 0.9) * 3.2;
    else if (ty < 0.06) k += (0.06 - ty) * 2.5;
    o[0] = base[0] * k; o[1] = base[1] * k * (0.97 + p * 0.03); o[2] = base[2] * k;
  });
  const [bump] = pixels(W >> 1, W >> 1, (x, y, o) => { const [, , p, ty] = prof(x * 2, y * 2); o[0] = o[1] = o[2] = Math.max(0, Math.min(255, 128 + p * 90 - (ty > 0.9 ? (ty - 0.9) * 900 : 0))); });
  return [col, bump];
}
// Small dark glass mosaic for the spa.
function mosaicDark({ W = 256, n = 20, seed = 1301 } = {}) {
  const r = rng(seed), s = W / n, tone = [];
  for (let i = 0; i < n * n; i++) tone.push(r());
  return pixels(W, W, (x, y, o) => {
    const i = Math.floor(x / s), j = Math.floor(y / s), fx = x - i * s, fy = y - j * s;
    if (Math.min(fx, s - fx, fy, s - fy) < 1) { o[0] = 70; o[1] = 72; o[2] = 76; return; }
    const t = tone[j * n + i], v = 18 + t * 26;
    o[0] = v; o[1] = v + 2; o[2] = v + 6 + t * 8;
  })[0];
}
// laser-cut scrollwork for the gate leaves: black scrolls on a transparent ground (alpha-tested)
function scrollwork(W = 128, H = 512) {
  const [c, x] = C(W, H);
  x.clearRect(0, 0, W, H);
  x.strokeStyle = '#141414'; x.lineCap = 'round'; x.lineWidth = W * 0.085;
  const curl = (cx, cy, r, a0, dir) => {
    x.beginPath();
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = a0 + dir * t * Math.PI * 2.2, rr = r * (1 - t * 0.78); const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  };
  for (let k = 0; k < 4; k++) {
    const y = k * H / 4;
    x.beginPath(); x.moveTo(W * 0.5, y); x.bezierCurveTo(W * 0.05, y + H * 0.06, W * 0.95, y + H * 0.17, W * 0.5, y + H / 4); x.stroke();
    curl(W * 0.3, y + H * 0.075, W * 0.2, -0.4, 1);
    curl(W * 0.7, y + H * 0.175, W * 0.2, 2.7, -1);
  }
  x.lineWidth = W * 0.06; x.strokeRect(W * 0.03, -2, W * 0.94, H + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
  return t;
}
function texOf(canvas, srgb = true) { return tex(canvas, srgb); }

export function buildMaterials(renderer) {
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const std = (name, p, s = 1) => { const m = new THREE.MeshStandardMaterial(p); m.name = name; m.userData.s = s; M[name] = m; return m; };
  const phys = (name, p, s = 1) => { const m = new THREE.MeshPhysicalMaterial(p); m.name = name; m.userData.s = s; M[name] = m; return m; };

  const tMarble = marbleWhite(1024, true), tMarbleSlab = marbleWhite(512, false);
  std('marble', { map: tMarble, roughness: 0.14, metalness: 0.0, envMapIntensity: 1.1 }, 2.4);
  std('marbleSlab', { map: tMarbleSlab, roughness: 0.18, envMapIntensity: 1.0 }, 1.6);
  std('marbleBlack', { map: marbleBlack(512), roughness: 0.16, envMapIntensity: 1.2 }, 1.6);
  const tWal = walnutTex(512, false), tSlat = walnutTex(512, true);
  std('walnut', { map: tWal, roughness: 0.5 }, 1.2);
  std('walnutGloss', { map: tWal, color: 0x6b5a52, roughness: 0.16, envMapIntensity: 1.2 }, 1.2);
  std('walnutSlats', { map: tSlat, bumpMap: tSlat, bumpScale: 1.5, roughness: 0.55 }, 1.0);
  // facade stone: honed cream limestone, 1.2 x 0.6 m panels in running bond
  const [cLime, bLime] = stonePanels({ W: 1024, seed: 501 });
  std('limestone', { map: texOf(cLime), bumpMap: texOf(bLime, false), bumpScale: 1.4, roughness: 0.74 }, 2.4);
  const [cSm] = stonePanels({ W: 512, seed: 511, joints: false, vary: 0, cloud: 0.06, specks: 0.8 });
  std('limestoneSmooth', { map: texOf(cSm), roughness: 0.7 }, 1.6);
  // the tower: the same stone in larger, fainter panels
  const [cCr, bCr] = stonePanels({ W: 1024, seed: 521, base: [232, 220, 196], vary: 0.018, cloud: 0.035, joint: 1.2, jointCol: [204, 191, 166], specks: 0.6 });
  std('cream', { map: texOf(cCr), bumpMap: texOf(bCr, false), bumpScale: 0.8, roughness: 0.78 }, 3.0);
  // walnut-look facade boards
  const [cClad, bClad] = woodPanels({ W: 1024, rows: 6, cols: 1, seed: 601, base: [92, 62, 56] });   // long horizontal boards   // dark, slightly cool brown (captures FL1, F4)
  const tClad = texOf(cClad);
  std('woodClad', { map: tClad, bumpMap: texOf(bClad, false), bumpScale: 1.2, roughness: 0.42, envMapIntensity: 0.9 }, 2.4);
  std('woodStrip', { map: tClad, color: 0x6f6763, roughness: 0.5 }, 2.4);   // the gate piers' darker wood strips (capture F4)
  std('woodFloor', { map: planksTex(512, { rows: 12, cols: 2, base: [92, 62, 42], seed: 161 }), roughness: 0.45 }, 2.4);
  std('woodDeck', { map: texOf(plankTiles({ W: 1024, seed: 701 })), roughness: 0.55 }, 2.4);
  std('tileWood', { map: texOf(plankTiles({ W: 1024, rows: 8, seed: 709, base: [118, 96, 80], grout: [160, 152, 142], grain: 0.16, toneVar: 0.10 })), roughness: 0.36 }, 2.4);   // wood-look porcelain planks on the roof terrace (photo 8)
  std('pavers', { map: texOf(squareTiles({ W: 512, n: 2, seed: 181, base: [226, 213, 188], joint: [188, 175, 150], cloud: 0.06 })), roughness: 0.72 }, 1.2);
  std('tilesGray', { map: texOf(squareTiles({ W: 512, n: 2, seed: 191, base: [150, 149, 146], joint: [108, 106, 102] })), roughness: 0.62 }, 1.2);
  std('stamped', { map: texOf(stampedConcrete({ W: 512, seed: 901, base: [152, 144, 132] })), roughness: 0.8 }, 2.0);   // the driveway (captures FL1, L1): pale grey stamped concrete
  std('gravel', { map: gravelTex(512), roughness: 0.85 }, 0.8);
  std('roadConcrete', { map: plainNoise(256, '#aaa498', ['#9f998c', '#b6b0a4'], 0.35, 251), roughness: 0.9 }, 4);   // the street and the curved road: light concrete
  std('pebbles', { map: pebblesTex(512), roughness: 0.6 }, 0.8);
  std('pathSlabs', { map: pathTex(512), roughness: 0.75 }, 2.0);
  const [cRoof, bRoof] = barrelTiles({ W: 512, seed: 1201 });
  std('roofTile', { map: texOf(cRoof), bumpMap: texOf(bRoof, false), bumpScale: 3.0, roughness: 0.62 }, 1.6);
  const [cBr, bBr] = brickSlips({ W: 512, seed: 1101 });
  std('brick', { map: texOf(cBr), bumpMap: texOf(bBr, false), bumpScale: 1.5, roughness: 0.88 }, 1.2);
  const [cSf, bSf] = splitFace({ W: 512, seed: 1001 });
  std('stoneWall', { map: texOf(cSf), bumpMap: texOf(bSf, false), bumpScale: 3.0, roughness: 0.95 }, 1.6);
  std('spaMosaic', { map: texOf(mosaicDark({ W: 256, seed: 1301 })), roughness: 0.4, envMapIntensity: 0.7 }, 0.5);
  std('basalt', { map: plainNoise(256, '#2c2d30', ['#242528', '#36373a'], 0.45, 271), roughness: 0.78, envMapIntensity: 0.6 }, 0.9);   // the waterfall blocks' matte black stone (photo 6)
  std('lawn', { map: lawnTex(512), roughness: 1.0 }, 3);
  std('soil', { map: plainNoise(256, '#6b5544', ['#5a4537', '#7d6653'], 0.5, 201), roughness: 1.0 }, 2);
  std('asphalt', { map: asphaltTex(512), roughness: 0.92 }, 4);
  std('poolTile', { map: poolTileTex(256), roughness: 0.3, side: THREE.DoubleSide }, 0.5);
  std('poolBand', { map: poolTileTex(256, ['#123c55', '#1b5270', '#266785'], '#7fa6b8', 131), roughness: 0.22, side: THREE.DoubleSide }, 0.5);   // the waterline band
  std('fluted', { map: flutedTex(256, 10), color: 0xd9cdb8, roughness: 0.7 }, 0.5);
  std('stripes', { map: stripesTex(256), roughness: 0.9 }, 0.5);
  std('plaster', { color: 0xf2efe9, roughness: 0.92 });
  std('plasterWarm', { color: 0xece4d6, roughness: 0.92 });
  std('render', { map: plainNoise(256, '#e0cbab', ['#d6c09f', '#e8d5b8'], 0.18, 233), roughness: 0.9 }, 1.5);   // the stair core's beige render above the attic roof (photo 8)
  std('tileCap', { map: plainNoise(128, '#c77a55', ['#b56a48', '#d08a64'], 0.35, 241), roughness: 0.7 }, 0.6);   // terracotta cap tiles and eave ends
  std('ceiling', { color: 0xf6f4f0, roughness: 0.95 });
  std('poche', { color: 0x3b3632, roughness: 1.0 });
  std('pocheLight', { color: 0x8f877d, roughness: 1.0 });
  std('slabEdge', { color: 0xcfc4ae, roughness: 0.9 });
  std('concrete', { color: 0xb9b4ab, roughness: 0.95 });
  std('steelBlack', { color: 0x1d1e20, roughness: 0.42, metalness: 0.6 });
  std('bronze', { color: 0x6c6150, roughness: 0.35, metalness: 0.7 });
  std('champagne', { color: 0xb59f7c, roughness: 0.3, metalness: 0.75 });   // anodised frame of the roof-terrace door
  std('brass', { color: 0xb88a3e, roughness: 0.28, metalness: 1.0, envMapIntensity: 1.2 });
  std('stainless', { color: 0xc9cbcd, roughness: 0.25, metalness: 1.0 });
  std('mirror', { color: 0xdfe4e8, roughness: 0.02, metalness: 1.0, envMapIntensity: 1.4 });
  std('blackGlass', { color: 0x0d0e10, roughness: 0.06, metalness: 0.3, envMapIntensity: 1.3 });
  phys('blackGlassOut', { color: 0x0c0d0f, roughness: 0.05, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.03, reflectivity: 0.7, envMapIntensity: 2.4 });   // the outdoor kitchen's mirror-black glass (photo 5)
  std('whiteGloss', { color: 0xf3f2ef, roughness: 0.2 });
  std('quartz', { map: plainNoise(256, '#f1efea', ['#e6e3dc', '#faf9f6'], 0.25, 211), roughness: 0.25 }, 1.2);
  std('woodWhite', { color: 0xe9e4da, roughness: 0.6 });
  const glass = std('glass', { color: 0xcfe2e6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5 });
  glass.userData.noShadow = true;
  const edge = std('glassEdge', { color: 0x8fc4b2, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.6, depthWrite: false });
  edge.userData.noShadow = true;
  std('glassDark', { color: 0x23272b, roughness: 0.03, metalness: 0.55, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2.0 });   // the kitchen's driveway side (captures FL1, B8): dark glass
  std('glassTint', { color: 0x9c8f78, roughness: 0.03, metalness: 0.5, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.9 });   // the pool-side dining room's long glazing: bronze tinted (photo 5)
  const rail = std('glassRail', { color: 0xd6eaee, roughness: 0.05, metalness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  rail.userData.noShadow = true;
  // still water with a faint ripple (a bump map read by the reflections)
  const rip = fbmMap(96, 1777, [5, 11, 23], [0.55, 0.3, 0.15], 1, 1);
  const [cRip] = pixels(256, 256, (x, y, o) => { const v = Math.max(0, Math.min(255, 128 + bil(rip, x, y, 256) * 120)); o[0] = o[1] = o[2] = v; });
  const water = std('water', { color: 0x3fb6c8, roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.72, envMapIntensity: 1.6, depthWrite: false, bumpMap: texOf(cRip, false), bumpScale: 0.35 }, 2.2);
  water.userData.noShadow = true;
  std('led', { color: 0xfff1d6, emissive: 0xffe2b0, emissiveIntensity: 1.6, roughness: 0.6 });
  std('ledCool', { color: 0xffffff, emissive: 0xeef4ff, emissiveIntensity: 1.4 });
  std('ledBlue', { color: 0x6aa8ff, emissive: 0x3d7dff, emissiveIntensity: 2.0 });
  std('solar', { map: solarTex(256), roughness: 0.25, metalness: 0.4 }, 1);
  std('canopy', { color: 0xf3f0ea, roughness: 0.7 });
  std('soffitWood', { map: tClad, bumpMap: texOf(bClad, false), bumpScale: 1.0, roughness: 0.45, side: THREE.DoubleSide }, 2.4);
  const sheet = std('waterSheet', { color: 0xe8f6fb, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, emissive: 0x5a9fd6, emissiveIntensity: 0.15 });
  std('waterSheetThin', { color: 0xdff2fa, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, emissive: 0x5a9fd6, emissiveIntensity: 0.08 });   // the spa's overflow down its dark tiles
  sheet.userData.noShadow = true;
  std('downlight', { color: 0x141516, roughness: 0.5, metalness: 0.3 });
  std('whiteDouble', { color: 0xeeede8, roughness: 0.45, side: THREE.DoubleSide });
  std('roofDeck', { map: texOf(squareTiles({ W: 256, n: 2, seed: 1401, base: [176, 172, 164], joint: [140, 136, 128], cloud: 0.08 })), roughness: 0.85 }, 1.0);
  const orn = scrollwork(); orn.repeat.set(1, 0.25);
  const ornM = std('ornament', { map: orn, color: 0xffffff, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }, 0.17);
  ornM.userData.noShadow = false;
  std('hedgeBase', { color: 0x5d6b3d, roughness: 1 });
  std('ground', { map: plainNoise(256, '#a8ab86', ['#9a9e7a', '#b6b893'], 0.45, 221), roughness: 1 }, 6);   // dry hillside grass
  std('frameDark', { color: 0x3a3a3a, roughness: 0.5, metalness: 0.4 });
  std('doorWalnut', { map: tWal, roughness: 0.45 }, 1.2);
  std('doorWhite', { color: 0xe7e2d8, roughness: 0.6 });
  return M;
}
