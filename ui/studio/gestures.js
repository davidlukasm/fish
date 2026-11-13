import {moveCanvasOrgan} from './canvas_placement.js';
import {clamp} from '../units.js';
import {markedKind} from './events.js';
import {DRAG_CLICK, DRAG_START, GRIPS} from './handles.js';
import {closestSite, findCenter, findOrgan, moveCenter, usedSites} from './model/document.js';
import {moveAssembly} from './model/assemblies.js';
import {siteRole} from './model/organs.js';
import {nearFish, nerveZone, pointDistance, SNAP_DISTANCE} from './model/layout.js';
import {
  CAMERA_HOME,
  CAMERA_ZOOM,
  cameraBox,
  FISH_BOX,
  cameraCoordinates,
  cameraScale,
  STEADY,
  steadyScale,
  viewBoxOf
} from './view/frame.js';
import {fieldExtent} from './view/vision.js';
import {arrowSize} from './view/wires.js';
import {BODY_MAP, LAYER} from './view/scene.js';
import {dataAttribute, pointText} from './view/markup.js';
import {zoomStamp} from './view/shell.js';
import {label} from './view/kit.js';
import {placementPreview} from './view/placing.js';

const PRESSED_ITEMS = Object.freeze([ 'contact', 'center', 'assembly', 'organ', 'wire' ]);
const WIRE_ENDS = Object.freeze([ 'center', 'organ', 'assembly' ]);
const MOVED_ITEMS = Object.freeze([ 'organ', 'center', 'assembly' ]);
// Room the floating tool bar takes at the map's left edge, and a little air at the others, in fish
// units at full size.
const VIEW_ROOM = Object.freeze({left : 80, edge : 20}),
      NO_ROOM = Object.freeze({left : 0, edge : 0});
