import { routeCdn } from './cdn.mjs';
// Headless browser run: loads the built page with a mocked artifact runtime, drives the main
// flows and writes screenshots to tests/out/.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from './pw.mjs';

const ROOT = path.resolve('dist'), OUT = path.resolve('tests/out');
fs.mkdirSync(OUT, { recursive: true });
const blobs = new Map();
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u.startsWith('/_blob/')) { const b = blobs.get(u.slice(7)); if (!b) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': b.type }); return res.end(b.buf); }
  const f = path.join(ROOT, u === '/' ? 'test.html' : u);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const mock = `
(() => {
  const docs = new Map(), subs = new Set();
  const snap = (path) => { const d = docs.get(path); return { id: path.split('/').pop(), exists: !!d, data: () => d && JSON.parse(JSON.stringify(d)), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const notify = () => setTimeout(() => { for (const s of subs) s(); }, 5);
  const col = (cp) => {
    let ord = null, lim = 1000;
    const q = {
      path: cp,
      doc: (id) => ref(cp + '/' + (id || Math.random().toString(36).slice(2, 10))),
      add: async (data) => { const r = ref(cp + '/' + Math.random().toString(36).slice(2, 10)); await r.set(data); return r; },
      orderBy: (f, dir) => { ord = [f, dir]; return q; }, limit: (n) => { lim = n; return q; }, where: () => q,
      get: async () => { let list = [...docs.keys()].filter((k) => k.startsWith(cp + '/') && k.split('/').length === cp.split('/').length + 1).map(snap);
        if (ord) list.sort((a, b) => String(a.data()[ord[0]]).localeCompare(String(b.data()[ord[0]])) * (ord[1] === 'desc' ? -1 : 1));
        list = list.slice(0, lim); return { docs: list, size: list.length, empty: !list.length, docChanges: () => [], metadata: {} }; },
      onSnapshot: (next) => { const f = async () => next(await q.get()); subs.add(f); f(); return () => subs.delete(f); },
    };
    return q;
  };
  const ref = (p) => ({ id: p.split('/').pop(), path: p,
    get: async () => snap(p), set: async (d) => { window.__dbWrites = (window.__dbWrites || 0) + 1; docs.set(p, JSON.parse(JSON.stringify(d))); notify(); },
    update: async (d) => { if (!docs.has(p)) throw { code: 'invalid_argument' }; docs.set(p, { ...docs.get(p), ...d }); notify(); },
    delete: async () => { docs.delete(p); notify(); },
    onSnapshot: (next) => { const f = () => next(snap(p)); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
    collection: (c) => col(p + '/' + c) });
  const db = { doc: ref, collection: col };
  const assets = { upload: async (blob, o) => { const id = Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32); const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); }); await window.__putBlob(id, b64, (o && o.type) || blob.type); return { id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: (o && o.type) || blob.type }; }, list: async () => ({ assets: [], usage: {} }), delete: async () => ({ deleted: true }) };
  const downloads = { save: async ({ filename, data }) => { window.__downloads = (window.__downloads || []).concat([{ filename, size: data.size || data.length }]); return { status: 'saved' }; } };
  const user = { isOwner: async () => true, canEdit: async () => true, can: async () => true, id: async () => 'u1' };
  window.__mockDocs = docs;
  window.claude = { use: (n) => new Promise((r) => setTimeout(() => r({ db, assets, downloads, user }[n] || null), 120)) };
})();`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
async function run(name, { width = 1440, height = 900, withClaude = true, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  ctx.setDefaultTimeout(240000);   // software WebGL on a small machine can take a while per frame
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.exposeFunction('__putBlob', (id, b64, type) => { blobs.set(id, { buf: Buffer.from(b64, 'base64'), type }); });
  if (withClaude) await page.addInitScript(mock);
  await routeCdn(page);
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__villa && window.__villa.items && window.__villa.items.size > 0 && !document.getElementById('boot'), null, { timeout: 120000 });
  console.log(`[${name}] ready in ${Date.now() - t0} ms, items ${await page.evaluate(() => window.__villa.items.size)}`);
  return { ctx, page, errors };
}
const shot = async (page, f) => { await page.waitForTimeout(1300); await page.screenshot({ path: path.join(OUT, f), timeout: 240000 }); console.log('  shot', f); };
const settle = (page, ms = 1200) => page.waitForTimeout(ms);

try {
  // ---------------------------------------------------------------- desktop, with the artifact runtime mocked
  const { page, errors } = await run('desktop');
  await shot(page, '01-outside.png');
  for (const v of ['gf', 'ff', 'b1', 'at']) {
    await page.click(`.views [data-v="${v}"]`);
    await shot(page, `02-${v}.png`);
  }
  await page.click('.views [data-v="gf"]'); await settle(page);
  // select the tufted sofa through the item list
  await page.click('.tabs [data-t="house"]'); await settle(page, 400);
  const sofaRow = page.locator('.hrow', { hasText: 'Tufted sofa' }).first();
  await sofaRow.click(); await settle(page, 1200);
  console.log('  selected:', await page.evaluate(() => window.__villa.selected), 'inspector visible:', await page.isVisible('.inspector'));
  await shot(page, '03-selected.png');
  // drag the selected item on the canvas
  const before = await page.evaluate(() => { const a = window.__villa, r = a.items.get(a.selected); return { x: r.x, z: r.z }; });
  const scr = await page.evaluate(() => { const a = window.__villa, r = a.items.get(a.selected); const THREE = a.stage.camera.constructor; const v = a.items.obj(a.selected).position.clone(); v.y += 0.4; v.project(a.stage.camera); const c = a.stage.canvas.getBoundingClientRect(); return { x: c.left + (v.x + 1) / 2 * c.width, y: c.top + (1 - v.y) / 2 * c.height }; });
  await page.mouse.move(scr.x, scr.y); await page.mouse.down(); await page.mouse.move(scr.x + 40, scr.y + 10, { steps: 6 }); await page.mouse.move(scr.x + 90, scr.y + 30, { steps: 6 }); await page.mouse.up();
  const after = await page.evaluate(() => { const a = window.__villa, r = a.items.get(a.selected); return { x: r.x, z: r.z, undo: a.history.undo.length }; });
  console.log('  drag moved:', before, '->', after);
  await page.keyboard.press('Control+z'); await settle(page, 300);
  console.log('  after undo:', await page.evaluate(() => { const a = window.__villa, r = a.items.get(a.selected); return { x: r.x, z: r.z }; }));
  // inspector edits: width, colour via API, rotation
  await page.fill('.inspector .nf input.w', '300'); await page.press('.inspector .nf input.w', 'Enter'); await settle(page, 300);
  console.log('  size after edit:', await page.evaluate(() => JSON.stringify(window.__villa.items.get(window.__villa.selected).p)));
  await page.click('.inspector [aria-label="Turn 90 degrees clockwise"]'); await settle(page, 300);
  await shot(page, '04-edited.png');
  // add a catalog item (Lounge chair) and duplicate it
  await page.click('.tabs [data-t="catalog"]'); await settle(page, 300);
  await page.fill('.searchbox input', 'lounge'); await settle(page, 300);
  await page.locator('.card', { hasText: 'Lounge chair' }).first().click(); await settle(page, 800);
  console.log('  added:', await page.evaluate(() => { const a = window.__villa, r = a.items.get(a.selected); return r && { type: r.type, floor: r.floor, x: +r.x.toFixed(2), y: r.y, z: +r.z.toFixed(2) }; }));
  await page.keyboard.press('Control+d'); await settle(page, 400);
  await shot(page, '05-added.png');
  // replace the velvet sofa with the lounge chair
  await page.evaluate(() => { const a = window.__villa; const s = a.items.list().find((r) => r.name === 'Velvet sofa'); a.select(s.id); });
  await settle(page, 300);
  await page.click('.inspector .act:has-text("Replace")'); await settle(page, 300);
  await page.locator('.card', { hasText: 'Lounge chair' }).first().click(); await settle(page, 600);
  console.log('  replaced, selected type:', await page.evaluate(() => window.__villa.items.get(window.__villa.selected)?.type));
  // import a GLB made on the fly (a little chair) through the file input
  const glbB64 = await page.evaluate(async () => {
    const a = window.__villa;
    const THREE = { Group: a.items.root.constructor };
    return null;
  });
  void glbB64;
  await page.click('.tabs [data-t="mine"]'); await settle(page, 300);
  const glbPath = path.resolve('tests/fixtures/chair.glb');
  if (fs.existsSync(glbPath)) {
    await page.setInputFiles('.dropzone ~ input[type=file], section[data-tab="mine"] input[type=file]:not([accept="image/*"])', glbPath);
    await page.waitForSelector('.modal .imp', { timeout: 20000 }); await settle(page, 1500);
    await page.screenshot({ path: path.join(OUT, '06-import-dialog.png') });
    await page.fill('.modal .dims input[aria-label="W"]', '84'); await settle(page, 200);
    await page.click('.modal .btn.primary'); await settle(page, 2500);
    console.log('  imported:', await page.evaluate(() => { const a = window.__villa, r = a.items.get(a.selected); const m = a.models.get(r.model); return { type: r.type, p: r.p, meta: m && { name: m.meta.name, shared: m.meta.shared, asset: !!m.meta.asset, status: m.status } }; }));
    await shot(page, '07-imported.png');
  } else console.log('  (no GLB fixture)');
  // photo import
  const photo = path.resolve('tests/fixtures/lamp.png');
  if (fs.existsSync(photo)) {
    await page.setInputFiles('section[data-tab="mine"] input[accept="image/*"]', photo);
    await page.waitForSelector('.modal .imp', { timeout: 20000 }); await settle(page, 800);
    await page.screenshot({ path: path.join(OUT, '08-photo-dialog.png') });
    await page.click('.modal .btn.primary'); await settle(page, 2000);
    console.log('  photo item:', await page.evaluate(() => { const a = window.__villa, r = a.items.get(a.selected); return r && { type: r.type, p: r.p, photo: r.photo }; }));
    await shot(page, '09-photo-placed.png');
  }
  // zipped glTF with external .bin and texture
  const zip = path.resolve('tests/fixtures/table.zip');
  if (fs.existsSync(zip)) {
    await page.setInputFiles('section[data-tab="mine"] input[type=file]:not([accept="image/*"])', zip);
    await page.waitForSelector('.modal .imp', { timeout: 20000 }); await settle(page, 1200);
    console.log('  zip dialog title:', await page.textContent('.modal h2'), '| native:', await page.textContent('.modal .imp-form .fine'));
    await page.click('.modal .btn.primary'); await settle(page, 2500);
    console.log('  zip model:', await page.evaluate(() => { const a = window.__villa, r = a.items.get(a.selected); const m = a.models.get(r.model); let maps = 0; m.template.traverse((o) => { if (o.isMesh && o.material.map) maps++; }); return { name: m.meta.name, p: r.p, maps, shared: m.meta.shared }; }));
    await shot(page, '09b-zip.png');
  }
  // menu: save a copy, list, open
  await page.click('button[aria-label="More options"]'); await settle(page, 200);
  await page.click('.menu .mi:has-text("Save a copy")'); await settle(page, 300);
  await page.fill('.modal .field input', 'Test layout A'); await page.click('.modal .btn.primary'); await settle(page, 600);
  await page.click('button[aria-label="More options"]'); await settle(page, 200);
  await page.click('.menu .mi:has-text("Open a saved layout")'); await settle(page, 800);
  console.log('  saved rows:', await page.locator('.modal .srow').count(), await page.textContent('.modal .srow .n').catch(() => ''));
  await page.click('.modal .srow .btn'); await settle(page, 800);
  console.log('  after open: items', await page.evaluate(() => window.__villa.items.size));
  // reset to original, then undo
  await page.click('button[aria-label="More options"]'); await settle(page, 200);
  await page.click('.menu .mi:has-text("Back to the original")'); await settle(page, 300);
  await page.click('.modal .btn.danger'); await settle(page, 800);
  const nReset = await page.evaluate(() => window.__villa.items.size);
  await page.keyboard.press('Control+z'); await settle(page, 600);
  console.log('  reset ->', nReset, 'items; undo ->', await page.evaluate(() => window.__villa.items.size));
  // export layout json
  await page.click('button[aria-label="More options"]'); await settle(page, 200);
  await page.click('.menu .mi:has-text("Export layout")'); await settle(page, 600);
  // walk mode
  await page.click('.views [data-v="gf"]'); await settle(page, 400);
  await page.evaluate(() => window.__villa.select(null));
  await page.click('.tb:has-text("Walk"), button[title="Walk through at eye level"]'); await settle(page, 1500);
  await shot(page, '10-walk-gf.png');
  await page.keyboard.down('w'); await page.waitForTimeout(900); await page.keyboard.up('w');
  await shot(page, '11-walk-moved.png');
  await page.keyboard.press('Escape'); await settle(page, 1200);
  // measure tool
  await page.keyboard.press('m'); await settle(page, 300);
  const c = await page.evaluate(() => { const r = window.__villa.stage.canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(c.x - 120, c.y); await page.mouse.move(c.x + 120, c.y + 20, { steps: 4 }); await page.mouse.click(c.x + 120, c.y + 20);
  await shot(page, '12-measure.png');
  await page.keyboard.press('Escape');
  // save status, screenshot download, export
  await page.click('button[aria-label="Save a picture"]'); await settle(page, 1500);
  console.log('  downloads:', JSON.stringify(await page.evaluate(() => window.__downloads)));
  console.log('  db writes:', await page.evaluate(() => window.__dbWrites), 'docs:', await page.evaluate(() => [...window.__mockDocs.keys()].join(', ')));
  console.log('  status:', await page.textContent('.status .t'));
  // reload: layout and imported model must come back from the (mock) store
  const docsDump = await page.evaluate(() => JSON.stringify([...window.__mockDocs.entries()]));
  fs.writeFileSync(path.join(OUT, 'docs.json'), docsDump);
  console.log('  errors:', errors.length ? '\n    ' + errors.slice(0, 30).join('\n    ') : 'none');
  await page.context().close();

  // ---------------------------------------------------------------- reload with stored data
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  ctx2.setDefaultTimeout(240000);
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('console', (m) => { if (m.type() === 'error') errs2.push(m.text()); });
  p2.on('pageerror', (e) => errs2.push('pageerror: ' + e.message));
  await p2.exposeFunction('__putBlob', (id, b64, type) => { blobs.set(id, { buf: Buffer.from(b64, 'base64'), type }); });
  await p2.addInitScript(mock.replace('window.__mockDocs = docs;', `window.__mockDocs = docs; for (const [k, v] of ${docsDump}) docs.set(k, v);`));
  await routeCdn(p2);
  await p2.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p2.waitForFunction(() => window.__villa && window.__villa.items && window.__villa.items.size > 0 && !document.getElementById('boot'), null, { timeout: 120000 });
  await p2.waitForTimeout(4000);
  console.log('[reload] items', await p2.evaluate(() => window.__villa.items.size), 'models', await p2.evaluate(() => window.__villa.models.all().map((m) => m.meta.name + ':' + m.status).join(', ')));
  await p2.click('.views [data-v="gf"]'); await p2.waitForTimeout(1500);
  await p2.screenshot({ path: path.join(OUT, '13-reloaded.png') });
  console.log('  reload errors:', errs2.length ? errs2.join('\n    ') : 'none');
  await ctx2.close();

  // ---------------------------------------------------------------- dark theme
  {
    const d = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
    d.setDefaultTimeout(240000);
    const dp = await d.newPage();
    await routeCdn(dp);
    await dp.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await dp.waitForFunction(() => window.__villa && window.__villa.items && window.__villa.items.size > 0 && !document.getElementById('boot'), null, { timeout: 120000 });
    await dp.click('.views [data-v="ff"]'); await dp.waitForTimeout(800);
    await dp.evaluate(() => { const a = window.__villa; const r = a.items.list().find((x) => x.type === 'bedPlatform'); a.select(r.id); });
    await dp.waitForTimeout(1500);
    await dp.screenshot({ path: path.join(OUT, '15-dark.png') });
    await d.close();
  }
  // ---------------------------------------------------------------- phone, no runtime (plain page)
  const m = await run('phone', { width: 390, height: 844, withClaude: false, mobile: true });
  await shot(m.page, '20-phone.png');
  await m.page.click('.tb.add'); await settle(m.page, 800);
  await shot(m.page, '21-phone-library.png');
  await m.page.locator('.card', { hasText: 'Sofa' }).first().click(); await settle(m.page, 900);
  await shot(m.page, '22-phone-selected.png');
  console.log('  phone status:', await m.page.textContent('.status .t'));
  console.log('  phone errors:', m.errors.length ? m.errors.join('\n    ') : 'none');
  await m.ctx.close();
} catch (e) {
  console.error('TEST FAILED', e);
} finally {
  await browser.close(); server.close();
}
