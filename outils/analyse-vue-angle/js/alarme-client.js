/**
 * Page d'étude alarme : le visiteur décrit sa maison, l'étude se fait sous
 * ses yeux.
 *
 * Elle partage avec le devis vidéosurveillance les marges, la TVA et la mise
 * en forme des montants — un client et un technicien ne doivent jamais lire
 * deux chiffres différents du même site.
 *
 * Aucun serveur : les prix viennent de `tarif-alarme.json`, posé à côté de la
 * page. C'est le seul fichier à modifier pour mettre un tarif à jour.
 *
 * La page explique autant qu'elle chiffre. Une liste de détecteurs ne se
 * discute pas ; un raisonnement, si. Et c'est en le lisant que le client
 * corrige ce qu'il a mal déclaré — une baie oubliée, un chat passé sous
 * silence.
 */

import { $, $$ } from './dom.js';
import { fr, frGroupe } from './format.js';
import { chargerMenu, poserMenu } from './menu.js';
import { texteEnsemble } from './ensemble.js';
import { afficherEnsemble } from './ensemble-vue.js';
import {
  SITES, ANIMAUX, GARAGES, MASSE_IMMUNITE, HAUTEUR_COURANTE, profil,
  composerAlarme, reservesAlarme, couches,
} from './alarme.js';
import { ligne, devis, euros, reservesDevis, TVA_DEFAUT, MARGE_COMMERCIALE } from './prix.js';

/** Où la demande part. L'adresse publique de l'agence, et elle seule. */
const CONTACT = 'contact@ngsecurity38.com';

/** Tarif de repli, celui embarqué à la fabrication du fichier unique. */
const TARIF_ALARME_EMBARQUE = globalThis.__tarifAlarme || null;

const CLE_ALARME = 'ngsecurity-etude-alarme';

const etatAlarme = { tarif: null };

