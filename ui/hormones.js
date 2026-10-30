import {t, tList} from './strings.js';
// Profiles are measured by the simulation; this module only displays their results.
export const hormoneColors = [ '#d4a0ee', '#77d2bd', '#e9b66d', '#8daded' ];
const number = v =>
    Number(v || 0).toLocaleString(t('units.locale'), {maximumSignificantDigits : 3});
const speciesName = (all, id) =>
    all?.find(s => s.id === id)?.name || t('hormones.speciesNumber', {id});
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
  fill.style.width = 100 * Math.max(0, Math.min(1, value || 0)) + '%';
  fill.style.background = color;
  mark.style.left = 100 * (rest || 0) + '%';
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
  for (let k = 0; k < 4; ++k) {
    const row = element('div', '', 'hormone-row'),
          name = element(open ? 'button' : 'strong', hormoneName(h, k));
    name.style.color = hormoneColors[k];
    if (open)
      name.onclick = () => open(k);
    row.append(name, element('span', h.names?.[k]?.description || '', 'caption'));
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
// One compact row: four small level bars; details open in the species view.
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
  if (box.children.length !== 4) {
    box.replaceChildren();
    for (let k = 0; k < 4; ++k) {
      const chip = element('button', '', 'hormone-chip');
      chip.type = 'button';
      chip.onclick = () => box.openHormone?.(k);
      chip.append(element('small'), levelBar(0, null, hormoneColors[k]));
      box.append(chip);
    }
  }
  for (let k = 0; k < 4; ++k) {
    const chip = box.children[k], [ label, bar ] = chip.children, level = h.levels?.[k] || 0,
          rest = h.rest?.[k];
    label.textContent = hormoneName(h, k);
    label.style.color = hormoneColors[k];
    bar.children[0].style.width = 100 * Math.max(0, Math.min(1, level)) + '%';
    bar.children[1].style.left = 100 * (rest || 0) + '%';
    bar.children[1].hidden = rest == null;
    chip.title = t('hormones.chip', {
      name :
          h.names?.[k]?.description
              ? t('hormones.described', {name : hormoneName(h, k), text : h.names[k].description})
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
  const c = element('canvas'), width = 460, height = 28 + indices.length * 22,
        g = c.getContext('2d');
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
  const max = Math.max(1e-9, ...series.flat().filter(v => v != null).map(Math.abs)), zero = 295,
        half = 145;
  g.font = '11px system-ui';
  g.fillStyle = '#a6bac0';
  g.fillText(t('hormones.pegelErhoehtPegelGesenkt'), 4, 12);
  g.fillText('± ' + number(max), 370, 12);
  g.strokeStyle = '#617d85';
  g.beginPath();
  g.moveTo(zero, 20);
  g.lineTo(zero, height);
  g.stroke();
  indices.forEach((i, row) => {
    const y = 28 + row * 22;
    g.fillStyle = '#d6e4e4';
    g.fillText(labels[i], 4, y + 9);
    series.forEach((s, arm) => {
      if (s?.[i] == null)
        return;
      const v = half * s[i] / max;
      g.fillStyle = color;
      g.globalAlpha = arm ? .45 : 1;
      g.fillRect(Math.min(zero, zero + v), y + arm * 8, Math.max(1, Math.abs(v)), 6);
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
    for (let k = 0; k < 4; ++k) {
      const section = element('section');
      section.dataset.hormone = k;
      section.append(element('h4', hormoneName(h, k)));
      const effects = h.samples ? h.effects : h.lifetime_effects;
      effectsChart(section, [ effects?.[k * 2], effects?.[k * 2 + 1] ],
                   tList('hormones.organNames'), hormoneColors[k], t('hormones.organansteuerung'));
      section.append(element('small', t('hormones.aenderungJe001')));
      effectsChart(section, [ [ h.learning?.[k * 2] ], [ h.learning?.[k * 2 + 1] ] ],
                   [ t('hormones.lernwirkung') ], hormoneColors[k],
                   t('hormones.einflussAufDenNaechsten'));
      const contexts = (h.window?.steps ? h.window : h.lifetime)?.contexts || [], labels = [
        t('hormones.nahrungsaufnahme'), t('hormones.verletzung'), t('hormones.bewegung'),
        t('hormones.fortpflanzung')
      ];
      const contextBox = element('div', '', 'hormone-contexts');
      contexts.forEach((ctx, i) => {
        if (ctx.count?.some(n => n < 32))
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
          effectsChart(past, [ profile.effects?.[k * 2], profile.effects?.[k * 2 + 1] ],
                       tList('hormones.organNames'), hormoneColors[k],
                       t('hormones.organansteuerungBeiNamensaenderung'));
          effectsChart(past, [ [ profile.learning?.[k * 2] ], [ profile.learning?.[k * 2 + 1] ] ],
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
