"""Monte le pilote « Tonton Mbote et le smartphone » en vidéo verticale 9:16.

Usage : python3 build_video.py <fr|ln> <dossier_modeles_kokoro> <dossier_sortie>

Voix : Kokoro TTS (open source, local). Images : scènes générées (dossier images/).
Animation : recadrage vertical sur le personnage qui parle, zoom lent,
tremblement sur les cris, sous-titres incrustés.
"""
import os
import subprocess
import sys
import textwrap

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(HERE, "..", "images")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
W, H, FPS = 720, 1280, 25
GAP = 0.25  # silence entre deux répliques (s)

# (personnage, image, centre_x du recadrage dans l'image 768x432, effet, texte FR, texte LN)
LINES = [
    ("K", "scene2_tonton_crie.jpg", 125, "zoom",
     "Tonton ! Je t'ai acheté un smartphone !",
     "Tonton ! Nasombeli yo smartphone !"),
    ("T", "scene3_tonton_espion.jpg", 370, "zoom",
     "Un quoi ? Smart... ? Moi je suis déjà smart, mon fils !",
     "Nini ? Smart... ? Ngai nazali déjà smart, mwana na ngai !"),
    ("K", "scene3_tonton_espion.jpg", 590, "zoom",
     "Regarde, tu lui parles et il te répond. Dis juste « bonjour ».",
     "Tala, olobi na ye, ye azongisaka. Loba kaka « mbote »."),
    ("T", "scene2_tonton_crie.jpg", 400, "shake",
     "BONJOUR TÉLÉPHONE ! C'EST TONTON MBOTE DE MATONGÉ !",
     "MBOTE TÉLÉPHONE ! NAZALI TONTON MBOTE YA MATONGÉ !"),
    ("K", "scene2_tonton_crie.jpg", 125, "zoom",
     "Tonton, pas besoin de crier, il entend très bien !",
     "Tonton, kogangaka te, ayokaka malamu !"),
    ("T", "scene3_tonton_espion.jpg", 370, "zoom",
     "Il entend ? Alors il entend aussi quand ta tante parle de moi ?! Éteins ça, c'est un espion !",
     "Ayokaka ? Boye ayokaka mpe soki tantine na yo azali koloba makambo na ngai ?! Kanga yango, ezali espion !"),
    ("K", "scene3_tonton_espion.jpg", 590, "zoom",
     "Tonton... c'est juste un téléphone...",
     "Tonton... ezali kaka téléphone..."),
    ("T", "scene3_tonton_espion.jpg", 370, "punch",
     "Un téléphone qui écoute tout... c'est une belle-mère !",
     "Téléphone oyo eyokaka nyonso... ezali bokilo !"),
]
NAMES = {"K": ("KÉVINO", (255, 214, 0)), "T": ("TONTON MBOTE", (255, 120, 40))}
TITLE = {"fr": ("TONTON MBOTE", "Épisode 1 : Le smartphone", "Abonne-toi pour l'épisode 2 !"),
         "ln": ("TONTON MBOTE", "Épisode 1 : Smartphone", "Abonne-toi mpo na épisode 2 !")}


def voices(k):
    """Voix « mélangées » : timbre masculin + phonétique française."""
    fr = k.get_voice_style("ff_siwis")
    tonton = 0.45 * fr + 0.55 * k.get_voice_style("am_onyx")
    kevino = 0.55 * fr + 0.45 * k.get_voice_style("am_puck")
    # (style, vitesse, facteur de hauteur appliqué ensuite)
    return {"T": (tonton, 0.92, 0.88), "K": (kevino, 1.08, 1.0)}


def synth(k, style, speed, pitch, text, path, tmp):
    audio, sr = k.create(text, voice=style, speed=speed, lang="fr-fr")
    raw = tmp + ".raw.wav"
    sf.write(raw, audio, sr)
    af = f"rubberband=pitch={pitch}," if pitch != 1.0 else ""
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw,
                    "-af", f"{af}aresample=44100,loudnorm=I=-16:TP=-1.5",
                    "-ac", "1", path], check=True)
    os.remove(raw)
    return sf.info(path).duration


def outlined(draw, xy, text, font, fill, anchor="mm", stroke=5):
    draw.text(xy, text, font=font, fill=fill, anchor=anchor,
              stroke_width=stroke, stroke_fill=(0, 0, 0))


