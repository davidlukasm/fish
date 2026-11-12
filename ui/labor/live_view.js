import {t} from '../strings.js';
import {escapeText} from '../studio/view/markup.js';

export const word = (key, values) => t('labor.live.' + key, values);
const numberFormats = new Map();
export const number = (v, digits = 0) => {
  if (!Number.isFinite(v))
    return '–';
  if (!numberFormats.has(digits))
    numberFormats.set(digits, new Intl.NumberFormat('de-DE', {maximumFractionDigits : digits}));
  return numberFormats.get(digits).format(v);
};
const esc = escapeText;
const button = (action, text, attributes = '') =>
    `<button type="button" data-live-action="${action}" ${attributes}>${text}</button>`;
export function liveShell(breeding, draft, fish) {
  const keys = [ 'brisa', 'start', 'plants', ...(draft ? [ 'draft' ] : []) ];
  return `<div class="fl-station"><header class="fl-header"><button data-action="home">← ${
      t('studio.app.home')}</button><div><small>FISH · ${breeding ? '03' : '04'}</small><h1>${
      word(breeding ? 'breeding' : 'laboratory')}</h1></div><p>${
      word(breeding ? 'breedingPurpose'
                    : 'laborPurpose')}</p><span data-live-status role="status"></span></header>
    <main class="fl-main"><details class="fl-setup" open><summary>${word('setup')}</summary>
    <div class="fl-row"><label>${word('founder')}<select data-live-setting="fish">${
      keys.map(key => `<option value="${key}" ${key === fish ? 'selected' : ''}>${
                   esc(key === 'draft' ? draft.name : t('labor.fish.' + key))}</option>`)
          .join('')}</select></label>
    <label>${
      word(
          'duration')}<input data-live-setting="steps" type="number" min="100" max="100000" step="100" value="8000"></label>
    ${
      breeding
          ? `<label>${
                word(
                    'mutation')}<input data-live-setting="scale" type="text" inputmode="decimal" value="0,3"></label>`
          : ''}
    ${button('start', word('start'), 'class="fl-primary"')}${button('cancel', word('end'))}
    <small>${word(breeding ? 'replicates' : 'realWorld')}</small></div></details>
    <div class="fl-error" role="alert" hidden></div>
    <div class="fl-toolbar"><div class="fl-worlds" data-live-worlds></div><div class="fl-row">${
      button('pause', 'Ⅱ ' + word('pause'))}${button('resume', '▶ ' + word('resume'))}${
      button('step',
             '▷ ' +
                 word('step'))}<label>${word('speed')}<select data-live-speed><option value="30">${
      word('slow')}</option><option value="10" selected>${
      word(
          'normal')}</option><option value="0">${word('fast')}</option></select></label></div></div>
    <div class="fl-metrics" data-live-metrics></div>
    <div class="fl-work"><section class="fl-surface"><div class="fl-surface-head"><h2>${
      word('paths')}</h2><div class="fl-row">${button('fit', word('wholeTank'))}${
      button('deselect', word('deselect'))}<label>${word('trail')}<select data-live-trail>
      <option value="200">200</option><option value="1000" selected>1.000</option><option value="5000">5.000</option>
      <option value="100000">${word('wholeLife')}</option></select></label></div></div>
    <div class="fl-map"><canvas data-live-canvas width="1200" height="600" tabindex="0" aria-label="${
      word('mapLabel')}"></canvas>
    <div class="fl-empty" data-live-empty><strong>${word('readyTitle')}</strong><p>${
      word(breeding ? 'readyBreed' : 'readyLab')}</p></div></div>
    <div class="fl-caption"><span class="fl-key trial">${
      word('interventionPath')}</span><span class="fl-key control">${word('controlPath')}</span>
    <span data-live-caption>${word('mapHelp')}</span></div></section>
    <aside class="fl-cockpit"><h2 data-live-fish-heading>${
      word('population')}</h2><div data-live-fish-values></div>
    <p data-live-selection-hint>${word('selectHint')}</p><fieldset data-live-controls disabled>
    ${
      breeding
          ? `<h3>${word('support')}</h3>${button('reward', word('reward'))}<p>${
                word('rewardNote')}</p>${button('export', word('export'))}`
          : `<h3>${word('control')}</h3><div class="fl-keys">${
                button('forward', '↑ ' + word('forward'))}${button('left', '← ' + word('left'))}${
                button('hold-turn',
                       '○ ' + word('holdTurn'))}${button('right', word('right') + ' →')}</div>
      <div class="fl-row">${button('open-mouth', word('openMouth'))}${
                button('close-mouth', word('closeMouth'))}</div>
      ${button('clear', word('brain'), 'class="fl-brain"')}<h3>${word('automatic')}</h3>
      <label>${word('target')}<select data-live-axis="leaves"><option value="0">${
                word(
                    'flakes')}</option><option value="1">${word('leaves')}</option></select></label>
      ${
                    ['auto-turn', 'auto-forward', 'auto-mouth', 'energy']
                        .map(axis => `<label><span>${
                                 word(axis === 'energy'
                                          ? 'energyHold'
                                          : axis)}</span><input type="checkbox" data-live-axis="${
                                 axis}"></label>`)
                        .join('')}
      <h3>${word('functions')}</h3><div class="fl-row">${button('egg', word('egg'))}${
                button('sperm', word('sperm'))}</div>
      ${
                    ['vision', 'odor']
                        .map(axis => `<label><span>${
                                 word(axis === 'energy'
                                          ? 'energyHold'
                                          : axis)}</span><input type="checkbox" data-live-axis="${
                                 axis}" checked></label>`)
                        .join('')}
      <p data-live-energy></p><p data-live-cell-count></p>${button('export', word('export'))}`}
    </fieldset>${
      breeding
          ? ''
          : `<h3>${word('causal')}</h3>${button('compare', word('compare'))}${
                button('end-compare',
                       word('endCompare'))}<p data-live-comparison>${word('comparisonNote')}</p>`}
    <div data-live-interventions></div></aside></div>
    <section class="fl-history"><div class="fl-row"><h2>${
      word('signals')}</h2><span data-live-time></span>${
      button(
          'live',
          word(
              'live'))}</div><input data-live-time-slider type="range" min="0" max="1" value="1" aria-label="${
      word('time')}">
    <div data-live-tracks></div><p class="fl-muted">${word('sampling')}</p></section>
    <section class="fl-history"><div class="fl-row"><h2>${
      word('lives')}</h2><span class="fl-muted">${word('lifeHelp')}</span></div>
    <div data-live-lifelines class="fl-lifelines"></div></section>
    ${
      breeding ? `<section class="fl-history"><div class="fl-row"><h2>${
                     word('selection')}</h2><span data-live-generation></span></div>
    <p class="fl-muted">${word('fitness')}</p><div class="fl-table-wrap" data-live-ranking></div>
    <div class="fl-row">${button('next-best', word('bestParents'), 'class="fl-primary" disabled')}${
                     button('next-selected', word('selectedParents'), 'disabled')}</div>
    <div data-live-generations></div></section>`
               : ''}</main></div>`;
}

