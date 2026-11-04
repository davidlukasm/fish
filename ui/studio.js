import {beginEggPlacement} from './world.js';
import {ATELIER_LIMITS, HORMONE_EFFECT, HORMONES, ROUTE} from './schema.js';
import {request as sessionRequest, serverText} from './session.js';
import {t} from './strings.js';
import {
  addCenter,
  addNeuron,
  addOrgan,
  addSubstance,
  addWire,
  allCenters,
  assemble,
  closestSite,
  compileDocument,
  findCenter,
  findOrgan,
  identifier,
  mirrorAssembly,
  mirrorOrgan,
  moveAssembly,
  removeAssembly,
  moveCenter,
  moveOrgan,
  newDocument,
  placeModule,
  placeStoredModule,
  removeCenter,
  removeOrgan,
  removeSubstance,
  removeWire,
  setLifePhase,
  setSubstance,
  updateCenter,
  updateGrowth,
  updateReceptor,
  updateWire,
  validateDocument,
  wheelPlace
} from './studio_model.js';
import {
  CAMERA_ZOOM,
  SNAP_DISTANCE,
  cameraBox,
  cameraCoordinates,
  cameraScale,
  nearFish,
  pointDistance,
  sitePoint
} from './studio_geometry.js';
import {
  assemblyPreview,
  escapeText,
  fishScene,
  organPreview,
  placementPreview,
  removalPreview,
  placementHints
} from './studio_views.js';
import {
  GROWTH,
  LEARNING_PAD,
  MEASURE,
  PHASE,
  WHEEL,
  dialReading,
  inspector,
  library,
  toolPalette
} from './studio_panels.js';

// A new growth receptor lets the body grow at full pace once even a little of its hormone is
// present. A new life phase starts at PHASE_START maturity and ends at PHASE_END.
const GROWTH_SENSITIVITY = 1, GROWTH_HALF = .01, PHASE_START = .6, PHASE_END = .9;
// A measurement doses MEASURE_LEVEL of a substance into the grown fish (maturity MEASURE_MATURITY).
const MEASURE_LEVEL = .5, MEASURE_MATURITY = 1;
import {cppnGraph, cppnInspector, cppnToolbar} from './studio_graph.js';
import {createSignalPlayer, displayedContacts} from './studio_pulse.js';

