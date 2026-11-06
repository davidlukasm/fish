import {clamp} from '../../units.js';
import {formatNumber, percent, t, tList} from '../../strings.js';
import {
  HUE_CIRCLE,
  hueAffinities,
  hueOffset,
  hueQuality,
  planOfUnit,
  tuningAffinity,
  tuningHue,
  tuningSigma,
  tuningWidth,
  typeColour,
  typeNameIndex,
  unitOfPlan
} from '../../tuning.js';
import {idSafe, rounded} from './markup.js';

const SPECTRUM_COLOUR = Object.freeze({saturation : 85, lightness : 55});
export const profileColor = p =>
    typeColour(tuningHue(p.q1), hueAffinities(tuningHue(p.q1), p.qwidth));
export const profileName = p => tList('organ_graphics.hues')[typeNameIndex(
    tuningHue(p.q1), hueAffinities(tuningHue(p.q1), p.qwidth))];
export const lightColor = hue =>
    `hsl(${Number(hue.toFixed(1))} ${SPECTRUM_COLOUR.saturation}% ${SPECTRUM_COLOUR.lightness}%)`;

const SPECTRUM = Object.freeze({
  width : 360,
  left : 30,
  top : 12,
  excite : 50,
  inhibit : 50,
  gap : 6,
  strip : 14,
  handle : 7,
  marker : 8,
  samples : 90,
  axis : 11
});
const PLOT = SPECTRUM.width - SPECTRUM.left;
const HUE_STOPS = 12;
const ZERO = SPECTRUM.top + SPECTRUM.excite;
const STRIP = ZERO + SPECTRUM.inhibit + SPECTRUM.gap;
const HEIGHT = STRIP + SPECTRUM.strip;
const hueX = hue =>
    SPECTRUM.left + ((hue % HUE_CIRCLE + HUE_CIRCLE) % HUE_CIRCLE) * PLOT / HUE_CIRCLE;
const levelY = level =>
    ZERO - SPECTRUM.excite * Math.max(-SPECTRUM.inhibit / SPECTRUM.excite, level);

function balance(tuning, light) {
  if (!light?.excitation?.length)
    return null;
  const peak = Math.max(...light.excitation);
  if (!(peak > 0))
    return null;
  const opponency = unitOfPlan(tuning.q2);
  return light.excitation.map((e, k) => (e - opponency * light.inhibition[k]) / peak);
}
export const hueFraction = hue => hueX(hue) / SPECTRUM.width;
const sampleIndex = (values, hue) =>
    Math.round((hueX(hue) - SPECTRUM.left) / PLOT * values.length) % values.length;
const opposite = tuning => tuningHue(tuning.q1) + HUE_CIRCLE / 2;

export function spectrumPatch(tuning, handle, fx, fy, light = null) {
  const hue = clamp((fx * SPECTRUM.width - SPECTRUM.left) / PLOT) * HUE_CIRCLE;
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
    const level = (ZERO - clamp(fy) * HEIGHT) / SPECTRUM.excite;
    return {q2 : planOfUnit((light.excitation[index] - level * peak) / inhibition)};
  }
  return {q1 : hueQuality(hue)};
}

const line = values => [...values, values[0]]
                           .map((v, k) => rounded(SPECTRUM.left + PLOT * k / values.length) + ' ' +
                                          rounded(levelY(v)))
                           .join(' L');
const area = values => `M${SPECTRUM.left} ${ZERO} L${line(values)} L${SPECTRUM.width} ${ZERO} Z`;

