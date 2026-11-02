import {tracePath} from './path_data.js';
import {FOOD_SLOT, foodAmounts, foodKindOf} from './nutrition_model.js';
import {compactNumber, formatNumber, percent, t, tList} from './strings.js';
import {brainClamp} from './brain.js';
import {el} from './dom.js';
import {DEATH_REASON, FOOD_KIND, indexedBy, RATE_WINDOW, TOLERANCE} from './schema.js';
import {KEY} from './keys.js';
export const feeding_viewState = {};
export let deathNames;

// One symbol (24 × 24 SVG path) and colour per cause of death.
export const DEATH_COLORS = indexedBy(DEATH_REASON, {
  hunger : '#d3bb72',
  injury : '#e08a7d',
  unfertilised : '#b9a3c9',
  failed_development : '#7fc4c0',
  brain_budget : '#8fb4d8',
  eaten_egg : '#d9a06f',
  age : '#a8b3b5',
  disease : '#9cc47e'
});
const DEATH_ICONS = indexedBy(DEATH_REASON, {
  hunger : 'M6 4v7a3 3 0 0 0 6 0V4M9 4v16M17 4c-2 3-2 7 0 9v7',
  injury : 'M13 2L6 13h5l-2 9 8-12h-5z',
  unfertilised : 'M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11zM9 11l6 6M15 11l-6 6',
  failed_development : 'M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11zM8 12l3 2-2 3 4 2',
  brain_budget :
      'M8 5a4 4 0 0 0-3 7 4 4 0 0 0 4 7h6a4 4 0 0 0 4-7 4 4 0 0 0-3-7 3 3 0 0 0-8 0zM12 5v14',
  eaten_egg : 'M9 4c3 0 5 4 5 8a5 5 0 0 1-10 0c0-4 2-8 5-8zM14 9l7-3v12l-7-3',
  age : 'M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9',
  disease :
      'M12 7a5 5 0 1 0 .01 0M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19'
});

// The cause as symbol and short name, coloured; the full count or note goes into the title.
export function deathBadge(cause, extra = '') {
  const badge = document.createElement('span');
  badge.className = 'death-badge';
  badge.style.color = DEATH_COLORS[cause];
  badge.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="' +
      DEATH_ICONS[cause] +
      '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const label = document.createElement('span');
  label.textContent = deathNames[cause] + extra;
  badge.append(label);
  return badge;
}

export function fishStat(key, label, value, note = '') {
  let cell = feeding_viewState.fishStatCells.get(key);
  if (!cell) {
    const box = document.createElement('div'), dt = document.createElement('dt'),
          dd = document.createElement('dd'), small = document.createElement('small');
    box.appendChild(dt);
    box.appendChild(dd);
    box.appendChild(small);
    el('fish-vitals').appendChild(box);
    cell = {box, dt, dd, small};
    feeding_viewState.fishStatCells.set(key, cell);
  }
  if (cell.gauge)
    cell.gauge.hidden = true;
  cell.epoch = feeding_viewState.fishStatEpoch;
  cell.box.hidden = false;
  cell.dt.textContent = label;
  cell.dd.textContent = value;
  cell.dt.title = note;
  cell.dd.title = String(value) + (note ? ' · ' + note : '');
  cell.small.textContent = '';
}

export function fishGauge(key, value, color) {
  const cell = feeding_viewState.fishStatCells.get(key);
  if (!cell)
    return;
  if (!cell.gauge) {
    cell.gauge = document.createElement('meter');
    cell.gauge.min = 0;
    cell.gauge.max = 1;
    cell.gauge.className = 'vital-gauge';
    cell.box.appendChild(cell.gauge);
  }
  cell.gauge.hidden = false;
  cell.gauge.value = brainClamp(value);
  cell.gauge.setAttribute('aria-label', cell.dt.textContent + ' ' + percent(brainClamp(value)));
  cell.gauge.style.setProperty?.('--gauge-color', color);
}

export let foodSources;

export let foodShortNames;

// One colour per food display slot.
export const FOOD_COLORS = indexedBy(FOOD_SLOT, {
  feed : '#e8ba78',
  fish : '#db8c7b',
  egg : '#c6a2df',
  carrion : '#a78b93',
  algae : '#69bba0',
  plant : '#9fc96a',
  drift : '#75b9bb',
  plankton : '#bdcc85',
  worm : '#da8d86',
  crab : '#b9a07a',
  mussel : '#8aabb8',
  benthic : '#a49370'
});

