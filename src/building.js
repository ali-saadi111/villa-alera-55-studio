// The villa shell, built from the four plan pages (Villa Alera 55):
// basement (b1), ground floor (gf), first floor (ff), attic (at), plus the site.
// Coordinates in metres: X right on the plans, Z down the plans (street at -Z).
import * as THREE from 'three';
import { Acc, extrudePoly, flatPoly } from './acc.js';
import { LV, SLAB, CUT_H, W, WING, wingLeftX, toWing, ROOF_Y, FAR_GROUND } from './util.js';

const WH = { b1: 3.05, gf: 3.56, ff: 3.22, at: 2.90 };     // wall height per floor (to slab/eave)
// Site levels from the captures of the villa as built (Oct 2026): the street and the driveway lie two risers below the
// porch, the forecourt, the front strips and the side passage one riser below it; the back yard is at basement level.
const ST = -0.36;                                        // street, driveway
const FC = -0.18;                                        // forecourt, front strips, side passage
const G = FC;                                            // (the upper ground)
const GL = -3.42;                                        // garden level ground (basement side)
const RH = 0.18;                                         // riser
const XW = -10.65;                                       // inner face of the boundary wall along the curved road (side passage)
const UC = 10.15;                                        // inner face of the driveway's east wall, toward the neighbour (wing-local u)
const UE = 10.40;                                        // its outer face
// the indoor pool hall under the driveway (your basement plan): the pool-side dining room's glass face (fac), the water
// (w0..w1 x v0..v1: 3.1 x 7 m in the back-right corner, from the garden end), the jacuzzi (jac x jac) inside its street-end
// east corner, the hall's garden glazing (end0) and street end (end1)
const PH = { fac: 5.15, w0: 6.95, w1: 10.05, v0: 0.45, v1: 7.45, jac: 1.6, end0: 0.10, end1: 9.45, door: [7.80, 9.10] };
const VN = 8.40;                                         // the guest-wing attic: bathroom | dressing room partition (wing v)
const BOX_BOT = LV.ff - 0.61;                            // underside of the wood box over the front strip
// Wall faces from the CAD set (Villa_Alera_Rmeileh_CAD_R01, mm traced plans aligned on the stair-core square):
const LW = { x0: -7.08, x1: -6.80, e1: -2.00, e0: -1.75, n0: -6.85, n1: -6.40, s1: 5.556, s0: 6.007 };   // left wing, ground..attic
const LB = { x0: -7.05, x1: -6.80, e1: -2.00, e0: -1.75, n0: -5.647, n1: -5.397, s1: 5.556, s0: 5.806 }; // left wing, basement
const CN = { z0: -4.85, z1: -4.49 };                     // stair core: street wall (outer, inner face)
const CS = 3.22;                                         // light-well glazing on the garden side of the core
const RX = { w: 0.18, wt: 0.34, e: 5.525, et: 0.25, g: -0.024, f: 13.64 };   // right wing: west/east wall centre+thickness (u), garden/street faces (v)
const VC0 = (WING.oz - CS) / Math.cos(WING.phi), VC1 = (WING.oz - CN.z0) / Math.cos(WING.phi);  // where the core runs along the right wing (v)
const BXV = RX.f - 2.0;                                  // the wood box's loggia: bedroom 4's glazing stands this far back from the box's face
const BXP = 0.55, BXC = 2.55;                            // the loggia's solid parapet and its ceiling, above the first floor
const BXL = 0.40, BXR = 0.45;                            // the box face's borders round the loggia: porch side (u 0..) and east side
const LOG = 1.20;                                        // the wood wing's back loggias: glazing this far in from its garden face (wing v)
const SLOTS = [[0.50, 1.05], [1.60, 2.15]];               // the stone wing's street-face slots (from the inner face of its west wall)
const VS = RX.f - 0.60;                                  // the guest-wing attic's street knee wall (centre), set back on the wood box
const VT = 9.43;                                         // the stone-wing attic's back wall (centre) onto its roof terrace (stone frame v)
// The stone wing in a frame like the guest wing's: u across it away from the stair core (u = 0 at its east face), v along it
// toward the garden (v = 0 at its street face).
const SF = (u, v) => [LW.e0 - u, LW.n0 + v];
// Tiled attic roofs (captures: both wings hipped behind stone knee walls; photo 8 for the tiles and the door box). Each in
// its wing's frame F, heights above the attic floor: tiles' edge at y0 on the outer (u1) and the two end (v0, v1) eaves,
// rising at pitch k to a flat top; on the core side (uw) the slopes die into the stair core's wall, or into raking walls
// where the core does not run (free: v intervals). co: the ceiling's depth below the tiles. box: the stone door box standing
// out of the v1 slope; dormer: a stone gable dormer in the outer slope.
const ROOF = {
  wood: { F: W, y0: 1.40, k: 0.75, top: 3.35, v0: RX.g - 0.08, u1: RX.e + RX.et / 2 + 0.08, v1: VS + 0.525, uw: 0.01, co: 0.08, cu: RX.w + RX.wt / 2,
    free: [[RX.g - 0.08, VC0], [VC1, VS + 0.525]], box: null, dormer: null,
    sky: { u0: 3.55, u1: 4.55, v0: 9.0, v1: 10.3 } },
  stone: { F: SF, y0: 1.30, k: 0.70, top: 3.00, v0: -0.08, u1: LW.e0 - LW.x0 + 0.08, v1: VT + 0.525, uw: 0.01, co: 0.08, cu: LW.e0 - LW.e1,
    free: [[-0.08, CN.z0 - LW.n0]],
    box: { u0: 1.665, u1: 3.665, top: 2.94, face: VT + 0.545, door: [2.115, 3.215], dh: 2.40 },
    dormer: { v0: 7.15, v1: 9.45, fr: 0.30, spring: 1.60, apex: 3.00 }, sky: null, vw: VT - 0.075 },
};
const roofY = (R, u, v) => Math.min(R.y0 + R.k * (R.v1 - v), R.y0 + R.k * (R.u1 - u), R.y0 + R.k * (v - R.v0), R.top);
const boxBack = (R) => R.v1 - (R.box.top - R.y0) / R.k;  // where the door box's top meets the slope

