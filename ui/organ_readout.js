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
    return {text : 'Wird gelegt', remaining : 0};
  if (!stored)
    return {
      text : d.p[5] > (params.egg_reserve ?? 30) * Math.sqrt((d.b.tissue ?? 40) / 40)
                 ? 'Noch kein Dotter'
                 : 'Wartet auf Energie',
      remaining : null
    };
  if (b.egg_laying) {
    if (!b.egg_nutrient &&
        (sceneState.frame.population_size ?? 0) >= (sceneState.frame.population_limit ?? 800))
      return {text : 'Wartet auf freien Bestand', remaining : null};
    if (!b.egg_nutrient && (b.egg_nearby ?? 0) >= (params.egg_crowding_limit ?? 4))
      return {text : 'Gelegeplatz besetzt', remaining : null};
    return {text : 'Wird gelegt', remaining : 0};
  }
  if ((params.egg_organ_capacity ?? 10) > 0 && stored < .95 * limit)
    return {
      text : 'Wächst · Freigabe ab 95 % Füllung',
      remaining : rate > 0 ? Math.ceil((.95 * limit - stored) / rate) : null,
      estimate : rate > 0
    };
  const release = organReleaseTiming(d, 3);
  return {
    text : stored >= limit ? 'Ei voll · wartet auf Abgabemuskel'
                           : 'Wächst · Abgabemuskel legt das Ei',
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
    text : !Number.isFinite(next) ? activation > 0 ? 'Ansteuerung zu schwach' : 'Ruht'
           : next <= 1            ? 'Nächster Schritt'
                                  : 'In ' + next + ' Schritten'
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
    return 'Sammelt mindestens ' + organNumber(portion) + ' Energie';
  if (d.b.sperm_laying)
    return (sceneState.frame.sperm_releases || 0) >= (sceneState.frame.sperm_release_limit ?? 2000)
               ? 'Wartet auf Platz für eine Abgabe'
               : 'Gibt Spermien ab';
  return stored >= limit ? 'Vorrat voll · wartet auf Abgabemuskel'
                         : 'Sammelt · Abgabemuskel setzt Spermien frei';
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
      'Zellaktivität', organPercent(activity),
      'Sinneszellen erhalten das Signal ihres dominanten Sinns. Innere Zellen und Organzellen verarbeiten Eingänge aus dem Nervennetz.'),
  info = {
    key,
    side,
    title : tissue.variant === 'barbel' ? 'Bartel' : brainTissueName(key),
    cells : nodes.length,
    activity,
    metrics : [],
    graphic : 'signal',
    hero : '',
    caption : '',
    series : activity
  };
  if (key === 'gut' || key === 'reserve') {
    info.hero = organPercent(
        key === 'gut' ? d.b.satiety : d.p[FISH.energy] / Math.max(1, d.p[FISH.reserve_capacity]));
    info.graphic = key === 'gut' ? 'gut' : 'reserve';
    info.fill =
        key === 'gut' ? d.b.satiety : d.p[FISH.energy] / Math.max(1, d.p[FISH.reserve_capacity]);
    info.caption =
        key === 'gut' ? 'Füllung, Verwertung und Durchgang' : 'Verfügbare Energiereserve';
    info.metrics=key==='gut'?[metric('Darmenergie',organNumber(d.b.gut_energy)),metric('Verdaulich',organNumber(d.b.gut_digestible))]:[metric('Energie',organNumber(d.p[FISH.energy])),metric('Fassung',organNumber(d.p[FISH.reserve_capacity]))];
    return info;
  }
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
              return n?.[7] && !n[10] ? brainClamp(n[18] ?? n[3]) : 0;
            },
        sum = motor.reduce((s, e) => s + e[3] * active(e), 0),
        total = all.reduce((s, e) => s + e[3] * active(e), 0), u = sum / Math.max(1e-9, capacity),
        drive = k === 1 ? all.reduce(
                              (s, e) => {
                                const lever = e[4];
                                return s + ((lever < 0 ? 0 : 1) === side
                                                ? e[3] * Math.max(0, active(e)) * Math.abs(lever)
                                                : 0);
                              },
                              0)
                        : total,
        timing = organMotorTiming(d, k, drive, organMotorInterval(k, d, side), side),
        growth = (d.b.tissue ?? 40) / 40,
        paired = key[0] === 's' ? [ 0, 1, 2, 3, 6, 9 ].includes(k) : [ 1, 6 ].includes(k);
  const nextPulse = metric('Nächster Puls', timing.text,
                           'Bei gleichbleibender Ansteuerung; Pausen verlängern die Wartezeit.');
  if (paired)
    info.title += side ? ' rechts' : ' links';
  if (key === 'internal') {
    const firing = nodes.filter(n => n[7] && !n[10] && Math.abs(n[18] ?? n[3]) > .05).length,
          tau = members.reduce((s, {n, part}) => s + (n[16] || 0) * part.share * n[11], 0) /
                Math.max(1e-9, weight);
    info.hero = firing + ' / ' + nodes.length;
    info.caption = 'Innere Nervenzellen aktiv · Kopf ' + nodes.filter(n => n[24] <= 1).length +
                   ' · Nervenstrang ' + nodes.filter(n => n[24] > 1).length;
    info.metrics = [
      metric('Zeitkonstante', Math.round(tau) + ' Schritte',
             'Mittlere Zeitkonstante der Lernspuren und Eigenrhythmen.'),
      metric('Verbindungen', d.b.edges.length.toLocaleString('de'),
             'Nervenverbindungen im gesamten Gehirn.')
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
        info.hero = '+ ' + organNumber(speed, 2) + ' px/Schritt';
        info.caption = 'Tempozuwachs · ' + organPercent(d.b.undulation) + ' Schlängelanteil';
        info.metrics = [
          {...nextPulse, label : 'Nächster Schlag'},
          metric(
              'Energie je Schlag', organNumber((params.muscle_work_cost ?? 0) * impulse, 3),
              'Bei ausreichender Energie; Verletzung und Masse sind im angezeigten Tempozuwachs berücksichtigt.')
        ];
      } else {
        const inertia = (params.size_physics ?? 1) >= .5 ? mass : 1,
              angle =
                  brainClamp((params.stroke_turn ?? 0) * impulse * (side ? -1 : 1) * weak / inertia,
                             -BEHAVIOR_SCALE.turn_degrees, BEHAVIOR_SCALE.turn_degrees);
        info.hero = total <= 0              ? 'Ruht'
                    : Math.abs(angle) < .01 ? 'Keine Drehung'
                                            : organNumber(Math.abs(angle), 1) + '°/Schritt ' +
                                                  (angle > 0 ? 'rechts' : 'links');
        info.caption = 'Zuwachs der Drehgeschwindigkeit';
        info.metrics = [
          {...nextPulse, label : 'Nächster Schlag'},
          metric('Diese Flosse trägt bei', organPercent(sum / Math.max(1e-9, total)),
                 'Körperseite und Ansatz bestimmen den Drehsinn der Flosse.')
        ];
      }
    } else if (k === 2) {
      const gape = d.b.maximum_mouth_aperture || 0;
      info.hero = 'Bis ' + organNumber(gape * 2, 1) + ' px breit';
      info.caption = 'Saugt Brocken, schabt Algen und filtriert Plankton';
      info.graphic = 'mouth';
      info.metrics = [
        metric(
            'Reichweite', organNumber(d.b.mouth_reach, 1) + ' px',
            'Abstand vom Maulrand; Wände blockieren das Einsaugen. Größere Reichweite erhöht den Energieaufwand quadratisch.'),
        metric(
            'Wassertransport', organPercent(d.b.pump_flow || 0),
            'Saugkraft setzt den Wasserstrom, Kieferlänge die Öffnung. Würmer werden mit dem Biss gepackt.')
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
      info.hero = organNumber(stored) + ' / ' + organNumber(limit) + ' Energie';
      info.graphic = egg ? 'egg' : 'sperm';
      info.fill = limit > 0 ? stored / limit : 0;
      info.series = info.fill;
      info.metrics = [
        metric(
            egg ? 'Dotter · angefordert' : 'Sperma · angefordert',
            organNumber(stored >= limit || d.b[egg ? 'egg_laying' : 'sperm_laying'] ||
                                d.p[5] <= (params.egg_reserve ?? 30) * Math.sqrt(growth)
                            ? 0
                            : rate,
                        2) +
                ' Energie/Schritt',
            'Angeforderter mittlerer Zufluss bei gleichbleibender Aktivität; Ei und Sperma teilen sich die verfügbare Energie.')
      ];
      if (egg) {
        info.laying = eggLayingStatus(d, rate, limit);
        info.caption = info.laying.text;
        info.metrics.push(metric(
            'Bis zur Abgabe',
            info.laying.remaining === null ? 'Wartet'
            : info.laying.remaining === 0  ? 'Jetzt'
                                           : info.laying.remaining + ' Schritte',
            'Geschätzt bei gleichbleibender Füll- bzw. Abgabeaktivität; Bestand und Gelegeplatz müssen frei sein.'));
      } else {
        info.caption = spermReleaseStatus(d, rate, limit, portion);
        info.metrics.push(
            metric('Befruchtungen je Wolke', 'Unbegrenzt',
                   'Solange die Wolke ausreichend dicht ist. Größere Vorräte halten länger.'));
      }
    } else if (k === 5) {
      const force = d.b.bite_strength || 0;
      info.hero = organNumber(force, 1) + ' Bisskraft';
      info.caption = 'Spitze Zähne reißen und greifen; stumpfe knacken und mahlen';
      info.graphic = 'attack';
      info.fill = d.b.bite_signal || 0;
      info.metrics = [
        metric(
            'Mundzyklus', (d.b.mouth_phase ?? -1) < 0 ? 'Ruhe' : organPercent(d.b.mouth_phase / 8),
            'Beißen funktioniert unabhängig vom Schlucken. Alle aktiven Bissmuskeln tragen gemeinsam zur Kraft bei.'),
        metric(
            'Zahnform', organPercent(d.b.blunt_teeth) + ' stumpf',
            'Gepackte Würmer und Bruchstücke werden in einer offenen Phase eingesaugt; ein gescheiterter Krabbenbiss kann Kneifen auslösen.')
      ];
      info.series = d.b.bite_signal || 0;
    } else if (k === 6) {
      info.hero = organPercent(d.p[26]) + ' Schutz';
      info.caption = 'Aufgestellte Stacheln schützen vor Biss und Ganzschlucken';
      info.graphic = 'defense';
      info.fill = d.p[26] || 0;
      info.metrics = [
        metric(
            'Widerstand', '× ' + organNumber(1 + 2 * (d.b.active_defense || 0), 2),
            'Faktor der Abbremsung durch Wasser und Sediment. Bewegung im Sediment kann zusätzlich die Gesundheit senken.'),
        nextPulse
      ];
      info.series = d.p[26];
    } else if (k === 8) {
      info.hero = organPercent(d.b.bladder_fill) + ' gefüllt';
      info.caption = d.b.buoyancy_force > 0 ? 'Sinktrieb' : 'Auftrieb';
      info.graphic = 'bladder';
      info.fill = d.b.bladder_fill || 0;
      info.series = info.fill;
      info.metrics = [
        metric(
            'Kraft nach unten', organNumber(d.b.buoyancy_force, 4),
            'Positive Werte ziehen nach unten, negative nach oben. Positive Ansteuerung füllt, negative entleert die Blase.'),
        metric('Kapazität', organNumber(d.b.bladder_capacity, 2),
               'Mehr Blasengewebe ermöglicht mehr Auftrieb.')
      ];
    } else if (k === 9) {
      const h = d.b.hormones;
      info.hero = 'Hormone';
      info.caption = 'Ausschüttung und Abbau · erbliche Zeitkonstanten';
      info.graphic = 'hormones';
      info.values = h?.levels || [ 0, 0, 0, 0 ];
      info.metrics = [ 0, 1, 2, 3 ].flatMap(
          c => [metric(hormoneName(h, c), organNumber(h?.levels?.[c], 3)),
                metric('Ausschüttung / Abbau', organNumber(h?.secretion?.[c], 3) + ' / ' +
                                                   organNumber(h?.binding?.[c], 3))]);
    } else {
      info.hero = 'Hautfarbe';
      info.caption = 'Gemittelte Pigmentaktivität · Farbe verändert sich langsam';
      info.graphic = 'color';
      info.values = d.p.slice(16, 19);
      info.metrics = [
        metric(
            'Pigmentbildung', organPercent(u),
            'Die Zellen geben Farbpigment ab. Nach dem Abschalten baut sich das zusätzliche Pigment allmählich ab.')
      ];
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
      info.hero = 'Sehbild';
      info.caption = 'Anatomischer Augenpunkt · Licht am Auge und Rezeptorantwort';
      info.graphic = 'eye';
      info.values = coverage;
      info.receptors = rec;
      info.metrics = [
        metric(
            'Rotempfindliche Abdeckung', organPercent(coverage[0]) + ' des Blickfelds',
            'Geometrische Abdeckung mit Rotempfindlichkeit. Sie belegt keine Erkennung von Futter; Adaptation, Farbgegensatz und Verdeckungen bestimmen das tatsächliche Signal.'),
        metric('Blickrichtungen', new Set(rec.map(r => Math.round(r[2] * 180 / Math.PI))).size,
               'Unterschiedliche Ausrichtungen der Sehzellen dieses Auges.')
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
      info.caption = tissue.variant === 'barbel'
                         ? 'Duftreiz und Vorliebe · Sediment dämpft das Signal'
                         : (d.b.body_profile?.smell_sites >= 2
                                ? 'Duftreiz und Vorliebe · zwei getrennte Riechstellen'
                                : 'Duftreiz und Vorliebe · eine Riechstelle');
      info.graphic = 'scent';
      info.values = values;
      info.odors = d.b.nose_samples?.[side]?.slice(3) || [];
      info.metrics = [
        metric('Empfindlichkeit dafür', organPercent(values[best]),
               'Hohe Werte bedeuten, dass der bevorzugte Duft stark auf die Riechzellen wirkt.'),
        response
      ];
    } else if (k === 2) {
      info.hero = organNumber(d.p[45], 2) + ' px/Schritt';
      info.caption =
          'Wasserbewegung relativ zur Haut · einschließlich Eigenbewegung und Kielwasser';
      info.graphic = 'direction';
      info.receptors = rec;
      info.metrics = [
        metric('Drehung gerade',
               organNumber(Math.abs(d.b.turn || 0) * 180 / Math.PI, 1) + '°/Schritt',
               'Auch Drehungen bewegen Wasser relativ zu den Rezeptoren.'),
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
      info.hero = contact > 0 ? 'Berührt etwas' : 'Kein Kontakt';
      info.caption = 'Berührung und Sedimentkontakt · der stärkere örtliche Reiz zählt';
      info.graphic = 'touch';
      info.fill = brainClamp(contact);
      info.metrics = [ response ];
    } else if (k === 4) {
      info.hero = organPercent(activity) + ' Nähe';
      info.caption = 'Sichtbare Flächen · Entfernung und empfangenes Licht';
      info.graphic = 'direction';
      info.receptors = rec;
      info.metrics = [ response ];
    } else if (k === 5) {
      info.hero = organNumber(d.b.nutrient_flow, 2) + ' Energie/Schritt';
      info.caption = 'Meldet verwertbare Aufnahme unmittelbar beim Schlucken';
      info.graphic = 'feeding';
      info.series = d.b.nutrient_flow || 0;
      info.metrics = [
        response, metric('Verwertbare Aufnahme',
                         organNumber(sceneState.frame.selected_nutrition) + ' Energie',
                         'Beim Schlucken verdauliche Energie seit dem Schlupf.')
      ];
    } else if (k === 6) {
      info.hero = organPercent(d.p[23]) + ' Gesundheit';
      info.caption = 'Örtlicher Gewebeschaden · erbliche Adaptation';
      info.graphic = 'health';
      info.fill = d.p[23];
      info.metrics = [
        metric('Verbleibende Schwimmkraft',
               organPercent(1 - (params.wound_weakness ?? .5) * (1 - d.p[23])),
               'Verletzungen schwächen Vortrieb und Drehung.'),
        response
      ];
      info.series = 1 - d.p[23];
    } else if (k === 8 || k === 9) {
      const targets = [...new Set(rec.map(r => r[22])) ],
            names = [ 'Darm', 'Ei', 'Sperma', 'Schwimmblase', 'Muskel' ];
      info.hero = targets.map(t => names[t]).filter(Boolean).join(' · ');
      info.caption = 'Druck am räumlich zugeordneten Organ';
      info.graphic = 'signal';
      info.series = activity;
      info.metrics = [ response ];
    } else if (k === 10) {
      const h = d.b.hormones,
            names = [...Array.from({length : 4}, (_, c) => hormoneName(h, c)), 'Reife', 'Reserve' ];
      info.hero = 'Blut';
      info.caption = 'Hormone, Reife und Reserve · erbliche Abstimmung';
      info.graphic = 'signal';
      info.metrics = [
        response,
        ...names.map((name, c) => metric(
                         name, organPercent(rec.reduce((sum, r) => sum + (r[21]?.[c] || 0), 0) /
                                            Math.max(1, rec.length))))
      ];
    } else {
      info.hero = organPercent(d.p[1] / sceneState.frame.height) + ' Tiefe';
      info.caption = 'Oberfläche 0 % · Beckenboden 100 %';
      info.graphic = 'depth';
      info.fill = d.p[1] / sceneState.frame.height;
      info.metrics = [
        metric('Position',
               organNumber(d.p[1]) + ' / ' + organNumber(sceneState.frame.height) + ' px'),
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
    organNumber = (v, d = 1) => Number(v || 0).toLocaleString('de', {maximumFractionDigits : d});
  },
  "organPercent" : () => { organPercent = v => Math.round(100 * brainClamp(v)) + ' %'; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
