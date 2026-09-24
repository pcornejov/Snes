# Catálogo Super Nintendo

Sitio estático con el catálogo de juegos comerciales de Super Nintendo / Super Famicom:
caja, cartucho, capturas y ficha detallada de cada juego y sus lanzamientos por región.

- **~1.800 juegos** (América, Europa y Japón), con las regiones agrupadas en una sola ficha.
- **Caja** de cada región y, para ~680 juegos de EE. UU., escaneos reales del frente, dorso y laterales.
- **Cartucho**: escaneo real (cartucho + placa) para ~630 juegos; para el resto, un cartucho
  ilustrado según la región (Super NES, Super Famicom o Super Nintendo PAL) con su etiqueta.
- **Ficha**: desarrollador, editor, año, género, jugadores, ESRB, franquicia, chip de mejora
  (Super FX, SA-1, DSP…), dirección, diseño, música, título japonés y la reseña de Wikipedia
  (en español cuando existe).
- **Lanzamientos por región**: título local, fecha, editor, código de producto (SNS-/SNSP-/SHVC-),
  idiomas, tamaño de ROM y CRC32.
- Modo claro, oscuro o automático. Búsqueda, filtros (región, género, año, editor, chip, jugadores, con escaneo de cartucho),
  orden, juego al azar y URLs compartibles.

## Estructura

```
site/                  ← todo lo que se publica (HTML/CSS/JS sin dependencias ni build)
  index.html, app.js, styles.css
  data/games.json      ← catálogo generado
  scans/               ← escaneos de Near en WebP (generados)
scripts/
  build_data.py        ← genera data/games.json
  fetch_scans.py       ← descarga los escaneos (requiere Pillow)
.github/workflows/
  deploy.yml           ← publica site/ en GitHub Pages al hacer push a main
  update-data.yml      ← regenera los datos a mano o una vez al mes
```

## Fuentes de datos

| Fuente | Aporta |
|---|---|
| [libretro-database](https://github.com/libretro/libretro-database) | Lista No-Intro de ROMs y metadatos (desarrollador, editor, género, fecha, jugadores, ESRB, franquicia, serial, chip) |
| [libretro-thumbnails](https://github.com/libretro-thumbnails/Nintendo_-_Super_Nintendo_Entertainment_System) | Cajas por región, capturas, pantallas de título y logos (se enlazan directo) |
| [Near's SNES scans](https://archive.org/details/near-snes-scans-png) (archive.org) | Escaneos a 600 dpi de cajas y cartuchos de EE. UU. (copia web en `site/scans`, original vía IIIF en el visor) |
| [Wikidata](https://www.wikidata.org) + Wikipedia | Enlaces a Wikipedia, créditos, MobyGames/GameFAQs/IGDB y la reseña (se carga en vivo) |

Criterio del catálogo: solo lanzamientos comerciales. Se descartan betas, prototipos, demos,
juegos sin licencia, homebrew, reediciones modernas (Virtual Console, Switch, colecciones),
cartuchos de prueba y accesorios. Las regiones se agrupan por título y por código de producto.

## Desarrollo local

```bash
python3 -m http.server -d site 8080     # abrir http://localhost:8080
```

Regenerar los datos (solo biblioteca estándar; deja caché en `.cache/`):

```bash
python3 scripts/build_data.py
pip install pillow && python3 scripts/fetch_scans.py   # solo descarga lo que falta
```

## Despliegue

**GitHub Pages**: en *Settings → Pages → Build and deployment* elegir **GitHub Actions**.
Cada push a `main` publica la carpeta `site/`.

**Cloudflare Pages** (alternativa): *Workers & Pages → Create → Pages → Connect to Git*,
sin comando de build y con **Build output directory** = `site`. El archivo `site/_headers`
configura la caché de los escaneos.

---

Proyecto de fans sin fines de lucro. Super Nintendo, Super Famicom y los juegos son marcas de
sus respectivos dueños; las imágenes pertenecen a sus autores y a los proyectos citados.
