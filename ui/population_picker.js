import {el, text} from './dom.js';
import {command, request} from './session.js';
import {sceneState} from './state.js';
import {FISH, ANATOMY} from './schema.js';
import {fishPreviewPose} from './fish_organs.js';
import {paintFishGlyph} from './fish_painter.js';

const chosen = new Set();
let entries = [], filtered = [], group = 'examples', shown = 0, revision = 0, cards = [], timer = 0;
let loading = false;
let restoreRunning = false;
const batchSize = 6;
const lineCount = n => n.toLocaleString('de') + (n === 1 ? ' Linie' : ' Linien');
let sortDescending = true, sortKey = 'diversity';
const sortChoices = [
  [ 'diversity', 'Vielfalt', 'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z' ],
  [ 'eye', 'Augen', 'M2 12Q12 0 22 12Q12 24 2 12 M15 12a3 3 0 1 0-6 0a3 3 0 1 0 6 0' ],
  [ 'nose', 'Nase', 'M7 19Q19 18 13 4 M3 7Q8 10 3 13 M18 6Q23 10 18 14' ],
  [ 'lateral', 'Seitenlinie', 'M2 7Q7 2 12 7T22 7 M2 13Q7 8 12 13T22 13 M2 19Q7 14 12 19T22 19' ],
  [ 'speed', 'Tempo', 'M3 6h10 M1 12h15 M3 18h10 M14 3l8 9-8 9' ],
  [ 'turn', 'Drehung', 'M5 18a8 8 0 1 0 0-12 M5 2v7h7' ],
  [
    'offspring', 'Nachwuchs',
    'M8 4Q2 10 4 15Q8 21 12 15Q14 10 8 4 M18 12Q14 16 16 20Q18 23 21 20Q23 16 18 12'
  ],
  [ 'observed_intake', 'Aufnahme', 'M4 18l5-9 5 9z M16 5h5v5h-5z' ],
  [ 'plants', 'Pflanzen', 'M12 22V9 M12 14Q1 15 3 3Q13 3 12 14 M12 18Q23 16 21 7Q13 8 12 18' ],
  [ 'plankton', 'Filtern', 'M3 4h18 M6 8v10 M12 8v10 M18 8v10 M3 22h18' ],
  [ 'benthos', 'Boden', 'M2 19h20 M5 16q3-9 6 0 M14 16q2-5 5 0' ],
  [ 'jaw', 'Kiefer', 'M3 6l18 6-18 6 M3 9l14 3-14 3' ],
  [ 'gut', 'Darm', 'M6 3q12 0 12 5T6 13t12 5 M6 21h12' ],
  [ 'teeth', 'Zähne', 'M3 18V7q3-7 6 0v11 M15 18V7q3-7 6 0v11' ],
  [ 'undulation', 'Schlängeln', 'M3 4q18 3 9 8t9 8' ],
  [ 'observed_generation', 'Generation', 'M12 2v7 M4 21v-7h16v7 M12 14v7', 'saved' ]
];

function metricValue(e, key) {
  const organs = e.portrait?.[FISH.organs] || [];
  const sense = key === 'eye'       ? [ ANATOMY.eye_left, ANATOMY.eye_right ]
                : key === 'nose'    ? [ ANATOMY.smell_left, ANATOMY.smell_right ]
                : key === 'lateral' ? [ ANATOMY.lateral_left, ANATOMY.lateral_right ]
                                    : null;
  const anatomy = {
    jaw : ANATOMY.jaw_length,
    gut : ANATOMY.gut_length,
    teeth : ANATOMY.blunt_teeth,
    undulation : ANATOMY.undulation
  };
  if (key in anatomy)
    return e.anatomy?.[key] ?? organs[anatomy[key]];
  const groups = {plants : [ 4, 5 ], plankton : [ 6 ], benthos : [ 7, 8, 9, 10 ]};
  if (key in groups) {
    const diet = e.observed_diet, total = diet?.reduce((a, b) => a + b, 0) || 0;
    return total > 0 ? groups[key].reduce((n, k) => n + (diet[k] || 0), 0) / total : null;
  }
  if (sense)
    return e.sense_cells?.[key] ??
           (e.portrait ? sense.reduce((n, i) => n + (organs[i] || 0), 0) : null);
  if (key === 'speed')
    return e.observed_speed;
  if (key === 'turn')
    return e.observed_torque;
  if (key === 'offspring')
    return e.observed_offspring;
  return e[key];
}

