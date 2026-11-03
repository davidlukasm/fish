// Shared units of the interface: angles and colour channels.
export const DEGREE = Math.PI / 180;
export const radians = degrees => degrees * DEGREE;
export const degrees = angle => angle / DEGREE;
// A full turn in degrees; a direction in degrees from 0 up to a full turn.
export const FULL_TURN = 360;
// An angle in radians folded into -π to π.
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export const heading = (y, x) => (degrees(Math.atan2(y, x)) + FULL_TURN) % FULL_TURN;
// The hue of an RGB colour in degrees, from its position on the colour wheel.
export const hueOf = ([ r, g, b ]) => heading(Math.sqrt(3) * (g - b), 2 * r - g - b);
// A share in percent.
export const PERCENT = 100;
// Colour channels run from 0 to CHANNEL_MAX in bytes and in hex notation; alpha follows the
// colour channels.
export const CHANNEL_MAX = 255, ALPHA = 3;
// Milliseconds per second.
export const SECOND_MS = 1000;
// Perceived brightness of red, green and blue.
export const LUMA = Object.freeze([ .3, .59, .11 ]);
export const luma = rgb => rgb.reduce((sum, v, k) => sum + v * LUMA[k], 0);
// A pseudo-random value in [0, 1) from any number: the fraction of a scaled sine.
const SINE_SCALE = 43758.5453;
export const sineHash = x => {
  const v = Math.sin(x) * SINE_SCALE;
  return v - Math.floor(v);
};
// The count of 32-bit unsigned values.
export const UINT32_RANGE = 2 ** 32;
// An RGBA pixel takes PIXEL_BYTES bytes; a kibibyte has KIB bytes.
export const PIXEL_BYTES = 4, KIB = 1024;
const HEX = 16, HEX_DIGITS = 2, SHORT_HEX = 4;
// A colour from '#rgb', '#rgba', '#rrggbb' or '#rrggbbaa', as channels from 0 to 1.
export function hexColor(text) {
  const hex = String(text).trim().replace(/^#/, ''),
        full = hex.length <= SHORT_HEX ? [...hex ].map(c => c + c).join('') : hex, channels = [];
  for (let i = 0; i < full.length; i += HEX_DIGITS)
    channels.push(parseInt(full.slice(i, i + HEX_DIGITS), HEX) / CHANNEL_MAX);
  return channels;
}
// Channels from 0 to 1 as '#rrggbb'.
export const hexOf = channels =>
    '#' +
    channels.map(c => Math.round(CHANNEL_MAX * c).toString(HEX).padStart(HEX_DIGITS, '0')).join('');
// Hues in degrees fall into HUE_SECTORS sectors of HUE_SECTOR degrees.
const HUE_SECTORS = 6, HUE_SECTOR = FULL_TURN / HUE_SECTORS;
// A pure hue in degrees as RGB channels: each channel ramps over HUE_RAMP sectors; red, green and
// blue start at the sectors HUE_START.
const HUE_RAMP = 4, HUE_START = Object.freeze([ 5, 3, 1 ]);
export const hueRGB = hue => HUE_START.map(n => {
  const k = (n + hue / HUE_SECTOR) % HUE_SECTORS;
  return 1 - Math.max(0, Math.min(k, HUE_RAMP - k, 1));
});
const COLOR_WORDS = Object.freeze({transparent : [ 0, 0, 0, 0 ], white : [ 1, 1, 1, 1 ]});
// A CSS colour as channels from 0 to 1 with alpha: '#hex', 'rgb()' or 'rgba()' with byte
// channels, 'hsl()' or 'hsla()', or a colour word; anything else is opaque black.
export function cssColor(text) {
  const s = String(text).trim();
  if (s[0] === '#') {
    const channels = hexColor(s);
    return channels.length > ALPHA ? channels : [...channels, 1 ];
  }
  const n = (s.match(/[-+\d.]+/g) || []).map(Number), alpha = n[ALPHA] ?? 1;
  if (s.startsWith('rgb'))
    return [...n.slice(0, ALPHA).map(v => v / CHANNEL_MAX), alpha ];
  if (s.startsWith('hsl')) {
    const lightness = n[2] / PERCENT,
          h = ((n[0] / HUE_SECTOR) % HUE_SECTORS + HUE_SECTORS) % HUE_SECTORS,
          c = (1 - Math.abs(2 * lightness - 1)) * n[1] / PERCENT, x = c * (1 - Math.abs(h % 2 - 1)),
          m = lightness - c / 2,
          q = [ [ c, x, 0 ], [ x, c, 0 ], [ 0, c, x ], [ 0, x, c ], [ x, 0, c ],
                [ c, 0, x ] ][Math.floor(h)];
    return [...q.map(v => v + m), alpha ];
  }
  return COLOR_WORDS[s] || [ 0, 0, 0, 1 ];
}
