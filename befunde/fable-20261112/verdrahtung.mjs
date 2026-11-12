// Inspektion (Fable): Seiten der Verbindungen Auge → Tectum → Wahl/Bewertung → Motorik im Bauplan.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root = process.argv[2], file = process.argv[3];
const {routedLinks, settleRegions} = await import(resolve(root, 'ui/studio/model/regions.js'));
const {findSite} = await import(resolve(root, 'ui/studio/model/layout.js'));
const {sites} = JSON.parse(execFileSync(resolve(process.env.BUILD_DIR, 'atelier'), [ 'sites' ], {cwd : root, encoding : 'utf8'}));
const doc = settleRegions(JSON.parse(readFileSync(file, 'utf8')), sites);
const owner = new Map(), centerOf = new Map();
for (const o of doc.organs) {
  owner.set(o.id, o);
  for (const c of o.centers) { owner.set(c.id, o); centerOf.set(c.id, c); }
}
const side = id => {
  const o = owner.get(id), c = centerOf.get(id);
  const s = c ? (sites.find(x => x.id === c.site)?.side ?? 0) : o.side;
  return s < 0 ? 'L' : s > 0 ? 'R' : 'M';
};
const name = id => { const o = owner.get(id), c = centerOf.get(id); return o.type + (c ? ':' + (c.node ?? c.key) : ''); };
const count = new Map();
for (const l of routedLinks(doc, sites)) {
  const a = owner.get(l.from), b = owner.get(l.to);
  if (!a || !b) continue;
  const want = [ 'eye', 'tectum', 'choice', 'value', 'motor', 'olfaction' ];
  if (!want.includes(a.type) || !want.includes(b.type) || a === b) continue;
  const cf = centerOf.get(l.from);
  const group = a.type === 'eye' ? 'eye' : name(l.from);
  const key = group + ' ' + side(l.from) + ' → ' + name(l.to) + ' ' + side(l.to);
  count.set(key, (count.get(key) ?? 0) + 1);
}
for (const [k, n] of [...count ].sort()) console.log(String(n).padStart(4), k);
