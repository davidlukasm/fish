import {fishVegetationLayer} from './plant_geometry.js';
import {FISH, CORPSE} from './schema.js';
import {brainState} from './brain.js';
import {brainPresentationFish} from './brain_signals.js';
import {cameraState, worldToScreen} from './camera.js';
import {canvas, ctx} from './dom.js';
import {collectCombat, effectsState} from './effects.js';
import {
  fishBodyRadius,
  fishBoundingRadius,
  fishFinShapes,
  fishFinTriangles,
  fishPattern,
  fishRearFinShape,
  fishRenderRadius,
  fishTemplate,
  fishTint
} from './fish_fins.js';
import {fishSnapshotAnatomy, fishFeedingPose} from './fish_forms.js';
import {eggRadius, fishBezier, fishBodyCurves, fishEmbryo} from './fish_geometry.js';
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
  fishNoseShape
} from './fish_organs.js';
import {corpseFish, fishSkeletonPath} from './fish_painter.js';
import {TankBatch, TankPath} from './renderer.js';
import {
  blendFish,
  displayNow,
  displayStep,
  horizontalDelta,
  sceneState,
  wrapScreenX
} from './state.js';
import {displayLight, clipSediment} from './water_view.js';
export const animalsState = {};
export let animalAtlasWidth;

export let animalAtlasHeight;

export let animalHeader;

export let animalVertex;

export let animalFragment;

export let animalMeshes;

