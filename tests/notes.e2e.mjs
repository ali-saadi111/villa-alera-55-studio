// Headless run of the Notes tool: draw circles on a view, write the change, add reference pictures
// (file picker, paste, drop), save to the (mock) shared store, go back to the view, comment, mark done,
// edit, delete, walk-mode notes, reload, this-browser-only mode and the phone layout.
import { routeCdn } from './cdn.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from './pw.mjs';

const ROOT = path.resolve('dist'), OUT = path.resolve('tests/out/notes');
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

const mock = (seed = '[]') => `
(() => {
  const docs = new Map(${seed}), subs = new Set();
  const snap = (path) => { const d = docs.get(path); return { id: path.split('/').pop(), exists: !!d, data: () => d && JSON.parse(JSON.stringify(d)), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const notify = () => setTimeout(() => { for (const s of subs) s(); }, 5);
  const col = (cp) => {
    let lim = 1000;
    const q = {
      path: cp,
      doc: (id) => ref(cp + '/' + (id || Math.random().toString(36).slice(2, 10))),
      add: async (data) => { const r = ref(cp + '/' + Math.random().toString(36).slice(2, 10)); await r.set(data); return r; },
      orderBy: () => q, limit: (n) => { lim = n; return q; }, where: () => q,
      get: async () => { const list = [...docs.keys()].filter((k) => k.startsWith(cp + '/') && k.split('/').length === cp.split('/').length + 1).map(snap).slice(0, lim); return { docs: list, size: list.length, empty: !list.length, docChanges: () => [], metadata: {} }; },
      onSnapshot: (next) => { const f = async () => next(await q.get()); subs.add(f); f(); return () => subs.delete(f); },
    };
    return q;
  };
  const ref = (p) => ({ id: p.split('/').pop(), path: p,
    get: async () => snap(p),
    set: async (d) => { window.__dbWrites = (window.__dbWrites || 0) + 1; docs.set(p, JSON.parse(JSON.stringify(d))); notify(); },
    update: async (d) => { if (!docs.has(p)) throw { code: 'invalid_argument' }; window.__dbUpdates = (window.__dbUpdates || 0) + 1; docs.set(p, { ...docs.get(p), ...JSON.parse(JSON.stringify(d)) }); notify(); },
    delete: async () => { docs.delete(p); notify(); },
    onSnapshot: (next) => { const f = () => next(snap(p)); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
    collection: (c) => col(p + '/' + c) });
  const db = { doc: ref, collection: col };
  const assets = {
    upload: async (blob, o) => { const id = Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32); const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); }); await window.__putBlob(id, b64, (o && o.type) || blob.type); window.__uploads = (window.__uploads || []).concat([{ id, type: (o && o.type) || blob.type, size: blob.size }]); return { id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: (o && o.type) || blob.type }; },
    list: async () => ({ assets: [], usage: {} }),
    delete: async (id) => { window.__assetDeletes = (window.__assetDeletes || []).concat([id]); await window.__dropBlob(id); return { deleted: true }; },
  };
  const downloads = { save: async () => ({ status: 'saved' }) };
  const user = { isOwner: async () => true, canEdit: async () => true, can: async () => true, id: async () => 'u_owner' };
  window.__mockDocs = docs;
  window.claude = { use: (n) => new Promise((r) => setTimeout(() => r({ db, assets, downloads, user }[n] || null), 120)) };
})();`;

