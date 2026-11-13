const assert = require('node:assert/strict');

module.exports = async function checkCanvas(model, capabilities, root) {
  const {readFileSync} = require('node:fs');
  const {join} = require('node:path');
  const places = await import('../ui/studio/view/places.js');
  const layout = await import('../ui/studio/model/layout.js');
  const {fishScene} = await import('../ui/studio/view/scene.js');
  const {drawnBundles} = await import('../ui/studio/view/wires.js');
  const {dropMethods} = await import('../ui/studio/drops.js');
  const {gestureMethods} = await import('../ui/studio/gestures.js');
  const {createPlanPlayer} = await import('../ui/studio/view/pulse.js');
  const {detailMix, nodeOpacity} = await import('../ui/studio/view/layers.js');
  const {regionRim, BRAIN} = await import('../ui/studio/view/region_layout.js');
  const {placementHints} = await import('../ui/studio/view/placing.js');
  const {placeCanvasOrgan, moveCanvasOrgan, newFishDocument} =
      await import('../ui/studio/canvas_placement.js');
  const {settleRegions} = await import('../ui/studio/model/regions.js');
  const sites = capabilities.sites;
  const state = document => ({
    document,
    sites,
    capabilities,
    camera : {x : 520, y : 365, zoom : 1},
    selected : null,
    multi : new Set(),
    tool : 'select',
    wireScope : 'all',
    contactView : 'design',
    userModules : []
  });
  const checkCellCopies = document => {
    for (const center of model.contactCenters(state(document))) {
      const found = model.findCenter(document, center.id),
            point = places.nodeLocation(document, sites, found.center, found.organ.type);
      assert.deepEqual(places.nodeLocation(document, sites, center, center.organType), point,
                       'A contact copy keeps its original cell position');
      assert.deepEqual(
          places.nodeLocation(document, sites, structuredClone(center), center.organType), point);
    }
  };
  for (const type of ['touch', 'pain', 'gills', 'lateral']) {
    let document = model.newDocument('Zellorte');
    for (let i = 0; i < (type === 'lateral' ? 4 : 1); ++i)
      document = model.addOrgan(document, type, sites, {x : 400 + 40 * i, y : 290}, Infinity, false)
                     .document;
    const organ = document.organs.find(o => o.type === type);
    if (type === 'gills')
      document = model.setOrganNodes(document, organ.id, 8, sites);
    if (type === 'lateral') {
      organ.centers = document.organs.filter(o => o.type === type).flatMap(o => o.centers);
      document.organs = document.organs.filter(o => o.type !== type || o === organ);
    }
    model.validateDocument(document);
    checkCellCopies(document);
    const cells = model.allCenters(document).filter(c => c.organType === type);
    assert.equal(
        new Set(cells.map(c => JSON.stringify(places.nodeLocation(document, sites, c, type)))).size,
        cells.length, 'Every group keeps its own point, including both gill sides');
    for (const id of [undefined, 'missing'])
      for (const site of [cells[0].site, -1]) {
        const unknown = {...cells[0], id, site};
        assert.deepEqual(places.nodeLocation(document, sites, unknown, type),
                         places.centerLocation(unknown, type, sites),
                         'An unowned cell uses its site fallback, never another cell');
      }
  }
  let doc = model.newDocument('Vierzig Regionen');
  for (let i = 0; i < 20; ++i) {
    const made = model.addOrgan(doc, [ 'olfaction', 'tectum', 'value', 'choice' ][i % 4], sites,
                                {x : 350 + i % 5 * 45, y : 280 - i % 3 * 20}, Infinity, true);
    assert.ok(made, 'The normal palette can place forty regions');
    doc = made.document;
    if (![9, 19].includes(i))
      continue;
    model.validateDocument(doc);
    const organs = doc.organs.filter(o => o.region);
    assert.equal(organs.length, 2 * (i + 1));
    const boxes = organs.map(o => places.regionGeometry(doc, sites, o));
    for (let a = 0; a < boxes.length; ++a) {
      const A = boxes[a], twin = boxes.find(b => b.id === organs[a].pair);
      assert.equal(A.x, twin.x);
      assert.ok(Math.abs(A.y + twin.y - 2 * layout.BODY_FRAME.middle) < 1e-7);
      for (let b = a + 1; b < boxes.length; ++b) {
        const B = boxes[b];
        assert.ok(Math.abs(A.x - B.x) >= (A.width + B.width) / 2 ||
                      Math.abs(A.y - B.y) >= (A.height + B.height) / 2,
                  'Region envelopes do not overlap at twenty or forty regions');
      }
      const occupied = new Set();
      for (const center of organs[a].centers) {
        const p = places.nodeLocation(doc, sites, center, organs[a].type);
        assert.ok(Math.abs(p.x - A.x) < A.width / 2 && Math.abs(p.y - A.y) < A.height / 2);
        const key = p.x + ':' + p.y;
        assert.ok(!occupied.has(key), 'Cells occupy distinct places within their own region');
        occupied.add(key);
      }
    }
    const overview = fishScene(state(doc));
    assert.equal((overview.match(/class="aid-region-card aid-region-detail/g) ?? []).length,
                 organs.length);
    assert.ok(!overview.includes('data-center="'),
              'The overview contains regions rather than cell clouds');
    const close = fishScene({...state(doc), camera : {x : 460, y : 365, zoom : 3.5}});
    assert.ok(close.includes('data-center="'));
    const placing = fishScene({
      ...state(doc),
      armed : {kind : 'neuron', value : 'relay'},
      camera : {x : 460, y : 365, zoom : 5}
    });
    assert.ok(!placing.includes('aid-neural-seats'), 'Native addresses are not placement targets');
    assert.match(placementHints(state(doc), 'organ', 'tectum').svg, /aid-placement-area/);
    assert.ok(close.includes('class="aid-region-inner'),
              'Internal wiring is visible without selecting a cell');
    assert.ok(!close.includes('aid-region-name'), 'The graph is not covered with labels');
    const transitioning = {...state(doc), camera : {zoom : 1.65}};
    const mix = detailMix(transitioning);
    assert.ok(mix.regions > 0 && mix.regions < 1);
    const near = {...state(doc), camera : {zoom : 2.8}};
    assert.ok(nodeOpacity(near) > .4 && nodeOpacity(near) < .6);
    assert.ok(Math.abs(detailMix({...near, camera : {zoom : 2.801}}).cells -
                       detailMix(near).cells) < .002,
              'Cell detail changes continuously between zoom levels');
    const unchanged =
        organs.map(o => o.centers.map(c => places.nodeLocation(doc, sites, c, o.type)));
    fishScene(near);
    assert.deepEqual(
        organs.map(o => o.centers.map(c => places.nodeLocation(doc, sites, c, o.type))), unchanged,
        'Zooming cannot move or repack the regions or their cells');
  }
  const free = sites.filter(layout.nerveZone);
  assert.ok(free.some(s => s.zone === layout.ZONE.tail));
  assert.ok(free.some(layout.onMidline));
  const ys = new Set(
      free.filter(s => s.zone === layout.ZONE.head).map(s => layout.sitePoint(s, 'nerve').y));
  assert.ok(ys.size >= 5, 'Both depth rows and the midline remain distinct in the brain');
  const undeveloped = structuredClone(doc);
  for (const organ of undeveloped.organs.filter(o => o.region))
    organ.centers = [];
  const native = sites =>
      settleRegions(undeveloped, sites).organs.map(o => o.centers.map(c => c.site));
  assert.deepEqual(native(sites), native(sites.toReversed()),
                   'Region cells follow native topology with a stable tie break');
  for (const name of ['brisa', 'liora']) {
    const fish =
        JSON.parse(readFileSync(join(root, 'genomes/entwuerfe', name + '.fish.json'), 'utf8'));
    checkCellCopies(fish);
    const bundles = drawnBundles(state(fish));
    assert.ok(bundles.length);
    for (const bundle of bundles) {
      const middle = bundle.way.at(.5);
      assert.ok(Number.isFinite(middle.x) && Number.isFinite(middle.y));
      assert.ok(!bundle.way.path(0, 1).match(/NaN|Infinity/));
    }
    for (const bundle of bundles) {
      assert.match(bundle.way.path(0, 1), / C/, 'Nerve trunks use curved paths');
      assert.ok(!/ L/.test(bundle.way.path(0, 1)), 'No polygonal ring replaces the graph');
    }
    for (const organ of fish.organs.filter(o => o.region)) {
      const rim = regionRim(places.regionGeometry(fish, sites, organ)), polygon = [];
      // Sample the displayed quadratic outline, not just the region's bounding rectangle.
      for (let i = 0; i < rim.length; ++i) {
        const p = rim[i], before = rim[(i + rim.length - 1) % rim.length],
              after = rim[(i + 1) % rim.length];
        const a = {x : (before.x + p.x) / 2, y : (before.y + p.y) / 2};
        const b = {x : (after.x + p.x) / 2, y : (after.y + p.y) / 2};
        for (let n = 0; n < 10; ++n) {
          const t = n / 10;
          polygon.push({
            x : (1 - t) ** 2 * a.x + 2 * t * (1 - t) * p.x + t * t * b.x,
            y : (1 - t) ** 2 * a.y + 2 * t * (1 - t) * p.y + t * t * b.y
          });
        }
      }
      for (const center of organ.centers) {
        const p = places.nodeLocation(fish, sites, center, organ.type);
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const a = polygon[i], b = polygon[j];
          if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)
            inside = !inside;
        }
        assert.ok(inside,
                  name + ': ' + organ.type + '/' + center.node + ' lies inside its outline');
      }
    }
  }
  const blank = newFishDocument('Grundkörper', sites);
  assert.ok(blank.organs.some(o => o.type === 'gut') && blank.organs.some(o => o.type === 'eggs'));
  await checkInitialFish(model, capabilities, root);
  await checkAutosave(model);
  const pickedEye = placeCanvasOrgan(state(model.newDocument('Frei')), 'eye',
                                     {x : 330.375, y : 285.625}, 'single');
  assert.ok(pickedEye);
  const eye = model.findOrgan(pickedEye.document, pickedEye.organId);
  const movedEye =
      moveCanvasOrgan(state(pickedEye.document), eye.id, {x : 351.125, y : 278.375}, null);
  assert.ok(movedEye);
  assert.deepEqual(model.findOrgan(movedEye, eye.id).position, {x : 351.125, y : 278.375});
  assert.notDeepEqual(model.findOrgan(movedEye, eye.id).field, eye.field,
                      'Moving an eye updates its visual field and retinal sites');
  assert.notDeepEqual(model.findOrgan(movedEye, eye.id).centers.map(c => c.site),
                      eye.centers.map(c => c.site));
  const region =
      placeCanvasOrgan(state(model.newDocument('Frei')), 'value', {x : 350.25, y : 320.5}, 'both');
  const original = model.findOrgan(region.document, region.organId);
  const at = {x : 675.375, y : 361.25};
  const moved = moveCanvasOrgan(state(region.document), original.id, at, null);
  assert.ok(moved);
  const shifted = model.findOrgan(moved, original.id);
  assert.equal(shifted.position.x, at.x);
  assert.equal(shifted.position.y, at.y);
  assert.deepEqual(shifted.centers.map(c => c.id), original.centers.map(c => c.id));
  assert.notDeepEqual(shifted.centers.map(c => c.site), original.centers.map(c => c.site),
                      'A region follows the anatomical neighbourhood in CPPN space');
  assert.ok(shifted.centers.every(c => sites.find(s => s.id === c.site).zone >= 2));
  assert.equal(model.findOrgan(moved, shifted.pair).position.y,
               2 * layout.BODY_FRAME.middle - at.y);
  assert.deepEqual(moved.wires, region.document.wires);
  model.validateDocument(moved);
  const zoomed = {
    state : state(doc),
    root : {querySelector : () => null},
    refreshScene() {},
    refreshSwitches() {},
    showZoom : gestureMethods.showZoom
  };
  const anchor = {x : 320, y : 250}, beforeZoom = {...zoomed.state.camera};
  gestureMethods.zoom.call(zoomed, 1.65, anchor);
  assert.equal(zoomed.state.camera.zoom, 1.65, 'Zoom accepts continuous wheel movement');
  for (const axis of ['x', 'y'])
    assert.ok(Math.abs((anchor[axis] - beforeZoom[axis]) * beforeZoom.zoom -
                       (anchor[axis] - zoomed.state.camera[axis]) * zoomed.state.camera.zoom) <
                  1e-8,
              'The point under the pointer remains fixed while zooming');
  // Every kind of sense curve draws finite numbers and keeps its handle's words inside the picture.
  {
    const curves = await import('../ui/studio/view/sense_curves.js');
    const words = {report : 'r', from : 'a', to : 'b', half : 'h', handle : 't'};
    const cell = {id : 'c', copies : 2, tau : .5};
    const picture = curves.sensePicture(cell, 'x', [
      curves.boundedRow(.6, words), curves.intensityRow(.6, 1e-4, words),
      curves.fadeRow(cell, 1, .2, {...words, half : n => 'n' + n}, true),
      curves.fadeRow(cell, .01, .002, {...words, half : n => 'n' + n})
    ]);
    assert.ok(!/NaN|undefined|Infinity/.test(picture), 'Sense curves draw finite numbers only');
    assert.ok(curves.SENSE_PLOT.window > 0 && curves.SENSE_PLOT.settled > 0);
    assert.equal(curves.boundedAnswer(.3, .3), 0);
    assert.ok(curves.boundedAnswer(1, .3) === 1 && curves.excessAnswer(.02, .01) === .5);
    assert.equal(curves.excessAnswer(.05, .01, .05), 0, 'A stimulus the cell is used to is silent');
  }
  // Two bundles that run alongside each other become one nerve: side by side across it, as far
  // apart as their strands are wide, and each bends into the nerve without a corner.
  const {nerveBundling, polylineWay, NERVE_SNAP} = await import('../ui/studio/view/nerves.js');
  const straight = (y0, y1) => polylineWay(Array.from(
      {length : 81}, (_, k) => ({x : 100 + k * 5, y : k < 20 ? y0 + (y1 - y0) * k / 20 : y1})));
  const strands = nerveBundling([
    {way : straight(330, 362), safe : () => true, width : 2},
    {way : straight(400, 366), safe : () => true, width : 2}
  ]);
  const upper = strands[0].way, lower = strands[1].way, apart = lower.at(.75).y - upper.at(.75).y;
  assert.ok(Math.abs(apart - 2 * NERVE_SNAP.pack) < .2,
            'Strands of one nerve lie beside each other, not on top: ' + apart);
  assert.equal(strands[0].nerves.length + strands[1].nerves.length, 1);
  for (const {way} of strands) {
    const P = way.points;
    let sharpest = 0;
    for (let i = 1; i + 1 < P.length; i++) {
      const a = Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x),
            b = Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x);
      sharpest = Math.max(sharpest, Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))));
    }
    assert.ok(sharpest < .2, 'A bundle joins its nerve in a curve, not at a corner: ' + sharpest);
  }
  const {fieldExtent} = await import('../ui/studio/view/vision.js');
  const {cameraBox} = await import('../ui/studio/view/frame.js');
  const framed = {state : {...state(pickedEye.document), mode : 'fish'}};
  const home = {...framed.state.camera};
  framed.state.selected = {kind : 'organ', id : eye.id};
  gestureMethods.frameField.call(framed);
  const shown = cameraBox(framed.state.camera), handles = fieldExtent(framed.state, eye);
  assert.ok(handles.length > 2 && framed.state.camera.zoom < home.zoom);
  assert.ok(handles.every(h => h.x >= shown.x + 80 / shown.zoom - 1e-6 &&
                               h.x <= shown.x + shown.width && h.y >= shown.y &&
                               h.y <= shown.y + shown.height),
            'A chosen eye has its whole field and the handles on it in view, clear of the tools');
  gestureMethods.frameField.call(framed);
  assert.deepEqual(cameraBox(framed.state.camera), shown, 'The view is framed once');
  framed.state.selected = null;
  gestureMethods.frameField.call(framed);
  assert.deepEqual(framed.state.camera, home, 'Letting the eye go returns the view');
  framed.state.selected = {kind : 'organ', id : eye.id};
  gestureMethods.frameField.call(framed);
  framed.state.camera.x += 5;
  const kept = {...framed.state.camera};
  framed.state.selected = null;
  gestureMethods.frameField.call(framed);
  assert.deepEqual(framed.state.camera, kept, 'A view the user moved stays where it is');
  const picked = {
    ...dropMethods,
    state : {armed : null, sites : [], document : model.newDocument('')},
    showArmed() {},
    clearPreview() {},
    cancelChoices() {},
    preparePlacement(kind, value) { this.hints = {kind, value}; },
    drop(event) {
      this.placed = this.dragging;
      this.dragging = null;
    }
  };
  picked.pickUp('organ', 'tectum');
  assert.deepEqual(picked.hints, {kind : 'organ', value : 'tectum'});
  assert.deepEqual(picked.state.armed, picked.hints);
  const event = {target : {closest : selector => selector === '#aid-body-map' ? {} : null}};
  assert.ok(picked.clickArmed(event));
  assert.deepEqual(picked.placed, {kind : 'organ', value : 'tectum'});
  assert.equal(picked.state.armed, null);
  picked.pickUp('organ', 'tectum');
  assert.ok(picked.release());
  assert.equal(picked.state.armed, null, 'Escape/right click can put a carried part down');
  picked.pickUp('organ', 'eye');
  Object.assign(picked.state, {station : 'studio', mode : 'fish'});
  gestureMethods.pointerDown.call(picked, {...event, button : 0});
  assert.equal(picked.pointer, undefined,
               'Placing a carried part cannot start an organ drag or pan');

  const before = {
    requestAnimationFrame : global.requestAnimationFrame,
    cancelAnimationFrame : global.cancelAnimationFrame,
    performance : global.performance
  };
  let next, now = 0, scale = 1, geometryQueries = 0;
  global.performance = {now : () => now};
  global.requestAnimationFrame = callback => {
    next = callback;
    return 1;
  };
  global.cancelAnimationFrame = () => {};
  const element = tag => ({
    tag,
    attributes : {},
    children : [],
    classList : {contains : () => false, remove() {}, toggle() {}},
    style : {setProperty() {}},
    setAttribute(key, value) { this.attributes[key] = value; },
    getAttribute(key) { return this.attributes[key] ?? null; },
    appendChild(child) { this.children.push(child); },
    remove() {}
  });
  const route = (from, to, section) => ({
    ...element('path'),
    attributes : {'data-signal-edges' : 'a>b', 'data-signal-section' : String(section)},
    matches : () => true,
    getTotalLength : () => (++geometryQueries, to - from),
    getPointAtLength : n => {
      ++geometryQueries;
      return {x : from + n, y : 0};
    }
  });
  const paths = [ route(220, 240, 2), route(0, 20, 0), route(20, 220, 1) ];
  const svg = {
    ...element('svg'),
    isConnected : true,
    ownerDocument : {createElementNS : (_, tag) => element(tag)},
    querySelectorAll : () => paths,
    getScreenCTM : () => ({a : scale, b : 0})
  };
  const trace = {
    parts : [ {id : 'a', level : 0}, {id : 'b', level : 1} ],
    legs : [
      {from : 'a', to : 'b', level : 0, kind : 'electrical', sign : 1},
      {from : 'hidden', to : 'b', level : 0, kind : 'electrical', sign : 1}
    ]
  };
  const reached = [];
  const player = createPlanPlayer(
      svg, trace,
      {marks : () => [], point : () => ({x : 1, y : 1}), reached : part => reached.push(part.id)});
  try {
    player.start();
    const frame = time => {
      now = time;
      const draw = next;
      draw(time);
    };
    frame(0);
    const overlay = svg.children.at(-1), dots = overlay.children.filter(c => c.tag === 'circle');
    assert.equal(dots.length, 1, 'Hidden links create no straight replacement routes');
    const sampled = geometryQueries;
    frame(500);
    assert.equal(geometryQueries, sampled,
                 'Animation frames use cached geometry without SVG layout queries');
    assert.ok(Math.abs(Number(dots[0].attributes.cx) - 90) < 1e-6);
    assert.deepEqual(reached, [ 'a' ], 'A long path is not traversed in one fixed short interval');
    scale = 2;
    player.attach(svg);
    frame(750);
    const dot = svg.children.at(-1).children.find(c => c.tag === 'circle');
    assert.ok(Math.abs(Number(dot.attributes.cx) - 112.5) < 1e-6,
              'After zoom, travel continues along the same route at the same screen speed');
    assert.equal(Number(dot.attributes.r), 2.5);
  } finally {
    player.stop();
    Object.assign(global, before);
  }
  checkPulseTiming(createPlanPlayer, (await import('../ui/studio/view/pulse.js')).pulseSchedule);
  await checkPulseCallbacks(createPlanPlayer);
  await checkRedraws(model, capabilities, root);
};

