/**
 * La facture remise au client.
 *
 * Même feuille que l'étude et le devis : même rouge, même en-tête, même
 * façon de tomber juste en A4. Un client qui a reçu l'étude puis le devis
 * reconnaît la facture sans la lire.
 *
 * Ce document porte les mentions que le code de commerce impose. Celles qui
 * manquent encore à l'identité de l'agence ne s'affichent PAS ici, et c'est
 * volontaire : ce papier est celui du client. Un bandeau annonçant au client
 * que la facture qu'il reçoit n'est pas en règle ne lui apprend rien
 * d'utile, jette un doute sur l'agence, et a déjà été envoyé une fois.
 *
 * L'alerte existe, mais de l'autre côté : sur l'écran du facturier, et dans
 * la barre de l'aperçu, avant que le document ne parte. C'est là qu'elle
 * sert à quelque chose.
 */

import { fr, echapper } from './format.js';
import { euros } from './prix.js';
import { reglagesPdf, MARGES, zoneImprimable } from './papier.js';
import { badgesPaiement } from './paiement.js';
import {
  totauxFacture, echeance, retard, penalites,
  coordonneesBancaires, lienPaiement,
  INDEMNITE_RECOUVREMENT, PENALITE_MULTIPLE, ETATS,
} from './facture.js';

/*
 * Les règles qui ne valent que sur le papier, écrites une fois.
 *
 * Elles servent deux fois : à l'impression, et pour mesurer la feuille
 * avant de l'imprimer. Les écrire deux fois, c'est se garantir qu'un jour
 * la mesure et le papier ne diront plus la même chose.
 */
const REGLES_PAPIER = `
  body { background:#fff; font-size:10.5pt; }
  .feuille { border:0; max-width:none; padding:0; }
  .pdf { display:none; }
  h1 { font-size:19pt; }
  th, td { padding:3px 9px; }
  .garde { padding-bottom:12px; margin-bottom:14px; }
  .parties { margin-bottom:10px; }
  .moyens { margin-top:6px; gap:5px; }
  .moyen { padding:3px 7px; }
  .bas { margin-top:8px; }
  .total div { padding:6px 14px; }
  .conditions { font-size:8.6pt; }
  .conditions p { margin-top:4px; }
  h3 { margin:16px 0 4px; }
  .mentions { font-size:8.2pt; }
  .mentions li { margin-bottom:2px; }
  .reglement { margin-top:8px; font-size:8.6pt; }
  .reglement p { margin-top:4px; }
  .pied { margin-top:8px; padding-top:6px; }
  table, .total, .reglement, .avis, .parties { break-inside:avoid; page-break-inside:avoid; }
  tr, li, .mentions { break-inside:avoid; page-break-inside:avoid; }
  thead { display:table-header-group; }
  .pied { break-before:avoid; page-break-before:avoid; }
`;

/**
 * Les mêmes règles, chacune rattachée à un préfixe.
 *
 * Une feuille de style ne se recopie pas sous une classe toute seule :
 * chaque sélecteur doit être repris. Les règles ci-dessus sont simples —
 * pas d'imbrication, pas d'arobase — et ce découpage suffit.
 */
const prefixer = (regles, prefixe) => regles.replace(
  /(^|\})\s*([^{}@]+?)\s*\{/g,
  (tout, avant, selecteurs) => `${avant}\n${selecteurs.split(',')
    .map((sel) => `${prefixe} ${sel.trim()}`).join(', ')} {`,
);

/** Un montant, ou rien du tout : sur une facture, un « 0,00 € » se lit mal. */
const somme = (v) => (Number.isFinite(v) ? euros(v) : '');

const jourFr = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
};

