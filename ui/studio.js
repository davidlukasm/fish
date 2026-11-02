import {sceneState} from './state.js';
import {beginEggPlacement} from './world.js';
import {AVAILABLE_MOTORS, AVAILABLE_SENSES, PALETTE, ROLES, SITES, ZONES,
  blankPlan, groupName, handfishPlan, hasSite, hormonePoint, newGroup, scentPoint} from './studio_model.js';
import {anatomy, anatomyControls, bodyHalfWidth, contacts, contactsControls, development,
  esc, hormones, hormoneControls, zoneStart, zoneWidth} from './studio_views.js';
import {GRAPH_PARAMETER, GRAPH_SCOPES, cppnControls, cppnGraph} from './studio_graph.js';

const STORAGE_KEY = 'fish-v019-atelier-draft';
const tabs = [
  ['anatomy', '01', 'Fisch'], ['contacts', '02', 'Signalwege'],
  ['hormones', '03', 'Hormone & Lernen'], ['development', '04', 'Prüfen']
];
const state = {
  station: 'hub', tab: 'anatomy', plan: blankPlan(), selected: -1, brush: null,
  effect: 5, graphScope: 'cells', graphOutput: 0,
  graphSelection: {kind: 'node', id: 10}, graphLinkMode: false, graphLinkFrom: null,
  connect: {from: 9, to: 10, weight: 1, port: 0},
  report: null, genome: '', genomeName: '', mode: 'plan', stale: true, busy: false,
  message: '', messageKind: '', undo: []
};
let root;

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
  return `<div class="aid-side-heading"><small>DEIN ENTWURF</small><strong>${state.plan.groups.length} Bauteile</strong></div>` +
    `<div class="aid-group-list">${state.plan.groups.map((g, i) =>
      `<button data-select-group="${i}" class="aid-group-row ${i === state.selected ? 'selected' : ''}">` +
      `<span class="aid-group-number">${['◉','✳','↝'][g.role]}</span>` +
      `<span><strong>${esc(g.name)}</strong><small>${esc(ROLES[g.role])}</small></span>` +
      `</button>`).join('')}</div>` +
    `<div class="aid-sidebar-tools aid-sidebar-stack"><button data-action="new-fish">＋ Neuer Fisch</button>` +
    `<button data-action="restore-draft">Letzten Entwurf öffnen</button>` +
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
  if (state.tab === 'anatomy') return anatomy(state.plan, state.selected, state.brush,
    state.stale ? null : state.report);
  if (state.tab === 'contacts') return contacts(state.plan, state.selected,
    state.stale ? null : state.report);
  if (state.tab === 'hormones') return hormones(state.plan, state.selected, state.effect,
    state.stale ? null : state.report);
  return development(state.plan, state.report, state.stale);
}

