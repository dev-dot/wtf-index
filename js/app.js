import { CONFIG } from "./config.js";
import { createBackend } from "./backend.js";
import { ITEMS, isBeer, currentPrices, fmt, fmtShort, esc } from "./model.js";

const DRINKS = { wasser: 1, bier3: 1, bier: 1 };

/* ---------- State ---------- */
let VENUES = [];
let reports = [];
let backend = null;
let current = ITEMS[location.hash.slice(1)] ? location.hash.slice(1) : "doener";
let selected = null;

const $ = id => document.getElementById(id);
const fmtDate = ts => new Date(ts).toLocaleDateString("de-DE", { day: "numeric", month: "short" });

/* ---------- Preislogik ---------- */
function reportsFor(vid, it) {
  return reports.filter(r => r.venueId === vid && r.item === it).sort((a, b) => b.createdAt - a.createdAt);
}
function effective(v, it) {
  if (it === "pizza" && v.type !== "Pizzeria") return null; // Pizza-Index: nur Pizzerien
  const menu = v.prices[it];
  const menuTs = menu ? Date.parse(menu.validFrom + "T12:00:00") : 0;
  const r = reportsFor(v.id, it)[0];
  if (r && (!menu || r.createdAt >= menuTs)) return { price: r.price, src: "crowd", ts: r.createdAt, tap: r.tap, note: r.note };
  if (!menu) return null;
  return { price: menu.price, src: "menu", ts: menuTs, tap: menu.tap, old: !!menu.outdated, note: menu.note, p: menu };
}
function median(a) {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
}
function verdict(f) { return f < 0.95 ? ["fair", "Fair"] : f <= 1.12 ? ["meh", "Geht so"] : ["wtf", "WTF?!"]; }
function rows() {
  const all = VENUES.map(v => ({ v, e: effective(v, current) }));
  const r = all.filter(x => x.e);
  const open = all.filter(x => !x.e && (DRINKS[current] || (x.v.wanted || []).includes(current))).map(x => x.v)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const med = median(r.map(x => x.e.price));
  r.forEach(x => { x.f = x.e.price / med; x.vd = verdict(x.f); });
  r.sort((a, b) => a.e.price - b.e.price || a.v.name.localeCompare(b.v.name, "de"));
  return { r, med, open };
}
function tapLabel(e, sep) { return e.tap === "b" ? sep + "Flasche" : e.tap === "f" ? sep + "Fass" : ""; }
function srcLabel(v, e, sep) {
  if (e.src === "crowd") return '<span class="src crowd">Besucher-Meldung' + sep + fmtDate(e.ts) + "</span>";
  const stand = e.p.standLabel || new Date(e.ts).toLocaleDateString("de-DE", { month: "2-digit", year: "numeric" });
  return '<span class="src">' + esc(e.p.sourceLabel || "Quelle unbekannt") + sep + "Stand " + esc(stand) +
    (e.old ? ' <span class="old">alte Karte</span>' : "") + "</span>";
}

/* ---------- Karte ---------- */
const map = L.map("map", { zoomSnap: 0.25, minZoom: 11, maxZoom: CONFIG.tileMaxZoom });
L.tileLayer(CONFIG.tileUrl, { attribution: CONFIG.tileAttribution, maxZoom: CONFIG.tileMaxZoom }).addTo(map);
map.attributionControl.setPrefix(false);
map.setView([48.7758, 9.1829], 12);
const pinLayer = L.layerGroup().addTo(map);
const markers = {};

