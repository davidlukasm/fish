// v019's four developmental zones have 360 sites, mirrored over the body axis.
export const ZONES = ['Maul', 'Kopf', 'Rumpf', 'Schwanz'];
export const ROLES = ['Sinneszellen', 'Nervenzellen', 'Muskel / Organ'];
export const SENSES = ['Sehen', 'Riechen', 'Strömung spüren', 'Berührung spüren',
  'Hindernisse erkennen', 'Nahrungsaufnahme spüren', 'Verletzung spüren',
  'Schwimmblasendruck', 'Keimdrüsendruck', 'Inneren Druck spüren', 'Blutzustand spüren'];
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
export const SUBSTANCES = ['Stoff A', 'Stoff B', 'Stoff C', 'Stoff D', 'Körperreife'];
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
export const PALETTE = [
  {role:0, function:0, name:'Auge', icon:'◉', zone:1, hint:'Helligkeit und Farben sehen'},
  {role:0, function:2, name:'Geruchssinn', icon:'≈', zone:1, hint:'Duftstoffe im Wasser unterscheiden'},
  {role:0, function:4, name:'Hindernissinn', icon:'⌁', zone:1, hint:'Nähe von Wänden wahrnehmen'},
  {role:0, function:1, name:'Seitenlinie', icon:'≋', zone:2, hint:'Bewegung und Strömung spüren'},
  {role:0, function:3, name:'Tastsinn', icon:'✧', zone:0, hint:'Berührung wahrnehmen'},
  {role:0, function:9, name:'Innensinn', icon:'◌', zone:2, hint:'Druck und Dehnung im Körper spüren'},
  {role:1, function:-1, name:'Nervenzellen', icon:'✳', zone:2, hint:'Signale verarbeiten und lernen'},
  {role:2, function:0, name:'Schwanzmuskel', icon:'↝', zone:3, hint:'Vortrieb erzeugen'},
  {role:2, function:1, name:'Lenkmuskel', icon:'↶', zone:2, hint:'Den Fisch drehen'},
  {role:2, function:2, name:'Saugmuskel', icon:'◀', zone:1, hint:'Wasser und Nahrung einsaugen'},
  {role:2, function:5, name:'Kiefermuskel', icon:'◇', zone:0, hint:'Zubeißen'},
  {role:2, function:9, name:'Hormondrüse', icon:'◆', zone:1, hint:'Einen frei gewählten Stoff freisetzen'},
  {role:2, function:3, name:'Ei-Organ', icon:'◕', zone:3, hint:'Eier bilden und ablegen'},
  {role:2, function:4, name:'Spermienorgan', icon:'◍', zone:3, hint:'Spermien bilden und abgeben'},
  {role:2, function:8, name:'Schwimmblase', icon:'○', zone:2, hint:'Auftrieb verändern'}
];

export function blankPlan() {
  return {name:'Neuer Fisch', groups:[]};
}

export function groupName(g, index=0) {
  const base = g.role === 1 ? 'Nervenzellen' :
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
    use('Hindernissinn' + suffix, 0, 4, place(1, .6, 1, 2/3, 2/3, .5, .5, side),
      {copies: 4, q1: 1/3, q2: -.43, qwidth: 0, field: .3, ...send(wall)});
    use('Ausweichschaltung' + suffix, 1, -1, place(2, .3, .4, 1/3, 2/3, .5, .5, side),
      {copies: 4, tau: .3, ...send(otherTurn), ...receive(wall)});
    use('Gegensteuerung' + suffix, 1, -1, place(2, .3, .4, 1/3, 2/3, 1, 1, side),
      {copies: 4, tau: .3, sign: -1, ...send(turn), ...receive(wall)});
    use('Lenkflosse' + suffix, 2, 1, place(2, .9, 1, 0, 1, .5, 1, side),
      {copies: 4, tau: 0, threshold: .3, ...receive(turn)});
    use('Nahbereichssinn' + suffix, 0, 4, place(1, .9, 1, 2/3, 2/3, 0, 0, side),
      {copies: 6, threshold: .6, q1: -1, q2: -1, field: .3, ...send(near)});
    use('Seitlicher Hindernissinn' + suffix, 0, 4, place(1, .6, 1, 1, 1, 0, .5, side),
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
  return {name: 'Handfisch · erster Entwurf', groups};
}
