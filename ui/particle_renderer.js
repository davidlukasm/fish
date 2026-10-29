import {paintSpermField} from './sperm_renderer.js';
import {BED_LAYERS, bedLayer, bedScale, bedColorAt, animalFoot} from './plant_geometry.js';
import {cameraState} from './camera.js';
import {canvas, ctx} from './dom.js';
import {displayLight} from './water_view.js';
import {TankBatch, mergeInstanceRanges} from './renderer.js';
import {displayStep, horizontalDelta, sceneState} from './state.js';
export const particle_rendererState = {};
export let foodVertexShader;

export let foodFragmentShader;

export function foodDisplayRadius(p) { return p[6]; }

export function foodShape(p) {
  const phase = ((p[3] % 997) * .61803398875) % 1;
  return p[7] === 3 || p[7] >= 7 ? 5 + p[3] % 3 + phase : p[7] === 4 ? 6 + phase : 0;
}

export function paintFaunaPreview(f, c, rows) {
  const renderer = particle_rendererState.faunaPreview ??= new FoodRenderer(true);
  const signature = rows.map(p => p.join(',')).join(';');
  if (signature !== renderer.signature) {
    renderer.revision = -1;
    renderer.signature = signature;
  }
  renderer.paint({...f, invertebrates : rows}, c, 1);
}
export function smallAnimalLayer(p) { return bedLayer(p[19] ?? .5); }

export function overviewFood(pieces, c) {
  const cell = (c.scale < .5 ? 12 : 6) / c.scale, bins = new Map(), visible = [];
  for (const p of pieces) {
    const x = p[0] * c.scale + c.ox, y = p[1] * c.scale + c.oy;
    if (x < -24 || y < -24 || x > cameraState.viewportWidth + 24 ||
        y > cameraState.viewportHeight + 24)
      continue;
    if (c.scale >= 1.5 || foodDisplayRadius(p) * c.scale >= 1) {
      visible.push(p);
      continue;
    }
    const key = Math.floor(p[0] / cell) + ':' + Math.floor(p[1] / cell) + ':' + p[7];
    const old = bins.get(key), radius = foodDisplayRadius(p);
    if (old) {
      const n = ++old.n;
      old.p[0] += (p[0] - old.p[0]) / n;
      old.p[1] += (p[1] - old.p[1]) / n;
      old.p[2] += p[2];
      old.area += radius * radius;
      old.p[6] = Math.min(cell * .40, Math.sqrt(old.area));
    } else {
      const q = p.slice();
      q[6] = radius;
      q.overviewKey = key;
      bins.set(key, {p : q, n : 1, area : radius * radius});
    }
  }
  return visible.concat(Array.from(bins.values())
                            .filter(b => c.scale >= .5 || b.p[6] * c.scale >= .75)
                            .map(b => Object.assign(b.p, {groupCount : b.n})));
}

