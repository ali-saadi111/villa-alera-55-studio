import http from 'http'; import fs from 'fs';
import { chromium } from './pw.mjs';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const r = await p.evaluate(() => {
  const out = {};
  const C = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  let t = performance.now();
  { const [c, x] = C(512, 256); x.font = 'italic 600 120px cursive'; x.shadowColor = '#ff4fd8'; x.shadowBlur = 28; x.fillStyle = '#ffd2f6'; for (let i = 0; i < 3; i++) x.fillText('Heaven', 256, 132); x.getImageData(0,0,1,1); }
  out.neon = performance.now() - t; t = performance.now();
  { const [c, x] = C(512); for (let i = 0; i < 14000; i++) { x.fillStyle = i % 2 ? 'rgba(180,110,125,0.18)' : 'rgba(255,230,236,0.25)'; x.fillRect(Math.random() * 512, Math.random() * 512, 3, 5); } x.getImageData(0,0,1,1); }
  out.rug14k = performance.now() - t; t = performance.now();
  { const [c, x] = C(256); for (let i = 0; i < 9000; i++) { x.fillStyle = 'rgba(0,0,0,0.035)'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 1); } x.getImageData(0,0,1,1); }
  out.weave9k = performance.now() - t; t = performance.now();
  { const [c, x] = C(512); const n = 4, s = 128; for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) { const cx = i * s, cy = j * s; const g = x.createRadialGradient(cx, cy, 2, cx, cy, s * 0.62); g.addColorStop(0, '#fff'); g.addColorStop(1, '#aaa'); x.fillStyle = g; x.beginPath(); x.moveTo(cx, cy - s / 2); x.lineTo(cx + s / 2, cy); x.lineTo(cx, cy + s / 2); x.lineTo(cx - s / 2, cy); x.closePath(); x.fill(); } x.getImageData(0,0,1,1); }
  out.tuft = performance.now() - t;
  return out;
});
console.log(r);
await b.close();
