// The drawing frame of the Atelier: the camera over the design and the outline of a fish
// without a developed body.
export const FISH_BOX = Object.freeze({x : 60, y : 60, width : 1000, height : 620});
export const CAMERA_ZOOM = Object.freeze({min : .4, max : 8});
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
