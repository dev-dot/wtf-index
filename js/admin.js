import { CONFIG } from "./config.js";
import { createBackend } from "./backend.js";
import { ITEMS, ITEM_KEYS, isBeer, VENUE_TYPES, SOURCE_LABELS, currentPrices, slugify, fmt, esc, priceOk } from "./model.js";

const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDay = s => new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtTs = ms => new Date(ms).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

let backend, venues = [], prices = [], tab = "reports", reportStatus = "pending", editing = null, isNew = false;
let pickMap, pickMarker;

/* ---------- Hilfen ---------- */
let toastT;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 3200); }
function msg(el, text, err) { el.hidden = !text; el.textContent = text || ""; el.className = "msg" + (err ? " err" : ""); }
function errText(e) { return (e && (e.message || e.error_description)) || "Unbekannter Fehler"; }
const venueName = id => (venues.find(v => v.id === id) || { name: id }).name;
const curMap = () => currentPrices(prices);

/* ---------- Start & Login ---------- */
async function boot() {
  try {
    backend = await createBackend();
  } catch (e) {
    document.querySelector(".admin-main").innerHTML = '<p class="card">Verbindung fehlgeschlagen: ' + esc(errText(e)) + "</p>";
    return;
  }
  if (backend.mode === "local") $("localBanner").hidden = false;
  await route();
}

async function route() {
  const user = await backend.getUser();
  ["loginView", "noAdminView", "reportsView", "venuesView"].forEach(id => ($(id).hidden = true));
  $("tabs").hidden = true;
  $("logout").hidden = !user || backend.mode === "local";
  $("who").textContent = backend.mode === "local" ? "Lokaler Modus" : user ? user.email : "Nicht angemeldet";
  if (!user) { $("loginView").hidden = false; $("lEmail").focus(); return; }
  if (!(await backend.isAdmin())) { $("noAdminView").hidden = false; return; }
  $("tabs").hidden = false;
  await reload();
  showTab(tab);
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("lEmail").value.trim(), pass = $("lPass").value;
  if (!email || !pass) { msg($("lMsg"), "Bitte E-Mail und Passwort eingeben.", true); return; }
  $("lSubmit").disabled = true; msg($("lMsg"), "Anmeldung läuft …");
  try { await backend.signIn(email, pass); msg($("lMsg"), ""); $("lPass").value = ""; await route(); }
  catch (err) {
    const t = errText(err);
    msg($("lMsg"), /invalid login credentials/i.test(t) ? "E-Mail oder Passwort stimmt nicht." : /email not confirmed/i.test(t) ? "Die E-Mail-Adresse ist noch nicht bestätigt." : "Anmeldung fehlgeschlagen: " + t, true);
  }
  finally { $("lSubmit").disabled = false; }
});
$("logout").addEventListener("click", async () => { await backend.signOut(); await route(); });

async function reload() {
  const data = await backend.loadAll({ includeInactive: true });
  venues = data.venues.sort((a, b) => a.name.localeCompare(b.name, "de"));
  prices = data.prices;
  $("venueCount").textContent = venues.length + " Lokale";
  const pending = await backend.listReports("pending");
  $("pendingCount").textContent = pending.length ? pending.length + " offen" : "keine offen";
}

