import {FISH, CORPSE} from './schema.js';
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
import {fishAlong, fishAnatomy, fishSnapshotAnatomy, paintFishPattern} from './fish_forms.js';
import {
  fishBezier,
  fishEmbryo,
  fishFlank,
  fishHeadCurves,
  fishTraceCurves
} from './fish_geometry.js';
import {
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
  fishMouthPath,
  fishMouthInterior,
  fishMouthShape,
  fishNosePath,
  fishNoseShape,
  fishSkinPoint,
  fishSuctionFlow
} from './fish_organs.js';
import {paintSelection} from './tank.js';
import {plantNoise} from './water_view.js';
export const fish_painterState = {};

function fishFinColor(g, r, a, index, tint) {
  if (r < 14 || !g.createLinearGradient)
    return tint(.10);
  const f = fishFinShape(a, index), edge = fishBezier(f.curves[3], .5),
        shade = g.createLinearGradient(f.root[0] * r, f.root[1] * r, edge[0] * r, edge[1] * r);
  if (!shade?.addColorStop)
    return tint(.10);
  shade.addColorStop(0, tint(-.06));
  shade.addColorStop(.55, tint(.14));
  shade.addColorStop(1, tint(.36));
  return shade;
}

function paintFishOverview(g, p, r, angle, a, light = 1, opacity = 1) {
  if (p[FISH.fin_pose]?.slice(0, 3).some((v, k) => Math.abs(v - a.finPose(k)) > 1e-5))
    a = {...a, finPose : k => p[FISH.fin_pose][k] || 0};
  const color = fishTint(p, a), tint = (factor) => rgb(color.map(v => v * factor * light));
  g.save();
  g.translate(0, 0);
  g.rotate(angle);
  g.globalAlpha = opacity;
  g.fillStyle = tint(.90);
  for (const side of [0, 1]) {
    fishTraceCurves(g, r, fishRearFinShape(a, side));
    g.fill();
  }
  for (let index = 0; index < 3; index++)
    if (a.fin(index)[1] > 0) {
      fishFinPath(g, r, a, index);
      g.fill();
    }
  g.fillStyle = tint(.90);
  fishBodyPath(g, r, a);
  g.fill();
  if (r > 1.5)
    paintFishPattern(g, p, r, a, opacity, light);
  if (r > 1.2)
    for (const side of [0, 1])
      if (a.organs[side + 1]) {
        const eye = fishEye(a, side);
        g.strokeStyle = tint(-.25);
        g.lineWidth = Math.max(.5, eye.ry * r);
        g.beginPath();
        g.moveTo(eye.baseX * r, eye.baseY * r);
        g.lineTo(eye.x * r, eye.y * r);
        g.stroke();
        g.fillStyle = '#0b2029';
        g.beginPath();
        g.ellipse(eye.x * r, eye.y * r, eye.rx * r, eye.ry * r, 0, 0, 2 * Math.PI);
        g.fill();
      }
  if (isSickFish(p)) {
    g.fillStyle = '#ff5570';
    g.beginPath();
    g.arc(a.chestBack * r, 0, Math.max(.65, r * .10), 0, 2 * Math.PI);
    g.fill();
  }
  g.restore();
}

