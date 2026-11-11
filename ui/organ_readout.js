import {
  BARBEL,
  GRAVITY,
  GUT_TISSUE,
  INTERNAL_TISSUE,
  isMotorTissue,
  isSenseTissue,
  RESERVE_TISSUE,
  SENSE_TISSUE,
  tissueKind
} from './tissue.js';
import {t, formatNumber, percent} from './strings.js';
import {hormoneName} from './hormones.js';
import {brainClamp, brainTissueName} from './brain.js';
import {brainScentWeights, PAIRED_MOTORS, PAIRED_SENSES, scentNames} from './brain_model.js';
import {sceneState} from './state.js';
import {
  BEHAVIOR_SCALE,
  BODY_UNIT,
  EFFECTOR,
  FISH,
  HORMONES,
  IMAGE_BAND,
  MOTOR_KIND,
  MOTOR_PORTS,
  MOUTH_CYCLE,
  NEURON,
  NOSE_SAMPLE,
  ORGAN_PORT,
  RECEPTOR,
  RGB,
  SENSE_KIND,
  SENSORY_COMPONENT,
  STROKE,
  STROKE_KIND,
  TOLERANCE,
  TUNING,
  VISION,
  VISUAL_SAMPLE
} from './schema.js';
import {degrees, radians} from './units.js';
import {typeColour, typeNameIndex} from './tuning.js';
export const organ_readoutState = {};
// Postures a gravity hair reports, from the head over the flank to the tail.
const GRAVITY_POSTURES = Object.freeze([ 'head', 'flank', 'tail' ]);
export let organHistory;

export let organNumber;

export let organPercent;

const EGG_RELEASE = Object.freeze({fill : .95});
function eggLayingStatus(d, rate, limit) {
  const b = d.b, stored = (d.raw || d.p)[FISH.egg_yolk] || 0,
        params = sceneState.frame.parameters || {};
  if (d.a?.birthing)
    return {text : t('organ_readout.wirdGelegt'), remaining : 0};
  if (!stored)
    return {
      text : d.p[FISH.energy] >
                     params.egg_reserve *
                         Math.sqrt((d.b.tissue ?? BODY_UNIT.body_tissue) / BODY_UNIT.body_tissue)
                 ? t('organ_readout.nochKeinDotter')
                 : t('organ_readout.wartetAufEnergie'),
      remaining : null
    };
  if (b.egg_laying) {
    if (!b.egg_nutrient &&
        (sceneState.frame.population_size ?? 0) >= sceneState.frame.population_limit)
      return {text : t('organ_readout.wartetAufFreienBestand'), remaining : null};
    if (!b.egg_nutrient && (b.egg_nearby ?? 0) >= params.egg_crowding_limit)
      return {text : t('organ_readout.gelegeplatzBesetzt'), remaining : null};
    return {text : t('organ_readout.wirdGelegt'), remaining : 0};
  }
  if (params.egg_organ_capacity > 0 && stored < EGG_RELEASE.fill * limit)
    return {
      text : t('organ_readout.waechstFreigabeAb95'),
      remaining : rate > 0 ? Math.ceil((EGG_RELEASE.fill * limit - stored) / rate) : null,
      estimate : rate > 0
    };
  const release = organReleaseTiming(d, MOTOR_KIND.eggs);
  return {
    text : stored >= limit ? t('organ_readout.eiVollWartetAuf')
                           : t('organ_readout.waechstAbgabemuskelLegtDas'),
    remaining : release.next,
    estimate : release.next !== null
  };
}

function organVisualWeight(r, angle) {
  if (angle < r[RECEPTOR.view_left] || angle > r[RECEPTOR.view_right])
    return 0;
  return angle <= r[RECEPTOR.angle]
             ? (r[RECEPTOR.angle] === r[RECEPTOR.view_left]
                    ? 1
                    : (angle - r[RECEPTOR.view_left]) / (r[RECEPTOR.angle] - r[RECEPTOR.view_left]))
             : (r[RECEPTOR.view_right] === r[RECEPTOR.angle]
                    ? 1
                    : (r[RECEPTOR.view_right] - angle) /
                          (r[RECEPTOR.view_right] - r[RECEPTOR.angle]));
}

