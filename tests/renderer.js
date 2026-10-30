const {readUI, functionSource} = require('./ui_source.js');
const fs = require('fs'), vm = require('vm'), assert = require('assert');
let created = 0;
let textureUnit = 0, framebuffer = null;
const boundTextures = new Map(), attachments = new Map();
const calls = [], listeners = {},
      gl = new Proxy({
        getShaderParameter : () => true,
        getProgramParameter : () => true,
        isContextLost : () => false,
        getParameter : () => null,
        checkFramebufferStatus : () => gl.FRAMEBUFFER_COMPLETE,
        activeTexture(unit) {
          textureUnit = unit;
          calls.push([ 'activeTexture', unit ]);
        },
        bindTexture(target, texture) {
          boundTextures.set(textureUnit, texture);
          calls.push([ 'bindTexture', target, texture ]);
        },
        bindFramebuffer(target, value) {
          framebuffer = value;
          calls.push([ 'bindFramebuffer', target, value ]);
        },
        framebufferTexture2D(...args) {
          attachments.set(framebuffer, args[3]);
          calls.push([ 'framebufferTexture2D', ...args ]);
        },
        drawArrays(...args) {
          assert(!framebuffer || !attachments.get(framebuffer) ||
                     attachments.get(framebuffer) !== boundTextures.get(gl.TEXTURE0),
                 'A render target is still bound to the vector shader sampler');
          calls.push([ 'drawArrays', ...args ]);
        }
      },
                     {
                       get(t, k) {
                         if (k in t)
                           return t[k];
                         if (/^[A-Z_\d]+$/.test(k))
                           return t[k] = Object.keys(t).length + 100;
                         return t[k] = (...args) => {
                           calls.push(
                               [ k, ...args.map(v => ArrayBuffer.isView(v) ? Array.from(v) : v) ]);
                           if (k.startsWith('create'))
                             return {id : ++created};
                           if (k === 'getUniformLocation')
                             return args[1];
                         };
                       }
                     }),
      canvas = {
        width : 800,
        height : 600,
        getContext(kind) {
          assert.equal(kind, 'webgl2');
          return gl
        },
        addEventListener : (k, v) => listeners[k] = v
      },
      scene = {
        performance,
        console,
        canvas,
        document : {getElementById : () => ({})}
      };
vm.createContext(scene);
vm.runInContext(readUI('ui/renderer.js'), scene);
vm.runInContext(`
const g=createTankRenderer(canvas);g.beginFrame();g.fillStyle='#8ac7ab';for(let i=0;i<1000;i++){g.beginPath();g.arc(i%50*12+6,Math.floor(i/50)*12+6,3,0,Math.PI*2);g.fill();}g.endFrame();globalThis.bodyDraws=g.stats.draws;
const batch=new TankBatch(canvas,g,tankVertexSource,tankFragmentSource,[2],[]);
for(let i=0;i<2;++i){g.beginFrame();batch.submit(g.gl.TRIANGLES,3);if(g.stats.draws!==1||g.stats.vertices!==3)throw Error('GPU batches lost the current frame counters');g.endFrame();}
// Counter-stencil clips intersect, exclude holes and restore the original depth.
g.beginFrame();g.save();g.beginPath();g.rect(0,0,300,300);g.clip();g.save();g.beginPath();g.rect(0,0,300,300);g.moveTo(200,100);g.arc(100,100,100,0,Math.PI*2);g.clip('evenodd');g.fillRect(0,0,300,300);g.restore();if(g.clipDepth!==0||g.clipBounds[2]!==300)throw Error('Nested clip bounds not restored');g.restore();if(g.clipDepth!==0)throw Error('Tank clip leaks');g.endFrame();
// Dash length is evaluated by the shader, independent of a connection's pixel length.
g.beginFrame();g.lineWidth=1;g.setLineDash([2,4]);g.moveTo(0,20);g.lineTo(5000,20);g.stroke();g.endFrame();if(g.stats.vertices>12)throw Error('Long dashed wires expand into individual dashes');g.setLineDash([]);
// The point probe uses the same curves, transforms and winding rules.
const p=new TankPath();p.rect(0,0,10,10);p.rect(2,2,6,6);if(!p.isPointInPath(5,5)||p.isPointInPath(5,5,'evenodd'))throw Error('Point probe loses winding rules');p.beginPath();p.translate(5,7);p.arc(0,0,3,0,Math.PI*2);if(!p.isPointInPath(5,7)||p.isPointInPath(20,7))throw Error('Point probe loses transforms');p.beginPath();p.moveTo(0,0);p.lineTo(10,0);p.lineWidth=2;if(!p.isPointInStroke(10,7)||p.isPointInStroke(10,10))throw Error('Stroke picking disagrees with the displayed path');
const concave=[[0,0],[10,0],[10,10],[5,4],[0,10]],tri=tankTriangles(concave),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);let area=0;for(let k=0;k<tri.length;k+=3)area+=Math.abs(cross(...tri.slice(k,k+3)))/2;if(Math.abs(area-70)>1e-8)throw Error('Concave organ fill overdraws a cut-out');
const image={width:8,height:8};g.beginFrame();g.drawImage(image,0,0);g.endFrame();g.beginFrame();g.translate(10,10);g.drawImage(image,0,0);g.endFrame();touchTankImage(image);g.beginFrame();g.drawImage(image,0,0);g.endFrame();
const list=new TankDisplayList();list.fillStyle='#fe0';list.fillRect(1,2,3,4);g.beginFrame();list.replay(g);g.endFrame();
`,
                scene);