def subtitle(img, who, text):
    d = ImageDraw.Draw(img)
    name, color = NAMES[who]
    f_name = ImageFont.truetype(FONT, 34)
    f_txt = ImageFont.truetype(FONT, 44)
    lines = textwrap.wrap(text, 24)
    y = H - 140 - 56 * len(lines)
    outlined(d, (W // 2, y - 50), name, f_name, color)
    for i, ln in enumerate(lines):
        outlined(d, (W // 2, y + i * 56), ln, f_txt, (255, 255, 255))


def shot_frames(src, cx, effect, n):
    """Images d'un plan : recadrage vertical animé sur le personnage."""
    sw, sh = src.size
    for i in range(n):
        p = i / max(n - 1, 1)
        if effect == "punch":
            z = 1.0 + 0.35 * min(p * 3, 1.0)  # zoom rapide sur la chute
        else:
            z = 1.0 + 0.08 * p  # zoom lent
        ch = sh / z
        cw = ch * W / H
        dx = dy = 0.0
        if effect == "shake":
            dx = 6 * np.sin(i * 2.1)
            dy = 4 * np.cos(i * 2.7)
        x0 = min(max(cx - cw / 2 + dx, 0), sw - cw)
        y0 = min(max((sh - ch) / 2 + dy, 0), sh - ch)
        yield src.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))


def card(bg, big, small, n):
    base = bg.resize((W, H), Image.LANCZOS, box=(200, 0, 443, 432)).filter(ImageFilter.GaussianBlur(14))
    d = ImageDraw.Draw(base)
    outlined(d, (W // 2, H // 2 - 60), big, ImageFont.truetype(FONT, 76), (255, 214, 0), stroke=7)
    for i, ln in enumerate(textwrap.wrap(small, 22)):
        outlined(d, (W // 2, H // 2 + 50 + i * 60), ln, ImageFont.truetype(FONT, 46), (255, 255, 255))
    for _ in range(n):
        yield base


def main():
    lang, model_dir, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(out_dir, "tmp_" + lang)
    os.makedirs(tmp, exist_ok=True)
    k = Kokoro(os.path.join(model_dir, "kokoro-v1.0.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))
    vs = voices(k)
    imgs = {f: Image.open(os.path.join(IMG_DIR, f)).convert("RGB") for f in {l[1] for l in LINES}}

    title, ep, outro = TITLE[lang]
    intro_s, outro_s = 2.0, 2.5
    clips, durs = [], []
    for idx, (who, img, cx, eff, fr, ln) in enumerate(LINES):
        style, speed, pitch = vs[who]
        wav = os.path.join(tmp, f"{idx:02d}.wav")
        durs.append(synth(k, style, speed, pitch, fr if lang == "fr" else ln, wav, wav))
        clips.append(wav)

    # Piste audio : silence d'intro, répliques séparées par GAP, silence de fin.
    concat = os.path.join(tmp, "list.txt")
    sil = os.path.join(tmp, "gap.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                    "anullsrc=r=44100:cl=mono", "-t", str(GAP), sil], check=True)
    intro_sil = os.path.join(tmp, "intro.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                    "anullsrc=r=44100:cl=mono", "-t", str(intro_s), intro_sil], check=True)
    outro_sil = os.path.join(tmp, "outro.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                    "anullsrc=r=44100:cl=mono", "-t", str(outro_s), outro_sil], check=True)
    with open(concat, "w") as fh:
        fh.write(f"file '{intro_sil}'\n")
        for c in clips:
            fh.write(f"file '{c}'\nfile '{sil}'\n")
        fh.write(f"file '{outro_sil}'\n")
    voice_track = os.path.join(tmp, "voice.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", concat, voice_track], check=True)

    # Vidéo : images générées image par image, envoyées à ffmpeg.
    out = os.path.join(out_dir, f"tonton_mbote_ep1_{lang}.mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", voice_track,
                           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out],
                          stdin=subprocess.PIPE)
    bg = imgs["scene2_tonton_crie.jpg"]
    for fr_img in card(bg, title, ep, int(intro_s * FPS)):
        ff.stdin.write(fr_img.tobytes())
    for (who, img, cx, eff, fr, ln), d in zip(LINES, durs):
        n = int(round((d + GAP) * FPS))
        for f in shot_frames(imgs[img], cx, eff, n):
            subtitle(f, who, fr if lang == "fr" else ln)
            ff.stdin.write(f.tobytes())
    for fr_img in card(bg, title, outro, int(outro_s * FPS) + FPS):
        ff.stdin.write(fr_img.tobytes())
    ff.stdin.close()
    ff.wait()
    print(out)


if __name__ == "__main__":
    main()
