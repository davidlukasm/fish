import {AVAILABLE_MOTORS, AVAILABLE_SENSES, EFFECTS, EFFECT_HELP, MOTORS, PALETTE,
  ROLES, SCENTS, SENSES, SITES, SUBSTANCES, ZONES, effectSupported, hasSite,
  hormonePoint, scentPoint} from './studio_model.js';

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

export function rangeField(prop, label, g, min = -1, max = 1, step = .01, hint = '') {
  return `<label class="aid-range"><span>${esc(label)} <output>${fmt(g[prop])}</output></span>` +
    `<input data-prop="${prop}" type="range" min="${min}" max="${max}" step="${step}" value="${g[prop]}">` +
    (hint ? `<small>${esc(hint)}</small>` : '') + '</label>';
}
export function field(prop, label, g, {min = -1, max = 1, step = .01} = {}) {
  return `<label class="aid-field"><span>${esc(label)}</span>` +
    `<input data-prop="${prop}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(g[prop])}"></label>`;
}
export function choose(prop, label, g, options) {
  return `<label class="aid-field"><span>${esc(label)}</span>` +
    `<select data-prop="${prop}">${selectOptions(options, g[prop])}</select></label>`;
}

// A dorsal drawing. The engine's hidden vertical coordinate is chosen automatically;
// the editor places organs on its 360 actual sites but never asks users to pick a voxel.
export const zoneStart = [68, 185, 355, 620];
export const zoneWidth = [117, 170, 265, 161];
export function bodyHalfWidth(x) {
  if (x < 120) return Math.max(10, (x - 65));
  if (x < 355) return 58;
  if (x < 450) return 58 - (x - 355) * .065;
  if (x < 620) return 52 - (x - 450) * .076;
  return Math.max(17, 39 - (x - 620) * .14);
}
export function bodyPosition(g, side = g.side || -1) {
  const sites = SITES.filter(p => hasSite(g, p) && p.side === side);
  const n = sites.length || 1;
  const u = sites.reduce((s,p) => s + p.u, 0) / n || (g.u0 + g.u1)/2;
  const w = sites.length ? sites.reduce((s,p) => s + p.w, 0) / n : (g.w0+g.w1)/2;
  const x = zoneStart[g.zone] + zoneWidth[g.zone] * (1-u);
  const width = bodyHalfWidth(x);
  return [x, 200 + side * width * (.12 + .65 * w)];
}

const iconFor = g => PALETTE.find(p => p.role === g.role && p.function === g.function)?.icon ||
  (g.role === 1 ? '✳' : '●');