assert.equal(scene.bodyDraws, 1, '1,000 filled neurons must share a single vector draw');
assert.equal(calls.filter(c => c[0] === 'texImage2D').length, 2,
             'Camera motion reuses textures; only changed pixels upload again');
assert.equal(calls.filter(c => c[0] === 'bufferSubData').length > 0, true);
const beforeLayer = calls.filter(c => c[0] === 'texImage2D').length;
vm.runInContext(
    `const layer=new TankLayer();layer.width=40;layer.height=20;const lg=layer.getContext();lg.fillStyle='#f80';lg.fillRect(0,0,40,20);g.beginFrame();g.drawImage(layer,0,0);g.endFrame();g.beginFrame();g.drawImage(layer,20,30);g.endFrame();`,
    scene);
assert.equal(calls.filter(c => c[0] === 'texImage2D').length - beforeLayer, 1,
             'GPU layers retain their framebuffer texture across camera motion');
// Repainting a valid fixed-format target never waits for a GPU status query.
const queries = calls.filter(c => c[0] === 'checkFramebufferStatus').length;
const getParameter = gl.getParameter;
gl.getParameter = () => { throw Error('Drawing waits for GPU state'); };
try {
  vm.runInContext(
      `layer.getContext().fillRect(0,0,5,5);touchTankImage(layer);g.beginFrame();g.drawImage(layer,10,10);g.endFrame();`,
      scene);
} finally {
  gl.getParameter = getParameter;
}
assert.equal(calls.filter(c => c[0] === 'checkFramebufferStatus').length, queries);
const brain = readUI('ui/brain.js');
vm.runInContext(brain.slice(brain.indexOf('function brainReplayPath('),
                            brain.indexOf('function brainGeometry(')),
                scene);
vm.runInContext(
    `const hole=new TankPath();hole.rect(0,0,40,40);brainReplayPath(hole,[['ellipse',[20,20,5,7,0,0,Math.PI*2]]],true);if(hole.paths.length!==2||hole.isPointInPath(20,20,'evenodd')||!hole.isPointInPath(10,10,'evenodd'))throw Error('An appended eye mask connects to the outer rectangle');`,
    scene);

// GPU batches inherit the same exclusion mask as vector fish parts.
vm.runInContext(
    `g.beginFrame();g.save();g.beginPath();g.rect(100,200,300,20);g.clip('outside');g.beginExternal();globalThis.exclusion=g.clipDepth;`,
    scene);
assert.equal(scene.exclusion, 1);
assert.deepEqual(calls.filter(c => c[0] === 'stencilFunc').at(-1),
                 [ 'stencilFunc', gl.EQUAL, 1, 127 ]);
