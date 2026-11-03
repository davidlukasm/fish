import {EFFECTS, EFFECT_HELP, MOTORS, PALETTE, SCENTS, SENSES, SITES, SUBSTANCES, ZONES,
  effectSupported, functionAtSite, hasSite, hormonePoint, iconPath, organColor,
  scentPoint, validSiteFor} from './studio_model.js';

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
  if (x < 130) return Math.max(12, (x-64)*1.06);
  if (x < 350) return 94;
  if (x < 510) return 94-(x-350)*.13;
  if (x < 650) return 73-(x-510)*.18;
  return Math.max(17,48-(x-650)*.24);
}
export function sitePosition(p, tool = {}) {
  if(tool.role===2 && functionAtSite(tool,p)===1 && p.zone===2 && p.w>=.99) {
    const front=p.u>=.5;
    return [front?365+(1-p.u)*125:545+(1-p.u)*120,
      200+p.side*(front?92+30*p.v:68+25*p.v)];
  }
  if(tool.role===2 && functionAtSite(tool,p)===0 && p.zone===3 && p.w>=.99)
    return [795+(1-p.u)*99,200+p.side*(21+60*p.v)];
  const x=zoneStart[p.zone]+zoneWidth[p.zone]*(1-p.u);
  return [x,200+p.side*bodyHalfWidth(x)*(.12+.70*p.w)];
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

export function developmentDots(plan, tool, exclude=-1) {
  if(!tool) return '';
  const positions = new Map();
  for(const p of SITES) {
    if(!validSiteFor(tool,p)) continue;
    const [x,y]=sitePosition(p,tool),key=`${Math.round(x)}:${Math.round(y)}`;
    const available=!plan.groups.some((g,i)=>i!==exclude&&hasSite(g,p));
    if(!positions.has(key)) positions.set(key,{x,y,zone:p.zone,side:p.side,free:0,used:0});
    positions.get(key)[available?'free':'used']++;
  }
  return [...positions.values()].map(p=>`<g class="aid-valid-site ${p.free?'free':'occupied'}"
    transform="translate(${fmt(p.x)} ${fmt(p.y)})"
    style="--tone:${organColor({...tool,function:functionAtSite(tool,p)})}">
    <circle r="8"/><circle r="3"/><title>${esc(ZONES[p.zone])}, ${p.side<0?'links':'rechts'} ·
      ${p.free?p.free+' freie Entwicklungsorte':'alle Tiefenlagen belegt'}</title></g>`).join('');
}

function fishWires(plan, selected, layer, report, zoom=1) {
  if(layer!=='wires' && layer!=='learning') return '';
  const edges=[],measured=new Map((report?.contacts||[]).map(e=>[`${e[0]}:${e[1]}`,e[2]]));
  for(let i=0;i<plan.groups.length;i++) for(let j=0;j<plan.groups.length;j++) {
    const a=plan.groups[i],b=plan.groups[j];
    if(i===j||a.role===2||b.role===0||a.role===0&&b.role===2) continue;
    const chance=contactLikelihood(a,b),real=measured.get(`${i}:${j}`);
    if((real||0)<1&&chance<.24) continue;
    if(layer==='learning' && b.role!==1) continue;
    edges.push({i,j,chance,real});
  }
  edges.sort((a,b)=>(b.real||b.chance)-(a.real||a.chance));
  const focused=edges.filter(e=>e.i===selected||e.j===selected),
    surrounding=edges.filter(e=>e.i!==selected&&e.j!==selected)
      .slice(0,zoom>=2?110:28);
  return [...focused,...surrounding].map(({i,j,chance,real})=>{
    const a=plan.groups[i],b=plan.groups[j],[x,y]=bodyPosition(a),[u,v]=bodyPosition(b);
    const bend=Math.max(12,Math.abs(u-x)*.15),selectedEdge=i===selected||j===selected;
    const d=`M${fmt(x)} ${fmt(y)} Q${fmt((x+u)/2)} ${fmt((y+v)/2-bend)} ${fmt(u)} ${fmt(v)}`;
    return `<g class="aid-wire-pair" data-select-connection="${i}:${j}">
      <path class="aid-fish-wire-hit" d="${d}"/>
      <path class="aid-fish-wire ${a.sign<0&&a.role===1?'inhibit':''}
      ${selectedEdge?'selected':''}" d="${d}"
      stroke-width="${real?Math.min(4,1+Math.sqrt(real)/3):Math.max(1,2.5*chance)}"
      marker-end="url(#aid-wire-tip)"><title>${esc(a.name)} → ${esc(b.name)} ·
        ${real?real+' entwickelte Synapsen':'Kontaktchance ungefähr '+Math.round(chance*100)+' %'}</title></path></g>`;
  }).join('');
}

function fishHormones(plan, layer) {
  if(layer!=='hormones') return '';
  const colours=['#a6d8ae','#86d2d8','#edc48f','#c5a9e2'];
  let result='';
  plan.groups.forEach((a,i)=>{
    if(a.role!==2||a.function!==9) return;
    const substance=[0,1,2,3].reduce((best,k)=>{
      const [x,y]=hormonePoint(k),[u,v]=hormonePoint(best);
      return Math.hypot(a.q1-x,a.q2-y)<Math.hypot(a.q1-u,a.q2-v)?k:best;
    },0);
    const [x,y]=bodyPosition(a);
    plan.groups.forEach((b,j)=>{
      if(i===j||!b.receptors.some((r,k)=>r.active&&r.substance===substance&&effectSupported(b.role,k)))
        return;
      const [u,v]=bodyPosition(b),colour=colours[substance];
      result+=`<path class="aid-fish-hormone-wire" d="M${fmt(x)} ${fmt(y)}
        Q${fmt((x+u)/2)} ${fmt((y+v)/2-30)} ${fmt(u)} ${fmt(v)}"
        stroke="${colour}"><title>${esc(a.name)} gibt ${esc(SUBSTANCES[substance])} ab;
        ${esc(b.name)} besitzt einen passenden Rezeptor.</title></path>`;
    });
  });
  return result;
}

function fishPerception(plan,selected) {
  const g=plan.groups[selected];
  if(!g||g.role!==0) return '';
  if(g.function===0) {
    const hue=Math.round((g.q1+1)*180);
    return (g.side?[g.side]:[-1,1]).map(side=>{
      const [x,y]=bodyPosition(g,side),angle=side<0?-2.55:2.55,
        spread=(.2+g.field*1.65)/2,radius=165;
      const p=a=>[x+radius*Math.cos(a),y+radius*Math.sin(a)];
      const a=p(angle-spread),b=p(angle+spread);
      return `<path class="aid-sight-sector"
        style="--sight:hsl(${hue} 60% 71%)"
        d="M${fmt(x)} ${fmt(y)} L${fmt(a[0])} ${fmt(a[1])}
          A${radius} ${radius} 0 0 1 ${fmt(b[0])} ${fmt(b[1])}Z">
        <title>Sichtfeld, schematisch · Breite entspricht dem rezeptiven Feld</title></path>`;
    }).join('');
  }
  if(g.function===4||g.function===2||g.function===1) {
    const [x,y]=bodyPosition(g),r=30+(g.function===4?(g.q2+1)/2:g.field)*115;
    return `<circle class="aid-sense-field" cx="${fmt(x)}" cy="${fmt(y)}"
      r="${fmt(r)}"><title>Reichweite schematisch, abhängig vom rezeptiven Feld</title></circle>`;
  }
  return '';
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

export function fishCanvas(plan, selected, brush, report, options = {}) {
  const layer=options.layer||'organs',tool=options.toolOverride||(brush==null?null:PALETTE[brush]),
    zoom=options.zoom||1,centre=options.centre||[480,200],
    width=960/zoom,height=400/zoom,current=plan.groups[selected];
  const sites=layer==='organs'?developmentDots(plan,tool):'';
  const positioned=plan.groups.flatMap((g,i)=>(g.side?[g.side]:[-1,1]).map(side=>{
    const [x,y]=bodyPosition(g,side);return {g,i,side,x,y};
  }));
  const clusters=[];
  for(const marker of positioned) {
    const existing=clusters.find(cluster=>cluster.side===marker.side&&
      Math.hypot(cluster.x-marker.x,cluster.y-marker.y)<36/zoom);
    if(existing) {
      existing.items.push(marker);
      const n=existing.items.length;
      existing.x+=(marker.x-existing.x)/n;
      existing.y+=(marker.y-existing.y)/n;
    } else clusters.push({side:marker.side,x:marker.x,y:marker.y,items:[marker]});
  }
  const markers=clusters.map(cluster=>{
    if(cluster.items.length>1) {
      const chosen=cluster.items.some(m=>m.i===selected),n=cluster.items.length;
      if(zoom>=2.8) {
        const spread=24+3*n;
        return `<g class="aid-organ-spread">
          <circle class="aid-spread-anchor" cx="${fmt(cluster.x)}" cy="${fmt(cluster.y)}" r="8"/>
          ${cluster.items.map((m,k)=>{
            const a=2*Math.PI*k/n-Math.PI/2,
              x=cluster.x+Math.cos(a)*spread,y=cluster.y+Math.sin(a)*spread;
            return `<g>
              <path class="aid-spread-leader" d="M${fmt(cluster.x)} ${fmt(cluster.y)}L${fmt(x)} ${fmt(y)}"/>
              <g data-select-group="${m.i}" data-drag-body="${m.i}" role="button"
                tabindex="0" aria-label="${esc(m.g.name)}"
                class="aid-organ-marker ${m.i===selected?'selected':''}"
                transform="translate(${fmt(x)} ${fmt(y)})"
                style="--tone:${organColor(m.g)}">
                <circle class="aid-organ-glow" r="17"/>
                <circle class="aid-organ-disc" r="13"/>
                <path class="aid-marker-icon" d="${esc(iconPath(m.g))}" transform="translate(-8 -8) scale(.667)"/>
                <title>${esc(m.g.name)} · aus einem überlagerten Entwicklungsort aufgefächert</title>
              </g></g>`;
          }).join('')}</g>`;
      }
      return `<g data-zoom-cluster="${fmt(cluster.x)},${fmt(cluster.y)}"
        role="button" tabindex="0" class="aid-organ-cluster ${chosen?'selected':''}"
        transform="translate(${fmt(cluster.x)} ${fmt(cluster.y)})">
        <circle class="aid-cluster-halo" r="${19+Math.min(12,n*1.6)}"/>
        <circle class="aid-cluster-disc" r="${16+Math.min(8,n)}"/>
        <text text-anchor="middle" y="5">${n}</text>
        <title>${esc(cluster.items.slice(0,6).map(m=>m.g.name).join(' · '))}
          ${n>6?' und weitere':''} · zum Hineinzoomen klicken</title></g>`;
    }
    const {g,i,x,y}=cluster.items[0],selectedNode=i===selected,
      responding=layer==='hormones'&&g.receptors.some((r,k)=>r.active&&effectSupported(g.role,k)),
      receptor=g.receptors.find((r,k)=>r.active&&effectSupported(g.role,k)),
      chemical=['#a6d8ae','#86d2d8','#edc48f','#c5a9e2','#d5c58c'][receptor?.substance]||'#c5a9e2';
    return `<g data-select-group="${i}" data-drag-body="${i}" role="button"
      tabindex="0" aria-label="${esc(g.name)}" style="--tone:${organColor(g)}"
      class="aid-organ-marker ${selectedNode?'selected':''} ${responding?'reacting':''}
        ${options.multiSelected?.includes(i)?'multi':''}"
      transform="translate(${fmt(x)} ${fmt(y)})">
      <circle class="aid-organ-glow" r="${selectedNode?24:19}"/>
      <circle class="aid-organ-disc" r="${selectedNode?17:14}"/>
      ${responding?`<circle class="aid-hormone-responder" r="25" stroke="${chemical}"/>`:''}
      <path class="aid-marker-icon" d="${esc(iconPath(g))}" transform="translate(-8 -8) scale(.667)"/>
      ${layer==='learning'&&g.role===1?`<circle class="aid-learning-ring" r="23"
        stroke-dasharray="${fmt(g.qwidth*135)} 140"/>`:''}
      <title>${esc(g.name)} · ziehen zum Verschieben, im Modus „Verschalten“ verbinden</title>
    </g>`;
  }).join('');
  const currentPlace=current&&bodyPosition(current);
  return `<div class="aid-viewhead aid-canvas-intro"><div><small>ATELIER / AM FISCH ARBEITEN</small>
    <h2>Dein Fisch</h2><p>Ziehe Bauteile aus der linken Bibliothek auf den Körper. Die farbigen
    Punkte zeigen die passenden Entwicklungsorte.</p></div></div>
    <div class="aid-fish-toolbar" role="toolbar" aria-label="Werkzeuge am Fisch">
      ${[['organs','Organe setzen'],['wires','Verschalten'],['hormones','Hormone'],['learning','Lernen']].map(([id,label])=>
        `<button data-layer="${id}" class="${layer===id?'active':''}"
        type="button">${label}</button>`).join('')}
      <span class="aid-toolbar-gap"></span>
      <button data-zoom="out" title="Verkleinern" type="button">−</button>
      <output class="aid-zoom-value">${Math.round(zoom*100)} %</output>
      <button data-zoom="in" title="Vergrößern" type="button">＋</button>
      <button data-zoom="reset" title="Ganzen Fisch zeigen" type="button">Fit</button>
    </div>
    <div class="aid-body-stage" style="--brush-color:${tool?organColor(tool):'#8dcdbf'}">
      <div class="aid-stage-hint" id="aid-placement-status">${tool?
        `<strong>${esc(options.moduleName||tool.name)}</strong> · frei platzierbar, solange ausgewählt`:
        layer==='wires'?'Ziehe von einer Zellgruppe zur nächsten, um sie zu verbinden.':
        layer==='hormones'?'Farblinien: Drüse → Zellen mit passenden Rezeptoren':
        layer==='learning'?'Leuchtringe zeigen die Lernfähigkeit der Schaltkreise.':
        'Bauteile ziehen · Maus rad: Zoomen · Hintergrund ziehen: Verschieben'}</div>
      <svg id="aid-body-map" viewBox="${fmt(centre[0]-width/2)}
        ${fmt(centre[1]-height/2)} ${fmt(width)} ${fmt(height)}"
        role="group" aria-label="Fisch mit Entwicklungsorten, Geweben und Signalen">
        <defs><linearGradient id="aid-skin" x2="0" y2="1">
          <stop stop-color="#427f7d"/><stop offset=".48" stop-color="#285963"/>
          <stop offset="1" stop-color="#447f7b"/></linearGradient>
        <linearGradient id="aid-fin" x2="1" y2="0">
          <stop stop-color="#6faaa0" stop-opacity=".78"/>
          <stop offset="1" stop-color="#52817d" stop-opacity=".45"/></linearGradient>
        <marker id="aid-wire-tip" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
          orient="auto"><path d="M0 0 L7 3.5 L0 7Z" fill="#c2d6a0"/></marker></defs>
        <g class="aid-fish-art">
          <path class="aid-fin" data-place="fin" d="M359 145Q370 65 472 35Q474 103 428 140Z
            M359 255Q370 335 472 365Q474 297 428 260Z"/>
          <path class="aid-fin" data-place="fin" d="M529 143Q585 92 680 101L691 165Z
            M529 257Q585 308 680 299L691 235Z"/>
          <path class="aid-fin" data-place="tail" d="M771 177Q826 123 909 52
            L879 200 909 348Q827 277 771 223Z"/>
          <path class="aid-fishshape" data-place="body" d="M65 200 Q145 109 260 107
            C405 97 482 121 605 142 Q703 162 786 178 Q822 198 786 222
            Q703 238 605 258 C482 279 405 303 260 293 Q145 291 65 200Z"/>
          <path class="aid-fish-spine" d="M85 200Q420 198 790 200"/>
          <path class="aid-fish-line" d="M210 128Q480 133 754 182M210 272Q480 267 754 218"/>
          <path d="M75 196Q93 181 114 191M75 204Q93 219 114 209"
            fill="none" stroke="#c0e1ce" stroke-width="3"/>
          <ellipse cx="192" cy="153" rx="22" ry="15" class="aid-eye"/>
          <ellipse cx="192" cy="247" rx="22" ry="15" class="aid-eye"/>
          <circle cx="186" cy="153" r="7" class="aid-pupil"/>
          <circle cx="186" cy="247" r="7" class="aid-pupil"/>
          <g class="aid-fin-rays"><path d="M379 139L460 48 M395 144L466 80
            M379 261L460 352 M395 256L466 320 M806 175L899 72 M809 186L886 146
            M806 225L899 328 M809 214L886 254"/></g>
        </g>
        <path data-place="body" class="aid-body-hit" d="M65 200 Q140 105 260 100
          C405 89 482 113 605 135L809 170L830 200L809 230L605 265
          C482 287 405 311 260 300Q140 295 65 200Z"/>
        ${fishPerception(plan,selected)}
        <g class="aid-fish-wires">${fishWires(plan,selected,layer,report,zoom)}</g>
        <g class="aid-fish-hormones">${fishHormones(plan,layer)}</g>
        <g class="aid-development-sites" id="aid-development-sites">${sites}</g>
        <g class="aid-tissue-footprints">${tissueFootprints(plan,selected,zoom)}</g>
        <g class="aid-fish-markers">${markers}</g>
        ${currentPlace?`<text class="aid-selected-label" x="${fmt(currentPlace[0])}"
          y="${fmt(currentPlace[1]-32)}" text-anchor="middle">${esc(current.name)}</text>`:''}
        <g id="aid-place-preview" style="display:none" aria-hidden="true">
          <circle r="20" class="aid-preview-ring"/><circle r="11" class="aid-preview-center"/>
        </g>
        <path id="aid-wire-preview" class="aid-wire-preview" style="display:none" d=""/>
      </svg>
      <div class="aid-fish-trash" id="aid-trash" data-trash="1" title="Bauteil hier ablegen">♲
        <span>Entfernen</span></div>
    </div>
    <div class="aid-footnotes"><span>${report?report.neurons+' entwickelte Zellen':plan.groups.length+' Bauteile im Bauplan'}</span>
      <span>Die genaue Verschaltung entsteht beim Entwickeln aus den Kontaktregeln.</span></div>
    ${!plan.groups.length?'<p class="aid-note">Links findest du einzelne Zellen und vorverdrahtete Baugruppen. Beginne mit einer davon.</p>':''}`;
}

function responsePlane(g) {
  const x=Math.max(0,Math.min(1,(1-g.threshold)/2))*100,
    y=Math.max(0,Math.min(1,1-g.tau))*100;
  return `<div class="aid-inspector-card"><div class="aid-subheading">Wie schnell reagiert es auf Reize?</div>
    <p class="aid-microcopy">Setze den Punkt: waagrecht die Reizschwelle, senkrecht die Reaktionsgeschwindigkeit.</p>
    <div class="aid-response-pad" data-response-pad="1" role="slider" tabindex="0"
      aria-label="Reizschwelle und Reaktionsgeschwindigkeit">
      <span class="aid-pad-cross"></span><span class="aid-pad-handle" style="left:${x}%;bottom:${y}%"></span>
      <span class="aid-pad-edge left">Schwer auslösbar</span>
      <span class="aid-pad-edge right">Leicht auslösbar</span>
      <span class="aid-pad-edge top">Schnell</span>
      <span class="aid-pad-edge bottom">Träge</span>
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

function hormoneCurve(r) {
  const response=c=>Math.max(-1,Math.min(1,r.baseline+r.sensitivity*c/(c+r.half)));
  const points=Array.from({length:51},(_,i)=>{
    const c=i/50;return [12+c*255,73-52*response(c)];
  });
  const path=points.map(([x,y],i)=>`${i?'L':'M'}${fmt(x)} ${fmt(y)}`).join(' ');
  return `<div class="aid-dose-curve" data-hormone-curve="1" tabindex="0"
    aria-label="Hormon-Wirkungskurve, durch Ziehen verändern">
    <svg viewBox="0 0 285 155" role="img" aria-label="Rezeptorantwort je Stoffkonzentration">
      <path d="M12 21V125H269" stroke="#5e8685" fill="none"/>
      <path d="M12 73H269" stroke="#355c61" stroke-dasharray="4 6"/>
      <path d="${path}" fill="none" stroke="#c9dba4" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${fmt(12+r.half*255)}" cy="${fmt(73-52*response(r.half))}"
        r="6" fill="#e8cd98"/>
      <text x="12" y="145" fill="#9dc1bc" font-size="10">wenig Stoff</text>
      <text x="269" y="145" text-anchor="end" fill="#9dc1bc" font-size="10">viel Stoff</text>
    </svg><small>Ziehen: Empfindlichkeit und Stärke des Rezeptors verändern</small></div>`;
}

function hormoneOnFish(g,effect) {
  if(!g) return '';
  const active=effectSupported(g.role,effect)?effect:5,r=g.receptors[active];
  return `<div class="aid-inspector-card aid-hormone-panel"><div class="aid-subheading">Hormone an dieser Zellgruppe</div>
    <p class="aid-microcopy">Ein Stoff wirkt hier nur, wenn ein entsprechender Rezeptor aktiv ist.</p>
    <div class="aid-reaction-list">
    ${g.receptors.map((rr,i)=>effectSupported(g.role,i)?`<button type="button" data-effect="${i}"
      class="aid-reaction-row ${active===i?'selected':''}">
      <span class="aid-reaction-lamp ${rr.active?'on':''}"></span>
      <strong>${esc(EFFECTS[i])}</strong><small>${rr.active?SUBSTANCES[rr.substance]:'ohne Antwort'}</small>
    </button>`:'').join('')}</div>
    <div class="aid-subheading">${esc(EFFECTS[active])}</div>
    <p class="aid-microcopy">${esc(EFFECT_HELP[active])}</p>
    <div class="aid-substance-pills">
      <button data-receptor-off="1" type="button" class="${r.active?'':'active'}">Aus</button>
      ${SUBSTANCES.map((name,i)=>`<button type="button" data-substance="${i}"
        class="${r.active&&r.substance===i?'active':''}" style="--hue:${['#a6d8ae','#86d2d8','#edc48f','#c5a9e2','#d5c58c'][i]}">
        <span>●</span>${esc(name)}</button>`).join('')}
    </div>
    ${r.active?`<div class="aid-direction">
      <button data-effect-direction="1" class="${r.sensitivity>=0?'active':''}">Verstärken</button>
      <button data-effect-direction="-1" class="${r.sensitivity<0?'active':''}">Dämpfen</button>
    </div>${hormoneCurve(r)}`:''}
    <div class="aid-subheading">Feinabstimmung der Antwort</div>
    <span class="aid-microcopy">Grundwirkung, auch ohne Stoff</span>
    <div class="aid-choice-row">${[[-.5,'Dämpfend'],[0,'Neutral'],[.5,'Anregend']].map(([v,t])=>
      `<button data-hormone-baseline="${v}" class="${Math.abs(r.baseline-v)<.1?'active':''}">${t}</button>`).join('')}</div>
    <span class="aid-microcopy">Wie wählerisch bindet der Rezeptor?</span>
    <div class="aid-choice-row">${[[.1,'Präzise'],[.5,'Mittel'],[1,'Breit']].map(([v,t])=>
      `<button data-receptor-width="${v}" class="${Math.abs(r.width-v)<.16?'active':''}">${t}</button>`).join('')}</div>
  </div>`;
}

function eyeSpectrumPicker(g) {
  const hues=['#ee7771','#edba78','#e3e98d','#83d598','#80cfd3','#879de0','#b48cd6','#dc9dbd'],
    closest=Math.round((g.q1+1)*3.5);
  return `<div class="aid-inspector-card">
    <div class="aid-subheading">Was erkennt dieses Auge?</div>
    <p class="aid-microcopy">Die lichtempfindlichen Zellen lassen sich auf Farbbereiche abstimmen.</p>
    <div class="aid-spectrum-wheel">
      ${hues.map((colour,i)=>`<button type="button" data-hue="${i}"
        class="${i===closest?'active':''}" style="--hue:${colour}"
        title="Farbbereich ${i+1}"><span></span></button>`).join('')}
    </div>
    <div class="aid-subheading">Wie breit reagieren die Sehzellen auf Farben?</div>
    <div class="aid-choice-row">${[[.12,'Ein enger Bereich'],[.48,'Mehrere Farben'],[.93,'Breites Spektrum']].map(([v,t])=>
      `<button data-spectrum-width="${v}" class="${Math.abs(g.qwidth-v)<.17?'active':''}">${t}</button>`).join('')}</div>
    <div class="aid-subheading">Wie werden Farbunterschiede ausgewertet?</div>
    <div class="aid-choice-row">${[[-1,'Helligkeit'],[0,'Farbton'],[1,'Farbkontrast']].map(([v,t])=>
      `<button data-eye-contrast="${v}" class="${Math.abs(g.q2-v)<.2?'active':''}">${t}</button>`).join('')}</div>
  </div>`;
}

function proximityPicker(g) {
  return `<div class="aid-inspector-card"><div class="aid-subheading">In welcher Entfernung reagiert es?</div>
    <div class="aid-choice-row">${[[-1,'Ganz nah'],[0,'Mittel'],[1,'Früher']].map(([v,t])=>
      `<button data-proximity-range="${v}" class="${Math.abs(g.q2-v)<.2?'active':''}">${t}</button>`).join('')}</div>
    <p class="aid-microcopy">Der leuchtende Umkreis zeigt die entsprechende Reichweite schematisch.</p></div>`;
}

function circuitPresets(g) {
  const active=g.nervePreset||(g.pace>.7?'pace':g.modulator>.7?'modulate':
    g.sign<0?'inhibit':g.qwidth>.65?'learn':'relay');
  return `<div class="aid-inspector-card"><div class="aid-subheading">Aufgabe des Schaltkreises</div>
    <p class="aid-microcopy">Alle bestehen aus v019-Nervenzellen. Die Startwerte legen fest, wie sie arbeiten.</p>
    <div class="aid-circuit-presets">
      ${[['relay','Signal weitergeben'],['inhibit','Hemmung'],['learn','Lernen'],
        ['pace','Rhythmus'],['modulate','Lehrsignal']].map(([id,name])=>
        `<button data-neuron-preset="${id}" class="${active===id?'active':''}">${name}</button>`).join('')}
    </div></div>`;
}

function contactPreferences(g) {
  return `<div class="aid-inspector-card">
    <div class="aid-subheading">Wie entstehen Kontakte?</div>
    <p class="aid-microcopy">Die Empfangsadresse wird durch gezeichnete Verbindungen gesetzt.
      Diese Regeln bestimmen, wie leicht passende Synapsen daraus entstehen.</p>
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

export function fishControls(g,plan,layer,effect,selected) {
  if(!g) return `<div class="aid-inspector-empty"><span>◉</span><h3>Am Fisch arbeiten</h3>
    <p>Ziehe ein Bauteil von links an einen farbig markierten Entwicklungsort. Um Verbindungen zu zeichnen,
    wähle oberhalb des Fisches „Verschalten“.</p>
    <p>Mit dem Mausrad kannst du die Ansicht vergrößern.</p></div>`;
  const actual=g.role===0?SENSES[g.function]:g.role===2?MOTORS[g.function]:
    ({relay:'Schaltkreis',inhibit:'Hemmkreis',learn:'Lernzentrum',pace:'Taktgeber',
      modulate:'Modulationskreis'}[g.nervePreset]||'Schaltkreis');
  const connected=plan.groups.map((other,i)=>({other,i,p:contactLikelihood(g,other)}))
    .filter(x=>x.i!==selected&&x.p>.25).sort((a,b)=>b.p-a.p).slice(0,4);
  const copies=g.role===2?'':`<div class="aid-inspector-card"><div class="aid-subheading">Größe der Zellgruppe</div>
    <div class="aid-cell-clusters">${[1,2,4,8,16].map(n=>`<button data-cell-count="${n}"
      class="${Math.abs(n-g.copies)<Math.max(1,n/3)?'active':''}">
      <span>${'●'.repeat(Math.min(n,8))}</span><small>${n}</small></button>`).join('')}</div>
    <p class="aid-microcopy">Die Engine verteilt diese Anzahl auf jeden gewählten Entwicklungsort.</p>
  </div>`;
  const gland=g.role===2&&g.function===9?`<div class="aid-inspector-card">
    <div class="aid-subheading">Welchen Stoff gibt diese Drüse ab?</div>
    <div class="aid-substance-pills">${SUBSTANCES.slice(0,4).map((name,i)=>{
      const [x,y]=hormonePoint(i),chosen=Math.hypot(g.q1-x,g.q2-y)<.3;
      return `<button data-release="${i}" class="${chosen?'active':''}">
        <span>●</span>${name}</button>`;
    }).join('')}</div></div>`:'';
  return `<div class="aid-inspector-eyebrow">IM FISCH AUSGEWÄHLT</div>
    <h2 class="aid-inspector-name">${esc(g.name)}</h2>
    <p class="aid-inspector-help">${esc(actual)} · ${esc(ZONES[g.zone])} · ${g.side===0?'beidseitig':g.side<0?'links':'rechts'}</p>
    <div class="aid-inspector-context">
      ${layer==='wires'?'Ziehe eine Verbindung vom Ausgang dieser Gruppe zum Empfänger.':
      layer==='hormones'?'Die markierten Rezeptoren bestimmen die Antwort auf die Stoffe.':
      layer==='learning'?'Lernen verändert die Synapsen dieser Zellgruppe.':
      'Verschiebe das Bauteil am Fisch; halte Umschalt für die Mehrfachauswahl.'}
    </div>
    <div class="aid-mini-actions"><button data-action="mirror-group">${g.side===0?'Einseitig setzen':'Auf beide Seiten spiegeln'}</button>
      <button data-action="save-module">Als Baugruppe sichern</button></div>
    ${gland}
    ${layer==='hormones'?hormoneOnFish(g,effect):''}
    ${layer==='learning'&&g.role===1?learningPlane(g):''}
    ${layer==='organs'?responsePlane(g):''}
    ${layer==='organs'&&g.role===0&&g.function===2?scentCompass(g):''}
    ${layer==='organs'&&g.role===0&&g.function!==2?fieldWidthPicker(g):''}
    ${layer==='organs'&&g.role===0&&g.function===0?eyeSpectrumPicker(g):''}
    ${layer==='organs'&&g.role===0&&g.function===4?proximityPicker(g):''}
    ${layer==='organs'?copies:''}
    ${layer==='organs'&&g.role===1?circuitPresets(g):''}
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