function popupHtml(v) {
  const its = Object.keys(ITEMS).map(it => ({ it, e: effective(v, it) })).filter(x => x.e);
  const rep = reportsFor(v.id, current).slice(0, 3);
  const hasCur = its.some(x => x.it === current);
  const osm = v.location ? `https://www.openstreetmap.org/?mlat=${v.location.lat}&amp;mlon=${v.location.lon}#map=18/${v.location.lat}/${v.location.lon}` : null;
  return '<div class="pop"><h3>' + esc(v.name) + '</h3><div class="meta">' + esc(v.type) + " · " + esc(v.address) + ", " + esc(v.district) + "</div>" +
    (its.length ? "<table>" + its.map(x => '<tr class="' + (x.it === current ? "cur" : "") + '"><td>' + ITEMS[x.it].title +
      (isBeer(x.it) && x.e.tap ? " (" + tapLabel(x.e, "").trim() + ")" : "") +
      (x.e.note ? '<br><span class="src">' + esc(x.e.note) + "</span>" : "") + "<br>" + srcLabel(v, x.e, ", ") +
      "</td><td>" + fmt(x.e.price) + "</td></tr>").join("") + "</table>" : "") +
    (hasCur ? "" : '<div class="reports">' + (v.notes[current] ? esc(v.notes[current]) : "Noch kein Preis für " + ITEMS[current].title + ".") + "</div>") +
    (rep.length ? '<div class="reports"><b>Letzte Meldungen · ' + ITEMS[current].title + "</b>" +
      rep.map(r => fmt(r.price) + " am " + fmtDate(r.createdAt) + (r.note ? " – „" + esc(r.note) + "“" : "")).join("<br>") + "</div>" : "") +
    '<div class="reports">' + (v.prices[current] && v.prices[current].sourceUrl ? '<a href="' + esc(v.prices[current].sourceUrl) + '" target="_blank" rel="noopener">Quelle: ' + esc(v.prices[current].sourceLabel || "Link") + " ↗</a><br>" : "") +
    (osm ? '<a href="' + osm + '" target="_blank" rel="noopener">In OpenStreetMap ansehen ↗</a>' : "") + "</div>" +
    '<button type="button" data-report="' + v.id + '">Preis für ' + ITEMS[current].label + " melden</button></div>";
}
function addPin(v, html, title, z) {
  if (!v.location) return;
  const m = L.marker([v.location.lat, v.location.lon], {
    icon: L.divIcon({ className: "", html, iconSize: null, popupAnchor: [0, -30] }), title, riseOnHover: true, zIndexOffset: z,
  });
  m.bindPopup(() => popupHtml(v), { maxWidth: 290 });
  m.on("click", () => select(v.id, false));
  m.on("popupclose", () => { if (selected === v.id) { selected = null; renderList(); } });
  pinLayer.addLayer(m);
  markers[v.id] = m;
}

