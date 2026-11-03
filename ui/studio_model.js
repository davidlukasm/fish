// v019's four developmental zones have 360 sites, mirrored over the body axis.
export const ZONES = ['Maul', 'Kopf', 'Rumpf', 'Schwanz'];
export const ROLES = ['Sinneszellen', 'Schaltzellen', 'Muskel / Organ'];
export const SENSES = ['Sehen', 'Riechen', 'Strömung spüren', 'Berührung spüren',
  'Abstandssinn', 'Nährstoffaufnahme', 'Verletzung spüren',
  'Schwimmblasendruck', 'Keimdrüsendruck', 'Innendruck', 'Blutwerte & Hormone'];
export const MOTORS = ['Schwimmen', 'Steuern', 'Wasser ansaugen', 'Eier', 'Spermien',
  'Beißen', 'Abwehr', 'Farbe ändern', 'Schwimmblase', 'Hormone ausschütten'];
export const EFFECTS = ['Erregung', 'Lernen', 'Konkurrenz', 'Merkspur', 'Rhythmus',
  'Ausgabe', 'Zelltod'];
export const EFFECT_HELP = [
  'Ändert die Erregbarkeit der Zielzelle.',
  'Beeinflusst das Lernen an ihren Kontakten.',
  'Regelt die Konkurrenz zwischen aktiven Verbindungen.',
  'Beeinflusst die kurzlebige Gedächtnisspur eines Kontakts.',
  'Verändert den Schrittmacher-Einfluss.',
  'Bestimmt, wie stark der Ausgang der Zelle zur Wirkung kommt.',
  'Beeinflusst Überleben und Abbau der Zelle.'
];
export const SUBSTANCES = ['Stoff A', 'Stoff B', 'Stoff C', 'Stoff D', 'Reife'];
export const HORMONE_COLORS = ['#a6d8ae', '#86d2d8', '#edc48f', '#c5a9e2', '#d5c58c'];
export const MUSCLE_LABELS = ['Kiefer', 'Ansaugen', 'Lenken', 'Vortrieb'];
export const MUSCLE_COLORS = ['#e9a382', '#eacb8c', '#81cce2', '#98d2a0'];
export function releasedSubstance(group) {
  if(group.role!==2 || group.function!==9) return -1;
  return [0,1,2,3].reduce((closest,i)=>{
    const [x,y]=hormonePoint(i),[a,b]=hormonePoint(closest);
    return Math.hypot(group.q1-x,group.q2-y)<Math.hypot(group.q1-a,group.q2-b)?i:closest;
  },0);
}
export function substanceName(plan,index) {
  return index===4?'Reife':plan?.substances?.[index]||SUBSTANCES[index];
}
export function activeSubstances(plan) {
  const used=new Set();
  (plan?.substances||[]).forEach((name,i)=>{if(name&&i<4)used.add(i);});
  for(const g of plan?.groups||[]) {
    const source=releasedSubstance(g);
    if(source>=0) used.add(source);
    (g.receptors||[]).forEach((r,k)=>{
      if(r.active&&effectSupported(g.role,k)&&r.substance<4)used.add(r.substance);
    });
  }
  return [0,1,2,3].filter(i=>used.has(i));
}
export const SCENTS = ['Futter', 'Algen', 'Pflanzen', 'Bodentiere',
  'Plankton', 'Aas', 'Eier', 'Muscheln'];
// The eight spherical preference directions from protocol_schema.hh.
export function scentPoint(index) {
  const latitude=[90,35,35,35,35,-10,-60,-60][index];
  const longitude=[0,-25,25,155,205,180,90,270][index];
  return [((longitude+360)%360)/180-1,Math.sin(latitude*Math.PI/180)];
}
// In v019 the development engine only requests effect channels relevant to a role.
export function effectSupported(role, effect) {
  return effect === 5 || effect === 6 || role === 1 || (role === 2 && effect === 0);
}
export const INPUTS = ['Ort: Maul', 'Ort: Kopf', 'Ort: Rumpf', 'Ort: Schwanz',
  'Position längs', 'Position oben/unten', 'Position innen/außen', 'Körperseite',
  'Rezeptor-Wirkung', 'Konstante 1'];
