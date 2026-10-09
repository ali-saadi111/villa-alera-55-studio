// Geometry accumulator: collects quads/boxes per material with world-space UVs
// (metres / material.userData.s) and merges them into one mesh per material.
import * as THREE from 'three';

const UP = [0, 1, 0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class Acc {
  constructor(name = '') { this.name = name; this.b = new Map(); }
  bucket(mat) {
    let k = this.b.get(mat);
    if (!k) { k = { p: [], n: [], u: [], i: [] }; this.b.set(mat, k); }
    return k;
  }
  // a,b,c,d counter-clockwise seen from the side the normal points to
  quad(mat, a, b, c, d, n, ut, ub) {
    if (!mat) return;
    const B = this.bucket(mat), s = mat.userData.s || 1, base = B.p.length / 3;
    for (const v of [a, b, c, d]) {
      B.p.push(v[0], v[1], v[2]); B.n.push(n[0], n[1], n[2]);
      B.u.push(dot(v, ut) / s, dot(v, ub) / s);
    }
    B.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  tri(mat, a, b, c, n, ut, ub) {
    if (!mat) return;
    const B = this.bucket(mat), s = mat.userData.s || 1, base = B.p.length / 3;
    for (const v of [a, b, c]) {
      B.p.push(v[0], v[1], v[2]); B.n.push(n[0], n[1], n[2]);
      B.u.push(dot(v, ut) / s, dot(v, ub) / s);
    }
    B.i.push(base, base + 1, base + 2);
  }
  // vertical face: centre c, outward normal n (horizontal), half width hw, half height hh
  vface(mat, c, n, hw, hh) {
    const t = [n[2], 0, -n[0]];
    const p = (sa, sb) => [c[0] + t[0] * sa * hw, c[1] + sb * hh, c[2] + t[2] * sa * hw];
    this.quad(mat, p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), n, t, UP);
  }
  // horizontal face: centre c, up (dir=1) or down (dir=-1), along unit d (half hl), across (half hw)
  hface(mat, c, dir, d, hl, hw) {
    const n = [0, dir, 0];
    const w = dir > 0 ? [d[2], 0, -d[0]] : [-d[2], 0, d[0]];
    const p = (sa, sb) => [c[0] + d[0] * sa * hl + w[0] * sb * hw, c[1], c[2] + d[2] * sa * hl + w[2] * sb * hw];
    this.quad(mat, p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), n, [1, 0, 0], dir > 0 ? [0, 0, -1] : [0, 0, 1]);
  }
  // oriented box. d = unit horizontal direction [dx,0,dz]; hl along d, ht across, y0..y1.
  // m: material or {a,b,e0,e1,top,bot,def}; 'a' = side facing (-dz, +dx).
  obox(cx, cz, y0, y1, d, hl, ht, m) {
    const M = m && !m.isMaterial ? m : { def: m };
    const g = (k) => (k in M ? M[k] : M.def);
    const na = [-d[2], 0, d[0]], cy = (y0 + y1) / 2, hy = (y1 - y0) / 2;
    if (hy <= 1e-5 || hl <= 1e-5 || ht <= 1e-5) return;
    this.vface(g('a'), [cx + na[0] * ht, cy, cz + na[2] * ht], na, hl, hy);
    this.vface(g('b'), [cx - na[0] * ht, cy, cz - na[2] * ht], [-na[0], 0, -na[2]], hl, hy);
    this.vface(g('e1'), [cx + d[0] * hl, cy, cz + d[2] * hl], d, ht, hy);
    this.vface(g('e0'), [cx - d[0] * hl, cy, cz - d[2] * hl], [-d[0], 0, -d[2]], ht, hy);
    this.hface(g('top'), [cx, y1, cz], 1, d, hl, ht);
    this.hface(g('bot'), [cx, y0, cz], -1, d, hl, ht);
  }
  // axis-aligned box by extents. m: material or {px,nx,py,ny,pz,nz,def}
  box(x0, y0, z0, x1, y1, z1, m) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const M = m && !m.isMaterial ? m : { def: m };
    const g = (k) => (k in M ? M[k] : M.def);
    this.obox((x0 + x1) / 2, (z0 + z1) / 2, y0, y1, [1, 0, 0], (x1 - x0) / 2, (z1 - z0) / 2,
      { a: g('pz'), b: g('nz'), e1: g('px'), e0: g('nx'), top: g('py'), bot: g('ny') });
  }
  // box from a segment p0->p1 (plan points [x,z]) with thickness th centred on the line
  seg(p0, p1, y0, y1, th, m, off = 0) {
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz);
    if (L < 1e-5) return;
    const d = [dx / L, 0, dz / L], na = [-d[2], 0, d[0]];
    const cx = (p0[0] + p1[0]) / 2 + na[0] * off, cz = (p0[1] + p1[1]) / 2 + na[2] * off;
    this.obox(cx, cz, y0, y1, d, L / 2, th / 2, m);
  }
  // add an arbitrary BufferGeometry (positions already in world space, uvs in metres)
  geom(geo, mats) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: P.count, materialIndex: 0 }];
    const list = Array.isArray(mats) ? mats : [mats];
    for (const gr of groups) {
      const mat = list[gr.materialIndex] ?? list[0];
      if (!mat) continue;
      const B = this.bucket(mat), s = mat.userData.s || 1;
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        const base = B.p.length / 3;
        B.p.push(P.getX(i), P.getY(i), P.getZ(i));
        B.n.push(N.getX(i), N.getY(i), N.getZ(i));
        B.u.push(U ? U.getX(i) / s : 0, U ? U.getY(i) / s : 0);
        B.i.push(base);
      }
    }
  }
  get empty() { return this.b.size === 0; }
  build({ cast = true, receive = true, name = this.name, renderOrder = 0 } = {}) {
    const group = new THREE.Group(); group.name = name;
    for (const [mat, B] of this.b) {
      if (!B.i.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
      geo.setIndex(B.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.i, 1) : new THREE.Uint16BufferAttribute(B.i, 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      const transparent = mat.transparent;
      mesh.castShadow = cast && !transparent && !mat.userData.noShadow;
      mesh.receiveShadow = receive;
      mesh.renderOrder = transparent ? 2 : renderOrder;
      mesh.name = (name ? name + ':' : '') + (mat.name || 'mat');
      group.add(mesh);
    }
    return group;
  }
}

// Extrude a plan polygon (array of [x,z]) between y0 and y1; holes = arrays of [x,z].
export function extrudePoly(pts, y0, y1, holes = []) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 12 });
  geo.rotateX(Math.PI / 2);   // shape y -> world z, extrusion -> -y
  geo.translate(0, y1, 0);
  return geo;   // group 0 = caps (top+bottom), group 1 = sides
}

// Flat polygon facing up at height y
export function flatPoly(pts, y, holes = [], down = false) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
  const geo = new THREE.ShapeGeometry(shape, 12);
  geo.rotateX(Math.PI / 2);   // faces -y after this; flip for up
  geo.translate(0, y, 0);
  if (!down) flipGeo(geo);
  return geo;
}

export function flipGeo(geo) {
  const idx = geo.index;
  if (idx) { for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); } idx.needsUpdate = true; }
  const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  n.needsUpdate = true;
  return geo;
}