export let habitatSources;

// Feeding and habitat icons around their centre, about 20 units wide, keyed by food display slot
// or habitat name. Each part is one stroked (or filled) path (see path_data.js) plus full
// circles [x, y, r], optionally with its own line width, opacity, rotation, scale and vertical
// offset.
const ICON_FISH = 'M-6 0C-1 -5 4 -4 7 0C4 4 -1 5 -6 0L-10 4L-10 -4Z',
      ICON_BLADES = 'M-3 6Q-4 -1 -5 -7M0 6Q-2 -1 0 -7M3 6Q0 -1 5 -7',
      ICON_GRASS = [ {path : ICON_BLADES}, {path : 'M-9 7L9 7', alpha : .6} ];
const ECOLOGY_ICONS = Object.freeze({
  [FOOD_SLOT.feed] : [ {fill : true, circles : [ [ -4, -3, 2 ], [ 4, -1, 2.6 ], [ -1, 5, 1.7 ] ]} ],
  [FOOD_SLOT.fish] : [ {fill : true, path : ICON_FISH} ],
  [FOOD_SLOT.egg] : [ {ellipse : [ 0, 0, 4, 6, -.3 ]}, {fill : true, circles : [ [ 0, 1, 1.4 ] ]} ],
  [FOOD_SLOT.carrion] : [
    {path : 'M-8 0L8 0M-4 -4L-2 0L-4 4M0 -4L2 0L0 4M4 -4L6 0L4 4', circles : [ [ 8, 0, 2.5 ] ]}
  ],
  [FOOD_SLOT.algae] : [ {path : 'M-9 5L9 5'}, {path : 'M-8 2Q-4 -2 0 1Q4 3 8 0', width : 3} ],
  [FOOD_SLOT.plant] : ICON_GRASS,
  [FOOD_SLOT.drift] : [ {path : ICON_BLADES, rotate : -1} ],
  [FOOD_SLOT.plankton] :
      [ {fill : true, circles : [ [ -5, -3, 1.5 ], [ 3, -4, 2 ], [ 0, 4, 1.7 ] ]} ],
  [FOOD_SLOT.worm] : [ {path : 'M-8 3C-3 -8 3 8 8 -3'} ],
  [FOOD_SLOT.crab] : [
    {fill : true, circles : [ [ 0, 0, 4 ] ]},
    {path : 'M-3 -2L-8 -5M-4 0L-9 1M-3 2L-8 5M3 -2L8 -5M4 0L9 1M3 2L8 5'}
  ],
  [FOOD_SLOT.mussel] : [ {
    path : 'M-7 1C-7 -2.87 -3.87 -6 0 -6C3.87 -6 7 -2.87 7 1L5 5L-5 5ZM0 4L-4 -3M0 4L0 -3M0 4L4 -3'
  } ],
  [FOOD_SLOT.benthic] : [
    {path : 'M-9 4L9 4'}, {fill : true, circles : [ [ -5, 0, 1.6 ], [ 0, -2, 2 ], [ 5, 0, 1.3 ] ]}
  ],
  surface : [ {path : 'M-9 5L9 5'}, {fill : true, path : ICON_FISH, scale : .7, y : -2.8} ],
  grass : ICON_GRASS,
  buried : [
    {fill : true, path : ICON_FISH, scale : .8, alpha : .45}, {path : 'M-10 -2L10 -2'},
    {fill : true, circles : [ [ -5, 4, 1 ], [ 2, 5, 1 ], [ 7, 3, 1 ] ]}
  ],
  shadow : [ {fill : true, path : 'M0 -6C3.31 -6 6 -3.31 6 0C6 3.31 3.31 6 0 6Q-1 0 0 -6Z'} ],
  light : [ {
    path :
        'M5 0L8 0M3.54 3.54L5.66 5.66M0 5L0 8M-3.54 3.54L-5.66 5.66M-5 0L-8 0M-3.54 -3.54L-5.66 -5.66M0 -5L0 -8M3.54 -3.54L5.66 -5.66',
    circles : [ [ 0, 0, 3 ] ]
  } ]
});
const ECOLOGY_ICON = Object.freeze({line_width : 1.5});
export function paintEcologyIcon(g, kind, x, y, color, size = 1) {
  g.save();
  g.translate(x, y);
  g.scale(size, size);
  g.strokeStyle = g.fillStyle = color;
  g.lineCap = g.lineJoin = 'round';
  const alpha = g.globalAlpha;
  for (const part of ECOLOGY_ICONS[kind]) {
    g.save();
    g.translate(0, part.y || 0);
    g.rotate(part.rotate || 0);
    g.scale(part.scale || 1, part.scale || 1);
    g.lineWidth = part.width || ECOLOGY_ICON.line_width;
    g.globalAlpha = alpha * (part.alpha ?? 1);
    g.beginPath();
    if (part.path)
      tracePath(g, part.path);
    for (const [cx, cy, r] of part.circles || []) {
      g.moveTo(cx + r, cy);
      g.arc(cx, cy, r, 0, 2 * Math.PI);
    }
    if (part.ellipse)
      g.ellipse(...part.ellipse, 0, 2 * Math.PI);
    if (part.fill)
      g.fill();
    else
      g.stroke();
    g.restore();
  }
  g.globalAlpha = alpha;
  g.restore();
}

