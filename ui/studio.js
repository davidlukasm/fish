import {sceneState} from './state.js';
import {beginEggPlacement} from './world.js';
import {AVAILABLE_MOTORS, AVAILABLE_SENSES, PALETTE, PALETTE_SECTIONS, SITES,
  STARTER_MODULES, ZONES, activeSubstances, blankPlan, functionAtSite, groupName,
  handfishPlan, hasSite, hormonePoint, iconPath, newGroup, organColor, releasedSubstance, scentPoint,
  validSiteFor} from './studio_model.js';
import {bodyPosition, connectionInspector, contactLikelihood, development,
  developmentDots, esc, fishCanvas, fishControls, hormoneInspector, organIconSvg,
  sitePosition} from './studio_views.js';
import {GRAPH_PARAMETER, GRAPH_SCOPES, cppnControls, cppnGraph} from './studio_graph.js';

const STORAGE_KEY = 'fish-v019-atelier-draft';
const MODULES_KEY = 'fish-v019-atelier-library';
const tabs = [
  ['anatomy', '01', 'Fisch'], ['development', '02', 'Prüfen']
];
const state = {
  station: 'hub', tab: 'anatomy', plan: blankPlan(), selected: -1, brush: null,
  layer: 'organs', zoom: 1, centre: [480,200], moduleBrush: null,
  modules: [], multiSelected: [], selectionMode: false, wireSource: null, selectedConnection: null,
  hormoneSelected: 0, effect: 5, graphScope: 'cells', graphOutput: 0,
  graphSelection: {kind: 'node', id: 10}, graphLinkMode: false, graphLinkFrom: null,
  connect: {from: 9, to: 10, weight: 1, port: 0},
  report: null, genome: '', genomeName: '', mode: 'plan', stale: true, busy: false,
  message: '', messageKind: '', undo: []
};
let root;

function restoreModules() {
  try {
    const saved=JSON.parse(localStorage.getItem(MODULES_KEY));
    if(Array.isArray(saved)) state.modules=saved.filter(m=>m&&typeof m.name==='string'&&
      Array.isArray(m.groups)&&m.groups.length>0&&m.groups.length<=12).slice(0,40);
  } catch (_) { /* Optional. */ }
}

function saveModules() {
  try {localStorage.setItem(MODULES_KEY,JSON.stringify(state.modules));}catch (_) {/* Optional. */}
}

function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.groups) || !saved.groups.length || saved.groups.length > 80)
      return false;
    for (const g of saved.groups)
      if (!g || typeof g.name !== 'string' || !Array.isArray(g.receptors) || g.receptors.length !== 7)
        return false;
    state.plan = saved;
    state.selected = 0;
    state.report = null;
    state.genome = '';
    state.stale = true;
    return true;
  } catch (_) { /* Storage can be disabled, or a draft can predate the current schema. */ }
  return false;
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
      <p>Beobachte eine lebendige Welt im Aquarium. Im Atelier gestaltest du eigene Fische,
      verbindest ihre Nervenzellen und veränderst die Regeln ihrer Entwicklung.</p>
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
    return `<div class="aid-side-heading"><small>GENOM-EDITOR</small><strong>Rechenbereiche</strong></div>` +
      `<div class="aid-group-list">${GRAPH_SCOPES.map(s=>
        `<button data-scope="${s.key}" class="aid-group-row ${state.graphScope===s.key?'selected':''}">` +
        `<span><strong>${esc(s.name)}</strong><small>${s.outputs.length} Ausgänge</small></span></button>`).join('')}</div>` +
      `<div class="aid-sidebar-tools aid-sidebar-stack"><button data-action="graph-new">Neues CPPN</button>` +
      `<button data-action="graph-sum">Beispiel: Addition</button></div>`;
  }
  const tools=PALETTE_SECTIONS.map(category=>`<section class="aid-sidebar-category">
    <h3>${esc(category)}</h3><div class="aid-sidebar-parts">
      ${PALETTE.map((p,i)=>p.category!==category?'':`<button type="button"
        class="aid-palette-part ${state.brush===i?'active':''}" data-tool="${i}"
        style="--tone:${organColor(p)}" title="${esc(p.hint)}">
        ${organIconSvg(p,26)}<span>${esc(p.name)}</span></button>`).join('')}
    </div></section>`).join('');
  const modules=[...STARTER_MODULES,...state.modules];
  return `<div class="aid-side-heading"><small>BAUBIBLIOTHEK</small><strong>Bauteile & Baugruppen</strong>
    <p>Auf den Fisch ziehen. Die passenden Plätze leuchten auf.</p></div>
    <div class="aid-library-scroll">
      <section class="aid-sidebar-category aid-library-modules"><h3>Fertige Baugruppen</h3>
         <button type="button" data-action="build-module"
           class="aid-build-module ${state.selectionMode?'active':''}">
           ${state.selectionMode?'✓ Auswahl beenden':'＋ Eigene Baugruppe bauen'}</button>
         ${state.selectionMode?'<p class="aid-module-howto">Wähle am Fisch mehrere Organe und Schaltkreise aus. Rechts kannst du sie gemeinsam verschieben, spiegeln und speichern.</p>':
           '<p class="aid-module-howto">Auch asymmetrische Gruppen: mehrere Bauteile am Fisch wählen, Verbindungen zeichnen und anschließend sichern.</p>'}
        <div class="aid-sidebar-modules">${modules.map(m=>`<button type="button"
          data-module="${esc(m.key)}" class="aid-library-module ${state.moduleBrush===m.key?'active':''}"
          title="${esc(m.hint||'Eigene Baugruppe')}">
          <span class="aid-module-glyph">${esc(m.icon||'✣')}</span>
          <span><strong>${esc(m.name)}</strong><small>${esc(m.hint||m.groups.length+' Gruppen')}</small></span>
        </button>`).join('')}</div>
      </section>
      ${tools}
      <details class="aid-placed-list"><summary>Gesetzte Bauteile
        <span>${state.plan.groups.length}</span></summary>
        ${state.plan.groups.map((g,i)=>`<button data-select-group="${i}"
          class="aid-placed-row ${i===state.selected?'selected':''}" title="Im Fisch auswählen">
          ${organIconSvg(g,20)}<span>${esc(g.name)}</span></button>`).join('')}
      </details>
    </div>` +
    `<div class="aid-sidebar-tools aid-sidebar-stack"><button data-action="new-fish">＋ Neuer Fisch</button>` +
    `<button data-action="restore-draft">Gespeicherten Entwurf öffnen</button>` +
    `<button data-action="template">Beispielfisch laden</button>` +
    `<button data-action="undo" ${state.undo.length ? '' : 'disabled'} title="Letzte Änderung rückgängig">↶ Rückgängig</button></div>`;
}

function studioCenter() {
  if (state.tab === 'cppn') {
    if (!state.report) return `<div class="aid-empty"><span>⌘</span><h2>CPPN-Werkbank</h2>` +
      `<p>Starte ein kleines eigenes Rechennetz. Alle v019-Eingänge und -Ausgänge sind vorhanden. ` +
      `Du verbindest und erweiterst sie selbst.</p>` +
      `<button data-action="graph-new" class="aid-primary">Leeres CPPN beginnen</button>` +
      `<button data-action="graph-sum">Zwei Eingänge addieren · Beispiel</button></div>`;
    return cppnGraph(state.report,state.graphOutput,state.graphSelection,
      state.graphScope,state.graphLinkFrom);
  }
  if (state.tab !== 'development') return fishCanvas(state.plan, state.selected, state.brush,
    state.stale ? null : state.report, {layer:state.layer,zoom:state.zoom,
      centre:state.centre,multiSelected:state.multiSelected,
      connection:state.selectedConnection,hormoneSelected:state.hormoneSelected,
      wireSource:state.wireSource,
      moduleTools:state.moduleBrush?moduleTools(currentModule()):null,
      toolOverride:state.moduleBrush?moduleTool(state.moduleBrush):null,
      moduleName:currentModule()?.name});
  return development(state.plan, state.report, state.stale);
}

