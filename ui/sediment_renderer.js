import {PLANT} from './schema.js';
import {bedColor, algaeDisplay} from './plant_geometry.js';
import {cameraState} from './camera.js';
import {canvas, ctx} from './dom.js';
import {TankBatch} from './renderer.js';
import {sceneState} from './state.js';
import {displayLight} from './water_view.js';
export const sediment_rendererState = {};
// Hovering deposited sediment makes it see-through within this screen radius.
export const SEDIMENT_PEEK_RADIUS = 128;
export let sedimentVertexShader;

export let sedimentFragmentShader;

export class SedimentRenderer extends TankBatch {
  constructor(crustaceans = false) {
    super(canvas, ctx, sedimentVertexShader, sedimentFragmentShader, [ 4, 4, 4, 4 ],
          [ 'viewport', 'offset', 'scale', 'step', 'pixelRatio', 'crustaceans' ], 0);
    this.crustaceans = crustaceans;
    this.data = null;
  }
  paint(c, step, grains) {
    const gl = this.gl;
    if (gl.isContextLost())
      return false;
    if (!grains.length)
      return true;
    ctx.beginExternal();
    gl.bindVertexArray(this.vao);
    if (this.data !== grains) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      const size = grains.length * 16;
      if (!this.instances || this.instances.length < size) {
        this.instances = new Float32Array(2 ** Math.ceil(Math.log2(Math.max(64, size))));
        gl.bufferData(gl.ARRAY_BUFFER, this.instances.byteLength, gl.DYNAMIC_DRAW);
      }
      let at = 0;
      for (const grain of grains) {
        this.instances.set(grain, at);
        for (let k = 0; k < 4; k++)
          this.instances[at + 12 + k] = grain.intake?.[k] || 0;
        at += 16;
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instances.subarray(0, size));
      this.data = grains;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.viewport, cameraState.viewportWidth, cameraState.viewportHeight);
    gl.uniform2f(this.uniforms.offset, c.ox, c.oy);
    gl.uniform1f(this.uniforms.scale, c.scale);
    gl.uniform1f(this.uniforms.step, step);
    gl.uniform1i(this.uniforms.crustaceans, this.crustaceans ? 1 : 0);
    gl.uniform1f(this.uniforms.pixelRatio, this.canvas.width / cameraState.viewportWidth);
    this.submit(gl.POINTS, grains.length);
    if (gl.isContextLost())
      return false;
    ctx.endExternal();
    return true;
  }
}

export function paintGpuSediment(f, c, step, grains) {
  if (!grains.length)
    return true;
  sediment_rendererState.gpuSediment ??= new SedimentRenderer();
  return sediment_rendererState.gpuSediment.paint(c, step, grains);
}

export let bedVertex;

export let bedFragment;

class SurfaceRenderer extends TankBatch {
  constructor() {
    super(canvas, ctx, bedVertex, bedFragment, [ 4, 4, 4, 2, 3 ],
          [ 'viewport', 'offset', 'scale', 'peek', 'blend' ]);
  }
  prepare(f) {
    if (this.revision === sceneState.frameRevision && this.frame === f)
      return;
    this.revision = sceneState.frameRevision;
    this.frame = f;
    const algae = [], bed = [],
          priorPlants = new Map((sceneState.previous?.plants || []).map(p => [p[0], p]));
    for (const s of f.plants || []) {
      if (s[PLANT.root]?.[2])
        continue;
      const left = s[PLANT.sediment_left] ?? 4 * s[11] / Math.max(1, s[12]),
            right = s[PLANT.sediment_right] ?? left,
            light = displayLight(f, (s[1] + s[3]) / 2, (s[2] + s[4]) / 2),
            leftLight = displayLight(f, s[1] + s[5] * left, s[2] + s[6] * left),
            rightLight = displayLight(f, s[3] + s[5] * right, s[4] + s[6] * right),
            record = (depths, color, kind, rightColor = color) => {
              const a = kind ? 0 : (s[PLANT.algae_start] ?? 0),
                    b = kind ? 1 : (s[PLANT.algae_end] ?? 1);
              return [
                s[1] + a * (s[3] - s[1]), s[2] + a * (s[4] - s[2]), s[1] + b * (s[3] - s[1]),
                s[2] + b * (s[4] - s[2]), s[5], s[6], ...depths, ...color.map(v => v * leftLight),
                kind,
                kind ? (priorPlants.get(s[0])?.[PLANT.sediment_left] ?? depths[0]) : depths[0],
                kind ? (priorPlants.get(s[0])?.[PLANT.sediment_right] ?? depths[1]) : depths[1],
                ...rightColor.map(v => v * rightLight)
              ];
            };
      if (left > 0 || right > 0)
        bed.push(...record([ left, right ], bedColor(f, s, 0), 1, bedColor(f, s, 1)));
      else if (s[7] > 0 && (s[PLANT.algae_end] ?? 1) > (s[PLANT.algae_start] ?? 0)) {
        const {fill, thickness} = algaeDisplay(s, f);
        algae.push(...record([ thickness, thickness ],
                             [ .13 + .08 * light, .23 + .23 * fill, .10 + .06 * (1 - light) ], 0));
      }
    }
    this.algae = algae.length / 17;
    this.count = bed.length / 17;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(algae.concat(bed)), gl.DYNAMIC_DRAW);
  }
  paint(f, c, shifts, pointer, foreground, blend) {
    if (this.gl.isContextLost())
      return false;
    this.prepare(f);
    const count = foreground ? this.count : this.algae;
    if (!count)
      return true;
    const gl = this.gl;
    ctx.beginExternal();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    this.attributes(foreground ? this.algae : 0);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.viewport, cameraState.viewportWidth, cameraState.viewportHeight);
    gl.uniform1f(this.uniforms.scale, c.scale);
    gl.uniform1f(this.uniforms.blend, blend);
    gl.uniform3f(this.uniforms.peek, pointer?.x || 0, pointer?.y || 0,
                 pointer ? SEDIMENT_PEEK_RADIUS : 0);
    for (const shift of shifts) {
      gl.uniform2f(this.uniforms.offset, c.ox + shift * c.scale, c.oy);
      this.submit(gl.TRIANGLES, 6, count);
    }
    ctx.endExternal();
    return true;
  }
}

