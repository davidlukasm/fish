import {wrapAngle} from './units.js';
import {fishVegetationLayer} from './plant_geometry.js';
import {
  ANATOMY,
  COMBAT,
  CORPSE,
  FEEDING_EFFECT,
  FEEDING_EFFECT_STEPS,
  FIN,
  FIN_SHAPE,
  FISH,
  ROUTE,
  TOLERANCE
} from './schema.js';
import {FIN_STROKE, FINS, tailDirection} from './fin_stroke.js';
import {brainState, brainVisible} from './brain.js';
import {brainPresentationFish} from './brain_signals.js';
import {cameraState, worldToScreen} from './camera.js';
import {canvas, ctx} from './dom.js';
import {collectCombat, effectsState} from './effects.js';
import {
  fishBoundingRadius,
  fishFinShapes,
  fishFinTriangles,
  fishPattern,
  fishRearFinShape,
  fishRenderRadius,
  fishTint,
  PATTERN_KIND
} from './fish_fins.js';
import {
  fishFeedingPose,
  fishSnapshotAnatomy,
  PATTERN,
  PATTERN_INK,
  PATTERN_SPOTS,
  SNAPSHOT
} from './fish_forms.js';
import {fishBezier, fishBodyCurves, fishEmbryo} from './fish_geometry.js';
import {
  fishBarbel,
  fishDefenseSpines,
  fishEye,
  fishFinShape,
  fishGillShape,
  fishGlyphBounds,
  fishGlyphExtent,
  fishMouthShape,
  fishMouthContour,
  fishTeeth,
  fishJawEdge,
  fishCheekPoint,
  fishNoseShape,
  fishProximityPits
} from './fish_organs.js';
import {corpseFish, fishSkeletonPath} from './fish_painter.js';
import {
  attributeInputs,
  attributeLayout,
  glsl,
  glslConstants,
  QUAD_VERTICES,
  TankBatch,
  TankPath
} from './renderer.js';
import {blendFish, displayStep, horizontalDelta, sceneState, wrapScreenX} from './state.js';
import {displayLight, clipSediment} from './water_view.js';
export const animalsState = {};
// Animals share one world-space mesh atlas of ATLAS.width by ATLAS.height texels of TEXEL floats,
// one instance format and camera transform; detail levels sample the same contours and zoom never
// changes a cached body's size. Each model starts with ATLAS.header texels (HEADER: its levels,
// bounds, two texels of body widths, outline, pattern, accent, both eye colours, origin and mouth),
// then its vertices of MESH_VERTEX layout.
const TEXEL = 4;
export const ATLAS = Object.freeze({width : 1024, height : 2048, header : 16});
const HEADER = Object.freeze({
  levels : 0,
  bounds : 1,
  widths : 2,
  outline : 4,
  pattern : 5,
  accent : 6,
  eye_left : 7,
  eye_right : 8,
  origin : 9,
  mouth : 10
});
const PROFILE_WIDTHS = 2 * TEXEL;
// Mesh vertex: rest and open point, uv, material, drive, suction point and an anchor.
const MESH_VERTEX = [
  [ 'rest', 2 ], [ 'open', 2 ], [ 'uv', 2 ], [ 'material', 1 ], [ 'drive', 1 ], [ 'suction', 2 ],
  [ 'anchor', 2 ]
];
const VERTEX_FLOATS = attributeLayout(MESH_VERTEX).floats, VERTEX_TEXELS = VERTEX_FLOATS / TEXEL;
// Mesh materials as the fragment shader paints them; drives as the vertex shader moves them (fins
// drive by FIN index from TAIL on).
const MATERIAL = Object.freeze({
  body : 0,
  fin : 1,
  eye : 2,
  spine : 3,
  egg : 4,
  mouth : 5,
  nose : 6,
  barbel : 7,
  bone : 8,
  tooth : 9,
  silhouette : 10,
  lip : 11,
  cheek : 12,
  gill : 13
});
const DRIVE = Object.freeze(
    {none : 0, tail : 1, left_fin : 2, right_fin : 3, spine : 4, mouth : 5, gill : 6, tooth : 7});
// Instance kinds: eggs, fish, embryos inside their eggs and corpses.
export const ANIMAL_KIND = Object.freeze({egg : 0, fish : 1, embryo : 1.25, corpse : 2});
// Instances: pose, tint, muscles, state, status, face, extra and movement.
const ANIMAL_ATTRIBUTES =
    [ 'pose', 'tint', 'muscles', 'state', 'status', 'face', 'extra', 'movement' ].map(
        name => [name, TEXEL]);
const ANIMAL_FLOATS = attributeLayout(ANIMAL_ATTRIBUTES).floats;
// Body widths are sampled at PROFILE_WIDTHS points from tail to snout, the curves at
// CURVE_SAMPLES points each; eye colours run from EYE_TINT.base over EYE_TINT.span.
const MESH = Object.freeze({
  curve_samples : 4,
  steps : 2,
  detail_steps : 5,
  cheek_strips : 8,
  min_jaw : .15,
  mouth_points : 5,
  detail_mouth_points : 12,
  gill_segments : 4,
  detail_gill_segments : 8,
  gill_lift : [ .018, .006 ],
  barbel_points : 5,
  detail_barbel_points : 9,
  barbel_width : .010,
  bone_width : .010,
  min_reach : .01
});
const EYE_TINT = Object.freeze({base : .22, span : .48});

export let animalVertex;

export let animalFragment;

export let animalMeshes;

function animalProfile(a) {
  const widths = Array(PROFILE_WIDTHS).fill(0), rear = a.tailRoot, front = a.snout,
        points = fishBodyCurves(a).flatMap(
            q => Array.from({length : MESH.curve_samples},
                            (_, k) => fishBezier(q, k / MESH.curve_samples)));
  for (let k = 0; k < PROFILE_WIDTHS; k++) {
    const x = rear + (front - rear) * k / (PROFILE_WIDTHS - 1);
    for (let j = 0; j < points.length; j++) {
      const p = points[j], q = points[(j + 1) % points.length];
      if (x < Math.min(p[0], q[0]) - TOLERANCE.negligible ||
          x > Math.max(p[0], q[0]) + TOLERANCE.negligible)
        continue;
      const t = Math.max(0, Math.min(1, (x - p[0]) / (q[0] - p[0] || TOLERANCE.negligible)));
      widths[k] = Math.max(widths[k], Math.abs(p[1] + (q[1] - p[1]) * t));
    }
  }
  let length = 0, width = 0;
  if (a.fin(FIN.tail)[FIN_SHAPE.strength] > 0)
    for (const q of fishFinShape(a, FIN.tail).curves)
      for (const p of q) {
        length = Math.max(length, rear - p[0]);
        width = Math.max(width, Math.abs(p[1]));
      }
  return {widths, outline : [ rear, front, length, width ]};
}

