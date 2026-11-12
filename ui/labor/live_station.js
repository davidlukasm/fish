import {ROUTE} from '../schema.js';
import {postJson, serverText} from '../session.js';
import {t} from '../strings.js';
import {escapeText} from '../studio/view/markup.js';
import {hydrateRender} from '../statistics_frame.js';
import {horizontalDelta} from '../state.js';
import {
  founderOptions,
  liveShell,
  metricCards,
  lifeLines,
  tracks,
  candidateTable,
  word,
  number
} from './live_view.js';
import {paintLiveScene, projection} from './live_scene.js';

export async function laborRequest(body, route = ROUTE.labor) {
  const response = await postJson(route, body), payload = await response.json();
  if (!response.ok || !payload.ok)
    throw Error(typeof payload.error === 'string' ? payload.error : serverText(payload.error));
  return payload.result;
}
const POLL = 200;
const html = (root, selector, value) => {
  const node = root.querySelector(selector);
  if (node && node.innerHTML !== value)
    node.innerHTML = value;
};
const text = (root, selector, value) => {
  const node = root.querySelector(selector);
  if (node)
    node.textContent = value;
};

export class LiveStation {
  constructor(root, breeding = false) {
    this.root = root;
    this.breeding = breeding;
    this.route = breeding ? ROUTE.labor : ROUTE.trials;
    this.state = {fish : null};
    this.offered = [];
    this.worlds = [];
    this.paths = [];
    this.parents = new Set();
    this.selected = null;
    this.world = 0;
    this.trace = null;
    this.cursor = null;
    this.trail = 1000;
    this.camera = null;
    this.shown = false;
    this.epoch = 0;
    this.traceEpoch = 0;
    this.settings = {steps : 8000, scale : .3};
  }
  bindInputs() {
    if (this.inputsBound)
      return;
    this.inputsBound = true;
    this.root.addEventListener('change', event => this.change(event));
    this.root.addEventListener('input', event => {
      if (this.shown && event.target.matches('[data-live-time-slider]')) {
        this.cursor = Number(event.target.value);
        this.draw();
      }
    });
    this.root.addEventListener('keydown', event => {
      if (!this.shown || !event.target.closest('[data-live-canvas],.fl-life'))
        return;
      if (event.key === 'Escape') {
        this.select(null);
        event.preventDefault();
      }
      if ([ 'Enter', ' ' ].includes(event.key) && event.target.dataset.liveFish) {
        this.select(Number(event.target.dataset.liveFish));
        event.preventDefault();
      }
    });
    if (globalThis.ResizeObserver) {
      this.resize = new ResizeObserver(() => {
        if (this.shown)
          this.paint();
      });
      this.resize.observe(this.root);
    }
  }
  request(data) { return laborRequest(data, this.route); }
  async open(draft) {
    this.bindInputs();
    this.shown = true;
    this.draft = draft;
    const epoch = ++this.epoch;
    this.root.innerHTML = liveShell(this.breeding, draft, this.state.fish, this.offered);
    this.root.querySelector('[data-live-setting=steps]').value = this.settings.steps;
    const scale = this.root.querySelector('[data-live-setting=scale]');
    if (scale)
      scale.value = number(this.settings.scale, 2);
    this.bindCanvas();
    this.historyKey = null;
    this.draw();
    try {
      const overview = await this.request({operation : 'overview'});
      if (epoch !== this.epoch)
        return;
      this.offered = overview.fish;
      const founders = this.root.querySelector('[data-live-setting=fish]');
      this.state.fish ??= draft ? 'draft' : this.offered[0]?.key ?? null;
      founders.innerHTML = founderOptions(draft, this.state.fish, this.offered);
      this.job = overview.job;
      if (this.job)
        this.poll();
    } catch (error) {
      this.fail(error);
    }
  }
  close() {
    this.shown = false;
    ++this.epoch;
    ++this.traceEpoch;
    clearTimeout(this.timer);
  }
  fail(error) {
    const message = String(error.message ?? error);
    this.error = message.startsWith('labor.') ? t(message) : message;
    this.draw();
  }
  async poll() {
    clearTimeout(this.timer);
    if (!this.shown || !this.job)
      return;
    const epoch = this.epoch, job = this.job.id;
    try {
      const result = await this.request({
        operation : 'status',
        job,
        cursors : Object.fromEntries(
            this.worlds.map((w, i) => [i, {after : w.sequence ?? 0, scene : w.sceneRevision ?? 0}]))
      });
      if (epoch !== this.epoch || job !== this.job?.id)
        return;
      if (this.job.generation !== result.generation) {
        this.worlds = [];
        this.paths = [];
        this.parents.clear();
        this.selected = null;
        this.trace = null;
        ++this.traceEpoch;
        this.camera = null;
        this.cursor = null;
      }
      this.job = result;
      result.worlds.forEach((next, index) => {
        const previous = this.worlds[index], paths = this.paths[index] ??= new Map();
        if (next.resetPaths)
          paths.clear();
        next.frame = next.scene ? hydrateRender(next.scene, {renderAssets : next.scene.assets})
                                : previous?.frame;
        for (const event of next.events ?? []) {
          if (event.event === 'labor-reset') {
            for (const key of paths.keys())
              if (key.startsWith(event.world + ':'))
                paths.delete(key);
            continue;
          }
          if (event.kind !== 'point')
            continue;
          const key = event.world + ':' + event.id, points = paths.get(key) ?? [];
          if (points.at(-1)?.t !== event.t)
            points.push(event);
          const limit = event.id === this.selected ? 25000 : 1200;
          if (points.length > limit)
            points.splice(0, points.length - limit);
          paths.set(key, points);
        }
        for (const [key, points] of paths)
          if (Number(key.split(':')[1]) !== this.selected &&
              points.at(-1)?.t < next.state.step - this.trail)
            paths.delete(key);
        if (this.selected != null && index === this.world && this.trace) {
          const events = next.events.filter(e => e.world === 'trial' && e.id === this.selected);
          const points = new Map(this.trace.points.map(p => [p.t, p]));
          events.filter(e => e.kind === 'point').forEach(p => points.set(p.t, p));
          this.trace.points = [...points.values() ].sort((a, b) => a.t - b.t);
          this.trace.events.push(...events.filter(e => e.kind !== 'point'));
        }
        this.worlds[index] = next;
      });
      this.draw();
      if (this.resumeWhenReady && this.current()?.state.comparison &&
          !this.current()?.state.preparing) {
        this.resumeWhenReady = false;
        await this.command('resume');
      }
    } catch (error) {
      if (epoch === this.epoch)
        this.fail(error);
    } finally {
      if (this.shown && epoch === this.epoch && job === this.job?.id)
        this.timer = setTimeout(() => this.poll(), POLL);
    }
  }
  current() { return this.worlds[this.world]; }
  time() { return this.cursor ?? this.current()?.state.step ?? 0; }
  async start() {
    try {
      if (this.job && !['cancelled', 'failed'].includes(this.job.status))
        await this.request({operation : 'cancel', job : this.job.id});
      ++this.epoch;
      clearTimeout(this.timer);
      ++this.traceEpoch;
      this.worlds = [];
      this.paths = [];
      this.parents.clear();
      this.camera = null;
      this.trace = null;
      this.selected = null;
      this.cursor = null;
      this.error = '';
      const scale = this.root.querySelector('[data-live-setting=scale]');
      this.settings.steps = Number(this.root.querySelector('[data-live-setting=steps]').value);
      this.settings.scale = scale ? Number(scale.value.replace(',', '.')) : 0;
      if (!Number.isFinite(this.settings.scale) || this.settings.scale < 0 ||
          this.settings.scale > 1)
        throw Error(word('invalidScale'));
      this.job = await this.request({
        operation : 'start',
        fish : this.state.fish,
        ...this.settings,
        ...(this.state.fish === 'draft' ? this.draft : {})
      });
      this.root.querySelector('.fl-setup').open = false;
      this.draw();
      this.poll();
    } catch (error) {
      this.fail(error);
    }
  }
  async command(action, values = {}) {
    if (!this.job)
      throw Error(word('noJob'));
    return this.request({
      operation : 'command',
      job : this.job.id,
      world : this.world,
      action,
      fish : this.selected,
      ...values
    });
  }
  async control(axis, value) {
    const world = this.current();
    if (this.selected == null || !world)
      return;
    const target = {fish : this.selected, world : this.world}, job = this.job?.id;
    if (axis === 'energy') {
      const fish = world.state.fish.find(p => p.id === target.fish);
      if (value && !fish)
        return;
      value = value ? Math.max(0, Math.min(1, fish.energy / fish.capacity)) : -2;
    }
    if (axis !== 'leaves' && !world.state.comparison && !world.state.preparing) {
      this.resumeWhenReady = !world.state.paused;
      await this.command('compare', target);
      world.state.preparing = true;
    }
    if (job !== this.job?.id)
      return;
    await this.command('control', {...target, axis, value});
  }
  async select(id) {
    this.selected = id;
    this.trace = null;
    const epoch = ++this.traceEpoch, world = this.world, job = this.job?.id;
    this.draw();
    if (id == null || !job)
      return;
    try {
      const trace =
          await this.request({operation : 'life', job, world, channel : 'trial', fish : id});
      if (epoch !== this.traceEpoch || world !== this.world || job !== this.job?.id)
        return;
      this.trace = trace;
      this.historyKey = null;
      (this.paths[world] ??= new Map()).set('trial:' + id, trace.points);
      this.draw();
    } catch (error) {
      if (epoch === this.traceEpoch)
        this.fail(error);
    }
  }
  async change(event) {
    if (!this.shown)
      return;
    const element = event.target;
    try {
      if (element.dataset.liveSetting === 'fish')
        this.state.fish = element.value;
      if (element.matches('[data-live-speed]'))
        await this.command('speed', {value : Number(element.value)});
      if (element.matches('[data-live-trail]')) {
        this.trail = Number(element.value);
        this.paint();
      }
      if (element.dataset.liveParent) {
        element.checked ? this.parents.add(element.dataset.liveParent)
                        : this.parents.delete(element.dataset.liveParent);
        this.draw();
      }
      if (element.dataset.liveAxis)
        await this.control(element.dataset.liveAxis, element.type === 'checkbox'
                                                         ? Number(element.checked)
                                                         : Number(element.value));
    } catch (error) {
      this.fail(error);
    }
  }
  async click(event) {
    if (!this.shown)
      return;
    const chosen = event.target.closest('[data-live-fish]');
    if (chosen)
      return this.select(Number(chosen.dataset.liveFish));
    const world = event.target.closest('[data-live-world]');
    if (world) {
      this.world = Number(world.dataset.liveWorld);
      this.camera = null;
      this.cursor = null;
      return this.select(null);
    }
    const button = event.target.closest('[data-live-action]');
    if (!button || button.disabled)
      return;
    const action = button.dataset.liveAction;
    try {
      this.error = '';
      if (action === 'start')
        return this.start();
      if (action === 'deselect')
        return this.select(null);
      if (action === 'fit') {
        this.camera = null;
        return this.paint();
      }
      if (action === 'live') {
        this.cursor = null;
        return this.draw();
      }
      if (action === 'cancel') {
        this.job = await this.request({operation : 'cancel', job : this.job.id});
        this.resumeWhenReady = false;
      } else if (action === 'export') {
        const result = await this.request(
            {operation : 'export', job : this.job.id, world : this.world, fish : this.selected});
        const url = URL.createObjectURL(new Blob([ result.genome ], {type : 'text/plain'})),
              link = document.createElement('a');
        link.href = url;
        link.download = 'fish-' + this.selected + '.genome';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (action === 'next-best' || action === 'next-selected') {
        const result = await this.request({
          operation : 'next',
          job : this.job.id,
          ...(action === 'next-selected' ? {parents : [...this.parents ]} : {})
        });
        Object.assign(this.job, result);
      } else if ([
                   'forward', 'left', 'right', 'hold-turn', 'open-mouth', 'close-mouth', 'egg',
                   'sperm'
                 ].includes(action)) {
        const settings = {
          forward : [ 'forward', 1 ],
          left : [ 'turn', -1 ],
          right : [ 'turn', 1 ],
          'hold-turn' : [ 'turn', 0 ],
          'open-mouth' : [ 'suction', 1 ],
          'close-mouth' : [ 'jaw', 1 ],
          egg : [ 'egg', 1 ],
          sperm : [ 'sperm', 1 ]
        };
        await this.control(...settings[action]);
      } else {
        if (action === 'pause' || action === 'end-compare')
          this.resumeWhenReady = false;
        await this.command(action);
      }
      this.draw();
    } catch (error) {
      this.fail(error);
    }
  }
  draw() {
    if (!this.shown)
      return;
    const world = this.current(), state = world?.state, end = state?.step ?? 0,
          cursor = this.time(), fish = state?.fish?.find(p => p.id === this.selected),
          control = state?.controls?.find(c => c.id === this.selected);
    html(this.root, '[data-live-metrics]', metricCards(world));
    const error = this.root.querySelector('.fl-error'),
          message = this.error || this.job?.error || world?.error || '';
    error.hidden = !message;
    error.textContent = String(message).startsWith('labor.') ? t(message) : String(message);
    text(this.root, '[data-live-status]',
         word(state?.preparing || this.job?.status === 'preparing' ? 'preparing'
              : state?.paused                                      ? 'paused'
                                                                   : this.job?.status ?? 'ready'));
    html(this.root, '[data-live-worlds]',
         this.worlds
             .map((w, i) => `<button data-live-world="${i}" aria-pressed="${i === this.world}">${
                      word('worldLabel', {n : i + 1, seed : w.seed})}</button>`)
             .join(''));
    this.root.querySelector('[data-live-empty]').hidden = Boolean(state?.width);
    this.root.querySelector('[data-live-controls]').disabled =
        !fish?.hatched || this.job?.status !== 'running';
    text(this.root, '[data-live-fish-heading]',
         this.selected == null ? word('population') : '#' + this.selected);
    this.root.querySelector('[data-live-selection-hint]').hidden = this.selected != null;
    html(this.root, '[data-live-fish-values]',
         fish ? '<dl>' +
                    [ 'energy', 'gut', 'yolk', 'health' ]
                        .map(k => `<dt>${word(k)}</dt><dd>${number(fish[k], 1)}</dd>`)
                        .join('') +
                    '</dl>'
              : '');
    text(this.root, '[data-live-energy]',
         fish ? word('energyBalance',
                     {added : number(fish.supplied, 1), removed : number(fish.withdrawn, 1)})
              : '');
    for (const input of this.root.querySelectorAll('[data-live-axis]')) {
      if (input === document.activeElement)
        continue;
      const key = input.dataset.liveAxis;
      if (input.tagName === 'SELECT')
        input.value = String(control?.leaves ?? 0);
      else
        input.checked = key === 'energy'   ? control?.energy != null
                        : key === 'vision' ? !control?.visionMuted
                        : key === 'odor'   ? !control?.odorMuted
                                           : Boolean(control?.[{
                                             'auto-turn' : 'autoTurn',
                                             'auto-forward' : 'autoForward',
                                             'auto-mouth' : 'autoMouth'
                                           }[key]]);
    }
    text(this.root, '[data-live-comparison]',
         state?.preparing    ? word('controlPreparing')
         : state?.comparison ? word('controlReady', {step : number(state.comparisonStart)})
                             : word('comparisonNote'));
    text(this.root, '[data-live-interventions]',
         world?.interventions.length ? word('interventions', {n : world.interventions.length})
                                     : '');
    text(this.root, '[data-live-time]', word('atStep', {step : number(cursor)}));
    const slider = this.root.querySelector('[data-live-time-slider]');
    slider.max = Math.max(1, end);
    slider.value = cursor;
    const historyKey =
              [ this.job?.id, this.job?.generation, this.world, this.selected, this.cursor ].join(
                  ':'),
          now = performance.now();
    if (historyKey !== this.historyKey || now - (this.historyDrawn ?? 0) >= 700) {
      html(this.root, '[data-live-tracks]', tracks(this.trace, end, cursor, world?.samples));
      html(this.root, '[data-live-lifelines]',
           lifeLines(world?.lives ?? [], end, this.selected, cursor));
      this.historyKey = historyKey;
      this.historyDrawn = now;
    }
    if (this.breeding) {
      html(this.root, '[data-live-ranking]',
           candidateTable(this.job?.candidates ?? [], this.parents));
      text(this.root, '[data-live-generation]',
           this.job ? word('generationLabel', {n : Math.max(0, this.job.generation) + 1}) : '');
      for (const action of ['next-best', 'next-selected'])
        this.root.querySelector(`[data-live-action=${action}]`).disabled =
            !this.job?.canBreed || this.job.status !== 'running' ||
            (action === 'next-selected' && !this.parents.size);
      html(this.root, '[data-live-generations]',
           (this.job?.generations ?? [])
               .map(g => `<div class="fl-generation">${word('historyGeneration', {
                      n : g.generation + 1,
                      score : number(g.candidates[0]?.score, 1),
                      parents : g.parents.length
                    })}</div>`)
               .join(''));
    }
    this.paint();
  }
  paint() {
    if (!this.shown)
      return;
    const world = this.current(), state = world?.state;
    if (!state?.width)
      return;
    this.camera ??= {x : state.width / 2, y : state.height / 2, zoom : 1};
    const canvas = this.root.querySelector('[data-live-canvas]');
    paintLiveScene(canvas, world, this.camera, this.paths[this.world] ?? new Map(), this.selected,
                   this.time(), this.trail);
    text(this.root, '[data-live-caption]',
         word('sceneAt', {step : number(world.frame?.step), cursor : number(this.time())}));
  }
  bindCanvas() {
    const canvas = this.root.querySelector('[data-live-canvas]');
    let drag;
    canvas.addEventListener('pointerdown', e => {
      if (!this.camera)
        return;
      drag = {x : e.clientX, y : e.clientY, cx : this.camera.x, cy : this.camera.y, moved : false};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag || !this.camera)
        return;
      const box = canvas.getBoundingClientRect(),
            scale = this.current().state.width / this.camera.zoom / box.width;
      drag.moved ||= Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3;
      if (drag.moved) {
        this.camera.x = drag.cx - (e.clientX - drag.x) * scale;
        this.camera.y = drag.cy - (e.clientY - drag.y) * scale;
        this.paint();
      }
    });
    canvas.addEventListener('pointerup', e => {
      if (!drag || !this.camera)
        return;
      if (!drag.moved) {
        const state = this.current().state, projection_ = projection(canvas, state, this.camera),
              point = projection_.point(e),
              reach = Math.max(8, projection_.span / canvas.getBoundingClientRect().width * 12);
        const ranked =
            state.fish
                .map(f => ({
                       id : f.id,
                       d : Math.hypot(horizontalDelta(f.x - point.x, state.width), f.y - point.y),
                       r : f.radius
                     }))
                .sort((a, b) => a.d - b.d);
        this.select(ranked[0] && ranked[0].d <= Math.max(reach, ranked[0].r) ? ranked[0].id : null);
      }
      drag = null;
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('wheel', e => {
      if (!this.camera)
        return;
      e.preventDefault();
      const state = this.current().state, before = projection(canvas, state, this.camera).point(e);
      this.camera.zoom = Math.max(.7, Math.min(12, this.camera.zoom * Math.exp(-e.deltaY * .001)));
      const after = projection(canvas, state, this.camera).point(e);
      this.camera.x += before.x - after.x;
      this.camera.y += before.y - after.y;
      this.paint();
    }, {passive : false});
  }
}
export class BreedingStation extends LiveStation {
  constructor(root) { super(root, true); }
}
export class TrialStation extends LiveStation {
  constructor(root) { super(root, false); }
}
