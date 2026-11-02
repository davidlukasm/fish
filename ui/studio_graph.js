import {INPUTS, NODE_TYPES, OUTPUTS} from './studio_model.js';
import {esc, namedOptions, selectOptions} from './studio_views.js';

export function nodeLabel(id) {
  if (id < 10) return INPUTS[id];
  if (id < 30) return OUTPUTS[id - 10];
  return 'Knoten ' + id;
}

function graphLayout(cppn, output) {
  const nodes = new Map(cppn.nodes.map(n => [n[0], n])), target = output + 10;
  const incoming = new Map();
  for (const link of cppn.links) {
    if (!link[4]) continue;
    if (!incoming.has(link[2])) incoming.set(link[2], []);
    incoming.get(link[2]).push(link[1]);
  }
  const parents = new Set([target]);
  function ancestors(id) {
    for (const from of incoming.get(id) || [])
      if (!parents.has(from)) { parents.add(from); ancestors(from); }
  }
  ancestors(target);
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
  const last = Math.max(1, depth(target));
  const columns = new Map();
  for (const id of visible) {
    const layer = id === target ? last : id < 10 ? 0 : Math.min(last - 1, depth(id));
    if (!columns.has(layer)) columns.set(layer, []);
    columns.get(layer).push(id);
  }
  const height = Math.max(430, Math.min(1950, Math.max(...[...columns.values()].map(a => a.length)) * 41 + 110));
  const points = new Map();
  for (const [layer, ids] of columns) {
    ids.sort((a,b) => a - b);
    for (let i = 0; i < ids.length; ++i)
      points.set(ids[i], [50 + 860 * layer / last, (height - 55) * (i + 1) / (ids.length + 1) + 25]);
  }
  return {nodes, visible, points, height, target};
}

export function cppnGraph(report, output, selection) {
  const cppn = report.cppn, layout = graphLayout(cppn, output),
    {nodes, visible, points, height, target} = layout, active = new Set(visible);
  const selectedId = selection?.id, selectedKind = selection?.kind;
  const links = cppn.links.filter(e => (active.has(e[1]) && active.has(e[2])) ||
    (e[2] === target && active.has(e[1])));
  const lines = links.map(([id, from, to, weight, enabled, port]) => {
    const a = points.get(from), b = points.get(to);
    if (!a || !b) return '';
    const bend = Math.max(40, (b[0] - a[0]) * .48), path = `M${a[0]} ${a[1]} C${a[0] + bend} ${a[1]} ${b[0] - bend} ${b[1]} ${b[0]} ${b[1]}`;
    return `<g class="aid-graph-link ${!enabled ? 'off' : weight < 0 ? 'negative' : 'positive'} ` +
      `${selectedKind === 'link' && selectedId === id ? 'selected' : ''}" data-link="${id}">` +
      `<path d="${path}" class="aid-graph-line" fill="none" ` +
      `stroke-width="${Math.max(1.1, Math.min(4, Math.abs(weight) * 1.4)).toFixed(2)}"/>` +
      `<path d="${path}" stroke-width="13" stroke="transparent" fill="none"/>` +
      `<title>Verbindung #${id}: ${esc(nodeLabel(from))} → ${esc(nodeLabel(to))}, ` +
      `Gewicht ${Number(weight).toFixed(3)}${!enabled ? ', ausgeschaltet' : ''}</title></g>`;
  }).join('');
  const markers = visible.map(id => {
    const n = nodes.get(id), [x,y] = points.get(id), role = n[3];
    return `<g data-node="${id}" class="aid-graph-node ${role === 0 ? 'input' : role === 2 ? 'output' : 'hidden'} ` +
      `${selectedKind === 'node' && selectedId === id ? 'selected' : ''}">` +
      `<circle cx="${x}" cy="${y}" r="${id === target ? 15 : 12}"/>` +
      `<text x="${x}" y="${y + 3.3}" text-anchor="middle">${id < 30 ? id : n[1]}</text>` +
      `<title>#${id} ${esc(nodeLabel(id))} · ${esc(NODE_TYPES[n[1]])}</title></g>`;
  }).join('');
  return `<div class="aid-viewhead"><div><small>GENOTYP / GERICHTETER RECHENGRAPH</small>` +
    `<h2>CPPN-Werkbank</h2><p>Jeder Ausgang entwickelt ein anderes Merkmal. Wähle einen Ausgang und ändere Knoten oder Kanten direkt.</p></div>` +
    `<label>Ausgang <select id="aid-graph-output">${selectOptions(namedOptions(OUTPUTS), output)}</select></label></div>` +
    `<div class="aid-graph-meta"><span>${cppn.nodes.length} Knoten</span><span>${cppn.links.length} Kanten</span>` +
    `<span>${visible.length} Knoten im gewählten Signalweg</span></div>` +
    `<div class="aid-graph-scroll"><svg id="aid-graph" viewBox="0 0 960 ${height}" role="img" aria-label="Gerichteter CPPN-Graph für ${esc(OUTPUTS[output])}">` +
    `<g class="aid-graph-axis"><text x="48" y="19">EINGÄNGE</text><text x="460" y="19">BERECHNUNG</text>` +
    `<text x="909" y="19" text-anchor="end">AUSGANG</text></g>` + lines + markers + '</svg></div>' +
    `<div class="aid-footnotes"><span><i class="aid-key send"></i> Positive Kante</span>` +
    `<span><i class="aid-key bad"></i> Negative Kante</span>` +
    `<span>Der Graph zeigt den Signalweg zum gewählten Ausgang.</span></div>` +
    `<p class="aid-note">v019 erhält zehn Eingänge (vier Zonen, Ort, Seite, Wirkung und Bias) und ` +
    `zwanzig Ausgänge. Gezeichnet werden die für diesen Ausgang tatsächlich verbundenen Knoten.</p>`;
}

