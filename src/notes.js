// Notes: circle something on a view of the model, say what should change, attach reference pictures.
// A note remembers the camera it was drawn from. Its circles are stored as directions from that camera
// (and their sizes as angles), so they land on the same spot whenever the view goes back there, whatever
// the window size. Notes live in the page's shared store (collection "notes", pictures as assets), or in
// this browser when that isn't available.
import * as THREE from 'three';
import { h, icon } from './ui.js';
import { loadImage, drawScaled, canvasBlob, IMAGE_EXT, ext } from './importer.js';
import { uid } from './util.js';

const INK = '#ff5a36';
const VIEW_NAMES = { outside: 'Outside', b1: 'Basement', gf: 'Ground floor', ff: 'First floor', at: 'Attic' };
const SVGNS = 'http://www.w3.org/2000/svg';
const TAP_R = 34;            // a click or tap without a drag rings the spot with a circle this big (px)
const MAX_PICS = 12;
const touch = matchMedia('(pointer: coarse)').matches;
const svg = (tag, attrs = {}) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
export const isImageFile = (f) => !!f && ((f.type || '').startsWith('image/') || IMAGE_EXT.includes(ext(f.name || '')));
const when = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
const r6 = (v) => +v.toFixed(6);
const viewName = (cam) => (cam ? (cam.walk ? 'Walk · ' : '') + (VIEW_NAMES[cam.view] || cam.view || '') : '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const newestFirst = (a, b) => (b.n || 0) - (a.n || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

export class Notes {
  constructor(app) {
    this.app = app; this.ui = app.ui; this.store = app.store;
    this.list = []; this.loaded = false; this.myId = null;
    this.open = false; this.page = 'list'; this.cur = null; this.ed = null; this.filter = 'open';
    this.drag = null; this.replyDraft = null; this._inkN = 0; this._pinsDirty = true; this.pins = [];
    this._buildButton(); this._buildPanel(); this._buildInk(); this._buildPins();
    app.stage.renderHooks.push(() => { this._drawInk(); this._placePins(); });
    // pictures pasted while a note is being written go into the note (before anything else sees the paste)
    window.addEventListener('paste', (e) => {
      if (!this.busy) return;
      const files = [...(e.clipboardData?.files || [])].filter(isImageFile);
      if (!files.length) return;
      e.preventDefault(); e.stopPropagation();
      this.addImages(files);
    }, true);
    app.on('select', (id) => {
      if (!id || !this.open) return;
      if (this.busy) queueMicrotask(() => app.select(null));   // while a note is written the view is only for looking
      else this.setOpen(false);
    });
    app.on('view', () => { this._pinsDirty = true; app.stage.dirty(); });
    app.on('walk', () => { this._pinsDirty = true; app.stage.dirty(); });
    app.on('store', () => { this._sync(); this._render(); });
    this.store.ready.then(() => this._load());
  }
  get busy() { return this.open && this.page === 'edit' && !!this.ed; }
  get drawing() { return this.busy && !!this.ed.drawing; }
  get writable() { return this.store.mode !== 'readonly'; }
  get openCount() { return this.list.filter((n) => n.status !== 'done').length; }
  get hint() {
    if (!this.busy) return null;
    const e = this.ed, esc = touch ? '' : ' · Esc cancels the note';
    if (e.drawing) return touch ? 'Drag to circle what should change · tap to ring a spot' : 'Drag to circle what should change · Shift keeps it round · click to ring a spot · Esc when done';
    if (!e.circles.length) return 'Move the view to frame it, then press Draw here' + esc;
    if (e.here === false) return 'The marks are on another view — Back to the marked view shows them' + esc;
    return 'Look around freely — the marks stay with the view they were drawn on' + esc;
  }

  // ------------------------------------------------------------ loading and live updates
  async _load() {
    let list = [];
    try { list = await this.store.listNotes(); } catch (e) { /* none yet */ }
    this.loaded = true;
    this._setList(list);
    this.store.watchNotes((l) => this._setList(l));
    this.myId = await this.store.userId();
  }
  _setList(list) {
    this.list = (list || []).filter((n) => n && n.id).sort(newestFirst);
    if (this.cur) {
      const fresh = this.list.find((n) => n.id === this.cur.id);
      if (fresh) this.cur = fresh; else { this.cur = null; if (this.page === 'note') this.page = 'list'; }
    }
    // pictures kept in this browser come back as object URLs
    for (const n of this.list) for (const ref of [n.shot, ...(n.images || [])]) {
      if (ref && ref.local && !this.store.noteImageUrl(ref)) this.store.ensureNoteImage(ref).then((u) => { if (u && !this.busy) this._render(); });
    }
    this._pinsDirty = true; this._sync();
    if (!this.busy) this._render();
    this.app.stage.dirty();
  }
  _localPatch(id, patch) {
    const i = this.list.findIndex((x) => x.id === id); if (i < 0) return;
    this.list[i] = { ...this.list[i], ...patch };
    if (this.cur && this.cur.id === id) this.cur = this.list[i];
    this._pinsDirty = true; this._sync(); if (!this.busy) this._render(); this.app.stage.dirty();
  }

  // ------------------------------------------------------------ toolbar button and panel
  _buildButton() {
    this.badge = h('span', { class: 'nbadge', hidden: true });
    this.btn = h('button', { class: 'tb notes-btn', title: 'Notes: circle what should change (N)', 'aria-label': 'Notes', 'aria-pressed': 'false', onclick: () => this.setOpen(!this.open) },
      icon('note'), h('span', { class: 'lbl' }, 'Notes'), this.badge);
    this.ui.btnMeasure.before(this.btn);
  }
  _buildPanel() {
    this.title = h('h2', { class: 'np-t' }, 'Notes');
    this.body = h('div', { class: 'np-body' });
    this.foot = h('div', { class: 'np-foot', hidden: true });
    this.fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (ev) => { const f = [...ev.target.files]; ev.target.value = ''; if (f.length) this.addImages(f); } });
    this.panel = h('aside', { class: 'notes panel', 'aria-label': 'Notes', hidden: true },
      h('div', { class: 'np-head' }, this.title, h('button', { class: 'tb icon x', title: 'Close', 'aria-label': 'Close notes', onclick: () => this.setOpen(false) }, icon('x'))),
      this.body, this.foot, this.fileIn);
    this.ui.root.append(this.panel);
  }
  _sync() {
    const n = this.openCount;
    this.badge.textContent = n; this.badge.hidden = !n;
    this.btn.classList.toggle('on', this.open); this.btn.setAttribute('aria-pressed', String(this.open));
    const R = this.ui.root;
    R.classList.toggle('notes-open', this.open);
    R.classList.toggle('note-edit', this.busy);
    R.classList.toggle('note-draw', this.drawing);
    this.ink.classList.toggle('draw', this.drawing);
    this.ui._hintText();
    this.ui._inset();
  }
  setOpen(on) {
    if (on === this.open) return;
    if (!on && this.busy) { this.cancelEdit(); if (this.busy) return; }
    this.open = on; this.panel.hidden = !on;
    if (on) {
      const app = this.app;
      app.select(null);
      if (app.editor.measure.active) app.editor.measure.toggle(false);
      if (this.ui.narrow) this.ui.setLibrary(false);
    } else if (this.page === 'note') { this.page = 'list'; this.cur = null; }   // it opens on the list next time
    this._pinsDirty = true; this._render(); this._sync(); this._drawInk(); this.app.stage.dirty();
  }
  escape() {
    if (!this.open) return false;
    if (this.busy) {
      const e = this.ed;
      if (e.drawing && (e.circles.length || !e.isNew || e.text.trim() || e.images.length)) this.stopDrawing();
      else this.cancelEdit();
      return true;
    }
    this.setOpen(false);
    return true;
  }
  _render() {
    if (!this.open) return;
    this.foot.hidden = true; this.foot.replaceChildren();
    if (this.page === 'edit' && this.ed) this._renderEdit();
    else if (this.page === 'note' && this.cur) this._renderNote();
    else { this.page = 'list'; this._renderList(); }
    this.ui._inset();
  }

  // ------------------------------------------------------------ the list
  _renderList() {
    this.title.textContent = 'Notes';
    const W = this.writable, out = [];
    if (W) out.push(h('button', { class: 'btn primary np-new', onclick: () => this.startNew() }, icon('mark'), 'Mark up this view'));
    out.push(h('p', { class: 'fine np-intro' }, W
      ? 'Frame the spot in the 3D view, press Mark up, circle what should change, then describe it and add reference pictures.'
      : 'View only — notes can be read here but not added.'));
    if (this.loaded && this.store.mode === 'local') out.push(h('p', { class: 'np-warn' }, 'The shared store isn’t available here, so notes stay in this browser and Claude can’t read them.'));
    else if (this.loaded && W) out.push(h('p', { class: 'fine np-intro' }, 'Notes are saved with the villa, so Claude can read them and make the changes.'));
    if (!this.loaded) { out.push(h('div', { class: 'loading-row' }, h('i', { class: 'spin' }), 'Loading notes…')); this.body.replaceChildren(...out); return; }
    const counts = { open: this.openCount, done: this.list.length - this.openCount, all: this.list.length };
    if (this.list.length) {
      out.push(h('div', { class: 'seg small np-filter', role: 'group', 'aria-label': 'Show' }, [['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([k, l]) =>
        h('button', { class: 'seg-b' + (this.filter === k ? ' on' : ''), 'aria-pressed': String(this.filter === k), onclick: () => { this.filter = k; this._pinsDirty = true; this._render(); this.app.stage.dirty(); } }, l, h('span', { class: 'sc' }, counts[k])))));
    }
    const shown = this.list.filter((n) => this.filter === 'all' || (this.filter === 'done' ? n.status === 'done' : n.status !== 'done'));
    if (!shown.length) out.push(h('p', { class: 'empty' }, !this.list.length ? 'No notes yet.' : this.filter === 'done' ? 'Nothing is marked done yet.' : 'No open notes.'));
    out.push(h('div', { class: 'nlist' }, shown.map((n) => {
      const url = this.store.noteImageUrl(n.shot), meta = [];
      if ((n.circles || []).length) meta.push(h('span', {}, icon('mark'), n.circles.length));
      if ((n.images || []).length) meta.push(h('span', {}, icon('image'), n.images.length));
      if ((n.replies || []).length) meta.push(h('span', {}, icon('note'), n.replies.length));
      if (n.status === 'done') meta.push(h('span', { class: 'chipd' }, icon('check'), 'Done'));
      return h('button', { class: 'nrow' + (n.status === 'done' ? ' done' : ''), onclick: () => this.openNote(n.id) },
        h('span', { class: 'nthumb' }, url ? this._img(url, '') : icon('mark')),
        h('span', { class: 'nrow-b' },
          h('span', { class: 'nrow-h' }, h('b', {}, '#' + n.n), h('span', { class: 'v' }, viewName(n.cam)), h('span', { class: 'd' }, when(n.createdAt))),
          h('span', { class: 'nrow-t' + ((n.text || '').trim() ? '' : ' muted') }, (n.text || '').trim() || 'No comment'),
          meta.length ? h('span', { class: 'nrow-m' }, meta) : null));
    })));
    this.body.replaceChildren(...out);
  }

  // ------------------------------------------------------------ one note
  openNote(id) {
    const n = this.list.find((x) => x.id === id); if (!n) return;
    if (this.busy) return;
    this.cur = n; this.page = 'note';
    if (!this.open) this.setOpen(true); else { this._pinsDirty = true; this._render(); }
    this.goTo(n.cam);
  }
  backToList() { this.page = 'list'; this.cur = null; this._pinsDirty = true; this._render(); this._drawInk(); this.app.stage.dirty(); }
  _renderNote() {
    const n = this.cur, W = this.writable, myId = this.myId;
    this.title.textContent = 'Note #' + n.n;
    const typing = document.activeElement && document.activeElement.classList.contains('nreply-in');
    const out = [
      h('div', { class: 'np-nav' },
        h('button', { class: 'link back', onclick: () => this.backToList() }, icon('back'), 'All notes'),
        h('span', { class: 'chip-st ' + (n.status === 'done' ? 'done' : 'open') }, n.status === 'done' ? 'Done' : 'Open')),
      h('div', { class: 'nwhere' }, h('span', {}, viewName(n.cam), ' · ', when(n.createdAt)),
        h('button', { class: 'btn sm', onclick: () => this.goTo(n.cam) }, icon('target'), 'Show the marked view')),
      h('div', { class: 'ntext' }, (n.text || '').trim() || h('span', { class: 'muted' }, 'No comment.')),
    ];
    if (W) out.push(h('div', { class: 'nacts' },
      h('button', { class: 'act', onclick: () => this.openEditor(n) }, icon('edit'), 'Edit'),
      h('button', { class: 'act', onclick: () => this.setStatus(n, n.status === 'done' ? 'open' : 'done') }, icon(n.status === 'done' ? 'undo' : 'check'), n.status === 'done' ? 'Reopen' : 'Mark as done'),
      h('button', { class: 'act danger', title: 'Delete this note', 'aria-label': 'Delete this note', onclick: () => this.confirmDelete(n) }, icon('trash'))));
    const pics = n.images || [];
    if (pics.length) out.push(h('div', { class: 'nsec' }, h('div', { class: 'sh' }, 'Reference pictures', h('span', {}, pics.length)),
      h('div', { class: 'nimgs' }, pics.map((ref, i) => this._thumb(ref, () => this.lightbox(pics, i, `Note #${n.n} — reference`))))));
    if (n.shot) out.push(h('div', { class: 'nsec' }, h('div', { class: 'sh' }, 'As marked'),
      h('button', { class: 'nshot', title: 'Open the picture', onclick: () => this.lightbox([n.shot], 0, `Note #${n.n} — as marked`) },
        this._img(this.store.noteImageUrl(n.shot), 'The view with the marks, as it was when the note was made'))));
    const who = (r) => (r.by === 'claude' ? 'Claude' : r.uid && myId && r.uid !== myId ? 'Someone else' : 'You');
    const reps = (n.replies || []).map((r) => h('div', { class: 'nrep' + (r.by === 'claude' ? ' claude' : '') },
      h('div', { class: 'nrep-h' }, h('b', {}, who(r)), h('span', {}, when(r.at))), h('div', { class: 'nrep-t' }, r.text)));
    let replyBox = null, replyIn = null;
    if (W) {
      const send = async () => {
        const t = replyIn.value.trim(); if (!t) return;
        const replies = [...(n.replies || []), { id: uid('r'), by: 'you', uid: this.myId || null, text: t, at: new Date().toISOString() }];
        replyIn.disabled = true;
        try {
          await this.store.patchNote(n.id, { replies, updatedAt: new Date().toISOString() });
          this.replyDraft = null; this._localPatch(n.id, { replies });
        } catch (e) { replyIn.disabled = false; this.ui.toast('Couldn’t add the comment: ' + (e && e.message || e), { error: true }); }
      };
      replyIn = h('textarea', { class: 'nreply-in', rows: 2, placeholder: 'Add a comment…', 'aria-label': 'Add a comment',
        oninput: (e) => { this.replyDraft = { id: n.id, text: e.target.value }; },
        onkeydown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } } });
      if (this.replyDraft && this.replyDraft.id === n.id) replyIn.value = this.replyDraft.text;
      replyBox = h('div', { class: 'nreply' }, replyIn, h('button', { class: 'tb icon', title: 'Add the comment (Ctrl+Enter)', 'aria-label': 'Add the comment', onclick: send }, icon('send')));
    }
    if (reps.length || replyBox) out.push(h('div', { class: 'nsec' }, h('div', { class: 'sh' }, 'Comments', reps.length ? h('span', {}, reps.length) : null), ...reps, replyBox));
    this.body.replaceChildren(...out);
    if (typing && replyIn) { replyIn.focus(); replyIn.setSelectionRange(replyIn.value.length, replyIn.value.length); }
  }
  async setStatus(n, status) {
    const now = new Date().toISOString(), patch = { status, updatedAt: now, doneAt: status === 'done' ? now : null };
    try { await this.store.patchNote(n.id, patch); this._localPatch(n.id, patch); this.ui.toast(status === 'done' ? `Note #${n.n} marked done` : `Note #${n.n} reopened`); }
    catch (e) { this.ui.toast('Couldn’t change it: ' + (e && e.message || e), { error: true }); }
  }
  confirmDelete(n) {
    this.ui.modal(`Delete note #${n.n}?`, h('p', {}, 'Its marks, comment and pictures go too. This can’t be undone.'), [
      { label: 'Cancel', run: (c) => c() },
      { label: 'Delete', danger: true, run: async (c) => {
        c();
        try {
          await this.store.deleteNote(n);
          this.list = this.list.filter((x) => x.id !== n.id);
          if (this.cur && this.cur.id === n.id) { this.cur = null; this.page = 'list'; }
          this._pinsDirty = true; this._sync(); this._render(); this._drawInk(); this.app.stage.dirty();
          this.ui.toast(`Note #${n.n} deleted`);
        } catch (e) { this.ui.toast('Couldn’t delete it: ' + (e && e.message || e), { error: true }); }
      } },
    ]);
  }
  // one decoded <img> per stored picture, reused when the panel redraws so pictures don't flash
  _img(url, alt = '') {
    if (!url || url.startsWith('blob:')) { const el = h('img', { alt }); if (url) el.src = url; return el; }
    const C = this._imgs || (this._imgs = new Map());
    let el = C.get(url);
    if (!el) { el = h('img', { alt, src: url, decoding: 'async' }); C.set(url, el); if (C.size > 120) C.delete(C.keys().next().value); }
    else el.alt = alt;
    return el;
  }
  _thumb(ref, onclick, onremove) {
    const url = ref.url || this.store.noteImageUrl(ref);
    const img = this._img(url, ref.name || 'Reference picture');
    if (!url && ref.local) this.store.ensureNoteImage(ref).then((u) => { if (u) img.src = u; });
    return h('span', { class: 'nimg' },
      h('button', { class: 'nimg-b', title: ref.name || 'Open the picture', onclick }, img),
      onremove ? h('button', { class: 'nimg-x', title: 'Remove', 'aria-label': 'Remove ' + (ref.name || 'the picture'), onclick: onremove }, icon('x')) : null);
  }
  lightbox(refs, i, title) {
    const img = h('img', { class: 'lb-img', alt: '' }), cap = h('div', { class: 'lb-cap' });
    const show = () => {
      const r = refs[i];
      img.src = r.url || this.store.noteImageUrl(r) || '';
      img.alt = r.name || title;
      cap.textContent = [r.name, refs.length > 1 ? `${i + 1} of ${refs.length}` : ''].filter(Boolean).join(' · ');
    };
    const step = (d) => { i = (i + d + refs.length) % refs.length; show(); };
    const nav = refs.length > 1 ? [
      h('button', { class: 'lb-nav prev', 'aria-label': 'Previous picture', onclick: () => step(-1) }, icon('back')),
      h('button', { class: 'lb-nav next', 'aria-label': 'Next picture', onclick: () => step(1) }, icon('next'))] : [];
    const keys = (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); } };
    show();
    if (refs.length > 1) document.addEventListener('keydown', keys, true);
    this.ui.modal(title, h('div', { class: 'lb' }, h('div', { class: 'lb-frame' }, img, ...nav), cap), [], { wide: true, onClose: () => document.removeEventListener('keydown', keys, true) });
  }

  // ------------------------------------------------------------ the camera a note belongs to
  // stop the orbit's glide so "this view" means the picture on screen now
  _settle() {
    const c = this.app.stage.controls;
    if (!c || !c.enabled) return;
    if (c._sphericalDelta && c._panOffset) { c._sphericalDelta.set(0, 0, 0); c._panOffset.set(0, 0, 0); c.update(); }
    else { const d = c.enableDamping; c.enableDamping = false; c.update(); c.enableDamping = d; }
  }
  pose() {
    const st = this.app.stage, cam = st.camera, S = this.app.state;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const target = S.walk ? cam.position.clone().addScaledVector(fwd, 3) : st.controls.target.clone();
    return { view: S.view, walk: !!S.walk, lowWalls: !!S.lowWalls, pos: cam.position.toArray().map(r6), target: target.toArray().map(r6), quat: cam.quaternion.toArray().map(r6), fov: +cam.fov.toFixed(3) };
  }
  atPose(c) {
    if (!c || !c.pos || !c.quat) return false;
    const st = this.app.stage, cam = st.camera, S = this.app.state;
    if (st.tween || !!c.walk !== !!S.walk || (c.view && c.view !== S.view)) return false;
    const p = new THREE.Vector3(...c.pos), span = p.distanceTo(new THREE.Vector3(...c.target));
    if (cam.position.distanceTo(p) > 0.03 + 0.004 * span) return false;
    const f1 = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), f2 = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...c.quat));
    return f1.angleTo(f2) < 0.012;
  }
  // fly (or walk) back to where a note was made; resolves once there
  goTo(c) {
    if (!c || !c.pos) return Promise.resolve();
    const app = this.app, st = app.stage, S = app.state;
    this._settle();
    if (this.atPose(c)) { st.dirty(); return Promise.resolve(); }
    return new Promise((res) => {
      if (c.walk) {
        const f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...c.quat));
        app.walkTo({ pos: c.pos, look: c.target, pitch: Math.asin(Math.max(-1, Math.min(1, f.y))) }, c.view);
      } else {
        if (S.walk) app.setWalk(false);
        if (c.view !== 'outside' && S.lowWalls !== !!c.lowWalls) { S.lowWalls = !!c.lowWalls; app.emit('walls', S.lowWalls); }
        app.applyView(c.view || S.view);
        st.flyTo(new THREE.Vector3(...c.pos), new THREE.Vector3(...c.target), 900);
      }
      const t0 = performance.now();
      const wait = () => { if (!st.tween || performance.now() - t0 > 5000) { st.dirty(); res(); } else requestAnimationFrame(wait); };
      requestAnimationFrame(wait);
    });
  }

  // ------------------------------------------------------------ writing a note
  startNew() {
    if (!this.writable) { this.ui.toast('View only: notes can’t be added here.', { error: true }); return; }
    if (this.busy) { this.drawHere(); return; }
    const app = this.app;
    if (app.editor.measure.active) app.editor.measure.toggle(false);
    app.select(null);
    if (app.editor.walk) app.editor.walk.keys.clear();
    this._settle();
    this.ed = { id: uid('n'), isNew: true, text: '', cam: this.pose(), circles: [], drawing: true, images: [], removed: [], marksChanged: true };
    this.page = 'edit';
    if (!this.open) this.setOpen(true); else { this._pinsDirty = true; this._render(); this._sync(); }
    this._drawInk(); app.stage.dirty();
  }
  async openEditor(n) {
    if (!this.writable || this.busy) return;
    this.ed = { id: n.id, isNew: false, orig: n, text: n.text || '', cam: n.cam, circles: (n.circles || []).map((c) => ({ ...c, d: [...c.d] })), drawing: false,
      images: (n.images || []).map((r) => ({ ref: r, name: r.name || '' })), removed: [], marksChanged: false };
    this.page = 'edit';
    this._pinsDirty = true; this._render(); this._sync();
    await this.goTo(n.cam);
  }
  get dirty() {
    const e = this.ed; if (!e) return false;
    if (e.isNew) return !!(e.text.trim() || e.circles.length || e.images.length);
    return e.marksChanged || e.removed.length > 0 || e.images.some((i) => i.blob) || e.text !== (e.orig.text || '');
  }
  cancelEdit(force = false) {
    const e = this.ed; if (!e || e.saving) return;
    if (!force && this.dirty) {
      this.ui.modal(e.isNew ? 'Discard this note?' : 'Discard your changes?', h('p', {}, 'What you drew and wrote here will be lost.'), [
        { label: 'Keep editing', run: (c) => c() },
        { label: 'Discard', danger: true, run: (c) => { c(); this.cancelEdit(true); } },
      ]);
      return;
    }
    this.ed = null; this.drag = null; this.marksEl = this.picsEl = null;
    for (const i of e.images) if (i.blob && i.url) URL.revokeObjectURL(i.url);
    if (e.isNew) this.page = 'list';
    else { this.cur = this.list.find((x) => x.id === e.id) || null; this.page = this.cur ? 'note' : 'list'; }
    this._pinsDirty = true; this._render(); this._sync(); this._drawInk(); this.app.stage.dirty();
  }
  drawHere() {
    const e = this.ed; if (!e) return;
    if (e.circles.length && !this.atPose(e.cam)) { this.backToMarks(); return; }
    this._settle();
    if (!e.circles.length) e.cam = this.pose();
    e.drawing = true;
    if (this.app.editor.walk) this.app.editor.walk.keys.clear();
    this._renderMarks(); this._sync(); this._drawInk();
  }
  stopDrawing() {
    const e = this.ed; if (!e) return;
    e.drawing = false; this.drag = null;
    this._renderMarks(); this._sync(); this._drawInk();
  }
  async backToMarks() {
    const e = this.ed; if (!e) return;
    await this.goTo(e.cam);
    if (this.ed === e) { this._renderMarks(); this._drawInk(); }
  }
  markHereInstead() {
    const e = this.ed; if (!e) return;
    e.circles = []; e.marksChanged = true;
    this._settle(); e.cam = this.pose(); e.drawing = true;
    if (this.app.editor.walk) this.app.editor.walk.keys.clear();
    this._renderMarks(); this._sync(); this._drawInk();
  }
  undoMark() {
    const e = this.ed; if (!e || !e.circles.length) return;
    if (!this.atPose(e.cam)) { this.ui.toast('Go back to the marked view to undo a mark.'); return; }
    e.circles.pop(); e.marksChanged = true;
    this._renderMarks(); this._drawInk();
  }
  clearMarks() {
    const e = this.ed; if (!e || !e.circles.length) return;
    e.circles = []; e.marksChanged = true;
    this._renderMarks(); this._drawInk();
  }
  async addImages(files) {
    const e = this.ed; if (!e) return;
    const imgs = [...files].filter(isImageFile);
    if (!imgs.length) { this.ui.toast('Only pictures can be added to a note.', { error: true }); return; }
    for (const f of imgs) {
      if (e.images.length >= MAX_PICS) { this.ui.toast(`A note holds up to ${MAX_PICS} pictures.`, { error: true }); break; }
      const src = URL.createObjectURL(f);
      try {
        const img = await loadImage(src);
        let c = drawScaled(img, 1800);
        const type = /png|webp|gif/.test(f.type) && f.size < 2.5e6 ? 'image/png' : 'image/jpeg';
        if (type === 'image/jpeg') {   // transparent parts turn white, not black
          const w = document.createElement('canvas'); w.width = c.width; w.height = c.height;
          const g = w.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w.width, w.height); g.drawImage(c, 0, 0); c = w;
        }
        const blob = await canvasBlob(c, type, 0.88);
        if (this.ed !== e || !blob) return;
        const name = f.name && !/^image\.\w+$/i.test(f.name) ? f.name : 'Pasted picture';
        e.images.push({ blob, url: URL.createObjectURL(blob), name, w: c.width, h: c.height });
        this._renderPics();
      } catch (err) { this.ui.toast((f.name || 'A picture') + ' couldn’t be read.', { error: true }); }
      finally { URL.revokeObjectURL(src); }
    }
  }
  removeImage(i) {
    const e = this.ed; if (!e) return;
    const [it] = e.images.splice(i, 1);
    if (!it) return;
    if (it.ref) e.removed.push(it.ref); else if (it.url) URL.revokeObjectURL(it.url);
    this._renderPics();
  }
  _renderEdit() {
    const e = this.ed;
    this.title.textContent = e.isNew ? 'New note' : `Edit note #${e.orig.n}`;
    const typing = document.activeElement && document.activeElement.classList.contains('ntext-in');
    this.marksEl = h('div', { class: 'ndraw' });
    this.picsEl = h('div', { class: 'nsec npics' });
    const ta = h('textarea', { class: 'ntext-in', rows: 4, placeholder: 'What should change here? For example: “Make these piers taller, like the reference.”', 'aria-label': 'What should change?', oninput: (ev) => { e.text = ev.target.value; } });
    ta.value = e.text;
    this.body.replaceChildren(this.marksEl, h('label', { class: 'field nfield' }, h('span', { class: 'fl' }, 'What should change?'), ta), this.picsEl);
    this._renderMarks(); this._renderPics(); this._renderFoot();
    if (typing) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
  _renderMarks() {
    const e = this.ed, el = this.marksEl; if (!e || !el) return;
    const n = e.circles.length, here = !n || this.atPose(e.cam);
    e.here = here;
    el.classList.toggle('on', !!e.drawing); el.classList.toggle('away', !here);
    const b = (label, ic, fn, cls = '', disabled = false) => h('button', { class: 'btn sm' + (cls ? ' ' + cls : ''), disabled, onclick: fn }, ic ? icon(ic) : null, label);
    const undo = b('Undo', 'undo', () => this.undoMark(), '', !n), clear = b('Clear', null, () => this.clearMarks(), '', !n);
    let head, text, acts;
    if (e.drawing) {
      head = n ? plural(n, 'mark') : 'Circle what should change';
      text = touch ? 'Drag on the view to circle the spot, or tap to ring it. Draw as many as you need.'
        : 'Drag on the 3D view to circle the spot — Shift keeps it round, a click rings it. Draw as many as you need.';
      acts = [b('Done', 'check', () => this.stopDrawing(), 'primary'), undo, clear];
    } else if (here) {
      head = n ? plural(n, 'mark') : 'No marks yet';
      text = n ? 'You can look around; the marks stay with the view they were drawn on.' : 'Move the view to frame what needs changing, then press Draw here.';
      acts = [b(n ? 'Draw more' : 'Draw here', 'mark', () => this.drawHere(), n ? '' : 'primary'), undo, clear];
    } else {
      head = plural(n, 'mark') + ' on another view';
      text = 'Go back to see them or add more, or start again on the view you’re looking at.';
      acts = [b('Back to the marked view', 'target', () => this.backToMarks(), 'primary'), b('Mark this view instead', 'mark', () => this.markHereInstead())];
    }
    el.replaceChildren(
      h('div', { class: 'ndraw-h' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), h('b', {}, head), h('span', { class: 'muted' }, viewName(n ? e.cam : this.pose()))),
      h('p', { class: 'fine' }, text),
      h('div', { class: 'ndraw-a' }, acts));
    this.ui._hintText();
    this.ui._inset();
  }
  _renderPics() {
    const e = this.ed, el = this.picsEl; if (!e || !el) return;
    const view = (it) => (it.ref ? { ...it.ref, name: it.name } : { url: it.url, name: it.name });
    const all = e.images.map(view);
    const tiles = all.map((r, i) => this._thumb(r, () => this.lightbox(all, i, 'Reference picture'), () => this.removeImage(i)));
    const add = e.images.length < MAX_PICS ? h('button', { class: 'nimg add', title: 'Add pictures', onclick: () => this.fileIn.click() }, icon('plus'), h('span', {}, 'Add')) : null;
    el.replaceChildren(
      h('div', { class: 'sh' }, 'Reference pictures', e.images.length ? h('span', {}, e.images.length) : null),
      h('div', { class: 'nimgs' }, tiles, add),
      h('p', { class: 'fine' }, touch ? 'Photos or screenshots that show what you want.' : 'Photos or screenshots that show what you want — you can also paste or drop them here.'));
  }
  _renderFoot() {
    const e = this.ed; if (!e) return;
    this.foot.hidden = false;
    this.foot.replaceChildren(
      h('button', { class: 'btn', disabled: !!e.saving, onclick: () => this.cancelEdit() }, 'Cancel'),
      h('button', { class: 'btn primary', disabled: !!e.saving, onclick: () => this.save() }, e.saving ? h('i', { class: 'spin' }) : icon('check'), e.saving ? 'Saving…' : e.isNew ? 'Save note' : 'Save changes'));
  }
  async save() {
    const e = this.ed; if (!e || e.saving) return;
    if (!e.text.trim() && !e.circles.length && !e.images.length) { this.ui.toast('Circle something, say what should change, or add a picture first.', { error: true }); return; }
    e.saving = true; e.drawing = false; this.drag = null;
    this._renderFoot(); this._renderMarks(); this._sync();
    try {
      let shot = e.isNew ? null : e.orig.shot || null, anchor = e.isNew ? null : e.orig.anchor ?? null;
      if (e.isNew || e.marksChanged) {
        if (!e.circles.length) { this._settle(); e.cam = this.pose(); } else await this.goTo(e.cam);
        const s = await this.snapshot(e.circles);
        const ref = await this.store.putNoteImage(s.blob);
        if (shot) e.removed.push(shot);
        shot = { ...ref, w: s.w, h: s.h };
        anchor = this._anchor(e.circles);
      }
      const images = [];
      for (const it of e.images) {
        if (!it.ref) { it.ref = { ...(await this.store.putNoteImage(it.blob)), w: it.w, h: it.h }; URL.revokeObjectURL(it.url); delete it.blob; delete it.url; }
        images.push({ ...it.ref, name: it.name || it.ref.name || '' });
      }
      const now = new Date().toISOString();
      const base = e.isNew
        ? { v: 1, n: 1 + this.list.reduce((m, x) => Math.max(m, x.n || 0), 0), status: 'open', replies: [], by: await this.store.userId(), createdAt: now }
        : { ...e.orig };
      const note = { ...base, id: e.id, text: e.text.trim(), cam: e.cam, circles: e.circles, anchor, shot, images, updatedAt: now };
      const saved = await this.store.saveNote(note);
      for (const ref of e.removed) this.store.dropNoteImage(ref);
      this.list = [saved, ...this.list.filter((x) => x.id !== saved.id)].sort(newestFirst);
      this.ed = null; this.marksEl = this.picsEl = null; this.cur = saved; this.page = 'note';
      this._pinsDirty = true; this._render(); this._sync(); this._drawInk(); this.app.stage.dirty();
      this.ui.toast(e.isNew ? `Note #${saved.n} saved` : `Note #${saved.n} updated`);
    } catch (err) {
      e.saving = false;
      if (this.ed === e) { this._renderFoot(); this._renderMarks(); this._renderPics(); this._sync(); }
      this.ui.toast('The note couldn’t be saved: ' + (err && err.message || err), { error: true });
    }
  }
  // the point in the model under the first mark (or the middle of the view) — where the note's pin goes
  _anchor(circles) {
    const cam = this.app.stage.camera, c = circles && circles[0];
    const dir = (c ? new THREE.Vector3(...c.d) : new THREE.Vector3(0, 0, -1)).applyQuaternion(cam.quaternion).normalize();
    const ray = new THREE.Raycaster(cam.position.clone(), dir, 0.05, 400);
    const hits = ray.intersectObjects(this.app.occluders(), false).filter((x) => !(x.object.material && x.object.material.transparent))
      .concat(ray.intersectObjects(this.app.items.pickables(), true).filter((x) => !x.object.userData.helper && x.object.visible))
      .sort((a, b) => a.distance - b.distance);
    return hits[0] ? hits[0].point.toArray().map((v) => +v.toFixed(3)) : null;
  }
  // a picture of the view with the marks drawn on it
  async snapshot(circles) {
    const st = this.app.stage, cv = st.renderer.domElement;
    st.render();
    const k = Math.min(1, 1600 / cv.width), c = document.createElement('canvas');
    c.width = Math.round(cv.width * k); c.height = Math.round(cv.height * k);
    const g = c.getContext('2d');
    g.drawImage(cv, 0, 0, c.width, c.height);
    const s = c.width / (this._rect().width || c.width), lw = Math.max(1, s);
    for (const m of this._screen(circles)) {
      g.beginPath(); g.ellipse(m.x * s, m.y * s, Math.max(1, m.rx * s), Math.max(1, m.ry * s), 0, 0, Math.PI * 2);
      g.lineWidth = 7 * lw; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke();
      g.lineWidth = 3.5 * lw; g.strokeStyle = INK; g.stroke();
    }
    st.dirty();
    const blob = await canvasBlob(c, 'image/jpeg', 0.86);
    if (!blob) throw new Error('the picture of the view could not be made');
    return { blob, w: c.width, h: c.height };
  }

  // ------------------------------------------------------------ marks: camera-space directions <-> the screen
  _rect() { return this.app.stage.canvas.getBoundingClientRect(); }
  _toCam(x, y) {
    const cam = this.app.stage.camera, R = this._rect();
    cam.updateMatrixWorld();
    const p = new THREE.Vector3((x / R.width) * 2 - 1, -(y / R.height) * 2 + 1, 0.5).unproject(cam);
    return p.sub(cam.position).normalize().applyQuaternion(cam.quaternion.clone().invert()).toArray().map(r6);
  }
  // radians-ish (tangent) per screen pixel, the same across and down
  _perPx() { const cam = this.app.stage.camera; return 2 * Math.tan(cam.fov * Math.PI / 360) / Math.max(1, this._rect().height); }
  _screen(circles) {
    const out = []; if (!circles || !circles.length) return out;
    const cam = this.app.stage.camera, R = this._rect(), k = this._perPx(), p = new THREE.Vector3();
    cam.updateMatrixWorld();
    for (const c of circles) {
      p.set(...c.d).applyQuaternion(cam.quaternion).add(cam.position).project(cam);
      if (p.z > 1 || p.z < -1) continue;
      out.push({ x: (p.x + 1) / 2 * R.width, y: (1 - p.y) / 2 * R.height, rx: c.rx / k, ry: c.ry / k });
    }
    return out;
  }
  _buildInk() {
    const el = this.ink = svg('svg', { class: 'note-ink', 'aria-hidden': 'true' });
    this.inkG = svg('g'); el.append(this.inkG);
    this.app.stage.container.append(el);
    const pos = (ev) => { const R = this._rect(); return [ev.clientX - R.left, ev.clientY - R.top]; };
    el.addEventListener('pointerdown', (ev) => {
      const e = this.ed;
      if (!this.drawing || this.drag || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      ev.preventDefault();
      const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur();   // so Esc and Ctrl+Z reach the marks
      if (this.app.stage.tween) return;
      if (!e.circles.length) { this._settle(); e.cam = this.pose(); } else if (!this.atPose(e.cam)) return;
      try { el.setPointerCapture(ev.pointerId); } catch (err) { /* synthetic pointer */ }
      const [x, y] = pos(ev);
      this.drag = { id: ev.pointerId, x0: x, y0: y, x1: x, y1: y, shift: ev.shiftKey };
      this._drawInk();
    });
    el.addEventListener('pointermove', (ev) => {
      const d = this.drag; if (!d || ev.pointerId !== d.id) return;
      [d.x1, d.y1] = pos(ev); d.shift = ev.shiftKey; this._drawInk();
    });
    const end = (ev, cancel) => {
      const d = this.drag; if (!d || ev.pointerId !== d.id) return;
      this.drag = null;
      if (!cancel && this.ed && this.ed.drawing) {
        const m = this._dragShape(d), k = this._perPx();
        this.ed.circles.push({ d: this._toCam(m.x, m.y), rx: r6(m.rx * k), ry: r6(m.ry * k) });
        this.ed.marksChanged = true;
        this._renderMarks();
      }
      this._drawInk();
    };
    el.addEventListener('pointerup', (ev) => end(ev, false));
    el.addEventListener('pointercancel', (ev) => end(ev, true));
    el.addEventListener('wheel', (ev) => { if (this.drawing) ev.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (ev) => { if (this.drawing) ev.preventDefault(); });
  }
  _dragShape(d) {
    const dx = d.x1 - d.x0, dy = d.y1 - d.y0;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return { x: d.x0, y: d.y0, rx: TAP_R, ry: TAP_R };
    if (d.shift) { const r = Math.max(Math.abs(dx), Math.abs(dy)) / 2; return { x: d.x0 + Math.sign(dx || 1) * r, y: d.y0 + Math.sign(dy || 1) * r, rx: r, ry: r }; }
    return { x: (d.x0 + d.x1) / 2, y: (d.y0 + d.y1) / 2, rx: Math.max(4, Math.abs(dx) / 2), ry: Math.max(4, Math.abs(dy) / 2) };
  }
  // the marks of the note being written or read, drawn only while the view is the one they belong to
  _drawInk() {
    if (!this.inkG) return;
    const st = this.app.stage, e = this.busy ? this.ed : null;
    let circles = null;
    if (e) {
      const here = !e.circles.length || this.atPose(e.cam);
      let redo = here !== e.here;
      if (e.drawing && !here && !st.tween) { e.drawing = false; this.drag = null; this._sync(); redo = true; }   // the view was moved away (a floor tab, Walk…)
      if (redo) this._renderMarks();
      if (here) circles = e.circles;
    } else if (this.open && this.page === 'note' && this.cur && (this.cur.circles || []).length && this.atPose(this.cur.cam)) circles = this.cur.circles;
    const shapes = this._screen(circles);
    if (this.drag) shapes.push({ ...this._dragShape(this.drag), live: true });
    if (!shapes.length && !this._inkN) return;
    this._inkN = shapes.length;
    const R = this._rect();
    this.ink.setAttribute('viewBox', `0 0 ${Math.max(1, R.width).toFixed(1)} ${Math.max(1, R.height).toFixed(1)}`);
    this.inkG.replaceChildren(...shapes.flatMap((m) => {
      const a = { cx: m.x.toFixed(1), cy: m.y.toFixed(1), rx: m.rx.toFixed(1), ry: m.ry.toFixed(1) };
      return [svg('ellipse', { ...a, class: 'halo' }), svg('ellipse', { ...a, class: 'ring' + (m.live ? ' live' : '') })];
    }));
  }

  // ------------------------------------------------------------ pins: the notes made in the view on screen
  _buildPins() {
    this.pinBox = h('div', { class: 'note-pins' });
    this.app.stage.container.append(this.pinBox);
  }
  _rebuildPins() {
    this._pinsDirty = false;
    const S = this.app.state, show = this.open && !this.busy;
    const want = !show ? [] : this.list.filter((n) => n.anchor && n.cam && n.cam.view === S.view && !!n.cam.walk === !!S.walk &&
      (this.filter === 'all' || (this.filter === 'done' ? n.status === 'done' : n.status !== 'done')));
    this.pins = want.map((n) => {
      const el = h('button', { class: 'npin' + (n.status === 'done' ? ' done' : ''), title: `#${n.n} ${(n.text || '').trim().slice(0, 90)}`, 'aria-label': `Open note ${n.n}`,
        onclick: (ev) => { ev.stopPropagation(); this.openNote(n.id); } }, String(n.n));
      return { el, id: n.id, v: new THREE.Vector3(...n.anchor) };
    });
    this.pinBox.replaceChildren(...this.pins.map((p) => p.el));
  }
  _placePins() {
    if (this._pinsDirty) this._rebuildPins();
    if (!this.pins.length) return;
    const st = this.app.stage, cam = st.camera, W = st.container.clientWidth, H = st.container.clientHeight, p = new THREE.Vector3();
    const curId = this.page === 'note' && this.cur ? this.cur.id : null;
    for (const P of this.pins) {
      p.copy(P.v).project(cam);
      // the open note's own pin steps aside while its circles are on screen
      const out = p.z > 1 || Math.abs(p.x) > 1.02 || Math.abs(p.y) > 1.02 || (P.id === curId && this._inkN > 0);
      P.el.style.visibility = out ? 'hidden' : '';
      P.el.classList.toggle('cur', P.id === curId);
      if (!out) P.el.style.transform = `translate(${((p.x + 1) / 2 * W).toFixed(1)}px, ${((1 - p.y) / 2 * H).toFixed(1)}px) translate(-50%, -50%)`;
    }
  }
}
