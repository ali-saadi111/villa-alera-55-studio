// The furniture that is in the villa today, placed from the 360° photos onto the plan.
// Each item: { id, type, floor, x, y, z, ry, p:{w,d,h,color,...} }  (y = world height of the item's base)
import { LV, CEIL, W, WING } from './util.js';
import { CATALOG } from './furniture.js';

const PI = Math.PI;
const GL = -3.42;    // the back yard (basement level)

let n = 0;
function item(type, floor, x, z, ry, o = {}) {
  const def = CATALOG[type];
  const p = { w: def.dims[0], d: def.dims[1], h: def.dims[2], ...(o.p || {}) };
  if (def.color != null && p.color == null) p.color = def.color;
  let y;
  if (o.y != null) y = o.y;
  else if (def.hang && floor !== 'site') y = CEIL[floor] - p.h;
  else y = (floor === 'site' ? 0 : LV[floor]) + (o.elev ?? def.elev ?? 0);
  return { id: 'b' + (++n).toString(36), type, floor, x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3), ry: +ry.toFixed(4), p, name: o.name };
}
// same, but positioned in the angled right wing's coordinates (u across, v toward the street)
function wing(type, floor, u, v, a, o = {}) {
  const [x, z] = W(u, v);
  return item(type, floor, x, z, a + WING.phi, o);
}