let fails = 0;
const check = (label, ok, detail = '') => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
async function open(name, { width = 1440, height = 900, withClaude = true, mobile = false, seed, colorScheme, ctx } = {}) {
  ctx = ctx || await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, colorScheme });
  ctx.setDefaultTimeout(240000);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.exposeFunction('__putBlob', (id, b64, type) => { blobs.set(id, { buf: Buffer.from(b64, 'base64'), type }); });
  await page.exposeFunction('__dropBlob', (id) => { blobs.delete(id); });
  if (withClaude) await page.addInitScript(mock(seed));
  await routeCdn(page);
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__villa && window.__villa.items && window.__villa.items.size > 0 && window.__villa.notes && !document.getElementById('boot'), null, { timeout: 180000 });
  await page.waitForFunction(() => !window.__villa.stage.tween && window.__villa.notes.loaded, null, { timeout: 60000 });
  console.log(`[${name}] ready in ${Date.now() - t0} ms`);
  return { ctx, page, errors };
}
const wait = (page, ms) => page.waitForTimeout(ms);
// software WebGL renders a frame every second or so here, so the panels' slide is skipped rather than waited out
const snapInset = (page) => page.evaluate(() => { const s = window.__villa.stage; s.inset = s.insetTarget; s.insetY = s.insetYTarget; s._applyView(); });
const idle = async (page) => {
  await snapInset(page);
  await page.waitForFunction(() => !window.__villa.stage.tween, null, { timeout: 120000 });
  await snapInset(page);
  await wait(page, 400);
};
const shot = async (page, f) => { await wait(page, 900); await page.screenshot({ path: path.join(OUT, f), timeout: 240000 }); console.log('  shot', f); };
const state = (page) => page.evaluate(() => { const n = window.__villa.notes; n._drawInk(); n._placePins(); return { open: n.open, page: n.page, busy: n.busy, drawing: n.drawing, circles: n.ed ? n.ed.circles.length : null, ink: n._inkN, list: n.list.length, pins: n.pins.length, walk: window.__villa.state.walk, view: window.__villa.state.view }; });
const marksOnScreen = (page, which = 'cur') => page.evaluate((w) => { const n = window.__villa.notes, c = w === 'ed' ? n.ed.circles : n.cur.circles; return n._screen(c).map((m) => [Math.round(m.x), Math.round(m.y), Math.round(m.rx), Math.round(m.ry)]); }, which);
const near = (a, b, tol = 2) => a.length === b.length && a.every((m, i) => m.every((v, j) => Math.abs(v - b[i][j]) <= tol));
const docs = (page) => page.evaluate(() => [...window.__mockDocs.entries()].filter(([k]) => k.startsWith('notes/')).map(([k, v]) => ({ id: k.slice(6), ...v })));
async function dragCircle(page, x0, y0, x1, y1, shift = false) {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(x0, y0); await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 3 }); await page.mouse.move(x1, y1, { steps: 3 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}
async function pasteImage(page, label) {
  await page.evaluate(async (t) => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 300;
    const g = c.getContext('2d'); g.fillStyle = '#2f6f5e'; g.fillRect(0, 0, 480, 300); g.fillStyle = '#fff'; g.font = '48px sans-serif'; g.fillText(t, 40, 170);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'image.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, label);
}
async function dropImage(page, label) {
  await page.evaluate(async (t) => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 400;
    const g = c.getContext('2d'); g.fillStyle = '#8a5a3c'; g.fillRect(0, 0, 400, 400); g.fillStyle = '#fff'; g.font = '44px sans-serif'; g.fillText(t, 30, 210);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'dropped-wood.jpg', { type: 'image/jpeg' }));
    const root = document.getElementById('app');
    root.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    root.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, label);
}

