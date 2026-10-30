import {t} from './strings.js';
import {request} from './session.js';
import {animalsState} from './animals.js';
import {brainState} from './brain.js';
import {cameraState} from './camera.js';
import {canvas, ctx, text, el, chartContext} from './dom.js';
import {evolutionState} from './evolution.js';
import {sessionState} from './session.js';
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
function frameGraph(now, sample) {
  if (sample.advanced || sample.gap > 100)
    frameIntervals.push([ now, Math.max(sample.readyDelta, sample.gap) ]);
  while (frameIntervals.length &&
         (frameIntervals[0][0] < now - 5000 || frameIntervals.length > 600))
    frameIntervals.shift();
  if (now - graphAt < 100)
    return;
  graphAt = now;
  const g = chartContext(el('tank-frame-times'));
  g.clearRect(0, 0, 150, 28);
  g.strokeStyle = '#a6bbb8';
  g.setLineDash([ 2, 3 ]);
  g.beginPath();
  g.moveTo(0, 25 - 16.7 / 8);
  g.lineTo(150, 25 - 16.7 / 8);
  g.stroke();
  g.setLineDash([]);
  for (const [at, ms] of frameIntervals) {
    g.fillStyle = ms > 100 ? '#ee8878' : ms > 33 ? '#e9c185' : '#8bcab6';
    g.fillRect(150 * (at - now + 5000) / 5000, 25 - Math.min(25, ms / 8), 1, Math.min(25, ms / 8));
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
  while (fpsDisplay.frames.length && fpsDisplay.frames[0] <= now - 5000)
    fpsDisplay.frames.shift();
  frameGraph(now, sample);
  const gap = sample.gap;
  const peaks = fpsDisplay.peaks;
  while (peaks.length && (peaks[0].at <= now - 5000))
    peaks.shift();
  while (peaks.length && peaks.at(-1).ms <= gap)
    peaks.pop();
  peaks.push({at : now, ms : gap});
  const elapsed = Math.min(5000, now - fpsDisplay.start);
  if (elapsed > 0)
    fpsDisplay.rate = Math.round(fpsDisplay.frames.length * 1000 / elapsed);
  text('tank-fps', t('report.fps', {rate : fpsDisplay.rate, ms : Math.round(peaks[0].ms)}));
}

// Local per-frame evidence is always bounded. Disk summaries remain optional.
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
      if (w.readyGaps.length < 4096)
        w.readyGaps.push(this.readyDelta);
    }
    w.elapsed += dt;
    w.work += work;
    w.maxFrame = Math.max(w.maxFrame, dt);
    w.maxWork = Math.max(w.maxWork, work);
    w.over50 += Number(this.readyDelta > 50);
    w.over100 += Number(this.readyDelta > 100);
    w.minZoom = Math.min(w.minZoom, cameraState.zoom);
    w.maxZoom = Math.max(w.maxZoom, cameraState.zoom);
    // Only percentile samples need storage; totals and maxima include every frame.
    if (w.intervals.length < 4096) {
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
    if (w.elapsed >= 1000)
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
    const round = v => Math.round(v * 1000) / 1000,
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
        inspection : brainState.brainOpacity > .005,
        hidden : !!document.hidden,
        lost : !!ctx.lost,
        neuron_detail : brainState.brainDrawing?.cellDetail || 0,
        inspection_mode : brainState.brainView
      },
      objects : Object.fromEntries([
        'fish', 'food', 'corpses', 'gametes', 'plants', 'surfaces', 'invertebrates'
      ].map(key => [key === 'gametes' ? 'sperm_grid_cells' : key, f[key]?.length || 0])),
      frames : {
        fps : round(1000 * w.observed / w.elapsed),
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
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 3000);
    request('/fps-report', {
      method : 'POST',
      headers : {'Content-Type' : 'application/json', 'X-Fish-Token' : window.FISH_TOKEN},
      body : JSON.stringify(data),
      keepalive : true,
      signal : controller.signal
    })
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
    objects : Object.fromEntries([
      'fish', 'food', 'corpses', 'gametes', 'plants', 'surfaces', 'invertebrates'
    ].map(key => [key === 'gametes' ? 'sperm_grid_cells' : key, f[key]?.length || 0])),
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
