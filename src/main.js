// Villa Alera 55 — layout studio. Wires the building, the furniture, the editor and storage.
import * as THREE from 'three';
import { Stage } from './scene.js';
import { buildMaterials, MAT } from './materials.js';
import { buildFurnitureMaterials, CATALOG, setCurtainOpacity } from './furniture.js';
import { buildVilla } from './building.js';
import { builtinLayout, migrateLayout } from './layout.js';
import { Items, ModelLibrary, normalizeModel, clone, floorIndex, itemKind } from './items.js';
import { Editor } from './editor.js';
import { Store } from './store.js';
import { Thumbs } from './thumbs.js';
import { UI } from './ui.js';
import { Notes } from './notes.js';
import { parseGLTF, exportGLB } from './importer.js';
import { LV, CEIL, CUT_H, WING, toWing, uid } from './util.js';
import { applyRealTextures, loadSky } from './realtex.js';

const FLOORS = ['b1', 'gf', 'ff', 'at'];
const VIEW_CAM = {
  outside: { pos: [17, 13.5, -25], target: [-0.8, 2.6, 0.2] },
  b1: { pos: [6.5, LV.b1 + 21, 16.5], target: [-0.4, LV.b1 + 0.3, 2.2] },
  gf: { pos: [6, LV.gf + 20, 14.5], target: [-0.6, LV.gf + 0.5, 0.2] },
  ff: { pos: [6, LV.ff + 19.5, 14], target: [-0.6, LV.ff + 0.5, 0.2] },
  at: { pos: [5.5, LV.at + 18, 13], target: [-0.8, LV.at + 0.4, 0.0] },
};
const SPAWN = {
  outside: { pos: [-0.15, -1.32 + 1.6, -12.2], look: [-0.3, 1.8, 0] },
  b1: { pos: [-4.3, LV.b1 + 1.6, -3.4], look: [-4.3, LV.b1 + 1.3, 4.0] },
  gf: { pos: [0.1, LV.gf + 1.6, -3.0], look: [-2.6, LV.gf + 1.3, 3.0] },   // the hall: floating stair, glass wall, garden below
  ff: { pos: [-0.6, LV.ff + 1.6, -3.7], look: [3.0, LV.ff + 1.3, 1.5] },
  at: { pos: [-4.4, LV.at + 1.6, -5.6], look: [-4.4, LV.at + 1.3, 4.5] },
};
const DEFAULT_SPOT = { b1: [-4.3, 0.2], gf: [-4.5, -4.6], ff: [-0.3, -3.1], at: [-4.4, -2.0], site: [-5.0, -9.0] };

class App {
  constructor() {
    this.listeners = new Map();
    this.state = { view: 'outside', lowWalls: true, walk: false, walkFloor: 'gf', showOriginal: true, snap: false, light: 'day' };
    this.history = { undo: [], redo: [] };
    this._applyingRemote = false;
  }
  on(ev, fn) { if (!this.listeners.has(ev)) this.listeners.set(ev, new Set()); this.listeners.get(ev).add(fn); return () => this.listeners.get(ev).delete(fn); }
  emit(ev, ...a) { const s = this.listeners.get(ev); if (s) for (const fn of s) fn(...a); }

