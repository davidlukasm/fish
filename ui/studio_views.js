import {EFFECTS, EFFECT_HELP, HORMONE_COLORS, MOTORS, MUSCLE_COLORS, MUSCLE_LABELS,
  PALETTE, SCENTS, SENSES, SITES, ZONES, activeSubstances,
  effectSupported, functionAtSite, hasSite, hormonePoint, iconPath, organColor,
  releasedSubstance, scentPoint, substanceName, validSiteFor} from './studio_model.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}
const fmt = value => Number(value).toFixed(2).replace(/\.00$/, '');
export function selectOptions(options, selected) {
  return options.map(([value, text]) =>
    `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(text)}</option>`).join('');
}
export const namedOptions = names => names.map((name, index) => [index, name]);

// Top/side projection of the engine's 360 three-dimensional developmental sites.
// Depth layers that overlap on screen remain separate candidate sites.
export const zoneStart = [68, 185, 355, 620];
export const zoneWidth = [117, 170, 265, 161];
export function bodyHalfWidth(x) {
  if(x<130) return Math.max(12,(x-64)*1.35);
  if(x<250) return 89+(x-130)*.33;
  if(x<390) return 129;
  if(x<540) return 129-(x-390)*.16;
  if(x<690) return 105-(x-540)*.29;
  return Math.max(17,61-(x-690)*.33);
}
export function sitePosition(p, tool = {}) {
  const heightOffset=(p.v-.5)*22;
  if(tool.role===2 && functionAtSite(tool,p)===1 && p.zone===2 && p.w>=.99) {
    const front=p.u>=.5;
    return [front?365+(1-p.u)*125+heightOffset:545+(1-p.u)*120+heightOffset,
      200+p.side*(front?101+28*p.v:80+24*p.v)];
  }
  if(tool.role===2 && functionAtSite(tool,p)===0 && p.zone===3 && p.w>=.99)
    return [795+(1-p.u)*99+heightOffset,200+p.side*(24+58*p.v)];
  const axial=zoneStart[p.zone]+zoneWidth[p.zone]*(1-p.u);
  // v is the vertical developmental coordinate. In the dorsal drawing it is
  // spread diagonally so that distinct 3-D sites become selectable on zoom.
  const x=axial+heightOffset;
  return [x,200+p.side*(bodyHalfWidth(axial)*(.16+.68*p.w)+(p.v-.5)*16)];
}

export function bodyPosition(g, side = g.side || -1) {
  const sites = SITES.filter(p => hasSite(g, p) && p.side === side);
  const n = sites.length || 1;
  if(sites.length) {
    const sum=sites.reduce((s,p)=>{
      const [x,y]=sitePosition(p,g);return [s[0]+x,s[1]+y];
    },[0,0]);
    return [sum[0]/n,sum[1]/n];
  }
  return sitePosition({zone:g.zone,side,u:(g.u0+g.u1)/2,
    v:(g.v0+g.v1)/2,w:(g.w0+g.w1)/2},g);
}

