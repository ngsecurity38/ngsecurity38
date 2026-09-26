/**
 * L'offre commerciale remise au client.
 *
 * Même feuille que le devis et la facture : même rouge, même en-tête, même
 * façon de tomber juste en A4. Un client qui reçoit l'offre puis la facture
 * doit voir deux pièces d'une même maison.
 *
 * Ce document sert les affaires que l'agence traite sur photos et relevé
 * rapide — un commerce, un pavillon, un atelier — là où l'étude complète
 * avec plan et synoptique serait disproportionnée. Il dit ce qu'on installe,
 * ce que chaque caméra couvre, ce que ça coûte, et ce que la loi impose.
 *
 * Il ne calcule que des totaux, et il refuse de mentir sur ce qu'il ignore :
 * une ligne sans prix relevé s'imprime « à chiffrer » et le total annonce
 * combien il en manque. Un prix inventé est pire qu'un prix absent — l'un se
 * voit, l'autre engage.
 *
 * À NE PAS CONFONDRE avec `offre.js`, qui compose automatiquement une
 * installation à partir de trois réponses d'un visiteur du site. Celui-ci ne
 * compose rien : il met en page une affaire que l'agence a étudiée, avec ses
 * repères, ses prix relevés et ses réserves. Les deux ne se parlent pas.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { fr, echapper, arrondir } from './format.js';
import { euros } from './prix.js';
import { reglagesPdf, MARGES, zoneImprimable } from './papier.js';
import { badgesPaiement } from './paiement.js';

/** Un montant, ou l'aveu qu'il manque. */
const somme = (v) => (Number.isFinite(v) ? euros(v) : '<i>à chiffrer</i>');

/** Comment se dit une unité dans un bordereau. */
const UNITES = { u: '', m: 'm', h: 'h', j: 'j', forfait: 'forf.' };

const jourFr = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso || '');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Le prix de vente d'une ligne.
 *
 * `prixVente` s'impose quand il est là. Sinon la remise de l'agence
 * s'applique au prix de marché — sa règle, celle que le client a déjà vue.
 * La main-d'œuvre ne se remise pas : un taux horaire n'est pas un tarif
 * catalogue, et le rabattre reviendrait à se payer moins cher de l'heure.
 */
export function prixLigne(ligne, offre, mainOeuvre = false) {
  if (mainOeuvre) return Number(offre.tauxHoraire) || 0;
  const vente = Number(ligne.prixVente);
  if (Number.isFinite(vente) && vente > 0) return arrondir(vente, 2);
  const marche = ligne.marche;
  if (marche === null || marche === undefined || marche === '') return null;
  const m = Number(marche);
  if (!Number.isFinite(m)) return null;
  const remise = Math.min(1, Math.max(0, Number(offre.remise) || 0));
  return arrondir(m * (1 - remise), 2);
}

/**
 * Les comptes de l'offre, lot par lot.
 *
 * @returns {{lots: object[], ht: number, tva: number, ttc: number,
 *   aChiffrer: number}}
 */
export function comptes(offre) {
  let ht = 0;
  let aChiffrer = 0;

  const lots = (offre.lots || []).map((lot) => {
    let total = 0;
    const lignes = (lot.lignes || []).map((l) => {
      const pu = prixLigne(l, offre, lot.mainOeuvre);
      const q = Number(l.quantite) || 0;
      const montant = pu === null ? null : arrondir(pu * q, 2);
      if (montant === null) aChiffrer += 1;
      else total = arrondir(total + montant, 2);
      return { ...l, prixUnitaire: pu, montant };
    });
    ht = arrondir(ht + total, 2);
    return { ...lot, lignes, total };
  });

  const tva = arrondir(ht * (Number(offre.tva) || 0), 2);
  return { lots, ht, tva, ttc: arrondir(ht + tva, 2), aChiffrer };
}

/* --------------------------------------------------------------- la feuille */