function checkPulseTiming(createPlanPlayer, pulseSchedule) {
  let now = 0, next, queries = 0, scale = 1;
  const saved = {
    performance : global.performance,
    requestAnimationFrame : global.requestAnimationFrame,
    cancelAnimationFrame : global.cancelAnimationFrame
  };
  global.performance = {now : () => now};
  global.requestAnimationFrame = f => (next = f, 1);
  global.cancelAnimationFrame = () => {};
  const element = tag => ({
    tag,
    attributes : {},
    children : [],
    classList : {
      set : new Set(),
      contains(k) { return this.set.has(k); },
      add(k) { this.set.add(k); },
      remove(k) { this.set.delete(k); },
      toggle(k, on) { on ? this.set.add(k) : this.set.delete(k); }
    },
    style : {setProperty() {}},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k] ?? null; },
    appendChild(c) { this.children.push(c); },
    remove() {}
  });
  const route = (pair, length, y) => ({
    ...element('path'),
    attributes : {'data-signal-edges' : pair},
    matches : () => true,
    getTotalLength : () => (++queries, length),
    getPointAtLength : n => (queries++, {x : n, y})
  });
  const routes =
      [ route('a>b', 90, 0), route('a>d', 180, 10), route('c>d', 360, 20), route('d>e', 180, 30) ];
  const svg = {
    ...element('svg'),
    isConnected : true,
    ownerDocument : {createElementNS : (_, tag) => element(tag)},
    querySelectorAll : () => routes,
    getScreenCTM : () => ({a : scale, b : 0})
  };
  const parts = [
    {id : 'a', level : 0}, {id : 'c', level : 0}, {id : 'b', level : 1}, {id : 'd', level : 1},
    {id : 'e', level : 2}
  ].map(p => ({...p, kind : 'electrical', sign : 1}));
  const legs = [ [ 'a', 'b', 0 ], [ 'a', 'd', 0 ], [ 'c', 'd', 0 ], [ 'd', 'e', 1 ] ].map(
      ([ from, to, level ]) => ({from, to, level, kind : 'electrical', sign : 1, sourceSign : 1}));
  const durations = new Map(legs.map((l, i) => [l, [ 500, 1000, 2000, 1000 ][i]]));
  const times = pulseSchedule({parts, legs}, durations);
  assert.deepEqual(times.parts.map(p => [p.part.id, p.at, p.waitingAt]), [
    [ 'a', 0, 0 ], [ 'c', 0, 0 ], [ 'b', 500, 500 ], [ 'd', 2000, 1000 ], [ 'e', 3000, 3000 ]
  ]);
  const marks = new Map(parts.map(p => [p.id, element('g')])), reached = [];
  const player = createPlanPlayer(svg, {parts, legs}, {
    marks : id => [marks.get(id)],
    point : () => ({x : 0, y : 0}),
    reached : p => {
      reached.push(p.id);
      if (p.level === 0)
        now += 300;
    }
  });
  const frame = delta => {
    now += delta;
    next(now);
  };
  try {
    player.start();
    assert.equal(now, 600);
    assert.deepEqual(reached, [ 'a', 'c' ]);
    frame(0);
    const dots = svg.children.at(-1).children;
    const sampled = queries;
    frame(100);
    for (const dot of dots.slice(0, 3))
      assert.equal(Number(dot.attributes.cx), 18,
                   'Every signal travels 18 px per 100 ms, after initial work');
    assert.equal(queries, sampled, 'No geometry reads while animating');
    frame(400);
    assert.ok(reached.includes('b'));
    assert.ok(!reached.includes('d'));
    assert.equal(dots[0].attributes.opacity, '0');
    frame(1000);
    assert.ok(marks.get('d').classList.contains('aid-pulse-waiting'));
    assert.ok(!reached.includes('d'));
    assert.equal(Number(dots[2].attributes.cx), 270);
    frame(500);
    assert.ok(reached.includes('d'));
    assert.ok(!marks.get('d').classList.contains('aid-pulse-waiting'));
    assert.equal(Number(dots[3].attributes.cx), 0);
    frame(100);
    assert.equal(Number(dots[3].attributes.cx), 18);
    scale = 2;
    player.rescale();
    assert.equal(queries, sampled, 'Wheel zoom reuses the existing path samples');
    frame(100);
    let moved = svg.children.at(-1).children.at(-1);
    assert.equal(Number(moved.attributes.cx), 27);
    assert.equal(Number(moved.attributes.r), 2.5);
    player.attach(svg);
    frame(100);
    moved = svg.children.at(-1).children.at(-1);
    assert.equal(Number(moved.attributes.cx), 36,
                 'The settled zoom redraw continues at the same speed without restarting');
    player.stop();
    const reusedQueries = queries;
    const repeated = createPlanPlayer(
        svg, {parts, legs}, {marks : () => [], point : () => ({x : 0, y : 0}), reached() {}});
    repeated.start();
    assert.equal(queries, reusedQueries, 'Another impulse reuses unchanged SVG path geometry');
    repeated.stop();
  } finally {
    player.stop();
    Object.assign(global, saved);
  }
}

