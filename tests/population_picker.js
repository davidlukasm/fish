const fs = require('fs'), vm = require('vm'), assert = require('assert');
const {createFixture} = require('./dom_fixture'), {readUI} = require('./ui_source');
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const {sandbox, elements} = createFixture({});
const source = input.entries.map(e => ({...e})),
      founders = source.filter(e => e.id.startsWith('founder:'));
while (source.filter(e => e.group === 'founders').length < 19) {
  const id = 'founder:extra-' + source.length;
  source.push({...founders[0], id, name : id, group : 'founders'});
}
for (const e of source)
  if (e.id.startsWith('founder:'))
    e.group = 'founders';
// Explicit trial data keeps this check independent of the shipped pool.
source[0].measured = true;
source[0].foraging_samples = 1800;
source[0].overall_score = 100;
source[0].sense_foraging = [ null, .3 ];
source[0].observed_diet = [ 0, 0, 0, 0, 20, 10, 50, 0, 0, 0, 20 ];
source[0].observed_raw_diet = [ 0, 0, 0, 0, 80, 40, 50, 0, 0, 0, 20 ];
source[0].observed_digested = 60;
source[0].diet_scope = 'Lebenszyklus-Test';
const previews = [], commands = [];
sandbox.el = id => elements[id];
sandbox.text = (id, value) => elements[id].textContent = value;
sandbox.sceneState = {
  frame : null
};
sandbox.frame = null;
sandbox.document.hidden = true;
sandbox.fishPreviewPose = () => ({a : {}, r : 1, x : 0, y : 0});
sandbox.command = async (name, args) => {
  commands.push({name, ...args});
  return true;
};
sandbox.request = async url => {
  if (url === '/population')
    return {ok : true, json : async () => ({entries : source})};
  const id = decodeURIComponent(url.split('=')[1]);
  previews.push(id);
  return {ok : true, json : async () => ({portrait : input.portrait})};
};
const create = sandbox.document.createElement;
sandbox.document.createElement = tag => {
  const e = create(tag);
  e.remove = () => e.parentElement.removeChild(e);
  return e;
};
const grid = elements['population-grid'], dialog = elements['new-run-dialog'];
dialog.showModal = () => dialog.open = true;
grid.clientHeight = 350;
Object.defineProperty(grid, 'scrollHeight',
                      {get : () => Math.ceil(grid.children.length / 3) * 400});
elements['new-fish'].value = '100';
vm.createContext(sandbox);
vm.runInContext(readUI('schema') + '\n' + readUI('population_picker'), sandbox);
const run = code => vm.runInContext(code, sandbox),
      settle = () => new Promise(resolve => setImmediate(resolve));
