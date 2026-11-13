// Muscle fibres from slow (0: red, oxidative) to fast (1: white, glycolytic), as the engine has
// them (muscle_fibre.hh). The cell's time constant gene carries the mix.
import {MUSCLE_FIBRE as F} from './schema.js';
import {hexOf} from './units.js';

export const FIBRE_TYPES = Object.freeze({fast : 1, mixed : .5, slow : 0});
export const FIBRE_COLORS = Object.freeze({slow : [ .72, .27, .25 ], fast : [ .94, .91, .84 ]});
const clamp = v => Math.max(0, Math.min(1, v));
export const fastShare = tau => 1 - clamp(tau ?? FIBRE_TYPES.mixed);
export const fibreTau = fast => 1 - clamp(fast);
// The same factor per share of fast fibres, as the engine has it.
const between = (slow, fast, share) => slow * (fast / slow) ** clamp(share);
export const fibreForce = f => between(F.force_slow, F.force_fast, f);
export const fibreCost = f => between(F.cost_slow, F.cost_fast, f);
export const fibreUpkeep = f => between(F.upkeep_slow, F.upkeep_fast, f);
export const fibreColor = f =>
    FIBRE_COLORS.slow.map((c, i) => c + (FIBRE_COLORS.fast[i] - c) * clamp(f));
export const fibreHex = f => hexOf(fibreColor(f));
const GOLDEN = (Math.sqrt(5) - 1) / 2, HEX_SIDES = 6;
// A muscle bundle in cross-section: cells at unit spacing, ring by ring around the middle one;
// the golden ratio scatters the fast ones through it.
export function fibreBundle(rings, fast) {
  const cells = [ [ 0, 0 ] ], corner = side => Math.PI / 3 * side;
  for (let ring = 1; ring <= rings; ++ring)
    for (let side = 0; side < HEX_SIDES; ++side)
      for (let k = 0; k < ring; ++k)
        cells.push([
          ring * Math.cos(corner(side)) + k * Math.cos(corner(side + 2)),
          ring * Math.sin(corner(side)) + k * Math.sin(corner(side + 2))
        ]);
  return cells.map(([ x, y ], k) => ({x, y, fast : (k * GOLDEN) % 1 < fast}));
}
// Average force under a held full command; the engine's twitch shape averages one.
export function enduranceCurve(f, steps) {
  const curve = [];
  let reserve = 1;
  for (let k = 0; k < steps; ++k) {
    const available = 1 - f + f * reserve;
    curve.push(fibreForce(f) * available);
    reserve = clamp(reserve + (1 - reserve) / between(F.recovery_slow, F.recovery_fast, f) -
                    F.drain * f * f * available);
  }
  return curve;
}