/* ---------- Rendering ---------- */
function render() {
  const { r, med, open } = rows();
  document.querySelectorAll(".chip").forEach(c => {
    c.setAttribute("aria-pressed", c.dataset.it === current);
    const n = VENUES.filter(v => effective(v, c.dataset.it)).length;
    c.querySelector("small").textContent = n ? n + " Preis" + (n === 1 ? "" : "e") : "noch leer";
  });
  pinLayer.clearLayers();
  for (const k in markers) delete markers[k];
  r.forEach(x => addPin(x.v,
    '<span class="pin p-' + x.vd[0] + (selected === x.v.id ? " sel" : "") + '">' + fmtShort(x.e.price) +
      (x.e.src === "crowd" ? '<span class="c" title="Besucher-Meldung">●</span>' : "") + "</span>",
    x.v.name + ": " + fmt(x.e.price), selected === x.v.id ? 1000 : Math.round(x.f * 100)));
  open.forEach(v => addPin(v, '<span class="pin p-none' + (selected === v.id ? " sel" : "") + '">?</span>', v.name + ": noch kein Preis", 0));

  const it = ITEMS[current], worst = r[r.length - 1], best = r[0];
  const oldN = r.filter(x => x.e.old).length;
  $("summary").innerHTML = "<h1>" + (it.emoji ? '<span class="emo" aria-hidden="true">' + it.emoji + "</span> " : "") + it.title + '-Index</h1><div class="spec">' + it.spec + "</div>" +
    (r.length
      ? '<div class="stats"><div class="stat"><span>Günstigst</span><b>' + fmt(best.e.price) + '</b></div><div class="stat"><span>Median</span><b>' + fmt(med) +
        '</b></div><div class="stat"><span>Teuerst</span><b>' + fmt(worst.e.price) + "</b></div></div>" +
        (r.length > 2 && worst.vd[0] === "wtf" ? '<div class="worst">Größter WTF: <strong>' + esc(worst.v.name) + "</strong> verlangt das " +
          worst.f.toFixed(2).replace(".", ",") + "-Fache des Medians.</div>" : "") +
        (oldN ? '<div class="spec">' + oldN + " von " + r.length + " Preisen stammen aus alten Karten.</div>" : "")
      : '<div class="empty-state"><b>Noch keine Preise.</b> Warst du in einem der Lokale? Dann melde den ersten Preis.' +
        '<button type="button" class="btn primary" id="emptyReport">Ersten Preis melden</button></div>');
  const er = $("emptyReport"); if (er) er.addEventListener("click", () => openSheet(null, current));
  renderList({ r, open });
}
function renderList(data) {
  const { r, open } = data || rows();
  $("list").innerHTML = r.map((x, i) =>
    '<li class="row' + (selected === x.v.id ? " active" : "") + '" data-id="' + x.v.id + '" tabindex="0" role="button" aria-label="' + esc(x.v.name) + ", " + fmt(x.e.price) + '">' +
    '<span class="rank">' + String(i + 1).padStart(2, "0") + "</span>" +
    '<span class="who"><b>' + esc(x.v.name) + "</b><small>" + esc(x.v.district) + " · " + esc(x.v.type) + (isBeer(current) ? tapLabel(x.e, " · ") : "") +
    "</small><br>" + srcLabel(x.v, x.e, " · ") + "</span>" +
    '<span class="price">' + fmt(x.e.price) + '<br><span class="verdict v-' + x.vd[0] + '">' + x.vd[1] + "</span></span></li>").join("") +
    (open.length ? '<li class="sep">Noch ohne Preis · ' + open.length + "</li>" + open.map(v =>
      '<li class="row' + (selected === v.id ? " active" : "") + '" data-id="' + v.id + '" tabindex="0" role="button" aria-label="' + esc(v.name) + ', noch kein Preis">' +
      '<span class="rank">–</span><span class="who"><b>' + esc(v.name) + "</b><small>" + esc(v.district) + " · " + esc(v.type) + "</small>" +
      (v.notes[current] ? '<br><span class="src">' + esc(v.notes[current]) + "</span>" : "") + "</span>" +
      '<span class="price muted">?</span></li>').join("") : "");
  for (const id in markers) {
    const el = markers[id].getElement();
    const p = el && el.querySelector(".pin");
    if (p) p.classList.toggle("sel", id === selected);
  }
}
function select(id, fly) {
  selected = id; renderList();
  const m = markers[id];
  if (!m) return;
  if (fly) { map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.5 }); setTimeout(() => m.openPopup(), 550); }
  const row = document.querySelector('.row[data-id="' + id + '"]');
  if (row && !fly) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function setItem(it) {
  if (!ITEMS[it]) return;
  current = it; selected = null; map.closePopup();
  history.replaceState(null, "", "#" + it);
  render();
}

/* ---------- Bedienung ---------- */
$("switch").innerHTML = Object.entries(ITEMS).map(([k, v]) =>
  '<button type="button" class="chip" data-it="' + k + '" aria-pressed="false"><b>' + (v.emoji ? '<span class="emo" aria-hidden="true">' + v.emoji + "</span> " : "") + v.label + "</b><small>" + v.chip + "</small></button>").join("");
$("switch").addEventListener("click", e => { const c = e.target.closest(".chip"); if (c) setItem(c.dataset.it); });
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (ITEMS[h] && h !== current) setItem(h); });
$("list").addEventListener("click", e => { const r = e.target.closest(".row"); if (r) select(r.dataset.id, true); });
$("list").addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("row")) { e.preventDefault(); select(e.target.dataset.id, true); }
});
$("map").addEventListener("click", e => { const b = e.target.closest("[data-report]"); if (b) openSheet(b.dataset.report, current); });

