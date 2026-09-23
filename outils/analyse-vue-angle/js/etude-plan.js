/**
 * Le plan d'une étude, et ce qui s'en déduit.
 *
 * Un même calcul sert à deux choses qui ne doivent jamais diverger : le
 * dossier remis au client, et l'éditeur où l'agence déplace ses caméras.
 * Si l'éditeur annonçait sept cent quarante mètres de câble là où le
 * dossier en compte huit cents, aucun des deux ne vaudrait plus rien.
 *
 * Le module ne connaît ni fichier ni écran. Il prend une étude — un objet
 * décrivant un site, des caméras, des coffrets, des accès — et rend la
 * géométrie du plan puis le métré qui va avec.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { cheminement, verdictEthernet, bobines, RESERVE_BOUT } from './cable.js';
import { debitEstime, capaciteNecessaire, disquesPourBaies } from './stockage.js';

/**
 * La géométrie du terrain, en mètres, origine en haut à gauche.
 *
 * Tout est proportionnel à la longueur du bâtiment, sauf ce que le relevé
 * fixe. C'est la seule façon d'avoir un plan qui se recale d'un chiffre le
 * jour où une cote réelle arrive.
 */
export function geometrie(site) {
  const b = site.longueurBatiment;
  const p = site.profondeurBatiment;
  const m = site.marge;
  const bat = { x: m, y: m, l: b, p };
  const annexe = {
    x: bat.x + bat.l, y: bat.y, l: site.annexe.longueur, p: site.annexe.profondeur,
  };
  const cour = {
    x: 0, y: bat.y + bat.p, l: bat.l + annexe.l + m * 2, p: site.cour.profondeur,
  };
  return {
    bat,
    annexe,
    cour,
    quai: { x: bat.x + bat.l * 0.3, y: bat.y + bat.p, l: bat.l * 0.65, p: 3.5 },
    portail: { x: m * 0.4, y: cour.y + cour.p - 6, l: 7 },
    largeur: cour.l,
    hauteur: cour.y + cour.p + 4,
  };
}

/** L'optique qui compte : un capteur unique pour un panoramique multi-objectifs. */
export const optiqueUtile = (m, tele = false) => (
  m.capteurUnique
    ? m.capteurUnique
    : { resH: m.resH, angleH: tele && m.angleHTele ? m.angleHTele : m.angleH }
);

/**
 * Le champ d'une caméra reporté sur une photo.
 *
 * Une photo n'est pas une fenêtre neutre : elle a son propre angle. Reporter
 * un champ de 100° sur une image qui en couvre 53 sans en tenir compte
 * donnerait une bande deux fois trop étroite, et un client à qui l'on aurait
 * promis ce qu'il ne verra pas.
 *
 * Le rapport se prend sur les TANGENTES des demi-angles, jamais sur les
 * angles eux-mêmes : une image est une projection, pas un rapporteur.
 *
 * @param {number} champPhoto angle horizontal de la photo, en degrés
 * @param {number} champCamera angle horizontal de la caméra, en degrés
 * @param {number} bande position visée dans l'image, de 0 (gauche) à 1
 * @returns {{gauche:number, largeur:number, deborde:boolean, part:number}}
 */
export function bandePhoto(champPhoto, champCamera, bande = 0.5) {
  const t = (a) => Math.tan((a * Math.PI) / 360);
  if (!(champPhoto > 0) || !(champCamera > 0)) {
    return { gauche: 0, largeur: 0, deborde: false, part: 0 };
  }
  const part = t(champCamera) / t(champPhoto);
  const largeur = Math.min(1, part);
  const centre = Math.min(1, Math.max(0, bande));
  return {
    // La bande reste dans l'image : une caméra visant le bord ne dessine
    // pas la moitié de son champ dans le vide.
    gauche: Math.min(1 - largeur, Math.max(0, centre - largeur / 2)),
    largeur,
    deborde: part > 1,
    part,
  };
}

/**
 * Le métré, liaison par liaison.
 *
 * Chaque longueur passe par `cheminement` : somme des écarts du plan — un
 * câble suit les murs et non la diagonale — plus la hauteur de pose, plus
 * la descente vers le local ou le coffret, plus les détours et les
 * réserves. Aucune n'est écrite à la main.
 *
 * @param {object} etude  site, local, cameras, coffrets, acces, modeles
 * @returns {object[]} liaisons, coffrets en tête
 */