const organColour = ['#91d9c6','#d9c48b','#e2a88c'];
export function anatomy(plan, selected, brush, report) {
  const markers = plan.groups.map((g,i) => (g.side ? [g.side] : [-1,1]).map(side => {
    const [x,y] = bodyPosition(g,side), chosen = i === selected;
    return `<g data-select-group="${i}" data-drag-body="${i}" class="aid-organ-marker ${chosen ? 'selected' : ''}" ` +
      `transform="translate(${fmt(x)} ${fmt(y)})" tabindex="0" role="button" aria-label="${esc(g.name)}">` +
      `<circle class="aid-organ-glow" r="${chosen ? 25 : 19}" fill="${organColour[g.role]}"/>` +
      `<circle class="aid-organ-disc" r="${chosen ? 17 : 13}"/>` +
      `<text class="aid-organ-glyph" text-anchor="middle" y="5">${esc(iconFor(g))}</text>` +
      `<title>${esc(g.name)} · zum Auswählen klicken, zum Versetzen ziehen</title></g>`;
  }).join('')).join('');
  const current = plan.groups[selected], currentPlace = current && bodyPosition(current);
  const tool = brush && PALETTE[brush], counter = report ? `${report.neurons} Zellen entwickelt` :
    `${plan.groups.length} Bauteile gesetzt`;
  return `<div class="aid-viewhead"><div><small>FISCH ENTWERFEN / DRAUFSICHT</small>` +
    `<h2>Dein Fisch</h2><p>Wähle ein Bauteil und setze es direkt auf den Körper. ` +
    `Bereits gesetzte Organe kannst du verschieben.</p></div></div>` +
    `<div class="aid-body-stage"><div class="aid-stage-hint">${tool ? `Platziere <strong>${esc(tool.name)}</strong> im passenden Körperabschnitt` :
      '① Bauteil wählen · ② Auf den Fisch klicken'}</div>` +
    `<svg id="aid-body-map" viewBox="0 0 960 400" role="group" aria-label="Fisch von oben, anklickbare Organe und Körperflächen">` +
    `<defs><linearGradient id="aid-skin" x2="0" y2="1"><stop stop-color="#3a7678"/><stop offset=".5" stop-color="#1a4d57"/><stop offset="1" stop-color="#39777a"/></linearGradient>` +
    `<linearGradient id="aid-fin" x2="1" y2="0"><stop stop-color="#477f7b" stop-opacity=".8"/><stop offset="1" stop-color="#6ea69d" stop-opacity=".35"/></linearGradient></defs>` +
    `<g class="aid-fish-art"><path class="aid-fin" d="M360 153 Q362 86 452 56 Q453 111 423 149Z M360 247 Q362 314 452 344 Q453 289 423 251Z"/>` +
    `<path class="aid-fin" d="M535 146 Q579 94 662 126 L675 172Z M535 254 Q579 306 662 274 L675 228Z"/>` +
    `<path class="aid-fin" d="M775 182 Q824 135 908 84 L885 200 908 316 Q825 265 775 218Z"/>` +
    `<path class="aid-fishshape" d="M65 200 Q120 142 218 138 C316 131 358 137 450 148 ` +
    `Q635 161 790 178 Q817 191 790 222 Q635 239 450 252 ` +
    `C355 264 312 270 218 262 Q120 258 65 200Z"/>` +
    `<path class="aid-fish-spine" d="M86 200 Q400 197 784 200"/>` +
    `<path class="aid-fish-line" d="M214 147 Q420 151 755 187 M214 253 Q420 249 755 213"/>` +
    `<path d="M70 198 Q90 184 112 193 M70 202 Q90 216 112 207" stroke="#afd4c8" stroke-width="3" fill="none"/>` +
    `<path d="M153 180 L163 176 M153 220 L163 224" stroke="#a6c8be" stroke-width="3"/>` +
    `<ellipse cx="198" cy="165" rx="21" ry="13" class="aid-eye"/><circle cx="194" cy="165" r="7" class="aid-pupil"/>` +
    `<ellipse cx="198" cy="235" rx="21" ry="13" class="aid-eye"/><circle cx="194" cy="235" r="7" class="aid-pupil"/>` +
    `<g class="aid-fin-rays"><path d="M376 146L448 67 M393 151L450 92 M376 254L448 333 M393 249L450 308 ` +
    `M797 179L898 103 M800 190L887 160 M797 221L898 297 M800 210L887 240"/></g></g>` +
    `<path data-place="body" class="aid-body-hit" d="M65 200 Q120 132 218 125 ` +
    `C330 110 460 130 790 165 L858 200 790 235 C460 270 330 290 218 275 Q120 268 65 200Z"/>` +
    `${markers}` +
    (currentPlace ? `<text class="aid-selected-label" x="${fmt(currentPlace[0])}" y="${fmt(currentPlace[1]+(current.side<0?-36:43))}" text-anchor="middle">${esc(current.name)}</text>` : '') +
    `<text class="aid-side-label" x="20" y="91">LINKS</text><text class="aid-side-label" x="20" y="338">RECHTS</text>` +
    `</svg>${!plan.groups.length ? '<div class="aid-stage-empty">Noch keine Zellen. Such dir unten ein Organ aus.</div>' : ''}</div>` +
    `<div class="aid-footnotes"><span>${counter}</span><span>Die Engine legt die einzelnen Zellen beim Entwickeln an.</span></div>` +
    `<div class="aid-palette"><div class="aid-palette-heading"><h3>Bauteile</h3>` +
    `<span>${tool ? 'Klicke auf den Fisch · Esc beendet das Platzieren' : 'Ein Werkzeug wählen und auf den Körper setzen'}</span></div>` +
    `${[0,1,2].map(role => `<div class="aid-palette-row"><small>${['Sinnesorgane','Nervensystem','Muskeln & Organe'][role]}</small>` +
      `<div>${PALETTE.map((p,i) => p.role === role ? `<button data-tool="${i}" ` +
        `class="aid-tool ${brush === i ? 'active' : ''}" title="${esc(p.hint)}" type="button">` +
        `<span>${esc(p.icon)}</span>${esc(p.name)}</button>` : '').join('')}</div></div>`).join('')}</div>`;
}

