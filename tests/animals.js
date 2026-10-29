const {readUI, functionSource} = require('./ui_source.js');
// World-space rendering contracts; no clock or rendering benchmark.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), calls = [];
const gl = new Proxy({calls}, {
  get(t, k) {
    if (k in t)
      return t[k];
    if (/^[A-Z_\d]+$/.test(k))
      return t[k] = Object.keys(t).length + 1;
    return t[k] = (...args) => {
      calls.push([ k, ...args ]);
      if (k === 'getShaderParameter' || k === 'getProgramParameter')
        return true;
      if (k === 'isContextLost')
        return false;
      if (k.startsWith('create'))
        return {};
      if (k === 'getUniformLocation')
        return args[1];
    };
  }
});
const scene = {
  assert,
  gl,
  structuredClone,
  fixture,
  frame: fixture.state.frame,
  canvas: {width: 1400, height: 900},
  viewportWidth: 1400,
  viewportHeight: 900,
  ctx: {gl, stats: {draws: 0, vertices: 0}, beginExternal() {}, endExternal() {}},
  combatEffects: [],
  displayNow: () => 0,
  displayStep : () => fixture.state.frame.step
};
vm.createContext(scene);
const brain = readUI('ui/brain.js'), tank = readUI('ui/tank.js');
for (const source of [readUI('ui/renderer.js'), readUI('ui/fish_forms.js'),
                      brain.slice(brain.indexOf('function fishCNSShape('),
                                  brain.indexOf('function brainCNSPoint(')),
                      functionSource('ui/tank.js', 'fishSkeletonPath'), readUI('ui/animals.js')])
  vm.runInContext(source, scene);
vm.runInContext(`
 const p=frame.fish[0].slice();p[8]=1;p[46]=0;p[74]=[3,20];p[69]=20;p[57]=[0,.2,.4];const a=fishAnatomy(p),r=fishRenderRadius(p),extent=fishGlyphExtent(a);
 const fish=Array.from({length:800},(_,i)=>{const q=p.slice();q[0]=i%40*20;q[1]=Math.floor(i/40)*20;return {p:q,a,r,extent,kind:1,light:.7};}),camera={scale:.1,ox:0,oy:0};gpuAnimals=new AnimalRenderer();gpuAnimals.paint(fish,camera,[0]);
 assert(gpuAnimals.count===800);assert(gpuAnimals.instances.length>=800*32);assert(fish.every(v=>v.level===0));
 const uploads=gl.calls.filter(c=>c[0]==='texSubImage2D').length;
 const radius=gpuAnimals.instances[3];gpuAnimals.paint(fish,{...camera,scale:.11,ox:40},[0]);
 assert(gpuAnimals.instances[3]===radius,'Camera changes world radius');assert(gl.calls.filter(c=>c[0]==='texSubImage2D').length===uploads,'Camera reuploads unchanged anatomy');
 fish[0].p[57]=[.7,.8,.9];fish[0].p[19]=.5;fish[0].p[64]=.8;fish[0].p[65]=.2;gpuAnimals.paint(fish,camera,[0]);
 assert(Math.abs(gpuAnimals.instances[8]-.7)<1e-6&&Math.abs(gpuAnimals.instances[21]-.8)<1e-6,'GPU loses current fin or bite pose');
 assert(gl.calls.filter(c=>c[0]==='texSubImage2D').length===uploads,'Pose reuploads unchanged anatomy');
 // More pixels select a finer sampling of the same model, never a different radius.
 for(const scale of [4,16,64]){gpuAnimals.paint([fish[0]],{...camera,scale},[0]);assert(gpuAnimals.instances[3]===radius);}
 const mesh=animalMesh(a,2);assert(mesh.data.every(Number.isFinite));assert(mesh.vertices[0]===6&&mesh.vertices[1]<mesh.vertices[2]);
 const modelUploads=gl.calls.filter(c=>c[0]==='texSubImage2D').length,textures=gl.calls.filter(c=>c[0]==='createTexture').length;
 const dead={...fish[0],kind:2,meat:.3,fade:.5};gpuAnimals.paint([dead],{...camera,scale:64},[0]);
 assert(gl.calls.filter(c=>c[0]==='texSubImage2D').length===modelUploads,'Death duplicates body geometry');assert(gl.calls.filter(c=>c[0]==='createTexture').length===textures,'Remains allocate body or bone images');
 const egg=p.slice();egg[8]=0;egg[51]=2;const eggs=Array.from({length:200},()=>({p:egg,a:null,r:2,extent:1,kind:0,light:1}));gpuAnimals.paint(eggs,{...camera,scale:100},[0]);assert(gpuAnimals.count===200&&gpuAnimals.rows.size<8);
 // Health flashes alter colour on the existing surface; the position attributes stay identical.
 gpuAnimals.paint([fish[0]],camera,[0]);const position=Array.from(gpuAnimals.instances.slice(0,4));combatEffects=[{event:[1,frame.step-3,1,0,p[4]],born:frame.step-3}];gpuAnimals.paint([fish[0]],camera,[0]);assert.deepStrictEqual(Array.from(gpuAnimals.instances.slice(0,4)),position);assert(gpuAnimals.instances[23]>0);
 gpuAnimals.paint([],camera,[0]);assert(gpuAnimals.count===0,'Empty scene retains stale diagnostic instances');
 // Simulation size is authoritative; reserve, yolk and age do not rescale the whole animal.
 const body=p.slice(),baseSize=fishRenderRadius(body);for(const age of [0,24,20000]){body[54]=age;body[74]=[100,2];body[69]=1000;assert(fishRenderRadius(body)===baseSize);}body[51]*=1.3;assert(Math.abs(fishRenderRadius(body)/baseSize-1.3)<1e-12);
 for(const scale of [.25,1,4,128])assert(fishDisplayRadius(body,scale)===fishRenderRadius(body)*scale);
 // A fully open suction mouth shows the same radius accepted by the simulation.
 const open={...a,mouthShapeCache:null,mouthOpening:1,swallowPose:1,bitePose:0};assert(Math.abs((fishMouthShape(open).gap-.0015)*r-p[63])<1e-9);
 globalThis.firstDraw=gl.calls.find(c=>c[0]==='drawArraysInstanced');
`,
                scene);