export function animalMesh(a, level) {
  let records = animalMeshes.get(a);
  if (!records) {
    records = [];
    animalMeshes.set(a, records);
  }
  if (records[level])
    return records[level];
  const neutral = records.neutral ??= {
    ...a,
    finShapeCache : null,
    finPose : () => 0,
    tailDirection : 1,
    flex : 0,
    defenseActivity : 0
  },
        full = records.full ??= {
          ...a,
          finShapeCache : null,
          finPose : () => 1,
          tailDirection : 1,
          flex : 0,
          defenseActivity : 1
        },
        profile = records.profile ??= animalProfile(neutral),
        bounds = records.bounds ??= fishGlyphBounds(full), pattern = fishPattern(a),
        header = new Float32Array(ATLAS.header * TEXEL), H = HEADER, A = ANATOMY,
        eyeTint = columns => columns.map(k => EYE_TINT.base + EYE_TINT.span * a.organs[k]);
  header.set([ bounds.left, bounds.top, bounds.right, bounds.bottom ], H.bounds * TEXEL);
  header.set(profile.widths, H.widths * TEXEL);
  header.set(profile.outline, H.outline * TEXEL);
  header.set([ pattern.kind, pattern.phase, pattern.count, pattern.amount ], H.pattern * TEXEL);
  header.set([...pattern.accent, 1 ], H.accent * TEXEL);
  header.set([...eyeTint([ A.red_left, A.green_left, A.blue_left ]), fishEye(a, 0).pupil ],
             H.eye_left * TEXEL);
  header.set([...eyeTint([ A.red_right, A.green_right, A.blue_right ]), fishEye(a, 1).pupil ],
             H.eye_right * TEXEL);
  header.set(a.origin || [ 0, 0 ], H.origin * TEXEL);
  header.set([ a.teeth, a.jaw, a.armor, a.gutFilling ], H.mouth * TEXEL);
  const build = detail => {
    const vertices = [], steps = detail ? MESH.detail_steps : MESH.steps,
          emit = (p, q = p, material = MATERIAL.body, drive = DRIVE.none, uv = [ 0, 1 ],
                  suction = p) =>
              vertices.push(...p, ...q, ...uv, material, drive, ...suction, 0, 0),
          triangle =
              (p, q = p, material = MATERIAL.body, drive = DRIVE.none, uv = null, suction = p) => {
                for (let i = 0; i < 3; i++)
                  emit(p[i], q[i], material, drive, uv?.[i] || [ 0, 1 ], suction[i]);
              },
          fan =
              (curves, material, drive = DRIVE.none, other = curves) => {
                const n = curves.length * steps,
                      at = (q, k) =>
                          fishBezier(q[Math.min(q.length - 1, Math.floor(k / steps) % q.length)],
                                     (k % steps) / steps);
                for (let k = 0; k < n; k++)
                  triangle([ [ 0, 0 ], at(curves, k), at(curves, (k + 1) % n) ],
                           [ [ 0, 0 ], at(other, k), at(other, (k + 1) % n) ], material, drive,
                           [ [ 0, 0 ], [ 0, 1 ], [ 0, 1 ] ]);
              },
          quad = (x, y, rx, ry, material, drive = DRIVE.none, bite = null, suction = null,
                  eyeSide = 0) => {
            const points = [ [ -1, -1 ], [ 1, -1 ], [ 1, 1 ], [ -1, -1 ], [ 1, 1 ], [ -1, 1 ] ];
            for (const [u, v] of points) {
              const p = [ x + u * rx, y + v * ry ],
                    q = bite ? [ bite[0] + u * bite[2], bite[1] + v * bite[3] ] : p,
                    s = suction ? [ suction[0] + u * suction[2], suction[1] + v * suction[3] ] : p;
              emit(p, q, material, drive, [ u + eyeSide * SCENE.eye_uv, v ], s);
              if (material === MATERIAL.eye) {
                vertices[vertices.length - 2] = x;
                vertices[vertices.length - 1] = y;
              }
            }
          };
    // Membranes are triangulated from their outline, including forked and concave fins.
    for (let index = 0; index < FINS; index++)
      if (a.fin(index)[FIN_SHAPE.strength] > 0) {
        const rest = fishFinShapes(neutral, index), open = fishFinShapes(full, index);
        for (let lobe = 0; lobe < rest.length; lobe++) {
          const mesh = fishFinTriangles(rest[lobe], steps),
                wide = fishFinTriangles(open[lobe], steps), root = rest[lobe].root,
                reach =
                    Math.max(MESH.min_reach,
                             ...mesh.points.map(q => Math.hypot(q[0] - root[0], q[1] - root[1])));
          for (const k of mesh.indices) {
            const p = mesh.points[k], dx = p[0] - root[0], dy = p[1] - root[1];
            emit(p, wide.points[k], MATERIAL.fin, DRIVE.tail + index, [ dx / reach, dy / reach ]);
          }
        }
      }
    for (const side of [0, 1])
      fan(fishRearFinShape(a, side), MATERIAL.fin);
    fan(fishBodyCurves(a), MATERIAL.body);
    if (detail)
      for (const side of [0, 1]) {
        const rest = fishDefenseSpines(neutral, side), open = fishDefenseSpines(full, side);
        for (let k = 0; k < rest.length; k++)
          for (let j = 1; j + 1 < rest[k].length; j++)
            triangle([ rest[k][0], rest[k][j], rest[k][j + 1] ],
                     [ open[k][0], open[k][j], open[k][j + 1] ], MATERIAL.spine, DRIVE.spine);
      }
    {
      const poses = [
        {...a, mouthShapeCache : null, mouthOpening : 0, bitePose : 0, swallowPose : 0},
        {...a, mouthShapeCache : null, mouthOpening : 1, bitePose : 1, swallowPose : 0},
        {...a, mouthShapeCache : null, mouthOpening : 1, bitePose : 0, swallowPose : 1}
      ];
      if (level > 0)
        for (const side of [0, 1])
          if (a.attackSides[side] > 0 || a.jaw > MESH.min_jaw)
            for (let k = 0; k < MESH.cheek_strips; k++) {
              const n = MESH.cheek_strips,
                    coords = [ [ k / n, 0 ], [ (k + 1) / n, 0 ], [ (k + 1) / n, 1 ], [ k / n, 1 ] ],
                    strips =
                        poses.map(p => coords.map(([ t, w ]) => fishCheekPoint(p, side, t, w)));
              for (const ids of [[ 0, 1, 2 ], [ 0, 2, 3 ]])
                triangle(ids.map(i => strips[0][i]), ids.map(i => strips[1][i]), MATERIAL.cheek,
                         DRIVE.mouth, ids.map(i => coords[i]), ids.map(i => strips[2][i]));
            }
      if (a.jaw || a.attack) {
        const n = detail ? MESH.detail_mouth_points : MESH.mouth_points,
              shapes = poses.map(p => fishMouthShape(p)),
              contours = poses.map(p => fishMouthContour(p, n)),
              centers = shapes.map(q => [(q.front + q.back) / 2, 0]);
        for (let k = 0; k < contours[0].length; k++) {
          const j = (k + 1) % contours[0].length;
          triangle(
              [ centers[0], contours[0][k], contours[0][j] ],
              [ centers[1], contours[1][k], contours[1][j] ], MATERIAL.mouth, DRIVE.mouth,
              [
                [ .5, 0 ],
                ...[k, j].map(
                    i => [(contours[1][i][0] - shapes[1].back) / (shapes[1].front - shapes[1].back),
                          contours[1][i][1] / shapes[1].gap])
              ],
              [ centers[2], contours[2][k], contours[2][j] ]);
          const rims = contours.map(
              (line,
               i) => [line[k], line[j],
                      [ line[j][0], line[j][1] + Math.sign(line[j][1] || 1) * shapes[i].lip ],
                      [ line[k][0], line[k][1] + Math.sign(line[k][1] || 1) * shapes[i].lip ]]);
          for (const indices of [[ 0, 1, 2 ], [ 0, 2, 3 ]])
            triangle(indices.map(i => rims[0][i]), indices.map(i => rims[1][i]), MATERIAL.lip,
                     DRIVE.mouth, null, indices.map(i => rims[2][i]));
        }
      }
      for (const side of [0, 1]) {
        const biting = fishTeeth(poses[1], side), sucking = fishTeeth(poses[2], side);
        biting.forEach((tooth, k) => {
          if (!detail && k % 2)
            return;
          const tube = sucking[k] || tooth, rest = fishJawEdge(poses[0], side, tooth.along);
          for (let j = 1; j + 1 < tooth.length; j++)
            for (const index of [0, j, j + 1]) {
              emit([ rest[0] + tooth[index][0] - tooth.base[0], 0 ], tooth[index], MATERIAL.tooth,
                   DRIVE.tooth, [ 0, 0 ], tube[index]);
              vertices[vertices.length - 2] = tooth[0][1];
              vertices[vertices.length - 1] = tube[0][1];
            }
        });
      }
      for (const side of [0, 1])
        if (a.organs[side + 1]) {
          const e = fishEye(a, side);
          quad(e.x, e.y, e.rx, e.ry, MATERIAL.eye, DRIVE.none, null, null, side);
        }
      for (const side of [0, 1])
        if (a.noseSides[side]) {
          const n = fishNoseShape(a, side);
          quad(n.x, n.y, n.rx, n.ry, MATERIAL.nose);
        }
      // The near sense: a crescent of small sensory pits behind the eye.
      for (const side of [0, 1])
        for (const pit of fishProximityPits(a, side))
          quad(pit.x, pit.y, pit.r, pit.r, MATERIAL.nose);
    }
    for (const side of [0, 1]) {
      const rest = fishGillShape(a, side, 0), open = fishGillShape(a, side, 1),
            sign = side ? 1 : -1,
            segments = detail ? MESH.detail_gill_segments : MESH.gill_segments,
            [ lift_x, lift_y ] = MESH.gill_lift;
      for (let k = 0; k < segments; k++) {
        const points = [ k / segments, (k + 1) / segments ].map(t => fishBezier(rest, t)),
              raised = [ k / segments, (k + 1) / segments ].map(t => fishBezier(open, t)),
              strip = q => [q[0], q[1], [ q[1][0] + lift_x, q[1][1] + sign * lift_y ],
                            [ q[0][0] + lift_x, q[0][1] + sign * lift_y ]],
              flat = strip(points), lifted = strip(raised);
        for (const ids of [[ 0, 1, 2 ], [ 0, 2, 3 ]])
          triangle(ids.map(i => flat[i]), ids.map(i => lifted[i]), MATERIAL.gill, DRIVE.gill);
      }
    }
    for (const side of [0, 1])
      if (a.barbelSides[side]) {
        const count = detail ? MESH.detail_barbel_points : MESH.barbel_points,
              points =
                  Array.from({length : count},
                             (_, k) => fishBarbel(
                                 {...a, animationPhase : 0, waterMotion : 0, staticBarbel : true},
                                 side, k / (count - 1)));
        for (let j = 1; j < points.length; j++) {
          const p = points[j - 1], q = points[j], dx = q[0] - p[0], dy = q[1] - p[1],
                len = Math.max(TOLERANCE.negligible, Math.hypot(dx, dy)),
                nx = -dy / len * MESH.barbel_width, ny = dx / len * MESH.barbel_width, v = [
                  [ p[0] + nx, p[1] + ny ], [ p[0] - nx, p[1] - ny ], [ q[0] - nx, q[1] - ny ],
                  [ q[0] + nx, q[1] + ny ]
                ];
          for (const k of [0, 1, 2, 0, 2, 3])
            emit(v[k], v[k], MATERIAL.barbel, DRIVE.none,
                 [ j / (points.length - 1), side ? 1 : -1 ]);
        }
      }
    // The skeleton is geometry in the same atlas; remains never allocate body/bone images.
    const skeleton = new TankPath();
    fishSkeletonPath(skeleton, 1, a);
    for (const path of skeleton.paths)
      for (let i = 1; i < path.points.length; i++) {
        const p = path.points[i - 1], q = path.points[i], dx = q[0] - p[0], dy = q[1] - p[1],
              length = Math.hypot(dx, dy);
        if (length < TOLERANCE.precision)
          continue;
        const w = MESH.bone_width, normal = [ -dy / length * w, dx / length * w ], v = [
          [ p[0] + normal[0], p[1] + normal[1] ], [ p[0] - normal[0], p[1] - normal[1] ],
          [ q[0] - normal[0], q[1] - normal[1] ], [ q[0] + normal[0], q[1] + normal[1] ]
        ];
        for (const k of [0, 1, 2, 0, 2, 3])
          emit(v[k], v[k], MATERIAL.bone);
      }
    return vertices;
  };
  const near = level > 0 ? build(false) : [], high = level > 1 ? build(true) : near,
        data = new Float32Array(header.length + near.length + (level > 1 ? high.length : 0));
  data.set(header);
  data.set([
    ATLAS.header, near.length / VERTEX_FLOATS, ATLAS.header + near.length / TEXEL,
    high.length / VERTEX_FLOATS
  ]);
  data.set(near, header.length);
  if (level > 1)
    data.set(high, header.length + near.length);
  else
    data[2] = ATLAS.header;
  return records[level] = {
    data,
    vertices : [ QUAD_VERTICES, near.length / VERTEX_FLOATS, high.length / VERTEX_FLOATS ],
    bounds
  };
}

