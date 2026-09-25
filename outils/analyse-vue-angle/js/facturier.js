/**
 * Le facturier : l'écran de l'agence.
 *
 * Il tient trois choses au même endroit — les factures, les contrats de
 * maintenance, et ce que les deux donnent une fois additionnés. Le calcul
 * n'est pas ici : il vient de `facture.js`, le même module que la facture
 * imprimée. Un écran qui annoncerait d'autres totaux que le document qu'il
 * imprime ne servirait qu'à se tromper plus vite.
 *
 * Tout reste sur l'ordinateur de l'agence. Le livre s'ouvre et s'enregistre
 * comme un fichier ; rien ne part sur un serveur. Une comptabilité qui
 * transite par un site est une comptabilité qu'on ne maîtrise plus.
 */

import { $, $$ } from './dom.js';
import { fr, echapper } from './format.js';
import { euros } from './prix.js';
import {
  ETATS, PERIODES, prochainNumero, totauxFacture, echeance, retard,
  echeancesContrat, aFacturer, journal, fusionnerAgence, lienPaiement,
  mentionsManquantes,
} from './facture.js';
import { MOYENS } from './paiement.js';
import { ficheFacture } from './facture-fiche.js';
import {
  assainirCatalogue, chercher, ligneDepuisArticle, articlesSansPrix,
} from './catalogue-vente.js';
import { poser, imprimerCadre, telecharger } from './impression.js';

/** Dans le facturier, une absence de montant se lit « — », pas « 0,00 € ». */
const sommeOuTiret = (v) => (Number.isFinite(v) ? euros(v) : '—');
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const CLE_LOCALE = 'ngs38-facturier';

const etat = {
  livre: null,
  catalogue: null,
  document: null,
  facture: null,
  contrat: null,
  vue: 'factures',
  impayees: false,
};

/* ------------------------------------------------------------ le livre */

const livreVide = () => ({
  version: 1,
  prefixeFacture: 'F',
  prefixeAvoir: 'A',
  factures: [],
  contrats: [],
  /*
   * Ce que l'agence saisit elle-même : son compte, son lien de paiement,
   * ses mentions de société. Ça vit dans le livre et non dans le code —
   * l'agence n'a ni à me le demander ni à attendre une nouvelle version du
   * fichier pour changer de banque.
   */
  agence: {},
});

/** Un livre venu d'ailleurs peut manquer de tout : on le complète. */
function assainir(lu) {
  const l = { ...livreVide(), ...(lu || {}) };
  l.factures = Array.isArray(l.factures) ? l.factures : [];
  l.contrats = Array.isArray(l.contrats) ? l.contrats : [];
  l.agence = (l.agence && typeof l.agence === 'object') ? l.agence : {};
  return l;
}

function enregistrerLocal() {
  try {
    localStorage.setItem(CLE_LOCALE, JSON.stringify(etat.livre));
  } catch (e) {
    // Navigation privée, stockage plein : le fichier reste la vraie sauvegarde.
  }
}

/* --------------------------------------------------------- les chiffres */

function chiffres() {
  const j = journal(etat.livre, aujourdhui());
  etat.journal = j;
  const mettre = (sel, v, alerte = false) => {
    const n = $(sel);
    n.textContent = v;
    n.classList.toggle('mauvais', alerte);
  };
  mettre('#c-encaisse', sommeOuTiret(j.encaisse));
  mettre('#c-attendu', sommeOuTiret(j.attendu));
  mettre('#c-retard', j.enRetard.nombre ? sommeOuTiret(j.enRetard.montant) : '—',
    j.enRetard.nombre > 0);
  mettre('#c-ca', sommeOuTiret(j.caHt));
  mettre('#c-tva', sommeOuTiret(j.tvaCollectee));
  mettre('#c-emises', String(j.emises));

  const avis = $('#alertes');
  const mots = [];
  if (j.enRetard.nombre) {
    mots.push(`<b>${j.enRetard.nombre} facture(s) en retard</b> pour ${
      sommeOuTiret(j.enRetard.montant)}.`);
  }
  avis.innerHTML = mots.join('<br>');
  avis.hidden = !mots.length;
}

/* -------------------------------------------------------- les factures */

