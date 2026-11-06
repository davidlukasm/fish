import {PALETTE} from './palette.js';
import {ROUTE} from './schema.js';
import {SECOND_MS} from './units.js';
import {t} from './strings.js';
import {animalsState} from './animals.js';
import {brainState, brainVisible} from './brain.js';
import {cameraState} from './camera.js';
import {canvas, chartContext, chartSize, ctx, el, text} from './dom.js';
import {evolutionState} from './evolution.js';
import {postJson, sessionState} from './session.js';
import {sceneState} from './state.js';
import {draw} from './tank.js';
import {diagnostics} from './diagnostics.js';
export const reportState = {};
export let fpsDisplay;

const cadence = {
  at : null,
  last : null,
  readyAt : null,
  clock : 0,
  content : null
};
function observeFrame(now) {
  if (cadence.at === now)
    return cadence.sample;
  ctx.pollFrames();
  const active = !!sceneState.frame && !sceneState.frame.turbo && !document.hidden && !ctx.lost;
  const moving = active && !sceneState.frame.paused;
  if (!active || ctx.completedFrames < cadence.clock)
    cadence.last = cadence.readyAt = null;
  if (!moving)
    cadence.readyAt = null;
  const completed = moving ? Math.max(0, ctx.completedFrames - cadence.clock) : 0,
        advanced = completed > 0 && (ctx.completedContentStamp == null ||
                                     ctx.completedContentStamp !== cadence.content),
        delta = cadence.last === null ? 0 : now - cadence.last,
        gap = cadence.readyAt === null ? 0 : now - cadence.readyAt;
  cadence.clock = ctx.completedFrames;
  cadence.content = ctx.completedContentStamp;
  cadence.last = active ? now : null;
  if (moving && (advanced || cadence.readyAt === null))
    cadence.readyAt = now;
  cadence.at = now;
  return cadence.sample = {
    active,
    completed,
    advanced,
    delta,
    readyDelta : advanced ? gap : 0,
    gap : moving ? Math.max(delta, gap) : 0
  };
}

function resetFpsDisplay(label = t('report.fpsMsMax')) {
  fpsDisplay.start = null;
  fpsDisplay.frames = [];
  fpsDisplay.clock = ctx.completedFrames;
  fpsDisplay.last = fpsDisplay.readyAt = null;
  fpsDisplay.content = null;
  fpsDisplay.peaks = [];
  fpsDisplay.rate = '–';
  frameIntervals.length = 0;
  text('tank-fps', label);
}
const frameIntervals = [];
let graphAt = -Infinity;
const FRAME_GRAPH = Object.freeze({
  window_ms : 5000,
  samples : 600,
  refresh_ms : 100,
  base : 25,
  frame_ms : 1000 / 60,
  ms_per_pixel : 8,
  late_ms : 33,
  slow_ms : 100,
  dash : [ 2, 3 ],
  line : '#a6bbb8',
  fine : '#8bcab6',
  late : PALETTE.gold,
  slow : '#ee8878'
});
function frameGraph(now, sample) {
  const G = FRAME_GRAPH;
  if (sample.advanced || sample.gap > G.slow_ms)
    frameIntervals.push([ now, Math.max(sample.readyDelta, sample.gap) ]);
  while (frameIntervals.length &&
         (frameIntervals[0][0] < now - G.window_ms || frameIntervals.length > G.samples))
    frameIntervals.shift();
  if (now - graphAt < G.refresh_ms)
    return;
  graphAt = now;
  const canvas = el('tank-frame-times'), g = chartContext(canvas),
        {width, height} = chartSize(canvas), frame = G.base - G.frame_ms / G.ms_per_pixel;
  g.clearRect(0, 0, width, height);
  g.strokeStyle = G.line;
  g.setLineDash(G.dash);
  g.beginPath();
  g.moveTo(0, frame);
  g.lineTo(width, frame);
  g.stroke();
  g.setLineDash([]);
  for (const [at, ms] of frameIntervals) {
    const bar = Math.min(G.base, ms / G.ms_per_pixel);
    g.fillStyle = ms > G.slow_ms ? G.slow : ms > G.late_ms ? G.late : G.fine;
    g.fillRect(width * (at - now + G.window_ms) / G.window_ms, G.base - bar, 1, bar);
  }
}
export function updateFps(now) {
  const sample = observeFrame(now);
  if (!sample.active || sceneState.frame.paused) {
    resetFpsDisplay(sceneState.frame?.paused ? t('report.pause') : undefined);
    return;
  }
  if (fpsDisplay.start === null) {
    fpsDisplay.start = now;
    fpsDisplay.frames = [];
    fpsDisplay.peaks = [];
  }
  if (sample.advanced && now > fpsDisplay.start)
    fpsDisplay.frames.push(now);
  while (fpsDisplay.frames.length && fpsDisplay.frames[0] <= now - FRAME_GRAPH.window_ms)
    fpsDisplay.frames.shift();
  frameGraph(now, sample);
  const gap = sample.gap;
  const peaks = fpsDisplay.peaks;
  while (peaks.length && (peaks[0].at <= now - FRAME_GRAPH.window_ms))
    peaks.shift();
  while (peaks.length && peaks.at(-1).ms <= gap)
    peaks.pop();
  peaks.push({at : now, ms : gap});
  const elapsed = Math.min(FRAME_GRAPH.window_ms, now - fpsDisplay.start);
  if (elapsed > 0)
    fpsDisplay.rate = Math.round(fpsDisplay.frames.length * SECOND_MS / elapsed);
  text('tank-fps', t('report.fps', {rate : fpsDisplay.rate, ms : Math.round(peaks[0].ms)}));
}

