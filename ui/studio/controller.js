import {
  ANYWHERE_CLICKS,
  changeOn,
  clickOn,
  FISH_CHANGES,
  FISH_CLICKS,
  STUDIO_CLICKS
} from './events.js';
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
  newDocument,
  removeCenter,
  removeOrgan,
  removeWire,
  selectionCenters,
  setBends,
  updateField,
  validateDocument
} from './model/document.js';
import {removeAssembly} from './model/assemblies.js';
import {BODY_FRAME, centroid, findSite} from './model/layout.js';
import {CAMERA_HOME, cameraCoordinates} from './view/frame.js';
import {bendsWith, CONTACT_LIMITS} from './view/wires.js';
import {DEFAULT_PREVIEW_CONTEXT, DEFAULT_PREVIEW_INPUT} from './view/development.js';
const DOUBLE_CLICK = 450;
import {BODY_MAP, fishScene} from './view/scene.js';
import {nodeLocation} from './view/places.js';
import {inspector, organSettingsBlock} from './view/panels.js';
import {cppnGraph, cppnInspector} from './view/graph.js';
import {settleRegions} from './model/regions.js';
import {
  CPPN_SCENE_ID,
  developAction,
  GENOME_FILE_ID,
  headerStatus,
  layerSwitches,
  stationShell
} from './view/shell.js';
import {libraryOf, toolPalette} from './view/library.js';
import {label} from './view/kit.js';
import {moduleName} from './view/names.js';
import {API, API_WAIT, GENOME_SUFFIX, requestBody} from './requests.js';
import {trialMethods} from './trials.js';
import {CPPN_CLICKS} from './cppn.js';
import {gestureMethods} from './gestures.js';
import {StationHub} from './hub.js';
import {BreedingStation, TrialStation} from '../labor/live_station.js';

