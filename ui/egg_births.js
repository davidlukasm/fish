import {cameraState} from './camera.js';
import {fishDisplayRadius, fishRenderRadius} from './fish_fins.js';
import {fishAnatomy} from './fish_forms.js';
import {fishBezier} from './fish_geometry.js';
import {fishEggDuctCurve} from './fish_organs.js';
import {FISH, FISH_ORIGIN} from './schema.js';
import {
  blendBirthsWith,
  blendFish,
  displayNow,
  frameFish,
  frameIndex,
  horizontalDelta,
  sceneState
} from './state.js';

const EGG_BIRTH = Object.freeze(
    {min_radius : 3, min_ms : 400, max_ms : 1000, duct : .55, squeeze : .48, reach : 3});
const smoothstep = t => t * t * (3 - 2 * t);
function eggBirthProgress(birth, now = displayNow()) {
  return Math.max(0, Math.min(1, (now - birth.started) / birth.duration));
}

function blendEggBirth(p) {
  const scale =
      sceneState.renderScale ?? Math.min(cameraState.viewportWidth / sceneState.frame.width,
                                         cameraState.viewportHeight / sceneState.frame.height) *
                                    cameraState.zoom;
  if (fishDisplayRadius(p, scale) < EGG_BIRTH.min_radius)
    return p;
  const birth = sceneState.eggBirths.get(p[FISH.id]),
        maternal = sceneState.maternalBirths.get(p[FISH.id]);
  if (!birth && !maternal)
    return p;
  const v = p.slice();
  if (maternal && eggBirthProgress(maternal) < 1) {
    const t = eggBirthProgress(maternal), ease = smoothstep(t);
    v[FISH.egg_yolk] = Math.max(v[FISH.egg_yolk] || 0, maternal.yolk * (1 - ease));
    v.birthing = true;
    v.birthProgress = t;
    v.birthDuct = maternal.duct;
  }
  if (birth && !p[FISH.hatched]) {
    const t = eggBirthProgress(birth);
    if (t >= 1)
      return v;
    const mother = frameFish(sceneState.frame, birth.mother),
          pose = mother ? blendFish(mother) : birth.pose,
          ease = smoothstep(Math.min(1, t / EGG_BIRTH.duct)),
          release = smoothstep(Math.max(0, (t - EGG_BIRTH.duct) / (1 - EGG_BIRTH.duct))),
          local = fishBezier(birth.duct, ease)
                      .map((v, i) => (v - (birth.origin?.[i] || 0)) * birth.radius),
          sourceX = pose[FISH.x] + Math.cos(pose[FISH.angle]) * local[0] -
                    Math.sin(pose[FISH.angle]) * local[1],
          sourceY = pose[FISH.y] + Math.sin(pose[FISH.angle]) * local[0] +
                    Math.cos(pose[FISH.angle]) * local[1],
          r = p[FISH.radius];
    v[FISH.x] = sourceX + horizontalDelta(p[FISH.x] - sourceX) * release;
    v[FISH.y] = sourceY + (p[FISH.y] - sourceY) * release;
    v[FISH.angle] = pose[FISH.angle];
    const squeeze = 1 - EGG_BIRTH.squeeze * Math.sin(Math.PI * ease) * (1 - release);
    v.birthShape = {rx : r / squeeze, ry : r * squeeze};
  }
  return v;
}

export function recordEggBirths(next, now) {
  const current = frameIndex(next.fish, FISH.id), old = frameIndex(sceneState.frame.fish, FISH.id);
  for (const [id, birth] of sceneState.eggBirths)
    if (!current.has(id) || eggBirthProgress(birth, now) >= 1) {
      sceneState.eggBirths.delete(id);
      if (sceneState.maternalBirths.get(birth.mother) === birth)
        sceneState.maternalBirths.delete(birth.mother);
    }
  const scale =
      Math.min(cameraState.viewportWidth / next.width, cameraState.viewportHeight / next.height) *
      cameraState.zoom;
  for (const egg of next.fish) {
    if (egg[FISH.hatched] || egg[FISH.origin] !== FISH_ORIGIN.natural || old.has(egg[FISH.id]) ||
        fishDisplayRadius(egg, scale) < EGG_BIRTH.min_radius)
      continue;
    let mother = old.get(egg[FISH.parent]);
    if (!mother && egg[FISH.nutrient_egg]) {
      let best = Infinity;
      for (const p of old.values())
        if (p[FISH.hatched] && p[FISH.egg_yolk] >= egg[FISH.energy] &&
            (current.get(p[FISH.id])?.[FISH.egg_yolk] ?? p[FISH.egg_yolk]) < p[FISH.egg_yolk]) {
          const d = Math.hypot(horizontalDelta(egg[FISH.x] - p[FISH.x]), egg[FISH.y] - p[FISH.y]);
          if (d < best && d < p[FISH.radius] * EGG_BIRTH.reach + egg[FISH.radius]) {
            best = d;
            mother = p;
          }
        }
    }
    if (!mother)
      continue;
    const pose = blendFish(mother), radius = fishRenderRadius(pose), anatomy = fishAnatomy(mother),
          birth = {
            mother : mother[FISH.id],
            pose : pose.slice(),
            radius,
            yolk : mother[FISH.egg_yolk] || egg[FISH.energy],
            duct : fishEggDuctCurve(anatomy),
            origin : anatomy.origin,
            started : now,
            duration : Math.max(EGG_BIRTH.min_ms, Math.min(EGG_BIRTH.max_ms, next.delay_ms))
          };
    sceneState.eggBirths.set(egg[FISH.id], birth);
    sceneState.maternalBirths.set(mother[FISH.id], birth);
  }
}

const initializers = {
  "blendBirths" : () => { blendBirthsWith(blendEggBirth); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
