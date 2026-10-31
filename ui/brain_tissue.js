import {brainClamp} from './brain.js';
import {FISH} from './schema.js';
import {
  brainPartPosition,
  brainPigmentRadius,
  brainPigmentStar,
  brainPigmentState,
  fishCNSShape
} from './brain_geometry.js';
import {
  brainHSV,
  brainMotorColors,
  brainOrganRGB,
  brainScentRGB,
  brainScentWeights,
  brainSenseColors
} from './brain_model.js';
import {brainGeometry, brainReplayPath} from './brain_occlusion.js';
import {
  brainArrivalValue,
  brainCycleContraction,
  brainDisplayCharge,
  brainEase,
  brainMotorActivity,
  brainMotorColor,
  brainMuscleShape,
  brainMuscleState
} from './brain_signals.js';
import {rgb} from './dom.js';
import {displayStep} from './state.js';
import {fishFinPath} from './fish_fins.js';
import {
  fishBarbel,
  fishBladderShape,
  fishCheekPath,
  fishDefenseSpines,
  fishEggDuctPath,
  fishEye,
  fishGametePath,
  fishGameteShape,
  fishGillFolds,
  fishInjuryPath,
  fishInjuryShape,
  fishLateralPoint,
  fishMouthPath,
  fishNosePath,
  fishNoseShape,
  fishPainShape,
  fishReservePath,
  fishReservePoint,
  fishReserveShape,
  fishSatietyShape,
  fishGutPath,
  fishGutPoint,
  fishGlandPath,
  fishGlandShape,
  fishMouthInterior,
  fishTonguePoint,
  fishSkinPath,
  fishSkinPoint,
  fishSuctionPath,
  fishSuctionShape,
  fishSwimBladderShape,
  fishTonguePath
} from './fish_organs.js';
export const brain_tissueState = {};

export function brainDrawInterior(g, d) {
  g.save();
  g.translate(d.cx, d.cy);
  g.rotate(d.angle);
  brainReplayPath(g, brainGeometry(d).body);
  g.globalAlpha = .94;
  g.fillStyle = '#132c35';
  g.fill();
  g.globalAlpha = .55;
  g.strokeStyle = rgb(d.p.slice(FISH.red, FISH.blue + 1).map(v => .18 + .45 * v));
  g.lineWidth = Math.max(1, d.r * .006);
  g.stroke();
  g.restore();
}

export function brainCellOpacity(d) { return brainEase((d.cellDetail - .45) / .35); }

