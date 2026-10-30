import {t} from './strings.js';
import {paintEcologyIcon} from './feeding_view.js';
import {chartContext} from './dom.js';
import {brainClamp} from './brain.js';
import {brainMotorColors, brainSenseColors, scentColors, scentNames} from './brain_model.js';
import {rgb} from './dom.js';
import {fishBodyPath} from './fish_fins.js';
import {fishAlong} from './fish_forms.js';
import {
  fishCheekPath,
  fishCheekPoint,
  fishDefenseSpines,
  fishGameteShape,
  fishJawFiber,
  fishJawMusclePath,
  fishMouthPath,
  fishMouthShape,
  fishTeeth,
  fishReservePath,
  fishReserveShape
} from './fish_organs.js';
import {eyeImage, organNumber, organPercent} from './organ_readout.js';
import {organSignalHistory} from './organs.js';
import {sceneState} from './state.js';
export const organ_graphicsState = {};

export function drawScentWheel(canvas, odors) {
  const g = chartContext(canvas, () => drawScentWheel(canvas, odors));
  g.clearRect(0, 0, 144, 144);
  // Fixed concentration scale: channels remain comparable as the water moves.
  const icons = [ 0, 4, 5, 10, 9, 3, 2 ];
  for (let k = 0; k < 8; ++k) {
    const angle = k * Math.PI / 4, co = Math.cos(angle), si = Math.sin(angle),
          concentration = Math.max(0, odors[k] || 0),
          value = Math.sqrt(concentration / (concentration + .1));
    g.save();
    g.translate(72, 72);
    g.rotate(angle);
    g.fillStyle = scentColors[k];
    g.globalAlpha = .14;
    g.fillRect(9, -4, 37, 8);
    g.globalAlpha = 1;
    g.fillRect(9, -4, 37 * value, 8);
    g.restore();
    const x = 72 + 59 * co, y = 72 + 59 * si;
    if (k < 7)
      paintEcologyIcon(g, icons[k], x, y, scentColors[k], .9);
    else {
      // Gamete cloud: head and tail, matching the actual odor source.
      g.fillStyle = g.strokeStyle = scentColors[k];
      g.lineWidth = 1.8;
      g.beginPath();
      g.ellipse(x - 3, y, 3, 4, -.4, 0, 2 * Math.PI);
      g.fill();
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + 4, y - 5, x + 5, y + 5, x + 10, y);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  canvas.title =
      scentNames.map((name, k) => name + ': ' + (odors[k] || 0).toPrecision(3)).join(' · ');
  canvas.setAttribute('aria-label', canvas.title);
}

export function drawOrganGraphic(canvas, info, d, tissue) {
  const g = chartContext(canvas, () => drawOrganGraphic(canvas, info, d, tissue)), w = 360, h = 132;
  g.clearRect(0, 0, w, h);
  g.font = '11px system-ui';
  g.textAlign = 'left';
  g.lineCap = 'round';
  const color = tissue.key === 'internal' ? '#a7b6d5'
                : tissue.key[0] === 's'   ? brainSenseColors[Number(tissue.key.slice(1))]
                                          : brainMotorColors[Number(tissue.key.slice(1))],
        label = (text, x, y, c = '#afc7cb') => {
          g.fillStyle = c;
          g.fillText(text, x, y);
        }, bar = (x, y, width, value, c = color) => {
          g.fillStyle = '#223e49';
          g.fillRect(x, y, width, 10);
          g.fillStyle = c;
          g.fillRect(x, y, width * brainClamp(value), 10);
        };
  if (info.graphic === 'gut') {
    const length = d.b.gut_length || 0, fill = d.b.satiety || 0, raw = d.b.gut_energy || 0,
          usable = d.b.gut_digestible || 0;
    g.strokeStyle = '#38535e';
    g.lineWidth = 14;
    g.beginPath();
    for (let i = 0; i <= 64; i++) {
      const x = 24 + i * 2.1, y = 62 + Math.sin(i / 64 * Math.PI * (2 + 6 * length)) * 25;
      if (i)
        g.lineTo(x, y);
      else
        g.moveTo(x, y);
    }
    g.stroke();
    g.strokeStyle = color;
    g.lineWidth = 3 + 9 * brainClamp(fill);
    g.stroke();
    label(t('organ_graphics.gut', {n : organPercent(fill)}), 14, 17);
    bar(190, 26, 150, raw > 0 ? usable / raw : 0, '#d3bb72');
    label(t('organ_graphics.usable', {usable : organNumber(usable, 1), raw : organNumber(raw, 1)}),
          190, 54);
    label(t('organ_graphics.toReserve', {n : organNumber(d.b.digestion_net, 3)}), 190, 81);
    label(t('organ_graphics.transit', {n : organNumber(d.b.gut_transit, 0)}), 190, 108);
  } else if (info.graphic === 'hormones') {
    for (let k = 0; k < 4; k++) {
      label('H' + (k + 1), 12, 22 + 28 * k);
      bar(60, 13 + 28 * k, 220, info.values[k] || 0,
          [ '#bc9fe4', '#9cc6c4', '#e9b66d', '#8daded' ][k]);
      label(organPercent(info.values[k] || 0), 290, 22 + 28 * k);
    }
  } else if (info.graphic === 'bladder') {
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(84, 65, 49, 28, 0, 0, 2 * Math.PI);
    g.stroke();
    g.fillStyle = color;
    g.globalAlpha = .25 + .5 * info.fill;
    g.beginPath();
    g.ellipse(84, 65, 8 + 39 * info.fill, 5 + 21 * info.fill, 0, 0, 2 * Math.PI);
    g.fill();
    g.globalAlpha = 1;
    bar(160, 55, 175, info.fill);
    label(t('organ_graphics.gasfuellung'), 160, 85);
  } else if (info.graphic === 'scent') {
    for (let k = 0; k < 8; k++) {
      const x = k < 4 ? 8 : 188, y = 22 + (k % 4) * 26,
            value = info.ambient ? 1 : info.values[k] || 0;
      label(scentNames[k], x, y, scentColors[k]);
      g.fillStyle = '#334f58';
      g.fillRect(x, y + 3, 158 * brainClamp(value), 7);
      g.fillStyle = scentColors[k];
      g.fillRect(x, y + 4, 158 * Math.tanh((info.odors[k] || 0) * value), 5);
    }
    label(info.ambient ? t('organ_graphics.duftImWasser')
                       : t('organ_graphics.farbeDuftreizHintergrundVorliebe'),
          8, 130);
    canvas.title =
        info.ambient
            ? scentNames.map((name, k) => name + ': ' + (info.odors[k] || 0).toPrecision(3))
                  .join(' · ')
            : t('organ_graphics.duftreizUndErblicheVorliebe');
    canvas.setAttribute('aria-label', canvas.title);
  } else if (info.graphic === 'eye') {
    const left = 12, width = 336;
    for (const [row, responses] of [[ 22, false ], [ 76, true ]]) {
      label(responses ? t('organ_graphics.rezeptorantwortNachFiltern')
                      : t('organ_graphics.lichtAmAuge'),
            left, row - 5);
      const image = eyeImage(info, 120, responses);
      g.fillStyle = '#07131b';
      g.fillRect(left, row, width, 29);
      for (let i = 0; i < image.length; ++i) {
        g.fillStyle = rgb(image[i].map(v => Math.sqrt(v)));
        g.fillRect(left + width * i / image.length, row, width / image.length + 1, 29);
      }
    }
    label(t('organ_graphics.left'), 12, 124);
    label(t('organ_graphics.front'), 165, 124);
    label(t('organ_graphics.right'), 315, 124);
    canvas.title = t('organ_graphics.obenLichtNachVerdeckung');
    if (!info.image?.length)
      label(t('organ_graphics.nochKeinSehbild'), 120, 69);

  } else if (info.graphic === 'direction') {
    g.strokeStyle = '#47636b';
    g.fillStyle = '#1c3741';
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(180, 64, 130, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    const samples = d.b.lateral_samples || [], ca = Math.cos(d.p[2]), sa = Math.sin(d.p[2]);
    for (let k = 0; k < 2; k++) {
      const q = samples[k], x = 90 + 180 * k;
      if (!q)
        continue;
      const dx = q[2] * ca + q[3] * sa, dy = -q[2] * sa + q[3] * ca, m = Math.hypot(dx, dy),
            scale = 35 / Math.max(1, m), tx = x + dx * scale, ty = 64 + dy * scale;
      g.strokeStyle = q[4] > .5 ? '#9a8e7b' : '#a6dfdc';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(tx, ty);
      if (m > .001) {
        const nx = dx / m, ny = dy / m;
        g.lineTo(tx - 7 * nx + 4 * ny, ty - 7 * ny - 4 * nx);
        g.moveTo(tx, ty);
        g.lineTo(tx - 7 * nx - 4 * ny, ty - 7 * ny + 4 * nx);
      }
      g.stroke();
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, 64, 3, 0, Math.PI * 2);
      g.fill();
      label(organNumber(m, 2) + ' px/S', x - 28, 118);
    }
    for (const r of info.receptors) {
      const longitudinal = r[18] ?? d.nodes.get(r[0])?.[1] ?? 0,
            x = 90 + 180 * (longitudinal + 1) / 2, y = 64 + (r[2] < 0 ? -24 : 24),
            v = brainClamp(r[3]);
      g.fillStyle = color;
      g.globalAlpha = .25 + .75 * v;
      g.beginPath();
      g.arc(x, y, 2 + 2 * v, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    label(t('organ_graphics.schwanz'), 66, 14);
    label(t('organ_graphics.kopf'), 258, 14);
    label(t('organ_graphics.koerperbewegungRelativZumWasser'), 65, 132);
  } else if (info.graphic === 'depth') {
    const y = 12 + 100 * brainClamp(info.fill);
    g.fillStyle = '#163b4a';
    g.fillRect(110, 12, 140, 100);
    g.strokeStyle = '#7ca4b8';
    g.beginPath();
    g.moveTo(110, 12);
    g.lineTo(250, 12);
    g.stroke();
    g.strokeStyle = '#8e8571';
    g.beginPath();
    g.moveTo(110, 112);
    g.lineTo(250, 112);
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(180, y, 16, 5, 0, 0, Math.PI * 2);
    g.fill();
    label(t('organ_graphics.top'), 65, 17);
    label(t('organ_graphics.boden'), 61, 116);
  } else if (info.graphic === 'pulse') {
    g.strokeStyle = '#304b55';
    g.beginPath();
    g.moveTo(8, 101);
    g.lineTo(350, 101);
    g.stroke();
    if (Number.isFinite(info.period)) {
      const extent = Math.max(48, Math.min(240, info.period * 3));
      g.strokeStyle = color;
      g.lineWidth = 2;
      for (let t = info.nextSteps ?? 0; t <= extent; t += info.period) {
        const x = 10 + 338 * t / extent;
        g.beginPath();
        g.moveTo(x, 100);
        g.lineTo(x + 2, 39);
        g.lineTo(x + 7, 100);
        g.stroke();
      }
      label('0', 8, 123);
      label(t('units.steps', {n : organNumber(extent, 0)}), 275, 123);
    } else
      label(t('organ_graphics.gleiten'), 148, 69);
    if (info.series > 0) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(341, 15, 4, 0, 2 * Math.PI);
      g.fill();
    }
  } else if ([
               'egg', 'sperm', 'reserve', 'health', 'defense', 'attack', 'touch', 'mouth', 'color'
             ].includes(info.graphic)) {
    if (info.graphic === 'reserve') {
      const q = fishReserveShape(d.a), scale = 43 / q.rx;
      g.save();
      g.translate(83 - q.x * scale, 63 - (q.y - q.bend * .5) * scale);
      fishReservePath(g, scale, d.a);
      g.fillStyle = '#d8bf69';
      g.globalAlpha = .25 + .65 * brainClamp(info.fill);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.stroke();
      g.restore();
      bar(146, 54, 190, info.fill);
      label(t('organ_graphics.empty'), 146, 84);
      label(t('organ_graphics.full'), 315, 84);
    } else if ([ 'egg', 'sperm' ].includes(info.graphic)) {
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(83, 57, 43,
                info.graphic === 'egg'
                    ? Math.min(39, 43 * fishGameteShape(d.a, 3).ry / fishGameteShape(d.a, 3).rx)
                    : 23,
                0, 0, Math.PI * 2);
      g.stroke();
      g.save();
      g.clip();
      g.fillStyle = color;
      g.globalAlpha = .65;
      g.fillRect(35, 103 - 92 * brainClamp(info.fill), 96, 100);
      g.restore();
      g.globalAlpha = 1;
      bar(146, 54, 190, info.fill);
      label(t('organ_graphics.empty'), 146, 84);
      label(t('organ_graphics.full'), 315, 84);
    } else if (info.graphic === 'color') {
      for (let i = 0; i < 3; i++) {
        label([ t('organ_graphics.rot'), t('organ_graphics.gruen'), t('organ_graphics.blau') ][i],
              14, 24 + 37 * i);
        bar(66, 15 + 37 * i, 232, info.values[i], [ '#df907d', '#8bcf9e', '#89aee0' ][i]);
        label(organPercent(info.values[i]), 308, 24 + 37 * i);
      }
      g.fillStyle = rgb(info.values);
      g.fillRect(14, 114, 332, 8);
    } else {
      const a=d.a,kind=info.graphic,points=kind==='attack'?[...Array.from({length:2},(_,side)=>Array.from({length:13},(_,i)=>[fishCheekPoint(a,side,i/12,0),fishCheekPoint(a,side,i/12,1)]).flat()).flat(),[fishMouthShape(a).front,0]]:kind==='mouth'?[...fishJawFiber(a,0,0),...fishJawFiber(a,1,1),[fishMouthShape(a).front,fishMouthShape(a).gap],[fishMouthShape(a).front,-fishMouthShape(a).gap]]:[[fishAlong(a,-.96),0],[a.snout,0],[.1,Math.max(a.shoulder,...a.flank)+.32],[.1,-Math.max(a.shoulder,...a.flank)-.32]],minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1])),scale=Math.min(172/Math.max(.1,maxX-minX),100/Math.max(.1,maxY-minY));
      g.save();
      g.translate(108 - scale * (minX + maxX) / 2, 65 - scale * (minY + maxY) / 2);
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineWidth = 1.6;
      if (kind === 'mouth') {
        fishMouthPath(g, scale, a);
        g.globalAlpha = .18;
        g.fill();
        g.globalAlpha = 1;
        g.stroke();
        for (let side = 0; side < 2; side++) {
          fishJawMusclePath(g, scale, a, side);
          g.stroke();
        }
      } else if (kind === 'attack') {
        fishMouthPath(g, scale, a);
        g.globalAlpha = .28;
        g.stroke();
        for (let side = 0; side < 2; side++) {
          fishCheekPath(g, scale, a, side);
          g.globalAlpha = side === info.side ? .9 : .25;
          g.fill();
          g.stroke();
        }
      } else {
        fishBodyPath(g, scale, a);
        g.globalAlpha = .12;
        g.fill();
        g.globalAlpha = .5;
        g.stroke();
        if (kind === 'defense') {
          g.globalAlpha = 1;
          for (let side = 0; side < 2; side++)
            for (const piece of fishDefenseSpines(a, side)) {
              g.beginPath();
              piece.forEach((p, i) => i ? g.lineTo(p[0] * scale, p[1] * scale)
                                        : g.moveTo(p[0] * scale, p[1] * scale));
              g.closePath();
              g.fill();
            }
        }
      }
      if (kind === 'mouth' || kind === 'attack') {
        g.globalAlpha = 1;
        g.fillStyle = '#d9cfac';
        for (const side of [0, 1])
          for (const tooth of fishTeeth({...a, bitePose : Math.max(.25, a.bitePose)}, side)) {
            g.beginPath();
            tooth.forEach((p, i) => i ? g.lineTo(p[0] * scale, p[1] * scale)
                                      : g.moveTo(p[0] * scale, p[1] * scale));
            g.closePath();
            g.fill();
          }
      }
      g.restore();
      g.globalAlpha = 1;
      const val = kind === 'mouth' ? d.p[19] : info.fill;
      bar(223, 56, 113, val);
      label(kind === 'health'    ? t('organ_graphics.healthy')
            : kind === 'defense' ? t('organ_graphics.schutz')
            : kind === 'attack'  ? t('organ_graphics.schliesskraft')
            : kind === 'touch'   ? t('organ_graphics.kontakt')
                                 : t('organ_graphics.oeffnung'),
            223, 84);
    }
  } else {
    const history = organSignalHistory(d, tissue, info), end = sceneState.frame.step,
          start = Math.min(end - 30, history[0]?.[0] ?? end - 30),
          feeding = info.graphic === 'feeding',
          max = feeding ? Math.max(1, ...history.map(p => p[1])) : 1;
    g.strokeStyle = '#2e4a54';
    g.beginPath();
    g.moveTo(30, 20);
    g.lineTo(30, 105);
    g.lineTo(348, 105);
    g.stroke();
    label(feeding ? t('units.energyPerStep', {n : organNumber(max, 1)})
                  : t('units.percent', {n : 100}),
          0, 13);
    label('0', 15, 109);
    label(t('organ_graphics.now'), 323, 126);
    label(t('units.steps', {n : organNumber(start - end, 0)}), 30, 126);
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < history.length; i++) {
      const [t, value] = history[i], x = 30 + 318 * (t - start) / (end - start),
                y = 105 - 80 * brainClamp(value / max);
      if (i)
        g.lineTo(x, y);
      else
        g.moveTo(x, y);
    }
    g.stroke();
    if (history.length === 1) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(348, 105 - 80 * brainClamp(info.series / max), 3, 0, 2 * Math.PI);
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
