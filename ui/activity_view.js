// The chosen fish's activity as meters: a settled bar and a reading per activity. The numbers
// follow the bars at a calm pace so they stay readable while the fish moves.
import {formatNumber, t, tList, percent} from './strings.js';
export const activity_viewState = {};

const TEXT_MS = 500;

function reading(row) {
  return row.key === 'speed'  ? t('units.pxPerStep', {n : formatNumber(row.amount, 2, true)})
         : row.key === 'turn' ? t('units.degPerStep', {n : formatNumber(row.amount, 1, true)})
                              : percent(row.amount);
}

export function renderActivity(box, rows, now) {
  if (box.activityRows?.length !== rows.length) {
    const names = tList('activity_view.names'), hints = tList('activity_view.hints');
    box.replaceChildren();
    box.activityRows = rows.map((row, i) => {
      const line = document.createElement('div'), label = document.createElement('span'),
            track = document.createElement('span'), fill = document.createElement('i'),
            value = document.createElement('output');
      line.className = 'activity-row';
      track.className = 'activity-track';
      label.textContent = names[i];
      line.title = hints[i];
      track.append(fill);
      line.append(label, track, value);
      box.append(line);
      return {fill, value};
    });
    box.activityTextTime = -Infinity;
  }
  const text = now - box.activityTextTime >= TEXT_MS;
  if (text)
    box.activityTextTime = now;
  rows.forEach((row, i) => {
    const parts = box.activityRows[i];
    parts.fill.style.width = (100 * row.share).toFixed(1) + '%';
    if (text)
      parts.value.textContent = reading(row);
  });
}