// Cacheable skin uses the exact inspection contours, pigments and light shading.
function paintFishSurface(ctx, p, r, anatomy, opacity = 1, light = 1) {
  const organs = p[FISH.organs] || [], flank = anatomy.flank, color = fishTint(p, anatomy),
        bodyColor = rgb(color.map(v => v * light)),
        tint = factor =>
            rgb(color.map(v => (factor > 0 ? v + (1 - v) * factor : v * (1 + factor)) * light));
  ctx.globalAlpha = opacity;
  ctx.fillStyle = bodyColor;
  if (r > 7) {
    const shade = ctx.createLinearGradient?.(0, -r * Math.max(...flank), 0, r * Math.max(...flank));
    if (shade?.addColorStop) {
      shade.addColorStop(0, tint(-.25));
      shade.addColorStop(.38, tint(.025));
      shade.addColorStop(.62, tint(.025));
      shade.addColorStop(1, tint(-.25));
      ctx.fillStyle = shade;
    }
  }
  fishBodyPath(ctx, r, anatomy);
  ctx.fill();
  paintFishPattern(ctx, p, r, anatomy, opacity, light);
  fishBodyPath(ctx, r, anatomy);
  ctx.strokeStyle = tint(-.35);
  ctx.lineWidth = Math.max(.55, r * .015);
  ctx.stroke();
  if (r > 10) {
    ctx.save();
    fishBodyPath(ctx, r, anatomy);
    ctx.clip();
    ctx.strokeStyle = tint(.35);
    ctx.globalAlpha = opacity * .18;
    ctx.lineWidth = r * .018;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const p = fishFlank(anatomy, 0, i / 24);
      if (i)
        ctx.lineTo(p[0] * r, p[1] * .48 * r);
      else
        ctx.moveTo(p[0] * r, p[1] * .48 * r);
    }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = opacity;
    for (let side = 0; side < 2; ++side) {
      const sign = side ? 1 : -1, edge = fishFlank(anatomy, side, .035);
      ctx.strokeStyle = tint(-.3);
      ctx.lineWidth = r * .012;
      ctx.beginPath();
      ctx.moveTo((anatomy.headBack + .04) * r, sign * anatomy.neckWidth * .32 * r);
      ctx.quadraticCurveTo((anatomy.headBack - .10 * anatomy.chestLength) * r, edge[1] * .72 * r,
                           edge[0] * r, edge[1] * .90 * r);
      ctx.stroke();
      if (organs[11 + side]) {
        ctx.strokeStyle = tint(.4);
        ctx.globalAlpha = opacity * .6;
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const q = fishLateralPoint(anatomy, side, i / 16);
          if (i)
            ctx.lineTo(q[0] * r, q[1] * r);
          else
            ctx.moveTo(q[0] * r, q[1] * r);
        }
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
          const q = fishLateralPoint(anatomy, side, (i + .5) / 5);
          ctx.beginPath();
          ctx.arc(q[0] * r, q[1] * r, Math.max(.4, r * .009), 0, 2 * Math.PI);
          ctx.fillStyle = tint(.3);
          ctx.fill();
        }
        ctx.globalAlpha = opacity;
      }
      if (organs[13 + side] && r > 12) {
        ctx.strokeStyle = tint(.4);
        ctx.lineWidth = Math.max(.4, r * .005);
        ctx.globalAlpha = opacity * .4;
        for (let i = 0; i < 8; i++) {
          const q = fishSkinPoint(anatomy, side, (i + .5) / 8);
          ctx.beginPath();
          ctx.moveTo((q[0] + .02) * r, (q[1] - .014) * r);
          ctx.quadraticCurveTo((q[0] - .025) * r, q[1] * r, (q[0] + .02) * r, (q[1] + .014) * r);
          ctx.stroke();
        }
        ctx.globalAlpha = opacity;
      }
    }
  }
}

