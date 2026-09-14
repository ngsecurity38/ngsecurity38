/** Raccourcis de sélection, partagés par les modules d'interface. */

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];
