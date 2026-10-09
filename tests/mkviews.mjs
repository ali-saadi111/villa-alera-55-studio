// Write tests/refviews.json: cameras approximating the ten exterior reference images.
// Ground views are level (verticals stay vertical, like the photos) with the frame shifted by `shift`
// (fraction of the image height; + moves the frame up). Aerials aim at their target.
import fs from 'fs';
const ox = 2.2, oz = 5.39, c = Math.cos(0.0925), s = Math.sin(0.0925);
const W = (u, v) => [ox + u * c - v * s, oz - u * s - v * c];
const P = (u, v, y) => { const q = W(u, v); return [q[0], y, q[1]]; };
const ST = -1.45, FC = -1.32, G = -0.35, GL = -3.42, AT = 7.48, RS = 1.32 / 9;
const V = [
  { name: 'r01', pos: [-0.25, 0.25, -16.8], target: [0.4, 0, 0], fov: 64, shift: 0.26 },   // in the street, 3.8 m outside the gate
  { name: 'r02', pos: [-6.2, G + 1.3, -11.9], target: [-0.6, 0, -6.4], fov: 80, shift: 0.17 },   // the west lawn
  { name: 'r03', pos: [0.4, 0.95, -9.8], target: [-0.2, 0, -4.85], fov: 66, shift: 0.12 },   // on the entrance stair
  { name: 'r04', pos: [0.3, 0.6, -11.2], target: [2.2, 0, -6.0], fov: 66, shift: 0.12 },   // the foot of the entrance stair, looking across the terrace's glass
  { name: 'r05', pos: P(8.4, 8.9, GL + 1.20), target: P(5.0, 5.2, 0), fov: 54, shift: 0.04 },   // in the sunken lounge at the court's street end
  { name: 'r06', pos: P(7.75, 7.10, GL + 1.65), target: P(7.6, 0.5, 0), fov: 75, shift: 0.0 },   // the pool's street-end coping
  { name: 'r07', pos: [-7.80, G + 1.40, -3.55], target: [-9.3, 0, -10.6], fov: 72, shift: 0.0 },   // south end of the lounge terrace
  { name: 'r08', pos: P(3.8, 12.66, AT + 1.74), target: P(4.76, 7.75, 0), fov: 85, shift: -0.084 },   // the guest wing's roof terrace (photo 8)
  { name: 'r09', pos: [-0.6, 0.28, -13.6], target: [2.0, 0, -8.6], fov: 46, shift: 0.78 },   // just inside the gate, looking up at the wood box
  { name: 'r10', pos: [-0.2, 0.2, -15.8], target: [0.4, 0, 0], fov: 68, shift: 0.24, dusk: true },
  { name: 'aerial-front', pos: [16, 15, -27], target: [-0.8, 3.0, -1.0], fov: 42 },
  { name: 'aerial-back', pos: [-22, 12, 24], target: [-0.5, 0.5, 2], fov: 42 },
];
fs.writeFileSync('tests/refviews.json', JSON.stringify(V, null, 1));
console.log('wrote', V.length, 'views');
