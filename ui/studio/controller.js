import {
  ANYWHERE_CLICKS,
  changeOn,
  clickOn,
  FISH_CHANGES,
  FISH_CLICKS,
  STUDIO_CLICKS
} from './events.js';
import {exampleDocument} from './model/example.js';
import {startDocument} from './model/import.js';
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
  setBends,
  setLifePhase,
  updateField,
  validateDocument
} from './model/document.js';
import {removeAssembly} from './model/assemblies.js';
import {centroid, findSite} from './model/layout.js';
import {CAMERA_HOME, cameraCoordinates} from './view/frame.js';
import {bendsWith} from './view/wires.js';
const DOUBLE_CLICK = 450;
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
  layerSwitches,
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

let instance = null;
const FIELD_KEY_STEP = Object.freeze({resolution : .02});
const SAVE_DELAY = 400, BUILD_POLL = 150, HISTORY_DEPTH = 40;
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
      sightProbe : null,
      senseProbe : null,
      armed : null,
      visionProfile : null,
      panels : storedPanels(),
      layers : storedLayers(),
      anatomy : null,
      choices : null,
      report : null,
      genome : '',
      cppnScope : 'all',
      cppnSelection : null,
      cppnConnectFrom : null,
      busy : false,
      compileProgress : null,
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
    this.pulsePlayers = [];
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
    this.root.addEventListener('contextmenu', event => {
      if (this.release())
        event.preventDefault();
    });
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
  showDrawnContacts() {
    this.state.contactView = 'design';
    for (const button of this.root.querySelectorAll('[data-contacts]'))
      button.classList.toggle('active', button.dataset.contacts === 'design');
  }
  setTool(tool) {
    this.pendingWire = null;
    const entering = tool !== this.state.tool;
    this.state.tool = tool;
    if (entering)
      this.state.armed = null;
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
    this.showArmed();
    this.refreshSwitches();
    this.refreshViews();
  }
  refreshSwitches() {
    const switches = this.root.querySelector('.aid-layer-switches');
    if (switches)
      switches.innerHTML = layerSwitches(this.state);
  }
  refreshLibrary() {
    const scroll = this.root.querySelector('.aid-library-scroll');
    if (!scroll || this.state.mode !== 'fish')
      return;
    const offered = libraryOf(this.state);
    if (offered.kind === 'select' && scroll.dataset.library === 'select')
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
  bodyMap() { return this.root.querySelector(BODY_MAP); }
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
    const doc = validateDocument(source.pop()), chosen = this.state.selected;
    this.state.document = doc;
    this.historyBatch = null;
    this.state.canUndo = this.undoHistory.length > 0;
    this.state.canRedo = this.redoHistory.length > 0;
    // Stepping back a setting keeps its inspector open while the chosen part still exists.
    const exists = {
      center : id => findCenter(doc, id),
      organ : id => findOrgan(doc, id),
      wire : id => doc.wires.some(w => w.id === id),
      assembly : id => findAssembly(doc, id)
    }[chosen?.kind];
    this.state.selected = exists?.(chosen.id) ? chosen : null;
    for (const id of [...this.state.multi])
      if (!findCenter(doc, id) && !findOrgan(doc, id))
        this.state.multi.delete(id);
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
    this.state.document = validateDocument(settleRegions(doc, this.state.sites));
    this.state.selected = selected;
    this.state.multi.clear();
    this.designChanged();
    this.refreshScene();
    this.refreshHeader();
    this.refreshTools();
    if ([ 'hormone', 'learn', 'stimulate' ].includes(this.state.tool))
      this.refreshLibrary();
    if (updateInspector)
      this.refreshInspector();
    this.requestDesign();
    return true;
  }
  designChanged() {
    this.stopPulse();
    this.state.stimulus = null;
    this.state.stale = true;
    this.showDrawnContacts();
    this.state.measurement = null;
    this.state.genome = '';
    this.persist();
  }
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
  async startFish() {
    if (this.state.busy)
      return;
    this.state.busy = true;
    this.refreshHeader();
    try {
      const report = await this.api(requestBody('new', {example : START_FISH}), API_WAIT.long);
      this.changeDocument(
          startDocument(report.sourcePlan, this.state.sites, label('app.startFish')));
      this.setMode('fish');
      this.state.busy = false;
      await this.develop();
    } catch (error) {
      this.notice(error.message);
    } finally {
      this.state.busy = false;
      this.refreshHeader();
    }
  }
  example() {
    const names = {
      fish : label('app.example'),
      growth : label('app.exampleGrowth'),
      reward : label('app.exampleFood')
    };
    this.changeDocument(exampleDocument(names, this.state.sites, this.state.capabilities));
  }
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
  // With the wiring tool a second click on a wire or a bend within DOUBLE_CLICK ms of the first
  // bends the wire there or removes the bend. The scene is drawn anew between the clicks, so the
  // browser's own double click does not reach it; the clicks are matched by what they hit.
  doubleClick(event) {
    if (this.state.tool !== 'wire')
      return false;
    const bend = event.target.closest?.('[data-bend-index]'),
          wire = bend ? null : event.target.closest?.('[data-wires]');
    const hit = bend   ? 'bend:' + bend.dataset.bendWires + ':' + bend.dataset.bendIndex
                : wire ? 'wire:' + wire.dataset.wires
                       : null;
    const now = performance.now(), last = this.lastClick;
    this.lastClick = hit ? {hit, at : now} : null;
    if (!hit || last?.hit !== hit || now - last.at > DOUBLE_CLICK)
      return !!bend;
    this.lastClick = null;
    const doc = this.state.document;
    if (bend) {
      const wires = bend.dataset.bendWires.split(' '), index = Number(bend.dataset.bendIndex);
      const bends = doc.wires.find(w => w.id === wires[0])?.bends ?? [];
      this.changeDocument(setBends(doc, wires, bends.filter((_, k) => k !== index)),
                          this.state.selected);
    } else
      this.bendWire(
          {wires : wire.dataset.wires.split(' '), mirrored : wire.hasAttribute('data-mirrored')},
          cameraCoordinates(event, this.bodyMap(), this.state.camera));
    return true;
  }
  bendWire({wires, mirrored}, point) {
    const bends = bendsWith(this.state, wires, point, mirrored);
    const doc = bends && setBends(this.state.document, wires, bends);
    if (!doc)
      return this.notice(label('wiring.noWire'));
    this.changeDocument(doc, this.state.selected);
    this.notice(label('wiring.bent'));
  }
  click(event) {
    if (performance.now() < this.ignoreClickUntil && event.target.closest?.(BODY_MAP))
      return;
    if (this.clickArmed(event) || this.doubleClick(event))
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
      this.release();
      this.state.selected = null;
      this.state.multi.clear();
      this.clearPreview();
      this.refreshViews();
    }
    if (event.key === 'Delete' || event.key === 'Backspace')
      this.removeSelection(this.state.selected);
  }
}
Object.assign(OrganStudio.prototype, designMethods, handleMethods, dropMethods, trialMethods,
              gestureMethods);
export function initializeStudio() {
  const root = document.getElementById('station-root');
  if (!root)
    return;
  instance = new OrganStudio(root);
  instance.initialize();
}
