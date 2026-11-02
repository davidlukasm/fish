import {musselHeight} from './fauna.js';
import {bedLayer, bedScale, MIDDLE_DEPTH} from './plant_geometry.js';
import {blendParticle, idPhase} from './state.js';
import {
  COMBAT,
  FEEDING_EFFECT,
  FISH,
  INVERTEBRATE,
  INVERTEBRATE_KIND,
  MUSSEL_STATE,
  TOLERANCE
} from './schema.js';
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

// Combat events count for RECENT steps; at most SEEN ids are remembered and SHOWN effects drawn
// for SHOWN_STEPS steps.
const COMBAT_MEMORY = Object.freeze({recent : 64, seen : 256, shown_steps : 24, shown : 40});
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
    if (effectsState.combatSeen.has(event[COMBAT.id]))
      continue;
    effectsState.combatSeen.add(event[COMBAT.id]);
    if (!f.historical && event[COMBAT.tick] >= f.step - COMBAT_MEMORY.recent) {
      const prey = event[COMBAT.kind] === FEEDING_EFFECT.gulp_fish
                       ? sceneState.previousFish?.get(event[COMBAT.target])
                       : null;
      effectsState.combatEffects.push({event, born : event[COMBAT.tick], prey});
    }
  }
  if (effectsState.combatSeen.size > COMBAT_MEMORY.seen)
    effectsState.combatSeen = new Set(recent.map(e => e[COMBAT.id]));
  effectsState.combatEffects =
      effectsState.combatEffects.filter(e => f.step - e.born < COMBAT_MEMORY.shown_steps)
          .slice(-COMBAT_MEMORY.shown);
  return effectsState.combatEffects;
}

