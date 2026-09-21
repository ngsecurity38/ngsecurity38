/**
 * Le projet complet : la vidéosurveillance et l'alarme, ensemble.
 *
 * Les deux études vivent sur deux pages, et c'est juste — les questions n'ont
 * rien à voir. Mais le client, lui, n'a qu'un seul projet : il protège un
 * lieu. Tant que les deux pages s'ignorent, il remplit deux formulaires, en
 * ressort avec deux estimations séparées, et l'agence reçoit deux demandes au
 * lieu d'un chantier.
 *
 * Ce module les recoud. Chaque page dépose son résultat dans un rangement
 * commun ; celle qui s'ouvre ensuite y trouve l'autre volet et propose le
 * total des deux.
 *
 * DEUX RÈGLES D'HONNÊTETÉ, tenues par `combiner()` :
 *
 * - un volet non chiffré ne disparaît pas du total, il le rend PARTIEL, et
 *   le dire est obligatoire. Additionner ce qui est chiffré et présenter la
 *   somme comme le prix du projet serait un mensonge par omission ;
 * - une étude vieille de plusieurs semaines est signalée. Un client qui
 *   revient en février sur une estimation d'octobre doit savoir qu'elle date,
 *   sinon il la croit valable et l'agence hérite du malentendu.
 *
 * Rien ne quitte l'appareil du visiteur : le rangement est celui du
 * navigateur, et les deux pages y accèdent parce qu'elles sont servies par le
 * même domaine.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

/*
 * Le même formateur que les deux devis.
 *
 * `toFixed(2)` sur le flottant brut donnait 1590,49 € au courriel là où
 * l'écran affichait 1 590,50 € : deux chiffres différents pour la même
 * estimation, dans le même envoi. Un client qui le remarque a raison de
 * douter du reste.
 */
import { euros } from './prix.js';

/** Le rangement commun aux deux pages. */
export const CLE_ENSEMBLE = 'ngsecurity-projet-complet';

/**
 * Les deux volets d'un projet.
 *
 * `page` est relative : les deux pages se trouvent qu'elles soient servies à
 * la racine d'un domaine, sous un sous-dossier ou dans un cadre.
 */
export const VOLETS = {
  video: {
    cle: 'video',
    label: 'Vidéosurveillance',
    page: '../devis/',
    invitation: 'Savoir combien de caméras il vous faut, et ce que cela coûte',
  },
  alarme: {
    cle: 'alarme',
    label: 'Alarme anti-intrusion',
    page: '../alarme/',
    invitation: 'Savoir combien de détecteurs il vous faut, et à quels endroits',
  },
};

/** Au-delà, une étude enregistrée mérite d'être refaite. */
export const JOURS_PEREMPTION = 30;