// Hurt fish flash for STEPS steps, pulsing PULSES times between BASE and BASE + PULSE.
const DAMAGE_FLASH = Object.freeze({steps : 24, pulses : 3, base : .25, pulse : .55});
const HURTING = [ FEEDING_EFFECT.none, FEEDING_EFFECT.wound, FEEDING_EFFECT.pinch ];
function animalDamageFlash(p, step = displayStep(sceneState.frame)) {
  const D = DAMAGE_FLASH;
  let flash = 0;
  for (const {event, born} of effectsState.combatEffects)
    if (event[COMBAT.target] === p[FISH.id] && HURTING.includes(event[COMBAT.kind])) {
      const t = (step - born) / D.steps;
      if (t >= 0 && t < 1)
        flash = Math.max(flash,
                         (1 - t) ** 2 * (D.base + D.pulse * Math.sin(Math.PI * D.pulses * t) ** 2));
    }
  return flash;
}

// Detail levels by screen radius, with hysteresis: near detail from NEAR_UP pixels (kept down to
// NEAR_DOWN), high detail from HIGH_UP (kept down to HIGH_DOWN); REMEMBERED levels are kept and
// at most BUILDS meshes are built at once.
const LOD = Object.freeze(
    {near_up : 5.3, near_down : 3.8, high_up : 41, high_down : 32, remembered : 4096, builds : 16});