vm.runInContext(
    `batch.submit(gl.TRIANGLES,6);g.endExternal();g.restore();if(g.clipDepth!==0)throw Error('Platform exclusion leaked into foreground sediment');g.endFrame();`,
    Object.assign(scene, {gl}));

// Ordinary save/restore pairs must not send WebGL commands or flush the batch.
vm.runInContext('g.beginFrame()', scene);
const stateCalls = calls.length;
vm.runInContext('for(let k=0;k<1000;k++){g.save();g.translate(k,1);g.restore();}', scene);
assert.equal(calls.length, stateCalls,
             'Unclipped fish and eggs must not rebind stencil/scissor state');
vm.runInContext(
    'g.save();g.beginPath();g.rect(100,100,200,150);g.clip();if(g.stats.draws!==0)throw Error("A rectangular crop must use scissor alone");g.restore();if(g.clipBounds[0]!==0||g.clipBounds[2]!==canvas.width)throw Error("Rectangle crop leaks");g.endFrame()',
    scene);
// Poll completion without ever waiting on a busy GPU or building a frame backlog.
vm.runInContext(
    `{const poll=g.gl.clientWaitSync;g.pendingFrames=[{},{}];const completed=g.completedFrames;let polls=0;g.gl.clientWaitSync=(sync,flags,timeout)=>{if(flags!==0||timeout!==0)throw Error('Frame admission waits on the GPU');polls++;return g.gl.TIMEOUT_EXPIRED;};if(g.frameReady()||polls!==1||g.pendingFrames.length!==2)throw Error('Busy GPU admits another old frame');if(g.completedFrames!==completed)throw Error('Queued frames are counted as complete');g.gl.clientWaitSync=()=>g.gl.ALREADY_SIGNALED;if(!g.frameReady()||g.pendingFrames.length)throw Error('Completed GPU frames remain queued');if(g.completedFrames!==completed+2)throw Error('Completed frames are not counted exactly once');g.frameReady();if(g.completedFrames!==completed+2)throw Error('Frames are counted twice');g.gl.clientWaitSync=poll;}`,
    scene);
let prevented = false;
listeners.webglcontextlost({preventDefault() { prevented = true }});
assert(prevented);
vm.runInContext('if(!g.lost)throw Error("Context loss ignored")', scene);
listeners.webglcontextrestored();
vm.runInContext(
    'g.beginFrame();g.fillRect(0,0,2,2);g.endFrame();if(g.lost)throw Error("Context restore ignored")',
    scene);
console.log(
    'Gemeinsames WebGL: gebündelte Neuronen, verschachtelte Masken, Trefferprüfung, Texturwiederverwendung und Wiederherstellung: OK');

const beforeGpuImage = calls.filter(c => c[0] === 'texImage2D').length;
vm.runInContext(
    `const gpuImage={width:8,height:4,tankTexture:{texture:gl.createTexture(),flip:true}};g.beginFrame();g.drawImage(gpuImage,0,0,100,50);g.endFrame();`,
    Object.assign(scene, {gl}));
assert.equal(calls.filter(c => c[0] === 'texImage2D').length, beforeGpuImage,
             'GPU field images must stay on the GPU');

vm.runInContext(
    `g.beginFrame();g.drawTintedImage(image,[.2,.4,.8],0,0);g.endFrame();if(g.imageTint!==undefined)throw Error('Image tint leaks to later images');`,
    scene);
const tinted = calls.filter(c => c[0] === 'bufferSubData').at(-1)[3];
assert(Math.abs(tinted[4] - .2) < 1e-6 && Math.abs(tinted[5] - .4) < 1e-6 &&
           Math.abs(tinted[6] - .8) < 1e-6,
       'Image tint belongs in the vertex batch, without reuploading the texture');

vm.runInContext(
    `g.beginFrame();g.beginPath();g.rect(0,0,10,10);const oldPath=g.paths;for(let i=0;i<2000;i++)g.fillEllipse(i%50*10,Math.floor(i/50)*10,80);if(g.paths!==oldPath||g.paths[0].points.length!==4)throw Error('Direct cloud drawing builds CPU circle paths');g.endFrame();if(g.stats.draws!==1||g.stats.vertices!==12000)throw Error('Clouds must share one GPU batch of six vertices each');`,
    scene);

