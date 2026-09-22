/**
 * Tests du calcul de stockage, du budget PoE et des contrôles d'ensemble.
 * Exécution : node --test tests/stockage.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GO_PAR_MBPS_JOUR, MARGE_DEFAUT, CODECS, CLASSES_POE,
  debitEstime, capaciteNecessaire, joursTenus, disqueRecommande,
  classePour, ipValide, controler, bilan, disquesPourBaies,
} from '../js/stockage.js';
import { nouveauSynoptique, nouveauNoeud, nouveauLien } from '../js/reseau.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/* ----------------------------------------------------------- stockage */

test('un mégabit par seconde pendant un jour vaut 10,8 Go', () => {
  // 1 Mbit/s × 86 400 s = 86 400 Mbit = 10 800 Mo = 10,8 Go.
  proche(GO_PAR_MBPS_JOUR, (1 * 86400) / 8 / 1000, 1e-9);
});

test('capacité : l\'exemple de référence, huit caméras à 5 Mbps sur 30 jours', () => {
  const go = capaciteNecessaire({ debitTotal: 8 * 5, jours: 30, heuresParJour: 24, marge: 0.2 });
  proche(go, 15552, 1, '40 Mbps → 432 Go/jour → 12 960 Go → +20 % → 15 552 Go');
  const d = disqueRecommande(go);
  assert.equal(d.unitaire, 16, 'un disque de 16 To couvre le besoin');
  assert.equal(d.nombre, 1);
});

test('capacité : l\'enregistrement sur plage horaire réduit d\'autant', () => {
  const plein = capaciteNecessaire({ debitTotal: 40, jours: 30 });
  const moitie = capaciteNecessaire({ debitTotal: 40, jours: 30, heuresParJour: 12 });
  proche(moitie, plein / 2, 1e-6, 'douze heures par jour, moitié moins');
});

test('capacité : au-delà de 24 h par jour, la journée ne s\'allonge pas', () => {
  const a = capaciteNecessaire({ debitTotal: 40, jours: 10, heuresParJour: 24 });
  const b = capaciteNecessaire({ debitTotal: 40, jours: 10, heuresParJour: 48 });
  proche(b, a, 1e-9, 'une saisie aberrante ne doit pas doubler le devis');
});

test('capacité : sans débit ni durée, aucun chiffre n\'est avancé', () => {
  assert.equal(capaciteNecessaire({ debitTotal: 0, jours: 30 }), 0);
  assert.equal(capaciteNecessaire({ debitTotal: 40, jours: 0 }), 0);
  assert.equal(MARGE_DEFAUT, 0.2);
});

test('durée tenue : le calcul inverse retombe sur ses pieds', () => {
  const go = capaciteNecessaire({ debitTotal: 40, jours: 30 });
  proche(joursTenus({ debitTotal: 40, capaciteGo: go }), 30, 1e-6);
});

test('durée tenue : un 8 To sur huit caméras à 5 Mbps', () => {
  const j = joursTenus({ debitTotal: 40, capaciteGo: 8000 });
  proche(j, 15.4, 0.1, '8 To ne tiennent pas 30 jours');
});

test('disque : plusieurs unités quand une seule ne suffit pas', () => {
  const d = disqueRecommande(60000); // 60 To
  assert.equal(d.unitaire, 24);
  assert.equal(d.nombre, 3);
  assert.equal(d.total, 72);
  assert.equal(disqueRecommande(0), null);
});

test('disque : la plus petite capacité courante qui couvre le besoin', () => {
  assert.equal(disqueRecommande(3500).unitaire, 4, '3,5 To → un disque de 4 To');
  assert.equal(disqueRecommande(4000).unitaire, 4, 'pile 4 To → 4 To');
  assert.equal(disqueRecommande(4001).unitaire, 6, 'un octet de plus → la taille au-dessus');
});

/* -------------------------------------------------------------- débit */

test('débit estimé : ordres de grandeur du commerce', () => {
  const fullHd = debitEstime({ resH: 1920, resV: 1080, ips: 25, codec: 'h264' });
  proche(fullHd, 3.6, 0.3, '1080p 25 i/s en H.264');
  const quatreK = debitEstime({ resH: 3840, resV: 2160, ips: 25, codec: 'h265' });
  proche(quatreK, 7.3, 0.5, '4K 25 i/s en H.265');
  assert.ok(
    debitEstime({ resH: 3840, resV: 2160, ips: 25, codec: 'h265+' }) < quatreK,
    'le smart codec descend plus bas',
  );
});