const API = ROUTE.atelier;
const label = key => t('studio.' + key);
const requestBody = (operation, extra = {}) => ({operation, ...extra});
let instance = null;

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
      camera : {zoom : 1, x : 560, y : 365},
      userModules : [],
      effect : 0,
      focusSubstance : 0,
      measureLevel : MEASURE_LEVEL,
      measurement : null,
      report : null,
      genome : '',
      cppnScope : 'all',
      cppnSelection : null,
      cppnConnectFrom : null,
      busy : false,
      stale : true,
      notice : ''
    };
    this.pointer = null;
    this.dragging = null;
    this.persistTimer = null;
    this.pulsePlayer = null;
    this.wireStartId = null;
    this.ignoreClickUntil = 0;
    this.controlPointer = null;
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
      if (results[1]?.document)
        this.state.document = validateDocument(results[1].document);
      this.state.userModules = results[2]?.modules ?? [];
      this.renderShell();
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
    this.state.tool = tool;
    if (tool === 'wire' && this.state.contactView !== 'design') {
      this.state.contactView = 'design';
      for (const button of this.root.querySelectorAll('[data-contacts]'))
        button.classList.toggle('active', button.dataset.contacts === 'design');
    }
    if (tool === 'learn' &&
        ![HORMONE_EFFECT.learning, HORMONE_EFFECT.eligibility].includes(this.state.effect))
      this.state.effect = HORMONE_EFFECT.learning;
    this.clearPreview();
    this.refreshTools();
    this.refreshScene();
    this.refreshInspector();
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
          '<main class="aid-hub-content"><small>AID / FORSCHUNGSSTATION</small>' +
          '<h2>' + label('app.hubTitle') + '</h2><p>' + label('app.hubLead') + '</p>' +
          '<div class="aid-hub-grid"><button class="aid-hub-tile active" data-action="aquarium">' +
          '<strong>' + label('app.hubAquarium') + '</strong>' +
          '<span>' + label('app.hubStatistics') + '</span></button>' +
          '<button class="aid-hub-tile active" data-action="atelier">' +
          '<strong>' + label('app.hubAtelier') + '</strong>' +
          '<span>' + label('app.hubStart') + '</span></button>' +
          '<button class="aid-hub-tile" disabled><strong>' + label('app.hubUpcoming') +
          '</strong></button></div></main>' +
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
        '<div class="aid-status">' +
        escapeText(s.report && !s.stale ? (s.report.neurons + ' ' + label('app.centers') + ' · ' +
                                           s.report.synapses + ' ' + label('app.contacts'))
                                        : (allCenters(s.document).length + ' ' +
                                           label('app.centers') + ' · ' + label('app.draft'))) +
        '</div>' +
        '<div class="aid-header-actions">' +
        '<button data-action="open">' + label('app.open') + '</button>' +
        '<button data-action="download"' + (!s.genome ? ' disabled' : '') + '>' +
        label('app.saveGenome') + '</button>' +
        '<button data-action="develop" class="primary"' + (s.busy ? ' disabled' : '') + '>' +
        (s.busy ? label('app.developBusy') : label('app.develop')) + '</button>' +
        '<button data-action="eggs"' + (!s.genome || !s.report?.viable ? ' disabled' : '') + '>' +
        label('app.placeEggs') + '</button>' +
        '<button data-action="new">' + label('app.newFish') + '</button>' +
        '<button data-action="example">' + label('app.example') + '</button></div>' +
        '<input type="file" id="aid-genome-file" accept=".genome,text/plain" hidden/></header>' +
        '<nav class="aid-modes"><button data-mode="fish" class="' + (!cppn ? 'active' : '') + '">' +
        label('app.modeFish') + '<small>' + label('app.parts') + '</small></button>' +
        '<button data-mode="cppn" class="' + (cppn ? 'active' : '') + '">' + label('app.modeCppn') +
        '<small>' + label('cppn.graph') + '</small></button></nav>' +
        '<div class="aid-workspace-main">' +
        '<div class="aid-library"><div class="aid-library-scroll">' +
        (cppn ? '<h3>' + label('cppn.graph') + '</h3>' + cppnToolbar(s) : library(s)) +
        '</div></div><section class="aid-stage">' +
        (cppn ? '<div class="aid-scene-top"><span>' + label('cppn.graph') + '</span></div>' +
                    '<div id="aid-cppn-scene" class="aid-scene-body">' + cppnGraph(s) + '</div>'
              : '<div class="aid-scene-top"><span>' + label('app.empty') +
                    '</span><div class="aid-view-options">' +
                    '<button data-contacts="design" class="' +
                    (s.contactView === 'design' ? 'active' : '') + '">' +
                    label('tools.drawnContacts') + '</button>' +
                    '<button data-contacts="actual" class="' +
                    (s.contactView === 'actual' ? 'active' : '') + '"' +
                    (s.stale || !s.report?.contacts?.length ? ' disabled' : '') + '>' +
                    label('tools.developedContacts') + '</button>' +
                    '<button data-network="all" class="' + (s.wireScope === 'all' ? 'active' : '') +
                    '">' + label('tools.allNetworks') + '</button>' +
                    '<button data-network="focus" class="' +
                    (s.wireScope === 'focus' ? 'active' : '') + '">' +
                    label('tools.focusedNetwork') + '</button></div></div>' +
                    '<div class="aid-scene-body"><div class="aid-scene-frame">' + fishScene(s) +
                    '</div>' + toolPalette(s) + '<span class="aid-canvas-toolbar">' +
                    Math.round(s.camera.zoom * 100) + '%</span></div>' +
                    '<div class="aid-canvas-caption"><span>' + label('tools.drag') +
                    '</span><div class="aid-site-legend"></div><span>' +
                    label('tools.dropOutside') + '</span></div>') +
        '</section><div class="aid-inspector"><div class="aid-inspector-scroll">' +
        (cppn ? cppnInspector(s) : inspector(s)) +
        '</div></div></div><footer class="aid-station-footer">' +
        '<span class="aid-message">' + escapeText(s.notice || label('status.waiting')) +
        '</span><span>v019 · AID</span></footer></div>';
  }
  refreshScene() {
    if (this.state.station !== 'studio')
      return;
    const target = this.root.querySelector(this.state.mode === 'fish' ? '.aid-scene-frame'
                                                                      : '#aid-cppn-scene');
    if (target)
      target.innerHTML = this.state.mode === 'fish' ? fishScene(this.state) : cppnGraph(this.state);
  }
  refreshInspector(reset = false) {
    const element = this.root.querySelector('.aid-inspector-scroll');
    if (!element)
      return;
    const scroll = reset ? 0 : element.scrollTop;
    element.innerHTML =
        this.state.mode === 'fish' ? inspector(this.state) : cppnInspector(this.state);
    element.scrollTop = scroll;
  }
  refreshTools() {
    const existing = this.root.querySelector('.aid-tools');
    if (existing)
      existing.outerHTML = toolPalette(this.state);
  }
  refreshHeader() {
    const state = this.state;
    const status = this.root.querySelector('.aid-status');
    if (status)
      status.textContent = state.report && !state.stale
                               ? state.report.neurons + ' ' + label('app.centers') + ' · ' +
                                     state.report.synapses + ' ' + label('app.contacts')
                               : allCenters(state.document).length + ' ' + label('app.centers') +
                                     ' · ' + label('app.draft');
    const download = this.root.querySelector('[data-action="download"]');
    if (download)
      download.disabled = !state.genome;
    const eggs = this.root.querySelector('[data-action="eggs"]');
    if (eggs)
      eggs.disabled = !state.genome || !state.report?.viable;
  }
  tuneGraphic(event) {
    const control = this.controlPointer;
    if (!control)
      return;
    const bounds = control.element.getBoundingClientRect();
    if (!bounds.width || !bounds.height)
      return;
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const clamp = (v, low = -1) => Math.max(low, Math.min(1, v));
    let q1, q2, patch;
    if (control.kind === 'spectrum')
      patch = {q1 : q1 = x * 2 - 1};
    else if (control.kind === 'compass') {
      q1 = clamp(((x * 200 - 12) / 176) * 2 - 1);
      q2 = clamp(1 - ((y * 135 - 8) / 118) * 2);
      patch = {q1, q2};
    } else if (control.kind === 'learning') {
      const pad = LEARNING_PAD, across = pad.width - 2 * pad.inset, up = pad.height - 2 * pad.inset;
      patch = {
        mode : clamp(((x * pad.width - pad.inset) / across) * 2 - 1),
        qwidth : clamp(1 - (y * pad.height - pad.inset) / up, 0)
      };
    } else {
      const radius = control.element.hasAttribute('data-wheel') ? WHEEL.radius : 60;
      q1 = clamp((x * WHEEL.size - WHEEL.centre) / radius);
      q2 = clamp((WHEEL.centre - y * WHEEL.size) / radius);
      patch = {q1, q2};
    }
    const current = findCenter(this.state.document, control.id)?.center;
    if (!current ||
        Object.entries(patch).every(([ key, value ]) => Math.abs(value - current[key]) < .001))
      return;
    this.stopPulse();
    this.state.document = updateCenter(this.state.document, control.id, patch);
    this.state.report = null;
    this.state.genome = '';
    this.state.stale = true;
    this.persist();
    if (control.kind === 'learning') {
      const marker = control.element.querySelector('.aid-learning-point');
      if (marker) {
        marker.setAttribute('cx', String(24 + (patch.mode + 1) * 116));
        marker.setAttribute('cy', String(132 - patch.qwidth * 110));
      }
    } else if (control.kind === 'spectrum') {
      const marker = control.element.querySelector('.aid-spectrum-marker');
      if (marker)
        marker.style.left = ((q1 + 1) * 50) + '%';
      const window = control.element.querySelector('.aid-spectrum-window');
      if (window) {
        const width = (current?.qwidth ?? 0) * 50, middle = (q1 + 1) * 50;
        window.style.left = Math.max(0, middle - width) + '%';
        window.style.width = (Math.min(100, middle + width) - Math.max(0, middle - width)) + '%';
      }
    } else {
      const pad = LEARNING_PAD;
      const vector =
          control.kind === 'compass'    ? {x : 12 + (q1 + 1) * 88, y : 8 + (1 - q2) * 59}
          : control.kind === 'learning' ? {
              x : pad.inset + (patch.mode + 1) / 2 * (pad.width - 2 * pad.inset),
              y : pad.inset + (1 - patch.qwidth) * (pad.height - 2 * pad.inset)
            }
          : control.element.hasAttribute('data-wheel')
              ? {x : WHEEL.centre + q1 * WHEEL.radius, y : WHEEL.centre - q2 * WHEEL.radius}
              : {x : 75 + q1 * 60, y : 75 - q2 * 60};
      for (const marker of control.element.querySelectorAll(
               '.aid-scent-selector,.aid-vector-point,.aid-wheel-halo')) {
        marker.setAttribute('cx', String(vector.x));
        marker.setAttribute('cy', String(vector.y));
      }
    }
    this.refreshScene();
    this.refreshHeader();
  }
  refreshCounts() { this.renderShell(); }
  persist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.api(requestBody('save-draft', {document : this.state.document}))
          .catch(error => this.notice(error.message));
    }, 400);
  }
  changeDocument(doc, selected = null, updateInspector = true) {
    if (!doc)
      return false;
    this.stopPulse();
    this.state.document = validateDocument(doc);
    this.state.selected = selected;
    this.state.multi.clear();
    this.state.stale = true;
    this.state.contactView = 'design';
    this.state.report = null;
    this.state.measurement = null;
    this.state.genome = '';
    this.persist();
    this.refreshScene();
    this.refreshHeader();
    if (updateInspector)
      this.refreshInspector();
    return true;
  }
  select(kind, id, event = null) {
    const current = this.state.selected;
    if (event?.ctrlKey || event?.metaKey) {
      if (kind === 'organ') {
        if (this.state.multi.has(id))
          this.state.multi.delete(id);
        else
          this.state.multi.add(id);
      }
    } else {
      this.state.multi.clear();
      this.state.selected =
          kind === null || current?.kind === kind && current.id === id ? null : {kind, id};
    }
    this.refreshScene();
    this.refreshInspector(true);
  }
  async develop() {
    if (this.state.busy)
      return;
    const plan = compileDocument(this.state.document, this.state.sites);
    if (!plan.groups.length)
      return this.notice(label('status.empty'));
    this.state.busy = true;
    this.renderShell();
    try {
      const result = await this.api(requestBody('build', {plan}), 60000);
      this.state.report = result;
      this.state.genome = result.genome;
      this.state.stale = false;
      this.state.contactView = result.contacts?.length ? 'actual' : 'design';
      this.notice(label('status.developed'));
    } catch (error) {
      this.notice(error.message);
    } finally {
      this.state.busy = false;
      this.renderShell();
    }
  }
  async stimulate(centerId) {
    if (!this.state.sites.length)
      return;
    if (!this.state.genome || this.state.stale)
      await this.develop();
    if (!this.state.genome || this.state.stale)
      return this.notice(label('status.probeNoGenome'));
    const group = allCenters(this.state.document).findIndex(c => c.id === centerId);
    if (group < 0)
      return;
    try {
      const result = await this.api(requestBody('probe', {
                                      genome : this.state.genome,
                                      plan : compileDocument(this.state.document, this.state.sites),
                                      group,
                                      steps : 24
                                    }),
                                    60000);
      this.playPulse(result.frames);
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
      this.refreshScene();
      this.refreshInspector();
    } catch (error) {
      this.notice(error.message);
    }
  }
  playPulse(frames) {
    this.stopPulse();
    const svg = this.root.querySelector('#aid-body-map');
    if (!svg || !Array.isArray(frames) || !frames.length)
      return;
    const centers = allCenters(this.state.document);
    const connections = this.state.contactView === 'actual' && !this.state.stale
                            ? displayedContacts(svg, centers, this.state.report)
                            : this.state.document.wires;
    this.pulsePlayer = createSignalPlayer(svg, centers, connections, frames);
    this.pulsePlayer.start();
  }
  stopPulse() {
    this.pulsePlayer?.stop();
    this.pulsePlayer = null;
  }
  async cppnAction(operation, data = {}) {
    if (this.state.busy)
      return;
    this.state.busy = true;
    try {
      const result = await this.api(
          requestBody(operation, {
            ...data,
            ...(operation === 'edit' || operation === 'inspect' ? {genome : this.state.genome} : {})
          }),
          60000);
      this.state.report = result;
      if (result.genome)
        this.state.genome = result.genome;
      this.state.stale = false;
    } catch (error) {
      this.notice(error.message);
    } finally {
      this.state.busy = false;
      this.refreshScene();
      this.refreshInspector();
    }
  }
  async placeEggs() {
    if (!this.state.genome || !this.state.report?.viable)
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
    if (!this.state.genome)
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
    const organs = [];
    const add = (type, x, y) => {
      const result = addOrgan(doc, type, sites, {x, y});
      if (result) {
        doc = result.document;
        organs.push(result);
      }
      return result?.centerId;
    };
    const eye = add('eye', 360, 300), smell = add('nose', 245, 425);
    const relay = addNeuron(doc, 'relay', sites, {x : 485, y : 345});
    let nerve = null;
    if (relay) {
      doc = relay.document;
      nerve = relay.centerId;
    }
    const fin = add('fin', 600, 470), tail = add('tail', 890, 350);
    add('mouth', 195, 365);
    add('eggs', 848, 330);
    add('sperm', 850, 395);
    // A gland releases substance A; the body grows while A binds its growth receptor.
    const gland = add('gland', 300, 360);
    const withSubstance = addSubstance(doc, HORMONES.levels);
    if (gland && withSubstance) {
      const substance = withSubstance.substances.at(-1).index;
      const [q1, q2] = wheelPlace(this.state.capabilities, substance);
      doc = updateCenter(withSubstance, gland, {q1, q2, qwidth : 0, tau : 1});
      doc = updateGrowth(
          doc, {active : 1, substance, sensitivity : GROWTH_SENSITIVITY, half : GROWTH_HALF});
    }
    for (const [from, to] of [[ eye, nerve ], [ smell, nerve ], [ nerve, fin ], [ nerve, tail ]]) {
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
      if (op === 'develop')
        return this.develop();
      if (op === 'eggs')
        return this.placeEggs();
      if (op === 'download')
        return this.download();
      if (op === 'open')
        return this.root.querySelector('#aid-genome-file')?.click();
    }
    const mode = event.target.closest?.('[data-mode]');
    if (mode)
      return this.setMode(mode.dataset.mode);
    if (this.state.station !== 'studio')
      return;
    if (event.target.closest?.('[data-tool]'))
      return this.setTool(event.target.closest('[data-tool]').dataset.tool);
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
    const selectedOrgan = event.target.closest?.('[data-select-organ]');
    if (selectedOrgan)
      return this.select('organ', selectedOrgan.dataset.selectOrgan);
    const selectedCenter = event.target.closest?.('[data-select-center]');
    if (selectedCenter) {
      if (selectedCenter.dataset.selectTool)
        this.setTool(selectedCenter.dataset.selectTool);
      return this.select('center', selectedCenter.dataset.selectCenter);
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
      if (this.state.tool === 'wire' && kind === 'center') {
        const from = this.wireStartId;
        this.wireStartId = null;
        if (from && from !== id) {
          const result = addWire(this.state.document, from, id);
          if (result)
            return this.changeDocument(result.document, {kind : 'wire', id : result.wireId});
        } else if (!from) {
          this.wireStartId = id;
          this.state.selected = {kind : 'center', id};
        }
        this.refreshScene();
        this.refreshInspector();
        return;
      }
      if (this.state.tool === 'stimulate') {
        const center = kind === 'organ' ? findOrgan(this.state.document, id)?.centers[0]?.id
                       : kind === 'assembly'
                           ? this.state.document.assemblies.find(a => a.id === id)?.centerIds?.[0]
                       : kind === 'center' ? id
                                           : null;
        return center && this.stimulate(center);
      }
      if (this.pointer?.moved)
        return;
      return this.select(kind, id, event);
    }
    const putNeuron = event.target.closest?.('[data-add-neuron]');
    if (putNeuron) {
      const added = addNeuron(this.state.document, putNeuron.dataset.addNeuron, this.state.sites,
                              {x : 495, y : 360});
      if (added)
        this.changeDocument(added.document, {kind : 'center', id : added.centerId});
      return;
    }
    const putCenter = event.target.closest?.('[data-add-center]');
    if (putCenter) {
      const organ = findOrgan(this.state.document, putCenter.dataset.addCenter);
      const first = organ?.centers[0], site = this.state.sites.find(s => s.id === first?.site);
      if (!site)
        return;
      const p = sitePoint(site, organ.type);
      const result =
          addCenter(this.state.document, organ.id, this.state.sites, {x : p.x + 16, y : p.y + 18});
      if (result)
        this.changeDocument(result.document, {kind : 'center', id : result.centerId});
      return;
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
      const draft = assemble(this.state.document, [...this.state.multi ]);
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
    const opponent = event.target.closest?.('[data-opponency]');
    if (opponent)
      return this.changeDocument(updateCenter(this.state.document, opponent.dataset.centerId,
                                              {q2 : Number(opponent.dataset.opponency)}),
                                 {kind : 'center', id : opponent.dataset.centerId});
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
    if (event.target.closest?.('[data-add-substance]')) {
      const doc = addSubstance(this.state.document, HORMONES.levels);
      if (doc)
        this.changeDocument(doc, this.state.selected);
      return;
    }
    const rename = event.target.closest?.('[data-rename-substance]');
    if (rename) {
      const index = Number(rename.dataset.renameSubstance);
      const current = this.state.document.substances.find(s => s.index === index);
      const name = prompt(label('inspector.substanceName'), current?.name ?? '');
      if (name !== null)
        this.changeDocument(setSubstance(this.state.document, index, name), this.state.selected);
      return;
    }
    const rmSub = event.target.closest?.('[data-remove-substance]');
    if (rmSub)
      return this.changeDocument(
          removeSubstance(this.state.document, Number(rmSub.dataset.removeSubstance)),
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
      this.refreshScene();
      return this.refreshInspector();
    }
    if (event.target.closest?.('#aid-body-map')) {
      this.wireStartId = null;
      return this.select(null, null);
    }
  }
  async saveAssembly(id) {
    const assembly = this.state.document.assemblies.find(a => a.id === id);
    if (!assembly)
      return;
    const name = prompt(label('inspector.saveModule'), assembly.name);
    if (!name)
      return;
    const memberCenters = new Set(assembly.centerIds ?? []);
    const organs =
        this.state.document.organs.filter(o => assembly.organIds.includes(o.id))
            .map(o => ({...o, centers : o.centers.filter(c => memberCenters.has(c.id))}));
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
      return this.cppnAction('edit', {edit : 'add-node', type : 3, parameter : 1});
  }
  change(event) {
    const element = event.target;
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
    const phaseSide = element.dataset.phaseStart !== undefined ? 'start'
                      : element.dataset.phaseEnd !== undefined ? 'end'
                                                               : null;
    if (phaseSide) {
      const id = element.dataset.phaseStart ?? element.dataset.phaseEnd;
      const value = element.checked ? (phaseSide === 'start' ? PHASE_START : PHASE_END) : null;
      this.changeDocument(this.lifePhase(id, {[phaseSide] : value}), {kind : 'center', id});
      return;
    }
    if (element.dataset.growthActive !== undefined) {
      this.changeDocument(updateGrowth(this.state.document, {active : element.checked ? 1 : 0}),
                          this.state.selected);
      return;
    }
    if (element.dataset.receptorActive) {
      const id = element.dataset.receptorActive;
      this.changeDocument(updateReceptor(this.state.document, id,
                                         Number(element.dataset.receptorEffect),
                                         {active : element.checked ? 1 : 0}),
                          {kind : 'center', id});
      return;
    }
    this.input(event, true);
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
  input(event, finalize = false) {
    const element = event.target, id = element.dataset.target;
    const field = element.dataset.field;
    if (!field || !id)
      return;
    const reading = dialReading(element.dataset.scale, Number(element.value), element.step);
    const numeric = reading.value;
    if (!Number.isFinite(numeric))
      return;
    if (id === MEASURE) {
      this.state.measureLevel = numeric;
    } else if (id === GROWTH) {
      this.changeDocument(updateGrowth(this.state.document, {[field] : numeric}),
                          this.state.selected, finalize);
    } else if (id.endsWith(':' + PHASE)) {
      const centerId = id.slice(0, -PHASE.length - 1);
      this.changeDocument(this.lifePhase(centerId, {[field] : numeric}),
                          {kind : 'center', id : centerId}, finalize);
    } else if (id.includes(':')) {
      const cut = id.lastIndexOf(':'), centerId = id.slice(0, cut),
            effect = Number(id.slice(cut + 1));
      this.changeDocument(
          updateReceptor(this.state.document, centerId, effect, {[field] : numeric}),
          {kind : 'center', id : centerId}, finalize);
    } else if (this.state.document.wires.some(w => w.id === id)) {
      this.changeDocument(updateWire(this.state.document, id, {[field] : numeric}),
                          {kind : 'wire', id}, finalize);
    } else {
      const gene = field === 'stimulusThreshold' || field === 'restDrive' ? 'threshold' : field;
      const value = field === 'stimulusThreshold' ? numeric * 2 - 1
                    : field === 'restDrive'       ? -numeric
                                                  : numeric;
      this.changeDocument(updateCenter(this.state.document, id, {[gene] : value}),
                          {kind : 'center', id}, finalize);
    }
    if (!finalize) {
      const output = element.closest('.aid-dial')?.querySelector('output');
      if (output)
        output.textContent = reading.text;
    }
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
    if (direction === 'fit') {
      c.x = 560;
      c.y = 365;
    }
    const svg = this.root.querySelector('#aid-body-map');
    if (svg) {
      const box = cameraBox(c);
      svg.setAttribute('viewBox', [ box.x, box.y, box.width, box.height ].join(' '));
      const scale = 1 / c.zoom;
      const marks = svg.querySelectorAll('.aid-organ-stamp,.aid-neural-center,.aid-assembly-stamp');
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
      for (const hint of svg.querySelectorAll('.aid-site-hint'))
        hint.setAttribute('transform', 'translate(' + hint.dataset.pointX + ' ' +
                                           hint.dataset.pointY + ') scale(' + scale + ')');
    } else
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
    if (!nearFish(position, this.state.sites)) {
      this.clearPreview();
      return;
    }
    const {kind, value} = this.dragging;
    const module = kind === 'module' || kind === 'user-module';
    const preview = this.root.querySelector('#aid-drag-preview');
    if (preview)
      preview.innerHTML = module ? this.previewModule(kind, value, position)
                                 : organPreview(this.state, kind, value, position);
    const hints = this.root.querySelector('#aid-placement-hints');
    const key = kind + ':' + value;
    if (hints && hints.dataset.active !== key) {
      const displayed = placementHints(this.state, kind, value);
      hints.innerHTML = displayed.svg;
      const legend = this.root.querySelector('.aid-site-legend');
      if (legend)
        legend.innerHTML = displayed.legend;
      hints.dataset.active = key;
    }
  }
  drop(event) {
    const svg = event.target.closest?.('#aid-body-map');
    if (!svg || !this.dragging)
      return;
    event.preventDefault();
    const position = cameraCoordinates(event, svg, this.state.camera);
    const {kind, value} = this.dragging;
    this.dragging = null;
    this.clearPreview();
    if (!nearFish(position, this.state.sites))
      return this.notice(label('status.noRoom'));
    let result;
    if (kind === 'organ')
      result = addOrgan(this.state.document, value, this.state.sites, position, SNAP_DISTANCE);
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
    const extendingOrgan = this.state.document.organs.some(organ => organ.id === result.organId);
    this.changeDocument(result.document, {
      kind : result.assemblyId ? 'assembly'
             : result.organId === 'brain' || extendingOrgan ? 'center'
                                                            : 'organ',
      id : result.assemblyId ??
           (result.organId === 'brain' || extendingOrgan ? result.centerId : result.organId)
    });
    this.refreshTools();
    this.notice(label('status.placed'));
  }
  clearPreview() {
    this.root.querySelector('#aid-drag-preview')?.replaceChildren();
    const hints = this.root.querySelector('#aid-placement-hints');
    if (hints) {
      hints.replaceChildren();
      hints.dataset.active = '';
    }
    this.root.querySelector('.aid-site-legend')?.replaceChildren();
  }
  pointerDown(event) {
    if (event.button !== 0 || this.state.station !== 'studio' || this.state.mode !== 'fish')
      return;
    const graphic = event.target.closest?.(
        '[data-spectrum],[data-compass],[data-vector-pad],[data-learning-pad]');
    if (graphic) {
      const kind = graphic.hasAttribute('data-spectrum')       ? 'spectrum'
                   : graphic.hasAttribute('data-compass')      ? 'compass'
                   : graphic.hasAttribute('data-learning-pad') ? 'learning'
                                                               : 'vector';
      const key = {vector : 'vectorPad', learning : 'learningPad'}[kind] ?? kind;
      this.controlPointer = {element : graphic, kind, id : graphic.dataset[key]};
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
    if (this.state.tool === 'wire' && kind === 'center')
      this.pointer.wireFrom = id;
    if (this.state.tool === 'pan')
      this.pointer.pan = {x : this.state.camera.x, y : this.state.camera.y};
  }
  pointerMove(event) {
    if (this.controlPointer)
      return this.tuneGraphic(event);
    const drag = this.pointer;
    if (!drag) {
      const svg = event.target?.closest?.('#aid-body-map');
      if (svg && this.wireStartId && this.state.tool === 'wire') {
        const source = findCenter(this.state.document, this.wireStartId);
        const site = this.state.sites.find(s => s.id === source?.center.site);
        const line = this.root.querySelector('#aid-connecting-line');
        if (site && line) {
          const from = sitePoint(site, source.organ.type);
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
      const source = findCenter(this.state.document, drag.wireFrom);
      const site = this.state.sites.find(s => s.id === source?.center.site);
      const from = site ? sitePoint(site, source.organ.type) : drag.origin;
      const line = this.root.querySelector('#aid-connecting-line');
      if (line)
        line.setAttribute('d', 'M' + from.x + ' ' + from.y + ' L' + point.x + ' ' + point.y);
      return;
    }
    if ([ 'organ', 'center', 'assembly' ].includes(drag.kind)) {
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
                : removalPreview(this.state, point);
    }
  }
  pointerUp(event) {
    if (this.controlPointer) {
      this.tuneGraphic(event);
      this.controlPointer = null;
      this.refreshInspector();
      return;
    }
    const drag = this.pointer;
    if (!drag)
      return;
    this.pointer = null;
    if (!drag.moved)
      return;
    this.ignoreClickUntil = performance.now() + 350;
    event.preventDefault();
    if (drag.wireFrom) {
      this.wireStartId = null;
      const target =
          document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-center]');
      const id = target?.dataset.center;
      if (id) {
        const result = addWire(this.state.document, drag.wireFrom, id);
        if (result)
          this.changeDocument(result.document, {kind : 'wire', id : result.wireId});
      }
      this.clearPreview();
      return;
    }
    if (drag.pan)
      return;
    if (!['center', 'organ', 'assembly'].includes(drag.kind))
      return;
    const bounds = this.root.querySelector('.aid-scene-frame')?.getBoundingClientRect();
    if (!bounds)
      return;
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
                   event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    const point = cameraCoordinates(event, drag.svg, this.state.camera);
    if (!inside || !nearFish(point, this.state.sites))
      return this.removeSelection({kind : drag.kind, id : drag.id});
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
    } else if (drag.kind === 'organ') {
      const doc = moveOrgan(this.state.document, drag.id, this.state.sites, point, SNAP_DISTANCE);
      if (doc)
        this.changeDocument(doc, {kind : 'organ', id : drag.id});
    } else {
      const doc = moveAssembly(this.state.document, drag.id, this.state.sites, point);
      if (doc)
        this.changeDocument(doc, {kind : 'assembly', id : drag.id});
    }
    this.clearPreview();
  }
  keydown(event) {
    if (this.state.station !== 'studio' || event.target.closest?.('input,textarea,select'))
      return;
    if (event.key === 'Escape') {
      this.wireStartId = null;
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
