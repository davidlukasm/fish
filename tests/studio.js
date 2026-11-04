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
  "src/eye_geometry.cc" : "1d880bc1eb4c8c4e",
  "src/environment_parameters.hh" : "dd47655923c93bfd",
  "ui/brain_geometry.js" : "f26424cb0249af00",
  "ui/vision_view.js" : "1d2ed6cfa699bb2b",
  "colony-core/field/development_sites.hh" : "041de8ae566108bd",
  "colony-core/field/development.cc" : "9f0b4bcf26c472ce",
  "colony-core/field/functions.hh" : "7b6a6d591c1b6cda",
  "colony-core/field/hormones.hh" : "e0f1f91f7fdfa4b4",
  "colony-core/field/substrate.cc" : "36b1f34ac706bc90",
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
  "src/receptor_tuning.hh" : "509bbf751724eaf3",
  "colony-core/field/substrate.hh" : "b24a83bb2248a7a1",
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
  "src/retina.cc" : "1c457da4bbc1b174",
  "src/observations.cc" : "7bcfd57f88024834",
  "src/observations.hh" : "ee73a8bbb625a403",
  "src/eye_geometry.hh" : "25c8a3b96c4bbeb2",
  "src/retina.hh" : "1670821d02fd828c",
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
  "src/interactive_brain.cc" : "b8b9b4dceeecd2d3",
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
  const {ANATOMY, CPPN_OUTPUT, DEVELOPMENT, HORMONE_EFFECT, HORMONES, MOTOR_KIND, SENSE_KIND} =
      await import('../ui/schema.js');
  const {ORGANS, MUSCLES, eligible, functionFor} = await import('../ui/studio_organs.js');
  const {t, useTexts} = await import('../ui/strings.js');
  useTexts(
      {default : 'de'},
      {de : {studio : JSON.parse(readFileSync(join(root, 'ui/text/de/studio.json'), 'utf8'))}});
  const model = await import('../ui/studio_model.js');
  const views = await import('../ui/studio_views.js');
  const hormoneModel = await import('../ui/studio_hormones.js');
  const panels = await import('../ui/studio_panels.js');
  const graph = await import('../ui/studio_graph.js');
  const pulse = await import('../ui/studio_pulse.js');
  const {OrganStudio, initializeStudio} = await import('../ui/studio.js');
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
    assert.equal(changes.positions, 6);
    player.stop();
  } finally {
    globalThis.requestAnimationFrame = oldFrame;
    globalThis.cancelAnimationFrame = oldCancel;
  }
  const geometry = await import('../ui/studio_geometry.js');
  assert.equal(geometry.cameraBox({zoom : .4, x : 560, y : 365}).width, 2500);
  // Panning follows SVG's actual letterboxed area, including narrow or short canvases.
  const camera = {zoom : 2, x : 560, y : 365};
  const cameraBox = geometry.cameraBox(camera);
  const shortViewport = {width : 1200, height : 480};
  const scale = geometry.cameraScale(shortViewport, camera);
  assert.equal(scale, Math.min(shortViewport.width / cameraBox.width,
                               shortViewport.height / cameraBox.height));
  assert.ok(Math.abs(120 / scale - 77.5) < .01);
  assert.deepEqual(geometry.CAMERA_ZOOM, {min : .4, max : 8});
  assert.equal(geometry.cameraScale({width : 480, height : 1200}, camera), 480 / cameraBox.width);
  assert.ok(Number.isFinite(sitesResult.pigmentHalf) && sitesResult.pigmentHalf > 0);
  const sites = sitesResult.sites;
  const retina = await import('../ui/studio_retina.js');
  const vision = await import('../ui/studio_vision.js');
  const anatomical = await import('../ui/studio_anatomy.js');
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
  const senders = planAfter.groups.filter(g => g.name.startsWith('eye:') && g.side === left.side);
  assert.ok(
      senders.every(g => g.sender1 === senders[0].sender1 && g.sender2 === senders[0].sender2));
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
  const malformed = structuredClone(module);
  malformed.organs.find(o => o.centers.length).centers[0].site = -1;
  assert.equal(model.placeStoredModule(model.newDocument(), malformed, sites, position), null);
  const circuit =
      model.assemble(baseDoc, [ id, 'brain' ], 'Circuit',
                     [...model.findOrgan(baseDoc, id).centers.map(c => c.id), relay.centerId ]);
  const mirrored = model.mirrorAssembly(circuit, circuit.assemblies[0].id, sites);
  assert.ok(mirrored);
  model.validateDocument(mirrored.document);
  assert.equal(mirrored.document.organs.filter(o => o.type === 'eye').length, 2,
               'Mirroring a circuit reuses the opposite eye');
  const removed = model.removeAssembly(mirrored.document, mirrored.assemblyId);
  assert.ok(model.findOrgan(removed, id));
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
  const eyePanel = panels.inspector(state);
  assert.match(eyePanel, /data-vision-spectrum/);
  assert.match(eyePanel, /data-link-pair/);
  assert.doesNotMatch(eyePanel,
                      /data-add-center|aid-center-tabs|data-field="tau"|data-field="copies"/);
  assert.match(
      panels.inspector({...state, tool : 'hormone', effect : E.output, focusSubstance : 0}),
      /data-phase-start/);
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
  assert.equal(panels.dialReading('log', -2, '0.01').value, .01);
  assert.equal(panels.dialReading('hill', 3, '1').text, 'n = 8');
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
assert len(built['morphology'])==6 and built['morphology'][5]['extent']>0
assert all(len(c)==8 and c[2]>0 for c in built['contacts'])
inspected=run({'operation':'inspect','genome':built['genome']})
assert inspected['neurons']==built['neurons']
base={'operation':'optics','genome':built['genome'],'plan':plan,'side':payload['side'],
      'angle':payload['angle'],'distance':32,'radius':6,'color':[1,0,0],'background':.05}