const STYLE_FACTURE = (papier) => `
:root { --rouge:#c8102e; --encre:#1a1d23; --doux:#5b6472; --bord:#dde1e7; --fond:#f6f7f9; }
* { box-sizing:border-box; }
body { margin:0; background:var(--fond); color:var(--encre);
  font:15px/1.6 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
.feuille { max-width:900px; margin:0 auto; background:#fff; padding:34px 40px 48px;
  border:1px solid var(--bord); }
.garde { display:flex; gap:24px; justify-content:space-between; align-items:flex-start;
  border-bottom:3px solid var(--rouge); padding-bottom:18px; margin-bottom:22px; }
.bandeau { display:flex; gap:18px; align-items:flex-start; }
.bandeau img { width:90px; height:auto; }
.coord { font-size:13px; color:var(--doux); line-height:1.5; }
.coord .nom { font-size:19px; font-weight:800; color:var(--encre); margin:0 0 3px; }
.coord p { margin:0; }
.titre { text-align:right; }
.titre .surtitre { color:var(--rouge); font-weight:700; letter-spacing:.1em;
  font-size:12px; margin:0 0 4px; }
.titre h1 { font-size:26px; margin:0 0 6px; }
.titre p { margin:2px 0; font-size:13.5px; color:var(--doux); }
.parties { display:flex; gap:18px; margin:0 0 20px; }
.partie { flex:1 1 0; border:1px solid var(--bord); border-radius:8px; padding:12px 14px; }
.partie h2 { font-size:11px; text-transform:uppercase; letter-spacing:.06em;
  color:var(--doux); margin:0 0 6px; border:0; padding:0; }
.partie p { margin:2px 0; font-size:14px; }
.avis { background:#fff4f5; border:1px solid #f0c8ce; border-left:4px solid var(--rouge);
  border-radius:6px; padding:11px 14px; margin:0 0 18px; font-size:13.5px; color:#7a0a1c; }
table { border-collapse:collapse; width:100%; font-size:14px; margin:6px 0; }
th, td { text-align:left; padding:7px 9px; border-bottom:1px solid var(--bord);
  vertical-align:top; }
th { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--doux); }
td.n, th.n { text-align:right; white-space:nowrap; }
th:nth-child(2), td:nth-child(2) { width:56px; }
th:nth-child(3), td:nth-child(3) { width:92px; }
th:nth-child(4), td:nth-child(4) { width:62px; }
th:nth-child(5), td:nth-child(5) { width:100px; }
.det { display:block; font-size:11.5px; color:var(--doux); margin-top:2px; }
/*
 * Le bas de la facture, en deux colonnes.
 *
 * Les comptes tenaient seuls à droite, et la moitié gauche de la feuille
 * restait blanche pendant que les conditions de règlement poussaient la
 * facture sur une deuxième page. Elles occupent maintenant cette place :
 * c'est la mise en page d'usage, et elle rend la feuille.
 */
.bas { display:flex; gap:18px; align-items:flex-start; margin-top:16px; }
.conditions { flex:1 1 0; border:1px solid var(--bord); border-radius:8px;
  padding:12px 14px; font-size:12.5px; }
.conditions b { font-size:13px; }
.conditions p { margin:6px 0 0; }
.conditions .banque { font-variant-numeric:tabular-nums; letter-spacing:.01em; }
.conditions .lien a { color:var(--rouge); text-decoration:none; word-break:break-all; }
.conditions .lien a:hover { text-decoration:underline; }
.moyens { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 0; }
.moyen { display:flex; align-items:center; gap:6px; border:1px solid var(--bord);
  border-radius:6px; padding:4px 8px; background:#fff; }
.moyen svg, .moyen img { width:26px; height:18px; display:block; object-fit:contain; }
.moyen b { font-size:11.5px; font-weight:600; white-space:nowrap; }
.total { flex:0 0 340px; border:1px solid var(--bord); border-radius:8px; overflow:hidden; }
.total div { display:flex; justify-content:space-between; padding:8px 14px;
  border-bottom:1px solid var(--bord); font-size:14px; }
.total div:last-child { border-bottom:0; background:var(--encre); color:#fff;
  font-size:17px; font-weight:800; }
.total .fin { background:var(--fond); font-weight:700; }
.total .remise { color:var(--rouge); }
h3 { font-size:14px; margin:24px 0 6px; }
.mentions { font-size:12px; color:var(--doux); margin:6px 0; }
.mentions li { margin-bottom:4px; }
.reglement { display:flex; gap:18px; margin-top:16px; align-items:flex-start; }
.reglement > div { flex:1 1 0; border:1px solid var(--bord); border-radius:8px;
  padding:12px 14px; font-size:12.5px; }
.reglement b { font-size:13px; }
.reglement p { margin:6px 0 0; }
.reglement p:last-child { margin-bottom:0; }
.reglement .mentions { flex:1 1 0; margin:0; padding-left:18px; }
.precisions { margin-top:12px; }
.pied { color:var(--doux); font-size:11.5px; text-align:center; padding:16px 0 0;
  border-top:1px solid var(--bord); margin-top:26px; line-height:1.6; }
.pdf { position:fixed; right:20px; bottom:20px; z-index:9; background:var(--rouge);
  color:#fff; border:0; border-radius:999px; padding:13px 22px;
  font:600 15px/1 inherit; cursor:pointer; box-shadow:0 6px 20px rgba(0,0,0,.25); }
.pdf:hover { background:#a50d26; }
.pdf small { display:block; font-weight:400; font-size:11.5px; opacity:.85; margin-top:4px; }

@page { size:${papier.taille}; margin:${papier.marge}; }
/*
 * À l'impression, le rythme se resserre.
 *
 * Une facture de dix lignes doit tenir sur une feuille : une seconde page
 * qui ne porte que le pied et deux mentions donne l'air d'un document mal
 * réglé, et elle coûte une enveloppe plus épaisse à chaque envoi. Les
 * marges ci-dessous sont celles de l'écran, rabotées de ce qui ne manque
 * pas une fois sur papier.
 */
@media print {
  body { background:#fff; font-size:10.5pt; }
  .feuille { border:0; max-width:none; padding:0; }
  .pdf { display:none; }
  h1 { font-size:19pt; }
  th, td { padding:3px 9px; }
  .garde { padding-bottom:12px; margin-bottom:14px; }
  .parties { margin-bottom:10px; }
  .moyens { margin-top:6px; gap:5px; }
  .moyen { padding:3px 7px; }
  .bas { margin-top:8px; }
  .total div { padding:6px 14px; }
  .conditions { font-size:8.6pt; }
  .conditions p { margin-top:4px; }
  h3 { margin:16px 0 4px; }
  .mentions { font-size:8.2pt; }
  .mentions li { margin-bottom:2px; }
  .reglement { margin-top:8px; font-size:8.6pt; }
  .reglement p { margin-top:4px; }
  .pied { margin-top:8px; padding-top:6px; }
  table, .total, .reglement, .avis, .parties { break-inside:avoid; page-break-inside:avoid; }
  tr, li, .mentions { break-inside:avoid; page-break-inside:avoid; }
  thead { display:table-header-group; }
  .pied { break-before:avoid; page-break-before:avoid; }
}

/*
 * Les mêmes règles, accrochées à une classe.
 *
 * L'écran a besoin de mesurer ce que donnera le papier AVANT d'imprimer :
 * c'est cette hauteur qui dit au cadre d'aperçu quelle taille prendre.
 * Un cadre plus haut que son contenu fait sortir une page blanche à la
 * suite — c'est arrivé — et un cadre plus court le coupe.
 */
${prefixer(REGLES_PAPIER, 'html.papier')}`;