function moduleInspector() {
  const indices=state.multiSelected.filter(i=>state.plan.groups[i]);
  return `<div class="aid-inspector-eyebrow">GEMEINSAME AUSWAHL</div>
    <h2 class="aid-inspector-name">Baugruppe · ${indices.length} Teile</h2>
    <p class="aid-inspector-help">Diese Teile können zusammen verschoben, gespiegelt
      oder als eigener Baustein gespeichert werden.</p>
    <div class="aid-inspector-card aid-module-selection">
      ${indices.map(i=>`<button data-inspect-group="${i}"
        style="--tone:${organColor(state.plan.groups[i])}">
        ${organIconSvg(state.plan.groups[i],22)}
        <span>${esc(state.plan.groups[i].name)}</span></button>`).join('')}
    </div>
    <div class="aid-inspector-card">
      <div class="aid-subheading">Ganze Baugruppe</div>
      <button data-action="mirror-selection" class="aid-primary">Links ↔ Rechts spiegeln</button>
      <button data-action="save-module">In Baubibliothek speichern</button>
      <button data-action="clear-multiselect">Einzelteil bearbeiten</button>
    </div>`;
}

function studioControls() {
  if (state.tab === 'cppn')
    return cppnControls(state.report,state.graphSelection,state.connect,state.graphLinkFrom);
  if(state.tab !== 'development') {
    if(state.layer==='hormones')return hormoneInspector(state.plan,state.hormoneSelected,
      group(),state.effect,state.selected);
    if(state.layer==='wires'&&state.selectedConnection)
      return connectionInspector(state.plan,state.selectedConnection);
    if(state.multiSelected.length>1)return moduleInspector();
    return fishControls(group(),state.plan,state.layer,state.effect,state.selected);
  }
  return `<div class="aid-inspector-eyebrow">ENTWICKLUNGSPRÜFUNG</div>` +
    `<h2 class="aid-inspector-name">Vom Entwurf zum Genom</h2>` +
    `<p class="aid-inspector-help">Die v019-Engine entwickelt das Nervensystem ` +
    `mit ihren echten Zell-, Hormon- und Kontaktregeln.</p>` +
    `<div class="aid-inspector-card"><div class="aid-subheading">Deinen Fisch benennen</div>` +
    `<label class="aid-field"><span>Name des Entwurfs</span><input id="aid-plan-name" ` +
    `maxlength="40" value="${esc(state.plan.name)}"></label>` +
    `<button data-action="develop" class="aid-primary" ${!state.plan.groups.length?'disabled':''}>` +
    `Entwickeln & prüfen</button></div>` +
    `<div class="aid-inspector-card"><div class="aid-subheading">Danach</div>` +
    `<p class="aid-microcopy">Du kannst das entstandene Genom im CPPN ansehen, ` +
    `abspeichern oder als Eier ins Aquarium einsetzen.</p>` +
    `<button data-tab="cppn">Rechenwege ansehen ↗</button></div>`;
}