export function eyeSight(bands, samples, receptors, side) {
  return {
    graphic : 'eye',
    image :
        (bands ||
         []).filter(band => band[IMAGE_BAND.eye] === undefined || band[IMAGE_BAND.eye] === side),
    samples : new Map((samples || []).map(s => [s[VISUAL_SAMPLE.neuron], s])),
    receptors
  };
}
export function eyeTypeAnswers(info, count = EYE_IMAGE.samples) {
  const half = radians(TUNING.visual_width_max), types = new Map();
  for (const r of info.receptors ?? []) {
    const key = [
      r[RECEPTOR.hue], ...r[RECEPTOR.spectrum], r[RECEPTOR.quality2], r[RECEPTOR.response_threshold]
    ].join('|');
    if (!types.has(key))
      types.set(key, {
        colour : typeColour(r[RECEPTOR.hue], r[RECEPTOR.spectrum]),
        name : typeNameIndex(r[RECEPTOR.hue], r[RECEPTOR.spectrum]),
        cells : []
      });
    types.get(key).cells.push(r);
  }
  return [...types.values() ].map(
      type => ({
        colour : type.colour,
        name : type.name,
        values : Array.from({length : count},
                            (_, i) => {
                              const angle = -half + 2 * half * (i + .5) / count;
                              let total = 0, sum = 0;
                              for (const r of type.cells) {
                                const weight = organVisualWeight(r, angle),
                                      sample = info.samples?.get(r[RECEPTOR.neuron]);
                                if (!weight)
                                  continue;
                                total += weight;
                                sum += weight * (sample?.[VISUAL_SAMPLE.response] ?? 0);
                              }
                              return total > 0 ? brainClamp(sum / total) : null;
                            })
      }));
}
const EYE_IMAGE = Object.freeze({samples : 120});
export function eyeImage(info, count = EYE_IMAGE.samples) {
  const half = radians(TUNING.visual_width_max), bands = info.image || [];
  return Array.from({length : count}, (_, i) => {
    const angle = -half + 2 * half * (i + .5) / count;
    const I = IMAGE_BAND, pixel = bands.find(p => angle >= p[I.left] && angle < p[I.right]);
    return pixel ? pixel.slice(I.red, I.blue + 1).map(v => brainClamp(v)) : [ 0, 0, 0 ];
  });
}

const MOTOR_STROKES = Object.freeze([
  STROKE_KIND.tail, STROKE_KIND.turn_left, STROKE_KIND.suction, STROKE_KIND.egg, STROKE_KIND.sperm,
  STROKE_KIND.bite, STROKE_KIND.defense
]);
export function organStrokeIndex(index, side = 0) {
  return index === MOTOR_KIND.turn ? STROKE_KIND.turn_left + side : MOTOR_STROKES[index];
}
export function organMotorInterval(index, d = {
  b : sceneState.frame?.brain
},
                                   side = 0) {
  return d.b?.strokes?.[organStrokeIndex(index, side)]?.[STROKE.steps] || 0;
}
function organMotorTiming(d, index, activation, side = 0) {
  const stroke = d.b?.strokes?.[organStrokeIndex(index, side)], threshold = d.b?.stroke_threshold;
  if (!stroke || !(threshold >= 0))
    return {next : null, rhythm : Infinity, work : 0, text : '—'};
  const mean = stroke[STROKE.mean], recovery = stroke[STROKE.recovery], tau = stroke[STROKE.steps],
        keep = Math.exp(-1 / tau), cooldown = Math.max(1, recovery),
        atCooldown = activation + (mean - activation) * keep ** cooldown,
        crossing = initial =>
            initial >= threshold ? 1
            : activation > threshold
                ? Math.max(1,
                           Math.ceil(Math.log((activation - threshold) / (activation - initial)) /
                                     Math.log(keep)))
                : Infinity,
        next = atCooldown >= threshold && atCooldown > 0 ? cooldown
                                                         : Math.max(cooldown, crossing(mean)),
        rhythm = Math.max(Math.round(tau), crossing(0));
  return {
    next : Number.isFinite(next) ? next : null,
    rhythm,
    work : Number.isFinite(next)
               ? Math.max(0, activation + (mean - activation) * keep ** next) * tau
               : 0,
    text : !Number.isFinite(next)
               ? activation > 0 ? t('organ_readout.ansteuerungZuSchwach') : t('organ_readout.ruht')
           : next <= 1 ? t('organ_readout.naechsterSchritt')
                       : t('units.inSteps', {n : next})
  };
}

