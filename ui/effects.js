import {bedLayer, bedScale} from './plant_geometry.js';
import {blendParticle} from './state.js';
import {FISH, INVERTEBRATE, INVERTEBRATE_KIND, MUSSEL_STATE} from './schema.js';
import {fishMouthShape, fishGillShape} from './fish_organs.js';
import {fishBezier} from './fish_geometry.js';
import {cameraState, worldToScreen} from './camera.js';
import {ctx, rgb} from './dom.js';
import {fishDisplayRadius, fishBodyPath, fishRearFinShape, fishFinPath} from './fish_fins.js';
import {fishSnapshotAnatomy, fishPoseAnatomy} from './fish_forms.js';
import {
  blendFish,
  displayNow,
  displayStep,
  frameFish,
  horizontalDelta,
  sceneState,
  wrapScreenX
} from './state.js';
import {clipObstacles, plantNoise} from './water_view.js';
export const effectsState = {};

export function collectCombat(f, now = displayNow()) {
  if (effectsState.combatEpoch !== f.render_epoch || f.step < effectsState.combatStep) {
    effectsState.combatEpoch = f.render_epoch;
    effectsState.combatSeen.clear();
    effectsState.combatEffects = [];
    effectsState.combatFrame = null;
  }
  effectsState.combatStep = f.step;
  if (effectsState.combatFrame === f)
    return effectsState.combatEffects;
  effectsState.combatFrame = f;
  const recent = f.combat || [];
  for (const event of recent) {
    if (effectsState.combatSeen.has(event[0]))
      continue;
    effectsState.combatSeen.add(event[0]);
    if (!f.historical && event[1] >= f.step - 64) {
      const prey = event[2] === 9 ? sceneState.previousFish?.get(event[4]) : null;
      effectsState.combatEffects.push({event, born : event[1], prey});
    }
  }
  if (effectsState.combatSeen.size > 256)
    effectsState.combatSeen = new Set(recent.map(e => e[0]));
  effectsState.combatEffects =
      effectsState.combatEffects.filter(e => f.step - e.born < 24).slice(-40);
  return effectsState.combatEffects;
}

