import * as THREE from 'three';
import { buildVilla } from '../src/building.js';
const M = new Proxy({}, { get(t, k) { if (!t[k]) { const m = new THREE.MeshStandardMaterial(); m.name = String(k); m.userData.s = 1; if (k === 'glass' || k === 'glassRail' || k === 'water') m.transparent = true; t[k] = m; } return t[k]; } });
const t0 = Date.now();
const V = buildVilla(M);
let tris = 0, meshes = 0;
const count = (g) => g.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
for (const f of Object.keys(V.floors)) for (const k of Object.keys(V.floors[f])) count(V.floors[f][k]);
for (const k of Object.keys(V.site)) count(V.site[k]);
count(V.roof);
// NaN check
let bad = 0;
const chk = (g) => g.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position.array; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) { bad++; break; } } });
for (const f of Object.keys(V.floors)) for (const k of Object.keys(V.floors[f])) chk(V.floors[f][k]);
for (const k of Object.keys(V.site)) chk(V.site[k]);
chk(V.roof);
console.log('built in', Date.now() - t0, 'ms; meshes', meshes, 'tris', Math.round(tris), 'NaN meshes', bad);
console.log('walkables', Object.fromEntries(Object.entries(V.walkables).map(([k, v]) => [k, v.length])));
const bb = new THREE.Box3();
for (const f of Object.keys(V.floors)) { bb.makeEmpty(); bb.expandByObject(V.floors[f].full); console.log(f, 'walls bbox', bb.min.toArray().map(v=>v.toFixed(2)).join(','), '->', bb.max.toArray().map(v=>v.toFixed(2)).join(',')); }
