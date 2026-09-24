// Catálogo Super Nintendo — SPA estática sin dependencias.
const $ = (s, el = document) => el.querySelector(s);
const PAGE = 120;

const REGION_LABEL = { US: "América", EU: "Europa", JP: "Japón", KR: "Corea", BR: "Brasil" };
const REGION_FLAG = { US: "🇺🇸", EU: "🇪🇺", JP: "🇯🇵", KR: "🇰🇷", BR: "🇧🇷" };
const REGION_TAG_ES = {
  USA: "EE. UU.", Europe: "Europa", Japan: "Japón", Germany: "Alemania", France: "Francia",
  Spain: "España", Italy: "Italia", Canada: "Canadá", Australia: "Australia", Korea: "Corea",
  Brazil: "Brasil", Netherlands: "Países Bajos", Sweden: "Suecia", Scandinavia: "Escandinavia",
  UK: "Reino Unido", Asia: "Asia",
};
const regionEs = (tag) => tag.split(",").map((r) => REGION_TAG_ES[r.trim()] || r.trim()).join(", ");
const MONTHS = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];
const SCAN_LABEL = {
  "box/front": "Caja · frente", "box/back": "Caja · dorso", cartridge: "Cartucho",
  pcb: "Placa (PCB)", "box/top": "Caja · arriba", "box/bottom": "Caja · abajo",
  "box/left": "Caja · lateral izq.", "box/right": "Caja · lateral der.",
  "box/front-alternate": "Caja · frente (alt.)", "box/back-alternate": "Caja · dorso (alt.)",
};

const GENRE_ES = {
  Action: "Acción", Sports: "Deportes", "Role-playing (RPG)": "Rol (RPG)", Board: "Juego de mesa",
  Strategy: "Estrategia", Platform: "Plataformas", Racing: "Carreras", Puzzle: "Puzle",
  Gambling: "Apuestas / Casino", Fighting: "Lucha", Adventure: "Aventura", "Beat'em Up": "Beat 'em up",
  Simulation: "Simulación", Shooter: "Disparos", "Sports with Animals": "Carreras de caballos / animales",
  "Shoot'em Up": "Shoot 'em up", "Hunting and Fishing": "Caza y pesca", Educational: "Educativo",
  Quiz: "Preguntas", Compilation: "Recopilación", Various: "Varios", Pinball: "Pinball",
  "Casual Game": "Casual", Card: "Cartas", Adult: "Adultos", "Lightgun Shooter": "Pistola de luz",
  "Music / Dancing": "Música / Baile",
};
const genreEs = (g) => GENRE_ES[g] || g;
const ESRB_ES = { E: "E (Todos)", KA: "K-A (Niños a adultos)", T: "T (Adolescentes)",
  "E10+": "E10+ (Mayores de 10)", M: "M (Mayores de 17)", EC: "EC (Primera infancia)" };

let DATA, SRC;
const state = { q: "", regions: new Set(), genre: "", year: "", publisher: "", chip: "", players: "",
  cart: false, sort: "title", shown: PAGE };

