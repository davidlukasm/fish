import {HORMONES} from '../schema.js';
import {PAIRINGS} from './model/organs.js';
import {nextVisionProfile} from './model/retina.js';
import {findSite, sitePoint} from './model/layout.js';
import {toggleInnerLink, updateRegion} from './model/regions.js';
import {
  addOrganType,
  addSubstance,
  allCenters,
  assembleSelection,
  closestSiteDoing,
  findAssembly,
  findCenter,
  findOrgan,
  GROWTH_START,
  identifier,
  linkPair,
  mirrorAssembly,
  mirrorOrgan,
  moveCenterToSide,
  moveOrgan,
  newDocument,
  nextTypeTuning,
  removeOrganType,
  removeSubstance,
  renameAssembly,
  selectionCenters,
  setSubstance,
  switchReceptor,
  ungroupAssembly,
  updateCenter,
  updateGrowth,
  updateReceptor,
  updateWire,
  usedSites,
  wheelPlace
} from './model/document.js';
import {BODY_MAP} from './view/scene.js';
import {label} from './view/kit.js';

// What a click in the studio does, by what it lands on. Each table lists selectors in the order
// they are tried; the first one the click's target lies in handles it (studio, the element it
// matched, the event), unless its handler returns PASS and lets the next ones try.
export const PASS = Symbol('pass');
export function clickOn(studio, event, table) {
  for (const [selector, handle] of table) {
    const element = event.target.closest?.(selector);
    if (element && handle(studio, element, event) !== PASS)
      return true;
  }
  return false;
}
// A change of a form element: the first entry of the table whose dataset key it carries
// handles it.
export function changeOn(studio, element, table) {
  const entry = table.find(([ key ]) => element.dataset[key] !== undefined);
  entry?.[1](studio, element);
  return !!entry;
}
// The kind of item an element marks: the first of `kinds` it carries a data attribute for.
export const markedKind = (element, kinds) =>
    kinds.find(kind => element?.hasAttribute('data-' + kind)) ?? null;

// The header's actions, by name.
const ACTIONS = Object.freeze({
  home : studio => studio.navigate('hub'),
  aquarium : studio => studio.navigate('aquarium'),
  atelier : studio => studio.navigate('studio'),
  new : studio => studio.changeDocument(newDocument(label('app.newFish'))),
  example : studio => studio.example(),
  check : studio => studio.checkCompiler(),
  'cancel-build' : studio => { studio.cancelCompile = true; },
  develop : studio => studio.develop(),
  eggs : studio => studio.placeEggs(),
  download : studio => studio.download(),
  open : studio => studio.root.querySelector('#aid-genome-file')?.click()
});

// Anywhere: the header's actions, the compiler's issues and the modes.
export const ANYWHERE_CLICKS = Object.freeze([
  [
    '[data-action]',
    (studio, e) => {
      const act = ACTIONS[e.dataset.action];
      if (!act)
        return PASS;
      act(studio);
    }
  ],
  [
    '[data-compiler-issue]',
    (studio, e) => {
      const center = allCenters(studio.state.document)[Number(e.dataset.compilerIssue)];
      if (center) {
        studio.root.querySelector('.aid-compiler').open = false;
        studio.select('center', center.id, null, false);
      }
    }
  ],
  [ '[data-mode]', (studio, e) => studio.setMode(e.dataset.mode) ]
]);

// In the studio: its tools, history, zoom and views.
export const STUDIO_CLICKS = Object.freeze([
  [ '[data-tool]', (studio, e) => studio.setTool(e.dataset.tool) ],
  [ '[data-history]', (studio, e) => studio.stepHistory(e.dataset.history) ],
  [ '[data-zoom]', (studio, e) => studio.zoom(e.dataset.zoom) ],
  [
    '[data-contacts]',
    (studio, e) => {
      const state = studio.state;
      if (e.dataset.contacts === 'actual' && (state.stale || !state.report?.contacts?.length))
        return;
      state.contactView = e.dataset.contacts;
      studio.renderShell();
    }
  ],
  [
    '[data-network]',
    (studio, e) => {
      studio.state.wireScope = e.dataset.network;
      studio.renderShell();
    }
  ]
]);

