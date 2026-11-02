import {EFFECTS, EFFECT_HELP, MOTORS, ROLES, SENSES, SITES, SUBSTANCES, ZONES,
  effectSupported, hasSite, hormonePoint} from './studio_model.js';

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

const zoneStart = [42, 198, 420, 671], zoneWidth = [156, 222, 251, 244];
function position(p) {
  const x = zoneStart[p.zone] + zoneWidth[p.zone] * (1 - p.u);
  const y = 176 + p.side * (20 + 61 * p.w) + (p.v - .5) * 19;
  return [x, y];
}

export function anatomy(plan, selected, layer, report) {
  const group = plan.groups[selected], occupied = SITES.map(p =>
    plan.groups.findIndex(g => hasSite(g, p)));
  const visible = SITES.map((p, index) => ({p, index})).filter(({p}) =>
    layer === 'all' || Math.abs(p.v - Number(layer)) < .19);
  const dots = visible.map(({p, index}) => {
    const [x, y] = position(p), owner = occupied[index];
    return `<circle data-site="${index}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" ` +
      `r="${owner === selected ? 5 : 3.3}" class="aid-site ${owner < 0 ? 'empty' : owner === selected ? 'chosen' : 'owned'}" ` +
      `data-owner="${owner}" tabindex="0"><title>Zone ${p.zone}, ${p.side < 0 ? 'links' : 'rechts'}, ` +
      `u=${fmt(p.u)} v=${fmt(p.v)} w=${fmt(p.w)}${owner >= 0 ? ' · ' + esc(plan.groups[owner].name) : ''}</title></circle>`;
  }).join('');
  const stats = report?.groups?.[selected], predicted = SITES.filter(p => hasSite(group, p)).length;
  return `<div class="aid-viewhead"><div><small>ANATOMIE / ENTWICKLUNGSRÄUME</small>` +
    `<h2>Körperkarte</h2><p>Jeder Punkt ist ein möglicher Entwicklungsort. Die gewählte Zellgruppe leuchtet auf.</p></div>` +
    `<label>Höhenschicht <select id="aid-layer">${selectOptions([
      ['all', 'Alle'], ['0', 'Unten'], ['0.333333', 'Unterer Kern'],
      ['0.666667', 'Oberer Kern'], ['1', 'Oben']
    ], layer)}</select></label></div>` +
    `<div class="aid-plot"><svg class="aid-bodymap" viewBox="0 0 960 356" role="img" aria-label="360 Entwicklungsorte in vier Körperzonen">` +
    `<defs><linearGradient id="aid-flesh" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3b6670" stop-opacity=".45"/><stop offset=".5" stop-color="#20535a" stop-opacity=".18"/><stop offset="1" stop-color="#3b6670" stop-opacity=".4"/></linearGradient></defs>` +
    `<path class="aid-fishshape" d="M27 174 Q74 113 177 109 C284 105 391 91 509 110 Q701 120 818 151 Q871 147 940 104 L923 176 940 247 Q870 205 818 197 Q702 228 509 237 C388 246 289 240 177 238 Q74 228 27 174Z"/>` +
    `<path d="M40 176H924" stroke="#46717a" stroke-width="1" stroke-dasharray="4 7"/>` +
    zoneStart.slice(1).map((x, i) => `<path d="M${x} 112V239" stroke="#b5c8b0" opacity=".27" stroke-dasharray="4 6"/>` +
      `<text x="${x - 6}" y="45" class="aid-zone-label" text-anchor="end">${i + 1}</text>`).join('') +
    ZONES.map((name, i) => `<text class="aid-zone-label" x="${zoneStart[i] + zoneWidth[i] / 2}" y="30" ` +
      `text-anchor="middle">${esc(name)}</text>`).join('') +
    `<text x="20" y="58" class="aid-side-label">LINKS</text><text x="20" y="320" class="aid-side-label">RECHTS</text>` +
    dots + '</svg></div>' +
    `<div class="aid-footnotes"><span><b>${occupied.filter(x => x >= 0).length}</b> / 360 Orte belegt</span>` +
    `<span>Gruppe: <b>${predicted}</b> mögliche Orte${stats ? ` · <b>${stats.sites}</b> entwickelt` : ''}</span>` +
    `<span><i class="aid-key chosen"></i> Auswahl <i class="aid-key owned"></i> andere <i class="aid-key empty"></i> frei</span></div>` +
    `<p class="aid-note">Klicke auf einen Punkt, um die ausgewählte Gruppe an diesen Ort zu setzen. ` +
    `Die Bereiche kannst du anschließend rechts wieder ausdehnen.</p>`;
}

