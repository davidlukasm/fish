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
import {escapeText, idSafe, rounded} from './markup.js';

const SPECTRUM_COLOUR = Object.freeze({saturation : 85, lightness : 55});
export const profileColor = p =>
    typeColour(tuningHue(p.q1), hueAffinities(tuningHue(p.q1), p.qwidth));
export const profileName = p => tList('organ_graphics.hues')[typeNameIndex(
    tuningHue(p.q1), hueAffinities(tuningHue(p.q1), p.qwidth))];
export const lightColor = hue =>
    `hsl(${Number(hue.toFixed(1))} ${SPECTRUM_COLOUR.saturation}% ${SPECTRUM_COLOUR.lightness}%)`;

// The colours a cell type answers, as a strip: hue runs from left to right (the coloured band
// below), the answer rises above the zero line where the light excites the cells and falls below it
// where the opposite colour inhibits them. The handles sit where they act: the square at the tuned
// hue, the circle on the curve's flank for its width, the one at the opposite hue
// for the opponent, the diamond on the band for the test light. The other cell types of the eye
// show as dashed curves with a dot at their peak that chooses them.
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
  dot : 6,
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
    ZERO - SPECTRUM.excite * Math.max(-SPECTRUM.inhibit / SPECTRUM.excite, Math.min(1, level));
// Where a hue and an answer to it lie in the picture, in its own units.
export const huePoint = (hue, level) => ({x : hueX(hue), y : levelY(level)});

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
    Math.round((hueX(hue) - SPECTRUM.left) / PLOT * values.length) % values.length;
const opposite = tuning => tuningHue(tuning.q1) + HUE_CIRCLE / 2;

// The change a handle makes, from the pointer `p` in the picture's units.
export function spectrumPatch(tuning, handle, p, light = null) {
  const hue = clamp((p.x - SPECTRUM.left) / PLOT) * HUE_CIRCLE;
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
    const level = (ZERO - p.y) / SPECTRUM.excite;
    return {q2 : planOfUnit((light.excitation[index] - level * peak) / inhibition)};
  }
  return {q1 : hueQuality(hue)};
}

const line = values => [...values, values[0]]
                           .map((v, k) => rounded(SPECTRUM.left + PLOT * k / values.length) + ' ' +
                                          rounded(levelY(v)))
                           .join(' L');
const area = values => `M${SPECTRUM.left} ${ZERO} L${line(values)} L${SPECTRUM.width} ${ZERO} Z`;
// The tuning of a cell type as its curve along the strip.
const tuningCurve = tuning => Array.from(
    {length : SPECTRUM.samples},
    (_, k) => tuningAffinity(hueOffset(HUE_CIRCLE * k / SPECTRUM.samples, tuningHue(tuning.q1)),
                             tuning.qwidth));
// `light` is the design run's answer, `testHue` the test light; `axis` names the upper and the
// lower half beside the axis; `others` are the other cell types ({tuning, choose : attributes,
// colour, name}).
export function spectrumElement(tuning, target, label, {
  light = null,
  testHue = null,
  colourTuning = true,
  axis = {
    excite : '',
    inhibit : ''
  },
  others = []
} = {}) {
  const S = SPECTRUM, centre = tuningHue(tuning.q1), sigma = tuningSigma(tuning.qwidth);
  const id = Object.values(target).map(idSafe).join('-');
  const attributes =
      Object.entries(target).map(([ key, value ]) => ` data-${key}="${idSafe(value)}"`).join('');
  const stops = Array
                    .from({length : HUE_STOPS + 1},
                          (_, k) => `<stop offset="${rounded(k / HUE_STOPS)}" stop-color="${
                              lightColor(HUE_CIRCLE * k / HUE_STOPS)}"/>`)
                    .join('');
  const values = balance(tuning, light);
  const word = (text, from, to) =>
      `<text class="aid-spectrum-axis" transform="translate(${S.axis} ${
          rounded((from + to) / 2)}) rotate(-90)" text-anchor="middle">${escapeText(text)}</text>`;
  const titled = text => text ? `<title>${escapeText(text)}</title>` : '';
  const tuningHandle = key =>
      colourTuning ? `data-spectrum-handle="${key}"` : 'aria-disabled="true"';
  let html =
      `<svg class="aid-spectrum-editor" viewBox="0 0 ${S.width} ${HEIGHT}"${
          attributes} role="img" aria-label="${label}"><defs><linearGradient id="aid-hue-${id}">${
          stops}</linearGradient></defs><rect class="aid-spectrum-strip" x="${S.left}" y="${
          STRIP}" width="${PLOT}" height="${S.strip}" fill="url(#aid-hue-${id})"/>` +
      `<line class="aid-spectrum-axis-line" x1="${S.left - 2}" y1="${S.top}" x2="${
          S.left - 2}" y2="${ZERO + S.inhibit}"/>` +
      word(axis.excite, S.top, ZERO) + word(axis.inhibit, ZERO, ZERO + S.inhibit);
  if (values)
    html += `<path class="aid-spectrum-excite" d="${area(values.map(v => Math.max(0, v)))}">${
                titled(axis.excite)}</path>` +
            `<path class="aid-spectrum-inhibit" d="${area(values.map(v => Math.min(0, v)))}">${
                titled(axis.inhibit)}</path>`;
  html += others
              .map(o => {
                const at = huePoint(tuningHue(o.tuning.q1), 1);
                return `<g class="aid-spectrum-other" ${o.choose}><title>${
                           escapeText(o.name)}</title><path d="M${line(tuningCurve(o.tuning))}"/>` +
                       `<circle cx="${rounded(at.x)}" cy="${rounded(at.y)}" r="${
                           S.dot}" style="fill:${o.colour}"/></g>`;
              })
              .join('');
  html +=
      `<line class="aid-spectrum-zero" x1="${S.left}" y1="${ZERO}" x2="${S.width}" y2="${ZERO}"/>` +
      `<path class="aid-spectrum-tuning" d="M${line(tuningCurve(tuning))}"/>`;
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
    html += `<circle class="aid-spectrum-handle opponent" ${tuningHandle('opponent')} cx="${
        rounded(hueX(
            hue))}" cy="${rounded(levelY(values[sampleIndex(values, hue)]))}" r="${S.handle}"/>`;
  }
  return html +
         `<rect class="aid-spectrum-handle centre" ${tuningHandle('centre')} x="${
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