function listeFactures() {
  const liste = [...etat.livre.factures].sort((a, b) => String(b.date).localeCompare(a.date));
  const vues = etat.impayees ? liste.filter((f) => f.etat === 'emise') : liste;
  $('#liste-factures').innerHTML = vues.length ? vues.map((f) => {
    const t = totauxFacture(f);
    const j = retard(f, aujourdhui());
    return `<li data-numero="${echapper(f.numero)}" class="${
      etat.facture === f.numero ? 'active' : ''}">
      <span class="puce ${f.etat}">${echapper((f.numero || '').slice(-3))}</span>
      <span class="nom">${echapper((f.client && f.client.nom) || 'Sans client')}</span>
      <span class="det">${echapper(f.numero)} · ${echapper(f.date || '')} ·
        ${echapper(ETATS[f.etat] || f.etat)} · ${sommeOuTiret(t.netAPayer)}${
  j ? ` · <b class="mauvais">${j} j de retard</b>` : ''}</span>
    </li>`;
  }).join('') : '<li class="vide">Aucune facture. « Nouvelle facture » pour commencer.</li>';

  $$('#liste-factures li[data-numero]').forEach((n) => n.addEventListener('click', () => {
    etat.facture = n.dataset.numero;
    tout();
  }));
}

const factureCourante = () => etat.livre.factures.find((f) => f.numero === etat.facture);

/** L'identité portée par la page, complétée de ce que l'agence a saisi. */
const agenceCourante = () => fusionnerAgence(globalThis.__agence || {}, etat.livre.agence);

function panneauFacture() {
  const f = factureCourante();
  $('#panneau-facture').hidden = !f;
  if (!f) return;
  const fige = f.etat === 'emise' || f.etat === 'payee' || f.etat === 'annulee';

  $('#p-numero').textContent = f.numero;
  $('#p-etat').value = f.etat;
  $('#p-date').value = f.date || '';
  $('#p-delai').value = f.delaiPaiement ?? 30;
  $('#p-objet').value = f.objet || '';
  $('#p-chantier').value = f.chantier || '';
  $('#p-execution').value = f.execution || '';
  $('#p-reference').value = f.reference || '';
  $('#p-client-nom').value = (f.client && f.client.nom) || '';
  $('#p-client-adresse').value = (f.client && f.client.adresse) || '';
  $('#p-client-siret').value = (f.client && f.client.siret) || '';
  $('#p-acompte').value = f.acompte ?? 0;

  /*
   * Une facture émise ne se modifie plus. On grise au lieu de masquer :
   * l'agence doit pouvoir relire ce qu'elle a envoyé.
   */
  $$('#panneau-facture input, #panneau-facture select, #panneau-facture textarea')
    .forEach((n) => { if (n.id !== 'p-etat') n.disabled = fige; });
  $('#b-ligne').disabled = fige;
  $('#b-supprimer').disabled = f.etat !== 'brouillon';
  $('#b-avoir').hidden = f.etat !== 'emise' && f.etat !== 'payee';

  $('#lignes').innerHTML = (f.lignes || []).map((l, i) => `<li data-i="${i}">
    <input type="text" data-r="designation" value="${echapper(l.designation || '')}"
      placeholder="Désignation" ${fige ? 'disabled' : ''}>
    <input type="text" data-r="detail" value="${echapper(l.detail || '')}"
      placeholder="Précision" ${fige ? 'disabled' : ''}>
    <input type="number" data-r="quantite" value="${l.quantite ?? 1}" step="0.01"
      ${fige ? 'disabled' : ''}>
    <input type="number" data-r="prixUnitaire" value="${l.prixUnitaire ?? 0}" step="0.01"
      ${fige ? 'disabled' : ''}>
    <select data-r="tva" ${fige ? 'disabled' : ''}>
      ${[0.2, 0.1, 0.055, 0].map((t) => `<option value="${t}" ${
  Number(l.tva) === t ? 'selected' : ''}>${fr(t * 100, 1)} %</option>`).join('')}
    </select>
    <button type="button" class="btn btn-puce btn-retrait" data-r="retirer"
      ${fige ? 'disabled' : ''}>&#215;</button>
  </li>`).join('');

  /*
   * Une ligne posée depuis le catalogue sans prix : elle doit se voir. Un
   * zéro sur une facture ne se remarque pas, et part chez le client.
   */
  const sansPrix = (f.lignes || []).filter((l) => !(Number(l.prixUnitaire) > 0)
    && (l.designation || '').trim());
  $$('#lignes li').forEach((n) => {
    const l = f.lignes[Number(n.dataset.i)];
    n.classList.toggle('a-chiffrer', !!l && !(Number(l.prixUnitaire) > 0)
      && !!(l.designation || '').trim());
  });
  const note = $('#lignes-sans-prix');
  note.hidden = !sansPrix.length;
  note.textContent = sansPrix.length
    ? `${sansPrix.length} ligne(s) sans prix : ${
      sansPrix.map((l) => l.designation).join(', ')}. Le total est incomplet tant `
      + 'que le montant n\'y est pas.'
    : '';

  $$('#lignes li').forEach((n) => {
    const i = Number(n.dataset.i);
    const champ = (role, ev, fait) => {
      const c = n.querySelector(`[data-r="${role}"]`);
      if (c) c.addEventListener(ev, () => { fait(c); majFacture(); });
    };
    champ('designation', 'input', (c) => { f.lignes[i].designation = c.value; });
    champ('detail', 'input', (c) => { f.lignes[i].detail = c.value; });
    champ('quantite', 'input', (c) => { f.lignes[i].quantite = Number(c.value); });
    champ('prixUnitaire', 'input', (c) => { f.lignes[i].prixUnitaire = Number(c.value); });
    champ('tva', 'change', (c) => { f.lignes[i].tva = Number(c.value); });
    champ('retirer', 'click', () => { f.lignes.splice(i, 1); });
  });

  catalogueAffiche();
  totauxAffiches(f);
}