  async start() {
    const host = document.getElementById('stage');
    const stage = this.stage = new Stage(host);
    this.store = new Store((s, msg) => { this.status = s; this.emit('status', s, msg); });
    this.models = new ModelLibrary();
    this.thumbs = new Thumbs();
    if (stage.failed || !stage.renderer) { this.ui = new UI(this, { noGL: true }); return; }
    const T = this.timings = { startAt: Math.round(performance.now()) }, t0 = performance.now(), mark = (k) => { T[k] = Math.round(performance.now() - t0); };
    buildMaterials(stage.renderer); mark('materials');
    buildFurnitureMaterials(); mark('furnitureMaterials');
    this._buildHouse(); mark('house');
    this.items = new Items(stage, this.models, (pid) => this.photoUrl(pid));
    this.items.onNeedModel = (id) => this.loadModel(id);
    stage.scene.add(this.items.root);
    this.editor = new Editor(this);
    this.ui = new UI(this);
    this.notes = new Notes(this);
    // first paint: the layout cached in this browser, else the furniture from the photos
    const cached = this.store.cachedLayout();
    const mig = cached && cached.items && cached.items.length ? migrateLayout(cached.items, cached.rev || 1) : null;
    this._migrated = !!(mig && mig.changed);
    this.items.load(mig ? mig.recs : builtinLayout().map((r) => ({ ...r, orig: true })));
    this.layoutStamp = cached ? cached.updatedAt : '';
    mark('items');
    this.applyView('outside', { instant: true });
    stage.camera.position.set(34, 22, -44);
    this.flyToView('outside', 1800);
    this.emit('ready'); mark('ui');
    requestAnimationFrame(() => requestAnimationFrame(() => mark('firstFrames')));
    this._connect();
    this._upgradeSurfaces();
  }
  // day or dusk; at dusk the rooms are lit, so ceilings, walls and floors glow warm through the glass (photo 10)
  setLight(mode) {
    const dusk = mode === 'dusk';
    this.state.light = dusk ? 'dusk' : 'day';
    this.stage.setDusk(dusk);
    const glow = { ceiling: [0xffd2a0, 0.62], plaster: [0xffd9ad, 0.36], plasterWarm: [0xffd6a6, 0.36], marble: [0xffd6a2, 0.12], marbleSlab: [0xffd6a2, 0.12], woodFloor: [0xffc890, 0.1], led: [0xffe2b0, 4.0] };
    for (const [k, [c, i]] of Object.entries(glow)) {
      const m = MAT[k]; if (!m || !m.emissive) continue;
      if (!m.userData.day) m.userData.day = { e: m.emissive.getHex(), i: m.emissiveIntensity };
      m.emissive.setHex(dusk ? c : m.userData.day.e); m.emissiveIntensity = dusk ? i : m.userData.day.i;
    }
    // the outdoor downlights (entrance bay, under the wood box) throw warm pools of light at dusk
    if (dusk && !this._lamps) {
      this._lamps = new THREE.Group(); this._lamps.name = 'dusk-lamps';
      for (const [x, y, z] of this.villa.lamps || []) {
        const l = new THREE.SpotLight(0xffc98a, 32, 7, 0.8, 0.8, 1.6);
        l.position.set(x, y, z); l.target.position.set(x, y - 3, z);
        this._lamps.add(l, l.target);
      }
      this.stage.scene.add(this._lamps);
    }
    if (this._lamps) this._lamps.visible = dusk;
    this.stage.dirty(true);
    this.emit('light', this.state.light);
  }
  // Poly Haven textures and sky (published next to the page); the procedural look stays until they arrive
  async _upgradeSurfaces() {
    const st = this.stage, T = this.timings;
    try { T.textures = await applyRealTextures(MAT, st.renderer); st.dirty(true); } catch (e) { T.textures = 'failed'; }
    try { st.setSky(await loadSky(st.renderer)); T.sky = true; } catch (e) { T.sky = false; }
    this.emit('surfaces');
  }