// Feeding chart layout in CSS pixels: the uptake ring left, one bar row per food slot right, the
// habitat rings below; rates are per RATE_WINDOW.display_steps steps.
const FEEDING_CHART = Object.freeze({
  pad : 4,
  title_y : 15,
  ring_x : 53,
  ring_y : 83,
  ring_r : 39,
  ring_width : 10,
  gap : .012,
  total_dy : 2,
  label_dy : 18,
  rate_y : 153,
  rate_label_y : 170,
  ring_hit_y : 28,
  summary_width : 104,
  ring_hit_height : 99,
  rate_hit_y : 132,
  rate_hit_height : 45,
  rate_digits : 2,
  raw_y : 207,
  digested_y : 252,
  value_label_dy : 16,
  list_x : 118,
  bar_offset : 69,
  min_bar : 12,
  bar_room : 43,
  row_y : 35,
  row : 22,
  icon_dy : 4,
  list_icon : .65,
  name_dx : 14,
  bar_dy : 7,
  bar_height : 5,
  live_bar : 4,
  live_alpha : .55,
  live_dy : 2,
  share_dx : 3,
  row_hit_dx : 10,
  row_hit_dy : 15,
  rule_y : 300,
  habitat_title_y : 319,
  habitat_y : 349,
  habitat_width : 3,
  habitat_r : 16,
  live_r : 21,
  habitat_icon : .8,
  habitat_value_y : 381,
  habitat_label_y : 396,
  habitat_hit_y : 328,
  habitat_hit_height : 74,
  label : '#9bb1b6',
  track : '#2b424a',
  value : '#e3eeeb',
  rate : '#a2d9c6',
  empty : '#68838b',
  rule : '#2d424b',
  focus : '#e9c185'
});
function paintFeedingChart(box) {
  const c = box.feedingChart, m = box.feedingModel;
  if (!m)
    return;
  const {width : w, height : h, amounts, total, steps, eco} = m,
                                                       g = c.getContext(
                                                           '2d', {willReadFrequently : true}),
                                                       ratio = window.devicePixelRatio || 1;
  if (c.width !== Math.round(w * ratio))
    c.width = Math.round(w * ratio);
  if (c.height !== Math.round(h * ratio))
    c.height = Math.round(h * ratio);
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, w, h);
  const hits = [], fine = v => percent(v, 1), compact = compactNumber;
  const hit = (x, y, width, height, title) => hits.push({x, y, width, height, title});
  g.textAlign = 'left';
  g.font = '600 10px system-ui, sans-serif';
  g.fillStyle = FEEDING_CHART.label;
  g.fillText(m.living ? t('feeding_view.verwertbareAufnahmeGesamtLebend')
                      : t('feeding_view.verwertbareAufnahme'),
             FEEDING_CHART.pad, FEEDING_CHART.title_y);
  const cx = FEEDING_CHART.ring_x, cy = FEEDING_CHART.ring_y, r = FEEDING_CHART.ring_r;
  g.lineWidth = FEEDING_CHART.ring_width;
  g.strokeStyle = FEEDING_CHART.track;
  g.beginPath();
  g.arc(cx, cy, r, 0, 2 * Math.PI);
  g.stroke();
  let angle = -Math.PI / 2;
  amounts.forEach((value, i) => {
    if (!value || !total)
      return;
    const arc = 2 * Math.PI * value / total;
    g.strokeStyle = FOOD_COLORS[i];
    g.beginPath();
    g.arc(cx, cy, r, angle + FEEDING_CHART.gap,
          angle + Math.max(FEEDING_CHART.gap, arc - FEEDING_CHART.gap));
    g.stroke();
    angle += arc;
  });
  g.textAlign = 'center';
  g.fillStyle = FEEDING_CHART.value;
  g.font = '600 19px system-ui, sans-serif';
  g.fillText(compact(total), cx, cy + FEEDING_CHART.total_dy);
  g.fillStyle = FEEDING_CHART.label;
  g.font = '10px system-ui, sans-serif';
  g.fillText(t('feeding_view.energie'), cx, cy + FEEDING_CHART.label_dy);
  g.fillStyle = FEEDING_CHART.rate;
  g.font = '600 20px system-ui, sans-serif';
  g.fillText(steps ? compact(RATE_WINDOW.display_steps * total / steps) : '–', cx,
             FEEDING_CHART.rate_y);
  g.fillStyle = FEEDING_CHART.label;
  g.font = '10px system-ui, sans-serif';
  g.fillText(t('feeding_view.je100Schritte'), cx, FEEDING_CHART.rate_label_y);
  hit(0, FEEDING_CHART.ring_hit_y, FEEDING_CHART.summary_width, FEEDING_CHART.ring_hit_height,
      t('feeding_view.totalHelp', {total : formatNumber(total, 1), steps : formatNumber(steps)}));
  hit(0, FEEDING_CHART.rate_hit_y, FEEDING_CHART.summary_width, FEEDING_CHART.rate_hit_height,
      t('feeding_view.rateHelp', {
        n : steps
                ? formatNumber(RATE_WINDOW.display_steps * total / steps, FEEDING_CHART.rate_digits)
                : '–'
      }));
  for (const [value, label, y] of [
           [
             (eco.raw_diet || []).reduce((a, b) => a + b, 0), t('feeding_view.rohGeschluckt'),
             FEEDING_CHART.raw_y
           ],
           [
             eco.digested || 0, t('feeding_view.tatsaechlichVerdaut'), FEEDING_CHART.digested_y
           ]]) {
    g.textAlign = 'center';
    g.fillStyle = FEEDING_CHART.value;
    g.font = '600 16px system-ui';
    g.fillText(compact(value), cx, y);
    g.fillStyle = FEEDING_CHART.label;
    g.font = '10px system-ui';
    g.fillText(label, cx, y + FEEDING_CHART.value_label_dy);
  }
  const foodHits = hits.length, start = FEEDING_CHART.list_x,
        barX = start + FEEDING_CHART.bar_offset,
        barWidth = Math.max(FEEDING_CHART.min_bar, w - barX - FEEDING_CHART.bar_room);
  amounts.forEach((value, i) => {
    const y = FEEDING_CHART.row_y + i * FEEDING_CHART.row, share = total ? value / total : 0,
          color = value ? FOOD_COLORS[i] : FEEDING_CHART.empty;
    paintEcologyIcon(g, i, start, y - FEEDING_CHART.icon_dy, color, FEEDING_CHART.list_icon);
    g.textAlign = 'left';
    g.font = '11px system-ui, sans-serif';
    g.fillStyle = color;
    g.fillText(foodShortNames[i], start + FEEDING_CHART.name_dx, y);
    g.fillStyle = FEEDING_CHART.track;
    g.fillRect(barX, y - FEEDING_CHART.bar_dy, barWidth, FEEDING_CHART.bar_height);
    g.fillStyle = FOOD_COLORS[i];
    g.fillRect(barX, y - FEEDING_CHART.bar_dy, barWidth * share,
               m.living ? FEEDING_CHART.live_bar : FEEDING_CHART.bar_height);
    if (m.living) {
      const liveTotal = m.living.reduce((a, b) => a + b, 0),
            liveShare = liveTotal ? m.living[i] / liveTotal : 0;
      g.globalAlpha = FEEDING_CHART.live_alpha;
      g.fillRect(barX, y - FEEDING_CHART.live_dy, barWidth * liveShare, FEEDING_CHART.live_bar);
      g.globalAlpha = 1;
    }
    g.textAlign = 'right';
    g.font = '11px system-ui, sans-serif';
    g.fillStyle = value ? FEEDING_CHART.value : FEEDING_CHART.empty;
    g.fillText(total ? fine(share) : '–', w - FEEDING_CHART.share_dx, y);
    hit(start - FEEDING_CHART.row_hit_dx, y - FEEDING_CHART.row_hit_dy,
        w - start + FEEDING_CHART.row_hit_dx, FEEDING_CHART.row, [
          foodSources[i],
          total ? t(m.living ? 'feeding_view.shareTotal' : 'feeding_view.share', {n : fine(share)})
                : t('feeding_view.bisherKeineNahrungAufgenommen'),
          t('feeding_view.sourceAmount', {
            value : formatNumber(value, 1),
            rate : steps ? formatNumber(RATE_WINDOW.display_steps * value / steps,
                                        FEEDING_CHART.rate_digits)
                         : '–'
          }),
          t('feeding_view.rawIntake', {
            plants : foodKindOf(i) === FOOD_KIND.plant ? t('feeding_view.pflanzenGesamt') : '',
            n : formatNumber(eco.raw_diet?.[foodKindOf(i)] || 0, 1)
          }),
          ...(m.living ? [ t('feeding_view.living', {
            n : fine(m.living[i] /
                     Math.max(TOLERANCE.rounding, m.living.reduce((a, b) => a + b, 0)))
          }) ]
                       : [])
        ].join('\n'));
  });
  g.strokeStyle = FEEDING_CHART.rule;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(FEEDING_CHART.pad, FEEDING_CHART.rule_y);
  g.lineTo(w - FEEDING_CHART.pad, FEEDING_CHART.rule_y);
  g.stroke();
  g.textAlign = 'left';
  g.fillStyle = FEEDING_CHART.label;
  g.font = '600 10px system-ui, sans-serif';
  g.fillText(m.living ? t('feeding_view.lebensraumGesamtLebend') : t('feeding_view.lebensraum'),
             FEEDING_CHART.pad, FEEDING_CHART.habitat_title_y);
  habitatSources.forEach(([ key, label, color, note ], i) => {
    const cell = w / habitatSources.length, x = cell * (i + .5), y = FEEDING_CHART.habitat_y,
          value = Math.max(0, Math.min(1, eco[key] || 0));
    g.lineWidth = FEEDING_CHART.habitat_width;
    g.strokeStyle = FEEDING_CHART.track;
    g.beginPath();
    g.arc(x, y, FEEDING_CHART.habitat_r, 0, 2 * Math.PI);
    g.stroke();
    if (eco.samples && value > 0) {
      g.strokeStyle = color;
      g.beginPath();
      g.arc(x, y, FEEDING_CHART.habitat_r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * value);
      g.stroke();
    }
    if (m.liveEco) {
      g.strokeStyle = FEEDING_CHART.track;
      g.beginPath();
      g.arc(x, y, FEEDING_CHART.live_r, 0, 2 * Math.PI);
      g.stroke();
      g.strokeStyle = color;
      g.globalAlpha = FEEDING_CHART.live_alpha;
      g.beginPath();
      g.arc(x, y, FEEDING_CHART.live_r, -Math.PI / 2,
            -Math.PI / 2 + 2 * Math.PI * brainClamp(m.liveEco[key] || 0));
      g.stroke();
      g.globalAlpha = 1;
    }
    paintEcologyIcon(g, key, x, y, eco.samples ? color : FEEDING_CHART.empty,
                     FEEDING_CHART.habitat_icon);
    g.fillStyle = eco.samples ? FEEDING_CHART.value : FEEDING_CHART.empty;
    g.font = '600 12px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(eco.samples ? fine(value) : '–', x, FEEDING_CHART.habitat_value_y);
    g.fillStyle = FEEDING_CHART.label;
    g.font = '10px system-ui, sans-serif';
    g.fillText(label, x, FEEDING_CHART.habitat_label_y);
    hit(i * cell, FEEDING_CHART.habitat_hit_y, cell, FEEDING_CHART.habitat_hit_height, [
      t(m.liveEco ? 'feeding_view.habitatTotal' : 'feeding_view.habitat',
        {label, value : eco.samples ? fine(value) : t('feeding_view.wirdBeobachtet')}),
      ...(m.liveEco ? [ t('feeding_view.habitatLiving', {n : fine(m.liveEco[key] || 0)}) ] : []),
      note + (key === 'light' ? '' : t('feeding_view.zeitanteileKoennenSichUeberschneiden')),
      t('feeding_view.observedSteps', {n : formatNumber(eco.samples || 0)})
    ].join('\n'));
  });
  box.feedingHits = hits;
  const focused = hits[box.feedingFocus];
  if (focused) {
    g.strokeStyle = FEEDING_CHART.focus;
    g.lineWidth = 1;
    g.strokeRect(focused.x + 1, focused.y + 1, focused.width - 2, focused.height - 2);
  }
  c.title = focused?.title ||
            (m.living ? t('feeding_view.obenInnererRingGesamt') : '') + t('feeding_view.chartHelp');
  c.setAttribute('aria-label', t('feeding_view.chartLabel', {
                   food : hits.slice(foodHits, foodHits + amounts.length)
                              .map(x => x.title.replaceAll('\n', ': '))
                              .join('; '),
                   habitat : hits.slice(foodHits + amounts.length)
                                 .map(x => x.title.replaceAll('\n', ': '))
                                 .join('; ')
                 }));
}

