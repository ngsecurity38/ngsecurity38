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