// The chosen organ when it is a field organ (an eye or a near sense), and its chosen colour type.
function chosenField(studio) {
  const organ = findOrgan(studio.state.document, studio.state.selected?.id);
  if (!organ?.field)
    return null;
  const profiles = organ.field.profiles;
  return {organ, profile : profiles.find(p => p.id === studio.state.visionProfile) ?? profiles[0]};
}
// A change of the document that keeps the selection; one that may find no room says so.
const keep = (studio, doc) => studio.changeDocument(doc, studio.state.selected);
const keepIfRoom = (studio, doc) => doc ? keep(studio, doc) : studio.notice(label('status.noRoom'));
const ITEM_KINDS = Object.freeze([ 'contact', 'wire', 'center', 'assembly', 'organ' ]);
const REMOVE_KINDS = Object.freeze([ 'remove-organ', 'remove-center', 'remove-wire' ]);

// A click on an item of the fish: the erase tool removes it, the wire tool wires it (from the
// item chosen before, or to the slot a wire was started from), the stimulus tool stimulates its
// centers; otherwise it is chosen, unless the pointer moved the item.
function clickItem(studio, element, event) {
  const kind = markedKind(element, ITEM_KINDS), id = element.dataset[kind];
  const doc = studio.state.document, tool = studio.state.tool;
  if (tool === 'erase')
    return studio.removeSelection({kind, id});
  if (tool === 'wire' && [ 'organ', 'center', 'assembly' ].includes(kind))
    return wireItem(studio, kind, id);
  if (tool === 'stimulate') {
    const centers = kind === 'organ'      ? findOrgan(doc, id)?.centers.map(center => center.id)
                    : kind === 'assembly' ? findAssembly(doc, id)?.centerIds
                    : kind === 'center'   ? [ id ]
                                          : [];
    if (centers?.length)
      studio.stimulate(centers);
    return;
  }
  if (studio.pointer?.moved)
    return;
  studio.select(kind, id, event);
}
function wireItem(studio, kind, id) {
  const {from, to} = studio.pendingWire ?? {}, item = {kind, id};
  studio.pendingWire = null;
  if (to && to.id !== id) {
    if (studio.connectSelections(item, to))
      return studio.notice(label('status.wired'));
  } else if (from) {
    if ((from.kind !== kind || from.id !== id) && studio.connectSelections(from, item))
      return;
  } else if (selectionCenters(studio.state.document, item).length) {
    studio.pendingWire = {from : item};
    studio.state.selected = item;
  }
  studio.refreshScene();
  studio.refreshInspector();
}
// A region's slot starts a wire there: from the region to what is clicked next, or the other
// way round.
function startSlotWire(studio, element) {
  const region = element.dataset.slotRegion, out = element.dataset.slotDir === 'out';
  studio.setTool('wire');
  const slot = {kind : 'organ', id : region};
  studio.pendingWire = out ? {from : slot} : {to : slot};
  studio.state.selected = {kind : 'organ', id : region};
  studio.refreshScene();
  studio.notice(label(out ? 'status.slotOut' : 'status.slotIn'));
}
// A muscle moves to the nearest free place with the function asked for.
function moveMuscle(studio, element) {
  const doc = studio.state.document, sites = studio.state.sites;
  const found = findCenter(doc, element.dataset.centerId);
  const here = findSite(sites, found?.center.site);
  const target = here && closestSiteDoing(found.center, Number(element.dataset.muscleFunction),
                                          sites, usedSites(doc), sitePoint(here), here.side);
  keepIfRoom(studio, target && moveOrgan(doc, found.organ.id, sites, sitePoint(target)));
}
// An organ's kinds of cell (a nose's scent profiles, the skin's pigment cells): another one with
// the tuning the organ lacks most, chosen at once.
function addType(studio, element) {
  const doc = studio.state.document, organ = findOrgan(doc, element.dataset.addType);
  const added = organ && addOrganType(doc, organ.id, studio.state.sites, nextTypeTuning(organ));
  if (!added)
    return studio.notice(label('status.noRoom'));
  const first = findOrgan(added.document, organ.id).centers.find(c => c.profile === added.typeId);
  studio.changeDocument(added.document, {kind : 'center', id : first.id});
}
// A change of a center that chooses it.
const changeCenter = (studio, id, patch) =>
    studio.changeDocument(updateCenter(studio.state.document, id, patch), {kind : 'center', id});
// Something shown anew after a choice of what the panels show.
function showChoice(studio, change, library = false) {
  change(studio.state);
  if (library)
    studio.refreshLibrary();
  studio.refreshScene();
  studio.refreshInspector();
}

