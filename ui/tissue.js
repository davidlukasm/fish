import {EFFECTOR, MOTOR_KIND, ORGAN_PORT, SENSE_KIND, STROKE_KIND} from './schema.js';
const SENSE = 's', MOTOR = 'm', SIDE_MARK = ':';
export const INTERNAL_TISSUE = 'internal';
export const GUT_TISSUE = 'gut', RESERVE_TISSUE = 'reserve', BARBEL = 'barbel';
// Gravity cells are flow cells inside the body: the balance organ.
export const GRAVITY = 'gravity';
export const INTERNAL_COLOR = '#a7b6d5';
export const senseTissue = kind => SENSE + kind;
export const motorTissue = kind => MOTOR + kind;
export const isSenseTissue = key => key?.[0] === SENSE;
export const isMotorTissue = key => key?.[0] === MOTOR;
export const tissueKind = key => Number(tissueBase(key).slice(SENSE.length));
export const sidedTissue = (key, side) => key + SIDE_MARK + side;
export const tissueBase = id => id.split(SIDE_MARK)[0];
export const tissueSide = id => id.split(SIDE_MARK)[1];
const named = (kinds, key) => Object.freeze(
    Object.fromEntries(Object.entries(kinds).map(([ name, kind ]) => [name, key(kind)])));
export const SENSE_TISSUE = named(SENSE_KIND, senseTissue);
export const MOTOR_TISSUE = named(MOTOR_KIND, motorTissue);
// Gill pumps are suction cells and the gut muscle fin cells; they act on organs of their own.
export const GILL = 'gill', GUT_MUSCLE = 'gutmuscle';
// Organs drawn apart from the sense or muscle they belong to.
export const VARIANT_TISSUE = Object.freeze({
  [BARBEL] : SENSE_TISSUE.odor,
  [GRAVITY] : SENSE_TISSUE.flow,
  [GILL] : MOTOR_TISSUE.suction,
  [GUT_MUSCLE] : MOTOR_TISSUE.turn
});
const VARIANT_MUSCLES = Object.freeze([
  {variant : GILL, kind : MOTOR_KIND.suction, port : ORGAN_PORT.gills, stroke : STROKE_KIND.gill},
  {variant : GUT_MUSCLE, kind : MOTOR_KIND.turn, port : ORGAN_PORT.gut, stroke : STROKE_KIND.gut}
]);
export const portVariant = port => VARIANT_MUSCLES.find(m => m.port === port);
// The organ a muscle cell drives, read from the port its effectors act on.
export const motorVariant = (key, effectors) =>
    VARIANT_MUSCLES
        .find(m => VARIANT_TISSUE[m.variant] === key &&
                   effectors?.some(e => e[EFFECTOR.port] === m.port))
        ?.variant ??
    '';
export const variantPort = variant => VARIANT_MUSCLES.find(m => m.variant === variant)?.port;
export const variantStroke = variant => VARIANT_MUSCLES.find(m => m.variant === variant)?.stroke;