export function builtinLayout() {
  n = 0;
  const L = [];
  const add = (...a) => L.push(item(...a));
  const addW = (...a) => L.push(wing(...a));
  const skip = () => { ++n; };   // a retired piece keeps its id so the ones after it keep theirs (see RETIRED)

  // ---------------------------------------------------------------- ground floor: salon 2
  add('sofaTufted', 'gf', -6.10, 0.55, PI / 2);
  add('sofa', 'gf', -4.55, -2.05, 0, { name: 'Velvet sofa' });
  add('barrelChair', 'gf', -3.05, -0.15, -PI / 2 + 0.2);
  add('barrelChair', 'gf', -3.05, 1.10, -PI / 2 - 0.2);
  add('rug', 'gf', -4.55, 0.45, PI / 2, { p: { w: 3.6, d: 2.8 } });
  add('coffeeTableRect', 'gf', -4.65, 0.30, PI / 2);
  add('coffeeTableRound', 'gf', -3.85, 1.25, 0, { p: { w: 0.75, d: 0.75 } });
  add('palmLamp', 'gf', -6.30, -1.72, 0.4);
  add('palmLamp', 'gf', -6.30, 2.82, -0.3);
  add('benchBrass', 'gf', -4.45, 2.25, 0);
  add('curtain', 'gf', -6.62, 1.00, PI / 2, { p: { w: 2.9, h: 3.48 } });
  add('curtain', 'gf', -6.62, -2.40, PI / 2, { p: { w: 2.9, h: 3.48 } });
  add('curtain', 'gf', -6.62, -5.20, PI / 2, { p: { w: 2.1, h: 3.48 } });
  // ---------------------------------------------------------------- dining
  add('diningTable', 'gf', -4.55, 4.20, 0);
  for (const dx of [-1.05, -0.35, 0.35, 1.05]) {
    add('diningChair', 'gf', -4.55 + dx, 4.20 - 0.80, 0);
    add('diningChair', 'gf', -4.55 + dx, 4.20 + 0.80, PI);
  }
  add('diningChair', 'gf', -4.55 - 1.62, 4.20, PI / 2);
  add('diningChair', 'gf', -4.55 + 1.62, 4.20, -PI / 2);
  add('chandelier', 'gf', -4.55, 4.20, 0, { p: { h: 1.9 } });
  add('sideboard', 'gf', -2.33, 4.15, -PI / 2);
  add('tripodLamp', 'gf', -2.85, 5.20, 0.3);
  add('displayShelf', 'gf', -2.28, 2.45, -PI / 2);
  add('curtain', 'gf', -6.05, 5.52, 0, { p: { w: 1.0, h: 3.48 } });
  add('curtain', 'gf', -2.75, 5.52, 0, { p: { w: 1.0, h: 3.48 } });
  // ---------------------------------------------------------------- entrance hall
  add('barCounter', 'gf', 0.78, -3.00, -PI / 2, { p: { w: 1.8 } });
  add('barStool', 'gf', 0.12, -3.45, PI / 2);
  add('barStool', 'gf', 0.12, -2.60, PI / 2);
  addW('console', 'gf', 1.29, 8.20, -PI / 2);
  add('roundMirrors', 'gf', -1.70, 1.05, PI / 2, { elev: 2.35 });
  // ---------------------------------------------------------------- guest WC (photo 7)
  addW('vanityGlass', 'gf', 2.65, 7.33, 0);
  addW('mirrorLED', 'gf', 2.65, 7.56, 0, { elev: 1.15, p: { w: 1.1, h: 0.75 } });
  addW('sconce', 'gf', 3.36, 7.55, 0);
  addW('toiletWall', 'gf', 4.56, 6.85, -PI / 2);
  // ---------------------------------------------------------------- kitchen (right wing)
  addW('ovenTower', 'gf', 1.75, 5.73, 0);
  addW('fridgeTall', 'gf', 2.55, 5.70, 0, { p: { w: 0.92 } });
  addW('kitchenBase', 'gf', 4.17, 5.73, 0, { p: { w: 2.3, hob: 0.45 }, name: 'Cooktop run' });
  addW('kitchenWall', 'gf', 4.17, 5.86, 0, { p: { w: 2.3, hood: 0.45 } });
  addW('kitchenBase', 'gf', 5.06, 4.02, -PI / 2, { p: { w: 2.6, sink: 0.354 }, name: 'Sink run' });
  addW('breakfastBar', 'gf', 1.55, 2.40, 0);
  addW('stoolWhite', 'gf', 1.17, 3.16, 0);
  addW('stoolWhite', 'gf', 2.02, 3.16, 0);
  addW('highChair', 'gf', 2.30, 4.30, 0.4);

  // ---------------------------------------------------------------- first floor: landing
  add('mosaicArt', 'ff', -1.70, -4.20, PI / 2);
  add('displayShelf', 'ff', 0.95, -2.75, PI / 2, { name: 'Landing shelf' });
  // ---------------------------------------------------------------- bedroom 3 (children's room, photo 15)
  addW('bedNiche', 'ff', 0.51, 3.40, PI / 2);
  addW('bedPlatform', 'ff', 1.67, 3.40, PI / 2);
  addW('rugPink', 'ff', 3.02, 3.40, PI / 2, { p: { w: 2.4, d: 1.5 } });
  addW('sheepskin', 'ff', 3.75, 4.05, 0.3);
  addW('sheepskin', 'ff', 3.95, 1.75, -0.4);
  addW('wardrobe', 'ff', 1.90, 4.94, 0);
  addW('shelvesOpen', 'ff', 2.60, 5.08, 0);
  addW('wardrobe', 'ff', 3.30, 4.94, 0);
  addW('wardrobe', 'ff', 4.25, 4.94, 0, { p: { w: 0.9, mirror: true }, name: 'Mirrored wardrobe' });
  addW('deskCurved', 'ff', 5.125, 3.95, -PI / 2, { p: { w: 1.2 } });
  addW('pouf', 'ff', 4.55, 3.95, 0);
  addW('deskCurved', 'ff', 5.125, 1.95, -PI / 2, { p: { w: 1.1 }, name: 'Vanity counter' });
  addW('hollywoodMirror', 'ff', 5.27, 1.95, -PI / 2, { elev: 0.74, p: { w: 0.8, d: 0.26, h: 1.4 } });
  addW('curtain', 'ff', 0.47, 2.04, PI / 2, { p: { w: 1.8, h: 3.1 } });
  addW('curtain', 'ff', 1.75, 1.36, PI, { p: { w: 2.3, h: 3.1 } });
  addW('curtain', 'ff', 4.05, 1.36, PI, { p: { w: 2.3, h: 3.1 } });

  // ---------------------------------------------------------------- back yard: the round dining table (on the front terrace
  // until rev 6; the captures show the path and planted strips there): a stone table for eight under a big cantilever parasol,
  // its mast on the east side, the barbecue beside it
  const tx = -0.95, tz = 7.95, tR = 1.10;
  add('outdoorTable', 'site', tx, tz, 0, { y: GL, p: { w: 1.55, d: 1.55 } });
  for (let k = 0; k < 6; k++) {
    const b = k * PI / 4;
    add('outdoorChair', 'site', tx + tR * Math.sin(b), tz + tR * Math.cos(b), b + PI, { y: GL });
  }
  add('cantileverUmbrella', 'site', tx, tz, -PI / 2 + WING.phi, { y: GL, p: { w: 3.5, d: 3.5 } });
  add('bbq', 'site', 1.50, 9.20, PI, { y: GL });
  // (two lawn ornaments stood here once; the photos have none)
  skip(); skip();

  // ---------------------------------------------------------------- garden level (basement)
  // (cushions and a glass table in the pool court's sunken lounge until rev 6: the court became the indoor pool hall)
  skip(); skip(); skip(); skip();
  skip();
  // the indoor pool hall: the black glass outdoor kitchen on the deck, against the stone pier between the dining room's glass
  addW('outdoorKitchen', 'site', 5.44, 6.75, PI / 2, { y: GL + 0.004, p: { w: 1.40, d: 0.58, h: 2.38 } });
  add('sunLounger', 'site', 2.7375, 7.85, 0, { y: GL, p: { w: 0.62 } });
  add('sunLounger', 'site', 3.4375, 7.85, 0, { y: GL, p: { w: 0.62 } });
  // the lounge (on the side terrace until rev 6), now by the fire pit: the sofa along the yard's east wall, two armchairs
  // facing it, a slatted coffee table between
  add('outdoorSofa', 'site', 12.17, 8.20, -PI / 2 + 0.0903, { y: GL, p: { w: 1.95, seats: 3 } });
  add('outdoorArmchair', 'site', 10.45, 7.50, PI / 2, { y: GL });
  add('outdoorArmchair', 'site', 10.45, 8.90, PI / 2, { y: GL });
  add('slatTable', 'site', 11.33, 8.20, PI / 2, { y: GL });
  skip();   // (a second barbecue, rev 6)
  // the bar at the pool hall's street end, against the plant room's wall
  addW('outdoorBar', 'site', 7.60, 9.17, 0, { y: GL + 0.004 });
  addW('shelfRack', 'site', 5.42, 1.20, PI / 2, { y: GL + 0.004 });   // black metal rack in the pool hall's garden corner (photo 6; 360° view 11_09)

  // ---------------------------------------------------------------- added with the CAD set (R01)
  // the rest of the sun-lounger row on the garden terrace, between the steel shade's posts
  for (const x of [4.1375, 4.8375, 5.5375, 6.2375]) add('sunLounger', 'site', x, 7.85, 0, { y: GL, p: { w: 0.62 } });
  // (four loungers stood in the CAD's small garden pool here; the pool was taken out, only the long pool in the court stays)
  for (let i = 0; i < 4; i++) skip();
  // R2: the pool-side dining room behind the glass; its table just inside the slider (photo 5)
  addW('diningTable', 'site', 3.00, 7.60, PI / 2, { y: LV.b1, p: { w: 1.8, d: 0.95 }, name: 'Pool-side table' });
  for (let i = 0; i < 6; i++) skip();   // (white outdoor chairs here once; upholstered dining chairs replaced them, rev 5)
  // lounge chairs by the long glazing, looking out over the pool
  addW('outdoorArmchair', 'site', 4.10, 2.95, PI / 2, { y: LV.b1 });
  addW('outdoorArmchair', 'site', 4.10, 4.45, PI / 2, { y: LV.b1 });
  addW('glassTable', 'site', 4.10, 3.70, 0, { y: LV.b1, p: { w: 0.6, d: 0.6 } });
  // garden dining on the terrace below the games room
  add('diningTable', 'site', -5.35, 7.60, 0, { y: GL, p: { w: 2.2, d: 1.0 }, name: 'Garden table' });
  for (const x of [-6.10, -5.35, -4.60]) { add('outdoorChair', 'site', x, 6.82, 0, { y: GL }); add('outdoorChair', 'site', x, 8.38, PI, { y: GL }); }
  add('outdoorChair', 'site', -6.78, 7.60, PI / 2, { y: GL });
  add('outdoorChair', 'site', -3.92, 7.60, -PI / 2, { y: GL });

  // ---------------------------------------------------------------- added with the garden pieces from the CAD (rev 3)
  // two loungers on the deck either side of the palm bed
  for (const x of [-1.0985, 1.3365]) add('sunLounger', 'site', x, 5.305, 0, { y: GL + 0.04, p: { w: 0.62, d: 1.45 } });

  // ---------------------------------------------------------------- added with the attic's roof terrace (rev 4)
  // a sheer curtain drawn aside just inside the terrace door (photo 8; in the stone wing's door box since rev 6)
  add('curtain', 'at', -4.62, 2.86, 0, { y: LV.at + 0.02, p: { w: 0.62, d: 0.08, h: 2.36 } });

  // ---------------------------------------------------------------- added when the outdoors were matched to the photos (rev 5)
  // two loungers on the pool's sun shelf at its garden end, heads to the garden (photo 6)
  for (const u of [7.30, 7.92]) addW('sunLounger', 'site', u, 1.50, PI, { y: GL - 0.20, p: { w: 0.56, d: 1.85 } });
  // upholstered chairs round the pool-side table (photo 5)
  for (const v of [7.00, 7.60, 8.20]) {
    addW('diningChair', 'site', 3.78, v, -PI / 2, { y: LV.b1 });
    addW('diningChair', 'site', 2.22, v, PI / 2, { y: LV.b1 });
  }
  // the round table's last two chairs (photo 4: eight round it)
  for (const k of [6, 7]) add('outdoorChair', 'site', tx + tR * Math.sin(k * PI / 4), tz + tR * Math.cos(k * PI / 4), k * PI / 4 + PI, { y: GL });
  // pebble-topped planters either side of the entrance door: a white cylinder and a charcoal cube (photos 1, 3, 10)
  add('planterTall', 'site', 0.95, -5.06, 0, { y: 0 });
  add('planter', 'site', -1.45, -5.13, 0, { y: 0, p: { w: 0.48, d: 0.48, h: 0.72 } });
  // sheer curtains gathered at the two sides of the pool-side dining room's slider (photo 5)
  for (const v of [8.02, 8.88]) addW('curtain', 'site', 4.80, v, PI / 2, { y: LV.b1, p: { w: 0.42, d: 0.08, h: 2.70 } });
  // slatted side tables by the lounge: one at the sofa's end, one beside the armchair (photo 7)
  add('slatTable', 'site', 12.25, 9.45, 0, { y: GL, p: { w: 0.62, d: 0.45, h: 0.38 } });
  add('slatTable', 'site', 10.45, 6.80, 0, { y: GL, p: { w: 0.45, d: 0.45, h: 0.40 } });
  return L;
}