export function brainDrawMuscles(g, d, now, only = null) {
  const mix = brainCellOpacity(d);
  for (const pass of [{detail : false, alpha : 1 - mix}, {detail : true, alpha : mix}]) {
    if (pass.alpha <= 0)
      continue;
    for (const tissue of only ? [ only ] : d.tissues.values()) {
      if (tissue.key[0] !== 'm' || Number(tissue.key.slice(1)) >= 7)
        continue;
      const k = Number(tissue.key.slice(1)), bins = new Map(), bands = pass.detail ? 3 : 2;
      for (const {n, part} of tissue.members) {
        const depth = brainClamp((n[1] + 1) / 2), across = [ 0, 2, 5 ].includes(k) ? n[0] : n[8],
              bin = pass.detail
                        ? n[5]
                        : Math.min(bands - 1, Math.floor(depth * bands)) +
                              bands * Math.min(1, Math.floor(brainClamp((across + 1) / 2) * 2)),
              weight = part.share * n[11], s = brainMuscleState(n, k, d, now);
        let cell = bins.get(bin);
        if (!cell) {
          cell = {
            n,
            part,
            coordinates : [ 0, 0, 0 ],
            weight : 0,
            x : 0,
            y : 0,
            activation : 0,
            positive : 0,
            negative : 0,
            contraction : 0,
            charge : 0,
            flash : 0,
            elapsed : Infinity,
            arrivalAge : Infinity
          };
          bins.set(bin, cell);
        }
        if (s.flash > cell.flash) {
          cell.elapsed = s.elapsed;
          cell.n = n;
          cell.part = part;
        }
        cell.flash = Math.max(cell.flash, s.flash);
        cell.weight += weight;
        cell.x += part.p[0] * weight;
        cell.y += part.p[1] * weight;
        for (let axis = 0; axis < 3; axis++)
          cell.coordinates[axis] += n[[ 0, 1, 8 ][axis]] * weight;
        for (const key of ['activation', 'contraction', 'charge'])
          cell[key] += s[key] * weight;
        cell.arrivalAge = Math.min(cell.arrivalAge, s.arrivalAge);
        cell.positive = Math.max(cell.positive, s.positive);
        cell.negative = Math.max(cell.negative, s.negative);
      }
      g.save();
      brainTissuePath(g, d, tissue.key, tissue.side, tissue.variant);
      g.clip();

      for (const cell of bins.values()) {
        if (cell.weight <= 0)
          continue;
        const state = {};
        for (const key of ['activation', 'contraction', 'charge'])
          state[key] = cell[key] / cell.weight;
        state.flash = cell.flash;
        state.elapsed = cell.elapsed;
        state.arrivalAge = cell.arrivalAge;
        state.positive = cell.positive;
        state.negative = cell.negative;
        const representative = cell.n.slice();
        for (let axis = 0; axis < 3; axis++)
          representative[[ 0, 1, 8 ][axis]] = cell.coordinates[axis] / cell.weight;
        const center = brainPartPosition(representative, tissue.key, d),
              q = brainMuscleShape(representative, k, d, state, center), r = d.r,
              x0 = (q.x - q.dx * q.half) * r, y0 = (q.y - q.dy * q.half) * r,
              x1 = (q.x + q.dx * q.half) * r, y1 = (q.y + q.dy * q.half) * r,
              wx = q.nx * q.width * r, wy = q.ny * q.width * r;
        g.fillStyle = brainMotorColor(k, state);
        g.strokeStyle = state.negative > .03 ? '#eb8a88' : '#b9d5ce';
        g.globalAlpha = pass.alpha * brainClamp(.65 + .12 * state.contraction +
                                                    .20 * state.positive - .12 * state.negative,
                                                .35, .98);
        g.lineWidth = Math.max(.5, r * .003);
        g.beginPath();
        g.moveTo(x0, y0);
        g.bezierCurveTo(x0 + wx, y0 + wy, x1 + wx, y1 + wy, x1, y1);
        g.bezierCurveTo(x1 - wx, y1 - wy, x0 - wx, y0 - wy, x0, y0);
        g.fill();
        g.stroke();
        g.strokeStyle = state.negative > state.positive ? '#ef8a89' : '#d5eee0';
        g.globalAlpha = pass.alpha * (.20 + .35 * state.charge + .30 * state.contraction +
                                      .35 * Math.max(state.positive, state.negative));
        g.lineWidth = Math.max(.6, r * .003);
        for (const t of [-.45, 0, .45]) {
          const x = (q.x + q.dx * q.half * t) * r, y = (q.y + q.dy * q.half * t) * r;
          g.beginPath();
          g.moveTo(x - wx * .55, y - wy * .55);
          g.lineTo(x + wx * .55, y + wy * .55);
          g.stroke();
        }
      }
      g.restore();
    }
  }
}

function brainTissueColor(key, n) {
  const k = Number(key.slice(1));
  return key[0] === 's' ? (k === 1   ? brainScentRGB(brainScentWeights(n))
                           : k === 0 ? brainHSV(180 * ((n[20]?.[2] ?? 0) + 1))
                                     : null)
         : k === 7      ? brainOrganRGB(n)
                        : null;
}

