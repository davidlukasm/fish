import {INTERNAL_TISSUE, isSenseTissue, motorTissue, senseTissue, tissueKind} from './tissue.js';
import {t, tList} from './strings.js';
import {updateBrainState} from './brain.js';
import {brainClamp, brainState, brainWrap} from './brain.js';
import {rgb} from './dom.js';
import {
  FOOD_KIND,
  MOTOR_KIND,
  NEURON,
  NEURON_PARAMETER,
  NEURON_SITE,
  ODOR_KIND,
  RECEPTOR,
  RGB,
  SENSE_KIND,
  SYNAPSE,
  TUNING
} from './schema.js';
import {degrees, hexColor, radians} from './units.js';
import {TankPath} from './renderer.js';
export const brain_modelState = {};
export let sensorNames;

export let motorNames;

export let brainSenseColors;

export let scentNames;

export let scentColors;
export let scentIcons;

// Tuning curves as in src/receptor_tuning.hh.
function tuningAffinity(offset, width) {
  const sigma = TUNING.sigma_min + TUNING.sigma_span * width * width,
        wide = width ** TUNING.wide_power;
  return wide + (1 - wide) * Math.exp(-offset * offset / (2 * sigma * sigma));
}
export function brainScentWeights(n, r) {
  if (r?.[RECEPTOR.scents]?.length === Object.keys(ODOR_KIND).length)
    return r[RECEPTOR.scents];
  const width = brainClamp(n[NEURON.parameters]?.[NEURON_PARAMETER.quality_width] ??
                           TUNING.default_width),
        height = brainClamp(n[NEURON.parameters]?.[NEURON_PARAMETER.quality2] ?? 0, -1, 1),
        phi = Math.PI *
              (brainClamp(n[NEURON.parameters]?.[NEURON_PARAMETER.quality1] ?? 0, -1, 1) + 1),
        rad = Math.sqrt(1 - height * height);
  return TUNING.scent_latitudes.map((v, k) => {
    const a = radians(v), b = radians(TUNING.scent_longitudes[k]),
          dot = rad * Math.cos(phi) * Math.cos(a) * Math.cos(b) +
                rad * Math.sin(phi) * Math.cos(a) * Math.sin(b) + height * Math.sin(a),
          angle = degrees(Math.acos(brainClamp(dot, -1, 1)));
    return tuningAffinity(angle, width);
  });
}

export function brainScentRGB(weights) {
  const hex = scentColors[weights.indexOf(Math.max(...weights))] || scentColors[0];
  return hexColor(hex);
}

export let brainMotorColors;

export function brainConnectivity(b) {
  if (brainState.brainWiringCache?.edges === b.edges)
    return brainState.brainWiringCache.counts;
  const counts = new Map(b.neurons.map(n => [n[NEURON.index], [ 0, 0 ]]));
  for (const e of b.edges) {
    if (counts.has(e[SYNAPSE.source]))
      counts.get(e[SYNAPSE.source])[1]++;
    if (counts.has(e[SYNAPSE.target]))
      counts.get(e[SYNAPSE.target])[0]++;
  }
  updateBrainState({brainWiringCache : {edges : b.edges, counts}});
  return counts;
}

export let brainContext;

export let brainReduced;

export function brainHSV(h) {
  // The hue circle in six sectors of HUE_SECTOR degrees; red, green and blue start at sectors 5,
  // 3 and 1.
  const HUE_SECTOR = 60, SECTORS = 6, RAMP = 4;
  const f = (n, k = (n + h / HUE_SECTOR) % SECTORS) => 1 - Math.max(0, Math.min(k, RAMP - k, 1));
  return [ f(5), f(3), f(1) ];
}

export function brainOrganRGB(n) {
  const P = NEURON_PARAMETER, p = n[NEURON.parameters] || [],
        h = TUNING.hue_half_circle * ((p[P.quality1] ?? 0) + 1),
        width = p[P.quality_width] ?? TUNING.default_width, absorb = Object.values(RGB).map(c => {
          const d = degrees(brainWrap(radians(h - TUNING.channel_hue * c)));
          return tuningAffinity(d, width);
        }),
        total = absorb.reduce((a, b) => a + b, 0);
  return absorb.map(v => 1 - v / total);
}

// Senses and motors with an organ on each side.
const S = SENSE_KIND;
export const PAIRED_SENSES =
                 Object.freeze([ S.light, S.odor, S.flow, S.touch, S.proximity, S.damage ]),
             PAIRED_MOTORS = Object.freeze([ MOTOR_KIND.turn, MOTOR_KIND.defense ]),
             // Motors whose fibres run along the midline: tail, suction and jaw.
    MIDLINE_MOTORS =
        Object.freeze([ MOTOR_KIND.forward, MOTOR_KIND.suction, MOTOR_KIND.aggression ]);
// The side of a paired cell: 0 left, 1 right.
export function cellSide(n) { return n[NEURON.site][NEURON_SITE.side] < 0 ? 0 : 1; }

