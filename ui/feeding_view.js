import {brainClamp} from './brain.js';
import {el} from './dom.js';
export const feeding_viewState = {};
export let deathNames;

export let displayNumber;

export function fishStat(key, label, value, note = '', group = 'fish') {
  let cell = feeding_viewState.fishStatCells.get(key);
  if (!cell) {
    const box = document.createElement('div'), dt = document.createElement('dt'),
          dd = document.createElement('dd'), small = document.createElement('small');
    box.appendChild(dt);
    box.appendChild(dd);
    box.appendChild(small);
    el(group === 'vitals' ? 'fish-vitals' : group + '-stats').appendChild(box);
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
  cell.gauge.setAttribute('aria-label',
                          cell.dt.textContent + ' ' + Math.round(100 * brainClamp(value)) + ' %');
  cell.gauge.style.setProperty?.('--gauge-color', color);
}

export let foodSources;

export function ecologyFor(t) {
  const n = t?.ecology_steps || 0, a = t?.ecology || [];
  return {
    samples : n,
    raw_diet : t?.raw_diet || [],
    digested : t?.digested || 0,
    drift_grass : t?.drift_grass || 0,
    surface : (a[0] || 0) / Math.max(1, n),
    grass : (a[1] || 0) / Math.max(1, n),
    buried : (a[2] || 0) / Math.max(1, n),
    shadow : (a[3] || 0) / Math.max(1, n),
    light : (a[4] || 0) / Math.max(1, n)
  };
}

export function foodDisplayIndex(source, drift = false) {
  return source === 5 && drift ? 6 : source + (source >= 6 ? 1 : 0);
}

export function foodAmounts(diet = [], eco = {}) {
  const a = Array.from({length : 11}, (_, i) => Math.max(0, diet[i] || 0)),
        drift = Math.min(a[5], Math.max(0, eco.drift_grass || 0));
  return [...a.slice(0, 5), a[5] - drift, drift, ...a.slice(6) ];
}

export let foodColors;

export let foodShortNames;

export let habitatSources;

export function paintEcologyIcon(g, kind, x, y, color, size = 1) {
  g.save();
  g.translate(x, y);
  g.scale(size, size);
  g.strokeStyle = g.fillStyle = color;
  g.lineWidth = 1.5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = (ax, ay, bx, by) => {
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }, dot = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, 2 * Math.PI);
    g.fill();
  };
  const fish = () => {
    g.beginPath();
    g.moveTo(-6, 0);
    g.bezierCurveTo(-1, -5, 4, -4, 7, 0);
    g.bezierCurveTo(4, 4, -1, 5, -6, 0);
    g.lineTo(-10, 4);
    g.lineTo(-10, -4);
    g.closePath();
    g.fill();
  };
  if (kind === 0) {
    dot(-4, -3, 2);
    dot(4, -1, 2.6);
    dot(-1, 5, 1.7);
  } else if (kind === 1)
    fish();
  else if (kind === 2) {
    g.beginPath();
    g.ellipse(0, 0, 4, 6, -.3, 0, 2 * Math.PI);
    g.stroke();
    dot(0, 1, 1.4);
  } else if (kind === 3) {
    line(-8, 0, 8, 0);
    for (let k = -4; k <= 4; k += 4) {
      line(k, -4, k + 2, 0);
      line(k + 2, 0, k, 4);
    }
    g.beginPath();
    g.arc(8, 0, 2.5, 0, 2 * Math.PI);
    g.stroke();
  } else if (kind === 4) {
    line(-9, 5, 9, 5);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-8, 2);
    g.quadraticCurveTo(-4, -2, 0, 1);
    g.quadraticCurveTo(4, 3, 8, 0);
    g.stroke();
  } else if (kind === 5 || kind === 6 || kind === 'grass') {
    if (kind === 6)
      g.rotate(-1);
    for (let k = -1; k <= 1; k++) {
      g.beginPath();
      g.moveTo(k * 3, 6);
      g.quadraticCurveTo(k * 2 - 2, -1, k * 5, -7);
      g.stroke();
    }
    if (kind !== 6) {
      g.globalAlpha = .6;
      line(-9, 7, 9, 7);
    }
  } else if (kind === 7) {
    dot(-5, -3, 1.5);
    dot(3, -4, 2);
    dot(0, 4, 1.7);
  } else if (kind === 8) {
    g.beginPath();
    g.moveTo(-8, 3);
    g.bezierCurveTo(-3, -8, 3, 8, 8, -3);
    g.stroke();
  } else if (kind === 9) {
    dot(0, 0, 4);
    for (let i = -1; i <= 1; i += 2) {
      line(i * 3, -2, i * 8, -5);
      line(i * 4, 0, i * 9, 1);
      line(i * 3, 2, i * 8, 5);
    }
  } else if (kind === 10) {
    g.beginPath();
    g.arc(0, 1, 7, Math.PI, 2 * Math.PI);
    g.lineTo(5, 5);
    g.lineTo(-5, 5);
    g.closePath();
    g.stroke();
    for (let x = -4; x <= 4; x += 4)
      line(0, 4, x, -3);
  } else if (kind === 11) {
    line(-9, 4, 9, 4);
    dot(-5, 0, 1.6);
    dot(0, -2, 2);
    dot(5, 0, 1.3);
  } else if (kind === 'surface') {
    line(-9, 5, 9, 5);
    g.scale(.7, .7);
    g.translate(0, -4);
    fish();
  } else if (kind === 'buried') {
    g.globalAlpha = .45;
    g.scale(.8, .8);
    fish();
    g.globalAlpha = 1;
    line(-10, -2, 10, -2);
    dot(-5, 4, 1);
    dot(2, 5, 1);
    dot(7, 3, 1);
  } else if (kind === 'shadow') {
    g.beginPath();
    g.arc(0, 0, 6, -Math.PI / 2, Math.PI / 2);
    g.quadraticCurveTo(-1, 0, 0, -6);
    g.fill();
  } else if (kind === 'light') {
    g.beginPath();
    g.arc(0, 0, 3, 0, 2 * Math.PI);
    g.stroke();
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      line(5 * Math.cos(a), 5 * Math.sin(a), 8 * Math.cos(a), 8 * Math.sin(a));
    }
  }
  g.restore();
}

