import {FAUNA, INVERTEBRATE_KIND, SEABED} from './schema.js';

const clamp01 = v => Math.max(0, Math.min(1, v));
const familyOf = (morph, table) => Math.max(0, Math.min(table.length - 1, Math.floor(morph)));

export const morphVariant = morph => morph - Math.floor(morph);
export const familyMorph = family => family + .5;
export function familyCount(kind) {
  return (kind === INVERTEBRATE_KIND.mussel ? FAUNA.mussel_family_size
          : kind === INVERTEBRATE_KIND.crab ? FAUNA.crab_family_size
                                            : FAUNA.worm_family_length)
      .length;
}
export function smallAnimalColor(kind) {
  return kind === INVERTEBRATE_KIND.worm   ? FAUNA.worm_color
         : kind === INVERTEBRATE_KIND.crab ? FAUNA.crab_color
                                           : FAUNA.mussel_color;
}
export function crabSize(morph) {
  return FAUNA.crab_family_size[familyOf(morph, FAUNA.crab_family_size)] *
         (FAUNA.crab_size_base + FAUNA.crab_size_spread * morphVariant(morph));
}
export const MUSSEL_FAMILY =
    Object.freeze({narrow : 0, long : 1, wide : 2, ribbed : 3, razor : 4, pen : 5, zebra : 6});
export const WORM_FAMILY = Object.freeze({short : 0, slender : 1, broad : 2, bristled : 3});
export const CRAB_FAMILY = Object.freeze({round : 0, tall : 1, angular : 2, broad : 3});
export const MUSSEL_SHELLS = Object.freeze({
  heights : [ 1.37, 1.48, 1.10, 1.19, 1.55, 1.30, .98 ],
  widths : [ .245, .17, .39, .33, .115, .30, .36 ],
  gapes : [ .25, .25, .35, .25, .16, .30, .22 ],
  spreads : [ .13, .13, .28, .13, .05, .22, .15 ],
  height_base : .94,
  height_variation : .10
});
export const musselHeight = morph =>
    MUSSEL_SHELLS.heights[familyOf(morph, MUSSEL_SHELLS.heights)] *
    (MUSSEL_SHELLS.height_base + MUSSEL_SHELLS.height_variation * morphVariant(morph));
export function musselSize(morph) {
  return FAUNA.mussel_family_size[familyOf(morph, FAUNA.mussel_family_size)] *
         (FAUNA.mussel_size_base + FAUNA.mussel_size_spread * morphVariant(morph));
}
export function crabRadius(energy, parameters, morph) {
  const size = crabSize(morph), capacity = parameters.crab_energy * size * size;
  return size * (FAUNA.crab_radius_base +
                 FAUNA.crab_radius_growth * clamp01(energy / (FAUNA.crab_grown_share * capacity)));
}
export function musselRadius(energy, parameters, morph) {
  const size = musselSize(morph), capacity = parameters.mussel_energy * size * size;
  return FAUNA.mussel_radius * size * (1 + clamp01(energy / capacity));
}
export function crabSupportHeight(radius, depth, fraction) {
  if (depth <= SEABED.bare_depth)
    return FAUNA.crab_bare_lift * radius;
  return Math.max(depth * fraction, FAUNA.crab_min_lift * radius,
                  FAUNA.crab_lift_gain * radius / (1 + FAUNA.crab_lift_flatten * radius / depth));
}
export function wormIndividuality(id) {
  return (id * FAUNA.worm_hash_factor % FAUNA.worm_hash_modulus) / (FAUNA.worm_hash_modulus - 1);
}
export const burialShare = individual => FAUNA.burial_min + FAUNA.burial_spread * individual;
export function wormLength(id, morph) {
  const v = wormIndividuality(id);
  return FAUNA.worm_length_scale * (FAUNA.worm_length_min + FAUNA.worm_length_spread * v * v) *
         FAUNA.worm_family_length[familyOf(morph, FAUNA.worm_family_length)];
}
