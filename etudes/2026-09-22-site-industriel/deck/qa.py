"""
Contrôle géométrique du .pptx.

LibreOffice ne fonctionne pas dans cet atelier — il refuse jusqu'à un
fichier texte — donc le rendu visuel habituel est hors d'atteinte. Ce
contrôle prend le problème par la géométrie : il lit les formes une à une
et signale ce qui, dans une diapositive, se voit toujours :

  - une forme qui sort de la diapositive ou frôle son bord ;
  - un texte plus haut que la boîte qui le porte ;
  - deux boîtes de texte qui se chevauchent.

L'estimation de hauteur de texte est approchée — largeur moyenne de glyphe
par taille de police — et elle est volontairement PESSIMISTE : mieux vaut
vérifier une alerte de trop qu'expédier une diapositive tronquée.
"""
import sys
from pptx import Presentation
from pptx.util import Emu

LARGEUR, HAUTEUR = 13.333, 7.5
MARGE = 0.5
po = lambda v: Emu(v).inches if v is not None else None

# Largeur moyenne d'un glyphe, en fraction de la taille de police.
LARGEUR_GLYPHE = 0.50
INTERLIGNE = 1.22

def hauteur_estimee(cadre, largeur_po):
    total = 0.0
    for p in cadre.paragraphs:
        texte = ''.join(r.text for r in p.runs) or p.text or ''
        tailles = [r.font.size.pt for r in p.runs if r.font.size] or [18]
        taille = max(tailles)
        if not texte.strip():
            total += taille * INTERLIGNE / 72
            continue
        car_par_ligne = max(1, int(largeur_po * 72 / (taille * LARGEUR_GLYPHE)))
        lignes = 0
        for bloc in texte.split('\n'):
            lignes += max(1, -(-len(bloc) // car_par_ligne))
        total += lignes * taille * INTERLIGNE / 72
    return total

def boites(diapo):
    for f in diapo.shapes:
        if f.left is None or f.top is None:
            continue
        yield f, (po(f.left), po(f.top), po(f.width or 0), po(f.height or 0))

pres = Presentation(sys.argv[1])
alertes = 0
for n, d in enumerate(pres.slides, 1):
    problemes = []
    textes = []
    for f, (x, y, w, h) in boites(d):
        nom = f.shape_type
        if x < -0.01 or y < -0.01 or x + w > LARGEUR + 0.01 or y + h > HAUTEUR + 0.01:
            problemes.append(f'HORS CADRE {nom} x={x:.2f} y={y:.2f} w={w:.2f} h={h:.2f}')
        elif x < MARGE - 0.01 or y < MARGE - 0.01 or x + w > LARGEUR - MARGE + 0.01 \
                or y + h > HAUTEUR - MARGE + 0.01:
            # Le logo et la signature vivent volontairement dans la marge basse.
            if not (y > 6.6):
                problemes.append(f'marge courte {nom} x={x:.2f} y={y:.2f} '
                                 f'droite={LARGEUR-(x+w):.2f} bas={HAUTEUR-(y+h):.2f}')
        if f.has_text_frame and f.text_frame.text.strip():
            besoin = hauteur_estimee(f.text_frame, w)
            if besoin > h + 0.06:
                problemes.append(f'DÉBORDE h={h:.2f}" besoin≈{besoin:.2f}" '
                                 f'« {f.text_frame.text[:45]}… »')
            textes.append((x, y, w, h, f.text_frame.text[:28]))
    for i in range(len(textes)):
        for j in range(i + 1, len(textes)):
            ax, ay, aw, ah, at = textes[i]
            bx, by, bw, bh, bt = textes[j]
            ox = min(ax + aw, bx + bw) - max(ax, bx)
            oy = min(ay + ah, by + bh) - max(ay, by)
            if ox > 0.12 and oy > 0.12:
                problemes.append(f'chevauchement {ox:.2f}×{oy:.2f}" — '
                                 f'« {at} » / « {bt} »')
    if problemes:
        alertes += len(problemes)
        print(f'\n--- diapositive {n} ---')
        for p in problemes:
            print('  ', p)

print(f'\n{len(pres.slides.__iter__.__self__._sldIdLst)} diapositives, {alertes} alerte(s)')
