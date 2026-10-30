// The figures the interface shows about one fish (vitals, anatomy, digestion, muscles, brain
// costs) as plain data: label, value, explanation, section and gauge. Any view lays them out.
import {ANATOMY, FISH} from './schema.js';
import {formatNumber, t} from './strings.js';
export const fish_profileState = {};

export function fishProfile(f, p, b, trait) {
  const stats = [], gauges = [];
  const stat = (key, label, value, note = '', section = '') =>
      stats.push({key, label, value, note, section});
  const gauge = (key, value, color) => gauges.push({key, value, color});
  stat('origin', t('selection.herkunft'),
       [
         t('selection.gruender'), t('selection.natuerlicheFortpflanzung'),
         t('selection.bestandshilfe'), t('selection.einwanderung')
       ][p[FISH.origin]] ||
           t('selection.unbekannt'),
       t('selection.herkunftDiesesIndividuums'));
  if (p[FISH.hatched] && p[FISH.disease] > 0)
    stat('disease', t('selection.krank'), t('selection.diseaseLeft', {n : p[FISH.disease]}),
         t('selection.restlicheKrankheitsdauerProSchritt'), 'vitals');
  stat('reserve', p[FISH.hatched] ? t('selection.energiereserve') : t('selection.eigelb'),
       p[FISH.hatched]
           ? t('units.ratio',
               {a : formatNumber(p[FISH.energy]), b : formatNumber(p[FISH.reserve_capacity])})
           : formatNumber(p[FISH.energy]),
       p[FISH.hatched] ? t('selection.energieImKoerperObergrenze')
                       : t('selection.verbleibenderDotterFuerEntwicklung'),
       'vitals');
  stat('age', p[FISH.hatched] ? t('selection.alterSeitSchlupf') : t('selection.entwicklung'),
       p[FISH.hatched] ? t('units.steps', {n : formatNumber(p[FISH.adult_age])})
                       : t('units.percent', {n : Math.round(p[FISH.development] * 100)}),
       '', 'vitals');
  stat('health', t('selection.gesundheit'),
       t('units.percent', {n : Math.round(p[FISH.health] * 100)}), '', 'vitals');
  stat('size', t('selection.koerpergroesse'),
       t('selection.sizeValue',
         {radius : formatNumber(p[FISH.radius], 1), mass : formatNumber(p[FISH.mass], 2)}),
       t('selection.radiusFuerSehenUnd'));
  if (p[FISH.hatched] && b?.tissue !== undefined)
    stat('growth', t('selection.gewebe'), formatNumber(b.tissue, 1),
         t('selection.endgewebeAusDerOrganmasse'));
  if (p[FISH.hatched]) {
    for (const [key, name, note] of [
             [
               'jaw_length', t('selection.kieferlaenge'), t('selection.kurzKraeftigesAbschabenUnd')
             ],
             [
               'gut_length', t('selection.darmlaenge'),
               t('selection.pflanzlicheVerdaulichkeitIstDas')
             ],
             [ 'blunt_teeth', t('selection.stumpfeZaehne'), t('selection.stumpfKnacktSchalenUnd') ],
             [
               'undulation', t('selection.schlaengeln'),
               t('selection.senktDenSedimentwiderstandKostet')
             ]]) {
      const value = b?.[key] ?? p[FISH.organs]?.[ANATOMY[key]];
      stat(key, name,
           Number.isFinite(value) ? t('units.percent', {n : Math.round(100 * value)}) : '–', note);
      gauge(key, value || 0, '#8bbfb5');
    }
    stat('gut-energy', t('selection.darmenergie'),
         formatNumber(b?.gut_energy ?? p[FISH.gut_energy], 1),
         t('selection.roheGeschluckteEnergieEinschliesslich'));
    stat('digestion', t('selection.verdauung'),
         t('units.perStep', {n : formatNumber(b?.digestion ?? p[FISH.digestion], 3)}),
         t('selection.verdauteEnergieVor12'));
    stat('digested', t('selection.tatsaechlichVerdaut'),
         formatNumber(b?.digested ?? p[FISH.digested], 1), t('selection.seitDemSchlupfVerdaut'));
    stat('raw-intake', t('selection.roheAufnahme'),
         formatNumber((trait?.raw_diet || []).reduce((sum, v) => sum + v, 0), 1),
         t('selection.geschluckteEnergieVorBeruecksichtigung'));
  }
  if (p[FISH.hatched])
    stat('speed', t('selection.schwimmtempo'), formatNumber(p[FISH.relative_speed], 2),
         t('selection.schwimmtempoRelativZumWasser'));
  if (!p[FISH.hatched] && Number.isFinite(b?.hatch_reserve))
    stat('hatch-reserve', t('selection.reserveNachSchlupf'),
         t('units.energy', {n : formatNumber(b.hatch_reserve, 1)}),
         t('selection.schaetzungNachRestlichemAufbau'), 'vitals');

  if (p[FISH.hatched])
    stat('muscle-tension', t('selection.vortriebsschlag'), formatNumber(p[FISH.impulse_forward], 3),
         t('selection.staerkeDesLetztenVortriebsereignisses'));
  if (p[FISH.hatched])
    stat('muscle-rise', t('selection.drehschlagLinksRechts'),
         t('units.ratio',
           {a : formatNumber(p[FISH.impulse_left], 3), b : formatNumber(p[FISH.impulse_right], 3)}),
         t('selection.seitenimpulseDesLetztenDrehereignisses'));
  if (p[FISH.hatched])
    stat('mouth', t('selection.wassertransport'),
         t('units.percent', {n : Math.round((b?.pump_flow ?? p[FISH.suction_pose] ?? 0) * 100)}),
         t('selection.anhaltendeSaugaktivierungAufnahmeVerbraucht'));
  if (p[FISH.hatched])
    stat('aggression', t('selection.schliesskraft'),
         t('units.percent', {n : Math.round((b?.bite_signal ?? p[FISH.aggression] ?? 0) * 100)}),
         t('selection.kapazitaetsgewichteteBeissaktivierungJeSchliessbewegung'));
  if (p[FISH.hatched] && Number.isFinite(p[FISH.mouth_aperture]))
    stat('aperture', t('selection.maulbreite'), t('units.pxOf', {
           n : formatNumber(2 * p[FISH.mouth_aperture] * (p[FISH.mouth_pose] || 0), 1),
           of : formatNumber(2 * p[FISH.mouth_aperture], 1)
         }),
         t('selection.oeffnungAusDerKieferlaenge'));
  if (p[FISH.hatched])
    stat('defense', t('selection.abwehr'),
         t('units.percent', {n : Math.round(p[FISH.defense] * 100)}),
         t('selection.aktuelleMuskelaktivitaetInProzent'));
  if (p[FISH.hatched])
    gauge('reserve', p[FISH.energy] / Math.max(1, p[FISH.reserve_capacity]), '#d3bb72');
  if (!p[FISH.hatched])
    gauge('age', p[FISH.development], '#a6ce85');
  gauge('health', p[FISH.health],
        p[FISH.health] > .65  ? '#8cc4ac'
        : p[FISH.health] > .3 ? '#d3bb72'
                              : '#d89787');
  const rows = [
    [ t('selection.gehirn'), b?.maintenance, t('selection.energieverbrauchDesGehirnsPro'), 100 ],
    [ t('selection.koerper'), b?.movement_cost, t('selection.energieverbrauchVonKoerperUnd'), 100 ]
  ];
  for (const [key, value, note, factor] of rows)
    stat(key, key,
         t('selection.costPer100',
           {n : formatNumber(value === undefined ? undefined : value * factor, 2)}),
         note, 'brain');
  stat('novelty', t('selection.neuheit'), formatNumber(b?.novelty, 3),
       t('selection.noveltyNote', {n : f.parameters?.novelty_neighbors || 15}), 'novelty');
  return {stats, gauges};
}
