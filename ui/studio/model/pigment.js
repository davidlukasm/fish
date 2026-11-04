import {ATELIER_LIMITS, TUNING} from '../../schema.js';

// The same hue kernel and absorption conversion used by the Engine's pigment effectors.
export function pigmentAbsorption(center) {
  const hue = (center.q1 + 1) * TUNING.hue_half_circle;
  const width = Math.max(0, Math.min(1, center.qwidth));
  const floor = Math.pow(width, TUNING.wide_power);
  const sigma = TUNING.sigma_min + TUNING.sigma_span * width * width;
  const weights = Array.from({length : 3}, (_, channel) => {
    const delta = ((hue - TUNING.channel_hue * channel + 540) % 360) - 180;
    return floor + (1 - floor) * Math.exp(-delta * delta / (2 * sigma * sigma));
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map(weight => center.copies / ATELIER_LIMITS.max_copies * weight / total);
}

export function absorptionColour(absorption, pigmentHalf) {
  if (!Number.isFinite(pigmentHalf) || pigmentHalf <= 0)
    return '#365b5b';
  const total = absorption.reduce((sum, value) => sum + value, 0);
  return 'rgb(' +
         absorption.map(value => Math.round(255 * (1 - value / (total + pigmentHalf)))).join(' ') +
         ')';
}

export function pigmentColours(center, report, pigmentHalf) {
  const local = pigmentAbsorption(center);
  const resting = Array.isArray(report?.restingAbsorption) ? report.restingAbsorption : local;
  return [
    absorptionColour(resting, pigmentHalf),
    absorptionColour(resting.map((value, i) => value + local[i]), pigmentHalf)
  ];
}

export function fishBodyColour(doc, report, pigmentHalf) {
  if (Array.isArray(report?.restingAbsorption) && report.restingAbsorption.length === 3)
    return absorptionColour(report.restingAbsorption, pigmentHalf);
  const pigments =
      doc.organs.filter(organ => organ.type === 'pigment').flatMap(organ => organ.centers);
  if (!pigments.length)
    return '#365b5b';
  const sum = [ 0, 0, 0 ];
  for (const center of pigments) {
    const absorption = pigmentAbsorption(center);
    for (let i = 0; i < 3; ++i)
      sum[i] += absorption[i];
  }
  return absorptionColour(sum, pigmentHalf);
}
