// Organ-first atelier: engine anatomical sites, real compiler plans and UI gestures.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {join, posix} = require('node:path');

// Semantic guard for engine and aquarium drawing code that the organ editor interprets.
// Comments and formatting are ignored. A changed signature requires reviewing the
// corresponding Studio organ, control, and verification before updating this record.
const ENGINE_REVIEW = Object.freeze({
  "src/eye_geometry.cc" : "c737396888e57434",
  "src/environment_parameters.hh" : "dd47655923c93bfd",
  "ui/brain_geometry.js" : "f26424cb0249af00",
  "ui/vision_view.js" : "dcac2dd90cf6fe93",
  "colony-core/field/development_sites.hh" : "041de8ae566108bd",
  "colony-core/field/development.cc" : "76109c6edc7cf1ce",
  "colony-core/field/functions.hh" : "7b6a6d591c1b6cda",
  "colony-core/field/hormones.hh" : "e0f1f91f7fdfa4b4",
  "colony-core/field/substrate.cc" : "65d936007d8d682b",
  "src/body_plan.cc" : "9cd46bde72d92824",
  "src/physiology_parameters.hh" : "bfe29124ecf309db",
  "src/physiology.hh" : "e7cbd2adc01aa908",
  "src/physiology.cc" : "fea2c274a8c6b138",
  "src/hormone_state.hh" : "48078a32aa49f7d1",
  "src/hormone_state.cc" : "5ce4ffda53f8995f",
  "src/physiology_parameters.cc" : "122649c0c5cf70ad",
  "colony-core/ann/network.hh" : "f1651ace691918ea",
  "colony-core/ann/network.cc" : "f18fc5321a480ca7",
  "src/body_plan.hh" : "63f5c58ed9da5790",
  "src/receptor_tuning.hh" : "c77a0a412d814cb7",
  "colony-core/field/substrate.hh" : "4ae160f2df61fe2f",
  "colony-core/cppn/output_schema.hh" : "c103e6a2a3ebd358",
  "colony-core/cppn/constants.hh" : "7597f904c57f19ab",
  "colony-core/cppn/node.hh" : "fb30c5d1fe1a0719",
  "colony-core/evolution/gene.hh" : "4468c1d0669fa3f4",
  "colony-core/evolution/constants.hh" : "b54fbe848250fbe0",
  "werkzeug/fischbau.cc" : "3091a0f06b01a979",
  "ui/tissue.js" : "01cae94d3e8df2d6",
  "src/genome.hh" : "2dbc512c2a13ffe1",
  "src/hormone_view.cc" : "be839e6e115f3ea1",
  "src/hormone_view.hh" : "1515941132943782",
  "src/simulation_types.hh" : "b19320e4446f4b42",
  "src/retina.cc" : "7872c03eef689ac0",
  "src/observations.cc" : "bf8face7a41ea741",
  "src/observations.hh" : "f6f4936f693e510e",
  "src/eye_geometry.hh" : "651dfb791f0d8f1c",
  "src/retina.hh" : "2699500b47122562",
  "ui/fish_forms.js" : "03122fe37bb8b553",
  "ui/fish_geometry.js" : "9e95f7f314d86a90",
  "ui/fish_fins.js" : "7f0604d4797cdd0f",
  "ui/fish_organs.js" : "300d9bc24693b256",
  "ui/fish_painter.js" : "8a55c784199f5207",
  "src/brain_interface.hh" : "338ddb60bbfdfa1d",
  "src/hormone_analysis.cc" : "bb5d83c0e5d6ac53",
  "src/hormone_analysis.hh" : "286fa7455ea124e0",
  "src/hormone_observations.cc" : "26724d854cb42eae",
  "src/hormone_observations.hh" : "32b75ba46d018348",
  "src/interactive_brain.cc" : "0f891df62a0bd083",
  "src/material.hh" : "ba494c049c6d5376",
  "src/motor_state.hh" : "6642af5a79a83847",
  "src/visible_body.hh" : "e0b989f5b403d44a",
  "src/body_state_limits.hh" : "607381fbc86a14a5"
});
function semanticFingerprint(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/\s+/g, '');
  let hash = 0xcbf29ce484222325n;
  for (const char of text) {
    hash ^= BigInt(char.codePointAt(0));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

(async () => {
  const root = join(__dirname, '..');
  for (const [path, expected] of Object.entries(ENGINE_REVIEW)) {
    const actual = semanticFingerprint(readFileSync(join(root, path), 'utf8'));
    assert.equal(actual, expected,
                 'Engine/Viewer changed: ' + path +
                     '. Review organ editor and update ENGINE_REVIEW.');
  }
  const {
    ANATOMY,
    CPPN_OUTPUT,
    DEVELOPMENT,
    HORMONE_EFFECT,
    HORMONES,
    MOTOR_KIND,
    SENSE_KIND,
    TUNING
  } = await import('../ui/schema.js');
  const {ORGANS, MUSCLES, eligible, functionFor} = await import('../ui/studio/model/organs.js');
  const {t, useTexts} = await import('../ui/strings.js');
  useTexts(
      {default : 'de'},
      {de : {studio : JSON.parse(readFileSync(join(root, 'ui/text/de/studio.json'), 'utf8'))}});
  const model = await import('../ui/studio/model/document.js');
  const views = await import('../ui/studio/view/scene.js');
  const panels = await import('../ui/studio/view/panels.js');
  const graph = await import('../ui/studio/view/graph.js');
  const pulse = await import('../ui/studio/view/pulse.js');
  const {OrganStudio, initializeStudio} = await import('../ui/studio/controller.js');
  const sitesResult =
      JSON.parse(execFileSync(join(resolve(process.env.BUILD_DIR ?? join(root, 'bin')), 'atelier'),
                              [ 'sites' ], {encoding : 'utf8', timeout : 10000}));
  // SVG geometry is evaluated at construction, never per animation frame.
  let geometryCalls = 0;
  const samples = pulse.sampleSignalPath({
    getTotalLength : () => 100,
    getPointAtLength : progress => {
      ++geometryCalls;
      return {x : progress, y : 2 * progress};
    }
  });
  assert.equal(geometryCalls, 33);
  assert.deepEqual(pulse.signalPoint(samples, .5), {x : 50, y : 100});
  assert.deepEqual(pulse.signalPoint(samples, 1), {x : 100, y : 200});
  assert.deepEqual(pulse.signalPoint(samples, -1), {x : 0, y : 0});
  const queried = [];
  pulse.createSignalPlayer(
      {
        ownerDocument :
            {createElementNS : () => ({setAttribute : () => {}, appendChild : () => {}})},
        querySelector : selector => {
          queried.push(selector);
          return null;
        }
      },
      [ {id : 'test-center'} ],
      [ {id : '0:1', kind : 'contact', from : 'test-center', to : 'test-center', strength : 1} ],
      [ [ 1 ] ]);
  assert.ok(queried.some(selector => selector.includes('[data-contact="0:1"]')));
  const realLinks = pulse.displayedContacts(
      {querySelectorAll : () => [{dataset : {contact : '0:1'}}]}, [ {id : 'from'}, {id : 'to'} ],
      {contacts : [ [ 0, 1, 4, -.2, 1, 3, .4, -.4 ], [ 1, 0, 4, .3, 4, 0, .3, 0 ] ]});
  assert.equal(realLinks.length, 2);
  assert.equal(realLinks[0].count, 1);
  assert.equal(realLinks[1].count, 3);
  assert.deepEqual(pulse.interpolateFrame([ [ 1, 0 ], [ -1, 2 ] ], .25), [ .5, .5 ]);
  assert.deepEqual(pulse.interpolateFrame([ [ 1, 0 ], [ -1, 2 ] ], 2), [ -1, 2 ]);
  assert.deepEqual(
      realLinks.map(link => [link.id, link.from, link.to, link.sign, link.channel]),
      [ [ '0:1', 'from', 'to', 1, 'excite' ], [ '0:1', 'from', 'to', -1, 'inhibit' ] ]);
  // The playback samples only real stimulus-bearing connections, even in a dense network.
  let sampled = 0;
  let circles = 0;
  const fakeDocument = {
    createElementNS : (_, kind) => {
      if (kind === 'circle')
        ++circles;
      return {setAttribute() {}, style : {}, appendChild() {}};
    }
  };
  const fakeSvg = {
    ownerDocument : fakeDocument,
    querySelector : () => ({
      getTotalLength : () => 100,
      getPointAtLength : value => {
        ++sampled;
        return {x : value, y : 0};
      }
    })
  };
  pulse.createSignalPlayer(fakeSvg, [ {id : "active"}, {id : "receiver"}, {id : "silent"} ],
                           [
                             {id : "on", from : "active", to : "receiver", strength : 1, count : 7},
                             {id : "off", from : "silent", to : "receiver", strength : 1}
                           ],
                           [ [ 1, 0, 0 ], [ .3, 0, 0 ] ]);
  assert.equal(sampled, 33);
  assert.equal(circles, 3);
  // Sparse stimulation leaves silent groups untouched and limits SVG updates to 30 Hz.
  const oldFrame = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  const scheduled = [];
  const changes = {node : 0, path : 0, dots : 0, positions : 0, silent : 0};
  const trackedStyle = key => ({
    set opacity(value) {
      ++changes[key];
      this.value = value;
    },
    removeProperty() {}
  });
  const activeNode = {style : trackedStyle('node'), classList : {toggle() {}, remove() {}}};
  const activePath = {
    style : trackedStyle('path'),
    getTotalLength : () => 120,
    getPointAtLength : x => ({x, y : x / 2})
  };
  const animatedSvg = {
    ownerDocument : {
      createElementNS : (_, kind) => ({
        isConnected : false,
        style : {},
        setAttribute(attribute) {
          if (kind === 'circle' && attribute === 'opacity')
            ++changes.dots;
          if (kind === 'circle' && (attribute === 'cx' || attribute === 'cy'))
            ++changes.positions;
        },
        appendChild() {},
        remove() { this.isConnected = false; }
      })
    },
    querySelector(selector) {
      if (selector.includes('silent')) {
        ++changes.silent;
        return null;
      }
      return selector.includes('data-center') ? activeNode : activePath;
    },
    appendChild(item) { item.isConnected = true; }
  };
  try {
    globalThis.requestAnimationFrame = callback => {
      scheduled.push(callback);
      return scheduled.length;
    };
    globalThis.cancelAnimationFrame = () => {};
    const player = pulse.createSignalPlayer(
        animatedSvg, [ {id : 'active'}, {id : 'silent'} ],
        [ {id : 'connection', from : 'active', to : 'silent', strength : 1} ],
        [ [ 1, 0 ], [ 1, 0 ], [ 1, 0 ] ]);
    player.start();
    for (const time of [0, 15, 40, 55, 85]) {
      const frame = scheduled.shift();
      assert.ok(frame);
      frame(time);
    }
    assert.equal(changes.silent, 0);
    assert.equal(changes.node, 1);
    assert.equal(changes.path, 1);
    assert.equal(changes.dots, 2);
    // The signal moves on in every display frame (x and y of its one dot in five frames).
    assert.equal(changes.positions, 10);
    player.stop();
  } finally {
    globalThis.requestAnimationFrame = oldFrame;
    globalThis.cancelAnimationFrame = oldCancel;
  }
  const geometry = {
    ...await import('../ui/studio/model/layout.js'),
    ...await import('../ui/studio/view/frame.js')
  };
  assert.equal(geometry.cameraBox({zoom : .4, x : 560, y : 365}).width, 2500);
  // Panning follows SVG's actual letterboxed area, including narrow or short canvases.
  const camera = {zoom : 2, x : 560, y : 365};
  const cameraBox = geometry.cameraBox(camera);
  const shortViewport = {width : 1200, height : 480};
  const scale = geometry.cameraScale(shortViewport, camera);
  assert.equal(scale, Math.min(shortViewport.width / cameraBox.width,
                               shortViewport.height / cameraBox.height));
  assert.ok(Math.abs(120 / scale - 77.5) < .01);
  assert.ok(geometry.CAMERA_ZOOM.min < 1 && geometry.CAMERA_ZOOM.max > 1);
  assert.equal(geometry.cameraScale({width : 480, height : 1200}, camera), 480 / cameraBox.width);
  assert.ok(Number.isFinite(sitesResult.pigmentHalf) && sitesResult.pigmentHalf > 0);
  const sites = sitesResult.sites;
  const retina = await import('../ui/studio/model/retina.js');
  const vision = await import('../ui/studio/view/vision.js');
  (await import('../ui/brain.js')).initialize([ 'brainClamp' ]);
  const E = HORMONE_EFFECT;
  assert.deepEqual(sitesResult.roleEffects, [
    [ E.output, E.death ], Object.values(E).sort((a, b) => a - b),
    [ E.excitation, E.output, E.death ]
  ]);
  assert.equal(retina.receptorWidth(0), 4);
  assert.ok(Math.abs(retina.receptorWidth(1) - 117) < 1e-8);
  assert.deepEqual(ORGANS.filter(o => ['mouth', 'fin', 'tail'].includes(o.key)), []);
  for (const definition of ORGANS.filter(o => !o.fixed)) {
    const site = sites.find(s => eligible(definition.centers[0], s));
    const added =
        model.addOrgan(model.newDocument('Organ'), definition.key, sites, geometry.sitePoint(site));
    assert.ok(added, definition.key);
    assert.doesNotThrow(() => model.compileDocument(added.document, sites));
  }
  // Brain regions sit on both sides with their own circuit: the spinal cord's rhythm cells drive
  // their side's inhibitory cells, which silence the other side's rhythm.
  {
    const {defaultPairing} = await import('../ui/studio/model/organs.js');
    const site = sites.find(s => s.zone === 2 && !s.outer);
    const spinal =
        model.addOrgan(model.newDocument('Regionen'), 'spinal', sites, geometry.sitePoint(site));
    assert.ok(spinal, 'The spinal cord can be placed');
    const left = model.findOrgan(spinal.document, spinal.organId),
          right = model.findOrgan(spinal.document, left.pair);
    assert.ok(right && right.side === -left.side);
    // Its plan beats each side and holds the other side down; steering drives the beat.
    const regions = await import('../ui/studio/model/regions.js');
    assert.deepEqual(left.centers.map(c => c.node), [ 'beat', 'cross', 'steer' ]);
    assert.equal(spinal.document.wires.length, 0, 'The plan needs no wires of its own');
    const node = (organ, key) => organ.centers.find(c => c.node === key).id;
    const inner = regions.routedLinks(spinal.document, sites).map(l => l.from + '>' + l.to);
    for (const a of [left, right])
      assert.ok(inner.includes(node(a, 'beat') + '>' + node(a, 'cross')) &&
                inner.includes(node(a, 'steer') + '>' + node(a, 'beat')));
    assert.ok(inner.includes(node(left, 'cross') + '>' + node(right, 'beat')) &&
              inner.includes(node(right, 'cross') + '>' + node(left, 'beat')));
    const faster = regions.updateRegion(spinal.document, spinal.organId, {beat : 2}, sites);
    assert.ok(model.findOrgan(faster, spinal.organId).centers[0].tau < left.centers[0].tau,
              'A faster beat shortens the rhythm');
    const allCentersOf = doc => model.allCenters(doc).length;
    const regionPlan = model.compileDocument(spinal.document, sites);
    assert.equal(regionPlan.groups.length, 6);
    // The olfactory bulb gathers its side's nose and, comparing, holds the other side's output
    // down.
    const nosed = model.addOrgan(model.newDocument('Riechen'), 'nose', sites, {x : 185, y : 318});
    const bulbSite = sites.find(s => s.zone === 1 && !s.outer && s.w > 0);
    const bulb = model.addOrgan(nosed.document, 'olfactory', sites, geometry.sitePoint(bulbSite));
    assert.ok(bulb, 'The olfactory bulb can be placed');
    const smelling = model.connectSelections(bulb.document, {kind : 'organ', id : nosed.organId},
                                             {kind : 'organ', id : bulb.organId});
    const bulbLeft = model.findOrgan(smelling.document, bulb.organId),
          bulbRight = model.findOrgan(smelling.document, bulbLeft.pair);
    const smellLinks = regions.routedLinks(smelling.document, sites);
    const bulbNode = (organ, key) => organ.centers.find(c => c.node === key).id;
    assert.ok(
        smellLinks.some(l => l.from === nosed.organId && l.to === bulbNode(bulbLeft, 'gather')));
    assert.ok(smellLinks.some(l => l.from === bulbNode(bulbLeft, 'compare') &&
                                   l.to === bulbNode(bulbRight, 'out')));
    // The hindbrain's command fires past its threshold and holds the other side's down.
    const hind = model.addOrgan(model.newDocument('Flucht'), 'hindbrain', sites,
                                geometry.sitePoint(bulbSite));
    const hindLeft = model.findOrgan(hind.document, hind.organId),
          hindRight = model.findOrgan(hind.document, hindLeft.pair);
    assert.deepEqual(hindLeft.centers.map(c => c.node), [ 'alarm', 'command', 'cross' ]);
    assert.ok(regions.routedLinks(hind.document, sites)
                  .some(l => l.from === bulbNode(hindLeft, 'cross') &&
                             l.to === bulbNode(hindRight, 'command')));
    const touchy = regions.updateRegion(hind.document, hind.organId, {threshold : 0}, sites);
    assert.ok(bulbNode(hindLeft, 'command') &&
              model.findCenter(touchy, bulbNode(hindLeft, 'command')).center.threshold <
                  model.findCenter(hind.document, bulbNode(hindLeft, 'command')).center.threshold);
    // Every region can be placed, grows its plan and compiles; a paired one on both sides.
    for (const region of ORGANS.filter(o => o.category === 'regions')) {
      const home = sites.find(s => !s.outer && s.w > 0 && region.centers[0].zones.includes(s.zone));
      const placed = model.addOrgan(model.newDocument(region.key), region.key, sites,
                                    geometry.sitePoint(home));
      assert.ok(placed, region.key + ' can be placed');
      const organ = model.findOrgan(placed.document, placed.organId);
      assert.ok(organ.centers.length >= 2 && organ.centers.every(c => c.node), region.key);
      assert.equal(!!organ.pair, region.scope === 'side', region.key + ' pairs as it should');
      assert.ok(model.compileDocument(placed.document, sites).groups.length >=
                organ.centers.length);
    }
    assert.equal(defaultPairing('eye', 'tectum'), 'crossed');
    assert.equal(defaultPairing('eye', 'olfactory'), 'same');
    // An eye wired to the optic tectum crosses the midline: each eye feeds the far tectum.
    let wired = model.addOrgan(spinal.document, 'eye', sites, {x : 345, y : 290}).document;
    const tectumSite = sites.find(s => s.zone === 1 && !s.outer);
    const tectum = model.addOrgan(wired, 'tectum', sites, geometry.sitePoint(tectumSite));
    assert.ok(tectum, 'The optic tectum can be placed');
    wired = tectum.document;
    const eyeOrgan = wired.organs.find(o => o.type === 'eye');
    const connected = model.connectSelections(wired, {kind : 'organ', id : eyeOrgan.id},
                                              {kind : 'organ', id : tectum.organId});
    assert.ok(connected);
    assert.equal(connected.document.wires.at(-1).pairing, 'crossed');
    const tectumLeft = model.findOrgan(connected.document, tectum.organId);
    const far = model.expandedWires(connected.document).filter(l => l.wire.id === connected.wireId);
    assert.equal(far.length, 2);
    assert.ok(far.every(l => model.findOrgan(connected.document, l.from).side !==
                             model.findOrgan(connected.document, l.to).side),
              'Optic wires cross');
    assert.ok(tectumLeft);
    // The tectum takes the eye as a whole and spreads it over its map: each light cell reaches
    // the map node of its direction on the far side, the map its output, the contrast cells the
    // map; its nodes follow its settings.
    const retina = await import('../ui/studio/model/retina.js');
    const settled = regions.settleRegions(connected.document, sites);
    const routed = regions.routedLinks(settled, sites);
    const mapNodes =
        model.findOrgan(settled, tectum.organId).centers.filter(c => c.node.startsWith('map'));
    assert.equal(mapNodes.length, 3);
    assert.ok(tectumLeft.centers.some(c => c.node === 'out') &&
              tectumLeft.centers.some(c => c.node === 'inhibit'));
    for (const link of routed.filter(l => mapNodes.some(c => c.id === l.to) && !l.wire.inner)) {
      const cell = model.findCenter(settled, link.from);
      const map = model.findCenter(settled, link.to).center;
      const angle = retina.bearing(sites.find(s => s.id === cell.center.site));
      assert.ok(cell.organ.type === 'eye' && cell.organ.side !== tectumLeft.side);
      assert.ok(angle >= map.band[0] - 1e-9 && angle <= map.band[1] + 1e-9,
                'A light cell reaches the map node of its direction');
    }
    assert.ok(mapNodes.every(c => routed.some(l => l.from === c.id && l.to.endsWith(':out'))));
    const finer = regions.updateRegion(connected.document, tectum.organId, {resolution : 5}, sites);
    assert.equal(model.findOrgan(finer, tectum.organId).centers.filter(c => c.band).length, 5);
    assert.equal(model.findOrgan(finer, tectumLeft.pair).centers.filter(c => c.band).length, 5,
                 'Both tecta take the setting');
    assert.ok(finer.wires.some(w => w.id === connected.wireId), 'The optic wire stays');
    const slots = regions.regionSlots(connected.document, tectumLeft);
    assert.deepEqual(slots.map(slot => [slot.key, slot.filled.length > 0]),
                     [ [ 'sight', true ], [ 'near', false ], [ 'onward', false ] ]);
    const plan = model.compileDocument(connected.document, sites);
    assert.equal(plan.groups.length, allCentersOf(connected.document));
    // Drawn to the far tectum, an optic wire still crosses: the guidance holds for body sides.
    const twin = model.findOrgan(wired, tectumLeft.pair);
    const across = model.addWire(wired, eyeOrgan.id, twin.centers[0].id);
    assert.equal(across.document.wires.at(-1).pairing, 'crossed');
    const sideOf = id =>
        (model.findOrgan(across.document, id) ?? model.findCenter(across.document, id).organ).side <
        0;
    assert.ok(model.expandedWires(across.document)
                  .filter(l => l.wire.id === across.wireId)
                  .every(l => sideOf(l.from) !== sideOf(l.to)),
              'Optic wires cross whichever twin they were drawn to');
    // A wire between twin tecta joins the sides as drawn, never a tectum to itself.
    const commissure = model.addWire(wired, tectumLeft.centers[0].id, twin.centers[0].id);
    assert.ok(commissure);
    assert.ok(model.expandedWires(commissure.document).every(l => l.from !== l.to));
    // A wire whose connections are already made is refused: drawn to the far tectum with the
    // same guidance, the optic wire repeats the one drawn to the near tectum.
    const opticDoc = connected.document;
    assert.equal(model.addWire(opticDoc, eyeOrgan.id, twin.id), null);
    // A built-in module wires its organs as a whole.
    const steering =
        model.placeModule(model.newDocument('Modul'), 'vision-steering', sites, {x : 345, y : 290});
    assert.ok(steering);
    // Every built-in module can be placed, on both sides.
    for (const {key} of (await import('../ui/studio/model/organs.js')).MODULES) {
      const placed = model.placeModule(model.newDocument(key), key, sites, {x : 345, y : 290});
      assert.ok(placed, key + ' can be placed');
      assert.ok(!model.oneSided(placed.document, sites, placed.document.assemblies[0]), key);
    }
    // A built-in module comes on both sides.
    assert.ok(!model.oneSided(steering.document, sites, steering.document.assemblies[0]));
    assert.equal(steering.document.assemblies.length, 1);
    assert.ok(steering.document.wires.every(w => model.findOrgan(steering.document, w.from) &&
                                                 model.findOrgan(steering.document, w.to)));
    assert.ok(steering.document.organs.some(o => o.type === 'tectum'),
              'Seeing and steering runs through the optic tectum');
    // Either tectum's circuit shows the optic wires crossing and their side guidance.
    for (const id of [tectum.organId, tectumLeft.pair]) {
      const circuit = panels.inspector({
        document : connected.document,
        sites,
        capabilities : sitesResult,
        selected : {kind : 'organ', id},
        multi : new Set(),
        camera : {zoom : 1, x : 560, y : 365},
        tool : 'select',
        stale : true,
        wireScope : 'all',
        contactView : 'design'
      });
      assert.match(circuit, /aid-circuit-link crossing/);
      assert.match(circuit, /data-wire-pairing=/);
    }
  }
  let doc = model.newDocument('Atelier-Test');
  const eye = model.addOrgan(doc, 'eye', sites, {x : 345, y : 290});
  assert.ok(eye);
  doc = eye.document;
  let left = model.findOrgan(doc, eye.organId), right = model.findOrgan(doc, left.pair);
  assert.ok(left.linked && right.linked && right.pair === left.id);
  assert.ok(left.centers.length > 1, 'An eye automatically covers multiple retinal sites');
  assert.equal(left.centers.length, right.centers.length);
  assert.equal(doc.organs.filter(o => o.type === 'eye').length, 2);
  assert.equal(model.addOrgan(doc, 'eye', sites, {x : 345, y : 290}).document.organs.length,
               doc.organs.length);
  assert.equal(model.addOrgan(doc, 'eye', sites, {x : 1400, y : 290}, geometry.SNAP_DISTANCE),
               null);
  const id = left.id, pair = right.id;
  const retinaIds = left.centers.map(c => c.id);
  doc = model.updateField(doc, id, {density : 8}, sites);
  assert.deepEqual(model.findOrgan(doc, id).centers.map(c => c.id), retinaIds);
  assert.ok(model.findOrgan(doc, pair).centers.every(c => c.copies === 8));
  const width = model.findOrgan(doc, id).field.resolution;
  assert.equal(model.findOrgan(doc, pair).field.resolution, width,
               'Density does not change field width');
  doc = model.linkPair(doc, id);
  doc = model.updateField(doc, id, {density : 6}, sites);
  assert.equal(model.findOrgan(doc, pair).field.density, 8);
  doc = model.linkPair(doc, id);
  assert.equal(model.findOrgan(doc, id).field.density, 6, 'Relinking preserves asymmetry');
  assert.equal(model.findOrgan(doc, pair).field.density, 8);
  doc = model.updateField(doc, id, {density : 7}, sites);
  assert.equal(model.findOrgan(doc, pair).field.density, 9,
               'Linked adjustments preserve the difference');
  doc = model.updateField(doc, id, {density : 3, lo : 10, hi : 90}, sites);
  const profile = model.findOrgan(doc, id).field.profiles[0].id;
  doc = model.updateField(
      doc, id, {profile : {id : profile, q1 : -1, qwidth : .08, q2 : -1, threshold : -.8}}, sites);
  const relay = model.addNeuron(doc, 'relay', sites, {x : 500, y : 365});
  assert.ok(relay);
  doc = relay.document;
  const muscle = model.addOrgan(doc, 'muscle', sites, {x : 620, y : 450});
  assert.ok(muscle);
  doc = muscle.document;
  let linked =
      model.connectSelections(doc, {kind : 'organ', id}, {kind : 'center', id : relay.centerId});
  assert.ok(linked);
  doc = linked.document;
  linked = model.addWire(doc, relay.centerId, muscle.organId);
  assert.ok(linked);
  doc = linked.document;
  assert.equal(doc.wires[0].from, id);
  assert.equal(doc.wires.length, 2, 'One semantic connection per pair of organs');
  assert.equal(model.addWire(doc, id, muscle.organId), null,
               'Sensor-to-motor shortcuts remain forbidden');
  const wires = structuredClone(doc.wires);
  doc = model.updateField(doc, id, {lo : 30, hi : 100}, sites);
  assert.deepEqual(doc.wires, wires, 'Regenerating an eye preserves its connections');
  const planAfter = model.compileDocument(doc, sites);
  // An eye's nodes send each from its own address, close around the eye's: a wire from the eye
  // reaches them all, one from a node that node.
  const senders = planAfter.groups.filter(g => g.name.startsWith('eye:') && g.side === left.side);
  const apart = (a, b) => Math.hypot(a.sender1 - b.sender1, a.sender2 - b.sender2);
  assert.ok(senders.length > 1 && senders.every(g => apart(g, senders[0]) < .2));
  assert.ok(senders.slice(1).some(g => apart(g, senders[0]) > 0));
  const node = model.findOrgan(doc, id).centers[0].id;
  assert.equal(model.addWire(doc, node, relay.centerId), null,
               'A node adds nothing to what its whole organ reaches');
  const organWire = doc.wires.find(w => w.from === id).id;
  const fromNode = model.addWire(model.removeWire(doc, organWire), node, relay.centerId);
  assert.ok(fromNode, 'A single retinal node can be wired');
  const absorbed = model.addWire(fromNode.document, id, relay.centerId);
  assert.ok(absorbed && absorbed.document.wires.every(w => w.from !== node),
            'Wiring the whole organ takes the place of its node\'s wire');
  assert.equal(fromNode.document.wires.at(-1).from, node);
  assert.equal(fromNode.document.wires.at(-1).spread, 0);
  const nodePlan = model.compileDocument(fromNode.document, sites);
  const nodeIndex = model.allCenters(fromNode.document).findIndex(c => c.id === node);
  const relayIndex = model.allCenters(fromNode.document).findIndex(c => c.id === relay.centerId);
  const relayGroup = nodePlan.groups[relayIndex], nodeGroup = nodePlan.groups[nodeIndex];
  assert.ok(Math.hypot(relayGroup.receiver1 - nodeGroup.sender1,
                       relayGroup.receiver2 - nodeGroup.sender2) < .2,
            'The relay listens around the eye and its node');
  // A node's wires go with it when its colour type is removed.
  const twoTypes = model.updateField(
      fromNode.document, id,
      {addProfile : {id : 'extra', q1 : .4, q2 : -1, qwidth : .2, threshold : -.6}}, sites);
  const extraNode = model.findOrgan(twoTypes, id).centers.find(c => c.profile === 'extra').id;
  const extraWired = model.addWire(twoTypes, extraNode, relay.centerId).document;
  const extraIndex =
      model.findOrgan(extraWired, id).field.profiles.findIndex(p => p.id === 'extra');
  const withoutExtra = model.updateField(extraWired, id, {removeProfile : extraIndex}, sites);
  assert.ok(withoutExtra.wires.every(w => w.from !== extraNode),
            'Wires of removed nodes go with them');
  assert.doesNotThrow(() => model.compileDocument(withoutExtra, sites));
  assert.equal(model.removeOrgan(doc, id).wires.length, 1);
  assert.equal(model.findOrgan(model.removeOrgan(doc, id), pair).pair, null);
  const baseDoc = doc;
  for (let i = 1; i < 5; i++) {
    doc = model.updateField(doc, id, {
      addProfile : {id : 'colour-' + i, q1 : i * .35 - 1, q2 : -1, qwidth : .1, threshold : -.6}
    },
                            sites);
    assert.ok(doc, 'Five colour types can share a retina');
  }
  assert.equal(model.findOrgan(doc, id).field.profiles.length, 5);
  assert.ok(model.findOrgan(doc, id).field.profiles.every(
      p => model.findOrgan(doc, id).centers.some(c => c.profile === p.id)));
  assert.doesNotThrow(() => model.compileDocument(doc, sites));
  const denseNear = model.addOrgan(doc, 'proximity', sites, {x : 330, y : 280});
  assert.ok(denseNear, 'Near sense fits after five retinal colour profiles');
  assert.ok(
      model.findOrgan(denseNear.document, id)
          .field.profiles.every(
              p => model.findOrgan(denseNear.document, id).centers.some(c => c.profile === p.id)));
  model.validateDocument(denseNear.document);
  // Whole organs round-trip as a module with stable semantic wires and new identifiers.
  const module = {name : 'Vision', organs : doc.organs, wires : doc.wires};
  const points =
      module.organs.filter(o => o.centers.length)
          .map(o => geometry.sitePoint(sites.find(s => s.id === o.centers[0].site), o.type));
  const position = {
    x : points.reduce((n, p) => n + p.x, 0) / points.length,
    y : points.reduce((n, p) => n + p.y, 0) / points.length
  };
  const placed = model.placeStoredModule(model.newDocument('Module'), module, sites, position);
  assert.ok(placed);
  model.validateDocument(placed.document);
  assert.equal(placed.document.wires.length, doc.wires.length);
  assert.ok(
      placed.document.wires.every(w => model.endpointCenters(placed.document, w.from).length &&
                                       model.endpointCenters(placed.document, w.to).length));
  assert.equal(placed.document.organs.filter(o => o.type === 'eye').length, 2);
  assert.ok(placed.document.organs.filter(o => o.type === 'eye')
                .every(o => o.field.profiles.length === 5));
  // A module with a brain region keeps the region's settings and what was made of its nodes.
  const regionsModel = await import('../ui/studio/model/regions.js');
  let withTectum =
      model.placeModule(model.newDocument('Sehen'), 'vision-steering', sites, {x : 345, y : 290})
          .document;
  const tectumId = withTectum.organs.find(o => o.type === 'tectum').id;
  withTectum =
      regionsModel.updateRegion(withTectum, tectumId, {resolution : 4, contrast : 2}, sites);
  const output = model.findOrgan(withTectum, tectumId).centers.find(c => c.node === 'out');
  withTectum = model.updateCenter(withTectum, output.id, {tau : .9});
  // Dropped off the middle, a module with both sides keeps its sides.
  const stored = model.placeStoredModule(
      model.newDocument('Wieder'),
      {name : 'Sehen', organs : withTectum.organs, wires : withTectum.wires}, sites,
      {x : 345, y : 290});
  assert.ok(stored, 'A module with a region can be placed again');
  const again = stored.document.organs.filter(o => o.type === 'tectum');
  assert.equal(again.length, 2);
  assert.ok(again.every(o => o.region.resolution === 4 && o.region.contrast === 2));
  assert.ok(again.some(o => o.centers.find(c => c.node === 'out').tau === .9));
  model.validateDocument(stored.document);
  const malformed = structuredClone(module);
  malformed.organs.find(o => o.centers.length).centers[0].site = -1;
  assert.equal(model.placeStoredModule(model.newDocument(), malformed, sites, position), null);
  // A relay on the midline serves both sides; one beside it makes a module one-sided.
  assert.ok(geometry.onMidline(
      sites.find(s => s.id === model.findCenter(baseDoc, relay.centerId).center.site)));
  const beside = model.addNeuron(baseDoc, 'relay', sites, {x : 500, y : 400});
  const circuit = model.assemble(
      beside.document, [ id, 'brain' ], 'Circuit',
      [...model.findOrgan(beside.document, id).centers.map(c => c.id), beside.centerId ]);
  const mirrored = model.mirrorAssembly(circuit, circuit.assemblies[0].id, sites);
  assert.ok(mirrored);
  model.validateDocument(mirrored.document);
  assert.equal(mirrored.document.organs.filter(o => o.type === 'eye').length, 2,
               'Mirroring a circuit reuses the opposite eye');
  // The mirror image joins the module, which then lies on both sides and goes as one.
  assert.equal(mirrored.assemblyId, circuit.assemblies[0].id);
  assert.equal(mirrored.document.assemblies.length, 1);
  assert.ok(model.oneSided(circuit, sites, circuit.assemblies[0]));
  assert.ok(!model.oneSided(mirrored.document, sites, mirrored.document.assemblies[0]));
  const removed = model.removeAssembly(mirrored.document, mirrored.assemblyId);
  assert.equal(model.findOrgan(removed, id), null);
  assert.equal(model.findOrgan(removed, pair), null);
  assert.doesNotThrow(() => model.validateDocument(removed));
  const muscles = model.addOrgan(model.newDocument(), 'muscle', sites, {x : 600, y : 440});
  const m = model.findOrgan(muscles.document, muscles.organId),
        mSite = sites.find(s => s.id === m.centers[0].site);
  const target = sites.find(s => s.zone === mSite.zone && s.side === m.side && s.w === mSite.w &&
                                 s.v === mSite.v && s.u !== mSite.u);
  const moved =
      model.moveOrgan(muscles.document, m.id, sites, geometry.sitePoint(target, 'muscle'));
  assert.ok(moved);
  model.validateDocument(moved);
  const beforePair = model.findOrgan(muscles.document, m.pair).centers[0].site;
  assert.notEqual(model.findOrgan(moved, m.pair).centers[0].site, beforePair,
                  'Linked muscles move together');
  const ms = sites.find(s => s.id === model.findOrgan(moved, m.id).centers[0].site);
  const ps = sites.find(s => s.id === model.findOrgan(moved, m.pair).centers[0].site);
  assert.equal(ms.u, ps.u);
  assert.equal(ms.w, ps.w);
  assert.equal(ms.side, -ps.side);
  const grouped = model.assemble(muscles.document, [ m.id, m.pair ], 'Paired muscles');
  assert.ok(model.moveAssembly(grouped, grouped.assemblies[0].id, sites,
                               {x : position.x + 40, y : position.y}, position));
  doc = baseDoc;
  const near = model.addOrgan(doc, 'proximity', sites, {x : 330, y : 280});
  assert.ok(near);
  doc = near.document;
  const add = (type, position) => {
    const r = model.addOrgan(doc, type, sites, position);
    assert.ok(r, type);
    doc = r.document;
    return r;
  };
  const eggs = add('eggs', {x : 820, y : 400}), sperm = add('sperm', {x : 850, y : 330});
  const gland = add('gland', {x : 550, y : 400});
  add('muscle', {x : 850, y : 400});
  add('muscle', {x : 295, y : 300});
  doc = model.addSubstance(doc, HORMONES.levels);
  doc =
      model.updateGrowth(doc, {active : 1, substance : 0, sensitivity : 1, half : .01, width : .3});
  doc = model.updateCenter(doc, gland.centerId, {q1 : 1, q2 : 0, qwidth : 0});
  assert.ok(model.producers(doc, 0, sitesResult).length >= 1);
  const phased =
      model.setLifePhase(doc, model.findOrgan(doc, id).centers[0].id, {start : .6, end : .9},
                         sitesResult.sensitivitySpan, sitesResult.steepnessSteps);
  assert.deepEqual(model.lifePhase(model.findOrgan(phased, id).centers[0]), {start : .6, end : .9});
  assert.ok(model.growsWith(doc, 0, sitesResult));
  const phaseWithColor = model.updateField(
      phased, id,
      {addProfile : {id : 'phase-color', q1 : .4, q2 : -1, qwidth : .2, threshold : -.6}}, sites);
  assert.ok(model.findOrgan(phaseWithColor, id).centers.every(c => model.lifePhase(c).end === .9),
            'New retinal colour cells inherit the organ life phase');
  const state = {
    document : doc,
    sites,
    capabilities : sitesResult,
    selected : {kind : 'organ', id},
    multi : new Set(),
    camera : {zoom : 1, x : 560, y : 365},
    tool : 'select',
    stale : true,
    wireScope : 'all',
    contactView : 'design'
  };
  // With the hormone tool the gland releasing the substance shows on the fish, and the body
  // growing with it.
  const hormoneScene = views.fishScene({...state, tool : 'hormone', focusSubstance : 0});
  assert.match(hormoneScene, /aid-hormone-producer/);
  assert.match(hormoneScene, /aid-hormone-body/);
  // The library names brain regions by their short technical terms and says on hover, in
  // German, what each is for.
  assert.match(panels.library(state), /title="Sehzentrum: [^"]+"[^>]*>.*?Tectum/s);
  // Dragging a muscle shows where it may go and names what it does there.
  const muscleHints = views.placementHints(state, 'organ', 'muscle');
  assert.deepEqual(muscleHints.legend.map(entry => entry.name).sort(),
                   [ 'Ansaugen', 'Lenken', 'Vortrieb', 'Zubeißen' ]);
  assert.equal(new Set(muscleHints.legend.map(entry => entry.colour)).size, 4);
  const eyePanel = panels.inspector(state);
  // An organ's inspector says what substances do to it and opens the tools that change that.
  assert.match(eyePanel, /Hormone und Lernen/);
  assert.match(eyePanel, /data-open-tool="hormone"/);
  assert.match(eyePanel, /data-spectrum="field"/);
  assert.match(eyePanel, /data-sight-eye="0"/);
  assert.doesNotMatch(eyePanel, /type="range"/, 'The eye has no sliders');
  // The spectrum's width handle sits a sigma from the centre and sets the width back.
  const spectrum = await import('../ui/studio/view/spectrum.js');
  const tuning = await import('../ui/tuning.js');
  const tuned = {q1 : -.5, qwidth : .4},
        sigmaAt =
            spectrum.hueFraction(tuning.tuningHue(tuned.q1) + tuning.tuningSigma(tuned.qwidth));
  assert.ok(Math.abs(spectrum.spectrumPatch(tuned, 'width', sigmaAt).qwidth - tuned.qwidth) < 1e-9);
  assert.ok(
      Math.abs(
          spectrum.spectrumPatch(tuned, 'centre', spectrum.hueFraction(tuning.HUE_CIRCLE / 2)).q1) <
      1e-9);
  // A nose aimed at a scent prefers it most; the compass puts each scent where aiming at it
  // brings the selector, and a pointer there tunes to it.
  for (let k = 0; k < TUNING.scent_latitudes.length; ++k) {
    const aim = tuning.scentTuning(k), affinity = tuning.scentAffinities(aim.q1, aim.q2, .25);
    assert.equal(affinity.indexOf(Math.max(...affinity)), k);
    const at = panels.compassPoint(aim.q1, aim.q2),
          back = panels.compassTuning(at.x / panels.COMPASS.width, at.y / panels.COMPASS.height);
    assert.ok(Math.abs(back.q1 - aim.q1) < 1e-9 && Math.abs(back.q2 - aim.q2) < 1e-9);
  }
  const pigmentSite =
      sites.find(s => eligible(ORGANS.find(o => o.key === 'pigment').centers[0], s));
  const pigment = model.addOrgan(doc, 'pigment', sites, geometry.sitePoint(pigmentSite));
  assert.match(panels.inspector({
    ...state,
    document : pigment.document,
    selected : {kind : 'organ', id : pigment.organId}
  }),
               /data-spectrum="center"/);
  assert.match(eyePanel, /data-link-pair/);
  assert.doesNotMatch(eyePanel,
                      /data-add-center|aid-center-tabs|data-field="tau"|data-field="copies"/);
  assert.match(
      panels.inspector({...state, tool : 'hormone', effect : E.output, focusSubstance : 0}),
      /data-phase-handle="start"/);
  // A life phase's marks sit on the maturity axis; one at the axis' end leaves its side open.
  assert.deepEqual(panels.phasePatch('start', 0), {start : null});
  assert.deepEqual(panels.phasePatch('end', 1), {end : null});
  assert.ok(panels.phasePatch('end', 0).end > 0, 'A cell dies at some maturity, never at none');
  assert.ok(Math.abs(panels.phasePatch('end', (36 + 107) / 260).end - .5) < 1e-9);
  // A near sense reaches deeper the higher its range, as the engine computes it.
  assert.ok(sitesResult.nearDepth[0] > 0 && sitesResult.nearDepth[1] > sitesResult.nearDepth[0]);
  const sensorEffects = [
    ...panels.inspector({...state, tool : 'hormone', effect : E.output, focusSubstance : 0})
        .matchAll(/data-effect="(\d)"/g)
  ].map(m => +m[1]);
  assert.deepEqual(sensorEffects, sitesResult.roleEffects[0]);
  const learner = panels.inspector({
    ...state,
    selected : {kind : 'center', id : relay.centerId},
    tool : 'learn',
    effect : E.learning
  });
  assert.match(learner, /data-learning-pad/);
  // Without a teaching substance the learning tool says how to give the cell one.
  assert.match(learner, /aid-teachers/);
  // With nothing chosen the inspector shows the way through the Atelier, its steps as tools.
  const guide = panels.inspector({...state, selected : null});
  assert.match(guide, /aid-workflow/);
  assert.match(guide, /data-tool="wire"/);
  assert.match(panels.inspector({...state, selected : {kind : 'wire', id : doc.wires[0].id}}),
               /data-remove-wire/);
  assert.match(graph.cppnGraph({...state, report : null}), /aid-cppn/);
  const plan = model.compileDocument(doc, sites);
  const python = `import json,sys,tempfile,time
from atelier_service import run
from studio_storage import run as store
payload=json.load(sys.stdin); plan=payload['plan']; doc=payload['doc']
with tempfile.TemporaryDirectory(prefix='fish-atelier-test-') as directory:
    assert store(directory,{'operation':'save-draft','document':doc})['saved']
    assert store(directory,{'operation':'load-draft'})['document']==doc
    module={'id':'test','name':'Test','organs':doc['organs'],'wires':doc['wires']}
    store(directory,{'operation':'save-module','module':module})
    assert store(directory,{'operation':'list-modules'})['modules']==[module]
    store(directory,{'operation':'delete-module','id':'test'})
    assert not store(directory,{'operation':'list-modules'})['modules']
start=time.perf_counter();built=run({'operation':'build','plan':plan});duration=time.perf_counter()-start
assert len(built['groups'])==len(plan['groups'])
assert all(g['cells']==p['copies'] if p['role']!=2 else g['cells']==1 for g,p in zip(built['groups'],plan['groups']))
assert all(len(c)==8 and c[2]>0 for c in built['contacts'])
# The design view: the same cells from the planned groups, without CPPN or development.
designed=run({'operation':'design','plan':plan,'sight':None})
empty=run({'operation':'design','plan':{**plan,'groups':[]},'sight':None})
assert designed['neurons']==built['neurons'] and designed['sites']==built['sites']
assert designed['visionDepth']>0 and designed['bodyRadius']>0 and 'sight' not in designed
# Fields agree with the developed fish up to the compiled CPPN's rounding.
flat=lambda groups:[v for g in groups for interval in g for v in interval]
assert len(flat(designed['eyeGroups']))==len(flat(built['eyeGroups']))
assert all(abs(a-b)<1e-4 for a,b in zip(flat(designed['eyeGroups']),flat(built['eyeGroups'])))
assert empty['neurons']==0
# Light groups carry the engine's excitation and inhibition for every hue, and their answer over
# brightness, rising to full light.
lights=[l for l in designed['light'] if l]
assert lights and all(len(l['excitation'])==len(l['inhibition'])>0 and l['half']>0 for l in lights)
assert all(all(a<=b+1e-9 for a,b in zip(l['response'],l['response'][1:])) for l in lights)
inspected=run({'operation':'inspect','genome':built['genome']})
assert inspected['neurons']==built['neurons']
# What the eyes see of a test light: in the field or behind the fish, red or blue.
scene={'side':payload['side'],'bearing':payload['angle'],'distance':32,'radius':6,'hue':0}
target=run({'operation':'design','plan':plan,'sight':scene})
outside=run({'operation':'design','plan':plan,'sight':{**scene,'bearing':180}})
blue=run({'operation':'design','plan':plan,'sight':{**scene,'hue':240}})
probe=run({'operation':'probe','genome':built['genome'],'plan':plan,'groups':[payload['relay']],'steps':2})
assert len(probe['frames'])==3
measure=run({'operation':'measure','genome':built['genome'],'plan':plan,'substance':0,'level':.5,'maturity':1,'steps':8})
assert measure['growth']>.5 and len(measure['groups'])==len(plan['groups'])
example=run({'operation':'build','plan':payload['example']})
print(json.dumps({'built':built,'designed':designed,'target':target,'outside':outside,'blue':blue,'duration':duration,'example':{'viable':example['viable'],'checks':example['checks'],'contacts':example['contacts']}}))`;
  const currentEye = model.findOrgan(doc, id);
  const rayPlan = retina.retinalRays(currentEye, sites);
  // The example fish can go to the aquarium: it senses, swims, eats and reproduces.
  const exampleStudio = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
  Object.assign(exampleStudio.state, {sites, capabilities : sitesResult});
  exampleStudio.changeDocument = next => { exampleStudio.state.document = next; };
  exampleStudio.example();
  const response = JSON.parse(execFileSync('python3', [ '-B', '-c', python ], {
    cwd : root,
    input : JSON.stringify({
      plan,
      doc,
      side : currentEye.side < 0 ? 0 : 1,
      angle : rayPlan[Math.floor(rayPlan.length / 2)].angle,
      relay : model.allCenters(doc).findIndex(c => c.id === relay.centerId),
      example : model.compileDocument(exampleStudio.state.document, sites)
    }),
    encoding : 'utf8',
    timeout : 60000,
    maxBuffer : 32 * 1024 * 1024
  }));
  const {built, designed, target : seen, outside, blue} = response;
  assert.ok(response.example.viable, JSON.stringify(response.example.checks));
  // In the example the eyes reach the optic tecta across the midline only, as wired, and a tectum
  // does not talk to itself.
  const exampleDoc = exampleStudio.state.document, exampleCenters = model.allCenters(exampleDoc);
  const organOf = index => model.findCenter(exampleDoc, exampleCenters[index].id).organ;
  const optic = response.example.contacts.filter(([ from, to ]) => organOf(from).type === 'eye' &&
                                                                   organOf(to).type === 'tectum');
  assert.ok(optic.length &&
            optic.every(([ from, to ]) => organOf(from).side * organOf(to).side < 0));
  assert.ok(response.example.contacts.every(([ from, to ]) => organOf(from).type !== 'tectum' ||
                                                              organOf(to).type !== 'tectum' ||
                                                              organOf(from) === organOf(to)));
  // Zoomed out the whole way, the camera shows where an eye's field ends.
  const bodyView = await import('../ui/studio/view/body.js');
  assert.ok(geometry.FISH_BOX.width / geometry.CAMERA_ZOOM.min >=
            response.designed.visionDepth * bodyView.BODY_RADIUS_PIXELS);
  console.log('Atelier compilation: ' + response.duration.toFixed(3) + ' s');
  const {RECEPTOR, VISUAL_SAMPLE} = await import('../ui/schema.js');
  const indices = new Set(model.allCenters(doc).flatMap((c, i) => c.organId === id ? [ i ] : []));
  const eyeCells = r =>
      r.sight.receptors.flatMap((row, i) => indices.has(r.sight.groups[i]) ? [ row ] : []);
  const answers = r =>
      new Map(r.sight.samples.map(v => [v[VISUAL_SAMPLE.neuron], v[VISUAL_SAMPLE.response]]));
  const maximum = r =>
      Math.max(0, ...eyeCells(r).map(row => answers(r).get(row[RECEPTOR.neuron]) ?? 0));
  assert.ok(maximum(seen) > maximum(outside) + .01,
            'A test light inside the field excites the eye');
  const targetAngle = rayPlan[Math.floor(rayPlan.length / 2)].angle;
  const responseAt = r => Math.max(
      ...eyeCells(r)
          .filter(row => Math.abs(row[RECEPTOR.angle] * 180 / Math.PI - targetAngle) < .001)
          .map(row => answers(r).get(row[RECEPTOR.neuron]) ?? 0));
  assert.ok(responseAt(seen) > responseAt(blue) + .01,
            'Red-selective cells distinguish red from blue at the target');
  // The eye's view has one answer strip per colour type, each answer between none and full and
  // empty only where none of the type's cells looks.
  const readout = await import('../ui/organ_readout.js');
  const typeRows =
      readout.eyeTypeAnswers(readout.eyeSight(seen.sight.bands, seen.sight.samples, eyeCells(seen),
                                              model.findOrgan(doc, id).side < 0 ? 0 : 1));
  assert.equal(typeRows.length,
               new Set(model.findOrgan(doc, id).field.profiles.map(p => p.id)).size);
  assert.ok(typeRows.every(row => row.values.some(v => v !== null) &&
                                  row.values.every(v => v === null || (v >= 0 && v <= 1))));
  // Every displayed ray must match an engine cell, including half-bin offsets.
  for (const ray of rayPlan) {
    const index = model.allCenters(doc).findIndex(c => c.id === ray.center);
    const actual = seen.sight.receptors.find(
        (row, i) => seen.sight.groups[i] === index &&
                    Math.abs(row[RECEPTOR.angle] * 180 / Math.PI - ray.angle) < .001);
    assert.ok(actual, 'Displayed receptor has an engine counterpart');
    assert.ok(Math.abs(actual[RECEPTOR.view_left] * 180 / Math.PI - ray.left) < .001);
    assert.ok(Math.abs(actual[RECEPTOR.view_right] * 180 / Math.PI - ray.right) < .001);
  }
  // The scene: a fixed abstract fish with the organs' glyphs, the field with the engine's cells.
  const body = await import('../ui/studio/view/body.js');
  const rendered = {
    ...state,
    anatomy : seen,
    report : built,
    stale : false,
    selected : {kind : 'organ', id},
    sightProbe : {
      side : currentEye.side < 0 ? -1 : 1,
      bearing : targetAngle,
      distance : 32,
      radius : 6,
      hue : 0
    }
  };
  const svg = views.fishScene(rendered);
  assert.match(svg, /class="aid-fish-body"/);
  assert.match(svg, /data-vision-handle="density"/);
  assert.match(svg, /data-vision-handle="resolution"/);
  assert.match(svg, /data-vision-handle="probe"/);
  assert.match(svg, /class="aid-vision-seen"/);
  assert.match(svg, /class="aid-retina-node/, 'The chosen eye shows its cells as nodes');
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  for (const c of model.allCenters(doc)) {
    const p = body.nodeLocation(doc, sites, c, c.organType);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  for (const type of ['eye', 'proximity', 'muscle', 'eggs', 'sperm', 'gland'])
    assert.ok(doc.organs.filter(o => o.type === type)
                  .some(o => svg.includes('data-organ="' + o.id + '"')),
              type + ' remains selectable');
  assert.deepEqual(vision.visionGeometry(rendered, currentEye).origin,
                   body.viewOrigin(doc, sites, currentEye.side < 0 ? -1 : 1));
  assert.throws(() => model.validateDocument({...doc, format : 'v019-organ-studio'}));
  const before = JSON.stringify(doc);
  const full = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(model.compileDocument(full, sites), plan,
                   'Round-trip keeps the exact compiler plan');
  assert.equal(JSON.stringify(doc), before);
  // UI request races cannot install geometry or a genome from a previous document.
  const emptyRoot = {querySelector : () => null, querySelectorAll : () => []};
  const editor = new OrganStudio(emptyRoot);
  editor.state = {...editor.state, ...state};
  editor.refreshScene = editor.refreshInspector = editor.refreshHeader = () => {};
  let resolveBuild;
  editor.api = () => new Promise(resolve => { resolveBuild = resolve; });
  const pending = editor.develop();
  editor.state.document = model.updateField(doc, id, {density : 4}, sites);
  resolveBuild(built);
  await pending;
  assert.equal(editor.state.report, null);
  assert.equal(editor.state.genome, '');
  const svgElement = {
    getBoundingClientRect : () => ({left : 0, top : 0, width : 1000, height : 620}),
    setAttribute() {}
  };
  const pan = new OrganStudio(emptyRoot);
  pan.state.station = 'studio';
  pan.pointerDown({
    button : 0,
    clientX : 200,
    clientY : 200,
    target : {closest : sel => sel === '#aid-body-map' ? svgElement : null}
  });
  assert.ok(pan.pointer.pan, 'Dragging the empty canvas pans without switching tools');
  pan.pointerMove({clientX : 240, clientY : 220});
  assert.notEqual(pan.state.camera.x, 560);
  pan.pointerUp({preventDefault() {}});
  // Explicit deletion only: a move ending outside the fish is cancelled.
  const movement = new OrganStudio({
    querySelector : () => ({
      getBoundingClientRect : () => ({left : 0, top : 0, right : 1000, bottom : 620}),
      hidden : false,
      classList : {toggle() {}, remove() {}},
      replaceChildren() {}
    })
  });
  movement.state.sites = sites;
  movement.clearPreview = () => {};
  movement.pointer = {kind : 'organ', id, moved : true, svg : svgElement};
  let deleted = false;
  movement.removeSelection = () => { deleted = true; };
  movement.pointerUp({clientX : 1500, clientY : 20, preventDefault() {}});
  assert.equal(deleted, false);
  // Dropped on the bin, an organ goes.
  movement.pointer = {kind : 'organ', id, moved : true, svg : svgElement};
  movement.notice = () => {};
  movement.pointerUp({clientX : 500, clientY : 300, preventDefault() {}});
  assert.equal(deleted, true);
  console.log(
      'Atelier: generated organs, sight, connections, hormones, persistence and gestures: OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
