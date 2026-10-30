// The population figures behind the overview, as plain data: replacement, generations,
// self-sustaining species and the state of the assistance pulses. Views only format them.
export const population_modelState = {};

export function speciesReplacement(s) {
  return s.replacement_deaths > 0 ? s.replacement_hatches / s.replacement_deaths : null;
}

export function populationOverview(f, speciesId) {
  const s = (f.species || []).find(s => s.id === speciesId), a = f.assistance || {},
        deaths = s ? s.replacement_deaths : a.deaths,
        hatches = s ? s.replacement_hatches : a.hatches;
  return {
    species : s || null,
    ratio : deaths > 0 ? hatches / deaths : null,
    generation : (s ? s.max_g : Math.max(0, ...f.fish.filter(p => p[8]).map(p => p[41] || 0))) || 0,
    success : s ? s.adults
                : (f.species || [])
                      .filter(group => speciesReplacement(group) >= 1 && group.adults > 0)
                      .length,
    pulses : [ 'food', 'mutation' ].map(key => ({
                                          key,
                                          active : !!f.bursts?.[key]?.active,
                                          remaining : f.bursts?.[key]?.remaining || 0
                                        })),
    help : {
      on : !!f.safety,
      needed : !!f.safety && (a.shortfall > 0 || a.threatened > 0),
      target : a.target || 0,
      shortfall : a.shortfall || 0
    },
    protection : {
      on : !!f.safety && a.species_minimum > 0,
      minimum : a.species_minimum,
      threatened : a.threatened || 0,
      eligible : a.eligible || 0
    },
    globalRatio : a.deaths > 0 ? a.hatches / a.deaths : null,
    need : f.safety ? 100 * (a.factor ?? 0) : 0,
    historical : !!f.historical,
    paused : !!f.paused
  };
}
