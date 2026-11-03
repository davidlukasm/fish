import {beginEggPlacement} from './world.js';
import {HORMONE_EFFECT, ROUTE} from './schema.js';
import {request as sessionRequest, serverText} from './session.js';
import {t} from './strings.js';
import {STUDIO_ICON} from './organ_icons.js';
import {MODULES, NEURON_BY_KEY, ORGAN_BY_KEY, eligible} from './studio_organs.js';
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
  removeCenter,
  removeOrgan,
  removeSubstance,
  removeWire,
  setSubstance,
  updateCenter,
  updateReceptor,
  updateWire,
  validateDocument
} from './studio_model.js';
import {cameraCoordinates, sitePoint} from './studio_geometry.js';
import {escapeText, fishScene, placementPreview, siteHints, tone} from './studio_views.js';
import {inspector, library, toolPalette} from './studio_panels.js';
import {cppnGraph, cppnInspector, cppnToolbar} from './studio_graph.js';

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
      document : newDocument(label('app.newFish')),
      sites : [],
      capabilities : null,
      selected : null,
      multi : new Set(),
      camera : {zoom : 1, x : 560, y : 365},
      userModules : [],
      effect : 0,
      focusSubstance : 0,
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
    this.pulseHandle = null;
    this.pulseOverlay = null;
    this.pulseNodes = [];
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
    this.root.addEventListener('dragend', () => this.clearPreview());
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
    this.state.tool = tool;
    if (tool === 'learn' &&
        ![HORMONE_EFFECT.learning, HORMONE_EFFECT.eligibility].includes(this.state.effect))
      this.state.effect = HORMONE_EFFECT.learning;
    this.clearPreview();
    this.refreshTools();
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
                    '<button data-network="all" class="' + (s.wireScope === 'all' ? 'active' : '') +
                    '">' + label('tools.allNetworks') + '</button>' +
                    '<button data-network="focus" class="' +
                    (s.wireScope === 'focus' ? 'active' : '') + '">' +
                    label('tools.focusedNetwork') + '</button></div></div>' +
                    '<div class="aid-scene-body"><div class="aid-scene-frame">' + fishScene(s) +
                    '</div>' + toolPalette(s) + '<span class="aid-canvas-toolbar">' +
                    Math.round(s.camera.zoom * 100) + '%</span></div>' +
                    '<div class="aid-canvas-caption"><span>' + label('tools.drag') +
                    '</span><span>' + label('tools.dropOutside') + '</span></div>') +
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
    let q1, q2, patch;
    if (control.kind === 'learning') {
      patch = {
        mode : Math.max(-1, Math.min(1, ((x * 280 - 24) / 232) * 2 - 1)),
        qwidth : Math.max(0, Math.min(1, (132 - y * 170) / 110))
      };
    } else if (control.kind === 'spectrum')
      q1 = x * 2 - 1;
    else if (control.kind === 'compass') {
      q1 = Math.max(-1, Math.min(1, ((x * 200 - 12) / 176) * 2 - 1));
      q2 = Math.max(-1, Math.min(1, 1 - ((y * 135 - 8) / 118) * 2));
    } else {
      const radius = control.element.classList.contains('aid-hormone-compass') ? 51 : 60;
      q1 = Math.max(-1, Math.min(1, (x * 150 - 75) / radius));
      q2 = Math.max(-1, Math.min(1, (75 - y * 150) / radius));
    }
    patch ??= q2 === undefined ? {q1} : {q1, q2};
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
      const marker = control.element.querySelector('.aid-scent-selector,.aid-vector-point');
      if (marker) {
        const vector = control.kind === 'compass' ? {x : 12 + (q1 + 1) * 88, y : 8 + (1 - q2) * 59}
                       : control.element.classList.contains('aid-hormone-compass')
                           ? {x : 75 + q1 * 51, y : 75 - q2 * 51}
                           : {x : 75 + q1 * 60, y : 75 - q2 * 60};
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
    this.state.report = null;
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
  playPulse(frames) {
    this.stopPulse();
    const svg = this.root.querySelector('#aid-body-map');
    if (!svg || !Array.isArray(frames) || !frames.length)
      return;
    const centers = allCenters(this.state.document);
    const indices = new Map(centers.map((center, i) => [center.id, i]));
    const nodes = centers.map(center => svg.querySelector('[data-center="' + center.id + '"]'));
    const wires = this.state.document.wires
                      .map(wire => {
                        const path =
                            svg.querySelector('[data-wire="' + wire.id + '"] .aid-wire-ink');
                        const from = indices.get(wire.from), to = indices.get(wire.to);
                        return path && from !== undefined && to !== undefined
                                   ? {path, from, to, strength : wire.strength}
                                   : null;
                      })
                      .filter(Boolean);
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    overlay.setAttribute('class', 'aid-pulse-overlay');
    const particles = wires.map(({path, strength}) => {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'aid-signal-particle');
      dot.setAttribute('r', String(1.5 + 3 * strength));
      dot.setAttribute('opacity', '0');
      overlay.appendChild(dot);
      return {dot, length : path.getTotalLength()};
    });
    svg.appendChild(overlay);
    this.pulseOverlay = overlay;
    this.pulseNodes = nodes;
    const started = performance.now(), step = 85, duration = frames.length * step;
    const draw = now => {
      if (this.pulseOverlay !== overlay || !overlay.isConnected)
        return;
      const frame = Math.min(frames.length - 1, Math.floor((now - started) / step));
      const values = frames[frame] ?? [];
      nodes.forEach((element, i) => {
        if (!element)
          return;
        const activation = Math.max(0, Math.min(1, values[i] ?? 0));
        element.style.opacity = String(.65 + .35 * activation);
        element.style.filter =
            activation > .03 ? 'drop-shadow(0 0 ' + (2 + activation * 12) + 'px #e9eda5)' : '';
      });
      wires.forEach((wire, i) => {
        const source = Math.max(0, values[wire.from] ?? 0);
        const target = Math.max(0, values[wire.to] ?? 0);
        const strength = Math.min(1, Math.max(source, target));
        wire.path.style.opacity = String(.2 + .8 * strength);
        const {dot, length} = particles[i];
        if (strength < .04) {
          dot.setAttribute('opacity', '0');
          return;
        }
        const phase = ((now - started) / (400 + 500 * (1 - wire.strength))) % 1;
        const point = wire.path.getPointAtLength(length * phase);
        dot.setAttribute('cx', String(point.x));
        dot.setAttribute('cy', String(point.y));
        dot.setAttribute('opacity', String(strength));
      });
      if (now - started < duration)
        this.pulseHandle = requestAnimationFrame(draw);
      else
        this.stopPulse();
    };
    this.pulseHandle = requestAnimationFrame(draw);
  }
  stopPulse() {
    if (this.pulseHandle !== null)
      cancelAnimationFrame(this.pulseHandle);
    this.pulseHandle = null;
    this.pulseOverlay?.remove();
    this.pulseOverlay = null;
    for (const node of this.pulseNodes ?? []) {
      if (!node)
        continue;
      node.style.filter = '';
      node.style.opacity = '';
    }
    this.pulseNodes = [];
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
    for (const [from, to] of [[ eye, nerve ], [ smell, nerve ], [ nerve, fin ], [ nerve, tail ]]) {
      const r = addWire(doc, from, to);
      if (r)
        doc = r.document;
    }
    this.changeDocument(doc);
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
    if (selectedCenter)
      return this.select('center', selectedCenter.dataset.selectCenter);
    const direct = event.target.closest?.('[data-assembly],[data-organ],[data-center],[data-wire]');
    if (direct) {
      const kind = direct.hasAttribute('data-wire')       ? 'wire'
                   : direct.hasAttribute('data-center')   ? 'center'
                   : direct.hasAttribute('data-assembly') ? 'assembly'
                                                          : 'organ';
      const id = direct.dataset[kind];
      if (this.state.tool === 'erase')
        return this.removeSelection({kind, id});
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
    const gland = event.target.closest?.('[data-gland-substance]');
    if (gland) {
      const index = Number(gland.dataset.glandSubstance);
      const total =
          this.state.capabilities?.bloodSubstances ?? (this.state.capabilities?.hormones ?? 4) + 2;
      const angle = 2 * Math.PI * index / total;
      const draft = updateCenter(this.state.document, gland.dataset.centerId,
                                 {q1 : Math.cos(angle), q2 : Math.sin(angle), qwidth : .05});
      return this.changeDocument(draft, {kind : 'center', id : gland.dataset.centerId});
    }
    const mirror = event.target.closest?.('[data-mirror-organ]');
    if (mirror) {
      const result = mirrorOrgan(this.state.document, mirror.dataset.mirrorOrgan, this.state.sites);
      if (result)
        this.changeDocument(result.document, {kind : 'organ', id : result.organId});
      return;
    }
    if (event.target.closest?.('[data-add-substance]')) {
      const doc = addSubstance(this.state.document, this.state.capabilities?.hormones ?? 4);
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
    const scope = event.target.closest?.('[data-select-substance]');
    if (scope) {
      this.state.focusSubstance = Number(scope.dataset.selectSubstance);
      return this.refreshInspector();
    }
    if (event.target.closest?.('#aid-body-map'))
      return this.select(null, null);
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
    if (element.dataset.receptorActive) {
      const id = element.dataset.receptorActive;
      this.changeDocument(updateReceptor(this.state.document, id, Number(element.dataset.receptorEffect),
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
    const numeric = Number(element.value);
    if (!Number.isFinite(numeric))
      return;
    if (id.includes(':')) {
      const cut = id.lastIndexOf(':'), centerId = id.slice(0, cut),
            effect = Number(id.slice(cut + 1));
      this.changeDocument(
          updateReceptor(this.state.document, centerId, effect, {[field] : numeric}),
          {kind : 'center', id : centerId}, finalize);
    } else if (this.state.document.wires.some(w => w.id === id)) {
      this.changeDocument(updateWire(this.state.document, id, {[field] : numeric}),
                          {kind : 'wire', id}, finalize);
    } else {
      this.changeDocument(updateCenter(this.state.document, id, {[field] : numeric}),
                          {kind : 'center', id}, finalize);
    }
    if (!finalize) {
      const output = element.closest('.aid-dial')?.querySelector('output');
      if (output) {
        const precision = Math.max(2, (String(element.step).split('.')[1] ?? '').length);
        output.textContent = numeric.toFixed(precision);
      }
    }
  }
  zoom(direction, anchor = null) {
    const c = this.state.camera, previous = c.zoom;
    c.zoom = direction === 'in'    ? Math.min(8, c.zoom * 1.35)
             : direction === 'out' ? Math.max(.65, c.zoom / 1.35)
                                   : 1;
    if (anchor && previous !== c.zoom) {
      c.x += (anchor.x - c.x) * (1 - previous / c.zoom);
      c.y += (anchor.y - c.y) * (1 - previous / c.zoom);
    }
    if (direction === 'fit') {
      c.x = 560;
      c.y = 365;
    }
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
    const result = kind === 'module'
                       ? placeModule(this.state.document, value, this.state.sites, position)
                       : this.placeUserModule(value, position);
    if (!result)
      return '';
    const existing = new Set(allCenters(this.state.document).map(c => c.id));
    const added = allCenters(result.document).filter(c => !existing.has(c.id));
    const paths =
        result.document.wires
            .filter(w => added.some(c => c.id === w.from) && added.some(c => c.id === w.to))
            .map(w => {
              const a = added.find(c => c.id === w.from), b = added.find(c => c.id === w.to);
              const pa = sitePoint(this.state.sites.find(s => s.id === a.site), a.organType),
                    pb = sitePoint(this.state.sites.find(s => s.id === b.site), b.organType);
              return '<path d="M' + pa.x + ' ' + pa.y + ' L' + pb.x + ' ' + pb.y +
                     '" stroke="#b8cfb4" stroke-width="3" fill="none" stroke-dasharray="7 4"/>';
            })
            .join('');
    const icons =
        added
            .map(c => {
              const site = this.state.sites.find(s => s.id === c.site),
                    pos = sitePoint(site, c.organType);
              const zoom = this.state.camera.zoom;
              return '<g transform="translate(' + pos.x + ' ' + pos.y + ') scale(' + 1 / zoom +
                     ')"><circle r="22" fill="' + tone(c.organType) +
                     '" opacity=".65" stroke="#f2deb0" stroke-width="3"/>' +
                     '<path d="' + escapeText(STUDIO_ICON[c.organType] ?? STUDIO_ICON.brain) +
                     '" fill="none" stroke="#123038" stroke-width="2" transform="translate(-11 -11)"/>' +
                     '</g>';
            })
            .join('');
    return paths + icons;
  }
  dragOver(event) {
    const svg = event.target.closest?.('#aid-body-map');
    if (!svg || !this.dragging || !this.state.sites.length)
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const position = cameraCoordinates(event, svg, this.state.camera);
    const module = this.dragging.kind === 'module' || this.dragging.kind === 'user-module';
    if (module) {
      const preview = this.root.querySelector('#aid-drag-preview');
      if (preview)
        preview.innerHTML = this.previewModule(this.dragging.kind, this.dragging.value, position);
      return;
    }
    const desc = this.dragging.kind === 'organ'
                     ? ORGAN_BY_KEY[this.dragging.value]?.centers[0]
                     : {role : 'nerve', functionCode : -1, surface : 'any'};
    const site =
        desc ? closestSite(desc, this.state.sites,
                           new Set(allCenters(this.state.document).map(c => c.site)), position)
             : null;
    const preview = this.root.querySelector('#aid-drag-preview');
    if (preview)
      preview.innerHTML = placementPreview(
          this.state, {type : this.dragging.kind === 'organ' ? this.dragging.value : 'brain'},
          site ? sitePoint(site) : position);
    const hints = this.root.querySelector('#aid-placement-hints');
    if (hints && desc && hints.dataset.active !== this.dragging.value) {
      hints.innerHTML = siteHints(this.state, desc);
      hints.dataset.active = this.dragging.value;
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
    let result;
    if (kind === 'organ')
      result = addOrgan(this.state.document, value, this.state.sites, position);
    if (kind === 'neuron')
      result = addNeuron(this.state.document, value, this.state.sites, position);
    if (kind === 'module')
      result = placeModule(this.state.document, value, this.state.sites, position);
    if (kind === 'user-module')
      result = this.placeUserModule(value, position);
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
  placeUserModule(id, position) {
    const module = this.state.userModules.find(m => m.id === id);
    if (!module)
      return null;
    let draft = structuredClone(this.state.document);
    const idMap = new Map(), organIds = [];
    const restore = (old, fresh) => {
      const newId = fresh.id, newSite = fresh.site;
      Object.assign(fresh, structuredClone(old));
      fresh.id = newId;
      fresh.site = newSite;
      idMap.set(old.id, newId);
    };
    for (const original of module.organs) {
      if (original.type === 'brain') {
        for (const old of original.centers) {
          const added = addNeuron(draft, NEURON_BY_KEY[old.key] ? old.key : 'relay',
                                  this.state.sites, position);
          if (!added)
            return null;
          draft = added.document;
          restore(old, findCenter(draft, added.centerId).center);
        }
        organIds.push('brain');
      } else {
        const added = addOrgan(draft, original.type, this.state.sites, position);
        if (!added)
          return null;
        draft = added.document;
        const mapped = new Set();
        for (const old of original.centers) {
          const freshOrgan = findOrgan(draft, added.organId);
          let fresh = freshOrgan.centers.find(c => c.key === old.key && !mapped.has(c.id));
          if (!fresh) {
            const extra = addCenter(draft, added.organId, this.state.sites, position, old.key);
            if (!extra)
              return null;
            draft = extra.document;
            fresh = findCenter(draft, extra.centerId).center;
          }
          mapped.add(fresh.id);
          restore(old, fresh);
        }
        organIds.push(added.organId);
      }
    }
    for (const old of module.wires) {
      const from = idMap.get(old.from), to = idMap.get(old.to);
      if (!from || !to)
        continue;
      const result = addWire(draft, from, to);
      if (!result)
        continue;
      draft = result.document;
      draft = updateWire(draft, result.wireId, old);
    }
    const done = assemble(draft, organIds, module.name, [...idMap.values() ]);
    return done ? {document : done, assemblyId : done.assemblies.at(-1).id} : null;
  }
  clearPreview() {
    this.root.querySelector('#aid-drag-preview')?.replaceChildren();
    const hints = this.root.querySelector('#aid-placement-hints');
    if (hints) {
      hints.replaceChildren();
      hints.dataset.active = '';
    }
  }
  pointerDown(event) {
    if (event.button !== 0 || this.state.station !== 'studio' || this.state.mode !== 'fish')
      return;
    const graphic = event.target.closest?.(
        '[data-spectrum],[data-compass],[data-vector-pad],[data-learning-pad]');
    if (graphic) {
      let kind = 'vector';
      if (graphic.hasAttribute('data-spectrum'))
        kind = 'spectrum';
      else if (graphic.hasAttribute('data-compass'))
        kind = 'compass';
      else if (graphic.hasAttribute('data-learning-pad'))
        kind = 'learning';
      this.controlPointer = {
        element : graphic,
        kind,
        id : graphic.dataset[kind === 'vector'     ? 'vectorPad'
                             : kind === 'learning' ? 'learningPad'
                                                   : kind]
      };
      event.preventDefault();
      this.tuneGraphic(event);
      return;
    }
    const svg = event.target.closest?.('#aid-body-map');
    if (!svg)
      return;
    const item = event.target.closest?.('[data-center],[data-organ],[data-assembly],[data-wire]');
    const kind = item?.hasAttribute('data-center')     ? 'center'
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
    if (!drag || this.state.station !== 'studio')
      return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5)
      drag.moved = true;
    if (!drag.moved)
      return;
    const point = cameraCoordinates(event, drag.svg, this.state.camera);
    if (drag.pan) {
      const rect = this.root.querySelector('#aid-body-map')?.getBoundingClientRect() ||
                   drag.svg.getBoundingClientRect();
      const scale = 1000 / this.state.camera.zoom / Math.max(1, rect.width);
      this.state.camera.x = drag.pan.x - (event.clientX - drag.x) * scale;
      this.state.camera.y = drag.pan.y - (event.clientY - drag.y) * scale;
      this.refreshScene();
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
        preview.innerHTML = placementPreview(this.state,
        {type: drag.kind === 'organ' ? findOrgan(this.state.document,drag.id)?.type :
          drag.kind === 'assembly' ? 'brain' :
          findCenter(this.state.document,drag.id)?.organ.type}, point);
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
    if (!inside)
      return this.removeSelection({kind : drag.kind, id : drag.id});
    const point = cameraCoordinates(event, drag.svg, this.state.camera);
    const used =
        new Set(allCenters(this.state.document).filter(c => c.id !== drag.id).map(c => c.site));
    if (drag.kind === 'center') {
      const center = findCenter(this.state.document, drag.id)?.center;
      const site = center && closestSite(center, this.state.sites, used, point);
      if (site)
        this.changeDocument(moveCenter(this.state.document, drag.id, site.id, this.state.sites),
                            {kind : 'center', id : drag.id});
    } else if (drag.kind === 'organ') {
      const doc = moveOrgan(this.state.document, drag.id, this.state.sites, point);
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