export function organIconSvg(g, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <path d="${esc(iconPath(g))}" fill="none" stroke="currentColor"
      stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function developmentDots(plan, tool, exclude=-1, zoom=1) {
  if(!tool)return '';
  const positions=new Map();
  for(const site of SITES) {
    if(!validSiteFor(tool,site))continue;
    const [x,y]=sitePosition(site,tool),key=Math.round(x)+':'+Math.round(y);
    const available=!plan.groups.some((g,i)=>i!==exclude&&hasSite(g,site));
    if(!positions.has(key))positions.set(key,{x,y,site,available:false,occupied:false});
    positions.get(key)[available?'available':'occupied']=true;
  }
  return [...positions.values()].map(({x,y,site,available})=>{
    const color=organColor({...tool,function:functionAtSite(tool,site)});
    return `<g class="aid-valid-site ${available?'free':'occupied'}
      ${site.zone===tool.zone?'preferred':'alternate'}"
      transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(1/zoom)})"
      style="--tone:${color}">
      <circle r="5"/><title>${esc(ZONES[site.zone])} ·
      ${esc(tool.muscle?MUSCLE_LABELS[site.zone]+'muskel':tool.name||'Gewebe')}
      · ${available?'frei':'belegt'}</title></g>`;
  }).join('');
}
function siteLegend(tools) {
  if(!tools.length)return '';
  const seen=new Set(),entries=[];
  for(const tool of tools) {
    if(tool.muscle) {
      MUSCLE_LABELS.forEach((label,zone)=>{
        const key='muscle'+zone;if(seen.has(key))return;seen.add(key);
        entries.push([MUSCLE_COLORS[zone],label+'muskel']);
      });
    } else {
      const key=tool.role+':'+tool.function+':'+(tool.nervePreset||tool.preset||'');
      if(seen.has(key))continue;seen.add(key);
      entries.push([organColor(tool),tool.name||'Zellgruppe']);
    }
  }
  return `<div class="aid-placement-legend">${entries.map(([color,name])=>
    `<span><i style="background:${color}"></i>${esc(name)}</span>`).join('')}</div>`;
}
export function moduleDots(plan, tools, zoom) {
  const positions=new Map();
  for(const tool of tools) {
    for(const site of SITES) {
      if(!validSiteFor(tool,site))continue;
      const [x,y]=sitePosition(site,tool),key=Math.round(x)+':'+Math.round(y);
      if(!positions.has(key))positions.set(key,{x,y,toolcolors:new Set(),available:false,prefer:false});
      const marker=positions.get(key);
      if(plan.groups.some(g=>hasSite(g,site)))continue;
      marker.available=true;
      marker.prefer ||= tool.zone===site.zone;
      marker.toolcolors.add(organColor({...tool,function:functionAtSite(tool,site)}));
    }
  }
  return [...positions.values()].filter(p=>p.available).map(p=>{
    const colors=[...p.toolcolors].slice(0,3);
    const bits=colors.map((color,i)=>`<circle cx="${fmt((i-(colors.length-1)/2)*5)}"
      cy="0" r="${colors.length>1?3:5}" style="fill:${color}"
      stroke="#112e32" stroke-width=".8"/>`).join('');
    return `<g class="aid-valid-site ${p.prefer?'preferred':'alternate'}"
      transform="translate(${fmt(p.x)} ${fmt(p.y)}) scale(${fmt(1/zoom)})">
      ${bits}</g>`;
  }).join('');
}
function fishWires(plan, selected, layer, report, zoom=1, activeConnection=null, networkOnly=true, stimulus=null, stimulusStep=0) {
  if(layer!=='wires'&&layer!=='learning'&&layer!=='stimulate')return '';
  const edges=[],measured=new Map((report?.contacts||[]).map(e=>[`${e[0]}:${e[1]}`,e[2]]));
  for(let i=0;i<plan.groups.length;i++)for(let j=0;j<plan.groups.length;j++) {
    const a=plan.groups[i],b=plan.groups[j];
    if(i===j||a.role===2||b.role===0||(a.role===0&&b.role===2))continue;
    const chance=contactLikelihood(a,b),real=measured.get(`${i}:${j}`);
    if((real||0)<1&&chance<.18)continue;
    if(layer==='learning'&&b.role!==1)continue;
    edges.push({i,j,chance,real});
  }
  edges.sort((a,b)=>(b.real||b.chance)-(a.real||a.chance));
  const inNetwork=new Set(selected>=0?[selected]:[]);
  for(let depth=0;depth<2;depth++) {
    const contacts=edges.filter(e=>inNetwork.has(e.i)||inNetwork.has(e.j));
    contacts.forEach(e=>{inNetwork.add(e.i);inNetwork.add(e.j);});
  }
  const focused=edges.filter(e=>inNetwork.has(e.i)&&inNetwork.has(e.j)||
    activeConnection?.from===e.i&&activeConnection?.to===e.j).slice(0,zoom>=2?150:65),
    surrounding=networkOnly?[]:edges.filter(e=>!inNetwork.has(e.i)||!inNetwork.has(e.j))
      .slice(0,zoom>=2?80:24);
  const frame=stimulus?.frames?.[stimulusStep];
  return [...focused,...surrounding].map(({i,j,chance,real})=>{
    const a=plan.groups[i],b=plan.groups[j],[x,y]=bodyPosition(a),[u,v]=bodyPosition(b);
    const bend=Math.max(12,Math.abs(u-x)*.15),
      chosen=activeConnection?.from===i&&activeConnection?.to===j,
      selectedEdge=chosen||i===selected||j===selected;
    const d=`M${fmt(x)} ${fmt(y)} Q${fmt((x+u)/2)} ${fmt((y+v)/2-bend)} ${fmt(u)} ${fmt(v)}`;
    const colour=a.sign<0&&a.role===1?'#d9a5c3':'#92d4b3',
      width=real?Math.min(5,1.3+Math.sqrt(real)/2):Math.max(.8,2.4*chance);
    const actual=real&&frame&&(frame[i]||0)>.03&&(frame[j]||0)>.02,
      pulseSize=actual?Math.min(6,1.4+5*Math.sqrt((frame[i]||0)*(frame[j]||0))):0;
    return `<g class="aid-wire-pair ${chosen?'chosen':''}"
      data-select-connection="${i}:${j}">
      <path class="aid-fish-wire-hit" d="${d}"/>
      <path class="aid-fish-wire ${a.sign<0&&a.role===1?'inhibit':''}
        ${selectedEdge?'selected':''}" d="${d}" stroke="${colour}"
        stroke-width="${fmt(width)}" marker-end="url(#aid-wire-tip)">
        <title>${esc(a.name)} → ${esc(b.name)} ·
          ${real?real+' entwickelte Synapsen':'Kontaktchance '+Math.round(chance*100)+' %'}</title>
      </path>
      ${actual?`<circle class="aid-observed-pulse" cx="${fmt(.25*x+.5*(x+u)/2+.25*u)}"
        cy="${fmt(.25*y+.5*((y+v)/2-bend)+.25*v)}" r="${fmt(pulseSize)}"
        fill="${colour}" fill-opacity="${fmt(Math.min(.95,.35+frame[j]))}"/>`:''}
    </g>`;
  }).join('');
}

export function hormoneAffinity(receptor,substance) {
  const [x,y]=hormonePoint(receptor.substance),[u,v]=hormonePoint(substance);
  const sigma=.15+1.85*Math.max(0,Math.min(1,receptor.width));
  return Math.exp(-((x-u)**2+(y-v)**2)/(2*sigma*sigma));
}
function fishHormones(plan, layer, selectedSubstance=0) {
  if(layer!=='hormones')return '';
  let result='';
  plan.groups.forEach((source,i)=>{
    if(releasedSubstance(source)!==selectedSubstance)return;
    const [x,y]=bodyPosition(source);
    plan.groups.forEach((target,j)=>{
      if(i===j)return;
      const strength=Math.max(0,...target.receptors.map((r,k)=>
        r.active&&effectSupported(target.role,k)?hormoneAffinity(r,selectedSubstance):0));
      if(strength<.16)return;
      const [u,v]=bodyPosition(target),colour=HORMONE_COLORS[selectedSubstance];
      result+=`<path class="aid-fish-hormone-wire" d="M${fmt(x)} ${fmt(y)}
        Q${fmt((x+u)/2)} ${fmt((y+v)/2-30)} ${fmt(u)} ${fmt(v)}"
        stroke="${colour}" stroke-opacity="${fmt(strength)}">
        <title>${esc(source.name)} → ${esc(target.name)} ·
          ${esc(substanceName(plan,selectedSubstance))}:
          ${Math.round(strength*100)} % Rezeptoraffinität</title></path>`;
    });
  });
  return result;
}

function eyePosition(plan,side) {
  const eyes=plan.groups.filter(g=>g.role===0&&g.function===0&&
    (!g.side||g.side===side));
  if(!eyes.length)return null;
  const points=eyes.map(g=>bodyPosition(g,side));
  const x=points.reduce((sum,p)=>sum+p[0],0)/points.length;
  return [x,200+side*bodyHalfWidth(x)*.84];
}
function fishEyes(plan) {
  return [-1,1].map(side=>{
    const eye=eyePosition(plan,side);
    if(!eye)return '';
    const [x,y]=eye;
    return `<g class="aid-drawn-eye" transform="translate(${fmt(x)} ${fmt(y)})">
      <ellipse rx="19" ry="13" class="aid-eye"/>
      <circle cx="-5" cy="0" r="7" class="aid-pupil"/>
      <circle cx="-7" cy="-3" r="2" fill="#e9faf0" opacity=".72"/>
      <title>Augenposition aus den Lichtrezeptoren</title></g>`;
  }).join('');
}
function mergeIntervals(intervals) {
  if(!intervals.length)return [];
  const sorted=intervals.slice().sort((a,b)=>a[0]-b[0]),merged=[sorted[0].slice()];
  for(const [lo,hi] of sorted.slice(1)) {
    const last=merged[merged.length-1];
    if(lo<=last[1]+.0001)last[1]=Math.max(last[1],hi);
    else merged.push([lo,hi]);
  }
  return merged;
}
function fishPerception(plan,selected,report) {
  const current=plan.groups[selected],sight=[];
  for(const side of [-1,1]) {
    const eye=eyePosition(plan,side);
    if(!eye)continue;
    const [x,y]=eye,half=Math.PI*.65;
    const liveIntervals=report?.eyeIntervals?.[side<0?0:1];
    let intervals;
    if(Array.isArray(liveIntervals))intervals=liveIntervals;
    else {
      intervals=[];
      for(const g of plan.groups.filter(g=>g.role===0&&g.function===0&&
        (!g.side||g.side===side))) {
        const width=(4*Math.pow(117/4,g.field))*Math.PI/180;
        for(const p of SITES.filter(p=>p.side===side&&hasSite(g,p))) {
          const bearing=side*half*(.5*(1-p.u)+.5*p.w);
          intervals.push([Math.max(-half,bearing-width),Math.min(half,bearing+width)]);
        }
      }
      intervals=mergeIntervals(intervals);
    }
    const chosen=current?.role===0&&current.function===0&&(!current.side||current.side===side);
    for(const [begin,end] of intervals) {
      const lo=Math.max(-Math.PI,begin),hi=Math.min(Math.PI,end),radius=305;
      if(!Number.isFinite(lo+hi)||hi<=lo)continue;
      const at=angle=>[x-radius*Math.cos(angle),y+radius*Math.sin(angle)];
      const a=at(lo),b=at(hi);
      sight.push(`<path class="aid-sight-sector ${chosen?'selected':''}"
        d="M${fmt(x)} ${fmt(y)} L${fmt(a[0])} ${fmt(a[1])}
        A${radius} ${radius} 0 ${hi-lo>Math.PI?1:0} 0 ${fmt(b[0])} ${fmt(b[1])}Z">
        <title>${report?'Entwickeltes Sehintervall der Engine':'Sehbereich der geplanten Retina'}
        · ${side<0?'links':'rechts'}</title></path>`);
    }
  }
  if(current?.role===0&&[1,2,4].includes(current.function)) {
    const [x,y]=bodyPosition(current),r=30+current.field*115;
    sight.push(`<circle class="aid-sense-field" cx="${fmt(x)}" cy="${fmt(y)}"
      r="${fmt(r)}"><title>Schematischer Wahrnehmungsbereich</title></circle>`);
  }
  return sight.join('');
}
function tissueFootprints(plan,selected,zoom) {
  return plan.groups.map((g,i)=>{
    if(i!==selected&&zoom<1.7)return '';
    const sites=SITES.filter(p=>hasSite(g,p));
    const color=organColor(g);
    return sites.map(p=>{
      const [x,y]=sitePosition(p,g);
      return `<circle cx="${fmt(x)}" cy="${fmt(y)}"
        r="${i===selected?4:2.4}" fill="${color}"
        fill-opacity="${i===selected?.73:.39}">
        <title>${esc(g.name)} · möglicher Entwicklungsort</title></circle>`;
    }).join('');
  }).join('');
}

function fishMouth(plan) {
  const jaw=plan.groups.filter(g=>g.role===2&&g.function===5);
  const suction=plan.groups.filter(g=>g.role===2&&g.function===2);
  if(!jaw.length&&!suction.length)return '';
  const capacity=jaw.reduce((sum,g)=>sum+SITES.filter(p=>hasSite(g,p)).length*g.copies,0);
  const opening=capacity?Math.min(31,9+Math.sqrt(capacity)*2.2):8;
  const teeth=capacity?Math.min(7,Math.max(2,Math.round(Math.sqrt(capacity)/3))):0;
  return `<g class="aid-mouth"><path d="M76 ${fmt(200-opening)}
    Q96 ${fmt(200-opening*.6)} 115 195 M76 ${fmt(200+opening)}
    Q96 ${fmt(200+opening*.6)} 115 205" fill="none" stroke="#c7e0cb"
    stroke-width="3"/>${Array.from({length:teeth},(_,i)=>{
      const x=83+i*5,y=200-opening*(1-i/(teeth+1));
      return `<path d="M${x} ${fmt(y)}l2 7 3-7" fill="#ecedcf" stroke="#24434c"
        stroke-width=".6"/>`;
    }).join('')}</g>`;
}
function finScale(plan,kind) {
  const cells=plan.groups.filter(g=>g.role===2&&g.function===kind)
    .reduce((sum,g)=>sum+g.copies*SITES.filter(p=>hasSite(g,p)).length,0);
  return cells?Math.min(1.2,.46+.085*Math.sqrt(cells)):0;
}
function organMarks(plan) {
  const groups=plan.groups,has=(role,fn)=>groups.some(g=>g.role===role&&g.function===fn);
  const marks=[];
  if(has(0,2)) {
    // The aquarium derives two nasal barbels from odor-form tissue.
    for(const g of groups.filter(g=>g.role===0&&g.function===2))
      for(const side of (g.side?[g.side]:[-1,1])) {
        const [px,py]=bodyPosition(g,side),x=Math.max(80,px),y=200+side*bodyHalfWidth(x)*.88;
        const dx=Math.min(24,8+g.copies*1.3);
        marks.push(`<g class="aid-nasal-barbel"><path d="M${fmt(x)} ${fmt(y)}
          Q${fmt(x-dx)} ${fmt(y+side*13)} ${fmt(x-dx*1.9)} ${fmt(y+side*20)}"/>
          <path d="M${fmt(x+5)} ${fmt(y)}q-12 ${fmt(side*9)} -30 ${fmt(side*7)}"/>
          <circle cx="${fmt(x)}" cy="${fmt(y)}" r="4"/></g>`);
      }
  }
  if(has(0,4))for(const g of groups.filter(g=>g.role===0&&g.function===4)) {
    for(const side of (g.side?[g.side]:[-1,1])) {
      const [x,y]=bodyPosition(g,side);
      marks.push(`<g class="aid-distance-organ" transform="translate(${fmt(x)} ${fmt(y)})">
        <path d="M-9 1q9-10 18 0M-5 4q5-5 10 0"/><circle r="2.4"/></g>`);
    }
  }
  if(has(0,1))for(const side of [-1,1]) {
    marks.push(`<path class="aid-lateral-organ" d="M245 ${fmt(200+side*94)}
      Q475 ${fmt(200+side*99)} 731 ${fmt(200+side*36)}"/>`);
  }
  if(has(2,6)) {
    for(const side of [-1,1])for(let i=0;i<9;i++) {
      const x=250+i*52,y=200+side*bodyHalfWidth(x)*.9;
      marks.push(`<path class="aid-defense-spine" d="M${fmt(x)} ${fmt(y)}
        l${fmt(5-i*.4)} ${fmt(side*(15+4*Math.sin(i)))}"/>`);
    }
  }
  if(has(2,8)) {
    marks.push('<ellipse class="aid-internal-organ aid-swim-bladder" cx="465" cy="200" rx="79" ry="27"/>');
  }
  if(has(0,5))marks.push('<path class="aid-internal-organ aid-gut" d="M352 217 Q396 252 441 220T530 222T610 218"/>');
  for(const g of groups.filter(g=>g.role===2&&g.function===9)) {
    const [x,y]=bodyPosition(g);
    marks.push(`<path class="aid-internal-organ aid-gland" d="M${fmt(x)} ${fmt(y-15)}l17 15-17 15-17-15Z"/>`);
  }
  if(has(2,3))marks.push('<g class="aid-gamete-organ eggs"><ellipse cx="675" cy="216" rx="34" ry="18"/><path d="M704 216L739 205M704 216L739 225"/><circle cx="673" cy="216" r="9"/></g>');
  if(has(2,4))marks.push('<g class="aid-gamete-organ sperm"><ellipse cx="669" cy="185" rx="32" ry="13"/><path d="M694 185Q728 181 740 188"/><circle cx="674" cy="185" r="4"/></g>');
  if(has(0,3)) {
    for(const g of groups.filter(g=>g.role===0&&g.function===3)) {
      const [x,y]=bodyPosition(g);
      marks.push(`<path class="aid-touch-mark" d="M${fmt(x-10)} ${fmt(y-5)}q10-11 20 0M${fmt(x-10)} ${fmt(y+4)}q10-9 20 0"/>`);
    }
  }
  return marks.join('');
}
function missingOrganWarnings(plan,report) {
  if(plan.groups.length===0)return '';
  const has=(role,fn)=>plan.groups.some(g=>g.role===role&&g.function===fn);
  let warnings='';
  if(!has(2,0))warnings+='<path class="aid-organ-missing" d="M782 174L837 145 822 199 837 252 782 225Z"><title>Zum Schwimmen fehlt der Schwanzmuskel</title></path>';
  if(!has(2,2))warnings+='<circle class="aid-organ-missing" cx="86" cy="200" r="19"><title>Zum Fressen fehlt ein Saugmuskel</title></circle>';
  if(report&&!report.checks?.sense)warnings+='<circle class="aid-organ-missing" cx="165" cy="152" r="12"><title>Ein Sinnesorgan fehlt</title></circle>';
  return warnings;
}
function markerShape(g,r) {
  if(g.role!==1||g.nervePreset==='relay')return `<circle class="aid-organ-disc" r="${r}"/>`;
  if(g.nervePreset==='inhibit')return `<rect class="aid-organ-disc" x="${-r}" y="${-r}" width="${2*r}" height="${2*r}" rx="3"/>`;
  if(g.nervePreset==='pace')return `<polygon class="aid-organ-disc" points="0,${-r} ${r*.85},${-r*.5} ${r*.85},${r*.5} 0,${r} ${-r*.85},${r*.5} ${-r*.85},${-r*.5}"/>`;
  if(g.nervePreset==='learn')return `<polygon class="aid-organ-disc" points="0,${-r} ${r*.32},${-r*.32} ${r},0 ${r*.32},${r*.32} 0,${r} ${-r*.32},${r*.32} ${-r},0 ${-r*.32},${-r*.32}"/>`;
  return `<path class="aid-organ-disc" d="M0 ${-r}L${r} 0 0 ${r} ${-r} 0Z"/>`;
}
export function fishCanvas(plan, selected, brush, report, options = {}) {
  const layer=options.layer||'organs',tool=options.toolOverride||(brush==null?null:PALETTE[brush]),
    zoom=options.zoom||1,centre=options.centre||[480,200],
    width=960/zoom,height=400/zoom,current=plan.groups[selected],inverse=1/zoom,
    selectedHormone=options.hormoneSelected??0;
  const activeTools=options.moduleTools?.length?options.moduleTools:(tool?[tool]:[]);
  const sites=layer==='organs'?(activeTools.length>1?
    moduleDots(plan,activeTools,zoom):developmentDots(plan,tool,-1,zoom)):'';
  const turnFin=fmt(finScale(plan,1)),tailFin=fmt(finScale(plan,0));
  const hasTurn=Number(turnFin)>0,hasTail=Number(tailFin)>0;
  const pigments=plan.groups.filter(g=>g.role===2&&g.function===7);
  const hue=pigments.length?Math.round(210+(pigments.reduce((v,g)=>v+g.q1,0)/pigments.length)*145):171;
  const mappedModules=[...new Set(plan.groups.map(g=>g.moduleId).filter(Boolean))].map(id=>{
    const indices=plan.groups.map((g,i)=>g.moduleId===id?i:-1).filter(i=>i>=0);
    const pts=indices.map(i=>bodyPosition(plan.groups[i]));
    return {id,indices,x:pts.reduce((sum,p)=>sum+p[0],0)/pts.length,
      y:pts.reduce((sum,p)=>sum+p[1],0)/pts.length};
  });
  const legend=siteLegend(activeTools);
  const positioned=[],collapsedBundles=new Set();
  plan.groups.forEach((g,i)=>{
    if(g.bundle&&zoom<2.3) {
      if(collapsedBundles.has(g.bundle))return;
      collapsedBundles.add(g.bundle);
      const indices=plan.groups.map((item,k)=>item.bundle===g.bundle?k:-1).filter(k=>k>=0),
        primary=indices.map(k=>plan.groups[k]).find(item=>item.role===2&&item.w0<.1)||g,
        primaryIndex=plan.groups.indexOf(primary);
      for(const side of (primary.side?[primary.side]:[-1,1])) {
        const [x,y]=bodyPosition(primary,side);
        positioned.push({g:primary,i:primaryIndex,side,x,y,indices,
          organLabel:primary.function===3?'Ei-Organ':'Spermienorgan'});
      }
    } else for(const side of (g.side?[g.side]:[-1,1])) {
      const [x,y]=bodyPosition(g,side);positioned.push({g,i,side,x,y,indices:[i]});
    }
  });
  const clusters=[];
  for(const marker of positioned) {
    const existing=clusters.find(cluster=>cluster.side===marker.side&&
      Math.hypot(cluster.x-marker.x,cluster.y-marker.y)<35/zoom);
    if(existing) {
      existing.items.push(marker);
      const n=existing.items.length;
      existing.x+=(marker.x-existing.x)/n;
      existing.y+=(marker.y-existing.y)/n;
    } else clusters.push({side:marker.side,x:marker.x,y:marker.y,items:[marker]});
  }
  const markers=clusters.map(cluster=>{
    if(cluster.items.length>1) {
      const chosen=cluster.items.some(m=>m.indices?.includes(selected)),n=cluster.items.length;
      if(zoom>=2.8) {
        const spread=(24+3*n)/zoom;
        return `<g class="aid-organ-spread">
          <circle class="aid-spread-anchor" cx="${fmt(cluster.x)}" cy="${fmt(cluster.y)}" r="${fmt(8/zoom)}"/>
          ${cluster.items.map((m,k)=>{
            const a=2*Math.PI*k/n-Math.PI/2,
              x=cluster.x+Math.cos(a)*spread,y=cluster.y+Math.sin(a)*spread;
            return `<g>
              <path class="aid-spread-leader" d="M${fmt(cluster.x)} ${fmt(cluster.y)}L${fmt(x)} ${fmt(y)}"/>
              <g data-select-group="${m.i}" data-drag-body="${m.i}" role="button"
                tabindex="0" aria-label="${esc(m.g.name)}"
                class="aid-organ-marker ${m.i===selected?'selected':''} ${options.multiSelected?.includes(m.i)?'multi':''}"
                transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(inverse)})"
                style="--tone:${organColor(m.g)}">
                
                ${markerShape(m.g,13)}
                <path class="aid-marker-icon" d="${esc(iconPath(m.g))}" transform="translate(-8 -8) scale(.667)"/>
                <title>${esc(m.g.name)} · aus einem überlagerten Entwicklungsort aufgefächert</title>
              </g></g>`;
          }).join('')}</g>`;
      }
      return `<g data-zoom-cluster="${fmt(cluster.x)},${fmt(cluster.y)}"
        role="button" tabindex="0" class="aid-organ-cluster ${chosen?'selected':''}"
        transform="translate(${fmt(cluster.x)} ${fmt(cluster.y)}) scale(${fmt(inverse)})">
        <circle class="aid-cluster-halo" r="${19+Math.min(12,n*1.6)}"/>
        <circle class="aid-cluster-disc" r="${16+Math.min(8,n)}"/>
        <text text-anchor="middle" y="5">${n}</text>
        <title>${esc(cluster.items.slice(0,6).map(m=>m.g.name).join(' · '))}
          ${n>6?' und weitere':''} · zum Hineinzoomen klicken</title></g>`;
    }
    const {g,i,x,y}=cluster.items[0],selectedNode=cluster.items[0].indices?.includes(selected),
      sourcing=layer==='wires'&&i===options.wireSource,
      responding=layer==='hormones'&&g.receptors.some((r,k)=>
        r.active&&effectSupported(g.role,k)&&
        hormoneAffinity(r,selectedHormone)> .16),
      producing=layer==='hormones'&&releasedSubstance(g)===selectedHormone,
      chemical=HORMONE_COLORS[selectedHormone]||'#c5a9e2',
      activity=layer==='stimulate'?(options.stimulus?.frames?.[options.stimulusStep]?.[i]||0):0;
    return `<g data-select-group="${i}" data-drag-body="${i}" role="button"
      tabindex="0" aria-label="${esc(g.name)}" style="--tone:${organColor(g)}"
      class="aid-organ-marker ${selectedNode?'selected':''} ${responding?'reacting':''}
        ${options.multiSelected?.includes(i)?'multi':''} ${producing?'producing':''}
        ${sourcing?'sourcing':''}"
      transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(inverse)})">
      
      ${markerShape(g,selectedNode?17:14)}
      ${responding?`<circle class="aid-hormone-responder" r="25" stroke="${chemical}"/>`:''}
      ${producing?`<circle class="aid-hormone-source" r="26" stroke="${chemical}"/>`:''}
      ${activity>.012?`<circle class="aid-neural-activity" r="${fmt(21+activity*14)}"
        stroke-width="${fmt(1.5+activity*3.5)}"
        stroke-opacity="${fmt(Math.min(.95,.25+activity))}"/>`:''}
      <path class="aid-marker-icon" d="${esc(iconPath(g))}" transform="translate(-8 -8) scale(.667)"/>
      ${layer==='learning'&&g.role===1?`<circle class="aid-learning-ring" r="23"
        stroke-dasharray="${fmt(g.qwidth*135)} 140"/>`:''}
      <title>${esc(cluster.items[0].organLabel||g.name)} · ziehen zum Verschieben</title>
    </g>`;
  }).join('');
  const moduleHandles=mappedModules.map(m=>{
    const chosen=m.id===options.selectedModule,
      title=plan.groups[m.indices[0]]?.moduleName||'Baugruppe',
      x=m.x,y=m.y-43/zoom;
    return `<g class="aid-module-handle ${chosen?'active':''}"
      data-select-module="${esc(m.id)}" data-drag-module="${esc(m.id)}"
      transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(inverse)})">
      <rect x="-20" y="-15" width="40" height="30" rx="11"/>
      <path d="M-10-3h20M-10 3h20M-10-9h20"/>
      <title>${esc(title)} · hier ziehen, um alle Zentren gemeinsam zu verschieben</title></g>`;
  }).join('');
  const currentPlace=current&&bodyPosition(current),
    currentLabel=current?.bundle?(plan.groups.some(g=>g.bundle===current.bundle&&g.function===3)?
      'Ei-Organ':'Spermienorgan'):current?.name;
  return `<div class="aid-viewhead aid-canvas-intro"><div><small>ATELIER / AM FISCH ARBEITEN</small>
    <h2>Dein Fisch</h2><p>Organe, Nervenzentren und ihre Verbindungen entstehen direkt hier.</p></div></div>
    <div class="aid-fish-toolbar" role="toolbar" aria-label="Werkzeuge am Fisch">
      ${[['organs','↖ Auswahl & Bau'],['wires','↝ Verbinden'],['hormones','♢ Botenstoffe'],['learning','✦ Lernen'],['stimulate','ϟ Reizen'],['erase','⌫ Löschen']].map(([id,label])=>
        `<button data-layer="${id}" class="${layer===id?'active':''}"
        type="button" title="${label}">${label}</button>`).join('')}
      <button data-network-only="1" class="${options.networkOnly?'active':''}"
        title="Nur Verbindungen des ausgewählten Netzwerks anzeigen" type="button">
        ${options.networkOnly?'◎ Netzwerk':'◯ Alle Netze'}</button>
      <span class="aid-toolbar-gap"></span>
      <button data-zoom="out" title="Verkleinern" type="button">−</button>
      <output class="aid-zoom-value">${Math.round(zoom*100)} %</output>
      <button data-zoom="in" title="Vergrößern" type="button">＋</button>
      <button data-zoom="reset" title="Ganzen Fisch zeigen" type="button">Fit</button>
    </div>
    <div class="aid-body-stage" style="--brush-color:${tool?organColor(tool):'#8dcdbf'}">
      <div class="aid-stage-hint" id="aid-placement-status">${tool?
        `<strong>${esc(options.moduleName||tool.name)}</strong> · frei platzierbar, solange ausgewählt`:
        layer==='wires'?(options.wireSource!=null?
          `Quelle: ${esc(plan.groups[options.wireSource]?.name||'Bauteil')} · weitere Empfänger anklicken · Quelle erneut anklicken beendet`:
          'Verbindung von einer Quelle zum Empfänger ziehen · Linie wählen'): 
        layer==='hormones'?'Farblinien: Drüse → Zellen mit passenden Rezeptoren':
        layer==='learning'?'Lernzentrum wählen und seine Anpassung unmittelbar einstellen.':
        layer==='erase'?'Zentrum anklicken oder aus der Zeichenfläche ziehen, um es zu entfernen.':
        layer==='stimulate'?options.stimulus?'Gemessene Reizantwort · heller Ring bedeutet höhere Aktivität.':'Entwickelten Fisch an einem Organ reizen.':
        'Bauteile ziehen · Mausrad: Zoomen · Hintergrund ziehen: Verschieben'}</div>
      <svg id="aid-body-map" viewBox="${fmt(centre[0]-width/2)}
        ${fmt(centre[1]-height/2)} ${fmt(width)} ${fmt(height)}"
        role="group" aria-label="Fisch mit Entwicklungsorten, Geweben und Signalen">
        <defs><linearGradient id="aid-skin" x2="0" y2="1">
          <stop stop-color="hsl(${hue} 28% 45%)"/><stop offset=".48" stop-color="hsl(${hue} 38% 26%)"/>
          <stop offset="1" stop-color="hsl(${hue} 28% 43%)"/></linearGradient>
        <linearGradient id="aid-fin" x2="1" y2="0">
          <stop stop-color="#6faaa0" stop-opacity=".78"/>
          <stop offset="1" stop-color="#52817d" stop-opacity=".45"/></linearGradient>
        <marker id="aid-wire-tip" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
          orient="auto"><path d="M0 0 L7 3.5 L0 7Z" fill="#c2d6a0"/></marker></defs>
        <g class="aid-fish-art">
          ${hasTurn?`<g transform="translate(413 200) scale(1 ${turnFin}) translate(-413 -200)">
            <path class="aid-fin" data-place="fin" d="M351 98Q375 46 477 19Q483 84 431 121Z
              M351 302Q375 354 477 381Q483 316 431 279Z"/>
            <path class="aid-fin" data-place="fin" d="M533 133Q586 77 688 90L692 160Z
              M533 267Q586 323 688 310L692 240Z"/>
          </g>`:''}
          ${hasTail?`<g transform="translate(783 200) scale(1 ${tailFin}) translate(-783 -200)">
            <path class="aid-fin" data-place="tail" d="M771 171Q834 111 911 44
              L882 200 911 356Q834 289 771 229Z"/>
          </g>`:''}
          <path class="aid-fishshape" data-place="body" d="M65 200 Q139 101 260 80
            C410 65 490 98 607 122 Q705 146 786 173 Q820 200 786 227
            Q705 254 607 278 C490 302 410 335 260 320 Q139 299 65 200Z"/>
          <path class="aid-fish-spine" d="M90 200Q420 198 788 200"/>
          <path class="aid-fish-line" d="M206 105Q481 113 757 180
            M206 295Q481 287 757 220"/>
          <path class="aid-cns-outline" d="M135 176Q217 128 346 167Q407 206 346 233Q220 272 135 224Z"/>
          ${organMarks(plan)}
          ${fishMouth(plan)}
          ${fishEyes(plan)}
          ${hasTail?'<g class="aid-fin-rays"><path d="M807 173L899 63 M810 184L887 147 M807 227L899 337 M810 216L887 253"/></g>':''}
          ${missingOrganWarnings(plan,report)}
        </g>
        <path data-place="body" class="aid-body-hit" d="M65 200 Q132 96 260 74
          C410 60 490 92 607 116L805 166L831 200L805 234L607 284
          C490 308 410 340 260 326Q132 304 65 200Z"/>
        ${fishPerception(plan,selected,report)}
        <g class="aid-fish-wires">${fishWires(plan,selected,layer,report,zoom,options.connection,options.networkOnly,options.stimulus,options.stimulusStep)}</g>
        <g class="aid-fish-hormones">${fishHormones(plan,layer,selectedHormone)}</g>
        <g class="aid-development-sites" id="aid-development-sites">${sites}</g>
        <g class="aid-tissue-footprints">${tissueFootprints(plan,selected,zoom)}</g>
        <g class="aid-fish-markers">${markers}</g>
        <g class="aid-module-handles">${moduleHandles}</g>
        ${currentPlace?`<g transform="translate(${fmt(currentPlace[0])}
          ${fmt(currentPlace[1]-38/zoom)}) scale(${fmt(inverse)})">
          <text class="aid-selected-label" y="0" text-anchor="middle"
            font-size="13">${esc(currentLabel)}</text></g>`:''}
        <g id="aid-place-preview" style="display:none" aria-hidden="true">
          <circle r="20" class="aid-preview-ring"/><circle r="11" class="aid-preview-center"/>
        </g>
        <path id="aid-wire-preview" class="aid-wire-preview" style="display:none" d=""/>
      </svg>
      <div class="aid-fish-trash" id="aid-trash" data-trash="1" title="Bauteil hier ablegen">♲
        <span>Entfernen</span></div>
    </div>
    ${legend}
    <div class="aid-footnotes"><span>${report?report.neurons+' entwickelte Zellen':plan.groups.length+' Bauteile im Bauplan'}</span>
      <span>${options.stimulus?'Reiz gegenüber einem ungereizten Gehirn · '+(options.stimulusStep+1)+'/'+options.stimulus.frames.length+' Schritte':
        report?'Sichtfeld und Zellen: Engine-Entwicklung · Organsymbole als Bauplanvorschau':
        'Die Engine bestimmt nach dem Entwickeln die tatsächlichen Zellen und Organformen.'}</span></div>
    ${!plan.groups.length?'<p class="aid-note">Links findest du einzelne Zellen und vorverdrahtete Baugruppen. Beginne mit einer davon.</p>':''}`;
}

