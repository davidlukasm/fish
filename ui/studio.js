import {sceneState} from './state.js';
import {beginEggPlacement} from './world.js';
import {SITES, EFFECTS, OUTPUTS, ROLES, ZONES, handfishPlan, hasSite, hormonePoint,
  newGroup} from './studio_model.js';
import {anatomy, anatomyControls, contacts, contactsControls, development, esc,
  hormones, hormoneControls} from './studio_views.js';
import {cppnControls, cppnGraph} from './studio_graph.js';

const STORAGE_KEY = 'fish-v019-atelier-draft';
const tabs = [
  ['anatomy', '01', 'Anatomie'], ['contacts', '02', 'Kontakte'],
  ['hormones', '03', 'Hormone & Lernen'], ['development', '04', 'Entwicklung']
];
const state = {
  station: 'hub', tab: 'anatomy', plan: handfishPlan(), selected: 0,
  effect: 5, layer: 'all', graphOutput: 0, graphSelection: {kind: 'node', id: 10},
  connect: {from: 9, to: 10, weight: .5, port: 0},
  report: null, genome: '', genomeName: '', mode: 'plan', stale: true, busy: false,
  message: '', messageKind: '', undo: []
};
let root;

function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.groups) || !saved.groups.length || saved.groups.length > 80)
      return;
    for (const g of saved.groups)
      if (!g || typeof g.name !== 'string' || !Array.isArray(g.receptors) || g.receptors.length !== 7)
        return;
    state.plan = saved;
  } catch (_) { /* Storage can be disabled, or a draft can predate the current schema. */ }
}

function saveDraft() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.plan)); } catch (_) { /* Optional. */ }
}

function remember() {
  state.undo.push(structuredClone(state.plan));
  if (state.undo.length > 30) state.undo.shift();
}

function changed() {
  state.stale = true;
  state.mode = 'plan';
  state.message = 'Bauplan geändert · bitte neu entwickeln.';
  state.messageKind = '';
  saveDraft();
}

function message(value, kind = '') {
  state.message = value;
  state.messageKind = kind;
  render();
}

function group() { return state.plan.groups[state.selected]; }

function countSites(index) {
  const g = state.plan.groups[index];
  return SITES.filter(p => hasSite(g, p)).length;
}

