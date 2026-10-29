"""Profile deltas preserve independent viewers, reconnects and changed evidence."""
from pathlib import Path
from types import SimpleNamespace
import copy
import sys
import threading
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from simulation import Simulation
s = Simulation.__new__(Simulation)
s.frames = SimpleNamespace(latest={'render_epoch': 5})
s.observed_context = None
rows = {1: {'trait_details': {'Augen': {'evidence': '13'}}, 'diet': [4,1]}}
s.species_profiles = lambda: copy.deepcopy(rows)
a = s.species_profile_delta()
b = s.species_profile_delta(a['species_key'])
assert not b['species_profiles']
rows[1]['diet'] = [5,1]
c = s.species_profile_delta(b['species_key'])
assert c['species_profiles'][1]['diet'] == [5,1]
assert s.species_profile_delta()['species_profiles'] == rows
assert s.species_profile_delta(a['species_key'])['species_profiles'] == rows
rows.clear()
assert s.species_profile_delta(c['species_key'])['species_profile_ids'] == []
print('Artprofile: Änderungen, unabhängige Betrachter und Löschung: OK')
with tempfile.TemporaryDirectory() as directory:
    s.lock = threading.RLock()
    s.history = SimpleNamespace(meta={'id': 'test'}, session=Path(directory))
    source = {'profiles': [{'id': 1, 'diet': [5,1]}],
              'events': [{'id': 1}], 'traces': {'1': [[0, 2]]}}
    s.journal = SimpleNamespace(view=lambda: dict(source),
                                event_page=lambda after, before: source['events'])
    live = s.journal_view()
    assert 'profiles' not in live and live['traces'] == source['traces']
    s.frames.latest['historical'] = True
    s.observed_context = {'key': 'saved', 'journal': source}
    past = s.journal_view()
    assert 'profiles' not in past and past['events'] == source['events']
    assert source['profiles'][0]['diet'] == [5,1]
print('Journal: keine doppelten Artprofile; gespeicherte Profile bleiben erhalten: OK')
