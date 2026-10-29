// Bounded local flight recorder. No scene arrays, disk writes or uploads on the frame path.
class DiagnosticRing {
  constructor(limit) {
    this.rows = new Array(limit);
    this.count = 0;
  }
  push(row) { this.rows[this.count++ % this.rows.length] = row; }
  values() {
    const size = Math.min(this.count, this.rows.length), start = this.count - size;
    return Array.from({length : size}, (_, i) => this.rows[(start + i) % this.rows.length]);
  }
}
const diagnosticRound = v => Math.round(v * 100) / 100;
function diagnosticPath(value) {
  // Queries can contain selection parameters or credentials. Never export them.
  try {
    return new URL(value, globalThis.location?.href).pathname;
  } catch {
    return '';
  }
}
export class BrowserDiagnostics {
  constructor() {
    this.frames = new DiagnosticRing(3600);
    this.events = new DiagnosticRing(1024);
    this.spikes = [];
    this.last = null;
    this.lastScene = null;
    this.observers = [];
    this.supported = [];
    this.maxGap = 0;
    this.spikeCount = 0;
    this.sequence = 0;
  }
  event(kind, details = {}, at = performance.now()) {
    const row = {kind, at : diagnosticRound(at), ...details};
    this.events.push(row);
    const end = row.at + (row.duration_ms || 0);
    for (const spike of this.spikes)
      if (row.at <= spike.until && end >= spike.from && spike.events.length < 96)
        spike.events.push(row);
    return row;
  }
  frame(row) {
    const gap = row.active && this.last?.active ? row.at - this.last.at : 0;
    row.callback_gap_ms = diagnosticRound(gap);
    row.id = ++this.sequence;
    this.last = row;
    this.frames.push(row);
    for (const spike of this.spikes)
      if (row.at <= spike.until && spike.frames.length < 120)
        spike.frames.push(row);
    if (!row.active || row.paused)
      return;
    const severity = Math.max(gap, row.work_ms, row.motion_gap_ms);
    this.maxGap = Math.max(this.maxGap, severity);
    if (severity < 100)
      return;
    this.spikeCount++;
    // Keep separate episodes, including the frames before a block. Retain the worst 16
    // for the whole tab lifetime, even when the rolling frame buffer wraps.
    const overlapping = this.spikes.find(s => row.at <= s.until && row.at >= s.from);
    if (overlapping) {
      if (severity > overlapping.severity_ms) {
        overlapping.severity_ms = diagnosticRound(severity);
        overlapping.trigger = row;
      }
      return;
    }
    if (this.spikes.length === 16) {
      let least = 0;
      for (let i = 1; i < this.spikes.length; i++)
        if (this.spikes[i].severity_ms < this.spikes[least].severity_ms)
          least = i;
      if (severity <= this.spikes[least].severity_ms)
        return;
      this.spikes.splice(least, 1);
    }
    const from = row.at - Math.max(gap, row.motion_gap_ms) - 400,
          until = row.at + row.work_ms + 600;
    this.spikes.push({
      from,
      until,
      severity_ms : diagnosticRound(severity),
      trigger : row,
      frames : this.frames.values().filter(f => f.at >= from).slice(-80),
      events : this.events.values().filter(e => e.at + (e.duration_ms || 0) >= from).slice(-64)
    });
  }
  install() {
    if (this.installed)
      return;
    this.installed = true;
    this.started = new Date().toISOString();
    if (typeof PerformanceObserver !== 'undefined') {
      this.supported = PerformanceObserver.supportedEntryTypes || [];
      for (const type of ['longtask', 'long-animation-frame', 'resource']) {
        if (!this.supported.includes(type))
          continue;
        try {
          const observer = new PerformanceObserver(list => this.entries(type, list.getEntries()));
          observer.observe({type, buffered : true});
          this.observers.push({type, observer});
        } catch { /* Explicitly listed as unavailable in the report. */
        }
      }
    }
    window.addEventListener('error', e => {
      displayFaults.report('Oberfläche', e.error || e.message);
      this.event('error', {
        message : String(e.message || '').slice(0, 500),
        source : diagnosticPath(e.filename),
        line : e.lineno,
        column : e.colno
      });
    });
    window.addEventListener('unhandledrejection',
                            e => displayFaults.report('Oberfläche', e.reason));
  }
  entries(type, entries) {
    for (const e of entries) {
      if (type === 'resource') {
        const path = diagnosticPath(e.name);
        if (!['/scene', '/state', '/history', '/journal', '/founders', '/command'].includes(path))
          continue;
        this.event('resource', {
          path,
          duration_ms : diagnosticRound(e.duration),
          first_byte_ms : diagnosticRound(e.responseStart - e.startTime),
          body_ms : diagnosticRound(e.responseEnd - e.responseStart),
          bytes : e.transferSize
        },
                   e.startTime);
      } else if (type === 'longtask') {
        this.event(type, {duration_ms : diagnosticRound(e.duration), name : e.name}, e.startTime);
      } else {
        this.event(type, {
          duration_ms : diagnosticRound(e.duration),
          blocking_ms : e.blockingDuration,
          render_start : e.renderStart,
          layout_start : e.styleAndLayoutStart,
          scripts :
              Array.from(e.scripts || []).slice(0, 32).map(s => ({
                                                             at : s.startTime,
                                                             duration_ms : s.duration,
                                                             source : diagnosticPath(s.sourceURL),
                                                             function : s.sourceFunctionName,
                                                             offset : s.sourceCharPosition,
                                                             invoker : s.invoker,
                                                             invoker_type : s.invokerType,
                                                             forced_layout_ms :
                                                                 s.forcedStyleAndLayoutDuration,
                                                             pause_ms : s.pauseDuration
                                                           }))
        },
                   e.startTime);
      }
    }
  }
  snapshot(context = {}) {
    for (const {type, observer} of this.observers)
      this.entries(type, observer.takeRecords());
    return {
      format : 'fish-browser-diagnostics-1',
      started_at : this.started,
      exported_at : new Date().toISOString(),
      time_origin : performance.timeOrigin,
      build : globalThis.window?.FISH_BUILD || null,
      browser : {
        agent : globalThis.navigator?.userAgent,
        cores : globalThis.navigator?.hardwareConcurrency
      },
      capabilities : {available : this.supported, observing : this.observers.map(o => o.type)},
      units : 'Milliseconds relative to performance.timeOrigin, unless marked otherwise.',
      limits : {frames : 3600, events : 1024, worst_episodes : 16},
      interpretation : {
        callback_gap_ms :
            'Time between actual animation callback starts; includes work outside drawing.',
        work_ms :
            'Synchronous application work in this animation callback; phases_ms partitions it.',
        record_ms : 'Additional local recorder work after the measured drawing callback.',
        motion_gap_ms :
            'Observed gap between completed images with a changed simulation timestamp.',
        gpu_pending_age_ms :
            'Time since submission of the oldest unfinished/unchecked fence. Includes browser scheduling delay; NOT GPU execution time.',
        last_scene_age_ms :
            'Time since the last applied scene packet; packets may contain unchanged steps.',
        worker_roundtrip_ms : 'Worker execution plus queues and message copies, not pure CPU time.',
        unavailable :
            'No physical monitor presentation timestamps or browser CPU profiler. A correlation alone does not establish the cause.'
      },
      totals : {
        frames : this.sequence,
        samples_over_100ms : this.spikeCount,
        max_gap_ms : diagnosticRound(this.maxGap)
      },
      server : this.server,
      context,
      frames : this.frames.values(),
      events : this.events.values(),
      worst_episodes : this.spikes.slice().sort((a, b) => b.severity_ms - a.severity_ms)
    };
  }
  async download(context) {
    if (this.exporting)
      return;
    this.exporting = true;
    let worker, timeout;
    try {
      const report = this.snapshot(context);
      // Serialization and Blob creation stay off the drawing thread. The bounded
      // message copy happens only on this explicit download, never every frame.
      const blob = await new Promise((resolve, reject) => {
        worker = new Worker('/ui/diagnostics_worker.js', {type : 'module'});
        timeout = setTimeout(() => reject(Error('Diagnose-Export dauert zu lange')), 15000);
        worker.onmessage = ({data}) => data.error ? reject(Error(data.error)) : resolve(data.blob);
        worker.onerror = () => reject(Error('Diagnose-Export fehlgeschlagen'));
        worker.postMessage(report);
      });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url;
      a.download = 'fish-diagnose-v' + window.FISH_BUILD.version + '-' +
                   new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally {
      clearTimeout(timeout);
      worker?.terminate();
      this.exporting = false;
    }
  }
}
export const diagnostics = new BrowserDiagnostics();

// Keep failures local to the affected view. Three failed attempts stop only that
// stage; successful stages and the animation callback continue running.
export class DisplayFaults {
  constructor(recorder) {
    this.recorder = recorder;
    this.issues = new Map();
    this.simulation = 'Simulationsstatus unbekannt';
    this.confirmedAt = 0;
  }
  report(scope, error, guarded = false) {
    const old = this.issues.get(scope), message = String(error?.message || error).slice(0, 500),
          count = (old?.count || 0) + 1;
    const issue = {scope, error, message, count, guarded, retryAt : Date.now() + 250 * count};
    this.issues.set(scope, issue);
    // Retain the first failures and occasional repetitions, without flooding the recorder.
    if (count <= 3 || (count & (count - 1)) === 0)
      this.recorder.event(
          'display-error',
          {scope, message, count, stack : String(error?.stack || '').slice(0, 4000)});
    this.paint();
    return issue;
  }
  clear(scope) {
    if (this.issues.delete(scope)) {
      this.recorder.event('display-recovered', {scope});
      this.paint();
    }
  }
  run(scope, action) {
    const fault = this.issues.get(scope);
    if (fault && (fault.count >= 3 || Date.now() < fault.retryAt))
      return false;
    try {
      if (action() === false)
        return false;
      this.clear(scope);
      return true;
    } catch (error) {
      this.report(scope, error, true);
      return false;
    }
  }
  confirm(label) {
    this.simulation = label;
    this.confirmedAt = Date.now();
    if (this.issues.size)
      this.paint();
  }
  paint() {
    const get = id => globalThis.document?.getElementById?.(id), panel = get('error-panel');
    if (!panel)
      return;
    panel.hidden = !this.issues.size;
    const rows = [...this.issues.values() ];
    const values = {
      error : rows.map(v => v.scope + (v.guarded && v.count >= 3 ? ' angehalten' : '') + ': ' +
                            v.message + (v.count > 1 ? ' (' + v.count + '×)' : ''))
                  .join('\n'),
      'error-status' : Date.now() - this.confirmedAt < 5000 ? this.simulation
                                                            : 'Simulationsstatus unbekannt',
      'error-details' : rows.map(v => String(v.error?.stack || v.message)).join('\n\n')
    };
    for (const [id, value] of Object.entries(values)) {
      const node = get(id);
      if (node && node.textContent !== value)
        node.textContent = value;
    }
  }
}
export const displayFaults = new DisplayFaults(diagnostics);
