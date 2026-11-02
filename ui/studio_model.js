// v019's four developmental zones have 360 sites, mirrored over the body axis.
export const ZONES = ['Maul & Kiefer', 'Kopf & Sinne', 'Rumpf & Flossen', 'Schwanz & Keimdrüsen'];
export const ROLES = ['Sensor', 'Nervenzelle', 'Effektor'];
export const SENSES = ['Licht', 'Geruch', 'Strömung', 'Berührung', 'Nähe', 'Aufnahme',
  'Schaden', 'Blasendruck', 'Keimdrüsendruck', 'Innendruck', 'Blutwerte'];
export const MOTORS = ['Vortrieb', 'Lenken', 'Saugen', 'Eier', 'Spermien', 'Beißen',
  'Abwehr', 'Pigment', 'Schwimmblase', 'Drüse'];
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
export const SUBSTANCES = ['Hormon 0', 'Hormon 1', 'Hormon 2', 'Hormon 3', 'Reife'];
// In v019 the development engine only requests effect channels relevant to a role.
export function effectSupported(role, effect) {
  return effect === 5 || effect === 6 || role === 1 || (role === 2 && effect === 0);
}
export const INPUTS = ['Zone 0', 'Zone 1', 'Zone 2', 'Zone 3', 'u · Längsachse',
  'v · Höhenlage', 'w · Außenlage', 'Körperseite', 'Rezeptorabfrage', 'Bias'];
export const OUTPUTS = ['Zelle vorhanden', 'Zellrolle', 'Identität 1', 'Identität 2',
  'Identität 3', 'Identität 4', 'Kapazität', 'Schwelle', 'Zeitkonstante', 'Feldweite',
  'Qualität 1', 'Qualität 2', 'Qualitätsbreite / Plastizität', 'Sendecode 1',
  'Sendecode 2', 'Empfangscode 1', 'Empfangscode 2', 'Kontaktbreite',
  'Seitenkreuzung', 'Reichweite'];
export const NODE_TYPES = ['Gauß', 'Sinus', 'Kosinus', 'Linear', 'Vorzeichen',
  'Sigmoid', 'Schwelle', 'Potenz', 'Betrag', 'Stufe', 'Tor'];

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
    groups.push(newGroup(name, {role, function: func, ...at, ...opts}));
  };
  const send = xy => ({sender1: xy[0], sender2: xy[1]});
  const receive = xy => ({receiver1: xy[0], receiver2: xy[1]});
  const mouth = [0, .5];
  for (const side of [-1, 1]) {
    const left = side < 0, suffix = left ? ' L' : ' R', eye = [left ? -.3 : .3, .5],
      wall = channel(left ? 6 : 7), turn = channel(left ? 4 : 5),
      otherTurn = channel(left ? 5 : 4), near = [left ? -.05 : .05, .5];
    use('Auge' + suffix, 0, 0, place(1, 1/3, 1, 1/3, 1/3, 0, 1, side),
      {copies: 3, threshold: -1, q1: -1, q2: 1, qwidth: .3, field: .2, ...send(eye)});
    use('Lenker' + suffix, 1, -1, place(2, .6, .7, 1/3, 2/3, .5, .5, side),
      {copies: 4, tau: 1, sigma: .14, ...send(turn), ...receive(eye)});
    use('Hemmung' + suffix, 1, -1, place(2, .6, .7, 1/3, 2/3, 1, 1, side),
      {copies: 4, sign: -1, tau: 1, sigma: .14, ...send(otherTurn), ...receive(eye)});
    use('Wandsinn' + suffix, 0, 4, place(1, .6, 1, 2/3, 2/3, .5, .5, side),
      {copies: 4, q1: 1/3, q2: -.43, qwidth: 0, field: .3, ...send(wall)});
    use('Ausweichen' + suffix, 1, -1, place(2, .3, .4, 1/3, 2/3, .5, .5, side),
      {copies: 4, tau: .3, ...send(otherTurn), ...receive(wall)});
    use('Gegenlenken' + suffix, 1, -1, place(2, .3, .4, 1/3, 2/3, 1, 1, side),
      {copies: 4, tau: .3, sign: -1, ...send(turn), ...receive(wall)});
    use('Flosse' + suffix, 2, 1, place(2, .9, 1, 0, 1, .5, 1, side),
      {copies: 4, tau: 0, threshold: .3, ...receive(turn)});
    use('Nahfühler' + suffix, 0, 4, place(1, .9, 1, 2/3, 2/3, 0, 0, side),
      {copies: 6, threshold: .6, q1: -1, q2: -1, field: .3, ...send(near)});
    use('Seitenfühler' + suffix, 0, 4, place(1, .6, 1, 1, 1, 0, .5, side),
      {copies: 2, q1: -1, q2: -.43, field: .3, ...send([left ? -.2 : .2, .5])});
  }
  use('Maulnerv', 1, -1, place(1, 0, 0, 2/3, 2/3, 0, 0),
    {copies: 2, tau: .3, sigma: .07, ...receive(mouth), ...send(channel(3))});
  use('Kiefer', 2, 5, place(0, 1/3, 1),
    {copies: 16, tau: 0, threshold: .5, q1: -1, ...receive(channel(3))});
  use('Schluckpumpe', 2, 2, place(1, 0, 1, 0, 0),
    {copies: 16, threshold: .5, q1: -1, ...receive(channel(3))});
  use('Bremse', 1, -1, place(2, 0, 0, 1/3, 2/3, 0, 0),
    {copies: 1, sign: -1, tau: 1, sigma: .07, ...receive(mouth), ...send(channel(8))});
  use('Darmdruck', 0, 9, place(2, 1/3, 1/3, 1/3, 2/3, 0, 0),
    {copies: 2, threshold: -.6, ...send(channel(9))});
  use('Sättigung', 1, -1, place(2, 0, 0, 1/3, 2/3, .5, .5),
    {copies: 2, sign: -1, tau: 1, ...receive(channel(9)), ...send(channel(10))});
  const tail = newGroup('Schwanzantrieb', {role: 2, function: 0, ...place(3, 0, .5),
    copies: 4, threshold: -1, q1: -1, ...receive(channel(8))});
  tail.receptors[5] = {active: 1, baseline: 0, sensitivity: 1,
    half: .0003, substance: 0, width: 0};
  groups.push(tail);
  use('Hirndrüse', 2, 9, place(1, .3, .4, 2/3, 2/3),
    {copies: 8, threshold: -1, tau: 1, q1: 1, q2: 0, qwidth: 0,
      ...receive(channel(10))});
  use('Eier innen', 2, 3, place(3, 1, 1, 1/3, 2/3, 0, .5),
    {copies: 12, threshold: -1});
  use('Eier außen', 2, 3, place(3, 1, 1, 1/3, 2/3, 1, 1),
    {copies: 4, threshold: -1});
  use('Spermien innen', 2, 4, place(3, .75, .75, 1/3, 2/3, 0, 0),
    {copies: 4, threshold: -1});
  use('Spermien außen', 2, 4, place(3, .75, .75, 1/3, 2/3, 1, 1),
    {copies: 4, threshold: -1});
  return {name: 'Handfisch · erster Entwurf', groups};
}
