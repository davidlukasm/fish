"""Cache the pool's anatomical counts for sorting before previews are opened."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import shlex
import subprocess
import sys
from pathlib import Path
from protocol_schema import Fish, Anatomy

ROOT = Path(__file__).resolve().parent
POOL = ROOT / 'genomes/pool'

def digest():
    return hashlib.sha256((POOL / 'index.pool').read_bytes()).hexdigest()

def read():
    try:
        data = json.loads((POOL / 'anatomy.json').read_text())
        return data['entries'] if data['pool_sha256'] == digest() else {}
    except (OSError, ValueError, KeyError):
        return {}

def build(binary):
    existing = read()
    names = [shlex.split(line)[2] for line in (POOL / 'index.pool').read_text().splitlines()[1:]]
    def develop(name):
        content = (POOL / name).read_bytes()
        signature = hashlib.sha256(content).hexdigest()
        if existing.get(name, {}).get('sha256') == signature:
            return name, existing[name]
        row = json.loads(subprocess.check_output([str(binary), '--preview-genome', str(POOL / name)], text=True))
        organs = row[Fish.ORGANS]
        return name, {'sha256': signature, 'anatomy': {
            key: organs[index] for key, index in
            (('jaw', Anatomy.JAW_LENGTH), ('gut', Anatomy.GUT_LENGTH),
             ('teeth', Anatomy.BLUNT_TEETH), ('undulation', Anatomy.UNDULATION))}, 'sense_cells': {
            key: sum(organs[i] for i in pair) for key, pair in
            (('eye', (Anatomy.EYE_LEFT, Anatomy.EYE_RIGHT)),
             ('nose', (Anatomy.SMELL_LEFT, Anatomy.SMELL_RIGHT)),
             ('lateral', (Anatomy.LATERAL_LEFT, Anatomy.LATERAL_RIGHT)))}}
    with ThreadPoolExecutor(max_workers=4) as workers:
        entries = dict(workers.map(develop, names))
    output = POOL / 'anatomy.json'
    temporary = output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps({'pool_sha256': digest(), 'entries': entries}, separators=(',', ':')) + '\n')
    temporary.replace(output)

if __name__ == '__main__':
    build(Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'bin/fish').resolve())
