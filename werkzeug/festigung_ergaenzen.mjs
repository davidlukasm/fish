// Gives Atelier drafts, documents and module lists the receptor of the ninth effect,
// consolidation: every cell gets it inactive, so the fish develops and behaves as before.
// node werkzeug/festigung_ergaenzen.mjs run/atelier/fish-draft.json run/atelier/fish-modules.json
import {readFileSync, writeFileSync} from 'node:fs';
import {ATELIER_LIMITS} from '../ui/schema.js';
import {NEW_DOCUMENT, neutralReceptor, validateDocument} from '../ui/studio/model/document.js';

const FORMER_FORMAT = 'v019-fish-atelier-720';
function addReceptors(organs) {
  for (const organ of organs)
    for (const center of organ.centers)
      while (center.receptors.length < ATELIER_LIMITS.receptors)
        center.receptors.push(neutralReceptor(center.receptors.length));
}
for (const path of process.argv.slice(2)) {
  const text = readFileSync(path, 'utf8'), indent = text.match(/\n( +)"/)?.[1].length ?? 2;
  const value = JSON.parse(text);
  if (Array.isArray(value))
    value.forEach(module => addReceptors(module.organs));
  else {
    if (value.format !== FORMER_FORMAT)
      throw new Error(path + ': kein Bauplan mit acht Rezeptoren');
    addReceptors(value.organs);
    value.format = NEW_DOCUMENT;
    validateDocument(value);
  }
  writeFileSync(path, JSON.stringify(value, null, indent) + '\n');
  console.log(path, 'ergänzt');
}
