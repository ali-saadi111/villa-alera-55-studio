// Small modelling kit for furniture: primitives placed in item-local space
// (origin at floor centre, +Z = front), merged into one mesh per material.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _e = new THREE.Euler(), _m = new THREE.Matrix4();
const V2 = (x, y) => new THREE.Vector2(x, y);

function boxUV(geo, w, h, d, s) {
  if (!s) return;
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; if (k < uv.count) uv.setXY(k, uv.getX(k) * dims[f][0] / s, uv.getY(k) * dims[f][1] / s); }
}
function scaleUV(geo, su, sv = su) { const uv = geo.attributes.uv; if (!uv) return; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }

export class Kit {
  constructor() { this.map = new Map(); }
  put(mat, geo, x = 0, y = 0, z = 0, o = {}) {
    if (o.s) geo.scale(o.s[0], o.s[1], o.s[2]);
    if (o.rx || o.ry || o.rz) { _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'YXZ'); geo.applyMatrix4(_m.makeRotationFromEuler(_e)); }
    geo.translate(x, y, z);
    let arr = this.map.get(mat); if (!arr) { arr = []; this.map.set(mat, arr); }
    arr.push(geo);
    return geo;
  }
  // box with its bottom at y (rotations happen about the bottom centre)
  box(mat, w, h, d, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d); boxUV(g, w, h, d, mat.userData.s || 1); g.translate(0, h / 2, 0);
    return this.put(mat, g, x, y, z, o);
  }
  rbox(mat, w, h, d, r, x = 0, y = 0, z = 0, o = {}) {
    const rr = Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const g = new RoundedBoxGeometry(w, h, d, 2, rr); scaleUV(g, Math.max(w, h, d) / (mat.userData.s || 1)); g.translate(0, h / 2, 0);
    return this.put(mat, g, x, y, z, o);
  }
  cyl(mat, rt, rb, h, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg || 24, 1, !!o.open, o.t0 || 0, o.tl ?? Math.PI * 2);
    const s = mat.userData.s || 1; scaleUV(g, (2 * Math.PI * Math.max(rt, rb)) / s, h / s);
    g.translate(0, h / 2, 0);
    return this.put(mat, g, x, y, z, o);
  }
  sph(mat, r, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.SphereGeometry(r, o.seg || 20, o.segH || 14, 0, Math.PI * 2, o.t0 || 0, o.tl ?? Math.PI);
    return this.put(mat, g, x, y, z, o);
  }
  tor(mat, R, r, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.TorusGeometry(R, r, 8, o.seg || 40, o.arc ?? Math.PI * 2); g.rotateX(Math.PI / 2);
    return this.put(mat, g, x, y, z, o);
  }
  lathe(mat, pts, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.LatheGeometry(pts.map(([r, yy]) => V2(r, yy)), o.seg || 32);
    return this.put(mat, g, x, y, z, o);
  }
  // extrusion of a 2D shape. flat: shape lies in XZ (shape y -> -z), extruded upward.
  ext(mat, shape, depth, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevel || 0, bevelThickness: o.bevel || 0, bevelSegments: 2, curveSegments: o.cs || 24 });
    const s = mat.userData.s || 1; scaleUV(g, 1 / s);
    if (o.flat) g.rotateX(-Math.PI / 2);
    return this.put(mat, g, x, y, z, o);
  }
  tube(mat, pts, r, o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, o.seg || 32, r, o.rs || 8, false);
    return this.put(mat, g, 0, 0, 0, {});
  }
  plane(mat, w, h, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
    return this.put(mat, g, x, y, z, o);
  }
  // tapered leg from a foot point, leaning by angles (ax about X, az about Z)
  leg(mat, x, z, h, r0, r1, o = {}) {
    return this.cyl(mat, r1, r0, h, x, o.y || 0, z, { rx: o.ax || 0, rz: o.az || 0, seg: o.seg || 12 });
  }
  build(name = '') {
    const group = new THREE.Group(); group.name = name;
    for (const [mat, geos] of this.map) {
      const list = geos.map((q) => {
        let n = q.index ? q.toNonIndexed() : q;
        for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
        if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
        if (!n.attributes.normal) n.computeVertexNormals();
        n.clearGroups();
        return n;
      });
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !mat.transparent && !mat.userData.noShadow;
      mesh.receiveShadow = !mat.userData.noReceive;
      group.add(mesh);
    }
    return group;
  }
}

// 2D helpers
export function roundRect(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2; r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// annular sector in the plane; a0..a1 radians (shape coords), used for chair shells
export function arcBand(r0, r1, a0, a1, n = 32) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; const p = [Math.cos(a) * r1, Math.sin(a) * r1]; i ? s.lineTo(...p) : s.moveTo(...p); }
  for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; s.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); }
  s.closePath();
  return s;
}
// rectangle with a semicircular top (arch), bottom-centre at origin
export function archShape(w, h) {
  const s = new THREE.Shape(), r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0);
  return s;
}
export function archPath(w, h, y0 = 0) {
  const s = new THREE.Path(), r = w / 2;
  s.moveTo(-r, y0); s.lineTo(-r, y0 + h - r); s.absarc(0, y0 + h - r, r, Math.PI, 0, true); s.lineTo(r, y0); s.lineTo(-r, y0);
  return s;
}
// inverted-U frame: outer rectangle (or arch) wo x ho with an arched opening wi x hi cut from the bottom edge
export function archFrame(wo, ho, wi, hi, archedOuter = false) {
  const s = new THREE.Shape(), R = wo / 2, r = wi / 2, n = 24;
  s.moveTo(-R, 0); s.lineTo(-r, 0); s.lineTo(-r, hi - r);
  for (let i = 1; i <= n; i++) { const a = Math.PI - (i / n) * Math.PI; s.lineTo(Math.cos(a) * r, hi - r + Math.sin(a) * r); }
  s.lineTo(r, 0); s.lineTo(R, 0);
  if (archedOuter) {
    s.lineTo(R, ho - R);
    for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI; s.lineTo(Math.cos(a) * R, ho - R + Math.sin(a) * R); }
  } else { s.lineTo(R, ho); s.lineTo(-R, ho); }
  s.lineTo(-R, 0);
  return s;
}
