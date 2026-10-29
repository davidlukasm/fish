import {animalMesh, initialize as initializeAnimals} from './animals.js';
import {initialize as initializeDom} from './dom.js';
import {fishAnatomy, initialize as initializeForms} from './fish_forms.js';
import {initialize as initializeFins} from './fish_fins.js';
import {initialize as initializeGeometry} from './fish_geometry.js';
import {initialize as initializeRenderer} from './renderer.js';
import {sceneState} from './state.js';

initializeDom([ 'rgb' ]);
initializeRenderer([ 'tankIdentity', 'tankPoint' ]);
initializeGeometry([ 'fishPlans', 'fishPlanOrder' ]);
initializeFins([ 'fishTemplateScales' ]);
initializeForms([ 'fishAnatomyCache', 'fishOverviewEpoch', 'fishOverviewShapes' ]);
initializeAnimals([ 'animalHeader', 'animalMeshes' ]);

self.onmessage = ({data}) => {
  try {
    sceneState.frame = {parameters : data.parameters};
    data.fish.shapePlans = data.shapePlans;
    const model = animalMesh(fishAnatomy(data.fish), data.level);
    self.postMessage({ticket : data.ticket, model}, [ model.data.buffer ]);
  } catch (error) {
    self.postMessage({ticket : data.ticket, error : error.message});
  }
};
