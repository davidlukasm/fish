import {FISH} from '../schema.js';
import {horizontalDelta} from '../state.js';
import {paintLabScene} from './scene.js';

export function projection(canvas, state, camera) {
  const span = state.width / camera.zoom, scale = canvas.width / span;
  return {
    span,
    scale,
    x : v => horizontalDelta(v - camera.x, state.width) * scale + canvas.width / 2,
    y : v => (v - camera.y) * scale + canvas.height / 2,
    point : event => {
      const box = canvas.getBoundingClientRect();
      return {
        x : camera.x + ((event.clientX - box.left) / box.width - .5) * span,
        y : camera.y + ((event.clientY - box.top) / box.height - .5) * canvas.height / scale
      };
    }
  };
}

export function paintLiveScene(canvas, world, camera, paths, selected, cursor, trail) {
  const state = world?.state;
  if (!canvas || !state?.width)
    return;
  const box = canvas.getBoundingClientRect(), ratio = globalThis.devicePixelRatio || 1,
        width = Math.round(box.width * ratio), height = Math.round(box.height * ratio);
  if (width && height && (canvas.width !== width || canvas.height !== height)) {
    canvas.width = width;
    canvas.height = height;
  }
  const p = projection(canvas, state, camera), ctx = canvas.getContext('2d');
  const current = new Map(state.fish.map(f => [f.id, f]));
  if (world.frame) {
    const frame = {
      ...world.frame,
      step : state.step,
      fish : world.frame.fish.filter(row => current.has(row[FISH.id])).map(row => {
        const f = current.get(row[FISH.id]), copy = row.slice();
        copy[FISH.x] = f.x;
        copy[FISH.y] = f.y;
        copy[FISH.angle] = f.angle;
        return copy;
      })
    };
    paintLabScene(canvas, frame, selected, {x : camera.x, y : camera.y, span : p.span});
  } else {
    ctx.fillStyle = '#0c2933';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const available = Math.max(0, cursor - trail);
  ctx.save();
  for (const [key, points] of paths) {
    const [channel, identity] = key.split(':'), id = Number(identity);
    if (selected != null && id !== selected)
      continue;
    if (channel === 'control' && !state.comparison)
      continue;
    const shown = points.filter(
        v => v.t <= cursor && v.t >= Math.max(available, selected == null ? cursor - 200 : 0));
    ctx.strokeStyle = channel === 'control' ? '#8fc9e9' : '#f5d37c';
    ctx.globalAlpha = selected == null ? .4 : .95;
    ctx.lineWidth = (selected == null ? 1.5 : 2.4) * ratio;
    ctx.setLineDash(channel === 'control' ? [ 6 * ratio, 4 * ratio ] : []);
    ctx.beginPath();
    let previous = null;
    for (const v of shown) {
      const x = p.x(v.x), y = p.y(v.y);
      if (!previous || Math.abs(x - previous.x) > canvas.width / 2)
        ctx.moveTo(x, y);
      else
        ctx.lineTo(x, y);
      previous = {x, y};
    }
    ctx.stroke();
    if (selected != null && shown.length) {
      const v = shown.at(-1), x = p.x(v.x), y = p.y(v.y);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, 6 * ratio, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `${12 * ratio}px system-ui`;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText('#' + id, x + 10 * ratio, y - 10 * ratio);
    }
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  if (!world.frame)
    for (const fish of state.fish) {
      ctx.save();
      ctx.translate(p.x(fish.x), p.y(fish.y));
      ctx.rotate(fish.angle);
      ctx.fillStyle = `rgb(${fish.color.map(c => Math.round(c * 255)).join(' ')})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(4 * ratio, fish.radius * p.scale), 3 * ratio, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  ctx.restore();
}
