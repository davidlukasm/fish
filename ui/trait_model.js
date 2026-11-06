import {BEHAVIOR_SCALE, HABITAT_ZONE} from './schema.js';
import {format, formatNumber, textArea, tList, percent} from './strings.js';
export const trait_modelState = {};

const SIGNIFICANT = 3, DECIMALS = 2;
const words = () => textArea('trait_model');
const shared = () => evidenceValues({
  darkLight : HABITAT_ZONE.dark_light,
  bottomZone : 1 - HABITAT_ZONE.bottom_zone,
  topZone : HABITAT_ZONE.top_zone,
  strongCurrent : HABITAT_ZONE.strong_current,
  cruising : BEHAVIOR_SCALE.cruising_speed
});

export function traitName(id) { return words().names?.[id] ?? id; }
export function traitGroup(group) { return words().groups?.[group] ?? group; }

const significant = x => formatNumber(Number(x.toPrecision(SIGNIFICANT)), 6);
const capital = s => s ? s[0].toUpperCase() + s.slice(1) : s;

function evidenceValues(values = {}) {
  const out = {};
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      out[key] = value.map(x => formatNumber(x, DECIMALS)).join(' / ');
      out[key + 'Pct'] = value.map(percent).join(' / ');
    } else if (typeof value === 'number') {
      out[key] = formatNumber(value, DECIMALS);
      out[key + 'Pct'] = percent(value);
      out[key + 'Sig'] = significant(value);
      out[key + 'Px'] = formatNumber(BEHAVIOR_SCALE.speed * value, DECIMALS);
      out[key + 'Deg'] = formatNumber(BEHAVIOR_SCALE.turn_degrees * value, DECIMALS);
    } else
      out[key] = value;
  }
  if ('sense' in values)
    out.senseName = tList('trait_model.senseNames')[values.sense];
  if ('scent' in values)
    out.scentName = tList('brain_model.scentNames')[values.scent];
  return out;
}

function measured(key) {
  const [title, unit] = words().measures?.[key] || [ key, '' ];
  return {title : format(title, shared()), unit : unit ? ' ' + unit : ''};
}

function evidenceText(proof) {
  const values = proof?.values || {};
  if (proof?.key === 'measure')
    return format(words().measure,
                  {...measured(values.measure), value : significant(values.value)});
  const own = evidenceValues(values), list = words().lists?.[proof?.key] || {};
  return [
    format(words().evidence?.[proof?.key] ?? '', own),
    ...Object.entries(list)
        .filter(([ name ]) => typeof values[name] === 'number')
        .map(([ name, template ]) => format(template, evidenceValues({n : values[name]})))
  ].filter(Boolean)
      .join(' · ');
}

export function traitEvidence(item) { return (item?.evidence || []).map(evidenceText).join(' · '); }

export function traitNote(id, item) {
  const note = item?.note || {}, values = note.values || {};
  if (note.key === 'parts')
    return capital((values.parts || [])
                       .map(key => format(words().parts?.[key] ?? key,
                                          {...shared(), ...evidenceValues(values.limits?.[key])}))
                       .join('; ')) +
           '.';
  if (note.key === 'interval') {
    const lo = significant(values.lo), hi = values.hi === null ? null : significant(values.hi),
          range = words().interval;
    return format(range.note, {
      ...measured(values.measure),
      interval : hi === null       ? format(range.from, {lo})
                 : values.lo === 0 ? format(range.below, {hi})
                                   : format(range.between, {lo, hi})
    });
  }
  return format(words().notes?.[id] ?? '', {...shared(), ...evidenceValues(values)});
}

export function traitExplanation(id, item) {
  const evidence = traitEvidence(item);
  return traitNote(id, item) + (evidence ? ' · ' + evidence : '');
}
