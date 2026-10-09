// Pointer and keyboard interaction: select, drag, rotate, walk, measure.
import * as THREE from 'three';
import { itemKind, clone } from './items.js';
import { LV, CEIL, WING } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
const BRASS = 0xd39b45;
const TAU = Math.PI * 2;
const normAngle = (a) => { a = a % TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
// pull an angle onto a multiple of 90° (world grid or the angled wing) when it is close
function magnet(a, tol = 0.06) {
  for (const base of [0, WING.phi]) {
    const k = Math.round((a - base) / (Math.PI / 2)), s = base + k * Math.PI / 2;
    if (Math.abs(a - s) < tol) return s;
  }
  return a;
}
const isTyping = (e) => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };

export class Editor {
  constructor(app) {
    this.app = app;
    const st = this.stage = app.stage;
    this.ray = new THREE.Raycaster();
    this.ray2 = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.selected = null; this.drag = null; this.down = null; this.snap = false;
    this._buildSelection();
    st.container.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e, false));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    st.canvas.addEventListener('dblclick', (e) => this.onDbl(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.walk && this.walk.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.walk && this.walk.keys.clear());
    app.items.on((kind, id) => {
      if (kind === 'load') this.select(null);
      else if (id && id === this.selected) {
        if (kind === 'remove') this.select(null);
        else if (kind === 'rebuild' || kind === 'update') this._fitSelection();
      }
    });
    this.walk = null;
    this.measure = new Measure(this);
    this._hoverT = 0;
  }

  // ------------------------------------------------------------ rays and picking
  setRay(cx, cy) {
    const r = this.stage.canvas.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.stage.camera);
    this.ray.far = Infinity;
    return this.ray;
  }
  // first visible item under the ray that is not hidden behind the building
  pickItem() {
    const hits = this.ray.intersectObjects(this.app.items.pickables(), true);
    let best = null;
    for (const h of hits) {
      if (h.object.userData.helper || !h.object.visible) continue;
      let o = h.object, vis = true;
      while (o && !o.userData.itemId) { if (!o.visible) vis = false; o = o.parent; }
      if (o && vis) { best = { id: o.userData.itemId, point: h.point, distance: h.distance }; break; }
    }
    if (!best) return null;
    const occ = this.ray.intersectObjects(this.app.occluders(), false).find((h) => !h.object.material.transparent);
    if (occ && occ.distance < best.distance - 0.03) return null;
    return best;
  }
  // nearest surface point (building or item)
  pickSurface({ items = true, upOnly = false } = {}) {
    let hits = this.ray.intersectObjects(this.app.occluders(), false).filter((h) => !h.object.material.transparent);
    if (items) {
      const ih = this.ray.intersectObjects(this.app.items.pickables(), true).filter((h) => !h.object.userData.helper && h.object.visible);
      hits = hits.concat(ih).sort((a, b) => a.distance - b.distance);
    }
    if (upOnly) hits = hits.filter((h) => h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).y > 0.6);
    return hits[0] || null;
  }

  // ------------------------------------------------------------ selection visuals
  _buildSelection() {
    const g = this.selGroup = new THREE.Group(); g.userData.keep = true; g.name = 'selection';
    const lm = new THREE.LineBasicMaterial({ color: BRASS, depthTest: false, transparent: true, opacity: 0.95 });
    this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), lm);
    const rm = new THREE.MeshBasicMaterial({ color: BRASS, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.BufferGeometry(), rm);
    this.knob = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    this.knobDot = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24).rotateX(-Math.PI / 2), rm);
    this.ringPick = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    for (const o of [this.selBox, this.ring, this.knob, this.knobDot, this.ringPick]) { o.renderOrder = 1000; o.userData.helper = true; o.raycast = o === this.ringPick ? THREE.Mesh.prototype.raycast : () => {}; g.add(o); }
    this.knobDot.renderOrder = 1001;
  }
  _fitSelection() {
    const id = this.selected; if (!id) return;
    const items = this.app.items, obj = items.obj(id); if (!obj) return;
    const b = items.localBox(id), size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    this.selBox.scale.set(Math.max(size.x, 0.02) + 0.03, Math.max(size.y, 0.02) + 0.03, Math.max(size.z, 0.02) + 0.03);
    this.selBox.position.copy(c);
    const rec = items.get(id), kind = itemKind(rec, this.app.models);
    const R = 0.5 * Math.hypot(size.x, size.z) + 0.16, y = b.min.y + 0.012;
    this.ring.geometry.dispose(); this.ringPick.geometry.dispose();
    this.ring.geometry = new THREE.RingGeometry(R - 0.016, R + 0.016, 96).rotateX(-Math.PI / 2);
    this.ringPick.geometry = new THREE.RingGeometry(Math.max(0.05, R - 0.13), R + 0.13, 48).rotateX(-Math.PI / 2);
    for (const o of [this.ring, this.ringPick]) o.position.set(c.x, y, c.z);
    this.knob.position.set(c.x, y + 0.001, c.z + R); this.knobDot.position.set(c.x, y + 0.002, c.z + R);
    const showRing = kind !== 'wall' && !rec.locked;
    this.ring.visible = this.knob.visible = this.knobDot.visible = this.ringPick.visible = showRing;
    this.selBox.material.color.set(rec.locked ? 0x8a8f96 : BRASS);
    if (this.selGroup.parent !== obj) obj.add(this.selGroup);
    this.stage.dirty();
  }
  select(id) {
    if (id && !this.app.items.has(id)) id = null;
    if (id === this.selected) { if (id) this._fitSelection(); return; }
    if (this.selGroup.parent) this.selGroup.parent.remove(this.selGroup);
    this.selected = id;
    if (id) this._fitSelection();
    this.app.emit('select', id);
    this.stage.dirty();
  }

  // ------------------------------------------------------------ pointer
  onDown(e) {
    if (e.target !== this.stage.canvas) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.setRay(e.clientX, e.clientY);
    this.down = { x: e.clientX, y: e.clientY, kind: 'empty', id: null, pid: e.pointerId };
    if (this.measure.active) return;
    if (this.app.notes && this.app.notes.busy) { if (this.walk) this.walk.lookStart(e); return; }   // writing a note: the view only moves
    const items = this.app.items;
    if (this.selected) {
      const rec = items.get(this.selected);
      if (rec && !rec.locked && this.ringPick.visible && this.ray.intersectObject(this.ringPick, false).length) {
        this._startRotate(rec); this.stage.controls.enabled = false; e.preventDefault(); return;
      }
    }
    const hit = this.pickItem();
    if (hit) {
      const rec = items.get(hit.id);
      this.select(hit.id);
      this.down.kind = rec.locked ? 'locked' : 'item'; this.down.id = hit.id; this.down.point = hit.point;
      if (!rec.locked) { this.stage.controls.enabled = false; e.preventDefault(); }
      return;
    }
    if (this.walk) this.walk.lookStart(e);
  }
  onMove(e) {
    const d = this.down;
    if (!d) { this._hover(e); this.measure.hover(e); return; }
    if (e.pointerId !== d.pid) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5;
    if (moved) d.moved = true;
    if (d.kind === 'item' && !this.drag && moved) this._startMove(d);
    if (this.drag) {
      this.setRay(e.clientX, e.clientY);
      if (this.drag.mode === 'move') this._moveTo(e); else this._rotateTo(e);
    } else if (this.walk && (d.kind === 'empty' || d.kind === 'locked')) this.walk.look(e);
  }
  onUp(e, cancel) {
    const d = this.down;
    if (!d || (e.pointerId !== undefined && e.pointerId !== d.pid && !cancel)) return;
    this.down = null;
    if (this.drag) this._endDrag(cancel);
    else if (!cancel && !d.moved && d.kind === 'empty') {
      this.setRay(e.clientX, e.clientY);
      if (this.measure.active) this.measure.click();
      else if (this.walk) this.walk.clickTo();
      else this.select(null);
    }
    if (!this.walk) this.stage.controls.enabled = true;
  }
  onDbl(e) {
    if (this.app.notes && this.app.notes.busy) return;
    this.setRay(e.clientX, e.clientY);
    const hit = this.pickItem();
    if (hit) { this.select(hit.id); this.app.focusItem(hit.id); }
  }
  _hover(e) {
    if (e.target !== this.stage.canvas) return;
    const now = performance.now(); if (now - this._hoverT < 45) return; this._hoverT = now;
    this.setRay(e.clientX, e.clientY);
    let cur = '';
    if (this.measure.active) cur = 'crosshair';
    else if (this.app.notes && this.app.notes.busy) cur = '';
    else if (this.selected && this.ringPick.visible && this.ray.intersectObject(this.ringPick, false).length) cur = 'ew-resize';
    else { const h = this.pickItem(); if (h) cur = this.app.items.get(h.id)?.locked ? 'pointer' : 'grab'; }
    this.stage.canvas.style.cursor = cur;
  }

  // ------------------------------------------------------------ drag: move
  _startMove(d) {
    const items = this.app.items, rec = items.get(d.id);
    const kind = itemKind(rec, this.app.models);
    const D = this.drag = { mode: 'move', id: rec.id, kind, before: clone(rec), plane: new THREE.Plane(UP, -rec.y), grab: new THREE.Vector3(), grabY: 0 };
    this.setRay(d.x, d.y);
    const p = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(D.plane, p)) { D.grab.set(p.x - rec.x, 0, p.z - rec.z); if (D.grab.length() > 4) D.grab.set(0, 0, 0); }
    if (kind === 'wall' && d.point) D.grabY = d.point.y - rec.y;
    this.stage.canvas.style.cursor = 'grabbing';
    this.app.emit('drag', true);
  }
  _moveTo() {
    const D = this.drag, items = this.app.items, rec = items.get(D.id);
    if (!rec) return;
    if (D.kind === 'wall' && this._wallPlace(D, rec)) { this.app.emit('live', D.id); return; }
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(D.plane, p)) return;
    const cam = this.stage.camera.position;
    if (p.distanceTo(cam) > 60) return;
    let x = p.x - D.grab.x, z = p.z - D.grab.z;
    if (this.snap) { x = D.before.x + Math.round((x - D.before.x) / 0.05) * 0.05; z = D.before.z + Math.round((z - D.before.z) / 0.05) * 0.05; }
    let patch = { x, z };
    if (D.kind === 'floor') patch = this._magnet(rec, patch);
    items.update(D.id, patch);
    this.app.emit('live', D.id);
  }
  // slide the back of a floor item flush against a wall when it gets close
  _magnet(rec, pt) {
    const walls = this.app.wallMeshes(rec.floor); if (!walls.length) return pt;
    const d = rec.p?.d ?? 0.5, h = rec.p?.h ?? 1;
    const back = new THREE.Vector3(-Math.sin(rec.ry), 0, -Math.cos(rec.ry));
    const y = rec.y + Math.min(0.45, h * 0.5);
    this.ray2.set(new THREE.Vector3(pt.x, y, pt.z), back); this.ray2.far = d / 2 + 0.14;
    const hit = this.ray2.intersectObjects(walls, false).find((q) => q.face && Math.abs(q.face.normal.y) < 0.3 && !q.object.material.transparent);
    if (hit) {
      const gap = hit.distance - d / 2;
      if (gap < 0.12 && gap > -0.3) return { x: pt.x + back.x * (gap - 0.004), z: pt.z + back.z * (gap - 0.004) };
    }
    return pt;
  }
  _wallPlace(D, rec) {
    const walls = this.app.wallMeshes(rec.floor);
    const h = this.ray.intersectObjects(walls, false).find((q) => q.face && Math.abs(q.face.normal.y) < 0.35 && !q.object.material.transparent);
    if (!h) return false;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); n.y = 0; n.normalize();
    if (n.dot(this.ray.ray.direction) > 0) n.negate();
    const d = rec.p?.d ?? 0.05, ht = rec.p?.h ?? 0.5;
    const base = rec.floor === 'site' ? -10 : LV[rec.floor], top = rec.floor === 'site' ? 30 : CEIL[rec.floor];
    let y = h.point.y - D.grabY;
    y = Math.max(base, Math.min(top - ht, y));
    this.app.items.update(D.id, { x: h.point.x + n.x * (d / 2 + 0.004), z: h.point.z + n.z * (d / 2 + 0.004), y, ry: Math.atan2(n.x, n.z) });
    return true;
  }
  // ------------------------------------------------------------ drag: rotate
  _startRotate(rec) {
    const D = this.drag = { mode: 'rotate', id: rec.id, before: clone(rec), plane: new THREE.Plane(UP, -rec.y), ry0: rec.ry || 0, a0: 0 };
    const p = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(D.plane, p)) D.a0 = Math.atan2(p.x - rec.x, p.z - rec.z);
    this.down.kind = 'ring';
    this.app.emit('drag', true);
  }
  _rotateTo(e) {
    const D = this.drag, rec = this.app.items.get(D.id), p = new THREE.Vector3();
    if (!rec || !this.ray.ray.intersectPlane(D.plane, p)) return;
    const a = Math.atan2(p.x - rec.x, p.z - rec.z);
    let ry = D.ry0 + normAngle(a - D.a0);
    ry = e.shiftKey ? Math.round(ry / (Math.PI / 12)) * (Math.PI / 12) : magnet(ry);
    this.app.items.update(D.id, { ry: normAngle(ry) });
    this.app.emit('live', D.id);
  }
  _endDrag(cancel) {
    const D = this.drag; this.drag = null;
    const items = this.app.items;
    if (items.has(D.id)) {
      if (cancel) items.update(D.id, { x: D.before.x, y: D.before.y, z: D.before.z, ry: D.before.ry });
      else {
        const after = clone(items.get(D.id));
        if (['x', 'y', 'z', 'ry'].some((k) => Math.abs((after[k] || 0) - (D.before[k] || 0)) > 1e-4)) this.app.commit({ type: 'update', id: D.id, before: D.before, after });
      }
    }
    this.stage.canvas.style.cursor = '';
    this.app.emit('drag', false);
    this.app.emit('live', D.id);
  }

  // ------------------------------------------------------------ keyboard
  onKey(e) {
    if (isTyping(e)) return;
    const k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey, app = this.app, notes = app.notes;
    // while a note is being written, Ctrl+Z takes back the last circle (the layout's undo waits)
    if (mod && k === 'z' && !e.shiftKey && notes && notes.busy) { e.preventDefault(); notes.undoMark(); return; }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) app.redo(); else app.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); app.redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); if (this.selected) app.duplicate(this.selected); return; }
    if (mod) return;
    if (this.walk && !(notes && notes.drawing) && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
      if (!(this.selected && k.startsWith('arrow'))) { this.walk.keys.add(k); e.preventDefault(); return; }
    }
    if (k === 'escape') {
      if (this.measure.active) this.measure.toggle(false);
      else if (notes && notes.escape()) { /* the note took it */ }
      else if (this.selected) this.select(null);
      else if (this.walk) app.setWalk(false);
      return;
    }
    if (k === 'n' && notes) { e.preventDefault(); notes.startNew(); return; }
    if (k === 'm') { if (notes && notes.busy) return; this.measure.toggle(); app.emit('measure', this.measure.active); return; }
    const sel = this.selected && app.items.get(this.selected);
    if (!sel) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); app.removeItem(sel.id); return; }
    if (k === 'f') { app.focusItem(sel.id); return; }
    if (sel.locked) return;
    if (k === 'r') { e.preventDefault(); app.rotateItem(sel.id, (e.shiftKey ? -1 : 1) * Math.PI / 12); return; }
    if (k.startsWith('arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 0.1 : 0.02;
      const cam = this.stage.camera, f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0;
      if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const dir = k === 'arrowup' ? f : k === 'arrowdown' ? f.clone().negate() : k === 'arrowright' ? r : r.clone().negate();
      // nudge along the dominant world (or wing) axis so items stay aligned
      app.nudge(sel.id, dir.x * step, dir.z * step);
    }
  }

  // ------------------------------------------------------------ walk mode
  enterWalk(spawn) {
    if (this.walk) this.walk.exit();
    this.walk = new Walk(this, spawn);
  }
  exitWalk() { if (this.walk) { this.walk.exit(); this.walk = null; } }
}