export function rankPopulation(rows, key, descending = true) {
  if (key === 'diversity') {
    const groups = new Map(), ranked = [];
    for (const row of rows) {
      const category = row.genus || row.name.split(' ')[0];
      if (!groups.has(category))
        groups.set(category, []);
      groups.get(category).push(row);
    }
    for (let round = 0; ranked.length < rows.length; ++round)
      for (const group of groups.values())
        if (round < group.length)
          ranked.push(group[round]);
    return ranked;
  }
  const value = e => metricValue(e, key);
  return [...rows ].sort((a, b) => {
    const x = value(a), y = value(b), direction = descending ? -1 : 1;
    if (key === 'name')
      return direction * a.name.localeCompare(b.name, 'de', {numeric : true});
    if (!Number.isFinite(x) || !Number.isFinite(y))
      return Number(Number.isFinite(y)) - Number(Number.isFinite(x));
    return direction * (x - y) || a.name.localeCompare(b.name, 'de', {numeric : true});
  });
}

function sortingControls() {
  const box = el('population-sort');
  if (!box.children.length) {
    for (const [key, label, path, scope] of sortChoices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.key = key;
      button.dataset.scope = scope || '';
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
      const name = document.createElement('span');
      name.textContent = label;
      button.append(name);
      button.title = [ 'eye', 'nose', 'lateral' ].includes(key)
                         ? label + ': nach Sinneszellen sortieren'
                         : label + ': sortieren';
      button.onclick = () => {
        if (sortKey === key)
          sortDescending = !sortDescending;
        else {
          sortKey = key;
          sortDescending = true;
        }
        render();
      };
      box.append(button);
    }
  }
  const choice = sortChoices.find(c => c[0] === sortKey);
  if (choice?.[3] && group === 'examples')
    sortKey = 'diversity';
  for (const button of box.children) {
    button.hidden = !!button.dataset.scope && group === 'examples';
    button.setAttribute('aria-pressed', String(button.dataset.key === sortKey));
    if (button.dataset.key === 'turn')
      button.lastChild.textContent = 'Drehimpuls';
  }
  const order = el('population-sort-direction');
  order.disabled = sortKey === 'diversity';
  order.textContent = sortDescending ? '↓' : '↑';
  order.title =
      sortDescending ? 'Absteigend; aufsteigend sortieren' : 'Aufsteigend; absteigend sortieren';
  order.setAttribute('aria-label', order.title);
}

export function selectedPopulation() { return [...chosen ]; }

function selectionCount() {
  const count = Number(el('new-fish').value), lines = chosen.size,
        lower = Math.floor(count / lines), upper = Math.ceil(count / lines);
  text(
      'population-count',
      lines
          ? `${lineCount(lines)} · ${lower === upper ? lower : lower + '–' + upper} Fische je Linie`
          : 'Ohne Auswahl: die sieben Beispielklassen');
  el('new').disabled = lines > count;
  const box = el('population-chosen');
  box.replaceChildren();
  for (const id of chosen) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = (entries.find(e => e.id === id)?.name || id) + ' ×';
    chip.onclick = () => {
      chosen.delete(id);
      for (const item of cards)
        if (item.id === id) {
          item.check.checked = false;
          item.card.classList.toggle('selected', false);
        }
      selectionCount();
    };
    box.append(chip);
  }
}

const metricNumber = (value, digits = 0) =>
    Number.isFinite(value)
        ? value.toLocaleString('de',
                               {minimumFractionDigits : digits, maximumFractionDigits : digits})
        : '—';

