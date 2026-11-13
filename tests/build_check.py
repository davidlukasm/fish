import ast
import json
import math
import tempfile
import os
import re
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import threading
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]


def ensure_node():
    if shutil.which('node'):
        return
    # Only node comes from Nix. A Nix shell would also replace the compiler and its flags,
    # so the suite would rebuild everything differently from ./build.sh.
    nix = shutil.which('nix-build')
    if nix:
        print('Node.js wird über Nix für die automatisierten UI-Prüfungen bereitgestellt.',
              flush=True)
        built = subprocess.run([nix, '<nixpkgs>', '-A', 'nodejs', '--no-out-link'],
                               stdout=subprocess.PIPE, text=True)
        node = Path(built.stdout.strip()) / 'bin'
        if built.returncode == 0 and (node / 'node').is_file():
            os.environ['PATH'] = str(node) + os.pathsep + os.environ.get('PATH', '')
            return
    raise SystemExit('Node.js fehlt (Befehl „node“). Node.js für die automatisierten '
                     'UI-Prüfungen installieren und den Aufruf wiederholen.')


def check_compiler_build():
    with tempfile.TemporaryDirectory() as folder:
        reference = None
        for native, lto in ((0, 0), (1, 1)):
            plan = subprocess.check_output(
                ['make', '--no-print-directory', '-B', '-n', f'BUILD_DIR={folder}',
                 f'NATIVE={native}', f'LTO={lto}', 'SANITIZE=0', str(Path(folder) / 'atelier'),
                 str(Path(folder) / 'compiler-tests')], cwd=ROOT, text=True)
            commands = [shlex.split(line) for line in plan.splitlines() if ' -o ' in line]
            assert commands and any('colony-core/field/development.cc' in c for c in commands)
            assert any('colony-core/cppn/program.cc' in c for c in commands)
            for command in commands:
                assert '-fno-fast-math' in command and '-ffp-contract=off' in command
                assert not any(a.startswith(('-march=', '-mtune=', '-mcpu=', '-flto')) or
                               a == '-ffat-lto-objects' for a in command), command
                objects = [a for a in command if a.endswith('.o')]
                assert objects and all('/atelier-obj/' in a for a in objects), command
            if reference is not None:
                assert commands == reference, 'Aquarium flags must not alter the compiler build'
            reference = commands


def check_labor_lives():
    from labor_recording import LifeArchive, read_life
    from labor_service import NativeWorld
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / 'trial'
        archive = LifeArchive(path)
        def event(kind, step, **fields):
            archive.read(dict(event='life', id=7, kind=kind, t=step, **fields))
        def point(step, regular, near):
            event('point', step, regular=regular, near=near, energy=20, gut=.2, maturity=.3)
        event('start', 0, parent=3, generation=2, age=0)
        event('hatch', 4, leaf=12)
        point(4, False, True)
        point(5, True, False)
        for step in (6, 7, 8, 9):
            point(step, False, True)
            event('close', step, empty=False)
        point(10, True, True)
        event('intake', 10, first=True, diet=[0, 12])
        event('full', 10)
        event('emptying', 22)
        event('close', 23, empty=True)
        event('death', 30, cause=1)
        life = archive.lives['7']
        assert (life['regularSamples'], life['nearSamples']) == (2, 1), 'Event probes cannot weight proximity'
        assert (life['closings'], life['emptyClosings'], life['intake']) == (5, 1, 12), 'Closure is not food'
        assert life['phases'] == {'feeding': 10, 'full': 10, 'emptying': 22}
        assert life['longestNoFood'] == {'from': 10, 'to': 30}
        world = NativeWorld.__new__(NativeWorld)
        world.folder, world.lock, world.archives = Path(folder), threading.Lock(), {'trial': archive}
        def unlocked_read(folder, identity, length):
            assert world.lock.acquire(blocking=False), 'Decoding must allow live snapshots'
            world.lock.release()
            point(110, True, False)
            return read_life(folder, identity, length)
        with patch('labor_service.read_life', side_effect=unlocked_read):
            detail = world.life('trial', 7)
        assert [p['t'] for p in detail['points']] == [4, 5, 6, 7, 8, 9, 10], (
            'Concurrent appends stay outside the captured byte boundary')
        (path / 'unrelated.json').write_text('{}')
        LifeArchive(path)
        assert read_life(path, 7) == {'points': [], 'events': []}
        assert (path / 'unrelated.json').exists()


def check_labor_selection():
    from types import SimpleNamespace
    from labor_recording import LifeArchive
    from labor_service import rank_candidates, choose_parents
    candidates = [dict(id=str(i), family='same', viable=True, path='unused') for i in range(3)]
    archive = LifeArchive()
    for identifier, generation, fed in [(1, 0, True), (2, 1, False), (3, 1, True)]:
        archive.read(dict(event='life', kind='start', id=identifier, t=0,
                          generation=generation, parent=0))
        archive.read(dict(event='life', kind='hatch', id=identifier, t=0, leaf=0))
        if fed:
            archive.read(dict(event='life', kind='intake', id=identifier, t=0, diet=[1]))
    world = SimpleNamespace(candidates=['0', '1', '2'], lock=threading.Lock(),
                            archives={'trial': archive}, lines={'trial': {'1': 0, '2': 1, '3': 2}},
                            finished=lambda: True)
    rows = rank_candidates(candidates, [world])
    assert rows[0]['id'] == '2' and rows[0]['score'] == 1
    assert rows[1]['score'] == rows[2]['score'] == 0, 'Hatching or founder meals do not count'
    assert not rows[0]['tested'], 'A single world is not a completed breeding comparison'
    assert rank_candidates(candidates, [world, world])[0]['tested']
    assert len(choose_parents(rows, count=3)) == 2, 'One family cannot occupy every parent slot'