export function spectrumElement(tuning, target, label, light = null, testHue = null, axisWords = {
  excite : '',
  inhibit : ''
}) {
  const S = SPECTRUM, centre = tuningHue(tuning.q1), sigma = tuningSigma(tuning.qwidth);
  const gauss = Array.from(
      {length : S.samples},
      (_, k) => tuningAffinity(hueOffset(HUE_CIRCLE * k / S.samples, centre), tuning.qwidth));
  const id = Object.values(target).map(idSafe).join('-');
  const attributes =
      Object.entries(target).map(([ key, value ]) => ` data-${key}="${idSafe(value)}"`).join('');
  const stops = Array
                    .from({length : HUE_STOPS + 1},
                          (_, k) => `<stop offset="${rounded(k / HUE_STOPS)}" stop-color="hsl(${
                              rounded(HUE_CIRCLE * k / HUE_STOPS)} ${SPECTRUM_COLOUR.saturation}% ${
                              SPECTRUM_COLOUR.lightness}%)"/>`)
                    .join('');
  const values = balance(tuning, light);
  const word = (text, from, to) => `<text class="aid-spectrum-axis" transform="translate(${
      S.axis} ${rounded((from + to) / 2)}) rotate(-90)" text-anchor="middle">${text}</text>`;
  let html =
      `<svg class="aid-spectrum-editor" viewBox="0 0 ${S.width} ${HEIGHT}"${
          attributes} role="img" aria-label="${label}"><defs><linearGradient id="aid-hue-${id}">${
          stops}</linearGradient></defs><rect class="aid-spectrum-strip" x="${S.left}" y="${
          STRIP}" width="${PLOT}" height="${S.strip}" fill="url(#aid-hue-${id})"/>` +
      `<line class="aid-spectrum-axis-line" x1="${S.left - 2}" y1="${S.top}" x2="${
          S.left - 2}" y2="${ZERO + S.inhibit}"/>` +
      word(axisWords.excite, S.top, ZERO) + word(axisWords.inhibit, ZERO, ZERO + S.inhibit);
  if (values)
    html += `<path class="aid-spectrum-excite" d="${area(values.map(v => Math.max(0, v)))}"/>` +
            `<path class="aid-spectrum-inhibit" d="${area(values.map(v => Math.min(0, v)))}"/>`;
  html +=
      `<line class="aid-spectrum-zero" x1="${S.left}" y1="${ZERO}" x2="${S.width}" y2="${ZERO}"/>` +
      `<path class="aid-spectrum-tuning" d="M${line(gauss)}"/>`;
  if (Number.isFinite(testHue)) {
    const x = rounded(hueX(testHue)),
          y = values ? rounded(levelY(values[sampleIndex(values, testHue)])) : ZERO;
    html += `<line class="aid-spectrum-test" x1="${x}" y1="${STRIP}" x2="${x}" y2="${y}"/>` +
            `<path class="aid-spectrum-handle light" data-spectrum-handle="light" d="M${x} ${
                STRIP - S.marker / 2} l${S.marker} ${S.marker} l-${S.marker} ${S.marker} l-${
                S.marker} -${S.marker} Z" style="fill:${lightColor(testHue)}"/>`;
  }
  if (values) {
    const hue = opposite(tuning);
    html += `<circle class="aid-spectrum-handle opponent" data-spectrum-handle="opponent" cx="${
        rounded(hueX(hue))}" cy="${
        rounded(levelY(Math.min(0, values[sampleIndex(values, hue)])))}" r="${S.handle}"/>`;
  }
  return html +
         `<rect class="aid-spectrum-handle centre" data-spectrum-handle="centre" x="${
             rounded(hueX(centre) - S.handle)}" y="${rounded(levelY(1) - S.handle)}" width="${
             2 * S.handle}" height="${2 * S.handle}" rx="2"/>` +
         `<circle class="aid-spectrum-handle width" data-spectrum-handle="width" cx="${
             rounded(hueX(centre + sigma))}" cy="${
             rounded(levelY(tuningAffinity(sigma, tuning.qwidth)))}" r="${S.handle}"/></svg>`;
}

export const spectrumValues =
    (tuning, opponent = false) => [t('units.degrees', {n : formatNumber(tuningHue(tuning.q1))}),
                                   percent(tuning.qwidth),
                                   ...(opponent ? [ percent(unitOfPlan(tuning.q2)) ] : [])];
