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

// The colours a cell type answers, on the colour wheel: hue runs round the ring from the top, the
// cell's answer to each hue reaches out from the dashed zero circle when the light excites it and
// in toward the centre where its opposite colour inhibits it. The handles sit where they act: the
// square at the tuned hue, the circle on the curve's flank for its width, the inner one at the
// opposite hue for the opponent, the coloured one outside the ring for the test light. The centre
// holds what the caller puts there (the eye's contrast).
const SPECTRUM = Object.freeze({
  size : 280,
  centre : 140,
  zero : 64,
  scale : 40,
  ring : 116,
  band : 10,
  segments : 36,
  handle : 7,
  marker : 7,
  light : 130,
  samples : 90
});
export const SPECTRUM_CENTRE = SPECTRUM.centre;
const TURN = 2 * Math.PI;
const angleOf = hue => hue / HUE_CIRCLE * TURN - Math.PI / 2;
const reachOf = level => SPECTRUM.zero + SPECTRUM.scale * clamp(level, -1);
const polar = (hue, radius) => ({
  x : SPECTRUM.centre + radius * Math.cos(angleOf(hue)),
  y : SPECTRUM.centre + radius * Math.sin(angleOf(hue))
});
const xy = p => rounded(p.x) + ' ' + rounded(p.y);
// Where a hue and an answer to it lie in the picture, in its own units.
export const huePoint = (hue, level) => polar(hue, reachOf(level));

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
    Math.round(((hue % HUE_CIRCLE + HUE_CIRCLE) % HUE_CIRCLE) / HUE_CIRCLE * values.length) %
    values.length;
const opposite = tuning => tuningHue(tuning.q1) + HUE_CIRCLE / 2;

// The change a handle makes, from the pointer `p` in the picture's units.
export function spectrumPatch(tuning, handle, p, light = null) {
  const S = SPECTRUM, dx = p.x - S.centre, dy = p.y - S.centre;
  const hue = ((Math.atan2(dy, dx) + Math.PI / 2) / TURN * HUE_CIRCLE + HUE_CIRCLE) % HUE_CIRCLE;
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
    const level = (Math.hypot(dx, dy) - S.zero) / S.scale;
    return {q2 : planOfUnit((light.excitation[index] - level * peak) / inhibition)};
  }
  return {q1 : hueQuality(hue)};
}

// The answers round the wheel, the first again at the end so the curve closes.
const around = values => [...values, values[0]]
                             .map((v, k) => xy(polar(HUE_CIRCLE * k / values.length, reachOf(v))))
                             .join(' L');
const zeroBack = count =>
    Array
        .from({length : count + 1},
              (_, k) => xy(polar(HUE_CIRCLE * (count - k) / count, SPECTRUM.zero)))
        .join(' L');
const area = values => 'M' + around(values) + ' L' + zeroBack(values.length) + 'Z';

// The tuning of a cell type as its curve round the wheel.
const tuningCurve = tuning => Array.from(
    {length : SPECTRUM.samples},
    (_, k) => tuningAffinity(hueOffset(HUE_CIRCLE * k / SPECTRUM.samples, tuningHue(tuning.q1)),
                             tuning.qwidth));
