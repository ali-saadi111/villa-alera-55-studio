import { fakeRenderer } from './fakedom.mjs';
import * as THREE from 'three';
import { buildMaterials, MAT } from '../src/materials.js';
import { buildFurnitureMaterials, CATALOG, buildItemMesh } from '../src/furniture.js';
import { builtinLayout } from '../src/layout.js';
import { buildVilla } from '../src/building.js';

buildMaterials(fakeRenderer);
buildFurnitureMaterials();
let fails = 0;
const box = new THREE.Box3(), size = new THREE.Vector3();
const report = [];
for (const [type, def] of Object.entries(CATALOG)) {
  try {
    const g = buildItemMesh(type, {});
    let tris = 0, nan = 0, meshes = 0;
    g.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const p = o.geometry.attributes.position;
      tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
      for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) { nan++; break; }
      if (!o.material) nan++;
    });
    box.setFromObject(g); box.getSize(size);
    const [w, d, h] = def.dims;
    const off = Math.max(Math.abs(size.x - w), Math.abs(size.z - d), Math.abs(size.y - h));
    report.push(`${type.padEnd(20)} m${String(meshes).padStart(2)} t${String(Math.round(tris)).padStart(6)} size ${size.x.toFixed(2)}x${size.z.toFixed(2)}x${size.y.toFixed(2)} vs ${w}x${d}x${h}${off > 0.15 ? '  <-- size off by ' + off.toFixed(2) : ''}${nan ? '  NaN!' : ''} minY ${box.min.y.toFixed(2)}`);
    if (nan) fails++;
  } catch (e) { fails++; report.push(type + ' FAILED ' + e.stack); }
}
console.log(report.join('\n'));

// layout checks: every item builds; oriented footprints must not overlap; nothing inside walls; sits on a floor
const L = builtinLayout();
console.log('\nlayout items', L.length);
const V = buildVilla(MAT);
const soft = new Set(['rug', 'rugRound', 'rugPink', 'sheepskin', 'curtain', 'chandelier', 'pendant', 'mirrorLED', 'sconce', 'roundMirrors', 'mosaicArt', 'artFrame', 'cantileverUmbrella', 'umbrella', 'kitchenWall', 'hollywoodMirror']);
const fp = (it) => {   // footprint corners in world xz
  const c = Math.cos(it.ry), s = Math.sin(it.ry), hw = it.p.w / 2, hd = it.p.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [it.x + x * c + z * s, it.z - x * s + z * c]);
};
const proj = (pts, ax) => { let a = Infinity, b = -Infinity; for (const p of pts) { const d = p[0] * ax[0] + p[1] * ax[1]; a = Math.min(a, d); b = Math.max(b, d); } return [a, b]; };
function sat(A, B) {   // penetration depth of two convex quads (0 if separated)
  let depth = Infinity;
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const e = [P[(i + 1) % 4][0] - P[i][0], P[(i + 1) % 4][1] - P[i][1]], l = Math.hypot(...e), ax = [-e[1] / l, e[0] / l];
    const [a0, a1] = proj(A, ax), [b0, b1] = proj(B, ax);
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o <= 0) return 0; depth = Math.min(depth, o);
  }
  return depth;
}
const solid = L.filter((it) => !soft.has(it.type));
let ov = 0;
for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
  const A = solid[i], B = solid[j];
  if (A.floor !== B.floor) continue;
  const yA = [A.y, A.y + A.p.h], yB = [B.y, B.y + B.p.h];
  if (Math.min(yA[1], yB[1]) - Math.max(yA[0], yB[0]) < 0.05) continue;
  const d = sat(fp(A), fp(B));
  if (d > 0.03) { ov++; console.log(`overlap ${A.type}#${A.id} / ${B.type}#${B.id} depth ${d.toFixed(2)}`); }
}
const up = new THREE.Raycaster(), down = new THREE.Raycaster();
let inWall = 0, floating = 0;
const allWalk = [].concat(...Object.values(V.walkables));
for (const it of L) {
  if (CATALOG[it.type].hang || CATALOG[it.type].wall) continue;
  const walls = it.floor === 'site' ? V.walls.site : V.walls[it.floor];
  const pts = fp(it), c = [it.x, it.z];
  const inset = pts.map(([x, z]) => [x + (c[0] - x) * 0.12, z + (c[1] - z) * 0.12]);
  for (const [x, z] of [c, ...inset]) {
    up.set(new THREE.Vector3(x, it.y + 0.05, z), new THREE.Vector3(0, 1, 0)); up.far = Math.max(0.1, Math.min(it.p.h, 1.0) - 0.1);
    const hits = up.intersectObjects(walls, false).filter((h) => !h.object.material.transparent);
    if (hits.length && !soft.has(it.type)) { inWall++; console.log(`in wall? ${it.type}#${it.id} at ${x.toFixed(2)},${z.toFixed(2)} hit ${hits[0].object.name} d=${hits[0].distance.toFixed(2)}`); break; }
  }
  down.set(new THREE.Vector3(it.x, it.y + 0.4, it.z), new THREE.Vector3(0, -1, 0)); down.far = 1.5;
  const h = down.intersectObjects(allWalk, false)[0];
  const gap = h ? it.y - h.point.y : null;
  if (gap === null || Math.abs(gap) > 0.03) { floating++; console.log(`floor gap ${it.type}#${it.id} y=${it.y} floor=${h ? h.point.y.toFixed(3) + ' (' + h.object.name + ')' : 'none'}`); }
}
console.log(`\nfailures ${fails}, overlaps ${ov}, wall clashes ${inWall}, floor gaps ${floating}`);
process.exit(fails ? 1 : 0);