const allText = e => [e.textContent, ...e.children.map(allText)].join(' ');
const star = e => e.children.find(c => c.className === 'population-star');
(async () => {
  const ranked = run(`(() => {
    const rows = [
      {name:'B',group:'founders',class:1,selection_group:2,overall_score:20,sense_cells:{eye:null,nose:.2}},
      {name:'A',group:'founders',class:1,selection_group:2,overall_score:80,sense_cells:{eye:.3,nose:.1}},
      {name:'C',group:'founders',class:2,selection_group:0,overall_score:40,sense_cells:{eye:.7,nose:null}}
    ];
    return ['overall_score','eye','nose','diversity'].map(key =>
      [true,false].map(desc => rankPopulation(rows,key,desc).map(e=>e.name).join('')));
  })()`);
  assert.deepEqual(JSON.parse(JSON.stringify(ranked)),
                   [ [ 'ACB', 'BCA' ], [ 'CAB', 'ACB' ], [ 'BAC', 'ABC' ], [ 'BCA', 'BCA' ] ]);
  run('bindPopulationPicker()');
  elements['population-group'].onchange({target : {value : 'founders'}});
  await run('openPopulationPicker()');
  assert.equal(grid.children.length, 6);
  assert.equal(previews.length, 6);
  assert(allText(grid.children[0]).includes('Bewegung pro Schritt'));
  assert(allText(grid.children[0]).includes('Drehung'));
  assert(allText(grid.children[0]).includes('Verwertbare Aufnahme'));
  assert(allText(grid.children[0]).includes('Plankton'));
  assert(allText(grid.children[0]).includes('Kiefer'));
  assert(allText(grid.children[0]).includes('Darm'));
  assert(allText(grid.children[0]).includes('Modell 19 · gemischte Nahrung'));
  const unmeasured = run(
      "(()=>{const b=document.createElement('div');founderResults({measured:false},b,{});return b;})()");
  assert(allText(unmeasured).includes('unter v018b noch ungeprüft'));
  const hatchOnly = run(
      "(()=>{const b=document.createElement('div');founderResults({measured:true,hatches:1,hatch_attempts:3,hatch_steps:500,foraging_samples:0},b,{});return b;})()");
  assert(allText(hatchOnly).includes('1/3 geschlüpft'));
  assert(!allText(hatchOnly).includes('Gesamtwert'));
  assert.equal(run('metricValue(entries[0], "plants")'), .3);
  assert.equal(run('metricValue(entries[0], "plankton")'), .5);
  assert.equal(run('metricValue(entries[0], "benthos")'), .2);
  assert.equal(run('metricValue({observed_diet: null}, "plants")'), null);
  assert(allText(grid.children[0]).includes('Futterstücke gefressen'));
  assert(!allText(grid.children[0]).includes('Ohne Nase'));
  assert(grid.children[0].children.at(-1).children[0].className === 'population-senses');
  const first = grid.children[0], check = first.children[0].children[0];
  check.checked = true;
  check.onchange();
  grid.scrollTop = grid.scrollHeight - grid.clientHeight;
  grid.onscroll();
  grid.onscroll();
  await settle();
  assert.equal(grid.children.length, 12, 'Repeated scroll events must not duplicate batches');
  assert.equal(grid.children[0], first, 'Appending preserves the existing cards');
  assert(check.checked);
  assert.equal(run('selectedPopulation().length'), 1);
  grid.scrollTop = grid.scrollHeight - grid.clientHeight;
  grid.onscroll();
  await settle();
  assert.equal(grid.children.length, 18);
  assert.equal(new Set(previews).size, previews.length);

  elements['population-group'].onchange({target : {value : 'saved'}});
  await settle();
  assert.equal(grid.children.length, 2);
  const saved = grid.children[0], button = star(saved);
  grid.scrollTop = 10;
  await button.onclick();
  assert.equal(button.attrs['aria-pressed'], 'true');
  assert.equal(grid.children[0], saved, 'Favoriting preserves the best-fish card');
  assert.equal(grid.children.length, 2);
  assert.equal(grid.scrollTop, 10);
  elements['population-group'].onchange({target : {value : 'favorites'}});
  await settle();
  assert.equal(grid.children.length, 2, 'Favorites overlap the best-fish collection');
  const same = grid.children.find(c => c.children[0].children[1].textContent ===
                                       saved.children[0].children[1].textContent);
  await star(same).onclick();
  await settle();
  assert.equal(grid.children.length, 1);
  elements['population-group'].onchange({target : {value : 'saved'}});
  await settle();
  assert.equal(grid.children.length, 2);
  assert.equal(star(grid.children[0]).attrs['aria-pressed'], 'false');
  assert.equal(commands.filter(c => c.name === 'favorite-genome').length, 2);

  const count = previews.length;
  elements['population-group'].onchange({target : {value : 'founders'}});
  await settle();
  assert.equal(previews.length, count, 'Returning to a group reuses its portraits');
  elements['population-search'].value = 'extra-';
  elements['population-search'].oninput();
  await settle();
  assert(grid.children.every(c => allText(c).includes('extra-')));
  elements['population-search'].value = 'no matching fish';
  elements['population-search'].oninput();
  await settle();
  assert.equal(grid.children.length, 1);
  assert(allText(grid).includes('Keine passenden Founder'));
  assert.equal(run('selectedPopulation().length'), 1);
  elements['population-search'].value = '';
  elements['population-sort'].children.find(b => b.dataset.key === 'overall_score').onclick();
  await settle();
  const scores = run('rankPopulation(entries.filter(e=>e.group==="founders"),"overall_score")');
  assert.equal(grid.children[0].children[0].children[1].textContent, scores[0].name);
  elements['population-sort-direction'].onclick();
  await settle();
  const ascending =
      run('rankPopulation(entries.filter(e=>e.group==="founders"),"overall_score",false)');
  assert.equal(grid.children[0].children[0].children[1].textContent, ascending[0].name);
  assert.equal(run('selectedPopulation().length'), 1, 'Sorting preserves checked line identifiers');
  console.log(
      'Founder-Auswahl: Sortierung, Messwerte, Nachladen, stabile Auswahl, Vorschaucache und Favoriten: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