// ================================================================ first-person walking
class Walk {
  constructor(ed, { pos, look, pitch }) {
    this.ed = ed; this.stage = ed.stage; this.keys = new Set();
    const cam = this.stage.camera;
    this.stage.controls.enabled = false;
    this.fov0 = cam.fov; cam.fov = 62; cam.updateProjectionMatrix();
    this.yaw = Math.atan2(-(look[0] - pos[0]), -(look[2] - pos[2]));
    this.pitch = Number.isFinite(pitch) ? Math.max(-1.35, Math.min(1.35, pitch)) : -0.06;
    this.t = performance.now();
    this.stage.tween = null;
    const from = cam.position.clone();
    const to = new THREE.Vector3(...pos);
    const q0 = cam.quaternion.clone(), q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.stage.tween = { t0: performance.now(), dur: 900, p0: from, p1: to, onStep: (k) => cam.quaternion.slerpQuaternions(q0, q1, k), done: () => this.apply() };
    this.step = (now) => this._step(now);
    this.stage.hooks.push(this.step);
  }
  apply() { this.stage.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); this.stage.dirty(); }
  lookStart(e) { this.lx = e.clientX; this.ly = e.clientY; }
  look(e) {
    if (this.lx === undefined) this.lookStart(e);
    const dx = e.clientX - this.lx, dy = e.clientY - this.ly; this.lx = e.clientX; this.ly = e.clientY;
    this.yaw += dx * 0.0045; this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + dy * 0.0045));
    this.apply();
  }
  _step(now) {
    const dt = Math.min(0.05, (now - this.t) / 1000); this.t = now;
    if (this.stage.tween) return;
    const K = this.keys;
    const fwd = (K.has('w') || K.has('arrowup') ? 1 : 0) - (K.has('s') || K.has('arrowdown') ? 1 : 0);
    const str = (K.has('d') || K.has('arrowright') ? 1 : 0) - (K.has('a') || K.has('arrowleft') ? 1 : 0);
    const cam = this.stage.camera;
    if (fwd || str) {
      const speed = K.has('shift') ? 3.2 : 1.5;
      const dir = new THREE.Vector3(-Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * str, 0, -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * str).normalize();
      const dist = speed * dt;
      if (this._free(cam.position, dir, dist)) cam.position.addScaledVector(dir, dist);
      this._ground(dt);
      this.apply();
    }
  }
  _free(pos, dir, dist) {
    const r = this.ed.ray2; r.far = dist + 0.32;
    for (const h of [0.45, 1.2]) {
      r.set(new THREE.Vector3(pos.x, pos.y - 1.6 + h, pos.z), dir);
      const hit = r.intersectObjects(this.ed.app.occluders(), false).find((q) => q.face && Math.abs(q.face.normal.y) < 0.5);
      if (hit) return false;
    }
    return true;
  }
  _ground(dt) {
    const cam = this.stage.camera, r = this.ed.ray2;
    r.set(new THREE.Vector3(cam.position.x, cam.position.y - 1.6 + 0.55, cam.position.z), new THREE.Vector3(0, -1, 0)); r.far = 4;
    const hit = r.intersectObjects(this.ed.app.occluders(), false).find((q) => q.face && q.face.normal.y > 0.5);
    if (hit) cam.position.y += (hit.point.y + 1.6 - cam.position.y) * Math.min(1, dt * 12);
  }
  clickTo() {
    const hit = this.ed.pickSurface({ items: false, upOnly: true });
    if (!hit) return;
    const cam = this.stage.camera, to = hit.point.clone(); to.y += 1.6;
    const dir = to.clone().sub(cam.position); dir.y = 0;
    const L = dir.length();
    if (L > 0.25) to.addScaledVector(dir.normalize(), -0.35);
    this.stage.tween = { t0: performance.now(), dur: Math.min(1600, 350 + L * 160), p0: cam.position.clone(), p1: to, done: () => this.apply() };
  }
  exit() {
    const st = this.stage, cam = st.camera;
    st.hooks = st.hooks.filter((h) => h !== this.step);
    cam.fov = this.fov0; cam.updateProjectionMatrix();
    const f = new THREE.Vector3(); cam.getWorldDirection(f);
    st.controls.target.copy(cam.position).addScaledVector(f, 3);
    st.controls.enabled = true;
    st.dirty();
  }
}

