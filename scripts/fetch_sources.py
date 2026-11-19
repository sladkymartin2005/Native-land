#!/usr/bin/env python3
"""Stáhne podklady (Wikipedia + Wikidata) pro seznam kmenů.
Použití: python3 scripts/fetch_sources.py <výstupní.json>
"""
import json, sys, time, urllib.error, urllib.parse, urllib.request

UA = "tribes-map-builder/1.0 (generic script)"
TITLES = """Iroquois|Wyandot people|Lenape|Wampanoag|Mi'kmaq|Abenaki|Powhatan|Shawnee|Miami people|Ojibwe|Potawatomi|Ho-Chunk|Cherokee|Muscogee|Choctaw|Chickasaw|Seminole|Natchez people|Timucua|Caddo|Sioux|Cheyenne|Arapaho|Comanche|Kiowa|Crow people|Blackfoot Confederacy|Pawnee people|Osage Nation|Mandan|Cree|Assiniboine|Navajo|Apache|Hopi|Zuni people|Puebloans|Tohono Oʼodham|Shoshone|Ute people|Northern Paiute people|Nez Perce|Chumash people|Pomo|Tlingit|Haida people|Kwakwakaʼwakw|Coast Salish|Chinookan peoples|Chipewyan|Innu|Gwichʼin|Beothuk|Inuit|Aleuts|Yupik peoples|Aztecs|Maya peoples|Yaqui|Rarámuri|Huichol|Purépecha|Zapotec peoples|Mixtec|Otomi|Totonac|Seri people""".split("|")

def get(url, tries=8):
    """GET s ohledem na limity Wikimedie (429 + Retry-After)."""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
            time.sleep(int(e.headers.get("retry-after") or 30) + 5)

def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]

def main(out):
    res = {}
    api = "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1"
    # 1) úvodní odstavce + QID, po 20 titulech na dotaz (limit pro extracts)
    for group in chunks(TITLES, 20):
        d = get(api + "&prop=pageprops|extracts&exintro=1&explaintext=1&exlimit=20&titles="
                + urllib.parse.quote("|".join(group)))
        for page in d["query"]["pages"].values():
            res[page["title"]] = {"qid": page.get("pageprops", {}).get("wikibase_item"),
                                  "extract": (page.get("extract") or "")[:1200]}
        time.sleep(5)
    # 2) Wikidata: vlajka (P41), populace (P1082), český název
    by_qid = {v["qid"]: v for v in res.values() if v["qid"]}
    for group in chunks(list(by_qid), 50):
        d = get("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
                "&props=claims|labels|sitelinks&languages=cs|en&sitefilter=cswiki&ids=" + "|".join(group))
        for qid, ent in d["entities"].items():
            cl, info = ent.get("claims", {}), by_qid[qid]
            val = lambda p: [c["mainsnak"]["datavalue"]["value"] for c in cl.get(p, []) if "datavalue" in c["mainsnak"]]
            info["flag_p41"] = val("P41")
            info["pop_p1082"] = [v["amount"] for v in val("P1082")]
            info["cs_label"] = ent.get("labels", {}).get("cs", {}).get("value")
            info["cswiki"] = ent.get("sitelinks", {}).get("cswiki", {}).get("title")
        time.sleep(5)
    json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main(sys.argv[1])
