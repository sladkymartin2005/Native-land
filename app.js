/* Native Land – logika mapy.
 * Data: data/tribes.json (národy, česky), data/tribes.en.json (anglické texty),
 *       data/territories.geojson (území oříznutá podle pobřeží), data/reservations-*.geojson.
 */
(async function () {
  'use strict';

  const YEAR_MIN = 1000;
  const YEAR_MAX = 2025;
  const COLUMBUS = 1492;
  const VOYAGE_START = 1489; // lodě se objeví na moři tři roky před přistáním
  const GUANAHANI = [24.05, -74.5];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let tour = null;                                   // běžící průvodce pro nové uživatele
  const isTouch = matchMedia('(hover: none)').matches;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* soukromý režim */ } } };
  const DV = '?v=21';                                // verze dat – po aktualizaci prohlížeč nenačte staré soubory z mezipaměti
  const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };

  let lang = store.get('lang') === 'en' ? 'en' : 'cs';
  let T = window.I18N[lang];
  let nf = new Intl.NumberFormat(T.locale);

  let data, en = { nations: {}, families: {}, regions: {}, sources: [] }, flagFiles = {}, shapes = {};
  try {
    data = await getJson('data/tribes.json' + DV);
  } catch (e) {
    $('nation-list').innerHTML = `<li class="empty">${esc(T.loadFail)}</li>`;
    throw e;
  }
  // doplňkové soubory – aplikace funguje i bez nich
  await Promise.all([
    getJson('data/tribes.en.json' + DV).then((d) => { en = d; }).catch(() => {}),
    getJson('data/flags/CREDITS.json' + DV).then((d) => { flagFiles = d; }).catch(() => {}),
    getJson('data/territories.geojson' + DV).then((d) => { d.features.forEach((f) => { shapes[f.properties.id + ':' + f.properties.i] = f; }); }).catch(() => {}),
  ]);
  const { regions, families, nations } = data;
  const byId = new Map(nations.map((n) => [n.id, n]));

  const state = { year: 1600, all: false, selected: null, family: null, q: '', onlyVisible: false, playing: false };

  /* ---------- jazyk ---------- */
  const E = (n) => en.nations[n.id] || {};
  const nName = (n) => (lang === 'en' ? n.en : n.name);
  const nField = (n, k) => (lang === 'en' && E(n)[k] != null ? E(n)[k] : n[k]);
  const tLabel = (t) => (lang === 'en' && E(t.nation).terr && E(t.nation).terr[t.index]) || t.label;
  const famName = (id) => (lang === 'en' && en.families[id]) || (families[id] || {}).name || id;
  const regName = (id) => (lang === 'en' && en.regions[id]) || (regions[id] || {}).name || id;
  const yearText = (y) => (lang === 'en' ? String(y).replace('př. n. l.', 'BC') : String(y));
  const yearsLabel = (t) => `${t.from == null ? T.before : t.from} – ${t.to == null ? T.today : t.to}`;

  /* ---------- barvy podle jazykových rodin ---------- */
  function shade(hex, dl, dh) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0; const l = (max + min) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return `hsl(${Math.round(h * 60 + dh + 360) % 360} ${Math.round(s * 100)}% ${Math.round(Math.min(72, Math.max(24, l * 100 + dl)))}%)`;
  }
  const famCount = {};
  nations.forEach((n) => {
    const base = (families[n.family] || {}).color || '#777';
    const k = famCount[n.family] = (famCount[n.family] || 0) + 1;
    // příbuzné národy mají stejný odstín, liší se jen světlostí, aby šli sousedé rozeznat
    n.base = base;
    n.color = shade(base, [0, 9, -8, 5, -4][k % 5], [0, 7, -7][k % 3]);
    n.stroke = shade(base, [0, 9, -8, 5, -4][k % 5] - 16, [0, 7, -7][k % 3]);   // obrys o tón tmavší než výplň
  });

  /* ---------- pomocné funkce ---------- */
  const isActive = (t, year) => state.all || ((t.from ?? -Infinity) <= year && year < (t.to ?? Infinity));
  function smooth(pts, iterations) {
    let p = pts;
    for (let k = 0; k < iterations; k++) {
      const out = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      p = out;
    }
    return p;
  }
  function centroid(pts) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const [y1, x1] = pts[i], [y2, x2] = pts[(i + 1) % pts.length], f = x1 * y2 - x2 * y1;
      a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
    }
    return Math.abs(a) < 1e-9 ? pts[0] : [cy / (3 * a), cx / (3 * a)];
  }

  /* ---------- mapa ---------- */
  const map = L.map('map', { zoomControl: false, minZoom: innerWidth < 760 ? 2 : 3, maxZoom: 9, zoomSnap: 0.5, worldCopyJump: false, maxBounds: [[2, -200], [86, 12]], maxBoundsViscosity: 0.7 })
    .fitBounds([[15, -128], [63, -64]]);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ imperial: lang === 'en', position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');

  // Podklad: online dlaždice Esri, nebo (stránka s <meta name="basemap" content="local">) přibalený
  // reliéf Natural Earth – pro hostování, kde stránka nesmí načítat obrázky z cizích serverů.
  const LOCAL_BASE = document.querySelector('meta[name="basemap"]')?.content === 'local';
  map.createPane('borders').style.zIndex = 420;
  map.getPane('borders').style.pointerEvents = 'none';
  let borders;
  if (LOCAL_BASE) {
    L.imageOverlay('media/relief-na.jpg', [[5, -180], [84, 5]], { className: 'base-tiles', attribution: 'Podklad: Natural Earth' }).addTo(map);
    borders = L.layerGroup();
    getJson('data/borders.geojson').then((gj) => L.geoJSON(gj, { pane: 'borders', interactive: false, style: { color: '#4a3a2c', weight: 1.2, opacity: 0.7, dashArray: '4 3' } }).addTo(borders)).catch(() => {});
  } else {
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
    L.tileLayer(ESRI + 'World_Physical_Map/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 8, maxZoom: 9, className: 'base-tiles',
      attribution: 'Podklad: Esri, US National Park Service',
    }).addTo(map);
    borders = L.tileLayer(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { pane: 'borders', maxZoom: 9, opacity: 0.8, attribution: 'Esri, HERE, Garmin' });
  }

  map.createPane('reservations').style.zIndex = 405;
  map.createPane('territories').style.zIndex = 410;
  map.createPane('labels').style.zIndex = 640;
  map.getPane('labels').style.pointerEvents = 'none';
  map.createPane('seafx').style.zIndex = 655;
  map.getPane('seafx').style.pointerEvents = 'none';
  map.createPane('ships').style.zIndex = 660;
  map.getPane('ships').style.pointerEvents = 'none';

  const terrGroup = L.layerGroup().addTo(map);
  const labelGroup = L.layerGroup().addTo(map);
  const all = []; // všechna území všech národů

  // Střed pro název: těžiště největší části území (v Mercatoru, jak ji vidí oko).
  // Když těžiště leží mimo tvar (zahnutá území), vrátí null a použije se náhradní bod.
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const invY = (y) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;
  function visualCenter(multi) {
    let best = null, bestA = 0;
    for (const poly of multi) {
      const ring = poly[0].map(([lat, lon]) => [lon, mercY(lat)]);
      let A = 0, cx = 0, cy = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length], f = x1 * y2 - x2 * y1;
        A += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
      }
      if (Math.abs(A) > bestA) { bestA = Math.abs(A); best = { ring, holes: poly.slice(1).map((h) => h.map(([lat, lon]) => [lon, mercY(lat)])), c: [cx / (3 * A), cy / (3 * A)] }; }
    }
    if (!best || !isFinite(best.c[0])) return null;
    const inside = (pt, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
    if (!inside(best.c, best.ring) || best.holes.some((h) => inside(best.c, h))) return null;
    return [invY(best.c[1]), best.c[0]];
  }
  // Plynulé „rozpuštění“: vrstvu přidá průhlednou a zviditelní ji, při skrytí ji nechá vyblednout a pak odebere.
  const FADE_MS = 1600;
  function fadeIn(group, layer) {
    clearTimeout(layer._fadeTimer);
    if (!group.hasLayer(layer)) group.addLayer(layer);
    const el = layer.getElement && layer.getElement();
    if (!el) return;
    el.classList.add('fading'); el.style.opacity = '0';
    void el.getBoundingClientRect();                      // vynutit vykreslení průhledného stavu
    requestAnimationFrame(() => { el.style.opacity = '1'; });
  }
  function fadeOut(group, layer) {
    const el = layer.getElement && layer.getElement();
    if (!el || !group.hasLayer(layer)) { group.removeLayer(layer); return; }
    el.classList.add('fading'); el.style.opacity = '0';
    clearTimeout(layer._fadeTimer);
    layer._fadeTimer = setTimeout(() => group.removeLayer(layer), FADE_MS);
  }
  const tipHtml = (t) => `${esc(nName(t.nation))}<small>${esc(tLabel(t))} · ${yearsLabel(t)}</small>`;
  nations.forEach((n) => {
    n.territories.forEach((t, i) => {
      t.nation = n; t.index = i; t.act = false; t.shown = false;
      const f = shapes[n.id + ':' + i];
      let latlngs;
      if (f && f.properties.src === JSON.stringify(t.poly)) {
        // přesný tvar oříznutý podle pobřeží (scripts/build_territories.js)
        const g = f.geometry, multi = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
        latlngs = multi.map((poly) => poly.map((ring) => ring.map(([x, y]) => [y, x])));
        t.center = visualCenter(latlngs) || t.labelAt || f.properties.label;
      } else {
        latlngs = smooth(t.poly, 3);
        t.center = visualCenter([[latlngs]]) || t.labelAt || centroid(t.poly);
      }
      t.layer = L.polygon(latlngs, { pane: 'territories', lineJoin: 'round', smoothFactor: 1.2 });
      t.layer.bindTooltip(() => tipHtml(t), { sticky: true, className: 't-hover', direction: 'top', opacity: 0.97 });
      t.layer.on('click', (e) => { L.DomEvent.stopPropagation(e); select(n.id, { fly: false }); });
      t.layer.on('mouseover', () => { t.hover = true; restyle(t); });
      t.layer.on('mouseout', () => { t.hover = false; restyle(t); });
      const b = t.layer.getBounds();
      t.bounds = b;
      t.area = (b.getNorth() - b.getSouth()) * (b.getEast() - b.getWest());
      if (Math.max(b.getNorth() - b.getSouth(), b.getEast() - b.getWest()) < 1.3) {
        // malé rezervace by při pohledu na celý kontinent zanikly – přidáme k nim bod
        t.dot = L.circleMarker(t.center, { pane: 'territories', radius: 5, color: '#fff', weight: 1.5, fillColor: n.color, fillOpacity: 1 });
        t.dot.bindTooltip(() => tipHtml(t), { className: 't-hover', direction: 'top' });
        t.dot.on('click', (e) => { L.DomEvent.stopPropagation(e); select(n.id, { fly: false }); });
      }
      t.labelMarker = L.marker(t.center, { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: 't-label', html: '', iconSize: [0, 0] }) });
      all.push(t);
    });
  });
  const bySize = all.slice().sort((a, b) => b.area - a.area);

  function restyle(t) {
    const sel = state.selected, mine = sel && sel === t.nation.id, act = isActive(t, state.year);
    const res = t.kind === 'res' || t.kind === 'moved';
    const style = { color: t.nation.stroke, fillColor: t.nation.color, weight: 1.3, opacity: 0.95, fillOpacity: res ? 0.62 : 0.46, dashArray: res ? '5 4' : null };
    if (sel && !mine) { style.fillOpacity = 0.12; style.opacity = 0.35; style.weight = 1; }
    if (mine) { style.weight = 3; style.fillOpacity = act ? 0.7 : 0.1; style.color = '#1e1a17'; if (!act) { style.dashArray = '2 6'; style.weight = 1.6; } }
    if (t.hover) { style.weight = Math.max(style.weight, 2.6); style.fillOpacity = Math.min(style.fillOpacity + 0.16, 0.85); }
    t.layer.setStyle(style);
    if (t.dot) t.dot.setStyle({ fillOpacity: sel && !mine ? 0.35 : 1, opacity: sel && !mine ? 0.4 : 1, radius: mine ? 7 : 5 });
  }

  // Přepočítá, která území mají být vidět. Sahá jen na ta, u nichž se něco změnilo,
  // aby šla časová osa přehrávat plynule po jednom roce.
  let activeNations = 0;
  function syncMap(force) {
    const showTerr = $('lyr-territories').checked;
    let changed = false;
    for (const t of all) {
      const act = isActive(t, state.year);
      const show = showTerr && (act || state.selected === t.nation.id);
      if (show !== t.shown) {
        const fn = show ? fadeIn : fadeOut;
        fn(terrGroup, t.layer);
        if (t.dot) fn(terrGroup, t.dot);
        t.shown = show; changed = true;
        if (show) restyle(t);
      } else if (show && (force || act !== t.act)) restyle(t);
      if (act !== t.act) { t.act = act; changed = true; }
    }
    if (changed || force) {
      // velká území dospod, malá nahoru (aby šla kliknout); vybraný národ úplně nahoru
      for (const t of bySize) if (t.shown) t.layer.bringToFront();
      if (state.selected) byId.get(state.selected).territories.forEach((t) => { if (t.shown && t.act) t.layer.bringToFront(); });
      activeNations = nations.filter((n) => n.territories.some((t) => t.act)).length;
      syncLabels();
    }
    return changed;
  }

  function syncLabels() {
    const z = map.getZoom();
    for (const t of all) {
      let show = false, cls = '';
      if (t.shown && t.act) {
        const w = Math.abs(map.project(t.bounds.getNorthEast(), z).x - map.project(t.bounds.getSouthWest(), z).x);
        const name = nName(t.nation);
        show = w > Math.max(40, name.length * 5.4) || state.selected === t.nation.id;
        cls = w > 330 ? 'xl' : w > 170 ? 'l' : w > 90 ? 'm' : 's';
        if (show && (t.labelText !== name || t.labelCls !== cls)) {
          t.labelMarker.setIcon(L.divIcon({ className: 't-label', html: `<span class="${cls}">${esc(name)}</span>`, iconSize: [0, 0] }));
          t.labelText = name; t.labelCls = cls;
        }
      }
      if (show !== !!t.labelOn) { (show ? fadeIn : fadeOut)(labelGroup, t.labelMarker); t.labelOn = show; }
    }
  }
  map.on('zoomend', syncLabels);
  map.on('click', () => { if (state.selected) select(null); });

  /* ---------- seznam ---------- */
  function nationPeriod(n) {
    const from = n.territories.some((t) => t.from == null) ? null : Math.min(...n.territories.map((t) => t.from));
    const to = n.territories.some((t) => t.to == null) ? null : Math.max(...n.territories.map((t) => t.to));
    return `${from == null ? T.before : from} – ${to == null ? T.today : to}`;
  }
  function renderFamilies() {
    $('families').innerHTML = Object.entries(families).map(([id, f]) =>
      `<button type="button" class="chip" data-family="${esc(id)}" aria-pressed="${state.family === id}"><i style="background:${esc(f.color)}"></i>${esc(famName(id))}</button>`).join('');
    const f = state.family && families[state.family];
    $('fam-btn').innerHTML = f
      ? `<i style="background:${esc(f.color)}"></i><span>${esc(famName(state.family))}</span><span class="x" role="button" aria-label="×" data-clear="1">×</span>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg><span>${esc(T.filterFamilies)}</span><span class="caret">▾</span>`;
    $('fam-btn').classList.toggle('on', !!f);
  }
  $('families').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.family = state.family === b.dataset.family ? null : b.dataset.family;
    renderFamilies(); renderList();
  });
  $('fam-btn').addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) { state.family = null; renderFamilies(); renderList(); return; }
    const open = $('fam-panel').hidden; $('fam-panel').hidden = !open; $('fam-btn').setAttribute('aria-expanded', String(open));
  });
  const setOnlyVisible = (v) => {
    state.onlyVisible = v;
    $('show-all').setAttribute('aria-pressed', String(!v)); $('show-visible').setAttribute('aria-pressed', String(v));
    renderList();
  };
  $('show-all').addEventListener('click', () => setOnlyVisible(false));
  $('show-visible').addEventListener('click', () => setOnlyVisible(true));
  const norm = (s) => String(s || '').toLocaleLowerCase('cs').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const flagThumb = (n) => {
    const fc = flagFiles[n.id];
    return fc && fc.file ? `<img class="ft" src="data/${esc(fc.original_file || fc.file)}${DV}" alt="" loading="lazy">` : `<span class="ft none" style="--c:${esc(n.color)}"></span>`;
  };
  function renderList() {
    const qn = norm(state.q.trim());
    const collator = new Intl.Collator(lang === 'en' ? 'en' : 'cs');
    const items = nations.filter((n) => {
      if (state.family && n.family !== state.family) return false;
      n._on = n.territories.some((t) => t.act);
      if (state.onlyVisible && !n._on) return false;
      return !qn || [n.name, n.en, n.endonym, ...(n.aka || [])].some((s) => norm(s).includes(qn));
    }).sort((a, b) => collator.compare(nName(a), nName(b)));
    $('count').dataset.n = items.length;
    updateCount();
    if (!items.length) { $('nation-list').innerHTML = `<p class="empty">${esc(T.nothing)}</p>`; return; }
    // skupiny podle kulturních oblastí (pořadí ze sever → jih)
    const groups = Object.keys(regions).map((r) => [r, items.filter((n) => n.region === r)]).filter(([, l]) => l.length);
    $('nation-list').innerHTML = groups.map(([r, list]) => `
      <section class="grp" role="listitem">
        <h4>${esc(regName(r))}<span>${list.length}</span></h4>
        ${list.map((n) => {
          const second = lang === 'en' ? nField(n, 'endonym') : [n.en, n.endonym].filter(Boolean).join(' · ');
          return `<button type="button" class="row${n._on ? '' : ' off'}" data-id="${esc(n.id)}" style="--c:${esc(n.color)}">
            ${flagThumb(n)}
            <span class="nm"><b>${esc(nName(n))}</b><small>${esc(second || '')}</small></span>
            <span class="when">${nationPeriod(n)}</span></button>`;
        }).join('')}
      </section>`).join('');
  }
  function updateCount() {
    $('count').textContent = T.count($('count').dataset.n || 0, nations.length) + (state.all ? '' : ' · ' + T.yearIs(state.year));
    $('show-visible').textContent = state.all ? T.fOnMap : T.onMapIn(state.year);
  }
  $('nation-list').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) select(b.dataset.id, { fly: true }); });
  $('search').addEventListener('input', (e) => { state.q = e.target.value; renderList(); });
  $('search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = $('nation-list').querySelector('button[data-id]'); if (b) b.click(); } });

  /* ---------- detail ---------- */
  function nearestPop(n) {
    let near = -1; const pops = n.population || [];
    if (!state.all) pops.forEach((p, i) => { if (near < 0 || Math.abs(p.year - state.year) < Math.abs(pops[near].year - state.year)) near = i; });
    return near;
  }
  const detailKey = (n) => n.id + '|' + lang + '|' + n.territories.map((t) => (t.act ? 1 : 0)).join('') + '|' + nearestPop(n) + '|' + state.all;
  let lastDetailKey = '';
  function renderDetail(force) {
    const n = byId.get(state.selected);
    if (!n) { $('detail-view').hidden = true; $('list-view').hidden = false; lastDetailKey = ''; return; }
    const key = detailKey(n);
    if (!force && key === lastDetailKey) return;
    const keepScroll = lastDetailKey.split('|')[0] === n.id ? $('detail').scrollTop : 0;
    lastDetailKey = key;
    const e = E(n), pops = n.population || [], near = nearestPop(n);
    const maxPop = Math.max(1, ...pops.map((p) => p.value));
    const fc = flagFiles[n.id], fl = n.flag || {};
    const caption = (lang === 'en' && e.flag) || fl.caption || '';
    const note = (lang === 'en' && e.flag) || fl.note || T.noFlag;
    const endonym = nField(n, 'endonym');
    const sub = [lang === 'en' ? '' : n.en, endonym ? `${T.ownName}: <em>${esc(endonym)}</em>` : ''].filter(Boolean);
    const wiki = (code, title, label) => (title ? `<a href="https://${code}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}" target="_blank" rel="noopener">${esc(label)}</a>` : '');
    const links = lang === 'en' ? wiki('en', n.wikiEn, T.wikiEn) + wiki('cs', n.wikiCs, T.wikiCs) : wiki('cs', n.wikiCs, T.wikiCs) + wiki('en', n.wikiEn, T.wikiEn);
    const events = n.events || [];
    // dnešní populace: poslední údaj od roku 1990
    const popNow = [...pops].reverse().find((p) => p.year >= 1990 && p.value > 0);
    const flagSmall = fl.commons && fc && fc.file
      ? `<button type="button" class="d-flag" data-flag="1" title="${esc(T.flagZoom)}"><img class="zoomable" src="data/${esc(fc.original_file || fc.file)}${DV}" alt="${esc(caption)}" onerror="this.closest('button').hidden=true"></button>`
      : '';
    $('detail-nav').innerHTML = [['d-terr', T.navTerr], pops.length && ['d-pop', T.navPop], events.length && ['d-ev', T.navEv], ['d-more', T.navMore]]
      .filter(Boolean).map(([id, l]) => `<button type="button" data-jump="${id}">${esc(l)}</button>`).join('');
    $('detail').innerHTML = `
      <header class="d-head" style="--c:${esc(n.color)}">
        ${flagSmall}
        <div class="d-title">
          <h2>${esc(nName(n))}</h2>
          <p class="sub">${sub.map((s, i) => (i === 0 && lang !== 'en' ? esc(s) : s)).join(' · ')}</p>
          <div class="badges">
            <span class="badge region" style="background:${esc(n.base)}">${esc(famName(n.family))}</span>
            <span class="badge">${esc(regName(n.region))}</span>
          </div>
        </div>
      </header>
      ${flagSmall ? `<p class="flag-cap">${esc(caption)} · <a href="${esc(fc.source || 'https://commons.wikimedia.org')}" target="_blank" rel="noopener">Wikimedia Commons</a>${fc.license ? ' · ' + esc(fc.license) : ''}</p>` : `<p class="noflag">${esc(fl.commons ? T.noFlag : note)}</p>`}
      <dl class="facts">
        <div><dt>${T.fOnMap}</dt><dd>${nationPeriod(n)}</dd></div>
        ${popNow ? `<div><dt>${T.fPopNow}</dt><dd>${popNow.approx === false ? '' : '≈ '}${nf.format(popNow.value)} <small>(${popNow.year})</small></dd></div>` : ''}
        ${n.lang ? `<div class="wide"><dt>${T.language[0].toUpperCase() + T.language.slice(1)}</dt><dd>${esc(nField(n, 'lang'))}</dd></div>` : ''}
        ${n.countries ? `<div class="wide"><dt>${T.fCountries}</dt><dd>${esc(nField(n, 'countries'))}</dd></div>` : ''}
        ${n.lifeway ? `<div class="wide"><dt>${T.fLifeway}</dt><dd>${esc(nField(n, 'lifeway'))}</dd></div>` : ''}
      </dl>
      <p class="d-text">${esc(nField(n, 'text'))}</p>
      <h3 id="d-terr">${T.hTerr}</h3>
      ${terrChart(n)}
      <ul class="terr">${n.territories.map((t, i) =>
        `<li class="${t.act && !state.all ? 'active' : ''}"><button type="button" data-t="${i}">
           <span><strong>${esc(tLabel(t))}</strong><br><span class="muted">${esc(T.kind[t.kind] || '')}</span></span>
           <span class="yrs">${yearsLabel(t)}</span></button></li>`).join('')}</ul>
      ${pops.length ? `<h3 id="d-pop">${T.hPop}</h3>
      <table class="pop"><tbody>${pops.map((p, i) => {
        const pn = lang === 'en' ? (e.pop || [])[i] : p.note;
        return `<tr class="${i === near ? 'near' : ''}"><td class="y">${p.year}</td>
           <td class="v">${p.approx === false ? '' : '≈ '}${nf.format(p.value)}</td>
           <td><div class="bar" style="width:${Math.max(1.5, (p.value / maxPop) * 100).toFixed(1)}%;background:${esc(n.color)}"></div>${pn ? `<span class="note">${esc(pn)}</span>` : ''}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="muted">${T.popNote}</p>` : ''}
      ${events.length ? `<h3 id="d-ev">${T.hEvents}</h3>
      <ul class="events">${events.map((ev, i) => `<li><span class="ey">${esc(yearText(ev.year))}</span><span>${esc((lang === 'en' && (e.events || [])[i]) || ev.text)}</span></li>`).join('')}</ul>` : ''}
      <h3 id="d-more">${T.hMore}</h3>
      <p class="links">${links}</p>`;
    $('list-view').hidden = true;
    $('detail-view').hidden = false;
    $('detail').scrollTop = keepScroll;
  }
  $('detail-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump]'); if (!b) return;
    const el = document.getElementById(b.dataset.jump);
    if (el) $('detail').scrollTo({ top: el.offsetTop - 8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  $('detail').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    const t = byId.get(state.selected).territories[+b.dataset.t];
    if (!isActive(t, state.year)) {
      stop();
      const from = Math.max(YEAR_MIN, t.from ?? YEAR_MIN), to = Math.min(YEAR_MAX, (t.to ?? YEAR_MAX + 1) - 1);
      setYear(Math.round((from + to) / 2));
    }
    flyTo([t]);
  });
  $('back').addEventListener('click', () => select(null));
  document.querySelector('main').addEventListener('click', (e) => {
    if (e.target === e.currentTarget && document.body.classList.contains('side-open') && matchMedia('(max-width: 820px)').matches) $('sidebar-toggle').click();
  });
  // klik na vlajku: zvětšení přes skoro celé okno, vycentrované na tmavém pozadí (okraje aplikace zůstanou vidět)
  function openFlag() {
    const n = byId.get(state.selected), fc = n && flagFiles[n.id]; if (!fc) return;
    const z = $('flag-zoom'), img = z.querySelector('img'), fl = n.flag || {};
    img.src = 'data/' + fc.file + DV; img.alt = (lang === 'en' && E(n).flag) || fl.caption || '';
    z.querySelector('.fz-title').textContent = nName(n);
    z.querySelector('.fz-cap').innerHTML = `${esc(img.alt)}<br><a href="${esc(fc.source || 'https://commons.wikimedia.org')}" target="_blank" rel="noopener">Wikimedia Commons</a>${fc.license ? ' · ' + esc(fc.license) : ''}${fc.author ? ' · ' + esc(fc.author.replace(/\s*\[\d+\]/g, '')) : ''}`;
    // zobrazit až se známým poměrem stran, ať vlajka při otevření neposkočí
    let shown = false;
    const fit = () => { if (img.naturalWidth && img.naturalHeight) img.style.setProperty('--ar', (img.naturalWidth / img.naturalHeight).toFixed(4)); };
    const show = () => { if (shown) return; shown = true; requestAnimationFrame(() => z.classList.add('open')); };
    img.onload = () => { fit(); show(); };
    img.onerror = show;
    z.hidden = false;
    if (img.complete && img.naturalWidth) { fit(); show(); }
    setTimeout(show, 600);
    z.querySelector('.close').focus({ preventScroll: true });
  }
  function closeFlag() { const z = $('flag-zoom'); if (z.hidden) return; z.classList.remove('open'); setTimeout(() => { z.hidden = true; }, 250); }
  $('detail').addEventListener('click', (e) => { if (e.target.closest('[data-flag]')) openFlag(); });
  $('flag-zoom').addEventListener('click', (e) => { if (!e.target.closest('.fz-cap a')) closeFlag(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFlag(); });

  function flyTo(ts) {
    if (!ts.length) return;
    const b = L.latLngBounds([]);
    ts.forEach((t) => b.extend(t.bounds));
    map.flyToBounds(b, { padding: [70, 70], maxZoom: 7, duration: 0.7 });
  }

  function select(id, opts = {}) {
    state.selected = id && byId.has(id) ? id : null;
    if (state.selected) {
      const n = byId.get(state.selected);
      const dist = (t) => { const f = t.from ?? -Infinity, to = t.to ?? Infinity; return state.year < f ? f - state.year : state.year >= to ? state.year - to + 1 : 0; };
      if (!state.all && !n.territories.some((t) => isActive(t, state.year))) {
        // národ v daném roce na mapě není – přesuneme čas do jeho nejbližšího období
        stop();
        const t = n.territories.reduce((best, c) => (dist(c) < dist(best) ? c : best));
        const from = Math.max(YEAR_MIN, t.from ?? YEAR_MIN), to = Math.min(YEAR_MAX, (t.to ?? YEAR_MAX + 1) - 1);
        state.year = Math.min(Math.max(state.year, from), to);
      }
      const opening = !document.body.classList.contains('side-open') && innerWidth > 820;
      document.body.classList.add('side-open');
      if (opts.fly) {
        // když se právě otevírá levé menu, mapa se zúží – přiblížit až po jeho otevření, jinak by výřez nesedl
        const ts = n.territories.filter((t) => isActive(t, state.year));
        if (opening) setTimeout(() => { map.invalidateSize({ pan: false }); flyTo(ts); }, 340); else flyTo(ts);
      }
    }
    history.replaceState(null, '', state.selected ? '#' + state.selected : location.pathname + location.search);
    setYear(state.year, true);
  }

  /* ---------- epochy, události a graf území ---------- */
  const ERAS = [[1000, 1492], [1492, 1763], [1763, 1890], [1890, 1968], [1968, 2026]];
  const ERA_COLORS = ['#7d8f5a', '#b4532a', '#8a3b5c', '#4f5d7a', '#2f8a7a'];
  const eraIndex = (y) => ERAS.findIndex(([a0, b0]) => y >= a0 && y < b0);
  const eraOf = (y) => T.eras[Math.max(0, eraIndex(y))];
  // klíčové události: rok, národ, který se k nim váže (otevře se jeho detail)
  const EVENTS = [[1607, 'powhatan'], [1680, 'pueblo'], [1776, null], [1830, 'choctaw'], [1838, 'cherokee'], [1876, 'sioux'], [1890, 'sioux'], [1924, null], [1971, 'inuit'], [1999, 'inuit']];
  function syncEraHighlight() {
    const i = eraIndex(state.year);
    document.querySelectorAll('#eras i').forEach((el, k) => el.classList.toggle('cur', k === i && !state.all));
  }
  function terrChart(n) {
    const W = 100, rowH = 9, gap = 4, H = n.territories.length * (rowH + gap) + 14;
    const x = (y) => ((Math.max(YEAR_MIN, Math.min(YEAR_MAX, y)) - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * W;
    const bars = n.territories.map((t, i) => {
      const x0 = x(t.from ?? YEAR_MIN), x1 = x(t.to ?? YEAR_MAX), y0 = i * (rowH + gap);
      const op = t.kind === 'res' || t.kind === 'moved' ? 0.55 : 0.9;
      return `<rect x="${x0.toFixed(2)}" y="${y0}" width="${Math.max(0.6, x1 - x0).toFixed(2)}" height="${rowH}" rx="2" fill="${n.color}" fill-opacity="${op}" stroke="${n.stroke}" stroke-width="0.6" vector-effect="non-scaling-stroke"><title>${esc(tLabel(t))} · ${yearsLabel(t)}</title></rect>`;
    }).join('');
    const ticks = [1000, 1250, 1500, 1750, 2000].map((y) => `<text x="${x(y).toFixed(2)}" y="${H - 1}" text-anchor="${y === 1000 ? 'start' : y === 2000 ? 'end' : 'middle'}">${y}</text>`).join('');
    const now = state.all ? '' : `<line x1="${x(state.year).toFixed(2)}" x2="${x(state.year).toFixed(2)}" y1="-2" y2="${H - 12}" class="now"/>`;
    return `<svg class="terr-chart" style="height:${H - 10}px" viewBox="0 -2 ${W} ${H - 10}" preserveAspectRatio="none" role="img" aria-label="${esc(T.hTerr)}">${bars}${now}</svg><div class="terr-chart-ticks">${[1000, 1250, 1500, 1750, 2000].map((y) => `<span style="left:${x(y)}%">${y}</span>`).join('')}</div>`;
  }
  let toastTimer = 0;
  function toast(html, ms = 6000) {
    const el = $('toast'); el.innerHTML = html; el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 300); }, ms);
  }
  function renderTimelineExtras() {
    $('eras').innerHTML = ERAS.map(([a0, b0], i) => `<i style="left:${pct(a0)}%;width:${pct(Math.min(b0, YEAR_MAX)) - pct(a0)}%;background:${ERA_COLORS[i]}" title="${esc(T.eras[i])} (${a0}–${Math.min(b0, YEAR_MAX)})"></i>`).join('');
    const evs = EVENTS.map(([y, id]) => `<button type="button" class="ev" data-y="${y}" data-id="${id || ''}" style="left:${pct(y)}%" title="${y} – ${esc(T.events[y])}" aria-label="${y} – ${esc(T.events[y])}"></button>`).join('');
    $('marks').insertAdjacentHTML('beforeend', evs);
    $('speed').textContent = (speed === 0.5 ? '½' : speed) + '×';
    $('speed').title = T.speed;
    syncEraHighlight(); densTicks();
  }
  // na úzké ose skryjeme popisky po 50 letech, aby se nepřekrývaly
  function densTicks() { const w = $('year').getBoundingClientRect().width; $('ticks').classList.toggle('dense', w < 820); }
  addEventListener('resize', densTicks);
  if (window.ResizeObserver) new ResizeObserver(densTicks).observe($('year'));
  $('marks').addEventListener('click', (e) => {
    const b = e.target.closest('.ev'); if (!b) return;
    stop(); if (sailing) sailing.cancel();
    const y = +b.dataset.y;
    setYear(y, true);                                    // nejdřív rok, ať se mapa přiblíží na území platná v tom roce
    if (b.dataset.id) select(b.dataset.id, { fly: true });
    toast(`<b>${y}</b> – ${esc(T.events[y])}`);
  });
  $('speed').addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; store.set('speed', speed);
    $('speed').textContent = (speed === 0.5 ? '½' : speed) + '×';
    if (state.playing) { playFrom = state.year; playStart = performance.now(); }
  });
  // klávesy: mezerník přehrát/pozastavit, šipky o rok (se Shiftem o 10 let)
  document.addEventListener('keydown', (e) => {
    if (!$('intro').hidden || document.querySelector('dialog[open]') || !$('flag-zoom').hidden || tour) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    if (tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); $('play').click(); }   // i když je zaměřené jiné tlačítko
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.id !== 'year') {
      e.preventDefault(); stop(); if (sailing) sailing.cancel();
      setYear(state.year + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    }
  });

  /* ---------- časová osa ---------- */
  function setYear(y, force) {
    state.year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(y)));
    $('year').value = state.year;
    $('year-out').textContent = state.all ? T.all : state.year;
    const changed = syncMap(force);
    $('year-note').textContent = (state.all ? '' : eraOf(state.year) + ' · ') + T.onMap(activeNations);
    syncEraHighlight();
    if (changed || force) renderList(); else updateCount();
    renderDetail(force);
    syncLanding();
  }
  let sliderDragging = false;
  $('year').addEventListener('input', (e) => {
    stop(); if (sailing) sailing.cancel();
    const y = +e.target.value; setYear(y);
    if (y === COLUMBUS && !sliderDragging) sail({ sync: false });
  });
  // kliknutí kamkoli na osu (i na čárky a popisky) přesune čas na ten rok; tažením lze přejíždět
  (() => {
    const wrap = document.querySelector('.slider-wrap'), input = $('year');
    const yearAt = (x) => { const r = input.getBoundingClientRect(), pad = 8; const k = (x - r.left - pad) / (r.width - 2 * pad); return Math.round(YEAR_MIN + Math.min(1, Math.max(0, k)) * (YEAR_MAX - YEAR_MIN)); };
    const jump = (x) => { const y = yearAt(x); if (y !== +input.value) { input.value = y; input.dispatchEvent(new Event('input')); } };
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#mark-columbus, .ev') || e.button > 0) return;
      e.preventDefault(); sliderDragging = true; wrap.setPointerCapture(e.pointerId); input.focus({ preventScroll: true }); jump(e.clientX);
    });
    wrap.addEventListener('pointermove', (e) => { if (sliderDragging) jump(e.clientX); });
    const end = () => { if (!sliderDragging) return; sliderDragging = false; if (+input.value === COLUMBUS) sail({ sync: false }); };
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  })();

  // Přehrávání: plynule po jednom roce, tempo řídí requestAnimationFrame.
  const YEARS_PER_SECOND = 10;
  const SPEEDS = [0.5, 1, 2, 4];
  let speed = SPEEDS.includes(+store.get('speed')) ? +store.get('speed') : 1;
  let playFrom = 0, playStart = 0;
  function tick(now) {
    if (!state.playing) return;
    // čas snímku může být o chlup starší než začátek přehrávání – nesmíme couvnout
    const y = Math.floor(playFrom + (Math.max(0, now - playStart) / 1000) * YEARS_PER_SECOND * speed);
    if (y !== state.year) {
      if (state.year < VOYAGE_START && y >= VOYAGE_START) {
        // od roku 1489 přebírá čas plavba: roky běží pomalu a v roce 1492 lodě přistanou
        setYear(VOYAGE_START); state.playing = false;
        sail({ sync: true }).then((done) => { if (done && $('play').dataset.on === '1') startPlay(); });
        return;
      }
      setYear(y);
      if (y >= YEAR_MAX) return stop();
    }
    requestAnimationFrame(tick);
  }
  function startPlay() {
    if (state.year >= YEAR_MAX) setYear(YEAR_MIN);
    state.playing = true; playFrom = state.year; playStart = performance.now();
    $('play').textContent = '❚❚'; $('play').dataset.on = '1';
    requestAnimationFrame(tick);
  }
  function stop() { state.playing = false; $('play').textContent = '▶'; $('play').dataset.on = '0'; }
  $('play').addEventListener('click', () => {
    if ($('play').dataset.on === '1') { stop(); if (sailing) sailing.cancel(); } else startPlay();
  });
  $('all-periods').addEventListener('change', (e) => {
    stop(); state.all = e.target.checked;
    $('timeline').classList.toggle('disabled', state.all);
    setYear(state.year, true);
  });
  const pct = (y) => ((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;
  // popisky po 50 letech (stovky výrazněji) + konec osy, drobné čárky po 10 letech
  const labels = []; for (let y = YEAR_MIN; y < 2000; y += 50) labels.push(y); labels.push(YEAR_MAX); // 2000 by se překrýval s 2025
  $('ticks').innerHTML = labels.map((y) => `<span class="${y % 100 === 0 ? 'big' : 'half'}${y % 200 === 100 ? ' odd' : ''}${y === YEAR_MAX ? ' end' : ''}" style="left:${pct(y)}%">${y}</span>`).join('');
  const minor = []; for (let y = YEAR_MIN; y <= YEAR_MAX; y += 10) minor.push(`<i class="${y % 100 === 0 ? 'c' : y % 50 === 0 ? 'h' : ''}" style="left:${pct(y)}%"></i>`);
  $('ticks-minor').innerHTML = minor.join('');
  $('marks').addEventListener('click', (e) => {
    if (!e.target.closest('#mark-columbus')) return;
    stop(); if (sailing) sailing.cancel();
    setYear(VOYAGE_START); sail({ sync: true });
  });

  /* ---------- Kolumbus 1492 ---------- */
  // Lodě: fotografie replik vyříznuté z pozadí (scripts/ship_cutout.py). Příď vlevo, spodní okraj obrázku = čára ponoru.
  // hull: kde v obrázku začíná a končí trup (podíl šířky) – podle toho se kreslí brázda a vlna u přídě.
  const SHIP_IMG = {
    nao: { src: 'media/ship-santamaria.webp', ratio: 251 / 320, hull: [0.205, 0.965] },
    caravel: { src: 'media/ship-nina.webp', ratio: 318 / 220, hull: [0.158, 0.757] },
  };
  // Kolumbova flotila; Pinta plula vpředu (její hlídka spatřila zemi), Santa María byla největší, Niña nejmenší.
  // pitch: náklon na vlnách (°), period: perioda houpání (s) – menší loď se houpe rychleji a víc.
  const FLEET = [
    // gap: odstup za Pintou podél trasy (px), side: boční odstup (px)
    { name: 'Pinta', kind: 'nao', w: 84, phase: 0.0, pitch: 1.15, period: 4.1, gap: 0, side: 0 },
    { name: 'Santa María', kind: 'nao', w: 104, phase: 2.1, pitch: 0.85, period: 5.0, gap: 150, side: 22 },
    { name: 'Niña', kind: 'caravel', w: 54, phase: 4.3, pitch: 1.5, period: 3.6, gap: 275, side: -18 },
  ];
  const landing = L.marker(GUANAHANI, { pane: 'ships', interactive: true, opacity: 0, icon: L.divIcon({ className: 'landing', html: '<span>1492</span>', iconSize: [0, 0] }) }); // na mapu se nepřidává – rok 1492 je jen na ose
  landing.bindTooltip(() => T.columbusTip, { className: 't-hover', direction: 'top' });
  let sailing = null;
  // Skutečná trasa první plavby (1492): Palos de la Frontera → Kanárské ostrovy (La Gomera) → Guanahani.
  const PALOS = [37.23, -6.9], GOMERA = [28.09, -17.11];
  const LEG1 = [[36.95, -7.2], [36.55, -7.9], [35.5, -9.7], [33.2, -12.6], [30.4, -15.4], GOMERA];
  const LEG2 = [GOMERA, [28.0, -22], [28.2, -30], [27.8, -40], [27.0, -50], [26.0, -59], [25.2, -66.0], [24.55, -69.6], [24.3, -71.2]];
  // Catmull-Rom vyhlazení v Mercatoru + rozdělení na úseky stejné délky (plynulá, stálá rychlost)
  function spline(pts, perSeg = 24) {
    const P = pts.map(([lat, lon]) => [lon, mercY(lat)]), out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let k = 0; k < perSeg; k++) {
        const t = k / perSeg, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
      }
    }
    out.push(P[P.length - 1]);
    const len = [0]; for (let i = 1; i < out.length; i++) len.push(len[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    const total = len[len.length - 1];
    const at = (u) => {                       // u: 0–1 podél délky trasy
      const d = Math.min(1, Math.max(0, u)) * total; let lo = 0, hi = len.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (len[m] < d) lo = m; else hi = m; }
      const f = (d - len[lo]) / Math.max(1e-9, len[hi] - len[lo]);
      const x = out[lo][0] + (out[hi][0] - out[lo][0]) * f, y = out[lo][1] + (out[hi][1] - out[lo][1]) * f;
      return [invY(y), x];
    };
    return { at, total, path: (u) => { const n = Math.max(2, Math.round(u * 80)); return Array.from({ length: n + 1 }, (_, k) => at((k / n) * u)); } };
  }
  // rozjezd i dojezd plynule, uprostřed stálá rychlost
  const cruise = (k, r = 0.18) => { const v = 1 / (1 - r); if (k < r) return (v * k * k) / (2 * r); if (k > 1 - r) return 1 - (v * (1 - k) * (1 - k)) / (2 * r); return v * (k - r / 2); };
  const cruiseSpeed = (k, r = 0.18) => (k < r ? k / r : k > 1 - r ? (1 - k) / r : 1);
  // poloha na mapě bez zaokrouhlení na celé pixely (Leaflet zaokrouhluje → pomalý pohyb by poskakoval)
  const layerPt = (ll) => map.project(ll, map.getZoom()).subtract(map.getPixelOrigin());
  const placeIcon = (cls, html) => L.divIcon({ className: 'voyage-place ' + cls, html, iconSize: [0, 0] });
  // Plavba Kolumbovy flotily. sync = true: rok na ose běží s plavbou (1489 → 1492).
  // Vrací promise, která se splní hodnotou true po dokončení, nebo false při přerušení.
  function sail({ sync = false } = {}) {
    if (sailing) return sailing;
    let cancelled = false, cleanup = () => {}, finish = () => {};
    sailing = new Promise((resolve) => {
      // na telefonu (výška > šířka) se celá trasa vejde jen při velkém oddálení – hranice posunu mapy dočasně vypneme
      const mb = map.options.maxBounds, freeBounds = innerWidth < 760;
      finish = (ok) => { cleanup(); sailing = null; syncLanding(); if (freeBounds) setTimeout(() => { if (!sailing) map.setMaxBounds(mb); }, 1000); resolve(ok); };
      showBanner(`<p class="voyage">${T.voyagePalos}</p>`);
      let back = null;
      const begin = () => {
        if (cancelled) return;
        const s1 = spline(LEG1), s2 = spline(LEG2);
        // místa: přístav vyplutí, zastávka a přesné místo přistání
        const places = [
          L.marker(PALOS, { pane: 'ships', interactive: false, icon: placeIcon('start', `<i></i><span>${T.placePalos}</span>`) }),
          L.marker(GOMERA, { pane: 'ships', interactive: false, icon: placeIcon('stop', `<i></i><span>${T.placeGomera}</span>`) }),
          L.marker(GUANAHANI, { pane: 'ships', interactive: false, icon: placeIcon('land', `<i></i><span>${T.placeLanding}</span>`) }),
        ];
        places.forEach((p, i) => { p.addTo(map); if (i) p.getElement().classList.add('later'); });
        const route = L.polyline([], { pane: 'ships', color: '#7a2e12', weight: 2.5, opacity: 0.85, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(map);
        // na úzkém displeji (telefon) je oceán na mapě menší – lodě i rozestupy úměrně zmenšíme
        const sc = Math.max(0.5, Math.min(1, map.getSize().x / 1000));
        const ships = FLEET.map((f) => {
          const im = SHIP_IMG[f.kind], w = Math.round(f.w * sc), h = Math.round(w * im.ratio);
          const hx0 = im.hull[0] * w, hx1 = im.hull[1] * w, ax = (hx0 + hx1) / 2;   // kotva = střed trupu na čáře ponoru
          const html = `<div class="ship-move" style="width:${w}px;height:${h}px">
              <i class="ship-shadow" style="left:${hx0.toFixed(1)}px;width:${(hx1 - hx0).toFixed(1)}px"></i>
              <div class="ship-inner" style="transform-origin:${ax.toFixed(1)}px ${h}px"><img src="${im.src}" alt="" draggable="false"></div>
              <span class="ship-name" style="left:${ax.toFixed(1)}px">${f.name}</span></div>`;
          const icon = L.divIcon({ className: 'ship', html, iconSize: [w, h], iconAnchor: [ax, h - 1] });
          const m = L.marker(PALOS, { pane: 'ships', interactive: false, keyboard: false, icon }).addTo(map);
          const el = m.getElement(); el.style.opacity = '0';
          return { ...f, w, gap: f.gap * sc, side: f.side * sc, m, h, bow: hx0 - ax, stern: hx1 - ax, trail: [], move: el.querySelector('.ship-move'), inner: el.querySelector('.ship-inner') };
        });
        // plátno s brázdami a pěnou: leží pod loděmi, nad mapou
        const sea = L.DomUtil.create('canvas', 'sea-fx', map.getPane('seafx'));
        const ctx = sea.getContext('2d');
        const sizeSea = () => {
          const sz = map.getSize(), dpr = Math.min(2, devicePixelRatio || 1);
          sea.width = sz.x * dpr; sea.height = sz.y * dpr; sea.style.width = sz.x + 'px'; sea.style.height = sz.y + 'px';
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        sizeSea(); map.on('resize', sizeSea);
        cleanup = () => { ships.forEach((s) => s.m.remove()); places.forEach((p) => p.remove()); route.remove(); sea.remove(); map.off('resize', sizeSea); hideBanner(); };
        // délka obou úseků v pixelech (pro stálé rozestupy lodí v px)
        const pxLen = (sp) => { let L0 = 0, prev = layerPt(sp.at(0)); for (let k = 1; k <= 120; k++) { const q = layerPt(sp.at(k / 120)); L0 += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; } return L0; };
        const len1 = pxLen(s1), len2 = pxLen(s2);
        // časy (ms): 1. úsek, zastávka na Kanárech, přeplavba, čekání u břehu
        const T1 = 6500, STOP = 2200, T2 = 15000, HOLD = 14000, END = T1 + STOP + T2;
        // pořadí ve formaci: kolik „trasy“ (podíl délky) jede loď za vůdčí Pintou, a boční odstup v px
        let arrived = false, raf = 0, leaving = false, phase = 0;
        const t0 = performance.now();
        const leave = () => {
          if (leaving) return; leaving = true;
          cancelAnimationFrame(raf);
          ships.forEach((s) => s.m.getElement() && s.m.getElement().classList.add('gone'));
          sea.classList.add('gone');
          [route, ...places].forEach((l) => { const el = l.getElement && l.getElement(); if (el) el.classList.add('gone'); });
          hideBanner();
          setTimeout(() => {
            if (back) map.flyToBounds(back, { duration: 0.8 }); // zpět na původní výřez
            finish(true);
          }, 900);
        };
        const step = (now) => {
          if (cancelled) return;
          const t = now - t0;
          // poloha vůdčí lodi: úsek, parametr podél trasy a rychlost (0–1)
          let leg, u, v;
          if (t < T1) { leg = s1; const k = t / T1; u = cruise(k); v = cruiseSpeed(k); }
          else if (t < T1 + STOP) { leg = s1; u = 1; v = 0; }
          else { leg = s2; const k = Math.min(1, (t - T1 - STOP) / T2); u = cruise(k, 0.12); v = cruiseSpeed(k, 0.12); }
          const ph = t < T1 ? 0 : t < T1 + STOP ? 1 : t < END ? 2 : 3;
          if (ph !== phase) {
            phase = ph;
            if (ph === 1) { showBanner(`<p class="voyage">${T.voyageGomera}</p>`); places[1].getElement().classList.remove('later'); }
            if (ph === 2) { showBanner(`<p class="voyage">${T.voyageAtlantic}</p>`); places[2].getElement().classList.remove('later'); }
          }
          if (sync && !arrived) {
            const k = Math.min(1, t / END);
            const y = k < 1 ? Math.min(COLUMBUS - 1, VOYAGE_START + Math.floor((COLUMBUS - VOYAGE_START) * k)) : COLUMBUS;
            if (y !== state.year) setYear(y);
          }
          // vykreslená trasa za loděmi
          route.setLatLngs(leg === s1 ? s1.path(u) : s1.path(1).concat(s2.path(u)));
          const origin = map.containerPointToLayerPoint([0, 0]);
          L.DomUtil.setPosition(sea, origin);
          const anchor = map.latLngToLayerPoint(PALOS).round();
          // vzdálenost vůdčí Pinty od startu (px); ostatní jedou o svůj odstup za ní, u cíle se semknou
          const dLead = leg === s1 ? u * len1 : len1 + u * len2;
          const tighten = leg === s2 ? 1 - 0.35 * u : 1;
          ships.forEach((s) => {
            const d = dLead - s.gap * tighten;
            const onLeg1 = d < len1;
            const pos = onLeg1 ? s1.at(Math.max(0, d) / len1) : s2.at((d - len1) / len2);
            const p = layerPt(pos);
            // směr plavby této lodi (z bodu kousek před ní)
            const ahead = layerPt(onLeg1 ? s1.at(Math.min(1, (Math.max(0, d) + 6) / len1)) : s2.at(Math.min(1, (d - len1 + 6) / len2)));
            const dirS = Math.hypot(ahead.x - p.x, ahead.y - p.y) > 0.5 ? Math.atan2(ahead.y - p.y, ahead.x - p.x) : (s.dir ?? Math.PI);
            s.dir = dirS;
            const nx2 = -Math.sin(dirS), ny2 = Math.cos(dirS);
            const drift = Math.sin(now / 5200 + s.phase) * 2;                     // drobné vybočování z kurzu
            const x = p.x + nx2 * (s.side + drift), y = p.y + ny2 * (s.side + drift);
            // loď se objeví, až vypluje (zadní lodě vyplouvají postupně)
            const el = s.m.getElement();
            el.style.opacity = Math.max(0, Math.min(1, (d + 10) / 40)).toFixed(3);
            el.style.zIndex = String(Math.round(y));                                  // bližší (níž na obrazovce) loď přes vzdálenější
            const vS = d <= 0 ? 0 : v;
            // plynulý posun: marker zůstává na kotvě (Leaflet ho zaokrouhluje na celé pixely), loď posouváme přes transform
            s.move.style.transform = `translate3d(${(x - anchor.x).toFixed(2)}px, ${(y - anchor.y).toFixed(2)}px, 0)`;
            // houpání na vzdutí: náklon kolem čáry ponoru + zvedání a klesání (posunuté o čtvrt periody), k tomu drobné vlnky
            const sea0 = 0.6 + 0.4 * vS, w0 = (2 * Math.PI) / (s.period * 1000);
            const pitch = (Math.sin(now * w0 + s.phase) * s.pitch + Math.sin(now * w0 * 3.1 + s.phase * 2) * 0.22) * sea0;
            const heave = Math.cos(now * w0 + s.phase) * 1.1 * sea0;
            s.inner.style.transform = `translateY(${heave.toFixed(2)}px) rotate(${pitch.toFixed(3)}deg)`;
            // body pro brázdu: příď (odtud se rozbíhá vlna do V) a záď (vířící pěna), každých ~30 ms
            const last = s.trail[s.trail.length - 1];
            if (vS > 0.03 && (!last || now - last.t > 30)) s.trail.push({ bow: map.layerPointToLatLng(L.point(x + s.bow, y)), stern: map.layerPointToLatLng(L.point(x + s.stern * 0.95, y)), t: now, v: vS, dir: dirS });
            while (s.trail.length && now - s.trail[0].t > 3600) s.trail.shift();
            s.x = x; s.y = y; s.v = vS;
          });
          drawSea(ctx, sea, ships, origin, now);
          if (t >= END && !arrived) {
            // přistání: karta s nadpisem a základními fakty
            arrived = true;
            places[2].getElement().classList.add('arrived');
            const cont = $('play').dataset.on === '1' || sync;
            showBanner(`<button type="button" class="close" aria-label="×">×</button>
              <h2>${T.columbusTitle}</h2><p class="date">${T.columbusDate}</p>
              <ul>${T.columbusFacts.map((f) => `<li>${f}</li>`).join('')}</ul>
              <button type="button" class="go">${cont ? T.columbusContinue : T.columbusClose}</button>`, true);
            $('banner').querySelectorAll('.close, .go').forEach((b) => b.addEventListener('click', leave));
          }
          if (t > END + HOLD) return leave();
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      };
      // výřez mapy s celou trasou od Španělska po Bahamy
      back = map.getBounds();
      if (freeBounds) map.setMaxBounds(null);
      map.once('moveend', () => setTimeout(begin, 250));
      map.flyToBounds([[17, -86], [43, 4]], { duration: 1.1, paddingTopLeft: [20, 90], paddingBottomRight: [20, $('timeline').offsetHeight + 30] });
    });
    sailing.cancel = () => { cancelled = true; finish(false); };
    return sailing;
  }
  // Brázda (Kelvinova vlna): od přídě se rozbíhají dvě ramena pod úhlem ~19,5°, za zádí se táhne
  // pruh vířící pěny, který se rozšiřuje a slábne. U přídě zpěněná příďová vlna. Vše v pixelech obrazovky.
  const KELVIN = Math.tan((19.5 * Math.PI) / 180);
  function drawSea(ctx, sea, ships, origin, now) {
    const sz = map.getSize();
    ctx.clearRect(0, 0, sz.x, sz.y);
    const LIFE = 3600;
    const toPx = (ll) => { const lp = map.latLngToLayerPoint(ll); return { x: lp.x - origin.x, y: lp.y - origin.y }; };
    for (const s of ships) {
      if (s.x === undefined || !s.trail.length) continue;
      const k = s.w / 100;
      const bowNow = { x: s.x - origin.x + s.bow, y: s.y - origin.y };
      const sternNow = { x: s.x - origin.x + s.stern * 0.95, y: s.y - origin.y };
      const pts = s.trail.map((q) => {
        const b = toPx(q.bow), st = toPx(q.stern), age = (now - q.t) / LIFE;
        return { b, st, age, v: q.v, dir: q.dir, db: Math.hypot(b.x - bowNow.x, b.y - bowNow.y), ds: Math.hypot(st.x - sternNow.x, st.y - sternNow.y) };
      }).reverse();                                                   // od nejnovějšího
      // 1) pruh vířící pěny za zádí (hladký pás, rozšiřuje se a slábne)
      if (pts.length > 2) {
        const L0 = [], R0 = [];
        pts.forEach((p) => {
          const hw = (1.4 + p.ds * 0.05) * k;
          const px = -Math.sin(p.dir) * hw, py = Math.cos(p.dir) * hw;
          L0.push([p.st.x + px, p.st.y + py]); R0.push([p.st.x - px, p.st.y - py]);
        });
        const first = pts[0].st, lastP = pts[pts.length - 1].st;
        const g = ctx.createLinearGradient(first.x, first.y, lastP.x, lastP.y);
        g.addColorStop(0, `rgba(248, 252, 253, ${(0.62 * s.v).toFixed(3)})`);
        g.addColorStop(0.35, `rgba(235, 246, 250, ${(0.32 * s.v).toFixed(3)})`);
        g.addColorStop(1, 'rgba(230, 244, 250, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(sternNow.x, sternNow.y);
        L0.forEach(([x, y]) => ctx.lineTo(x, y));
        for (let i = R0.length - 1; i >= 0; i--) ctx.lineTo(R0[i][0], R0[i][1]);
        ctx.closePath(); ctx.fill();
      }
      // 2) ramena Kelvinovy vlny od přídě (odstup = vzdálenost za lodí × tg 19,5°)
      for (const sg of [-1, 1]) {
        let prev = null;
        for (const p of pts) {
          const spread = Math.min(p.db * KELVIN, 110 * k) * sg;
          const q = { x: p.b.x - Math.sin(p.dir) * spread, y: p.b.y + Math.cos(p.dir) * spread };
          if (prev) {
            const alpha = Math.pow(1 - p.age, 1.5) * 0.55 * p.v;
            if (alpha > 0.01) {
              ctx.strokeStyle = `rgba(242, 249, 252, ${alpha.toFixed(3)})`;
              ctx.lineWidth = (0.8 + p.age * 1.6) * k + 0.3; ctx.lineCap = 'butt';
              ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
            }
          }
          prev = q;
        }
      }
      // 3) drobné chuchvalce pěny na hřebenech vln (stabilní „náhoda“ podle času vzniku)
      s.trail.forEach((q, i) => {
        const r = (Math.sin(q.t * 0.0137 + s.phase * 7.3) + 1) / 2, age = (now - q.t) / LIFE;
        const alpha = Math.pow(1 - age, 2.2) * 0.5 * q.v * r;
        if (alpha < 0.04 || i % 2) return;
        const b = toPx(q.bow), db = Math.hypot(b.x - bowNow.x, b.y - bowNow.y), sg = r > 0.5 ? 1 : -1;
        const spread = Math.min(db * KELVIN, 110 * k) * sg * (0.85 + 0.15 * r);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(b.x - Math.sin(q.dir) * spread, b.y + Math.cos(q.dir) * spread, 0.5 + r * 0.9 * k, 0, 7); ctx.fill();
      });
      // 4) příďová vlna: pěna rozhrnutá přídí, pulzuje s houpáním
      if (s.v > 0.02) {
        const pulse = 0.8 + 0.2 * Math.sin(now / 280 + s.phase);
        const rx = (7 * k + 2) * pulse, ry = 2.2 * k + 0.8;
        const g = ctx.createRadialGradient(bowNow.x + rx * 0.3, bowNow.y, 0, bowNow.x + rx * 0.3, bowNow.y, rx);
        g.addColorStop(0, `rgba(255,255,255,${(0.8 * s.v).toFixed(3)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bowNow.x + rx * 0.3, bowNow.y, rx, ry, 0, 0, 7); ctx.fill();
      }
    }
  }
  // značka místa přistání – během plavby schovaná, aby nezakrývala lodě
  function syncLanding() { landing.setOpacity(state.year >= COLUMBUS && !state.all && !sailing ? 1 : 0); }
  function showBanner(html, card) {
    const b = $('banner');
    b.innerHTML = html; b.classList.toggle('card', !!card); b.hidden = false;
  }
  function hideBanner() { $('banner').hidden = true; $('banner').classList.remove('card'); }

  /* ---------- doplňkové vrstvy ---------- */
  // panel vrstev: výchozí stav sbalený, rozbalí se tlačítkem
  const setLayersOpen = (open) => {
    $('layers').classList.toggle('open', open); $('layers-btn').setAttribute('aria-expanded', String(open));
    store.set('layersOpen', open ? '1' : '0');
  };
  setLayersOpen(store.get('layersOpen') === '1');
  // panel vrstev drží kousek nad časovou osou (osa na mobilu mění výšku)
  const placeLayers = () => { const tl = $('timeline'); document.documentElement.style.setProperty('--layers-bottom', (innerHeight - tl.getBoundingClientRect().top + 10) + 'px'); };
  placeLayers(); addEventListener('resize', placeLayers);
  if (window.ResizeObserver) new ResizeObserver(placeLayers).observe($('timeline'));
  $('layers-btn').addEventListener('click', () => setLayersOpen(!$('layers').classList.contains('open')));
  $('lyr-territories').addEventListener('change', () => syncMap(true));
  $('lyr-labels').addEventListener('change', (e) => $('map').classList.toggle('no-labels', !e.target.checked));
  $('lyr-borders').addEventListener('change', (e) => (e.target.checked ? borders.addTo(map) : borders.remove()));

  function lazyGeoJson(checkboxId, url, style, popup, attribution) {
    let layer = null, loading = false;
    $(checkboxId).addEventListener('change', async (e) => {
      if (!e.target.checked) { if (layer) map.removeLayer(layer); return; }
      if (!layer && !loading) {
        loading = true;
        try {
          layer = L.geoJSON(await getJson(url), {
            pane: 'reservations', renderer: L.canvas({ pane: 'reservations', padding: 0.3 }), style,
            onEachFeature: (f, l) => l.bindPopup(() => popup(f.properties || {})), attribution,
          });
        } catch (err) { e.target.checked = false; alert(T.layerFail + url); return; } finally { loading = false; }
      }
      if (layer && e.target.checked) layer.addTo(map);
    });
  }
  const title = (s) => String(s || '').toLocaleLowerCase('en').replace(/(^|[\s\-–(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('en'));
  lazyGeoJson('lyr-res-us', 'data/reservations-us.geojson',
    { color: '#3a2a1c', weight: 0.8, fillColor: '#3a2a1c', fillOpacity: 0.3 },
    (p) => `<strong>${esc(p.name)}</strong><br>${T.resUs}`, 'U.S. Census Bureau 2023');
  lazyGeoJson('lyr-res-ca', 'data/reservations-ca.geojson',
    (f) => (f.properties.type === 'Land Claim'
      ? { color: '#1f4e5f', weight: 0.6, fillColor: '#1f4e5f', fillOpacity: 0.18 }
      : { color: '#3a2a1c', weight: 0.8, fillColor: '#3a2a1c', fillOpacity: 0.32 }),
    (p) => `<strong>${esc(title(p.name))}</strong><br>${p.type === 'Land Claim' ? T.claimCa : T.resCa} (${T.canada}${p.prov ? ', ' + esc(p.prov) : ''})`,
    'Natural Resources Canada');
  // volitelná vrstva Native Land Digital – zobrazí se jen pokud si soubor stáhnete (viz README)
  fetch('data/nativeland.geojson', { method: 'HEAD' }).then((r) => {
    if (!r.ok) return;
    $('lyr-nl-wrap').hidden = false;
    lazyGeoJson('lyr-nl', 'data/nativeland.geojson',
      (f) => ({ color: f.properties.color || '#555', weight: 0.8, fillColor: f.properties.color || '#555', fillOpacity: 0.12 }),
      (p) => `<strong>${esc(p.Name || p.name)}</strong><br>${T.nlPopup}${p.description ? `<br><a href="${esc(p.description)}" target="_blank" rel="noopener">${T.more}</a>` : ''}`,
      '<a href="https://native-land.ca">Native Land Digital</a>');
  }).catch(() => {});

  /* ---------- přepínač jazyka ---------- */
  function applyLang() {
    T = window.I18N[lang]; nf = new Intl.NumberFormat(T.locale);
    document.documentElement.lang = lang;
    document.title = T.docTitle;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = T[el.dataset.i18n]; });
    // přibalený podklad nemá města – jen hranice států
    if (LOCAL_BASE) document.querySelector('#lyr-borders + span').textContent = T.lyrBordersOnly;
    $('search').placeholder = T.searchPh; $('search').setAttribute('aria-label', T.searchPh);
    $('play').title = T.play; $('play').setAttribute('aria-label', T.play);
    $('about-body').innerHTML = T.aboutBody;
    $('help-body').innerHTML = T.helpBody;
    const famCols = Object.values(families).map((f) => f.color), sw = $('help-body').querySelector('.sw.fam');
    if (sw && famCols.length) sw.style.background = `linear-gradient(90deg, ${famCols.map((c, i) => `${c} ${(i / famCols.length * 100).toFixed(1)}% ${((i + 1) / famCols.length * 100).toFixed(1)}%`).join(', ')})`;
    $('help-btn').title = T.helpBtn; $('help-btn').setAttribute('aria-label', T.helpBtn);
    if (tour) showTourStep(tour.i);
    const src = lang === 'en' && en.sources && en.sources.length ? en.sources : data.sources || [];
    $('sources').innerHTML = src.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}${s.note ? ' – ' + esc(s.note) : ''}</li>`).join('');
    $('marks').innerHTML = `<button type="button" id="mark-columbus" style="left:${pct(COLUMBUS)}%" title="${esc(T.columbusTip)}"><b>1492</b> – ${esc(T.columbusMark)}</button>`;
    renderTimelineExtras();
    $('lang-btn').innerHTML = window.I18N.flags[lang] + '<span class="caret">▾</span>';
    $('lang-btn').setAttribute('aria-label', window.I18N.names[lang]);
    $('lang-menu').innerHTML = ['en', 'cs'].map((l) => `<li><button type="button" data-lang="${l}" aria-current="${l === lang}">${window.I18N.flags[l]}<span>${window.I18N.names[l]}</span></button></li>`).join('');
    map.attributionControl.removeAttribution(window.I18N.cs.attrApprox); map.attributionControl.removeAttribution(window.I18N.en.attrApprox);
    map.attributionControl.addAttribution(T.attrApprox);
    all.forEach((t) => { t.labelText = null; });
    renderFamilies();
    if (!$('music').hidden) syncMusicBtn();
    setYear(state.year, true);
  }
  const closeMenu = () => { $('lang-menu').hidden = true; $('lang-btn').setAttribute('aria-expanded', 'false'); };
  $('lang-btn').addEventListener('click', (e) => { e.stopPropagation(); const open = $('lang-menu').hidden; $('lang-menu').hidden = !open; $('lang-btn').setAttribute('aria-expanded', String(open)); });
  $('lang-menu').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]'); if (!b) return;
    lang = b.dataset.lang; store.set('lang', lang); closeMenu(); applyLang();
  });
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  /* ---------- nápověda a průvodce pro nové uživatele ---------- */
  $('help-btn').addEventListener('click', () => $('help-dlg').showModal());
  $('help-about').addEventListener('click', () => { $('help-dlg').close(); $('about').showModal(); });
  $('tour-start').addEventListener('click', () => { $('help-dlg').close(); startTour({ from: 1 }); });
  // největší území, které je právě vidět na mapě (pro krok „Území národů“)
  function bestTerritory() {
    const m = $('map').getBoundingClientRect(), tl = $('timeline').getBoundingClientRect();
    const box = { l: m.left + 30, r: m.right - 30, t: m.top + 70, b: Math.min(m.bottom, tl.top) - 60 };
    const maxW = Math.min(340, (box.r - box.l) * 0.6), maxH = Math.min(260, (box.b - box.t) * 0.45);
    let best = null, bestA = 0;
    for (const t of all) {
      if (!t.act || !t.layer || !t.layer._path || !map.hasLayer(t.layer)) continue;
      const r = t.layer._path.getBoundingClientRect();
      // celé ve viditelné části mapy a ne příliš velké – rámeček nemá zakrýt půl mapy
      if (r.left < box.l || r.right > box.r || r.top < box.t || r.bottom > box.b || r.width > maxW || r.height > maxH) continue;
      if (r.width * r.height > bestA) { bestA = r.width * r.height; best = r; }
    }
    return best;
  }
  function tourTargets(i) {
    switch (i) {
      case 1: return [$('year').closest('.slider-wrap')];
      case 2: return [$('play'), document.querySelector('.year-box')];
      case 3: return [$('marks')];
      case 4: return [bestTerritory() || $('map')];
      case 5: return [$('sidebar-toggle')];
      case 6: return [$('layers')];
      case 7: return [$('help'), $('music'), $('lang')].filter((el) => !el.hidden);
      default: return [];
    }
  }
  function placeTour() {
    if (!tour) return;
    const el = $('tour'), hole = el.querySelector('.tour-hole'), card = el.querySelector('.tour-card');
    const vw = innerWidth, vh = innerHeight, pad = 6, m = 14;
    const rs = tourTargets(tour.i).map((x) => (x.getBoundingClientRect ? x.getBoundingClientRect() : x)).filter((r) => r && r.width > 0 && r.height > 0);
    let r = null;
    if (rs.length) {
      r = { left: Math.min(...rs.map((q) => q.left)) - pad, top: Math.min(...rs.map((q) => q.top)) - pad, right: Math.max(...rs.map((q) => q.right)) + pad, bottom: Math.max(...rs.map((q) => q.bottom)) + pad };
      r.left = Math.max(4, r.left); r.top = Math.max(4, r.top); r.right = Math.min(vw - 4, r.right); r.bottom = Math.min(vh - 4, r.bottom);
      Object.assign(hole.style, { left: r.left + 'px', top: r.top + 'px', width: r.right - r.left + 'px', height: r.bottom - r.top + 'px' });
    } else Object.assign(hole.style, { left: vw / 2 + 'px', top: vh / 2 + 'px', width: '0px', height: '0px' });
    hole.classList.toggle('none', !r);
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let x, y;
    const cx = r ? (r.left + r.right) / 2 - cw / 2 : 0, cy = r ? (r.top + r.bottom) / 2 - ch / 2 : 0;
    if (!r) { x = (vw - cw) / 2; y = (vh - ch) / 2; }
    else if (vh - r.bottom >= ch + 2 * m) { x = cx; y = r.bottom + m; }
    else if (r.top >= ch + 2 * m) { x = cx; y = r.top - m - ch; }
    else if (vw - r.right >= cw + 2 * m) { x = r.right + m; y = cy; }
    else if (r.left >= cw + 2 * m) { x = r.left - m - cw; y = cy; }
    else { x = (vw - cw) / 2; y = vh - ch - m; }
    card.style.left = Math.round(Math.max(12, Math.min(vw - cw - 12, x))) + 'px';
    card.style.top = Math.round(Math.max(12, Math.min(vh - ch - 12, y))) + 'px';
  }
  function showTourStep(i) {
    const el = $('tour'), steps = T.tour, s = steps[i], last = i === steps.length - 1;
    tour.i = i;
    el.classList.toggle('welcome', i === 0);
    el.querySelector('.tour-step').textContent = i ? T.tourOf(i, steps.length - 1) : '';
    el.querySelector('h3').innerHTML = s.t;
    el.querySelector('.tour-text').innerHTML = (typeof s.x === 'function' ? s.x(nations.length) : s.x) + (s.kbd && !isTouch ? s.kbd : '');
    el.querySelector('.tour-dots').innerHTML = steps.slice(1).map((_, k) => `<i class="${k + 1 === i ? 'on' : ''}"></i>`).join('');
    const skip = el.querySelector('.tour-skip'), prev = el.querySelector('.tour-prev'), next = el.querySelector('.tour-next');
    skip.textContent = i === 0 ? T.tourSelf : T.tourSkip; skip.hidden = last;
    prev.textContent = T.tourPrev; prev.hidden = i <= 1;
    next.textContent = i === 0 ? T.tourGo : last ? T.tourDone : T.tourNext;
    requestAnimationFrame(placeTour);
    next.focus({ preventScroll: true });
  }
  function startTour(opts = {}) {
    closeFlag(); closeMenu(); stop(); if (sailing) sailing.cancel();
    if (document.body.classList.contains('side-open') && matchMedia('(max-width: 820px)').matches) $('sidebar-toggle').click();
    tour = { i: 0, first: !!opts.first, then: opts.then };
    const el = $('tour'); el.hidden = false;
    showTourStep(opts.from || 0);
    requestAnimationFrame(() => el.classList.add('on'));
  }
  function endTour(finished) {
    if (!tour) return;
    const { first, then } = tour; tour = null;
    store.set('tourSeen', '1');
    const el = $('tour'); el.classList.remove('on'); setTimeout(() => { if (!tour) el.hidden = true; }, 320);
    if (first && !finished) toast(T.tourLater, 7000);
    if (then) then();
  }
  $('tour').addEventListener('click', (e) => {
    if (!tour) return;
    if (e.target.closest('.tour-next')) { if (tour.i === T.tour.length - 1) endTour(true); else showTourStep(tour.i + 1); }
    else if (e.target.closest('.tour-prev')) showTourStep(Math.max(1, tour.i - 1));
    else if (e.target.closest('.tour-skip')) endTour(false);
  });
  document.addEventListener('keydown', (e) => {
    if (!tour) return;
    if (e.key === 'Escape') { e.preventDefault(); endTour(false); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); $('tour').querySelector('.tour-next').click(); }
    else if (e.key === 'ArrowLeft' && tour.i > 1) { e.preventDefault(); showTourStep(tour.i - 1); }
    else if (e.key === 'Tab') {   // fokus zůstane v kartě průvodce
      const bs = [...$('tour').querySelectorAll('.tour-actions button:not([hidden])')];
      const k = bs.indexOf(document.activeElement); e.preventDefault();
      bs[(k + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
    }
  });
  addEventListener('resize', () => { if (tour) placeTour(); });

  /* ---------- ostatní ---------- */
  $('about-btn').addEventListener('click', () => $('about').showModal());
  // levé menu: tlačítko ho zavře / otevře (na počítači se mapa roztáhne na celou šířku)
  const syncSideBtn = () => { const open = document.body.classList.contains('side-open'); $('sidebar-toggle').setAttribute('aria-expanded', String(open)); $('sidebar-toggle').title = open ? T.sideClose : T.sideOpen; };
  new MutationObserver(syncSideBtn).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  $('sidebar-toggle').addEventListener('click', () => {
    const open = !document.body.classList.contains('side-open');
    document.body.classList.toggle('side-open', open); store.set('sideOpen', open ? '1' : '0');
  });
  $('sidebar').addEventListener('transitionend', (e) => { if (e.target === $('sidebar')) map.invalidateSize({ pan: false }); });
  if (store.get('sideOpen') === '1' && innerWidth > 820) document.body.classList.add('side-open');
  syncSideBtn();
  window.addEventListener('hashchange', () => select(decodeURIComponent(location.hash.slice(1)) || null, { fly: true }));

  /* ---------- úvod: nápis za horami ---------- */
  // Fotka 2400×1600 je oříznutá jako object-fit: cover. Spočítáme, kde leží vrcholky,
  // a nápis posadíme tak, aby mu hory zakrývaly spodní část písmen.
  function placeTitle() {
    const W = innerWidth, H = innerHeight, iw = 2400, ih = 1600, s = Math.max(W / iw, H / ih);
    const top = (H - ih * s) / 2, dispH = ih * s;
    const narrow = W / H < 0.9;                             // na výšku: nápis na dva řádky
    const t = $('intro-title');
    t.classList.toggle('two', narrow);
    const fs = narrow ? Math.min(W / 5.6, dispH * 0.12) : Math.min(dispH * 0.15, W / 7.6);
    const lines = narrow ? 2 : 1, lh = fs * 0.98;
    // vrcholky (nejvyšší Grand Teton) jsou na ~16 % výšky fotky, hřebeny kolem 22 %:
    // spodek posledního řádku ~2 % pod hřebeny, takže hory zakryjí jen spodní část písmen
    // na mobilu je vidět jen střed fotky s nejvyššími štíty – nápis tam musí výš
    const bottom = top + dispH * (narrow ? 0.205 : 0.24);
    t.style.setProperty('--fs', fs.toFixed(1) + 'px');
    t.style.setProperty('--ty', (bottom - lh * (lines - 1) - fs * 0.82).toFixed(1) + 'px');
  }
  placeTitle(); addEventListener('resize', placeTitle);

  /* ---------- úvod: přelet orla se zvukem ---------- */
  // Zvuk smí stránka pustit až po kliknutí uživatele – proto úvodní tlačítko.
  const cry = new Audio('media/eagle.mp3');
  cry.preload = 'auto'; cry.volume = 0.9;
  // hudba v pozadí (indiánská flétna + noční kaňon), hraje dokola od konce přeletu orla
  const music = new Audio('media/music.mp3');
  music.loop = true; music.preload = 'auto'; music.volume = 0;
  let musicOn = store.get('music') !== 'off';
  const TRACKS = {
    flute: 'media/music.mp3',
  };
  let track = TRACKS[store.get('track')] ? store.get('track') : 'flute';
  music.src = TRACKS[track];
  const MUSIC_VOL = 0.5;
  function fadeMusic(to, ms) {
    const from = music.volume, t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / ms); music.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function syncMusicBtn() {
    const b = $('music-btn');
    b.innerHTML = `<span class="note">${musicOn ? '♪' : '♪̸'}</span><span class="caret">▾</span>`;
    b.classList.toggle('off', !musicOn);
    b.title = T.musicChoose; b.setAttribute('aria-label', T.musicChoose);
    const items = [
      ['flute', T.musicFlute, musicOn && track === 'flute'],
      ['off', T.musicNone, !musicOn],
    ];
    $('music-menu').innerHTML = items.map(([id, label, cur]) => `<li><button type="button" data-track="${id}" aria-current="${cur}"><span class="tick">${cur ? '✓' : ''}</span>${esc(label || id)}</button></li>`).join('');
  }
  function playMusic(fadeMs) { if (document.hidden) return; music.play().catch(() => {}); fadeMusic(MUSIC_VOL, fadeMs); }
  function startMusic() {
    $('music').hidden = false; syncMusicBtn();
    musicStarted = true;
    if (!musicOn || document.hidden) { music.pause(); return; }
    music.currentTime = 0; playMusic(4000);
  }
  function switchTrack(src) {
    fadeMusic(0, 400);
    setTimeout(() => { music.src = src; music.currentTime = 0; music.volume = 0; if (musicOn) playMusic(1500); }, 420);
  }
  // hudba hraje jen když je aplikace vidět: při zavření, minimalizaci nebo přepnutí záložky se zastaví
  let musicStarted = false;
  function pauseAll() { music.pause(); cry.pause(); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAll();
    else if (musicOn && musicStarted) { music.volume = 0; playMusic(1500); }
  });
  window.addEventListener('pagehide', pauseAll);
  window.addEventListener('beforeunload', pauseAll);
  const closeMusicMenu = () => { $('music-menu').hidden = true; $('music-btn').setAttribute('aria-expanded', 'false'); };
  $('music-btn').addEventListener('click', (e) => {
    e.stopPropagation(); const open = $('music-menu').hidden; syncMusicBtn();
    $('music-menu').hidden = !open; $('music-btn').setAttribute('aria-expanded', String(open));
  });
  $('music-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('button[data-track]'); if (!b) return;
    const id = b.dataset.track;
    if (id === 'off') { musicOn = false; store.set('music', 'off'); fadeMusic(0, 600); setTimeout(() => { if (!musicOn) music.pause(); }, 650); }
    else {
      const was = musicOn; musicOn = true; store.set('music', 'on'); store.set('track', id);
      if (id !== track) { track = id; switchTrack(TRACKS[id]); }
      else if (!was) playMusic(1500);
    }
    syncMusicBtn(); closeMusicMenu();
  });
  document.addEventListener('click', closeMusicMenu);
  $('intro-go').addEventListener('click', () => {
    const intro = $('intro');
    intro.classList.add('go');
    // osa na začátek už teď, aby orel za sebou odkryl mapu z roku 1000 (odkaz na konkrétní národ #… nechat být)
    const autoplay = location.hash.length <= 1;
    if (autoplay) { stop(); select(null); setYear(YEAR_MIN, true); }
    intro.dataset.autoplay = autoplay ? '1' : '';
    // Safari pustí zvuk jen při kliknutí – hudbu proto spustíme hned (potichu) a nahlas až po přeletu
    if (musicOn) { music.volume = 0; music.play().catch(() => {}); }
    const reveal = () => { intro.classList.add('fade'); setTimeout(() => { intro.hidden = true; startMusic(); afterIntro(); }, 1400); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { reveal(); return; }
    const imgs = [...$('eagle').querySelectorAll('img')];
    const ready = () => imgs.every((im) => im.complete && im.naturalWidth);
    const start = () => flyEagle($('eagle'), imgs[2].naturalWidth / imgs[2].naturalHeight, reveal);
    if (ready()) start();
    else Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; })))).then(() => (ready() ? start() : reveal()));
  });
  // Průlet nad krajinou (pohled shora): orel letí zleva doprava, rozpětí křídel přes skoro celou výšku okna.
  // Během průletu zakřičí a béžové pozadí se rozplyne – objeví se mapa.
  function flyEagle(el, ratio, reveal) {
    const W = innerWidth, H = innerHeight;
    const eh = H * 0.9, ew = eh * ratio;                    // výška obrázku = rozpětí křídel
    el.style.height = eh + 'px'; el.style.width = ew + 'px';
    el.hidden = false;
    const DUR = 5200;
    const at = (k) => [-ew * 0.8 + (W + ew * 1.6) * k, H * (0.52 - 0.06 * k) + Math.sin(k * Math.PI * 1.6) * H * 0.05];
    const frames = [];
    for (let n = 0; n <= 40; n++) {
      const k = n / 40, [x, y] = at(k), [x2, y2] = at(Math.min(1, k + 0.01)), [x1, y1] = at(Math.max(0, k - 0.01));
      const heading = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;   // natočení po směru letu
      const s = 0.9 + 0.1 * Math.sin(k * Math.PI);                       // uprostřed o kousek blíž
      frames.push({ offset: k, transform: `translate(${(x - ew / 2).toFixed(1)}px, ${(y - eh / 2).toFixed(1)}px) rotate(${heading.toFixed(2)}deg) scale(${s.toFixed(3)})` });
    }
    const anim = el.animate(frames, { duration: DUR, easing: 'linear', fill: 'forwards' });
    flapWings(el, DUR);
    // dvojí výkřik s ozvěnou (~5 s): první zazní, když orel přilétá, druhý uprostřed průletu
    setTimeout(() => { cry.currentTime = 0; cry.play().catch(() => {}); }, DUR * 0.15);
    // orel za sebou „vytahuje“ mapu: béžová vrstva se odkrývá zleva přesně za ním
    const intro = $('intro');
    intro.classList.add('wipe');
    const wipe = () => {
      const k = Math.min(1, (anim.currentTime || 0) / DUR);
      intro.style.setProperty('--edge', (at(k)[0] - ew * 0.15).toFixed(0) + 'px');
      if (k < 1 && anim.playState !== 'finished') requestAnimationFrame(wipe);
    };
    requestAnimationFrame(wipe);
    anim.onfinish = () => {
      el.hidden = true; el.getAnimations({ subtree: true }).forEach((x) => x.cancel());
      intro.hidden = true; intro.classList.remove('wipe');
      startMusic();
      afterIntro();
    };
  }
  // po úvodu: časová osa od roku 1000 se sama rozběhne
  function afterIntro() {
    const auto = $('intro').dataset.autoplay === '1';
    const go = () => { if (auto) setTimeout(() => { if (state.year === YEAR_MIN && $('play').dataset.on !== '1') startPlay(); }, 600); };
    // poprvé: nabídnout krátkého průvodce, čas se pustí až po něm
    if (store.get('tourSeen') !== '1') { setTimeout(() => startTour({ first: true, then: go }), 700); return; }
    go();
  }
  // Mávání při pohledu shora: při zdvihu i záběru se křídla zkracují (míří k nám / od nás).
  // Zdvih je pomalejší, záběr dolů rychlý a při něm se orel zvedne (je o kousek blíž = větší).
  function flapWings(el, DUR) {
    const BEAT = 520;                                       // ms na úder (orel bělohlavý ~2 údery/s)
    const series = [[0.0, 4], [0.55, 3]];                   // [začátek jako podíl letu, počet úderů]
    const pts = [[0, 0]];                                   // [čas 0–1, poloha: 1 nahoře, -1 dole, 0 plachtění]
    series.forEach(([t0, n]) => {
      const b = BEAT / DUR;
      pts.push([t0, 0]);
      for (let i = 0; i < n; i++) { const t = t0 + i * b; pts.push([t + b * 0.25, 1], [t + b * 0.5, 0], [t + b * 0.72, -1]); }
      pts.push([t0 + n * b + b * 0.3, 0]);
    });
    pts.push([1, 0]);
    const uniq = pts.sort((p, q) => p[0] - q[0]).filter((p, i, arr) => i === 0 || p[0] > arr[i - 1][0] + 1e-4);
    const opt = { duration: DUR, easing: 'ease-in-out', fill: 'forwards' };
    // nahoře: křídla zvednutá k nám – kratší rozpětí, širší (blíž); dole: kratší rozpětí, užší (dál)
    const wingKf = uniq.map(([o, v]) => ({ offset: Math.min(1, o), transform: `scale(${(1 + 0.06 * v).toFixed(3)}, ${(1 - 0.38 * Math.abs(v)).toFixed(3)})` }));
    el.querySelectorAll('.e-wing').forEach((w) => w.animate(wingKf, opt));
    el.querySelector('.eagle-inner').animate(uniq.map(([o, v]) => ({ offset: Math.min(1, o), transform: `scale(${(1 - 0.025 * v).toFixed(3)})` })), opt);
  }

  applyLang();
  if (location.hash.length > 1) select(decodeURIComponent(location.hash.slice(1)), { fly: true });
})();