async function checkPulseCallbacks(createPlanPlayer) {
  const {trialMethods} = await import('../ui/studio/trials.js');
  const before = {
    performance : global.performance,
    requestAnimationFrame : global.requestAnimationFrame,
    cancelAnimationFrame : global.cancelAnimationFrame
  };
  const parts = [
    {id : 'a', kind : 'electrical', sign : 1, level : 0},
    ...['b', 'c'].map(id => ({id, kind : 'electrical', sign : 1, level : 1})),
    {id : 'd', kind : 'electrical', sign : 1, level : 2},
    {id : 'd', kind : 'teaching', sign : 0, level : 2},
    ...[0, 1].map(substance => ({id : 'd', kind : 'hormone', sign : 0, substance, level : 2})),
    {id : 'e', kind : 'electrical', sign : 1, level : 3}
  ];
  const legs = [
    ...['b', 'c'].map(to => ({from : 'a', to, level : 0, kind : 'electrical', sign : 1})),
    {from : 'b', to : 'd', level : 1, kind : 'electrical', sign : 1},
    {from : 'c', to : 'd', level : 1, kind : 'teaching', sign : 0},
    ...['b', 'c'].map((from, substance) =>
                          ({from, to : 'd', level : 1, kind : 'hormone', sign : 0, substance})),
    {from : 'd', to : 'e', level : 2, kind : 'electrical', sign : 1}
  ].map(leg => ({...leg, sourceSign : 1}));
  const run = (times, action = '') => {
    let now = 0, next, scale = 1;
    global.performance = {now : () => now};
    global.requestAnimationFrame = f => (next = f, 1);
    global.cancelAnimationFrame = () => {};
    const element = () => ({
      attributes : {},
      children : [],
      classList : {
        set : new Set(),
        contains(k) { return this.set.has(k); },
        add(k) { this.set.add(k); },
        remove(k) { this.set.delete(k); },
        toggle(k, on) { on ? this.set.add(k) : this.set.delete(k); }
      },
      style : {setProperty() {}},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k] ?? null; },
      appendChild(child) { this.children.push(child); },
      remove() {}
    });
    const paths = legs.filter(leg => leg.kind !== 'hormone')
                      .map(leg => ({
                             ...element(),
                             attributes : {'data-signal-edges' : leg.from + '>' + leg.to},
                             matches : () => true,
                             getTotalLength : () => 90,
                             getPointAtLength : x => ({x, y : 0})
                           }));
    const svg = {
      ...element(),
      isConnected : true,
      ownerDocument : {createElementNS : () => element()},
      querySelectorAll : () => paths,
      getScreenCTM : () => ({a : scale, b : 0})
    };
    const marks = new Map(parts.map(part => [part.id, element()])), callbacks = [];
    const stimulus = {fired : new Set(), sent : [], learned : [], taught : new Map()};
    const studio = {
      state : {document : {organs : []}},
      teaches : trialMethods.teaches,
      legWires : () => []
    };
    const player = createPlanPlayer(svg, {parts, legs}, {
      marks : id => [marks.get(id)],
      point : id => ({x : {a : 0, b : 90, c : 0, d : 180, e : 270}[id], y : 0}),
      reached : part => {
        callbacks.push([ 'reached', part.id, part.kind, part.substance ]);
        if (part.kind === 'electrical' && part.sign > 0)
          stimulus.fired.add(part.id);
        trialMethods.learnedPaths.call(studio, part, stimulus);
      },
      sent : leg => {
        callbacks.push([ 'sent', leg.from, leg.to, leg.kind, leg.substance ]);
        stimulus.sent.push(leg);
      }
    });
    try {
      player.start();
      for (const time of times) {
        now = time;
        next(time);
        if (time === 750 && [ 'redraw', 'zoom' ].includes(action)) {
          if (action === 'zoom') {
            scale = 2;
            player.rescale();
          }
          player.attach(svg);
        }
        if (time === 1900 && !action)
          assert.ok(marks.get('d').classList.contains('aid-pulse-binding'),
                    'A second substance keeps the shared mark lit after the first one fades');
      }
      const sequence = [...callbacks ];
      player.stop();
      assert.ok(!marks.get('d').classList.contains('aid-pulse-binding'));
      now += 5000;
      next(now);
      assert.deepEqual(callbacks, sequence, 'Stopping suppresses a pending animation callback');
      if (action === 'restart') {
        player.start();
        next(now);
        now += 10000;
        next(now);
        assert.deepEqual(callbacks.slice(sequence.length), sequence,
                         'Restarting replays each chronological callback once');
      }
      return {sequence, learned : stimulus.learned.map(leg => leg.from + '>' + leg.to)};
    } finally {
      player.stop();
    }
  };
  try {
    const smooth = run([ 0, 250, 500, 750, 1000, 1250, 1500, 1750, 1900, 2350 ]);
    assert.deepEqual(smooth.learned, [ 'b>d' ]);
    assert.deepEqual(run([ 0, 2350 ]), smooth,
                     'Skipping frames keeps departures, arrivals and golden inputs identical');
    assert.deepEqual(run([ 0, 500, 750, 2350 ], 'redraw'), smooth,
                     'Redrawing preserves pending callbacks without duplicating old arrivals');
    assert.deepEqual(run([ 0, 500, 750, 10000 ], 'zoom'), smooth,
                     'Zoom scales pending departures and arrivals together');
    assert.deepEqual(run([ 0, 500, 1000, 1500, 2350 ], 'restart'), smooth);
  } finally {
    Object.assign(global, before);
  }
}

