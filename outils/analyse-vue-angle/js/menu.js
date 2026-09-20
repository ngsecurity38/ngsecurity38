/**
 * Le menu du site, porté par les pages d'outil.
 *
 * Les deux pages sont servies sous /outils/ par un conteneur séparé du site :
 * elles sont bien SUR le domaine, mais elles ne traversent pas l'application
 * qui construit le menu et le pied des autres pages. Sans rien, le visiteur
 * qui arrive ici se retrouve sur une page orpheline — même adresse, même
 * marque, et pourtant plus aucun moyen d'aller ailleurs qu'en revenant en
 * arrière. C'est ce que le bandeau ci-dessous répare.
 *
 * Il ne cherche pas à recopier le menu du site au lien près : il ne peut pas
 * deviner les adresses internes de l'application. Il porte donc ce dont on
 * est sûr — l'accueil, les deux outils, la boutique — et se laisse remplacer
 * par `menu.json`, posé une seule fois dans /outils/ et relu à chaque
 * ouverture. Ajouter une entrée ne demande alors ni reconstruction ni renvoi
 * des pages.
 */

/**
 * Le menu par défaut.
 *
 * Seules y figurent des adresses vérifiées. Inventer « /alarme-ajax/ » parce
 * que le site parle d'Ajax produirait un lien mort, et un lien mort dans un
 * menu coûte plus cher que son absence.
 */
export const MENU_DEFAUT = {
  marque: { court: 'NGS38', long: 'Sécurité & vidéosurveillance', href: '/' },
  liens: [
    { texte: 'Nos produits', href: '/' },
    { texte: 'Quelle caméra vous faut-il ?', href: '/outils/etude/' },
    { texte: 'Estimer mes caméras', href: '/outils/devis/' },
    { texte: 'Alarme anti-intrusion', href: '/outils/alarme/' },
  ],
  ailleurs: { texte: 'La boutique .com', href: 'https://ngsecurity38.com/' },
};

/**
 * Ramène un chemin à une forme comparable.
 *
 * « /outils/etude », « /outils/etude/ » et « /outils/etude/index.html »
 * désignent la même page : sans cette mise à plat, l'entrée du menu
 * correspondant à la page ouverte ne se reconnaîtrait pas elle-même une fois
 * sur deux, selon la façon dont le serveur a résolu l'adresse.
 */
export function memePage(a, b) {
  const plat = (href) => {
    if (!href) return '';
    const sans = String(href).split(/[?#]/)[0].replace(/index\.html?$/i, '');
    return (sans.endsWith('/') ? sans : `${sans}/`).toLowerCase();
  };
  const x = plat(a);
  return !!x && x === plat(b);
}

/**
 * Les entrées à afficher, celle de la page ouverte signalée.
 *
 * Séparée de l'affichage pour être vérifiable sans navigateur : c'est la
 * partie où l'on se trompe.
 */
export function entreesMenu(menu, chemin) {
  const m = menu && Array.isArray(menu.liens) && menu.liens.length ? menu : MENU_DEFAUT;
  return m.liens
    .filter((l) => l && l.texte && l.href)
    .map((l) => ({ texte: l.texte, href: l.href, courant: memePage(l.href, chemin) }));
}

/** Le lien vers l'autre domaine, s'il y en a un. */
export const lienAilleurs = (menu) => {
  const a = (menu && 'ailleurs' in menu ? menu.ailleurs : MENU_DEFAUT.ailleurs);
  return a && a.texte && a.href ? a : null;
};

/* ------------------------------------------------------------- affichage */

const el = (balise, classe, texte) => {
  const n = document.createElement(balise);
  if (classe) n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
};

/**
 * Monte le bandeau dans l'élément qui l'attend.
 *
 * Construit pièce par pièce plutôt qu'en assemblant du HTML : les libellés
 * viennent d'un fichier que l'on édite à la main, et une apostrophe typée de
 * travers ne doit pas pouvoir devenir du balisage.
 */
export function poserMenu(hote, menu, chemin) {
  if (!hote) return null;
  const m = menu && Array.isArray(menu.liens) && menu.liens.length ? menu : MENU_DEFAUT;
  const entrees = entreesMenu(m, chemin);
  const marque = m.marque || MENU_DEFAUT.marque;

  const dedans = el('div', 'dedans');

  const mot = el('a', 'mot');
  mot.href = marque.href || '/';
  mot.append(el('b', null, marque.court || ''), el('i'), el('span', null, marque.long || ''));
  dedans.append(mot);

  const pages = el('ul', 'pages');
  for (const e of entrees) {
    const li = el('li');
    if (e.courant) {
      /*
       * La page ouverte ne se relie pas à elle-même. Sur la page d'estimation,
       * un clic distrait sur son propre nom rechargerait la page et effacerait
       * les réponses et les photos déjà saisies.
       */
      const ici = el('span', 'courant', e.texte);
      ici.setAttribute('aria-current', 'page');
      li.append(ici);
    } else {
      const a = el('a', null, e.texte);
      a.href = e.href;
      li.append(a);
    }
    pages.append(li);
  }
  dedans.append(pages);

  const ailleurs = lienAilleurs(m);
  if (ailleurs) {
    const a = el('a', 'ailleurs', ailleurs.texte);
    a.href = ailleurs.href;
    a.rel = 'noopener';
    dedans.append(a);
  }

  hote.replaceChildren(dedans);
  hote.hidden = false;
  return entrees;
}

/**
 * Va chercher `menu.json`, un cran au-dessus des deux pages.
 *
 * Un seul fichier pour /outils/etude/ et /outils/devis/ : un menu que l'on
 * modifierait à deux endroits finirait par différer d'une page à l'autre.
 *
 * Collée dans une page existante, la page n'en veut pas : le site qui
 * l'accueille porte déjà son propre menu.
 */
export async function chargerMenu() {
  if (globalThis.__ngsMenu) return globalThis.__ngsMenu;
  if (globalThis.__ngsIntegre || globalThis.location?.protocol === 'file:') return null;
  try {
    const r = await fetch('../menu.json', { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch {
    // Absent : le menu par défaut fait l'affaire.
  }
  return null;
}
