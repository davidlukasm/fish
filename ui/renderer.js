import {t} from './strings.js';
import {TOLERANCE} from './schema.js';
import {ALPHA, CHANNEL_MAX, cssColor, hexColor, KIB, PIXEL_BYTES} from './units.js';
export const rendererState = {};
export let tankVertexSource;

export let tankFragmentSource;

export let tankIdentity;

export let tankPoint;

const tankPrograms = new WeakMap();
const TANK_MASK_COLOR = [ 0, 0, 0, 0 ];
// Paint modes of the vector shader and the primitive shapes of its quads.
const PAINT = Object.freeze({solid : 0, image : 1, linear : 2, radial : 3, dash : 4});
const SHAPE = Object.freeze({none : 0, disc : 1, ring : 2});
// Vertex attributes of the vector shader in location order, with their float counts.
const VERTEX_ATTRIBUTES = [ [ 'position', 2 ], [ 'uv', 2 ], [ 'rgba', 4 ], [ 'primitive', 2 ] ];
const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT,
      VERTEX_FLOATS = attributeLayout(VERTEX_ATTRIBUTES).floats;
// The stencil keeps the clip depth in its low bits and marks paths in its top bit.
const STENCIL_PATH = 128;
const STENCIL = Object.freeze({
  path : STENCIL_PATH,
  clip : STENCIL_PATH - 1,
  all : 2 * STENCIL_PATH - 1,
  max_depth : STENCIL_PATH - 2
});
// Curves split until their control points lie within FLATTEN.error of the chord (at most
// MAX_DEPTH halvings); arcs take ARC_MIN to ARC_MAX segments, more for larger radii; round caps
// at least CAP_MIN. Strokes up to THIN pixels wide are drawn as plain segment quads; miters reach
// at most MITER times the half width. A circle stroke within RING of round is drawn as one ring.
const FLATTEN = Object.freeze({
  max_depth : 8,
  error : .4,
  arc_min : 2,
  arc_max : 192,
  arc_error : .65,
  cap_min : 4,
  thin : 2,
  miter : 2,
  min_miter : .01,
  ring : .05
});
// Vertex buffers start with VERTICES floats; textures beyond TEXTURE_LIMIT bytes are released,
// oldest first, down to TEXTURE_TARGET; gradient ramps are RAMP texels wide, and at most RAMPS
// ramps and LABELS text labels stay cached. At most FRAMES frames are in flight.
const MIB = KIB * KIB;
const RENDER = Object.freeze({
  vertices : 32768,
  texture_limit : 128 * MIB,
  texture_target : 96 * MIB,
  ramp : 256,
  ramps : 256,
  labels : 512,
  frames : 2,
  compile_poll_ms : 8
});
// Text labels: the font size when the font names none, padding and line height per font size.
const LABEL = Object.freeze({font_size : 10, pad : 3, line : 1.6, baseline : 1.2});
// The tank's water behind everything.
const CLEAR_COLOR = [...hexColor('#091a21'), 1 ];
function cachedTankProgram(gl, vertex, fragment) {
  let cache = tankPrograms.get(gl);
  if (!cache) {
    cache = new Map();
    tankPrograms.set(gl, cache);
  }
  return {cache, key : vertex + '\n' + fragment};
}
function linkTankProgram(gl, vertex, fragment) {
  const program = gl.createProgram(), shaders = [];
  try {
    if (!program)
      throw Error('WebGL program allocation failed');
    for (const [type, source] of [[ gl.VERTEX_SHADER, vertex ], [ gl.FRAGMENT_SHADER, fragment ]]) {
      const shader = gl.createShader(type);
      if (!shader)
        throw Error('WebGL shader allocation failed');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    return {program, shaders};
  } catch (error) {
    gl.deleteProgram(program);
    for (const shader of shaders)
      gl.deleteShader(shader);
    throw error;
  }
}
function finishTankProgram(gl, linked, cache, key) {
  const {program, shaders} = linked;
  try {
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const details = shaders.map(shader => gl.getShaderInfoLog(shader)).filter(Boolean).join('\n');
      throw Error(details || gl.getProgramInfoLog(program));
    }
    cache.set(key, program);
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders)
      gl.deleteShader(shader);
  }
}
// A number as a GLSL float literal.
export function glsl(value) {
  const text = String(value);
  return /[.e]/.test(text) ? text : text + '.0';
}
// Two triangles make one quad or ribbon segment.
export const QUAD_VERTICES = 6;
// Float offsets of vertex attributes [name, size] laid out in order, and their total.
export function attributeLayout(attributes) {
  const at = {};
  let floats = 0;
  for (const [name, size] of attributes) {
    at[name] = floats;
    floats += size;
  }
  return {at : Object.freeze(at), floats};
}
// GLSL inputs for vertex attributes [name, size], at locations from `first` on.
export function attributeInputs(attributes, first = 0) {
  return attributes
      .map(([ name, size ], i) =>
               `layout(location=${first + i}) in ${size > 1 ? 'vec' + size : 'float'} ${name};`)
      .join('\n');
}
export function tankProgram(gl, vertex, fragment) {
  const {cache, key} = cachedTankProgram(gl, vertex, fragment);
  return cache.get(key) || finishTankProgram(gl, linkTankProgram(gl, vertex, fragment), cache, key);
}
export async function prepareTankProgram(gl, vertex, fragment) {
  const {cache, key} = cachedTankProgram(gl, vertex, fragment);
  if (cache.has(key))
    return cache.get(key);
  const extension = gl.getExtension('KHR_parallel_shader_compile'),
        linked = linkTankProgram(gl, vertex, fragment);
  // Status queries otherwise force the driver to finish compiling on the UI thread.
  if (extension) {
    while (!gl.isContextLost() &&
           !gl.getProgramParameter(linked.program, extension.COMPLETION_STATUS_KHR))
      await new Promise(resolve => setTimeout(resolve, RENDER.compile_poll_ms));
  } else {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (gl.isContextLost()) {
    gl.deleteProgram(linked.program);
    for (const shader of linked.shaders)
      gl.deleteShader(shader);
    throw Error('WebGL context lost during preparation');
  }
  return finishTankProgram(gl, linked, cache, key);
}

// World batches and vector layers account for the same submitted GPU work.
function tankDraw(gl, stats, mode, vertices, instances) {
  if (instances === undefined)
    gl.drawArrays(mode, 0, vertices);
  else
    gl.drawArraysInstanced(mode, 0, vertices, instances);
  stats.draws++;
  stats.vertices += vertices * (instances ?? 1);
}

export function mergeInstanceRanges(ranges) {
  const merged = [];
  for (const range of ranges) {
    if (!range?.count)
      continue;
    const last = merged[merged.length - 1];
    if (last && last.start + last.count === range.start && last.segments === range.segments)
      last.count += range.count;
    else
      merged.push({...range});
  }
  return merged;
}
// Every world batch uses the same pipeline setup; only its data and shaders differ.
export class TankBatch {
  constructor(canvas, renderer, vertex, fragment, sizes, uniforms, divisor = 1) {
    this.canvas = canvas;
    const gl = this.gl = renderer.gl;
    this.renderer = renderer;
    this.program = tankProgram(gl, vertex, fragment);
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    this.sizes = sizes;
    this.attributes(0, divisor);
    this.uniforms =
        Object.fromEntries(uniforms.map(k => [k, gl.getUniformLocation(this.program, k)]));
    this.revision = -1;
    this.capacity = this.count = 0;
  }
  submit(mode, vertices, instances) {
    tankDraw(this.gl, this.renderer.stats, mode, vertices, instances);
  }
  attributes(first = 0, divisor = 1) {
    const gl = this.gl, stride = this.sizes.reduce((a, b) => a + b, 0) * FLOAT_BYTES;
    let offset = first * stride;
    for (let i = 0; i < this.sizes.length; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, this.sizes[i], gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(i, divisor);
      offset += this.sizes[i] * FLOAT_BYTES;
    }
  }
}

// The same flattened paths provide CPU hit testing and GPU fill/stroke geometry.
export class TankPath {
  constructor() {
    this.transform = tankIdentity();
    this.stack = [];
    this.lineWidth = 1;
    this.beginPath();
  }
  save() { this.stack.push({transform : this.transform.slice(), lineWidth : this.lineWidth}); }
  restore() {
    const s = this.stack.pop();
    if (s)
      Object.assign(this, s);
  }
  setTransform(a, b, c, d, e, f) { this.transform = [ a, b, c, d, e, f ]; }
  translate(x, y) {
    const m = this.transform;
    m[4] += m[0] * x + m[2] * y;
    m[5] += m[1] * x + m[3] * y;
  }
  scale(x, y) {
    const m = this.transform;
    m[0] *= x;
    m[1] *= x;
    m[2] *= y;
    m[3] *= y;
  }
  rotate(t) {
    const m = this.transform, c = Math.cos(t), s = Math.sin(t), a = m.slice();
    m[0] = a[0] * c + a[2] * s;
    m[1] = a[1] * c + a[3] * s;
    m[2] = a[2] * c - a[0] * s;
    m[3] = a[3] * c - a[1] * s;
  }
  beginPath() {
    this.paths = [];
    this.current = null;
  }
  moveTo(x, y) {
    const q = tankPoint(this.transform, x, y);
    this.current = {points : [ q ], closed : false};
    this.paths.push(this.current);
  }
  lineTo(x, y) {
    const q = tankPoint(this.transform, x, y);
    if (!this.current) {
      this.current = {points : [], closed : false};
      this.paths.push(this.current);
    }
    delete this.current.ellipse;
    delete this.current.axisRect;
    const last = this.current.points.at(-1);
    if (!last || Math.abs(last[0] - q[0]) + Math.abs(last[1] - q[1]) > TOLERANCE.negligible)
      this.current.points.push(q);
  }
  closePath() {
    if (this.current)
      this.current.closed = true;
  }
  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
    this.current.axisRect =
        Math.abs(this.transform[1]) + Math.abs(this.transform[2]) < TOLERANCE.negligible;
  }
  bezierCurveTo(x1, y1, x2, y2, x, y) {
    const a = this.current?.points.at(-1);
    if (!a) {
      this.moveTo(x1, y1);
      return this.bezierCurveTo(x1, y1, x2, y2, x, y);
    }
    const b = tankPoint(this.transform, x1, y1), c = tankPoint(this.transform, x2, y2),
          d = tankPoint(this.transform, x, y), points = this.current.points;
    const split = (a, b, c, d, depth) => {
      const dx = d[0] - a[0], dy = d[1] - a[1],
            error = Math.abs((b[0] - d[0]) * dy - (b[1] - d[1]) * dx) +
                    Math.abs((c[0] - d[0]) * dy - (c[1] - d[1]) * dx);
      if (depth >= FLATTEN.max_depth || error * error <= FLATTEN.error ** 2 * (dx * dx + dy * dy)) {
        points.push(d);
        return;
      }
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ab = mid(a, b), bc = mid(b, c),
            cd = mid(c, d), abc = mid(ab, bc), bcd = mid(bc, cd), center = mid(abc, bcd);
      split(a, ab, abc, center, depth + 1);
      split(center, bcd, cd, d, depth + 1);
    };
    split(a, b, c, d, 0);
  }
  quadraticCurveTo(cx, cy, x, y) {
    const p = this.current?.points.at(-1);
    if (!p) {
      this.moveTo(cx, cy);
      return this.quadraticCurveTo(cx, cy, x, y);
    }
    const b = tankPoint(this.transform, cx, cy), c = tankPoint(this.transform, x, y),
          points = this.current.points;
    const split = (a, b, c, depth) => {
      const dx = c[0] - a[0], dy = c[1] - a[1],
            e = Math.abs((b[0] - c[0]) * dy - (b[1] - c[1]) * dx);
      if (depth >= FLATTEN.max_depth || e * e <= FLATTEN.error ** 2 * (dx * dx + dy * dy)) {
        points.push(c);
        return;
      }
      const ab = [ (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 ],
            bc = [ (b[0] + c[0]) / 2, (b[1] + c[1]) / 2 ],
            m = [ (ab[0] + bc[0]) / 2, (ab[1] + bc[1]) / 2 ];
      split(a, ab, m, depth + 1);
      split(m, bc, c, depth + 1);
    };
    split(p, b, c, 0);
  }
  arc(x, y, r, start, end, ccw = false) { this.ellipse(x, y, r, r, 0, start, end, ccw); }
  ellipse(x, y, rx, ry, angle, start, end, ccw = false) {
    const tau = Math.PI * 2, raw = end - start;
    let span = raw;
    if (!ccw) {
      span = raw >= tau ? tau : ((raw % tau) + tau) % tau;
    } else
      span = raw <= -tau ? -tau : -(((-raw % tau) + tau) % tau);
    if (Math.abs(raw) >= tau)
      span = ccw ? -tau : tau;
    const m = this.transform, scale = Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])),
          count = Math.max(
              FLATTEN.arc_min,
              Math.min(FLATTEN.arc_max,
                       Math.ceil(Math.abs(span) * Math.sqrt(Math.max(1, Math.max(rx, ry) * scale) /
                                                            FLATTEN.arc_error)))),
          co = Math.cos(angle), si = Math.sin(angle);
    for (let i = 0; i <= count; i++) {
      const t = start + span * i / count, px = x + co * rx * Math.cos(t) - si * ry * Math.sin(t),
            py = y + si * rx * Math.cos(t) + co * ry * Math.sin(t);
      if (i || this.current)
        this.lineTo(px, py);
      else
        this.moveTo(px, py);
    }
    if (Math.abs(span) >= tau - TOLERANCE.negligible && this.current.points.length === count + 1)
      this.current.ellipse = {x, y, rx, ry, angle, m : m.slice()};
  }
  isPointInPath(x, y, rule = 'nonzero') {
    let winding = 0;
    for (const {points} of this.paths)
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[j], b = points[i],
              cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
        if (a[1] <= y && b[1] > y && cross > 0)
          winding++;
        else if (a[1] > y && b[1] <= y && cross < 0)
          winding--;
      }
    return rule === 'evenodd' ? Math.abs(winding) % 2 === 1 : winding !== 0;
  }
  isPointInStroke(x, y) {
    const m = this.transform,
          r = this.lineWidth * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) / 2;
    for (const p of this.paths) {
      const n = p.points.length;
      for (let i = 0; i < n - (p.closed ? 0 : 1); i++) {
        const a = p.points[i], b = p.points[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1],
              t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) /
                                              Math.max(TOLERANCE.rounding, dx * dx + dy * dy)));
        if (Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <= r)
          return true;
      }
    }
    return false;
  }
}