const REPORT = Object.freeze({
  samples : 4096,
  flush_ms : 1000,
  digits : 3,
  late_ms : 50,
  slow_ms : 100,
  upload_timeout_ms : 3000
});
const COUNTED =
    Object.freeze([ 'fish', 'food', 'corpses', 'gametes', 'plants', 'surfaces', 'invertebrates' ]);
const objectCounts = f => Object.fromEntries(
    COUNTED.map(key => [key === 'gametes' ? 'sperm_grid_cells' : key, f[key]?.length || 0]));
export class FpsReport {
  constructor(upload = true) {
    this.upload = upload;
    this.clientId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    this.first = true;
    this.last = null;
    this.active = false;
    this.pending = false;
    this.reset();
  }
  reset() {
    this.window = {
      count : 0,
      rendered : 0,
      completed : 0,
      observed : 0,
      readyCount : 0,
      readyElapsed : 0,
      maxReady : 0,
      readyGaps : [],
      elapsed : 0,
      work : 0,
      maxFrame : 0,
      maxWork : 0,
      over50 : 0,
      over100 : 0,
      intervals : [],
      works : [],
      phases : {},
      phaseMax : {},
      draws : 0,
      vertices : 0,
      minZoom : Infinity,
      maxZoom : 0,
      transport : {
        responses : 0,
        bytes : 0,
        unchanged : 0,
        wait_ms : 0,
        max_wait_ms : 0,
        apply_ms : 0,
        max_apply_ms : 0
      }
    };
  }
  begin(now) {
    const start = performance.now();
    const sample = observeFrame(now);
    this.completed = sample.completed;
    this.advanced = sample.advanced;
    this.active = sample.active;
    if (!this.active) {
      diagnostics.last = null;
      this.flush('suspended');
      return;
    }
    this.readyDelta = sample.readyDelta;
    this.motionGap = sample.gap;
    this.rafAt = now;
    this.delta = sample.delta;
    this.start = start;
    this.phaseAt = performance.now();
    this.clock = ctx.clock;
    this.phases = {gpu_poll : this.phaseAt - start};
  }
  mark(name) {
    if (!this.active)
      return;
    const now = performance.now();
    this.phases[name] = (this.phases[name] || 0) + now - this.phaseAt;
    this.phaseAt = now;
  }
  end() {
    if (!this.active)
      return;
    this.active = false;
    const ended = performance.now(), f = sceneState.frame;
    const row = {
      at : this.start,
      raf_at : this.rafAt,
      raf_delay_ms : Math.max(0, this.start - this.rafAt),
      active : !document.hidden && !f.turbo && !ctx.lost,
      paused : !!f.paused,
      work_ms : ended - this.start,
      motion_gap_ms : this.motionGap,
      phases_ms : this.phases,
      submitted : this.clock !== ctx.clock,
      completed : this.completed,
      changed : this.advanced,
      gpu_pending : ctx.pendingFrames?.length || 0,
      gpu_pending_age_ms : ctx.pendingSubmitted?.length ? ended - ctx.pendingSubmitted[0] : 0,
      step : f.step,
      latest_step : sceneState.playback?.points?.at(-1)?.frame.step ?? f.step,
      buffered_scenes : sceneState.playback?.points?.length || 0,
      last_scene_age_ms : diagnostics.lastScene === null ? null : ended - diagnostics.lastScene,
      zoom : cameraState.zoom,
      view : evolutionState.activeView,
      selected : f.selected,
      session : sessionState.sessionId,
      draws : this.clock !== ctx.clock ? ctx.stats.draws : 0,
      vertices : this.clock !== ctx.clock ? ctx.stats.vertices : 0,
      cached_texture_bytes : ctx.textureBytes
    };
    diagnostics.frame(row);
    row.record_ms = performance.now() - ended;
    if (!this.upload)
      return;
    if (this.delta <= 0) {
      this.initialWork = performance.now() - this.start;
      return;
    }
    this.lastFrame = sceneState.frame;
    this.session = sessionState.sessionId;
    const w = this.window, work = performance.now() - this.start, dt = this.delta,
          rendered = this.clock !== ctx.clock;
    w.count++;
    w.rendered += Number(rendered);
    w.completed += this.completed;
    w.observed += Number(this.advanced);
    if (this.readyDelta > 0) {
      w.readyCount++;
      w.readyElapsed += this.readyDelta;
      w.maxReady = Math.max(w.maxReady, this.readyDelta);
      if (w.readyGaps.length < REPORT.samples)
        w.readyGaps.push(this.readyDelta);
    }
    w.elapsed += dt;
    w.work += work;
    w.maxFrame = Math.max(w.maxFrame, dt);
    w.maxWork = Math.max(w.maxWork, work);
    w.over50 += Number(this.readyDelta > REPORT.late_ms);
    w.over100 += Number(this.readyDelta > REPORT.slow_ms);
    w.minZoom = Math.min(w.minZoom, cameraState.zoom);
    w.maxZoom = Math.max(w.maxZoom, cameraState.zoom);
    if (w.intervals.length < REPORT.samples) {
      w.intervals.push(dt);
      w.works.push(work);
    }
    for (const [name, value] of Object.entries(this.phases)) {
      w.phases[name] = (w.phases[name] || 0) + value;
      w.phaseMax[name] = Math.max(w.phaseMax[name] || 0, value);
    }
    if (rendered) {
      w.draws += ctx.stats.draws;
      w.vertices += ctx.stats.vertices;
    }
    if (w.elapsed >= REPORT.flush_ms)
      this.flush('interval');
  }
  response(start, ready, bytes, unchanged, channel = 'unknown', stages = {}) {
    const t = this.window.transport, wait = ready - start, apply = performance.now() - ready;
    if (channel === 'scene')
      diagnostics.lastScene = ready + apply;
    diagnostics.event('packet', {
      channel,
      duration_ms : wait + apply,
      wait_ms : wait,
      apply_ms : apply,
      bytes,
      unchanged,
      ...stages
    },
                      start);
    if (!this.upload)
      return;
    t.responses++;
    t.bytes += bytes;
    t.unchanged += Number(unchanged);
    t.wait_ms += wait;
    t.max_wait_ms = Math.max(t.max_wait_ms, wait);
    t.apply_ms += apply;
    t.max_apply_ms = Math.max(t.max_apply_ms, apply);
  }
  flush(reason, closing = false) {
    if (!this.upload)
      return;
    const w = this.window, f = this.lastFrame;
    if (!w.count || this.pending && !closing)
      return;
    const unit = 10 ** REPORT.digits, round = v => Math.round(v * unit) / unit,
          summary = (values, total, max, count = w.count) => {
            if (!count)
              return null;
            const sorted = values.slice().sort((a, b) => a - b),
                  at = q => round(sorted[Math.floor((sorted.length - 1) * q)]);
            return {
              mean : round(total / count),
              p50 : at(.5),
              p95 : at(.95),
              p99 : at(.99),
              max : round(max)
            };
          };
    const data = {
      client_id : this.clientId,
      reason,
      session : this.session,
      epoch : f.render_epoch,
      step : f.step,
      view : evolutionState.activeView,
      zoom : {current : cameraState.zoom, min : w.minZoom, max : w.maxZoom},
      viewport : {
        css : [ cameraState.viewportWidth, cameraState.viewportHeight ],
        pixels : [ canvas.width, canvas.height ],
        ratio : cameraState.pixelRatio
      },
      state : {
        paused : !!f.paused,
        historical : !!f.historical,
        inspection : brainVisible(),
        hidden : !!document.hidden,
        lost : !!ctx.lost,
        neuron_detail : brainState.brainDrawing?.cellDetail || 0,
        inspection_mode : brainState.brainView
      },
      objects : objectCounts(f),
      frames : {
        fps : round(SECOND_MS * w.observed / w.elapsed),
        callbacks : w.count,
        submitted : w.rendered,
        completed : w.completed,
        observed : w.observed,
        elapsed_ms : round(w.elapsed),
        over_50ms : w.over50,
        over_100ms : w.over100,
        percentile_samples : w.readyGaps.length
      },
      frame_ms : summary(w.readyGaps, w.readyElapsed, w.maxReady, w.readyCount),
      callback_ms : summary(w.intervals, w.elapsed, w.maxFrame),
      work_ms : summary(w.works, w.work, w.maxWork),
      phases_ms : Object.fromEntries(
          Object.entries(w.phases).map(([ key, v ]) => [key, round(v / w.count)])),
      phase_max_ms :
          Object.fromEntries(Object.entries(w.phaseMax).map(([ key, v ]) => [key, round(v)])),
      draws : round(w.draws / w.count),
      vertices : round(w.vertices / w.count),
      transport : Object.fromEntries(
          Object.entries(w.transport).map(([ key, value ]) => [key, round(value)])),
      resources : {
        cached_textures : ctx.textures.size,
        cached_texture_bytes : ctx.textureBytes,
        animal_atlas_texels : animalsState.gpuAnimals?.cursor || 0,
        animal_instances : animalsState.gpuAnimals?.count || 0
      },
      error : draw.error?.message || null
    };
    if (this.first) {
      data.client = {agent : navigator.userAgent, device : ctx.device};
      data.work_ms.initial = this.initialWork ?? null;
    }
    this.reset();
    this.first = false;
    this.pending = true;
    const controller = new AbortController(),
          timeout = setTimeout(() => controller.abort(), REPORT.upload_timeout_ms);
    postJson(ROUTE.fps_report, data, {keepalive : true, signal : controller.signal})
        .then(async response => {
          await response.text();
          if (!response.ok)
            throw Error('HTTP ' + response.status);
        })
        .catch(error => {
          this.first = true;
          console.warn('FPS-Bericht: ' + error.message);
        })
        .finally(() => {
          clearTimeout(timeout);
          this.pending = false;
        });
  }
  suspend(reason) {
    diagnostics.event('suspend', {reason});
    diagnostics.last = null;
    cadence.at = cadence.last = cadence.readyAt = null;
    cadence.clock = ctx.completedFrames;
    cadence.content = ctx.completedContentStamp;
    this.flush(reason, true);
    this.last = null;
    this.active = false;
  }
}