function studioControls() {
  if (state.tab === 'cppn')
    return cppnControls(state.report,state.graphSelection,state.connect,state.graphLinkFrom);
  if (state.tab === 'anatomy') return anatomyControls(group());
  if (state.tab === 'contacts') return contactsControls(state.plan,state.selected,
    state.stale?null:state.report);
  if (state.tab === 'hormones') return hormoneControls(group(), state.effect);
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
  if (state.tab==='hormones' && group() && !(
    state.effect===5 || state.effect===6 || group().role===1 ||
    (group().role===2 && state.effect===0))) state.effect=5;
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

const surface=p=>Math.max(p.w,Math.abs(2*p.v-1))>.5;
function permittedSite(g,p) {
  if(g.role===1) return true;
  if(g.role===0) {
    if(!AVAILABLE_SENSES[p.zone].includes(g.function)) return false;
    if([1,2,3].includes(g.function)) return surface(p);
    if([5,9,10].includes(g.function)) return !surface(p);
    return true;
  }
  if(!AVAILABLE_MOTORS[p.zone].includes(g.function)) return false;
  return [6,7].includes(g.function) ? surface(p) : true;
}

function positionFromEvent(event) {
  const svg=root.querySelector('#aid-body-map');
  if(!svg) return null;
  const r=svg.getBoundingClientRect();
  return r.width&&r.height ? [960*(event.clientX-r.left)/r.width,
    400*(event.clientY-r.top)/r.height] : null;
}

function nearestPlace(g,x,y,exclude=-1) {
  const zone=zoneStart.reduce((best,start,i)=>{
    const distance=x<start?start-x:x>start+zoneWidth[i]?x-start-zoneWidth[i]:0;
    const old=x<zoneStart[best]?zoneStart[best]-x:
      x>zoneStart[best]+zoneWidth[best]?x-zoneStart[best]-zoneWidth[best]:0;
    return distance<old?i:best;
  },0);
  if(g.role!==1 && !(g.role===0?AVAILABLE_SENSES[zone]:AVAILABLE_MOTORS[zone]).includes(g.function))
    return {error:`${g.role===0?'Dieser Sinn':'Dieses Organ'} entsteht in v019 im Bereich „${ZONES[g.zone]}“. `+
      `Setze es dort auf den Körper.`};
  const side=y<200?-1:1,u=Math.max(0,Math.min(1,1-(x-zoneStart[zone])/zoneWidth[zone]));
  const width=bodyHalfWidth(x);
  const clickedW=Math.max(0,Math.min(1,(Math.abs(y-200)/width-.12)/.65));
  const targetW=g.role===0&&[5,9,10].includes(g.function)?0:clickedW;
  const candidates=SITES.filter(p=>p.zone===zone&&p.side===side&&permittedSite(g,p) &&
    !state.plan.groups.some((other,i)=>i!==exclude&&hasSite(other,p)));
  if(!candidates.length) return {error:'In diesem Körperabschnitt sind alle passenden Plätze belegt.'};
  candidates.sort((a,b)=>{
    const distance=p=>Math.abs(p.u-u)*4+Math.abs(p.w-targetW)+Math.abs(p.v-.5)*.1;
    return distance(a)-distance(b);
  });
  return {site:candidates[0]};
}

function pairedSite(target, excludeBundle = null) {
  // Egg and sperm tissue occupy two different depth layers at one location.
  // Both layers must be free before the organ is placed or moved.
  return SITES.filter(p=>p.zone===3&&p.side===target.side&&p.v===1/3&&p.w===0)
    .filter(p=>[0,1].every(w=>!state.plan.groups.some(g=>
      g.bundle!==excludeBundle&&hasSite(g,{...p,w}))))
    .sort((a,b)=>Math.abs(a.u-target.u)-Math.abs(b.u-target.u))[0];
}

function setLocation(g,p) {
  Object.assign(g,{zone:p.zone,side:p.side,u0:p.u,u1:p.u,
    v0:p.v,v1:p.v,w0:p.w,w1:p.w});
  if(g.autoName) g.name=groupName(g,state.plan.groups.indexOf(g));
}

function addAt(x,y) {
  const tool=PALETTE[state.brush];
  if(!tool) return message('Wähle zuerst ein Bauteil unter dem Fisch.', 'warn');
  const reproductive=tool.role===2&&[3,4].includes(tool.function);
  if(state.plan.groups.length+(reproductive?2:1)>80)
    return message('Der Bauplan ist voll (höchstens 80 Gruppen).','warn');
  const base=newGroup('',{role:tool.role,function:tool.function,zone:tool.zone,
    autoName:true,copies:tool.role===2?6:tool.role===1?4:3,
    threshold:tool.role===0?-.6:tool.role===2?-.4:0,
    sender1:tool.role===0?.5:tool.role===1?0:-1,
    sender2:tool.role===0?.5:0,
    receiver1:tool.role===1?.5:tool.role===2?0:-1,
    receiver2:tool.role===1?.5:tool.role===2?0:-1,
    sigma:.35,crossing:-.5,range:.9});
  const found=nearestPlace(base,x,y);
  if(found.error) return message(found.error,'warn');
  const location=reproductive?pairedSite(found.site):found.site;
  if(!location) return message('Hier ist kein Platz für die beiden Gewebe dieses Organs.','warn');
  remember();
  setLocation(base,location);
  base.name=groupName(base,state.plan.groups.length);
  state.plan.groups.push(base);
  state.selected=state.plan.groups.length-1;
  // Reproduction requires storage tissue and release tissue; a single palette click
  // creates both compatible regions, as required by has_required_organs().
  if(reproductive) {
    const bundle='gonad-'+Date.now()+'-'+state.selected;
    base.bundle=bundle;
    base.w0=base.w1=0;
    base.v0=base.v1=1/3;
    base.name=tool.function===3?'Eier bilden':'Spermien bilden';
    const release=structuredClone(base);
    release.w0=release.w1=1;
    release.name=tool.function===3?'Eier ablegen':'Spermien abgeben';
    state.plan.groups.push(release);
  }
  changed();render();
}

function moveTo(index,x,y) {
  const g=state.plan.groups[index];
  if(!g) return;
  const found=nearestPlace(g,x,y,index);
  if(found.error) return message(found.error,'warn');
  const location=g.bundle?pairedSite(found.site,g.bundle):found.site;
  if(!location) return message('An dieser Stelle sind die beiden benötigten Gewebelagen belegt.','warn');
  remember();
  const siblings=g.bundle?state.plan.groups.filter(other=>other.bundle===g.bundle):[g];
  for(const member of siblings) {
    const oldW=member.w0;
    setLocation(member,location);
    if(g.bundle) {
      member.w0=member.w1=oldW;
      member.v0=member.v1=1/3;
      if(member.autoName) member.name=member.function===3 ?
        (oldW===0?'Eier bilden':'Eier ablegen') :
        (oldW===0?'Spermien bilden':'Spermien abgeben');
    }
  }
  state.selected=index;
  changed();render();
}

function selectGroup(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.plan.groups.length) return;
  state.selected = index;
  state.brush=null;
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

function simpleChange(key,value) {
  const g=group();
  if(!g) return;
  const v=Math.max(0,Math.min(1,Number(value)));
  if(!Number.isFinite(v)) return;
  const props={strength:['threshold',1-2*v],speed:['tau',1-v],
    quantity:['copies',1+Math.round(15*v)],field:['field',v],
    learning:['qwidth',v],reach:['range',v],
    search:['sigma',.03*Math.pow(2/.03,v)]};
  if(key==='effectPower') {
    const sign=g.receptors[state.effect].sensitivity<0?-1:1;
    return mutate('sensitivity',v*sign,true);
  }
  const entry=props[key];
  if(entry) mutate(entry[0],entry[1]);
}

async function actions(name) {
  if (name === 'home') return navigate('hub');
  if (name === 'aquarium') return navigate('aquarium');
  if (name === 'atelier') return navigate('studio');
  if (state.busy) return;
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
    state.tab='anatomy';state.undo=[];
    return message('Neuer Fisch. Wähle unten ein Bauteil.');
  }
  if (name === 'template') {
    if(state.plan.groups.length && !confirm('Den eigenen Entwurf durch den Beispielfisch ersetzen?')) return;
    remember(); state.plan = handfishPlan(); state.selected = 0;state.brush=null;
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
    if(!group()) return;
    remember();
    const bundle=group().bundle;
    if(bundle) state.plan.groups=state.plan.groups.filter(g=>g.bundle!==bundle);
    else state.plan.groups.splice(state.selected, 1);
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

function onClick(event) {
  const action = event.target.closest('[data-action]');
  if (action) { void actions(action.dataset.action); return; }
  const tool=event.target.closest('[data-tool]');
  if(tool) {
    const index=Number(tool.dataset.tool);
    state.brush=state.brush===index?null:index;
    state.tab='anatomy';render();return;
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
  const effect = event.target.closest('[data-effect]');
  if (effect) { state.effect = Number(effect.dataset.effect); render(); return; }
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
    const src=state.plan.groups[from],dst=state.plan.groups[to];
    if(!src||!dst) return;
    remember();
    dst.receiver1=src.sender1;dst.receiver2=src.sender2;
    dst.sigma=Math.max(dst.sigma,.3);
    changed();return message(src.name+' → '+dst.name+' als Kontaktwunsch eingerichtet.');
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
  if (selected) { selectGroup(Number(selected.dataset.selectGroup)); return; }
  const place=event.target.closest('[data-place]');
  if(place) {
    const pos=positionFromEvent(event);
    if(pos)addAt(...pos);
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
  if(input.dataset.simple)return simpleChange(input.dataset.simple,input.value);
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

function bindBodyDragging() {
  let dragging = null;
  root.addEventListener('pointerdown', event => {
    const marker=event.target.closest('[data-drag-body]');
    if (!marker || state.station !== 'studio' || state.tab!=='anatomy') return;
    dragging={pointerId:event.pointerId,index:Number(marker.dataset.dragBody),
      start:[event.clientX,event.clientY],last:[event.clientX,event.clientY],marker};
    marker.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  root.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    dragging.last=[event.clientX,event.clientY];
    const dx=event.clientX-dragging.start[0],dy=event.clientY-dragging.start[1];
    if(Math.hypot(dx,dy)>6)dragging.marker.style.opacity='.6';
  });
  const finish = event => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const was=dragging;
    dragging=null;
    if(Math.hypot(was.last[0]-was.start[0],was.last[1]-was.start[1])>9) {
      const pos=positionFromEvent(event);
      if(pos)moveTo(was.index,...pos);
    } else selectGroup(was.index);
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
}

export function initializeStudio() {
  root = document.getElementById('station-root');
  if (!root) return;
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  bindBodyDragging();
  document.getElementById('open-station-hub')?.addEventListener('click', () => navigate('hub'));
  document.addEventListener('keydown', event => {
    if(event.key!=='Escape'||state.station!=='studio'||event.target.closest('input,select'))return;
    if(state.brush!==null) {state.brush=null;return render();}
    if(state.graphLinkMode) {state.graphLinkMode=false;state.graphLinkFrom=null;return render();}
    navigate('hub');
  });
  render();
  setInterval(liveStats, 1000);
}