export function dominantCellPart(n) {
  const parts = [ [ INTERNAL_TISSUE, n[NEURON.internal] || 0 ] ];
  (n[NEURON.senses] || []).forEach((value, index) => parts.push([ senseTissue(index), value ]));
  (n[NEURON.motors] || []).forEach((value, index) => parts.push([ motorTissue(index), value ]));
  return parts.reduce((a, b) => b[1] > a[1] ? b : a)[0];
}

export function cellParts(n) {
  const parts = [];
  if (n[NEURON.internal] > 0)
    parts.push([ t('brain_model.verarbeitung'), n[NEURON.internal] ]);
  for (let k = 0; k < Math.max(sensorNames.length, motorNames.length); k++) {
    if (n[NEURON.senses]?.[k] > 0)
      parts.push([ sensorNames[k], n[NEURON.senses][k] ]);
    if (n[NEURON.motors]?.[k] > 0)
      parts.push([ motorNames[k], n[NEURON.motors][k] ]);
  }
  return parts.sort((a, b) => b[1] - a[1]);
}

export function partShare(n, key) {
  return key === INTERNAL_TISSUE ? n[NEURON.internal]
         : isSenseTissue(key)    ? n[NEURON.senses]?.[tissueKind(key)]
                                 : n[NEURON.motors]?.[tissueKind(key)];
}

export function neuronName(n, key = '') {
  return key && key !== 'all' ? (key === INTERNAL_TISSUE ? t('brain_model.verarbeitung')
                                 : isSenseTissue(key)    ? sensorNames[tissueKind(key)]
                                                         : motorNames[tissueKind(key)])
                              : cellParts(n)[0]?.[0] || t('brain_model.zelle');
}

export function cellColor(n) {
  if (n[NEURON.internal] > .5)
    return '#b1bec4';
  const s = n[NEURON.senses] || [], m = n[NEURON.motors] || [], si = s.indexOf(Math.max(...s)),
        mi = m.indexOf(Math.max(...m));
  const hue =
      TUNING.hue_half_circle * ((n[NEURON.parameters]?.[NEURON_PARAMETER.quality1] ?? 0) + 1);
  return (s[si] || 0) >= (m[mi] || 0) ? si === SENSE_KIND.odor
                                            ? rgb(brainScentRGB(brainScentWeights(n)))
                                        : si === SENSE_KIND.light ? 'hsl(' + hue + ',65%,65%)'
                                                                  : brainSenseColors[si]
         : mi === MOTOR_KIND.pigment ? rgb(brainHSV(hue))
                                      : brainMotorColors[mi];
}

const initializers = {
  "sensorNames" : () => {
    sensorNames = [
      t('brain_model.helligkeit'), t('brain_model.geruch'), t('brain_model.seitenlinie'),
      t('brain_model.beruehrung'), t('brain_model.naehe'), t('brain_model.aufnahme'),
      t('brain_model.gewebeschaden'), t('brain_model.blasendruck'), t('brain_model.gonadendruck'),
      t('brain_model.innendruck'), t('brain_model.blutwerte')
    ];
  },
  "motorNames" : () => {
    motorNames = [
      t('brain_model.vortrieb'), t('brain_model.drehung'), t('brain_model.saugen'), 'Ei',
      t('brain_model.sperma'), t('brain_model.beissen'), t('brain_model.abwehr'),
      t('brain_model.pigment'), t('brain_model.schwimmblase'), t('brain_model.druese')
    ];
  },
  "brainSenseColors" : () => {
    brainSenseColors = [
      '#e9c185', '#b6a5df', '#80c6db', '#dbb58a', '#dbca74', '#b5c580', '#ed8b8d', '#80a8c9',
      '#c7b978', '#db8d9d', '#c7aceb'
    ];
  },
  // Odour channels of the simulation: food, algae, plants, worms and crabs, plankton, carrion,
  // spawn (eggs and sperm), mussels. Icons are the feeding icons of the same source.
  "scentNames" : () => { scentNames = tList('brain_model.scentNames'); },
  "scentColors" : () => {
    scentColors =
        [ '#ed9c75', '#58a849', '#a7cf59', '#dca57e', '#e7ba77', '#b27c77', '#c293df', '#8aabb8' ];
  },
  "scentIcons" : () => {
    const K = FOOD_KIND;
    scentIcons = [ K.feed, K.algae, K.plant, K.crab, K.worm, K.carrion, K.egg, K.benthic ];
  },
  "brainMotorColors" : () => {
    brainMotorColors = [
      '#a2d9c6', '#e9c185', '#8dc8d4', '#d6ba83', '#b6a5df', '#df9c8d', '#80c6db', '#b5b9c6',
      '#93cbd5', '#bc9fe4'
    ];
  },
  "brainContext" : () => { brainContext = new TankPath(); },
  "brainReduced" : () => {
    brainReduced =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