export function animalProfile(a) {
  const widths = Array(8).fill(0), rear = a.tailRoot, front = a.snout,
        points = fishBodyCurves(a).flatMap(
            q => Array.from({length : 4}, (_, k) => fishBezier(q, k / 4)));
  for (let k = 0; k < 8; k++) {
    const x = rear + (front - rear) * k / 7;
    for (let j = 0; j < points.length; j++) {
      const p = points[j], q = points[(j + 1) % points.length];
      if (x < Math.min(p[0], q[0]) - 1e-8 || x > Math.max(p[0], q[0]) + 1e-8)
        continue;
      const t = Math.max(0, Math.min(1, (x - p[0]) / (q[0] - p[0] || 1e-9)));
      widths[k] = Math.max(widths[k], Math.abs(p[1] + (q[1] - p[1]) * t));
    }
  }
  let length = 0, width = 0;
  if (a.fin(0)[1] > 0)
    for (const q of fishFinShape(a, 0).curves)
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
  const neutral = records.neutral ??=
            {...a, finShapeCache : null, finPose : () => 0, tailDirection : 1, defenseActivity : 0},
        full = records.full ??=
            {...a, finShapeCache : null, finPose : () => 1, tailDirection : 1, defenseActivity : 1},
        profile = records.profile ??= animalProfile(neutral),
        bounds = records.bounds ??= fishGlyphBounds(full), pattern = fishPattern(a),
        header = new Float32Array(animalHeader * 4);
  header.set([ bounds.left, bounds.top, bounds.right, bounds.bottom ], 4);
  header.set(profile.widths, 8);
  header.set(profile.outline, 16);
  header.set([ pattern.kind, pattern.phase, pattern.count, pattern.amount ], 20);
  header.set([...pattern.accent, 1 ], 24);
  header.set([...a.organs.slice(15, 18).map(v => .22 + .48 * v), fishEye(a, 0).pupil ], 28);
  header.set([...a.organs.slice(18, 21).map(v => .22 + .48 * v), fishEye(a, 1).pupil ], 32);
  header.set(a.origin || [ 0, 0 ], 36);
  header.set([ a.teeth, a.jaw, a.armor, a.gutFilling ], 40);
  const build = detail => {
    const vertices = [], steps = detail ? 5 : 2,
          emit = (p, q = p, material = 0, drive = 0, uv = [ 0, 1 ], suction = p) =>
              vertices.push(...p, ...q, ...uv, material, drive, ...suction, 0, 0),
          triangle =
              (p, q = p, material = 0, drive = 0, uv = null, suction = p) => {
                for (let i = 0; i < 3; i++)
                  emit(p[i], q[i], material, drive, uv?.[i] || [ 0, 1 ], suction[i]);
              },
          fan =
              (curves, material, drive = 0, other = curves) => {
                const n = curves.length * steps,
                      at = (q, k) =>
                          fishBezier(q[Math.min(q.length - 1, Math.floor(k / steps) % q.length)],
                                     (k % steps) / steps);
                for (let k = 0; k < n; k++)
                  triangle([ [ 0, 0 ], at(curves, k), at(curves, (k + 1) % n) ],
                           [ [ 0, 0 ], at(other, k), at(other, (k + 1) % n) ], material, drive,
                           [ [ 0, 0 ], [ 0, 1 ], [ 0, 1 ] ]);
              },
          quad = (x, y, rx, ry, material, drive = 0, bite = null, suction = null, eyeSide = 0) => {
            const points = [ [ -1, -1 ], [ 1, -1 ], [ 1, 1 ], [ -1, -1 ], [ 1, 1 ], [ -1, 1 ] ];
            for (const [u, v] of points) {
              const p = [ x + u * rx, y + v * ry ],
                    q = bite ? [ bite[0] + u * bite[2], bite[1] + v * bite[3] ] : p,
                    s = suction ? [ suction[0] + u * suction[2], suction[1] + v * suction[3] ] : p;
              emit(p, q, material, drive, [ u + eyeSide * 4, v ], s);
              if (material === 2) {
                vertices[vertices.length - 2] = x;
                vertices[vertices.length - 1] = y;
              }
            }
          };
    // Membranes are triangulated from their outline, including forked and concave fins.
    for (let index = 0; index < 3; index++)
      if (a.fin(index)[1] > 0) {
        const rest = fishFinShapes(neutral, index), open = fishFinShapes(full, index);
        for (let lobe = 0; lobe < rest.length; lobe++) {
          const mesh = fishFinTriangles(rest[lobe], steps),
                wide = fishFinTriangles(open[lobe], steps), root = rest[lobe].root,
                reach = Math.max(
                    .01, ...mesh.points.map(q => Math.hypot(q[0] - root[0], q[1] - root[1])));
          for (const k of mesh.indices) {
            const p = mesh.points[k], dx = p[0] - root[0], dy = p[1] - root[1];
            emit(p, wide.points[k], 1, index + 1, [ dx / reach, dy / reach ]);
          }
        }
      }
    for (const side of [0, 1])
      fan(fishRearFinShape(a, side), 1);
    fan(fishBodyCurves(a), 0);
    if (detail)
      for (const side of [0, 1]) {
        const rest = fishDefenseSpines(neutral, side), open = fishDefenseSpines(full, side);
        for (let k = 0; k < rest.length; k++)
          for (let j = 1; j + 1 < rest[k].length; j++)
            triangle([ rest[k][0], rest[k][j], rest[k][j + 1] ],
                     [ open[k][0], open[k][j], open[k][j + 1] ], 3, 4);
      }
    {
      const poses = [
        {...a, mouthShapeCache : null, mouthOpening : 0, bitePose : 0, swallowPose : 0},
        {...a, mouthShapeCache : null, mouthOpening : 1, bitePose : 1, swallowPose : 0},
        {...a, mouthShapeCache : null, mouthOpening : 1, bitePose : 0, swallowPose : 1}
      ];
      if (level > 0)
        for (const side of [0, 1])
          if (a.attackSides[side] > 0 || a.jaw > .15)
            for (let k = 0; k < 8; k++) {
              const coords = [ [ k / 8, 0 ], [ (k + 1) / 8, 0 ], [ (k + 1) / 8, 1 ], [ k / 8, 1 ] ],
                    strips =
                        poses.map(p => coords.map(([ t, w ]) => fishCheekPoint(p, side, t, w)));
              for (const ids of [[ 0, 1, 2 ], [ 0, 2, 3 ]])
                triangle(ids.map(i => strips[0][i]), ids.map(i => strips[1][i]), 12, 5,
                         ids.map(i => coords[i]), ids.map(i => strips[2][i]));
            }
      if (a.jaw || a.attack) {
        const n = detail ? 12 : 5, shapes = poses.map(p => fishMouthShape(p)),
              contours = poses.map(p => fishMouthContour(p, n)),
              centers = shapes.map(q => [(q.front + q.back) / 2, 0]);
        for (let k = 0; k < contours[0].length; k++) {
          const j = (k + 1) % contours[0].length;
          triangle(
              [ centers[0], contours[0][k], contours[0][j] ],
              [ centers[1], contours[1][k], contours[1][j] ], 5, 5,
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
            triangle(indices.map(i => rims[0][i]), indices.map(i => rims[1][i]), 11, 5, null,
                     indices.map(i => rims[2][i]));
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
              emit([ rest[0] + tooth[index][0] - tooth.base[0], 0 ], tooth[index], 9, 7, [ 0, 0 ],
                   tube[index]);
              vertices[vertices.length - 2] = tooth[0][1];
              vertices[vertices.length - 1] = tube[0][1];
            }
        });
      }
      for (const side of [0, 1])
        if (a.organs[side + 1]) {
          const e = fishEye(a, side);
          quad(e.x, e.y, e.rx, e.ry, 2, 0, null, null, side);
        }
      for (const side of [0, 1])
        if (a.noseSides[side]) {
          const n = fishNoseShape(a, side);
          quad(n.x, n.y, n.rx, n.ry, 6);
        }
    }
    for (const side of [0, 1]) {
      const rest = fishGillShape(a, side, 0), open = fishGillShape(a, side, 1),
            sign = side ? 1 : -1, segments = detail ? 8 : 4;
      for (let k = 0; k < segments; k++) {
        const points = [ k / segments, (k + 1) / segments ].map(t => fishBezier(rest, t)),
              raised = [ k / segments, (k + 1) / segments ].map(t => fishBezier(open, t)),
              strip = q => [q[0], q[1], [ q[1][0] + .018, q[1][1] + sign * .006 ],
                            [ q[0][0] + .018, q[0][1] + sign * .006 ]],
              flat = strip(points), lifted = strip(raised);
        for (const ids of [[ 0, 1, 2 ], [ 0, 2, 3 ]])
          triangle(ids.map(i => flat[i]), ids.map(i => lifted[i]), 13, 6);
      }
    }
    for (const side of [0, 1])
      if (a.barbelSides[side]) {
        const points = Array.from(
            {length : detail ? 9 : 5},
            (_, k) => fishBarbel({...a, animationPhase : 0, waterMotion : 0, staticBarbel : true},
                                 side, k / (detail ? 8 : 4)));
        for (let j = 1; j < points.length; j++) {
          const p = points[j - 1], q = points[j], dx = q[0] - p[0], dy = q[1] - p[1],
                len = Math.max(.001, Math.hypot(dx, dy)), nx = -dy / len * .010,
                ny = dx / len * .010, v = [
                  [ p[0] + nx, p[1] + ny ], [ p[0] - nx, p[1] - ny ], [ q[0] - nx, q[1] - ny ],
                  [ q[0] + nx, q[1] + ny ]
                ];
          for (const k of [0, 1, 2, 0, 2, 3])
            emit(v[k], v[k], 7, 0, [ j / (points.length - 1), side ? 1 : -1 ]);
        }
      }
    // The skeleton is geometry in the same atlas; remains never allocate body/bone images.
    const skeleton = new TankPath();
    fishSkeletonPath(skeleton, 1, a);
    for (const path of skeleton.paths)
      for (let i = 1; i < path.points.length; i++) {
        const p = path.points[i - 1], q = path.points[i], dx = q[0] - p[0], dy = q[1] - p[1],
              length = Math.hypot(dx, dy);
        if (length < 1e-6)
          continue;
        const w = .010, normal = [ -dy / length * w, dx / length * w ], v = [
          [ p[0] + normal[0], p[1] + normal[1] ], [ p[0] - normal[0], p[1] - normal[1] ],
          [ q[0] - normal[0], q[1] - normal[1] ], [ q[0] + normal[0], q[1] + normal[1] ]
        ];
        for (const k of [0, 1, 2, 0, 2, 3])
          emit(v[k], v[k], 8);
      }
    return vertices;
  };
  const near = level > 0 ? build(false) : [], high = level > 1 ? build(true) : near,
        data = new Float32Array(header.length + near.length + (level > 1 ? high.length : 0));
  data.set(header);
  data.set([ animalHeader, near.length / 12, animalHeader + near.length / 4, high.length / 12 ]);
  data.set(near, header.length);
  if (level > 1)
    data.set(high, header.length + near.length);
  else
    data[2] = animalHeader;
  return records[level] = {data, vertices : [ 6, near.length / 12, high.length / 12 ], bounds};
}

