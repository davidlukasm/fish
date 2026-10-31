import {
  familyChildren,
  familyParents,
  familyRecord,
  family_modelState,
  resetFamilyRecords
} from './family_model.js';
import {t} from './strings.js';
import {nameReason} from './species_model.js';
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
  resetFamilyRecords();
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

function familyPager(box, total, size, refresh) {
  const count = Math.max(1, Math.ceil(total / size));
  box.childPage = Math.max(0, Math.min(box.childPage || 0, count - 1));
  const nav = lineageElement('div', 'lineage-pager');
  if (count <= 1)
    return nav;
  const previous = lineageButton('←', () => {
    box.childPage--;
    box.graphSignature = '';
    refresh();
  }, t('lineage.vorigeNachkommen'));
  previous.disabled = !box.childPage;
  const next = lineageButton('→', () => {
    box.childPage++;
    box.graphSignature = '';
    refresh();
  }, t('lineage.weitereNachkommen'));
  next.disabled = box.childPage === count - 1;
  nav.appendChild(previous);
  nav.appendChild(
      lineageElement('span', 'caption',
                     t('lineage.childPage', {page : box.childPage + 1, pages : count, n : total})));
  nav.appendChild(next);
  return nav;
}

function paintFamilyLinks(box) {
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

function renderFamilyDiagram(box, bands, links) {
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
        button.title = item.title || t('lineage.hierWeiterblaettern');
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
          card.appendChild(lineageButton(item.inspectLabel || t('lineage.imBecken'), item.inspect));
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

function individualNode(id, role, f, box, focus = false) {
  const record = familyRecord(id, f), alive = family_modelState.familyLive.has(id),
        p = family_modelState.familyLive.get(id) || record?.p,
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
    name : t('lineage.fishNumber', {id}),
    role,
    p,
    focus,
    absent : !alive,
    note : record ? t('lineage.individualNote', {
      species : species?.name || t('lineage.speciesNumber', {id : record.species}),
      state : alive ? t('lineage.alive')
              : Number.isInteger(record.death_cause)
                  ? deathNames[record.death_cause] || t('lineage.todesursacheUnbekannt')
                  : t('lineage.todesursacheUnbekannt'),
      generation : record.generation
    })
                  : t('lineage.nichtMehrImBestand'),
    title : record ? alive ? t('lineage.familyOf', {id})
                     : Number.isInteger(record.death_cause)
                         ? t('lineage.familyOfDead',
                             {id, cause : deathNames[record.death_cause], step : record.death_step})
                         : t('lineage.familyOfLost', {id, step : record.seen})
                   : t('lineage.zuDiesemElternteilSind'),
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
    box.replaceChildren(lineageElement('p', 'caption', t('lineage.fischInDerListe')));
    box.graphSignature = '';
    return;
  }
  const parents = familyParents(focus), children = familyChildren(focus.id, f),
        page = Math.min(box.childPage || 0, Math.max(0, Math.ceil(children.length / 4) - 1)),
        shown = children.slice(page * 4, page * 4 + 4);
  const signature = JSON.stringify([
    id, focus.id, parents,
    children.map(child => [child.id, family_modelState.familyLive.has(child.id)]),
    parents.map(parent => [parent.id, family_modelState.familyLive.has(parent.id),
                           !!familyRecord(parent.id, f)]),
    family_modelState.familyLive.has(focus.id), page, (f.species || []).map(s => [s.id, s.name])
  ]);
  if (signature === box.graphSignature) {
    paintFamilyLinks(box);
    return;
  }
  box.graphSignature = signature;
  const parentNodes = parents.map(parent => individualNode(parent.id, parent.role, f, box)),
        childNodes =
            shown.map(child => individualNode(child.id,
                                              child.origin !== 1 ? t('lineage.kopieHilfe')
                                              : child.clonal     ? t('lineage.klonalerNachwuchs')
                                                                 : t('lineage.nachwuchs'),
                                              f, box));
  const links = [
    ...parents.map(parent => ({from : parent.id, to : focus.id, dashed : parent.dashed})),
    ...shown.map(
        child => ({from : focus.id, to : child.id, dashed : child.origin !== 1 || !!child.clonal}))
  ];
  renderFamilyDiagram(
      box,
      [
        {
          label : t('lineage.elternVorlage'),
          nodes : parentNodes,
          empty : focus.origin === 0   ? t('lineage.zufallsgruender')
                  : focus.origin !== 1 ? t('lineage.zufallsgenomOderOhneErfasste')
                                       : t('lineage.keineElternErfasst')
        },
        {
          label : t('lineage.fish', {id : focus.id}),
          nodes : [ individualNode(focus.id, t('lineage.ausgewaehlt'), f, box, true) ]
        },
        {
          label : t('lineage.children', {n : children.length}),
          nodes : childNodes,
          empty : t('lineage.nochKeinBekannterGeschluepfter')
        }
      ],
      links);
  const toolbar = lineageElement('div', 'lineage-toolbar');
  if (box.trail?.length)
    toolbar.appendChild(lineageButton(t('lineage.zurueck'), () => {
      box.focusId = box.trail.pop();
      box.childPage = 0;
      box.graphSignature = '';
      renderIndividualFamily(box, sceneState.frame, id);
    }));
  if (focus.id !== id)
    toolbar.appendChild(lineageButton(t('lineage.backToSelection', {id}), () => {
      box.focusId = id;
      box.trail = [];
      box.childPage = 0;
      box.graphSignature = '';
      renderIndividualFamily(box, sceneState.frame, id);
    }));
  toolbar.appendChild(familyPager(box, children.length, 4,
                                  () => renderIndividualFamily(box, sceneState.frame, id)));
  box.appendChild(toolbar);
  const hint = lineageElement('p', 'caption', t('lineage.elternUndKinderAnklicken'));
  hint.title = t('lineage.nurBekannteGeschluepfteFische');
  box.appendChild(hint);
}

export function showIndividualFamily(id) {
  lineageState.speciesFamilyFocus = id;
  el('species-family-details').open = true;
  renderIndividualFamily(el('species-family'), sceneState.frame, id);
  el('species-family-details').scrollIntoView?.({block : 'nearest', behavior : 'smooth'});
}

function speciesNode(s, role, focus = false) {
  const mother = frameSpecies(sceneState.frame, s.mother) ||
                 family_modelState.speciesHistory.get(s.mother),
        comparison = s.profile_samples > 0 && mother?.profile_samples > 0 &&
                             s.profile?.length === 26 && mother.profile?.length === 26
                         ? [ s, mother ]
                         : null;
  return {comparison,id:s.id,name:s.name,role,focus,absent:!!s.extinct_at,note:s.missing?t('lineage.keineWeiterenAngaben'):s.extinct_at?t('lineage.speciesExtinct',{n:s.adults||0}):t('lineage.speciesLiving',{n:s.adults||0,step:s.born||0}),title:[...(s.name_reason?[t('lineage.nameReason',{reason:nameReason(s.name_reason)})]:[]),t('lineage.descentOf',{name:s.name}),...(s.mother||s.father?[t('lineage.parentSpecies',{names:[s.mother,s.father].filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).map(id=>sceneState.frame?.species.find(parent=>parent.id===id)?.name||t('lineage.fishNumber',{id})).join(' × ')})]:[])].join(' · '),click:s.missing?null:()=>{const current=lineageState.speciesBranch||evolutionState.lineageFocus||evolutionState.selectedSpecies;if(current&&current!==s.id)lineageState.speciesTrail.push(current);lineageState.speciesBranch=s.id;el('family-tree').childPage=0;el('family-tree').graphSignature='';drawTree(sceneState.frame.species||[]);}};
}

