// Shared constants and small helpers for the villa model.
// World axes: +X = right on the plans, +Z = down the plans (toward the garden), +Y = up.
// The street is at the top of the plans (negative Z). Units are metres.

export const LV = { b1: -3.40, gf: 0.0, ff: 3.91, at: 7.48 };
export const ROOF_Y = LV.at + 3.25;            // flat roof over the stair core
export const CEIL = { b1: -0.35, gf: 3.56, ff: 7.13, at: 10.38 }; // ceiling (underside of slab above)
export const SLAB = 0.35;
export const FAR_GROUND = -8.0;                  // the distant ground the terrain sinks to (below the lower garden)
export const CUT_H = 1.15;                      // height of the plan cut in dollhouse mode
export const RISER = 0.17;
export const FLOOR_IDS = ['b1', 'gf', 'ff', 'at'];
export const FLOOR_NAMES = { site: 'Outside', b1: 'Basement', gf: 'Ground floor', ff: 'First floor', at: 'Attic' };

// The right-hand wing of the house is rotated ~5.3° on the plans.
// Wing-local coordinates: u across the wing (to the right), v along it (toward the street).
export const WING = { ox: 2.20, oz: 5.39, phi: 0.0925 };
const WC = Math.cos(WING.phi), WS = Math.sin(WING.phi);
export function W(u, v) { return [WING.ox + u * WC - v * WS, WING.oz - u * WS - v * WC]; }
export function toWing(x, z) {
  const dx = x - WING.ox, dz = z - WING.oz;
  return [dx * WC - dz * WS, -dx * WS - dz * WC];
}
// x of the wing's left face (u = 0) at a given z
export function wingLeftX(z) { const v = (WING.oz - z) / WC; return WING.ox - v * WS; }

export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const deg = (r) => r * 180 / Math.PI;
export const rad = (d) => d * Math.PI / 180;
export function uid(prefix = 'i') { return prefix + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }
export function fmtCm(m) { return Math.round(m * 100) + ''; }
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