export function animalDamageFlash(p, step = displayStep(sceneState.frame)) {
  let flash = 0;
  for (const {event, born} of effectsState.combatEffects)
    if (event[4] === p[4] && [ 0, 1, 8 ].includes(event[2])) {
      const t = (step - born) / 24;
      if (t >= 0 && t < 1)
        flash = Math.max(flash, (1 - t) ** 2 * (.25 + .55 * Math.sin(Math.PI * 3 * t) ** 2));
    }
  return flash;
}

export class AnimalRenderer extends TankBatch {
  constructor() {
    super(canvas, ctx, animalVertex, animalFragment, Array(8).fill(4),
          [ 'viewport', 'offset', 'scale', 'lod', 'atlas' ]);
    const gl = this.gl;
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, animalAtlasWidth, animalAtlasHeight, 0, gl.RGBA,
                  gl.FLOAT, null);
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
        this.builder = new Worker('/ui/animal_worker.js', {type : 'module'});
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
        records[0] =
            {...model, data : model.data.subarray(0, animalHeader * 4), vertices : [ 6, 0, 0 ]};
        if (build.level > 0)
          records[1] = {
            ...model,
            data : model.data.subarray(0, (animalHeader + model.vertices[1] * 3) * 4),
            vertices : [ 6, model.vertices[1], 0 ]
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
    if (!this.queued.has(anatomy) && this.builds.size < 16) {
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
            px = item.r * c.scale, old = levels.get(key), lo = old === 0 ? 5.3 : 3.8,
            hi = old === 2 ? 32 : 41;
      item.level = item.kind === 0 ? 0 : px < lo ? 0 : px < hi ? 1 : 2;
      levels.set(key, item.level);
      if (levels.size > 4096)
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
      total = [...records.values() ].reduce((sum, r) => sum + r.data.length / 4, animalHeader);
      if (total <= animalAtlasWidth * animalAtlasHeight)
        break;
      limit--;
    } while (limit >= 0);
    const egg = animalEggMesh, models = [ egg, ...records.values() ],
          missing = models.filter(m => !this.rows.has(m));
    if (this.cursor + missing.reduce((n, m) => n + m.data.length / 4, 0) >
        animalAtlasWidth * animalAtlasHeight) {
      this.rows.clear();
      this.cursor = 0;
    }
    ctx.beginExternal();
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    for (const model of models)
      if (!this.rows.has(model)) {
        const start = this.cursor, texels = model.data.length / 4;
        this.rows.set(model, start);
        let at = 0;
        while (at < texels) {
          const index = start + at, x = index % animalAtlasWidth,
                y = Math.floor(index / animalAtlasWidth),
                count = Math.min(texels - at, animalAtlasWidth - x);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, count, 1, gl.RGBA, gl.FLOAT,
                           model.data.subarray(at * 4, (at + count) * 4));
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
        const n = level ? (v.a ? records.get(v.a) : egg).vertices[level] : 6,
              key = level ? Math.ceil(Math.log2(Math.max(6, n))) : 0;
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
    if (this.instances.length < ordered.length * 32)
      this.instances =
          new Float32Array(2 ** Math.ceil(Math.log2(Math.max(32, ordered.length * 32))));
    let at = 0;
    for (const v of ordered) {
      const p = v.p, a = v.a, model = a ? records.get(a) : egg,
            color = a ? fishTint(p, a) : p.slice(16, 19),
            facePose = fishFeedingPose(p, displayStep(sceneState.frame));
      this.instances.set(
          [
            p[0],
            p[1],
            p[2],
            v.r,
            ...color,
            v.light,
            ...[0, 1, 2].map(k => Math.max(0, Math.min(1, p[57]?.[k] || 0))),
            p[26] || 0,
            this.rows.get(model),
            v.kind,
            v.opacity ?? 1,
            v.meat ?? 1,
            p[9] || 0,
            !p[49] && (p[13] || p[31]) ? 1 : 0,
            p[52] > 0 ? 1 : 0,
            1 - Math.max(0, Math.min(1, p[23] ?? 1)),
            facePose.mouthOpening,
            facePose.bitePose,
            facePose.swallowPose,
            v.kind === 1 ? animalDamageFlash(p) : 0,
            p.birthShape ? p.birthShape.rx / (p[51] || 1) : 1,
            p.birthShape ? p.birthShape.ry / (p[51] || 1) : 1,
            Math.sign(p[57]?.[3]?.[2] || 1),
            v.clip ?? v.fade ?? 1,
            v.kind === 1 ? (a?.undulation || 0) *
                               Math.min(1, .025 + (p[FISH.relative_speed] || 0) / 1.5 +
                                               .3 * (p[FISH.fin_pose]?.[0] || 0))
                         : 0,
            displayStep(f, blend) *
                    (.065 + .08 * (a?.undulation || 0) + .018 * ((p[FISH.id] || 0) % 7) / 7) +
                (p[FISH.id] || 0) % 11,
            p[FISH.feeding_action] || 0,
            v.kind === 2 ? (v.collapse || 0) : (p[FISH.feeding_action_age] || 0) / 48
          ],
          at);
      at += 32;
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

export function animalItem(p, c, kind = 1, a = null) {
  const screen = worldToScreen({x : p[FISH.x], y : p[FISH.y]}, c),
        bound = fishBoundingRadius(p) * c.scale + 2;
  if (screen.y + bound < 0 || screen.y - bound > cameraState.viewportHeight ||
      screen.x + bound < 0 || screen.x - bound > cameraState.viewportWidth)
    return null;
  const r = fishRenderRadius(p);
  a = p[FISH.hatched] ? (a || fishSnapshotAnatomy(p, Math.min(16, r * c.scale))) : null;
  const extent = a ? fishGlyphExtent(a) : 1, margin = r * c.scale * extent + 2;
  if (screen.y + margin < 0 || screen.y - margin > cameraState.viewportHeight ||
      screen.x + margin < 0 || screen.x - margin > cameraState.viewportWidth)
    return null;
  return {p, a, r, extent, kind, light : displayLight(sceneState.frame, p[FISH.x], p[FISH.y])};
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
      if (f.visibleFish && !f.visibleFish.has(raw[4]))
        continue;
      const p = brainPresentationFish(blendFish(raw, blend));
      p[0] = wrapScreenX(p[0]);
      const item = animalItem(p, c, p[8] ? 1 : 0);
      if (!item)
        continue;
      items.push(item);
      animalsState.animalSceneFish.set(p[4], item);
      if (!p[8] && item.r * c.scale > 10 && !p[49] && (p[13] || p[31]) && p[9] > .08 &&
          !p.birthShape) {
        const q = fishEmbryo(p), a = fishSnapshotAnatomy(q, 16), r = fishRenderRadius(q);
        items.push({
          ...item,
          p : q,
          a,
          kind : 1.25,
          embryo : true,
          r,
          clip : item.r / r,
          light : item.light * (.25 + .5 * p[9])
        });
      }
      if (p[4] === f.selected && brainState.brainOpacity > .005)
        item.opacity = 1 - .65 * brainState.brainOpacity;
    }
  } else
    for (const raw of f.corpses || []) {
      const old = sceneState.previousCorpses.get(raw[7]) || raw, p = raw.slice();
      p[0] = wrapScreenX(old[0] + horizontalDelta(raw[0] - old[0]) * blend);
      p[1] = old[1] + (raw[1] - old[1]) * blend;
      p[8] = (old[8] || 0) + Math.atan2(Math.sin((raw[8] || 0) - (old[8] || 0)),
                                        Math.cos((raw[8] || 0) - (old[8] || 0))) *
                                 blend;
      const meat = raw[10] > 0
                       ? Math.pow(Math.max(0, Math.min(1, (old[2] + (raw[2] - old[2]) * blend) /
                                                              raw[10])),
                                  .65)
                       : 0,
            fade = Math.max(0, 1 - (raw[CORPSE.bone_age] || 0) / (raw[CORPSE.bone_time] || 1000));
      if (Math.max(meat, fade * (1 - meat)) < .005)
        continue;
      let fish;
      if (raw[CORPSE.morphology_asset]) {
        fish = corpseFish(p).slice();
        fish[0] = p[0];
        fish[1] = p[1];
        fish[2] = p[8];
      } else {
        fish = Array(75).fill(0);
        fish[0] = p[0];
        fish[1] = p[1];
        fish[2] = p[8];
        fish[51] = raw[9];
        fish.splice(16, 3, ...p.slice(4, 7));
      }
      const item = animalItem(fish, c, raw[CORPSE.morphology_asset] ? 2 : 0);
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
  "animalAtlasWidth" : () => {
    // Animals share one world-space mesh atlas, instance format and camera transform.
    // Detail levels sample the same contours. Zoom never changes a cached body's size.
    animalAtlasWidth = 1024;
  },
  "animalAtlasHeight" : () => { animalAtlasHeight = 2048; },
  "animalHeader" : () => { animalHeader = 16; },
  "animalVertex" : () => {
    animalVertex = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec4 pose;
layout(location=1) in vec4 tint;
layout(location=2) in vec4 muscles;
layout(location=3) in vec4 state;
layout(location=4) in vec4 status;
layout(location=5) in vec4 face;
layout(location=6) in vec4 extra;
layout(location=7) in vec4 movement;
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
vec4 read(int at){int index=int(state.x+.5)+at;return texelFetch(atlas,ivec2(index%1024,index/1024),0);}
void main(){int id=gl_VertexID;vec2 p;uv=vec2(0);bool visible=true;material=0;
 vec4 corners[6]=vec4[6](vec4(-1,-1,0,0),vec4(1,-1,0,0),vec4(1,1,0,0),vec4(-1,-1,0,0),vec4(1,1,0,0),vec4(-1,1,0,0));
 if(state.y<.5){p=corners[id%6].xy;material=4;visible=id<6;}
 else if(lod==0){vec4 box=read(1);vec2 q=corners[id%6].xy;p=mix(box.xy,box.zw,(q+1.)*.5);visible=id<6;material=10;}
 else{vec4 mesh=read(0);int count=int(lod==1?mesh.y:mesh.w),start=int(lod==1?mesh.x:mesh.z);visible=id<count;vec4 a=read(start+id*3),b=read(start+id*3+1),c=read(start+id*3+2);material=int(b.z+.5);int drive=int(b.w+.5);float t=drive==1?abs(muscles.x):drive==2?muscles.y:drive==3?muscles.z:drive==4?muscles.w:drive==5?face.y:drive==6?face.z:0.;p=mix(a.xy,a.zw,t);if(drive==1)p.y*=extra.z;if(drive==5){float pump=face.z/(.05+face.y+face.z);p=mix(a.xy,mix(a.zw,c.xy,pump),face.x);}uv=b.xy;if(material==2){float pixels=max(abs(p.x-c.z),abs(p.y-c.w))*pose.w*scale;p=c.zw+(p-c.zw)*max(1.,min(3.,1.8/max(.1,pixels)));}if(drive==7){float pump=face.z/(.05+face.y+face.z),base=mix(c.z,c.w,pump);vec2 full=mix(a.zw,c.xy,pump);float toothPixels=abs(full.y-base)*pose.w*scale;full.y=base+(full.y-base)*max(1.,min(2.,1.2/max(.1,toothPixels)));p=vec2(mix(a.x,full.x,face.x),base*face.x+(full.y-base)*min(1.,face.x/.22));uv.y=face.x;}}
 screenSize=pose.w*scale;anatomy=read(10);hatchClip=vec3(read(9).xy,extra.w);local=p;profile0=read(2);profile1=read(3);outline=read(4);pigment=read(5);accent=read(material==2?(uv.x>2.?8:7):6);paint=vec4(tint.rgb*tint.a,state.z);condition=vec4(status.zw,face.w,state.y);life=vec4(state.w,extra.w,status.xy);
 if(lod>0&&state.y<1.5){float u=clamp((outline.y-p.x)/max(.001,outline.y-outline.x),0.,1.);p.y+=movement.x*.18*u*u*sin(movement.y-u*6.);if(material==7){p.y+=uv.x*uv.x*(.025+.055*movement.x)*sin(movement.y*.73-uv.x*2.+uv.y);p.x-=uv.x*uv.x*.04*movement.x;}float action=movement.z,jerk=sin(clamp(movement.w,0.,1.)*3.14159265);if(action==5.||action==7.||action==10.)p.x+=(action==10.?-.10:.07)*jerk*u*(1.-u);}
 if(state.y>1.5 && (material==0 || material==10)){float u=clamp((p.x-outline.x)/max(.001,outline.y-outline.x),0.,1.);p.y*=1.-.18*movement.w*sin(u*3.14159265);}
 float co=cos(pose.z),si=sin(pose.z);vec2 world=pose.xy+mat2(co,si,-si,co)*((p-read(9).xy)*extra.xy*pose.w),screen=world*scale+offset;
 gl_Position=visible?vec4(screen.x/viewport.x*2.-1.,1.-screen.y/viewport.y*2.,0,1):vec4(2,2,0,1);
}`;
  },
  "animalFragment" : () => {
    animalFragment = `#version 300 es
precision highp float;
in vec2 local,uv;
flat in vec4 pigment,accent,paint,condition,life,profile0,profile1,outline,anatomy;
flat in float screenSize;
flat in int material;
flat in vec3 hatchClip;
out vec4 fragment;
float widthAt(int i){return i<4?profile0[i]:profile1[i-4];}
void main(){if(condition.w>1.1&&condition.w<1.5&&length(local-hatchClip.xy)>hatchClip.z)discard;vec3 c=paint.rgb;float alpha=paint.a,edge=uv.y;
 if(material==4){float d=length(local),aa=max(.002,fwidth(d)),yolk=length((local+vec2(.12,0))/vec2(.58,.52));alpha*=1.-smoothstep(1.-aa,1.+aa,d);c=mix(c*(1.-.15*d),vec3(.93,.76,.56),.65*(1.-smoothstep(.96,1.04,yolk)));float angle=mod(atan(local.y,local.x)+7.8539816,6.2831853)/6.2831853;c=mix(c,vec3(.93,.76,.56),smoothstep(.88,1.,d)*step(angle,life.z)*life.w);}
 else if(material==10){float u=clamp((local.x-outline.x)/max(.001,outline.y-outline.x),0.,1.)*7.;int i=min(6,int(u));float width=mix(widthAt(i),widthAt(i+1),u-float(i)),body=min(width-abs(local.y),min(local.x-outline.x,outline.y-local.x)),tail=-100.;if(outline.z>0.){float t=(outline.x-local.x)/outline.z;tail=min(outline.w*t-abs(local.y),min(t,1.-t)*outline.z);}float aa=max(.001,fwidth(local.y)),d=max(body,tail);alpha*=smoothstep(-aa,aa,d);edge=1.-clamp(d/max(.001,width),0.,1.);if(condition.w>1.5){float bone=(1.-smoothstep(aa,aa*2.,abs(local.y)))*step(outline.x,local.x)*step(local.x,outline.y);c=mix(c,vec3(.84,.82,.69),1.-life.x);alpha*=life.y*(life.x+(1.-life.x)*bone);}}
 else if(material==8){c=vec3(.84,.82,.69);alpha*=condition.w>1.5?life.y*(1.-life.x):0.;}
 else if(material==2){vec2 q=uv-vec2(uv.x>2.?4.:0.,0);float d=length(q),aa=max(.01,fwidth(d));alpha*=1.-smoothstep(1.-aa,1.+aa,d);c=mix(vec3(.035,.08,.10),accent.rgb,1.-smoothstep(.80,.95,d));c=mix(c,vec3(.025,.06,.08),1.-smoothstep(max(.25,accent.a-.04),max(.3,accent.a+.03),length(q-vec2(.1,0))));c=mix(c,vec3(.94,.98,.91),1.-smoothstep(.10,.18,length(q-vec2(.28,-.28))));}
 else if(material==9){c=mix(vec3(.56,.46,.33),vec3(.98,.92,.73),.65+.35*sin(local.x*49.));alpha*=smoothstep(.035,.16,uv.y);}
 else if(material==5){float side=abs(uv.y),throat=1.-smoothstep(.6,1.1,length((uv-vec2(.54,0.))/vec2(.37,.66))),fold=.5+.5*cos(uv.x*(15.+12.*anatomy.x)+side*4.);c=mix(vec3(.32,.14,.13),vec3(.55,.30,.26),smoothstep(.15,1.,side));c*=.90+.10*fold;c=mix(c,vec3(.035,.035,.045),throat*.92);}
 else if(material==11){c=mix(c,vec3(.79,.59,.49),.22)*1.14;}
 else if(material==13){c*=.36;alpha*=.74;}
 else if(material==12){c*=.72+.22*sin(uv.y*3.14159);}
 else if(material==6){float d=length(uv),aa=max(.01,fwidth(d));alpha*=1.-smoothstep(1.-aa,1.+aa,d);c*=.45+.55*smoothstep(.10,.30,abs(uv.y));}
 else if(material==1){float reach=clamp(length(uv),0.,1.),angle=atan(uv.y,uv.x)*(10.+2.*pigment.z)+pigment.y*6.,rays=(1.-smoothstep(.08,.24,abs(sin(angle))))*(1.-smoothstep(.35,1.4,fwidth(angle)))*smoothstep(.05,.3,reach);c=mix(c*.72,mix(c,vec3(.74,.87,.86),.35),reach);c+=rays*.16*smoothstep(5.,36.,screenSize);alpha*=.80-.24*reach;}
 else c*=material==3?1.12:.95;
 if(material==0||material==10){float u=(local.x-outline.x)/max(.001,outline.y-outline.x),v=abs(local.y)/max(.01,max(max(profile0.y,profile0.z),max(profile1.x,profile1.y))),mask=0.,aa=max(.003,fwidth(u));int kind=int(pigment.x+.5);vec3 ink=vec3(.025,.075,.11);
 if(kind==0||kind==3){float period=.76/pigment.z,bend=.025*sin(v*3.+u*9.+pigment.y*6.),x=abs(mod(u-.06*v-.13+bend,period)-.5*period),w=(kind==3?.035:.013)*(1.+.30*sin(v*4.+pigment.y*6.));mask=(1.-smoothstep(w-aa,w+aa,x))*step(.10,u)*step(u,.94);}
 else if(kind==1){float y=.12-.13*sin(u*5.+pigment.y*6.);mask=1.-smoothstep(.10,.15,abs(v-y));}
 else if(kind==2){ink=accent.rgb;float cell=floor(u*pigment.z),row=floor(v*3.),h=fract(sin(cell*12.73+row*29.1+pigment.y*47.)*437.58),x=fract(u*pigment.z)-.5+(h-.5)*.22,y=fract(v*3.+cell*.37)-.5;mask=1.-smoothstep(.11+.07*h,.17+.07*h,length(vec2(x,y)));}
 else if(kind==4){ink=accent.rgb;mask=smoothstep(.35,.43,v-.12*sin(u*7.+pigment.y*6.));}
 else{ink=accent.rgb;mask=1.-smoothstep(.04-aa,.04+aa,min(abs(u-.30),abs(u-.70)));}
 c=mix(c,ink,mask*pigment.w);float longitudinal=clamp(u,0.,1.)*7.;int section=min(6,int(longitudinal));float halfWidth=max(.015,mix(widthAt(section),widthAt(section+1),fract(longitudinal))),side=clamp(local.y/halfWidth,-1.,1.),roundness=sqrt(max(0.,1.-side*side));c*=.55+.40*roundness+.05*side;float sheen=exp(-pow((side+.34)*5.,2.))*.18*smoothstep(.08,.28,u)*(1.-smoothstep(.78,1.,u));c=mix(c,vec3(.80,.91,.88),sheen);float detail=smoothstep(28.,90.,screenSize),scales=.5+.5*sin(u*190.+floor(side*18.)*1.7);c*=1.-detail*(.025+.045*anatomy.z)*pow(scales,12.);float scarCenter=.20+.14*sin(u*24.+pigment.y*6.),scarEdge=abs(side-scarCenter),scarWidth=.018+.025*condition.y,scarSpan=smoothstep(.30,.36,u)*(1.-smoothstep(.59,.66,u)),scar=1.-smoothstep(scarWidth,scarWidth+max(.012,fwidth(side)),scarEdge);float wound=condition.y*scar*scarSpan*(.65+.35*sin(u*91.)*sin(side*47.));c=mix(c,vec3(.40,.16,.12),wound*.85);if(condition.x>.5){float blotch=smoothstep(.22,.58,sin(u*48.+sin(v*13.))*sin(v*23.+u*15.));c=mix(c,vec3(.57,.54,.42),.28*blotch);c*=.94;}c=mix(c,vec3(1.,.14,.27),condition.z*(.20+.65*smoothstep(.90,1.,edge)));}
 if(condition.w>1.5&&material!=8&&material!=10){alpha*=life.x*life.y;c=mix(c,vec3(.39,.36,.28),.55*(1.-life.x));if(material==2)c=mix(c,vec3(.48,.51,.46),.65);}
 if(alpha<.005)discard;fragment=vec4(c*alpha,alpha);
}`;
  },
  "animalMeshes" : () => { animalMeshes = new WeakMap(); },
  "animalEggMesh" : () => {
    animalEggMesh = {data : new Float32Array(animalHeader * 4), vertices : [ 6, 6, 6 ]};
  },
  "gpuAnimals" : () => { animalsState.gpuAnimals = null; },
  "animalSceneFish" : () => { animalsState.animalSceneFish = new Map(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}

export function preparedShaders() { return [ [ animalVertex, animalFragment ] ]; }