// ------------------------------------------------------------------ URLs
const thumbFile = (v) => v.thumb || v.name.replace(/[&*/:`<>?\\|"]/g, "_");
const thumbUrl = (v, kind) => {
  const dir = { b: "Named_Boxarts", s: "Named_Snaps", t: "Named_Titles", l: "Named_Logos" }[kind];
  return `${SRC.thumbs}/${dir}/${encodeURIComponent(thumbFile(v))}.png`;
};
const has = (v, kind) => (v.img || "").includes(kind);
// Escaneos de Near: copia web local (scripts/fetch_scans.py) y original en
// alta resolución vía IIIF de archive.org para el visor.
const scanUrl = (g, part) => `scans/${g.scans.dir}/${part.replace("/", "-")}.webp`;
const scanFull = (g, part) =>
  `${SRC.iiif}${encodeURIComponent(`${g.scans.folder}/${part}.png`)}/full/1800,/0/default.jpg`;
const hasScan = (g, part) => g.scans?.parts.includes(part);

function coverOf(g) {
  const v = g.variants.find((x) => has(x, "b"));
  if (v) return thumbUrl(v, "b");
  if (hasScan(g, "box/front")) return scanUrl(g, "box/front");
  const s = g.variants.find((x) => has(x, "t") || has(x, "s"));
  return s ? thumbUrl(s, has(s, "t") ? "t" : "s") : null;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ------------------------------------------------------------------ carga
async function init() {
  try {
    const res = await fetch("data/games.json");
    DATA = await res.json();
  } catch (e) {
    $("#count").textContent = "No se pudo cargar el catálogo.";
    throw e;
  }
  SRC = DATA.sources;
  for (const g of DATA.games) {
    g._search = fold([g.title, g.developer, g.publisher, g.franchise, g.genre, genreEs(g.genre),
      ...g.variants.map((v) => v.title), g.wiki?.ja].join(" | "));
  }
  $("#generated").textContent = `· Actualizado ${DATA.generated} · ${DATA.games.length} juegos`;
  buildFilters();
  readStateFromUrl();
  window.addEventListener("hashchange", route);
  route();
}

function buildFilters() {
  const games = DATA.games;
  const chips = $("#region-chips");
  chips.innerHTML = ["US", "EU", "JP"].map((r) =>
    `<button type="button" class="chip" data-r="${r}" aria-pressed="false">${REGION_FLAG[r]} ${REGION_LABEL[r]}</button>`).join("");
  chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    const r = b.dataset.r;
    state.regions.has(r) ? state.regions.delete(r) : state.regions.add(r);
    update();
  });

  const fill = (sel, values, label = (x) => x) => {
    const el = $(sel);
    for (const v of values) el.insertAdjacentHTML("beforeend", `<option value="${esc(v)}">${esc(label(v))}</option>`);
  };
  const count = (key) => {
    const m = new Map();
    for (const g of games) if (g[key]) m.set(g[key], (m.get(g[key]) || 0) + 1);
    return m;
  };
  const genres = count("genre");
  fill("#f-genre", [...genres.keys()].sort((a, b) => genreEs(a).localeCompare(genreEs(b), "es")),
    (x) => `${genreEs(x)} (${genres.get(x)})`);
  const years = count("year");
  fill("#f-year", [...years.keys()].sort(), (x) => `${x} (${years.get(x)})`);
  const pubs = count("publisher");
  fill("#f-publisher", [...pubs.keys()].sort((a, b) => a.localeCompare(b)), (x) => `${x} (${pubs.get(x)})`);
  const chipsHw = count("chip");
  fill("#f-chip", [...chipsHw.keys()].sort(), (x) => `${x} (${chipsHw.get(x)})`);
  const players = count("players");
  fill("#f-players", [...players.keys()].sort((a, b) => a - b), (x) => `${x} jugador${x === "1" ? "" : "es"}`);

  const bind = (sel, key, ev = "change", prop = "value") =>
    $(sel).addEventListener(ev, (e) => { state[key] = e.target[prop]; update(); });
  let t;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.q = e.target.value;
      if (!location.hash.startsWith("#/juego/")) update(); else { location.hash = "#/"; }
    }, 150);
  });
  bind("#f-genre", "genre"); bind("#f-year", "year"); bind("#f-publisher", "publisher");
  bind("#f-chip", "chip"); bind("#f-players", "players"); bind("#sort", "sort");
  bind("#f-cart", "cart", "change", "checked");
  $("#more").addEventListener("click", () => { state.shown += PAGE; renderGrid(false); });
  $("#random").addEventListener("click", () => {
    const list = filtered();
    const g = list[Math.floor(Math.random() * list.length)];
    if (g) location.hash = `#/juego/${g.id}`;
  });
}

