/**
 * Le bordereau du devis, monté depuis l'étude.
 *
 * Un devis se trompe de deux façons. Il oublie une ligne — le presse-étoupe,
 * les deux connecteurs par liaison, l'heure de nacelle — et la marge y passe.
 * Ou il recopie une quantité que l'étude avait déjà comptée, les deux
 * chiffres divergent à la première modification, et c'est le client qui
 * trouve l'écart.
 *
 * Ce module ne recopie rien. Les caméras, les coffrets, les mètres de câble,
 * les disques, les accès : tout vient de `etude.json` par le même calcul que
 * le dossier. Ce qu'il prend dans `devis.json`, ce sont les trois choses
 * qu'aucun calcul ne donne — les références et les prix du distributeur, les
 * ratios d'accessoires, et les temps de pose de l'agence.
 *
 * Un prix absent reste absent : la ligne s'imprime sans montant et le total
 * dit combien de lignes ne sont pas chiffrées. Un devis à moitié rempli doit
 * se voir, pas s'arrondir.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { bilanEtude } from './etude-plan.js';

/**
 * Le prix facturé : le prix marché, remise faite.
 *
 * L'agence relève le prix public d'un revendeur français et se place dessous.
 * Le calcul se fait ici, une fois ; ni le prix marché ni la remise ne sortent
 * du bordereau. Le client lit un prix, pas un rabais — et deux clients ne
 * peuvent pas comparer deux rabais.
 */
export function prixFacture(marche, remise) {
  if (!Number.isFinite(marche)) return null;
  const r = Number.isFinite(remise) ? remise : 0;
  return Math.round(marche * (1 - r) * 100) / 100;
}

/** Une ligne de bordereau. Le prix peut manquer ; la quantité, jamais. */
function ligne(cle, designation, quantite, unite, extra = {}) {
  const prix = Number.isFinite(extra.prix) ? extra.prix : null;
  return {
    cle,
    designation,
    reference: extra.reference || null,
    quantite,
    unite,
    prix,
    total: prix === null ? null : prix * quantite,
    note: extra.note || null,
    contenu: extra.contenu || null,
    aConfirmer: extra.aConfirmer || null,
    option: !!extra.option,
  };
}

/** Arrondit au conditionnement supérieur : on n'achète pas un demi-touret. */
const parConditionnement = (metres, pas) => Math.ceil(metres / pas);

/**
 * Combien de caméras de chaque modèle, dans l'ordre où l'étude les déclare.
 *
 * On compte les caméras, jamais une liste de modèles tenue à part : c'est
 * exactement la divergence qui avait fait annoncer deux panoramiques quand
 * l'étude n'en portait qu'une.
 */
export function parcParModele(etude) {
  const compte = new Map();
  for (const c of etude.cameras) compte.set(c.modele, (compte.get(c.modele) || 0) + 1);
  return [...compte.entries()].map(([cle, nombre]) => ({
    cle, nombre, modele: etude.modeles[cle],
  }));
}

/**
 * Le bordereau, en lots.
 *
 * @param {object} etude
 * @param {object} devis
 * @returns {{lots: object[], totaux: object}}
 */
