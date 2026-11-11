# lebenslauf.py FILE...: deaths of hatched fish by cause with age and maturity, generation times,
# share of hatched fish that matured and peak generation.
import collections
import json
import statistics
import sys

CAUSE = {0: 'Hunger', 1: 'Verletzung', 2: 'unbefruchtet', 3: 'Fehlentwicklung', 4: 'Hirnbudget',
         5: 'Ei gefressen', 6: 'Alter', 7: 'Krankheit'}
MATURE = .99


def quantiles(values):
    if not values:
        return '-'
    v = sorted(values)
    return '/'.join(str(round(v[int(q * (len(v) - 1))])) for q in (.1, .5, .9))


for path in sys.argv[1:]:
    hatched, deaths, firsts, last = 0, collections.defaultdict(list), {}, None
    eggs = collections.Counter()
    matured = 0
    for line in open(path):
        d = json.loads(line)
        kind = d.get('event')
        if kind == 'hatch':
            hatched += 1
            firsts.setdefault(d['generation'], d['t'])
        elif kind == 'death':
            p = d['previous']
            if not p.get('hatched'):
                eggs[CAUSE.get(d['cause'], d['cause'])] += 1
            if p.get('hatched'):
                deaths[CAUSE.get(d['cause'], d['cause'])].append((p['age'], p['maturity']))
                matured += p['maturity'] >= MATURE
        elif kind == 'sample':
            last = d
    print(f"{path}: Ende t={last['t'] if last else '-'} n={last['n'] if last else '-'} "
          f"G={last['peakGeneration'] if last else '-'} geschlüpft={hatched} "
          f"erste Schlupfzeit je Generation {dict(sorted(firsts.items()))}")
    print(f"   Eier/Embryos gestorben: {dict(eggs)}")
    for cause, rows in sorted(deaths.items(), key=lambda kv: -len(kv[1])):
        ages = [a for a, _ in rows]
        mature = sum(m >= MATURE for _, m in rows)
        print(f"   {cause:14s} {len(rows):4d}  Alter 10/50/90% {quantiles(ages):>15s}  "
              f"davon reif {mature}")