function showTab(t) {
  tab = t;
  document.querySelectorAll("#tabs .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.tab === t));
  $("reportsView").hidden = t !== "reports";
  $("venuesView").hidden = t !== "venues";
  if (t === "reports") renderReports();
  else { renderVenueList(); if (pickMap) setTimeout(() => pickMap.invalidateSize(), 0); }
}
$("tabs").addEventListener("click", e => { const c = e.target.closest(".chip"); if (c) showTab(c.dataset.tab); });

/* ---------- Meldungen ---------- */
async function renderReports() {
  const rows = $("reportRows");
  rows.innerHTML = '<tr><td colspan="7" class="muted">Lädt …</td></tr>';
  let list;
  try { list = await backend.listReports(reportStatus); }
  catch (e) { rows.innerHTML = '<tr><td colspan="7">Laden fehlgeschlagen: ' + esc(errText(e)) + "</td></tr>"; return; }
  const cur = curMap();
  $("reportsEmpty").hidden = list.length > 0;
  rows.innerHTML = list.map(r => {
    const c = cur[r.venueId + "|" + r.item];
    let diff = "";
    if (c) {
      const d = (r.price - c.price) / c.price * 100;
      if (Math.abs(d) >= 0.5) diff = '<span class="diff ' + (d > 0 ? "up" : "down") + '">' + (d > 0 ? "+" : "") + d.toFixed(0) + " %</span>";
    }
    const acts = reportStatus === "pending"
      ? '<button type="button" class="btn small ok" data-act="approved" data-id="' + r.id + '">Freigeben</button><button type="button" class="btn small bad" data-act="rejected" data-id="' + r.id + '">Ablehnen</button>'
      : '<button type="button" class="btn small" data-act="pending" data-id="' + r.id + '">Zurück zu offen</button>';
    return "<tr><td>" + fmtTs(r.createdAt) + "</td><td>" + esc(venueName(r.venueId)) + "</td><td>" + ITEMS[r.item].title +
      (isBeer(r.item) && r.tap ? ' <span class="muted">(' + (r.tap === "f" ? "Fass" : "Flasche") + ")</span>" : "") +
      '</td><td class="num">' + fmt(r.price) + diff + '</td><td class="num">' + (c ? fmt(c.price) : "–") +
      "</td><td>" + esc(r.note || "") + '</td><td class="acts">' + acts + "</td></tr>";
  }).join("");
}
$("statusSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  reportStatus = b.dataset.status;
  document.querySelectorAll("#statusSeg button").forEach(x => x.setAttribute("aria-pressed", x === b));
  renderReports();
});
$("reportRows").addEventListener("click", async e => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  b.disabled = true;
  try {
    await backend.setReportStatus(b.dataset.id, b.dataset.act);
    toast(b.dataset.act === "approved" ? "Freigegeben: erscheint jetzt auf der Karte." : b.dataset.act === "rejected" ? "Abgelehnt." : "Zurück in „Offen“.");
    await reload(); renderReports();
  } catch (err) { b.disabled = false; toast("Hat nicht geklappt: " + errText(err)); }
});

/* ---------- Lokale: Liste ---------- */
function renderVenueList() {
  const q = $("vSearch").value.trim().toLowerCase();
  $("venueList").innerHTML = venues
    .filter(v => !q || (v.name + " " + v.district + " " + v.type).toLowerCase().includes(q))
    .map(v => '<li data-id="' + esc(v.id) + '" class="' + (editing && editing.id === v.id ? "active " : "") + (v.active === false ? "inactive" : "") +
      '" tabindex="0"><b>' + esc(v.name) + "</b><small>" + esc(v.type) + " · " + esc(v.district || "–") + (v.location ? "" : " · ohne Standort") + "</small></li>")
    .join("");
}
$("vSearch").addEventListener("input", renderVenueList);
$("venueList").addEventListener("click", e => { const li = e.target.closest("li"); if (li) openVenue(li.dataset.id); });
$("venueList").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset.id) openVenue(e.target.dataset.id); });
$("newVenue").addEventListener("click", () => {
  isNew = true;
  editing = { id: "", name: "", type: "Pizzeria", district: "", address: "", location: null, notes: {}, wanted: [], active: true };
  fillVenueForm(); renderVenueList(); $("vName").focus();
});

/* ---------- Lokale: Formular ---------- */
$("vType").innerHTML = VENUE_TYPES.map(t => "<option>" + t + "</option>").join("");
$("sources").innerHTML = SOURCE_LABELS.map(s => '<option value="' + esc(s) + '">').join("");
$("vWanted").innerHTML = ITEM_KEYS.filter(k => !isBeer(k) && k !== "wasser")
  .map(k => '<label class="check"><input type="checkbox" value="' + k + '"> ' + ITEMS[k].title + "</label>").join("");

function openVenue(id) {
  const v = venues.find(x => x.id === id); if (!v) return;
  isNew = false;
  editing = JSON.parse(JSON.stringify(v));
  fillVenueForm(); renderVenueList();
}