let instance = null;
const FIELD_KEY_STEP = Object.freeze({resolution : .02});
const SAVE_DELAY = 400, BUILD_POLL = 150, HISTORY_DEPTH = 40, DELETE_ASKS = 4000;
const FILE_NAME_UNSAFE = /[^\w\-äöüÄÖÜ ]/g;
// The element in `fresh` that stands where `old` stands in `current`.
function sameElement(current, fresh, old) {
  const data = [...old.attributes ].filter(a => a.name.startsWith('data-'));
  const kind =
      old.tagName.toLowerCase() + [...old.classList ].map(c => '.' + CSS.escape(c)).join('');
  if (data.length)
    return fresh.querySelector(
        kind + data.map(a => '[' + a.name + '="' + CSS.escape(a.value) + '"]').join(''));
  const index = [...current.querySelectorAll(kind) ].indexOf(old);
  return index < 0 ? null : fresh.querySelectorAll(kind)[index] ?? null;
}
export class OrganStudio {
  constructor(root) {
    this.root = root;
    this.state = {
      station : 'hub',
      mode : 'fish',
      tool : 'select',
      traceSource : 'plan',
      wireScope : 'all',
      contactView : 'design',
      contactLimit : CONTACT_LIMITS[0],
      document : newDocument(label('app.newFish')),
      sites : [],
      capabilities : null,
      selected : null,
      multi : new Set(),
      camera : {zoom : 1, ...CAMERA_HOME},
      userModules : [],
      deletingModule : null,
      effect : 0,
      focusSubstance : 0,
      previewInput : DEFAULT_PREVIEW_INPUT,
      previewContext : DEFAULT_PREVIEW_CONTEXT,
      sightProbe : null,
      senseProbe : null,
      armed : null,
      placementSide : 'both',
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
      cppnConnectPort : 0,
      cppnDraft : null,
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
    this.persistPending = null;
    this.persistRunning = false;
    this.persistRevision = 0;
    this.pulsePlayer = null;
    this.pendingWire = null;
    this.ignoreClickUntil = 0;
    this.handleDrag = null;
    this.undoHistory = [];
    this.redoHistory = [];
    this.historyBatch = null;
    this.designRunning = false;
    this.designPending = false;
    this.designRequest = 0;
    this.newFishRequest = 0;
    this.pendingTrace = null;
    this.wireIndex = null;
    this.previewFrame = null;
    this.choiceFrame = 0;
    this.choicePoint = null;
    this.shownChoice = null;
    this.compileJob = null;
    this.cancelCompile = false;
    this.shownDesign = null;
    this.pressureChecked = null;
    this.hub = new StationHub(root);
    this.breeding = new BreedingStation(root);
    this.trials = new TrialStation(root);
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
    this.root.addEventListener('dragstart', event => this.dragStart(event));
    this.root.addEventListener('dragover', event => this.dragOver(event));
    this.root.addEventListener('drop', event => this.drop(event));
    this.root.addEventListener('dragend', () => {
      this.dragging = null;
      this.refreshLibrary();
      this.clearPreview();
    });
    this.root.addEventListener('pointerdown', event => this.pointerDown(event));
    window.addEventListener('pointermove', event => this.pointerMove(event));
    window.addEventListener('pointerup', event => this.pointerUp(event));
    window.addEventListener('pointercancel', () => this.interruptPointer());
    window.addEventListener('blur', () => this.interruptPointer());
    this.root.addEventListener('wheel', event => this.wheel(event), {passive : false});
    this.root.addEventListener('pointerover', event => this.pointLinked(event, true));
    this.root.addEventListener('pointerout', event => this.pointLinked(event, false));
    document.getElementById('open-station-hub')
        ?.addEventListener('click', () => this.navigate('hub'));
    document.addEventListener('keydown', event => this.keydown(event));
    document.addEventListener('click', event => {
      if (!event.target.closest?.('.aid-scene-options'))
        this.closeSceneOptions();
    });
    this.renderShell();
    this.bootstrap();
  }
  async bootstrap() {
    const request = this.newFishRequest, document = this.state.document;
    try {
      const results = await Promise.all([
        this.api(requestBody('sites')), this.api(requestBody('load-draft')),
        this.api(requestBody('list-modules'))
      ]);
      this.state.capabilities = results[0];
      this.state.sites = results[0].sites;
      this.state.userModules = results[2]?.modules ?? [];
      this.refreshHeader();
      if (request !== this.newFishRequest || document !== this.state.document)
        return;
      let loaded = false;
      if (results[1]?.document)
        try {
          this.state.document =
              validateDocument(settleRegions(results[1].document, this.state.sites));
          loaded = true;
        } catch {
          this.notice(label('status.draftOutdated'));
        }
      if (!loaded && !await this.newFish(true))
        return;
      if (this.state.station === 'studio')
        this.renderShell();
      else
        this.refreshHubDraft();
      this.requestDesign();
    } catch (error) {
      if (request === this.newFishRequest && document === this.state.document)
        this.notice(error.message);
    }
  }
  notice(value) {
    this.state.notice = value.startsWith?.('studio.') ? t(value) : value;
    const footer = this.root.querySelector('.aid-message');
    if (footer)
      footer.textContent = this.state.notice;
  }
  closeSceneOptions(focus = false) {
    const menu = this.root.querySelector('.aid-scene-options[open]');
    if (!menu)
      return false;
    menu.open = false;
    if (focus)
      menu.querySelector('summary')?.focus();
    return true;
  }
  navigate(station) {
    this.interruptPointer();
    if (station !== 'studio')
      this.stopPulse();
    if (station !== 'hub')
      this.hub.close();
    for (const lab of ['breeding', 'trials'])
      if (station !== lab)
        this[lab].close();
    this.state.station = station;
    this.root.hidden = station === 'aquarium';
    document.body.dataset.station = station;
    if (station !== 'aquarium')
      this.renderShell();
  }
  setMode(mode) {
    if (this.state.mode === mode)
      return;
    this.interruptPointer();
    this.state.mode = mode;
    if (this.state.station === 'studio')
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
    if (entering) {
      this.state.armed = null;
      this.clearStimulus(false);
    }
    if (tool === 'wire') {
      this.showDrawnContacts();
      if (entering) {
        this.state.selected = null;
        this.state.multi.clear();
      }
    }
    this.clearPreview();
    this.refreshTools();
    this.showArmed();
    this.refreshSwitches();
    this.refreshHeader();
    this.refreshViews();
  }
  refreshSwitches() {
    const switches = this.root.querySelector('.aid-layer-switches');
    if (switches)
      switches.innerHTML = layerSwitches(this.state);
  }
  refreshLibrary(changed = false) {
    const scroll = this.root.querySelector('.aid-library-scroll');
    if (!scroll || this.state.mode !== 'fish')
      return;
    const offered = libraryOf(this.state);
    if (!changed && offered.kind === 'select' && scroll.dataset.library === 'select')
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
    const result = connectSelections(this.state.document, source, target, this.state.sites);
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
    if (s.station === 'hub')
      return this.hub.open(this.draftLine());
    if (s.station === 'breeding' || s.station === 'trials')
      return this[s.station].open(acceptedGenome(s) ? {genome : s.genome, name : s.document.name}
                                                    : null);
    const options = this.root.querySelector('.aid-scene-options');
    const menuControls = 'summary, button, select';
    const focused =
        options ? [...options.querySelectorAll(menuControls) ].indexOf(document.activeElement) : -1;
    this.root.innerHTML = stationShell(s);
    const freshOptions = this.root.querySelector('.aid-scene-options');
    if (options && freshOptions) {
      freshOptions.open = options.open;
      if (focused >= 0)
        freshOptions.querySelectorAll(menuControls)[focused]?.focus({preventScroll : true});
    }
    this.drawSight();
  }
  refreshScene() {
    if (this.state.station !== 'studio')
      return;
    const target = this.root.querySelector(this.state.mode === 'fish' ? '.aid-scene-frame'
                                                                      : '#' + CPPN_SCENE_ID);
    const zoom = this.state.camera.zoom;
    this.frameField();
    if (zoom !== this.state.camera.zoom)
      this.showZoom();
    if (target)
      target.innerHTML = this.state.mode === 'fish' ? fishScene(this.state) : cppnGraph(this.state);
    const svg = this.bodyMap();
    if (svg)
      this.pulsePlayer?.attach(svg);
    this.markStimulus();
    this.markFocus();
    this.restorePlacement();
  }
  bodyMap() { return this.root.querySelector(BODY_MAP); }
  // Pointing at a nerve lights the bundles it gathers, pointing at a bundle its fibres.
  pointLinked(event, on) {
    const nerve = event.target.closest?.('.aid-nerve[data-strands]'),
          bundle = nerve ? null : event.target.closest?.('.aid-wire-group[data-strand]');
    const ids = nerve ? nerve.dataset.strands.split(' ') : bundle ? [ bundle.dataset.strand ] : [];
    const map = ids.length && this.bodyMap();
    if (!map)
      return;
    nerve?.classList.toggle('aid-hover', on);
    for (const id of ids)
      for (const element of map.querySelectorAll('[data-strand="' + id + '"]'))
        element.classList.toggle('aid-hover', on);
  }
  refreshViews() {
    this.refreshScene();
    this.refreshInspector();
  }
  refreshInspector(reset = false) {
    const element = this.root.querySelector('.aid-inspector-scroll');
    if (!element)
      return;
    const scroll = reset ? 0 : element.scrollTop;
    // A redrawn inspector keeps open what the user opened.
    const opened =
        new Set([...element.querySelectorAll('details[open] > summary') ].map(s => s.textContent));
    element.innerHTML =
        this.state.mode === 'fish' ? inspector(this.state) : cppnInspector(this.state);
    for (const summary of element.querySelectorAll('details > summary'))
      if (opened.has(summary.textContent))
        summary.parentElement.open = true;
    element.scrollTop = scroll;
    this.drawSight();
  }
  // During a drag the surrounding inspector waits for the drop. Rebuilding just the containing
  // settings block also avoids recalculating contact plans and life cycles for each frame.
  refreshDragged() {
    const drag = this.handleDrag, element = this.root.querySelector('.aid-inspector-scroll');
    const graphic = drag?.graphic;
    if (!graphic?.isConnected || !element?.contains(graphic))
      return this.refreshInspector();
    const settings = graphic.closest('[data-organ-settings]');
    const organ = this.state.mode === 'fish' && settings &&
                  findOrgan(this.state.document, settings.dataset.organSettings);
    const fresh = document.createElement('div');
    fresh.innerHTML = organ                        ? organSettingsBlock(this.state, organ)
                      : this.state.mode === 'fish' ? inspector(this.state)
                                                   : cppnInspector(this.state);
    const same = sameElement(organ ? settings : element, fresh, graphic);
    if (!same)
      return this.refreshInspector();
    const linked = '[data-wheel-figure],[data-effector-block]', block = graphic.closest(linked);
    if (block)
      block.replaceWith(same.closest(linked));
    else
      graphic.replaceWith(same);
    drag.graphic = same;
  }
  refreshTools() {
    const existing = this.root.querySelector('.aid-tools');
    if (existing)
      existing.outerHTML = toolPalette(this.state);
  }
  refreshHeader() {
    const state = this.state;
    const newFish = this.root.querySelector('[data-action="new"]');
    if (newFish)
      newFish.disabled = !state.sites.length;
    if (state.station !== 'studio')
      return;
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
    const startFish = this.root.querySelector('[data-start-fish]');
    if (startFish)
      startFish.disabled = state.busy;
    const develop = this.root.querySelector('[data-action="develop"],[data-action="cancel-build"]');
    if (develop) {
      const {action, text, disabled} = developAction(state);
      develop.dataset.action = action;
      develop.textContent = text;
      develop.disabled = disabled;
    }
    for (const button of this.root.querySelectorAll('[data-contacts="actual"]')) {
      button.disabled = state.stale || !state.report?.compiler;
      button.textContent = label('tools.developedContacts');
    }
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
    // Undo in the middle of a drag takes back the drag so far, redo drops it; what the drag does
    // after is a step of its own.
    const drafting = this.drafted && this.state.document !== this.draftStart;
    if (drafting && action === 'undo') {
      this.undoHistory.push(this.draftStart);
      this.redoHistory.length = 0;
    } else if (drafting && this.redoHistory.length)
      this.state.document = this.draftStart;
    const source = action === 'undo' ? this.undoHistory : this.redoHistory;
    const target = action === 'undo' ? this.redoHistory : this.undoHistory;
    if (!source.length)
      return false;
    target.push(this.state.document);
    const doc = validateDocument(source.pop()), chosen = this.state.selected;
    this.state.document = doc;
    this.historyBatch = null;
    this.drafted = null;
    this.draftStart = null;
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
      if (!findCenter(doc, id) && !findOrgan(doc, id) && !doc.wires.some(w => w.id === id))
        this.state.multi.delete(id);
    this.pendingWire = null;
    this.designChanged();
    this.refreshScene();
    this.refreshHeader();
    this.refreshInspector();
    this.refreshTools();
    this.refreshToolLibrary();
    this.requestDesign();
    return true;
  }
  persist() {
    clearTimeout(this.persistTimer);
    const pending = {document : this.state.document, revision : ++this.persistRevision};
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistPending = pending;
      this.saveDraft();
    }, SAVE_DELAY);
  }
  async saveDraft() {
    if (this.persistRunning || !this.persistPending)
      return;
    const {document, revision} = this.persistPending;
    this.persistPending = null;
    this.persistRunning = true;
    // The threaded server can finish writes in either order; only the latest due draft waits.
    try {
      await this.api(requestBody('save-draft', {document}));
    } catch (error) {
      if (revision === this.persistRevision && document === this.state.document)
        this.notice(error.message);
    } finally {
      this.persistRunning = false;
      this.saveDraft();
    }
  }
  changeDocument(doc, selected = null, updateInspector = true, batch = null, finish = false) {
    if (!doc)
      return false;
    const next = validateDocument(settleRegions(doc, this.state.sites));
    // A click that sets what is already set adds no undo step and keeps the developed fish.
    const unchanged =
        doc !== this.state.document && JSON.stringify(next) === JSON.stringify(this.state.document);
    if (!unchanged)
      this.recordHistory(batch);
    if (finish)
      this.historyBatch = null;
    if (!unchanged) {
      this.state.document = next;
      this.designChanged();
    }
    this.state.selected = selected;
    this.state.multi.clear();
    this.refreshScene();
    this.refreshHeader();
    this.refreshTools();
    this.refreshToolLibrary();
    if (updateInspector)
      this.refreshInspector();
    if (!unchanged)
      this.requestDesign();
    return true;
  }
  refreshToolLibrary() {
    if ([ 'hormone', 'learn', 'stimulate' ].includes(this.state.tool))
      this.refreshLibrary();
  }
  // Another fish starts afresh: nothing of the last one stays armed, pending or zoomed in on.
  loadFish(doc) {
    ++this.newFishRequest;
    this.interruptPointer();
    this.notice('');
    this.pendingWire = null;
    this.release();
    this.setMode('fish');
    this.zoom('fit');
    this.changeDocument(doc);
  }
  designChanged() {
    ++this.newFishRequest;
    this.stopPulse();
    this.state.stimulus = null;
    this.state.stale = true;
    this.state.traceSource = 'plan';
    this.showDrawnContacts();
    this.state.genome = '';
    this.persist();
  }
  select(kind, id, event = null, toggle = true) {
    const current = this.state.selected;
    if ((event?.ctrlKey || event?.metaKey || event?.shiftKey) &&
        (kind === 'organ' || kind === 'center' || kind === 'wire')) {
      if (current && (current.kind === 'wire') !== (kind === 'wire'))
        this.state.multi.clear();
      if (!this.state.multi.size && current &&
          (current.kind === kind ||
           kind !== 'wire' && (current.kind === 'organ' || current.kind === 'center'))) {
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
          kind : this.state.document.wires.some(w => w.id === remaining) ? 'wire'
                 : findOrgan(this.state.document, remaining)             ? 'organ'
                                                                         : 'center',
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
    const document = this.state.document, request = this.newFishRequest;
    const current = () => this.state.document === document && this.newFishRequest === request;
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
        if (this.cancelCompile || !current()) {
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
      if (!current())
        return;
      this.state.report = result;
      this.state.robustness = null;
      this.state.genome = result.genome;
      this.state.stale = false;
      this.refreshViews();
    } catch (error) {
      if (current())
        this.notice(error.message);
    } finally {
      if (this.compileJob)
        this.api(requestBody('build-cancel', {job : this.compileJob})).catch(() => {});
      this.compileJob = null;
      this.state.compileProgress = null;
      if (this.cancelCompile && current())
        this.notice(label('errors.cancelled'));
      this.state.busy = false;
      this.refreshHeader();
    }
  }
  async checkCompiler() {
    if (this.state.busy || !acceptedGenome(this.state) || !this.state.report?.compiler)
      return;
    const document = this.state.document, genome = this.state.genome, request = this.newFishRequest;
    const current = () => this.state.document === document && this.state.genome === genome &&
                          this.newFishRequest === request;
    this.state.busy = true;
    this.refreshHeader();
    try {
      const result = await this.api(
          requestBody('check', {genome, plan : compileDocument(document, this.state.sites)}),
          API_WAIT.long);
      if (current())
        this.state.robustness = result;
    } catch (error) {
      if (current())
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
  async startFish(example) {
    if (this.state.busy)
      return;
    const request = ++this.newFishRequest, document = this.state.document;
    const current = () => request === this.newFishRequest && this.state.document === document;
    this.state.busy = true;
    this.refreshHeader();
    try {
      // Choosing a fish only opens its blueprint; it is compiled when the user asks for it.
      const report = await this.api(requestBody('new', {example}), API_WAIT.long);
      if (current())
        this.loadFish(report.document);
    } catch (error) {
      if (current())
        this.notice(error.message);
    } finally {
      this.state.busy = false;
      this.refreshHeader();
    }
  }
  removeChosen() {
    const doc = this.state.document;
    if (this.state.multi.size < 2)
      return this.removeSelection(this.state.selected);
    let next = doc;
    for (const id of this.state.multi)
      next = (findOrgan(next, id) ? removeOrgan(next, id) : removeCenter(next, id)) ?? next;
    if (next !== doc)
      this.changeDocument(next);
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
    } else if (wire.dataset.nerve)
      this.bendNerve(wire.dataset.nerve,
                     cameraCoordinates(event, this.bodyMap(), this.state.camera));
    else
      this.bendWire(
          {wires : wire.dataset.wires.split(' '), mirrored : wire.hasAttribute('data-mirrored')},
          cameraCoordinates(event, this.bodyMap(), this.state.camera));
    return true;
  }
  // A bend set on a nerve bends every bundle in it through the same point; a bundle drawn as the
  // mirror of its wire stores the mirrored point.
  bendNerve(members, point) {
    const bundles = members.split(' ').map(member => {
      const [wires, mirrored] = member.split(':');
      return {wires : wires.split(','), mirrored : mirrored === '1'};
    });
    const first = bundles[0], bends = bendsWith(this.state, first.wires, point, first.mirrored);
    const mirror = list => list.map(p => ({x : p.x, y : 2 * BODY_FRAME.middle - p.y}));
    let doc = bends && this.state.document;
    for (const b of bundles)
      doc = doc && setBends(doc, b.wires, b.mirrored === first.mirrored ? bends : mirror(bends));
    if (!doc)
      return this.notice(label('wiring.noWire'));
    this.changeDocument(doc, this.state.selected);
    this.notice(label('wiring.bent'));
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
    // Clicks on the colour strip and the contrast scene are drags, except on the scene itself,
    // which turns the contrast, and on the other colour types, which choose one.
    if (event.target.closest?.('[data-vision-handle],[data-spectrum]') &&
        !event.target.closest?.('[data-vision-polarity],[data-vision-profile]'))
      return;
    if (clickOn(this, event, ANYWHERE_CLICKS))
      return;
    if (this.state.station === 'breeding' || this.state.station === 'trials')
      return this[this.state.station].click(event);
    if (this.state.station === 'hub')
      return this.hubClick(event);
    if (this.state.station !== 'studio' || clickOn(this, event, STUDIO_CLICKS))
      return;
    if (this.state.mode === 'cppn')
      return clickOn(this, event, CPPN_CLICKS);
    clickOn(this, event, FISH_CLICKS);
  }
  hubClick(event) {
    const breed = event.target.closest?.('[data-hub-breed]'),
          atelier = event.target.closest?.('[data-hub-atelier]');
    if (breed) {
      this.breeding.state.fish = breed.dataset.hubBreed;
      this.navigate('breeding');
    } else if (atelier) {
      this.navigate('studio');
      this.startFish(atelier.dataset.hubAtelier);
    }
  }
  draftLine() {
    const {anatomy, document : doc} = this.state;
    return this.shownDesign === doc && Number.isFinite(anatomy?.neurons)
               ? t('studio.hub.draft', {name : doc.name, cells : anatomy.neurons})
               : doc.name;
  }
  refreshHubDraft() {
    if (this.state.station !== 'hub')
      return;
    const draft = this.draftLine();
    if (this.hub.state.draft === draft)
      return;
    this.hub.state.draft = draft;
    this.hub.render();
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
    // Saving the same group again replaces its entry in the library instead of adding one more.
    const module = {id : assembly.id, name, organs, wires};
    try {
      const result = await this.api(requestBody('save-module', {module}));
      this.state.userModules = result.modules;
      this.renderShell();
      this.notice(label('status.moduleSaved'));
    } catch (error) {
      this.notice(error.message);
    }
  }
  // A saved group is gone for good, so the first click only asks and the question lapses.
  async deleteModule(id) {
    clearTimeout(this.deleteTimer);
    if (this.state.deletingModule !== id) {
      this.state.deletingModule = id;
      this.deleteTimer = setTimeout(() => {
        this.state.deletingModule = null;
        this.refreshLibrary(true);
      }, DELETE_ASKS);
      return this.refreshLibrary(true);
    }
    this.state.deletingModule = null;
    try {
      const result = await this.api(requestBody('delete-module', {id}));
      this.state.userModules = result.modules;
      this.refreshLibrary(true);
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
      return this.changeDocument(doc, this.state.selected);
    }
    if (element.id === GENOME_FILE_ID) {
      const file = element.files?.[0];
      if (!file)
        return;
      file.text()
          .then(async genome => {
            const report = await this.api(requestBody('inspect', {genome}));
            this.stopPulse();
            this.state.stimulus = null;
            this.state.genome = genome;
            this.state.report = report;
            this.state.stale = false;
            this.setMode('cppn');
          })
          .catch(error => this.notice(error.message));
      return;
    }
    changeOn(this, element, FISH_CHANGES);
  }
  keydown(event) {
    if (event.key === 'Escape' && this.closeSceneOptions(true)) {
      event.preventDefault();
      return;
    }
    if (this.regionKey(event) || this.responseKey(event))
      return;
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
    if (this.state.station !== 'studio' || this.state.mode !== 'fish' ||
        event.target.closest?.('input,textarea,select'))
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
      this.removeChosen();
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