export function metricCards(world) {
  const state = world?.state, fish = state?.fish ?? [],
        lives = (world?.lives ?? []).filter(l => l.world === 'trial');
  const values = [
    [ 'step', state?.step ], [ 'swimmers', fish.filter(p => p.hatched).length ],
    [ 'eggs', fish.filter(p => !p.hatched).length ],
    [ 'generation', fish.length ? Math.max(...fish.map(p => p.generation)) : 0 ],
    [ 'intake', lives.reduce((s, p) => s + p.intake, 0) ],
    [ 'selfFeeding', lives.filter(p => p.generation > 0 && p.firstIntake != null).length ]
  ];
  return values
      .map(([ key, value ]) =>
               `<div><small>${word(key)}</small><strong>${number(value)}</strong></div>`)
      .join('');
}

export function lifeLines(lives, end, selected, cursor) {
  const shown =
            lives.filter(l => l.world === 'trial').sort((a, b) => a.start - b.start || a.id - b.id),
        width = 1100, left = 90, right = 65, span = width - left - right, row = 24,
        x = t => left + span * t / Math.max(1, end),
        positions = new Map(shown.map((l, i) => [l.id, 44 + i * row])),
        family =
            new Set(shown.filter(l => l.parent === selected || l.id === selected).map(l => l.id));
  const selectedLife = shown.find(l => l.id === selected);
  if (selectedLife)
    family.add(selectedLife.parent);
  return `<svg viewBox="0 0 ${width} ${
      Math.max(100, shown.length * row + 65)}" role="img" aria-label="${word('lives')}">
    ${
          [0, .25, .5, .75, 1]
              .map(f => `<text x="${x(f * end)}" y="15" text-anchor="middle">${
                       number(f * end)}</text><path class="fl-grid" d="M${x(f * end)} 22V${
                       shown.length * row + 50}"/>`)
              .join('')}
    <path class="fl-time-mark" d="M${x(cursor)} 22V${shown.length * row + 50}"/>
    ${
      shown
          .map(l => {
            const y = positions.get(l.id), from = x(l.hatch ?? l.start), to = x(l.death ?? end),
                  isSelected = l.id === selected, kin = family.has(l.id),
                  parent = positions.get(l.parent);
            return `<g data-live-fish="${l.id}" class="fl-life ${isSelected ? 'selected' : ''} ${
                kin ? 'kin' : ''}" tabindex="0" role="button" aria-label="${word('fishNumber', {
              id : l.id
            })}">
      <rect x="0" y="${y - 10}" width="${width}" height="23" fill="transparent"/>
      <text x="5" y="${y + 4}">#${l.id} · G${l.generation}</text>${
                parent != null
                    ? `<path class="fl-parent" d="M${x(l.start)} ${parent}V${y}H${from}"/>`
                    : ''}
      <path class="fl-egg-life" d="M${x(l.start)} ${y}H${from}"/><path class="fl-life-bar" d="M${
                from} ${y}H${to}"/>
      <circle cx="${from}" cy="${y}" r="3"/>${
                l.firstIntake != null
                    ? `<circle class="fl-first-meal" cx="${x(l.firstIntake)}" cy="${y}" r="4"/>`
                    : ''}
      ${l.death != null ? `<path class="fl-death" d="M${to - 4} ${y - 4}l8 8m-8 0l8 -8"/>` : ''}
      <text x="${Math.min(width - 42, to + 8)}" y="${y + 4}">${
                l.death != null ? number(l.death) : word('alive')}</text></g>`;
          })
          .join('')}</svg>`;
}

function envelope(points, key, limit = 800) {
  if (points.length <= limit)
    return points;
  const sampled = [], size = Math.ceil(points.length / (limit / 2));
  for (let i = 0; i < points.length; i += size) {
    const bucket = points.slice(i, i + size);
    let low = bucket[0], high = bucket[0];
    for (const point of bucket) {
      if (point[key] < low[key])
        low = point;
      if (point[key] > high[key])
        high = point;
    }
    sampled.push(...(low.t < high.t ? [ low, high ] : [ high, low ]));
  }
  return sampled;
}
function plot(points, key, end, cursor, color, maximum = null) {
  const valid = points.filter(p => Number.isFinite(p[key]) && p.t <= end), w = 1000, h = 80,
        top = maximum ?? Math.max(1, ...valid.map(p => p[key])),
        x = t => 44 + (w - 60) * t / Math.max(1, end), y = v => 66 - 54 * v / top;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${
      word(key)}"><path class="fl-grid" d="M44 12H984M44 66H984"/>
    <text x="0" y="16">${
      number(
          top,
          1)}</text><text x="0" y="70">0</text><path class="fl-time-mark" d="M${x(cursor)} 8V70"/>
    <polyline fill="none" stroke="${color}" stroke-width="2" points="${
      envelope(valid, key).map(p => `${x(p.t)},${y(p[key])}`).join(' ')}"/></svg>`;
}
export function tracks(trace, end, cursor, samples = []) {
  const points = trace?.points ?? [], entries = points.length ?
      [['energy', '#e4c987', null], ['gut', '#a9d1a0', 1], ['leaf', '#a1c5d6', null], ['yolk', '#dcaa7e', null], ['pain', '#e8a199', 1]] :
      [['fish', '#a9d1a0', null], ['reserve', '#e4c987', null]];
  const data = points.length ? points : samples.map(s => ({...s, t : s.step}));
  return entries
             .map(([ key, color, max ]) => `<div class="fl-track"><strong>${word(key)}</strong>${
                      plot(data, key, end, cursor, color, max)}<output>${
                      number(data.filter(p => p.t <= cursor).at(-1)?.[key], 1)}</output></div>`)
             .join('') +
         (points.length ? eventLanes(trace.events ?? [], end, cursor) : '');
}
export function eventLanes(events, end, cursor) {
  const lanes = [ [ 'intake', 'firstIntake' ], [ 'close' ], [ 'full', 'emptying', 'laid' ] ],
        colors = [ '#b5d9a5', '#e3ad91', '#9ecbdf' ];
  return `<svg class="fl-events" viewBox="0 0 1100 90" role="img" aria-label="${word('events')}">${
      lanes
          .map((kinds, row) => {
            const bins = new Map();
            for (const event of events.filter(e => kinds.includes(e.kind) && e.t <= cursor)) {
              const bin = Math.floor(940 * event.t / Math.max(1, end) / 28);
              bins.set(bin, (bins.get(bin) ?? 0) + 1);
            }
            return `<text x="0" y="${20 + row * 28}">${word('event' + row)}</text>` +
                   [...bins ]
                       .map(([ bin, count ]) =>
                                `<g fill="${colors[row]}"><circle cx="${140 + bin * 28}" cy="${
                                    16 + row * 28}" r="4"/><text x="${147 + bin * 28}" y="${
                                    20 + row * 28}">${count > 1 ? count : ''}</text></g>`)
                       .join('');
          })
          .join('')}</svg>`;
}
export function candidateTable(rows, parents) {
  return `<table><thead><tr>${
          ['parent', 'candidate', 'mutation', 'world1', 'world2', 'fitnessColumn', 'mealAge']
              .map(k => `<th>${word(k)}</th>`)
              .join('')}</tr></thead><tbody>${
      rows.map(r => `<tr><td><input type="checkbox" data-live-parent="${esc(r.id)}" ${
                   parents.has(r.id)
                       ? 'checked'
                       : ''} ${r.viable ? '' : 'disabled'} aria-label="${word('selectParent', {
                 id : r.id
               })}"></td>
      <td><strong>${esc(r.id)}</strong><small>${esc(r.family)} · ${
                   r.viable ? (r.tested ? word('tested') : word('provisional'))
                            : word('notViable')}</small></td>
      <td>${number(r.mutation, 2)}</td><td>${number(r.fed[0])}</td><td>${
                   number(r.fed[1])}</td><td><strong>${number(r.score, 1)}</strong></td><td>${
                   number(r.mealAge)}</td></tr>`)
          .join('')}</tbody></table>`;
}
