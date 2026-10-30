import {t} from './strings.js';
import {hormoneName} from './hormones.js';
import {brainClamp, brainTissueName, brainWrap} from './brain.js';
import {brainScentWeights, scentNames} from './brain_model.js';
import {sceneState} from './state.js';
import {FISH, BEHAVIOR_SCALE} from './schema.js';
export const organ_readoutState = {};
export let organHistory;

export let organNumber;

export let organPercent;

export function eggLayingStatus(d, rate, limit) {
  const b = d.b, stored = (d.raw || d.p)[46] || 0, params = sceneState.frame.parameters || {};
  if (d.a?.birthing)
    return {text : t('organ_readout.wirdGelegt'), remaining : 0};
  if (!stored)
    return {
      text : d.p[5] > (params.egg_reserve ?? 30) * (d.b.tissue ?? 40) / 40
                 ? t('organ_readout.nochKeinDotter')
                 : t('organ_readout.wartetAufEnergie'),
      remaining : null
    };
  if (b.egg_laying) {
    if (!b.egg_nutrient &&
        (sceneState.frame.population_size ?? 0) >= (sceneState.frame.population_limit ?? 800))
      return {text : t('organ_readout.wartetAufFreienBestand'), remaining : null};
    if (!b.egg_nutrient && (b.egg_nearby ?? 0) >= (params.egg_crowding_limit ?? 4))
      return {text : t('organ_readout.gelegeplatzBesetzt'), remaining : null};
    return {text : t('organ_readout.wirdGelegt'), remaining : 0};
  }
  if ((params.egg_organ_capacity ?? 10) > 0 && stored < .95 * limit)
    return {
      text : t('organ_readout.waechstFreigabeAb95'),
      remaining : rate > 0 ? Math.ceil((.95 * limit - stored) / rate) : null,
      estimate : rate > 0
    };
  const release = organReleaseTiming(d, 3);
  return {
    text : stored >= limit ? t('organ_readout.eiVollWartetAuf')
                           : t('organ_readout.waechstAbgabemuskelLegtDas'),
    remaining : release.next,
    estimate : release.next !== null
  };
}

export function organVisualWeight(r, angle) {
  if (angle < r[11] || angle > r[12])
    return 0;
  return angle <= r[2] ? (r[2] === r[11] ? 1 : (angle - r[11]) / (r[2] - r[11]))
                       : (r[12] === r[2] ? 1 : (r[12] - angle) / (r[12] - r[2]));
}

export function eyeImage(info, count = 120, responses = false) {
  const half = 117 * Math.PI / 180, bands = info.image || [];
  return Array.from({length : count}, (_, i) => {
    const angle = -half + 2 * half * (i + .5) / count;
    if (!responses) {
      const pixel = bands.find(p => angle >= p[0] && angle < p[1]);
      return pixel ? pixel.slice(2, 5).map(v => brainClamp(v)) : [ 0, 0, 0 ];
    }
    const color = [ 0, 0, 0 ];
    let total = 0;
    for (const r of info.receptors) {
      const sample = info.samples?.get(r[0]), weight = organVisualWeight(r, angle);
      if (!sample || !weight)
        continue;
      total += weight;
      for (let c = 0; c < 3; ++c)
        color[c] += weight * (sample[4 + c] || 0) * sample[3] / Math.max(1e-12, sample[1]);
    }
    return color.map(v => brainClamp(v / Math.max(1e-12, total)));
  });
}