export function bordereau(etude, devis) {
  const b = bilanEtude(etude);
  const art = devis.articles || {};
  const remise = devis.remise;
  /*
   * Le prix d'un article : celui saisi en dur s'il existe, sinon le prix
   * marché remisé. Saisir un prix ferme l'emporte toujours — c'est ainsi
   * qu'une négociation fournisseur entre dans le devis.
   */
  const prixDe = (o) => (Number.isFinite(o.prix) ? o.prix : prixFacture(o.marche, remise));
  const prix = Object.fromEntries(Object.entries(devis.prix || {}).map(([k, v]) => [
    k, Number.isFinite(v) ? v : prixFacture((devis.marche || {})[k], remise),
  ]));
  const ratios = devis.ratios || {};
  const heures = devis.mainOeuvre || {};
  const a = (cle) => art[cle] || {};

  const coffrets = etude.coffrets || [];
  const acces = etude.acces || [];
  const exterieures = etude.cameras.filter((c) => c.exterieur).length;
  // Une liaison par caméra et une montante par coffret : deux bouts chacune.
  const liaisons = etude.cameras.length + coffrets.length;

  /* ------------------------------------------------- 1. la vidéosurveillance */
  const materiel = parcParModele(etude).map((p) => ligne(
    `camera-${p.cle}`, p.modele.reference, p.nombre, 'u',
    { reference: p.modele.reference, prix: prix[p.cle] },
  ));

  const nvr = etude.equipements.enregistreur;
  materiel.push(ligne('enregistreur', nvr.type, 1, 'u',
    { reference: nvr.reference, prix: prix.enregistreur }));

  const d = b.disques && b.disques.pool;
  if (d) {
    materiel.push(ligne('disque', `Disque dur vidéosurveillance ${d.unitaire} To`,
      d.nombre, 'u', {
        prix: prix.disque,
        note: `${b.capaciteGo >= 1000 ? `${Math.round(b.capaciteGo / 100) / 10} To` : `${Math.round(b.capaciteGo)} Go`} nécessaires pour 30 jours d'enregistrement continu.`,
      }));
  }

  if (coffrets.length) {
    materiel.push(ligne('switchPoe', a('switchPoe').designation || 'Commutateur PoE+',
      coffrets.length, 'u', { ...a('switchPoe'), prix: prixDe(a('switchPoe')) }));
  }

  if (a('ecran').designation) {
    materiel.push(ligne('ecran', a('ecran').designation, 1, 'u',
      { ...a('ecran'), option: true }));
  }

  /* -------------------------------------------------------- 2. le câblage */
  const cableRes = a('cableReseau');
  const cableCom = a('cableCommande');
  const tourets = parConditionnement(b.reseau, cableRes.conditionnement || 305);
  const couronnes = parConditionnement(b.commande, cableCom.conditionnement || 100);
  const cablage = [
    ligne('cableReseau', cableRes.designation || 'Câble réseau', tourets, 'touret', {
      ...cableRes,
      note: `${Math.round(b.reseau)} m relevés au cheminement, réserves comprises.`,
    }),
    ligne('cableCommande', cableCom.designation || 'Câble de commande', couronnes, 'couronne', {
      ...cableCom,
      prix: prixDe(cableCom),
      // Ce câble ne dessert que le verrouillage, la platine et le moniteur :
      // il n'existe que si l'option est prise, et suit donc son sort.
      option: !!devis.kitAcces,
      note: `${Math.round(b.commande)} m relevés : alimentation du verrouillage, interphonie, moniteur.`,
    }),
    ligne('connecteur', a('connecteur').designation || 'Connecteur RJ45',
      liaisons * (ratios.connecteursParLiaison || 2), 'u', { ...a('connecteur'), prix: prixDe(a('connecteur')),
        note: `${liaisons} liaisons, deux bouts chacune.`,
      }),
  ];

  const apparent = Math.round(b.reseau * (ratios.partCheminementApparent || 0));
  if (apparent > 0) {
    cablage.push(ligne('goulotte', a('goulotte').designation || 'Goulotte et fixation',
      apparent, 'm', { ...a('goulotte'), prix: prixDe(a('goulotte')),
        note: `Part apparente estimée à ${Math.round((ratios.partCheminementApparent || 0) * 100)} % du cheminement — à trancher au relevé.`,
      }));
  }

  /* -------------------------------------------- 3. les supports et coffrets */
  const supports = [
    ligne('support', a('support').designation || 'Support de caméra',
      etude.cameras.length, 'u', { ...a('support'), prix: prixDe(a('support')) }),
  ];
  if (exterieures) {
    supports.push(ligne('presseEtoupe', a('presseEtoupe').designation || 'Presse-étoupe',
      exterieures * (ratios.presseEtoupeParCameraExterieure || 1), 'u', { ...a('presseEtoupe'), prix: prixDe(a('presseEtoupe')),
        note: `${exterieures} caméras exposées aux intempéries sur ${etude.cameras.length}.`,
      }));
  }
  if (coffrets.length) {
    supports.push(ligne('coffret', a('coffret').designation || 'Coffret technique',
      coffrets.length, 'u', { ...a('coffret'), prix: prixDe(a('coffret')),
        note: coffrets.map((c) => `${c.cle} — ${c.nom}`).join(', '),
      }));
  }

  /* ------------------------------------------------- 4. le contrôle d'accès */
  /*
   * L'agence le vend d'un bloc : une ligne, un prix, à prendre ou à laisser.
   * Détailler sept lignes en option invite le client à en retirer une — et
   * une ventouse sans bouton de sortie n'est pas une installation, c'est un
   * piège.
   */
  const kit = devis.kitAcces;
  const controle = [];
  if (acces.length && kit) {
    controle.push(ligne('kitAcces', kit.designation || 'Contrôle d\'accès', 1, 'ensemble', {
      reference: kit.reference,
      prix: prixFacture(kit.marche, remise),
      contenu: kit.contenu || null,
      aConfirmer: kit.aConfirmer || null,
      note: `Pour ${acces.length} accès : ${acces.map((x) => `${x.cle} — ${x.nom}`).join(', ')}.`,
      option: true,
    }));
  }

  /* ------------------------------------------------------ 5. l'interphonie */
  /*
   * La platine et le moniteur sont DANS le kit ci-dessus. Le lot n'existe
   * plus : deux lignes pour un même équipement, et il se facture deux fois.
   */

  /* --------------------------------------------------- 6. la signalisation */
  const sig = devis.signalisation || {};
  const signalisation = [];
  if (sig.sirenesInterieures) {
    signalisation.push(ligne('sireneInterieure',
      a('sireneInterieure').designation || 'Sirène intérieure',
      sig.sirenesInterieures, 'u', { ...a('sireneInterieure'), prix: prixDe(a('sireneInterieure')) }));
  }
  if (sig.flashs) {
    signalisation.push(ligne('flash', a('flash').designation || 'Flash extérieur',
      sig.flashs, 'u', { ...a('flash'), prix: prixDe(a('flash')) }));
  }

  /* ------------------------------------------------------ 7. la main d'œuvre */
  const taux = Number.isFinite(devis.tauxHoraire) ? devis.tauxHoraire : null;
  const nacelle = etude.cameras.filter((c) => c.hauteur >= 4).length;
  const pied = etude.cameras.length - nacelle;
  const poste = (cle, designation, h, extra = {}) => ligne(
    cle, designation, Math.round(h * 100) / 100, 'h',
    { ...extra, prix: taux },
  );

  const oeuvre = [];
  if (pied) {
    oeuvre.push(poste('poseCamera', 'Pose et réglage des caméras accessibles à l\'échelle',
      pied * (heures.parCamera || 0), { note: `${pied} caméras posées sous 4 m.` }));
  }
  if (nacelle) {
    oeuvre.push(poste('poseCameraNacelle', 'Pose et réglage des caméras en hauteur',
      nacelle * (heures.parCameraNacelle || 0), {
        note: `${nacelle} caméras à 4 m ou plus — nacelle ou échafaudage à prévoir, non chiffré ici.`,
      }));
  }
  oeuvre.push(poste('tirage', 'Tirage et cheminement des câbles',
    ((b.reseau + b.commande) / 100) * (heures.tirageAuCentMetres || 0), {
    note: `${Math.round(b.reseau + b.commande)} m de câble au total.`,
  }));
  if (coffrets.length) {
    oeuvre.push(poste('coffrets', 'Pose et raccordement des coffrets déportés',
      coffrets.length * (heures.parCoffret || 0)));
  }
  oeuvre.push(poste('enregistreur', 'Pose de l\'enregistreur, disques et paramétrage',
    heures.enregistreur || 0));
  /*
   * Ni la pose du contrôle d'accès ni celle de l'interphonie ne figurent
   * ici : le kit les porte, et les compter deux fois ferait payer au client
   * une pose qu'il n'a peut-être pas commandée.
   */
  const nbSig = (sig.sirenesInterieures || 0) + (sig.flashs || 0);
  if (nbSig) {
    oeuvre.push(poste('signalisation', 'Pose des sirènes et du flash',
      nbSig * (heures.parSignalisation || 0)));
  }
  oeuvre.push(
    poste('miseEnService', 'Mise en service, adressage et enregistrement', heures.miseEnService || 0),
    poste('formation', 'Formation à l\'exploitation et connexion des téléphones',
      heures.formation || 0),
    poste('dossier', 'Dossier de fin de chantier et plans de récolement',
      heures.dossierFinChantier || 0),
  );

  const lots = [
    { cle: 'materiel', titre: 'Vidéosurveillance — matériel', lignes: materiel },
    { cle: 'cablage', titre: 'Câblage', lignes: cablage },
    { cle: 'supports', titre: 'Supports, coffrets et accessoires', lignes: supports },
    { cle: 'controle', titre: 'Contrôle d\'accès et visiophone — en option', lignes: controle },
    { cle: 'signalisation', titre: 'Signalisation et dissuasion', lignes: signalisation },
    { cle: 'oeuvre', titre: 'Main d\'œuvre', lignes: oeuvre },
  ].filter((l) => l.lignes.length);

  for (const lot of lots) {
    const chiffrees = lot.lignes.filter((l) => !l.option && l.total !== null);
    lot.total = chiffrees.length ? chiffrees.reduce((s, l) => s + l.total, 0) : null;
    lot.sansPrix = lot.lignes.filter((l) => !l.option && l.total === null).length;
  }

  return { lots, totaux: totaux(lots, devis) };
}

/**
 * Les totaux.
 *
 * `sansPrix` est le nombre de lignes non chiffrées. Tant qu'il n'est pas à
 * zéro, le total affiché est un total partiel — et le document doit le dire.
 */
export function totaux(lots, devis) {
  const toutes = lots.flatMap((l) => l.lignes).filter((l) => !l.option);
  const sansPrix = toutes.filter((l) => l.total === null).length;
  const ht = toutes.reduce((s, l) => s + (l.total || 0), 0);
  const tva = Number.isFinite(devis.tva) ? devis.tva : 0.2;
  const options = lots.flatMap((l) => l.lignes).filter((l) => l.option);
  return {
    lignes: toutes.length,
    sansPrix,
    complet: sansPrix === 0,
    ht,
    tauxTva: tva,
    montantTva: ht * tva,
    ttc: ht * (1 + tva),
    heures: lots.find((l) => l.cle === 'oeuvre')
      ? lots.find((l) => l.cle === 'oeuvre').lignes.reduce((s, l) => s + l.quantite, 0)
      : 0,
    options: options.length,
    aConfirmer: toutes.concat(options).filter((l) => l.aConfirmer).length,
  };
}
