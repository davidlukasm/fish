import {escapeText, fixed} from './markup.js';

// Learning drawn and played as the engine's rule runs it (colony-core/field/substrate.cc): an
// episode in four beats, played in rounds.
// 1. Experience: an input fires as the cell acts, by its own firing (the cell flashes) or by its
//    pacemaker's beat (a ring from the pacemaker below it).
// 2. Trace: where input and deed meet, the input's line keeps a glowing trace, fading as the trace
//    lasts.
// 3. Teaching: the teaching signal comes from above, in its source's colour (a modulator, or a
//    substance whose rise teaches). What it brings beyond what the cell already expects from its
//    inputs (a meter's level) surprises the cell.
// 4. Change: the lines grow by the surprise, times what is left of their trace, times the learning
//    rate; the cell expects more from then on. A cell's strength stays the same, so others give
//    way. Without a teacher a competing cell lets a line firing with it grow at once and the
//    others shrink, a cancelling one weakens the line firing with it.
// The same pictures show what a substance does to learning (effects.js): a round without it, its
// cloud arriving, a round with it.

// Moments of a round, as shares of it: a pulse travels TRAVEL before it reaches the cell at the
// beat or at the cell's own firing; the teaching signal sets off at SEND and arrives at ARRIVE;
// the change is done at DONE; the trace is gone at GONE. A flash lasts FLASH either side; the
// cloud of a substance arrives over the last CLOUD of the round before the first round with it.
const MOMENT = Object.freeze({
  beat : .12,
  own : .26,
  travel : .11,
  send : .5,
  arrive : .6,
  done : .7,
  gone : .94,
  flash : .025,
  cloud : .12,
  edge : .005
});
// Times are written with TIME_DIGITS digits, so the keys of a loop keep their order.
const TIME_DIGITS = 4;
const time = value => Math.min(1, Math.max(0, value)).toFixed(TIME_DIGITS);
// Layouts: the big one of the learning inspector and the small one of the effect cards. The
// cell's middle and radius, the inputs' start, the output's end, the teaching signal's start (TOP)
// and the GAP before the cell, lines THICK wide (at least THINNEST), a trace GLOW wider, pulses
// PULSE wide, a pacemaker PACER below the cell, a ring RING times the cell, a cloud CLOUD times
// the cell, the meter (left, top, width, height), labels' LINE height, a round ROUND seconds.
export const EPISODE_LAYOUT = Object.freeze({
  big : Object.freeze({
    width : 300,
    height : 214,
    cx : 166,
    cy : 112,
    r : 21,
    side : 18,
    end : 284,
    top : 26,
    gap : 7,
    thick : 3,
    thinnest : 1,
    glow : 9,
    pulse : 4.5,
    pacer : 50,
    pacerR : 7,
    ring : 1.7,
    cloud : 2.6,
    meter : [ 214, 30, 9, 46 ],
    line : 13,
    round : 3.4
  }),
  small : Object.freeze({
    width : 170,
    height : 76,
    cx : 98,
    cy : 42,
    r : 10,
    side : 10,
    end : 164,
    top : 4,
    gap : 4,
    thick : 3,
    thinnest : 1,
    glow : 7,
    pulse : 3,
    pacer : 22,
    pacerR : 4,
    ring : 1.8,
    cloud : 2.6,
    meter : null,
    line : 10,
    round : 2.6
  })
});
// Keys of a loop: [share of the loop, value] pairs in order, the first at 0 and the last at 1.
function animate(attribute, keys, seconds) {
  const sorted = [...keys ].sort((a, b) => a[0] - b[0]);
  if (sorted[0][0] > 0)
    sorted.unshift([ 0, sorted[0][1] ]);
  if (sorted[sorted.length - 1][0] < 1)
    sorted.push([ 1, sorted[sorted.length - 1][1] ]);
  return '<animate attributeName="' + attribute + '" values="' +
         sorted.map(([, v ]) => typeof v === 'number' ? fixed(v) : v).join(';') + '" keyTimes="' +
         sorted.map(([ at ]) => time(at)).join(';') + '" dur="' + fixed(seconds) +
         's" repeatCount="indefinite"/>';
}
// A pulse running along a way from `from` to `to` (shares of the loop), seen only meanwhile.
function travelling(way, from, to, r, seconds, colour = '') {
  const M = MOMENT;
  return '<circle class="aid-episode-pulse" r="' + fixed(r) + '"' +
         (colour ? ' style="fill:' + colour + '"' : '') + ' opacity="0"><animateMotion path="' +
         way + '" keyPoints="0;0;1;1" keyTimes="0;' + time(from) + ';' + time(to) +
         ';1" calcMode="linear" dur="' + fixed(seconds) + 's" repeatCount="indefinite"/>' +
         animate('opacity',
                 [ [ 0, 0 ], [ from - M.edge, 0 ], [ from, 1 ], [ to, 1 ], [ to + M.edge, 0 ] ],
                 seconds) +
         '</circle>';
}
const way = (x1, y1, x2, y2) =>
    'M' + fixed(x1) + ' ' + fixed(y1) + ' L' + fixed(x2) + ' ' + fixed(y2);
