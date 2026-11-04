import {PERCENT} from '../../units.js';
import {
  HUE_CIRCLE,
  hueOffset,
  hueQuality,
  tuningAffinity,
  tuningHue,
  tuningSigma,
  tuningWidth
} from '../../tuning.js';

// One element for every colour preference (light cells, pigment cells): the hue circle along the
// bottom, above it the tuning curve, a Gaussian around the centre hue as the engine derives the
// cell's colour channels from it. A handle on its peak moves the centre, one a sigma away sets
// the width. Curves the engine computed from the tuning may lie underneath.
const SPECTRUM = Object.freeze({
  width : 360,
  height : 120,
  strip : 14,
  top : 12,
  handle : 7,
  samples : 90,
  saturation : 85,
  lightness : 55
});
const HUE_STOPS = 12;
const plotHeight = () => SPECTRUM.height - SPECTRUM.strip - SPECTRUM.top;
const baseline = () => SPECTRUM.top + plotHeight();
const hueX = hue => ((hue % HUE_CIRCLE + HUE_CIRCLE) % HUE_CIRCLE) * SPECTRUM.width / HUE_CIRCLE;
const levelY = level => baseline() - plotHeight() * level;
const n = value => Number(value.toFixed(1));
const safe = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '');

// A pointer at this fraction of the element as a change of the tuning: the centre hue, or the
// width whose sigma is the pointer's distance from the centre around the hue circle.
export function spectrumPatch(tuning, handle, fraction) {
  const hue = Math.max(0, Math.min(1, fraction)) * HUE_CIRCLE;
  if (handle === 'width')
    return {qwidth : tuningWidth(Math.abs(hueOffset(hue, tuningHue(tuning.q1))))};
  return {q1 : hueQuality(hue)};
}

// Values sampled evenly around the hue circle as a line, closed back to the first hue.
const line =
    values => [...values, values[0]]
                  .map((v, k) => n(SPECTRUM.width * k / values.length) + ' ' + n(levelY(v)))
                  .join(' L');

// Curves from the engine: the first filled, the others dashed.
function responses(curves) {
  return (curves ?? [])
      .map((values, k) => k ? `<path class="aid-spectrum-response dim" d="M${line(values)}"/>`
                            : `<path class="aid-spectrum-response" d="M0 ${n(baseline())} L${
                                  line(values)} L${SPECTRUM.width} ${n(baseline())} Z"/>`)
      .join('');
}

// tuning: {q1, qwidth}; target: the data attributes naming what the element tunes.
export function spectrumElement(tuning, target, label, curves = null) {
  const S = SPECTRUM, centre = tuningHue(tuning.q1), sigma = tuningSigma(tuning.qwidth);
  const gauss = Array.from(
      {length : S.samples},
      (_, k) => tuningAffinity(hueOffset(HUE_CIRCLE * k / S.samples, centre), tuning.qwidth));
  const id = Object.values(target).map(safe).join('-');
  const attributes =
      Object.entries(target).map(([ key, value ]) => ` data-${key}="${safe(value)}"`).join('');
  const stops = Array
                    .from({length : HUE_STOPS + 1},
                          (_, k) => `<stop offset="${n(k / HUE_STOPS)}" stop-color="hsl(${
                              n(HUE_CIRCLE * k / HUE_STOPS)} ${S.saturation}% ${S.lightness}%)"/>`)
                    .join('');
  return `<svg class="aid-spectrum-editor" viewBox="0 0 ${S.width} ${S.height}"${
             attributes} role="img" aria-label="${label}"><defs><linearGradient id="aid-hue-${
             id}">${stops}</linearGradient></defs><rect class="aid-spectrum-strip" x="0" y="${
             S.height - S.strip}" width="${S.width}" height="${S.strip}" fill="url(#aid-hue-${
             id})"/>${responses(curves)}<path class="aid-spectrum-tuning" d="M${line(gauss)}"/>` +
         `<circle class="aid-spectrum-handle" data-spectrum-handle="centre" cx="${
             n(hueX(centre))}" cy="${n(levelY(1))}" r="${S.handle}"/>` +
         `<circle class="aid-spectrum-handle width" data-spectrum-handle="width" cx="${
             n(hueX(centre + sigma))}" cy="${n(levelY(tuningAffinity(sigma, tuning.qwidth)))}" r="${
             S.handle}"/></svg>`;
}

// The centre hue and width as the inspector writes them.
export const spectrumValues = tuning =>
    `${Math.round(tuningHue(tuning.q1))}° · ${Math.round(tuning.qwidth * PERCENT)}%`;