const STYLE = (papier) => `
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
.titre h1 { font-size:24px; margin:0 0 6px; }
.titre p { margin:2px 0; font-size:13.5px; color:var(--doux); }
h2 { font-size:15px; margin:22px 0 8px; padding-bottom:5px;
  border-bottom:2px solid var(--rouge); }
.parties { display:flex; gap:18px; margin:0 0 18px; }
.partie { flex:1 1 0; border:1px solid var(--bord); border-radius:8px; padding:12px 14px; }
.partie h3 { font-size:11px; text-transform:uppercase; letter-spacing:.06em;
  color:var(--doux); margin:0 0 6px; }
.partie p { margin:2px 0; font-size:14px; }
.besoin p { margin:0 0 8px; font-size:13.5px; text-align:justify; }
table { border-collapse:collapse; width:100%; font-size:13.5px; margin:4px 0; }
th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--bord);
  vertical-align:top; }
th { font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--doux); }
td.n, th.n { text-align:right; white-space:nowrap; }
.det { display:block; font-size:11.5px; color:var(--doux); margin-top:2px; }
.reperes td:first-child { width:38px; }
.puce { display:inline-flex; align-items:center; justify-content:center; min-width:30px;
  height:22px; padding:0 7px; border-radius:11px; background:var(--encre); color:#fff;
  font-size:11px; font-weight:700; }
.puce.dehors { background:var(--rouge); }
.reserve { color:var(--rouge); }
.lot { margin-top:14px; }
.lot h3 { font-size:12px; text-transform:uppercase; letter-spacing:.05em;
  color:var(--doux); margin:0 0 2px; }
.sous-total { text-align:right; font-size:12.5px; color:var(--doux); margin:2px 0 0; }
.bas { display:flex; gap:18px; align-items:flex-start; margin-top:16px; }
.conditions { flex:1 1 0; border:1px solid var(--bord); border-radius:8px;
  padding:12px 14px; font-size:12.5px; }
.conditions b { font-size:13px; }
.conditions p { margin:6px 0 0; }
.moyens { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 0; }
.moyen { display:flex; align-items:center; gap:6px; border:1px solid var(--bord);
  border-radius:6px; padding:4px 8px; background:#fff; }
.moyen svg, .moyen img { width:26px; height:18px; display:block; object-fit:contain; }
.moyen b { font-size:11.5px; font-weight:600; white-space:nowrap; }
.total { flex:0 0 340px; border:1px solid var(--bord); border-radius:8px; overflow:hidden; }
.total div { display:flex; justify-content:space-between; padding:7px 14px;
  border-bottom:1px solid var(--bord); font-size:14px; }
.total div:last-child { border-bottom:0; background:var(--encre); color:#fff;
  font-size:17px; font-weight:800; }
.total .fin { background:var(--fond); font-weight:700; }
.avis { background:#fff4f5; border:1px solid #f0c8ce; border-left:4px solid var(--rouge);
  border-radius:6px; padding:10px 13px; margin:12px 0 0; font-size:12.5px; color:#7a0a1c; }
ul.loi { font-size:12.5px; color:var(--encre); margin:6px 0; padding-left:18px; }
ul.loi li { margin-bottom:5px; text-align:justify; }
.options td:first-child { width:auto; }
.accord { margin-top:18px; border:1px dashed var(--doux); border-radius:8px;
  padding:14px 16px; font-size:12.5px; }
.accord .lignes-signature { display:flex; gap:24px; margin-top:26px; }
.accord .lignes-signature div { flex:1 1 0; border-top:1px solid var(--bord);
  padding-top:5px; color:var(--doux); font-size:11.5px; }
.pied { color:var(--doux); font-size:11.5px; text-align:center; padding:14px 0 0;
  border-top:1px solid var(--bord); margin-top:22px; line-height:1.6; }
.pdf { position:fixed; right:20px; bottom:20px; z-index:9; background:var(--rouge);
  color:#fff; border:0; border-radius:999px; padding:13px 22px;
  font:600 15px/1 inherit; cursor:pointer; box-shadow:0 6px 20px rgba(0,0,0,.25); }
.pdf small { display:block; font-weight:400; font-size:11.5px; opacity:.85; margin-top:4px; }

@page { size:${papier.taille}; margin:${papier.marge}; }
@media print {
  body { background:#fff; font-size:10.2pt; }
  .feuille { border:0; max-width:none; padding:0; }
  .pdf { display:none; }
  h1 { font-size:18pt; }
  th, td { padding:4px 8px; }
  /*
   * Le tableau, lui, se coupe : c'est la ligne qui doit rester entière. Un
   * bordereau qui refuse de se couper saute à la page suivante en entier et
   * laisse une demi-feuille blanche derrière lui.
   */
  .total, .partie, .accord, .avis, .lot h3 + table thead {
    break-inside:avoid; page-break-inside:avoid; }
  tr, li { break-inside:avoid; page-break-inside:avoid; }
  thead { display:table-header-group; }
  h2 { break-after:avoid; page-break-after:avoid; }
  .pied { break-before:avoid; page-break-before:avoid; }
}`;