const simpleSlider = (key, label, value, left, right, help) =>
  `<label class="aid-simple-slider"><span>${esc(label)}</span><input type="range" data-simple="${key}" ` +
  `min="0" max="1" step=".05" value="${fmt(value)}"><small>${esc(left)}<b>${esc(help)}</b>${esc(right)}</small></label>`;

export function anatomyControls(g) {
  if (!g) return `<div class="aid-inspector-empty"><span>✳</span><h3>Ein Fisch entsteht</h3>` +
    `<p>Unten findest du Augen, Muskeln, Nervenzellen und weitere Organe. ` +
    `Wähle eines aus und klicke auf den Körper.</p>` +
    `<button data-action="template">Beispielfisch ansehen</button></div>`;
  const allowed = g.role === 1 ? [[-1,'Signale verarbeiten']] :
    (g.role === 0 ? AVAILABLE_SENSES[g.zone].map(i=>[i,SENSES[i]]) :
      AVAILABLE_MOTORS[g.zone].map(i=>[i,MOTORS[i]]));
  const type = g.role === 0 ? SENSES[g.function] : g.role === 2 ? MOTORS[g.function] : 'Signale verarbeiten';
  const hint = PALETTE.find(p => p.role === g.role && p.function === g.function)?.hint ||
    'Diese Zellen verarbeiten die Signale anderer Zellgruppen.';
  return `<div class="aid-inspector-eyebrow">AUSGEWÄHLTES BAUTEIL</div>` +
    `<h2 class="aid-inspector-name">${esc(g.name)}</h2>` +
    `<p class="aid-inspector-help">${esc(hint)} · ${esc(ZONES[g.zone])}</p>` +
    `<div class="aid-inspector-card"><div class="aid-subheading">Wo sitzt es?</div>` +
    `<p class="aid-microcopy">Ziehe das Symbol auf dem Fisch an eine andere Stelle.</p>` +
    `<div class="aid-choice-row">${[[-1,'Links'],[1,'Rechts'],[0,'Beidseitig']].map(([n,label])=>
      `<button data-side="${n}" class="${g.side===n?'active':''}" type="button">${label}</button>`).join('')}</div></div>` +
    `<div class="aid-inspector-card"><div class="aid-subheading">${g.role===0?'Wie nimmt es Reize wahr?':
      g.role===1?'Wie arbeitet es?':'Wie wirkt es?'}</div>` +
    `${simpleSlider('strength', g.role===0?'Empfindlichkeit':g.role===1?'Grundaktivität':'Ansprechbarkeit',
      (1-g.threshold)/2,'Gering','Hoch','')}` +
    `${simpleSlider('speed','Reaktionsgeschwindigkeit',1-g.tau,'Ruhig','Schnell','')}` +
    `${simpleSlider('quantity',g.role===2?'Organstärke':'Zellmenge',(g.copies-1)/15,
      'Wenige','Viele',`${g.copies} Zellen / Ort`)}` +
    (g.role===1 ? `<div class="aid-subheading">Was gibt die Zelle weiter?</div>` +
      `<div class="aid-choice-row"><button data-sign="1" class="${g.sign>=0?'active':''}">Erregung</button>` +
      `<button data-sign="-1" class="${g.sign<0?'active':''}">Hemmung</button></div>` +
      `${simpleSlider('learning','Lernfähigkeit',g.qwidth,'Stabil','Veränderlich','')}` :
      g.role===0 ? `${simpleSlider('field','Wahrnehmungsbereich',g.field,'Eng','Weit','')}` : '') +
    (g.role===0 && g.function===2 ? `<div class="aid-subheading">Auf welchen Geruch reagieren?</div>` +
      `<div class="aid-choice-row aid-scent-row">${SCENTS.map((n,i)=>
        `<button data-scent="${i}" type="button" class="${Math.hypot(g.q1-scentPoint(i)[0],g.q2-scentPoint(i)[1])<.1?'active':''}">${n}</button>`).join('')}</div>` : '') +
    '</div>' +
    `<details class="aid-advanced"><summary>Weitere Einstellungen</summary>` +
      `<p>Diese Werte steuern die zugrunde liegende Entwicklungsvorschrift.</p>` +
      `<label class="aid-field"><span>Name</span><input data-prop="name" value="${esc(g.name)}" maxlength="60"></label>` +
      `<div class="aid-twocol">${choose('role','Zellart',g,namedOptions(ROLES))}` +
      `${choose('function','Aufgabe',g,allowed)}</div>` +
      `${choose('zone','Körperabschnitt',g,namedOptions(ZONES))}` +
      `<div class="aid-subheading">Gewebe im Körper</div>` +
      `<p>Die Draufsicht zeigt Breite und Länge. Eine zusätzliche Innen-/Außenlage steuert, ` +
      `wo die Zellen entstehen.</p>` +
      `<div class="aid-twocol">${field('u0','Längsposition Anfang',g,{min:0,max:1})}` +
      `${field('u1','Längsposition Ende',g,{min:0,max:1})}` +
      `${field('v0','Unterseite',g,{min:0,max:1})}${field('v1','Oberseite',g,{min:0,max:1})}` +
      `${field('w0','Innenposition',g,{min:0,max:1})}${field('w1','Außenposition',g,{min:0,max:1})}</div>` +
      rangeField('q1','Merkmalswert A',g) + rangeField('q2','Merkmalswert B',g) +
      (g.role===1 ? rangeField('mode','Art der Synapsenanpassung',g) +
        rangeField('pace','Eigenrhythmus',g) + rangeField('modulator','Lehrsignal',g) : '') +
    '</details>' +
    `<div class="aid-control-actions"><button data-action="duplicate">Gleiches Bauteil setzen</button>` +
    `<button data-action="remove" class="aid-danger">Entfernen</button></div>`;
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

function circuit(plan,selected,report,chemical=false) {
  const columns = [[],[],[]];
  plan.groups.forEach((g,i)=>columns[g.role].push(i));
  const height = Math.max(350,Math.max(...columns.map(c=>c.length))*66+120);
  const coords = new Map();
  columns.forEach((col,role)=>col.forEach((i,j)=>coords.set(i,[164+role*312,
    100+(j+.5)*(height-140)/col.length])));
  const measured = new Map((report?.contacts || []).map(e=>[`${e[0]}:${e[1]}`,e]));
  const possibilities = [];
  plan.groups.forEach((a,i)=>plan.groups.forEach((b,j)=>{
    if (!allowedLink(a,b)) return;
    const probability = contactLikelihood(a,b), actual = measured.get(`${i}:${j}`);
    if (report ? actual?.[2] : probability>.11)
      possibilities.push({i,j,probability,actual});
  }));
  possibilities.sort((a,b)=>(b.actual?.[2]||b.probability)-(a.actual?.[2]||a.probability));
  const lines = possibilities.filter(x=>x.i===selected||x.j===selected).slice(0,42).map(({i,j,probability,actual})=>{
    const [ax,ay]=coords.get(i), [bx,by]=coords.get(j), same=plan.groups[i].role===plan.groups[j].role;
    const d=same?`M${ax+103} ${ay} C${ax+175} ${ay-45} ${bx+175} ${by+45} ${bx+103} ${by}`:
      `M${ax+103} ${ay} C${ax+175} ${ay} ${bx-175} ${by} ${bx-103} ${by}`;
    const strength = actual ? Math.max(1.5,Math.min(6,1.4+Math.log2(1+actual[2]))) :
      Math.max(1.1,Math.min(4,probability*3));
    return `<path d="${d}" class="aid-flow-wire ${plan.groups[i].sign<0&&plan.groups[i].role===1?'negative':''}" ` +
      `stroke-width="${fmt(strength)}"><title>${esc(plan.groups[i].name)} → ${esc(plan.groups[j].name)} · ` +
      `${actual?actual[2]+' Synapsen':'erwartete Kontaktchance '+Math.round(probability*100)+' %'}</title></path>`;
  }).join('');
  const nodes=plan.groups.map((g,i)=>{
    const [x,y]=coords.get(i), active=i===selected;
    const effects=g.receptors.filter((r,k)=>r.active&&effectSupported(g.role,k)).length;
    const label=g.name.length>24?g.name.slice(0,23)+'…':g.name;
    return `<g class="aid-flow-group ${active?'selected':''}" data-select-group="${i}" ` +
      `role="button" tabindex="0" aria-label="${esc(g.name)}">` +
      `<rect x="${x-105}" y="${y-24}" rx="11" width="210" height="48"/>` +
      `<circle cx="${x-86}" cy="${y}" r="10" fill="${organColour[g.role]}"/>` +
      `<text x="${x-69}" y="${y+4}" class="aid-flow-label">${esc(label)}</text>` +
      `${chemical&&effects?`<circle cx="${x+91}" cy="${y-15}" r="8" fill="#b9af73"/>`+
        `<text x="${x+91}" y="${y-12}" text-anchor="middle" class="aid-flow-count">${effects}</text>`:''}` +
      `<title>${esc(g.name)} · ${esc(ROLES[g.role])}</title></g>`;
  }).join('');
  return `<div class="aid-circuit"><svg viewBox="0 0 960 ${height}" role="group" ` +
    `aria-label="Signalwege zwischen Sinneszellen, Nervenzellen und Muskeln">` +
    `${['WAHRNEHMUNG','VERARBEITUNG','WIRKUNG'].map((s,i)=>
      `<text class="aid-flow-colhead" x="${164+i*312}" y="36" text-anchor="middle">${s}</text>`).join('')}` +
    `<g class="aid-flow-edges">${lines}</g>${nodes}</svg></div>`;
}

export function contacts(plan,selected,report) {
  const g=plan.groups[selected];
  const pairs=(report?.contacts||[]).filter(e=>e[0]===selected||e[1]===selected);
  return `<div class="aid-viewhead"><div><small>SIGNALWEGE / GEHIRN</small><h2>Wer spricht mit wem?</h2>` +
    `<p>Sinne geben Informationen an Nervenzellen weiter. Diese steuern Muskeln und Organe. ` +
    `Wähle eine Gruppe, um ihre Kontakte zu sehen.</p></div></div>` +
    (g ? circuit(plan,selected,report) : `<div class="aid-empty"><span>↝</span><h2>Es fehlen noch Zellen</h2>` +
      `<p>Setze zuerst Bauteile auf deinen Fisch.</p><button data-tab="anatomy">Zum Fisch</button></div>`) +
    `<div class="aid-footnotes"><span>${report?'Tatsächlich entstandene Synapsen':'Mögliche Signalwege aus dem Bauplan'}</span>` +
    `<span>Gezeigt werden die Verbindungen von <strong>${esc(g?.name || '–')}</strong>.</span></div>` +
    (report&&g?`<div class="aid-circuit-results"><strong>${pairs.reduce((s,e)=>s+e[2],0)} Synapsen</strong>`+
      `<span>der gewählten Gruppe · entwickelt in der v019-Engine</span></div>`:'') +
    `<p class="aid-note">Der Bauplan legt fest, welche Zellgruppen einander finden können. ` +
    `Die Engine bildet daraus einzelne Synapsen. Auch ihre Entfernung im Körper spielt mit.</p>`;
}

export function contactsControls(plan,selected,report) {
  const g=plan.groups[selected];
  if(!g) return '<p>Setze zuerst Sinnesorgane, Nervenzellen oder Muskeln auf den Fisch.</p>';
  const outgoing=g.role!==2, choices=plan.groups.map((other,i)=>({other,i,
    src:outgoing?selected:i,dst:outgoing?i:selected})).filter(c=>allowedLink(plan.groups[c.src],plan.groups[c.dst]));
  const ordered=choices.sort((a,b)=>contactLikelihood(plan.groups[b.src],plan.groups[b.dst])-
    contactLikelihood(plan.groups[a.src],plan.groups[a.dst]));
  return `<div class="aid-inspector-eyebrow">SIGNALWEGE VON</div><h2 class="aid-inspector-name">${esc(g.name)}</h2>` +
    `<p class="aid-inspector-help">${outgoing?'Diese Gruppe kann Signale weitergeben.':'Diese Gruppe empfängt Befehle von Nervenzellen.'}</p>` +
    `<div class="aid-inspector-card"><div class="aid-subheading">${outgoing?'Wohin sollen Signale gehen?':'Von wem kommen Befehle?'}</div>` +
    `<p class="aid-microcopy">Ein Klick nähert die Kontaktadressen der beiden Gruppen an. ` +
    `Nach dem Entwickeln siehst du, wie viele Synapsen entstehen.</p>` +
    `<div class="aid-connection-targets">${ordered.slice(0,20).map(({other,i,src,dst})=>{
      const chance=contactLikelihood(plan.groups[src],plan.groups[dst]);
      const n=report?.contacts?.find(e=>e[0]===src&&e[1]===dst)?.[2];
      return `<button data-wire="${src}:${dst}" class="aid-target ${chance>.5?'linked':''}" type="button">` +
        `<span>${esc(other.name)}<small>${report?`${n||0} Synapsen`:chance>.5?'Kontakt wahrscheinlich':'Kontakt möglich'}</small></span>` +
        `<b>${chance>.5?'✓':'＋'}</b></button>`;
    }).join('')||'<p>Setze erst eine kompatible Zellgruppe auf den Fisch.</p>'}</div></div>` +
    `<div class="aid-inspector-card"><div class="aid-subheading">Kontaktbildung</div>` +
    `${simpleSlider('reach',outgoing?'Signalreichweite':'Räumliche Reichweite',g.range,
      'Nah','Weit','')}` +
    `${simpleSlider('search','Wie wählerisch beim Empfangen?',
      Math.log(g.sigma/.03)/Math.log(2/.03),'Sehr','Kaum','')}` +
    `<button data-tab="hormones" type="button">Lernen & Hormone ansehen ↗</button></div>` +
    `<details class="aid-advanced"><summary>Kontaktadressen im Genom</summary>` +
    `<p>Jede Gruppe sendet an einer Position im zweidimensionalen Adressraum ` +
    `und empfängt nahe ihrer zweiten Position.</p>` +
    `${rangeField('sender1','Sendeadresse X',g)}${rangeField('sender2','Sendeadresse Y',g)}` +
    `${rangeField('receiver1','Empfangsadresse X',g)}${rangeField('receiver2','Empfangsadresse Y',g)}` +
    `${rangeField('crossing','Kopplung der Körperseiten',g)}</details>`;
}

export function hormones(plan, selected, effect, report) {
  const g=plan.groups[selected];
  const colours=['#b2d0a0','#8bc8cd','#d9b68a','#c5b0d9'];
  const cards=SUBSTANCES.slice(0,4).map((name,i)=>{
    const releases=plan.groups.filter(x=>x.role===2&&x.function===9 &&
      Math.hypot(x.q1-hormonePoint(i)[0],x.q2-hormonePoint(i)[1])<.3).length;
    const receptors=plan.groups.reduce((n,x)=>n+x.receptors.filter((r,k)=>r.active&&
      r.substance===i&&effectSupported(x.role,k)).length,0);
    return `<div class="aid-chemical-card" style="--chemical:${colours[i]}"><span class="aid-chemical-orb"></span>` +
      `<strong>${esc(name)}</strong><small>${releases} Drüsen · ${receptors} Zellreaktionen</small></div>`;
  }).join('');
  const reactions=g ? g.receptors.map((r,i)=>({r,i})).filter(({i})=>effectSupported(g.role,i)) : [];
  return `<div class="aid-viewhead"><div><small>BLUTSIGNALE / LERNEN</small><h2>Hormone & Lernen</h2>` +
    `<p>Vier frei kombinierbare Signalstoffe. Ihre Wirkung entsteht erst durch die Empfänger ` +
    `der Zellen. Auch der Reifezustand kann als Signal dienen.</p></div></div>` +
    `<div class="aid-chemical-grid">${cards}</div>` +
    (g ? `<div class="aid-chemical-summary"><strong>${esc(g.name)}</strong>` +
      `<span>${reactions.filter(({r})=>r.active).length} aktive Reaktionen</span></div>` : '') +
    (g ? `<div class="aid-effect-cards">${reactions.map(({r,i})=>{
      const measured=report?.groups?.[selected]?.receptors?.[i];
      return `<button data-effect="${i}" class="aid-effect-card ${i===effect?'selected':''} ${r.active?'on':''}" type="button">` +
        `<span>${r.active?'●':'○'}</span><strong>${esc(EFFECTS[i])}</strong>` +
        `<small>${r.active?`${esc(SUBSTANCES[r.substance])} · ${r.sensitivity>=0?'verstärkt':'dämpft'}`:
          'Ohne besondere Hormonantwort'}</small>` +
        `${measured?`<em>${measured[0]} Zellen</em>`:''}</button>`;
    }).join('')}</div>` : '') +
    (g ? `<div class="aid-circuit-caption">${g.role===1?'Lernen verändert die Synapsen dieses Nervennetzes.':'Signale verändern die Aktivität einzelner Zellgruppen.'}</div>` +
      circuit(plan,selected,report,true) : `<p>Setze zuerst Bauteile auf den Fisch.</p>`) +
    `<p class="aid-note">Die Linien zeigen dieselben Kontaktwege wie in der Kontaktkarte. ` +
    `Hormone erreichen passende Rezeptoren über das Blut; ein Effekt kann dort Erregung, ` +
    `Lernen, Rhythmus oder eine andere Eigenschaft verändern.</p>`;
}

export function hormoneControls(g, effect) {
  if(!g) return '<p>Wähle eine Zellgruppe im Fischbau.</p>';
  const r=g.receptors[effectSupported(g.role,effect)?effect:5];
  const rec=(key,label,min,max,step)=>`<label class="aid-range"><span>${esc(label)} <output>${fmt(r[key])}</output></span>`+
    `<input data-rec-prop="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${r[key]}"></label>`;
  return `<div class="aid-inspector-eyebrow">HORMONANTWORT VON</div><h2 class="aid-inspector-name">${esc(g.name)}</h2>` +
    (g.role===2&&g.function===9?`<div class="aid-inspector-card"><div class="aid-subheading">Was schüttet die Drüse aus?</div>` +
      `<p class="aid-microcopy">Die vier Stoffe erhalten ihre Bedeutung durch die Rezeptoren anderer Zellen.</p>` +
      `<div class="aid-choice-row aid-substance-choice">${SUBSTANCES.slice(0,4).map((s,i)=>
        `<button data-release="${i}" type="button" class="${Math.hypot(g.q1-hormonePoint(i)[0],g.q2-hormonePoint(i)[1])<.3?'active':''}">`+
        `${esc(s)}</button>`).join('')}</div></div>`:'') +
    (g.role===1?`<div class="aid-inspector-card"><div class="aid-subheading">Lernen</div>` +
      `${simpleSlider('learning','Wie stark verändern sich Synapsen?',g.qwidth,
        'Kaum','Stark','')}</div>`:'') +
    `<div class="aid-inspector-card"><div class="aid-subheading">${esc(EFFECTS[effectSupported(g.role,effect)?effect:5])}</div>` +
    `<p class="aid-microcopy">${esc(EFFECT_HELP[effectSupported(g.role,effect)?effect:5])}</p>` +
    `<label class="aid-toggle"><input type="checkbox" data-rec-prop="active" ${r.active?'checked':''}> ` +
      `Auf einen Signalstoff reagieren</label>` +
    `<div class="aid-subheading">Welcher Stoff löst die Antwort aus?</div>` +
    `<div class="aid-choice-row aid-substance-choice">${SUBSTANCES.map((s,i)=>
      `<button data-substance="${i}" type="button" class="${r.substance===i?'active':''}">${esc(s)}</button>`).join('')}</div>` +
    `<div class="aid-subheading">Was tut das Signal?</div>` +
    `<div class="aid-choice-row"><button data-effect-direction="1" class="${r.sensitivity>=0?'active':''}">Verstärken</button>` +
    `<button data-effect-direction="-1" class="${r.sensitivity<0?'active':''}">Dämpfen</button></div>` +
    `${simpleSlider('effectPower','Stärke der Antwort',Math.abs(r.sensitivity),
      'Schwach','Stark','')}</div>` +
    `<details class="aid-advanced"><summary>Rezeptoreigenschaften</summary>` +
      `${rec('baseline','Grundwirkung',-1,1,.01)}` +
      `<label class="aid-field"><span>Halbsättigung</span><input data-rec-prop="half" ` +
      `type="number" value="${r.half}" min=".0003" max="1" step=".0001"></label>` +
      `${rec('width','Wie breit bindet der Rezeptor?',0,1,.01)}</details>`;
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