// Items that moved when the exterior was rebuilt from the reference photos, again when the walls were fitted to the
// CAD set, and when the outdoors were matched to the photos (rev 5): if a saved layout still has one exactly where an
// earlier version placed it (the user never moved it), move it to its current place.
const HIST = {
  b14: [['ovenTower', 'gf', 3.419, -0.417]],
  b15: [['fridgeTall', 'gf', 4.218, -0.461]],
  b16: [['kitchenBase', 'gf', 5.828, -0.641]],
  b17: [['kitchenWall', 'gf', 5.816, -0.77]],
  b18: [['kitchenBase', 'gf', 6.837, 0.923]],
  b19: [['breakfastBar', 'gf', 3.554, 3.959], ['breakfastBar', 'gf', 3.623, 3.952]],
  b1a: [['stoolWhite', 'gf', 3.105, 3.237], ['stoolWhite', 'gf', 3.175, 3.231]],
  b1b: [['stoolWhite', 'gf', 3.951, 3.159], ['stoolWhite', 'gf', 4.021, 3.152]],
  b1f: [['bedNiche', 'ff', 2.324, 1.964]],
  b1g: [['bedPlatform', 'ff', 3.479, 1.857]],
  b1h: [['rugPink', 'ff', 4.823, 1.732]],
  b1i: [['sheepskin', 'ff', 6.248, 0.847]],
  b1j: [['sheepskin', 'ff', 6.036, 3.98]],
  b1k: [['wardrobe', 'ff', 3.576, -0.342]],
  b1l: [['shelvesOpen', 'ff', 4.261, -0.546]],
  b1m: [['wardrobe', 'ff', 4.97, -0.471]],
  b1n: [['wardrobe', 'ff', 5.916, -0.559]],
  b1o: [['deskCurved', 'ff', 6.766, -0.005]],
  b1p: [['pouf', 'ff', 6.174, 0.05]],
  b1q: [['deskCurved', 'ff', 7.145, 4.078], ['deskCurved', 'ff', 7.225, 4.07]],
  b1r: [['hollywoodMirror', 'ff', 7.289, 4.064], ['hollywoodMirror', 'ff', 7.369, 4.057]],
  b1s: [['curtain', 'ff', 2.478, 4.059], ['curtain', 'ff', 2.548, 4.052]],
  b1t: [['curtain', 'ff', 4.951, 4.733], ['curtain', 'ff', 4.946, 4.683]],
  b1u: [['curtain', 'ff', 7.11, 2.022], ['curtain', 'ff', 7.19, 2.015]],
  b1v: [['outdoorTable', 'site', 3.42, -7.98], ['outdoorTable', 'site', 3.593, -9.904], ['outdoorTable', 'site', 3.197, -8.763]],
  b1w: [['outdoorChair', 'site', 3.333, -8.926], ['outdoorChair', 'site', 3.506, -10.85], ['outdoorChair', 'site', 3.095, -9.858]],
  b1x: [['outdoorChair', 'site', 4.196, -8.529], ['outdoorChair', 'site', 4.369, -10.453], ['outdoorChair', 'site', 3.9, -9.609]],
  b1y: [['outdoorChair', 'site', 4.283, -7.583], ['outdoorChair', 'site', 4.456, -9.507], ['outdoorChair', 'site', 4.292, -8.864]],
  b1z: [['outdoorChair', 'site', 3.508, -7.034], ['outdoorChair', 'site', 3.681, -8.958], ['outdoorChair', 'site', 4.043, -8.06]],
  b20: [['outdoorChair', 'site', 2.645, -7.431], ['outdoorChair', 'site', 2.818, -9.355], ['outdoorChair', 'site', 3.299, -7.667]],
  b21: [['outdoorChair', 'site', 2.557, -8.377], ['outdoorChair', 'site', 2.73, -10.301], ['outdoorChair', 'site', 2.494, -7.916]],
  b22: [['cantileverUmbrella', 'site', 3.968, -8.031], ['cantileverUmbrella', 'site', 4.141, -9.955], ['cantileverUmbrella', 'site', 3.197, -8.763]],
  b26: [['loungeCushions', 'site', 3.6, 7.45], ['loungeCushions', 'site', 3.6, 6.45]],
  b27: [['loungeCushions', 'site', 2.35, 6.35], ['loungeCushions', 'site', 2.35, 5.35]],
  b28: [['loungeCushions', 'site', 4.85, 6.35], ['loungeCushions', 'site', 4.85, 5.35]],
  b29: [['glassTable', 'site', 3.6, 6.4], ['glassTable', 'site', 3.6, 5.4]],
  b2b: [['outdoorKitchen', 'b1', 2.438, 1.351], ['outdoorKitchen', 'site', 6.991, -2.185], ['outdoorKitchen', 'site', 2.426, 0.247], ['outdoorKitchen', 'site', 6.993, -1.834]],
  b2c: [['sunLounger', 'b1', 4.893, -2.392], ['sunLounger', 'site', 8, 3.496], ['sunLounger', 'site', 2.69, 7.85]],
  b2d: [['sunLounger', 'b1', 4.81, -3.288], ['sunLounger', 'site', 8.796, 3.422], ['sunLounger', 'site', 3.39, 7.85]],
  b2e: [['outdoorSofa', 'site', 9.776, 7.7], ['outdoorSofa', 'site', -10.08, -5.25], ['outdoorSofa', 'site', -9.02, -5.3], ['outdoorSofa', 'site', -10.075, -5.375]],
  b2f: [['outdoorArmchair', 'site', 7.848, 7.276], ['outdoorArmchair', 'site', -8.05, -5.85], ['outdoorArmchair', 'site', -8.05, -6.45], ['outdoorArmchair', 'site', -9.3, -7]],
  b2g: [['outdoorArmchair', 'site', 7.959, 8.471], ['outdoorArmchair', 'site', -8.05, -4.65], ['outdoorArmchair', 'site', -8.05, -4.3], ['outdoorArmchair', 'site', -10.075, -3.975]],
  b2h: [['slatTable', 'site', 8.9, 7.781], ['slatTable', 'site', -9.05, -5.25], ['slatTable', 'site', -8.05, -5.375], ['slatTable', 'site', -9.05, -5.375]],
  b2i: [['bbq', 'site', 9.025, 9.678], ['bbq', 'site', -9.2, -7.9], ['bbq', 'site', -9.15, -8.3]],
  b2j: [['outdoorBar', 'site', 8.23, 5.433], ['outdoorBar', 'site', -9.6, -3.85], ['outdoorBar', 'site', -8.95, -10], ['outdoorBar', 'site', -10.35, -10]],
  b2k: [['shelfRack', 'site', 9.723, 5.295], ['shelfRack', 'site', -10.33, -6.9], ['shelfRack', 'site', -9.24, -6.95], ['shelfRack', 'site', -10.42, -6.9], ['shelfRack', 'site', 7.486, 3.694]],
  b2l: [['sunLounger', 'site', 4.09, 7.85]],
  b2m: [['sunLounger', 'site', 4.79, 7.85]],
  b2n: [['sunLounger', 'site', 5.49, 7.85]],
  b2o: [['sunLounger', 'site', 6.19, 7.85]],
  b2t: [['diningTable', 'site', 5.22, 1.66]],
  b30: [['outdoorArmchair', 'site', 5.2, -2.75]],
  b31: [['outdoorArmchair', 'site', 5.2, -1.85]],
  b32: [['glassTable', 'site', 5.95, -2.3]],
  b23: [['bbq', 'site', 5.499, -7.219]],
  b3e: [['curtain', 'at', 3.841, -3.5]],
  b3f: [['sunLounger', 'site', 9, 2.801]],
  b3g: [['sunLounger', 'site', 9.597, 2.745]],
  b3n: [['outdoorChair', 'site', 2.102, -8.661]],
  b3o: [['outdoorChair', 'site', 2.351, -9.465]],
  b3q: [['planter', 'site', -1.4, -5.11]],
  b3t: [['slatTable', 'site', -9.1, -4]],
  b3u: [['slatTable', 'site', -8.6, -7]],
};
// Pieces taken out of the built-in layout (their ids are skipped there): a saved layout that still has one exactly where
// it stood (the user never moved it) drops it.
const RETIRED = {
  b24: [['cubeLight', 'site', -4.6, -9.2]], b25: [['pebbleSeat', 'site', -3.7, -9.6]],
  b2a: [['cantileverUmbrella', 'site', 3.6, 6.3], ['cantileverUmbrella', 'site', 3.6, 5.3]],
  b2u: [['outdoorChair', 'site', 4.62, 0.93]], b2v: [['outdoorChair', 'site', 4.62, 2.39]], b2w: [['outdoorChair', 'site', 5.22, 0.93]],
  b2x: [['outdoorChair', 'site', 5.22, 2.39]], b2y: [['outdoorChair', 'site', 5.82, 0.93]], b2z: [['outdoorChair', 'site', 5.82, 2.39]],
  b2p: [['sunLounger', 'site', -1.05, 7.85]], b2q: [['sunLounger', 'site', -0.27, 7.85]], b2r: [['sunLounger', 'site', 0.51, 7.85]],
  b2s: [['sunLounger', 'site', 1.29, 7.85]],
  b26: [['loungeCushions', 'site', 9.434, -4.045], ['loungeCushions', 'site', 3.6, 7.45], ['loungeCushions', 'site', 3.6, 6.45]],
  b27: [['loungeCushions', 'site', 10.815, -3.245], ['loungeCushions', 'site', 2.35, 6.35], ['loungeCushions', 'site', 2.35, 5.35]],
  b28: [['loungeCushions', 'site', 10.73, -4.162], ['loungeCushions', 'site', 4.85, 6.35], ['loungeCushions', 'site', 4.85, 5.35]],
  b29: [['glassTable', 'site', 9.513, -3.142], ['glassTable', 'site', 3.6, 6.4], ['glassTable', 'site', 3.6, 5.4]],
  b2i: [['bbq', 'site', -10.3, -8.3], ['bbq', 'site', 9.025, 9.678], ['bbq', 'site', -9.2, -7.9], ['bbq', 'site', -9.15, -8.3]],
};
const RECOLOR = { outdoorSofa: [0x9b968f, 0xd6d1c8], outdoorArmchair: [0x9b968f, 0xd6d1c8] };
// Layout revision: 2 = furniture from the CAD set (items b2l onward) added; 3 = the loungers by the palm bed (b3c on);
// 4 = the curtain at the attic's terrace door (b3e); 5 = the outdoors matched to the photos (b3f on); 6 = the villa as
// built (Oct 2026 captures): no new pieces, the front and side terraces' furniture moved to the back yard, the sunken
// lounge's retired, interiors clear of the moved glazing.
// The main layout saved by an older revision gets those new pieces appended once; named copies and imported files
// load as they were saved.
export const LAYOUT_REV = 6;
const FIRST_NEW = { 2: 93, 3: 120, 4: 122, 5: 123, 6: 139 };
export function migrateLayout(recs, rev = LAYOUT_REV) {
  if (!Array.isArray(recs)) return { recs, changed: false };
  let fresh = null, changed = false;
  const builtins = () => (fresh = fresh || new Map(builtinLayout().map((q) => [q.id, q])));
  const kept = recs.filter((r) => {
    const t = RETIRED[r.id];
    if (!t || !t.some(([ty, f, x, z]) => r.type === ty && r.floor === f && Math.abs(r.x - x) <= 0.02 && Math.abs(r.z - z) <= 0.02)) return true;
    changed = true;
    return false;
  });
  // the lounge seating's cushions went from mid to light warm grey with rev 5 (photo 7); pieces still in the old colour follow
  const recol = (r) => {
    const c = (rev || 1) < 5 && RECOLOR[r.type];
    return c && r.p && r.p.color === c[0] ? ((changed = true), { ...r, p: { ...r.p, color: c[1] } }) : r;
  };
  const out = kept.map(recol).map((r) => {
    const h = HIST[r.id];
    if (!h || !h.some(([t, f, x, z]) => r.type === t && r.floor === f && Math.abs(r.x - x) <= 0.02 && Math.abs(r.z - z) <= 0.02)) return r;
    const n = builtins().get(r.id);
    if (!n || n.type !== r.type || (n.floor === r.floor && Math.abs(n.x - r.x) < 0.005 && Math.abs(n.z - r.z) < 0.005 && Math.abs(n.ry - r.ry) < 0.001 && Math.abs(n.y - (r.y ?? n.y)) < 0.005)) return r;
    changed = true;
    const dims = {};
    for (const k of ['w', 'd', 'h']) if (n.p && n.p[k] !== undefined) dims[k] = n.p[k];
    return { ...r, floor: n.floor, x: n.x, y: n.y, z: n.z, ry: n.ry, p: { ...(r.p || {}), ...dims } };
  });
  for (let k = (rev || 1) + 1; k <= LAYOUT_REV; k++) {
    const have = new Set(out.map((r) => r.id)), from = FIRST_NEW[k];
    for (const q of builtins().values()) {
      if (parseInt(q.id.slice(1), 36) < from || have.has(q.id)) continue;
      out.push({ ...q, p: { ...q.p }, orig: true }); changed = true;
    }
  }
  return { recs: out, changed };
}

