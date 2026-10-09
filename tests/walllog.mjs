// Log every wall() call (floor, endpoints, thickness, offset, source line) for CAD comparison.
import fs from 'fs';
import * as THREE from 'three';
globalThis.__wallLog = [];
const { buildVilla } = await import('../src/building.js');
const M = new Proxy({}, { get(t, k) { if (!t[k]) { const m = new THREE.MeshStandardMaterial(); m.name = String(k); m.userData.s = 1; t[k] = m; } return t[k]; } });
buildVilla(M);
const out = globalThis.__wallLog.map((w) => ({ ...w, line: (w.line.match(/building\.js:(\d+)/) || [])[1] }));
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('walls', out.length);