export function anatomyControls(g) {
  const kinds = g.role === 0 ? namedOptions(SENSES) :
    g.role === 2 ? namedOptions(MOTORS) : [[-1, 'Keine · innere Verarbeitung']];
  return `<div class="aid-control-heading"><small>ZELLGRUPPE</small><h3>${esc(g.name)}</h3></div>` +
    `<label class="aid-field"><span>Name</span><input data-prop="name" value="${esc(g.name)}" maxlength="60"></label>` +
    `<div class="aid-twocol">${choose('role', 'Zellart', g, namedOptions(ROLES))}` +
    `${choose('function', 'Sinn / Organ', g, kinds)}</div>` +
    `${choose('zone', 'Körperabschnitt', g, namedOptions(ZONES))}` +
    `${choose('side', 'Körperseite', g, [[0, 'Beide'], [-1, 'Links'], [1, 'Rechts']])}` +
    `<div class="aid-subheading">Ausdehnung im Entwicklungsraster</div>` +
    `<div class="aid-twocol">${field('u0', 'Länge von', g, {min: 0, max: 1})}${field('u1', 'bis', g, {min: 0, max: 1})}` +
    `${field('v0', 'Höhe von', g, {min: 0, max: 1})}${field('v1', 'bis', g, {min: 0, max: 1})}` +
    `${field('w0', 'Außenlage von', g, {min: 0, max: 1})}${field('w1', 'bis', g, {min: 0, max: 1})}</div>` +
    `<div class="aid-subheading">Zelleigenschaften</div>` +
    `${field('copies', g.role === 2 ? 'Organgröße / 16' : 'Zellen je Ort', g, {min: 1, max: 16, step: 1})}` +
    rangeField('threshold', 'Schwelle', g) + rangeField('tau', 'Zeitkonstante', g, 0, 1) +
    rangeField('field', 'Dendritenfeld', g, 0, 1) +
    (g.role === 1 ? rangeField('sign', 'Erregung / Hemmung', g, -1, 1, .01, 'Positive Werte erregen, negative hemmen.') :
      `${rangeField('q1', 'Eigenschaft 1', g)}${rangeField('q2', 'Eigenschaft 2', g)}`) +
    `<div class="aid-control-actions"><button data-action="duplicate">Duplizieren</button>` +
    `<button data-action="remove" class="aid-danger">Entfernen</button></div>`;
}