function hub() {
  return `<div class="aid-hub">
    <div class="aid-hub-top"><div class="aid-institute">
      <div class="aid-seal" aria-hidden="true">A<span>·</span>I<span>·</span>D</div>
      <div><small>Institut für</small><h1>Artificial Intelligent Design</h1>
      <p>Abteilung für zweckgerichteten Zufall · Feldstation v019</p></div></div>
      <div class="aid-live-pill"><span class="aid-live-dot"></span><span data-live="state">Aquarium verbindet …</span></div>
    </div>
    <section class="aid-hub-lead"><div><small>FORSCHUNGSSTATION / AKTUELLE WELT</small>
      <h2>Was wächst da eigentlich?</h2>
      <p>Im Wasser läuft die Evolution weiter. Hier beobachtest du ihren Stand, baust eigene
      Entwicklungsprogramme und schickst Entwürfe ins Becken.</p>
    </div><div class="aid-live-figure" aria-hidden="true"><svg viewBox="0 0 280 164">
      <path d="M30 85 Q82 24 155 57 Q192 64 240 31 L226 83 240 133 Q181 106 155 110 Q76 148 30 85Z"
        fill="#326a72" stroke="#83c5bd" stroke-width="2"/>
      <path d="M80 83Q154 60 210 83" fill="none" stroke="#75a7a1" stroke-dasharray="3 9"/>
      <circle cx="58" cy="72" r="5.5" fill="#f6d18e"/>
      <path d="M102 112 L139 148 150 105" fill="#53938d" stroke="#83c5bd"/>
      <circle cx="246" cy="18" r="2" fill="#a0c9d2"/><circle cx="257" cy="43" r="4" fill="#a0c9d2"/>
      <circle cx="21" cy="139" r="3" fill="#a0c9d2"/></svg></div></section>
    <section class="aid-hub-stats" aria-label="Aktuelle Statistiken">
      <div><small>Lebende Fische</small><strong data-live="fish">–</strong><span>im Aquarium</span></div>
      <div><small>Eier</small><strong data-live="eggs">–</strong><span>Nachwuchs in Entwicklung</span></div>
      <div><small>Arten</small><strong data-live="species">–</strong><span>lebender Bestand</span></div>
      <div><small>Simulation</small><strong data-live="step">–</strong><span>durchlaufene Schritte</span></div>
      <div><small>Generationen</small><strong data-live="generations">–</strong><span>nach Abstammung</span></div>
    </section>
    <div class="aid-hub-section-title"><div><small>STATIONEN</small><h2>Wo soll's hingehen?</h2></div>
      <span>Zwei offene Bereiche · drei in Vorbereitung</span></div>
    <div class="aid-stations">
      <button class="aid-station active-station aquarium" data-action="aquarium">
        <span class="aid-station-index">01 / BEOBACHTUNG <i>OFFEN</i></span><span class="aid-station-icon">≈</span>
        <strong>Aquarium</strong><span>Fische, Evolution, Umwelt und laufende Experimente.</span>
        <span class="aid-station-go">Zum Becken <b>↗</b></span></button>
      <button class="aid-station active-station workshop" data-action="atelier">
        <span class="aid-station-index">02 / ENTWURF <i>OFFEN</i></span><span class="aid-station-icon">⌘</span>
        <strong>Atelier</strong><span>Zellen und Körperräume entwerfen, Kontakte und Hormone codieren, CPPN bearbeiten.</span>
        <span class="aid-station-go">Zur Werkbank <b>↗</b></span></button>
      <div class="aid-station future"><span class="aid-station-index">03 / SELEKTION <i>SPÄTER</i></span>
        <span class="aid-station-icon">◌</span><strong>Zuchtstation</strong><span>Varianten züchten und vergleichen.</span></div>
      <div class="aid-station future"><span class="aid-station-index">04 / ERPROBUNG <i>SPÄTER</i></span>
        <span class="aid-station-icon">⚑</span><strong>Arena</strong><span>Wettbewerbe und Herausforderungen.</span></div>
      <div class="aid-station future"><span class="aid-station-index">05 / ÖKOLOGIE <i>SPÄTER</i></span>
        <span class="aid-station-icon">♒</span><strong>Freie Wildbahn</strong><span>Entwürfe in weiteren Lebensräumen.</span></div>
    </div><footer class="aid-hub-footer"><span>AID / v019</span>
      <span>Die Evolution hat keine Bauleitung. Wir eröffnen trotzdem ein Büro.</span></footer>
  </div>`;
}

function liveStats() {
  if (state.station !== 'hub') return;
  const f = sceneState.frame, read = id => document.getElementById(id)?.textContent?.trim();
  const values = {
    state: f ? (f.paused ? 'Simulation pausiert' : 'Aquarium läuft') : 'Aquarium lädt …',
    fish: read('adults') || (f?.fish?.length ?? '–'),
    eggs: read('eggs') || '–',
    species: read('living-species-count') || (f?.species?.length ?? '–'),
    step: typeof f?.step === 'number' ? f.step.toLocaleString('de-DE') : '–',
    generations: read('live-generation') || '–'
  };
  for (const [key, value] of Object.entries(values)) {
    const node = root?.querySelector(`[data-live="${key}"]`);
    if (node) node.textContent = value;
  }
}