async function checkRedraws(model, caps, root) {
  const {OrganStudio} = await import('../ui/studio/controller.js');
  const doc = JSON.parse(require('node:fs').readFileSync(
      require('node:path').join(root, 'genomes/entwuerfe/liora.fish.json')));
  const counts = {};
  function make() {
    const studio = new OrganStudio({
      dataset : {},
      style : {removeProperty() {}},
      querySelector : () => null,
      querySelectorAll : () => []
    });
    Object.assign(studio.state, {
      station : 'studio',
      document : doc,
      sites : caps.sites,
      capabilities : caps,
      stimulus : {}
    });
    const hits = {scene : 0, inspector : 0, skin : 0, design : 0};
    studio.refreshScene = () => hits.scene++;
    studio.refreshInspector = () => hits.inspector++;
    studio.refreshSkin = () => hits.skin++;
    studio.requestDesign = () => hits.design++;
    studio.persist = () => {};
    studio.bringProbes = () => {};
    studio.notice = () => {};
    return {studio, hits};
  }
  for (const action of ['stimulate', 'setTraceSource', 'setTool', 'placeStimulus']) {
    const {studio, hits} = make();
    if (action === 'stimulate')
      studio.stimulate([ model.allCenters(doc)[0].id ]);
    if (action === 'setTraceSource')
      studio.setTraceSource('plan');
    if (action === 'setTool')
      studio.setTool('wire');
    if (action === 'placeStimulus')
      studio.placeStimulus('light');
    counts[action] = hits;
  }
  for (const held of ['spectrum', 'sense', 'vision', 'skin', 'response']) {
    const {studio, hits} = make();
    const cell = model.allCenters(doc)[0];
    studio.state.document = model.updateCenter(doc, cell.id, {field : .314159});
    studio.drafted = 'test';
    studio.draftStart = doc;
    studio.handleDrag = {held, last : {x : 0, y : 0}};
    studio.releaseHandle({clientX : 0, clientY : 0});
    assert.equal(studio.handleDrag, null);
    assert.equal(studio.undoHistory.length, 1, 'A completed drag remains one undo step');
    counts['release:' + held] = hits;
  }

  for (const [action, hits] of Object.entries(counts)) {
    assert.equal(hits.scene, 1, action + ' draws the fish once');
    assert.equal(hits.inspector, 1, action + ' draws the inspector once');
    if (action.startsWith('release:'))
      assert.equal(hits.design, 1, action + ' requests one design run');
  }
  {
    const {studio} = make();
    const cell = model.allCenters(doc)[0];
    studio.state.document = model.updateCenter(doc, cell.id, {field : .314159});
    studio.drafted = 'test';
    studio.draftStart = doc;
    studio.handleDrag = {held : 'sense', last : {x : 0, y : 0}};
    studio.refreshInspector = () => { throw Error('drawing failed'); };
    assert.throws(() => studio.releaseHandle({clientX : 0, clientY : 0}), /drawing failed/);
    assert.equal(studio.handleDrag, null, 'A drawing error cannot keep dragging after release');
    assert.equal(studio.drafted, null);
    let moved = 0;
    studio.followHandle = () => ++moved;
    studio.pointerMove({target : {closest : () => null}});
    assert.equal(moved, 0, 'Moving without a pressed pointer cannot change the failed drag');
  }

  {
    const {storedPanels} = await import('../ui/studio/handles.js');
    const saved = {
      window : global.window,
      document : global.document,
      localStorage : global.localStorage,
      requestAnimationFrame : global.requestAnimationFrame,
      cancelAnimationFrame : global.cancelAnimationFrame
    };
    try {
      global.localStorage = {getItem : () => JSON.stringify({library : -50, inspector : 99999})};
      assert.deepEqual(storedPanels(), {library : 150, inspector : 680},
                       'Stored panel widths obey the same limits as dragging');
      global.localStorage = {getItem : () => '{broken'};
      assert.deepEqual(storedPanels(), {});
      for (const interrupted of ['blur', 'pointercancel']) {
        const events = {}, frames = new Map();
        global.window = {addEventListener : (key, fn) => events[key] = fn};
        global.document = {getElementById : () => null, addEventListener() {}};
        global.requestAnimationFrame = fn => {
          frames.set(1, fn);
          return 1;
        };
        global.cancelAnimationFrame = id => frames.delete(id);
        const {studio} = make();
        studio.root.addEventListener = () => {};
        studio.renderShell = studio.bootstrap = () => {};
        studio.initialize();
        const cell = model.allCenters(doc)[0];
        const changed = model.updateCenter(doc, cell.id, {field : .314159});
        studio.handleDrag = {held : 'sense', last : {x : 20, y : 30}};
        studio.pointer = {kind : 'organ', moved : true};
        studio.draftDesign(changed, 'interrupted');
        assert.equal(frames.size, 1);
        events[interrupted]({clientX : 0, clientY : 0});
        assert.equal(studio.state.document, changed, interrupted + ' retains the visible value');
        assert.equal(studio.handleDrag, null);
        assert.equal(studio.pointer, null);
        assert.equal(studio.drafted, null);
        assert.equal(frames.size, 0, 'No delayed redraw remains after interruption');
        assert.equal(studio.undoHistory.length, 1);
        events.pointermove({clientX : 300, clientY : 400});
        assert.equal(studio.state.document, changed, 'Later pointer motion does not edit the fish');
      }
    } finally {
      Object.assign(global, saved);
    }
  }

  const gut = doc.organs.find(o => o.type === 'gut');
  const anatomy = {senseProbe : model.allCenters(doc).map(() => 1)};
  for (const alreadyShown of [false, true]) {
    const {studio, hits} = make();
    if (alreadyShown)
      studio.shownDesign = doc;
    studio.pendingTrace = {organ : gut.id, after : 0};
    studio.showAnatomy(anatomy, 1);
    assert.equal(hits.scene, 1, 'An answered probe redraws its scene once');
    assert.equal(hits.inspector, 1, 'An answered probe redraws its inspector once');
    assert.equal(studio.pendingTrace, null);
    assert.ok(studio.state.stimulus.starts.length);
  }
  {
    const {studio, hits} = make(), blocks = [];
    studio.redrawBlocks = key => blocks.push(key);
    studio.showAnatomy(anatomy, 1);
    assert.equal(hits.scene, 1);
    assert.deepEqual(
        blocks, [ 'hormoneTime', 'organSettings' ],
        'An anatomy answer updates parent graphics without immediately rebuilding their children');
    blocks.length = 0;
    studio.showAnatomy(anatomy, 2);
    assert.equal(hits.scene, 1, 'A probe-only answer keeps the existing fish scene');
    assert.deepEqual(blocks, [ 'visionOrgan', 'nearAnswers', 'gutProbeControls' ]);
  }
  {
    const {studio, hits} = make();
    const saved = {
      requestAnimationFrame : global.requestAnimationFrame,
      cancelAnimationFrame : global.cancelAnimationFrame
    };
    global.requestAnimationFrame = () => 1;
    global.cancelAnimationFrame = () => {};
    const classes = (...names) => {
      const set = new Set(names);
      set.remove = name => set.delete(name);
      set.contains = name => set.has(name);
      set.toggle = (name, on) => on ? set.add(name) : set.delete(name);
      return set;
    };
    const marked = {
      classList : classes('aid-node', 'aid-pulse-fired', 'aid-move-tail', 'aid-focus-near')
    };
    const element = () =>
        ({setAttribute() {}, appendChild() {}, remove() {}, style : {setProperty() {}}});
    const svg = {
      ...element(),
      classList : classes('aid-focus-view'),
      isConnected : true,
      ownerDocument : {createElementNS : element},
      getScreenCTM : () => ({a : 1, b : 0}),
      querySelectorAll : selector => selector.startsWith('[class*=') ? [ marked ] : []
    };
    studio.bodyMap = () => svg;
    try {
      const source = model.allCenters(doc)[0].id;
      studio.stimulate([ source ]);
      studio.stimulate([ source ]);
      assert.equal(hits.scene, 0, 'Repeated manual impulses keep the existing fish scene');
      assert.equal(hits.inspector, 0, 'The inspector does not change with a manual impulse');
      assert.deepEqual([...marked.classList ], [ 'aid-node' ],
                       'Previous pulse, movement and focus marks are cleared');
      assert.ok(svg.classList.contains('aid-stimulus-view'));
      assert.ok(!svg.classList.contains('aid-focus-view'));
      studio.stimulate([ source ], true);
      assert.equal(hits.scene, 1, 'Newly measured anatomy rebuilds the scene');
      assert.equal(hits.inspector, 1, 'Newly measured anatomy refreshes the inspector');
    } finally {
      studio.stopPulse();
      Object.assign(global, saved);
    }
  }
}

