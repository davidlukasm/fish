import {water_viewState} from './water_view.js';
import {resetSpermRenderer} from './sperm_renderer.js';
import {ORGAN_KIND, ORGAN_PROFILE, PLANT} from './schema.js';
import {updateParticleRendererState} from './particle_renderer.js';
import {updateSedimentRendererState} from './sediment_renderer.js';
import {updateAnimalsState} from './animals.js';
import {animalsState} from './animals.js';
import {cameraState} from './camera.js';
import {canvas, ctx} from './dom.js';
import {
  BED_LAYERS,
  bedLayer,
  grassWakeCurve,
  plantCurveBox,
  plantCurveSpan,
  plantDepth,
  plantFoot,
  plantPartVisible,
  plantRenderParts,
  prepareGrassWakes,
  RIBBON
} from './plant_geometry.js';
import {
  attributeInputs,
  attributeLayout,
  glsl,
  mergeInstanceRanges,
  QUAD_VERTICES,
  TankBatch
} from './renderer.js';
import {displayStep, horizontalDelta, sceneState} from './state.js';
import {displayLight} from './water_view.js';
export const vegetationState = {};
export let grassVertexShader;

export let grassFragmentShader;

const GRASS_ATTRIBUTES = [
  [ 'old01', 4 ], [ 'old23', 4 ], [ 'next01', 4 ], [ 'next23', 4 ], [ 'shape', 4 ], [ 'tint', 4 ],
  [ 'organLight', 2 ], [ 'notchA', 4 ], [ 'notchB', 4 ]
];
const {at : GRASS_AT, floats : GRASS_FLOATS} = attributeLayout(GRASS_ATTRIBUTES);
const GRASS = Object.freeze({
  min_scale : .4,
  spans : [ 10, 28, 72 ],
  segments : [ 3, 6, 10, 16 ],
  max_interval : 64,
  min_capacity : 64,
  pad : 40,
  margin : 128
});
const BITE = Object.freeze({min_margin : .05, min_chord : .15, min_cut : .12, max_cut : 1.8});
const sideOf = stem => stem % 2 ? 1 : -1;