export class FoodRenderer extends TankBatch {
  constructor(animals = false) {
    super(canvas, ctx, foodVertexShader, foodFragmentShader,
          animals ? [ 4, 4, 3, 4, 4, 4, 3, 2 ] : [ 4, 4, 3 ], [
            'viewport', 'offset', 'scale', 'blend', 'lightField', 'lightGrid', 'world',
            'bottomLight', 'daylight', 'step'
          ]);
    this.animals = animals;
  }
  paint(f, c, blend, layer = null) {
    const gl = this.gl;
    if (gl.isContextLost())
      return false;
    const pieces = this.animals ? f.invertebrates : f.food;
    if (!pieces?.length)
      return true;
    ctx.beginExternal();
    gl.bindVertexArray(this.vao);
    const lod = this.animals ? '' : [
      c.scale < 1.5 ? Math.round(c.scale * 64) : 0, Math.floor(c.ox / 24), Math.floor(c.oy / 24)
    ].join(':');
    if (this.revision !== sceneState.frameRevision || this.lod !== lod) {
      this.lod = lod;
      const count = pieces.length, stride = this.animals ? 28 : 11;
      this.count = count;
      this.revision = sceneState.frameRevision;
      if (!count)
        return true;
      if (!this.data || this.data.length < count * stride)
        this.data = new Float32Array(Math.max(640, 2 ** Math.ceil(Math.log2(count * stride))));
      let at = 0;
      const data = this.data;
      const ordered =
          this.animals
              ? [...pieces ]
                    .filter(p => p[7] !== 6)
                    .sort((a, b) => animalFoot(a).y - animalFoot(b).y || a[3] - b[3])
              : overviewFood(pieces, c).sort((a, b) => Number(a[5] > 0) - Number(b[5] > 0));
      if (!this.animals) {
        const first = ordered.findIndex(p => p[5] > 0), count = first < 0 ? ordered.length : first;
        this.airRange = {start : 0, count};
        this.groundRange = {start : count, count : ordered.length - count};
        this.ranges = new Map(ordered.map((p, start) => [p[3], {start, count : 1}]));
      }
      this.count = ordered.length;
      if (this.animals)
        this.ranges = new Map(ordered.map((p, start) => [p[3], {start, count : 1}]));
      if (this.animals)
        this.layers = Array.from({length : BED_LAYERS}, (_, i) => i)
                          .map(layer => ordered.flatMap((p, start) => smallAnimalLayer(p) === layer
                                                                          ? [ {start, count : 1} ]
                                                                          : []));
      const priorOverview = this.overview || new Map();
      if (!this.animals)
        this.overview = new Map(ordered.filter(p => p.overviewKey).map(p => [p.overviewKey, p]));
      for (const p of ordered) {
        const old =
                  p.overviewKey
                      ? priorOverview.get(p.overviewKey) ||
                            (p.groupCount === 1 ? sceneState.previousFood?.get(p[3]) : null)
                      : (this.animals ? sceneState.previousInvertebrates : sceneState.previousFood)
                            ?.get(p[3]),
              x = old ? old[0] + horizontalDelta(p[0] - old[0]) : p[0];
        data[at++] = old?.[0] ?? x;
        data[at++] = old?.[1] ?? p[1];
        data[at++] = x;
        data[at++] = p[1];
        data[at++] = this.animals    ? (old || p)[6] * bedScale((old || p)[19] ?? .5)
                     : c.scale < 1.5 ? p[6]
                                     : foodDisplayRadius(old || p);
        data[at++] = this.animals    ? p[6] * bedScale(p[19] ?? .5)
                     : c.scale < 1.5 ? p[6]
                                     : foodDisplayRadius(p);
        const illumination = 1; // The shared shader applies local illumination once.
        // Artificial food is drawn a little muted so it does not dominate the picture.
        const muted = !this.animals && !p[7] ? .62 : 1, r = p[8] ?? 1, g = p[9] ?? .2,
              b = p[10] ?? .1, grey = .3 * r + .59 * g + .11 * b;
        data[at++] = (grey + (r - grey) * muted) * (muted < 1 ? .9 : 1) * illumination;
        data[at++] = (grey + (g - grey) * muted) * (muted < 1 ? .9 : 1) * illumination;
        data[at++] = (grey + (b - grey) * muted) * (muted < 1 ? .9 : 1) * illumination;
        data[at++] = this.animals ? -p[7] : foodShape(p);
        data[at++] = this.animals ? (p[7] === 7   ? (p[13] || 0)
                                     : p[7] === 8 ? (p[24] || 0)
                                                  : Math.min(1, Math.sqrt(Math.max(0, p[12] || 0))))
                                  : 0;
        if (this.animals) {
          data[at++] = (p[3] % 997 * .61803398875) % 1;
          data[at++] = old?.[11] ?? p[11] ?? 0;
          data[at++] = p[11] || 0;
          // The pose channel is shell closure for mussels, visible fraction for crabs.
          data[at++] = p[7] === 7 ? (old?.[13] ?? p[13] ?? 0) : (old?.[17] ?? p[17] ?? 0);
          data[at++] = p[14] ?? 0;
          data[at++] = p[15] ?? 0;
          data[at++] = p[16] ?? 1;
          data[at++] = p[17] ?? 0;
          if (p[7] === 8) {
            const before = old?.[13] ?? p[13] ?? 0, after = p[13] ?? 0;
            data[at++] = before;
            data[at++] = after;
          } else {
            data[at++] = old?.[18] ?? p[18] ?? 1;
            data[at++] = p[18] ?? 1;
          }
          data[at++] = p[7] === 8 ? p[18] ?? 1 : (p[20] || 0) * bedScale(p[19] ?? .5);
          data[at++] = p[21] || 0;
          const length = p[7] === 7 ? p[13] || 0 : 0, angle = p[11] || 0,
                soil =
                    bedColorAt(f, p[0] - Math.sin(angle) * length, p[1] + Math.cos(angle) * length);
          for (const channel of soil)
            data[at++] = channel;
          data[at++] = p[0] + horizontalDelta((p[22] ?? p[0]) - p[0]);
          data[at++] = p[23] ?? p[1];
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, at), gl.DYNAMIC_DRAW);
    }
    if (!this.count)
      return true;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.viewport, cameraState.viewportWidth, cameraState.viewportHeight);
    gl.uniform2f(this.uniforms.offset, c.ox, c.oy);
    gl.uniform1f(this.uniforms.scale, c.scale);
    gl.uniform1f(this.uniforms.blend, blend);
    gl.uniform1f(this.uniforms.step, displayStep(f, blend));
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, foodLightTexture(f));
    gl.uniform1i(this.uniforms.lightField, 1);
    gl.uniform2f(this.uniforms.lightGrid, f.light?.columns || 1, f.light?.rows || 1);
    gl.uniform2f(this.uniforms.world, f.width || 1, f.height || 1);
    gl.uniform1f(this.uniforms.bottomLight, f.light?.bottom ?? 1);
    gl.uniform1f(this.uniforms.daylight, f.daylight ?? 1);
    const range = this.animals && layer !== null
                      ? layer && typeof layer === 'object'
                            ? (layer.ids || [ layer.id ]).map(id => this.ranges.get(id))
                            : this.layers[layer]
                  : !this.animals
                      ? (layer === 'ground' ? this.groundRange
                         : layer && typeof layer === 'object'
                             ? (layer.ids || [ layer.id ]).map(id => this.ranges.get(id))
                             : this.airRange)
                      : {start : 0, count : this.count};
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const run of mergeInstanceRanges(Array.isArray(range) ? range : [ range ])) {
      this.attributes(Math.max(0, run.start));
      this.submit(gl.TRIANGLES, 6, run.count);
    }
    if (gl.isContextLost())
      return false;
    ctx.endExternal();
    return true;
  }
}