const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** Charge le tarif : celui posé à côté de la page, sinon celui embarqué. */
async function chargerTarifAlarme() {
  if (!globalThis.__ngsIntegre && window.location.protocol !== 'file:') {
    try {
      const r = await fetch('tarif-alarme.json', { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {
      // Fichier absent à côté de la page : on se rabat sur l'embarqué.
    }
  }
  return TARIF_ALARME_EMBARQUE;
}

/* ------------------------------------------------------------- formulaire */

/** Remplit les listes déroulantes depuis les tables du module de calcul. */
function garnirListes() {
  const options = (sel, table) => {
    $(sel).innerHTML = Object.entries(table)
      .map(([cle, v]) => `<option value="${echapper(cle)}">${echapper(v.label)}</option>`)
      .join('');
  };
  options('#a-type', SITES);
  options('#a-garage', GARAGES);
  options('#a-animaux', ANIMAUX);
}

/**
 * Les intitulés qui changent de sens d'une famille à l'autre.
 *
 * « Surface habitable » ne veut rien dire pour un entrepôt, et « combien de
 * personnes doivent pouvoir mettre en marche » se dit autrement à un
 * commerçant qui pense en ouverture et fermeture. Un formulaire qui parle la
 * langue du client obtient des réponses justes ; un formulaire générique
 * obtient des approximations qu'on chiffre ensuite.
 */
const INTITULES = {
  habitation: {
    surface: 'Surface habitable (m²)',
    aide: 'Au plus juste : c\'est elle qui décide du nombre de détecteurs de mouvement.',
    portes: 'Portes donnant sur l\'extérieur',
    occupants: 'Combien de personnes doivent pouvoir mettre en marche ?',
  },
  commerce: {
    surface: 'Surface de vente et réserve (m²)',
    aide: 'Surface de plancher, réserve comprise.',
    portes: 'Portes donnant sur l\'extérieur, réserve comprise',
    occupants: 'Combien de personnes ouvrent et ferment ?',
  },
  tertiaire: {
    surface: 'Surface des bureaux (m²)',
    aide: 'Plateaux, couloirs et salles de réunion compris.',
    portes: 'Portes donnant sur l\'extérieur ou sur les parties communes',
    occupants: 'Combien de personnes ouvrent et ferment ?',
  },
  depot: {
    surface: 'Surface au sol (m²)',
    aide: 'Un dépôt se compte en volume : la hauteur compte autant que la surface.',
    portes: 'Portes de service et issues',
    occupants: 'Combien de personnes ouvrent et ferment ?',
  },
  chantier: {
    surface: 'Surface du terrain (m²)',
    aide: 'Ordre de grandeur : elle sert à prévoir la portée radio, pas à compter '
      + 'des détecteurs.',
    portes: 'Portes donnant sur l\'extérieur',
    occupants: 'Combien de personnes doivent pouvoir mettre en marche ?',
  },
};

/**
 * N'affiche que les questions qui ont un sens pour le site choisi.
 *
 * Demander son garage à un entrepôt, ou sa vitrine à un pavillon, c'est
 * inviter à répondre n'importe quoi — et ce n'importe quoi se retrouve
 * ensuite dans le matériel chiffré.
 */
function appliquerFamille() {
  const { site } = profil($('#a-type').value);
  const nom = site.famille;
  for (const n of $$('[data-si]')) {
    n.hidden = !n.dataset.si.split(/\s+/).includes(nom);
  }
  const i = INTITULES[nom] || INTITULES.habitation;
  $('#i-surface').textContent = i.surface;
  $('#s-surface').textContent = i.aide;
  $('#i-portes').textContent = i.portes;
  $('#i-occupants').textContent = i.occupants;
}

const nombre = (sel, defaut = 0) => {
  const v = Number($(sel).value);
  return Number.isFinite(v) ? v : defaut;
};

/** Les réponses, telles que le module de calcul les attend. */
function reponsesAlarme() {
  return {
    typeSite: $('#a-type').value,
    surface: nombre('#a-surface', 100),
    niveaux: nombre('#a-niveaux', 1),
    occupants: nombre('#a-occupants', 2),
    entrees: nombre('#a-entrees', 1),
    portes: nombre('#a-portes', 2),
    fenetresAccessibles: nombre('#a-fenetres', 4),
    baies: nombre('#a-baies', 0),
    fenetresHautes: nombre('#a-hautes', 0),
    garage: $('#a-garage').value,
    dependance: $('#a-dependance').checked,
    animaux: $('#a-animaux').value,
    internet: $('#a-internet').value,
    armerPresent: $('#a-present').checked,
    // Commerce
    vitrines: nombre('#a-vitrines', 0),
    rideau: $('#a-rideau').checked,
    reserve: $('#a-reserve').checked,
    agression: $('#a-agression').checked,
    immeuble: $('#a-immeuble').checked,
    // Bureaux
    localTechnique: $('#a-local').checked,
    // Dépôt
    quais: nombre('#a-quais', 0),
    hauteur: nombre('#a-hauteur', 3),
    metallique: $('#a-metallique').checked,
    // Chantier
    basesVie: nombre('#a-basesvie', 1),
    acces: nombre('#a-acces', 1),
    electricite: $('#a-electricite').value,
    leveeDoute: $('#a-photo').checked,
    sireneExterieure: $('#a-sirene').checked,
    pose: $('#a-pose').checked,
  };
}

/**
 * Le type de logement propose une surface et un nombre de niveaux.
 *
 * Proposés, jamais imposés : le client corrige. Mais partir d'un plain-pied
 * de 100 m² quand il a coché « appartement » lui fait relire un chiffre qu'il
 * aurait laissé passer.
 */
function suggererDepuisType() {
  const { site } = profil($('#a-type').value);
  $('#a-surface').value = site.surface;
  $('#a-niveaux').value = String(site.niveaux);
  $('#a-portes').value = site.portes;
  $('#a-fenetres').value = site.fenetres;
}

/* ----------------------------------------------------------------- schéma */

/**
 * Les trois lignes de défense, dessinées.
 *
 * Une pastille par ligne, avec le nombre d'appareils qui la tiennent. Des
 * pastilles de taille égale, et non des barres proportionnelles : deux
 * sirènes ne valent pas « moins » que sept détecteurs d'ouverture, elles font
 * un autre travail. Une barre courte le laisserait croire.
 */
function dessinerCouches(inv) {
  const c = couches(inv);
  const L = 720;
  const h = 70;
  const disque = 205;
  const couleurs = ['#c8102e', '#9d0c24', '#5b6472'];

  const rangs = c.map((x, i) => {
    const y = i * h + 16;
    return `<g>
      <text x="0" y="${y + 16}" font-size="13" font-weight="700" fill="#1a1d23"
        >${echapper(x.titre)}</text>
      <text x="0" y="${y + 33}" font-size="11" fill="#5b6472"
        >${echapper(x.quand)}</text>
      <circle cx="${disque + 19}" cy="${y + 19}" r="19"
        fill="${x.nombre > 0 ? couleurs[i] : '#aeb4be'}"/>
      <text x="${disque + 19}" y="${y + 25}" font-size="17" font-weight="700"
        text-anchor="middle" fill="#ffffff">${x.nombre}</text>
      <text x="${disque + 52}" y="${y + 25}" font-size="13" fill="#1a1d23"
        >${echapper(x.detail)}</text>
    </g>`;
  }).join('');

  $('#a-schema').innerHTML = `<svg viewBox="0 0 ${L} ${c.length * h + 10}" role="img"
    aria-label="Nombre d'appareils sur chacune des trois lignes de défense">
    ${rangs}
  </svg>`;
}

/* ----------------------------------------------------------- explications */

/**
 * Ce que l'installation fait, et ce qu'elle laisse passer.
 *
 * Adapté aux réponses : c'est là toute la différence entre un argumentaire et
 * une étude. Un client à qui l'on dit « vos quatre fenêtres d'étage ne sont
 * pas équipées » fait confiance au reste.
 */
function expliquer(inv, offre) {
  const p = [];
  const avant = inv.ouvertures + inv.brisVitre + inv.exterieurs;

  if (inv.famille === 'chantier') {
    p.push(`Un chantier n'a ni mur fermé ni fenêtre : la détection se fait <b>dehors</b>. `
      + `${inv.exterieurs} détecteur${inv.exterieurs > 1 ? 's' : ''} extérieur`
      + `${inv.exterieurs > 1 ? 's' : ''} couvrent les accès et les abords des bases-vie, `
      + `et ${inv.ouvertures} contact${inv.ouvertures > 1 ? 's' : ''} équipent leurs portes.`);
  } else {
    p.push(`Votre installation surveille <b>${avant} point${avant > 1 ? 's' : ''} d'entrée</b> `
      + `et <b>${inv.mouvements} volume${inv.mouvements > 1 ? 's' : ''} intérieur${
        inv.mouvements > 1 ? 's' : ''}</b>. `
      + 'Les premiers préviennent avant que l\'intrus soit dedans ; les seconds le '
      + 'détectent sur son passage s\'il est entré par ailleurs.');
  }

  /* ------------------------------------------------ ce qui tient au site */

  if (inv.famille === 'commerce') {
    if (inv.vitrines > 0) {
      p.push(`Votre façade est en verre. C'est la plus grande ouverture du magasin, et `
        + `la seule qu'un contact ne sait pas protéger : ${inv.vitrines > 1
          ? `vos ${inv.vitrines} vitrines reçoivent chacune` : 'votre vitrine reçoit'} `
        + 'un détecteur de bris, qui entend la vitre céder.');
    }
    if (inv.rideau) {
      p.push('Le rideau métallique a son <b>propre contact</b>. Baissé, c\'est lui la vraie '
        + 'porte : un contact posé seulement sur la porte vitrée derrière ne verrait rien '
        + 'tant que le rideau est fermé.');
    }
    if (inv.livraison) {
      p.push('<b>La réserve est équipée à part.</b> C\'est par là qu\'on entre dans un '
        + 'commerce : une porte de livraison donne sur une cour ou une ruelle, hors de vue '
        + 'de la rue — l\'intrus y travaille sans être dérangé.');
    }
    if (inv.agression) {
      p.push('Le bouton d\'alarme discret ne relève pas de l\'anti-intrusion : il sert '
        + '<b>pendant les heures d\'ouverture</b>, déclenché par quelqu\'un qui est là, sous '
        + 'la contrainte. Il suppose que l\'alerte soit reçue et qu\'on sache quoi en faire.');
    }
  }

  if (inv.famille === 'tertiaire') {
    p.push('Des bureaux sont vides la nuit et sans animaux : c\'est le cas où le '
      + 'volumétrique donne le plus pour le moins cher — les couloirs et les plateaux '
      + 'sont des passages obligés, quel que soit le point d\'entrée.');
    if (inv.localTechnique) {
      p.push('Le local technique est traité à part : c\'est le seul endroit d\'un bureau où '
        + 'l\'on fait beaucoup de dégâts en très peu de temps.');
    }
  }

  if (inv.famille === 'depot') {
    if (inv.quais > 0) {
      p.push(`${inv.quais > 1 ? `Vos ${inv.quais} quais` : 'Votre quai'} de chargement `
        + `${inv.quais > 1 ? 'sont équipés' : 'est équipé'} comme des portes — parce que `
        + 'c\'en sont, à la taille d\'un camion. C\'est par là que la marchandise sort.');
    }
    if (inv.hauteur > HAUTEUR_COURANTE) {
      p.push(`<b>Attention à la hauteur.</b> Sous ${fr(inv.hauteur)} m, un détecteur `
        + 'd\'intérieur posé vers 2,40 m ne surveille qu\'une tranche au sol : les '
        + 'lanterneaux, les bardages et tout le volume au-dessus lui échappent. À cette '
        + 'hauteur, le relevé sur place et des détecteurs adaptés ne sont pas optionnels.');
    }
    if (inv.metallique) {
      p.push('Une charpente ou un bardage métallique <b>avale la radio</b>. Deux relais sont '
        + 'prévus au budget ; leur nombre exact ne se décide qu\'après un essai de portée '
        + 'sur place.');
    }
  }

  if (inv.famille === 'chantier') {
    p.push('<b>Sur un chantier, l\'alarme seule ne suffit presque jamais.</b> Sans levée de '
      + 'doute — photo ou vidéo — une alerte nocturne en bord de route ne déclenche aucune '
      + 'intervention : personne ne se déplace sur une sirène. Cochez la photo à l\'alerte, '
      + 'ou prévoyez une télésurveillance.');
    if (inv.sansCourant) {
      p.push('Sans électricité sur place, tout fonctionne sur batterie. L\'autonomie réelle '
        + 'et le rythme de remplacement sont à arrêter ensemble : ils font le coût '
        + 'd\'exploitation, pas le prix d\'achat.');
    }
    p.push('Le périmètre d\'un chantier change à chaque phase. Ce chiffrage vaut pour '
      + 'l\'installation d\'aujourd\'hui ; prévoyez de la faire évoluer.');
  }

  /* ------------------------------------------- ce qui tient aux réponses */

  if (inv.mode === 'perimetrique') {
    p.push('<b>À cause de votre animal</b>, la détection repose sur les ouvertures plutôt '
      + 'que sur les détecteurs de mouvement. C\'est une installation un peu plus fournie, '
      + 'mais c\'est la seule qui tienne dans la durée : une alarme qui se déclenche sur '
      + 'l\'animal de la maison finit par ne plus être mise en marche du tout.');
  }

  if (inv.animal.masse > MASSE_IMMUNITE) {
    p.push(`Un chien de plus de ${MASSE_IMMUNITE} kg dépasse l'immunité animale annoncée par `
      + 'les constructeurs de détecteurs. Les détecteurs de mouvement sont donc réservés aux '
      + 'pièces où il ne va pas — en pratique, l\'entrée et les paliers, porte fermée.');
  } else if (inv.animal.grimpe) {
    p.push('L\'immunité animale repose sur le fait que l\'animal <b>reste au sol</b>. '
      + 'Un chat sur un meuble ou une rambarde se présente au détecteur exactement comme un '
      + 'homme debout. D\'où le choix de protéger d\'abord les ouvertures.');
  }

  if (inv.baies > 0) {
    const sujet = inv.baies > 1
      ? `Vos ${inv.baies} grandes surfaces vitrées appellent`
      : 'Votre grande surface vitrée appelle';
    p.push(`${sujet} un détecteur de bris : un contact d'ouverture sait qu'un battant `
      + "s'ouvre, il ignore qu'une vitre a été cassée et qu'on est passé au travers.");
  }

  if (inv.garage === 'communicant') {
    p.push('Votre garage communique avec la maison. C\'est le point faible le plus courant : '
      + 'une porte basculante se force sans bruit, et l\'intrus travaille ensuite à l\'abri '
      + 'des regards. La porte de garage <i>et</i> la porte intérieure sont donc équipées.');
  }

  if (inv.fenetresHautes > 0) {
    p.push(`<b>Ce qui n'est pas couvert :</b> vos ${inv.fenetresHautes} ouverture`
      + `${inv.fenetresHautes > 1 ? 's' : ''} en hauteur, déclarée`
      + `${inv.fenetresHautes > 1 ? 's' : ''} inaccessible`
      + `${inv.fenetresHautes > 1 ? 's' : ''} sans échelle. Un intrus qui en apporterait une `
      + 'entrerait sans déclencher le périmètre — il trouverait le détecteur intérieur.');
  }

  if (inv.claviers > 1) {
    p.push(`${inv.claviers} claviers, un par entrée utilisée tous les jours : traverser le `
      + 'local dans le noir pour aller désarmer à l\'autre bout n\'est pas une méthode, et '
      + 'c\'est ainsi qu\'on finit par ne plus armer du tout.');
  }

  if (inv.profil.armerPresent && $('#a-present').checked) {
    p.push('Vous pourrez <b>mettre en marche en restant chez vous</b> : les ouvertures '
      + 'restent surveillées pendant que les détecteurs intérieurs se mettent en veille. '
      + 'C\'est précisément ce que le périmètre permet et que le volumétrique seul interdit.');
  }

  if (inv.immeuble) {
    p.push('En immeuble partagé, une sirène extérieure peut être encadrée par le règlement '
      + 'de copropriété ou un arrêté municipal : à vérifier avant la pose.');
  }

  if (inv.sansBox) {
    p.push('Sans box sur place, la centrale transmet par le réseau mobile. Il faut une carte '
      + 'SIM avec un forfait de données, non comprise dans l\'estimation.');
  } else {
    p.push('La centrale se raccorde à votre box, et bascule sur le réseau mobile si la '
      + 'ligne tombe — couper l\'internet ne suffit pas à faire taire le système.');
  }

  p.push(`Temps de pose estimé : <b>${fr(offre.heures)} h</b>, formation des utilisateurs `
    + 'comprise.');

  $('#a-explications').innerHTML = p.map((x) => `<p class="aide">${x}</p>`).join('');
}

/* ----------------------------------------------------------------- devis */

function afficherLignes(d) {
  $('#a-lignes').innerHTML = d.lignes.map((l) => `<tr>
    <td>${echapper(l.role)}<br><small>${echapper(l.article.reference || '')}</small></td>
    <td class="nombre">${l.quantite}</td>
    <td class="nombre">${l.venteHt > 0 ? echapper(euros(l.venteHt)) : '—'}</td>
    <td class="nombre">${l.venteHt > 0 ? echapper(euros(l.totalHt)) : 'à chiffrer'}</td>
  </tr>`).join('');

  const t = [];
  if (d.mainOeuvreHt > 0) {
    t.push(`<tr><th colspan="3">Installation et mise en service</th>
      <td class="nombre">${echapper(euros(d.mainOeuvreHt))}</td></tr>`);
  }
  t.push(`<tr><th colspan="3">Total HT</th>
    <td class="nombre">${echapper(euros(d.totalHt))}</td></tr>`);
  t.push(`<tr><th colspan="3">TVA ${Math.round(d.tva * 100)} %</th>
    <td class="nombre">${echapper(euros(d.montantTva))}</td></tr>`);
  t.push(`<tr class="total"><th colspan="3">Total TTC</th>
    <td class="nombre">${echapper(euros(d.totalTtc))}</td></tr>`);
  $('#a-totaux').innerHTML = t.join('');
}

/** Le résumé en une phrase : ce qu'on retient si l'on ne lit rien d'autre. */
function resumer(inv, d) {
  const detecteurs = inv.ouvertures + inv.brisVitre + inv.mouvements + inv.exterieurs;
  const prix = d.complet && d.totalTtc > 0
    ? ` Estimation : <b>${echapper(euros(d.totalTtc))} TTC</b>, pose comprise.`
    : ' Les montants restent à compléter par l\'agence.';

  const repartition = inv.famille === 'chantier'
    ? `${inv.exterieurs} détecteur${inv.exterieurs > 1 ? 's' : ''} extérieur`
      + `${inv.exterieurs > 1 ? 's' : ''} et ${inv.ouvertures} contact`
      + `${inv.ouvertures > 1 ? 's' : ''} sur les bases-vie`
    : `${inv.ouvertures} ouverture${inv.ouvertures > 1 ? 's' : ''} et ${inv.mouvements} `
      + `volume${inv.mouvements > 1 ? 's' : ''} intérieur${inv.mouvements > 1 ? 's' : ''}`;

  const commande = `une centrale, ${inv.claviers > 1 ? `${inv.claviers} claviers` : 'un clavier'}`
    + ` et ${inv.sireneExterieure ? 'deux sirènes' : 'une sirène'}`;

  return `Pour ${echapper(inv.article)} ${echapper(inv.nomCourt)} de `
    + `${echapper(frGroupe(inv.surface))} m², <b>${detecteurs} détecteurs</b> répartis sur `
    + `${repartition}, ${commande}.${prix}`;
}

function majContact(inv, d, ensemble) {
  const bouton = $('#a-contact');
  if (!CONTACT) {
    bouton.hidden = true;
    return;
  }
  const corps = [
    'Bonjour,',
    '',
    'Je souhaite une étude pour la protection de mon site :',
    `- Site : ${inv.labelSite}, ${inv.surface} m², ${inv.niveaux} niveau(x)`,
    `- Portes extérieures : ${inv.portes}`,
    `- Fenêtres accessibles : ${inv.fenetres}, dont ${inv.baies} grande(s) surface(s) vitrée(s)`,
    `- Ouvertures en hauteur non équipées : ${inv.fenetresHautes}`,
    ...(inv.profil.garage ? [
      `- Garage : ${inv.labelGarage}`,
      `- Animaux : ${inv.animal.label}`,
      `- Armer en ma présence : ${$('#a-present').checked ? 'oui' : 'non'}`,
    ] : []),
    ...(inv.famille === 'commerce' ? [
      `- Vitrines : ${inv.vitrines}`,
      `- Rideau métallique : ${inv.rideau ? 'oui' : 'non'}`,
      `- Réserve avec accès livraison : ${inv.livraison ? 'oui' : 'non'}`,
      `- Bouton d'alarme discret : ${inv.agression ? 'oui' : 'non'}`,
    ] : []),
    ...(inv.famille === 'tertiaire' ? [
      `- Local technique à part : ${inv.localTechnique ? 'oui' : 'non'}`,
    ] : []),
    ...(inv.famille === 'depot' ? [
      `- Quais et portes sectionnelles : ${inv.quais}`,
      `- Hauteur sous plafond : ${inv.hauteur} m`,
      `- Charpente métallique : ${inv.metallique ? 'oui' : 'non'}`,
    ] : []),
    ...(inv.famille === 'chantier' ? [
      `- Bases-vie ou containers : ${inv.basesVie}`,
      `- Accès au terrain : ${inv.acces}`,
      `- Électricité sur place : ${inv.sansCourant ? 'non' : 'oui'}`,
    ] : []),
    `- Entrées utilisées tous les jours : ${inv.claviers}`,
    `- Photo à l'alerte : ${inv.leveeDoute ? 'oui' : 'non'}`,
    `- Sirène extérieure : ${inv.sireneExterieure ? 'oui' : 'non'}`,
    '',
    'Matériel proposé par votre page :',
    ...d.lignes.map((l) => `- ${l.quantite} × ${l.role} (${l.article.reference || ''})`),
    // Le second volet, s'il existe : une seule demande pour tout le chantier.
    ...(ensemble && ensemble.volets.length > 1 ? texteEnsemble(ensemble) : []),
    '',
    d.complet && d.totalTtc > 0
      ? `Estimation obtenue sur votre site : ${euros(d.totalTtc)} TTC.`
      : 'Estimation non chiffrée sur le site : merci de me communiquer un prix.',
    '',
    'Mes coordonnées :',
    'Nom :',
    'Adresse du domicile :',
    'Téléphone :',
  ].join('\n');
  bouton.href = `mailto:${CONTACT}`
    + `?subject=${encodeURIComponent('Demande d\'étude alarme anti-intrusion')}`
    + `&body=${encodeURIComponent(corps)}`;
  bouton.hidden = false;
}

function calculerAlarme() {
  if (!etatAlarme.tarif) return;
  const r = reponsesAlarme();
  const tarif = etatAlarme.tarif;
  const offre = composerAlarme(r, tarif.articles || [], {});
  const options = { marge: tarif.marge ?? MARGE_COMMERCIALE, tva: tarif.tva ?? TVA_DEFAUT };
  const lignes = offre.lignes.map((l) => ({
    ...ligne(l.article, l.quantite, options), role: l.role,
  }));
  const d = devis(lignes, {
    heures: offre.heures,
    tauxHoraire: tarif.tauxHoraire ?? 0,
    tva: options.tva,
  });

  $('#resultat').hidden = false;
  $('#a-resume').innerHTML = resumer(offre.inv, d);
  dessinerCouches(offre.inv);
  expliquer(offre.inv, offre);
  afficherLignes(d);

  $('#a-manques').innerHTML = offre.manques
    .map((m) => `<p class="bandeau">${echapper(m)}</p>`).join('');

  $('#a-reserves').innerHTML = [...reservesAlarme(offre.inv), ...reservesDevis(d)]
    .map((x) => `<li>${echapper(x)}</li>`).join('');

  // Le projet complet : l'autre volet, s'il a déjà été étudié.
  const ensemble = afficherEnsemble('alarme', {
    // Idem : court, et sans la phrase de prix que porte déjà le résumé affiché.
    resume: (() => {
      const i = offre.inv;
      const n = i.ouvertures + i.brisVitre + i.mouvements + i.exterieurs;
      return `${n} détecteur${n > 1 ? 's' : ''} pour ${i.article} ${i.nomCourt}`;
    })(),
    lignes: d.lignes.map((l) => ({ role: l.role, quantite: l.quantite })),
    totalHt: d.totalHt,
    totalTtc: d.totalTtc,
    chiffre: d.complet && d.totalTtc > 0,
  });

  majContact(offre.inv, d, ensemble);
  memoriserAlarme();
}

/* ----------------------------------------------------------------- projet */

const projetAlarme = () => ({
  type: 'ng-etude-alarme', date: new Date().toISOString(), reponses: reponsesAlarme(),
});

function memoriserAlarme() {
  try {
    window.localStorage.setItem(CLE_ALARME, JSON.stringify(projetAlarme()));
  } catch {
    // Navigation privée, quota : le visiteur garde son fichier enregistré.
  }
}

function restaurerAlarme(contenu) {
  if (!contenu || contenu.type !== 'ng-etude-alarme') return false;
  const r = contenu.reponses || {};
  for (const [sel, cle] of [['#a-type', 'typeSite'], ['#a-surface', 'surface'],
    ['#a-niveaux', 'niveaux'], ['#a-occupants', 'occupants'], ['#a-entrees', 'entrees'],
    ['#a-portes', 'portes'], ['#a-fenetres', 'fenetresAccessibles'], ['#a-baies', 'baies'],
    ['#a-hautes', 'fenetresHautes'], ['#a-garage', 'garage'], ['#a-animaux', 'animaux'],
    ['#a-internet', 'internet'], ['#a-vitrines', 'vitrines'], ['#a-quais', 'quais'],
    ['#a-hauteur', 'hauteur'], ['#a-basesvie', 'basesVie'], ['#a-acces', 'acces'],
    ['#a-electricite', 'electricite']]) {
    if (r[cle] !== undefined) $(sel).value = r[cle];
  }
  for (const [sel, cle] of [['#a-dependance', 'dependance'], ['#a-present', 'armerPresent'],
    ['#a-photo', 'leveeDoute'], ['#a-sirene', 'sireneExterieure'], ['#a-pose', 'pose'],
    ['#a-rideau', 'rideau'], ['#a-reserve', 'reserve'], ['#a-agression', 'agression'],
    ['#a-immeuble', 'immeuble'], ['#a-local', 'localTechnique'],
    ['#a-metallique', 'metallique']]) {
    if (r[cle] !== undefined) $(sel).checked = !!r[cle];
  }
  // Le site a pu changer : les questions affichées doivent suivre.
  appliquerFamille();
  return true;
}

function enregistrerAlarme() {
  const blob = new Blob([JSON.stringify(projetAlarme())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mon-projet-alarme.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function brancherProjetAlarme() {
  $('#a-enregistrer').addEventListener('click', enregistrerAlarme);
  $('#a-reprendre').addEventListener('click', () => $('#a-fichier').click());
  $('#a-fichier').addEventListener('change', async () => {
    const f = $('#a-fichier').files[0];
    if (!f) return;
    try {
      if (!restaurerAlarme(JSON.parse(await f.text()))) {
        window.alert('Ce fichier n\'est pas un projet enregistré ici.');
      } else calculerAlarme();
    } catch {
      window.alert('Fichier illisible.');
    }
    $('#a-fichier').value = '';
  });

  try {
    const garde = window.localStorage.getItem(CLE_ALARME);
    if (garde) restaurerAlarme(JSON.parse(garde));
  } catch {
    // Rien de mémorisé : on démarre sur les valeurs par défaut.
  }
}

/* -------------------------------------------------------------- démarrage */

async function demarrerAlarme() {
  chargerMenu().then((m) => poserMenu($('#site-menu'), m, globalThis.location?.pathname));

  garnirListes();
  brancherProjetAlarme();
  appliquerFamille();

  $('#a-type').addEventListener('change', () => {
    suggererDepuisType();
    appliquerFamille();
    calculerAlarme();
  });
  $$('#a-surface, #a-niveaux, #a-occupants, #a-portes, #a-fenetres, #a-baies, #a-hautes, '
    + '#a-garage, #a-animaux, #a-internet, #a-dependance, #a-present, #a-photo, #a-sirene, '
    + '#a-pose, #a-entrees, #a-vitrines, #a-rideau, #a-reserve, #a-agression, #a-immeuble, '
    + '#a-local, #a-quais, #a-hauteur, #a-metallique, #a-basesvie, #a-acces, #a-electricite')
    .forEach((n) => {
    n.addEventListener('change', calculerAlarme);
    n.addEventListener('input', calculerAlarme);
  });

  $('#a-imprimer').addEventListener('click', () => window.print());

  etatAlarme.tarif = await chargerTarifAlarme();
  if (!etatAlarme.tarif) {
    $('#resultat').hidden = false;
    $('#a-resume').textContent = 'Tarif indisponible : le fichier tarif-alarme.json n\'a pas '
      + 'pu être chargé. Contactez-nous, nous établirons l\'étude directement.';
    return;
  }
  $('#bandeau-exemple').hidden = !etatAlarme.tarif.exemple;
  calculerAlarme();
}

demarrerAlarme();