def main():
    ensure_node()
    check_compiler_build()
    sys.path.insert(0, str(ROOT))
    check_labor_lives()
    check_labor_selection()
    for path in [*ROOT.glob('*.py'), *ROOT.glob('tests/*.py')]:
        ast.parse(path.read_text(), filename=str(path))
    subprocess.run([sys.executable, '-B', 'schema.py'], cwd=ROOT, check=True)
    css = dict(re.findall(r'--([a-z]+):(#[0-9a-f]{6})', (ROOT / 'ui/style.css').read_text()))
    palette = dict(re.findall(r"(\w+) : '(#[0-9a-f]{6})'", (ROOT / 'ui/palette.js').read_text()))
    assert palette and all(css.get(name) == value for name, value in palette.items()), (
        'ui/palette.js und ui/style.css nennen verschiedene Farben', palette, css)
    subprocess.run(['node', '--experimental-vm-modules', 'tests/ui_link.js'],
                   cwd=ROOT, check=True)
    # The page imports a genome as a command; one at the size limit must reach the server.
    from protocol_schema import GenomeImport, Route
    from viewer_http import request_limit
    line = '0.123456789 ' * 7 + '\n'
    genome = 'FISH_CPPN\n' + line * (GenomeImport.MAX_BYTES // len(line))
    body = json.dumps({'command': 'population-import', 'name': 'x.genome', 'genome': genome})
    assert len(body.encode()) <= request_limit(Route.COMMAND), (
        'Ein Genom an der Importgrenze passt nicht durch die Befehlsanfrage')
    from suite import binary
    habitat = 'aquarium'
    with tempfile.TemporaryDirectory() as folder:
        observed = str(Path(folder) / 'fish')
        checkpoint = Path(folder) / 'world.state'
        foraging = Path(folder) / 'foraging.jsonl'
        genomes = ','.join(['genomes/entwuerfe/liora.genome'] * 2)
        command = [binary('zuchtbecken'), genomes,
                   '184371', '6', '3', habitat, 'observe=' + observed,
                   'checkpoint=' + str(checkpoint)]
        first = subprocess.check_output(command, cwd=ROOT, text=True, timeout=10)
        state = checkpoint.read_bytes()
        trace = Path(observed + '-trace.jsonl').read_text()
        second = subprocess.check_output(command + ['foraging=' + str(foraging)],
                                         cwd=ROOT, text=True, timeout=10)
        assert first == second and trace == Path(observed + '-trace.jsonl').read_text()
        assert state == checkpoint.read_bytes(), 'Foraging observation must leave the world unchanged'
        setup, *events = map(json.loads, first.splitlines())
        assert setup['seeded'] == 3 and not setup['assistance'] and setup['mutation'] > 0
        assert [e['t'] for e in events if e.get('event') == 'sample'][-1] == 6
        header, *samples = map(json.loads, trace.splitlines())
        assert {'rawPlants', 'usableFood', 'line'} <= set(header['columns'])
        assert samples and all(len(fish) == len(header['columns'])
                               for sample in samples for fish in sample['fish'])
        line = header['columns'].index('line')
        assert [fish[line] for fish in samples[0]['fish']] == [0, 1, 0], (
            'Input lines must stay distinct even when their genomes share a species')
        header, *samples = map(json.loads, foraging.read_text().splitlines())
        assert [sample['t'] for sample in samples] == [0, 6]
        measured = {event['t']: event for event in events if event.get('event') == 'sample'}
        for sample in samples:
            assert math.isclose(measured[sample['t']]['availableFeed'],
                                sum(piece[4] for piece in sample['food']), rel_tol=1e-5)
            swimmers = sum(n for _, n in measured[sample['t']]['swimmers'])
            assert bool(measured[sample['t']]['swimmerReserve']) == bool(swimmers)
            for key in ('cloud', 'food', 'fish'):
                rows = sample['clouds' if key == 'cloud' else key]
                assert all(len(row) == len(header[key + 'Columns']) for row in rows)
            for cloud, row in enumerate(sample['clouds']):
                pieces = [piece for piece in sample['food'] if piece[1] == cloud]
                assert row[3] == len(pieces)
                assert math.isclose(row[2], sum(piece[4] for piece in pieces), rel_tol=1e-5)
            if not sample['food']:
                column = header['fishColumns'].index('nearestFeed')
                assert all(fish[column] is None for fish in sample['fish'])
    print('Python, Schema und UI-Module: OK')


if __name__ == '__main__':
    main()
