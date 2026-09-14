/** Raccourcis de sélection, partagés par les modules d'interface. */

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];

/** Charge un script à la demande : les gros moteurs ne sont montés qu'au besoin. */
export function chargerScript(src) {
  return new Promise((resoudre, rejeter) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resoudre;
    s.onerror = () => rejeter(new Error(`Fichier introuvable : ${src}`));
    document.head.append(s);
  });
}
