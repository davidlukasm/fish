import {GAMETE} from './schema.js';
import {CHANNEL_MAX} from './units.js';
import {clampedTexture, glsl, QUAD_VERTICES, TankBatch} from './renderer.js';
import {canvas, ctx} from './dom.js';
import {cameraState} from './camera.js';
import {sceneState} from './state.js';
import {clipObstacles, sedimentGeometry} from './water_view.js';
import {OBSERVER_LIGHT, SEDIMENT_MASK} from './water_display.js';
// Sperm clouds: a field of RGBA cells (colour times density, density); textures before and
// after the frame, the light field and the water mask.
const RGBA = 4, UNIT = Object.freeze({before : 0, after : 1, light : 2, barriers : 3});
// Ink opacity stays below MAX_OPACITY.
const MAX_OPACITY = .999999;
const spermVertex = `#version 300 es
precision highp float;
uniform vec2 viewport,offset,scaleWorld;
out vec2 uv;
void main(){vec2 p[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(1,1),vec2(0,0),vec2(1,1),vec2(0,1));uv=p[gl_VertexID];vec2 q=offset+uv*scaleWorld;gl_Position=vec4(q.x/viewport.x*2.-1.,1.-q.y/viewport.y*2.,0,1);}`;
const spermFragment = `#version 300 es
precision highp float;
uniform highp sampler2D beforeField,afterField,lightField,barriers;
uniform ivec2 grid;
uniform vec2 lightGrid;
uniform float blend,opacityScale,opaque,dissolution,bottomLight,daylight;
in vec2 uv;
out vec4 fragColor;
vec4 at(sampler2D f,ivec2 p){p.x=(p.x%grid.x+grid.x)%grid.x;p.y=clamp(p.y,0,grid.y-1);return texelFetch(f,p,0);}
vec4 sampleField(sampler2D f){vec2 p=vec2(uv.x*float(grid.x)-.5,clamp(uv.y*float(grid.y)-.5,0.,float(grid.y-1)));ivec2 i=ivec2(floor(p));vec2 t=fract(p);t=t*t*t*(t*(t*6.-15.)+10.);ivec2 cell=clamp(ivec2(floor(uv*vec2(grid)*${
    glsl(SEDIMENT_MASK.resolution)})),ivec2(0),grid*${
    SEDIMENT_MASK.resolution}-1);vec4 mask=texelFetch(barriers,cell,0)*${
    glsl(
        CHANNEL_MAX)};vec4 w=vec4((1.-t.x)*(1.-t.y),t.x*(1.-t.y),(1.-t.x)*t.y,t.x*t.y)*mask;float sum=dot(w,vec4(1.));if(sum<=0.)return vec4(0.);return (at(f,i)*w.x+at(f,i+ivec2(1,0))*w.y+at(f,i+ivec2(0,1))*w.z+at(f,i+ivec2(1,1))*w.w)/sum;}
void main(){vec4 q=mix(sampleField(beforeField),sampleField(afterField),blend);if(q.a<=0.)discard;vec3 color=q.rgb/q.a;float fade=smoothstep(dissolution,4.*dissolution,q.a);float seen=q.a/(1.+q.a/(3.*max(.0000001,opaque)));float alpha=.8*(1.-exp(1.3*log(max(.000001,1.-opacityScale))*seen/max(.0000001,opaque)))*fade;vec2 pos=(uv*(lightGrid-1.)+.5)/lightGrid;float illumination=${
    glsl(OBSERVER_LIGHT)}+${
    glsl(
        1 -
        OBSERVER_LIGHT)}*sqrt(clamp(texture(lightField,pos).r*(1.-(1.-bottomLight)*uv.y),0.,1.));fragColor=vec4(color*illumination*daylight*alpha,alpha);}`;