// Guardamos filtros en la URL (#/?q=…&r=US,JP…) para poder compartir búsquedas.
function writeStateToUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.regions.size) p.set("r", [...state.regions].join(","));
  for (const k of ["genre", "year", "publisher", "chip", "players"]) if (state[k]) p.set(k, state[k]);
  if (state.cart) p.set("cart", "1");
  if (state.sort !== "title") p.set("sort", state.sort);
  const h = "#/" + (p.toString() ? `?${p}` : "");
  if (location.hash !== h) history.replaceState(null, "", h);
}

function readStateFromUrl() {
  const h = location.hash;
  if (h.startsWith("#/juego/")) return;
  const p = new URLSearchParams(h.split("?")[1] || "");
  state.q = p.get("q") || "";
  state.regions = new Set((p.get("r") || "").split(",").filter(Boolean));
  for (const k of ["genre", "year", "publisher", "chip", "players"]) state[k] = p.get(k) || "";
  state.cart = p.get("cart") === "1";
  state.sort = p.get("sort") || "title";
  $("#q").value = state.q;
  for (const k of ["genre", "year", "publisher", "chip", "players"]) $(`#f-${k}`).value = state[k];
  $("#f-cart").checked = state.cart;
  $("#sort").value = state.sort;
}

function update() {
  state.shown = PAGE;
  writeStateToUrl();
  renderGrid(true);
}

function filtered() {
  const q = fold(state.q).trim();
  const terms = q ? q.split(/\s+/) : [];
  let list = DATA.games.filter((g) =>
    (!terms.length || terms.every((t) => g._search.includes(t))) &&
    (!state.regions.size || [...state.regions].every((r) => g.regions.includes(r))) &&
    (!state.genre || g.genre === state.genre) &&
    (!state.year || String(g.year) === state.year) &&
    (!state.publisher || g.publisher === state.publisher) &&
    (!state.chip || g.chip === state.chip) &&
    (!state.players || g.players === state.players) &&
    (!state.cart || hasScan(g, "cartridge")));
  const dir = state.sort.startsWith("-") ? -1 : 1;
  const key = state.sort.replace("-", "");
  list = list.slice().sort((a, b) => {
    if (key === "year") return dir * ((a.year || 9999) - (b.year || 9999)) || a.title.localeCompare(b.title);
    return dir * a.title.localeCompare(b.title, "es", { sensitivity: "base" });
  });
  return list;
}

