# karte.py RUNDIR STEP [STEP...] : maps of where food is and where the fish are.
# RUNDIR holds a zuchtbecken observe run: m-<step>.json snapshots, m-trace.jsonl and run.jsonl.
# Each map: rocks grey, leaf energy green, algae on surfaces lime, feed red, drifting leaves olive,
# carrion brown, worms pink, crabs orange, mussels brown rings, plankton blue haze; fish tracks of
# the last WINDOW steps thin, fish now as dots sized by energy (dark = hungry), deaths in the
# window as black crosses.
import json
import math
import os
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PolyCollection

WINDOW = 500
FOOD_KIND = {0: ('Futter', '#e0402a'), 3: ('Aas', '#7a4a2a'), 4: ('Algenstück', '#9fd94a'),
             5: ('Blatt treibend', '#7c8f2a'), 2: ('Ei', '#f2e6a0')}
INVERT = {7: ('Wurm', '#e889b5'), 8: ('Krebs', '#f0a040'), 9: ('Muschel', '#8a6a3a')}

rundir = sys.argv[1]
steps = [int(s) for s in sys.argv[2:]]
# The product checkout's schema: REPO or the current directory.
schema = json.load(open(os.path.join(os.environ.get('REPO', '.'), 'protocol_schema.json')))
FC = {n: i for i, n in enumerate(schema['columns']['food'])}
IC = {n: i for i, n in enumerate(schema['columns']['invertebrate'])}
PC = {n: i for i, n in enumerate(schema['columns']['plant'])}
OC = {n: i for i, n in enumerate(schema['columns']['plant_organ'])}
FISH = {n: i for i, n in enumerate(schema['columns']['fish'])}

trace = open(os.path.join(rundir, 'm-trace.jsonl'))
head = json.loads(next(trace))
TC = {n: i for i, n in enumerate(head['columns'])}
frames = [json.loads(line) for line in trace if line.strip().endswith('}')]
deaths = {}
for line in open(os.path.join(rundir, 'run.jsonl')):
    d = json.loads(line)
    if d.get('event') == 'death':
        deaths[d['id']] = (d['t'], d['cause'])
last_seen = {}
for fr in frames:
    for r in fr['fish']:
        last_seen[r[TC['id']]] = (fr['t'], r[TC['x']], r[TC['y']])

for step in steps:
    view = json.load(open(os.path.join(rundir, f'm-{step}.json')))
    W, H = view['width'], view['height']
    fig, ax = plt.subplots(figsize=(W / 160, H / 160), dpi=110)
    ax.set_facecolor('#0b2530')
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.set_aspect('equal')
    ax.add_collection(PolyCollection([s for s in view['shapes']], facecolor='#566b70',
                                     edgecolor='none'))
    # Plankton haze.
    pl = view['plankton']
    if pl['amounts']:
        import numpy as np
        grid = np.array(pl['amounts'], dtype=float).reshape(pl['rows'], pl['columns'])
        rgba = np.zeros(grid.shape + (4,))
        rgba[..., 2] = 1
        rgba[..., 1] = .6
        rgba[..., 3] = .6 * grid / max(1e-9, grid.max())
        ax.imshow(rgba, extent=(0, W, H, 0), interpolation='bilinear')
    # Surfaces with algae, leaves on plants.
    segs, widths = [], []
    leaf_x, leaf_y, leaf_s = [], [], []
    for p in view['plants']:
        algae = p[PC['algae']]
        if algae > 0:
            segs.append([(p[PC['ax']], p[PC['ay']]), (p[PC['bx']], p[PC['by']])])
            widths.append(min(6, .5 + algae / 20))
        for o in p[PC['organs']]:
            curve, energy = o[OC['curve']], o[OC['energy']]
            if energy > 0:
                leaf_x.append(curve[-2])
                leaf_y.append(curve[-1])
                leaf_s.append(max(1, energy / 15))
    if segs:
        ax.add_collection(LineCollection(segs, colors='#a8e05a', linewidths=widths, alpha=.8))
    ax.scatter(leaf_x, leaf_y, s=leaf_s, c='#3fae4a', alpha=.5, linewidths=0, label='Blätter')
    for kind, (name, colour) in FOOD_KIND.items():
        pts = [f for f in view['food'] if f[FC['origin']] == kind]
        if pts:
            ax.scatter([f[0] for f in pts], [f[1] for f in pts],
                       s=[max(2, f[2] / 4) for f in pts], c=colour, linewidths=0, label=name)
    for kind, (name, colour) in INVERT.items():
        pts = [v for v in view['invertebrates'] if v[IC['kind']] == kind]
        if pts:
            ax.scatter([v[0] for v in pts], [v[1] for v in pts], s=18 if kind == 9 else 8,
                       facecolors='none' if kind == 9 else colour, edgecolors=colour,
                       linewidths=1.2, label=name)
    # Fish tracks over the window, fish now and deaths in the window.
    tracks = {}
    for fr in frames:
        if step - WINDOW <= fr['t'] <= step:
            for r in fr['fish']:
                if r[TC['hatched']]:
                    tracks.setdefault(r[TC['id']], []).append((r[TC['x']], r[TC['y']]))
    lines = []
    for pts in tracks.values():
        for a, b in zip(pts, pts[1:]):
            if abs(a[0] - b[0]) < W / 2:
                lines.append([a, b])
    ax.add_collection(LineCollection(lines, colors='#f6f1c8', linewidths=.4, alpha=.45))
    fish = [f for f in view['fish'] if f[FISH['hatched']]]
    if fish:
        energy = [f[FISH['energy']] for f in fish]
        ax.scatter([f[0] for f in fish], [f[1] for f in fish],
                   s=[12 + e / 6 for e in energy], c=energy, cmap='YlOrBr_r', vmin=0,
                   vmax=max(200, max(energy)), edgecolors='white', linewidths=.6, zorder=5)
    died = [last_seen[i][1:] for i, (t, _) in deaths.items()
            if step - WINDOW <= t <= step and i in last_seen]
    if died:
        ax.scatter([d[0] for d in died], [d[1] for d in died], marker='x', s=30, c='black',
                   linewidths=1.5, zorder=6, label='gestorben')
    ax.set_title(f'{os.path.basename(rundir.rstrip("/"))} Schritt {step}: '
                 f'{len(fish)} Fische, Futter {sum(f[2] for f in view["food"] if f[FC["origin"]] == 0):.0f}, '
                 f'Blätter {sum(leaf_s) * 15:.0f}', color='#e8efe0', fontsize=10)
    ax.tick_params(colors='#8aa')
    leg = ax.legend(loc='lower right', fontsize=6, framealpha=.4, markerscale=.8)
    fig.patch.set_facecolor('#0b2530')
    out = os.path.join(rundir, f'karte-{step}.png')
    fig.savefig(out, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close(fig)
    print(out)
