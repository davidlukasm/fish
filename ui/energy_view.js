import {t, tList, formatNumber} from './strings.js';
import {chartContext} from './dom.js';
import {updateCockpitState} from './cockpit.js';
import {appendBehaviorComparison} from './behavior_view.js';
import {behaviorDistance} from './behavior_model.js';
import {cockpitState, energyParts, renderReproduction} from './cockpit.js';
import {el, text} from './dom.js';
import {command} from './session.js';
import {deathNames, paintEcologyIcon, foodColors} from './feeding_view.js';
import {foodDisplayIndex} from './nutrition_model.js';
export const energy_viewState = {};

export function renderEnergyTrend(f) {
  const total = Object.values(f.energy_breakdown || {}).reduce((s, v) => s + v, 0);
  if (cockpitState.energyTrendEpoch !== f.render_epoch ||
      cockpitState.energyTrend.length && f.step < cockpitState.energyTrend.at(-1)[0]) {
    updateCockpitState({energyTrend : []});
    updateCockpitState({energyTrendEpoch : f.render_epoch});
  }
  if (!cockpitState.energyTrend.length || cockpitState.energyTrend.at(-1)[0] !== f.step)
    cockpitState.energyTrend.push([ f.step, total ]);
  while (cockpitState.energyTrend.length > 240 ||
         cockpitState.energyTrend.length > 2 && cockpitState.energyTrend[1][0] < f.step - 2000)
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
  g.clearRect(0, 0, 480, 116);
  g.font = '12px system-ui';
  g.fillStyle = '#bad0cb';
  g.fillText(t('energy_view.stock', {n : formatNumber(Math.round(total))}), 0, 15);
  g.fillStyle = delta < 0 ? '#df9c8d' : '#8bcab6';
  g.fillText(t('units.perStep', {n : (delta >= 0 ? '+' : '') + formatNumber(delta, 2, true)}), 285,
             15);
  g.strokeStyle = '#8bcab6';
  g.lineWidth = 2;
  g.beginPath();
  cockpitState.energyTrend.forEach(([ t, value ], i) => {
    const x = 4 + 470 * (t - start) / span, y = 70 - 40 * (value - min) / Math.max(1, max - min);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
  const perf = f.performance || {}, reserve = perf.mean_reserve || 0,
        adults = f.fish.filter(p => p[8]),
        capacity = adults.reduce((s, p) => s + (p[53] || 400), 0) / Math.max(1, adults.length);
  g.fillStyle = '#263f49';
  g.fillRect(150, 91, 240, 10);
  g.fillStyle = reserve < 30 ? '#df9c8d' : '#d7c77d';
  g.fillRect(150, 91, 240 * Math.min(1, reserve / Math.max(1, capacity)), 10);
  g.fillStyle = '#bad0cb';
  g.fillText('Ø Fischreserve', 0, 101);
  g.fillText(formatNumber(reserve, 1, true), 408, 101);
  cv.title = t('energy_view.verlaufSeitOeffnenDer');
}

function renderHabitatAndHealth(f) {
  const cv = el('habitat-chart'), g = chartContext(cv, () => renderHabitatAndHealth(f));
  g.clearRect(0, 0, 480, 150);
  const ids = new Set((f.fish || []).filter(p => p[8]).map(p => p[4])),
        observations = (f.traits || []).filter(t => ids.has(t.id)),
        samples = observations.reduce((n, t) => n + (t.ecology_steps || 0), 0),
        values = Array.from({length : 5},
                            (_, i) => observations.reduce((n, t) => n + (t.ecology?.[i] || 0), 0) /
                                      Math.max(1, samples));
  const labels =
            [
              t('energy_view.flaechen'), t('energy_view.bewuchs'), t('energy_view.sediment'),
              t('energy_view.dunkelheit'), t('energy_view.licht')
            ],
        colors = [ '#c3b38f', '#8fae62', '#a7845a', '#8d8fba', '#e4cd80' ];
  // One connected cross-section makes the habitats legible without abstract symbols.
  const water = g.createLinearGradient(0, 4, 0, 110);
  water.addColorStop(0, '#39717d');
  water.addColorStop(.55, '#224d59');
  water.addColorStop(1, '#17333f');
  g.fillStyle = water;
  g.fillRect(0, 4, 480, 106);
  // Dark on the left, bright on the right: Dunkelheit, Flächen, Bewuchs, Sediment, Licht.
  const light = g.createLinearGradient(0, 0, 480, 0);
  light.addColorStop(0, '#0e172c90');
  light.addColorStop(.3, '#1c3c4400');
  light.addColorStop(.75, '#1c3c4400');
  light.addColorStop(1, '#edda8c55');
  g.fillStyle = light;
  g.fillRect(0, 4, 480, 106);
  g.fillStyle = '#ad9564';
  g.beginPath();
  g.moveTo(0, 96);
  g.bezierCurveTo(90, 88, 150, 105, 210, 88);
  g.bezierCurveTo(280, 77, 310, 105, 390, 93);
  g.lineTo(480, 96);
  g.lineTo(480, 110);
  g.lineTo(0, 110);
  g.closePath();
  g.fill();
  g.fillStyle = '#7c8580';
  g.beginPath();
  g.moveTo(104, 82);
  g.lineTo(113, 65);
  g.lineTo(158, 60);
  g.lineTo(176, 75);
  g.lineTo(170, 94);
  g.lineTo(104, 97);
  g.closePath();
  g.fill();
  g.strokeStyle = '#c8c4a488';
  g.beginPath();
  g.moveTo(114, 65);
  g.lineTo(158, 60);
  g.lineTo(176, 75);
  g.stroke();
  for (let k = 0; k < 9; k++) {
    const x = 200 + k * 7, top = 31 + (k * 13 % 32);
    g.strokeStyle = k % 2 ? '#7faa64' : '#578658';
    g.lineWidth = 1.5 + (k % 3) * .6;
    g.beginPath();
    g.moveTo(x, 98);
    g.bezierCurveTo(x + 8, 80, x - 11, top + 12, x + 2, top);
    g.stroke();
    for (let j = 0; j < 3; j++) {
      const y = top + 14 + j * 16;
      g.fillStyle = k % 2 ? '#90b16b' : '#669655';
      g.beginPath();
      g.ellipse(x + (j % 2 ? 4 : -3), y, 5, 2.4, j % 2 ? -.7 : .7, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = '#ccb379';
  for (let k = 0; k < 35; k++)
    g.fillRect(292 + (k * 23 % 78), 91 + (k * 7 % 17), 1.5, 1);
  g.fillStyle = '#222c37';
  g.beginPath();
  g.moveTo(4, 85);
  g.quadraticCurveTo(49, 64, 86, 87);
  g.lineTo(94, 99);
  g.lineTo(2, 100);
  g.closePath();
  g.fill();
  g.fillStyle = '#e7d78b25';
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.moveTo(422 + k * 17, 4);
    g.lineTo(384 + k * 19, 102);
    g.lineTo(402 + k * 20, 102);
    g.lineTo(428 + k * 17, 4);
    g.fill();
  }
  [3, 0, 1, 2, 4].forEach((i, slot) => {
    const amount = Math.round(values[i] * 14);
    for (let k = 0; k < amount; k++) {
      const x = slot * 96 + 14 + (k * 37 % 67),
            y = (i === 2 ? 84 : 25) + (k * 19 % (i === 2 ? 13 : 48)), sign = k % 3 ? 1 : -1;
      g.save();
      g.translate(x, y);
      g.scale(sign, 1);
      g.fillStyle = colors[i];
      g.beginPath();
      g.ellipse(0, 0, 4.8, 2.3, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(-4, 0);
      g.lineTo(-8, -3);
      g.lineTo(-8, 3);
      g.closePath();
      g.fill();
      g.fillStyle = '#112e36';
      g.beginPath();
      g.arc(2.5, -.4, .7, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    const x = slot * 96;
    g.fillStyle = '#c9d9d3';
    g.font = '11px system-ui';
    g.fillText(labels[i], x + 5, 127);
    g.fillStyle = '#2b4750';
    g.fillRect(x + 5, 135, 82, 3);
    g.fillStyle = colors[i];
    g.fillRect(x + 5, 135, 82 * Math.min(1, values[i]), 3);
  });
  cv.title = labels.map((n, i) => n + ': ' + t('units.percent', {n : Math.round(values[i] * 100)}))
                 .join(' · ');
  const hc = el('health-chart'), h = chartContext(hc, () => renderHabitatAndHealth(f)),
        sick = f.disease?.sick || 0, total = Math.max(0, f.hatched || 0);
  h.clearRect(0, 0, 480, 100);
  h.font = '12px system-ui';
  for (let k = 0; k < Math.min(100, total); k++) {
    h.fillStyle =
        k < Math.round(Math.min(100, total) * sick / Math.max(1, total)) ? '#d88d80' : '#85c4ad';
    h.beginPath();
    h.arc(10 + (k % 50) * 9.3, 14 + Math.floor(k / 50) * 14, 3, 0, 2 * Math.PI);
    h.fill();
  }
  h.fillStyle = '#bad0d3';
  h.fillText(t('energy_view.health', {healthy : total - sick, sick}), 4, 58);
  const names = [ 'spontaneous', 'food', 'carrion', 'contact' ],
        titles =
            [
              t('energy_view.spontan'), t('energy_view.futter'), t('energy_view.aas'),
              t('energy_view.kontakt')
            ],
        max = Math.max(1, ...names.map(k => f.disease?.[k] || 0));
  names.forEach((key, i) => {
    const x = i * 120, v = f.disease?.[key] || 0;
    h.strokeStyle = '#d0a581';
    h.beginPath();
    h.moveTo(x + 8, 90);
    h.lineTo(x + 8, 90 - 24 * v / max);
    h.stroke();
    h.fillStyle = '#bad0d3';
    h.fillText(titles[i], x + 17, 85);
  });
  hc.title = t('energy_view.diseases', {
    list : names
               .map((n, i) =>
                        t('energy_view.diseaseCount', {name : titles[i], n : f.disease?.[n] || 0}))
               .join(' · ')
  });
}

export function renderEnergy(f) {
  renderHabitatAndHealth(f);
  const reproduction = el('reproduction-details');
  reproduction.ontoggle = () => reproduction.open && renderReproduction(f);
  if (reproduction.open)
    renderReproduction(f);
  renderEnergyTrend(f);
  const energy = f.energy_breakdown || {}, total = Object.values(energy).reduce((a, b) => a + b, 0),
        bar = el('energy-bar');
  const groups = [
    [ 'food', t('energy_view.kunstfutter'), '#e6b568', [ 0 ] ],
    [ 'grass', t('energy_view.pflanzen'), '#a6c854', [ 5 ] ],
    [ 'drift', t('energy_view.treibgut'), '#919b58', [ 5 ] ],
    [ 'algae', t('energy_view.algen'), '#4a9e76', [ 4 ] ],
    [ 'plankton', t('energy_view.plankton'), '#69b7bd', [ 6 ] ],
    [ 'worms', t('energy_view.wuermer'), '#d68c99', [ 7 ] ],
    [ 'shellfish', t('energy_view.schalentiere'), '#a993d4', [ 8, 9 ] ],
    [ 'detritus', t('energy_view.bodennahrung'), '#a48057', [ 10 ] ],
    [ 'animal', t('energy_view.fischEiAas'), '#cf7964', [ 1, 2, 3 ] ]
  ];
  for (const g of groups)
    g[2] = foodColors[foodDisplayIndex(g[3][0], g[0] === 'drift')] || g[2];
  const values = {
    ...energy,
    shellfish : (energy.crabs || 0) + (energy.mussels || 0),
    animal : (energy.fish || 0) + (energy.eggs || 0) + (energy.corpses || 0)
  },
        diet = f.recent_diet || [], eaten = diet.reduce((a, b) => a + b, 0),
        window = f.performance?.window_steps || 0;
  text('energy-total', '');
  el('energy-total').title = t('energy_view.gespeicherteEnergieZufuhrUnd');
  for (const [key, name, color] of [...groups, [ 'gut', t('energy_view.darm'), '#b8b795' ],
                                    [ 'sperm', t('energy_view.spermien'), '#71818c' ]]) {
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
    item.part.style.width = 100 * (values[key] || 0) / Math.max(1, total) + '%';
    item.part.title =
        t('energy_view.namedEnergy', {name, n : formatNumber(Math.round(values[key] || 0))});
    item.label.title = item.part.title;
  }
  const box = el('source-budget-bars');
  if (!box.children.length) {
    const heading = document.createElement('div');
    heading.className = t('energy_view.energySourceEnergyPair');
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
      icon.width = icon.height = 24;
      icon.setAttribute('aria-hidden', 'true');
      paintEcologyIcon(icon.getContext('2d'), foodDisplayIndex(sources[0], key === 'drift'), 12, 12,
                       color, 1);
      nameTag.textContent = name;
      label.append(icon, nameTag);
      row.appendChild(label);
      for (let i = 0; i < 2; i++) {
        const cell = document.createElement('div'), value = document.createElement('output'),
              track = document.createElement('div'), fill = document.createElement('i');
        cell.className = 'energy-source-value';
        track.className = 'energy-track';
        fill.style.background = color;
        track.appendChild(fill);
        cell.append(value, track);
        row.appendChild(cell);
      }
      box.appendChild(row);
    }
  }
  groups.forEach(([ key, name, color, sources ], i) => {
    const row = box.children[i + 1], stock = values[key] || 0,
          uptake = key === 'drift'   ? Math.min(diet[5] || 0, f.recent_drift || 0)
                   : key === 'grass' ? Math.max(0, (diet[5] || 0) - (f.recent_drift || 0))
                                     : sources.reduce((a, j) => a + (diet[j] || 0), 0);
    [stock, uptake].forEach((value, k) => {
      const cell = row.children[k + 1], share = 100 * value / Math.max(1e-12, k ? eaten : total);
      cell.children[0].textContent = '';
      cell.children[0].hidden = true;
      cell.children[1].children[0].style.width = share + '%';
      cell.title = (k ? t('energy_view.verwertbareAufnahme') : t('energy_view.vorrat')) + ': ' +
                   value.toLocaleString(t('units.locale'), {maximumFractionDigits : 1}) + ' E · ' +
                   t('units.percent', {n : formatNumber(share, 1, true)});
    });
    row.title = t('energy_view.feedingWindow', {name, n : formatNumber(window)});
  });
  box.children[0].children[2].textContent = t('energy_view.frass');
  box.children[0].title = t('energy_view.vorratAnteilAnGespeicherter');
  const supply = f.energy_supply, flux = el('supply-bars');
  if (supply) {
    if (!flux.children.length) {
      const title = document.createElement('span'), track = document.createElement('div'),
            out = document.createElement('output');
      track.className = 'supply-track';
      for (let i = 0; i < 4; ++i)
        track.appendChild(document.createElement('i'));
      flux.append(title, track, out);
    }
    flux.children[0].textContent = t('energy_view.anteile');
    flux.children[2].textContent = '';
    flux.children[2].hidden = true;
    const shares = f.parameters ? supplyShown(flux.children[1], f.parameters) : null;
    if (shares)
      shares.push(Math.max(0, 1 - shares.reduce((x, y) => x + y, 0)));
    [supply.artificial, supply.plankton, supply.benthic, supply.producers].forEach((v, i) => {
      const part = flux.children[1].children[i];
      part.style.width = 100 * (shares ? shares[i] : v / Math.max(1e-12, supply.total)) + '%';
      part.style.background = [ '#e6b568', '#69b7bd', '#bd937e', '#79b35e' ][i];
      part.title = t('energy_view.supplyPart',
                     {name : tList('energy_view.supplyNames')[i], n : formatNumber(v, 2)});
    });
    renderSupplyShares(f);
    const flow = f.food_flow || {};
    flux.title = t('energy_view.supplyBudget', {
      area : formatNumber(Math.round(supply.water_area)),
      nature : formatNumber(supply.nature, 2, true),
      assisted : Math.round(flow.assisted || 0),
      support : Math.round(flow.support || 0),
      animals : Math.round(supply.animal_initial || 0)
    });
  }
  text('energy-status',
       f.population_size >= f.population_limit ? t('energy_view.alleTierplaetzeBelegt') : '');
}

// The supply bar itself is the control: drag a border between two colours to shift the shares of
// artificial food, plankton and bottom animals; the rest feeds the producers (Bewuchs).
const SUPPLY_SHARES = [ 'food_supply_share', 'plankton_supply_share', 'benthic_supply_share' ];
const SUPPLY_SEND_MS = 100, SUPPLY_GRACE_MS = 3000;

// While dragging, and after release until the server echoes the new shares (or a grace period
// ends), the local shares are authoritative; incoming frames must not pull the borders back.
function supplyShown(track, parameters) {
  const server = SUPPLY_SHARES.map(n => parameters?.[n] ?? 0), local = track.local;
  if (!local)
    return server;
  if (!track.dragging && !track.sending &&
      (local.values.every((v, i) => Math.abs(v - server[i]) < 2e-3) ||
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
    const values = track.local.values.map(v => Math.round(1000 * v) / 1000),
          old = track.sent || SUPPLY_SHARES.map(n => track.parameters?.[n] ?? 0);
    // Lower shares first, so the sum never exceeds the whole supply on the way.
    const order = [ 0, 1, 2 ].sort((a, b) => (values[a] - old[a]) - (values[b] - old[b]));
    for (const k of order)
      if (Math.abs(values[k] - old[k]) > 1e-4) {
        await command('parameter', {name : SUPPLY_SHARES[k], value : values[k]});
        old[k] = values[k];
      }
    track.sent = old;
  } finally {
    track.sending = false;
    if (track.local)
      track.local.until = performance.now() + SUPPLY_GRACE_MS;
  }
  if (track.dirty) {
    track.dirty = false;
    sendSupplyShares(track);
  }
}

function scheduleSupplyShares(track) {
  const wait = SUPPLY_SEND_MS - (performance.now() - (track.lastSend || 0));
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
        names =
            [
              t('energy_view.kunstfutter'), t('energy_view.plankton'), t('energy_view.bodentiere'),
              t('energy_view.bewuchs')
            ],
        colors = [ '#e6b568', '#69b7bd', '#bd937e', '#79b35e' ];
  if (!legend.children.length)
    names.forEach((name, i) => {
      const item = document.createElement('span'), dot = document.createElement('i'),
            value = document.createElement('b');
      dot.style.background = colors[i];
      item.title = name;
      item.append(dot, value);
      legend.appendChild(item);
    });
  parts.forEach((v, i) => {
    legend.children[i].children[1].textContent = t('units.percent', {n : Math.round(100 * v)});
    legend.children[i].title =
        t('energy_view.supplyShare', {name : names[i], n : Math.round(100 * v)});
  });
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
    const widths = [ c[0], c[1] - c[0], c[2] - c[1], 1 - c[2] ];
    widths.forEach((w, i) => {
      track.children[i].style.width = 100 * w + '%';
      legend.children[i].children[1].textContent = t('units.percent', {n : Math.round(100 * w)});
    });
  };
  track.onpointerdown = e => {
    const rect = track.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width,
          c = cumulative();
    const best = Math.min(...c.map(v => Math.abs(v - x)));
    if (best > 12 / rect.width)
      return;
    // Borders on the same spot: the first movement decides which one follows the pointer.
    const ties = [ 0, 1, 2 ].filter(k => Math.abs(c[k] - x) <= best + 1e-6);
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
          hi = d.border < 2 ? d.c[d.border + 1] : 1;
    d.c[d.border] = Math.max(lo, Math.min(hi, (e.clientX - rect.left) / rect.width));
    track.local = {
      values : [ d.c[0], d.c[1] - d.c[0], d.c[2] - d.c[1] ],
      until : performance.now() + SUPPLY_GRACE_MS
    };
    show(d.c);
    scheduleSupplyShares(track);
  };
  track.onpointerup = track.onpointercancel = () => {
    if (!track.dragging)
      return;
    track.dragging = null;
    if (track.local) {
      track.local.until = performance.now() + SUPPLY_GRACE_MS;
      clearTimeout(track.timer);
      track.timer = 0;
      sendSupplyShares(track);
    }
  };
}

export function renderDeathCauses(f) {
  const counts = f.death_causes || [], signature = JSON.stringify(counts);
  if (signature === energy_viewState.deathChartSignature)
    return;
  energy_viewState.deathChartSignature = signature;
  const box = el('death-chart');
  box.replaceChildren();
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (!total) {
    box.textContent = t('energy_view.nochKeineTodesfaelle');
    return;
  }
  for (let i = 0; i < counts.length; ++i) {
    if (!counts[i])
      continue;
    const row = document.createElement('div'), label = document.createElement('span'),
          bar = document.createElement('progress'), value = document.createElement('span');
    row.className = 'death-row';
    label.textContent = deathNames[i];
    bar.max = total;
    bar.value = counts[i];
    value.textContent = formatNumber(counts[i]);
    row.title = t(
        'energy_view.deathShare',
        {name : deathNames[i], n : counts[i], total, share : Math.round(100 * counts[i] / total)});
    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(value);
    box.appendChild(row);
  }
}

export function renderNovelty(f, p) {
  const box = el('novelty-contributions'), selected = (f.behavior || []).find(b => b.id === p[4]);
  if (!selected || selected.samples < 80) {
    text('novelty-contributions', t('energy_view.verhaltenWirdNochBeobachtet'));
    return;
  }
  const pool = [
    ...(f.behavior || []).filter(b => b.id !== p[4] && b.samples >= 80).map(b => b.descriptor),
    ...(f.archive || []).filter(a => a.environment === f.environment).map(a => a.descriptor)
  ];
  const closest = pool.reduce((best, d) => {
    const distance = behaviorDistance(d, selected.descriptor);
    return !best || distance < best.distance ? {distance, d} : best;
  }, null);
  if (!closest) {
    text('novelty-contributions', t('energy_view.nochKeinVergleichsprofil'));
    return;
  }
  appendBehaviorComparison(box, selected.descriptor, closest.d,
                           t('energy_view.demAehnlichstenProfilNeuheitswert'));
}

const initializers = {
  "deathChartSignature" : () => { energy_viewState.deathChartSignature = ''; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
