// What a body plan amounts to, as plain rows any view can lay out: the measures, the four build
// traits with a word for where each value lies and what it does, and the sense cells grouped the
// way the Organe tab groups the organs.
import {t, tList} from './strings.js';
import {TOLERANCE} from './schema.js';
export const body_modelState = {};

// Organ groups of similar size: senses outside, at the body and inside, then the organs.
// 's8:1' and 's8:2' are the two gonad pressure senses (eggs, sperm).
export const ORGAN_GROUPS = [
  [ 'body_model.aussensinne', [ 's0', 's1', 'barbel', 's2', 's4' ] ],
  [ 'body_model.koerpersinne', [ 's3', 's5', 's6' ] ],
  [ 'body_model.innensinne', [ 's7', 's8:1', 's8:2', 's9', 's10' ] ],
  [ 'body_model.motorik', [ 'm0', 'm1', 'm8', 'm2', 'm5' ] ],
  [ 'body_model.organe', [ 'gut', 'reserve', 'm3', 'm4', 'm6' ] ],
  [ 'body_model.steuerung', [ 'm7', 'm9', 'internal' ] ]
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

// Cell counts per sense, grouped like ORGAN_GROUPS; the gonad pressure split into eggs and sperm.
export function bodySenseGroups(body, comparison) {
  const names = tList('body_model.senseNames'), fillings = tList('body_model.fillingNames');
  const count = (source, key) => {
    const [base, side] = key.split(':'), k = Number(base.slice(1));
    const v = side === undefined ? source?.senses?.[k] : source?.fillings?.[Number(side)];
    return Number.isFinite(v) ? v : null;
  };
  const groups = [];
  for (const [title, keys] of ORGAN_GROUPS) {
    const rows = [];
    for (const key of keys.filter(k => k[0] === 's')) {
      const [base, side] = key.split(':'),
                   name =
                       side === undefined ? names[Number(base.slice(1))] : fillings[Number(side)],
                   value = count(body, key), other = count(comparison, key);
      if ((value || 0) > 0 || (other || 0) > 0)
        rows.push({key, name, value, other, color : Number(base.slice(1))});
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
