/**
 * Le calcul d'une facture, et la comptabilité qui en découle.
 *
 * Une facture n'est pas un devis avec un autre titre. Elle est numérotée
 * sans trou et sans doublon, elle porte des mentions que la loi impose, et
 * une fois émise elle ne se corrige plus : elle s'annule par un avoir. Ce
 * module tient ces trois règles ; le reste — la mise en page, l'écran — ne
 * fait que les afficher.
 *
 * La comptabilité n'est ici que l'addition de ce qui est émis et de ce qui
 * est encaissé. Ce n'est pas un logiciel comptable : il n'y a ni plan
 * comptable, ni écritures, ni bilan. Il y a ce dont une petite entreprise a
 * besoin tous les jours — ce qui est dû, par qui, depuis quand, et combien
 * de TVA elle a collectée ce trimestre.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

/** Les états d'une facture, et l'ordre dans lequel ils se suivent. */
export const ETATS = {
  brouillon: 'Brouillon',
  emise: 'Émise',
  payee: 'Payée',
  annulee: 'Annulée par avoir',
};

/**
 * Les pénalités de retard s'expriment en MULTIPLE du taux d'intérêt légal,
 * pas en pourcentage.
 *
 * Trois fois le taux légal est le minimum d'usage entre professionnels. Le
 * taux légal lui-même change deux fois par an par arrêté : l'outil ne le
 * devine pas, l'agence le renseigne. Tant qu'il est inconnu, la facture
 * porte la formule — « trois fois le taux d'intérêt légal » — qui est la
 * mention légale, et ne chiffre pas les intérêts.
 */
export const PENALITE_MULTIPLE = 3;

/** L'indemnité forfaitaire de recouvrement, fixée par le code de commerce. */
export const INDEMNITE_RECOUVREMENT = 40;

const cent = (v) => Math.round(v * 100) / 100;

/**
 * Le numéro d'une facture.
 *
 * Séquentiel, sans trou, et jamais réattribué : c'est ce que l'administration
 * vérifie en premier. On le calcule sur l'année d'émission, à partir du plus
 * grand numéro déjà pris — pas à partir du nombre de factures, sinon une
 * annulation décale toute la suite et deux factures finissent par porter le
 * même numéro.
 */
export function prochainNumero(factures, annee, prefixe = 'F') {
  const motif = new RegExp(`^${prefixe}${annee}-(\\d+)$`);
  const pris = (factures || [])
    .map((f) => motif.exec(f.numero || ''))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const suivant = pris.length ? Math.max(...pris) + 1 : 1;
  return `${prefixe}${annee}-${String(suivant).padStart(3, '0')}`;
}

/**
 * Les totaux d'une facture, TVA détaillée par taux.
 *
 * Une facture peut porter plusieurs taux — 20 % sur le matériel, 10 % sur la
 * pose en logement ancien. Additionner la TVA d'un seul taux serait faux dès
 * la première facture mixte, et l'erreur ne se verrait qu'au contrôle.
 */
export function totauxFacture(facture) {
  const lignes = facture.lignes || [];
  const parTaux = new Map();
  let ht = 0;

  for (const l of lignes) {
    const q = Number(l.quantite) || 0;
    const pu = Number(l.prixUnitaire) || 0;
    const remise = Number(l.remise) || 0;
    const brut = q * pu;
    const net = cent(brut * (1 - remise));
    const taux = Number.isFinite(Number(l.tva)) ? Number(l.tva) : 0.2;
    ht = cent(ht + net);
    parTaux.set(taux, cent((parTaux.get(taux) || 0) + net));
  }

  const tvas = [...parTaux.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([taux, base]) => ({ taux, base, montant: cent(base * taux) }));
  const tva = cent(tvas.reduce((s, t) => s + t.montant, 0));
  const acompte = cent(Number(facture.acompte) || 0);

  return {
    lignes: lignes.length,
    ht,
    tvas,
    tva,
    ttc: cent(ht + tva),
    acompte,
    netAPayer: cent(ht + tva - acompte),
  };
}

/**
 * L'échéance : la date à laquelle le client doit avoir payé.
 *
 * Trente jours par défaut, le plafond légal entre professionnels étant de
 * soixante. On calcule sur la date d'émission, pas sur celle du jour : une
 * facture rééditée six mois plus tard garde son échéance d'origine.
 */