// Body waves: the amplitude follows undulation from BASE, rising with speed per SPEED and the tail
// stroke; the phase advances by RATE plus the undulation and a per-fish spread.
const WAVE = Object.freeze({
  base : .025,
  speed : 1.5,
  stroke : .3,
  rate : .065,
  rate_undulation : .08,
  rate_spread : .018,
  rate_kinds : 7,
  phase_kinds : 11
});
export class AnimalRenderer extends TankBatch {
  constructor() {
    super(canvas, ctx, animalVertex, animalFragment, ANIMAL_ATTRIBUTES.map(([, size ]) => size),
          [ 'viewport', 'offset', 'scale', 'lod', 'atlas' ]);
    const gl = this.gl;
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ATLAS.width, ATLAS.height, 0, gl.RGBA, gl.FLOAT,
                  null);
    this.rows = new Map();
    this.cursor = 0;
    this.instances = new Float32Array(0);
    this.count = 0;
    this.previousModels = new Map();
    this.builds = new Map();
    this.buildSequence = 0;
    this.queued = new WeakSet();
    if (typeof Worker !== 'undefined') {
      try {
        this.builder = new Worker(ROUTE.assets + 'animal_worker.js', {type : 'module'});
      } catch {
        this.builder = null;
      }
    }
    if (this.builder) {
      this.builder.onmessage = ({data}) => {
        const build = this.builds.get(data.ticket);
        if (!build)
          return;
        this.builds.delete(data.ticket);
        this.queued.delete(build.anatomy);
        if (data.error) {
          this.stopBuilder();
          return;
        }
        const records = animalMeshes.get(build.anatomy) || [];
        const model = data.model;
        records[0] = {
          ...model,
          data : model.data.subarray(0, ATLAS.header * TEXEL),
          vertices : [ QUAD_VERTICES, 0, 0 ]
        };
        if (build.level > 0)
          records[1] = {
            ...model,
            data :
                model.data.subarray(0, (ATLAS.header + model.vertices[1] * VERTEX_TEXELS) * TEXEL),
            vertices : [ QUAD_VERTICES, model.vertices[1], 0 ]
          };
        if (build.level > 1)
          records[2] = model;
        animalMeshes.set(build.anatomy, records);
      };
      this.builder.onerror = () => this.stopBuilder();
    }
  }
  stopBuilder() {
    this.builder?.terminate();
    this.builder = null;
    this.builds.clear();
    this.queued = new WeakSet();
  }
  model(anatomy, level, item) {
    const cached = animalMeshes.get(anatomy)?.[level];
    if (cached)
      return cached;
    const previous = this.previousModels.get(item.kind + ':' + item.p[FISH.id])?.model;
    if (!this.builder || !anatomy.snapshot)
      return animalMesh(anatomy, level);
    if (level === 0)
      return animalMesh(anatomy, 0);
    if (!this.queued.has(anatomy) && this.builds.size < LOD.builds) {
      const ticket = ++this.buildSequence;
      this.queued.add(anatomy);
      this.builds.set(ticket, {anatomy, level});
      this.builder.postMessage({
        ticket,
        level,
        fish : anatomy.snapshot,
        shapePlans : anatomy.snapshot.shapePlans,
        parameters : {vision_eye_offset : anatomy.eyeOffset}
      });
    }
    // Keep a stable model while the requested detail is built. New objects use
    // the same six-vertex contour as the overview until their mesh is ready.
    return animalMeshes.get(anatomy)?.[level - 1] || previous || animalMesh(anatomy, 0);
  }
  paint(items, c, shifts, f = sceneState.frame, blend = 1) {
    if (this.epoch !== sceneState.frame?.render_epoch) {
      this.epoch = sceneState.frame?.render_epoch;
      this.previousModels.clear();
    }
    if (this.sweepClock !== ctx.clock) {
      this.sweepClock = ctx.clock;
      for (const [key, entry] of this.previousModels)
        if (entry.frame < ctx.clock - 1)
          this.previousModels.delete(key);
    }
    if (!items.length || this.gl.isContextLost()) {
      this.count = 0;
      return;
    }
    const gl = this.gl;
    const unique = new Map(), representatives = new Map();
    for (const item of items) {
      const levels = this.lodLevels ??= new Map(), key = item.kind + ':' + item.p[FISH.id],
            px = item.r * c.scale, old = levels.get(key),
            lo = old === 0 ? LOD.near_up : LOD.near_down,
            hi = old === 2 ? LOD.high_down : LOD.high_up;
      item.level = item.kind === ANIMAL_KIND.egg ? 0 : px < lo ? 0 : px < hi ? 1 : 2;
      levels.set(key, item.level);
      if (levels.size > LOD.remembered)
        levels.clear();
      unique.set(item.a, Math.max(unique.get(item.a) || 0, item.level));
      representatives.set(item.a, item);
    }
    let total = 0, limit = 2, records;
    do {
      records = new Map(
          [...unique ]
              .filter(([ a ]) => a)
              .map(([ a, l ]) => [a, this.model(a, Math.min(l, limit), representatives.get(a))]));
      total = [...records.values() ].reduce((sum, r) => sum + r.data.length / TEXEL, ATLAS.header);
      if (total <= ATLAS.width * ATLAS.height)
        break;
      limit--;
    } while (limit >= 0);
    const egg = animalEggMesh, models = [ egg, ...records.values() ],
          missing = models.filter(m => !this.rows.has(m));
    if (this.cursor + missing.reduce((n, m) => n + m.data.length / TEXEL, 0) >
        ATLAS.width * ATLAS.height) {
      this.rows.clear();
      this.cursor = 0;
    }
    ctx.beginExternal();
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    for (const model of models)
      if (!this.rows.has(model)) {
        const start = this.cursor, texels = model.data.length / TEXEL;
        this.rows.set(model, start);
        let at = 0;
        while (at < texels) {
          const index = start + at, x = index % ATLAS.width, y = Math.floor(index / ATLAS.width),
                count = Math.min(texels - at, ATLAS.width - x);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, count, 1, gl.RGBA, gl.FLOAT,
                           model.data.subarray(at * TEXEL, (at + count) * TEXEL));
          at += count;
        }
        this.cursor += texels;
      }
    const groups = [ [], [], [] ];
    for (const item of items) {
      const model = item.a ? records.get(item.a) : egg;
      while (item.level > 0 && !model.vertices[item.level])
        item.level--;
      if (item.a)
        this.previousModels.set(item.kind + ':' + item.p[FISH.id], {model, frame : ctx.clock});
      groups[Math.min(item.level, limit)].push(item);
    }
    // Group similar mesh sizes so one elaborate animal does not pad every other instance.
    const batches = groups.flatMap((items, level) => {
      const sizes = new Map();
      for (const v of items) {
        const n = level ? (v.a ? records.get(v.a) : egg).vertices[level] : QUAD_VERTICES,
              key = level ? Math.ceil(Math.log2(Math.max(QUAD_VERTICES, n))) : 0;
        let batch = sizes.get(key);
        if (!batch) {
          batch = {level, count : 0, items : []};
          sizes.set(key, batch);
        }
        batch.count = Math.max(batch.count, n);
        batch.items.push(v);
      }
      return Array.from(sizes.values());
    });
    const ordered = batches.flatMap(b => b.items);
    if (this.instances.length < ordered.length * ANIMAL_FLOATS)
      this.instances = new Float32Array(
          2 ** Math.ceil(Math.log2(Math.max(ANIMAL_FLOATS, ordered.length * ANIMAL_FLOATS))));
    let at = 0;
    const W = WAVE;
    for (const v of ordered) {
      const p = v.p, a = v.a, model = a ? records.get(a) : egg,
            color = a ? fishTint(p, a) : p.slice(FISH.red, FISH.blue + 1),
            facePose = fishFeedingPose(p, displayStep(sceneState.frame));
      this.instances.set(
          [
            p[FISH.x],
            p[FISH.y],
            p[FISH.angle],
            v.r,
            ...color,
            v.light,
            ...[0, 1, 2].map(k => Math.max(0, Math.min(1, p[FISH.fin_pose]?.[k] || 0))),
            p[FISH.defense] || 0,
            this.rows.get(model),
            v.kind,
            v.opacity ?? 1,
            v.meat ?? 1,
            p[FISH.development] || 0,
            !p[FISH.nutrient_egg] && (p[FISH.fertilised] || p[FISH.clonal]) ? 1 : 0,
            p[FISH.disease] > 0 ? 1 : 0,
            1 - Math.max(0, Math.min(1, p[FISH.health] ?? 1)),
            facePose.mouthOpening,
            facePose.bitePose,
            facePose.swallowPose,
            v.kind === ANIMAL_KIND.fish ? animalDamageFlash(p) : 0,
            p.birthShape ? p.birthShape.rx / (p[FISH.radius] || 1) : 1,
            p.birthShape ? p.birthShape.ry / (p[FISH.radius] || 1) : 1,
            tailDirection(p[FISH.fin_pose]?.[FINS]),
            v.clip ?? v.fade ?? 1,
            v.kind === ANIMAL_KIND.fish
                ? (a?.undulation || 0) *
                      Math.min(1, W.base + (p[FISH.relative_speed] || 0) / W.speed +
                                      W.stroke * (p[FISH.fin_pose]?.[FIN.tail] || 0))
                : 0,
            displayStep(f, blend) * (W.rate + W.rate_undulation * (a?.undulation || 0) +
                                     W.rate_spread * (p[FISH.id] % W.rate_kinds) / W.rate_kinds) +
                p[FISH.id] % W.phase_kinds,
            p[FISH.feeding_action] || 0,
            v.kind === ANIMAL_KIND.corpse
                ? (v.collapse || 0)
                : (p[FISH.feeding_action_age] || 0) / FEEDING_EFFECT_STEPS.full
          ],
          at);
      at += ANIMAL_FLOATS;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instances.subarray(0, at), gl.DYNAMIC_DRAW);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.viewport, cameraState.viewportWidth, cameraState.viewportHeight);
    gl.uniform1f(this.uniforms.scale, c.scale);
    gl.uniform1i(this.uniforms.atlas, 0);
    let first = 0;
    for (const batch of batches) {
      const {level, count, items : group} = batch;
      this.attributes(first);
      gl.uniform1i(this.uniforms.lod, level);
      for (const shift of shifts) {
        gl.uniform2f(this.uniforms.offset, c.ox + shift * c.scale, c.oy);
        this.submit(gl.TRIANGLES, count, group.length);
      }
      first += group.length;
    }
    this.count = ordered.length;
    ctx.endExternal();
  }
}