vm.runInContext(functionSource('brain', 'brainDrawCurve') + '\n' +
                    functionSource('brain', 'brainDrawLearning'),
                scene);
vm.runInContext(`{
 const d={b:{learning:{signals:[]}},edges:[]},painted=new Set();let strokes=0,path=[];
 const pen={save(){},restore(){},beginPath(){path=[];},moveTo(id){path.push(id);},bezierCurveTo(){},stroke(){
   strokes++;for(const id of path){const value=d.b.learning.signals[id];
     if(painted.has(id)||this.strokeStyle!==(value<0?'#ea8784':'#79cf95'))throw Error('Learning batch duplicates a connection or changes its sign');
     if(Math.abs(this.lineWidth-(.5+Math.min(2,Math.sqrt(Math.abs(value)))))>.250001)throw Error('Learning width approximation exceeds a quarter unit');
     painted.add(id);
   }
 }};
 for(let i=0;i<1000;i++){d.b.learning.signals.push((i%2?-1:1)*(i%100+1)/20);d.edges.push({e:[0,0,0,i],curve:[i,0,i,1,i,2,i,3]});}
 brainDrawLearning(pen,d);
 if(painted.size!==1000||strokes>10)throw Error('Dense learning overlay loses connections or emits too many paths');
 d.b.learning.signals.fill(0);strokes=0;brainDrawLearning(pen,d);
 if(strokes)throw Error('Inactive learning retains stale paths');
}`,
                scene);

// Removing a cached layer releases all owned GPU attachments immediately.
vm.runInContext(
    `g.beginFrame();g.drawImage(layer,0,0);g.endFrame();const resource=g.images.get(layer),bytes=g.textureBytes;g.releaseImage(layer);if(resource.texture||resource.framebuffer||resource.stencil||g.textures.has(resource)||g.images.has(layer))throw Error('Discarded layer retains GPU resources');if(g.textureBytes!==bytes-40*20*4)throw Error('Released layer remains in texture accounting');const after=g.textureBytes;g.releaseImage(layer);if(g.textureBytes!==after)throw Error('Double disposal changes memory accounting');g.beginFrame();g.drawImage(layer,0,0);g.endFrame();if(!g.images.get(layer)?.texture)throw Error('A released layer cannot be rebuilt');`,
    scene);

// Replacing changing vector commands retains the existing render target.
const targetAllocations = calls.filter(c => c[0] === 'createTexture').length;
vm.runInContext(
    `for(let k=0;k<6;k++){const next=new TankLayer();next.width=40;next.height=20;next.getContext().fillRect(k,0,10,10);layer.replace(next);g.beginFrame();g.drawImage(layer,0,0);g.endFrame();}`,
    scene);
assert.equal(calls.filter(c => c[0] === 'createTexture').length, targetAllocations,
             'Changing organ geometry must reuse its GPU render target');

// Overview grains stay present and zoom only changes the projection uniform.
Object.assign(scene, {
  ctx : vm.runInContext('g', scene),
  gl,
  viewportWidth : 800,
  viewportHeight : 600,
  frameRevision : 1,
  previousFood : new Map(),
  horizontalDelta : x => x,
  foodRichness : energy => energy / (energy + 100),
  displayStep : () => 0,
  displayLight : () => 1
});
vm.runInContext(readUI('ui/plant_geometry.js'), scene);
vm.runInContext(readUI('ui/particle_renderer.js'), scene);
vm.runInContext(`{
 const f={food:Array.from({length:800},(_,i)=>[20+i%40*18,20+Math.floor(i/40)*18,40,i,0,-1,.36,0])},r=new FoodRenderer();
 const c={scale:.3,ox:0,oy:0};g.beginFrame();r.paint(f,c,1);
 if(!r.data.subarray(0,r.count*11).every(Number.isFinite))throw Error('Food upload contains invalid geometry');
 const uploads=gl.calls.filter(v=>v[0]==='bufferData').length;
 r.paint(f,c,.7);if(gl.calls.filter(v=>v[0]==='bufferData').length!==uploads)throw Error('Same LOD uploads unchanged food again');
 r.paint(f,{...c,scale:8},1);if(r.count<=0||r.count>=800)throw Error('Close food must cull invisible pieces');
 frameRevision++;r.paint({...f,food:f.food.slice(0,7)},c,1);if(r.count>7)throw Error('Consumed food remains in the batch');g.endFrame();
}`,
                Object.assign(scene, {gl : Object.assign(gl, {calls})}));

