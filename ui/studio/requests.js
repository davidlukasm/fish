import {ROUTE} from '../schema.js';

// The Atelier's route, a request to it by operation, and how long the engine may take to answer
// (ms): usually, and when it develops or runs the fish.
export const API = ROUTE.atelier;
export const requestBody = (operation, extra = {}) => ({operation, ...extra});
export const API_WAIT = Object.freeze({usual : 35000, long : 60000});
// A genome file's name ends in GENOME_SUFFIX.
export const GENOME_SUFFIX = '.genome';