function organReleaseTiming(d, index) {
  const port = index === MOTOR_KIND.eggs ? ORGAN_PORT.eggs : ORGAN_PORT.sperm,
        active = (d.b.effectors || []).filter(e => e[EFFECTOR.port] === port).reduce((sum, e) => {
          const n = d.nodes?.get(e[EFFECTOR.neuron]);
          return sum +
                 (n?.[NEURON.ready] && !n[NEURON.muted]
                      ? e[EFFECTOR.strength] * brainClamp(n[NEURON.state] ?? n[NEURON.activity]) *
                            (e[EFFECTOR.outside] ?? 0)
                      : 0);
        }, 0);
  return organMotorTiming(d, index, active);
}

function spermReleaseStatus(d, rate, limit, portion) {
  const stored = d.p[FISH.sperm_store] || 0;
  if (stored < portion)
    return t('organ_readout.collectsAtLeast', {energy : organNumber(portion)});
  if (d.b.sperm_laying)
    return (sceneState.frame.sperm_releases || 0) >= sceneState.frame.sperm_release_limit
               ? t('organ_readout.wartetAufPlatzFuer')
               : t('organ_readout.gibtSpermienAb');
  return stored >= limit ? t('organ_readout.vorratVollWartetAuf')
                         : t('organ_readout.sammeltAbgabemuskelSetztSpermien');
}

