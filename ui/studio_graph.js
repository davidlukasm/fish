import {INPUTS, NODE_TYPES, OUTPUTS} from './studio_model.js';
import {esc, namedOptions, selectOptions} from './studio_views.js';

export const GRAPH_SCOPES = [
  {key:'cells',name:'Zellen & Aufgaben',outputs:[0,1,2,3,4,5],
    info:'Ob Zellen entstehen, welche Art sie haben und welche Aufgaben sie erfüllen.'},
  {key:'properties',name:'Eigenschaften',outputs:[6,7,8,9,10,11,12],
    info:'Größe, Reaktionszeiten, Sinnesvorlieben und Lernfähigkeit.'},
  {key:'contacts',name:'Verbindungen',outputs:[13,14,15,16,17,18,19],
    info:'Wo Zellgruppen senden und empfangen; daraus wachsen Synapsen.'},
  {key:'hormones',name:'Hormonantwort',outputs:[6,7,9,10,11,12],
    info:'Dieselben Ausgänge werden mit dem Rezeptor-Eingang erneut abgefragt.'},
  {key:'all',name:'Alle Ausgänge',outputs:OUTPUTS.map((_,i)=>i),
    info:'Das gesamte gemeinsame CPPN mit allen zwanzig Ausgängen.'}
];
export const GRAPH_PARAMETER = [
  ['Breite der Glocke','Große Werte erzeugen eine breite Gaußkurve.'],
  ['Frequenz','Bestimmt, wie rasch die Sinuskurve schwingt.'],
  ['Frequenz','Bestimmt, wie rasch die Kosinuskurve schwingt.'],
  ['Verstärkung','Multipliziert die Summe aller Eingänge. Bei 1 bleibt sie unverändert.'],
  ['Schaltversatz','Verschiebt die Grenze zwischen negativem und positivem Ausgang.'],
  ['Verschiebung','Verschiebt die weiche Sigmoidkurve.'],
  ['Grenzwert','Oberhalb des Grenzwerts wird +1 ausgegeben, sonst −1.'],
  ['Verschiebung','Verschiebt die kubische Funktion.'],
  ['Verschiebung','Der Betrag wird nach einer Verschiebung berechnet.'],
  ['Stufengröße','Multipliziert die Eingabe vor dem Abschneiden auf ganze Stufen.'],
  [null,'Ein Tor multipliziert zwei getrennte Eingangsströme: Wert × Steuerung.']
];

export function nodeLabel(id) {
  if (id < 10) return INPUTS[id];
  if (id < 30) return OUTPUTS[id - 10];
  return 'Knoten ' + id;
}

function graphLayout(cppn, scope, selectedId = null) {
  const nodes = new Map(cppn.nodes.map(n => [n[0], n]));
  const targets = (GRAPH_SCOPES.find(s=>s.key===scope)||GRAPH_SCOPES[0]).outputs.map(i=>i+10);
  const incoming = new Map();
  for (const link of cppn.links) {
    if (!link[4]) continue;
    if (!incoming.has(link[2])) incoming.set(link[2], []);
    incoming.get(link[2]).push(link[1]);
  }
  const parents = new Set([...targets,...Array.from({length:10},(_,i)=>i)]);
  if(scope==='all') for(const node of cppn.nodes)
    if(node[3]===1) parents.add(node[0]);
  // A newly inserted, unconnected building block must remain visible so the
  // user can attach it to an input and an output.
  if (selectedId != null) parents.add(selectedId);
  const visited = new Set();
  function ancestors(id) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const from of incoming.get(id) || []) {
      parents.add(from);
      ancestors(from);
    }
  }
  for(const id of targets) ancestors(id);
  const visible = [...parents].filter(id => nodes.has(id));
  const depthCache = new Map();
  function depth(id, visiting = new Set()) {
    if (depthCache.has(id)) return depthCache.get(id);
    if (id < 10 || visiting.has(id)) return 0;
    visiting.add(id);
    const value = 1 + Math.max(-1, ...(incoming.get(id) || []).map(i => depth(i, visiting)));
    visiting.delete(id);
    depthCache.set(id, value);
    return value;
  }
  const last = Math.max(2,...targets.map(id=>depth(id)+1));
  const columns = new Map();
  for (const id of visible) {
    const layer = targets.includes(id) ? last : id < 10 ? 0 : Math.min(last-1,depth(id)+1);
    if (!columns.has(layer)) columns.set(layer, []);
    columns.get(layer).push(id);
  }
  const height = Math.max(460, Math.max(...[...columns.values()].map(a=>a.length)) * 51 + 120);
  const step = Math.max(185, Math.ceil(860 / last));
  const width = 160 + last*step;
  const points = new Map();
  for (const [layer, ids] of columns) {
    ids.sort((a,b) => a - b);
    for (let i = 0; i < ids.length; ++i)
      points.set(ids[i], [85 + step*layer,(height-100)*(i+1)/(ids.length+1)+65]);
  }
  return {nodes, visible, points, height, width, targets};
}

