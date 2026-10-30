// What a fish or species ate and where it lived, as plain shares: diet amounts per food source
// (rooted and drifting plants apart) and time shares per habitat.
export const nutrition_modelState = {};

export function ecologyFor(t) {
  const n = t?.ecology_steps || 0, a = t?.ecology || [];
  return {
    samples : n,
    raw_diet : t?.raw_diet || [],
    digested : t?.digested || 0,
    drift_grass : t?.drift_grass || 0,
    surface : (a[0] || 0) / Math.max(1, n),
    grass : (a[1] || 0) / Math.max(1, n),
    buried : (a[2] || 0) / Math.max(1, n),
    shadow : (a[3] || 0) / Math.max(1, n),
    light : (a[4] || 0) / Math.max(1, n)
  };
}

export function foodDisplayIndex(source, drift = false) {
  return source === 5 && drift ? 6 : source + (source >= 6 ? 1 : 0);
}

export function foodAmounts(diet = [], eco = {}) {
  const a = Array.from({length : 11}, (_, i) => Math.max(0, diet[i] || 0)),
        drift = Math.min(a[5], Math.max(0, eco.drift_grass || 0));
  return [...a.slice(0, 5), a[5] - drift, drift, ...a.slice(6) ];
}
