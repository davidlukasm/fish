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
  "colony-core/field/development.cc" : "37c223b177ab79e8",
  "colony-core/field/functions.hh" : "7b6a6d591c1b6cda",
  "colony-core/field/hormones.hh" : "626ea53e67e013d9",
  "colony-core/field/substrate.cc" : "36b1f34ac706bc90",
  "src/body_plan.cc" : "4092e1b0cc5fc1dd",
  "src/body_plan.hh" : "63f5c58ed9da5790",
  "src/receptor_tuning.hh" : "509bbf751724eaf3",
  "src/eye_geometry.hh" : "25c8a3b96c4bbeb2",
  "src/retina.hh" : "1670821d02fd828c",
  "ui/fish_forms.js" : "1e5628df23a0d12d",
  "ui/fish_geometry.js" : "9e95f7f314d86a90",
  "ui/fish_fins.js" : "7f0604d4797cdd0f"
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
  // Prevent an SVG intrinsic-height fallback from clipping the editor's zoomable fish.
  assert.match(readFileSync(join(root, 'ui/studio.css'), 'utf8'),
               /#aid-body-map\\{position:absolute;inset:0;/);
  const manifest = readFileSync(join(root, 'package.sh'), 'utf8');
  const shipped = new Set(
      manifest.match(/files=\[Path\(p\) for p in '''([\s\S]*?)'''\.split\(\)\]/)[1].trim().split(
          /\s+/));
  for (const sourcePath of [...shipped].filter(path => /^ui\/studio.*\.js$/.test(path))) {
    const source = readFileSync(join(root, sourcePath), 'utf8');
    for (const match of source.matchAll(/from\s*['"]([.][^'"]+\.js)['"]/g)) {
      const imported = posix.normalize(posix.join(posix.dirname(sourcePath), match[1]));
      assert.ok(shipped.has(imported),
                sourcePath + ' imports ' + imported + ' which is missing from package.sh');
    }
  }
  const {DEVELOPMENT, HORMONE_EFFECT, MOTOR_KIND, SENSE_KIND} = await import('../ui/schema.js');
  const {ORGANS, MUSCLES, eligible} = await import('../ui/studio_organs.js');
  const {useTexts} = await import('../ui/strings.js');
  useTexts(
      {default : 'de'},
      {de : {studio : JSON.parse(readFileSync(join(root, 'ui/text/de/studio.json'), 'utf8'))}});
  const model = await import('../ui/studio_model.js');
  const views = await import('../ui/studio_views.js');
  const hormoneModel = await import('../ui/studio_hormones.js');
  const panels = await import('../ui/studio_panels.js');
  const graph = await import('../ui/studio_graph.js');
  const pulse = await import('../ui/studio_pulse.js');
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
  assert.deepEqual(
      realLinks.map(link => [link.id, link.from, link.to, link.sign, link.channel]),
      [ [ '0:1', 'from', 'to', 1, 'excite' ], [ '0:1', 'from', 'to', -1, 'inhibit' ] ]);
  const geometry = await import('../ui/studio_geometry.js');
  assert.equal(geometry.cameraBox({zoom : .4, x : 560, y : 365}).width, 2500);
  const sites = sitesResult.sites;
  assert.equal(sites.length, DEVELOPMENT.sites);
  assert.ok(sitesResult.hormones > 0);
  assert.equal(sitesResult.effects, Math.max(...Object.values(HORMONE_EFFECT)) + 1);
  assert.deepEqual(sitesResult.effectRoles.sensor, [ HORMONE_EFFECT.output, HORMONE_EFFECT.death ]);
  assert.deepEqual(sitesResult.effectRoles.motor,
                   [ HORMONE_EFFECT.excitation, HORMONE_EFFECT.output, HORMONE_EFFECT.death ]);
  assert.deepEqual(sitesResult.effectRoles.nerve,
                   Array.from({length : sitesResult.effects}, (_, effect) => effect));
  assert.ok(sitesResult.receptorHalfMin > 0);
  assert.ok(sitesResult.receptorHalfMax > sitesResult.receptorHalfMin);
  assert.ok(sitesResult.hormoneSigmaMin > 0);
  assert.ok(sitesResult.hormoneSigmaMax > sitesResult.hormoneSigmaMin);
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
  organ('gland', {x : 385, y : 330});
  const eggCenters = model.findOrgan(doc, egg.organId).centers;
  const spermCenters = model.findOrgan(doc, sperm.organId).centers;
  assert.equal(eggCenters.length, 3);
  assert.equal(spermCenters.length, 3);
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
  const plan = model.compileDocument(doc, sites);
  assert.ok(plan.groups.length >= 11);
  assert.equal(plan.groups.filter(g => g.function === 3).length, 2);
  assert.equal(plan.groups.filter(g => g.function === 4).length, 2);
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
  const module =
      model.placeModule(model.newDocument('Modul'), 'vision-steering', sites, {x : 343, y : 330});
  assert.ok(module);
  assert.equal(module.document.assemblies.length, 1);
  assert.equal(module.document.assemblies[0].centerIds.length, 3);
  assert.ok(model.mirrorAssembly(module.document, module.assemblyId, sites));
  assert.equal(model.addSubstance(doc), null);
  const docWithHormone = model.addSubstance(doc, sitesResult.hormones);
  assert.equal(docWithHormone.substances.length, 1);
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
  assert.equal(hormoneModel.substanceAffinity(1, 0, 0, 0, sitesResult), 1);
  assert.ok(hormoneModel.substanceAffinity(-1, 0, 0, 0, sitesResult) < .01);
  assert.equal(hormoneModel.substanceAffinity(1, 0, 0, 0), 0);
  assert.equal(hormoneModel.receptorAffinity({substance : 0, width : 0}, 0, sitesResult), 1);
  assert.equal(new Set(Array.from({length : sitesResult.hormones},
                                  (_, i) => views.substanceColor(i, sitesResult)))
                   .size,
               sitesResult.hormones);
  const activeReceiver = model.updateReceptor(docWithHormone, relay.centerId, HORMONE_EFFECT.output,
                                              {active : 1, substance : 0, width : .5});
  const hormoneScene = views.fishScene({...selected, document : activeReceiver});
  assert.match(hormoneScene, /aid-hormone-producer/);
  assert.match(hormoneScene, /aid-hormone-receiver/);
  assert.match(hormoneScene, /aid-hormone-influence/);
  selected.selected = {kind : 'center', id : eye.centerId};
  selected.effect = HORMONE_EFFECT.learning;
  const eyeReceptors = panels.inspector(selected);
  assert.match(eyeReceptors, /data-effect="5"/);
  assert.doesNotMatch(eyeReceptors, /data-effect="1"/);
  assert.match(eyeReceptors, /data-receptor-effect="5"/);
  selected.selected = {kind : 'center', id : fin.centerId};
  const motorReceptors = panels.inspector(selected);
  assert.match(motorReceptors, /data-effect="0"/);
  assert.doesNotMatch(motorReceptors, /data-effect="1"/);
  selected.selected = {kind : 'center', id : relay.centerId};
  assert.match(panels.inspector(selected), /data-effect="1"/);
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
  assert.match(panels.inspector(selected), /data-receptor-active/);
  assert.match(panels.inspector(selected), /data-learning-pad/);
  selected.selected = {kind : 'center', id : relay.centerId};
  assert.match(panels.inspector(selected), /data-learning-pad/);
  const pressedReceptor =
      model.updateReceptor(docWithHormone, relay.centerId, 6, {baseline : -1, sensitivity : 0});
  selected.document = pressedReceptor;
  selected.tool = 'hormone';
  selected.effect = 6;
  const chart = panels.inspector(selected);
  const plot = chart.match(/<polyline points="([^"]+)" class="aid-response-line"/)?.[1];
  assert.ok(plot);
  const ys = plot.split(' ').map(point => Number(point.split(',')[1]));
  assert.ok(ys.every(y => y >= 28 && y <= 122), 'full receptor curve remains visible');
  assert.match(chart, /aid-chart-caption/);
  selected.document = docWithHormone;
  selected.tool = 'select';
  assert.match(graph.cppnGraph({...selected, report : null}), /aid-cppn/);
  // Server-owned documents and modules survive a new page and a second browser.
  const python = `import json,sys,tempfile
from atelier_service import run
from studio_storage import run as store
plan=json.load(sys.stdin)
with tempfile.TemporaryDirectory(prefix='fish-studio-test-') as directory:
    document={"format":"v019-organ-studio","name":"Test","organs":[{"id":"brain","type":"brain","centers":[]}],
              "wires":[],"assemblies":[],"substances":[]}
    assert store(directory,{"operation":"save-draft","document":document})["saved"]
    assert store(directory,{"operation":"load-draft"})["document"]==document
    mod={"id":"module-test","name":"Test","organs":[],"wires":[]}
    store(directory,{"operation":"save-module","module":mod})
    assert store(directory,{"operation":"list-modules"})["modules"][0]==mod
    store(directory,{"operation":"delete-module","id":"module-test"})
    assert not store(directory,{"operation":"list-modules"})["modules"]
built=run({"operation":"build","plan":plan})
assert len(built["groups"])==len(plan["groups"])
assert len(built["eyeGroups"])==len(plan["groups"])
assert len(built["fins"])==3
assert all("strength" in fin and "spread" in fin for fin in built["fins"])
assert built["neurons"]>0 and len(built["cppn"]["nodes"])>30
assert len(built["cppn"]["links"])>50
report=run({"operation":"inspect","genome":built["genome"]})
assert report["neurons"]==built["neurons"]
assert isinstance(built["contacts"], list)
assert all(len(row)==8 and row[2]>0 and 0<=row[4]+row[5]<=row[2] for row in built["contacts"])
active=next((i for i,group in enumerate(built["groups"]) if group["cells"]>0),None)
assert active is not None, "Developed model must contain a stimulus-capable organ"
probe=run({"operation":"probe","genome":built["genome"],"plan":plan,"group":active,"steps":2})
assert probe["source"]==active and probe["stimulated"]>0
assert len(probe["frames"])==3
assert all(len(frame)==len(plan["groups"]) for frame in probe["frames"])
assert all(isinstance(value,(float,int)) for frame in probe["frames"] for value in frame)
assert any(abs(frame[active])>1e-6 for frame in probe["frames"]), "Stimulating the selected organ must change its activity"
print("Engine, compilation, actual contacts, probe, persistence: OK")`;
  const output =
      execFileSync('python3', [ '-c', python ],
                   {cwd : root, input : JSON.stringify(plan), encoding : 'utf8', timeout : 45000});
  assert.match(output, /Engine, compilation, actual contacts, probe, persistence: OK/);
  // A saved custom module retains all chosen receptor, color and edge settings.
  const {OrganStudio, initializeStudio} = await import('../ui/studio.js');
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
  const renderedModule = views.assemblyPreview({
    document : model.newDocument(), sites, camera : {zoom : 2}
  }, placed);
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
  await probe.stimulate(eye.centerId);
  assert.equal(sent.operation, 'probe');
  assert.equal(sent.genome, probe.state.genome);
  assert.ok(pulsed);
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
    classList : {contains : key => hormone && key === 'aid-hormone-compass'}
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
