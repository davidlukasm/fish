import ast
import hashlib
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
        for native, lto in ((0, 0), (0, 1), (1, 0), (1, 1)):
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


def check_labor_engine():
    from labor_service import BreedingJobs, fingerprint
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        tool = root / 'zuchtbecken'
        program = ('#!' + sys.executable + '\nimport json\n'
                   'print(json.dumps({"event":"sample","t":400,"n":12,'
                   '"peakGeneration":0,"parents":[],"swimmers":[[0,12]],'
                   '"swimmerReserve":[2,4,6,8,10],"anchoredLeaf":30,"driftingLeaf":20,'
                   '"rawFood":0,"availableFeed":100,"diet":[0]*11}))\n').encode()
        replacement = program.replace(b'"n":12', b'"n":99').replace(b'[0,12]', b'[0,99]')
        tool.write_bytes(program)
        engine = hashlib.sha256(program).hexdigest()
        mark = fingerprint('genome', engine)
        jobs = BreedingJobs(lambda: [])
        job = {'engine': engine, 'fingerprint': mark, 'variant': 400, 'steps': 400,
               'name': 'test', 'status': 'running', 'runs': [], 'cancel': threading.Event(),
               'process': None}
        stream = jobs.stream

        def replace_after_world(job, args, run):
            stream(job, args, run)
            tool.write_bytes(replacement)

        with patch.object(jobs, 'stream', replace_after_world):
            jobs.work(job, 'genome', program, [1, 2], folder)
        assert job['status'] == 'done', job
        assert [w['samples'][0]['fish'] for w in job['runs']] == [12, 12], (
            'A rebuild must not change the engine between worlds of the same job')
        assert len(jobs.results(folder, engine).all()) == 1
        with patch('labor_service.build_directory', return_value=root):
            overview = jobs.overview(folder)
        assert overview['engine'] == hashlib.sha256(replacement).hexdigest()
        assert overview['results'] == [], 'Old engine results cannot prove the rebuilt fish'
        assert fingerprint('genome', overview['engine']) != mark


def check_labor_samples():
    from labor_service import World
    world = World(1, 4000)
    world.read({'event': 'sample', 't': 1200, 'n': 9, 'peakGeneration': 3,
                'swimmers': [[1, 2], [2, 3]], 'parents': [[0, 1], [1, 2]],
                'reserve': [0, 0, 10, 20, 30], 'swimmerReserve': [10, 12, 15, 20, 30],
                'diet': [20, 0, 0, 0, 5, 8, 0, 0, 0, 0, 0],
                'availableFeed': 123, 'anchoredLeaf': 40, 'driftingLeaf': 7})
    sample = world.summary['samples'][0]
    assert sample['fish'] == 5 and sample['eggs'] == 4
    assert sample['reserve'] == [10, 12, 15, 20, 30], 'Egg energy cannot enter the fish reserve display'
    assert sample['parents'] == 1 and sample['generation'] == 3
    assert sample['diet'][0] == 20 and sample['availableFeed'] == 123 and sample['leaves'] == 47