// ------------------------------------------------------------------ vistas
function route() {
  const h = location.hash;
  const m = h.match(/^#\/juego\/([^?]+)/);
  if (m) {
    const g = DATA.games.find((x) => x.id === decodeURIComponent(m[1]));
    if (g) return showDetail(g);
  }
  $("#view-detail").hidden = true;
  $("#view-list").hidden = false;
  document.title = "Catálogo Super Nintendo";
  readStateFromUrl();
  renderGrid(true);
  if (state._scroll != null) { window.scrollTo(0, state._scroll); state._scroll = null; }
}

function renderGrid(reset) {
  for (const b of document.querySelectorAll("#region-chips .chip")) {
    b.setAttribute("aria-pressed", state.regions.has(b.dataset.r));
  }
  const list = filtered();
  $("#count").textContent = `${list.length} juego${list.length === 1 ? "" : "s"}`;
  const grid = $("#grid");
  const from = reset ? 0 : grid.children.length;
  if (reset) grid.innerHTML = "";
  const slice = list.slice(from, state.shown);
  grid.insertAdjacentHTML("beforeend", slice.map(card).join(""));
  $("#more").hidden = state.shown >= list.length;
}

function card(g) {
  const src = coverOf(g);
  const cart = hasScan(g, "cartridge") ? `<span class="badge" title="Con escaneo de cartucho">▣</span>` : "";
  return `<a class="card" href="#/juego/${g.id}">
    <div class="cover">${src
      ? `<img loading="lazy" decoding="async" src="${esc(src)}" alt="">`
      : `<span class="nocover">${esc(g.title)}</span>`}${cart}</div>
    <div class="meta">
      <h3>${esc(g.title)}</h3>
      <p>${g.year || "—"} · ${esc(g.publisher || g.developer || "")}</p>
      <p class="flags">${g.regions.map((r) => `<span title="${REGION_LABEL[r]}">${REGION_FLAG[r]}</span>`).join("")}</p>
    </div>
  </a>`;
}

// ------------------------------------------------------------------ ficha
function showDetail(g) {
  if (!$("#view-list").hidden) state._scroll = window.scrollY;
  $("#view-list").hidden = true;
  const el = $("#view-detail");
  el.hidden = false;
  document.title = `${g.title} · Catálogo Super Nintendo`;

  const gallery = buildGallery(g);
  const w = g.wiki || {};
  const rows = [
    ["Desarrollador", g.developer],
    ["Editor", g.publisher],
    ["Año", g.year],
    ["Género", g.genre && genreEs(g.genre)],
    ["Jugadores", g.players],
    ["Clasificación ESRB", g.esrb && (ESRB_ES[g.esrb] || g.esrb)],
    ["Franquicia", g.franchise],
    ["Serie", w.series?.join(", ")],
    ["Chip de mejora", g.chip],
    ["Dirección", w.directors?.join(", ")],
    ["Diseño", w.designers?.join(", ")],
    ["Música", w.composers?.join(", ")],
    ["Título japonés", w.ja],
  ].filter(([, v]) => v);

  const links = [
    w.eswiki && [`https://es.wikipedia.org/wiki/${encodeURIComponent(w.eswiki)}`, "Wikipedia (es)"],
    w.enwiki && [`https://en.wikipedia.org/wiki/${encodeURIComponent(w.enwiki)}`, "Wikipedia (en)"],
    w.qid && [`https://www.wikidata.org/wiki/${w.qid}`, "Wikidata"],
    w.moby && [`https://www.mobygames.com/game/${w.moby}`, "MobyGames"],
    w.gamefaqs && [`https://gamefaqs.gamespot.com/snes/${w.gamefaqs.replace(/^snes\//, "")}`, "GameFAQs"],
    w.igdb && [`https://www.igdb.com/games/${w.igdb}`, "IGDB"],
    g.scans && [`https://archive.org/details/near-snes-scans-png`, "Escaneos 600 dpi (archive.org)"],
    [`https://www.youtube.com/results?search_query=${encodeURIComponent(`${g.title} SNES gameplay`)}`, "Gameplay en YouTube"],
  ].filter(Boolean);

  el.innerHTML = `
  <nav class="crumbs"><a href="#/" id="back">← Volver al catálogo</a></nav>
  <article class="detail">
    <header class="d-head">
      <h1>${esc(g.title)}</h1>
      <p class="sub">${g.regions.map((r) => `${REGION_FLAG[r]} ${REGION_LABEL[r]}`).join(" · ")}${g.year ? ` · ${g.year}` : ""}${g.genre ? ` · ${esc(genreEs(g.genre))}` : ""}</p>
    </header>

    <section class="showcase">
      <div class="stage">
        <div class="tabs" role="tablist">${gallery.tabs.map((t, i) =>
          `<button role="tab" type="button" class="tab" aria-selected="${i === 0}" data-i="${i}">${t.label}</button>`).join("")}</div>
        <div class="panels">${gallery.tabs.map((t, i) =>
          `<div class="panel" data-i="${i}" ${i ? "hidden" : ""}>${t.html}</div>`).join("")}</div>
      </div>
      <aside class="facts">
        <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        <div class="links">${links.map(([u, l]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${l} ↗</a>`).join("")}</div>
      </aside>
    </section>

    <section class="about">
      <h2>Reseña</h2>
      <div id="wiki-summary" class="summary">${w.eswiki || w.enwiki ? "Cargando reseña desde Wikipedia…" : "No hay artículo de Wikipedia enlazado para este juego."}</div>
    </section>

    <section class="releases">
      <h2>Lanzamientos por región</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Región</th><th>Título</th><th>Fecha</th><th>Editor</th><th>Código</th><th>Idiomas</th><th>ROM</th><th>CRC32</th></tr></thead>
        <tbody>${g.variants.map((v) => `<tr>
          <td>${esc(regionEs(v.region))}</td>
          <td>${esc(v.title)}${v.rev ? ` <small>(${esc(v.rev)})</small>` : ""}</td>
          <td>${v.month ? `${MONTHS[+v.month]} ` : ""}${v.year || "—"}</td>
          <td>${esc(v.publisher || "—")}</td>
          <td><code>${esc(v.serial || "—")}</code></td>
          <td>${esc(v.langs || "—")}</td>
          <td>${v.size ? `${(v.size * 8) / 1048576} Mbit` : "—"}</td>
          <td><code>${esc(v.crc || "—")}</code></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>

    ${gallery.shots ? `<section class="shots"><h2>Capturas</h2><div class="shot-grid">${gallery.shots}</div></section>` : ""}
  </article>`;

  el.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    for (const t of el.querySelectorAll(".tab")) t.setAttribute("aria-selected", t === b);
    for (const p of el.querySelectorAll(".panel")) p.hidden = p.dataset.i !== b.dataset.i;
  });
  $("#back").addEventListener("click", (e) => {
    if (history.length > 1 && state._scroll != null) { e.preventDefault(); history.back(); }
  });
  window.scrollTo(0, 0);
  loadSummary(w);
}

