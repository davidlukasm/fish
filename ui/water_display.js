import {RGB} from './schema.js';

export const OBSERVER_LIGHT = .4;

export const SEDIMENT_MASK = Object.freeze({gap : .02, cache : 4, resolution : 2});

// The veil every distant view fades into for the fish eyes.
export const waterVeil = parameters =>
    Object.keys(RGB).map(channel => parameters['vision_water_' + channel]);
