// A top projection of the field's four anatomical zones.
export const FISH_BOX = Object.freeze({x : 60, y : 60, width : 1000, height : 620});
export const CAMERA_ZOOM = Object.freeze({min : .4, max : 8});
export const SNAP_DISTANCE = 95;
export const PLACEMENT_MARGIN = 120;
const ZONE_X = Object.freeze([ [ 130, 260 ], [ 260, 470 ], [ 470, 780 ], [ 780, 964 ] ]);
export const BODY_FRAME = Object.freeze({snout : ZONE_X[0][0], tail : 905, middle : 365});
const CENTRE_Y = BODY_FRAME.middle;

export function halfWidth(x) {
  if (x <= 185)
    return 22 + (x - 130) * 1.25;
  if (x <= 410)
    return 90 + (x - 185) * .24;
  if (x <= 655)
    return 144 - (x - 410) * .06;
  if (x <= 805)
    return 129 - (x - 655) * .52;
  return Math.max(12, 51 - (x - 805) * .29);
}
export function sitePoint(site, role = '') {
  if (site.point)
    return site.point;
  const [start, end] = ZONE_X[site.zone];
  const roughX = start + (1 - site.u) * (end - start);
  const x = roughX;
  const side = site.side < 0 ? -1 : 1;
  const width = halfWidth(x);
  const offset = Math.max(4, Math.min(width * .94, width * (.13 + .75 * site.w)));
  // The fin muscle anchors extend through the paired side fins.
  if (role === 'muscle' && site.zone === 2 && site.w > .8)
    return {x, y : CENTRE_Y + side * (offset + 31)};
  if (role === 'muscle' && site.zone === 3 && site.w > .8)
    return {x, y : CENTRE_Y + side * (offset + 30)};
  return {x, y : CENTRE_Y + side * offset};
}
export function pointDistance(site, position, role = '') {
  const q = sitePoint(site, role);
  return Math.hypot(q.x - position.x, q.y - position.y);
}
export function nearFish(position, sites, radius = PLACEMENT_MARGIN) {
  return sites.some(site => pointDistance(site, position) <= radius ||
                            pointDistance(site, position, 'muscle') <= radius);
}
export function fishPath() {
  return 'M130 365 Q160 290 225 278 Q350 204 475 225 Q650 238 783 308 ' +
         'Q840 333 884 342 L913 365 L884 388 ' +
         'Q840 399 783 422 Q650 492 475 505 Q350 526 225 452 Q160 440 130 365 Z';
}
export function cameraBox(camera) {
  const zoom = Math.max(CAMERA_ZOOM.min, Math.min(CAMERA_ZOOM.max, camera.zoom ?? 1));
  const width = FISH_BOX.width / zoom, height = FISH_BOX.height / zoom;
  const x = (camera.x ?? 560) - width / 2, y = (camera.y ?? 365) - height / 2;
  return {x, y, width, height, zoom};
}
// Pixels per world unit in the SVG's *actual* letterboxed viewport.
export function cameraScale(rect, camera) {
  const box = cameraBox(camera);
  return Math.min(rect.width / box.width, rect.height / box.height);
}
export function cameraCoordinates(event, svg, camera) {
  const matrix = svg.getScreenCTM?.();
  if (matrix && svg.createSVGPoint) {
    const pointer = svg.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const position = pointer.matrixTransform(matrix.inverse());
    return {x : position.x, y : position.y};
  }
  const rect = svg.getBoundingClientRect(), box = cameraBox(camera);
  const scale = cameraScale(rect, camera);
  const left = rect.left + (rect.width - box.width * scale) / 2;
  const top = rect.top + (rect.height - box.height * scale) / 2;
  return {x : box.x + (event.clientX - left) / scale, y : box.y + (event.clientY - top) / scale};
}