function sidebar() {
  if (state.tab === 'cppn') {
    return `<div class="aid-side-heading"><small>CPPN-AUSGÄNGE</small><strong>Merkmale</strong></div>` +
      `<div class="aid-group-list">${OUTPUTS.map((out, i) =>
        `<button data-output="${i}" class="aid-group-row ${state.graphOutput === i ? 'selected' : ''}">` +
        `<span class="aid-group-number">${String(i).padStart(2, '0')}</span><span>${esc(out)}</span></button>`).join('')}</div>`;
  }
  return `<div class="aid-side-heading"><small>GEWEBEBAUPLAN</small><strong>${state.plan.groups.length} Zellgruppen</strong></div>` +
    `<div class="aid-group-list">${state.plan.groups.map((g, i) =>
      `<button data-select-group="${i}" class="aid-group-row ${i === state.selected ? 'selected' : ''}">` +
      `<span class="aid-group-number">${String(i + 1).padStart(2, '0')}</span>` +
      `<span><strong>${esc(g.name)}</strong><small>${esc(ROLES[g.role])} · ${countSites(i)} Orte</small></span>` +
      `</button>`).join('')}</div>` +
    `<div class="aid-sidebar-tools"><button data-action="add">＋ Zellgruppe</button>` +
    `<button data-action="undo" ${state.undo.length ? '' : 'disabled'} title="Letzte Änderung rückgängig">↶</button></div>`;
}

function studioCenter() {
  if (state.tab === 'cppn') {
    if (!state.report) return `<div class="aid-empty"><span>⌘</span><h2>CPPN-Werkbank</h2>` +
      `<p>Entwickle den Fischbauplan oder öffne eine vorhandene .genome-Datei. ` +
      `Anschließend lässt sich das CPPN direkt an seinen Knoten und Verbindungen bearbeiten.</p>` +
      `<button data-action="develop" class="aid-primary">Vorlage entwickeln</button></div>`;
    return cppnGraph(state.report, state.graphOutput, state.graphSelection);
  }
  if (state.tab === 'anatomy') return anatomy(state.plan, state.selected, state.layer,
    state.stale ? null : state.report);
  if (state.tab === 'contacts') return contacts(state.plan, state.selected,
    state.stale ? null : state.report);
  if (state.tab === 'hormones') return hormones(state.plan, state.selected, state.effect,
    state.stale ? null : state.report);
  return development(state.plan, state.report, state.stale);
}

function studioControls() {
  if (state.tab === 'cppn')
    return cppnControls(state.report, state.graphSelection, state.connect);
  if (state.tab === 'anatomy') return anatomyControls(group());
  if (state.tab === 'contacts') return contactsControls(group());
  if (state.tab === 'hormones') return hormoneControls(group(), state.effect);
  return `<div class="aid-control-heading"><small>GENOM & PRÜFUNG</small><h3>Vom Plan zum Fisch</h3></div>` +
    `<p>Die v019-Engine entwickelt aus diesen Zellgruppen ein echtes CPPN-Genom. ` +
    `Du siehst danach, welche Zellen und Kontakte entstanden sind.</p>` +
    `<button class="aid-primary" data-action="develop">CPPN entwickeln</button>` +
    `<div class="aid-subheading">Was wird geprüft?</div>` +
    `<p class="aid-note">Entwicklungsorte, Zellzahl, Synapsen, Ressourcenbegrenzung, ` +
    `Viabilität und alle 20 CPPN-Ausgänge. Verhalten und Lernerfolg siehst du im Aquarium.</p>` +
    `<div class="aid-subheading">Entwurf</div>` +
    `<label class="aid-field"><span>Genomname</span><input id="aid-plan-name" maxlength="40" ` +
    `value="${esc(state.plan.name)}"></label>` +
    `<button data-action="template">Handfisch-Vorlage wiederherstellen</button>`;
}

