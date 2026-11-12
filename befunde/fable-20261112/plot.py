import sys, collections
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
import numpy as np
src, out = sys.argv[1], sys.argv[2]
L=collections.defaultdict(list); F=collections.defaultdict(list); P=collections.defaultdict(list); A=collections.defaultdict(list); O=[]; W=H=0
for line in open(src):
    f=line.rstrip('\n').split('\t')
    if f[0]=='W': W,H=float(f[1]),float(f[2])
    elif f[0]=='O' and f[1]!='C': O.append([float(v) for v in f[1:]])
    elif f[0]=='L': L[int(f[1])].append([float(v) for v in f[2:]])
    elif f[0]=='F': F[int(f[1])].append([float(v) for v in f[2:]])
    elif f[0]=='P': P[int(f[2])].append((int(f[1]),int(f[3]),float(f[4]),float(f[5]),float(f[6]),float(f[7])))
    elif f[0]=='A': A[int(f[2])].append((int(f[1]),float(f[3]),float(f[4]),int(f[5])))
def base(ax, t, zoom=None):
    for o in O:
        xs=o[0::2]+[o[0]]; ys=o[1::2]+[o[1]]
        ax.fill(xs,ys,color='#555',alpha=.6,lw=0)
    leaves=np.array(L[t]) if L[t] else np.zeros((0,6))
    if len(leaves):
        soft=leaves[leaves[:,5]==0]; hard=leaves[leaves[:,5]==1]
        segs=lambda a:[[(x-hx,y-hy),(x+hx,y+hy)] for x,y,hx,hy,e,h in a]
        ax.add_collection(LineCollection(segs(hard),colors='#8a6a3a',linewidths=.6,alpha=.7))
        ax.add_collection(LineCollection(segs(soft),colors='#2e9e4f',linewidths=1.3,alpha=.8))
    food=np.array(F[t]) if F[t] else np.zeros((0,4))
    if len(food):
        ax.scatter(food[:,0],food[:,1],s=3,c='#c9a227',alpha=.5,lw=0)
    ax.set_xlim(*(zoom[:2] if zoom else (0,W))); ax.set_ylim(*(zoom[2:] if zoom else (H,0))); ax.set_aspect('equal')
def path(ax, fid, t0, t1, cmap='plasma', lw=1.2):
    pts=[p for p in P[fid] if t0<=p[0]<=t1]
    if len(pts)<2: return
    xy=np.array([(p[2],p[3]) for p in pts]); tt=np.array([p[0] for p in pts])
    segs=[[xy[i],xy[i+1]] for i in range(len(xy)-1) if abs(xy[i+1][0]-xy[i][0])<W/2]
    lc=LineCollection(segs,cmap=cmap,array=tt[:-1][:len(segs)],linewidths=lw,norm=plt.Normalize(t0,t1)); ax.add_collection(lc)
    ax.plot(*xy[0],'o',ms=5,mfc='white',mec='k'); ax.plot(*xy[-1],'s',ms=5,mfc='k',mec='k')
    ax.annotate(str(fid),xy[-1],fontsize=8,xytext=(4,4),textcoords='offset points')
    acts=[a for a in A[fid] if t0<=a[0]<=t1]
    hit=np.array([(a[1],a[2]) for a in acts if a[3]>=0]); miss=np.array([(a[1],a[2]) for a in acts if a[3]<0])
    if len(hit): ax.scatter(hit[:,0],hit[:,1],marker='*',s=40,c='#00e5ff',edgecolors='k',linewidths=.3,zorder=5)
    if len(miss): ax.scatter(miss[:,0],miss[:,1],marker='x',s=22,c='red',linewidths=.9,zorder=5)
    return lc
mode=sys.argv[3]
if mode=='zoom':
    fid,t0,t1=int(sys.argv[4]),int(sys.argv[5]),int(sys.argv[6]); pts=[p for p in P[fid] if t0<=p[0]<=t1]; xs=[p[2] for p in pts]; ys=[p[3] for p in pts]; pad=60
    fig,ax=plt.subplots(figsize=(12,10)); base(ax,(t0//500)*500,(min(xs)-pad,max(xs)+pad,max(ys)+pad,min(ys)-pad)); lc=path(ax,fid,t0,t1,lw=2); fig.colorbar(lc,ax=ax,shrink=.6,label='Schritt')
    for p in pts:
        if p[0]%100==0: ax.annotate(str(p[0]),(p[2],p[3]),fontsize=7,color='#333')
    ax.set_title(f'Fisch {fid}, Schritt {t0}–{t1}: Energie {pts[0][4]:.0f}→{pts[-1][4]:.0f}, Darm {pts[0][5]*100:.0f}%→{pts[-1][5]*100:.0f}%. Blätter Stand Schritt {(t0//500)*500}; grün weich, braun Stängel')
elif mode=='all':
    t0,t1=int(sys.argv[4]),int(sys.argv[5])
    fig,ax=plt.subplots(figsize=(18,8.6)); base(ax,(t0//500)*500)
    lc=None
    for fid in sorted(P):
        if any(p[1]==0 for p in P[fid]) or True:
            r=path(ax,fid,t0,t1); lc=r or lc
    if lc: fig.colorbar(lc,ax=ax,shrink=.6,label='Schritt')
    ax.set_title(f'Liora, Seed 18731: Wege aller Fische, Schritt {t0}–{t1}. Grün = weiche Blätter, braun = Stängel, gelb = Futter/Stücke (Stand Schritt {(t0//500)*500}). Stern = Biss mit Wirkung, rotes x = Kieferschluss ins Leere, ○ Start, ■ Ende')
else:
    fid=int(mode); pts=P[fid]; xs=[p[2] for p in pts]; ys=[p[3] for p in pts]
    pad=120; zoom=(min(xs)-pad,max(xs)+pad,max(ys)+pad,min(ys)-pad)
    spans=[(0,800),(800,1600),(1600,3000)]
    fig,axs=plt.subplots(1,3,figsize=(20,7))
    for ax,(a,b) in zip(axs,spans):
        base(ax,a if a%500==0 else (a//500)*500+500 if False else (a//500)*500,zoom); lc=path(ax,fid,a,b,lw=1.5)
        e=[p for p in pts if a<=p[0]<=b]
        ax.set_title(f'Fisch {fid}, Schritt {a}–{b}'+(f': Energie {e[0][4]:.0f}→{e[-1][4]:.0f}, Darm {e[0][5]*100:.0f}%→{e[-1][5]*100:.0f}%' if e else ' (tot)'),fontsize=10)
    fig.suptitle('Blätter jeweils zum Beginn des Zeitfensters (auf 500 Schritte gerundet). Stern = Biss mit Wirkung, rotes x = Kieferschluss ins Leere')
fig.tight_layout(); fig.savefig(out,dpi=110)
