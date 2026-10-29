const {readUI} = require('./ui_source.js');
// Renderer contract: simulation data uploads once; camera and blend changes only update uniforms.
const fs = require('fs'), vm = require('vm'), assert = require('assert'),
      gpuSource = readUI('ui/renderer.js') + '\n' + readUI('ui/vegetation.js');
function context() {
  const calls = [], gl = new Proxy({VERSION : 1, COMPILE_STATUS : 2, LINK_STATUS : 3, calls}, {
                      get(target, key) {
                        if (key in target)
                          return target[key];
                        if (/^[A-Z_\d]+$/.test(key))
                          return target[key] = Object.keys(target).length + 10;
                        return target[key] = (...args) => {
                          calls.push([ key, ...args ]);
                          if (key === 'getParameter')
                            return 'WebGL 2.0';
                          if (key === 'getShaderParameter' || key === 'getProgramParameter')
                            return true;
                          if (key === 'isContextLost')
                            return false;
                          if (key.startsWith('create'))
                            return {};
                          if (key === 'getUniformLocation')
                            return args[1];
                        };
                      }
                    });
  return gl;
}
function renderer(gl, blits = []) {
  return {
    gl,
    stats : {draws : 0, vertices : 0},
    beginExternal() {},
    endExternal() {},
    save() {},
    restore() {},
    drawImage : (...args) => blits.push(args)
  };
}
const gl = context(), listeners = {}, canvas = {
  width : 100,
  height : 100
},
      gpuCanvas = {
        width : 1,
        height : 1,
        getContext : () => gl,
        addEventListener : (name, fn) => listeners[name] = fn
      },
      blits = [];
const sandbox = {
  document : {createElement : () => gpuCanvas},
  canvas,
  ctx : renderer(gl, blits),
  frameRevision : 1,
  water_viewState : {},
  viewportWidth : 100,
  viewportHeight : 100,
  previous : null,
  frame : null,
  gpuAnimals : null,
  displayLight : () => 1,
  displayNow : () => 1000,
  displayStep : f => f.step || 0,
  clipObstacles() {},
  sedimentGeometry : (f, nx, ny) => ({mask : new Uint8Array(nx * ny * 16).fill(1)}),
  horizontalDelta : x => x
};
vm.createContext(sandbox);
vm.runInContext(gpuSource, sandbox);
function plant(id, q = [ 8, 100, 8, 80, 12, 60, 16, 40 ]) {
  return [
    id,
    0,
    100,
    16,
    100,
    0,
    -1,
    0,
    160,
    1,
    160,
    0,
    16,
    1,
    1.2,
    0,
    0,
    [ 0, 0, 0, id, 0 ],
    [ .2, .5, .3 ],
    0,
    [ [ 0, 0, -1, q, 1.2, 1, 160, 1, 1, [ .2, .5, .3 ] ] ],
    1
  ];
}
sandbox.plant = plant;
const f = {
  plants : [ plant(1), plant(2), plant(3) ],
  parameters : {grass_capacity : 160}
},
      camera = {
        scale : 1,
        ox : 0,
        oy : 0
      };
sandbox.fixture = f;
sandbox.camera = camera;
assert(vm.runInContext('paintGpuGrass(fixture,camera,0,[0])', sandbox));
assert.equal(blits.length, 0);
let uploads = gl.calls.filter(c => c[0] === 'bufferSubData'),
    draws = gl.calls.filter(c => c[0] === 'drawArraysInstanced');
assert.equal(uploads.length, 1);
assert.equal(draws.length, 1);
assert.equal(draws[0][4], 3);
assert.equal(uploads[0][3].length, 3 * 34); // 26 shape floats plus two bite marks
assert.equal(gl.calls.filter(c => c[0] === 'vertexAttribDivisor' && c[2] === 0).length, 1);
vm.runInContext('paintGpuGrass(fixture,{...camera,ox:17,scale:.5},.5,[0])', sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'bufferSubData').length, 1,
             'Panning and interpolation must not re-upload plants');
vm.runInContext('frameRevision++;previous=fixture;paintGpuGrass(fixture,camera,.5,[0])', sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'bufferSubData').length, 1,
             'Unchanged plant snapshots must not rebuild on fish-only frames');
gl.isContextLost = () => true;
assert.equal(vm.runInContext('paintGpuGrass(fixture,camera,1,[0])', sandbox), false,
             'A lost shared context suspends native batches');
