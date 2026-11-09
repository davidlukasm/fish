import {PRESSURE_SOURCE} from './schema.js';
import {
  BARBEL,
  GUT_TISSUE,
  INTERNAL_TISSUE,
  MOTOR_TISSUE,
  RESERVE_TISSUE,
  SENSE_TISSUE,
  sidedTissue
} from './tissue.js';

export const ORGAN_ICONS = {
  [SENSE_TISSUE.light] :
      'M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  [SENSE_TISSUE.odor] :
      'M8 15a3 3 0 1 0 .01 0M16 15a3 3 0 1 0 .01 0M6 8c2-2 4-2 6 0s4 2 6 0M6 4c2-2 4-2 6 0s4 2 6 0',
  [BARBEL] : 'M12 6v4M12 10c-2 3-5 4-8 9M12 10c2 3 5 4 8 9',
  [SENSE_TISSUE.flow] : 'M2 12h3M7 12h3M12 12h3M17 12h3M4 8c5-3 11-3 16 0M4 16c5 3 11 3 16 0',
  [SENSE_TISSUE.touch] : 'M5 5h14v14H5zM9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01',
  [SENSE_TISSUE.proximity] :
      'M12 13h.01M8.5 9.5a5 5 0 0 1 7 0M5.5 6.5a9 9 0 0 1 13 0M8.5 16.5a5 5 0 0 0 7 0',
  [SENSE_TISSUE.intake] : 'M4 5h16l-6 7v7h-4v-7z',
  [SENSE_TISSUE.damage] : 'M13 2L6 13h5l-2 9 8-12h-5z',
  [SENSE_TISSUE.bladder_pressure] : 'M12 3v15M7 13l5 5 5-5M5 21h14',
  [sidedTissue(SENSE_TISSUE.gonad_pressure, PRESSURE_SOURCE.eggs)] :
      'M12 4c4 0 6 6 6 10a6 6 0 0 1-12 0c0-4 2-10 6-10zM2 13h2M20 13h2',
  [sidedTissue(SENSE_TISSUE.gonad_pressure, PRESSURE_SOURCE.sperm)] :
      'M8 13a3 3 0 1 0 .01 0M10.5 11c1.5-3 3.5-3 4.5-1s3 2 5-1M2 13h1',
  [SENSE_TISSUE.inner_pressure] : 'M12 4a8 8 0 1 0 .01 0M12 12l4-4M8 16h8',
  [SENSE_TISSUE.blood] : 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  [MOTOR_TISSUE.forward] : 'M3 12c4-4 8-4 11 0-3 4-7 4-11 0zM14 12l7-6v12z',
  [MOTOR_TISSUE.turn] : 'M5 15a7 7 0 1 1 7 6M12 21l-3-3M12 21l3-2',
  [MOTOR_TISSUE.suction] : 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4 12h5M20 12h-5M12 4v5M12 20v-5',
  [MOTOR_TISSUE.eggs] : 'M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11z',
  [MOTOR_TISSUE.sperm] :
      'M8 8a3 3 0 1 0 .01 0M8 11c0 4 3 6 8 9M16 4a2 2 0 1 0 .01 0M16 6c1 3 3 4 5 5',
  [MOTOR_TISSUE.aggression] :
      'M3 7c4 6 14 6 18 0M3 17c4-6 14-6 18 0M7 9l1-2 1 2M11 10l1-2 1 2M15 9l1-2 1 2M7 15l1 2 1-2M11 14l1 2 1-2M15 15l1 2 1-2',
  [MOTOR_TISSUE.defense] : 'M3 19l3-9 3 9M10 19l3-12 3 12M17 19l2-7 2 7',
  [MOTOR_TISSUE.pigment] :
      'M6 6a2 2 0 1 0 .01 0M14 5a3 3 0 1 0 .01 0M8 15a3 3 0 1 0 .01 0M17 15a2 2 0 1 0 .01 0',
  [MOTOR_TISSUE.bladder] : 'M12 3a6 7 0 1 0 0 14 6 7 0 0 0 0-14zM12 17v4',
  [MOTOR_TISSUE.gland] :
      'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z',
  [GUT_TISSUE] : 'M5 6h10a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h10',
  [RESERVE_TISSUE] : 'M4 8h14v8H4zM18 11h2v2h-2M7 10v4M10 10v4M13 10v4',
  [INTERNAL_TISSUE] :
      'M6 6a2 2 0 1 0 .01 0M18 6a2 2 0 1 0 .01 0M12 18a2 2 0 1 0 .01 0M6 8l6 8M18 8l-6 8M8 6h8'
};

export const STUDIO_ICON = Object.freeze({
  brain : ORGAN_ICONS[INTERNAL_TISSUE],
  eye : ORGAN_ICONS[SENSE_TISSUE.light],
  nose : ORGAN_ICONS[SENSE_TISSUE.odor],
  proximity : ORGAN_ICONS[SENSE_TISSUE.proximity],
  lateral : ORGAN_ICONS[SENSE_TISSUE.flow],
  touch : ORGAN_ICONS[SENSE_TISSUE.touch],
  pain : ORGAN_ICONS[SENSE_TISSUE.damage],
  blood : ORGAN_ICONS[SENSE_TISSUE.blood],
  gut : ORGAN_ICONS[GUT_TISSUE],
  bladder : ORGAN_ICONS[MOTOR_TISSUE.bladder],
  mouth : ORGAN_ICONS[MOTOR_TISSUE.aggression],
  fin : ORGAN_ICONS[MOTOR_TISSUE.turn],
  tail : ORGAN_ICONS[MOTOR_TISSUE.forward],
  muscle : ORGAN_ICONS[MOTOR_TISSUE.turn],
  defense : ORGAN_ICONS[MOTOR_TISSUE.defense],
  pigment : ORGAN_ICONS[MOTOR_TISSUE.pigment],
  eggs : ORGAN_ICONS[MOTOR_TISSUE.eggs],
  sperm : ORGAN_ICONS[MOTOR_TISSUE.sperm],
  gland : ORGAN_ICONS[MOTOR_TISSUE.gland],
  tectum : 'M4 12c3-5 13-5 16 0-3 5-13 5-16 0zM12 10a2 2 0 1 0 .01 0M12 3v3M12 18v3',
  olfactory : 'M5 9c2-2 4 2 6 0s4 2 6 0M5 14c2-2 4 2 6 0s4 2 6 0M19 7v9',
  hindbrain : 'M12 21v-6a7 7 0 0 1 7-7M16 5l3 3-3 3M12 15a7 7 0 0 0-7-7M8 5L5 8l3 3',
  spinal : 'M12 3v18M8 6h8M8 10h8M8 14h8M8 18h8',
  rhythm : 'M3 12h3l3-7 6 14 3-7h3',
  teaching : 'M4 12h6M14 5v14M14 5l6 7-6 7M8 8v8',
  pallium : 'M12 4l2.2 4.8 5.3.6-3.9 3.6 1 5.2-4.6-2.6-4.6 2.6 1-5.2-3.9-3.6 5.3-.6z',
  torus : 'M4 10c3-3 5 3 8 0s5 3 8 0M4 16c3-3 5 3 8 0s5 3 8 0M17 3l3 3-3 3',
  cerebellum :
      'M4 16h16M5 16c0-5 3-8 7-8s7 3 7 8M8 16c0-3 2-5 4-5s4 2 4 5M11 16c0-1 .5-2 1-2s1 1 1 2',
  hypothalamus : 'M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9zM12 10v5M10 13l2 2 2-2'
});
