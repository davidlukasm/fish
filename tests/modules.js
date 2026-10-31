// Link real modules, then exercise their ordered startup with renderer surfaces.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const {createFixture} = require('./dom_fixture.js');
const manifest = JSON.parse(fs.readFileSync('tests/ui_modules.json', 'utf8'));
const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
async function load(sandbox, mockRenderer = false, startApp = false) {
  const context = vm.createContext(sandbox), cache = new Map();
  function module(name) {
    name = path.basename(name);
    if (cache.has(name))
      return cache.get(name);
    let result;
    if (name === 'renderer.js' && mockRenderer) {
      const names = [...manifest.groups.renderer.exports, 'rendererState', 'initialize' ];
      result = new vm.SyntheticModule(names, function() {
        for (const n of names)
          this.setExport(n, n === 'initialize' ? () => {} : sandbox[n] || class {});
      }, {context, identifier : name});
    } else
      result = new vm.SourceTextModule(fs.readFileSync('ui/' + name, 'utf8'),
                                       {context, identifier : name});
    cache.set(name, result);
    return result;
  }
  const entry = mockRenderer || startApp
                    ? module('app.js')
                    : new vm.SourceTextModule(
                          Object.keys(manifest.groups).map(n => `import './${n}.js';`).join('\n'),
                          {context, identifier : 'link-test.js'});
  await entry.link(name => module(name));
  // Expose observations only for assertions; module imports remain native live bindings.
  for (const [name, m] of cache)
    for (const key of Object.getOwnPropertyNames(m.namespace)) {
      if (key === 'initialize' || key.endsWith('State') || key in sandbox)
        continue;
      Object.defineProperty(sandbox, key, {configurable : true, get : () => m.namespace[key]});
    }
  for (const [key, owner] of Object.entries(manifest.mutable)) {
    const m = module(owner.module + '.js');
    Object.defineProperty(sandbox, key, {
      configurable : true,
      get : () => m.namespace[owner.state][key],
      set : v => m.namespace[owner.state][key] = v
    });
  }
  await entry.evaluate();
  return cache;
}
(async () => {
  await load({});
  // A failed dependency import must replace the initial loading label.
  const failed = createFixture(fixture);
  failed.elements['tank-status'].textContent = 'Lauf wird geladen …';
  const page = fs.readFileSync('viewer.html', 'utf8');
  const bootstrap = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g) ].at(-1)[1];
  new vm
      .Script(bootstrap,
              {importModuleDynamically : async () => { throw Error('Missing UI module'); }})
      .runInNewContext(failed.sandbox);
  await new Promise(r => setTimeout(r, 10));
  assert.equal(failed.elements['tank-status'].textContent, 'Start fehlgeschlagen');
  assert.match(failed.elements.error.textContent, /Missing UI module/);

  // Also run ordered startup through the actual renderer module and a mock GL device.
  const real = createFixture(fixture);
  real.sandbox.requestAnimationFrame = () => {};
  let allocations = 0;
  const gl = new Proxy({
    getShaderParameter : () => true,
    getProgramParameter : () => true,
    isContextLost : () => false,
    getParameter : () => null,
    checkFramebufferStatus : () => gl.FRAMEBUFFER_COMPLETE
  },
                       {
                         get(target, name) {
                           if (name in target)
                             return target[name];
                           if (/^[A-Z_\d]+$/.test(name))
                             return target[name] = Object.keys(target).length + 100;
                           return target[name] = (...args) =>
                                      name.startsWith('create')       ? {id : ++allocations}
                                      : name === 'getUniformLocation' ? args[1]
                                                                      : undefined;
                         }
                       });
  const originalContext = real.elements.tank.getContext;
  real.elements.tank.getContext = function(
      kind) { return kind === 'webgl2' ? gl : originalContext.call(this, kind); };
  const actual = await load(real.sandbox, false, true);
  await new Promise(r => setTimeout(r, 20));
  assert(allocations > 0 && actual.get('state.js').namespace.sceneState.frame?.fish.length,
         'Real renderer module startup failed');
  assert.equal(real.elements.error.textContent, '');
  for (const button of real.sandbox.document.querySelectorAll('[data-tool]')) {
    assert.equal(typeof button.onclick, 'function',
                 'Tool button handler missing: ' + button.dataset.tool);
    assert(button.attrs['aria-label'] && button.innerHTML.includes('<svg'),
           'Tool button name or icon missing: ' + button.dataset.tool);
  }

  const {sandbox, elements, requests} = createFixture(fixture);
  sandbox.mergeInstanceRanges = actual.get('renderer.js').namespace.mergeInstanceRanges;
  const polls = new Map();
  sandbox.setTimeout = (callback, delay) => {
    polls.set(callback.name, callback);
    return 0;
  };
  for (const m of fs.readFileSync('viewer.html', 'utf8')
           .matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]+)"/g))
    elements[m[1]].value = m[2];
  elements['brain-flow'].value = 'all';
  elements['brain-body-sense'].value = 's2';
  const modules = await load(sandbox, true);
  await new Promise(r => setTimeout(r, 20));
  assert(sandbox.frame?.fish.length, 'Native module startup does not accept the scene');
  if (fixture.binary_packet) {
    assert(sandbox.frame.visibleFish?.size, 'Connection did not accept the binary scene');
    const p = sandbox.frame.fish.find(p => sandbox.frame.visibleFish.has(p[4]));
    assert(p[66].length > 0 && p[32].length === 47, 'Connection lost body geometry');
  }
  if (fixture.binary_packet) {
    const connection = modules.get('connection.js').namespace, fetch = sandbox.fetch;
    let release, scenes = 0;
    sandbox.fetch = (url, options) => {
      if (url.startsWith('/state'))
        return new Promise(resolve => release = resolve);
      if (url.startsWith('/scene'))
        scenes++;
      return fetch(url, options);
    };
    const waiting = connection.update();
    await Promise.resolve();
    await polls.get('updateDisplay')();
    assert.equal(scenes, 1, 'Statistics response blocks the independent image request');
    release({
      ok : true,
      headers : {get : () => '0'},
      json : async () => ({session : fixture.state.session, exit_code : null, unchanged : true})
    });
    await waiting;
    sandbox.fetch = fetch;
  }
  const camera = modules.get('camera.js').namespace, state = modules.get('state.js').namespace;
  if (fixture.binary_packet) {
    const connection = modules.get('connection.js').namespace,
          metadata = connection.connectionState.metadata, fetch = sandbox.fetch;
    let release, scenes = 0;
    sandbox.fetch = (url, options) => {
      if (url.startsWith('/scene')) {
        scenes++;
        return new Promise(resolve => release = () => resolve(fetch(url, options)));
      }
      return fetch(url, options);
    };
    const pending = polls.get('updateDisplay')();
    await Promise.resolve();
    const status = (turbo, step, hatched, paused = false) => connection.receiveState({
      session : fixture.state.session,
      exit_code : null,
      prepared_frame : {...metadata, turbo, step, hatched, paused}
    });
    try {
      status(true, 1000, 17);
      assert(state.sceneState.frame.turbo, 'Maximum speed must reach the UI without an image');
      assert.equal(elements.generation.textContent, 'Schritt 1.000');
      status(true, 2000, 19);
      assert.equal(elements.generation.textContent, 'Schritt 2.000');
      assert.equal(elements.adults.textContent, 19, 'Maximum speed freezes population statistics');
      release();
      await pending;
      assert.equal(state.sceneState.frame.step, 2000,
                   'An in-flight image replaces newer turbo status');
      assert(state.sceneState.frame.turbo);
      await polls.get('updateDisplay')();
      assert.equal(scenes, 1, 'Maximum speed still requests tank images');
      status(true, 2000, 19, true);
      assert.equal(elements.pause.textContent, 'Weiter', 'Pause is invisible at maximum speed');
      sandbox.fetch = fetch;
      status(false, 2100, 19);
      await polls.get('updateDisplay')();
      assert(!state.sceneState.frame.turbo && state.sceneState.frame.visibleFish?.size,
             'Returning from maximum speed needs a page reload');
    } finally {
      sandbox.fetch = fetch;
    }
  }
  if (fixture.culled_packet) {
    const saved = state.sceneState.frame, zoom = camera.cameraState.zoom,
          {DisplayScene} = modules.get('scene_frame.js').namespace,
          bytes = Buffer.from(fixture.culled_packet, 'base64'),
          offscreen = new DisplayScene().accept(
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
              fixture.state.frame);
    state.updateSceneState({frame : offscreen});
    camera.updateCameraState({zoom : 12});
    const mother = offscreen.fish[0].slice();
    mother[8] = 1;
    offscreen.fish = [ mother, ...offscreen.fish.slice(1) ];
    const {fishPreviewPose} = modules.get('fish_organs.js').namespace,
          {paintCombat} = modules.get('effects.js').namespace;
    assert.doesNotThrow(() => fishPreviewPose(mother, 150, 80, 30, 0),
                        'Offscreen species preview must retain its body geometry');
    offscreen.combat =
        [ [ 98632, offscreen.step, 9, mother[4], 0, mother[0], mother[1], 0, 2, 3 ] ];
    assert.doesNotThrow(() => paintCombat(offscreen, {scale : 8, ox : 0, oy : 0}),
                        'Offscreen combat event must not break drawing');
    const egg = mother.slice();
    egg[4] = Math.max(...offscreen.fish.map(p => p[4])) + 1;
    egg[8] = 0;
    egg[10] = 1;
    egg[35] = mother[4];
    egg[51] = 4;
    state.recordEggBirths({...offscreen, fish : [...offscreen.fish, egg ]}, Date.now());
    assert(state.sceneState.eggBirths.has(egg[4]), 'Offscreen birth loses maternal geometry');
    state.sceneState.eggBirths.clear();
    state.sceneState.maternalBirths.clear();
    state.updateSceneState({frame : saved});
    camera.updateCameraState({zoom});
  }
  camera.resetCamera();
  assert.equal(camera.cameraState.zoom, 1);
  assert(state.frameFish(sandbox.frame, sandbox.frame.selected));
  assert.equal(typeof elements.pause.onclick, 'function');
  await elements.pause.onclick();
  const session = modules.get('session.js').namespace;
  const originalFetch = sandbox.fetch, pending = new Map();
  sandbox.fetch = (url, options) => {
    if (url === '/command' && JSON.parse(options.body).command === 'select')
      return new Promise(resolve => pending.set(JSON.parse(options.body).value, resolve));
    return originalFetch(url, options);
  };
  const ids = sandbox.frame.fish.slice(0, 2).map(p => p[4]);
  const first = state.selectFish(ids[0]), second = state.selectFish(ids[1]);
  const reply = {ok : true, json : async () => ({})};
  pending.get(ids[1])(reply);
  await second;
  pending.get(ids[0])(reply);
  await first;
  assert.equal(sandbox.frame.selected, ids[1], 'Late selection reply replaces current selection');
  sandbox.fetch = async (url, options) => {
    if (url === '/command' && JSON.parse(options.body).command === 'population-import') {
      requests.push(JSON.parse(options.body));
      return {ok : true, json : async () => ({message : 'archive:test-import'})};
    }
    return originalFetch(url, options);
  };
  assert.equal(typeof elements['import-genome'].onclick, 'function');
  elements['genome-file'].files =
      [ {name : 'sammler.genome', size : 10, text : async () => 'genome contents'} ];
  await elements['genome-file'].onchange();
  assert(requests.some(r => r.command === 'population-import' && r.genome === 'genome contents'));
  assert.equal(modules.get('world.js').namespace.worldState.placingEggs.saved, 'test-import');
  assert.equal(elements['egg-placement'].hidden, false);
  modules.get('world.js').namespace.endEggPlacement();
  sandbox.fetch = originalFetch;

  const events = modules.get('event_view.js').namespace,
        cockpit = modules.get('cockpit.js').namespace,
        evolution = modules.get('evolution.js').namespace,
        connection = modules.get('connection.js').namespace, originalFrame = state.sceneState.frame;
  cockpit.updateCockpitState({
    journalData :
        {...fixture.journal, autosaves : [ {id : 'latest', name : 'Autosave', saved : 1792584000} ]}
  });
  events.renderWorlds();
  assert(!elements['autosave-list'].children[0].textContent.includes('Invalid Date'));
  const event = id =>
      ({id, step : id, kind : 'record', wording : 'diversity', data : {n : id}, milestone : true});
  cockpit.updateCockpitState({
    journalData :
        {...fixture.journal, events : Array.from({length : 500}, (_, i) => event(i + 501))}
  });
  evolution.updateEvolutionState({activeView : 'events'});
  events.updateEventViewState({eventOffset : 400});
  elements['event-filter'].value = 'all';
  events.renderEvents();
  const pages = [];
  sandbox.fetch = () => new Promise(resolve => pages.push(resolve));
  const older = elements['event-console'].children.find(e => e.textContent === 'Ältere Ereignisse');
  const firstPage = older.onclick(), duplicatePage = older.onclick();
  assert.equal(pages.length, 1, 'Concurrent pagination requests are not serialized');
  pages[0]({
    ok : true,
    json : async () => ({
      session : session.sessionState.sessionId,
      observation : 'live',
      events : [...Array.from({length : 500}, (_, i) => event(i + 1)), event(500) ]
    })
  });
  await Promise.all([ firstPage, duplicatePage ]);
  assert.equal(cockpit.cockpitState.journalData.events.length, 1000);
  assert.equal(new Set(cockpit.cockpitState.journalData.events.map(e => e.id)).size, 1000);
  assert(!events.event_viewState.pageRequest);
  sandbox.fetch = originalFetch;
  state.updateSceneState(
      {frame : {...originalFrame, historical : true, observation : {key : 'old'}}});
  session.setObservation('old');
  cockpit.updateCockpitState(
      {journalBusy : false, journalData : {...fixture.journal, events : []}});
  let deliverOld, deliverNew;
  sandbox.fetch = () => new Promise(resolve => deliverOld = resolve);
  const oldJournal = events.refreshJournal();
  const next =
      {...state.sceneState.frame, binary_scene : true, step : state.sceneState.frame.step + 10};
  connection.receiveState({...fixture.state, frame : next, observation : {key : 'new'}});
  state.acceptFrame({...next, observation : {key : 'new'}});
  sandbox.fetch = () => new Promise(resolve => deliverNew = resolve);
  const newJournal = events.refreshJournal();
  const newBusy = cockpit.cockpitState.journalBusy;
  deliverOld({
    ok : true,
    json : async () => ({
      ...fixture.journal,
      session : session.sessionState.sessionId,
      observation : 'old',
      ancestry : [ [ 98765, 1, 222, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0 ] ]
    })
  });
  await oldJournal;
  assert.equal(cockpit.cockpitState.journalBusy, newBusy, 'Old request clears new request state');
  assert.equal(cockpit.cockpitState.journalData.events.length, 0,
               'Late old-context journal accepted');
  deliverNew({
    ok : true,
    json : async () => ({
      ...fixture.journal,
      session : session.sessionState.sessionId,
      observation : 'new',
      ancestry : [ [ 98765, 1, 111, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0 ] ]
    })
  });
  await newJournal;
  assert.equal(
      modules.get('family_model.js').namespace.family_modelState.familyRecords.get(98765).parent,
      111);
  const oldContext = session.observationContext();
  session.setObservation('third');
  session.setObservation('new');
  assert(!session.matchesObservation(oldContext), 'Reused context key accepts an old request');
  sandbox.fetch = originalFetch;
  session.setObservation('live');
  state.acceptFrame(originalFrame);
  evolution.updateEvolutionState({activeView : 'evolution'});
  events.updateEventViewState({eventOffset : 0});
  cockpit.updateCockpitState({journalData : fixture.journal});

  const families = modules.get('family_model.js').namespace;
  const historical = sandbox.frame.fish[0].slice();
  historical[35] = 111;
  historical[8] = 1;
  state.updateSceneState({
    frame :
        {...sandbox.frame, historical : true, observation : {key : 'saved'}, fish : [ historical ]}
  });
  families.rememberFamilies(sandbox.frame);
  families.loadFamilyHistory([ [ historical[4], 1, 222, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0 ] ], [],
                             'live', sandbox.frame);
  assert.equal(families.familyRecord(historical[4], sandbox.frame).parent, 111);
  const model = modules.get('brain_model.js').namespace, cell = Array(25).fill(0);
  cell[13] = [ 1 ];
  cell[14] = [];
  assert.equal(model.dominantCellPart(cell), 's0');
  const tank = modules.get('tank.js').namespace;
  tank.draw.error = Error('one transient failure');
  modules.get('connection.js').namespace.resetSession({session : 'replacement'});
  assert.equal(tank.draw.error, null, 'Drawing error survives a new session');
  // A broken GPU submission cannot end the animation chain or report a partial frame as complete.
  const faults = modules.get('diagnostics.js').namespace.displayFaults,
        context = modules.get('dom.js').namespace.ctx, begin = context.beginFrame,
        end = context.endFrame, raf = sandbox.requestAnimationFrame;
  let attempts = 0, submitted = 0, scheduled = 0;
  state.acceptFrame({...originalFrame, paused : false});
  context.beginFrame = () => {
    attempts++;
    throw Error('Injected draw failure');
  };
  context.endFrame = () => { submitted++; };
  sandbox.requestAnimationFrame = () => { scheduled++; };
  for (let i = 0; i < 6; i++) {
    tank.animate(i * 1000);
    if (faults.issues.has('Tank'))
      faults.issues.get('Tank').retryAt = 0;
  }
  assert.equal(attempts, 3, 'Rendering retries do not stop after three failures');
  assert.equal(scheduled, 6, 'A failed render ends requestAnimationFrame scheduling');
  assert.equal(submitted, 0, 'Partial failed frames are counted as complete');
  assert.equal(elements['error-panel'].hidden, false);
  assert.match(elements.error.textContent, /Tank angehalten/);
  await session.command('pause', {value : 1});
  assert(faults.issues.has('Tank'), 'Successful command hides the view failure');
  context.beginFrame = begin;
  context.endFrame = end;
  sandbox.requestAnimationFrame = raf;
  faults.report('Bildübernahme', Error('Previous world'), true);
  tank.resetDrawing();
  assert(!faults.issues.has('Bildübernahme'), 'New world retains a suspended interpolation stage');
  assert(!faults.issues.has('Tank'), 'Drawing reset leaves the failed stage suspended');

  const timeout = sandbox.setTimeout, clear = sandbox.clearTimeout;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.fetch = () => new Promise(() => {});
  await assert.rejects(session.request('/timeout', {}, 5), /lange/);
  sandbox.fetch = originalFetch;
  sandbox.setTimeout = timeout;
  sandbox.clearTimeout = clear;
  // Empty water is a selection gesture, including an already open object menu.
  {
    const world = modules.get('world.js').namespace,
          controller = modules.get('controller.js').namespace,
          panels = modules.get('panels.js').namespace, brain = modules.get('brain.js').namespace;
    const clean = {
      ...originalFrame,
      fish : [],
      corpses : [],
      invertebrates : [],
      plants : [],
      food : [],
      obstacles : [],
      shapes : [],
      selected : 123,
      selected_body : {jaw_length : .99},
      paused : true
    };
    state.updateSceneState({frame : clean, previous : null});
    brain.updateBrainState({brainOpen : false, brainOpacity : 0});
    evolution.updateEvolutionState({editing : false, activeView : 'fish', selectedSpecies : 0});
    world.updateWorldState({placingEggs : null});
    camera.resetCamera();
    const event = {button : 0, clientX : 300, clientY : 160, pointerId : 1};
    tank.tankState.contextMenu = null;
    elements.tank.onpointerdown(event);
    elements.tank.onpointerup(event);
    await new Promise(r => setTimeout(r, 0));
    assert.equal(requests.at(-1).command, 'select');
    assert.equal(requests.at(-1).value, 0, 'Clicking water must deselect');
    assert.equal(tank.tankState.contextMenu, null, 'Water opens no placement menu');
    assert.equal(state.sceneState.frame.selected_body, null,
                 'Changing selection drops the previous anatomy');
    const n = requests.length;
    elements.tank.onpointerdown(event);
    elements.tank.onpointermove({...event, clientX : 330});
    elements.tank.onpointerup({...event, clientX : 330});
    assert.equal(requests.length, n, 'Panning water does not deselect');
    controller.showFrame({...clean, bottom_residence : 0}, {exit_code : null, options : {}});
    assert.equal(elements['bottom-residence'].value, '610');
    assert.equal(elements['bottom-residence-value'].textContent, 'Unbegrenzt');
    sandbox.window.innerWidth = 1000;
    panels.applyPanelWidth(380);
    for (const view of ['species', 'fish', 'evolution'])
      evolution.setView(view);
    assert.equal(panels.panelWidth(), 380, 'Switching tabs must keep the cockpit width');
    sandbox.window.localStorage = {getItem : () => 'null'};
    panels.initialize([ 'panelWidths', 'JSON_parse' ]);
    assert(panels.panelsState.panelWidths);
    delete sandbox.window.localStorage;
    let release;
    session.updateSessionState({historyBusy : false});
    sandbox.fetch = () => new Promise(resolve => release = resolve);
    const waiting = controller.refreshHistory();
    await Promise.resolve();
    modules.get('connection.js').namespace.resetSession({session : 'later'});
    session.updateSessionState({historyBusy : true, lastHistory : 77});
    release({
      ok : true,
      json : async () => ({active : 'older', points : [], milestones : [], sessions : []})
    });
    await waiting;
    assert(session.sessionState.historyBusy, 'Old history response resets new request state');
    assert.equal(session.sessionState.lastHistory, 77);
    sandbox.fetch = originalFetch;
  }
  console.log('Native ES modules: links, ordered startup, scene, camera and command: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