export const OUTPUTS = ['Zelle anlegen', 'Zellart', 'Funktion / Vorzeichen',
  'Funktion / Lernart', 'Funktion / Rhythmus', 'Funktion / Modulation',
  'Größe / Grundwirkung', 'Reizschwelle', 'Reaktionsdauer', 'Empfindlichkeit',
  'Merkmal A', 'Merkmal B', 'Merkmalsbreite / Lernfähigkeit',
  'Sendeadresse X', 'Sendeadresse Y', 'Empfangsadresse X', 'Empfangsadresse Y',
  'Kontaktstreuung', 'Körperseiten-Kopplung', 'Kontaktreichweite'];
export const NODE_TYPES = ['Gauß', 'Sinus', 'Kosinus', 'Linear', 'Vorzeichen',
  'Sigmoid', 'Schwelle', 'Potenz', 'Betrag', 'Stufe', 'Tor'];

// The exact function_at() zone restrictions in colony-core/field/development.cc.
// An organ can only be added where the engine can actually develop it.
export const AVAILABLE_SENSES = [
  [2,3,1,6,9], [0,4,1,2,3,6,9,10], [1,2,3,5,6,9], [1,2,3,5,6,9]
];
export const AVAILABLE_MOTORS = [
  [5,6,7], [2,6,7,9], [1,6,7,8], [0,3,4,6,7]
];
export const MUSCLE_BY_ZONE = [5,2,1,0];
export function functionAtSite(tool, site) {
  return tool.muscle ? MUSCLE_BY_ZONE[site.zone] : tool.function;
}
export function validSiteFor(tool, site) {
  if(tool.role===1) return true;
  const func=functionAtSite(tool,site),surface=Math.max(site.w,Math.abs(2*site.v-1))>.5;
  if(tool.role===0) {
    if(!AVAILABLE_SENSES[site.zone].includes(func)) return false;
    if([1,2,3].includes(func)) return surface;
    if([5,9,10].includes(func)) return !surface;
    return true;
  }
  if(!AVAILABLE_MOTORS[site.zone].includes(func)) return false;
  return [6,7].includes(func)?surface:true;
}
export const PALETTE = [
  {role:0, function:0, name:'Sehzellgruppe', icon:'◉', zone:1, category:'Außensinne',
    hint:'Lichtempfindliche Zellen im Auge. Ihr Blickfeld lässt sich am Fisch darstellen.'},
  {role:0, function:2, name:'Geruchsorgan', icon:'≈', zone:1, category:'Außensinne',
    hint:'Erkennt Duftstoffe im Wasser.'},
  {role:0, function:4, name:'Abstandssinn', icon:'⌁', zone:1, category:'Außensinne',
    hint:'Erkennt Wände und Hindernisse bereits vor der Berührung.'},
  {role:0, function:1, name:'Seitenlinie', icon:'≋', zone:2, category:'Außensinne',
    hint:'Misst Strömung und Wasserbewegungen entlang der Körperseite.'},
  {role:0, function:3, name:'Tastfeld', icon:'✧', zone:0, category:'Körpersinne',
    hint:'Reagiert auf unmittelbaren Körperkontakt.'},
  {role:0, function:9, name:'Innendrucksensor', icon:'◌', zone:2, category:'Innensinne',
    hint:'Misst Organfüllung oder Muskelspannung. Die Engine wählt das nächstgelegene Organ.'},
  {role:1, function:-1, name:'Schaltkreis', icon:'✳', zone:2, category:'Schaltkreise',preset:'relay',
    hint:'Verarbeitet Signale von Sinneszellen und leitet sie weiter.'},
  {role:2, function:0, name:'Schwanzmuskel', icon:'↝', zone:3, category:'legacy',
    hint:'Vortrieb erzeugen'},
  {role:2, function:1, name:'Lenkmuskel', icon:'↶', zone:2, category:'legacy',
    hint:'Den Fisch drehen'},
  {role:2, function:2, name:'Saugmuskel', icon:'◀', zone:1, category:'legacy',
    hint:'Wasser und Nahrung einsaugen'},
  {role:2, function:5, name:'Kiefermuskel', icon:'◇', zone:0, category:'legacy',
    hint:'Zubeißen'},
  {role:2, function:9, name:'Hormondrüse', icon:'◆', zone:1, category:'Körperorgane',
    hint:'Gibt einen Botenstoff ins Blut ab. Der Rezeptor bestimmt seine Wirkung.'},
  {role:2, function:3, name:'Ei-Organ', icon:'◕', zone:3, category:'Fortpflanzung',
    hint:'Bildet Eier im Körper und gibt sie nach außen ab.'},
  {role:2, function:4, name:'Spermienorgan', icon:'◍', zone:3, category:'Fortpflanzung',
    hint:'Bildet Spermien im Körper und gibt sie nach außen ab.'},
  {role:2, function:8, name:'Schwimmblase', icon:'○', zone:2, category:'Körperorgane',
    hint:'Verändert den Auftrieb.'},
  {role:0, function:6, name:'Schmerzfühler',icon:'ϟ',zone:2,category:'Körpersinne',
    hint:'Reagiert auf Verletzung.'},
  {role:0, function:5, name:'Aufnahmefühler',icon:'◧',zone:2,category:'Körpersinne',
    hint:'Misst gerade aufgenommene Nährstoffe.'},
  {role:0, function:10, name:'Blutfühler',icon:'♢',zone:1,category:'Innensinne',
    hint:'Erfasst Hormone, Reife und Energiereserve.'},
  {role:1, function:-1, name:'Hemmkreis',icon:'⊣',zone:2,category:'Schaltkreise',preset:'inhibit',
    hint:'Dämpft Aktivität anderer Schaltkreise.'},
  {role:1, function:-1, name:'Lernzentrum',icon:'✦',zone:2,category:'Schaltkreise',preset:'learn',
    hint:'Verändert die Stärke seiner Kontakte anhand von Aktivität.'},
  {role:1, function:-1, name:'Taktgeber',icon:'◷',zone:2,category:'Schaltkreise',preset:'pace',
    hint:'Erzeugt einen eigenen Rhythmus.'},
  {role:1, function:-1, name:'Modulationskreis',icon:'⌘',zone:2,category:'Schaltkreise',preset:'modulate',
    hint:'Beeinflusst das Lernen anderer Nervenzellen.'},
  {role:2, function:null, name:'Muskel',icon:'↝',zone:1,category:'Motorik',muscle:true,
    hint:'Die Aufgabe ergibt sich aus der Lage: Maul, Kopf, Rumpf oder Schwanz.'},
  {role:2, function:6, name:'Abwehrgewebe',icon:'⌃',zone:2,category:'Motorik',
    hint:'Schützt die Körperoberfläche.'},
  {role:2, function:7, name:'Farbzellen',icon:'✿',zone:2,category:'Motorik',
    hint:'Ändern die Körperfärbung.'}
];
export const PALETTE_SECTIONS = ['Außensinne','Körpersinne','Innensinne','Schaltkreise',
  'Motorik','Körperorgane','Fortpflanzung'];