function metricRow(box, label, value, maximum, formatted, color, title) {
  const row = document.createElement('div'), name = document.createElement('span'),
        track = document.createElement('i'), bar = document.createElement('i'),
        number = document.createElement('span');
  row.className = 'population-trait';
  name.textContent = label;
  track.className = 'population-bar';
  track.setAttribute('aria-hidden', 'true');
  bar.style.width = (!Number.isFinite(value) ? 0 : Math.min(100, 100 * value / maximum)) + '%';
  bar.style.backgroundColor = color;
  track.append(bar);
  number.textContent = !Number.isFinite(value) ? '—' : formatted;
  row.title = title;
  row.append(name, track, number);
  box.append(row);
}

const dietLabels = [
  'Kunstfutter', 'Fischfleisch', 'Eier', 'Aas', 'Algen', 'Pflanzen', 'Plankton', 'Würmer',
  'Krabben', 'Muscheln', 'Bodennahrung'
];
const dietColors = [
  '#e8ba78', '#db8c7b', '#c6a2df', '#a78b93', '#69bba0', '#9fc96a', '#bdcc85', '#da8d86', '#b9a07a',
  '#8aabb8', '#a49370'
];
function nutritionSummary(entry, box) {
  const wrap = document.createElement('div'), caption = document.createElement('small'),
        chart = document.createElement('div'), diet = entry.observed_diet,
        total = diet?.reduce((a, b) => a + b, 0) || 0;
  wrap.className = 'population-nutrition';
  chart.className = 'population-diet';
  caption.textContent =
      total > 0 ? 'Verwertbare Aufnahme · ' + entry.diet_scope : 'Ernährung · noch ungemessen';
  wrap.append(caption, chart);
  if (total > 0) {
    const descriptions = [];
    diet.forEach((value, k) => {
      if (!(value > 0))
        return;
      const part = document.createElement('span'), share = 100 * value / total,
            label = dietLabels[k] + ': ' + metricNumber(share, 1) + ' %';
      part.style.width = share + '%';
      part.style.backgroundColor = dietColors[k];
      part.title = label + ' · ' + metricNumber(value, 1) + ' E verwertbar';
      descriptions.push(label);
      chart.append(part);
    });
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', descriptions.join(', '));
    const lead = document.createElement('small');
    lead.textContent = diet.map((v, k) => ({v, k}))
                           .filter(p => p.v > 0)
                           .sort((a, b) => b.v - a.v)
                           .slice(0, 3)
                           .map(p => dietLabels[p.k])
                           .join(' · ');
    wrap.append(lead);
    const raw = entry.observed_raw_diet?.reduce((a, b) => a + b, 0);
    wrap.title = 'Verwertbare Aufnahme: ' + metricNumber(total, 1) + ' E' +
                 (Number.isFinite(raw) ? ' · roh geschluckt: ' + metricNumber(raw, 1) + ' E' : '') +
                 (Number.isFinite(entry.observed_digested)
                      ? ' · tatsächlich verdaut: ' + metricNumber(entry.observed_digested, 1) + ' E'
                      : '');
  }
  box.append(wrap);
}
function anatomySummary(entry, box) {
  const traits = document.createElement('div');
  traits.className = 'population-anatomy';
  for (const [key, label, low, high] of [[ 'jaw', 'Kiefer', 'kurz', 'lang' ],
                                         [ 'gut', 'Darm', 'kurz', 'lang' ],
                                         [ 'teeth', 'Zähne', 'spitz', 'stumpf' ],
                                         [ 'undulation', 'Körper', 'steif', 'schlängelnd' ]]) {
    const value = metricValue(entry, key);
    if (!Number.isFinite(value))
      continue;
    metricRow(traits, label, value, 1, metricNumber(value * 100) + '%', '#8faebd',
              label + ': ' + low + ' (0) bis ' + high + ' (100). Erbliche Anatomie.');
  }
  box.append(traits);
}