test('débit estimé : rien à estimer sans résolution ni cadence', () => {
  assert.equal(debitEstime({ resH: 0, resV: 0 }), 0);
  assert.equal(debitEstime({ resH: 1920, resV: 1080, ips: 0 }), 0);
});

test('les codecs proposés vont du plus ancien au plus économe', () => {
  assert.deepEqual(CODECS.map((c) => c.cle), ['h264', 'h265', 'h265+']);
  const debits = CODECS.map((c) => debitEstime({ resH: 1920, resV: 1080, codec: c.cle }));
  assert.ok(debits[0] > debits[1] && debits[1] > debits[2], 'chaque codec descend plus bas');
});

/* ---------------------------------------------------------------- PoE */

test('classe PoE : la plus petite capable d\'alimenter l\'appareil', () => {
  assert.equal(classePour(6).cle, 'af');
  assert.equal(classePour(12.95).cle, 'af', 'la limite exacte passe encore');
  assert.equal(classePour(13).cle, 'at');
  assert.equal(classePour(30).cle, 'bt3');
  assert.equal(classePour(60).cle, 'bt4');
  assert.equal(classePour(120), null, 'au-delà du type 4, le PoE ne suffit plus');
});

test('les classes PoE distinguent la puissance du port de celle de l\'appareil', () => {
  for (const c of CLASSES_POE) {
    assert.ok(c.port > c.appareil, `${c.cle} : la perte en ligne doit être comptée`);
  }
});

/* -------------------------------------------------------- adresses IP */

test('adresse IP : formes acceptées et refusées', () => {
  assert.equal(ipValide('192.168.1.4'), true);
  assert.equal(ipValide(''), true, 'non renseignée n\'est pas fausse');
  assert.equal(ipValide('192.168.1.256'), false);
  assert.equal(ipValide('192.168.1'), false);
  assert.equal(ipValide('192.168.01.4'), false, 'un zéro en tête trahit une saisie douteuse');
});

/* --------------------------------------------------------- contrôles */

/** Petite installation : trois caméras, un switch 8 ports PoE, un NVR 4 canaux. */
function installation(options = {}) {
  const s = nouveauSynoptique();
  const sw = nouveauNoeud('switch', 0.5, 0.5, {
    nom: 'SW 1', ports: 8, portsPoe: 8, budgetPoe: 65, ip: '192.168.1.7',
  });
  const nvr = nouveauNoeud('nvr', 0.6, 0.5, { nom: 'NVR 1', canaux: 4, ip: '192.168.1.6' });
  s.noeuds.push(sw, nvr);
  s.liens.push(nouveauLien(sw.id, nvr.id));
  const cams = [];
  for (let i = 0; i < (options.cameras ?? 3); i += 1) {
    const c = nouveauNoeud('camera', 0.1 * i, 0.2, {
      nom: `CAM ${i + 1}`,
      ip: `192.168.1.${10 + i}`,
      debit: options.debit ?? 5,
      conso: options.conso ?? 8,
    });
    s.noeuds.push(c);
    s.liens.push(nouveauLien(c.id, sw.id));
    cams.push(c);
  }
  return { s, sw, nvr, cams };
}

test('contrôles : une installation cohérente ne déclenche rien', () => {
  const { s } = installation();
  assert.deepEqual(controler(s, { jours: 30 }), []);
});

test('contrôles : adresse IP en double', () => {
  const { s, cams } = installation();
  cams[1].ip = cams[0].ip;
  const a = controler(s);
  assert.equal(a.length, 1);
  assert.equal(a[0].niveau, 'bloquant');
  assert.match(a[0].texte, /192\.168\.1\.10 attribuée à 2 appareils/);
});

