#!/usr/bin/env python3
"""Genera site/data/games.json con el catálogo de juegos de Super Nintendo.

Fuentes (todas públicas):
  * libretro-database: lista No-Intro de ROMs + metadatos (desarrollador,
    editor, género, año, jugadores, ESRB, franquicia, serial, chip especial).
  * libretro-thumbnails: carátulas, capturas, pantallas de título y logos.
  * Near's SNES scans (archive.org): escaneos 600 dpi de caja (frente y
    dorso) y cartucho de los juegos de EE. UU., servidos vía IIIF.
  * Wikidata: enlaces a Wikipedia (es/en), créditos y enlaces externos.

Uso: python3 scripts/build_data.py   (solo biblioteca estándar)
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data", "games.json")
CACHE = os.path.join(ROOT, ".cache")
UA = "SnesCatalogBuilder/1.0 (https://github.com/pcornejov/snes)"

SYSTEM = "Nintendo - Super Nintendo Entertainment System"
DB_RAW = "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat"
THUMBS_INDEX = "https://thumbnails.libretro.com/" + urllib.parse.quote(SYSTEM)
THUMBS_RAW = ("https://raw.githubusercontent.com/libretro-thumbnails/"
              "Nintendo_-_Super_Nintendo_Entertainment_System/master")
NEAR_ID = "near-snes-scans-png"
IIIF = "https://iiif.archive.org/image/iiif/3/"

# Etiquetas No-Intro que indican que no es un lanzamiento comercial original.
EXCLUDE_TAGS = re.compile(
    r"^(Beta|Proto|Sample|Demo|Unl|Pirate|Aftermarket|NES Conversion|Arcade|"
    r"Virtual Console|Switch|Switch Online|Evercade|Steam|Digital|NP|Kiosk|"
    r"Enhancement Chip|Program|BIOS|Test Program|Competition Cart|Alt|"
    r"Classic Mini|SNES Classic|Wii|Wii U|3DS|GameCube|"
    r".*Collection.*|Capcom Town|Piko Interactive|QUByte Classics|SNESDEV.*|"
    r"Retro-Bit.*|Limited Run.*|iam8bit|Super Fighter Team|Columbus Circle|"
    r"Seta|Sufami Turbo)\b", re.I)

OK_TAG = re.compile(r"[A-Z][a-z](,[A-Z][a-z])*|Rev [0-9A-Z]+|v1\.\d|(SNS|SNSP|SHVC)-[0-9A-Z]+")

NOT_GAME = re.compile(r"Aging|Tester|Test Cassette|Controller Test|Parame ROM|"
                      r"Game Genie|Action Replay|Game Saver|Super Famicom Box", re.I)

REGIONS = {
    "USA": "US", "Canada": "US", "Europe": "EU", "Germany": "EU",
    "France": "EU", "Spain": "EU", "Italy": "EU", "Netherlands": "EU",
    "Sweden": "EU", "UK": "EU", "Scandinavia": "EU", "Australia": "EU",
    "Japan": "JP", "Korea": "KR", "Brazil": "BR", "Asia": "JP",
    
}


def fetch(url, name=None, data=None, headers=None, retries=4):
    """Descarga con caché en disco y reintentos."""
    os.makedirs(CACHE, exist_ok=True)
    name = name or re.sub(r"[^A-Za-z0-9._-]", "_", url)[-150:]
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read().decode("utf-8")
    h = {"User-Agent": UA}
    h.update(headers or {})
    for i in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=120) as r:
                body = r.read()
            with open(path, "wb") as f:
                f.write(body)
            return body.decode("utf-8")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {url}: {e} (reintento {i + 1})", file=sys.stderr)
            time.sleep(2 ** (i + 1))
    raise SystemExit(f"No se pudo descargar {url}")


# ---------------------------------------------------------------- clrmamepro
def parse_dat(text):
    """Parser mínimo de .dat clrmamepro: devuelve lista de dicts por 'game'."""
    games = []
    for block in re.finditer(r"^game \($(.*?)^\)", text, re.M | re.S):
        body = block.group(1)
        g = {}
        for m in re.finditer(r'^\s*(\w+)\s+(?:"([^"]*)"|(\S+))\s*$', body, re.M):
            g.setdefault(m.group(1), m.group(2) if m.group(2) is not None else m.group(3))
        crc = re.search(r"crc\s+([0-9A-Fa-f]{8})", body)
        if crc:
            g["crc"] = crc.group(1).upper()
        size = re.search(r"size\s+(\d+)", body)
        if size:
            g["size"] = int(size.group(1))
        games.append(g)
    return games


def load_db():
    enc = urllib.parse.quote(SYSTEM + ".dat")
    roms = parse_dat(fetch(f"{DB_RAW}/no-intro/{enc}", "no-intro.dat"))
    meta = defaultdict(dict)
    fields = {
        "developer": "developer", "publisher": "publisher", "genre": "genre",
        "releaseyear": "releaseyear", "releasemonth": "releasemonth",
        "maxusers": "users", "esrb": "esrb_rating", "franchise": "franchise",
        "serial": "serial", "enhancement_hw": "enhancement_hw",
    }
    for folder, key in fields.items():
        for g in parse_dat(fetch(f"{DB_RAW}/{folder}/{enc}", f"{folder}.dat")):
            if key in g:
                ident = g.get("crc") or g.get("comment") or g.get("name")
                meta[ident][key] = g[key]
                name = g.get("comment") or g.get("name")
                if name:
                    meta[name][key] = g[key]
    return roms, meta


# ---------------------------------------------------------------- utilidades
def tags_of(name):
    return re.findall(r"\(([^)]*)\)", name)


def base_title(name):
    return re.sub(r"\s*[\(\[].*$", "", name).strip()


def display_title(t):
    """'Legend of Zelda, The - A Link...' -> 'The Legend of Zelda - A Link...'"""
    parts = t.split(" - ", 1)
    m = re.match(r"^(.*), (The|A|An|Les|Le|La|Die|Der|Das|El|Los)$", parts[0])
    if m:
        parts[0] = f"{m.group(2)} {m.group(1)}"
    return " - ".join(parts)


def norm(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    t = t.replace("&", " and ").replace("_", " ")
    t = re.sub(r"\b(the|a|an|and)\b", " ", t)
    t = re.sub(r"\bii\b", "2", t)
    t = re.sub(r"\biii\b", "3", t)
    t = re.sub(r"\biv\b", "4", t)
    return re.sub(r"[^a-z0-9]", "", t)


def slugify(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def game_code(serial):
    """SNS-ACTE-USA -> ACT, SHVC-TI -> TI, SNSP-MW-NOE-1 -> MW."""
    if not serial:
        return None
    parts = serial.upper().split("-")
    if len(parts) < 2 or parts[0] not in ("SNS", "SHVC", "SNSP", "SNSN", "SFT"):
        return None
    code = parts[1]
    if len(code) == 4:
        code = code[:3]
    return code if re.fullmatch(r"[0-9A-Z]{2,3}", code) else None


def thumb_name(name):
    return re.sub(r'[&*/:`<>?\\|"]', "_", name)


def list_thumbs(kind):
    html = fetch(f"{THUMBS_INDEX}/{kind}/", f"thumbs-{kind}.html")
    return {urllib.parse.unquote(h)[:-4]
            for h in re.findall(r'href="([^"?/]+\.png)"', html)}


# ---------------------------------------------------------------- fuentes
def load_near():
    meta = json.loads(fetch(f"https://archive.org/metadata/{NEAR_ID}", "near.json"))
    items = defaultdict(dict)
    for f in meta.get("files", []):
        if "/" not in f["name"] or not f["name"].endswith(".png"):
            continue
        folder, rest = f["name"].split("/", 1)
        items[folder][rest[:-4]] = f["name"]
    return items


def load_wikidata():
    q = """