export function buildVilla(M) {
  const F = {};
  for (const f of ['b1', 'gf', 'ff', 'at']) {
    F[f] = { wall: new Acc(f + '-wall'), cut: new Acc(f + '-cut'), base: new Acc(f + '-base'), walk: new Acc(f + '-walk'),
      glass: new Acc(f + '-glass'), rail: new Acc(f + '-rail'), doors: new Acc(f + '-doors'), swings: [] };
  }
  const S = { walk: new Acc('site-walk'), base: new Acc('site-base'), water: new Acc('site-water'), rail: new Acc('site-rail'),
    roof: new Acc('roof'), roofGlass: new Acc('roof-glass') };
  const swingMat = new THREE.LineBasicMaterial({ color: 0x5b534a, transparent: true, opacity: 0.85 });
  const lamps = [];   // outdoor downlights (lit at dusk)

  // ---------------------------------------------------------------- helpers
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const wpt = (u, v) => W(u, v);
  const w3 = (u, v, y) => { const q = W(u, v); return [q[0], y, q[1]]; };
  const mobj = (m) => (m && !m.isMaterial ? m : { def: m });

  // wall from p0 to p1 (plan points), thickness th centred on the line.
  // mats: {a, b, def} where 'a' is the side to the left of travel when Z points down the page:
  //   travelling +X -> a = +Z side; travelling +Z -> a = -X side.
  function wall(f, p0, p1, th, mats, holes = [], o = {}) {
    const base = LV[f], y0 = base + (o.y0 ?? 0), y1 = base + (o.y1 ?? WH[f]);
    if (globalThis.__wallLog) globalThis.__wallLog.push({ f, p0, p1, th, off: o.off || 0, y0, y1, holes, line: new Error().stack.split('\n')[2] });
    const L = dist(p0, p1);
    if (L < 0.01) return;
    const at = (s) => [p0[0] + (p1[0] - p0[0]) * s / L, p0[1] + (p1[1] - p0[1]) * s / L];
    const hs = holes.map((h) => ({ a: Math.max(0, h.a), b: Math.min(L, h.b), y0: base + (h.y0 ?? 0), y1: base + (h.y1 ?? 2.4) }))
      .filter((h) => h.b > h.a).sort((p, q) => p.a - q.a);
    const pieces = [];
    let s = 0;
    for (const h of hs) {
      if (h.a > s) pieces.push([s, h.a, y0, y1]);
      if (h.y0 > y0 + 0.001) pieces.push([h.a, h.b, y0, h.y0]);
      if (h.y1 < y1 - 0.001) pieces.push([h.a, h.b, h.y1, y1]);
      s = Math.max(s, h.b);
    }
    if (s < L) pieces.push([s, L, y0, y1]);
    const cutY = base + CUT_H, mo = mobj(mats), off = o.off || 0;
    const acc = o.acc || F[f].wall;
    for (const [a, b, ya, yb] of pieces) {
      acc.seg(at(a), at(b), ya, yb, th, mats, off);
      if (o.noCut) continue;
      if (ya < cutY - 0.001) {
        const clamped = yb > cutY;
        F[f].cut.seg(at(a), at(b), ya, Math.min(yb, cutY), th, clamped ? { ...mo, top: M.poche } : mats, off);
      }
    }
  }
  // window frame + glass inside an opening [a,b] x [yb,yt] (relative heights) of the wall p0->p1
  function win(f, p0, p1, a, b, yb, yt, o = {}) {
    const L = dist(p0, p1), d = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L];
    const P = (s) => [p0[0] + d[0] * s, p0[1] + d[1] * s];
    const y0 = LV[f] + yb, y1 = LV[f] + yt, fw = o.fw ?? 0.055, th = o.th ?? 0.08, off = o.off ?? 0;
    const acc = o.acc || F[f].wall, frame = o.frame || M.bronze;
    acc.seg(P(a), P(a + fw), y0, y1, th, frame, off);
    acc.seg(P(b - fw), P(b), y0, y1, th, frame, off);
    acc.seg(P(a), P(b), y1 - fw, y1, th, frame, off);
    acc.seg(P(a), P(b), y0, y0 + fw, th, frame, off);
    const n = o.mull ?? Math.max(0, Math.round((b - a) / 1.25) - 1);
    for (let i = 1; i <= n; i++) { const s = a + (b - a) * i / (n + 1); acc.seg(P(s - fw / 2), P(s + fw / 2), y0, y1, th * 0.9, frame, off); }
    if (o.transom) acc.seg(P(a), P(b), LV[f] + o.transom - fw / 2, LV[f] + o.transom + fw / 2, th * 0.9, frame, off);
    const na = [-d[1], d[0]];
    const q0 = P(a + fw), q1 = P(b - fw);
    vquad(o.glassAcc || F[f].glass, o.glass || M.glass, [q0[0] + na[0] * off, y0 + fw, q0[1] + na[1] * off], [q1[0] + na[0] * off, y0 + fw, q1[1] + na[1] * off], y1 - y0 - 2 * fw);
  }
  // the stone wing's road-side face (captures R1-R3, RB1-RB3): one big stone frame (piers at the street and garden ends, a top
  // band) round a render infill over both floors, the frame standing a little proud of it. P runs along the face from its
  // street end; band: the top band's bottom above the floor (first floor only)
  const RF = [1.13, 10.18];
  function roadFace(f, P, th, holes, band = null) {
    const L = dist(...P), at = (s) => [P[0][0] + (P[1][0] - P[0][0]) * s / L, P[0][1] + (P[1][1] - P[0][1]) * s / L];
    const sub = (a, b) => holes.filter((h) => h.b > a && h.a < b).map((h) => ({ ...h, a: h.a - a, b: h.b - a }));
    const stone = { a: lime, b: pl, def: lime };
    wall(f, at(0), at(RF[0]), th, stone, sub(0, RF[0]));
    wall(f, at(RF[0]), at(RF[1]), th, { a: M.render, b: pl, def: lime }, sub(RF[0], RF[1]), band === null ? {} : { y1: band });
    if (band !== null) wall(f, at(RF[0]), at(RF[1]), th, stone, [], { y0: band });
    wall(f, at(RF[1]), at(L), th, stone, sub(RF[1], L));
    const y0 = LV[f], y1 = LV[f] + WH[f], x0 = LW.x0 - 0.07, x1 = LW.x0 + 0.005;
    F[f].wall.box(x0, y0, LW.n0 - 0.07, x1, y1, LW.n0 + RF[0], { def: lime });
    F[f].wall.box(x0, y0, LW.n0 + RF[1], x1, y1, LW.s0 + 0.07, { def: lime });
    if (band !== null) F[f].wall.box(x0, y0 + band, LW.n0 + RF[0], x1, y1 + SLAB, LW.n0 + RF[1], { def: lime });
  }
  // the stair core's street windows (captures F2, F3): a tall opening in the stone, a dark-wood centre panel between two
  // narrow glass slits, set back in the reveal
  function coreWindow(f, P, y0, y1) {
    const L = dist(...P), a = L / 2 - 1.20, b = L / 2 + 1.20, pa = L / 2 - 0.80, pb = L / 2 + 0.80;   // (capture F2: 2.4 m, the panel 1.6 m)
    wall(f, ...P, CN.z1 - CN.z0, { a: pl, b: lime, def: lime }, [{ a, b, y0, y1 }]);
    win(f, ...P, a, b, y0, y1, { mull: 0, off: 0.06, frame: M.champagne, fw: 0.04 });
    const d = [(P[1][0] - P[0][0]) / L, (P[1][1] - P[0][1]) / L], Q = (t) => [P[0][0] + d[0] * t, P[0][1] + d[1] * t];
    F[f].wall.seg(Q(pa), Q(pb), LV[f] + y0 + 0.04, LV[f] + y1 - 0.04, 0.06, clad, 0.015);
    for (const t of [pa, pb]) F[f].wall.seg(Q(t - 0.02), Q(t + 0.02), LV[f] + y0, LV[f] + y1, 0.09, M.champagne, 0.03);
  }
  // a round steel tube through 3D points (THREE.Vector3)
  function steelTube(acc, pts, r, mat = M.stainless) {
    acc.geom(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), pts.length * 10, r, 10, false), mat);
  }
  // vertical quad standing on the bottom edge a->b (3D points), height h
  function vquad(acc, mat, a, b, h) {
    const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1;
    const t = [dx / L, 0, dz / L], n = [-t[2], 0, t[0]];
    const up = (p) => [p[0], p[1] + h, p[2]];
    acc.quad(mat, a, b, up(b), up(a), n, t, [0, 1, 0]);
  }
  // a glass panel whose bottom edge runs a->b (may slope), with vertical sides of height h
  function railPanel(acc, a, b, h, mat = M.glassRail) {
    const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1;
    const t = [dx / L, 0, dz / L], n = [-t[2], 0, t[0]];
    acc.quad(mat, a, b, [b[0], b[1] + h, b[2]], [a[0], a[1] + h, a[2]], n, t, [0, 1, 0]);
  }
  // frameless glass guard (the attic roof terrace, photo 8): panels about pw wide with hairline gaps, their green edges showing
  function glassGuard(acc, pts, h, pw) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(L / pw));
      const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], g = 0.006 / L;
      for (let k = 0; k < n; k++) {
        const p = at(k / n + (k ? g : 0)), q = at((k + 1) / n - (k < n - 1 ? g : 0));
        railPanel(acc, p, q, h);
        acc.seg([p[0], p[2]], [q[0], q[2]], p[1] + h - 0.012, p[1] + h, 0.012, M.glassEdge);
        const d = [(q[0] - p[0]) / L, (q[2] - p[2]) / L];
        for (const e of [p, q]) acc.seg([e[0] - d[0] * 0.006, e[2] - d[1] * 0.006], [e[0] + d[0] * 0.006, e[2] + d[1] * 0.006], e[1], e[1] + h, 0.012, M.glassEdge);
      }
    }
  }
  // vertical trapezoid on the plan line p0->p1 facing its 'a' side (left of travel, as for wall()): bottoms yb0/yb1 and
  // tops yt0/yt1 at its two ends
  function vtrap(acc, mat, p0, p1, yb0, yb1, yt0, yt1) {
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1;
    const t = [dx / L, 0, dz / L], n = [-t[2], 0, t[0]];
    acc.quad(mat, [p0[0], yb0, p0[1]], [p1[0], yb1, p1[1]], [p1[0], yt1, p1[1]], [p0[0], yt0, p0[1]], n, t, [0, 1, 0]);
  }
  // a wall p0->p1 of thickness th, bottom yb, its top sloping from yt0 to yt1; m: {a, b, top, e0, e1}
  function rakeWall(acc, p0, p1, th, yb, yt0, yt1, m) {
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1, na = [-dz / L * th / 2, dx / L * th / 2];
    const A0 = [p0[0] + na[0], p0[1] + na[1]], A1 = [p1[0] + na[0], p1[1] + na[1]], B0 = [p0[0] - na[0], p0[1] - na[1]], B1 = [p1[0] - na[0], p1[1] - na[1]];
    vtrap(acc, m.a, A0, A1, yb, yb, yt0, yt1);
    vtrap(acc, m.b, B1, B0, yb, yb, yt1, yt0);
    vtrap(acc, m.e0, B0, A0, yb, yb, yt0, yt0);
    vtrap(acc, m.e1, A1, B1, yb, yb, yt1, yt1);
    const q = [[A0[0], yt0, A0[1]], [B0[0], yt0, B0[1]], [B1[0], yt1, B1[1]], [A1[0], yt1, A1[1]]];
    let n = [0, 1, 0];
    { const u = q[1].map((v, i) => v - q[0][i]), w = q[2].map((v, i) => v - q[0][i]); n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; }
    if (n[1] < 0) { q.reverse(); n = n.map((v) => -v); }
    const nl = Math.hypot(...n); n = n.map((v) => v / nl);
    const ut = [dx / L, 0, dz / L], ub = [n[1] * ut[2] - n[2] * ut[1], n[2] * ut[0] - n[0] * ut[2], n[0] * ut[1] - n[1] * ut[0]];
    acc.quad(m.top, q[0], q[1], q[2], q[3], n, ut, ub);
  }
  function rail(acc, pts, h = 1.05, shoe = true, shoeAcc = null) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      railPanel(acc, a, b, h);
      if (shoe && Math.abs(b[1] - a[1]) < 0.01) (shoeAcc || S.base).seg([a[0], a[2]], [b[0], b[2]], a[1], a[1] + 0.06, 0.06, M.steelBlack);
    }
  }
  // frameless glass between stainless posts with clamps (the terraces in photos 1-4); pts are [x, y, z]
  function glassRail(accGlass, accPost, pts, h = 1.0, sp = 1.1) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(L / sp));
      const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const g = 0.035 / L;
      for (let k = 0; k < n; k++) railPanel(accGlass, at(k / n + (k ? g : 0.004 / L)), at((k + 1) / n - (k < n - 1 ? g : 0.004 / L)), h);
      const d = [(b[0] - a[0]) / L, (b[2] - a[2]) / L];
      for (let k = 0; k <= n; k++) {
        if (i > 0 && k === 0) continue;
        const q = at(k / n);
        accPost.geom(new THREE.CylinderGeometry(0.021, 0.021, h - 0.02, 12).translate(q[0], q[1] + (h - 0.02) / 2, q[2]), M.stainless);
        for (const y of [0.22, h - 0.25]) accPost.seg([q[0] - d[0] * 0.05, q[2] - d[1] * 0.05], [q[0] + d[0] * 0.05, q[2] + d[1] * 0.05], q[1] + y, q[1] + y + 0.05, 0.05, M.stainless);
      }
    }
  }
  // door: casing in the wall, leaf open 90° toward side ('a'|'b'), hinge at start or end of opening
  function door(f, p0, p1, a, b, o = {}) {
    const L = dist(p0, p1), d = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L];
    const P = (s) => [p0[0] + d[0] * s, p0[1] + d[1] * s];
    const h = o.h ?? 2.4, th = o.wallTh ?? 0.14, y0 = LV[f], w = b - a;
    const casing = o.casing || M.walnut, leafM = o.leaf || M.doorWalnut;
    const na = [-d[1], d[0]], sgn = (o.side || 'a') === 'a' ? 1 : -1;
    const n = [na[0] * sgn, na[1] * sgn];
    // casing (cw: width of the trim on the wall face; cth: its depth through the wall)
    const cw = o.casingW ?? 0.04, cth = o.casingTh ?? th + 0.03, coff = o.casingOff ?? 0;
    F[f].wall.seg(P(a - cw), P(a), y0, y0 + h + cw, cth, casing, coff);
    F[f].wall.seg(P(b), P(b + cw), y0, y0 + h + cw, cth, casing, coff);
    F[f].wall.seg(P(a - cw), P(b + cw), y0 + h, y0 + h + Math.max(0.05, cw), cth, casing, coff);
    // leaf
    const hingeS = (o.hinge || 'start') === 'start' ? a : b;
    const H = P(hingeS);
    const Hs = [H[0] + n[0] * th / 2, H[1] + n[1] * th / 2];
    const tip = [Hs[0] + n[0] * (w - 0.02), Hs[1] + n[1] * (w - 0.02)];
    const inward = (o.hinge || 'start') === 'start' ? 1 : -1;
    const sh = [d[0] * 0.025 * inward, d[1] * 0.025 * inward], lt = o.leafTh ?? 0.045;
    F[f].doors.seg([Hs[0] + sh[0], Hs[1] + sh[1]], [tip[0] + sh[0], tip[1] + sh[1]], y0 + 0.01, y0 + h - 0.01, lt, leafM);
    // handle: a lever, or a long vertical pull on both faces for the big front door
    if (o.pull) {
      const q = [tip[0] - n[0] * 0.14 + sh[0], tip[1] - n[1] * 0.14 + sh[1]];
      for (const s of [1, -1]) {
        const off = [d[0] * inward * s * (lt / 2 + 0.05), d[1] * inward * s * (lt / 2 + 0.05)];
        F[f].doors.box(q[0] + off[0] - 0.014, y0 + 0.55, q[1] + off[1] - 0.014, q[0] + off[0] + 0.014, y0 + 0.55 + o.pull, q[1] + off[1] + 0.014, M.steelBlack);
      }
    } else {
      F[f].doors.seg([tip[0] - n[0] * 0.06 + sh[0] * 2.4, tip[1] - n[1] * 0.06 + sh[1] * 2.4], [tip[0] - n[0] * 0.18 + sh[0] * 2.4, tip[1] - n[1] * 0.18 + sh[1] * 2.4], y0 + 1.0, y0 + 1.03, 0.02, M.brass);
    }
    // swing arc for plan view
    const other = P(hingeS === a ? b : a);
    const dd = [(other[0] - H[0]) / w, (other[1] - H[1]) / w];
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const th2 = (i / 16) * Math.PI / 2;
      pts.push(new THREE.Vector3(Hs[0] + (dd[0] * Math.cos(th2) + n[0] * Math.sin(th2)) * w, y0 + 0.012, Hs[1] + (dd[1] * Math.cos(th2) + n[1] * Math.sin(th2)) * w));
    }
    pts.push(new THREE.Vector3(Hs[0], y0 + 0.012, Hs[1]));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), swingMat);
    F[f].swings.push(line);
  }
  // structural slab: body (ceiling below) + optional finish (walkable) on top
  function slab(f, outline, holes, finishMat, o = {}) {
    const y = o.y ?? LV[f], t = o.t ?? SLAB;
    const body = extrudePoly(outline, y - t, y - 0.02, holes);
    (o.acc || F[f].base).geom(body, [o.under || M.ceiling, o.edge || M.limestone]);
    if (finishMat) (o.walkAcc || F[f].walk).geom(flatPoly(outline, y, holes), finishMat);
  }
  function finish(f, outline, mat, holes = [], y = LV[f] + 0.002) { F[f].walk.geom(flatPoly(outline, y, holes), mat); }
  // a floor finish whose texture runs along the guest wing (planks toward the street)
  function finishV(f, outline, mat, y = LV[f] + 0.002) {
    const g = flatPoly(outline, y), P = g.attributes.position, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { const [u, v] = toWing(P.getX(i), P.getZ(i)); U.setXY(i, v, u); }
    F[f].walk.geom(g, mat);
  }
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const wrect = (u0, v0, u1, v1) => [wpt(u0, v0), wpt(u1, v0), wpt(u1, v1), wpt(u0, v1)];
  // add an extruded prism to full + cut accumulators (stairs etc.)
  function prism(f, poly, y0, y1, mats) {
    F[f].wall.geom(extrudePoly(poly, y0, y1), mats);
    const cutY = LV[f] + CUT_H;
    if (y0 < cutY) {
      const cy = Math.min(y1, cutY);
      F[f].cut.geom(extrudePoly(poly, y0, cy), y1 > cutY ? [M.poche, mats[1] || mats[0]] : mats);
    }
  }

  // ---------------------------------------------------------------- stair
  // three flights around the light well: A (west, going +z), B (south, +x), C (east, -z)
  const SX0 = -1.72, SXW0 = -0.55, SXW1 = 0.58, SX1 = 1.62, SZW0 = -0.55, SZW1 = 0.55, SZ1 = 1.72;
  function stair(f, nA, nB, nC, toNext) {
    const base = LV[f], N = nA + nB + nC + 4 + 1, h = toNext / N;
    const tread = (k) => base + k * h;
    const mats = [M.marbleSlab, M.marbleSlab];
    const blk = (poly, k) => prism(f, poly, Math.max(base, tread(k) - 0.42), tread(k), [M.marbleSlab, M.marbleSlab]);
    let k = 0;
    const zA0 = SZW1 - nA * 0.30;
    for (let i = 0; i < nA; i++) { k++; blk(rect(SX0, zA0 + i * 0.3, SXW0, zA0 + (i + 1) * 0.3), k); }
    k++; blk([[SX0, SZW1], [SXW0, SZW1], [SX0, SZ1]], k);
    k++; blk([[SXW0, SZW1], [SXW0, SZ1], [SX0, SZ1]], k);
    const bw = (SXW1 - SXW0) / nB;
    for (let i = 0; i < nB; i++) { k++; blk(rect(SXW0 + i * bw, SZW1, SXW0 + (i + 1) * bw, SZ1), k); }
    k++; blk([[SXW1, SZW1], [SXW1, SZ1], [SX1, SZ1]], k);
    k++; blk([[SXW1, SZW1], [SX1, SZ1], [SX1, SZW1]], k);
    for (let i = 0; i < nC; i++) { k++; blk(rect(SXW1, SZW1 - (i + 1) * 0.3, SX1, SZW1 - i * 0.3), k); }
    void mats;
    // glass balustrades around the well and on the void side
    const R = F[f].rail;
    rail(R, [[SXW0, tread(1), zA0], [SXW0, tread(nA), SZW1]], 1.0, false);
    rail(R, [[SXW0, tread(nA + 2), SZW1], [SXW1, tread(nA + 2 + nB), SZW1]], 1.0, false);
    rail(R, [[SXW1, tread(nA + nB + 5), SZW1], [SXW1, tread(N - 1), SZW1 - nC * 0.3]], 1.0, false);
    rail(R, [[SX0, tread(nA + 1), SZ1], [SX1, tread(nA + nB + 4), SZ1]], 1.0, false);
    return { zA0, zC1: SZW1 - nC * 0.3 };
  }
  // slab hole around the stair + void, as one polygon
  const VOID_Z1 = CS - 0.06;
  function coreHole(zA, zC) {
    const pts = [];
    if (zA !== null) pts.push([SX0, zA], [SXW0, zA]); else pts.push([SX0, SZW1], [SXW0, SZW1]);
    pts.push([SXW0, SZW0], [SXW1, SZW0], [SXW1, zC], [SX1, zC], [SX1, SZ1]);
    pts.push([wingLeftX(SZ1) - 0.02, SZ1], [wingLeftX(VOID_Z1) - 0.02, VOID_Z1], [SX0, VOID_Z1]);
    return pts;
  }
  const centreOutline = (zN) => [[-1.875, zN], [wingLeftX(zN) + RX.w, zN], [wingLeftX(CS + 0.08) + RX.w, CS + 0.08], [-1.875, CS + 0.08]];

  // ---------------------------------------------------------------- materials by role
  const lime = M.limestone, pl = M.plaster, cream = M.cream, clad = M.woodClad;
  const dishMat = M.whiteGloss.clone(); dishMat.side = THREE.DoubleSide; dishMat.name = 'dish';

  // ================================================================ BASEMENT
  {
    const f = 'b1';
    const wl = (u0, v0, u1, v1, th, mats, holes, o) => wall(f, wpt(u0, v0), wpt(u1, v1), th, mats, holes, o);
    // floors: the left wing, the core, and under the right wing the pool-side dining room with the service rooms
    slab(f, rect(LB.x0, LB.n0, LB.e0, LB.s0), [], M.marble, { t: 0.4, under: M.concrete });
    slab(f, [[LB.e0, LB.n0], [wingLeftX(LB.n0) + 0.01, LB.n0], [wingLeftX(CS + 0.08) + 0.01, CS + 0.08], [LB.e0, CS + 0.08]], [], M.marble, { t: 0.4, under: M.concrete });
    slab(f, [wpt(0, 1.59), wpt(PH.fac, 1.59), wpt(PH.fac, 9.45), wpt(UC, 9.45), wpt(UC, 12.305), wpt(0, 12.305)], [], null, { t: 0.4, under: M.concrete });
    finish(f, wrect(0.35, 1.84, PH.fac - 0.25, 9.29), M.marble);
    finish(f, wrect(0.35, 9.41, 5.02, 12.055), M.tilesGray);
    finish(f, wrect(5.15, 9.55, UC, 12.055), M.concrete);
    // lounge / games (left wing)
    const T = 0.25, xw = (LB.x0 + LB.x1) / 2, xe = (LB.e1 + LB.e0) / 2;
    const WW = [[xw, LB.n0], [xw, LB.s0]];
    wall(f, ...WW, T, { a: lime, b: pl, def: lime }, [{ a: 9.05, b: 10.65, y0: 0.9, y1: 2.4 }]);
    win(f, ...WW, 9.05, 10.65, 0.9, 2.4);
    const EW = [[xe, LB.n0], [xe, LB.s0]];
    wall(f, ...EW, T, { a: pl, b: pl, def: lime }, [{ a: 2.10, b: 3.73, y1: 2.4 }, { a: 7.94, b: 8.64, y1: 2.3 }]);
    door(f, ...EW, 7.94, 8.64, { side: 'a', leaf: M.doorWhite, casing: M.woodWhite, wallTh: T });
    wall(f, [LB.x1, (LB.n0 + LB.n1) / 2], [LB.e1, (LB.n0 + LB.n1) / 2], T, { a: pl, b: lime, def: lime });
    const SWb = [[LB.x1, (LB.s0 + LB.s1) / 2], [LB.e1, (LB.s0 + LB.s1) / 2]];
    // its garden face (captures B1, B3): three bays between two stone pilasters, narrow, wide, narrow, glazed deep in the stone
    const BAYS = [[0.45, 1.00], [1.50, 3.30], [3.80, 4.35]];
    wall(f, ...SWb, T, { a: lime, b: pl, def: lime }, BAYS.map(([a, b]) => ({ a, b, y1: 2.7 })));
    for (const [a, b] of BAYS) win(f, ...SWb, a, b, 0, 2.7, { mull: b - a > 1 ? 1 : 0, off: -0.06 });
    // centre: retaining wall to the street, the WC
    wall(f, [LB.e0, (LB.n0 + LB.n1) / 2], [wingLeftX(-5.52) + 0.02, (LB.n0 + LB.n1) / 2], T, { a: pl, b: lime, def: lime });
    wall(f, [LB.e0, -3.53], [0.36, -3.53], 0.25, pl, [{ a: 0.85, b: 1.60, y1: 2.3 }]);
    door(f, [LB.e0, -3.53], [0.36, -3.53], 0.85, 1.60, { side: 'b', leaf: M.doorWhite, casing: M.woodWhite, wallTh: 0.25 });
    wall(f, [0.30, LB.n1], [0.30, -3.655], 0.12, pl);
    // right wing: west wall along the core — glass to the light well, solid, then a glass slider from the stair hall
    wl(RX.w, 1.59, RX.w, 3.40, RX.wt, { a: lime, b: pl, def: lime }, [{ a: 0.05, b: 1.76, y1: 2.75 }]);
    win(f, wpt(RX.w, 1.59), wpt(RX.w, 3.40), 0.05, 1.76, 0, 2.75, { mull: 1 });
    wl(RX.w, 3.40, RX.w, 6.84, RX.wt, { a: lime, b: pl, def: lime });
    wl(RX.w, 6.84, RX.w, 9.29, RX.wt, { a: lime, b: pl, def: lime }, [{ a: 0.10, b: 2.35, y1: 2.75 }]);
    win(f, wpt(RX.w, 6.84), wpt(RX.w, 9.29), 0.10, 2.35, 0, 2.75, { mull: 1, off: -0.04 });
    wl(RX.w, 9.29, RX.w, 12.305, RX.wt, { a: pl, b: lime, def: lime });
    // service rooms at the street end: utility / staff, bath, a passage, the pool plant room
    wl(0.35, 9.35, 5.02, 9.35, 0.12, { a: lime, b: pl, def: lime }, [{ a: 0.55, b: 1.35, y1: 2.3 }, { a: 2.40, b: 3.05, y1: 2.3 }, { a: 3.55, b: 4.35, y1: 2.3 }]);
    door(f, wpt(0.35, 9.35), wpt(5.02, 9.35), 0.55, 1.35, { side: 'b', leaf: M.doorWhite, casing: M.woodWhite, wallTh: 0.12 });
    door(f, wpt(0.35, 9.35), wpt(5.02, 9.35), 2.40, 3.05, { side: 'b', leaf: M.doorWhite, casing: M.woodWhite, wallTh: 0.12 });
    door(f, wpt(0.35, 9.35), wpt(5.02, 9.35), 3.55, 4.35, { side: 'b', leaf: M.doorWalnut, wallTh: 0.12 });
    wl(2.40, 9.41, 2.40, 12.055, 0.12, pl);
    wl(3.745, 9.41, 3.745, 12.055, 0.11, pl);
    wl(5.02, 9.29, 5.02, 12.055, 0.26, { a: pl, b: pl, def: lime }, [{ a: 0.40, b: 1.20, y1: 2.3 }]);
    door(f, wpt(5.02, 9.29), wpt(5.02, 12.055), 0.40, 1.20, { side: 'a', leaf: M.doorWhite, casing: M.woodWhite, wallTh: 0.26 });
    // the plant room's door opens off the pool hall's street end, by the dining room's slider
    wl(5.15, 9.50, UC, 9.50, 0.10, { a: lime, b: pl, def: lime }, [{ a: 0.14, b: 1.04, y1: 2.3 }], { y1: ST - 0.30 - LV.b1 });
    door(f, wpt(5.15, 9.50), wpt(UC, 9.50), 0.14, 1.04, { side: 'b', leaf: M.doorWalnut, wallTh: 0.10 });
    wl(0, 12.18, PH.fac, 12.18, 0.25, { a: pl, b: lime, def: lime });   // plaster faces the rooms
    wl(PH.fac, 12.18, UC, 12.18, 0.25, { a: pl, b: lime, def: lime }, [], { y1: ST - 0.30 - LV.b1 });   // (under the driveway)
    // the pool-side dining room (R2) behind glass on the indoor pool hall: a long glazed run, a stone pier, a two-leaf slider
    // at the street end; glass doors onto the covered terrace at its garden end
    const FR = [wpt(PH.fac - 0.125, 1.59), wpt(PH.fac - 0.125, 9.29)];
    // (the long glazing sits deep in the stone; the slider is lower than it, as photo 5 shows)
    wall(f, ...FR, 0.25, { a: lime, b: pl, def: lime }, [{ a: 0.25, b: 4.11, y1: 2.75 }, { a: 6.21, b: 7.51, y1: 2.45 }]);
    win(f, ...FR, 0.25, 4.11, 0, 2.75, { mull: 4, off: -0.09, glass: M.glassTint }); win(f, ...FR, 6.21, 7.51, 0, 2.45, { mull: 1, off: -0.05 });
    wl(0.35, 1.715, PH.fac - 0.25, 1.715, 0.25, { a: lime, b: pl, def: lime }, [{ a: 0.30, b: 4.30, y1: 2.75 }]);
    win(f, wpt(0.35, 1.715), wpt(PH.fac - 0.25, 1.715), 0.30, 4.30, 0, 2.75, { mull: 3 });
    // the pool hall's glass return toward the covered terrace under the ground floor's back edge
    wl(PH.fac - 0.125, PH.end0, PH.fac - 0.125, 1.59, 0.12, { a: lime, b: lime, def: lime }, [{ a: 0.06, b: 1.43, y1: 2.70 }]);
    win(f, wpt(PH.fac - 0.125, PH.end0), wpt(PH.fac - 0.125, 1.59), 0.06, 1.43, 0, 2.70, { mull: 0 });
    F[f].base.geom(flatPoly(wrect(0.35, 1.84, PH.fac - 0.25, 9.29), LV.gf - SLAB - 0.004, [], true), M.ceiling);
    // stair from basement to ground
    stair(f, 8, 2, 5, LV.gf - LV.b1);
    // the store under the stair's last flight (CAD room 07): walls up into the treads, a door from the lobby
    {
      const h = (LV.gf - LV.b1) / (8 + 2 + 5 + 4 + 1), under = (k) => k * h - 0.30;
      const xw = SXW1 + 0.06, xe = (z) => wingLeftX(z) + 0.02, zN = SZW1 - 5 * 0.3 - 0.05;
      for (let i = 0; i < 5; i++) wall(f, [xw, SZW1 - i * 0.3], [xw, SZW1 - (i + 1) * 0.3], 0.10, pl, [], { y1: under(15 + i) });
      wall(f, [xw - 0.05, zN], [xe(zN), zN], 0.10, pl, [{ a: 0.22, b: 0.92, y1: 2.1 }], { y1: LV.gf - LV.b1 - SLAB });
      door(f, [xw - 0.05, zN], [xe(zN), zN], 0.22, 0.92, { side: 'a', leaf: M.doorWhite, casing: M.woodWhite, wallTh: 0.10 });
      wall(f, [xw - 0.05, SZW1 + 0.05], [xe(SZW1 + 0.05), SZW1 + 0.05], 0.10, pl, [], { y1: 2.0 });
    }
  }

  // ================================================================ GROUND FLOOR
  const sGF = (() => {
    const f = 'gf';
    // slabs
    slab(f, rect(LW.x0, LW.n0, LW.e0, LW.s0), [], M.marble);
    const st = { zA: 0.55 - 8 * 0.3, zC: 0.55 - 5 * 0.3 };
    slab(f, centreOutline(CN.z0), [coreHole(st.zA, st.zC)], M.marble);
    slab(f, [wpt(0, RX.g), wpt(5.65, RX.g), wpt(5.65, 6.08), wpt(5.15, 6.08), wpt(5.15, 12.056), wpt(0, 12.056)], [], M.marble, { under: M.limestoneSmooth });
    // left wing walls (west and east 0.28 / 0.25 m, the street and garden walls 0.45 m deep)
    const xw = (LW.x0 + LW.x1) / 2, xe = (LW.e1 + LW.e0) / 2, zn = (LW.n0 + LW.n1) / 2, zs = (LW.s0 + LW.s1) / 2;
    // the road-side face (captures R1-R3): one big stone frame round a render infill over both floors; downstairs two wide
    // windows under the balconies
    const WW = [[xw, LW.n0], [xw, LW.s0]];
    const wwin = [[2.40, 4.70], [8.16, 10.46]];
    roadFace(f, WW, LW.x1 - LW.x0, wwin.map(([a, b]) => ({ a, b, y0: 0.75, y1: 3.0 })));
    for (const [a, b] of wwin) win(f, ...WW, a, b, 0.75, 3.0, { mull: 1, off: -0.06 });
    // the street face (captures F3, FL1, R2): two tall slots toward the outer corner, glazed deep in the stone
    const NW = [[LW.x1, zn], [LW.e1, zn]];
    const nwin = SLOTS;
    wall(f, ...NW, LW.n1 - LW.n0, { a: pl, b: lime, def: lime }, nwin.map(([a, b]) => ({ a, b, y0: 0.3, y1: 2.95 })));
    for (const [a, b] of nwin) win(f, ...NW, a, b, 0.3, 2.95, { mull: 0, off: 0.12, glass: M.glassTint });
    // east wall of the salons, split by finish
    const T = LW.e0 - LW.e1;
    wall(f, [xe, LW.n0], [xe, CN.z0], T, { a: pl, b: lime, def: lime });
    wall(f, [xe, CN.z0], [xe, -2.0], T, { a: pl, b: pl, def: pl }, [{ a: 0.87, b: 2.77, y1: 2.75 }]);
    wall(f, [xe, -2.0], [xe, 3.05], T, { a: M.walnutSlats, b: pl, def: pl });
    wall(f, [xe, 3.05], [xe, LW.s0], T, { a: M.marbleBlack, b: lime, def: lime });
    // brass inlays on the black marble wall
    for (const z of [3.7, 4.5, 5.3]) F[f].wall.box(LW.e1 - 0.015, LV[f] + 0.0, z - 0.012, LW.e1, LV[f] + WH[f], z + 0.012, M.brass);
    const SW = [[LW.x1, zs], [LW.e1, zs]];
    // the garden face (captures B1, B3): one wide opening cut deep into the stone
    wall(f, ...SW, LW.s0 - LW.s1, { a: lime, b: pl, def: lime }, [{ a: 0.95, b: 3.85, y1: 2.7 }]);
    win(f, ...SW, 0.95, 3.85, 0, 2.7, { mull: 2, off: 0.12 });
    rail(F[f].rail, [[-5.85, 0, LW.s0 - 0.10], [-2.95, 0, LW.s0 - 0.10]], 1.0, false);
    // entrance wall: one wide walnut door in a deep stone wall with a heavy walnut frame
    const zE = (CN.z0 + CN.z1) / 2, EW = [[LW.e0, zE], [wingLeftX(zE) + 0.03, zE]];
    const EL = dist(...EW), ED = [EL / 2 - 0.83, EL / 2 + 0.83];   // 1.66 m clear (your measurement), centred in the porch
    wall(f, ...EW, CN.z1 - CN.z0, { a: pl, b: lime, def: lime }, [{ a: ED[0] - 0.14, b: ED[1] + 0.14, y1: 2.69 }]);
    door(f, ...EW, ED[0], ED[1], { side: 'a', hinge: 'start', h: 2.55, wallTh: CN.z1 - CN.z0, casingW: 0.14, casingTh: CN.z1 - CN.z0 + 0.06, leafTh: 0.07, pull: 1.25 });
    // walnut fins either side of the door, inside the hall
    for (let i = 0; i < 7; i++) { const x = -1.63 + i * 0.07; F[f].wall.box(x, LV[f], CN.z1 + 0.02, x + 0.035, LV[f] + 3.4, CN.z1 + 0.10, M.walnut); }
    for (let i = 0; i < 7; i++) { const x = 0.75 + i * 0.07; F[f].wall.box(x, LV[f], CN.z1 + 0.02, x + 0.035, LV[f] + 3.4, CN.z1 + 0.10, M.walnut); }
    // curtain wall closing the light well on the garden side
    curtain(f, LV.gf, LV.gf + WH.gf + SLAB);
    // void edge
    stair(f, 8, 3, 7, LV.ff - LV.gf);
    // ---- right wing (guest + kitchen), local u/v
    const wl = (u0, v0, u1, v1, th, mats, holes, o) => wall(f, wpt(u0, v0), wpt(u1, v1), th, mats, holes, o);
    wl(RX.w, RX.g, RX.w, 2.3, RX.wt, { a: pl, b: lime, def: lime }, [{ a: 1.45, b: 2.25, y0: 1.0, y1: 2.6 }]);
    win(f, wpt(RX.w, RX.g), wpt(RX.w, 2.3), 1.45, 2.25, 1.0, 2.6);
    // along the hall: the guest corridor opens off it, then the guest suite's door
    wl(RX.w, 2.3, RX.w, VC1, RX.wt, { a: pl, b: pl, def: pl }, [{ a: 4.6, b: 6.55, y1: 2.75 }, { a: 6.75, b: 7.55, y1: 2.4 }]);
    door(f, wpt(RX.w, 2.3), wpt(RX.w, VC1), 6.75, 7.55, { side: 'a', wallTh: RX.wt });
    // the guest bedroom's side onto the entrance porch: plain stone (captures F2, F4)
    wl(RX.w, VC1, RX.w, 12.056, RX.wt, { a: pl, b: lime, def: lime });
    // the kitchen's garden face (captures B2, B3, B8): glazing set back inside the wood frame, a deep loggia in front of it
    // on the cantilevered slab, its edge a black steel beam, frameless glass along it
    const BOT = [wpt(0.35, LOG), wpt(5.40, LOG)];
    wall(f, ...BOT, 0.20, { a: lime, b: pl, def: lime }, [{ a: 0.25, b: 4.80, y1: 2.75 }]);
    win(f, ...BOT, 0.25, 4.80, 0, 2.75, { mull: 3 });
    glassGuard(F[f].rail, [w3(0.36, RX.g + 0.08, LV.gf), w3(5.39, RX.g + 0.08, LV.gf)], 1.0, 1.25);
    F[f].base.seg(wpt(-0.02, RX.g - 0.07), wpt(5.67, RX.g - 0.07), LV.gf - SLAB - 0.03, LV.gf - 0.01, 0.16, M.steelBlack);
    // the driveway side at the kitchen (captures FL1, FL video, B8): wood cladding brought down to the slab, dark glass
    const KR = [wpt(RX.e, RX.g), wpt(RX.e, 6.16)];
    wall(f, ...KR, RX.et, { a: clad, b: pl, def: clad }, [{ a: 1.45, b: 5.42, y0: 1.0, y1: 2.6 }]);
    win(f, ...KR, 1.45, 5.42, 1.0, 2.6, { mull: 2, glass: M.glassDark });
    wl(4.90, 6.10, 5.65, 6.10, 0.12, { a: pl, b: lime, def: lime });   // flush with P1
    const GR = [wpt(5.025, 6.04), wpt(5.025, 12.056)];   // starts at the kitchen-side face of the step wall
    // (captures FL video 15-17 s: stone, two narrow vertical windows toward the street end)
    const GRW = [[4.20, 4.65], [5.10, 5.55]];
    wall(f, ...GR, 0.25, { a: lime, b: pl, def: lime }, GRW.map(([a, b]) => ({ a, b, y0: 0.9, y1: 2.5 })));
    for (const [a, b] of GRW) win(f, ...GR, a, b, 0.9, 2.5, { mull: 0, off: 0.06, glass: M.glassTint });
    // street face of the guest bedroom (captures F3, FL1, R2): three narrow vertical windows in the stone
    const TOP = [wpt(0.35, 11.955), wpt(4.90, 11.955)];
    const tw = [[0.885, 1.335], [2.055, 2.505], [3.395, 3.845]];
    wall(f, ...TOP, 0.20, { a: pl, b: lime, def: lime }, tw.map(([a, b]) => ({ a, b, y0: 0.9, y1: 2.5 })));
    for (const [a, b] of tw) win(f, ...TOP, a, b, 0.9, 2.5, { mull: 0, off: -0.06, glass: M.glassTint });
    // partitions
    const P1 = [wpt(0.35, 6.10), wpt(4.90, 6.10)];
    wall(f, ...P1, 0.12, pl, [{ a: 0.12, b: 1.02, y1: 2.4 }]);
    door(f, ...P1, 0.12, 1.02, { side: 'a' });
    const P2 = [wpt(1.68, 6.16), wpt(1.68, 9.34)];
    wall(f, ...P2, 0.16, pl, [{ a: 0.33, b: 1.13, y1: 2.4 }]);
    door(f, ...P2, 0.33, 1.13, { side: 'a' });
    wl(1.76, 7.65, 4.90, 7.65, 0.14, { a: M.marbleSlab, b: pl, def: pl });
    const P4 = [wpt(3.65, 6.16), wpt(3.65, 7.58)];
    wall(f, ...P4, 0.12, { a: M.marbleBlack, b: M.marbleBlack, def: M.marbleBlack }, [{ a: 0.48, b: 1.23, y1: 2.3 }]);
    door(f, ...P4, 0.48, 1.23, { side: 'a', leaf: M.doorWalnut });
    const P5 = [wpt(0.35, 9.40), wpt(4.90, 9.40)];
    wall(f, ...P5, 0.12, pl, [{ a: 0.12, b: 0.97, y1: 2.4 }, { a: 2.32, b: 3.12, y1: 2.4 }]);
    door(f, ...P5, 0.12, 0.97, { side: 'b' }); door(f, ...P5, 2.32, 3.12, { side: 'a' });
    // kitchen backsplash (white marble) behind the hob run, between worktop and wall cabinets
    wl(3.0, 6.03, 4.90, 6.03, 0.02, M.marbleSlab, [], { y0: 0.9, y1: 1.45 });
    return st;
  })();

  // ================================================================ FIRST FLOOR
  {
    const f = 'ff';
    slab(f, rect(LW.x0, LW.n0, LW.e0, LW.s0), [], null);
    finish(f, rect(LW.x1, LW.n1, LW.e1, -2.07), M.woodFloor);
    finish(f, rect(LW.x1, -2.07, -3.25, 1.03), M.marble);
    finish(f, rect(-3.25, -2.07, LW.e1, 1.03), M.woodFloor);
    finish(f, rect(LW.x1, 1.03, LW.e1, LW.s1), M.woodFloor);
    const st = { zA: 0.55 - 6 * 0.3, zC: 0.55 - 7 * 0.3 };
    slab(f, centreOutline(CN.z0), [coreHole(st.zA, st.zC)], M.marble);
    // right wing: over the ground floor, then the cantilevers (wood soffit) toward the street and the pool court
    slab(f, [wpt(0, RX.g), wpt(5.65, RX.g), wpt(5.65, 6.08), wpt(5.15, 6.08), wpt(5.15, 12.056), wpt(0, 12.056)], [], null, { edge: clad });
    slab(f, wrect(0, 12.056, 5.65, RX.f), [], null, { under: M.soffitWood, edge: clad });
    slab(f, wrect(5.15, 6.08, 5.65, 12.056), [], null, { under: M.soffitWood, edge: clad });
    finish(f, wrect(0.35, 0.33, 5.40, 5.24), M.woodFloor);
    finish(f, wrect(0.35, 5.24, 5.40, 8.785), M.marble);
    finish(f, wrect(0.35, 8.785, 5.40, BXV - 0.06), M.woodFloor);
    // the two balconies on the road side (captures R1-R3, RB1): shallow stone slabs with a low lip, frameless glass on them
    for (const [z0, z1] of [[-4.855, -1.754], [0.909, 4.011]]) {
      const xb = LW.x0 - 0.68;
      slab(f, rect(xb, z0, LW.x0, z1), [], M.limestoneSmooth, { t: 0.30, under: lime, edge: lime });
      F[f].base.box(xb, LV[f] - 0.02, z0, xb + 0.10, LV[f] + 0.12, z1, M.limestoneSmooth);
      for (const z of [z0, z1 - 0.10]) F[f].base.box(xb, LV[f] - 0.02, z, LW.x0, LV[f] + 0.12, z + 0.10, M.limestoneSmooth);
      glassGuard(F[f].rail, [[LW.x0 - 0.02, LV[f] + 0.12, z0 + 0.05], [xb + 0.05, LV[f] + 0.12, z0 + 0.05], [xb + 0.05, LV[f] + 0.12, z1 - 0.05], [LW.x0 - 0.02, LV[f] + 0.12, z1 - 0.05]], 0.93, 1.6);
    }
    // left wing walls
    const xw = (LW.x0 + LW.x1) / 2, xe = (LW.e1 + LW.e0) / 2, zn = (LW.n0 + LW.n1) / 2, zs = (LW.s0 + LW.s1) / 2;
    // the road-side face: the stone frame's top band over the render infill; two door-height openings onto the balconies
    const WW = [[xw, LW.n0], [xw, LW.s0]];
    const wdoor = [[2.80, 4.30], [8.56, 10.06]];
    roadFace(f, WW, LW.x1 - LW.x0, wdoor.map(([a, b]) => ({ a, b, y1: 2.70 })), 2.85);
    for (const [a, b] of wdoor) win(f, ...WW, a, b, 0, 2.70, { mull: 1, off: -0.06 });
    // the street face: the same two slots as downstairs, near the outer corner
    const NW = [[LW.x1, zn], [LW.e1, zn]];
    wall(f, ...NW, LW.n1 - LW.n0, { a: pl, b: lime, def: lime }, SLOTS.map(([a, b]) => ({ a, b, y1: 2.75 })));
    for (const [a, b] of SLOTS) win(f, ...NW, a, b, 0, 2.75, { mull: 0, off: 0.12, glass: M.glassTint });
    const T = LW.e0 - LW.e1;
    wall(f, [xe, LW.n0], [xe, CN.z0], T, { a: pl, b: lime, def: lime });
    wall(f, [xe, CN.z0], [xe, CS], T, { a: pl, b: pl, def: pl }, [{ a: 1.40, b: 2.25, y1: 2.4 }, { a: 2.72, b: 3.42, y1: 2.4 }]);
    door(f, [xe, CN.z0], [xe, CS], 1.40, 2.25, { side: 'a', wallTh: T });
    door(f, [xe, CN.z0], [xe, CS], 2.72, 3.42, { side: 'a', wallTh: T });
    // the office looks east into the gap between the wings
    wall(f, [xe, CS], [xe, LW.s0], T, { a: pl, b: lime, def: lime }, [{ a: 0.38, b: 1.68, y0: 0.9, y1: 2.6 }]);
    win(f, [xe, CS], [xe, LW.s0], 0.38, 1.68, 0.9, 2.6);
    const SW = [[LW.x1, zs], [LW.e1, zs]];
    // the garden face (captures B1, B3, RB1): one deep opening
    wall(f, ...SW, LW.s0 - LW.s1, { a: lime, b: pl, def: lime }, [{ a: 1.35, b: 3.45, y0: 0.40, y1: 2.60 }]);
    win(f, ...SW, 1.35, 3.45, 0.40, 2.60, { mull: 1, off: 0.12 });
    // partitions: bedroom 2 | baths | office, the corridor along the landing
    const P1 = [[LW.x1, -2.07], [LW.e1, -2.07]];
    wall(f, ...P1, 0.12, pl, [{ a: 0.30, b: 1.00, y1: 2.3 }]);
    door(f, ...P1, 0.30, 1.00, { side: 'a', leaf: M.doorWhite, casing: M.woodWhite });
    wall(f, [-5.05, -2.01], [-5.05, 0.97], 0.12, { a: M.marbleSlab, b: M.marbleSlab, def: pl });
    const P3 = [[-3.25, -2.01], [-3.25, 0.97]];
    wall(f, ...P3, 0.12, { a: M.marbleSlab, b: pl, def: pl }, [{ a: 1.70, b: 2.40, y1: 2.3 }]);
    door(f, ...P3, 1.70, 2.40, { side: 'a', leaf: M.doorWhite, casing: M.woodWhite });
    const P4 = [[LW.x1, 1.03], [LW.e1, 1.03]];
    wall(f, ...P4, 0.12, pl, [{ a: 3.57, b: 4.42, y1: 2.4 }]);
    door(f, ...P4, 3.57, 4.42, { side: 'a', leaf: M.doorWhite, casing: M.woodWhite });
    // landing north wall (captures F2, F3): a tall opening with a dark-wood centre panel between two glass slits
    const zE = (CN.z0 + CN.z1) / 2, LN = [[LW.e0, zE], [wingLeftX(zE) + 0.03, zE]];
    coreWindow(f, LN, 0.25, 2.85);
    curtain(f, LV.ff, LV.ff + WH.ff + SLAB);
    stair(f, 6, 3, 7, LV.at - LV.ff);
    rail(F[f].rail, [[SXW0, LV[f], SZW0], [SXW1, LV[f], SZW0]], 1.0, false);
    // right wing walls (brown wood cladding outside)
    const wl = (u0, v0, u1, v1, th, mats, holes, o) => wall(f, wpt(u0, v0), wpt(u1, v1), th, mats, holes, o);
    // bedroom 3 (the children's room in the photos) has striped wallpaper
    const strp = M.stripes;
    wl(RX.w, RX.g, RX.w, 3.3, RX.wt, { a: strp, b: clad, def: clad }, [{ a: 1.45, b: 2.65, y0: 0.9, y1: 2.6 }]);
    win(f, wpt(RX.w, RX.g), wpt(RX.w, 3.3), 1.45, 2.65, 0.9, 2.6);
    wl(RX.w, 3.3, RX.w, 5.24, RX.wt, { a: strp, b: pl, def: pl });
    wl(RX.w, 5.24, RX.w, VC1, RX.wt, { a: pl, b: pl, def: pl }, [{ a: 1.72, b: 2.47, y1: 2.4 }]);
    // the wood box's porch side (captures F2, F video 12 s): solid cladding
    wl(RX.w, VC1, RX.w, BXV, RX.wt, { a: pl, b: clad, def: clad });
    // bedroom 3's garden face (captures B2, B3, B8): glazing set back inside the wood frame, the loggia in front of it
    // behind a clad parapet with frameless glass on it
    const BOT = [wpt(0.35, LOG), wpt(5.40, LOG)];
    wall(f, ...BOT, 0.20, { a: lime, b: strp, def: lime }, [{ a: 0.25, b: 4.80, y1: 2.60 }]);
    win(f, ...BOT, 0.25, 4.80, 0, 2.60, { mull: 3 });
    F[f].wall.seg(wpt(0.35, RX.g + 0.11), wpt(5.40, RX.g + 0.11), LV.ff, LV.ff + 0.45, 0.22, clad);
    glassGuard(F[f].rail, [w3(0.38, RX.g + 0.11, LV.ff + 0.45), w3(5.37, RX.g + 0.11, LV.ff + 0.45)], 0.55, 1.25);
    // the driveway side (captures L2, FL1, B8): wood cladding all along, no windows
    const RW1 = [wpt(RX.e, RX.g), wpt(RX.e, 5.24)], RW2 = [wpt(RX.e, 5.24), wpt(RX.e, BXV)];
    wall(f, ...RW1, RX.et, { a: clad, b: strp, def: clad });
    wall(f, ...RW2, RX.et, { a: clad, b: pl, def: clad });
    // bedroom 4's loggia (captures F3, FL1, L2): one big opening framed by the box's cladding, deep, open above a solid
    // parapet with frameless glass on it; sliding glass at its back; the box closed on the porch side
    const UL = BXL, UR = 5.65 - BXR;
    F[f].wall.seg(wpt(UL / 2, BXV), wpt(UL / 2, RX.f), LV.ff, LV.at - 0.02, UL, clad);
    F[f].wall.seg(wpt((UR + 5.65) / 2, BXV), wpt((UR + 5.65) / 2, RX.f), LV.ff, LV.at - 0.02, BXR, clad);
    const LG = [wpt(UL, BXV), wpt(UR, BXV)];
    wall(f, ...LG, 0.12, { a: pl, b: clad, def: clad }, [{ a: 0.05, b: UR - UL - 0.05, y1: BXC }]);
    win(f, ...LG, 0.05, UR - UL - 0.05, 0, BXC, { mull: 3, th: 0.1 });
    finish(f, wrect(UL, BXV + 0.06, UR, RX.f - 0.22), M.tileWood);
    F[f].wall.seg(wpt(UL, RX.f - 0.11), wpt(UR, RX.f - 0.11), LV.ff, LV.ff + BXP, 0.22, clad);
    glassGuard(F[f].rail, [w3(UL + 0.03, RX.f - 0.11, LV.ff + BXP), w3(UR - 0.03, RX.f - 0.11, LV.ff + BXP)], 0.45, 1.20);
    // partitions: bedroom 3 | bath 4, bath 3 | bedroom 4, with the corridor from the landing
    const Q1 = [wpt(0.35, 5.32), wpt(5.40, 5.32)];
    wall(f, ...Q1, 0.16, { a: strp, b: M.fluted, def: pl }, [{ a: 0.12, b: 0.97, y1: 2.4 }]);
    door(f, ...Q1, 0.12, 0.97, { side: 'a', leaf: M.doorWhite, casing: M.woodWhite });
    const Q2 = [wpt(1.52, 5.40), wpt(1.52, 8.635)];
    wall(f, ...Q2, 0.14, { a: M.marbleSlab, b: M.fluted, def: pl }, [{ a: 1.58, b: 2.38, y1: 2.3 }]);
    door(f, ...Q2, 1.58, 2.38, { side: 'a', leaf: M.doorWhite, casing: M.woodWhite });
    const Q3 = [wpt(0.35, 8.71), wpt(5.40, 8.71)];
    wall(f, ...Q3, 0.15, { a: M.fluted, b: pl, def: pl }, [{ a: 0.12, b: 0.97, y1: 2.4 }, { a: 3.72, b: 4.47, y1: 2.3 }]);
    door(f, ...Q3, 0.12, 0.97, { side: 'b', leaf: M.doorWhite, casing: M.woodWhite });
    door(f, ...Q3, 3.72, 4.47, { side: 'a', leaf: M.doorWhite, casing: M.woodWhite });
    wl(3.52, 5.40, 3.52, 8.635, 0.12, { a: M.marbleSlab, b: M.marbleSlab, def: pl });
  }

  // ================================================================ ATTIC
  // Both wings' attics sit under hipped tile roofs behind stone knee walls (captures L2, R3, RB1-RB4); the stair core rises
  // above them, flat-topped. The stone wing's attic opens at the back onto its roof terrace through the stone door box of
  // photo 8, and toward the curved road through a stone gable dormer; the guest wing's attic runs the wing's full length.
  {
    const f = 'at';
    const st = { zA: null, zC: 0.55 - 7 * 0.3 };
    slab(f, centreOutline(CN.z0), [coreHole(st.zA, st.zC)], M.marble);
    const render = M.render, CORE_H = ROOF_Y + 0.34 - LV.at;
    // helpers in a roof's frame: walls, knee heights under the tiles, the ceiling inside, low partitions raked under it,
    // raking walls under a free (no core) edge, the core's wall rising past the tiles
    const frame = (R) => {
      const pt = (u, v) => R.F(u, v), p3 = (u, v, y) => { const q = R.F(u, v); return [q[0], y, q[1]]; };
      const wl = (u0, v0, u1, v1, th, mats, holes, o) => wall(f, pt(u0, v0), pt(u1, v1), th, mats, holes, o);
      const knee = (u, v) => roofY(R, u, v) - 0.012;          // just under the tiles, on a wall's outer face
      const ceil = (u, v) => roofY(R, u, v) - R.co;           // the ceiling inside
      const inner = (u0, v0, u1, v1, th, mats) => {           // partitions up to 2.10, raked down where the ceiling comes lower
        const L = Math.hypot(u1 - u0, v1 - v0), n = Math.max(1, Math.ceil(L / 0.125)), nu = -(v1 - v0) / L * th / 2, nv = (u1 - u0) / L * th / 2;
        const at = (t) => [u0 + (u1 - u0) * t, v0 + (v1 - v0) * t];
        const tops = Array.from({ length: n + 1 }, (_, i) => { const [u, v] = at(i / n); return Math.min(2.10, ceil(u + nu, v + nv) - 0.02, ceil(u - nu, v - nv) - 0.02); });
        const ymin = Math.min(...tops), mo = mats && !mats.isMaterial ? mats : { a: mats, b: mats, top: mats, e0: mats, e1: mats };
        wl(u0, v0, u1, v1, th, mats, [], { y1: ymin });
        for (let i = 0; i < n; i++) {
          if (Math.max(tops[i], tops[i + 1]) < ymin + 0.002) continue;
          rakeWall(F[f].wall, pt(...at(i / n)), pt(...at((i + 1) / n)), th, LV.at + ymin, LV.at + tops[i], LV.at + tops[i + 1], mo);
        }
      };
      // breakpoints of the roof's height along the core-side edge between va and vb
      const brk = (va, vb) => [va, vb, R.v0 + (R.top - R.y0) / R.k, R.v1 - (R.top - R.y0) / R.k].filter((v) => v >= va - 1e-9 && v <= vb + 1e-9).sort((a, b) => a - b);
      // a wall along the core-side line u from va to vb whose top follows the tiles (outer face b; the a face is inside)
      const rakeAlong = (u, va, vb, th, mats, holes = []) => {
        const ks = brk(va, vb), ymin = Math.min(...ks.map((v) => knee(R.uw, v)));
        wl(u, va, u, vb, th, { def: mats.b, ...mats }, holes, { y1: ymin });
        const mo = { a: mats.a, b: mats.b, top: mats.top || mats.b, e0: mats.b, e1: mats.b };
        for (let i = 0; i < ks.length - 1; i++) {
          const y0 = knee(R.uw, ks[i]), y1 = knee(R.uw, ks[i + 1]);
          if (Math.max(y0, y1) < ymin + 0.002) continue;
          rakeWall(F[f].wall, pt(u, ks[i]), pt(u, ks[i + 1]), th, LV.at + ymin, LV.at + y0, LV.at + y1, mo);
        }
      };
      // along the core: the wall up to the core's parapet, its room-side face in the open above the tiles in stone (or render)
      const coreAlong = (u, va, vb, th, outer, holes = []) => {
        wl(u, va, u, vb, th, { a: pl, b: pl, def: outer, top: M.limestoneSmooth }, holes, { y1: CORE_H });
        const uf = u + th / 2 + 0.005, ks = brk(va, vb);
        for (let i = 0; i < ks.length - 1; i++) vtrap(F[f].wall, outer, pt(uf, ks[i]), pt(uf, ks[i + 1]), LV.at + roofY(R, uf, ks[i]) - 0.01, LV.at + roofY(R, uf, ks[i + 1]) - 0.01, LV.at + CORE_H, LV.at + CORE_H);
      };
      return { pt, p3, wl, knee, ceil, inner, rakeAlong, coreAlong };
    };

    // ---- the stone wing (frame SF: u from its east face out to the road, v from its street face to the garden)
    {
      const R = ROOF.stone, { pt, wl, knee, rakeAlong, coreAlong } = frame(R);
      const UO = LW.e0 - LW.x0, VE = 2.65 - LW.n0;            // its west face; the attic's garden end = the terrace's start
      slab(f, rect(LW.x0, LW.n0, LW.e0, 2.65), [], M.woodFloor, { edge: lime });
      slab(f, rect(LW.x0, 2.65, LW.e0, LW.s0), [], M.tileWood, { under: M.ceiling, edge: lime });
      const tw = LW.x1 - LW.x0, kO = knee(UO, 4.0);
      // knee walls: the street face, the road face either side of the dormer, the garden wall either side of the door box
      wl(UO - tw, 0.225, 0.25, 0.225, 0.45, { a: pl, b: lime, def: lime }, [], { y1: knee(2.0, 0) });
      const D = R.dormer;
      wl(UO - tw / 2, 0, UO - tw / 2, D.v0, tw, { a: lime, b: pl, def: lime }, [], { y1: kO });
      wl(UO - tw / 2, D.v1, UO - tw / 2, VE, tw, { a: lime, b: pl, def: lime }, [], { y1: kO });
      const B = R.box, kB = knee(2.0, VT + 0.075);
      wl(UO - tw, VT, B.u1, VT, 0.15, { a: lime, b: pl, def: lime }, [], { y1: kB });
      wl(B.u0, VT, 0.25, VT, 0.15, { a: lime, b: pl, def: lime }, [], { y1: kB });
      // the east wall: raking under the street slope in front of the core; along the core up to its parapet (the landing's
      // door into the bedroom), stone where it stands over the tiles and beside the terrace
      const T = LW.e0 - LW.e1, uE = T / 2, vC0 = CN.z0 - LW.n0, vC1 = CS - LW.n0;
      rakeAlong(uE, 0, vC0, T, { a: pl, b: lime });
      coreAlong(uE, vC0, VE, T, lime, [{ a: 2.05, b: 3.42, y1: 2.4 }]);
      wl(uE, VE, uE, vC1, T, { a: lime, b: pl, def: lime, top: M.limestoneSmooth }, [], { y1: CORE_H });
      // the door box (photo 8): stone jambs and head round the champagne-framed glazed door; its top and cheeks are in the roof
      const pbv = (VT - 0.075 + B.face) / 2, pbt = B.face - VT + 0.075, pbm = { a: pl, b: lime, def: lime, top: lime };
      wl(B.u0, pbv, B.door[0], pbv, pbt, pbm, [], { y1: B.top - 0.10 });
      wl(B.door[1], pbv, B.u1, pbv, pbt, pbm, [], { y1: B.top - 0.10 });
      wl(B.door[0], pbv, B.door[1], pbv, pbt, pbm, [], { y0: B.dh, y1: B.top - 0.10 });
      win(f, pt(B.u0, B.face - 0.125), pt(B.u1, B.face - 0.125), B.door[0] - B.u0, B.door[1] - B.u0, 0, B.dh, { mull: 0, frame: M.champagne, fw: 0.07, th: 0.07 });
      { const [x, z] = pt(B.door[1] - 0.12, B.face - 0.06); F[f].wall.box(x - 0.06, LV.at + 1.03, z - 0.012, x + 0.05, LV.at + 1.055, z + 0.012, M.champagne); }
      finish(f, [pt(B.door[0], VT - 0.075), pt(B.door[1], VT - 0.075), pt(B.door[1], B.face), pt(B.door[0], B.face)], M.marble);
      // the gable dormer toward the road (captures R3, RB1-RB3): a stone pentagon frame in the knee wall's plane, glazed
      {
        const uo = UO, uf = UO - D.fr, vm = (D.v0 + D.v1) / 2, ys = D.spring + D.fr, ya = D.apex;
        const hwI = (D.v1 - D.v0) / 2 - D.fr, ai = D.spring + hwI * (ya - ys) / ((D.v1 - D.v0) / 2);
        const prism = (poly) => {                                   // a convex (v, y) polygon extruded across the frame, uf..uo
          const P = (u, [v, y]) => { const q = pt(u, v); return [q[0], LV.at + y, q[1]]; };
          const n = poly.length, fo = poly.map((p) => P(uo, p)), bk = poly.map((p) => P(uf, p));
          const nrm = (a, b, c) => { const u = b.map((x, i) => x - a[i]), w = c.map((x, i) => x - a[i]); const r = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...r) || 1; return r.map((x) => x / l); };
          const out = (() => { const q = pt(1, 0), o = pt(0, 0), x = q[0] - o[0], z = q[1] - o[1], l = Math.hypot(x, z); return [x / l, 0, z / l]; })();
          const tri = (a, b, c, want) => { let N = nrm(a, b, c); if (N[0] * want[0] + N[1] * want[1] + N[2] * want[2] < 0) { [b, c] = [c, b]; N = N.map((x) => -x); } F[f].wall.tri(lime, a, b, c, N, [0, 1, 0], [1, 0, 0]); };
          for (let i = 1; i < n - 1; i++) { tri(fo[0], fo[i], fo[i + 1], out); tri(bk[0], bk[i], bk[i + 1], out.map((x) => -x)); }
          const cx = poly.reduce((s, p) => s + p[0], 0) / n, cy = poly.reduce((s, p) => s + p[1], 0) / n, cc = P((uo + uf) / 2, [cx, cy]);
          for (let i = 0; i < n; i++) {
            const a = fo[i], b = fo[(i + 1) % n], c = bk[(i + 1) % n], d = bk[i], m = a.map((x, k) => (x + b[k] + c[k] + d[k]) / 4 - cc[k]);
            tri(a, b, c, m); tri(a, c, d, m);
          }
        };
        prism([[D.v0, 0], [D.v0 + D.fr, 0], [D.v0 + D.fr, D.spring], [D.v0, ys]]);
        prism([[D.v1 - D.fr, 0], [D.v1, 0], [D.v1, ys], [D.v1 - D.fr, D.spring]]);
        prism([[D.v0, ys], [D.v0 + D.fr, D.spring], [vm, ai], [vm, ya]]);
        prism([[vm, ya], [vm, ai], [D.v1 - D.fr, D.spring], [D.v1, ys]]);
        // the glass in the opening, and frameless glass across its lower part
        const g = (v, y) => { const q = pt(uf + 0.10, v); return [q[0], LV.at + y, q[1]]; };
        vquad(F[f].glass, M.glass, g(D.v0 + D.fr, 0.02), g(D.v1 - D.fr, 0.02), D.spring - 0.02);
        F[f].glass.tri(M.glass, g(D.v0 + D.fr, D.spring), g(D.v1 - D.fr, D.spring), g(vm, ai), [1, 0, 0], [0, 0, 1], [0, 1, 0]);
        for (const v of [D.v0 + D.fr, D.v1 - D.fr]) F[f].wall.seg(pt(uf + 0.06, v), pt(uf + 0.14, v), LV.at, LV.at + D.spring, 0.05, M.bronze);
        F[f].wall.seg(pt(uf + 0.10, D.v0 + D.fr), pt(uf + 0.10, D.v1 - D.fr), LV.at + D.spring - 0.025, LV.at + D.spring + 0.025, 0.08, M.bronze);
        // its cheeks, from the knee wall up to its eaves, back to where the eaves meet the slope
        const ue = R.u1 - (ys - R.y0) / R.k;
        for (const [v, a, b] of [[D.v0, ue, uo], [D.v1, uo, ue]]) vtrap(F[f].wall, lime, pt(a, v), pt(b, v), LV.at + roofY(R, a, v) - 0.01, LV.at + roofY(R, b, v) - 0.01, LV.at + ys, LV.at + ys);
        for (const [v, a, b] of [[D.v0 + 0.01, uo, ue], [D.v1 - 0.01, ue, uo]]) vtrap(F[f].wall, pl, pt(a, v), pt(b, v), LV.at + roofY(R, a, v) - 0.02, LV.at + roofY(R, b, v) - 0.02, LV.at + ys - 0.02, LV.at + ys - 0.02);
      }
      // the roof terrace (photo 8): a low cream curb with frameless glass standing on it, round its three open sides
      const curbW = (p0, p1) => wall(f, p0, p1, 0.22, { def: lime, top: M.limestoneSmooth }, [], { y1: 0.15 });
      const zt0 = 2.65, gy = LV.at + 0.15;
      curbW([LW.x0 + 0.11, zt0], [LW.x0 + 0.11, LW.s0 - 0.22]); curbW([LW.x0, LW.s0 - 0.11], [LW.e0, LW.s0 - 0.11]); curbW([LW.e0 - 0.11, LW.s0 - 0.22], [LW.e0 - 0.11, CS + 0.15]);
      glassGuard(F[f].rail, [[LW.x0 + 0.06, gy, zt0 + 0.02], [LW.x0 + 0.06, gy, LW.s0 - 0.06], [LW.e0 - 0.06, gy, LW.s0 - 0.06], [LW.e0 - 0.06, gy, CS + 0.12]], 1.0, 1.65);
      F[f].base.seg([-4.8, 5.2], [-4.68, 5.2], LV[f] + 0.0, LV[f] + 0.006, 0.12, M.steelBlack);   // a floor drain
    }
    // landing north wall (captures F2, F3): the same window as on the first floor
    const zE = (CN.z0 + CN.z1) / 2, LN = [[LW.e0, zE], [wingLeftX(zE) + 0.03, zE]];
    coreWindow(f, LN, 0.25, 2.60);
    curtain(f, LV.at, LV.at + WH.at + SLAB);
    // railings around the stair opening at the top floor
    rail(F[f].rail, [[SX0, LV[f], SZW1], [SXW0, LV[f], SZW1], [SXW0, LV[f], SZW0], [SXW1, LV[f], SZW0], [SXW1, LV[f], st.zC]], 1.0, false);

    // ---- the guest wing: the suite and, toward the street, its dressing room (the CAD's and the brochure's), knee walls all round
    {
      const R = ROOF.wood, { wl, knee, ceil, inner, rakeAlong, coreAlong } = frame(R);
      slab(f, wrect(0, RX.g, 5.65, RX.f), [], null, { edge: clad });
      const SI = { u0: RX.w + RX.wt / 2, u1: RX.e - RX.et / 2, v0: RX.g + 0.25, v1: VS - 0.125 };   // the inner faces
      finish(f, wrect(SI.u0, SI.v0, SI.u1, VN - 0.06), M.marble);
      finish(f, wrect(SI.u0, VN + 0.06, SI.u1, SI.v1), M.woodFloor);
      finish(f, wrect(0, VS + 0.125, 5.65, RX.f), M.roofDeck);              // the wood box's top in front of the street knee wall
      // west: a low wall past the core's garden end (its window onto the light well), raking up under the garden slope; along
      // the core up to its parapet (the landing's door into the suite), render over the tiles; in front of the core, raking
      // down under the street slope, stone outside
      rakeAlong(RX.w, RX.g, VC0, RX.wt, { a: pl, b: lime }, [{ a: 0.80, b: 1.85, y0: 0.40, y1: 1.20 }]);
      win(f, W(RX.w, RX.g), W(RX.w, VC0), 0.80, 1.85, 0.40, 1.20);
      coreAlong(RX.w, VC0, VC1, RX.wt, render, [{ a: 6.95 - VC0, b: 7.85 - VC0, y1: 2.05 }]);
      rakeAlong(RX.w, VC1, VS + 0.125, RX.wt, { a: pl, b: lime });
      // east, garden and street: plain knee walls, out on the slab's edges
      const eTop = knee(RX.e + RX.et / 2, 4.0);
      wl(RX.e, RX.g, RX.e, VS + 0.125, RX.et, { a: lime, b: pl, def: lime }, [], { y1: eTop });
      wl(SI.u0, RX.g + 0.125, SI.u1, RX.g + 0.125, 0.25, { a: lime, b: pl, def: lime }, [], { y1: knee(2.5, RX.g) });
      wl(SI.u0, VS, SI.u1, VS, 0.25, { a: pl, b: lime, def: lime }, [], { y1: knee(2.5, VS + 0.125) });
      // the bathroom's wet block: walk-in shower and WC behind marble walls
      inner(2.02, 4.34, SI.u1, 4.34, 0.10, M.marbleSlab);
      inner(2.02, 5.64, 3.57, 5.64, 0.10, M.marbleSlab); inner(4.32, 5.64, SI.u1, 5.64, 0.10, M.marbleSlab);
      wl(3.57, 5.64, 4.32, 5.64, 0.10, M.marbleSlab, [], { y0: 1.85, y1: Math.min(2.10, ceil(4.32, 5.69)) - 0.02 });
      door(f, wpt(2.02, 5.64), wpt(SI.u1, 5.64), 1.55, 2.30, { side: 'b', leaf: M.doorWhite, casing: M.woodWhite, h: 1.85 });
      inner(3.245, 4.39, 3.245, 5.59, 0.10, M.marbleSlab);
      vquad(F[f].glass, M.glass, w3(2.03, 4.40, LV.at + 0.02), w3(2.03, 5.00, LV.at + 0.02), 2.05);
      // the dressing room behind a low partition, an open doorway in it
      inner(SI.u0, VN, 2.05, VN, 0.12, pl); inner(2.95, VN, SI.u1, VN, 0.12, pl);
    }
  }

  // ================================================================ WOOD BOX (guest wing first floor, over the front strip)
  {
    const fb = F.ff.base, fw = F.ff.wall, y0 = BOX_BOT, vF = RX.f;
    const bx = (acc, u0, u1, v0, v1, ya, yb, m) => acc.seg(wpt((u0 + u1) / 2, v0), wpt((u0 + u1) / 2, v1), ya, yb, u1 - u0, m);
    bx(fb, 0, 5.65, 12.056, vF, y0, y0 + 0.06, M.soffitWood);                     // soffit
    bx(fb, 0, 5.65, vF - 0.11, vF, y0, LV.ff, clad);                                // bottom band, front (the parapet stands on it)
    bx(fb, 0, 0.03, 12.056, vF - 0.11, y0, LV.ff, clad);                            // bottom band, sides
    bx(fb, 5.62, 5.65, 12.056, vF - 0.11, y0, LV.ff, clad);
    bx(fw, BXL, 5.65 - BXR, BXV + 0.06, vF, LV.ff + BXC, LV.ff + WH.ff, { def: clad, bot: M.soffitWood });   // the loggia's ceiling
    for (const u of [1.70, 3.95]) downlight(fw, ...wpt(u, (BXV + RX.f) / 2), LV.ff + BXC);
    bx(fw, 0, 5.65, vF - 0.11, vF, LV.ff + BXC, LV.at - 0.02, clad);              // top band, front
    for (const u of [1.0, 2.8, 4.6]) downlight(fb, ...wpt(u, 12.85), y0);
  }

  function downlight(acc, x, z, y) {
    lamps.push([x, y - 0.08, z]);
    acc.box(x - 0.065, y - 0.075, z - 0.065, x + 0.065, y, z + 0.065, M.downlight);
    acc.geom(new THREE.CylinderGeometry(0.034, 0.034, 0.004, 16).translate(x, y - 0.077, z), M.led);
  }

  // ================================================================ THE CORE'S GARDEN FACE (captures B2, B3, B9)
  // a full-height slot between the wings: stone edges, two narrow glass strips and a dark-wood fin between them
  function curtain(f, y0, y1) {
    const z = CS, x0 = -1.75, x1 = wingLeftX(z) + 0.02;
    const e = 0.45, s = 0.60, xa = x0 + e, xb = xa + s, xd = x1 - e, xc = xd - s;
    const acc = F[f].wall;
    acc.box(x0, y0, z - 0.12, xa, y1, z + 0.12, { def: lime });
    acc.box(xd, y0, z - 0.12, x1, y1, z + 0.12, { def: lime });
    acc.box(xb, y0, z - 0.05, xc, y1, z + 0.11, { def: clad });
    for (const [a, b] of [[xa, xb], [xc, xd]]) {
      for (const x of [a + 0.02, b - 0.02]) acc.box(x - 0.025, y0, z - 0.04, x + 0.025, y1, z + 0.04, M.bronze);
      vquad(F[f].glass, M.glass, [a, y0, z], [b, y0, z], y1 - y0);
    }
    F[f].cut.box(x0, y0, z - 0.12, x1, Math.min(y1, y0 + CUT_H), z + 0.12, { def: M.bronze, py: M.poche });
  }
  curtain('b1', LV.b1, LV.b1 + WH.b1 + 0.4);

  // ================================================================ ROOFS
  {
    const A = S.roof, eave = LV.at + WH.at, top = eave + SLAB;
    // both wings: terracotta hip roofs behind the knee walls (captures L2, R3, RB1-RB4)
    tiledRoof(A, ROOF.stone);
    tiledRoof(A, ROOF.wood);
    // the satellite dish on the stone wing's door box (photo 8)
    {
      const R = ROOF.stone, B = R.box, yb = LV.at + B.top + 0.04, [dx, dz] = R.F((B.u0 + B.u1) / 2 + 0.25, B.face - 0.45);
      A.box(dx - 0.03, yb, dz - 0.03, dx + 0.03, yb + 0.42, dz + 0.03, M.steelBlack);
      // the dish's hollow faces up and out over the terrace
      const aim = new THREE.Vector3(-0.45, 0.4, 0.8).normalize();
      const dish = new THREE.SphereGeometry(0.56, 24, 8, 0, Math.PI * 2, 0, 0.62);
      dish.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim.clone().negate()));
      dish.translate(dx + aim.x * 0.28, yb + 0.60 + aim.y * 0.28, dz + aim.z * 0.28);
      A.geom(dish, dishMat);
      const arm = new THREE.CylinderGeometry(0.01, 0.01, 0.36, 6), c0 = [dx + aim.x * 0.28, yb + 0.60 + aim.y * 0.28, dz + aim.z * 0.28];
      arm.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim));
      arm.translate(c0[0] + aim.x * 0.10, c0[1] + aim.y * 0.10 - 0.06, c0[2] + aim.z * 0.10);
      A.geom(arm, M.stainless);
      A.geom(new THREE.BoxGeometry(0.05, 0.05, 0.07).translate(c0[0] + aim.x * 0.28, c0[1] + aim.y * 0.28 - 0.06, c0[2] + aim.z * 0.28), M.whiteGloss);
    }
    // the stair core: the villa's highest roof, flat behind a stone parapet, its skylight over the stair (captures F3, R3, RB1)
    const core = [[LW.e1, CN.z0], [wingLeftX(CN.z0) + RX.w + RX.wt / 2, CN.z0], [wingLeftX(CS + 0.08) + RX.w + RX.wt / 2, CS + 0.08], [LW.e1, CS + 0.08]];
    const sk = rect(-1.6, 1.85, wingLeftX(3.05) - 0.12, 3.05);
    A.geom(extrudePoly(core, eave, top, [sk]), [M.ceiling, lime]);
    A.geom(flatPoly(core, top + 0.004, [sk]), M.roofDeck);
    ring(A, core, top, top + 0.34, 0.22, { def: lime, top: M.limestoneSmooth });
    S.roofGlass.geom(flatPoly(sk, top - 0.05), M.glass);
    ring(A, sk.slice().reverse(), top, top + 0.22, 0.12, { def: M.cream, top: M.limestoneSmooth }, true);
    // solar panels on a tall black frame and the water heater, up on the core (photo 8 shows them on the highest roof)
    for (let i = 0; i < 3; i++) {
      const x0 = -1.80 + i * 1.04, z0 = -4.10, geo = new THREE.BoxGeometry(0.98, 0.045, 1.7);
      geo.rotateX(-0.36); geo.translate(x0 + 0.49, top + 1.62, z0 + 0.85);
      A.geom(geo, [M.steelBlack, M.steelBlack, M.solar, M.steelBlack, M.steelBlack, M.steelBlack]);
    }
    for (const x of [-1.77, -0.26, 1.25]) {
      A.box(x - 0.03, top, -4.0 - 0.03, x + 0.03, top + 1.92, -4.0 + 0.03, M.steelBlack);
      A.box(x - 0.03, top, -2.55 - 0.03, x + 0.03, top + 1.38, -2.55 + 0.03, M.steelBlack);
      A.box(x - 0.025, top + 1.3, -4.0, x + 0.025, top + 1.36, -2.55, M.steelBlack);
    }
    A.box(-1.80, top + 1.86, -4.03, 1.30, top + 1.92, -3.97, M.steelBlack);
    A.geom(new THREE.CylinderGeometry(0.29, 0.29, 1.65, 24).rotateZ(Math.PI / 2).translate(-0.35, top + 0.62, -1.40), M.whiteGloss);
    for (const x of [-0.90, 0.20]) A.box(x - 0.03, top, -1.55, x + 0.03, top + 0.4, -1.25, M.steelBlack);
  }

  // closed ring of walls along a polygon, set inside it (or outside with out = true)
  function ring(acc, pts, y0, y1, th, mats, out = false) {
    let area = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const sgn = (area > 0 ? 1 : -1) * (out ? -1 : 1);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      acc.seg(p, q, y0, y1, th, mats, sgn * th / 2);
    }
  }

  // a wing's tiled roof (R, see ROOF): the slopes on the v1, outer and v0 sides round a flat top, dying into the stair core's
  // wall on the core side, a terracotta verge where that side is free; cut round the stone door box (whose top and cheeks it
  // builds), round the gable dormer (whose roof and cheeks it builds) and round a skylight; a ceiling under it all
  function tiledRoof(A, R) {
    const { F: Fr, y0, k, top, v0, u1, v1, uw, co, cu } = R, d = (top - y0) / k;
    const ue = u1 - d, vg = v0 + d, vs = v1 - d;           // the flat top's outer, v0 and v1 edges
    const P = (u, v, y) => { const q = Fr(u, v); return [q[0], LV.at + y, q[1]]; };
    const fp = (u, v) => Fr(u, v);
    const dirF = (du, dv) => { const q = Fr(du, dv), o = Fr(0, 0), x = q[0] - o[0], z = q[1] - o[1], L = Math.hypot(x, z); return [x / L, 0, z / L]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const free = (v) => R.free.some(([a, b]) => v >= a - 1e-6 && v <= b + 1e-6);
    const faces = [
      { pts: [[uw, v1], [u1, v1], [ue, vs], [uw, vs]], h: (u, v) => y0 + k * (v1 - v), ut: [-1, 0], mat: M.roofTile },
      { pts: [[u1, v1], [u1, v0], [ue, vg], [ue, vs]], h: (u) => y0 + k * (u1 - u), ut: [0, 1], mat: M.roofTile },
      { pts: [[u1, v0], [uw, v0], [uw, vg], [ue, vg]], h: (u, v) => y0 + k * (v - v0), ut: [1, 0], mat: M.roofTile },
      { pts: [[uw, vg], [ue, vg], [ue, vs], [uw, vs]], h: () => top, ut: [1, 0], mat: M.roofDeck },
    ];
    // a convex outline clipped to one side of u (ax 0) or v (ax 1) = val; and an outline minus a [u0, u1, v0, v1] rectangle
    const half = (poly, ax, val, keepGreater) => {
      const out = [], inside = (p) => (keepGreater ? p[ax] >= val - 1e-9 : p[ax] <= val + 1e-9);
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        if (inside(p)) out.push(p);
        if (inside(p) !== inside(q)) { const t = (val - p[ax]) / (q[ax] - p[ax]); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
      }
      return out;
    };
    const area = (q) => { let a = 0; for (let i = 0; i < q.length; i++) { const p = q[i], r = q[(i + 1) % q.length]; a += p[0] * r[1] - r[0] * p[1]; } return Math.abs(a) / 2; };
    const cutRect = (poly, [a0, a1, b0, b1]) => {
      const mid = half(half(poly, 0, a0, true), 0, a1, false);
      return [half(poly, 0, a0, false), half(poly, 0, a1, true), half(mid, 1, b0, false), half(mid, 1, b1, true)].filter((q) => q.length >= 3 && area(q) > 1e-6);
    };
    const cutAll = (poly, holes) => holes.reduce((ps, h) => ps.flatMap((p) => cutRect(p, h)), [poly]);
    const emit = (fc, poly, dy, down, mat) => {
      const ut = dirF(...fc.ut), pts = poly.map(([u, v]) => P(u, v, fc.h(u, v) + dy));
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[0]; let b = pts[i], c = pts[i + 1];
        let n = cross(b.map((x, j) => x - a[j]), c.map((x, j) => x - a[j]));
        const L = Math.hypot(...n); if (L < 1e-9) continue;
        if ((n[1] > 0) === down) { [b, c] = [c, b]; n = n.map((x) => -x); }
        n = n.map((x) => x / L);
        A.tri(mat, a, b, c, n, ut, cross(n, ut));
      }
    };
    const B = R.box, D = R.dormer, SKY = R.sky, holes = [], choles = [];
    let bb, bi, vci;
    if (B) {
      bb = boxBack(R); bi = B.top - 0.10; vci = v1 - (bi + co - y0) / k;     // its back in the slope, its ceiling inside, where the room's ceiling meets it
      holes.push([B.u0, B.u1, bb, 1e9]); choles.push([B.u0 + 0.20, B.u1 - 0.20, vci, 1e9]);
    }
    let ys, ude, udr, vm;
    if (D) {
      ys = D.spring + D.fr; vm = (D.v0 + D.v1) / 2;
      ude = u1 - (ys - y0) / k;                               // where the dormer's eaves meet the slope
      udr = u1 - (D.apex - y0) / k;                           // where its ridge does
      holes.push([ude, 1e9, D.v0, D.v1]); choles.push([ude, 1e9, D.v0 + 0.02, D.v1 - 0.02]);
    }
    if (SKY) { holes.push([SKY.u0, SKY.u1, SKY.v0, SKY.v1]); choles.push([SKY.u0, SKY.u1, SKY.v0, SKY.v1]); }
    for (const fc of faces) {
      for (const pc of cutAll(fc.pts, holes)) emit(fc, pc, 0, false, fc.mat);
      for (const pc of cutAll(fc.pts, choles)) emit(fc, pc, -co, true, M.ceiling);
    }
    // eaves: the tiles' ends in a terracotta band
    const tc = M.tileCap;
    const nose = (ua, va, ub, vb, off) => A.seg(fp(ua, va), fp(ub, vb), LV.at + y0 - 0.07, LV.at + y0 + 0.02, 0.05, tc, off);
    const c1 = free(v1) ? uw : cu, c0 = free(v0) ? uw : cu;
    if (B) { nose(c1, v1, B.u0, v1, 0.025); nose(B.u1, v1, u1, v1, 0.025); } else nose(c1, v1, u1, v1, 0.025);
    if (D) { nose(u1, v0, u1, D.v0, -0.025); nose(u1, D.v1, u1, v1, -0.025); } else nose(u1, v0, u1, v1, -0.025);
    nose(c0, v0, u1, v0, -0.025);
    // verges where the core side is free: a terracotta band following the slopes
    for (const [va, vb] of R.free) {
      const ks = [va, vb, vg, vs].filter((v) => v >= va - 1e-9 && v <= vb + 1e-9).sort((a, b) => a - b);
      for (let i = 0; i < ks.length - 1; i++) {
        const ha = roofY(R, uw, ks[i]), hb = roofY(R, uw, ks[i + 1]);
        vtrap(A, tc, fp(uw, ks[i + 1]), fp(uw, ks[i]), LV.at + hb - 0.07, LV.at + ha - 0.07, LV.at + hb + 0.02, LV.at + ha + 0.02);
      }
    }
    // hips and the flat top's edges: rows of half-round cap tiles, each lapping the one below
    const capRow = (a, b) => {
      const pa = P(a[0], a[1], a[2] + 0.025), pb = P(b[0], b[1], b[2] + 0.025);
      const Dv = new THREE.Vector3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]), L = Dv.length(), n = Math.max(1, Math.round(L / 0.40));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Dv.clone().normalize());
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, g = new THREE.CylinderGeometry(0.062, 0.08, L / n + 0.03, 10);
        g.applyQuaternion(q); g.translate(pa[0] + Dv.x * t, pa[1] + Dv.y * t, pa[2] + Dv.z * t);
        A.geom(g, tc);
      }
    };
    capRow([u1, v1, y0], [ue, vs, top]); capRow([u1, v0, y0], [ue, vg, top]);
    capRow([free(vs) ? uw : cu, vs, top], [ue, vs, top]); capRow([ue, vs, top], [ue, vg, top]); capRow([ue, vg, top], [free(vg) ? uw : cu, vg, top]);
    const cream = M.cream, ry = (u, v) => LV.at + roofY(R, u, v) - 0.01, cy = (u, v) => LV.at + roofY(R, u, v) - co;
    // the door box: its top under a thin coping, and its cheeks down to the tiles (outside) and to the ceiling (inside)
    if (B) {
      const um = (B.u0 + B.u1) / 2, vw = R.vw;
      A.seg(fp(um, bb), fp(um, B.face), LV.at + bi, LV.at + B.top, B.u1 - B.u0, { def: lime, bot: M.ceiling });
      A.seg(fp(um, bb - 0.03), fp(um, B.face + 0.03), LV.at + B.top, LV.at + B.top + 0.04, B.u1 - B.u0 + 0.06, M.limestoneSmooth);
      vtrap(A, lime, fp(B.u0, vw), fp(B.u0, bb), ry(B.u0, vw), ry(B.u0, bb), LV.at + bi, LV.at + bi);
      vtrap(A, lime, fp(B.u1, bb), fp(B.u1, vw), ry(B.u1, bb), ry(B.u1, vw), LV.at + bi, LV.at + bi);
      const i0 = B.u0 + 0.20, i1 = B.u1 - 0.20;
      vtrap(A, M.plaster, fp(i0, vci), fp(i0, vw), cy(i0, vci), cy(i0, vw), LV.at + bi, LV.at + bi);
      vtrap(A, M.plaster, fp(i1, vw), fp(i1, vci), cy(i1, vw), cy(i1, vci), LV.at + bi, LV.at + bi);
    }
    // the dormer's own little roof: two tile planes from its gable back to the valleys where they meet the main slope
    if (D) {
      const uo = u1 + 0.02, va = D.v0 - 0.06, vb = D.v1 + 0.06, hw = (D.v1 - D.v0) / 2 + 0.06, ya = D.apex + 0.02, yse = ys + 0.02 - 0.06 * (D.apex - ys) / ((D.v1 - D.v0) / 2);
      const hd = (v) => yse + (ya - yse) * (1 - Math.abs(v - vm) / hw);
      for (const side of [[va, vm], [vb, vm]]) {
        const [ve] = side, u_ve = u1 - (hd(ve) - y0) / k;
        const quad = [P(uo, ve, hd(ve)), P(uo, vm, ya), P(udr, vm, ya), P(u_ve, ve, hd(ve))];
        const ut = dirF(1, 0);
        for (const [dy, down, mat] of [[0, false, M.roofTile], [-co, true, M.ceiling]]) {
          const q = quad.map((p) => [p[0], p[1] + dy, p[2]]);
          for (const [a, b0, c0] of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
            let b = b0, c = c0, n = cross(b.map((x, j) => x - a[j]), c.map((x, j) => x - a[j]));
            const L = Math.hypot(...n); if (L < 1e-9) continue;
            if ((n[1] > 0) === down) { [b, c] = [c, b]; n = n.map((x) => -x); }
            n = n.map((x) => x / L);
            A.tri(mat, a, b, c, n, ut, cross(n, ut));
          }
        }
      }
      capRow([u1 + 0.02, vm, D.apex], [udr, vm, D.apex]);
    }
    // the skylight: a flush glass pane in a black frame
    if (SKY) {
      const fc = faces.find((f) => f.mat === M.roofTile && f.ut[1] === 1), g = [[SKY.u0, SKY.v0], [SKY.u1, SKY.v0], [SKY.u1, SKY.v1], [SKY.u0, SKY.v1]].map(([u, v]) => P(u, v, fc.h(u, v) + 0.03));
      S.roofGlass.quad(M.glass, g[0], g[1], g[2], g[3], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
      for (let i = 0; i < 4; i++) { const p = g[i], q = g[(i + 1) % 4]; A.seg([p[0], p[2]], [q[0], q[2]], Math.min(p[1], q[1]) - 0.03, Math.max(p[1], q[1]) + 0.05, 0.06, M.steelBlack); }
    }
  }

  // ================================================================ SITE
  // From the captures of the villa as built (Oct 2026) and your measurements: the street almost level with the house, a
  // low wall with a railing and planters along it, the 2.45 m gate 5.5 m in front of the door; the driveway at street level
  // along the guest wing with the indoor pool hall under it; the curved road falling along the stone wing; the back yard a
  // storey down at basement level.
  {
    const SW = S.walk, SB = S.base;
    // ground blocks (their faces double as retaining walls)
    const groundBlock = (pts, top, bottom, topMat, side = M.stoneWall, holes = []) => SW.geom(extrudePoly(pts, bottom, top, holes), [topMat, side]);
    const P = (u, v) => W(u, v);
    // the point at world depth z on the wing line u = const
    const Wz = (u, z) => W(u, (WING.oz - u * Math.sin(WING.phi) - z) / Math.cos(WING.phi));
    const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    // ---- the lines of the street front
    const ZB = CN.z0 - 5.5;                              // inner face of the street boundary: the gate 5.5 m from the door
    const DX = (LW.e0 + wingLeftX((CN.z0 + CN.z1) / 2) + 0.03) / 2;   // the door's axis
    const GX0 = DX - 1.225, GX1 = DX + 1.225, PIER = 0.60; // the 2.45 m gate between its piers (capture F4: 0.6 m wide)
    const ZP = ZB + 2.05;                                // the porch landing's step
    const LX0 = -1.95, LX1 = 1.40;                       // the landing's width in front of the porch
    const XD0 = Wz(PH.fac, ZB)[0], XD1 = Wz(UC, ZB)[0];  // the driveway's edges at the boundary
    const VG0 = XD0 + 0.15, VG1 = XD1 - 0.08;            // the vehicle gate's posts
    const xP = wingLeftX(-6.90) + 0.12;                  // east edge of the porch
    const ZR = ZB - 9.0;                                 // far kerb of the street
    const ZT = -3.524;                                   // top tread of the garden stair on the road side
    // the curved road side (CAD A101): the boundary wall's inner line where it curves with the garden stair
    const CW = [[-9.12, ZT], [-9.08, -3.27], [-8.90, -1.80], [-8.73, -0.34], [-8.63, 1.40], [-8.59, 3.21], [-8.64, 5.0], [-8.76, 6.75], [-8.98, 8.50], [-9.25, 10.26]];
    const cx = (z) => {
      for (let i = 0; i < CW.length - 1; i++) {
        const [xa, za] = CW[i], [xb, zb] = CW[i + 1];
        if (z <= zb || i === CW.length - 2) return xa + (xb - xa) * Math.max(0, Math.min(1, (z - za) / (zb - za)));
      }
      return CW[0][0];
    };
    const curve = (z0, z1) => [[cx(z0), z0], ...CW.filter(([, z]) => z > z0 + 0.01 && z < z1 - 0.01), [cx(z1), z1]];
    // outside the wall: its road face; the road's inner edge (straight past the side passage, then easing onto the curve,
    // the planters filling the gap); the road 6.4 m wide; its level, the street's in front, falling toward the back
    const ZJ = ZT + 0.2;                                 // where the wall turns in onto the curve
    const wallOut = (z) => (z <= ZJ ? XW - 0.20 : cx(z) - 0.25);
    const xIn = (z) => (z <= ZJ ? XW - 0.80 : XW - 0.80 + (cx(z) - 0.85 - XW + 0.80) * sm((z - ZJ) / 6.0));
    const xOut = (z) => xIn(z) - 6.4;
    const hR = (z) => (z <= ZB + 1.0 ? ST : z <= 10.4 ? ST + (GL - 0.25 - ST) * (z - ZB - 1.0) / (10.4 - ZB - 1.0) : GL - 0.25 - 0.06 * (z - 10.4));

    // ---- the street: light concrete up to the boundary, a pavement on the far side
    SW.box(-30, ST - 0.2, ZR, 30, ST, ZB, { py: M.roadConcrete, def: M.concrete });
    SW.box(-30, ST - 0.2, ZR - 1.6, 30, ST + 0.1, ZR, { py: M.pavers, def: M.limestoneSmooth });
    // ---- the path (capture F4): a threshold slab inside the gate, three long slabs in a gravel bed, one step up to the
    //      landing in front of the porch
    SW.box(GX0, ST - 0.1, ZB - 0.22, GX1, FC, ZB + 0.45, M.limestoneSmooth);
    groundBlock(rect(GX0, ZB + 0.45, GX1, ZP), FC - 0.03, ST - 0.1, M.gravel, M.limestoneSmooth);
    for (const z0 of [ZB + 0.57, ZB + 1.07, ZB + 1.57]) SW.box(GX0 + 0.35, FC - 0.06, z0, GX1 - 0.35, FC, z0 + 0.38, M.limestoneSmooth);
    groundBlock([[LX0, ZP], [LX1, ZP], [LX1, -6.90], [LW.e0, -6.90], [LW.e0, LW.n0], [LX0, LW.n0]], LV.gf, ST - 0.1, M.pavers, M.limestoneSmooth);
    // the entrance porch (basket-weave paving on the CAD plan) up to the door wall
    groundBlock(rect(LW.e0, -6.90, xP, CN.z0), LV.gf, ST - 0.1, M.pavers, M.limestoneSmooth);
    // ---- the front strips, one riser up: in front of the stone wing (and round its road side as the side passage) and in
    //      front of the guest wing up to the driveway; raised pebble beds behind the wall and along the house
    groundBlock([[XW, ZB], [GX0, ZB], [GX0, ZP], [LX0, ZP], [LX0, LW.n0], [LW.x0, LW.n0], [LW.x0, ZT], [XW, ZT]], FC, ST - 0.1, M.pavers, M.limestone);
    const g0 = P(0, 12.056);
    groundBlock([[GX1, ZB], [XD0, ZB], P(PH.fac, 12.056), g0, [xP, g0[1]], [xP, -6.90], [LX1, -6.90], [LX1, ZP], [GX1, ZP]], FC, ST - 0.1, M.pavers, M.limestone);
    const bed = (pts) => groundBlock(pts, FC + 0.30, FC - 0.02, M.pebbles, M.limestoneSmooth);
    bed(rect(XW + 0.02, ZB + 0.01, GX0, ZB + 0.75));
    bed(rect(GX1, ZB + 0.01, XD0 - 0.20, ZB + 0.75));
    bed(rect(-6.95, -7.55, -2.10, -6.86));
    bed([P(0.45, 12.12), P(4.95, 12.12), P(4.95, 12.80), P(0.45, 12.80)]);
    // ---- soil under the ground floor's front edge
    groundBlock(rect(LW.x0, LW.n0, W(0, 11.0)[0] - 0.1, LB.n0), ST, GL, M.soil);

    // ---- the street boundary (captures F1, F3, F4, FL1): a low stone wall with a black railing, planters at its foot on
    //      the street side; stone gate piers with dark-wood strips; the vehicle gate under an overhead steel beam
    const wallTop = ST + 0.60;
    const railTop = (x0, x1, y0, z = ZB - 0.11) => {
      for (const h of [0.30, 0.56]) SB.box(x0, y0 + h, z - 0.018, x1, y0 + h + 0.035, z + 0.018, M.steelBlack);
      SB.box(x0, y0 + 0.82, z - 0.035, x1, y0 + 0.86, z + 0.035, M.steelBlack);
      const n = Math.max(1, Math.round((x1 - x0) / 1.6));
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; SB.box(x - 0.022, y0, z - 0.022, x + 0.022, y0 + 0.86, z + 0.022, M.steelBlack); }
    };
    const frontWall = (x0, x1) => {
      SB.box(x0, ST - 0.1, ZB - 0.22, x1, wallTop, ZB, { def: M.limestone, py: M.limestoneSmooth });
      railTop(x0 + 0.05, x1 - 0.05, wallTop);
      SB.box(x0, ST - 0.1, ZB - 0.80, x1, ST + 0.38, ZB - 0.22, M.limestoneSmooth);
      SW.geom(flatPoly(rect(x0 + 0.06, ZB - 0.74, x1 - 0.06, ZB - 0.28), ST + 0.385), M.pebbles);
    };
    frontWall(XW - 0.20, GX0 - PIER);
    frontWall(GX1 + PIER, VG0 - 0.08);
    // (capture F4: the piers stand 2.3 m over the path, a 22 cm dark-wood strip down their street faces)
    const pier = (x0, x1, z0, z1, top) => {
      SB.box(x0, ST - 0.1, z0, x1, top, z1, M.limestone);
      SB.box(x0 - 0.03, top, z0 - 0.03, x1 + 0.03, top + 0.06, z1 + 0.03, M.limestoneSmooth);
      const xc = (x0 + x1) / 2;
      SB.box(xc - 0.11, FC, z0 - 0.012, xc + 0.11, top - 0.17, z0, M.woodStrip);
    };
    pier(GX0 - PIER, GX0, ZB - 0.25, ZB + 0.20, FC + 2.25); pier(GX1, GX1 + PIER, ZB - 0.25, ZB + 0.20, FC + 2.25);
    // a gate's steel leaf (capture F4): a laser-cut ornamental panel over open bars, parked swung in along the path's side
    const leaf = (hx, hz, dir, Lf, yb, yt) => {
      const Q = (s) => [hx + dir[0] * s, hz + dir[1] * s], fr = (s0, s1, ya, yb2, th = 0.05) => SB.seg(Q(s0), Q(s1), ya, yb2, th, M.steelBlack);
      fr(0, 0.05, yb, yt); fr(Lf - 0.05, Lf, yb, yt); fr(0, Lf, yb, yb + 0.05); fr(0, Lf, yt - 0.05, yt);
      const ym = yb + (yt - yb) * 0.55;
      fr(0, Lf, ym - 0.025, ym + 0.025);
      for (const t of [0.2, 0.4, 0.6, 0.8]) fr(0.05, Lf - 0.05, yb + (ym - yb) * t, yb + (ym - yb) * t + 0.03, 0.035);
      const nrm = [-dir[1], dir[0]];
      for (const k of [1, -1]) {
        const a = Q(0.05), b = Q(Lf - 0.05);
        const A3 = [a[0] + nrm[0] * 0.012 * k, ym + 0.025, a[1] + nrm[1] * 0.012 * k], B3 = [b[0] + nrm[0] * 0.012 * k, ym + 0.025, b[1] + nrm[1] * 0.012 * k];
        vquad(SB, M.ornament, k > 0 ? A3 : B3, k > 0 ? B3 : A3, yt - 0.05 - ym - 0.025);
      }
    };
    const LEAF = (GX1 - GX0) / 2 - 0.03;
    leaf(GX0 + 0.05, ZB - 0.08, [0, 1], LEAF, FC + 0.03, FC + 2.05);
    leaf(GX1 - 0.05, ZB - 0.08, [0, 1], LEAF, FC + 0.03, FC + 2.05);
    // the vehicle gate (captures FL1, L1): dark-brown square posts, a beam across their tops, two wide leaves parked open
    for (const x of [VG0, VG1]) SB.box(x - 0.11, ST - 0.1, ZB - 0.22, x + 0.11, ST + 3.05, ZB, M.woodStrip);
    SB.box(VG0 - 0.11, ST + 2.87, ZB - 0.21, VG1 + 0.11, ST + 3.05, ZB - 0.01, M.woodStrip);
    const VL = (VG1 - VG0) / 2 - 0.12;
    leaf(VG0 + 0.12, ZB - 0.11, [0, 1], VL, ST + 0.05, ST + 2.30);
    leaf(VG1 - 0.12, ZB - 0.11, [0, 1], VL, ST + 0.05, ST + 2.30);

    // ---- the driveway (captures FL1, FL video, L1, B8): stamped concrete at street level along the guest wing, from the
    //      vehicle gate to the back, where a curb and a railing stand over the pool hall's glass; over the basement it is a
    //      slab
    // (the slab over the pool hall belongs with the ground floor, so the basement view shows the hall open)
    F.gf.walk.geom(extrudePoly([P(PH.fac, 12.305), P(UC, 12.305), P(UC, RX.g), P(5.65, RX.g), P(5.65, 6.08), P(PH.fac, 6.08)], ST - 0.30, ST), [M.stamped, M.concrete]);
    groundBlock([[XD0, ZB], [XD1, ZB], P(UC, 12.305), P(PH.fac, 12.305)], ST, GL, M.stamped, M.limestone);
    {
      const a = P(5.66, RX.g + 0.10), b = P(UC - 0.02, RX.g + 0.10), GB = F.gf.base;
      GB.seg(a, b, ST, ST + 0.12, 0.20, M.limestoneSmooth);
      for (const h of [0.45, 0.72]) GB.seg(a, b, ST + h, ST + h + 0.035, 0.035, M.steelBlack);
      GB.seg(a, b, ST + 1.00, ST + 1.04, 0.07, M.steelBlack);
      for (let i = 0; i <= 3; i++) { const q = P(5.70 + (UC - 5.76) * i / 3, RX.g + 0.10); GB.box(q[0] - 0.022, ST + 0.12, q[1] - 0.022, q[0] + 0.022, ST + 1.0, q[1] + 0.022, M.steelBlack); }
    }
    // the neighbour's side: a stone wall a metre over the driveway with a railing on it; under the driveway it is the pool
    // hall's split-face stone wall
    {
      const um = (UC + UE) / 2, a = P(um, RX.g), b = Wz(um, ZB - 0.22), m = P(um, 12.305);
      SB.seg(a, m, GL, ST - 0.30, UE - UC, M.stoneWall);
      SB.seg(a, b, ST - 0.30, ST + 1.0, UE - UC, { def: M.limestone, top: M.limestoneSmooth });
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      for (const h of [1.30, 1.56]) SB.seg(a, b, ST + h, ST + h + 0.035, 0.035, M.steelBlack);
      SB.seg(a, b, ST + 1.82, ST + 1.86, 0.07, M.steelBlack);
      for (let s = 0; s <= L; s += 1.6) SB.box(a[0] + d[0] * s - 0.022, ST + 1.0, a[1] + d[1] * s - 0.022, a[0] + d[0] * s + 0.022, ST + 1.86, a[1] + d[1] * s + 0.022, M.steelBlack);
    }

    // ---- the indoor pool hall under the driveway (your basement plan): the pool 3.1 x 7 m in the back-right corner against
    //      the east wall, from the garden end; the jacuzzi inside its street-end east corner, raised and spilling into it; a
    //      cream deck along the dining room's glass; glass to the yard at the garden end; downlights in the driveway's soffit
    const basin = [P(PH.w0, PH.v0), P(PH.w1, PH.v0), P(PH.w1, PH.v1), P(PH.w0, PH.v1)];
    {
      const C = PH, gy = GL, lim = M.limestoneSmooth, U0 = PH.fac - 0.12;
      const dk = (u0, v0, u1, v1, h, m, acc = SW, y0 = gy) => acc.geom(extrudePoly(wrect(u0, v0, u1, v1), y0, gy + h), [m, m]);
      // the deck and the copings round the water (lipped 3 cm over it)
      SW.geom(flatPoly([P(U0, C.end0 + 0.07), P(UC, C.end0 + 0.07), P(UC, C.end1), P(U0, C.end1)], gy + 0.004, [basin]), M.limestoneSmooth);
      dk(C.w0 - 0.30, C.v0 - 0.30, C.w0 + 0.03, C.v1 + 0.30, 0.05, lim);
      dk(C.w0 + 0.03, C.v0 - 0.30, UC, C.v0 + 0.03, 0.05, lim);
      dk(C.w0 + 0.03, C.v1 - 0.03, UC, C.v1 + 0.30, 0.05, lim);
      dk(C.w1 - 0.03, C.v0 + 0.03, UC, C.v1 - 0.03, 0.05, lim);
      // the basin: light mosaic, a darker band at the waterline, a sun shelf at the garden end for two loungers
      for (let i = 0; i < 4; i++) {
        const a = basin[i], b = basin[(i + 1) % 4];
        vquad(SB, M.poolTile, [b[0], gy - 1.45, b[1]], [a[0], gy - 1.45, a[1]], 1.23);
        vquad(SB, M.poolBand, [b[0], gy - 0.22, b[1]], [a[0], gy - 0.22, a[1]], 0.22);
      }
      SB.geom(flatPoly(basin, gy - 1.45), M.poolTile);
      SB.geom(extrudePoly(wrect(C.w0, C.v0, C.w0 + 1.30, C.v0 + 2.10), gy - 1.45, gy - 0.20), [M.poolTile, M.poolTile]);
      // the jacuzzi: dark glass mosaic in and out under a black stone rim, its water spilling over its garden side
      const J = C.jac, spaO = wrect(C.w1 - J, C.v1 - J, C.w1, C.v1), spaI = wrect(C.w1 - J + 0.12, C.v1 - J + 0.12, C.w1 - 0.12, C.v1 - 0.12);
      SB.geom(extrudePoly(spaO, gy - 1.45, gy + 0.45, [spaI]), [M.marbleBlack, M.spaMosaic]);
      SB.geom(flatPoly(spaI, gy - 0.40), M.spaMosaic);
      S.water.geom(flatPoly(spaI, gy + 0.40), M.water);
      S.water.geom(flatPoly(basin, gy - 0.12, [spaO]), M.water);
      {
        const a = P(C.w1 - J + 0.14, C.v1 - J - 0.01), b = P(C.w1 - 0.14, C.v1 - J - 0.01), c = Math.cos(WING.phi), s = Math.sin(WING.phi);
        S.water.quad(M.waterSheetThin, [b[0], gy + 0.41, b[1]], [a[0], gy + 0.41, a[1]], [a[0], gy - 0.12, a[1]], [b[0], gy - 0.12, b[1]], [s, 0, c], [c, 0, -s], [0, 1, 0]);
      }
      // a stainless ladder over the near coping, halfway along
      for (const v of [3.70, 4.20]) {
        const pts = [[-0.40, 0.05], [-0.40, 0.78], [-0.32, 0.93], [-0.12, 0.95], [0.02, 0.80], [0.06, 0.05], [0.08, -0.95]].map(([u, y]) => new THREE.Vector3(...w3(C.w0 + u, v, gy + y)));
        steelTube(SB, pts, 0.022);
      }
      for (const y of [-0.30, -0.60, -0.90]) SB.seg(P(C.w0 + 0.13, 3.70), P(C.w0 + 0.13, 4.20), gy + y, gy + y + 0.03, 0.18, M.stainless);
      // the garden glazing: sliding glass under the driveway's edge (and the kitchen slab's, where a lintel closes it)
      const GA = P(U0, C.end0), GB = P(UC, C.end0), GLn = dist(GA, GB), yTop = ST - 0.30 - LV.b1;
      wall('b1', GA, GB, 0.15, { a: lime, b: lime, def: lime }, [{ a: 0.10, b: GLn - 0.10, y1: yTop - 0.04 }], { y0: GL - LV.b1, y1: yTop });
      win('b1', GA, GB, 0.10, GLn - 0.10, GL - LV.b1, yTop - 0.04, { mull: 3 });
      SB.seg(GA, P(5.65, C.end0), ST - 0.30, LV.gf - SLAB, 0.15, lime);
      // the soffit: the driveway slab's underside, downlights in it
      SB.geom(flatPoly([P(5.65, C.end0), P(UC, C.end0), P(UC, C.end1), P(C.fac, C.end1), P(C.fac, 6.08), P(5.65, 6.08)], ST - 0.302, [], true), M.ceiling);
      for (const u of [6.05, 8.50]) for (const v of [1.4, 3.6, 5.8, 8.2]) { const q = P(u, v); downlight(F.gf.base, q[0], q[1], ST - 0.30); }
    }

    // ---- the side passage and the garden stair down the road side (captures R2, R3; brochure: the external stair)
    // the garden stair: 8 treads, a landing, 8 treads (18 risers of 0.18 m), from the house wall to the curved wall
    const SR = (FC - GL) / 18;
    const tread = (z) => {   // the stair's level at z (FC before it, GL after it)
      if (z < ZT) return FC;
      const k = z < ZT + 2.4 ? Math.floor((z - ZT) / 0.3) + 1 : z < ZT + 3.8 ? 9 : Math.floor((z - ZT - 3.8) / 0.3) + 10;
      return FC - Math.min(18, k) * SR;
    };
    const step = (z0, z1, top) => groundBlock([[LW.x0, z0], ...curve(z0, z1), [LW.x0, z1]], top, GL - 0.02, M.limestoneSmooth, M.limestoneSmooth);
    for (let k = 1; k <= 8; k++) step(ZT + (k - 1) * 0.3, ZT + k * 0.3, FC - k * SR);
    step(ZT + 2.4, ZT + 3.8, FC - 9 * SR);
    for (let k = 10; k <= 17; k++) step(ZT + 3.8 + (k - 10) * 0.3, ZT + 3.8 + (k - 9) * 0.3, FC - k * SR);
    // the boundary wall along the curved road (captures R1-R3): cream stone blocks to the road, stepping down with it a good
    // 1.4 m over it, and never less than a guard over the passage, the stair's treads or the yard
    {
      const road = M.limestone, inner = M.limestoneSmooth;
      for (const [z0, z1, g] of [[ZB - 0.22, -6.95, 1.20], [-6.95, ZT, 0.95]]) SB.box(XW - 0.20, GL, z0, XW, Math.max(hR(z1) + 1.40, FC + g), z1, { nx: road, def: inner });
      SB.box(XW - 0.20, GL, ZT, CW[0][0] - 0.125, FC + 0.95, ZJ, { def: road, px: inner });
      const piece = (z0, z1) => {
        const top = Math.max(tread((z0 + z1) / 2) + 1.0, hR(z1) + 1.40, GL + 1.8);
        SB.seg([cx(z0), z0], [cx(z1), z1], GL, top, 0.25, { a: road, def: inner }, 0.125);
      };
      const zs = [ZJ, ZT + 6.2, 10.26];
      for (let z = ZT + 0.3; z < ZT + 6.2 - 0.01; z += 0.3) if (z > ZJ + 0.01) zs.push(z);
      for (const [, z] of CW) if (z > ZT + 6.25 && z < 10.25) zs.push(z);
      zs.sort((p, q) => p - q);
      for (let i = 0; i < zs.length - 1; i++) if (zs[i + 1] - zs[i] > 0.02) piece(zs[i], zs[i + 1]);
    }
    // ---- outside it, along the curved road: stepped stone planters with pebbles at the wall's foot, stone piers with a
    //      dark-wood strip, black lamp posts
    {
      const zs = [ZB, ZJ, 10.45];
      for (let z = ZB + 1.5; z < 10.45 - 0.3; z += 1.5) if (Math.abs(z - ZJ) > 0.3) zs.push(z);
      zs.sort((p, q) => p - q);
      for (let i = 0; i < zs.length - 1; i++) {
        const z0 = zs[i] + 0.004, z1 = zs[i + 1] - 0.004, past = z0 > ZJ;
        const wo = (z) => (past ? wallOut(z) : XW - 0.20);
        const yb = hR(z1) - 0.1, yt = hR((z0 + z1) / 2) + 0.42;
        groundBlock([[xIn(z0), z0], [wo(z0), z0], [wo(z1), z1], [xIn(z1), z1]], yt, yb, M.pebbles, M.limestoneSmooth);
      }
      for (const z of [ZB + 0.15, -6.95, ZJ - 0.10, 0.8, 4.6, 8.3]) {
        const onPassage = z <= ZJ, x1 = onPassage ? XW : cx(z), x0 = (onPassage ? XW - 0.20 : cx(z) - 0.25) - 0.18, yt = hR(z) + 2.30;
        SB.box(x0, Math.min(hR(z), tread(z)) - 0.1, z - 0.24, x1, yt, z + 0.24, M.limestone);
        SB.box(x0 - 0.04, yt, z - 0.28, x1 + 0.04, yt + 0.07, z + 0.28, M.limestoneSmooth);
        SB.box(x0 - 0.012, hR(z) + 0.55, z - 0.08, x0, yt - 0.20, z + 0.08, M.woodStrip);
      }
      for (const z of [-8.6, -1.2, 6.5]) {
        const x = xIn(z) + 0.22, y = hR(z) + 0.42;
        SB.geom(new THREE.CylinderGeometry(0.045, 0.06, 3.2, 12).translate(x, y + 1.6, z), M.steelBlack);
        SB.seg([x, z], [x - 0.42, z], y + 3.05, y + 3.10, 0.05, M.steelBlack);
        SB.geom(new THREE.CylinderGeometry(0.11, 0.17, 0.30, 16).translate(x - 0.42, y + 2.88, z), M.steelBlack);
        SB.geom(new THREE.SphereGeometry(0.12, 16, 10).translate(x - 0.42, y + 2.74, z), M.ledCool);
        lamps.push([x - 0.42, y + 2.72, z]);
      }
    }

    // ---- the back yard (CAD A101): terrace paving to the planting strip, planting beds, boundary walls
    // inner faces of the east and south boundaries as drawn on A101 (the south one a shallow arc)
    const EB = [[12.32, 4.62], [12.75, 9.37], [12.73, 10.25]];
    const SBi = [[-9.25, 10.26], [-8.0, 10.33], [-6.75, 10.39], [-5.5, 10.44], [-4.26, 10.49], [-3.01, 10.52], [-1.76, 10.55], [-0.51, 10.57],
      [0.74, 10.58], [1.99, 10.58], [3.24, 10.57], [4.49, 10.56], [5.74, 10.53], [6.99, 10.5], [8.24, 10.46], [9.48, 10.41], [10.73, 10.35], [11.73, 10.30], [12.73, 10.25]];
    groundBlock([[cx(ZT), -7.72], [Wz(UC, -7.72)[0], -7.72], P(UC, RX.g), EB[0], EB[1], [12.743, 9.70], ...curve(ZT, 9.70).reverse()], GL, GL - 0.4, M.pavers, M.stoneWall, [basin]);
    groundBlock([...curve(9.70, 10.26), ...SBi.slice(1), [12.743, 9.70]], GL + 0.30, GL - 0.02, M.soil, M.limestone);
    // south boundary: a low stone wall with a black steel railing, open to the land falling away below
    {
      const cl = SBi.map((p, i) => {
        const a = SBi[Math.max(0, i - 1)], b = SBi[Math.min(SBi.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return [p[0] - (b[1] - a[1]) / L * 0.1, p[1] + (b[0] - a[0]) / L * 0.1];
      });
      for (let i = 0; i < cl.length - 1; i++) {
        const p = cl[i], q = cl[i + 1];
        SB.seg(p, q, GL, GL + 0.9, 0.2, { def: M.limestone, top: M.limestoneSmooth });
        for (const [h, t] of [[1.22, 0.035], [1.48, 0.035], [1.71, 0.05]]) SB.seg(p, q, GL + h, GL + h + t, t, M.steelBlack);
      }
      for (let i = 0; i < cl.length; i += 1) SB.box(cl[i][0] - 0.025, GL + 0.9, cl[i][1] - 0.025, cl[i][0] + 0.025, GL + 1.76, cl[i][1] + 0.025, M.steelBlack);
    }
    // east boundary: retains the neighbour's ground where it is still high beside the driveway's end, then 1.8 m
    {
      const hE = (z) => (z <= 4.0 ? ST : z >= 8.0 ? GL : ST + (GL - ST) * (z - 4.0) / 4.0);
      for (let i = 0; i < EB.length - 1; i++) {
        const [a, b] = [EB[i], EB[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 0.5));
        for (let k = 0; k < n; k++) {
          const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], q = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
          SB.seg(p, q, GL, Math.max(hE(Math.min(p[1], q[1])) + 0.9, GL + 1.8), 0.2, M.limestoneSmooth, -0.1);
        }
      }
    }
    // the bed below the garden stair (behind the west bench)
    groundBlock([...curve(6.75, 9.70), [-8.0, 9.70], [-8.0, 6.75]], GL + 0.35, GL - 0.02, M.soil, M.limestone);
    // ---- built-in garden pieces drawn on A101: a fire-pit deck in the far corner with two planters and a slim stone
    //      table beside it, a slatted steel shade on six thin posts over the loungers, a deck round the palm bed, the west bench
    {
      SW.box(7.438, GL, 6.853, 9.859, GL + 0.05, 8.854, { py: M.woodDeck, def: M.limestoneSmooth });
      SB.box(8.037, GL + 0.05, 7.456, 9.26, GL + 0.40, 8.256, M.marbleBlack);
      SB.box(8.238, GL + 0.40, 7.654, 9.061, GL + 0.412, 8.054, M.steelBlack);
      SB.geom(flatPoly(rect(8.287, 7.704, 9.011, 8.003), GL + 0.414), M.pebbles);
      { const r = [[8.287, 7.704], [9.011, 7.704], [9.011, 8.003], [8.287, 8.003], [8.287, 7.704]];
        for (let i = 0; i < 4; i++) railPanel(S.rail, [r[i][0], GL + 0.41, r[i][1]], [r[i + 1][0], GL + 0.41, r[i + 1][1]], 0.14); }
      for (const [x0, z0, x1, z1] of [[6.737, 6.405, 7.237, 7.054], [6.737, 8.655, 7.237, 9.504]]) groundBlock(rect(x0, z0, x1, z1), GL + 0.45, GL - 0.02, M.soil, M.limestone);
      SB.box(6.836, GL, 7.253, 7.137, GL + 0.40, 8.454, M.limestoneSmooth);
      for (const x of [3.09, 4.49, 5.89]) for (const z of [7.05, 8.65]) SB.box(x - 0.035, GL, z - 0.035, x + 0.035, GL + 2.40, z + 0.035, M.steelBlack);
      for (const z of [7.05, 8.65]) SB.box(1.92, GL + 2.22, z - 0.04, 6.54, GL + 2.40, z + 0.04, M.steelBlack);
      for (let x = 2.0; x < 6.55; x += 0.3) SB.box(x - 0.02, GL + 2.40, 6.97, x + 0.02, GL + 2.49, 8.97, M.steelBlack);
      SW.box(-1.498, GL, 4.605, 1.737, GL + 0.04, 6.007, { py: M.woodDeck, def: M.limestoneSmooth });
      groundBlock(rect(-0.34, 4.96, 0.56, 5.86), GL + 0.40, GL + 0.04, M.soil, M.limestoneSmooth);
      SB.box(-8.0, GL, 6.906, -7.85, GL + 0.85, 9.705, M.limestone);
      for (const [z0, z1] of [[6.906, 7.057], [9.555, 9.705]]) SB.box(-7.85, GL, z0, -7.148, GL + 0.62, z1, M.limestone);
      SB.box(-7.85, GL, 7.057, -7.148, GL + 0.38, 9.555, M.limestone);
      SB.box(-7.85, GL + 0.38, 7.057, -7.148, GL + 0.44, 9.555, M.woodDeck);
    }
    // the wood wing's covered terrace under the cantilevered ground floor: two columns carry the slab's back edge (capture B8)
    for (const u of [1.60, 4.20]) { const q = P(u, 0.55); SB.box(q[0] - 0.18, GL, q[1] - 0.18, q[0] + 0.18, LV.gf - SLAB, q[1] + 0.18, M.limestoneSmooth); }
    terrain();
    // ---- the land beyond the plot: the neighbours' plots (left empty) at street level along the street and beside the
    //      driveway; beyond the curved road a little above it; past the yard the land drops away to the south. Far out it all
    //      sinks gently to the distant ground.
    function terrain() {
      const fade = (x, z, y) => y + (FAR_GROUND - y) * Math.max(sm((Math.abs(x) - 55) / 65), sm((z - 55) / 65), sm((-z - 60) / 60));
      const tri = (mat, a, b, c) => {
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const L = Math.hypot(n[0], n[1], n[2]); if (L < 1e-9) return;
        if (n[1] < 0) { [b, c] = [c, b]; n = n.map((k) => -k); }
        SW.tri(mat, a, b, c, n.map((k) => k / L), [1, 0, 0], [0, 0, 1]);
      };
      // rows of equal length: { pts: [[x, z], ...], h: (x, z) => y }
      const patch = (rows, mat) => {
        const v = (R, k) => { const [x, z] = R.pts[k]; return [x, fade(x, z, R.h(x, z)), z]; };
        for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < rows[i].pts.length - 1; j++) {
          const a = v(rows[i], j), b = v(rows[i], j + 1), c = v(rows[i + 1], j + 1), d = v(rows[i + 1], j);
          tri(mat, a, b, c); tri(mat, a, c, d);
        }
      };
      const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
      const hE = (z) => lerp(ST, GL, (z - 4.0) / 4.0), hS = (z) => GL - 0.06 * Math.max(0, z - 10.6);
      // the curved road, and the land west of it a little above it
      const zW = []; for (let z = ZB; z < 12.5; z += 0.5) zW.push(z); zW.push(12.5, 15, 20, 28, 40, 55, 75, 95, 120);
      patch(zW.map((z) => ({ pts: [[xOut(z), z], [xIn(z), z]], h: () => hR(z) })), M.roadConcrete);
      const XWO = [22, 30, 42, 55, 70, 90, 120];
      patch(zW.map((z) => ({ pts: [[xOut(z), z], ...XWO.map((x) => [-x, z])], h: (x) => hR(z) + (x >= xOut(z) - 0.01 ? 0 : 0.25 * sm((z - ZB) / 4)) })), M.ground);
      // east: beyond the driveway's wall (its outer face), then beyond the yard's east wall
      const XO = [12.5, 16, 22, 30, 42, 55, 70, 90, 120];
      const eo = [[12.52, 4.62], [12.95, 9.37], [12.93, 10.44]];
      const along = (pts, z) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const [xa, za] = pts[i], [xb, zb] = pts[i + 1];
          if (z <= zb || i === pts.length - 2) return xa + (xb - xa) * Math.max(0, Math.min(1, (z - za) / (zb - za)));
        }
        return pts[0][0];
      };
      const rowsE = [ZB, -7.5, -4, 0, 2.5, 4.0, 4.30].map((z) => [Wz(UE, z)[0], z])
        .concat([4.62, 5.3, 6.0, 6.7, 7.4, 8.0, 9.37, 10.44].map((z) => [along(eo, z), z]));
      patch(rowsE.map(([x0, z]) => ({ pts: [[x0, z], ...XO.map((x) => [Math.max(x, x0 + 0.5), z])], h: () => hE(z) })), M.ground);
      // south: past the boundary arc the land falls away; at its west end it meets the road's edge
      const SBo = [[-9.48, 10.45], [-8.21, 10.52], [-6.94, 10.58], [-5.66, 10.64], [-4.39, 10.68], [-3.11, 10.72], [-1.83, 10.75], [-0.56, 10.77],
        [0.72, 10.78], [2.0, 10.78], [3.27, 10.77], [4.55, 10.75], [5.82, 10.73], [7.1, 10.7], [8.38, 10.65], [9.65, 10.6], [10.93, 10.54], [11.93, 10.49], [12.93, 10.44]];
      const x0S = xIn(10.45), colS = [[x0S, 10.45], ...SBo, ...XO.slice(1).map((x) => [x, 10.44])];
      patch([colS, ...[12.5, 15, 20, 28, 40, 55, 75, 95, 120].map((z) => colS.map(([x]) => [x, z]))].map((pts) => ({ pts, h: (x, z) => (x <= x0S + 0.01 ? hR(z) : hS(z)) })), M.ground);
      // the street carries on past the plot; a low stone wall fronts the neighbours' plots either side
      SB.box(-30, ST - 0.1, ZB - 0.22, xOut(ZB) - 0.10, wallTop, ZB, { def: M.limestone, py: M.limestoneSmooth });
      SB.box(Wz(UE, ZB)[0] - 0.02, ST - 0.1, ZB - 0.22, 30, wallTop, ZB, { def: M.limestone, py: M.limestoneSmooth });
      for (const sgn of [-1, 1]) {
        const cols = [30, 42, 55, 70, 90, 120].map((x) => x * sgn);
        const strip = (rows, mat) => patch(rows.map(([z, y]) => ({ pts: cols.map((x) => [x, z]), h: () => y })), mat);
        strip([[ZR - 1.6, ST + 0.1], [ZR - 0.01, ST + 0.1]], M.pavers);
        strip([[ZR - 0.01, ST + 0.1], [ZR, ST], [ZB, ST]], M.roadConcrete);
      }
      // across the street the land rises a little
      const colN = [-120, -90, -70, -55, -42, -30, -15, 0, 15, 30, 42, 55, 70, 90, 120];
      patch([[ZR - 1.6, ST + 0.1], [ZR - 4.0, ST + 0.45], [-32, ST + 0.45], [-45, ST + 0.45], [-60, ST + 0.45], [-80, ST + 0.45], [-100, ST + 0.45], [-120, ST + 0.45]]
        .map(([z, y]) => ({ pts: colN.map((x) => [x, z]), h: () => y })), M.ground);
    }
  }

  // ================================================================ GROUND-FLOOR CEILING DETAILS (with first-floor slab)
  {
    const A = F.ff.base, y = LV.gf + WH.gf - 0.005;
    for (const x of [-5.6, -4.4, -3.2]) A.box(x - 0.025, y - 0.01, -2.4, x + 0.025, y, 2.2, M.led);
    for (const x of [-5.0, -3.8]) A.box(x - 0.012, y - 0.008, -2.6, x + 0.012, y, 2.4, M.brass);
    A.box(-6.4, y - 0.01, LW.n1 + 0.10, -2.4, y, LW.n1 + 0.15, M.led);
    for (const [x, z] of [[-0.9, -4.2], [0.4, -4.2], [-0.9, -2.8], [0.4, -2.8], [-4.4, 3.9], [-4.4, 4.7]]) A.geom(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 16).translate(x, y - 0.01, z), M.led);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { const c = W(1.2 + i * 1.6, 1.0 + j * 1.3); A.geom(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 16).translate(c[0], y - 0.01, c[1]), M.led); }
  }

  // ================================================================ assemble
  const out = { floors: {}, site: {}, walkables: {}, walls: {} };
  for (const f of ['b1', 'gf', 'ff', 'at']) {
    const g = F[f];
    const grp = (acc, opts) => acc.build(opts);
    const full = grp(g.wall), cut = grp(g.cut, { cast: true }), base = grp(g.base), walk = grp(g.walk, { cast: false });
    const glass = grp(g.glass, { cast: false }), rails = grp(g.rail, { cast: false }), doors = grp(g.doors);
    const swings = new THREE.Group(); g.swings.forEach((l) => swings.add(l));
    out.floors[f] = { full, cut, base, walk, glass, rails, doors, swings };
    out.walkables[f] = walk.children.slice();
    out.walls[f] = full.children.slice();
  }
  const siteWalk = S.walk.build({ cast: true }), siteBase = S.base.build(), water = S.water.build({ cast: false }), siteRail = S.rail.build({ cast: false });
  out.site = { walk: siteWalk, base: siteBase, water, rails: siteRail };
  out.roof = S.roof.build(); out.roofGlass = S.roofGlass.build({ cast: false });
  out.walkables.site = siteWalk.children.concat(water.children);
  out.walls.site = siteBase.children.concat(siteWalk.children);
  out.levels = { ...LV };
  out.ground = { upper: G, garden: GL };
  out.sGF = sGF;
  out.lamps = lamps;
  return out;
}
