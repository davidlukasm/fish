import {newFishDocument} from './canvas_placement.js';
import {HORMONES, MOTOR_KIND} from '../schema.js';
import {keepLayers, switchLayer} from './view/layers.js';
import {ORGAN_BY_KEY, PAIRINGS, organFunction} from './model/organs.js';
import {nextVisionProfile} from './model/retina.js';
import {findSite, sitePoint} from './model/layout.js';
import {toggleInnerLink, updateRegion, routedLinks} from './model/regions.js';
import {
  addAntagonist,
  addOrgan,
  addOrganType,
  addSubstance,
  addWire,
  allCenters,
  bentTogether,
  bundleWires,
  unbundleWires,
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
  nextTypeTuning,
  removeOrganType,
  removeWire,
  removeSubstance,
  selectionCenters,
  setBends,
  setFinStroke,
  setMuscleFibre,
  setSubstance,
  switchReceptor,
  teachOrgan,
  unbindReceptor,
  updateCenter,
  updateCellGrowth,
  updateGrowth,
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
  new : studio => studio.loadFish(newFishDocument(label('app.newFish'), studio.state.sites)),
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
  [ '[data-drag-kind]', (studio, e) => studio.pickUp(e.dataset.dragKind, e.dataset.dragValue) ],
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
  if (kind === 'wire' && (event.shiftKey || event.ctrlKey || event.metaKey) &&
      element.dataset.wires) {
    const picked = element.dataset.wires.split(' '), multi = studio.state.multi;
    if (studio.state.selected?.kind !== 'wire')
      multi.clear();
    else if (!multi.size)
      multi.add(studio.state.selected.id);
    const remove = picked.every(id => multi.has(id));
    for (const id of picked)
      if (remove)
        multi.delete(id);
      else
        multi.add(id);
    const last = [...multi ].at(-1);
    studio.state.selected = last ? {kind : 'wire', id : last} : null;
    studio.refreshViews();
    return;
  }
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
  ['[data-circuit-edit]', (studio,e)=>{
    studio.state.circuitEditing=studio.state.circuitEditing===e.dataset.circuitEdit?null:e.dataset.circuitEdit;
    studio.state.circuitFrom=null;
    studio.refreshInspector();
  }],
  ['[data-circuit-node]', (studio,e)=>{
    const id=e.dataset.circuitNode, region=e.dataset.circuitRegion;
    if(studio.state.circuitEditing!==region) return studio.select('center',id,null,false);
    const from=studio.state.circuitFrom;
    if(!from || from===id) {
      studio.state.circuitFrom=from===id?null:id;
      return studio.refreshInspector();
    }
    const existing=routedLinks(studio.state.document,studio.state.sites,true).find(l=>l.from===from&&l.to===id);
    if(existing) {
      studio.state.circuitFrom=null;
      if(existing.cut) studio.changeDocument(toggleInnerLink(studio.state.document,region,existing.key),{kind:'organ',id:region});
      else studio.refreshInspector();
      return;
    }
    const result=addWire(studio.state.document,from,id,null,studio.state.sites);
    studio.state.circuitFrom=null;
    if(result) studio.changeDocument(result.document,{kind:'organ',id:region});
    else studio.refreshInspector();
  }],
  ['[data-circuit-wire]',(studio,e)=>keep(studio,removeWire(studio.state.document,e.dataset.circuitWire))],
  ['[data-head-control]', (studio,e)=>{
    const jaw=e.dataset.headControl==='jaw', code=jaw?MOTOR_KIND.aggression:MOTOR_KIND.suction;
    const {document:doc,sites}=studio.state;
    const existing=doc.organs.find(o=>o.type==='muscle'&&organFunction(o,sites)===code);
    if(existing) return studio.select('organ',existing.id,null,false);
    const placed=addOrgan(doc,'muscle',sites,{x:jaw?195:275,y:330},Infinity,true,code);
    if(placed) studio.changeDocument(placed.document,{kind:'organ',id:placed.organId});
  }],
  ['[data-placement-side]', (studio, e) => {
    studio.state.placementSide = e.dataset.placementSide;
    studio.refreshLibrary();
    studio.clearPreview();
    studio.restorePlacement();
  }],
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
      if (['q1', 'q2', 'sign', 'mode'].includes(key))
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
    (studio, e) => {
      // The new antagonist is selected, so its stroke shows at once.
      const added = addAntagonist(studio.state.document, e.dataset.finAntagonist, studio.state.sites);
      if (!added)
        return studio.notice(label('status.noRoom'));
      studio.changeDocument(added.document, {kind : 'organ', id : added.organId});
    }
  ],
  [
    '[data-fin-stroke]',
    (studio, e) => keep(studio, setFinStroke(studio.state.document, e.dataset.organId,
                                             Number(e.dataset.finStroke), studio.state.sites))
  ],
  [
    '[data-fibre-type]',
    (studio, e) => keep(studio, setMuscleFibre(studio.state.document, e.dataset.organId,
                                               Number(e.dataset.fibreType)))
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
    '[data-bundle-wires]',
    studio => {
      const draft=bundleWires(studio.state.document,studio.state.multi);
      if(draft) studio.changeDocument(draft,studio.state.selected);
    }
  ],
  [
    '[data-unbundle-wires]',
    (studio,e)=>keep(studio,unbundleWires(studio.state.document,e.dataset.unbundleWires))
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
  [ '[data-copy-cell]', (studio, e) => keep(studio,
      updateCenter(studio.state.document, e.dataset.copyCell, {copies : Number(e.dataset.copyCount)})) ],
  [ '[data-development-effect]', (studio, e) => showChoice(studio, state => {
      state.developmentEffect = e.dataset.developmentEffect === 'birth' ? 'birth' : Number(e.dataset.developmentEffect);
  }) ],
  [ '[data-birth-substance]', (studio, e) => keep(studio,
      updateCellGrowth(studio.state.document, e.dataset.centerId, {active : 1, substance : Number(e.dataset.birthSubstance)})) ],
  [ '[data-growth-substance]', (studio, e) => keep(studio,
      updateGrowth(studio.state.document, {active : 1, substance : Number(e.dataset.growthSubstance)})) ],
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
  [ 'cellGrowthActive', (studio, e) => keep(studio, updateCellGrowth(studio.state.document, e.dataset.cellGrowthActive, {active : e.checked ? 1 : 0})) ],
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