export function paintGpuSurface(f, c, shifts, pointer = null, foreground = false, blend = 1) {
  sediment_rendererState.gpuSurface ??= new SurfaceRenderer();
  return sediment_rendererState.gpuSurface.paint(f, c, shifts, pointer, foreground, blend);
}

export let sedimentCloudVertex;

export let sedimentCloudFragment;

export class SedimentCloudRenderer extends TankBatch {
  constructor(fragment = sedimentCloudFragment, tint = [ 145 / 255, 128 / 255, 94 / 255 ],
              density = 64, softness = 0) {
    super(canvas, ctx, sedimentCloudVertex, fragment, [], [
      'viewport', 'offset', 'size', 'grid', 'factor', 'amounts', 'barriers', 'tint', 'softness'
    ]);
    const gl = this.gl;
    this.textures = [ gl.createTexture(), gl.createTexture() ];
    this.tint = tint;
    this.density = density;
    this.softness = softness;
  }
  beginOutput(width, height) {
    const gl = this.gl;
    ctx.beginExternal();
    this.outputTexture ??= gl.createTexture();
    this.framebuffer ??= gl.createFramebuffer();
    gl.activeTexture(gl.TEXTURE0 + 2);
    gl.bindTexture(gl.TEXTURE_2D, this.outputTexture);
    if (this.image?.width !== width || this.image?.height !== height) {
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
        gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
        gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.image =
          {width, height, tankTexture : {texture : this.outputTexture, width, height, flip : true}};
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outputTexture,
                            0);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
  }
  endOutput() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.BLEND);
    ctx.endExternal();
  }
  uploadScalar(index, width, height, values) {
    const gl = this.gl, data = values instanceof Float32Array ? values : new Float32Array(values),
          sizes = this.scalarSizes ??= new Map(), key = width + ':' + height;
    if (sizes.get(index) === key)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.FLOAT, data);
    else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, data);
      sizes.set(index, key);
    }
  }
  drawOutput(f, c) { ctx.drawImage(this.image, c.ox, c.oy, f.width * c.scale, f.height * c.scale); }
  paint(f, c, geometry) {
    const gl = this.gl, s = f.sediment;
    if (this.revision === sceneState.frameRevision && this.geometry === geometry) {
      this.drawOutput(f, c);
      return;
    }
    const width = s.columns * 2, height = s.rows * 2;
    this.beginOutput(width, height);
    for (let k = 0; k < 2; k++) {
      gl.activeTexture(gl.TEXTURE0 + k);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[k]);
      if (k === 0 && this.revision !== sceneState.frameRevision ||
          k === 1 && this.geometry !== geometry) {
        for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
          gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
        for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
          gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
        if (k === 0)
          this.uploadScalar(0, s.columns, s.rows, s.amounts);
        else
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, s.columns * 2, s.rows * 2, 0, gl.RGBA,
                        gl.UNSIGNED_BYTE, geometry.mask);
      }
    }
    this.revision = sceneState.frameRevision;
    this.geometry = geometry;
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.viewport, width, height);
    gl.uniform2f(this.uniforms.offset, 0, 0);
    gl.uniform2f(this.uniforms.size, width, height);
    gl.uniform2f(this.uniforms.grid, s.columns, s.rows);
    gl.uniform1f(this.uniforms.factor, this.density * s.columns * s.rows / (f.width * f.height));
    gl.uniform1i(this.uniforms.amounts, 0);
    gl.uniform1i(this.uniforms.barriers, 1);
    gl.uniform3f(this.uniforms.tint, ...this.tint);
    gl.uniform1f(this.uniforms.softness, this.softness);
    this.submit(gl.TRIANGLES, 6);
    this.endOutput();
    this.drawOutput(f, c);
  }
}

