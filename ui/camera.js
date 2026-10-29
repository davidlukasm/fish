import {brainState} from './brain.js';
import {canvas, el, text} from './dom.js';
import {evolutionState} from './evolution.js';
import {fishBodyRadius} from './fish_fins.js';
import {fishBodyContains} from './fish_forms.js';
import {sessionState} from './session.js';
import {
  blendFish,
  displayNow,
  frameFish,
  horizontalDelta,
  sceneState,
  selectFish,
  wrapScreenX
} from './state.js';
import {draw, tankState} from './tank.js';
export const cameraState = {};

export function resetCamera() {
  cameraState.cameraX = cameraState.cameraY = null;
  cameraState.zoom = 1;
}

export function camera(f = sceneState.frame) {
  if (cameraState.cameraX === null) {
    cameraState.cameraX = f.width / 2;
    cameraState.cameraY = f.height / 2;
  }
  const scale =
            Math.min(cameraState.viewportWidth / f.width, cameraState.viewportHeight / f.height) *
            cameraState.zoom,
        half = Math.min(f.height / 2, cameraState.viewportHeight / (2 * scale));
  cameraState.cameraY =
      Math.max(half, Math.min(f.height - half, cameraState.cameraY ?? f.height / 2));
  return {
    scale,
    ox : cameraState.viewportWidth / 2 - cameraState.cameraX * scale,
    oy : cameraState.viewportHeight / 2 - cameraState.cameraY * scale
  };
}

export function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x : (e.clientX - r.left) / r.width * cameraState.viewportWidth,
    y : (e.clientY - r.top) / r.height * cameraState.viewportHeight
  };
}

export function screenToWorld(p, c = camera()) {
  return {x : wrapScreenX((p.x - c.ox) / c.scale), y : (p.y - c.oy) / c.scale};
}

export function point(e) { return screenToWorld(canvasPoint(e)); }

export function worldToScreen(p, c = camera()) {
  const center = (cameraState.viewportWidth / 2 - c.ox) / c.scale,
        x = center + horizontalDelta(p.x - center);
  return {x : x * c.scale + c.ox, y : p.y * c.scale + c.oy};
}

export function setFollowing(value, fromZoom = false) {
  cameraState.following = value;
  cameraState.zoomFollowing = value && fromZoom;
  cameraState.zoomFollowTime = 0;
  const raw = frameFish(sceneState.frame), p = raw && blendFish(raw);
  cameraState.followOffsetX =
      value && fromZoom && p ? horizontalDelta((cameraState.cameraX ?? p[0]) - p[0]) : 0;
  cameraState.followOffsetY = value && fromZoom && p ? (cameraState.cameraY ?? p[1]) - p[1] : 0;
  el('follow').setAttribute('aria-pressed', String(value));
  text('follow', value ? 'Folgen beenden' : 'Folgen');
}

// Dynamic resolution: slow frames lower the canvas pixel density step by step (down to one
// device-independent pixel), fluent frames raise it back. FISH_FIXED_RESOLUTION disables it.
const resolution = {
  cap : 2,
  ema : 16,
  last : null,
  changed : 0
};
export function adaptResolution(now) {
  if (window.FISH_FIXED_RESOLUTION || !Number.isFinite(now))
    return;
  if (resolution.last === null) {
    resolution.last = resolution.changed = now;
    return;
  }
  const dt = Math.min(200, Math.max(0, now - resolution.last)),
        best = Math.min(2, window.devicePixelRatio || 1);
  resolution.last = now;
  resolution.ema += (dt - resolution.ema) * .05;
  if (now - resolution.changed < 2000)
    return;
  const cap = Math.min(resolution.cap, best),
        next = resolution.ema > 24 && cap > 1      ? Math.max(1, cap - .25)
               : resolution.ema < 15 && cap < best ? Math.min(best, cap + .25)
                                                   : cap;
  if (next !== resolution.cap) {
    resolution.cap = next;
    resolution.changed = now;
    resizeAquarium();
  }
}
export function resizeAquarium() {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height)
    return;
  cameraState.viewportWidth = r.width;
  cameraState.viewportHeight = r.height;
  cameraState.pixelRatio = Math.min(resolution.cap, 2, window.devicePixelRatio || 1);
  const width = Math.round(r.width * cameraState.pixelRatio),
        height = Math.round(r.height * cameraState.pixelRatio);
  let resized = false;
  if (canvas.width !== width) {
    canvas.width = width;
    resized = true;
  }
  if (canvas.height !== height) {
    canvas.height = height;
    resized = true;
  }
  if (resized && sceneState.frame && typeof draw === 'function')
    draw(sceneState.frame);
}

