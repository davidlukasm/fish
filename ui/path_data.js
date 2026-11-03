// Shapes as path data: absolute M, L, C, Q and Z commands as in SVG, traced onto any canvas-like
// context (a 2D canvas or a path of the tank renderer). Each string is parsed once.
const COMMANDS = Object.freeze(
    {M : 'moveTo', L : 'lineTo', C : 'bezierCurveTo', Q : 'quadraticCurveTo', Z : 'closePath'});
const parsed = new Map();
export function tracePath(g, d) {
  let calls = parsed.get(d);
  if (!calls) {
    calls = [...d.matchAll(/([MLCQZ])([^MLCQZ]*)/g) ].map(
        ([, command,
          args ]) => [COMMANDS[command], args.trim().split(/\s+/).filter(Boolean).map(Number)]);
    parsed.set(d, calls);
  }
  for (const [call, args] of calls)
    g[call](...args);
}