export function echeance(dateEmission, jours = 30) {
  const d = new Date(`${dateEmission}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (Number(jours) || 0));
  return d.toISOString().slice(0, 10);
}

/** Depuis combien de jours une facture émise est-elle en retard ? */
export function retard(facture, aujourdhui = new Date().toISOString().slice(0, 10)) {
  if (facture.etat !== 'emise') return 0;
  const fin = facture.echeance || echeance(facture.date, facture.delaiPaiement);
  if (!fin) return 0;
  const jours = Math.floor(
    (new Date(`${aujourdhui}T12:00:00`) - new Date(`${fin}T12:00:00`)) / 86400000,
  );
  return jours > 0 ? jours : 0;
}

/**
 * Les pénalités dues sur une facture en retard.
 *
 * Elles courent de plein droit, sans rappel : le taux annuel appliqué au
 * TTC impayé, au prorata des jours, plus l'indemnité forfaitaire. On les
 * calcule pour que l'agence sache ce qu'elle peut réclamer — elle reste
 * libre de ne pas le faire.
 */
export function penalites(facture, aujourdhui, tauxLegal = null) {
  const jours = retard(facture, aujourdhui);
  const rien = {
    jours: 0, taux: null, interets: null, indemnite: 0, total: 0,
  };
  if (!jours) return rien;
  const indemnite = INDEMNITE_RECOUVREMENT;
  if (!Number.isFinite(tauxLegal)) {
    // Sans le taux légal du semestre, on sait l'indemnité, pas les intérêts.
    return {
      jours, taux: null, interets: null, indemnite, total: indemnite,
    };
  }
  const taux = tauxLegal * PENALITE_MULTIPLE;
  const du = totauxFacture(facture).netAPayer;
  const interets = cent((du * taux * jours) / 365);
  return {
    jours, taux, interets, indemnite, total: cent(interets + indemnite),
  };
}

/* ------------------------------------------------------ la maintenance */

/** Les périodicités d'un contrat, et le nombre de mois entre deux échéances. */
export const PERIODES = {
  mensuelle: { label: 'Mensuelle', mois: 1 },
  trimestrielle: { label: 'Trimestrielle', mois: 3 },
  semestrielle: { label: 'Semestrielle', mois: 6 },
  annuelle: { label: 'Annuelle', mois: 12 },
};

/**
 * La n-ième échéance après une date de départ.
 *
 * On compte TOUJOURS depuis le départ, jamais depuis l'échéance précédente.
 * Un contrat mensuel démarré un 31 tombait sinon au 28 en février, puis
 * restait au 28 pour toujours : le contrat glissait de trois jours par an
 * sans que personne ne le voie.
 */
const decalerMois = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  const jour = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  // Le 31 d'un mois qui n'en a que trente recule au dernier jour.
  d.setDate(Math.min(jour, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
};

/**
 * Les échéances d'un contrat de maintenance jusqu'à une date donnée.
 *
 * Un contrat de maintenance se facture d'avance, à date fixe. La première
 * année étant offerte sur nos installations, le contrat démarre douze mois
 * après la mise en service : `debut` est la date de la PREMIÈRE facture, pas
 * celle de la pose.
 */
export function echeancesContrat(contrat, jusqua = new Date().toISOString().slice(0, 10)) {
  const p = PERIODES[contrat.periode] || PERIODES.annuelle;
  const fin = contrat.fin && contrat.fin < jusqua ? contrat.fin : jusqua;
  const out = [];
  if (!contrat.debut) return out;
  // Garde-fou : cent échéances couvrent huit ans de mensuel.
  for (let i = 0; i < 100; i += 1) {
    const date = decalerMois(contrat.debut, i * p.mois);
    if (date > fin) break;
    out.push({ date, montantHt: cent(Number(contrat.montantHt) || 0) });
  }
  return out;
}

/** Les échéances d'un contrat qui n'ont pas encore été facturées. */
export function aFacturer(contrat, factures, jusqua) {
  const faites = new Set(
    (factures || [])
      .filter((f) => f.contrat === contrat.cle && f.etat !== 'annulee')
      .map((f) => f.periodeDebut)
      .filter(Boolean),
  );
  return echeancesContrat(contrat, jusqua).filter((e) => !faites.has(e.date));
}

/* ------------------------------------------------------- la comptabilité */

const mois = (iso) => String(iso || '').slice(0, 7);
const trimestre = (iso) => {
  const m = Number(String(iso || '').slice(5, 7));
  return m ? `${String(iso).slice(0, 4)}-T${Math.ceil(m / 3)}` : '';
};

/**
 * Le journal : ce qui est émis, encaissé, en attente et en retard.
 *
 * Les brouillons ne comptent nulle part : une facture non émise n'existe pas
 * pour l'administration, et la faire entrer dans le chiffre d'affaires est
 * la façon la plus simple de se mentir sur sa trésorerie.
 *
 * Une facture annulée sort du journal, et son avoir sort avec elle : la paire
 * se neutralise. Ne retirer que la facture laisserait l'avoir seul, en
 * négatif, et le chiffre d'affaires s'en trouverait amputé deux fois. Un avoir
 * qui n'annule aucune facture du livre — un geste commercial — reste compté,
 * lui, parce qu'il diminue réellement le chiffre d'affaires.
 */
export function journal(donnees, aujourdhui = new Date().toISOString().slice(0, 10)) {
  const factures = (donnees.factures || []).filter((f) => f.etat !== 'brouillon');
  const annulees = new Set(factures.filter((f) => f.etat === 'annulee').map((f) => f.numero));
  const vivantes = factures.filter((f) => f.etat !== 'annulee'
    && !(f.annule && annulees.has(f.annule)));

  const somme = (liste, champ) => cent(liste.reduce(
    (s, f) => s + totauxFacture(f)[champ], 0,
  ));

  const payees = vivantes.filter((f) => f.etat === 'payee');
  const attente = vivantes.filter((f) => f.etat === 'emise');
  const enRetard = attente.filter((f) => retard(f, aujourdhui) > 0);

  const parPeriode = (cle) => {
    const m = new Map();
    for (const f of vivantes) {
      const k = cle(f.date);
      const t = totauxFacture(f);
      const a = m.get(k) || { ht: 0, tva: 0, ttc: 0, factures: 0 };
      m.set(k, {
        ht: cent(a.ht + t.ht),
        tva: cent(a.tva + t.tva),
        ttc: cent(a.ttc + t.ttc),
        factures: a.factures + 1,
      });
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([periode, v]) => ({ periode, ...v }));
  };

  return {
    emises: vivantes.length,
    annulees: factures.length - vivantes.length,
    caHt: somme(vivantes, 'ht'),
    tvaCollectee: somme(vivantes, 'tva'),
    encaisse: somme(payees, 'netAPayer'),
    attendu: somme(attente, 'netAPayer'),
    enRetard: {
      nombre: enRetard.length,
      montant: somme(enRetard, 'netAPayer'),
      factures: enRetard
        .map((f) => ({
          numero: f.numero,
          client: (f.client && f.client.nom) || '',
          jours: retard(f, aujourdhui),
          montant: totauxFacture(f).netAPayer,
        }))
        .sort((a, b) => b.jours - a.jours),
    },
    parMois: parPeriode(mois),
    parTrimestre: parPeriode(trimestre),
  };
}

/**
 * Les coordonnées bancaires portées par le document.
 *
 * Elles appartiennent à l'agence, pas à la facture : les ressaisir document
 * par document, c'est se garantir qu'un jour l'un d'eux portera l'ancien
 * compte. La facture peut toutefois les remplacer, pour le chantier réglé
 * sur un compte dédié.
 *
 * Une facture qui annonce un virement sans dire où virer n'est pas payable :
 * l'écran de l'agence le signale tant que le compte n'est pas renseigné.
 */
export function coordonneesBancaires(agence, facture = {}) {
  const b = (agence && agence.banque) || {};
  return {
    iban: facture.iban || b.iban || '',
    bic: facture.bic || b.bic || '',
  };
}

/**
 * Ce qu'il manque à l'identité de l'agence pour qu'une facture soit en règle.
 *
 * Une facture de SAS qui ne porte ni capital social ni RCS est irrégulière.
 * L'outil ne peut pas les deviner : il les réclame, et le dit sur la facture
 * tant qu'ils manquent. Mieux vaut un défaut visible qu'une facture émise
 * pendant deux ans avec un manque que personne n'a vu.
 */
export function mentionsManquantes(agence) {
  const a = agence || {};
  const c = a.aCompleter || {};
  const manque = [];
  if (!c.capitalSocial) manque.push('le capital social');
  if (!c.rcsGreffe) manque.push('la ville du greffe du RCS');
  if (!c.assuranceRcPro) manque.push('l\'assurance responsabilité civile professionnelle');
  if (!a.siret) manque.push('le SIRET');
  if (!a.tva) manque.push('le numéro de TVA intracommunautaire');
  return manque;
}
