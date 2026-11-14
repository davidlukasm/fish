// The nose's live inspector: the map of scents with the nose's types of cells and a sample
// tried on them; what the types' cells report of the sample over time; and their life.
// Read in the engine (body_plan.cc, nose and nostril_source; cppn_brain.cc, the smell cells'
// stimulus; physiology.hh, birth_exposure): a cell's stimulus is the sum over the eight scents of
// scent x what the cell takes of it; above its threshold it reports, and it gets used to a scent
// that stays. In the egg both sides get the same; the difference between left and right grows
// after hatching.
// Not in the pictures: the nostrils, the water's flow and where a scent comes from.
import {t} from '../../../strings.js';
import {
  addOrganType,
  findOrgan,
  lifePhase,
  organTypes,
  removeOrganType,
  setLifePhase,
  updateCenter
} from '../../model/document.js';
import {label} from '../kit.js';
import {el, liveKind} from './kit.js';
import {bestScents, sampleColour, sampleShare, scentMap} from './scentmap.js';
import {gateThreshold, keysOf, senseCourse, STEPS, typeLife} from './sense.js';

const word = (key, values) => t('studio.live.nose.' + key, values);
const ROUND_MS = 12000, MOST = 4, NEW_WIDTH = .25;

liveKind('nose', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-nose';
  const heading = words => {
    const h = document.createElement('h4');
    h.textContent = words;
    root.appendChild(h);
    return h;
  };
  const svgOf = () => {
    const svg = el('svg', {class : 'aid-live-picture'});
    root.appendChild(svg);
    return svg;
  };
  const kind = heading(''), map = svgOf();
  heading(word('cells'));
  const smell = svgOf();
  heading(word('life'));
  const life = svgOf();
  // What is tried on the nose and which of its types is chosen: not part of the fish.
  const own = {chosen : 0, input : {rise : 80, height : .8, stop : 560}, probe : null};
  let step = 0;
  const organ = () => findOrgan(studio.state.document, organId);
  const types = () => organTypes(organ());
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const again = () => show();
  function remove(type) {
    own.chosen = 0;
    change(removeOrganType(studio.state.document, organId, type));
  }
  // A new type starts at the sample.
  function add(tuning = {}) {
    const added =
        addOrganType(studio.state.document, organId, studio.state.sites,
                     {q1 : own.probe.q1, q2 : own.probe.q2, qwidth : NEW_WIDTH, ...tuning});
    if (!added)
      return studio.notice(label('status.noRoom'));
    own.chosen = types().length;
    change(added.document);
  }
  const course = senseCourse(smell, {
    name : 'smell',
    own,
    tires : true,
    after : 120,
    most : MOST,
    words : {course : word('course'), used : word('used'), steps : word('steps')},
    keys : () => keysOf(types()),
    share : k => sampleShare(k.cell, own.probe),
    colour : () => sampleColour(own.probe),
    fewer : k => remove(k.type),
    more : gate => add({threshold : gateThreshold(gate)}),
    doc : () => studio.state.document,
    draft,
    settle,
    redraw : again
  });
  function show() {
    const nose = organ();
    if (!nose)
      return;
    const kinds = types(), cells = kinds.map(type => type.centers[0]),
          caps = studio.state.capabilities;
    own.chosen = Math.min(own.chosen, cells.length - 1);
    own.probe ??= {q1 : cells[0].q1, q2 : cells[0].q2};
    kind.textContent = word('smells', {list : bestScents(cells)});
    scentMap(map, {
      name : 'nose',
      own,
      cells,
      stone : false,
      words : {sample : word('sample')},
      most : MOST,
      place : (i, tuning) => updateCenter(studio.state.document, cells[i].id, tuning),
      width : (i, qwidth) => updateCenter(studio.state.document, cells[i].id, {qwidth}),
      remove : i => remove(kinds[i].id),
      add : () => add(),
      draft,
      settle,
      redraw : again
    });
    course.draw();
    typeLife(life, {
      name : 'nose',
      own,
      phases : cells.map(lifePhase),
      egg : 'one',
      words : {egg : word('egg'), grown : word('grown')},
      set : (i, to) => setLifePhase(studio.state.document, cells[i].id, to, caps.sensitivitySpan,
                                    caps.steepnessSpan),
      draft,
      settle,
      redraw : again
    });
    tick(0);
  }
  function tick(dt) {
    step = (step + dt * STEPS / ROUND_MS) % STEPS;
    course.moment(step);
    course.pulse(dt, step);
  }
  return {root, show, tick};
});