function responsePlane(g) {
  const x=Math.max(0,Math.min(1,(1-g.threshold)/2))*100,
    y=Math.max(0,Math.min(1,1-g.tau))*100;
  return `<div class="aid-inspector-card"><div class="aid-subheading">Wann reagiert dieses Gewebe?</div>
    <div class="aid-response-pad" data-response-pad="1" role="slider" tabindex="0"
      aria-label="Reizschwelle und Reaktionsgeschwindigkeit">
      <span class="aid-pad-cross"></span><span class="aid-pad-handle" style="left:${x}%;bottom:${y}%"></span>
      <span class="aid-pad-edge left">Schwer auslösbar</span>
      <span class="aid-pad-edge right">Leicht auslösbar</span>
      <span class="aid-pad-edge top">Kurze Reizantwort</span>
      <span class="aid-pad-edge bottom">Lange Reizantwort</span>
    </div></div>`;
}

function learningPlane(g) {
  const x=Math.round(g.qwidth*100),y=Math.round((g.mode+1)*50);
  return `<div class="aid-inspector-card aid-learning-panel"><div class="aid-subheading">Synapsen verändern</div>
    <p class="aid-microcopy">Links bleiben Kontakte stabil. Rechts lernen sie stärker. Oben konkurrieren aktive
      Synapsen; unten schwächen sich gegenläufige Signale ab.</p>
    <div class="aid-learning-pad" data-learning-pad="1" tabindex="0" role="slider"
      aria-label="Lernfähigkeit und Lernregel">
      <span class="aid-pad-handle" style="left:${x}%;bottom:${y}%"></span>
      <span class="aid-pad-edge left">Stabil</span><span class="aid-pad-edge right">Plastisch</span>
      <span class="aid-pad-edge top">Konkurrenz</span><span class="aid-pad-edge bottom">Ausgleich</span>
    </div>
    <p class="aid-small-fact">Jede Synapse verändert sich später anhand ihrer Aktivität und der Hormonantwort.</p>
    </div>`;
}

