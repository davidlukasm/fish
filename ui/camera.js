import {t} from './strings.js';
import {brainState} from './brain.js';
import {canvas, el} from './dom.js';
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
  wrapScreenX
} from './state.js';
import {selectFish} from './fish_choice.js';
import {draw, tankState} from './tank.js';
import {FISH} from './schema.js';
export const cameraState = {};
export const ZOOM = Object.freeze({
  detail : .7,
  close : 1.5,
  max : 2048,
  select : 18,
  release : 12,
  follow : 6,
  wheel : .001,
  pull : .004,
  hit_slop : 6
});
export const SCREEN = Object.freeze({width : 1400, height : 900});
export const POINTER = Object.freeze({drag : 5});

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
      cameraState.zoom;
  cameraState.cameraY = cameraState.viewportHeight / scale >= f.height
                            ? f.height / 2
                            : Math.max(0, Math.min(f.height, cameraState.cameraY ?? f.height / 2));
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

export function horizontalShifts(f, c) {
  const tile = Math.floor((cameraState.viewportWidth / 2 - c.ox) / c.scale / f.width);
  return [ tile - 1, tile, tile + 1 ].map(i => i * f.width);
}

export function setFollowing(value, fromZoom = false) {
  cameraState.following = value;
  cameraState.zoomFollowing = value && fromZoom;
  cameraState.zoomFollowTime = 0;
  const raw = frameFish(sceneState.frame), p = raw && blendFish(raw);
  cameraState.followOffsetX =
      value && fromZoom && p ? horizontalDelta((cameraState.cameraX ?? p[FISH.x]) - p[FISH.x]) : 0;
  cameraState.followOffsetY =
      value && fromZoom && p ? (cameraState.cameraY ?? p[FISH.y]) - p[FISH.y] : 0;
  el('follow').setAttribute('aria-pressed', String(value));
  el('follow').title = value ? t('camera.folgenBeenden') : t('camera.folgen');
}