class GrassRenderer extends TankBatch {
  constructor() {
    super(canvas, ctx, grassVertexShader, grassFragmentShader,
          GRASS_ATTRIBUTES.map(([, size ]) => size),
          [ 'viewport', 'offset', 'scale', 'blend', 'segments' ]);
    this.poses = new Map();
    this.plantInterval = 1;
    const gl = this.gl, grid = gl.createBuffer(), location = GRASS_ATTRIBUTES.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, grid);
    gl.bufferData(gl.ARRAY_BUFFER,
                  Float32Array.from({length : GRASS.segments.at(-1) * QUAD_VERTICES}, (_, i) => i),
                  gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 1, gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT, 0);
    gl.vertexAttribDivisor(location, 0);
  }
  upload(f, c, shifts) {
    const now = displayStep(f), priorBlend = this.poseBlend(f, now),
          changed = this.plants !== f.plants;
    const oldParts = new Map();
    if (!this.poses.size)
      for (const p of this.plants || [])
        oldParts.set(p[PLANT.id], new Map(plantRenderParts(p).map(o => [o.stem, o])));
    for (const [key, pose] of this.poses) {
      const [id, stem] = key.split(':').map(Number);
      if (!oldParts.has(id))
        oldParts.set(id, new Map());
      oldParts.get(id).set(stem, {
        q : pose.before.map((v, i) => v + (pose.next[i] - v) * priorBlend),
        width : pose.beforeWidth + (pose.width - pose.beforeWidth) * priorBlend,
        cut : pose.cut
      });
    }
    if (changed) {
      this.plantInterval = this.plantTime === undefined
                               ? 1
                               : Math.max(1, Math.min(GRASS.max_interval, now - this.plantTime));
      this.plantTime = now;
      this.plants = f.plants;
    }
    prepareGrassWakes(f, c, shifts);
    const poses = new Map();
    this.hitBounds = new Map();
    const plants = [];
    for (const p of f.plants || []) {
      if (!p[PLANT.stump])
        continue;
      const foot = plantFoot(p).y, layer = bedLayer(plantDepth(p));
      for (const part of plantRenderParts(p)) {
        const old = oldParts.get(p[PLANT.id])?.get(part.stem);
        if (!plantPartVisible(part.q, part.width, c, shifts) &&
            !(old && plantPartVisible(old.q, old.width, c, shifts)))
          continue;
        plants.push({...part, p, layer, foot, span : plantCurveSpan(part.q)});
      }
    }
    plants.sort((a, b) => a.foot - b.foot || a.p[PLANT.id] - b.p[PLANT.id] || a.kind - b.kind);
    const gl = this.gl;
    this.count = plants.length;
    this.ranges = new Map();
    plants.forEach(({p, span}, index) => {
      const range = this.ranges.get(p[PLANT.id]) || {start : index, count : 0, span : 0};
      range.span = Math.max(range.span, span);
      ++range.count;
      this.ranges.set(p[PLANT.id], range);
    });
    // Bed layers interleave in depth order. A second copy of the instances, grouped by layer
    // and in the same depth order within each layer, lets the overview draw every layer in a
    // few instanced calls instead of one call per organ.
    const layerOrder = [];
    this.layers = Array.from({length : BED_LAYERS}, (_, layer) => {
      const start = this.count + layerOrder.length;
      plants.forEach((p, index) => {
        if (p.layer === layer)
          layerOrder.push(index);
      });
      return [ {start, count : this.count + layerOrder.length - start} ];
    });
    this.organSpans = plants.map(p => p.span).concat(layerOrder.map(i => plants[i].span));
    this.segmentScale = undefined;
    this.drawRuns = new Map();
    if (2 * this.count > this.capacity) {
      this.capacity = Math.max(GRASS.min_capacity, 2 ** Math.ceil(Math.log2(2 * this.count)));
      this.instances = new Float32Array(this.capacity * GRASS_FLOATS);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.instances.byteLength, gl.DYNAMIC_DRAW);
    }
    this.bounds = null;
    this.maxOrganSpan = 0;
    for (const {q, span} of plants) {
      this.maxOrganSpan = Math.max(this.maxOrganSpan, span);
      const box = plantCurveBox(q, GRASS.pad), b = [ box.left, box.top, box.right, box.bottom ];
      this.bounds=this.bounds?[Math.min(this.bounds[0],b[0]),Math.min(this.bounds[1],b[1]),Math.max(this.bounds[2],b[2]),Math.max(this.bounds[3],b[3])]:b;
    }
    let at = 0;
    for (const {p, q, stem, kind, width, hardness, color, notches, cut} of plants) {
      // A cut stump appears at once: it never morphs out of the severed organ.
      const key = p[PLANT.id] + ':' + stem, previous = oldParts.get(p[PLANT.id])?.get(stem),
            beforePart = previous && (previous.cut ?? 0) === (cut ?? 0) ? previous : null,
            before = beforePart?.q || q, fiber = (p[PLANT.fiber] ?? 1) * hardness,
            wake = grassWakeCurve(p, stem), existing = !changed && this.poses.get(key),
            target = wake?.next || q, pose = existing || {
              before,
              next : target.map((v, k) => k % 2 ? v : before[k] + horizontalDelta(v - before[k])),
              beforeWidth : beforePart?.width ?? width,
              width,
              cut
            };
      poses.set(key, pose);
      const bounds =
                this.hitBounds.get(p[PLANT.id]) || [ Infinity, Infinity, -Infinity, -Infinity ],
            padding = Math.max(pose.beforeWidth, pose.width);
      for (const curve of [pose.before, pose.next]) {
        const box = plantCurveBox(curve, padding);
        bounds[0] = Math.min(bounds[0], box.left);
        bounds[1] = Math.min(bounds[1], box.top);
        bounds[2] = Math.max(bounds[2], box.right);
        bounds[3] = Math.max(bounds[3], box.bottom);
      }
      this.hitBounds.set(p[PLANT.id], bounds);
      this.instances.set(pose.before, at + GRASS_AT.old01);
      this.instances.set(pose.next, at + GRASS_AT.next01);
      this.instances.set([ pose.beforeWidth, pose.width, fiber, kind, ...color, sideOf(stem) ],
                         at + GRASS_AT.shape);
      this.instances.set([ displayLight(f, q[0], q[1]), displayLight(f, q[6], q[7]) ],
                         at + GRASS_AT.organLight);
      const marks = [];
      for (let k = 0; k + 2 < (notches?.length || 0); k += 3)
        marks.push(notches.slice(k, k + 3));
      marks.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      const [m0 = [ 0, 0, 0 ], m1 = [ 0, 0, 0 ]] = marks;
      this.instances.set([...m0, ...m1, 0, 0 ], at + GRASS_AT.notchA);
      at += GRASS_FLOATS;
    }
    this.layerOrder = layerOrder;
    this.layerCopy = false;
    if (this.count) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instances.subarray(0, at));
    }
    this.poses = poses;
    this.revision = sceneState.frameRevision;
    this.view = {
      left : (-GRASS.margin - c.ox) / c.scale,
      right : (cameraState.viewportWidth + GRASS.margin - c.ox) / c.scale,
      top : (-GRASS.margin - c.oy) / c.scale,
      bottom : (cameraState.viewportHeight + GRASS.margin - c.oy) / c.scale,
      shifts : shifts.join()
    };
  }
  poseBlend(f, now = displayStep(f)) {
    if (f.paused && this.pausedBlend !== undefined)
      return this.pausedBlend;
    const t = this.plantTime === undefined
                  ? 1
                  : Math.max(0, Math.min(1, (now - this.plantTime) / this.plantInterval));
    this.lastBlend = t;
    return t;
  }
  paint(f, c, blend, shifts, layer = null) {
    if (this.gl.isContextLost())
      return false;
    const world = [ f.render_epoch, f.view_context, f.width, f.height ].join(':');
    if (this.world !== world || f.step < this.step) {
      this.world = world;
      this.plants = null;
      this.poses.clear();
      this.plantTime = undefined;
    }
    this.step = f.step;
    if (f.paused && !this.wasPaused)
      this.pausedBlend = this.lastBlend ?? 1;
    if (!f.paused)
      this.pausedBlend = undefined;
    this.wasPaused = f.paused;
    const gl = this.gl;
    const view = this.view, refresh = !view || view.shifts !== shifts.join() ||
                                      -c.ox / c.scale < view.left || -c.oy / c.scale < view.top ||
                                      (cameraState.viewportWidth - c.ox) / c.scale > view.right ||
                                      (cameraState.viewportHeight - c.oy) / c.scale > view.bottom;
    if (this.plants !== f.plants || refresh)
      this.upload(f, c, shifts);
    if (!this.count)
      return true;
    const b = this.bounds;
    if (b && !shifts.some(shift => (b[2] + shift) * c.scale + c.ox >= 0 &&
                                   (b[0] + shift) * c.scale + c.ox <= cameraState.viewportWidth &&
                                   b[3] * c.scale + c.oy >= 0 &&
                                   b[1] * c.scale + c.oy <= cameraState.viewportHeight))
      return true;
    const range = layer === null ? {start : 0, count : this.count}
                  : typeof layer === 'object'
                      ? (layer.ids || [ layer.id ]).map(id => this.ranges.get(id))
                      : this.layers[layer];
    if (this.segmentScale !== c.scale) {
      this.segmentScale = c.scale;
      this.drawRuns.clear();
    }
    const selected = (Array.isArray(range) ? range : [ range ]).filter(r => r?.count);
    const groups = selected.map(r => {
      const key = r.start + ':' + r.count;
      let runs = this.drawRuns.get(key);
      if (!runs) {
        runs = [];
        for (let i = r.start; i < r.start + r.count; ++i) {
          const span = this.organSpans[i] * c.scale,
                tier = c.scale < GRASS.min_scale
                           ? 0
                           : GRASS.spans.filter(limit => span >= limit).length,
                segments = GRASS.segments[tier], last = runs[runs.length - 1];
          if (last?.segments === segments)
            ++last.count;
          else
            runs.push({start : i, count : 1, segments});
        }
        this.drawRuns.set(key, runs);
      }
      return runs;
    });
    const runs = groups.length === 1 ? groups[0] : mergeInstanceRanges(groups.flat());
    if (!runs.length)
      return true;
    ctx.beginExternal();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (typeof layer === 'number' && !this.layerCopy) {
      const base = GRASS_FLOATS * this.count, n = GRASS_FLOATS;
      this.layerOrder.forEach(
          (index, k) => { this.instances.copyWithin(base + n * k, n * index, n * index + n); });
      gl.bufferSubData(gl.ARRAY_BUFFER, base * Float32Array.BYTES_PER_ELEMENT,
                       this.instances.subarray(base, base + n * this.layerOrder.length));
      this.layerCopy = true;
    }

    this.beginOnCanvas(cameraState);
    gl.uniform1f(this.uniforms.scale, c.scale);
    gl.uniform1f(this.uniforms.blend, this.poseBlend(f));
    for (const run of runs) {
      this.attributes(run.start);
      gl.uniform1f(this.uniforms.segments, run.segments);
      for (const shift of shifts) {
        gl.uniform2f(this.uniforms.offset, c.ox + shift * c.scale, c.oy);
        this.submit(gl.TRIANGLES, run.segments * QUAD_VERTICES, run.count);
      }
    }
    if (gl.isContextLost())
      return false;
    ctx.endExternal();
    return true;
  }
}

