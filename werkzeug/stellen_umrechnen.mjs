// Moves Atelier drafts, documents and module lists from the former lattice of 360 development
// sites to the current one: every cell keeps its zone, side, height and depth and takes the
// nearest place along the body; a document's sensory fields are then laid out again.
// node werkzeug/stellen_umrechnen.mjs run/atelier/fish-draft.json run/atelier/fish-modules.json
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NEW_DOCUMENT, regenerateFields, validateDocument} from '../ui/studio/model/document.js';
import {settleRegions} from '../ui/studio/model/regions.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tool = resolve(root, process.env.BUILD_DIR ?? 'bin', 'atelier');
const {sites} = JSON.parse(execFileSync(tool, [ 'sites' ], {cwd : root, encoding : 'utf8'}));
const FORMER_FORMAT = 'v019-fish-atelier', SAME = 1e-6;
const FORMER_LATTICE = [ [ 4, 3, 2 ], [ 4, 4, 3 ], [ 4, 4, 3 ], [ 5, 4, 3 ] ];
function formerSite(index) {
  for (const [zone, n] of FORMER_LATTICE.entries()) {
    const count = 2 * n[0] * n[1] * n[2];
    if (index >= count) {
      index -= count;
      continue;
    }
    const side = index % 2 ? 1 : -1;
    index = Math.floor(index / 2);
    const w = (index % n[2]) / (n[2] - 1);
    index = Math.floor(index / n[2]);
    const v = (index % n[1]) / (n[1] - 1);
    index = Math.floor(index / n[1]);
    return {zone, u : index / (n[0] - 1), v, w, side};
  }
  throw new Error('Stelle außerhalb des alten Gitters: ' + index);
}
function nearest(former) {
  const same = sites.filter(s => s.zone === former.zone && s.side === former.side &&
                                 Math.abs(s.v - former.v) < SAME && Math.abs(s.w - former.w) < SAME);
  if (!same.length)
    throw new Error('keine passende Stelle für ' + JSON.stringify(former));
  return same.reduce((best, s) => Math.abs(s.u - former.u) < Math.abs(best.u - former.u) ? s : best)
      .id;
}
function moveOrgans(organs) {
  for (const organ of organs) {
    if (organ.region && Number.isInteger(organ.region.site))
      organ.region.site = nearest(formerSite(organ.region.site));
    for (const center of organ.centers)
      center.site = nearest(formerSite(center.site));
  }
}
for (const path of process.argv.slice(2)) {
  let value = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(value))
    value.forEach(module => moveOrgans(module.organs));
  else {
    if (value.format !== FORMER_FORMAT)
      throw new Error(path + ': kein Bauplan des alten Gitters');
    moveOrgans(value.organs);
    value.format = NEW_DOCUMENT;
    if (!regenerateFields(value, sites))
      throw new Error(path + ': Sinnesfelder passen nicht mehr');
    value = settleRegions(value, sites);
    validateDocument(value);
  }
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  console.log(path, 'umgerechnet');
}
