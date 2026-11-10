import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {allCenters, compileDocument} from '../ui/studio/model/document.js';
import {PRESSURE_OF} from '../ui/studio/model/organs.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tool = resolve(root, process.env.BUILD_DIR ?? 'bin', 'atelier');
const {sites} = JSON.parse(execFileSync(tool, [ 'sites' ], {cwd : root, encoding : 'utf8'}));
const folder = resolve(root, 'genomes/handbau');
for (const name of readdirSync(folder).filter(name => name.endsWith('.fish.json')).sort()) {
  const document = JSON.parse(readFileSync(resolve(folder, name)));
  const plan = compileDocument(document, sites);
  const pressure = allCenters(document).map(c => {
    const own = PRESSURE_OF[c.organType];
    return own?.key === c.key ? own.source : null;
  });
  const destination = resolve(folder, name.replace(/\.fish\.json$/, '.genome'));
  const result = execFileSync(
      'python3',
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
atomic_write(Path(sys.argv[1]), r["genome"])
print(json.dumps({key:r[key] for key in ("neurons","synapses","compiler")}))
`,
        destination
      ],
      {cwd : root, input : JSON.stringify({plan, pressure}), encoding : 'utf8', timeout : 60000});
  console.log(name + ': ' + result.trim());
}
