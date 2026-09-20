/**
 * Référencement : ce qui décide si Google trouve ces pages, et laquelle.
 *
 * Trois pages publiques sur le site d'une entreprise, invisibles sur Google,
 * ne servent à personne. Les erreurs qui coûtent le plus cher ici sont
 * silencieuses : une adresse canonique oubliée et Google indexe la copie
 * GitHub Pages à la place du domaine ; deux pages qui portent le même titre
 * et il n'en garde qu'une ; une vignette de partage absente et le lien arrive
 * nu dans un SMS.
 *
 * D'où ces tests : aucun ne prouve un classement — personne ne peut le
 * promettre — mais chacun ferme une porte par laquelle le travail se perdrait
 * sans bruit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = dirname(dirname(fileURLToPath(import.meta.url)));
const servi = join(racine, '..', '..', 'docs', 'outils');
const lire = (...p) => readFileSync(join(...p), 'utf8');

const ADRESSE = 'https://ngsecurity38.fr';

/** Les pages, avec l'adresse à laquelle le site les sert. */
const PAGES = [
  { source: 'presentation.html', url: `${ADRESSE}/outils/etude/`, dossier: 'etude' },
  { source: 'devis-client.html', url: `${ADRESSE}/outils/devis/`, dossier: 'devis' },
  { source: 'alarme-client.html', url: `${ADRESSE}/outils/alarme/`, dossier: 'alarme' },
  { source: 'index-outils.html', url: `${ADRESSE}/outils/`, dossier: '' },
];

const balise = (html, motif) => (html.match(motif) || [])[1] || '';
const titre = (h) => balise(h, /<title>([\s\S]*?)<\/title>/);
const meta = (h, nom) => balise(h, new RegExp(`<meta name="${nom}" content="([^"]*)"`));
const propriete = (h, nom) => balise(h, new RegExp(`<meta property="${nom}" content="([^"]*)"`));

test('chaque page dit à Google laquelle des copies compte', () => {
  /*
   * Ces pages existent AUSSI sur GitHub Pages, d'où elles ont été servies un
   * temps. Deux copies d'un même texte à deux adresses, et Google choisit
   * lui-même laquelle indexer — il lui arrive de retenir la mauvaise, et le
   * trafic part alors sur une adresse qui n'est pas celle de l'entreprise.
   */
  for (const p of PAGES) {
    const html = lire(racine, p.source);
    const liens = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)];
    assert.equal(liens.length, 1, `${p.source} : ${liens.length} adresse(s) canonique(s)`);
    assert.equal(liens[0][1], p.url, p.source);
  }
});

test('aucune page n\'est fermée à l\'indexation par mégarde', () => {
  for (const p of PAGES) {
    const robots = meta(lire(racine, p.source), 'robots');
    assert.ok(!/noindex/.test(robots), `${p.source} : « ${robots} »`);
    assert.match(robots, /index/, `${p.source} : directive robots manquante`);
  }
});

test('titres et descriptions : uniques, et de la bonne longueur', () => {
  /*
   * Deux pages au même titre et Google n'en retient qu'une. Un titre trop
   * long est tronqué en plein mot dans les résultats ; une description
   * absente laisse le moteur en composer une lui-même, avec les premiers mots
   * qu'il trouve — souvent un fragment de formulaire.
   */
  const titres = new Set();
  const descriptions = new Set();
  for (const p of PAGES) {
    const html = lire(racine, p.source);
    const t = titre(html);
    const d = meta(html, 'description');

    assert.ok(t.length >= 20 && t.length <= 70, `${p.source} : titre de ${t.length} car. — ${t}`);
    assert.match(t, /NG Security 38/, `${p.source} : la marque doit figurer au titre`);
    assert.ok(!titres.has(t), `titre en double : ${t}`);
    titres.add(t);

    assert.ok(d.length >= 70 && d.length <= 200,
      `${p.source} : description de ${d.length} car.`);
    assert.ok(!descriptions.has(d), `description en double : ${d}`);
    descriptions.add(d);
  }
});