function studio() {
  const valid = !!state.genome && !!state.report && (state.mode === 'genome' || !state.stale);
  const stats = state.report && valid ? `${state.report.neurons} Zellen · ${state.report.synapses} Synapsen` :
    `${state.plan.groups.length} Gruppen · 360 Orte`;
  return `<div class="aid-workspace"><div class="aid-workspace-top">
    <div class="aid-workspace-brand"><button data-action="home" title="Zur Zentrale">← Zentrale</button>
      <div><small>AID / WERKSTATT 02</small><h1>Atelier</h1></div></div>
    <div class="aid-workspace-status"><span class="${state.stale ? 'unsynced' : 'synced'}"></span>` +
      `<span>${esc(stats)}${state.mode === 'genome' ? ' · CPPN-Fassung' : state.stale ? ' · Entwurf' : ' · entwickelt'}</span></div>
    <div class="aid-workspace-actions"><button data-action="open">Genom öffnen</button>` +
      `<button data-action="take-fish" title="Aktuell ausgewählten Fisch aus dem Aquarium in die CPPN-Werkbank laden">Fisch übernehmen</button>` +
      `<button data-action="download" ${valid ? '' : 'disabled'}>Genom speichern</button>` +
      `<button class="aid-primary" data-action="develop" ${state.busy ? 'disabled' : ''}>` +
      `${state.busy ? 'Entwicklung läuft …' : 'CPPN entwickeln'}</button>` +
      `<button data-action="place" ${valid && state.report.viable && !state.report.limited ? '' : 'disabled'} title="Entwurf als Eier im Aquarium platzieren">Eier platzieren ↗</button></div>
    <input id="aid-file" type="file" accept=".genome,text/plain" hidden></div>
    <nav class="aid-workspace-modes" aria-label="Werkzeuge">
      <button data-tab="anatomy" class="${state.tab !== 'cppn' ? 'active' : ''}">Fischbau <span>Gewebe & Kontakte</span></button>
      <button data-tab="cppn" class="${state.tab === 'cppn' ? 'active' : ''}">CPPN <span>Genomgraph</span></button>
      ${state.tab !== 'cppn' ? `<div class="aid-subtabs">${tabs.map(([key,num,label]) =>
        `<button data-tab="${key}" class="${state.tab === key ? 'active' : ''}"><i>${num}</i> ${label}</button>`).join('')}</div>` :
        `<div class="aid-subtabs aid-info-tab">10 Eingänge · 20 Ausgänge · beliebige versteckte Knoten</div>`}
    </nav>
    ${state.mode === 'genome' ? `<div class="aid-workspace-advice">Du bearbeitest das CPPN direkt. ` +
      `Der gespeicherte Fischbauplan bleibt erhalten; „CPPN entwickeln“ ersetzt die direkten Genomänderungen durch den Bauplan.</div>` :
    state.stale && state.report && state.tab === 'cppn' ? `<div class="aid-workspace-advice">` +
      `Der Graph zeigt die letzte entwickelte Fassung. Die jüngsten Änderungen am Fischbauplan sind noch nicht enthalten.</div>` : ''}
    <div class="aid-workspace-main"><div class="aid-workspace-sidebar">${sidebar()}</div>
      <section class="aid-workspace-canvas">${studioCenter()}</section>
      <div class="aid-workspace-controls">${studioControls()}</div></div>
    <div class="aid-workspace-footer" role="status"><span class="${state.messageKind ? 'aid-' + state.messageKind : ''}">` +
      `${esc(state.message || 'Veränderungen am Bauplan werden als Entwicklungsvorschrift für v019 gespeichert.')}</span>` +
      `<span>v019 / AID</span></div></div>`;
}

function render() {
  if (!root) return;
  document.body.dataset.station = state.station;
  root.hidden = state.station === 'aquarium';
  if (state.station === 'aquarium') return;
  root.innerHTML = state.station === 'hub' ? hub() : studio();
  liveStats();
}

function navigate(station) {
  state.station = station;
  render();
}

async function request(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Fish-Token': window.FISH_TOKEN},
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw Error(typeof result.error === 'string' ? result.error :
      typeof result.error?.message === 'string' ? result.error.message : 'Anfrage fehlgeschlagen.');
  return result;
}

async function compile() {
  if (state.busy) return;
  state.busy = true;
  message('Der CPPN-Compiler entwickelt Zellen, Rezeptoren und Kontakte …');
  try {
    const {result} = await request('/atelier', {operation: 'build', plan: state.plan});
    state.report = result;
    state.genome = result.genome;
    state.genomeName = state.plan.name;
    state.stale = false;
    state.mode = 'plan';
    message(`${result.neurons} Zellen, ${result.synapses} Synapsen. ` +
      `${result.viable ? 'Engine: lebensfähig.' : 'Engine: nicht lebensfähig.'}`, result.viable ? 'good' : 'warn');
  } catch (error) { message('Entwicklung: ' + error.message, 'warn'); }
  finally { state.busy = false; render(); }
}