// While the wheel turns, only the view box and the marks drawn at a steady size follow; the scene
// is redrawn at the new zoom once the wheel has rested this long (ms), so zooming stays fluid
// however many nodes the fish has.
const ZOOM_REST = 140;
const itemSelector = kinds => kinds.map(kind => '[' + dataAttribute(kind) + ']').join(',');
export const gestureMethods = {
  zoom(direction, anchor = null, gliding = false) {
    const c = this.state.camera, previous = c.zoom;
    c.zoom = typeof direction === 'number' ? clamp(direction, CAMERA_ZOOM.min, CAMERA_ZOOM.max)
             : direction === 'in'          ? Math.min(CAMERA_ZOOM.max, c.zoom * CAMERA_ZOOM.step)
             : direction === 'out'         ? Math.max(CAMERA_ZOOM.min, c.zoom / CAMERA_ZOOM.step)
                                           : 1;
    if (anchor && previous !== c.zoom) {
      c.x += (anchor.x - c.x) * (1 - previous / c.zoom);
      c.y += (anchor.y - c.y) * (1 - previous / c.zoom);
    }
    if (direction === 'fit')
      Object.assign(c, CAMERA_HOME);
    clearTimeout(this.zoomRest);
    if (gliding && this.glideZoom(previous))
      this.zoomRest = setTimeout(() => this.zoom(c.zoom), ZOOM_REST);
    else
      this.refreshScene();
    this.showZoom();
  },
  showZoom() {
    this.refreshSwitches();
    const stamp = this.root.querySelector('.aid-canvas-toolbar');
    if (stamp)
      stamp.textContent = zoomStamp(this.state.camera);
  },
  // Follows a zoom step without redrawing: the view box, the ground, the steady marks, the node
  // dots and the arrow heads take the new zoom as they would after a redraw.
  glideZoom(previous) {
    const svg = this.bodyMap(), c = this.state.camera;
    if (!svg)
      return false;
    const box = cameraBox(c), node = Math.sqrt(previous / c.zoom);
    svg.setAttribute('viewBox', viewBoxOf(c));
    const ground = svg.querySelector('.aid-canvas-ground');
    for (const key of ['x', 'y', 'width', 'height'])
      ground?.setAttribute(key, box[key]);
    for (const mark of svg.querySelectorAll('[' + STEADY + ']'))
      mark.setAttribute(
          'transform',
          mark.getAttribute('transform').replace(/scale\([^)]*\)/, steadyScale(c.zoom)));
    for (const dot of svg.querySelectorAll('circle.aid-retina-node'))
      dot.setAttribute('r', Number(dot.getAttribute('r')) * node);
    for (const marker of svg.querySelectorAll('marker.aid-wire-marker')) {
      marker.setAttribute('markerWidth', arrowSize(c.zoom));
      marker.setAttribute('markerHeight', arrowSize(c.zoom));
    }
    // A running stimulus keeps its paths and progress at the new screen scale.
    this.pulsePlayer?.rescale();
    return true;
  },
  // With `clearTools` the point also keeps clear of the tool bar; a point that follows the pointer
  // does not, as it would zoom out with every step it takes along the edge.
  keepInView(point, clearTools = false) {
    const c = this.state.camera, R = clearTools ? VIEW_ROOM : NO_ROOM;
    const inside = () => {
      const box = cameraBox(c), z = c.zoom;
      return point.x >= box.x + R.left / z && point.x <= box.x + box.width - R.edge / z &&
             point.y >= box.y + R.edge / z && point.y <= box.y + box.height - R.edge / z;
    };
    const start = c.zoom;
    while (!inside() && c.zoom > CAMERA_ZOOM.min)
      c.zoom = Math.max(CAMERA_ZOOM.min, c.zoom / CAMERA_ZOOM.step);
    if (c.zoom !== start)
      this.zoom(c.zoom);
  },
  // A chosen eye or near sense shows its whole field with the handles on it. The view widens once,
  // when the organ is chosen; it returns when the organ is let go, unless the user moved it.
  frameField() {
    const s = this.state, c = s.camera,
          chosen = s.selected?.kind === 'organ' && s.mode === 'fish'
                       ? findOrgan(s.document, s.selected.id)
                       : null;
    // The test light finds its place only after the organ is chosen; the view is framed again then.
    const points = chosen?.field ? fieldExtent(s, chosen) : [],
          id = points.length ? chosen.id + ' ' + points.length : null, framed = this.fieldFrame;
    if (id === (framed?.id ?? null))
      return;
    const same = (a, b) => a.zoom === b.zoom && a.x === b.x && a.y === b.y;
    if (framed && same(c, framed.shown))
      Object.assign(c, framed.before);
    this.fieldFrame = null;
    if (!id)
      return;
    const view = cameraBox(c), edge = VIEW_ROOM.edge / view.zoom;
    const xs =
              [
                view.x + VIEW_ROOM.left / view.zoom, view.x + view.width - edge,
                ...points.map(p => p.x)
              ],
          ys = [ view.y + edge, view.y + view.height - edge, ...points.map(p => p.y) ];
    const left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs) - left,
          height = Math.max(...ys) - top;
    const zoom = Math.min(view.zoom, (FISH_BOX.width - VIEW_ROOM.left - VIEW_ROOM.edge) / width,
                          (FISH_BOX.height - 2 * VIEW_ROOM.edge) / height);
    const before = {...c};
    c.zoom = Math.max(CAMERA_ZOOM.min, zoom);
    c.x = left + width / 2 + (VIEW_ROOM.edge - VIEW_ROOM.left) / (2 * c.zoom);
    c.y = top + height / 2;
    this.fieldFrame = {id, before, shown : {...c}};
  },
  drawConnectingLine(from, to) {
    this.root.querySelector(LAYER.line)
        ?.setAttribute('d', 'M' + pointText(from) + ' L' + pointText(to));
  },
  wheel(event) {
    const svg = event.target.closest?.(BODY_MAP);
    if (!svg || this.state.mode !== 'fish')
      return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1);
    this.zoom(this.state.camera.zoom * Math.exp(-clamp(delta, -240, 240) * .002),
              cameraCoordinates(event, svg, this.state.camera), true);
  },
  pointerDown(event) {
    const grip = event.target.closest?.('[data-panel-grip]');
    if (grip && event.button === 0) {
      const panel = grip.dataset.panelGrip;
      this.holdHandle(event, 'panel', {
        panel,
        x : event.clientX,
        width : grip.parentElement.getBoundingClientRect().width,
        sign : panel === 'library' ? 1 : -1
      });
      return;
    }
    if ((event.button !== 0 && event.button !== 1) || this.state.station !== 'studio')
      return;
    for (const grip of GRIPS) {
      const graphic = event.target.closest?.(grip.graphic),
            handle = grip.handle ? event.target.closest?.(grip.handle) : null;
      if (!graphic || (grip.handle && !handle && !grip.claims))
        continue;
      const drag = !grip.handle || handle ? grip.start(this, graphic, handle, event) : null;
      if (drag)
        this.holdHandle(event, grip.held,
                        grip.rect === false
                            ? {...drag, graphic}
                            : {...drag, graphic, rect : graphic.getBoundingClientRect()});
      return;
    }
    // The CPPN view has only its grips; the body map follows.
    if (this.state.mode !== 'fish')
      return;
    const svg = event.target.closest?.(BODY_MAP);
    if (!svg)
      return;
    if (this.state.armed && event.button === 0)
      return;
    const item = event.target.closest?.(itemSelector(PRESSED_ITEMS));
    const kind = markedKind(item, PRESSED_ITEMS);
    const id = kind ? item.dataset[kind] : null;
    this.pointer = {
      id,
      kind,
      x : event.clientX,
      y : event.clientY,
      moved : false,
      origin : cameraCoordinates(event, svg, this.state.camera),
      svg
    };
    if (this.state.tool === 'wire' && WIRE_ENDS.includes(kind))
      this.pointer.wireFrom = {kind, id};
    if (this.state.tool === 'pan' || !kind || event.button === 1)
      this.pointer.pan = {x : this.state.camera.x, y : this.state.camera.y};
  },
  pointerMove(event) {
    if (this.handleDrag)
      return this.followHandle(event);
    const drag = this.pointer;
    if (!drag) {
      const svg = event.target?.closest?.(BODY_MAP);
      if (svg && this.state.armed)
        this.dragOver(event);
      if (svg && this.pendingWire?.from && this.state.tool === 'wire') {
        const from = this.wirePoint(this.pendingWire.from);
        if (from)
          this.drawConnectingLine(from, cameraCoordinates(event, svg, this.state.camera));
      }
      return;
    }
    if (this.state.station !== 'studio')
      return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > DRAG_START)
      drag.moved = true;
    if (!drag.moved)
      return;
    const point = cameraCoordinates(event, drag.svg, this.state.camera);
    if (drag.pan) {
      const rect = this.bodyMap()?.getBoundingClientRect() || drag.svg.getBoundingClientRect();
      const scale = cameraScale(rect, this.state.camera);
      if (!(scale > 0))
        return;
      this.state.camera.x = drag.pan.x - (event.clientX - drag.x) / scale;
      this.state.camera.y = drag.pan.y - (event.clientY - drag.y) / scale;
      drag.svg.setAttribute('viewBox', viewBoxOf(this.state.camera));
      return;
    }
    if (drag.wireFrom) {
      this.drawConnectingLine(this.wirePoint(drag.wireFrom) ?? drag.origin, point);
      return;
    }
    if (MOVED_ITEMS.includes(drag.kind)) {
      this.showTrash(true);
      const preview = this.root.querySelector(LAYER.preview);
      if (this.overTrash(event))
        return preview?.replaceChildren();
      const organ = drag.kind === 'organ' ? findOrgan(this.state.document, drag.id) : null;
      if (organ)
        this.showHints('organ', organ.type, drag.id, organ.id);
      const type = organ?.type ?? (drag.kind === 'assembly'
                                       ? 'brain'
                                       : findCenter(this.state.document, drag.id)?.organ.type);
      if (preview)
        preview.innerHTML =
            nearFish(point, this.state.sites) ? placementPreview(this.state, {type}, point) : '';
    }
  },
  interruptPointer() {
    const drag = this.handleDrag;
    if (!drag && !this.pointer && !this.dragging)
      return;
    this.pointer = this.dragging = this.pendingWire = null;
    this.clearPreview();
    this.showTrash(false);
    this.ignoreClickUntil = performance.now() + DRAG_CLICK;
    // Keep the value already shown, without treating the interruption as a drop location.
    if (drag)
      this.releaseHandle({clientX : drag.last.x, clientY : drag.last.y});
    else
      this.refreshLibrary();
  },
  pointerUp(event) {
    if (this.handleDrag)
      return this.releaseHandle(event);
    const drag = this.pointer;
    if (!drag)
      return;
    this.pointer = null;
    const trashed = this.overTrash(event);
    this.showTrash(false);
    if (!drag.moved)
      return;
    this.ignoreClickUntil = performance.now() + DRAG_CLICK;
    event.preventDefault();
    if (drag.wireFrom) {
      this.pendingWire = null;
      const target = document.elementFromPoint(event.clientX, event.clientY)
                         ?.closest?.(itemSelector(WIRE_ENDS));
      const kind = markedKind(target, WIRE_ENDS);
      if (kind)
        this.connectSelections(drag.wireFrom, {kind, id : target.dataset[kind]});
      this.clearPreview();
      return;
    }
    if (drag.pan)
      return this.state.armed && this.restorePlacement();
    if (!MOVED_ITEMS.includes(drag.kind))
      return;
    if (trashed) {
      this.clearPreview();
      this.removeSelection({kind : drag.kind, id : drag.id});
      return this.notice(label('status.removed'));
    }
    const bounds = this.root.querySelector('.aid-scene-frame')?.getBoundingClientRect();
    if (!bounds)
      return;
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
                   event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    const point = cameraCoordinates(event, drag.svg, this.state.camera);
    if (!inside || !nearFish(point, this.state.sites))
      return this.clearPreview();
    const doc = this.state.document, sites = this.state.sites;
    const moveTo = {
      center : () => {
        const found = findCenter(doc, drag.id), type = found?.organ.type;
        const site = found && closestSite(found.center, sites.filter(nerveZone),
                                          usedSites(doc, c => c.id !== drag.id), point, null, type);
        return site && pointDistance(site, point, siteRole(type)) <= SNAP_DISTANCE
                   ? moveCenter(doc, drag.id, site.id, sites)
                   : null;
      },
      organ : () => moveCanvasOrgan(this.state, drag.id, point, drag.origin),
      assembly : () => moveAssembly(doc, drag.id, sites, point, drag.origin, SNAP_DISTANCE)
    };
    const moved = moveTo[drag.kind]();
    if (moved)
      this.changeDocument(moved, {kind : drag.kind, id : drag.id});
    else
      this.notice(label('status.noRoom'));
    this.clearPreview();
  }
};
