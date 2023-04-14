import { NOTEBOOK_TYPE } from "./extension";

export const configurationSchema = require('./resources/settings.json');

export class BoostConfiguration {
    static readonly defaultOutputLanguage = NOTEBOOK_TYPE + '.outputLanguage';
}