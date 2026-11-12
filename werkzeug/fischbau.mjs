import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {allCenters, compileDocument, validateDocument} from '../ui/studio/model/document.js';
import {PRESSURE_OF} from '../ui/studio/model/organs.js';
import {settleRegions} from '../ui/studio/model/regions.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tool = resolve(root, process.env.BUILD_DIR ?? 'bin', 'atelier');
const {sites, gonads} =
    JSON.parse(execFileSync(tool, [ 'sites' ], {cwd : root, encoding : 'utf8'}));
// Every blueprint the game offers is built: the finished fish of the shelf and the drafts.
const folders = [ 'genomes/regal', 'genomes/entwuerfe' ].map(name => resolve(root, name));
const blueprints = folders.filter(folder => existsSync(folder))
                       .flatMap(folder => readdirSync(folder)
                                              .filter(name => name.endsWith('.fish.json'))
                                              .sort()
                                              .map(name => ({folder, name})));
let failed = 0;
for (const {folder, name} of blueprints)
  try {
    // The atelier settles a blueprint's regions to the current region plan whenever it opens one;
    // the shipped fish is built from that settled blueprint, which is written back.
    const path = resolve(folder, name), text = readFileSync(path, 'utf8'),
          original = JSON.parse(text);
    const document = validateDocument(settleRegions(original, sites));
    // settleRegions hands back the same document when it is settled already; a changed one keeps
    // the file's indent.
    if (document !== original)
      writeFileSync(path, JSON.stringify(document, null, /\n( +)"/.exec(text)[1].length) + '\n');
    const plan = compileDocument(document, sites);
    const chambers = document.organs.filter(o => o.type === 'eggs')
                         .flatMap(o => o.centers)
                         .filter(c => c.role === 'motor')
                         .length;
    const eggStore =
        Math.min(gonads.eggs.most, chambers * gonads.eggs.perCell) * gonads.eggs.spawnShare;
    const pressure = allCenters(document).map(c => {
      const own = PRESSURE_OF[c.organType];
      return own?.key === c.key ? own.source : null;
    });
    const destination = resolve(folder, name.replace(/\.fish\.json$/, '.genome'));
    const result = execFileSync('python3',
                                [
                                  '-B', '-c', `
import json,sys
from pathlib import Path
from atelier_service import run
from file_io import atomic_write
request=json.load(sys.stdin)
for operation in ("design", "build"):
    r=run({"operation":operation,"plan":request["plan"]})
    wrong=[i for i,source in enumerate(request["pressure"])
           if source is not None and r["pressure"][i] != source]
    if wrong:
        raise ValueError("Drucksensor liest ein fremdes Organ: " + str(wrong))
if not r["compiler"]["ok"] or not r["viable"]:
    raise ValueError(json.dumps(r["compiler"]))
egg = request["eggStore"] * r["adultScale"]
if egg < r["eggMinimum"]:
    raise ValueError(f"Ei zu klein: {egg:.2f} Energie, Entwicklung braucht {r['eggMinimum']:.2f}")
atomic_write(Path(sys.argv[1]), r["genome"])
print(json.dumps({key:r[key] for key in ("neurons","synapses","compiler")}))
`,
                                  destination
                                ],
                                {
                                  cwd : root,
                                  input : JSON.stringify({plan, pressure, eggStore}),
                                  encoding : 'utf8',
                                  timeout : 60000
                                });
    console.log(name + ': ' + result.trim());
  } catch (error) {
    ++failed;
    console.error(name + ': ' + String(error.stderr || error.message).trim().split('\n').pop());
  }
process.exitCode = failed ? 1 : 0;
