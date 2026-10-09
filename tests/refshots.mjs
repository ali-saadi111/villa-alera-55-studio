// Render the model from cameras that approximate the exterior reference images.
// usage: node tests/refshots.mjs <prefix> [names,comma,separated] [--dusk]
import { routeCdn } from './cdn.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { chromium } from './pw.mjs';
const prefix = process.argv[2] || 'now';
const only = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3].split(',') : null;
const OUT = path.resolve('tests/out/ref'); fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.startsWith('/textures/')) { const f = path.join('dist', u); if (!fs.existsSync(f) || process.env.NOTEX) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': u.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream' }); return r.end(fs.readFileSync(f)); }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync('dist/test.html'));
});
await new Promise((r) => server.listen(0, r));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-accelerated-2d-canvas'] });
const p = await b.newPage({ viewport: { width: 1254, height: 706 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await routeCdn(p);
await p.goto('http://localhost:' + server.address().port + '/');
await p.waitForFunction(() => window.__villa?.timings?.firstFrames, null, { timeout: 180000 });
await p.waitForFunction(() => window.__villa?.timings?.sky !== undefined, null, { timeout: 120000 }).catch(() => console.log('no sky/textures event'));
console.log('timings', JSON.stringify(await p.evaluate(() => window.__villa.timings)));
await p.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas.gl { visibility: visible !important; }' });
const views = JSON.parse(fs.readFileSync(path.resolve(process.env.VIEWS || 'tests/refviews.json'), 'utf8'));
const dusk = process.argv.includes('--dusk');
for (const v of views) {
  if (only && !only.includes(v.name)) continue;
  const t0 = Date.now();
  await p.evaluate(({ v, dusk }) => {
    const a = window.__villa, st = a.stage;
    a.ui.setLibrary && a.ui.setLibrary(false);
    if (a.state.walk) a.setWalk(false);
    a.applyView(v.view || 'outside', { instant: true });
    if (a.setLight) a.setLight(v.dusk || dusk ? 'dusk' : 'day');
    st.tween = null;
    const cam = st.camera, h = st.container.clientHeight || innerHeight;
    // photos keep verticals vertical: a level camera whose frame is shifted up (a shift lens) when v.shift is set
    const level = v.shift !== undefined;
    st.controls.maxPolarAngle = Math.PI * 0.999;
    cam.fov = v.fov || 55; cam.position.set(...v.pos);
    st.controls.target.set(v.target[0], level ? v.pos[1] : v.target[1], v.target[2]);
    st.controls.update();
    st.insetTarget = st.inset = 0; st.insetYTarget = st.insetY = level ? -2 * v.shift * h : 0;
    st._applyView(); cam.updateProjectionMatrix();
    st.dirty(true);
  }, { v, dusk });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, `${prefix}-${v.name}.png`) });
  console.log('shot', v.name, Date.now() - t0, 'ms');
}
console.log('errors', errors.length ? errors.join('\n') : 'none');
await b.close(); server.close();
