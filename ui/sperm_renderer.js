import {TankBatch} from './renderer.js';
import {canvas, ctx} from './dom.js';
import {cameraState} from './camera.js';
import {sceneState} from './state.js';
import {clipObstacles, sedimentGeometry} from './water_view.js';
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
vec4 sampleField(sampler2D f){vec2 p=vec2(uv.x*float(grid.x)-.5,clamp(uv.y*float(grid.y)-.5,0.,float(grid.y-1)));ivec2 i=ivec2(floor(p));vec2 t=fract(p);t=t*t*t*(t*(t*6.-15.)+10.);ivec2 cell=clamp(ivec2(floor(uv*vec2(grid)*2.)),ivec2(0),grid*2-1);vec4 mask=texelFetch(barriers,cell,0)*255.;vec4 w=vec4((1.-t.x)*(1.-t.y),t.x*(1.-t.y),(1.-t.x)*t.y,t.x*t.y)*mask;float sum=dot(w,vec4(1.));if(sum<=0.)return vec4(0.);return (at(f,i)*w.x+at(f,i+ivec2(1,0))*w.y+at(f,i+ivec2(0,1))*w.z+at(f,i+ivec2(1,1))*w.w)/sum;}
void main(){vec4 q=mix(sampleField(beforeField),sampleField(afterField),blend);if(q.a<=0.)discard;vec3 color=q.rgb/q.a;float fade=smoothstep(dissolution,4.*dissolution,q.a);float alpha=(1.-exp(1.3*log(max(.000001,1.-opacityScale))*q.a/max(.0000001,opaque)))*fade;vec2 pos=(uv*(lightGrid-1.)+.5)/lightGrid;float illumination=.4+.6*sqrt(clamp(texture(lightField,pos).r*(1.-(1.-bottomLight)*uv.y),0.,1.));fragColor=vec4(color*illumination*daylight*alpha,alpha);}`;
class SpermRenderer extends TankBatch {
  constructor() {
    super(canvas, ctx, spermVertex, spermFragment, [],
          [
            'viewport', 'offset', 'scaleWorld', 'beforeField', 'afterField', 'lightField', 'grid',
            'lightGrid', 'blend', 'opacityScale', 'opaque', 'dissolution', 'bottomLight',
            'daylight', 'barriers'
          ],
          0);
    this.textures = Array.from({length : 4}, () => this.gl.createTexture());
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
    if (!nx || !ny)
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
      const current = new Float32Array(nx * ny * 4), previous = new Float32Array(nx * ny * 4);
      const put = (out, rows) => {
        for (const row of rows || []) {
          const i = (row[6] - 1) * 4;
          if (i < 0 || i + 3 >= out.length)
            continue;
          const density = row[2];
          out[i] = density * row[3];
          out[i + 1] = density * row[4];
          out[i + 2] = density * row[5];
          out[i + 3] = density;
        }
      };
      put(current, f.gametes);
      if (sceneState.previous?.render_epoch === f.render_epoch &&
          sceneState.previous?.plankton?.columns === nx &&
          sceneState.previous?.plankton?.rows === ny)
        put(previous, sceneState.previous.gametes);
      else
        previous.set(current);
      for (let k = 0; k < 2; k++) {
        gl.activeTexture(gl.TEXTURE0 + k);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[k]);
        for (const a of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
          gl.texParameteri(gl.TEXTURE_2D, a, gl.NEAREST);
        for (const a of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
          gl.texParameteri(gl.TEXTURE_2D, a, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, nx, ny, 0, gl.RGBA, gl.FLOAT,
                      k ? current : previous);
      }
      const light = f.light, values = light?.values?.length ? Float32Array.from(light.values)
                                                            : new Float32Array([ 1 ]);
      this.lx = light?.columns || 1;
      this.ly = light?.rows || 1;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[2]);
      for (const a of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
        gl.texParameteri(gl.TEXTURE_2D, a, gl.NEAREST);
      for (const a of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
        gl.texParameteri(gl.TEXTURE_2D, a, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.lx, this.ly, 0, gl.RED, gl.FLOAT, values);
      const geometry = sedimentGeometry(f, nx, ny, 2);
      if (geometry !== this.geometry) {
        this.geometry = geometry;
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[3]);
        for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
          gl.texParameteri(gl.TEXTURE_2D, key, gl.NEAREST);
        for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
          gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nx * 2, ny * 2, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                      geometry.mask);
      }
    }
    for (let k = 0; k < 4; k++) {
      gl.activeTexture(gl.TEXTURE0 + k);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[k]);
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniforms.viewport, cameraState.viewportWidth, cameraState.viewportHeight);
    gl.uniform2f(this.uniforms.offset, c.ox, c.oy);
    gl.uniform2f(this.uniforms.scaleWorld, f.width * c.scale, f.height * c.scale);
    gl.uniform2i(this.uniforms.grid, nx, ny);
    gl.uniform2f(this.uniforms.lightGrid, this.lx, this.ly);
    gl.uniform1i(this.uniforms.beforeField, 0);
    gl.uniform1i(this.uniforms.afterField, 1);
    gl.uniform1i(this.uniforms.lightField, 2);
    gl.uniform1i(this.uniforms.barriers, 3);
    gl.uniform1f(this.uniforms.blend, blend);
    gl.uniform1f(this.uniforms.opacityScale,
                 Math.max(0, Math.min(.999999, f.parameters?.ink_density ?? .96)));
    gl.uniform1f(this.uniforms.dissolution, f.parameters?.sperm_dilution ?? .0015);
    gl.uniform1f(this.uniforms.opaque, f.parameters?.sperm_opaque ?? .012);
    gl.uniform1f(this.uniforms.bottomLight, f.light?.bottom ?? 1);
    gl.uniform1f(this.uniforms.daylight, f.daylight ?? 1);
    this.submit(gl.TRIANGLES, 6);
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