export function tankTriangles(input) {
  const points =
      input.filter((p, i) => !i || Math.hypot(p[0] - input[i - 1][0], p[1] - input[i - 1][1]) >
                                       TOLERANCE.precision);
  if (points.length > 1 && Math.hypot(points[0][0] - points.at(-1)[0],
                                      points[0][1] - points.at(-1)[1]) < TOLERANCE.precision)
    points.pop();
  const n = points.length;
  if (n < 3)
    return [];
  if (n === 3)
    return points;
  if (n === 4) {
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
          turns = points.map((p, k) => cross(p, points[(k + 1) % 4], points[(k + 2) % 4]));
    if (turns.every(v => v >= 0) || turns.every(v => v <= 0))
      return [ points[0], points[1], points[2], points[0], points[2], points[3] ];
  }
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
        area = points.reduce(
            (v, p, i) => v + p[0] * points[(i + 1) % n][1] - p[1] * points[(i + 1) % n][0], 0),
        sign = area < 0 ? -1 : 1, ring = points.map((_, i) => i), out = [];
  let tries = n * n;
  while (ring.length > 3 && tries-- > 0) {
    let found = false;
    for (let k = 0; k < ring.length; k++) {
      const i = ring[(k + ring.length - 1) % ring.length], j = ring[k],
            l = ring[(k + 1) % ring.length], a = points[i], b = points[j], c = points[l],
            turn = sign * cross(a, b, c);
      if (turn < TOLERANCE.negligible) {
        if (Math.abs(turn) < TOLERANCE.negligible) {
          ring.splice(k, 1);
          found = true;
          break;
        }
        continue;
      }
      let inside = false;
      for (const t of ring) {
        if (t === i || t === j || t === l)
          continue;
        const p = points[t];
        if (sign * cross(a, b, p) > TOLERANCE.negligible &&
            sign * cross(b, c, p) > TOLERANCE.negligible &&
            sign * cross(c, a, p) > TOLERANCE.negligible) {
          inside = true;
          break;
        }
      }
      if (!inside) {
        out.push(a, b, c);
        ring.splice(k, 1);
        found = true;
        break;
      }
    }
    if (!found)
      return null;
  }
  if (ring.length === 3)
    out.push(...ring.map(i => points[i]));
  return out;
}

