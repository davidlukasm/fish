// Profiles are measured by the simulation; this module only displays their results.
export const hormoneColors = [ '#d4a0ee', '#77d2bd', '#e9b66d', '#8daded' ];
const organNames = [
  'Vortrieb',       'Drehung links',
  'Drehung rechts', 'Drehung gesamt',
  'Saugen',         'Biss',
  'Abwehr',         'Ei',
  'Sperma',         'Pigment rot',
  'Pigment grün',   'Pigment blau',
  'Blase füllen',   'Blase entleeren',
  'Blase gesamt',   'H1 ausschütten',
  'H2 ausschütten', 'H3 ausschütten',
  'H4 ausschütten', 'H1 abbauen',
  'H2 abbauen',     'H3 abbauen',
  'H4 abbauen'
];
const number = v => Number(v || 0).toLocaleString('de', {maximumSignificantDigits : 3});
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
  bar.title = 'Pegel ' + number(value) + (rest == null ? '' : ' · Ruhepegel ' + number(rest));
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
    rates.title = 'Ausschüttung ↑ · zusätzlicher Abbau ↓';
    row.append(rates);
    const origin = h.names?.[k]?.origin;
    if (origin && species && origin !== species)
      row.append(element('small', 'übernommen von ' +
                                      (all?.find(s => s.id === origin)?.name || '#' + origin)));
    box.append(row);
  }
}
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
  box.replaceChildren(element('h3', 'Hormone'));
  rows(box, h, h, k => box.openHormone?.(k));
}
function effectsChart(host, series, labels, color, title) {
  const indices = labels.map((_, i) => i).filter(i => series.some(s => s?.[i] != null));
  if (!indices.length) {
    host.append(element('p', 'Noch keine abgeschlossene Messung', 'caption'));
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
                        series.map(s => s?.[i] == null ? 'offen' : number(s[i])).join(' / '))
              .join('; '));
  const max = Math.max(1e-9, ...series.flat().filter(v => v != null).map(Math.abs)), zero = 295,
        half = 145;
  g.font = '11px system-ui';
  g.fillStyle = '#a6bac0';
  g.fillText('↑ Pegel erhöht   ↓ Pegel gesenkt', 4, 12);
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
  box.replaceChildren(element('h3', 'Hormone'));
  rows(box, h, h.current?.steps ? h.current : h.lifetime, null, species.id, all);
  const details = element('details');
  details.open = opened;
  details.append(element('summary', 'Wirkung und Auftreten'));
  details.append(element('p',
                         h.samples + ' Individuen · ' + h.rounds + ' Runden · Schritte ' + h.start +
                             '–' + h.end + ' · insgesamt ' + h.total + ' Untersuchungen',
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
      effectsChart(section, [ effects?.[k * 2], effects?.[k * 2 + 1] ], organNames,
                   hormoneColors[k], 'Organansteuerung');
      section.append(element(
          'small', 'Änderung je +0,01 Pegel · beide Arme auf höhere Konzentration bezogen'));
      effectsChart(section, [ [ h.learning?.[k * 2] ], [ h.learning?.[k * 2 + 1] ] ],
                   [ 'Lernwirkung' ], hormoneColors[k],
                   'Einfluss auf den nächsten Gewichtsschritt');
      const contexts = (h.window?.steps ? h.window : h.lifetime)?.contexts || [],
            labels = [ 'Nahrungsaufnahme', 'Verletzung', 'Bewegung', 'Fortpflanzung' ];
      const contextBox = element('div', '', 'hormone-contexts');
      contexts.forEach((ctx, i) => {
        if (ctx.count?.some(n => n < 32))
          return;
        const row = element('div');
        row.append(element('span', labels[i]));
        for (let side = 1; side >= 0; --side) {
          const bar = levelBar(ctx.levels?.[side]?.[k], h.rest?.[k], hormoneColors[k]);
          bar.title = (side ? 'Im Kontext: ' : 'Außerhalb: ') + number(ctx.levels?.[side]?.[k]) +
                      ' · ' + ctx.count[side] + ' Proben';
          row.append(bar);
        }
        contextBox.append(row);
      });
      if (contextBox.childNodes.length) {
        section.append(element('h4', 'Beobachtetes Auftreten'),
                       element('small', 'Oben im Kontext, darunter außerhalb'), contextBox);
      }
      const n = h.names?.[k];
      if (n?.origin)
        section.append(element(
            'p',
            'Namensursprung: ' + (all.find(s => s.id === n.origin)?.name || '#' + n.origin) +
                (n.father ? ' · väterlicher Ursprung #' + n.father : ''),
            'caption'));
      for (const [t, name, profile] of n?.history || []) {
        const past = element('details');
        past.append(element('summary', t + ': ' + name));
        let loaded = false;
        past.ontoggle = () => {
          if (!past.open || loaded || !profile)
            return;
          loaded = true;
          past.append(element('small', profile.samples + ' Individuen · Schritte ' + profile.start +
                                           '–' + profile.end));
          effectsChart(past, [ profile.effects?.[k * 2], profile.effects?.[k * 2 + 1] ], organNames,
                       hormoneColors[k], 'Organansteuerung bei Namensänderung');
          effectsChart(past, [ [ profile.learning?.[k * 2] ], [ profile.learning?.[k * 2 + 1] ] ],
                       [ 'Lernwirkung' ], hormoneColors[k], 'Lernwirkung bei Namensänderung');
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
