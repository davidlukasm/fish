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
import {planOfUnit, unitOfPlan} from '../model/retina.js';

// Light colours as the hue circle shows them: hsl at their hue.
const SPECTRUM_COLOUR = Object.freeze({saturation : 85, lightness : 55});
// A colour type's colour; white for one that answers every colour alike.
const PROFILE = Object.freeze({white : .95, saturation : 72, lightness : 68, plain : '#e8eed8'});
export const profileColor = p =>
    p.qwidth > PROFILE.white
        ? PROFILE.plain
        : `hsl(${tuningHue(p.q1)} ${PROFILE.saturation}% ${PROFILE.lightness}%)`;
// The test light's colour on the scene, as on the hue circle of the colour view.
export const lightColor = hue =>
    `hsl(${Number(hue.toFixed(1))} ${SPECTRUM_COLOUR.saturation}% ${SPECTRUM_COLOUR.lightness}%)`;

// One element for every colour preference (light cells, pigment cells), drawn over the hue
// circle along its bottom:
// - the tuning, a Gaussian around the centre hue as the engine derives the cell's colour channels
//   from it; a handle on its peak moves the centre, one a sigma away sets the width;
// - for light cells the engine's balance of a full light of every hue: above the line the colours
//   that excite the cell, below it those that inhibit it (the opponent colour). A handle at the
//   hue opposite the centre pulls the inhibition down;
// - the test light's hue as a marker on the hue circle, to be moved along it.
const SPECTRUM = Object.freeze({
  width : 360,
  top : 12,
  excite : 70,
  inhibit : 30,
  gap : 6,
  strip : 14,
  handle : 7,
  marker : 8,
  samples : 90
});
const HUE_STOPS = 12;
const ZERO = SPECTRUM.top + SPECTRUM.excite;
const STRIP = ZERO + SPECTRUM.inhibit + SPECTRUM.gap;
const HEIGHT = STRIP + SPECTRUM.strip;
const hueX = hue => ((hue % HUE_CIRCLE + HUE_CIRCLE) % HUE_CIRCLE) * SPECTRUM.width / HUE_CIRCLE;
// A level relative to the peak excitation: 1 at the top, 0 on the line, negative below it.
const levelY = level =>
    ZERO - SPECTRUM.excite * Math.max(-SPECTRUM.inhibit / SPECTRUM.excite, level);
const n = value => Number(value.toFixed(1));
const safe = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '');

// The engine's balance at the cell's opponency (the tuning's q2), relative to its peak
// excitation; null without engine curves.
function balance(tuning, light) {
  if (!light?.excitation?.length)
    return null;
  const peak = Math.max(...light.excitation);
  if (!(peak > 0))
    return null;
  const opponency = unitOfPlan(tuning.q2);
  return light.excitation.map((e, k) => (e - opponency * light.inhibition[k]) / peak);
}
const sampleIndex = (values, hue) =>
    Math.round(hueX(hue) / SPECTRUM.width * values.length) % values.length;
const opposite = tuning => tuningHue(tuning.q1) + HUE_CIRCLE / 2;

// A pointer at (fx, fy), fractions of the element, as a change: of the tuning (centre, width, the
// opponency through q2), or of the test light's hue. Null when it changes nothing.
export function spectrumPatch(tuning, handle, fx, fy, light = null) {
  const hue = Math.max(0, Math.min(1, fx)) * HUE_CIRCLE;
  if (handle === 'width')
    return {qwidth : tuningWidth(Math.abs(hueOffset(hue, tuningHue(tuning.q1))))};
  if (handle === 'light')
    return {hue};
  if (handle === 'opponent') {
    if (!light?.excitation?.length)
      return null;
    const peak = Math.max(...light.excitation),
          index = sampleIndex(light.excitation, opposite(tuning));
    const inhibition = light.inhibition[index];
    if (!(peak > 0) || !(inhibition > 0))
      return null;
    const level = (ZERO - Math.max(0, Math.min(1, fy)) * HEIGHT) / SPECTRUM.excite;
    return {q2 : planOfUnit((light.excitation[index] - level * peak) / inhibition)};
  }
  return {q1 : hueQuality(hue)};
}

