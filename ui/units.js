// Shared units of the interface: angles and colour channels.
export const DEGREE = Math.PI / 180;
export const radians = degrees => degrees * DEGREE;
export const degrees = angle => angle / DEGREE;
// Colour channels run from 0 to CHANNEL_MAX in bytes and in hex notation.
export const CHANNEL_MAX = 255;
const HEX = 16, HEX_DIGITS = 2, SHORT_HEX = 4;
// A colour from '#rgb', '#rgba', '#rrggbb' or '#rrggbbaa', as channels from 0 to 1.
export function hexColor(text) {
  const hex = String(text).trim().replace(/^#/, ''),
        full = hex.length <= SHORT_HEX ? [...hex ].map(c => c + c).join('') : hex, channels = [];
  for (let i = 0; i < full.length; i += HEX_DIGITS)
    channels.push(parseInt(full.slice(i, i + HEX_DIGITS), HEX) / CHANNEL_MAX);
  return channels;
}
