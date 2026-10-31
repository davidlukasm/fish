// Traits of a species in words. The server sends trait identifiers, an explanation key and the
// measured evidence as raw values; names, explanations, evidence sentences and number formats
// come from the texts, so every view (desktop, phone, journal) words a trait the same way.
import {format, formatNumber, t, textArea, tList} from './strings.js';
export const trait_modelState = {};

const SIGNIFICANT = 3, DECIMALS = 2;
const words = () => textArea('trait_model');

export function traitName(id) { return words().names?.[id] ?? id; }
export function traitGroup(group) { return words().groups?.[group] ?? group; }

const percent = x => t('units.percent', {n : Math.round(100 * x)});
const significant = x => formatNumber(Number(x.toPrecision(SIGNIFICANT)), 6);
const capital = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// Placeholders of an evidence sentence: {x} a number, {xPct} a share in percent, {xSig} three
// significant digits; lists of values are joined with " / ". Sense and scent indices name
// themselves as {senseName} and {scentName}.
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
    } else
      out[key] = value;
  }
  if ('sense' in values)
    out.senseName = tList('trait_model.senseNames')[values.sense];
  if ('scent' in values)
    out.scentName = tList('trait_model.scentNames')[values.scent];
  return out;
}

function measured(key) {
  const [title, unit] = words().measures?.[key] || [ key, '' ];
  return {title, unit : unit ? ' ' + unit : ''};
}

// One piece of evidence; optional measured parts (listed under "lists") follow when present.
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

// Why a trait applies: its own note, the combined parts, or the measured interval.
export function traitNote(id, item) {
  const note = item?.note || {}, values = note.values || {};
  if (note.key === 'parts')
    return capital((values.parts || []).map(key => words().parts?.[key] ?? key).join('; ')) + '.';
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
  return words().notes?.[id] ?? '';
}

export function traitExplanation(id, item) {
  const evidence = traitEvidence(item);
  return traitNote(id, item) + (evidence ? ' · ' + evidence : '');
}