// Inspection and ordinary fish share face and condition geometry.
function paintFishFeatures(ctx, p, r, anatomy, opacity = 1, light = 1) {
  const {jaw, attack} = anatomy, organs = p[FISH.organs] || [],
              injury = 1 - Math.max(0, Math.min(1, p[FISH.health] ?? 1)),
              color = fishTint(p, anatomy, injury),
              tint = factor => rgb(
                  color.map(v => (factor > 0 ? v + (1 - v) * factor : v * (1 + factor)) * light));
  for (let side = 0; side < 2; side++)
    if (anatomy.attackSides[side] > 0) {
      fishCheekPath(ctx, r, anatomy, side);
      ctx.fillStyle = tint(-.10);
      ctx.fill();
      ctx.strokeStyle = rgb(color.map((c, k) => k === 0 ? c + (1 - c) * .25 * anatomy.aggression
                                                        : c * (1 - .2 * anatomy.aggression)));
      ctx.lineWidth = Math.max(.65, r * .016);
      ctx.stroke();
      if (r > 16) {
        fishGillFolds(ctx, r, anatomy, side);
        ctx.strokeStyle = tint(-.40);
        ctx.lineWidth = Math.max(.6, r * .009);
        ctx.stroke();
      }
    }
  if (r > 8) {
    ctx.strokeStyle = tint(-.55);
    ctx.lineWidth = Math.max(.7, r * .018);
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
    if (anatomy.noseSides[side] && r > 8) {
      const q = fishNoseShape(anatomy, side);
      fishNosePath(ctx, r, anatomy, side);
      ctx.globalAlpha = opacity * Math.min(1, (r - 8) / 10);
      ctx.fillStyle = tint(.14);
      ctx.fill();
      ctx.strokeStyle = tint(-.40);
      ctx.lineWidth = Math.max(.55, r * .012);
      ctx.stroke();
      if (r > 18) {
        ctx.beginPath();
        ctx.ellipse(q.x * r, q.y * r, q.rx * r * .70, q.ry * r * .22, -sign * .18, 0, 2 * Math.PI);
        ctx.fillStyle = tint(-.65);
        ctx.fill();
      }
      ctx.globalAlpha = opacity;
    }
  }
  if (r > 7) {
    ctx.strokeStyle = tint(.18);
    ctx.lineWidth = Math.max(.55, r * .020);
    ctx.globalAlpha = opacity * .9 * Math.min(1, (r - 7) / 10);
    for (let side = 0; side < 2; side++) {
      if (!anatomy.barbelSides[side])
        continue;
      ctx.beginPath();
      for (let i = 0; i <= 18; i++) {
        const q = fishBarbel(anatomy, side, i / 18);
        if (i)
          ctx.lineTo(q[0] * r, q[1] * r);
        else
          ctx.moveTo(q[0] * r, q[1] * r);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = opacity;
  }

  if ((jaw || attack) && r > 3) {
    ctx.globalAlpha = opacity * Math.min(1, (r - 3) / 7);
    fishMouthPath(ctx, r, anatomy);
    ctx.fillStyle = '#492c30';
    ctx.fill();
    ctx.strokeStyle = tint(.23);
    ctx.lineWidth = Math.max(.85, r * (.006 + .010 * jaw));
    ctx.lineCap = 'round';
    ctx.stroke();
    if (r > 12) {
      for (let side = 0; side < 2; side++) {
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const q = fishJawEdge(anatomy, side, i / 16);
          if (i)
            ctx.lineTo(q[0] * r, q[1] * r);
          else
            ctx.moveTo(q[0] * r, q[1] * r);
        }
        ctx.strokeStyle = tint(side ? .25 : .42);
        ctx.lineWidth = Math.max(.8, r * fishMouthShape(anatomy).lip);
        ctx.stroke();
      }
    }
    if (r > 16 && jaw) {
      for (let side = 0; side < 2; side++) {
        const f = fishJawFiber(anatomy, side, .5);
        ctx.strokeStyle = tint(-.18);
        ctx.lineWidth = r * (.025 + .04 * jaw);
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
    const receptors = organs[side + 1], sign = side ? 1 : -1;
    if (receptors) {
      const q = fishEye(anatomy, side), eye = r * q.r, ey = r * Math.abs(q.y), ex = r * q.x;
      ctx.strokeStyle = tint(-.25);
      ctx.lineWidth = q.ry * r;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(q.baseX * r, q.baseY * r);
      ctx.lineTo(ex, sign * ey);
      ctx.stroke();
      ctx.fillStyle = tint(-.5);
      ctx.beginPath();
      ctx.ellipse(ex, sign * ey, q.rx * r * 1.16, q.ry * r * 1.16, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = organs.length >= 21
                          ? rgb(organs.slice(15 + 3 * side, 18 + 3 * side).map(v => .22 + .48 * v))
                          : '#a6baaa';
      ctx.beginPath();
      ctx.ellipse(ex, sign * ey, q.rx * r, q.ry * r, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#081920';
      ctx.beginPath();
      ctx.ellipse(ex + r * .012, sign * ey, q.rx * r * q.pupil, q.ry * r * q.pupil, 0, 0,
                  2 * Math.PI);
      ctx.fill();
      if (r > 12) {
        ctx.fillStyle = '#f0f5df';
        ctx.beginPath();
        ctx.arc(ex + eye * .23, sign * ey - eye * .23, eye * .22, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
  if (r > 14 && organs[6]) {
    const q = fishGameteShape(anatomy, 4);
    ctx.fillStyle = '#a3b8dc';
    ctx.globalAlpha = opacity * (.18 + .35 * Math.min(1, q.fill));
    fishGametePath(ctx, r, anatomy, 4);
    ctx.fill();
    ctx.strokeStyle = tint(-.25);
    ctx.lineWidth = Math.max(.4, r * .006);
    ctx.stroke();
    if (q.fill > .05) {
      ctx.globalAlpha = opacity * .7;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse((q.x + q.rx * (i - 1) * .5) * r, q.y * r, q.rx * r * .12, q.ry * r * .16, 0, 0,
                    2 * Math.PI);
        ctx.fill();
      }
    }
    ctx.globalAlpha = opacity;
  }
  if (isSickFish(p)) {
    ctx.save();
    fishBodyPath(ctx, r, anatomy);
    ctx.clip();
    for (let i = 0; i < 9; ++i) {
      const t = .18 + .64 * plantNoise((p[FISH.id] || 1) * 7 + i * 13),
            q = fishFlank(anatomy, i % 2, t),
            w = r * (.025 + .035 * plantNoise(i * 11 + p[FISH.id]));
      ctx.globalAlpha = opacity * .25;
      ctx.fillStyle = i % 3 ? '#bbb394' : '#655e47';
      ctx.beginPath();
      ctx.ellipse(q[0] * r, q[1] * r * .65, w * 1.7, w, i * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (injury > .015) {
    ctx.save();
    fishBodyPath(ctx, r, anatomy);
    ctx.clip();
    const count = Math.max(1, Math.ceil(injury * 8));
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / 9, side = i % 2, q = fishFlank(anatomy, side, t), px = q[0],
            py = q[1] * (.35 + .35 * plantNoise((p[FISH.id] || 1) * 7 + i));
      ctx.globalAlpha = opacity * Math.min(.9, .18 + injury * .8);
      ctx.fillStyle = '#793e36';
      ctx.beginPath();
      ctx.moveTo((px - .07) * r, (py - .012) * r);
      ctx.quadraticCurveTo(px * r, (py + .022) * r, (px + .06) * r, (py - .015) * r);
      ctx.lineTo((px + .025) * r, (py + .018 + injury * .018) * r);
      ctx.quadraticCurveTo((px - .03) * r, (py + .032) * r, (px - .07) * r, (py - .012) * r);
      ctx.fill();
      ctx.strokeStyle = '#e2a18a';
      ctx.lineWidth = Math.max(.55, r * .014);
      ctx.beginPath();
      ctx.moveTo((px - .05) * r, (py - .025) * r);
      ctx.lineTo((px + .04) * r, (py + .035) * r);
      ctx.stroke();
    }
    ctx.restore();
  }
}

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
      ctx.ellipse(0, 0, p.birthShape.rx * r / Math.max(.1, p[FISH.radius] || r),
                  p.birthShape.ry * r / Math.max(.1, p[FISH.radius] || r), 0, 0, 2 * Math.PI);
    else
      ctx.arc(0, 0, eggRadius, 0, 2 * Math.PI);
    ctx.fill();
    if (r > 10 && !p.birthShape && !p[FISH.nutrient_egg] &&
        (p[FISH.fertilised] || p[FISH.clonal]) && p[FISH.development] > .08) {
      const embryo = fishEmbryo(p), shape = fishSnapshotAnatomy(embryo, r),
            size = fishRenderRadius(embryo) * r / p[FISH.radius];
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 2 * Math.PI);
      ctx.clip();
      ctx.translate(-shape.origin[0] * size, -shape.origin[1] * size);
      paintFishOverview(ctx, embryo, size, 0, shape, light,
                        opacity * (.15 + .5 * Math.min(1, p[FISH.development])));
      ctx.restore();
    }
    if (r > 7) {
      ctx.fillStyle = '#edc28f';
      ctx.globalAlpha = opacity * .7;
      ctx.beginPath();
      ctx.ellipse(-eggRadius * .12 * (p.birthShape ? p.birthShape.rx / (p[FISH.radius] || 1) : 1),
                  0, eggRadius * .58 * (p.birthShape ? p.birthShape.rx / (p[FISH.radius] || 1) : 1),
                  eggRadius * .52 * (p.birthShape ? p.birthShape.ry / (p[FISH.radius] || 1) : 1), 0,
                  0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = opacity;
    }
    if (!p.birthShape && (p[FISH.fertilised] || p[FISH.clonal])) {
      ctx.strokeStyle = '#edc28f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, eggRadius + 2, -Math.PI / 2,
              -Math.PI / 2 + 2 * Math.PI * Math.max(0, Math.min(1, p[FISH.development] || 0)));
      ctx.stroke();
    }
  } else {
    const {fin} = anatomy;
    const central = fin(0);
    // Each physical pulse opens its fin; the pose relaxes during the glide.
    if (central[1] > 0) {
      ctx.fillStyle = fishFinColor(ctx, r, anatomy, 0, tint);
      ctx.strokeStyle = tint(-.18);
      ctx.lineWidth = Math.max(.45, r * .010);
      ctx.globalAlpha = opacity * .67;
      fishFinPath(ctx, r, anatomy, 0);
      ctx.fill();
      ctx.stroke();
      if (r > 35) {
        ctx.strokeStyle = tint(.3);
        ctx.globalAlpha = opacity * .20;
        for (const across of [.18, .50, .82]) {
          const from = fishFinPoint(anatomy, 0, .12, across),
                to = fishFinPoint(anatomy, 0, .94, across);
          ctx.beginPath();
          ctx.moveTo(...from.map(v => v * r));
          ctx.lineTo(...to.map(v => v * r));
          ctx.stroke();
        }
      }
    }
    for (let side = 0; side < 2; ++side) {
      const shape = fin(side + 1);
      if (shape[1] <= 0)
        continue;
      ctx.fillStyle = fishFinColor(ctx, r, anatomy, side + 1, tint);
      ctx.strokeStyle = tint(-.18);
      ctx.lineWidth = Math.max(.45, r * .010);
      ctx.globalAlpha = opacity * .62;
      fishFinPath(ctx, r, anatomy, side + 1);
      ctx.fill();
      ctx.stroke();
      if (r > 35) {
        ctx.strokeStyle = tint(.3);
        ctx.globalAlpha = opacity * .16 * Math.min(1, (r - 35) / 30);
        ctx.lineWidth = Math.max(.45, r * .005);
        ctx.beginPath();
        for (let lobe = 0; lobe < fishFinShapes(anatomy, side + 1).length; lobe++)
          for (const across of [.20, .50, .80]) {
            const from = fishFinPoint(anatomy, side + 1, .06, across, lobe),
                  mid = fishFinPoint(anatomy, side + 1, .50, across, lobe),
                  to = fishFinPoint(anatomy, side + 1, .92, across, lobe);
            ctx.moveTo(...from.map(v => v * r));
            ctx.quadraticCurveTo(...mid.map(v => v * r), ...to.map(v => v * r));
          }
        ctx.stroke();
      }
    }
    ctx.fillStyle = tint(.06);
    ctx.strokeStyle = tint(-.25);
    ctx.lineWidth = Math.max(.45, r * .012);
    ctx.globalAlpha = opacity * .78;
    for (const side of [0, 1]) {
      fishTraceCurves(ctx, r, fishRearFinShape(anatomy, side));
      ctx.fill();
      ctx.stroke();
    }
    if (r > 5) {
      ctx.fillStyle = anatomy.defenseActivity > .08 ? '#7bb6c6' : tint(.20);
      ctx.strokeStyle = tint(-.25);
      ctx.lineWidth = Math.max(.45, r * .012);
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
  const impact = (p[FISH.impact] || 0) / (.08 + (p[FISH.impact] || 0));
  if (impact > .08) {
    ctx.strokeStyle = `rgba(245,224,182,${impact * .7})`;
    ctx.lineWidth = Math.max(1, r * .04);
    ctx.beginPath();
    ctx.moveTo(r * .1, -r * .19);
    ctx.lineTo(r * .3, r * .12);
    ctx.stroke();
  }
  ctx.restore();
  if (selected)
    paintSelection(ctx, r, '#faf5db');
}

export function corpseFish(p) {
  const v = p[CORPSE.morphology_asset];
  if (!v)
    return null;
  if (!v.fish) {
    const q = Array(FISH.count).fill(0), state = v[4];
    q[FISH.hatched] = 1;
    q[FISH.hatch_shape] = state.slice(18, 20);
    q[FISH.regions] = v[5];
    q[FISH.body_geometry] = v[6];
    q[FISH.organs] = v[0];
    q[FISH.fins] = v[1];
    q[FISH.forms] = v[2];
    q[FISH.contour] = v[3];
    q[FISH.energy] = state[0];
    q[FISH.reserve_capacity] = state[1];
    q[FISH.egg_yolk] = state[2];
    q[FISH.egg_capacity] = state[3];
    q[FISH.sperm_store] = state[4];
    q[FISH.sperm_capacity] = state[5];
    q[FISH.mass] = state[6];
    q[FISH.tail] = state[7];
    q[FISH.fin_pose] = state.slice(8, 11);
    q[FISH.mouth_pose] = state[11];
    q[FISH.bite_pose] = state[12];
    q[FISH.suction_pose] = state[13];
    q[FISH.defense] = state[14] || 0;
    q[FISH.health] = state[15] ?? 1;
    q[FISH.aggression] = state[16] || 0;
    q[FISH.mean_aggression] = state[17] || 0;
    q[FISH.mouth_aperture] = state[20];
    q[FISH.gut_fill] = state[21];
    q[FISH.gut_energy] = state[22];
    q[FISH.tissue] = state[1] * 40 / 400;
    q[FISH.radius] = p[CORPSE.radius];
    q[FISH.neuron_budget] = 512;
    q.dead = true;
    v.fish = q;
  }
  const q = v.fish;
  q[FISH.red] = p[CORPSE.red];
  q[FISH.green] = p[CORPSE.green];
  q[FISH.blue] = p[CORPSE.blue];
  return q;
}

export function fishSkeletonPath(g, r, a) {
  const coarse = r < 18;
  const point = p => p.map(v => v * r), head = fishCNSShape(a), rear = fishAlong(a, -.87);
  g.beginPath();
  g.moveTo((a.snout - .025) * r, 0);
  g.lineTo(head.cx * r, 0);
  g.quadraticCurveTo(a.headBack * r, 0, rear * r, a.flex * r);
  // The skull and jaws follow the same head/face as the live fish.
  for (const side of [0, 1]) {
    const curves = fishHeadCurves(a, side);
    g.moveTo(...point([ a.snout * .96, 0 ]));
    for (const q of curves)
      g.bezierCurveTo(...point([ q[1][0], q[1][1] * .84 ]), ...point([ q[2][0], q[2][1] * .84 ]),
                      ...point([ q[3][0], q[3][1] * .84 ]));
    const eye = fishEye(a, side);
    g.moveTo((eye.x + eye.rx * .9) * r, eye.y * .86 * r);
    g.ellipse(eye.x * r, eye.y * .86 * r, eye.rx * .9 * r, eye.ry * .9 * r, 0, 0, Math.PI * 2);
    const jaw = fishJawEdge(a, side, .9);
    g.moveTo(head.cx * r, 0);
    g.quadraticCurveTo(a.headFront * r, a.faceWidth * (side ? 1 : -1) * .65 * r, jaw[0] * r,
                       jaw[1] * r);
  }
  const count = coarse ? Math.max(3, Math.min(6, Math.round(3 + a.bodyStretch)))
                       : Math.max(6, Math.min(14, Math.round(6 + 1.6 * a.bodyStretch)));
  for (let k = 0; k < count; k++) {
    const t = .025 + .94 * (k + .5) / count;
    for (const side of [0, 1]) {
      const q = fishFlank(a, side, t), y = a.flex * t;
      g.moveTo(q[0] * r, y * r);
      g.quadraticCurveTo((q[0] - .05 * a.bodyStretch) * r, q[1] * .42 * r, q[0] * r,
                         q[1] * .82 * r);
    }
  }
  for (let index = 0; index < 3; index++)
    if (a.fin(index)[1] > 0)
      for (let lobe = 0; lobe < fishFinShapes(a, index).length; lobe++) {
        const f = fishFinShape(a, index, lobe);
        g.moveTo(f.root[0] * r, 0);
        g.lineTo(...point(f.root));
        for (const across of (coarse ? [ .5 ] : [ .20, .5, .80 ])) {
          const u = 1 + 5 * across, end = fishBezier(f.curves[Math.floor(u)], u % 1);
          g.moveTo(...point(f.root));
          g.lineTo(...point(end));
        }
      }
  for (const side of [0, 1]) {
    const fin = fishRearFinShape(a, side), root = fin[0][0];
    for (const t of (coarse ? [ 1 ] : [ .4, 1 ])) {
      const tip = fishBezier(fin[0], t);
      g.moveTo(...point(root));
      g.lineTo(...point(tip));
    }
  }
  for (const side of [0, 1])
    for (const spike of fishDefenseSpines(a, side)) {
      const root = [ (spike[0][0] + spike.at(-1)[0]) * .5, (spike[0][1] + spike.at(-1)[1]) * .5 ];
      g.moveTo(...point(root));
      g.lineTo(...point(spike[2]));
    }
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