/* ------------------------------------------------------- le catalogue */

/**
 * Le catalogue, au-dessus des lignes.
 *
 * On tape trois lettres, on clique, la ligne est posée : désignation,
 * référence, unité et prix. C'est le but de l'outil — une facture de dix
 * lignes ne doit pas coûter un quart d'heure de frappe.
 *
 * Un article que l'agence n'a pas encore chiffré s'ajoute quand même. Le prix
 * manquant se signale au lieu de sortir un zéro qui, lui, passerait.
 */
function catalogueAffiche() {
  const f = factureCourante();
  const fige = f && f.etat !== 'brouillon';
  $('#catalogue').hidden = !f || fige;
  if (!f || fige) return;

  const requete = $('#cat-q').value.trim();
  const famille = $('#cat-famille').value;
  const MAX = 12;

  /*
   * Tant qu'on n'a rien demandé, on ne déroule pas quarante-cinq articles
   * au-dessus des lignes : le panneau doit rester lisible.
   */
  if (!requete && !famille) {
    $('#cat-resultats').innerHTML = '<li class="vide">Tapez trois lettres, ou '
      + 'choisissez une famille, pour poser une ligne en un clic.</li>';
    return;
  }
  const trouves = chercher(etat.catalogue, requete, famille);

  $('#cat-resultats').innerHTML = trouves.length
    ? trouves.slice(0, MAX).map((a) => {
      const l = ligneDepuisArticle(a, etat.catalogue);
      return `<li><button type="button" data-cle="${echapper(a.cle)}">
        <span class="nom">${echapper(a.designation)}</span>
        <span class="prix${l.aChiffrer ? ' a-chiffrer' : ''}">${
  l.aChiffrer ? 'prix à renseigner' : `${sommeOuTiret(l.prixUnitaire)}${
    a.unite && a.unite !== 'u' ? ` / ${echapper(a.unite)}` : ''}`}</span>
        <span class="det">${echapper([a.reference, (etat.catalogue.familles || {})[a.famille]]
    .filter(Boolean).join(' · '))}</span>
      </button></li>`;
    }).join('') + (trouves.length > MAX
      ? `<li class="vide">${trouves.length - MAX} autre(s) : précisez la recherche.</li>` : '')
    : '<li class="vide">Rien à ce nom dans le catalogue. '
      + '« Ajouter une ligne vide » pour saisir à la main.</li>';

  $$('#cat-resultats button[data-cle]').forEach((n) => n.addEventListener('click', () => {
    const article = etat.catalogue.articles.find((a) => a.cle === n.dataset.cle);
    if (!article) return;
    const fac = factureCourante();
    /*
     * La première ligne d'une facture neuve est vide : on la remplit au lieu
     * d'en ajouter une seconde, sans quoi chaque facture commence par un
     * blanc que l'agence doit penser à retirer.
     */
    const l = ligneDepuisArticle(article, etat.catalogue);
    const premiere = fac.lignes[0];
    if (fac.lignes.length === 1 && !premiere.designation && !premiere.prixUnitaire) {
      fac.lignes[0] = l;
    } else {
      fac.lignes.push(l);
    }
    panneauFacture();
    majFacture();
  }));
}

