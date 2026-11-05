import {cssPercent, t, textArea, tList} from './strings.js';
import {HORMONE_CONTEXT, HORMONES, TOLERANCE} from './schema.js';
// Profiles are measured by the simulation; this module only displays their results.
export const hormoneColors = [ '#d4a0ee', '#77d2bd', '#e9b66d', '#8daded', '#ee9f9a', '#b8d47a' ];
// A blood substance's colour: a hormone's own, BODY_SIGNAL for the body's signals (maturity and
// the energy reserve).
const BODY_SIGNAL_COLOR = '#b7d3c9';
export const substanceColor = index => hormoneColors[index] ?? BODY_SIGNAL_COLOR;
// Effect charts: WIDTH wide, a HEAD and one ROW per organ; bars grow from ZERO by up to HALF,
// one BAR high per arm, the lowering arm at LOWERED opacity. Contexts show after
// CONTEXT_SAMPLES samples on both sides.
const HORMONE_CHART = Object.freeze({
  width : 460,
  head : 28,
  row : 22,
  zero : 295,
  half : 145,
  font : '11px system-ui',
  ink : '#a6bac0',
  axis : '#617d85',
  label : '#d6e4e4',
  margin : 4,
  title_y : 12,
  scale_x : 370,
  axis_top : 20,
  label_y : 9,
  arm_step : 8,
  bar : 6,
  lowered : .45,
  context_samples : 32
});
// The arm of hormone k raising (sign 0) or lowering (sign 1) it.
const arm = (k, sign) => k * HORMONES.signs + sign;
const number = v =>
    Number(v || 0).toLocaleString(t('units.locale'), {maximumSignificantDigits : 3});
const speciesName = (all, id) =>
    all?.find(s => s.id === id)?.name || t('hormones.speciesNumber', {id});
