// Every interface module links and evaluates: imports name existing exports, module code runs
// without errors, and the wording loads as app.js loads it.
const fs = require('fs'), vm = require('vm'), path = require('path');
const {createFixture} = require('./dom_fixture');
(async () => {
  const {sandbox} = createFixture({}), context = vm.createContext(sandbox), cache = new Map();
  function load(name) {
    name = path.basename(name);
    if (!cache.has(name))
      cache.set(name, new vm.SourceTextModule(fs.readFileSync('ui/' + name, 'utf8'),
                                              {context, identifier : name}));
    return cache.get(name);
  }
  const entry = new vm.SourceTextModule(
      fs.readdirSync('ui')
          .filter(n => n.endsWith('.js') && n !== 'app.js' && !n.includes('_worker'))
          .map(n => `import './${n}';`)
          .join('\n'),
      {context});
  await entry.link(load);
  await entry.evaluate();
  await load('strings.js').namespace.loadTexts();
  console.log('UI-Module verknüpft: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