export let animalEggMesh;
// Scene animals: the right eye's uv is shifted by EYE_UV; fish seen through sediment are REVEALED
// opaque; embryos show from EMBRYO_PIXELS and EMBRYO_DEVELOPMENT on, lit from EMBRYO_LIGHT; the
// inspected fish fades by INSPECTED_FADE; corpse meat follows MEAT_CURVE and corpses vanish below
// MIN_VISIBLE.
const SCENE = Object.freeze({
  eye_uv : 4,
  revealed : .85,
  embryo_pixels : 10,
  embryo_development : .08,
  embryo_light : .25,
  embryo_light_growth : .5,
  inspected_fade : .65,
  meat_curve : .65,
  min_visible : .005
});

function animalItem(p, c, kind = ANIMAL_KIND.fish, a = null) {
  const screen = worldToScreen({x : p[FISH.x], y : p[FISH.y]}, c),
        bound = fishBoundingRadius(p) * c.scale + 2;
  if (screen.y + bound < 0 || screen.y - bound > cameraState.viewportHeight ||
      screen.x + bound < 0 || screen.x - bound > cameraState.viewportWidth)
    return null;
  const r = fishRenderRadius(p);
  a = p[FISH.hatched] ? (a || fishSnapshotAnatomy(p, Math.min(SNAPSHOT.pixels, r * c.scale)))
                      : null;
  const extent = a ? fishGlyphExtent(a) : 1, margin = r * c.scale * extent + 2;
  if (screen.y + margin < 0 || screen.y - margin > cameraState.viewportHeight ||
      screen.x + margin < 0 || screen.x - margin > cameraState.viewportWidth)
    return null;
  return {p, a, r, extent, kind, light : displayLight(sceneState.frame, p[FISH.x], p[FISH.y])};
}

// Buried fish seen through the hovered, see-through sediment: no sediment mask, a little faded.
export function paintRevealedAnimals(items, c, shifts, f, blend) {
  animalsState.gpuAnimals.paint(
      items.map(v => ({...v, opacity : SCENE.revealed * (v.opacity ?? 1)})), c, shifts, f, blend);
}

