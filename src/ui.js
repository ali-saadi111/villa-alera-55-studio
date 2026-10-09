// The panels around the 3D view: views, catalog, your imports, the item list, the inspector, dialogs.
import * as THREE from 'three';
import { CATALOG, CATEGORIES } from './furniture.js';
import { ROOMS } from './layout.js';
import { itemName, itemKind, floorIndex, clone, normalizeModel } from './items.js';
import { loadModelFiles, MODEL_EXT, IMAGE_EXT, ext, loadImage, drawScaled, cutoutBackground, canvasBlob, expandZips, filesFromDrop } from './importer.js';
import { FLOOR_NAMES, LV, CEIL } from './util.js';

export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
export const I = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  ruler: '<path d="M3 15.5 15.5 3 21 8.5 8.5 21z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6.5L14 17v4M8 11l3-3.5 3 1.5 2.5 3M11.5 14.5 10.8 9"/>',
  walls: '<path d="M3 20h18M5 20v-7h14v7M5 13V9h4v4M15 13V9h4v4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.3 6.3C3.6 8.1 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  rotL: '<path d="M4 4v5h5"/><path d="M4.5 13a8 8 0 1 0 2-6.5L4 9"/>',
  rotR: '<path d="M20 4v5h-5"/><path d="M19.5 13a8 8 0 1 1-2-6.5L20 9"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  link: '<path d="M8 12h8M10 7H8a5 5 0 0 0 0 10h2M14 7h2a5 5 0 0 1 0 10h-2"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  note: '<path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z"/><path d="M8 9h8M8 12.5h5"/>',
  mark: '<path d="M14 5.4A7.3 6.4 0 1 0 19.2 11"/><path d="m17.4 2.8 2.8 2.8-5.6 5.6h-2.8V8.4z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  back: '<path d="M14.5 5 7.5 12l7 7"/>',
  next: '<path d="m9.5 5 7 7-7 7"/>',
  edit: '<path d="M4 20h4L19.5 8.5l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  send: '<path d="M4 12 20 4.5 16.5 20l-4.5-6.5z"/><path d="m12 13.5 8-9"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
};
export const icon = (n, cls = '') => h('span', { class: 'ic ' + cls, 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24">${I[n]}</svg>` });
const cm = (m) => Math.round(m * 100);
const dimsText = (p) => p ? `${cm(p.w)} × ${cm(p.d)} × ${cm(p.h)} cm` : '';
const touch = matchMedia('(pointer: coarse)').matches;
const VIEWS = [['outside', 'Outside'], ['b1', 'Basement'], ['gf', 'Ground'], ['ff', 'First'], ['at', 'Attic']];
const LEVELS = [['b1', 'Basement'], ['gf', 'Ground floor'], ['ff', 'First floor'], ['at', 'Attic'], ['site', 'Outside']];
const HEX = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

export class UI {
  constructor(app, { noGL = false } = {}) {
    this.app = app;
    this.root = document.getElementById('app');
    this.boot = document.getElementById('boot');
    if (noGL) {
      if (this.boot) { this.boot.classList.add('err'); this.boot.textContent = 'This view needs WebGL, which is turned off or not available in this browser. Try another browser or enable hardware acceleration.'; }
      return;
    }
    this.replaceId = null; this.cat = 'All'; this.query = ''; this.onlyFloor = true; this.lockRatio = true;
    this.showLabels = true;
    this._topbar(); this._library(); this._inspector(); this._hint(); this._toasts(); this._drops(); this._labels();
    app.on('select', () => { this.renderInspector(); this._hintText(); if (app.selected && this.narrow) this.setLibrary(false); this._markRows(); this._inset(); });
    app.on('live', () => this.liveInspector());
    app.on('items-changed', () => { this.renderInspector(); this.renderHouse(); });
    app.on('view', () => { this._syncTop(); this.renderHouse(); this._buildLabels(); });
    app.on('walk', () => { this._syncTop(); this._hintText(); this._buildLabels(); });
    app.on('walls', () => this._syncTop());
    app.on('history', () => this._syncTop());
    app.on('status', (s) => this._status(s));
    app.on('models', () => this.renderMine());
    app.on('measure', () => { this._syncTop(); this._hintText(); });
    app.on('ready', () => {
      if (this.boot) { this.boot.classList.add('gone'); setTimeout(() => this.boot && this.boot.remove(), 600); }
      this.renderHouse(); this.renderMine(); this._syncTop();
      let seen = false; try { seen = localStorage.getItem('villa-alera-55/tip') === '1'; localStorage.setItem('villa-alera-55/tip', '1'); } catch (e) { /* private mode */ }
      if (!seen) setTimeout(() => this.toast('Tip: pick a floor at the top to look inside — and drop a 3D model or product photo anywhere to try it in the house.', { ms: 9000 }), 2600);
    });
    app.on('drag', (on) => this.root.classList.toggle('dragging', on));
    window.addEventListener('resize', () => this._layout());
    this._layout();
    if (app.status) this._status(app.status);
  }
  get narrow() { return window.innerWidth < 760; }
  nameOf(rec) { return itemName(rec, this.app.models); }

  // ------------------------------------------------------------ top bar
  _topbar() {
    const app = this.app;
    const views = h('div', { class: 'seg views', role: 'tablist', 'aria-label': 'View' },
      VIEWS.map(([v, label]) => h('button', { class: 'seg-b', role: 'tab', 'data-v': v, onclick: () => { if (app.state.view === v && !app.state.walk) app.flyToView(v); else app.setView(v); } }, label)));
    this.btnWalk = h('button', { class: 'tb', title: 'Walk through at eye level', 'aria-pressed': 'false', onclick: () => app.setWalk(!app.state.walk) }, icon('walk'), h('span', { class: 'lbl' }, 'Walk'));
    this.btnWalls = h('button', { class: 'tb', title: 'Low walls show the rooms like a plan', 'aria-pressed': 'true', onclick: () => app.setLowWalls(!app.state.lowWalls) }, icon('walls'), h('span', { class: 'lbl' }, 'Low walls'));
    this.btnUndo = h('button', { class: 'tb icon', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => app.undo() }, icon('undo'));
    this.btnRedo = h('button', { class: 'tb icon', title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo', onclick: () => app.redo() }, icon('redo'));
    this.btnMeasure = h('button', { class: 'tb icon', title: 'Measure (M)', 'aria-label': 'Measure', 'aria-pressed': 'false', onclick: () => app.editor.measure.toggle() }, icon('ruler'));
    this.btnShot = h('button', { class: 'tb icon', title: 'Save a picture of this view', 'aria-label': 'Save a picture', onclick: () => this.screenshot() }, icon('camera'));
    this.btnMenu = h('button', { class: 'tb icon', title: 'More', 'aria-label': 'More options', 'aria-haspopup': 'true', onclick: (e) => { e.stopPropagation(); this.toggleMenu(); } }, icon('more'));
    this.statusEl = h('span', { class: 'status', role: 'status' }, h('i'), h('span', { class: 't' }, 'Connecting…'));
    this.btnLib = h('button', { class: 'tb add', 'aria-expanded': 'true', onclick: () => this.setLibrary(!this.libOpen) }, icon('plus'), h('span', { class: 'lbl' }, 'Add items'));
    const brand = h('div', { class: 'brand' }, h('div', { class: 'mark', 'aria-hidden': 'true' }), h('div', {}, h('div', { class: 'name' }, 'Villa Alera 55'), h('div', { class: 'sub' }, 'Layout studio')));
    this.top = h('header', { class: 'topbar' },
      h('div', { class: 'tb-left' }, brand, this.btnLib),
      h('div', { class: 'tb-mid' }, views, this.btnWalls, this.btnWalk),
      h('div', { class: 'tb-right' }, this.btnUndo, this.btnRedo, this.btnMeasure, this.btnShot, this.btnMenu, this.statusEl));
    this.root.append(this.top);
    this.views = views;
    document.addEventListener('click', (e) => { if (this.menu && !this.menu.contains(e.target)) this.toggleMenu(false); });
  }
  _syncTop() {
    const S = this.app.state;
    for (const b of this.views.children) { const on = b.dataset.v === S.view; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
    this.btnWalk.setAttribute('aria-pressed', S.walk); this.btnWalk.classList.toggle('on', S.walk);
    this.btnWalls.setAttribute('aria-pressed', S.lowWalls); this.btnWalls.classList.toggle('on', S.lowWalls);
    this.btnWalls.hidden = S.view === 'outside' || S.walk;
    this.btnUndo.disabled = !this.app.history.undo.length; this.btnRedo.disabled = !this.app.history.redo.length;
    const m = this.app.editor.measure.active; this.btnMeasure.classList.toggle('on', m); this.btnMeasure.setAttribute('aria-pressed', m);
  }
  _status(s) {
    const map = { saved: ['ok', 'Saved'], dirty: ['busy', 'Saving…'], saving: ['busy', 'Saving…'], uploading: ['busy', 'Uploading…'], local: ['local', 'Saved in this browser'], readonly: ['ro', 'View only — changes stay on this device'], error: ['err', 'Not saved'] };
    const [cls, txt] = map[s] || ['ok', 'Saved'];
    this.statusEl.className = 'status ' + cls; this.statusEl.querySelector('.t').textContent = txt;
    this.statusEl.title = s === 'local' ? 'The shared store isn’t available here, so changes stay in this browser.' : '';
  }
  toggleMenu(force) {
    if (this.menu && force !== true) { this.menu.remove(); this.menu = null; this.btnMenu.setAttribute('aria-expanded', 'false'); return; }
    if (force === false) return;
    const app = this.app, S = app.state;
    const item = (label, fn, ic) => h('button', { class: 'mi', role: 'menuitem', onclick: () => { this.toggleMenu(false); fn(); } }, ic ? icon(ic) : h('span', { class: 'ic' }), label);
    const check = (label, on, fn) => h('label', { class: 'mi chk' }, h('input', { type: 'checkbox', checked: on, onchange: (e) => fn(e.target.checked) }), label);
    this.menu = h('div', { class: 'menu panel', role: 'menu' },
      h('div', { class: 'mh' }, 'Layouts'),
      item('Save a copy of this layout…', () => this.saveCopyDialog(), 'copy'),
      item('Open a saved layout…', () => this.openSavedDialog(), 'panel'),
      item('Back to the original furniture…', () => this.resetDialog(), 'undo'),
      item('Export layout (.json)', () => this.exportLayout(), 'upload'),
      item('Import layout (.json)…', () => this.pickLayoutFile(), 'link'),
      h('div', { class: 'mh' }, 'Tools'),
      item('Mark up this view (note)', () => app.notes && app.notes.startNew(), 'mark'),
      item('Tape measure', () => app.editor.measure.toggle(), 'ruler'),
      item('Save a picture of this view', () => this.screenshot(), 'camera'),
      h('div', { class: 'mh' }, 'View'),
      check('Show the original furniture', S.showOriginal, (on) => app.setShowOriginal(on)),
      check('Room names', this.showLabels, (on) => { this.showLabels = on; this._buildLabels(); app.stage.dirty(); }),
      check('Snap moves to 5 cm', app.editor.snap, (on) => { app.editor.snap = on; }),
      check('Dusk lighting', S.light === 'dusk', (on) => app.setLight(on ? 'dusk' : 'day')),
      item('Keyboard shortcuts', () => this.shortcutsDialog(), 'target'),
      h('div', { class: 'fine credit' }, 'Stone, wood, roof and sky textures: ', h('a', { href: 'https://polyhaven.com', target: '_blank', rel: 'noopener' }, 'Poly Haven'), ' (CC0)'));
    this.root.append(this.menu);
    const r = this.btnMenu.getBoundingClientRect();
    this.menu.style.top = (r.bottom + 8) + 'px';
    this.menu.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    this.btnMenu.setAttribute('aria-expanded', 'true');
  }

  // ------------------------------------------------------------ library
  _library() {
    const tabs = [['catalog', 'Catalog'], ['mine', 'Your items'], ['house', 'In the house']];
    this.tab = 'catalog';
    this.tabBar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { role: 'tab', 'data-t': k, onclick: () => this.showTab(k) }, l)));
    this.replBanner = h('div', { class: 'repl', hidden: true }, h('span', { class: 't' }), h('button', { class: 'link', onclick: () => this.setReplace(null) }, 'Cancel'));
    // catalog
    this.search = h('input', { type: 'search', placeholder: 'Search the catalog', 'aria-label': 'Search the catalog', oninput: (e) => { this.query = e.target.value.trim().toLowerCase(); this.renderCatalog(); } });
    this.chips = h('div', { class: 'chips' }, ['All', ...CATEGORIES].map((c) => h('button', { class: 'chip', 'data-c': c, onclick: () => { this.cat = c; this.renderCatalog(); } }, c)));
    this.grid = h('div', { class: 'grid' });
    const secCat = h('section', { 'data-tab': 'catalog' }, h('div', { class: 'searchbox' }, icon('search'), this.search), this.chips, this.grid);
    // your items
    this.fileModel = h('input', { type: 'file', multiple: true, hidden: true, accept: [...MODEL_EXT, 'zip', 'bin', 'mtl', ...IMAGE_EXT, 'ktx2', 'tga'].map((e) => '.' + e).join(','), onchange: (e) => { this.handleFiles([...e.target.files]); e.target.value = ''; } });
    this.filePhoto = h('input', { type: 'file', hidden: true, accept: 'image/*', onchange: (e) => { if (e.target.files[0]) this.importPhoto(e.target.files[0]); e.target.value = ''; } });
    this.mineGrid = h('div', { class: 'grid mine' });
    const drop = h('div', { class: 'dropzone' },
      h('div', { class: 'dz-t' }, 'Bring in something you found online'),
      h('div', { class: 'dz-s' }, 'Drop a 3D model or a product photo anywhere on the page'),
      h('div', { class: 'dz-a' },
        h('button', { class: 'btn', onclick: () => this.fileModel.click() }, icon('cube'), '3D model…'),
        h('button', { class: 'btn', onclick: () => this.filePhoto.click() }, icon('image'), 'Photo…')),
      h('div', { class: 'dz-f' }, 'GLB · GLTF (or the .zip it came in) · FBX · OBJ (+ MTL) · DAE · 3DS · STL · PLY · USDZ — or JPG · PNG · WEBP'));
    const tip = h('p', { class: 'tip' }, 'Many makers publish free 3D files of their products — search the product name with “3D model GLB”, or look on Sketchfab or 3D Warehouse. No model? A product photo plus its size works too.');
    this.mineEmpty = h('p', { class: 'empty' }, 'Nothing imported yet.');
    const secMine = h('section', { 'data-tab': 'mine' }, drop, this.fileModel, this.filePhoto, tip, this.mineEmpty, this.mineGrid);
    // in the house
    this.houseCount = h('span', { class: 'count' });
    this.houseList = h('div', { class: 'hlist' });
    const secHouse = h('section', { 'data-tab': 'house' },
      h('div', { class: 'hhead' }, h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { this.onlyFloor = e.target.checked; this.renderHouse(); } }), 'Only what this view shows'), this.houseCount),
      this.houseList);
    this.lib = h('aside', { class: 'library panel', 'aria-label': 'Add items' }, this.tabBar, this.replBanner, h('div', { class: 'lib-body' }, secCat, secMine, secHouse));
    this.root.append(this.lib);
    this.libOpen = !this.narrow;
    this.showTab('catalog');
    this.renderCatalog();
    this.thumbObs = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (!e.isIntersecting) continue;
        const img = e.target; this.thumbObs.unobserve(img);
        const done = (url) => { if (url) img.src = url; else img.classList.add('none'); };
        if (img.dataset.type) this.app.thumbs.catalog(img.dataset.type, done);
        else if (img.dataset.model) { const id = img.dataset.model; this.app.thumbs.request('m:' + id, () => { const m = this.app.models.get(id); if (!m || !m.template) return null; const c = m.template.clone(true); c.userData.keepAfterThumb = true; return c; }, done); }
      }
    }, { root: this.lib, rootMargin: '120px' });
  }
  setLibrary(open) {
    const notes = this.app.notes;
    if (open && this.narrow && notes && notes.open) {   // one sheet at a time on a phone
      if (notes.busy) { this.toast('Save or cancel the note first.'); return; }
      notes.setOpen(false);
    }
    this.libOpen = open; this._layout();
  }
  showTab(k) {
    this.tab = k;
    for (const b of this.tabBar.children) { const on = b.dataset.t === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
    for (const s of this.lib.querySelectorAll('section[data-tab]')) s.hidden = s.dataset.tab !== k;
    if (k === 'house') this.renderHouse();
    if (k === 'mine') this.renderMine();
  }
  _layout() {
    this.root.classList.toggle('narrow', this.narrow);
    this.lib.classList.toggle('open', this.libOpen);
    this.btnLib.setAttribute('aria-expanded', this.libOpen);
    this.btnLib.classList.toggle('on', this.libOpen);
    this._inset();
  }
  // keep the view centred in whatever the panels leave free
  _inset() {
    const H = window.innerHeight, notes = this.app.notes, nOpen = !!(notes && notes.open);
    if (!this.narrow) this.app.stage.setInset((this.libOpen ? 326 : 0) - (nOpen ? 350 : 0), 0);
    else this.app.stage.setInset(0, nOpen ? notes.panel.offsetHeight * 0.85 : this.libOpen ? Math.min(0.62 * H, 560) * 0.85 : this.app.selected ? 0.5 * H * 0.85 : 0);
  }
  renderCatalog() {
    for (const c of this.chips.children) c.classList.toggle('on', c.dataset.c === this.cat);
    const q = this.query;
    const list = Object.entries(CATALOG).filter(([t, d]) => t !== 'photoBox' && (d.lib || q || this.cat !== 'All') && (this.cat === 'All' || d.cat === this.cat) && (!q || (d.name + ' ' + d.cat + ' ' + t).toLowerCase().includes(q)));
    this.grid.replaceChildren(...list.map(([t, d]) => this._card({ type: t }, d.name, { w: d.dims[0], d: d.dims[1], h: d.dims[2] }, { type: t })));
    if (!list.length) this.grid.append(h('p', { class: 'empty' }, 'Nothing matches that search.'));
  }
  _card(spec, name, p, thumb, extra) {
    const img = h('img', { class: 'thumb', alt: '', draggable: 'false' });
    if (thumb.type) img.dataset.type = thumb.type; else if (thumb.model) img.dataset.model = thumb.model; else if (thumb.src) img.src = thumb.src;
    const card = h('button', { class: 'card', draggable: 'true', title: this.replaceId ? `Use ${name} instead` : `Add ${name}`,
      onclick: () => this.useSpec(spec),
      ondragstart: (e) => { e.dataTransfer.setData('text/x-villa', JSON.stringify(spec)); e.dataTransfer.effectAllowed = 'copy'; } },
    h('span', { class: 'tw' }, img), h('span', { class: 'nm' }, name), h('span', { class: 'dm' }, dimsText(p)), extra || null);
    if (!thumb.src) requestAnimationFrame(() => this.thumbObs && this.thumbObs.observe(img));
    return card;
  }
  useSpec(spec) {
    const app = this.app;
    if (this.replaceId && app.items.has(this.replaceId)) { app.replaceItem(this.replaceId, spec); this.setReplace(null); }
    else { const r = app.placeNew(spec); if (r) this.toast(`Added ${this.nameOf(r)} — drag it into place`); }
    if (this.narrow) this.setLibrary(false);
  }
  setReplace(id) {
    this.replaceId = id;
    this.replBanner.hidden = !id;
    if (id) { this.replBanner.querySelector('.t').textContent = `Pick a replacement for ${this.nameOf(this.app.items.get(id))}`; this.setLibrary(true); if (this.tab === 'house') this.showTab('catalog'); }
    this.lib.classList.toggle('replacing', !!id);
  }
  renderMine() {
    if (!this.mineGrid) return;
    const all = this.app.models.all().filter((m) => m.meta).sort((a, b) => String(b.meta.createdAt || '9').localeCompare(String(a.meta.createdAt || '9')));
    this.mineEmpty.hidden = all.length > 0;
    this.mineGrid.replaceChildren(...all.map((m) => {
      const meta = m.meta, photo = meta.kind === 'photo';
      const del = h('span', { class: 'del', role: 'button', tabindex: '0', title: 'Delete from your items', 'aria-label': 'Delete ' + meta.name, onclick: (e) => { e.stopPropagation(); this.deleteModelDialog(m.id); } }, icon('trash'));
      const badge = m.status === 'error' ? h('span', { class: 'badge err', title: m.error || '' }, 'Didn’t load') : meta.local ? h('span', { class: 'badge' }, 'This browser') : null;
      const thumb = photo ? { src: this.app.store.photoUrl(meta) || '' } : { model: m.id };
      const card = this._card({ model: m.id }, meta.name || 'Imported item', meta.target || meta.size, thumb, h('span', { class: 'cardx' }, badge, del));
      if (m.status === 'loading') card.classList.add('loading');
      return card;
    }));
  }
  renderHouse() {
    if (!this.houseList || this.tab !== 'house') return;
    const app = this.app, S = app.state;
    const recs = app.items.list().filter((r) => !this.onlyFloor || app._itemVisible({ ...r, hidden: false }));
    this.houseCount.textContent = `${recs.length} item${recs.length === 1 ? '' : 's'}`;
    const groups = [['site', 'Outside'], ['at', 'Attic'], ['ff', 'First floor'], ['gf', 'Ground floor'], ['b1', 'Basement']];
    const out = [];
    for (const [f, label] of groups) {
      const g = recs.filter((r) => r.floor === f).sort((a, b) => this.nameOf(a).localeCompare(this.nameOf(b)));
      if (!g.length) continue;
      out.push(h('h4', {}, label, h('span', {}, g.length)));
      for (const r of g) {
        const eye = h('span', { class: 'eye', role: 'button', tabindex: '0', title: r.hidden ? 'Show' : 'Hide', 'aria-label': (r.hidden ? 'Show ' : 'Hide ') + this.nameOf(r), onclick: (e) => { e.stopPropagation(); app.patchItem(r.id, { hidden: r.hidden ? undefined : true }); } }, icon(r.hidden ? 'eyeOff' : 'eye'));
        out.push(h('button', { class: 'hrow' + (r.hidden ? ' off' : '') + (r.id === app.selected ? ' on' : ''), 'data-id': r.id,
          onclick: () => { if (r.floor !== 'site' && !S.walk && S.view !== 'outside' && floorIndex(r.floor) > floorIndex(S.view)) app.setView(r.floor); app.select(r.id); app.focusItem(r.id); } },
        h('span', { class: 'n' }, this.nameOf(r)), h('span', { class: 'd' }, dimsText(r.p)), eye));
      }
    }
    if (!out.length) out.push(h('p', { class: 'empty' }, S.showOriginal ? 'Nothing here yet.' : 'Original furniture is hidden.'));
    this.houseList.replaceChildren(...out);
    void touch;
  }
  _markRows() { if (this.houseList) for (const r of this.houseList.querySelectorAll('.hrow')) r.classList.toggle('on', r.dataset.id === this.app.selected); }

  // ------------------------------------------------------------ inspector
  _inspector() {
    const app = this.app;
    const num = (cls, label, unit, onchange, step = 1) => {
      const inp = h('input', { type: 'number', class: 'num ' + cls, step, inputmode: 'decimal', 'aria-label': label, onchange });
      return h('label', { class: 'nf' }, h('span', { class: 'k' }, label), inp, unit ? h('span', { class: 'u' }, unit) : null);
    };
    const ins = this.ins = {};
    ins.name = h('input', { class: 'ins-name', 'aria-label': 'Item name', onchange: (e) => { const id = app.selected; if (!id) return; const v = e.target.value.trim(); app.patchItem(id, { name: v || undefined }); } });
    ins.sub = h('div', { class: 'ins-sub' });
    const close = h('button', { class: 'tb icon x', 'aria-label': 'Close', onclick: () => app.select(null) }, icon('x'));
    // size
    const setDim = (k) => (e) => {
      const id = app.selected, rec = app.items.get(id); if (!rec) return;
      const v = parseFloat(e.target.value); if (!(v > 0)) { this.renderInspector(); return; }
      const p = { ...rec.p }, old = p[k], nv = Math.max(0.005, v / 100);
      if (this.lockRatio && old > 0) { const f = nv / old; p.w *= f; p.d *= f; p.h *= f; } else p[k] = nv;
      for (const q of ['w', 'd', 'h']) p[q] = +p[q].toFixed(4);
      const patch = { p };
      if (itemKind(rec, app.models) === 'hang' && rec.floor !== 'site') patch.y = +(CEIL[rec.floor] - p.h).toFixed(4);
      app.patchItem(id, patch);
    };
    ins.w = num('w', 'W', null, setDim('w')); ins.d = num('d', 'D', null, setDim('d')); ins.h = num('h', 'H', 'cm', setDim('h'));
    ins.lock = h('button', { class: 'tb icon sm', 'aria-pressed': 'true', title: 'Keep proportions', 'aria-label': 'Keep proportions', onclick: () => { this.lockRatio = !this.lockRatio; this.renderInspector(); } }, icon('link'));
    ins.resetSize = h('button', { class: 'link', onclick: () => this.resetSize() }, 'Original size');
    const secSize = h('div', { class: 'sec' }, h('div', { class: 'sh' }, 'Size', ins.resetSize), h('div', { class: 'dims' }, ins.w, ins.d, ins.h, ins.lock));
    // colour
    ins.color = h('input', { type: 'color', 'aria-label': 'Color', onchange: (e) => { const id = app.selected, rec = app.items.get(id); if (rec) app.patchItem(id, { p: { ...rec.p, color: parseInt(e.target.value.slice(1), 16) } }); } });
    ins.colorReset = h('button', { class: 'link', onclick: () => { const id = app.selected, rec = app.items.get(id); const def = rec && CATALOG[rec.type]; if (rec && def) app.patchItem(id, { p: { ...rec.p, color: def.color ?? undefined } }); } }, 'Original');
    ins.secColor = h('div', { class: 'sec' }, h('div', { class: 'sh' }, 'Color', ins.colorReset), h('div', { class: 'row' }, ins.color, h('span', { class: 'hint-s' }, 'Fabric or finish')));
    // shape (photo items)
    ins.shape = h('select', { 'aria-label': 'Shape', onchange: (e) => { const id = app.selected, rec = app.items.get(id); if (rec) app.patchItem(id, { p: { ...rec.p, shape: e.target.value } }); } },
      [['cutout', 'Stand-up cut-out'], ['box', 'Box'], ['panel', 'Flat panel'], ['rug', 'Rug'], ['cylinder', 'Round']].map(([v, l]) => h('option', { value: v }, l)));
    ins.secShape = h('div', { class: 'sec' }, h('div', { class: 'sh' }, 'Shape'), ins.shape);
    // placement
    ins.rot = h('input', { type: 'number', class: 'num', step: 1, 'aria-label': 'Turn in degrees', onchange: (e) => { const id = app.selected; const v = parseFloat(e.target.value); if (id && Number.isFinite(v)) app.patchItem(id, { ry: +(-v * Math.PI / 180).toFixed(5) }); } });
    const rotRow = h('div', { class: 'row' }, h('span', { class: 'k' }, 'Turn'),
      h('button', { class: 'tb icon sm', title: 'Turn 90° counter-clockwise', 'aria-label': 'Turn 90 degrees counter-clockwise', onclick: () => app.selected && app.rotateItem(app.selected, Math.PI / 2) }, icon('rotL')),
      h('label', { class: 'nf' }, ins.rot, h('span', { class: 'u' }, '°')),
      h('button', { class: 'tb icon sm', title: 'Turn 90° clockwise', 'aria-label': 'Turn 90 degrees clockwise', onclick: () => app.selected && app.rotateItem(app.selected, -Math.PI / 2) }, icon('rotR')));
    ins.elev = h('input', { type: 'number', class: 'num', step: 1, 'aria-label': 'Height above the floor in centimetres', onchange: (e) => { const id = app.selected, rec = app.items.get(id); const v = parseFloat(e.target.value); if (rec && Number.isFinite(v)) app.patchItem(id, { y: +(this._floorY(rec) + v / 100).toFixed(4) }); } });
    const elevRow = h('div', { class: 'row' }, h('span', { class: 'k' }, 'Above floor'), h('label', { class: 'nf' }, ins.elev, h('span', { class: 'u' }, 'cm')));
    ins.level = h('select', { 'aria-label': 'Level', onchange: (e) => this.moveToLevel(e.target.value) }, LEVELS.map(([v, l]) => h('option', { value: v }, l)));
    const levelRow = h('div', { class: 'row' }, h('span', { class: 'k' }, 'Level'), ins.level);
    const secPlace = h('div', { class: 'sec' }, h('div', { class: 'sh' }, 'Placement'), rotRow, elevRow, levelRow);
    // actions
    ins.lockBtn = h('button', { class: 'act', onclick: () => { const id = app.selected, r = app.items.get(id); if (r) app.patchItem(id, { locked: r.locked ? undefined : true }); } });
    ins.hideBtn = h('button', { class: 'act', onclick: () => { const id = app.selected, r = app.items.get(id); if (r) { app.patchItem(id, { hidden: true }); app.select(null); this.toast(`Hid ${this.nameOf(r)} — find it under In the house`, { action: 'Undo', run: () => app.undo() }); } } });
    const acts = h('div', { class: 'acts' },
      h('button', { class: 'act', onclick: () => app.selected && app.duplicate(app.selected) }, icon('copy'), 'Duplicate'),
      h('button', { class: 'act', onclick: () => app.selected && this.setReplace(app.selected) }, icon('swap'), 'Replace…'),
      ins.lockBtn, ins.hideBtn,
      h('button', { class: 'act danger', onclick: () => app.selected && app.removeItem(app.selected) }, icon('trash'), 'Delete'));
    ins.note = h('p', { class: 'ins-note', hidden: true });
    this.insp = h('aside', { class: 'inspector panel', 'aria-label': 'Selected item', hidden: true },
      h('div', { class: 'ins-head' }, ins.name, close), ins.sub, ins.note, secSize, ins.secColor, ins.secShape, secPlace, acts);
    this.root.append(this.insp);
  }
  _floorY(rec) {
    if (rec.floor !== 'site') return LV[rec.floor];
    return 0;
  }
  renderInspector() {
    const app = this.app, id = app.selected, rec = id && app.items.get(id), ins = this.ins;
    this.insp.hidden = !rec;
    this.root.classList.toggle('has-sel', !!rec);
    if (!rec) return;
    if (document.activeElement !== ins.name) ins.name.value = this.nameOf(rec);
    const def = CATALOG[rec.type], m = rec.model ? app.models.get(rec.model) : rec.photo ? app.models.get(rec.photo) : null;
    const kindLabel = rec.type === 'model' ? 'Your 3D model' : rec.type === 'photoBox' ? 'Your photo item' : def ? def.name : rec.type;
    ins.sub.textContent = `${kindLabel} · ${FLOOR_NAMES[rec.floor] || ''}${rec.orig ? ' · from the photos' : ''}`;
    ins.note.hidden = !(m && m.status === 'error');
    if (m && m.status === 'error') ins.note.textContent = 'This model could not be loaded: ' + m.error;
    ins.lock.setAttribute('aria-pressed', this.lockRatio); ins.lock.classList.toggle('on', this.lockRatio);
    ins.secColor.hidden = !(def && def.color !== undefined && rec.type !== 'photoBox');
    if (!ins.secColor.hidden) ins.color.value = HEX(rec.p.color ?? def.color ?? 0x888888);
    ins.secShape.hidden = rec.type !== 'photoBox';
    if (rec.type === 'photoBox') ins.shape.value = rec.p.shape || 'box';
    ins.level.value = rec.floor;
    ins.lockBtn.replaceChildren(icon(rec.locked ? 'unlock' : 'lock'), rec.locked ? 'Unlock' : 'Lock');
    ins.hideBtn.replaceChildren(icon('eyeOff'), 'Hide');
    for (const el of [ins.w, ins.d, ins.h]) el.querySelector('input').disabled = !!rec.locked;
    this.liveInspector();
  }
  liveInspector() {
    const rec = this.app.selected && this.app.items.get(this.app.selected); if (!rec) return;
    const ins = this.ins, act = document.activeElement;
    const set = (wrap, v) => { const i = wrap.tagName === 'INPUT' ? wrap : wrap.querySelector('input'); if (i && i !== act) i.value = v; };
    set(ins.w, cm(rec.p.w)); set(ins.d, cm(rec.p.d)); set(ins.h, cm(rec.p.h));
    let deg = Math.round(-(rec.ry || 0) * 180 / Math.PI) % 360; if (deg < 0) deg += 360;
    set(ins.rot, deg);
    set(ins.elev, Math.round((rec.y - this._floorY(rec)) * 100));
  }
  resetSize() {
    const app = this.app, id = app.selected, rec = app.items.get(id); if (!rec) return;
    let s;
    if (rec.type === 'model' || rec.type === 'photoBox') { const m = app.models.get(rec.model || rec.photo); s = m && (m.meta.target || m.meta.size); }
    else { const d = CATALOG[rec.type].dims; s = { w: d[0], d: d[1], h: d[2] }; }
    if (s) app.patchItem(id, { p: { ...rec.p, w: s.w, d: s.d, h: s.h } });
  }
  moveToLevel(f) {
    const app = this.app, id = app.selected, rec = app.items.get(id); if (!rec || rec.floor === f) return;
    const off = rec.y - this._floorY(rec);
    let y = (f === 'site' ? 0 : LV[f]) + off;
    if (itemKind(rec, app.models) === 'hang' && f !== 'site') y = CEIL[f] - rec.p.h;
    app.patchItem(id, { floor: f, y: +y.toFixed(4) });
    if (f !== 'site' && !app.state.walk) app.setView(f);
    app.select(id);
  }

  // ------------------------------------------------------------ room names in floor views
  _labels() {
    this.labelBox = h('div', { class: 'labels', 'aria-hidden': 'true' });
    this.app.stage.container.append(this.labelBox);
    this.labelEls = [];
    this.app.stage.renderHooks.push(() => this._placeLabels());
    this._buildLabels();
  }
  _buildLabels() {
    const S = this.app.state, f = S.walk || S.view === 'outside' ? null : S.view;
    this.labelEls = [];
    this.labelBox.replaceChildren();
    if (!f || !this.showLabels || !ROOMS[f]) return;
    for (const r of ROOMS[f]) {
      const el = h('span', { class: 'rl' }, r.name);
      this.labelBox.append(el);
      this.labelEls.push({ el, v: new THREE.Vector3(r.x, LV[f] + 0.05, r.z) });
    }
    this.app.stage.dirty();
  }
  _placeLabels() {
    if (!this.labelEls.length) return;
    const st = this.app.stage, cam = st.camera, W = st.container.clientWidth, H = st.container.clientHeight, p = new THREE.Vector3();
    for (const L of this.labelEls) {
      p.copy(L.v).project(cam);
      const out = p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05;
      L.el.style.visibility = out ? 'hidden' : '';
      if (!out) L.el.style.transform = `translate(${((p.x + 1) / 2 * W).toFixed(1)}px, ${((1 - p.y) / 2 * H).toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  // ------------------------------------------------------------ hints, toasts, modals
  _hint() { this.hintEl = h('div', { class: 'hint', 'aria-live': 'polite' }); this.root.append(this.hintEl); this._hintText(); }
  _hintText() {
    const app = this.app, S = app.state, nh = app.notes && app.notes.hint;
    let t;
    if (nh) t = nh;
    else if (app.editor && app.editor.measure.active) t = 'Click two points to measure · Shift keeps the line straight · Esc to finish';
    else if (S.walk) t = touch ? 'Drag to look around · tap the floor to walk there' : 'Drag to look · W A S D to walk (Shift runs) · click the floor to go there · Esc leaves';
    else if (app.selected) t = touch ? 'Drag the item to move it · drag the ring to turn it' : 'Drag to move · drag the ring to turn (Shift: 15° steps) · R turns · Delete removes · F focuses';
    else t = touch ? 'Tap an item to select it · pinch to zoom · two fingers to pan' : 'Click an item to select it · drag empty space to orbit · right-drag pans · scroll zooms';
    this.hintEl.textContent = t;
  }
  _toasts() { this.toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' }); this.root.append(this.toastBox); }
  toast(msg, { action, run, error, ms } = {}) {
    const el = h('div', { class: 'toast' + (error ? ' err' : '') }, h('span', {}, msg), action ? h('button', { class: 'link', onclick: () => { run(); el.remove(); } }, action) : null);
    this.toastBox.append(el);
    while (this.toastBox.children.length > 3) this.toastBox.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms || (error ? 7000 : 4200));
  }
  modal(title, body, buttons = [], { wide = false, onClose } = {}) {
    if (this.modalEl) this.modalEl.close();
    const close = () => { wrap.remove(); this.modalEl = null; if (onClose) onClose(); document.removeEventListener('keydown', esc, true); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const foot = h('div', { class: 'm-foot' }, buttons.map((b) => h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), onclick: () => b.run(close), disabled: b.disabled }, b.label)));
    const box = h('div', { class: 'modal panel' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'm-head' }, h('h2', {}, title), h('button', { class: 'tb icon x', 'aria-label': 'Close', onclick: close }, icon('x'))),
      h('div', { class: 'm-body' }, body), buttons.length ? foot : null);
    const wrap = h('div', { class: 'scrim', onclick: (e) => { if (e.target === wrap) close(); } }, box);
    this.root.append(wrap);
    document.addEventListener('keydown', esc, true);
    this.modalEl = { close, box, foot };
    setTimeout(() => { const f = box.querySelector('input:not([type=checkbox]):not([type=file]), select'); if (f && !touch) f.focus(); }, 30);
    return this.modalEl;
  }

  // ------------------------------------------------------------ drag and drop, paste
  _drops() {
    const stage = this.app.stage.container, root = this.root;
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    root.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; root.classList.add('filedrop'); } });
    root.addEventListener('dragleave', (e) => { if (hasFiles(e)) { depth = Math.max(0, depth - 1); if (!depth) root.classList.remove('filedrop'); } });
    root.addEventListener('dragover', (e) => { if (hasFiles(e) || [...(e.dataTransfer?.types || [])].includes('text/x-villa')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    root.addEventListener('drop', (e) => {
      depth = 0; root.classList.remove('filedrop');
      const spec = e.dataTransfer.getData('text/x-villa');
      if (spec) { e.preventDefault(); if (stage.contains(e.target) || e.target === stage) { const r = this.app.placeNew(JSON.parse(spec), { clientX: e.clientX, clientY: e.clientY }); if (r) this.toast(`Added ${this.nameOf(r)}`); } return; }
      if (hasFiles(e)) { e.preventDefault(); filesFromDrop(e.dataTransfer).then((f) => this.handleFiles(f)).catch(() => this.handleFiles([...e.dataTransfer.files])); }
    });
    window.addEventListener('paste', (e) => {
      const t = e.target; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); this.importPhoto(f); }
    });
  }
  async handleFiles(files) {
    if (!files.length) return;
    // pictures dropped while a note is being written are references for that note
    const notes = this.app.notes;
    if (notes && notes.busy) {
      const pics = files.filter((f) => IMAGE_EXT.includes(ext(f.name || '')) || (f.type || '').startsWith('image/'));
      if (pics.length) return notes.addImages(pics);
    }
    let nameHint;
    if (files.some((f) => ext(f.name) === 'zip')) {
      try { const ex = await expandZips(files); nameHint = ex.zipName; files = [...ex]; } catch (e) { this.toast(e.message, { error: true }); return; }
    }
    const models = files.filter((f) => MODEL_EXT.includes(ext(f.name)));
    if (models.length) return this.importModel(files, nameHint);
    const img = files.find((f) => IMAGE_EXT.includes(ext(f.name)) || f.type.startsWith('image/'));
    if (img) return this.importPhoto(img);
    if (files.some((f) => ext(f.name) === 'json')) return this.importLayoutFile(files.find((f) => ext(f.name) === 'json'));
    this.toast(files.some((f) => ext(f.name) === 'skp') ? 'SketchUp files can’t be read here — export it as .dae, .obj or .glb first.' : 'That file type isn’t supported. Use a 3D model (GLB, FBX, OBJ…) or a photo.', { error: true });
  }

  // ------------------------------------------------------------ importing a 3D model
  async importModel(files, nameHint) {
    const replace = this.replaceId;
    const wait = this.modal('Reading the model…', h('div', { class: 'loading-row' }, h('i', { class: 'spin' }), `Opening ${files.map((f) => f.name).slice(0, 3).join(', ')}${files.length > 3 ? '…' : ''}`));
    let loaded;
    try { loaded = await loadModelFiles(files, { nameHint }); }
    catch (e) { wait.close(); this.modal('That model didn’t open', h('p', { class: 'err-p' }, String(e && e.message || e)), [{ label: 'OK', primary: true, run: (c) => c() }]); return; }
    wait.close();
    const st = { name: loaded.name, upZ: loaded.upZ, yaw: 0, mount: 'floor', unit: 1, native: null };
    const UNITS = [[1, 'Metres'], [0.01, 'Centimetres'], [0.001, 'Millimetres'], [0.0254, 'Inches']];
    const measure = () => { st.native = normalizeModel(loaded.object.clone(true), { upZ: st.upZ, yaw: st.yaw }).size; };
    measure();
    const big = Math.max(st.native.w, st.native.d, st.native.h);
    st.unit = big > 600 ? 0.001 : big > 25 ? 0.01 : 1;
    const target = () => ({ w: st.native.w * st.unit, d: st.native.d * st.unit, h: st.native.h * st.unit });
    st.size = target();
    const img = h('img', { alt: 'Preview of the model' });
    let shot = 0;
    const preview = () => {
      const key = 'imp:' + (++shot);
      this.app.thumbs.request(key, () => { const tpl = normalizeModel(loaded.object.clone(true), { upZ: st.upZ, yaw: st.yaw }).template; tpl.userData.keepAfterThumb = true; return tpl; }, (u) => { if (u) img.src = u; this.app.thumbs.forget(key); });
    };
    preview();
    const fields = {};
    const dimInput = (k, label) => { const i = h('input', { type: 'number', class: 'num', min: '0.5', step: '0.5', 'aria-label': label, oninput: () => onDim(k) }); fields[k] = i; return h('label', { class: 'nf' }, h('span', { class: 'k' }, label), i); };
    let keep = true;
    const fill = () => { for (const k of ['w', 'd', 'h']) if (document.activeElement !== fields[k]) fields[k].value = +(st.size[k] * 100).toFixed(1); native.textContent = `The file measures ${fmt(st.native.w)} × ${fmt(st.native.d)} × ${fmt(st.native.h)} in its own units.`; };
    const fmt = (v) => (+v.toPrecision(3)).toString();
    const onDim = (k) => {
      const v = parseFloat(fields[k].value) / 100; if (!(v > 0)) return;
      if (keep) { const f = v / st.size[k]; st.size = { w: st.size.w * f, d: st.size.d * f, h: st.size.h * f }; } else st.size = { ...st.size, [k]: v };
      fill();
    };
    const unitSel = h('select', { 'aria-label': 'Units of the file', onchange: (e) => { st.unit = +e.target.value; st.size = target(); fill(); } }, UNITS.map(([v, l]) => h('option', { value: v, selected: v === st.unit }, l)));
    const native = h('p', { class: 'fine' });
    const keepBox = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { keep = e.target.checked; } }), 'Keep proportions');
    const nameIn = h('input', { value: st.name, 'aria-label': 'Name', oninput: (e) => { st.name = e.target.value; } });
    const turn = h('button', { class: 'btn sm', onclick: () => { st.yaw = (st.yaw + Math.PI / 2) % (Math.PI * 2); const s = st.size; measure(); st.size = { w: s.d, d: s.w, h: s.h }; fill(); preview(); } }, icon('rotR'), 'Turn 90°');
    const upz = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.upZ, onchange: (e) => { st.upZ = e.target.checked; measure(); st.size = target(); fill(); preview(); } }), 'It’s lying on its back (Z-up file)');
    const mountSeg = h('div', { class: 'seg small' }, [['floor', 'Floor'], ['wall', 'Wall'], ['hang', 'Ceiling']].map(([v, l]) => h('button', { class: 'seg-b' + (v === st.mount ? ' on' : ''), onclick: (e) => { st.mount = v; for (const b of e.target.parentNode.children) b.classList.toggle('on', b === e.target); } }, l)));
    const warn = loaded.warnings.length ? h('ul', { class: 'warn' }, loaded.warnings.map((w) => h('li', {}, w))) : null;
    const body = h('div', { class: 'imp' },
      h('div', { class: 'imp-prev' }, img, h('p', { class: 'fine' }, `${(loaded.tris / 1000).toFixed(loaded.tris < 10000 ? 1 : 0)}k triangles · ${loaded.kind.toUpperCase()}`)),
      h('div', { class: 'imp-form' },
        h('label', { class: 'field' }, h('span', { class: 'fl' }, 'Name'), nameIn),
        h('div', { class: 'field' }, h('span', { class: 'fl' }, 'Real size (from the product page) — W × D × H'), h('div', { class: 'dims' }, dimInput('w', 'W'), dimInput('d', 'D'), dimInput('h', 'H'), h('span', { class: 'u' }, 'cm')), keepBox),
        h('div', { class: 'field row' }, h('span', { class: 'fl' }, 'The file is in'), unitSel), native,
        h('div', { class: 'field' }, h('span', { class: 'fl' }, 'Orientation — the front should face you in the preview'), h('div', { class: 'row' }, turn, upz)),
        h('div', { class: 'field' }, h('span', { class: 'fl' }, 'It goes on the'), mountSeg),
        warn));
    fill();
    this.modal(replace ? `Replace with “${st.name}”` : `Add “${st.name}”`, body, [
      { label: 'Cancel', run: (c) => { c(); loaded.release(); } },
      { label: replace ? 'Replace in the villa' : 'Add to the villa', primary: true, run: (c) => {
        c();
        const t = { w: +st.size.w.toFixed(4), d: +st.size.d.toFixed(4), h: +st.size.h.toFixed(4) };
        this.app.addImportedModel(loaded, { name: st.name.trim() || 'Imported item', upZ: st.upZ, yaw: st.yaw, target: t, mount: st.mount, replace });
        if (replace) this.setReplace(null);
        this.showTab('mine');
      } },
    ], { wide: true });
  }

  // ------------------------------------------------------------ importing a photo
  async importPhoto(file) {
    const replace = this.replaceId;
    let img;
    const url = URL.createObjectURL(file);
    try { img = await loadImage(url); } catch (e) { this.toast(e.message, { error: true }); URL.revokeObjectURL(url); return; }
    const scaled = drawScaled(img, 1500);
    const cut = cutoutBackground(scaled);
    URL.revokeObjectURL(url);
    const name0 = file.name && !/^image\.\w+$/i.test(file.name) ? file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() : 'Photo item';
    const st = { name: name0[0].toUpperCase() + name0.slice(1), shape: cut ? 'cutout' : 'box', removeBg: !!cut };
    const aspectOf = () => { const c = st.removeBg && cut ? cut : scaled; return c.width / c.height; };
    const defaults = (shape) => {
      const a = aspectOf();
      if (shape === 'cutout') return { w: +(0.9 * a).toFixed(3), d: 0.02, h: 0.9 };
      if (shape === 'panel') return { w: 1.0, d: 0.03, h: +(1.0 / a).toFixed(3) };
      if (shape === 'rug') return { w: 2.0, d: +(2.0 / a).toFixed(3), h: 0.012 };
      if (shape === 'cylinder') return { w: 0.6, d: 0.6, h: 0.75 };
      return { w: 0.8, d: 0.6, h: +(0.8 / a).toFixed(3) };
    };
    st.size = defaults(st.shape);
    const prev = h('canvas', { class: 'ph-prev' });
    const drawPrev = () => {
      const src = st.removeBg && cut ? cut : scaled, k = Math.min(1, 320 / Math.max(src.width, src.height));
      prev.width = Math.round(src.width * k); prev.height = Math.round(src.height * k);
      const g = prev.getContext('2d'); g.clearRect(0, 0, prev.width, prev.height); g.drawImage(src, 0, 0, prev.width, prev.height);
    };
    drawPrev();
    const fields = {};
    const fill = () => { for (const k of ['w', 'd', 'h']) if (document.activeElement !== fields[k]) fields[k].value = +(st.size[k] * 100).toFixed(1); fields.d.disabled = st.shape === 'cutout' || st.shape === 'panel'; };
    const dimInput = (k, label) => { const i = h('input', { type: 'number', class: 'num', min: '0.5', step: '0.5', 'aria-label': label, oninput: () => { const v = parseFloat(i.value) / 100; if (v > 0) { if (st.shape === 'cutout' || st.shape === 'panel') { const a = aspectOf(); if (k === 'w') st.size = { ...st.size, w: v, h: v / a }; else if (k === 'h') st.size = { ...st.size, h: v, w: v * a }; } else st.size = { ...st.size, [k]: v }; fill(); } } }); fields[k] = i; return h('label', { class: 'nf' }, h('span', { class: 'k' }, label), i); };
    const bg = h('label', { class: 'chk' + (cut ? '' : ' dim') }, h('input', { type: 'checkbox', checked: st.removeBg, disabled: !cut, onchange: (e) => { st.removeBg = e.target.checked; drawPrev(); st.size = defaults(st.shape); fill(); } }), cut ? 'Remove the plain background' : 'No plain background found to remove');
    const shapes = [['cutout', 'Stand-up cut-out'], ['box', 'Box'], ['panel', 'Wall panel / art'], ['rug', 'Rug'], ['cylinder', 'Round']];
    const shapeSeg = h('div', { class: 'seg small wrap' }, shapes.map(([v, l]) => h('button', { class: 'seg-b' + (v === st.shape ? ' on' : ''), onclick: (e) => { st.shape = v; for (const b of e.target.parentNode.children) b.classList.toggle('on', b === e.target); st.size = defaults(v); fill(); } }, l)));
    const body = h('div', { class: 'imp' },
      h('div', { class: 'imp-prev checker' }, prev),
      h('div', { class: 'imp-form' },
        h('label', { class: 'field' }, h('span', { class: 'fl' }, 'Name'), h('input', { value: st.name, oninput: (e) => { st.name = e.target.value; } })),
        h('div', { class: 'field' }, h('span', { class: 'fl' }, 'Show it as'), shapeSeg), bg,
        h('div', { class: 'field' }, h('span', { class: 'fl' }, 'Real size — W × D × H'), h('div', { class: 'dims' }, dimInput('w', 'W'), dimInput('d', 'D'), dimInput('h', 'H'), h('span', { class: 'u' }, 'cm'))),
        h('p', { class: 'fine' }, 'A cut-out stands upright like a life-size photo — good for chairs, lamps and plants. A box puts the photo on the front of a block the size you give.')));
    fill();
    this.modal(replace ? 'Replace with a photo item' : 'Add a photo item', body, [
      { label: 'Cancel', run: (c) => c() },
      { label: replace ? 'Replace in the villa' : 'Add to the villa', primary: true, run: async (c) => {
        c();
        const useCut = st.removeBg && cut;
        const src = useCut ? cut : scaled;
        const blob = await canvasBlob(src, useCut || st.shape === 'cutout' ? 'image/png' : 'image/jpeg', 0.88);
        const t = { w: +st.size.w.toFixed(4), d: +Math.max(0.005, st.size.d).toFixed(4), h: +st.size.h.toFixed(4) };
        await this.app.addPhoto({ blob, name: st.name.trim() || 'Photo item', shape: st.shape, target: t, replace, mount: st.shape === 'panel' ? 'wall' : 'floor' });
        if (replace) this.setReplace(null);
        this.showTab('mine');
      } },
    ], { wide: true });
  }

  // ------------------------------------------------------------ menu dialogs
  async screenshot() {
    try {
      const blob = await this.app.stage.snapshot(2);
      const v = this.app.state.walk ? 'walk' : this.app.state.view;
      const r = await this.app.store.download(`villa-alera-55-${v}.png`, blob);
      if (r === 'saved') this.toast('Picture saved');
      else if (r === 'unavailable') this.toast('Saving files isn’t available in this view.', { error: true });
    } catch (e) { this.toast('Couldn’t save the picture: ' + (e && e.message || e), { error: true }); }
  }
  async exportLayout() {
    const app = this.app;
    const data = { app: 'villa-alera-55', version: 1, exportedAt: new Date().toISOString(), items: app.items.records(), models: app.models.all().map((m) => ({ ...m.meta })) };
    try { const r = await app.store.download('villa-alera-55-layout.json', JSON.stringify(data, null, 1)); if (r === 'saved') this.toast('Layout exported'); else if (r === 'unavailable') this.toast('Saving files isn’t available in this view.', { error: true }); }
    catch (e) { this.toast('Export failed: ' + (e && e.message || e), { error: true }); }
  }
  pickLayoutFile() { const i = h('input', { type: 'file', accept: '.json,application/json', onchange: (e) => e.target.files[0] && this.importLayoutFile(e.target.files[0]) }); i.click(); }
  async importLayoutFile(f) {
    try {
      const d = JSON.parse(await f.text());
      const items = Array.isArray(d) ? d : d.items;
      if (!Array.isArray(items) || !items.every((r) => r && r.id && r.type && Number.isFinite(r.x) && Number.isFinite(r.z))) throw new Error('This isn’t a villa layout file.');
      const missing = items.filter((r) => (r.model && !this.app.models.get(r.model)) || (r.photo && !this.app.models.get(r.photo))).length;
      this.app.loadRecords(items, `Imported ${items.length} items${missing ? ` (${missing} refer to models that aren’t stored here)` : ''}`);
    } catch (e) { this.toast(String(e.message || e), { error: true }); }
  }
  saveCopyDialog() {
    const inp = h('input', { value: 'Layout ' + new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), 'aria-label': 'Name' });
    this.modal('Save a copy', h('div', {}, h('label', { class: 'field' }, h('span', { class: 'fl' }, 'Name'), inp), h('p', { class: 'fine' }, 'Saves the current arrangement so you can come back to it after trying other ideas.')), [
      { label: 'Cancel', run: (c) => c() },
      { label: 'Save', primary: true, run: async (c) => { c(); try { await this.app.store.saveCopy(inp.value.trim() || 'Layout', this.app.items.records()); this.toast('Saved “' + (inp.value.trim() || 'Layout') + '”'); } catch (e) { this.toast('Couldn’t save: ' + (e && e.message || e), { error: true }); } } },
    ]);
  }
  async openSavedDialog() {
    const list = h('div', { class: 'saved' }, h('div', { class: 'loading-row' }, h('i', { class: 'spin' }), 'Loading…'));
    const m = this.modal('Saved layouts', list, [{ label: 'Close', run: (c) => c() }]);
    const rows = await this.app.store.listSaved();
    if (!rows.length) { list.replaceChildren(h('p', { class: 'empty' }, 'No saved layouts yet. Use “Save a copy” to keep one.')); return; }
    list.replaceChildren(...rows.map((r) => h('div', { class: 'srow' },
      h('div', {}, h('div', { class: 'n' }, r.name), h('div', { class: 'd' }, `${r.count ?? '?'} items · ${r.updatedAt ? new Date(r.updatedAt).toLocaleString() : ''}`)),
      h('button', { class: 'btn sm', onclick: async () => { const items = await this.app.store.loadSaved(r.id); m.close(); if (items) this.app.loadRecords(items, `Opened “${r.name}”`); } }, 'Open'),
      h('button', { class: 'tb icon sm', 'aria-label': 'Delete ' + r.name, onclick: async (e) => { await this.app.store.deleteSaved(r.id); e.target.closest('.srow').remove(); } }, icon('trash')))));
  }
  resetDialog() {
    this.modal('Back to the original furniture?', h('p', {}, 'This puts back the furniture from your photos and removes everything you added or moved. Your imported models stay under Your items, and you can undo this.'), [
      { label: 'Cancel', run: (c) => c() },
      { label: 'Reset the furniture', danger: true, run: (c) => { c(); this.app.resetLayout(); this.toast('Original furniture restored', { action: 'Undo', run: () => this.app.undo() }); } },
    ]);
  }
  deleteModelDialog(id) {
    const m = this.app.models.get(id); if (!m) return;
    const n = this.app.items.list().filter((r) => r.model === id || r.photo === id).length;
    this.modal(`Delete “${m.meta.name}”?`, h('p', {}, n ? `It’s placed ${n} time${n > 1 ? 's' : ''} in the villa; those copies will be removed too. This can’t be undone.` : 'It will be removed from your items. This can’t be undone.'), [
      { label: 'Cancel', run: (c) => c() },
      { label: 'Delete', danger: true, run: (c) => { c(); this.app.deleteModel(id); } },
    ]);
  }
  shortcutsDialog() {
    const rows = [['Click / tap', 'Select an item'], ['Drag an item', 'Move it (its back snaps to nearby walls)'], ['Drag the ring', 'Turn it (hold Shift for 15° steps)'], ['R / Shift + R', 'Turn 15° either way'], ['Arrow keys', 'Nudge 2 cm (Shift: 10 cm)'], ['Delete', 'Remove the selected item'], ['Ctrl/⌘ + D', 'Duplicate'], ['Ctrl/⌘ + Z', 'Undo (Shift for redo)'], ['F or double-click', 'Focus on the item'], ['N', 'New note: circle what should change on this view'], ['M', 'Tape measure'], ['W A S D', 'Walk (in Walk mode)'], ['Esc', 'Deselect, stop measuring, leave Walk']];
    this.modal('Keyboard shortcuts', h('table', { class: 'keys' }, rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))), [{ label: 'Done', primary: true, run: (c) => c() }]);
  }
}