vm.runInContext(`{
 const old=[100,90,8,99,0,0,1,7,.7,.15,.15,.2,0,18],
       worm=[102,94,8,99,0,0,1,7,.7,.15,.15,-.1,0,14],
       mussel=[200,180,60,101,0,0,8,9,.25,.3,.35,0,.4,0],
       crab=[200,180,60,102,0,0,8,8,.55,.3,.2,0,0,0,.5,2,1,.3,1],oldCrab=[...crab];oldCrab[17]=.6;
 globalThis.sceneState={previousInvertebrates:new Map([[99,old],[102,oldCrab]])};
 const r=new FoodRenderer(true),f={width:800,height:600,invertebrates:[worm,mussel,crab]},c={scale:3,ox:0,oy:0};
 frameRevision++;g.beginFrame();r.paint(f,c,.5);
 const rows=Array.from({length:r.count},(_,i)=>Array.from(r.data.subarray(i*28,(i+1)*28))),wm=rows.find(p=>p[9]===-7),cm=rows.find(p=>p[9]===-8);
 if(r.count!==3||wm[14]!==18||Math.abs(cm[14]-.6)>1e-6||Math.abs(cm[18]-.3)>1e-6)throw Error('Individual depth layers lose worm or crab pose history');
 if(!r.layers||r.layers.flat().reduce((n,l)=>n+l.count,0)!==3)throw Error('Individual depth layers omit animals');
 const uploads=gl.calls.filter(v=>v[0]==='bufferData').length;
 r.paint(f,c,.75);
 if(gl.calls.filter(v=>v[0]==='bufferData').length!==uploads)throw Error('Animal interpolation uploads geometry on each drawn frame');
 if(!r.data.subarray(0,r.count*28).every(Number.isFinite))throw Error('Animal geometry is not finite');
 g.endFrame();
}`,
                scene);

// Scenery uses its padded cache extent, including obstacles crossing the viewport.
{
  const fills = [], path = [];
  const context = new Proxy({}, {
    get : (_, key) => {
      if (key === 'createLinearGradient')
        return () => ({addColorStop() {}});
      if (key === 'beginPath')
        return () => { path.length = 0; };
      if (key === 'moveTo' || key === 'lineTo')
        return (x, y) => path.push([ x, y ]);
      if (key === 'fill')
        return () => fills.push(path.slice());
      return () => {};
    }
  });
  const fixture = {
    scenery : {width : 1120, height : 920, getContext : () => context},
    pixelRatio : 1,
    viewportWidth : 800,
    viewportHeight : 600,
    paintWaterLight() {}
  };
  vm.createContext(fixture);
  vm.runInContext(functionSource('tank', 'paintSceneryTile'), fixture);
  for (const shape of [[ [ 100, 500 ], [ 300, 500 ], [ 300, 1000 ], [ 100, 1000 ] ],
                       [ [ 100, -200 ], [ 300, -200 ], [ 300, 200 ], [ 100, 200 ] ],
                       [ [ 850, 100 ], [ 1000, 100 ], [ 1000, 300 ], [ 850, 300 ] ],
                       [ [ 100, 650 ], [ 300, 650 ], [ 300, 850 ], [ 100, 850 ] ],
                       [ [ -100, -100 ], [ 1200, -100 ], [ 1200, 1000 ], [ -100, 1000 ] ]]) {
    fills.length = 0;
    fixture.frame =
        {width : 3000, height : 2000, obstacles : [ [ 200, 200, 100 ] ], shapes : [ shape ]};
    vm.runInContext('paintSceneryTile(frame,{scale:1,ox:0,oy:0})', fixture);
    assert(fills.some(p => JSON.stringify(p) === JSON.stringify(shape)),
           'The complete intersecting obstacle must survive camera and cache boundaries');
  }
}

