import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileDocument} from '../ui/studio/model/document.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tool = resolve(root, process.env.BUILD_DIR ?? 'bin', 'atelier');
const {sites} = JSON.parse(execFileSync(tool, [ 'sites' ], {cwd : root, encoding : 'utf8'}));
const folder = resolve(root, 'genomes/handbau');
for (const name of readdirSync(folder).filter(name => name.endsWith('.fish.json')).sort()) {
  const document = JSON.parse(readFileSync(resolve(folder, name)));
  const plan = compileDocument(document, sites);
  const destination = resolve(folder, name.replace(/\.fish\.json$/, '.genome'));
  const result =
      execFileSync('python3',
                   [
                     '-B', '-c', `
import json,sys
from pathlib import Path
from atelier_service import run
from file_io import atomic_write
r=run({"operation":"build","plan":json.load(sys.stdin)})
if not r["compiler"]["ok"] or not r["viable"]:
    raise ValueError(json.dumps(r["compiler"]))
atomic_write(Path(sys.argv[1]), r["genome"])
print(json.dumps({key:r[key] for key in ("neurons","synapses","compiler")}))
`,
                     destination
                   ],
                   {cwd : root, input : JSON.stringify(plan), encoding : 'utf8', timeout : 60000});
  console.log(name + ': ' + result.trim());
}
