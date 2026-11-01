// Tissues are keyed by the organ kind they serve: a sense or motor kind after its prefix, or the
// body's internal tissue. A tissue id adds the side or variant after SIDE_MARK.
import {MOTOR_KIND, SENSE_KIND} from './schema.js';
const SENSE = 's', MOTOR = 'm', SIDE_MARK = ':';
export const INTERNAL_TISSUE = 'internal';
// Body organs without a sense or motor kind, and the barbel variant of the odor tissue.
export const GUT_TISSUE = 'gut', RESERVE_TISSUE = 'reserve', BARBEL = 'barbel';
// The internal tissue's colour in every view.
export const INTERNAL_COLOR = '#a7b6d5';
export const senseTissue = kind => SENSE + kind;
export const motorTissue = kind => MOTOR + kind;
export const isSenseTissue = key => key?.[0] === SENSE;
export const isMotorTissue = key => key?.[0] === MOTOR;
// The sense or motor kind of a tissue key or id.
export const tissueKind = key => Number(tissueBase(key).slice(SENSE.length));
export const sidedTissue = (key, side) => key + SIDE_MARK + side;
export const tissueBase = id => id.split(SIDE_MARK)[0];
export const tissueSide = id => id.split(SIDE_MARK)[1];
const named = (kinds, key) => Object.freeze(
    Object.fromEntries(Object.entries(kinds).map(([ name, kind ]) => [name, key(kind)])));
export const SENSE_TISSUE = named(SENSE_KIND, senseTissue);
export const MOTOR_TISSUE = named(MOTOR_KIND, motorTissue);