export function nearbyZoomFish(point, scale, event, now = displayNow()) {
  const chosen = frameFish(sceneState.frame);
  if (brainState.brainOpen && chosen?.[8])
    return chosen;
  const continuing = cameraState.zoomIntent && cameraState.zoomIntent.until > now &&
                     Math.hypot(event.clientX - cameraState.zoomIntent.x,
                                event.clientY - cameraState.zoomIntent.y) < 70;
  if (continuing) {
    const locked = frameFish(sceneState.frame, cameraState.zoomIntent.id);
    if (locked?.[8]) {
      cameraState.zoomIntent.until = now + 450;
      return locked;
    }
  }
  let best = null, score = Infinity;
  const reach = Math.max(
      60, Math.min(110, Math.min(cameraState.viewportWidth, cameraState.viewportHeight) * .13));
  for (const raw of sceneState.frame.fish) {
    if (sceneState.frame.visibleFish && !sceneState.frame.visibleFish.has(raw[4]))
      continue;
    if (!raw[8])
      continue;
    const p = blendFish(raw),
          distance = Math.hypot(horizontalDelta(p[0] - point.x), p[1] - point.y) * scale,
          hit = fishBodyContains(p, point.x, point.y, 6 / scale, scale);
    if (!hit && distance > reach)
      continue;
    const candidate =
        (hit ? -1000 + distance * .01 : distance) - (raw[4] === sceneState.frame.selected ? 10 : 0);
    if (candidate < score) {
      score = candidate;
      best = raw;
    }
  }
  cameraState.zoomIntent =
      best ? {id : best[4], x : event.clientX, y : event.clientY, until : now + 450} : null;
  return best;
}

export function updateCameraState(patch) {
  Object.assign(cameraState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "zoomIntent" : () => { cameraState.zoomIntent = null; },
  "zoom" : () => { cameraState.zoom = 1; },
  "cameraX" : () => { cameraState.cameraX = null; },
  "cameraY" : () => { cameraState.cameraY = null; },
  "following" : () => { cameraState.following = false; },
  "followOffsetX" : () => { cameraState.followOffsetX = 0; },
  "followOffsetY" : () => { cameraState.followOffsetY = 0; },
  "zoomFollowing" : () => { cameraState.zoomFollowing = false; },
  "zoomFollowTime" : () => { cameraState.zoomFollowTime = 0; },
  "zoomSelectionPending" : () => { cameraState.zoomSelectionPending = 0; },
  "drag" : () => { cameraState.drag = null; },
  "viewportWidth" : () => { cameraState.viewportWidth = 1400; },
  "viewportHeight" : () => { cameraState.viewportHeight = 900; },
  "pixelRatio" : () => { cameraState.pixelRatio = 1; },
  "onwheel" : () => {
    canvas.onwheel = async e => {
      if (!sceneState.frame)
        return;
      e.preventDefault();
      tankState.contextMenu = null;
      const before = point(e), oldScale = camera().scale,
            target = e.deltaY < 0 && !evolutionState.editing && !sceneState.frame.turbo &&
                             !sessionState.busy && !brainState.brainProbeArmed
                         ? nearbyZoomFish(before, oldScale, e)
                         : null;
      let anchor = before;
      if (target && !brainState.brainOpen) {
        const p = blendFish(target);
        if (!fishBodyContains(p, before.x, before.y, 6 / oldScale, oldScale)) {
          const pull = 1 - Math.exp(-Math.abs(e.deltaY) * .004);
          anchor = {
            x : before.x + horizontalDelta(p[0] - before.x) * pull,
            y : before.y + (p[1] - before.y) * pull
          };
        }
      }
      cameraState.zoom = Math.max(1, Math.min(2048, cameraState.zoom * Math.exp(-e.deltaY * .001)));
      {
        const after = point(e);
        cameraState.cameraX += horizontalDelta(anchor.x - after.x);
        cameraState.cameraY += anchor.y - after.y;
      }
      camera();
      if (cameraState.following) {
        const raw = frameFish(sceneState.frame);
        if (raw) {
          const p = blendFish(raw);
          cameraState.followOffsetX = horizontalDelta(cameraState.cameraX - p[0]);
          cameraState.followOffsetY = cameraState.cameraY - p[1];
        }
      }
      const chosen = frameFish(sceneState.frame), scale = camera().scale;
      if (e.deltaY > 0 && cameraState.zoomFollowing &&
          (!chosen || fishBodyRadius(chosen) * scale < 12))
        setFollowing(false);
      if (e.deltaY >= 0 || evolutionState.editing || sceneState.frame.turbo || sessionState.busy ||
          cameraState.zoomSelectionPending || !target || fishBodyRadius(target) * scale < 18)
        return;
      if (target[4] === sceneState.frame.selected) {
        if (!cameraState.following)
          setFollowing(true, true);
        return;
      }
      cameraState.zoomSelectionPending = target[4];
      try {
        await selectFish(target[4], {follow : true, details : false, fromZoom : true});
      } finally {
        cameraState.zoomSelectionPending = 0;
      }
    };
  },
  "fit_onclick" : () => {
    el('fit').onclick = () => {
      if (!sceneState.frame)
        return;
      cameraState.zoomIntent = null;
      setFollowing(false);
      cameraState.zoom = 1;
      cameraState.cameraX = sceneState.frame.width / 2;
      cameraState.cameraY = sceneState.frame.height / 2;
    };
  },
  "follow_onclick" : () => {
    el('follow').onclick = () => {
      if (sceneState.tankPreviewFish && sceneState.tankPreviewFish !== sceneState.frame?.selected)
        return selectFish(sceneState.tankPreviewFish);
      setFollowing(!cameraState.following);
      if (cameraState.following)
        cameraState.zoom = Math.max(cameraState.zoom, 6);
    };
  },
  "deselect_onclick" : () => { el('deselect').onclick = () => selectFish(0); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