export const STARTER_MODULES = [
  {key:'sehen-lenken',name:'Sehen & Lenken',icon:'◉',hint:'Sehfeld → Schaltkreis → Flossenmuskel',
    tools:[0,6,8],links:[[0,1],[1,2]]},
  {key:'riechen-saugen',name:'Riechen & Saugen',icon:'≈',hint:'Geruch → Schaltkreis → Saugmuskel',
    tools:[1,6,9],links:[[0,1],[1,2]]},
  {key:'schwimmantrieb',name:'Schwimmantrieb',icon:'↝',hint:'Taktgeber → Schwanzmuskel',
    tools:[20,7],links:[[0,1]]},
  {key:'hormon-lernen',name:'Hormone & Lernen',icon:'✦',hint:'Drüse und passender Lernkreis',
    tools:[11,19],links:[],hormone:0}
];

// The same 24×24 outline paths as the aquarium's organ-icon strip.
export const ORGAN_PATHS = {
  '0:0':'M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  '0:2':'M8 15a3 3 0 1 0 .01 0M16 15a3 3 0 1 0 .01 0M6 8c2-2 4-2 6 0s4 2 6 0M6 4c2-2 4-2 6 0s4 2 6 0',
  '0:4':'M12 13h.01M8.5 9.5a5 5 0 0 1 7 0M5.5 6.5a9 9 0 0 1 13 0M8.5 16.5a5 5 0 0 0 7 0',
  '0:1':'M2 12h3M7 12h3M12 12h3M17 12h3M4 8c5-3 11-3 16 0M4 16c5 3 11 3 16 0',
  '0:3':'M5 5h14v14H5zM9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01',
  '0:5':'M4 5h16l-6 7v7h-4v-7z',
  '0:6':'M13 2L6 13h5l-2 9 8-12h-5z',
  '0:7':'M12 3v15M7 13l5 5 5-5M5 21h14',
  '0:8':'M12 4c4 0 6 6 6 10a6 6 0 0 1-12 0c0-4 2-10 6-10zM2 13h2M20 13h2',
  '0:9':'M12 4a8 8 0 1 0 .01 0M12 12l4-4M8 16h8',
  '0:10':'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  '1:-1':'M4 12h5M9 12l4-7M9 12l4 7M13 5h7M13 19h7',
  '2:0':'M3 12c4-4 8-4 11 0-3 4-7 4-11 0zM14 12l7-6v12z',
  '2:1':'M5 15a7 7 0 1 1 7 6M12 21l-3-3M12 21l3-2',
  '2:2':'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4 12h5M20 12h-5M12 4v5M12 20v-5',
  '2:3':'M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11z',
  '2:4':'M8 8a3 3 0 1 0 .01 0M8 11c0 4 3 6 8 9M16 4a2 2 0 1 0 .01 0M16 6c1 3 3 4 5 5',
  '2:5':'M3 7c4 6 14 6 18 0M3 17c4-6 14-6 18 0M7 9l1-2 1 2M11 10l1-2 1 2M15 9l1-2 1 2M7 15l1 2 1-2M11 14l1 2 1-2M15 15l1 2 1-2',
  '2:6':'M3 19l3-9 3 9M10 19l3-12 3 12M17 19l2-7 2 7',
  '2:7':'M6 6a2 2 0 1 0 .01 0M14 5a3 3 0 1 0 .01 0M8 15a3 3 0 1 0 .01 0M17 15a2 2 0 1 0 .01 0',
  '2:8':'M12 3a6 7 0 1 0 0 14 6 7 0 0 0 0-14zM12 17v4',
  '2:9':'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z'
};
export function iconPath(g) {
  return (g.muscle ? ORGAN_PATHS['2:1'] : ORGAN_PATHS[`${g.role}:${g.function}`]) ||
    ORGAN_PATHS['1:-1'];
}
export function organColor(g) {
  if(g.role===1) return g.sign<0?'#d5a5bc':'#d8c492';
  if(g.role===2) {
    if(g.function===9)return '#c8afd8';
    if(g.function===3)return '#e3a9d1';
    if(g.function===4)return '#a6adeb';
    if([0,1,2,5].includes(g.function))
      return MUSCLE_COLORS[[5,2,1,0].indexOf(g.function)];
    return '#e5a784';
  }
  if(g.function===9||g.function===8) return '#8fbada';
  return [0,2,4,1].includes(g.function)?'#8cd7c9':'#8fbada';
}

