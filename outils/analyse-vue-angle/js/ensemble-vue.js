/**
 * Affichage du projet complet, partagé par les deux pages d'estimation.
 *
 * Le calcul est dans `ensemble.js` ; ici, seulement ce qui se voit. Les deux
 * pages montrent exactement le même bloc : un client qui passe de l'une à
 * l'autre ne doit pas croire avoir changé d'outil.
 *
 * Construit avec les fonctions du document plutôt qu'en assemblant du HTML :
 * les résumés viennent d'un rangement de navigateur, écrit par l'AUTRE page.
 * C'est une donnée qu'on ne maîtrise pas au moment où on l'affiche, et une
 * apostrophe de travers n'a pas à pouvoir devenir du balisage.
 */

import { $ } from './dom.js';
import { euros } from './prix.js';
import {
  VOLETS, JOURS_PEREMPTION, combiner, lireVolets, noterVolet,
} from './ensemble.js';

const noeud = (balise, classe, texte) => {
  const n = document.createElement(balise);
  if (classe) n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
};

/** Une ligne de récapitulatif par volet. */
function ligneVolet(v) {
  const d = VOLETS[v.cle];
  const bloc = noeud('div', 'volet');
  bloc.append(noeud('b', null, d.label));
  if (v.resume) bloc.append(noeud('span', 'apercu', v.resume));

  const chiffre = v.chiffre && v.totalTtc > 0;
  bloc.append(noeud('span', chiffre ? 'montant' : 'montant absent',
    chiffre ? `${euros(v.totalTtc)} TTC` : 'non chiffré sur le site'));

  if (v.jours !== null && v.jours > JOURS_PEREMPTION) {
    bloc.append(noeud('span', 'age',
      `Étude enregistrée il y a ${v.jours} jours — à refaire si votre projet a changé.`));
  }
  return bloc;
}

/**
 * Dépose le volet de la page courante et affiche le projet complet.
 *
 * @param {string} cleCourante 'video' ou 'alarme'
 * @param {object} volet résumé de l'estimation de cette page
 * @returns {object|null} le projet réuni, pour la demande par courriel
 */
export function afficherEnsemble(cleCourante, volet) {
  const hote = $('#ensemble');
  if (!hote) return null;

  const ens = combiner(noterVolet(cleCourante, volet));
  const liste = $('#ensemble-volets');
  liste.replaceChildren(...ens.volets.map(ligneVolet));

  /*
   * Un seul volet : la page ne récapitule rien, elle propose l'autre étude.
   * Deux volets : elle additionne, et dit tout de suite si le total est
   * partiel — une somme présentée comme le prix du projet quand une moitié
   * n'est pas chiffrée serait un mensonge par omission.
   */
  const intro = $('#ensemble-intro');
  if (ens.complet) {
    intro.textContent = ens.chiffre
      ? 'Vos deux études réunies. Une seule demande suffit : nous recevrons '
        + 'le projet entier.'
      : 'Vos deux études réunies. Une seule demande suffit pour les deux.';
  } else {
    intro.textContent = 'Protéger un lieu, c\'est souvent les deux : voir sans '
      + 'être vu ne sert à rien si personne n\'est prévenu, et une alarme qui '
      + 'sonne ne dit pas qui est entré.';
  }

  const total = $('#ensemble-total');
  const montrerTotal = ens.volets.length > 1 && ens.totalTtc > 0;
  total.hidden = !montrerTotal;
  if (montrerTotal) {
    total.replaceChildren(
      noeud('span', 'intitule', ens.chiffre ? 'Total des deux volets' : 'Total partiel'),
      noeud('b', null, `${euros(ens.totalTtc)} TTC`),
    );
  }

  const reserve = $('#ensemble-reserve');
  const notes = [];
  if (ens.partiel) {
    notes.push(`Ce total ne couvre pas ${ens.nonChiffres.join(' ni ')} : `
      + 'cette partie reste à chiffrer par l\'agence.');
  }
  if (ens.anciens.length) {
    notes.push('Une de vos études a plus d\'un mois. Vérifiez qu\'elle correspond '
      + 'toujours à votre projet avant de l\'envoyer.');
  }
  reserve.textContent = notes.join(' ');
  reserve.hidden = notes.length === 0;

  const actions = $('#ensemble-actions');
  actions.replaceChildren(...ens.manquants.map((d) => {
    const a = noeud('a', 'btn', d.invitation);
    a.href = d.page;
    return a;
  }));

  hote.hidden = false;
  return ens;
}

/** Le projet réuni, sans rien y déposer — pour qui veut seulement lire. */
export const projetReuni = () => combiner(lireVolets());