def check_labor_lives():
    from labor_service import BreedingJobs, World
    from labor_recording import LifeArchive, read_life
    from protocol_schema import Breeding
    from wording import Refusal
    with tempfile.TemporaryDirectory() as folder:
        jobs = BreedingJobs(lambda: [])
        mark, steps, engine = '0123456789abcdef', Breeding.STEPS[0], 'engine'
        results = jobs.results(folder, engine)
        path = results.detail_folder(mark, steps, 1)
        world = World(1, steps, path)
        def event(kind, step, **fields):
            world.read(dict(event='life', id=7, kind=kind, t=step, **fields))
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
        life = world.summary['lives']['7']
        assert (life['regularSamples'], life['nearSamples']) == (2, 1), 'Event probes cannot weight proximity'
        assert (life['closings'], life['emptyClosings'], life['intake']) == (5, 1, 12), 'Closure is not food'
        assert life['phases'] == {'feeding': 10, 'full': 10, 'emptying': 22}
        assert life['longestNoFood'] == {'from': 10, 'to': 30}, 'Include the final interval before death'
        assert life['hatchLeaf'] == 12 and life['parent'] == 3 and life['generation'] == 2
        (path / 'scene-10.json').write_text('{"ticks":10,"fish":[]}')
        world.prepare({'event': 'scene', 't': 10})
        world.read({'event': 'scene', 't': 10})
        assert not (path / 'scene-10.json').exists()
        assert (path / 'scene-10.json.gz').exists()
        jobs.job = {'engine': engine, 'fingerprint': mark, 'steps': steps, 'runs': [world.summary]}
        request = {'fingerprint': mark, 'steps': steps, 'seed': 1}
        detail = jobs.request(dict(request, operation='life', id=7), folder)
        assert [p['t'] for p in detail['points']] == [4, 5, 6, 7, 8, 9, 10]
        assert detail['scenes'] == [10]
        life['last'] = 100
        assert detail['summary']['last'] == 30, 'Concurrent polling cannot mutate an issued response'
        scene = jobs.request(dict(request, operation='scene', step=10), folder)
        assert scene == {'step': 10, 'frame': {'ticks': 10, 'fish': []}}
        import gzip
        original_open = gzip.open
        def unlocked_scene(*args, **kwargs):
            assert jobs.lock.acquire(blocking=False), 'Scene decoding must allow cancellation'
            jobs.lock.release()
            return original_open(*args, **kwargs)
        with patch('labor_service.gzip.open', side_effect=unlocked_scene):
            jobs.request(dict(request, operation='scene', step=10), folder)
        def unlocked_life(folder, identity, length):
            assert jobs.lock.acquire(blocking=False), 'Life decoding must allow cancellation'
            jobs.lock.release()
            with (path / 'fish-7.jsonl').open('a') as stream:
                stream.write(json.dumps({'kind': 'point', 't': 110, 'id': 7}) + '\n')
            return read_life(folder, identity, length)
        with patch('labor_service.read_life', side_effect=unlocked_life):
            bounded = jobs.request(dict(request, operation='life', id=7), folder)
        assert max(p['t'] for p in bounded['points']) == 10, 'Concurrent appends stay outside the snapshot'
        for fields in ({'id': 8}, {'id': '../7'}, {'id': True}, {'operation': 'scene', 'step': 11},
                       {'fingerprint': '../outside'}, {'seed': 2}):
            try:
                jobs.request({**request, 'operation': 'life', 'id': 7, **fields}, folder)
            except Refusal:
                pass
            else:
                raise AssertionError(fields)
        (path / 'unrelated.json').write_text('{}')
        LifeArchive(path)
        assert read_life(path, 7) == {'points': [], 'events': []}
        assert not (path / 'scene-10.json.gz').exists(), 'A rerun discards its own old frames'
        assert (path / 'unrelated.json').exists()


def check_labor_scene_cancellation():
    from labor_service import BreedingJobs, World
    with tempfile.TemporaryDirectory() as folder:
        jobs = BreedingJobs(lambda: [])
        world = World(1, 4000, Path(folder))
        (Path(folder) / 'scene-100.json').write_text('{"ticks":100,"fish":[]}')
        job = {'id': 'recording', 'status': 'running', 'runs': [world.summary],
               'cancel': threading.Event(), 'process': None}
        jobs.job = job
        storing, release, answered = threading.Event(), threading.Event(), threading.Event()
        failures, replies = [], []
        copy = shutil.copyfileobj

        def slow_archive(source, target):
            storing.set()
            assert release.wait(3), 'Archive test was not released'
            copy(source, target)

        def stream():
            try:
                jobs.stream(job, [sys.executable, '-c',
                                 'import signal; print(\'{"event":"scene","t":100}\', '
                                 '\'{"event":"scene","t":200}\', sep="\\n", '
                                 'flush=True); signal.pause()'], world)
            except Exception as error:
                failures.append(error)

        def cancel():
            replies.append(jobs.request({'operation': 'cancel', 'job': job['id']}, folder))
            answered.set()

        worker, request = threading.Thread(target=stream), threading.Thread(target=cancel)
        with patch('labor_service.shutil.copyfileobj', side_effect=slow_archive):
            worker.start()
            try:
                assert storing.wait(3), 'No scene reached the archive'
                request.start()
                assert answered.wait(1), 'Scene compression blocked cancellation'
                assert replies[0]['runs'][0]['scenes'] == [], 'A partial archive cannot be published'
            finally:
                release.set()
                if job['process'] is not None:
                    job['process'].kill()
                worker.join(3)
                if request.ident is not None:
                    request.join(3)
        assert not worker.is_alive() and not request.is_alive() and not failures, failures
        assert job['cancel'].is_set() and world.summary['scenes'] == [100]


def main():
    ensure_node()
    check_compiler_build()
    sys.path.insert(0, str(ROOT))
    check_labor_engine()
    check_labor_samples()
    check_labor_lives()
    check_labor_scene_cancellation()
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
    for habitat in ('aquarium', 'becken'):
        with tempfile.TemporaryDirectory() as folder:
            observed = str(Path(folder) / 'fish')
            checkpoint = Path(folder) / 'world.state'
            foraging = Path(folder) / 'foraging.jsonl'
            genomes = ','.join(['genomes/handbau/startfisch.genome'] * 2)
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
            from labor_service import World
            world = World(184371, 6)
            for event in events:
                world.read(event)
            assert world.summary['samples'][-1]['step'] == 6
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