/** Le bloc d'identité de l'agence. */
function identite(agence) {
  const c = agence.aCompleter || {};
  const lignes = [
    agence.adresse,
    [agence.telephone, agence.courriel].filter(Boolean).join(' · '),
    c.capitalSocial ? `${agence.formeCourte || ''} au capital de ${c.capitalSocial}`
      : agence.formeCourte,
    [agence.siret ? `SIRET ${agence.siret}` : '', agence.naf ? `APE ${agence.naf}` : '']
      .filter(Boolean).join(' · '),
    agence.tva ? `TVA ${agence.tva}` : '',
    c.rcsGreffe ? `RCS ${c.rcsGreffe} ${agence.siren || ''}`.trim() : '',
  ].filter(Boolean);
  return `<div class="coord">
    <p class="nom">${echapper(agence.nomCommercial || '')}</p>
    ${lignes.map((l) => `<p>${echapper(l)}</p>`).join('')}
  </div>`;
}

/** Le tableau des repères : où sont les caméras et ce qu'elles couvrent. */
function tableauCameras(offre) {
  return `<table class="reperes">
  <thead><tr><th>Rep.</th><th>Emplacement</th><th>Ce qu'elle couvre</th></tr></thead>
  <tbody>${(offre.cameras || []).map((c) => `<tr>
    <td><span class="puce${c.exterieur ? ' dehors' : ''}">${echapper(c.cle)}</span></td>
    <td><b>${echapper(c.nom)}</b><span class="det">${echapper(c.situation || '')}</span></td>
    <td>${echapper(c.role || '')}${c.reserve
  ? `<span class="det reserve">${echapper(c.reserve)}</span>` : ''}</td>
  </tr>`).join('')}</tbody>
</table>`;
}

/** Un lot du bordereau. */
function tableauLot(lot, offre) {
  return `<div class="lot">
  <h3>${echapper(lot.titre)}</h3>
  <table>
    <thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">P.U. HT</th>
      <th class="n">Total HT</th></tr></thead>
    <tbody>${lot.lignes.map((l) => `<tr>
      <td>${echapper(l.designation)}${l.reference
  ? `<span class="det">${echapper(l.reference)}</span>` : ''}${l.note
  ? `<span class="det">${echapper(l.note)}</span>` : ''}</td>
      <td class="n">${echapper(fr(Number(l.quantite) || 0, 0))}${
  UNITES[l.unite] ? ` ${echapper(UNITES[l.unite])}` : ''}</td>
      <td class="n">${somme(l.prixUnitaire)}</td>
      <td class="n">${somme(l.montant)}</td>
    </tr>`).join('')}</tbody>
  </table>
  <p class="sous-total">Sous-total ${echapper(lot.titre.toLowerCase())} :
    <b>${euros(lot.total)}</b> HT</p>
</div>`;
}

/**
 * L'offre, en une page HTML autonome.
 *
 * @param {object} offre le fichier d'offre
 * @param {object} agence l'identité de l'agence, logo compris
 */
