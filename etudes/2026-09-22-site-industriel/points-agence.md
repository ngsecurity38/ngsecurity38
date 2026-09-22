# Points à traiter avant remise — ETU-2026-09-22

Établi le 22 septembre 2026, avec le document. Ce fichier ne part PAS au
client : il ne contient que ce que l'agence doit lever de son côté.

## Identité de l'agence

- À trancher : Le RCS. Vos pages publiques annoncent « RCS Sens 518 723 366 », qui n'est pas le SIREN communiqué, 104 732 458 — deux identités différentes, dont une seule peut figurer sur un devis. Le SIRET communiqué fait foi ici ; la mention RCS est retirée du document tant que la contradiction n'est pas levée.
- Manquant : Assurance responsabilité civile professionnelle : compagnie et numéro de police.

## Fiches constructeur à ouvrir

Aucune fiche n'a pu être consultée à la source depuis l'atelier. Les
optiques retenues viennent de recherches documentaires, et les portées
DORI du document en découlent : une optique fausse les fausse toutes.

- Hikvision DS-2CD2346G2H-IU (2,8 mm) — Champ horizontal 100,2° et définition 2688 × 1520 relevés par recherche documentaire (fiche DS-2CD2346G2H-I(U), éd. 13/05/2024). Infrarouge 30 m annoncé par plusieurs revendeurs. À CONFIRMER sur la fiche.
- Hikvision DS-2CD2683G2-IZS (2,8–12 mm motorisé) — Champ horizontal 108° à 30° et définition 3840 × 2160 relevés par recherche documentaire (fiche DS-2CD2683G2-IZS V5.5.113). Portée infrarouge NON RELEVÉE. À CONFIRMER sur la fiche.
- Hikvision DS-2CD2346G2P-ISU/SL (2,8 mm)(C) — Deux objectifs de 2,8 mm assemblés en 180°, définition 3040 × 1368, infrarouge 30 m : relevés par recherche documentaire (fiche DS-2CD2346G2P-ISU/SL, éd. 27/03/2024). À CONFIRMER sur la fiche.

## Enregistreur

- Le budget PoE total des seize ports, en watts. Seize ports ne veulent pas dire seize caméras alimentées : un enregistreur distribue une puissance totale, et les caméras à infrarouge et à stroboscope sont les plus gourmandes du parc. C'est le chiffre qui manque au relevé et qui décide si tout tient sur la machine.
- Comment les coffrets déportés s'y raccordent. Un commutateur placé derrière un port PoE d'enregistreur Hikvision fonctionne, mais sort de la reconnaissance automatique : les caméras qui sont derrière s'ajoutent alors à la main, par leur adresse. Le raccordement par le port réseau est plus sain. À arrêter à la mise en service, pas sur le chantier.
- La capacité maximale admise par baie. Elle n'est pas au relevé, et elle conditionne le choix des disques.
- La présence et le niveau de RAID. Un deux-baies ne fait pas toujours de miroir ; sans miroir, la perte d'un disque emporte sa part des images.

## Interphonie

- Le nombre de ports du commutateur fourni, et son budget PoE. Le kit alimente au moins la platine et le moniteur ; savoir s'il peut porter davantage évite d'en acheter un second.
- Les contacts de commande disponibles sur la platine : nature (sec ou alimenté), nombre, pouvoir de coupure. C'est ce qui décide si la platine commande directement le verrouillage ou passe par un relais.
- La compatibilité des badges déjà en service sur le site, le cas échéant. Le 13,56 MHz recouvre plusieurs protocoles qui ne se lisent pas entre eux.

## À vérifier sur le document lui-même

- La vue aérienne porte un repère commercial qui identifie le voisinage.
  À retirer si le dossier doit circuler au-delà du client.
- Les visuels de matériel ont été rapprochés des références à la forme
  seulement. Vérifier que chaque image correspond bien à la référence.

## Hypothèses du plan

- Longueur de bâtiment supposée : 75 m. Tout le plan
  et tout le métré en dépendent. Une seule cote relevée les recale.
- Emplacement du local technique supposé, côté bureaux. Le déplacer change
  toutes les longueurs de câble.
- Arrivée 230 V au portail : nécessaire au coffret d'entrée, non vérifiée.

