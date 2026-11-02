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
  assert.equal(plan.groups.length, 30);
  assert.equal(model.OUTPUTS.length, 20);
  assert.equal(model.EFFECTS.length, 7);
  assert.equal(model.SITES.filter(p => plan.groups.filter(g => model.hasSite(g, p)).length > 1).length, 0);
  assert.ok(plan.groups.every(g => model.SITES.some(p => model.hasSite(g, p))));
  assert.ok(views.anatomy(plan, 0, 'all').includes('Körperkarte'));
  assert.ok(views.contacts(plan, 0).includes('Kontaktkarte'));
  assert.ok(views.hormones(plan, 0, 5).includes('Hormone & Lernen'));
  const {initializeStudio} = await import('../ui/studio.js');
  const events = {};
  const root = {
    hidden:false, innerHTML:'', querySelector:()=>null,
    addEventListener:(name,callback) => { events[name] = callback; }
  };
  global.document = {
    body:{dataset:{}},
    getElementById:id => id === 'station-root' ? root : null,
    addEventListener:()=>{}
  };
  global.localStorage = {getItem:() => null, setItem:() => {}};
  global.setInterval = () => 0;
  initializeStudio();
  assert.equal(document.body.dataset.station, 'hub');
  assert.ok(root.innerHTML.includes('Artificial Intelligent Design'));
  assert.ok(root.innerHTML.includes('Freie Wildbahn'));
  function click(attribute, value) {
    events.click({target:{closest:selector => selector === `[data-${attribute}]` ?
      {dataset:{[attribute === 'action' ? 'action' : 'tab']:value}} : null}});
  }
  click('action','atelier');
  assert.ok(root.innerHTML.includes('Körperkarte'));
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
  assert.ok(root.innerHTML.includes('Kontaktkarte'));
  click('tab','hormones');
  assert.ok(root.innerHTML.includes('Hormone & Lernen'));
  click('tab','development');
  assert.ok(root.innerHTML.includes('Entwicklungsprotokoll'));
  click('tab','cppn');
  assert.ok(root.innerHTML.includes('CPPN-Werkbank'));

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
p=json.load(sys.stdin)
b=run({'operation':'build','plan':p})
assert b['viable'] and not b['limited'] and b['neurons'] >= 100 and b['synapses'] >= 100
assert len(b['groups']) == len(p['groups'])
assert len(b['sites']) > 100
assert len(b['cppn']['nodes']) > 30 and len(b['cppn']['links']) > 100
assert len(b['groups'][-1]['receptors']) == 7
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
print(json.dumps({'neurons':b['neurons'],'synapses':b['synapses'],
                  'cppn':b['cppn'],'sites':b['sites']}))`;
  const raw = execFileSync('python3', ['-B','-c',python], {input:JSON.stringify(plan), maxBuffer:4*1024*1024});
  const developed = JSON.parse(raw.toString());
  const testReport = {cppn: developed.cppn, neurons: developed.neurons,
    synapses: developed.synapses, groups:[], sites:developed.sites};
  assert.ok(graph.cppnGraph(testReport, 0, {kind:'node',id:10}).includes('CPPN-Werkbank'));
  assert.ok(graph.cppnControls(testReport, {kind:'node',id:30},
    {from:9,to:10,weight:.5,port:0}).includes('Neue Verbindung'));
  console.log('Atelier: 360 Orte, echter v019-CPPN, Genome-Import und Knoten-/Kantenänderung OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
