// Dump selected material textures to PNG for inspection.
import { routeCdn } from './cdn.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { chromium } from './pw.mjs';
const names = (process.argv[2] || 'limestone,limestoneSmooth,cream,woodClad,woodDeck,pavers,tilesGray,stamped,roofTile,brick,stoneWall,spaMosaic').split(',');
const OUT = path.resolve('tests/out/tex'); fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.startsWith('/textures/')) { const f = path.join('dist', u); if (!fs.existsSync(f) || process.env.NOTEX) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': u.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream' }); return r.end(fs.readFileSync(f)); }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync('dist/test.html'));
});
await new Promise((r) => server.listen(0, r));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await routeCdn(p);
await p.goto('http://localhost:' + server.address().port + '/');
await p.waitForFunction(() => window.__villa?.timings?.firstFrames, null, { timeout: 180000 });
const t = await p.evaluate(() => window.__villa.timings);
console.log('timings', JSON.stringify(t));
const out = await p.evaluate((names) => {
  const found = {};
  window.__villa.stage.scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && names.includes(m.name) && !found[m.name]) found[m.name] = m; });
  const res = {};
  for (const n of names) { const m = found[n]; if (!m || !m.map) { res[n] = null; continue; } const c = m.map.image; res[n] = c.toDataURL ? c.toDataURL('image/png') : null; }
  return res;
}, names);
for (const [n, url] of Object.entries(out)) { if (!url) { console.log('missing', n); continue; } fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(url.split(',')[1], 'base64')); }
console.log('errors', errors.length ? errors.join('\n') : 'none');
await b.close(); server.close();