let docsDump = '[]';
try {
  // ================================================================ desktop, shared store
  {
    const { page, errors } = await open('desktop');
    const W = await page.evaluate(() => { const r = window.__villa.stage.canvas.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    check('canvas fills the window', W.x === 0 && W.y === 0 && W.w === 1440, W);
    check('Notes button in the toolbar', await page.isVisible('.notes-btn'));
    await page.click('.notes-btn'); await wait(page, 600);
    check('panel opens with the empty list', await page.isVisible('.notes.panel') && (await page.textContent('.notes .np-body')).includes('No notes yet'));
    await idle(page);
    await page.click('.notes .np-new'); await idle(page);
    let s = await state(page);
    check('Mark up starts drawing', s.busy && s.drawing, s);
    check('hint explains drawing', (await page.textContent('.hint')).startsWith('Drag to circle'));
    // an oval, a Shift circle and a click
    await dragCircle(page, 420, 380, 600, 470);
    await dragCircle(page, 700, 300, 780, 340, true);
    await page.mouse.click(820, 520); await wait(page, 300);
    s = await state(page);
    check('three marks drawn', s.circles === 3, s);
    const drawn = await marksOnScreen(page, 'ed');
    check('marks sit where they were drawn', near(drawn, [[510, 425, 90, 45], [740, 340, 40, 40], [820, 520, 34, 34]]), drawn);
    // undo with Ctrl+Z, then redraw the click
    await page.keyboard.press('Control+z'); await wait(page, 200);
    check('Ctrl+Z takes back the last mark', (await state(page)).circles === 2);
    check('…and leaves the layout history alone', await page.evaluate(() => window.__villa.history.undo.length === 0));
    await page.mouse.click(820, 520); await wait(page, 300);
    await shot(page, '01-drawing.png');
    // the comment and three kinds of reference picture
    await page.fill('.notes .ntext-in', 'Make these two piers 30 cm taller and darker, like the reference.\nThe planter should be stone, not render.');
    await page.setInputFiles('.notes input[type=file]', [path.resolve('tests/fixtures/reference.jpg'), path.resolve('tests/fixtures/lamp.png')]);
    await page.waitForFunction(() => window.__villa.notes.ed.images.length === 2, null, { timeout: 20000 });
    await pasteImage(page, 'pasted'); await page.waitForFunction(() => window.__villa.notes.ed.images.length === 3, null, { timeout: 20000 }).catch(() => {});
    check('pasted picture added', await page.evaluate(() => window.__villa.notes.ed.images.length) === 3);
    await dropImage(page, 'dropped'); await page.waitForFunction(() => window.__villa.notes.ed.images.length === 4, null, { timeout: 20000 }).catch(() => {});
    const names = await page.evaluate(() => window.__villa.notes.ed.images.map((i) => i.name));
    check('dropped picture added to the note (not imported as furniture)', names.length === 4 && names[3] === 'dropped-wood.jpg' && !(await page.isVisible('.modal')), names);
    check('picture tiles shown', await page.locator('.notes .nimg:not(.add)').count() === 4);
    await shot(page, '02-form.png');
    // save
    await page.click('.notes .np-foot .btn.primary');
    await page.waitForFunction(() => window.__villa.notes.page === 'note', null, { timeout: 60000 });
    await wait(page, 800);
    let d = await docs(page);
    const n1 = d[0];
    check('one note stored in the db', d.length === 1, d.map((x) => x.id));
    check('note fields', n1 && n1.n === 1 && n1.status === 'open' && n1.circles.length === 3 && n1.text.startsWith('Make these') && n1.by === 'u_owner' && n1.cam && n1.cam.view === 'outside',
      n1 && { n: n1.n, status: n1.status, circles: n1.circles.length, by: n1.by, cam: n1.cam });
    check('snapshot stored as an asset', !!(n1 && n1.shot && n1.shot.asset && blobs.has(n1.shot.asset) && blobs.get(n1.shot.asset).type === 'image/jpeg'), n1 && n1.shot);
    check('four reference pictures stored as assets', !!(n1 && n1.images.length === 4 && n1.images.every((r) => r.asset && blobs.has(r.asset))), n1 && n1.images.map((r) => [r.name, r.asset && blobs.get(r.asset)?.type, r.w, r.h]));
    check('pin anchor found in the model', !!(n1 && Array.isArray(n1.anchor)), n1 && n1.anchor);
    s = await state(page);
    check('note page shows the marks', s.page === 'note' && s.ink === 3, s);
    const saved = await marksOnScreen(page);
    check('saved marks still where drawn', near(saved, [[510, 425, 90, 45], [740, 340, 40, 40], [820, 520, 34, 34]]), saved);
    check('badge counts one open note', (await page.textContent('.notes-btn .nbadge')) === '1');
    await shot(page, '03-saved.png');
    // move away: marks hide; come back: they line up again
    await page.mouse.move(700, 650); await page.mouse.down(); await page.mouse.move(790, 610, { steps: 6 }); await page.mouse.up();
    await idle(page); await wait(page, 800);
    s = await state(page);
    check('marks hidden on another view', s.ink === 0, s);
    await shot(page, '04-moved.png');
    await page.click('.notes .nwhere .btn'); await idle(page); await wait(page, 400);
    s = await state(page);
    const back = await marksOnScreen(page);
    check('Show the marked view brings them back in place', s.ink === 3 && near(back, saved, 1.5), back);
    // a comment, then done
    await page.fill('.notes .nreply-in', 'Also check the gate posts.');
    await page.click('.notes .nreply .tb'); await wait(page, 500);
    d = await docs(page);
    check('comment stored', d[0].replies && d[0].replies.length === 1 && d[0].replies[0].text === 'Also check the gate posts.' && d[0].replies[0].uid === 'u_owner', d[0].replies);
    await page.click('.notes .nacts .act:has-text("Mark as done")'); await wait(page, 500);
    d = await docs(page);
    check('marked done', d[0].status === 'done' && !!d[0].doneAt);
    check('badge hidden with nothing open', await page.isHidden('.notes-btn .nbadge'));
    // a reply from Claude arrives through the store
    await page.evaluate((id) => { const m = window.__mockDocs, k = 'notes/' + id, v = m.get(k); v.replies = [...v.replies, { id: 'r-claude', by: 'claude', text: 'Done: piers raised to 2.55 m, darker wood strip.', at: new Date().toISOString() }]; window.claude.use('db').then((db) => db.doc(k).update({ replies: v.replies })); }, n1.id);
    await wait(page, 800);
    check('Claude’s reply shows in the thread', (await page.locator('.notes .nrep.claude').count()) === 1);
    await shot(page, '05-thread.png');
    // the list, filters and pins
    await page.click('.notes .link.back'); await wait(page, 500);
    check('open filter hides the done note', (await page.locator('.notes .nrow').count()) === 0);
    await page.click('.notes .np-filter .seg-b:has-text("All")'); await wait(page, 600);
    check('all filter lists it', (await page.locator('.notes .nrow').count()) === 1);
    check('pin shown for it', (await state(page)).pins === 1 && await page.isVisible('.npin'));
    await shot(page, '06-list.png');
    await page.click('.npin'); await idle(page); await wait(page, 500);
    check('pin opens the note', (await state(page)).page === 'note');
    // edit: new text, drop a picture, reopen
    await page.click('.notes .nacts .act:has-text("Edit")'); await idle(page); await wait(page, 400);
    s = await state(page);
    check('edit opens with the marks in place', s.busy && !s.drawing && s.circles === 3 && s.ink === 3, s);
    const removedAsset = await page.evaluate(() => window.__villa.notes.ed.images[1].ref.asset);
    await page.locator('.notes .nimg-x').nth(1).click(); await wait(page, 200);
    await page.fill('.notes .ntext-in', 'Make the two piers 30 cm taller and darker.');
    await page.click('.notes .np-foot .btn.primary');
    await page.waitForFunction(() => window.__villa.notes.page === 'note', null, { timeout: 60000 }); await wait(page, 600);
    d = await docs(page);
    check('edit saved: text and 3 pictures', d[0].text === 'Make the two piers 30 cm taller and darker.' && d[0].images.length === 3 && d[0].shot.asset === n1.shot.asset, { text: d[0].text, imgs: d[0].images.length });
    check('removed picture deleted from the asset store', (await page.evaluate(() => window.__assetDeletes || [])).includes(removedAsset) && !blobs.has(removedAsset));
    await page.click('.notes .nacts .act:has-text("Reopen")'); await wait(page, 400);
    check('reopened', (await docs(page))[0].status === 'open');
    // Esc on a fresh, empty note backs out; with a mark it stops drawing, then asks before discarding
    await page.click('.notes .link.back'); await wait(page, 300);
    await page.keyboard.press('n'); await wait(page, 300);
    check('N starts a note', (await state(page)).drawing);
    await page.keyboard.press('Escape'); await wait(page, 300);
    check('Esc on an empty note backs out', (await state(page)).page === 'list');
    await page.keyboard.press('n'); await wait(page, 300);
    await dragCircle(page, 500, 400, 640, 480);
    await page.keyboard.press('Escape'); await wait(page, 300);
    s = await state(page);
    check('Esc with a mark stops drawing', s.busy && !s.drawing && s.circles === 1, s);
    // moving to another floor while drawing: the marks wait on their view
    await page.click('button:has-text("Draw more")'); await wait(page, 200);
    await page.click('.views [data-v="ff"]'); await idle(page); await wait(page, 600);
    s = await state(page);
    check('a floor tab stops drawing and hides the marks', s.busy && !s.drawing && s.ink === 0 && (await page.textContent('.notes .ndraw')).includes('on another view'), s);
    await shot(page, '07-away.png');
    await page.click('.notes .ndraw button:has-text("Back to the marked view")'); await idle(page); await wait(page, 500);
    s = await state(page);
    check('Back to the marked view', s.view === 'outside' && s.ink === 1, s);
    await page.keyboard.press('Escape'); await wait(page, 400);
    check('Esc asks before discarding', await page.isVisible('.modal') && (await page.textContent('.modal h2')).includes('Discard'));
    await page.click('.modal .btn.danger'); await wait(page, 400);
    check('discarded', (await state(page)).page === 'list' && (await docs(page)).length === 1);
    // a note made while walking
    await page.click('.notes .tb.x'); await wait(page, 300);
    await page.click('.views [data-v="gf"]'); await idle(page);
    await page.click('button[title="Walk through at eye level"]'); await idle(page); await wait(page, 600);
    await page.keyboard.down('d'); await wait(page, 500); await page.keyboard.up('d');
    await page.keyboard.press('n'); await idle(page);
    await page.keyboard.down('w'); await wait(page, 400); await page.keyboard.up('w');
    const moved = await page.evaluate(() => window.__villa.notes.atPose(window.__villa.notes.ed.cam));
    check('walk keys do nothing while drawing', moved);
    await dragCircle(page, 560, 420, 760, 560);
    await page.fill('.notes .ntext-in', 'Hall: swap this rug for the round one.');
    await page.click('.notes .np-foot .btn.primary');
    await page.waitForFunction(() => window.__villa.notes.page === 'note', null, { timeout: 60000 }); await wait(page, 500);
    d = await docs(page);
    const wn = d.find((x) => x.n === 2);
    check('walk note stored with its walk camera', !!(wn && wn.cam.walk && wn.cam.view === 'gf' && wn.circles.length === 1), wn && wn.cam);
    await idle(page);
    const wMarks = await marksOnScreen(page);
    await shot(page, '08-walk-note.png');
    await page.keyboard.press('Escape'); await wait(page, 300);
    await page.keyboard.press('Escape'); await idle(page); await wait(page, 500);
    check('left walk mode', !(await state(page)).walk);
    await page.click('.notes-btn'); await wait(page, 400);
    await page.locator('.notes .nrow', { hasText: 'Hall: swap' }).click();
    await idle(page); await wait(page, 700);
    s = await state(page);
    const wBack = await marksOnScreen(page);
    check('opening a walk note walks back to the spot', s.walk && s.view === 'gf' && s.ink === 1 && near(wBack, wMarks, 2), { s, wBack, wMarks });
    // delete it
    await page.click('.notes .nacts .act.danger'); await wait(page, 300);
    await page.click('.modal .btn.danger'); await wait(page, 600);
    d = await docs(page);
    check('deleted, with its pictures', d.length === 1 && !d.some((x) => x.n === 2) && !blobs.has(wn.shot.asset));
    docsDump = await page.evaluate(() => JSON.stringify([...window.__mockDocs.entries()]));
    fs.writeFileSync(path.join(OUT, 'docs.json'), docsDump);
    fs.writeFileSync(path.join(OUT, 'blobs.json'), JSON.stringify([...blobs.entries()].map(([k, v]) => [k, v.type, v.buf.toString('base64')])));
    console.log('  db writes', await page.evaluate(() => window.__dbWrites), 'updates', await page.evaluate(() => window.__dbUpdates), 'uploads', (await page.evaluate(() => window.__uploads || [])).length);
    check('no console errors', !errors.length, errors.slice(0, 12).join('\n    '));
    await page.context().close();
  }

  // ================================================================ reload: the note comes back from the store
  {
    const { page, errors } = await open('reload', { width: 1280, height: 800, seed: docsDump });
    await page.click('.notes-btn'); await wait(page, 500);
    check('note listed after reload', (await page.locator('.notes .nrow').count()) === 1);
    await page.waitForFunction(() => { const i = document.querySelector('.notes .nthumb img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 20000 }).catch(() => {});
    check('its picture loads from the store', await page.evaluate(() => { const i = document.querySelector('.notes .nthumb img'); return !!(i && i.naturalWidth > 0); }));
    await page.click('.notes .nrow'); await idle(page); await wait(page, 600);
    check('opens at its view with the marks', (await state(page)).ink === 3);
    await page.locator('.notes .nimg-b').first().click(); await wait(page, 2500);   // the dialog fades in on the next painted frame
    check('a reference opens full size', await page.isVisible('.modal .lb-img') && await page.evaluate(() => document.querySelector('.modal .lb-img').naturalWidth > 0));
    await shot(page, '09-lightbox.png');
    await page.keyboard.press('ArrowRight'); await wait(page, 200);
    check('arrow keys page through', (await page.textContent('.modal .lb-cap')).includes('2 of 3'));
    await page.keyboard.press('Escape'); await wait(page, 300);
    check('no console errors', !errors.length, errors.slice(0, 12).join('\n    '));
    await page.context().close();
  }

  // ================================================================ dark theme
  {
    const { page } = await open('dark', { width: 1280, height: 800, seed: docsDump, colorScheme: 'dark' });
    await page.click('.notes-btn'); await wait(page, 400);
    await page.click('.notes .nrow'); await idle(page);
    await shot(page, '10-dark-note.png');
    await page.click('.notes .nacts .act:has-text("Edit")'); await idle(page);
    await shot(page, '11-dark-edit.png');
    await page.context().close();
  }

  // ================================================================ no shared store: notes stay in this browser
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    let { page, errors } = await open('local', { withClaude: false, ctx });
    await page.click('.notes-btn'); await wait(page, 400);
    check('says notes stay in this browser', (await page.textContent('.notes .np-body')).includes('stay in this browser'));
    await page.click('.notes .np-new'); await idle(page);
    await dragCircle(page, 400, 380, 560, 460);
    await page.fill('.notes .ntext-in', 'Local note');
    await page.setInputFiles('.notes input[type=file]', [path.resolve('tests/fixtures/reference.jpg')]);
    await page.waitForFunction(() => window.__villa.notes.ed.images.length === 1, null, { timeout: 20000 });
    await page.click('.notes .np-foot .btn.primary');
    await page.waitForFunction(() => window.__villa.notes.page === 'note', null, { timeout: 60000 });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('villa-alera-55/notes') || '[]'));
    check('kept in localStorage with local picture keys', stored.length === 1 && stored[0].shot.local && stored[0].images[0].local, stored[0] && { shot: stored[0].shot, img: stored[0].images[0] });
    check('no console errors', !errors.length, errors.slice(0, 12).join('\n    '));
    await page.close();
    ({ page, errors } = await open('local-reload', { withClaude: false, ctx }));
    await page.click('.notes-btn'); await wait(page, 600);
    await page.waitForFunction(() => { const i = document.querySelector('.notes .nthumb img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 20000 }).catch(() => {});
    check('local note and picture come back after reload', (await page.locator('.notes .nrow').count()) === 1 && await page.evaluate(() => { const i = document.querySelector('.notes .nthumb img'); return !!(i && i.naturalWidth > 0); }));
    check('no console errors', !errors.length, errors.slice(0, 12).join('\n    '));
    await ctx.close();
  }

  // ================================================================ phone
  {
    const { page, errors } = await open('phone', { width: 390, height: 844, mobile: true, seed: docsDump });
    check('Notes button fits the phone toolbar', await page.isVisible('.notes-btn'));
    await page.click('.notes-btn'); await wait(page, 500);
    await shot(page, '12-phone-list.png');
    await page.click('.notes .np-new'); await idle(page);
    const hSheet = await page.evaluate(() => document.querySelector('.notes').getBoundingClientRect().height);
    check('sheet folds down while drawing', hSheet < 260, hSheet);
    await page.touchscreen.tap(200, 300); await wait(page, 300);
    await dragCircle(page, 120, 200, 260, 280);
    check('touch tap and drag both mark', (await state(page)).circles === 2);
    await shot(page, '13-phone-drawing.png');
    await page.click('.notes .ndraw button:has-text("Done")'); await wait(page, 500);
    check('Done unfolds the form', await page.isVisible('.notes .ntext-in'));
    await page.fill('.notes .ntext-in', 'From the phone: lighter stone here.');
    await shot(page, '14-phone-form.png');
    await page.click('.notes .np-foot .btn.primary');
    await page.waitForFunction(() => window.__villa.notes.page === 'note', null, { timeout: 60000 }); await wait(page, 500);
    await shot(page, '15-phone-note.png');
    check('phone note saved', (await docs(page)).some((x) => x.text === 'From the phone: lighter stone here.'));
    check('no console errors', !errors.length, errors.slice(0, 12).join('\n    '));
    await page.context().close();
  }
} catch (e) {
  fails++;
  console.error('TEST FAILED', e);
} finally {
  console.log(fails ? `\n${fails} check(s) failed` : '\nall notes checks passed');
  await browser.close(); server.close();
}