export function ficheOffre(offre, agence = {}) {
  const c = comptes(offre);
  const r = reglagesPdf(offre);
  const papier = { taille: `${r.format} ${r.orientation}`, marge: MARGES[r.marges].css };
  const zone = zoneImprimable(r);
  const cl = offre.client || {};
  const cond = offre.conditions || {};

  const finValidite = (() => {
    const d = new Date(`${offre.date}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + (Number(offre.validite) || 30));
    return jourFr(d.toISOString().slice(0, 10));
  })();

  return `<!doctype html>
<html lang="fr" data-papier-largeur="${zone.largeur}" data-papier-hauteur="${zone.hauteur}">
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offre ${echapper(offre.reference || '')} · ${echapper(agence.nomCommercial || '')}</title>
<style>${STYLE(papier)}</style></head>
<body><div class="feuille">

<header class="garde">
  <div class="bandeau">
    ${agence.logo ? `<img src="${echapper(agence.logo)}" alt="">` : ''}
    ${identite(agence)}
  </div>
  <div class="titre">
    <p class="surtitre">OFFRE DE PRIX</p>
    <h1>${echapper(offre.reference || '')}</h1>
    <p>Établie le ${echapper(jourFr(offre.date))}</p>
    <p>Valable jusqu'au ${echapper(finValidite)}</p>
  </div>
</header>

<div class="parties">
  <div class="partie">
    <h3>Établie pour</h3>
    <p><b>${echapper(cl.nom || '')}</b></p>
    ${cl.activite ? `<p class="det">${echapper(cl.activite)}</p>` : ''}
    ${cl.adresse ? `<p>${echapper(cl.adresse)}</p>` : ''}
    ${cl.contact ? `<p>${echapper(cl.contact)}</p>` : ''}
  </div>
  <div class="partie">
    <h3>Objet</h3>
    <p>${echapper(offre.objet || '')}</p>
    <p class="det">${echapper(fr((offre.cameras || []).length, 0))} caméras :
      ${echapper(fr((offre.cameras || []).filter((x) => x.exterieur).length, 0))} à l'extérieur,
      ${echapper(fr((offre.cameras || []).filter((x) => !x.exterieur).length, 0))} à l'intérieur.</p>
  </div>
</div>

<h2>Ce que nous avons retenu</h2>
<div class="besoin">${(offre.besoin || []).map((p) => `<p>${echapper(p)}</p>`).join('')}</div>

<h2>Les six points de vue</h2>
${tableauCameras(offre)}

<h2>Le détail du prix</h2>
${c.lots.map((lot) => tableauLot(lot, offre)).join('')}

${c.aChiffrer ? `<div class="avis"><b>${echapper(fr(c.aChiffrer, 0))} ligne${
  c.aChiffrer > 1 ? 's' : ''} reste${c.aChiffrer > 1 ? 'nt' : ''} à chiffrer.</b>
  Le total ci-dessous est donc incomplet. Ces montants sont communiqués avant
  signature.</div>` : ''}

<div class="bas">
  <div class="conditions">
    <b>Conditions</b>
    ${badgesPaiement(agence)}
    ${cond.acompte ? `<p>Acompte de ${echapper(fr(cond.acompte * 100, 0))} % à la
      commande, solde à la mise en service.</p>` : ''}
    ${cond.delai ? `<p><b>Délai :</b> ${echapper(cond.delai)}</p>` : ''}
    ${cond.garantie ? `<p><b>Garantie :</b> ${echapper(cond.garantie)}</p>` : ''}
    ${cond.chantier ? `<p>${echapper(cond.chantier)}</p>` : ''}
  </div>
  <div class="total">
    <div><span>Total HT</span><b>${euros(c.ht)}</b></div>
    <div class="fin"><span>TVA ${echapper(fr((offre.tva || 0) * 100, 1))} %</span>
      <b>${euros(c.tva)}</b></div>
    <div><span>Total TTC</span><b>${euros(c.ttc)}</b></div>
  </div>
</div>

${(offre.options || []).length ? `<h2>En option</h2>
<table class="options">
  <thead><tr><th>Désignation</th><th class="n">Prix HT</th></tr></thead>
  <tbody>${offre.options.map((o) => `<tr>
    <td>${echapper(o.designation)}${o.note
  ? `<span class="det">${echapper(o.note)}</span>` : ''}</td>
    <td class="n">${somme(prixLigne(o, offre))}</td>
  </tr>`).join('')}</tbody>
</table>` : ''}

${(offre.obligations || []).length ? `<h2>Ce que la loi impose</h2>
<ul class="loi">${offre.obligations.map((o) => `<li>${o}</li>`).join('')}</ul>` : ''}

<div class="accord">
  <b>Bon pour accord.</b> À retourner daté et signé, avec la mention
  « bon pour accord », accompagné de l'acompte.
  <div class="lignes-signature">
    <div>Date</div>
    <div>Nom et qualité du signataire</div>
    <div>Signature et cachet</div>
  </div>
</div>

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
