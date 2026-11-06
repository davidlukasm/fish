import {
  ANYWHERE_CLICKS,
  changeOn,
  clickOn,
  FISH_CHANGES,
  FISH_CLICKS,
  STUDIO_CLICKS
} from './events.js';
import {exampleDocument} from './model/example.js';
import {handleMethods, storedPanels} from './handles.js';
import {storedLayers} from './view/layers.js';
import {dropMethods} from './drops.js';
import {designMethods} from './design.js';
import {compilerPanel, acceptedGenome} from './view/compiler.js';
import {beginEggPlacement} from '../world.js';
import {postJson, savedGenome, serverText} from '../session.js';
import {t} from '../strings.js';
import {
  compileDocument,
  compilerOptions,
  connectSelections,
  findAssembly,
  findCenter,
  findOrgan,
  identifier,
  newDocument,
  removeCenter,
  removeOrgan,
  removeWire,
  selectionCenters,
  setLifePhase,
  updateField,
  validateDocument
} from './model/document.js';
import {removeAssembly} from './model/assemblies.js';
import {centroid, findSite} from './model/layout.js';
import {CAMERA_HOME} from './view/frame.js';
import {BODY_MAP, fishScene} from './view/scene.js';
import {nodeLocation} from './view/places.js';
import {inspector} from './view/panels.js';
import {cppnGraph, cppnInspector} from './view/graph.js';
import {settleRegions} from './model/regions.js';
import {
  CPPN_SCENE_ID,
  developAction,
  GENOME_FILE_ID,
  headerStatus,
  hubShell,
  stationShell
} from './view/shell.js';
import {measureReading} from './view/substances.js';
import {libraryOf, toolPalette} from './view/library.js';
import {label} from './view/kit.js';
import {moduleName} from './view/names.js';
import {API, API_WAIT, GENOME_SUFFIX, requestBody, START_FISH} from './requests.js';
import {builtAsDrawn} from './view/stimulus.js';
import {MEASURE_LEVEL, trialMethods} from './trials.js';
import {CPPN_CHANGES, CPPN_CLICKS} from './cppn.js';
import {gestureMethods} from './gestures.js';