const coord = x => 50 + (Number(x) + 1) * 177;
const coordY = y => 380 - (Number(y) + 1) * 155;
export function contacts(plan, selected, report) {
  const g = plan.groups[selected], x = coord(g.receiver1), y = coordY(g.receiver2);
  const receptors = g.receptors.map((r, i) => r.active && effectSupported(g.role, i) ? EFFECTS[i] : '')
    .filter(Boolean);
  const lines = plan.groups.map((s, i) => {
    const dx = s.sender1 - g.receiver1, dy = s.sender2 - g.receiver2,
      dist = Math.hypot(dx, dy);
    if (dist > Math.max(g.sigma * 2, .14)) return '';
    return `<path d="M ${coord(s.sender1)} ${coordY(s.sender2)} Q 225 210 ${x} ${y}" ` +
      `stroke="#92d8c7" stroke-width="${Math.max(.5, 3 * Math.exp(-dist * dist / (2 * g.sigma * g.sigma))).toFixed(2)}" ` +
      `opacity=".45" fill="none"/><title>${esc(s.name)} → ${esc(g.name)}</title>`;
  }).join('');
  const marks = plan.groups.map((s, i) => `<g class="aid-code-point${i === selected ? ' selected' : ''}" data-select-group="${i}">` +
    `<circle cx="${coord(s.sender1)}" cy="${coordY(s.sender2)}" r="${i === selected ? 7 : 4.5}" ` +
    `fill="#82d1c0"><title>Sendet: ${esc(s.name)}</title></circle>` +
    `<rect x="${coord(s.receiver1) - (i === selected ? 6 : 3)}" y="${coordY(s.receiver2) - (i === selected ? 6 : 3)}" ` +
    `width="${i === selected ? 12 : 6}" height="${i === selected ? 12 : 6}" rx="2" fill="#f2c386">` +
    `<title>Empfängt: ${esc(s.name)}</title></rect></g>`).join('');
  const relevant = (report?.contacts || []).filter(e => e[0] === selected || e[1] === selected)
    .sort((a, b) => b[2] - a[2]).slice(0, 12);
  return `<div class="aid-viewhead"><div><small>NEURONALE ADRESSEN</small><h2>Kontaktkarte</h2>` +
    `<p>Ein Sendecode trifft auf Empfangscodes in seiner Nähe. Daraus entstehen bei der Entwicklung Synapsen.</p></div></div>` +
    `<div class="aid-plot"><svg id="aid-contact-map" viewBox="0 0 510 426" role="img" aria-label="Zweidimensionale Kontaktkarte mit Sendern und Empfängern">` +
    `<rect x="47" y="64" width="360" height="315" rx="12" fill="#0d2a32" stroke="#355a63"/>` +
    `<path d="M225 64V379 M47 222H407" stroke="#496c73" stroke-dasharray="5 7"/>` +
    `<text x="45" y="45" fill="#8cb9c0">Kontaktadresse · Koordinate 2 ↑</text>` +
    `<text x="235" y="412" text-anchor="middle" fill="#8cb9c0">Koordinate 1 →</text>` +
    lines + marks +
    `<circle cx="${x}" cy="${y}" r="${Math.min(180, 177*g.sigma)}" fill="#f1c783" fill-opacity=".06" ` +
      `stroke="#f1c783" stroke-dasharray="5 5" pointer-events="none"/>` +
    `<circle id="aid-drag-receiver" data-drag-code="receiver" cx="${x}" cy="${y}" r="12" ` +
    `stroke="#f1c783" stroke-width="2" fill="#ad7b39" cursor="grab"><title>Empfangscode ziehen</title></circle>` +
    `<circle id="aid-drag-sender" data-drag-code="sender" cx="${coord(g.sender1)}" cy="${coordY(g.sender2)}" ` +
    `r="11" fill="#3f998d" stroke="#a0e3d4" stroke-width="2" cursor="grab"><title>Sendecode ziehen</title></circle>` +
    '</svg></div>' +
    `<div class="aid-footnotes"><span><i class="aid-key send"></i> Sendecode (Kreis)</span>` +
    `<span><i class="aid-key receive"></i> Empfangscode (Quadrat)</span><span>Zieh die großen Marker der gewählten Gruppe.</span></div>` +
    `<div class="aid-contacts-chemistry"><small>MODULATION DIESER KONTAKTE</small>` +
    `<span>Plastizität ${fmt(g.qwidth)} · ${receptors.length ? receptors.map(esc).join(' · ') : 'keine aktiven Rezeptoren'}</span>` +
    `<button data-tab="hormones" type="button">Hormone & Lernen bearbeiten ↗</button></div>` +
    `<div class="aid-contacts-result"><h3>Entwickelte Kontakte</h3>` +
    (report ? relevant.length ? relevant.map(e => `<div class="aid-contact-pair"><span>${esc(plan.groups[e[0]]?.name || '?')} ` +
      `→ ${esc(plan.groups[e[1]]?.name || '?')}</span><strong>${e[2]}</strong></div>`).join('') :
      '<p>Noch keine Kontakte dieser Gruppe.</p>' : '<p>Nach „Entwickeln“ siehst du hier die tatsächlich entstandenen Synapsen.</p>') + '</div>';
}

export function contactsControls(g) {
  return `<div class="aid-control-heading"><small>KONTAKTADRESSE</small><h3>${esc(g.name)}</h3></div>` +
    `<p class="aid-note">Die Zahlen sind Koordinaten in einem gemeinsamen Adressraum. ` +
    `Die Engine bildet die einzelnen Verbindungen daraus.</p>` +
    `<div class="aid-subheading">Wo sendet die Gruppe?</div>` +
    rangeField('sender1', 'Sendecode 1', g) + rangeField('sender2', 'Sendecode 2', g) +
    `<div class="aid-subheading">Wo empfängt sie?</div>` +
    rangeField('receiver1', 'Empfangscode 1', g) + rangeField('receiver2', 'Empfangscode 2', g) +
    `<div class="aid-subheading">Suchverhalten</div>` +
    rangeField('sigma', 'Kontaktbreite σ', g, .03, 2, .01, 'Größer = auch unähnliche Adressen erreichen.') +
    rangeField('crossing', 'Seitenkreuzung', g) +
    rangeField('range', 'Räumliche Reichweite', g, 0, 1) +
    `<div class="aid-subheading">Lernen an diesen Kontakten</div>` +
    rangeField('qwidth', 'Plastizität / Qualitätsbreite', g, 0, 1) +
    `<button data-tab="hormones" type="button">Rezeptoren & Lernkanäle ↗</button>` +
    `<p class="aid-note">Mit dem Diagramm steuerst du Verbindungswahrscheinlichkeiten und ` +
    `-stärken. Die genaue Synapsenzahl ergibt sich erst bei der Entwicklung.</p>`;
}