export const RESOLUTION = Object.freeze({
  max_ratio : 2,
  frame_ms : 16,
  max_dt : 200,
  smoothing : .05,
  hold_ms : 2000,
  slow_ms : 24,
  fast_ms : 15,
  step : .25
});
const resolution = {
  cap : RESOLUTION.max_ratio,
  ema : RESOLUTION.frame_ms,
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
  const R = RESOLUTION, dt = Math.min(R.max_dt, Math.max(0, now - resolution.last)),
        best = Math.min(R.max_ratio, window.devicePixelRatio || 1);
  resolution.last = now;
  resolution.ema += (dt - resolution.ema) * R.smoothing;
  if (now - resolution.changed < R.hold_ms)
    return;
  const cap = Math.min(resolution.cap, best),
        next = resolution.ema > R.slow_ms && cap > 1      ? Math.max(1, cap - R.step)
               : resolution.ema < R.fast_ms && cap < best ? Math.min(best, cap + R.step)
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
  cameraState.pixelRatio =
      Math.min(resolution.cap, RESOLUTION.max_ratio, window.devicePixelRatio || 1);
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

const INTENT = Object.freeze({
  reach : 70,
  hold_ms : 450,
  min_pick : 60,
  max_pick : 110,
  pick_share : .13,
  hit_rank : -1000,
  hit_distance : .01,
  selected_bonus : 10,
  follow_ms : 4000
});
export function nearbyZoomFish(point, scale, event, now = displayNow()) {
  const chosen = frameFish(sceneState.frame);
  if (brainState.brainOpen && chosen?.[FISH.hatched])
    return chosen;
  const continuing = cameraState.zoomIntent && cameraState.zoomIntent.until > now &&
                     Math.hypot(event.clientX - cameraState.zoomIntent.x,
                                event.clientY - cameraState.zoomIntent.y) < INTENT.reach;
  if (continuing) {
    const locked = frameFish(sceneState.frame, cameraState.zoomIntent.id);
    if (locked?.[FISH.hatched]) {
      cameraState.zoomIntent.until = now + INTENT.hold_ms;
      return locked;
    }
  }
  let best = null, score = Infinity;
  const reach = Math.max(
      INTENT.min_pick,
      Math.min(INTENT.max_pick, Math.min(cameraState.viewportWidth, cameraState.viewportHeight) *
                                    INTENT.pick_share));
  for (const raw of sceneState.frame.fish) {
    if (sceneState.frame.visibleFish && !sceneState.frame.visibleFish.has(raw[FISH.id]))
      continue;
    if (!raw[FISH.hatched])
      continue;
    const p = blendFish(raw),
          distance = Math.hypot(horizontalDelta(p[FISH.x] - point.x), p[FISH.y] - point.y) * scale,
          hit = fishBodyContains(p, point.x, point.y, ZOOM.hit_slop / scale, scale);
    if (!hit && distance > reach)
      continue;
    const candidate = (hit ? INTENT.hit_rank + distance * INTENT.hit_distance : distance) -
                      (raw[FISH.id] === sceneState.frame.selected ? INTENT.selected_bonus : 0);
    if (candidate < score) {
      score = candidate;
      best = raw;
    }
  }
  cameraState.zoomIntent =
      best
          ? {id : best[FISH.id], x : event.clientX, y : event.clientY, until : now + INTENT.hold_ms}
          : null;
  return best;
}

const SIGHT_SHARE = 1.75;
export function fishSightPixels(share = SIGHT_SHARE) {
  return p => Math.min(cameraState.viewportWidth, cameraState.viewportHeight) / 2 *
              fishBodyRadius(p) / (share * sceneState.frame.parameters.vision_range);
}

export async function zoomToFish(id, pixels) {
  if (!frameFish(sceneState.frame, id))
    return;
  // A frame rendered before the selection reached the simulation must not end the follow.
  cameraState.followIntent = {id, until : performance.now() + INTENT.follow_ms};
  if (sceneState.frame.selected !== id)
    await selectFish(id);
  const p = frameFish(sceneState.frame, id);
  if (!p)
    return;
  updateCameraState(
      {cameraX : p[FISH.x], cameraY : p[FISH.y], followOffsetX : 0, followOffsetY : 0});
  const base = Math.min(cameraState.viewportWidth / sceneState.frame.width,
                        cameraState.viewportHeight / sceneState.frame.height);
  const radius = typeof pixels === 'function' ? pixels(p) : pixels;
  updateCameraState({zoom : Math.max(1, Math.min(ZOOM.max, radius / (fishBodyRadius(p) * base)))});
  setFollowing(true);
  draw(sceneState.frame);
}

const SPECIMEN_PIXELS = 55;
export function zoomToSpecimen(id) {
  return zoomToFish(id, p => Math.max(SPECIMEN_PIXELS, fishBodyRadius(p) * camera().scale));
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
  "viewportWidth" : () => { cameraState.viewportWidth = SCREEN.width; },
  "viewportHeight" : () => { cameraState.viewportHeight = SCREEN.height; },
  "pixelRatio" : () => { cameraState.pixelRatio = 1; },
  "onwheel" : () => {
    canvas.onwheel = async e => {
      if (!sceneState.frame)
        return;
      e.preventDefault();
      cameraState.wheelAt = performance.now();
      tankState.contextMenu = null;
      const before = point(e), oldScale = camera().scale,
            target = e.deltaY < 0 && !evolutionState.editing && !sceneState.frame.turbo &&
                             !sessionState.busy && !brainState.brainProbeArmed
                         ? nearbyZoomFish(before, oldScale, e)
                         : null;
      let anchor = before;
      if (target && !brainState.brainOpen) {
        const p = blendFish(target);
        if (!fishBodyContains(p, before.x, before.y, ZOOM.hit_slop / oldScale, oldScale)) {
          const pull = 1 - Math.exp(-Math.abs(e.deltaY) * ZOOM.pull);
          anchor = {
            x : before.x + horizontalDelta(p[FISH.x] - before.x) * pull,
            y : before.y + (p[FISH.y] - before.y) * pull
          };
        }
      }
      cameraState.zoom =
          Math.max(1, Math.min(ZOOM.max, cameraState.zoom * Math.exp(-e.deltaY * ZOOM.wheel)));
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
          cameraState.followOffsetX = horizontalDelta(cameraState.cameraX - p[FISH.x]);
          cameraState.followOffsetY = cameraState.cameraY - p[FISH.y];
        }
      }
      const chosen = frameFish(sceneState.frame), scale = camera().scale;
      if (e.deltaY > 0 && cameraState.zoomFollowing &&
          (!chosen || fishBodyRadius(chosen) * scale < ZOOM.release))
        setFollowing(false);
      if (e.deltaY >= 0 || evolutionState.editing || sceneState.frame.turbo || sessionState.busy ||
          cameraState.zoomSelectionPending || !target ||
          fishBodyRadius(target) * scale < ZOOM.select)
        return;
      if (target[FISH.id] === sceneState.frame.selected) {
        if (!cameraState.following)
          setFollowing(true, true);
        return;
      }
      cameraState.zoomSelectionPending = target[FISH.id];
      try {
        await selectFish(target[FISH.id], {follow : true, details : false, fromZoom : true});
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
        cameraState.zoom = Math.max(cameraState.zoom, ZOOM.follow);
    };
  },
  "deselect_onclick" : () => { el('deselect').onclick = () => selectFish(0); },
  "new_ResizeObserver_resizeAquarium_observe" : () => {
    if (typeof ResizeObserver !== 'undefined')
      new ResizeObserver(resizeAquarium).observe(canvas);
  },
  "addEventListener_resize" : () => { window.addEventListener?.('resize', resizeAquarium); },
  "resizeAquarium" : () => { resizeAquarium(); },
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