test('partagée par SMS ou sur Facebook, la page arrive avec son image', () => {
  for (const p of PAGES) {
    const html = lire(racine, p.source);
    assert.equal(propriete(html, 'og:url'), p.url, `${p.source} : og:url`);
    assert.ok(propriete(html, 'og:title'), `${p.source} : og:title`);
    assert.ok(propriete(html, 'og:description'), `${p.source} : og:description`);
    assert.equal(propriete(html, 'og:locale'), 'fr_FR', p.source);

    const image = propriete(html, 'og:image');
    assert.match(image, /^https:\/\/ngsecurity38\.fr\/outils\/og-[a-z]+\.png$/,
      `${p.source} : og:image doit être une adresse complète — ${image}`);
    // Et le fichier doit exister là où le site le sert, sinon le lien arrive nu.
    const fichier = image.split('/').pop();
    assert.ok(existsSync(join(servi, fichier)), `${fichier} absent de docs/outils/`);
    assert.equal(propriete(html, 'og:image:width'), '1200', p.source);
  }
});

test('les données structurées sont valides et se rapportent à la bonne page', () => {
  for (const p of PAGES.filter((x) => x.dossier !== '' || true)) {
    const html = lire(racine, p.source);
    const bloc = balise(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!bloc) continue; // l'accueil des outils n'en porte pas
    const donnees = JSON.parse(bloc);
    const noeuds = donnees['@graph'] || [donnees];
    const page = noeuds.find((n) => n['@type'] === 'WebPage');
    assert.ok(page, `${p.source} : aucun WebPage`);
    assert.equal(page.url, p.url, `${p.source} : l'adresse déclarée doit être la canonique`);
    assert.equal(page.inLanguage, 'fr-FR', p.source);

    const fil = page.breadcrumb.itemListElement;
    assert.equal(fil.length, 3, `${p.source} : ${JSON.stringify(fil)}`);
    assert.deepEqual(fil.map((x) => x.position), [1, 2, 3], p.source);
    assert.equal(fil[1].item, `${ADRESSE}/outils/`, `${p.source} : le fil passe par /outils/`);
  }
});

test('le sitemap annonce exactement les pages qui existent', () => {
  const xml = lire(servi, 'sitemap.xml');
  const adresses = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual([...adresses].sort(), PAGES.map((p) => p.url).sort());
  // Une adresse au sitemap qui ne répond pas coûte plus qu'elle ne rapporte.
  for (const p of PAGES) {
    const fichier = join(servi, p.dossier, 'index.html');
    assert.ok(existsSync(fichier), `${p.url} annoncée mais absente : ${fichier}`);
  }
  assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/, 'date de dernière modification');
});

test('l\'accueil des outils relie les trois pages entre elles', () => {
  /*
   * C'est ce qui fait la différence entre trois pages orphelines et un
   * ensemble : un moteur découvre une page parce qu'un lien y mène. Sans
   * cette page, /outils/ répondait 404 et rien ne reliait les trois.
   */
  const html = lire(racine, 'index-outils.html');
  for (const chemin of ['/outils/etude/', '/outils/devis/', '/outils/alarme/']) {
    assert.ok(html.includes(`href="${chemin}"`), `lien manquant vers ${chemin}`);
  }
  assert.ok(existsSync(join(servi, 'index.html')), '/outils/ doit répondre');

  // Du texte, pas seulement des liens : une page de liens nus ne se classe pas.
  const texte = lire(servi, 'index.html')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  assert.ok(texte.length > 1200, `${texte.length} caractères de texte seulement`);
});

test('l\'accueil des outils garde son logo en fichier séparé', () => {
  /*
   * Les trois pages d'outil embarquent le logo en base64 : elles doivent
   * pouvoir être ouvertes d'un double-clic depuis une clé USB. Celle-ci non —
   * elle n'existe que servie par le site. Une image à part se met en cache et
   * laisse le HTML petit, ce qui compte pour une page faite pour être explorée.
   */
  const html = lire(servi, 'index.html');
  assert.ok(!/data:image\//.test(html), 'le logo doit rester un fichier');
  assert.ok(existsSync(join(servi, 'logo.png')), 'logo.png absent à côté de la page');
  assert.ok(html.length < 20000, `${Math.round(html.length / 1024)} Ko`);
});