async function checkInitialFish(model, capabilities, root) {
  const {execFileSync} = require('node:child_process');
  const {OrganStudio} = await import('../ui/studio/controller.js');
  const {newFishDocument} = await import('../ui/studio/canvas_placement.js');
  const {stationShell} = await import('../ui/studio/view/shell.js');
  const native = body => JSON.parse(execFileSync(
      'python3',
      [
        '-B', '-c',
        "import json,sys; from atelier_service import run; print(json.dumps(run(json.load(sys.stdin))))"
      ],
      {
        cwd : root,
        input : JSON.stringify(body),
        encoding : 'utf8',
        timeout : 30000,
        maxBuffer : 8 * 1024 * 1024
      }));
  const make = () => {
    const studio = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
    Object.assign(studio.state, {station : 'studio', sites : capabilities.sites, capabilities});
    const hits = {design : 0, save : 0, requests : []};
    for (const key of ['interruptPointer', 'release', 'setMode', 'zoom', 'refreshScene',
                       'refreshHeader', 'refreshTools', 'refreshToolLibrary', 'refreshInspector',
                       'showDrawnContacts', 'stopPulse', 'renderShell'])
      studio[key] = () => {};
    studio.persist = () => ++hits.save;
    studio.requestDesign = () => ++hits.design;
    studio.api = async body => {
      hits.requests.push(body);
      return native(body);
    };
    return {studio, hits};
  };
  const {studio, hits} = make();
  assert.match(stationShell({...studio.state, sites : []}), /data-action="new" disabled/);
  assert.doesNotMatch(stationShell(studio.state), /data-action="new" disabled/);
  for (let i = 0; i < 3; ++i) {
    studio.notice('Previous message');
    const previous = studio.state.document, history = studio.undoHistory.length;
    assert.equal(await studio.newFish(), true);
    assert.equal(studio.state.notice, '');
    assert.equal(studio.undoHistory.length, history + 1,
                 'One new fish is one undo step, including initial pressure placement');
    assert.equal(studio.undoHistory.at(-1), previous);
    const answer = native({
      operation : 'design',
      plan : model.compileDocument(studio.state.document, capabilities.sites)
    });
    assert.deepEqual(model.pressureMismatches(studio.state.document, answer.pressure), []);
    studio.state.anatomy = answer;
    const requests = hits.requests.length;
    await studio.checkPressure();
    assert.equal(hits.requests.length, requests,
                 'The first displayed anatomy requires no pressure relocation probes');
    assert.equal(studio.undoHistory.length, history + 1);
    assert.equal(studio.state.notice, '');
  }
  assert.equal(hits.save, 3, 'Only complete new fish reach draft persistence');
  assert.equal(hits.design, 3, 'Each completed new fish requests its displayed anatomy once');
  {
    const {studio} = make();
    studio.state.station = 'hub';
    const probe = studio.api;
    studio.api = async body => body.operation === 'sites'          ? capabilities
                               : body.operation === 'load-draft'   ? {document : null}
                               : body.operation === 'list-modules' ? {modules : []}
                                                                   : probe(body);
    await studio.bootstrap();
    const answer = native({
      operation : 'design',
      plan : model.compileDocument(studio.state.document, capabilities.sites)
    });
    assert.deepEqual(model.pressureMismatches(studio.state.document, answer.pressure), []);
    assert.equal(studio.undoHistory.length, 0, 'The initial fish is not an undo step');
    assert.equal(studio.state.notice, '');
  }
  const deferred = () => {
    const fixture = make(), pending = [];
    fixture.studio.api = body =>
        new Promise((resolve, reject) => pending.push({body, resolve, reject}));
    return {...fixture, pending};
  };
  const flush = async () => {
    for (let i = 0; i < 4; ++i)
      await Promise.resolve();
  };
  const finish = async (pending, task) => {
    while (pending.length) {
      const request = pending.shift();
      request.resolve(native(request.body));
      await flush();
    }
    return task;
  };
  {
    const {studio, pending} = deferred();
    const first = studio.newFish(), old = pending.shift(), second = studio.newFish();
    assert.equal(await finish(pending, second), true);
    const chosen = studio.state.document;
    old.resolve(native(old.body));
    assert.equal(await first, false);
    assert.equal(studio.state.document, chosen,
                 'An older new-fish answer cannot replace the newer one');
    assert.equal(studio.undoHistory.length, 1);
  }
  for (const action of ['edit', 'redo', 'load', 'leave']) {
    const {studio, pending} = deferred(), previous = studio.state.document;
    const task = studio.newFish();
    const savedDocument = global.document;
    try {
      if (action === 'edit' || action === 'redo') {
        studio.changeDocument({...previous, name : 'Edited'});
        studio.stepHistory('undo');
        assert.equal(studio.state.document, previous);
        if (action === 'redo')
          studio.stepHistory('redo');
      } else if (action === 'load') {
        studio.loadFish(model.newDocument('Loaded'));
      } else {
        global.document = {body : {dataset : {}}};
        studio.hub.close = studio.breeding.close = studio.trials.close = () => {};
        studio.navigate('hub');
        studio.navigate('studio');
      }
      const chosen = studio.state.document, history = studio.undoHistory.length;
      assert.equal(await finish(pending, task), false);
      assert.equal(studio.state.document, chosen, action + ' invalidates the pending new fish');
      assert.equal(studio.undoHistory.length, history);
    } finally {
      global.document = savedDocument;
    }
  }
  const answerBootstrap = async pending => {
    for (const request of pending.splice(0, 3))
      request.resolve(request.body.operation === 'sites'        ? capabilities
                      : request.body.operation === 'load-draft' ? {document : null}
                                                                : {modules : []});
    await flush();
  };
  for (const when of ['before-sites', 'early-new', 'during-design', 'edit', 'new']) {
    const {studio, pending} = deferred();
    studio.state.station = 'hub';
    studio.state.sites = [];
    const task = studio.bootstrap(), savedDocument = global.document;
    try {
      global.document = {body : {dataset : {}}};
      studio.hub.close = studio.breeding.close = studio.trials.close = () => {};
      if (when === 'before-sites' || when === 'early-new')
        studio.navigate('studio');
      if (when === 'early-new') {
        const request = studio.newFishRequest;
        assert.equal(await studio.newFish(), false);
        assert.equal(studio.newFishRequest, request,
                     'A click before sites arrive does not cancel initialization');
      }
      await answerBootstrap(pending);
      assert.equal(pending.length, 1, 'Bootstrap prepares the native initial body');
      if (when === 'during-design')
        studio.navigate('studio');
      if (when === 'edit') {
        studio.changeDocument(model.newDocument('Initial body superseded'));
        const chosen = studio.state.document;
        await finish(pending, task);
        assert.equal(studio.state.document, chosen);
      } else if (when === 'new') {
        const old = pending.shift(), newer = studio.newFish();
        assert.equal(await finish(pending, newer), true);
        const chosen = studio.state.document;
        old.resolve(native(old.body));
        await task;
        assert.equal(studio.state.document, chosen);
        assert.equal(studio.undoHistory.length, 1);
      } else {
        await finish(pending, task);
        assert.equal(studio.state.station, 'studio');
        assert.ok(studio.state.document.organs.some(o => o.type === 'gut'),
                  when + ': navigation must not leave an empty initial fish');
        const answer = native({
          operation : 'design',
          plan : model.compileDocument(studio.state.document, capabilities.sites)
        });
        assert.deepEqual(model.pressureMismatches(studio.state.document, answer.pressure), []);
        assert.equal(studio.undoHistory.length, 0);
      }
    } finally {
      global.document = savedDocument;
    }
  }
  {
    const {studio, pending} = deferred();
    const task = studio.bootstrap();
    studio.loadFish(model.newDocument('Loaded during startup'));
    const chosen = studio.state.document;
    await answerBootstrap(pending);
    await task;
    assert.equal(studio.state.document, chosen);
    assert.equal(pending.length, 0, 'A loaded document supersedes initial-body preparation');
  }
  {
    const {studio, pending} = deferred(), previous = studio.state.document;
    const task = studio.newFish();
    pending.shift().reject(Error('Native design failed'));
    assert.equal(await task, false);
    assert.equal(studio.state.document, previous);
    assert.equal(studio.state.notice, 'Native design failed');
    assert.equal(studio.undoHistory.length, 0);
  }
  {
    const {studio} = make(), previous = studio.state.document;
    const body = {
      operation : 'design',
      plan : model.compileDocument(newFishDocument('Unsettled', capabilities.sites),
                                   capabilities.sites)
    };
    const wrong = native(body);
    assert.ok(
        model.pressureMismatches(newFishDocument('Unsettled', capabilities.sites), wrong.pressure)
            .length);
    let requests = 0;
    studio.api = async () => {
      ++requests;
      return wrong;
    };
    assert.equal(await studio.newFish(), false);
    assert.ok(requests > 1 && requests <= 37,
              'Failed initial placement has a bounded probe budget');
    assert.equal(studio.state.document, previous);
    assert.ok(studio.state.notice.includes('Druckfühler'));
    assert.equal(studio.undoHistory.length, 0);
  }
}

