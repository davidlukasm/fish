import {
  BARBEL,
  GILL,
  GRAVITY,
  GUT_MUSCLE,
  PELVIC,
  GUT_TISSUE,
  INTERNAL_TISSUE,
  isSenseTissue,
  MOTOR_TISSUE,
  RESERVE_TISSUE,
  SENSE_TISSUE,
  sidedTissue,
  tissueBase,
  tissueKind,
  tissueSide
} from './tissue.js';
import {t, tList} from './strings.js';
import {PRESSURE_SOURCE, TOLERANCE} from './schema.js';
export const body_modelState = {};

const GONAD_TISSUES = [ PRESSURE_SOURCE.eggs, PRESSURE_SOURCE.sperm ].map(
    source => sidedTissue(SENSE_TISSUE.gonad_pressure, source));
export const ORGAN_GROUPS = [
  [
    'body_model.aussensinne',
    [ SENSE_TISSUE.light, SENSE_TISSUE.odor, BARBEL, SENSE_TISSUE.flow, SENSE_TISSUE.proximity ]
  ],
  [ 'body_model.koerpersinne', [ SENSE_TISSUE.touch, SENSE_TISSUE.intake, SENSE_TISSUE.damage ] ],
  [
    'body_model.innensinne',
    [
      GRAVITY, SENSE_TISSUE.bladder_pressure, ...GONAD_TISSUES, SENSE_TISSUE.inner_pressure,
      SENSE_TISSUE.blood
    ]
  ],
  [
    'body_model.motorik',
    [
      MOTOR_TISSUE.forward, MOTOR_TISSUE.turn, PELVIC, MOTOR_TISSUE.bladder, MOTOR_TISSUE.suction,
      MOTOR_TISSUE.aggression, GILL
    ]
  ],
  [
    'body_model.organe',
    [
      GUT_TISSUE, GUT_MUSCLE, RESERVE_TISSUE, MOTOR_TISSUE.eggs, MOTOR_TISSUE.sperm,
      MOTOR_TISSUE.defense
    ]
  ],
  [ 'body_model.steuerung', [ MOTOR_TISSUE.pigment, MOTOR_TISSUE.gland, INTERNAL_TISSUE ] ]
];

const TRAITS = [ 'jaw_length', 'gut_length', 'blunt_teeth', 'undulation' ];
const share = v => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;

export function bodyTraitRows(body, comparison) {
  const names = tList('body_model.traitNames'), words = tList('body_model.traitWords'),
        effects = tList('body_model.traitEffects'), ends = tList('body_model.traitEnds');
  return TRAITS.map((key, i) => {
    const value = share(body?.[key]),
          level = value === null ? -1 : Math.min(2, Math.floor(3 * value));
    return {
      key,
      name : names[i],
      value,
      other : share(comparison?.[key]),
      word : level < 0 ? t('body_model.unbekannt') : words[i][level],
      effect : level < 0 ? '' : effects[i][level],
      ends : ends[i]
    };
  });
}

export function bodySenseGroups(body, comparison) {
  const names = tList('body_model.senseNames'), fillings = tList('body_model.fillingNames');
  const count = (source, key) => {
    const base = tissueBase(key), side = tissueSide(key), k = tissueKind(base);
    const v = side === undefined ? source?.senses?.[k] : source?.fillings?.[Number(side)];
    return Number.isFinite(v) ? v : null;
  };
  const groups = [];
  for (const [title, keys] of ORGAN_GROUPS) {
    const rows = [];
    for (const key of keys.filter(k => isSenseTissue(k))) {
      const base = tissueBase(key), side = tissueSide(key),
            name = side === undefined ? names[tissueKind(base)] : fillings[Number(side)],
            value = count(body, key), other = count(comparison, key);
      if ((value || 0) > 0 || (other || 0) > 0)
        rows.push({key, name, value, other, color : tissueKind(base)});
    }
    if (rows.length)
      groups.push({title : t(title), rows});
  }
  const largest =
      Math.max(TOLERANCE.negligible,
               ...groups.flatMap(g => g.rows.flatMap(r => [r.value || 0, r.other || 0])));
  return {groups, largest};
}

export function bodyMeasures(body, comparison) {
  return [ [ 'radius', 1 ], [ 'mass', 2 ], [ 'aperture', 1 ] ].map(
      ([ key, digits ], i) => ({
        key,
        name : tList('body_model.measureNames')[i],
        unit : tList('body_model.measureUnits')[i],
        digits,
        value : Number.isFinite(body?.[key]) ? body[key] : null,
        other : Number.isFinite(comparison?.[key]) ? comparison[key] : null
      }));
}
