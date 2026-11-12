const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = (value, digits = 0) => Number(value).toLocaleString('de-AT', {
  maximumFractionDigits: digits
});
let time = 1850, from = 1450, until = 2150, selected = null, zoom = 1, timer = null;
const parents = new Set();
const delta = (row, name) => row[name + '.L'] === -9 || row[name + '.R'] === -9
    ? null : row[name + '.R'] - row[name + '.L'];
const series = [
  ['Energie', 'E', r => r.energy, '#8ed8df', false],
  ['Darmfüllung', '%', r => r.gutcap > 0 ? 100 * r.gut / r.gutcap : null, '#b5d9a5', false],
  ['Blattabstand', 'px', r => r.leaf, '#dcd78e', false],
  ['Duft rechts − links', '', r => delta(r, 'olfaction.gradient'), '#8bbdf0', true],
  ['Zielsignal rechts − links', '', r => delta(r, 'choice.target'), '#e7a89c', true],
  ['Drehbefehl rechts − links', '', r => delta(r, 'motor.turn'), '#c4a9e4', true]
];
const windows = {feed: [50, 800], full: [800, 1450], hungry: [1450, 2150], all: [50, 2300]};
const children = id => lives.filter(l => l.parent === id).length;
const eventMarks = signals.flatMap((r, i) => {
  if (!i) return [];
  const previous = signals[i - 1], marks = [];
  if (r.bites > previous.bites) marks.push({kind: 'bite', symbol: '●', text: 'Fressaktion'});
  if (r.clos - previous.clos > r.bites - previous.bites)
    marks.push({kind: 'close', symbol: '×', text: 'Kieferschluss ohne gezählte Fressaktion'});
  const fill = r.gut / r.gutcap, before = previous.gut / previous.gutcap;
  if (fill >= .5 && before < .5) marks.push({kind: 'full', symbol: '▲', text: 'Darm über 50 %'});
  if (fill < .5 && before >= .5) marks.push({kind: 'empty', symbol: '▽', text: 'Darm unter 50 %'});
  return marks.map(mark => ({...mark, from: previous.t, t: r.t}));
});
function scaleTop(value) {
  const power = 10 ** Math.floor(Math.log10(Math.max(value, .001)));
  return [1, 2, 5, 10].find(n => n * power >= value) * power;
}
function draw() {
  const rows = signals.filter(r => r.t >= from && r.t <= until);
  const chosen = signals.reduce((a, b) => Math.abs(b.t - time) < Math.abs(a.t - time) ? b : a);
  const x = t => 1000 * (t - from) / (until - from);
  const events = eventMarks.filter(e => e.t >= from && e.t <= until);
  $('#time-value').textContent = 'Schritt ' + fmt(time);
  $('#time').value = time;
  $('#from').textContent = fmt(from);
  $('#until').textContent = fmt(until) + ' Schritte';
  $('#tracks').innerHTML = series.map(([name, unit, value, color, signed]) => {
    const values = rows.map(value).filter(v => v !== null && Number.isFinite(v));
    const max = scaleTop(Math.max(...values.map(Math.abs), .001));
    const min = signed ? -max : 0, y = v => 58 - 50 * (v - min) / (max - min);
    let path = '', connected = false;
    for (const row of rows) {
      const v = value(row);
      if (v === null || !Number.isFinite(v)) { connected = false; continue; }
      path += (connected ? ' L' : ' M') + x(row.t).toFixed(1) + ',' + y(v).toFixed(1);
      connected = true;
    }
    const current = value(chosen), guide = signed ? y(0) : 58;
    return `<div class="track"><label>${name}<small>${fmt(min, 3)} … ${fmt(max, 3)} ${unit}</small></label>
      <svg viewBox="0 0 1000 68" preserveAspectRatio="none" data-chart="1">
        ${events.map(e => `<path class="event-guide ${e.kind}" d="M${x(e.t)},8V58"/>`).join('')}
        <path class="axis zero" d="M0,${guide}H1000"/>
        <path class="ink" stroke="${color}" d="${path}"/>
        <path class="cursor" d="M${x(time)},0V68"/>
      </svg><output>${current === null ? '–' : fmt(current, signed ? 3 : 0)} ${unit}</output></div>`;
  }).join('');
  $('#events').innerHTML = events.map(e => `<button class="event-mark ${e.kind}"
      style="left:${Math.max(0, Math.min(98, x(e.t) / 10))}%" data-event-time="${e.t}"
      title="${e.text}: zwischen ${fmt(e.from)} und ${fmt(e.t)}">${e.symbol}</button>`).join('');
}
function mode(m) {
  $('#lab').classList.toggle('hidden', m !== 'lab');
  $('#breed').classList.toggle('hidden', m !== 'breed');
  $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
}
function pick(id) {
  selected = selected === id ? null : id;
  $('#signal-title').textContent = selected === 8 ? 'Fisch 8 · Verlauf'
    : selected ? 'Fisch ' + selected + ' · Signalspur nicht aufgezeichnet'
    : 'Beckenübersicht · kein Fisch ausgewählt';
  $('#focus-note').textContent = selected ? 'Ziel: Fisch ' + selected + '. Wirkung ab dem bestätigten Simulationsschritt.'
    : 'Wähle einen Fisch für individuelle Eingriffe.';
  ['#tracks', '.time', '.scale', '.event-strip', '.event-legend'].forEach(s =>
    $(s).classList.toggle('hidden', selected !== 8));
  $('#map-title').textContent = selected === 8
    ? 'Fisch 8 · Originalweg 1.450–2.150 · Signalzeit unten frei wählbar'
    : 'Historische Beckenübersicht · Schritte 0–1.000';
  $('#path-image').src = selected === 8 ? '../bilder/2026-11-12_fable_fisch8-kreist-1450-2150.png'
    : '../bilder/2026-11-12_fable_wege-alle-0-1000.png';
  $('#path-image').alt = selected === 8 ? 'Fables historischer Weg von Fisch 8 bei 1450 bis 2150.'
    : 'Fables historische Wege aller Fische bei 0 bis 1000.';
  $('#picture-caption').textContent = selected === 8
    ? 'Originalbild: Pfadfarbe = Zeit, Sterne = Fressaktion, × = Kieferschluss ins Leere. Pflanzenaufnahme bei Schritt 1.000. Das Bild hat eine feste Zeitspanne; die Signalspuren darunter sind zeitlich auswählbar.'
    : 'Originalbild: Alle Wege bei Schritt 0–1.000. Die unterschiedlichen Farben trennen die Fische. Für die endgültige Live-Ansicht werden Wege und zeitgleiche Szenen gemeinsam gezeichnet.';
  $$('.lifeline').forEach(e => e.classList.toggle('selected', Number(e.dataset.id) === selected));
  $$('[data-control],[data-pulse],#brain-control').forEach(e => e.disabled = !selected);
}
function drawLives() {
  const end = Math.max(...lives.map(l => l.last_t)), x = t => 1000 * t / end, row = 26;
  const lines = lives.map((l, i) => {
    const parent = lives.findIndex(p => p.id === l.parent);
    if (parent < 0) return '';
    const p = lives[parent], start = Math.min(l.hatch_t, p.last_t);
    return `<path d="M${x(start)},${parent * row + row / 2}H${x(l.hatch_t)}V${i * row + row / 2}"/>`;
  }).join('');
  $('#lifes').innerHTML = `<svg class="ancestry" viewBox="0 0 1000 ${lives.length * row}"
    preserveAspectRatio="none" aria-hidden="true">${lines}</svg>` + lives.map(l =>
    `<div class="lifeline" data-id="${l.id}"><button>Fisch ${l.id} · G${l.gen}</button>
      <svg viewBox="0 0 1000 20" preserveAspectRatio="none" aria-label="Lebenslinie Fisch ${l.id}">
      <path class="lifeink" d="M${x(l.hatch_t)},10H${x(l.last_t)}"/>
      <circle cx="${x(l.hatch_t)}" cy="10" r="3" fill="#dce8e0"/>
      ${l.alive ? '' : `<path d="M${x(l.last_t) - 3},6l6,8m-6,0l6,-8" stroke="#e8a89a"/>`}
      </svg><small>${l.alive ? 'lebt bei ' : 'stirbt bei '}${fmt(l.last_t)}</small></div>`).join('');
}
function drawBreeders() {
  const goal = $('#goal').value, score = l => goal === 'offspring' ? children(l.id) : l.intake;
  const ordered = [...lives].sort((a, b) => goal === 'manual' ? a.id - b.id : score(b) - score(a));
  $('#score-label').textContent = goal === 'offspring' ? 'Geschlüpfte Junge' : 'Aufnahme';
  $('#other-score-label').textContent = goal === 'offspring' ? 'Aufnahme' : 'Geschlüpfte Junge';
  $('#breeders').innerHTML = ordered.map(l => `<tr>
    <td><label><input type="checkbox" data-parent="${l.id}" ${parents.has(l.id) ? 'checked' : ''}> Fisch ${l.id}</label></td>
    <td>${goal === 'offspring' ? children(l.id) : fmt(l.intake) + ' E'}</td>
    <td>${goal === 'offspring' ? fmt(l.intake) + ' E' : children(l.id)}</td>
    <td>${l.parent ? 'Fisch ' + l.parent : 'Gründer'}</td><td>G${l.gen}</td>
    <td>${fmt(l.steps)}</td><td>${l.alive ? 'lebt' : 'gestorben'}</td>
    <td>${fmt(l.h_aperture, 2)} / ${fmt(l.h_radius, 2)} px</td></tr>`).join('');
}
function log(value) {
  const li = document.createElement('li');
  li.textContent = 'Entwurf bei ' + fmt(time) + ': ' + value;
  $('#log').prepend(li);
}
function step(d) { time = Math.min(until, Math.max(from, time + d)); draw(); }
$$('[data-mode]').forEach(b => b.onclick = () => mode(b.dataset.mode));
$('#clear').onclick = () => { selected = null; pick(null); };
$('#cockpit-toggle').onclick = () => $('.cockpit').classList.toggle('open');
$('#compare').onclick = () => $('#comparison').classList.toggle('hidden');
$('#breed-live').onclick = () => { mode('lab'); selected = null; pick(null); };
$('#lifes').onclick = event => {
  const line = event.target.closest('.lifeline');
  if (line) pick(Number(line.dataset.id));
};
$('#time').oninput = e => { time = Number(e.target.value); draw(); };
$('#back').onclick = () => step(-10);
$('#next').onclick = () => step(10);
$('#play').onclick = () => {
  if (timer) { clearInterval(timer); timer = null; $('#play').textContent = 'Wiedergabe'; }
  else {
    timer = setInterval(() => { if (time >= until) time = from; step(10); }, 100);
    $('#play').textContent = 'Pause';
  }
};
$$('[data-window]').forEach(b => b.onclick = () => {
  [from, until] = windows[b.dataset.window];
  time = Math.max(from, Math.min(until, time));
  $('#time').min = from; $('#time').max = until;
  $$('[data-window]').forEach(x => x.setAttribute('aria-pressed', x === b));
  draw();
});
$('#tracks').onclick = e => {
  const svg = e.target.closest('svg');
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  time = Math.round((from + (until - from) * (e.clientX - r.left) / r.width) / 10) * 10;
  draw();
};
$('#events').onclick = e => {
  const mark = e.target.closest('[data-event-time]');
  if (mark) { time = Number(mark.dataset.eventTime); draw(); }
};
$$('[data-control]').forEach(e => e.onchange = () => log(e.dataset.control + ': '
  + (e.type === 'checkbox' ? (e.checked ? 'an' : 'aus') : e.value)));