gl.isContextLost = () => false;
vm.runInContext('resetTankBatches()', sandbox);
assert(vm.runInContext('paintGpuGrass(fixture,camera,1,[0])', sandbox));
vm.runInContext(
    'frameRevision++;fixture.plants[0]=fixture.plants[0].slice();fixture.plants[0][20]=Array.from({length:3},(_,i)=>{const o=fixture.plants[0][20][0].slice();o[0]=i;return o});fixture.plants=fixture.plants.slice();paintGpuGrass(fixture,camera,1,[0])',
    sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'drawArraysInstanced').at(-1)[4], 5,
             'All independently positioned stems must reach the GPU');
// Stable crown depth preserves independent floating stems in one instanced draw.
vm.runInContext(
    `frameRevision++;fixture.plants=Array.from({length:2},(_,i)=>{const p=fixture.plants[0].slice();p[0]=i+10;p[20]=Array.from({length:3},(_,j)=>[j,0,-1,[i*30+j,100,0,80,0,60,0,40],1.2,1,160,1,1,[.2,.5,.3]]);p[17]=[0,0,1,p[0],0];return p;});paintGpuGrass(fixture,camera,1,[0])`,
    sandbox);
const layered = gl.calls.filter(c => c[0] === 'bufferSubData').at(-1)[3];
assert.deepEqual(Array.from({length : 6}, (_, i) => layered[i * 34 + 8]), [ 0, 1, 2, 30, 31, 32 ],
                 'Each crown keeps its stable depth while crowns interleave with animals');
const beforeEmpty = gl.calls.filter(c => c[0] === 'drawArraysInstanced').length;
assert.equal(
    gl.calls.filter(c => c[0] === 'drawArraysInstanced').slice(-2).reduce((n, c) => n + c[4], 0), 6,
    'Both organ tessellation buckets are drawn');
vm.runInContext('frameRevision++;fixture={plants:[]};paintGpuGrass(fixture,camera,1,[0])', sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'drawArraysInstanced').length, beforeEmpty,
             'Empty worlds must not draw stale grass');
const brokenGl = context();
brokenGl.getShaderParameter = () => false;
brokenGl.getProgramParameter = () => false;
const broken = {
  canvas,
  ctx : {gl : brokenGl}
};
vm.createContext(broken);
vm.runInContext(gpuSource, broken);
assert.throws(() => vm.runInContext('paintGpuGrass({},null,1,[])', broken),
              'Shader failure must be explicit');
assert.equal(brokenGl.calls.filter(c => c[0] === 'deleteProgram').length, 1,
             'Failed programs are released');
// Separate organs retain their widths, parent links and material colors in one draw.
vm.runInContext(
    `frameRevision++;fixture={plants:[(()=>{const p=plant(91);p[20]=[[0,1,-1,[8,100,8,80,12,60,16,40],.6,2.2,30,1,.5,[.2,.4,.15]],[1,3,0,[16,40,24,35,30,35,40,32],5,1,40,1,1,[.3,.7,.2],1,[.5,-.4,.1]]];return p;})()]};paintGpuGrass(fixture,camera,1,[0])`,
    sandbox);
const organs = gl.calls.filter(c => c[0] === 'bufferSubData').at(-1)[3];
assert.equal(organs.length, 68);
assert(Math.abs(organs[17] - .6) < 1e-6 && organs[34 + 17] === 5,
       'Stem and leaf widths remain independent');
assert(Math.abs(organs[34 + 26] - .5) < 1e-6 && Math.abs(organs[34 + 27] + .4) < 1e-6 &&
           organs[26] === 0 && organs[27] === 0,
       'Bite marks reach only the bitten organ');
// Real wake integration: size, swept contact, release, pauses and the tank seam.
function wake(radius, x = 6, offset = 0) {
  const scene = {frameRevision : 0, previous : null, frame : null, plant};
  vm.createContext(scene);
  vm.runInContext(gpuSource, scene);
  scene.radius = radius;
  scene.start = x;
  scene.offset = offset;
  vm.runInContext(`{
  const p=plant(1,[offset+8,100,offset+8,80,offset+8,60,offset+8,40]);
  const fish=Array(59).fill(0);fish[0]=start;fish[1]=60;fish[4]=7;fish[8]=1;fish[23]=1;fish[51]=radius;
  globalThis.scene={step:0,width:200,plants:[p],fish:[fish]};prepareGrassWakes(scene);
  previous=structuredClone(scene);scene.fish[0][0]=(start+4)%200;scene.step=4;frameRevision++;prepareGrassWakes(scene);
  globalThis.bent=grassWakeCurve(p,0).next;globalThis.first=grassWakeCurve(p,0).before;
 }`,
                  Object.assign(scene, {structuredClone}));
  return scene;
}
const small = wake(2), large = wake(10);
assert(large.bent[6] > small.bent[6], 'Larger fish bend the tip farther');
assert(small.bent[6] > small.first[6] + .5, 'A passing fish produces a visible wake');
assert.equal(large.bent[0], large.first[0]);
assert.equal(large.bent[1], large.first[1], 'Roots stay anchored');
const distant = wake(10, 100);
assert.deepEqual(Array.from(distant.bent), Array.from(distant.first),
                 'Distant fish leave grass still');