export function cppnGraph(report, output, selection, scope = 'cells', connectFrom = null) {
  const cppn = report.cppn, layout = graphLayout(cppn, scope, selection?.id),
    {nodes, visible, points, height, width, targets} = layout, active = new Set(visible);
  const selectedId = selection?.id, selectedKind = selection?.kind;
  const links = cppn.links.filter(e => active.has(e[1]) && active.has(e[2]));
  const lines = links.map(([id, from, to, weight, enabled, port]) => {
    const a = points.get(from), b = points.get(to);
    if (!a || !b) return '';
    const bend = Math.max(35,(b[0]-a[0])*.45),path=`M${a[0]+67} ${a[1]} C${a[0]+67+bend} ${a[1]} ${b[0]-67-bend} ${b[1]} ${b[0]-67} ${b[1]}`;
    return `<g class="aid-graph-link ${!enabled ? 'off' : weight < 0 ? 'negative' : 'positive'} ` +
      `${selectedKind === 'link' && selectedId === id ? 'selected' : ''}" data-link="${id}">` +
      `<path d="${path}" class="aid-graph-line" fill="none" ` +
      `stroke-width="${Math.max(1.1, Math.min(4, Math.abs(weight) * 1.4)).toFixed(2)}"/>` +
      `<path d="${path}" stroke-width="13" stroke="transparent" fill="none"/>` +
      `<title>Verbindung #${id}: ${esc(nodeLabel(from))} → ${esc(nodeLabel(to))}, ` +
      `Gewicht ${Number(weight).toFixed(3)}${!enabled ? ', ausgeschaltet' : ''}</title></g>`;
  }).join('');
  const markers = visible.map(id=>{
    const n=nodes.get(id),[x,y]=points.get(id),role=n[3],name=id<30?nodeLabel(id):NODE_TYPES[n[1]];
    const focused=id===10+output,selected=selectedKind==='node'&&selectedId===id;
    return `<g data-node="${id}" class="aid-graph-node ${role===0?'input':role===2?'output':'hidden'} ` +
      `${selected?'selected':''} ${focused?'focused':''} ${connectFrom===id?'link-from':''}" role="button" tabindex="0">` +
      `<rect x="${x-66}" y="${y-20}" width="132" height="40" rx="10"/>` +
      `<text x="${x}" y="${y+4}" text-anchor="middle">${esc(name.length>21?name.slice(0,20)+'…':name)}</text>` +
      `<title>${esc(nodeLabel(id))} · ${esc(NODE_TYPES[n[1]])}</title></g>`;
  }).join('');
  const segment=GRAPH_SCOPES.find(s=>s.key===scope)||GRAPH_SCOPES[0];
  return `<div class="aid-viewhead"><div><small>GENOM / RECHENWEGE</small><h2>CPPN entwerfen</h2>` +
    `<p>Ein gemeinsames Netz berechnet die Merkmale des Fisches. Die Bereiche unten zeigen ` +
    `mehrere Ausgänge gleichzeitig; gemeinsame Bausteine bleiben verbunden.</p></div></div>` +
    `<div class="aid-cppn-scope">${GRAPH_SCOPES.map(s=>`<button data-scope="${s.key}" type="button" ` +
      `class="${s.key===scope?'active':''}">${esc(s.name)}</button>`).join('')}</div>` +
    `<p class="aid-scope-info">${esc(segment.info)} ${scope==='hormones'?'Der Eingang „Rezeptor-Wirkung“ schaltet zwischen sieben Antworten.':''}</p>` +
    `<div class="aid-output-chips">${segment.outputs.map(i=>`<button data-output="${i}" ` +
      `class="${i===output?'active':''}" type="button">${esc(OUTPUTS[i])}</button>`).join('')}</div>` +
    `<div class="aid-graph-meta"><span>${cppn.nodes.length} Rechenbausteine</span>` +
      `<span>${cppn.links.filter(e=>e[4]).length} aktive Verbindungen</span>` +
      `<span>${visible.length} im gezeigten Bereich</span></div>` +
    `<div class="aid-graph-scroll"><svg id="aid-graph" viewBox="0 0 ${width} ${height}" ` +
      `style="width:${width}px" role="group" aria-label="Gemeinsames CPPN mit mehreren Ausgängen">` +
      `<g class="aid-graph-axis"><text x="84" y="31" text-anchor="middle">EINGÄNGE</text>` +
      `<text x="${width-115}" y="31" text-anchor="middle">AUSGÄNGE</text></g>` +
      lines + markers + '</svg></div>' +
    `<div class="aid-footnotes"><span>Grün = verstärkend</span><span>Orange = dämpfend</span>` +
      `<span>Klicke einen Baustein oder eine Verbindung an, um sie zu bearbeiten.</span></div>` +
    `<p class="aid-note">Die ersten vier Eingänge benennen die Körperabschnitte. ` +
    `Die drei Positionswerte beschreiben einen Ort im Fisch. Die Rezeptor-Abfrage verwendet ` +
    `dieselben Rechenwege für Hormone.</p>`;
}