// `light` is the design run's answer, `testHue` the test light; `areaTitles` names the exciting
// and the inhibiting answer in their tooltips; `middle` is drawn in the centre of the wheel;
// `others` are the other cell types, drawn faintly with a dot at their peak that chooses them
// ({tuning, choose : attributes, colour, name}).
export function spectrumElement(tuning, target, label, {
  light = null,
  testHue = null,
  areaTitles = {
    excite : '',
    inhibit : ''
  },
  middle = '',
  others = []
} = {}) {
  const S = SPECTRUM, centre = tuningHue(tuning.q1), sigma = tuningSigma(tuning.qwidth);
  const gauss = tuningCurve(tuning);
  const attributes =
      Object.entries(target).map(([ key, value ]) => ` data-${key}="${idSafe(value)}"`).join('');
  const step = HUE_CIRCLE / S.segments;
  const ring = Array
                   .from({length : S.segments},
                         (_, k) => {
                           const from = polar(k * step, S.ring), to = polar((k + 1) * step, S.ring);
                           return `<path d="M${xy(from)} A${S.ring} ${S.ring} 0 0 1 ${
                               xy(to)}" stroke="${lightColor((k + .5) * step)}"/>`;
                         })
                   .join('');
  const values = balance(tuning, light);
  const titled = text => text ? `<title>${escapeText(text)}</title>` : '';
  let html = `<svg class="aid-spectrum-editor" viewBox="0 0 ${S.size} ${S.size}"${
                 attributes} role="img" aria-label="${label}"><g class="aid-spectrum-ring" ` +
             `stroke-width="${S.band}">${ring}</g>`;
  // Each answer is a filled band with its edge drawn apart, so the band's seam at the top stays
  // unseen.
  const band = (cls, part, title) =>
      `<path class="${cls}" d="${area(part)}">${titled(title)}</path>` +
      `<path class="${cls} edge" d="M${around(part)}"/>`;
  if (values)
    html += band('aid-spectrum-excite', values.map(v => Math.max(0, v)), areaTitles.excite) +
            band('aid-spectrum-inhibit', values.map(v => Math.min(0, v)), areaTitles.inhibit);
  html +=
      others
          .map(o => {
            const at = polar(tuningHue(o.tuning.q1), reachOf(1));
            return `<g class="aid-spectrum-other" ${o.choose}><title>${
                       escapeText(o.name)}</title><path d="M${around(tuningCurve(o.tuning))}"/>` +
                   `<circle cx="${rounded(at.x)}" cy="${rounded(at.y)}" r="${
                       S.marker}" style="fill:${o.colour}"/></g>`;
          })
          .join('');
  html += `<circle class="aid-spectrum-zero" cx="${S.centre}" cy="${S.centre}" r="${S.zero}"/>` +
          `<path class="aid-spectrum-tuning" d="M${around(gauss)}"/>`;
  if (Number.isFinite(testHue)) {
    const tip = values ? polar(testHue, reachOf(values[sampleIndex(values, testHue)]))
                       : polar(testHue, S.zero),
          at = polar(testHue, S.light);
    html += `<path class="aid-spectrum-test" d="M${xy(polar(testHue, S.ring - S.band / 2))} L${
        xy(tip)}"/><circle class="aid-spectrum-handle light" data-spectrum-handle="light" cx="${
        rounded(
            at.x)}" cy="${rounded(at.y)}" r="${S.marker}" style="fill:${lightColor(testHue)}"/>`;
  }
  if (values) {
    const hue = opposite(tuning),
          at = polar(hue, reachOf(Math.min(0, values[sampleIndex(values, hue)])));
    html += `<circle class="aid-spectrum-handle opponent" data-spectrum-handle="opponent" cx="${
        rounded(at.x)}" cy="${rounded(at.y)}" r="${S.handle}"/>`;
  }
  const peak = polar(centre, reachOf(1)),
        flank = polar(centre + sigma, reachOf(tuningAffinity(sigma, tuning.qwidth)));
  return html + middle +
         `<rect class="aid-spectrum-handle centre" data-spectrum-handle="centre" x="${
             rounded(peak.x - S.handle)}" y="${rounded(peak.y - S.handle)}" width="${
             2 * S.handle}" height="${2 * S.handle}" rx="2"/>` +
         `<circle class="aid-spectrum-handle width" data-spectrum-handle="width" cx="${
             rounded(flank.x)}" cy="${rounded(flank.y)}" r="${S.handle}"/></svg>`;
}

export const spectrumValues =
    (tuning, opponent = false) => [t('units.degrees', {n : formatNumber(tuningHue(tuning.q1))}),
                                   percent(tuning.qwidth),
                                   ...(opponent ? [ percent(unitOfPlan(tuning.q2)) ] : [])];
