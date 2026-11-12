import {ROUTE} from '../schema.js';

export const API = ROUTE.atelier;
export const requestBody = (operation, extra = {}) => ({operation, ...extra});
export const API_WAIT = Object.freeze({usual : 35000, long : 60000});
export const GENOME_SUFFIX = '.genome';
