// The hand-drawn plan must actually develop, survive serialization, and tolerate
// direct node/edge edits in the exact production v019 compiler.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');

(async () => {
  const model = await import('../ui/studio_model.js');
  const views = await import('../ui/studio_views.js');
  const graph = await import('../ui/studio_graph.js');
  const plan = model.handfishPlan();
  assert.equal(model.SITES.length, 360);
  assert.equal(model.blankPlan().groups.length, 0);
  assert.equal(plan.groups.length, 30);
  assert.equal(model.OUTPUTS.length, 20);
  assert.equal(model.EFFECTS.length, 7);
  assert.equal(model.SUBSTANCES[4], 'Reife');
  assert.equal(model.activeSubstances(model.blankPlan()).length, 0);
  assert.notDeepEqual(
    views.sitePosition({...model.SITES[160],v:0}),
    views.sitePosition({...model.SITES[160],v:1}));
  assert.ok(views.fishCanvas(plan,0,22).includes('aid-muscle-legend'));
  assert.ok(views.fishCanvas(plan,0,null,null,{zoom:2}).includes('scale(0.50)'));
  const twelveCells={...plan.groups[0],copies:12};
  assert.ok(views.fishControls(twelveCells,plan,'organs',5,0).includes('12 von 16'));
  assert.ok(views.hormoneInspector(model.blankPlan(),0,null,5,-1)
    .includes('Stoff hinzufügen'));
  assert.equal(model.SITES.filter(p => plan.groups.filter(g => model.hasSite(g, p)).length > 1).length, 0);
  assert.ok(plan.groups.every(g => model.SITES.some(p => model.hasSite(g, p))));
  assert.ok(views.fishCanvas(plan,0,null).includes('Dein Fisch'));
  assert.ok(views.fishCanvas(model.blankPlan(),-1,null).includes('vorverdrahtete Baugruppen'));
  assert.ok(!views.fishCanvas(plan,0,null).includes('Höhenschicht'));
  assert.ok(views.fishCanvas(plan,0,0).includes('aid-development-sites'));
  assert.ok(views.fishCanvas(plan,0,null,null,{layer:'wires'}).includes('aid-fish-wire'));
  assert.ok(views.fishCanvas(plan,0,null).includes('aid-organ-cluster'));
  assert.ok(views.fishCanvas(plan,0,null,null,{layer:'hormones'}).includes('aid-fish-hormone'));
  assert.ok(views.fishControls(plan.groups[0],plan,'organs',5,0).includes('aid-response-pad'));
  assert.ok(!views.fishControls(plan.groups[0],plan,'organs',5,0).includes('Weitere Einstellungen'));
  assert.equal(model.PALETTE[22].name,'Muskel');
  assert.equal(model.functionAtSite(model.PALETTE[22],{zone:3}),0);
  assert.equal(model.functionAtSite(model.PALETTE[22],{zone:0}),5);
  assert.equal(model.validSiteFor(model.PALETTE[0],model.SITES.find(p=>p.zone===3)),false);
  assert.equal(model.validSiteFor(model.PALETTE[0],model.SITES.find(p=>p.zone===1)),true);
  const {initializeStudio} = await import('../ui/studio.js');
  const events = {};
  const mapElement={getBoundingClientRect:()=>({
    left:0,top:0,right:960,bottom:400,width:960,height:400})};
  const trashElement={getBoundingClientRect:()=>({
    left:900,top:340,right:960,bottom:400,width:60,height:60}),
    classList:{toggle:()=>{}}};
  const previewElement={style:{},setAttribute:()=>{},classList:{toggle:()=>{},add:()=>{}},
    innerHTML:''};
  const sitesElement={innerHTML:''};
  const root = {
    hidden:false, innerHTML:'',
    querySelector:selector => ({
      '#aid-body-map':mapElement,'#aid-trash':trashElement,
      '#aid-place-preview':previewElement,'#aid-development-sites':sitesElement,
      '#aid-placement-status':{textContent:''}
    })[selector]||null,
    addEventListener:(name,callback) => { events[name] = callback; }
  };
  global.document = {
    body:{dataset:{}},
    getElementById:id => id === 'station-root' ? root : null,
    addEventListener:()=>{}
  };
  let savedDraft=null,savedModules=null;
  global.localStorage = {getItem:() => null, setItem:(key,value) => {
    if(key.includes('library'))savedModules=JSON.parse(value);
    else savedDraft=JSON.parse(value);
  }};
  global.setInterval = () => 0;
  initializeStudio();
  assert.equal(document.body.dataset.station, 'hub');
  assert.ok(root.innerHTML.includes('Artificial Intelligent Design'));
  assert.ok(root.innerHTML.includes('Freie Wildbahn'));
  function click(attribute, value, x=0, y=0) {
    const key=attribute.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    events.click({target:{closest:selector => selector === `[data-${attribute}]` ?
      {dataset:{[key]:value}} : null},clientX:x,clientY:y});
  }
  click('action','atelier');
  assert.ok(root.innerHTML.includes('Dein Fisch'));
  assert.ok(root.innerHTML.includes('0 Bauteile'));
  assert.ok(root.innerHTML.includes('Beispielfisch laden'));
  click('tool','0'); click('place','body',200,164); // eye
  click('tool','6'); click('place','body',452,198); // processing nerves
  click('tool','7'); click('place','body',687,189); // propulsion
  click('tool','9'); click('place','body',260,194); // suction
  click('tool','12');click('place','body',721,189); // egg production and release
  click('select-group','0');click('connect-to','1'); // eye → circuit
  click('select-group','1');click('connect-to','2'); // circuit → propulsion
  click('select-group','1');click('connect-to','3'); // circuit → suction
  click('select-group','1');click('breed','learning');
  assert.equal(savedDraft.groups[1].evolution.learning,true);
  assert.equal(savedDraft.groups.length,7);
  assert.equal(savedDraft.groups.filter(g=>g.function===3).length,2);
  assert.equal(savedDraft.groups.filter(g=>g.role===0&&g.function===9).length,1);
  assert.equal(model.SITES.filter(p => savedDraft.groups.filter(g => model.hasSite(g,p)).length>1).length,0);
  const placedPlan=savedDraft;
  // The aquarium's global `aside` and `footer` rules assign fixed grid cells.
  // The atelier must use its own elements, or the canvas collapses to column 1.
  assert.ok(root.innerHTML.includes('<div class="aid-workspace-sidebar">'));
  assert.ok(root.innerHTML.includes('<div class="aid-workspace-controls">'));
  assert.ok(root.innerHTML.includes('<div class="aid-workspace-footer"'));
  assert.ok(!root.innerHTML.includes('<aside class="aid-workspace-'));
  assert.ok(!root.innerHTML.includes('<footer class="aid-workspace-'));
  const studioCss = readFileSync(join(__dirname, '../ui/studio.css'), 'utf8');
  assert.match(studioCss, /\.aid-workspace-main\s*\{[^}]*grid-template-columns:\s*minmax\(/);
  assert.match(studioCss, /#station-root\s+\.aid-workspace-modes>button\s*\{[^}]*flex:0 0 auto/);
  click('select-group','1');click('neuron-preset','learn');
  assert.equal(savedDraft.groups[1].nervePreset,'learn');
  assert.equal(savedDraft.groups[1].qwidth,.8);
  click('layer','wires');
  assert.ok(root.innerHTML.includes('Verschalten'));
  assert.ok(root.innerHTML.includes('Mögliche Kontakte'));
  click('contact-range','.2');
  assert.equal(savedDraft.groups[1].range,.2);
  click('contact-sigma','.3');
  assert.equal(savedDraft.groups[1].sigma,.3);
  click('contact-crossing','.7');
  assert.equal(savedDraft.groups[1].crossing,.7);
  click('layer','hormones');
  assert.ok(root.innerHTML.includes('Botenstoffe'));
  assert.ok(root.innerHTML.includes('Stoff hinzufügen'));
  click('action','hormone-add');
  assert.deepEqual(savedDraft.substances,['Stoff A']);
  events.change({target:{dataset:{hormoneName:'0'},value:'Wachstumshilfe'}});
  assert.equal(savedDraft.substances[0],'Wachstumshilfe');
  click('select-group','1');
  click('layer','learning');
  assert.ok(root.innerHTML.includes('aid-learning-panel'));
  click('layer','organs');
  click('action','build-module');
  click('select-group','0');click('select-group','1');
  assert.ok(root.innerHTML.includes('Baugruppe · 2 Teile'));
  click('action','clear-multiselect');
  assert.ok(root.innerHTML.includes('aid-palette-part'));
  assert.ok(root.innerHTML.includes('Fertige Baugruppen'));
  click('tool','22');click('place','body',865,135);
  assert.equal(savedDraft.groups.at(-1).function,0);
  click('module','sehen-lenken');click('place','body',220,158);
  assert.equal(savedDraft.groups.length,11);
  assert.equal(savedDraft.groups[8].receiver1,savedDraft.groups[7].sender1);
  global.prompt=()=>'Mein Sehnetz';
  click('action','save-module');
  assert.equal(savedModules[0].name,'Mein Sehnetz');
  assert.equal(savedModules[0].groups.length,3);
  assert.ok(root.innerHTML.includes('Mein Sehnetz'));
  // The same pointer gesture supports drag-to-place and drag-to-trash.
  const draggedTool={dataset:{tool:'22'},style:{},setPointerCapture:()=>{}};
  const paletteTarget={closest:selector=>selector==='[data-tool]'?draggedTool:null};
  const pointer=(target,x,y,id=42)=>({target,pointerId:id,clientX:x,clientY:y,
    preventDefault:()=>{}});
  events.pointerdown(pointer(paletteTarget,90,160));
  events.pointermove(pointer(paletteTarget,851,129));
  events.pointerup(pointer(paletteTarget,851,129));
  assert.equal(savedDraft.groups.length,12);
  const movingMarker={dataset:{dragBody:'11'},style:{},setPointerCapture:()=>{}};
  const markerTarget={closest:selector=>selector==='[data-drag-body]'?movingMarker:null};
  events.pointerdown(pointer(markerTarget,850,130,43));
  events.pointermove(pointer(markerTarget,930,366,43));
  events.pointerup(pointer(markerTarget,930,366,43));
  assert.equal(savedDraft.groups.length,11);
  const wheelTarget={closest:selector=>selector==='#aid-body-map'?mapElement:null};
  events.wheel({...pointer(wheelTarget,460,200,44),deltaY:-100});
  assert.ok(root.innerHTML.includes('116 %'));
  events.click({target:{closest:()=>null}}); // emulate the browser's post-pointer click
  click('tab','development');
  assert.ok(root.innerHTML.includes('Bereit zur Entwicklungsprüfung'));
  click('tab','cppn');
  assert.ok(root.innerHTML.includes('CPPN-Werkbank'));
  assert.ok(root.innerHTML.includes('Leeres CPPN beginnen'));

  // Opening a new session never covers the hub or atelier with a fish picker.
  const {sceneState} = await import('../ui/state.js');
  const {offerPopulation, shouldOfferPopulation} = await import('../ui/population_picker.js');
  sceneState.frame = {time:0};
  for (const station of ['hub','studio']) {
    document.body.dataset.station = station;
    assert.equal(shouldOfferPopulation({offer_population:true}), false);
    offerPopulation({offer_population:true}); // no command or dialog
  }
  document.body.dataset.station = 'aquarium';
  assert.equal(shouldOfferPopulation({offer_population:true}), true);
  assert.equal(shouldOfferPopulation({offer_population:false}), false);
  sceneState.frame = null;
  assert.equal(shouldOfferPopulation({offer_population:true}), false);

  const python = `import json,sys,subprocess,tempfile
from pathlib import Path
from viewer_paths import engine_path
from atelier_service import run
input=json.load(sys.stdin)
p=input['handfish']
painted=input['painted']
b=run({'operation':'build','plan':p})
assert b['viable'] and not b['limited'] and b['neurons'] >= 100 and b['synapses'] >= 100
assert all(b['checks'].values())
assert len(b['groups']) == len(p['groups'])
assert len(b['sites']) > 100
assert len(b['cppn']['nodes']) > 30 and len(b['cppn']['links']) > 100
assert len(b['groups'][-1]['receptors']) == 7
small=run({'operation':'build','plan':painted})
assert len(small['groups'])==7 and small['neurons'] > 0
assert small['checks']['sense'] and small['checks']['swim'] and small['checks']['mouth']
assert small['checks']['eggs']
assert small['checks']['connections'] and small['viable'] and not small['limited']
tail=next(g for g in b['groups'] if g['name']=='Schwanzantrieb')
assert tail['receptors'][5][0] > 0 and abs(tail['receptors'][5][1]) < .001
with tempfile.TemporaryDirectory(prefix='fish-atelier-smoke-') as folder:
    source=Path(folder)/'handfish.genome'
    source.write_text(b['genome'],encoding='utf-8')
    preview=subprocess.run([str(engine_path()),'--preview-genome',str(source)],
                           capture_output=True,text=True,timeout=25)
    assert preview.returncode==0, preview.stderr
    assert json.loads(preview.stdout)
a=run({'operation':'inspect','genome':b['genome']})
assert a['neurons']==b['neurons'] and a['synapses']==b['synapses']
node=next(n for n in a['cppn']['nodes'] if n[3] == 1)
edited=run({'operation':'edit','genome':b['genome'],'edit':'node',
            'id':node[0],'type':node[1],'parameter':node[2]+.002})
assert edited['cppn']['nodes'] != a['cppn']['nodes']
link=a['cppn']['links'][0]
edited2=run({'operation':'edit','genome':b['genome'],'edit':'link',
             'id':link[0],'weight':link[3]+.002,'enabled':link[4]})
assert edited2['cppn']['links'] != a['cppn']['links']
occupied={(e[1],e[2]) for e in a['cppn']['links']}
new_from,new_to=next((src,n[0]) for n in a['cppn']['nodes'] if n[3]==1
                      for src in range(10) if (src,n[0]) not in occupied)
connected=run({'operation':'edit','genome':b['genome'],'edit':'connect',
               'from':new_from,'to':new_to,'weight':.001,'port':0})
assert len(connected['cppn']['links']) == len(a['cppn']['links']) + 1
split=run({'operation':'edit','genome':b['genome'],'edit':'split','id':link[0]})
assert len(split['cppn']['nodes']) == len(a['cppn']['nodes']) + 1
blank=run({'operation':'new','example':'blank'})
assert len(blank['cppn']['nodes'])==30 and not blank['cppn']['links']
assert blank['viable'] is False and blank['checks']['sense'] is False
addition=run({'operation':'new','example':'sum'})
assert len(addition['cppn']['links'])==2
assert {(e[1],e[2]) for e in addition['cppn']['links']}=={(4,10),(5,10)}
extended=run({'operation':'edit','genome':addition['genome'],'edit':'add-node',
              'type':3,'parameter':1})
assert len(extended['cppn']['nodes'])==31
print(json.dumps({'neurons':b['neurons'],'synapses':b['synapses'],
                  'cppn':b['cppn'],'sites':b['sites']}))`;
  const raw = execFileSync('python3', ['-B','-c',python],
    {input:JSON.stringify({handfish:plan,painted:placedPlan}), maxBuffer:4*1024*1024});
  const developed = JSON.parse(raw.toString());
  const testReport = {cppn: developed.cppn, neurons: developed.neurons,
    synapses: developed.synapses, groups:[], sites:developed.sites};
  assert.ok(graph.cppnGraph(testReport, 0, {kind:'node',id:10}).includes('CPPN entwerfen'));
  assert.ok(graph.cppnGraph(testReport, 0, {kind:'node',id:10}).includes('Zelle anlegen'));
  assert.ok(graph.cppnControls(testReport, {kind:'node',id:30},
    {from:9,to:10,weight:.5,port:0}).includes('Neue Verbindung'));
  console.log('Atelier: 360 Orte, echter v019-CPPN, Genome-Import und Knoten-/Kantenänderung OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
