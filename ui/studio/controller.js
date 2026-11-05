import {compilerPanel, acceptedGenome} from './view/compiler.js';
import {
  sensitivityEditor,
  spectrumEditor,
  nearAnswers,
  testLightMarkup,
  visionDragPatch,
  visionFan
} from './view/vision.js';
import {spectrumPatch} from './view/spectrum.js';
import {adaptationSteps, sensitivityStimulus} from './view/sensitivity.js';
import {drivePatch} from './view/drive.js';
import {
  SPINE_RING,
  effectorGraphic,
  effectorPatch,
  gutGraphic,
  spineField
} from './view/effectors.js';
import {wrapAngle} from '../units.js';
import {LATERAL_FIELD, lateralField} from './view/lateral.js';
import {defaultSight, sightScene} from './model/sight.js';
import {probeFor, senseScene} from './model/probe.js';
import {probeField, probePatch} from './view/probes.js';
import {scentMap, scentMapTuning, scentMapWidth} from './view/scents.js';
import {eyeSight} from '../organ_readout.js';
import {drawOrganGraphic} from '../organ_graphics.js';
import {SENSE_TISSUE} from '../tissue.js';
import {MOTOR_KIND, RECEPTOR, TIME_CONSTANT, TUNING} from '../schema.js';
import {activationQuality, thresholdQualityShift} from '../tuning.js';
import {planOfUnit, unitOfPlan} from './model/retina.js';
import {PAIRINGS, PRESSURE_OF, ROLE, eligible, functionFor} from './model/organs.js';
import {fieldPlacements, hasField, newFieldPlacements} from './model/placement.js';
import {beginEggPlacement} from '../world.js';
import {ATELIER_LIMITS, HORMONE_EFFECT, HORMONES, ROUTE} from '../schema.js';
import {request as sessionRequest, serverText} from '../session.js';
import {t} from '../strings.js';
import {
  addNeuron,
  addOrgan,
  updateField,
  linkPair,
  addSubstance,
  addWire,
  allCenters,
  assemble,
  closestSite,
  compileDocument,
  compilerOptions,
  connectSelections,
  endpointCenters,
  findCenter,
  findOrgan,
  identifier,
  mirrorAssembly,
  mirrorOrgan,
  moveAssembly,
  removeAssembly,
  renameAssembly,
  moveCenter,
  moveOrgan,
  newDocument,
  pairEndpoint,
  placeModule,
  moveCenterToSide,
  placeStoredModule,
  removeCenter,
  removeOrgan,
  removeSubstance,
  removeWire,
  selectionCenters,
  setLifePhase,
  setOrganNodes,
  placeNode,
  nodeSitesNear,
  setMuscleTrait,
  setSubstance,
  updateCenter,
  updateGrowth,
  updateReceptor,
  updateWire,
  wiredCrossing,
  wholeEndpoint,
  validateDocument,
  wheelPlace
} from './model/document.js';
import {BODY_FRAME, SNAP_DISTANCE, nearFish, pointDistance, sitePoint} from './model/layout.js';
import {CAMERA_HOME, CAMERA_ZOOM, cameraBox, cameraCoordinates, cameraScale} from './view/frame.js';
import {
  assemblyPreview,
  choiceSeats,
  choicesSvg,
  fishScene,
  organPreview,
  placementPreview,
  placementHints,
  hintLegend,
  arrowSize,
  moduleName,
  signalLinks
} from './view/scene.js';
import {escapeText} from './view/markup.js';
import {nodeLocation, regionSpot} from './view/body.js';
import {
  GROWTH,
  LEARNING_PAD,
  WHEEL,
  wheelTrackWidth,
  measureReading,
  inspector,
  hormoneLibrary,
  library,
  pigmentSpectrum,
  receptorCurvePatch,
  sensorAdaptation,
  sensorAnswer,
  phasePatch,
  stretchPatch,
  toolPalette
} from './view/panels.js';

// A new growth receptor lets the body grow at full pace once even a little of its hormone is
// present.
const GROWTH_SENSITIVITY = 1, GROWTH_HALF = .01;
// What the hormone tool's library lets you drag: effects and life phases onto organs and nodes,
// glands and a blood sense into the fish as the organs they are.
const DROP_ON_PARTS = Object.freeze([ 'effect', 'phase' ]);
const ORGAN_FROM_CARD = Object.freeze(
    {gland : {kind : 'organ', value : 'gland'}, reserve : {kind : 'organ', value : 'blood'}});
// A receptor an effect is dropped onto starts this strong, binding at this level, unless it was
// tuned before: most effects rise with the substance, output falls (it starts full), cells die
// only above half.
const DROPPED_RECEPTOR = Object.freeze({
  [HORMONE_EFFECT.excitation] : {sensitivity : .5, half : .1},
  [HORMONE_EFFECT.learning] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.competition] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.eligibility] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.rhythm] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.output] : {baseline : 1, sensitivity : -2, half : .1},
  [HORMONE_EFFECT.death] : {sensitivity : 1, half : .5}
});
// Where a dropped life phase starts or ends on the body's maturity.
const PHASE_DROPPED = Object.freeze({start : .3, end : .9});
// The example fish learns at full rate once its food substance reaches REWARD_HALF.
const REWARD_SENSITIVITY = 1, REWARD_HALF = .1;
// Food teaches it this strongly, as the excitation it brings.
const REWARD_TEACHING = .5;
// A receptor switched on that answered nothing yet answers with RECEPTOR_ONSET.
const RECEPTOR_ONSET = 1;
// A measurement doses MEASURE_LEVEL of a substance into the grown fish (maturity MEASURE_MATURITY).
const MEASURE_LEVEL = .5, MEASURE_MATURITY = 1;
import {DEFAULT_CPPN_NODE_TYPE, cppnGraph, cppnInspector, cppnToolbar} from './view/graph.js';
import {SIGNAL, createSignalPlayer, signalSchedule} from './view/pulse.js';
import {routedLinks, settleRegions, toggleInnerLink, updateRegion} from './model/regions.js';

const API = ROUTE.atelier;
const label = key => t('studio.' + key);
const requestBody = (operation, extra = {}) => ({operation, ...extra});
const PRESSURE_TRIES = 12;
let instance = null;
// The library and the inspector beside the scene are as wide as the viewer pulls them, within
// these bounds, and stay so in this browser.
const PANEL_WIDTH = Object.freeze({library : [ 150, 380 ], inspector : [ 280, 680 ]});
const PANEL_STORE = 'aid.atelier.panels';
function storedPanels() {
  try {
    const stored = JSON.parse(localStorage.getItem(PANEL_STORE) ?? '{}');
    return Object.fromEntries(Object.keys(PANEL_WIDTH)
                                  .filter(key => Number.isFinite(stored[key]))
                                  .map(key => [key, stored[key]]));
  } catch {
    return {};
  }
}
const panelStyle = panels =>
    Object.entries(panels).map(([ key, width ]) => `--aid-${key}:${width}px`).join(';');

