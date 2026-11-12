import json, sys, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
src, out, title = sys.argv[1:4]
d = json.load(open(src))
W, H = d['width'], d['height']
food = [f for f in d['food'] if int(f[7]) == 0]
flock = [f for f in d['food'] if int(f[7]) == 10]
fish = [f for f in d['fish'] if f[8]]
eggs = [f for f in d['fish'] if not f[8]]
fig, (a, b) = plt.subplots(1, 2, figsize=(15, 5.6), gridspec_kw={'width_ratios': [4.2, 1]}, dpi=110)
a.set_facecolor('#0f2a33')
a.scatter([f[0] for f in food], [f[1] for f in food], s=[max(2, f[2] / 8) for f in food], c='#f0a04b', alpha=.75, linewidths=0, label='Futterflocken (%d, %.0f Energie)' % (len(food), sum(f[2] for f in food)))
if flock:
    a.scatter([f[0] for f in flock], [f[1] for f in flock], s=14, c='#9a7b4f', marker='s', linewidths=0, label='Kotflocken (%d)' % len(flock))
a.scatter([f[0] for f in eggs], [f[1] for f in eggs], s=30, facecolors='none', edgecolors='#e8e3c0', label='Eier (%d)' % len(eggs))
for f in fish:
    a.annotate('', xy=(f[0] + 55 * math.cos(f[2]), f[1] + 55 * math.sin(f[2])), xytext=(f[0], f[1]), arrowprops=dict(arrowstyle='->', color='#7fd6ff', lw=1.6))
a.scatter([f[0] for f in fish], [f[1] for f in fish], s=60, c='#7fd6ff', edgecolors='white', linewidths=.6, label='Fische (%d)' % len(fish), zorder=5)
a.set_xlim(0, W); a.set_ylim(H, 0); a.set_aspect('equal')
a.set_title(title); a.set_xlabel('Becken, links–rechts'); a.set_ylabel('Tiefe (oben = Oberfläche)')
a.legend(loc='lower center', ncol=4, fontsize=9, framealpha=.9, bbox_to_anchor=(.5, -0.32))
bins = [H * k / 10 for k in range(11)]
import numpy as np
fe, _ = np.histogram([f[1] for f in food], bins=bins, weights=[f[2] for f in food])
fi, _ = np.histogram([f[1] for f in fish], bins=bins)
y = [(bins[k] + bins[k + 1]) / 2 for k in range(10)]
b.barh(y, fe / max(1, fe.sum()), height=H / 11, color='#f0a04b', alpha=.8, label='Futterenergie')
b.barh(y, -fi / max(1, fi.sum()), height=H / 11, color='#7fd6ff', alpha=.9, label='Fische')
b.set_ylim(H, 0); b.set_title('Anteil je Tiefenschicht'); b.axvline(0, color='k', lw=.6)
b.set_xticks([-.5, 0, .5]); b.set_xticklabels(['50 %', '0', '50 %']); b.legend(fontsize=8, loc='lower right')
plt.tight_layout(); plt.savefig(out)
# distances
def near(f):
    best = 1e9
    for g in food:
        dx = abs(g[0] - f[0]); dx = min(dx, W - dx)
        best = min(best, math.hypot(dx, g[1] - f[1]))
    return best
ds = sorted(near(f) for f in fish)
print('Fische', len(fish), 'Abstand zur nächsten Futterflocke', [round(x) for x in ds])
print('Futter: Anteil der Energie je Tiefenzehntel', [round(float(x), 2) for x in fe / max(1, fe.sum())])
print('Fische je Tiefenzehntel', [int(x) for x in fi])
print('ruhendes Futter am Boden', sum(1 for f in food if f[5] >= 0), 'von', len(food), 'Energie am Boden %.0f' % sum(f[2] for f in food if f[5] >= 0))
