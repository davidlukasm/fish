import {brainLobes} from './view/region_layout.js';
import {clamp} from '../units.js';
import {markedKind} from './events.js';
import {DRAG_CLICK, DRAG_START, GRIPS} from './handles.js';
import {fieldPlacements} from './model/placement.js';
import {
  closestSite,
  findCenter,
  findOrgan,
  moveCenter,
  moveOrgan,
  usedSites
} from './model/document.js';
import {moveAssembly} from './model/assemblies.js';
import {siteRole} from './model/organs.js';
import {nearFish, nerveZone, pointDistance, SNAP_DISTANCE} from './model/layout.js';
import {
  CAMERA_HOME,
  CAMERA_ZOOM,
  cameraBox,
  cameraCoordinates,
  cameraScale,
  viewBoxOf
} from './view/frame.js';
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
const itemSelector = kinds => kinds.map(kind => '[' + dataAttribute(kind) + ']').join(',');
export const gestureMethods = {
  zoom(direction, anchor = null) {
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
    this.refreshScene();
    this.refreshSwitches();
    const stamp = this.root.querySelector('.aid-canvas-toolbar');
    if (stamp)
      stamp.textContent = zoomStamp(c);
  },
  focusBrainPart(key) {
    const part = brainLobes(this.state.document, this.state.sites).find(p => p.key === key);
    if (!part)
      return;
    Object.assign(this.state.camera, {x : part.x, y : part.y});
    this.zoom(2.3);
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
    while (!inside() && c.zoom > CAMERA_ZOOM.min)
      this.zoom('out');
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
              cameraCoordinates(event, svg, this.state.camera));
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
    if ((event.button !== 0 && event.button !== 1) || this.state.station !== 'studio' ||
        this.state.mode !== 'fish')
      return;
    for (const grip of GRIPS) {
      const graphic = event.target.closest?.(grip.graphic),
            handle = grip.handle ? event.target.closest?.(grip.handle) : null;
      if (!graphic || (grip.handle && !handle && !grip.claims))
        continue;
      const drag = !grip.handle || handle ? grip.start(this, graphic, handle, event) : null;
      if (drag)
        this.holdHandle(event, grip.held,
                        grip.rect === false ? drag
                                            : {...drag, rect : graphic.getBoundingClientRect()});
      return;
    }
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
    else if (kind === 'organ' && this.state.tool === 'select' &&
             findOrgan(this.state.document, id)?.field)
      this.prepareChoices(fieldPlacements(this.state.document, id, this.state.sites));
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
      if (organ?.field)
        return this.showChoices(point);
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
      return this.cancelChoices();
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
      return this.state.armed ? this.restorePlacement() : this.cancelChoices();
    if (!MOVED_ITEMS.includes(drag.kind))
      return this.cancelChoices();
    if (trashed) {
      this.cancelChoices();
      this.clearPreview();
      this.removeSelection({kind : drag.kind, id : drag.id});
      return this.notice(label('status.removed'));
    }
    if (drag.kind === 'organ' && findOrgan(this.state.document, drag.id)?.field) {
      const point = cameraCoordinates(event, drag.svg, this.state.camera);
      this.clearPreview();
      if (!this.commitChoice(point))
        this.notice(label('status.noRoom'));
      return;
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
      organ : () => moveOrgan(doc, drag.id, sites, point, SNAP_DISTANCE, drag.origin),
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