function figure(src, full, caption, cls = "") {
  return `<figure class="${cls}"><img loading="lazy" src="${esc(src)}" data-full="${esc(full || src)}" alt="${esc(caption)}"><figcaption>${esc(caption)}</figcaption></figure>`;
}

function buildGallery(g) {
  const tabs = [];
  // Cajas: escaneos de Near (EE. UU.) + carátulas de cada región.
  const boxes = [];
  for (const part of ["box/front", "box/back", "box/front-alternate", "box/back-alternate", "box/top", "box/bottom", "box/left", "box/right"]) {
    if (hasScan(g, part)) boxes.push(figure(scanUrl(g, part), scanFull(g, part), `${SCAN_LABEL[part]} (EE. UU., escaneo)`));
  }
  const seen = new Set();
  for (const v of g.variants) {
    if (!has(v, "b")) continue;
    const label = regionEs(v.region);
    if (seen.has(label) && v.region !== "USA") continue;
    seen.add(label);
    boxes.push(figure(thumbUrl(v, "b"), null, `Caja · ${label}${v.title !== g.title ? ` — ${v.title}` : ""}`));
  }
  if (boxes.length) tabs.push({ label: "📦 Caja", html: `<div class="fig-grid">${boxes.join("")}</div>` });

  // Cartucho: escaneo real o cartucho ilustrado con la etiqueta de la región.
  const carts = [];
  if (hasScan(g, "cartridge")) carts.push(figure(scanUrl(g, "cartridge"), scanFull(g, "cartridge"), "Cartucho y placa (EE. UU., escaneo)", "wide"));
  if (hasScan(g, "pcb")) carts.push(figure(scanUrl(g, "pcb"), scanFull(g, "pcb"), "Placa de circuito", "wide"));
  const drawn = new Set();
  for (const v of g.variants) {
    const style = v.regions.includes("US") ? "US" : v.regions.includes("JP") ? "JP" : "EU";
    if (drawn.has(style) || (style === "US" && hasScan(g, "cartridge"))) continue;
    drawn.add(style);
    carts.push(cartridgeSVG(g, v, style));
  }
  if (carts.length) tabs.push({ label: "🎮 Cartucho", html: `<div class="fig-grid carts">${carts.join("")}</div>` });

  // Pantallas de título y logos.
  const screens = [];
  for (const v of g.variants) {
    if (has(v, "t")) screens.push(figure(thumbUrl(v, "t"), null, `Pantalla de título · ${regionEs(v.region)}`, "px"));
  }
  const logo = g.variants.find((v) => has(v, "l"));
  if (logo) screens.push(figure(thumbUrl(logo, "l"), null, "Logo", "logo"));
  if (screens.length) tabs.push({ label: "📺 Título", html: `<div class="fig-grid">${screens.slice(0, 6).join("")}</div>` });

  if (!tabs.length) tabs.push({ label: "Sin imágenes", html: `<p class="muted">No hay imágenes disponibles para este juego.</p>` });

  const shots = g.variants.filter((v) => has(v, "s"))
    .map((v) => figure(thumbUrl(v, "s"), null, `Captura · ${regionEs(v.region)}`, "px")).slice(0, 4).join("");
  return { tabs, shots };
}

