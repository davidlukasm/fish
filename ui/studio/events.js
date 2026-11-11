import {HORMONES} from '../schema.js';
import {keepLayers, switchLayer} from './view/layers.js';
import {ORGAN_BY_KEY, PAIRINGS} from './model/organs.js';
import {nextVisionProfile} from './model/retina.js';
import {findSite, sitePoint} from './model/layout.js';
import {toggleInnerLink, updateRegion} from './model/regions.js';
import {
  addAntagonist,
  addOrganType,
  addSubstance,
  allCenters,
  bentTogether,
  bindReceptor,
  closestSiteDoing,
  findAssembly,
  findCenter,
  findOrgan,
  GROWTH_START,
  identifier,
  linkPair,
  mirrorOrgan,
  moveCenterToSide,
  moveOrgan,
  newDocument,
  nextTypeTuning,
  removeOrganType,
  removeSubstance,
  selectionCenters,
  setBends,
  setFinStroke,
  setSubstance,
  switchReceptor,
  teachOrgan,
  unbindReceptor,
  updateCenter,
  updateCellGrowth,
  updateCellDistribution,
  updateGrowth,
  updateReceptor,
  updateWire,
  usedSites,
  wheelPlace
} from './model/document.js';
import {
  assembleSelection,
  mirrorAssembly,
  renameAssembly,
  ungroupAssembly
} from './model/assemblies.js';
import {BODY_MAP} from './view/scene.js';
import {label} from './view/kit.js';
import {GENOME_FILE_ID} from './view/shell.js';
import {learningTimeOf, timeConstantOf} from '../tuning.js';

const PASS = Symbol('pass');
export function clickOn(studio, event, table) {
  for (const [selector, handle] of table) {
    const element = event.target.closest?.(selector);
    if (element && handle(studio, element, event) !== PASS)
      return true;
  }
  return false;
}
export function changeOn(studio, element, table) {
  const entry = table.find(([ key ]) => element.dataset[key] !== undefined);
  entry?.[1](studio, element);
  return !!entry;
}
export const markedKind = (element, kinds) =>
    kinds.find(kind => element?.hasAttribute('data-' + kind)) ?? null;

const ACTIONS = Object.freeze({
  home : studio => studio.navigate('hub'),
  aquarium : studio => studio.navigate('aquarium'),
  atelier : studio => studio.navigate('studio'),
  breeding : studio => studio.navigate('breeding'),
  trials : studio => studio.navigate('trials'),
  new : studio => studio.loadFish(newDocument(label('app.newFish'))),
  example : studio => studio.example(),
  check : studio => studio.checkCompiler(),
  'cancel-build' : studio => { studio.cancelCompile = true; },
  develop : studio => studio.develop(),
  eggs : studio => studio.placeEggs(),
  download : studio => studio.download(),
  open : studio => studio.root.querySelector('#' + GENOME_FILE_ID)?.click()
});

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

