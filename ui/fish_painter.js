import {FINS} from './fin_stroke.js';
import {
  ANATOMY,
  BODY_SHAPE,
  BODY_UNIT,
  CORPSE,
  CORPSE_STATE,
  CORPSE_VISUAL,
  DEVELOPMENT,
  FIN,
  FIN_SHAPE,
  FISH,
  MOTOR_KIND,
  RGB
} from './schema.js';
import {fishCNSShape} from './brain_geometry.js';
import {isSickFish} from './cockpit.js';
import {rgb} from './dom.js';
import {
  fishBodyPath,
  fishFinPath,
  fishFinPoint,
  fishFinShapes,
  fishRearFinShape,
  fishRenderRadius,
  fishTint
} from './fish_fins.js';
import {
  ALONG,
  fishAlong,
  fishAnatomy,
  fishSnapshotAnatomy,
  paintFishPattern
} from './fish_forms.js';
import {
  fishBezier,
  fishEmbryo,
  fishFlank,
  fishHeadCurves,
  fishTraceCurves
} from './fish_geometry.js';
import {
  FIN_TIP,
  fishBarbel,
  fishCheekPath,
  fishDefenseSpines,
  fishEye,
  fishFinShape,
  fishGametePath,
  fishGameteShape,
  fishGillFolds,
  fishGillShape,
  fishJawEdge,
  fishJawFiber,
  fishLateralPoint,
  fishMouthInterior,
  fishMouthPath,
  fishMouthShape,
  fishNosePath,
  fishNoseShape,
  fishSkinPoint,
  fishSuctionFlow
} from './fish_organs.js';
import {paintSelection} from './tank.js';
import {plantNoise} from './water_view.js';
export const fish_painterState = {};

// Fins shade from the root towards the tip from MIN_RADIUS pixels on; smaller ones are FLAT.
const FIN_SHADE =
    Object.freeze({min_radius : 14, flat : .10, root : .06, mid_at : .55, mid : .14, edge : .36});
function fishFinColor(g, r, a, index, tint) {
  if (r < FIN_SHADE.min_radius || !g.createLinearGradient)
    return tint(FIN_SHADE.flat);
  const f = fishFinShape(a, index), edge = fishBezier(f.curves[FIN_TIP], .5),
        shade = g.createLinearGradient(f.root[0] * r, f.root[1] * r, edge[0] * r, edge[1] * r);
  if (!shade?.addColorStop)
    return tint(FIN_SHADE.flat);
  shade.addColorStop(0, tint(-FIN_SHADE.root));
  shade.addColorStop(FIN_SHADE.mid_at, tint(FIN_SHADE.mid));
  shade.addColorStop(1, tint(FIN_SHADE.edge));
  return shade;
}

// Small fish: body and fins in one tint, the pattern from PATTERN_MIN_RADIUS pixels on, eyes and a
// sickness dot.
const OVERVIEW = Object.freeze({
  pose_tolerance : 1e-5,
  body : .90,
  pattern_min_radius : 1.5,
  eye_min_radius : 1.2,
  eye_line : .25,
  eye_min_width : .5,
  sick_min_dot : .65,
  sick_dot : .10,
  pupil : '#0b2029',
  sick : '#ff5570'
});
function paintFishOverview(g, p, r, angle, a, light = 1, opacity = 1) {
  if (p[FISH.fin_pose]?.slice(0, FINS).some((v, k) => Math.abs(v - a.finPose(k)) >
                                                      OVERVIEW.pose_tolerance))
    a = {...a, finPose : k => p[FISH.fin_pose][k] || 0};
  const color = fishTint(p, a), tint = (factor) => rgb(color.map(v => v * factor * light));
  g.save();
  g.translate(0, 0);
  g.rotate(angle);
  g.globalAlpha = opacity;
  g.fillStyle = tint(OVERVIEW.body);
  for (const side of [0, 1]) {
    fishTraceCurves(g, r, fishRearFinShape(a, side));
    g.fill();
  }
  for (let index = 0; index < FINS; index++)
    if (a.fin(index)[FIN_SHAPE.strength] > 0) {
      fishFinPath(g, r, a, index);
      g.fill();
    }
  g.fillStyle = tint(OVERVIEW.body);
  fishBodyPath(g, r, a);
  g.fill();
  if (r > OVERVIEW.pattern_min_radius)
    paintFishPattern(g, p, r, a, opacity, light);
  if (r > OVERVIEW.eye_min_radius)
    for (const side of [0, 1])
      if (a.organs[ANATOMY.eye_left + side]) {
        const eye = fishEye(a, side);
        g.strokeStyle = tint(-OVERVIEW.eye_line);
        g.lineWidth = Math.max(OVERVIEW.eye_min_width, eye.ry * r);
        g.beginPath();
        g.moveTo(eye.baseX * r, eye.baseY * r);
        g.lineTo(eye.x * r, eye.y * r);
        g.stroke();
        g.fillStyle = OVERVIEW.pupil;
        g.beginPath();
        g.ellipse(eye.x * r, eye.y * r, eye.rx * r, eye.ry * r, 0, 0, 2 * Math.PI);
        g.fill();
      }
  if (isSickFish(p)) {
    g.fillStyle = OVERVIEW.sick;
    g.beginPath();
    g.arc(a.chestBack * r, 0, Math.max(OVERVIEW.sick_min_dot, r * OVERVIEW.sick_dot), 0,
          2 * Math.PI);
    g.fill();
  }
  g.restore();
}