const seam = wake(10, 198, -4);
assert(seam.bent[6] > seam.first[6] + .5, 'Contact crosses the connected tank sides');
vm.runInContext(
    `previous=structuredClone(scene);scene.fish=[];frameRevision++;prepareGrassWakes(scene);globalThis.paused=grassWakeCurve(scene.plants[0],0).next`,
    large);
assert.deepEqual(Array.from(large.paused), Array.from(large.bent),
                 'Pause does not advance the spring');
vm.runInContext(
    `globalThis.signs=[];for(let i=0;i<160;++i){previous=structuredClone(scene);scene.step++;frameRevision++;prepareGrassWakes(scene);signs.push(grassWakeCurve(scene.plants[0],0).next[6]-first[6]);}`,
    large);
assert(large.signs.some(x => x < -.2), 'Released grass swings past its resting shape');
assert(Math.abs(large.signs.at(-1)) < .01, 'Wake settles after release');
console.log('GPU-Gras: Instanzen, Kamera, Datenfluss, Kontextverlust und gemeinsamer Kontext: OK');
// Visual fish wakes respect leaf margins and polygon/circle walls, including the side seam.
assert(vm.runInContext(
    `plantCurveClear({width:200,height:200,obstacles:[[50,60,4]]},[42,100,42,80,42,60,42,40],2,2)`,
    sandbox));
assert(
    !vm.runInContext(
        `plantCurveClear({width:200,height:200,obstacles:[[50,60,4]]},[46,100,46,80,46,60,46,40],2,2)`,
        sandbox),
    'A leaf margin cannot enter a circular rock');
assert(
    !vm.runInContext(
        `plantCurveClear({width:200,height:200,obstacles:[[50,60,4]],shapes:[[[48,20],[52,20],[52,110],[48,110]]]},[47,100,47,80,47,60,47,40],2,3)`,
        sandbox),
    'Broad leaf margins respect polygon platforms');
assert(
    !vm.runInContext(
        `plantCurveClear({width:200,height:200,obstacles:[[198,60,4]]},[2,100,2,80,2,60,2,40],2,2)`,
        sandbox),
    'The leaf collision check follows the connected tank sides');
vm.runInContext(`{
 const clear=plantCurveClear,geometry=plantWakeGeometry;globalThis.wakeGeometryBuilds=0;globalThis.wakeWallChecks=0;
 plantWakeGeometry=f=>{wakeGeometryBuilds++;return geometry(f);};plantCurveClear=(...args)=>{wakeWallChecks++;return clear(...args);};
 const p=structuredClone(fixture.plants[0]);p[0]=993;const f={width:200,height:200,step:30,plants:[p],fish:[],obstacles:[[150,150,4]]};previous={...f,step:29};frameRevision++;prepareGrassWakes(f);
 plantWakeGeometry=geometry;plantCurveClear=clear;
}`,
                Object.assign(sandbox, {structuredClone}));
assert.equal(sandbox.wakeGeometryBuilds, 1, 'Obstacle geometry is prepared once per snapshot');
assert.equal(sandbox.wakeWallChecks, 0,
             'Still stems do not trigger checks for nonexistent inherited motion');
// Sediment motion stays on the GPU between snapshots, without re-uploading camera changes.
const sedimentGl = context(), sedimentEvents = {}, sedimentCanvas = {
  width : 1,
  height : 1,
  getContext : () => sedimentGl,
  addEventListener : (name, fn) => sedimentEvents[name] = fn
},
      sedimentBlits = [];
