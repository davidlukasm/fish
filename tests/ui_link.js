const fs = require('fs'), vm = require('vm'), path = require('path');
const assert = require('node:assert/strict');
const {createFixture} = require('./dom_fixture');
async function evaluate(source, globals = {}) {
  const {sandbox} = createFixture({}), context = vm.createContext(Object.assign(sandbox, globals)),
        cache = new Map();
  function load(specifier, referrer) {
    const name = path.posix.normalize(
        path.posix.join(path.posix.dirname(referrer?.identifier || 'entry.js'), specifier));
    if (!cache.has(name))
      cache.set(name, new vm.SourceTextModule(fs.readFileSync('ui/' + name, 'utf8'),
                                              {context, identifier : name}));
    return cache.get(name);
  }
  const entry = new vm.SourceTextModule(source, {context, identifier : 'entry.js'});
  await entry.link(load);
  await entry.evaluate();
  return load;
}
// GLSL ES 3.00 shaders start with their version line; without it the browser compiles them as
// ES 1.00 and rejects them.
function shadersVersioned() {
  for (const name of fs.readdirSync('ui', {recursive : true}).filter(n => n.endsWith('.js')))
    if (/`\s*precision\s/.test(fs.readFileSync('ui/' + name, 'utf8')))
      throw new Error(name + ': Shader ohne #version 300 es');
}
function bottomFeedingUsesFiniteGeometry() {
  const source = fs.readFileSync('ui/effects.js', 'utf8'),
        constants = source.slice(source.indexOf('const FEEDING ='),
                                 source.indexOf('export function paintFeeding')),
        paint = source
                    .slice(source.indexOf('export function paintFeeding'),
                           source.indexOf('const ECOLOGY_FEEDING'))
                    .replace('export ', '');
  let grains = 0;
  const ctx = new Proxy({}, {
    get : (_, key) => (...args) => {
      assert(args.every(x => typeof x !== 'number' || Number.isFinite(x)), `${key}: ${args}`);
      if (key === 'ellipse')
        grains++;
    }
  });
  const FISH = Object.fromEntries([
    'hatched', 'id', 'x', 'y', 'angle', 'suction_pose', 'feeding_action', 'feeding_action_age',
    'filtered', 'swallowed'
  ].map(name => [name, name]));
  const context = vm.createContext({
    ctx,
    FISH,
    FEEDING_EFFECT : {scrape : 1},
    TOLERANCE : {negligible : 1e-8},
    cameraState : {viewportWidth : 1400, viewportHeight : 900},
    worldToScreen : p => p,
    fishDisplayRadius : () => 10,
    displayStep : () => 100,
    fishSnapshotAnatomy : () => ({}),
    fishPoseAnatomy : () => ({}),
    fishMouthShape : () => ({front : 1, gap : .2}),
    fish : {
      hatched : 1,
      id : 1,
      x : 200,
      y : 200,
      angle : .3,
      suction_pose : .8,
      feeding_action : 1,
      feeding_action_age : 2,
      filtered : 0,
      swallowed : .03
    }
  });
  vm.runInContext(
      constants + paint +
          '\nfor (const scale of [1, 8.671137658463463, 14]) paintFeeding({step:100}, {scale}, 1, [fish]);',
      context);
  assert(grains > 0, 'Bottom feeding draws its ingested grains at aquarium zoom levels');
}

function sharedFishShapesSurviveDrawing(load) {
  const {FISH, ANATOMY} = load('schema.js').namespace, {sceneState} = load('state.js').namespace,
               forms = load('fish_forms.js').namespace, animals = load('animals.js').namespace;
  forms.initialize([ 'fishAnatomyCache', 'fishOverviewEpoch', 'fishOverviewShapes' ]);
  load('fish_fins.js').namespace.initialize([ 'fishTemplateScales' ]);
  animals.initialize([ 'animalMeshes' ]);
  const base = new Array(FISH.count).fill(0);
  base[FISH.hatched] = 1;
  base[FISH.radius] = 5;
  base[FISH.mass] = 2;
  base[FISH.reserve_capacity] = 250;
  base[FISH.egg_capacity] = 70;
  base[FISH.sperm_capacity] = 20;
  base[FISH.organs] = new Array(ANATOMY.count).fill(0);
  base[FISH.fins] = [];
  base[FISH.forms] = [];
  base[FISH.contour] = [];
  base[FISH.regions] = [];
  base[FISH.body_geometry] = {
    headPlan : [ .8, 1.1, .2, 1, 1 ],
    chestPlan : [ 1.1, 1.6, .3, 1.5, .9 ],
    torsoPlan : [ .9, 1.4, .3, 1.4, 1.5 ],
    facePlan : [ 2, .4, .3, .7, .2 ],
    headBack : .18,
    headLength : .8,
    faceLength : 1.1,
    restShoulder : .65,
    faceWidth : .14,
    chestLength : 1.1,
    baseHindLength : 1.5,
    trunk : .28,
    neckWidth : .85,
    chestPhase : 9,
    center : -.2,
    extent : 2.3
  };
  const fish = Array.from({length : 200}, (_, i) => {
    const row = base.slice();
    row[FISH.id] = i + 1;
    row[FISH.energy] = 250 * ((1 + i % 30) / 32) ** 2;
    return row;
  });
  sceneState.frame = {render_epoch : 'shapes', fish};
  const shapes = fish.map(p => forms.fishSnapshotAnatomy(p.slice())),
        meshes = shapes.map(a => animals.animalMesh(a, 0));
  assert(new Set(shapes).size > 4, 'One shared species has many simultaneous body fillings');
  assert(meshes.every(m => m.data.every(Number.isFinite)), 'Cached geometry remains finite');
  for (let frame = 0; frame < 3; ++frame)
    for (let i = 0; i < fish.length; ++i) {
      const a = forms.fishSnapshotAnatomy(fish[i].slice());
      assert.equal(a, shapes[i], 'Other fish must not evict a visible unchanged body');
      assert.equal(animals.animalMesh(a, 0), meshes[i], 'An unchanged body keeps its GPU mesh');
    }
  const changed = fish[0].slice();
  changed[FISH.energy] = 250;
  const full = forms.fishSnapshotAnatomy(changed);
  assert(full.hindWidth > shapes[0].hindWidth, 'Reserve changes still change the body');
  const changedLayout = fish[0].slice();
  changedLayout[FISH.body_geometry] = {...base[FISH.body_geometry], trunk : .8};
  assert(forms.fishSnapshotAnatomy(changedLayout).hindWidth > shapes[0].hindWidth,
         'A changed anatomical asset must not reuse the old shape');
  sceneState.frame = {render_epoch : 'next', fish};
  assert.notEqual(forms.fishSnapshotAnatomy(fish[0].slice()), shapes[0],
                  'A new run drops the shared shape cache');
}

async function statisticsResetRequestsWholeFrame() {
  const replies = [], queries = [], resources = [], self = {
    location : {href : 'http://localhost/ui/statistics_worker.js'},
    postMessage : data => replies.push(data)
  };
  let step = 0;
  const fetch = async address => {
    const url = new URL(address, self.location.href);
    if (url.pathname.startsWith('/ui/text/')) {
      resources.push(url.pathname);
      return {ok : true, json : async () => JSON.parse(fs.readFileSync(url.pathname.slice(1)))};
    }
    queries.push(url.searchParams);
    const previous = step++;
    const frame = {
      render_epoch : 'run',
      revision : step,
      step,
      fish : [],
      species : [ {id : 1, total : 200} ],
      light : {}
    };
    const data = {
      session : 'run',
      scene_key : 'run:' + step,
      assets_key : 'assets',
      profile_key : 'profile',
      species_key : 'species',
      ...(url.searchParams.get('scene') === 'run:' + previous ? {
        base_scene : 'run:' + previous,
        frame_patches : [ [ 2, {revision : [ 0, step ], step : [ 0, step ]}, [] ] ]
      }
                                                              : {frame}),
      ...(!url.searchParams.has('species')
              ? {species_profiles : {1 : {name : 'Brisa'}}, species_profile_ids : [ 1 ]}
              : {}),
      ...(!url.searchParams.has('profile') ? {individual_profile : {id : 7}} : {})
    };
    return {ok : true, text : async () => JSON.stringify(data), headers : {get : () => '0'}};
  };
  await evaluate("import './statistics_worker.js';", {self, fetch, URL});
  for (const [ticket, reset] of [[ 1, 0 ], [ 2, 1 ], [ 3, 1 ]]) {
    const query = new URLSearchParams({
      wire : '1',
      after : 'version',
      scene : 'run:' + (ticket - 1),
      profile : 'profile',
      species : 'species',
      assets : 'assets',
      brain : 'layout'
    });
    await self.onmessage({data : {ticket, reset, url : '/state?' + query}});
    assert.equal(replies.at(-1).error, undefined, 'Worker resets must recover without a reload');
    assert.equal(replies.at(-1).result.prepared_frame.step, ticket);
    assert.equal(replies.at(-1).result.prepared_frame.individual_profile.id, 7);
  }
  for (const query of queries.slice(0, 2))
    for (const key of ['after', 'scene', 'profile', 'species', 'assets', 'brain'])
      assert(!query.has(key), 'Discarded worker caches must not be advertised: ' + key);
  assert.equal(queries[2].get('scene'), 'run:2', 'Ordinary updates continue using deltas');
  assert.equal(replies[1].result.species_updates[0].name, 'Brisa');
  assert.equal(replies[2].result.species_updates.length, 0);
  assert.equal(resources.length, 4, 'The statistics worker loads only its own text resources');
}
(async () => {
  shadersVersioned();
  bottomFeedingUsesFiniteGeometry();
  const load =
      await evaluate(fs.readdirSync('ui', {recursive : true})
                         .filter(n => n.endsWith('.js') && n !== 'app.js' && !n.includes('_worker'))
                         .map(n => `import './${n}';`)
                         .join('\n'));
  await load('strings.js').namespace.loadTexts();
  sharedFishShapesSurviveDrawing(load);
  await statisticsResetRequestsWholeFrame();
  await evaluate(fs.readFileSync('ui/app.js', 'utf8').match(/^import\b[\s\S]*?;$/gm).join('\n'));
  console.log('UI-Module verknüpft: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