function ensurePickMap() {
  if (pickMap) return;
  pickMap = L.map("pickMap", { zoomSnap: 0.5 }).setView([48.7758, 9.1829], 12);
  L.tileLayer(CONFIG.tileUrl, { attribution: CONFIG.tileAttribution, maxZoom: CONFIG.tileMaxZoom }).addTo(pickMap);
  pickMap.attributionControl.setPrefix(false);
  pickMap.on("click", e => setLocation(e.latlng.lat, e.latlng.lng));
}
function setLocation(lat, lon, fly) {
  editing.location = { lat: +lat.toFixed(5), lon: +lon.toFixed(5) };
  if (!pickMarker) {
    pickMarker = L.marker([lat, lon], { draggable: true, icon: L.divIcon({ className: "", html: '<span class="pick-pin"></span>', iconSize: null }) }).addTo(pickMap);
    pickMarker.on("dragend", () => { const p = pickMarker.getLatLng(); setLocation(p.lat, p.lng); });
  } else pickMarker.setLatLng([lat, lon]);
  if (fly) pickMap.setView([lat, lon], 17);
  $("locText").textContent = editing.location.lat.toFixed(5) + ", " + editing.location.lon.toFixed(5);
}

function fillVenueForm() {
  const v = editing;
  $("editorEmpty").hidden = true;
  $("venueForm").hidden = false;
  $("vTitle").textContent = isNew ? "Neues Lokal" : v.name;
  $("vId").textContent = isNew ? "" : "ID " + v.id;
  $("vName").value = v.name; $("vType").value = v.type; $("vDistrict").value = v.district; $("vAddress").value = v.address;
  $("vActive").checked = v.active !== false;
  document.querySelectorAll("#vWanted input").forEach(c => (c.checked = (v.wanted || []).includes(c.value)));
  msg($("vMsg"), "");
  ensurePickMap();
  setTimeout(() => {
    pickMap.invalidateSize();
    if (v.location) setLocation(v.location.lat, v.location.lon, true);
    else {
      if (pickMarker) { pickMap.removeLayer(pickMarker); pickMarker = null; }
      $("locText").textContent = "nicht gesetzt";
      pickMap.setView([48.7758, 9.1829], 12);
    }
  }, 0);
  $("priceCard").hidden = isNew;
  if (!isNew) renderPrices();
}

