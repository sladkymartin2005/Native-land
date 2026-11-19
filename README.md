# Native Land – interaktivní mapa původních národů Severní Ameriky

Interaktivní historická mapa území indiánských kmenů a původních národů **USA, Kanady a Mexika**
s časovou osou (1000–2025), česky a anglicky. U každého národa najdete území v čase, vlajku (pokud existuje),
odhady populace, jazykovou rodinu, klíčové události a odkazy na Wikipedii.

## Spuštění

Potřebujete jen [Docker](https://docs.docker.com/get-docker/) (Docker Desktop na Windows/macOS).

```bash
docker compose up -d --build
```

Poté otevřete <http://localhost:8080>.

Zastavení:

```bash
docker compose down
```

Jiný port nastavíte v `docker-compose.yml` (řádek `"8080:80"` → např. `"3000:80"`).

Bez Dockeru stačí jakýkoli statický server, např. `python3 -m http.server 8080 --directory app`.

## Co mapa umí

- **Časová osa** – posuvník roku nebo tlačítko ▶; území se mění podle toho, kde národ v daném roce žil
  (původní domovina → vyhnání → rezervace). Přepínač „všechna období“ zobrazí vše najednou.
- **Detail národa** – klik na území nebo na položku v seznamu: vlajka, vlastní název, jazyk, popis,
  tabulka populace, seznam území s roky (klik přesune mapu i čas), klíčové události.
- **Hledání a filtr** podle kulturní oblasti (Pláně, Jihozápad, Mezoamerika…).
- **Vrstvy** – dnešní rezervace v USA (703 území, U.S. Census 2023) a rezervy a území z dohod
  v Kanadě (3 377 území, Natural Resources Canada).
- Odkaz na konkrétní národ: `http://localhost:8080/#cherokee`.

## Novinky ve verzi 3

- **Průvodce pro nové uživatele** – při první návštěvě aplikace nabídne krátkou prohlídku ovládání (časová osa,
  události, území, seznam národů, vrstvy). Kdykoli znovu ji spustíte tlačítkem **?** vpravo nahoře, kde je i nápověda
  s vysvětlivkami mapy a klávesovými zkratkami.
- **Přehlednější menu Národy** – národy seskupené podle kulturních oblastí s náhledem vlajky a obdobím,
  přepínač „Všechny / Na mapě v daném roce“, filtr podle jazykových rodin. Detail národa má záložky
  (Území, Populace, Události, Odkazy) a kartu se základními údaji včetně dnešního počtu příslušníků.
- **Ostré vlajky** – vektorové originály (SVG) nebo standardní náhledy 1920 px z Wikimedia Commons; po kliknutí se vlajka zvětší
  přes skoro celé okno, vycentrovaná na tmavém pozadí, s autorem a licencí.
- **Realistické lodě** – Kolumbova flotila z fotografií replik lodí, s houpáním na vlnách a brázdou za zádí.
- Ikona aplikace v záložce prohlížeče a na ploše iPhonu.

## Novinky ve verzi 2

- Časová osa po jednom roce od roku 1000, plynulé přehrávání; značka **1492** s animací Kolumbových lodí.
- Přepínač jazyka (čeština / americká angličtina) vpravo nahoře; anglické texty jsou v `app/data/tribes.en.json`.
- Reliéfní podkladová mapa (Esri World Physical), volitelně dnešní hranice a města.
- Území jsou oříznutá podle pobřeží a velkých jezer (`app/data/territories.geojson`), názvy leží uprostřed území.
- Barvy území odpovídají jazykovým rodinám.
- Předkolumbovské kultury: Mississippská kultura (Cahokia), Předkové Pueblanů, Hohokam, Toltékové, Dorsetská kultura.

Po úpravě polygonů v `tribes.json` přegenerujte ořez podle pobřeží (vyžaduje Node.js):

```bash
cd scripts && npm install && node build_territories.js
```

Bez toho aplikace u změněného území použije hrubý neoříznutý tvar.

### Úvodní animace

Při otevření pokryje okno béžová obrazovka s tlačítkem **Vstoupit do světa indiánů**. Po kliknutí přeletí přes
obrazovku orel bělohlavý, zakřičí a mezitím se objeví mapa. Tlačítko je nutné, protože prohlížeče nedovolí
stránce pustit zvuk bez kliknutí uživatele.

- Fotografie orla: Casey Helton, [Bald eagle – Cannon Beach, Oregon](https://commons.wikimedia.org/wiki/File:Bald_eagle_-_Cannon_Beach,_Oregon,_5-2026_3.jpg),
  CC BY-SA 4.0 – upraveno: z fotky zdola je složen pohled shora (křídlo natočené kolmo k tělu a zrcadlené,
  tělo srovnané do osy letu, nohy odstraněné, ocas dokreslený texturou peří z hlavy). Soubory
  `app/media/eagle-top-*.webp` (horní křídlo, dolní křídlo, tělo); postup je ve `scripts/eagle_topview.py`.
  Mávání: aplikace křídla při úderu zkracuje kolem ramen.
- Hudba v pozadí (hraje dokola od konce přeletu orla, vypíná se tlačítkem ♪ vpravo nahoře):
  indiánská flétna – Ron Perry, skladby [Prayer Song](https://archive.org/details/RonPerry-PrayerSonglekom),
  [Awakening](https://archive.org/details/RonPerry-awakening) a [Variation](https://archive.org/details/RonPerryvariation),
  CC BY-NC-SA 3.0 (jen pro nekomerční použití) – upraveno: ozvěna kaňonu a smíchání s nočními zvuky
  (cvrčci a vítr jsou vygenerované, `scripts/ambience.py`). Soubor `app/media/music.mp3`.
- Lodě v animaci Kolumbovy plavby: Xrzt, [Santa Maria replica ship](https://commons.wikimedia.org/wiki/File:Santa_Maria_replica_ship.jpg),
  a Lopo Pizarro, [Caravela Vera Cruz](https://commons.wikimedia.org/wiki/File:Caravela_Vera_Cruz.jpg), obě CC BY-SA 4.0 –
  upraveno: vyříznuto z pozadí, u Santa Maríe odstraněna novodobá vlajka (`app/media/ship-*.webp`, `scripts/ship_cutout.py`).
- Ikona aplikace: portrét Sedícího býka, fotografie D. F. Barry (1883), volné dílo; prérie dokreslená.
- Hlas: káně rudoocasá, nahrávka [xeno-canto XC71575](https://xeno-canto.org/71575) od Jonathona Jongsmy,
  CC BY-SA 3.0 – upraveno: dva výkřiky za sebou s ozvěnou (`app/media/eagle.mp3`).

## Struktura

```
app/                      statický web (to, co běží v kontejneru)
  index.html, style.css, app.js
  data/tribes.json        ← hlavní data: národy, území, populace, události
  data/flags/             obrázky vlajek + CREDITS.json (autoři a licence)
  data/reservations-*.geojson   dnešní rezervace (USA, Kanada)
  vendor/leaflet/         mapová knihovna Leaflet 1.9.4 (přibalená, bez CDN)
scripts/                  pomocné skripty pro stažení podkladů
Dockerfile, nginx.conf, docker-compose.yml
```

## Úprava a doplnění dat

Vše podstatné je v `app/data/tribes.json`. Jeden národ vypadá takto:

```json
{
  "id": "cherokee",
  "name": "Čerokíové", "en": "Cherokee", "endonym": "Aniyvwiya",
  "region": "southeast", "lang": "irokézská rodina",
  "flag": {"commons": "Flag of the Cherokee Nation.svg", "caption": "…"},
  "text": "Popis…",
  "population": [{"year": 1650, "value": 22000, "note": "odhad"}],
  "events": [{"year": 1838, "text": "Stezka slz"}],
  "territories": [
    {"from": null, "to": 1838, "kind": "home", "label": "Jižní Apalačské pohoří",
     "poly": [[36.9, -83.6], [36.6, -81.7], …]}
  ]
}
```

- `poly` – hrubé body polygonu `[zeměpisná šířka, délka]`; aplikace je sama vyhladí.
  Souřadnice snadno odečtete např. na <https://geojson.io>.
- `from` / `to` – roky; `null` u `from` znamená „před rokem 1500“, `null` u `to` znamená „dodnes“.
- `kind` – `home` (původní území), `moved` (po přesunu), `res` (rezervace), `state` (říše).
- `"approx": false` u populace vypne znak ≈ (pro přesná čísla ze sčítání).

Po úpravě spusťte znovu `docker compose up -d --build` (nebo si v `docker-compose.yml`
odkomentujte `volumes` – pak stačí obnovit stránku).

### Vlajky

Nová vlajka: do `flag` doplňte `commons` (přesný název souboru na Wikimedia Commons)
a `caption` (popisek) a spusťte:

```bash
python3 scripts/fetch_flags.py
```

Skript stáhne originál (SVG, případně rastr do šířky 1920 px) do `app/data/flags/` a zapíše soubor, autora a licenci do
`app/data/flags/CREDITS.json`, podle kterého si aplikace vlajky najde.
Wikimedia anonymní stahování omezuje, skript proto umí čekat a zkoušet znovu. Když stahování originálů
opakovaně odmítá, žádá místo nich standardní náhledy (velikosti 960, 1280, 1920 px…); ty vrací API
`imageinfo` s parametrem `iiurlwidth=1920` v poli `thumburl`.

### Volitelná vrstva Native Land (podrobná tradiční území)

[Native Land Digital](https://native-land.ca) má podrobné polygony stovek tradičních území.
Data vyžadují bezplatný API klíč (registrace na <https://native-land.ca/dashboard>) a mají vlastní
podmínky užití, proto nejsou součástí projektu. S klíčem je stáhnete takto:

```bash
NATIVE_LAND_KEY=váš_klíč python3 scripts/fetch_nativeland.py
```

Vznikne `app/data/nativeland.geojson` a v mapě přibude přepínač „Tradiční území (Native Land)“.

## Zdroje a přesnost

- **Hranice území jsou přibližné** – ručně zjednodušené podle běžně publikovaných historických map.
  Původní národy neměly pevné státní hranice; území se překrývala a měnila.
- **Populace** před 20. stoletím jsou odhady (hlavně J. Mooney, 1928, a údaje uváděné na Wikipedii);
  současná čísla pocházejí z infoboxů anglické Wikipedie (sčítání lidu, evidence kmenů).
- **Vlajky** patří dnešním kmenovým vládám; historické kmeny vlajky nepoužívaly. Kde ověřená
  volně licencovaná vlajka na Wikimedia Commons není, aplikace to uvádí.
- Podkladová mapa: © přispěvatelé OpenStreetMap. Rezervace USA: U.S. Census Bureau (volné dílo).
  Rezervy Kanada: Natural Resources Canada (Open Government Licence – Canada).
  České názvy a vazby: Wikidata. Mapová knihovna: Leaflet (BSD-2).