  // ------------------------------------------------------------ building layers
  _buildHouse() {
    const V = this.villa = buildVilla(MAT);
    const root = this.houseRoot = new THREE.Group(); root.name = 'villa';
    this.layers = {};
    this.walkFloorOf = new Map();
    for (const f of FLOORS) {
      const L = V.floors[f], g = new THREE.Group(); g.name = f;
      for (const k of ['full', 'cut', 'base', 'walk', 'glass', 'rails', 'doors', 'swings']) g.add(L[k]);
      // a clipped copy of the glass material so windows stop at the cut height in plan views
      L.glass.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material.clone(); m.clippingPlanes = []; m.userData = { ...o.material.userData }; o.material = m;
        o.userData.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), LV[f] + CUT_H);
      });
      for (const m of V.walkables[f]) this.walkFloorOf.set(m, f);
      root.add(g); this.layers[f] = L;
    }
    for (const m of V.walkables.site) this.walkFloorOf.set(m, 'site');
    const site = new THREE.Group(); site.name = 'site';
    site.add(V.site.walk, V.site.base, V.site.water, V.site.rails);
    root.add(site);
    this.roof = new THREE.Group(); this.roof.add(V.roof, V.roofGlass); root.add(this.roof);
    this.stage.scene.add(root);
    this._occ = null;
  }
  // which parts of the building show for the current view
  applyView(view, { instant = false } = {}) {
    const S = this.state, walk = S.walk;
    if (view) S.view = view;
    const cur = walk || S.view === 'outside' ? 99 : floorIndex(S.view);
    for (const f of FLOORS) {
      const L = this.layers[f], i = floorIndex(f);
      const isCur = i === cur && !walk && S.view !== 'outside';
      const shown = i <= cur;
      const low = isCur && S.lowWalls;
      L.full.visible = shown && !low; L.cut.visible = low;
      L.base.visible = shown; L.walk.visible = shown; L.rails.visible = shown;
      L.glass.visible = shown; L.doors.visible = shown && !low; L.swings.visible = low;
      L.glass.traverse((o) => { if (o.isMesh) { o.material.clippingPlanes = low ? [o.userData.clipPlane] : []; o.material.needsUpdate = true; } });
    }
    this.roof.visible = walk || S.view === 'outside';
    setCurtainOpacity(walk || S.view === 'outside' ? 0.82 : 0.3);
    this.stage.setEnvBase(walk ? 1.3 : 0.85);
    this.items.setVisibility((rec) => this._itemVisible(rec));
    this._occ = null;
    if (this.editor.selected && !this.items.obj(this.editor.selected)?.visible) this.editor.select(null);
    this.stage.dirty(true);
    if (!instant) this.emit('view', S.view);
  }
  _itemVisible(rec) {
    const S = this.state;
    if (rec.orig && !S.showOriginal) return false;
    if (S.walk || S.view === 'outside' || rec.floor === 'site') return true;
    return floorIndex(rec.floor) <= floorIndex(S.view);
  }
  occluders() {
    if (!this._occ) { const a = []; this.houseRoot.traverseVisible((o) => { if (o.isMesh) a.push(o); }); this._occ = a; }
    return this._occ;
  }
  wallMeshes(floor) { return floor === 'site' ? this.villa.walls.site : (this.villa.walls[floor] || []); }
  visibleWalkables() { const out = []; for (const [m, f] of this.walkFloorOf) { let o = m, v = true; while (o) { if (!o.visible) { v = false; break; } o = o.parent; } if (v) out.push(m); void f; } return out; }

  setView(v) {
    if (this.state.walk) { this.state.walkFloor = v; this.applyView(v); this.editor.enterWalk(SPAWN[v]); this.emit('view', v); return; }
    this.applyView(v);
    this.flyToView(v);
  }
  flyToView(v, dur = 800) {
    const c = VIEW_CAM[v], t = new THREE.Vector3(...c.target), off = new THREE.Vector3(...c.pos).sub(t);
    // tall, narrow screens need the camera further back to fit the house
    const st = this.stage, aspect = st.camera.aspect || 1.6;
    if (aspect < 1.25) off.multiplyScalar(Math.min(2.3, Math.pow(1.25 / aspect, 0.8)));
    this.stage.flyTo(t.clone().add(off), t, dur);
  }
  setLowWalls(on) { this.state.lowWalls = on; this.applyView(null); this.emit('walls', on); }
  setWalk(on) {
    if (on === this.state.walk) return;
    this.state.walk = on;
    if (on) {
      const f = this.state.view;
      this.applyView(null);
      this.editor.enterWalk(SPAWN[f] || SPAWN.gf);
    } else {
      this.editor.exitWalk();
      this.applyView(null);
      this.flyToView(this.state.view);
    }
    this.emit('walk', on);
  }
  // stand somewhere in Walk mode looking a given way (a note goes back to where it was made)
  walkTo(spawn, view) {
    const S = this.state, was = S.walk;
    if (view && view !== 'outside') S.walkFloor = view;
    S.walk = true;
    this.applyView(view || null);
    this.editor.enterWalk(spawn);
    if (!was) this.emit('walk', true);
  }
  setShowOriginal(on) { this.state.showOriginal = on; this.applyView(null); this.emit('items-changed'); }

  // ------------------------------------------------------------ items
  get selected() { return this.editor.selected; }
  select(id) { this.editor.select(id); }
  photoUrl(pid) { const m = this.models.get(pid); return m ? this.store.photoUrl(m.meta) : null; }
  commit(action) {
    this.history.undo.push(action);
    if (this.history.undo.length > 150) this.history.undo.shift();
    this.history.redo.length = 0;
    this.emit('history'); this.save();
  }
  _apply(a, dir) {
    const I = this.items;
    if (a.type === 'update') {
      const target = dir === 'undo' ? a.before : a.after, cur = I.get(a.id);
      if (!cur) return;
      const patch = { ...clone(target) };
      for (const k of Object.keys(cur)) if (!(k in target)) patch[k] = undefined;
      delete patch.id; I.update(a.id, patch);
    } else if (a.type === 'add') { if (dir === 'undo') I.remove(a.rec.id); else I.add(a.rec); }
    else if (a.type === 'remove') { if (dir === 'undo') I.add(a.rec); else I.remove(a.rec.id); }
    else if (a.type === 'batch') { const list = dir === 'undo' ? [...a.actions].reverse() : a.actions; for (const s of list) this._apply(s, dir); }
    else if (a.type === 'load') I.load(dir === 'undo' ? a.before : a.after);
  }
  undo() { const a = this.history.undo.pop(); if (!a) return; this._apply(a, 'undo'); this.history.redo.push(a); this.emit('history'); this.emit('items-changed'); this.save(); this.editor.select(this.editor.selected); }
  redo() { const a = this.history.redo.pop(); if (!a) return; this._apply(a, 'redo'); this.history.undo.push(a); this.emit('history'); this.emit('items-changed'); this.save(); }
  save() { if (this._applyingRemote) return; this.layoutStamp = new Date().toISOString(); this.store.saveLayout(this.items.records()); }

  addItem(rec, { select = true } = {}) {
    rec = this.items.add(rec);
    this.commit({ type: 'add', rec: clone(rec) });
    if (select) this.editor.select(rec.id);
    this.emit('items-changed');
    return rec;
  }
  removeItem(id) {
    const rec = this.items.get(id); if (!rec) return;
    const copy = clone(rec);
    this.items.remove(id);
    this.commit({ type: 'remove', rec: copy });
    this.emit('items-changed');
    this.ui.toast(`Removed ${this.ui.nameOf(copy)}`, { action: 'Undo', run: () => this.undo() });
  }
  patchItem(id, patch, { history = true } = {}) {
    const rec = this.items.get(id); if (!rec) return;
    const before = clone(rec);
    this.items.update(id, patch);
    if (history) this.commit({ type: 'update', id, before, after: clone(this.items.get(id)) });
    this.emit('items-changed');
  }
  rotateItem(id, d) {
    const rec = this.items.get(id); if (!rec) return;
    let a = (rec.ry || 0) + d; a = Math.atan2(Math.sin(a), Math.cos(a));
    this.patchItem(id, { ry: +a.toFixed(5) });
  }
  nudge(id, dx, dz) { const r = this.items.get(id); if (r) this.patchItem(id, { x: +(r.x + dx).toFixed(4), z: +(r.z + dz).toFixed(4) }); }
  duplicate(id) {
    const rec = this.items.get(id); if (!rec) return;
    const c = clone(rec); c.id = uid('i'); delete c.orig; delete c.locked;
    const off = Math.max(0.35, Math.min(1.2, (rec.p?.w || 0.6) * 0.6));
    c.x += Math.cos(rec.ry || 0) * off; c.z -= Math.sin(rec.ry || 0) * off;
    this.addItem(c);
  }
  replaceItem(id, spec) {
    const old = this.items.get(id); if (!old) return;
    const rec = this.makeRecord(spec, { floor: old.floor, x: old.x, z: old.z, y: old.y, ry: old.ry });
    if (!rec) return;
    const kindNew = itemKind(rec, this.models), kindOld = itemKind(old, this.models);
    if (kindNew !== kindOld) { rec.y = this._defaultY(rec, old.floor, old.y); }
    else if (kindNew === 'floor') rec.y = old.y;
    this.items.remove(id);
    this.items.add(rec);
    this.commit({ type: 'batch', actions: [{ type: 'remove', rec: clone(old) }, { type: 'add', rec: clone(rec) }] });
    this.editor.select(rec.id);
    this.emit('items-changed');
    this.ui.toast(`Replaced ${this.ui.nameOf(old)} with ${this.ui.nameOf(rec)}`, { action: 'Undo', run: () => this.undo() });
  }
  // a new record (not yet placed) from a catalog type, an imported model or a photo
  makeRecord(spec, at = {}) {
    let rec;
    if (spec.type) {
      const def = CATALOG[spec.type]; if (!def) return null;
      const p = { w: def.dims[0], d: def.dims[1], h: def.dims[2] };
      if (def.color != null) p.color = def.color;
      rec = { id: uid('i'), type: spec.type, p };
    } else if (spec.model) {
      const m = this.models.get(spec.model); if (!m) return null;
      const s = m.meta.target || m.meta.size;
      rec = { id: uid('i'), type: m.meta.kind === 'photo' ? 'photoBox' : 'model', p: { w: s.w, d: s.d, h: s.h } };
      if (m.meta.kind === 'photo') { rec.photo = spec.model; rec.p.shape = m.meta.shape || 'box'; } else rec.model = spec.model;
    } else return null;
    rec.floor = at.floor || 'gf'; rec.x = at.x ?? 0; rec.z = at.z ?? 0; rec.ry = at.ry ?? 0; rec.y = at.y ?? LV[rec.floor] ?? 0;
    return rec;
  }
  _defaultY(rec, floor, ground) {
    const kind = itemKind(rec, this.models), base = floor === 'site' ? ground : LV[floor];
    if (kind === 'hang' && floor !== 'site') return CEIL[floor] - rec.p.h;
    if (kind === 'wall') return base + (CATALOG[rec.type]?.elev ?? 1.2);
    return base;
  }
  // put a new item where the user is looking (or where it was dropped)
  placeNew(spec, { clientX, clientY } = {}) {
    const st = this.stage, ed = this.editor;
    const r = st.canvas.getBoundingClientRect();
    const cx = clientX ?? (r.left + (r.width + st.inset) / 2), cy = clientY ?? (r.top + r.height * 0.55);
    ed.setRay(cx, cy);
    let floor = null, x, z, y;
    const planView = !this.state.walk && this.state.view !== 'outside';
    if (planView) {
      // in a floor view, only that floor (or the garden around it) can receive the item
      const cur = this.state.view;
      const cands = this.visibleWalkables().filter((m) => { const f = this.walkFloorOf.get(m); return f === cur || f === 'site'; });
      const hit = ed.ray.intersectObjects(cands, false).find((h) => h.face && h.face.normal.y > 0.6);
      if (hit) {
        const f = this.walkFloorOf.get(hit.object);
        // the garden only counts when it is at about this floor's level
        if (f === cur || Math.abs(hit.point.y - LV[cur]) < 1.2) { floor = f; x = hit.point.x; z = hit.point.z; y = hit.point.y; }
      }
    } else {
      const first = ed.ray.intersectObjects(this.occluders(), false).find((h) => !h.object.material.transparent);
      const f0 = first && this.walkFloorOf.get(first.object);
      if (f0 && first.face && first.face.normal.y > 0.6 && (this.state.walk || f0 === 'site')) {
        floor = f0; x = first.point.x; z = first.point.z; y = first.point.y;
      }
    }
    if (!floor) {
      floor = this.state.view === 'outside' ? 'gf' : this.state.view;
      [x, z] = DEFAULT_SPOT[floor]; y = LV[floor];
      if (this.state.view === 'outside' && !this.state.walk) this.setView('gf');
    }
    const cam = st.camera.position;
    let ry = Math.atan2(cam.x - x, cam.z - z);
    const [u, v] = toWing(x, z), inWing = u > -0.2 && u < 8 && v > -6.5 && v < 14.8;
    const base = inWing ? WING.phi : 0;
    ry = base + Math.round((ry - base) / (Math.PI / 2)) * (Math.PI / 2);
    const rec = this.makeRecord(spec, { floor, x, z, ry, y });
    if (!rec) return null;
    rec.y = this._defaultY(rec, floor, y);
    if (itemKind(rec, this.models) === 'wall') this._toNearestWall(rec);
    const out = this.addItem(rec);
    // bring it into view if it landed off screen
    const p = new THREE.Vector3(rec.x, rec.y + 0.4, rec.z).project(st.camera);
    if (p.z > 1 || Math.abs(p.x) > 0.85 || Math.abs(p.y) > 0.85) setTimeout(() => this.focusItem(out.id), 60);
    return out;
  }
  _toNearestWall(rec) {
    const walls = this.wallMeshes(rec.floor); if (!walls.length) return;
    const rc = new THREE.Raycaster(); let best = null;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      rc.set(new THREE.Vector3(rec.x, rec.y + Math.min(0.4, rec.p.h / 2), rec.z), dir); rc.far = 5;
      const h = rc.intersectObjects(walls, false).find((q) => q.face && Math.abs(q.face.normal.y) < 0.3);
      if (h && (!best || h.distance < best.distance)) best = h;
    }
    if (!best) return;
    const n = best.face.normal.clone().transformDirection(best.object.matrixWorld); n.y = 0; n.normalize();
    const toward = new THREE.Vector3(rec.x - best.point.x, 0, rec.z - best.point.z);
    if (n.dot(toward) < 0) n.negate();
    rec.x = best.point.x + n.x * (rec.p.d / 2 + 0.004); rec.z = best.point.z + n.z * (rec.p.d / 2 + 0.004);
    rec.ry = Math.atan2(n.x, n.z);
  }
  focusItem(id) {
    const obj = this.items.obj(id); if (!obj) return;
    const b = new THREE.Box3().setFromObject(obj), c = b.getCenter(new THREE.Vector3()), r = Math.max(0.6, b.getSize(new THREE.Vector3()).length());
    if (this.state.walk) {
      const cam = this.stage.camera.position, w = this.editor.walk;
      w.yaw = Math.atan2(-(c.x - cam.x), -(c.z - cam.z)); w.pitch = Math.atan2(c.y - cam.y, Math.hypot(c.x - cam.x, c.z - cam.z)); w.apply();
      return;
    }
    const rec = this.items.get(id);
    if (rec && rec.floor !== 'site' && this.state.view !== rec.floor && this.state.view !== 'outside' && floorIndex(rec.floor) > floorIndex(this.state.view)) this.applyView(rec.floor);
    const cam = this.stage.camera.position, t = this.stage.controls.target;
    const dir = cam.clone().sub(t).normalize();
    const dist = Math.max(2.6, r * 2.2);
    this.stage.flyTo(c.clone().addScaledVector(dir, dist), c, 650);
  }
  resetLayout() {
    const before = this.items.records(), after = builtinLayout().map((r) => ({ ...r, orig: true }));
    this.items.load(after);
    this.commit({ type: 'load', before, after: clone(after) });
    this.emit('items-changed');
  }
  loadRecords(recs, label) {
    recs = migrateLayout(recs).recs;
    const before = this.items.records();
    this.items.load(recs);
    this.commit({ type: 'load', before, after: clone(recs) });
    this.emit('items-changed');
    if (label) this.ui.toast(label, { action: 'Undo', run: () => this.undo() });
  }

  // ------------------------------------------------------------ imported models
  async loadModel(id) {
    const m = this.models.get(id); if (!m || m.status === 'loading' || m.status === 'ready') return;
    this.models.setStatus(id, 'loading');
    try {
      const buf = await this.store.getModelBuffer(m.meta);
      const gltf = await parseGLTF(buf);
      const { template, size } = normalizeModel(gltf.scene);
      this.models.setReady(id, { ...m.meta, size }, template);
    } catch (e) {
      this.models.setStatus(id, 'error', String(e && e.message || e));
    }
  }
  registerMetas(metas) {
    for (const meta of metas) {
      const cur = this.models.get(meta.id);
      if (cur && cur.status === 'ready') { cur.meta = { ...cur.meta, ...meta, size: cur.meta.size }; continue; }
      this.models.setMeta(meta.id, meta);
      if (cur && cur.status) continue;
      this.models.get(meta.id).status = 'idle';
      if (meta.kind === 'photo' && !meta.asset) this.store.ensureLocalPhoto(meta).then(() => this._rebuildPhotos(meta.id));
      // any placed copies now know their model exists: build them
      for (const r of this.items.list()) if (r.model === meta.id || r.photo === meta.id) this.items.rebuild(r.id);
    }
    this.emit('models');
  }
  _rebuildPhotos(pid) { for (const r of this.items.list()) if (r.photo === pid) this.items.rebuild(r.id); }
  // a model that came through the import dialog: use it right away, store it in the background
  async addImportedModel(loaded, { name, upZ, yaw, target, mount, replace }) {
    const { template, size } = normalizeModel(loaded.object, { upZ, yaw });
    const id = uid('m');
    const meta = { id, kind: 'model', name, size, target, mount, tris: loaded.tris, format: loaded.kind };
    this.models.setReady(id, meta, template);
    if (replace && this.items.has(replace)) this.replaceItem(replace, { model: id }); else this.placeNew({ model: id });
    this.emit('models');
    this.emit('status', 'uploading');
    try {
      const glb = await exportGLB(template);
      const saved = await this.store.putModel(meta, glb);
      const cur = this.models.get(id); cur.meta = { ...cur.meta, ...saved, size: cur.meta.size };
      this.emit('models');
      this.ui.toast(saved.shared ? `${name} is saved with your villa` : saved.uploadError ? `${name} is saved in this browser only (upload failed)` : `${name} is saved in this browser`);
    } catch (e) {
      this.ui.toast(`${name} couldn't be stored (${e && e.message || e}). It stays until you reload.`, { error: true });
    } finally {
      this.emit('status', this.store.mode === 'shared' ? 'saved' : this.store.mode);
      loaded.release();
    }
  }
  async addPhoto({ blob, name, shape, target, replace, mount }) {
    const id = uid('p');
    const meta = { id, kind: 'photo', name, shape, size: target, target, mount: mount || 'floor' };
    this.store.localUrls.set(id, URL.createObjectURL(blob));
    this.models.setMeta(id, meta); this.models.get(id).status = 'ready';
    if (replace && this.items.has(replace)) this.replaceItem(replace, { model: id }); else this.placeNew({ model: id });
    this.emit('models');
    try {
      const saved = await this.store.putPhoto(meta, blob);
      const cur = this.models.get(id); cur.meta = { ...cur.meta, ...saved };
      this.emit('models');
      if (!saved.shared) this.ui.toast(`${name} is saved in this browser`);
    } catch (e) { this.ui.toast(`The photo couldn't be stored (${e && e.message || e}).`, { error: true }); }
  }
  async deleteModel(id) {
    const m = this.models.get(id); if (!m) return;
    const used = this.items.list().filter((r) => r.model === id || r.photo === id);
    for (const r of used) this.items.remove(r.id);
    if (used.length) this.commit({ type: 'batch', actions: used.map((r) => ({ type: 'remove', rec: clone(r) })) });
    this.history.undo = this.history.undo.filter((a) => !JSON.stringify(a).includes(id)); this.history.redo = [];
    try { await this.store.removeModel(m.meta); } catch (e) { this.ui.toast('Could not delete it: ' + (e && e.message || e), { error: true }); return; }
    this.models.remove(id); this.thumbs.forget('m:' + id);
    this.emit('models'); this.emit('items-changed'); this.emit('history');
  }

  // ------------------------------------------------------------ storage
  async _connect() {
    const mode = await this.store.ready;
    this.emit('store', mode);
    const metas = await this.store.listModels();
    this.registerMetas(metas);
    this.store.watchModels((list) => this.registerMetas(list));
    const saved = await this.store.loadLayout();
    if (saved && saved.items && (saved.updatedAt || '') > (this.layoutStamp || '') && this.history.undo.length === 0) this._applyRemote(saved);
    else if (!saved && mode === 'shared' && this.store.canWrite) this.save();   // first visit: store the starting layout
    else if (this._migrated && this.store.canWrite) this.save();                // furniture moved for the new exterior
    this.store.watchLayout((d) => { if (!this.editor.drag && (d.updatedAt || '') > (this.layoutStamp || '')) this._applyRemote(d, true); });
  }
  _applyRemote(d, live = false) {
    this._applyingRemote = true;
    const sel = this.editor.selected;
    const { recs, changed } = migrateLayout(d.items, d.rev || 1);
    this.items.load(recs);
    this.layoutStamp = d.updatedAt;
    this._applyingRemote = false;
    if (changed && this.store.canWrite) this.save();   // keep the moved outdoor furniture where the new exterior has room for it
    if (sel && this.items.has(sel)) this.editor.select(sel);
    this.emit('items-changed');
    if (live) this.ui.toast('Layout updated from another device');
  }
}

const app = new App();
window.__villa = app;
app.start().catch((e) => { console.error(e); const el = document.getElementById('boot'); if (el) { el.textContent = 'Something went wrong while building the model: ' + (e && e.message); el.classList.add('err'); } });