// Cartucho ilustrado: la forma cambia según región (EE. UU. vs Japón/Europa).
function cartridgeSVG(g, v, style) {
  const label = has(v, "b") ? thumbUrl(v, "b") : has(v, "t") ? thumbUrl(v, "t") : null;
  const id = `c${Math.random().toString(36).slice(2, 8)}`;
  const title = esc(v.title);
  const caption = `Cartucho ilustrado · ${style === "US" ? "Super NES (América)" : style === "JP" ? "Super Famicom (Japón)" : "Super Nintendo (Europa)"}`;
  let svg;
  if (style === "US") {
    svg = `<svg viewBox="0 0 400 290" role="img" aria-label="${caption}">
      <defs><linearGradient id="${id}g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9c98a6"/><stop offset="1" stop-color="#77737f"/></linearGradient></defs>
      <path d="M8 10h384v250l-14 20H22L8 260z" fill="url(#${id}g)" stroke="#55525c" stroke-width="2"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${30 + i * 56}" y="10" width="40" height="8" fill="#6d6975"/>`).join("")}
      <rect x="40" y="40" width="16" height="170" rx="8" fill="#6a6672"/><rect x="72" y="40" width="16" height="170" rx="8" fill="#6a6672"/>
      <rect x="146" y="26" width="234" height="210" rx="8" fill="#302d36"/>
      <rect x="150" y="30" width="226" height="170" fill="#111"/>
      <svg x="150" y="30" width="226" height="170"><image href="${esc(label || "")}" width="226" height="170" preserveAspectRatio="xMidYMid meet"/></svg>
      <rect x="150" y="204" width="226" height="28" fill="#1b1a1f"/>
      <text x="263" y="223" text-anchor="middle" font-family="Inter,sans-serif" font-weight="700" font-size="12" fill="#e8e6ee">${title.slice(0, 34)}</text>
      <text x="30" y="250" font-family="Inter,sans-serif" font-size="9" fill="#4a4751" font-weight="700">SUPER NINTENDO ENTERTAINMENT SYSTEM</text>
    </svg>`;
  } else {
    const body = style === "JP" ? "#b9b6bd" : "#b3b0b8";
    svg = `<svg viewBox="0 0 400 290" role="img" aria-label="${caption}">
      <path d="M20 280V70q0-62 70-62h220q70 0 70 62v210z" fill="${body}" stroke="#77737e" stroke-width="2"/>
      <path d="M20 280V70q0-62 70-62h220q70 0 70 62v210" fill="none" stroke="#d5d3da" stroke-width="2" transform="translate(0 2)"/>
      <circle cx="46" cy="252" r="10" fill="#8e8a95"/><circle cx="354" cy="252" r="10" fill="#8e8a95"/>
      ${style === "EU" ? `<g transform="translate(22 196)">${["#d0303a", "#f0c020", "#2a60c8", "#2a9a50"].map((c, i) =>
        `<circle cx="${12 + (i % 2) * 14}" cy="${(i > 1 ? 14 : 0)}" r="6" fill="${c}"/>`).join("")}</g>` : ""}
      <rect x="66" y="56" width="268" height="206" rx="4" fill="#fafafa"/>
      <rect x="70" y="60" width="260" height="170" fill="#111"/>
      <svg x="70" y="60" width="260" height="170"><image href="${esc(label || "")}" width="260" height="170" preserveAspectRatio="xMidYMid meet"/></svg>
      <rect x="70" y="232" width="260" height="26" fill="${style === "JP" ? "#e8e4dc" : "#1c1c22"}"/>
      <text x="200" y="250" text-anchor="middle" font-family="Inter,sans-serif" font-weight="700" font-size="12" fill="${style === "JP" ? "#222" : "#eee"}">${title.slice(0, 36)}</text>
      <text x="200" y="36" text-anchor="middle" font-family="Inter,sans-serif" font-weight="800" font-size="13" fill="#6e6a76" letter-spacing="2">${style === "JP" ? "SUPER FAMICOM" : "SUPER NINTENDO"}</text>
    </svg>`;
  }
  return `<figure class="cart-svg">${svg}<figcaption>${esc(caption)}</figcaption></figure>`;
}

// Resumen de Wikipedia (API REST con CORS). Primero en español, luego inglés.
async function loadSummary(w) {
  const box = $("#wiki-summary");
  const tries = [];
  if (w.eswiki) tries.push(["es", w.eswiki]);
  if (w.enwiki) tries.push(["en", w.enwiki]);
  for (const [lang, page] of tries) {
    try {
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`);
      if (!r.ok) continue;
      const j = await r.json();
      if (!j.extract) continue;
      if (!box.isConnected) return;
      box.innerHTML = `<p>${esc(j.extract)}</p>
        <p class="muted">Fuente: <a href="${esc(j.content_urls?.desktop?.page)}" target="_blank" rel="noopener">Wikipedia (${lang})</a>, CC BY-SA 4.0${lang === "en" ? " · texto en inglés" : ""}.</p>`;
      return;
    } catch { /* probamos el siguiente idioma */ }
  }
  if (box.isConnected && tries.length) box.textContent = "No se pudo cargar la reseña de Wikipedia.";
}