export function blankPlan() {
  return {name:'Neuer Fisch', groups:[], substances:[]};
}

export function groupName(g, index=0) {
  const base = g.role === 1 ? ({relay:'Schaltkreis',inhibit:'Hemmkreis',learn:'Lernzentrum',
    pace:'Taktgeber',modulate:'Modulationskreis'}[g.nervePreset]||'Schaltkreis') :
    PALETTE.find(p => p.role === g.role && p.function === g.function)?.name ||
    (g.role === 0 ? SENSES[g.function] : MOTORS[g.function]) || 'Zellgruppe';
  return base + (g.side ? (g.side < 0 ? ' links' : ' rechts') : '') +
    (g.role === 1 ? ` ${index + 1}` : '');
}

export const SITES = (() => {
  const result = [], sizes = [[4, 3, 2], [4, 4, 3], [4, 4, 3], [5, 4, 3]];
  for (let zone = 0; zone < sizes.length; ++zone) {
    const [rows, heights, radii] = sizes[zone];
    for (let u = 0; u < rows; ++u)
      for (let v = 0; v < heights; ++v)
        for (let w = 0; w < radii; ++w)
          for (const side of [-1, 1])
            result.push({zone, side, u: u / (rows - 1), v: v / (heights - 1),
              w: w / (radii - 1)});
  }
  return result;
})();