const READOUT = Object.freeze({
  firing : .05,
  min_mass : .2,
  min_push_mass : .5,
  digits : 3,
  size_physics : .5,
  straight : .01,
  outside : .5,
  force_digits : 4
});
export function brainOrganReadout(d, tissue) {
  const {key, side, members} = tissue, k = tissueKind(key),
                    nodes = [...new Map(members.map(m => [m.n[NEURON.index], m.n])).values() ],
                    weight =
                        members.reduce((s, {n, part}) => s + part.share * n[NEURON.strength], 0),
                    activity = members.reduce((s, {n, part}) =>
                                                  s + part.share * n[NEURON.strength] *
                                                          (n[NEURON.ready] && !n[NEURON.muted]
                                                               ? Math.abs(n[NEURON.activity])
                                                               : 0),
                                              0) /
                               Math.max(TOLERANCE.negligible, weight),
                    rec = nodes.map(n => d.receptors.get(n[NEURON.index])).filter(Boolean),
                    params = sceneState.frame.parameters || {},
                    metric = (label, value, hint = '') => ({label, value, hint}),
                    response = metric(t('organ_readout.zellaktivitaet'), organPercent(activity),
                                      t('organ_readout.sinneszellenErhaltenDasSignal')),
                    info = {
                      key,
                      side,
                      title : tissue.variant === BARBEL    ? t('organ_readout.bartel')
                              : tissue.variant === GRAVITY ? t('organ_readout.gleichgewicht')
                                                           : brainTissueName(key),
                      cells : nodes.length,
                      activity,
                      metrics : [],
                      graphic : 'signal',
                      hero : '',
                      caption : '',
                      series : activity
                    };
  if (key === GUT_TISSUE || key === RESERVE_TISSUE) {
    info.hero = organPercent(key === GUT_TISSUE
                                 ? d.b.satiety
                                 : d.p[FISH.energy] / Math.max(1, d.p[FISH.reserve_capacity]));
    info.graphic = key;
    info.fill = key === GUT_TISSUE ? d.b.satiety
                                   : d.p[FISH.energy] / Math.max(1, d.p[FISH.reserve_capacity]);
    info.caption = key === GUT_TISSUE ? t('organ_readout.fuellungVerwertungUndDurchgang')
                                      : t('organ_readout.verfuegbareEnergiereserve');
    info.metrics=key==='gut'?[metric(t('organ_readout.darmenergie'),organNumber(d.b.gut_energy)),metric(t('organ_readout.verdaulich'),organNumber(d.b.gut_digestible))]:[metric(t('organ_readout.energie'),organNumber(d.p[FISH.energy])),metric(t('organ_readout.fassung'),organNumber(d.p[FISH.reserve_capacity]))];
    return info;
  }
  const ports = MOTOR_PORTS,
        all = isMotorTissue(key)
                  ? d.b.effectors.filter(e => e[EFFECTOR.port] === ports[k] &&
                                              d.nodes.get(e[EFFECTOR.neuron])?.[NEURON.functional])
                  : [],
        motor = all.filter(e => nodes.some(n => n[NEURON.index] === e[EFFECTOR.neuron])),
        capacity = motor.reduce((s, e) => s + e[EFFECTOR.strength], 0),
        active =
            e => {
              const n = d.nodes.get(e[EFFECTOR.neuron]);
              return n?.[NEURON.ready] && !n[NEURON.muted]
                         ? brainClamp(n[NEURON.state] ?? n[NEURON.activity])
                         : 0;
            },
        sum = motor.reduce((s, e) => s + e[EFFECTOR.strength] * active(e), 0),
        total = all.reduce((s, e) => s + e[EFFECTOR.strength] * active(e), 0),
        u = sum / Math.max(TOLERANCE.negligible, capacity),
        drive = k === 1 ? all.reduce(
                              (s, e) => {
                                const lever = e[EFFECTOR.lever];
                                return s + ((lever < 0 ? 0 : 1) === side
                                                ? e[EFFECTOR.strength] * Math.max(0, active(e)) *
                                                      Math.abs(lever)
                                                : 0);
                              },
                              0)
                        : total,
        timing = organMotorTiming(d, k, drive, side),
        growth = (d.b.tissue ?? BODY_UNIT.body_tissue) / BODY_UNIT.body_tissue,
        paired = isSenseTissue(key) ? PAIRED_SENSES.includes(k) : PAIRED_MOTORS.includes(k);
  const nextPulse = metric(t('organ_readout.naechsterPuls'), timing.text,
                           t('organ_readout.beiGleichbleibenderAnsteuerungPausen'));
  if (paired)
    info.title = t(side ? 'units.titleRight' : 'units.titleLeft', {name : info.title});
  if (key === INTERNAL_TISSUE) {
    const firing =
              nodes
                  .filter(n => n[NEURON.ready] && !n[NEURON.muted] &&
                               Math.abs(n[NEURON.state] ?? n[NEURON.activity]) > READOUT.firing)
                  .length,
          tau = members.reduce((s, {n, part}) => s + (n[NEURON.time_constant] || 0) * part.share *
                                                         n[NEURON.strength],
                               0) /
                Math.max(TOLERANCE.negligible, weight);
    info.hero = firing + ' / ' + nodes.length;
    info.caption = t('organ_readout.innerActive', {
      head : nodes.filter(n => n[NEURON.zone] <= 1).length,
      cord : nodes.filter(n => n[NEURON.zone] > 1).length
    });
    info.metrics = [
      metric(t('organ_readout.zeitkonstante'), t('units.steps', {n : Math.round(tau)}),
             t('organ_readout.mittlereZeitkonstanteDerLernspuren')),
      metric(t('organ_readout.verbindungen'), formatNumber(d.b.edges.length),
             t('organ_readout.nervenverbindungenImGesamtenGehirn'))
    ];
  } else if (isMotorTissue(key)) {
    info.activity = u;
    if (k <= MOTOR_KIND.turn) {
      info.graphic = 'pulse';
      info.period = timing.rhythm;
      info.nextSteps = timing.next;
      info.series = k === MOTOR_KIND.forward ? d.p[FISH.impulse_forward]
                                             : d.p[side ? FISH.impulse_right : FISH.impulse_left];
      const impulse = timing.work, weak = 1 - params.wound_weakness * (1 - d.p[FISH.health]),
            mass = Math.max(READOUT.min_mass, d.p[FISH.mass] || 1);
      if (k === MOTOR_KIND.forward) {
        const speed = params.stroke_push * impulse * weak / Math.max(READOUT.min_push_mass, mass);
        info.hero = t('units.plusPxPerStep', {n : organNumber(speed, 2)});
        info.caption = t('organ_readout.speedGain', {share : organPercent(d.b.undulation)});
        info.metrics = [
          {...nextPulse, label : t('organ_readout.naechsterSchlag')},
          metric(t('organ_readout.energieJeSchlag'),
                 organNumber(params.swimming_cost * impulse, READOUT.digits),
                 t('organ_readout.beiAusreichenderEnergieVerletzung'))
        ];
      } else {
        const inertia = params.size_physics >= READOUT.size_physics ? mass : 1,
              angle = brainClamp(params.stroke_turn * impulse * (side ? -1 : 1) * weak / inertia,
                                 -BEHAVIOR_SCALE.turn_degrees, BEHAVIOR_SCALE.turn_degrees);
        info.hero = total <= 0 ? t('organ_readout.ruht')
                    : Math.abs(angle) < READOUT.straight
                        ? t('organ_readout.keineDrehung')
                        : t(angle > 0 ? 'units.degPerStepRight' : 'units.degPerStepLeft',
                            {n : organNumber(Math.abs(angle), 1)});
        info.caption = t('organ_readout.zuwachsDerDrehgeschwindigkeit');
        info.metrics = [
          {...nextPulse, label : t('organ_readout.naechsterSchlag')},
          metric(t('organ_readout.dieseFlosseTraegtBei'),
                 organPercent(sum / Math.max(TOLERANCE.negligible, total)),
                 t('organ_readout.koerperseiteUndAnsatzBestimmen'))
        ];
      }
    } else if (k === MOTOR_KIND.suction) {
      const gape = d.b.maximum_mouth_aperture || 0;
      info.hero = t('organ_readout.gapeUpTo', {n : organNumber(gape * 2, 1)});
      info.caption = t('organ_readout.saugtBrockenSchabtAlgen');
      info.graphic = 'mouth';
      info.metrics = [
        metric(t('organ_readout.reichweite'), t('units.px', {n : organNumber(d.b.mouth_reach, 1)}),
               t('organ_readout.abstandVomMaulrandWaende')),
        metric(t('organ_readout.wassertransport'), organPercent(d.b.pump_flow || 0),
               t('organ_readout.saugkraftSetztDenWasserstrom'))
      ];
      info.series = d.b.eat_signal || 0;
    } else if (k === MOTOR_KIND.eggs || k === MOTOR_KIND.sperm) {
      const egg = k === MOTOR_KIND.eggs,
            limit = (d.raw || d.p)[egg ? FISH.egg_capacity : FISH.sperm_capacity] ??
                    (params[egg ? 'egg_capacity' : 'sperm_capacity'] * growth),
            stored = d.p[egg ? FISH.egg_yolk : FISH.sperm_store] || 0,
            rate = params[egg ? 'egg_fill_rate' : 'sperm_fill_rate'] * growth * (() => {
                     const inside = motor.reduce(
                         (s, e) => s + e[EFFECTOR.strength] * active(e) *
                                           (1 - (e[EFFECTOR.outside] ?? READOUT.outside)),
                         0);
                     return inside / (1 + inside);
                   })(),
            portion = params.sperm_portion,
            reserve = !egg && d.p[FISH.hatched] === 0 ? d.b.embryo.reserve
                                                      : params.egg_reserve * Math.sqrt(growth);
      info.hero = t('units.energyOf', {n : organNumber(stored), of : organNumber(limit)});
      info.graphic = egg ? 'egg' : 'sperm';
      info.fill = limit > 0 ? stored / limit : 0;
      info.series = info.fill;
      info.metrics = [ metric(
          egg ? t('organ_readout.dotterAngefordert') : t('organ_readout.spermaAngefordert'),
          t('units.energyPerStep', {
            n : organNumber(stored >= limit || d.b[egg ? 'egg_laying' : 'sperm_laying'] ||
                                    d.p[FISH.energy] <= reserve
                                ? 0
                                : rate,
                            2)
          }),
          t('organ_readout.angeforderterMittlererZuflussBei')) ];
      if (egg) {
        info.laying = eggLayingStatus(d, rate, limit);
        info.caption = info.laying.text;
        info.metrics.push(metric(t('organ_readout.bisZurAbgabe'),
                                 info.laying.remaining === null ? t('organ_readout.wartet')
                                 : info.laying.remaining === 0
                                     ? t('organ_readout.jetzt')
                                     : t('units.steps', {n : info.laying.remaining}),
                                 t('organ_readout.geschaetztBeiGleichbleibenderFuell')));
      } else {
        info.caption = spermReleaseStatus(d, rate, limit, portion);
        info.metrics.push(metric(t('organ_readout.befruchtungenJeWolke'),
                                 t('organ_readout.unbegrenzt'),
                                 t('organ_readout.solangeDieWolkeAusreichend')));
      }
    } else if (k === MOTOR_KIND.aggression) {
      const force = d.b.bite_strength || 0;
      info.hero = t('organ_readout.biteForce', {n : organNumber(force, 1)});
      info.caption = t('organ_readout.spitzeZaehneReissenUnd');
      info.graphic = 'attack';
      info.fill = d.b.bite_signal || 0;
      info.metrics = [
        metric(t('organ_readout.mundzyklus'),
               (d.b.mouth_phase ?? -1) < 0 ? t('organ_readout.ruhe')
                                           : organPercent(d.b.mouth_phase / MOUTH_CYCLE.steps),
               t('organ_readout.beissenFunktioniertUnabhaengigVom')),
        metric(t('organ_readout.zahnform'),
               t('organ_readout.blunt', {share : organPercent(d.b.blunt_teeth)}),
               t('organ_readout.gepackteWuermerUndBruchstuecke'))
      ];
      info.series = d.b.bite_signal || 0;
    } else if (k === MOTOR_KIND.defense) {
      info.hero = t('organ_readout.protection', {share : organPercent(d.p[FISH.defense])});
      info.caption = t('organ_readout.aufgestellteStachelnSchuetzenVor');
      info.graphic = 'defense';
      info.fill = d.p[FISH.defense] || 0;
      info.metrics = [
        metric(t('organ_readout.widerstand'),
               t('units.times', {n : organNumber(1 + 2 * (d.b.active_defense || 0), 2)}),
               t('organ_readout.faktorDerAbbremsungDurch')),
        nextPulse
      ];
      info.series = d.p[FISH.defense];
    } else if (k === MOTOR_KIND.bladder) {
      info.hero = t('organ_readout.filled', {share : organPercent(d.b.bladder_fill)});
      info.caption =
          d.b.buoyancy_force > 0 ? t('organ_readout.sinktrieb') : t('organ_readout.auftrieb');
      info.graphic = 'bladder';
      info.fill = d.b.bladder_fill || 0;
      info.series = info.fill;
      info.metrics = [
        metric(t('organ_readout.kraftNachUnten'),
               organNumber(d.b.buoyancy_force, READOUT.force_digits),
               t('organ_readout.positiveWerteZiehenNach2')),
        metric(t('organ_readout.kapazitaet'), organNumber(d.b.bladder_capacity, 2),
               t('organ_readout.mehrBlasengewebeErmoeglichtMehr'))
      ];
    } else if (k === MOTOR_KIND.gland) {
      const h = d.b.hormones;
      info.hero = t('organ_readout.hormone');
      info.caption = t('organ_readout.ausschuettungUndAbbauErbliche');
      info.graphic = 'hormones';
      info.values = h?.levels || Array(HORMONES.levels).fill(0);
      info.metrics = [...Array(HORMONES.levels).keys() ].flatMap(
          c => [metric(hormoneName(h, c), organNumber(h?.levels?.[c], READOUT.digits)),
                metric(t('organ_readout.ausschuettungAbbau'), t('units.ratio', {
                         a : organNumber(h?.secretion?.[c], READOUT.digits),
                         b : organNumber(h?.binding?.[c], READOUT.digits)
                       }))]);
    } else {
      info.hero = t('organ_readout.hautfarbe');
      info.caption = t('organ_readout.gemitteltePigmentaktivitaetFarbeVeraendert');
      info.graphic = 'color';
      info.values = d.p.slice(FISH.red, FISH.blue + 1);
      info.metrics = [ metric(t('organ_readout.pigmentbildung'), organPercent(u),
                              t('organ_readout.dieZellenGebenFarbpigment')) ];
    }
  } else {
    if (k === SENSE_KIND.light) {
      const points =
                [
                  -radians(TUNING.visual_width_max), radians(TUNING.visual_width_max),
                  ...rec.flatMap(r => [r[RECEPTOR.view_left], r[RECEPTOR.view_right]])
                ].sort((a, b) => a - b),
            coverage = Object.keys(RGB).map(() => 0);
      for (let i = 1; i < points.length; i++) {
        const mid = (points[i - 1] + points[i]) / 2;
        for (let c = 0; c < coverage.length; c++) {
          let peak = 0;
          for (const r of rec)
            if (mid >= r[RECEPTOR.view_left] && mid <= r[RECEPTOR.view_right]) {
              const share = members
                                .filter(m => m.n[NEURON.index] === r[RECEPTOR.neuron] &&
                                             m.part.key === SENSE_TISSUE.light)
                                .reduce((s, m) => s + m.part.share * m.n[NEURON.strength], 0);
              peak = Math.max(peak, Math.min(1, share) * (r[RECEPTOR.spectrum]?.[c] || 0));
            }
          coverage[c] += (points[i] - points[i - 1]) * peak / (2 * VISION.half_view * Math.PI);
        }
      }
      Object.assign(info, eyeSight(d.b.visual_image, d.b.visual_samples, rec, side));
      info.hero = t('organ_readout.sehbild');
      info.caption = t('organ_readout.anatomischerAugenpunktLichtAm');
      info.values = coverage;
      info.metrics = [
        metric(t('organ_readout.rotempfindlicheAbdeckung'),
               t('organ_readout.ofView', {share : organPercent(coverage[0])}),
               t('organ_readout.geometrischeAbdeckungMitRotempfindlichkeit')),
        metric(t('organ_readout.blickrichtungen'),
               new Set(rec.map(r => Math.round(degrees(r[RECEPTOR.angle])))).size,
               t('organ_readout.unterschiedlicheAusrichtungenDerSehzellen'))
      ];
    } else if (k === SENSE_KIND.odor) {
      const values = Array.from(
                {length : scentNames.length},
                (_, i) => members.reduce(
                              (s, {n, part}) =>
                                  s + part.share * n[NEURON.strength] *
                                          brainScentWeights(n, d.receptors.get(n[NEURON.index]))[i],
                              0) /
                          Math.max(TOLERANCE.negligible, weight)),
            best = values.indexOf(Math.max(...values));
      info.hero = scentNames[best];
      info.caption = tissue.variant === BARBEL ? t('organ_readout.duftreizUndVorliebeSediment')
                                               : (d.b.body_profile?.smell_sites >= 2
                                                      ? t('organ_readout.duftreizUndVorliebeZwei')
                                                      : t('organ_readout.duftreizUndVorliebeEine'));
      info.graphic = 'scent';
      info.values = values;
      info.odors = d.b.nose_samples?.[side]?.slice(NOSE_SAMPLE.odor) || [];
      info.metrics = [
        metric(t('organ_readout.empfindlichkeitDafuer'), organPercent(values[best]),
               t('organ_readout.hoheWerteBedeutenDass')),
        response
      ];
    } else if (tissue.variant === GRAVITY) {
      // Which posture weighs the hairs down most: head, flank or tail direction of the mean hair.
      const hair = rec.reduce((sum, r) => sum + Math.abs(r[RECEPTOR.mechanical_angle] || 0), 0) /
                   Math.max(1, rec.length);
      info.hero =
          t('organ_readout.gravityReports.' +
            GRAVITY_POSTURES[Math.min(GRAVITY_POSTURES.length - 1,
                                      Math.floor(hair / Math.PI * GRAVITY_POSTURES.length))] +
            (side ? '' : 'Other'));
      info.caption = t('organ_readout.haarzellenWiegenDieSchwerkraft');
      info.graphic = 'gravity';
      info.receptors = rec;
      info.metrics = [
        metric(
            t('organ_readout.koerperlage'),
            t('units.degrees', {n : organNumber(degrees(Math.asin(Math.sin(d.p[FISH.angle]))), 0)}),
            t('organ_readout.koerperlageHint')),
        response
      ];
    } else if (k === SENSE_KIND.flow) {
      info.hero = t('units.pxPerStep', {n : organNumber(d.p[FISH.relative_speed], 2)});
      info.caption = t('organ_readout.wasserbewegungRelativZurHaut');
      info.graphic = 'direction';
      info.receptors = rec;
      info.metrics = [
        metric(t('organ_readout.drehungGerade'),
               t('units.degPerStep', {n : organNumber(degrees(Math.abs(d.b.turn || 0)), 1)}),
               t('organ_readout.auchDrehungenBewegenWasser')),
        response
      ];
    } else if (k === SENSE_KIND.touch) {
      let contact = 0, measured = false;
      for (const r of rec) {
        const value =
            (d.components ??= new Map(
                 (d.b.sensory_components || []).map(row => [row[SENSORY_COMPONENT.neuron], row])))
                .get(r[RECEPTOR.neuron])
                ?.[SENSORY_COMPONENT.senses + SENSE_KIND.touch];
        if (value !== undefined && r[RECEPTOR.senses]?.[SENSE_KIND.touch] > 0) {
          measured = true;
          contact = Math.max(contact, value / r[RECEPTOR.senses][SENSE_KIND.touch]);
        }
      }
      if (!measured) {
        contact = d.b.contact || 0;
        if (d.b.contact_vector) {
          contact = 0;
          for (const r of rec) {
            const angle = d.p[FISH.angle] + (r[RECEPTOR.mechanical_angle] ?? r[RECEPTOR.angle]);
            contact = Math.max(contact, d.b.contact_vector[0] * Math.cos(angle) +
                                            d.b.contact_vector[1] * Math.sin(angle));
          }
        }
      }
      info.hero = contact > 0 ? t('organ_readout.beruehrtEtwas') : t('organ_readout.keinKontakt');
      info.caption = t('organ_readout.beruehrungUndSedimentkontaktDer');
      info.graphic = 'touch';
      info.fill = brainClamp(contact);
      info.metrics = [ response ];
    } else if (k === SENSE_KIND.proximity) {
      info.hero = t('organ_readout.proximity', {share : organPercent(activity)});
      info.caption = t('organ_readout.sichtbareFlaechenEntfernungUnd');
      info.graphic = 'direction';
      info.receptors = rec;
      info.metrics = [ response ];
    } else if (k === SENSE_KIND.intake) {
      info.hero = t('units.energyPerStep', {n : organNumber(d.b.nutrient_flow, 2)});
      info.caption = t('organ_readout.meldetVerwertbareAufnahmeUnmittelbar');
      info.graphic = 'feeding';
      info.series = d.b.nutrient_flow || 0;
      info.metrics = [
        response, metric(t('organ_readout.verwertbareAufnahme'),
                         t('units.energy', {n : organNumber(sceneState.frame.selected_nutrition)}),
                         t('organ_readout.beimSchluckenVerdaulicheEnergie'))
      ];
    } else if (k === SENSE_KIND.damage) {
      info.hero = t('organ_readout.health', {share : organPercent(d.p[FISH.health])});
      info.caption = t('organ_readout.oertlicherGewebeschadenErblicheAdaptation');
      info.graphic = 'health';
      info.fill = d.p[FISH.health];
      info.metrics = [
        metric(t('organ_readout.verbleibendeSchwimmkraft'),
               organPercent(1 - params.wound_weakness * (1 - d.p[FISH.health])),
               t('organ_readout.verletzungenSchwaechenVortriebUnd')),
        response
      ];
      info.series = 1 - d.p[FISH.health];
    } else if (k === SENSE_KIND.gonad_pressure || k === SENSE_KIND.inner_pressure) {
      const targets = [...new Set(rec.map(r => r[RECEPTOR.pressure_kind])) ], names = [
        t('organ_readout.darm'), t('organ_readout.ei'), t('organ_readout.sperma'),
        t('organ_readout.schwimmblase'), t('organ_readout.muskel')
      ];
      info.hero = targets.map(t => names[t]).filter(Boolean).join(' · ');
      info.caption = t('organ_readout.druckAmRaeumlichZugeordneten');
      info.graphic = 'signal';
      info.series = activity;
      info.metrics = [ response ];
    } else if (k === SENSE_KIND.blood) {
      const h = d.b.hormones, names = [
        ...Array.from({length : HORMONES.levels}, (_, c) => hormoneName(h, c)),
        t('organ_readout.reife'), t('organ_readout.reserve')
      ];
      info.hero = t('organ_readout.blut');
      info.caption = t('organ_readout.hormoneReifeUndReserve');
      info.graphic = 'signal';
      info.metrics = [
        response,
        ...names.map(
            (name, c) => metric(
                name,
                organPercent(rec.reduce((sum, r) => sum + (r[RECEPTOR.hormones]?.[c] || 0), 0) /
                             Math.max(1, rec.length))))
      ];
    } else {
      info.hero =
          t('organ_readout.depth', {share : organPercent(d.p[FISH.y] / sceneState.frame.height)});
      info.caption = t('organ_readout.oberflaeche0Beckenboden100');
      info.graphic = 'depth';
      info.fill = d.p[FISH.y] / sceneState.frame.height;
      info.metrics = [
        metric(t('organ_readout.position'),
               t('units.pxOf',
                 {n : organNumber(d.p[FISH.y]), of : organNumber(sceneState.frame.height)})),
        response
      ];
    }
  }
  const hormonal = isMotorTissue(key) ? k === MOTOR_KIND.gland
                                      : k === SENSE_KIND.inner_pressure || k === SENSE_KIND.blood;
  info.metrics = info.metrics.slice(0, hormonal ? HORMONES.levels : 2);
  return info;
}

const initializers = {
  "organHistory" : () => { organHistory = new Map(); },
  "organNumber" : () => { organNumber = (v, d = 1) => formatNumber(Number(v || 0), d); },
  "organPercent" : () => { organPercent = v => percent(brainClamp(v)); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