// On the fish and in its panels, in the order they are tried.
export const FISH_CLICKS = Object.freeze([
  [
    '[data-link-pair]',
    (studio, e) => keep(studio, linkPair(studio.state.document, e.dataset.linkPair))
  ],
  [
    '[data-vision-profile]',
    (studio, e) => showChoice(studio, state => {
      state.visionProfile = e.dataset.visionProfile;
    })
  ],
  [
    '[data-vision-add]',
    studio => {
      const chosen = chosenField(studio);
      if (!chosen)
        return PASS;
      const profile = nextVisionProfile(chosen.organ.field, identifier('profile'));
      studio.state.visionProfile = profile.id;
      studio.editField(chosen.organ.id, {addProfile : profile});
    }
  ],
  [
    '[data-vision-remove]',
    studio => {
      const chosen = chosenField(studio);
      if (!chosen)
        return PASS;
      studio.state.visionProfile = null;
      studio.editField(chosen.organ.id,
                       {removeProfile : chosen.organ.field.profiles.indexOf(chosen.profile)});
    }
  ],
  [ '[data-muscle-function]', moveMuscle ],
  [
    '[data-wire-pairing]',
    (studio, e) => {
      const wire = studio.state.document.wires.find(w => w.id === e.dataset.wirePairing);
      if (!wire?.pairing)
        return PASS;
      const next = PAIRINGS[(PAIRINGS.indexOf(wire.pairing) + 1) % PAIRINGS.length];
      keep(studio, updateWire(studio.state.document, wire.id, {pairing : next}));
    }
  ],
  [ '[data-select-wire]', (studio, e) => studio.select('wire', e.dataset.selectWire) ],
  [
    '[data-select-organ]',
    (studio, e) => studio.select('organ', e.dataset.selectOrgan, null, false)
  ],
  [
    '[data-select-assembly]',
    (studio, e) => studio.select('assembly', e.dataset.selectAssembly, null, false)
  ],
  [
    '[data-center-side]',
    (studio, e) => keepIfRoom(studio, moveCenterToSide(studio.state.document, e.dataset.centerId,
                                                       Number(e.dataset.centerSide),
                                                       studio.state.sites))
  ],
  [ '[data-slot-region]', startSlotWire ],
  [
    '[data-inner-link]',
    (studio, e) => keep(studio, toggleInnerLink(studio.state.document, e.dataset.organId,
                                                e.dataset.innerLink))
  ],
  [
    '[data-region-setting]',
    (studio, e) => keep(studio, updateRegion(studio.state.document, e.dataset.organId,
                                             {[e.dataset.regionSetting] : Number(e.dataset.regionValue)},
                                             studio.state.sites))
  ],
  // A tool opened for a cell group: the group stays chosen.
  [
    '[data-open-tool]',
    (studio, e) => {
      studio.state.selected = {kind : 'center', id : e.dataset.centerId};
      studio.setTool(e.dataset.openTool);
    }
  ],
  [
    '[data-select-center]',
    (studio, e) => {
      if (e.dataset.selectTool)
        studio.setTool(e.dataset.selectTool);
      studio.select('center', e.dataset.selectCenter, null, false);
    }
  ],
  [ ITEM_KINDS.map(kind => '[data-' + kind + ']').join(','), clickItem ],
  [
    REMOVE_KINDS.map(kind => '[data-' + kind + ']').join(','),
    (studio, e) => {
      const marked = markedKind(e, REMOVE_KINDS), kind = marked.slice(marked.indexOf('-') + 1);
      studio.removeSelection({kind, id : e.getAttribute('data-' + marked)});
    }
  ],
  [
    '[data-assemble-selected]',
    studio => {
      const draft = assembleSelection(studio.state.document, studio.state.multi);
      if (draft)
        studio.changeDocument(draft, {kind : 'assembly', id : draft.assemblies.at(-1).id});
    }
  ],
  [
    '[data-clear-multi]',
    studio => showChoice(studio, state => {
      state.multi.clear();
      state.selected = null;
    })
  ],
  [
    '[data-mirror-assembly]',
    (studio, e) => {
      const result =
          mirrorAssembly(studio.state.document, e.dataset.mirrorAssembly, studio.state.sites);
      if (result)
        studio.changeDocument(result.document, {kind : 'assembly', id : result.assemblyId});
    }
  ],
  [
    '[data-remove-assembly]',
    (studio, e) => studio.removeSelection({kind : 'assembly', id : e.dataset.removeAssembly})
  ],
  [
    '[data-set-field]',
    (studio, e) =>
        changeCenter(studio, e.dataset.centerId, {[e.dataset.setField] : Number(e.dataset.value)})
  ],
  [
    '[data-wheel-substance]',
    (studio, e) => {
      if (!studio.state.capabilities)
        return PASS;
      const [q1, q2] = wheelPlace(studio.state.capabilities, Number(e.dataset.wheelSubstance));
      changeCenter(studio, e.dataset.centerId, {q1, q2});
    }
  ],
  [
    '[data-mirror-organ]',
    (studio, e) => {
      const result = mirrorOrgan(studio.state.document, e.dataset.mirrorOrgan, studio.state.sites);
      if (result)
        studio.changeDocument(result.document, {kind : 'organ', id : result.organId});
    }
  ],
  // An organ's kinds of cell: a chip chooses one, another can be added, the chosen one removed.
  [
    '[data-organ-type]',
    (studio, e) => studio.select('center', e.dataset.organType, null, false)
  ],
  [ '[data-add-type]', addType ],
  [
    '[data-remove-type]',
    (studio, e) => studio.changeDocument(
        removeOrganType(studio.state.document, e.dataset.removeType, e.dataset.typeId),
        {kind : 'organ', id : e.dataset.removeType})
  ],
  [
    '[data-probe-scent]',
    (studio, e) => {
      if (!studio.state.senseProbe)
        return PASS;
      studio.state.senseProbe = {...studio.state.senseProbe, scent : Number(e.dataset.probeScent)};
      studio.refreshProbes();
      studio.requestDesign();
    }
  ],
  [
    '[data-add-substance]',
    studio => {
      const doc = addSubstance(studio.state.document, HORMONES.levels);
      if (doc)
        studio.changeDocument(doc, studio.state.selected);
    }
  ],
  [
    '[data-remove-substance]',
    (studio, e) =>
        keep(studio, removeSubstance(studio.state.document, Number(e.dataset.removeSubstance)))
  ],
  [
    '[data-growth-off]',
    studio => keep(studio, updateGrowth(studio.state.document, {active : 0}))
  ],
  [
    '[data-growth-substance]',
    (studio, e) => {
      const doc = studio.state.document;
      keep(studio, updateGrowth(doc, {
             substance : Number(e.dataset.growthSubstance),
             active : 1,
             ...(doc.growth.sensitivity ? {} : GROWTH_START)
           }));
    }
  ],
  [
    '[data-receptor-substance]',
    (studio, e) => {
      const id = e.dataset.centerId;
      studio.changeDocument(
          updateReceptor(studio.state.document, id, Number(e.dataset.receptorEffect),
                         {substance : Number(e.dataset.receptorSubstance), active : 1}),
          {kind : 'center', id});
    }
  ],
  [
    '[data-effect]',
    (studio, e) => showChoice(studio, state => {
      state.effect = Number(e.dataset.effect);
    })
  ],
  [
    '[data-cell-count]',
    (studio, e) =>
        changeCenter(studio, e.dataset.centerId, {copies : Number(e.dataset.cellCount)})
  ],
  [ '[data-save-assembly]', (studio, e) => studio.saveAssembly(e.dataset.saveAssembly) ],
  [
    '[data-ungroup-assembly]',
    (studio, e) =>
        studio.changeDocument(ungroupAssembly(studio.state.document, e.dataset.ungroupAssembly))
  ],
  [ '[data-measure]', studio => studio.measure() ],
  [
    '[data-select-substance]',
    (studio, e) => showChoice(studio, state => {
      state.focusSubstance = Number(e.dataset.selectSubstance);
    }, true)
  ],
  // A click on nothing on the fish chooses nothing and drops a wire begun.
  [
    BODY_MAP,
    studio => {
      studio.pendingWire = null;
      studio.select(null, null);
    }
  ]
]);

// Changes of the fish's form elements. Names are written in place and kept when the field is
// left.
export const FISH_CHANGES = Object.freeze([
  [
    'substanceName',
    (studio, e) => keep(studio, setSubstance(studio.state.document, Number(e.dataset.substanceName),
                                             e.value.trim()))
  ],
  [
    'assemblyName',
    (studio, e) => keep(studio, renameAssembly(studio.state.document, e.dataset.assemblyName,
                                               e.value.trim()))
  ],
  [
    'regionFollow',
    (studio, e) => keep(studio, updateRegion(studio.state.document, e.dataset.regionFollow,
                                             {follow : e.checked}, studio.state.sites))
  ],
  [
    'receptorActive',
    (studio, e) => {
      const id = e.dataset.receptorActive;
      studio.changeDocument(switchReceptor(studio.state.document, id,
                                           Number(e.dataset.receptorEffect), e.checked),
                            {kind : 'center', id});
    }
  ]
]);
