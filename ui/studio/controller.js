import {
  ANYWHERE_CLICKS,
  changeOn,
  clickOn,
  FISH_CHANGES,
  FISH_CLICKS,
  markedKind,
  STUDIO_CLICKS
} from './events.js';
import {exampleDocument} from './model/example.js';
import {DRAG_CLICK, DRAG_START, GRIPS, handleMethods, HANDLES, storedPanels} from './handles.js';
import {dropMethods} from './drops.js';
import {compilerPanel, compilerProgress, acceptedGenome} from './view/compiler.js';
import {nearAnswers, sensitivityEditor, spectrumEditor, visionFan} from './view/vision.js';
import {effectorGraphic, gutGraphic, spineField} from './view/effectors.js';
import {lateralField} from './view/lateral.js';
import {defaultSight, sightScene} from './model/sight.js';
import {probeFor, senseScene} from './model/probe.js';
import {probeField} from './view/probes.js';
import {scentMap} from './view/scents.js';
import {pigmentInspector} from './view/pigments.js';
import {eyeSight} from '../organ_readout.js';
import {drawOrganGraphic} from '../organ_graphics.js';
import {SENSE_TISSUE} from '../tissue.js';
import {organFunction, PRESSURE_OF} from './model/organs.js';
import {fieldPlacements} from './model/placement.js';
import {beginEggPlacement} from '../world.js';
import {ATELIER_LIMITS, HORMONE_EFFECT, MOTOR_KIND, RECEPTOR, ROUTE} from '../schema.js';
import {request as sessionRequest, serverText} from '../session.js';
import {t} from '../strings.js';
import {
  allCenters,
  centerIndex,
  closestSite,
  compileDocument,
  compilerOptions,
  connectSelections,
  endpointCenters,
  findCenter,
  findOrgan,
  identifier,
  moveAssembly,
  moveCenter,
  moveOrgan,
  newDocument,
  nodeSitesNear,
  organOf,
  placeNode,
  removeAssembly,
  removeCenter,
  removeOrgan,
  removeWire,
  selectionCenters,
  setLifePhase,
  updateField,
  usedSites,
  validateDocument,
  wholeEndpoint
} from './model/document.js';
import {centroid, nearFish, pointDistance, sideOf, SNAP_DISTANCE} from './model/layout.js';
import {CAMERA_HOME, CAMERA_ZOOM, cameraBox, cameraCoordinates, cameraScale} from './view/frame.js';
import {fishScene, organLabelPlace} from './view/scene.js';
import {dataAttribute, fixed} from './view/markup.js';
import {nodeLocation, nodesAtZoom} from './view/body.js';
import {inspector, sensorAdaptation, sensorAnswer} from './view/panels.js';
import {
  cppnGraph,
  cppnInspector,
  DEFAULT_CPPN_NODE_TYPE,
  findCppnLink,
  findCppnNode
} from './view/graph.js';
import {SIGNAL, createSignalPlayer, signalSchedule} from './view/pulse.js';
import {routedLinks, settleRegions} from './model/regions.js';
import {cellStatus, hubShell, stationShell, zoomStamp} from './view/shell.js';
import {measureReading} from './view/substances.js';
import {hormoneLibrary, library, toolPalette} from './view/library.js';
import {label} from './view/kit.js';
import {arrowSize, signalLinks} from './view/wires.js';
import {moduleName} from './view/names.js';
import {placementPreview} from './view/placing.js';

// A measurement doses MEASURE_LEVEL of a substance into the grown fish (maturity MEASURE_MATURITY).
const MEASURE_LEVEL = .5, MEASURE_MATURITY = 1;

