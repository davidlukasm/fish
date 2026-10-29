import {chartContext, chartSize} from './dom.js';
import {updateCockpitState} from './cockpit.js';
import {appendBehaviorComparison, behaviorDistance} from './behavior_view.js';
import {cockpitState, energyParts, renderReproduction} from './cockpit.js';
import {el, text} from './dom.js';
import {command} from './session.js';
import {deathNames, paintEcologyIcon, foodDisplayIndex, foodColors} from './feeding_view.js';
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
  g.fillText('Vorrat ' + Math.round(total).toLocaleString('de') + ' Energie', 0, 15);
  g.fillStyle = delta < 0 ? '#df9c8d' : '#8bcab6';
  g.fillText((delta >= 0 ? '+' : '') + delta.toFixed(2).replace('.', ',') + ' / Schritt', 285, 15);
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
  g.fillText(reserve.toFixed(1).replace('.', ','), 408, 101);
  cv.title =
      'Verlauf seit Öffnen der Anzeige, bis 2.000 Schritte. Obergrenze ist kein Sollstand. Durchschnittliche Reserve und Trend zeigen Engpässe besser als der Füllstand allein.';
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
  const labels = [ 'Flächen', 'Bewuchs', 'Sediment', 'Dunkelheit', 'Licht' ],
        colors = [ '#c3b38f', '#8fae62', '#a7845a', '#8d8fba', '#e4cd80' ];
  // One connected cross-section makes the habitats legible without abstract symbols.
  const water = g.createLinearGradient(0, 4, 0, 110);
  water.addColorStop(0, '#39717d');
  water.addColorStop(.55, '#224d59');
  water.addColorStop(1, '#17333f');
  g.fillStyle = water;
  g.fillRect(0, 4, 480, 106);
  const light = g.createLinearGradient(270, 0, 480, 0);
  light.addColorStop(0, '#0e172c90');
  light.addColorStop(.5, '#1c3c4400');
  light.addColorStop(1, '#edda8c55');
  g.fillStyle = light;
  g.fillRect(270, 4, 210, 106);
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
  g.moveTo(8, 82);
  g.lineTo(17, 65);
  g.lineTo(62, 60);
  g.lineTo(80, 75);
  g.lineTo(74, 94);
  g.lineTo(8, 97);
  g.closePath();
  g.fill();
  g.strokeStyle = '#c8c4a488';
  g.beginPath();
  g.moveTo(18, 65);
  g.lineTo(62, 60);
  g.lineTo(80, 75);
  g.stroke();
  for (let k = 0; k < 9; k++) {
    const x = 104 + k * 7, top = 31 + (k * 13 % 32);
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
    g.fillRect(196 + (k * 23 % 78), 91 + (k * 7 % 17), 1.5, 1);
  g.fillStyle = '#222c37';
  g.beginPath();
  g.moveTo(284, 85);
  g.quadraticCurveTo(329, 64, 366, 87);
  g.lineTo(374, 99);
  g.lineTo(282, 100);
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
  for (let i = 0; i < 5; i++) {
    const amount = Math.round(values[i] * 14);
    for (let k = 0; k < amount; k++) {
      const x = i * 96 + 14 + (k * 37 % 67),
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
    const x = i * 96;
    g.fillStyle = '#c9d9d3';
    g.font = '11px system-ui';
    g.fillText(labels[i], x + 5, 127);
    g.fillStyle = '#2b4750';
    g.fillRect(x + 5, 135, 82, 3);
    g.fillStyle = colors[i];
    g.fillRect(x + 5, 135, 82 * Math.min(1, values[i]), 3);
  }
  cv.title = labels.map((n, i) => n + ': ' + Math.round(values[i] * 100) + ' %').join(' · ');
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
  h.fillText((total - sick) + ' gesund · ' + sick + ' krank', 4, 58);
  const names = [ 'spontaneous', 'food', 'carrion', 'contact' ],
        titles = [ 'Spontan', 'Futter', 'Aas', 'Kontakt' ],
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
  hc.title = 'Erkrankungen seit Laufbeginn: ' +
             names.map((n, i) => titles[i] + ' ' + (f.disease?.[n] || 0)).join(' · ');
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
    [ 'food', 'Kunstfutter', '#e6b568', [ 0 ] ], [ 'grass', 'Pflanzen', '#a6c854', [ 5 ] ],
    [ 'drift', 'Treibgut', '#919b58', [ 5 ] ], [ 'algae', 'Algen', '#4a9e76', [ 4 ] ],
    [ 'plankton', 'Plankton', '#69b7bd', [ 6 ] ], [ 'worms', 'Würmer', '#d68c99', [ 7 ] ],
    [ 'shellfish', 'Schalentiere', '#a993d4', [ 8, 9 ] ],
    [ 'detritus', 'Bodennahrung', '#a48057', [ 10 ] ],
    [ 'animal', 'Fisch · Ei · Aas', '#cf7964', [ 1, 2, 3 ] ]
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
  el('energy-total').title =
      'Gespeicherte Energie; Zufuhr und Fraß werden getrennt darunter gezeigt.';
  for (const [key, name, color] of [...groups, [ 'gut', 'Darm', '#b8b795' ],
                                    [ 'sperm', 'Spermien', '#71818c' ]]) {
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
    item.part.title = name + ': ' + Math.round(values[key] || 0).toLocaleString('de') + ' Energie';
    item.label.title = item.part.title;
  }
  const box = el('source-budget-bars');
  if (!box.children.length) {
    const heading = document.createElement('div');
    heading.className = 'energy-source energy-pair-key';
    for (const name of ['Nahrung', 'Vorrat', 'Fraß']) {
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
      cell.title = (k ? 'Verwertbare Aufnahme' : 'Vorrat') + ': ' +
                   value.toLocaleString('de', {maximumFractionDigits : 1}) + ' E · ' +
                   share.toFixed(1) + ' %';
    });
    row.title = name + ' · Fraß: verwertbare Aufnahme der letzten ' + window.toLocaleString('de') +
                ' Schritte, einschließlich inzwischen gestorbener Fische.';
  });
  box.children[0].children[2].textContent = 'Fraß';
  box.children[0].title =
      'Vorrat: Anteil an gespeicherter Energie. Fraß: Anteil an der verwertbaren Aufnahme. Beide Spalten verwenden durchgehend denselben Prozentmaßstab.';
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
    flux.children[0].textContent = 'Zufuhr';
    flux.children[2].textContent = '';
    flux.children[2].hidden = true;
    [supply.artificial, supply.plankton, supply.benthic, supply.producers].forEach((v, i) => {
      const part = flux.children[1].children[i];
      part.style.width = 100 * v / Math.max(1e-12, supply.total) + '%';
      part.style.background = [ '#e6b568', '#69b7bd', '#bd937e', '#79b35e' ][i];
      part.title = [ 'Kunstfutter', 'Plankton', 'Bodentiere', 'Bewuchs' ][i] + ': ' +
                   v.toLocaleString('de', {maximumFractionDigits : 2}) + ' E/Schritt';
    });
    renderSupplyShares(f);
    const flow = f.food_flow || {};
    flux.title = 'Zufuhrbudget für ' + Math.round(supply.water_area).toLocaleString('de') +
                 ' px² Wasser; nur tatsächlicher Zuwachs wird gebucht.\nNaturverzehr: ' +
                 supply.nature.toFixed(2) +
                 ' E/Schritt.\nZusätzliche Hilfe: ' + Math.round(flow.assisted || 0) +
                 ' Futterenergie; Besatzhilfe: ' + Math.round(flow.support || 0) +
                 ' E. Anfangsbesatz Kleintiere: ' + Math.round(supply.animal_initial || 0) + ' E.';
  }
  text('energy-status', f.population_size >= f.population_limit ? 'Alle Tierplätze belegt' : '');
}