$("geocode").addEventListener("click", async () => {
  const addr = $("vAddress").value.trim();
  if (!addr) { msg($("vMsg"), "Bitte zuerst eine Adresse eingeben.", true); return; }
  const b = $("geocode"); b.disabled = true; msg($("vMsg"), "Suche Adresse …");
  try {
    // OpenStreetMap Nominatim: nur für einzelne Suchen gedacht (max. 1 Anfrage pro Sekunde).
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=de&q=" + encodeURIComponent(addr.replace(/\(.*?\)/g, "") + ", Stuttgart");
    const res = await fetch(url, { headers: { "Accept-Language": "de" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const hit = (await res.json())[0];
    if (!hit) { msg($("vMsg"), "Adresse nicht gefunden. Setze den Pin bitte von Hand.", true); return; }
    setLocation(+hit.lat, +hit.lon, true);
    msg($("vMsg"), "Gefunden: " + hit.display_name + ". Prüfe den Pin und speichere.");
  } catch (e) {
    msg($("vMsg"), "Suche nicht möglich (" + errText(e) + "). Setze den Pin bitte von Hand.", true);
  } finally { b.disabled = false; }
});

$("venueForm").addEventListener("submit", async e => {
  e.preventDefault();
  const v = editing;
  v.name = $("vName").value.trim(); v.type = $("vType").value; v.district = $("vDistrict").value.trim(); v.address = $("vAddress").value.trim();
  v.active = $("vActive").checked;
  v.wanted = [...document.querySelectorAll("#vWanted input:checked")].map(c => c.value);
  if (!v.name) { msg($("vMsg"), "Bitte einen Namen eingeben.", true); $("vName").focus(); return; }
  if (isNew) {
    let id = slugify(v.name), n = 2;
    while (venues.some(x => x.id === id)) id = slugify(v.name).slice(0, 36) + "-" + n++;
    v.id = id;
  }
  $("vSave").disabled = true; msg($("vMsg"), "Speichert …");
  try {
    await backend.saveVenue(v);
    const wasNew = isNew; isNew = false;
    await reload();
    openVenue(v.id);
    toast(wasNew ? "Lokal angelegt. Jetzt Preise eintragen." : "Gespeichert.");
  } catch (err) { msg($("vMsg"), "Speichern fehlgeschlagen: " + errText(err), true); }
  finally { $("vSave").disabled = false; }
});

/* ---------- Preise ---------- */
function renderPrices() {
  const v = editing, cur = curMap();
  $("priceItems").innerHTML = ITEM_KEYS.map(it => {
    const mine = prices.filter(p => p.venueId === v.id && p.item === it)
      .sort((a, b) => (a.validFrom === b.validFrom ? (b.createdAt || 0) - (a.createdAt || 0) : a.validFrom < b.validFrom ? 1 : -1));
    const c = cur[v.id + "|" + it];
    const blocked = it === "pizza" && v.type !== "Pizzeria";
    return '<div class="item-row" data-item="' + it + '">' +
      '<div class="item-head"><b>' + ITEMS[it].title + "</b>" +
      (c ? '<span class="cur">' + fmt(c.price) + "</span>" : '<span class="muted">kein Preis</span>') +
      (blocked ? '<span class="muted">zählt nicht: Pizza-Index nur für Pizzerien</span>' : "") +
      '<button type="button" class="btn small" data-new="' + it + '">+ Neuer Preis</button></div>' +
      (mine.length ? '<ul class="hist">' + mine.map(p =>
        '<li class="' + (p === c ? "current" : "") + '"><span class="p">' + fmt(p.price) + "</span><span>" +
        esc([fmtDay(p.validFrom), p.sourceLabel, p.standLabel && "Stand " + p.standLabel, p.tap === "f" ? "Fass" : p.tap === "b" ? "Flasche" : "", p.outdated && "alte Karte", p.note].filter(Boolean).join(" · ")) +
        '</span><button type="button" data-del="' + esc(p.id) + '">Löschen</button></li>').join("") + "</ul>" : "") +
      '<div class="field"><label for="note-' + it + '">Hinweis, solange kein Preis zählt</label>' +
      '<input id="note-' + it + '" data-note="' + it + '" value="' + esc((v.notes || {})[it] || "") + '" maxlength="160" placeholder="z. B. Nur 0,5 l im Angebot"></div>' +
      '<div class="pf-slot"></div></div>';
  }).join("");
}

function priceFormHtml(it) {
  const last = prices.filter(p => p.venueId === editing.id).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
  return '<form class="price-form" novalidate>' +
    '<div class="grid3">' +
    '<div class="field"><label>Preis in €</label><input name="price" type="number" inputmode="decimal" step="0.1" min="0.5" max="60" required></div>' +
    '<div class="field"><label>Stand (Datum der Karte)</label><input name="validFrom" type="date" value="' + today() + '" required></div>' +
    '<div class="field"><label>Stand als Text (optional)</label><input name="standLabel" maxlength="40" placeholder="z. B. Herbst/Winter 2026/27"></div>' +
    '<div class="field"><label>Quelle</label><input name="sourceLabel" list="sources" maxlength="60" value="' + esc(last ? last.sourceLabel || "" : "Hauskarte (PDF)") + '"></div>' +
    '<div class="field"><label>Link zur Quelle (optional)</label><input name="sourceUrl" type="url" maxlength="300" placeholder="https://…"></div>' +
    (isBeer(it) ? '<div class="field"><label>Ausschank</label><select name="tap"><option value="">nicht angegeben</option><option value="f">vom Fass</option><option value="b">Flasche</option></select></div>' : "<div></div>") +
    "</div>" +
    '<div class="field"><label>Hinweis (optional)</label><input name="note" maxlength="200" placeholder="z. B. San Marzano, Fior di Latte"></div>' +
    '<label class="check"><input type="checkbox" name="outdated"> Alte Karte (vor über einem Jahr)</label>' +
    '<div class="msg" hidden></div>' +
    '<div class="actions"><button type="button" class="btn" data-cancel>Abbrechen</button><button type="submit" class="btn primary">Preis speichern</button></div></form>';
}

$("priceItems").addEventListener("click", async e => {
  const nb = e.target.closest("[data-new]");
  if (nb) {
    const row = nb.closest(".item-row"), slot = row.querySelector(".pf-slot");
    slot.innerHTML = priceFormHtml(nb.dataset.new);
    slot.querySelector("[name=price]").focus();
    return;
  }
  if (e.target.closest("[data-cancel]")) { e.target.closest(".pf-slot").innerHTML = ""; return; }
  const del = e.target.closest("[data-del]");
  if (del) {
    if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "Wirklich löschen?"; return; }
    del.disabled = true;
    try { await backend.deletePrice(del.dataset.del); await reload(); renderPrices(); toast("Preis gelöscht."); }
    catch (err) { toast("Löschen fehlgeschlagen: " + errText(err)); del.disabled = false; }
  }
});

$("priceItems").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, it = f.closest(".item-row").dataset.item, m = f.querySelector(".msg");
  const price = parseFloat(String(f.price.value).replace(",", "."));
  if (!priceOk(price)) { msg(m, "Bitte einen Preis zwischen 0,50 € und 60 € eingeben.", true); f.price.focus(); return; }
  if (!f.validFrom.value) { msg(m, "Bitte das Datum der Karte angeben.", true); return; }
  const url = f.sourceUrl.value.trim();
  if (url && !/^https?:\/\//.test(url)) { msg(m, "Der Link muss mit http:// oder https:// beginnen.", true); return; }
  const p = {
    venueId: editing.id, item: it, price: Math.round(price * 100) / 100, tap: f.tap ? f.tap.value || null : null,
    note: f.note.value.trim() || null, sourceLabel: f.sourceLabel.value.trim() || null, sourceUrl: url || null,
    validFrom: f.validFrom.value, standLabel: f.standLabel.value.trim() || null, outdated: f.outdated.checked,
  };
  f.querySelector("[type=submit]").disabled = true; msg(m, "Speichert …");
  try {
    await backend.addPrice(p);
    await reload(); renderPrices();
    toast(ITEMS[it].title + ": " + fmt(p.price) + " gespeichert.");
  } catch (err) { msg(m, "Speichern fehlgeschlagen: " + errText(err), true); f.querySelector("[type=submit]").disabled = false; }
});

// Hinweise ohne Preis werden beim Verlassen des Feldes gespeichert.
$("priceItems").addEventListener("change", async e => {
  const inp = e.target.closest("[data-note]"); if (!inp) return;
  const it = inp.dataset.note, val = inp.value.trim();
  editing.notes = { ...(editing.notes || {}) };
  if (val) editing.notes[it] = val; else delete editing.notes[it];
  try { await backend.saveVenue(editing); await reload(); toast("Hinweis gespeichert."); }
  catch (err) { toast("Hinweis nicht gespeichert: " + errText(err)); }
});

/* ---------- Lokaler Modus: Export ---------- */
$("exportJson").addEventListener("click", () => {
  const data = backend.exportJson();
  const blob = new Blob([JSON.stringify(data, null, 1) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "venues.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("venues.json exportiert. Im Repository unter data/ ersetzen.");
});
$("resetLocal").addEventListener("click", async e => {
  const b = e.currentTarget;
  if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Wirklich alle lokalen Änderungen verwerfen?"; return; }
  backend.resetChanges(); b.dataset.confirm = ""; b.textContent = "Lokale Änderungen verwerfen";
  editing = null; $("venueForm").hidden = true; $("priceCard").hidden = true; $("editorEmpty").hidden = false;
  await reload(); showTab(tab); toast("Lokale Änderungen verworfen.");
});

boot();