function totauxAffiches(f) {
  const t = totauxFacture(f);
  $('#p-totaux').innerHTML = `
    <div><span>Total HT</span><b>${sommeOuTiret(t.ht)}</b></div>
    ${t.tvas.map((x) => `<div><span>TVA ${echapper(fr(x.taux * 100, 1))} %</span>
      <b>${sommeOuTiret(x.montant)}</b></div>`).join('')}
    <div><span>Total TTC</span><b>${sommeOuTiret(t.ttc)}</b></div>
    ${t.acompte ? `<div><span>Acompte</span><b>-${sommeOuTiret(t.acompte)}</b></div>` : ''}
    <div class="gros"><span>Net à payer</span><b>${sommeOuTiret(t.netAPayer)}</b></div>`;
}

/** Après toute modification : on recalcule, on réaffiche, on garde. */
function majFacture() {
  const f = factureCourante();
  if (f) totauxAffiches(f);
  chiffres();
  listeFactures();
  enregistrerLocal();
}

function nouvelleFacture() {
  const annee = new Date().getFullYear();
  const f = {
    numero: prochainNumero(etat.livre.factures, annee, etat.livre.prefixeFacture),
    type: 'facture',
    etat: 'brouillon',
    date: aujourdhui(),
    delaiPaiement: 30,
    objet: '',
    client: { nom: '', adresse: '', siret: '' },
    lignes: [{ designation: '', quantite: 1, prixUnitaire: 0, tva: 0.2 }],
    acompte: 0,
  };
  etat.livre.factures.push(f);
  etat.facture = f.numero;
  tout();
}

/**
 * L'avoir.
 *
 * Il reprend les lignes de la facture en négatif, porte sa propre suite de
 * numéros, et bascule la facture d'origine en « annulée ». On ne touche
 * jamais au document déjà parti chez le client.
 */
function etablirAvoir() {
  const f = factureCourante();
  if (!f) return;
  const annee = new Date().getFullYear();
  const a = {
    numero: prochainNumero(etat.livre.factures, annee, etat.livre.prefixeAvoir),
    type: 'avoir',
    etat: 'emise',
    date: aujourdhui(),
    annule: f.numero,
    motif: '',
    objet: `Annulation de la facture ${f.numero}`,
    client: { ...(f.client || {}) },
    lignes: (f.lignes || []).map((l) => ({ ...l, quantite: -Math.abs(Number(l.quantite) || 0) })),
    acompte: 0,
  };
  etat.livre.factures.push(a);
  f.etat = 'annulee';
  etat.facture = a.numero;
  tout();
}

/* ------------------------------------------------------ la maintenance */

function listeContrats() {
  const c = etat.livre.contrats;
  $('#liste-contrats').innerHTML = c.length ? c.map((x) => {
    const reste = aFacturer(x, etat.livre.factures, aujourdhui());
    return `<li data-cle="${echapper(x.cle)}" class="${etat.contrat === x.cle ? 'active' : ''}">
      <span class="puce">${echapper(x.cle)}</span>
      <span class="nom">${echapper(x.client || 'Sans client')}</span>
      <span class="det">${sommeOuTiret(Number(x.montantHt))} ·
        ${echapper((PERIODES[x.periode] || PERIODES.annuelle).label.toLowerCase())}${
  reste.length ? ` · <b class="mauvais">${reste.length} échéance(s) à facturer</b>` : ''}</span>
    </li>`;
  }).join('') : '<li class="vide">Aucun contrat de maintenance.</li>';

  $$('#liste-contrats li[data-cle]').forEach((n) => n.addEventListener('click', () => {
    etat.contrat = n.dataset.cle;
    tout();
  }));
}

const contratCourant = () => etat.livre.contrats.find((c) => c.cle === etat.contrat);

