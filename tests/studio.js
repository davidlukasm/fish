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
  "colony-core/field/development_sites.hh" : "041de8ae566108bd",
  "colony-core/field/development.cc" : "9f0b4bcf26c472ce",
  "colony-core/field/functions.hh" : "7b6a6d591c1b6cda",
  "colony-core/field/hormones.hh" : "e0f1f91f7fdfa4b4",
  "colony-core/field/substrate.cc" : "36b1f34ac706bc90",
  "src/body_plan.cc" : "72fde39e0a94f669",
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
  "src/retina.cc" : "fbc7a69b76019774",
  "src/observations.cc" : "34543f7a3706bed4",
  "src/observations.hh" : "ee73a8bbb625a403",
  "src/eye_geometry.hh" : "25c8a3b96c4bbeb2",
  "src/retina.hh" : "1670821d02fd828c",
  "ui/fish_forms.js" : "1e5628df23a0d12d",
  "ui/fish_geometry.js" : "9e95f7f314d86a90",
  "ui/fish_fins.js" : "7f0604d4797cdd0f",
  "ui/fish_organs.js" : "43633c6b89e2f587",
  "ui/fish_painter.js" : "8a55c784199f5207",
  "src/brain_interface.hh" : "31f32da934ce82e5",
  "src/hormone_analysis.cc" : "bb5d83c0e5d6ac53",
  "src/hormone_analysis.hh" : "286fa7455ea124e0",
  "src/hormone_state.cc" : "5ce4ffda53f8995f",
  "src/hormone_state.hh" : "48078a32aa49f7d1",
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
  const {CPPN_OUTPUT, DEVELOPMENT, HORMONE_EFFECT, HORMONES, MOTOR_KIND, SENSE_KIND} =
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
  // Every organ offered in the palette must be placeable at a real Engine-authorized site.
  for (const definition of ORGANS.filter(organ => !organ.fixed)) {
    const candidates = sites.filter(site => eligible(definition.centers[0], site));
    assert.ok(candidates.length, definition.key + ' has no legal Engine sites');
    const placed = candidates
                       .map(site => model.addOrgan(model.newDocument(), definition.key, sites,
                                                   geometry.sitePoint(site, definition.key),
                                                   geometry.SNAP_DISTANCE))
                       .find(Boolean);
    assert.ok(placed, definition.key + ' cannot be placed');
    const hints = views.placementHints({document : model.newDocument(), sites, camera : {zoom : 1}},
                                       'organ', definition.key);
    assert.match(hints.svg, /aid-site-hint/, definition.key + ' missing legal-site overlay');
    assert.ok(hints.legend, definition.key + ' missing anatomical colour legend');
    for (const center of model.allCenters(placed.document)) {
      const site = sites.find(candidate => candidate.id === center.site);
      assert.ok(eligible(center, site), definition.key + ' placed an illegal centre');
    }
  }
  for (const [zone, muscle] of MUSCLES.entries()) {
    const site = sites.find(candidate => candidate.zone === zone);
    assert.equal(functionFor({role : 'motor', functionCode : 'site'}, site), muscle);
  }
  assert.equal(geometry.nearFish(geometry.sitePoint(sites[0]), sites), true);
  assert.equal(geometry.nearFish({x : 1500, y : -400}, sites), false);
  assert.match(views.removalPreview({camera : {zoom : 2}}, {x : 500, y : 365}),
               /aid-preview-removal/);
  assert.equal(model.addOrgan(model.newDocument(), 'eye', sites, {x : 1400, y : 365},
                              geometry.SNAP_DISTANCE),
               null);
  assert.equal(model.addNeuron(model.newDocument(), 'relay', sites, {x : 1400, y : 365},
                               geometry.SNAP_DISTANCE),
               null);
  // The Aquarium's distance sense has no eye socket: show it as distinct range arcs.
  const proximity = sites.find(site => site.senses & (1 << SENSE_KIND.proximity));
  const proximityMark =
      views.organPreview({document : model.newDocument(), sites, camera : {zoom : 1}}, 'organ',
                         'proximity', geometry.sitePoint(proximity));
  assert.match(proximityMark, /aid-anatomical-proximity/);
  assert.doesNotMatch(proximityMark, /aid-anatomical-eye/);
  // Pigment organs tint the designed fish before development; real anatomy uses Engine output.
  const pigmentSite = sites.find(site => site.motors & (1 << MOTOR_KIND.pigment));
  const pigmentOrgan =
      model.addOrgan(model.newDocument(), 'pigment', sites, geometry.sitePoint(pigmentSite));
  assert.ok(pigmentOrgan);
  const draftPigment = views.fishScene({
    document : pigmentOrgan.document,
    sites,
    camera : {zoom : 1},
    selected : null,
    stale : true,
    capabilities : sitesResult,
    wireScope : 'all',
    focusSubstance : 0
  });
  assert.match(draftPigment, /class="aid-fish-body"[^>]*fill="rgb\(/);
  const pigmentColor = await import('../ui/studio_pigment.js');
  assert.match(pigmentColor.fishBodyColour(pigmentOrgan.document, null, sitesResult.pigmentHalf),
               /^rgb\(/);
  // Two neural centres are independently selectable within one gut or bladder organ.
  const editorForOrgan = key => {
    const description = ORGANS.find(organ => organ.key === key);
    const spot = sites.find(site => eligible(description.centers[0], site));
    const placed = model.addOrgan(model.newDocument(), key, sites, geometry.sitePoint(spot, key));
    assert.ok(placed, key + ' places');
    const organ = model.findOrgan(placed.document, placed.organId);
    const pane = panels.inspector({
      document : placed.document,
      sites,
      selected : {kind : 'organ', id : placed.organId},
      tool : 'select',
      stale : true
    });
    return {organ, pane};
  };
  for (const kind of ['gut', 'bladder']) {
    const {organ, pane} = editorForOrgan(kind);
    assert.equal(organ.centers.length, 2);
    assert.match(pane, /aid-gonad-graphic/);
    for (const center of organ.centers)
      assert.ok(pane.includes('data-select-center="' + center.id + '"'));
  }
  const muscleEditor = editorForOrgan('muscle');
  const muscleSite = sites.find(site => site.id === muscleEditor.organ.centers[0].site);
  const muscleIndex =
      [ MOTOR_KIND.forward, MOTOR_KIND.turn, MOTOR_KIND.suction, MOTOR_KIND.aggression ].indexOf(
          functionFor(muscleEditor.organ.centers[0], muscleSite));
  assert.ok(muscleIndex >= 0);
  assert.match(muscleEditor.pane, /aid-organ-metric/);
  assert.ok(muscleEditor.pane.includes(t('studio.muscles.' + muscleIndex)));
  for (const kind of ['fin', 'defense'])
    assert.match(editorForOrgan(kind).pane, /aid-organ-tissue/);
  // At normal scale the body is an organ map; choosing an organ reveals its neural centres.
  const compactEye = model.addOrgan(
      model.newDocument(), 'eye', sites,
      geometry.sitePoint(sites.find(site => site.senses & (1 << SENSE_KIND.light)), 'eye'));
  const compactState = {
    document : compactEye.document,
    sites,
    camera : {zoom : 1},
    stale : true,
    selected : null,
    tool : 'select',
    wireScope : 'all'
  };
  assert.doesNotMatch(views.fishScene(compactState), /aid-neural-center/);
  assert.match(
      views.fishScene({...compactState, selected : {kind : 'organ', id : compactEye.organId}}),
      /aid-neural-center/);
  assert.match(views.fishScene({...compactState, camera : {zoom : 1.5}}), /aid-neural-center/);
  assert.match(views.fishScene({...compactState, tool : 'wire'}), /aid-neural-center/);
  const proximityOrgan =
      model.addOrgan(model.newDocument(), 'proximity', sites, geometry.sitePoint(proximity));
  const proximityId = proximityOrgan.organId;
  const proximityCenter = model.findOrgan(proximityOrgan.document, proximityId).centers[0];
  const proximityState = {
    document : proximityOrgan.document,
    sites,
    selected : {kind : 'organ', id : proximityId},
    tool : 'select',
    stale : true
  };
  const narrowField = panels.inspector(proximityState);
  assert.match(narrowField, /Erfassungswinkel/);
  const wideField = panels.inspector({
    ...proximityState,
    document : model.updateCenter(proximityOrgan.document, proximityCenter.id, {q2 : 1})
  });
  assert.notEqual(narrowField, wideField);
  assert.match(wideField, /A41 41/);
  // Several retinal groups on one side make one anatomical eye and one united field.
  const leftEyeSite =
      sites.filter(site => (site.senses & (1 << SENSE_KIND.light)) && site.side < 0)
          .sort((a, b) => geometry.sitePoint(a, 'eye').y - geometry.sitePoint(b, 'eye').y)[0];
  const firstRetina =
      model.addOrgan(model.newDocument(), 'eye', sites, geometry.sitePoint(leftEyeSite, 'eye'));
  const secondRetina =
      model.addOrgan(firstRetina.document, 'eye', sites, geometry.sitePoint(leftEyeSite, 'eye'));
  assert.ok(secondRetina);
  assert.equal(firstRetina.organId, secondRetina.organId);
  assert.equal(secondRetina.document.organs.filter(organ => organ.type === 'eye').length, 1);
  const mergedPreview =
      views.organPreview({document : firstRetina.document, sites, camera : {zoom : 1}}, 'organ',
                         'eye', geometry.sitePoint(leftEyeSite, 'eye'));
  assert.equal((mergedPreview.match(/class="aid-preview-node"/g) ?? []).length, 1);
  assert.equal((mergedPreview.match(/class="aid-anatomical-eye"/g) ?? []).length, 1);
  // Removing the last retina removes the anatomical eye as well.
  assert.equal(model.removeCenter(firstRetina.document, firstRetina.centerId)
                   .organs.some(organ => organ.type === 'eye'),
               false);
  assert.equal(model.removeCenter(secondRetina.document, secondRetina.centerId)
                   .organs.find(organ => organ.type === 'eye')
                   .centers.length,
               1);
  const studioDrop = new OrganStudio({querySelector : () => null});
  studioDrop.state.document = firstRetina.document;
  studioDrop.state.sites = sites;
  studioDrop.state.capabilities = sitesResult;
  studioDrop.dragging = {kind : 'organ', value : 'eye'};
  studioDrop.persist = studioDrop.refreshScene = studioDrop.refreshHeader =
      studioDrop.refreshInspector = studioDrop.refreshTools = studioDrop.notice = () => {};
  const dropBox = geometry.cameraBox(studioDrop.state.camera);
  const dropPoint = geometry.sitePoint(leftEyeSite, 'eye');
  const dropSvg = {getBoundingClientRect : () => ({left : 0, top : 0, width : 1000, height : 620})};
  studioDrop.drop({
    target : {closest : () => dropSvg},
    clientX : dropPoint.x - dropBox.x,
    clientY : dropPoint.y - dropBox.y,
    preventDefault() {}
  });
  assert.equal(studioDrop.state.selected.kind, 'center');
  assert.equal(studioDrop.state.document.organs.find(o => o.type === 'eye').centers.length, 2);
  const retinaCenters =
      secondRetina.document.organs.filter(o => o.type === 'eye').flatMap(o => o.centers);
  assert.equal(retinaCenters.length, 2);
  assert.equal(sites.find(site => site.id === retinaCenters[0].site).side,
               sites.find(site => site.id === retinaCenters[1].site).side);
  let retinalPlan = secondRetina.document;
  for (const center of retinaCenters)
    retinalPlan = model.updateCenter(retinalPlan, center.id, {field : 1});
  const retinalScene = views.fishScene({
    document : retinalPlan,
    sites,
    camera : {zoom : 1},
    selected : null,
    stale : true,
    capabilities : sitesResult,
    wireScope : 'all',
    focusSubstance : 0
  });
  assert.equal((retinalScene.match(/class="aid-anatomical-eye"/g) ?? []).length, 1);
  assert.equal((retinalScene.match(/class="aid-eye-cone"/g) ?? []).length, 1);
  // A smell sensor placed at the tail still grows the real barbel from the snout.
  const smellTail =
      sites.find(site => site.zone === 3 && site.outer && (site.senses & (1 << SENSE_KIND.odor)));
  const tailNose =
      model.addOrgan(model.newDocument(), 'nose', sites, geometry.sitePoint(smellTail, 'nose'));
  const smellScene = views.fishScene({
    document : tailNose.document,
    sites,
    camera : {zoom : 1},
    selected : null,
    stale : true,
    capabilities : sitesResult,
    wireScope : 'all',
    focusSubstance : 0
  });
  assert.ok(smellScene.includes('class="aid-anatomical-barbel" d="M175.00 '));
  const muscleFinSite =
      sites.find(site => site.zone === 2 && site.w > .8 && (site.motors & (1 << MOTOR_KIND.turn)));
  const musclePoint = geometry.sitePoint(muscleFinSite, 'muscle');
  assert.equal(musclePoint.y, geometry.sitePoint(muscleFinSite, 'fin').y);
  assert.notEqual(musclePoint.y, geometry.sitePoint(muscleFinSite).y);
  const muscleHints = views.placementHints(
      {document : model.newDocument(), sites, camera : {zoom : 1}, userModules : []}, 'organ',
      'muscle');
  assert.ok(muscleHints.svg.includes('data-point-y="' + musclePoint.y.toFixed(2) + '"'));
  assert.equal(sites.length, DEVELOPMENT.sites);
  assert.equal(sitesResult.cppnOutputs, CPPN_OUTPUT.count);
  assert.equal(sitesResult.cppnFunctions, graph.supportedCppnFunctions);
  assert.ok(Number.isInteger(sitesResult.cppnInputs) && sitesResult.cppnInputs > 0);
  assert.equal(graph.nodeTitle(0, sitesResult), t('studio.cppnInputs.0'));
  assert.equal(graph.nodeTitle(sitesResult.cppnInputs, sitesResult), t('studio.cppnOutputs.0'));
  const cppnNodes = Array.from({length : sitesResult.cppnInputs + sitesResult.cppnOutputs},
                               (_, id) => [id, 1, 3]);
  const cppnPreview = graph.cppnGraph({
    report : {cppn : {nodes : cppnNodes, links : []}},
    capabilities : sitesResult,
    cppnScope : 'cells',
    cppnSelection : null
  });
  assert.match(cppnPreview, /aid-cppn-node output/);
  assert.equal(sitesResult.hormones, HORMONES.levels);
  assert.equal(sitesResult.effects, Object.keys(HORMONE_EFFECT).length);
  const {hormoneColors} = await import('../ui/hormones.js');
  assert.equal(views.substanceColor(0, sitesResult), hormoneColors[0]);
  // The engine gives sensors output and death, effectors also excitation, nerve cells all effects.
  const E = HORMONE_EFFECT;
  assert.deepEqual(sitesResult.roleEffects, [
    [ E.output, E.death ], Object.values(E).sort((a, b) => a - b),
    [ E.excitation, E.output, E.death ]
  ]);
  assert.ok(sites.every(site => Number.isInteger(site.senses) && Number.isInteger(site.motors) &&
                                typeof site.outer === 'boolean'));
  const mapped = role => new Set(
      ORGANS.flatMap(organ => organ.centers)
          .filter(center => center.role === role)
          .flatMap(center => center.functionCode === 'site' ? MUSCLES : [ center.functionCode ]));
  for (const [role, enumValues, mask] of [[ 'sensor', Object.values(SENSE_KIND), 'senses' ],
                                          [ 'motor', Object.values(MOTOR_KIND), 'motors' ]]) {
    const available = [
      ...new Set(enumValues.filter(code => sites.some(site => (site[mask] & (1 << code)) !== 0)))
    ].sort((a, b) => a - b);
    const covered = mapped(role);
    assert.deepEqual(available.filter(code => !covered.has(code)), [],
                     'An engine ' + role + ' function has no matching Studio organ.');
  }
  let doc = model.newDocument('Atelier-Test');
  assert.equal(doc.organs.length, 1);
  assert.equal(model.allCenters(doc).length, 0);
  function organ(type, position) {
    const added = model.addOrgan(doc, type, sites, position);
    assert.ok(added, type + ' must have an anatomically legal position');
    doc = added.document;
    return added;
  }
  // Slot jitter uses shared left/right pair coordinates and never breaks mirroring.
  const mirroredSlot = sites.find(site => site.id === sites[0].id + 1);
  assert.ok(mirroredSlot && sites[0].side === -mirroredSlot.side);
  const originalPosition = geometry.sitePoint(sites[0]);
  const mirrorPosition = geometry.sitePoint(mirroredSlot);
  assert.equal(originalPosition.x, mirrorPosition.x);
  assert.ok(Math.abs(originalPosition.y + mirrorPosition.y - 730) < 1e-9);
  const eye = organ('eye', {x : 325, y : 300});
  const relay = model.addNeuron(doc, 'relay', sites, {x : 490, y : 360});
  assert.ok(relay);
  doc = relay.document;
  const fin = organ('fin', {x : 625, y : 470});
  const finCell = model.findCenter(doc, fin.centerId).center;
  const finSite = sites.find(site => site.id === finCell.site);
  const finPosition = (await import('../ui/studio_geometry.js')).sitePoint(finSite, 'fin');
  const snappedFin = model.closestSite(finCell, sites, new Set(), finPosition, null, 'fin');
  assert.equal(snappedFin.id, finSite.id);
  const mouth = organ('mouth', {x : 235, y : 370});
  const egg = organ('eggs', {x : 823, y : 398});
  const sperm = organ('sperm', {x : 840, y : 344});
  const gland = organ('gland', {x : 385, y : 330});
  const eggCenters = model.findOrgan(doc, egg.organId).centers;
  const spermCenters = model.findOrgan(doc, sperm.organId).centers;
  assert.equal(eggCenters.length, 3);
  assert.equal(spermCenters.length, 3);
  const eggOptionsPanel = panels.inspector({
    document : doc,
    tool : 'select',
    selected : {kind : 'organ', id : egg.organId},
    sites,
    camera : {zoom : 1},
    stale : true
  });
  for (const kind of ['growth', 'release', 'pressure'])
    assert.ok(eggOptionsPanel.includes('data-add-key="' + kind + '"'));
  assert.doesNotMatch(eggOptionsPanel, /data-add-neuron/);
  const anotherRelease = model.addCenter(
      doc, egg.organId, sites,
      geometry.sitePoint(sites.find(site => site.id === eggCenters[1].site), 'eggs'), 'release');
  assert.ok(anotherRelease);
  assert.equal(model.findCenter(anotherRelease.document, anotherRelease.centerId).center.key,
               'release');
  const bySite = id => sites.find(site => site.id === id);
  const usedSites = new Set(model.allCenters(doc).map(center => center.site));
  const eyeCenter = model.findCenter(doc, eye.centerId).center;
  const originalSide = bySite(eyeCenter.site).side;
  const oppositeEye = sites.find(site => site.side === -originalSide && eligible(eyeCenter, site) &&
                                         !usedSites.has(site.id));
  assert.ok(oppositeEye);
  const target = geometry.sitePoint(oppositeEye, 'eye');
  const movedEye = model.moveOrgan(doc, eye.organId, sites, target);
  assert.ok(movedEye);
  assert.equal(
      model.moveOrgan(doc, eye.organId, sites, {x : 1400, y : 365}, geometry.SNAP_DISTANCE), null);
  assert.equal(bySite(model.findCenter(movedEye, eye.centerId).center.site).side, -originalSide);
  const addedRetina = model.addCenter(doc, eye.organId, sites, target);
  assert.ok(addedRetina);
  assert.equal(
      bySite(model.findCenter(addedRetina.document, addedRetina.centerId).center.site).side,
      originalSide);
  const eggSide = bySite(eggCenters[0].site).side;
  assert.ok(eggCenters.every(center => bySite(center.site).side === eggSide));
  const oppositeEgg = sites.find(site => site.side === -eggSide && eligible(eggCenters[1], site) &&
                                         !usedSites.has(site.id));
  assert.ok(oppositeEgg);
  assert.equal(model.moveCenter(doc, eggCenters[1].id, oppositeEgg.id, sites), null);
  for (const [from, to] of [[ eye.centerId, relay.centerId ], [ relay.centerId, fin.centerId ]]) {
    const wire = model.addWire(doc, from, to);
    assert.ok(wire);
    doc = wire.document;
  }
  assert.equal(model.addWire(doc, eye.centerId, fin.centerId), null);
  const inhibitory = model.updateCenter(doc, relay.centerId, {sign : -1});
  assert.match(views.fishScene({
    document : inhibitory,
    sites,
    camera : {zoom : 1, x : 560, y : 365},
    stale : true,
    wireScope : 'all'
  }),
               /marker-end="url\(#aid-wire-arrow-inhibit\)"/);
  // A whole eye can fan out through all of its retinal groups to a neural centre.
  const wholeEye = model.connectSelections(addedRetina.document, {kind : 'organ', id : eye.organId},
                                           {kind : 'center', id : relay.centerId});
  assert.ok(wholeEye);
  assert.equal(wholeEye.wireIds.length, 2);
  assert.equal(wholeEye.document.wires.length, 2);
  assert.equal(model.connectSelections(wholeEye.document, {kind : 'organ', id : eye.organId},
                                       {kind : 'organ', id : fin.organId}),
               null);
  assert.equal(model.connectSelections(wholeEye.document, {kind : 'organ', id : eye.organId},
                                       {kind : 'center', id : relay.centerId}),
               null);
  // The gland releases substance A, and the body grows on A.
  const grown = model.addSubstance(doc, HORMONES.levels);
  assert.ok(grown);
  doc = model.updateGrowth(grown,
                           {active : 1, substance : 0, sensitivity : 1, half : .01, width : .3});
  doc = model.updateCenter(doc, gland.centerId, {q1 : 1, q2 : 0, qwidth : 0});
  const plan = model.compileDocument(doc, sites);
  assert.deepEqual(plan.growth, doc.growth);
  assert.ok(plan.groups.length >= 11);
  assert.equal(plan.groups.filter(g => g.function === MOTOR_KIND.eggs).length, 2);
  assert.equal(plan.groups.filter(g => g.function === MOTOR_KIND.sperm).length, 2);
  assert.ok(plan.groups.every(g => sites.some(s => s.zone === g.zone && s.side === g.side &&
                                                   s.u === g.u0 && s.v === g.v0 && s.w === g.w0)));
  assert.ok(plan.groups.every(g => g.receptors.length === sitesResult.effects));
  const changed = model.updateCenter(doc, eye.centerId, {copies : 12});
  assert.equal(model.findCenter(changed, eye.centerId).center.copies, 12);
  assert.equal(model.findCenter(doc, eye.centerId).center.copies, 6);
  const assembly = model.assemble(doc, [ eye.organId, 'brain', fin.organId ], 'Sehweg',
                                  [ eye.centerId, relay.centerId, fin.centerId ]);
  assert.ok(assembly);
  doc = assembly;
  const groupId = doc.assemblies.at(-1).id;
  assert.ok(doc.assemblies.some(a => a.id === groupId));
  assert.ok(model.moveAssembly(doc, groupId, sites, {x : 516, y : 363}));
  assert.ok(model.removeAssembly(doc, groupId));
  // Ctrl/Shift-select can group individual retinal and brain centres, preserving the
  // other centres of their parent organs outside the saved assembly.
  const multiEditor = new OrganStudio({querySelector : () => null});
  multiEditor.state.station = 'studio';
  multiEditor.state.document = doc;
  multiEditor.state.sites = sites;
  multiEditor.refreshScene = multiEditor.refreshInspector = () => {};
  multiEditor.select('center', eye.centerId, {ctrlKey : true});
  multiEditor.select('center', relay.centerId, {ctrlKey : true});
  multiEditor.select('organ', fin.organId, {shiftKey : true});
  assert.equal(multiEditor.state.multi.size, 3);
  multiEditor.select('organ', fin.organId, {shiftKey : true});
  assert.equal(multiEditor.state.multi.size, 2);
  const multiPanel = panels.inspector(multiEditor.state);
  assert.ok(multiPanel.includes('data-select-center="' + eye.centerId + '"'));
  assert.ok(multiPanel.includes('data-select-center="' + relay.centerId + '"'));
  const multiScene = views.fishScene(multiEditor.state);
  for (const id of [eye.centerId, relay.centerId])
    assert.ok(multiScene.includes('class="aid-neural-center selected" data-center="' + id + '"'));
  let savedMembers = null;
  multiEditor.changeDocument = draft => { savedMembers = draft.assemblies.at(-1); };
  multiEditor.click(
      {target : {closest : selector => selector === '[data-assemble-selected]' ? {} : null}});
  assert.deepEqual(new Set(savedMembers.centerIds), new Set([ eye.centerId, relay.centerId ]));
  assert.deepEqual(new Set(savedMembers.organIds), new Set([ eye.organId, 'brain' ]));
  const module =
      model.placeModule(model.newDocument('Modul'), 'vision-steering', sites, {x : 343, y : 330});
  assert.ok(module);
  assert.equal(module.document.assemblies.length, 1);
  assert.equal(module.document.assemblies[0].centerIds.length, 3);
  assert.ok(model.placeModule(model.newDocument('Am Auge'), 'vision-steering', sites,
                              {x : 343, y : 330}, geometry.SNAP_DISTANCE));
  // The engine permits smell receptors on the tail. A module must still stay at its anchor.
  const tailModule = model.placeModule(model.newDocument('Am Schwanz'), 'scent-suction', sites,
                                       {x : 1050, y : 365}, geometry.SNAP_DISTANCE);
  assert.ok(tailModule);
  const noseOnTail = tailModule.document.organs.find(organ => organ.type === 'nose').centers[0];
  const noseSite = sites.find(site => site.id === noseOnTail.site);
  assert.ok(geometry.pointDistance(noseSite, {x : 1050, y : 365}, 'nose') <=
            geometry.SNAP_DISTANCE);
  assert.equal(model.placeModule(model.newDocument('Außerhalb'), 'scent-suction', sites,
                                 {x : -5000, y : -5000}, geometry.SNAP_DISTANCE),
               null);
  assert.ok(model.mirrorAssembly(module.document, module.assemblyId, sites));
  assert.equal(model.addSubstance(doc), null);
  const docWithHormone = model.addSubstance(doc, sitesResult.hormones);
  assert.ok(panels.inspector({document : docWithHormone, tool : 'hormone',
                              capabilities : sitesResult, sites, focusSubstance : 0})
                .includes('aria-label="' + t('studio.inspector.removeSubstance') + '"'));
  const forbidden = model.updateReceptor(docWithHormone, eye.centerId, HORMONE_EFFECT.learning,
                                         {active : 1, substance : 0});
  assert.deepEqual(
      model.boundEffects(model.findCenter(forbidden, eye.centerId).center, 0, sitesResult), []);
  const allowed = model.updateReceptor(docWithHormone, eye.centerId, HORMONE_EFFECT.output,
                                       {active : 1, substance : 0});
  assert.deepEqual(
      model.boundEffects(model.findCenter(allowed, eye.centerId).center, 0, sitesResult),
      [ HORMONE_EFFECT.output ]);
  assert.equal(docWithHormone.substances.length, 2);
  const selected = {
    document : docWithHormone,
    sites,
    selected : {kind : 'assembly', id : groupId},
    multi : new Set(),
    tool : 'select',
    wireScope : 'all',
    camera : {zoom : 1, x : 560, y : 365},
    capabilities : sitesResult,
    report : null,
    stale : true,
    effect : 6,
    focusSubstance : 0
  };
  const previewDocument = {...selected, document : model.newDocument('Vorschau')};
  const previewEye = views.organPreview(previewDocument, 'organ', 'eye', {x : 325, y : 300});
  assert.match(previewEye, /aid-anatomical-eye/);
  assert.equal((previewEye.match(/class="aid-preview-node"/g) || []).length, 1);
  const previewEggs = views.organPreview(previewDocument, 'organ', 'eggs', {x : 822, y : 365});
  assert.match(previewEggs, /aid-anatomical-gonad/);
  assert.equal((previewEggs.match(/class="aid-preview-node"/g) || []).length, 3);
  const eggHints = views.placementHints(previewDocument, 'organ', 'eggs');
  assert.match(eggHints.legend, /Eiorgan · Bildung/);
  assert.match(eggHints.legend, /Eiorgan · Abgabe/);
  assert.match(eggHints.legend, /Eiorgan · Druckfühler/);
  assert.match(eggHints.svg, /aid-site-hint/);
  const circuitHints = views.placementHints(previewDocument, 'module', 'vision-steering');
  assert.match(circuitHints.legend, /Auge · Retinazentrum/);
  assert.match(circuitHints.legend, /Gehirn · Schaltkreis/);
  assert.match(circuitHints.legend, /Seitenflosse · Lenken/);
  assert.match(views.placementHints(previewDocument, 'organ', 'muscle').legend, /Muskel · Lenken/);
  const zoomHints = views.placementHints(
      {...previewDocument, camera : {...previewDocument.camera, zoom : 3}}, 'organ', 'eye');
  assert.match(zoomHints.svg, /scale\(0\.33\)/);

  const contactReport = {
    contacts : [ [ 0, 1, 5, .18, 3, 2, .48, -.27 ], [ 1, 2, 3, -.2, 0, 3, 0, -.2 ] ]
  };
  const contactsScene =
      views.fishScene({...selected, stale : false, contactView : 'actual', report : contactReport});
  assert.match(contactsScene, /data-contact="0:1"/);
  assert.match(contactsScene, /data-channel="excite"/);
  assert.match(contactsScene, /data-channel="inhibit"/);
  assert.doesNotMatch(contactsScene, /data-wire=/);
  const focusedDeveloped = views.fishScene({
    ...selected,
    stale : false,
    contactView : 'actual',
    wireScope : 'focus',
    selected : {kind : 'contact', id : '3:4'},
    report : {
      contacts : [
        [ 0, 1, 5, .5, 5, 0, .5, 0 ], [ 1, 2, 3, -.2, 0, 3, 0, -.2 ], [ 3, 4, 2, .4, 2, 0, .4, 0 ],
        [ 4, 5, 6, .7, 6, 0, .7, 0 ]
      ]
    }
  });
  assert.match(focusedDeveloped, /data-contact="3:4"/);
  assert.match(focusedDeveloped, /data-contact="4:5"/);
  assert.doesNotMatch(focusedDeveloped, /data-contact="0:1"/);
  const contactDetails = panels.inspector({
    ...selected,
    tool : 'select',
    stale : false,
    contactView : 'actual',
    selected : {kind : 'contact', id : '0:1'},
    report : contactReport
  });
  assert.match(contactDetails, /aid-contact-summary/);
  assert.match(contactDetails, /aid-contact-polarity excite/);
  assert.match(contactDetails, /aid-contact-polarity inhibit/);
  assert.match(contactDetails, /5/);
  const scene = views.fishScene(selected);
  assert.match(scene, /data-assembly=/);
  assert.match(scene, /data-wire=/);
  assert.match(scene, /aid-eye-cone/);
  assert.match(scene, /aid-anatomical-gland/);
  // The retinal field of one eye follows its own developed receptor groups.
  const groupIndex =
      model.allCenters(docWithHormone).findIndex(center => center.id === eye.centerId);
  const builtState = {
    ...selected,
    stale : false,
    report : {
      eyeGroups : Array.from({length : plan.groups.length}, () => []),
      groups : plan.groups.map(() => ({cells : 1})),
      fins : Array.from({length : 3}, () => ({strength : 0})),
      anatomy : [],
      restingAbsorption : [ 0, 0, 0 ]
    }
  };
  builtState.report.eyeGroups[groupIndex] = [ [ .1, .2 ] ];
  const eyeScene = views.fishScene(builtState);
  assert.equal((eyeScene.match(/class="aid-eye-cone"/g) || []).length, 1);
  assert.equal((eyeScene.match(/aid-tail-fin/g) || []).length, 0);
  assert.ok(!readFileSync(join(root, 'ui/studio.css'), 'utf8').includes('min-height:350px'));
  const html = readFileSync(join(root, 'viewer.html'), 'utf8');
  assert.match(html, /data-t-title="studio.app.home"/);
  assert.match(html, /data-t-aria-label="studio.app.hubTitle"/);
  assert.match(panels.inspector(selected), /data-mirror-assembly/);
  selected.tool = 'hormone';
  assert.match(panels.inspector(selected), /aid-hormone-map/);
  assert.match(panels.inspector(selected), /data-growth-substance/);
  assert.equal((panels.inspector(selected).match(/class="aid-wheel-point/g) || []).length,
               sitesResult.bloodSubstances);
  // The hormone map shows the body's growth receptor binding to the substance.
  assert.ok(model.growsWith(docWithHormone, 0, sitesResult));
  assert.match(panels.inspector(selected), /aid-grows/);
  // The gland releases A from a free point on the same wheel.
  assert.deepEqual(model.producers(docWithHormone, 0, sitesResult).map(c => c.id),
                   [ gland.centerId ]);
  selected.tool = 'select';
  selected.selected = {kind : 'center', id : gland.centerId};
  assert.match(panels.inspector(selected), /data-vector-pad="[^"]+" data-wheel/);
  assert.match(panels.inspector(selected), /data-wheel-substance="0"/);
  selected.tool = 'hormone';
  // A sensor offers only its output and death receptors.
  selected.selected = {kind : 'organ', id : eye.organId};
  const sensorEffects =
      [...panels.inspector(selected).matchAll(/data-effect="(\d)"/g) ].map(m => +m[1]);
  assert.deepEqual(sensorEffects, sitesResult.roleEffects[0]);
  selected.effect = E.excitation;
  assert.match(panels.inspector(selected),
               new RegExp('data-receptor-active="[^"]+" data-receptor-effect="' + E.output + '"'));
  // A life phase: the eye works from maturity .6 and dies from .9.
  assert.match(panels.inspector(selected), /data-phase-start/);
  const phased = model.setLifePhase(docWithHormone, eye.centerId, {start : .6, end : .9},
                                    sitesResult.sensitivitySpan, sitesResult.steepnessSteps);
  assert.deepEqual(model.lifePhase(model.findCenter(phased, eye.centerId).center),
                   {start : .6, end : .9});
  const phasedEye =
      model.compileDocument(phased, sites).groups.find(g => g.name.startsWith('eye:')).receptors;
  assert.equal(phasedEye[E.output].substance, HORMONES.levels);
  assert.equal(phasedEye[E.output].sensitivity, sitesResult.sensitivitySpan);
  assert.equal(phasedEye[E.output].steepness, sitesResult.steepnessSteps);
  assert.equal(phasedEye[E.death].half, .9);
  const reopened = model.setLifePhase(phased, eye.centerId, {start : null, end : null},
                                      sitesResult.sensitivitySpan, sitesResult.steepnessSteps);
  assert.deepEqual(model.lifePhase(model.findCenter(reopened, eye.centerId).center),
                   {start : null, end : null});
  selected.selected = {kind : 'assembly', id : groupId};
  selected.tool = 'select';
  selected.multi = new Set([ eye.organId, fin.organId ]);
  assert.match(panels.inspector(selected), /data-assemble-selected/);
  selected.multi.clear();
  assert.ok(panels.library(selected).includes('data-drag-kind="organ"'));
  assert.match(panels.toolPalette(selected), /<svg width="22"/);
  selected.selected = {kind : 'wire', id : doc.wires[0].id};
  assert.match(panels.inspector(selected), /data-remove-wire/);
  selected.selected = {kind : 'organ', id : mouth.organId};
  assert.match(panels.inspector(selected), /data-vector-pad/);
  selected.selected = {kind : 'organ', id : eye.organId};
  assert.match(panels.inspector(selected), /data-spectrum/);
  selected.selected = {kind : 'organ', id : egg.organId};
  const eggPanel = panels.inspector(selected);
  for (const part of eggCenters)
    assert.match(eggPanel, new RegExp('aid-gonad-center[^>]*data-select-center="' + part.id + '"'));
  selected.selected = {kind : 'organ', id : eye.organId};
  assert.match(panels.inspector(selected), /aid-spectrum-window/);
  assert.match(panels.inspector(selected), /data-field="stimulusThreshold"/);
  selected.selected = {kind : 'center', id : relay.centerId};
  assert.match(panels.inspector(selected), /data-field="restDrive"/);
  selected.selected = {kind : 'organ', id : eye.organId};
  const learner = model.addNeuron(docWithHormone, 'learn', sites, {x : 515, y : 365});
  assert.ok(learner);
  selected.document = learner.document;
  selected.tool = 'learn';
  selected.effect = 1;
  selected.selected = {kind : 'center', id : learner.centerId};
  assert.match(panels.inspector(selected),
               new RegExp('data-receptor-active="' + learner.centerId + '" data-receptor-effect="' +
                          E.learning + '"'));
  assert.match(panels.inspector(selected), /data-learning-pad/);
  selected.selected = {kind : 'center', id : relay.centerId};
  assert.match(panels.inspector(selected), /data-learning-pad/);
  const pressedReceptor =
      model.updateReceptor(docWithHormone, relay.centerId, 6, {baseline : -1, sensitivity : 0});
  selected.document = pressedReceptor;
  selected.tool = 'hormone';
  selected.effect = 6;
  const chart = panels.inspector(selected);
  const plot = chart.match(/<polyline class="aid-response-line" points="([^"]+)"/)?.[1];
  assert.ok(plot);
  const ys = plot.split(' ').map(point => Number(point.split(',')[1]));
  assert.ok(ys.every(y => y >= 14 && y <= 112), 'full receptor curve remains visible');
  assert.match(chart, /aid-chart-axis/);
  // An active learning receptor on A names the gland that sends the signal.
  const learnerId = learner.centerId;
  selected.document =
      model.updateReceptor(learner.document, learnerId, 1, {active : 1, substance : 0});
  selected.tool = 'learn';
  selected.selected = {kind : 'center', id : learnerId};
  assert.match(panels.inspector(selected),
               new RegExp('aid-learning-signal.*data-select-center="' + gland.centerId + '"'));
  selected.document = learner.document;
  // The circuit template defines its sign and class; settings show its own controls.
  selected.tool = 'select';
  selected.selected = {kind : 'center', id : relay.centerId};
  const relayControls = panels.inspector(selected);
  assert.doesNotMatch(relayControls, /data-set-field="sign"/);
  assert.doesNotMatch(relayControls, /data-field="pace"/);
  assert.doesNotMatch(relayControls, /data-field="modulator"/);
  const pacemaker =
      model.addNeuron(model.newDocument('Rhythm'), 'pacemaker', sites, {x : 495, y : 360});
  assert.ok(pacemaker);
  selected.document = pacemaker.document;
  selected.selected = {kind : 'center', id : pacemaker.centerId};
  assert.match(panels.inspector(selected), /data-field="pace"/);
  assert.doesNotMatch(panels.inspector(selected), /data-field="modulator"/);
  const modulation =
      model.addNeuron(model.newDocument('Modulation'), 'modulate', sites, {x : 495, y : 360});
  assert.ok(modulation);
  selected.document = modulation.document;
  selected.selected = {kind : 'center', id : modulation.centerId};
  assert.match(panels.inspector(selected), /data-field="modulator"/);
  assert.doesNotMatch(panels.inspector(selected), /data-field="pace"/);
  selected.document = learner.document;
  selected.tool = 'learn';
  // Every nerve cell learns: a relay has the same plasticity and learning mode.
  selected.selected = {kind : 'center', id : relay.centerId};
  assert.match(panels.inspector(selected), /data-field="qwidth"/);
  assert.match(panels.inspector(selected), /data-field="mode"/);
  selected.document = docWithHormone;
  selected.tool = 'select';
  assert.equal(graph.nodeTypeLabel(graph.DEFAULT_CPPN_NODE_TYPE), t('studio.cppnFunctions.linear'));
  assert.match(graph.cppnGraph({...selected, report : null}), /aid-cppn/);
  // Server-owned documents and modules survive a new page and a second browser.
  const python = `import json,sys,tempfile,time
from atelier_service import run
from studio_storage import run as store
plan=json.load(sys.stdin)
with tempfile.TemporaryDirectory(prefix='fish-studio-test-') as directory:
    document={"format":"v019-organ-studio","name":"Test","organs":[{"id":"brain","type":"brain","centers":[]}],
              "wires":[],"assemblies":[],"substances":[],
              "growth":{"active":0,"baseline":0,"sensitivity":0,"half":0.05,"substance":0,"width":0,"steepness":0}}
    assert store(directory,{"operation":"save-draft","document":document})["saved"]
    assert store(directory,{"operation":"load-draft"})["document"]==document
    mod={"id":"module-test","name":"Test","organs":[],"wires":[]}
    store(directory,{"operation":"save-module","module":mod})
    assert store(directory,{"operation":"list-modules"})["modules"][0]==mod
    store(directory,{"operation":"delete-module","id":"module-test"})
    assert not store(directory,{"operation":"list-modules"})["modules"]
start=time.perf_counter()
built=run({"operation":"build","plan":plan})
build_time=time.perf_counter()-start
assert len(built["groups"])==len(plan["groups"])
growth=built["growth"]
assert abs(growth["sensitivity"]-plan["growth"]["sensitivity"])<1e-4
assert growth["affinity"][plan["growth"]["substance"]]>.99
print("AFFINITY "+json.dumps(growth["affinity"]))
assert len(built["eyeGroups"])==len(plan["groups"])
nerves=[g["nerve"] for g in built["groups"] if g["nerve"]]
assert nerves and all(n[0]==1 and 0<=n[2]<=1 and 0<=n[3]<=1 for n in nerves)
assert len(built["fins"])==3
assert len(built["morphology"])==6
assert built["morphology"][0]==built["anatomy"]
assert len(built["morphology"][1])==3
assert len(built["morphology"][5]["headPlan"])>0
assert built["morphology"][5]["extent"]>0
assert all("strength" in fin and "spread" in fin for fin in built["fins"])
assert built["neurons"]>0 and len(built["cppn"]["nodes"])>30
assert len(built["cppn"]["links"])>50
measured=run({"operation":"measure","genome":built["genome"],"plan":plan,"substance":0,
              "level":0.5,"maturity":1,"steps":16})
assert len(measured["groups"])==len(plan["groups"]) and len(measured["dead"])==len(plan["groups"])
assert len(measured["organs"])>20 and measured["substance"]==0
assert measured["growth"]>0.5
report=run({"operation":"inspect","genome":built["genome"]})
assert report["neurons"]==built["neurons"]
assert isinstance(built["contacts"], list)
assert all(len(row)==8 and row[2]>0 and 0<=row[4]+row[5]<=row[2] for row in built["contacts"])
active=next((i for i,group in enumerate(built["groups"]) if group["cells"]>0),None)
assert active is not None, "Developed model must contain a stimulus-capable organ"
start=time.perf_counter()
probe=run({"operation":"probe","genome":built["genome"],"plan":plan,"groups":[active],"steps":2})
probe_two_time=time.perf_counter()-start
start=time.perf_counter()
probe_twelve=run({"operation":"probe","genome":built["genome"],"plan":plan,"groups":[active],"steps":12})
probe_twelve_time=time.perf_counter()-start
assert len(probe_twelve["frames"])==13
assert probe["sources"]==[active] and probe["stimulated"]>0
assert len(probe["frames"])==3
assert all(len(frame)==len(plan["groups"]) for frame in probe["frames"])
assert all(isinstance(value,(float,int)) for frame in probe["frames"] for value in frame)
assert any(abs(frame[active])>1e-6 for frame in probe["frames"]), "Stimulating the selected organ must change its activity"
live=[i for i,group in enumerate(built["groups"]) if group["cells"]>0]
assert len(live)>=2, "Multi-source probe requires two developed centres"
both=live[:2]
combined=run({"operation":"probe","genome":built["genome"],"plan":plan,"groups":both,"steps":2})
assert combined["sources"]==both and combined["stimulated"]>=probe["stimulated"]
assert all(abs(combined["frames"][0][i])>1e-6 for i in both), "Both centres must receive the impulse"
print("Engine, compilation, actual contacts, probe, persistence: OK")
print("MORPHOLOGY:" + json.dumps(built["morphology"], separators=(",",":")))
print("PROBE_TIMINGS:" + ",".join(f"{x:.3f}" for x in (build_time,probe_two_time,probe_twelve_time)))`;
  const output =
      execFileSync('python3', [ '-c', python ],
                   {cwd : root, input : JSON.stringify(plan), encoding : 'utf8', timeout : 45000});
  assert.match(output, /Engine, compilation, actual contacts, probe, persistence: OK/);
  console.log("Atelier build, 2-step probe, 12-step probe (s): " +
              output.match(/PROBE_TIMINGS:([0-9.,]+)/)?.[1]);
  const morphologyLine = output.split("\n").find(line => line.startsWith("MORPHOLOGY:"));
  const anatomy = (await import("../ui/studio_anatomy.js")).aquariumMorphologySvg;
  const shape =
      anatomy({morphology : JSON.parse(morphologyLine.slice(11)), neurons : 100}, "#366b5b");
  assert.match(shape, /data-engine-morphology="true"/);
  assert.match(shape, /class="aid-fish-body"/);
  assert.doesNotMatch(shape, /NaN|Infinity|undefined/);
  const actualEye =
      (await import("../ui/studio_anatomy.js"))
          .aquariumEyePoint({morphology : JSON.parse(morphologyLine.slice(11)), neurons : 100}, 0);
  assert.ok(actualEye === null || Number.isFinite(actualEye.x) && Number.isFinite(actualEye.y));
  const zoomedScene = views.fishScene({
    document : doc,
    sites,
    selected : null,
    multi : new Set(),
    tool : "select",
    stale : false,
    camera : {zoom : .4, x : 560, y : 365},
    wireScope : "all",
    contactView : "design",
    report : {
      morphology : JSON.parse(morphologyLine.slice(11)),
      neurons : 100,
      eyeIntervals : [ [ [ -.4, .4 ] ], [ [ -.4, .4 ] ] ]
    }
  });
  assert.match(zoomedScene, /aid-eye-cone/);
  const outerRadius = Number(zoomedScene.match(/ A([0-9.]+) /)?.[1]);
  assert.ok(outerRadius > geometry.cameraBox({zoom : .4}).width);
  // The studio's substance wheel binds exactly as the developed growth receptor.
  const developed = JSON.parse(output.match(/^AFFINITY (.*)$/m)[1]);
  assert.equal(developed.length, sitesResult.hormones);
  developed.forEach((a, k) => assert.ok(
                        Math.abs(a - model.receptorAffinity(sitesResult, plan.growth, k)) < 1e-3));
  // A saved custom module retains all chosen receptor, color and edge settings.
  // Wheel zoom changes the visible viewport and inverse-scaled markers without re-creating
  // the developed synapse layer or moving the name beyond its selected organ.
  const glyphAttributes = {transform : 'translate(430 365) scale(1)'}, labelAttributes = {};
  const glyph = {
    getAttribute : key => glyphAttributes[key],
    setAttribute : (key, value) => { glyphAttributes[key] = String(value); }
  };
  const organLabel = {
    dataset : {labelY : '365'},
    setAttribute : (key, value) => { labelAttributes[key] = String(value); }
  };
  const canvasAttributes = {};
  const canvas = {
    setAttribute : (key, value) => { canvasAttributes[key] = String(value); },
    querySelectorAll : selector => selector.includes('.aid-organ-stamp')   ? [ glyph ]
                                   : selector.includes('.aid-organ-label') ? [ organLabel ]
                                                                           : []
  };
  const zoomStamp = {textContent : ''};
  const zoomEditor = new OrganStudio({
    querySelector : selector => selector === '#aid-body-map'         ? canvas
                                : selector === '.aid-canvas-toolbar' ? zoomStamp
                                                                     : null
  });
  let zoomRedraws = 0;
  zoomEditor.refreshScene = () => { ++zoomRedraws; };
  zoomEditor.zoom('in');
  assert.equal(zoomRedraws, 0);
  assert.ok(Number(glyphAttributes.transform.match(/scale\(([^)]+)\)/)[1]) < .75);
  assert.ok(Number(labelAttributes['font-size']) < 14);
  assert.ok(Number(labelAttributes.y) < 412);
  assert.match(canvasAttributes.viewBox, / /);
  assert.equal(zoomStamp.textContent, '135%');
  const learningController = new OrganStudio({querySelector : () => null});
  learningController.state.document = docWithHormone;
  learningController.stopPulse = () => {};
  learningController.persist = () => {};
  learningController.refreshScene = () => {};
  learningController.refreshHeader = () => {};
  learningController.controlPointer = {
    id : relay.centerId,
    kind : 'learning',
    element : {
      getBoundingClientRect : () => ({left : 0, top : 0, width : 280, height : 170}),
      querySelector : () => null
    }
  };
  learningController.tuneGraphic({clientX : 200, clientY : 65});
  const tuned = model.findCenter(learningController.state.document, relay.centerId).center;
  assert.ok(tuned.mode > 0 && tuned.mode < 1);
  assert.ok(tuned.qwidth > .5 && tuned.qwidth < .7);
  // Draw contacts by two clicks; clicking a wire then shows its connected network.
  const connectEditor = new OrganStudio({querySelector : () => null});
  connectEditor.state.station = 'studio';
  connectEditor.state.document = doc;
  connectEditor.state.tool = 'wire';
  connectEditor.persist = () => {};
  connectEditor.refreshScene = () => {};
  connectEditor.refreshInspector = () => {};
  connectEditor.refreshHeader = () => {};
  const clickCenter = id => connectEditor.click({
    target : {
      closest : selector =>
          selector === '[data-assembly],[data-organ],[data-center],[data-wire],[data-contact]'
              ? {hasAttribute : key => key === 'data-center', dataset : {center : id}}
              : null
    }
  });
  clickCenter(relay.centerId);
  assert.equal(connectEditor.wireStartId, relay.centerId);
  clickCenter(egg.centerId);
  assert.equal(connectEditor.wireStartId, null);
  assert.equal(connectEditor.state.document.wires.length, doc.wires.length + 1);
  assert.equal(connectEditor.state.selected.kind, 'wire');
  // Use the same drawing tool on organ stamps: all retinal groups are sources.
  connectEditor.state.document = addedRetina.document;
  const clickOrganStamp = id => connectEditor.click({
    target : {
      closest : selector =>
          selector === '[data-assembly],[data-organ],[data-center],[data-wire],[data-contact]'
              ? {hasAttribute : key => key === 'data-organ', dataset : {organ : id}}
              : null
    }
  });
  clickOrganStamp(eye.organId);
  assert.equal(connectEditor.wireStartKind, 'organ');
  assert.equal(connectEditor.wireStartId, eye.organId);
  clickCenter(relay.centerId);
  assert.equal(connectEditor.wireStartId, null);
  assert.equal(connectEditor.state.document.wires.length, 2);
  // An accidental drag-to-remove is recoverable; a slider gesture is one undo step.
  const historyEditor = new OrganStudio({querySelector : () => null});
  historyEditor.state.station = 'studio';
  historyEditor.state.document = doc;
  historyEditor.persist = () => {};
  historyEditor.refreshScene = () => {};
  historyEditor.refreshInspector = () => {};
  historyEditor.refreshHeader = () => {};
  const firstChange = model.updateCenter(doc, eye.centerId, {copies : 7});
  const secondChange = model.updateCenter(firstChange, eye.centerId, {copies : 8});
  historyEditor.changeDocument(firstChange, null, true, 'dial:eye:copies');
  historyEditor.changeDocument(secondChange, null, true, 'dial:eye:copies');
  assert.equal(historyEditor.undoHistory.length, 1);
  assert.equal(historyEditor.state.canUndo, true);
  assert.ok(panels.toolPalette(historyEditor.state).includes('data-history="undo"'));
  historyEditor.stepHistory('undo');
  assert.equal(model.findCenter(historyEditor.state.document, eye.centerId).center.copies, 6);
  assert.equal(historyEditor.state.canRedo, true);
  historyEditor.stepHistory('redo');
  assert.equal(model.findCenter(historyEditor.state.document, eye.centerId).center.copies, 8);
  const component = views.fishScene({
    ...selected,
    selected : connectEditor.state.selected,
    wireScope : 'focus',
    document : connectEditor.state.document
  });
  assert.match(component, /data-wire=/);
  const originalEye =
      model.updateCenter(doc, eye.centerId, {q1 : .72, q2 : -.8, qwidth : .64, copies : 13});
  const originalWire = model.updateWire(originalEye, doc.wires[0].id,
                                        {strength : .93, spread : .41, length : .7, cross : .2});
  const savedModule = {
    id : 'custom',
    name : 'Eigenes Sehnetz',
    organs : [
      model.findOrgan(originalWire, eye.organId), {
        ...model.findOrgan(originalWire, 'brain'),
        centers : [ model.findCenter(originalWire, relay.centerId).center ]
      }
    ],
    wires : [ originalWire.wires[0] ]
  };
  const placed = model.placeStoredModule(model.newDocument('Baugruppe'), savedModule, sites,
                                         {x : 343, y : 330});
  assert.ok(placed);
  assert.equal(placed.document.assemblies.length, 1);
  assert.equal(model.placeStoredModule(model.newDocument('Zu weit weg'), savedModule, sites,
                                       {x : 1050, y : 365}, geometry.SNAP_DISTANCE),
               null);
  assert.equal(placed.document.assemblies[0].id, placed.assemblyId);
  assert.equal(placed.document.organs.length, 2);
  const newEye = placed.document.organs.find(o => o.type === 'eye').centers[0];
  const newRelay = placed.document.organs.find(o => o.type === 'brain').centers[0];
  assert.equal(placed.document.organs.find(o => o.type === 'eye').centers.length,
               savedModule.organs[0].centers.length);
  assert.equal(placed.document.organs.find(o => o.type === 'brain').centers.length, 1);
  assert.equal(newEye.copies, 13);
  assert.equal(newEye.q1, .72);
  assert.equal(newEye.q2, -.8);
  assert.equal(newEye.qwidth, .64);
  assert.equal(placed.document.wires.length, 1);
  assert.equal(placed.document.wires[0].strength, .93);
  assert.equal(placed.document.wires[0].spread, .41);
  assert.equal(placed.document.wires[0].from, newEye.id);
  assert.equal(placed.document.wires[0].to, newRelay.id);
  const placedSite = center => geometry.sitePoint(
      sites.find(site => site.id === center.site),
      placed.document.organs.find(organ => organ.centers.some(c => c.id === center.id)).type);
  assert.ok(placedSite(newEye).x < placedSite(newRelay).x,
            'A saved organ/brain module keeps its left-to-right layout');
  assert.doesNotThrow(() => model.compileDocument(placed.document, sites));
  const renderedModule =
      views.assemblyPreview({document : model.newDocument(), sites, camera : {zoom : 2}}, placed);
  assert.match(renderedModule, /aid-anatomical-eye/);
  assert.match(renderedModule, /aid-preview-wire/);
  assert.equal((renderedModule.match(/class="aid-preview-node"/g) || []).length, 2);

  // Saving a partial organ must not silently regenerate its deleted third center.
  const eggSubset = {
    id : 'egg-subset',
    name : 'Kleine Eigruppe',
    organs : [ {
      ...model.findOrgan(doc, egg.organId),
      centers : model.findOrgan(doc, egg.organId).centers.slice(0, 2)
    } ],
    wires : []
  };
  const smallEgg =
      model.placeStoredModule(model.newDocument('Teilorgan'), eggSubset, sites, {x : 810, y : 390});
  assert.ok(smallEgg);
  assert.equal(smallEgg.document.organs.find(o => o.type === 'eggs').centers.length, 2);
  assert.doesNotThrow(() => model.compileDocument(smallEgg.document, sites));
  // The receptor-stimulation service must receive the developed genome.
  const probe = new OrganStudio({querySelector : () => null});
  probe.state.document = originalWire;
  probe.state.sites = sites;
  probe.state.stale = false;
  probe.state.genome = 'FISH_CPPN\\nfixture';
  let sent = null, pulsed = false;
  probe.api = async payload => {
    sent = payload;
    return {frames : [ [ 1 ], [ 0 ] ]};
  };
  probe.playPulse = () => { pulsed = true; };
  await probe.stimulate([ eye.centerId ]);
  assert.equal(sent.operation, 'probe');
  assert.equal(sent.genome, probe.state.genome);
  assert.deepEqual(
      sent.groups,
      [ model.allCenters(originalWire).findIndex(center => center.id === eye.centerId) ]);
  assert.ok(pulsed);
  // Clicking an organ with the stimulus tool pulses all its internal centres together.
  probe.state.station = 'studio';
  probe.state.tool = 'stimulate';
  const eggClickTarget = {
    dataset : {organ : egg.organId},
    hasAttribute : key => key === 'data-organ'
  };
  await probe.click({
    target : {
      closest : selector =>
          selector === '[data-assembly],[data-organ],[data-center],[data-wire],[data-contact]'
              ? eggClickTarget
              : null
    }
  });
  const eggMemberIds = new Set(model.findOrgan(originalWire, egg.organId).centers.map(c => c.id));
  assert.deepEqual(sent.groups,
                   model.allCenters(originalWire)
                       .flatMap((center, index) => eggMemberIds.has(center.id) ? [ index ] : []));
  // A drag released in the empty drawing area removes the whole existing organ.
  const deletion = new OrganStudio({
    querySelector : selector =>
        selector === '.aid-scene-frame'
            ? {getBoundingClientRect : () => ({left : 0, top : 0, right : 1000, bottom : 620})}
            : null
  });
  deletion.state.sites = sites;
  deletion.pointer = {
    kind : 'organ',
    id : eye.organId,
    moved : true,
    svg : {getBoundingClientRect : () => ({left : 0, top : 0, width : 1000, height : 620})}
  };
  let removedTarget = null;
  deletion.removeSelection = target => { removedTarget = target; };
  deletion.pointerUp({clientX : 10, clientY : 25, preventDefault() {}});
  assert.deepEqual(removedTarget, {kind : 'organ', id : eye.organId});

  // Interactive spectral and 2D organ editors update their real CPPN qualities.
  const editing = new OrganStudio({querySelector : () => null});
  editing.state.document = doc;
  editing.persist = () => {};
  editing.refreshScene = () => {};
  editing.refreshHeader = () => {};
  const setVirtualControl = (centerId, field, value) =>
      editing.input({target : {dataset : {target : centerId, field}, value, closest : () => null}});
  setVirtualControl(eye.centerId, 'stimulusThreshold', .75);
  assert.equal(model.findCenter(editing.state.document, eye.centerId).center.threshold, .5);
  setVirtualControl(relay.centerId, 'restDrive', -.65);
  assert.equal(model.findCenter(editing.state.document, relay.centerId).center.threshold, .65);
  const graphic = (width, height, hormone = false) => ({
    getBoundingClientRect : () => ({left : 0, top : 0, width, height}),
    querySelector : () => null,
    querySelectorAll : () => [],
    hasAttribute : key => hormone && key === 'data-wheel'
  });
  editing.controlPointer = {kind : 'spectrum', id : eye.centerId, element : graphic(200, 30)};
  editing.tuneGraphic({clientX : 200, clientY : 15});
  assert.equal(model.findCenter(editing.state.document, eye.centerId).center.q1, 1);
  const jaw = model.findOrgan(doc, mouth.organId).centers.find(c => c.key === 'jaw');
  editing.controlPointer = {kind : 'vector', id : jaw.id, element : graphic(150, 150)};
  editing.tuneGraphic({clientX : 15, clientY : 15});
  const shaped = model.findCenter(editing.state.document, jaw.id).center;
  assert.equal(shaped.q1, -1);
  assert.equal(shaped.q2, 1);
  // Half values slide over three decades; steepness reads as the binding exponent.
  assert.equal(panels.dialReading('log', -2, '0.01').value, .01);
  assert.equal(panels.dialReading('hill', 3, '1').text, 'n = 8');
  editing.input({
    target : {
      dataset : {field : 'half', target : eye.centerId + ':' + E.output, scale : 'log'},
      value : '-2',
      step : '0.01',
      closest : () => null
    }
  });
  const halved = model.findCenter(editing.state.document, eye.centerId).center;
  assert.ok(Math.abs(halved.receptors[E.output].half - .01) < 1e-9);
  // The learning pad: right is competing, up is plastic.
  const {LEARNING_PAD} = panels;
  editing.controlPointer = {
    kind : 'learning',
    id : relay.centerId,
    element : graphic(LEARNING_PAD.width, LEARNING_PAD.height)
  };
  editing.tuneGraphic({clientX : LEARNING_PAD.width, clientY : 0});
  const learning = model.findCenter(editing.state.document, relay.centerId).center;
  assert.equal(learning.mode, 1);
  assert.equal(learning.qwidth, 1);

  const events = {};
  const station = {
    innerHTML : '',
    hidden : false,
    querySelector : () => null,
    addEventListener : (kind, handler) => { events[kind] = handler; }
  };
  global.document = {
    body : {dataset : {}},
    getElementById : id => id === 'station-root' ? station : null,
    addEventListener : () => {}
  };
  global.window = {FISH_TOKEN : 'test', addEventListener : () => {}};
  global.fetch = async (_url) => { throw Error('off-line UI test'); };
  initializeStudio();
  assert.equal(document.body.dataset.station, 'hub');
  assert.match(station.innerHTML, /Artificial Intelligent Design/);
  const click = operation => events.click({
    target : {
      closest : selector => selector === '[data-action]' ? {dataset : {action : operation}} : null
    }
  });
  click('atelier');
  assert.equal(document.body.dataset.station, 'studio');
  assert.match(station.innerHTML, /aid-workspace-main/);
  assert.match(station.innerHTML, /aid-body-map/);
  click('home');
  assert.equal(document.body.dataset.station, 'hub');
  console.log('Atelier: echte Entwicklungsorte, Organmodell, Oberfläche und Compiler: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