// What a hormone does, from the suffix of its name ("propulsivum": drives swimming).
export function hormoneEffect(h, k) {
  return textArea('hormones').effects?.[h?.names?.[k]?.suffix] || '';
}
export function hormoneName(h, k) {
  const n = h?.names?.[k];
  return n?.suffix && n?.history?.length ? [ n.stem, n.suffix ].filter(Boolean).join(' ')
                                         : 'H' + (k + 1);
}
function element(tag, text = '', cls = '') {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls)
    e.className = cls;
  return e;
}
function levelBar(value, rest, color) {
  const bar = element('span', '', 'hormone-level'), fill = element('i'), mark = element('b');
  fill.style.width = cssPercent(Math.max(0, Math.min(1, value || 0)));
  fill.style.background = color;
  mark.style.left = cssPercent(rest || 0);
  mark.hidden = rest == null;
  bar.append(fill, mark);
  bar.title = rest == null ? t('hormones.level', {n : number(value)})
                           : t('hormones.levelRest', {n : number(value), rest : number(rest)});
  bar.setAttribute('role', 'meter');
  bar.setAttribute('aria-valuenow', value || 0);
  bar.setAttribute('aria-valuemin', 0);
  bar.setAttribute('aria-valuemax', 1);
  return bar;
}
function rows(box, h, state, open, species, all) {
  for (let k = 0; k < HORMONES.levels; ++k) {
    const row = element('div', '', 'hormone-row'),
          name = element(open ? 'button' : 'strong', hormoneName(h, k));
    name.style.color = hormoneColors[k];
    if (open)
      name.onclick = () => open(k);
    row.append(name, element('span', hormoneEffect(h, k), 'caption'));
    row.append(levelBar(state?.levels?.[k], h.rest?.[k], hormoneColors[k]),
               element('span', number(state?.levels?.[k])));
    const rates = element(
        'span', '↑ ' + number(state?.secretion?.[k]) + '   ↓ ' + number(state?.binding?.[k]),
        'hormone-rates');
    rates.title = t('hormones.ausschuettungZusaetzlicherAbbau');
    row.append(rates);
    const origin = h.names?.[k]?.origin;
    if (origin && species && origin !== species)
      row.append(element('small', t('hormones.adoptedFrom', {name : speciesName(all, origin)})));
    box.append(row);
  }
}
// One compact row: a small level bar per hormone; details open in the species view.
export function renderIndividualHormones(box, h, open) {
  if (!box)
    return;
  box.hidden = !h;
  if (!h)
    return;
  box.openHormone = open;
  const signature = JSON.stringify(h);
  if (box.hormoneSignature === signature)
    return;
  box.hormoneSignature = signature;
  if (box.children.length !== HORMONES.levels) {
    box.replaceChildren();
    for (let k = 0; k < HORMONES.levels; ++k) {
      const chip = element('button', '', 'hormone-chip');
      chip.type = 'button';
      chip.onclick = () => box.openHormone?.(k);
      chip.append(element('small'), levelBar(0, null, hormoneColors[k]));
      box.append(chip);
    }
  }
  for (let k = 0; k < HORMONES.levels; ++k) {
    const chip = box.children[k], [ label, bar ] = chip.children, level = h.levels?.[k] || 0,
          rest = h.rest?.[k];
    label.textContent = hormoneName(h, k);
    label.style.color = hormoneColors[k];
    bar.children[0].style.width = cssPercent(Math.max(0, Math.min(1, level)));
    bar.children[1].style.left = cssPercent(rest || 0);
    bar.children[1].hidden = rest == null;
    chip.title = t('hormones.chip', {
      name : hormoneEffect(h, k)
                 ? t('hormones.described', {name : hormoneName(h, k), text : hormoneEffect(h, k)})
                 : hormoneName(h, k),
      level : rest == null ? number(level)
                           : t('hormones.withRest', {n : number(level), rest : number(rest)}),
      up : number(h.secretion?.[k]),
      down : number(h.binding?.[k])
    });
  }
}
function effectsChart(host, series, labels, color, title) {
  const indices = labels.map((_, i) => i).filter(i => series.some(s => s?.[i] != null));
  if (!indices.length) {
    host.append(element('p', t('hormones.nochKeineAbgeschlosseneMessung'), 'caption'));
    return;
  }
  const C = HORMONE_CHART, c = element('canvas'), width = C.width,
        height = C.head + indices.length * C.row, g = c.getContext('2d');
  c.width = width;
  c.height = height;
  c.style.width = '100%';
  c.setAttribute('role', 'img');
  c.setAttribute(
      'aria-label',
      title + ': ' +
          indices
              .map(i => labels[i] + ' ' +
                        series.map(s => s?.[i] == null ? t('hormones.open') : number(s[i]))
                            .join(' / '))
              .join('; '));
  const max = Math.max(TOLERANCE.negligible, ...series.flat().filter(v => v != null).map(Math.abs)),
        zero = C.zero;
  g.font = C.font;
  g.fillStyle = C.ink;
  g.fillText(t('hormones.pegelErhoehtPegelGesenkt'), C.margin, C.title_y);
  g.fillText('± ' + number(max), C.scale_x, C.title_y);
  g.strokeStyle = C.axis;
  g.beginPath();
  g.moveTo(zero, C.axis_top);
  g.lineTo(zero, height);
  g.stroke();
  indices.forEach((i, row) => {
    const y = C.head + row * C.row;
    g.fillStyle = C.label;
    g.fillText(labels[i], C.margin, y + C.label_y);
    series.forEach((s, sign) => {
      if (s?.[i] == null)
        return;
      const v = C.half * s[i] / max;
      g.fillStyle = color;
      g.globalAlpha = sign ? C.lowered : 1;
      g.fillRect(Math.min(zero, zero + v), y + sign * C.arm_step, Math.max(1, Math.abs(v)), C.bar);
    });
    g.globalAlpha = 1;
  });
  host.append(c);
}
export function renderSpeciesHormones(box, species, all = []) {
  if (!box)
    return;
  const h = species?.hormones;
  box.hidden = !h;
  if (!h)
    return;
  const signature = JSON.stringify([ species.id, h ]);
  if (box.hormoneSignature === signature)
    return;
  const opened = box.querySelector?.('details')?.open || false;
  box.hormoneSignature = signature;
  box.replaceChildren(element('h3', t('hormones.hormone')));
  rows(box, h, h.current?.steps ? h.current : h.lifetime, null, species.id, all);
  const details = element('details');
  details.open = opened;
  details.append(element('summary', t('hormones.wirkungUndAuftreten')));
  details.append(element(
      'p',
      t('hormones.study',
        {samples : h.samples, rounds : h.rounds, start : h.start, end : h.end, total : h.total}),
      'caption'));
  let populated = false;
  const populate = () => {
    if (!details.open || populated)
      return;
    populated = true;
    for (let k = 0; k < HORMONES.levels; ++k) {
      const section = element('section');
      section.dataset.hormone = k;
      section.append(element('h4', hormoneName(h, k)));
      const effects = h.samples ? h.effects : h.lifetime_effects;
      effectsChart(section, [ effects?.[arm(k, 0)], effects?.[arm(k, 1)] ],
                   tList('hormones.organNames'), hormoneColors[k], t('hormones.organansteuerung'));
      section.append(element('small', t('hormones.aenderungJe001')));
      effectsChart(section, [ [ h.learning?.[arm(k, 0)] ], [ h.learning?.[arm(k, 1)] ] ],
                   [ t('hormones.lernwirkung') ], hormoneColors[k],
                   t('hormones.einflussAufDenNaechsten'));
      const contexts = (h.window?.steps ? h.window : h.lifetime)?.contexts || [],
            labels = Object.keys(HORMONE_CONTEXT).map(c => t('hormones.contexts.' + c));
      const contextBox = element('div', '', 'hormone-contexts');
      contexts.forEach((ctx, i) => {
        if (ctx.count?.some(n => n < HORMONE_CHART.context_samples))
          return;
        const row = element('div');
        row.append(element('span', labels[i]));
        for (let side = 1; side >= 0; --side) {
          const bar = levelBar(ctx.levels?.[side]?.[k], h.rest?.[k], hormoneColors[k]);
          bar.title = t(side ? 'hormones.inContext' : 'hormones.outside',
                        {n : number(ctx.levels?.[side]?.[k]), samples : ctx.count[side]});
          row.append(bar);
        }
        contextBox.append(row);
      });
      if (contextBox.childNodes.length) {
        section.append(element('h4', t('hormones.beobachtetesAuftreten')),
                       element('small', t('hormones.obenImKontextDarunter')), contextBox);
      }
      const n = h.names?.[k];
      if (n?.origin)
        section.append(element('p',
                               n.father
                                   ? t('hormones.nameOriginFather',
                                       {name : speciesName(all, n.origin), father : n.father})
                                   : t('hormones.nameOrigin', {name : speciesName(all, n.origin)}),
                               'caption'));
      for (const [time, name, profile] of n?.history || []) {
        const past = element('details');
        past.append(element('summary', t('hormones.pastName', {time, name})));
        let loaded = false;
        past.ontoggle = () => {
          if (!past.open || loaded || !profile)
            return;
          loaded = true;
          past.append(element(
              'small', t('hormones.pastStudy',
                         {samples : profile.samples, start : profile.start, end : profile.end})));
          effectsChart(past, [ profile.effects?.[arm(k, 0)], profile.effects?.[arm(k, 1)] ],
                       tList('hormones.organNames'), hormoneColors[k],
                       t('hormones.organansteuerungBeiNamensaenderung'));
          effectsChart(past,
                       [ [ profile.learning?.[arm(k, 0)] ], [ profile.learning?.[arm(k, 1)] ] ],
                       [ t('hormones.lernwirkung') ], hormoneColors[k],
                       t('hormones.lernwirkungBeiNamensaenderung'));
        };
        section.append(past);
      }
      details.append(section);
    }
  };
  details.ontoggle = populate;
  populate();
  box.append(details);
}
