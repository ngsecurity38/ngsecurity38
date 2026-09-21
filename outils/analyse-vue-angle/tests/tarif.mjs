/**
 * Les fichiers de prix : ce qu'ils ont le droit d'affirmer.
 *
 * Un prix inscrit dans `tarif.json` est repris tel quel sur une page
 * publique et présenté comme l'estimation de l'agence. La règle tenue ici
 * est celle qui court depuis le début du projet : **jamais un prix sans sa
 * provenance**. Un montant relevé chez un revendeur, recopié sans sa date ni
 * sa source, se transforme en six mois en un engagement que la marge ne
 * couvre plus.
 *
 * `tarif-distributeur.json` est un relevé, pas un tarif : il consigne ce
 * qu'un distributeur annonce, en attendant qu'on sache s'il s'agit de prix
 * d'achat ou de prix de vente conseillés. Ces tests interdisent qu'il se
 * déverse dans le tarif sans cette réponse.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = dirname(dirname(fileURLToPath(import.meta.url)));
const lire = (nom) => JSON.parse(readFileSync(join(racine, nom), 'utf8'));

const tarif = lire('tarif.json');
const alarme = lire('tarif-alarme.json');
const releve = lire('tarif-distributeur.json');

const prixDe = (a) => Number(a.prixVente) || Number(a.prixAchat) || 0;
const sourceDe = (a) => a.sourceVente || a.sourceAchat;

test('aucun prix sans sa provenance', () => {
  for (const fichier of [tarif, alarme]) {
    for (const a of fichier.articles) {
      if (prixDe(a) > 0) {
        const s = sourceDe(a);
        assert.ok(s, `${a.reference} : prix ${prixDe(a)} € sans source`);
        assert.ok(s.type && s.source,
          `${a.reference} : source incomplète — ${JSON.stringify(s)}`);
        assert.match(s.date || '', /^\d{2}\/\d{2}\/\d{4}$/,
          `${a.reference} : un prix se date — ${JSON.stringify(s)}`);
      }
    }
  }
});

test('le relevé distributeur ne s\'est pas déversé dans le tarif', () => {
  /*
   * La colonne s'intitule « PVP » — precio de venta al público. Inscrit en
   * prixAchat, le devis y ajouterait 25 % de marge et sortirait un prix
   * supérieur au tarif public du distributeur. Tant que la question n'est
   * pas tranchée, rien ne passe.
   */
  const relevees = new Set(releve.articles.map((a) => a.reference));
  for (const a of [...tarif.articles, ...alarme.articles]) {
    if (relevees.has(a.reference) && prixDe(a) > 0) {
      assert.ok(sourceDe(a),
        `${a.reference} vient du relevé et porte un prix sans source`);
    }
  }
  assert.ok(releve._a_confirmer.length >= 2,
    'les questions en suspens doivent rester écrites dans le fichier');
});

test('le relevé est complet et daté', () => {
  assert.match(releve.releve, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(releve.devise, 'EUR');
  assert.ok(releve.source.length > 20, 'd\'où vient la liste');
  assert.ok(releve.articles.length > 0);

  for (const a of releve.articles) {
    assert.ok(a.reference && a.designation, JSON.stringify(a));
    assert.ok(a.pvp > 0, `${a.reference} : prix ${a.pvp}`);
    assert.equal(typeof a.pourLesOutils, 'boolean',
      `${a.reference} : le périmètre doit être tranché`);
  }
  // Pas de référence en double : deux prix pour un même article se contredisent.
  const vues = new Set();
  for (const a of releve.articles) {
    assert.ok(!vues.has(a.reference), `référence en double : ${a.reference}`);
    vues.add(a.reference);
  }
});

test('une caméra sans optique relevée est signalée comme telle', () => {
  /*
   * Sans champ de vision, la page ne peut ni calculer la portée d'une caméra
   * ni la justifier : elle ne doit donc pas la proposer sur une étude photo.
   * Le relevé le dit article par article, pour qu'on sache ce qui reste à
   * chercher sur les fiches constructeur.
   */
  const cameras = releve.articles.filter((a) => a.pourLesOutils && a.type === 'camera');
  assert.ok(cameras.length > 0);
  for (const c of cameras) {
    assert.equal(typeof c.optiqueConnue, 'boolean',
      `${c.reference} : dire si l'optique est connue`);
  }
});

test('le tarif alarme reste vide : aucun Ajax dans le relevé', () => {
  const ajax = releve.articles.filter(
    (a) => /ajax/i.test(`${a.reference} ${a.designation}`),
  );
  assert.equal(ajax.length, 0, JSON.stringify(ajax));
  assert.equal(alarme.exemple, true,
    'tant qu\'aucun prix n\'est saisi, l\'avertissement doit rester affiché');
  assert.ok(alarme.articles.every((a) => prixDe(a) === 0),
    'aucun prix ne doit être inventé pour la page alarme');
});

test('les taux de TVA des deux pays sont déclarés dans les deux tarifs', () => {
  for (const [nom, f] of [['tarif.json', tarif], ['tarif-alarme.json', alarme]]) {
    assert.ok(f.tauxParPays?.fr?.normal > 0, `${nom} : taux français`);
    assert.ok(f.tauxParPays?.be?.normal > 0, `${nom} : taux belge`);
    assert.notEqual(f.tauxParPays.fr.normal, f.tauxParPays.be.normal,
      `${nom} : les deux pays n'ont pas le même taux`);
  }
});