function studio() {
  const valid = !!state.genome && !!state.report && (state.mode === 'genome' || !state.stale);
  const stats = state.report && valid ? `${state.report.neurons} Zellen · ${state.report.synapses} Synapsen` :
    `${state.plan.groups.length} Bauteile · Entwurf`;
  return `<div class="aid-workspace"><div class="aid-workspace-top">
    <div class="aid-workspace-brand"><button data-action="home" title="Zur Zentrale">← Zentrale</button>
      <div><small>AID / WERKSTATT 02</small><h1>Atelier</h1></div></div>
    <div class="aid-workspace-status"><span class="${state.stale ? 'unsynced' : 'synced'}"></span>` +
      `<span>${esc(stats)}${state.mode === 'genome' ? ' · CPPN-Fassung' : state.stale ? ' · Entwurf' : ' · entwickelt'}</span></div>
    <div class="aid-workspace-actions"><button data-action="open">Genom öffnen</button>` +
      `<button data-action="download" ${valid ? '' : 'disabled'}>Speichern</button>` +
      `<button class="aid-primary" data-action="develop" ${state.busy||!state.plan.groups.length ? 'disabled' : ''}>` +
      `${state.busy ? 'Entwicklung läuft …' : 'Fisch entwickeln'}</button>` +
      `<button data-action="place" ${valid && state.report.viable && !state.report.limited &&
        state.report.checks?.connections ? '' : 'disabled'}>Eier ins Aquarium ↗</button>` +
      `<details class="aid-more-menu"><summary>Weitere</summary><div>` +
      `<button data-action="take-fish">Fisch aus Aquarium übernehmen</button>` +
      `<button data-action="new-fish">Neuen Fisch beginnen</button></div></details></div>
    <input id="aid-file" type="file" accept=".genome,text/plain" hidden></div>
    <nav class="aid-workspace-modes" aria-label="Werkzeuge">
      <button data-tab="anatomy" class="${state.tab !== 'cppn' ? 'active' : ''}">Fisch gestalten <span>Organe · Nervensystem</span></button>
      <button data-tab="cppn" class="${state.tab === 'cppn' ? 'active' : ''}">CPPN bearbeiten <span>Genom · Rechennetz</span></button>
      ${state.tab !== 'cppn' ? `<div class="aid-subtabs">${tabs.map(([key,num,label]) =>
        `<button data-tab="${key}" class="${state.tab === key ? 'active' : ''}"><i>${num}</i> ${label}</button>`).join('')}</div>` :
        `<div class="aid-subtabs aid-info-tab">Ein Netz · 10 Eingänge · 20 Ausgänge</div>`}
    </nav>
    ${state.mode === 'genome' ? `<div class="aid-workspace-advice">Du bearbeitest das CPPN direkt. ` +
      `„Fisch entwickeln“ erzeugt das Genom aus dem Fischbauplan erneut und überschreibt die CPPN-Änderungen.</div>` :
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
  if (state.plan.groups.length===0) state.selected=-1;
  else state.selected=Math.max(0,Math.min(state.selected,state.plan.groups.length-1));
  if (group() && !(
    state.effect===5 || state.effect===6 || group().role===1 ||
    (group().role===2 && state.effect===0))) state.effect=5;
  document.body.dataset.station = state.station;
  root.hidden = state.station === 'aquarium';
  if (state.station === 'aquarium') return;
  const scrolls=state.station==='studio'&&root.querySelector ?
    ['.aid-workspace-sidebar','.aid-workspace-canvas','.aid-workspace-controls',
      '.aid-library-scroll'].map(s=>[s,root.querySelector(s)?.scrollTop||0]):[];
  const expanded=state.station==='studio'&&root.querySelector ?
    ['.aid-breeding-options','.aid-placed-list'].filter(s=>root.querySelector(s)?.open):[];
  root.innerHTML = state.station === 'hub' ? hub() : studio();
  for(const [selector,pos] of scrolls) {
    const element=root.querySelector(selector);
    if(element)element.scrollTop=pos;
  }
  for(const selector of expanded) {
    const element=root.querySelector(selector);
    if(element)element.open=true;
  }
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
  if (!state.plan.groups.length) return message('Setze zuerst ein Bauteil auf den Fisch.', 'warn');
  state.busy = true;
  message('Die Engine entwickelt Zellen und ihre Kontakte …');
  try {
    const {result} = await request('/atelier', {operation: 'build', plan: state.plan});
    state.report = result;
    state.genome = result.genome;
    state.genomeName = state.plan.name;
    state.stale = false;
    state.mode = 'plan';
    message(`${result.neurons} Zellen, ${result.synapses} Synapsen. ` +
      `${result.viable ? 'Anatomische Mindestvoraussetzungen erfüllt.' :
        'Es fehlen noch Organe für einen startfähigen Fisch.'}`,result.viable?'good':'warn');
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
    state.graphScope = 'cells';
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
    if(payload.edit==='add-node') {
      const last=Math.max(...result.cppn.nodes.map(n=>n[0]));
      state.graphSelection={kind:'node',id:last};
    }
    message('CPPN berechnet · '+result.neurons+' Zellen, '+result.synapses+' Synapsen.','good');
  } catch (error) { message('CPPN: ' + error.message, 'warn'); }
  finally { state.busy = false; render(); }
}

async function createGraph(example='blank') {
  if(state.busy) return;
  if(state.genome && !confirm('Ein neues CPPN beginnen? Der bisherige Genom-Entwurf kann zuvor gespeichert werden.')) return;
  state.busy=true;
  message('Neues CPPN wird angelegt …');
  try {
    const {result}=await request('/atelier',{operation:'new',example});
    state.genome=result.genome;
    state.report=result;
    state.genomeName=example==='sum'?'Addition':'Neues CPPN';
    state.mode='genome';
    state.stale=true;
    state.tab='cppn';
    state.graphScope='cells';
    state.graphOutput=0;
    state.graphSelection={kind:'node',id:10};
    state.graphLinkFrom=null;
    state.graphLinkMode=false;
    message(example==='sum'?'Zwei Ortswerte werden am Ausgang „Zelle anlegen“ addiert.':
      'Leeres CPPN: Verbinde links Eingänge mit Rechenbausteinen oder Ausgängen.','good');
  } catch(error) {message('Neues CPPN: '+error.message,'warn');}
  finally{state.busy=false;render();}
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

function positionFromEvent(event) {
  const svg=root.querySelector('#aid-body-map');
  if(!svg) return null;
  if(svg.createSVGPoint && svg.getScreenCTM()) {
    const pt=svg.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;
    const p=pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x,p.y];
  }
  const r=svg.getBoundingClientRect();
  return r.width&&r.height ? [state.centre[0]+(event.clientX-r.left-r.width/2)*960/state.zoom/r.width,
    state.centre[1]+(event.clientY-r.top-r.height/2)*400/state.zoom/r.height] : null;
}

function nearestPlace(tool,x,y,exclude=-1,reserved=[],ignore=[]) {
  const side=y<200?-1:1;
  const candidates=SITES.filter(p=>p.side===side&&validSiteFor(tool,p)&&
    !state.plan.groups.some((other,i)=>i!==exclude&&!ignore.includes(i)&&hasSite(other,p))&&
    !reserved.some(other=>hasSite(other,p)));
  let best=null,distance=Infinity;
  for(const p of candidates) {
    const [px,py]=sitePosition(p,tool),d=Math.hypot(px-x,py-y);
    if(d<distance) {best=p;distance=d;}
  }
  if(best&&distance<=82) return {site:best,distance};
  return {error:candidates.length?'Hier gibt es für dieses Bauteil keinen passenden Entwicklungsort. '+
    'Die möglichen Stellen sind farbig hervorgehoben.':
    'Alle passenden Entwicklungsorte sind bereits belegt.'};
}

function pairedSite(target, excludeBundle = null, reserved = []) {
  // Storage, release, and filling sensor occupy the three w positions of one location.
  return SITES.filter(p=>p.zone===3&&p.side===target.side&&p.v===1/3&&p.w===0)
    .filter(p=>[0,.5,1].every(w=>!state.plan.groups.some(g=>
      g.bundle!==excludeBundle&&hasSite(g,{...p,w}))&&
      !reserved.some(g=>hasSite(g,{...p,w}))))
    .sort((a,b)=>Math.abs(a.u-target.u)-Math.abs(b.u-target.u))[0];
}

function setLocation(g,p) {
  Object.assign(g,{zone:p.zone,side:p.side,u0:p.u,u1:p.u,
    v0:p.v,v1:p.v,w0:p.w,w1:p.w});
  if(g.autoName) g.name=groupName(g,state.plan.groups.indexOf(g));
}

function contactAddress(index) {
  return [-.9+.2*(index%10),-.9+.2*(Math.floor(index/10)%10)];
}

function createPart(tool,x,y,reserved=[],options=null) {
  const reproductive=tool.role===2&&[3,4].includes(tool.function)&&!options?.singleComponent;
  const index=state.plan.groups.length+reserved.length,[sx,sy]=contactAddress(index),
    values=options?{...options}:null;
  if(values)delete values.singleComponent;
  const base=newGroup('',{role:tool.role,function:tool.function??-1,zone:tool.zone,
    autoName:true,copies:tool.role===2?6:tool.role===1?4:3,
    threshold:tool.role===0?-.6:tool.role===2?-.4:0,
    sender1:tool.role===2?-1:sx,sender2:tool.role===2?-1:sy,
    receiver1:tool.role===0?-1:-.99,receiver2:tool.role===0?-1:-.99,
    sigma:.12,crossing:-.5,range:.9,...(values||{})});
  if(tool.preset) {
    base.nervePreset=tool.preset;
    if(tool.preset==='inhibit')base.sign=-1;
    if(tool.preset==='learn') {base.qwidth=.8;base.mode=.55;}
    if(tool.preset==='pace') {base.pace=1;base.tau=.2;}
    if(tool.preset==='modulate')base.modulator=1;
  }
  const found=nearestPlace(tool,x,y,-1,reserved);
  if(found.error) return {error:found.error};
  const location=reproductive?pairedSite(found.site,null,reserved):found.site;
  if(!location) return {error:'Hier braucht das Organ drei freie Entwicklungsorte.'};
  base.function=functionAtSite(tool,location);
  setLocation(base,location);
  base.name=groupName(base,index);
  const groups=[base];
  // The third site is an inner pressure receptor; nearest-organ assignment is
  // performed by the engine at development time.
  if(reproductive) {
    const bundle='gonad-'+Date.now()+'-'+index;
    base.bundle=bundle;
    base.w0=base.w1=0;
    base.v0=base.v1=1/3;
    base.name=tool.function===3?'Eier bilden':'Spermien bilden';
    const release=structuredClone(base);
    release.w0=release.w1=1;
    release.name=tool.function===3?'Eier ablegen':'Spermien abgeben';
    const [rx,ry]=contactAddress(index+2);
    const pressure=newGroup(tool.function===3?'Eifüllung spüren':'Spermienvorrat spüren',{
      role:0,function:9,zone:3,side:location.side,u0:location.u,u1:location.u,
      v0:1/3,v1:1/3,w0:.5,w1:.5,copies:2,threshold:-.4,
      sender1:rx,sender2:ry,receiver1:-.99,receiver2:-.99,
      sigma:.12,crossing:-.5,range:.9,bundle,autoName:false
    });
    groups.push(release,pressure);
  }
  return {groups,site:location};
}

function moduleTools(module) {
  return module?.tools?module.tools.map(i=>PALETTE[i]):module?.groups||[];
}

function currentModule() {
  return [...STARTER_MODULES,...state.modules].find(m=>m.key===state.moduleBrush);
}

function moduleTool(key) {
  const m=[...STARTER_MODULES,...state.modules].find(item=>item.key===key);
  return m ? (m.tools?PALETTE[m.tools[0]]:m.groups?.[0]) : null;
}

function attachContact(source,target) {
  if(source===target || source.role===2 || target.role===0 ||
      source.role===0&&target.role===2) return false;
  target.incomingAddresses??=[];
  const point=[source.sender1,source.sender2];
  if(!target.incomingAddresses.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<.001))
    target.incomingAddresses.push(point);
  const n=target.incomingAddresses.length;
  target.receiver1=target.incomingAddresses.reduce((s,p)=>s+p[0],0)/n;
  target.receiver2=target.incomingAddresses.reduce((s,p)=>s+p[1],0)/n;
  const radius=Math.max(...target.incomingAddresses.map(p=>
    Math.hypot(p[0]-target.receiver1,p[1]-target.receiver2)));
  target.sigma=Math.max(target.sigma,.18,radius*1.7);
  return true;
}

function planModuleAt(x,y) {
  const module=currentModule();
  if(!module)return {error:'Wähle zuerst eine Baugruppe.'};
  const reserved=[],indices=[],created=[],first=module.tools?
    PALETTE[module.tools[0]]:module.groups[0],firstSide=first.side||-1,
    placementSide=y<200?-1:1,flip=firstSide===placementSide?1:-1,
    firstPosition=module.groups?bodyPosition(first,firstSide):null;
  for(let i=0;i<(module.tools?.length||module.groups.length);i++) {
    const tool=module.tools?PALETTE[module.tools[i]]:module.groups[i];
    const opts=module.groups?structuredClone(module.groups[i]):null;
    const label=opts?.name;
    if(opts) {delete opts.bundle;delete opts.name;opts.singleComponent=true;}
    const [targetX,targetY]=module.groups?(()=>{
      const [px,py]=bodyPosition(tool,tool.side||firstSide);
      return [x+px-firstPosition[0],y+(py-firstPosition[1])*flip];
    })():[i===0?x:([125,270,470,695][tool.zone]+
      Math.max(-40,Math.min(40,x-([125,270,470,695][first.zone])))),
      i===0?y:200+(y<200?-1:1)*(i%2?46:72)];
    const part=createPart(tool,targetX,targetY,reserved,opts);
    if(part.error)return {error:part.error};
    if(label&&!opts?.autoName)part.groups[0].name=label;
    indices.push(state.plan.groups.length+reserved.length);
    reserved.push(...part.groups);
    created.push(part.groups[0]);
  }
  if(state.plan.groups.length+reserved.length>80)
    return {error:'Diese Baugruppe überschreitet das Limit von 80 Zellgruppen.'};
  return {module,reserved,created,indices};
}

function addModuleAt(x,y) {
  const planned=planModuleAt(x,y);
  if(planned.error)return message('Baugruppe: '+planned.error,'warn');
  const {module,reserved,created,indices}=planned;
  remember();
  if(module.links) for(const [a,b] of module.links) attachContact(created[a],created[b]);
  if(module.hormone!=null&&created[1]) {
    const r=created[1].receptors[1];r.active=1;r.substance=module.hormone;
    r.sensitivity=.8;created[0].q1=hormonePoint(module.hormone)[0];
    created[0].q2=hormonePoint(module.hormone)[1];
  }
  state.plan.groups.push(...reserved);
  state.selected=indices[0];
  state.multiSelected=indices;
  changed();render();
}

function addAt(x,y) {
  if(state.moduleBrush)return addModuleAt(x,y);
  const tool=PALETTE[state.brush];
  if(!tool) return message('Wähle links ein Bauteil oder eine Baugruppe.', 'warn');
  const made=createPart(tool,x,y);
  if(made.error) return message(made.error,'warn');
  if(state.plan.groups.length+made.groups.length>80)
    return message('Der Bauplan ist voll (höchstens 80 Gruppen).','warn');
  remember();
  state.plan.groups.push(...made.groups);
  state.selected=state.plan.groups.length-made.groups.length;
  state.multiSelected=[state.selected];
  changed();render();
}

function moveTo(index,x,y) {
  const g=state.plan.groups[index];
  if(!g) return;
  const found=nearestPlace(g,x,y,index);
  if(found.error) return message(found.error,'warn');
  const location=g.bundle?pairedSite(found.site,g.bundle):found.site;
  if(!location) return message('An dieser Stelle fehlt Platz für das Fortpflanzungsorgan.','warn');
  const bilateral=g.side===0;
  if(bilateral&&state.plan.groups.some((other,i)=>i!==index&&
      hasSite(other,{...location,side:-location.side})))
    return message('Auf der anderen Körperseite ist dieser Platz schon belegt.','warn');
  remember();
  const siblings=g.bundle?state.plan.groups.filter(other=>other.bundle===g.bundle):[g];
  for(const member of siblings) {
    const oldW=member.w0;
    setLocation(member,location);
    if(bilateral)member.side=0;
    if(g.bundle) {
      member.w0=member.w1=oldW;
      member.v0=member.v1=1/3;
      const eggs=siblings.some(s=>s.function===3);
      if(member.role===0)member.name=eggs?'Eifüllung spüren':'Spermienvorrat spüren';
      else if(member.autoName)member.name=eggs?
        (oldW===0?'Eier bilden':'Eier ablegen'):
        (oldW===0?'Spermien bilden':'Spermien abgeben');
    }
  }
  state.selected=index;
  changed();render();
}

function moveSelectionTo(anchor,x,y) {
  const indices=state.multiSelected.filter(i=>state.plan.groups[i]);
  if(indices.length<2||!indices.includes(anchor))return moveTo(anchor,x,y);
  if(indices.some(i=>state.plan.groups[i].bundle))
    return message('Fortpflanzungsorgane werden als zusammengehöriges Organ verschoben.','warn');
  const [ax,ay]=bodyPosition(state.plan.groups[anchor]),dx=x-ax,dy=y-ay;
  const reserved=[],places=[];
  for(const i of indices) {
    const g=state.plan.groups[i],[gx,gy]=bodyPosition(g);
    const found=nearestPlace(g,gx+dx,gy+dy,i,reserved,indices);
    if(!found.site)return message('Für die ganze Baugruppe ist an dieser Stelle zu wenig Platz.','warn');
    places.push([i,found.site]);
    reserved.push({...g,zone:found.site.zone,side:found.site.side,
      u0:found.site.u,u1:found.site.u,v0:found.site.v,v1:found.site.v,
      w0:found.site.w,w1:found.site.w});
  }
  remember();
  for(const [i,p] of places)setLocation(state.plan.groups[i],p);
  changed();render();
}
function mirrorSelection() {
  const indices=state.multiSelected.filter(i=>state.plan.groups[i]),chosen=new Set(indices);
  if(!indices.length)return;
  const mirrored=indices.map(i=>({...state.plan.groups[i],
    side:-state.plan.groups[i].side}));
  const conflict=mirrored.some(candidate=>SITES.some(site=>
    hasSite(candidate,site)&&state.plan.groups.some((other,i)=>
      !chosen.has(i)&&hasSite(other,site))));
  if(conflict)return message('Auf der gegenüberliegenden Seite sind Entwicklungsorte belegt.','warn');
  remember();
  for(const i of indices) {
    const g=state.plan.groups[i];g.side=-g.side;
    if(g.autoName)g.name=groupName(g,i);
  }
  changed();render();
}

function selectGroup(index, append=false) {
  if (!Number.isInteger(index) || index < 0 || index >= state.plan.groups.length) return;
  state.selected = index;
  state.brush=null;state.moduleBrush=null;state.selectedConnection=null;
  state.multiSelected=append ? (state.multiSelected.includes(index) ?
    state.multiSelected.filter(i=>i!==index) : [...state.multiSelected,index]) : [index];
  render();
}

function removeGroup(index) {
  const g=state.plan.groups[index];
  if(!g)return;
  remember();
  const removed=g.bundle?state.plan.groups.filter(x=>x.bundle===g.bundle):[g];
  state.plan.groups=state.plan.groups.filter(x=>!removed.includes(x));
  for(const source of removed.filter(x=>x.role!==2))for(const target of state.plan.groups) {
    if(!target.incomingAddresses?.length)continue;
    target.incomingAddresses=target.incomingAddresses.filter(p=>
      Math.hypot(p[0]-source.sender1,p[1]-source.sender2)>.001);
    if(target.incomingAddresses.length) {
      target.receiver1=target.incomingAddresses.reduce((s,p)=>s+p[0],0)/
        target.incomingAddresses.length;
      target.receiver2=target.incomingAddresses.reduce((s,p)=>s+p[1],0)/
        target.incomingAddresses.length;
    } else {target.receiver1=target.receiver2=-.99;}
  }
  state.selected=Math.min(index,state.plan.groups.length-1);
  state.selectedConnection=null;state.wireSource=null;
  state.multiSelected=state.selected<0?[]:[state.selected];
  changed();render();
}

function connectGroups(from,to) {
  const src=state.plan.groups[from],dst=state.plan.groups[to];
  if(!src||!dst)return;
  if(src===dst||src.role===2||dst.role===0||(src.role===0&&dst.role===2))
    return message('Diese Richtung ist nicht möglich: Sinnesorgane senden an Schaltkreise, '+
      'Schaltkreise an weitere Schaltkreise oder Muskeln.','warn');
  remember();attachContact(src,dst);
  state.selected=to;state.wireSource=from;state.layer='wires';
  state.selectedConnection={from,to};
  changed();message(src.name+' → '+dst.name+': Empfangsfeld verbunden. Weitere Ziele anklicken.','good');
}

function disconnectSelected() {
  const connection=state.selectedConnection;
  if(!connection)return;
  const source=state.plan.groups[connection.from],target=state.plan.groups[connection.to];
  if(!source||!target)return;
  remember();
  target.incomingAddresses=(target.incomingAddresses||[]).filter(p=>
    Math.hypot(p[0]-source.sender1,p[1]-source.sender2)>.001);
  if(target.incomingAddresses.length) {
    target.receiver1=target.incomingAddresses.reduce((s,p)=>s+p[0],0)/
      target.incomingAddresses.length;
    target.receiver2=target.incomingAddresses.reduce((s,p)=>s+p[1],0)/
      target.incomingAddresses.length;
  } else {target.receiver1=target.receiver2=-.99;target.sigma=.03;}
  state.selectedConnection=null;state.wireSource=null;
  changed();message('Empfangsadresse von '+target.name+' angepasst.','good');
}

function saveSelectionModule() {
  const selected=state.multiSelected.length?state.multiSelected:[state.selected];
  const indices=[...new Set(selected)].filter(i=>state.plan.groups[i]).sort((a,b)=>a-b);
  if(!indices.length)return;
  const name=prompt('Name der Baugruppe',indices.length===1?group().name:'Meine Baugruppe');
  if(!name?.trim())return;
  const groups=indices.map(i=>structuredClone(state.plan.groups[i]));
  const links=[];
  for(let i=0;i<groups.length;i++)for(let j=0;j<groups.length;j++)
    if(contactLikelihood(groups[i],groups[j])>.7)links.push([i,j]);
  for(const g of groups) {
    delete g.bundle;delete g.sender1;delete g.sender2;delete g.receiver1;delete g.receiver2;
    delete g.incomingAddresses;
  }
  const m={key:'user-'+Date.now(),name:name.trim().slice(0,42),icon:'✣',
    hint:groups.length+' Bauteile · selbst zusammengestellt',groups,links};
  state.modules.push(m);state.selectionMode=false;saveModules();
  message('„'+m.name+'“ ist in deiner Baubibliothek gespeichert.','good');
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
  if (!isReceptor && prop === 'name') g.autoName=false;
  if (!isReceptor && prop === 'role')
    g.function = value===1?-1:value===0?AVAILABLE_SENSES[g.zone][0]:AVAILABLE_MOTORS[g.zone][0];
  if (!isReceptor && prop === 'zone' && g.role!==1 &&
      !(g.role===0?AVAILABLE_SENSES[g.zone]:AVAILABLE_MOTORS[g.zone]).includes(g.function))
    g.function=(g.role===0?AVAILABLE_SENSES[g.zone]:AVAILABLE_MOTORS[g.zone])[0];
  if (!isReceptor && g.autoName && ['role','function','zone','side'].includes(prop))
    g.name=groupName(g,state.selected);
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
  if(name==='hormone-add') {
    const used=activeSubstances(state.plan),
      index=[0,1,2,3].find(i=>!used.includes(i));
    if(index==null)return;
    remember();state.plan.substances??=[];
    state.plan.substances[index]='Stoff '+String.fromCharCode(65+index);
    state.hormoneSelected=index;changed();render();return;
  }
  if(name==='build-module') {
     state.selectionMode=!state.selectionMode;state.multiSelected=[];
     state.brush=null;state.moduleBrush=null;state.layer='organs';
     return message(state.selectionMode?
       'Baugruppe: Klicke ihre Teile am Fisch an. Danach kannst du sie gemeinsam spiegeln und speichern.':
       'Baugruppenauswahl beendet.');
   }
   if(name==='mirror-selection')return mirrorSelection();
  if(name==='clear-multiselect') {
    state.selectionMode=false;
    state.multiSelected=state.selected<0?[]:[state.selected];
    return render();
  }
  if(name==='wire-source-change') {
    state.selectedConnection=null;state.wireSource=null;
    return render();
  }
  if(name==='disconnect')return disconnectSelected();
  if (name === 'develop') return compile();
  if (name === 'graph-new') return createGraph('blank');
  if (name === 'graph-sum') return createGraph('sum');
  if (name === 'open') return root.querySelector('#aid-file')?.click();
  if (name === 'take-fish') return takeFish();
  if (name === 'download' && state.genome) return download();
  if (name === 'place' && state.genome && state.report?.viable &&
      !state.report?.limited && state.report?.checks?.connections)
    return placeEggs();
  if (name === 'undo' && state.undo.length) {
    state.plan = state.undo.pop(); changed(); return render();
  }
  if(name==='restore-draft') {
    if(!restoreDraft()) return message('Noch kein gespeicherter Fischentwurf vorhanden.','warn');
    state.brush=null;
    state.tab='anatomy';
    return message('Dein letzter Fischentwurf ist geladen.','good');
  }
  if(name==='new-fish') {
    if(state.plan.groups.length && !confirm('Einen neuen Fisch beginnen? Speichere den bisherigen Entwurf vorher, wenn du ihn behalten möchtest.')) return;
    state.plan=blankPlan();state.selected=-1;state.brush=null;
    state.report=null;state.genome='';state.mode='plan';state.stale=true;
    state.tab='anatomy';state.undo=[];state.multiSelected=[];
    state.moduleBrush=null;state.selectionMode=false;state.layer='organs';state.zoom=1;state.centre=[480,200];
    state.wireSource=null;state.selectedConnection=null;state.hormoneSelected=0;
    return message('Neuer Fisch. Ziehe links ein Bauteil auf den Körper.');
  }
  if (name === 'template') {
    if(state.plan.groups.length && !confirm('Den eigenen Entwurf durch den Beispielfisch ersetzen?')) return;
    remember(); state.plan = handfishPlan(); state.selected = 0;state.brush=null;
    state.moduleBrush=null;state.multiSelected=[0];state.selectionMode=false;
    state.selectedConnection=null;state.wireSource=null;
    changed(); return render();
  }
  if (name === 'add') {
    state.brush=PALETTE.findIndex(p=>p.role===1);
    state.tab='anatomy';
    return message('Klicke auf den Fisch, um Nervenzellen zu setzen.');
  }
  if (name === 'duplicate') {
    const g=group(),toolIndex=PALETTE.findIndex(p=>p.role===g?.role&&p.function===g?.function);
    if(toolIndex<0) return message('Für diese Zellart gibt es noch kein Platzierungswerkzeug.', 'warn');
    state.brush=toolIndex;state.tab='anatomy';
    return message('Klicke auf eine freie Stelle am Fisch, um ein weiteres Bauteil zu setzen.');
  }
  if (name === 'remove') {
    return removeGroup(state.selected);
  }
  if(name==='save-module')return saveSelectionModule();
  if(name==='mirror-group') {
    const g=group();if(!g)return;
    const target=g.side===0?-1:0;
    const overlaps=SITES.some(p=>(target===0||p.side===target)&&hasSite({...g,side:target},p)&&
      state.plan.groups.some((other,i)=>i!==state.selected&&hasSite(other,p)));
    if(overlaps)return message('Auf der anderen Körperseite sind einige dieser Plätze schon belegt.','warn');
    return mutate('side',target);
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
  if(name==='graph-add-node') {
    const type=Number(root.querySelector('#aid-new-type')?.value);
    return applyGraphEdit({edit:'add-node',type,parameter:1});
  }
  if(name==='graph-link-start') {
    state.graphLinkMode=!state.graphLinkMode;
    state.graphLinkFrom=null;
    return render();
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

let ignoredPointerTarget=null;
function swallowNextClick(target) {
  ignoredPointerTarget=target;
  setTimeout(()=>{if(ignoredPointerTarget===target)ignoredPointerTarget=null;},160);
}
function onClick(event) {
  if(event.target===ignoredPointerTarget) {ignoredPointerTarget=null;return;}
  const action = event.target.closest('[data-action]');
  if (action) { void actions(action.dataset.action); return; }
  const layer=event.target.closest('[data-layer]');
  if(layer) {
    state.layer=layer.dataset.layer;state.tab='anatomy';
    if(state.layer!=='organs'){state.brush=null;state.moduleBrush=null;}
    state.wireSource=null;state.selectedConnection=null;render();return;
  }
  const zoom=event.target.closest('[data-zoom]');
  if(zoom) {
    const op=zoom.dataset.zoom;
    state.zoom=op==='reset'?1:Math.max(1,Math.min(5,state.zoom*(op==='in'?1.4:1/1.4)));
    if(op==='reset')state.centre=[480,200];
    render();return;
  }
  const cluster=event.target.closest('[data-zoom-cluster]');
  if(cluster) {
    const values=cluster.dataset.zoomCluster.split(',').map(Number);
    if(values.length===2&&values.every(Number.isFinite)){
      state.centre=values;state.zoom=Math.min(5,Math.max(2,state.zoom*1.8));
      render();
    }
    return;
  }
  const module=event.target.closest('[data-module]');
  if(module) {
    state.moduleBrush=state.moduleBrush===module.dataset.module?null:module.dataset.module;
    state.brush=null;state.layer='organs';state.tab='anatomy';render();return;
  }
  const tool=event.target.closest('[data-tool]');
  if(tool) {
    const index=Number(tool.dataset.tool);
    state.brush=state.brush===index?null:index;
    state.moduleBrush=null;state.layer='organs';state.tab='anatomy';render();return;
  }
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    state.brush=null;
    render(); return;
  }
  const scope=event.target.closest('[data-scope]');
  if(scope) {
    state.graphScope=scope.dataset.scope;
    const outcomes=GRAPH_SCOPES.find(s=>s.key===state.graphScope)?.outputs||[0];
    if(!outcomes.includes(state.graphOutput)) state.graphOutput=outcomes[0];
    render();return;
  }
  const hormoneDelete=event.target.closest('[data-hormone-delete]');
  if(hormoneDelete) {
    const index=Number(hormoneDelete.dataset.hormoneDelete);
    if(!activeSubstances(state.plan).includes(index))return;
    const occupied=state.plan.groups.some(g=>
      g.role===2&&g.function===9&&releasedSubstance(g)===index||
      g.receptors.some((r,k)=>r.active&&r.substance===index));
    if(occupied)return message('Dieser Stoff wird noch produziert oder von Rezeptoren erkannt.','warn');
    remember();delete state.plan.substances[index];
    state.hormoneSelected=activeSubstances(state.plan)[0]??0;
    changed();render();return;
  }
  const hormonePick=event.target.closest('[data-hormone-select]');
  if(hormonePick) {
    state.hormoneSelected=Number(hormonePick.dataset.hormoneSelect);
    state.effect=5;render();return;
  }
  const hormoneTarget=event.target.closest('[data-hormone-target]');
  if(hormoneTarget)return selectGroup(Number(hormoneTarget.dataset.hormoneTarget));
  const hormoneToggle=event.target.closest('[data-hormone-toggle]');
  if(hormoneToggle&&group()) {
    const index=Number(hormoneToggle.dataset.hormoneToggle),g=group();
    if(!g.receptors[index])return;
    const r=g.receptors[index];
    remember();state.effect=index;
    if(r.active&&r.substance===state.hormoneSelected)r.active=0;
    else {
      r.active=1;r.substance=state.hormoneSelected;
      if(!r.sensitivity)r.sensitivity=.7;
    }
    changed();render();return;
  }
  const inspect=event.target.closest('[data-inspect-group]');
  if(inspect)return selectGroup(Number(inspect.dataset.inspectGroup));
  const effect = event.target.closest('[data-effect]');
  if (effect) { state.effect = Number(effect.dataset.effect); render(); return; }
  const cellCount=event.target.closest('[data-cell-count]');
  if(cellCount)return mutate('copies',cellCount.dataset.cellCount);
  const breed=event.target.closest('[data-breed]');
  if(breed&&group()) {
    const g=group(),key=breed.dataset.breed;
    remember();g.evolution??={};g.evolution[key]=!g.evolution[key];
    changed();render();return;
  }
  const preset=event.target.closest('[data-neuron-preset]');
  if(preset&&group()?.role===1) {
    const g=group(),mode=preset.dataset.neuronPreset;
    remember();g.nervePreset=mode;
    g.sign=mode==='inhibit'?-1:1;
    g.qwidth=mode==='learn'?.8:.2;
    g.mode=mode==='learn'?.55:0;
    g.pace=mode==='pace'?1:-1;
    g.modulator=mode==='modulate'?1:-1;
    if(g.autoName)g.name=groupName(g,state.selected);
    changed();render();return;
  }
  const fieldSize=event.target.closest('[data-field-size]');
  if(fieldSize)return mutate('field',fieldSize.dataset.fieldSize);
  const hue=event.target.closest('[data-hue]');
  if(hue)return mutate('q1',-1+2*Number(hue.dataset.hue)/7);
  const spectrum=event.target.closest('[data-spectrum-width]');
  if(spectrum)return mutate('qwidth',spectrum.dataset.spectrumWidth);
  const contrast=event.target.closest('[data-eye-contrast]');
  if(contrast)return mutate('q2',contrast.dataset.eyeContrast);
  const proximity=event.target.closest('[data-proximity-range]');
  if(proximity)return mutate('q2',proximity.dataset.proximityRange);
  const reach=event.target.closest('[data-contact-range]');
  if(reach)return mutate('range',reach.dataset.contactRange);
  const selectivity=event.target.closest('[data-contact-sigma]');
  if(selectivity)return mutate('sigma',selectivity.dataset.contactSigma);
  const crossing=event.target.closest('[data-contact-crossing]');
  if(crossing)return mutate('crossing',crossing.dataset.contactCrossing);
  const receiverOff=event.target.closest('[data-receptor-off]');
  if(receiverOff) return mutate('active',0,true);
  const baseline=event.target.closest('[data-hormone-baseline]');
  if(baseline)return mutate('baseline',baseline.dataset.hormoneBaseline,true);
  const affinity=event.target.closest('[data-receptor-width]');
  if(affinity)return mutate('width',affinity.dataset.receptorWidth,true);
  const target=event.target.closest('[data-connect-to]');
  if(target)return connectGroups(state.wireSource??state.selected,Number(target.dataset.connectTo));
  const connection=event.target.closest('[data-select-connection]');
  if(connection) {
    const [from,to]=connection.dataset.selectConnection.split(':').map(Number);
    state.selected=to;state.selectedConnection={from,to};
    state.layer='wires';state.wireSource=null;render();return;
  }
  const side=event.target.closest('[data-side]');
  if(side) return mutate('side',side.dataset.side);
  const sign=event.target.closest('[data-sign]');
  if(sign) return mutate('sign',sign.dataset.sign);
  const scent=event.target.closest('[data-scent]');
  if(scent) {
    const [q1,q2]=scentPoint(Number(scent.dataset.scent));
    remember();group().q1=q1;group().q2=q2;
    changed();render();return;
  }
  const wire=event.target.closest('[data-wire]');
  if(wire) {
    const [from,to]=wire.dataset.wire.split(':').map(Number);
    return connectGroups(from,to);
  }
  const substance=event.target.closest('[data-substance]');
  if(substance) {
    const r=group()?.receptors[state.effect];
    if(!r) return;
    remember();r.active=1;r.substance=Number(substance.dataset.substance);
    if(!r.sensitivity)r.sensitivity=.7;
    changed();render();return;
  }
  const direction=event.target.closest('[data-effect-direction]');
  if(direction) {
    const r=group()?.receptors[state.effect];
    if(!r)return;
    remember();r.sensitivity=(Math.abs(r.sensitivity)||.7)*Number(direction.dataset.effectDirection);
    r.active=1;changed();render();return;
  }
  const release = event.target.closest('[data-release]');
  if (release) {
    const [q1, q2] = hormonePoint(Number(release.dataset.release));
    remember(); group().q1 = q1; group().q2 = q2;
    changed(); render(); return;
  }
  const selected = event.target.closest('[data-select-group]');
  if (selected) {
    if(state.layer==='wires'&&state.wireSource!=null)
      return connectGroups(state.wireSource,Number(selected.dataset.selectGroup));
    selectGroup(Number(selected.dataset.selectGroup),!!event.shiftKey||state.selectionMode);return;
  }
  const place=event.target.closest('[data-place]');
  if(place) {
    const pos=positionFromEvent(event);
    if(pos&&(state.brush!=null||state.moduleBrush))addAt(...pos);
    return;
  }
  const output = event.target.closest('[data-output]');
  if (output) {
    state.graphOutput = Number(output.dataset.output);
    state.graphSelection = {kind: 'node', id: 10 + state.graphOutput};
    render(); return;
  }
  const node = event.target.closest('[data-node]');
  if (node) {
    const id=Number(node.dataset.node);
    if(state.graphLinkMode) {
      const role=state.report?.cppn.nodes.find(n=>n[0]===id)?.[3];
      if(state.graphLinkFrom===null) {
        if(role===2) return message('Wähle als Quelle einen Eingang oder Rechenbaustein.','warn');
        state.graphLinkFrom=id;state.graphSelection={kind:'node',id};render();return;
      }
      if(role===0) return message('Ein Eingang kann nur Signale senden.','warn');
      const from=state.graphLinkFrom;
      state.graphLinkFrom=null;state.graphLinkMode=false;
      return void applyGraphEdit({edit:'connect',from,to:id,weight:1,port:0});
    }
    state.graphSelection={kind:'node',id};render();return;
  }
  const link = event.target.closest('[data-link]');
  if (link) { state.graphSelection = {kind: 'link', id: Number(link.dataset.link)}; render(); }
}

function onChange(event) {
  const input = event.target;
  if (input.id === 'aid-file') {
    void inspectFile(input.files?.[0]); return;
  }
  if(input.dataset.hormoneName!==undefined) {
    const index=Number(input.dataset.hormoneName),label=input.value.trim().slice(0,24);
    if(!label||index<0||index>3)return;
    remember();state.plan.substances??=[];state.plan.substances[index]=label;
    changed();render();return;
  }
  if(input.dataset.spectrumSlider!==undefined)return mutate('qwidth',input.value);
  if(input.dataset.cellCountSlider!==undefined)return mutate('copies',input.value);
  if(input.id==='aid-graph-type') {
    const [label,help]=GRAPH_PARAMETER[Number(input.value)];
    const title=root.querySelector('#aid-param-label'),hint=root.querySelector('#aid-param-help');
    if(title)title.textContent=label||'Für Tor nicht benötigt';
    if(hint)hint.textContent=help;
    return;
  }
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
  if (input.id.startsWith('aid-connect-') || input.id === 'aid-graph-new-weight') {
    const key = {'aid-connect-from': 'from', 'aid-connect-to': 'to',
      'aid-connect-port': 'port', 'aid-graph-new-weight': 'weight'}[input.id];
    if (key) state.connect[key] = Number(input.value);
  }
}

function onInput(event) {
  if(!event.target.matches('input[type="range"]'))return;
  const input=event.target,value=Number(input.value);
  if(input.dataset.cellCountSlider!==undefined) {
    const count=Math.round(value),grid=root.querySelector('.aid-cell-cluster-grid'),
      label=root.querySelector('#aid-copies-count');
    if(grid)grid.innerHTML=Array.from({length:count},()=>'<i aria-hidden="true"></i>').join('');
    if(label)label.textContent=count+' von 16';
    return;
  }
  if(input.dataset.spectrumSlider!==undefined&&group()) {
    const centre=(group().q1+1)*3.5;
    root.querySelectorAll('.aid-spectrum-wheel button').forEach((button,i)=>{
      const distance=Math.abs(i-centre),weight=Math.exp(-distance*distance/(.1+value*22));
      button.style.setProperty('--spectrum-weight',String(.2+.8*weight));
    });
    return;
  }
  const output=input.closest('label')?.querySelector('output');
  if(output)output.textContent=value.toFixed(2);
}

function inside(element,event) {
  if(!element)return false;
  const r=element.getBoundingClientRect();
  return event.clientX>=r.left&&event.clientX<=r.right&&
    event.clientY>=r.top&&event.clientY<=r.bottom;
}
function findGroupAt(x,y,except=-1) {
  let best=-1,minimum=34/Math.max(1,state.zoom*.6);
  state.plan.groups.forEach((g,i)=>{
    if(i===except)return;
    for(const side of (g.side?[g.side]:[-1,1])) {
      const [u,v]=bodyPosition(g,side),d=Math.hypot(x-u,y-v);
      if(d<minimum){minimum=d;best=i;}
    }
  });
  return best;
}
function showValidSites(tools,exclude=-1) {
  const overlay=root.querySelector('#aid-development-sites');
  if(overlay)overlay.innerHTML=(Array.isArray(tools)?tools:[tools])
    .filter(Boolean).map(tool=>developmentDots(state.plan,tool,exclude,state.zoom)).join('');
}
function updatePlacementPreview(event,drag) {
  const svg=root.querySelector('#aid-body-map'),preview=root.querySelector('#aid-place-preview'),
    hint=root.querySelector('#aid-placement-status');
  if(!svg||!preview)return;
  const pos=positionFromEvent(event),tool=drag.kind==='marker'?
    state.plan.groups[drag.index]:drag.module?moduleTool(drag.module):PALETTE[drag.tool];
  const found=tool&&pos?nearestPlace(tool,...pos,drag.kind==='marker'?drag.index:-1):null;
  const onMap=!!pos&&inside(svg,event),inverse=1/state.zoom;
  preview.style.display=onMap?'':'none';
  if(!onMap||!tool)return;
  const [x,y]=pos;
  preview.setAttribute('transform',`translate(${x} ${y})`);
  preview.classList.toggle('invalid',!found?.site);
  let drawing=`<g transform="scale(${inverse})">
    <circle r="23" class="aid-drag-ghost"/>
    <path d="${iconPath(tool)}" class="aid-marker-icon"
      transform="translate(-9 -9) scale(.75)"/></g>`;
  if(found?.site) {
    const [nx,ny]=sitePosition(found.site,tool),dx=nx-x,dy=ny-y;
    drawing+=`<path class="aid-snap-tether" d="M0 0L${dx} ${dy}"/>
      <circle class="aid-preview-ring" cx="${dx}" cy="${dy}" r="${17*inverse}"/>
      <circle class="aid-preview-center" cx="${dx}" cy="${dy}" r="${6*inverse}"/>`;
  }
  if(drag.module) {
    const previous=state.moduleBrush;
    state.moduleBrush=drag.module;
    const planned=planModuleAt(...pos);
    state.moduleBrush=previous;
    if(planned.reserved) {
      drawing+=planned.module.links?.map(([a,b])=>{
        const p=bodyPosition(planned.created[a]),q=bodyPosition(planned.created[b]);
        return `<path class="aid-preview-link" d="M${p[0]-x} ${p[1]-y}
          L${q[0]-x} ${q[1]-y}"/>`;
      }).join('')||'';
      drawing+=planned.reserved.map(g=>{
        const [px,py]=bodyPosition(g),colour=organColor(g);
        return `<g transform="translate(${px-x} ${py-y}) scale(${inverse})"
          style="--tone:${colour}"><circle class="aid-preview-ring" r="17"/>
          <circle class="aid-preview-center" r="8"/></g>`;
      }).join('');
    } else preview.classList.add('invalid');
    if(hint)hint.textContent=planned.reserved?
      'Baugruppe: farbige Gewebe und Signalwege · hier ablegen':
      'Für diese Baugruppe ist hier nicht genug Platz.';
  } else if(hint)hint.textContent=found?.site?
    `Ziehe weiter oder lege in ${ZONES[found.site.zone]} ab · der Ring zeigt das Ziel`:
    'Hier ist kein passender Entwicklungsort. Die farbigen Stellen zeigen mögliche Plätze.';
  preview.innerHTML=drawing;
  root.querySelector('#aid-trash')?.classList.toggle('active',
    drag.kind==='marker'&&inside(root.querySelector('#aid-trash'),event));
}
function editPad(drag,event) {
  const r=drag.element.getBoundingClientRect();
  if(!r.width||!r.height)return;
  const x=Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),
    y=Math.max(0,Math.min(1,(r.bottom-event.clientY)/r.height));
  const g=state.plan.groups[drag.index];
  if(!g)return;
  if(drag.kind==='response') {g.threshold=1-2*x;g.tau=1-y;}
  if(drag.kind==='learning') {g.qwidth=x;g.mode=2*y-1;}
  if(drag.kind==='hormone') {
    const hormone=g.receptors[state.effect];
    hormone.half=.0003*Math.pow(1/.0003,x);
    hormone.sensitivity=2*y-1;hormone.active=1;
    const path=drag.element.querySelector('svg path:nth-of-type(3)');
    if(path)path.setAttribute('d',Array.from({length:51},(_,i)=>{
      const c=i/50,response=Math.max(-1,Math.min(1,
        hormone.baseline+hormone.sensitivity*c/(c+hormone.half)));
      return (i?'L':'M')+(12+c*255).toFixed(1)+' '+(73-52*response).toFixed(1);
    }).join(' '));
  } else {
    const handle=drag.element.querySelector('.aid-pad-handle');
    if(handle){handle.style.left=Math.round(x*100)+'%';handle.style.bottom=Math.round(y*100)+'%';}
  }
}
function bindBodyDragging() {
  let dragging=null;
  root.addEventListener('pointerdown',event=>{
    if(state.station!=='studio'||state.tab==='cppn'||state.tab==='development')return;
    const pad=event.target.closest('[data-response-pad],[data-learning-pad],[data-hormone-curve]');
    const marker=event.target.closest('[data-drag-body]');
    const module=event.target.closest('[data-module]');
    const tool=event.target.closest('[data-tool]');
    const svg=event.target.closest('#aid-body-map');
    if(pad) {
      const kind=pad.hasAttribute('data-response-pad')?'response':
        pad.hasAttribute('data-learning-pad')?'learning':'hormone';
      if(!group())return;
      remember();dragging={kind,pointerId:event.pointerId,element:pad,index:state.selected};
      editPad(dragging,event);
    } else if(marker) {
      dragging={kind:state.layer==='wires'?'wire':'marker',pointerId:event.pointerId,
        index:Number(marker.dataset.dragBody),element:marker,
        start:[event.clientX,event.clientY],last:[event.clientX,event.clientY]};
      if(dragging.kind==='marker')showValidSites(state.plan.groups[dragging.index],dragging.index);
    } else if(module||tool) {
      dragging={kind:'palette',pointerId:event.pointerId,element:module||tool,
        module:module?.dataset.module||null,tool:tool?Number(tool.dataset.tool):null,
        start:[event.clientX,event.clientY],last:[event.clientX,event.clientY]};
    } else if(svg&&state.zoom>1) {
      dragging={kind:'pan',pointerId:event.pointerId,element:svg,
        start:[event.clientX,event.clientY],last:[event.clientX,event.clientY]};
    }
    if(dragging) {
      dragging.element.setPointerCapture?.(event.pointerId);
      event.preventDefault?.();
    }
  });
  root.addEventListener('pointermove',event=>{
    if(!dragging||event.pointerId!==dragging.pointerId)return;
    if(dragging.kind==='response'||dragging.kind==='learning'||dragging.kind==='hormone')
      return editPad(dragging,event);
    const moved=Math.hypot(event.clientX-dragging.start[0],event.clientY-dragging.start[1])>7;
    if(!moved&&dragging.kind!=='pan')return;
    if(dragging.kind==='palette'&&!dragging.started) {
      dragging.started=true;
      showValidSites(dragging.module?
        moduleTools([...STARTER_MODULES,...state.modules].find(m=>m.key===dragging.module)):
        PALETTE[dragging.tool]);
    }
    if(dragging.kind==='palette'||dragging.kind==='marker')updatePlacementPreview(event,dragging);
    if(dragging.kind==='wire') {
      const src=state.plan.groups[dragging.index],pos=positionFromEvent(event),
        path=root.querySelector('#aid-wire-preview');
      if(src&&pos&&path) {
        const [x,y]=bodyPosition(src);
        path.setAttribute('d',`M${x} ${y} L${pos[0]} ${pos[1]}`);
        path.style.display='';
      }
    }
    if(dragging.kind==='pan') {
      const rect=dragging.element.getBoundingClientRect();
      const dx=(event.clientX-dragging.last[0])*960/state.zoom/rect.width;
      const dy=(event.clientY-dragging.last[1])*400/state.zoom/rect.height;
      const halfWidth=480/state.zoom,halfHeight=200/state.zoom;
      state.centre=[Math.max(halfWidth,Math.min(960-halfWidth,state.centre[0]-dx)),
        Math.max(halfHeight,Math.min(400-halfHeight,state.centre[1]-dy))];
      dragging.element.setAttribute('viewBox',
        [state.centre[0]-halfWidth,state.centre[1]-halfHeight,halfWidth*2,halfHeight*2].join(' '));
    }
    dragging.last=[event.clientX,event.clientY];
  });
  const finish=event=>{
    if(!dragging||event.pointerId!==dragging.pointerId)return;
    const drag=dragging;dragging=null;
    if(['response','learning','hormone'].includes(drag.kind)) {
      changed();render();swallowNextClick(event.target);return;
    }
    const moved=Math.hypot(event.clientX-drag.start[0],event.clientY-drag.start[1])>8,
      pos=positionFromEvent(event),svg=root.querySelector('#aid-body-map');
    if(drag.kind==='marker') {
      if(moved&&inside(root.querySelector('#aid-trash'),event))removeGroup(drag.index);
      else if(moved&&pos&&inside(svg,event))moveSelectionTo(drag.index,...pos);
      else if(!moved)selectGroup(drag.index,!!event.shiftKey||state.selectionMode);
      else render();
      swallowNextClick(event.target);
    } else if(drag.kind==='palette') {
      if(moved&&pos&&inside(svg,event)) {
        state.moduleBrush=drag.module;
        state.brush=drag.tool;
        state.layer='organs';
        addAt(...pos);
      } else if(!moved) {
        if(drag.module) {
          state.moduleBrush=state.moduleBrush===drag.module?null:drag.module;state.brush=null;
        } else {
          state.brush=state.brush===drag.tool?null:drag.tool;state.moduleBrush=null;
        }
        state.layer='organs';render();
      } else render();
      swallowNextClick(event.target);
    } else if(drag.kind==='wire') {
      const target=pos?findGroupAt(...pos,drag.index):-1;
      if(moved&&target>=0)connectGroups(drag.index,target);
      else if(!moved&&state.wireSource!=null&&state.wireSource!==drag.index)
        connectGroups(state.wireSource,drag.index);
      else if(!moved&&state.wireSource===drag.index) {
        state.wireSource=null;state.selectedConnection=null;
        state.selected=drag.index;render();
      } else {
        state.wireSource=drag.index;state.selectedConnection=null;
        state.selected=drag.index;render();
      }
      swallowNextClick(event.target);
    } else if(drag.kind==='pan'&&moved){render();swallowNextClick(event.target);}
  };
  root.addEventListener('pointerup',finish);
  root.addEventListener('pointercancel',event=>{dragging=null;render();});
  root.addEventListener('wheel',event=>{
    if(state.station!=='studio'||state.tab==='cppn'||!event.target.closest('#aid-body-map'))
      return;
    event.preventDefault();
    const point=positionFromEvent(event),old=state.zoom;
    state.zoom=Math.max(1,Math.min(5,state.zoom*(event.deltaY<0?1.16:1/1.16)));
    if(point&&old!==state.zoom) {
      const k=old/state.zoom;
      state.centre=[Math.max(480/state.zoom,Math.min(960-480/state.zoom,
        point[0]+(state.centre[0]-point[0])*k)),
        Math.max(200/state.zoom,Math.min(400-200/state.zoom,
          point[1]+(state.centre[1]-point[1])*k))];
    }
    render();
  },{passive:false});
}

export function initializeStudio() {
  root = document.getElementById('station-root');
  if (!root) return;
  restoreModules();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  bindBodyDragging();
  document.getElementById('open-station-hub')?.addEventListener('click', () => navigate('hub'));
  document.addEventListener('keydown', event => {
    if(event.key!=='Escape'||state.station!=='studio'||event.target.closest('input,select'))return;
    if(state.brush!==null) {state.brush=null;return render();}
    if(state.moduleBrush!==null){state.moduleBrush=null;return render();}
    if(state.wireSource!==null){state.wireSource=null;return render();}
    if(state.graphLinkMode) {state.graphLinkMode=false;state.graphLinkFrom=null;return render();}
    navigate('hub');
  });
  render();
  setInterval(liveStats, 1000);
}