export class OrganStudio {
  constructor(root) {
    this.root = root;
    this.state = {
      station : 'hub',
      mode : 'fish',
      tool : 'select',
      wireScope : 'all',
      contactView : 'design',
      document : newDocument(label('app.newFish')),
      sites : [],
      capabilities : null,
      selected : null,
      multi : new Set(),
      camera : {zoom : 1, ...CAMERA_HOME},
      userModules : [],
      effect : 0,
      focusSubstance : 0,
      measureLevel : MEASURE_LEVEL,
      measurement : null,
      // The test light in front of the eyes: side, bearing, distance, radius, hue.
      sightProbe : null,
      // The test stimulus of the selected nose, touch, pain or lateral organ: its organ, kind,
      // side, bearing, distance, strength and scent.
      senseProbe : null,
      visionProfile : null,
      panels : storedPanels(),
      // The engine's view of the design (cells, light-cell curves, what the eyes see) and, while
      // a field organ is placed, the places it can take; report is the developed fish.
      anatomy : null,
      choices : null,
      report : null,
      genome : '',
      cppnScope : 'all',
      cppnSelection : null,
      cppnConnectFrom : null,
      busy : false,
      stale : true,
      notice : '',
      canUndo : false,
      canRedo : false
    };
    this.pointer = null;
    this.dragging = null;
    this.persistTimer = null;
    this.pulsePlayer = null;
    this.wireStartId = null;
    this.wireEndId = null;
    this.wireStartKind = 'center';
    this.ignoreClickUntil = 0;
    this.controlPointer = null;
    this.spectrumControl = null;
    this.sensitivityControl = null;
    this.adaptationControl = null;
    this.driveControl = null;
    this.receptorControl = null;
    this.visionControl = null;
    this.probeControl = null;
    this.undoHistory = [];
    this.redoHistory = [];
    this.historyBatch = null;
    this.designRunning = false;
    this.designPending = false;
    this.choiceFrame = 0;
    this.choicePoint = null;
    this.shownChoice = null;
  }
  async api(body, timeout = 35000) {
    const response = await sessionRequest(API, {
      method : 'POST',
      headers : {'Content-Type' : 'application/json', 'X-Fish-Token' : window.FISH_TOKEN},
      body : JSON.stringify(body)
    },
                                          timeout);
    const payload = await response.json();
    if (!response.ok || !payload.ok)
      throw new Error(typeof payload.error === 'string' ? payload.error
                      : payload.error?.key
                          ? (payload.error.key.startsWith('studio.') ? t(payload.error.key)
                                                                     : serverText(payload.error))
                          : label('errors.server'));
    return payload.result;
  }
  initialize() {
    this.root.addEventListener('click', event => this.click(event));
    this.root.addEventListener('change', event => this.change(event));
    this.root.addEventListener('input', event => this.input(event));
    this.root.addEventListener('dragstart', event => this.dragStart(event));
    this.root.addEventListener('dragover', event => this.dragOver(event));
    this.root.addEventListener('drop', event => this.drop(event));
    this.root.addEventListener('dragend', () => {
      this.dragging = null;
      this.clearPreview();
      this.cancelChoices();
    });
    this.root.addEventListener('pointerdown', event => this.pointerDown(event));
    window.addEventListener('pointermove', event => this.pointerMove(event));
    window.addEventListener('pointerup', event => this.pointerUp(event));
    this.root.addEventListener('wheel', event => this.wheel(event), {passive : false});
    document.getElementById('open-station-hub')
        ?.addEventListener('click', () => this.navigate('hub'));
    document.addEventListener('keydown', event => this.keydown(event));
    this.renderShell();
    this.bootstrap();
  }
  async bootstrap() {
    try {
      const results = await Promise.all([
        this.api(requestBody('sites')), this.api(requestBody('load-draft')),
        this.api(requestBody('list-modules'))
      ]);
      this.state.capabilities = results[0];
      this.state.sites = results[0].sites;
      this.state.userModules = results[2]?.modules ?? [];
      // A draft the Atelier can no longer read gives way to a new fish, and says so.
      if (results[1]?.document)
        try {
          this.state.document =
              validateDocument(settleRegions(results[1].document, this.state.sites));
        } catch {
          this.notice(label('status.draftOutdated'));
        }
      this.renderShell();
      this.requestDesign();
    } catch (error) {
      this.notice(error.message);
    }
  }
  notice(value) {
    this.state.notice = value.startsWith?.('studio.') ? t(value) : value;
    const footer = this.root.querySelector('.aid-message');
    if (footer)
      footer.textContent = this.state.notice;
  }
  navigate(station) {
    if (station !== 'studio')
      this.stopPulse();
    this.state.station = station;
    this.root.hidden = station === 'aquarium';
    document.body.dataset.station = station;
    if (station !== 'aquarium')
      this.renderShell();
  }
  setMode(mode) {
    if (this.state.mode === mode)
      return;
    this.state.mode = mode;
    this.renderShell();
  }
  setTool(tool) {
    this.wireStartId = null;
    this.wireEndId = null;
    this.wireStartKind = 'center';
    this.state.tool = tool;
    if (tool === 'wire')
      this.clearStimulus();
    if (tool === 'wire' && this.state.contactView !== 'design') {
      this.state.contactView = 'design';
      for (const button of this.root.querySelectorAll('[data-contacts]'))
        button.classList.toggle('active', button.dataset.contacts === 'design');
    }
    if (tool === 'learn' && ![HORMONE_EFFECT.excitation, HORMONE_EFFECT.learning,
                              HORMONE_EFFECT.eligibility, HORMONE_EFFECT.competition]
                                 .includes(this.state.effect))
      this.state.effect = HORMONE_EFFECT.learning;
    this.clearPreview();
    this.refreshTools();
    this.refreshLibrary();
    this.refreshScene();
    this.refreshInspector();
  }
  // The library offers organs to place, or with the hormone tool the substances and what they do.
  refreshLibrary() {
    const scroll = this.root.querySelector('.aid-library-scroll');
    if (!scroll || this.state.mode !== 'fish')
      return;
    const hormones = this.state.tool === 'hormone';
    // The substance cards need more room than the organ tiles.
    this.root.querySelector('.aid-workspace-main')?.classList.toggle('hormones', hormones);
    if (!hormones && scroll.dataset.library !== 'hormones')
      return;
    scroll.innerHTML = hormones ? hormoneLibrary(this.state) : library(this.state);
    scroll.dataset.library = hormones ? 'hormones' : 'organs';
  }
  wirePoint(selection) {
    const points =
        selectionCenters(this.state.document, selection)
            .map(id => {
              const found = findCenter(this.state.document, id);
              const site = this.state.sites.find(candidate => candidate.id === found?.center.site);
              return site ? nodeLocation(this.state.document, this.state.sites, found.center,
                                         found.organ.type)
                          : null;
            })
            .filter(Boolean);
    if (!points.length)
      return null;
    return {
      x : points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y : points.reduce((sum, point) => sum + point.y, 0) / points.length
    };
  }
  connectSelections(source, target) {
    const result = connectSelections(this.state.document, source, target);
    if (result)
      this.changeDocument(result.document, {kind : 'wire', id : result.wireId});
    else
      this.notice(label('status.wireCovered'));
    return result;
  }
  renderShell() {
    const s = this.state;
    this.root.hidden = s.station === 'aquarium';
    document.body.dataset.station = s.station;
    if (s.station === 'aquarium')
      return;
    if (s.station === 'hub') {
      this.root.innerHTML =
          '<div class="aid-hub"><header class="aid-header">' +
          '<div class="aid-header-brand"><div><small>AID / V019</small><h1>' +
          label('app.hubTitle') + '</h1></div></div><div class="aid-status">' +
          label('app.hubStatistics') + '</div></header>' +
          '<main class="aid-hub-content"><small>' + label('app.hubStation') + '</small>' +
          '<h2>' + label('app.hubTitle') + '</h2>' +
          '<div class="aid-hub-grid"><button class="aid-hub-tile active" data-action="aquarium">' +
          '<strong>' + label('app.hubAquarium') + '</strong>' +
          '<span>' + label('app.hubStatistics') + '</span></button>' +
          '<button class="aid-hub-tile active" data-action="atelier">' +
          '<strong>' + label('app.hubAtelier') + '</strong>' +
          '<span>' + label('app.hubStart') + '</span></button></div></main>' +
          '<footer class="aid-station-footer"><span class="aid-message">' +
          label('status.waiting') + '</span><span>FISH / AID</span></footer></div>';
      return;
    }
    const cppn = s.mode === 'cppn';
    this.root.innerHTML =
        '<div class="aid-station"><header class="aid-header">' +
        '<div class="aid-header-brand"><button data-action="home">← ' + label('app.home') +
        '</button><div><small>AID / WERKSTATT 02</small>' +
        '<h1>' + label('app.title') + '</h1></div></div>' +
        '<div class="aid-status">' + escapeText(this.cellStatus()) + '</div>' +
        // The plan's file actions together; then the way from plan to aquarium.
        '<div class="aid-header-actions"><div class="aid-button-group" role="group" aria-label="' +
        label('app.groupPlan') + '"><button data-action="new">' + label('app.newFish') +
        '</button><button data-action="example">' + label('app.example') + '</button>' +
        '<button data-action="open">' + label('app.open') + '</button>' +
        '<button data-action="download"' + (!acceptedGenome(s) ? ' disabled' : '') + '>' +
        label('app.saveGenome') + '</button></div>' +
        '<div class="aid-button-group flow" role="group" aria-label="' + label('app.groupFish') +
        '"><button data-action="develop" class="primary"' + (s.busy ? ' disabled' : '') + '>' +
        (s.busy ? label('app.developBusy') : label('app.develop')) + '</button>' +
        '<button data-action="eggs"' +
        (!acceptedGenome(s) || !s.report?.viable ? ' disabled' : '') + '>' +
        label('app.placeEggs') + '</button></div></div>' +
        '<input type="file" id="aid-genome-file" accept=".genome,text/plain" hidden/></header>' +
        '<nav class="aid-modes"><button data-mode="fish" class="' + (!cppn ? 'active' : '') + '">' +
        label('app.modeFish') + '</button>' +
        '<button data-mode="cppn" class="' + (cppn ? 'active' : '') + '">' + label('app.modeCppn') +
        '</button>' + compilerPanel(s) + '</nav>' +
        '<div class="aid-workspace-main' + (s.tool === 'hormone' && !cppn ? ' hormones' : '') +
        '" style="' + panelStyle(s.panels) + '">' +
        '<div class="aid-library"><div class="aid-panel-grip" data-panel-grip="library" title="' +
        label('app.panelWidth') + '"></div><div class="aid-library-scroll" data-library="' +
        (s.tool === 'hormone' ? 'hormones' : 'organs') + '">' +
        (cppn                   ? '<h3>' + label('cppn.graph') + '</h3>' + cppnToolbar(s)
         : s.tool === 'hormone' ? hormoneLibrary(s)
                                : library(s)) +
        '</div></div><section class="aid-stage">' +
        (cppn ? '<div class="aid-scene-top"><span>' + label('cppn.graph') + '</span></div>' +
                    '<div id="aid-cppn-scene" class="aid-scene-body">' + cppnGraph(s) + '</div>'
              : '<div class="aid-scene-top"><span>' + label('app.empty') +
                    '</span><div class="aid-view-options"><div class="aid-button-group">' +
                    '<button data-contacts="design" class="' +
                    (s.contactView === 'design' ? 'active' : '') + '">' +
                    label('tools.drawnContacts') + '</button>' +
                    '<button data-contacts="actual" class="' +
                    (s.contactView === 'actual' ? 'active' : '') + '"' +
                    (s.stale || !s.report?.contacts?.length ? ' disabled' : '') + '>' +
                    label('tools.developedContacts') +
                    '</button></div><div class="aid-button-group">' +
                    '<button data-network="all" class="' + (s.wireScope === 'all' ? 'active' : '') +
                    '">' + label('tools.allNetworks') + '</button>' +
                    '<button data-network="focus" class="' +
                    (s.wireScope === 'focus' ? 'active' : '') + '">' +
                    label('tools.focusedNetwork') + '</button></div></div></div>' +
                    '<div class="aid-scene-body"><div class="aid-scene-frame">' + fishScene(s) +
                    '</div>' + toolPalette(s) + '<span class="aid-canvas-toolbar">' +
                    Math.round(s.camera.zoom * 100) + '%</span></div>' +
                    '') +
        '</section><div class="aid-inspector"><div class="aid-panel-grip" ' +
        'data-panel-grip="inspector" title="' + label('app.panelWidth') + '"></div>' +
        '<div class="aid-inspector-scroll">' + (cppn ? cppnInspector(s) : inspector(s)) +
        '</div></div></div><footer class="aid-station-footer">' +
        '<span class="aid-message">' + escapeText(s.notice || label('status.waiting')) +
        '</span><span>v019 · AID</span></footer></div>';
    this.drawSight();
  }
  refreshScene() {
    if (this.state.station !== 'studio')
      return;
    const target = this.root.querySelector(this.state.mode === 'fish' ? '.aid-scene-frame'
                                                                      : '#aid-cppn-scene');
    if (target)
      target.innerHTML = this.state.mode === 'fish' ? fishScene(this.state) : cppnGraph(this.state);
    const svg = this.root.querySelector('#aid-body-map');
    if (svg)
      this.pulsePlayer?.attach(svg);
    this.markStimulus();
    this.markFocus();
  }
  // A chosen organ or nerve center keeps itself, what it is wired with and those wires in full
  // colour; the rest stands back.
  markFocus() {
    const svg = this.root.querySelector('#aid-body-map'), {selected, document : doc} = this.state;
    if (!svg || this.state.stimulus || !['organ', 'center'].includes(selected?.kind))
      return;
    const owner = id => {
      const found = findCenter(doc, id);
      return found && found.organ.type === 'brain' ? id : found ? found.organ.id : id;
    };
    const chosen = owner(selected.id), near = new Set([ chosen ]), wires = new Set();
    for (const link of routedLinks(doc, this.state.sites)) {
      const from = owner(link.from), to = owner(link.to);
      if (from !== chosen && to !== chosen)
        continue;
      near.add(from);
      near.add(to);
      if (!link.wire.inner)
        wires.add(link.wire.id);
    }
    svg.classList.add('aid-focus-view');
    for (const key of near)
      for (const element of this.stimulusMarks(key))
        element.classList.add('aid-focus-near');
    for (const key of near) {
      const organ = findOrgan(doc, key);
      for (const center of organ?.centers ?? [])
        for (const element of this.stimulusMarks(center.id))
          element.classList.add('aid-focus-near');
    }
    for (const id of wires)
      for (const element of svg.querySelectorAll('[data-wires~="' + CSS.escape(id) + '"]'))
        element.classList.add('aid-focus-near');
  }
  // The network a stimulus reached stays marked, the rest stands back, until the wire tool is
  // taken or the design changes.
  markStimulus() {
    const svg = this.root.querySelector('#aid-body-map'), stimulus = this.state.stimulus;
    if (!svg || !stimulus)
      return;
    svg.classList.add('aid-stimulus-view');
    for (const key of stimulus.fired)
      for (const element of this.stimulusMarks(key))
        element.classList.add('aid-pulse-fired');
    for (const key of stimulus.quieted)
      for (const element of this.stimulusMarks(key))
        element.classList.add('aid-pulse-quieted');
    for (const id of stimulus.wires)
      for (const element of svg.querySelectorAll('[data-wires~="' + CSS.escape(id) + '"]'))
        element.classList.add('aid-pulse-used');
  }
  // What shows a part of the network: an organ's glyph, a nerve center's node.
  stimulusMarks(key) {
    const svg = this.root.querySelector('#aid-body-map');
    if (!svg)
      return [];
    const escaped = CSS.escape(key);
    return [
      ...svg.querySelectorAll('.aid-anatomy [data-organ="' + escaped + '"]'),
      ...svg.querySelectorAll('.aid-centers [data-center="' + escaped + '"]'),
      ...svg.querySelectorAll('.aid-centers [data-organ="' + escaped + '"]')
    ];
  }
  refreshInspector(reset = false) {
    const element = this.root.querySelector('.aid-inspector-scroll');
    if (!element)
      return;
    const scroll = reset ? 0 : element.scrollTop;
    element.innerHTML =
        this.state.mode === 'fish' ? inspector(this.state) : cppnInspector(this.state);
    element.scrollTop = scroll;
    // Canvases are drawn once they stand in the page.
    this.drawSight();
  }
  refreshTools() {
    const existing = this.root.querySelector('.aid-tools');
    if (existing)
      existing.outerHTML = toolPalette(this.state);
  }
  // The fish's cells: those it developed with its contacts, or those the engine plans for the
  // draft (its nerve and sense cells copied, one per effector), once it has answered.
  cellStatus() {
    const {report, stale, anatomy} = this.state;
    if (report && !stale)
      return report.neurons + ' ' + label('app.centers') + ' · ' + report.synapses + ' ' +
             label('app.contacts');
    return (Number.isFinite(anatomy?.neurons) ? anatomy.neurons + ' ' + label('app.centers') + ' · '
                                              : '') +
           label('app.draft');
  }
  refreshHeader() {
    const state = this.state;
    const compiler = this.root.querySelector('.aid-compiler');
    if (compiler) {
      const opened = compiler.open;
      compiler.outerHTML = compilerPanel(state);
      const updated = this.root.querySelector('.aid-compiler');
      if (updated)
        updated.open = opened || (!state.stale && state.report?.compiler?.ok === false);
    }
    const status = this.root.querySelector('.aid-status');
    if (status)
      status.textContent = this.cellStatus();
    const develop = this.root.querySelector('[data-action="develop"]');
    if (develop) {
      develop.disabled = state.busy;
      develop.textContent = label(state.busy ? 'app.developBusy' : 'app.develop');
    }
    for (const button of this.root.querySelectorAll('[data-contacts="actual"]'))
      button.disabled = state.stale || !state.report?.contacts?.length;
    const download = this.root.querySelector('[data-action="download"]');
    if (download)
      download.disabled = !acceptedGenome(state);
    const eggs = this.root.querySelector('[data-action="eggs"]');
    if (eggs)
      eggs.disabled = !acceptedGenome(state) || !state.report?.viable;
  }
  recordHistory(batch = null) {
    if (batch === null || this.historyBatch !== batch) {
      this.undoHistory.push(this.state.document);
      if (this.undoHistory.length > 40)
        this.undoHistory.shift();
      this.redoHistory.length = 0;
    }
    this.historyBatch = batch;
    this.state.canUndo = this.undoHistory.length > 0;
    this.state.canRedo = this.redoHistory.length > 0;
  }
  stepHistory(action) {
    const source = action === 'undo' ? this.undoHistory : this.redoHistory;
    const target = action === 'undo' ? this.redoHistory : this.undoHistory;
    if (!source.length)
      return false;
    this.stopPulse();
    target.push(this.state.document);
    this.state.document = validateDocument(source.pop());
    this.historyBatch = null;
    this.state.canUndo = this.undoHistory.length > 0;
    this.state.canRedo = this.redoHistory.length > 0;
    this.state.selected = null;
    this.state.multi.clear();
    this.state.stale = true;
    this.state.contactView = 'design';
    this.state.genome = '';
    this.state.measurement = null;
    this.persist();
    this.refreshScene();
    this.refreshHeader();
    this.refreshInspector();
    this.refreshTools();
    this.requestDesign();
    return true;
  }
  tuneGraphic(event) {
    const control = this.controlPointer;
    if (!control)
      return;
    const bounds = control.rect;
    if (!bounds.width || !bounds.height)
      return;
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const clamp = (v, low = -1) => Math.max(low, Math.min(1, v));
    let q1, q2, patch, shown = null;
    const current0 = findCenter(this.state.document, control.id)?.center;
    // Handles on a graphic set a width or an angle; the graphic is drawn anew around them.
    if (control.handle && current0) {
      patch = this.handlePatch(control, x, y, current0);
      if (!patch)
        return;
      this.changeDocument(updateCenter(this.state.document, control.id, patch), this.state.selected,
                          false, 'graphic:' + control.id);
      this.refreshInspector();
      return;
    }
    if (control.kind === 'wire')
      patch = {spread : clamp((Math.hypot((x - .5) * 150, (y - .5) * 150) - 8) / 55, 0)};
    else if (control.kind === 'output') {
      // Where the wires decide the side, the pad sets the reach alone.
      const wired =
          current0 ? wiredCrossing(this.state.document, current0, this.state.sites) : null;
      const crossing = wired ?? clamp(((x * 150 - 15) / 120) * 2 - 1);
      patch = {range : clamp(1 - (y * 150 - 15) / 120, 0)};
      if (wired === null)
        patch.crossing = crossing;
      shown = {x : 15 + (crossing + 1) * 60, y : 15 + (1 - patch.range) * 120};
    } else if (control.kind === 'compass') {
      patch = scentMapTuning(x, y);
    } else if (control.kind === 'learning') {
      const pad = LEARNING_PAD, across = pad.width - 2 * pad.inset, up = pad.height - 2 * pad.inset;
      patch = {
        mode : clamp(((x * pad.width - pad.inset) / across) * 2 - 1),
        qwidth : clamp(1 - (y * pad.height - pad.inset) / up, 0)
      };
    } else {
      q1 = clamp((x * WHEEL.size - WHEEL.centre) / WHEEL.radius);
      q2 = clamp((WHEEL.centre - y * WHEEL.height) / WHEEL.radius);
      patch = {q1, q2};
    }
    const current = control.kind === 'wire'
                        ? this.state.document.wires.find(wire => wire.id === control.id)
                        : findCenter(this.state.document, control.id)?.center;
    if (!current ||
        Object.entries(patch).every(([ key, value ]) => Math.abs(value - current[key]) < .001))
      return;
    if (!control.changed) {
      this.recordHistory('graphic:' + control.id);
      control.changed = true;
      this.refreshTools();
    }
    this.stopPulse();
    this.state.document = control.kind === 'wire'
                              ? updateWire(this.state.document, control.id, patch)
                              : updateCenter(this.state.document, control.id, patch);
    this.state.report = null;
    this.state.genome = '';
    this.state.stale = true;
    this.persist();
    if (control.kind === 'compass')
      this.refreshScentMaps();
    else if (control.kind === 'wire') {
      const radius = 8 + 55 * patch.spread;
      control.element.querySelector('.aid-wire-halo')?.setAttribute('r', String(radius));
      control.element.querySelector('.aid-wire-handle')?.setAttribute('cx', String(75 + radius));
    } else {
      const pad = LEARNING_PAD;
      const vector =
          control.kind === 'learning' ? {
            x : pad.inset + (patch.mode + 1) / 2 * (pad.width - 2 * pad.inset),
            y : pad.inset + (1 - patch.qwidth) * (pad.height - 2 * pad.inset)
          }
          : control.kind === 'output'
              ? shown
              : {x : WHEEL.centre + q1 * WHEEL.radius, y : WHEEL.centre - q2 * WHEEL.radius};
      for (const marker of control.element.querySelectorAll('.aid-vector-point,.aid-wheel-halo')) {
        marker.setAttribute('cx', String(vector.x));
        marker.setAttribute('cy', String(vector.y));
      }
    }
    this.refreshScene();
    this.refreshHeader();
  }
  // A nose's scent map follows its dragged preference.
  refreshScentMaps() {
    for (const block of this.root.querySelectorAll('[data-scent-block]')) {
      const center = findCenter(this.state.document, block.dataset.scentBlock)?.center;
      if (center)
        block.outerHTML = scentMap(center);
    }
  }
  // A handle's pointer (x, y as fractions of its graphic) as a change: a width along the track of
  // the scent map or the substance wheel, the contact field's edge, a lateral line's or spines'
  // reach.
  handlePatch(control, x, y, center) {
    const clamp = v => Math.max(0, Math.min(1, v));
    if (control.kind === 'compass')
      return {qwidth : scentMapWidth(x)};
    if (control.kind === 'contact') {
      const half = Math.abs(Math.atan2(x * 140 - 70, 70 - y * 140)) * 180 / Math.PI;
      return {field : clamp((half - TUNING.contact_width_min) / TUNING.contact_width_span)};
    }
    // A lateral line's reach, from local to the whole body, along its track.
    if (control.kind === 'lateral') {
      const L = LATERAL_FIELD;
      return {field : clamp((x * L.width - L.track[0]) / (L.track[1] - L.track[0]))};
    }
    // The spines' spread: how far the pointer's direction lies from where they centre.
    if (control.kind === 'spines') {
      const R = SPINE_RING, aim = Number(control.element.dataset.spineAim);
      const angle = Math.atan2(y * R.height - R.cy, R.cx - x * R.width);
      const half = Math.abs(wrapAngle(angle - aim)) * 180 / Math.PI;
      return {field : clamp((half - TUNING.contact_width_min) / TUNING.contact_width_span)};
    }
    // A gland's width along the substance wheel's track.
    return {qwidth : wheelTrackWidth(x)};
  }
  refreshCounts() { this.renderShell(); }
  persist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.api(requestBody('save-draft', {document : this.state.document}))
          .catch(error => this.notice(error.message));
    }, 400);
  }
  changeDocument(doc, selected = null, updateInspector = true, batch = null, finish = false) {
    if (!doc)
      return false;
    this.recordHistory(batch);
    if (finish)
      this.historyBatch = null;
    this.stopPulse();
    this.state.stimulus = null;
    // Regions with a plan follow every change at once.
    this.state.document = validateDocument(settleRegions(doc, this.state.sites));
    this.state.selected = selected;
    this.state.multi.clear();
    this.state.stale = true;
    this.state.contactView = 'design';
    this.state.measurement = null;
    this.state.genome = '';
    this.persist();
    this.refreshScene();
    this.refreshHeader();
    this.refreshTools();
    if (this.state.tool === 'hormone')
      this.refreshLibrary();
    if (updateInspector)
      this.refreshInspector();
    this.requestDesign();
    return true;
  }
  // Choosing on the fish toggles; a button in a panel (a tab, a list entry) chooses without.
  select(kind, id, event = null, toggle = true) {
    const current = this.state.selected;
    if ((event?.ctrlKey || event?.metaKey || event?.shiftKey) &&
        (kind === 'organ' || kind === 'center')) {
      if (!this.state.multi.size && current &&
          (current.kind === 'organ' || current.kind === 'center')) {
        if (current.kind === kind && current.id === id) {
          this.state.selected = null;
          this.refreshScene();
          this.refreshInspector();
          return;
        }
        this.state.multi.add(current.id);
      }
      if (this.state.multi.has(id)) {
        this.state.multi.delete(id);
        const remaining = [...this.state.multi ].at(-1);
        this.state.selected = remaining ? {
          kind : findOrgan(this.state.document, remaining) ? 'organ' : 'center',
          id : remaining
        }
                                        : null;
      } else {
        this.state.multi.add(id);
        this.state.selected = {kind, id};
      }
    } else {
      this.state.multi.clear();
      this.state.selected = kind === null || toggle && current?.kind === kind && current.id === id
                                ? null
                                : {kind, id};
    }
    // A chosen light cell brings its colour type to the inspector: what is edited is what was
    // chosen.
    const cell = this.state.selected?.kind === 'center' &&
                 findCenter(this.state.document, this.state.selected.id);
    if (cell?.organ.field && cell.center.profile)
      this.state.visionProfile = cell.center.profile;
    this.stopPulse();
    this.bringProbes();
    this.refreshScene();
    this.refreshInspector(true);
  }
  // A selected field organ brings the test light to its side, mirrored from the other one; a
  // selected nose, touch, pain or lateral organ (or a node of one) its test stimulus.
  bringProbes() {
    const id = this.state.selected?.id, doc = this.state.document;
    const organ = findOrgan(doc, id) ?? findCenter(doc, id)?.organ ?? null;
    if (!organ)
      return;
    const sense = probeFor(organ, this.state.senseProbe);
    if (sense && sense !== this.state.senseProbe) {
      this.state.senseProbe = sense;
      this.requestDesign();
    }
    if (!organ.field || !this.state.capabilities)
      return;
    const side = organ.side < 0 ? -1 : 1, probe = this.state.sightProbe;
    const moved = probe ? probe.side !== side && {...probe, side, bearing : -probe.bearing}
                        : defaultSight(organ, this.state.capabilities, this.state.anatomy);
    if (moved) {
      this.state.sightProbe = moved;
      this.requestDesign();
    }
  }
  // The test stimulus of the design request: the shown one while its organ is in the design.
  senseScene() {
    const probe = this.state.senseProbe;
    return probe && findOrgan(this.state.document, probe.organ) ? senseScene(probe) : null;
  }
  // The design view: the engine's anatomy of the design (body, organ seats, fields), made from
  // the planned cells without CPPN or development. One request at a time; the newest design
  // follows as soon as the last one is answered.
  requestDesign() {
    if (this.designRunning) {
      this.designPending = true;
      return;
    }
    this.designRunning = true;
    this.designPending = false;
    const document = this.state.document, probe = this.state.sightProbe,
          sense = this.state.senseProbe;
    this.api(requestBody('design', {
          plan : compileDocument(document, this.state.sites),
          sight : sightScene(probe),
          sense : this.senseScene()
        }))
        // An answer for the design shown is shown even when a test stimulus has moved on since:
        // the eyes and senses follow a dragged one step by step instead of waiting for it to
        // rest.
        .then(anatomy => {
          if (this.state.document === document)
            this.showAnatomy(anatomy);
        })
        .catch(error => this.notice(error.message))
        .finally(() => {
          this.designRunning = false;
          if (this.designPending || this.state.document !== document ||
              this.state.sightProbe !== probe || this.state.senseProbe !== sense)
            this.requestDesign();
        });
  }
  // An answer for the design already shown changes only what the eyes see and the senses feel
  // (a test stimulus was moved): the fields of view and the probes follow alone, so dragging a
  // stimulus stays smooth.
  showAnatomy(anatomy) {
    const probesOnly = this.shownDesign === this.state.document;
    this.shownDesign = this.state.document;
    this.state.anatomy = anatomy;
    this.bringProbes();
    if (probesOnly) {
      this.refreshVision();
      this.drawSight();
      this.refreshProbes();
      return;
    }
    this.refreshHeader();
    this.refreshScene();
    this.refreshGraphics();
    this.checkPressure();
  }
  // The engine binds pressure cells to the organ nearest to them: one of an egg or sperm organ,
  // a bladder or the gut that measures another organ moves, once per design, to the nearest
  // free place where the engine's design view finds it measuring its own organ (at most
  // PRESSURE_TRIES places); the inspector says what it measures where none is found.
  async checkPressure() {
    const doc = this.state.document, pressure = this.state.anatomy?.pressure;
    if (!Array.isArray(pressure) || this.pressureChecked === doc)
      return;
    this.pressureChecked = doc;
    const centers = allCenters(doc);
    const wrong = centers.filter((c, index) => {
      const own = PRESSURE_OF[c.organType];
      return own?.key === c.key && pressure[index] >= 0 && pressure[index] !== own.source;
    });
    for (const center of wrong) {
      const organ = findOrgan(doc, center.organId);
      const motor = organ.centers.find(c => c.role === 'motor') ?? organ.centers[0];
      const index = centers.findIndex(c => c.id === center.id);
      for (const site of nodeSitesNear(doc, center.id, motor.id, this.state.sites)
               .slice(0, PRESSURE_TRIES)) {
        const moved = placeNode(doc, center.id, site.id, this.state.sites);
        const answer =
            moved &&
            await this.api(requestBody('design', {plan : compileDocument(moved, this.state.sites)}))
                .catch(() => null);
        if (this.state.document !== doc)
          return;
        if (answer?.pressure?.[index] === PRESSURE_OF[center.organType].source) {
          this.changeDocument(moved, this.state.selected, true, 'pressure:' + center.id);
          return this.notice(label('status.pressureMoved'));
        }
      }
    }
  }
  refreshVision() {
    for (const fan of this.root.querySelectorAll('#aid-body-map [data-vision-organ]')) {
      const organ = findOrgan(this.state.document, fan.dataset.visionOrgan);
      if (organ)
        fan.outerHTML = visionFan(this.state, organ);
    }
  }
  // The inspector's graphics follow the design at once and the engine's curves when they
  // arrive, without rebuilding the inspector around them.
  refreshGraphics() {
    this.refreshSpectrum();
    this.refreshSensitivity();
    this.refreshEffectors();
    this.drawSight();
    this.refreshProbes();
  }
  // A sense probe follows the design view's answers and its dragged stimulus, a near sense's
  // answers the test object.
  refreshProbes() {
    for (const block of this.root.querySelectorAll('[data-probe-block]')) {
      const organ = findOrgan(this.state.document, block.dataset.probeBlock);
      if (organ)
        block.outerHTML = probeField(this.state, organ);
    }
    for (const block of this.root.querySelectorAll('[data-near-answers]')) {
      const organ = findOrgan(this.state.document, block.dataset.nearAnswers);
      if (organ)
        block.outerHTML = nearAnswers(this.state, organ);
    }
  }
  // The stimulus follows the pointer at once; what the senses feel when the engine answers.
  probePointer(event) {
    const drag = this.probeControl, probe = this.state.senseProbe,
          faintest = this.state.anatomy?.lightDimmest;
    if (probe?.organ !== drag.id || !drag.rect.width || !drag.rect.height || !(faintest > 0))
      return;
    const patch = probePatch(probe.kind, (event.clientX - drag.rect.left) / drag.rect.width,
                             (event.clientY - drag.rect.top) / drag.rect.height, faintest);
    this.state.senseProbe = {...probe, ...patch};
    this.refreshProbes();
    this.requestDesign();
  }
  // Both eyes' views, drawn with the Aquarium's eye graphic from the design view's sight.
  drawSight() {
    const sight = this.state.anatomy?.sight;
    for (const canvas of this.root.querySelectorAll('[data-sight-eye]')) {
      const side = Number(canvas.dataset.sightEye);
      const receptors =
          (sight?.receptors ??
           []).filter(r => !r[RECEPTOR.proximity] && (r[RECEPTOR.lateral] < 0 ? 0 : 1) === side);
      canvas.closest('figure').hidden = !receptors.length;
      if (receptors.length)
        drawOrganGraphic(canvas, eyeSight(sight.bands, sight.samples, receptors, side), null,
                         {key : SENSE_TISSUE.light});
    }
  }
  // What a spectrum editor tunes: a light-cell profile of a field organ, or a pigment cell.
  spectrumTarget({spectrum : kind, spectrumId: id, profileId}) {
    if (kind === 'field') {
      const organ = findOrgan(this.state.document, id);
      const profile = organ?.field?.profiles.find(p => p.id === profileId);
      return profile && {tuning : profile, organ};
    }
    const center = findCenter(this.state.document, id)?.center;
    return center && {tuning : center};
  }
  // The spectrum editor follows its tuning at once and the engine's curves when they arrive.
  refreshSpectrum() {
    const block = this.root.querySelector('[data-spectrum-block]');
    const editor = block?.querySelector('[data-spectrum]');
    const target = editor && this.spectrumTarget(editor.dataset);
    if (target)
      block.outerHTML = target.organ ? spectrumEditor(this.state, target.organ, target.tuning)
                                     : pigmentSpectrum(this.state, target.tuning);
  }
  // A sensitivity graphic's owner: a colour type of a field organ, or a sensory center.
  sensitivityTarget(block) {
    if (block.dataset.sensitivityBlock === 'field')
      return this.spectrumTarget({
        spectrum : 'field',
        spectrumId : block.dataset.sensitivityId,
        profileId : block.dataset.profileId
      });
    const found = findCenter(this.state.document, block.dataset.sensitivityId);
    return found && {tuning : found.center, center : found.center};
  }
  refreshSensitivity() {
    const drag = this.sensitivityControl;
    for (const block of this.root.querySelectorAll('[data-sensitivity-block]')) {
      const target = this.sensitivityTarget(block);
      if (!target)
        continue;
      // While its handle is dragged, a log curve shifts from where the drag began; a linear one
      // follows the engine's answers as they arrive.
      const own = drag?.block === (target.organ ? target.tuning.id : target.center.id);
      const start = own && drag.log ? drag.answer : null;
      block.outerHTML = target.organ ? sensitivityEditor(this.state, target.organ, target.tuning,
                                                         own ? drag.shift : 1, start)
                                     : sensorAnswer(this.state, target.center, own ? drag.shift : 1,
                                                    start, own ? drag.dragged : null);
    }
    const adapt = this.adaptationControl;
    for (const block of this.root.querySelectorAll('[data-adaptation-block]')) {
      const center = findCenter(this.state.document, block.dataset.adaptationId)?.center;
      const own = adapt?.id === center?.id;
      if (center)
        block.outerHTML =
            sensorAdaptation(this.state, center, own ? adapt.stretch : 1, own ? adapt.adapt : null);
    }
  }
  // The threshold follows the handle. On a log axis its quality moves as the stimulus of half the
  // answer does, and the curve shifts with it until the engine's new one arrives; on a linear
  // axis the handle is the threshold's activation level itself.
  sensitivityPointer(event) {
    const drag = this.sensitivityControl,
          dimmest = drag.log ? this.state.anatomy?.lightDimmest : null;
    if (drag.log && !(dimmest > 0))
      return;
    const stimulus =
        sensitivityStimulus((event.clientX - drag.rect.left) / drag.rect.width, dimmest);
    let threshold;
    if (drag.log) {
      drag.shift = stimulus / drag.answer.half;
      threshold = planOfUnit(unitOfPlan(drag.threshold) + thresholdQualityShift(drag.shift));
    } else {
      drag.dragged = stimulus;
      threshold = planOfUnit(activationQuality(stimulus));
    }
    if (drag.field)
      this.editField(drag.field, {profile : {id : drag.block, threshold}}, false);
    else
      this.changeDocument(updateCenter(this.state.document, drag.block, {threshold}),
                          this.state.selected, false, 'threshold:' + drag.block);
    this.refreshSensitivity();
  }
  // A receptor (or the body's growth receptor) follows its curve's handles and its halo on the
  // substance wheel.
  receptorPointer(event) {
    const drag = this.receptorControl, doc = this.state.document;
    const growth = drag.target === GROWTH;
    const cut = drag.target.lastIndexOf(':'), centerId = drag.target.slice(0, cut),
          effect = growth ? GROWTH : Number(drag.target.slice(cut + 1));
    const receptor = growth ? doc.growth : findCenter(doc, centerId)?.center.receptors[effect];
    if (!receptor)
      return;
    const fx = (event.clientX - drag.rect.left) / drag.rect.width,
          fy = (event.clientY - drag.rect.top) / drag.rect.height;
    let patch;
    if (drag.handle === 'width')
      patch = {width : wheelTrackWidth(fx)};
    else
      patch = receptorCurvePatch(this.state, receptor, effect, drag.handle, fx, fy);
    if (!patch)
      return;
    this.changeDocument(growth ? updateGrowth(doc, patch)
                               : updateReceptor(doc, centerId, effect, patch),
                        this.state.selected, false, 'receptor:' + drag.target);
    this.refreshInspector();
  }
  // Graphics whose handles change a center: rest activity, recovery and beat on the drive
  // graphic, the stretch of a sac, the marks of a life phase.
  drivePointer(event) {
    const drag = this.driveControl;
    const fx = (event.clientX - drag.rect.left) / drag.rect.width,
          fy = (event.clientY - drag.rect.top) / drag.rect.height;
    if (drag.handle === 'effector')
      return this.effectorPointer(drag, fx, fy);
    const doc = drag.handle === 'start' || drag.handle === 'end'
                    ? this.lifePhase(drag.id, phasePatch(drag.handle, fx))
                    : updateCenter(this.state.document, drag.id,
                                   drag.handle === 'stretch'
                                       ? stretchPatch(fy)
                                       : drivePatch(drag.handle, fx, fy,
                                                    this.state.capabilities?.biasScale ?? 0));
    this.changeDocument(doc, this.state.selected, false, 'drive:' + drag.id);
    this.refreshInspector();
  }
  // An effector organ's handles: its nodes, their strength, or a trait its function shapes.
  effectorPointer(drag, fx, fy) {
    const doc = this.state.document, organ = findOrgan(doc, drag.id);
    const patch = organ && effectorPatch(organ.type, drag.code, drag.side, drag.name, fx, fy);
    if (!patch)
      return;
    const changed =
        'nodes' in patch ? patch.nodes !== organ.centers.length &&
                               setOrganNodes(doc, organ.id, patch.nodes, this.state.sites)
        : 'copies' in patch
            ? patch.copies !== organ.centers[0].copies &&
                  updateCenter(doc, organ.centers[0].id, {copies : patch.copies})
            : setMuscleTrait(doc, drag.code, patch.trait, patch.value, this.state.sites);
    if (!changed)
      return;
    this.changeDocument(changed, this.state.selected, false, 'effector:' + drag.id);
    this.refreshInspector();
  }
  // An effector's graphic follows the engine's fins, mouth, colour and spines when they arrive.
  refreshEffectors() {
    for (const block of this.root.querySelectorAll('[data-effector-block]')) {
      const organ = findOrgan(this.state.document, block.dataset.effectorBlock);
      if (organ)
        block.outerHTML = organ.type === 'gut' ? gutGraphic(this.state, organ, this.state.selected)
                                               : effectorGraphic(this.state, organ);
    }
    for (const block of this.root.querySelectorAll('[data-lateral-block]')) {
      const organ = findOrgan(this.state.document, block.dataset.lateralBlock);
      if (organ)
        block.outerHTML = lateralField(this.state, organ);
    }
    for (const block of this.root.querySelectorAll('[data-spine-block]')) {
      const organ = findOrgan(this.state.document, block.dataset.spineBlock);
      if (organ)
        block.outerHTML = spineField(this.state, organ);
    }
  }
  // The time constant follows the handle; the curve stretches with it in time.
  adaptationPointer(event) {
    const drag = this.adaptationControl;
    const steps = adaptationSteps((event.clientX - drag.rect.left) / drag.rect.width,
                                  drag.adapt.response.length - 1);
    const {min_steps : least, span} = TIME_CONSTANT;
    const tau = Math.max(0, Math.min(1, Math.log(steps / least) / Math.log(span)));
    drag.stretch = least * span ** tau / drag.adapt.steps;
    this.changeDocument(updateCenter(this.state.document, drag.id, {tau}), this.state.selected,
                        false, 'tau:' + drag.id);
    this.refreshSensitivity();
  }
  spectrumPointer(event) {
    const drag = this.spectrumControl, target = this.spectrumTarget(drag.target);
    if (!target)
      return;
    const index =
        allCenters(this.state.document)
            .findIndex(c => c.organId === target.organ?.id && c.profile === drag.target.profileId);
    const patch = spectrumPatch(
        target.tuning, drag.handle, (event.clientX - drag.rect.left) / drag.rect.width,
        (event.clientY - drag.rect.top) / drag.rect.height, this.state.anatomy?.light?.[index]);
    if (!patch)
      return;
    if (drag.handle === 'light') {
      if (this.state.sightProbe) {
        this.state.sightProbe = {...this.state.sightProbe, ...patch};
        this.refreshScene();
        this.refreshSpectrum();
        this.requestDesign();
      }
      return;
    }
    if (Object.entries(patch).every(([ key, value ]) =>
                                        Math.abs(value - target.tuning[key]) < .001))
      return;
    const {spectrum : kind, spectrumId : id, profileId} = drag.target;
    if (kind === 'field')
      this.editField(id, {profile : {id : profileId, ...patch}}, false);
    else
      this.changeDocument(updateCenter(this.state.document, id, patch), this.state.selected, false,
                          'spectrum:' + id);
    this.refreshSpectrum();
  }
  // Field organs (eyes, the near sense) go where their field puts their cells. While one is
  // dragged, every placement its field can take is a seat; the nearest shows, and dropping takes
  // exactly that one.
  prepareChoices(placements) {
    this.state.choices = placements.length ? placements : null;
    this.showChoices(this.choicePoint);
  }
  nearestChoice(point) {
    let best = null, distance = Infinity;
    for (const choice of this.state.choices ?? [])
      for (const seat of choiceSeats(this.state, choice)) {
        const d = Math.hypot(seat.x - point.x, seat.y - point.y);
        if (d < distance)
          [best, distance] = [ choice, d ];
      }
    return best;
  }
  // Drawn at most once per frame, and only when another choice becomes the nearest.
  showChoices(point) {
    this.choicePoint = point;
    if (this.choiceFrame)
      return;
    this.choiceFrame = requestAnimationFrame(() => {
      this.choiceFrame = 0;
      const layer = this.root.querySelector('#aid-choices');
      if (!layer || !this.state.choices)
        return;
      const nearest = this.choicePoint ? this.nearestChoice(this.choicePoint) : null;
      if (layer.childElementCount && nearest === this.shownChoice)
        return;
      this.shownChoice = nearest;
      layer.innerHTML = choicesSvg(this.state, this.state.choices, nearest);
    });
  }
  commitChoice(point) {
    const choice = point && this.nearestChoice(point);
    this.cancelChoices();
    if (!choice)
      return false;
    this.changeDocument(choice.document, {kind : 'organ', id : choice.organId});
    return true;
  }
  cancelChoices() {
    this.state.choices = null;
    this.choicePoint = null;
    this.shownChoice = null;
    this.root.querySelector('#aid-choices')?.replaceChildren();
  }
  // While an organ is dragged, a bin in the frame removes it.
  showTrash(visible) {
    const trash = this.root.querySelector('[data-trash]');
    if (trash) {
      trash.hidden = !visible;
      trash.classList.remove('armed');
    }
  }
  // What is dragged onto the bin or out of the fish is removed when let go.
  overTrash(event) {
    const trash = this.root.querySelector('[data-trash]');
    if (!trash || trash.hidden)
      return false;
    const r = trash.getBoundingClientRect();
    const inside = (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top &&
                    event.clientY <= r.bottom) ||
                   this.outsideFish(event);
    trash.classList.toggle('armed', inside);
    return inside;
  }
  outsideFish(event) {
    const svg = this.root.querySelector('#aid-body-map'),
          body = svg?.querySelector?.('.aid-fish-body');
    if (!body?.isPointInFill)
      return false;
    const p = cameraCoordinates(event, svg, this.state.camera);
    return !body.isPointInFill(new DOMPoint(p.x, p.y));
  }
  // A developed fish only on request: genome, brain and wiring.
  async develop() {
    if (this.state.busy)
      return;
    const document = this.state.document;
    const plan = compileDocument(document, this.state.sites);
    if (!plan.groups.length) {
      this.state.report = null;
      this.state.genome = '';
      this.refreshScene();
      return;
    }
    this.state.busy = true;
    this.refreshHeader();
    try {
      const result = await this.api(requestBody('build', {plan}), 60000);
      if (this.state.document !== document)
        return;
      this.state.report = result;
      this.state.robustness = null;
      this.state.genome = result.genome;
      this.state.stale = false;
      this.refreshScene();
      this.refreshInspector();
    } catch (error) {
      this.notice(error.message);
    } finally {
      this.state.busy = false;
      this.refreshHeader();
    }
  }
  async checkCompiler() {
    if (this.state.busy || !acceptedGenome(this.state) || !this.state.report?.compiler)
      return;
    const document = this.state.document, genome = this.state.genome;
    this.state.busy = true;
    this.refreshHeader();
    try {
      const result = await this.api(
          requestBody('check', {genome, plan : compileDocument(document, this.state.sites)}),
          60000);
      if (this.state.document === document && this.state.genome === genome)
        this.state.robustness = result;
    } catch (error) {
      this.notice(error.message);
    } finally {
      this.state.busy = false;
      this.refreshHeader();
    }
  }
  editField(id, patch, refresh = true) {
    const doc = updateField(this.state.document, id, patch, this.state.sites);
    if (!doc)
      return this.notice(label('status.noRoom'));
    this.changeDocument(doc, {kind : 'organ', id}, refresh, 'field:' + id);
  }
  visionPointer(event) {
    const drag = this.visionControl;
    const organ = findOrgan(this.state.document, drag.id);
    if (!organ?.field)
      return;
    const svg = this.root.querySelector('#aid-body-map');
    const position = cameraCoordinates(event, svg, this.state.camera);
    const patch = visionDragPatch(this.state, organ, drag.key, position);
    if (!patch)
      return;
    // The test light moves at once; what the eyes see follows when the engine answers.
    if (drag.key === 'probe' || drag.key === 'probe-size') {
      this.state.sightProbe = {...this.state.sightProbe, ...patch};
      const light = this.root.querySelector('#aid-body-map .aid-sight-light');
      if (light)
        light.outerHTML = testLightMarkup(this.state, organ);
      else
        this.refreshScene();
      this.refreshSpectrum();
      this.requestDesign();
    } else
      this.editField(organ.id, patch, false);
  }
  async stimulate(centerIds) {
    if (!this.state.sites.length || !Array.isArray(centerIds) || !centerIds.length)
      return;
    if (!this.state.genome || this.state.stale)
      await this.develop();
    if (!this.state.genome || this.state.stale)
      return this.notice(label('status.probeNoGenome'));
    const requested = new Set(centerIds);
    const groups = allCenters(this.state.document)
                       .flatMap((center, index) => requested.has(center.id) ? [ index ] : []);
    if (!groups.length)
      return;
    try {
      const result = await this.api(requestBody('probe', {
                                      genome : this.state.genome,
                                      plan : compileDocument(this.state.document, this.state.sites),
                                      groups,
                                      steps : 24
                                    }),
                                    60000);
      this.playPulse(centerIds, result.frames);
      this.notice(label('status.probed'));
    } catch (error) {
      this.notice(error.message);
    }
  }
  // What the focused substance does in the developed fish: the atelier runs its brain with and
  // without the substance and reports the change per cell group and organ drive.
  async measure() {
    if (!this.state.sites.length)
      return;
    if (!this.state.genome || this.state.stale)
      await this.develop();
    if (!this.state.genome || this.state.stale)
      return this.notice(label('status.probeNoGenome'));
    try {
      this.state.measurement =
          await this.api(requestBody('measure', {
                           genome : this.state.genome,
                           plan : compileDocument(this.state.document, this.state.sites),
                           substance : this.state.focusSubstance,
                           level : this.state.measureLevel,
                           maturity : MEASURE_MATURITY,
                           steps : ATELIER_LIMITS.max_measure_steps
                         }),
                         60000);
      this.refreshLibrary();
      this.refreshScene();
      this.refreshInspector();
    } catch (error) {
      this.notice(error.message);
    }
  }
  // The stimulus runs through the drawn network: the parts the engine found active fire in turn
  // along the wires from the stimulated ones.
  playPulse(centerIds, frames) {
    this.stopPulse();
    if (this.state.contactView !== 'design') {
      this.state.contactView = 'design';
      for (const button of this.root.querySelectorAll('[data-contacts]'))
        button.classList.toggle('active', button.dataset.contacts === 'design');
    }
    if (!Array.isArray(frames) || !frames.length)
      return;
    // How far each part rose above and fell below where it stood at the first step.
    const doc = this.state.document, centers = allCenters(doc);
    const swing = (index, sign) =>
        Math.max(...frames.map(f => sign * ((f[index] ?? 0) - (frames[0][index] ?? 0))));
    const indexOf = new Map(centers.map((c, index) => [c.id, index]));
    const response = key => {
      const indices = endpointCenters(doc, key).map(c => indexOf.get(c.id));
      return indices.some(i => swing(i, 1) >= SIGNAL.cutoff)    ? 'rise'
             : indices.some(i => swing(i, -1) >= SIGNAL.cutoff) ? 'fall'
                                                                : null;
    };
    const starts = [...new Set(centerIds.map(id => wholeEndpoint(doc, id))) ];
    const schedule = signalSchedule(starts, signalLinks(this.state), response);
    this.state.stimulus = {fired : new Set(starts), wires : new Set(), quieted : new Set()};
    this.refreshScene();
    const svg = this.root.querySelector('#aid-body-map');
    if (!svg)
      return;
    this.pulsePlayer = createSignalPlayer(svg, schedule, {
      marks : key => this.stimulusMarks(key),
      moves : key => this.stimulusMoves(key),
      reached : (key, link, quieted) => {
        if (key)
          this.state.stimulus?.fired.add(key);
        if (quieted)
          this.state.stimulus?.quieted.add(quieted);
        for (const id of link?.wires ?? []) {
          this.state.stimulus?.wires.add(id);
          for (const element of svg.querySelectorAll('[data-wires~="' + CSS.escape(id) + '"]'))
            element.classList.add('aid-pulse-used');
        }
      }
    });
    this.pulsePlayer.start();
  }
  // What an effector moves as it fires: a tail muscle beats the tail fin, a steering one strokes
  // its side's fin, a biting one opens the mouth and its jaw, a sucking one widens the mouth,
  // cheeks and throat, defence raises its spines; every effector's own glyph twitches.
  stimulusMoves(key) {
    const svg = this.root.querySelector('#aid-body-map'), doc = this.state.document;
    const organ = findOrgan(doc, key) ?? findCenter(doc, key)?.organ;
    if (!svg || !organ?.centers.some(c => c.role === 'motor'))
      return [];
    const part = (selector, name) => [...svg.querySelectorAll(selector)].map(e => [e, name]);
    const own = this.stimulusMarks(organ.id).map(e => [e, 'aid-pulse-twitch']);
    const first = organ.centers[0], site = this.state.sites.find(s => s.id === first.site);
    const code = organ.type === 'muscle' && site ? functionFor(first, site) : -1,
          side = organ.side < 0 ? -1 : 1;
    const moved = {
      [MOTOR_KIND.forward] : () => part('[data-part="tail"]', 'aid-move-tail'),
      [MOTOR_KIND.turn] : () => part('[data-part="fin"][data-side="' + side + '"]',
                                     side < 0 ? 'aid-move-fin-up' : 'aid-move-fin-down'),
      [MOTOR_KIND.aggression] :
          () => [...part('[data-part="mouth"]', 'aid-move-bite'),
                 ...part('[data-part="jaw"][data-side="' + side + '"]', 'aid-move-jaw')],
      [MOTOR_KIND.suction] : () => [...part('[data-part="mouth"]', 'aid-move-suck'),
                                    ...part('[data-part="cheek"]', 'aid-move-suck'),
                                    ...part('[data-part="intake"]', 'aid-move-suck'),
                                    ...part('[data-part="throat"]', 'aid-move-throat')]
    }[code];
    const raise = organ.type === 'defense'
                      ? part('[data-spines="' + CSS.escape(organ.id) + '"]', 'aid-move-raise')
                      : [];
    return [...own, ...(moved ? moved() : []), ...raise ];
  }
  clearStimulus() {
    this.stopPulse();
    if (!this.state.stimulus)
      return;
    this.state.stimulus = null;
    this.refreshScene();
  }
  stopPulse() {
    this.pulsePlayer?.stop();
    this.pulsePlayer = null;
  }
  async cppnAction(operation, data = {}) {
    if (this.state.busy)
      return;
    const document = this.state.document;
    this.state.busy = true;
    try {
      const result = await this.api(
          requestBody(operation, {
            ...data,
            ...(operation === 'edit' && this.state.report?.compiler
                    ? {plan : compileDocument(document, this.state.sites)}
                    : {}),
            ...(operation === 'edit' || operation === 'inspect' ? {genome : this.state.genome} : {})
          }),
          60000);
      if (this.state.document !== document)
        return;
      this.state.report = result;
      this.state.robustness = null;
      if (result.genome)
        this.state.genome = result.genome;
      this.state.stale = false;
    } catch (error) {
      this.notice(error.message);
    } finally {
      this.state.busy = false;
      this.refreshScene();
      this.refreshInspector();
      this.refreshHeader();
    }
  }
  async placeEggs() {
    if (!acceptedGenome(this.state) || !this.state.report?.viable)
      return;
    try {
      const response = await sessionRequest(ROUTE.command, {
        method : 'POST',
        headers : {'Content-Type' : 'application/json', 'X-Fish-Token' : window.FISH_TOKEN},
        body : JSON.stringify({
          command : 'population-import',
          genome : this.state.genome,
          name : this.state.document.name + '.genome'
        })
      },
                                            60000);
      const result = await response.json();
      if (!response.ok)
        throw new Error(serverText(result.error));
      this.navigate('aquarium');
      beginEggPlacement({saved : String(result.message).replace(/^archive:/, '')});
    } catch (error) {
      this.notice(error.message);
    }
  }
  download() {
    if (!acceptedGenome(this.state))
      return;
    const file = new Blob([ this.state.genome ], {type : 'text/plain'});
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download =
        (this.state.document.name || 'fisch').replace(/[^\w\-äöüÄÖÜ ]/g, '_') + '.genome';
    a.click();
    URL.revokeObjectURL(url);
  }
  example() {
    const sites = this.state.sites;
    let doc = newDocument(label('app.example'));
    // An organ placed: its id, to wire it as a whole, and its first node's.
    const add = (type, x, y) => {
      const result = addOrgan(doc, type, sites, {x, y});
      if (result)
        doc = result.document;
      return {organ : result?.organId, node : result?.centerId};
    };
    const substance = name => {
      const next = addSubstance(doc, HORMONES.levels);
      if (!next)
        return null;
      const index = next.substances.at(-1).index;
      doc = setSubstance(next, index, name);
      return index;
    };
    const release = (gland, index) => {
      const [q1, q2] = wheelPlace(this.state.capabilities, index);
      doc = updateCenter(doc, gland, {q1, q2, qwidth : 0, tau : 1});
    };
    // The brain is built of regions. The eyes feed the optic tecta across the midline, the noses
    // the olfactory bulbs; both feed the pallium, which learns what to steer the fins and tail
    // by; the spinal cord beats the tail on alternate sides; the lateral line alarms the
    // hindbrain, which turns the fish away.
    const eye = add('eye', 360, 300), smell = add('nose', 245, 425);
    const tectum = add('tectum', 330, 340).organ, bulb = add('olfactory', 260, 380).organ;
    const pallium = add('pallium', 520, 345).organ, spinal = add('spinal', 870, 365).organ;
    const lateral = add('lateral', 573, 300), hindbrain = add('hindbrain', 690, 400).organ;
    const fin = add('muscle', 600, 470), tail = add('muscle', 890, 350);
    // A biting muscle at the snout and a sucking one behind it make the mouth.
    add('muscle', 195, 335);
    add('muscle', 330, 302);
    add('eggs', 848, 330);
    add('sperm', 760, 395);
    // A gland releases the growth substance; the body grows while it binds its growth receptor.
    const gland = add('gland', 260, 351).node, growth = substance(label('app.exampleGrowth'));
    if (gland && growth !== null) {
      release(gland, growth);
      doc = updateGrowth(
          doc,
          {active : 1, substance : growth, sensitivity : GROWTH_SENSITIVITY, half : GROWTH_HALF});
    }
    // Eating teaches: the gut's food sense drives the hypothalamus, which makes a gland release
    // the food substance. In the pallium it is the teaching signal (through the excitation
    // receptor, the engine's teacher besides modulating cells) and raises the learning rate, so
    // what led to food is learnt.
    const gut = add('gut', 780, 357), hypothalamus = add('hypothalamus', 420, 365).organ,
          reward = add('gland', 470, 383), food = substance(label('app.exampleFood'));
    const learner = findOrgan(doc, pallium)?.centers.find(c => c.node === 'learn')?.id;
    if (reward.node && learner && food !== null) {
      release(reward.node, food);
      for (const id of [learner, pairEndpoint(doc, learner)].filter(Boolean))
        for (const [effect, sensitivity] of [[ HORMONE_EFFECT.learning, REWARD_SENSITIVITY ],
                                             [ HORMONE_EFFECT.excitation, REWARD_TEACHING ]])
          doc = updateReceptor(doc, id, effect,
                               {active : 1, substance : food, sensitivity, half : REWARD_HALF});
    }
    // Organs and regions are wired as wholes, the gut by its food node alone.
    const wires = [
      [ eye.organ, tectum ], [ smell.organ, bulb ], [ tectum, pallium ], [ bulb, pallium ],
      [ pallium, fin.organ ], [ pallium, tail.organ ], [ spinal, tail.organ ],
      [ lateral.organ, hindbrain ], [ hindbrain, fin.organ ], [ gut.node, hypothalamus ],
      [ hypothalamus, reward.organ ]
    ];
    for (const [from, to] of wires) {
      const r = addWire(doc, from, to);
      if (r)
        doc = r.document;
    }
    this.changeDocument(doc);
  }
  // Life phases use the engine's full sensitivity span and steepest receptors.
  lifePhase(id, phase) {
    const c = this.state.capabilities;
    return setLifePhase(this.state.document, id, phase, c.sensitivitySpan, c.steepnessSteps);
  }
  removeSelection(target) {
    if (!target)
      return;
    const doc = this.state.document;
    const next = target.kind === 'wire'       ? removeWire(doc, target.id)
                 : target.kind === 'center'   ? removeCenter(doc, target.id)
                 : target.kind === 'organ'    ? removeOrgan(doc, target.id)
                 : target.kind === 'assembly' ? removeAssembly(doc, target.id)
                                              : null;
    if (next)
      this.changeDocument(next);
  }
  click(event) {
    if (performance.now() < this.ignoreClickUntil && event.target.closest?.('#aid-body-map'))
      return;
    if (event.target.closest?.('[data-vision-handle],[data-spectrum]'))
      return;
    const action = event.target.closest?.('[data-action]');
    if (action) {
      const op = action.dataset.action;
      if (op === 'home')
        return this.navigate('hub');
      if (op === 'aquarium')
        return this.navigate('aquarium');
      if (op === 'atelier')
        return this.navigate('studio');
      if (op === 'new')
        return this.changeDocument(newDocument(label('app.newFish')));
      if (op === 'example')
        return this.example();
      if (op === 'check')
        return this.checkCompiler();
      if (op === 'develop')
        return this.develop();
      if (op === 'eggs')
        return this.placeEggs();
      if (op === 'download')
        return this.download();
      if (op === 'open')
        return this.root.querySelector('#aid-genome-file')?.click();
    }
    const issue = event.target.closest?.('[data-compiler-issue]');
    if (issue) {
      const center = allCenters(this.state.document)[Number(issue.dataset.compilerIssue)];
      if (center) {
        this.root.querySelector('.aid-compiler').open = false;
        this.select('center', center.id, null, false);
      }
      return;
    }
    const mode = event.target.closest?.('[data-mode]');
    if (mode)
      return this.setMode(mode.dataset.mode);
    if (this.state.station !== 'studio')
      return;
    if (event.target.closest?.('[data-tool]'))
      return this.setTool(event.target.closest('[data-tool]').dataset.tool);
    const history = event.target.closest?.('[data-history]');
    if (history)
      return this.stepHistory(history.dataset.history);
    const zoom = event.target.closest?.('[data-zoom]');
    if (zoom)
      return this.zoom(zoom.dataset.zoom);
    const contacts = event.target.closest?.('[data-contacts]');
    if (contacts) {
      if (contacts.dataset.contacts === 'actual' &&
          (this.state.stale || !this.state.report?.contacts?.length))
        return;
      this.state.contactView = contacts.dataset.contacts;
      return this.renderShell();
    }
    const net = event.target.closest?.('[data-network]');
    if (net) {
      this.state.wireScope = net.dataset.network;
      return this.renderShell();
    }
    if (this.state.mode === 'cppn')
      return this.cppnClick(event);
    const paired = event.target.closest?.('[data-link-pair]');
    if (paired)
      return this.changeDocument(linkPair(this.state.document, paired.dataset.linkPair),
                                 this.state.selected);
    const chosen = findOrgan(this.state.document, this.state.selected?.id);
    const vProfile = event.target.closest?.('[data-vision-profile]');
    if (vProfile) {
      this.state.visionProfile = vProfile.dataset.visionProfile;
      this.refreshInspector();
      this.refreshScene();
      return;
    }
    if (chosen?.field) {
      const profile = chosen.field.profiles.find(p => p.id === this.state.visionProfile) ??
                      chosen.field.profiles[0];
      if (event.target.closest?.('[data-vision-add]')) {
        const p = {
          id : identifier('profile'),
          q1 : ((chosen.field.profiles.length * 137.508) % 360) / 180 - 1,
          q2 : -1,
          qwidth : .15,
          threshold : -.6
        };
        this.state.visionProfile = p.id;
        return this.editField(chosen.id, {addProfile : p});
      }
      if (event.target.closest?.('[data-vision-remove]')) {
        this.state.visionProfile = null;
        return this.editField(chosen.id, {removeProfile : chosen.field.profiles.indexOf(profile)});
      }
    }
    // A muscle moves to the nearest free place with the function asked for.
    const muscle = event.target.closest?.('[data-muscle-function]');
    if (muscle) {
      const found = findCenter(this.state.document, muscle.dataset.centerId);
      const code = Number(muscle.dataset.muscleFunction);
      const used = new Set(allCenters(this.state.document).map(c => c.site));
      const here = this.state.sites.find(s => s.id === found?.center.site);
      const target = here && this.state.sites
                                 .filter(s => !used.has(s.id) && s.side === here.side &&
                                              functionFor(found.center, s) === code &&
                                              eligible(found.center, s))
                                 .sort((a, b) => pointDistance(a, sitePoint(here)) -
                                                 pointDistance(b, sitePoint(here)))[0];
      if (target)
        return this.changeDocument(
            moveOrgan(this.state.document, found.organ.id, this.state.sites, sitePoint(target)),
            this.state.selected);
      return this.notice(label('status.noRoom'));
    }
    const pairing = event.target.closest?.('[data-wire-pairing]');
    if (pairing) {
      const wire = this.state.document.wires.find(w => w.id === pairing.dataset.wirePairing);
      if (wire?.pairing)
        return this.changeDocument(
            updateWire(
                this.state.document, wire.id,
                {pairing : PAIRINGS[(PAIRINGS.indexOf(wire.pairing) + 1) % PAIRINGS.length]}),
            this.state.selected);
    }
    const wireLink = event.target.closest?.('[data-select-wire]');
    if (wireLink)
      return this.select('wire', wireLink.dataset.selectWire);
    const selectedOrgan = event.target.closest?.('[data-select-organ]');
    if (selectedOrgan)
      return this.select('organ', selectedOrgan.dataset.selectOrgan, null, false);
    const selectedModule = event.target.closest?.('[data-select-assembly]');
    if (selectedModule)
      return this.select('assembly', selectedModule.dataset.selectAssembly, null, false);
    const sideButton = event.target.closest?.('[data-center-side]');
    if (sideButton) {
      const moved = moveCenterToSide(this.state.document, sideButton.dataset.centerId,
                                     Number(sideButton.dataset.centerSide), this.state.sites);
      return moved ? this.changeDocument(moved, this.state.selected)
                   : this.notice(label('status.noRoom'));
    }
    // A region's slot starts a wire there: from the region to what is clicked next, or the
    // other way round.
    const slotChip = event.target.closest?.('[data-slot-region]');
    if (slotChip) {
      const region = slotChip.dataset.slotRegion;
      this.setTool('wire');
      if (slotChip.dataset.slotDir === 'out') {
        this.wireStartId = region;
        this.wireStartKind = 'organ';
      } else
        this.wireEndId = region;
      this.state.selected = {kind : 'organ', id : region};
      this.refreshScene();
      return this.notice(
          label(slotChip.dataset.slotDir === 'out' ? 'status.slotOut' : 'status.slotIn'));
    }
    const innerLink = event.target.closest?.('[data-inner-link]');
    if (innerLink)
      return this.changeDocument(toggleInnerLink(this.state.document, innerLink.dataset.organId,
                                                 innerLink.dataset.innerLink),
                                 this.state.selected);
    const regionSetting = event.target.closest?.('[data-region-setting]');
    if (regionSetting)
      return this.changeDocument(
          updateRegion(
              this.state.document, regionSetting.dataset.organId,
              {[regionSetting.dataset.regionSetting] : Number(regionSetting.dataset.regionValue)},
              this.state.sites),
          this.state.selected);
    // A tool opened for a cell group: the group stays chosen.
    const opener = event.target.closest?.('[data-open-tool]');
    if (opener) {
      this.state.selected = {kind : 'center', id : opener.dataset.centerId};
      return this.setTool(opener.dataset.openTool);
    }
    const selectedCenter = event.target.closest?.('[data-select-center]');
    if (selectedCenter) {
      if (selectedCenter.dataset.selectTool)
        this.setTool(selectedCenter.dataset.selectTool);
      return this.select('center', selectedCenter.dataset.selectCenter, null, false);
    }
    const direct = event.target.closest?.(
        '[data-assembly],[data-organ],[data-center],[data-wire],[data-contact]');
    if (direct) {
      const kind = direct.hasAttribute('data-contact')    ? 'contact'
                   : direct.hasAttribute('data-wire')     ? 'wire'
                   : direct.hasAttribute('data-center')   ? 'center'
                   : direct.hasAttribute('data-assembly') ? 'assembly'
                                                          : 'organ';
      const id = direct.dataset[kind];
      if (this.state.tool === 'erase')
        return this.removeSelection({kind, id});
      if (this.state.tool === 'wire' && [ 'organ', 'center', 'assembly' ].includes(kind)) {
        const source = this.wireStartId ? {kind : this.wireStartKind, id : this.wireStartId} : null;
        const end = this.wireEndId;
        this.wireStartId = null;
        this.wireStartKind = 'center';
        this.wireEndId = null;
        if (end && end !== id) {
          if (this.connectSelections({kind, id}, {kind : 'organ', id : end}))
            return this.notice(label('status.wired'));
        } else if (source) {
          if (source.kind !== kind || source.id !== id) {
            if (this.connectSelections(source, {kind, id}))
              return;
          }
        } else if (selectionCenters(this.state.document, {kind, id}).length) {
          this.wireStartId = id;
          this.wireStartKind = kind;
          this.state.selected = {kind, id};
        }
        this.refreshScene();
        this.refreshInspector();
        return;
      }
      if (this.state.tool === 'stimulate') {
        const centers =
            kind === 'organ' ? findOrgan(this.state.document, id)?.centers.map(center => center.id)
            : kind === 'assembly'
                ? this.state.document.assemblies.find(assembly => assembly.id === id)?.centerIds
            : kind === 'center' ? [ id ]
                                : [];
        return centers?.length ? this.stimulate(centers) : undefined;
      }
      if (this.pointer?.moved)
        return;
      return this.select(kind, id, event);
    }
    const remove =
        event.target.closest?.('[data-remove-organ],[data-remove-center],[data-remove-wire]');
    if (remove) {
      const kind = remove.hasAttribute('data-remove-organ')    ? 'organ'
                   : remove.hasAttribute('data-remove-center') ? 'center'
                                                               : 'wire';
      return this.removeSelection(
          {kind, id : remove.dataset['remove' + kind[0].toUpperCase() + kind.slice(1)]});
    }
    if (event.target.closest?.('[data-assemble-selected]')) {
      const organs = [], members = new Set();
      for (const id of this.state.multi) {
        const organ = findOrgan(this.state.document, id);
        if (organ) {
          organs.push(organ.id);
          for (const center of organ.centers)
            members.add(center.id);
        } else {
          const hit = findCenter(this.state.document, id);
          if (hit) {
            organs.push(hit.organ.id);
            members.add(id);
          }
        }
      }
      const draft = assemble(this.state.document, organs, '', [...members ]);
      if (draft)
        return this.changeDocument(draft, {kind : 'assembly', id : draft.assemblies.at(-1).id});
      return;
    }
    if (event.target.closest?.('[data-clear-multi]')) {
      this.state.multi.clear();
      this.state.selected = null;
      this.refreshScene();
      this.refreshInspector();
      return;
    }
    const mirrorGroup = event.target.closest?.('[data-mirror-assembly]');
    if (mirrorGroup) {
      const result =
          mirrorAssembly(this.state.document, mirrorGroup.dataset.mirrorAssembly, this.state.sites);
      if (result)
        this.changeDocument(result.document, {kind : 'assembly', id : result.assemblyId});
      return;
    }
    const removeGroup = event.target.closest?.('[data-remove-assembly]');
    if (removeGroup)
      return this.removeSelection({kind : 'assembly', id : removeGroup.dataset.removeAssembly});
    const setting = event.target.closest?.('[data-set-field]');
    if (setting) {
      const id = setting.dataset.centerId;
      return this.changeDocument(
          updateCenter(this.state.document, id,
                       {[setting.dataset.setField] : Number(setting.dataset.value)}),
          {kind : 'center', id});
    }
    const onWheel = event.target.closest?.('[data-wheel-substance]');
    if (onWheel && this.state.capabilities) {
      const [q1, q2] = wheelPlace(this.state.capabilities, Number(onWheel.dataset.wheelSubstance));
      const id = onWheel.dataset.centerId;
      return this.changeDocument(updateCenter(this.state.document, id, {q1, q2}),
                                 {kind : 'center', id});
    }
    const mirror = event.target.closest?.('[data-mirror-organ]');
    if (mirror) {
      const result = mirrorOrgan(this.state.document, mirror.dataset.mirrorOrgan, this.state.sites);
      if (result)
        this.changeDocument(result.document, {kind : 'organ', id : result.organId});
      return;
    }
    const scent = event.target.closest?.('[data-probe-scent]');
    if (scent && this.state.senseProbe) {
      this.state.senseProbe = {...this.state.senseProbe, scent : Number(scent.dataset.probeScent)};
      this.refreshProbes();
      return this.requestDesign();
    }
    if (event.target.closest?.('[data-add-substance]')) {
      const doc = addSubstance(this.state.document, HORMONES.levels);
      if (doc)
        this.changeDocument(doc, this.state.selected);
      return;
    }
    const rmSub = event.target.closest?.('[data-remove-substance]');
    if (rmSub)
      return this.changeDocument(
          removeSubstance(this.state.document, Number(rmSub.dataset.removeSubstance)),
          this.state.selected);
    if (event.target.closest?.('[data-growth-off]'))
      return this.changeDocument(updateGrowth(this.state.document, {active : 0}),
                                 this.state.selected);
    const grows = event.target.closest?.('[data-growth-substance]');
    if (grows) {
      const growth = this.state.document.growth;
      return this.changeDocument(updateGrowth(this.state.document, {
                                   substance : Number(grows.dataset.growthSubstance),
                                   active : 1,
                                   sensitivity : growth.sensitivity || GROWTH_SENSITIVITY,
                                   half : growth.sensitivity ? growth.half : GROWTH_HALF
                                 }),
                                 this.state.selected);
    }
    const substance = event.target.closest?.('[data-receptor-substance]');
    if (substance) {
      const id = substance.dataset.centerId;
      return this.changeDocument(
          updateReceptor(this.state.document, id, Number(substance.dataset.receptorEffect),
                         {substance : Number(substance.dataset.receptorSubstance), active : 1}),
          {kind : 'center', id});
    }
    const effect = event.target.closest?.('[data-effect]');
    if (effect) {
      this.state.effect = Number(effect.dataset.effect);
      this.refreshScene();
      return this.refreshInspector();
    }
    const count = event.target.closest?.('[data-cell-count]');
    if (count)
      return this.changeDocument(updateCenter(this.state.document, count.dataset.centerId,
                                              {copies : Number(count.dataset.cellCount)}),
                                 {kind : 'center', id : count.dataset.centerId});
    const save = event.target.closest?.('[data-save-assembly]');
    if (save)
      return this.saveAssembly(save.dataset.saveAssembly);
    const ungroup = event.target.closest?.('[data-ungroup-assembly]');
    if (ungroup) {
      const draft = structuredClone(this.state.document);
      draft.assemblies = draft.assemblies.filter(a => a.id !== ungroup.dataset.ungroupAssembly);
      return this.changeDocument(draft);
    }
    if (event.target.closest?.('[data-measure]'))
      return this.measure();
    const scope = event.target.closest?.('[data-select-substance]');
    if (scope) {
      this.state.focusSubstance = Number(scope.dataset.selectSubstance);
      this.refreshLibrary();
      this.refreshScene();
      return this.refreshInspector();
    }
    if (event.target.closest?.('#aid-body-map')) {
      this.wireStartId = null;
      this.wireEndId = null;
      this.wireStartKind = 'center';
      return this.select(null, null);
    }
  }
  async saveAssembly(id) {
    const assembly = this.state.document.assemblies.find(a => a.id === id);
    if (!assembly)
      return;
    const name = moduleName(this.state.document, assembly);
    const memberCenters = new Set(assembly.centerIds ?? []);
    const organs =
        this.state.document.organs.filter(o => assembly.organIds.includes(o.id))
            .map(o => ({
                   ...o,
                   centers : o.type === 'brain' ? o.centers.filter(c => memberCenters.has(c.id))
                                                : o.centers
                 }));
    const wires = this.state.document.wires.filter(w => assembly.wireIds.includes(w.id));
    const module = {id : identifier('module'), name, organs, wires};
    try {
      const result = await this.api(requestBody('save-module', {module}));
      this.state.userModules = result.modules;
      this.renderShell();
    } catch (error) {
      this.notice(error.message);
    }
  }
  async cppnClick(event) {
    const scope = event.target.closest?.('[data-cppn-scope]');
    if (scope) {
      this.state.cppnScope = scope.dataset.cppnScope;
      return this.renderShell();
    }
    const fresh = event.target.closest?.('[data-cppn-new]');
    if (fresh)
      return this.cppnAction('new', {example : fresh.dataset.cppnNew});
    const node = event.target.closest?.('[data-cppn-node]');
    if (node) {
      const id = Number(node.dataset.cppnNode);
      if (this.state.cppnConnectFrom !== null && this.state.cppnConnectFrom !== id) {
        const from = this.state.cppnConnectFrom;
        this.state.cppnConnectFrom = null;
        return this.cppnAction('edit', {edit : 'connect', from, to : id, weight : 1, port : 0});
      }
      this.state.cppnSelection = {kind : 'node', id};
      this.refreshScene();
      this.refreshInspector();
      return;
    }
    const link = event.target.closest?.('[data-cppn-link]');
    if (link) {
      this.state.cppnSelection = {kind : 'link', id : Number(link.dataset.cppnLink)};
      this.refreshScene();
      this.refreshInspector();
      return;
    }
    const start = event.target.closest?.('[data-cppn-connect-from]');
    if (start) {
      this.state.cppnConnectFrom = Number(start.dataset.cppnConnectFrom);
      this.notice(label('cppn.connectFrom'));
      return;
    }
    const split = event.target.closest?.('[data-cppn-split]');
    if (split)
      return this.cppnAction('edit', {edit : 'split', id : Number(split.dataset.cppnSplit)});
    if (event.target.closest?.('[data-cppn-add-node]'))
      return this.cppnAction('edit',
                             {edit : 'add-node', type : DEFAULT_CPPN_NODE_TYPE, parameter : 1});
  }
  change(event) {
    const element = event.target;
    if (element.dataset.compilerOption) {
      const doc = structuredClone(this.state.document);
      doc.compiler =
          {...compilerOptions(doc), [element.dataset.compilerOption] : Number(element.value)};
      return this.changeDocument(doc);
    }
    if (element.dataset.compilerOpen) {
      const doc = structuredClone(this.state.document);
      findOrgan(doc, element.dataset.compilerOpen).openContacts = element.checked;
      return this.changeDocument(doc);
    }
    if (element.id === 'aid-genome-file') {
      const file = element.files?.[0];
      if (!file)
        return;
      file.text()
          .then(async genome => {
            const report = await this.api(requestBody('inspect', {genome}));
            this.state.genome = genome;
            this.state.report = report;
            this.state.stale = false;
            this.setMode('cppn');
          })
          .catch(error => this.notice(error.message));
      return;
    }
    if (this.state.mode === 'cppn' && this.cppnChange(event))
      return;
    // Names are written in place and kept when the field is left.
    if (element.dataset.substanceName !== undefined) {
      this.changeDocument(setSubstance(this.state.document, Number(element.dataset.substanceName),
                                       element.value.trim()),
                          this.state.selected);
      return;
    }
    if (element.dataset.assemblyName !== undefined) {
      this.changeDocument(
          renameAssembly(this.state.document, element.dataset.assemblyName, element.value.trim()),
          this.state.selected);
      return;
    }
    if (element.dataset.regionFollow) {
      this.changeDocument(updateRegion(this.state.document, element.dataset.regionFollow,
                                       {follow : element.checked}, this.state.sites),
                          this.state.selected);
      return;
    }
    if (element.dataset.receptorActive) {
      const id = element.dataset.receptorActive, effect = Number(element.dataset.receptorEffect);
      const receptor = findCenter(this.state.document, id)?.center.receptors[effect];
      const patch = {active : element.checked ? 1 : 0};
      // An output receptor rests at full output, so its substance lowers it; others raise.
      if (element.checked && !receptor?.sensitivity)
        patch.sensitivity = receptor?.baseline > 0 ? -RECEPTOR_ONSET : RECEPTOR_ONSET;
      this.changeDocument(updateReceptor(this.state.document, id, effect, patch),
                          {kind : 'center', id});
      return;
    }
    this.input(event);
  }
  cppnChange(event) {
    const element = event.target;
    const linkId = element.dataset.cppnWeight ?? element.dataset.cppnEnabled;
    if (linkId !== undefined) {
      const link = this.state.report?.cppn?.links.find(e => e[0] === Number(linkId));
      if (!link)
        return true;
      this.cppnAction('edit', {
        edit : 'link',
        id : link[0],
        weight : element.dataset.cppnWeight !== undefined ? Number(element.value) : link[3],
        enabled : element.dataset.cppnEnabled !== undefined ? Number(element.checked) : link[4]
      });
      return true;
    }
    const nodeId = element.dataset.cppnFunction ?? element.dataset.cppnParameter;
    if (nodeId !== undefined) {
      const node = this.state.report?.cppn?.nodes.find(n => n[0] === Number(nodeId));
      if (!node)
        return true;
      this.cppnAction('edit', {
        edit : 'node',
        id : node[0],
        type : element.dataset.cppnFunction !== undefined ? Number(element.value) : node[2],
        parameter : element.dataset.cppnParameter !== undefined ? Number(element.value) : node[1]
      });
      return true;
    }
    return false;
  }
  // How much of a substance a measurement doses.
  input(event) {
    const dose = event.target.closest?.('[data-measure-level]');
    if (!dose)
      return;
    this.state.measureLevel = Number(dose.value);
    const output = dose.closest('.aid-dial')?.querySelector('output');
    if (output)
      output.textContent = measureReading(this.state.measureLevel);
  }
  zoom(direction, anchor = null) {
    const c = this.state.camera, previous = c.zoom;
    c.zoom = direction === 'in'    ? Math.min(CAMERA_ZOOM.max, c.zoom * 1.35)
             : direction === 'out' ? Math.max(CAMERA_ZOOM.min, c.zoom / 1.35)
                                   : 1;
    if (anchor && previous !== c.zoom) {
      c.x += (anchor.x - c.x) * (1 - previous / c.zoom);
      c.y += (anchor.y - c.y) * (1 - previous / c.zoom);
    }
    if (direction === 'fit')
      Object.assign(c, CAMERA_HOME);
    const svg = this.root.querySelector('#aid-body-map');
    if (svg) {
      const box = cameraBox(c);
      svg.setAttribute('viewBox', [ box.x, box.y, box.width, box.height ].join(' '));
      const scale = 1 / c.zoom;
      const marks = svg.querySelectorAll(
          '.aid-neural-center,.aid-assembly-stamp,.aid-vision-handle,.aid-slot-chip,' +
          '.aid-region-badge');
      for (const glyph of marks) {
        const transform = glyph.getAttribute('transform');
        if (transform)
          glyph.setAttribute('transform',
                             transform.replace(/scale\([^)]*\)/, 'scale(' + scale + ')'));
      }
      for (const label of svg.querySelectorAll('.aid-organ-label[data-label-y]')) {
        label.setAttribute('y', Number(label.dataset.labelY) + 47 * scale);
        label.setAttribute('font-size', 14 * scale);
      }
      for (const marker of svg.querySelectorAll('.aid-wire-marker')) {
        marker.setAttribute('markerWidth', arrowSize(c.zoom));
        marker.setAttribute('markerHeight', arrowSize(c.zoom));
      }
      for (const hint of svg.querySelectorAll('.aid-site-hint'))
        hint.setAttribute('transform', 'translate(' + hint.dataset.pointX + ' ' +
                                           hint.dataset.pointY + ') scale(' + scale + ')');
    } else
      this.refreshScene();
    if ((previous >= 1.35) !== (c.zoom >= 1.35))
      this.refreshScene();
    const stamp = this.root.querySelector('.aid-canvas-toolbar');
    if (stamp)
      stamp.textContent = Math.round(c.zoom * 100) + '%';
  }
  wheel(event) {
    const svg = event.target.closest?.('#aid-body-map');
    if (!svg || this.state.mode !== 'fish')
      return;
    event.preventDefault();
    this.zoom(event.deltaY < 0 ? 'in' : 'out', cameraCoordinates(event, svg, this.state.camera));
  }
  dragStart(event) {
    const item = event.target.closest?.('[data-drag-kind]');
    if (!item)
      return;
    const {dragKind : kind, dragValue : value} = item.dataset;
    this.dragging = {kind, value};
    if (DROP_ON_PARTS.includes(kind))
      this.markDropTargets(kind, value);
    if (kind === 'organ' && hasField(value))
      this.prepareChoices(newFieldPlacements(this.state.document, value, this.state.sites));
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-fish-organ', kind + ':' + value);
    if (event.dataTransfer.setDragImage)
      event.dataTransfer.setDragImage(item, item.offsetWidth / 2, item.offsetHeight / 2);
  }
  previewModule(kind, value, position) {
    const placed =
        kind === 'module'
            ? placeModule(this.state.document, value, this.state.sites, position, SNAP_DISTANCE)
            : placeStoredModule(this.state.document,
                                this.state.userModules.find(m => m.id === value), this.state.sites,
                                position, SNAP_DISTANCE);
    return assemblyPreview(this.state, placed);
  }
  dragOver(event) {
    const svg = event.target.closest?.('#aid-body-map');
    if (!svg || !this.dragging || !this.state.sites.length)
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const position = cameraCoordinates(event, svg, this.state.camera);
    if (DROP_ON_PARTS.includes(this.dragging.kind)) {
      const target = this.dropTarget(event);
      for (const element of svg.querySelectorAll('.aid-drop-hover'))
        element.classList.toggle('aid-drop-hover', element === target?.element);
      target?.element.classList.add('aid-drop-hover');
      return;
    }
    if (this.dragging.kind === 'organ' && hasField(this.dragging.value)) {
      this.showChoices(position);
      return;
    }
    if (!nearFish(position, this.state.sites)) {
      this.clearPreview();
      return;
    }
    // A gland or a blood sense from a substance card is placed as the organ it is.
    const {kind, value} = ORGAN_FROM_CARD[this.dragging.kind] ?? this.dragging;
    const module = kind === 'module' || kind === 'user-module';
    const preview = this.root.querySelector('#aid-drag-preview');
    if (preview)
      preview.innerHTML = module ? this.previewModule(kind, value, position)
                                 : organPreview(this.state, kind, value, position);
    this.showHints(kind, value, kind + ':' + value);
  }
  // Where the dragged item may go, and what the hints' colours stand for.
  showHints(kind, value, key, moving = null) {
    const hints = this.root.querySelector('#aid-placement-hints');
    if (!hints || hints.dataset.active === key)
      return;
    const displayed = placementHints(this.state, kind, value, moving);
    hints.innerHTML = displayed.svg;
    hints.dataset.active = key;
    const legend = this.root.querySelector('[data-hint-legend]');
    if (legend) {
      legend.innerHTML = hintLegend(displayed.legend);
      legend.hidden = !displayed.legend.length;
    }
  }
  drop(event) {
    const svg = event.target.closest?.('#aid-body-map');
    if (!svg || !this.dragging)
      return;
    event.preventDefault();
    const position = cameraCoordinates(event, svg, this.state.camera);
    const {kind, value} = this.dragging;
    if (DROP_ON_PARTS.includes(kind))
      return this.dropOnPart(kind, value, this.dropTarget(event));
    if (ORGAN_FROM_CARD[kind])
      return this.dropFromCard(kind, value, position);
    this.dragging = null;
    this.clearPreview();
    if (kind === 'organ' && hasField(value) && this.state.choices) {
      if (!this.commitChoice(position))
        return this.notice(label('status.noRoom'));
      this.state.tool = 'select';
      this.refreshTools();
      return this.notice(label('status.placed'));
    }
    this.cancelChoices();
    if (!nearFish(position, this.state.sites))
      return this.notice(label('status.noRoom'));
    let result;
    // A brain region takes its spot in the brain on the side it was dropped on.
    const spot = kind === 'organ' && regionSpot(value, position.y < BODY_FRAME.middle ? -1 : 1);
    if (kind === 'organ')
      result =
          addOrgan(this.state.document, value, this.state.sites, spot || position, SNAP_DISTANCE);
    if (kind === 'neuron')
      result = addNeuron(this.state.document, value, this.state.sites, position, SNAP_DISTANCE);
    if (kind === 'module')
      result = placeModule(this.state.document, value, this.state.sites, position, SNAP_DISTANCE);
    if (kind === 'user-module')
      result =
          placeStoredModule(this.state.document, this.state.userModules.find(m => m.id === value),
                            this.state.sites, position, SNAP_DISTANCE);
    if (!result)
      return this.notice(label('status.noRoom'));
    this.state.tool = 'select';
    this.changeDocument(result.document, {
      kind : result.assemblyId            ? 'assembly'
             : result.organId === 'brain' ? 'center'
                                          : 'organ',
      id : result.assemblyId ?? (result.organId === 'brain' ? result.centerId : result.organId)
    });
    this.refreshTools();
    this.notice(label('status.placed'));
  }
  // The parts a dragged effect or life phase can act on: the organs and nodes whose cells the
  // engine lets carry it; the others fade while it is dragged.
  dropCenters(kind, value, centers) {
    const effects = kind === 'phase' ? [ HORMONE_EFFECT.output, HORMONE_EFFECT.death ]
                                     : [ Number(value.split(':')[1]) ];
    const roles = this.state.capabilities?.roleEffects ?? [];
    return centers.filter(c => effects.every(e => roles[ROLE[c.role]]?.includes(e)));
  }
  markDropTargets(kind, value) {
    const svg = this.root.querySelector('#aid-body-map');
    if (!svg)
      return;
    svg.classList.add('aid-dropping');
    for (const element of svg.querySelectorAll('[data-organ],[data-center]')) {
      const organ = findOrgan(this.state.document, element.dataset.organ);
      const center = organ ? null : findCenter(this.state.document, element.dataset.center)?.center;
      if (this.dropCenters(kind, value, organ ? organ.centers : center ? [ center ] : []).length)
        element.classList.add('aid-drop-target');
    }
  }
  // The organ or node under a dragged effect, when it can carry it.
  dropTarget(event) {
    const element = event.target.closest?.('[data-center],[data-organ]');
    if (!element?.classList.contains('aid-drop-target'))
      return null;
    const organ = findOrgan(this.state.document, element.dataset.organ);
    const centers =
        organ ? organ.centers
              : [ findCenter(this.state.document, element.dataset.center)?.center ].filter(Boolean);
    return {element, centers : this.dropCenters(this.dragging.kind, this.dragging.value, centers)};
  }
  // An effect dropped on a part binds the substance with the receptor for it on every cell there
  // that can carry it, with a starting strength (DROPPED_RECEPTOR) where it had none; a life
  // phase starts or ends there at PHASE_DROPPED.
  dropOnPart(kind, value, target) {
    this.dragging = null;
    this.clearPreview();
    if (!target?.centers.length)
      return this.notice(label('hormoneCard.noTarget'));
    let doc = this.state.document;
    for (const center of target.centers) {
      if (kind === 'phase') {
        const c = this.state.capabilities;
        doc = setLifePhase(doc, center.id, {[value] : PHASE_DROPPED[value]}, c.sensitivitySpan,
                           c.steepnessSteps) ??
              doc;
        continue;
      }
      const [substance, effect] = value.split(':').map(Number);
      const current = findCenter(doc, center.id)?.center.receptors[effect];
      doc =
          updateReceptor(
              doc, center.id, effect,
              {...(current?.sensitivity ? {} : DROPPED_RECEPTOR[effect]), active : 1, substance}) ??
          doc;
    }
    // The inspector opens on what was dropped.
    if (kind === 'effect')
      this.state.effect = Number(value.split(':')[1]);
    this.changeDocument(doc, {kind : 'center', id : target.centers[0].id});
  }
  // A gland dragged from a substance card releases that substance; a blood sense from the body's
  // signals reads the energy reserve.
  dropFromCard(kind, value, position) {
    this.dragging = null;
    this.clearPreview();
    const wheel = this.state.capabilities;
    if (!wheel || !nearFish(position, this.state.sites))
      return this.notice(label('status.noRoom'));
    const organ = ORGAN_FROM_CARD[kind].value;
    const result = addOrgan(this.state.document, organ, this.state.sites, position, SNAP_DISTANCE);
    if (!result)
      return this.notice(label('status.noRoom'));
    const index = kind === 'gland' ? Number(value) : HORMONES.levels + 1;
    const [q1, q2] = wheelPlace(wheel, index);
    this.changeDocument(updateCenter(result.document, result.centerId, {q1, q2, qwidth : 0}),
                        {kind : 'organ', id : result.organId});
    this.notice(label('status.placed'));
  }
  clearPreview() {
    for (const element of this.root.querySelectorAll('.aid-drop-target,.aid-drop-hover'))
      element.classList.remove('aid-drop-target', 'aid-drop-hover');
    this.root.querySelector('#aid-body-map')?.classList.remove('aid-dropping');
    this.root.querySelector('#aid-drag-preview')?.replaceChildren();
    const hints = this.root.querySelector('#aid-placement-hints');
    if (hints) {
      hints.replaceChildren();
      hints.dataset.active = '';
    }
    const legend = this.root.querySelector('[data-hint-legend]');
    if (legend)
      legend.hidden = true;
  }
  pointerDown(event) {
    const grip = event.target.closest?.('[data-panel-grip]');
    if (grip && event.button === 0) {
      const panel = grip.dataset.panelGrip;
      this.panelControl = {
        panel,
        x : event.clientX,
        width : grip.parentElement.getBoundingClientRect().width,
        // The library grows to the right, the inspector to the left.
        sign : panel === 'library' ? 1 : -1
      };
      event.preventDefault();
      return;
    }
    if ((event.button !== 0 && event.button !== 1) || this.state.station !== 'studio' ||
        this.state.mode !== 'fish')
      return;
    // Graphics move only by their handles.
    const spectrum =
        event.target.closest?.('[data-spectrum-handle]') && event.target.closest('[data-spectrum]');
    if (spectrum) {
      this.spectrumControl = {
        target : {...spectrum.dataset},
        handle : event.target.closest('[data-spectrum-handle]').dataset.spectrumHandle,
        rect : spectrum.getBoundingClientRect()
      };
      event.preventDefault();
      this.spectrumPointer(event);
      return;
    }
    const sensitivity = event.target.closest?.('[data-sensitivity-handle]') &&
                        event.target.closest('[data-sensitivity]');
    if (sensitivity) {
      const block = sensitivity.closest('[data-sensitivity-block]');
      const target = block && this.sensitivityTarget(block);
      const centers = allCenters(this.state.document);
      const answer =
          target?.organ
              ? this.state.anatomy?.light?.[centers.findIndex(c => c.organId === target.organ.id &&
                                                                   c.profile === target.tuning.id)]
              : this.state.anatomy?.senses?.[centers.findIndex(c => c.id === target?.center.id)];
      if (target && answer?.half > 0) {
        this.sensitivityControl = {
          field : target.organ?.id ?? null,
          block : target.tuning.id,
          threshold : target.tuning.threshold,
          log : target.organ ? true : answer.intensity,
          answer,
          shift : 1,
          dragged : null,
          rect : sensitivity.getBoundingClientRect()
        };
        event.preventDefault();
        this.sensitivityPointer(event);
      }
      return;
    }
    // A receptor's curve and its width on the substance wheel follow their handles.
    const curve = event.target.closest?.('[data-curve-handle]') &&
                  event.target.closest('[data-receptor-curve]');
    const width = event.target.closest?.('[data-wheel-width]');
    if (curve || width) {
      const element = curve ?? width.closest('svg');
      this.receptorControl = {
        target : curve ? curve.dataset.receptorCurve : width.dataset.wheelWidth,
        handle : curve ? event.target.closest('[data-curve-handle]').dataset.curveHandle : 'width',
        rect : element.getBoundingClientRect()
      };
      event.preventDefault();
      this.receptorPointer(event);
      return;
    }
    const phase =
        event.target.closest?.('[data-phase-handle]') && event.target.closest('[data-phase]');
    if (phase) {
      this.driveControl = {
        id : phase.dataset.phase,
        handle : event.target.closest('[data-phase-handle]').dataset.phaseHandle,
        rect : phase.getBoundingClientRect()
      };
      event.preventDefault();
      this.drivePointer(event);
      return;
    }
    const effector = event.target.closest?.('[data-effector-handle]') &&
                     event.target.closest('[data-effector-graphic]');
    if (effector) {
      this.driveControl = {
        id : effector.dataset.effectorGraphic,
        handle : 'effector',
        name : event.target.closest('[data-effector-handle]').dataset.effectorHandle,
        code : Number(effector.dataset.effectorCode),
        side : Number(effector.dataset.effectorSide),
        rect : effector.getBoundingClientRect()
      };
      event.preventDefault();
      this.drivePointer(event);
      return;
    }
    const stretch =
        event.target.closest?.('[data-stretch-handle]') && event.target.closest('[data-stretch]');
    if (stretch) {
      this.driveControl = {
        id : stretch.dataset.stretch,
        handle : 'stretch',
        rect : stretch.getBoundingClientRect()
      };
      event.preventDefault();
      this.drivePointer(event);
      return;
    }
    const drive = event.target.closest?.('[data-drive]');
    if (drive) {
      const handle = event.target.closest?.('[data-drive-handle]')?.dataset.driveHandle;
      if (handle) {
        this.driveControl = {
          id : drive.dataset.drive,
          handle,
          rect : drive.getBoundingClientRect()
        };
        event.preventDefault();
        this.drivePointer(event);
      }
      return;
    }
    const adaptation = event.target.closest?.('[data-adaptation]');
    if (adaptation) {
      const id = adaptation.dataset.adaptationId;
      const adapt =
          this.state.anatomy?.senses?.[allCenters(this.state.document).findIndex(c => c.id === id)]
              ?.adapt;
      if (adapt) {
        this.adaptationControl =
            {id, adapt, stretch : 1, rect : adaptation.getBoundingClientRect()};
        event.preventDefault();
        this.adaptationPointer(event);
      }
      return;
    }
    const probePad = event.target.closest?.('[data-probe-pad]');
    if (probePad) {
      this.probeControl = {id : probePad.dataset.probePad, rect : probePad.getBoundingClientRect()};
      event.preventDefault();
      this.probePointer(event);
      return;
    }
    const handle = event.target.closest?.('[data-vision-handle]');
    if (handle) {
      this.visionControl = {key : handle.dataset.visionHandle, id : handle.dataset.visionId};
      event.preventDefault();
      this.visionPointer(event);
      return;
    }
    const graphic = event.target.closest?.(
        '[data-compass],[data-vector-pad],[data-learning-pad],[data-output-pad],[data-wire-pad],[data-contact-pad],[data-spine-pad],[data-lateral-pad]');
    if (graphic) {
      const kind = graphic.hasAttribute('data-compass')        ? 'compass'
                   : graphic.hasAttribute('data-contact-pad')  ? 'contact'
                   : graphic.hasAttribute('data-spine-pad')    ? 'spines'
                   : graphic.hasAttribute('data-lateral-pad')  ? 'lateral'
                   : graphic.hasAttribute('data-learning-pad') ? 'learning'
                   : graphic.hasAttribute('data-output-pad')   ? 'output'
                   : graphic.hasAttribute('data-wire-pad')     ? 'wire'
                                                               : 'vector';
      const key = {
        vector : 'vectorPad',
        learning : 'learningPad',
        output : 'outputPad',
        wire : 'wirePad',
        contact : 'contactPad',
        spines : 'spinePad',
        lateral : 'lateralPad'
      }[kind] ?? kind;
      const handle = event.target.closest?.('[data-graphic-handle]')?.dataset.graphicHandle ?? null;
      if ((kind === 'contact' || kind === 'spines' || kind === 'lateral') && !handle)
        return;
      this.controlPointer = {
        element : graphic,
        kind,
        id : graphic.dataset[key],
        handle,
        rect : graphic.getBoundingClientRect()
      };
      event.preventDefault();
      this.tuneGraphic(event);
      return;
    }
    const svg = event.target.closest?.('#aid-body-map');
    if (!svg)
      return;
    const item = event.target.closest?.(
        '[data-center],[data-organ],[data-assembly],[data-wire],[data-contact]');
    const kind = item?.hasAttribute('data-contact')    ? 'contact'
                 : item?.hasAttribute('data-center')   ? 'center'
                 : item?.hasAttribute('data-assembly') ? 'assembly'
                 : item?.hasAttribute('data-organ')    ? 'organ'
                 : item?.hasAttribute('data-wire')     ? 'wire'
                                                       : null;
    const id = kind ? item.dataset[kind] : null;
    this.pointer = {
      id,
      kind,
      x : event.clientX,
      y : event.clientY,
      moved : false,
      origin : cameraCoordinates(event, svg, this.state.camera),
      svg
    };
    if (this.state.tool === 'wire' && [ 'center', 'organ', 'assembly' ].includes(kind))
      this.pointer.wireFrom = {kind, id};
    else if (kind === 'organ' && this.state.tool === 'select' &&
             findOrgan(this.state.document, id)?.field)
      this.prepareChoices(fieldPlacements(this.state.document, id, this.state.sites));
    // Dragging on nothing moves the view, whatever the tool.
    if (this.state.tool === 'pan' || !kind || event.button === 1)
      this.pointer.pan = {x : this.state.camera.x, y : this.state.camera.y};
  }
  // A side panel follows its grip; the scene takes the rest.
  panelPointer(event) {
    const drag = this.panelControl, [ low, high ] = PANEL_WIDTH[drag.panel];
    const width = Math.round(
        Math.max(low, Math.min(high, drag.width + drag.sign * (event.clientX - drag.x))));
    this.state.panels = {...this.state.panels, [drag.panel] : width};
    this.root.querySelector('.aid-workspace-main')
        ?.setAttribute('style', panelStyle(this.state.panels));
  }
  pointerMove(event) {
    if (this.panelControl)
      return this.panelPointer(event);
    if (this.sensitivityControl)
      return this.sensitivityPointer(event);
    if (this.adaptationControl)
      return this.adaptationPointer(event);
    if (this.driveControl)
      return this.drivePointer(event);
    if (this.receptorControl)
      return this.receptorPointer(event);
    if (this.spectrumControl)
      return this.spectrumPointer(event);
    if (this.visionControl)
      return this.visionPointer(event);
    if (this.probeControl)
      return this.probePointer(event);
    if (this.controlPointer)
      return this.tuneGraphic(event);
    const drag = this.pointer;
    if (!drag) {
      const svg = event.target?.closest?.('#aid-body-map');
      if (svg && this.wireStartId && this.state.tool === 'wire') {
        const from = this.wirePoint({kind : this.wireStartKind, id : this.wireStartId});
        const line = this.root.querySelector('#aid-connecting-line');
        if (from && line) {
          const to = cameraCoordinates(event, svg, this.state.camera);
          line.setAttribute('d', 'M' + from.x + ' ' + from.y + ' L' + to.x + ' ' + to.y);
        }
      }
      return;
    }
    if (this.state.station !== 'studio')
      return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5)
      drag.moved = true;
    if (!drag.moved)
      return;
    const point = cameraCoordinates(event, drag.svg, this.state.camera);
    if (drag.pan) {
      const rect = this.root.querySelector('#aid-body-map')?.getBoundingClientRect() ||
                   drag.svg.getBoundingClientRect();
      const scale = cameraScale(rect, this.state.camera);
      if (!(scale > 0))
        return;
      this.state.camera.x = drag.pan.x - (event.clientX - drag.x) / scale;
      this.state.camera.y = drag.pan.y - (event.clientY - drag.y) / scale;
      const box = cameraBox(this.state.camera);
      drag.svg.setAttribute('viewBox', [ box.x, box.y, box.width, box.height ].join(' '));
      return;
    }
    if (drag.wireFrom) {
      const from = this.wirePoint(drag.wireFrom) ?? drag.origin;
      const line = this.root.querySelector('#aid-connecting-line');
      if (line)
        line.setAttribute('d', 'M' + from.x + ' ' + from.y + ' L' + point.x + ' ' + point.y);
      return;
    }
    if ([ 'organ', 'center', 'assembly' ].includes(drag.kind)) {
      this.showTrash(true);
      if (this.overTrash(event)) {
        this.root.querySelector('#aid-drag-preview')?.replaceChildren();
        return;
      }
      const organ = drag.kind === 'organ' ? findOrgan(this.state.document, drag.id) : null;
      if (organ?.field)
        return this.showChoices(point);
      if (organ)
        this.showHints('organ', organ.type, drag.id, organ.id);
      const preview = this.root.querySelector('#aid-drag-preview');
      if (preview)
        preview.innerHTML =
            nearFish(point, this.state.sites)
                ? placementPreview(this.state,
                                   {type : drag.kind === 'organ'
                                               ? findOrgan(this.state.document, drag.id)?.type
                                           : drag.kind === 'assembly'
                                               ? 'brain'
                                               : findCenter(this.state.document, drag.id)?.organ.type},
                                   point)
                : '';
    }
  }
  pointerUp(event) {
    if (this.panelControl) {
      this.panelPointer(event);
      this.panelControl = null;
      try {
        localStorage.setItem(PANEL_STORE, JSON.stringify(this.state.panels));
      } catch {
        // Without storage the width lasts until the page is left.
      }
      this.refreshScene();
      return;
    }
    if (this.receptorControl) {
      this.receptorPointer(event);
      this.receptorControl = null;
      this.historyBatch = null;
      this.ignoreClickUntil = performance.now() + 350;
      return;
    }
    if (this.driveControl) {
      this.drivePointer(event);
      this.driveControl = null;
      this.historyBatch = null;
      this.ignoreClickUntil = performance.now() + 350;
      return;
    }
    if (this.adaptationControl) {
      this.adaptationPointer(event);
      this.adaptationControl = null;
      this.historyBatch = null;
      this.ignoreClickUntil = performance.now() + 350;
      this.refreshSensitivity();
      return;
    }
    if (this.sensitivityControl) {
      this.sensitivityPointer(event);
      this.sensitivityControl = null;
      this.historyBatch = null;
      this.ignoreClickUntil = performance.now() + 350;
      this.refreshSensitivity();
      return;
    }
    if (this.spectrumControl) {
      this.spectrumPointer(event);
      this.spectrumControl = null;
      this.historyBatch = null;
      this.ignoreClickUntil = performance.now() + 350;
      this.refreshInspector();
      return;
    }
    if (this.probeControl) {
      this.probePointer(event);
      this.probeControl = null;
      this.ignoreClickUntil = performance.now() + 350;
      return;
    }
    if (this.visionControl) {
      this.visionPointer(event);
      this.visionControl = null;
      this.historyBatch = null;
      this.ignoreClickUntil = performance.now() + 350;
      this.refreshInspector();
      return;
    }
    if (this.controlPointer) {
      this.tuneGraphic(event);
      this.controlPointer = null;
      this.historyBatch = null;
      this.refreshInspector();
      return;
    }
    const drag = this.pointer;
    if (!drag)
      return;
    this.pointer = null;
    const trashed = this.overTrash(event);
    this.showTrash(false);
    if (!drag.moved)
      return this.cancelChoices();
    this.ignoreClickUntil = performance.now() + 350;
    event.preventDefault();
    if (drag.wireFrom) {
      this.wireStartId = null;
      this.wireStartKind = 'center';
      const target = document.elementFromPoint(event.clientX, event.clientY)
                         ?.closest?.('[data-center],[data-organ],[data-assembly]');
      const kind = target?.hasAttribute('data-center')     ? 'center'
                   : target?.hasAttribute('data-organ')    ? 'organ'
                   : target?.hasAttribute('data-assembly') ? 'assembly'
                                                           : null;
      if (kind)
        this.connectSelections(drag.wireFrom, {kind, id : target.dataset[kind]});
      this.clearPreview();
      return;
    }
    if (drag.pan)
      return this.cancelChoices();
    if (!['center', 'organ', 'assembly'].includes(drag.kind))
      return this.cancelChoices();
    if (trashed) {
      this.cancelChoices();
      this.clearPreview();
      this.removeSelection({kind : drag.kind, id : drag.id});
      return this.notice(label('status.removed'));
    }
    if (drag.kind === 'organ' && findOrgan(this.state.document, drag.id)?.field) {
      const point = cameraCoordinates(event, drag.svg, this.state.camera);
      this.clearPreview();
      if (!this.commitChoice(point))
        this.notice(label('status.noRoom'));
      return;
    }
    const bounds = this.root.querySelector('.aid-scene-frame')?.getBoundingClientRect();
    if (!bounds)
      return;
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
                   event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    const point = cameraCoordinates(event, drag.svg, this.state.camera);
    if (!inside || !nearFish(point, this.state.sites))
      return this.clearPreview();
    const used =
        new Set(allCenters(this.state.document).filter(c => c.id !== drag.id).map(c => c.site));
    if (drag.kind === 'center') {
      const center = findCenter(this.state.document, drag.id)?.center;
      const site = center && closestSite(center, this.state.sites, used, point, null,
                                         findCenter(this.state.document, drag.id)?.organ.type);
      if (site &&
          pointDistance(site, point, findCenter(this.state.document, drag.id)?.organ.type) <=
              SNAP_DISTANCE)
        this.changeDocument(moveCenter(this.state.document, drag.id, site.id, this.state.sites),
                            {kind : 'center', id : drag.id});
      else
        this.notice(label('status.noRoom'));
    } else if (drag.kind === 'organ') {
      const doc = moveOrgan(this.state.document, drag.id, this.state.sites, point, SNAP_DISTANCE,
                            drag.origin);
      if (doc)
        this.changeDocument(doc, {kind : 'organ', id : drag.id});
      else
        this.notice(label('status.noRoom'));
    } else {
      const doc = moveAssembly(this.state.document, drag.id, this.state.sites, point, drag.origin,
                               SNAP_DISTANCE);
      if (doc)
        this.changeDocument(doc, {kind : 'assembly', id : drag.id});
      else
        this.notice(label('status.noRoom'));
    }
    this.clearPreview();
  }
  keydown(event) {
    const handle = event.target.closest?.('[data-vision-handle]');
    if (handle && [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ].includes(event.key)) {
      const organ = findOrgan(this.state.document, handle.dataset.visionId),
            key = handle.dataset.visionHandle;
      if (organ && key !== 'probe') {
        event.preventDefault();
        const direction = [ 'ArrowUp', 'ArrowRight' ].includes(event.key) ? 1 : -1;
        this.editField(organ.id,
                       {[key] : organ.field[key] + direction * (key === 'resolution' ? .02 : 1)});
        this.root
            .querySelector('[data-vision-handle="' + key + '"][data-vision-id="' + organ.id + '"]')
            ?.focus();
      }
      return;
    }
    if (this.state.station !== 'studio' || event.target.closest?.('input,textarea,select'))
      return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey &&
        [ 'z', 'y' ].includes(event.key.toLowerCase())) {
      event.preventDefault();
      return this.stepHistory(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
    }
    if (event.key === 'Escape') {
      this.wireStartId = null;
      this.wireEndId = null;
      this.wireStartKind = 'center';
      this.state.selected = null;
      this.state.multi.clear();
      this.clearPreview();
      this.refreshScene();
      this.refreshInspector();
    }
    if (event.key === 'Delete' || event.key === 'Backspace')
      this.removeSelection(this.state.selected);
  }
}
export function initializeStudio() {
  const root = document.getElementById('station-root');
  if (!root)
    return;
  instance = new OrganStudio(root);
  instance.initialize();
}
