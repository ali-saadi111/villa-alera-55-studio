// builds tests/fixtures/chair.glb (an office-chair-ish model in centimetres, Z-up like many CAD exports)
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'fs';
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend && this.onloadend(); }); } readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); }); } };
const s = new THREE.Scene();
const leather = new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.5, name: 'leather' });
const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.6, name: 'walnut' });
const alu = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.3, name: 'alu' });
const g = new THREE.Group(); g.name = 'Lounge chair (cm)';
const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
add(new THREE.BoxGeometry(80, 12, 55), leather, 0, 40, 5, -0.12);
add(new THREE.BoxGeometry(78, 55, 10), leather, 0, 72, -28, -0.35);
add(new THREE.BoxGeometry(82, 3, 58), wood, 0, 33, 5, -0.12);
add(new THREE.CylinderGeometry(3, 3, 30, 16), alu, 0, 17, 0);
for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const leg = add(new THREE.BoxGeometry(4, 3, 38), alu, Math.sin(a) * 17, 3, Math.cos(a) * 17); leg.rotation.y = a; }
g.rotation.x = Math.PI / 2;   // stored Z-up, as many CAD tools do
s.add(g);
new GLTFExporter().parse(s, (glb) => { fs.writeFileSync('tests/fixtures/chair.glb', Buffer.from(glb)); console.log('chair.glb', glb.byteLength); }, (e) => console.error(e), { binary: true });