// Cacheable skin uses the exact inspection contours, pigments and light shading.
// Skin: shading across the body, outline, a gloss line, the gill slit, lateral line pores and
// touch marks, each from its pixel size on.
const SURFACE = Object.freeze({
  shade_min_radius : 7,
  shade_edge : .25,
  shade_from : .38,
  shade_middle : .025,
  shade_to : .62,
  outline : .35,
  outline_min_width : .55,
  outline_width : .015,
  detail_min_radius : 10,
  gloss : .35,
  gloss_alpha : .18,
  gloss_width : .018,
  gloss_steps : 24,
  gloss_across : .48,
  gill_at : .035,
  gill_shade : .3,
  gill_width : .012,
  gill_back : .04,
  gill_root : .32,
  gill_bend_back : .10,
  gill_bend : .72,
  gill_end : .90,
  lateral_tint : .4,
  lateral_alpha : .6,
  lateral_steps : 16,
  lateral_pores : 5,
  pore_min_radius : .4,
  pore_radius : .009,
  pore_tint : .3,
  touch_min_radius : 12,
  touch_tint : .4,
  touch_min_width : .4,
  touch_width : .005,
  touch_alpha : .4,
  touch_marks : 8,
  mark_front : .02,
  mark_half : .014,
  mark_back : .025
});
function paintFishSurface(ctx, p, r, anatomy, opacity = 1, light = 1) {
  const organs = p[FISH.organs] || [], flank = anatomy.flank, color = fishTint(p, anatomy),
        bodyColor = rgb(color.map(v => v * light)),
        tint = factor =>
            rgb(color.map(v => (factor > 0 ? v + (1 - v) * factor : v * (1 + factor)) * light));
  ctx.globalAlpha = opacity;
  ctx.fillStyle = bodyColor;
  if (r > SURFACE.shade_min_radius) {
    const shade = ctx.createLinearGradient?.(0, -r * Math.max(...flank), 0, r * Math.max(...flank));
    if (shade?.addColorStop) {
      shade.addColorStop(0, tint(-SURFACE.shade_edge));
      shade.addColorStop(SURFACE.shade_from, tint(SURFACE.shade_middle));
      shade.addColorStop(SURFACE.shade_to, tint(SURFACE.shade_middle));
      shade.addColorStop(1, tint(-SURFACE.shade_edge));
      ctx.fillStyle = shade;
    }
  }
  fishBodyPath(ctx, r, anatomy);
  ctx.fill();
  paintFishPattern(ctx, p, r, anatomy, opacity, light);
  fishBodyPath(ctx, r, anatomy);
  ctx.strokeStyle = tint(-SURFACE.outline);
  ctx.lineWidth = Math.max(SURFACE.outline_min_width, r * SURFACE.outline_width);
  ctx.stroke();
  if (r > SURFACE.detail_min_radius) {
    ctx.save();
    fishBodyPath(ctx, r, anatomy);
    ctx.clip();
    ctx.strokeStyle = tint(SURFACE.gloss);
    ctx.globalAlpha = opacity * SURFACE.gloss_alpha;
    ctx.lineWidth = r * SURFACE.gloss_width;
    ctx.beginPath();
    for (let i = 0; i <= SURFACE.gloss_steps; i++) {
      const p = fishFlank(anatomy, 0, i / SURFACE.gloss_steps);
      if (i)
        ctx.lineTo(p[0] * r, p[1] * SURFACE.gloss_across * r);
      else
        ctx.moveTo(p[0] * r, p[1] * SURFACE.gloss_across * r);
    }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = opacity;
    for (let side = 0; side < 2; ++side) {
      const sign = side ? 1 : -1, edge = fishFlank(anatomy, side, SURFACE.gill_at);
      ctx.strokeStyle = tint(-SURFACE.gill_shade);
      ctx.lineWidth = r * SURFACE.gill_width;
      ctx.beginPath();
      ctx.moveTo((anatomy.headBack + SURFACE.gill_back) * r,
                 sign * anatomy.neckWidth * SURFACE.gill_root * r);
      ctx.quadraticCurveTo((anatomy.headBack - SURFACE.gill_bend_back * anatomy.chestLength) * r,
                           edge[1] * SURFACE.gill_bend * r, edge[0] * r,
                           edge[1] * SURFACE.gill_end * r);
      ctx.stroke();
      if (organs[ANATOMY.lateral_left + side]) {
        ctx.strokeStyle = tint(SURFACE.lateral_tint);
        ctx.globalAlpha = opacity * SURFACE.lateral_alpha;
        ctx.beginPath();
        for (let i = 0; i <= SURFACE.lateral_steps; i++) {
          const q = fishLateralPoint(anatomy, side, i / SURFACE.lateral_steps);
          if (i)
            ctx.lineTo(q[0] * r, q[1] * r);
          else
            ctx.moveTo(q[0] * r, q[1] * r);
        }
        ctx.stroke();
        for (let i = 0; i < SURFACE.lateral_pores; i++) {
          const q = fishLateralPoint(anatomy, side, (i + .5) / SURFACE.lateral_pores);
          ctx.beginPath();
          ctx.arc(q[0] * r, q[1] * r, Math.max(SURFACE.pore_min_radius, r * SURFACE.pore_radius), 0,
                  2 * Math.PI);
          ctx.fillStyle = tint(SURFACE.pore_tint);
          ctx.fill();
        }
        ctx.globalAlpha = opacity;
      }
      if (organs[ANATOMY.touch_left + side] && r > SURFACE.touch_min_radius) {
        ctx.strokeStyle = tint(SURFACE.touch_tint);
        ctx.lineWidth = Math.max(SURFACE.touch_min_width, r * SURFACE.touch_width);
        ctx.globalAlpha = opacity * SURFACE.touch_alpha;
        for (let i = 0; i < SURFACE.touch_marks; i++) {
          const q = fishSkinPoint(anatomy, side, (i + .5) / SURFACE.touch_marks);
          ctx.beginPath();
          ctx.moveTo((q[0] + SURFACE.mark_front) * r, (q[1] - SURFACE.mark_half) * r);
          ctx.quadraticCurveTo((q[0] - SURFACE.mark_back) * r, q[1] * r,
                               (q[0] + SURFACE.mark_front) * r, (q[1] + SURFACE.mark_half) * r);
          ctx.stroke();
        }
        ctx.globalAlpha = opacity;
      }
    }
  }
}