function panneauContrat() {
  const c = contratCourant();
  $('#panneau-contrat').hidden = !c;
  if (!c) return;
  $('#ct-cle').textContent = c.cle;
  $('#ct-client').value = c.client || '';
  $('#ct-objet').value = c.objet || '';
  $('#ct-montant').value = c.montantHt ?? 0;
  $('#ct-periode').value = c.periode || 'annuelle';
  $('#ct-debut').value = c.debut || '';
  $('#ct-fin').value = c.fin || '';

  const reste = aFacturer(c, etat.livre.factures, aujourdhui());
  const passees = echeancesContrat(c, aujourdhui()).length;
  $('#ct-echeances').innerHTML = `
    <p class="det">${passees} échéance(s) échues à ce jour, dont
      <b>${reste.length} à facturer</b>.</p>
    ${reste.map((e) => `<div class="echeance">
      <span>${echapper(e.date)} · ${sommeOuTiret(e.montantHt)} HT</span>
      <button type="button" class="btn btn-petit" data-echeance="${echapper(e.date)}">
        Facturer</button>
    </div>`).join('')}`;

  $$('#ct-echeances [data-echeance]').forEach((n) => n.addEventListener('click', () => {
    facturerEcheance(c, n.dataset.echeance);
  }));
}

/** Une échéance de maintenance devient une facture, en brouillon. */
function facturerEcheance(contrat, date) {
  const annee = new Date().getFullYear();
  const p = PERIODES[contrat.periode] || PERIODES.annuelle;
  const fin = new Date(`${date}T12:00:00`);
  fin.setMonth(fin.getMonth() + p.mois);
  fin.setDate(fin.getDate() - 1);
  const f = {
    numero: prochainNumero(etat.livre.factures, annee, etat.livre.prefixeFacture),
    type: 'facture',
    etat: 'brouillon',
    date: aujourdhui(),
    delaiPaiement: 30,
    contrat: contrat.cle,
    periodeDebut: date,
    periodeFin: fin.toISOString().slice(0, 10),
    objet: contrat.objet || 'Contrat de maintenance',
    client: { nom: contrat.client || '' },
    lignes: [{
      designation: contrat.objet || 'Maintenance du système de sécurité',
      detail: `Période du ${date} au ${fin.toISOString().slice(0, 10)}`,
      quantite: 1,
      prixUnitaire: Number(contrat.montantHt) || 0,
      tva: 0.2,
    }],
    acompte: 0,
  };
  etat.livre.factures.push(f);
  etat.facture = f.numero;
  etat.vue = 'factures';
  tout();
}

function nouveauContrat() {
  const n = etat.livre.contrats.length + 1;
  etat.livre.contrats.push({
    cle: `C${String(n).padStart(2, '0')}`,
    client: '',
    objet: 'Maintenance du système de sécurité',
    montantHt: 0,
    periode: 'annuelle',
    debut: aujourdhui(),
    fin: '',
  });
  etat.contrat = `C${String(n).padStart(2, '0')}`;
  tout();
}

/* --------------------------------------------------------- l'entreprise */

/*
 * Où chaque champ de l'écran va se ranger dans le livre. Deux niveaux :
 * `banque` et `aCompleter` sont des sous-ensembles, le reste est à plat.
 */
const CHAMPS_AGENCE = [
  ['#ag-iban', 'banque', 'iban'],
  ['#ag-bic', 'banque', 'bic'],
  ['#ag-titulaire', 'banque', 'titulaire'],
  ['#ag-lien', null, 'lienPaiement'],
  ['#ag-capital', 'aCompleter', 'capitalSocial'],
  ['#ag-greffe', 'aCompleter', 'rcsGreffe'],
  ['#ag-assurance', null, 'assurance'],
  ['#ag-mediateur', null, 'mediateur'],
];

const lireAgence = (sous, cle) => {
  const a = etat.livre.agence || {};
  const v = sous ? (a[sous] || {})[cle] : a[cle];
  return v === null || v === undefined ? '' : String(v);
};

function ecrireAgence(sous, cle, valeur) {
  const a = etat.livre.agence;
  if (sous) {
    a[sous] = a[sous] || {};
    a[sous][cle] = valeur;
  } else {
    a[cle] = valeur;
  }
}

function panneauAgence() {
  for (const [sel, sous, cle] of CHAMPS_AGENCE) $(sel).value = lireAgence(sous, cle);

  const retenus = agenceCourante().paiements || [];
  $('#ag-paiements').innerHTML = Object.entries(MOYENS).map(([cle, m]) => `
    <label class="case"><input type="checkbox" data-moyen="${echapper(cle)}"
      ${retenus.includes(cle) ? 'checked' : ''}> ${echapper(m.label)}</label>`).join('');
  $$('#ag-paiements [data-moyen]').forEach((n) => n.addEventListener('change', () => {
    const choisis = $$('#ag-paiements [data-moyen]')
      .filter((c) => c.checked).map((c) => c.dataset.moyen);
    etat.livre.agence.paiements = choisis;
    enregistrerLocal();
    etatAgence();
  }));

  etatAgence();
}