// An episode: its inputs (each with its y, its deed: 'own', 'beat' or none, and a label), whether
// a teacher is drawn (as an arrow, or as a modulator node), whether the meter shows, and its
// rounds. A round has, per input, the trace left by its deed (0 to 1), the change at the deed
// (`grow`) and at the teaching signal (`gain`), what is left of the trace when that comes, the
// teaching signal's colour (none: no teaching), the expectation before and after it, and the
// colour of a substance present (none: none).
export function episodeSvg(layout, scene) {
  const L = layout, M = MOMENT, rounds = scene.rounds, n = rounds.length;
  const seconds = L.round * n, at = (k, share) => (k + share) / n;
  const reach = y => {
    const dx = L.cx - L.side, dy = L.cy - y, d = Math.hypot(dx, dy) || 1;
    return {x : L.cx - dx * (L.r + L.gap) / d, y : L.cy - dy * (L.r + L.gap) / d};
  };
  const moment = deed => deed === 'beat' ? M.beat : M.own;
  // The cloud of a substance: there from the round before the first one with it until the end.
  const firstCloud = rounds.findIndex(r => r.cloud);
  const cloudColour = firstCloud < 0 ? null : rounds[firstCloud].cloud;
  const cloud =
      cloudColour
          ? '<circle class="aid-episode-cloud" cx="' + L.cx + '" cy="' + L.cy + '" fill="' +
                cloudColour + '" r="0">' +
                animate('r',
                        [
                          [ 0, firstCloud ? 0 : L.r * L.cloud ],
                          [ at(firstCloud, -M.cloud), firstCloud ? 0 : L.r * L.cloud ],
                          [ at(firstCloud, 0), L.r * L.cloud ], [ 1 - M.edge, L.r * L.cloud ],
                          [ 1, firstCloud ? 0 : L.r * L.cloud ]
                        ],
                        seconds) +
                '</circle>'
          : '';
  // Each input: its line growing and shrinking, its trace glowing and fading, its pulses.
  const inputs = scene.inputs.map((input, j) => {
    const to = reach(input.y), path = way(L.side, input.y, to.x, to.y);
    let width = L.thick;
    const widths = [ [ 0, width ] ], glows = [ [ 0, 0 ] ];
    let pulses = '';
    rounds.forEach((round, k) => {
      const deed = moment(input.deed);
      if (input.deed && round.fire?.[j] !== false)
        pulses += travelling(path, at(k, deed - M.travel), at(k, deed), L.pulse, seconds);
      const grow = round.grow?.[j] ?? 0, gain = round.gain?.[j] ?? 0, trace = round.trace?.[j] ?? 0;
      if (grow) {
        widths.push([ at(k, deed), width ]);
        width = Math.max(L.thinnest, width + grow);
        widths.push([ at(k, deed + M.flash * 2), width ]);
      }
      if (gain) {
        widths.push([ at(k, M.arrive), width ]);
        width = Math.max(L.thinnest, width + gain);
        widths.push([ at(k, M.done), width ]);
      }
      if (trace > 0)
        glows.push([ at(k, deed), 0 ], [ at(k, deed + M.edge), trace ],
                   [ at(k, M.arrive), trace * (round.remnant ?? 1) ], [ at(k, M.gone), 0 ]);
    });
    widths.push([ 1 - M.edge, width ], [ 1, L.thick ]);
    const words = input.label ? '<text class="aid-episode-label" x="' + L.side + '" y="' +
                                    fixed(input.y - L.line / 2 - L.thick) + '">' +
                                    escapeText(input.label) + '</text>'
                              : '';
    return '<path class="aid-episode-trace" d="' + path + '" stroke-width="' + L.glow +
           '" stroke-opacity="0">' + animate('stroke-opacity', glows, seconds) + '</path>' +
           '<path class="aid-episode-line' + (input.deed ? '' : ' still') + '" d="' + path +
           '" stroke-width="' + L.thick + '">' + animate('stroke-width', widths, seconds) +
           '</path>' + pulses + words;
  });
  // The cell flashes when it fires itself; its pacemaker's beat rings round it.
  const flashes = [ [ 0, .3 ] ], rings = [ [ 0, 0 ] ], ringR = [ [ 0, L.r ] ];
  const own = scene.inputs.some(i => i.deed === 'own');
  const beats = scene.inputs.some(i => i.deed === 'beat');
  let sent = '';
  rounds.forEach((round, k) => {
    if (own)
      flashes.push([ at(k, M.own - M.flash), .3 ], [ at(k, M.own), 1 ],
                   [ at(k, M.own + M.flash), .3 ]);
    if (beats)
      rings.push([ at(k, M.beat - M.edge), 0 ], [ at(k, M.beat), 1 ],
                 [ at(k, M.beat + M.flash * 3), 0 ]),
          ringR.push([ at(k, M.beat - M.edge), L.r ], [ at(k, M.beat), L.r ],
                     [ at(k, M.beat + M.flash * 3), L.r * L.ring ]);
    if (own && scene.output)
      sent += travelling(way(L.cx + L.r, L.cy, L.end, L.cy), at(k, M.own), at(k, M.own + M.travel),
                         L.pulse, seconds);
  });
  const pacer = beats ? '<path class="aid-episode-arrow" d="' +
                            way(L.cx, L.cy + L.pacer - L.pacerR, L.cx, L.cy + L.r + L.gap) +
                            '"/><circle class="aid-episode-pacer" cx="' + L.cx + '" cy="' +
                            (L.cy + L.pacer) + '" r="' + L.pacerR + '"/>' +
                            (scene.labels?.beat
                                 ? '<text class="aid-episode-label" x="' + (L.cx + L.pacerR * 2) +
                                       '" y="' + fixed(L.cy + L.pacer + L.line / 3) + '">' +
                                       escapeText(scene.labels.beat) + '</text>'
                                 : '')
                      : '';
  const ring = beats
                   ? '<circle class="aid-episode-ring" cx="' + L.cx + '" cy="' + L.cy + '" r="' +
                         L.r + '" stroke-opacity="0">' + animate('stroke-opacity', rings, seconds) +
                         animate('r', ringR, seconds) + '</circle>'
                   : '';
  // The teaching signal: an arrow (or a modulator node sending it) from above, a pulse in its
  // colour each taught round, and the cell's expectation beside it.
  const taught = rounds.some(r => r.teach);
  const into = L.cy - L.r - L.gap, teachWay = way(L.cx, L.top, L.cx, into);
  let teaching = '';
  if (scene.teacher) {
    const node = scene.teacher === 'node', fires = [ [ 0, .3 ] ];
    rounds.forEach((round, k) => {
      if (round.teach)
        fires.push([ at(k, M.send - M.flash), .3 ], [ at(k, M.send), 1 ],
                   [ at(k, M.send + M.flash), .3 ]);
    });
    teaching +=
        '<path class="aid-episode-arrow teach' + (taught ? '' : ' none') + '" d="' + teachWay +
        '"/>' +
        (node ? '<circle class="aid-episode-teacher" cx="' + L.cx + '" cy="' + L.top + '" r="' +
                    L.pacerR + '" fill-opacity=".3">' + animate('fill-opacity', fires, seconds) +
                    '</circle>'
              : '') +
        (scene.labels?.teach ? '<text class="aid-episode-label teach" x="' + (L.cx - L.pacerR * 2) +
                                   '" y="' + fixed(L.top + L.line / 3) + '" text-anchor="end">' +
                                   escapeText(scene.labels.teach) + '</text>'
                             : '');
    rounds.forEach((round, k) => {
      if (round.teach)
        teaching += travelling(teachWay, at(k, M.send), at(k, M.arrive), L.pulse * 1.3, seconds,
                               round.teach);
    });
  }
  let meter = '';
  if (L.meter && taught && rounds.some(r => r.expect)) {
    const [x, y, w, h] = L.meter, level = [];
    rounds.forEach((round, k) => {
      const [before, after] = round.expect ?? [ 0, 0 ];
      level.push([ at(k, 0), before ], [ at(k, M.arrive), before ], [ at(k, M.done), after ]);
    });
    level.push([ 1 - M.edge, level[level.length - 1][1] ], [ 1, level[0][1] ]);
    meter = '<rect class="aid-episode-meter" x="' + x + '" y="' + y + '" width="' + w +
            '" height="' + h + '" rx="2"/><rect class="aid-episode-expect" x="' + x + '" width="' +
            w + '" rx="2">' + animate('y', level.map(([ t, v ]) => [t, y + h * (1 - v)]), seconds) +
            animate('height', level.map(([ t, v ]) => [t, h * v]), seconds) + '</rect>' +
            (scene.labels?.expect ? '<text class="aid-episode-label" x="' + (x + w + L.gap) +
                                        '" y="' + fixed(y + h / 2 + L.line / 3) + '">' +
                                        escapeText(scene.labels.expect) + '</text>'
                                  : '');
  }
  const output = scene.output ? '<path class="aid-episode-arrow" d="' +
                                    way(L.cx + L.r + L.gap, L.cy, L.end, L.cy) + '"/>' +
                                    (scene.labels?.output
                                         ? '<text class="aid-episode-label" x="' + L.end + '" y="' +
                                               (L.cy - L.gap) + '" text-anchor="end">' +
                                               escapeText(scene.labels.output) + '</text>'
                                         : '') +
                                    sent
                              : '';
  const caption = scene.caption ? '<text class="aid-episode-caption" x="' + L.cx + '" y="' +
                                      (L.height - L.line / 2) + '" text-anchor="middle">' +
                                      escapeText(scene.caption) + '</text>'
                                : '';
  return '<svg class="aid-episode ' + (L === EPISODE_LAYOUT.big ? 'big' : 'small') +
         '" viewBox="0 0 ' + L.width + ' ' + L.height + '" role="img"' +
         (scene.title ? ' aria-label="' + escapeText(scene.title) + '"' : ' aria-hidden="true"') +
         '>' + cloud + teaching + meter + pacer + inputs.join('') + output + ring +
         '<circle class="aid-episode-cell" cx="' + L.cx + '" cy="' + L.cy + '" r="' + L.r +
         '" fill-opacity=".3">' + animate('fill-opacity', flashes, seconds) + '</circle>' +
         caption + '</svg>';
}