export function paintFeedingChart(box) {
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
  const hits = [], percent = v => displayNumber(100 * v, 1) + ' %',
        compact = v => v >= 1000000 ? displayNumber(v / 1000000, 1) + ' Mio.'
                       : v >= 10000 ? displayNumber(v / 1000, 1) + ' k'
                                    : displayNumber(v, 1);
  const hit = (x, y, width, height, title) => hits.push({x, y, width, height, title});
  g.textAlign = 'left';
  g.font = '600 10px system-ui, sans-serif';
  g.fillStyle = '#9bb1b6';
  g.fillText(m.living ? 'VERWERTBARE AUFNAHME · GESAMT / LEBEND' : 'VERWERTBARE AUFNAHME', 4, 15);
  const cx = 53, cy = 83, r = 39;
  g.lineWidth = 10;
  g.strokeStyle = '#2b424a';
  g.beginPath();
  g.arc(cx, cy, r, 0, 2 * Math.PI);
  g.stroke();
  let angle = -Math.PI / 2;
  amounts.forEach((value, i) => {
    if (!value || !total)
      return;
    const arc = 2 * Math.PI * value / total;
    g.strokeStyle = foodColors[i];
    g.beginPath();
    g.arc(cx, cy, r, angle + .012, angle + Math.max(.012, arc - .012));
    g.stroke();
    angle += arc;
  });
  g.textAlign = 'center';
  g.fillStyle = '#e3eeeb';
  g.font = '600 19px system-ui, sans-serif';
  g.fillText(compact(total), cx, cy + 2);
  g.fillStyle = '#9bb1b6';
  g.font = '10px system-ui, sans-serif';
  g.fillText('Energie', cx, cy + 18);
  g.fillStyle = '#a2d9c6';
  g.font = '600 20px system-ui, sans-serif';
  g.fillText(steps ? compact(100 * total / steps) : '–', cx, 153);
  g.fillStyle = '#9bb1b6';
  g.font = '10px system-ui, sans-serif';
  g.fillText('je 100 Schritte', cx, 170);
  hit(0, 28, 104, 99,
      displayNumber(total, 1) + ' verwertbare Energie aufgenommen.\n' + displayNumber(steps) +
          ' Lebensschritte seit dem Schlupf ausgewertet.');
  hit(0, 132, 104, 45,
      (steps ? displayNumber(100 * total / steps, 2) : '–') + ' Energie je 100 Lebensschritte.');
  for (const [value, label,
              y] of [[ (eco.raw_diet || []).reduce((a, b) => a + b, 0), 'roh geschluckt', 207 ],
                     [ eco.digested || 0, 'tatsächlich verdaut', 252 ]]) {
    g.textAlign = 'center';
    g.fillStyle = '#e3eeeb';
    g.font = '600 16px system-ui';
    g.fillText(compact(value), cx, y);
    g.fillStyle = '#9bb1b6';
    g.font = '10px system-ui';
    g.fillText(label, cx, y + 16);
  }
  const start = 118, barX = start + 69, barWidth = Math.max(12, w - barX - 43);
  amounts.forEach((value, i) => {
    const y = 35 + i * 22, share = total ? value / total : 0,
          color = value ? foodColors[i] : '#68838b';
    paintEcologyIcon(g, i, start, y - 4, color, .65);
    g.textAlign = 'left';
    g.font = '11px system-ui, sans-serif';
    g.fillStyle = color;
    g.fillText(foodShortNames[i], start + 14, y);
    g.fillStyle = '#2b424a';
    g.fillRect(barX, y - 7, barWidth, 5);
    g.fillStyle = foodColors[i];
    g.fillRect(barX, y - 7, barWidth * share, m.living ? 4 : 5);
    if (m.living) {
      const liveTotal = m.living.reduce((a, b) => a + b, 0),
            liveShare = liveTotal ? m.living[i] / liveTotal : 0;
      g.globalAlpha = .55;
      g.fillRect(barX, y - 2, barWidth * liveShare, 4);
      g.globalAlpha = 1;
    }
    g.textAlign = 'right';
    g.font = '11px system-ui, sans-serif';
    g.fillStyle = value ? '#e3eeeb' : '#68838b';
    g.fillText(total ? displayNumber(100 * share, 1) + ' %' : '–', w - 3, y);
    hit(start - 10, y - 15, w - start + 10, 22,
        foodSources[i] + (m.living ? '\nGesamt: ' : '\n') +
            (total ? percent(share) + ' der verwertbaren Aufnahme'
                   : 'Bisher keine Nahrung aufgenommen.') +
            '\n' + displayNumber(value, 1) + ' verwertbar · ' +
            (steps ? displayNumber(100 * value / steps, 2) : '–') + ' je 100 Lebensschritte.' +
            '\nRohe Aufnahme' + ([ 5, 6 ].includes(i) ? ' Pflanzen gesamt' : '') + ': ' +
            displayNumber(eco.raw_diet?.[i > 5 ? Math.max(5, i - 1) : i] || 0, 1) + ' Energie.' +
            (m.living ? '\nLebend: ' + percent(m.living[i] /
                                               Math.max(1e-12, m.living.reduce((a, b) => a + b, 0)))
                      : ''));
  });
  g.strokeStyle = '#2d424b';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(4, 300);
  g.lineTo(w - 4, 300);
  g.stroke();
  g.textAlign = 'left';
  g.fillStyle = '#9bb1b6';
  g.font = '600 10px system-ui, sans-serif';
  g.fillText(m.living ? 'LEBENSRAUM · GESAMT / LEBEND' : 'LEBENSRAUM', 4, 319);
  habitatSources.forEach(([ key, label, color, note ], i) => {
    const cell = w / 5, x = cell * (i + .5), y = 349,
          value = Math.max(0, Math.min(1, eco[key] || 0));
    g.lineWidth = 3;
    g.strokeStyle = '#2b424a';
    g.beginPath();
    g.arc(x, y, 16, 0, 2 * Math.PI);
    g.stroke();
    if (eco.samples && value > 0) {
      g.strokeStyle = color;
      g.beginPath();
      g.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * value);
      g.stroke();
    }
    if (m.liveEco) {
      g.strokeStyle = '#2b424a';
      g.beginPath();
      g.arc(x, y, 21, 0, 2 * Math.PI);
      g.stroke();
      g.strokeStyle = color;
      g.globalAlpha = .55;
      g.beginPath();
      g.arc(x, y, 21, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * brainClamp(m.liveEco[key] || 0));
      g.stroke();
      g.globalAlpha = 1;
    }
    paintEcologyIcon(g, key, x, y, eco.samples ? color : '#68838b', .8);
    g.fillStyle = eco.samples ? '#e3eeeb' : '#68838b';
    g.font = '600 12px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(eco.samples ? displayNumber(100 * value) + ' %' : '–', x, 381);
    g.fillStyle = '#9bb1b6';
    g.font = '10px system-ui, sans-serif';
    g.fillText(label, x, 396);
    hit(i * cell, 328, cell, 74,
        label + (m.liveEco ? ' · Gesamt ' : ' · ') +
            (eco.samples ? percent(value) : 'wird beobachtet') +
            (m.liveEco ? '\nLebend ' + percent(m.liveEco[key] || 0) : '') + '\n' + note +
            (key === 'light' ? '' : ' Zeitanteile können sich überschneiden.') + '\n' +
            displayNumber(eco.samples || 0) + ' Lebensschritte beobachtet.');
  });
  box.feedingHits = hits;
  const focused = hits[box.feedingFocus];
  if (focused) {
    g.strokeStyle = '#e9c185';
    g.lineWidth = 1;
    g.strokeRect(focused.x + 1, focused.y + 1, focused.width - 2, focused.height - 2);
  }
  c.title =
      focused?.title ||
      (m.living ? 'Oben/innerer Ring: Gesamt; unten/äußerer Ring: Lebend. ' : '') +
          'Nahrungsanteile und Lebensraum. Für genaue Werte auf eine Quelle oder einen Ring zeigen; Pfeiltasten wechseln die Anzeige.';
  c.setAttribute(
      'aria-label',
      'Nahrung: ' +
          hits.slice(2, 2 + amounts.length).map(x => x.title.replaceAll('\n', ': ')).join('; ') +
          '. Lebensraum: ' +
          hits.slice(2 + amounts.length).map(x => x.title.replaceAll('\n', ': ')).join('; '));
}

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
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key))
        return;
      e.preventDefault();
      const n = box.feedingHits.length;
      box.feedingFocus =
          e.key === 'Home' ? 0
          : e.key === 'End'
              ? n - 1
              : (box.feedingFocus + ([ 'ArrowLeft', 'ArrowUp' ].includes(e.key) ? n - 1 : 1) + n) %
                    n;
      paintFeedingChart(box);
    };
  }
  const width = Math.max(300, Math.min(600, Math.round(box.getBoundingClientRect().width) || 340)),
        amounts = foodAmounts(diet, eco);
  box.feedingModel = {
    width,
    height : 406,
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
  "deathNames" : () => {
    deathNames = [
      'Verhungert', 'Tödlich verletzt', 'Ei unbefruchtet verfallen', 'Entwicklung nicht überlebt',
      'Gehirnbudget überschritten', 'Ei gefressen', 'Altersschwäche', 'Krankheit'
    ];
  },
  "displayNumber" : () => {
    const formats = new Map();
    displayNumber = (value, digits = 0) => {
      if (!Number.isFinite(value))
        return '–';
      if (!formats.has(digits))
        formats.set(digits, new Intl.NumberFormat('de', {maximumFractionDigits : digits}));
      return formats.get(digits).format(value);
    };
  },
  "foodSources" : () => {
    foodSources = [
      'Futterstücke', 'Fischfleisch', 'Eier', 'Aas', 'Algenbelag', 'Verwurzelte Pflanzen',
      'Treibende Pflanzen', 'Plankton', 'Würmer', 'Krabben', 'Muscheln', 'Bodennahrung'
    ];
  },
  "foodColors" : () => {
    foodColors = [
      '#e8ba78', '#db8c7b', '#c6a2df', '#a78b93', '#69bba0', '#9fc96a', '#75b9bb', '#bdcc85',
      '#da8d86', '#b9a07a', '#8aabb8', '#a49370'
    ];
  },
  "foodShortNames" : () => {
    foodShortNames = [
      'Futter', 'Fisch', 'Eier', 'Aas', 'Algen', 'Pflanzen', 'Treibgut', 'Plankton', 'Würmer',
      'Krabben', 'Muscheln', 'Boden'
    ];
  },
  "habitatSources" : () => {
    habitatSources = [
      [ 'surface', 'Flächen', '#80c6db', 'Nähe zu Boden oder Plattformen.' ],
      [ 'grass', 'Pflanzen', '#9fc96a', 'Aufenthalt zwischen Blattpflanzen.' ],
      [ 'buried', 'Sediment', '#c6a475', 'Körper überwiegend im abgelagerten Sediment.' ],
      [ 'shadow', 'Schatten', '#b6a5df', 'Weniger als 20 % Licht für den Fisch.' ],
      [ 'light', 'Licht', '#e9c185', 'Mittlere tatsächliche Lichtstärke für den Fisch.' ]
    ];
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
