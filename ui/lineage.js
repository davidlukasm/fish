import {appendLineageBehavior} from './behavior_view.js';
import {el, text} from './dom.js';
import {evolutionState} from './evolution.js';
import {deathNames} from './feeding_view.js';
import {fishRenderRadius} from './fish_fins.js';
import {fishPreviewPose} from './fish_organs.js';
import {paintFishGlyph} from './fish_painter.js';
import {frameSpecies, sceneState, selectFish} from './state.js';
export const lineageState = {};
export let familyDiagrams;

export function resetFamilies() {
  lineageState.familyRecords.clear();
  lineageState.familyLive.clear();
  lineageState.speciesHistory.clear();
  lineageState.speciesBranch = 0;
  lineageState.speciesTrail = [];
  lineageState.speciesFamilyFocus = 0;
  lineageState.memberPage = 0;
  for (const box of familyDiagrams) {
    box.graphSignature = '';
    box.ownerId = 0;
    box.focusId = 0;
    box.trail = [];
  }
}

export function rememberFamilies(f) {
  const prior = lineageState.familyLive;
  lineageState.familyLive = new Map(f.fish.filter(p => p[8]).map(p => [p[4], p]));
  for (const [id, p] of prior)
    if (!lineageState.familyLive.has(id)) {
      const record = lineageState.familyRecords.get(id);
      if (record)
        record.p = p;
    }
  for (const p of lineageState.familyLive.values()) {
    const old = lineageState.familyRecords.get(p[4]);
    lineageState.familyRecords.set(p[4], {
      id : p[4],
      species : p[22],
      parent : p[35],
      father : p[15],
      depth : p[12],
      generation : p[41],
      born : p[40] || 0,
      origin : p[10],
      clonal : p[31],
      first : old?.first ?? f.step,
      seen : f.step,
      p
    });
  }
  for (const [id, cause, step] of f.recent_deaths || []) {
    const record = lineageState.familyRecords.get(id);
    if (record) {
      record.death_cause = cause;
      record.death_step = step;
    }
  }
  if (lineageState.familyRecords.size > 5000) {
    const protectedIds =
        new Set([...lineageState.familyLive.keys(), ...f.fish.flatMap(p => [p[35], p[15]]) ]);
    for (const id of lineageState.familyRecords.keys()) {
      if (lineageState.familyRecords.size <= 5000)
        break;
      if (!protectedIds.has(id))
        lineageState.familyRecords.delete(id);
    }
  }
}

export function loadFamilyHistory(rows, species = [], observation) {
  if (sceneState.frame?.historical &&
      (!observation || observation !== sceneState.frame.observation?.key))
    return;
  for (const s of species)
    lineageState.speciesHistory.set(s.id, s);
  for (const row of rows) {
    const old = lineageState.familyRecords.get(row[0]);
    lineageState.familyRecords.set(row[0], {
      id : row[0],
      species : row[1],
      parent : row[2],
      father : row[3],
      depth : row[4],
      generation : row[5],
      born : row[6],
      origin : row[7],
      clonal : row[8],
      first : row[9],
      seen : row[10],
      death_cause : row[11],
      death_step : row[12],
      p : old?.p
    });
  }
}

export function familyRecord(id, f = sceneState.frame) {
  const record = lineageState.familyRecords.get(id);
  return record && (!f?.historical || record.first <= f.step || lineageState.familyLive.has(id))
             ? record
             : null;
}

export function familyParents(record) {
  if (!record)
    return [];
  const result = [];
  if (record.parent && record.parent !== record.id)
    result.push({
      id : record.parent,
      role : record.origin === 1 ? 'Mutter' : 'Vorlage',
      dashed : record.origin !== 1 || !!record.clonal
    });
  if (record.father && record.father !== record.id) {
    const same = result.find(item => item.id === record.father);
    if (same)
      same.role = 'Mutter und Vater';
    else
      result.push({id : record.father, role : 'Vater', dashed : false});
  }
  return result;
}