export function hormones(plan, selected, effect, report) {
  const g = plan.groups[selected], r = g.receptors[effect];
  const measured = report?.groups?.[selected]?.receptors?.[effect];
  const markers = SUBSTANCES.map((name, index) => {
    const [x, y] = hormonePoint(index), sx = 225 + x*146, sy = 215 - y*146;
    return `<g><circle cx="${sx}" cy="${sy}" r="${index === r.substance ? 26 : 19}" ` +
      `fill="${index === r.substance ? '#4a8f83' : '#193940'}" stroke="${index === r.substance ? '#b2e2c6' : '#46707b'}"/>` +
      `<text x="${sx}" y="${sy + 4}" text-anchor="middle" fill="#e4ede5" font-size="12">` +
      `${index === 4 ? 'R' : 'H' + index}</text><title>${esc(name)}</title></g>`;
  }).join('');
  const [gx, gy] = [225 + g.q1 * 146, 215 - g.q2 * 146];
  return `<div class="aid-viewhead"><div><small>MODULATION / PLASTIZITÄT</small>` +
    `<h2>Hormone & Lernen</h2><p>Vier freie Hormone und Reife als Signal. Welche Zelle worauf reagiert, steht im Genom.</p></div></div>` +
    `<div class="aid-hormone-switch">${EFFECTS.map((e, i) => `<button data-effect="${i}" class="${i === effect ? 'active' : ''}${effectSupported(g.role, i) ? '' : ' unsupported'}" ` +
      `type="button">${esc(e)}${g.receptors[i].active ? '<i>●</i>' : ''}</button>`).join('')}</div>` +
    `<div class="aid-plot aid-hormone-plot"><svg viewBox="0 0 500 430" role="img" aria-label="Stoffkarte der Hormone und Rezeptorwahl">` +
    `<circle cx="225" cy="215" r="146" stroke="#406b71" stroke-dasharray="5 7" fill="none"/>` +
    `<path d="M51 215H399 M225 39V391" stroke="#33565c" stroke-dasharray="3 7"/>` +
    markers + `<circle cx="${gx}" cy="${gy}" r="8" stroke="#e9bc80" stroke-width="2" fill="#b26d3f"/>` +
    `<text x="${gx + 12}" y="${gy - 11}" fill="#e9bc80" font-size="13">Ausgabe</text>` +
    `<text x="15" y="30" fill="#98b9b8">Stoffraum · Hormone, Reife und Drüsen-Signatur</text>` +
    '</svg></div>' +
    `<div class="aid-footnotes"><span>Aktive Wirkung: <strong>${EFFECTS[effect]}</strong></span>` +
    `<span>${!effectSupported(g.role, effect) ? 'Bei dieser Zellart nicht abgefragt' : r.active ? 'Rezeptor aktiv' : 'Rezeptor ausgeschaltet'}</span></div>` +
    (measured ? `<div class="aid-receptor-result"><small>TATSÄCHLICH ENTWICKELT</small>` +
      `<strong>${measured[0]} Rezeptoren</strong><span>Grundwirkung ${fmt(measured[1])} · ` +
      `Empfindlichkeit ${fmt(measured[2])} · K ${Number(measured[3]).toPrecision(3)} · ` +
      `Bindung ${fmt(measured[4])}</span></div>` :
      report ? `<p class="aid-note">Für diesen Zelltyp wurde kein solcher Rezeptor entwickelt.</p>` : '') +
    `<p class="aid-note">${esc(EFFECT_HELP[effect])} Die Farbe der Hormonpunkte ist eine Orientierung ` +
    `im Stoffraum. Das Hormon selbst besitzt keine zugewiesene Bedeutung.</p>`;
}

