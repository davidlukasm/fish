const fs = require('fs'), vm = require('vm'), path = require('path');
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
(async () => {
  shadersVersioned();
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