// Values sampled evenly around the hue circle as a line, closed back to the first hue.
const line =
    values => [...values, values[0]]
                  .map((v, k) => n(SPECTRUM.width * k / values.length) + ' ' + n(levelY(v)))
                  .join(' L');
const area = values => `M0 ${ZERO} L${line(values)} L${SPECTRUM.width} ${ZERO} Z`;

// tuning: {q1, qwidth, q2}; target: the data attributes naming what the element tunes; light:
// the engine's curves of a light cell; testHue: the test light's hue.
export function spectrumElement(tuning, target, label, light = null, testHue = null) {
  const S = SPECTRUM, centre = tuningHue(tuning.q1), sigma = tuningSigma(tuning.qwidth);
  const gauss = Array.from(
      {length : S.samples},
      (_, k) => tuningAffinity(hueOffset(HUE_CIRCLE * k / S.samples, centre), tuning.qwidth));
  const id = Object.values(target).map(safe).join('-');
  const attributes =
      Object.entries(target).map(([ key, value ]) => ` data-${key}="${safe(value)}"`).join('');
  const stops =
      Array
          .from({length : HUE_STOPS + 1},
                (_, k) => `<stop offset="${n(k / HUE_STOPS)}" stop-color="hsl(${
                    n(HUE_CIRCLE * k /
                      HUE_STOPS)} ${SPECTRUM_COLOUR.saturation}% ${SPECTRUM_COLOUR.lightness}%)"/>`)
          .join('');
  const values = balance(tuning, light);
  let html = `<svg class="aid-spectrum-editor" viewBox="0 0 ${S.width} ${HEIGHT}"${
      attributes} role="img" aria-label="${label}"><defs><linearGradient id="aid-hue-${id}">${
      stops}</linearGradient></defs><rect class="aid-spectrum-strip" x="0" y="${STRIP}" width="${
      S.width}" height="${S.strip}" fill="url(#aid-hue-${id})"/>`;
  if (values)
    html += `<path class="aid-spectrum-excite" d="${area(values.map(v => Math.max(0, v)))}"/>` +
            `<path class="aid-spectrum-inhibit" d="${area(values.map(v => Math.min(0, v)))}"/>`;
  html += `<line class="aid-spectrum-zero" x1="0" y1="${ZERO}" x2="${S.width}" y2="${ZERO}"/>` +
          `<path class="aid-spectrum-tuning" d="M${line(gauss)}"/>`;
  if (Number.isFinite(testHue)) {
    const x = n(hueX(testHue)), y = values ? n(levelY(values[sampleIndex(values, testHue)])) : ZERO;
    html += `<line class="aid-spectrum-test" x1="${x}" y1="${STRIP}" x2="${x}" y2="${y}"/>` +
            `<path class="aid-spectrum-handle light" data-spectrum-handle="light" d="M${x} ${
                STRIP - S.marker / 2} l${S.marker} ${S.marker} l-${S.marker} ${S.marker} l-${
                S.marker} -${S.marker} Z" style="fill:${lightColor(testHue)}"/>`;
  }
  if (values) {
    const hue = opposite(tuning);
    html += `<circle class="aid-spectrum-handle opponent" data-spectrum-handle="opponent" cx="${
        n(hueX(hue))}" cy="${n(levelY(Math.min(0, values[sampleIndex(values, hue)])))}" r="${
        S.handle}"/>`;
  }
  return html +
         `<circle class="aid-spectrum-handle" data-spectrum-handle="centre" cx="${
             n(hueX(centre))}" cy="${n(levelY(1))}" r="${S.handle}"/>` +
         `<circle class="aid-spectrum-handle width" data-spectrum-handle="width" cx="${
             n(hueX(centre + sigma))}" cy="${n(levelY(tuningAffinity(sigma, tuning.qwidth)))}" r="${
             S.handle}"/></svg>`;
}

// The centre hue and width, and for light cells the opponency, as the inspector writes them.
export const spectrumValues = (tuning, opponent = false) =>
    [`${Math.round(tuningHue(tuning.q1))}°`, `${Math.round(tuning.qwidth * PERCENT)}\u00a0%`,
     ...(opponent ? [ `${Math.round(unitOfPlan(tuning.q2) * PERCENT)}\u00a0%` ] : [])];