/**
 * Ce que porteront les prochaines factures, dit sans reproche.
 *
 * C'est un état, pas une alerte : l'agence vient ici pour remplir, elle n'a
 * pas besoin qu'on le lui rappelle ailleurs.
 */
function etatAgence() {
  const a = agenceCourante();
  const dit = [];
  const b = a.banque || {};
  dit.push(b.iban ? `IBAN : ${b.iban}` : 'Aucun IBAN : vos factures annoncent un '
    + 'virement sans donner le compte.');
  const l = lienPaiement(a);
  if (l) dit.push(`Lien de paiement : ${l.texte}`);
  const manque = mentionsManquantes(a);
  if (manque.length) dit.push(`Mentions non renseignées : ${manque.join(', ')}.`);
  $('#ag-etat').innerHTML = dit.map(echapper).join('<br>');
}

/* ----------------------------------------------------------- le journal */

function vueJournal() {
  const j = etat.journal;
  $('#retards').innerHTML = j.enRetard.factures.length
    ? j.enRetard.factures.map((f) => `<li>
        <span class="puce mauvais">${echapper(String(f.jours))}j</span>
        <span class="nom">${echapper(f.client)}</span>
        <span class="det">${echapper(f.numero)} · ${sommeOuTiret(f.montant)}</span>
      </li>`).join('')
    : '<li class="vide">Rien en retard.</li>';

  const table = (rangs) => (rangs.length ? `<table>
    <thead><tr><th>Période</th><th class="n">Factures</th><th class="n">HT</th>
      <th class="n">TVA</th><th class="n">TTC</th></tr></thead>
    <tbody>${rangs.map((r) => `<tr><td>${echapper(r.periode)}</td>
      <td class="n">${r.factures}</td><td class="n">${sommeOuTiret(r.ht)}</td>
      <td class="n">${sommeOuTiret(r.tva)}</td><td class="n">${sommeOuTiret(r.ttc)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="det">Rien encore.</p>');

  $('#par-trimestre').innerHTML = table(j.parTrimestre);
  $('#par-mois').innerHTML = table(j.parMois);
}

/* ------------------------------------------------------------- fichiers */

/**
 * L'export comptable.
 *
 * Un CSV que le comptable ouvre dans un tableur. Le point-virgule et le
 * BOM sont là pour qu'Excel en français l'ouvre en colonnes du premier coup,
 * sans passer par l'assistant d'importation.
 */
function exportComptable() {
  const colonnes = ['Numéro', 'Date', 'Échéance', 'Client', 'Objet', 'État',
    'Total HT', 'TVA', 'Total TTC', 'Acompte', 'Net à payer'];
  const champ = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const nombre = (v) => String(Number(v).toFixed(2)).replace('.', ',');
  const lignes = etat.livre.factures
    .filter((f) => f.etat !== 'brouillon')
    .sort((a, b) => String(a.date).localeCompare(b.date))
    .map((f) => {
      const t = totauxFacture(f);
      return [
        champ(f.numero), champ(f.date),
        champ(f.echeance || echeance(f.date, f.delaiPaiement || 30)),
        champ((f.client && f.client.nom) || ''), champ(f.objet || ''),
        champ(ETATS[f.etat] || f.etat),
        nombre(t.ht), nombre(t.tva), nombre(t.ttc), nombre(t.acompte),
        nombre(t.netAPayer),
      ].join(';');
    });
  const csv = `﻿${colonnes.map(champ).join(';')}\n${lignes.join('\n')}\n`;
  telecharger(`comptabilite-${aujourdhui()}.csv`, csv, 'text/csv;charset=utf-8');
}

/**
 * L'aperçu, puis le PDF.
 *
 * Le document s'affiche dans un cadre de la page même. Il passait par une
 * fenêtre séparée, que les navigateurs bloquent volontiers et sans le dire :
 * le bouton ne répondait pas, et l'outil passait pour cassé. Un cadre, lui,
 * ne se bloque pas — et l'agence voit ce qu'elle envoie avant de l'envoyer.
 */
async function produireFacture() {
  const f = factureCourante();
  if (!f) return;
  etat.document = {
    html: ficheFacture(f, agenceCourante(), { aujourdhui: aujourdhui() }),
    nom: `${(f.numero || 'facture').toLowerCase()}.html`,
  };
  $('#apercu-titre').textContent = `${f.type === 'avoir' ? 'Avoir' : 'Facture'} ${f.numero}`;

  ouvrirApercu(true);
  await poser($('#apercu-page'), etat.document.html);
}

/**
 * Ouvrir ou fermer l'aperçu, et le dire à la page entière.
 *
 * La classe posée sur `body` est ce à quoi s'accrochent les règles
 * d'impression : aperçu ouvert, l'écran de l'agence disparaît du papier et
 * seul le document reste. Un PDF qui emporte la barre d'outils, les listes
 * et les totaux de l'agence n'est pas un document qu'on envoie à un client.
 */
function ouvrirApercu(ouvert) {
  $('#apercu').hidden = !ouvert;
  document.body.classList.toggle('apercu-ouvert', ouvert);
}

/** Le PDF : la fenêtre d'impression du navigateur, sur le seul cadre. */
function enregistrerPdf() {
  if (imprimerCadre($('#apercu-page'))) return;
  // L'impression refusée, le document doit quand même pouvoir sortir.
  if (etat.document) telecharger(etat.document.nom, etat.document.html);
}

/* --------------------------------------------------------------- montage */

function tout() {
  chiffres();
  listeFactures();
  panneauFacture();
  listeContrats();
  panneauContrat();
  vueJournal();
  panneauAgence();
  for (const v of ['factures', 'maintenance', 'journal', 'agence']) {
    $(`#vue-${v}`).hidden = etat.vue !== v;
  }
  $$('#onglets .onglet').forEach((o) => o.classList.toggle('actif', o.dataset.vue === etat.vue));
  enregistrerLocal();
}

export function monter(livre, catalogue) {
  etat.livre = assainir(livre);
  etat.catalogue = assainirCatalogue(catalogue || globalThis.__catalogueFacturation);

  $('#cat-famille').innerHTML = '<option value="">Toutes les familles</option>'
    + Object.entries(etat.catalogue.familles)
      .map(([cle, label]) => `<option value="${cle}">${label}</option>`).join('');
  $('#cat-q').addEventListener('input', catalogueAffiche);
  $('#cat-famille').addEventListener('change', catalogueAffiche);

  $('#p-etat').innerHTML = Object.entries(ETATS)
    .map(([cle, label]) => `<option value="${cle}">${label}</option>`).join('');
  $('#ct-periode').innerHTML = Object.entries(PERIODES)
    .map(([cle, p]) => `<option value="${cle}">${p.label}</option>`).join('');

  const champ = (sel, ev, fait) => $(sel).addEventListener(ev, () => {
    const f = factureCourante();
    if (!f) return;
    fait(f, $(sel));
    majFacture();
    if (sel === '#p-etat') panneauFacture();
  });
  champ('#p-etat', 'change', (f, n) => { f.etat = n.value; });
  champ('#p-date', 'change', (f, n) => { f.date = n.value; });
  champ('#p-delai', 'change', (f, n) => { f.delaiPaiement = Number(n.value); });
  champ('#p-objet', 'input', (f, n) => { f.objet = n.value; });
  champ('#p-chantier', 'input', (f, n) => { f.chantier = n.value; });
  champ('#p-execution', 'change', (f, n) => { f.execution = n.value; });
  champ('#p-reference', 'input', (f, n) => { f.reference = n.value; });
  champ('#p-acompte', 'input', (f, n) => { f.acompte = Number(n.value); });
  champ('#p-client-nom', 'input', (f, n) => { f.client.nom = n.value; });
  champ('#p-client-adresse', 'input', (f, n) => { f.client.adresse = n.value; });
  champ('#p-client-siret', 'input', (f, n) => { f.client.siret = n.value; });

  const champC = (sel, ev, fait) => $(sel).addEventListener(ev, () => {
    const c = contratCourant();
    if (!c) return;
    fait(c, $(sel));
    tout();
  });
  champC('#ct-client', 'change', (c, n) => { c.client = n.value; });
  champC('#ct-objet', 'change', (c, n) => { c.objet = n.value; });
  champC('#ct-montant', 'change', (c, n) => { c.montantHt = Number(n.value); });
  champC('#ct-periode', 'change', (c, n) => { c.periode = n.value; });
  champC('#ct-debut', 'change', (c, n) => { c.debut = n.value; });
  champC('#ct-fin', 'change', (c, n) => { c.fin = n.value; });

  $('#b-facture').addEventListener('click', nouvelleFacture);
  $('#b-contrat').addEventListener('click', nouveauContrat);
  $('#b-ligne').addEventListener('click', () => {
    const f = factureCourante();
    if (!f) return;
    f.lignes.push({ designation: '', quantite: 1, prixUnitaire: 0, tva: 0.2 });
    panneauFacture();
    majFacture();
  });
  $('#b-supprimer').addEventListener('click', () => {
    const f = factureCourante();
    if (!f || f.etat !== 'brouillon') return;
    etat.livre.factures = etat.livre.factures.filter((x) => x.numero !== f.numero);
    etat.facture = null;
    tout();
  });
  $('#b-contrat-retirer').addEventListener('click', () => {
    if (!etat.contrat) return;
    etat.livre.contrats = etat.livre.contrats.filter((c) => c.cle !== etat.contrat);
    etat.contrat = null;
    tout();
  });
  $('#b-avoir').addEventListener('click', etablirAvoir);
  $('#b-imprimer').addEventListener('click', produireFacture);
  $('#b-pdf').addEventListener('click', enregistrerPdf);
  $('#b-html').addEventListener('click', () => {
    if (etat.document) telecharger(etat.document.nom, etat.document.html);
  });
  $('#b-fermer').addEventListener('click', () => ouvrirApercu(false));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !$('#apercu').hidden) ouvrirApercu(false);
  });

  /*
   * Avant toute impression — le bouton, mais aussi Ctrl+P et le menu du
   * navigateur, par où l'agence est passée — le cadre est ramené à la
   * hauteur de son contenu. Sans cela il s'imprime tronqué : la dernière
   * facture sortie s'arrêtait au milieu d'un mot.
   */
  window.addEventListener('beforeprint', () => {
    const cadre = $('#apercu-page');
    const doc = cadre.contentDocument;
    if (!doc || $('#apercu').hidden) return;
    /*
     * La hauteur se mesure sur la feuille, pas sur le document : le fond
     * gris de l'aperçu déborde sinon sous la facture, et sort imprimé en
     * bas de page comme une tache.
     */
    const feuille = doc.querySelector('.feuille');
    cadre.style.height = `${Math.ceil((feuille || doc.documentElement).scrollHeight) + 2}px`;
  });
  window.addEventListener('afterprint', () => { $('#apercu-page').style.height = ''; });
  $('#b-export').addEventListener('click', exportComptable);
  $('#f-impayees').addEventListener('change', () => {
    etat.impayees = $('#f-impayees').checked;
    listeFactures();
  });

  $('#b-enregistrer').addEventListener('click', () => {
    telecharger('facturier.json', `${JSON.stringify(etat.livre, null, 1)}\n`,
      'application/json');
  });
  $('#b-ouvrir').addEventListener('click', () => $('#fichier').click());
  $('#fichier').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      etat.livre = assainir(JSON.parse(await f.text()));
      etat.facture = null;
      etat.contrat = null;
      tout();
    } catch (err) {
      $('#alertes').hidden = false;
      $('#alertes').innerHTML = `<b>Fichier refusé.</b> ${echapper(err.message)}`;
    }
    ev.target.value = '';
  });

  for (const [sel, sous, cle] of CHAMPS_AGENCE) {
    $(sel).addEventListener('input', () => {
      ecrireAgence(sous, cle, $(sel).value.trim());
      enregistrerLocal();
      etatAgence();
    });
  }

  $$('#onglets .onglet').forEach((o) => o.addEventListener('click', () => {
    etat.vue = o.dataset.vue;
    tout();
  }));

  /*
   * Un livre vide n'offre aucun champ où écrire : l'écran s'ouvrait sur une
   * liste vide et un panneau caché, et l'on croyait l'outil inerte. La
   * première facture s'ouvre donc d'elle-même, en brouillon — un brouillon ne
   * compte nulle part et se supprime d'un bouton.
   */
  if (!etat.livre.factures.length) nouvelleFacture();
  else tout();
}

export function demarrer() {
  let livre = null;
  try {
    const garde = localStorage.getItem(CLE_LOCALE);
    if (garde) livre = JSON.parse(garde);
  } catch (e) {
    livre = null;
  }
  monter(livre || globalThis.__livre || livreVide());
}
