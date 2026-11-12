import {PERCENT} from './units.js';
import {tracePath} from './path_data.js';
import {FISH, HABITAT, indexedBy, TOLERANCE} from './schema.js';
import {
  ENERGY_STORES,
  INHABITANTS,
  deathCauses,
  diseaseSummary,
  energyBudget,
  inhabitants,
  populationHabitat
} from './ecosystem_model.js';
import {cssPercent, formatNumber, percent, t, textArea, tList} from './strings.js';
import {chartContext, chartSize} from './dom.js';
import {updateCockpitState} from './cockpit.js';
import {appendBehaviorComparison} from './behavior_view.js';
import {noveltyStanding} from './behavior_model.js';
import {fishTitle} from './fish_names.js';
import {cockpitState, energyParts} from './cockpit.js';
import {el, text, uiIcon} from './dom.js';
import {command} from './session.js';
import {
  DEATH_COLORS,
  deathBadge,
  deathNames,
  paintEcologyIcon,
  FOOD_COLORS
} from './feeding_view.js';
import {foodDisplayIndex} from './nutrition_model.js';
export const energy_viewState = {};
const STORE_COLORS = {
  gut : '#b8b795',
  sperm : '#71818c'
};

const TREND = Object.freeze({
  max_points : 240,
  min_points : 2,
  window : 2000,
  text_y : 15,
  delta_digits : 2,
  delta_x : 285,
  line_width : 2,
  pad : 4,
  span : 470,
  line_bottom : 70,
  line_height : 40,
  bar_x : 150,
  bar_y : 91,
  bar_width : 240,
  bar_height : 10,
  low_reserve : 30,
  label_y : 101,
  reserve_x : 408,
  text : '#bad0cb',
  warning : '#df9c8d',
  rising : '#8bcab6',
  track : '#263f49',
  reserve : '#d7c77d'
});
function renderEnergyTrend(f) {
  const total = Object.values(f.energy_breakdown || {}).reduce((s, v) => s + v, 0);
  if (cockpitState.energyTrendEpoch !== f.render_epoch ||
      cockpitState.energyTrend.length && f.step < cockpitState.energyTrend.at(-1)[0]) {
    updateCockpitState({energyTrend : []});
    updateCockpitState({energyTrendEpoch : f.render_epoch});
  }
  if (!cockpitState.energyTrend.length || cockpitState.energyTrend.at(-1)[0] !== f.step)
    cockpitState.energyTrend.push([ f.step, total ]);
  while (cockpitState.energyTrend.length > TREND.max_points ||
         cockpitState.energyTrend.length > TREND.min_points &&
             cockpitState.energyTrend[1][0] < f.step - TREND.window)
    cockpitState.energyTrend.shift();
  const details = el('energy-details');
  details.ontoggle = () => details.open && renderEnergyTrend(f);
  if (!details.open)
    return;
  const cv = el('energy-trend'), g = chartContext(cv, () => renderEnergyTrend(f)),
        max = Math.max(1, ...cockpitState.energyTrend.map(p => p[1])),
        min = Math.min(...cockpitState.energyTrend.map(p => p[1])),
        start = cockpitState.energyTrend[0]?.[0] ?? f.step, span = Math.max(1, f.step - start),
        delta = cockpitState.energyTrend.length > 1
                    ? (total - cockpitState.energyTrend[0][1]) / span
                    : 0;
  const {width, height} = chartSize(cv);
  g.clearRect(0, 0, width, height);
  g.font = '12px system-ui';
  g.fillStyle = TREND.text;
  g.fillText(t('energy_view.stock', {n : formatNumber(Math.round(total))}), 0, TREND.text_y);
  g.fillStyle = delta < 0 ? TREND.warning : TREND.rising;
  g.fillText(t('units.perStep',
               {n : (delta >= 0 ? '+' : '') + formatNumber(delta, TREND.delta_digits, true)}),
             TREND.delta_x, TREND.text_y);
  g.strokeStyle = TREND.rising;
  g.lineWidth = TREND.line_width;
  g.beginPath();
  cockpitState.energyTrend.forEach(([ t, value ], i) => {
    const x = TREND.pad + TREND.span * (t - start) / span,
          y = TREND.line_bottom - TREND.line_height * (value - min) / Math.max(1, max - min);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
  const perf = f.performance || {}, reserve = perf.mean_reserve || 0,
        adults = f.fish.filter(p => p[FISH.hatched]),
        capacity =
            adults.reduce((s, p) => s + p[FISH.reserve_capacity], 0) / Math.max(1, adults.length);
  g.fillStyle = TREND.track;
  g.fillRect(TREND.bar_x, TREND.bar_y, TREND.bar_width, TREND.bar_height);
  g.fillStyle = reserve < TREND.low_reserve ? TREND.warning : TREND.reserve;
  g.fillRect(TREND.bar_x, TREND.bar_y,
             TREND.bar_width * Math.min(1, reserve / Math.max(1, capacity)), TREND.bar_height);
  g.fillStyle = TREND.text;
  g.fillText(t('energy_view.fishReserveAverage'), 0, TREND.label_y);
  g.fillText(formatNumber(reserve, 1, true), TREND.reserve_x, TREND.label_y);
  cv.title = t('energy_view.verlaufSeitOeffnenDer');
}

const HABITAT_SCENE = Object.freeze({
  water_top : 4,
  water_bottom : 110,
  water : [ [ 0, '#696969' ], [ .55, '#474747' ], [ 1, '#303030' ] ],
  light : [ [ 0, '#0e172c90' ], [ .3, '#1c3c4400' ], [ .75, '#1c3c4400' ], [ 1, '#edda8c55' ] ],
  sand : 'M0 96C90 88 150 105 210 88C280 77 310 105 390 93L480 96L480 110L0 110Z',
  sand_color : '#ad9564',
  rock : 'M104 82L113 65L158 60L176 75L170 94L104 97Z',
  rock_color : '#7c8580',
  ridge : 'M114 65L158 60L176 75',
  ridge_color : '#c8c4a488',
  cave : 'M4 85Q49 64 86 87L94 99L2 100Z',
  cave_color : '#222c37',
  rays : 'M422 4L384 102L402 102L428 4M439 4L403 102L422 102L445 4M456 4L422 102L442 102L462 4',
  ray_color : '#e7d78b25'
});
const HABITAT_GRASS = Object.freeze({
  stalks : 9,
  x : 200,
  spacing : 7,
  top : 31,
  top_hash : 13,
  top_range : 32,
  base : 98,
  width : 1.5,
  width_step : .6,
  width_steps : 3,
  bend : [ 8, 80, -11, 12, 2 ],
  leaves : 3,
  leaf_y : 14,
  leaf_step : 16,
  leaf_x : [ -3, 4 ],
  leaf : [ 5, 2.4, .7 ],
  colors : [ '#578658', '#7faa64' ],
  leaf_colors : [ '#669655', '#90b16b' ]
});
const HABITAT_GRAINS = Object.freeze({
  count : 35,
  x : 292,
  x_hash : 23,
  x_range : 78,
  y : 91,
  y_hash : 7,
  y_range : 17,
  size : [ 1.5, 1 ],
  color : '#ccb379'
});
const HABITAT_FISH = Object.freeze({
  per_share : 14,
  margin : 14,
  x_hash : 37,
  x_range : 67,
  y_hash : 19,
  water : [ 25, 48 ],
  sediment : [ 84, 13 ],
  left_every : 3,
  body : [ 4.8, 2.3 ],
  tail : 'M-4 0L-8 -3L-8 3Z',
  eye : [ 2.5, -.4, .7 ],
  eye_color : '#112e36'
});
const HABITAT_ORDER =
    [ HABITAT.shadow, HABITAT.surface, HABITAT.grass, HABITAT.buried, HABITAT.light ];
const HABITAT_COLORS = indexedBy(HABITAT, {
  surface : '#c3b38f',
  grass : '#8fae62',
  buried : '#a7845a',
  shadow : '#8d8fba',
  light : '#e4cd80'
});
const HABITAT_LABEL = Object.freeze({
  x : 5,
  y : 127,
  bar_y : 135,
  bar_width : 82,
  bar_height : 3,
  color : '#c9d9d3',
  track : '#2b4750'
});

function fillGradient(g, stops, x0, y0, x1, y1) {
  const gradient = g.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops)
    gradient.addColorStop(at, color);
  return gradient;
}

function drawHabitatScene(g, width) {
  const S = HABITAT_SCENE, height = S.water_bottom - S.water_top;
  g.fillStyle = fillGradient(g, S.water, 0, S.water_top, 0, S.water_bottom);
  g.fillRect(0, S.water_top, width, height);
  g.fillStyle = fillGradient(g, S.light, 0, 0, width, 0);
  g.fillRect(0, S.water_top, width, height);
  for (const [path, color, stroke] of [[ S.sand, S.sand_color ], [ S.rock, S.rock_color ],
                                       [ S.ridge, S.ridge_color, true ]]) {
    g.beginPath();
    tracePath(g, path);
    if (stroke) {
      g.strokeStyle = color;
      g.stroke();
    } else {
      g.fillStyle = color;
      g.fill();
    }
  }
  const G = HABITAT_GRASS, [ dx1, y1, dx2, dy2, dx ] = G.bend, [ rx, ry, tilt ] = G.leaf;
  for (let k = 0; k < G.stalks; k++) {
    const x = G.x + k * G.spacing, top = G.top + (k * G.top_hash % G.top_range), odd = k % 2;
    g.strokeStyle = G.colors[odd];
    g.lineWidth = G.width + (k % G.width_steps) * G.width_step;
    g.beginPath();
    g.moveTo(x, G.base);
    g.bezierCurveTo(x + dx1, y1, x + dx2, top + dy2, x + dx, top);
    g.stroke();
    g.fillStyle = G.leaf_colors[odd];
    for (let j = 0; j < G.leaves; j++) {
      g.beginPath();
      g.ellipse(x + G.leaf_x[j % 2], top + G.leaf_y + j * G.leaf_step, rx, ry, j % 2 ? -tilt : tilt,
                0, 2 * Math.PI);
      g.fill();
    }
  }
  const D = HABITAT_GRAINS;
  g.fillStyle = D.color;
  for (let k = 0; k < D.count; k++)
    g.fillRect(D.x + (k * D.x_hash % D.x_range), D.y + (k * D.y_hash % D.y_range), ...D.size);
  for (const [path, color] of [[ S.cave, S.cave_color ], [ S.rays, S.ray_color ]]) {
    g.fillStyle = color;
    g.beginPath();
    tracePath(g, path);
    g.fill();
  }
}

function drawHabitatFish(g, x, y, facing, color) {
  const F = HABITAT_FISH;
  g.save();
  g.translate(x, y);
  g.scale(facing, 1);
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(0, 0, ...F.body, 0, 0, 2 * Math.PI);
  g.fill();
  g.beginPath();
  tracePath(g, F.tail);
  g.fill();
  g.fillStyle = F.eye_color;
  g.beginPath();
  g.arc(...F.eye, 0, 2 * Math.PI);
  g.fill();
  g.restore();
}

function renderHabitat(f) {
  const cv = el('habitat-chart'), g = chartContext(cv, () => renderHabitat(f)),
        {width, height} = chartSize(cv), values = populationHabitat(f).shares,
        labels = tList('energy_view.habitatNames'), column = width / HABITAT_ORDER.length,
        F = HABITAT_FISH, L = HABITAT_LABEL;
  g.clearRect(0, 0, width, height);
  drawHabitatScene(g, width);
  HABITAT_ORDER.forEach((i, slot) => {
    const x = slot * column, [ top, range ] = i === HABITAT.buried ? F.sediment : F.water;
    for (let k = 0; k < Math.round(values[i] * F.per_share); k++)
      drawHabitatFish(g, x + F.margin + (k * F.x_hash % F.x_range), top + (k * F.y_hash % range),
                      k % F.left_every ? 1 : -1, HABITAT_COLORS[i]);
    g.fillStyle = L.color;
    g.font = '11px system-ui';
    g.fillText(labels[i], x + L.x, L.y);
    g.fillStyle = L.track;
    g.fillRect(x + L.x, L.bar_y, L.bar_width, L.bar_height);
    g.fillStyle = HABITAT_COLORS[i];
    g.fillRect(x + L.x, L.bar_y, L.bar_width * Math.min(1, values[i]), L.bar_height);
  });
  cv.title = labels.map((n, i) => n + ': ' + percent(values[i])).join(' · ');
}

const HEALTH = Object.freeze({
  max_dots : 100,
  x : 10,
  per_row : 50,
  spacing : 9.3,
  y : 14,
  row : 14,
  r : 3,
  text_x : 4,
  text_y : 58,
  bar_x : 8,
  base : 90,
  bar_height : 24,
  label_x : 17,
  label_y : 85,
  sick : '#d88d80',
  healthy : '#85c4ad',
  text : '#bad0d3',
  route : '#d0a581'
});
function renderHealth(f) {
  const hc = el('health-chart'), h = chartContext(hc, () => renderHealth(f)),
        {width, height} = chartSize(hc), disease = diseaseSummary(f), sick = disease.sick,
        total = disease.hatched;
  h.clearRect(0, 0, width, height);
  h.font = '12px system-ui';
  for (let k = 0; k < Math.min(HEALTH.max_dots, total); k++) {
    h.fillStyle = k < Math.round(Math.min(HEALTH.max_dots, total) * sick / Math.max(1, total))
                      ? HEALTH.sick
                      : HEALTH.healthy;
    h.beginPath();
    h.arc(HEALTH.x + (k % HEALTH.per_row) * HEALTH.spacing,
          HEALTH.y + Math.floor(k / HEALTH.per_row) * HEALTH.row, HEALTH.r, 0, 2 * Math.PI);
    h.fill();
  }
  h.fillStyle = HEALTH.text;
  h.fillText(t('energy_view.health', {healthy : total - sick, sick}), HEALTH.text_x, HEALTH.text_y);
  const titles = tList('energy_view.diseaseRoutes'),
        max = Math.max(1, ...disease.routes.map(r => r.count));
  disease.routes.forEach(({count : v}, i) => {
    const x = i * width / disease.routes.length;
    h.strokeStyle = HEALTH.route;
    h.beginPath();
    h.moveTo(x + HEALTH.bar_x, HEALTH.base);
    h.lineTo(x + HEALTH.bar_x, HEALTH.base - HEALTH.bar_height * v / max);
    h.stroke();
    h.fillStyle = HEALTH.text;
    h.fillText(titles[i], x + HEALTH.label_x, HEALTH.label_y);
  });
  hc.title = t('energy_view.diseases', {
    list :
        disease.routes.map((r, i) => t('energy_view.diseaseCount', {name : titles[i], n : r.count}))
            .join(' · ')
  });
}

const SOURCE_ICON = 24, BUDGET_COLUMNS = [ 'stock', 'uptake' ];
const INHABITANT_ICONS = {
  fish : 'fish',
  eggs : 'eggs',
  corpses : 'carrion',
  food : 'feed',
  crabs : 'crabs',
  mussels : 'mussels'
};
function renderInhabitants(f) {
  const box = el('inhabitants'), counts = inhabitants(f),
        names = textArea('energy_view').inhabitants;
  if (box.children.length !== INHABITANTS.length)
    box.replaceChildren(...INHABITANTS.map(key => {
      const tile = document.createElement('div'), icon = document.createElement('i'),
            number = document.createElement('strong'), label = document.createElement('small');
      tile.className = 'inhabitant';
      icon.innerHTML = uiIcon(INHABITANT_ICONS[key]);
      label.textContent = names[key];
      tile.append(icon, number, label);
      return tile;
    }));
  INHABITANTS.forEach((key, i) => {
    const tile = box.children[i];
    tile.children[1].textContent = formatNumber(counts[key]);
    tile.title = names[key] + ': ' + formatNumber(counts[key]);
  });
}

export function renderEnergy(f) {
  renderHabitat(f);
  renderInhabitants(f);
  renderHealth(f);
  renderEnergyTrend(f);
  const budget = energyBudget(f), {total, eaten, window, values} = budget, bar = el('energy-bar'),
        names = textArea('energy_view').groupNames,
        groups = budget.groups.map(
            g => [g.key, names[g.key],
                  FOOD_COLORS[foodDisplayIndex(g.sources[0], g.key === 'drift')], g.sources]);
  text('energy-total', '');
  el('energy-total').title = t('energy_view.gespeicherteEnergieZufuhrUnd');
  for (const [key, name, color] of [...groups, ...ENERGY_STORES.map(
                                                   key => [key, names[key], STORE_COLORS[key]])]) {
    let item = energyParts.get(key);
    if (!item) {
      const part = document.createElement('span'), label = document.createElement('span');
      part.style.background = color;
      label.style.color = color;
      label.textContent = name;
      bar.appendChild(part);
      el('energy-legend').appendChild(label);
      item = {part, label};
      energyParts.set(key, item);
    }
    item.part.style.width = cssPercent((values[key] || 0) / Math.max(1, total));
    item.part.title =
        t('energy_view.namedEnergy', {name, n : formatNumber(Math.round(values[key] || 0))});
    item.label.title = item.part.title;
  }
  const box = el('source-budget-bars');
  if (!box.children.length) {
    const heading = document.createElement('div');
    heading.className = 'energy-source energy-pair-key';
    for (const name
             of [t('energy_view.nahrung'), t('energy_view.vorrat'), t('energy_view.frass')]) {
      const cell = document.createElement('span');
      cell.textContent = name;
      heading.appendChild(cell);
    }
    box.appendChild(heading);
    for (const [key, name, color, sources] of groups) {
      const row = document.createElement('div');
      row.className = 'energy-source';
      const label = document.createElement('div'), icon = document.createElement('canvas'),
            nameTag = document.createElement('span');
      label.className = 'energy-source-name';
      icon.width = icon.height = SOURCE_ICON;
      icon.setAttribute('aria-hidden', 'true');
      paintEcologyIcon(icon.getContext('2d'), foodDisplayIndex(sources[0], key === 'drift'),
                       SOURCE_ICON / 2, SOURCE_ICON / 2, color, 1);
      nameTag.textContent = name;
      label.append(icon, nameTag);
      row.appendChild(label);
      for (const column of BUDGET_COLUMNS) {
        const cell = document.createElement('div'), track = document.createElement('div'),
              fill = document.createElement('i');
        cell.className = 'energy-source-value';
        cell.dataset.column = column;
        track.className = 'energy-track';
        fill.style.background = color;
        track.appendChild(fill);
        cell.append(track);
        row.appendChild(cell);
      }
      box.appendChild(row);
    }
  }
  groups.forEach(([ key, name ], i) => {
    const row = box.children[i + 1];
    BUDGET_COLUMNS.forEach((column, k) => {
      const cell = row.children[k + 1], value = budget.groups[i][column],
            share = PERCENT * value / Math.max(TOLERANCE.rounding, k ? eaten : total);
      cell.children[0].children[0].style.width = share + '%';
      cell.title = (k ? t('energy_view.verwertbareAufnahme') : t('energy_view.vorrat')) + ': ' +
                   value.toLocaleString(t('units.locale'), {maximumFractionDigits : 1}) + ' E · ' +
                   t('units.percent', {n : formatNumber(share, 1, true)});
    });
    row.title = t('energy_view.feedingWindow', {name, n : formatNumber(window)});
  });
  box.children[0].title = t('energy_view.vorratAnteilAnGespeicherter');
  const supply = f.energy_supply, flux = el('supply-bars');
  if (supply) {
    if (!flux.children.length) {
      const title = document.createElement('span'), track = document.createElement('div');
      track.className = 'supply-track';
      for (const color of SUPPLY_COLORS)
        track.appendChild(document.createElement('i')).style.background = color;
      flux.append(title, track);
    }
    flux.children[0].textContent = t('energy_view.anteile');
    const shares = f.parameters ? supplyShown(flux.children[1], f.parameters) : null;
    if (shares)
      shares.push(Math.max(0, 1 - shares.reduce((x, y) => x + y, 0)));
    [supply.artificial, supply.plankton, supply.benthic, supply.producers].forEach((v, i) => {
      const part = flux.children[1].children[i];
      part.style.width =
          cssPercent(shares ? shares[i] : v / Math.max(TOLERANCE.rounding, supply.total));
      part.title =
          t('energy_view.supplyPart',
            {name : tList('energy_view.supplyNames')[i], n : formatNumber(v, SUPPLY.digits)});
    });
    renderSupplyShares(f);
    const flow = f.food_flow || {};
    flux.title = t('energy_view.supplyBudget', {
      area : formatNumber(Math.round(supply.water_area)),
      nature : formatNumber(supply.nature, SUPPLY.digits, true),
      assisted : Math.round(flow.assisted || 0),
      support : Math.round(flow.support || 0),
      animals : Math.round(supply.animal_initial || 0)
    });
  }
  text('energy-status',
       f.population_size >= f.population_limit ? t('energy_view.alleTierplaetzeBelegt') : '');
}

const SUPPLY_SHARES = [ 'food_supply_share', 'plankton_supply_share', 'benthic_supply_share' ];
const SUPPLY_COLORS = [ '#e6b568', '#69b7bd', '#bd937e', '#79b35e' ];
const SUPPLY = Object.freeze({
  send_ms : 100,
  grace_ms : 3000,
  resolution : 1000,
  min_change : 1e-4,
  echo : 2e-3,
  grab : 12,
  digits : 2
});
const differences = c => c.map((v, i) => v - (i ? c[i - 1] : 0));

// While dragging, and after release until the server echoes the new shares (or a grace period
// ends), the local shares are authoritative; incoming frames must not pull the borders back.
function supplyShown(track, parameters) {
  const server = SUPPLY_SHARES.map(n => parameters?.[n] ?? 0), local = track.local;
  if (!local)
    return server;
  if (!track.dragging && !track.sending &&
      (local.values.every((v, i) => Math.abs(v - server[i]) < SUPPLY.echo) ||
       performance.now() > local.until)) {
    track.local = track.sent = null;
    return server;
  }
  return local.values.slice();
}

async function sendSupplyShares(track) {
  if (track.sending) {
    track.dirty = true;
    return;
  }
  clearTimeout(track.timer);
  track.timer = 0;
  track.sending = true;
  track.lastSend = performance.now();
  try {
    const values =
              track.local.values.map(v => Math.round(SUPPLY.resolution * v) / SUPPLY.resolution),
          old = track.sent || SUPPLY_SHARES.map(n => track.parameters?.[n] ?? 0);
    // Lower shares first, so the sum never exceeds the whole supply on the way.
    const order = [...values.keys() ].sort((a, b) => (values[a] - old[a]) - (values[b] - old[b]));
    for (const k of order)
      if (Math.abs(values[k] - old[k]) > SUPPLY.min_change) {
        await command('parameter', {name : SUPPLY_SHARES[k], value : values[k]});
        old[k] = values[k];
      }
    track.sent = old;
  } finally {
    track.sending = false;
    if (track.local)
      track.local.until = performance.now() + SUPPLY.grace_ms;
  }
  if (track.dirty) {
    track.dirty = false;
    sendSupplyShares(track);
  }
}

function scheduleSupplyShares(track) {
  const wait = SUPPLY.send_ms - (performance.now() - (track.lastSend || 0));
  if (wait <= 0)
    sendSupplyShares(track);
  else if (!track.timer)
    track.timer = setTimeout(() => {
      track.timer = 0;
      sendSupplyShares(track);
    }, wait);
}

function renderSupplyShares(f) {
  const track = el('supply-bars')?.children[1], legend = el('supply-shares');
  if (!track || !legend || !f.parameters)
    return;
  track.parameters = f.parameters;
  const shares = supplyShown(track, f.parameters),
        parts = [...shares, Math.max(0, 1 - shares.reduce((a, b) => a + b, 0)) ],
        names = tList('energy_view.supplyNames');
  if (!legend.children.length)
    names.forEach((name, i) => {
      // Each share names its food beside its colour; the value follows.
      const item = document.createElement('span'), dot = document.createElement('i'),
            value = document.createElement('b');
      dot.style.background = SUPPLY_COLORS[i];
      item.append(dot, name, value);
      legend.appendChild(item);
    });
  parts.forEach((v, i) => { legend.children[i].querySelector('b').textContent = percent(v); });
  if (track.bound)
    return;
  track.bound = true;
  track.classList.add('supply-control');
  track.title = t('energy_view.supplyHelp');
  const cumulative = () => {
    const shown = supplyShown(track, track.parameters), c = [];
    let sum = 0;
    for (const v of shown)
      c.push(sum += v);
    return c;
  };
  const show = c => {
    differences([...c, 1 ]).forEach((w, i) => {
      track.children[i].style.width = cssPercent(w);
      legend.children[i].querySelector('b').textContent = percent(w);
    });
  };
  track.onpointerdown = e => {
    const rect = track.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width,
          c = cumulative();
    const best = Math.min(...c.map(v => Math.abs(v - x)));
    if (best > SUPPLY.grab / rect.width)
      return;
    const ties = [...c.keys() ].filter(k => Math.abs(c[k] - x) <= best + TOLERANCE.precision);
    track.setPointerCapture(e.pointerId);
    track.dragging = {border : ties.length > 1 ? -1 : ties[0], ties, c, x : e.clientX};
    e.preventDefault();
  };
  track.onpointermove = e => {
    const d = track.dragging;
    if (!d || d.border < 0 && e.clientX === d.x)
      return;
    if (d.border < 0)
      d.border = e.clientX > d.x ? Math.max(...d.ties) : Math.min(...d.ties);
    const rect = track.getBoundingClientRect(), lo = d.border ? d.c[d.border - 1] : 0,
          hi = d.border < d.c.length - 1 ? d.c[d.border + 1] : 1;
    d.c[d.border] = Math.max(lo, Math.min(hi, (e.clientX - rect.left) / rect.width));
    track.local = {values : differences(d.c), until : performance.now() + SUPPLY.grace_ms};
    show(d.c);
    scheduleSupplyShares(track);
  };
  track.onpointerup = track.onpointercancel = () => {
    if (!track.dragging)
      return;
    track.dragging = null;
    if (track.local) {
      track.local.until = performance.now() + SUPPLY.grace_ms;
      clearTimeout(track.timer);
      track.timer = 0;
      sendSupplyShares(track);
    }
  };
}

export function renderDeathCauses(f) {
  const {counts, total} = deathCauses(f), signature = JSON.stringify(counts);
  if (signature === energy_viewState.deathChartSignature)
    return;
  energy_viewState.deathChartSignature = signature;
  const box = el('death-chart');
  box.replaceChildren();
  if (!total) {
    box.textContent = t('energy_view.nochKeineTodesfaelle');
    return;
  }
  const bar = document.createElement('div'), legend = document.createElement('div');
  bar.className = 'death-bar';
  legend.className = 'death-legend';
  for (let i = 0; i < counts.length; ++i) {
    if (!counts[i])
      continue;
    const title = t('energy_view.deathShare', {
      name : deathNames[i],
      n : counts[i],
      total,
      share : Math.round(PERCENT * counts[i] / total)
    }),
          segment = document.createElement('i'),
          badge = deathBadge(i, ' ' + formatNumber(counts[i]));
    segment.style.flexGrow = counts[i];
    segment.style.background = DEATH_COLORS[i];
    segment.title = badge.title = title;
    bar.append(segment);
    legend.append(badge);
  }
  box.append(bar, legend);
}

export function renderNovelty(f, p) {
  const summary = el('novelty-summary'), box = el('novelty-contributions'),
        standing = noveltyStanding(f, p[FISH.id]);
  if (!standing) {
    summary.replaceChildren(t('energy_view.verhaltenWirdNochBeobachtet'));
    box.replaceChildren();
    box.behaviorParts = null;
    return;
  }
  const value = document.createElement('strong'), rank = document.createElement('span');
  value.textContent = formatNumber(standing.novelty, 3, true);
  rank.textContent = standing.share === null
                         ? t('energy_view.noveltyAlone')
                         : t('energy_view.noveltyRank', {n : Math.round(PERCENT * standing.share)});
  summary.title = t('energy_view.noveltyMeaning', {n : f.parameters.novelty_neighbors});
  summary.replaceChildren(value, rank);
  const closest = standing.closest;
  if (!closest) {
    box.replaceChildren(t('energy_view.nochKeinVergleichsprofil'));
    box.behaviorParts = null;
    return;
  }
  appendBehaviorComparison(
      box, standing.descriptor, closest.descriptor,
      closest.fish !== undefined
          ? t('energy_view.closestFish', {fish : fishTitle(closest.fish)})
          : t('energy_view.closestArchive', {step : formatNumber(closest.tick)}),
      [ t('energy_view.dieserFisch'), t('energy_view.aehnlichstesProfil') ]);
}

const initializers = {
  "deathChartSignature" : () => { energy_viewState.deathChartSignature = ''; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