// The chart follows its box between MIN_WIDTH and MAX_WIDTH pixels (WIDTH before layout); its
// height fits the layout above.
const FEEDING_SIZE = Object.freeze({min_width : 300, max_width : 600, width : 340, height : 406});
export function renderFeeding(box, diet, steps, eco = {}, living = null) {
  if (!box.feedingChart) {
    const c = document.createElement('canvas');
    c.className = 'feeding-chart';
    c.tabIndex = 0;
    c.setAttribute('role', 'img');
    box.appendChild(c);
    box.feedingChart = c;
    box.feedingFocus = -1;
    c.onpointermove = e => {
      const r = c.getBoundingClientRect(),
            x = (e.clientX - r.left) * box.feedingModel.width / r.width,
            y = (e.clientY - r.top) * box.feedingModel.height / r.height,
            index = box.feedingHits.findIndex(h => x >= h.x && x < h.x + h.width && y >= h.y &&
                                                   y < h.y + h.height);
      if (index !== box.feedingFocus) {
        box.feedingFocus = index;
        paintFeedingChart(box);
      }
    };
    c.onpointerleave = () => {
      box.feedingFocus = -1;
      paintFeedingChart(box);
    };
    c.onkeydown = e => {
      if (![KEY.left, KEY.right, KEY.up, KEY.down, KEY.home, KEY.end].includes(e.key))
        return;
      e.preventDefault();
      const n = box.feedingHits.length;
      box.feedingFocus =
          e.key === KEY.home ? 0
          : e.key === KEY.end
              ? n - 1
              : (box.feedingFocus + ([ KEY.left, KEY.up ].includes(e.key) ? n - 1 : 1) + n) % n;
      paintFeedingChart(box);
    };
  }
  const width =
            Math.max(FEEDING_SIZE.min_width,
                     Math.min(FEEDING_SIZE.max_width,
                              Math.round(box.getBoundingClientRect().width) || FEEDING_SIZE.width)),
        amounts = foodAmounts(diet, eco);
  box.feedingModel = {
    width,
    height : FEEDING_SIZE.height,
    amounts,
    total : amounts.reduce((a, b) => a + b, 0),
    steps,
    eco,
    living : living ? foodAmounts(living.diet, living.eco) : null,
    liveEco : living?.eco
  };
  const signature = JSON.stringify(box.feedingModel);
  if (signature !== box.feedingSignature) {
    box.feedingSignature = signature;
    paintFeedingChart(box);
  }
}