async function inspectGenome(genome, label) {
  if (state.busy) return;
  state.busy = true;
  message(`Öffne ${label} …`);
  try {
    const {result} = await request('/atelier', {operation: 'inspect', genome});
    state.genome = genome;
    state.genomeName = label.replace(/\.genome$/i, '');
    state.report = result;
    state.mode = 'genome';
    state.stale = true;
    state.tab = 'cppn';
    state.graphSelection = {kind: 'node', id: 10};
    message(`${label} geöffnet · ${result.cppn.nodes.length} CPPN-Knoten.`, 'good');
  } catch (error) { message('Genom öffnen: ' + error.message, 'warn'); }
  finally { state.busy = false; render(); }
}

async function inspectFile(file) {
  if (!file) return;
  if (file.size > 1000000) return message('Die Genomdatei ist größer als 1 MB.', 'warn');
  await inspectGenome(await file.text(), file.name);
}

async function takeFish() {
  const id = Number(sceneState.frame?.selected);
  if (!Number.isInteger(id) || id < 1)
    return message('Wähle erst im Aquarium einen Fisch aus.', 'warn');
  try {
    const response = await fetch('/genome?id=' + id);
    if (!response.ok) throw Error('Das Genom des gewählten Fisches ist nicht mehr verfügbar.');
    await inspectGenome(await response.text(), 'Fisch ' + id);
  } catch (error) { message('Fisch übernehmen: ' + error.message, 'warn'); }
}

async function applyGraphEdit(payload) {
  if (state.busy || !state.genome) return;
  state.busy = true;
  message('CPPN-Änderung wird entwickelt …');
  try {
    const {result} = await request('/atelier', {operation: 'edit', genome: state.genome, ...payload});
    state.genome = result.genome;
    state.report = result;
    state.mode = 'genome';
    state.stale = true;
    message('CPPN-Änderung übernommen · ' + result.neurons + ' Zellen, ' + result.synapses + ' Synapsen.', 'good');
  } catch (error) { message('CPPN: ' + error.message, 'warn'); }
  finally { state.busy = false; render(); }
}

async function placeEggs() {
  try {
    const {message: saved} = await request('/command', {
      command: 'population-import', genome: state.genome,
      name: (state.genomeName || state.plan.name) + '.genome'
    });
    navigate('aquarium');
    beginEggPlacement({saved: saved.replace(/^archive:/, '')});
  } catch (error) { message('Eier platzieren: ' + error.message, 'warn'); }
}

function download() {
  const filename = (state.genomeName || state.plan.name || 'entwurf')
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '_').slice(0, 50);
  const url = URL.createObjectURL(new Blob([state.genome], {type: 'text/plain;charset=utf-8'}));
  const a = document.createElement('a');
  a.href = url; a.download = filename + '.genome';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function selectSite(index) {
  const p = SITES[index], g = group();
  if (!p || !g) return;
  remember();
  Object.assign(g, {zone: p.zone, side: p.side, u0: p.u, u1: p.u,
    v0: p.v, v1: p.v, w0: p.w, w1: p.w});
  changed(); render();
}

function selectGroup(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.plan.groups.length) return;
  state.selected = index;
  render();
}

function mutate(prop, value, isReceptor = false) {
  const g = group();
  if (!g) return;
  const target = isReceptor ? g.receptors[state.effect] : g;
  if (prop === 'name') {
    value = String(value).slice(0, 60);
    if (!value.trim()) { message('Die Zellgruppe braucht einen Namen.', 'warn'); return; }
  } else {
    value = Number(value);
    if (!Number.isFinite(value)) return;
    if (prop === 'copies') value = Math.max(1, Math.min(16, Math.round(value)));
    if (prop === 'zone') value = Math.max(0, Math.min(3, Math.round(value)));
    if (prop === 'sigma') value = Math.max(.03, Math.min(2, value));
    if (['u0','u1','v0','v1','w0','w1'].includes(prop)) value = Math.max(0, Math.min(1, value));
  }
  if (target[prop] === value) return;
  remember();
  target[prop] = value;
  if (!isReceptor && prop === 'role')
    g.function = value === 1 ? -1 : value === 0 ? (g.zone === 1 ? 4 : 3) :
      [5, 2, 1, 0][g.zone];
  if (!isReceptor && /^[uvw][01]$/.test(prop)) {
    const axis = prop[0];
    if (g[axis + '0'] > g[axis + '1']) g[axis + (prop[1] === '0' ? '1' : '0')] = value;
  }
  changed(); render();
}

