import {MOTOR_KIND, SENSE_KIND} from './schema.js';
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
// Organs drawn apart from the sense they belong to.
export const VARIANT_SENSE =
    Object.freeze({[BARBEL] : SENSE_TISSUE.odor, [GRAVITY] : SENSE_TISSUE.flow});