export class TankDisplayList extends TankPath {
  constructor() {
    super();
    this.commands = [];
    this.savedValues = [];
    this.values = {globalAlpha : 1, fillStyle : '#000', strokeStyle : '#000', lineWidth : 1};
    return new Proxy(this, {
      get : (t, k) => {
        if (k === 'replay' || k === 'reset')
          return t[k].bind(t);
        if (k === 'createLinearGradient' || k === 'createRadialGradient')
          return (...args) => TankRenderer.prototype[k].call(t, ...args);
        if (k in t.values)
          return t.values[k];
        return (...args) => {
          if (k === 'clearRect' && args[0] === 0 && args[1] === 0) {
            t.reset();
            return;
          }
          t.commands.push([ k, args ]);
          if (k === 'save')
            t.savedValues.push({...t.values});
          else if (k === 'restore' && t.savedValues.length)
            t.values = t.savedValues.pop();
          if ([ 'save', 'restore', 'setTransform', 'translate', 'scale', 'rotate' ].includes(k))
            TankPath.prototype[k].apply(t, args);
        };
      },
      set : (t, k, v) => {
        t.values[k] = v;
        t.commands.push([ '=', [ k, v ] ]);
        return true;
      }
    });
  }
  reset() {
    this.commands = [];
    for (const [k, v] of Object.entries(this.values))
      this.commands.push([ '=', [ k, v ] ]);
    this.commands.push([ 'setTransform', this.transform.slice() ]);
  }
  replay(g) {
    for (const [k, args] of this.commands)
      if (k === '=')
        g[args[0]] = args[1];
      else
        g[k](...args);
  }
}

export class TankLayer {
  constructor() {
    this.w = this.h = 1;
    this.tankRevision = 0;
    this.context = new TankDisplayList();
  }
  get width() { return this.w; }
  set width(v) {
    this.w = Math.max(1, v);
    this.context = new TankDisplayList();
    this.tankRevision++;
  }
  get height() { return this.h; }
  set height(v) {
    this.h = Math.max(1, v);
    this.context = new TankDisplayList();
    this.tankRevision++;
  }
  getContext() { return this.context; }
  replace(layer) {
    this.w = layer.width;
    this.h = layer.height;
    this.context = layer.context;
    this.tankRevision++;
  }
}

export class TankPixelImage {
  constructor() {
    this.width = this.height = 1;
    this.data = null;
    this.tankRevision = 0;
  }
  getContext() {
    return {
      createImageData : (w, h) =>
          ({width : w, height : h, data : new Uint8ClampedArray(w * h * PIXEL_BYTES)}),
      putImageData : image => {
        this.data = image.data;
        touchTankImage(this);
      }
    };
  }
}