async function actions(name) {
  if (name === 'home') return navigate('hub');
  if (name === 'aquarium') return navigate('aquarium');
  if (name === 'atelier') return navigate('studio');
  if (state.busy) return;
  if (name === 'develop') return compile();
  if (name === 'open') return root.querySelector('#aid-file')?.click();
  if (name === 'take-fish') return takeFish();
  if (name === 'download' && state.genome) return download();
  if (name === 'place' && state.genome && state.report?.viable && !state.report?.limited)
    return placeEggs();
  if (name === 'undo' && state.undo.length) {
    state.plan = state.undo.pop(); changed(); return render();
  }
  if (name === 'template') {
    if (!confirm('Den bisherigen Fischbauplan durch die Handfisch-Vorlage ersetzen?')) return;
    remember(); state.plan = handfishPlan(); state.selected = 0; changed(); return render();
  }
  if (name === 'add') {
    if (state.plan.groups.length >= 80) return message('Höchstens 80 Zellgruppen.', 'warn');
    remember();
    state.plan.groups.push(newGroup('Neue Gruppe ' + (state.plan.groups.length + 1),
      {zone: 2, side: 1, u0: 0, u1: 0, v0: 0, v1: 0, w0: 0, w1: 0}));
    state.selected = state.plan.groups.length - 1; state.tab = 'anatomy';
    changed(); return render();
  }
  if (name === 'duplicate') {
    if (state.plan.groups.length >= 80) return message('Höchstens 80 Zellgruppen.', 'warn');
    remember();
    state.plan.groups.splice(state.selected + 1, 0, structuredClone({...group(), name: group().name + ' Kopie'}));
    ++state.selected; changed(); return render();
  }
  if (name === 'remove') {
    if (state.plan.groups.length <= 1) return message('Mindestens eine Zellgruppe muss bleiben.', 'warn');
    remember(); state.plan.groups.splice(state.selected, 1);
    state.selected = Math.min(state.selected, state.plan.groups.length - 1);
    changed(); return render();
  }
  if (name === 'graph-save-node') {
    const id = state.graphSelection?.kind === 'node' && state.graphSelection.id;
    if (id == null) return;
    const type = Number(root.querySelector('#aid-graph-type')?.value);
    const parameter = Number(root.querySelector('#aid-graph-parameter')?.value);
    return applyGraphEdit({edit: 'node', id, type, parameter});
  }
  if (name === 'graph-save-link') {
    const id = state.graphSelection?.kind === 'link' && state.graphSelection.id;
    if (id == null) return;
    return applyGraphEdit({edit: 'link', id,
      weight: Number(root.querySelector('#aid-graph-weight')?.value),
      enabled: root.querySelector('#aid-graph-enabled')?.checked ? 1 : 0});
  }
  if (name === 'graph-split') {
    const id = state.graphSelection?.kind === 'link' && state.graphSelection.id;
    if (id == null) return;
    state.graphSelection = {kind: 'node', id: 10 + state.graphOutput};
    return applyGraphEdit({edit: 'split', id});
  }
  if (name === 'graph-find-link') {
    const id = Number(root.querySelector('#aid-find-link')?.value);
    if (!state.report?.cppn.links.some(e => e[0] === id))
      return message('Diese Kanten-ID existiert nicht.', 'warn');
    state.graphSelection = {kind: 'link', id};
    return render();
  }
  if (name === 'graph-connect') {
    const {from,to,weight,port} = state.connect;
    return applyGraphEdit({edit: 'connect', from, to, weight, port});
  }
}

