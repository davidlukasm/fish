import {FISH, FOOD, INVERTEBRATE, PLANT} from '../schema.js';
import {paintFishGlyph} from '../fish_painter.js';
import {plantCurveBox, plantRenderParts, plantRibbon} from '../plant_geometry.js';
import {horizontalDelta, sceneState} from '../state.js';

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

// The scene is drawn from its own frame: the fish's shapes and the plants' growth read the
// frame they belong to (its eye placement, its obstacles), not the aquarium open beside it.
export function paintLabScene(canvas, frame, fishId, camera = null) {
  const shown = sceneState.frame;
  sceneState.frame = frame;
  try {
    paintFrame(canvas, frame, fishId, camera);
  } finally {
    sceneState.frame = shown;
  }
}
function paintFrame(canvas, frame, fishId, camera) {
  const S = LAB_SCENE, g = canvas.getContext('2d');
  const chosen = frame.fish?.find(p => p[FISH.id] === fishId);
  const span = camera?.span ?? S.span, scale = canvas.width / span;
  const cx = camera?.x ?? (chosen ? chosen[FISH.x] : frame.width / 2),
        cy = camera?.y ?? (chosen ? chosen[FISH.y] : frame.height / 2);
  // The tank wraps around sideways: everything lies where it is nearest the chosen fish.
  const x = v => horizontalDelta(v - cx, frame.width) * scale + canvas.width / 2,
        y = v => (v - cy) * scale + canvas.height / 2;
  // Shift a whole shape across the seam together. Wrapping its vertices separately can turn
  // a distant rock into a polygon spanning the entire view.
  const copies = box => {
    if (y(box.bottom) < 0 || y(box.top) > canvas.height)
      return [];
    const left = cx - span / 2, right = cx + span / 2;
    const first = Math.ceil((left - box.right) / frame.width),
          last = Math.floor((right - box.left) / frame.width);
    return Array.from({length : Math.max(0, last - first + 1)},
                      (_, i) => v =>
                          (v + (first + i) * frame.width - cx) * scale + canvas.width / 2);
  };
  const colour = rgb => 'rgb(' + rgb.map(v => Math.round(255 * v)).join(' ') + ')';
  g.save();
  g.fillStyle = S.water;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = S.rock;
  for (const shape of frame.shapes ?? []) {
    if (!shape.length)
      continue;
    const box = {
      left : Math.min(...shape.map(p => p[0])),
      right : Math.max(...shape.map(p => p[0])),
      top : Math.min(...shape.map(p => p[1])),
      bottom : Math.max(...shape.map(p => p[1]))
    };
    for (const project of copies(box)) {
      g.beginPath();
      shape.forEach(([ px, py ], k) =>
                        k ? g.lineTo(project(px), y(py)) : g.moveTo(project(px), y(py)));
      g.closePath();
      g.fill();
    }
  }
  // Each plant organ as a ribbon along its curve, as wide as it grew, in its own colour.
  // Only plants standing on their stump grow organs (vegetation.js).
  for (const plant of frame.plants ?? [])
    for (const part of plant[PLANT.stump] ? plantRenderParts(plant) : []) {
      const visible = copies(plantCurveBox(part.q, part.width));
      if (!visible.length)
        continue;
      const edge = Array.from({length : S.ribbon + 1},
                              (_, k) => plantRibbon(part.q, part.width, part.kind, k / S.ribbon));
      g.fillStyle = colour(part.color);
      for (const project of visible) {
        g.beginPath();
        edge.forEach(({p, nx, ny, width}, k) => {
          const px = project(p[0] + nx * width), py = y(p[1] + ny * width);
          k ? g.lineTo(px, py) : g.moveTo(px, py);
        });
        for (const {p, nx, ny, width} of [...edge].reverse())
          g.lineTo(project(p[0] - nx * width), y(p[1] - ny * width));
        g.closePath();
        g.fill();
      }
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
