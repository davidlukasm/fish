// Organ-first atelier: engine anatomical sites, real compiler plans and UI gestures.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');

(async () => {
  const root = join(__dirname, '..');
  const {useTexts} = await import('../ui/strings.js');
  useTexts({default:'de'}, {de:{studio:JSON.parse(
    readFileSync(join(root,'ui/text/de/studio.json'),'utf8'))}});
  const model = await import('../ui/studio_model.js');
  const views = await import('../ui/studio_views.js');
  const panels = await import('../ui/studio_panels.js');
  const graph = await import('../ui/studio_graph.js');
  const sitesResult = JSON.parse(execFileSync(join(root,'bin/atelier'),['sites'], {
    encoding:'utf8',timeout:10000
  }));
  const sites = sitesResult.sites;
  assert.equal(sites.length,360);
  assert.equal(sitesResult.hormones,4);
  assert.equal(sitesResult.effects,7);
  assert.ok(sites.every(site => Number.isInteger(site.senses) &&
    Number.isInteger(site.motors)));
  let doc = model.newDocument('Atelier-Test');
  assert.equal(doc.organs.length,1);
  assert.equal(model.allCenters(doc).length,0);
  function organ(type, position) {
    const added = model.addOrgan(doc,type,sites,position);
    assert.ok(added,type + ' must have an anatomically legal position');
    doc = added.document;
    return added;
  }
  const eye = organ('eye',{x:325,y:300});
  const relay = model.addNeuron(doc,'relay',sites,{x:490,y:360});
  assert.ok(relay);
  doc = relay.document;
  const fin = organ('fin',{x:625,y:470});
  organ('mouth',{x:235,y:370});
  const egg = organ('eggs',{x:823,y:398});
  const sperm = organ('sperm',{x:840,y:344});
  organ('gland',{x:385,y:330});
  const eggCenters = model.findOrgan(doc,egg.organId).centers;
  const spermCenters = model.findOrgan(doc,sperm.organId).centers;
  assert.equal(eggCenters.length,3);
  assert.equal(spermCenters.length,3);
  for (const [from,to] of [[eye.centerId,relay.centerId],[relay.centerId,fin.centerId]]) {
    const wire = model.addWire(doc,from,to);
    assert.ok(wire);
    doc = wire.document;
  }
  assert.equal(model.addWire(doc,eye.centerId,fin.centerId),null);
  const plan = model.compileDocument(doc,sites);
  assert.ok(plan.groups.length >= 11);
  assert.equal(plan.groups.filter(g => g.function === 3).length,2);
  assert.equal(plan.groups.filter(g => g.function === 4).length,2);
  assert.ok(plan.groups.every(g => sites.some(s =>
    s.zone === g.zone && s.side === g.side &&
    s.u === g.u0 && s.v === g.v0 && s.w === g.w0)));
  assert.ok(plan.groups.every(g => g.receptors.length === sitesResult.effects));
  const changed = model.updateCenter(doc,eye.centerId,{copies:12});
  assert.equal(model.findCenter(changed,eye.centerId).center.copies,12);
  assert.equal(model.findCenter(doc,eye.centerId).center.copies,6);
  const assembly = model.assemble(doc,[eye.organId,'brain',fin.organId],
    'Sehweg',[eye.centerId,relay.centerId,fin.centerId]);
  assert.ok(assembly);
  doc = assembly;
  const groupId = doc.assemblies.at(-1).id;
  assert.ok(doc.assemblies.some(a => a.id === groupId));
  assert.ok(model.moveAssembly(doc,groupId,sites,{x:516,y:363}));
  assert.ok(model.removeAssembly(doc,groupId));
  const module = model.placeModule(model.newDocument('Modul'),
    'vision-steering',sites,{x:343,y:330});
  assert.ok(module);
  assert.equal(module.document.assemblies.length,1);
  assert.equal(module.document.assemblies[0].centerIds.length,3);
  assert.ok(model.mirrorAssembly(module.document,module.assemblyId,sites));
  const docWithHormone = model.addSubstance(doc,sitesResult.hormones);
  assert.equal(docWithHormone.substances.length,1);
  const selected = {
    document:docWithHormone,sites,selected:{kind:'assembly',id:groupId},
    multi:new Set(),tool:'select',wireScope:'all',
    camera:{zoom:1,x:560,y:365},capabilities:sitesResult,
    report:null,stale:true,effect:6,focusSubstance:0
  };
  const scene = views.fishScene(selected);
  assert.match(scene,/data-assembly=/);
  assert.match(scene,/data-wire=/);
  assert.match(scene,/aid-eye-cone/);
  assert.match(scene,/aid-anatomical-gland/);
  assert.match(panels.inspector(selected),/data-mirror-assembly/);
  selected.tool = 'hormone';
  assert.match(panels.inspector(selected),/aid-hormone-map/);
  selected.tool = 'select';
  selected.multi = new Set([eye.organId,fin.organId]);
  assert.match(panels.inspector(selected),/data-assemble-selected/);
  selected.multi.clear();
  assert.ok(panels.library(selected).includes('data-drag-kind="organ"'));
  selected.selected = {kind:'wire',id:doc.wires[0].id};
  assert.match(panels.inspector(selected),/data-remove-wire/);
  assert.match(graph.cppnGraph({...selected,report:null}),/aid-cppn/);
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
assert built["neurons"]>0 and len(built["cppn"]["nodes"])>30
assert len(built["cppn"]["links"])>50
report=run({"operation":"inspect","genome":built["genome"]})
assert report["neurons"]==built["neurons"]
print("Engine, compilation, persistence: OK")`;
  const output = execFileSync('python3',['-c',python], {
    cwd:root,input:JSON.stringify(plan),encoding:'utf8',timeout:45000
  });
  assert.match(output,/Engine, compilation, persistence: OK/);
  const {initializeStudio} = await import('../ui/studio.js');
  const events = {};
  const station = {innerHTML:'',hidden:false,querySelector:()=>null,
    addEventListener:(kind,handler)=>{events[kind]=handler;}};
  global.document = {
    body:{dataset:{}},
    getElementById:id=>id==='station-root'?station:null,
    addEventListener:()=>{}
  };
  global.window = {FISH_TOKEN:'test',addEventListener:()=>{}};
  global.fetch = async (_url) => { throw Error('off-line UI test'); };
  initializeStudio();
  assert.equal(document.body.dataset.station,'hub');
  assert.match(station.innerHTML,/Artificial Intelligent Design/);
  const click = operation=>events.click({target:{closest:selector =>
    selector==='[data-action]' ? {dataset:{action:operation}} : null}});
  click('atelier');
  assert.equal(document.body.dataset.station,'studio');
  assert.match(station.innerHTML,/aid-workspace-main/);
  assert.match(station.innerHTML,/aid-body-map/);
  click('home');
  assert.equal(document.body.dataset.station,'hub');
  console.log('Atelier: echte Entwicklungsorte, Organmodell, Oberfläche und Compiler: OK');
})().catch(error => {console.error(error);process.exitCode=1;});
