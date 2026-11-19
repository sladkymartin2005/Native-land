#!/usr/bin/env python3
"""Stáhne obrázky vlajek z Wikimedia Commons podle app/data/tribes.json.

U každého národa, který má v poli "flag" klíč "commons" (přesný název souboru na Commons),
stáhne náhled vlajky do app/data/flags/<id>.<přípona> a do app/data/flags/CREDITS.json
zapíše název souboru, autora, licenci a odkaz na zdroj. Aplikace si podle CREDITS.json
vlajky sama najde.

Použití (z kořene projektu):  python3 scripts/fetch_flags.py [--force] [--only id1,id2]
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "app", "data")
UA = "tribes-map-builder/1.0 (generic script)"
API = "https://commons.wikimedia.org/w/api.php"
THUMB = "https://commons.wikimedia.org/w/thumb.php"  # vykreslený náhled (SVG -> PNG)
EXT = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg"}


def fetch(url, tries=8):
    """GET s ohledem na limity Wikimedie (HTTP 429 + hlavička Retry-After)."""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read(), r.headers.get_content_type()
        except urllib.error.HTTPError as e:
            if (e.code != 429 and e.code < 500) or i == tries - 1:
                raise
            wait = int(e.headers.get("retry-after") or 30) + 5
            print(f"  limit Wikimedie (HTTP {e.code}), čekám {wait} s…", flush=True)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if i == tries - 1:
                raise
            print(f"  chyba spojení ({e}), zkusím znovu za 60 s…", flush=True)
            time.sleep(60)


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def main():
    force = "--force" in sys.argv
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    tribes = json.load(open(os.path.join(DATA, "tribes.json"), encoding="utf-8"))
    wanted = [n for n in tribes["nations"] if n.get("flag") and n["flag"].get("commons")]
    credits_path = os.path.join(DATA, "flags", "CREDITS.json")
    credits = json.load(open(credits_path, encoding="utf-8")) if os.path.exists(credits_path) else {}

    info = {}
    titles = ["File:" + n["flag"]["commons"] for n in wanted]
    for i in range(0, len(titles), 50):
        q = urllib.parse.urlencode({
            "action": "query", "format": "json", "prop": "imageinfo",
            "iiprop": "url|size|extmetadata",
            "iiextmetadatafilter": "LicenseShortName|Artist",
            "titles": "|".join(titles[i:i + 50]),
        })
        d = json.loads(fetch(API + "?" + q)[0])
        norm = {x["to"]: x["from"] for x in d["query"].get("normalized", [])}
        for p in d["query"]["pages"].values():
            if "imageinfo" in p:
                info[norm.get(p["title"], p["title"])] = p["imageinfo"][0]
                info[p["title"]] = p["imageinfo"][0]
        time.sleep(2)

    for n in wanted:
        f = n["flag"]
        ii = info.get("File:" + f["commons"])
        if not ii:
            print(f"! {n['id']}: soubor „{f['commons']}“ na Commons neexistuje")
            continue
        em = ii.get("extmetadata", {})
        old = credits.get(n["id"], {})
        have = old.get("commons") == f["commons"] and os.path.exists(os.path.join(DATA, old.get("file", "?")))
        entry = {
            "commons": f["commons"], "source": ii.get("descriptionurl"),
            "author": strip_html(em.get("Artist", {}).get("value")),
            "license": strip_html(em.get("LicenseShortName", {}).get("value")),
        }
        if (have and not force) or (only and n["id"] not in only):
            entry["file"] = old["file"]
            if old.get("original_file"):
                entry["original_file"] = old["original_file"]
            credits[n["id"]] = entry
            print(f"= {n['id']}: už staženo")
            continue
        # originál: SVG je ostré při jakékoli velikosti; rastr bereme v plném rozlišení,
        # větší než 1920 px jako standardní náhled 1920 px (Wikimedia jiné velikosti odmítá)
        name = f["commons"].replace(" ", "_")
        if f["commons"].lower().endswith(".svg") or (ii.get("width") or 0) <= 1920:
            url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(name)
        else:
            url = THUMB + "?" + urllib.parse.urlencode({"f": name, "w": 1920})
        body, ctype = fetch(url)
        if ctype not in EXT:
            print(f"! {n['id']}: neočekávaný typ odpovědi {ctype}")
            continue
        entry["file"] = f"flags/{n['id']}.{EXT[ctype]}"
        os.makedirs(os.path.join(DATA, "flags"), exist_ok=True)
        with open(os.path.join(DATA, entry["file"]), "wb") as out:
            out.write(body)
        credits[n["id"]] = entry
        json.dump(credits, open(credits_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
        print(f"+ {n['id']}: {f['commons']} ({entry['license']})", flush=True)
        time.sleep(6)

    # vyřadit záznamy vlajek, které už v tribes.json nejsou
    ids = {n["id"] for n in wanted}
    credits = {k: v for k, v in credits.items() if k in ids}
    json.dump(credits, open(credits_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    print(f"Hotovo: {len(credits)} vlajek, zdroje v {os.path.relpath(credits_path, ROOT)}")


if __name__ == "__main__":
    main()