SELECT ?item ?en ?es ?ja ?alias ?enwiki ?eswiki ?moby ?igdb ?gamefaqs ?mobyG
       (GROUP_CONCAT(DISTINCT ?composerL; separator="|") AS ?composers)
       (GROUP_CONCAT(DISTINCT ?directorL; separator="|") AS ?directors)
       (GROUP_CONCAT(DISTINCT ?designerL; separator="|") AS ?designers)
       (GROUP_CONCAT(DISTINCT ?seriesL; separator="|") AS ?series)
WHERE {
  ?item wdt:P31/wdt:P279* wd:Q7889; wdt:P400 wd:Q183259.
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en)="en") }
  OPTIONAL { ?item rdfs:label ?es FILTER(lang(?es)="es") }
  OPTIONAL { ?item rdfs:label ?ja FILTER(lang(?ja)="ja") }
  OPTIONAL { ?item skos:altLabel ?alias FILTER(lang(?alias)="en") }
  OPTIONAL { ?enwiki schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?eswiki schema:about ?item; schema:isPartOf <https://es.wikipedia.org/> }
  OPTIONAL { ?item wdt:P1933 ?moby }
  OPTIONAL { ?item wdt:P5794 ?igdb }
  OPTIONAL { ?item wdt:P4769 ?gamefaqs }
  OPTIONAL { ?item wdt:P86 ?c. ?c rdfs:label ?composerL FILTER(lang(?composerL)="en") }
  OPTIONAL { ?item wdt:P57 ?d. ?d rdfs:label ?directorL FILTER(lang(?directorL)="en") }
  OPTIONAL { ?item wdt:P287 ?g. ?g rdfs:label ?designerL FILTER(lang(?designerL)="en") }
  OPTIONAL { ?item wdt:P179 ?s. ?s rdfs:label ?seriesL FILTER(lang(?seriesL)="en") }
}
GROUP BY ?item ?en ?es ?ja ?alias ?enwiki ?eswiki ?moby ?igdb ?gamefaqs ?mobyG
"""
    body = urllib.parse.urlencode({"query": q}).encode()
    data = json.loads(fetch("https://query.wikidata.org/sparql", "wikidata.json", data=body,
                            headers={"Accept": "application/sparql-results+json"}))
    items = {}
    for b in data["results"]["bindings"]:
        v = {k: x["value"] for k, x in b.items()}
        qid = v["item"].rsplit("/", 1)[-1]
        it = items.setdefault(qid, {"qid": qid, "names": set()})
        for k in ("en", "es", "ja", "enwiki", "eswiki", "moby", "igdb", "gamefaqs"):
            if v.get(k) and not it.get(k):
                it[k] = v[k]
        for k in ("composers", "directors", "designers", "series"):
            if v.get(k):
                it[k] = sorted(set(it.get(k, [])) | set(v[k].split("|")))
        for k in ("en", "alias", "es"):
            if v.get(k):
                it["names"].add(norm(re.sub(r"\s*\((video ?game|SNES)\)", "", v[k], flags=re.I)))
    for it in items.values():
        for k in ("enwiki", "eswiki"):
            if it.get(k):
                it[k] = urllib.parse.unquote(it[k].rsplit("/wiki/", 1)[-1])
    return list(items.values())


# Carpetas de Near cuyo nombre difiere del título No-Intro.
NEAR_ALIASES = {
    "Super Star Wars 2 - The Empire Strikes Back": "Super Star Wars - The Empire Strikes Back",
    "Super Star Wars 3 - Return of the Jedi": "Super Star Wars - Return of the Jedi",
    "Adventures of Mighty Max, The": "Mighty Max",
    "Bassin_s Black Bass with Hank Parker": "Bassin's Black Bass",
    "Brunswick_s World Tournament of Champions": "Brunswick World - Tournament of Champions",
    "Bubsy - Claws Encounters of the Furred Kind": "Bubsy in - Claws Encounters of the Furred Kind",
    "Eye of the Beholder": "Advanced Dungeons & Dragons - Eye of the Beholder",
    "Fun _ Games": "Fun 'n Games",
    "Harley_s Humungous Adventure": "Harley's Humongous Adventure",
    "Hole in One Golf": "HAL's Hole in One Golf",
    "Jeopardy! Featuring Alex Trebek": "Jeopardy!",
    "Jimmy Houston_s Bass Tournament USA": "Jimmy Houston's Bass Tournament U.S.A.",
    "Lord of the Rings - Volume 1, The": "J.R.R. Tolkien's The Lord of the Rings - Volume 1",
    "Lost Vikings 1, The": "Lost Vikings, The",
    "Mountain Bike Rally": "Exertainment Mountain Bike Rally",
    "NBA Give _ Go": "NBA Give 'n Go",
    "Newmann Haas Indy Car - Featuring Nigel Mansell": "Newman Haas IndyCar featuring Nigel Mansell",
    "Rock _ Roll Racing": "Rock N' Roll Racing",
    "Simpsons - Virtual Bart, The": "Virtual Bart",
    "Spawn": "Todd McFarlane's Spawn - The Video Game",
    "Speed Racer in My Most Dangerous Adventures": "Speed Racer",
    "Super Goal! Two": "Super Goal! 2",
    "True Golf - Wicked 18": "True Golf Classics - Wicked 18",
    "Super Ghouls _ Ghosts": "Super Ghouls'n Ghosts",
    "Terminator 2 - The Arcade Game": "T2 - The Arcade Game",
    "Uncharted Waters - New Horizons": "New Horizons",
    "Wanderers From Ys III": "Ys III - Wanderers from Ys",
    "Wild CATs - Covert Action Teams": "Jim Lee's WildC.A.T.S - Covert-Action-Teams",
    "Star Trek - Deep Space Nice - Crossroads of Time": "Star Trek - Deep Space Nine - Crossroads of Time",
    "Star Trek - The Next Generation": "Star Trek - The Next Generation - Future's Past",
    "Ranma Half - Hard Battle": "Ranma 1-2 - Hard Battle",
    "Jurassic Park 2 - The Chaos Continues": "Jurassic Park Part 2 - The Chaos Continues",
    "Nobunga_s Ambition": "Nobunaga's Ambition",
    "Nobunga_s Ambition - Lord of Darkness": "Nobunaga's Ambition - Lord of Darkness",
    "Super Battletank 1 - War in the Gulf": "Garry Kitchen's Super Battletank - War in the Gulf",
    "Mutant Chronicles - Doomtroopers": "Doom Troopers",
    "ASP - Air Strike Patrol": "A.S.P. - Air Strike Patrol",
    "Street Hockey _95": "Street Sports - Street Hockey '95",
    "Jammit!": "Street Sports - Jammit",
    "Hey Punk! Are You Tuff E Nuff": "Tuff E Nuff",
    "Spider-Man _ Venom - Separation Anxiety": "Venom & Spider-Man - Separation Anxiety",
}


def match_near(near, groups):
    """Asocia cada carpeta de escaneos de Near con una versión USA No-Intro.

    Primero por título completo normalizado; luego, para lo que queda, por el
    título principal (antes de " - ") si la coincidencia es única.
    """
    us = [r for rels in groups.values() for r in rels if "USA" in r["regionTag"]]

    def keys(title):
        title = NEAR_ALIASES.get(title, title)
        t = re.sub(r"\b1\b(?= -|$)", "", title)       # "Lost Vikings 1" -> "Lost Vikings"
        main = t.split(" - ")[0]
        main = re.sub(r",\s*(The|A|An)$", "", main)
        return norm(t), norm(main)

    result, taken = {}, set()
    for level in (0, 1):
        idx = defaultdict(list)
        for r in us:
            if r["key"] not in result:
                idx[keys(r["title"])[level]].append(r)
        for folder in sorted(near):
            if folder in taken:
                continue
            cands = idx.get(keys(folder)[level], [])
            if len(cands) == 1:
                result[cands[0]["key"]] = folder
                taken.add(folder)
                idx[keys(folder)[level]] = []
    return result


# ---------------------------------------------------------------- armado
def build():
    print("Descargando libretro-database…")
    roms, meta = load_db()
    print("Listando miniaturas…")
    thumbs = {k: list_thumbs(k) for k in ("Named_Boxarts", "Named_Snaps", "Named_Titles", "Named_Logos")}
    print("Metadatos de escaneos de Near…")
    near = load_near()
    print("Consultando Wikidata…")
    wikidata = load_wikidata()

    # 1) Filtrar lanzamientos comerciales y quedarnos con la última revisión.
    releases = {}
    for r in roms:
        name = r.get("name", "")
        tags = tags_of(name)
        if "[" in name or any(EXCLUDE_TAGS.match(t) for t in tags):
            continue
        region_tag = tags[0] if tags else ""
        regs = [REGIONS[x.strip()] for x in region_tag.split(",") if x.strip() in REGIONS]
        # Solo etiquetas de región, idioma o revisión: el resto suele ser
        # homebrew, reediciones modernas o variantes no comerciales.
        extra = [t for t in tags[1:] if not OK_TAG.fullmatch(t)]
        if not regs or extra:
            continue
        key = re.sub(r"\s*\((Rev [^)]*|v\d[^)]*)\)", "", name)
        rev = next((t for t in tags if re.match(r"(Rev|v\d)", t)), None)
        if key in releases and (releases[key]["rev"] or "") >= (rev or ""):
            continue
        m = meta.get(r.get("crc")) or meta.get(name) or {}
        m2 = meta.get(key) or {}
        md = {**m2, **m}
        year = md.get("releaseyear", "")
        if year.isdigit() and int(year) > 2000:
            continue
        # Sin año, editor ni serial: homebrew, cartuchos de prueba o accesorios.
        if not (year or md.get("publisher") or md.get("serial")) and not name.startswith("Super Game Boy"):
            continue
        if NOT_GAME.search(name):
            continue
        releases[key] = {
            "name": name, "key": key, "rev": rev, "title": base_title(name),
            "regions": regs, "regionTag": region_tag,
            "langs": next((t for t in tags[1:] if re.fullmatch(r"[A-Z][a-z](,[A-Z][a-z])*", t)), None),
            "size": r.get("size"), "crc": r.get("crc"),
            "meta": md,
        }

    # 2) Agrupar regiones del mismo juego (union-find por código de juego y título).
    parent = {k: k for k in releases}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    by_title = {}
    for k, rel in releases.items():
        t = norm(rel["title"])
        if t in by_title:
            union(k, by_title[t])
        by_title.setdefault(t, k)

    def group_regions(root):
        return {x for k2 in releases if find(k2) == root for x in releases[k2]["regions"]}

    # Los seriales de libretro tienen errores; solo unimos por código de juego
    # (SNS-XX / SNSP-XX / SHVC-XX) si ambos grupos no comparten región.
    by_code = defaultdict(list)
    for k in sorted(releases):
        code = game_code(releases[k]["meta"].get("serial"))
        if code:
            by_code[code].append(k)
    for keys in by_code.values():
        for k in keys[1:]:
            a, b = find(keys[0]), find(k)
            if a != b and not (group_regions(a) & group_regions(b)):
                union(a, b)

    groups = defaultdict(list)
    for k in releases:
        groups[find(k)].append(releases[k])

    near_index = match_near(near, groups)
    wd_index = {}
    for it in wikidata:
        for n in it["names"]:
            wd_index.setdefault(n, it)

    region_order = {"US": 0, "EU": 1, "JP": 2, "KR": 3, "BR": 4}
    games, used_slugs = [], set()
    for rels in groups.values():
        rels.sort(key=lambda r: (min(region_order[x] for x in r["regions"]),
                                 r["regionTag"] not in ("USA", "Europe", "Japan"), r["name"]))
        main = rels[0]
        title = display_title(main["title"])

        def pick(field):
            for r in rels:
                if r["meta"].get(field):
                    return r["meta"][field]
            return None

        years = [int(r["meta"]["releaseyear"]) for r in rels if r["meta"].get("releaseyear", "").isdigit()]
        # Recursos por región
        variants = []
        for r in rels:
            tn = thumb_name(r["name"])
            tn_norev = thumb_name(r["key"])
            # Letras de las imágenes disponibles en libretro-thumbnails
            # (b=caja, s=captura, t=pantalla de título, l=logo); "thumb"
            # guarda el nombre de archivo si difiere del nombre No-Intro.
            img, thumb = "", None
            for kind, short in (("Named_Boxarts", "b"), ("Named_Snaps", "s"),
                                ("Named_Titles", "t"), ("Named_Logos", "l")):
                for cand in (tn, tn_norev):
                    if cand in thumbs[kind]:
                        img += short
                        if cand != r["name"]:
                            thumb = cand
                        break
            variants.append({
                "name": r["name"], "title": display_title(r["title"]),
                "region": r["regionTag"], "regions": r["regions"],
                "serial": r["meta"].get("serial"), "rev": r["rev"], "langs": r["langs"],
                "year": r["meta"].get("releaseyear"), "month": r["meta"].get("releasemonth"),
                "publisher": r["meta"].get("publisher"), "size": r["size"], "crc": r["crc"],
                "img": img, "thumb": thumb,
            })

        # Escaneos de Near (solo EE. UU.)
        scans = None
        for r in rels:
            if "US" in r["regions"]:
                f = near_index.get(r["key"])
                if f:
                    s = near[f]
                    parts = [p for p in ("box/front", "box/back", "cartridge", "pcb", "box/top",
                                         "box/bottom", "box/left", "box/right",
                                         "box/front-alternate", "box/back-alternate") if p in s]
                    scans = {"folder": f, "dir": slugify(f), "parts": parts}
                    break

        wd = None
        for r in rels:
            t = display_title(r["title"])
            wd = wd_index.get(norm(t)) or wd_index.get(norm(t.replace(" - ", ": ")))
            if wd:
                break

        slug = slugify(title) or "juego"
        while slug in used_slugs:
            slug += "-" + slugify(main["regionTag"] or "x")
        used_slugs.add(slug)

        regions = sorted({x for r in rels for x in r["regions"]}, key=region_order.get)
        game = {
            "id": slug,
            "title": title,
            "regions": regions,
            "year": min(years) if years else None,
            "developer": pick("developer"),
            "publisher": pick("publisher"),
            "genre": pick("genre"),
            "players": pick("users"),
            "esrb": pick("esrb_rating"),
            "franchise": pick("franchise"),
            "chip": pick("enhancement_hw"),
            "variants": variants,
        }
        if scans:
            game["scans"] = scans
        if wd:
            game["wiki"] = {k: wd[k] for k in ("qid", "enwiki", "eswiki", "ja", "moby", "igdb", "gamefaqs",
                                               "composers", "directors", "designers", "series") if wd.get(k)}
        game = {k: v for k, v in game.items() if v not in (None, "", [])}
        game["variants"] = [{k: v for k, v in x.items() if v not in (None, "", [])} for x in variants]
        games.append(game)

    games.sort(key=lambda g: norm(g["title"]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    payload = {
        "generated": time.strftime("%Y-%m-%d"),
        "sources": {
            "libretro-database": "https://github.com/libretro/libretro-database",
            "libretro-thumbnails": "https://github.com/libretro-thumbnails/Nintendo_-_Super_Nintendo_Entertainment_System",
            "near-scans": f"https://archive.org/details/{NEAR_ID}",
            "thumbs": THUMBS_RAW,
            "iiif": f"{IIIF}{NEAR_ID}%2F",
            "wikidata": "https://www.wikidata.org",
        },
        "games": games,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    n = len(games)
    print(f"{n} juegos → {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) // 1024} KB)")
    print(f"  con caja: {sum(any('b' in v.get('img', '') for v in g['variants']) for g in games)}")
    print(f"  con escaneo de cartucho: {sum('cartridge' in g.get('scans', {}).get('parts', []) for g in games)}")
    print(f"  con Wikipedia: {sum('wiki' in g for g in games)}")
    for r in ("US", "EU", "JP"):
        print(f"  región {r}: {sum(r in g['regions'] for g in games)}")


if __name__ == "__main__":
    build()