/** Le bloc d'identité de l'agence, mentions légales comprises. */
function emetteur(agence) {
  const c = agence.aCompleter || {};
  const lignes = [
    agence.adresse,
    `${agence.telephone || ''} · ${agence.courriel || ''}`,
    `${agence.formeCourte || ''}${c.capitalSocial ? ` au capital de ${c.capitalSocial}` : ''}`,
    `SIRET ${agence.siret || ''} · APE ${agence.naf || ''}`,
    `TVA ${agence.tva || ''}`,
    c.rcsGreffe ? `RCS ${c.rcsGreffe} ${agence.siren || ''}` : '',
    c.assuranceRcPro || '',
  ].filter((l) => l && l.trim() && l.trim() !== '·');
  return lignes.map((l) => `<p>${echapper(l)}</p>`).join('');
}

/**
 * Compose la facture.
 *
 * @param {object} facture
 * @param {object} agence
 * @param {object} [options] `aujourdhui` pour figer la date des pénalités
 */
export function ficheFacture(facture, agence, options = {}) {
  const t = totauxFacture(facture);
  const r = reglagesPdf(facture);
  const papier = { taille: `${r.format} ${r.orientation}`, marge: MARGES[r.marges].css };
  const zone = zoneImprimable(r);
  const avoir = facture.type === 'avoir';
  const delai = Number(facture.delaiPaiement) > 0 ? Number(facture.delaiPaiement) : 30;
  const fin = facture.echeance || echeance(facture.date, delai);
  const banque = coordonneesBancaires(agence, facture);
  const lien = lienPaiement(agence, facture);
  const jours = retard({ ...facture, echeance: fin }, options.aujourdhui);
  const pen = jours
    ? penalites({ ...facture, echeance: fin }, options.aujourdhui, options.tauxLegal)
    : null;
  const cl = facture.client || {};

  const lignes = (facture.lignes || []).map((l) => {
    const q = Number(l.quantite) || 0;
    const pu = Number(l.prixUnitaire) || 0;
    const remise = Number(l.remise) || 0;
    return `<tr>
      <td>${echapper(l.designation || '')}
        ${l.detail ? `<span class="det">${echapper(l.detail)}</span>` : ''}
        ${remise ? `<span class="det">Remise ${echapper(fr(remise * 100, 0))} %</span>` : ''}</td>
      <td class="n">${echapper(fr(q, 2))}</td>
      <td class="n">${somme(pu)}</td>
      <td class="n">${echapper(fr((Number(l.tva) || 0) * 100, 1))} %</td>
      <td class="n">${somme(q * pu * (1 - remise))}</td>
    </tr>`;
  }).join('');

  const tvaLignes = t.tvas.map((x) => `<div><span>TVA ${echapper(fr(x.taux * 100, 1))} %
    sur ${somme(x.base)}</span><b>${somme(x.montant)}</b></div>`).join('');

  return `<!doctype html>
<html lang="fr" data-papier-largeur="${zone.largeur}" data-papier-hauteur="${
  zone.hauteur}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${avoir ? 'Avoir' : 'Facture'} ${echapper(facture.numero || '')} · ${
  echapper(agence.nomCommercial || '')}</title>
<style>${STYLE_FACTURE(papier)}</style></head>
<body><div class="feuille">

<header class="garde">
  <div class="bandeau">
    ${agence.logo ? `<img src="${agence.logo}" alt="">` : ''}
    <div class="coord">
      <p class="nom">${echapper(agence.nomCommercial || '')}</p>
      ${emetteur(agence)}
    </div>
  </div>
  <div class="titre">
    <p class="surtitre">${avoir ? 'AVOIR' : 'FACTURE'}</p>
    <h1>${echapper(facture.numero || '')}</h1>
    <p>Émise le ${echapper(jourFr(facture.date))}</p>
    ${facture.dateVente ? `<p>Prestation du ${echapper(jourFr(facture.dateVente))}</p>` : ''}
    ${avoir ? '' : `<p>Échéance le ${echapper(jourFr(fin))}</p>`}
    ${facture.etat && facture.etat !== 'emise'
    ? `<p><b>${echapper(ETATS[facture.etat] || facture.etat)}</b></p>` : ''}
  </div>
</header>

${avoir && facture.annule ? `<div class="avis"><b>Avoir.</b> Ce document annule
  la facture ${echapper(facture.annule)}${facture.motif
  ? ` : ${echapper(facture.motif)}` : ''}.</div>` : ''}

<div class="parties">
  <div class="partie">
    <h2>Facturé à</h2>
    <p><b>${echapper(cl.nom || '')}</b></p>
    ${cl.contact ? `<p>${echapper(cl.contact)}</p>` : ''}
    ${cl.adresse ? `<p>${echapper(cl.adresse)}</p>` : ''}
    ${cl.siret ? `<p>SIRET ${echapper(cl.siret)}</p>` : ''}
    ${cl.tva ? `<p>TVA ${echapper(cl.tva)}</p>` : ''}
  </div>
  <div class="partie">
    <h2>Objet</h2>
    <p>${echapper(facture.objet || '')}</p>
    ${facture.chantier ? `<p class="det">Chantier : ${echapper(facture.chantier)}</p>` : ''}
    ${facture.periodeDebut ? `<p class="det">Période du ${
  echapper(jourFr(facture.periodeDebut))}${facture.periodeFin
  ? ` au ${echapper(jourFr(facture.periodeFin))}` : ''}</p>` : ''}
    ${facture.execution ? `<p class="det">Exécution le ${
  echapper(jourFr(facture.execution))}</p>` : ''}
    ${facture.reference ? `<p class="det">Bon de commande ${
  echapper(facture.reference)}</p>` : ''}
  </div>
</div>

<table>
  <thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">P.U. HT</th>
    <th class="n">TVA</th><th class="n">Total HT</th></tr></thead>
  <tbody>${lignes}</tbody>
</table>

<div class="bas">
  <div class="conditions">
    <b>Paiement</b>
    ${badgesPaiement(agence)}
    ${facture.moyenPaiement ? `<p>${echapper(facture.moyenPaiement)}.</p>` : ''}
    ${lien ? `<p class="lien"><b>Payer en ligne :</b>
      <a href="${echapper(lien.href)}">${echapper(lien.texte)}</a></p>` : ''}
    ${banque.iban ? `<p class="banque">IBAN ${echapper(banque.iban)}${
  banque.bic ? `<br>BIC ${echapper(banque.bic)}` : ''}${
  banque.titulaire ? `<br>${echapper(banque.titulaire)}` : ''}</p>` : ''}
    <p>Paiement à ${echapper(fr(delai, 0))} jours : le montant est exigible au
      plus tard le <b>${echapper(jourFr(fin))}</b>.</p>
    <p>Aucun escompte n'est accordé en cas de paiement anticipé.</p>
  </div>
  <div class="total">
    ${t.remise ? `<div><span>Sous-total HT</span><b>${somme(t.brut)}</b></div>
    <div class="remise"><span>${echapper(t.remise.libelle)} ${
  echapper(fr(t.remise.taux * 100, 2))} %</span><b>-${somme(t.remise.montant)}</b></div>` : ''}
    <div><span>Total HT</span><b>${somme(t.ht)}</b></div>
    ${tvaLignes}
    <div class="fin"><span>Total TTC</span><b>${somme(t.ttc)}</b></div>
    ${t.acompte ? `<div><span>Acompte déjà versé</span><b>-${somme(t.acompte)}</b></div>` : ''}
    <div><span>${avoir ? 'Montant de l\'avoir' : 'Net à payer'}</span><b>${
  somme(t.netAPayer)}</b></div>
  </div>
</div>

${pen ? `<div class="avis"><b>Facture en retard de ${pen.jours} jours.</b>
  ${pen.interets === null
    ? `Indemnité forfaitaire de recouvrement due : ${somme(pen.indemnite)}.
       Les intérêts se calculent sur le taux d'intérêt légal en vigueur, qui
       n'est pas renseigné dans l'outil.`
    : `Pénalités dues à ce jour : ${somme(pen.interets)}, plus l'indemnité
       forfaitaire de ${somme(pen.indemnite)}, soit ${somme(pen.total)}.`}</div>` : ''}

<div class="reglement">
  <div>
    <b>Retard de paiement</b>
    <p>Toute somme non réglée à cette échéance porte de plein droit, dès le
      jour suivant et sans qu'un rappel soit nécessaire, des pénalités de
      retard au taux de <b>${echapper(fr(PENALITE_MULTIPLE, 0))} fois le taux
      d'intérêt légal</b> en vigueur.</p>
    <p>S'y ajoute une indemnité forfaitaire pour frais de recouvrement de
      <b>${echapper(fr(INDEMNITE_RECOUVREMENT, 0))} €</b>. Lorsque les frais
      exposés sont supérieurs à ce montant, une indemnisation complémentaire
      peut être demandée sur justification.</p>
  </div>
  <ul class="mentions">
  <li><b>Réserve de propriété.</b> Les fournitures et équipements demeurent la
    propriété de ${echapper(agence.nomCommercial || 'l\'entreprise')} jusqu'au
    paiement intégral du prix. Les risques sont transférés au client dès la
    livraison.</li>
  <li><b>Réclamations.</b> Toute réclamation portant sur les travaux ou les
    fournitures est à formuler par écrit dans les huit jours suivant la
    réception.</li>
  ${agence.assurance ? `<li><b>Assurance.</b> ${echapper(agence.assurance)}.</li>` : ''}
  ${agence.mediateur ? `<li><b>Médiation de la consommation.</b> Pour un
    différend avec un client particulier n'ayant pas trouvé d'issue amiable :
    ${echapper(agence.mediateur)}.</li>` : ''}
  </ul>
</div>

${facture.mentions ? `<p class="mentions precisions"><b>Précisions.</b> ${
  echapper(facture.mentions)}</p>` : ''}

<p class="pied">${echapper(agence.nomCommercial || '')} ·
  ${echapper(agence.adresse || '')} · ${echapper(agence.telephone || '')} ·
  ${echapper(agence.courriel || '')}<br>
  ${echapper(agence.formeCourte || '')} · SIRET ${echapper(agence.siret || '')} ·
  TVA ${echapper(agence.tva || '')} · APE ${echapper(agence.naf || '')}</p>

</div>
<button type="button" class="pdf" onclick="window.print()"
  title="Ouvre la fenêtre d'impression : choisissez « Enregistrer au format PDF ».">
  Enregistrer en PDF<small>Imprimante : « Enregistrer au format PDF »</small></button>
</body></html>`;
}
