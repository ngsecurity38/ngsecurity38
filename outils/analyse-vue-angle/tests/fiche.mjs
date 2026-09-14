/**
 * Tests du format de fiche et de la compatibilité des versions.
 * Exécution : node --test tests/fiche.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrer, nouvelleCamera, nomDeFichier, VERSION_FICHE, TYPE_FICHE } from '../js/fiche.js';

/** Fiche telle que la première version de l'outil l'enregistrait. */
const FICHE_V1 = {
  type: 'ng-vue-angle',
  version: 1,
  enregistreLe: '2026-09-14T10:00:00.000Z',
  chantier: {
    client: 'SCI Les Ateliers',
    site: 'ZA de Chartreuse',
    camera: 'CAM 04 — parking nord',
    technicien: 'N. Girard',
    date: '2026-09-14',
    affaire: '2026-118',
    commentaire: 'Mât légèrement vrillé.',
  },
  camera: { capteur: '1/1.8"', focale: 6, resolution: '1', distance: 22, hauteur: 4 },
  tolerances: { angle: 2, roulis: 1.5, zoom: 5, zone: 95 },
  zones: [{ x: 0.1, y: 0.2, l: 0.3, h: 0.4, nom: 'Portail' }],
  etude: { fichier: 'etude.pdf', analyse: { cameras: [], entete: {}, champs: {} }, repere: 'CAM 04' },
  transformation: { tx: -0.1, ty: 0, echelle: 1, rotation: 0, zncc: 0.9, recouvrement: 0.9 },
  manuel: false,
  images: {
    reference: { nom: 'etude.pdf — page 3', dataUrl: 'data:image/png;base64,AAA', source: { type: 'pdf', page: 3 } },
    reglee: { nom: 'reglee.png', dataUrl: 'data:image/png;base64,BBB', source: null },
  },
};

test('une fiche d\'une autre version que la nôtre est refusée clairement', () => {
  assert.throws(() => migrer({ type: 'autre-chose' }), /pas une fiche de vue d'angle/);
  assert.throws(() => migrer(null), /pas une fiche de vue d'angle/);
});

test('une fiche version 1 s\'ouvre encore : elle devient un dossier d\'une caméra', () => {
  const f = migrer(FICHE_V1);
  assert.equal(f.version, VERSION_FICHE);
  assert.equal(f.cameras.length, 1);
  const c = f.cameras[0];
  assert.equal(c.nom, 'CAM 04 — parking nord', 'le repère passe du chantier à la caméra');
  assert.equal(c.optique.focale, 6);
  assert.equal(c.optique.distance, 22);
  assert.equal(c.commentaire, 'Mât légèrement vrillé.');
  assert.equal(c.zones.length, 1);
  assert.equal(c.transformation.tx, -0.1);
  assert.equal(c.images.reference.dataUrl, 'data:image/png;base64,AAA');
  assert.equal(c.repereEtude, 'CAM 04', 'le rattachement à l\'étude est conservé');
});

test('version 1 : le chantier ne garde que ce qui est commun au dossier', () => {
  const f = migrer(FICHE_V1);
  assert.equal(f.chantier.client, 'SCI Les Ateliers');
  assert.equal(f.chantier.affaire, '2026-118');
  assert.equal(f.chantier.camera, undefined, 'le repère caméra n\'est plus un champ de chantier');
  assert.equal(f.chantier.commentaire, undefined, 'les observations sont propres à chaque caméra');
  assert.equal(f.tolerances.angle, 2);
  assert.equal(f.etude.fichier, 'etude.pdf');
});

test('les valeurs d\'optique absentes reprennent les valeurs par défaut', () => {
  const f = migrer({ ...FICHE_V1, camera: { focale: 12 } });
  assert.equal(f.cameras[0].optique.focale, 12);
  assert.equal(f.cameras[0].optique.capteur, '1/2.8"', 'défaut appliqué');
  assert.equal(f.cameras[0].optique.inclinaison, 15);
});

test('une fiche version 2 passe telle quelle', () => {
  const v2 = {
    type: TYPE_FICHE,
    version: 2,
    chantier: { client: 'X' },
    tolerances: {},
    etude: null,
    cameras: [nouvelleCamera('CAM 01'), nouvelleCamera('CAM 02')],
  };
  const f = migrer(v2);
  assert.equal(f.cameras.length, 2);
  assert.deepEqual(f.cameras.map((c) => c.nom), ['CAM 01', 'CAM 02']);
});

test('une fiche tronquée ne fait pas planter l\'ouverture', () => {
  const f = migrer({ type: TYPE_FICHE, version: 2 });
  assert.equal(f.cameras.length, 1, 'un dossier a toujours au moins une caméra');
  assert.deepEqual(f.cameras[0].zones, []);
  assert.equal(f.cameras[0].optique.focale, 4);
  const g = migrer({ type: TYPE_FICHE, version: 2, cameras: [{ nom: 'CAM 09', zones: 'cassé' }] });
  assert.deepEqual(g.cameras[0].zones, []);
  assert.equal(g.cameras[0].images.reference, null);
});

test('nom de fichier : affaire, client, et la caméra si le dossier n\'en a qu\'une', () => {
  const chantier = { affaire: '2026-118', client: 'SCI Les Ateliers' };
  assert.equal(
    nomDeFichier(chantier, [nouvelleCamera('CAM 04')]),
    '2026-118-sci-les-ateliers-cam-04.json',
  );
  assert.equal(
    nomDeFichier(chantier, [nouvelleCamera('CAM 04'), nouvelleCamera('CAM 07')]),
    '2026-118-sci-les-ateliers.json',
    'plusieurs caméras : le nom reste celui du dossier',
  );
  assert.equal(nomDeFichier({}, [nouvelleCamera('')]), 'vue-angle.json');
});
