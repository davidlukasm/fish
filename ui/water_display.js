// Display constants of the water, without imports: shaders read them while their modules load,
// also inside import cycles.

// Display exposure keeps a shaded fish readable while the senses receive the physical signal:
// even darkness shows OBSERVER_LIGHT.
export const OBSERVER_LIGHT = .4;

// Water masks keep, per texel, which of the four nearest cell centres are in open water (one byte
// each); cells shrink to the open water around their centre, GAP short of obstacles. CACHE masks
// stay cached; masks have RESOLUTION texels per cell.
export const SEDIMENT_MASK = Object.freeze({gap : .02, cache : 4, resolution : 2});
