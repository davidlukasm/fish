const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const {createFixture} = require('./dom_fixture');
(async () => {
  const {sandbox, elements, requests} = createFixture({}), context = vm.createContext(sandbox),
                            cache = new Map();
  function load(name) {
    name = path.basename(name);
    if (!cache.has(name))
      cache.set(name, new vm.SourceTextModule(fs.readFileSync('ui/' + name, 'utf8'),
                                              {context, identifier : name}));
    return cache.get(name);
  }
  const entry = new vm.SourceTextModule(
      fs.readdirSync('ui')
          .filter(n => n.endsWith('.js') && !['app.js'].includes(n) && !n.includes('_worker'))
          .map(n => `import './${n}';`)
          .join('\n'),
      {context});
  await entry.link(load);
  await entry.evaluate();
  const api = name => load(name + '.js').namespace;
  {
    api('brain').initialize([ 'brainClamp' ]);
    const nose = Array(25).fill(0);
    nose[20] = [ .5, 1, -1, 1, 1, .3, .5, .5, .5 ];
    assert(api('brain_model').brainScentWeights(nose).every(v => v === 1),
           'Broad nose tuning is shown as equally sensitive to all scents');
    nose[20][4] = 0;
    const tuned = api('brain_model').brainScentWeights(nose);
    assert(tuned[0] > .999 && tuned.slice(1).every(v => v < .001),
           'Narrow scent tuning uses the same width as the physical receptor');
  }
  const particle = api('particle_renderer');
  api('camera').cameraState.viewportWidth = 1000;
  api('camera').cameraState.viewportHeight = 800;
  const dense = Array.from({length : 4000},
                           (_, i) => [100 + (i % 100) * .2, 100 + Math.floor(i / 100) * .2, 5, i, 0,
                                      0, .5, 0, 1, .2, .1]),
        coarse = particle.overviewFood(dense, {scale : .5, ox : 0, oy : 0});
  assert(coarse.length < dense.length / 10,
         'Far food drawing must reduce dense particle geometry by more than tenfold');
  assert.equal(coarse.reduce((n, p) => n + p[2], 0), 20000,
               'Visual grouping conserves represented food energy');
  assert.equal(particle.overviewFood(dense, {scale : 3, ox : -10000, oy : 0}).length, 0,
               'Offscreen food produces no geometry');
  {
    const tank = api('tank'), S = api('schema').FISH, state = api('state');
    const crab = {kind : 'invertebrate', item : [ 50, 50, 10, 123, 0, 0, 5, 8 ]},
          menu = {x : 100, y : 100, actions : tank.objectActions(crab)};
    assert.equal(tank.radialChoice(menu, 100, 100), -1);
    assert.equal(tank.radialChoice(menu, 100, 45), 0);
    assert.equal(tank.radialChoice(menu, 160, 140), 1);
    assert.equal(tank.radialChoice(menu, 100, 155), 2);
    assert.equal(tank.radialChoice(menu, 45, 100), 3);
    assert.equal(menu.actions[1].id, 'encourage');
    assert.equal(tank.objectActions({kind : 'water'}).length, 0,
                 'Water clears selection and never opens placement');
    assert.equal(tank.objectActions({kind : 'sediment'}).length, 3);
    assert(!tank.objectActions({kind : 'plant', item : Array(17).fill(0).concat([ [ 0, 0, 1 ] ])})
                .some(a => a.id === 'encourage'));
    const p = Array(S.count).fill(0), old = p.slice();
    p[S.mouth_biting] = old[S.mouth_biting] = 1;
    p[S.mouth_phase] = old[S.mouth_phase] = 2;
    p[S.age] = 16;
    p[S.mouth_cycle] = 2;
    old[S.mouth_cycle] = 1;
    assert.equal(state.mouthCyclePose(p, old, .25), null,
                 'interpolation cannot invent mouth cycles between distant samples');
    p[S.mouth_biting] = 0;
    assert.equal(state.mouthCyclePose(p, old, .25), null,
                 'Suction alone has no artificial biting cycle');
    const merged = api('renderer').mergeInstanceRanges([
      {start : 1, count : 2}, {start : 3, count : 4}, {start : 0, count : 1}
    ]);
    assert.deepEqual(Array.from(merged, x => [x.start, x.count]), [ [ 1, 6 ], [ 0, 1 ] ],
                     'Batching preserves depth order');
    assert.equal(particle.foodDisplayRadius([ 0, 0, 10, 1, 0, 0, .4, 9 ]), .4,
                 'Shellfish fragments use their physical radius');
  }
  const camera = api('camera').cameraState, water = api('water_view');
  const plants = api('plant_geometry'),
        organ =
            [
              0, 0, -1, [ 10, 100, 10, 70, 10, 40, 10, 0 ], 1, 1, 400, 1, .5, [ .2, .4, .1 ], 1, .2
            ],
        sprout = [];
  organ[3][7] = 80;
  sprout[api('schema').PLANT.root] = [ 0, 0, 0, 0, 0 ];
  sprout[api('schema').PLANT.organs] = [ organ ];
  plants.initialize([ 'plantPartsCache' ]);
  assert.equal(plants.plantRenderParts(sprout)[0].q[7], 80,
               'The final server curve is not elongated a second time');
  assert.equal(organ[6], 400, 'Visual growth preserves the food energy');
  assert.equal(organ[3][7], 80, 'Visual growth preserves the physical source geometry');
  assert.equal(plants.bedScale(0), 1);
  assert.equal(plants.bedScale(1), 1.5);
  // The ground and its burrow use the same organic tint, including refreshed sediment.
  const soilPatch = Array(27).fill(0);
  Object.assign(
      soilPatch,
      {1 : 10, 2 : 100, 3 : 110, 4 : 100, 5 : 0, 6 : -1, 12 : 100, 15 : 20, 16 : 20, 22 : 6000});
  const soilFrame = {plants : [ soilPatch ]}, soilColor = plants.bedColorAt(soilFrame, 60, 90);
  assert.deepEqual(Array.from(soilColor), Array.from(plants.bedColor(soilFrame, soilPatch)));
  const cleanPatch = soilPatch.slice();
  cleanPatch[22] = 0;
  assert(plants.bedColorAt({plants : [ cleanPatch ]}, 60, 90)[0] > soilColor[0],
         'Changed sediment composition refreshes the burrow pigment');
  assert(plants.bedColorAt({}, 10, 10).every(Number.isFinite),
         'Previews without a bed have valid pigment');
  const tallWorm = [ 100, 40, 8, 700, 0, 0, 1, 7, 0, 0, 0, 0, 0, 80, .5, 0, 1, 0, 1, .5, 90 ],
        lowCrab = [ 100, 105, 30, 701, 0, 0, 8, 8, 0, 0, 0, 0, 0, 0, .5, 1, 1, 1, 1, .5 ],
        floorOrder = plants.bedRenderOrder({plants : [], invertebrates : [ lowCrab, tallWorm ]},
                                           {scale : 1, ox : 0, oy : 0}, [ 0 ], 1);
  assert.deepEqual(Array.from(floorOrder, q => q.p[3]), [ 701, 700 ],
                   'A tall worm is sorted by the lower end of its image, rather than its head');
  const bedFish = [ 100, 100, 0, 0, 17 ];
  bedFish[51] = 4;
  const habitat = {
    width : 1000,
    height : 800,
    step : 0,
    render_epoch : 'bed-check',
    fish : [ bedFish ],
    plants : [],
    invertebrates : [ [ 100, 100, 1, 9, 0, 0, 20, 8 ] ]
  };
  const initialLayer = plants.fishVegetationLayer(bedFish, habitat);
  for (const step of [200, 500, 900]) {
    habitat.step = step;
    assert.equal(plants.fishVegetationLayer(bedFish, habitat), initialLayer,
                 'A covered fish must not jump between depth layers');
  }
  api('dom').initialize([ 'el', 'canvas', 'text' ]);
  const editor = api('world');
  elements.brush.value = '28';
  elements['tool-count'].value = '1';
  const supports = {
    width : 1000,
    height : 800,
    parameters : {},
    plants : [],
    placement_surfaces :
        [ [ 0, 300, 400, 300, 0, -1, 20, 20, 0, 1 ], [ 0, 600, 400, 600, 0, -1, 0, 0, 0, 1 ] ]
  };
  assert.equal(editor.plantPlacement({x : 200, y : 200}, supports, 'grass').y, 290,
               'Plant preview snaps into suitable sediment');
  assert.equal(editor.animalPlacement({x : 200, y : 200}, supports, 'mussels', 1)[0][1] < 600,
               true);
  assert.equal(
      editor
          .animalPlacement({x : 200, y : 200}, {...supports, placement_surfaces : []}, 'mussels', 1)
          .length,
      0, 'Unavailable habitat has no false preview');
  {
    // Editor regression group: native module calls, actual controls and geometry.
    delete elements['selectedTool-count'];
    const defaultWorm = editor.animalPlacement({x : 150, y : 250}, supports, 'worms');
    assert.equal(defaultWorm.length, 1, 'Worm preview reads the existing count control');
    assert(defaultWorm[0].slice(0, 21).every(Number.isFinite));
    const sloped = {
      ...supports,
      placement_surfaces : [ [ 0, 300, 400, 200, -.242536, -.970143, 20, 20, 0, 1 ] ]
    };
    assert.equal(editor.animalPlacement({x : 150, y : 200}, sloped, 'worms')[0][11], 0,
                 'Worm preview remains upright on slopes');
    const thin = {...supports, placement_surfaces : [ [ 0, 300, 400, 300, 0, -1, 0, 20, 0, 1 ] ]};
    assert.equal(editor.animalPlacement({x : 1, y : 280}, thin, 'worms').length, 0,
                 'Sediment must be deep enough at the actual projected point');
    const rock = {
      ...supports,
      placement_surfaces : [ [ 0, 300, 400, 100, -.447, -.894, 0, 0, .1, .9 ] ]
    };
    const face = editor.plantPlacement({x : 200, y : 180}, rock, 'algae');
    assert(face.t > .4 && face.t < .6, 'Algae snap to face interiors, not their corners');
    const dusty = {
      ...rock,
      placement_surfaces : [ [ 0, 300, 400, 100, -.447, -.894, .08, .08, .1, .9 ] ]
    };
    assert.equal(editor.plantPlacement({x : 200, y : 180}, dusty, 'algae')?.t, face.t,
                 'Dust does not override the exposed surface interval');
    const buriedRock = {
      ...rock,
      placement_surfaces : [ [ 0, 300, 400, 100, -.447, -.894, 2, 2, 0, 0 ] ]
    };
    assert.equal(editor.plantPlacement({x : 200, y : 180}, buriedRock, 'algae'), null);
    const missing = {...rock, placement_surfaces : [ [ 100, 100, 100, 100, 0, -1, 0, 0, 0, 1 ] ]};
    assert.equal(editor.plantPlacement({x : 100, y : 100}, missing, 'algae'), null);
    api('state').sceneState.frame = {
      ...supports,
      currents : [ [ 100, 100, 0, 400, 1 ], [ 120, 100, 1, 60, 2 ] ],
      feeders : [ [ 100, 100, 80, 1 ], [ 120, 100, 20, 2 ] ]
    };
    assert.equal(api('world_sources').currentAt({x : 119, y : 100}), 1);
    assert.equal(api('world_sources').feederAt({x : 119, y : 100}), 1);
    api('world_sources').renderFeeders(api('state').sceneState.frame);
    const sourceButtons = elements['feeder-list'].children.slice();
    api('state').sceneState.frame.feeders[0][0]++;
    api('world_sources').renderFeeders(api('state').sceneState.frame);
    assert.strictEqual(elements['feeder-list'].children[0], sourceButtons[0],
                       'Drifting source positions do not replace the interactive DOM');
    const buried = [ 100, 100, 1, 900, 0, 0, 1, 7, 0, 0, 0, 0, 0, 40, 0, 0, 1, 0, -.5, .5 ];
    assert(api('hover').smallAnimalContains(buried, 100, 105, 0));
    buried[13] = 0;
    assert(api('hover').smallAnimalContains(buried, 100, 100, 0),
           'Retracted worm remains selectable at its visible burrow');
    assert(!api('hover').smallAnimalContains(buried, 100, 106, 0),
           'Retracted body outside the burrow is not selectable');
    editor.worldState.placingEggs = 99;
    editor.worldState.worldDrag = {start : {x : 1, y : 1}};
    editor.cancelWorldGesture();
    assert.equal(editor.worldState.placingEggs, null);
    assert.equal(editor.worldState.worldDrag, null);
    const edge = editor.eggPlacementPoints({x : 0, y : 0}, 50);
    assert(edge.every(p => p.x >= 0 && p.x < 1000 && p.y >= 3 && p.y <= 797));
    console.log('Editor: surfaces, worms, controls, source selection and cancellation: OK');
  }
  camera.viewportWidth = 1000;
  camera.viewportHeight = 800;
  const cloud = {
    width : 1000,
    height : 800,
    parameters : {plankton_max_density : .01},
    water : [],
    plankton : {columns : 100, rows : 80, amounts : new Float32Array(8000).fill(1)}
  };
  {
    const mouth = {id : 1, x : 40, y : 50, nx : 1, ny : 0, reach : 20, gap : 3},
          prey = [ 50, 50, 20, 0, 0, 0, .8, .5, 0, 0, 100, .3 ];
    prey.id = 9;
    const outside = prey.slice();
    outside.id = 10;
    outside[0] = 10;
    const original = prey.slice(),
          caught = water.planktonIntake([ prey, outside ], [ mouth ], 100, 'intake-test');
    assert(caught[0].intake && !caught[1].intake,
           'Only particles in front of the actual mouth enter');
    const moved = water.planktonIntake([ prey ], [ {...mouth, x : 42} ], 105, 'intake-test');
    assert.equal(moved[0].intake[0], 42, 'Captured particles follow the moving mouth');
    assert.equal(moved[0].intake[2], 100,
                 'Capture preserves its start instead of restarting every frame');
    assert.deepEqual(prey.slice(), original, 'Capture does not move or consume physical plankton');
    const depleted = water.planktonIntake([], [ {...mouth, x : 44} ], 106, 'intake-test');
    assert.equal(depleted.length, 1, 'An entering particle survives depletion of its field cell');
    assert.equal(depleted[0].intake[0], 44);
    const stopping = water.planktonIntake([ outside ], [ {...mouth, x : 46, active : false} ], 107,
                                          'intake-test');
    assert.equal(stopping.find(g => g.id === 9).intake[0], 46,
                 'A captured animal follows its fish during a pump pause');
    assert(!stopping.find(g => g.id === 10).intake, 'A paused pump captures no new animals');
    assert(water.planktonIntake([ prey ], [], 125, 'intake-test')[0].intake,
           'Swallowed particles stay hidden after pumping stops');
    assert(!water.planktonIntake([ prey ], [], 100, 'new-world')[0].intake,
           'World changes clear capture state');
  }
  const particles = water.planktonGrains(cloud, {scale : 1, ox : 0, oy : 0});
  assert(particles.length > 300 && particles.length <= 800,
         'Krebschen-Symbole haben ein festes Zeichenbudget');
  assert.strictEqual(water.planktonGrains(cloud, {scale : 1, ox : 0, oy : 0}), particles,
                     'Unveränderte Wolken verwenden dieselben GPU-Daten');
  cloud.step = 100;
  cloud.water = [ [ 5, 5, .4, -.2 ] ];
  const moving = water.planktonGrains(cloud, {scale : 1, ox : 0, oy : 0});
  cloud.step += 2;
  cloud.water = [ [ 5, 5, -.7, .1 ] ];
  const changed = water.planktonGrains(cloud, {scale : 1, ox : 0, oy : 0}),
        wrap = v => v - Math.floor(v);
  const movedByPhase = new Map(changed.map(g => [g[11], g]));
  for (const g of moving) {
    const next = movedByPhase.get(g[11]);
    if (!next || g[0] > 999 || g[1] < 1)
      continue;
    assert(Math.abs(next[0] - (g[0] + .8)) < 1e-9 && Math.abs(next[1] - (g[1] - .4)) < 1e-9,
           'Flow changes retain world-space positions across grid cells');
    assert(next.every(Number.isFinite));
  }
  const beforePan = new Map(changed.map(g => [g[11], g]));
  const pan = water.planktonGrains(cloud, {scale : 1, ox : -100, oy : 0});
  for (const g of pan)
    assert.deepEqual(Array.from(g), Array.from(beforePan.get(g[11])),
                     'Panning does not change particle density or phase');
  assert(new Set(moving.map(p => p[11])).size > moving.length * .9,
         'Krebschen bekommen individuelle Animationsphasen');
  assert.equal(water.planktonGrains(cloud, {scale : 1, ox : 1200, oy : 0}).length, 0,
               'Unsichtbare Wolken erzeugen keine Symbole');

  const sparse = {
    ...cloud,
    step : 0,
    water : [],
    plankton : {...cloud.plankton, amounts : new Float32Array(8000).fill(.02)}
  };
  assert.equal(water.planktonGrains(sparse, {scale : 1, ox : 0, oy : 0}).length, 0,
               'Very dilute plankton draws no decorative animals');
  const roots = api('vegetation'), renderer = {
    poses : new Map([ [ '1:2', {before : [ 10, 20 ], next : [ 20, 40 ]} ] ]),
    poseBlend : () => .25
  };
  roots.vegetationState.gpuGrass = renderer;
  assert.deepEqual(Array.from(roots.grassRootPose(1, 2, {})), [ 12.5, 25 ],
                   'Plant openings use the renderer interpolation rather than the next snapshot');
  roots.vegetationState.gpuGrass = null;
  const hover = api('hover');
  hover.initialize([ 'tankFormat' ]);
  api('brain_model').initialize([ 'scentNames' ]);
  const waterFrame = {
    width : 100,
    height : 100,
    parameters : {plankton_max_density : .01},
    plants : [],
    plankton : {columns : 2, rows : 2, amounts : [ .000001, 2, 0, 0 ]},
    sediment : {columns : 1, rows : 1, amounts : [ 10 ]},
    odors : {columns : 2, rows : 1, cells : [ Array(8).fill(0), [ 1, 2, 3, 4, 5, 6, 7, 8 ] ]},
    obstacles : [ [ 75, 75, 10 ] ],
    shapes : []
  };
  api('state').sceneState.frame = waterFrame;
  const thin = hover.tankWaterHit({x : 10, y : 10}, waterFrame);
  assert(thin.plankton > 0 && thin.planktonDensity < .01 * .005,
         'Wasser-Mouseover erfasst auch Plankton unter der Zeichenschwelle');
  assert.equal(
      water
          .planktonGrains(
              {...waterFrame, plankton : {columns : 2, rows : 2, amounts : [ .000001, 0, 0, 0 ]}},
              {scale : 1, ox : 0, oy : 0})
          .length,
      0, 'Dünnes Plankton bleibt ohne sichtbare Symbole erhalten');
  const rich = hover.tankWaterHit({x : 75, y : 25}, waterFrame), info = hover.tankObjectInfo(rich);
  assert.equal(rich.plankton, 2);
  assert.equal(info.title, 'Wasser');
  const scents = api('brain_model').scentNames;
  assert.deepEqual(Array.from(thin.odors), Array(8).fill(0));
  assert.deepEqual(Array.from(rich.odors), [ 1, 2, 3, 4, 5, 6, 7, 8 ]);
  assert.equal(info.odors.length, scents.length);
  assert.deepEqual(Array.from(info.odors), [ 1, 2, 3, 4, 5, 6, 7, 8 ]);
  assert.equal(info.metrics.length, 4, 'Water measurements fit the four tooltip rows');
  api('brain_model').initialize([ 'scentColors' ]);
  const scentCanvas = elements['tank-tooltip-scents'];
  const scentContext = scentCanvas.getContext('2d'), rectangles = [],
        originalFillRect = scentContext.fillRect;
  scentContext.fillRect = (...args) => rectangles.push(args);
  api('organ_graphics').drawScentWheel(scentCanvas, Array(8).fill(.1));
  const weakBars = rectangles.filter((_, i) => i % 2 === 1).map(r => r[2]);
  rectangles.length = 0;
  api('organ_graphics').drawScentWheel(scentCanvas, Array(8).fill(1));
  const strongBars = rectangles.filter((_, i) => i % 2 === 1).map(r => r[2]);
  assert.equal(weakBars.length, 8);
  assert(weakBars.every((width, i) => width > 8 && strongBars[i] > width),
         'All eight concentration bars remain visible and grow with actual concentration');
  rectangles.length = 0;
  api('organ_graphics').drawScentWheel(scentCanvas, Array(8).fill(0));
  assert(rectangles.filter((_, i) => i % 2 === 1).every(r => r[2] === 0),
         'Empty water does not invent an odor signal');
  scentContext.fillRect = originalFillRect;
  api('organ_graphics').drawScentWheel(scentCanvas, info.odors);
  for (const name of scents)
    assert(scentCanvas.title.includes(name), 'Scent chart includes every channel');
  assert(info.metrics.some(m => m[0] === 'Plankton') &&
         info.metrics.some(m => m[0] === 'Schwebsediment'));
  assert.equal(hover.tankWaterHit({x : 75, y : 75}, waterFrame), null,
               'Steine zeigen keinen Wasser-Mouseover');
  assert.equal(hover.tankWaterHit({x : -1, y : 10}, waterFrame), null,
               'Außerhalb des Beckens liegt kein Wasser');
  assert.equal(hover.tankWaterHit({x : 25, y : 75}, waterFrame).plankton, 0,
               'Planktonfreies Wasser ist ebenfalls ablesbar');
  const polygon = {...waterFrame, shapes : [ [ [ 60, 60 ], [ 80, 60 ], [ 80, 80 ], [ 60, 80 ] ] ]};
  assert.equal(hover.tankWaterHit({x : 65, y : 65}, polygon), null);

  {
    const rock = hover.tankSolidHit({x : 75, y : 75}, waterFrame);
    assert.equal(rock.kind, 'rock');
    assert.deepEqual(Array.from(hover.tankObjectInfo(rock).odors), [ 1, 2, 3, 4, 5, 6, 7, 8 ]);
    const specimen = Array(65).fill(0);
    specimen[4] = 123;
    specimen[8] = 1;
    specimen[22] = 2;
    specimen[23] = .8;
    waterFrame.species = [];
    api('state').initialize([ 'frameIndexes' ]);
    api('dom').initialize([ 'rgb' ]);
    const fishInfo = hover.tankObjectInfo({kind : 'fish', item : specimen, x : 75, y : 25});
    assert.equal(fishInfo.title, 'Fisch #123');
    assert.equal(fishInfo.metrics.length, 4);
    assert.deepEqual(Array.from(fishInfo.odors), [ 1, 2, 3, 4, 5, 6, 7, 8 ]);
    const sedimentInfo =
        hover.tankObjectInfo({kind : 'sediment', item : [], depth : 3, x : 75, y : 25});
    assert.deepEqual(Array.from(sedimentInfo.odors), [ 1, 2, 3, 4, 5, 6, 7, 8 ]);
    hover.updateHoverState({tankHoverKey : '', tankHoverSince : 0, persistent : false});
    assert(!hover.tankHoverReady('water:0', 1000));
    assert(hover.tankHoverReady('water:1', 1200),
           'Following a fish does not restart the hover delay');
    assert(hover.tankHoverReady('rock:0', 1210),
           'Objects passing beneath a still pointer update immediately');
    hover.updateHoverState({tankHoverSince : 1220});
    assert(!hover.tankHoverReady('fish:1', 1230), 'Human movement starts the normal dwell delay');
    hover.updateHoverState({persistent : true});
    assert(hover.tankHoverReady('fish:1', 1230), 'Persistent comparison skips the delay');
    hover.updateHoverState({persistent : false});
  }
  const worm = [ 20, 20, 8, 1, 0, 0, .8, 7, 0, 0, 0, 0, 0, 18 ];
  assert(hover.smallAnimalContains(worm, 20, 33, 1),
         'Der sichtbare Wurmkörper ist mit der Maus erreichbar');
  assert(!hover.smallAnimalContains(worm, 30, 33, 1), 'Wasser neben dem Wurm bleibt erreichbar');
  const nutrition = api('feeding_view');
  nutrition.initialize(
      [ 'foodSources', 'foodColors', 'foodShortNames', 'habitatSources', 'displayNumber' ]);
  assert.equal(nutrition.foodAmounts([ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ]).length, 12);
  const mixedRow = Array(api('schema').FISH.count).fill(0), MF = api('schema').FISH;
  mixedRow[MF.organs] = null;
  mixedRow[MF.morphology_asset] = 123;
  mixedRow[MF.gut_fill] = 37;
  mixedRow[MF.gut_energy] = 21;
  mixedRow[MF.feeding_action] = 7;
  api('transport').initialize([ 'lightCache' ]);
  const con = api('connection');
  con.connectionState.renderAssets = {'123' : [ [ 1 ], [], [], [], [], {} ]};
  const got =
      con.hydrateRender({fish : [ mixedRow ], corpses : [], species : [], light : {}}).fish[0];
  assert.equal(got[MF.gut_fill], 37);
  assert.equal(got[MF.gut_energy], 21);
  assert.equal(got[MF.feeding_action], 7);

  mixedRow[MF.mouth_pose] = .25;
  mixedRow[MF.bite_pose] = 1;
  mixedRow[MF.suction_pose] = .8;
  mixedRow[MF.feeding_action] = 6;
  mixedRow[MF.feeding_action_age] = 48;
  assert.equal(api('fish_forms').fishFeedingPose(mixedRow).mouthOpening, .25,
               'A contact event must never override the physical jaw opening');
  api('fish_geometry').initialize([ 'fishPlans', 'fishPlanOrder' ]);
  const mouth = api('fish_organs').fishMouthShape({
    forms : [],
    mouthOpening : .25,
    bitePose : 1,
    swallowPose : .8,
    aperture : 2,
    faceWidth : .5,
    snout : 1,
    headFront : .5,
    faceLength : .5,
    jaw : .5,
    mouthOffset : .7,
    origin : [ .2, 0 ]
  });
  assert(Math.abs(mouth.gap - .5015) < 1e-9);
  assert(Math.abs(mouth.front - .9) < 1e-9, 'Rendering uses the physical mouth point');

  const face = api('fish_geometry').fishShapeAnatomy({
    bodyGeometry : {
      headBack : .2,
      headLength : .3,
      faceLength : .2,
      faceWidth : .1,
      restShoulder : .2,
      baseHindLength : .5,
      chestLength : .4,
      trunk : .2
    },
    forms : [],
    organs : [],
    chestPlan : [ 1, 1, .5 ],
    torsoPlan : [ 1, 1, .5 ],
    mouthOffset : .7,
    origin : [ .2, 0 ],
    aperture : 2,
    yolk : 0,
    radius : 1,
    reserve : 0,
    spermFilled : 0,
    left : 0,
    right : 0
  });
  assert(Math.abs(face.snout - mouth.front) < 1e-9,
         'Even a wide gape must not grow a second snout in front of the physical mouth');
  const bed = [ 1, 10, 100, 90, 100, 0, -1 ];
  bed[15] = 20;
  bed[16] = 40;
  const paths = [], mask = {
    beginPath() {},
    moveTo(x, y) { paths.push([ x, y ]); },
    lineTo(x, y) { paths.push([ x, y ]); },
    closePath() {},
    clip(rule) { assert.equal(rule, 'outside'); }
  };
  api('state').sceneState.previous = null;
  water.clipSediment({plants : [ bed ]}, {scale : 1, ox : 0, oy : 0}, mask, [ 0 ], 1);
  assert(paths.some(p => p[0] === 10 && p[1] === 80));
  assert(paths.some(p => p[0] === 90 && p[1] === 60));
  assert(paths.some(p => p[0] === 50 && p[1] === 70),
         'Fish occlusion follows the sediment surface, including varying thickness');

  const hormones = api('hormones'), box = sandbox.document.createElement('div');
  const h = {
    rest : [ .01, .02, .03, .04 ],
    names : [
      {stem : 'Testin', suffix : 'orale', description : 'maulaktivierend'}, {stem : 'Testelin'},
      {stem : 'H3'}, {stem : 'H4'}
    ],
    levels : [ .2, .05 ],
    secretion : [ 1, 0 ],
    binding : [ 0, 2 ],
    current : {steps : 1, levels : [ .2, .05 ]},
    samples : 8,
    rounds : 3,
    total : 8,
    start : 1,
    end : 100,
    effects : Array.from({length : 8}, () => Array(23).fill(null)),
    learning : [ 0, null, .01, .02 ],
    lifetime : {contexts : [ {count : [ 32, 32 ], levels : [ [ .05, .05 ], [ .2, .03 ] ]} ]}
  };
  assert.equal(hormones.hormoneName(h, 0), 'H1', 'A proposed name is not a measured result');
  assert.equal(hormones.hormoneName(h, 1), 'H2');
  h.names[0].history = [ [ 100, 'orale', {samples : 8} ] ];
  assert.equal(hormones.hormoneName(h, 0), 'Testin orale');
  h.effects[0][0] = .02;
  h.effects[1][0] = -.01;
  let chosen = -1;
  hormones.renderIndividualHormones(box, h, k => chosen = k);
  box.children[1].onclick();
  assert.equal(chosen, 1, 'Each compact hormone bar opens its species details');
  hormones.renderSpeciesHormones(box, {id : 1, hormones : h});
  box.children[5].open = true;
  box.children[5].ontoggle();
  const before = box.children[5];
  hormones.renderSpeciesHormones(box, {id : 1, hormones : h});
  assert.strictEqual(box.children[5], before,
                     'Unchanged hormone profiles reuse the displayed charts');
  h.samples = 0;
  h.lifetime_effects = h.effects;
  hormones.renderSpeciesHormones(box, {id : 1, hormones : h});
  hormones.renderSpeciesHormones(box, {});
  assert(box.hidden);
  const resizeCallbacks = new Map();
  sandbox.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(canvas) { resizeCallbacks.set(canvas, this.callback); }
  };
  const chartCSS =
      fs.readFileSync('ui/style.css', 'utf8').match(/\.chart-canvas\s*\{([^}]+)\}/)?.[1];
  assert(chartCSS && /width:100%/.test(chartCSS) && /height:auto/.test(chartCSS),
         'Charts need CSS dimensions independent of their pixel buffers');
  // Model the browser's intrinsic canvas sizing: without CSS, buffer changes also change layout.
  function chartLayout(canvas, width) {
    const layout = {width, visible : true};
    canvas.getBoundingClientRect = () => {
      if (!layout.visible)
        return {width : 0, height : 0};
      const width = canvas.classList.contains('chart-canvas') ? layout.width : canvas.width,
            ratio = canvas.style.aspectRatio?.split('/').map(Number),
            aspect = ratio ? ratio[0] / ratio[1] : canvas.width / canvas.height;
      return {width, height : width / aspect};
    };
    return layout;
  }
  const chartCanvas = sandbox.document.createElement('canvas');
  chartCanvas.id = 'resize-check';
  chartCanvas.width = 280;
  chartCanvas.height = 160;
  const chartLayoutState = chartLayout(chartCanvas, 277.3);
  let redraws = 0;
  function redrawChart() {
    ++redraws;
    api('dom').chartContext(chartCanvas, redrawChart);
  }
  for (const ratio of [2, 1.25, 1.5, 1, 3])
    for (const width of [277.3, 180, 420]) {
      sandbox.window.devicePixelRatio = ratio;
      chartLayoutState.width = width;
      redrawChart();
      const before = redraws;
      for (let i = 0; i < 16; ++i)
        resizeCallbacks.get(chartCanvas)();
      assert.equal(redraws, before, 'Chart resizing must settle without a feedback loop');
      assert.equal(chartCanvas.width, Math.round(width * ratio));
      assert.equal(chartCanvas.getBoundingClientRect().width, width);
      assert.equal(chartCanvas.getBoundingClientRect().height, width * 160 / 280);
    }
  chartLayoutState.visible = false;
  const hiddenRedraws = redraws;
  resizeCallbacks.get(chartCanvas)();
  assert.equal(redraws, hiddenRedraws);
  chartLayoutState.width = 210;
  chartLayoutState.visible = true;
  resizeCallbacks.get(chartCanvas)();
  assert.equal(redraws, hiddenRedraws + 1, 'Reopened charts redraw at their new size');
  resizeCallbacks.get(chartCanvas)();
  assert.equal(redraws, hiddenRedraws + 1);
  sandbox.window.devicePixelRatio = 2;
  api('dom').initialize([ 'el', 'text', 'rgb', 'uiIconPaths' ]);
  api('state').initialize([ 'frameIndexes' ]);
  api('dom').initialize([ 'rgb' ]);
  api('fish_geometry').initialize([ 'fishPlans', 'fishPlanOrder' ]);
  api('fish_forms').initialize([ 'fishAnatomyCache', 'fishOverviewEpoch', 'fishOverviewShapes' ]);
  api('fish_fins').initialize([ 'fishTemplateScales' ]);
  api('feeding_view').initialize([
    'deathNames', 'displayNumber', 'fishStatCells', 'lastSelectedProfile', 'fishStatEpoch'
  ]);
  const F = api('schema').FISH, C = api('schema').CORPSE;
  const preview = JSON.parse(
      require('child_process')
          .execFileSync(require('path').join(process.env.BUILD_DIR || 'bin', 'fish'),
                        [ '--preview-genome', 'genomes/cppn-start.genome' ], {encoding : 'utf8'}));
  Object.assign(api('state').sceneState, {frame : {width : 615, height : 410, parameters : {}}});
  for (const fill of [0, 160])
    for (const angle of [0, Math.PI / 2, 3.1]) {
      const p = preview.slice();
      p[F.x] = 2;
      p[F.y] = 100;
      p[F.egg_yolk] = fill;
      p[F.angle] = angle;
      const a = api('fish_forms').fishAnatomy(p),
            center = (a.snout + api('fish_forms').fishAlong(a, -.95)) / 2,
            radius = api('fish_fins').fishRenderRadius(p), dx = (center - a.origin[0]) * radius,
            dy = -a.origin[1] * radius, x = p[F.x] + dx * Math.cos(angle) - dy * Math.sin(angle),
            y = p[F.y] + dx * Math.sin(angle) + dy * Math.cos(angle);
      assert(api('fish_forms').fishBodyContains(p, x, y, 3, 2.9));
      assert(api('fish_forms').fishBodyContains(p, x + 615, y, 3, 2.9),
             'Early bounds must preserve selection across the tank seam');
      assert(!api('fish_forms').fishBodyContains(p, x, y + 100, 3, 2.9));
    }
  {
    const organs = api('fish_organs'), base = api('fish_forms').fishAnatomy(preview),
          anatomy = {...base, gutFilling : .8}, nerve = api('brain_geometry'),
          record = api('brain_occlusion').brainRecordPath;
    const length = a => {
      let total = 0, previous = organs.fishGutPoint(a, 0);
      for (let k = 1; k <= 160; ++k) {
        const p = organs.fishGutPoint(a, k / 160);
        total += Math.hypot(p[0] - previous[0], p[1] - previous[1]);
        previous = p;
      }
      return total;
    };
    assert(length({...anatomy, gutLength : 1}) > length({...anatomy, gutLength : 0}),
           'Longer guts have a longer path for the current body');
    const referenceBody = {
      ...anatomy,
      shoulder : .4,
      joinWidth : .4,
      headBack : 0,
      chestBack : -.5,
      chestLength : .5
    };
    assert(length({...referenceBody, gutLength : 1}) >
               length({...referenceBody, gutLength : 0}) * 1.5,
           'Coiling substantially lengthens the gut in a fixed body shape');
    for (const draw of [organs.fishGutPath, organs.fishGlandPath, organs.fishMouthPath]) {
      const path = record(g => draw(g, 200, anatomy));
      assert(path.length > 15 && path.every(([, args ]) => args.every(Number.isFinite)));
    }
    assert.notEqual(JSON.stringify(record(g => organs.fishGlandPath(g, 200, anatomy))),
                    JSON.stringify(record(g => organs.fishGutPath(g, 200, anatomy))));
    for (const mode of ['network', 'organs']) {
      api('brain').brainState.brainView = mode;
      assert.equal(
          nerve.brainCellDetail(preview, {scale : 500 / api('fish_fins').fishBodyRadius(preview)}),
          1, 'Maximum zoom reveals neurons in both views');
    }
    const narrow = nerve.fishCNSShape({...anatomy, cord : 10, cnsShapeCache : null}),
          broad = nerve.fishCNSShape({...anatomy, cord : 80, cnsShapeCache : null});
    assert(broad.cord > narrow.cord, 'Nerve strand reflects its tissue quantity');
    const end = organs.fishTonguePoint(anatomy, 1), start = organs.fishGutPoint(anatomy, 0);
    assert(Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-8,
           'Throat ends at the actual gut entrance');
  }
  const egg = Array(F.count - 1).fill(0);
  egg[F.id] = 17;
  egg[F.energy] = 30;
  egg[F.radius] = 2;
  let frame = {
    width : 615,
    height : 410,
    selected : 17,
    fish : [ egg ],
    corpses : [],
    species : [ {id : 3, name : 'Testart'} ]
  };
  assert.equal(api('state').frameFish(frame)[F.hatched], 0);
  const fish = egg.slice();
  fish[F.hatched] = 1;
  frame = {...frame, fish : [ fish ]};
  assert.equal(api('state').frameFish(frame)[F.hatched], 1);
  const corpse = Array(C.count).fill(0);
  corpse[C.source_id] = 17;
  corpse[C.species] = 3;
  corpse[C.energy] = 20;
  corpse[C.initial_energy] = 30;
  corpse[C.hatched] = 1;
  corpse[C.radius] = 4;
  corpse[C.morphology_asset] = null;
  frame = {...frame, fish : [], corpses : [ corpse ]};
  Object.assign(api('state').sceneState, {frame});
  for (let i = 0; i < 3; i++)
    elements['life-stages'].append(sandbox.document.createElement('span'));
  const remainsCanvas = elements['remains-portrait'],
        remainsLayout = chartLayout(remainsCanvas, 280);
  api('selection').showSelection(frame);
  for (const width of [280, 180, 280]) {
    remainsLayout.width = width;
    for (let i = 0; i < 16; ++i)
      resizeCallbacks.get(remainsCanvas)();
    assert.equal(remainsCanvas.width, width * 2, 'Cadaver portrait keeps a bounded pixel buffer');
    assert.equal(remainsCanvas.getBoundingClientRect().height, width * 160 / 280);
  }
  assert.equal(elements['remains-body'].hidden, false);
  assert.equal(elements['selection-body'].hidden, true);
  assert.equal(elements['fish-title'].textContent, 'Kadaver #17');
  assert.equal(elements['tab-fish'].textContent, 'Kadaver');
  assert.equal(api('state').frameCorpse(frame), corpse);
  assert.equal(elements['remains-genome'].href, '/genome?id=17');
  const p = preview;
  corpse[C.morphology_asset] = [
    p[32], p[58], p[59], p[66],
    [
      p[5], p[53], p[46], p[67], p[48], p[68], p[50], p[44], ...p[57].slice(0, 3), p[19], p[64],
      p[65], p[26], p[23], p[27], p[60], ...p[74], p[63]
    ],
    p[70], p[F.body_geometry]
  ];
  api('selection').showSelection(frame);
  assert.equal(api('diagnostics').displayFaults.issues.size, 0,
               'Real corpse anatomy renders successfully');
  api('evolution').evolutionState.activeView = 'fish';
  api('state').sceneState.tankPreviewFish = 17;
  api('selection').showSelection({...frame, selected : 18});
  assert.equal(elements['fish-title'].textContent, 'Kadaver #17 · Vorschau');
  assert.equal(elements['deselect'].hidden, true);
  assert.equal(api('hover').tankPanelFrame({...frame, selected : 18}).selected, 17);
  assert.equal(api('hover')
                   .tankPanelFrame({...frame, selected : 18, selected_body : {jaw_length : .99}})
                   .selected_body,
               null, 'Hover must not inherit the selected fish body');
  api('state').sceneState.tankPreviewFish = 0;
  api('brain').brainState.brainLastFish = 17;
  api('brain').brainState.brainAcquireCandidate = {id : 18};
  api('brain').brainAcquireAfterDeath(frame, {scale : 10}, 1000);
  assert.equal(api('brain').brainState.brainAcquireCandidate, null,
               'Selected corpse prevents automatic replacement by another fish');
  const broken = corpse.slice();
  broken[C.morphology_asset] = [ null ];
  api('selection').showSelection({...frame, corpses : [ broken ]});
  assert.equal(elements['remains-body'].hidden, false);
  assert(api('diagnostics').displayFaults.issues.has('Kadaverbild'));
  assert.equal(elements['remains-genome'].href, '/genome?id=17',
               'Portrait failure preserves card and actions');
  api('diagnostics').displayFaults.clear('Kadaverbild');
  const remains = api('state').frameCorpse({...frame, selected : 18});
  assert.equal(remains, undefined);
  api('dom').initialize([ 'canvas' ]);
  api('world').initialize([ 'toolNames' ]);
  api('world_palette').initialize([ 'plantNames' ]);
  api('world').beginEggPlacement(17);
  assert.equal(elements['egg-placement'].hidden, false,
               'Egg tool offers a visible quantity control');
  const eggPreview = api('world').eggPlacementPoints({x : 200, y : 200}, 12);
  assert.equal(eggPreview.length, 12);
  assert(eggPreview.every(
             (p, i) => eggPreview.every((q, j) => i === j || Math.hypot(p.x - q.x, p.y - q.y) > 5)),
         'Preview eggs have individually visible positions');
  api('camera').resetCamera();
  api('state').sceneState.frame = {width : 1000, height : 800};
  elements['egg-placement-count'].value = '12';
  api('world').initialize([ 'onpointerdown' ]);
  await api('dom').canvas.onpointerdown({button : 0, clientX : 700, clientY : 450});
  assert.deepEqual(requests.slice(-2).map(r => [r.command, r.value ?? r.count]),
                   [ [ 'select', 17 ], [ 'eggs', 12 ] ],
                   'Placement selects with the protocol value field, then sends the chosen count');
  assert.equal(elements['egg-placement'].hidden, true, 'Successful placement closes the preview');
  api('world').endEggPlacement();
  assert.equal(elements['egg-placement'].hidden, true);
  const points = api('world').planterPoints({x : 40, y : 100}, {x : 240, y : 80}, 12);
  assert.equal(points.length, 8);
  assert.equal(points[2].y, points[3].y);
  assert(points[2].y > points[1].y && points[3].y > points[4].y);
  const rock = (x, y) => [[ -10, -10 ], [ 10, -10 ], [ 10, 10 ], [ -10, 10 ]].map(
            ([ dx, dy ]) => ({x : x + dx, y : y + dy})),
        bottom = v => Math.max(...v.map(p => p.y)), snap = api('rock_geometry').snapRock,
        empty = {width : 615, height : 410, obstacles : [], shapes : []}, shelf = {
          ...empty,
          obstacles : [ [ 110, 260, 32 ] ],
          shapes : [ [ [ 80, 250 ], [ 140, 250 ], [ 140, 270 ], [ 80, 270 ] ] ]
        },
        at = snap(rock(110, 200), shelf);
  assert.equal(bottom(at), 250, 'Rock lands flush on a platform');
  assert.equal(bottom(snap(rock(110, 260), shelf)), 250,
               'An overlapping preview lifts onto its support');
  assert.equal(bottom(snap(rock(110, 280), shelf)), 410,
               'Rock below a platform falls away from its underside');
  assert.equal(bottom(snap(rock(150, 200), shelf)), 410,
               'Tangential side contact does not hang the rock in mid-air');
  assert.equal(bottom(snap(rock(725, 200), shelf)), 250, 'Snapping respects the periodic tank');
  assert.equal(bottom(snap(rock(110, 200), {...empty, obstacles : [ [ 110, 300, 30 ] ]})), 270,
               'Circular supports use their actual surface');
  assert.equal(bottom(snap(rock(150, 200), {...empty, obstacles : [ [ 110, 300, 30 ] ]})), 410,
               'Tangency with the side of a round support allows sliding down');
  const pot =
      {...empty, obstacles : [ [ 140, 100, 110 ] ], shapes : [ points.map(p => [p.x, p.y]) ]};
  assert.equal(bottom(snap(rock(100, 60), pot)), 100, 'Rock fits into a concave planter');
  assert.equal(bottom(snap(rock(100, 60), {...pot, sediment : [ [ 100, 80, 20 ] ]})), 100,
               'Sediment does not block insertion down to solid ground');
  const shape = api('rock_geometry').newRockShape(() => .5);
  assert(shape.length >= 5 && shape.length <= 10);
  assert.equal(shape.filter(p => p.y === bottom(shape)).length, 2, 'Rock has a flat contact face');
  assert.notEqual(JSON.stringify(shape),
                  JSON.stringify(api('rock_geometry').newRockShape(() => .8)));
  api('world').initialize([ 'rockControls' ]);
  elements['brush'].value = '28';
  elements['rock-snap'].checked = true;
  Object.assign(api('world').worldState, {tool : 'rock', rockShape : shape});
  api('state').sceneState.frame = shelf;
  const placement = api('world').rockPlacement({x : 110, y : 200});
  assert.strictEqual(api('world').rockPlacement({x : 110, y : 200}), placement,
                     'Stationary preview reuses its geometry');
  elements['rock-snap'].checked = false;
  const free = api('world').rockPlacement({x : 110, y : 200});
  assert(bottom(free) < 250, 'Free placement bypasses snapping');
  elements['rock-snap'].checked = true;
  let placed;
  sandbox.fetch = async (url, options) => ({
    ok : true,
    json : async () => {
      placed = JSON.parse(options.body);
      return {};
    }
  });
  assert(await api('world').applyTool({x : 110, y : 200}));
  assert.equal(placed.command, 'polygon');
  assert.equal(JSON.stringify(placed.points), JSON.stringify(placement),
               'Committed rock matches the preview exactly');
  const grain = [ 100, 200, 40, 31, 0, 0, 4, 0, 1, .2, .1 ],
        displayRadius = api('particle_renderer').foodDisplayRadius;
  for (const kind of [1, 2, 3, 4]) {
    const bit = [...grain ];
    bit[7] = kind;
    assert.equal(displayRadius(bit), bit[6], 'Natural morsels retain the transmitted radius');
    const sides = Math.floor(api('particle_renderer').foodShape(bit));
    assert(kind === 4 ? sides === 6 : kind === 3 ? sides >= 5 && sides <= 7 : sides === 0);
    assert.equal(bit[6], 4, 'Drawing leaves the collision radius unchanged');
  }
  const own = {
    id : 17,
    profile_labels : [ 'Gleiter' ],
    summary_labels : [ 'Gleiter' ],
    trait_details : {}
  },
        species = {
          id : 3,
          profile_labels : [ 'Gspürnasn', 'Segler' ],
          summary_labels : [ 'Gspürnasn' ],
          trait_details : {}
        };
  // One list: species words first, then words only this fish shows, outlined.
  const words = elements['fish-trait-words'];
  api('dom').renderMergedTraitChips(words, species, own);
  assert.equal(words.children[0].children[1].textContent, 'Gspürnasn');
  assert.equal(words.children[1].children[1].textContent, 'Gleiter');
  assert(words.children[1].classList.contains('own-trait'));
  assert.equal(words.children.length, 2);
  api('state').sceneState.frame = frame;
  const sort = api('population_picker').rankPopulation;
  const rows = [
    {name : 'A', sense_cells : {eye : 2}}, {name : 'B', sense_cells : {eye : 8}}, {name : 'C'}
  ];
  assert.equal(sort(rows, 'eye')[0].name, 'B');
  assert.equal(sort(rows, 'eye', false).at(-1).name, 'C');
  let response, delivered;
  sandbox.self = {postMessage : data => { delivered = structuredClone(data); }};
  sandbox.fetch = async () =>
      ({ok : true, headers : {get : () => '0'}, text : async () => JSON.stringify(response)});
  const worker = load('statistics_worker.js');
  await worker.link(load);
  await worker.evaluate();
  response = {
    session : 'test',
    frame : {...frame, corpses : []},
    species_profiles : {3 : {diet : [ 2, 1 ], trait_details : {Augen : {evidence : '13'}}}},
    species_profile_ids : [ 3 ],
    species_key : 'test:1'
  };
  await sandbox.self.onmessage({data : {url : '/state', ticket : 1, reset : 1}});
  assert(!delivered.error, delivered.error);
  assert.equal(delivered.result.species_updates[0].trait_details.Augen.evidence, '13');
  assert(!('species_profiles' in delivered.result));
  assert(!('species' in delivered.result.prepared_frame));
  response.species_profiles = {};
  await sandbox.self.onmessage({data : {url : '/state', ticket : 2, reset : 1}});
  assert.equal(delivered.result.species_updates.length, 0);
  response.species_profiles = {3 : {diet : [ 3, 1 ], trait_details : {Augen : {evidence : '13'}}}};
  await sandbox.self.onmessage({data : {url : '/state', ticket : 3, reset : 1}});
  assert.equal(delivered.result.species_updates[0].diet[0], 3);
  assert(!('trait_details' in delivered.result.species_updates[0]));
  api('brain_model').initialize([
    'sensorNames', 'motorNames', 'brainSenseColors', 'brainMotorColors'
  ]);
  api('brain').initialize([ 'brainClamp' ]);
  api('organ_readout').initialize([ 'organPercent' ]);
  const organCanvas = sandbox.document.createElement('canvas'), drawnNames = [];
  organCanvas.getContext = () => new Proxy({
    fillText(name) {
      assert.equal(typeof name, 'string');
      drawnNames.push(name);
    }
  },
                                           {get(o, k) { return o[k] || (() => {}); }});
  const organNode = Array(24).fill(0);
  organNode[5] = 7;
  organNode[11] = 1;
  organNode[12] = .1;
  organNode[13] = Array(11).fill(.01);
  organNode[13][10] = 1;
  organNode[14] = Array(10).fill(.02);
  const receptor = Array(15).fill(.1);
  receptor[0] = 7;
  receptor[9] = organNode[13];
  const organData = {
    nodes : new Map([ [ 7, organNode ] ]),
    receptors : new Map([ [ 7, receptor ] ]),
    b : {
      effectors : [ 1, 2, 6, 4, 5, 10, 11, 7, 12, 13 ].map(port => [7, port, .2]),
      sensory_components : []
    }
  };
  for (const key of [...Array.from({length : 11}, (_, k) => 's' + k),
                     ...Array.from({length : 10}, (_, k) => 'm' + k), 'internal']) {
    api('organ_tuning')
        .drawOrganTuning(organCanvas, {}, organData, {key, members : [ {n : organNode} ]});
    assert.equal(typeof api('brain').brainTissueName(key), 'string');
  }
  assert(drawnNames.includes('Blutwerte'), 'The internal chemical sense identifies blood values');
  console.log('UI-Module, Lebenszyklus-Karte, Pflanzbecken und grafische Sortierung: OK');
  console.log('Statistik-Worker: Profiländerungen ohne doppelte Übertragung: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