$$('[data-pulse]').forEach(e => e.onclick = () => log(e.dataset.pulse + ' (Impuls)'));
$('#brain-control').onclick = () => {
  $$('select[data-control]').forEach(e => e.selectedIndex = 0);
  log('Drehung und Antrieb zurück ans Fischhirn');
};
$('#zoomin').onclick = () => { zoom = Math.min(3, zoom + .25); $('#path-image').style.transform = `scale(${zoom})`; };
$('#zoomout').onclick = () => { zoom = Math.max(1, zoom - .25); $('#path-image').style.transform = `scale(${zoom})`; };
$('#goal').onchange = drawBreeders;
$('#breeders').onchange = e => {
  if (!e.target.matches('[data-parent]')) return;
  const id = Number(e.target.dataset.parent);
  e.target.checked ? parents.add(id) : parents.delete(id);
  $('#parents-count').textContent = parents.size;
  $('#parent-summary').textContent = parents.size ? 'Vorgemerkt: ' + [...parents].map(x => 'Fisch ' + x).join(', ')
    : 'Noch keine Eltern vorgemerkt.';
  $('#prepare').disabled = !parents.size;
};
$('#prepare').onclick = () => {
  $('#breed-result').textContent = 'Entwurf: ' + parents.size + ' Eltern, Mutationsfaktor '
    + fmt($('#variation').value, 2) + '. Tatsächliche Erbgut- und Körperänderungen je Nachkomme vergleichen. Hier wird kein neuer Lauf gestartet.';
};
drawLives(); drawBreeders(); draw(); pick(null);