// Imágenes que no cargan: la portada muestra el título; la galería oculta la figura.
document.addEventListener("error", (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.closest("#lightbox")) return;
  const cover = img.closest(".cover");
  if (cover) img.replaceWith(Object.assign(document.createElement("span"),
    { className: "nocover", textContent: img.closest(".card").querySelector("h3").textContent }));
  else img.closest("figure")?.classList.add("broken");
}, true);

// ------------------------------------------------------------------ lightbox
document.addEventListener("click", (e) => {
  const img = e.target.closest("#view-detail figure img");
  if (img) {
    const lb = $("#lightbox");
    const big = $("img", lb);
    big.onerror = () => { big.onerror = null; big.src = img.src; };
    big.src = img.dataset.full || img.src;
    $(".lb-caption", lb).textContent = img.alt;
    lb.hidden = false;
    return;
  }
  if (e.target.closest("#lightbox")) $("#lightbox").hidden = true;
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#lightbox").hidden = true; });

// ------------------------------------------------------------------ tema
// Ciclo: automático (según el sistema) → claro → oscuro.
const THEMES = [
  { id: "", icon: "🌓", label: "Tema automático" },
  { id: "light", icon: "☀️", label: "Tema claro" },
  { id: "dark", icon: "🌙", label: "Tema oscuro" },
];
function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  if (t.id) document.documentElement.dataset.theme = t.id;
  else delete document.documentElement.dataset.theme;
  const btn = $("#theme");
  btn.textContent = t.icon;
  btn.title = `${t.label} (clic para cambiar)`;
  try { t.id ? localStorage.setItem("theme", t.id) : localStorage.removeItem("theme"); } catch { /* sin almacenamiento */ }
}
applyTheme(document.documentElement.dataset.theme || "");
$("#theme").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme || "";
  applyTheme(THEMES[(THEMES.findIndex((x) => x.id === cur) + 1) % THEMES.length].id);
});

init();