const sedimentSandbox = {
  water_viewState : {},
  gpuAnimals : null,
  document : {createElement : () => sedimentCanvas},
  canvas,
  ctx : renderer(sedimentGl, sedimentBlits),
  viewportWidth : 100,
  viewportHeight : 100
};
vm.createContext(sedimentSandbox);
vm.runInContext(gpuSource, sedimentSandbox);
vm.runInContext(
    'globalThis.grains=[[0,0,16,16,1,2,.1,.8,.3,.7,0,0]];paintGpuSediment({}, {scale:1,ox:0,oy:0},10,grains);paintGpuSediment({}, {scale:2,ox:17,oy:4},11,grains)',
    sedimentSandbox);
assert.equal(sedimentGl.calls.filter(c => c[0] === 'bufferData').length, 1,
             'Interpolated sediment does not upload again');
assert.equal(sedimentGl.calls.filter(c => c[0] === 'drawArrays').length, 2,
             'All sediment grains share one draw per image');
assert.equal(sedimentBlits.length, 0);
sedimentGl.isContextLost = () => true;
assert.equal(
    vm.runInContext('paintGpuSediment({}, {scale:1,ox:0,oy:0},12,grains)', sedimentSandbox), false,
    'Lost shared context suspends sediment drawing');
sedimentGl.isContextLost = () => false;
vm.runInContext('resetTankBatches()', sedimentSandbox);
assert(vm.runInContext('paintGpuSediment({}, {scale:1,ox:0,oy:0},13,grains)', sedimentSandbox));
console.log('GPU-Sediment: ein Zeichenaufruf, Kamera, Interpolation und Kontextverlust: OK');
vm.runInContext(`{
 frameRevision=101;
 const field={width:100,height:100,daylight:.1,light:{columns:2,rows:2,bottom:.35,values:[1,1,1,1],clear_values:[1,1,1,1],clear_asset:1}};
 paintGpuCloudLight(field,{scale:1,ox:0,oy:0});
}`,
                sedimentSandbox);
assert.equal(sedimentGl.calls.filter(c => c[0] === 'uniform1f' && c[1] === 'daylight').at(-1)[2],
             .1, 'The water background receives the current daylight without rebuilding scenery');
// Food batching keeps independently positioned grains and interpolates on the GPU.
sandbox.previousFood = new Map([ [ 1, [ 5, 7, 20, 1, 0, 0, 2, 0 ] ] ]);
sandbox.horizontalDelta = dx => dx;
sandbox.foodRichness = energy => Math.min(1, energy / 200);
vm.runInContext(
    `frameRevision++;fixture={food:[[8,9,20,1,0,0,2,0],[20,30,40,2,0,0,3,1,.2,.4,.6]],parameters:{food_bright:200}};paintGpuFood(fixture,camera,.5)`,
    sandbox);
const grains = gl.calls.filter(c => c[0] === 'bufferData').at(-1)[2];
assert.deepEqual(Array.from(grains).slice(0, 6), [ 5, 7, 8, 9, 2, 2 ]);
assert.equal(grains.length, 22, 'Each grain includes its display shape');
assert.equal(gl.calls.filter(c => c[0] === 'drawArraysInstanced').at(-1)[4], 2);
const foodUploads = gl.calls.filter(c => c[0] === 'bufferData').length;
vm.runInContext('paintGpuFood(fixture,{...camera,ox:11},.9)', sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'bufferData').length, foodUploads,
             'Camera and interpolation must not upload grains again');
gl.isContextLost = () => true;
assert.equal(vm.runInContext('paintGpuFood(fixture,camera,1)', sandbox), false);
gl.isContextLost = () => false;
vm.runInContext('resetTankBatches()', sandbox);
assert(vm.runInContext('paintGpuFood(fixture,camera,1)', sandbox));
console.log('GPU-Futter: einzelne Stücke, gemeinsame Bewegung, Kamera und Kontextverlust: OK');

// Dynamic fields upload simulation cells, while camera-only frames reuse both textures.
vm.runInContext(
    `{const f={width:64,height:64,sediment:{columns:2,rows:2,amounts:[1,0,0,1]},light:{columns:2,rows:2,bottom:.2,clear_asset:19,values:[1,.5,.4,.2],clear_values:[1,1,.8,.8]}},mesh={mask:new Uint8Array(4*4*4).fill(1)};globalThis.fieldFixture=f;globalThis.fieldMesh=mesh;paintGpuSedimentCloud(f,camera,mesh);paintGpuCloudLight(f,camera);}`,
    sandbox);
const fieldUploads = gl.calls.filter(c => c[0] === 'texImage2D').length,
      fieldUpdates = gl.calls.filter(c => c[0] === 'texSubImage2D').length;