export function updateFeedingViewState(patch) {
  Object.assign(feeding_viewState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "fishStatCells" : () => { feeding_viewState.fishStatCells = new Map(); },
  "lastSelectedProfile" : () => { feeding_viewState.lastSelectedProfile = null; },
  "fishStatEpoch" : () => { feeding_viewState.fishStatEpoch = 0; },
  "deathNames" : () => { deathNames = tList('feeding_view.deathNames'); },
  "foodSources" : () => { foodSources = tList('feeding_view.foodSources'); },
  "foodShortNames" : () => { foodShortNames = tList('feeding_view.foodShortNames'); },
  "habitatSources" : () => {
    habitatSources = [
      [ 'surface', t('feeding_view.flaechen'), '#80c6db', t('feeding_view.naeheZuBodenOder') ],
      [
        'grass', t('feeding_view.pflanzen'), '#9fc96a',
        t('feeding_view.aufenthaltZwischenBlattpflanzen')
      ],
      [
        'buried', t('feeding_view.sediment'), '#c6a475',
        t('feeding_view.koerperUeberwiegendImAbgelagerten')
      ],
      [ 'shadow', t('feeding_view.schatten'), '#b6a5df', t('feeding_view.wenigerAls20Licht') ],
      [
        'light', t('feeding_view.licht'), '#e9c185',
        t('feeding_view.mittlereTatsaechlicheLichtstaerkeFuer')
      ]
    ];
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