// Room names from the CAD set (R01), for the labels shown in floor views
const wl = (name, u, v) => { const [x, z] = W(u, v); return { name, x, z }; };
export const ROOMS = {
  b1: [
    { name: 'Lower dining', x: -4.4, z: -2.5 }, { name: 'Lounge / games', x: -4.4, z: 2.6 }, { name: 'WC', x: -0.85, z: -4.3 }, { name: 'Store', x: 1.12, z: -0.2 },
    wl('Utility', 1.38, 10.8), wl('Bath', 3.07, 10.8), wl('Plant', 6.7, 10.85),
    wl('Pool-side dining', 2.6, 5.4), wl('Indoor pool', 8.5, 4.0), { name: 'Back yard', x: -0.2, z: 9.0 },
  ],
  gf: [
    { name: 'Salon 1', x: -4.4, z: -4.4 }, { name: 'Salon 2', x: -3.1, z: -1.55 }, { name: 'Dining', x: -4.4, z: 5.15 },
    { name: 'Entrance', x: -0.2, z: -3.2 }, wl('Kitchen', 2.9, 3.2), wl('Guest WC', 2.6, 6.75),
    wl('Ensuite', 3.2, 8.4), wl('Guest suite', 2.6, 10.6), wl('Driveway', 7.9, 7.0),
  ],
  ff: [
    { name: 'Bedroom 2', x: -4.4, z: -4.4 }, { name: 'Bath 2', x: -5.9, z: -0.6 }, { name: 'Bath / office', x: -4.15, z: -0.6 },
    { name: 'Office', x: -4.4, z: 3.4 }, { name: 'Landing', x: -0.2, z: -3.2 }, wl('Bedroom 4', 2.7, 11.2),
    wl('Bath 4', 2.5, 7.3), wl('Bath 3', 4.4, 7.5), wl('Bedroom 3', 3.6, 1.4),
  ],
  at: [
    { name: 'Master bedroom', x: -4.4, z: -3.0 }, { name: 'Suite lounge', x: -4.4, z: 0.4 }, { name: 'Roof terrace', x: -4.4, z: 4.3 },
    { name: 'Landing', x: -0.2, z: -3.2 }, wl('Suite bathroom', 2.6, 6.6), wl('Dressing room', 2.8, 10.4),
  ],
};
