/** Raccourcis de sélection, partagés par les modules d'interface. */

/**
 * Racine de recherche des éléments.
 *
 * `document` sur une page servie telle quelle. Collées dans un site existant
 * — une page WordPress, par exemple — les pages vivent dans une racine
 * d'ombre : le style du thème ne les atteint pas, et le leur ne déborde pas
 * sur le site. Les sélecteurs doivent alors chercher là, et non dans le
 * document entier où ils ne trouveraient rien.
 *
 * Le bloc collé pose `__ngsRacine` avant de charger le code ; d'où la lecture
 * au chargement plutôt qu'un appel que l'ordre des modules rendrait fragile.
 */
let racine = globalThis.__ngsRacine || document;

/** Change la racine — utile aux tests, et à qui monte la page à la main. */
export const dansRacine = (r) => { racine = r || document; };

export const $ = (sel) => racine.querySelector(sel);
export const $$ = (sel) => [...racine.querySelectorAll(sel)];

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