export function paintAnimals(f, c, blend, shifts, remains = false, layer = null) {
  if (!remains && layer && typeof layer === 'object') {
    ctx.save();
    clipSediment(f, c, ctx, shifts, blend, layer.items);
    animalsState.gpuAnimals.paint(layer.items, c, shifts, f, blend);
    ctx.restore();
    return layer.items;
  }
  if (!remains && layer !== null && layer >= 0) {
    const items = (animalsState.depthItems || []).filter(v => v.depthLayer === layer);
    ctx.save();
    clipSediment(f, c, ctx, shifts, blend, items);
    animalsState.gpuAnimals.paint(items, c, shifts, f, blend);
    ctx.restore();
    return items;
  }
  const items = [];
  if (!remains) {
    animalsState.animalSceneFish = new Map();
    collectCombat(f);
    for (const raw of f.fish) {
      if (f.visibleFish && !f.visibleFish.has(raw[FISH.id]))
        continue;
      const p = brainPresentationFish(blendFish(raw, blend));
      p[FISH.x] = wrapScreenX(p[FISH.x]);
      const item = animalItem(p, c, p[FISH.hatched] ? ANIMAL_KIND.fish : ANIMAL_KIND.egg);
      if (!item)
        continue;
      items.push(item);
      animalsState.animalSceneFish.set(p[FISH.id], item);
      if (!p[FISH.hatched] && item.r * c.scale > SCENE.embryo_pixels && !p[FISH.nutrient_egg] &&
          (p[FISH.fertilised] || p[FISH.clonal]) &&
          p[FISH.development] > SCENE.embryo_development && !p.birthShape) {
        const q = fishEmbryo(p), a = fishSnapshotAnatomy(q), r = fishRenderRadius(q);
        items.push({
          ...item,
          p : q,
          a,
          kind : ANIMAL_KIND.embryo,
          embryo : true,
          r,
          clip : item.r / r,
          light :
              item.light * (SCENE.embryo_light + SCENE.embryo_light_growth * p[FISH.development])
        });
      }
      if (p[FISH.id] === f.selected && brainVisible())
        item.opacity = 1 - SCENE.inspected_fade * brainState.brainOpacity;
    }
  } else
    for (const raw of f.corpses || []) {
      const old = sceneState.previousCorpses.get(raw[CORPSE.id]) || raw, p = raw.slice();
      p[CORPSE.x] =
          wrapScreenX(old[CORPSE.x] + horizontalDelta(raw[CORPSE.x] - old[CORPSE.x]) * blend);
      p[CORPSE.y] = old[CORPSE.y] + (raw[CORPSE.y] - old[CORPSE.y]) * blend;
      p[CORPSE.angle] = (old[CORPSE.angle] || 0) +
                        wrapAngle((raw[CORPSE.angle] || 0) - (old[CORPSE.angle] || 0)) * blend;
      const meat =
                raw[CORPSE.initial_energy] > 0
                    ? Math.pow(Math.max(0, Math.min(1, (old[CORPSE.energy] +
                                                        (raw[CORPSE.energy] - old[CORPSE.energy]) *
                                                            blend) /
                                                           raw[CORPSE.initial_energy])),
                               SCENE.meat_curve)
                    : 0,
            fade =
                Math.max(0, 1 - (raw[CORPSE.bone_age] || 0) / Math.max(1, raw[CORPSE.bone_time]));
      if (Math.max(meat, fade * (1 - meat)) < SCENE.min_visible)
        continue;
      let fish;
      if (raw[CORPSE.morphology_asset]) {
        fish = corpseFish(p).slice();
        fish[FISH.x] = p[CORPSE.x];
        fish[FISH.y] = p[CORPSE.y];
        fish[FISH.angle] = p[CORPSE.angle];
      } else {
        fish = Array(FISH.count).fill(0);
        fish[FISH.x] = p[CORPSE.x];
        fish[FISH.y] = p[CORPSE.y];
        fish[FISH.angle] = p[CORPSE.angle];
        fish[FISH.radius] = raw[CORPSE.radius];
        fish.splice(FISH.red, 3, ...p.slice(CORPSE.red, CORPSE.blue + 1));
      }
      const item =
          animalItem(fish, c, raw[CORPSE.morphology_asset] ? ANIMAL_KIND.corpse : ANIMAL_KIND.egg);
      if (item) {
        item.collapse = raw[CORPSE.sink_phase] || 0;
        item.meat = meat;
        item.fade = fade;
        item.opacity = raw[CORPSE.morphology_asset] ? 1 : meat;
        items.push(item);
      }
    }
  animalsState.gpuAnimals ??= new AnimalRenderer();
  if (!remains && layer === -1) {
    for (const item of items)
      item.depthLayer = fishVegetationLayer(item.p, f);
    animalsState.depthItems = items;
  } else
    animalsState.gpuAnimals.paint(items, c, shifts, f, blend);
  return items;
}