vm.runInContext(
    'paintGpuSedimentCloud(fieldFixture,{...camera,ox:30},fieldMesh);paintGpuCloudLight(fieldFixture,{...camera,ox:30});',
    sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'texImage2D').length, fieldUploads,
             'Moving the camera must not repack sediment or light');
vm.runInContext(
    'frameRevision++;paintGpuSedimentCloud(fieldFixture,camera,fieldMesh);paintGpuCloudLight(fieldFixture,camera);',
    sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'texImage2D').length, fieldUploads,
             'New states preserve texture storage and both static masks');
assert.equal(gl.calls.filter(c => c[0] === 'texSubImage2D').length, fieldUpdates + 2,
             'Both changing scalar fields update their existing texture storage');
console.log(
    'GPU-Felder: skalare Sediment- und Lichtdaten, feste Wandmasken und Kamera-Wiederverwendung: OK');

// Sperm density and premultiplied pigment are uploaded on the water grid.
vm.runInContext(
    `frameRevision++;fixture.plankton={columns:2,rows:2};fixture.gametes=[[25,25,.02,.2,.4,.6,1]];paintGpuGametes(fixture,camera,.5);`,
    sandbox);
const spermUploads = gl.calls.filter(c => c[0] === 'texImage2D').length;
const spermData = gl.calls.filter(c => c[0] === 'texImage2D' && c[3] === gl.RGBA32F).at(-1)[9];
assert(Math.abs(spermData[0] - .004) < 1e-7);
assert(Math.abs(spermData[3] - .02) < 1e-7);
vm.runInContext('paintGpuGametes(fixture,{...camera,ox:22},.8)', sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'texImage2D').length, spermUploads,
             'Camera and animation reuse the sperm concentration textures');

vm.runInContext(
    `frameRevision++;fixture.food=Array.from({length:1000},(_,i)=>[i,20,10,i+1,0,0,.4,0]);paintGpuFood(fixture,{...camera,scale:.5},1);const coarse=gpuFood.count;if(coarse>=200||coarse===0)throw Error('Far food must be spatially grouped');paintGpuFood(fixture,{...camera,scale:2},1);if(gpuFood.count<=coarse||gpuFood.count>=1000)throw Error('Close food must be individual and culled to the viewport');`,
    sandbox);

// Deposits use actual world wedges, including deep sediment whose base is outside the viewport.
vm.runInContext(
    `frameRevision++;fixture={plants:[[1,-20,500,20,500,0,-1,0,0,0,0,100,40,0,0,520,520,[],[.2,.5,.3],0,[],1]]};paintGpuSurface(fixture,camera,[0],null,true);`,
    sandbox);
const bedUploads = gl.calls.filter(c => c[0] === 'bufferData').length,
      bedData = gl.calls.filter(c => c[0] === 'bufferData').at(-1)[2];
assert.equal(bedData.length, 17);
assert.equal(bedData[6], 520);
assert.equal(bedData[7], 520);
assert.deepEqual(gl.calls.filter(c => c[0] === 'drawArraysInstanced').at(-1).slice(3), [ 6, 1 ]);
vm.runInContext('paintGpuSurface(fixture,{...camera,scale:4,oy:-300},[0],{x:10,y:20},true);',
                sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'bufferData').length, bedUploads,
             'Zoom and faded mouse inspection reuse deposited sand');
assert.deepEqual(gl.calls.filter(c => c[0] === 'uniform3f').at(-1).slice(2), [ 10, 20, 128 ]);
vm.runInContext(
    `previous=fixture;frameRevision++;fixture={plants:fixture.plants.map(p=>{const q=p.slice();q[15]=540;q[16]=550;return q;})};paintGpuSurface(fixture,camera,[0],null,true,.25);`,
    sandbox);
const changedBed = gl.calls.filter(c => c[0] === 'bufferData').at(-1)[2];
assert.equal(changedBed[6], 540);
assert.equal(changedBed[7], 550);
assert.equal(changedBed[12], 520);
assert.equal(changedBed[13], 520);
assert.equal(gl.calls.filter(c => c[0] === 'uniform1f' && c[1] === 'blend').at(-1)[2], .25);
console.log('GPU-Sedimentboden: Weltgeometrie, tiefe Hügel, Zoom und weicher Mausdurchblick: OK');