export function cppnControls(report, selection, connect, connectFrom=null) {
  if(!report?.cppn) return `<div class="aid-inspector-empty"><span>⌘</span>` +
    `<h3>Ein Rechenprogramm bauen</h3><p>Beginne mit einem leeren CPPN oder sieh dir an, ` +
    `wie zwei Eingänge addiert werden.</p>` +
    `<button data-action="graph-new" class="aid-primary">Leeres CPPN</button>` +
    `<button data-action="graph-sum">Beispiel: zwei Eingänge addieren</button></div>`;
  const {nodes,links}=report.cppn;
  const node=selection?.kind==='node'&&nodes.find(n=>n[0]===selection.id);
  const link=selection?.kind==='link'&&links.find(e=>e[0]===selection.id);
  let edit='';
  if(node) {
    const immutable=node[3]===0;
    const [label,help]=GRAPH_PARAMETER[node[1]];
    edit=`<div class="aid-inspector-eyebrow">${node[3]===0?'EINGANG':node[3]===2?'BERECHNETES MERKMAL':'RECHENBAUSTEIN'}</div>` +
      `<h2 class="aid-inspector-name">${esc(nodeLabel(node[0]))}</h2>` +
      `<p class="aid-inspector-help">${node[3]===0?`Liefert der Berechnung einen Ortswert.`:
        node[3]===2?'Dieser Ausgang legt ein Merkmal des entstehenden Fisches fest.':
          `Führt die Funktion „${NODE_TYPES[node[1]]}“ aus.`}</p>` +
      (immutable ? `<div class="aid-inspector-card"><p class="aid-microcopy">` +
        `${node[3]===0?'Der Eingang gehört zum festen v019-Genomschema. Verbinde ihn mit einem Rechenbaustein oder Ausgang.':
          'Diese Identitätsausgabe bleibt im v019-Modell linear.'}</p></div>` :
      `<div class="aid-inspector-card"><div class="aid-subheading">Wie soll er rechnen?</div>` +
        `<label class="aid-field"><span>Funktion</span><select id="aid-graph-type">` +
        `${selectOptions(namedOptions(NODE_TYPES),node[1])}</select></label>` +
        `<label class="aid-field"><span id="aid-param-label">${esc(label||'Für Tor nicht benötigt')}</span>` +
        `<input id="aid-graph-parameter" type="number" min="-16" max="16" step=".01" value="${node[2]}"></label>` +
        `<p class="aid-microcopy" id="aid-param-help">${esc(help)}</p>` +
        `<button data-action="graph-save-node" class="aid-primary">Änderung berechnen</button></div>`);
  } else if(link) {
    edit=`<div class="aid-inspector-eyebrow">SIGNAL ZWISCHEN BAUSTEINEN</div>` +
      `<h2 class="aid-inspector-name">Verbindung</h2>` +
      `<p class="aid-inspector-help">${esc(nodeLabel(link[1]))} → ${esc(nodeLabel(link[2]))}</p>` +
      `<div class="aid-inspector-card"><div class="aid-subheading">Wie stark wirkt sie?</div>` +
      `<label class="aid-field"><span>Stärke (negativ = dämpfend)</span>` +
      `<input id="aid-graph-weight" type="number" min="-16" max="16" step=".05" value="${link[3]}"></label>` +
      `<label class="aid-toggle"><input id="aid-graph-enabled" type="checkbox" ${link[4]?'checked':''}> Verbindung verwenden</label>` +
      `<button data-action="graph-save-link" class="aid-primary">Änderung berechnen</button>` +
      `<button data-action="graph-split">Rechenbaustein dazwischensetzen</button></div>`;
  } else edit='<p>Wähle einen Baustein oder eine Verbindung im Graphen aus.</p>';
  return edit +
    `<div class="aid-inspector-card"><div class="aid-subheading">Neue Verbindung</div>` +
    `<p class="aid-microcopy">${connectFrom===null?'Klicke auf „Verbindung zeichnen“, dann erst auf die Quelle und danach auf das Ziel im Graphen.':
      `Quelle gewählt: ${esc(nodeLabel(connectFrom))}. Jetzt das Ziel anklicken.`}</p>` +
    `<button data-action="graph-link-start" class="${connectFrom===null?'aid-primary':'active'}">` +
      `${connectFrom===null?'↗ Verbindung zeichnen':'Verbinden abbrechen'}</button></div>` +
    `<div class="aid-inspector-card"><div class="aid-subheading">Neuer Rechenbaustein</div>` +
    `<label class="aid-field"><span>Funktion</span><select id="aid-new-type">` +
    `${selectOptions(namedOptions(NODE_TYPES),3)}</select></label>` +
    `<button data-action="graph-add-node">＋ Baustein hinzufügen</button></div>` +
    `<details class="aid-advanced"><summary>Verbindungen gezielt bearbeiten</summary>` +
    `<p>Quelle und Ziel wählen. Bei einem Tor kann die Verbindung entweder den Wert ` +
    `oder die Steuerung speisen.</p>` +
    `<label class="aid-field"><span>Quelle</span><select id="aid-connect-from">` +
    `${selectOptions(nodes.filter(n=>n[3]!==2).map(n=>[n[0],nodeLabel(n[0])]),connect.from)}</select></label>` +
    `<label class="aid-field"><span>Ziel</span><select id="aid-connect-to">` +
    `${selectOptions(nodes.filter(n=>n[3]!==0).map(n=>[n[0],nodeLabel(n[0])]),connect.to)}</select></label>` +
    `<label class="aid-field"><span>Stärke</span><input id="aid-graph-new-weight" type="number" ` +
    `step=".05" min="-16" max="16" value="${connect.weight}"></label>` +
    `<label class="aid-field"><span>Bei Tor: Eingang</span><select id="aid-connect-port">` +
    `${selectOptions([[0,'Wert'],[1,'Steuerung']],connect.port)}</select></label>` +
    `<button data-action="graph-connect">Verbindung hinzufügen</button>` +
    `<div class="aid-subheading">Verbindung nach Kennung finden</div>` +
    `<div class="aid-search-link"><input id="aid-find-link" type="number" min="0" ` +
    `placeholder="Kennung"><button data-action="graph-find-link">Auswählen</button></div></details>`;
}