export function updateAnimalsState(patch) {
  Object.assign(animalsState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "animalVertex" : () => {
    animalVertex = `#version 300 es
precision highp float;
precision highp int;
${attributeInputs(ANIMAL_ATTRIBUTES)}
${glslConstants('MATERIAL', MATERIAL, 'int')}
${glslConstants('DRIVE', DRIVE, 'int')}
${glslConstants('HEADER', HEADER, 'int')}
${glslConstants('ACTION', FEEDING_EFFECT)}
const int ATLAS_WIDTH=${ATLAS.width},VERTEX_TEXELS=${VERTEX_TEXELS},QUAD=${QUAD_VERTICES};
const float EGG_FISH=${glsl((ANIMAL_KIND.egg + ANIMAL_KIND.fish) / 2)},FISH_CORPSE=${
        glsl((ANIMAL_KIND.fish + ANIMAL_KIND.corpse) / 2)};
uniform vec2 viewport,offset;
uniform float scale;
uniform int lod;
uniform highp sampler2D atlas;
out vec2 local,uv;
flat out vec4 pigment,accent,paint,condition,life;
flat out vec4 profile0,profile1,outline,anatomy;
flat out float screenSize;
flat out vec3 hatchClip;
flat out int material;
vec4 read(int at){int index=int(state.x+.5)+at;return texelFetch(atlas,ivec2(index%ATLAS_WIDTH,index/ATLAS_WIDTH),0);}
void main(){int id=gl_VertexID;vec2 p;uv=vec2(0);bool visible=true;material=MATERIAL_BODY;
 vec4 corners[6]=vec4[6](vec4(-1,-1,0,0),vec4(1,-1,0,0),vec4(1,1,0,0),vec4(-1,-1,0,0),vec4(1,1,0,0),vec4(-1,1,0,0));
 if(state.y<EGG_FISH){p=corners[id%QUAD].xy;material=MATERIAL_EGG;visible=id<QUAD;}
 else if(lod==0){vec4 box=read(HEADER_BOUNDS);vec2 q=corners[id%QUAD].xy;p=mix(box.xy,box.zw,(q+1.)*.5);visible=id<QUAD;material=MATERIAL_SILHOUETTE;}
 else{vec4 mesh=read(HEADER_LEVELS);int count=int(lod==1?mesh.y:mesh.w),start=int(lod==1?mesh.x:mesh.z);visible=id<count;vec4 a=read(start+id*VERTEX_TEXELS),b=read(start+id*VERTEX_TEXELS+1),c=read(start+id*VERTEX_TEXELS+2);material=int(b.z+.5);int drive=int(b.w+.5);float t=drive==DRIVE_TAIL?abs(muscles.x):drive==DRIVE_LEFT_FIN?muscles.y:drive==DRIVE_RIGHT_FIN?muscles.z:drive==DRIVE_SPINE?muscles.w:drive==DRIVE_MOUTH?face.y:drive==DRIVE_GILL?face.z:0.;p=mix(a.xy,a.zw,t);if(drive==DRIVE_TAIL)p.y*=extra.z;if(drive==DRIVE_MOUTH){float pump=face.z/(.05+face.y+face.z);p=mix(a.xy,mix(a.zw,c.xy,pump),face.x);}uv=b.xy;if(material==MATERIAL_EYE){float pixels=max(abs(p.x-c.z),abs(p.y-c.w))*pose.w*scale;p=c.zw+(p-c.zw)*max(1.,min(3.,1.8/max(.1,pixels)));}if(drive==DRIVE_TOOTH){float pump=face.z/(.05+face.y+face.z),base=mix(c.z,c.w,pump);vec2 full=mix(a.zw,c.xy,pump);float toothPixels=abs(full.y-base)*pose.w*scale;full.y=base+(full.y-base)*max(1.,min(2.,1.2/max(.1,toothPixels)));p=vec2(mix(a.x,full.x,face.x),base*face.x+(full.y-base)*min(1.,face.x/.22));uv.y=face.x;}}
 screenSize=pose.w*scale;anatomy=read(HEADER_MOUTH);hatchClip=vec3(read(HEADER_ORIGIN).xy,extra.w);local=p;profile0=read(HEADER_WIDTHS);profile1=read(HEADER_WIDTHS+1);outline=read(HEADER_OUTLINE);pigment=read(HEADER_PATTERN);accent=read(material==MATERIAL_EYE?(uv.x>${
        glsl(
            SCENE.eye_uv /
            2)}?HEADER_EYE_RIGHT:HEADER_EYE_LEFT):HEADER_ACCENT);paint=vec4(tint.rgb*tint.a,state.z);condition=vec4(status.zw,face.w,state.y);life=vec4(state.w,extra.w,status.xy);
 if(lod>0&&state.y<FISH_CORPSE){float u=clamp((outline.y-p.x)/max(.001,outline.y-outline.x),0.,1.);p.y+=movement.x*.18*u*u*sin(movement.y-u*6.)+muscles.x*extra.z*${
        FIN_STROKE.body_bend.toFixed(
            4)}*u*u;if(material==MATERIAL_BARBEL){p.y+=uv.x*uv.x*(.025+.055*movement.x)*sin(movement.y*.73-uv.x*2.+uv.y);p.x-=uv.x*uv.x*.04*movement.x;}float action=movement.z,jerk=sin(clamp(movement.w,0.,1.)*${
        glsl(
            Math.PI)});if(action==ACTION_BITE||action==ACTION_WORM||action==ACTION_SHELL_CLOSED)p.x+=(action==ACTION_SHELL_CLOSED?-.10:.07)*jerk*u*(1.-u);}
 if(state.y>FISH_CORPSE && (material==MATERIAL_BODY || material==MATERIAL_SILHOUETTE)){float u=clamp((p.x-outline.x)/max(.001,outline.y-outline.x),0.,1.);p.y*=1.-.18*movement.w*sin(u*${
        glsl(Math.PI)});}
 float co=cos(pose.z),si=sin(pose.z);vec2 world=pose.xy+mat2(co,si,-si,co)*((p-read(HEADER_ORIGIN).xy)*extra.xy*pose.w),screen=world*scale+offset;
 gl_Position=visible?vec4(screen.x/viewport.x*2.-1.,1.-screen.y/viewport.y*2.,0,1):vec4(2,2,0,1);
}`;
  },
  "animalFragment" : () => {
    const P = PATTERN, S = PATTERN_SPOTS;
    animalFragment = `#version 300 es
precision highp float;
in vec2 local,uv;
flat in vec4 pigment,accent,paint,condition,life,profile0,profile1,outline,anatomy;
flat in float screenSize;
flat in int material;
flat in vec3 hatchClip;
out vec4 fragment;
${glslConstants('MATERIAL', MATERIAL, 'int')}
${glslConstants('PATTERN', PATTERN_KIND, 'int')}
const float EGG_FISH=${glsl((ANIMAL_KIND.egg + ANIMAL_KIND.fish) / 2)},FISH_CORPSE=${
        glsl((ANIMAL_KIND.fish + ANIMAL_KIND.corpse) / 2)},EMBRYO=${glsl(ANIMAL_KIND.embryo)};
float widthAt(int i){return i<4?profile0[i]:profile1[i-4];}
void main(){if(abs(condition.w-EMBRYO)<${
        glsl(
            (ANIMAL_KIND.embryo - ANIMAL_KIND.fish) /
            2)}&&length(local-hatchClip.xy)>hatchClip.z)discard;vec3 c=paint.rgb;float alpha=paint.a,edge=uv.y;
 if(material==MATERIAL_EGG){float d=length(local),aa=max(.002,fwidth(d)),yolk=length((local+vec2(.12,0))/vec2(.58,.52));alpha*=1.-smoothstep(1.-aa,1.+aa,d);c=mix(c*(1.-.15*d),vec3(.93,.76,.56),.65*(1.-smoothstep(.96,1.04,yolk)));float angle=mod(atan(local.y,local.x)+${
        glsl(2.5 * Math.PI)},${glsl(2 * Math.PI)})/${
        glsl(2 *
             Math.PI)};c=mix(c,vec3(.93,.76,.56),smoothstep(.88,1.,d)*step(angle,life.z)*life.w);}
 else if(material==MATERIAL_SILHOUETTE){float u=clamp((local.x-outline.x)/max(.001,outline.y-outline.x),0.,1.)*7.;int i=min(6,int(u));float width=mix(widthAt(i),widthAt(i+1),u-float(i)),body=min(width-abs(local.y),min(local.x-outline.x,outline.y-local.x)),tail=-100.;if(outline.z>0.){float t=(outline.x-local.x)/outline.z;tail=min(outline.w*t-abs(local.y),min(t,1.-t)*outline.z);}float aa=max(.001,fwidth(local.y)),d=max(body,tail);alpha*=smoothstep(-aa,aa,d);edge=1.-clamp(d/max(.001,width),0.,1.);if(condition.w>FISH_CORPSE){float bone=(1.-smoothstep(aa,aa*2.,abs(local.y)))*step(outline.x,local.x)*step(local.x,outline.y);c=mix(c,vec3(.84,.82,.69),1.-life.x);alpha*=life.y*(life.x+(1.-life.x)*bone);}}
 else if(material==MATERIAL_BONE){c=vec3(.84,.82,.69);alpha*=condition.w>FISH_CORPSE?life.y*(1.-life.x):0.;}
 else if(material==MATERIAL_EYE){vec2 q=uv-vec2(uv.x>${glsl(SCENE.eye_uv / 2)}?${
        glsl(
            SCENE
                .eye_uv)}:0.,0);float d=length(q),aa=max(.01,fwidth(d));alpha*=1.-smoothstep(1.-aa,1.+aa,d);c=mix(vec3(.035,.08,.10),accent.rgb,1.-smoothstep(.80,.95,d));c=mix(c,vec3(.025,.06,.08),1.-smoothstep(max(.25,accent.a-.04),max(.3,accent.a+.03),length(q-vec2(.1,0))));c=mix(c,vec3(.94,.98,.91),1.-smoothstep(.10,.18,length(q-vec2(.28,-.28))));}
 else if(material==MATERIAL_TOOTH){c=mix(vec3(.56,.46,.33),vec3(.98,.92,.73),.65+.35*sin(local.x*49.));alpha*=smoothstep(.035,.16,uv.y);}
 else if(material==MATERIAL_MOUTH){float side=abs(uv.y),throat=1.-smoothstep(.6,1.1,length((uv-vec2(.54,0.))/vec2(.37,.66))),fold=.5+.5*cos(uv.x*(15.+12.*anatomy.x)+side*4.);c=mix(vec3(.32,.14,.13),vec3(.55,.30,.26),smoothstep(.15,1.,side));c*=.90+.10*fold;c=mix(c,vec3(.035,.035,.045),throat*.92);}
 else if(material==MATERIAL_LIP){c=mix(c,vec3(.79,.59,.49),.22)*1.14;}
 else if(material==MATERIAL_GILL){c*=.36;alpha*=.74;}
 else if(material==MATERIAL_CHEEK){c*=.72+.22*sin(uv.y*${glsl(Math.PI)});}
 else if(material==MATERIAL_NOSE){float d=length(uv),aa=max(.01,fwidth(d));alpha*=1.-smoothstep(1.-aa,1.+aa,d);c*=.45+.55*smoothstep(.10,.30,abs(uv.y));}
 else if(material==MATERIAL_FIN){float reach=clamp(length(uv),0.,1.),angle=atan(uv.y,uv.x)*(10.+2.*pigment.z)+pigment.y*6.,rays=(1.-smoothstep(.08,.24,abs(sin(angle))))*(1.-smoothstep(.35,1.4,fwidth(angle)))*smoothstep(.05,.3,reach);c=mix(c*.72,mix(c,vec3(.74,.87,.86),.35),reach);c+=rays*.16*smoothstep(5.,36.,screenSize);alpha*=.80-.24*reach;}
 else c*=material==MATERIAL_SPINE?1.12:.95;
 if(material==MATERIAL_BODY||material==MATERIAL_SILHOUETTE){float u=(local.x-outline.x)/max(.001,outline.y-outline.x),v=abs(local.y)/max(.01,max(max(profile0.y,profile0.z),max(profile1.x,profile1.y))),mask=0.,aa=max(.003,fwidth(u));int kind=int(pigment.x+.5);vec3 ink=vec3(${
        PATTERN_INK.map(glsl).join(',')});
 if(kind==PATTERN_STRIPES||kind==PATTERN_BARS){float period=${glsl(P.stripe_span)}/pigment.z,bend=${
        glsl(P.stripe_wave)}*sin(v*${glsl(P.stripe_wave_rate)}+u*${
        glsl(P.stripe_wave_offset)}+pigment.y*${glsl(P.phase_turns)}),x=abs(mod(u-${
        glsl(P.stripe_slant)}*v-${
        glsl(P.stripe_start)}+bend,period)-.5*period),w=(kind==PATTERN_BARS?${
        glsl(P.bar_width / 2)}:${
        glsl(
            P.stripe_width /
            2)})*(1.+.30*sin(v*4.+pigment.y*6.));mask=(1.-smoothstep(w-aa,w+aa,x))*step(.10,u)*step(u,.94);}
 else if(kind==PATTERN_LINE){float y=${glsl(P.line_place)}-${glsl(P.line_wave)}*sin(u*${
        glsl(P.line_wave_rate)}+pigment.y*${
        glsl(P.phase_turns)});mask=1.-smoothstep(.10,.15,abs(v-y));}
 else if(kind==PATTERN_SPOTS){ink=accent.rgb;float cell=floor(u*pigment.z),row=floor(v*${
        glsl(S.rows)}),h=fract(sin(cell*${glsl(S.hash_i)}+row*${glsl(S.hash_j)}+pigment.y*${
        glsl(S.hash_phase)})*${glsl(S.hash_scale)}),x=fract(u*pigment.z)-.5+(h-.5)*${
        glsl(S.jitter)},y=fract(v*${glsl(S.rows)}+cell*${
        glsl(S.stagger)})-.5;mask=1.-smoothstep(.11+.07*h,.17+.07*h,length(vec2(x,y)));}
 else if(kind==PATTERN_SADDLE){ink=accent.rgb;mask=smoothstep(.35,.43,v-${
        glsl(P.saddle_wave)}*sin(u*${glsl(P.saddle_wave_rate)}+pigment.y*${glsl(P.phase_turns)}));}
 else{ink=accent.rgb;mask=1.-smoothstep(${glsl(P.band_half)}-aa,${glsl(P.band_half)}+aa,min(abs(u-${
        glsl(P.band_first)}),abs(u-${glsl(P.band_second)})));}
 c=mix(c,ink,mask*pigment.w);float longitudinal=clamp(u,0.,1.)*7.;int section=min(6,int(longitudinal));float halfWidth=max(.015,mix(widthAt(section),widthAt(section+1),fract(longitudinal))),side=clamp(local.y/halfWidth,-1.,1.),roundness=sqrt(max(0.,1.-side*side));c*=.55+.40*roundness+.05*side;float sheen=exp(-pow((side+.34)*5.,2.))*.18*smoothstep(.08,.28,u)*(1.-smoothstep(.78,1.,u));c=mix(c,vec3(.80,.91,.88),sheen);float detail=smoothstep(28.,90.,screenSize),scales=.5+.5*sin(u*190.+floor(side*18.)*1.7);c*=1.-detail*(.025+.045*anatomy.z)*pow(scales,12.);float scarCenter=.20+.14*sin(u*24.+pigment.y*6.),scarEdge=abs(side-scarCenter),scarWidth=.018+.025*condition.y,scarSpan=smoothstep(.30,.36,u)*(1.-smoothstep(.59,.66,u)),scar=1.-smoothstep(scarWidth,scarWidth+max(.012,fwidth(side)),scarEdge);float wound=condition.y*scar*scarSpan*(.65+.35*sin(u*91.)*sin(side*47.));c=mix(c,vec3(.40,.16,.12),wound*.85);if(condition.x>.5){float blotch=smoothstep(.22,.58,sin(u*48.+sin(v*13.))*sin(v*23.+u*15.));c=mix(c,vec3(.57,.54,.42),.28*blotch);c*=.94;}c=mix(c,vec3(1.,.14,.27),condition.z*(.20+.65*smoothstep(.90,1.,edge)));}
 if(condition.w>FISH_CORPSE&&material!=MATERIAL_BONE&&material!=MATERIAL_SILHOUETTE){alpha*=life.x*life.y;c=mix(c,vec3(.39,.36,.28),.55*(1.-life.x));if(material==MATERIAL_EYE)c=mix(c,vec3(.48,.51,.46),.65);}
 if(alpha<.005)discard;fragment=vec4(c*alpha,alpha);
}`;
  },
  "animalMeshes" : () => { animalMeshes = new WeakMap(); },
  "animalEggMesh" : () => {
    animalEggMesh = {
      data : new Float32Array(ATLAS.header * TEXEL),
      vertices : [ QUAD_VERTICES, QUAD_VERTICES, QUAD_VERTICES ]
    };
  },
  "gpuAnimals" : () => { animalsState.gpuAnimals = null; },
  "animalSceneFish" : () => { animalsState.animalSceneFish = new Map(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}

export function preparedShaders() { return [ [ animalVertex, animalFragment ] ]; }
