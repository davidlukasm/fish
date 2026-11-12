// Versuch (Fable): gleicht die Regionszellen der Baupläne an den aktuellen Regionsplan an
// (settleRegions), wie es das Atelier beim Öffnen tut, und meldet, was sich ändert.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root = process.cwd();
const {settleRegions} = await import(resolve(root, 'ui/studio/model/regions.js'));
const {sites} = JSON.parse(execFileSync(resolve(process.env.BUILD_DIR, 'atelier'), [ 'sites' ], {cwd : root, encoding : 'utf8'}));
const folder = resolve(root, 'genomes/handbau');
for (const name of readdirSync(folder).filter(n => n.endsWith('.fish.json')).sort()) {
  const before = JSON.parse(readFileSync(resolve(folder, name)));
  const after = settleRegions(before, sites);
  const old = new Map(before.organs.flatMap(o => o.centers.map(c => [c.id, c])));
  let changed = 0;
  const notes = new Map();
  for (const o of after.organs)
    for (const c of o.centers) {
      const b = old.get(c.id);
      if (!b) { changed++; notes.set(o.type + '.' + c.node + ' neu', 1); continue; }
      const diff = [];
      for (const k of [ 'pace', 'threshold', 'tau', 'copies', 'q1', 'q2', 'key', 'electrical_limit' ])
        if (b[k] !== c[k]) diff.push(`${k} ${b[k]}→${c[k]}`);
      if (JSON.stringify(b.receptors) !== JSON.stringify(c.receptors)) diff.push('Rezeptoren');
      if (diff.length) { changed++; notes.set(o.type + '.' + c.node + ': ' + diff.join(', '), 1); }
    }
  console.log(name, 'geänderte Zellgruppen:', changed, 'Drähte', before.wires.length, '→', after.wires.length);
  for (const n of notes.keys()) console.log('   ', n);
  if (after !== before) writeFileSync(resolve(folder, name), JSON.stringify(after));
}