optical=run(base)
outside=run({**base,'angle':180})
blue=run({**base,'color':[0,0,1]})
probe=run({'operation':'probe','genome':built['genome'],'plan':plan,'groups':[payload['relay']],'steps':2})
assert len(probe['frames'])==3
measure=run({'operation':'measure','genome':built['genome'],'plan':plan,'substance':0,'level':.5,'maturity':1,'steps':8})
assert measure['growth']>.5 and len(measure['groups'])==len(plan['groups'])
print(json.dumps({'built':built,'optical':optical,'outside':outside,'blue':blue,'duration':duration}))`;
  const currentEye = model.findOrgan(doc, id);
  const rayPlan = retina.retinalRays(currentEye, sites);
  const response = JSON.parse(execFileSync('python3', [ '-B', '-c', python ], {
    cwd : root,
    input : JSON.stringify({
      plan,
      doc,
      side : currentEye.side < 0 ? 0 : 1,
      angle : rayPlan[Math.floor(rayPlan.length / 2)].angle,
      relay : model.allCenters(doc).findIndex(c => c.id === relay.centerId)
    }),
    encoding : 'utf8',
    timeout : 25000,
    maxBuffer : 32 * 1024 * 1024
  }));
  const {built, optical, outside, blue} = response;
  console.log('Atelier compilation: ' + response.duration.toFixed(3) + ' s');
  const indices = new Set(model.allCenters(doc).flatMap((c, i) => c.organId === id ? [ i ] : []));
  const maximum = r => Math.max(...r.values.filter((v, i) => indices.has(i)));
  assert.ok(maximum(optical) > maximum(outside) + .01,
            'A target inside the field activates the eye');
  const targetAngle = rayPlan[Math.floor(rayPlan.length / 2)].angle;
  const responseAt = r => Math.max(
      ...r.receptors
          .filter(v => indices.has(v[0]) && Math.abs(v[1] * 180 / Math.PI - targetAngle) < .001)
          .map(v => v[4]));
  console.log('optical target', responseAt(optical), responseAt(blue));
  assert.ok(responseAt(optical) > responseAt(blue) + .01,
            'Red-selective cells distinguish red from blue at the target');
  // Every displayed sample and width must match the engine, including half-bin offsets.
  for (const ray of rayPlan) {
    const index = model.allCenters(doc).findIndex(c => c.id === ray.center);
    const actual = optical.receptors.find(r => r[0] === index &&
                                               Math.abs(r[1] * 180 / Math.PI - ray.angle) < .001);
    assert.ok(actual, 'Displayed receptor has an engine counterpart');
    assert.ok(Math.abs(actual[2] * 180 / Math.PI - ray.left) < .001);
    assert.ok(Math.abs(actual[3] * 180 / Math.PI - ray.right) < .001);
  }
  assert.equal(built.placement.length, sites.length);
  for (const developed of built.sites) {
    const site =
        sites.find(s => s.zone === developed.zone && s.side === developed.side &&
                        Math.abs(s.u - developed.u) < .0001 &&
                        Math.abs(s.v - developed.v) < .0001 && Math.abs(s.w - developed.w) < .0001);
    assert.ok(site);
    for (const [axis, k] of [[ 'x', 0 ], [ 'y', 1 ], [ 'z', 2 ]])
      assert.ok(Math.abs(built.placement[site.id][k] - developed[axis]) < .000001,
                'Empty and occupied sites use the same engine projection');
  }
  const positioned = anatomical.aquariumSitePoints(built, sites);
  assert.ok(positioned.every(s => Number.isFinite(s.point.x) && Number.isFinite(s.point.y)));
  assert.deepEqual(geometry.sitePoint(positioned[0]), positioned[0].point);
  const rendered = {...state, sites : positioned, report : built, stale : false};
  const svg = views.fishScene(rendered);
  assert.match(svg, /data-engine-morphology/);
  assert.match(svg, /aid-anatomical-proximity-pit/);
  assert.equal((svg.match(/class="aid-anatomical-proximity-pit"/g) || []).length, 10);
  assert.match(svg, /data-vision-handle="density"/);
  assert.match(svg, /data-vision-handle="resolution"/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  for (const c of model.allCenters(doc)) {
    const p = views.centerLocation(c, c.organType, sites, built);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  for (const type of ['eye', 'proximity', 'muscle', 'eggs', 'sperm', 'gland'])
    assert.ok(doc.organs.filter(o => o.type === type)
                  .some(o => svg.includes('data-organ="' + o.id + '"')),
              'Developed ' + type + ' remains selectable');
  assert.doesNotMatch(svg, /data-center="organ-/, 'Retinal cells cannot be moved independently');
  const origin = anatomical.aquariumEyePoint(built, currentEye.side < 0 ? 0 : 1);
  const fan = vision.visionGeometry(rendered, currentEye);
  assert.deepEqual(origin, fan.origin);
  const nearOrgan = model.findOrgan(doc, near.organId);
  assert.deepEqual(vision.visionGeometry(rendered, nearOrgan).origin,
                   anatomical.aquariumEyePoint(built, nearOrgan.side < 0 ? 0 : 1));
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
  editor.scheduleDevelopment = () => {};
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
    querySelector : () =>
        ({getBoundingClientRect : () => ({left : 0, top : 0, right : 1000, bottom : 620})})
  });
  movement.state.sites = sites;
  movement.clearPreview = () => {};
  movement.pointer = {kind : 'organ', id, moved : true, svg : svgElement};
  let deleted = false;
  movement.removeSelection = () => { deleted = true; };
  movement.pointerUp({clientX : 1500, clientY : 20, preventDefault() {}});
  assert.equal(deleted, false);
  console.log(
      'Atelier: generated organs, optics, anatomy, connections, hormones, persistence and gestures: OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