function details(entry, portrait, box) {
  box.replaceChildren();
  const senses = document.createElement('div');
  senses.className = 'population-senses';
  for (const [key, label, color] of [[ 'eye', 'Augen', '#e8bd6a' ], [ 'nose', 'Nase', '#a8b5e4' ],
                                     [ 'lateral', 'Seitenlinie', '#7dbfc9' ]]) {
    const value = metricValue({...entry, portrait}, key);
    metricRow(senses, label, value, 256, metricNumber(value || 0), color,
              label + ': Sinneszellen, gemeinsame Skala 0–256.');
  }
  box.append(senses);
  nutritionSummary(entry, box);
  anatomySummary({...entry, portrait}, box);
  const comparable = entries.filter(e => e.group === entry.group);
  for (const [key, label, color, factor,
              unit] of [[ 'speed', 'Tempo', '#7dbfc9', 1, ' px' ],
                        [ 'turn', 'Drehung', '#b7ace1', 180 / Math.PI, '°' ]]) {
    const value = metricValue(entry, key),
          maximum = Math.max(.001, ...comparable.map(e => metricValue(e, key) || 0));
    const impulse = key === 'turn';
    metricRow(box, impulse ? 'Drehimpuls' : label, value, maximum,
              Number.isFinite(value)
                  ? metricNumber(value * (impulse ? 1 : factor), 2) + (impulse ? '' : unit)
                  : '',
              color,
              key === 'speed' ? 'Geschwindigkeit relativ zum Wasser beim Speichern, pro Schritt.'
                              : 'Differenz der seitlichen Muskelimpulse beim Speichern.');
  }
  {
    for (const [key, label, color] of [[ 'observed_intake', 'Nahrung', '#e8bd6a' ],
                                       [ 'offspring', 'Nachwuchs', '#9bc58b' ],
                                       [ 'observed_generation', 'Generation', '#b7ace1' ]]) {
      const value = metricValue(entry, key),
            maximum = Math.max(1, ...comparable.map(e => metricValue(e, key) || 0));
      metricRow(box, label, value, maximum,
                Number.isFinite(value) ? metricNumber(value, key === 'observed_intake' ? 1 : 0)
                                       : '',
                color,
                key === 'observed_intake' ? 'Verwertbare Aufnahme je 100 Lebensschritte.'
                                          : 'Beobachtung am gespeicherten Fisch.');
    }
  }
  const more = document.createElement('details'), summary = document.createElement('summary');
  more.className = 'population-more';
  summary.textContent = 'Körper';
  more.append(summary);
  box.append(more);
  const info = document.createElement('small');
  info.textContent = `${portrait[FISH.nodes]} Nervenzellen · ${
      Math.round(portrait[FISH.organs]?.[ANATOMY.eggs] || 0)} Ei-Zellen`;
  more.append(info);
}

function animate() {
  clearTimeout(timer);
  if (!el('new-run-dialog').open)
    return;
  if (!document.hidden) {
    const t = performance.now() / 1000, viewport = el('population-grid').getBoundingClientRect();
    for (const item of cards) {
      if (!item.portrait)
        continue;
      const rect = item.canvas.getBoundingClientRect();
      if (rect.bottom < Math.max(0, viewport.top) ||
          rect.top > Math.min(window.innerHeight, viewport.bottom))
        continue;
      const {canvas, portrait, fit} = item, g = canvas.getContext('2d'),
                               phase = t * 2.4 + item.phase;
      // Anatomy and framing are stable; only the illustrative fin pose changes.
      const a = {
        ...fit.a,
        finShapeCache : null,
        finPose : k => .24 + .20 * Math.sin(phase + k * 1.4),
        tailDirection : Math.sin(phase)
      };
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.save();
      g.translate(fit.x, fit.y);
      paintFishGlyph(g, portrait, fit.r, 0, 0, 1, null, false, 1, a);
      g.restore();
    }
  }
  timer = setTimeout(animate, 70);
}