// Algae and sand reuse one scene upload, with distinct front/back passes.
vm.runInContext(
    `frameRevision++;const algae=fixture.plants[0].slice();algae[0]=2;algae[7]=64;algae[11]=algae[15]=algae[16]=0;fixture={plants:[algae,fixture.plants[0]],parameters:{algae_capacity:64,algae_thickness:4}};paintGpuSurface(fixture,camera,[0]);`,
    sandbox);
const surfaceUploads = gl.calls.filter(c => c[0] === 'bufferData').length,
      surfaceData = gl.calls.filter(c => c[0] === 'bufferData').at(-1)[2];
assert.equal(surfaceData.length, 34);
assert.equal(surfaceData[11], 0);
assert.equal(surfaceData[28], 1);
vm.runInContext('paintGpuSurface(fixture,camera,[0],null,true);', sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'bufferData').length, surfaceUploads,
             'Algae and sand must share one upload');
assert.equal(gl.calls.filter(c => c[0] === 'vertexAttribPointer' && c[1] === 0).at(-1)[6], 68,
             'Foreground sand starts after the algae records');
// Food and sperm use the same resident light field; camera motion does not replace it.
vm.runInContext('foodLightTexture(fieldFixture);', sandbox);
const lightBefore = gl.calls.filter(c => c[0] === 'texImage2D' || c[0] === 'texSubImage2D').length;
vm.runInContext('foodLightTexture(fieldFixture);foodLightTexture(fieldFixture);', sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'texImage2D' || c[0] === 'texSubImage2D').length,
             lightBefore, 'One snapshot must reuse its light texture');
vm.runInContext('frameRevision++;foodLightTexture(fieldFixture);foodLightTexture(fieldFixture);',
                sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'texImage2D' || c[0] === 'texSubImage2D').length,
             lightBefore + 1, 'A new light field updates the shared texture exactly once');
console.log(
    'GPU-Oberflächen und Licht: gemeinsame Daten, Materialreihenfolge und Wiederverwendung: OK');

// One counter covers every world renderer, including multiple LODs and offscreen passes.
for (const scene of [sandbox, sedimentSandbox]) {
  const submitted =
      scene.ctx.gl.calls.filter(c => c[0] === 'drawArrays' || c[0] === 'drawArraysInstanced');
  assert.equal(scene.ctx.stats.draws, submitted.length,
               'GPU batch calls are counted twice or omitted');
  assert.equal(
      scene.ctx.stats.vertices,
      submitted.reduce((sum, c) => sum + c[3] * (c[0] === 'drawArraysInstanced' ? c[4] : 1), 0),
      'GPU vertex totals omit instances or LODs');
}

// Reused IDs in another world or an earlier checkpoint never interpolate old geometry.
for (const change of ["render_epoch:'new'", "view_context:2", "step:3"]) {
  vm.runInContext(`{
    frameRevision++;const a={render_epoch:'old',view_context:1,step:20,width:200,height:200,plants:[plant(92)]};
    paintGpuGrass(a,camera,1,[0]);
    frameRevision++;const b={...a,${change},plants:[plant(92,[80,100,80,80,84,60,88,40])]};
    paintGpuGrass(b,camera,0,[0]);const pose=gpuGrass.poses.get('92:0');
    if(JSON.stringify(pose.before)!==JSON.stringify(pose.next))throw Error('Plant interpolates across a world boundary');
  }`,
                  sandbox);
}
vm.runInContext(`{
  scene={...scene,render_epoch:'replacement',fish:[]};frameRevision++;prepareGrassWakes(scene);
  const q=grassWakeCurve(scene.plants[0],0).next;
  if(JSON.stringify(q)!==JSON.stringify(scene.plants[0][20][0][3]))throw Error('New world inherits old plant motion');
}`,
                small);
const clearBefore = gl.calls.filter(c => c[0] === 'texSubImage2D').length;
vm.runInContext(
    `frameRevision++;fieldFixture={...fieldFixture,render_epoch:'replacement',light:{...fieldFixture.light,clear_values:[.1,.2,.3,.4]}};paintGpuCloudLight(fieldFixture,camera);`,
    sandbox);
assert.equal(gl.calls.filter(c => c[0] === 'texSubImage2D').length, clearBefore + 2,
             'Reused light asset IDs in another world must replace the clear-light texture');
assert(Math.abs(gl.calls.filter(c => c[0] === 'texSubImage2D').at(-1)[9][0] - .1) < 1e-6,
       'The new world uploads its own clear-light values into reused storage');
console.log('Weltwechsel, Archivsprünge und wiederverwendete Pflanzen-/Lichtkennungen: OK');