export function paintGpuSedimentCloud(f, c, geometry) {
  sediment_rendererState.gpuSedimentCloud ??= new SedimentCloudRenderer();
  sediment_rendererState.gpuSedimentCloud.paint(f, c, geometry);
}

export let cloudLightFragment;

class CloudLightRenderer extends SedimentCloudRenderer {
  constructor() {
    super(cloudLightFragment);
    this.uniforms.daylight = this.gl.getUniformLocation(this.program, 'daylight');
  }
  paint(f, c) {
    const gl = this.gl, l = f.light;
    if (this.revision === sceneState.frameRevision) {
      this.drawOutput(f, c);
      return;
    }
    this.beginOutput(l.columns, l.rows);
    const clearKey = [ f.render_epoch, l.clear_asset, l.columns, l.rows ].join(':');
    for (let k = 0; k < 2; k++) {
      gl.activeTexture(gl.TEXTURE0 + k);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[k]);
      if (k === 0 && this.revision !== sceneState.frameRevision ||
          k === 1 && this.clearKey !== clearKey) {
        for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
          gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
        for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
          gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
        this.uploadScalar(k, l.columns, l.rows, k ? l.clear_values : l.values);
      }
    }
    this.revision = sceneState.frameRevision;
    this.clearKey = clearKey;
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.viewport, l.columns, l.rows);
    gl.uniform2f(this.uniforms.offset, 0, 0);
    gl.uniform2f(this.uniforms.size, l.columns, l.rows);
    gl.uniform2f(this.uniforms.grid, l.columns, l.rows);
    gl.uniform1f(this.uniforms.factor, l.bottom);
    gl.uniform1f(this.uniforms.daylight, f.daylight ?? 1);
    gl.uniform1i(this.uniforms.amounts, 0);
    gl.uniform1i(this.uniforms.barriers, 1);
    gl.uniform3f(this.uniforms.tint, ...this.tint);
    this.submit(gl.TRIANGLES, 6);
    this.endOutput();
    this.drawOutput(f, c);
  }
}

export function paintGpuCloudLight(f, c) {
  sediment_rendererState.gpuCloudLight ??= new CloudLightRenderer();
  sediment_rendererState.gpuCloudLight.paint(f, c);
}