export function familyChildren(id, f = sceneState.frame) {
  return [...lineageState.familyRecords.values() ]
      .filter(record => record.id !== id && (record.parent === id || record.father === id) &&
                        (!f?.historical || record.first <= f.step ||
                         lineageState.familyLive.has(record.id)))
      .sort((a, b) => Number(lineageState.familyLive.has(b.id)) -
                          Number(lineageState.familyLive.has(a.id)) ||
                      b.born - a.born || b.id - a.id);
}

export function lineageElement(tag, className, textValue) {
  const node = document.createElement(tag);
  node.className = className;
  if (textValue !== undefined)
    node.textContent = textValue;
  return node;
}

export function lineageButton(label, click, title = '') {
  const button = lineageElement('button', 'lineage-action', label);
  button.onclick = click;
  button.title = title;
  return button;
}

export function familyPager(box, total, size, refresh) {
  const count = Math.max(1, Math.ceil(total / size));
  box.childPage = Math.max(0, Math.min(box.childPage || 0, count - 1));
  const nav = lineageElement('div', 'lineage-pager');
  if (count <= 1)
    return nav;
  const previous = lineageButton('←', () => {
    box.childPage--;
    box.graphSignature = '';
    refresh();
  }, 'Vorige Nachkommen');
  previous.disabled = !box.childPage;
  const next = lineageButton('→', () => {
    box.childPage++;
    box.graphSignature = '';
    refresh();
  }, 'Weitere Nachkommen');
  next.disabled = box.childPage === count - 1;
  nav.appendChild(previous);
  nav.appendChild(
      lineageElement('span', 'caption', `${box.childPage + 1} / ${count} · ${total} Nachkommen`));
  nav.appendChild(next);
  return nav;
}