assert.deepEqual(scene.firstDraw.slice(3), [ 6, 800 ],
                 'Pixel-sized animals do not use the six-vertex LOD');
assert.equal(calls.filter(c => c[0] === 'createProgram').length, 1,
             'Fish, eggs and remains use different programs');
assert.equal(calls.filter(c => c[0] === 'createFramebuffer').length, 0,
             'Animals create intermediate framebuffers');
console.log(
    'Gemeinsame Tierdarstellung: Zoom, sechs Eckpunkte, Pose, Eier, Kadaver, Verletzung und Wachstum: OK');

let worker;
scene.Worker = class {
  constructor() {
    worker = this;
    this.posts = [];
  }
  postMessage(data) { this.posts.push(data); }
  terminate() { this.stopped = true; }
};
scene.worker = () => worker;
vm.runInContext(`
 const asyncRenderer=new AnimalRenderer();ctx.clock=5;
 asyncRenderer.paint([fish[0]],{...camera,scale:64},[0]);
 const changed=p.slice();changed[2]=1.25;changed[5]=10;
 const updated=fishAnatomy(changed);updated.snapshot=changed;
 const nextItem={...fish[0],p:changed,a:updated};
 const syncMesh=animalMesh;
 animalMesh=(a,level)=>{if(a===updated)throw Error('Changing anatomy blocks the draw loop');return syncMesh(a,level);};
 try {asyncRenderer.paint([nextItem],{...camera,scale:64},[0]);}finally{animalMesh=syncMesh;}
 assert(asyncRenderer.builds.size===1&&worker().posts.length===1,'Changed geometry is not queued');
 assert(Math.abs(asyncRenderer.instances[2]-1.25)<1e-6,'Background geometry delays the current orientation');
 const job=worker().posts[0],completed=animalMesh(updated,2);
 worker().onmessage({data:{ticket:job.ticket,model:completed}});
 assert(asyncRenderer.builds.size===0,'Finished work remains queued');
 const levels=animalMeshes.get(updated);
 assert(levels[0].data.length===animalHeader*4&&levels[1].data.length===completed.data[2]*4,
        'Lower detail keeps the full high-detail upload');
 // A worker requested at middle zoom returns its near mesh immediately after the header.
 const middle=p.slice();middle[5]=9;const middleAnatomy=fishAnatomy(middle);
 middleAnatomy.snapshot=middle;const middleModel=animalMesh(middleAnatomy,1);
 animalMeshes.delete(middleAnatomy);
 asyncRenderer.builds.set(900,{anatomy:middleAnatomy,level:1});
 worker().onmessage({data:{ticket:900,model:middleModel}});
 const middleCached=animalMeshes.get(middleAnatomy)[1];
 assert(middleCached.data.length===(animalHeader+middleCached.vertices[1]*3)*4,
        'Middle zoom uploads a header without its vertex data');
 assert(middleCached.data.length>animalHeader*4);
 assert.deepStrictEqual(Array.from(middleCached.data),Array.from(middleModel.data));
 asyncRenderer.paint([nextItem],{...camera,scale:64},[0]);
 const changing=Array.from({length:20},(_,i)=>{const q=changed.slice();q[5]=11+i;const a=fishAnatomy(q);a.snapshot=q;return {...nextItem,p:q,a};});
 asyncRenderer.paint(changing,{...camera,scale:64},[0]);
 assert(asyncRenderer.builds.size===16,'Background builds are unbounded');
 ctx.clock=8;asyncRenderer.paint([],camera,[0]);
 assert(asyncRenderer.previousModels.size===0,'Invisible bodies remain retained');
 // A new arrival has no previous mesh: its detail still belongs in the worker.
 const arriving=changed.slice();arriving[4]=9876;const arrival=fishAnatomy(arriving);arrival.snapshot=arriving;
 const arrivalItem={...nextItem,p:arriving,a:arrival};
 animalMeshes.delete(arrival);
 asyncRenderer.builds.clear();
 animalMesh=(a,level)=>{if(a===arrival&&level>0)throw Error('First detailed mesh blocks drawing');return syncMesh(a,level);};
 try {
   asyncRenderer.paint([arrivalItem],{...camera,scale:64},[0]);
   const cursor=asyncRenderer.cursor,uploads=gl.calls.filter(c=>c[0]==='texSubImage2D').length;
   asyncRenderer.paint([arrivalItem],{...camera,scale:64},[0]);
   assert(asyncRenderer.cursor===cursor&&gl.calls.filter(c=>c[0]==='texSubImage2D').length===uploads,
          'Pending background geometry reuploads the same fallback');
 } finally {animalMesh=syncMesh;}
 assert(asyncRenderer.builds.size===1,'New arrival was not sent to the worker');
 asyncRenderer.stopBuilder();assert(worker().stopped&&asyncRenderer.builds.size===0,'Reset retains the geometry worker');
`,
                scene);