export const STUDIO_CLICKS = Object.freeze([
  ['[data-trace-source]',(studio,e)=>studio.setTraceSource(e.dataset.traceSource)],
  [ '[data-tool]', (studio, e) => studio.setTool(e.dataset.tool) ],
  [ '[data-act-kind="wiring"]', (studio, e) => studio.armWiring(e.dataset.actValue) ],
  [ '[data-act-kind="stimulus"]', (studio, e) => studio.placeStimulus(e.dataset.actValue) ],
  [ '[data-history]', (studio, e) => studio.stepHistory(e.dataset.history) ],
  [ '[data-zoom]', (studio, e) => studio.zoom(e.dataset.zoom) ],
  [
    '[data-contacts]',
    (studio, e) => {
      const state = studio.state;
      if (e.dataset.contacts === 'actual' && (state.stale || !state.report))
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
  ],
  [
    '[data-layer]',
    (studio, e) => {
      studio.state.layers = switchLayer(studio.state, e.dataset.layer);
      keepLayers(studio.state.layers);
      studio.renderShell();
    }
  ]
]);

function chosenField(studio) {
  const organ = findOrgan(studio.state.document, studio.state.selected?.id);
  if (!organ?.field)
    return null;
  const profiles = organ.field.profiles;
  return {organ, profile : profiles.find(p => p.id === studio.state.visionProfile) ?? profiles[0]};
}
const keep = (studio, doc) => studio.changeDocument(doc, studio.state.selected);
const keepIfRoom = (studio, doc) => doc ? keep(studio, doc) : studio.notice(label('status.noRoom'));
const ITEM_KINDS = Object.freeze([ 'contact', 'generated', 'wire', 'center', 'assembly', 'organ' ]);
const REMOVE_KINDS = Object.freeze([ 'remove-organ', 'remove-center', 'remove-wire' ]);

function clickItem(studio, element, event) {
  const kind = markedKind(element, ITEM_KINDS), id = element.dataset[kind];
  const doc = studio.state.document, tool = studio.state.tool;
  if (kind === 'generated') {
    studio.select(kind, id, event, false);
    if (tool === 'stimulate')
      studio.stimulate([ id ]);
    return;
  }
  if (tool === 'erase')
    return studio.removeSelection({kind, id});
  if (tool === 'wire' && [ 'organ', 'center', 'assembly' ].includes(kind))
    return wireItem(studio, kind, id);
  if (tool === 'stimulate') {
    if ([ 'organ', 'center', 'assembly' ].includes(kind))
      studio.select(kind, id, event, false);
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
  if (kind === 'organ' && ORGAN_BY_KEY[findOrgan(studio.state.document, id)?.type]?.namedPorts) {
    studio.state.selected = item;
    studio.refreshViews();
    studio.notice(label('status.choosePort'));
    return;
  }
  studio.pendingWire = null;
  if (to && to.id !== id) {
    if (studio.connectSelections(item, to))
      return studio.notice(label('status.wired'));
  } else if (from) {
    if ((from.kind !== kind || from.id !== id) && studio.connectSelections(from, item))
      return studio.notice(label('status.wired'));
  } else if (selectionCenters(studio.state.document, item).length) {
    studio.pendingWire = {from : item};
    studio.state.selected = item;
  }
  studio.refreshViews();
}
function startSlotWire(studio, element) {
  const region = element.dataset.slotRegion, out = element.dataset.slotDir === 'out';
  const slot = {kind : 'slot', id : region, slot : element.dataset.slotKey};
  if (!selectionCenters(studio.state.document, slot).length)
    return;
  const other = out ? studio.pendingWire?.to : studio.pendingWire?.from;
  studio.setTool('wire');
  if (other && other.id !== region &&
      studio.connectSelections(out ? slot : other, out ? other : slot))
    return studio.notice(label('status.wired'));
  studio.pendingWire = out ? {from : slot} : {to : slot};
  studio.state.selected = {kind : 'organ', id : region};
  studio.refreshViews();
  studio.notice(label(out ? 'status.slotOut' : 'status.slotIn'));
}
function moveMuscle(studio, element) {
  const doc = studio.state.document, sites = studio.state.sites;
  const found = findCenter(doc, element.dataset.centerId);
  const here = findSite(sites, found?.center.site);
  const target = here && closestSiteDoing(found.center, Number(element.dataset.muscleFunction),
                                          sites, usedSites(doc), sitePoint(here), here.side);
  keepIfRoom(studio, target && moveOrgan(doc, found.organ.id, sites, sitePoint(target)));
}
function addType(studio, element) {
  const doc = studio.state.document, organ = findOrgan(doc, element.dataset.addType);
  const added = organ && addOrganType(doc, organ.id, studio.state.sites,
                                      nextTypeTuning(organ, studio.state.capabilities));
  if (!added)
    return studio.notice(label('status.noRoom'));
  const first = findOrgan(added.document, organ.id).centers.find(c => c.profile === added.typeId);
  studio.changeDocument(added.document, {kind : 'center', id : first.id});
}
const changeCenter = (studio, id, patch) =>
    studio.changeDocument(updateCenter(studio.state.document, id, patch), {kind : 'center', id});
function showChoice(studio, change, library = false) {
  change(studio.state);
  if (library)
    studio.refreshLibrary();
  studio.refreshViews();
}

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
    '[data-vision-polarity]',
    (studio, e) => {
      const chosen = chosenField(studio);
      if (!chosen)
        return PASS;
      const polarity = Number(e.dataset.visionPolarity);
      studio.editField(chosen.organ.id, {profile : {id : chosen.profile.id, polarity}});
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
      const next = e.dataset.pairingValue ??
                   PAIRINGS[(PAIRINGS.indexOf(wire.pairing) + 1) % PAIRINGS.length];
      if (!PAIRINGS.includes(next) || next === wire.pairing)
        return PASS;
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
    '[data-response-cell]',
    (studio, e) => {
      const key = e.dataset.responseProperty;
      if (['q1', 'q2', 'sign'].includes(key))
        keep(studio, updateCenter(studio.state.document, e.dataset.responseCell,
                                  {[key] : Number(e.dataset.responseValue)}));
    }
  ],
  [
    '[data-inner-link]',
    (studio, e) => keep(studio, toggleInnerLink(studio.state.document, e.dataset.organId,
                                                e.dataset.innerLink))
  ],
  [
    '[data-fin-antagonist]',
    (studio, e) => keepIfRoom(studio, addAntagonist(studio.state.document, e.dataset.finAntagonist,
                                                    studio.state.sites)?.document)
  ],
  [
    '[data-fin-stroke]',
    (studio, e) => keep(studio, setFinStroke(studio.state.document, e.dataset.organId,
                                             Number(e.dataset.finStroke), studio.state.sites))
  ],
  [
    '[data-region-setting]',
    (studio, e) => keep(studio, updateRegion(studio.state.document, e.dataset.organId,
                                             {[e.dataset.regionSetting] : Number(e.dataset.regionValue)},
                                             studio.state.sites))
  ],
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
    '[data-unbend-wire]',
    (studio, e) => studio.changeDocument(
        setBends(studio.state.document, bentTogether(studio.state.document, e.dataset.unbendWire),
                 []),
        studio.state.selected)
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
    '[data-dose-steepness]',
    (studio, e) => {
      const target = e.closest('[data-dose]')?.dataset.dose;
      if (!target)
        return PASS;
      const cut = target.lastIndexOf(':');
      keep(studio, updateReceptor(studio.state.document, target.slice(0, cut),
                                  Number(target.slice(cut + 1)),
                                  {steepness : Number(e.dataset.doseSteepness)}));
    }
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
      if (!doc)
        return;
      // The new substance opens to be named; in the hormone tool its inspector replaces a cell's.
      studio.state.focusSubstance = doc.substances.at(-1).index;
      studio.changeDocument(doc, studio.state.tool === 'hormone' ? null : studio.state.selected);
    }
  ],
  [
    '[data-define-substance]',
    (studio, e) => {
      const index = Number(e.dataset.defineSubstance);
      const doc = addSubstance(studio.state.document, HORMONES.levels, index);
      if (!doc)
        return;
      studio.state.focusSubstance = index;
      studio.changeDocument(doc, null);
      studio.setTool('hormone');
    }
  ],
  [
    '[data-remove-substance]',
    (studio, e) =>
        keep(studio, removeSubstance(studio.state.document, Number(e.dataset.removeSubstance),
                                     studio.state.capabilities))
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
    '[data-region-teacher]',
    (studio, e) => {
      const value = e.dataset.teacherValue;
      keep(studio, teachOrgan(studio.state.document, e.dataset.regionTeacher,
                              value === 'off' ? null : Number(value)));
    }
  ],
  [
    '[data-learn-substance]',
    (studio, e) => {
      const id = e.dataset.centerId, effect = Number(e.dataset.learnEffect);
      const value = e.dataset.learnSubstance, doc = studio.state.document;
      studio.changeDocument(value === 'off' ? unbindReceptor(doc, id, effect)
                                            : bindReceptor(doc, id, effect, Number(value)),
                            {kind : 'center', id});
    }
  ],
  [
    '[data-receptor-substance]',
    (studio, e) => {
      const id = e.dataset.centerId;
      studio.changeDocument(bindReceptor(studio.state.document, id,
                                         Number(e.dataset.receptorEffect),
                                         Number(e.dataset.receptorSubstance)),
                            {kind : 'center', id});
    }
  ],
  [
    '[data-effect]',
    (studio, e) => showChoice(studio, state => {
      state.effect = Number(e.dataset.effect);
    })
  ],
  [ '[data-save-assembly]', (studio, e) => studio.saveAssembly(e.dataset.saveAssembly) ],
  [ '[data-delete-module]', (studio, e) => studio.deleteModule(e.dataset.deleteModule) ],
  [
    '[data-ungroup-assembly]',
    (studio, e) =>
        studio.changeDocument(ungroupAssembly(studio.state.document, e.dataset.ungroupAssembly))
  ],
  [
    '[data-select-substance]',
    (studio, e) => showChoice(studio, state => {
      state.focusSubstance = Number(e.dataset.selectSubstance);
      if (state.tool === 'hormone')
        state.selected = null;
    }, true)
  ],
  [
    BODY_MAP,
    studio => {
      studio.pendingWire = null;
      studio.select(null, null);
    }
  ]
]);

