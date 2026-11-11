# verlauf.py PREFIX: life of every hatched fish from a zuchtbecken observe trace (PREFIX-trace.jsonl)
# and the run's events (run.jsonl beside it): intake, costs, motion, where it lived and died.
import collections
import json
import math
import os
import statistics
import sys

prefix = sys.argv[1]
lines = open(prefix + '-trace.jsonl')
head = json.loads(next(lines))
cols = {name: i for i, name in enumerate(head['columns'])}
every, width, height = head['every'], head.get('width'), head.get('height')
CAUSE = {0: 'Hunger', 1: 'Verletzung', 2: 'unbefruchtet', 3: 'Fehlentwicklung', 4: 'Hirnbudget',
         5: 'Ei gefressen', 6: 'Alter', 7: 'Krankheit'}
deaths = {}
run = os.path.join(os.path.dirname(prefix), 'run.jsonl')
if os.path.exists(run):
    for line in open(run):
        d = json.loads(line)
        if d.get('event') == 'death':
            deaths[d['id']] = CAUSE.get(d['cause'], d['cause'])

life = {}
for line in lines:
    frame = json.loads(line)
    t = frame['t']
    for row in frame['fish']:
        if not row[cols['hatched']]:
            continue
        f = life.setdefault(row[cols['id']], {'g': row[cols['generation']], 'first': t, 'rows': []})
        f['last'] = t
        f['rows'].append((t, row))


def col(row, name):
    return row[cols[name]]


summary = collections.defaultdict(list)
for fid, f in life.items():
    rows = f['rows']
    ages = (f['last'] - f['first'])
    intake = col(rows[-1][1], 'rawFood') - col(rows[0][1], 'rawFood')
    speed = statistics.mean(math.hypot(col(r, 'vx'), col(r, 'vy')) for _, r in rows)
    forward = statistics.mean(col(r, 'forward') for _, r in rows)
    move = statistics.mean(col(r, 'movementCost') for _, r in rows)
    brain = statistics.mean(col(r, 'brainCost') for _, r in rows)
    gut = statistics.mean(col(r, 'gutFill') for _, r in rows)
    mature_at = next((t - f['first'] for t, r in rows if col(r, 'maturity') >= .99), None)
    last = rows[-1][1]
    depth = col(last, 'y') / height if height else None
    cause = deaths.get(fid, 'lebt')
    summary[cause].append(dict(id=fid, g=f['g'], age=ages, intake=intake,
                               rate=intake / max(1, ages) * 100, speed=speed, forward=forward,
                               move=move, brain=brain, gut=gut, mature=mature_at,
                               x=col(last, 'x'), y=col(last, 'y'), depth=depth,
                               energy=col(last, 'energy'), tissue=col(last, 'tissue'),
                               yolk=col(last, 'eggYolk')))

print(f"{prefix}: {len(life)} geschlüpfte Fische beobachtet")
for cause, fish in sorted(summary.items(), key=lambda kv: -len(kv[1])):
    def m(key):
        values = [x[key] for x in fish if x[key] is not None]
        return statistics.median(values) if values else float('nan')
    matured = sum(x['mature'] is not None for x in fish)
    print(f"  {cause:12s} n={len(fish):3d} Alter {m('age'):6.0f} Aufnahme/100 {m('rate'):6.2f} "
          f"Tempo {m('speed'):.2f} Vortrieb {m('forward'):.2f} Bewegung {m('move'):.4f} "
          f"Gehirn {m('brain'):.4f} Darm {m('gut'):.2f} reif {matured} (mit {m('mature'):.0f}) "
          f"Tiefe {m('depth'):.2f}")
