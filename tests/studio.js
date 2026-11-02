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
  assert.equal(model.SITES.filter(p => plan.groups.filter(g => model.hasSite(g, p)).length > 1).length, 0);
  assert.ok(plan.groups.every(g => model.SITES.some(p => model.hasSite(g, p))));
  assert.ok(views.anatomy(plan, 0, null).includes('Dein Fisch'));
  assert.ok(views.anatomy(model.blankPlan(), -1, null).includes('Noch keine Zellen'));
  assert.ok(!views.anatomy(plan, 0, null).includes('Höhenschicht'));
  assert.ok(views.contacts(plan, 0).includes('Wer spricht mit wem?'));
  assert.ok(views.hormones(plan, 0, 5).includes('Hormone & Lernen'));
  const {initializeStudio} = await import('../ui/studio.js');
  const events = {};
  const root = {
    hidden:false, innerHTML:'',
    querySelector:selector => selector==='#aid-body-map'?
      {getBoundingClientRect:()=>({left:0,top:0,width:960,height:400})}:null,
    addEventListener:(name,callback) => { events[name] = callback; }
  };
  global.document = {
    body:{dataset:{}},
    getElementById:id => id === 'station-root' ? root : null,
    addEventListener:()=>{}
  };
  let savedDraft=null;
  global.localStorage = {getItem:() => null, setItem:(_,value) => { savedDraft=JSON.parse(value); }};
  global.setInterval = () => 0;
  initializeStudio();
  assert.equal(document.body.dataset.station, 'hub');
  assert.ok(root.innerHTML.includes('Artificial Intelligent Design'));
  assert.ok(root.innerHTML.includes('Freie Wildbahn'));
  function click(attribute, value, x=0, y=0) {
    events.click({target:{closest:selector => selector === `[data-${attribute}]` ?
      {dataset:{[attribute]:value}} : null},clientX:x,clientY:y});
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
  assert.equal(savedDraft.groups.length,6);
  assert.equal(savedDraft.groups.filter(g=>g.function===3).length,2);
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
  click('tab','contacts');
  assert.ok(root.innerHTML.includes('Wer spricht mit wem?'));
  click('tab','hormones');
  assert.ok(root.innerHTML.includes('Hormone & Lernen'));
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
assert len(small['groups'])==6 and small['neurons'] > 0
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
