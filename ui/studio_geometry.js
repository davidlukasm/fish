// A top projection of the field's four anatomical zones.
export const FISH_BOX = Object.freeze({x : 60, y : 60, width : 1000, height : 620});
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
  const [start, end] = ZONE_X[site.zone];
  const roughX = start + (1 - site.u) * (end - start);
  // An R2 low-discrepancy offset breaks up the rigid developmental grid.
  // Both members of a left/right site pair share the displacement, mirrored on Y.
  const pair = Math.floor(site.id / 2) + 1;
  const fract = value => value - Math.floor(value);
  const jitterX = (fract(pair * .7548776662466927) - .5) * 20;
  const jitterY = (fract(pair * .5698402909980532) - .5) * 18;
  const x = roughX + jitterX + (site.v - .5) * 12;
  const side = site.side < 0 ? -1 : 1;
  const width = halfWidth(x);
  const offset = Math.max(
      4, Math.min(width * .94, width * (.13 + .75 * site.w) + jitterY + (site.v - .5) * 12));
  // The fin muscle anchors extend through the paired side fins.
  if (role === 'fin' && site.zone === 2 && site.w > .8)
    return {x, y : CENTRE_Y + side * (offset + 31)};
  if (role === 'tail' && site.zone === 3 && site.w > .8)
    return {x, y : CENTRE_Y + side * (offset + 30)};
  return {x, y : CENTRE_Y + side * offset};
}
export function pointDistance(site, position, role = '') {
  const q = sitePoint(site, role);
  return Math.hypot(q.x - position.x, q.y - position.y);
}
export function fishPath() {
  return 'M130 365 Q160 290 225 278 Q350 204 475 225 Q650 238 783 308 ' +
         'Q840 333 884 342 L913 365 L884 388 ' +
         'Q840 399 783 422 Q650 492 475 505 Q350 526 225 452 Q160 440 130 365 Z';
}
export function tailPath() {
  return "M880 357 Q936 309 998 255 L969 365 L998 475 Q936 421 880 373 Z";
}
export function finPaths() {
  return [
    'M469 260 Q480 142 602 119 Q596 216 541 256 Z', 'M469 469 Q480 585 602 609 Q596 512 541 473 Z',
    'M650 276 Q696 174 774 193 Q803 249 752 305 Z', 'M650 451 Q696 554 774 535 Q803 479 752 423 Z'
  ];
}
export function cameraBox(camera) {
  const zoom = Math.max(.4, Math.min(8, camera.zoom ?? 1));
  const width = FISH_BOX.width / zoom, height = FISH_BOX.height / zoom;
  const x = (camera.x ?? 560) - width / 2, y = (camera.y ?? 365) - height / 2;
  return {x, y, width, height, zoom};
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
  const scale = Math.min(rect.width / box.width, rect.height / box.height);
  const left = rect.left + (rect.width - box.width * scale) / 2;
  const top = rect.top + (rect.height - box.height * scale) / 2;
  return {x : box.x + (event.clientX - left) / scale, y : box.y + (event.clientY - top) / scale};
}
