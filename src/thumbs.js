// Small product shots of catalog items and imported models, rendered in a separate
// little WebGL context and released again once the queue is empty.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildItemMesh } from './furniture.js';
import { disposeTree } from './items.js';

const SIZE = 168;
export class Thumbs {
  constructor() { this.cache = new Map(); this.queue = []; this.busy = false; this.r = null; this.idleTimer = 0; }
  get(key) { return this.cache.get(key); }
  // request a thumbnail; cb(dataURL) is called when ready
  request(key, make, cb) {
    if (this.cache.has(key)) { cb(this.cache.get(key)); return; }
    const q = this.queue.find((j) => j.key === key);
    if (q) { q.cbs.push(cb); return; }
    this.queue.push({ key, make, cbs: [cb] });
    this._pump();
  }
  catalog(type, cb) { this.request('t:' + type, () => buildItemMesh(type, {}), cb); }
  forget(key) { this.cache.delete(key); }
  _init() {
    if (this.r) return true;
    try {
      const c = document.createElement('canvas'); c.width = c.height = SIZE;
      const r = this.r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(SIZE, SIZE, false);
      r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping;
      const s = this.scene = new THREE.Scene();
      const pm = new THREE.PMREMGenerator(r); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
      s.add(new THREE.HemisphereLight(0xffffff, 0xb7a993, 0.9));
      const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(-2, 4, 3); s.add(d);
      this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
      return true;
    } catch (e) { this.r = null; this.failed = true; return false; }
  }
  _release() {
    if (!this.r) return;
    this.scene.environment?.dispose();
    this.r.dispose(); this.r.forceContextLoss(); this.r = null;
  }
  _pump() {
    if (this.busy || !this.queue.length) return;
    if (!this._init()) { for (const j of this.queue) for (const cb of j.cbs) cb(null); this.queue = []; return; }
    this.busy = true; clearTimeout(this.idleTimer);
    requestAnimationFrame(() => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 24) {
        const job = this.queue.shift();
        let url = null;
        try { url = this._shoot(job.make()); } catch (e) { url = null; }
        if (url) this.cache.set(job.key, url);
        for (const cb of job.cbs) cb(url);
      }
      this.busy = false;
      if (this.queue.length) this._pump();
      else this.idleTimer = setTimeout(() => { if (!this.queue.length) this._release(); }, 4000);
    });
  }
  _shoot(obj) {
    if (!obj) return null;
    const holder = new THREE.Group(); holder.add(obj); holder.rotation.y = -0.6;
    this.scene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const rad = Math.max(0.05, size.length() / 2);
    const dist = rad / Math.sin(THREE.MathUtils.degToRad(this.cam.fov / 2)) * 1.02;
    const dir = new THREE.Vector3(0, 0.42, 1).normalize();
    this.cam.position.copy(c).addScaledVector(dir, dist);
    this.cam.near = dist / 50; this.cam.far = dist * 4; this.cam.updateProjectionMatrix();
    this.cam.lookAt(c);
    this.r.setClearColor(0x000000, 0);
    this.r.render(this.scene, this.cam);
    const url = this.r.domElement.toDataURL('image/png');
    this.scene.remove(holder);
    if (!obj.userData.keepAfterThumb) disposeTree(obj);
    return url;
  }
}