// ================================================================ tape measure
class Measure {
  constructor(ed) {
    this.ed = ed; this.active = false; this.a = null; this.b = null; this.fixed = false;
    const m = new THREE.LineBasicMaterial({ color: 0x1f6feb, depthTest: false, transparent: true });
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), m);
    this.line.renderOrder = 1002; this.line.frustumCulled = false; this.line.visible = false;
    const dm = new THREE.MeshBasicMaterial({ color: 0x1f6feb, depthTest: false, transparent: true });
    this.dots = [0, 1].map(() => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), dm); s.renderOrder = 1003; s.visible = false; return s; });
    ed.stage.scene.add(this.line, ...this.dots);
    this.label = document.createElement('div'); this.label.className = 'measure-label'; this.label.hidden = true;
    ed.stage.container.appendChild(this.label);
    ed.stage.renderHooks.push(() => this._place());
  }
  toggle(on = !this.active) {
    this.active = on; this.a = this.b = null; this.fixed = false; this._draw();
    this.ed.stage.canvas.style.cursor = on ? 'crosshair' : '';
    if (on) this.ed.select(null);
    this.ed.app.emit('measure', on);
  }
  _point() { const h = this.ed.pickSurface({ items: true }); return h ? h.point.clone() : null; }
  click() {
    const p = this._point(); if (!p) return;
    if (!this.a || this.fixed) { this.a = p; this.b = null; this.fixed = false; }
    else { this.b = p; this.fixed = true; }
    this._draw();
  }
  hover(e) {
    if (!this.active || !this.a || this.fixed || e.target !== this.ed.stage.canvas) return;
    this.ed.setRay(e.clientX, e.clientY);
    const p = this._point(); if (!p) return;
    if (e.shiftKey) {   // constrain to the dominant axis
      const d = p.clone().sub(this.a), ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
      if (ax >= ay && ax >= az) { p.y = this.a.y; p.z = this.a.z; } else if (az >= ay) { p.x = this.a.x; p.y = this.a.y; } else { p.x = this.a.x; p.z = this.a.z; }
    }
    this.b = p; this._draw();
  }
  _draw() {
    const show = this.active && this.a;
    this.dots[0].visible = !!show; this.dots[1].visible = !!(show && this.b);
    this.line.visible = !!(show && this.b);
    if (show) {
      this.dots[0].position.copy(this.a);
      if (this.b) {
        this.dots[1].position.copy(this.b);
        const pos = this.line.geometry.attributes.position; pos.setXYZ(0, ...this.a.toArray()); pos.setXYZ(1, ...this.b.toArray()); pos.needsUpdate = true;
      }
    }
    this.ed.stage.dirty();
  }
  _place() {
    const L = this.label;
    if (!this.active || !this.a || !this.b) { L.hidden = true; return; }
    const mid = this.a.clone().add(this.b).multiplyScalar(0.5).project(this.ed.stage.camera);
    if (mid.z > 1) { L.hidden = true; return; }
    const r = this.ed.stage.canvas.getBoundingClientRect(), c = this.ed.stage.container.getBoundingClientRect();
    const d = this.a.distanceTo(this.b), dh = Math.abs(this.b.y - this.a.y), flat = Math.hypot(this.b.x - this.a.x, this.b.z - this.a.z);
    L.textContent = fmtLen(d) + (dh > 0.05 && flat > 0.05 ? `  ·  ↕ ${fmtLen(dh)}` : '');
    L.style.left = (r.left - c.left + (mid.x + 1) / 2 * r.width) + 'px';
    L.style.top = (r.top - c.top + (1 - mid.y) / 2 * r.height) + 'px';
    L.hidden = false;
  }
}
export function fmtLen(m) { return m >= 1 ? m.toFixed(2) + ' m' : Math.round(m * 100) + ' cm'; }
