// Furniture vs walls: sample each item's footprint on a 5 cm grid and test it against the wall footprints
// (top faces of the plan-cut layer) of its floor. Reports items standing in walls.
import { fakeRenderer } from './fakedom.mjs';
import * as THREE from 'three';
import { buildMaterials, MAT } from '../src/materials.js';
import { buildFurnitureMaterials, CATALOG } from '../src/furniture.js';
import { builtinLayout } from '../src/layout.js';
import { buildVilla } from '../src/building.js';
import { LV } from '../src/util.js';

buildMaterials(fakeRenderer); buildFurnitureMaterials();
const V = buildVilla(MAT);
const SKIP = new Set(['curtain', 'mirrorLED', 'sconce', 'roundMirrors', 'mosaicArt', 'hollywoodMirror', 'chandelier', 'kitchenWall', 'photoBox']);
function tris(group, ok = () => true) {
  const out = [];
  group.traverse((o) => {
    if (!o.isMesh || !ok(o)) return;
    const P = o.geometry.attributes.position, I = o.geometry.index, n = I ? I.count : P.count;
    for (let i = 0; i < n; i += 3) {
      const id = [0, 1, 2].map((k) => (I ? I.getX(i + k) : i + k));
      const p = id.map((j) => [P.getX(j), P.getY(j), P.getZ(j)]);
      const ny = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]);
      if (ny < 1e-6) continue;   // up-facing faces only (tops of walls, planters, columns)
      out.push({ a: p[0], b: p[1], c: p[2], y: Math.max(p[0][1], p[1][1], p[2][1]) });
    }
  });
  return out;
}
const inTri = (x, z, t) => {
  const s = (p, q) => (x - q[0]) * (p[2] - q[2]) - (p[0] - q[0]) * (z - q[2]);
  const d1 = s(t.a, t.b), d2 = s(t.b, t.c), d3 = s(t.c, t.a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const walls = {};
for (const f of ['b1', 'gf', 'ff', 'at']) walls[f] = tris(V.floors[f].cut, (o) => !o.material.transparent);
// site: vertical-ish solids standing above the ground (walls, planters, columns) — their top faces above the walk level
walls.site = tris(V.site.base, (o) => !o.material.transparent && o.material.name !== 'water');
let bad = 0;
for (const it of builtinLayout()) {
  const def = CATALOG[it.type];
  if (!def || def.hang || def.wall || SKIP.has(it.type)) continue;
  const T = walls[it.floor] || [];
  const c = Math.cos(it.ry), s = Math.sin(it.ry), hw = it.p.w / 2 - 0.03, hd = it.p.d / 2 - 0.03;
  let hits = 0, tot = 0;
  for (let a = -hw; a <= hw + 1e-6; a += 0.05) for (let b = -hd; b <= hd + 1e-6; b += 0.05) {
    const x = it.x + a * c + b * s, z = it.z - a * s + b * c; tot++;
    for (const t of T) {
      // site: solids standing above the item's base; tops well above the item itself are overhead (pergolas, shades)
      if (it.floor === 'site' && (t.y < it.y + 0.05 || t.y > it.y + Math.min(2.6, (it.p.h || def.dims[2] || 1) + 0.5))) continue;
      if (it.floor !== 'site' && t.y < LV[it.floor] + 0.05) continue;
      if (inTri(x, z, t)) { hits++; if (process.env.DBG && it.id === process.env.DBG) console.log("  hit", x.toFixed(2), z.toFixed(2), "tri y", t.y.toFixed(2), t.a.map((v) => v.toFixed(2)).join(","), t.b.map((v) => v.toFixed(2)).join(","), t.c.map((v) => v.toFixed(2)).join(",")); break; }
    }
  }
  if (hits) { bad++; console.log(`in wall: ${it.type}#${it.id} ${it.floor} (${it.x.toFixed(2)}, ${it.z.toFixed(2)}) ${(100 * hits / tot).toFixed(0)}% of footprint`); }
}
console.log('items in walls:', bad);