class TankRenderer extends TankPath {
  constructor(canvas, parent = null) {
    super();
    this.canvas = canvas;
    this.owner = parent?.owner || this;
    this.gl = parent?.gl || canvas.getContext('webgl2', {
      alpha : false,
      antialias : true,
      depth : false,
      stencil : true,
      premultipliedAlpha : true
    });
    if (!this.gl)
      throw Error(t('renderer.fuerDasAquariumWird'));
    this.lost = false;
    this.resetState();
    if (parent) {
      for (const k of ['program', 'vao', 'buffer', 'uniforms', 'pipeline', 'images', 'textures',
                       'gradients', 'labels', 'textureLimit'])
        this[k] = parent[k];
      this.vertices = new Float32Array(RENDER.vertices);
      this.used = 0;
      this.mode = PAINT.solid;
      this.texture = null;
      this.stats = this.owner.stats;
    } else
      this.init();
    canvas.addEventListener?.('webglcontextlost', e => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener?.('webglcontextrestored', () => {
      tankPrograms.delete(this.gl);
      this.lost = false;
      this.init();
      this.onRestore?.();
    });
  }
  get globalCompositeOperation() { return this.composite || 'source-over'; }
  set globalCompositeOperation(value) {
    if (this.composite !== value) {
      if (this.used)
        this.flush();
      this.composite = value;
    }
  }
  resetState() {
    this.transform = tankIdentity();
    this.stack = [];
    this.globalAlpha = this.layerAlpha = 1;
    this.fillStyle = this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.dash = [];
    this.lineDashOffset = 0;
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.globalCompositeOperation = 'source-over';
    this.imageSmoothingEnabled = true;
    this.clipDepth = 0;
    this.clipBounds = [ 0, 0, this.canvas?.width || 1, this.canvas?.height || 1 ];
    this.clipHistory = [];
    this.beginPath();
  }
  init() {
    const gl = this.gl;
    this.textureLimit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || Infinity,
                                 gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || Infinity);
    try {
      const ext = gl.getExtension?.('WEBGL_debug_renderer_info');
      this.device =
          ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch {
      this.device = t('renderer.webgl2');
    }
    const program = tankProgram(gl, tankVertexSource, tankFragmentSource);
    this.program = program;
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    let offset = 0;
    VERTEX_ATTRIBUTES.forEach(([, size ], i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, VERTEX_FLOATS * FLOAT_BYTES, offset);
      gl.vertexAttribDivisor(i, 0);
      offset += size * FLOAT_BYTES;
    });
    this.uniforms = Object.fromEntries([ 'viewport', 'mode', 'image', 'dashPattern' ].map(
        k => [k, gl.getUniformLocation(program, k)]));
    this.vertices = new Float32Array(RENDER.vertices);
    this.used = 0;
    this.pipeline = {capacity : 0};
    this.mode = PAINT.solid;
    this.texture = null;
    this.images = new WeakMap();
    this.textures = new Set();
    this.owner.textureBytes = 0;
    this.gradients = new Map();
    this.labels = new Map();
    this.clock = 0;
    this.completedFrames = 0;
    this.pendingFrames = [];
    this.pendingContent = [];
    this.pendingSubmitted = [];
    this.completedContentStamp = null;
    this.stats = {draws : 0, vertices : 0};
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST);
  }
  pollFrames() {
    if (this.lost)
      return;
    const gl = this.gl;
    while (this.pendingFrames.length) {
      const status = gl.clientWaitSync(this.pendingFrames[0], 0, 0);
      if (status === gl.TIMEOUT_EXPIRED)
        break;
      gl.deleteSync(this.pendingFrames.shift());
      const content = this.pendingContent.shift();
      this.pendingSubmitted.shift();
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
        this.completedFrames++;
        this.completedContentStamp = content ?? null;
      }
    }
  }
  frameReady() {
    this.pollFrames();
    if (this.lost)
      return false;
    return this.pendingFrames.length < RENDER.frames;
  }
  beginFrame() {
    if (this.lost)
      return;
    this.used = 0;
    this.resetState();
    if (this.owner === this) {
      this.clock++;
      this.stats = {draws : 0, vertices : 0};
    } else {
      this.clock = this.owner.clock;
      this.stats = this.owner.stats;
    }
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.stencilMask(STENCIL.all);
    gl.clearStencil(0);
    gl.clearColor(...(this.owner === this ? CLEAR_COLOR : TANK_MASK_COLOR));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    this.bindClip();
  }
  endFrame(content = null) {
    this.flush();
    if (this.owner !== this)
      return;
    const fence = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (fence) {
      this.pendingFrames.push(fence);
      this.pendingContent.push(content);
      this.pendingSubmitted.push(performance.now());
    }
    this.gl.flush();
    if (this.textureBytes > RENDER.texture_limit) {
      const old = [...this.textures ]
                      .filter(t => t.frame < this.clock - 1)
                      .sort((a, b) => a.frame - b.frame);
      for (const t of old) {
        if (this.textureBytes <= RENDER.texture_target)
          break;
        this.releaseTexture(t);
      }
    }
  }
  save() {
    this.stack.push({
      transform : this.transform.slice(),
      globalAlpha : this.globalAlpha,
      layerAlpha : this.layerAlpha,
      fillStyle : this.fillStyle,
      strokeStyle : this.strokeStyle,
      lineWidth : this.lineWidth,
      lineCap : this.lineCap,
      lineJoin : this.lineJoin,
      lineDashOffset : this.lineDashOffset,
      font : this.font,
      textAlign : this.textAlign,
      textBaseline : this.textBaseline,
      globalCompositeOperation : this.globalCompositeOperation,
      imageSmoothingEnabled : this.imageSmoothingEnabled,
      clipDepth : this.clipDepth,
      clipBounds : this.clipBounds,
      dash : this.dash
    });
  }
  restore() {
    const state = this.stack.pop();
    if (!state)
      throw Error('Unbalanced tank restore');
    const changed = state.clipDepth !== this.clipDepth || state.clipBounds !== this.clipBounds;
    if (changed)
      this.flush();
    if (state.clipDepth !== this.clipDepth) {
      const gl = this.gl;
      this.scissor(this.clipHistory[state.clipDepth] || this.clipBounds);
      gl.colorMask(false, false, false, false);
      gl.stencilMask(STENCIL.clip);
      gl.stencilFunc(gl.LESS, state.clipDepth, STENCIL.clip);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      this.rawQuad();
      gl.colorMask(true, true, true, true);
      this.clipHistory.length = state.clipDepth;
    }
    Object.assign(this, state);
    if (changed)
      this.bindClip();
  }

  scissor(b) {
    const gl = this.gl, left = Math.max(0, Math.floor(b[0])), top = Math.max(0, Math.floor(b[1])),
          right = Math.min(this.canvas.width, Math.ceil(b[2])),
          bottom = Math.min(this.canvas.height, Math.ceil(b[3]));
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(left, this.canvas.height - Math.max(top, bottom), Math.max(0, right - left),
               Math.max(0, bottom - top));
  }

  setLineDash(q) {
    this.dash = q.slice();
    if (this.dash.length % 2)
      this.dash = this.dash.concat(this.dash);
  }
  getLineDash() { return this.dash.slice(); }
  bindClip() {
    const gl = this.gl;
    this.scissor(this.clipBounds);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0);
    gl.stencilFunc(gl.EQUAL, this.clipDepth, STENCIL.clip);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  }
  beginExternal() {
    this.flush();
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.bindClip();
  }
  endExternal() { this.bindClip(); }
  select(mode, texture) {
    if (this.mode !== mode || this.texture !== texture) {
      this.flush();
      this.mode = mode;
      this.texture = texture;
    }
  }
  // One vertex in VERTEX_ATTRIBUTES order: position, uv, premultiplied colour, shape and inner
  // radius.
  vertex(x, y, u, v, color, shape = SHAPE.none, inner = 0) {
    if (this.used + VERTEX_FLOATS > this.vertices.length) {
      const larger = new Float32Array(this.vertices.length * 2);
      larger.set(this.vertices);
      this.vertices = larger;
    }
    const q = this.vertices;
    let a = this.used;
    q[a++] = x;
    q[a++] = y;
    q[a++] = u;
    q[a++] = v;
    for (const channel of color)
      q[a++] = channel;
    q[a++] = shape;
    q[a++] = inner;
    this.used = a;
  }
  flush() {
    if (!this.used || this.lost) {
      this.used = 0;
      return;
    }
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (this.vertices.byteLength > this.pipeline.capacity) {
      this.pipeline.capacity = this.vertices.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, this.pipeline.capacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, this.used));
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.viewport, this.canvas.width, this.canvas.height);
    gl.uniform1i(this.uniforms.mode, this.mode);
    if (this.mode === PAINT.dash)
      gl.uniform3f(this.uniforms.dashPattern, ...this.gpuDash);
    gl.uniform1i(this.uniforms.image, 0);
    if (this.texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
    }
    gl.blendFunc(this.composite === 'source-atop'       ? gl.DST_ALPHA
                 : this.composite === 'destination-out' ? gl.ZERO
                                                        : gl.ONE,
                 gl.ONE_MINUS_SRC_ALPHA);
    tankDraw(gl, this.stats, gl.TRIANGLES, this.used / VERTEX_FLOATS);
    this.used = 0;
  }
  raw(points) {
    this.select(PAINT.solid, null);
    for (const p of points)
      this.vertex(...p, 0, 0, [ 0, 0, 0, 0 ]);
    this.flush();
  }
  rawQuad() {
    const w = this.canvas.width, h = this.canvas.height;
    this.raw([ [ 0, 0 ], [ w, 0 ], [ w, h ], [ 0, 0 ], [ w, h ], [ 0, h ] ]);
  }
  maskPath(rule) {
    const gl = this.gl;
    this.flush();
    gl.colorMask(false, false, false, false);
    gl.stencilMask(STENCIL.path);
    gl.stencilFunc(gl.EQUAL, this.clipDepth, STENCIL.clip);
    gl.stencilOp(gl.KEEP, gl.KEEP, rule === 'evenodd' ? gl.INVERT : gl.REPLACE);
    // One draw per run of paths: INVERT toggles and REPLACE sets the same bit, so both are
    // order-independent within a run. A mask of many sediment beds used to cost one draw each.
    this.select(PAINT.solid, null);
    const fan = points => {
      for (let i = 1; i < points.length - 1; i++) {
        this.vertex(points[0][0], points[0][1], 0, 0, TANK_MASK_COLOR);
        this.vertex(points[i][0], points[i][1], 0, 0, TANK_MASK_COLOR);
        this.vertex(points[i + 1][0], points[i + 1][1], 0, 0, TANK_MASK_COLOR);
      }
    };
    if (rule === 'evenodd') {
      for (const {points} of this.paths)
        fan(points);
    } else {
      gl.stencilFunc(gl.EQUAL, this.clipDepth | STENCIL.path, STENCIL.clip);
      for (const {points} of this.paths) {
        const tri = tankTriangles(points);
        if (tri)
          for (const p of tri)
            this.vertex(p[0], p[1], 0, 0, TANK_MASK_COLOR);
        else {
          // Self-intersecting outline: its own inverted fan, in order between the replacements.
          this.flush();
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
          fan(points);
          this.flush();
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        }
      }
    }
    this.flush();
  }
  clip(rule = 'nonzero') {
    if (this.clipDepth >= STENCIL.max_depth)
      throw Error('Tank clipping limit exceeded');
    if (rule === 'outside' && !this.paths.some(p => p.points.length >= 3))
      return;
    this.flush();
    const b = this.clipBounds;
    if (rule !== 'outside') {
      const points = this.paths.flatMap(p => p.points), xs = points.map(p => p[0]),
            ys = points.map(p => p[1]);
      this.clipBounds=points.length?[Math.max(b[0],Math.min(...xs)),Math.max(b[1],Math.min(...ys)),Math.min(b[2],Math.max(...xs)),Math.min(b[3],Math.max(...ys))]:[0,0,0,0];
    }
    this.scissor(this.clipBounds);
    if (rule !== 'outside' && this.paths.length === 1 && this.paths[0].axisRect) {
      this.bindClip();
      return;
    }
    this.maskPath(rule);
    const gl = this.gl;
    gl.stencilMask(STENCIL.clip);
    gl.stencilFunc(gl.EQUAL, rule === 'outside' ? this.clipDepth : STENCIL.path,
                   rule === 'outside' ? STENCIL.all : STENCIL.path);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    this.rawQuad();
    gl.stencilMask(STENCIL.path);
    gl.clearStencil(0);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    this.clipHistory.push(this.clipBounds.slice());
    this.clipDepth++;
    gl.colorMask(true, true, true, true);
    this.bindClip();
  }

  createLinearGradient(x0, y0, x1, y1) {
    const a = tankPoint(this.transform, x0, y0), b = tankPoint(this.transform, x1, y1);
    return {
      kind : PAINT.linear,
      a,
      b,
      stops : [],
      addColorStop(at, color) {
        this.stops.push([ at, cssColor(color) ]);
        this.stops.sort((a, b) => a[0] - b[0]);
      }
    };
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const a = tankPoint(this.transform, x1, y1),
          s = Math.sqrt(Math.abs(this.transform[0] * this.transform[3] -
                                 this.transform[1] * this.transform[2]));
    return {
      kind : PAINT.radial,
      a,
      r0 : r0 * s,
      r1 : r1 * s,
      stops : [],
      addColorStop(at, color) {
        this.stops.push([ at, cssColor(color) ]);
        this.stops.sort((a, b) => a[0] - b[0]);
      }
    };
  }
  ramp(style) {
    const key = JSON.stringify(style.stops);
    let t = this.gradients.get(key);
    if (t?.texture) {
      t.frame = this.owner.clock;
      return t.texture;
    }
    const bytes = new Uint8Array(RENDER.ramp * PIXEL_BYTES),
          stops = style.stops.length ? style.stops : [ [ 0, TANK_MASK_COLOR ] ];
    for (let k = 0; k < RENDER.ramp; k++) {
      const x = k / (RENDER.ramp - 1);
      let a = stops[0], b = stops.at(-1);
      for (let j = 1; j < stops.length; j++)
        if (x <= stops[j][0]) {
          a = stops[j - 1];
          b = stops[j];
          break;
        }
      const f = Math.max(0, Math.min(1, (x - a[0]) / Math.max(TOLERANCE.rounding, b[0] - a[0]))),
            q = a[1].map((v, i) => v + (b[1][i] - v) * f);
      bytes.set(q.map((v, i) => Math.round(CHANNEL_MAX * v * (i < ALPHA ? q[ALPHA] : 1))),
                k * PIXEL_BYTES);
    }
    t = this.uploadTexture(t, RENDER.ramp, 1, bytes, false);
    this.gradients.set(key, t);
    if (this.gradients.size > RENDER.ramps) {
      const oldest = this.gradients.keys().next().value;
      this.releaseTexture(this.gradients.get(oldest));
      this.gradients.delete(oldest);
    }
    return t.texture;
  }
  paintStyle(style) {
    const alpha = Math.max(0, Math.min(1, this.globalAlpha * this.layerAlpha));
    if (typeof style === 'object' && style.stops) {
      this.select(style.kind, this.ramp(style));
      return p => {
        const d = style.kind === PAINT.linear ? [ style.b[0] - style.a[0], style.b[1] - style.a[1] ]
                                              : null,
              u = d ? ((p[0] - style.a[0]) * d[0] + (p[1] - style.a[1]) * d[1]) /
                          Math.max(TOLERANCE.rounding, d[0] * d[0] + d[1] * d[1])
                    : (p[0] - style.a[0]) / Math.max(TOLERANCE.rounding, style.r1),
              v = d ? .5 : (p[1] - style.a[1]) / Math.max(TOLERANCE.rounding, style.r1);
        return [ u, v, [ alpha, alpha, alpha, alpha ] ];
      };
    }
    const q = cssColor(style), a = q[ALPHA] * alpha;
    this.select(PAINT.solid, null);
    const values = [ 0, 0, [ q[0] * a, q[1] * a, q[2] * a, a ] ];
    return () => values;
  }
  ellipseQuad(e, style, stroke = false) {
    const {x, y, rx, ry, angle, m} = e, pad = stroke ? this.lineWidth * .5 : 0,
                                co = Math.cos(angle), si = Math.sin(angle),
                                paint = this.paintStyle(style), color = paint([ 0, 0 ])[2],
                                inner = stroke ? Math.max(0, (Math.min(rx, ry) - pad) /
                                                                 (Math.min(rx, ry) + pad))
                                               : 0;
    for (const [u, v] of [[ -1, -1 ], [ 1, -1 ], [ 1, 1 ], [ -1, -1 ], [ 1, 1 ], [ -1, 1 ]]) {
      const a = u * (rx + pad), b = v * (ry + pad),
            q = tankPoint(m, x + co * a - si * b, y + si * a + co * b);
      this.vertex(q[0], q[1], u, v, color, stroke ? SHAPE.ring : SHAPE.disc, inner);
    }
  }
  fillEllipse(x, y, rx, ry = rx, angle = 0) {
    if (rx > 0 && ry > 0)
      this.ellipseQuad({x, y, rx, ry, angle, m : this.transform}, this.fillStyle);
  }
  fill(rule = 'nonzero') {
    if (!this.paths.length)
      return;
    if (this.paths.length === 1 && this.paths[0].ellipse && typeof this.fillStyle === 'string') {
      this.ellipseQuad(this.paths[0].ellipse, this.fillStyle);
      return;
    }
    const triangles = [];
    let complex = rule === 'evenodd';
    for (const p of this.paths) {
      const tri = tankTriangles(p.points);
      if (tri)
        triangles.push(...tri);
      else
        complex = true;
    }
    if (!complex) {
      const style = this.paintStyle(this.fillStyle);
      for (const p of triangles) {
        const q = style(p);
        this.vertex(p[0], p[1], q[0], q[1], q[2]);
      }
      return;
    }
    this.maskPath('evenodd');
    const gl = this.gl;
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0);
    gl.stencilFunc(gl.EQUAL, this.clipDepth | STENCIL.path, STENCIL.all);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    const style = this.paintStyle(this.fillStyle), points = this.paths.flatMap(p => p.points);
    if (points.length) {
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]),
            a = [ Math.min(...xs), Math.min(...ys) ], b = [ Math.max(...xs), Math.max(...ys) ];
      for (const p of [a, [ b[0], a[1] ], b, a, b, [ a[0], b[1] ]])
        this.vertex(...p, ...style(p));
      this.flush();
    }
    gl.stencilMask(STENCIL.path);
    gl.clearStencil(0);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    this.bindClip();
  }
  fillRect(x, y, w, h) {
    const paths = this.paths, current = this.current;
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    this.paths = paths;
    this.current = current;
  }
  strokeRect(x, y, w, h) {
    const paths = this.paths, current = this.current;
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
    this.paths = paths;
    this.current = current;
  }
  clearRect(x, y, w, h) {
    this.flush();
    const paths = this.paths, current = this.current, style = this.fillStyle,
          alpha = this.globalAlpha;
    this.beginPath();
    this.rect(x, y, w, h);
    this.fillStyle = 'transparent';
    this.globalAlpha = 1;
    const gl = this.gl;
    this.fill();
    gl.colorMask(true, true, true, true);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, this.used), gl.DYNAMIC_DRAW);
    this.pipeline.capacity = this.used * FLOAT_BYTES;
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.viewport, this.canvas.width, this.canvas.height);
    gl.uniform1i(this.uniforms.mode, PAINT.solid);
    gl.blendFunc(gl.ZERO, gl.ZERO);
    tankDraw(gl, this.stats, gl.TRIANGLES, this.used / VERTEX_FLOATS);
    this.used = 0;
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.paths = paths;
    this.current = current;
    this.fillStyle = style;
    this.globalAlpha = alpha;
  }
  stroke() {
    if (this.paths.length === 1 && this.paths[0].ellipse &&
        Math.abs(this.paths[0].ellipse.rx - this.paths[0].ellipse.ry) <
            this.paths[0].ellipse.rx * FLATTEN.ring &&
        !this.dash.length && typeof this.strokeStyle === 'string') {
      this.ellipseQuad(this.paths[0].ellipse, this.strokeStyle, true);
      return;
    }
    const m = this.transform,
          r = this.lineWidth * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) / 2;
    if (!(r > 0))
      return;
    const style = this.paintStyle(this.strokeStyle), emit = points => {
      for (const p of points) {
        const q = style(p);
        this.vertex(p[0], p[1], q[0], q[1], q[2]);
      }
    }, cap = (p, angle) => {
      if (this.lineCap !== 'round')
        return;
      const n = Math.max(FLATTEN.cap_min, Math.ceil(Math.PI * Math.sqrt(r)));
      for (let k = 0; k < n; k++) {
        const a = angle + Math.PI * k / n, b = angle + Math.PI * (k + 1) / n;
        emit([
          p, [ p[0] + r * Math.cos(a), p[1] + r * Math.sin(a) ],
          [ p[0] + r * Math.cos(b), p[1] + r * Math.sin(b) ]
        ]);
      }
    }, line = (a, b, start = true, end = true) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < TOLERANCE.negligible)
        return;
      const x = -dy / len * r, y = dx / len * r;
      emit([
        [ a[0] + x, a[1] + y ], [ a[0] - x, a[1] - y ], [ b[0] - x, b[1] - y ],
        [ a[0] + x, a[1] + y ], [ b[0] - x, b[1] - y ], [ b[0] + x, b[1] + y ]
      ]);
      if (start)
        cap(a, Math.atan2(dy, dx) + Math.PI / 2);
      if (end)
        cap(b, Math.atan2(dy, dx) - Math.PI / 2);
    };
    for (const path of this.paths) {
      const p = path.points, n = p.length;
      if (n < 2)
        continue;
      if (this.dash.length && this.dash.length !== 2) {
        const total = this.dash.reduce((s, v) => s + v, 0);
        if (total <= 0)
          continue;
        let index = 0, remaining = this.dash[0],
            offset = ((this.lineDashOffset % total) + total) % total;
        while (offset >= remaining && remaining > 0) {
          offset -= remaining;
          index = (index + 1) % this.dash.length;
          remaining = this.dash[index];
        }
        remaining -= offset;
        for (let i = 0; i < n - (path.closed ? 0 : 1); i++) {
          const a = p[i], b = p[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1],
                len = Math.hypot(dx, dy);
          for (let at = 0; at < len - TOLERANCE.negligible;) {
            if (remaining < TOLERANCE.negligible) {
              index = (index + 1) % this.dash.length;
              remaining = this.dash[index];
              continue;
            }
            const span = Math.min(remaining, len - at);
            if (index % 2 === 0)
              line([ a[0] + dx * at / len, a[1] + dy * at / len ],
                   [ a[0] + dx * (at + span) / len, a[1] + dy * (at + span) / len ]);
            remaining -= span;
            at += span;
          }
        }
        continue;
      }
      const dashed = this.dash.length === 2;
      let distance = 0;
      if (dashed) {
        const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])),
              pattern = [ this.dash[0] * scale, this.dash[1] * scale, this.lineDashOffset * scale ];
        if (this.mode !== PAINT.dash || String(pattern) !== String(this.gpuDash)) {
          this.flush();
          this.gpuDash = pattern;
        }
        this.select(PAINT.dash, null);
      } else
        this.paintStyle(this.strokeStyle);
      // Thin wiring uses segment quads; clipped portions never enter the upload buffer.
      if (r <= FLATTEN.thin) {
        const bounds = this.clipBounds, pad = r + 1, color = style(p[0])[2];
        for (let i = 0; i < n - (path.closed ? 0 : 1); i++) {
          const a = p[i], b = p[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1],
                length = Math.hypot(dx, dy), end = distance + length;
          if (length > TOLERANCE.negligible && Math.max(a[0], b[0]) + pad >= bounds[0] &&
              Math.min(a[0], b[0]) - pad <= bounds[2] && Math.max(a[1], b[1]) + pad >= bounds[1] &&
              Math.min(a[1], b[1]) - pad <= bounds[3]) {
            const x = -dy / length * r, y = dx / length * r, u = dashed ? distance : 0,
                  v = dashed ? end : 0;
            this.vertex(a[0] + x, a[1] + y, u, 0, color);
            this.vertex(a[0] - x, a[1] - y, u, 0, color);
            this.vertex(b[0] - x, b[1] - y, v, 0, color);
            this.vertex(a[0] + x, a[1] + y, u, 0, color);
            this.vertex(b[0] - x, b[1] - y, v, 0, color);
            this.vertex(b[0] + x, b[1] + y, v, 0, color);
          }
          distance = end;
        }
        continue;
      }
      const normals = [];
      for (let i = 0; i < n; i++) {
        let prev = p[(i + n - 1) % n], next = p[(i + 1) % n];
        if (!path.closed && i === 0)
          prev = p[0];
        if (!path.closed && i === n - 1)
          next = p[n - 1];
        let ax = p[i][0] - prev[0], ay = p[i][1] - prev[1], bx = next[0] - p[i][0],
            by = next[1] - p[i][1], al = Math.hypot(ax, ay), bl = Math.hypot(bx, by);
        if (!al) {
          ax = bx;
          ay = by;
          al = bl;
        }
        if (!bl) {
          bx = ax;
          by = ay;
          bl = al;
        }
        const na = [ -ay / (al || 1), ax / (al || 1) ], nb = [ -by / (bl || 1), bx / (bl || 1) ],
              mx = na[0] + nb[0], my = na[1] + nb[1], den = mx * nb[0] + my * nb[1],
              s = Math.min(FLATTEN.miter, FLATTEN.miter / Math.max(FLATTEN.min_miter, den)) * r;
        normals.push([ mx * s / 2, my * s / 2 ]);
      }
      for (let i = 0; i < n - (path.closed ? 0 : 1); i++) {
        const j = (i + 1) % n, a = p[i], b = p[j], na = normals[i], nb = normals[j],
              al = [ a[0] + na[0], a[1] + na[1] ], ar = [ a[0] - na[0], a[1] - na[1] ],
              bl = [ b[0] + nb[0], b[1] + nb[1] ], br = [ b[0] - nb[0], b[1] - nb[1] ];
        if (dashed) {
          const end = distance + Math.hypot(b[0] - a[0], b[1] - a[1]), color = style(a)[2];
          this.select(PAINT.dash, null);
          for (const [point, u] of [[ al, distance ], [ ar, distance ], [ br, end ],
                                    [ al, distance ], [ br, end ], [ bl, end ]])
            this.vertex(point[0], point[1], u, 0, color);
          distance = end;
        } else
          emit([ al, ar, br, al, br, bl ]);
      }
      if (!path.closed && !dashed) {
        cap(p[0], Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]) + Math.PI / 2);
        cap(p.at(-1),
            Math.atan2(p.at(-1)[1] - p.at(-2)[1], p.at(-1)[0] - p.at(-2)[0]) - Math.PI / 2);
      }
    }
  }
  releaseTexture(entry) {
    if (!entry?.texture)
      return;
    this.flush();
    const gl = this.gl;
    gl.deleteTexture(entry.texture);
    if (entry.framebuffer)
      gl.deleteFramebuffer(entry.framebuffer);
    if (entry.stencil)
      gl.deleteRenderbuffer(entry.stencil);
    this.textures.delete(entry);
    this.owner.textureBytes -= entry.bytes;
    entry.texture = entry.framebuffer = entry.stencil = null;
  }
  releaseImage(image) {
    const entry = this.images.get(image);
    if (entry)
      this.releaseTexture(entry);
    this.images.delete(image);
  }
  uploadTexture(entry, width, height, source, dom = true) {
    this.flush();
    const gl = this.gl;
    if (!entry?.texture) {
      entry = {texture : gl.createTexture(), bytes : 0};
      this.textures.add(entry);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, dom);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const param of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D, param, gl.CLAMP_TO_EDGE);
    try {
      if (dom)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      else
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                      source);
    } finally {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    this.owner.textureBytes += width * height * PIXEL_BYTES - entry.bytes;
    Object.assign(entry,
                  {width, height, bytes : width * height * PIXEL_BYTES, frame : this.owner.clock});
    return entry;
  }
  layerTexture(layer, entry) {
    this.flush();
    const gl = this.gl, prior = this.framebuffer || null;
    if (layer.width > this.textureLimit || layer.height > this.textureLimit)
      throw Error(t('renderer.zeichenflaecheUeberschreitetDieGrafikgrenze'));
    if (!entry?.texture) {
      entry = {
        texture : gl.createTexture(),
        framebuffer : gl.createFramebuffer(),
        stencil : gl.createRenderbuffer(),
        bytes : 0,
        renderer : new TankRenderer(layer, this.owner)
      };
      this.textures.add(entry);
      entry.renderer.framebuffer = entry.framebuffer;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    for (const param of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D, param, gl.LINEAR);
    for (const param of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D, param, gl.CLAMP_TO_EDGE);
    const resized = entry.width !== layer.width || entry.height !== layer.height;
    if (resized) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, layer.width, layer.height, 0, gl.RGBA,
                    gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, entry.stencil);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, layer.width, layer.height);
      this.owner.textureBytes += layer.width * layer.height * PIXEL_BYTES - entry.bytes;
      entry.bytes = layer.width * layer.height * PIXEL_BYTES;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, entry.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, entry.texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER,
                               entry.stencil);
    // A solid pass still has an active sampler in the shared vector shader.
    gl.bindTexture(gl.TEXTURE_2D, null);
    try {
      entry.renderer.beginFrame();
      layer.getContext().replay(entry.renderer);
      entry.renderer.endFrame();
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, prior);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.bindClip();
    }
    Object.assign(entry, {
      width : layer.width,
      height : layer.height,
      version : layer.tankRevision,
      frame : this.owner.clock,
      flip : true
    });
    return entry;
  }
  drawTintedImage(image, tint, ...args) {
    const prior = this.imageTint;
    this.imageTint = tint;
    try {
      this.drawImage(image, ...args);
    } finally {
      this.imageTint = prior;
    }
  }
  drawImage(image, ...args) {
    if (!image?.width || !image?.height)
      return;
    let sx = 0, sy = 0, sw = image.width, sh = image.height, x, y, w, h;
    if (args.length === 2) {
      [x, y] = args;
      w = sw;
      h = sh;
    } else if (args.length === 4)
      [x, y, w, h] = args;
    else
      [sx, sy, sw, sh, x, y, w, h] = args;
    if (!(w && h && sw && sh))
      return;
    const version = image.tankRevision || 0;
    let t = image.tankTexture || this.images.get(image);
    if (!image.tankTexture && (!t?.texture || t.version !== version || t.width !== image.width ||
                               t.height !== image.height)) {
      if (image instanceof TankLayer)
        t = this.layerTexture(image, t);
      else if (image instanceof TankPixelImage) {
        const bytes = image.premultiplied ? image.data : new Uint8Array(image.data);
        if (!image.premultiplied)
          for (let i = 0; i < bytes.length; i += PIXEL_BYTES) {
            const a = bytes[i + ALPHA] / CHANNEL_MAX;
            for (let k = 0; k < ALPHA; k++)
              bytes[i + k] = Math.round(bytes[i + k] * a);
          }
        t = this.uploadTexture(t, image.width, image.height, bytes, false);
      } else
        t = this.uploadTexture(t, image.width, image.height, image);
      t.version = version;
      this.images.set(image, t);
    }
    t.frame = this.owner.clock;
    this.select(PAINT.image, t.texture);
    const a = Math.max(0, Math.min(1, this.globalAlpha * this.layerAlpha)),
          q =
              [
                a * (this.imageTint?.[0] ?? 1), a * (this.imageTint?.[1] ?? 1),
                a * (this.imageTint?.[2] ?? 1), a
              ],
          points = [
            [ x, y, sx / image.width, sy / image.height ],
            [ x + w, y, (sx + sw) / image.width, sy / image.height ],
            [ x + w, y + h, (sx + sw) / image.width, (sy + sh) / image.height ],
            [ x, y + h, sx / image.width, (sy + sh) / image.height ]
          ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = points[i], v = tankPoint(this.transform, p[0], p[1]), region = image.region,
            u = region ? region[0] + p[2] * region[2] : p[2],
            ty = region   ? region[1] + (1 - p[3]) * region[3]
                 : t.flip ? 1 - p[3]
                          : p[3];
      this.vertex(...v, u, ty, q);
    }
  }
  fillText(value, x, y, maxWidth) {
    const key = this.font + ':' + this.fillStyle + ':' + value;
    let label = this.labels.get(key);
    if (!label) {
      const c = document.createElement('canvas'),
            g = c.getContext('2d', {willReadFrequently : true});
      g.font = this.font;
      const metrics = g.measureText(String(value)),
            size = Number(this.font.match(/[\d.]+/)?.[0]) || LABEL.font_size,
            baseline = size * LABEL.baseline + LABEL.pad;
      c.width = Math.max(1, Math.ceil(metrics.width + 2 * LABEL.pad));
      c.height = Math.ceil(size * LABEL.line + 2 * LABEL.pad);
      g.font = this.font;
      g.fillStyle = this.fillStyle;
      g.textBaseline = 'alphabetic';
      g.fillText(String(value), LABEL.pad, baseline);
      label = {image : c, width : metrics.width, baseline};
      this.labels.set(key, label);
      if (this.labels.size > RENDER.labels) {
        const oldest = this.labels.keys().next().value;
        this.releaseImage(this.labels.get(oldest).image);
        this.labels.delete(oldest);
      }
    }
    let left = x - LABEL.pad;
    if ([ 'center' ].includes(this.textAlign))
      left -= label.width / 2;
    else if ([ 'right', 'end' ].includes(this.textAlign))
      left -= label.width;
    this.drawImage(label.image, left, y - label.baseline);
  }
  measureText(value) {
    const g = this.owner.textMeasure ??=
        (document.createElement('canvas').getContext('2d', {willReadFrequently : true}));
    g.font = this.font;
    return g.measureText(String(value));
  }
}