class SpermRenderer extends TankBatch {
  constructor() {
    super(canvas, ctx, spermVertex, spermFragment, [],
          [
            'viewport', 'offset', 'scaleWorld', 'beforeField', 'afterField', 'lightField', 'grid',
            'lightGrid', 'blend', 'opacityScale', 'opaque', 'dissolution', 'bottomLight',
            'daylight', 'barriers'
          ],
          0);
    this.textures = Object.values(UNIT).map(() => this.gl.createTexture());
  }
  dispose() {
    const gl = this.gl;
    for (const texture of this.textures)
      gl.deleteTexture(texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
  paint(f, c, blend) {
    const p = f.plankton, nx = p?.columns, ny = p?.rows;
    // Sperm needs the tank parameters, which come with the statistics.
    if (!nx || !ny || !f.parameters)
      return true;
    const gl = this.gl;
    if (gl.isContextLost())
      return false;
    ctx.beginExternal();
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.program);
    if (this.frame !== f || this.revision !== sceneState.frameRevision) {
      this.frame = f;
      this.revision = sceneState.frameRevision;
      const current = new Float32Array(nx * ny * RGBA), previous = new Float32Array(nx * ny * RGBA);
      // A gamete row names its cell by id, counted from one.
      const put = (out, rows) => {
        for (const row of rows || []) {
          const i = (row[GAMETE.id] - 1) * RGBA, density = row[GAMETE.density];
          if (i < 0 || i + RGBA > out.length)
            continue;
          out.set(
              [
                density * row[GAMETE.red], density * row[GAMETE.green], density * row[GAMETE.blue],
                density
              ],
              i);
        }
      };
      put(current, f.gametes);
      if (sceneState.previous?.render_epoch === f.render_epoch &&
          sceneState.previous?.plankton?.columns === nx &&
          sceneState.previous?.plankton?.rows === ny)
        put(previous, sceneState.previous.gametes);
      else
        previous.set(current);
      for (const k of [UNIT.before, UNIT.after]) {
        gl.activeTexture(gl.TEXTURE0 + k);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[k]);
        clampedTexture(gl, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, nx, ny, 0, gl.RGBA, gl.FLOAT,
                      k === UNIT.after ? current : previous);
      }
      const light = f.light, values = light?.values?.length ? Float32Array.from(light.values)
                                                            : new Float32Array([ 1 ]);
      this.lx = light?.columns || 1;
      this.ly = light?.rows || 1;
      gl.activeTexture(gl.TEXTURE0 + UNIT.light);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[UNIT.light]);
      clampedTexture(gl, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.lx, this.ly, 0, gl.RED, gl.FLOAT, values);
      const resolution = SEDIMENT_MASK.resolution,
            geometry = sedimentGeometry(f, nx, ny, resolution);
      if (geometry !== this.geometry) {
        this.geometry = geometry;
        gl.activeTexture(gl.TEXTURE0 + UNIT.barriers);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[UNIT.barriers]);
        clampedTexture(gl, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nx * resolution, ny * resolution, 0, gl.RGBA,
                      gl.UNSIGNED_BYTE, geometry.mask);
      }
    }
    for (const k of Object.values(UNIT)) {
      gl.activeTexture(gl.TEXTURE0 + k);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[k]);
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniforms.viewport, cameraState.viewportWidth, cameraState.viewportHeight);
    gl.uniform2f(this.uniforms.offset, c.ox, c.oy);
    gl.uniform2f(this.uniforms.scaleWorld, f.width * c.scale, f.height * c.scale);
    gl.uniform2i(this.uniforms.grid, nx, ny);
    gl.uniform2f(this.uniforms.lightGrid, this.lx, this.ly);
    gl.uniform1i(this.uniforms.beforeField, UNIT.before);
    gl.uniform1i(this.uniforms.afterField, UNIT.after);
    gl.uniform1i(this.uniforms.lightField, UNIT.light);
    gl.uniform1i(this.uniforms.barriers, UNIT.barriers);
    gl.uniform1f(this.uniforms.blend, blend);
    gl.uniform1f(this.uniforms.opacityScale,
                 Math.max(0, Math.min(MAX_OPACITY, f.parameters.ink_density)));
    gl.uniform1f(this.uniforms.dissolution, f.parameters.sperm_dilution);
    gl.uniform1f(this.uniforms.opaque, f.parameters.sperm_opaque);
    gl.uniform1f(this.uniforms.bottomLight, f.light?.bottom ?? 1);
    gl.uniform1f(this.uniforms.daylight, f.daylight ?? 1);
    this.submit(gl.TRIANGLES, QUAD_VERTICES);
    ctx.endExternal();
    return !gl.isContextLost();
  }
}
export const spermRendererState = {};
export function resetSpermRenderer() {
  spermRendererState.renderer?.dispose();
  spermRendererState.renderer = null;
}
export function paintSpermField(f, c, blend) {
  if (!f.gametes?.length && !sceneState.previous?.gametes?.length)
    return true;
  const renderer = spermRendererState.renderer ??= new SpermRenderer();
  ctx.save();
  clipObstacles(f, c, ctx,
                {x : 0, y : 0, w : cameraState.viewportWidth, h : cameraState.viewportHeight});
  const result = renderer.paint(f, c, blend);
  ctx.restore();
  return result;
}

const initializers = {
  renderer : () => { resetSpermRenderer(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}

export function preparedShaders() { return [ [ spermVertex, spermFragment ] ]; }