// Same oval body, forked tail and antennae as the cloud's plankton shader.
function paintIntakePlankton(g, x, y, size, angle) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = '#aec7a3';
  g.strokeStyle = '#aec7a3';
  g.lineWidth = Math.max(.4, size * .12);
  g.beginPath();
  g.ellipse(-.1 * size, 0, .45 * size, .29 * size, 0, 0, 2 * Math.PI);
  g.fill();
  g.beginPath();
  for (const side of [-1, 1]) {
    g.moveTo(.2 * size, side * .24 * size);
    g.lineTo(.9 * size, side * .7 * size);
    g.moveTo(-.25 * size, 0);
    g.lineTo(-.9 * size, side * .23 * size);
  }
  g.stroke();
  g.restore();
}
// Whether the scene-wide paintFeeding/paintCombat pass can draw anything at all (a superset of
// their own conditions). The overview masks every sediment bed before that pass; without
// visible effects the mask is pure cost.
export function sceneEffectsPending(f, c, blend) {
  if (collectCombat(f).some(e => e.event[2] !== 10))
    return true;
  for (const raw of f.fish || [])
    if (raw[FISH.hatched]) {
      const p = blendFish(raw, blend);
      if ((p[FISH.suction_pose] || 0) > .01 && fishDisplayRadius(p, c.scale) >= 7)
        return true;
    }
  return false;
}
export function paintFeeding(f, c, blend, only = null) {
  ctx.save();
  let count = 0;
  for (const raw of only || f.fish || []) {
    if (!raw[FISH.hatched])
      continue;
    const p = only ? raw : blendFish(raw, blend), flow = p[FISH.suction_pose] || 0,
          radius = fishDisplayRadius(p, c.scale);
    if (flow <= .01 || radius < 7)
      continue;
    const screen = worldToScreen({x : p[FISH.x], y : p[FISH.y]}, c);
    if (screen.x < -radius * 2 || screen.x > cameraState.viewportWidth + radius * 2 ||
        screen.y < -radius * 2 || screen.y > cameraState.viewportHeight + radius * 2)
      continue;
    if (++count > 64)
      break;
    const a = fishPoseAnatomy(fishSnapshotAnatomy(p), p), mouth = fishMouthShape(a),
          elapsed = displayStep(f, blend),
          phase = ((elapsed * .125 + (p[FISH.id] % 97) * .137) % 1 + 1) % 1,
          bottom = raw[FISH.feeding_action] === 3 && raw[FISH.feeding_action_age] > 0,
          plankton = raw[FISH.filtered] > 1e-8;
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(p[FISH.angle]);
    ctx.translate(-(a.origin?.[0] || 0) * radius, -(a.origin?.[1] || 0) * radius);
    ctx.lineCap = 'round';
    const intake = Math.max(0, raw[FISH.swallowed] || 0),
          preyLanes = intake > .00001
                          ? Math.max(1, Math.min(7, Math.ceil(7 * Math.sqrt(intake / .02))))
                          : 0,
          lanes = plankton || bottom ? Math.max(3, preyLanes) : 3;
    for (let k = 0; k < lanes; k++) {
      const u = (phase + k * .38197) % 1,
            lane = (k - (lanes - 1) / 2) / Math.max(1, (lanes - 1) / 2), spread = mouth.gap + .13,
            reach = .65 + .55 * flow, x = (mouth.front + reach * (1 - u)) * radius,
            y = lane * spread * (1 - u * .72) * radius, tail = Math.min(4, radius * .022) * (1 - u);
      ctx.globalAlpha = Math.min(.55, .18 + flow * .5) * Math.sin(Math.PI * u) ** 2;
      ctx.strokeStyle = bottom ? '#b5a17b99' : '#a5cccb66';
      ctx.lineWidth = Math.max(.55, radius * .004);
      ctx.beginPath();
      ctx.moveTo(x + tail, y + lane * tail * .4);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (bottom && k < preyLanes) {
        const size = Math.max(.55, Math.min(2.1, c.scale * .7));
        ctx.fillStyle = '#b5a17b';
        ctx.beginPath();
        ctx.ellipse(x, y, size * .6, size * .4, 0, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    if (radius >= 12)
      for (const side of [0, 1]) {
        const sign = side ? 1 : -1, gill = fishBezier(fishGillShape(a, side, flow), .65),
              u = (phase + side * .36) % 1;
        ctx.globalAlpha = .28 * flow * Math.sin(Math.PI * u);
        ctx.strokeStyle = '#abd7d1';
        ctx.lineWidth = Math.max(.5, radius * .004);
        ctx.beginPath();
        ctx.moveTo(gill[0] * radius, gill[1] * radius);
        ctx.quadraticCurveTo((gill[0] - .12 - .08 * u) * radius, (gill[1] + sign * .12) * radius,
                             (gill[0] - .22 - .14 * u) * radius,
                             (gill[1] + sign * (.14 + .14 * u)) * radius);
        ctx.stroke();
      }
    ctx.restore();
  }
  ctx.restore();
}

export function paintEcologyFeeding(f, c, blend, layer = null, only = null) {
  const time = displayStep(f, blend);
  if (effectsState.ecologyTime !== sceneState.renderTime || effectsState.ecologyFrame !== f) {
    effectsState.ecologyTime = sceneState.renderTime;
    effectsState.ecologyFrame = f;
    effectsState.ecologyCount = 0;
  }
  ctx.save();
  ctx.lineCap = 'round';
  for (const raw of only ? [ only ] : f.invertebrates || []) {
    const kind = raw[INVERTEBRATE.kind], depth = raw[INVERTEBRATE.bed_depth] ?? .5;
    if (kind === INVERTEBRATE_KIND.crab)
      continue;
    if (layer !== null && bedLayer(depth) !== layer)
      continue;
    const rate = kind === INVERTEBRATE_KIND.grazing ? raw[INVERTEBRATE.energy]
                                                    : raw[INVERTEBRATE.feeding_rate] || 0;
    if (rate <= 1e-5 ||
        kind === INVERTEBRATE_KIND.mussel &&
            (raw[INVERTEBRATE.closed] || raw[INVERTEBRATE.state] === MUSSEL_STATE.empty_shell))
      continue;
    const p = blendParticle(raw, sceneState.previousInvertebrates, INVERTEBRATE.id, blend),
          r = p[INVERTEBRATE.radius] * bedScale(depth) * c.scale,
          x = p[INVERTEBRATE.x] * c.scale + c.ox, y = p[INVERTEBRATE.y] * c.scale + c.oy;
    if (x < -40 - r || y < -40 - r || x > cameraState.viewportWidth + 40 + r ||
        y > cameraState.viewportHeight + 40 + r)
      continue;
    if (c.scale < .7 || kind !== INVERTEBRATE_KIND.grazing && r < 3)
      continue;
    if (++effectsState.ecologyCount > 96)
      break;
    const phase = (time * .09 + (raw[INVERTEBRATE.id] % 997) * .173) % 1,
          alpha = Math.min(.8, .35 + Math.sqrt(rate));
    ctx.globalAlpha = alpha;
    if (kind === INVERTEBRATE_KIND.grazing) {
      const n = Math.min(12, Math.floor(rate * 40));
      ctx.strokeStyle = '#bad3ae';
      ctx.lineWidth = .7;
      for (let k = 0; k < n; k++) {
        const angle = k * 2.399 + raw[INVERTEBRATE.id],
              pulse = .5 + .5 * Math.sin(time * (.25 + k * .021) + k * 4.),
              radius = r + 2 + 3 * pulse, px = x + Math.cos(angle) * radius,
              py = y + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.moveTo(px - 1, py);
        ctx.lineTo(px + 1, py - .5);
        ctx.moveTo(px, py);
        ctx.lineTo(px - 1.5 * Math.sin(angle), py + 1.5 * Math.cos(angle));
        ctx.stroke();
      }
    } else if (kind === INVERTEBRATE_KIND.mussel || kind === INVERTEBRATE_KIND.worm) {
      const variation = (p[INVERTEBRATE.id] % 997 * .61803398875) % 1,
            angle = (p[INVERTEBRATE.angle] || 0) +
                    (kind === INVERTEBRATE_KIND.mussel ? (variation - .5) * .48 : 0),
            nx = Math.sin(angle), ny = -Math.cos(angle),
            family = Math.floor(p[INVERTEBRATE.morph] || 0),
            height = ([ 1.37, 1.48, 1.10, 1.19, 1.55, 1.30, .98 ][family] || 1.37) *
                     (.94 + .10 * ((p[INVERTEBRATE.morph] || 0) % 1)),
            inlet = kind === INVERTEBRATE_KIND.mussel ? r * height * .40 : 0,
            mx = x + nx * inlet -
                 (kind === INVERTEBRATE_KIND.mussel ? Math.sin(p[INVERTEBRATE.angle] || 0) * r * .62
                                                    : 0),
            my = y + ny * inlet +
                 (kind === INVERTEBRATE_KIND.mussel ? Math.cos(p[INVERTEBRATE.angle] || 0) * r * .62
                                                    : 0),
            count = Math.min(7, Math.max(1, Math.ceil(rate * 80)));
      ctx.strokeStyle = '#879b70';
      ctx.fillStyle = '#bac89b';
      ctx.lineWidth = Math.min(1.25, Math.max(.6, c.scale * .14));
      for (let k = 0; k < count; ++k) {
        const u = (phase + k * .3819) % 1, spread = Math.max(9, Math.min(42, r * 1.1)),
              side = k % 2 ? 1 : -1,
              px = mx + nx * spread * (1 - u) - ny * side * spread * .32 * (1 - u),
              py = my + ny * spread * (1 - u) + nx * side * spread * .32 * (1 - u),
              size = Math.min(2.1, Math.max(.5, c.scale * .40));
        ctx.globalAlpha = alpha * Math.sin(Math.PI * u) ** 2;
        paintIntakePlankton(ctx, px, py, size, angle + Math.PI / 2);
      }
    }
  }
  ctx.restore();
}

export function paintCombat(f, c, now = displayNow(), only = null) {
  const effects = collectCombat(f, now);
  if (!effects.length)
    return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const {event : e, born, prey} of effects) {
    if (only && !only.has(e[3]))
      continue;
    if (e[2] === 10)
      continue; // Pressure/release belongs to the jaw pose, never blood.
    const t = Math.max(0, (displayStep(f) - born) / 24), fade = (1 - t) ** 2,
          r = Math.min(360, e[8] * c.scale), strength = Math.min(1, Math.sqrt(Math.max(0, e[9]))),
          offset = e[2] === 0 ? e[8] : 0,
          q = worldToScreen(
              {x : e[5] + Math.cos(e[7]) * offset, y : e[6] + Math.sin(e[7]) * offset}, c),
          x = q.x, y = q.y;
    if (x < -r - 100 || x > cameraState.viewportWidth + r + 100 || y < -r - 100 ||
        y > cameraState.viewportHeight + r + 100)
      continue;
    if ([ 3, 5, 6 ].includes(e[2])) {
      const fish = frameFish(f, e[3]);
      // Plant bites stay visible at every zoom: a puff of crumbs in the organ's own colour.
      const plant = e[2] !== 3;
      if (!fish || (!plant && fishDisplayRadius(fish, c.scale) < 18))
        continue;
      ctx.globalAlpha = fade * (plant ? .9 : 1);
      const tinted = plant && e.length >= 13 && !(e[10] === 1 && e[11] === 0 && e[12] === 0);
      ctx.fillStyle = tinted       ? rgb(e.slice(10, 13).map(v => Math.min(1, v * 1.15)))
                      : e[2] === 6 ? '#b9ad8f'
                      : e[2] === 3 ? '#859967'
                                   : '#b99a7d';
      const count = plant ? 4 + Math.min(6, Math.round(4 * strength)) : 3,
            size = plant ? Math.max(1.2, Math.min(4, r * .5 + c.scale * .4))
                         : Math.max(.8, Math.min(4, r * .22));
      for (let j = 0; j < count; j++) {
        const angle = e[0] * .37 + j * 2.4,
              travel =
                  (.12 + .40 * t) * (plant ? Math.max(8, Math.min(24, 3 * r)) : Math.min(r, 24)),
              px = x + Math.cos(angle) * travel, py = y + Math.sin(angle) * travel + 4 * t * t;
        ctx.beginPath();
        ctx.moveTo(px - size, py);
        ctx.lineTo(px + size * .6, py - size);
        ctx.lineTo(px + size, py + size * .3);
        ctx.closePath();
        ctx.fill();
      }
      continue;
    }
    if ([ 2, 7, 9 ].includes(e[2])) {
      const fish = frameFish(f, e[3]);
      if (fish) {
        const shown = blendFish(fish), anatomy = fishPoseAnatomy(fishSnapshotAnatomy(shown), shown),
              radius = fishDisplayRadius(shown, c.scale), shape = fishMouthShape(anatomy),
              center = worldToScreen({x : shown[FISH.x], y : shown[FISH.y]}, c),
              mx = shape.front - (anatomy.origin?.[0] || 0), my = -(anatomy.origin?.[1] || 0),
              target = {
                x : center.x +
                        (Math.cos(shown[FISH.angle]) * mx - Math.sin(shown[FISH.angle]) * my) *
                            radius,
                y : center.y +
                        (Math.sin(shown[FISH.angle]) * mx + Math.cos(shown[FISH.angle]) * my) *
                            radius
              },
              u = Math.min(1, t * 1.5),
              sx = x + horizontalDelta((target.x - x) / c.scale) * c.scale * u,
              sy = y + (target.y - y) * u;
        if (Math.hypot(horizontalDelta((target.x - x) / c.scale) * c.scale, target.y - y) >
            Math.max(8, radius * .9 + 2 * r))
          continue;
        if (u >= 1)
          continue;
        ctx.save();
        // The jaw is the clipping plane: a morsel keeps its size until it enters.
        ctx.translate(target.x, target.y);
        ctx.rotate(shown[FISH.angle]);
        ctx.beginPath();
        ctx.rect(0, -cameraState.viewportHeight, cameraState.viewportWidth * 2,
                 cameraState.viewportHeight * 2);
        ctx.clip();
        ctx.rotate(-shown[FISH.angle]);
        ctx.translate(-target.x, -target.y);
        ctx.globalAlpha = .92 * Math.min(1, (1 - u) * 12);
        ctx.fillStyle = rgb(e.slice(10, 13));
        ctx.beginPath();
        if (e[2] === 7) {
          const tail = Math.max(1, r * 3), angle = shown[FISH.angle];
          ctx.strokeStyle = rgb(e.slice(10, 13));
          ctx.lineWidth = Math.max(.6, r * .7);
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(sx - Math.cos(angle) * tail * .5 - Math.sin(angle) * tail * .2,
                               sy - Math.sin(angle) * tail * .5 + Math.cos(angle) * tail * .2,
                               sx - Math.cos(angle) * tail, sy - Math.sin(angle) * tail);
          ctx.stroke();
        } else if (e[2] === 9) {
          const size = Math.max(.5, r);
          if (prey) {
            const anatomy = fishSnapshotAnatomy(prey);
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(shown[FISH.angle] + Math.PI);
            fishBodyPath(ctx, size, anatomy);
            ctx.fill();
            fishFinPath(ctx, size, fishRearFinShape(anatomy));
            ctx.fill();
            ctx.restore();
          } else {
            ctx.ellipse(sx, sy, size * 1.4, size * .6, shown[FISH.angle], 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(sx - Math.cos(shown[FISH.angle]) * size,
                       sy - Math.sin(shown[FISH.angle]) * size);
            ctx.lineTo(sx - Math.cos(shown[FISH.angle] - .4) * size * 2,
                       sy - Math.sin(shown[FISH.angle] - .4) * size * 2);
            ctx.lineTo(sx - Math.cos(shown[FISH.angle] + .4) * size * 2,
                       sy - Math.sin(shown[FISH.angle] + .4) * size * 2);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          ctx.arc(sx, sy, Math.max(.3, r), 0, 2 * Math.PI);
          ctx.fill();
        }
        ctx.restore();
      }
      continue;
    }
    ctx.globalAlpha = fade;
    ctx.strokeStyle = '#ff3b4e';
    ctx.fillStyle = '#cb233b';
    const count = 3 + Math.round(5 * strength), travel = (.05 + .25 * t) * r + 5 * t;
    for (let i = 0; i < count; i++) {
      const angle = e[7] + (i - (count - 1) / 2) * .42 + .3 * Math.sin(e[0] * 7 + i * 11),
            speed = .5 + .5 * ((i * 7 + e[0]) % 11) / 10, dx = Math.cos(angle) * travel * speed,
            dy = Math.sin(angle) * travel * speed + t * t * 4;
      ctx.lineWidth = Math.max(.8, Math.min(6, r * .018)) * (1 - t * .5);
      ctx.beginPath();
      ctx.moveTo(x + dx * (.6 + .2 * t), y + dy * (.6 + .2 * t));
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, Math.max(.7, Math.min(5, r * .015)) * (1 - .5 * t), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function resetBlood() {
  effectsState.bloodRevision = -1;
  effectsState.bloodSeen.clear();
  effectsState.bloodParticles = [];
  effectsState.bloodReady = false;
}

function prepareBlood(f) {
  if (effectsState.bloodRevision === sceneState.frameRevision)
    return;
  effectsState.bloodRevision = sceneState.frameRevision;
  const next = new Map();
  for (const [id, total, x, y, nx, ny, r, vx, vy] of f.wounds || []) {
    next.set(id, total);
    const lost = Math.max(0, total - (effectsState.bloodSeen.get(id) || 0));
    if (!effectsState.bloodReady || lost < .0005)
      continue;
    const normal = Math.hypot(nx, ny), ax = normal ? nx / normal : Math.cos(id),
          ay = normal ? ny / normal : Math.sin(id),
          count = Math.min(96, Math.ceil(80 * Math.sqrt(lost) * Math.sqrt(Math.max(1, r / 4))));
    for (let k = 0; k < count; ++k) {
      const seed = id * 131 + k + f.step * .37, spread = (plantNoise(seed) - .5) * 2.2,
            angle = Math.atan2(-ay, -ax) + spread,
            speed = (.15 + 1.3 * Math.sqrt(lost)) * (.4 + plantNoise(seed + 41));
      effectsState.bloodParticles.push({
        x : x + ax * r * .7,
        y : y + ay * r * .7,
        vx : Math.cos(angle) * speed + .35 * vx,
        vy : Math.sin(angle) * speed + .35 * vy,
        angle,
        r : (.10 + .18 * plantNoise(seed + 17)) * Math.sqrt(r),
        birth : sceneState.previous?.step ?? f.step,
        life : 24 + 36 * plantNoise(seed + 29),
        shade : k % 3
      });
    }
  }
  effectsState.bloodSeen = next;
  effectsState.bloodReady = true;
  effectsState.bloodParticles =
      effectsState.bloodParticles.filter(p => f.step - p.birth < p.life).slice(-1024);
}

export function paintBlood(f, c, blend, shifts) {
  prepareBlood(f);
  if (!effectsState.bloodParticles.length)
    return;
  const step = displayStep(f, blend), groups = new Map();
  for (const p of effectsState.bloodParticles) {
    const age = Math.max(0, step - p.birth);
    if (age >= p.life)
      continue;
    const travel = -Math.expm1(-.052 * age) / .052, wx = wrapScreenX(p.x + p.vx * travel),
          wy = p.y + p.vy * travel + .0012 * age * age,
          fade = Math.min(3, Math.floor(4 * age / p.life)), key = p.shade * 4 + fade;
    if (!groups.has(key))
      groups.set(key, []);
    for (const shift of shifts) {
      const x = (wx + shift) * c.scale + c.ox, y = wy * c.scale + c.oy,
            r = Math.max(.3, p.r * c.scale);
      if (x + r < 0 || x - r > cameraState.viewportWidth || y + r < 0 ||
          y - r > cameraState.viewportHeight)
        continue;
      groups.get(key).push([ x, y, r, p.angle, 1 + 1.8 * Math.exp(-age / 7) ]);
    }
  }
  ctx.save();
  clipObstacles(f, c, ctx,
                {x : 0, y : 0, w : cameraState.viewportWidth, h : cameraState.viewportHeight});
  for (const [key, points] of groups) {
    ctx.fillStyle = [ '#b62838', '#d53946', '#7e172b' ][Math.floor(key / 4)];
    ctx.globalAlpha = .85 * (1 - (key % 4 + .5) / 4);
    ctx.beginPath();
    for (const [x, y, r, a, stretch] of points) {
      ctx.moveTo(x + Math.cos(a) * r * stretch, y + Math.sin(a) * r * stretch);
      ctx.ellipse(x, y, r * stretch, r, a, 0, 2 * Math.PI);
    }
    ctx.fill();
  }
  ctx.restore();
}

const initializers = {
  "combatEpoch" : () => { effectsState.combatEpoch = ''; },
  "combatStep" : () => { effectsState.combatStep = -1; },
  "combatSeen" : () => { effectsState.combatSeen = new Set(); },
  "combatEffects" : () => { effectsState.combatEffects = []; },
  "bloodRevision" : () => { effectsState.bloodRevision = -1; },
  "bloodSeen" : () => { effectsState.bloodSeen = new Map(); },
  "bloodParticles" : () => { effectsState.bloodParticles = []; },
  "bloodReady" : () => { effectsState.bloodReady = false; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