export function metre(etude) {
  const { local } = etude;
  const coffrets = Object.fromEntries((etude.coffrets || []).map((r) => [r.cle, r]));
  const liaisons = [];

  const depuis = (origine, x, y, montee) => cheminement({
    dx: x - origine.x,
    dy: y - origine.y,
    montee,
    descente: origine.hauteurChemin ?? origine.hauteur ?? 0,
    reserveBout: RESERVE_BOUT,
  });
  const origineDe = (cle) => (cle && coffrets[cle] ? coffrets[cle] : local);

  const ajouter = (l) => {
    liaisons.push({ ...l, verdict: l.famille === 'video' ? verdictEthernet(l.longueur) : null });
  };

  // Les montantes d'abord : elles portent tout le reste.
  for (const r of etude.coffrets || []) {
    const amont = r.depuis === 'local' ? local : coffrets[r.depuis];
    ajouter({
      repere: r.cle,
      designation: `${r.nom} — liaison montante`,
      cable: 'Cat 6 U/UTP',
      longueur: amont ? depuis(amont, r.x, r.y, r.hauteur) : 0,
      vers: r.depuis,
      famille: 'video',
      montante: true,
    });
  }

  for (const c of etude.cameras || []) {
    const o = origineDe(c.coffret);
    ajouter({
      repere: c.cle,
      designation: c.role,
      cable: 'Cat 6 U/UTP',
      longueur: depuis(o, c.x, c.y, c.hauteur),
      direct: c.coffret ? depuis(local, c.x, c.y, c.hauteur) : null,
      vers: c.coffret || 'local',
      famille: 'video',
    });
  }

  for (const a of etude.acces || []) {
    const o = origineDe(a.coffret);
    const l = depuis(o, a.x, a.y, a.hauteur);
    const direct = a.coffret ? depuis(local, a.x, a.y, a.hauteur) : null;
    if (a.platine) {
      ajouter({
        repere: `${a.cle}·P`,
        designation: `Platine d'interphonie — ${a.nom}`,
        cable: 'Cat 6 U/UTP',
        longueur: l,
        direct,
        vers: a.coffret || 'local',
        famille: 'video',
      });
    }
    for (const [suffixe, quoi, cable, famille] of [
      ['V', 'Alimentation du verrouillage', '2 conducteurs', 'alimentation'],
      ['L', 'Lecteur d\'accès', '6 conducteurs blindés ou 2 paires', 'commande'],
      ['B', 'Bouton de sortie et déverrouillage d\'urgence', '2 × 2 conducteurs', 'commande'],
      ['C', 'Contact de position de porte', '2 conducteurs', 'commande'],
    ]) {
      ajouter({
        repere: `${a.cle}·${suffixe}`,
        designation: `${quoi} — ${a.nom}`,
        cable,
        longueur: l,
        direct,
        vers: a.coffret || 'local',
        famille,
        acces: a,
      });
    }
  }

  /*
   * Le reste : moniteur d'interphonie, borne, tout appareil réseau qui
   * n'est ni caméra ni contrôle d'accès. Il compte dans le métré comme le
   * reste — un câble oublié se retrouve sur la facture.
   */
  for (const o of etude.autres || []) {
    const org = origineDe(o.coffret);
    ajouter({
      repere: o.cle,
      designation: o.designation,
      cable: o.cable || 'Cat 6 U/UTP',
      longueur: depuis(org, o.x, o.y, o.hauteur),
      vers: o.coffret || 'local',
      famille: o.famille || 'video',
    });
  }

  return liaisons;
}

/**
 * Le bilan complet : ce que l'éditeur affiche et ce que le dossier imprime.
 *
 * @param {object} etude
 * @param {object} [options] jours de conservation, heures par jour
 */
export function bilanEtude(etude, { jours = 30, heuresParJour = 24 } = {}) {
  const modeles = etude.modeles || {};
  const cameras = etude.cameras || [];
  const nvr = (etude.equipements && etude.equipements.enregistreur) || {};

  const debitTotal = cameras.reduce((t, c) => {
    const m = modeles[c.modele];
    return t + (m ? debitEstime({ resH: m.resH, resV: m.resV, codec: 'h265' }) : 0);
  }, 0);
  const capaciteGo = capaciteNecessaire({ debitTotal, jours, heuresParJour });

  const liaisons = metre(etude);
  const somme = (f) => liaisons.filter(f).reduce((t, l) => t + l.longueur, 0);
  const reseau = somme((l) => l.famille === 'video');
  const commande = somme((l) => l.famille !== 'video');

  const consoPoe = cameras.reduce((t, c) => t + ((modeles[c.modele] || {}).consoPoe || 0), 0);
  const directes = cameras.filter((c) => !c.coffret);
  const auLocal = (etude.coffrets || []).filter((r) => r.depuis === 'local');

  return {
    cameras: cameras.length,
    debitTotal,
    capaciteGo,
    disques: disquesPourBaies(capaciteGo, nvr.baies || 2, {
      capaciteMax: nvr.capaciteMaxBaie,
      raid: !!nvr.raid,
    }),
    consoPoe,
    // Un coffret en cascade n'occupe pas de port : c'est son parent qui en
    // occupe un. Compter les coffrets ferait croire la machine chargée.
    ports: directes.length + auLocal.length,
    liaisons,
    reseau,
    commande,
    boites: bobines(reseau),
    horsNorme: liaisons.filter((l) => l.verdict && l.verdict.niveau !== 'ok'),
    voiesLibres: (nvr.canaux || 0) - cameras.length,
    bandeSaturee: nvr.bandePassante ? debitTotal > nvr.bandePassante : false,
  };
}