export function organStrokeIndex(index, side = 0) {
  return index === 1 ? 1 + side : [ 0, 1, 3, 4, 5, 6, 7 ][index];
}
export function organMotorInterval(index, d = {
  b : sceneState.frame?.brain
},
                                   side = 0) {
  return d.b?.strokes?.[organStrokeIndex(index, side)]?.[3] || 0;
}
export function organMotorTiming(d, index, activation, interval, side = 0) {
  const stroke = d.b?.strokes?.[organStrokeIndex(index, side)], threshold = d.b?.stroke_threshold;
  if (!stroke || !(threshold >= 0))
    return {next : null, rhythm : Infinity, work : 0, text : '—'};
  const [mean, recovery, power, tau] = stroke, keep = Math.exp(-1 / tau),
                                cooldown = Math.max(1, recovery),
                                atCooldown = activation + (mean - activation) * keep ** cooldown,
                                crossing = initial =>
                                    initial >= threshold ? 1
                                    : activation > threshold
                                        ? Math.max(1, Math.ceil(Math.log((activation - threshold) /
                                                                         (activation - initial)) /
                                                                Math.log(keep)))
                                        : Infinity,
                                next = atCooldown >= threshold && atCooldown > 0
                                           ? cooldown
                                           : Math.max(cooldown, crossing(mean)),
                                rhythm = Math.max(Math.round(tau), crossing(0));
  return {
    next : Number.isFinite(next) ? next : null,
    rhythm,
    work : Number.isFinite(next)
               ? Math.max(0, activation + (mean - activation) * keep ** next) * tau
               : 0,
    text : !Number.isFinite(next)
               ? activation > 0 ? t('organ_readout.ansteuerungZuSchwach') : t('organ_readout.ruht')
           : next <= 1 ? t('organ_readout.naechsterSchritt')
                       : t('units.inSteps', {n : next})
  };
}

export function organReleaseTiming(d, index) {
  const port = index === 3 ? 4 : 5,
        active = (d.b.effectors || []).filter(e => e[1] === port).reduce((sum, e) => {
          const n = d.nodes?.get(e[0]);
          return sum + (n?.[7] && !n[10] ? e[3] * brainClamp(n[18] ?? n[3]) * (e[6] ?? 0) : 0);
        }, 0);
  return organMotorTiming(d, index, active, 4);
}

export function spermReleaseStatus(d, rate, limit, portion) {
  const stored = d.p[48] || 0;
  if (stored < portion)
    return t('organ_readout.collectsAtLeast', {energy : organNumber(portion)});
  if (d.b.sperm_laying)
    return (sceneState.frame.sperm_releases || 0) >= (sceneState.frame.sperm_release_limit ?? 2000)
               ? t('organ_readout.wartetAufPlatzFuer')
               : t('organ_readout.gibtSpermienAb');
  return stored >= limit ? t('organ_readout.vorratVollWartetAuf')
                         : t('organ_readout.sammeltAbgabemuskelSetztSpermien');
}