function onClick(event) {
  const action = event.target.closest('[data-action]');
  if (action) { void actions(action.dataset.action); return; }
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    render(); return;
  }
  const effect = event.target.closest('[data-effect]');
  if (effect) { state.effect = Number(effect.dataset.effect); render(); return; }
  const release = event.target.closest('[data-release]');
  if (release) {
    const [q1, q2] = hormonePoint(Number(release.dataset.release));
    remember(); group().q1 = q1; group().q2 = q2;
    changed(); render(); return;
  }
  const site = event.target.closest('[data-site]');
  if (site) { selectSite(Number(site.dataset.site)); return; }
  const selected = event.target.closest('[data-select-group]');
  if (selected) { selectGroup(Number(selected.dataset.selectGroup)); return; }
  const output = event.target.closest('[data-output]');
  if (output) {
    state.graphOutput = Number(output.dataset.output);
    state.graphSelection = {kind: 'node', id: 10 + state.graphOutput};
    render(); return;
  }
  const node = event.target.closest('[data-node]');
  if (node) { state.graphSelection = {kind: 'node', id: Number(node.dataset.node)}; render(); return; }
  const link = event.target.closest('[data-link]');
  if (link) { state.graphSelection = {kind: 'link', id: Number(link.dataset.link)}; render(); }
}

function onChange(event) {
  const input = event.target;
  if (input.id === 'aid-file') {
    void inspectFile(input.files?.[0]); return;
  }
  if (input.id === 'aid-layer') { state.layer = input.value; render(); return; }
  if (input.id === 'aid-graph-output') {
    state.graphOutput = Number(input.value);
    state.graphSelection = {kind: 'node', id: 10 + state.graphOutput};
    render(); return;
  }
  if (input.id === 'aid-plan-name') {
    const value = input.value.trim();
    if (value && value !== state.plan.name) {
      remember(); state.plan.name = value.slice(0, 40); changed(); render();
    }
    return;
  }
  if (input.dataset.prop) return mutate(input.dataset.prop, input.value);
  if (input.dataset.recProp) return mutate(input.dataset.recProp,
    input.type === 'checkbox' ? Number(input.checked) : input.value, true);
  if (input.id.startsWith('aid-connect-') || input.id === 'aid-graph-new-weight') {
    const key = {'aid-connect-from': 'from', 'aid-connect-to': 'to',
      'aid-connect-port': 'port', 'aid-graph-new-weight': 'weight'}[input.id];
    if (key) state.connect[key] = Number(input.value);
  }
}

function onInput(event) {
  if (!event.target.matches('input[type="range"]')) return;
  const output = event.target.closest('label')?.querySelector('output');
  if (output) output.textContent = Number(event.target.value).toFixed(2);
}

function bindCodeDragging() {
  let dragging = null;
  root.addEventListener('pointerdown', event => {
    const dot = event.target.closest('[data-drag-code]');
    if (!dot || state.station !== 'studio') return;
    dragging = {pointerId: event.pointerId, dot, code: dot.dataset.dragCode, before: structuredClone(state.plan)};
    dot.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  root.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const svg = root.querySelector('#aid-contact-map');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 510,
      y = (event.clientY - rect.top) / rect.height * 426;
    const a = Math.round(Math.max(-1, Math.min(1, (x - 50) / 177 - 1)) * 100) / 100;
    const b = Math.round(Math.max(-1, Math.min(1, (380 - y) / 155 - 1)) * 100) / 100;
    const key = dragging.code;
    group()[key + '1'] = a; group()[key + '2'] = b;
    dragging.dot.setAttribute('cx', String(50 + (a + 1) * 177));
    dragging.dot.setAttribute('cy', String(380 - (b + 1) * 155));
  });
  const finish = event => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    state.undo.push(dragging.before);
    if (state.undo.length > 30) state.undo.shift();
    dragging = null; changed(); render();
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
}

export function initializeStudio() {
  root = document.getElementById('station-root');
  if (!root) return;
  restoreDraft();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  bindCodeDragging();
  document.getElementById('open-station-hub')?.addEventListener('click', () => navigate('hub'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.station === 'studio' && !event.target.closest('input,select'))
      navigate('hub');
  });
  render();
  setInterval(liveStats, 1000);
}