function scentCompass(g) {
  const colours=['#d9dfb1','#8bcb84','#62c6a3','#86b5d8','#7ac6d5','#d4ab90','#e2b1d2','#af9ddd'];
  return `<div class="aid-inspector-card"><div class="aid-subheading">Welcher Geruch?</div>
    <p class="aid-microcopy">Die acht Kanäle entsprechen den Geruchsrezeptoren des Aquariums.</p>
    <div class="aid-scent-compass"><div class="aid-scent-center">Duft</div>
    ${SCENTS.map((name,i)=>{
      const a=2*Math.PI*i/SCENTS.length-Math.PI/2,
        left=50+38*Math.cos(a),top=50+38*Math.sin(a),
        [u,v]=scentPoint(i),chosen=Math.hypot(u-g.q1,v-g.q2)<.12;
      return `<button type="button" data-scent="${i}" title="${name}"
        class="aid-scent-dot ${chosen?'active':''}" style="left:${fmt(left)}%;top:${fmt(top)}%;
        --scent:${colours[i]}"><span>${name}</span></button>`;
    }).join('')}</div></div>`;
}

function fieldWidthPicker(g) {
  return `<div class="aid-inspector-card"><div class="aid-subheading">Wahrnehmungsfeld</div>
    <p class="aid-microcopy">Die Ausdehnung ist als Leuchten am Fisch dargestellt.</p>
    <div class="aid-field-options">
    ${[.08,.3,.5,.72,.95].map((width,i)=>`<button type="button" data-field-size="${width}"
      class="${Math.abs(g.field-width)<.13?'active':''}" title="${['Sehr eng','Eng','Mittel','Weit','Sehr weit'][i]}">
      <svg viewBox="0 0 66 45"><path d="M33 40L${fmt(33-30*width)} 5 Q33 ${fmt(18-20*width)}
        ${fmt(33+30*width)} 5Z" fill="#8acdc0" fill-opacity="${fmt(.2+.6*width)}"
        stroke="#b6dec5"/></svg><small>${['Mini','Eng','Mittel','Weit','Max'][i]}</small></button>`).join('')}
    </div></div>`;
}

function hormoneCurve(r,effect,substance) {
  const response=c=>Math.max(-1,Math.min(1,r.baseline+r.sensitivity*c/(c+r.half)));
  const points=Array.from({length:51},(_,i)=>{
    const c=i/50;return [12+c*255,73-52*response(c)];
  });
  const path=points.map(([x,y],i)=>`${i?'L':'M'}${fmt(x)} ${fmt(y)}`).join(' ');
  return `<div class="aid-dose-curve" data-hormone-curve="1" tabindex="0"
    aria-label="Hormon-Wirkungskurve, durch Ziehen verändern">
    <svg viewBox="0 0 285 155" role="img" aria-label="Rezeptorantwort je Stoffkonzentration">
      ${effect===6?'<rect x="12" y="21" width="255" height="26" fill="#b65e6850"/>'+
        '<line x1="12" y1="47" x2="269" y2="47" stroke="#e9b4af" stroke-width="1.4" stroke-dasharray="5 4"/>':''}
      <path d="M12 21V125H269" stroke="#5e8685" fill="none"/>
      <path d="M12 73H269" stroke="#355c61" stroke-dasharray="4 6"/>
      <path d="${path}" fill="none" stroke="#c9dba4" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${fmt(12+r.half*255)}" cy="${fmt(73-52*response(r.half))}"
        r="6" fill="#e8cd98"/>
      <text x="12" y="145" fill="#9dc1bc" font-size="10">${substance===4?'jung':'wenig Stoff'}</text>
      <text x="269" y="145" text-anchor="end" fill="#9dc1bc" font-size="10">${substance===4?'reif':'viel Stoff'}</text>
    </svg>${effect===6?'<small>Rot: Antwort oberhalb der Zelltodschwelle (0,5). Die Zelle stirbt dauerhaft.</small>':''}</div>`;
}

export function hormoneInspector(plan, requested, g, effect, selectedIndex) {
  const available=activeSubstances(plan),substance=
    requested===4?4:available.includes(requested)?requested:available[0]??null;
  const chips=available.map(i=>`<button data-hormone-select="${i}"
    class="${substance===i?'active':''}" style="--hue:${HORMONE_COLORS[i]}">
      <span>●</span>${esc(substanceName(plan,i))}</button>`).join('');
  const adding=available.length<4?
    '<button data-action="hormone-add" class="aid-add-substance">＋ Stoff hinzufügen</button>':'';
  if(substance==null) return `<div class="aid-inspector-eyebrow">HORMON-ATELIER</div>
    <h2 class="aid-inspector-name">Botenstoffe</h2>
    <div class="aid-inspector-card aid-hormone-empty">
      <p>Du kannst bis zu vier eigene Botenstoffe einrichten und ihre Wirkung
      mit Rezeptoren an den Zellgruppen bestimmen.</p>
      ${adding}
    </div><div class="aid-inspector-card">
      <div class="aid-subheading">Reife</div>
      <p class="aid-microcopy">Die Körperreife ist ein körpereigenes Signal.
      Sie steigt mit dem Wachstum und kann ebenfalls Rezeptoren ansprechen.</p>
      <button data-hormone-select="4">Reife-Rezeptoren ansehen</button>
    </div>`;
  const producers=plan.groups.map((cell,i)=>({cell,i}))
      .filter(({cell})=>releasedSubstance(cell)===substance);
  const targets=plan.groups.map((cell,i)=>({cell,i,strength:Math.max(0,
    ...cell.receptors.map((r,k)=>r.active&&effectSupported(cell.role,k)?
      hormoneAffinity(r,substance):0))})).filter(t=>t.strength>.16);
  const active=effectSupported(g?.role??0,effect)?effect:5,
    receptor=g?.receptors[active],matching=receptor?.active&&receptor.substance===substance;
  return `<div class="aid-inspector-eyebrow">HORMON-ATELIER</div>
    <h2 class="aid-inspector-name">Botenstoffe</h2>
    <div class="aid-inspector-card">
      <div class="aid-hormone-palette">${chips}${adding}</div>
      <button data-hormone-select="4" class="aid-maturity-pick
        ${substance===4?'active':''}">◈ Reife <small>körpereigen</small></button>
    </div>
    <div class="aid-inspector-card aid-substance-detail" style="--hue:${HORMONE_COLORS[substance]}">
      <div class="aid-subheading">${substance===4?'Reife':esc(substanceName(plan,substance))}</div>
      ${substance<4?`<details class="aid-substance-utilities"><summary>Umbenennen / entfernen</summary>
        <label class="aid-field"><span>Name</span>
        <input id="aid-hormone-name" data-hormone-name="${substance}"
          maxlength="24" value="${esc(substanceName(plan,substance))}"></label>
         <button class="aid-substance-remove" data-hormone-delete="${substance}"
           ${producers.length||targets.length?'disabled title="Erst Drüsen und Rezeptoren lösen"':''}>
           Stoff entfernen</button></details>`:
        '<p class="aid-microcopy">Das Reifesignal steigt mit dem Wachstum.</p>'}
      <div class="aid-subheading">Produktion</div>
      ${substance===4?'<p class="aid-microcopy">Wachstum des Fisches</p>':
        producers.length?producers.map(({cell,i})=>
          `<button class="aid-hormone-location" data-select-group="${i}">◆ ${esc(cell.name)}</button>`).join(''):
          '<p class="aid-microcopy">Noch keine Drüse gibt diesen Stoff ab. Ziehe links eine Hormondrüse auf den Kopf.</p>'}
      <div class="aid-subheading">Rezeptorantworten</div>
      ${targets.length?targets.map(({cell,i,strength})=>
        `<button class="aid-hormone-location" data-hormone-target="${i}">
          ${esc(cell.name)} <small>${Math.round(strength*100)} %</small></button>`).join(''):
        '<p class="aid-microcopy">Noch keine Zellgruppe reagiert auf diesen Stoff.</p>'}
    </div>
    ${g?`<div class="aid-inspector-card aid-hormone-edit">
      <div class="aid-subheading">${esc(g.name)} · Rezeptoren</div>
      ${g.role===2&&g.function===9&&substance<4?`
        <div class="aid-hormone-production"><strong>Produktion der Drüse</strong>
          <button data-release="${substance}" class="${releasedSubstance(g)===substance?'active':''}">
            ${releasedSubstance(g)===substance?'✓ Gibt diesen Stoff ab':'Diesen Stoff abgeben'}</button>
        </div>`:''}
      <div class="aid-subheading">Antwort auf ${esc(substanceName(plan,substance))}</div>
      <div class="aid-effect-buttons">
        ${EFFECTS.map((label,i)=>!effectSupported(g.role,i)?'':
          `<button data-hormone-toggle="${i}"
            class="${g.receptors[i].active&&g.receptors[i].substance===substance?'active':''}
              ${active===i?'current':''}" title="${esc(EFFECT_HELP[i])}">
            <span>${g.receptors[i].active&&g.receptors[i].substance===substance?'●':'○'}</span>
            ${esc(label)}</button>`).join('')}
      </div>
      ${matching?`<p class="aid-microcopy">${esc(EFFECT_HELP[active])}</p>
        <div class="aid-direction">
          <button data-effect-direction="1" class="${receptor.sensitivity>=0?'active':''}">Verstärken</button>
          <button data-effect-direction="-1" class="${receptor.sensitivity<0?'active':''}">Dämpfen</button>
        </div>
        ${hormoneCurve(receptor,active,substance)}
        <div class="aid-subheading">Stoffprofil dieses Rezeptors</div>
        <div class="aid-affinity-map">${HORMONE_COLORS.map((colour,i)=>{
          const strength=hormoneAffinity(receptor,i);
          return `<div style="--hue:${colour};--amount:${fmt(strength)}"
            title="${esc(substanceName(plan,i))}: ${Math.round(strength*100)} %">
            <i></i><small>${esc(substanceName(plan,i))}</small></div>`;
        }).join('')}</div>
        <div class="aid-choice-row">${[[.1,'Gezielt'],[.4,'Tolerant'],[.9,'Breit']].map(([v,t])=>
          `<button data-receptor-width="${v}"
            class="${Math.abs(receptor.width-v)<.16?'active':''}">${t}</button>`).join('')}</div>`:
        '<p class="aid-microcopy">Wähle eine Rezeptorwirkung. Die Antwort lässt sich anschließend als Kurve formen.</p>'}
    </div>`:
    '<div class="aid-inspector-card"><p>Wähle eine Zellgruppe im Fisch, um ihre Rezeptoren für diesen Stoff einzustellen.</p></div>'}`;
}

function eyeSpectrumPicker(g) {
  const hues=['#ee7771','#edba78','#e3e98d','#83d598','#80cfd3','#879de0','#b48cd6','#dc9dbd'],
    centre=(g.q1+1)*3.5;
  return `<div class="aid-inspector-card aid-spectrum">
    <div class="aid-subheading">Farben, die diese Sehzellen erkennen</div>
    <div class="aid-spectrum-wheel">
      ${hues.map((colour,i)=>{
        const distance=Math.abs(i-centre),share=Math.exp(-distance*distance/(.1+g.qwidth*22));
        return `<button type="button" data-hue="${i}" class="${i===Math.round(centre)?'active':''}"
          style="--hue:${colour};--spectrum-weight:${fmt(.2+.8*share)}"
          title="Farbbereich ${i+1}: ${Math.round(share*100)} %">
          <span></span></button>`;
      }).join('')}
    </div>
    <label class="aid-spectrum-range" for="aid-spectrum-width">
      <span>Enger Farbbereich</span><strong>Spektrumsbreite</strong><span>Viele Farben</span>
    </label>
    <input id="aid-spectrum-width" type="range" min="0" max="1" step=".01"
      value="${fmt(g.qwidth)}" data-spectrum-slider="1"/>
    <div class="aid-subheading">Reaktion auf andere Farben</div>
    <div class="aid-eye-contrast-options">
      ${[[-1,'Licht sammeln','◉'],[0,'Farben trennen','◑'],
        [1,'Gegenfarben dämpfen','◕']].map(([v,label,icon])=>
          `<button data-eye-contrast="${v}" class="${Math.abs(g.q2-v)<.2?'active':''}">
            <b aria-hidden="true">${icon}</b><small>${label}</small></button>`).join('')}
    </div>
    <p class="aid-microcopy">Die Gegenfarb-Hemmung der Engine wird von links nach rechts stärker.</p>
  </div>`;
}

function proximityPicker(g) {
  return `<div class="aid-inspector-card"><div class="aid-subheading">In welcher Entfernung reagiert es?</div>
    <div class="aid-choice-row">${[[-1,'Ganz nah'],[0,'Mittel'],[1,'Früher']].map(([v,t])=>
      `<button data-proximity-range="${v}" class="${Math.abs(g.q2-v)<.2?'active':''}">${t}</button>`).join('')}</div>
    <p class="aid-microcopy">Der leuchtende Umkreis zeigt die entsprechende Reichweite schematisch.</p></div>`;
}

function contactPreferences(g) {
  return `<div class="aid-inspector-card">
    <div class="aid-subheading">Wie entstehen Kontakte?</div>
    <div class="aid-contact-radar">
      <span class="aid-contact-radar-core"></span>
      <span class="aid-contact-radar-halo" style="width:${35+g.range*55}%;height:${35+g.range*55}%"></span>
      <span class="aid-contact-radar-target" style="width:${12+g.sigma*120}%;height:${12+g.sigma*120}%"></span>
      <small>Signalumkreis</small>
    </div>
    <span class="aid-microcopy">Räumliche Reichweite</span>
    <div class="aid-choice-row">${[[.2,'Nah'],[.65,'Mittel'],[1,'Weit']].map(([v,t])=>
      `<button data-contact-range="${v}" class="${Math.abs(g.range-v)<.19?'active':''}">${t}</button>`).join('')}</div>
    <span class="aid-microcopy">Treffsicherheit der Empfangsadresse</span>
    <div class="aid-choice-row">${[[.08,'Gezielt'],[.3,'Tolerant'],[.7,'Breit']].map(([v,t])=>
      `<button data-contact-sigma="${v}" class="${Math.abs(g.sigma-v)<.12?'active':''}">${t}</button>`).join('')}</div>
    <span class="aid-microcopy">Kontakte zwischen Körperseiten</span>
    <div class="aid-choice-row">${[[-.7,'Gleiche Seite'],[0,'Beide'],[.7,'Gegenseite']].map(([v,t])=>
      `<button data-contact-crossing="${v}" class="${Math.abs(g.crossing-v)<.19?'active':''}">${t}</button>`).join('')}</div>
  </div>`;
}

function breedingOptions(g) {
  const categories=[['reaction','Reaktion'],['contacts','Kontakte'],
    ...(g.role===0?[['perception','Wahrnehmung']]:[]),
    ...(g.role===1?[['learning','Lernen']]:[]),
    ['hormones','Hormonantwort']];
  return `<details class="aid-breeding-options">
    <summary>Für spätere Evolution vormerken
      <span>${categories.filter(([key])=>g.evolution?.[key]).length} ausgewählt</span></summary>
    <p>Welche Eigenschaften sollen bei der künftigen Zucht gezielt optimiert werden?</p>
    <div class="aid-breeding-choices">${categories.map(([key,label])=>
      `<button data-breed="${key}" class="${g.evolution?.[key]?'active':''}">
        ${g.evolution?.[key]?'✓ ':'○ '}${label}</button>`).join('')}</div>
    <p class="aid-microcopy">Diese Auswahl wird im Fischentwurf gespeichert. Eine gezielte
      Optimierung findet erst mit der späteren Zuchtstation statt; sie wird noch nicht im
      Genom codiert.</p>
  </details>`;
}

export function connectionInspector(plan,connection) {
  const source=plan.groups[connection?.from],target=plan.groups[connection?.to];
  if(!source||!target)return '';
  const chance=contactLikelihood(source,target),branchCount=plan.groups
    .filter(g=>g!==source&&contactLikelihood(source,g)>.25).length;
  return `<div class="aid-inspector-eyebrow">VERBINDUNG AUSGEWÄHLT</div>
    <h2 class="aid-inspector-name">Signalweg</h2>
    <div class="aid-inspector-card aid-connection-focus">
      <div class="aid-connection-pair">
        <button data-select-group="${connection.from}">${organIconSvg(source,27)}
          <span>${esc(source.name)}<small>Sender</small></span></button>
        <span class="aid-connection-direction" style="color:${source.sign<0?'#d9a5c3':'#92d4b3'}">→</span>
        <button data-select-group="${connection.to}">${organIconSvg(target,27)}
          <span>${esc(target.name)}<small>Empfänger</small></span></button>
      </div>
      <div class="aid-connection-facts"><span>Kontaktchance</span>
        <strong>${Math.round(chance*100)} %</strong></div>
      <div class="aid-connection-meter"><i style="width:${Math.round(chance*100)}%;
        background:${source.sign<0?'#d9a5c3':'#92d4b3'}"></i></div>
      <p class="aid-microcopy">Die Engine bildet einzelne Synapsen anhand der passenden
      Sende- und Empfangsadressen und der räumlichen Entfernung.</p>
      ${branchCount>1?`<p class="aid-microcopy">Dieses Signal erreicht momentan
        ${branchCount} passende Zellgruppen. Die Wege teilen sich denselben Sender.</p>`:''}
      <button data-action="disconnect" class="aid-disconnect">Verbindung lösen</button>
    </div>

    ${contactPreferences(target)}
    <button data-action="wire-source-change" class="aid-primary">Neue Quelle wählen</button>`;
}

function pigmentInspector(g) {
  const hue=Math.round(210+g.q1*145);
  return `<div class="aid-inspector-card aid-pigment-editor">
    <div class="aid-subheading">Hautfarbe</div>
    <div class="aid-pigment-pair">
      <div style="--pigment:hsl(${hue} 64% 44%);--shade:.14"><span>In Ruhe</span></div>
      <div style="--pigment:hsl(${hue} 64% 44%);--shade:.8"><span>Bei Aktivierung</span></div>
    </div>
    <label class="aid-field"><span>Farbton</span>
      <input type="range" min="-1" max="1" step=".02" data-prop="q1"
        value="${fmt(g.q1)}" style="--hue:${hue}" aria-label="Farbton der Pigmentzellen"></label>
    <label class="aid-field"><span>Farbbereich</span>
      <input type="range" min="0" max="1" step=".02" data-prop="qwidth"
        value="${fmt(g.qwidth)}" aria-label="Breite des Farbspektrums"></label>
    <small>Die Engine nutzt in Ruhe und bei Erregung dasselbe Farbspektrum.
      Die Aktivität verändert seine Stärke.</small>
  </div>`;
}
export function fishControls(g,plan,layer,effect,selected) {
  if(!g) return `<div class="aid-inspector-empty"><span>◉</span><h3>Am Fisch arbeiten</h3>
    <p>Ziehe ein Bauteil von links an einen farbig markierten Entwicklungsort. Um Verbindungen zu zeichnen,
    wähle oberhalb des Fisches „Verschalten“.</p>
    <p>Mit dem Mausrad kannst du die Ansicht vergrößern.</p></div>`;
  const actual=g.role===0?SENSES[g.function]:g.role===2?MOTORS[g.function]:
    ({relay:'Schaltkreis',inhibit:'Hemmkreis',learn:'Lernzentrum',pace:'Taktgeber',
      modulate:'Modulationskreis'}[g.nervePreset]||'Schaltkreis');
  const organParts=g.bundle?plan.groups.map((item,i)=>item.bundle===g.bundle?{item,i}:null)
    .filter(Boolean):[],
    gameteName=organParts.find(({item})=>item.function===3)?
      'Ei-Organ':'Spermienorgan';
  const connected=plan.groups.map((other,i)=>({other,i,p:contactLikelihood(g,other)}))
    .filter(x=>x.i!==selected&&x.p>.25).sort((a,b)=>b.p-a.p).slice(0,4);
  const copies=`<div class="aid-inspector-card">
    <div class="aid-subheading">Zellen je Entwicklungsort</div>
    <div class="aid-cell-count"><div class="aid-cell-cluster-grid">
      ${Array.from({length:g.copies},()=>'<i aria-hidden="true"></i>').join('')}
    </div><strong id="aid-copies-count">${g.copies} von 16</strong></div>
    <input type="range" min="1" max="16" step="1" value="${g.copies}"
      id="aid-cell-count-slider" data-cell-count-slider="1"
      aria-label="Höchstzahl der Zellen je Entwicklungsort"/>
    <p class="aid-microcopy">Pro belegtem Ort können bis zu ${g.copies} Zellen entstehen.
      Die tatsächliche Zahl hängt von ihrer Entwicklung ab.</p>
  </div>`;
  const gland=g.role===2&&g.function===9?`<div class="aid-inspector-card">
    <div class="aid-subheading">Welchen Stoff gibt diese Drüse ab?</div>
    <div class="aid-substance-pills">${activeSubstances(plan).map(i=>{
      const [x,y]=hormonePoint(i),chosen=Math.hypot(g.q1-x,g.q2-y)<.3;
      return `<button data-release="${i}" class="${chosen?'active':''}">
        <span>●</span>${esc(substanceName(plan,i))}</button>`;
    }).join('')}</div><button data-layer="hormones">Botenstoffe & Rezeptoren ansehen ↗</button></div>`:'';
  return `<div class="aid-inspector-eyebrow">IM FISCH AUSGEWÄHLT</div>
    <h2 class="aid-inspector-name">${esc(organParts.length?gameteName:g.name)}</h2>
    <p class="aid-inspector-help">${esc(actual)} · ${esc(ZONES[g.zone])} · ${g.side===0?'beidseitig':g.side<0?'links':'rechts'}</p>
    ${organParts.length?`<div class="aid-inspector-card aid-organ-components">
      <div class="aid-subheading">Zentren des Organs</div>
      ${organParts.map(({item,i})=>`<button data-inspect-group="${i}"
        class="${i===selected?'active':''}">${organIconSvg(item,17)}
        ${esc(item.name)}</button>`).join('')}</div>`:''}
    <div class="aid-inspector-context">
      ${layer==='wires'?'Ziehe eine Verbindung vom Ausgang dieser Gruppe zum Empfänger.':
      layer==='hormones'?'Die markierten Rezeptoren bestimmen die Antwort auf die Stoffe.':
      layer==='learning'?'Lernen verändert die Synapsen dieser Zellgruppe.':
      'Verschiebe das Bauteil am Fisch; halte Umschalt für die Mehrfachauswahl.'}
    </div>
    <div class="aid-mini-actions"><button data-action="mirror-group">${g.side===0?'Einseitig setzen':'Auf beide Seiten spiegeln'}</button>
      <button data-action="save-module">Als Baugruppe sichern</button></div>
    ${gland}
    ${layer==='organs'&&g.role===2&&g.function===7?pigmentInspector(g):''}
    
    ${layer==='learning'&&g.role===1?learningPlane(g):''}
    ${layer==='organs'?responsePlane(g):''}
    ${layer==='organs'&&g.role===0&&g.function===2?scentCompass(g):''}
    ${layer==='organs'&&g.role===0&&![2,9,10].includes(g.function)?fieldWidthPicker(g):''}
    ${layer==='organs'&&g.role===0&&g.function===0?eyeSpectrumPicker(g):''}
    ${layer==='organs'&&g.role===0&&g.function===4?proximityPicker(g):''}
    ${layer==='organs'?copies:''}
    ${layer==='organs'&&g.role===1?learningPlane(g):''}
    ${layer==='organs'&&g.role===1?`<div class="aid-inspector-card">
      <div class="aid-subheading">Was geben diese Zellen weiter?</div>
      <div class="aid-choice-row"><button data-sign="1" class="${g.sign>=0?'active':''}">Erregung</button>
      <button data-sign="-1" class="${g.sign<0?'active':''}">Hemmung</button></div></div>`:''}
    ${layer==='wires'?`<div class="aid-inspector-card"><div class="aid-subheading">Mögliche Kontakte</div>
      <div class="aid-wire-targets">${connected.map(({other,i,p})=>`<button data-connect-to="${i}">
        ${esc(other.name)}<small>${Math.round(p*100)} %</small></button>`).join('')||'Ziehe einen Kontakt auf eine passende Gruppe.'}</div>
      <p class="aid-microcopy">Die Linien sind Kontaktwahrscheinlichkeiten. Einzelne Synapsen entstehen erst bei der Entwicklung.</p>
      <p class="aid-microcopy">Mehrere gezeichnete Eingänge teilen sich einen Empfangsbereich.
        Dadurch können zusätzliche Kontakte entstehen.</p>
    </div>`:''}
    ${layer==='wires'?contactPreferences(g):''}
    ${layer==='learning'&&g.role!==1?`<p class="aid-note">Gelernt wird an den Kontakten
      der Nervenzellen. Wähle dazu einen Schaltkreis im Fisch.</p>`:''}
    <div class="aid-inspector-card aid-naming"><label for="aid-part-name">Bauteilname</label>
      <input id="aid-part-name" data-prop="name" value="${esc(g.name)}"></div>
    ${breedingOptions(g)}`;
}

function allowedLink(a,b) {
  return a !== b && a.role !== 2 && b.role !== 0 && !(a.role === 0 && b.role === 2);
}
export function contactLikelihood(a,b) {
  if (!allowedLink(a,b)) return 0;
  const d = Math.hypot(a.sender1-b.receiver1,a.sender2-b.receiver2);
  const match = Math.exp(-d*d/(2*b.sigma*b.sigma));
  const [ax,ay] = bodyPosition(a), [bx,by] = bodyPosition(b);
  const distance = Math.hypot(ax-bx,ay-by)/730;
  const side = a.side && b.side ? Math.max(0,Math.min(1,1+(a.side===b.side?-1:1)*a.crossing)) : 1;
  return match * side * Math.exp(-distance/(.1+.9*a.range));
}

export function development(plan, report, stale) {
  const counts = plan.groups.map(g => SITES.filter(s => hasSite(g, s)).length);
  const collisions = SITES.filter(s => plan.groups.filter(g => hasSite(g, s)).length > 1).length;
  const measured = report && !stale;
  const checks=measured?report.checks:null;
  const requirements=[
    ['Wahrnehmung','sense','Mindestens ein funktionierendes Sinnesorgan'],
    ['Vortrieb','swim','Ein Schwanzmuskel für die Fortbewegung'],
    ['Nahrungsaufnahme','mouth','Ein Muskel zum Ansaugen von Nahrung'],
    ['Fortpflanzung','reproduction','Eier oder Spermien bilden und abgeben'],
    ['Nervenkontakte','connections','Mindestens eine entstandene Synapse'],
    ['Entwicklung im Budget','resources','Zell- und Synapsengrenzen eingehalten']
  ];
  const ready=measured&&report.viable&&checks?.connections&&!report.limited;
  return `<div class="aid-viewhead"><div><small>ENTWICKLUNG IN DER V019-ENGINE</small>` +
    `<h2>Was ist aus dem Entwurf geworden?</h2><p>Die Engine lässt das Gewebe wachsen ` +
    `und prüft die anatomischen Voraussetzungen für einen Start im Aquarium.</p></div></div>` +
    `<div class="aid-diagnostic-grid"><div><small>Bauteile</small><strong>${plan.groups.length}</strong></div>` +
    `<div><small>Belegte Entwicklungsplätze</small><strong>${counts.reduce((a,b)=>a+b,0)}</strong></div>` +
    `<div><small>Entwickelte Zellen</small><strong>${measured?report.neurons:'–'}</strong></div>` +
    `<div><small>Synapsen</small><strong>${measured?report.synapses:'–'}</strong></div></div>` +
    (collisions?`<p class="aid-verdict bad">${collisions} Plätze sind mehrfach belegt. `+
      `Verschiebe betroffene Bauteile im Fischbau.</p>`:'') +
    `<div class="aid-start-check"><div class="aid-check-head"><span>${ready?'✓':'◌'}</span>` +
      `<div><h3>${ready?'Anatomisch startfähig':measured?'Es fehlen noch Voraussetzungen':'Bereit zur Entwicklungsprüfung'}</h3>` +
      `<p>Diese Prüfung überprüft die Organe und Entwicklungsgrenzen. ` +
      `Ob ein Fisch Nahrung findet, sinnvoll steuert oder erfolgreich Nachkommen erzeugt, ` +
      `zeigt das Aquarium.</p></div></div>` +
      `<div class="aid-check-list">${requirements.map(([title,key,hint])=>{
        const value=key==='reproduction'?checks?.eggs||checks?.sperm:checks?.[key];
        return `<div class="aid-check-item ${measured?(value?'passed':'missing'):'pending'}">` +
          `<span>${measured?(value?'✓':'○'):'·'}</span><div><strong>${title}</strong><small>${hint}</small></div></div>`;
      }).join('')}</div></div>` +
    (measured&&report.diagnostic?`<p class="aid-verdict bad">${esc(report.diagnostic)}</p>`:'') +
    `<details class="aid-report-details"><summary>Alle Zellgruppen und Entwicklungszahlen ansehen</summary>` +
    `<div class="aid-report-table"><table><thead><tr><th>Bauteil</th><th>Orte</th><th>Zellen</th></tr></thead><tbody>` +
    plan.groups.map((g,i)=>`<tr><td><button class="aid-table-link" data-select-group="${i}">${esc(g.name)}</button></td>` +
      `<td>${measured?report.groups?.[i]?.sites??0:counts[i]}</td>` +
      `<td>${measured?report.groups?.[i]?.cells??0:'–'}</td></tr>`).join('') +
    '</tbody></table></div></details>' +
    `<button data-action="develop" class="aid-primary aid-inline-develop" ${!plan.groups.length?'disabled':''}>` +
      `${measured?'Erneut entwickeln':'Fisch entwickeln und prüfen'}</button>`;
}