export function brainOrganReadout(d, tissue) {
  const {
    key,
    side,
    members
  } = tissue,
  k = Number(key.slice(1)), nodes = [...new Map(members.map(m => [m.n[5], m.n])).values() ],
  weight = members.reduce((s, {n, part}) => s + part.share * n[11], 0),
  activity =
      members.reduce(
          (s, {n, part}) => s + part.share * n[11] * (n[7] && !n[10] ? Math.abs(n[3]) : 0), 0) /
      Math.max(1e-9, weight),
  rec = nodes.map(n => d.receptors.get(n[5])).filter(Boolean),
  params = sceneState.frame.parameters || {},
  metric = (label, value, hint = '') => ({label, value, hint}),
  response = metric(
      t('organ_readout.zellaktivitaet'), organPercent(activity),
      t('organ_readout.sinneszellenErhaltenDasSignal')),
  info = {
    key,
    side,
    title : tissue.variant === 'barbel' ? t('organ_readout.bartel')
            : key === 's8' ? [ t('organ_readout.darmfuellung'), t('organ_readout.eifuellung'), t('organ_readout.spermienfuellung') ][tissue.side]
                           : brainTissueName(key),
    cells : nodes.length,
    activity,
    metrics : [],
    graphic : 'signal',
    hero : '',
    caption : '',
    series : activity
  };
  const ports = [ 1, 2, 6, 4, 5, 10, 11, 7, 12, 13 ],
        all = key[0] === 'm'
                  ? d.b.effectors.filter(e => e[1] === ports[k] && d.nodes.get(e[0])?.[4])
                  : [],
        motor = all.filter(e => nodes.some(n => n[5] === e[0])),
        capacity = motor.reduce((s, e) => s + e[3], 0),
        totalCapacity = all.reduce((s, e) => s + e[3], 0),
        active =
            e => {
              const n = d.nodes.get(e[0]);
              return n?.[7] && !n[10]
                         ? brainClamp(k === 1 ? Math.abs(n[18] ?? n[3]) : n[18] ?? n[3])
                         : 0;
            },
        sum = motor.reduce((s, e) => s + e[3] * active(e), 0),
        total = all.reduce((s, e) => s + e[3] * active(e), 0), u = sum / Math.max(1e-9, capacity),
        drive = k === 1 ? all.reduce(
                              (s, e) => {
                                const n = d.nodes.get(e[0]),
                                      lever = (n?.[18] ?? n?.[3] ?? 0) < 0 ? -e[4] : e[4];
                                return s + e[3] * active(e) * (1 + (side ? 1 : -1) * lever) / 2;
                              },
                              0)
                        : total,
        timing = organMotorTiming(d, k, drive, organMotorInterval(k, d, side), side),
        growth = (d.b.tissue ?? 40) / 40,
        paired = key[0] === 's' ? [ 0, 1, 2, 3, 6, 9 ].includes(k) : [ 1, 6 ].includes(k);
  const nextPulse = metric(t('organ_readout.naechsterPuls'), timing.text,
                           t('organ_readout.beiGleichbleibenderAnsteuerungPausen'));
  if (paired)
    info.title = t(side ? 'units.titleRight' : 'units.titleLeft', {name : info.title});
  if (key === 'internal') {
    const firing = nodes.filter(n => n[7] && !n[10] && Math.abs(n[18] ?? n[3]) > .05).length,
          tau = members.reduce((s, {n, part}) => s + (n[16] || 0) * part.share * n[11], 0) /
                Math.max(1e-9, weight);
    info.hero = firing + ' / ' + nodes.length;
    info.caption = t(
        'organ_readout.innerActive',
        {head : nodes.filter(n => n[1] >= .2).length, cord : nodes.filter(n => n[1] < .2).length});
    info.metrics = [
      metric(t('organ_readout.zeitkonstante'), t('units.steps', {n : Math.round(tau)}),
             t('organ_readout.mittlereZeitkonstanteDerLernspuren')),
      metric(t('organ_readout.verbindungen'), organNumber(d.b.edges.length, 0),
             t('organ_readout.nervenverbindungenImGesamtenGehirn'))
    ];
  } else if (key[0] === 'm') {
    info.activity = u;
    if (k < 2) {
      info.graphic = 'pulse';
      info.period = timing.rhythm;
      info.nextSteps = timing.next;
      info.series = k === 0 ? d.p[55] : d.p[side ? 43 : 42];
      const impulse = timing.work, weak = 1 - (params.wound_weakness ?? .5) * (1 - d.p[23]),
            mass = Math.max(.2, d.p[50] || 1);
      if (k === 0) {
        const speed = (params.stroke_push ?? 0) * impulse * weak / Math.max(.5, mass);
        info.hero = t('units.plusPxPerStep', {n : organNumber(speed, 2)});
        info.caption = t('organ_readout.speedGain', {share : organPercent(d.b.undulation)});
        info.metrics = [
          {...nextPulse, label : t('organ_readout.naechsterSchlag')},
          metric(t('organ_readout.energieJeSchlag'),
                 organNumber((params.swimming_cost ?? 0) * impulse, 3),
                 t('organ_readout.beiAusreichenderEnergieVerletzung'))
        ];
      } else {
        const inertia = (params.size_physics ?? 1) >= .5 ? mass : 1,
              angle =
                  brainClamp((params.stroke_turn ?? 0) * impulse * (side ? -1 : 1) * weak / inertia,
                             -BEHAVIOR_SCALE.turn_degrees, BEHAVIOR_SCALE.turn_degrees);
        info.hero = total <= 0 ? t('organ_readout.ruht')
                    : Math.abs(angle) < .01
                        ? t('organ_readout.keineDrehung')
                        : t(angle > 0 ? 'units.degPerStepRight' : 'units.degPerStepLeft',
                            {n : organNumber(Math.abs(angle), 1)});
        info.caption = t('organ_readout.zuwachsDerDrehgeschwindigkeit');
        info.metrics = [
          {...nextPulse, label : t('organ_readout.naechsterSchlag')},
          metric(t('organ_readout.dieseFlosseTraegtBei'), organPercent(sum / Math.max(1e-9, total)),
                 t('organ_readout.vorzeichenUndSeitlicheLage'))
        ];
      }
    } else if (k === 2) {
      const gape = d.b.maximum_mouth_aperture || 0;
      info.hero = t('organ_readout.gapeUpTo', {n : organNumber(gape * 2, 1)});
      info.caption = t('organ_readout.saugtBrockenSchabtAlgen');
      info.graphic = 'mouth';
      info.metrics = [
        metric(t('organ_readout.reichweite'), t('units.px', {n : organNumber(d.b.mouth_reach, 1)}),
               t('organ_readout.abstandVomMaulrandWaende')),
        metric(t('organ_readout.wassertransport'), organPercent(d.b.pump_flow || 0),
               t('organ_readout.saugkraftSetztDenWasserstrom'))
      ];
      info.series = d.b.eat_signal || 0;
    } else if (k === 3 || k === 4) {
      const egg = k === 3,
            limit =
                (d.raw || d.p)[egg ? FISH.egg_capacity : FISH.sperm_capacity] ??
                ((params[egg ? 'egg_capacity' : 'sperm_capacity'] ?? (egg ? 160 : 40)) * growth),
            stored = d.p[egg ? 46 : 48] || 0,
            rate = (params[egg ? 'egg_fill_rate' : 'sperm_fill_rate'] ?? (egg ? 2 : .2)) * growth *
                   (() => {
                     const inside =
                         motor.reduce((s, e) => s + e[3] * active(e) * (1 - (e[6] ?? .5)), 0);
                     return inside / (1 + inside);
                   })(),
            portion = params.sperm_portion ?? 2;
      info.hero = t('units.energyOf', {n : organNumber(stored), of : organNumber(limit)});
      info.graphic = egg ? 'egg' : 'sperm';
      info.fill = limit > 0 ? stored / limit : 0;
      info.series = info.fill;
      info.metrics = [ metric(
          egg ? t('organ_readout.dotterAngefordert') : t('organ_readout.spermaAngefordert'),
          t('units.energyPerStep', {
            n : organNumber(stored >= limit || d.b[egg ? 'egg_laying' : 'sperm_laying'] ||
                                    d.p[5] <= (params.egg_reserve ?? 30) * growth
                                ? 0
                                : rate,
                            2)
          }),
          t('organ_readout.angeforderterMittlererZuflussBei')) ];
      if (egg) {
        info.laying = eggLayingStatus(d, rate, limit);
        info.caption = info.laying.text;
        info.metrics.push(metric(t('organ_readout.bisZurAbgabe'),
                                 info.laying.remaining === null ? t('organ_readout.wartet')
                                 : info.laying.remaining === 0
                                     ? t('organ_readout.jetzt')
                                     : t('units.steps', {n : info.laying.remaining}),
                                 t('organ_readout.geschaetztBeiGleichbleibenderFuell')));
      } else {
        info.caption = spermReleaseStatus(d, rate, limit, portion);
        info.metrics.push(metric(t('organ_readout.befruchtungenJeWolke'),
                                 t('organ_readout.unbegrenzt'),
                                 t('organ_readout.solangeDieWolkeAusreichend')));
      }
    } else if (k === 5) {
      const force = d.b.bite_strength || 0;
      info.hero = t('organ_readout.biteForce', {n : organNumber(force, 1)});
      info.caption = t('organ_readout.spitzeZaehneReissenUnd');
      info.graphic = 'attack';
      info.fill = d.b.bite_signal || 0;
      info.metrics = [
        metric(t('organ_readout.mundzyklus'),
               (d.b.mouth_phase ?? -1) < 0 ? t('organ_readout.ruhe')
                                           : organPercent(d.b.mouth_phase / 8),
               t('organ_readout.beissenFunktioniertUnabhaengigVom')),
        metric(t('organ_readout.zahnform'),
               t('organ_readout.blunt', {share : organPercent(d.b.blunt_teeth)}),
               t('organ_readout.gepackteWuermerUndBruchstuecke'))
      ];
      info.series = d.b.bite_signal || 0;
    } else if (k === 6) {
      info.hero = t('organ_readout.protection', {share : organPercent(d.p[26])});
      info.caption = t('organ_readout.aufgestellteStachelnSchuetzenVor');
      info.graphic = 'defense';
      info.fill = d.p[26] || 0;
      info.metrics = [
        metric(t('organ_readout.widerstand'),
               t('units.times', {n : organNumber(1 + 2 * (d.b.active_defense || 0), 2)}),
               t('organ_readout.faktorDerAbbremsungDurch')),
        nextPulse
      ];
      info.series = d.p[26];
    } else if (k === 8) {
      info.hero = t('organ_readout.filled', {share : organPercent(d.b.bladder_fill)});
      info.caption =
          d.b.buoyancy_force > 0 ? t('organ_readout.sinktrieb') : t('organ_readout.auftrieb');
      info.graphic = 'bladder';
      info.fill = d.b.bladder_fill || 0;
      info.series = info.fill;
      info.metrics = [
        metric(t('organ_readout.kraftNachUnten'), organNumber(d.b.buoyancy_force, 4),
               t('organ_readout.positiveWerteZiehenNach')),
        metric(t('organ_readout.kapazitaet'), organNumber(d.b.bladder_capacity, 2),
               t('organ_readout.mehrBlasengewebeErmoeglichtMehr'))
      ];
    } else if (k === 9) {
      const h = d.b.hormones;
      info.hero = t('organ_readout.hormone');
      info.caption = t('organ_readout.ausschuettungUndAbbauErbliche');
      info.graphic = 'hormones';
      info.values = h?.levels || [ 0, 0, 0, 0 ];
      info.metrics = [ 0, 1, 2, 3 ].flatMap(
          c => [metric(hormoneName(h, c), organNumber(h?.levels?.[c], 3)),
                metric(t('organ_readout.ausschuettungAbbau'), t('units.ratio', {
                         a : organNumber(h?.secretion?.[c], 3),
                         b : organNumber(h?.binding?.[c], 3)
                       }))]);
    } else {
      info.hero = t('organ_readout.hautfarbe');
      info.caption = t('organ_readout.gemitteltePigmentaktivitaetFarbeVeraendert');
      info.graphic = 'color';
      info.values = d.p.slice(16, 19);
      info.metrics = [ metric(t('organ_readout.pigmentbildung'), organPercent(u),
                              t('organ_readout.dieZellenGebenFarbpigment')) ];
    }
  } else {
    if (k === 0) {
      const points =
                [
                  -117 * Math.PI / 180, 117 * Math.PI / 180, ...rec.flatMap(r => [r[11], r[12]])
                ].sort((a, b) => a - b),
            coverage = [ 0, 0, 0 ];
      for (let i = 1; i < points.length; i++) {
        const mid = (points[i - 1] + points[i]) / 2;
        for (let c = 0; c < 3; c++) {
          let peak = 0;
          for (const r of rec)
            if (mid >= r[11] && mid <= r[12]) {
              const share = members.filter(m => m.n[5] === r[0] && m.part.key === 's0')
                                .reduce((s, m) => s + m.part.share * m.n[11], 0);
              peak = Math.max(peak, Math.min(1, share) * (r[17]?.[c] || 0));
            }
          coverage[c] += (points[i] - points[i - 1]) * peak / (234 * Math.PI / 180);
        }
      }
      info.image =
          (d.b.visual_image || []).filter(band => band[5] === undefined || band[5] === side);
      info.samples = new Map((d.b.visual_samples || []).map(s => [s[0], s]));
      info.hero = t('organ_readout.sehbild');
      info.caption = t('organ_readout.anatomischerAugenpunktLichtAm');
      info.graphic = 'eye';
      info.values = coverage;
      info.receptors = rec;
      info.metrics = [
        metric(t('organ_readout.rotempfindlicheAbdeckung'),
               t('organ_readout.ofView', {share : organPercent(coverage[0])}),
               t('organ_readout.geometrischeAbdeckungMitRotempfindlichkeit')),
        metric(t('organ_readout.blickrichtungen'),
               new Set(rec.map(r => Math.round(r[2] * 180 / Math.PI))).size,
               t('organ_readout.unterschiedlicheAusrichtungenDerSehzellen'))
      ];
    } else if (k === 1) {
      const values = Array.from(
                {length : 8},
                (_, i) => members.reduce((s, {n, part}) =>
                                             s + part.share * n[11] *
                                                     brainScentWeights(n, d.receptors.get(n[5]))[i],
                                         0) /
                          Math.max(1e-9, weight)),
            best = values.indexOf(Math.max(...values));
      info.hero = scentNames[best];
      info.caption =
          tissue.variant === 'barbel'
              ? t('organ_readout.duftreizUndVorliebeSediment')
              : (d.b.body_profile?.smell_sites >= 2 ? t('organ_readout.duftreizUndVorliebeZwei')
                                                    : t('organ_readout.duftreizUndVorliebeEine'));
      info.graphic = 'scent';
      info.values = values;
      info.odors = d.b.nose_samples?.[side]?.slice(3) || [];
      info.metrics = [
        metric(t('organ_readout.empfindlichkeitDafuer'), organPercent(values[best]),
               t('organ_readout.hoheWerteBedeutenDass')),
        response
      ];
    } else if (k === 2) {
      info.hero = t('units.pxPerStep', {n : organNumber(d.p[45], 2)});
      info.caption = t('organ_readout.wasserbewegungRelativZurHaut');
      info.graphic = 'direction';
      info.receptors = rec;
      info.metrics = [
        metric(t('organ_readout.drehungGerade'),
               t('units.degPerStep', {n : organNumber(Math.abs(d.b.turn || 0) * 180 / Math.PI, 1)}),
               t('organ_readout.auchDrehungenBewegenWasser')),
        response
      ];
    } else if (k === 3) {
      let contact = 0, measured = false;
      for (const r of rec) {
        const value =
            (d.components ??= new Map((d.b.sensory_components || []).map(row => [row[0], row])))
                .get(r[0])
                ?.[4];
        if (value !== undefined && r[9]?.[3] > 0) {
          measured = true;
          contact = Math.max(contact, value / r[9][3]);
        }
      }
      if (!measured) {
        contact = d.b.contact || 0;
        if (d.b.contact_vector) {
          contact = 0;
          for (const r of rec) {
            const angle = d.p[2] + (r[20] ?? r[2]);
            contact = Math.max(contact, d.b.contact_vector[0] * Math.cos(angle) +
                                            d.b.contact_vector[1] * Math.sin(angle));
          }
        }
        // Detailed pressure is supplied by the measured receptor components above.
      }
      info.hero = contact > 0 ? t('organ_readout.beruehrtEtwas') : t('organ_readout.keinKontakt');
      info.caption = t('organ_readout.beruehrungUndSedimentkontaktDer');
      info.graphic = 'touch';
      info.fill = brainClamp(contact);
      info.metrics = [ response ];
    } else if (k === 4) {
      const floor = d.b.tissue_floor ?? Math.max(10, .5 * (d.b.peak_tissue ?? d.b.tissue ?? 20));
      info.hero = t('units.energy', {n : organNumber(d.p[5])});
      info.caption = t('organ_readout.fuellstandDerKoerperabhaengigenEnergiereserve');
      info.graphic = 'reserve';
      info.fill = d.p[5] / Math.max(1, d.p[53] || 500);
      info.metrics = [
        metric(t('organ_readout.speicherGefuellt'), organPercent(info.fill)),
        metric(t('organ_readout.gewebe'),
               t('organ_readout.tissueDeath',
                 {n : organNumber(d.b.tissue ?? 20), floor : organNumber(floor)}),
               t('organ_readout.dieTodesgrenzeBetraegtDie'))
      ];
      info.series = info.fill;
    } else if (k === 5) {
      info.hero = t('units.energyPerStep', {n : organNumber(d.b.nutrient_flow, 2)});
      info.caption = t('organ_readout.meldetVerwertbareAufnahmeUnmittelbar');
      info.graphic = 'feeding';
      info.series = d.b.nutrient_flow || 0;
      info.metrics = [
        response, metric(t('organ_readout.verwertbareAufnahme'),
                         t('units.energy', {n : organNumber(sceneState.frame.selected_nutrition)}),
                         t('organ_readout.beimSchluckenVerdaulicheEnergie'))
      ];
    } else if (k === 6) {
      info.hero = t('organ_readout.health', {share : organPercent(d.p[23])});
      info.caption = d.p[23] >= 1 ? t('organ_readout.unverletzt')
                                  : t('organ_readout.meldetVerletzungenAnsGehirn');
      info.graphic = 'health';
      info.fill = d.p[23];
      info.metrics = [
        metric(t('organ_readout.verbleibendeSchwimmkraft'),
               organPercent(1 - (params.wound_weakness ?? .5) * (1 - d.p[23])),
               t('organ_readout.verletzungenSchwaechenVortriebUnd')),
        response
      ];
      info.series = 1 - d.p[23];
    } else if (k === 8) {
      const weights = rec.reduce((sum, r) => sum.map((v, c) => v + (r[17]?.[c] ?? 0)), [ 0, 0, 0 ]),
            total = weights.reduce((a, b) => a + b, 0) || 1,
            organs =
                [
                  d.b.satiety || 0, d.b.gonad_filling || 0,
                  brainClamp((d.p[48] || 0) / Math.max(1e-9, d.p[68] || 0))
                ],
            filling = weights.reduce((sum, w, c) => sum + w * organs[c], 0) / total;
      info.hero = t('organ_readout.stretch', {share : organPercent(filling)});
      info.caption = weights
                         .map((w, c) => t('organ_readout.stretchPart', {
                                organ : t('organ_readout.stretchOrgans.' + c),
                                share : organPercent(w / total)
                              }))
                         .join(' · ');
      info.graphic = 'gut';
      info.fill = d.b.satiety || 0;
      info.series = filling;
      info.metrics = [
        response, metric(t('organ_readout.organfuellung'),
                         organs
                             .map((v, c) => t('organ_readout.stretchPart', {
                                    organ : t('organ_readout.stretchOrgans.' + c),
                                    share : organPercent(v)
                                  }))
                             .join(' · '),
                         t('organ_readout.darmFuellungEinschliesslichBallast'))
      ];
    } else if (k === 10) {
      const h = d.b.hormones,
            affinities = [ 0, 1, 2, 3 ].map(
                c => rec.reduce((sum, r) => sum + (r[21]?.[c] || 0), 0) / Math.max(1, rec.length));
      info.hero = t('organ_readout.hormonsinn');
      info.caption = t('organ_readout.innererStoffreizErblicheAdaptation');
      info.graphic = 'signal';
      info.metrics = [
        response,
        ...affinities.map((v, c) =>
                              metric(t('organ_readout.affinity', {hormone : hormoneName(h, c)}),
                                     organPercent(v))),
        metric(t('organ_readout.konzentrationsschwelle'),
               rec.map(r => organNumber(r[13], 4)).join(' · '))
      ];
    } else if (k === 9) {
      info.hero = t('organ_readout.pain', {share : organPercent(d.b.pain)});
      info.caption = t('organ_readout.kuerzlichErlittenerGesundheitsschaden');
      info.graphic = 'signal';
      info.series = d.b.pain || 0;
      info.metrics = [ response ];
    } else {
      info.hero =
          t('organ_readout.depth', {share : organPercent(d.p[1] / sceneState.frame.height)});
      info.caption = t('organ_readout.oberflaeche0Beckenboden100');
      info.graphic = 'depth';
      info.fill = d.p[1] / sceneState.frame.height;
      info.metrics = [
        metric(
            t('organ_readout.position'),
            t('units.pxOf', {n : organNumber(d.p[1]), of : organNumber(sceneState.frame.height)})),
        response
      ];
    }
  }
  info.metrics = info.metrics.slice(0, k === 9 || k === 10 ? 4 : 2);
  return info;
}

const initializers = {
  "organHistory" : () => {
    // Organ cards use the same capacities, thresholds and motor periods as the body.
    organHistory = new Map();
  },
  "organNumber" : () => {
    organNumber = (v, d = 1) =>
        Number(v || 0).toLocaleString(t('units.locale'), {maximumFractionDigits : d});
  },
  "organPercent" : () => { organPercent = v => Math.round(100 * brainClamp(v)) + ' %'; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
