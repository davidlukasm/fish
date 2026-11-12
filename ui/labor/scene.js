// The tank around a chosen fish at a recorded moment of a breeding run: rocks, plants, food and
// small animals as they lay then, and the fish themselves, drawn as in the aquarium; the chosen
// fish is ringed. The run keeps a scene every hundred steps, so the moment shown is the last one at
// or before the chosen step, and the picture says which step that is.
import {FISH, FOOD, INVERTEBRATE, PLANT} from '../schema.js';
import {paintFishGlyph} from '../fish_painter.js';
import {plantCurveBox, plantRenderParts, plantRibbon} from '../plant_geometry.js';
import {horizontalDelta, sceneState} from '../state.js';
import {formatNumber, t} from '../strings.js';
import {escapeText} from '../studio/view/markup.js';

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
  animal : 3,
  // Points along each plant organ's edge.
  ribbon : 12
});

// Where the scene sits in the page, with the step it shows when that differs from the chosen one.
// `failed` is the reason the scene could not be fetched.
export function sceneSlot(selected, scene, failed = '') {
  const note = text => '<p class="aid-lab-scene-note">' + escapeText(text) + '</p>';
  if (!Number.isFinite(selected?.sceneStep))
    return note(t('labor.scene.none'));
  if (!scene && failed)
    return note(t('labor.scene.failed', {reason : failed}));
  const words = !scene ? t('labor.scene.loading')
                : scene.step === selected.step
                    ? ''
                    : t('labor.scene.at', {step : formatNumber(scene.step)});
  return '<canvas class="aid-lab-scene" width="' + LAB_SCENE.width + '" height="' +
         LAB_SCENE.height + '"></canvas>' + (words ? note(words) : '');
}

// The scene is drawn from its own frame: the fish's shapes and the plants' growth read the
// frame they belong to (its eye placement, its obstacles), not the aquarium open beside it.
export function paintLabScene(canvas, frame, fishId) {
  const shown = sceneState.frame;
  sceneState.frame = frame;
  try {
    paintFrame(canvas, frame, fishId);
  } finally {
    sceneState.frame = shown;
  }
}
function paintFrame(canvas, frame, fishId) {
  const S = LAB_SCENE, g = canvas.getContext('2d');
  const chosen = frame.fish?.find(p => p[FISH.id] === fishId);
  const scale = canvas.width / S.span;
  const cx = chosen ? chosen[FISH.x] : frame.width / 2,
        cy = chosen ? chosen[FISH.y] : frame.height / 2;
  // The tank wraps around sideways: everything lies where it is nearest the chosen fish.
  const x = v => horizontalDelta(v - cx, frame.width) * scale + canvas.width / 2,
        y = v => (v - cy) * scale + canvas.height / 2;
  const colour = rgb => 'rgb(' + rgb.map(v => Math.round(255 * v)).join(' ') + ')';
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
  // Each plant organ as a ribbon along its curve, as wide as it grew, in its own colour.
  const seen = box => x(box.right) >= 0 && x(box.left) <= canvas.width && y(box.bottom) >= 0 &&
                      y(box.top) <= canvas.height;
  // Only plants standing on their stump grow organs (vegetation.js).
  for (const plant of frame.plants ?? [])
    for (const part of plant[PLANT.stump] ? plantRenderParts(plant) : []) {
      if (!seen(plantCurveBox(part.q, part.width)))
        continue;
      const edge = Array.from({length : S.ribbon + 1},
                              (_, k) => plantRibbon(part.q, part.width, part.kind, k / S.ribbon));
      g.fillStyle = colour(part.color);
      g.beginPath();
      edge.forEach(({p, nx, ny, width}, k) => {
        const px = x(p[0] + nx * width), py = y(p[1] + ny * width);
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      });
      for (const {p, nx, ny, width} of edge.reverse())
        g.lineTo(x(p[0] - nx * width), y(p[1] - ny * width));
      g.closePath();
      g.fill();
    }
  const dot = (px, py, r, rgb) => {
    g.fillStyle = colour(rgb);
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
  for (const p of frame.fish ?? []) {
    g.save();
    g.translate(x(p[FISH.x]), y(p[FISH.y]));
    paintFishGlyph(g, p, p[FISH.radius] * scale, p[FISH.angle], frame.step);
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