test('contrôles : adresse IP mal formée', () => {
  const { s, cams } = installation();
  cams[0].ip = '192.168.1.300';
  assert.ok(controler(s).some((x) => /n'est pas une adresse IPv4/.test(x.texte)));
});

test('contrôles : plus de caméras que de ports PoE', () => {
  const { s, sw } = installation();
  sw.portsPoe = 2;
  const a = controler(s);
  assert.ok(a.some((x) => /3 caméras à alimenter pour 2 ports PoE/.test(x.texte)));
  assert.equal(a[0].niveau, 'bloquant');
});

test('contrôles : budget PoE dépassé', () => {
  const { s } = installation({ conso: 25 });
  const a = controler(s);
  assert.ok(a.some((x) => /budget PoE dépassé/.test(x.texte) && /75 W demandés/.test(x.texte)),
    JSON.stringify(a));
});

test('contrôles : plus de caméras que de canaux au NVR', () => {
  const { s } = installation({ cameras: 6 });
  const a = controler(s);
  assert.ok(a.some((x) => /6 caméras pour 4 canaux/.test(x.texte)));
});

test('contrôles : une caméra demandant plus que le PoE++ type 4', () => {
  const { s, cams } = installation();
  cams[0].conso = 90;
  const a = controler(s);
  assert.ok(a.some((x) => /au-delà du PoE\+\+ type 4/.test(x.texte)));
});

test('contrôles : caméra raccordée à un switch sans PoE', () => {
  const { s, sw } = installation();
  sw.portsPoe = 0;
  const a = controler(s);
  assert.ok(a.some((x) => /injecteur ou alimentation locale/.test(x.texte)));
});

test('contrôles : capacité installée insuffisante pour la durée demandée', () => {
  const { s } = installation();
  // 3 × 5 Mbps sur 30 jours avec 20 % de marge : 5 832 Go nécessaires.
  const a = controler(s, { jours: 30, capaciteInstallee: 2000 });
  const manque = a.find((x) => /Capacité installée insuffisante/.test(x.texte));
  assert.ok(manque, JSON.stringify(a));
  assert.match(manque.texte, /jours tenus au lieu de 30/);
});

test('contrôles : une caméra sans débit rend le stockage incomplet', () => {
  const { s, cams } = installation();
  cams[0].debit = 0;
  const a = controler(s, { jours: 30 });
  assert.ok(a.some((x) => x.niveau === 'avertissement' && /sans débit renseigné/.test(x.texte)));
});

test('contrôles : les anomalies bloquantes passent devant les avertissements', () => {
  const { s, cams, sw } = installation();
  cams[0].debit = 0;          // avertissement
  cams[1].ip = cams[2].ip;    // bloquant
  sw.portsPoe = 1;            // bloquant
  const a = controler(s);
  assert.ok(a.length >= 3);
  assert.equal(a[0].niveau, 'bloquant');
  assert.equal(a[a.length - 1].niveau, 'avertissement');
});

test('contrôles : un dossier vide ne reproche rien', () => {
  assert.deepEqual(controler(nouveauSynoptique(), { jours: 30 }), []);
  assert.deepEqual(controler(null), []);
});

/* ------------------------------------------------------------- bilan */

test('bilan : débit total, capacité, disque et consommation par switch', () => {
  const { s } = installation();
  const b = bilan(s, { jours: 30 });
  assert.equal(b.cameras, 3);
  proche(b.debitTotal, 15, 1e-9);
  proche(b.capaciteGo, 15 * 10.8 * 30 * 1.2, 1, '5 832 Go');
  assert.equal(b.disque.unitaire, 6, 'un disque de 6 To couvre 5,8 To');
  assert.equal(b.poe.length, 1);
  assert.equal(b.poe[0].alimentes, 3);
  proche(b.poe[0].conso, 24, 1e-9);
  assert.equal(b.poe[0].budget, 65);
  assert.deepEqual(b.anomalies, []);
});

test('bilan : sans caméra, rien n\'est chiffré et rien n\'est reproché', () => {
  const b = bilan(nouveauSynoptique(), { jours: 30 });
  assert.equal(b.cameras, 0);
  assert.equal(b.debitTotal, 0);
  assert.equal(b.capaciteGo, 0);
  assert.equal(b.disque, null);
  assert.deepEqual(b.anomalies, []);
});

test('les nombres des messages sont écrits à la française', () => {
  const { s: syn } = installation();
  const a = controler(syn, { jours: 30, capaciteInstallee: 2000 });
  const texte = a.map((x) => x.texte).join(' ');
  assert.ok(!/\d\.\d/.test(texte), `décimale anglaise dans : ${texte}`);
  assert.match(texte, /5\u202f832 Go nécessaires/, 'les milliers sont séparés');
});

/* --------------------------------------------------- disques et baies */

test('deux baies : le pool additionne, le miroir double', () => {
  // 12 To de besoin : deux disques de 6 To en pool, deux de 12 en miroir.
  const d = disquesPourBaies(12000, 2);
  assert.equal(d.baies, 2);
  assert.equal(d.pool.unitaire, 6);
  assert.equal(d.pool.nombre, 2);
  assert.equal(d.pool.total, 12);
  assert.equal(d.miroir.unitaire, 12);
  assert.equal(d.miroir.nombre, 2);
});

test('deux baies : le pool tient toujours le besoin', () => {
  for (const go of [500, 3200, 7800, 12000, 19500, 33000]) {
    const d = disquesPourBaies(go, 2);
    if (!d.pool) continue;
    assert.ok(
      d.pool.total * 1000 >= go,
      `${go} Go : ${d.pool.total} To en pool ne suffit pas`,
    );
    // Le miroir n'offre que la moitié de sa capacité installée — et il est
    // donc le premier des deux à sortir du catalogue. À 33 To de besoin, le
    // pool tient encore (2 × 18) quand le miroir demanderait deux disques de
    // 33 To, qui n'existent pas : la fonction rend null, elle n'arrondit pas.
    if (!d.miroir) {
      assert.ok(go / 1000 > 24, `${go} Go : miroir refusé alors qu'il tenait`);
      continue;
    }
    assert.ok((d.miroir.total / 2) * 1000 >= go, `${go} Go : miroir insuffisant`);
  }
});

test('baies impaires : pas de miroir, et la fonction le dit', () => {
  // Un miroir suppose des paires. Proposer un miroir sur trois baies serait
  // proposer une chose qui n'existe pas.
  assert.equal(disquesPourBaies(8000, 1).miroir, null);
  assert.equal(disquesPourBaies(8000, 3).miroir, null);
});

test('baies : besoin au-delà du catalogue → null plutôt qu\'un disque imaginaire', () => {
  const d = disquesPourBaies(200000, 2); // 200 To sur deux baies
  assert.equal(d.pool, null);
  assert.equal(d.miroir, null);
});

test('baies : données absentes → null', () => {
  assert.equal(disquesPourBaies(0, 2), null);
  assert.equal(disquesPourBaies(8000, 0), null);
});

test('baies : un disque plus gros que la baie n\'est jamais proposé', () => {
  // La machine du dossier accepte 10 To par baie. Proposer du 18 To, c'est
  // proposer un disque qui ne sera pas reconnu — et cela s'apprend après
  // l'achat.
  const d = disquesPourBaies(16800, 2, { capaciteMax: 10, raid: false });
  assert.ok(d.pool.unitaire <= 10, `${d.pool.unitaire} To dépasse la baie`);
  assert.equal(d.pool.total, 20);
  assert.equal(d.miroir, null, 'pas de RAID, donc pas de miroir');
});

test('baies : sans RAID, aucun miroir n\'est annoncé', () => {
  // Annoncer un miroir sur une machine qui n'en fait pas, c'est vendre une
  // sécurité qui n'existe pas.
  assert.equal(disquesPourBaies(8000, 2, { raid: false }).miroir, null);
  assert.ok(disquesPourBaies(8000, 2, { raid: true }).miroir);
});

test('baies : un besoin qui dépasse ce que les baies peuvent porter → null', () => {
  // 30 To nécessaires, deux baies de 10 : 20 To au mieux. La fonction le dit.
  const d = disquesPourBaies(30000, 2, { capaciteMax: 10 });
  assert.equal(d.pool, null);
});

test('baies : sans contrainte déclarée, le comportement d\'avant est gardé', () => {
  const d = disquesPourBaies(12000, 2);
  assert.equal(d.pool.unitaire, 6);
  assert.equal(d.miroir.unitaire, 12);
  assert.equal(d.capaciteMax, null);
});
