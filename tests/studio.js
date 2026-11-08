const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {join} = require('node:path');

// Semantic guard for engine and aquarium drawing code that the organ editor interprets.
// Comments and formatting are ignored. A changed signature requires reviewing the
// corresponding Studio organ, control, and verification before updating this record.
const ENGINE_REVIEW = Object.freeze({
  "colony-core/field/contacts.hh" : "447d4337411ca283",
  "src/eye_geometry.cc" : "553a32ad6e39ab09",
  "src/environment_parameters.hh" : "dd47655923c93bfd",
  "ui/brain_geometry.js" : "f26424cb0249af00",
  "ui/vision_view.js" : "dcac2dd90cf6fe93",
  "colony-core/field/development_sites.hh" : "806dd25e151b5b85",
  "colony-core/field/development.cc" : "d18cda7b54dbdaa5",
  "colony-core/field/functions.hh" : "b9a98de1ad2b767c",
  "colony-core/field/hormones.hh" : "f3defc219c6bfa13",
  "colony-core/field/substrate.cc" : "25dee6389064b7b8",
  "src/body_plan.cc" : "52b9884578043b56",
  "src/physiology_parameters.hh" : "617a49a1bf091d4a",
  "src/physiology.hh" : "aec5ae2457d1326b",
  "src/physiology.cc" : "74ddaeb4842faac6",
  "src/hormone_state.hh" : "48078a32aa49f7d1",
  "src/hormone_state.cc" : "5ce4ffda53f8995f",
  "src/physiology_parameters.cc" : "122649c0c5cf70ad",
  "colony-core/ann/network.hh" : "6cb9c13f5fae66ab",
  "colony-core/ann/network.cc" : "92da225af4390594",
  "src/body_plan.hh" : "b1fb1d3a636c9111",
  "src/receptor_tuning.hh" : "c77a0a412d814cb7",
  "colony-core/field/substrate.hh" : "c94c9f71c0f1194d",
  "colony-core/cppn/output_schema.hh" : "6fc4666175b6b0ec",
  "colony-core/cppn/activation.hh" : "1a716ab9154b8ecc",
  "colony-core/evolution/gene.hh" : "4468c1d0669fa3f4",
  "colony-core/evolution/constants.hh" : "c232ea43b3259223",
  "werkzeug/fischbau.cc" : "5021f793d40969bc",
  "ui/tissue.js" : "01cae94d3e8df2d6",
  "src/genome.hh" : "e7bb5c8f277ae2b4",
  "src/hormone_view.cc" : "be839e6e115f3ea1",
  "src/hormone_view.hh" : "1515941132943782",
  "src/simulation_types.hh" : "b19320e4446f4b42",
  "src/retina.cc" : "d0168766edb9ae49",
  "src/observations.cc" : "bf8face7a41ea741",
  "src/observations.hh" : "f6f4936f693e510e",
  "src/eye_geometry.hh" : "651dfb791f0d8f1c",
  "src/retina.hh" : "a3a169f6e8f4cafd",
  "ui/fish_forms.js" : "11f5c7433615e5ae",
  "ui/fish_geometry.js" : "9e95f7f314d86a90",
  "ui/fish_fins.js" : "a07179737e1032b5",
  "ui/fish_organs.js" : "3c712910190f3cdc",
  "ui/fish_painter.js" : "8a55c784199f5207",
  "src/brain_interface.hh" : "85423d9fc741249f",
  "src/hormone_analysis.cc" : "bb5d83c0e5d6ac53",
  "src/hormone_analysis.hh" : "286fa7455ea124e0",
  "src/hormone_observations.cc" : "26724d854cb42eae",
  "src/hormone_observations.hh" : "32b75ba46d018348",
  "src/interactive_brain.cc" : "b677bc3ae5ee4eb0",
  "src/material.hh" : "32c33b6291275e33",
  "src/motor_state.hh" : "6642af5a79a83847",
  "src/visible_body.hh" : "e0b989f5b403d44a",
  "src/body_state_limits.hh" : "607381fbc86a14a5",
  "colony-core/cppn/cppn.hh" : "c9ce8e4829b4f8cc",
  "colony-core/cppn/program.cc" : "3a35f2b687924b9a",
  "colony-core/field/distribution.hh" : "9128e90facd2ea48",
  "colony-core/field/retinal_tissue.hh" : "b10cc23891b6f20e",
  "colony-core/field/dynamics.hh" : "6135673e69200226",
  "colony-core/field/maturation.hh" : "46c11d325a34ae2b"
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
  const {HORMONE_EFFECT, HORMONES, MOTOR_KIND, TUNING} = await import('../ui/schema.js');
  const {
    ORGANS,
    ORGAN_BY_KEY,
    eligible,
    functionFor,
    kindLimit,
    musclePlaces,
    nerveKind,
    nodeLimit,
    organFunction
  } = await import('../ui/studio/model/organs.js');
  const {t, useTexts} = await import('../ui/strings.js');
  useTexts({default : 'de'}, {
    de : Object.fromEntries([ 'studio', 'organ_graphics', 'units' ].map(
        area => [area, JSON.parse(readFileSync(join(root, `ui/text/de/${area}.json`), 'utf8'))]))
  });
  const model = {
    ...await import('../ui/studio/model/document.js'),
    ...await import('../ui/studio/model/assemblies.js')
  };
  const views = {
    ...await import('../ui/studio/view/scene.js'),
    ...await import('../ui/studio/view/placing.js'),
    ...await import('../ui/studio/view/body.js'),
    ...await import('../ui/studio/view/places.js'),
    ...await import('../ui/studio/view/names.js')
  };
  const panels = {
    ...await import('../ui/studio/view/panels.js'),
    ...await import('../ui/studio/view/library.js'),
    ...await import('../ui/studio/view/substances.js')
  };
  const graph = await import('../ui/studio/view/graph.js');
  const pulse = await import('../ui/studio/view/pulse.js');
  const {OrganStudio} = await import('../ui/studio/controller.js');
  const sitesResult =
      JSON.parse(execFileSync(join(resolve(process.env.BUILD_DIR ?? join(root, 'bin')), 'atelier'),
                              [ 'sites' ], {encoding : 'utf8', timeout : 10000}));
  // The real start fish becomes a document and survives save/load and organ editing. Its
  // irregular near-sense sampling and inherited contact fields must not be normalized away.
  {
    const {startDocument} = await import('../ui/studio/model/import.js');
    const source = JSON.parse(execFileSync(
        'python3',
        [
          '-B', '-c',
          "import json; from atelier_service import run; print(json.dumps(run({'operation':'new','example':'start'})))"
        ],
        {cwd : root, encoding : 'utf8', timeout : 10000, maxBuffer : 8 * 1024 * 1024}));
    const doc = startDocument(source.sourcePlan, sitesResult.sites, 'Startfisch');
    const saved = JSON.parse(JSON.stringify(doc));
    assert.ok(model.regenerateFields(saved, sitesResult.sites));
    assert.deepEqual(saved, doc);
    const plan = model.compileDocument(saved, sitesResult.sites);
    assert.ok(plan.source);
    assert.equal(plan.groups.length, source.sourcePlan.groups.length);
    assert.equal(plan.connections.length, source.sourcePlan.connections.length);
    assert.ok(doc.wires.length < plan.connections.length);
    const near = doc.organs.find(o => o.type === 'proximity');
    assert.ok(new Set(near.centers.map(c => c.copies)).size > 1);
    const tuned = model.updateField(doc, near.id, {profile : {...near.field.profiles[0], q1 : .2}},
                                    sitesResult.sites);
    assert.ok(model.compileDocument(tuned, sitesResult.sites).source);
    assert.deepEqual(model.allCenters(tuned).map(c => [c.id, c.site, c.copies]),
                     model.allCenters(doc).map(c => [c.id, c.site, c.copies]));
    const rewired = structuredClone(doc);
    rewired.wires.pop();
    assert.equal(model.compileDocument(rewired, sitesResult.sites).source, undefined);
    const checked = JSON.parse(execFileSync(
        'python3',
        [
          '-B', '-c',
          "import json,sys; from atelier_service import run; p=json.load(sys.stdin); r=run({'operation':'build','plan':p}); print(json.dumps({k:r[k] for k in ['neurons','synapses','viable','compiler']}))"
        ],
        {cwd : root, encoding : 'utf8', input : JSON.stringify(plan), timeout : 10000}));
    assert.ok(checked.compiler.ok, JSON.stringify(checked.compiler));
    assert.equal(checked.neurons, source.neurons);
    assert.equal(checked.synapses, source.synapses);
    assert.equal(checked.viable, source.viable);
  }
  {
    const line = (x0, x1) => [{x : x0, y : 0}, {x : x1, y : 0}];
    assert.deepEqual(pulse.signalPoint(line(0, 100), .5), {x : 50, y : 0});
    assert.deepEqual(pulse
                         .legStages({
                           points : line(0, 100),
                           starts : [ line(-50, 0), line(-30, 0) ],
                           arrives : [ line(100, 140) ]
                         })
                         .map(stage => [stage.lines.length, stage.length]),
                     [ [ 2, 50 ], [ 1, 100 ], [ 1, 40 ] ]);
    const links = [
      {from : 'eye', to : 'tectum', points : line(0, 200), kind : 'excite'},
      {from : 'tectum', to : 'muscle', points : line(200, 400), kind : 'excite'},
      {from : 'tectum', to : 'quiet', points : line(200, 300), kind : 'inhibit'},
      {from : 'quiet', to : 'muscle', points : line(300, 400), kind : 'excite'},
      {from : 'muscle', to : 'tectum', points : line(400, 200), kind : 'excite'}
    ];
    const answers = {quiet : 'fall', freed : 'rise', drained : 'fall'};
    const schedule = pulse.signalSchedule(
        [ 'eye' ],
        [
          ...links, {from : 'quiet', to : 'freed', points : line(300, 350), kind : 'inhibit'},
          {from : 'quiet', to : 'drained', points : line(300, 360), kind : 'excite'},
          {from : 'tectum', to : 'drained', points : line(200, 260), kind : 'excite'}
        ],
        key => answers[key] ?? 'rise');
    const modes = mode => [...schedule.parts]
                              .filter(([, part ]) => part.mode === mode)
                              .map(([ key ]) => key)
                              .sort();
    assert.deepEqual(modes('fire'), [ 'eye', 'freed', 'muscle', 'tectum' ]);
    assert.deepEqual(
        modes('quiet'), [ 'drained', 'quiet' ],
        'An inhibiting signal quiets a part that falls, as does an excitation withdrawn');
    assert.ok(schedule.parts.get('muscle').time > schedule.parts.get('tectum').time);
    assert.ok(
        schedule.legs.every(l => l.link.to !== 'drained' || l.link.from === 'quiet' || !l.answers),
        'An exciting signal does not quiet the part it reaches');
    assert.deepEqual(schedule.legs.filter(l => l.link.from === 'quiet').map(l => l.sends),
                     [ 'quiet', 'quiet', 'quiet' ], 'A quieted part withdraws what it sends');
    assert.equal(schedule.legs.filter(l => l.link.from === 'tectum').length, 3,
                 'A part sends once to each of its targets');
    const preview = pulse.signalSchedule(
        [ 'eye' ],
        [
          ...links, {from : 'quiet', to : 'freed', points : line(300, 350), kind : 'inhibit'},
          {from : 'quiet', to : 'muted', points : line(300, 360), kind : 'excite'}
        ],
        (key, push) => push);
    const previewed = mode => [...preview.parts]
                                  .filter(([, part ]) => part.mode === mode)
                                  .map(([ key ]) => key)
                                  .sort();
    assert.deepEqual(previewed('fire'), [ 'eye', 'freed', 'muscle', 'tectum' ]);
    assert.deepEqual(previewed('quiet'), [ 'muted', 'quiet' ]);
    const frames = [ [ 0, 0, 0 ], [ .9, -.8, .01 ], [ .2, -.3, -.02 ], [ -.3, .2, .01 ] ];
    assert.deepEqual([ [ 0 ], [ 1 ], [ 2 ], [ 1, 0 ] ].map(i => pulse.signalAnswer(frames, i)),
                     [ 'rise', 'fall', null, 'rise' ]);
    const oldFrame = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
    const scheduled = [], reached = [], classes = new Set();
    const element = {classList : {add : (...c) => c.forEach(x => classes.add(x)), remove() {}}};
    const fakeSvg = {
      ownerDocument : {
        createElementNS : () => ({
          isConnected : false,
          style : {},
          setAttribute() {},
          appendChild() {},
          remove() { this.isConnected = false; }
        })
      },
      appendChild(item) { item.isConnected = true; }
    };
    try {
      globalThis.requestAnimationFrame = callback => scheduled.push(callback);
      globalThis.cancelAnimationFrame = () => {};
      const player = pulse.createSignalPlayer(fakeSvg, schedule, {
        marks : () => [element],
        moves : key => key === 'muscle' ? [ [ element, 'aid-move-tail' ] ] : [],
        reached : ({key, link}) => reached.push(key ?? link?.to),
        arrived : link => reached.push('arrived:' + link.to)
      });
      player.start();
      for (const time of [0, 10, 1e6]) {
        const frame = scheduled.shift();
        assert.ok(frame);
        frame(time);
      }
      assert.ok(reached.includes('eye') && reached.includes('muscle'));
      assert.ok(reached.some(r => String(r).startsWith('arrived:')),
                'A signal tells when it arrives');
      assert.ok(classes.has('aid-pulse-fired') && classes.has('aid-move-tail'),
                'A firing effector moves what it drives');
      player.stop();
    } finally {
      globalThis.requestAnimationFrame = oldFrame;
      globalThis.cancelAnimationFrame = oldCancel;
    }
  }
  {
    const {builtAsDrawn, stimulusKind} = await import('../ui/studio/view/stimulus.js');
    const drawn =
        {genome : 'g', stale : false, report : {compiler : {ok : true}}, tool : 'stimulate'};
    assert.ok(builtAsDrawn(drawn));
    assert.ok(!builtAsDrawn({...drawn, report : {}}),
              'A genome opened alone is not the fish drawn');
    assert.match(stimulusKind(drawn), /aid-stimulus-kind real/);
    assert.doesNotMatch(stimulusKind({...drawn, stale : true}), /real/);
    assert.equal(stimulusKind({...drawn, tool : 'select'}), '');
  }
  {
    const {stimulusPicture} = await import('../ui/studio/view/stimuli.js');
    const {SENSE_KIND} = await import('../ui/schema.js');
    for (const kind of Object.values(SENSE_KIND)) {
      const [weak, strong] = [ 0, 1 ].map(s => stimulusPicture(kind, s, {x : 0, y : 0}, 'held'));
      assert.match(weak, /<title>held<\/title>/);
      assert.notEqual(weak, strong, 'A stronger stimulus looks stronger');
    }
  }
  const geometry = {
    ...await import('../ui/studio/model/layout.js'),
    ...await import('../ui/studio/view/frame.js')
  };
  assert.equal(geometry.cameraBox({zoom : .4, x : 560, y : 365}).width, 2500);
  const camera = {zoom : 2, x : 560, y : 365};
  const cameraBox = geometry.cameraBox(camera);
  const shortViewport = {width : 1200, height : 480};
  const scale = geometry.cameraScale(shortViewport, camera);
  assert.equal(scale, Math.min(shortViewport.width / cameraBox.width,
                               shortViewport.height / cameraBox.height));
  assert.ok(Math.abs(120 / scale - 77.5) < .01);
  assert.ok(geometry.CAMERA_ZOOM.min < 1 && geometry.CAMERA_ZOOM.max > 1);
  assert.equal(geometry.cameraScale({width : 480, height : 1200}, camera), 480 / cameraBox.width);
  const sites = sitesResult.sites;
  const retina = await import('../ui/studio/model/retina.js');
  const vision = await import('../ui/studio/view/vision.js');
  (await import('../ui/brain.js')).initialize([ 'brainClamp' ]);
  const E = HORMONE_EFFECT;
  assert.equal(sitesResult.effects, Object.keys(E).length);
  {
    const {EFFECT_ICON} = await import('../ui/studio/view/icons.js');
    const {EFFECT_ORDER, effectScene} = await import('../ui/studio/view/effects.js');
    assert.equal(new Set(EFFECT_ORDER).size, Object.keys(E).length);
    for (const effect of Object.values(E)) {
      assert.ok(EFFECT_ICON[effect]);
      assert.match(effectScene(effect, '#abcdef'), /aid-effect-scene/);
    }
    const excited = effectScene(E.excitation, '#abcdef');
    const taught = effectScene(E.teaching, '#abcdef');
    assert.doesNotMatch(excited, /aid-effect-line teach/);
    assert.match(taught, /aid-effect-line teach/);
    assert.doesNotMatch(taught, /aid-effect-spikes/);
    const aquarium = JSON.parse(readFileSync(join(root, 'ui/text/de/nerve_map.json'), 'utf8'));
    assert.equal(aquarium.effects.length, Object.keys(E).length);
  }
  assert.deepEqual(sitesResult.roleEffects, [
    [ E.excitation, E.output, E.death ], Object.values(E).sort((a, b) => a - b),
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
  {
    const site = sites.find(s => s.zone === 2 && !s.outer);
    const spinal =
        model.addOrgan(model.newDocument('Regionen'), 'spinal', sites, geometry.sitePoint(site));
    assert.ok(spinal, 'The spinal cord can be placed');
    const left = model.findOrgan(spinal.document, spinal.organId),
          right = model.findOrgan(spinal.document, left.pair);
    assert.ok(right && right.side === -left.side);
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
    const crossKey = regions.innerKey('cross', 'beat', true);
    const loose = regions.toggleInnerLink(spinal.document, spinal.organId, crossKey);
    model.validateDocument(loose);
    assert.ok(!regions.routedLinks(loose, sites).some(l => l.key === crossKey));
    assert.equal(
        regions.routedLinks(loose, sites, true).filter(l => l.key === crossKey && l.cut).length, 2,
        'Both sides lose the link');
    assert.ok(regions.routedLinks(regions.toggleInnerLink(loose, left.pair, crossKey), sites)
                  .some(l => l.key === crossKey));
    const spinalPanels = await import('../ui/studio/view/panels.js');
    const spinalCircuit = spinalPanels.inspector({
      document : spinal.document,
      sites,
      selected : {kind : 'organ', id : spinal.organId},
      multi : new Set(),
      camera : {zoom : 1, x : 560, y : 365},
      tool : 'select',
      stale : true,
      wireScope : 'all',
      contactView : 'design'
    });
    assert.match(spinalCircuit, /aid-circuit-link crossing inhibits[^>]*url\(#aid-circuit-bar\)/);
    const movedSpinal = model.moveOrgan(spinal.document, spinal.organId, sites, {x : 700, y : 420});
    assert.ok(movedSpinal, 'A region can be moved');
    const movedLeft = model.findOrgan(movedSpinal, spinal.organId);
    assert.equal(movedLeft.region.site, movedLeft.centers[0].site);
    model.validateDocument(regions.settleRegions(movedSpinal, sites));
    const faster = regions.updateRegion(spinal.document, spinal.organId, {beat : 2}, sites);
    assert.ok(model.findOrgan(faster, spinal.organId).centers[0].tau < left.centers[0].tau,
              'A faster beat shortens the rhythm');
    const allCentersOf = doc => model.allCenters(doc).length;
    const regionPlan = model.compileDocument(spinal.document, sites);
    assert.equal(regionPlan.groups.length, 6);
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
    const balanced =
        model.addOrgan(model.newDocument('Gleichgewicht'), 'lateral', sites, {x : 573, y : 300});
    const cerebellumSite = sites.find(s => s.zone === 2 && !s.outer && s.w > 0 && s.side === -1);
    const cerebellum =
        model.addOrgan(balanced.document, 'cerebellum', sites, geometry.sitePoint(cerebellumSite));
    const steady =
        model.connectSelections(cerebellum.document, {kind : 'organ', id : balanced.organId},
                                {kind : 'organ', id : cerebellum.organId});
    const steadyLinks =
        regions.routedLinks(steady.document, sites).filter(l => l.wire.id === steady.wireId);
    assert.ok(
        steadyLinks.length &&
        steadyLinks.every(l => model.findCenter(steady.document, l.to).center.node === 'smooth'));
    let wired = model.addOrgan(spinal.document, 'eye', sites, {x : 345, y : 290}).document;
    const tectumSite = sites.find(s => s.zone === 1 && !s.outer);
    const tectum = model.addOrgan(wired, 'tectum', sites, geometry.sitePoint(tectumSite));
    assert.ok(tectum, 'The optic tectum can be placed');
    wired = tectum.document;
    const eyeOrgan = wired.organs.find(o => o.type === 'eye');
    const own = model.connectSelections(wired, {kind : 'organ', id : eyeOrgan.id},
                                        {kind : 'organ', id : tectum.organId});
    assert.equal(own.document.wires.at(-1).pairing, 'same');
    assert.ok(model.expandedWires(own.document)
                  .filter(l => l.wire.id === own.wireId)
                  .every(l => model.findOrgan(own.document, l.from).side ===
                              model.findOrgan(own.document, l.to).side),
              'Drawn on one side, optic wires stay on their sides');
    const farTectum = model.findOrgan(wired, tectum.organId).pair;
    assert.ok(farTectum);
    const connected = model.connectSelections(wired, {kind : 'organ', id : eyeOrgan.id},
                                              {kind : 'organ', id : farTectum});
    assert.ok(connected);
    assert.equal(connected.document.wires.at(-1).pairing, 'crossed');
    const tectumLeft = model.findOrgan(connected.document, tectum.organId);
    const far = model.expandedWires(connected.document).filter(l => l.wire.id === connected.wireId);
    assert.equal(far.length, 2);
    assert.ok(far.every(l => model.findOrgan(connected.document, l.from).side !==
                             model.findOrgan(connected.document, l.to).side),
              'Optic wires cross');
    assert.ok(tectumLeft);
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
    {
      let tried = 0;
      const pairedTypes = ORGANS.filter(o => !o.fixed && o.category !== 'internal').map(o => o.key);
      const role = type => ORGAN_BY_KEY[type].category === 'regions' ? 'nerve' : '';
      const leftOf = type => {
        const site = sites.find(s => s.side < 0 && eligible(ORGAN_BY_KEY[type].centers[0], s));
        return site && model.addOrgan(model.newDocument('Seiten'), type, sites,
                                      geometry.sitePoint(site, role(type)));
      };
      for (const a of pairedTypes)
        for (const b of pairedTypes) {
          const first = leftOf(a);
          const site =
              first &&
              sites.find(s => s.side < 0 &&
                              !model.allCenters(first.document).some(c => c.site === s.id) &&
                              eligible(ORGAN_BY_KEY[b].centers[0], s));
          const second =
              site && model.addOrgan(first.document, b, sites, geometry.sitePoint(site, role(b)));
          const near = second && model.findOrgan(second.document, second.organId);
          const from = second && model.findOrgan(second.document, first.organId);
          if (!near?.pair || !from?.pair || near.side !== from.side || near.id === from.id)
            continue;
          for (const [to, same] of [[ near.id, true ], [ near.pair, false ]]) {
            const wired = model.addWire(second.document, from.id, to);
            if (!wired)
              continue;
            tried++;
            const sideOf = id => model.organOf(wired.document, id).side;
            assert.equal(wired.document.wires.at(-1).pairing, same ? 'same' : 'crossed',
                         a + '>' + b);
            assert.ok(model.expandedWires(wired.document)
                          .filter(l => l.wire.id === wired.wireId)
                          .every(l => (sideOf(l.from) === sideOf(l.to)) === same),
                      a + '>' + b + ' joins the sides as drawn');
          }
        }
      assert.ok(tried > 40, 'Many pairs of organs tried: ' + tried);
    }
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
    {
      const doc = across.document, wire = doc.wires.find(w => w.id === across.wireId);
      const link = model.expandedWires(doc).find(l => l.wire === wire);
      const from = model.centerIndex(doc, model.endpointCenters(doc, link.from)[0].id);
      const to = model.centerIndex(doc, model.endpointCenters(doc, link.to)[0].id);
      const rows = [ [ from, to, 4, .5, 3, 1, 1, -1 ], [ to, from, 9, 1, 9, 0, 1, 0 ] ];
      const formed = model.wireContacts(doc, wire, rows);
      assert.deepEqual([ formed.count, formed.positive, formed.negative, formed.weight ],
                       [ 4, 3, 1, .5 ], 'A wire counts only the contacts along its own links');
      assert.equal(model.wireContacts(doc, wire, []).count, 0);
    }
    const commissure = model.addWire(wired, tectumLeft.centers[0].id, twin.centers[0].id);
    assert.ok(commissure);
    assert.ok(model.expandedWires(commissure.document).every(l => l.from !== l.to));
    const opticDoc = connected.document;
    assert.equal(model.addWire(opticDoc, eyeOrgan.id, twin.id), null);
    const steering =
        model.placeModule(model.newDocument('Modul'), 'vision-steering', sites, {x : 345, y : 290});
    assert.ok(steering);
    for (const {key} of (await import('../ui/studio/model/organs.js')).MODULES) {
      const placed = model.placeModule(model.newDocument(key), key, sites, {x : 345, y : 290});
      assert.ok(placed, key + ' can be placed');
      assert.ok(!model.oneSided(placed.document, sites, placed.document.assemblies[0]), key);
    }
    assert.ok(!model.oneSided(steering.document, sites, steering.document.assemblies[0]));
    assert.equal(steering.document.assemblies.length, 1);
    assert.ok(steering.document.wires.every(w => model.findOrgan(steering.document, w.from) &&
                                                 model.findOrgan(steering.document, w.to)));
    assert.ok(steering.document.organs.some(o => o.type === 'tectum'),
              'Seeing and steering runs through the optic tectum');
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
  const retinalIndices =
      planAfter.groups.map((g, i) => g.name.startsWith('eye:') && g.side === left.side ? i : -1)
          .filter(i => i >= 0);
  const targetIndex = model.allCenters(doc).findIndex(c => c.id === relay.centerId);
  const eyeLinks = planAfter.connections.filter(e => e.to === targetIndex);
  assert.ok(retinalIndices.length > 1);
  assert.deepEqual(eyeLinks.map(e => e.from).sort((a, b) => a - b), retinalIndices);
  assert.equal(new Set(eyeLinks.map(e => e.bundle)).size, 1);
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
  assert.deepEqual(nodePlan.connections.filter(e => e.to === relayIndex).map(e => e.from),
                   [ nodeIndex ]);
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
  const regionsModel = await import('../ui/studio/model/regions.js');
  let withTectum =
      model.placeModule(model.newDocument('Sehen'), 'vision-steering', sites, {x : 345, y : 290})
          .document;
  const tectumId = withTectum.organs.find(o => o.type === 'tectum').id;
  withTectum =
      regionsModel.updateRegion(withTectum, tectumId, {resolution : 4, contrast : 2}, sites);
  const output = model.findOrgan(withTectum, tectumId).centers.find(c => c.node === 'out');
  withTectum = model.updateCenter(withTectum, output.id, {tau : .9});
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
  assert.ok(geometry.onMidline(
      sites.find(s => s.id === model.findCenter(baseDoc, relay.centerId).center.site)));
  const beside = model.addNeuron(baseDoc, 'relay', sites, {x : 500, y : 400});
  assert.match(views.fishScene({
    document : beside.document,
    sites,
    capabilities : sitesResult,
    selected : {kind : 'center', id : beside.centerId},
    multi : new Set(),
    camera : {zoom : 1, x : 560, y : 365},
    tool : 'select',
    stale : true,
    wireScope : 'all',
    contactView : 'design'
  }),
               /class="aid-reach"/);
  const centred = model.moveCenterToSide(beside.document, beside.centerId, 0, sites);
  const siteOf = (d, c) => sites.find(s => s.id === model.findCenter(d, c).center.site);
  assert.ok(centred && geometry.onMidline(siteOf(centred, beside.centerId)));
  const leftward = model.moveCenterToSide(centred, beside.centerId, -1, sites);
  assert.ok(leftward && siteOf(leftward, beside.centerId).side < 0 &&
            !geometry.onMidline(siteOf(leftward, beside.centerId)));
  const circuit = model.assemble(
      beside.document, [ id, 'brain' ], 'Circuit',
      [...model.findOrgan(beside.document, id).centers.map(c => c.id), beside.centerId ]);
  const mirrored = model.mirrorAssembly(circuit, circuit.assemblies[0].id, sites);
  assert.ok(mirrored);
  model.validateDocument(mirrored.document);
  assert.equal(mirrored.document.organs.filter(o => o.type === 'eye').length, 2,
               'Mirroring a circuit reuses the opposite eye');
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
  add('eggs', {x : 820, y : 400});
  add('sperm', {x : 850, y : 330});
  const gland = add('gland', {x : 550, y : 400});
  add('muscle', {x : 850, y : 400});
  add('muscle', {x : 295, y : 300});
  doc = model.addSubstance(doc, HORMONES.levels);
  doc =
      model.updateGrowth(doc, {active : 1, substance : 0, sensitivity : 1, half : .01, width : .3});
  doc = model.updateCenter(doc, gland.centerId, {q1 : 1, q2 : 0, qwidth : 0});
  assert.ok(model.producers(doc, 0, sitesResult).length >= 1);
  const withoutSubstance = model.removeSubstance(doc, 0, sitesResult);
  assert.ok(!model.findOrgan(withoutSubstance, gland.organId), 'Its glands go with a substance');
  assert.equal(
      model.producers(model.addSubstance(withoutSubstance, HORMONES.levels), 0, sitesResult).length,
      0, 'A new substance inherits no gland');
  const wideGland =
      model.updateCenter(model.addSubstance(doc, HORMONES.levels), gland.centerId, {qwidth : 1});
  assert.ok(model.producers(wideGland, 1, sitesResult).length >= 1);
  assert.ok(model.findOrgan(model.removeSubstance(wideGland, 0, sitesResult), gland.organId),
            'A gland that also feeds a substance that stays is kept');
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
  const hormoneScene = views.fishScene({...state, tool : 'hormone', focusSubstance : 0});
  assert.match(hormoneScene, /aid-hormone-producer/);
  assert.match(hormoneScene, /aid-hormone-body/);
  assert.match(panels.libraryOf(state).html, /title="Sehzentrum: [^"]+"[^>]*>.*?Tectum/s);
  const muscleHints = views.placementHints(state, 'organ', 'muscle');
  assert.deepEqual(muscleHints.legend.map(entry => entry.name.replace(/\u00ad/g, '')).sort(),
                   [ 'Flossenmuskel', 'Kiefer', 'Schlund', 'Schwanzmuskel' ]);
  assert.equal(new Set(muscleHints.legend.map(entry => entry.colour)).size, 4);
  assert.equal(muscleHints.svg.match(/aid-muscle-home/g).length, 8);
  const eyePanel = panels.inspector(state);
  assert.match(eyePanel, /Hormone und Lernen/);
  assert.match(eyePanel, /data-open-tool="hormone"/);
  assert.match(eyePanel, /data-spectrum="field"/);
  assert.match(eyePanel, /data-sight-eye="0"/);
  assert.doesNotMatch(eyePanel, /type="range"/, 'The eye has no sliders');
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
  const scents = await import('../ui/studio/view/scents.js'), M = scents.SCENT_MAP;
  const tunedAt = p => scents.scentMapTuning(p.x / M.size, p.y / M.height);
  for (let k = 0; k < TUNING.scent_latitudes.length; ++k) {
    const aim = tuning.scentTuning(k), affinity = tuning.scentAffinities(aim.q1, aim.q2, .25);
    assert.equal(affinity.indexOf(Math.max(...affinity)), k);
    const back = tunedAt(scents.scentMapPoint(aim.q1, aim.q2));
    assert.ok(Math.abs(back.q1 - aim.q1) < 1e-9 && Math.abs(back.q2 - aim.q2) < 1e-9);
  }
  const between = {q1 : .3, q2 : -.2}, back = tunedAt(scents.scentMapPoint(between.q1, between.q2));
  assert.ok(Math.abs(back.q1 - between.q1) < 1e-9 && Math.abs(back.q2 - between.q2) < 1e-9);
  const half = tuning.tuningHalfOffset(.3);
  assert.ok(Math.abs(tuning.tuningAffinity(half, .3) - .5) < 1e-9);
  const pigmentSite =
      sites.find(s => eligible(ORGANS.find(o => o.key === 'pigment').centers[0], s));
  const pigment = model.addOrgan(doc, 'pigment', sites, geometry.sitePoint(pigmentSite));
  assert.equal(model.findOrgan(pigment.document, pigment.organId).pair, null);
  const pigmentPanel = panels.inspector(
      {...state, document : pigment.document, selected : {kind : 'organ', id : pigment.organId}});
  assert.match(pigmentPanel, /data-pigment-wheel=/);
  assert.match(pigmentPanel, /data-pigment-amount=/);
  assert.match(pigmentPanel, /data-add-type=/);
  const skinOrgan = model.findOrgan(pigment.document, pigment.organId);
  const kinds =
      model.addOrganType(pigment.document, pigment.organId, sites, model.nextTypeTuning(skinOrgan));
  const twoKinds = model.findOrgan(kinds.document, pigment.organId);
  assert.equal(model.organTypes(twoKinds).length, 2);
  assert.notEqual(twoKinds.centers[1].qwidth, twoKinds.centers[0].qwidth);
  const yellow = model.updateCenter(kinds.document, twoKinds.centers[1].id, {q1 : .3});
  assert.equal(model.findOrgan(yellow, pigment.organId).centers[0].q1, twoKinds.centers[0].q1,
               'A kind of cell keeps its pigment apart from the others');
  const moreYellow = model.setOrganNodes(kinds.document, pigment.organId, 3, sites, kinds.typeId);
  assert.equal(model.organTypes(model.findOrgan(moreYellow, pigment.organId))[1].centers.length, 3);
  assert.equal(
      model
          .organTypes(model.findOrgan(
              model.removeOrganType(moreYellow, pigment.organId, kinds.typeId), pigment.organId))
          .length,
      1);
  assert.match(eyePanel, /data-link-pair/);
  assert.doesNotMatch(eyePanel,
                      /data-add-center|aid-center-tabs|data-field="tau"|data-field="copies"/);
  assert.match(
      panels.inspector({...state, tool : 'hormone', effect : E.output, focusSubstance : 0}),
      /data-phase-handle="start"/);
  assert.deepEqual(panels.phasePatch('start', 0), {start : null});
  assert.deepEqual(panels.phasePatch('end', 1), {end : null});
  assert.ok(panels.phasePatch('end', 0).end > 0, 'A cell dies at some maturity, never at none');
  assert.ok(Math.abs(panels.phasePatch('end', (36 + 107) / 260).end - .5) < 1e-9);
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
  assert.match(learner, /data-learn-rate/);
  assert.match(learner, /aid-episode-arrow teach none/);
  for (const effect of [E.teaching, E.learning, E.competition, E.eligibility])
    assert.match(learner,
                 new RegExp('data-learn-substance="off"[^>]*data-learn-effect="' + effect + '"'));
  const learnShelf = panels.libraryOf({...state, tool : 'learn'});
  assert.equal(learnShelf.kind, 'learn');
  for (const key of ['learn', 'modulate', 'pacemaker'])
    assert.match(learnShelf.html, new RegExp('data-drag-kind="neuron" data-drag-value="' + key));
  for (const effect of [E.teaching, E.learning, E.competition, E.eligibility])
    assert.match(learnShelf.html, new RegExp('data-drag-value="0:' + effect + '"'));
  assert.doesNotMatch(learnShelf.html, new RegExp('data-drag-value="0:' + E.death + '"'));
  assert.equal(panels.libraryOf({...state, tool : 'hormone'}).kind, 'hormone');
  assert.equal(panels.libraryOf({...state, tool : 'select'}).kind, 'select');
  const guide = panels.inspector({...state, selected : null});
  assert.match(guide, /aid-workflow/);
  assert.match(guide, /data-tool="wire"/);
  assert.match(panels.inspector({...state, selected : {kind : 'wire', id : doc.wires[0].id}}),
               /data-remove-wire/);
  assert.match(graph.cppnGraph({...state, report : null}), /aid-cppn/);
  const plan = model.compileDocument(doc, sites);
  const python = `import json,sys,tempfile,time
from atelier_service import run, CompileJobs
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
jobs=CompileJobs()
start=time.perf_counter();job=jobs.request({'operation':'build-start','plan':plan},None)
phases=set()
while job['status']=='running':
    phases.add(job['phase'])
    assert time.perf_counter()-start<12
    time.sleep(.02)
    job=jobs.request({'operation':'build-status','job':job['job']},None)
assert job['status']=='done',job
built=job['result'];duration=time.perf_counter()-start
assert 'search' in phases
cancelled=jobs.request({'operation':'build-start','plan':payload['example']},None)
jobs.request({'operation':'build-cancel','job':cancelled['job']},None)
while cancelled['status']=='running':
    time.sleep(.02)
    cancelled=jobs.request({'operation':'build-status','job':cancelled['job']},None)
assert cancelled['status']=='cancelled' and 'result' not in cancelled
jobs.close()
assert len(built['groups'])==len(plan['groups'])
assert all(g['cells']==p['copies'] if p['role']!=2 else g['cells']==1 for g,p in zip(built['groups'],plan['groups']))
assert all(len(c)==8 and c[2]>0 for c in built['contacts'])
# The design view: the same cells from the planned groups, without CPPN or development.
designed=run({'operation':'design','plan':plan,'sight':None})
empty=run({'operation':'design','plan':{**plan,'groups':[],'connections':[]},'sight':None})
assert designed['neurons']==built['neurons'] and designed['sites']==built['sites']
assert designed['visionDepth']>0 and designed['bodyRadius']>0 and 'sight' not in designed
# The fish's colour as the engine paints it: pigment can only darken its skin, the more the more
# it is spread, and the ground colour lies within that range; the spines shield it all round,
# raised at least as well as at rest.
colour=designed['colour']
steps=colour['range']
assert all(0<=q<=r<=s for s,r,q in zip(colour['skin'],steps[0],steps[-1]))
assert all(all(b<=a+1e-9 for a,b in zip(x,y)) for x,y in zip(steps,steps[1:]))
assert 0<=colour['restShare']<=1
assert len(designed['spinesRest'])==len(designed['spinesRaised'])==len(designed['spineGroups'])
assert all(0<=r<=q<=1 for r,q in zip(designed['spinesRest'],designed['spinesRaised']))
assert len(designed['zones'])==4 and abs(sum(e for f,e in designed['zones'])-2)<1e-6
# Sense probes: a scent, a touch, a bite or a current give each group an answer from 0 to 1, or none
# where no cell of the group senses it.
for kind in ('smell','touch','wound','flow'):
    probed=run({'operation':'design','plan':plan,'sight':None,
                'sense':{'kind':kind,'bearing':-60,'distance':3,'strength':.5,'scent':0}})
    answers=probed['senseProbe']
    assert len(answers)==len(plan['groups'])
    assert all(a is None or 0<=a<=1 for a in answers)
# Each group says what its pressure cells measure (-1 without any).
assert len(designed['pressure'])==len(plan['groups']) and all(p>=-1 for p in designed['pressure'])
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
# Editing a compiled genome retains its design contract.
edited=run({'operation':'edit','genome':built['genome'],'plan':plan,'edit':'add-node','type':0,'parameter':1})
assert 'compiler' in edited and edited['compiler']['ok']==built['compiler']['ok']
checked=run({'operation':'check','genome':built['genome'],'plan':plan})
assert len(checked['development'])==4 and 1<=len(checked['mutations'])<=8
assert all(isinstance(trial['ok'],bool) for trial in checked['development']+checked['mutations'])
for bad in ({**plan,'groups':plan['groups']+[plan['groups'][0]]},
            {**plan,'connections':[{'from':999,'to':0,'spread':0,'bundle':0}]},
            {**plan,'compiler':{**plan['compiler'],'reserve':-1}}):
    try: run({'operation':'build','plan':bad})
    except ValueError: pass
    else: raise AssertionError('Malformed plan accepted')
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
assert example['compiler']['ok'],example['compiler']
print(json.dumps({'built':built,'designed':designed,'target':target,'outside':outside,'blue':blue,'duration':duration,'example':{'viable':example['viable'],'checks':example['checks'],'contacts':example['contacts']}}))`;
  const currentEye = model.findOrgan(doc, id);
  const rayPlan = retina.retinalRays(currentEye, sites);
  const exampleStudio = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
  Object.assign(exampleStudio.state, {sites, capabilities : sitesResult});
  const regionModel = await import('../ui/studio/model/regions.js');
  exampleStudio.changeDocument =
      next => { exampleStudio.state.document = regionModel.settleRegions(next, sites); };
  exampleStudio.example();
  const examplePallium = exampleStudio.state.document.organs.find(o => o.type === 'pallium');
  const learning = examplePallium.centers.filter(c => c.stream);
  assert.deepEqual(learning.map(c => c.stream), [ 'olfactory', 'tectum' ]);
  assert.ok(learning.every(c => c.receptors[HORMONE_EFFECT.learning].active));
  const teacherPlaced =
      model.addNeuron(exampleStudio.state.document, 'modulate', sites,
                      geometry.sitePoint(sites.find(x => x.id === learning[0].site)));
  const teacherWired =
      model.addWire(teacherPlaced.document, teacherPlaced.centerId, learning[0].id);
  const taughtPallium = regionModel.settleRegions(teacherWired.document, sites)
                            .organs.find(o => o.id === examplePallium.id);
  assert.deepEqual(taughtPallium.centers.filter(c => c.stream).map(c => c.stream),
                   [ 'olfactory', 'tectum' ]);
  assert.match(panels.inspector({
    ...state,
    document : exampleStudio.state.document,
    selected : {kind : 'organ', id : examplePallium.id}
  }),
               /Für jede Art von Eingang/);
  const exampleTectum = exampleStudio.state.document.organs.find(o => o.type === 'tectum');
  const crowdedDoc = regionModel.updateRegion(exampleStudio.state.document, exampleTectum.id,
                                              {resolution : 6, colours : 1}, sites);
  assert.ok(model.findOrgan(crowdedDoc, exampleTectum.id).centers.some(c => c.node === 'out'),
            'A crowded region keeps its output');
  const crowdedIds = new Set(model.allCenters(crowdedDoc).map(c => c.id));
  assert.ok(regionModel.routedLinks(crowdedDoc, sites)
                .every(l => crowdedIds.has(l.to) || crowdedDoc.organs.some(o => o.id === l.to)));
  assert.doesNotThrow(
      () => panels.inspector(
          {...state, document : crowdedDoc, selected : {kind : 'organ', id : exampleTectum.id}}));
  for (const organ of exampleStudio.state.document.organs.filter(o => o.region))
    assert.equal(organ.centers.length,
                 regionModel.regionPlan(exampleStudio.state.document, organ).nodes.length,
                 organ.type + ' has room for its plan');
  assert.deepEqual(
      [
        ...new Set(exampleStudio.state.document.organs.filter(o => o.region).map(o => o.type))
      ].sort(),
      [ 'hindbrain', 'hypothalamus', 'olfactory', 'pallium', 'spinal', 'tectum' ]);
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
  const {built, target : seen, outside, blue} = response;
  assert.ok(response.example.viable, JSON.stringify(response.example.checks));
  const exampleDoc = exampleStudio.state.document, exampleCenters = model.allCenters(exampleDoc);
  const organOf = index => model.findCenter(exampleDoc, exampleCenters[index].id).organ;
  const optic = response.example.contacts.filter(([ from, to ]) => organOf(from).type === 'eye' &&
                                                                   organOf(to).type === 'tectum');
  assert.ok(optic.length &&
            optic.every(([ from, to ]) => organOf(from).side * organOf(to).side < 0));
  assert.ok(response.example.contacts.every(([ from, to ]) => organOf(from).type !== 'tectum' ||
                                                              organOf(to).type !== 'tectum' ||
                                                              organOf(from) === organOf(to)));
  for (const [kind, sources] of [[ MOTOR_KIND.aggression, [ 'pallium', 'tectum' ] ],
                                 [ MOTOR_KIND.suction, [ 'olfactory', 'pallium' ] ]]) {
    const muscles =
        exampleDoc.organs.filter(o => o.type === 'muscle' && organFunction(o, sites) === kind);
    assert.ok(muscles.length);
    const feeders = exampleDoc.wires.filter(w => muscles.some(m => m.id === w.to))
                        .map(w => model.findOrgan(exampleDoc, w.from)?.type)
                        .sort();
    assert.deepEqual([...new Set(feeders) ], sources);
    assert.ok(response.example.contacts.some(([, to ]) => muscles.includes(organOf(to))),
              'The built fish reaches its mouth muscles of kind ' + kind);
  }
  assert.ok(geometry.FISH_BOX.width / geometry.CAMERA_ZOOM.min >=
            response.designed.visionDepth * geometry.BODY_RADIUS);
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
  const readout = await import('../ui/organ_readout.js');
  const typeRows =
      readout.eyeTypeAnswers(readout.eyeSight(seen.sight.bands, seen.sight.samples, eyeCells(seen),
                                              model.findOrgan(doc, id).side < 0 ? 0 : 1));
  assert.equal(typeRows.length,
               new Set(model.findOrgan(doc, id).field.profiles.map(p => p.id)).size);
  assert.ok(typeRows.every(row => row.values.some(v => v !== null) &&
                                  row.values.every(v => v === null || (v >= 0 && v <= 1))));
  for (const ray of rayPlan) {
    const index = model.allCenters(doc).findIndex(c => c.id === ray.center);
    const actual = seen.sight.receptors.find(
        (row, i) => seen.sight.groups[i] === index &&
                    Math.abs(row[RECEPTOR.angle] * 180 / Math.PI - ray.angle) < .001);
    assert.ok(actual, 'Displayed receptor has an engine counterpart');
    assert.ok(Math.abs(actual[RECEPTOR.view_left] * 180 / Math.PI - ray.left) < .001);
    assert.ok(Math.abs(actual[RECEPTOR.view_right] * 180 / Math.PI - ray.right) < .001);
  }
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
    const p = views.nodeLocation(doc, sites, c, c.organType);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  for (const type of ['eye', 'proximity', 'muscle', 'eggs', 'sperm', 'gland'])
    assert.ok(doc.organs.filter(o => o.type === type)
                  .some(o => svg.includes('data-organ="' + o.id + '"')),
              type + ' remains selectable');
  const fan = vision.visionGeometry(rendered, currentEye),
        place = seen.eyePlaces[currentEye.side < 0 ? 0 : 1];
  assert.deepEqual(fan.eye, views.viewOrigin(doc, sites, currentEye.side < 0 ? -1 : 1));
  assert.ok(
      Math.abs(fan.origin.x - (geometry.BODY_MIDDLE.x - place[0] * geometry.BODY_RADIUS)) < 1e-9 &&
      Math.abs(fan.origin.y - (geometry.BODY_MIDDLE.y + place[1] * geometry.BODY_RADIUS)) < 1e-9);
  assert.ok(fan.cut > Math.hypot(fan.origin.x - fan.eye.x, fan.origin.y - fan.eye.y));
  const inside = {side : currentEye.side, bearing : 30, distance : 0, radius : .01, hue : 20};
  const cleared = vision.clearOfFish(rendered, currentEye, inside);
  const lit = fan.pointText(cleared.bearing, cleared.distance * fan.world);
  assert.ok(cleared.distance > 0 && Math.hypot(lit.x - fan.eye.x, lit.y - fan.eye.y) >= fan.cut);
  {
    const E = HORMONE_EFFECT, r = (baseline, sensitivity) => ({baseline, sensitivity});
    assert.equal(model.effectLevel(E.output, 0), .5);
    assert.equal(model.effectDirection(E.output, r(0, 1)), 1);
    assert.equal(model.effectDirection(E.output, r(1, -2)), -1);
    assert.equal(model.effectDirection(E.death, r(0, 1)), 1);
    assert.equal(model.effectDirection(E.death, r(.8, -1)), -1);
    assert.equal(model.effectDirection(E.learning, r(0, 0)), 0);
    assert.deepEqual(model.startEnds(E.output), {without : 1, with : -1});
    const effectsView = await import('../ui/studio/view/effects.js');
    assert.notEqual(effectsView.effectScene(E.output, '#fff', {without : 0, with : 1}),
                    effectsView.effectScene(E.output, '#fff', {without : 1, with : 0}),
                    'Each side plays as the receptor answers there');
    const substancesView = await import('../ui/studio/view/substances.js');
    assert.match(substancesView.boundEffect(E.output, 1), /aid-direction/);
  }
  const started = vision.beyondHandles(rendered, currentEye, cleared);
  const away = fan.pointText(started.bearing, started.distance * fan.world);
  assert.ok(Math.hypot(away.x - fan.eye.x, away.y - fan.eye.y) > fan.handle,
            'A new test light covers none of the handles');
  const onRing = fan.ring(currentEye.side * 45, fan.handle);
  assert.ok(Math.abs(Math.hypot(onRing.x - fan.eye.x, onRing.y - fan.eye.y) - fan.handle) < 1e-6);
  assert.throws(() => model.validateDocument({...doc, format : 'v019-organ-studio'}));
  const withoutOptions = structuredClone(doc);
  delete withoutOptions.compiler;
  assert.deepEqual(
      model.compileDocument(withoutOptions, sites), model.compileDocument(doc, sites),
      'Optional compiler settings have defaults; existing drafts keep every organ and wire');
  assert.equal(withoutOptions.compiler, undefined, 'Reading defaults does not mutate the document');
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
  const {acceptedGenome, compilerPanel} = await import('../ui/studio/view/compiler.js');
  editor.state = {
    ...editor.state,
    document : doc,
    genome : 'test',
    stale : false,
    report : {compiler : {ok : true}}
  };
  assert.ok(acceptedGenome(editor.state));
  editor.state.report.compiler.ok = false;
  assert.ok(!acceptedGenome(editor.state));
  let requested = false;
  editor.api = async () => { requested = true; };
  await editor.checkCompiler();
  assert.ok(!requested, 'A failed build cannot start robustness tests');
  editor.state.report.compiler.ok = true;
  editor.api = () => new Promise(resolve => { resolveBuild = resolve; });
  const checkPending = editor.checkCompiler();
  editor.state.document = model.updateField(doc, id, {density : 5}, sites);
  resolveBuild({development : [ {ok : true} ], mutations : []});
  await checkPending;
  assert.ok(!editor.state.robustness, 'A late check cannot attach to an edited plan');
  assert.match(compilerPanel({...editor.state, stale : true}), /data-compiler-option="reserve"/);
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
    target : {closest : sel => sel === views.BODY_MAP ? svgElement : null}
  });
  assert.ok(pan.pointer.pan, 'Dragging the empty canvas pans without switching tools');
  pan.pointerMove({clientX : 240, clientY : 220});
  assert.notEqual(pan.state.camera.x, 560);
  pan.pointerUp({preventDefault() {}});
  const chooser = new OrganStudio(emptyRoot);
  chooser.state = {...chooser.state, ...state, document : twoTypes, visionProfile : null};
  chooser.refreshScene = chooser.refreshInspector = () => {};
  chooser.api = () => new Promise(() => {});
  chooser.select('center', extraNode);
  assert.equal(chooser.state.visionProfile, 'extra');
  chooser.select('organ', id);
  assert.deepEqual(chooser.state.selected, {kind : 'organ', id});
  chooser.select(null, null);
  assert.equal(chooser.state.selected, null);
  assert.equal(chooser.state.visionProfile, 'extra');
  const wiresView = await import('../ui/studio/view/wires.js');
  const bentWire = doc.wires[0];
  const bendState = {...state, document : doc, tool : 'wire'};
  const bendPoint = {x : 400, y : 300};
  const bends = wiresView.bendsWith(bendState, [ bentWire.id ], bendPoint, false);
  assert.deepEqual(bends, [ bendPoint ]);
  const bentDoc = model.setBends(doc, [ bentWire.id ], bends);
  assert.deepEqual(bentDoc.wires.find(w => w.id === bentWire.id).bends, [ bendPoint ]);
  assert.match(views.fishScene({...bendState, document : bentDoc}), /data-bend-index="0"/);
  assert.equal(
      model.setBends(bentDoc, [ bentWire.id ], []).wires.find(w => w.id === bentWire.id).bends,
      undefined);
  assert.throws(() => model.validateDocument(
                    {...bentDoc, wires : [ {...bentWire, bends : [ {x : 'a', y : 1} ]} ]}));
  const toTeach = model.addNeuron(model.newDocument('Lehrer'), 'learn', sites, {x : 380, y : 325});
  const teacherStudio = new OrganStudio(emptyRoot);
  teacherStudio
      .state = {...teacherStudio.state, ...state, document : toTeach.document, tool : 'learn'};
  teacherStudio.refreshScene = teacherStudio.refreshInspector = teacherStudio.refreshHeader =
      () => {};
  teacherStudio.api = () => new Promise(() => {});
  assert.ok(teacherStudio.ontoNerve('neuron', 'modulate') &&
            !teacherStudio.ontoNerve('neuron', 'relay'));
  const learnerCell = model.findCenter(toTeach.document, toTeach.centerId).center;
  teacherStudio.dropOntoNerve(
      'modulate', {element : {dataset : {center : learnerCell.id}}, centers : [ learnerCell ]},
      {x : 380, y : 325});
  const teaching = teacherStudio.state.document.wires.filter(w => w.to === learnerCell.id);
  assert.equal(teaching.length, 1);
  assert.equal(model.findCenter(teacherStudio.state.document, teaching[0].from).center.key,
               'modulate');
  assert.deepEqual(teacherStudio.state.selected, {kind : 'center', id : learnerCell.id});
  assert.equal(teacherStudio.state.tool, 'learn');
  const relayNode =
      model.addNeuron(teacherStudio.state.document, 'relay', sites, {x : 420, y : 325});
  teacherStudio.state.document = relayNode.document;
  const relayCell = model.findCenter(relayNode.document, relayNode.centerId).center;
  assert.equal(nerveKind(relayCell), 'relay');
  teacherStudio.dropOntoNerve(
      'learn', {element : {dataset : {center : relayCell.id}}, centers : [ relayCell ]},
      {x : 420, y : 325});
  const learned = model.findCenter(teacherStudio.state.document, relayCell.id).center;
  assert.equal(nerveKind(learned), 'learn');
  assert.equal(learned.key, 'relay');
  assert.ok(learned.qwidth > 0);
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
  movement.pointer = {kind : 'organ', id, moved : true, svg : svgElement};
  movement.notice = () => {};
  movement.pointerUp({clientX : 500, clientY : 300, preventDefault() {}});
  assert.equal(deleted, true);
  {
    const {MOTOR_KIND : MK, ATELIER_LIMITS} = await import('../ui/schema.js');
    const {finVolumeOf, tailFinSize} = await import('../ui/fish_organs.js');
    const tail = model.addOrgan(model.newDocument('Knoten'), 'muscle', sites, {x : 870, y : 340});
    assert.ok(tail);
    const grown = model.setOrganNodes(tail.document, tail.organId, 4, sites);
    const organ = model.findOrgan(grown, tail.organId), twin = model.findOrgan(grown, organ.pair);
    assert.equal(organ.centers.length, 4);
    assert.equal(twin.centers.length, 4, 'The linked twin recruits as many nodes');
    const siteOf = c => sites.find(s => s.id === c.site);
    for (const c of [...organ.centers, ...twin.centers])
      assert.equal(functionFor(c, siteOf(c)), MK.forward, 'Every node drives the tail');
    assert.equal(new Set(organ.centers.map(c => siteOf(c).side)).size, 1);
    assert.equal(new Set([...organ.centers, ...twin.centers ].map(c => c.site)).size, 8);
    assert.equal(
        model.findOrgan(model.setOrganNodes(grown, organ.id, 2, sites), organ.id).centers.length, 2,
        'The last nodes go first');
    assert.equal(model.setOrganNodes(grown, 'brain', 3, sites), null);
    const most = nodeLimit(organ, sites);
    assert.equal(most, musclePlaces(sites, MK.forward, organ.side).length);
    assert.equal(
        model.findOrgan(model.setOrganNodes(grown, organ.id, 999, sites), organ.id).centers.length,
        most);
    const again = model.addOrgan(grown, 'muscle', sites, {x : 870, y : 340});
    assert.equal(again.organId, organ.id);
    assert.equal(again.document.organs.length, grown.organs.length);
    assert.ok(tailFinSize(finVolumeOf(8, 1)).length > tailFinSize(finVolumeOf(2, 1)).length,
              'More cells make a longer tail fin');
    assert.equal(model.muscleTrait(grown, MK.forward, 'undulation', sites), .5);
    const waving = model.setMuscleTrait(grown, MK.forward, 'undulation', .9, sites);
    assert.ok(Math.abs(model.muscleTrait(waving, MK.forward, 'undulation', sites) - .9) < 1e-9);
    assert.equal(model.setMuscleTrait(grown, MK.aggression, 'jaw_length', .2, sites), null,
                 'Without biting muscles there is no jaw to set');
    const effectors = await import('../ui/studio/view/effectors.js');
    assert.deepEqual(effectors.effectorPatch(MK.forward, 'nodes', 1, .5, most), {nodes : most});
    assert.equal(effectors.effectorPatch(MK.forward, 'nodes', 0, .5, most).nodes, 1);
    assert.deepEqual(effectors.effectorPatch(MK.forward, 'strength', 1, .5, most),
                     {copies : ATELIER_LIMITS.max_copies});
    assert.deepEqual(effectors.effectorPatch(MK.aggression, 'trait:q2', 0, .5, most),
                     {trait : 'jaw_length', value : 1});
    assert.deepEqual(effectors.effectorPatch(MK.aggression, 'chart:teeth', 1, .5, most),
                     {trait : 'blunt_teeth', value : 1});
    assert.equal(effectors.effectorPatch(MK.suction, 'chart:suction', 1, .5, most), null);
    const html = effectors.effectorGraphic({document : grown, sites, anatomy : null}, organ);
    assert.ok(html.includes('data-effector-handle="nodes"') &&
              html.includes('data-effector-handle="strength"') &&
              html.includes('data-effector-handle="trait:q1"') && !html.includes('ellipse'));
    assert.match(views.organTitle(organ, sites), /Schwanz/);
    const pigment =
        model.addOrgan(model.newDocument('Farbe'), 'pigment', sites, {x : 600, y : 260});
    const deeper = model.setOrganNodes(pigment.document, pigment.organId, 12, sites);
    assert.equal(model.findOrgan(deeper, pigment.organId).centers.length, 12);
    const blood = model.addOrgan(model.newDocument('Blut'), 'blood', sites, {x : 610, y : 405});
    assert.equal(model.findOrgan(blood.document, blood.organId).pair, null);
    assert.equal(model.addOrgan(blood.document, 'blood', sites, {x : 610, y : 325}).organId,
                 blood.organId);
    const firstRead =
        model.substanceRead(sitesResult, model.findOrgan(blood.document, blood.organId).centers[0]);
    const twoTypes = model.addOrganType(
        blood.document, blood.organId, sites,
        model.nextTypeTuning(model.findOrgan(blood.document, blood.organId), sitesResult));
    const reads = model.organTypes(model.findOrgan(twoTypes.document, blood.organId))
                      .map(type => model.substanceRead(sitesResult, type.centers[0]));
    assert.equal(reads.length, 2);
    assert.ok(reads.includes(firstRead) && new Set(reads).size === 2);
    const ovary = model.addOrgan(model.newDocument('Eier'), 'eggs', sites, {x : 708, y : 380});
    const fertile = model.setOrganNodes(ovary.document, ovary.organId, 99, sites);
    const gonad = model.findOrgan(fertile, ovary.organId), keys = gonad.centers.map(c => c.key);
    assert.equal(keys.filter(k => k === 'growth').length, kindLimit(gonad, sites));
    assert.equal(keys.length, ORGAN_BY_KEY.eggs.nodes);
    assert.deepEqual(keys.filter(k => k !== 'growth'), [ 'release', 'pressure' ]);
    assert.equal(model.compileDocument(fertile, sites).groups.length, keys.length);
    const sacs = await import('../ui/studio/view/sacs.js');
    const fewer = model.setOrganNodes(fertile, gonad.id, 2, sites);
    assert.deepEqual(model.findOrgan(fewer, gonad.id).centers.map(c => c.key).sort(),
                     [ 'growth', 'growth', 'pressure', 'release' ]);
    const small = model.findOrgan(fewer, gonad.id);
    const sacState = {document : fewer, sites, capabilities : sitesResult};
    const store = sacs.gonadStore(sacState, small);
    assert.equal(store.room, sitesResult.gonads.eggs.perCell * 3);
    const sac = sacs.gonadGraphic(sacState, small);
    assert.equal(sac.match(/aid-sac-chamber growth"/g).length, 2);
    assert.ok(sac.includes('data-sac-handle="cells"') && sac.includes('data-sac-handle="stretch"'));
    assert.ok(sacs.sacPatch(sacState, small, 'cells', .2).nodes > 2);
    assert.equal(sacs.sacPatch(sacState, small, 'cells', .9).nodes, 1);
    const testis =
        model.addOrgan(model.newDocument('Spermien'), 'sperm', sites, {x : 708, y : 380});
    const testisState = {document : testis.document, sites, capabilities : sitesResult};
    assert.match(sacs.gonadGraphic(testisState, model.findOrgan(testis.document, testis.organId)),
                 /aid-gonad-graphic/);
    const facts = state => sacs.gonadFacts(state, small);
    assert.ok(
        !facts(sacState).includes(t('studio.inspector.gonad.food', {least : 0}).split(':')[0]));
    assert.ok(facts({...sacState, stale : false, report : {eggMinimum : store.room * 2}})
                  .includes(t('studio.inspector.gonad.food', {least : 0}).split(':')[0]));
    const group = model.assemble(grown, [ organ.id, twin.id ], '');
    const renamed = model.renameAssembly(group, group.assemblies[0].id, 'Schwanz');
    assert.equal(renamed.assemblies[0].name, 'Schwanz');
    assert.equal(model.renameAssembly(group, group.assemblies[0].id, ''), null);
  }
  {
    const eggs = model.addOrgan(model.newDocument('Ei'), 'eggs', sites, {x : 850, y : 365});
    assert.ok(eggs);
    const relay = model.addNeuron(eggs.document, 'relay', sites, {x : 420, y : 340});
    const out = model.addWire(relay.document, eggs.organId, relay.centerId);
    assert.ok(out, 'The fullness of a gonad can be wired on');
    const trigger = model.addWire(out.document, relay.centerId, eggs.organId);
    assert.ok(trigger);
    const organ = model.findOrgan(trigger.document, eggs.organId);
    const release = organ.centers.find(c => c.key === 'release');
    const calm = model.updateCenter(trigger.document, release.id, {threshold : .9});
    const plan = model.compileDocument(calm, sites);
    const group = key => plan.groups.find(g => g.name === 'eggs:' + key);
    const targetGroups = plan.connections.map(e => plan.groups[e.to]);
    assert.ok(targetGroups.includes(group('release')), 'The trigger reaches the release');
    assert.ok(!targetGroups.includes(group('growth')), 'The trigger leaves the growth alone');
    assert.equal(group('release').threshold, .9, 'A gonad keeps the rest set for it');
    const nose = model.addOrgan(model.newDocument('Nase'), 'nose', sites, {x : 150, y : 340});
    assert.ok(nose);
    const moved = model.moveOrgan(nose.document, nose.organId, sites, {x : 880, y : 340});
    const zoneOf = doc =>
        sites.find(s => s.id === model.findOrgan(doc, nose.organId).centers[0].site).zone;
    assert.ok(!moved || zoneOf(moved) === 0, 'A nose cannot be moved out of the head');
  }
  {
    const drive = await import('../ui/studio/view/drive.js');
    const scale = sitesResult.biasScale;
    assert.ok(scale > 0);
    assert.ok(Math.abs(drive.restLevel({threshold : -1}, scale) - Math.tanh(scale)) < 1e-12);
    assert.ok(Math.abs(drive.restLevel({threshold : 0}, scale)) < 1e-12);
    const back = drive.drivePatch('rest', .1, 0, scale).threshold;
    assert.ok(Math.abs(back + 1) < 1e-9, 'The top of the rest band is the lowest threshold');
  }
  {
    const bladder =
        model.addOrgan(model.newDocument('Blase'), 'bladder', sites, {x : 600, y : 365});
    const organ = model.findOrgan(bladder.document, bladder.organId);
    const sensor = organ.centers.find(c => c.key === 'pressure'),
          motor = organ.centers.find(c => c.role === 'motor');
    const near = model.nodeSitesNear(bladder.document, sensor.id, motor.id, sites);
    assert.ok(near.length && near.every(s => s.id !== motor.site && s.id !== sensor.site));
    const moved = model.placeNode(bladder.document, sensor.id, near[0].id, sites);
    assert.equal(model.findCenter(moved, sensor.id).center.site, near[0].id);
    assert.equal(model.placeNode(bladder.document, sensor.id, motor.site, sites), null,
                 'A node takes a free place only');
  }
  {
    const units = await import('../ui/units.js');
    assert.equal(units.clamp(2), 1);
    assert.equal(units.clamp(-2, -1), -1);
    assert.equal(units.clamp(.3), .3);
    const tuningMath = await import('../ui/tuning.js');
    for (const tau of [0, .3, 1])
      assert.ok(Math.abs(tuningMath.timeConstantOf(tuningMath.timeConstantSteps(tau)) - tau) <
                1e-9);
    assert.equal(tuningMath.timeConstantSteps(1), tuningMath.LONGEST_TIME_CONSTANT);
    for (const field of [0, .4, 1])
      assert.ok(Math.abs(tuningMath.contactFieldOf(tuningMath.contactHalfAngle(field)) - field) <
                1e-9);
    for (const plan of [-1, -.2, 1])
      assert.ok(Math.abs(tuningMath.planOfUnit(tuningMath.unitOfPlan(plan)) - plan) < 1e-9);
    assert.equal(tuningMath.preferredScent({...tuningMath.scentTuning(2), qwidth : .3}), 2,
                 'A tuning aimed at a scent prefers it');
    const strings = await import('../ui/strings.js');
    assert.equal(strings.formatSigned(.25, 2, true), '+0,25');
    assert.equal(strings.formatSigned(-.25, 2, true), '-0,25');
    assert.equal(strings.joinParts([ 'a', '', null, 'b' ]), 'a · b');
    assert.equal(strings.linkText('a', 'b'), 'a → b');
    assert.equal(strings.namedText('a', 'b'), 'a: b');
    const markup = await import('../ui/studio/view/markup.js');
    assert.equal(markup.dataAttribute('probeBlock'), 'data-probe-block');
    const pad = {width : 200, height : 100, inset : 10};
    for (const [across, up] of [[ -1, 0 ], [ .5, .25 ], [ 1, 1 ]]) {
      const p = markup.padPoint(pad, across, up);
      const back = markup.padValues(pad, p.x / pad.width, p.y / pad.height);
      assert.ok(Math.abs(back.across - across) < 1e-9 && Math.abs(back.up - up) < 1e-9,
                'A pad reads back the point it shows');
    }
    assert.match(markup.widthTrack([ 10, 90 ], 5, .5, 'data-x', 'Breite'), /cx="50\.00"/);
    assert.doesNotMatch(markup.namedTrack([ 10, 90 ], 5, null, 'data-x', 'T', [ 'a', 'b' ]),
                        /aid-graphic-handle|data-x/, 'A track without a share has no handle');
    assert.equal(markup.trackShare(50, [ 10, 90 ]), .5);
    const substancesView = await import('../ui/studio/view/substances.js');
    const wheelMarks = substancesView.wheelMarks({q1 : .4, q2 : -.3});
    const wheelMark = Object.values(wheelMarks)[0];
    const W = substancesView.WHEEL;
    const wheelBack = substancesView.wheelPatch(wheelMark.cx / W.size, wheelMark.cy / W.height);
    assert.ok(Math.abs(wheelBack.q1 - .4) < 1e-9 && Math.abs(wheelBack.q2 + .3) < 1e-9);
    const learningView = await import('../ui/studio/view/learning.js');
    const layersView = await import('../ui/studio/view/layers.js');
    const far = {tool : 'wire', camera : {zoom : .5}, layers : {}};
    assert.ok(!layersView.layerShown(far, 'nodes') && layersView.layerShown(far, 'wires'));
    assert.ok(!layersView.layerShown({...far, tool : 'select'}, 'wires'));
    assert.ok(layersView.layerShown({...far, tool : 'hormone'}, 'hormones') &&
              !layersView.layerShown(far, 'hormones'));
    const on = {...far, layers : layersView.switchLayer(far, 'nodes')};
    assert.ok(layersView.layerShown(on, 'nodes') &&
              layersView.layerShown({...on, tool : 'learn'}, 'nodes'));
    const off = {...far, layers : layersView.switchLayer(on, 'nodes')};
    assert.ok(!layersView.layerShown({...off, camera : {zoom : 3}}, 'nodes'));
    assert.equal(
        layersView.layerMode({...far, layers : layersView.switchLayer(off, 'nodes')}, 'nodes'),
        layersView.AUTO);
    assert.ok(Math.abs(learningView.learnModePatch(.5).mode) < 1e-9);
    assert.ok(learningView.learnRatePatch(1).qwidth === 1 &&
              learningView.learnRatePatch(0).qwidth === 0);
    const learnNode =
        model.addNeuron(model.newDocument('Lernen'), 'learn', sites, {x : 380, y : 325});
    const learnPanel = learningView.learningInspector({
      document : learnNode.document,
      sites,
      capabilities : sitesResult,
      selected : {kind : 'center', id : learnNode.centerId},
      effect : HORMONE_EFFECT.learning
    });
    assert.ok(learnPanel.includes('data-learn-rate') && learnPanel.includes('data-learn-mode') &&
              learnPanel.includes('data-learn-trace'));
    assert.match(learnPanel, /ohne Lehrer: nur auswählen/);
    const widths = [
      ...learnPanel.matchAll(
          /aid-episode-line[^>]*><animate attributeName="stroke-width" values="([^"]+)"/g)
    ].map(m => m[1].split(';').map(Number));
    assert.ok(Math.max(...widths[0]) > widths[0][0] && Math.min(...widths[1]) < widths[1][0]);
    const traceHandle = /data-graphic-handle="learn-trace" cx="([^"]+)"/.exec(learnPanel);
    const learnCell = model.findCenter(learnNode.document, learnNode.centerId).center;
    assert.ok(Math.abs(learningView.learnTracePatch(traceHandle[1] / 300).tau - learnCell.tau) <
              1e-2);
    assert.ok(Math.abs(learningView.learnResponseOf(.5)) < 1e-9);
    const taughtDoc =
        model.bindReceptor(learnNode.document, learnNode.centerId, HORMONE_EFFECT.teaching, 0);
    const excitationDoc = model.addSubstance(
        model.bindReceptor(learnNode.document, learnNode.centerId, HORMONE_EFFECT.excitation, 0),
        HORMONES.levels);
    assert.deepEqual(model.teachersOf(excitationDoc,
                                      model.findCenter(excitationDoc, learnNode.centerId).center,
                                      sitesResult),
                     []);
    const bothDoc =
        model.bindReceptor(excitationDoc, learnNode.centerId, HORMONE_EFFECT.teaching, 0);
    const bothCell = model.findCenter(bothDoc, learnNode.centerId).center;
    assert.equal(model.teachersOf(bothDoc, bothCell, sitesResult).length, 1);
    assert.ok(model.boundEffects(bothCell, 0, sitesResult).includes(HORMONE_EFFECT.excitation));
    assert.ok(model.boundEffects(bothCell, 0, sitesResult).includes(HORMONE_EFFECT.teaching));
    const taughtPanel = learningView.learningInspector({
      document : model.addSubstance(taughtDoc, HORMONES.levels),
      sites,
      capabilities : sitesResult,
      selected : {kind : 'center', id : learnNode.centerId}
    });
    assert.match(taughtPanel, new RegExp('data-learn-receptor="[^"]+" data-learn-effect="' +
                                         HORMONE_EFFECT.teaching + '"'));
    assert.doesNotMatch(taughtPanel, /aid-episode-arrow teach none/);
    const skinView = await import('../ui/studio/view/skin.js');
    const touched = model.addOrgan(model.newDocument('Haut'), 'touch', sites, {x : 400, y : 265});
    const touchOrgan = model.findOrgan(touched.document, touched.organId),
          touchCell = touchOrgan.centers[0], skinState = {document : touched.document, sites};
    const skinMarkup = skinView.skinField(skinState, touchOrgan, touchCell);
    const skinAim = Number(/data-skin-aim="([^"]+)"/.exec(skinMarkup)[1]);
    const skinBack = name => {
      const [, cx, cy] =
          new RegExp('data-skin-handle="' + name + '" cx="([^"]+)" cy="([^"]+)"').exec(skinMarkup);
      const box = /viewBox="0 0 (\S+) (\S+)"/.exec(skinMarkup);
      return skinView.skinPatch(skinState, touchCell, skinAim, name, cx / box[1], cy / box[2], {});
    };
    const probesView = await import('../ui/studio/view/probes.js');
    const {probeFor} = await import('../ui/studio/model/probe.js');
    for (const [type, at] of [[ 'nose', {x : 200, y : 330} ], [ 'touch', {x : 400, y : 265} ]]) {
      const placed = model.addOrgan(model.newDocument('Reiz'), type, sites, at);
      const probed = model.findOrgan(placed.document, placed.organId),
            probe = probeFor(probed, null);
      const probeState = {
        document : placed.document,
        sites,
        selected : {kind : 'organ', id : probed.id},
        senseProbe : probe,
        anatomy : {lightDimmest : 1e-4}
      };
      const markup = probesView.senseProbeSvg(probeState);
      const [, hx, hy] =
          /data-sense-handle="[^"]+" data-steady transform="translate\(([^ ]+) ([^)]+)\)/.exec(
              markup);
      const back = probesView.probePatch(probe.kind, {x : Number(hx), y : Number(hy)}, 1e-4);
      assert.ok(Math.abs(back.bearing - probe.bearing) < 3, type + ' bearing reads back');
      const amount = probe.kind === 'smell' ? 'distance' : 'strength';
      assert.ok(Math.abs(back[amount] - probe[amount]) / probe[amount] < .1, type + ' reads back');
      assert.equal(probesView.senseProbeSvg({...probeState, selected : null}), '');
    }
    assert.ok(Math.abs(skinBack('field').field - touchCell.field) < .05);
    assert.ok(Math.abs(skinBack('sensitivity').threshold - touchCell.threshold) < .05);
    const layout = await import('../ui/studio/model/layout.js');
    assert.deepEqual(layout.centroid([ {x : 0, y : 0}, {x : 4, y : 2} ]), {x : 2, y : 1});
    assert.ok(sites.filter(layout.nerveZone)
                  .every(s => s.zone === layout.ZONE.head || s.zone === layout.ZONE.trunk));
    assert.deepEqual(model.contactBundle([ 1, 2, 3, .5, 2, 1, .7, -.4 ]), {
      from : 1,
      to : 2,
      count : 3,
      weight : .5,
      positive : 2,
      negative : 1,
      positiveWeight : .7,
      negativeWeight : -.4
    });
    assert.deepEqual(graph.cppnNode([ 9, 3, .25, 0 ]),
                     {id : 9, type : 3, parameter : .25, role : 0});
    assert.deepEqual(graph.cppnLink([ 4, 1, 9, -.5, 1, 0 ]),
                     {id : 4, from : 1, to : 9, weight : -.5, enabled : 1, port : 0});
    const gutDoc = model.addOrgan(model.newDocument('Darm'), 'gut', sites, {x : 760, y : 360});
    const held = model.usedSites(gutDoc.document);
    assert.equal(held.size, model.allCenters(gutDoc.document).length);
    const muscle = ORGAN_BY_KEY.muscle.centers[0];
    const free =
        model.closestSiteDoing(muscle, MOTOR_KIND.forward, sites, held, {x : 850, y : 360});
    assert.ok(free && !held.has(free.id) && functionFor(muscle, free) === MOTOR_KIND.forward,
              'The nearest free place doing the work asked for');
    const regionTarget = views.placementTarget(model.newDocument(''), 'tectum', {x : 300, y : 330});
    assert.deepEqual(regionTarget.position, {x : 300, y : 330},
                     'A region goes to the free places in the brain nearest to where it is put');
    const brainPlaces = await import('../ui/studio/view/places.js');
    const cerebrum = brainPlaces.BRAIN.cerebrum;
    const onLobe = {x : (cerebrum.from + cerebrum.to) / 2, y : 365 - cerebrum.half / 2};
    const node = model.addNeuron(model.newDocument('Knoten'), 'relay', sites, onLobe, 60);
    const nodeAt = brainPlaces.centerLocation(model.findCenter(node.document, node.centerId).center,
                                              'brain', sites);
    assert.ok(Math.hypot(nodeAt.x - onLobe.x, nodeAt.y - onLobe.y) < 60,
              'A node stays in the brain');
    {
      const layout = await import('../ui/studio/model/layout.js');
      const middle = model.moveCenterToSide(node.document, node.centerId, 0, sites);
      const placed = model.findCenter(middle, node.centerId).center;
      const site = sites.find(s => s.id === placed.site);
      assert.ok(layout.onMidline(site));
      const at = brainPlaces.nodeLocation(middle, sites, placed, 'brain');
      assert.equal(at.y, layout.BODY_FRAME.middle, 'A midline node stands on the midline');
      const twin = model.mirroredSite(site, sites);
      const both = model.addNeuron(middle, 'relay', sites, layout.sitePoint(twin, 'nerve'), 1);
      const other = model.findCenter(both.document, both.centerId).center;
      assert.equal(other.site, twin.id);
      const a = brainPlaces.nodeLocation(both.document, sites, placed, 'brain'),
            b = brainPlaces.nodeLocation(both.document, sites, other, 'brain');
      assert.ok(Math.abs(a.y - b.y) > 0 &&
                Math.sign(a.y - b.y) === Math.sign(site.side - twin.side));
    }
    {
      const layout = await import('../ui/studio/model/layout.js');
      const REGION_HIDDEN = .25;
      const regions = [
        'tectum', 'olfactory', 'hindbrain', 'spinal', 'pallium', 'torus', 'cerebellum',
        'hypothalamus'
      ];
      let full = model.newDocument('Alle Regionen');
      for (const type of regions) {
        const placed =
            sites.filter(s => !s.outer)
                .map(s => model.addOrgan(full, type, sites, layout.sitePoint(s, 'nerve')))
                .find(Boolean);
        assert.ok(placed, type + ' still finds room in a brain with every other region');
        full = placed.document;
      }
      const boxes = full.organs.filter(o => o.region).map(o => {
        const points = o.centers.map(c => brainPlaces.nodeLocation(full, sites, c, o.type));
        const xs = points.map(p => p.x), ys = points.map(p => p.y);
        return {
          o,
          x : [ Math.min(...xs), Math.max(...xs) ],
          y : [ Math.min(...ys), Math.max(...ys) ]
        };
      });
      const overlap = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
      const area = box => (box.x[1] - box.x[0]) * (box.y[1] - box.y[0]);
      for (const a of boxes)
        for (const b of boxes)
          if (a.o.id < b.o.id)
            assert.ok(overlap(a.x, b.x) * overlap(a.y, b.y) <
                          REGION_HIDDEN * Math.min(area(a), area(b)),
                      a.o.type + ' and ' + b.o.type + ' do not hide each other');
    }
    const torus = model.addOrgan(model.newDocument('Torus'), 'torus', sites, onLobe);
    const cluster = brainPlaces.organLocation(model.findOrgan(torus.document, torus.organId), sites,
                                              torus.document);
    assert.ok(Math.hypot(cluster.x - onLobe.x, cluster.y - onLobe.y) < 60, 'A region stays there');
    const effectorsView = await import('../ui/studio/view/effectors.js');
    const lone = model.findOrgan(gutDoc.document, gutDoc.organId);
    assert.match(effectorsView.gutGraphic({document : gutDoc.document, sites}, lone),
                 /data-effector-handle="trait:q1"><line[^]*aid-graphic-handle/,
                 'A gut without its throat still offers its length');
    const homeTarget = views.placementTarget(model.newDocument(''), 'gut', {x : 300, y : 330});
    assert.equal(homeTarget.snap, Infinity, 'An inner organ goes to its home from any distance');
    const freeTarget = views.placementTarget(model.newDocument(''), 'eye', {x : 300, y : 330});
    assert.deepEqual(freeTarget.position, {x : 300, y : 330});
    const grouped = model.assembleSelection(gutDoc.document, new Set([ gutDoc.organId ]));
    assert.equal(grouped.assemblies.length, 1);
    const ungrouped = model.ungroupAssembly(grouped, grouped.assemblies[0].id);
    assert.equal(ungrouped.assemblies.length, 0);
    assert.equal(ungrouped.organs.length, grouped.organs.length);
    const receptorCenter = model.allCenters(gutDoc.document)[0];
    const switched =
        model.switchReceptor(gutDoc.document, receptorCenter.id, HORMONE_EFFECT.excitation, true);
    assert.ok(model.findCenter(switched, receptorCenter.id)
                  .center.receptors[HORMONE_EFFECT.excitation]
                  .sensitivity > 0);
    const exampleModel = await import('../ui/studio/model/example.js');
    const exampleDoc =
        exampleModel.exampleDocument({fish : 'B', growth : 'W', reward : 'F'}, sites, sitesResult);
    assert.doesNotThrow(() => model.validateDocument(exampleDoc));
    assert.equal(exampleDoc.substances.length, 2);
    const pallium = exampleDoc.organs.find(o => o.type === 'pallium');
    const taught = (doc, organ) => model.findOrgan(doc, organ.id)
                                       .centers.filter(model.isLearner)
                                       .map(c => c.receptors[HORMONE_EFFECT.teaching]);
    const untaught = model.teachOrgan(exampleDoc, pallium.id, null);
    assert.ok(taught(untaught, pallium).every(r => !r.active));
    const regionModel = await import('../ui/studio/model/regions.js');
    const settled = regionModel.updateRegion(exampleDoc, pallium.id, {}, sites);
    const learner = model.findOrgan(settled, pallium.id).centers.find(model.isLearner);
    const restyled = regionModel.updateRegion(
        model.updateCenter(settled, learner.id, {qwidth : .7}), pallium.id, {style : 2}, sites);
    const restyledLearner = model.findCenter(restyled, learner.id).center;
    assert.equal(restyledLearner.qwidth, .7, 'A new learning style keeps a hand-tuned rate');
    assert.notEqual(restyledLearner.mode, learner.mode);
    const byGrowth = model.teachOrgan(untaught, pallium.id, 0);
    assert.ok(taught(byGrowth, pallium).length > 0 &&
              taught(byGrowth, pallium).every(r => r.active && r.substance === 0));
    const systems = await import('../ui/studio/model/systems.js');
    const organsModel = await import('../ui/studio/model/organs.js');
    assert.equal(systems.systemMissing(exampleDoc, 'reward'), 'needs');
    assert.equal(systems.systemMissing(exampleDoc, 'growth'), 'needs');
    assert.equal(
        systems.placeSystem(exampleDoc, 'reward', sites, sitesResult, {x : 500, y : 400}, 'S'),
        null, 'A system never takes over cells already answering a substance');
    const bare = model.newDocument('Regelkreis');
    const muscled = model.addOrgan(bare, 'muscle', sites, {x : 890, y : 350}).document;
    assert.equal(systems.systemMissing(muscled, 'alarm'), null);
    const alarm =
        systems.placeSystem(muscled, 'alarm', sites, sitesResult, {x : 500, y : 400}, 'S');
    const types = alarm.document.organs.map(o => o.type);
    assert.ok([ 'pain', 'hindbrain', 'gland' ].every(type => types.includes(type)));
    assert.equal(alarm.document.substances.length, 1);
    assert.equal(systems.systemMissing(alarm.document, 'alarm'), 'needs');
    const strong = alarm.document.organs.find(o => o.type === 'muscle').centers[0];
    const strength = strong.receptors[HORMONE_EFFECT.output];
    assert.equal(strength.substance, alarm.substance);
    assert.equal(model.effectDirection(HORMONE_EFFECT.output, strength), 1,
                 'The alarm substance makes the muscles stronger');
    const chosen =
        {key : 'relay', role : 'nerve', sign : 1, mode : .9, qwidth : .35, receptors : []};
    assert.ok(model.isLearner(chosen) && organsModel.nerveKind(chosen) === 'learn',
              'A node counts as a learner wherever it is drawn as one');
    assert.ok(!model.isLearner({...chosen, mode : 0}) && !model.isLearner({...chosen, qwidth : 0}),
              'A node that neither leans nor has a teacher, or learns at no rate, does not learn');
    assert.ok(alarm.document.wires.some(
        w => w.to === alarm.organId ||
             w.to === model.findOrgan(alarm.document, alarm.organId).pair));
    assert.equal(layout.findSite(sites, sites[3].id), sites[3]);
    assert.equal(model.findAssembly(grouped, grouped.assemblies[0].id), grouped.assemblies[0]);
    assert.equal(model.findAssembly(grouped, 'none'), null);
    const gutOrgan = model.findOrgan(gutDoc.document, gutDoc.organId);
    assert.equal(model.chosenCenter(gutDoc.document, {kind : 'organ', id : gutOrgan.id}),
                 gutOrgan.centers[0]);
    assert.equal(model.chosenCenter(gutDoc.document, {kind : 'wire', id : gutOrgan.id}), null);
    assert.ok(organsModel.isModulator({modulator : 1}) &&
              !organsModel.isModulator({modulator : -1}));
    const glyphs = await import('../ui/glyph.js');
    const line = glyphs.glyph('M0 0h24', {size : 16, paint : glyphs.linePaint()});
    assert.match(line, /width="16" height="16" viewBox="0 0 24 24"/);
    assert.match(line, /fill="none" stroke="currentColor" stroke-width="1.6"/);
    assert.doesNotMatch(glyphs.glyph('M0 0h24'), /width=/, 'Without a size its style sizes it');
    const polygon = await import('../ui/polygon.js');
    const areaOf = ps => Math.abs(ps.reduce((v, p, i) => v + p[0] * ps[(i + 1) % ps.length][1] -
                                                         p[1] * ps[(i + 1) % ps.length][0],
                                            0)) /
                         2;
    const covered = (ps, holds) => {
      const {ears} = polygon.clipEars(ps, holds, 2);
      let sum = 0;
      for (let k = 0; k < ears.length; k += 3)
        sum += areaOf([ ps[ears[k]], ps[ears[k + 1]], ps[ears[k + 2]] ]);
      return sum;
    };
    const notched = [ [ 0, 0 ], [ 4, 0 ], [ 4, 4 ], [ 2, 2 ], [ 0, 4 ] ];
    assert.equal(covered(notched, polygon.holdsWithEdges), areaOf(notched));
    const flat = [ [ 0, 0 ], [ 2, 0 ], [ 4, 0 ], [ 2, 3 ] ];
    assert.equal(covered(flat, polygon.holdsInside), areaOf(flat));
    const frame = await import('../ui/studio/view/frame.js');
    assert.equal(frame.zoomOf({camera : {zoom : 2}}), 2);
    assert.equal(frame.zoomOf({}), 1);
    assert.match(frame.steadyAt({x : 10, y : 20}, 2),
                 /data-steady transform="translate\(10.00 20.00\) scale\(0.50\)"/);
    assert.equal(frame.viewBoxOf({zoom : 1, ...frame.CAMERA_HOME}).split(' ').length, 4);
  }
  console.log(
      'Atelier: generated organs, sight, connections, hormones, persistence and gestures: OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
