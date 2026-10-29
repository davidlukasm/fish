// Small source adapter for the isolated Canvas/WebGL unit harnesses.
const fs = require('fs'), vm = require('vm');
const manifest = JSON.parse(fs.readFileSync('tests/ui_modules.json', 'utf8'));
function classic(source) {
  source = source.replace(/^import\s+\{[^}]*\}\s+from\s+'[^']+';\s*$/gm, '')
               .replace(/\bexport\s+(?=const|let|class|function|async function)/g, '');
  for (const [name, owner] of Object.entries(manifest.mutable))
    source =
        source.replace(new RegExp('\\b' + owner.state + '\\s*\\.\\s*' + name + '\\b', 'g'), name);
  return source.replace(
      /function (update\w+State)\(patch\) \{[\s\S]*?\n\}/g,
      (_, name) =>
          'function ' + name +
          '(patch) { for (const key of Object.keys(patch)) globalThis[key] = patch[key]; return Object.values(patch)[0]; }');
}
function readUI(logical) {
  const name = logical.replace(/^ui\//, '').replace(/\.js$/, ''),
        records = manifest.logical[name] ||
                  Object.values(manifest.logical).flat().filter(r => r.group === name);
  if (name === 'schema')
    return classic(fs.readFileSync('ui/schema.js', 'utf8'))
        .replace(/function initialize\(indices\) \{\}/, '');
  if (!records.length)
    return classic(fs.readFileSync('ui/' + name + '.js', 'utf8'));
  const groups = [...new Set(records.map(r => r.group)) ], prefix = [], fragments = [], bodies = {};
  for (const group of groups) {
    let source = classic(fs.readFileSync('ui/' + group + '.js', 'utf8'));
    const state = manifest.groups[group].state;
    prefix.push('var ' + state + ' = globalThis.' + state + ' || {};');
    const mutable =
        Object.entries(manifest.mutable).filter(([, v ]) => v.module === group).map(([ k ]) => k);
    if (mutable.length)
      prefix.push('var ' + mutable.join(',') + ';');
    source = source.replace(new RegExp('const ' + state + ' = \\{\\};'), '');
    const at = source.indexOf('const initializers'),
          end = source.indexOf('function initialize(', at);
    const steps = vm.runInNewContext(source.slice(at, end) + '\ninitializers');
    bodies[group] = Object.fromEntries(Object.entries(steps).map(
        ([ name, fn ]) => [name, fn.toString().replace(/^\(\) => \{/, '').replace(/\}$/, '')]));
    source = source.slice(0, at);
    fragments.push(source);
  }
  if (groups.includes('report'))
    fragments.unshift(classic(fs.readFileSync('ui/diagnostics.js', 'utf8')));
  if (groups.includes('world'))
    fragments.unshift(classic(fs.readFileSync('ui/rock_geometry.js', 'utf8')));
  if (groups.includes('connection')) {
    prefix.push('var connectionState = {};');
    fragments.unshift(...['render_schema', 'binary_scene', 'scene_frame'].map(
        n => classic(fs.readFileSync('ui/' + n + '.js', 'utf8'))));
  }
  const initialization = records.filter(r => r.initializer !== undefined)
                             .map(r => bodies[r.group][r.initializer])
                             .join('\n');
  const schema = classic(fs.readFileSync('ui/schema.js', 'utf8'))
                     .replace(/\bconst\b/g, 'var')
                     .replace(/function initialize\(indices\) \{\}/, '');
  const session = classic(fs.readFileSync('ui/session.js', 'utf8'));
  const request = session.slice(session.indexOf('async function request('),
                                session.indexOf('async function command('));
  const observations = session.slice(session.indexOf('function setObservation('),
                                     session.indexOf('async function request('));
  const updates =
      Object.values(manifest.groups)
          .flatMap(g => g.exports)
          .filter(name => /^update\w+State$/.test(name))
          .map(
              name =>
                  'function ' + name +
                  '(patch) { for (const key of Object.keys(patch)) globalThis[key] = patch[key]; return Object.values(patch)[0]; }')
          .join('\n');
  return 'var sessionState = globalThis.sessionState || {};\n' + observations + '\n' + updates +
         '\n' + request + '\n' + schema + '\n' + prefix.join('\n') + '\n' + fragments.join('\n') +
         '\n// Initializers\n' + initialization;
}
function functionSource(logical, name) {
  const source = readUI(logical), start = source.indexOf('function ' + name + '(');
  if (start < 0)
    throw Error('Missing function ' + name);
  const rest = source.slice(start),
        next = rest.slice(10).search(
            /\n(?:async )?(?:function |class |let |var |const |\/\/ Initializers)/);
  return next < 0 ? rest : rest.slice(0, next + 10);
}
module.exports = {
  readUI,
  manifest,
  functionSource
};
