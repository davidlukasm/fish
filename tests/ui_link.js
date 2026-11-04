// Every interface module links and evaluates: imports name existing exports, module code runs
// without errors, and the wording loads as app.js loads it. The modules are evaluated twice:
// all of them in file order, and in app.js's import order, which is the order of the real start.
// A module that reads a constant of a module in its import cycle before that one has run fails
// in one of the two orders.
const fs = require('fs'), vm = require('vm'), path = require('path');
const {createFixture} = require('./dom_fixture');
async function evaluate(source) {
  const {sandbox} = createFixture({}), context = vm.createContext(sandbox), cache = new Map();
  // Modules are named by their path below ui/; imports resolve relative to the importing module.
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
(async () => {
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