/** Âge d'une étude, en jours. `null` si la date est absente ou illisible. */
export function anciennete(volet, maintenant = Date.now()) {
  const t = Date.parse(volet?.enregistreLe || '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((maintenant - t) / 86400000));
}

/**
 * Réunit les volets connus.
 *
 * @param {object} volets rangement { video, alarme }
 * @returns {{volets: object[], manquants: object[], totalHt: number,
 *   totalTtc: number, chiffre: boolean, partiel: boolean, nonChiffres: string[]}}
 */
export function combiner(volets = {}, maintenant = Date.now()) {
  const liste = Object.keys(VOLETS)
    .map((cle) => volets?.[cle])
    .filter((v) => v && VOLETS[v.cle])
    .map((v) => ({ ...v, jours: anciennete(v, maintenant) }));

  const chiffres = liste.filter((v) => v.chiffre && v.totalTtc > 0);
  const nonChiffres = liste.filter((v) => !(v.chiffre && v.totalTtc > 0));

  return {
    volets: liste,
    // Ce qu'il reste à faire — c'est ce qui se propose au visiteur.
    manquants: Object.values(VOLETS).filter((d) => !liste.some((v) => v.cle === d.cle)),
    totalHt: chiffres.reduce((s, v) => s + (Number(v.totalHt) || 0), 0),
    totalTtc: chiffres.reduce((s, v) => s + (Number(v.totalTtc) || 0), 0),
    /** Tous les volets présents portent un prix. */
    chiffre: liste.length > 0 && nonChiffres.length === 0,
    /** Une partie seulement est chiffrée : le total ne vaut pas pour le projet. */
    partiel: chiffres.length > 0 && nonChiffres.length > 0,
    nonChiffres: nonChiffres.map((v) => VOLETS[v.cle].label),
    /** Les études qui ont pris de l'âge. */
    anciens: liste.filter((v) => v.jours !== null && v.jours > JOURS_PEREMPTION),
    /** Les deux volets sont là : c'est un projet, plus une estimation. */
    complet: liste.length >= Object.keys(VOLETS).length,
  };
}

/**
 * Le récapitulatif à joindre à une demande.
 *
 * Une seule demande pour les deux volets : l'agence voit le chantier entier,
 * et le client n'écrit qu'une fois.
 */
export function texteEnsemble(ens) {
  if (!ens || !ens.volets.length) return [];
  const lignes = ['', 'PROJET COMPLET'];
  for (const v of ens.volets) {
    lignes.push(`- ${VOLETS[v.cle].label} : ${v.resume || 'étude enregistrée'}`);
    if (v.chiffre && v.totalTtc > 0) {
      lignes.push(`  estimation : ${euros(v.totalTtc)} TTC`);
    } else {
      lignes.push('  estimation : non chiffrée sur le site');
    }
    if (v.jours !== null && v.jours > JOURS_PEREMPTION) {
      lignes.push(`  (étude enregistrée il y a ${v.jours} jours)`);
    }
  }
  /*
   * Pas de total quand il n'y a qu'un volet : « total des deux volets » sous
   * une seule étude se lit comme une erreur de calcul, et la ligne du volet
   * porte déjà son montant.
   */
  if (ens.volets.length < 2) return lignes;
  if (ens.chiffre) {
    lignes.push(`Total des deux volets : ${euros(ens.totalTtc)} TTC.`);
  } else if (ens.partiel) {
    lignes.push(`Total partiel : ${euros(ens.totalTtc)} TTC — `
      + `${ens.nonChiffres.join(' et ')} restant à chiffrer.`);
  }
  return lignes;
}

/* ------------------------------------------------------- le rangement */

/**
 * Lit le rangement commun.
 *
 * Il peut être inaccessible — navigation privée, cookies bloqués — ou
 * contenir n'importe quoi : c'est une donnée que l'on n'a pas écrite soi-même
 * dans cette page. Une lecture qui échoue rend un projet vide, jamais une
 * erreur : la page doit fonctionner sans.
 */
export function lireVolets(rangement = globalThis.localStorage) {
  try {
    const brut = rangement?.getItem(CLE_ENSEMBLE);
    if (!brut) return {};
    const lu = JSON.parse(brut);
    return lu && typeof lu === 'object' && !Array.isArray(lu) ? lu : {};
  } catch {
    return {};
  }
}

/**
 * Dépose le volet de la page courante, sans toucher à l'autre.
 *
 * @returns {object} le rangement tel qu'il vient d'être écrit
 */
export function noterVolet(cle, volet, rangement = globalThis.localStorage) {
  if (!VOLETS[cle]) return lireVolets(rangement);
  const tout = lireVolets(rangement);
  tout[cle] = {
    cle,
    resume: String(volet?.resume || '').slice(0, 400),
    lignes: (volet?.lignes || []).slice(0, 40)
      .map((l) => ({ role: String(l.role || ''), quantite: Number(l.quantite) || 0 })),
    totalHt: Number(volet?.totalHt) || 0,
    totalTtc: Number(volet?.totalTtc) || 0,
    chiffre: !!volet?.chiffre,
    enregistreLe: new Date().toISOString(),
  };
  try {
    rangement?.setItem(CLE_ENSEMBLE, JSON.stringify(tout));
  } catch {
    // Rangement plein ou refusé : la page marche, le rapprochement non.
  }
  return tout;
}
