/**
 * Le papier : format, sens, marges.
 *
 * Le dossier technique et le devis s'impriment sur la même feuille, réglée
 * une fois. Ils vivent dans deux modules qui ne doivent pas s'importer l'un
 * l'autre — d'où ce troisième, que les deux prennent sans se croiser.
 *
 * Module pur, testé sous Node.
 */

/**
 * Le papier.
 *
 * C'est la seule chose qu'un dossier ne peut pas deviner : une étude de dix
 * caméras tient en A4 portrait, un plan de site large se lit en paysage, et
 * un dossier qui part à la reliure demande une marge de gauche plus grande.
 */
export const FORMATS = { A4: 'A4', A3: 'A3', Letter: 'Lettre US' };
export const ORIENTATIONS = { portrait: 'Portrait', landscape: 'Paysage' };
export const MARGES = {
  etroites: { label: 'Étroites', css: '8mm 8mm 10mm' },
  normales: { label: 'Normales', css: '14mm 12mm 15mm' },
  larges: { label: 'Larges', css: '22mm 20mm 24mm' },
};

/** Les formats, en millimètres, portrait. */
export const TAILLES_MM = {
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
};

const PX_PAR_MM = 96 / 25.4;

/**
 * La zone réellement imprimable, en pixels CSS.
 *
 * Elle sert à deux choses, et la seconde est la moins évidente : savoir si
 * un document tient sur une feuille, et savoir quelle hauteur donner au
 * cadre qui le porte avant de l'envoyer à l'impression. Un cadre plus haut
 * que son contenu fait sortir une page blanche à la suite ; un cadre plus
 * court le coupe. Il faut donc la vraie mesure, pas une approximation.
 *
 * @returns {{largeur: number, hauteur: number}} en pixels CSS, à 96 ppp
 */
export function zoneImprimable(reglages) {
  const r = { ...pdfParDefaut(), ...(reglages || {}) };
  const [court, long] = TAILLES_MM[r.format] || TAILLES_MM.A4;
  const [largeurMm, hauteurMm] = r.orientation === 'landscape' ? [long, court] : [court, long];

  // « 14mm 12mm 15mm » : haut, droite et gauche, bas.
  const marges = (MARGES[r.marges] || MARGES.normales).css
    .split(/\s+/).map((v) => parseFloat(v) || 0);
  const [haut, cote, bas] = [marges[0], marges[1] ?? marges[0], marges[2] ?? marges[0]];

  return {
    largeur: Math.floor((largeurMm - cote * 2) * PX_PAR_MM),
    hauteur: Math.floor((hauteurMm - haut - bas) * PX_PAR_MM),
  };
}

export const pdfParDefaut = () => ({
  format: 'A4', orientation: 'portrait', marges: 'normales',
});

/** Les réglages retenus, quoi qu'il y ait dans le fichier. */
export function reglagesPdf(etude) {
  const lu = (etude.dossier && etude.dossier.pdf) || {};
  const d = pdfParDefaut();
  return {
    format: FORMATS[lu.format] ? lu.format : d.format,
    orientation: ORIENTATIONS[lu.orientation] ? lu.orientation : d.orientation,
    marges: MARGES[lu.marges] ? lu.marges : d.marges,
  };
}