// Inspection and ordinary fish share face and condition geometry.
// Face and condition features, each from its pixel radius on: cheeks and gill folds, nose,
// barbels, mouth and lips, jaw muscle, eyes, the sperm organ, sickness spots and wounds.
const FEATURES = Object.freeze({
  cheek_shade : .10,
  cheek_rage : .25,
  cheek_pale : .2,
  cheek_min_width : .65,
  cheek_width : .016,
  folds_min_radius : 16,
  folds_shade : .40,
  folds_min_width : .6,
  folds_width : .009,
  gill_min_radius : 8,
  gill_shade : .55,
  gill_min_width : .7,
  gill_width : .018,
  nose_min_radius : 8,
  nose_fade : 10,
  nose_tint : .14,
  nose_shade : .40,
  nose_min_width : .55,
  nose_width : .012,
  nostril_min_radius : 18,
  nostril_length : .70,
  nostril_height : .22,
  nostril_tilt : .18,
  nostril_shade : .65,
  barbel_min_radius : 7,
  barbel_tint : .18,
  barbel_min_width : .55,
  barbel_width : .020,
  barbel_alpha : .9,
  barbel_fade : 10,
  barbel_steps : 18,
  mouth_min_radius : 3,
  mouth_fade : 7,
  mouth_tint : .23,
  mouth_min_width : .85,
  mouth_width : .006,
  mouth_width_per_jaw : .010,
  lip_min_radius : 12,
  lip_steps : 16,
  lip_lower : .25,
  lip_upper : .42,
  lip_min_width : .8,
  jaw_min_radius : 16,
  jaw_shade : .18,
  jaw_width : .025,
  jaw_width_per_jaw : .04,
  eye_stalk : .25,
  eye_socket : .5,
  iris_min : .22,
  iris_span : .48,
  pupil_shift : .012,
  glint_min_radius : 12,
  glint_offset : .23,
  glint_radius : .22,
  sperm_min_radius : 14,
  sperm_alpha : .18,
  sperm_alpha_per_fill : .35,
  sperm_shade : .25,
  sperm_min_width : .4,
  sperm_width : .006,
  sperm_min_fill : .05,
  sperm_cell_alpha : .7,
  sperm_cells : 3,
  sperm_cell_spacing : .5,
  sperm_cell_length : .12,
  sperm_cell_height : .16,
  sick_spots : 9,
  sick_start : .18,
  sick_span : .64,
  noise_id : 7,
  noise_spot : 13,
  sick_size : .025,
  sick_size_span : .035,
  noise_size : 11,
  sick_alpha : .25,
  sick_light_every : 3,
  sick_across : .65,
  sick_length : 1.7,
  sick_tilt : 1.3,
  wound_min : .015,
  wounds : 8,
  wound_slots : 9,
  wound_across : .35,
  wound_across_span : .35,
  wound_max_alpha : .9,
  wound_alpha : .18,
  wound_alpha_per_injury : .8,
  cut_back : .07,
  cut_top : .012,
  cut_bulge : .022,
  cut_front : .06,
  cut_front_top : .015,
  cut_tip : .025,
  cut_tip_down : .018,
  cut_tip_per_injury : .018,
  cut_return : .03,
  cut_return_down : .032,
  scar_min_width : .55,
  scar_width : .014,
  scar_back : .05,
  scar_top : .025,
  scar_front : .04,
  scar_bottom : .035,
  mouth : '#492c30',
  iris : '#a6baaa',
  pupil : '#081920',
  glint : '#f0f5df',
  sperm : '#a3b8dc',
  sick_light : '#bbb394',
  sick_dark : '#655e47',
  wound : '#793e36',
  scar : '#e2a18a'
});
function paintFishFeatures(ctx, p, r, anatomy, opacity = 1, light = 1) {
  const {jaw, attack} = anatomy, organs = p[FISH.organs] || [],
              injury = 1 - Math.max(0, Math.min(1, p[FISH.health] ?? 1)),
              color = fishTint(p, anatomy, injury),
              tint = factor => rgb(
                  color.map(v => (factor > 0 ? v + (1 - v) * factor : v * (1 + factor)) * light));
  for (let side = 0; side < 2; side++)
    if (anatomy.attackSides[side] > 0) {
      fishCheekPath(ctx, r, anatomy, side);
      ctx.fillStyle = tint(-FEATURES.cheek_shade);
      ctx.fill();
      ctx.strokeStyle =
          rgb(color.map((c, k) => k === 0 ? c + (1 - c) * FEATURES.cheek_rage * anatomy.aggression
                                          : c * (1 - FEATURES.cheek_pale * anatomy.aggression)));
      ctx.lineWidth = Math.max(FEATURES.cheek_min_width, r * FEATURES.cheek_width);
      ctx.stroke();
      if (r > FEATURES.folds_min_radius) {
        fishGillFolds(ctx, r, anatomy, side);
        ctx.strokeStyle = tint(-FEATURES.folds_shade);
        ctx.lineWidth = Math.max(FEATURES.folds_min_width, r * FEATURES.folds_width);
        ctx.stroke();
      }
    }
  if (r > FEATURES.gill_min_radius) {
    ctx.strokeStyle = tint(-FEATURES.gill_shade);
    ctx.lineWidth = Math.max(FEATURES.gill_min_width, r * FEATURES.gill_width);
    for (const side of [0, 1]) {
      const q = fishGillShape(anatomy, side, anatomy.swallowPose || 0);
      ctx.beginPath();
      ctx.moveTo(q[0][0] * r, q[0][1] * r);
      ctx.bezierCurveTo(q[1][0] * r, q[1][1] * r, q[2][0] * r, q[2][1] * r, q[3][0] * r,
                        q[3][1] * r);
      ctx.stroke();
    }
  }
  for (let side = 0; side < 2; ++side) {
    const sign = side ? 1 : -1;
    if (anatomy.noseSides[side] && r > FEATURES.nose_min_radius) {
      const q = fishNoseShape(anatomy, side);
      fishNosePath(ctx, r, anatomy, side);
      ctx.globalAlpha = opacity * Math.min(1, (r - FEATURES.nose_min_radius) / FEATURES.nose_fade);
      ctx.fillStyle = tint(FEATURES.nose_tint);
      ctx.fill();
      ctx.strokeStyle = tint(-FEATURES.nose_shade);
      ctx.lineWidth = Math.max(FEATURES.nose_min_width, r * FEATURES.nose_width);
      ctx.stroke();
      if (r > FEATURES.nostril_min_radius) {
        ctx.beginPath();
        ctx.ellipse(q.x * r, q.y * r, q.rx * r * FEATURES.nostril_length,
                    q.ry * r * FEATURES.nostril_height, -sign * FEATURES.nostril_tilt, 0,
                    2 * Math.PI);
        ctx.fillStyle = tint(-FEATURES.nostril_shade);
        ctx.fill();
      }
      ctx.globalAlpha = opacity;
    }
  }
  if (r > FEATURES.barbel_min_radius) {
    ctx.strokeStyle = tint(FEATURES.barbel_tint);
    ctx.lineWidth = Math.max(FEATURES.barbel_min_width, r * FEATURES.barbel_width);
    ctx.globalAlpha = opacity * FEATURES.barbel_alpha *
                      Math.min(1, (r - FEATURES.barbel_min_radius) / FEATURES.barbel_fade);
    for (let side = 0; side < 2; side++) {
      if (!anatomy.barbelSides[side])
        continue;
      ctx.beginPath();
      for (let i = 0; i <= FEATURES.barbel_steps; i++) {
        const q = fishBarbel(anatomy, side, i / FEATURES.barbel_steps);
        if (i)
          ctx.lineTo(q[0] * r, q[1] * r);
        else
          ctx.moveTo(q[0] * r, q[1] * r);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = opacity;
  }

  if ((jaw || attack) && r > FEATURES.mouth_min_radius) {
    ctx.globalAlpha = opacity * Math.min(1, (r - FEATURES.mouth_min_radius) / FEATURES.mouth_fade);
    fishMouthPath(ctx, r, anatomy);
    ctx.fillStyle = FEATURES.mouth;
    ctx.fill();
    ctx.strokeStyle = tint(FEATURES.mouth_tint);
    ctx.lineWidth = Math.max(FEATURES.mouth_min_width,
                             r * (FEATURES.mouth_width + FEATURES.mouth_width_per_jaw * jaw));
    ctx.lineCap = 'round';
    ctx.stroke();
    if (r > FEATURES.lip_min_radius) {
      for (let side = 0; side < 2; side++) {
        ctx.beginPath();
        for (let i = 0; i <= FEATURES.lip_steps; i++) {
          const q = fishJawEdge(anatomy, side, i / FEATURES.lip_steps);
          if (i)
            ctx.lineTo(q[0] * r, q[1] * r);
          else
            ctx.moveTo(q[0] * r, q[1] * r);
        }
        ctx.strokeStyle = tint(side ? FEATURES.lip_lower : FEATURES.lip_upper);
        ctx.lineWidth = Math.max(FEATURES.lip_min_width, r * fishMouthShape(anatomy).lip);
        ctx.stroke();
      }
    }
    if (r > FEATURES.jaw_min_radius && jaw) {
      for (let side = 0; side < 2; side++) {
        const f = fishJawFiber(anatomy, side, .5);
        ctx.strokeStyle = tint(-FEATURES.jaw_shade);
        ctx.lineWidth = r * (FEATURES.jaw_width + FEATURES.jaw_width_per_jaw * jaw);
        ctx.beginPath();
        ctx.moveTo(...f[0].map(v => v * r));
        ctx.lineTo(...f[1].map(v => v * r));
        ctx.stroke();
      }
    }
  }
  if (!p.dead)
    fishSuctionFlow(ctx, r, anatomy);
  ctx.globalAlpha = opacity;
  fishMouthInterior(ctx, r, anatomy);
  for (let side = 0; side < 2; ++side) {
    const receptors = organs[ANATOMY.eye_left + side], sign = side ? 1 : -1;
    if (receptors) {
      const q = fishEye(anatomy, side), eye = r * q.r, ey = r * Math.abs(q.y), ex = r * q.x;
      ctx.strokeStyle = tint(-FEATURES.eye_stalk);
      ctx.lineWidth = q.ry * r;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(q.baseX * r, q.baseY * r);
      ctx.lineTo(ex, sign * ey);
      ctx.stroke();
      ctx.fillStyle = tint(-FEATURES.eye_socket);
      ctx.beginPath();
      ctx.ellipse(ex, sign * ey, q.rx * r * BODY_SHAPE.eye_clearance,
                  q.ry * r * BODY_SHAPE.eye_clearance, 0, 0, 2 * Math.PI);
      ctx.fill();
      const iris = ANATOMY.red_left + side * (ANATOMY.red_right - ANATOMY.red_left);
      ctx.fillStyle = organs.length > ANATOMY.blue_right
                          ? rgb(organs.slice(iris, iris + Object.keys(RGB).length)
                                    .map(v => FEATURES.iris_min + FEATURES.iris_span * v))
                          : FEATURES.iris;
      ctx.beginPath();
      ctx.ellipse(ex, sign * ey, q.rx * r, q.ry * r, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = FEATURES.pupil;
      ctx.beginPath();
      ctx.ellipse(ex + r * FEATURES.pupil_shift, sign * ey, q.rx * r * q.pupil, q.ry * r * q.pupil,
                  0, 0, 2 * Math.PI);
      ctx.fill();
      if (r > FEATURES.glint_min_radius) {
        ctx.fillStyle = FEATURES.glint;
        ctx.beginPath();
        ctx.arc(ex + eye * FEATURES.glint_offset, sign * ey - eye * FEATURES.glint_offset,
                eye * FEATURES.glint_radius, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
  if (r > FEATURES.sperm_min_radius && organs[ANATOMY.sperm]) {
    const q = fishGameteShape(anatomy, MOTOR_KIND.sperm);
    ctx.fillStyle = FEATURES.sperm;
    ctx.globalAlpha =
        opacity * (FEATURES.sperm_alpha + FEATURES.sperm_alpha_per_fill * Math.min(1, q.fill));
    fishGametePath(ctx, r, anatomy, MOTOR_KIND.sperm);
    ctx.fill();
    ctx.strokeStyle = tint(-FEATURES.sperm_shade);
    ctx.lineWidth = Math.max(FEATURES.sperm_min_width, r * FEATURES.sperm_width);
    ctx.stroke();
    if (q.fill > FEATURES.sperm_min_fill) {
      ctx.globalAlpha = opacity * FEATURES.sperm_cell_alpha;
      for (let i = 0; i < FEATURES.sperm_cells; i++) {
        ctx.beginPath();
        ctx.ellipse((q.x + q.rx * (i - 1) * FEATURES.sperm_cell_spacing) * r, q.y * r,
                    q.rx * r * FEATURES.sperm_cell_length, q.ry * r * FEATURES.sperm_cell_height, 0,
                    0, 2 * Math.PI);
        ctx.fill();
      }
    }
    ctx.globalAlpha = opacity;
  }
  if (isSickFish(p)) {
    ctx.save();
    fishBodyPath(ctx, r, anatomy);
    ctx.clip();
    for (let i = 0; i < FEATURES.sick_spots; ++i) {
      const t = FEATURES.sick_start +
                FEATURES.sick_span *
                    plantNoise((p[FISH.id] || 1) * FEATURES.noise_id + i * FEATURES.noise_spot),
            q = fishFlank(anatomy, i % 2, t),
            w = r * (FEATURES.sick_size +
                     FEATURES.sick_size_span * plantNoise(i * FEATURES.noise_size + p[FISH.id]));
      ctx.globalAlpha = opacity * FEATURES.sick_alpha;
      ctx.fillStyle = i % FEATURES.sick_light_every ? FEATURES.sick_light : FEATURES.sick_dark;
      ctx.beginPath();
      ctx.ellipse(q[0] * r, q[1] * r * FEATURES.sick_across, w * FEATURES.sick_length, w,
                  i * FEATURES.sick_tilt, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (injury > FEATURES.wound_min) {
    ctx.save();
    fishBodyPath(ctx, r, anatomy);
    ctx.clip();
    const count = Math.max(1, Math.ceil(injury * FEATURES.wounds));
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / FEATURES.wound_slots, side = i % 2, q = fishFlank(anatomy, side, t),
            px = q[0],
            py = q[1] * (FEATURES.wound_across +
                         FEATURES.wound_across_span *
                             plantNoise((p[FISH.id] || 1) * FEATURES.noise_id + i));
      ctx.globalAlpha =
          opacity * Math.min(FEATURES.wound_max_alpha,
                             FEATURES.wound_alpha + injury * FEATURES.wound_alpha_per_injury);
      ctx.fillStyle = FEATURES.wound;
      ctx.beginPath();
      ctx.moveTo((px - FEATURES.cut_back) * r, (py - FEATURES.cut_top) * r);
      ctx.quadraticCurveTo(px * r, (py + FEATURES.cut_bulge) * r, (px + FEATURES.cut_front) * r,
                           (py - FEATURES.cut_front_top) * r);
      ctx.lineTo((px + FEATURES.cut_tip) * r,
                 (py + FEATURES.cut_tip_down + injury * FEATURES.cut_tip_per_injury) * r);
      ctx.quadraticCurveTo((px - FEATURES.cut_return) * r, (py + FEATURES.cut_return_down) * r,
                           (px - FEATURES.cut_back) * r, (py - FEATURES.cut_top) * r);
      ctx.fill();
      ctx.strokeStyle = FEATURES.scar;
      ctx.lineWidth = Math.max(FEATURES.scar_min_width, r * FEATURES.scar_width);
      ctx.beginPath();
      ctx.moveTo((px - FEATURES.scar_back) * r, (py - FEATURES.scar_top) * r);
      ctx.lineTo((px + FEATURES.scar_front) * r, (py + FEATURES.scar_bottom) * r);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Fin rays run at these shares across the tail and side fins.
const TAIL_RAYS = Object.freeze([ .18, .50, .82 ]), SIDE_RAYS = Object.freeze([ .20, .50, .80 ]);
// Eggs with yolk, embryo and development ring; hatched fish with fins, rays, rear fins, spines and
// an impact flash, each from its pixel radius on.
const GLYPH = Object.freeze({
  min_radius : .1,
  embryo_min_radius : 10,
  embryo_min_development : .08,
  embryo_alpha : .15,
  embryo_alpha_per_development : .5,
  yolk_min_radius : 7,
  yolk_alpha : .7,
  yolk_shift : .12,
  yolk_length : .58,
  yolk_height : .52,
  ring_width : 1.5,
  ring_gap : 2.0,
  fin_edge : .18,
  fin_min_width : .45,
  fin_width : .010,
  tail_alpha : .67,
  ray_min_radius : 35,
  ray_tint : .3,
  tail_ray_alpha : .20,
  ray_start : .12,
  ray_end : .94,
  side_alpha : .62,
  side_ray_alpha : .16,
  ray_fade : 30,
  side_ray_width : .005,
  side_ray_start : .06,
  side_ray_mid : .50,
  side_ray_end : .92,
  rear_tint : .06,
  rear_edge : .25,
  rear_width : .012,
  rear_alpha : .78,
  spine_min_radius : 5,
  spine_active : .08,
  spine_tint : .20,
  impact_half : .08,
  impact_min : .08,
  impact_alpha : .7,
  impact_width : .04,
  impact_x0 : .1,
  impact_y0 : .19,
  impact_x1 : .3,
  impact_y1 : .12,
  yolk : '#edc28f',
  spine : '#7bb6c6',
  impact : '#f5e0b6',
  selection : '#faf5db'
});
export function paintFishGlyph(ctx, p, r, a, swimStep, blend = 1, o = null, selected = false,
                               opacity = 1, prepared = null, light = 1) {
  const anatomy = p[FISH.hatched] ? (prepared || fishAnatomy(p, o, blend)) : null;
  const injury = 1 - Math.max(0, Math.min(1, p[FISH.health] ?? 1)),
        color = anatomy ? fishTint(p, anatomy, injury) : p.slice(FISH.red, FISH.blue + 1),
        bodyColor = rgb(color.map(v => v * light));
  const exposure = light,
        tint = (light) =>
            rgb(color.map(v => (light > 0 ? v + (1 - v) * light : v * (1 + light)) * exposure));
  ctx.save();
  ctx.rotate(a);
  ctx.globalAlpha = opacity;
  if (!p[FISH.hatched]) {
    const eggRadius = r;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    if (p.birthShape)
      ctx.ellipse(0, 0, p.birthShape.rx * r / Math.max(GLYPH.min_radius, p[FISH.radius] || r),
                  p.birthShape.ry * r / Math.max(GLYPH.min_radius, p[FISH.radius] || r), 0, 0,
                  2 * Math.PI);
    else
      ctx.arc(0, 0, eggRadius, 0, 2 * Math.PI);
    ctx.fill();
    if (r > GLYPH.embryo_min_radius && !p.birthShape && !p[FISH.nutrient_egg] &&
        (p[FISH.fertilised] || p[FISH.clonal]) &&
        p[FISH.development] > GLYPH.embryo_min_development) {
      const embryo = fishEmbryo(p), shape = fishSnapshotAnatomy(embryo, r),
            size = fishRenderRadius(embryo) * r / p[FISH.radius];
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 2 * Math.PI);
      ctx.clip();
      ctx.translate(-shape.origin[0] * size, -shape.origin[1] * size);
      paintFishOverview(ctx, embryo, size, 0, shape, light,
                        opacity * (GLYPH.embryo_alpha + GLYPH.embryo_alpha_per_development *
                                                            Math.min(1, p[FISH.development])));
      ctx.restore();
    }
    if (r > GLYPH.yolk_min_radius) {
      ctx.fillStyle = GLYPH.yolk;
      ctx.globalAlpha = opacity * GLYPH.yolk_alpha;
      ctx.beginPath();
      ctx.ellipse(-eggRadius * GLYPH.yolk_shift *
                      (p.birthShape ? p.birthShape.rx / (p[FISH.radius] || 1) : 1),
                  0,
                  eggRadius * GLYPH.yolk_length *
                      (p.birthShape ? p.birthShape.rx / (p[FISH.radius] || 1) : 1),
                  eggRadius * GLYPH.yolk_height *
                      (p.birthShape ? p.birthShape.ry / (p[FISH.radius] || 1) : 1),
                  0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = opacity;
    }
    if (!p.birthShape && (p[FISH.fertilised] || p[FISH.clonal])) {
      ctx.strokeStyle = GLYPH.yolk;
      ctx.lineWidth = GLYPH.ring_width;
      ctx.beginPath();
      ctx.arc(0, 0, eggRadius + GLYPH.ring_gap, -Math.PI / 2,
              -Math.PI / 2 + 2 * Math.PI * Math.max(0, Math.min(1, p[FISH.development] || 0)));
      ctx.stroke();
    }
  } else {
    const {fin} = anatomy;
    const central = fin(FIN.tail);
    // Each physical pulse opens its fin; the pose relaxes during the glide.
    if (central[FIN_SHAPE.strength] > 0) {
      ctx.fillStyle = fishFinColor(ctx, r, anatomy, FIN.tail, tint);
      ctx.strokeStyle = tint(-GLYPH.fin_edge);
      ctx.lineWidth = Math.max(GLYPH.fin_min_width, r * GLYPH.fin_width);
      ctx.globalAlpha = opacity * GLYPH.tail_alpha;
      fishFinPath(ctx, r, anatomy, FIN.tail);
      ctx.fill();
      ctx.stroke();
      if (r > GLYPH.ray_min_radius) {
        ctx.strokeStyle = tint(GLYPH.ray_tint);
        ctx.globalAlpha = opacity * GLYPH.tail_ray_alpha;
        for (const across of TAIL_RAYS) {
          const from = fishFinPoint(anatomy, FIN.tail, GLYPH.ray_start, across),
                to = fishFinPoint(anatomy, FIN.tail, GLYPH.ray_end, across);
          ctx.beginPath();
          ctx.moveTo(...from.map(v => v * r));
          ctx.lineTo(...to.map(v => v * r));
          ctx.stroke();
        }
      }
    }
    for (let side = 0; side < 2; ++side) {
      const shape = fin(FIN.left + side);
      if (shape[FIN_SHAPE.strength] <= 0)
        continue;
      ctx.fillStyle = fishFinColor(ctx, r, anatomy, FIN.left + side, tint);
      ctx.strokeStyle = tint(-GLYPH.fin_edge);
      ctx.lineWidth = Math.max(GLYPH.fin_min_width, r * GLYPH.fin_width);
      ctx.globalAlpha = opacity * GLYPH.side_alpha;
      fishFinPath(ctx, r, anatomy, FIN.left + side);
      ctx.fill();
      ctx.stroke();
      if (r > GLYPH.ray_min_radius) {
        ctx.strokeStyle = tint(GLYPH.ray_tint);
        ctx.globalAlpha = opacity * GLYPH.side_ray_alpha *
                          Math.min(1, (r - GLYPH.ray_min_radius) / GLYPH.ray_fade);
        ctx.lineWidth = Math.max(GLYPH.fin_min_width, r * GLYPH.side_ray_width);
        ctx.beginPath();
        for (let lobe = 0; lobe < fishFinShapes(anatomy, FIN.left + side).length; lobe++)
          for (const across of SIDE_RAYS) {
            const from = fishFinPoint(anatomy, FIN.left + side, GLYPH.side_ray_start, across, lobe),
                  mid = fishFinPoint(anatomy, FIN.left + side, GLYPH.side_ray_mid, across, lobe),
                  to = fishFinPoint(anatomy, FIN.left + side, GLYPH.side_ray_end, across, lobe);
            ctx.moveTo(...from.map(v => v * r));
            ctx.quadraticCurveTo(...mid.map(v => v * r), ...to.map(v => v * r));
          }
        ctx.stroke();
      }
    }
    ctx.fillStyle = tint(GLYPH.rear_tint);
    ctx.strokeStyle = tint(-GLYPH.rear_edge);
    ctx.lineWidth = Math.max(GLYPH.fin_min_width, r * GLYPH.rear_width);
    ctx.globalAlpha = opacity * GLYPH.rear_alpha;
    for (const side of [0, 1]) {
      fishTraceCurves(ctx, r, fishRearFinShape(anatomy, side));
      ctx.fill();
      ctx.stroke();
    }
    if (r > GLYPH.spine_min_radius) {
      ctx.fillStyle =
          anatomy.defenseActivity > GLYPH.spine_active ? GLYPH.spine : tint(GLYPH.spine_tint);
      ctx.strokeStyle = tint(-GLYPH.rear_edge);
      ctx.lineWidth = Math.max(GLYPH.fin_min_width, r * GLYPH.rear_width);
      for (let side = 0; side < 2; side++)
        for (const spine of fishDefenseSpines(anatomy, side)) {
          ctx.beginPath();
          spine.forEach((v, i) =>
                            i ? ctx.lineTo(v[0] * r, v[1] * r) : ctx.moveTo(v[0] * r, v[1] * r));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
    }
    paintFishSurface(ctx, p, r, anatomy, opacity, light);
    paintFishFeatures(ctx, p, r, anatomy, opacity, light);
  }
  const impact = (p[FISH.impact] || 0) / (GLYPH.impact_half + (p[FISH.impact] || 0));
  if (impact > GLYPH.impact_min) {
    ctx.strokeStyle = GLYPH.impact;
    ctx.globalAlpha = opacity * impact * GLYPH.impact_alpha;
    ctx.lineWidth = Math.max(1, r * GLYPH.impact_width);
    ctx.beginPath();
    ctx.moveTo(r * GLYPH.impact_x0, -r * GLYPH.impact_y0);
    ctx.lineTo(r * GLYPH.impact_x1, r * GLYPH.impact_y1);
    ctx.stroke();
  }
  ctx.restore();
  if (selected)
    paintSelection(ctx, r, GLYPH.selection);
}

export function corpseFish(p) {
  const v = p[CORPSE.morphology_asset];
  if (!v)
    return null;
  if (!v.fish) {
    const q = Array(FISH.count).fill(0), V = CORPSE_VISUAL, S = CORPSE_STATE, state = v[V.state];
    q[FISH.hatched] = 1;
    q[FISH.hatch_shape] = [ state[S.shell_radius], state[S.birth_tissue] ];
    q[FISH.regions] = v[V.regions];
    q[FISH.body_geometry] = v[V.body];
    q[FISH.organs] = v[V.organs];
    q[FISH.fins] = v[V.fins];
    q[FISH.forms] = v[V.forms];
    q[FISH.contour] = v[V.contour];
    for (const column of ['energy', 'reserve_capacity', 'egg_yolk', 'egg_capacity', 'sperm_store',
                          'sperm_capacity', 'mass', 'tail', 'mouth_pose', 'bite_pose',
                          'suction_pose', 'defense', 'health', 'aggression', 'mean_aggression',
                          'mouth_aperture', 'gut_fill', 'gut_energy'])
      q[FISH[column]] = state[S[column]];
    q[FISH.fin_pose] = [ state[S.fin_tail], state[S.fin_left], state[S.fin_right] ];
    // A corpse keeps the tissue of an adult with its reserve capacity.
    q[FISH.tissue] = state[S.reserve_capacity] * BODY_UNIT.body_tissue / BODY_UNIT.adult_reserve;
    q[FISH.radius] = p[CORPSE.radius];
    q[FISH.neuron_budget] = DEVELOPMENT.sites;
    q.dead = true;
    v.fish = q;
  }
  const q = v.fish;
  q[FISH.red] = p[CORPSE.red];
  q[FISH.green] = p[CORPSE.green];
  q[FISH.blue] = p[CORPSE.blue];
  return q;
}

// A defence spine's outline reaches its tip at this point.
const SPINE_TIP = 2;
// Skeletons: skull and jaw inside the head curves, eye rings, ribs along the body (fewer below
// COARSE_RADIUS pixels) and fin rays.
const SKELETON = Object.freeze({
  coarse_radius : 18,
  snout_gap : .025,
  skull_snout : .96,
  skull_inset : .84,
  eye_ring : .9,
  eye_inset : .86,
  jaw_at : .9,
  jaw_bend : .65,
  coarse_ribs_min : 3,
  coarse_ribs_max : 6,
  coarse_ribs : 3,
  ribs_min : 6,
  ribs_max : 14,
  ribs : 6,
  ribs_per_length : 1.6,
  rib_start : .025,
  rib_span : .94,
  rib_bend_back : .05,
  rib_bend : .42,
  rib_reach : .82,
  rear_ray : .4
});
export function fishSkeletonPath(g, r, a) {
  const coarse = r < SKELETON.coarse_radius;
  const point = p => p.map(v => v * r), head = fishCNSShape(a), rear = fishAlong(a, ALONG.tail);
  g.beginPath();
  g.moveTo((a.snout - SKELETON.snout_gap) * r, 0);
  g.lineTo(head.cx * r, 0);
  g.quadraticCurveTo(a.headBack * r, 0, rear * r, a.flex * r);
  // The skull and jaws follow the same head/face as the live fish.
  for (const side of [0, 1]) {
    const curves = fishHeadCurves(a, side);
    g.moveTo(...point([ a.snout * SKELETON.skull_snout, 0 ]));
    for (const q of curves)
      g.bezierCurveTo(...point([ q[1][0], q[1][1] * SKELETON.skull_inset ]),
                      ...point([ q[2][0], q[2][1] * SKELETON.skull_inset ]),
                      ...point([ q[3][0], q[3][1] * SKELETON.skull_inset ]));
    const eye = fishEye(a, side);
    g.moveTo((eye.x + eye.rx * SKELETON.eye_ring) * r, eye.y * SKELETON.eye_inset * r);
    g.ellipse(eye.x * r, eye.y * SKELETON.eye_inset * r, eye.rx * SKELETON.eye_ring * r,
              eye.ry * SKELETON.eye_ring * r, 0, 0, Math.PI * 2);
    const jaw = fishJawEdge(a, side, SKELETON.jaw_at);
    g.moveTo(head.cx * r, 0);
    g.quadraticCurveTo(a.headFront * r, a.faceWidth * (side ? 1 : -1) * SKELETON.jaw_bend * r,
                       jaw[0] * r, jaw[1] * r);
  }
  const count = coarse ? Math.max(SKELETON.coarse_ribs_min,
                                  Math.min(SKELETON.coarse_ribs_max,
                                           Math.round(SKELETON.coarse_ribs + a.bodyStretch)))
                       : Math.max(SKELETON.ribs_min,
                                  Math.min(SKELETON.ribs_max,
                                           Math.round(SKELETON.ribs +
                                                      SKELETON.ribs_per_length * a.bodyStretch)));
  for (let k = 0; k < count; k++) {
    const t = SKELETON.rib_start + SKELETON.rib_span * (k + .5) / count;
    for (const side of [0, 1]) {
      const q = fishFlank(a, side, t), y = a.flex * t;
      g.moveTo(q[0] * r, y * r);
      g.quadraticCurveTo((q[0] - SKELETON.rib_bend_back * a.bodyStretch) * r,
                         q[1] * SKELETON.rib_bend * r, q[0] * r, q[1] * SKELETON.rib_reach * r);
    }
  }
  for (let index = 0; index < FINS; index++)
    if (a.fin(index)[FIN_SHAPE.strength] > 0)
      for (let lobe = 0; lobe < fishFinShapes(a, index).length; lobe++) {
        const f = fishFinShape(a, index, lobe);
        g.moveTo(f.root[0] * r, 0);
        g.lineTo(...point(f.root));
        for (const across of (coarse ? [ .5 ] : SIDE_RAYS)) {
          const u = f.rimRange[0] + (f.rimRange[1] - f.rimRange[0]) * across,
                end = fishBezier(f.curves[Math.floor(u)], u % 1);
          g.moveTo(...point(f.root));
          g.lineTo(...point(end));
        }
      }
  for (const side of [0, 1]) {
    const fin = fishRearFinShape(a, side), root = fin[0][0];
    for (const t of (coarse ? [ 1 ] : [ SKELETON.rear_ray, 1 ])) {
      const tip = fishBezier(fin[0], t);
      g.moveTo(...point(root));
      g.lineTo(...point(tip));
    }
  }
  for (const side of [0, 1])
    for (const spike of fishDefenseSpines(a, side)) {
      const root = [ (spike[0][0] + spike.at(-1)[0]) * .5, (spike[0][1] + spike.at(-1)[1]) * .5 ];
      g.moveTo(...point(root));
      g.lineTo(...point(spike[SPINE_TIP]));
    }
}