// What a substance's effect means for learning, as an episode of two rounds, the second with the
// substance (its cloud in its colour). The cell's own firing meets input A; a still input B gives
// way; a teacher (NEUTRAL colour, a modulator) teaches unless the substance itself is the teacher.
// A change at full learning is CHANGE wide, competition's COMPETE.
const LESSON = Object.freeze({change : 3.2, compete : 1.8, trace : .55, neutral : '#b8c5e1'});
export const LEARNING_LESSONS =
    Object.freeze([ 'teaching', 'learning', 'competition', 'eligibility' ]);
export function lessonScene(lesson, colour) {
  const L = EPISODE_LAYOUT.small, C = LESSON;
  const upper = L.cy - L.r * 2.4, lower = L.cy + L.r * 2.4;
  const ownInput = {y : upper, deed : 'own'}, still = {y : lower, deed : null};
  const scenes = {
    // Without the substance nothing teaches; its rise is the teaching signal.
    teaching : {
      inputs : [ ownInput, still ],
      teacher : 'arrow',
      rounds : [
        {trace : [ C.trace, 0 ], remnant : .7}, {
          trace : [ C.trace, 0 ],
          remnant : .7,
          teach : colour,
          gain : [ C.change, 0 ],
          cloud : colour
        }
      ]
    },
    // The same teaching changes the line twice as much with the substance.
    learning : {
      inputs : [ ownInput, still ],
      teacher : 'arrow',
      rounds : [
        {trace : [ C.trace, 0 ], remnant : .7, teach : C.neutral, gain : [ C.change / 2, 0 ]}, {
          trace : [ C.trace, 0 ],
          remnant : .7,
          teach : C.neutral,
          gain : [ C.change, 0 ],
          cloud : colour
        }
      ]
    },
    // Without a teacher the line firing with the cell grows and the still one shrinks, faster
    // with the substance.
    competition : {
      inputs : [ ownInput, still ],
      rounds : [
        {grow : [ C.compete / 2, -C.compete / 2 ]},
        {grow : [ C.compete, -C.compete ], cloud : colour}
      ]
    },
    // The input meeting the beat and the one meeting the cell's own firing share the credit; with
    // the substance the own firing takes it all.
    eligibility : {
      inputs : [ ownInput, {y : lower, deed : 'beat'} ],
      teacher : 'arrow',
      rounds : [
        {
          trace : [ C.trace / 2, C.trace / 2 ],
          remnant : .8,
          teach : C.neutral,
          gain : [ C.change / 2, C.change / 2 ]
        },
        {
          trace : [ C.trace, 0 ],
          remnant : .8,
          teach : C.neutral,
          gain : [ C.change, 0 ],
          cloud : colour
        }
      ]
    }
  };
  return scenes[lesson] ? episodeSvg(L, scenes[lesson]) : '';
}
// What a modulator does: it fires (a node above the cell) and its firing reaches the cell as the
// teaching signal, not as a drive: the cell does not fire from it, but the line its own firing
// met before grows.
export function modulatorScene(colour) {
  const L = EPISODE_LAYOUT.small, C = LESSON;
  return episodeSvg(L, {
    inputs : [ {y : L.cy - L.r * 2.4, deed : 'own'}, {y : L.cy + L.r * 2.4, deed : null} ],
    teacher : 'node',
    rounds : [
      {trace : [ C.trace, 0 ], remnant : .7, teach : colour, gain : [ C.change / 2, 0 ]},
      {trace : [ C.trace, 0 ], remnant : .7, teach : colour, gain : [ C.change / 2, 0 ]}
    ]
  });
}