export function foodLightTexture(f) {
  const gl = ctx.gl, l = f.light, width = l?.columns || 1, height = l?.rows || 1;
  if (!particle_rendererState.tankLightField) {
    const texture = gl.createTexture();
    particle_rendererState.tankLightField = {texture, revision : -1};
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  }
  const t = particle_rendererState.tankLightField;
  gl.bindTexture(gl.TEXTURE_2D, t.texture);
  if (t.revision !== sceneState.frameRevision || t.frame !== f) {
    const data = l?.values?.length
                     ? (l.values instanceof Float32Array ? l.values : new Float32Array(l.values))
                     : new Float32Array([ 1 ]);
    if (t.width !== width || t.height !== height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, width, height, 0, gl.RED, gl.FLOAT, data);
      t.width = width;
      t.height = height;
    } else
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.FLOAT, data);
    t.revision = sceneState.frameRevision;
    t.frame = f;
  }
  return t.texture;
}

export function paintGpuFood(f, c, blend, layer = null) {
  if (!f.food?.length)
    return true;
  particle_rendererState.gpuFood ??= new FoodRenderer();
  return particle_rendererState.gpuFood.paint(f, c, blend, layer);
}

export function paintGpuSmallAnimals(f, c, blend, layer = null) {
  if (!f.invertebrates?.length)
    return true;
  particle_rendererState.gpuSmallAnimals ??= new FoodRenderer(true);
  return particle_rendererState.gpuSmallAnimals.paint(f, c, blend, layer);
}

export function paintGpuGametes(f, c, blend) {
  if (globalThis.document?.getElementById?.('layer-sperm')?.checked === false)
    return;
  return paintSpermField(f, c, blend);
}