export function drawTree(all) {
  const merged = new Map([...family_modelState.speciesHistory.values() ]
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
    box.replaceChildren(lineageElement('p', 'caption', t('lineage.artAuswaehlenUmIhre')));
    text('tree-scope', t('lineage.abstammungDerSpezies'));
    return;
  }
  const children = all.filter(s => s.id !== focus.id && s.mother === focus.id)
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
  text('tree-scope', t('lineage.treeScope', {name : focus.name}));
  if (signature === box.graphSignature) {
    paintFamilyLinks(box);
    return;
  }
  box.graphSignature = signature;
  const byId = new Map(all.map(s => [s.id, s])), ancestors = [], seen = new Set([ id ]);
  let cursor = focus;
  for (let generation = 1; generation <= 5 && cursor.mother && !seen.has(cursor.mother);
       ++generation) {
    const parent = byId.get(cursor.mother) || {
      id : cursor.mother,
      name : t('lineage.speciesNumber', {id : cursor.mother}),
      missing : true
    };
    ancestors.push({s : parent, child : cursor, generation});
    seen.add(parent.id);
    cursor = parent;
  }
  const ancestorBands = ancestors.slice().reverse().map(
      a => ({
        label : a.generation === 1   ? t('lineage.mutterart')
                : a.generation === 2 ? t('lineage.grossmutterart')
                                     : t('lineage.generationsBack', {n : a.generation}),
        nodes : [ speciesNode(a.s, t('lineage.vorfahrin')) ],
        compact : a.generation > 1
      }));
  const groups =
      shown
          .map(parent => {
            const descendants =
                all.filter(s => s.mother === parent.id)
                    .sort((a, b) => (b.adults || 0) - (a.adults || 0) || b.born - a.born);
            return {
              label : descendants.length > 3
                          ? t('lineage.grandchildren', {name : parent.name, n : descendants.length})
                          : parent.name,
              parent,
              nodes : descendants.slice(0, 3).map(s => speciesNode(s, t('lineage.enkelart')))
            };
          })
          .filter(g => g.nodes.length);
  const bands = [
    ...ancestorBands,
    {label : t('lineage.spezies'), nodes : [ speciesNode(focus, t('lineage.ausgewaehlt'), true) ]},
    {
      label : t('lineage.daughterSpecies', {n : children.length}),
      nodes : shown.map(s => speciesNode(s, s.origin === 1   ? t('lineage.natuerlicherUrsprung')
                                            : s.origin === 2 ? t('lineage.bestandshilfe')
                                                             : t('lineage.einwanderungZusatz'))),
      empty : t('lineage.nochKeineTochterart')
    }
  ];
  if (groups.length)
    bands.push({label : t('lineage.enkelarten'), groups, compact : true});
  const links = [
    ...ancestors.map(a => ({from : a.s.id, to : a.child.id, dashed : a.child.origin !== 1})),
    ...shown.map(s => ({from : id, to : s.id, dashed : s.origin !== 1})),
    ...groups.flatMap(g => g.nodes.map(s => ({from : g.parent.id, to : s.id})))
  ];
  renderFamilyDiagram(box, bands, links);
  const controls = lineageElement('div', 'lineage-toolbar');
  if (lineageState.speciesTrail.length)
    controls.appendChild(lineageButton(t('lineage.zurueck'), () => {
      lineageState.speciesBranch = lineageState.speciesTrail.pop();
      box.graphSignature = '';
      box.childPage = 0;
      drawTree(sceneState.frame.species || []);
    }));
  if ((evolutionState.lineageFocus || evolutionState.selectedSpecies) &&
      id !== (evolutionState.lineageFocus || evolutionState.selectedSpecies))
    controls.appendChild(lineageButton(t('lineage.zurAusgewaehltenArt'), () => {
      lineageState.speciesBranch = evolutionState.lineageFocus || evolutionState.selectedSpecies;
      lineageState.speciesTrail = [];
      box.graphSignature = '';
      box.childPage = 0;
      drawTree(sceneState.frame.species || []);
    }));
  controls.appendChild(
      familyPager(box, children.length, 4, () => drawTree(sceneState.frame.species || [])));
  box.appendChild(controls);
  const note = lineageElement('p', 'caption', t('lineage.gruppeAnklickenUmIhren'));
  note.title = t('lineage.hierEntstehenVerzweigungenBeim');
  box.appendChild(note);
}

export function updateLineageState(patch) {
  Object.assign(lineageState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "speciesFamilyFocus" : () => { lineageState.speciesFamilyFocus = 0; },
  "memberPage" : () => { lineageState.memberPage = 0; },
  "speciesBranch" : () => { lineageState.speciesBranch = 0; },
  "speciesTrail" : () => { lineageState.speciesTrail = []; },
  "familyDiagrams" : () => { familyDiagrams = new Set(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