export function paintFamilyLinks(box) {
  const stage = box.graphStage, svg = stage?.linksCanvas;
  if (!svg)
    return;
  const bounds = stage.getBoundingClientRect();
  if (!bounds.width || !bounds.height)
    return;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  for (const link of stage.familyLinks || []) {
    const source = stage.familyNodes.get(link.from), target = stage.familyNodes.get(link.to);
    if (!source || !target)
      continue;
    const a = source.getBoundingClientRect(), b = target.getBoundingClientRect(),
          x = a.left + a.width / 2 - bounds.left, y = a.top + a.height - bounds.top,
          tx = b.left + b.width / 2 - bounds.left, ty = b.top - bounds.top,
          path = document.createElementNS
                     ? document.createElementNS('http://www.w3.org/2000/svg', 'path')
                     : document.createElement('path');
    path.setAttribute('d', `M ${x} ${y} C ${x} ${(y + ty) / 2} ${tx} ${(y + ty) / 2} ${tx} ${ty}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#8baeb0');
    path.setAttribute('stroke-width', '1.7');
    if (link.dashed)
      path.setAttribute('stroke-dasharray', '5 4');
    svg.appendChild(path);
  }
}

export function redrawFamilies() {
  for (const box of familyDiagrams)
    paintFamilyLinks(box);
}

export function renderFamilyDiagram(box, bands, links) {
  const left = box.graphScroll?.scrollLeft || 0;
  box.replaceChildren();
  const scroll = lineageElement('div', 'lineage-scroll'),
        stage = lineageElement('div', 'lineage-stage');
  stage.style.minWidth = Math.max(330, ...bands.map(b => {
    const count = (b.nodes || b.groups.flatMap(g => g.nodes)).length;
    return count * (b.compact ? 110 : 160) + Math.max(0, count - 1) * 14 + 24;
  })) + 'px';
  scroll.appendChild(stage);
  box.appendChild(scroll);
  box.graphScroll = scroll;
  box.graphStage = stage;
  const svg = document.createElementNS
                  ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
                  : document.createElement('svg');
  svg.setAttribute('class', 'lineage-links');
  svg.setAttribute('aria-hidden', 'true');
  stage.appendChild(svg);
  stage.linksCanvas = svg;
  stage.familyNodes = new Map();
  stage.familyLinks = links;
  for (const band of bands) {
    const section = lineageElement('section', 'lineage-band'),
          label = lineageElement('h3', 'lineage-label', band.label),
          row = lineageElement('div', 'lineage-row');
    section.appendChild(label);
    section.appendChild(row);
    if (!(band.nodes || band.groups.flatMap(g => g.nodes)).length)
      row.appendChild(lineageElement('p', 'lineage-empty', band.empty || '–'));
    for (const group of band.groups || [ {nodes : band.nodes} ]) {
      const target = band.groups ? lineageElement('div', 'lineage-descendant-group') : row;
      if (band.groups) {
        target.appendChild(lineageElement('small', 'lineage-group-label', group.label));
        row.appendChild(target);
      }
      for (const item of group.nodes) {
        const card = lineageElement('div', 'lineage-node' + (item.focus ? ' is-focus' : '') +
                                               (item.absent ? ' is-absent' : '') +
                                               (band.compact ? ' is-compact' : '')),
              button = lineageElement('button', 'lineage-person');
        button.dataset.lineageId = String(item.id);
        button.title = item.title || 'Hier weiterblättern';
        button.onclick = item.click;
        button.disabled = !item.click;
        button.appendChild(lineageElement('small', 'lineage-role', item.role || ''));
        button.appendChild(lineageElement('strong', '', item.name));
        if (item.p) {
          const portrait = document.createElement('canvas');
          portrait.width = 150;
          portrait.height = 90;
          portrait.className = 'lineage-portrait';
          const g = portrait.getContext('2d', {willReadFrequently : true});
          g.save();
          const fit = fishPreviewPose(item.p, 150, 86, 4.5 * fishRenderRadius(item.p));
          g.translate(fit.x, fit.y);
          paintFishGlyph(g, item.p, fit.r, 0, sceneState.frame?.step || 0, 1, null, false, 1,
                         fit.a);
          g.restore();
          button.appendChild(portrait);
        }
        button.appendChild(lineageElement('span', 'lineage-note', item.note || ''));
        if (item.comparison)
          appendLineageBehavior(button, item.comparison[0], item.comparison[1]);
        card.appendChild(button);
        if (item.inspect)
          card.appendChild(lineageButton(item.inspectLabel || 'Im Becken', item.inspect));
        target.appendChild(card);
        stage.familyNodes.set(item.id, card);
      }
    }
    stage.appendChild(section);
  }
  familyDiagrams.add(box);
  if (!box.familyObserver && typeof ResizeObserver !== 'undefined') {
    box.familyObserver = new ResizeObserver(() => paintFamilyLinks(box));
    box.familyObserver.observe(box);
  }
  paintFamilyLinks(box);
  requestAnimationFrame(() => paintFamilyLinks(box));
  scroll.scrollLeft = left;
}

export function individualNode(id, role, f, box, focus = false) {
  const record = familyRecord(id, f), alive = lineageState.familyLive.has(id),
        p = lineageState.familyLive.get(id) || record?.p,
        species = (f.species || []).find(s => s.id === (record?.species || p?.[22]));
  const click = record ? () => {
    box.trail ??= [];
    if (box.focusId !== id)
      box.trail.push(box.focusId);
    box.focusId = id;
    box.childPage = 0;
    box.graphSignature = '';
    renderIndividualFamily(box, sceneState.frame, box.ownerId);
  } : null;
  return {
    id,
    name : '#' + id,
    role,
    p,
    focus,
    absent : !alive,
    note : record ? (species?.name || 'Spezies #' + record.species) + ' · ' +
                        (alive ? 'lebt'
                         : Number.isInteger(record.death_cause)
                             ? deathNames[record.death_cause] || 'Todesursache unbekannt'
                             : 'Todesursache unbekannt') +
                        ' · hilfsfreie Generation ' + record.generation
                  : 'Nicht mehr im Bestand · weitere Angaben fehlen',
    title : record ? 'Familie von Fisch #' + id +
                         (alive ? ''
                          : Number.isInteger(record.death_cause)
                              ? ' · ' + deathNames[record.death_cause] + ' bei Schritt ' +
                                    record.death_step
                              : ' · zuletzt gesehen bei Schritt ' + record.seen)
                   : 'Zu diesem Elternteil sind nur Kennung und Herkunft bekannt.',
    click,
    inspect : alive ? () => selectFish(id) : null
  };
}

export function renderIndividualFamily(box, f, id) {
  if (box.ownerId !== id) {
    box.ownerId = box.focusId = id;
    box.childPage = 0;
    box.trail = [];
    box.graphSignature = '';
  }
  const focus = familyRecord(box.focusId, f);
  if (!focus) {
    box.replaceChildren(lineageElement('p', 'caption', 'Fisch in der Liste auswählen.'));
    box.graphSignature = '';
    return;
  }
  const parents = familyParents(focus), children = familyChildren(focus.id, f),
        page = Math.min(box.childPage || 0, Math.max(0, Math.ceil(children.length / 4) - 1)),
        shown = children.slice(page * 4, page * 4 + 4);
  const signature = JSON.stringify([
    id, focus.id, parents, children.map(child => [child.id, lineageState.familyLive.has(child.id)]),
    parents.map(parent => [parent.id, lineageState.familyLive.has(parent.id),
                           !!familyRecord(parent.id, f)]),
    lineageState.familyLive.has(focus.id), page, (f.species || []).map(s => [s.id, s.name])
  ]);
  if (signature === box.graphSignature) {
    paintFamilyLinks(box);
    return;
  }
  box.graphSignature = signature;
  const parentNodes = parents.map(parent => individualNode(parent.id, parent.role, f, box)),
        childNodes = shown.map(child => individualNode(child.id,
                                                       child.origin !== 1 ? 'Kopie / Hilfe'
                                                       : child.clonal     ? 'Klonaler Nachwuchs'
                                                                          : 'Nachwuchs',
                                                       f, box));
  const links = [
    ...parents.map(parent => ({from : parent.id, to : focus.id, dashed : parent.dashed})),
    ...shown.map(
        child => ({from : focus.id, to : child.id, dashed : child.origin !== 1 || !!child.clonal}))
  ];
  renderFamilyDiagram(box,
                      [
                        {
                          label : 'Eltern / Vorlage',
                          nodes : parentNodes,
                          empty : focus.origin === 0   ? 'Zufallsgründer'
                                  : focus.origin !== 1 ? 'Zufallsgenom oder ohne erfasste Vorlage'
                                                       : 'Keine Eltern erfasst'
                        },
                        {
                          label : 'Fisch #' + focus.id,
                          nodes : [ individualNode(focus.id, 'Ausgewählt', f, box, true) ]
                        },
                        {
                          label : 'Nachkommen · ' + children.length,
                          nodes : childNodes,
                          empty : 'Noch kein bekannter geschlüpfter Nachwuchs'
                        }
                      ],
                      links);
  const toolbar = lineageElement('div', 'lineage-toolbar');
  if (box.trail?.length)
    toolbar.appendChild(lineageButton('← Zurück', () => {
      box.focusId = box.trail.pop();
      box.childPage = 0;
      box.graphSignature = '';
      renderIndividualFamily(box, sceneState.frame, id);
    }));
  if (focus.id !== id)
    toolbar.appendChild(lineageButton('Zur Auswahl #' + id, () => {
      box.focusId = id;
      box.trail = [];
      box.childPage = 0;
      box.graphSignature = '';
      renderIndividualFamily(box, sceneState.frame, id);
    }));
  toolbar.appendChild(familyPager(box, children.length, 4,
                                  () => renderIndividualFamily(box, sceneState.frame, id)));
  box.appendChild(toolbar);
  const hint = lineageElement('p', 'caption',
                              'Eltern und Kinder anklicken · gestrichelt: klonal oder Vorlage');
  hint.title =
      'Nur bekannte geschlüpfte Fische. Eltern und Nachkommen anklicken, um entlang der Abstammung zu navigieren.';
  box.appendChild(hint);
}

export function showIndividualFamily(id) {
  lineageState.speciesFamilyFocus = id;
  el('species-family-details').open = true;
  renderIndividualFamily(el('species-family'), sceneState.frame, id);
  el('species-family-details').scrollIntoView?.({block : 'nearest', behavior : 'smooth'});
}

export function speciesNode(s, role, focus = false) {
  const mother =
            frameSpecies(sceneState.frame, s.mother) || lineageState.speciesHistory.get(s.mother),
        comparison = s.profile_samples > 0 && mother?.profile_samples > 0 &&
                             s.profile?.length === 26 && mother.profile?.length === 26
                         ? [ s, mother ]
                         : null;
  return {comparison,id:s.id,name:s.name,role,focus,absent:!!s.extinct_at,note:s.missing?'Keine weiteren Angaben':`${s.adults||0} Fische · ${s.extinct_at?'ausgestorben':'Schritt '+(s.born||0)}`,title:(s.name_reason?'Bei Benennung: '+s.name_reason+' · ':'')+'Abstammung von '+s.name+(s.mother||s.father?' · Elternarten des ersten Individuums '+[s.mother,s.father].filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).map(id=>sceneState.frame?.species.find(parent=>parent.id===id)?.name||'#'+id).join(' × '):''),click:s.missing?null:()=>{const current=lineageState.speciesBranch||evolutionState.lineageFocus||evolutionState.selectedSpecies;if(current&&current!==s.id)lineageState.speciesTrail.push(current);lineageState.speciesBranch=s.id;el('family-tree').childPage=0;el('family-tree').graphSignature='';drawTree(sceneState.frame.species||[]);}};
}

export function drawTree(all) {
  const merged = new Map([...lineageState.speciesHistory.values() ]
                             .filter(s => !sceneState.frame || s.born <= sceneState.frame.step)
                             .map(s => [s.id, s]));
  for (const s of all)
    merged.set(s.id, s);
  all = [...merged.values() ];
  if (el('species-tree').open === false)
    return;
  const box = el('family-tree'),
        id = lineageState.speciesBranch || evolutionState.lineageFocus ||
             evolutionState.selectedSpecies,
        focus = all.find(s => s.id === id);
  if (!focus) {
    box.graphSignature = '';
    box.graphStage = null;
    box.replaceChildren(
        lineageElement('p', 'caption', 'Art auswählen, um ihre Abstammung zu sehen.'));
    text('tree-scope', 'Abstammung der Spezies');
    return;
  }
  const parents = [ focus.mother ].filter(parent => parent && parent !== focus.id),
        children = all.filter(s => s.id !== focus.id && s.mother === focus.id)
                       .sort((a, b) => (b.adults || 0) - (a.adults || 0) || b.born - a.born);
  if (box.ownerId !== id) {
    box.ownerId = id;
    box.childPage = 0;
  }
  const page = Math.min(box.childPage || 0, Math.max(0, Math.ceil(children.length / 4) - 1)),
        shown = children.slice(page * 4, page * 4 + 4), signature = JSON.stringify([
          id,
          all.map(s => [s.id, s.name, s.name_reason, s.mother, s.father, s.adults, s.extinct_at,
                        s.profile, s.profile_samples]),
          page
        ]);
  text('tree-scope', focus.name + ' · Herkunft und neu entstandene Arten');
  if (signature === box.graphSignature) {
    paintFamilyLinks(box);
    return;
  }
  box.graphSignature = signature;
  const byId = new Map(all.map(s => [s.id, s])), ancestors = [], seen = new Set([ id ]);
  let cursor = focus;
  for (let generation = 1; generation <= 5 && cursor.mother && !seen.has(cursor.mother);
       ++generation) {
    const parent = byId.get(cursor.mother) ||
                   {id : cursor.mother, name : 'Spezies #' + cursor.mother, missing : true};
    ancestors.push({s : parent, child : cursor, generation});
    seen.add(parent.id);
    cursor = parent;
  }
  const ancestorBands = ancestors.slice().reverse().map(
      a => ({
        label : a.generation === 1   ? 'Mutterart'
                : a.generation === 2 ? 'Großmutterart'
                                     : a.generation + ' Arten zurück',
        nodes : [ speciesNode(a.s, 'Vorfahrin') ],
        compact : a.generation > 1
      }));
  const groups = shown
                     .map(parent => {
                       const descendants = all.filter(s => s.mother === parent.id)
                                               .sort((a, b) => (b.adults || 0) - (a.adults || 0) ||
                                                               b.born - a.born);
                       return {
                         label : parent.name + (descendants.length > 3
                                                    ? ' · ' + descendants.length + ' Enkelarten'
                                                    : ''),
                         parent,
                         nodes : descendants.slice(0, 3).map(s => speciesNode(s, 'Enkelart'))
                       };
                     })
                     .filter(g => g.nodes.length);
  const bands = [
    ...ancestorBands, {label : 'Spezies', nodes : [ speciesNode(focus, 'Ausgewählt', true) ]}, {
      label : 'Tochterarten · ' + children.length,
      nodes : shown.map(s => speciesNode(s, s.origin === 1   ? 'Natürlicher Ursprung'
                                            : s.origin === 2 ? 'Bestandshilfe'
                                                             : 'Einwanderung / Zusatz')),
      empty : 'Noch keine Tochterart'
    }
  ];
  if (groups.length)
    bands.push({label : 'Enkelarten', groups, compact : true});
  const links = [
    ...ancestors.map(a => ({from : a.s.id, to : a.child.id, dashed : a.child.origin !== 1})),
    ...shown.map(s => ({from : id, to : s.id, dashed : s.origin !== 1})),
    ...groups.flatMap(g => g.nodes.map(s => ({from : g.parent.id, to : s.id})))
  ];
  renderFamilyDiagram(box, bands, links);
  const controls = lineageElement('div', 'lineage-toolbar');
  if (lineageState.speciesTrail.length)
    controls.appendChild(lineageButton('← Zurück', () => {
      lineageState.speciesBranch = lineageState.speciesTrail.pop();
      box.graphSignature = '';
      box.childPage = 0;
      drawTree(sceneState.frame.species || []);
    }));
  if ((evolutionState.lineageFocus || evolutionState.selectedSpecies) &&
      id !== (evolutionState.lineageFocus || evolutionState.selectedSpecies))
    controls.appendChild(lineageButton('Zur ausgewählten Art', () => {
      lineageState.speciesBranch = evolutionState.lineageFocus || evolutionState.selectedSpecies;
      lineageState.speciesTrail = [];
      box.graphSignature = '';
      box.childPage = 0;
      drawTree(sceneState.frame.species || []);
    }));
  controls.appendChild(
      familyPager(box, children.length, 4, () => drawTree(sceneState.frame.species || [])));
  box.appendChild(controls);
  const note = lineageElement('p', 'caption', 'Gruppe anklicken, um ihren Zweig zu verfolgen.');
  note.title =
      'Hier entstehen Verzweigungen beim Auftreten neuer genetischer Gruppen. Nachwuchs innerhalb derselben Art steht im individuellen Stammbaum.';
  box.appendChild(note);
}

export function updateLineageState(patch) {
  Object.assign(lineageState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "familyRecords" : () => {
    // Local family diagrams share readable HTML cards and a small SVG for their links.
    lineageState.familyRecords = new Map();
  },
  "familyLive" : () => { lineageState.familyLive = new Map(); },
  "speciesFamilyFocus" : () => { lineageState.speciesFamilyFocus = 0; },
  "memberPage" : () => { lineageState.memberPage = 0; },
  "speciesBranch" : () => { lineageState.speciesBranch = 0; },
  "speciesTrail" : () => { lineageState.speciesTrail = []; },
  "speciesHistory" : () => { lineageState.speciesHistory = new Map(); },
  "familyDiagrams" : () => { familyDiagrams = new Set(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
