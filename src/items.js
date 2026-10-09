// Placed items: records <-> Object3Ds. Also the library of imported models.
import * as THREE from 'three';
import { CATALOG, buildItemMesh } from './furniture.js';

export const clone = (o) => JSON.parse(JSON.stringify(o));
const FLOOR_ORDER = { b1: 0, gf: 1, ff: 2, at: 3 };
export const floorIndex = (f) => FLOOR_ORDER[f] ?? -1;

export function itemName(rec, models) {
  if (rec.name) return rec.name;
  if (rec.type === 'model') return models?.get(rec.model)?.meta?.name || 'Imported item';
  if (rec.type === 'photoBox') return models?.get(rec.photo)?.meta?.name || 'Photo item';
  return CATALOG[rec.type]?.name || rec.type;
}
export function itemKind(rec, models) {   // floor | wall | hang
  if (rec.mount) return rec.mount;
  if (rec.type === 'model' || rec.type === 'photoBox') return models?.get(rec.model || rec.photo)?.meta?.mount || 'floor';
  const d = CATALOG[rec.type];
  return d?.wall ? 'wall' : d?.hang ? 'hang' : 'floor';
}

// ------------------------------------------------------------ imported models
export class ModelLibrary {
  constructor() { this.map = new Map(); this.listeners = new Set(); }
  get(id) { return this.map.get(id); }
  all() { return [...this.map.values()]; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(id) { for (const fn of this.listeners) fn(id); }
  // register a model whose normalized template is already built (fresh import)
  setReady(id, meta, template) {
    const e = this.map.get(id) || { id };
    Object.assign(e, { id, meta, template, status: 'ready', error: null });
    this.map.set(id, e); this.emit(id);
    return e;
  }
  setMeta(id, meta) {
    const e = this.map.get(id) || { id, status: 'idle' };
    e.meta = { ...(e.meta || {}), ...meta }; this.map.set(id, e); this.emit(id);
    return e;
  }
  setStatus(id, status, error) { const e = this.map.get(id) || { id }; e.status = status; e.error = error || null; this.map.set(id, e); this.emit(id); }
  remove(id) { this.map.delete(id); this.emit(id); }
}

// put a model in a wrapper whose origin is the footprint centre at floor level, facing +z
export function normalizeModel(object, { upZ = false, yaw = 0 } = {}) {
  const inner = new THREE.Group();
  inner.add(object);
  inner.rotation.x = upZ ? -Math.PI / 2 : 0;
  const turn = new THREE.Group(); turn.add(inner); turn.rotation.y = yaw;
  turn.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(turn, true);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const tpl = new THREE.Group(); tpl.add(turn);
  turn.position.set(-c.x, -box.min.y, -c.z);
  tpl.updateMatrixWorld(true);
  tpl.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (o.geometry) o.geometry.userData.shared = true;   // shared by every placed copy
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m && m.map) m.map.anisotropy = 4;
    }
  });
  return { template: tpl, size: { w: Math.max(size.x, 1e-3), d: Math.max(size.z, 1e-3), h: Math.max(size.y, 1e-3) } };
}

// ------------------------------------------------------------ photo materials
const photoCache = new Map();
export function photoMaterial(url, opts = {}) {
  const key = url + (opts.cutout ? '|c' : '');
  let m = photoCache.get(key);
  if (m) return m;
  const tex = new THREE.TextureLoader().load(url, () => { if (opts.onLoad) opts.onLoad(); });
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: opts.cutout ? THREE.DoubleSide : THREE.FrontSide, alphaTest: opts.cutout ? 0.5 : 0, transparent: false });
  m.userData.photo = true;
  photoCache.set(key, m);
  return m;
}

// ------------------------------------------------------------ the placed items
export class Items {
  constructor(stage, models, resolvePhotoUrl) {
    this.stage = stage; this.models = models; this.photoUrl = resolvePhotoUrl;
    this.root = new THREE.Group(); this.root.name = 'items';
    this.map = new Map();
    this.isVisible = () => true;
    this.listeners = new Set();
    models.on((id) => { for (const e of this.map.values()) if (e.rec.type === 'model' && e.rec.model === id) this.rebuild(e.rec.id); });
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind, id) { for (const fn of this.listeners) fn(kind, id); }
  get size() { return this.map.size; }
  list() { return [...this.map.values()].map((e) => e.rec); }
  records() { return this.list().map(clone); }
  get(id) { return this.map.get(id)?.rec; }
  obj(id) { return this.map.get(id)?.obj; }
  has(id) { return this.map.has(id); }

