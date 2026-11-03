// The vital figures the interface shows about one fish (reserve, age, health, sickness) as plain
// data: label, value, explanation and gauge. Any view lays them out; build, activity and novelty
// have their own models.
import {bodyTraitRows} from './body_model.js';
import {FISH} from './schema.js';
import {formatNumber, t, percent} from './strings.js';
export const fish_profileState = {};

export function fishOrigin(p) {
  return [
    t('selection.gruender'), t('selection.natuerlicheFortpflanzung'), t('selection.bestandshilfe'),
    t('selection.einwanderung')
  ][p[FISH.origin]] ||
         t('selection.unbekannt');
}

// Health shows good above GOOD, fair above FAIR, otherwise poor.
const HEALTH_GAUGE = Object.freeze(
    {good : .65, fair : .3, colors : Object.freeze([ '#8cc4ac', '#d3bb72', '#d89787' ])});
export function fishProfile(p, b) {
  const stats = [], gauges = [];
  const stat = (key, label, value, note = '') => stats.push({key, label, value, note});
  const gauge = (key, value, color) => gauges.push({key, value, color});
  if (p[FISH.hatched] && p[FISH.disease] > 0)
    stat('disease', t('selection.krank'), t('selection.diseaseLeft', {n : p[FISH.disease]}),
         t('selection.restlicheKrankheitsdauerProSchritt'));
  stat('reserve', p[FISH.hatched] ? t('selection.energiereserve') : t('selection.eigelb'),
       p[FISH.hatched]
           ? t('units.ratio',
               {a : formatNumber(p[FISH.energy]), b : formatNumber(p[FISH.reserve_capacity])})
           : formatNumber(p[FISH.energy]),
       p[FISH.hatched] ? t('selection.energieImKoerperObergrenze')
                       : t('selection.verbleibenderDotterFuerEntwicklung'));
  stat('age', p[FISH.hatched] ? t('selection.alterSeitSchlupf') : t('selection.entwicklung'),
       p[FISH.hatched] ? t('units.steps', {n : formatNumber(p[FISH.adult_age])})
                       : percent(p[FISH.development]));
  stat('health', t('selection.gesundheit'), percent(p[FISH.health]));
  if (!p[FISH.hatched] && Number.isFinite(b?.hatch_reserve))
    stat('hatch-reserve', t('selection.reserveNachSchlupf'),
         t('units.energy', {n : formatNumber(b.hatch_reserve, 1)}),
         t('selection.schaetzungNachRestlichemAufbau'));
  if (p[FISH.hatched])
    gauge('reserve', p[FISH.energy] / Math.max(1, p[FISH.reserve_capacity]), '#d3bb72');
  if (!p[FISH.hatched])
    gauge('age', p[FISH.development], '#a6ce85');
  gauge('health', p[FISH.health],
        HEALTH_GAUGE.colors[p[FISH.health] > HEALTH_GAUGE.good   ? 0
                            : p[FISH.health] > HEALTH_GAUGE.fair ? 1
                                                                 : 2]);
  return {stats, gauges};
}

// The build traits as compact figures for the small cards: the reading as a word, its effect as
// the explanation.
export function fishBuildStats(body) {
  return body ? bodyTraitRows(body, null)
                    .map(r => ({key : r.key, label : r.name, value : r.word, note : r.effect}))
              : [];
}