export function grassHitBounds(p) {
  const renderer = vegetationState.gpuGrass;
  return renderer?.plants === sceneState.frame?.plants
             ? (renderer.hitBounds?.get(p[PLANT.id]) ||
                [ Infinity, Infinity, -Infinity, -Infinity ])
             : null;
}

export function grassPartPose(p, part, f = sceneState.frame) {
  const renderer = vegetationState.gpuGrass,
        pose = renderer?.poses.get(p[PLANT.id] + ':' + part.stem);
  if (!pose)
    return part;
  const t = renderer.poseBlend(f);
  return {
    ...part,
    q : pose.before.map((v, k) => v + (pose.next[k] - v) * t),
    width : pose.beforeWidth + (pose.width - pose.beforeWidth) * t
  };
}
export function grassRootPose(id, stem, f) {
  const renderer = vegetationState.gpuGrass, pose = renderer?.poses.get(id + ':' + stem);
  if (!pose)
    return null;
  const t = renderer.poseBlend(f);
  return [
    pose.before[0] + (pose.next[0] - pose.before[0]) * t,
    pose.before[1] + (pose.next[1] - pose.before[1]) * t
  ];
}

export function paintGpuGrass(f, c, blend, shifts, layer = null) {
  vegetationState.gpuGrass ??= new GrassRenderer();
  return vegetationState.gpuGrass.paint(f, c, blend, shifts, layer);
}

