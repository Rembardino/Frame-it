"""Monta lo spot verticale 1080x1920 (TikTok, Reels, Shorts): python store/video/compose.py

Usa i fotogrammi di store/video/record.mjs e le scritte di store/video/overlays.mjs (in artifacts/video-frames/).
Gioco 1080x1350 sotto il titolo, sfondo = lo stesso fotogramma sfocato e scurito, flash da otturatore tra le scene,
titolo che entra con un piccolo rimbalzo, schermata finale con leggero zoom. Esce store/video/frameit-ad-drone-50s.mp4 (H.264, 30 fps).
Codifica finale con ffmpeg/x264 (pip install imageio-ffmpeg): qualità alta e file leggero, traccia audio muta (la musica si aggiunge sulla piattaforma).
"""
import os
import subprocess
import cv2
import imageio_ffmpeg
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
FRAMES = os.path.join(ROOT, 'artifacts', 'video-frames')
OUT = os.path.join(ROOT, 'store', 'video', 'frameit-ad-drone-50s.mp4')
RAW = os.path.join(FRAMES, 'ad-raw.mp4')
W, H, FPS = 1080, 1920, 30
GAME_Y = 440            # il gioco (1080x1350) va da qui a 1790; sopra il titolo (le prime ~130 px le copre l'interfaccia di TikTok)
HEAD_Y, TAG_POS = 130, (24, GAME_Y + 86)
# (scena, tratti di fotogrammi registrati (da, a, passo)): passo 3 = tre volte più veloce (il volo della buca in uno).
# Totale con il finale ≈ 50 s.
SCENES = [('d1-calcio-drone', [(0, 155, 1)]), ('d2-golf-drone', [(15, 195, 1)]), ('d3-ciclismo-aquila', [(10, 210, 1)]),
          ('x1-proposta', [(0, 222, 1)]), ('x2-bacio', [(0, 135, 1)]), ('x3-mascotte', [(0, 165, 1)]),
          ('x4-stella', [(0, 115, 1)]), ('x5-golf-ace', [(0, 45, 1), (45, 170, 3), (170, 248, 1)])]
END_SEC = 5


def png(name):
    return cv2.imread(os.path.join(FRAMES, 'overlays', name + '.png'), cv2.IMREAD_UNCHANGED)


def paste(dst, src, x, y, alpha=1.0):
    """Incolla un PNG con trasparenza (alpha extra 0..1), tagliando ai bordi."""
    h, w = src.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(dst.shape[1], x + w), min(dst.shape[0], y + h)
    if x1 <= x0 or y1 <= y0:
        return
    s = src[y0 - y:y1 - y, x0 - x:x1 - x]
    a = (s[:, :, 3:4].astype(np.float32) / 255.0) * alpha if s.shape[2] == 4 else np.full(s.shape[:2] + (1,), alpha, np.float32)
    region = dst[y0:y1, x0:x1].astype(np.float32)
    dst[y0:y1, x0:x1] = (region * (1 - a) + s[:, :, :3].astype(np.float32) * a).astype(np.uint8)


def ease_back(u):
    """0..1 con un piccolo rimbalzo finale (il titolo "salta" dentro)."""
    c = 1.70158
    return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2


def background(game):
    # Sfondo: il fotogramma ingrandito a riempire, molto sfocato (a bassa risoluzione: veloce) e scurito.
    small = cv2.resize(game, (108, 135))
    small = cv2.GaussianBlur(small, (0, 0), 6)
    bg = cv2.resize(small, (int(H * 1080 / 1350), H))
    x = (bg.shape[1] - W) // 2
    return (bg[:, x:x + W].astype(np.float32) * 0.42).astype(np.uint8)


def main():
    # Prima un file intermedio quasi senza perdite (encoder di Windows), poi x264.
    writer = cv2.VideoWriter(RAW, cv2.CAP_MSMF, cv2.VideoWriter_fourcc(*'avc1'), FPS, (W, H), [cv2.VIDEOWRITER_PROP_QUALITY, 100])
    assert writer.isOpened(), 'encoder H.264 non disponibile'
    last = None
    total = 0
    for scene, parts in SCENES:
        head, tag = png(scene + '-head'), png(scene + '-tag')
        for f, src in enumerate(i for a, b, step in parts for i in range(a, b, step)):
            game = cv2.imread(os.path.join(FRAMES, scene, '%04d.jpg' % src))
            frame = background(game)
            frame[GAME_Y:GAME_Y + 1350] = game
            # Bordo sottile giallo sopra e sotto il gioco (stile mirino del marchio).
            frame[GAME_Y - 4:GAME_Y] = (63, 210, 255)
            frame[GAME_Y + 1350:GAME_Y + 1354] = (63, 210, 255)
            # Titolo: entra in 9 fotogrammi con rimbalzo.
            u = min(1.0, f / 9)
            k = 0.75 + 0.25 * ease_back(u)
            hs = cv2.resize(head, (int(head.shape[1] * k), int(head.shape[0] * k)))
            paste(frame, hs, (W - hs.shape[1]) // 2, HEAD_Y + (head.shape[0] - hs.shape[0]) // 2, min(1.0, u * 1.5))
            paste(frame, tag, TAG_POS[0] - int((1 - min(1.0, f / 7)) * 300), TAG_POS[1])
            # Flash da otturatore all'inizio di ogni scena.
            if f < 6:
                frame = cv2.addWeighted(frame, 1.0, np.full_like(frame, 255), 0.8 * (1 - f / 6), 0)
            writer.write(frame)
            last = frame
            total += 1
    # Finale: dissolvenza dall'ultima scena, poi leggero zoom sulla schermata finale.
    end = cv2.imread(os.path.join(FRAMES, 'overlays', 'end.png'))
    for f in range(END_SEC * FPS):
        z = 1 + 0.04 * f / (END_SEC * FPS)
        zw, zh = int(W * z), int(H * z)
        e = cv2.resize(end, (zw, zh))[(zh - H) // 2:(zh - H) // 2 + H, (zw - W) // 2:(zw - W) // 2 + W]
        if f < 10:
            e = cv2.addWeighted(last, 1 - f / 10, e, f / 10, 0)
        writer.write(e)
        total += 1
    writer.release()
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', '-i', RAW, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
                    '-shortest', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
                    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', OUT], check=True)
    print('ok', OUT, '%.1f s' % (total / FPS), '%.1f MB' % (os.path.getsize(OUT) / 1e6))


main()