export function updateSedimentRendererState(patch) {
  Object.assign(sediment_rendererState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "sedimentVertexShader" : () => {
    // Sediment detail uses one point draw. The optical field is drawn by a separate GPU batch.
    sedimentVertexShader = `#version 300 es
precision highp float;
layout(location=0) in vec4 cell;
layout(location=1) in vec4 motion;
layout(location=2) in vec4 seed;
layout(location=3) in vec4 intake;
uniform vec2 viewport;
uniform vec2 offset;
uniform float scale;
uniform float step;
uniform float pixelRatio;
uniform int crustaceans;
out float opacity;
out vec2 heading;
flat out int animal;
vec2 jump(float cycle){
 return 2.*fract(sin(vec2(cycle+seed.w*117.,cycle*.73+seed.w*311.))*vec2(43758.5453,24634.6345))-1.;
}
void main(){
 animal=crustaceans;heading=vec2(1.,0.);
 float clock=intake.w>0.?min(step,intake.z):step;
 vec2 drift=motion.xy*clock;
 if(crustaceans!=0){
   float t=clock*(.12+.10*seed.w)+seed.w*100.,cycle=floor(t);
   vec2 before=jump(cycle-1.),after=jump(cycle);
   drift=motion.xy*(clock-seed.z)+(1.+2.*seed.w)*mix(before,after,smoothstep(0.,.16,fract(t)));
   vec2 direction=after-before+motion.xy*.3;
   heading=direction/max(.001,length(direction));
 }
 vec2 p=crustaceans!=0?cell.xy+drift:cell.xy+fract(seed.xy+drift/cell.zw)*cell.zw;
 float caught=intake.w>0.?clamp((step-intake.z)/intake.w,0.,1.):0.;
 if(intake.w>0.){vec2 direction=intake.xy-p;heading=direction/max(.001,length(direction));p=mix(p,intake.xy,caught*caught);}
 vec2 screen=p*scale+offset;
 gl_Position=vec4(screen.x/viewport.x*2.0-1.0,1.0-screen.y/viewport.y*2.0,0.0,1.0);
 gl_PointSize=max(1.0,2.0*motion.z*scale*pixelRatio)*(1.-.6*smoothstep(.65,1.,caught));
 opacity=(.35+.35*motion.w)*min(1.0,max(crustaceans!=0?.20:0.,pow(2.0*motion.z*scale,2.0)));
 if(crustaceans!=0)opacity*=smoothstep(0.,16.,step-cell.w);
 opacity*=1.-smoothstep(.85,1.,caught);
}`;
  },
  "sedimentFragmentShader" : () => {
    sedimentFragmentShader = `#version 300 es
precision highp float;
in float opacity;
in vec2 heading;
flat in int animal;
out vec4 fragColor;
void main(){
 vec2 p=2.*gl_PointCoord-1.;
 vec3 color=vec3(.706,.639,.510);float d=length(p);
 if(animal!=0){
   p=mat2(heading.x,-heading.y,heading.y,heading.x)*p;
   float body=length((p-vec2(-.1,0.))*vec2(2.2,3.4));
   float antenna=max(abs(abs(p.y)-(.24+.65*(p.x-.2)))/.075,abs(p.x-.48)/.45);
   float tail=max(abs(abs(p.y)-.35*(-p.x-.25))/.085,abs(p.x+.55)/.35);
   d=min(body,min(antenna,tail));color=vec3(.68,.78,.64);
   if(length(p-vec2(.17,0.))<.10)color=vec3(.19,.25,.14);
 }
 float a=opacity*(1.-smoothstep(.80,1.,d));fragColor=vec4(color*a,a);
}`;
  },
  "gpuSediment" : () => { sediment_rendererState.gpuSediment = null; },
  "bedVertex" : () => {
    // Deposited sand is world geometry, independent of screen-sized cached layers.
    bedVertex = `#version 300 es
precision highp float;
layout(location=0) in vec4 endpoints;
layout(location=1) in vec4 depths;
layout(location=2) in vec4 tint;
layout(location=3) in vec2 beforeDepth;
layout(location=4) in vec3 rightTint;
uniform float blend;
uniform vec2 viewport,offset;
uniform float scale;
out vec2 world,screen,cover,base;
flat out vec2 heights;
out vec3 color;
flat out float material;
void main(){vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(1,1),vec2(0,0),vec2(1,1),vec2(0,1));vec2 q=corners[gl_VertexID];base=mix(endpoints.xy,endpoints.zw,q.x);heights=mix(beforeDepth,depths.zw,blend);world=base+depths.xy*(tint.a>.5?max(heights.x,heights.y):mix(heights.x,heights.y,q.x))*q.y;screen=world*scale+offset;color=mix(tint.rgb,rightTint,q.x);material=tint.a;cover=q;gl_Position=vec4(screen.x/viewport.x*2.-1.,1.-screen.y/viewport.y*2.,0,1);}`;
  },
  "bedFragment" : () => {
    bedFragment = `#version 300 es
precision highp float;
in vec2 world,screen,cover,base;
flat in vec2 heights;
in vec3 color;
flat in float material;
uniform vec3 peek;
uniform float scale;
out vec4 fragment;
void main(){float alpha=1.;if(material>.5){float high=max(heights.x,heights.y),edge=mix(heights.x,heights.y,smoothstep(0.,1.,cover.x))-cover.y*high;alpha=smoothstep(-max(.01,fwidth(edge)),0.,edge);}if(material<.5){float noise=fract(sin((base.x*.6+base.y*.21)*12.9898+78.233)*43758.5453);float rim=.68+.22*noise+.06*sin(base.x*.7+base.y*.5);alpha=(1.-smoothstep(rim-.14,rim+.05,cover.y))*(.8+.2*smoothstep(0.,.1,min(cover.x,1.-cover.x)));}if(material>.5&&peek.z>0.){float d=length(screen-peek.xy)/peek.z;alpha*=1.-.84*(1.-smoothstep(.25,1.,d));}float grain=fract(sin(dot(floor(world*12.),vec2(12.9898,78.233)))*43758.5453);vec3 c=color*(material<.5?.72+.18*sin(base.x*.16+base.y*.27):(.94+.12*grain*min(1.,scale)));fragment=vec4(c*alpha,alpha);}`;
  },
  "gpuSurface" : () => { sediment_rendererState.gpuSurface = null; },
  "sedimentCloudVertex" : () => {
    // The optical sediment field is sampled on the GPU; particles remain a separate detail batch.
    sedimentCloudVertex = `#version 300 es
precision highp float;
uniform vec2 viewport,offset,size;
out vec2 uv;
void main(){vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(1,1),vec2(0,0),vec2(1,1),vec2(0,1));uv=corners[gl_VertexID];vec2 p=offset+uv*size;gl_Position=vec4(p.x/viewport.x*2.-1.,1.-p.y/viewport.y*2.,0,1);}`;
  },
  "sedimentCloudFragment" : () => {
    sedimentCloudFragment = `#version 300 es
precision highp float;
uniform highp sampler2D amounts;
uniform sampler2D barriers;
uniform vec2 grid;
uniform float factor;
uniform float softness;
uniform vec3 tint;
in vec2 uv;
out vec4 fragment;
float densityAt(vec2 at){ivec2 n=ivec2(grid);vec2 q=vec2(at.x*grid.x-.5,clamp(at.y*grid.y-.5,0.,grid.y-1.)),w=fract(q);ivec2 a=ivec2(floor(q));int left=(a.x%n.x+n.x)%n.x,right=(left+1)%n.x,above=a.y,below=min(above+1,n.y-1);ivec2 cell=clamp(ivec2(floor(at*grid*2.)),ivec2(0),n*2-1);vec4 mask=texelFetch(barriers,cell,0)*255.;float top=mix(texelFetch(amounts,ivec2(left,above),0).r*mask.r,texelFetch(amounts,ivec2(right,above),0).r*mask.g,w.x),bottom=mix(texelFetch(amounts,ivec2(left,below),0).r*mask.b,texelFetch(amounts,ivec2(right,below),0).r*mask.a,w.x);return mix(top,bottom,w.y);}
void main(){
 float density=densityAt(uv);
 if(softness>0. && dot(texture(barriers,uv),vec4(1))>.001){vec2 d=softness/grid;density=.5*density+.125*(densityAt(uv+vec2(d.x,0))+densityAt(uv-vec2(d.x,0))+densityAt(uv+vec2(0,d.y))+densityAt(uv-vec2(0,d.y)));}
 float alpha=1.-exp(-.9*factor*density);fragment=vec4(tint*alpha,alpha);
}`;
  },
  "gpuSedimentCloud" : () => { sediment_rendererState.gpuSedimentCloud = null; },
  "cloudLightFragment" : () => {
    cloudLightFragment = `#version 300 es
precision highp float;
uniform highp sampler2D amounts,barriers;
uniform vec2 grid;
uniform float factor, daylight;
in vec2 uv;
out vec4 fragment;
float alphaAt(ivec2 p){float depth=1.-(1.-factor)*float(p.y)/max(1.,grid.y-1.);float a=.4+.6*sqrt(clamp(daylight*depth*texelFetch(amounts,p,0).r,0.,1.)),b=.4+.6*sqrt(clamp(depth*texelFetch(barriers,p,0).r,0.,1.));return floor(255.*max(0.,1.-a/b)+.5)/255.;}
void main(){vec2 at=clamp(uv*grid-.5,vec2(0.),grid-1.);ivec2 p=ivec2(floor(at)),hi=ivec2(grid)-1;vec2 f=fract(at);float alpha=mix(mix(alphaAt(p),alphaAt(min(p+ivec2(1,0),hi)),f.x),mix(alphaAt(min(p+ivec2(0,1),hi)),alphaAt(min(p+ivec2(1),hi)),f.x),f.y);fragment=vec4(0,0,0,alpha);}`;
  },
  "gpuCloudLight" : () => { sediment_rendererState.gpuCloudLight = null; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}

export function preparedShaders() {
  return [
    [ sedimentVertexShader, sedimentFragmentShader ], [ bedVertex, bedFragment ],
    [ sedimentCloudVertex, sedimentCloudFragment ], [ sedimentCloudVertex, cloudLightFragment ]
  ];
}
