// The body plan of a fish or a species: measures, the four build traits as one scale each with a
// word for the reading, and the sense cells by group. The second body (species mean, or the living
// part of a species) shows as a thin mark on the same scales.
import {bodyMeasures, bodySenseGroups, bodyTraitRows} from './body_model.js';
import {brainSenseColors} from './brain_model.js';
import {cssPercent, formatNumber, percent, t} from './strings.js';
export const body_viewState = {};

function node(tag, className, text) {
  const e = document.createElement(tag);
  if (className)
    e.className = className;
  if (text !== undefined)
    e.textContent = text;
  return e;
}

function scale(value, other, color) {
  const track = node('span', 'body-scale'), fill = node('i', 'body-fill');
  if (color)
    fill.style.background = color;
  fill.style.width = cssPercent(value || 0);
  track.append(fill);
  if (other !== null) {
    const mark = node('i', 'body-mark');
    mark.style.left = cssPercent(other);
    track.append(mark);
  }
  return track;
}

export function renderBodyOverview(
    box, body, comparison,
    labels = [ t('body_model.dieserFisch'), t('body_model.mittelSpezies') ]) {
  const signature = JSON.stringify([ body, comparison, labels ]);
  if (box.bodySignature === signature)
    return;
  box.bodySignature = signature;
  const legend = node('p', 'body-legend');
  legend.append(node('span', 'body-own', labels[0]));
  if (comparison)
    legend.append(node('span', 'body-other', labels[1]));
  const measures = node('div', 'body-measures');
  for (const m of bodyMeasures(body, comparison)) {
    if (m.value === null && m.other === null)
      continue;
    const cell = node('div'), value = v => formatNumber(v, m.digits) + (m.unit ? ' ' + m.unit : '');
    cell.append(node('small', '', m.name),
                node('strong', '', m.value === null ? '–' : value(m.value)));
    if (m.other !== null)
      cell.title = labels[1] + ' ' + value(m.other);
    measures.append(cell);
  }
  const traits = node('div', 'body-traits');
  for (const row of bodyTraitRows(body, comparison)) {
    const line = node('div', 'body-trait'), head = node('p');
    head.append(node('strong', '', row.name), node('span', 'body-word', row.word));
    line.append(head, scale(row.value, row.other));
    const shown = v => v === null ? t('body_model.unbekannt') : percent(v);
    line.title =
        t(row.other === null ? 'body_model.traitTitle' : 'body_model.traitTitleComparison', {
          name : row.name,
          effect : row.effect,
          low : row.ends[0],
          high : row.ends[1],
          value : shown(row.value),
          label : labels[1],
          other : shown(row.other)
        });
    traits.append(line);
  }
  const senses = bodySenseGroups(body, comparison), sense = node('div', 'body-senses');
  const heading = node('p', 'body-heading', t('body_model.sinneszellen'));
  heading.title = t('body_model.sinneszellenHint');
  sense.append(heading);
  for (const group of senses.groups) {
    const block = node('div', 'body-sense-group');
    for (const row of group.rows) {
      const line = node('div', 'body-sense'), color = brainSenseColors[row.color];
      line.append(node('span', '', row.name),
                  scale(row.value === null ? 0 : row.value / senses.largest,
                        row.other === null ? null : row.other / senses.largest, color),
                  node('output', '', row.value === null ? '–' : formatNumber(row.value, 1)));
      line.title = row.name + ': ' +
                   (row.value === null ? t('body_model.unbekannt') : formatNumber(row.value, 1)) +
                   (row.other === null ? '' : ' · ' + labels[1] + ' ' + formatNumber(row.other, 1));
      block.append(line);
    }
    sense.append(block);
  }
  box.replaceChildren(legend, measures, traits, sense);
}
