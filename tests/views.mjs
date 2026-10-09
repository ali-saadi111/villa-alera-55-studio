import { routeCdn } from './cdn.mjs';
// Eye-level checks of the furnished rooms.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { chromium } from './pw.mjs';
const OUT = path.resolve('tests/out/views'); fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.startsWith('/textures/')) { const f = path.join('dist', u); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200); return r.end(fs.readFileSync(f)); }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync('dist/test.html'));
});
await new Promise((r) => server.listen(0, r));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-accelerated-2d-canvas'] });
const p = await b.newPage({ viewport: { width: 1200, height: 760 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await routeCdn(p);
await p.goto('http://localhost:' + server.address().port + '/');
await p.waitForFunction(() => window.__villa?.timings?.firstFrames, null, { timeout: 120000 });
await p.waitForFunction(() => window.__villa?.timings?.sky !== undefined, null, { timeout: 120000 }).catch(() => {});
await p.evaluate(() => { const a = window.__villa; a.ui.setLibrary(false); });
const W = (u, v) => { const ox = 2.2, oz = 5.39, c = Math.cos(0.0925), s = Math.sin(0.0925); return [ox + u * c - v * s, oz - u * s - v * c]; };
const LV = { b1: -3.4, gf: 0, ff: 3.91, at: 7.48 }, GL = -3.42;
const spots = process.argv[2] ? JSON.parse(process.argv[2]) : [
  ['salon', 'gf', [-2.3, 2.7], [-5.6, -0.6], 1.55],
  ['dining', 'gf', [-6.2, 1.9], [-2.6, 4.6], 1.6],
  ['kitchen', 'gf', W(1.2, 0.9), W(4.2, 5.2), 1.6],
  ['guestwc', 'gf', W(2.0, 6.35), W(3.0, 7.6), 1.55],
  ['entrance', 'gf', [-0.2, -4.5], [0.9, -2.2], 1.6],
  ['kidsroom', 'ff', W(4.6, 1.0), W(0.4, 3.8), 1.5],
  ['kidsroom2', 'ff', W(1.4, 1.8), W(4.4, 5.6), 1.5],
  ['landing', 'ff', [0.8, -1.9], [-1.7, -4.4], 1.6],
  ['garden', 'site', W(4.6, -5.8), W(7.4, -1.8), GL + 1.6],
  ['pool', 'site', W(3.2, 0.2), W(6.2, 9.2), GL + 1.6],
  ['terrace', 'site', W(0.6, 12.4), W(3.4, 14.2), 1.6],
];
for (const [name, f, pos, look, eye] of spots) {
  const y = f === 'site' ? eye : LV[f] + eye;
  await p.evaluate(({ f, pos, look, y }) => {
    const a = window.__villa;
    if (f !== 'site') a.state.view = f;
    if (!a.state.walk) a.setWalk(true); else a.applyView(null);
    const w = a.editor.walk, cam = a.stage.camera;
    a.stage.tween = null;
    cam.position.set(pos[0], y, pos[1]);
    w.yaw = Math.atan2(-(look[0] - pos[0]), -(look[1] - pos[1])); w.pitch = -0.18; w.apply();
  }, { f, pos, look, y });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('shot', name);
}
console.log('errors', errors.length ? errors.join('\n') : 'none');
await b.close(); server.close();
