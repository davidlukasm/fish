// Frames are signed differences from the engine's unperturbed comparison network.
export function createProbePlayer(frames, show, clear) {
  const frameMs = 100;
  let handle = null, started = null, current = -1, active = false;
  const stop = () => {
    if (handle !== null)
      cancelAnimationFrame(handle);
    handle = null;
    active = false;
    clear();
  };
  const draw = now => {
    if (!active)
      return;
    if (started === null)
      started = now;
    const index = Math.floor((now - started) / frameMs);
    if (index >= frames.length)
      return stop();
    if (index !== current) {
      current = index;
      show(frames[index], index);
    }
    handle = requestAnimationFrame(draw);
  };
  return {
    start() {
      active = true;
      handle = requestAnimationFrame(draw);
    },
    attach() {
      if (active && current >= 0)
        show(frames[current], current);
    },
    running : () => active,
    stop
  };
}
