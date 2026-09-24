/**
 * Imprimer un document, sans ouvrir de fenêtre.
 *
 * Une page ouverte depuis un disque ne peut pas écrire un PDF elle-même :
 * seul le navigateur sait le faire, par sa fenêtre d'impression, où
 * « Enregistrer au format PDF » figure parmi les imprimantes.
 *
 * Restait à lui donner le document. `window.open` semblait la voie
 * naturelle — c'en est une mauvaise. Un navigateur bloque volontiers une
 * fenêtre surgissante, et il le fait souvent sans rien dire : le bouton ne
 * répond pas, l'agence croit l'outil cassé. Sur un fichier ouvert depuis le
 * disque, c'est le cas le plus fréquent.
 *
 * Un cadre dans la page, lui, ne se bloque pas. Il porte son propre
 * document, avec ses propres réglages de papier, et s'imprime seul : la
 * page qui l'héberge ne part pas à l'impression avec lui.
 *
 * Module sans dépendance, appelé par l'éditeur comme par le facturier.
 */

/**
 * Attendre que les images d'un document soient décodées.
 *
 * Imprimer un dossier dont les photos ne sont pas encore décodées rend des
 * cadres vides. `decode()` échoue sur une image cassée : on l'avale, une
 * image manquante ne doit pas retenir tout le document.
 */
async function imagesPretes(doc, delaiMax = 8000) {
  const images = doc ? [...doc.images] : [];
  if (!images.length) return;
  const attente = Promise.all(images.map((i) => (i.decode ? i.decode().catch(() => {})
    : Promise.resolve())));
  await Promise.race([attente, new Promise((r) => { setTimeout(r, delaiMax); })]);
}

/**
 * Poser un document dans un cadre, et attendre qu'il soit prêt à imprimer.
 *
 * `srcdoc` plutôt que `document.write` : le document hérite de l'origine de
 * la page, y compris quand celle-ci est ouverte depuis un disque, et le
 * cadre reste accessible.
 */
export async function poser(cadre, html) {
  await new Promise((resolve) => {
    cadre.addEventListener('load', resolve, { once: true });
    cadre.srcdoc = html;
  });
  await imagesPretes(cadre.contentDocument);
}

/**
 * Envoyer à l'impression le document d'un cadre.
 *
 * @returns {boolean} faux si le navigateur n'a pas voulu
 */
export function imprimerCadre(cadre) {
  const fen = cadre && cadre.contentWindow;
  if (!fen) return false;
  try {
    fen.focus();
    fen.print();
    return true;
  } catch (e) {
    return false;
  }
}

/** Le cadre caché, pour les documents qui n'ont pas d'aperçu à l'écran. */
function cadreCache() {
  let f = document.getElementById('cadre-impression');
  if (!f) {
    f = document.createElement('iframe');
    f.id = 'cadre-impression';
    /*
     * Hors de l'écran plutôt que `display:none` : un cadre masqué ne met pas
     * son contenu en page, et l'impression sortirait vide ou mal coupée.
     */
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;'
      + 'border:0;visibility:hidden;';
    document.body.appendChild(f);
  }
  return f;
}

/**
 * Imprimer un document HTML complet, sans aperçu.
 *
 * @param {string} html le document, entier, avec ses styles et son `@page`
 * @returns {Promise<boolean>} faux si le navigateur n'a pas voulu imprimer
 */
export async function imprimer(html) {
  const f = cadreCache();
  await poser(f, html);
  return imprimerCadre(f);
}

/**
 * Enregistrer un document sur le disque.
 *
 * Le filet de sécurité : si l'impression ne part pas, le document doit
 * quand même pouvoir sortir de l'outil.
 */
export function telecharger(nom, texte, type = 'text/html;charset=utf-8') {
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([texte], { type }));
  lien.download = nom;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}
