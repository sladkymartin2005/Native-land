#!/usr/bin/env python3
"""Stáhne volitelnou vrstvu tradičních území z Native Land Digital (https://native-land.ca).

Vyžaduje vlastní API klíč (zdarma po registraci na https://native-land.ca/dashboard).
Data podléhají podmínkám Native Land Digital – nejsou součástí tohoto projektu.

Použití (z kořene projektu):
    NATIVE_LAND_KEY=váš_klíč python3 scripts/fetch_nativeland.py

Výsledek: app/data/nativeland.geojson (omezeno na Severní Ameriku). Aplikace vrstvu
nabídne automaticky, jakmile soubor existuje.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "data", "nativeland.geojson")
API = "https://native-land.ca/api/index.php"


def in_north_america(geometry):
    def first(c):
        while isinstance(c[0], list):
            c = c[0]
        return c
    try:
        lon, lat = first(geometry["coordinates"])[:2]
    except (KeyError, IndexError, TypeError):
        return False
    return 7 <= lat <= 85 and -180 <= lon <= -50


def main():
    key = os.environ.get("NATIVE_LAND_KEY")
    if not key:
        sys.exit("Nastavte proměnnou NATIVE_LAND_KEY (klíč z https://native-land.ca/dashboard).")
    url = API + "?" + urllib.parse.urlencode({"maps": "territories", "key": key})
    req = urllib.request.Request(url, headers={"User-Agent": "tribes-map-builder/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    features = data["features"] if isinstance(data, dict) else data
    keep = []
    for f in features:
        if not f.get("geometry") or not in_north_america(f["geometry"]):
            continue
        p = f.get("properties", {})
        keep.append({"type": "Feature", "geometry": f["geometry"],
                     "properties": {"Name": p.get("Name"), "description": p.get("description"), "color": p.get("color")}})
    with open(OUT, "w", encoding="utf-8") as out:
        json.dump({"type": "FeatureCollection", "features": keep}, out, ensure_ascii=False)
    print(f"Uloženo {len(keep)} území do {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