export let fpsReport;

function diagnosticContext() {
  const f = sceneState.frame || {};
  return {
    session : sessionState.sessionId,
    epoch : f.render_epoch,
    step : f.step,
    device : ctx.device,
    gpu_lost : !!ctx.lost,
    hidden : !!document.hidden,
    paused : !!f.paused,
    turbo : !!f.turbo,
    view : evolutionState.activeView,
    zoom : cameraState.zoom,
    selected : f.selected,
    parameters : f.parameters,
    viewport : [ canvas.width, canvas.height, cameraState.pixelRatio ],
    simulation_tick_ms : f.tick_ms,
    simulation_phases_ms : f.step_phases,
    objects : objectCounts(f),
    textures : ctx.textures.size,
    texture_bytes : ctx.textureBytes,
    animal_atlas_texels : animalsState.gpuAnimals?.cursor || 0,
    error : draw.error?.message || null
  };
}

const initializers = {
  "fpsDisplay" : () => {
    fpsDisplay = {};
    resetFpsDisplay();
  },
  "fpsReport" : () => {
    diagnostics.install();
    el('error-diagnose').disabled = false;
    fpsReport = new FpsReport(!!window.FISH_FPS_REPORT);
    el('tank-diagnose').onclick = async () => {
      const button = el('tank-diagnose');
      button.disabled = true;
      button.textContent = t('report.speichert');
      try {
        await diagnostics.download(diagnosticContext());
      } catch (error) {
        text('error', error.message);
      } finally {
        button.disabled = false;
        button.textContent = t('report.diagnose');
      }
    };
  },
  "addEventListener_visibilitychange" : () => {
    document.addEventListener('visibilitychange', () => {
      resetFpsDisplay();
      if (document.hidden)
        fpsReport?.suspend('hidden');
    });
    if (fpsReport)
      window.addEventListener('pagehide', () => fpsReport.suspend('pagehide'));
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
