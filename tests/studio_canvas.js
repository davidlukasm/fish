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
        JSON.parse(readFileSync(join(root, 'genomes/handbau', name + '.fish.json'), 'utf8'));
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
    refreshSwitches() {}
  };
  const anchor = {x : 320, y : 250}, beforeZoom = {...zoomed.state.camera};
  gestureMethods.zoom.call(zoomed, 1.65, anchor);
  assert.equal(zoomed.state.camera.zoom, 1.65, 'Zoom accepts continuous wheel movement');
  for (const axis of ['x', 'y'])
    assert.ok(Math.abs((anchor[axis] - beforeZoom[axis]) * beforeZoom.zoom -
                       (anchor[axis] - zoomed.state.camera[axis]) * zoomed.state.camera.zoom) <
                  1e-8,
              'The point under the pointer remains fixed while zooming');
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
    getTotalLength : () => to - from,
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
};
