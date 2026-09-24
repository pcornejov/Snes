#!/usr/bin/env python3
"""Descarga los escaneos de Near (archive.org) en tamaño web y los guarda como
WebP en site/scans/<dir>/<parte>.webp, para servirlos desde el propio sitio.

El servicio IIIF de archive.org entrega versiones redimensionadas de los PNG
originales (600 dpi, 20-45 MB cada uno). Se ejecuta después de build_data.py;
solo descarga lo que falta, así que se puede relanzar sin costo.

Requiere Pillow:  pip install pillow
"""
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "site", "data", "games.json")
OUT = os.path.join(ROOT, "site", "scans")
UA = "SnesCatalogBuilder/1.0 (https://github.com/pcornejov/snes)"
IIIF = "https://iiif.archive.org/image/iiif/3/near-snes-scans-png%2F"

# Ancho en píxeles por tipo de escaneo.
WIDTH = {"box/front": 520, "box/back": 520, "cartridge": 760, "pcb": 760}
DEFAULT_WIDTH = 360


def out_path(scan_dir, part):
    return os.path.join(OUT, scan_dir, part.replace("/", "-") + ".webp")


def fetch(job):
    scan_dir, folder, part = job
    dest = out_path(scan_dir, part)
    if os.path.exists(dest):
        return "skip"
    ident = urllib.parse.quote(f"{folder}/{part}.png", safe="")
    url = f"{IIIF}{ident}/full/{WIDTH.get(part, DEFAULT_WIDTH)},/0/default.jpg"
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                img = Image.open(io.BytesIO(r.read())).convert("RGB")
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            img.save(dest, "WEBP", quality=74, method=6)
            return "ok"
        except Exception as e:  # noqa: BLE001
            print(f"  ! {folder}/{part}: {e}", file=sys.stderr)
            time.sleep(2 ** (i + 1))
    return "fail"


def main():
    games = json.load(open(DATA, encoding="utf-8"))["games"]
    jobs = [(g["scans"]["dir"], g["scans"]["folder"], p) for g in games if "scans" in g for p in g["scans"]["parts"]]
    print(f"{len(jobs)} escaneos")
    stats = {"ok": 0, "skip": 0, "fail": 0}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for n, res in enumerate(ex.map(fetch, jobs), 1):
            stats[res] += 1
            if n % 100 == 0:
                print(f"  {n}/{len(jobs)} {stats}", flush=True)
    print(stats)
    return 1 if stats["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