export function brainTissuePath(g, d, key, side, variant = '') {
  const a = d.a, r = d.r;
  g.beginPath();
  if (key === 'internal') {
    const q = fishCNSShape(a);
    g.moveTo(q.tail * r, -q.cord * r);
    g.lineTo(q.neck * r, -q.cord * r);
    g.bezierCurveTo((q.neck + .01) * r, -q.ry * .55 * r, (q.cx - q.rx) * r, -q.ry * r, q.cx * r,
                    -q.ry * r);
    g.bezierCurveTo((q.cx + q.rx * .65) * r, -q.ry * r, (q.cx + q.rx) * r, -q.ry * .55 * r,
                    (q.cx + q.rx) * r, 0);
    g.bezierCurveTo((q.cx + q.rx) * r, q.ry * .55 * r, (q.cx + q.rx * .65) * r, q.ry * r, q.cx * r,
                    q.ry * r);
    g.bezierCurveTo((q.cx - q.rx) * r, q.ry * r, (q.neck + .01) * r, q.ry * .55 * r, q.neck * r,
                    q.cord * r);
    g.lineTo(q.tail * r, q.cord * r);
    g.quadraticCurveTo((q.tail - .04) * r, 0, q.tail * r, -q.cord * r);
    g.closePath();
  } else if (key === 's0') {
    const eye = fishEye(a, side);
    g.ellipse(eye.x * r, eye.y * r, eye.rx * r, eye.ry * r, 0, 0, Math.PI * 2);
  } else if (key === 's1' && variant !== 'barbel')
    fishNosePath(g, r, a, side);
  else if (key === 's1') {
    for (let i = 0; i <= 24; i++) {
      const p = fishBarbel(a, side, i / 24);
      if (i)
        g.lineTo(p[0] * r, p[1] * r);
      else
        g.moveTo(p[0] * r, p[1] * r);
    }
  } else if (key === 's2') {
    for (let i = 0; i <= 20; i++) {
      const p = fishLateralPoint(a, side, i / 20);
      if (i)
        g.lineTo(p[0] * r, p[1] * r);
      else
        g.moveTo(p[0] * r, p[1] * r);
    }
  } else if (key === 's3')
    fishSkinPath(g, r, a, side);
  else if (key === 'm7') {
    for (const group of d.pigments.groups)
      brainPigmentStar(
          g, group.p[0] * r, group.p[1] * r,
          brainPigmentRadius(r, brainPigmentState(group, d).value, d.pigments.groups.length));
  } else if (key === 's6')
    fishInjuryPath(g, r, a, side);
  else if (key === 's4')
    fishReservePath(g, r, a);
  else if (key === 's5')
    fishTonguePath(g, r, a);
  else if (key === 's7' || key === 'm8') {
    const q = key === 'm8' ? fishSwimBladderShape(a) : fishBladderShape(a),
          fill = key === 'm8' ? .55 + .45 * (d.b.bladder_fill || 0) : 1;
    g.ellipse(q.x * r, q.y * r, q.rx * r * fill, q.ry * r * fill, -.15, 0, Math.PI * 2);
  } else if (key === 's10') {
    const q = fishCNSShape(a);
    g.ellipse(q.cx * r, (side ? 1 : -1) * .35 * q.ry * r, .6 * q.rx * r, .3 * q.ry * r, 0, 0,
              Math.PI * 2);
  } else if (key === 'm9') {
    fishGlandPath(g, r, a);
  } else if (key === 's8') {
    if (side)
      fishGametePath(g, r, a, side === 1 ? 3 : 4);
    else
      fishGutPath(g, r, a);
  } else if (key === 's9') {
    const q = fishPainShape(a, side);
    g.ellipse(q.x * r, q.y * r, q.rx * r, q.ry * r, 0, 0, Math.PI * 2);
  } else if (key === 'm0' || key === 'm1')
    fishFinPath(g, r, a, key === 'm0' ? 0 : side + 1);
  else if (key === 'm2') {
    fishSuctionPath(g, r, a, true);
    fishMouthPath(g, r, a, true);
  } else if (key === 'm3') {
    if (!a.birthing)
      fishGametePath(g, r, a, 3);
    fishEggDuctPath(g, r, a, !a.birthing);
  } else if (key === 'm4')
    fishGametePath(g, r, a, 4);
  else if (key === 'm5') {
    fishCheekPath(g, r, a, 0, true);
    fishCheekPath(g, r, a, 1, true);
  } else if (key === 'm6') {
    for (const piece of fishDefenseSpines(a, side)) {
      piece.forEach((p, i) => i ? g.lineTo(p[0] * r, p[1] * r) : g.moveTo(p[0] * r, p[1] * r));
      g.closePath();
    }
  }
}