delete scene.Worker;

// Image uploads and numeric anatomy share one WebGL context. Alpha conversion
// belongs to the image transfer and must never modify subsequent geometry data.
const unpack = new Map();
gl.pixelStorei = (key, value) => unpack.set(key, value);
gl.texSubImage2D = (...args) => {
  if (args[7] === gl.FLOAT && ArrayBuffer.isView(args[8]))
    assert.equal(unpack.get(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) ?? false, false,
                 'Image alpha conversion corrupts the numeric anatomy atlas');
  calls.push([ 'texSubImage2D', ...args ]);
};
scene.canvas.getContext = () => gl;
vm.runInContext(`
 ctx=createTankRenderer(canvas);ctx.beginFrame();
 // Reproduce the label/image upload that happens before a new fish shape.
 ctx.uploadTexture(null,2,2,{width:2,height:2});
 ctx.fillStyle='#23505f';ctx.fillRect(0,0,20,20);
 gpuAnimals=new AnimalRenderer();gpuAnimals.paint([fish[0]],camera,[0]);ctx.endFrame();
 ctx.uploadTexture(null,2,2,new Uint8Array(16),false);
 gpuAnimals.paint([dead],{...camera,scale:64},[0]);
`,
                scene);
console.log('Bildtransfer und Tiergeometrie im gemeinsamen WebGL-Kontext: OK');