// Identical shader sources reuse one program; context restoration discards it.
{
  const before = calls.filter(c => c[0] === 'createProgram').length;
  vm.runInContext(`tankProgram(gl, 'cache-test-vertex', 'cache-test-fragment');
    tankProgram(gl, 'cache-test-vertex', 'cache-test-fragment');`,
                  scene);
  assert.equal(calls.filter(c => c[0] === 'createProgram').length - before, 1);
}

// New scene positions alone do not rebuild an unchanged neural layout and activity snapshot.
{
  let builds = 0;
  const raw = Array(70).fill(0);
  raw[8] = 1;
  raw[57] = [];
  let clock = 1000;
  const state = {brainOpacity : 1, brainDrawing : null}, fixture = {
    performance : {now : () => clock},
    brainState : state,
    sceneState : {frameRevision : 1},
    sessionState : {},
    brain_inputState : {},
    cameraState : {},
    el : () => ({value : 'all', checked : false}),
    frameFish : () => raw,
    brainPresentationFish : p => p,
    blendFish : p => p,
    fishBodyRadius : () => 5,
    fishSnapshotAnatomy : () => raw,
    brainCellDetail : () => 1,
    brainBuild : f => {
      builds++;
      return {b : f.brain};
    },
    brainSetDrawing : d => { state.brainDrawing = d; },
    worldToScreen : () => ({x : 0, y : 0}),
    brainShowOrgan() {},
    brainTrace() {},
    brainRender() {},
    ctx : {save() {}, restore() {}, layerAlpha : 1}
  };
  vm.createContext(fixture);
  const source = fs.readFileSync('ui/brain.js', 'utf8');
  vm.runInContext(source
                      .slice(source.indexOf('export function brainDrawOverlay'),
                             source.indexOf('export function updateBrainState'))
                      .replace('export ', ''),
                  fixture);
  fixture.frame = {brain : {layout_id : 'one', neurons : [ [] ]}, step : 1};
  vm.runInContext('brainDrawOverlay(frame,{scale:10})', fixture);
  fixture.sceneState.frameRevision++;
  fixture.frame.step++;
  vm.runInContext('brainDrawOverlay(frame,{scale:10})', fixture);
  assert.equal(builds, 1);
  fixture.frame.brain = {...fixture.frame.brain};
  vm.runInContext('brainDrawOverlay(frame,{scale:10})', fixture);
  assert.equal(builds, 1, 'New activity rebuilds at most ten times a second');
  clock += 150;
  vm.runInContext('brainDrawOverlay(frame,{scale:10})', fixture);
  assert.equal(builds, 2, 'Changed neural activity must refresh the drawing');
}

// Driver compilation can finish across event-loop turns without blocking for link status.
(async () => {
  let polls = 0, links = 0;
  const asyncGl = {
    VERTEX_SHADER : 1,
    FRAGMENT_SHADER : 2,
    LINK_STATUS : 3,
    createProgram : () => ({}),
    createShader : () => ({}),
    shaderSource() {},
    compileShader() {},
    attachShader() {},
    linkProgram() {},
    deleteShader() {},
    deleteProgram() {},
    isContextLost : () => false,
    getExtension : () => ({COMPLETION_STATUS_KHR : 4}),
    getProgramParameter(program, key) {
      if (key === 4)
        return ++polls >= 3;
      links++;
      assert(polls >= 3, 'Link validation must wait for asynchronous completion');
      return true;
    }
  };
  scene.asyncGl = asyncGl;
  scene.setTimeout = setTimeout;
  await vm.runInContext("prepareTankProgram(asyncGl, 'async-v', 'async-f')", scene);
  assert.equal(links, 1);
  await vm.runInContext("prepareTankProgram(asyncGl, 'async-v', 'async-f')", scene);
  assert.equal(links, 1, 'Prepared programs are reused');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