const API = ROUTE.atelier;
const requestBody = (operation, extra = {}) => ({operation, ...extra});
const PRESSURE_TRIES = 12;
let instance = null;
// The items on the fish, by the data attributes that mark them: those a press on the scene takes
// and those a wire dragged out ends on.
const PRESSED_ITEMS = Object.freeze([ 'contact', 'center', 'assembly', 'organ', 'wire' ]);
const WIRE_ENDS = Object.freeze([ 'center', 'organ', 'assembly' ]);
const itemSelector = kinds => kinds.map(kind => '[' + dataAttribute(kind) + ']').join(',');
// An arrow key moves a field organ's handle by a degree, its resolution by FIELD_KEY_STEP.
const FIELD_KEY_STEP = Object.freeze({resolution : .02});
// How long the engine may take to answer (ms): usually, and when it develops or runs the fish.
const API_WAIT = Object.freeze({usual : 35000, long : 60000});
// The draft is saved SAVE_DELAY ms after its last change; a build is asked how far it got every
// BUILD_POLL ms; undo reaches HISTORY_DEPTH changes back; a stimulus runs PULSE_STEPS steps.
const SAVE_DELAY = 400, BUILD_POLL = 150, HISTORY_DEPTH = 40, PULSE_STEPS = 24;
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
      compileProgress : null,
      // The compiler's check of the developed genome, and the network a stimulus reached.
      robustness : null,
      stimulus : null,
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
    this.handleDrag = null;
    this.undoHistory = [];
    this.redoHistory = [];
    this.historyBatch = null;
    this.designRunning = false;
    this.designPending = false;
    this.choiceFrame = 0;
    this.choicePoint = null;
    this.shownChoice = null;
    // The build under way and whether it was cancelled; the design last shown and last checked
    // for pressure.
    this.compileJob = null;
    this.cancelCompile = false;
    this.shownDesign = null;
    this.pressureChecked = null;
  }
  async api(body, timeout = API_WAIT.usual) {
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
    return centroid(points);
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
    this.root.innerHTML = s.station === 'hub' ? hubShell() : stationShell(s);
    if (s.station !== 'hub')
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
      status.textContent = cellStatus(this.state);
    const progress = this.root.querySelector('[data-compile-progress]');
    if (progress)
      progress.textContent = compilerProgress(state);
    const cancel = this.root.querySelector('[data-action="cancel-build"]');
    if (cancel)
      cancel.hidden = !state.compileProgress;
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
      if (this.undoHistory.length > HISTORY_DEPTH)
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
    target.push(this.state.document);
    this.state.document = validateDocument(source.pop());
    this.historyBatch = null;
    this.state.canUndo = this.undoHistory.length > 0;
    this.state.canRedo = this.redoHistory.length > 0;
    this.state.selected = null;
    this.state.multi.clear();
    this.designChanged();
    this.refreshScene();
    this.refreshHeader();
    this.refreshInspector();
    this.refreshTools();
    this.requestDesign();
    return true;
  }
  // The pigment inspector follows its cells and the engine's colours.
  refreshPigment() {
    const selected = this.state.selected;
    this.redrawBlocks('pigmentBlock', findOrgan, organ => {
      const chosen = selected?.kind === 'center' && organ.centers.find(c => c.id === selected.id);
      return pigmentInspector(this.state, organ, chosen || organ.centers[0]);
    });
  }
  // A nose's scent map follows its dragged preference.
  refreshScentMaps() {
    this.redrawBlocks('scentBlock', findCenter, found => scentMap(found.organ, found.center));
  }
  persist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.api(requestBody('save-draft', {document : this.state.document}))
          .catch(error => this.notice(error.message));
    }, SAVE_DELAY);
  }
  changeDocument(doc, selected = null, updateInspector = true, batch = null, finish = false) {
    if (!doc)
      return false;
    this.recordHistory(batch);
    if (finish)
      this.historyBatch = null;
    // Regions with a plan follow every change at once.
    this.state.document = validateDocument(settleRegions(doc, this.state.sites));
    this.state.selected = selected;
    this.state.multi.clear();
    this.designChanged();
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
  // The design changed: what was developed, stimulated or measured from it no longer holds, and
  // it is saved; the engine is asked for its view anew once the studio shows the change.
  designChanged() {
    this.stopPulse();
    this.state.stimulus = null;
    this.state.stale = true;
    this.state.contactView = 'design';
    this.state.measurement = null;
    this.state.genome = '';
    this.persist();
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
    const cell = this.state.selected?.kind === 'center'
                     ? findCenter(this.state.document, this.state.selected.id)
                     : null;
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
    const organ = organOf(doc, id);
    if (!organ)
      return;
    const sense = probeFor(organ, this.state.senseProbe);
    if (sense && sense !== this.state.senseProbe) {
      this.state.senseProbe = sense;
      this.requestDesign();
    }
    if (!organ.field || !this.state.capabilities)
      return;
    const side = sideOf(organ), probe = this.state.sightProbe;
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
      const index = centerIndex(doc, center.id);
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
    this.redrawBlocks('visionOrgan', findOrgan, organ => visionFan(this.state, organ),
                      '#aid-body-map');
  }
  // The inspector's graphics follow the design at once and the engine's curves when they
  // arrive, without rebuilding the inspector around them.
  refreshGraphics() {
    this.refreshSpectrum();
    this.refreshSensitivity();
    this.refreshEffectors();
    this.refreshPigment();
    this.drawSight();
    this.refreshProbes();
  }
  // A sense probe follows the design view's answers and its dragged stimulus, a near sense's
  // answers the test object.
  refreshProbes() {
    this.redrawBlocks('probeBlock', findOrgan, organ => probeField(this.state, organ));
    this.redrawBlocks('nearAnswers', findOrgan, organ => nearAnswers(this.state, organ));
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
  // The spectrum editor follows its tuning at once and the engine's curves when they arrive.
  refreshSpectrum() {
    const block = this.root.querySelector('[data-spectrum-block]');
    const editor = block?.querySelector('[data-spectrum]');
    const target = editor && this.spectrumTarget(editor.dataset);
    if (target)
      block.outerHTML = spectrumEditor(this.state, target.organ, target.tuning);
  }
  refreshSensitivity() {
    const drag = this.heldHandle('sensitivity');
    this.redrawBlocks(
        'sensitivityBlock', (doc, kind, block) => this.sensitivityTarget(block), target => {
          // While its handle is dragged, a log curve shifts from where the drag
          // began; a linear one follows the engine's answers as they arrive.
          const own = drag?.block === (target.organ ? target.tuning.id : target.center.id);
          const shift = own ? drag.shift : 1, start = own && drag.log ? drag.answer : null;
          return target.organ
                     ? sensitivityEditor(this.state, target.organ, target.tuning, shift, start)
                     : sensorAnswer(this.state, target.center, shift, start,
                                    own ? drag.dragged : null);
        });
    const adapt = this.heldHandle('adaptation');
    this.redrawBlocks('adaptationId', (doc, id) => findCenter(doc, id)?.center, center => {
      const own = adapt?.id === center.id;
      return sensorAdaptation(this.state, center, own ? adapt.stretch : 1,
                              own ? adapt.adapt : null);
    });
  }
  // An effector's graphic follows the engine's fins, mouth, colour and spines when they arrive.
  refreshEffectors() {
    this.redrawBlocks('effectorBlock', findOrgan,
                      organ => organ.type === 'gut'
                                   ? gutGraphic(this.state, organ, this.state.selected)
                                   : effectorGraphic(this.state, organ));
    this.redrawBlocks('lateralBlock', findOrgan, organ => lateralField(this.state, organ));
    this.redrawBlocks('spineBlock', findOrgan, organ => spineField(this.state, organ));
  }
  // Redraws every block whose data attribute (by its dataset key, as 'probeBlock') still finds its
  // item in the document, with what render makes of that item; within narrows the blocks to a
  // part of the studio.
  redrawBlocks(key, find, render, within = '') {
    const selector = `[${dataAttribute(key)}]`;
    for (const block of this.root.querySelectorAll(within ? within + ' ' + selector : selector)) {
      const found = find(this.state.document, block.dataset[key], block);
      if (found)
        block.outerHTML = render(found);
    }
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
    this.cancelCompile = false;
    this.notice('');
    this.state.compileProgress = {phase : 'search', milliseconds : 0};
    this.refreshHeader();
    try {
      let job = await this.api(requestBody('build-start', {plan}));
      this.compileJob = job.job;
      while (job.status === 'running') {
        if (this.cancelCompile || this.state.document !== document) {
          await this.api(requestBody('build-cancel', {job : job.job}));
          return;
        }
        this.state.compileProgress = job;
        this.refreshHeader();
        await new Promise(resolve => setTimeout(resolve, BUILD_POLL));
        job = await this.api(requestBody('build-status', {job : job.job}));
      }
      if (this.cancelCompile || job.status === 'cancelled')
        return;
      if (job.status !== 'done')
        throw new Error(job.error?.key?.startsWith('studio.') ? t(job.error.key)
                                                              : serverText(job.error));
      const result = job.result;
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
      if (this.compileJob)
        this.api(requestBody('build-cancel', {job : this.compileJob})).catch(() => {});
      this.compileJob = null;
      this.state.compileProgress = null;
      if (this.cancelCompile)
        this.notice(label('errors.cancelled'));
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
          API_WAIT.long);
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
                                      steps : PULSE_STEPS
                                    }),
                                    API_WAIT.long);
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
                         API_WAIT.long);
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
  // cheeks and throat, defence raises its spines, pigment cells spread their pigment; every
  // effector's own glyph twitches.
  stimulusMoves(key) {
    const svg = this.root.querySelector('#aid-body-map'), doc = this.state.document;
    const organ = organOf(doc, key);
    if (!svg || !organ?.centers.some(c => c.role === 'motor'))
      return [];
    const part = (selector, name) => [...svg.querySelectorAll(selector)].map(e => [e, name]);
    const own = this.stimulusMarks(organ.id).map(e => [e, 'aid-pulse-twitch']);
    const code = organ.type === 'muscle' ? organFunction(organ, this.state.sites) : -1,
          side = sideOf(organ);
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
                  : organ.type === 'pigment'
                      ? part('.aid-chromatophores .gathered', 'aid-move-spread')
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
          API_WAIT.long);
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
                                            API_WAIT.long);
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
    const names = {
      fish : label('app.example'),
      growth : label('app.exampleGrowth'),
      food : label('app.exampleFood')
    };
    this.changeDocument(exampleDocument(names, this.state.sites, this.state.capabilities));
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
    if (clickOn(this, event, ANYWHERE_CLICKS) || this.state.station !== 'studio' ||
        clickOn(this, event, STUDIO_CLICKS))
      return;
    if (this.state.mode === 'cppn')
      return this.cppnClick(event);
    clickOn(this, event, FISH_CLICKS);
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
    if (!changeOn(this, element, FISH_CHANGES))
      this.input(event);
  }
  cppnChange(event) {
    const element = event.target;
    const linkId = element.dataset.cppnWeight ?? element.dataset.cppnEnabled;
    if (linkId !== undefined) {
      const link = findCppnLink(this.state.report, Number(linkId));
      if (!link)
        return true;
      this.cppnAction('edit', {
        edit : 'link',
        id : link.id,
        weight : element.dataset.cppnWeight !== undefined ? Number(element.value) : link.weight,
        enabled : element.dataset.cppnEnabled !== undefined ? Number(element.checked) : link.enabled
      });
      return true;
    }
    const nodeId = element.dataset.cppnFunction ?? element.dataset.cppnParameter;
    if (nodeId !== undefined) {
      const node = findCppnNode(this.state.report, Number(nodeId));
      if (!node)
        return true;
      this.cppnAction('edit', {
        edit : 'node',
        id : node.id,
        type : element.dataset.cppnFunction !== undefined ? Number(element.value) : node.type,
        parameter : element.dataset.cppnParameter !== undefined ? Number(element.value)
                                                                : node.parameter
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
    c.zoom = direction === 'in'    ? Math.min(CAMERA_ZOOM.max, c.zoom * CAMERA_ZOOM.step)
             : direction === 'out' ? Math.max(CAMERA_ZOOM.min, c.zoom / CAMERA_ZOOM.step)
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
      for (const label of svg.querySelectorAll('.aid-organ-label[data-label-y]'))
        for (const [name, value] of Object.entries(
                 organLabelPlace(Number(label.dataset.labelY), c.zoom)))
          label.setAttribute(name, fixed(value));
      for (const marker of svg.querySelectorAll('.aid-wire-marker')) {
        marker.setAttribute('markerWidth', arrowSize(c.zoom));
        marker.setAttribute('markerHeight', arrowSize(c.zoom));
      }
      for (const hint of svg.querySelectorAll('.aid-site-hint'))
        hint.setAttribute('transform', 'translate(' + hint.dataset.pointX + ' ' +
                                           hint.dataset.pointY + ') scale(' + scale + ')');
    } else
      this.refreshScene();
    if (nodesAtZoom(previous) !== nodesAtZoom(c.zoom))
      this.refreshScene();
    const stamp = this.root.querySelector('.aid-canvas-toolbar');
    if (stamp)
      stamp.textContent = zoomStamp(c);
  }
  wheel(event) {
    const svg = event.target.closest?.('#aid-body-map');
    if (!svg || this.state.mode !== 'fish')
      return;
    event.preventDefault();
    this.zoom(event.deltaY < 0 ? 'in' : 'out', cameraCoordinates(event, svg, this.state.camera));
  }
  pointerDown(event) {
    const grip = event.target.closest?.('[data-panel-grip]');
    if (grip && event.button === 0) {
      const panel = grip.dataset.panelGrip;
      this.holdHandle(event, 'panel', {
        panel,
        x : event.clientX,
        width : grip.parentElement.getBoundingClientRect().width,
        // The library grows to the right, the inspector to the left.
        sign : panel === 'library' ? 1 : -1
      });
      return;
    }
    if ((event.button !== 0 && event.button !== 1) || this.state.station !== 'studio' ||
        this.state.mode !== 'fish')
      return;
    // Graphics move only by their handles.
    for (const grip of GRIPS) {
      const graphic = event.target.closest?.(grip.graphic),
            handle = grip.handle ? event.target.closest?.(grip.handle) : null;
      if (!graphic || (grip.handle && !handle && !grip.claims))
        continue;
      const drag = !grip.handle || handle ? grip.start(this, graphic, handle, event) : null;
      if (drag)
        this.holdHandle(event, grip.held,
                        grip.rect === false ? drag
                                            : {...drag, rect : graphic.getBoundingClientRect()});
      return;
    }
    const svg = event.target.closest?.('#aid-body-map');
    if (!svg)
      return;
    const item = event.target.closest?.(itemSelector(PRESSED_ITEMS));
    const kind = markedKind(item, PRESSED_ITEMS);
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
  pointerMove(event) {
    if (this.handleDrag)
      return this[HANDLES[this.handleDrag.held].follow](event);
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
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > DRAG_START)
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
    if (this.handleDrag)
      return this.releaseHandle(event);
    const drag = this.pointer;
    if (!drag)
      return;
    this.pointer = null;
    const trashed = this.overTrash(event);
    this.showTrash(false);
    if (!drag.moved)
      return this.cancelChoices();
    this.ignoreClickUntil = performance.now() + DRAG_CLICK;
    event.preventDefault();
    if (drag.wireFrom) {
      this.wireStartId = null;
      this.wireStartKind = 'center';
      const target = document.elementFromPoint(event.clientX, event.clientY)
                         ?.closest?.(itemSelector(WIRE_ENDS));
      const kind = markedKind(target, WIRE_ENDS);
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
    const used = usedSites(this.state.document, c => c.id !== drag.id);
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
                       {[key] : organ.field[key] + direction * (FIELD_KEY_STEP[key] ?? 1)});
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
// The studio's methods for held handles and for drags from the library live beside it.
Object.assign(OrganStudio.prototype, handleMethods, dropMethods);
export function initializeStudio() {
  const root = document.getElementById('station-root');
  if (!root)
    return;
  instance = new OrganStudio(root);
  instance.initialize();
}
