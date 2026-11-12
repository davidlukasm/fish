// Inspektion (Fable): entwickelte Kontakte je Zellgruppe (Anzahl, mittlere Stärke) entlang der
// Sehbahn, aus dem Bauplan gebaut wie im Atelier.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root = process.argv[2], file = process.argv[3];
const {settleRegions} = await import(resolve(root, 'ui/studio/model/regions.js'));
const {allCenters, compileDocument, validateDocument} = await import(resolve(root, 'ui/studio/model/document.js'));
const tool = resolve(process.env.BUILD_DIR, 'atelier');
const {sites} = JSON.parse(execFileSync(tool, [ 'sites' ], {cwd : root, encoding : 'utf8'}));
const doc = validateDocument(settleRegions(JSON.parse(readFileSync(file, 'utf8')), sites));
const plan = compileDocument(doc, sites);
const r = JSON.parse(execFileSync('python3', [ '-B', '-c', `
import json,sys
from atelier_service import run
r=run({"operation":"build","plan":json.load(sys.stdin)})
print(json.dumps({"contacts":r["contacts"],"neurons":r["neurons"],"synapses":r["synapses"]}))
` ], {cwd : root, input : JSON.stringify(plan), encoding : 'utf8', maxBuffer : 1 << 28, env : {...process.env}}));
const centers = allCenters(doc);
const owner = new Map();
for (const o of doc.organs) for (const c of o.centers) owner.set(c.id, o);
const label = c => {
  const o = owner.get(c.id), s = sites.find(x => x.id === c.site)?.side ?? 0;
  return o.type + (o.type === 'eye' ? '' : ':' + (c.node ?? c.key)) + ' ' + (s < 0 ? 'L' : s > 0 ? 'R' : 'M');
};
const sum = new Map();
for (const [ from, to, count, weight ] of r.contacts) {
  const a = centers[from], b = centers[to];
  if (!a || !b) continue;
  const ta = owner.get(a.id).type, tb = owner.get(b.id).type;
  const want = [ 'eye', 'tectum', 'choice', 'value', 'olfaction', 'nose' ];
  if (!want.includes(ta) || !want.includes(tb) || (ta === tb && ta !== 'tectum')) continue;
  if (ta === 'tectum' && tb === 'tectum') continue;
  const key = label(a) + ' → ' + label(b), s = sum.get(key) ?? {count : 0, weight : 0};
  s.count += count; s.weight += weight * count;
  sum.set(key, s);
}
console.log('Zellen', r.neurons, 'Kontakte', r.synapses);
for (const [ k, s ] of [...sum ].sort()) console.log(String(s.count).padStart(6), (s.weight / s.count).toFixed(3).padStart(8), k);
