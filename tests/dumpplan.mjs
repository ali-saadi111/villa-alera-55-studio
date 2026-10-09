// Dump the model's plan footprints (top faces, x/z) per floor for comparison with the CAD set.
// usage: node tests/dumpplan.mjs out.json
import fs from 'fs';
import * as THREE from 'three';
import { buildVilla } from '../src/building.js';
const M = new Proxy({}, { get(t, k) { if (!t[k]) { const m = new THREE.MeshStandardMaterial(); m.name = String(k); m.userData.s = 1; if (k === 'glass' || k === 'glassRail' || k === 'water') m.transparent = true; t[k] = m; } return t[k]; } });
const V = buildVilla(M);
const out = {};
// keep only upward faces: their outline in plan is the footprint of the element
function tris(group, ymin = -1e9, ymax = 1e9) {
  const res = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, P = g.attributes.position, I = g.index;
    const n = I ? I.count : P.count;
    for (let i = 0; i < n; i += 3) {
      const ids = [0, 1, 2].map((k) => (I ? I.getX(i + k) : i + k));
      const p = ids.map((j) => [P.getX(j), P.getY(j), P.getZ(j)]);
      const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
      const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
      const ny = uz * vx - ux * vz;   // y of (u x v)
      const L = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1;
      if (Math.abs(ny / L) < 0.7) continue;
      const y = (p[0][1] + p[1][1] + p[2][1]) / 3;
      if (y < ymin || y > ymax) continue;
      res.push([+p[0][0].toFixed(3), +p[0][2].toFixed(3), +p[1][0].toFixed(3), +p[1][2].toFixed(3), +p[2][0].toFixed(3), +p[2][2].toFixed(3), +y.toFixed(2), o.material.name]);
    }
  });
  return res;
}
for (const f of Object.keys(V.floors)) {
  const L = V.floors[f];
  out[f] = { cut: tris(L.cut), base: tris(L.base), walk: tris(L.walk), doors: tris(L.doors), rails: [], glass: [] };
}
out.site = { walk: tris(V.site.walk), base: tris(V.site.base), water: tris(V.site.water) };
out.roof = tris(V.roof);
out.levels = V.levels;
fs.writeFileSync(process.argv[2] || 'plan.json', JSON.stringify(out));
console.log('ok', Object.fromEntries(Object.entries(out).filter(([k]) => k !== 'levels').map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.fromEntries(Object.entries(v).map(([a, b]) => [a, b.length]))])));
