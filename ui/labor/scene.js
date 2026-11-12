// The tank around a chosen fish at a recorded moment of a breeding run: rocks, food and small
// animals as they lay then, and the fish themselves, drawn as in the aquarium; the chosen fish is
// ringed. The run keeps a scene every hundred steps, so the moment shown is the last one at or
// before the chosen step, and the picture says which step that is.
import {FISH, FOOD, INVERTEBRATE} from '../schema.js';
import {fishAnatomy} from '../fish_forms.js';
import {paintFishGlyph} from '../fish_painter.js';
import {formatNumber, t} from '../strings.js';
import {escapeText} from '../studio/view/markup.js';
import {fishPath} from '../studio/view/frame.js';
import {BODY_MIDDLE, BODY_RADIUS} from '../studio/model/layout.js';

export const LAB_SCENE = Object.freeze({
  width : 720,
  height : 300,
  // The window spans this many tank pixels across, centred on the chosen fish.
  span : 480,
  water : '#0c2a33',
  rock : '#3b5551',
  ring : '#efd069',
  ringWidth : 2,
  // The chosen fish's ring sits this many body radii out.
  ringReach : 2.2,
  food : 2.4,
  animal : 3
});

// Where the scene sits in the page, with the step it shows when that differs from the chosen one.
export function sceneSlot(selected, scene) {
  if (!Number.isFinite(selected?.sceneStep))
    return '<p class="aid-lab-scene-note">' + escapeText(t('labor.scene.none')) + '</p>';
  const note = !scene ? t('labor.scene.loading')
               : scene.step === selected.step
                   ? ''
                   : t('labor.scene.at', {step : formatNumber(scene.step)});
  return '<canvas class="aid-lab-scene" width="' + LAB_SCENE.width + '" height="' +
         LAB_SCENE.height + '"></canvas>' +
         (note ? '<p class="aid-lab-scene-note">' + escapeText(note) + '</p>' : '');
}

export function paintLabScene(canvas, frame, fishId) {
  const S = LAB_SCENE, g = canvas.getContext('2d');
  const chosen = frame.fish?.find(p => p[FISH.id] === fishId);
  const scale = canvas.width / S.span;
  const cx = chosen ? chosen[FISH.x] : frame.width / 2,
        cy = chosen ? chosen[FISH.y] : frame.height / 2;
  const x = v => (v - cx) * scale + canvas.width / 2, y = v => (v - cy) * scale + canvas.height / 2;
  g.save();
  g.fillStyle = S.water;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = S.rock;
  for (const shape of frame.shapes ?? []) {
    g.beginPath();
    shape.forEach(([ px, py ], k) => k ? g.lineTo(x(px), y(py)) : g.moveTo(x(px), y(py)));
    g.closePath();
    g.fill();
  }
  const dot = (px, py, r, rgb) => {
    g.fillStyle = 'rgb(' + rgb.map(v => Math.round(255 * v)).join(' ') + ')';
    g.beginPath();
    g.arc(x(px), y(py), r, 0, 2 * Math.PI);
    g.fill();
  };
  for (const f of frame.food ?? [])
    dot(f[FOOD.x], f[FOOD.y], Math.max(S.food, f[FOOD.radius] * scale),
        [ f[FOOD.red], f[FOOD.green], f[FOOD.blue] ]);
  for (const a of frame.invertebrates ?? [])
    dot(a[INVERTEBRATE.x], a[INVERTEBRATE.y], Math.max(S.animal, a[INVERTEBRATE.radius] * scale),
        [ a[INVERTEBRATE.red], a[INVERTEBRATE.green], a[INVERTEBRATE.blue] ]);
  // A recorded scene carries each fish's body only when the run kept it; without it the fish
  // keeps its colour on the atelier's plain outline, snout forward.
  const outline = new Path2D(fishPath());
  for (const p of frame.fish ?? []) {
    const r = p[FISH.radius] * scale;
    g.save();
    g.translate(x(p[FISH.x]), y(p[FISH.y]));
    if (p[FISH.body_geometry])
      paintFishGlyph(g, p, r, p[FISH.angle], frame.step, 1, null, false, 1, fishAnatomy(p));
    else {
      g.rotate(p[FISH.angle] + Math.PI);
      g.scale(r / BODY_RADIUS, r / BODY_RADIUS);
      g.translate(-BODY_MIDDLE.x, -BODY_MIDDLE.y);
      g.fillStyle =
          'rgb(' +
          [ p[FISH.red], p[FISH.green], p[FISH.blue] ].map(v => Math.round(255 * v)).join(' ') +
          ')';
      g.fill(outline);
    }
    g.restore();
  }
  if (chosen) {
    g.strokeStyle = S.ring;
    g.lineWidth = S.ringWidth;
    g.beginPath();
    g.arc(x(chosen[FISH.x]), y(chosen[FISH.y]), S.ringReach * chosen[FISH.radius] * scale, 0,
          2 * Math.PI);
    g.stroke();
  }
  g.restore();
}