export function hasSite(g, p) {
  return g.zone === p.zone && (!g.side || g.side === p.side) &&
    p.u >= g.u0 - .0001 && p.u <= g.u1 + .0001 &&
    p.v >= g.v0 - .0001 && p.v <= g.v1 + .0001 &&
    p.w >= g.w0 - .0001 && p.w <= g.w1 + .0001;
}

export function blankReceptor() {
  return {active: 0, baseline: 0, sensitivity: 0, half: .05, substance: 0, width: 0};
}

export function newGroup(name = 'Neue Zellgruppe', options = {}) {
  return {
    name, zone: 2, side: 0, u0: 0, u1: 1, v0: 0, v1: 1, w0: 0, w1: 1,
    role: 1, function: -1, copies: 2, threshold: 0, tau: .5, field: .5,
    q1: 0, q2: 0, qwidth: .2, sign: 1, mode: 0, pace: -1, modulator: -1,
    sender1: 1, sender2: 1, receiver1: -1, receiver2: -1,
    sigma: .03, crossing: 0, range: 1,
    receptors: Array.from({length: 7}, blankReceptor),
    ...options
  };
}

export function hormonePoint(index) {
  const angle = 2 * Math.PI * index / 6;
  return [Math.cos(angle), Math.sin(angle)];
}