// The Atelier's controller: the station's state, its draft and history, and how the views follow
// them. Its methods for parts of the work live beside it and are mixed in: the engine's view of
// the draft (design.js), the graphics' handles (handles.js), dropping from the library
// (drops.js), trials on the developed fish (trials.js) and the pointer on the scene
// (gestures.js). What clicks and changes do stands in tables (events.js; cppn.js for the genome
// mode); the model (model/) and the views (view/) know nothing of the controller.
let instance = null;
// An arrow key moves a field organ's handle by a degree, its resolution by FIELD_KEY_STEP.
const FIELD_KEY_STEP = Object.freeze({resolution : .02});
// The draft is saved SAVE_DELAY ms after its last change; a build is asked how far it got every
// BUILD_POLL ms; undo reaches HISTORY_DEPTH changes back.
const SAVE_DELAY = 400, BUILD_POLL = 150, HISTORY_DEPTH = 40;
// A genome file's name keeps letters, digits, umlauts, '-' and spaces.
const FILE_NAME_UNSAFE = /[^\w\-äöüÄÖÜ ]/g;
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
      layers : storedLayers(),
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
    // The stimuli playing on the scene, each with the centers it stimulated.
    this.pulsePlayers = [];
    // A wire begun by a click: from an item to the next one clicked, or from the next one clicked
    // to a region's input slot.
    this.pendingWire = null;
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
    const response = await postJson(API, body, {timeout});
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
  // The scene shows the contacts as drawn, not as the developed fish made them.
  showDrawnContacts() {
    this.state.contactView = 'design';
    for (const button of this.root.querySelectorAll('[data-contacts]'))
      button.classList.toggle('active', button.dataset.contacts === 'design');
  }
  // Wiring starts from nothing chosen: what was chosen to move or inspect is let go.
  setTool(tool) {
    this.pendingWire = null;
    const entering = tool !== this.state.tool;
    this.state.tool = tool;
    if (tool === 'wire') {
      this.clearStimulus();
      this.showDrawnContacts();
      if (entering) {
        this.state.selected = null;
        this.state.multi.clear();
        this.refreshInspector();
      }
    }
    this.clearPreview();
    this.refreshTools();
    this.refreshLibrary();
    this.refreshViews();
  }
  // The library offers organs to place, with the hormone tool the substances and what they do,
  // with the learning tool the cells and substances learning needs.
  refreshLibrary() {
    const scroll = this.root.querySelector('.aid-library-scroll');
    if (!scroll || this.state.mode !== 'fish')
      return;
    const offered = libraryOf(this.state);
    // The substance cards need more room than the organ tiles.
    this.root.querySelector('.aid-workspace-main')
        ?.classList.toggle('cards', offered.kind !== 'organs');
    if (offered.kind === 'organs' && scroll.dataset.library === 'organs')
      return;
    scroll.innerHTML = offered.html;
    scroll.dataset.library = offered.kind;
  }
  wirePoint(selection) {
    const points = selectionCenters(this.state.document, selection)
                       .map(id => {
                         const found = findCenter(this.state.document, id);
                         const site = findSite(this.state.sites, found?.center.site);
                         return site ? nodeLocation(this.state.document, this.state.sites,
                                                    found.center, found.organ.type)
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
                                                                      : '#' + CPPN_SCENE_ID);
    if (target)
      target.innerHTML = this.state.mode === 'fish' ? fishScene(this.state) : cppnGraph(this.state);
    const svg = this.bodyMap();
    if (svg)
      for (const {player} of this.pulsePlayers)
        player.attach(svg);
    this.markStimulus();
    this.markFocus();
  }
  // A chosen organ or nerve center keeps itself, what it is wired with and those wires in full
  // colour; the rest stands back.
  // The scene's drawing of the fish, while it stands in the page.
  bodyMap() { return this.root.querySelector(BODY_MAP); }
  // The scene and the inspector follow the state.
  refreshViews() {
    this.refreshScene();
    this.refreshInspector();
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
      status.textContent = headerStatus(state);
    const develop = this.root.querySelector('[data-action="develop"],[data-action="cancel-build"]');
    if (develop) {
      const {action, text, disabled} = developAction(state);
      develop.dataset.action = action;
      develop.textContent = text;
      develop.disabled = disabled;
    }
    for (const button of this.root.querySelectorAll('[data-contacts="actual"]'))
      button.disabled = state.stale || !state.report?.contacts?.length;
    for (const button of this.root.querySelectorAll('[data-measure], [data-measure-level]'))
      button.disabled = !builtAsDrawn(state);
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
    if (this.state.tool === 'hormone' || this.state.tool === 'learn')
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
    this.showDrawnContacts();
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
          this.refreshViews();
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
      this.refreshViews();
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
  async placeEggs() {
    if (!acceptedGenome(this.state) || !this.state.report?.viable)
      return;
    try {
      const saved = await savedGenome(new File([ this.state.genome ], this.genomeFileName()));
      this.navigate('aquarium');
      beginEggPlacement({saved});
    } catch (error) {
      this.notice(error.message);
    }
  }
  // The genome's file name: the design's name, or the default one, with what a file name may not
  // hold replaced.
  genomeFileName() {
    return (this.state.document.name || label('app.fileName')).replace(FILE_NAME_UNSAFE, '_') +
           GENOME_SUFFIX;
  }
  download() {
    if (!acceptedGenome(this.state))
      return;
    const file = new Blob([ this.state.genome ], {type : 'text/plain'});
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.genomeFileName();
    a.click();
    URL.revokeObjectURL(url);
  }
  // The Aquarium's start fish as its runs begin with it: its genome, opened as a genome file is.
  async startFish() {
    if (this.state.busy)
      return;
    try {
      const report = await this.api(requestBody('new', {example : START_FISH}), API_WAIT.long);
      this.state.genome = report.genome;
      this.state.report = report;
      this.state.stale = false;
      this.setMode('cppn');
    } catch (error) {
      this.notice(error.message);
    }
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
    if (performance.now() < this.ignoreClickUntil && event.target.closest?.(BODY_MAP))
      return;
    if (event.target.closest?.('[data-vision-handle],[data-spectrum]'))
      return;
    if (clickOn(this, event, ANYWHERE_CLICKS) || this.state.station !== 'studio' ||
        clickOn(this, event, STUDIO_CLICKS))
      return;
    if (this.state.mode === 'cppn')
      return clickOn(this, event, CPPN_CLICKS);
    clickOn(this, event, FISH_CLICKS);
  }
  async saveAssembly(id) {
    const assembly = findAssembly(this.state.document, id);
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
    if (element.id === GENOME_FILE_ID) {
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
    if (this.state.mode === 'cppn' && changeOn(this, element, CPPN_CHANGES))
      return;
    if (!changeOn(this, element, FISH_CHANGES))
      this.input(event);
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
      this.pendingWire = null;
      this.state.selected = null;
      this.state.multi.clear();
      this.clearPreview();
      this.refreshViews();
    }
    if (event.key === 'Delete' || event.key === 'Backspace')
      this.removeSelection(this.state.selected);
  }
}
// The studio's methods for the design view, held handles and drags from the library live beside
// it.
Object.assign(OrganStudio.prototype, designMethods, handleMethods, dropMethods, trialMethods,
              gestureMethods);
export function initializeStudio() {
  const root = document.getElementById('station-root');
  if (!root)
    return;
  instance = new OrganStudio(root);
  instance.initialize();
}
