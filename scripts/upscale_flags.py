#!/usr/bin/env python3
"""Zostří malé rastrové vlajky (GIF/PNG/JPG užší než 1200 px), aby po rozkliknutí nebyly rozmazané.

Některé vlajky jsou na Wikimedia Commons jen jako malé obrázky (např. Hopiové, Lenapové).
Vlajky mají plné plochy barev, proto: zvětšit (Lanczos) na dvojnásobek cíle, barvy přichytit
k paletě originálu (hrany přestanou být rozmazané), vyhladit medianem a zmenšit na cíl
– tím vznikne čistý antialiasing hran. Výsledek se uloží jako flags/<id>-hd.webp
a CREDITS.json se přepne na něj (původní soubor a licence zůstanou uvedené).

Spouštět po scripts/fetch_flags.py:   python3 scripts/upscale_flags.py
"""
import io
import json
import os
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "app", "data")
MIN_W, TARGET_W = 1200, 1800


def upscale(src, dst, colors):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    k = max(2, round(TARGET_W / w))
    big = im.resize((w * k * 2, h * k * 2), Image.LANCZOS)
    pal = im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    snapped = big.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB").filter(ImageFilter.MedianFilter(5))
    out = snapped.resize((w * k, h * k), Image.LANCZOS)
    # WebP: ztrátově v kvalitě 92, bezztrátově jen když vyjde menší (jednoduché vlajky)
    lossy, lossless = io.BytesIO(), io.BytesIO()
    out.save(lossy, "WEBP", quality=92, method=6)
    out.save(lossless, "WEBP", lossless=True, method=6)
    best = min(lossy, lossless, key=lambda b: len(b.getvalue()))
    open(dst, "wb").write(best.getvalue())
    return out.size


def main():
    path = os.path.join(DATA, "flags", "CREDITS.json")
    credits = json.load(open(path, encoding="utf-8"))
    for nid, c in sorted(credits.items()):
        f = c.get("original_file") or c.get("file", "")
        if not f or f.endswith(".svg") or not os.path.exists(os.path.join(DATA, f)):
            continue
        w = Image.open(os.path.join(DATA, f)).size[0]
        if w >= MIN_W:
            continue
        out = f"flags/{nid}-hd.webp"
        size = upscale(os.path.join(DATA, f), os.path.join(DATA, out), colors=64)
        c["original_file"], c["file"] = f, out
        print(f"{nid}: {w} px → {size[0]} px ({out})")
    json.dump(credits, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
