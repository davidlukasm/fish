// Shared material-wheel math for glands, receptors and hormone overlays.
// Scale and material count are supplied by the compiled Engine's "atelier sites" contract.
export function substanceAffinity(q1, q2, width, index, capabilities) {
  const total = capabilities?.bloodSubstances;
  const min = capabilities?.hormoneSigmaMin, max = capabilities?.hormoneSigmaMax;
  if (!Number.isInteger(total) || total <= 0 || !(min > 0) || !(max > min))
    return 0;
  const angle = 2 * Math.PI * index / total;
  const sigma = min + (max - min) * Math.max(0, Math.min(1, width));
  const dx = q1 - Math.cos(angle), dy = q2 - Math.sin(angle);
  return Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
}
export function receptorAffinity(receptor, index, capabilities) {
  const total = capabilities?.bloodSubstances;
  if (!total)
    return 0;
  const center = 2 * Math.PI * receptor.substance / total;
  return substanceAffinity(Math.cos(center), Math.sin(center), receptor.width, index,
                           capabilities);
}