async function checkAutosave(model) {
  const {OrganStudio} = await import('../ui/studio/controller.js');
  const saved = {setTimeout : global.setTimeout, clearTimeout : global.clearTimeout};
  let now = 0, next = 0;
  const timers = new Map();
  global.setTimeout = (callback, delay) => {
    timers.set(++next, {callback, at : now + delay});
    return next;
  };
  global.clearTimeout = id => timers.delete(id);
  const flush = async () => {
    for (let i = 0; i < 6; ++i)
      await Promise.resolve();
  };
  const advance = async delay => {
    const until = now + delay;
    for (;;) {
      const due = [...timers ]
                      .filter(([, timer ]) => timer.at <= until)
                      .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due)
        break;
      const [id, timer] = due;
      timers.delete(id);
      now = timer.at;
      timer.callback();
      await flush();
    }
    now = until;
  };
  const make = () => {
    const studio = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
    const requests = [];
    let active = 0, maximum = 0, stored = null;
    studio.api = body => new Promise((resolve, reject) => {
      assert.equal(body.operation, 'save-draft');
      maximum = Math.max(maximum, ++active);
      requests.push({
        document : body.document,
        resolve() {
          --active;
          stored = body.document;
          resolve({});
        },
        reject(message) {
          --active;
          reject(Error(message));
        }
      });
    });
    const edit = name => {
      studio.state.document = model.newDocument(name);
      studio.persist();
      return studio.state.document;
    };
    return {studio, requests, edit, stored : () => stored, maximum : () => maximum};
  };
  try {
    {
      const {requests, edit, stored, maximum} = make();
      edit('First');
      await advance(399);
      assert.equal(requests.length, 0, 'Autosave still waits 400 ms');
      await advance(1);
      assert.equal(requests.length, 1);
      edit('Intermediate');
      await advance(400);
      assert.equal(requests.length, 1, 'A slow first write cannot overlap a second write');
      const latest = edit('Latest');
      await advance(400);
      assert.equal(requests.length, 1);
      requests[0].resolve();
      await flush();
      assert.deepEqual(requests.map(r => r.document.name), [ 'First', 'Latest' ],
                       'Only the latest due document follows a slow write');
      requests[1].resolve();
      await flush();
      assert.equal(stored(), latest, 'The last completed write contains the newest document');
      assert.equal(maximum(), 1);
    }
    {
      const {requests, edit} = make();
      edit('Before pause');
      await advance(250);
      edit('After pause');
      await advance(399);
      assert.equal(requests.length, 0, 'Every edit restarts the debounce period');
      await advance(1);
      assert.deepEqual(requests.map(r => r.document.name), [ 'After pause' ]);
      edit('Not due yet');
      await advance(200);
      requests[0].resolve();
      await flush();
      assert.equal(requests.length, 1, 'Finishing a write cannot bypass the next debounce');
      await advance(200);
      assert.equal(requests.length, 2);
      requests[1].resolve();
      await flush();
    }
    {
      const {studio, requests, edit, stored, maximum} = make();
      edit('Old fish');
      await advance(400);
      edit('New fish');
      studio.notice('Current fish notice');
      await advance(400);
      requests[0].reject('Obsolete failure');
      await flush();
      assert.equal(studio.state.notice, 'Current fish notice',
                   'An old save failure cannot overwrite the newer fish notice');
      assert.deepEqual(requests.map(r => r.document.name), [ 'Old fish', 'New fish' ]);
      requests[1].reject('Current failure');
      await flush();
      assert.equal(studio.state.notice, 'Current failure', 'A current save failure is visible');
      const retry = edit('Retry after failure');
      await advance(400);
      assert.equal(requests.length, 3, 'A failure cannot strand later saves');
      requests[2].resolve();
      await flush();
      assert.equal(stored(), retry);
      assert.equal(maximum(), 1);
    }
    {
      const {studio, requests, edit} = make();
      const original = edit('Before undo');
      await advance(400);
      edit('Edited');
      studio.state.document = original;
      studio.persist();
      studio.notice('Undo notice');
      requests[0].reject('Old failure of same document');
      await flush();
      assert.equal(studio.state.notice, 'Undo notice',
                   'Returning to the same document does not revive an obsolete save error');
      await advance(400);
      assert.equal(requests.length, 2);
      assert.equal(requests[1].document, original);
      requests[1].resolve();
      await flush();
    }
    assert.equal(timers.size, 0);
  } finally {
    Object.assign(global, saved);
  }
}