export function handfishPlan() {
  const groups = [], channel = k => [-.9 + .3 * (k % 7), -.9 + .3 * Math.floor(k / 7)];
  const place = (zone, u0, u1 = u0, v0 = 0, v1 = 1, w0 = 0, w1 = 1, side = 0) =>
    ({zone, u0, u1, v0, v1, w0, w1, side});
  const use = (name, role, func, at, opts = {}) => {
    groups.push(newGroup(name, {role, function: func, autoName: true, ...at, ...opts}));
  };
  const send = xy => ({sender1: xy[0], sender2: xy[1]});
  const receive = xy => ({receiver1: xy[0], receiver2: xy[1]});
  const mouth = [0, .5];
  for (const side of [-1, 1]) {
    const left = side < 0, suffix = left ? ' links' : ' rechts', eye = [left ? -.3 : .3, .5],
      wall = channel(left ? 6 : 7), turn = channel(left ? 4 : 5),
      otherTurn = channel(left ? 5 : 4), near = [left ? -.05 : .05, .5];
    use('Auge' + suffix, 0, 0, place(1, 1/3, 1, 1/3, 1/3, 0, 1, side),
      {copies: 3, threshold: -1, q1: -1, q2: 1, qwidth: .3, field: .2, ...send(eye)});
    use('Lenkzentrum' + suffix, 1, -1, place(2, .6, .7, 1/3, 2/3, .5, .5, side),
      {copies: 4, tau: 1, sigma: .14, ...send(turn), ...receive(eye)});
    use('Lenkhemmung' + suffix, 1, -1, place(2, .6, .7, 1/3, 2/3, 1, 1, side),
      {copies: 4, sign: -1, tau: 1, sigma: .14, ...send(otherTurn), ...receive(eye)});
    use('Abstandssinn' + suffix, 0, 4, place(1, .6, 1, 2/3, 2/3, .5, .5, side),
      {copies: 4, q1: 1/3, q2: -.43, qwidth: 0, field: .3, ...send(wall)});
    use('Ausweichkreis' + suffix, 1, -1, place(2, .3, .4, 1/3, 2/3, .5, .5, side),
      {copies: 4, tau: .3, ...send(otherTurn), ...receive(wall)});
    use('Gegensteuerkreis' + suffix, 1, -1, place(2, .3, .4, 1/3, 2/3, 1, 1, side),
      {copies: 4, tau: .3, sign: -1, ...send(turn), ...receive(wall)});
    use('Lenkflosse' + suffix, 2, 1, place(2, .9, 1, 0, 1, .5, 1, side),
      {copies: 4, tau: 0, threshold: .3, ...receive(turn)});
    use('Abstandssinn vorn' + suffix, 0, 4, place(1, .9, 1, 2/3, 2/3, 0, 0, side),
      {copies: 6, threshold: .6, q1: -1, q2: -1, field: .3, ...send(near)});
    use('Abstandssinn Flanke' + suffix, 0, 4, place(1, .6, 1, 1, 1, 0, .5, side),
      {copies: 2, q1: -1, q2: -.43, field: .3, ...send([left ? -.2 : .2, .5])});
  }
  use('Nahrungsnerv', 1, -1, place(1, 0, 0, 2/3, 2/3, 0, 0),
    {copies: 2, tau: .3, sigma: .07, ...receive(mouth), ...send(channel(3))});
  use('Kiefermuskel', 2, 5, place(0, 1/3, 1),
    {copies: 16, tau: 0, threshold: .5, q1: -1, ...receive(channel(3))});
  use('Saugmuskel', 2, 2, place(1, 0, 1, 0, 0),
    {copies: 16, threshold: .5, q1: -1, ...receive(channel(3))});
  use('Bremsnerv', 1, -1, place(2, 0, 0, 1/3, 2/3, 0, 0),
    {copies: 1, sign: -1, tau: 1, sigma: .07, ...receive(mouth), ...send(channel(8))});
  use('Darmdrucksensor', 0, 9, place(2, 1/3, 1/3, 1/3, 2/3, 0, 0),
    {copies: 2, threshold: -.6, ...send(channel(9))});
  use('Sättigungshemmung', 1, -1, place(2, 0, 0, 1/3, 2/3, .5, .5),
    {copies: 2, sign: -1, tau: 1, ...receive(channel(9)), ...send(channel(10))});
  const tail = newGroup('Schwanzantrieb', {role: 2, function: 0, autoName: true, ...place(3, 0, .5),
    copies: 4, threshold: -1, q1: -1, ...receive(channel(8))});
  tail.receptors[5] = {active: 1, baseline: 0, sensitivity: 1,
    half: .0003, substance: 0, width: 0};
  groups.push(tail);
  use('Hormondrüse', 2, 9, place(1, .3, .4, 2/3, 2/3),
    {copies: 8, threshold: -1, tau: 1, q1: 1, q2: 0, qwidth: 0,
      ...receive(channel(10))});
  use('Eier bilden', 2, 3, place(3, 1, 1, 1/3, 2/3, 0, .5),
    {copies: 12, threshold: -1});
  use('Eier ablegen', 2, 3, place(3, 1, 1, 1/3, 2/3, 1, 1),
    {copies: 4, threshold: -1});
  use('Spermien bilden', 2, 4, place(3, .75, .75, 1/3, 2/3, 0, 0),
    {copies: 4, threshold: -1});
  use('Spermien abgeben', 2, 4, place(3, .75, .75, 1/3, 2/3, 1, 1),
    {copies: 4, threshold: -1});
  return {name: 'Handfisch · erster Entwurf', groups, substances:['Stoff A']};
}
