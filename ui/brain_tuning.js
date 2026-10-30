import {t, formatNumber} from './strings.js';
import {chartContext, chartSize} from './dom.js';
import {brainClamp, brainState} from './brain.js';
import {brainMotorColors, brainSenseColors, dominantCellPart} from './brain_model.js';
import {organNumber, organPercent} from './organ_readout.js';
export const brain_tuningState = {};

export function drawCellTuning(canvas, n, rec, d) {
  const g = chartContext(canvas, () => drawCellTuning(canvas, n, rec, d));
  g.clearRect(0, 0, 360, 144);
  canvas.hidden = !n;
  if (!n)
    return;
  const key = brainState.brainSelectionPart || dominantCellPart(n), sense = key[0] === 's',
        motor = key[0] === 'm', k = Number(key.slice(1)),
        color = sense   ? brainSenseColors[k]
                : motor ? brainMotorColors[k]
                        : '#a7b6d5',
        eff = motor ? d.b.effectors.find(e => e[0] === n[5] &&
                                              e[1] === [ 1, 2, 6, 4, 5, 10, 11, 7, 12, 13 ][k])
                    : null,
        coords = [ n[0], n[1], n[8] ],
        labels =
            [
              t('brain_tuning.linksRechts'), t('brain_tuning.hintenVorne'),
              t('brain_tuning.koerpertiefe')
            ],
        values = coords.map(v => organNumber(v, 2));
  if (sense) {
    labels[0] = k === 1                   ? t('brain_tuning.riechseite')
                : [ 0, 2, 3 ].includes(k) ? t('brain_tuning.reizrichtung')
                                          : t('brain_tuning.organlage');
    values[0] =
        k === 1                   ? (n[0] < 0 ? t('brain_tuning.left') : t('brain_tuning.right'))
        : [ 0, 2, 3 ].includes(k) ? t('units.degrees', {
            n : organNumber((([ 2, 3 ].includes(k) ? rec?.[20] ?? rec?.[2] : rec?.[2]) || 0) * 180 /
                            Math.PI)
          })
                                  : values[0];
    labels[1] = k === 1 ? t('brain_tuning.grundschwelle') : t('brain_tuning.halbeSinnesantwort');
    values[1] =
        rec ? formatNumber(Number(Number(rec[[ 0, 1, 2, 10 ].includes(k) ? 13 : 4]).toPrecision(2)),
                           6)
            : '—';
    if (k === 0) {
      labels[2] = t('brain_tuning.farbvorliebe');
      values[2] = t('units.degrees', {n : organNumber(rec?.[8])});
    } else if (k === 1) {
      labels[2] = t('brain_tuning.duftrichtung');
      values[2] = t('units.degrees', {n : organNumber(180 * ((n[20]?.[2] ?? 0) + 1))});
    } else if (k === 8) {
      labels[2] = t('brain_tuning.organabstimmung');
      values[2] = (rec?.[17] || [ 1, 0, 0 ])
                      .map((v, c) => [t('brain_tuning.darm'), 'Ei', t('brain_tuning.sperma')][c] +
                                     ' ' + organPercent(v))
                      .join(' · ');
    } else if (k === 2) {
      labels[2] = t('brain_tuning.koerperstelle');
      values[2] = n[1] < -.33  ? t('brain_tuning.back')
                  : n[1] > .33 ? t('brain_tuning.front')
                               : t('brain_tuning.middle');
    }
  } else if (motor) {
    labels[0] = [ 1, 6 ].includes(k) ? t('brain_tuning.motorseite') : t('brain_tuning.organlage');
    if ([ 1, 6 ].includes(k))
      values[0] = n[0] < 0 ? t('brain_tuning.left') : t('brain_tuning.right');
    labels[1] = t('brain_tuning.kapazitaet');
    values[1] = eff ? organNumber(eff[3], 2) : '—';
    if ([ 3, 4, 7 ].includes(k)) {
      labels[2] = t('brain_tuning.farbton');
      values[2] = t('units.degrees', {n : organNumber(180 * ((n[20]?.[2] ?? 0) + 1))});
    } else if ([ 0, 2, 5 ].includes(k)) {
      labels[2] = k === 0   ? t('brain_tuning.schlaengeln')
                  : k === 5 ? t('brain_tuning.stumpfeZaehne')
                            : t('brain_tuning.kieferDarm');
      const q = n[20] || [];
      values[2] = k === 2 ? organPercent(brainClamp(((q[3] || 0) + 1) / 2)) + ' / ' +
                                organPercent(brainClamp(((q[2] || 0) + 1) / 2))
                          : organPercent(brainClamp(((q[2] || 0) + 1) / 2));
    }
  }
  g.font = '10px system-ui';
  for (let i = 0; i < 3; i++) {
    const y = 15 + i * 28;
    g.fillStyle = '#b6cdd0';
    g.fillText(labels[i], 8, y);
    g.textAlign = 'right';
    g.fillText(values[i], 350, y);
    g.textAlign = 'left';
    g.fillStyle = '#2c4b57';
    g.fillRect(143, y - 5, 118, 3);
    g.fillStyle = color;
    g.beginPath();
    g.arc(143 + 118 * brainClamp((coords[i] + 1) / 2), y - 3.5, 3.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#708e98';
    g.fillText('xyz'[i], 130, y);
  }
  for (const [i, label, value,
              position] of [[ 0, t('brain_tuning.staerke'), n[11], n[11] / (n[11] + 2) ],
                            [ 1, t('brain_tuning.bias'), n[15], (n[15] + 1) / 2 ], [
                              2,
                              sense && [ 1, 2 ].includes(k) ? t('brain_tuning.adaptation')
                              : motor                       ? t('brain_tuning.erholung')
                                                            : t('brain_tuning.zeitkonstante'),
                              n[16], (n[16] || 0) / 48
                            ]]) {
    const x = 8 + i * 119;
    g.fillStyle = '#afc6cd';
    g.fillText(label, x, 110);
    g.fillStyle = '#2d4b55';
    g.fillRect(x, 119, 105, 4);
    g.fillStyle = (sense && i === 1) || (i === 2 && !(n[16] > 0)) ? '#708e98' : color;
    g.fillRect(x, 119,
               (sense && i === 1) || (i === 2 && !(n[16] > 0)) ? 0 : 105 * brainClamp(position), 4);
    g.fillStyle = '#dbe8e5';
    g.fillText((sense && i === 1) || (i === 2 && !(n[16] > 0)) ? '—'
               : i === 2 ? t('units.steps', {n : organNumber(value, 0)})
                         : organNumber(value, 2),
               x, 141);
  }
  canvas.title = t('brain_tuning.xYUndZ');
}

export function drawCppnOutputs(canvas, n, d) {
  const signature = d.b.layout_id + ':' + (n?.[5] ?? '');
  if (canvas.cppnSignature === signature)
    return;
  canvas.cppnSignature = signature;
  const g = chartContext(canvas, () => {
    canvas.cppnSignature = null;
    drawCppnOutputs(canvas, n, d);
  });
  g.clearRect(0, 0, 360, 270);
  g.font = '10px system-ui';
  const p = n?.[20] || [],
        names =
            [
              t('brain_tuning.positionsfeld'),     t('brain_tuning.zellbildung'),
              t('brain_tuning.identitaet1'),       t('brain_tuning.identitaet2'),
              t('brain_tuning.identitaet3'),       t('brain_tuning.identitaet4'),
              t('brain_tuning.identitaet5'),       t('brain_tuning.ansprechschwelle'),
              t('brain_tuning.dendriten'),         t('brain_tuning.kapazitaet'),
              t('brain_tuning.qualitaet1'),        t('brain_tuning.qualitaet2'),
              t('brain_tuning.qualitativeBreite'), t('brain_tuning.feldbreite'),
              t('brain_tuning.zeitkonstante'),     t('brain_tuning.plastizitaet'),
              t('brain_tuning.sender1'),           t('brain_tuning.sender2'),
              t('brain_tuning.empfaenger1'),       t('brain_tuning.empfaenger2')
            ],
        values = [
          null, null, ...(n?.[17] || [ 0, 0, 0, 0, 0 ]), p[0], p[7], p[1], p[2], p[3], p[4], p[5],
          p[6], p[8], ...(n?.[25] || []), ...(n?.[26] || [])
        ];
  for (let i = 0; i < names.length; i++) {
    const y = 10 + i * 11;
    g.fillStyle = '#789ba8';
    g.fillText(String(i), 7, y);
    g.fillStyle = '#bdd1d2';
    g.fillText(names[i], 27, y);
    const v = values[i];
    if (i < 2) {
      g.fillStyle = '#a3b5ce';
      g.fillText(i === 0 ? t('brain_tuning.zellposition') : t('brain_tuning.zellenBilden'), 180, y);
      continue;
    }
    g.fillStyle = '#294653';
    g.fillRect(180, y - 5, 95, 3);
    if (Number.isFinite(v)) {
      const f = i >= 2 && i <= 6 || i === 10 || i === 11 || i >= 16 ? (v + 1) / 2
                : i === 9                                           ? v / 2
                                                                    : v;
      g.fillStyle = '#d7bd89';
      g.beginPath();
      g.arc(180 + 95 * brainClamp(f), y - 3.5, 2, 0, Math.PI * 2);
      g.fill();
      g.textAlign = 'right';
      g.fillText(organNumber(v, 3), 350, y);
      g.textAlign = 'left';
    }
  }
  for (const [i, label] of [t('brain_tuning.sinnNerv'), t('brain_tuning.nervNerv'),
                            t('brain_tuning.nervEffektor')]
           .entries()) {
    const y = 232 + 12 * i;
    g.fillStyle = '#789ba8';
    g.fillText((20 + 2 * i) + '/' + (21 + 2 * i), 7, y);
    g.fillStyle = '#bdd1d2';
    g.fillText(label, 53, y);
    g.fillStyle = '#a3b5ce';
    g.fillText(t('brain_tuning.staerkeAusdruck'), 180, y);
  }
  canvas.title = t('brain_tuning.dasPositionsfeldVerschiebtDie');
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