export function createTankRenderer(canvas) {
  try {
    return new TankRenderer(canvas);
  } catch (error) {
    const node = document.getElementById('error');
    if (node)
      node.textContent = error.message;
    throw error;
  }
}

export function touchTankImage(image) {
  if (image)
    image.tankRevision = (image.tankRevision || 0) + 1;
}

const initializers = {
  "tankVertexSource" : () => {
    // One WebGL context owns the tank, vector organs, particles and cached image textures.
    tankVertexSource = `#version 300 es
precision highp float;
${attributeInputs(VERTEX_ATTRIBUTES)}
uniform vec2 viewport;
out vec2 texcoord;
out vec4 color;
flat out vec2 shape;
void main(){texcoord=uv;color=rgba;shape=primitive;gl_Position=vec4(position.x/viewport.x*2.-1.,1.-position.y/viewport.y*2.,0,1);}`;
  },
  "tankFragmentSource" : () => {
    tankFragmentSource = `#version 300 es
precision highp float;
in vec2 texcoord;
in vec4 color;
flat in vec2 shape;
uniform sampler2D image;
uniform int mode;
uniform vec3 dashPattern;
out vec4 fragment;
void main(){if(mode==${
        PAINT
            .dash}&&mod(texcoord.x+dashPattern.z,dashPattern.x+dashPattern.y)>dashPattern.x)discard;vec2 uv=mode==${
        PAINT.linear}?vec2(texcoord.x,.5):mode==${
        PAINT.radial}?vec2(length(texcoord),.5):texcoord;fragment=mode==${PAINT.solid}||mode==${
        PAINT.dash}?color:texture(image,uv)*color;if(mode==${PAINT.solid}&&shape.x>${
        SHAPE.none.toFixed(
            1)}){float d=length(texcoord),w=max(.001,fwidth(d));float a=1.-smoothstep(1.-w,1.+w,d);if(shape.x>${
        ((SHAPE.disc + SHAPE.ring) /
         2).toFixed(1)})a*=smoothstep(shape.y-w,shape.y+w,d);fragment*=a;}}`;
  },
  "tankIdentity" : () => { tankIdentity = () => [1, 0, 0, 1, 0, 0]; },
  "tankPoint" :
      () => { tankPoint = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