/* ---------- Preis melden ---------- */
const fVenue = $("fVenue"), fItem = $("fItem"), fPrice = $("fPrice"), fNote = $("fNote"), fMsg = $("fMsg"), fSubmit = $("fSubmit");
function showMsg(t, err) { fMsg.hidden = !t; fMsg.textContent = t || ""; fMsg.className = "msg" + (err ? " err" : ""); }
function syncItem() { $("tapField").hidden = !isBeer(fItem.value); $("fItemHint").textContent = ITEMS[fItem.value].spec; }
fItem.innerHTML = Object.entries(ITEMS).map(([k, v]) => '<option value="' + k + '">' + v.title + "</option>").join("");
fItem.addEventListener("change", syncItem);
function openSheet(vid, it) {
  if (vid) fVenue.value = vid;
  fItem.value = it || current; syncItem();
  const v = VENUES.find(x => x.id === fVenue.value);
  const e = v && effective(v, fItem.value);
  fPrice.value = ""; fPrice.placeholder = e ? "aktuell " + fmtShort(e.price) : "z. B. 5,40"; fNote.value = "";
  fSubmit.disabled = !backend; showMsg(backend ? "" : "Meldungen sind gerade nicht verfügbar.", !backend);
  $("sheetBg").hidden = false; setTimeout(() => fPrice.focus(), 30);
}
function closeSheet() { $("sheetBg").hidden = true; }
$("fab").addEventListener("click", () => openSheet(selected, current));
$("fCancel").addEventListener("click", closeSheet);
$("sheetBg").addEventListener("click", e => { if (e.target === $("sheetBg")) closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("sheetBg").hidden) closeSheet(); });
$("sheet").addEventListener("submit", async e => {
  e.preventDefault();
  const price = parseFloat(String(fPrice.value).replace(",", "."));
  if (!(price >= 0.5 && price <= 60)) { showMsg("Bitte einen Preis zwischen 0,50 € und 60 € eingeben.", true); fPrice.focus(); return; }
  const r = { venueId: fVenue.value, item: fItem.value, price: Math.round(price * 100) / 100 };
  if (isBeer(r.item)) r.tap = $("fTapB").checked ? "b" : "f";
  const note = fNote.value.trim().slice(0, 120); if (note) r.note = note;
  fSubmit.disabled = true; showMsg("Wird gespeichert …");
  try {
    await backend.addReport(r);
    closeSheet();
    toast("Danke! Deine Meldung wird geprüft und erscheint nach der Freigabe.");
  } catch (err) {
    console.error(err);
    fSubmit.disabled = false;
    showMsg("Speichern hat nicht geklappt. Bitte gleich noch einmal versuchen.", true);
  }
});
let toastT;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 3600); }

/* ---------- Start ---------- */
async function boot() {
  const boundary = fetch("data/stuttgart-boundary.json").then(r => r.json()).catch(() => null);
  try {
    backend = await createBackend();
    const data = await backend.loadAll();
    const cur = currentPrices(data.prices);
    VENUES = data.venues.map(v => {
      const prices = {};
      for (const it of Object.keys(ITEMS)) if (cur[v.id + "|" + it]) prices[it] = cur[v.id + "|" + it];
      return { ...v, prices };
    });
    reports = data.reports.filter(r => VENUES.some(v => v.id === r.venueId) && ITEMS[r.item] && r.price >= 0.5 && r.price <= 60);
    if (backend.mode === "local") $("foot").insertAdjacentHTML("beforeend", "<p>Lokaler Modus: Meldungen bleiben in diesem Browser und erscheinen nach Freigabe unter admin.html.</p>");
  } catch (err) {
    console.error(err);
    $("foot").insertAdjacentHTML("beforeend", "<p>Die Daten sind gerade nicht erreichbar. Bitte später noch einmal versuchen.</p>");
  }
  const b = await boundary;
  if (b) {
    const city = L.polygon(b.latlngs, { className: "city", interactive: false }).addTo(map);
    map.fitBounds(city.getBounds(), { padding: [16, 16] });
  }
  fVenue.innerHTML = [...VENUES].sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map(v => '<option value="' + v.id + '">' + esc(v.name) + " (" + esc(v.district) + ")</option>").join("");
  $("countTag").textContent = "Beta · " + VENUES.length + " Lokale";
  render();
}
boot();