export function resetTankBatches() {
  animalsState.gpuAnimals?.stopBuilder?.();
  resetSpermRenderer();
  updateAnimalsState({gpuAnimals : null});
  updateSedimentRendererState(
      {gpuSurface : null, gpuSediment : null, gpuSedimentCloud : null, gpuCloudLight : null});
  updateParticleRendererState({gpuFood : null});
  vegetationState.gpuGrass = null;
  updateParticleRendererState({tankLightField : null, gpuSmallAnimals : null});
  water_viewState.planktonParticles = null;
  water_viewState.planktonGrains = null;
}

const initializers = {
  "grassVertexShader" : () => {
    const K = ORGAN_KIND, O = ORGAN_PROFILE;
    grassVertexShader = `#version 300 es
precision highp float;
${attributeInputs([
      ...GRASS_ATTRIBUTES, [ 'gridVertex', 1 ]
    ])}
uniform vec2 viewport;
uniform vec2 offset;
uniform float scale;
uniform float blend;
uniform float segments;
out vec3 color;
out vec4 leafSurface;
out vec2 leafPoint;
flat out vec4 biteA;
flat out vec4 biteB;
vec2 curve(vec2 a,vec2 b,vec2 c,vec2 d,float t){float u=1.0-t;return u*u*u*a+3.0*u*u*t*b+3.0*u*t*t*c+t*t*t*d;}
float organProfile(int kind,float t){
 if(kind==${K.blade})return pow(max(0.0,1.0-pow(t,${glsl(O.blade_power)})),${glsl(O.blade_shape)});
 if(kind==${K.stem})return (1.0-${glsl(O.stem_taper)}*t)*(1.0+${glsl(O.stem_knot)}*exp(-pow((t-${
        glsl(O.knot_at)})/${glsl(O.knot_width)},2.0)));
 if(t<${glsl(O.leaf_base)})return ${glsl(O.leaf_stalk)};
 float v=(t-${glsl(O.leaf_base)})/${glsl(1 - O.leaf_base)},s=max(0.0,sin(${glsl(Math.PI)}*v));
 return kind==${K.leaf}?pow(s,${glsl(O.leaf_power)})*(1.0+${glsl(O.leaf_ripple)}*sin(${
        glsl(O.leaf_ripples *
             Math.PI)}*v)):pow(s,${glsl(O.round_power)})*(1.0-${glsl(O.round_taper)}*v);
}
vec4 biteDisc(float at,float depth,float share,float length,float width,int kind){
 if(depth==0.0||share<=0.0)return vec4(0.0);
 float margin=max(${glsl(BITE.min_margin)},width*organProfile(kind,clamp(at,0.0,1.0))),chord=max(${
        glsl(BITE.min_chord)},share*length),
       cut=min(${glsl(BITE.max_cut)}*margin,max(${
        glsl(BITE.min_cut)},abs(depth)*2.0*margin)),radius=(chord*chord+cut*cut)/(2.0*cut);
 return vec4(at*length,sign(depth)*(margin+radius-cut),radius,1.0);
}
void main(){
 int vertexID=int(gridVertex+.5),vertex=vertexID%${QUAD_VERTICES};
 float t=(float(vertexID/${QUAD_VERTICES})+float(vertex==2||vertex==4||vertex==5))/segments;
 float side=vertex==0||vertex==2||vertex==5?-1.0:1.0;
 vec4 ab=mix(old01,next01,blend),cd=mix(old23,next23,blend);vec2 a=ab.xy,b=ab.zw,c=cd.xy,d=cd.zw;
 float u=1.0-t;vec2 tangent=3.0*u*u*(b-a)+6.0*u*t*(c-b)+3.0*t*t*(d-c);vec2 normal=vec2(-tangent.y,tangent.x)/max(${
        glsl(RIBBON.min_length)},length(tangent));
 int kind=int(shape.w+.5);float organWidth=mix(shape.x,shape.y,blend),profile=organProfile(kind,t);
 float w=organWidth*profile;
 vec2 second=6.0*u*(c-2.0*b+a)+6.0*t*(d-2.0*c+b);
 if(kind>=${K.leaf})w=min(w,${glsl(RIBBON.curl_room)}*pow(max(${
        glsl(RIBBON.min_length)},length(tangent)),3.0)/max(${
        glsl(RIBBON.min_curvature)},abs(tangent.x*second.y-tangent.y*second.x)));
 float organLength=.5*(length(d-a)+length(b-a)+length(c-b)+length(d-c));
 leafPoint=vec2(t*organLength,side*w);
 biteA=biteDisc(notchA.x,notchA.y,notchA.z,organLength,organWidth,kind);
 biteB=biteDisc(notchA.w,notchB.x,notchB.y,organLength,organWidth,kind);
 vec2 p=curve(a,b,c,d,t)+normal*side*w;vec2 screen=p*scale+offset;
 gl_Position=vec4(2.0*screen.x/viewport.x-1.0,1.0-2.0*screen.y/viewport.y,0.0,1.0);
 leafSurface=vec4(side,t,kind>=${
        K.leaf}?1.0:0.0,float(kind));color=tint.rgb*mix(organLight.x,organLight.y,t);
}`;
  },
  "grassFragmentShader" : () => {
    grassFragmentShader = `#version 300 es
precision highp float;
in vec3 color;
in vec4 leafSurface;
in vec2 leafPoint;
flat in vec4 biteA;
flat in vec4 biteB;
out vec4 fragment;
float biteDistance(vec4 disc){return disc.w>0.0?length(leafPoint-disc.xy)-disc.z:1e6;}
void main(){
 float wound=min(biteDistance(biteA),biteDistance(biteB));
 if(wound<0.0)discard;
 float x=leafSurface.x,t=leafSurface.y,edge=abs(x),pixel=max(.015,fwidth(x));
 float rim=smoothstep(1.0-min(.30,1.1*pixel),1.0,edge)*min(1.0,1.0/pixel);
 float fold=.74+.30*sqrt(max(0.0,1.0-x*x))+.065*x;
 float midrib=(1.0-smoothstep(.025,.025+pixel*.7,abs(x)))*(.5+.5*sin(3.14159*t));
 float branches=abs(sin((t*5.3-abs(x)*(.45+.22*t)+.045*sin(t*19.0)+.03*x)*3.14159));
 float veins=(1.0-smoothstep(.012,.012+fwidth(branches),branches))*smoothstep(.08,.2,edge)*(1.0-smoothstep(.65,.95,edge))*leafSurface.z;
 float fine=1.-smoothstep(.03,.15,fwidth(t));
 float texture=fine*(.025*sin(t*83.0+x*19.0)+.018*sin(t*149.0-x*31.0));
 vec3 shaded=color*(fold+texture)*(.94+.06*smoothstep(0.0,.5,t));
 shaded+=vec3(.12,.18,.06)*midrib*.40+vec3(.08,.12,.03)*veins*.32;
 shaded+=color*.12*exp(-pow((x+.30)*4.,2.))*sin(3.14159*t);
 shaded=mix(shaded,color*.30+vec3(.012,.023,.014),rim*.28);
 float scar=1.0-smoothstep(0.0,max(.2,1.6*length(fwidth(leafPoint))),wound);
 shaded=mix(shaded,color*.45+vec3(.11,.07,.02),.65*scar);
 fragment=vec4(shaded,1.0);
}`;
  },
  "gpuGrass" : () => { vegetationState.gpuGrass = null; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}

export function preparedShaders() { return [ [ grassVertexShader, grassFragmentShader ] ]; }
