import {t, tList, formatNumber} from './strings.js';
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
    labels[0] = k === 1                         ? t('brain_tuning.riechseite')
                : [ 0, 2, 3, 4, 6 ].includes(k) ? t('brain_tuning.reizrichtung')
                                                : t('brain_tuning.organlage');
    values[0] =
        k === 1 ? (n[0] < 0 ? t('brain_tuning.left') : t('brain_tuning.right'))
        : [ 0, 2, 3, 4, 6 ].includes(k) ? t('units.degrees', {
            n : organNumber((([ 2, 3 ].includes(k) ? rec?.[20] ?? rec?.[2] : rec?.[2]) || 0) * 180 /
                            Math.PI)
          })
                                        : values[0];
    labels[1] = k === 1 ? t('brain_tuning.grundschwelle') : t('brain_tuning.halbeSinnesantwort');
    values[1] =
        rec ? formatNumber(
                  Number(Number(rec[[ 0, 1, 2, 5, 6, 10 ].includes(k) ? 13 : 4]).toPrecision(2)), 6)
            : '—';
    if (k === 0 || k === 4) {
      labels[2] = t('brain_tuning.farbvorliebe');
      values[2] = t('units.degrees', {n : organNumber(rec?.[8])});
    } else if (k === 1) {
      labels[2] = t('brain_tuning.duftrichtung');
      values[2] = t('units.degrees', {n : organNumber(180 * ((n[20]?.[2] ?? 0) + 1))});
    } else if ([ 7, 8, 9 ].includes(k)) {
      labels[2] = t('brain_tuning.druckziel');
      values[2] = [
        t('brain_tuning.darm'), t('brain_tuning.eierstock'), t('brain_tuning.spermavorrat'),
        t('brain_tuning.schwimmblase'), t('brain_tuning.muskel')
      ][rec?.[22] || 0];
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
                            : t('brain_tuning.darmlaenge');
      const q = n[20] || [];
      values[2] = organPercent(brainClamp(((q[2] || 0) + 1) / 2));
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
                              sense && [ 1, 2, 5, 6, 10 ].includes(k) ? t('brain_tuning.adaptation')
                              : motor                                 ? t('brain_tuning.erholung')
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
              t('brain_tuning.ausdruck'),         t('brain_tuning.rolle'),
              t('brain_tuning.identitaetA'),      t('brain_tuning.identitaetB'),
              t('brain_tuning.identitaetC'),      t('brain_tuning.identitaetD'),
              t('brain_tuning.kapazitaet'),       t('brain_tuning.schwelle'),
              t('brain_tuning.zeitkonstante'),    t('brain_tuning.feldEingangsplaetze'),
              t('brain_tuning.qualitaet1'),       t('brain_tuning.qualitaet2'),
              t('brain_tuning.qualitaetsbreite'), t('brain_tuning.angebot1'),
              t('brain_tuning.angebot2'),         t('brain_tuning.suche1'),
              t('brain_tuning.suche2'),           t('brain_tuning.suchbreite'),
              t('brain_tuning.kreuzneigung'),     t('brain_tuning.reichweite')
            ],
        values =
            [
              n?.[31], ...(n?.[17] || [ 0, 0, 0, 0, 0 ]), p[1], p[0], p[6], p[5], p[2], p[3], p[4],
              ...(n?.[25] || [ 0, 0 ]), ...(n?.[26] || [ 0, 0 ]), n?.[32], n?.[33], n?.[34]
            ],
        signed = new Set([ 1, 2, 3, 4, 5, 10, 11, 13, 14, 15, 16, 18 ]);
  for (let i = 0; i < names.length; ++i) {
    const y = 13 + i * 12, v = values[i];
    g.fillStyle = '#bdd1d2';
    g.fillText(names[i], 8, y);
    g.fillStyle = '#294653';
    g.fillRect(185, y - 5, 100, 4);
    if (Number.isFinite(v)) {
      g.fillStyle = '#d7bd89';
      g.fillRect(185, y - 5, 100 * brainClamp(signed.has(i) ? (v + 1) / 2 : v), 4);
      g.textAlign = 'right';
      g.fillText(organNumber(v, 2), 350, y);
      g.textAlign = 'left';
    }
  }
  g.fillStyle = '#90adb7';
  g.fillText(t('brain_tuning.zoneSide', {
               zone : tList('brain_tuning.zones')[n?.[24]] || '',
               side : n?.[28]?.[3] < 0 ? t('brain_tuning.left') : t('brain_tuning.right')
             }),
             8, 262);
  canvas.title = t('brain_tuning.n360FesteKoerperplaetzeJe');
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
