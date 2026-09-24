/**
 * Le coffre : ce que l'outil garde tout seul, sur l'ordinateur.
 *
 * L'éditeur n'enregistrait rien. Tout vivait en mémoire jusqu'au clic sur
 * « Enregistrer etude.json » ; un onglet fermé, une mise à jour du
 * navigateur, une coupure de courant, et une demi-journée de relevé
 * partait. L'avertissement au moment de fermer ne protège que du départ
 * volontaire, et les navigateurs le rendent de plus en plus discret.
 *
 * Le stockage local ordinaire ne suffit pas ici : une étude porte ses
 * photos, et pèse plusieurs mégaoctets. `localStorage` plafonne autour de
 * cinq, et il rend son refus par une exception au pire moment. IndexedDB
 * n'a pas cette limite. Il est plus bavard à écrire, d'où ce module, qui le
 * réduit à trois verbes.
 *
 * Rien ne sort de la machine. Le coffre n'est pas une sauvegarde : c'est un
 * filet. Le fichier enregistré reste la seule copie qu'on emporte.
 */

const BASE = 'ngs38';
const TABLE = 'travaux';

/** La base, ouverte une fois. `null` quand le navigateur n'en veut pas. */
let promesse = null;

function base() {
  if (promesse) return promesse;
  promesse = new Promise((resolve) => {
    let requete;
    try {
      requete = indexedDB.open(BASE, 1);
    } catch (e) {
      resolve(null);
      return;
    }
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains(TABLE)) db.createObjectStore(TABLE);
    };
    requete.onsuccess = () => resolve(requete.result);
    // Navigation privée, stockage refusé : on rend null, l'outil continue.
    requete.onerror = () => resolve(null);
    requete.onblocked = () => resolve(null);
  });
  return promesse;
}

/** Une transaction, réduite à sa promesse de résultat. */
function transiger(mode, faire) {
  return base().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      let t;
      try {
        t = db.transaction(TABLE, mode);
      } catch (e) {
        resolve(null);
        return;
      }
      const r = faire(t.objectStore(TABLE));
      t.oncomplete = () => resolve(r ? r.result : true);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    });
  }).catch(() => null);
}

/**
 * Garder un travail en cours.
 *
 * La date est posée ici, pas par l'appelant : c'est elle qui permettra de
 * dire « votre travail du 24 septembre à 18 h 40 » au lieu d'un « reprendre »
 * sans âge, qu'on n'ose jamais cliquer.
 *
 * @returns {Promise<boolean>} faux si le navigateur n'a rien gardé
 */
export async function garder(cle, valeur) {
  const paquet = { valeur, date: new Date().toISOString() };
  const r = await transiger('readwrite', (t) => t.put(paquet, cle));
  return r !== null;
}

/**
 * Reprendre un travail gardé.
 *
 * @returns {Promise<{valeur: *, date: string}|null>}
 */
export async function reprendre(cle) {
  const r = await transiger('readonly', (t) => t.get(cle));
  return r && typeof r === 'object' && 'valeur' in r ? r : null;
}

/** Oublier un travail : l'agence repart de l'étude d'origine. */
export async function oublier(cle) {
  await transiger('readwrite', (t) => t.delete(cle));
}

/**
 * Une fonction qui attend que la main se pose.
 *
 * Garder à chaque flèche du clavier écrirait quarante fois par seconde une
 * étude de quatre mégaoctets. On attend le calme.
 */
export function apaiser(fn, delai = 1200) {
  let minuteur = null;
  return (...args) => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => fn(...args), delai);
  };
}