  load(recs) {
    for (const id of [...this.map.keys()]) this._remove(id);
    for (const r of recs) this._add(r);
    this.stage.dirty(true); this.emit('load');
  }
  add(rec) { const r = this._add(rec); this.stage.dirty(true); this.emit('add', r.id); return r; }
  remove(id) { if (!this.map.has(id)) return; this._remove(id); this.stage.dirty(true); this.emit('remove', id); }
  update(id, patch) {
    const e = this.map.get(id); if (!e) return;
    const rebuild = ['p', 'type', 'model', 'photo', 'cutout'].some((k) => k in patch);
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete e.rec[k]; else e.rec[k] = clone(v); }
    if (rebuild) this.rebuild(id); else this._place(e.rec, e.obj);
    this._vis(e.rec, e.obj);
    this.stage.dirty(true); this.emit('update', id);
  }
  rebuild(id) {
    const e = this.map.get(id); if (!e) return;
    const keep = e.obj.children.filter((c) => c.userData.keep);   // selection helpers live on the root
    for (const c of [...e.obj.children]) if (!c.userData.keep) { e.obj.remove(c); disposeTree(c); }
    e.obj.add(this._body(e.rec));
    for (const c of keep) e.obj.add(c);
    e.obj.userData.localBox = null;
    this.stage.dirty(true); this.emit('rebuild', id);
  }
  setVisibility(fn) { this.isVisible = fn; for (const e of this.map.values()) this._vis(e.rec, e.obj); this.stage.dirty(true); }
  refreshVisibility() { this.setVisibility(this.isVisible); }
  pickables() { const out = []; for (const e of this.map.values()) if (e.obj.visible) out.push(e.obj); return out; }
  // bounding box in the item's own frame (origin at its base centre)
  localBox(id) {
    const e = this.map.get(id); if (!e) return null;
    if (e.obj.userData.localBox) return e.obj.userData.localBox;
    const o = e.obj, p = o.position.clone(), r = o.rotation.y, parent = o.parent;
    o.position.set(0, 0, 0); o.rotation.y = 0; o.updateMatrixWorld(true);
    const b = new THREE.Box3();
    for (const c of o.children) if (!c.userData.keep) b.expandByObject(c, false);
    o.position.copy(p); o.rotation.y = r; o.updateMatrixWorld(true);
    if (b.isEmpty()) b.set(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 0.4, 0.2));
    void parent;
    o.userData.localBox = b;
    return b;
  }

  _add(rec) {
    rec = clone(rec);
    const obj = new THREE.Group();
    obj.userData.itemId = rec.id; obj.name = 'item:' + rec.id;
    obj.add(this._body(rec));
    this.map.set(rec.id, { rec, obj });
    this.root.add(obj);
    this._place(rec, obj); this._vis(rec, obj);
    return rec;
  }
  _remove(id) { const e = this.map.get(id); this.root.remove(e.obj); disposeTree(e.obj); this.map.delete(id); }
  _place(rec, obj) { obj.position.set(rec.x, rec.y, rec.z); obj.rotation.set(0, rec.ry || 0, 0); obj.updateMatrixWorld(true); }
  _vis(rec, obj) { obj.visible = !rec.hidden && this.isVisible(rec); }
  _body(rec) {
    let g;
    if (rec.type === 'model') g = this._modelBody(rec);
    else if (rec.type === 'photoBox') g = this._photoBody(rec);
    else g = buildItemMesh(rec.type, rec.p) || placeholder(rec.p, 0xcc3333);
    g.userData.body = true;
    return g;
  }
  _modelBody(rec) {
    const m = this.models.get(rec.model);
    const p = rec.p || { w: 0.6, d: 0.6, h: 0.6 };
    if (!m || m.status !== 'ready' || !m.template) {
      if (m && m.status === 'idle' && this.onNeedModel) this.onNeedModel(rec.model);
      return placeholder(p, m && m.status === 'error' ? 0xc0392b : 0xa8793a);
    }
    const s = m.meta.size;
    const g = new THREE.Group();
    const c = m.template.clone(true);
    c.scale.set(p.w / s.w, p.h / s.h, p.d / s.d);
    g.add(c);
    return g;
  }
  _photoBody(rec) {
    const url = this.photoUrl(rec.photo);
    const cut = rec.p.shape === 'cutout';
    const mat = url ? photoMaterial(url, { cutout: cut, onLoad: () => this.stage.dirty(true) }) : null;
    if (cut) {
      const g = new THREE.Group();
      const geo = new THREE.PlaneGeometry(rec.p.w, rec.p.h); geo.translate(0, rec.p.h / 2, 0);
      const mesh = new THREE.Mesh(geo, mat || new THREE.MeshStandardMaterial({ color: 0xdddddd }));
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (mat) mesh.customDepthMaterial = depthFor(mat);
      g.add(mesh);
      return g;
    }
    return buildItemMesh('photoBox', { ...rec.p, _photoMat: mat });
  }
}

const depthCache = new WeakMap();
function depthFor(mat) {
  let d = depthCache.get(mat);
  if (!d) { d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.5 }); depthCache.set(mat, d); }
  return d;
}

const phMat = new Map();
export function placeholder(p, color = 0xa8793a) {
  const w = p?.w || 0.6, d = p?.d || 0.6, h = p?.h || 0.6;
  let m = phMat.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.35, roughness: 0.8, depthWrite: false }); phMat.set(color, m); }
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0);
  const mesh = new THREE.Mesh(geo, m); g.add(mesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
  g.add(edges);
  g.userData.placeholder = true;
  return g;
}

// dispose geometries created for an item (materials are shared and cached)
export function disposeTree(o) {
  o.traverse((c) => {
    if (c.userData && c.userData.shared) return;
    if (c.isMesh || c.isLineSegments || c.isLine) {
      if (c.geometry && !c.geometry.userData.shared && !c.userData.sharedGeo) c.geometry.dispose();
    }
  });
}