export function brainDrawTissue(g, d, tissue, now) {
  const r = d.r, a = d.a;
  const {key, side, members} = tissue, k = Number(key.slice(1)),
                    motorTone = key[0] === 'm' && k < 3 ? {
                      charge : brainDisplayCharge(k, side, now),
                      contraction : brainCycleContraction(k, side, now)
                    }
                                                        : null,
                    color = motorTone            ? brainMotorColors[k]
                            : key === 's6'       ? rgb([
                                .55 + .35 * (1 - d.p[23]), .55 - .25 * (1 - d.p[23]),
                                .55 - .25 * (1 - d.p[23])
                              ])
                            : key === 'internal' ? '#a7b6d5'
                            : key[0] === 's'     ? brainSenseColors[k]
                                                 : brainMotorColors[k],
                    closed = (key === 's1' && tissue.variant !== 'barbel') || [
                      'internal', 's0', 's3', 's4', 's5', 's6', 's7', 'm0', 'm1', 'm2',
                      'm3',       'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 's8', 's9', 's10'
                    ].includes(key);
  if (key === 'm2')
    fishSuctionPath(g, r, a);
  else
    brainTissuePath(g, d, key, side, tissue.variant);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.globalAlpha = .35;
  g.lineWidth = Math.max(1, r * (key === 's1'   ? .012
                                 : key === 's2' ? .008
                                 : key === 's5' ? .025
                                                : .006));
  if (closed && !['s0', 's3', 'm7', 's6'].includes(key)) {
    g.globalAlpha = key === 'm3' ? .15 : 1;
    g.fillStyle = '#162e38';
    g.fill();
    g.fillStyle = color;
    g.globalAlpha = key === 'm3'         ? .16
                    : motorTone          ? .22
                    : key === 'm6'       ? .20 + .30 * Math.sqrt(a.defenseActivity)
                    : key === 'internal' ? .47
                                         : .48;
    g.fill();
    g.globalAlpha = .78;
  }
  if (key !== 's3' && key !== 'm7')
    g.stroke();
  if (key === 'm2') {
    const q = fishSuctionShape(a);
    g.save();
    fishSuctionPath(g, r, a);
    g.clip();
    g.strokeStyle = '#c4e9eb';
    g.globalAlpha = .34 + .4 * (a.swallowPose || 0);
    g.lineWidth = Math.max(.6, r * .004);
    for (const sign of [-1, 1]) {
      g.beginPath();
      g.moveTo((q.front - .012) * r, sign * q.ry * .15 * r);
      g.bezierCurveTo((q.front - .07) * r, sign * q.ry * .25 * r, (q.back + .09) * r,
                      sign * q.ry * .25 * r, q.back * r, 0);
      g.stroke();
    }
    g.restore();
  }
  if (key === 's8' && !side) {
    g.save();
    fishGutPath(g, r, a);
    g.fillStyle = '#8f7358';
    g.globalAlpha = .82;
    g.fill();
    g.strokeStyle = '#d8b78a';
    g.lineWidth = Math.max(.6, r * .004);
    g.stroke();
    g.clip();
    const moving = (d.b.digestion || 0) > 0, phase = moving ? (displayStep() / 144) % 1 : 0,
          fill = Math.min(1, a.gutFilling || 0), tube = fishSatietyShape(a).tube;
    g.strokeStyle = '#c8a061';
    g.lineWidth = Math.max(.5, r * tube * 1.25);
    g.globalAlpha = .25 + .7 * fill;
    if (fill > .01)
      for (let j = 0; j < 10; ++j) {
        g.beginPath();
        for (let k = 0; k <= 4; ++k) {
          const t = ((j + phase) / 10 + k * .014 * fill) % 1, p = fishGutPoint(a, t);
          if (k)
            g.lineTo(p[0] * r, p[1] * r);
          else
            g.moveTo(p[0] * r, p[1] * r);
        }
        g.stroke();
      }
    g.restore();
  }
  if (key === 'm9') {
    const q = fishGlandShape(a), levels = d.b.hormones?.levels || [ 0, 0, 0, 0 ];
    g.save();
    fishGlandPath(g, r, a);
    g.clip();
    for (let side = 0; side < 2; ++side) {
      for (let row = 0; row < 2; ++row) {
        const k = side + 2 * row;
        g.fillStyle = [ '#d4a0ee', '#77d2bd', '#e9b66d', '#8daded' ][k];
        g.globalAlpha = .3 + .65 * Math.min(1, levels[k] || 0);
        g.fillRect((q.x + (side ? 0 : -1.2) * q.rx) * r, (q.y + (row ? 0 : -1) * q.ry) * r,
                   q.rx * 1.2 * r, q.ry * r);
      }
      g.strokeStyle = '#e3c7d1';
      g.lineWidth = Math.max(.6, r * .003);
      for (let i = 0; i < 4; ++i) {
        const x = q.x + (side ? 1 : -1) * q.rx * (.20 + .18 * i);
        g.beginPath();
        g.moveTo(q.x * r, q.y * r);
        g.lineTo(x * r, (q.y + (i % 2 ? 1 : -1) * .65 * q.ry) * r);
        g.stroke();
      }
    }
    g.restore();
  }
  if (key === 'm5') {
    g.save();
    fishGillFolds(g, r, a, side);
    g.strokeStyle = '#dca693';
    g.globalAlpha = .4 + .45 * a.aggression;
    g.lineWidth = Math.max(.65, r * .006);
    g.stroke();
    g.restore();
    return;
  }
  if (key === 'm7') {
    for (const group of d.pigments.groups) {
      const state = brainPigmentState(group, d, now);
      g.fillStyle = rgb(state.color);
      g.globalAlpha = .16 + .48 * state.value;
      g.beginPath();
      brainPigmentStar(g, group.p[0] * r, group.p[1] * r,
                       brainPigmentRadius(r, state.value, d.pigments.groups.length));
      g.fill();
      g.strokeStyle = rgb(state.color);
      g.lineWidth = .65;
      g.stroke();
    }
    return;
  }
  if (key === 'm6')
    return;
  if (key === 'internal') {
    const q = fishCNSShape(a);
    g.save();
    brainTissuePath(g, d, key, side, tissue.variant);
    g.clip();
    const shade = g.createLinearGradient?.(0, -q.ry * r, 0, q.ry * r);
    if (shade?.addColorStop) {
      shade.addColorStop(0, '#8a97b2');
      shade.addColorStop(.45, '#62738f');
      shade.addColorStop(1, '#37465f');
      g.fillStyle = shade;
      g.globalAlpha = .72;
      g.fill();
    }
    g.strokeStyle = '#c1c9db';
    g.lineWidth = Math.max(.65, r * .004);
    g.globalAlpha = .32;
    g.beginPath();
    for (const t of [-.52, -.12, .28, .62]) {
      const x = q.cx + q.rx * t, w = q.ry * Math.sqrt(1 - t * t) * .78;
      g.moveTo((x - .04) * r, -w * r);
      g.bezierCurveTo((x + .06) * r, -w * .35 * r, (x - .06) * r, w * .35 * r, (x + .04) * r,
                      w * r);
    }
    g.stroke();
    g.restore();
    return;
  }
  if (key === 's0') {
    const eye = fishEye(a, side);
    g.save();
    g.strokeStyle = '#4e5b71';
    g.lineWidth = eye.ry * r;
    g.beginPath();
    g.moveTo(eye.baseX * r, eye.baseY * r);
    g.lineTo(eye.x * r, eye.y * r);
    g.stroke();
    g.fillStyle = '#4e5b71';
    g.globalAlpha = .95;
    g.beginPath();
    g.ellipse(eye.x * r, eye.y * r, eye.rx * r, eye.ry * r, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0a1a24';
    g.beginPath();
    g.ellipse((eye.x + .012) * r, eye.y * r, eye.rx * r * eye.pupil, eye.ry * r * eye.pupil, 0, 0,
              Math.PI * 2);
    g.fill();
    g.fillStyle = '#e3ecdc';
    g.beginPath();
    g.arc((eye.x + eye.r * .23) * r, (eye.y - eye.r * .23) * r, eye.r * r * .18, 0, Math.PI * 2);
    g.fill();
    brainTissuePath(g, d, key, side, tissue.variant);
    g.clip();
    for (const {n} of members) {
      const rec = d.receptors.get(n[5]);
      if (!rec)
        continue;
      const sample = d.visualSamples?.get(n[5]), received = sample?.slice(4, 7) || [ 0, 0, 0 ],
            peak = Math.max(1e-12, ...received), rho = (.48 + .42 * rec[8] / 360),
            value = sample?.[3] || 0;
      g.strokeStyle = rgb(received.map(c => c / peak));
      g.lineWidth = Math.max(.8, eye.r * r * .10);
      g.globalAlpha = (.15 + .65 * value) * Math.min(1, 2 / Math.sqrt(members.length));
      g.beginPath();
      g.ellipse(eye.x * r, eye.y * r, rho * eye.rx * r, rho * eye.ry * r, 0, Math.PI + rec[11],
                Math.PI + rec[12]);
      g.stroke();
    }
    g.restore();
    return;
  }
  if (key === 's4') {
    const q = fishReserveShape(a);
    g.save();
    fishReservePath(g, r, a);
    g.clip();
    for (let i = 0; i < 12; i++) {
      const [x, y] = fishReservePoint(a, .10 + .8 * (i % 6) / 5, i < 6 ? -.32 : .4),
                size = (.01 + .025 * Math.sqrt(q.fill)) * (.8 + .2 * Math.sin(i * 2.4));
      g.globalAlpha = .10 + .6 * q.fill;
      g.fillStyle = '#d8bf69';
      g.beginPath();
      g.ellipse(x * r, y * r, size * r, size * r * .7, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    return;
  }
  if (key === 'm3' || key === 'm4') {
    if (key === 'm3' && a.birthing)
      return;
    const q = fishGameteShape(a, k);
    if (q.fill > 0) {
      g.save();
      fishGametePath(g, r, a, k);
      g.clip();
      g.globalAlpha = .12 + .16 * Math.min(1, q.fill);
      g.fillStyle = key === 'm3' ? '#e5bd71' : '#a6b9e5';
      if (k === 3) {
        g.beginPath();
        g.ellipse(q.x * r, q.y * r, q.yolkRadius * r, q.yolkRadius * r, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = .55;
        g.strokeStyle = '#f5dd9f';
        g.lineWidth = Math.max(.7, r * .005);
        g.beginPath();
        g.ellipse((q.x + .08 * q.fill) * r, (q.y - .18 * q.ry) * r, q.rx * .22 * r, q.ry * .25 * r,
                  0, 0, Math.PI * 2);
        g.stroke();
      } else
        for (let i = 0; i < 12; i++) {
          const x = q.x + q.rx * (-.65 + 1.3 * (i % 4) / 3),
                y = q.y + q.ry * (-.45 + .45 * Math.floor(i / 4)),
                size = (.006 + .006 * Math.min(1, q.fill)) * r;
          g.beginPath();
          g.arc(x * r, y * r, size, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.moveTo(x * r, y * r);
          g.quadraticCurveTo((x - .02) * r, (y + .02) * r, (x - .04) * r, (y + .008) * r);
          g.strokeStyle = '#9eacd5';
          g.lineWidth = Math.max(.5, r * .003);
          g.stroke();
        }
      g.restore();
    }
    return;
  }
  if (key === 's5') {
    const flow = Math.max(0, d.b.nutrient_flow || 0), v = flow / (flow + 4);
    fishTonguePath(g, r, a);
    g.fillStyle = rgb([ .58 + .25 * v, .31 + .20 * v, .38 - .12 * v ]);
    g.globalAlpha = .55 + .20 * v;
    g.fill();
    g.strokeStyle = '#daa3ab';
    g.lineWidth = Math.max(.6, r * .005);
    g.stroke();
    const age = d.p[FISH.feeding_action_age] || 0,
          filtering = [ 3, 4 ].includes(a.feedingAction) && age > 0 && age <= 2 &&
                      (d.p[FISH.swallowed] || 0) > 0,
          swallowAge = Math.max(0, 48 - age + (displayStep() - d.step));
    if (filtering || [ 2, 3, 7, 9 ].includes(a.feedingAction) && age > 2 && swallowAge < 12) {
      const progress = filtering ? ((displayStep() + (d.p[FISH.id] || 0) * .73) % 8) / 8
                                 : Math.min(1, swallowAge / 12),
            p = fishTonguePoint(a, progress);
      const swallowed = Math.max(0, d.p[FISH.swallowed] || 0),
            size = r * Math.min(.045, .010 + .025 * Math.sqrt(swallowed));
      g.fillStyle = a.feedingAction === 3                            ? '#a69a72'
                    : a.feedingAction === 4                          ? '#a6bd8e'
                    : a.feedingAction === 7 || a.feedingAction === 9 ? '#bd8870'
                                                                     : '#d7b67a';
      g.globalAlpha = .85;
      g.beginPath();
      g.ellipse(p[0] * r, p[1] * r, Math.max(.8, size * (filtering ? .65 : 1.4)),
                Math.max(.6, size * .7), 0, 0, 2 * Math.PI);
      g.fill();
    }
    for (const {n, part} of members) {
      const [x, y] = part.p;
      g.fillStyle = '#e4d4a0';
      g.globalAlpha = .22 + .65 * Math.abs(n[3]);
      g.beginPath();
      g.arc(x * r, y * r, Math.max(.7, r * .004), 0, 2 * Math.PI);
      g.fill();
    }
    return;
  }
  if (key === 'm2') {
    fishMouthPath(g, r, a);
    g.fillStyle = '#081b25';
    g.strokeStyle = '#bd8798';
    g.globalAlpha = 1;
    g.fill();
    g.lineWidth = Math.max(.6, r * .005);
    g.stroke();
    fishMouthInterior(g, r, a);
    return;
  }
  if (key === 'm0' || key === 'm1')
    return;
  const bins = new Map();
  for (const {n, part} of members) {
    const depth = brainClamp((n[1] + 1) / 2), across = key === 'm0' ? n[0] : n[8],
          bin = Math.min(7, Math.floor(depth * 8)) +
                ([ 'm0', 'm1', 'm7', 's3' ].includes(key)
                     ? 8 * Math.min(3, Math.floor(brainClamp((across + 1) / 2) * 4))
                     : 0),
          weight = part.share * (n[11] ?? 1),
          active =
              n[7] && !n[10] ? (key[0] === 'm' ? brainMotorActivity(n, k, d) : Math.abs(n[3])) : 0;
    let cell = bins.get(bin);
    if (!cell) {
      cell = {
        n,
        weight : 0,
        value : 0,
        x : 0,
        y : 0,
        color : [ 0, 0, 0 ],
        colored : false,
        positive : 0,
        negative : 0
      };
      bins.set(bin, cell);
    }
    const incoming = brainArrivalValue(n[5], now);
    cell.positive = Math.max(cell.positive, incoming.positive);
    cell.negative = Math.max(cell.negative, incoming.negative);
    cell.weight += weight;
    cell.value += active * weight;
    cell.x += part.p[0] * weight;
    cell.y += part.p[1] * weight;
    const hue = brainTissueColor(key, n);
    if (hue) {
      cell.colored = true;
      for (let c = 0; c < 3; c++)
        cell.color[c] += hue[c] * weight;
    }
  }
  g.save();
  if (closed) {
    brainTissuePath(g, d, key, side, tissue.variant);
    g.clip();
  }
  for (const cell of bins.values()) {
    if (cell.weight <= 0)
      continue;
    const value = cell.value / cell.weight, x = cell.x / cell.weight, y = cell.y / cell.weight;
    g.strokeStyle = g.fillStyle = cell.colored ? rgb(cell.color.map(c => c / cell.weight)) : color;
    g.globalAlpha = .24 + .64 * value;
    g.lineWidth = Math.max(1, r * .009);
    if (key === 's3') {
      const t = brainClamp((cell.n[1] + 1) / 2), lo = fishSkinPoint(a, side, Math.max(0, t - .02)),
            hi = fishSkinPoint(a, side, Math.min(1, t + .02));
      g.save();
      g.translate(x * r, y * r);
      g.rotate(Math.atan2(hi[1] - lo[1], hi[0] - lo[0]));
      g.lineWidth = Math.max(.7, r * .004);
      g.beginPath();
      g.moveTo(-.025 * r, -.022 * r);
      g.quadraticCurveTo(.034 * r, 0, -.025 * r, .022 * r);
      g.stroke();
      g.restore();
    } else if (key === 's2') {
      g.lineWidth = Math.max(.8, r * .005);
      g.beginPath();
      g.arc(x * r, y * r, Math.max(1.1, r * .012), 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(x * r, y * r);
      g.quadraticCurveTo((x - .012 * value) * r, (y + (side ? 1 : -1) * .02) * r,
                         (x - .018 * value) * r, (y + (side ? 1 : -1) * (.025 + .03 * value)) * r);
      g.stroke();
    } else if (key === 'm7') {
      const size = (.013 + .026 * Math.sqrt(value)) * r;
      g.globalAlpha = .30 + .45 * value + .25 * cell.positive;
      g.beginPath();
      for (let i = 0; i < 12; i++) {
        const t = i * Math.PI / 6, len = size * (i % 2 ? .48 : 1);
        if (i)
          g.lineTo(x * r + Math.cos(t) * len, y * r + Math.sin(t) * len);
        else
          g.moveTo(x * r + len, y * r);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = rgb(d.p.slice(FISH.red, FISH.blue + 1));
      g.lineWidth = Math.max(.7, r * .004);
      g.stroke();
    } else if (key === 's6') {
      const q = fishInjuryShape(a, side);
      g.globalAlpha = .25 + .65 * value;
      g.lineWidth = Math.max(.8, r * .004);
      g.beginPath();
      g.moveTo(q.x * r, q.y * r);
      g.quadraticCurveTo((q.x + x) * .5 * r, q.y * r, x * r, y * r);
      g.moveTo(x * r, y * r);
      g.lineTo((x + .014) * r, (y + .012) * r);
      g.moveTo(x * r, y * r);
      g.lineTo((x + .012) * r, (y - .012) * r);
      g.stroke();
      g.beginPath();
      g.arc(x * r, y * r, Math.max(.8, r * (.006 + .005 * value)), 0, Math.PI * 2);
      g.fill();
    } else if (key === 's7') {
      g.globalAlpha = .18 + .4 * value;
      g.beginPath();
      g.ellipse(x * r, y * r, Math.max(1, r * .026), Math.max(1, r * .010), -.2, 0, Math.PI * 2);
      g.stroke();
    } else if (key === 's1') {
      g.beginPath();
      if (tissue.variant === 'barbel') {
        const t = brainClamp((cell.n[1] + 1) / 2),
              p = fishBarbel(a, side, Math.max(.03, .12 + .76 * t - .035)),
              q = fishBarbel(a, side, Math.min(.97, .12 + .76 * t + .035));
        g.moveTo(p[0] * r, p[1] * r);
        g.lineTo(q[0] * r, q[1] * r);
      } else {
        const q = fishNoseShape(a, side);
        g.moveTo(x * r, y * r);
        g.quadraticCurveTo((x - .025) * r, (y + q.ry * .22) * r, (x - .04) * r, y * r);
      }
      g.stroke();
    }
  }
  g.restore();
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