function nearListEnd() {
  const grid = el('population-grid');
  return grid.scrollHeight - grid.scrollTop - grid.clientHeight < 180;
}

async function render() {
  ++revision;
  loading = false;
  const query = el('population-search').value.toLocaleLowerCase('de');
  filtered = entries.filter(e => (group === 'favorites' ? e.favorite : e.group === group) && [
    e.name, e.genus, ...(e.labels || [])
  ].join(' ').toLocaleLowerCase('de').includes(query));
  sortingControls();
  filtered = rankPopulation(filtered, sortKey, sortDescending);
  shown = 0;
  cards = [];
  const grid = el('population-grid');
  grid.replaceChildren();
  grid.scrollTop = 0;
  text('population-total', lineCount(filtered.length));
  if (!filtered.length) {
    const note = document.createElement('p');
    note.textContent =
        group === 'favorites' ? 'Fische im Fisch-Panel mit ★ als Favorit speichern.'
        : group === 'saved'
            ? 'Erfolgreiche Vertreter werden während des Laufs automatisch gespeichert.'
            : 'Keine passenden Beispielfische.';
    grid.append(note);
  }
  selectionCount();
  animate();
  await loadMore();
}

async function loadMore() {
  if (loading || shown >= filtered.length || !el('new-run-dialog').open)
    return;
  loading = true;
  const token = revision, grid = el('population-grid'),
        batch = filtered.slice(shown, shown + batchSize);
  shown += batch.length;
  const pending = [];
  for (const e of batch) {
    const card = document.createElement('article'), label = document.createElement('label'),
          check = document.createElement('input'), name = document.createElement('strong'),
          canvas = document.createElement('canvas'), info = document.createElement('div'),
          subtitle = document.createElement('small');
    card.className = 'population-card';
    check.type = 'checkbox';
    check.checked = chosen.has(e.id);
    name.textContent = e.name;
    label.append(check, name);
    check.onchange = () => {
      if (check.checked)
        chosen.add(e.id);
      else
        chosen.delete(e.id);
      card.classList.toggle('selected', check.checked);
      selectionCount();
    };
    card.classList.toggle('selected', check.checked);
    canvas.width = 260;
    canvas.height = 125;
    canvas.title = 'Animierte Körpervorschau';
    canvas.onclick = () => {
      check.checked = !check.checked;
      check.onchange();
    };
    subtitle.textContent =
        (e.labels || []).filter(word => !/^(ohne |blind|taub)/i.test(word)).join(' · ') ||
        e.genus || '';
    card.append(label, canvas, subtitle, info);
    if (e.group !== 'examples') {
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'population-star';
      const updateStar = () => {
        star.textContent = e.favorite ? '★' : '☆';
        star.title = e.favorite ? 'Favorit entfernen' : 'Als Favorit behalten';
        star.setAttribute('aria-label', star.title);
        star.setAttribute('aria-pressed', String(e.favorite));
      };
      updateStar();
      star.onclick = async () => {
        star.disabled = true;
        if (await command('favorite-genome', {id : e.id, enabled : !e.favorite})) {
          e.favorite = !e.favorite;
          updateStar();
          if (group === 'favorites' && !e.favorite && token === revision) {
            card.remove();
            cards = cards.filter(item => item.id !== e.id);
            filtered = filtered.filter(entry => entry.id !== e.id);
            --shown;
            text('population-total', lineCount(filtered.length));
            if (nearListEnd())
              loadMore();
          }
        }
        star.disabled = false;
      };
      card.append(star);
      const session = document.createElement('small');
      session.className = 'population-session';
      session.textContent = e.imported ? 'Importiert'
                                       : 'Lauf ' + e.session.slice(0, 8) + ' · Schritt ' +
                                             e.step.toLocaleString('de');
      card.append(session);
    }
    grid.append(card);
    const item = {id : e.id, canvas, card, check, phase : cards.length};
    cards.push(item);
    const install = portrait => {
      if (token !== revision)
        return;
      e.portrait = item.portrait = portrait;
      item.fit = fishPreviewPose(portrait, canvas.width, canvas.height, 70);
      details(e, portrait, info);
    };
    if (e.portrait)
      install(e.portrait);
    else
      pending.push(async () => {
        if (token !== revision)
          return;
        info.textContent = 'Körper wird entwickelt …';
        try {
          const response =
              await request('/population-preview?id=' + encodeURIComponent(e.id), {}, 30000),
                data = await response.json();
          if (!response.ok)
            throw Error(data.error);
          install(data.portrait);
        } catch (error) {
          if (token === revision) {
            info.textContent = error.message;
            check.disabled = true;
          }
        }
      });
  }
  // Develop previews sequentially, only as their batch approaches the viewport.
  try {
    for (const load of pending)
      await load();
  } finally {
    if (token === revision) {
      loading = false;
      if (nearListEnd())
        loadMore();
    }
  }
}