export function updateParticleRendererState(patch) {
  Object.assign(particle_rendererState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "foodVertexShader" : () => {
    // Individual grains share one GPU batch; their ecology and picking remain individual.
    foodVertexShader = `#version 300 es
precision highp float;
layout(location=0) in vec4 positions;
layout(location=1) in vec4 radiiRG;
layout(location=2) in vec3 blueShape;
layout(location=3) in vec4 individual;
layout(location=4) in vec4 morphology;
layout(location=5) in vec4 substrate;
layout(location=6) in vec3 soilTint;
layout(location=7) in vec2 foodLocation;
uniform vec2 viewport;
uniform vec2 offset;
uniform float scale;
uniform float blend;
uniform sampler2D lightField;
uniform vec2 lightGrid;
uniform vec2 world;
uniform float bottomLight;
uniform float daylight;
uniform float step;
out vec2 point;
out vec3 color;
out float illumination;
out float opacity;
out float phase;
out vec2 soilPoint;
flat out float shape;
flat out float algae;
flat out float variation;
flat out float morph;
flat out float ground;
flat out vec3 behavior;
flat out float screenRadius;
flat out float wormWidth;
flat out float feedingRate;
flat out float soilCover;
flat out vec3 soilColor;
flat out vec2 foodPoint;
void main(){
 vec2 corners[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(1,1),vec2(-1,-1),vec2(1,1),vec2(-1,1));point=corners[gl_VertexID];
 float kind=floor(-blueShape.y),minimum=blueShape.y<0.?1.5:.75;
 float radius=max(minimum,mix(radiiRG.x,radiiRG.y,blend)*scale);screenRadius=radius;vec2 corner=point*radius;
 float visibility=1.;vec2 location=mix(positions.xy,positions.zw,blend),wormBase=location;soilPoint=vec2(0.);
 foodPoint=vec2(0.);soilColor=soilTint;soilCover=substrate.z;feedingRate=substrate.w;wormWidth=1.;variation=individual.x;morph=morphology.x;behavior=morphology.yzw;ground=mix(substrate.x,substrate.y,blend);
 if(kind==9.||kind==8.)behavior.z=mix(individual.w,morphology.w,blend);
 if(blueShape.y<0.){
   float turn=atan(sin(individual.z-individual.y),cos(individual.z-individual.y));
   float a=individual.y+smoothstep(0.,1.,blend)*turn;
   if(kind==7.){
     vec2 oldBase=positions.xy+vec2(-sin(individual.y),cos(individual.y))*individual.w;
     vec2 newBase=positions.zw+vec2(-sin(individual.z),cos(individual.z))*blueShape.z;
     vec2 stem=mix(oldBase,newBase,blend)-location;
     wormBase=location+stem;
     float reach=length(stem);
     a=reach>.0001?atan(-stem.x,stem.y):a;
     float drawn=max(reach,substrate.z),width=max(radius*2.6,drawn*scale*.25);
     wormWidth=radius*2.2/width;
     ground=2.*reach/max(.001,drawn)-1.;
     float bodyY=mix(-radius*.6,drawn*scale+radius*1.05,(point.y+1.)*.5);
     point.y=2.*bodyY/max(.001,drawn*scale)-1.;
     corner=vec2(point.x*width,bodyY);
     screenRadius=max(radius,drawn*scale*.25);
     visibility=1.; // The anchored burrow remains when the body has withdrawn.
   }
   if(kind==8.){
     point.x*=1.5;corner.x*=1.5;
     vec2 delta=(foodLocation-location)*scale/max(.1,radius);
     foodPoint=mat2(cos(a),-sin(a),sin(a),cos(a))*delta;
     foodPoint.x*=behavior.y;
     if(blueShape.z==10.)foodPoint=vec2(.40,.28);
     foodPoint*=min(1.,1.12/max(.001,length(foodPoint)));
     corner.x*=behavior.y;
     float exposure=behavior.z;
     corner.y+=(1.-exposure)*radius*1.2;
     visibility*=substrate.z>0.?1.:(exposure>.001?1.:0.);
   }
   if(kind==9.&&morph<4.){float lean=(variation-.5)*.48;vec2 hinge=vec2(0.,.62*radius);corner=hinge+mat2(cos(lean),sin(lean),-sin(lean),cos(lean))*(corner-hinge);}
   corner=mat2(cos(a),sin(a),-sin(a),cos(a))*corner;
 }
 vec2 p=location*scale+offset+corner;
 if(kind==7.){vec2 v=(p-wormBase*scale-offset)/max(1.,radius);float a=morphology.y;soilPoint=mat2(cos(a),-sin(a),sin(a),cos(a))*v;}
 phase=step*(.075+.07*variation)+variation*53.;
 if(kind==8.&&behavior.z>.999&&behavior.x!=5.&&substrate.w<=0.)phase=ground;
 gl_Position=vec4(p.x/viewport.x*2.-1.,1.-p.y/viewport.y*2.,0,1);float depth=1.-(1.-bottomLight)*clamp(location.y/world.y,0.,1.);vec2 uv=(vec2(fract(location.x/world.x),clamp(location.y/world.y,0.,1.))*(lightGrid-1.)+.5)/lightGrid;float light=.40+.60*sqrt(clamp(texture(lightField,uv).r*depth*daylight,0.,1.));color=vec3(radiiRG.zw,blueShape.x);illumination=light;opacity=visibility;shape=blueShape.y;algae=blueShape.z;
}`;
  },
  "foodFragmentShader" : () => {
    foodFragmentShader = `#version 300 es
precision highp float;
in vec2 point;
in vec3 color;
in float illumination;
in float opacity;
in float phase;
in vec2 soilPoint;
flat in float shape;
flat in float algae;
flat in float variation;
flat in float morph;
flat in float ground;
flat in vec3 behavior;
flat in float screenRadius;
flat in float wormWidth;
flat in float feedingRate;
flat in float soilCover;
flat in vec3 soilColor;
flat in vec2 foodPoint;
out vec4 fragColor;
float limb(vec2 p,vec2 a,vec2 b,float width){
 vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.))/width;
}
void main(){
 float d=length(point),sides=floor(shape);
 if(sides>=3. && d>0.){float halfAngle=3.14159265/sides,angle=atan(point.y,point.x)+fract(shape)*6.28318531;d*=cos(mod(angle+halfAngle,2.*halfAngle)-halfAngle)/cos(halfAngle);}
 vec3 tint=color;
 if(shape>=0.)tint*=.88+.22*sqrt(max(0.,1.-d*d))-.12*point.y;
 if(shape<0. && screenRadius<3. && floor(-shape)!=7.) {
   float kind=floor(-shape);
   d=kind==8.?length(point*vec2(1.,1.5)):kind==9.?length(point*vec2(1.6,1.)):max(abs(point.x)*2.7,abs(point.y));
   float alpha=1.-smoothstep(1.-max(.03,fwidth(d)),1.,d);fragColor=vec4(tint*illumination*alpha*opacity,alpha*opacity);return;
 }
 if(shape<0.) {
   float kind=floor(-shape);
   if(kind==7.) {
     float bend=(.34*sin(phase*.18+point.y*1.15+variation*4.)+.09*sin(phase*.11-point.y*1.8))*max(0.,1.-point.y*point.y);
     float family=floor(morph),width=(.25+.10*variation+.08*(1.-point.y))*(family==2.?1.25:family==1.?.8:1.);
     if(family==3.)width*=.85+.15*cos(point.y*18.);
     if(family==0.)width*=.55+.45*(1.-point.y*.5);
     if(family==1.)width*=.65+.35*sqrt(max(0.,1.-point.y*point.y));
     if(family==2.)width*=.9+.1*sin(point.y*22.);
     width*=wormWidth;
     d=length(vec2((point.x-bend)/width,max(0.,abs(point.y)-.88)/.12));
     if(soilPoint.y>0. || ground<-.995)d=3.;
     if(family==3.){for(int k=0;k<9;k++){float y=-.8+float(k)*.2,wiggle=.08*sin(phase+y*7.);for(int side=-1;side<=1;side+=2)d=min(d,limb(point,vec2(bend+float(side)*width*.7,y),vec2(bend+float(side)*(width+.19),y+wiggle),.025));}}
     // Feeding crowns and flattened heads distinguish the exposed worm families.
     if(family==1.){
       for(int k=0;k<7;k++){
         float fan=(float(k)-3.)*.19,tip=-.93+.08*abs(float(k)-3.);
         d=min(d,limb(point,vec2(0.,-.76),vec2(fan*wormWidth,tip),.018*wormWidth));
       }
     }
     if(family==2.)d=min(d,length(vec2(point.x/(width*1.25),(point.y+.83)/.12)));
     float rings=.95+.05*cos(point.y*(family==0.?42.:family==1.?60.:family==2.?26.:35.));
     vec3 skin=family==0.?vec3(.62,.32,.27):family==1.?vec3(.64,.49,.36):family==2.?vec3(.42,.29,.27):vec3(.54,.37,.42);
     tint=mix(tint,skin,.8)*rings;
     tint*=.78+.22*(1.-abs(point.x-bend)/width);
     if(soilPoint.y>0. || ground<-.995)d=3.;
     // The opening belongs to this worm's own instance and shares its depth order.
     float hole=length(vec2(soilPoint.x/2.15,soilPoint.y/.62));
     if(hole<1.&&d>1.){d=hole;tint=soilColor*.46;}
     float lip=length(vec2(soilPoint.x/2.65,(soilPoint.y-.30)/.52));
     if(lip<1.){d=min(d,lip);float mound=sqrt(max(0.,1.-lip*lip));tint=soilColor*(.88+.15*mound+.025*sin(soilPoint.x*29.+soilPoint.y*37.));}
   }
   if(kind==8.) {
     float family=floor(morph),v=fract(morph);
     float exposure=behavior.z;
     float soilLine=point.y+(1.-exposure)*1.2;
     bool underSoil=soilCover>0.&&soilLine>(.18+.40*exposure);
     float digging=1.-smoothstep(.85,1.,exposure),stroke=phase*(2.7+.4*v),
           rising=behavior.x==4.?1.:0.,tilt=digging*(.10*sin(stroke)+.10*(1.-exposure));
     vec2 bodyPoint=mat2(cos(tilt),sin(tilt),-sin(tilt),cos(tilt))*point;
     vec2 bodyScale=family==0.?vec2(1.35,3.0):family==1.?vec2(2.2,1.85):family==2.?vec2(1.6,2.6):vec2(1.85,2.15);
     vec2 shellPoint=bodyPoint*(bodyScale+vec2(.35*(v-.5),.5*(variation-.5)));
     float body=family==0.?length(shellPoint):family==1.?pow(pow(abs(shellPoint.x),2.8)+pow(abs(shellPoint.y),2.8),1./2.8):family==2.?max(abs(shellPoint.y),.866*abs(shellPoint.x)+.5*abs(shellPoint.y)):pow(pow(abs(shellPoint.x),3.5)+pow(abs(shellPoint.y),3.5),1./3.5);
     if(family==2.)body*=1.+.06*cos(atan(shellPoint.y,shellPoint.x)*8.);

     d=body;float held=3.,feeding=min(1.,sqrt(max(0.,feedingRate))*5.)*exposure;
     for(int side=-1;side<=1;side+=2){
       vec2 q=vec2(point.x*float(side),point.y);
       for(int leg=0;leg<4;leg++){
         float row=float(leg),y=-.17+row*.12,
               swing=(exposure<1.?.13:.07)*sin((exposure<1.?phase*3.5:ground)+row*1.8+float(side)*2.);
         float brace=digging*smoothstep(1.,3.,row);
         float swimming=behavior.x==5.?1.:0.;
         vec2 joint=vec2(.68+.06*sin(row),y*1.7+swing*(1.-.65*brace)),
              tip=vec2(.94-.035*row-.13*digging*sin(stroke+row),y*2.5+.14+swing*(1.-brace));
         if(exposure>.98 && swimming<.5) {
           float gait=fract(ground/6.28318531+row*.27+(side==1?.5:0.)), stance=.58;
           float stride=gait<stance?.61-1.22*gait/stance:-.61+1.22*smoothstep(0.,1.,(gait-stance)/(1.-stance));
           float lift=gait<stance?0.:.23*sin(3.14159*(gait-stance)/(1.-stance));
           tip=vec2(.88-.03*row+stride*float(side),y*2.5+.14-lift);
           joint=mix(vec2(.38,y),tip,.56)+vec2(.12,-.08);
         }
         joint=mix(joint,vec2(.56,y+.12*sin(phase*3.+row)),swimming);
         tip=mix(tip,vec2(.72,y+.19*sin(phase*3.+row+1.)),swimming);
         d=min(d,min(limb(q,vec2(.38,y),joint,.045),limb(q,joint,tip,.032)));
       }
       float beat=stroke+float(side)*1.2, scoop=.5+.5*sin(beat);
       float size=(.80+.25*v+.13*float(side))*(family==3.&&side==1?1.4:1.);
       vec2 wrist=mix(vec2(.63,-.49+.035*sin(phase+float(side))),
                      vec2(.46+.25*scoop,max(-.65,-.32+.28*cos(beat)-.12*rising)),digging);
       vec2 elbow=mix(vec2(.46,-.27),vec2(.52,-.16+.17*sin(beat)),digging);
       float cycle=fract(phase*.12+float(side)*.5),carry=smoothstep(.15,.72,cycle);
       vec2 source=vec2(foodPoint.x*float(side),foodPoint.y);
       float gripActive=step(0.,foodPoint.x*float(side));
       vec2 pickup=mix(source,vec2(.06,-.30),carry);
       wrist=mix(wrist,pickup,feeding*(1.-digging)*gripActive);
       elbow=mix(elbow,vec2(.37,-.25-.08*carry),feeding*(1.-digging));
       d=min(d,min(limb(q,vec2(.35,-.18),elbow,.055),limb(q,elbow,wrist,.05)));
       vec2 claw=(q-wrist-vec2(.04,-.09))/size;
       float shell=length(claw*vec2(5.8,6.6));
       float gape=mix(.025,.012+.055*scoop,digging);
       shell=max(shell,claw.y<-.01 && abs(claw.x)<gape*(-claw.y+.08)*7.?1.3:0.);
       d=min(d,shell);
       if(feeding>.01&&gripActive>.5&&cycle>.15&&cycle<.82)
         held=min(held,length((q-wrist)/max(.03,.065*feeding)));

       d=min(d,limb(q,vec2(.22,-.25),vec2(.25,-.45),.036));
       d=min(d,length((q-vec2(.25,-.45))*16.));
     }
     vec3 skin=family==0.?vec3(.78,.32,.13):family==1.?vec3(.40,.24,.18):family==2.?vec3(.47,.43,.22):vec3(.57,.18,.14);tint=mix(tint,skin,.75)*(.88+.24*v);
     if(body<1.){
       float rim=smoothstep(.72,1.,body),groove=exp(-abs(point.x)*60.)*smoothstep(-.15,.12,point.y);
       float freckles=sin(point.x*(37.+11.*v)+variation*11.)*sin(point.y*43.+v*13.);
       tint*=.88+.12*cos(point.x*5.)*(1.-point.y)-.25*rim-.2*groove;
       tint=mix(tint,tint*.55,smoothstep(.78,.95,freckles)*.5);
     }
     if(length(vec2(abs(point.x),point.y)-vec2(.25,-.45))<.053)tint=vec3(.055,.07,.065);
     float mouth=length((point-vec2(0.,-.29))*vec2(14.,22.));
     if(mouth<1.)tint=mix(tint,vec3(.09,.045,.03),.85);
     if(feeding>.01){float mandible=.04*sin(phase*2.1);for(int side=-1;side<=1;side+=2){
       float jaw=limb(point,vec2(float(side)*.10,-.30),vec2(float(side)*(.025+mandible),-.25),.024);
       if(jaw<d){d=jaw;tint=vec3(.36,.19,.10);}}}
     if(underSoil)d=3.;
     if(held<d&&exposure>.5){d=held;tint=algae==5.?vec3(.36,.43,.18):vec3(.60,.46,.30);}
     if(exposure<1.&&soilCover>0.){
       float hole=length(vec2(point.x/(.28+.58*exposure),(soilLine-.17)/max(.001,.095*(1.-smoothstep(.72,1.,exposure)))));
       if(hole<1.&&d>1.){d=hole;tint=soilColor*.46;}
       float moundHeight=.22*(1.-smoothstep(.82,1.,exposure));
       float lip=length(vec2(point.x/.98,(soilLine-.29)/max(.001,moundHeight)));
       if(lip<1.){d=min(d,lip);float hill=sqrt(max(0.,1.-point.x*point.x));tint=soilColor*(.85+.22*hill-.13*clamp((soilLine-.08)/.48,0.,1.)+.025*sin(point.x*31.+soilLine*47.)*sin(point.x*71.-soilLine*39.));}
       if(exposure<.04){float peek=smoothstep(.80,.98,sin(phase*.16+variation*17.)),blink=smoothstep(.05,.25,abs(sin(phase*1.7)));for(int side=-1;side<=1;side+=2){vec2 tip=vec2(float(side)*.18,.13-.17*peek);float stalk=limb(vec2(point.x,soilLine),vec2(float(side)*.18,.22),tip,.018);float eye=length((vec2(point.x,soilLine)-tip)*vec2(1.,1./max(.12,blink)))/.045;if(peek>.05&&min(stalk,eye)<d){d=min(stalk,eye);tint=eye<stalk?vec3(.06,.075,.06):vec3(.40,.34,.21);}}}
     }
     if(digging>0.&&exposure>.08&&exposure<.95){
       for(int k=0;k<10;k++){
         float j=float(k),seed=fract(sin(j*17.+variation*71.)*43758.54),t=fract(stroke*(.08+.025*seed)+j*.103),side=mod(j,2.)*2.-1.;
         vec2 grain=vec2(side*(.35+(.6+.25*seed)*t),.18-(.25+.35*seed)*sin(t*3.14159));
         float speck=length(point-grain)/(.025+.018*seed);
         if(speck<d){d=speck;tint=soilColor*(.86-.18*t);}
       }
     }
   }
   if(kind==9. && morph>=4.) {
     float angle=atan(point.y,point.x)+variation*6.28;
     d=length(point)/(.79+.075*cos(angle*5.)+.035*sin(angle*9.));
     d=max(d,1.+(.52-length(point-vec2(.22,-.26)))*1.8);
     tint=mix(vec3(.38,.20,.12),vec3(.65,.40,.23),fract(morph))*(.92+.08*cos(point.x*5.));
     tint=mix(tint,vec3(.72,.59,.39),.45*smoothstep(.82,1.,d));
   }
   if(kind==9. && morph<4.) {
     float family=floor(morph),v=fract(morph);
     float height=(family==0.?1.37:family==1.?1.48:family==2.?1.10:1.19)*(.94+.10*v),
           width=family==0.?.245:family==1.?.17:family==2.?.39:.33,
           opening=behavior.x==1.?(.85+.35*v):((family==2.?.35:.25)+.012*sin(phase*.35+v*12.))*(1.-behavior.z)+.025;
     vec2 hinge=vec2(0.,.62),q=point-hinge;
     float shells=3.;vec2 valve=vec2(0.);
     for(int side=-1;side<=1;side+=2){
       float signSide=float(side),angle=signSide*opening*(.92+.16*variation)+signSide*.012,
             asym=1.+signSide*(.025+.055*v);
       vec2 axis=vec2(sin(angle),-cos(angle)),normal=vec2(cos(angle),sin(angle));
       vec2 local=vec2(dot(q,normal),dot(q,axis));
       float t=clamp(local.y/height,0.,1.);
       float bulge=family==0.?(.65+.5*t):family==1.?(.52+.64*t):family==2.?(1.-.20*t):(.76+.19*sin(t*7.+v));
       float spreadOut=family==2.?.28:.13;
       float center=signSide*spreadOut*sin(t*3.14159)*(1.-behavior.z);
       float shell=length(vec2((local.x-center)/(width*bulge*asym),(local.y-height*.50)/(height*.50*(2.-asym))));
       float coating=(1.-exp(-6.*algae))*(.020+.025*(.5+.5*sin(t*23.+v*17.)));
       shell/=(1.+coating*(.5+.5*sin(local.x*31.+t*19.)));
       if(family==2.)shell*=1.+.018*cos(atan(local.x,local.y)*36.);
       if(family==3.)shell*=1.+.045*sin(t*27.+v*8.)+.025*cos(local.x*31.);
       if(shell<shells){shells=shell;valve=local;}
     }
     float up=-q.y,spread=max(.02,height*.30*tan(opening));
     float flesh=length(vec2(q.x/(spread*.34+.025),(up-height*.30)/(height*.23)));
     bool onShell=shells<1.;d=behavior.x==1.?shells:min(shells,flesh);
     tint=mix(vec3(.46,.40,.29),vec3(.64,.52,.36),v)*(.88+.12*cos(up*13.));
     if(!onShell && behavior.x!=1. && behavior.z<.9){
       vec2 inlet=vec2(q.x,up-height*.40);
       float rim=length(inlet/vec2(.035,.083));
       if(rim<1.35){d=min(d,rim/1.35);float pulse=min(.08,sqrt(max(0.,feedingRate))*.45)*sin(phase*.9);tint=mix(vec3(.045,.055,.04),vec3(.50,.39,.25),smoothstep(.65+pulse,1.35,rim));}
     }
     if(onShell){
       float edge=shells,t=clamp(valve.y/height,0.,1.);
       vec3 shellColor=family==0.?vec3(.33,.27,.16):family==1.?vec3(.10,.17,.23):family==2.?vec3(.64,.50,.32):vec3(.43,.39,.27);
       float relief=family==2.?(.90+.10*cos(atan(valve.x,valve.y)*32.)):
                    family==3.?(.93+.07*sin(t*31.+valve.x*18.)):
                    (.97+.03*sin(t*43.+v*6.));
       tint=shellColor*(.78+.45*v)*relief*(.68+.32*sqrt(max(0.,1.-edge*edge)));
       float sheen=exp(-pow((valve.x/width+.24)*3.,2.))*sin(3.14159*t);
       tint=mix(tint,vec3(.59,.65,.63),.24*sheen);
       float spots=.5+.20*sin(valve.x*22.+v*17.+.6*sin(t*23.))*sin(t*17.+variation*9.)+.16*cos(t*31.+valve.x*19.);
       float coverage=1.-exp(-6.*algae),layer=smoothstep(.68-coverage*.35,.88-coverage*.25,spots);
       vec3 film=mix(vec3(.17,.30,.09),vec3(.38,.52,.18),spots)*(.85+.25*relief);
       tint=mix(tint,film,min(.9,coverage*(.38+.55*layer)));
       float grains=smoothstep(.75,.97,sin(valve.x*145.+v*17.)*sin(t*121.+variation*11.));
       tint+=vec3(.035,.040,.012)*grains*layer*coverage*smoothstep(10.,36.,screenRadius);
       float lip=smoothstep(.87,.97,edge)*(1.-smoothstep(.97,1.,edge));
       tint=mix(tint,mix(vec3(.49,.47,.34),vec3(.66,.62,.45),v),.42*lip*(1.-coverage*.45));
       tint*=1.-.26*smoothstep(.97,1.,edge);
       float seam=exp(-abs(q.x)*110.)*smoothstep(.06,.30,up)*(1.-smoothstep(height*.85,height,up));
       tint*=1.-.65*seam*behavior.z;
       float raised=coverage*layer*.035*sin(t*45.+valve.x*61.);
       tint+=film*raised;
     }
     for(int k=0;k<5;k++){
       float thread=limb(point,hinge-vec2(0.,.08),vec2(-.24+float(k)*.12,.62),.010);
       if(thread<d){d=thread;tint=vec3(.35,.27,.15);}
     }
   }
 }
 float a=1.-smoothstep(1.-max(fwidth(d),.025),1.,d);fragColor=vec4(tint*illumination*a*opacity,a*opacity);
}`;
  },
  "tankLightField" : () => { particle_rendererState.tankLightField = null; },
  "gpuFood" : () => { particle_rendererState.gpuFood = null; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}

export function preparedShaders() { return [ [ foodVertexShader, foodFragmentShader ] ]; }