// Same oval body, forked tail and antennae as the cloud's plankton shader.
// Plankton drawn in body sizes.
const INTAKE_PLANKTON = Object.freeze({
  min_width : .4,
  width : .12,
  body_x : .1,
  body_rx : .45,
  body_ry : .29,
  antenna_x : .2,
  antenna_y : .24,
  antenna_tip_x : .9,
  antenna_tip_y : .7,
  tail_x : .25,
  tail_tip_x : .9,
  tail_tip_y : .23,
  plankton : '#aec7a3'
});
function paintIntakePlankton(g, x, y, size, angle) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = INTAKE_PLANKTON.plankton;
  g.strokeStyle = INTAKE_PLANKTON.plankton;
  g.lineWidth = Math.max(INTAKE_PLANKTON.min_width, size * INTAKE_PLANKTON.width);
  g.beginPath();
  g.ellipse(-INTAKE_PLANKTON.body_x * size, 0, INTAKE_PLANKTON.body_rx * size,
            INTAKE_PLANKTON.body_ry * size, 0, 0, 2 * Math.PI);
  g.fill();
  g.beginPath();
  for (const side of [-1, 1]) {
    g.moveTo(INTAKE_PLANKTON.antenna_x * size, side * INTAKE_PLANKTON.antenna_y * size);
    g.lineTo(INTAKE_PLANKTON.antenna_tip_x * size, side * INTAKE_PLANKTON.antenna_tip_y * size);
    g.moveTo(-INTAKE_PLANKTON.tail_x * size, 0);
    g.lineTo(-INTAKE_PLANKTON.tail_tip_x * size, side * INTAKE_PLANKTON.tail_tip_y * size);
  }
  g.stroke();
  g.restore();
}
// Whether the scene-wide paintFeeding/paintCombat pass can draw anything at all (a superset of
// their own conditions). The overview masks every sediment bed before that pass; without
// visible effects the mask is pure cost.
export function sceneEffectsPending(f, c, blend) {
  if (collectCombat(f).some(e => e.event[COMBAT.kind] !== FEEDING_EFFECT.shell_closed))
    return true;
  for (const raw of f.fish || [])
    if (raw[FISH.hatched]) {
      const p = blendFish(raw, blend);
      if ((p[FISH.suction_pose] || 0) > FEEDING.min_flow &&
          fishDisplayRadius(p, c.scale) >= FEEDING.min_radius)
        return true;
    }
  return false;
}
// Suction streams: lanes of water drawn into the mouth, more with intake, grains when scraping,
// and gill outflow; at most MAX_FISH fish from MIN_RADIUS pixels on.
const FEEDING = Object.freeze({
  min_flow : .01,
  min_radius : 7,
  margin : 2,
  max_fish : 64,
  phase_rate : .125,
  phase_modulus : 97,
  phase_spread : .137,
  min_intake : .00001,
  max_lanes : 7,
  lane_intake : .02,
  lanes : 3,
  golden : .38197,
  lane_gap : .13,
  reach : .65,
  reach_per_flow : .55,
  narrowing : .72,
  max_tail : 4,
  tail : .022,
  max_alpha : .55,
  alpha : .18,
  alpha_per_flow : .5,
  min_width : .55,
  width : .004,
  tail_lane : .4,
  min_grain : .55,
  max_grain : 2.1,
  grain : .7,
  grain_x : .6,
  grain_y : .4,
  gill_min_radius : 12,
  gill_at : .65,
  gill_phase : .36,
  gill_alpha : .28,
  gill_min_width : .5,
  gill_width : .004,
  gill_back : .12,
  gill_back_per_phase : .08,
  gill_out : .12,
  gill_end_back : .22,
  gill_end_back_per_phase : .14,
  gill_end_out : .14,
  gill_end_out_per_phase : .14,
  bottom_stream : '#b5a17b99',
  stream : '#a5cccb66',
  grain : '#b5a17b',
  gill : '#abd7d1'
});
export function paintFeeding(f, c, blend, only = null) {
  ctx.save();
  let count = 0;
  for (const raw of only || f.fish || []) {
    if (!raw[FISH.hatched])
      continue;
    const p = only ? raw : blendFish(raw, blend), flow = p[FISH.suction_pose] || 0,
          radius = fishDisplayRadius(p, c.scale);
    if (flow <= FEEDING.min_flow || radius < FEEDING.min_radius)
      continue;
    const screen = worldToScreen({x : p[FISH.x], y : p[FISH.y]}, c);
    if (screen.x < -radius * FEEDING.margin ||
        screen.x > cameraState.viewportWidth + radius * FEEDING.margin ||
        screen.y < -radius * FEEDING.margin ||
        screen.y > cameraState.viewportHeight + radius * FEEDING.margin)
      continue;
    if (++count > FEEDING.max_fish)
      break;
    const a = fishPoseAnatomy(fishSnapshotAnatomy(p), p), mouth = fishMouthShape(a),
          elapsed = displayStep(f, blend),
          phase = ((elapsed * FEEDING.phase_rate +
                    (p[FISH.id] % FEEDING.phase_modulus) * FEEDING.phase_spread) %
                       1 +
                   1) %
                  1,
          bottom = raw[FISH.feeding_action] === FEEDING_EFFECT.scrape &&
                   raw[FISH.feeding_action_age] > 0,
          plankton = raw[FISH.filtered] > TOLERANCE.negligible;
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(p[FISH.angle]);
    ctx.translate(-(a.origin?.[0] || 0) * radius, -(a.origin?.[1] || 0) * radius);
    ctx.lineCap = 'round';
    const intake = Math.max(0, raw[FISH.swallowed] || 0),
          preyLanes =
              intake > FEEDING.min_intake
                  ? Math.max(1, Math.min(FEEDING.max_lanes,
                                         Math.ceil(FEEDING.max_lanes *
                                                   Math.sqrt(intake / FEEDING.lane_intake))))
                  : 0,
          lanes = plankton || bottom ? Math.max(FEEDING.lanes, preyLanes) : FEEDING.lanes;
    for (let k = 0; k < lanes; k++) {
      const u = (phase + k * FEEDING.golden) % 1,
            lane = (k - (lanes - 1) / 2) / Math.max(1, (lanes - 1) / 2),
            spread = mouth.gap + FEEDING.lane_gap,
            reach = FEEDING.reach + FEEDING.reach_per_flow * flow,
            x = (mouth.front + reach * (1 - u)) * radius,
            y = lane * spread * (1 - u * FEEDING.narrowing) * radius,
            tail = Math.min(FEEDING.max_tail, radius * FEEDING.tail) * (1 - u);
      ctx.globalAlpha = Math.min(FEEDING.max_alpha, FEEDING.alpha + flow * FEEDING.alpha_per_flow) *
                        Math.sin(Math.PI * u) ** 2;
      ctx.strokeStyle = bottom ? FEEDING.bottom_stream : FEEDING.stream;
      ctx.lineWidth = Math.max(FEEDING.min_width, radius * FEEDING.width);
      ctx.beginPath();
      ctx.moveTo(x + tail, y + lane * tail * FEEDING.tail_lane);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (bottom && k < preyLanes) {
        const size =
            Math.max(FEEDING.min_grain, Math.min(FEEDING.max_grain, c.scale * FEEDING.grain));
        ctx.fillStyle = FEEDING.grain;
        ctx.beginPath();
        ctx.ellipse(x, y, size * FEEDING.grain_x, size * FEEDING.grain_y, 0, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    if (radius >= FEEDING.gill_min_radius)
      for (const side of [0, 1]) {
        const sign = side ? 1 : -1,
              gill = fishBezier(fishGillShape(a, side, flow), FEEDING.gill_at),
              u = (phase + side * FEEDING.gill_phase) % 1;
        ctx.globalAlpha = FEEDING.gill_alpha * flow * Math.sin(Math.PI * u);
        ctx.strokeStyle = FEEDING.gill;
        ctx.lineWidth = Math.max(FEEDING.gill_min_width, radius * FEEDING.gill_width);
        ctx.beginPath();
        ctx.moveTo(gill[0] * radius, gill[1] * radius);
        ctx.quadraticCurveTo(
            (gill[0] - FEEDING.gill_back - FEEDING.gill_back_per_phase * u) * radius,
            (gill[1] + sign * FEEDING.gill_out) * radius,
            (gill[0] - FEEDING.gill_end_back - FEEDING.gill_end_back_per_phase * u) * radius,
            (gill[1] + sign * (FEEDING.gill_end_out + FEEDING.gill_end_out_per_phase * u)) *
                radius);
        ctx.stroke();
      }
    ctx.restore();
  }
  ctx.restore();
}

// Small animals feeding: grazers nibble in a pulsing ring, mussels and worms draw plankton into
// their inlet; at most MAX_ANIMALS from MIN_SCALE zoom on.
const ECOLOGY_FEEDING = Object.freeze({
  min_rate : 1e-5,
  margin : 40,
  min_scale : .7,
  min_radius : 3,
  max_animals : 96,
  phase_rate : .09,
  phase_modulus : 997,
  phase_spread : .173,
  max_alpha : .8,
  alpha : .35,
  max_bites : 12,
  bites_per_rate : 40,
  line_width : .7,
  golden_angle : 2.399,
  pulse_rate : .25,
  pulse_rate_per_bite : .021,
  pulse_offset : 4.,
  ring_gap : 2,
  ring_pulse : 3,
  crumb : .5,
  crumb_side : 1.5,
  mussel_tilt : .48,
  inlet : .40,
  hinge : .62,
  max_cells : 7,
  cells_per_rate : 80,
  max_width : 1.25,
  min_width : .6,
  width : .14,
  golden : .3819,
  min_spread : 9,
  max_spread : 42,
  spread : 1.1,
  drift : .32,
  max_size : 2.1,
  min_size : .5,
  size : .40,
  bite : '#bad3ae',
  crumb : '#879b70',
  stream : '#bac89b'
});
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
    const kind = raw[INVERTEBRATE.kind], depth = raw[INVERTEBRATE.bed_depth] ?? MIDDLE_DEPTH;
    if (kind === INVERTEBRATE_KIND.crab)
      continue;
    if (layer !== null && bedLayer(depth) !== layer)
      continue;
    const rate = kind === INVERTEBRATE_KIND.grazing ? raw[INVERTEBRATE.energy]
                                                    : raw[INVERTEBRATE.feeding_rate] || 0;
    if (rate <= ECOLOGY_FEEDING.min_rate ||
        kind === INVERTEBRATE_KIND.mussel &&
            (raw[INVERTEBRATE.closed] || raw[INVERTEBRATE.state] === MUSSEL_STATE.empty_shell))
      continue;
    const p = blendParticle(raw, sceneState.previousInvertebrates, INVERTEBRATE.id, blend),
          r = p[INVERTEBRATE.radius] * bedScale(depth) * c.scale,
          x = p[INVERTEBRATE.x] * c.scale + c.ox, y = p[INVERTEBRATE.y] * c.scale + c.oy;
    if (x < -ECOLOGY_FEEDING.margin - r || y < -ECOLOGY_FEEDING.margin - r ||
        x > cameraState.viewportWidth + ECOLOGY_FEEDING.margin + r ||
        y > cameraState.viewportHeight + ECOLOGY_FEEDING.margin + r)
      continue;
    if (c.scale < ECOLOGY_FEEDING.min_scale ||
        kind !== INVERTEBRATE_KIND.grazing && r < ECOLOGY_FEEDING.min_radius)
      continue;
    if (++effectsState.ecologyCount > ECOLOGY_FEEDING.max_animals)
      break;
    const phase = (time * ECOLOGY_FEEDING.phase_rate +
                   (raw[INVERTEBRATE.id] % ECOLOGY_FEEDING.phase_modulus) *
                       ECOLOGY_FEEDING.phase_spread) %
                  1,
          alpha = Math.min(ECOLOGY_FEEDING.max_alpha, ECOLOGY_FEEDING.alpha + Math.sqrt(rate));
    ctx.globalAlpha = alpha;
    if (kind === INVERTEBRATE_KIND.grazing) {
      const n =
          Math.min(ECOLOGY_FEEDING.max_bites, Math.floor(rate * ECOLOGY_FEEDING.bites_per_rate));
      ctx.strokeStyle = ECOLOGY_FEEDING.bite;
      ctx.lineWidth = ECOLOGY_FEEDING.line_width;
      for (let k = 0; k < n; k++) {
        const angle = k * ECOLOGY_FEEDING.golden_angle + raw[INVERTEBRATE.id],
              pulse = .5 + .5 * Math.sin(time * (ECOLOGY_FEEDING.pulse_rate +
                                                 k * ECOLOGY_FEEDING.pulse_rate_per_bite) +
                                         k * ECOLOGY_FEEDING.pulse_offset),
              radius = r + ECOLOGY_FEEDING.ring_gap + ECOLOGY_FEEDING.ring_pulse * pulse,
              px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.moveTo(px - 1, py);
        ctx.lineTo(px + 1, py - ECOLOGY_FEEDING.crumb);
        ctx.moveTo(px, py);
        ctx.lineTo(px - ECOLOGY_FEEDING.crumb_side * Math.sin(angle),
                   py + ECOLOGY_FEEDING.crumb_side * Math.cos(angle));
        ctx.stroke();
      }
    } else if (kind === INVERTEBRATE_KIND.mussel || kind === INVERTEBRATE_KIND.worm) {
      const variation = idPhase(p[INVERTEBRATE.id]),
            angle =
                (p[INVERTEBRATE.angle] || 0) + (kind === INVERTEBRATE_KIND.mussel
                                                    ? (variation - .5) * ECOLOGY_FEEDING.mussel_tilt
                                                    : 0),
            nx = Math.sin(angle), ny = -Math.cos(angle),
            height = musselHeight(p[INVERTEBRATE.morph] || 0),
            inlet = kind === INVERTEBRATE_KIND.mussel ? r * height * ECOLOGY_FEEDING.inlet : 0,
            mx = x + nx * inlet -
                 (kind === INVERTEBRATE_KIND.mussel
                      ? Math.sin(p[INVERTEBRATE.angle] || 0) * r * ECOLOGY_FEEDING.hinge
                      : 0),
            my = y + ny * inlet +
                 (kind === INVERTEBRATE_KIND.mussel
                      ? Math.cos(p[INVERTEBRATE.angle] || 0) * r * ECOLOGY_FEEDING.hinge
                      : 0),
            count = Math.min(ECOLOGY_FEEDING.max_cells,
                             Math.max(1, Math.ceil(rate * ECOLOGY_FEEDING.cells_per_rate)));
      ctx.strokeStyle = ECOLOGY_FEEDING.crumb;
      ctx.fillStyle = ECOLOGY_FEEDING.stream;
      ctx.lineWidth =
          Math.min(ECOLOGY_FEEDING.max_width,
                   Math.max(ECOLOGY_FEEDING.min_width, c.scale * ECOLOGY_FEEDING.width));
      for (let k = 0; k < count; ++k) {
        const u = (phase + k * ECOLOGY_FEEDING.golden) % 1,
              spread = Math.max(ECOLOGY_FEEDING.min_spread,
                                Math.min(ECOLOGY_FEEDING.max_spread, r * ECOLOGY_FEEDING.spread)),
              side = k % 2 ? 1 : -1,
              px =
                  mx + nx * spread * (1 - u) - ny * side * spread * ECOLOGY_FEEDING.drift * (1 - u),
              py =
                  my + ny * spread * (1 - u) + nx * side * spread * ECOLOGY_FEEDING.drift * (1 - u),
              size = Math.min(ECOLOGY_FEEDING.max_size,
                              Math.max(ECOLOGY_FEEDING.min_size, c.scale * ECOLOGY_FEEDING.size));
        ctx.globalAlpha = alpha * Math.sin(Math.PI * u) ** 2;
        paintIntakePlankton(ctx, px, py, size, angle + Math.PI / 2);
      }
    }
  }
  ctx.restore();
}

// Combat and feeding events for SHOWN_STEPS steps: crumbs from plants and shells, a gulped fish
// shrinking into the mouth, and blood drops spraying from wounds.
const COMBAT_DRAW = Object.freeze({
  shown_steps : 24,
  max_radius : 360,
  margin : 100,
  min_fish_radius : 18,
  plant_alpha : .9,
  tint_gain : 1.15,
  plant_crumbs : 4,
  max_extra_crumbs : 6,
  crumbs_per_strength : 4,
  crumbs : 3,
  min_crumb : 1.2,
  max_crumb : 4,
  crumb_per_radius : .5,
  crumb_per_scale : .4,
  min_chip : .8,
  max_chip : 4,
  chip_per_radius : .22,
  spread_per_id : .37,
  golden_angle : 2.4,
  travel : .12,
  travel_per_time : .40,
  min_travel : 8,
  max_travel : 24,
  travel_per_radius : 3,
  sink : 4,
  chip_x : .6,
  chip_y : .3,
  gulp_speed : 1.5,
  min_gulp : 8,
  gulp_per_radius : .9,
  gulp_per_bite : 2,
  prey_alpha : .92,
  prey_fade : 12,
  tail_per_radius : 3,
  min_tail_width : .6,
  tail_width : .7,
  tail_bend : .5,
  tail_side : .2,
  min_prey : .5,
  prey_length : 1.4,
  prey_height : .6,
  fin_angle : .4,
  fin_length : 2,
  min_dot : .3,
  drops : 3,
  drops_per_strength : 5,
  drop_travel : .05,
  drop_travel_per_time : .25,
  drop_travel_px : 5,
  drop_spread : .42,
  drop_jitter : .3,
  hash_a : 7,
  hash_b : 11,
  speed_base : .5,
  speed_span : .5,
  hash_range : 10,
  drop_sink : 4,
  min_drop_width : .8,
  max_drop_width : 6,
  drop_width : .018,
  drop_thinning : .5,
  drop_start : .6,
  drop_start_per_time : .2,
  min_drop : .7,
  max_drop : 5,
  drop_size : .015,
  drop_shrink : .5,
  crack : '#b9ad8f',
  scrape : '#859967',
  crumb : '#b99a7d',
  blood : '#ff3b4e',
  blood_dark : '#cb233b'
});
export function paintCombat(f, c, now = displayNow(), only = null) {
  const effects = collectCombat(f, now);
  if (!effects.length)
    return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const {event : e, born, prey} of effects) {
    if (only && !only.has(e[COMBAT.source]))
      continue;
    if (e[COMBAT.kind] === FEEDING_EFFECT.shell_closed)
      continue; // Pressure/release belongs to the jaw pose, never blood.
    const t = Math.max(0, (displayStep(f) - born) / COMBAT_DRAW.shown_steps), fade = (1 - t) ** 2,
          r = Math.min(COMBAT_DRAW.max_radius, e[COMBAT.radius] * c.scale),
          strength = Math.min(1, Math.sqrt(Math.max(0, e[COMBAT.strength]))),
          offset = e[COMBAT.kind] === FEEDING_EFFECT.none ? e[COMBAT.radius] : 0,
          q = worldToScreen({
            x : e[COMBAT.x] + Math.cos(e[COMBAT.angle]) * offset,
            y : e[COMBAT.y] + Math.sin(e[COMBAT.angle]) * offset
          },
                            c),
          x = q.x, y = q.y;
    if (x < -r - COMBAT_DRAW.margin || x > cameraState.viewportWidth + r + COMBAT_DRAW.margin ||
        y < -r - COMBAT_DRAW.margin || y > cameraState.viewportHeight + r + COMBAT_DRAW.margin)
      continue;
    if ([ FEEDING_EFFECT.scrape, FEEDING_EFFECT.bite, FEEDING_EFFECT.crack ].includes(
            e[COMBAT.kind])) {
      const fish = frameFish(f, e[COMBAT.source]);
      // Plant bites stay visible at every zoom: a puff of crumbs in the organ's own colour.
      const plant = e[COMBAT.kind] !== FEEDING_EFFECT.scrape;
      if (!fish || (!plant && fishDisplayRadius(fish, c.scale) < COMBAT_DRAW.min_fish_radius))
        continue;
      ctx.globalAlpha = fade * (plant ? COMBAT_DRAW.plant_alpha : 1);
      const tinted = plant && e.length >= COMBAT.count &&
                     !(e[COMBAT.red] === 1 && e[COMBAT.green] === 0 && e[COMBAT.blue] === 0);
      ctx.fillStyle = tinted ? rgb(e.slice(COMBAT.red, COMBAT.blue + 1)
                                       .map(v => Math.min(1, v * COMBAT_DRAW.tint_gain)))
                      : e[COMBAT.kind] === FEEDING_EFFECT.crack  ? COMBAT_DRAW.crack
                      : e[COMBAT.kind] === FEEDING_EFFECT.scrape ? COMBAT_DRAW.scrape
                                                                 : COMBAT_DRAW.crumb;
      const count = plant ? COMBAT_DRAW.plant_crumbs +
                                Math.min(COMBAT_DRAW.max_extra_crumbs,
                                         Math.round(COMBAT_DRAW.crumbs_per_strength * strength))
                          : COMBAT_DRAW.crumbs,
            size = plant
                       ? Math.max(COMBAT_DRAW.min_crumb,
                                  Math.min(COMBAT_DRAW.max_crumb,
                                           r * COMBAT_DRAW.crumb_per_radius +
                                               c.scale * COMBAT_DRAW.crumb_per_scale))
                       : Math.max(COMBAT_DRAW.min_chip,
                                  Math.min(COMBAT_DRAW.max_chip, r * COMBAT_DRAW.chip_per_radius));
      for (let j = 0; j < count; j++) {
        const angle = e[COMBAT.id] * COMBAT_DRAW.spread_per_id + j * COMBAT_DRAW.golden_angle,
              travel = (COMBAT_DRAW.travel + COMBAT_DRAW.travel_per_time * t) *
                       (plant ? Math.max(COMBAT_DRAW.min_travel,
                                         Math.min(COMBAT_DRAW.max_travel,
                                                  COMBAT_DRAW.travel_per_radius * r))
                              : Math.min(r, COMBAT_DRAW.max_travel)),
              px = x + Math.cos(angle) * travel,
              py = y + Math.sin(angle) * travel + COMBAT_DRAW.sink * t * t;
        ctx.beginPath();
        ctx.moveTo(px - size, py);
        ctx.lineTo(px + size * COMBAT_DRAW.chip_x, py - size);
        ctx.lineTo(px + size, py + size * COMBAT_DRAW.chip_y);
        ctx.closePath();
        ctx.fill();
      }
      continue;
    }
    if ([ FEEDING_EFFECT.swallow, FEEDING_EFFECT.worm, FEEDING_EFFECT.gulp_fish ].includes(
            e[COMBAT.kind])) {
      const fish = frameFish(f, e[COMBAT.source]);
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
              u = Math.min(1, t * COMBAT_DRAW.gulp_speed),
              sx = x + horizontalDelta((target.x - x) / c.scale) * c.scale * u,
              sy = y + (target.y - y) * u;
        if (Math.hypot(horizontalDelta((target.x - x) / c.scale) * c.scale, target.y - y) >
            Math.max(COMBAT_DRAW.min_gulp,
                     radius * COMBAT_DRAW.gulp_per_radius + COMBAT_DRAW.gulp_per_bite * r))
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
        ctx.globalAlpha = COMBAT_DRAW.prey_alpha * Math.min(1, (1 - u) * COMBAT_DRAW.prey_fade);
        ctx.fillStyle = rgb(e.slice(COMBAT.red, COMBAT.blue + 1));
        ctx.beginPath();
        if (e[COMBAT.kind] === FEEDING_EFFECT.worm) {
          const tail = Math.max(1, r * COMBAT_DRAW.tail_per_radius), angle = shown[FISH.angle];
          ctx.strokeStyle = rgb(e.slice(COMBAT.red, COMBAT.blue + 1));
          ctx.lineWidth = Math.max(COMBAT_DRAW.min_tail_width, r * COMBAT_DRAW.tail_width);
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(sx - Math.cos(angle) * tail * COMBAT_DRAW.tail_bend -
                                   Math.sin(angle) * tail * COMBAT_DRAW.tail_side,
                               sy - Math.sin(angle) * tail * COMBAT_DRAW.tail_bend +
                                   Math.cos(angle) * tail * COMBAT_DRAW.tail_side,
                               sx - Math.cos(angle) * tail, sy - Math.sin(angle) * tail);
          ctx.stroke();
        } else if (e[COMBAT.kind] === FEEDING_EFFECT.gulp_fish) {
          const size = Math.max(COMBAT_DRAW.min_prey, r);
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
            ctx.ellipse(sx, sy, size * COMBAT_DRAW.prey_length, size * COMBAT_DRAW.prey_height,
                        shown[FISH.angle], 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(sx - Math.cos(shown[FISH.angle]) * size,
                       sy - Math.sin(shown[FISH.angle]) * size);
            ctx.lineTo(sx - Math.cos(shown[FISH.angle] - COMBAT_DRAW.fin_angle) * size *
                                COMBAT_DRAW.fin_length,
                       sy - Math.sin(shown[FISH.angle] - COMBAT_DRAW.fin_angle) * size *
                                COMBAT_DRAW.fin_length);
            ctx.lineTo(sx - Math.cos(shown[FISH.angle] + COMBAT_DRAW.fin_angle) * size *
                                COMBAT_DRAW.fin_length,
                       sy - Math.sin(shown[FISH.angle] + COMBAT_DRAW.fin_angle) * size *
                                COMBAT_DRAW.fin_length);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          ctx.arc(sx, sy, Math.max(COMBAT_DRAW.min_dot, r), 0, 2 * Math.PI);
          ctx.fill();
        }
        ctx.restore();
      }
      continue;
    }
    ctx.globalAlpha = fade;
    ctx.strokeStyle = COMBAT_DRAW.blood;
    ctx.fillStyle = COMBAT_DRAW.blood_dark;
    const count = COMBAT_DRAW.drops + Math.round(COMBAT_DRAW.drops_per_strength * strength),
          travel = (COMBAT_DRAW.drop_travel + COMBAT_DRAW.drop_travel_per_time * t) * r +
                   COMBAT_DRAW.drop_travel_px * t;
    for (let i = 0; i < count; i++) {
      const angle = e[COMBAT.angle] + (i - (count - 1) / 2) * COMBAT_DRAW.drop_spread +
                    COMBAT_DRAW.drop_jitter *
                        Math.sin(e[COMBAT.id] * COMBAT_DRAW.hash_a + i * COMBAT_DRAW.hash_b),
            speed = COMBAT_DRAW.speed_base +
                    COMBAT_DRAW.speed_span *
                        ((i * COMBAT_DRAW.hash_a + e[COMBAT.id]) % COMBAT_DRAW.hash_b) /
                        COMBAT_DRAW.hash_range,
            dx = Math.cos(angle) * travel * speed,
            dy = Math.sin(angle) * travel * speed + t * t * COMBAT_DRAW.drop_sink;
      ctx.lineWidth = Math.max(COMBAT_DRAW.min_drop_width,
                               Math.min(COMBAT_DRAW.max_drop_width, r * COMBAT_DRAW.drop_width)) *
                      (1 - t * COMBAT_DRAW.drop_thinning);
      ctx.beginPath();
      ctx.moveTo(x + dx * (COMBAT_DRAW.drop_start + COMBAT_DRAW.drop_start_per_time * t),
                 y + dy * (COMBAT_DRAW.drop_start + COMBAT_DRAW.drop_start_per_time * t));
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + dx, y + dy,
              Math.max(COMBAT_DRAW.min_drop,
                       Math.min(COMBAT_DRAW.max_drop, r * COMBAT_DRAW.drop_size)) *
                  (1 - COMBAT_DRAW.drop_shrink * t),
              0, Math.PI * 2);
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

// Blood drops come in BLOOD_SHADES and fade in BLOOD_FADES steps.
const BLOOD_SHADES = Object.freeze([ '#b62838', '#d53946', '#7e172b' ]), BLOOD_FADES = 4;
// Blood sprays up to MAX_DROPS drops per wound, faster and more with the loss, each living LIFE
// plus up to LIFE_SPREAD steps.
const BLOOD = Object.freeze({
  min_loss : .0005,
  max_drops : 96,
  drops : 80,
  drop_radius : 4,
  seed_id : 131,
  seed_step : .37,
  spread : 2.2,
  base_speed : .15,
  speed_per_loss : 1.3,
  speed_spread : .4,
  seed_speed : 41,
  start : .7,
  inherit : .35,
  size : .10,
  size_spread : .18,
  seed_size : 17,
  life : 24,
  life_spread : 36,
  seed_life : 29,
  kept : 1024
});
function prepareBlood(f) {
  if (effectsState.bloodRevision === sceneState.frameRevision)
    return;
  effectsState.bloodRevision = sceneState.frameRevision;
  const next = new Map();
  for (const [id, total, x, y, nx, ny, r, vx, vy] of f.wounds || []) {
    next.set(id, total);
    const lost = Math.max(0, total - (effectsState.bloodSeen.get(id) || 0));
    if (!effectsState.bloodReady || lost < BLOOD.min_loss)
      continue;
    const normal = Math.hypot(nx, ny), ax = normal ? nx / normal : Math.cos(id),
          ay = normal ? ny / normal : Math.sin(id),
          count =
              Math.min(BLOOD.max_drops, Math.ceil(BLOOD.drops * Math.sqrt(lost) *
                                                  Math.sqrt(Math.max(1, r / BLOOD.drop_radius))));
    for (let k = 0; k < count; ++k) {
      const seed = id * BLOOD.seed_id + k + f.step * BLOOD.seed_step,
            spread = (plantNoise(seed) - .5) * BLOOD.spread, angle = Math.atan2(-ay, -ax) + spread,
            speed = (BLOOD.base_speed + BLOOD.speed_per_loss * Math.sqrt(lost)) *
                    (BLOOD.speed_spread + plantNoise(seed + BLOOD.seed_speed));
      effectsState.bloodParticles.push({
        x : x + ax * r * BLOOD.start,
        y : y + ay * r * BLOOD.start,
        vx : Math.cos(angle) * speed + BLOOD.inherit * vx,
        vy : Math.sin(angle) * speed + BLOOD.inherit * vy,
        angle,
        r : (BLOOD.size + BLOOD.size_spread * plantNoise(seed + BLOOD.seed_size)) * Math.sqrt(r),
        birth : sceneState.previous?.step ?? f.step,
        life : BLOOD.life + BLOOD.life_spread * plantNoise(seed + BLOOD.seed_life),
        shade : k % BLOOD_SHADES.length
      });
    }
  }
  effectsState.bloodSeen = next;
  effectsState.bloodReady = true;
  effectsState.bloodParticles =
      effectsState.bloodParticles.filter(p => f.step - p.birth < p.life).slice(-BLOOD.kept);
}

// Drops slow with DRAG per step and sink; fresh ones stretch along their path.
const BLOOD_DRAW = Object.freeze(
    {drag : .052, sink : .0012, min_radius : .3, stretch : 1.8, stretch_time : 7, alpha : .85});
export function paintBlood(f, c, blend, shifts) {
  prepareBlood(f);
  if (!effectsState.bloodParticles.length)
    return;
  const step = displayStep(f, blend), groups = new Map();
  for (const p of effectsState.bloodParticles) {
    const age = Math.max(0, step - p.birth);
    if (age >= p.life)
      continue;
    const travel = -Math.expm1(-BLOOD_DRAW.drag * age) / BLOOD_DRAW.drag,
          wx = wrapScreenX(p.x + p.vx * travel),
          wy = p.y + p.vy * travel + BLOOD_DRAW.sink * age * age,
          fade = Math.min(BLOOD_FADES - 1, Math.floor(BLOOD_FADES * age / p.life)),
          key = p.shade * BLOOD_FADES + fade;
    if (!groups.has(key))
      groups.set(key, []);
    for (const shift of shifts) {
      const x = (wx + shift) * c.scale + c.ox, y = wy * c.scale + c.oy,
            r = Math.max(BLOOD_DRAW.min_radius, p.r * c.scale);
      if (x + r < 0 || x - r > cameraState.viewportWidth || y + r < 0 ||
          y - r > cameraState.viewportHeight)
        continue;
      groups.get(key).push(
          [ x, y, r, p.angle, 1 + BLOOD_DRAW.stretch * Math.exp(-age / BLOOD_DRAW.stretch_time) ]);
    }
  }
  ctx.save();
  clipObstacles(f, c, ctx,
                {x : 0, y : 0, w : cameraState.viewportWidth, h : cameraState.viewportHeight});
  for (const [key, points] of groups) {
    ctx.fillStyle = BLOOD_SHADES[Math.floor(key / BLOOD_FADES)];
    ctx.globalAlpha = BLOOD_DRAW.alpha * (1 - (key % BLOOD_FADES + .5) / BLOOD_FADES);
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
