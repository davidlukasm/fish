const {readUI} = require('./ui_source.js');
// Synthetic browser clocks exercise reporting, without a rendering benchmark.
const fs = require('fs'), vm = require('vm'), assert = require('assert'),
      source = readUI('ui/report.js');
function browser(enabled) {
  const bars = [], graph = {
    clearRect() { bars.length = 0; },
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillRect(x, y, width, height) { bars.push({color : this.fillStyle, x, y, width, height}); }
  };
  const sent = [], events = {}, scene = {
    bars,
    el : () => ({}),
    chartContext : () => graph,
    text : (id, value) => { scene.label = value; },
    brainDrawing : null,
    brainView : 'network',
    console,
    AbortController,
    Date,
    Math,
    now : 0,
    sceneState : {},
    reads : 0,
    consumedReports : 0,
    frame : {step : 10, render_epoch : 'epoch', fish : Array(8), food : Array(100), tick_ms : 4},
    sessionId : 'run',
    activeView : 'fish',
    zoom : 2,
    viewportWidth : 800,
    viewportHeight : 600,
    pixelRatio : 2,
    brainOpacity : 0,
    gpuAnimals : {cursor : 1024, count : 8},
    draw : {error : null},
    canvas : {width : 1600, height : 1200},
    ctx : {
      clock : 0,
      completedFrames : 0,
      pollFrames() {},
      stats : {draws : 3, vertices : 120},
      textures : new Set([ 1, 2 ]),
      textureBytes : 8192,
      device : 'Test GPU'
    },
    navigator : {userAgent : 'Test browser'},
    document : {hidden : false, addEventListener : (key, fn) => events[key] = fn},
    window : {
      FISH_FPS_REPORT : enabled,
      FISH_TOKEN : 'token',
      addEventListener : (key, fn) => events[key] = fn
    },
    setTimeout : () => 1,
    clearTimeout() {},
    fetch : async (url, options) => {
      sent.push({url, options, data : JSON.parse(options.body)});
      return {
        ok : true,
        text : async () => {
          scene.consumedReports++;
          return '';
        }
      };
    }
  };
  scene.performance = {
    now : () => {
      scene.reads++;
      return scene.now;
    }
  };
  vm.createContext(scene);
  vm.runInContext(source, scene);
  const tick = (at, rendered = true, completed = rendered) => {
    scene.at = at;
    scene.rendered = rendered;
    scene.completed = completed;
    vm.runInContext(
        `if(completed)ctx.completedFrames++;fpsReport.begin(at);now+=2;fpsReport.mark('fish');now+=3;if(rendered)ctx.clock++;fpsReport.mark('finish');fpsReport.end();`,
        scene);
  };
  return {scene, sent, events, tick};
}
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const disabled = browser(false);
  for (let t = 0; t <= 1000; t += 20) {
    disabled.scene.ctx.clock++;
    disabled.scene.ctx.completedFrames++;
    vm.runInContext('updateFps(' + t + ')', disabled.scene);
  }
  assert.equal(disabled.scene.label, '50 FPS Ø · 20 ms max.');
  for (let t = 1020; t <= 2000; t += 20)
    vm.runInContext('updateFps(' + t + ')', disabled.scene);
  assert.equal(disabled.scene.label.split(' · ')[0], '25 FPS Ø',
               'Animation callbacks are not rendered frames');
  for (let t = 2020; t <= 3000; t += 20) {
    if (t % 100 === 0) {
      disabled.scene.ctx.clock++;
      disabled.scene.ctx.completedFrames++;
    }
    vm.runInContext('updateFps(' + t + ')', disabled.scene);
  }
  assert.equal(disabled.scene.label.split(' · ')[0], '20 FPS Ø',
               'GPU backpressure must be visible in the counter');
  disabled.scene.ctx.clock++;
  disabled.scene.ctx.completedFrames++;
  vm.runInContext('updateFps(5000)', disabled.scene);
  assert.equal(disabled.scene.label.split(' · ')[0], '12 FPS Ø',
               'A visible two-second stall must not reset the window');
  disabled.scene.document.hidden = true;
  vm.runInContext('updateFps(20000)', disabled.scene);
  assert.equal(disabled.scene.label, '– FPS · – ms max.');
  assert.equal(vm.runInContext('fpsReport.upload', disabled.scene), false);
  assert.equal(disabled.scene.reads, 0);
  assert.equal(disabled.sent.length, 0);
  assert.deepEqual(Object.keys(disabled.events),
                   [ 'error', 'unhandledrejection', 'visibilitychange', 'pagehide' ]);
  const spikes = browser(false);
  const hidden = browser(false);
  for (let t = 0; t <= 1000; t += 20) {
    hidden.scene.ctx.completedFrames++;
    vm.runInContext('updateFps(' + t + ')', hidden.scene);
  }
  hidden.scene.document.hidden = true;
  hidden.events.visibilitychange();
  // A background tab need not receive any animation callbacks before it returns.
  hidden.scene.document.hidden = false;
  hidden.events.visibilitychange();
  hidden.scene.ctx.completedFrames++;
  vm.runInContext('updateFps(20000)', hidden.scene);
  hidden.scene.ctx.completedFrames++;
  vm.runInContext('updateFps(20020)', hidden.scene);
  assert(hidden.scene.label.endsWith('20 ms max.'),
         'Tab absence without callbacks must not become a visible frame stall');
  for (let t = 0; t <= 1000; t += 20) {
    spikes.scene.ctx.clock++;
    spikes.scene.ctx.completedFrames++;
    vm.runInContext('updateFps(' + t + ')', spikes.scene);
  }
  spikes.scene.ctx.completedFrames++;
  vm.runInContext('updateFps(1200)', spikes.scene);
  assert.equal(spikes.scene.label, '43 FPS Ø · 200 ms max.',
               'A single 200 ms frame must immediately affect both FPS and the maximum');
  assert(spikes.scene.bars.some(b => b.color === '#ee8878' && b.height === 25),
         'A 200 ms frame must be visible in the frame-time graph');
  for (let t = 1220; t <= 6180; t += 20) {
    spikes.scene.ctx.completedFrames++;
    vm.runInContext('updateFps(' + t + ')', spikes.scene);
  }
  assert(spikes.scene.label.endsWith('200 ms max.'), 'A spike disappears before five seconds');
  spikes.scene.ctx.completedFrames++;
  vm.runInContext('updateFps(6200)', spikes.scene);
  assert(spikes.scene.label.endsWith('20 ms max.'), 'An expired spike never clears');
  const halfSecond = browser(false);
  for (let t = 0; t <= 5000; t += 20) {
    halfSecond.scene.ctx.completedFrames++;
    vm.runInContext('updateFps(' + t + ')', halfSecond.scene);
  }
  halfSecond.scene.ctx.completedFrames++;
  vm.runInContext('updateFps(5500)', halfSecond.scene);
  assert.equal(halfSecond.scene.label, '45 FPS Ø · 500 ms max.');
  for (let t = 5520; t <= 10480; t += 20) {
    halfSecond.scene.ctx.completedFrames++;
    vm.runInContext('updateFps(' + t + ')', halfSecond.scene);
  }
  assert(halfSecond.scene.label.endsWith('500 ms max.'),
         'The 500 ms gap must stay visible for five seconds');
  const queued = browser(false);
  for (let t = 0; t <= 1000; t += 20) {
    queued.scene.ctx.clock++;
    vm.runInContext('updateFps(' + t + ')', queued.scene);
  }
  assert.equal(queued.scene.label, '0 FPS Ø · 1000 ms max.',
               'Unfinished GPU submissions must not increase FPS');
  const batched = browser(false);
  for (let t = 0; t <= 1000; t += 20) {
    batched.scene.ctx.completedFrames += 2;
    vm.runInContext('updateFps(' + t + ')', batched.scene);
  }
  assert.equal(batched.scene.label, '50 FPS Ø · 20 ms max.',
               'Two completions at once cannot count as two visible image changes');
  const repeated = browser(false);
  for (let t = 0; t <= 1000; t += 20) {
    repeated.scene.ctx.completedFrames++;
    repeated.scene.ctx.completedContentStamp = 'epoch:' + t;
    vm.runInContext('updateFps(' + t + ')', repeated.scene);
  }
  for (let t = 1020; t <= 1200; t += 20) {
    repeated.scene.ctx.completedFrames++;
    vm.runInContext('updateFps(' + t + ')', repeated.scene);
  }
  assert(repeated.scene.label.endsWith('200 ms max.'),
         'Repeated completed images hide a 200 ms motion stall');
  for (let t = 1220; t <= 6000; t += 20) {
    repeated.scene.ctx.completedFrames++;
    vm.runInContext('updateFps(' + t + ')', repeated.scene);
  }
  assert(repeated.scene.label.startsWith('0 FPS'),
         'Unchanged simulation images count as moving frames');
  const b = browser(true);
  const gpu = browser(true);
  for (let t = 0; t <= 1000; t += 20)
    gpu.tick(t, true, t % 200 === 0);
  await settle();
  const gpuRow = gpu.sent.at(-1).data;
  assert.equal(gpuRow.frames.fps, 5, 'A fast callback hides a slow GPU');
  assert.equal(gpuRow.frames.submitted, 50);
  assert.equal(gpuRow.frames.completed, 5);
  assert.equal(gpuRow.frame_ms.max, 200, 'Reports must measure actual image readiness gaps');
  assert.equal(gpuRow.callback_ms.max, 20, 'Callback timing must remain a separate measurement');
  vm.runInContext('fpsReport.response(-15,-3,2048,true)', b.scene);
  b.tick(0);
  for (let k = 1; k <= 50; k++)
    b.tick(k * 20);
  await settle();
  assert.equal(b.sent.length, 1);
  assert.equal(b.scene.consumedReports, 1,
               'Reports must consume responses to release the browser keepalive quota');
  let row = b.sent[0];
  assert.equal(row.url, '/fps-report');
  assert.equal(row.options.headers['X-Fish-Token'], 'token');
  assert(row.options.keepalive);
  assert.equal(row.data.frames.fps, 50);
  assert.equal(row.data.frames.completed, 50);
  assert.equal(row.data.frame_ms.p95, 20);
  assert.equal(row.data.work_ms.initial, 5);
  assert.equal(row.data.phases_ms.fish, 2);
  assert.equal(row.data.phases_ms.finish, 3);
  assert.equal(row.data.phase_max_ms.fish, 2);
  assert.equal(row.data.phase_max_ms.finish, 3);
  assert.equal(row.data.draws, 3);
  assert.equal(row.data.objects.food, 100);
  assert.equal(row.data.transport.bytes, 2048);
  assert.equal(row.data.transport.wait_ms, 12);
  assert.equal(row.data.transport.apply_ms, 3);
  assert.equal(row.data.client.device, 'Test GPU');
  assert.equal(row.data.resources.animal_atlas_texels, 1024);
  assert.equal(row.data.resources.animal_instances, 8);
  for (let k = 1; k <= 5; k++)
    b.tick(1000 + k * 200);
  await settle();
  row = b.sent.at(-1).data;
  assert.equal(row.frames.fps, 5);
  assert.equal(row.frame_ms.max, 200);
  assert.equal(row.frames.over_100ms, 5);
  assert(!row.client);
  for (let k = 1; k <= 50; k++)
    b.tick(2000 + k * 20);
  await settle();
  assert.equal(b.sent.at(-1).data.frames.fps, 50, 'Recovery is hidden by old rolling samples');
  b.tick(3020);
  b.scene.document.hidden = true;
  b.events.visibilitychange();
  await settle();
  assert.equal(b.sent.at(-1).data.reason, 'hidden');
  b.tick(12000);
  b.scene.document.hidden = false;
  b.tick(24000);
  b.tick(24020);
  b.events.pagehide();
  await settle();
  assert.equal(b.sent.at(-1).data.frame_ms.max, 20, 'Hidden time is counted as a rendering stall');
  b.scene.frame.paused = true;
  b.tick(25000, false);
  for (let k = 1; k <= 50; k++)
    b.tick(25000 + k * 20, false);
  await settle();
  assert.equal(b.sent.at(-1).data.frames.completed, 0, 'Held paused frames reuse stale GPU work');
  assert.equal(b.sent.at(-1).data.frames.fps, 0, 'Reports count submitted frames as well');
  assert.equal(b.sent.at(-1).data.draws, 0);
  vm.runInContext('fpsReport.reset()', b.scene);
  let resolve;
  b.scene.fetch = (url, options) => {
    b.sent.push({data : JSON.parse(options.body)});
    return new Promise(done => resolve = done);
  };
  for (let k = 1; k <= 50; k++)
    b.tick(26000 + k * 20);
  const pending = b.sent.length;
  for (let k = 1; k <= 100; k++)
    b.tick(27000 + k * 20);
  assert.equal(b.sent.length, pending, 'A slow writer starts overlapping uploads');
  assert.equal(vm.runInContext('fpsReport.window.count', b.scene), 100);
  resolve({ok : true, text : async () => ''});
  await settle();
  b.tick(29020);
  assert.equal(b.sent.length, pending + 1);
  assert.equal(b.sent.at(-1).data.frames.callbacks, 101,
               'Backpressure loses the accumulated frame summary');
  resolve({ok : true, text : async () => ''});
  await settle();
  b.tick(29040);
  b.scene.frame = null;
  vm.runInContext('fpsReport.begin(30000)', b.scene);
  assert.equal(b.sent.at(-1).data.epoch, 'epoch',
               'Session reset loses the last valid frame context');
  resolve({ok : true, text : async () => ''});
  await settle();
  console.log(
      'FPS-Bericht: Schalter, Bildabstände, Ausreißer, Erholung, Hintergrund, Pause und begrenzte Übertragung: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
