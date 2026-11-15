// The nose's live inspector: the map of scents with the nose's types of cells and a sample
// tried on them; what the types' cells report of the sample over time; and their life.
// Read in the engine (body_plan.cc, nose and nostril_source; cppn_brain.cc, the smell cells'
// stimulus; physiology.hh, birth_exposure): a cell's stimulus is the sum over the eight scents of
// scent x what the cell takes of it; above its threshold it reports, and it gets used to a scent
// that stays. In the egg both sides get the same; the difference between left and right grows
// after hatching.
// The fish panel supplies the scent and current. The curve holds that stimulus steady to show
// what the cells learn to ignore.
import {t} from '../../../strings.js';
import {scentAffinities, scentTuning} from '../../../tuning.js';
import {sideIndex} from '../../model/layout.js';
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
import {addPicture, el, hatchOf, liveKind} from './kit.js';
import {sampleColour, scentMap} from './scentmap.js';
import {INTENSITY, keysOf, senseCourse, steady, STEPS, typeLife} from './sense.js';

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
  const map = addPicture(root);
  heading(word('cells'));
  const smell = addPicture(root);
  heading(word('life'));
  const life = addPicture(root);
  const own = {chosen : 0, probe : null};
  let concentrations = [], total = 0;
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
    most : MOST,
    words : {course : word('course'), used : word('used'), steps : word('steps')},
    scale : INTENSITY,
    keys : () => keysOf(types(), INTENSITY),
    input : () => steady(total),
    share : ({cell}) => {
      const affinity = scentAffinities(cell.q1, cell.q2, cell.qwidth);
      return total > 0 ? concentrations.reduce((sum, v, k) => sum + v * affinity[k], 0) / total : 0;
    },
    colour : () => sampleColour(own.probe),
    fewer : k => remove(k.type),
    more : gate => add({threshold : INTENSITY.threshold(gate)}),
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
    const {senseProbe, anatomy} = studio.state;
    const at = senseProbe?.kind === 'smell' ? senseProbe.scent : 0;
    own.probe = {...scentTuning(at), scent : at};
    concentrations = anatomy?.noseProbe?.[sideIndex(nose.side)] ?? [];
    total = concentrations.reduce((sum, value) => sum + value, 0);
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
      hatch : hatchOf(studio),
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
