import ast
import json
import tempfile
import os
import re
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]


def ensure_node():
    if shutil.which('node'):
        return
    nix = shutil.which('nix-shell')
    if nix:
        print('Node.js wird über Nix für die automatisierten UI-Prüfungen bereitgestellt.',
              flush=True)
        # Check the new PATH before restarting, so failed setup cannot recurse.
        command = 'command -v node >/dev/null && ' + shlex.join(
            [sys.executable, '-B', *sys.argv])
        os.execv(nix, [nix, '-p', 'nodejs', '--run', command])
    raise SystemExit('Node.js fehlt (Befehl „node“). Node.js für die automatisierten '
                     'UI-Prüfungen installieren und den Aufruf wiederholen.')


def main():
    ensure_node()
    sys.path.insert(0, str(ROOT))
    for path in [*ROOT.glob('*.py'), *ROOT.glob('tests/*.py')]:
        ast.parse(path.read_text(), filename=str(path))
    subprocess.run([sys.executable, '-B', 'schema.py'], cwd=ROOT, check=True)
    css = dict(re.findall(r'--([a-z]+):(#[0-9a-f]{6})', (ROOT / 'ui/style.css').read_text()))
    palette = dict(re.findall(r"(\w+) : '(#[0-9a-f]{6})'", (ROOT / 'ui/palette.js').read_text()))
    assert palette and all(css.get(name) == value for name, value in palette.items()), (
        'ui/palette.js und ui/style.css nennen verschiedene Farben', palette, css)
    subprocess.run(['node', '--experimental-vm-modules', 'tests/ui_link.js'],
                   cwd=ROOT, check=True)
    from suite import binary
    for habitat in ('aquarium', 'becken'):
        with tempfile.TemporaryDirectory() as folder:
            observed = str(Path(folder) / 'fish')
            genomes = ','.join(['genomes/handbau/startfisch.genome'] * 2)
            command = [binary('zuchtbecken'), genomes,
                       '184371', '6', '3', habitat, 'observe=' + observed]
            first = subprocess.check_output(command, cwd=ROOT, text=True, timeout=10)
            trace = Path(observed + '-trace.jsonl').read_text()
            second = subprocess.check_output(command, cwd=ROOT, text=True, timeout=10)
            assert first == second and trace == Path(observed + '-trace.jsonl').read_text()
            setup, *events = map(json.loads, first.splitlines())
            assert setup['seeded'] == 3 and not setup['assistance'] and setup['mutation'] > 0
            header, *samples = map(json.loads, trace.splitlines())
            assert {'rawPlants', 'usableFood', 'line'} <= set(header['columns'])
            assert samples and all(len(fish) == len(header['columns'])
                                   for sample in samples for fish in sample['fish'])
            line = header['columns'].index('line')
            assert [fish[line] for fish in samples[0]['fish']] == [0, 1, 0], (
                'Input lines must stay distinct even when their genomes share a species')
    print('Python, Schema und UI-Module: OK')


if __name__ == '__main__':
    main()