export const FISH_CHANGES = Object.freeze([
  [ 'startFish', (studio, e) => {
    if (e.value)
      studio.startFish(e.value);
    e.value = '';
  } ],
  [ 'contactLimit', (studio, e) => {
    studio.state.contactLimit = Number(e.value);
    studio.refreshScene();
  } ],
  [ 'receptorField', (studio, e) => {
    const patch = {};
    patch[e.dataset.receptorKey] = Number(e.value);
    keep(studio, updateReceptor(studio.state.document, e.dataset.receptorField, Number(e.dataset.receptorEffect), patch));
  } ],
  [ 'bodyGrowth', (studio, e) => {
    const patch = {};
    patch[e.dataset.bodyGrowth] = Number(e.value);
    keep(studio, updateGrowth(studio.state.document, patch));
  } ],
  [ 'cellGrowthActive', (studio, e) => keep(studio, updateCellGrowth(studio.state.document, e.dataset.cellGrowthActive, {active : e.checked ? 1 : 0})) ],
  [ 'cellGrowth', (studio, e) => {
    const patch = {};
    patch[e.dataset.growthKey] = Number(e.value);
    keep(studio, updateCellGrowth(studio.state.document, e.dataset.cellGrowth, patch));
  } ],
  [ 'cellTrait', (studio, e) => {
    const key = e.dataset.traitKey, entered = Number(e.value), neural = studio.state.capabilities.neural;
    const value = key === 'tau' ? timeConstantOf(entered) : key === 'learning_tau' ? learningTimeOf(entered)
        : key === 'field' ? Math.log(Math.max(neural.slotMin, entered) / neural.slotMin) / Math.log(neural.slotSpan) : key === 'range' ? (entered-studio.state.capabilities.reachLeast)/(1-studio.state.capabilities.reachLeast) : entered;
    const patch = {};
    patch[key] = value;
    keep(studio, updateCenter(studio.state.document, e.dataset.cellTrait, patch));
  } ],
  [ 'cellDistribution', (studio, e) => keep(studio, updateCellDistribution(studio.state.document, e.dataset.cellDistribution, e.dataset.distributionKey, Number(e.value))) ],
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
