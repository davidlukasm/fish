const fs = require('fs'), vm = require('vm'), path = require('path');
const assert = require('node:assert/strict');
const {createFixture} = require('./dom_fixture');
async function evaluate(source) {
  const {sandbox} = createFixture({}), context = vm.createContext(sandbox), cache = new Map();
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
(async () => {
  shadersVersioned();
  bottomFeedingUsesFiniteGeometry();
  const load =
      await evaluate(fs.readdirSync('ui', {recursive : true})
                         .filter(n => n.endsWith('.js') && n !== 'app.js' && !n.includes('_worker'))
                         .map(n => `import './${n}';`)
                         .join('\n'));
  await load('strings.js').namespace.loadTexts();
  await evaluate(fs.readFileSync('ui/app.js', 'utf8').match(/^import\b[\s\S]*?;$/gm).join('\n'));
  console.log('UI-Module verknüpft: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