export async function openPopulationPicker() {
  const dialog = el('new-run-dialog');
  if (dialog.open)
    return;
  restoreRunning = !!sceneState.frame && !sceneState.frame.paused;
  if (restoreRunning && !await command('pause')) {
    restoreRunning = false;
    return;
  }
  dialog.showModal();
  text('population-count', 'Startlinien werden geladen …');
  try {
    const response = await request('/population'), data = await response.json();
    if (!response.ok)
      throw Error(data.error);
    entries = data.entries;
    const available = new Set(entries.map(e => e.id));
    for (const id of chosen)
      if (!available.has(id))
        chosen.delete(id);
    await render();
  } catch (error) {
    text('population-count', error.message);
  }
}

export function populationStarted() { restoreRunning = false; }

export function bindPopulationPicker() {
  el('population-refresh').onclick = async () => {
    try {
      const response = await request('/population'), data = await response.json();
      if (!response.ok)
        throw Error(data.error);
      entries = data.entries;
      await render();
    } catch (error) {
      text('population-count', error.message);
    }
  };
  el('population-import').onclick = () => el('population-file').click();
  el('population-file').onchange = async event => {
    const file = event.target.files[0];
    if (!file)
      return;
    const button = el('population-import');
    button.disabled = true;
    try {
      if (file.size > 1000000)
        throw Error('Genomdatei ist größer als 1 MB.');
      const response = await request('/command', {
        method : 'POST',
        headers : {'Content-Type' : 'application/json', 'X-Fish-Token' : window.FISH_TOKEN},
        body : JSON.stringify(
            {command : 'population-import', name : file.name, genome : await file.text()})
      },
                                     30000),
            result = await response.json();
      if (!response.ok)
        throw Error(result.error);
      const catalog = await request('/population'), data = await catalog.json();
      if (!catalog.ok)
        throw Error(data.error);
      entries = data.entries;
      chosen.add(result.message);
      group = 'favorites';
      el('population-group').value = group;
      el('population-search').value = '';
      await render();
    } catch (error) {
      text('population-count', error.message);
    } finally {
      button.disabled = false;
      event.target.value = '';
    }
  };
  el('population-group').onchange = e => {
    group = e.target.value;
    render();
  };
  el('population-search').oninput = () => { render(); };
  el('population-sort-direction').onclick = () => {
    sortDescending = !sortDescending;
    render();
  };
  el('population-grid').onscroll = () => {
    if (nearListEnd())
      loadMore();
  };
  el('population-random').onclick = () => {
    chosen.clear();
    render();
  };
  el('new-fish').oninput = selectionCount;
  el('new-run-dialog').onclose = () => {
    ++revision;
    clearTimeout(timer);
    cards = [];
    if (restoreRunning)
      command('resume');
    restoreRunning = false;
  };
}

let offered = false;
export function offerPopulation(data) {
  if (data.offer_population && !offered && sceneState.frame) {
    offered = true;
    command('population-ready');
    openPopulationPicker();
  }
}