function input(prop, value, type = 'number', extra = '') {
  return `<label class="aid-field"><span>${esc(prop)}</span>` +
    `<input id="aid-graph-${esc(prop)}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}

export function cppnControls(report, selection, connect) {
  if (!report?.cppn) return '<p>Entwickle oder öffne ein Genom, um den Graphen zu bearbeiten.</p>';
  const {nodes, links} = report.cppn;
  const node = selection?.kind === 'node' && nodes.find(n => n[0] === selection.id);
  const link = selection?.kind === 'link' && links.find(e => e[0] === selection.id);
  let edit = '<p class="aid-note">Wähle im Graphen einen Knoten oder eine Verbindung.</p>';
  if (node) {
    const fixedIdentity = node[0] >= 11 && node[0] <= 15,
      editable = node[3] !== 0 && !fixedIdentity;
    edit = `<div class="aid-control-heading"><small>KNOTEN #${node[0]}</small>` +
      `<h3>${esc(nodeLabel(node[0]))}</h3></div>` +
      `<p class="aid-note">${node[3] === 0 ? 'CPPN-Eingang' : node[3] === 2 ? 'CPPN-Ausgang' : 'Versteckter Rechenknoten'}` +
      `${fixedIdentity ? ' · Identitätsausgang in v019 fest linear.' : ''}</p>` +
      `<label class="aid-field"><span>Funktion</span><select id="aid-graph-type" ${!editable ? 'disabled' : ''}>` +
      `${selectOptions(namedOptions(NODE_TYPES), node[1])}</select></label>` +
      input('parameter', node[2], 'number', `step=".01" min="-16" max="16" ${!editable ? 'disabled' : ''}`) +
      `<button data-action="graph-save-node" class="aid-primary" ${!editable ? 'disabled' : ''}>Knoten anwenden</button>`;
  } else if (link) {
    edit = `<div class="aid-control-heading"><small>VERBINDUNG #${link[0]}</small>` +
      `<h3>${esc(nodeLabel(link[1]))} → ${esc(nodeLabel(link[2]))}</h3></div>` +
      input('weight', link[3], 'number', 'step=".01" min="-16" max="16"') +
      `<label class="aid-toggle"><input id="aid-graph-enabled" type="checkbox" ${link[4] ? 'checked' : ''}> Verbindung aktiv</label>` +
      `<button data-action="graph-save-link" class="aid-primary">Verbindung anwenden</button>` +
      `<button data-action="graph-split">Verbindung durch Knoten teilen</button>`;
  }
  return edit + `<div class="aid-subheading">Verbindung nach ID finden</div>` +
    `<div class="aid-search-link"><input id="aid-find-link" type="number" min="0" step="1" ` +
    `placeholder="Kanten-ID" aria-label="Kanten-ID"><button data-action="graph-find-link">Auswählen</button></div>` +
    `<div class="aid-subheading">Neue Verbindung</div>` +
    `<p class="aid-note">Verbinde vorhandene Knoten. Der Graph muss gerichtet und ohne Zyklen bleiben.</p>` +
    `<label class="aid-field"><span>Von</span><select id="aid-connect-from">` +
    `${selectOptions(nodes.filter(n => n[3] !== 2).map(n => [n[0], '#' + n[0] + ' · ' + nodeLabel(n[0])]), connect.from)}` +
    `</select></label><label class="aid-field"><span>Nach</span><select id="aid-connect-to">` +
    `${selectOptions(nodes.filter(n => n[3] !== 0).map(n => [n[0], '#' + n[0] + ' · ' + nodeLabel(n[0])]), connect.to)}` +
    `</select></label>` +
    `<div class="aid-twocol">${input('new-weight', connect.weight, 'number', 'step=".05" min="-16" max="16"')}` +
    `<label class="aid-field"><span>Port</span><select id="aid-connect-port">` +
    `${selectOptions([[0,'0'],[1,'1']], connect.port)}</select></label></div>` +
    `<button data-action="graph-connect">Verbindung hinzufügen</button>`;
}