export function hormoneControls(g, effect) {
  const r = g.receptors[effect];
  const supported = effectSupported(g.role, effect);
  const rec = (key, label, min, max, step) => `<label class="aid-range"><span>${esc(label)} <output>${fmt(r[key])}</output></span>` +
    `<input data-rec-prop="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${r[key]}"></label>`;
  return `<div class="aid-control-heading"><small>WIRKUNGSKANAL ${effect + 1} / 7</small><h3>${esc(EFFECTS[effect])}</h3></div>` +
    `${!supported ? `<p class="aid-verdict bad">v019 fragt diesen Wirkungskanal bei dieser Zellart nicht ab. ` +
      `Die Einstellungen können gespeichert werden, falls die Zellart später geändert wird.</p>` : ''}` +
    `<label class="aid-toggle"><input type="checkbox" data-rec-prop="active" ${r.active ? 'checked' : ''} ${!supported ? 'disabled' : ''}> ` +
    `Rezeptor für diese Gruppe aktiv</label>` +
    `<label class="aid-field"><span>Bindet hauptsächlich</span><select data-rec-prop="substance">` +
    `${selectOptions(namedOptions(SUBSTANCES), r.substance)}</select></label>` +
    rec('baseline', 'Grundwirkung', -1, 1, .01) + rec('sensitivity', 'Empfindlichkeit', -1, 1, .01) +
    `<label class="aid-field"><span>Halbsättigung (K)</span>` +
    `<input data-rec-prop="half" type="number" value="${r.half}" min=".0003" max="1" step=".0001"></label>` +
    rec('width', 'Stoffbindung / Breite', 0, 1, .01) +
    `<div class="aid-subheading">Zellidentität & Lernfähigkeit</div>` +
    (g.role === 1 ? `${rangeField('mode', 'Konkurrenz / Auslöschung', g)}` +
      `${rangeField('pace', 'Schrittmacher', g)}${rangeField('modulator', 'Modulation', g)}` :
      `<p class="aid-note">Bei Sensoren und Effektoren codieren diese Identitätsausgänge die Organfunktion.</p>`) +
    rangeField('qwidth', 'Plastizität / Qualitätsbreite', g, 0, 1) +
    (g.role === 2 && g.function === 9 ?
      `<div class="aid-subheading">Drüsen-Signatur</div>` +
      `<div class="aid-hormone-picks">${[0,1,2,3].map(i => `<button data-release="${i}" type="button">Hormon ${i}</button>`).join('')}</div>` +
      rangeField('q1', 'Stoffcode X', g) + rangeField('q2', 'Stoffcode Y', g) : '') +
    `<p class="aid-note">Rezeptoren bestimmen die Wirkung an der betreffenden Zelle. ` +
    `Lernen und Synapsenumbau geschehen später während des Fischlebens.</p>`;
}

export function development(plan, report, stale) {
  const counts = plan.groups.map(g => SITES.filter(s => hasSite(g, s)).length);
  const collisions = SITES.filter(s => plan.groups.filter(g => hasSite(g, s)).length > 1).length;
  const measured = report && !stale;
  return `<div class="aid-viewhead"><div><small>WIRKLICHE ENTWICKLUNG IN V019</small>` +
    `<h2>Entwicklungsprotokoll</h2><p>Hier treffen die gezeichneten Bereiche auf das CPPN und die tatsächliche Gewebeentwicklung.</p></div></div>` +
    `<div class="aid-diagnostic-grid"><div><small>Geplante Orte</small><strong>${counts.reduce((a,b) => a+b, 0)}</strong></div>` +
    `<div><small>Überlappungen</small><strong class="${collisions ? 'aid-warn' : ''}">${collisions}</strong></div>` +
    `<div><small>Entwickelte Zellen</small><strong>${measured ? report.neurons : '–'}</strong></div>` +
    `<div><small>Synapsen</small><strong>${measured ? report.synapses : '–'}</strong></div></div>` +
    (measured ? `<div class="aid-verdict ${report.viable && !report.limited ? 'good' : 'bad'}">` +
      `${report.viable && !report.limited ? '✓ Engine bewertet das Genom als lebensfähig' : '⚠ Entwicklung eingeschränkt oder nicht lebensfähig'}` +
      `${report.diagnostic ? `<small>${esc(report.diagnostic)}</small>` : ''}</div>` :
      `<div class="aid-verdict">Noch nicht entwickelt. „CPPN entwickeln“ berechnet Genom und Gewebe.</div>`) +
    `<div class="aid-report-table"><table><thead><tr><th>Zellgruppe</th><th>Soll-Orte</th><th>Ist-Orte</th><th>Zellen</th></tr></thead><tbody>` +
    plan.groups.map((g, i) => `<tr><td><button class="aid-table-link" data-select-group="${i}">${esc(g.name)}</button></td>` +
      `<td>${counts[i]}</td><td>${measured ? report.groups?.[i]?.sites ?? 0 : '–'}</td>` +
      `<td>${measured ? report.groups?.[i]?.cells ?? 0 : '–'}</td></tr>`).join('') +
    '</tbody></table></div>' +
    `<p class="aid-note">Die 360 Entwicklungsorte und die Zellenzahlen folgen v019. ` +
    `Ob die Fische später fressen, lernen oder sich fortpflanzen, zeigt erst ihr Leben im Aquarium.</p>`;
}