// Direct controls for the shares of the supply: artificial food, plankton and bottom animals.
// Together they may use at most all of the supply; the rest goes to the producers.
function renderSupplyShares(f) {
  const box = el('supply-shares');
  if (!box || !f.parameters)
    return;
  box.parameters = f.parameters;
  const names = [ 'food_supply_share', 'plankton_supply_share', 'benthic_supply_share' ],
        labels = [ 'Kunstfutter', 'Plankton', 'Bodentiere' ];
  if (!box.children.length)
    names.forEach((name, i) => {
      const row = document.createElement('label'), span = document.createElement('span'),
            input = document.createElement('input'), out = document.createElement('output');
      span.textContent = labels[i];
      input.type = 'range';
      input.min = 0;
      input.max = 100;
      input.step = 1;
      out.textContent = '–';
      input.oninput = () => { out.textContent = input.value + ' %'; };
      input.onchange = async () => {
        const others = names.filter(n => n !== name)
                           .reduce((sum, n) => sum + (box.parameters?.[n] || 0), 0),
              value = Math.max(0, Math.min(Number(input.value) / 100, 1 - others));
        input.value = Math.round(100 * value);
        out.textContent = input.value + ' %';
        await command('parameter', {name, value});
      };
      row.title = labels[i] + ': Anteil an der Gesamtzufuhr';
      row.append(span, input, out);
      box.appendChild(row);
    });
  names.forEach((name, i) => {
    const row = box.children[i], input = row.children[1];
    if (document.activeElement === input)
      return;
    const value = Math.round(100 * (f.parameters[name] ?? 0));
    if (Number(input.value) !== value || row.children[2].textContent === '–') {
      input.value = value;
      row.children[2].textContent = value + ' %';
    }
  });
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
    box.textContent = 'Noch keine Todesfälle.';
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
    value.textContent = counts[i].toLocaleString('de');
    row.title = deathNames[i] + ': ' + counts[i] + ' von ' + total + ' Todesfällen (' +
                Math.round(100 * counts[i] / total) + ' %)';
    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(value);
    box.appendChild(row);
  }
}

export function renderNovelty(f, p) {
  const box = el('novelty-contributions'), selected = (f.behavior || []).find(b => b.id === p[4]);
  if (!selected || selected.samples < 80) {
    text('novelty-contributions', 'Verhalten wird noch beobachtet.');
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
    text('novelty-contributions', 'Noch kein Vergleichsprofil.');
    return;
  }
  appendBehaviorComparison(box, selected.descriptor, closest.d,
                           'dem ähnlichsten Profil · Neuheitswert: Mittel über mehrere Nachbarn');
}

const initializers = {
  "deathChartSignature" : () => { energy_viewState.deathChartSignature = ''; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
