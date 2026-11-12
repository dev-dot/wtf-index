import { CONFIG } from "./config.js";
import { createBackend } from "./backend.js";
import { renderBody } from "./markup.js";
import { venuesInText } from "./model.js";
import { ITEMS, ITEM_KEYS, isBeer, VENUE_TYPES, SOURCE_LABELS, currentPrices, slugify, fmt, esc, priceOk } from "./model.js";

const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDay = s => new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtTs = ms => new Date(ms).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

let backend, venues = [], prices = [], tab = "reports", reportStatus = "pending", editing = null, isNew = false;
let pickMap, pickMarker, articles = [], editingArticle = null;

/* ---------- Hilfen ---------- */
let toastT;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 3200); }
function msg(el, text, err) { el.hidden = !text; el.textContent = text || ""; el.className = "msg" + (err ? " err" : ""); }
function errText(e) { return (e && (e.message || e.error_description)) || "Unbekannter Fehler"; }
// Umschalt-Knöpfe statt Checkboxen (zuverlässig auch in Safari)
const toggleBtn = (value, label, on) => '<button type="button" class="toggle" data-value="' + esc(value) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(label) + "</button>";
const pressedValues = id => [...document.querySelectorAll("#" + id + ' .toggle[aria-pressed="true"]')].map(b => b.dataset.value);
document.addEventListener("click", e => {
  const b = e.target.closest(".toggle"); if (!b) return;
  b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
  b.parentElement.dispatchEvent(new CustomEvent("toggle-change", { bubbles: true }));
});
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
  ["loginView", "noAdminView", "reportsView", "menusView", "noticesView", "articlesView", "venuesView"].forEach(id => ($(id).hidden = true));
  $("tabs").hidden = true;
  $("logout").hidden = !user || backend.mode === "local";
  $("who").textContent = backend.mode === "local" ? "Lokaler Modus" : user ? user.email : "Nicht angemeldet";
  if (!user) { $("loginView").hidden = false; $("lEmail").focus(); return; }
  if (!(await backend.isAdmin())) { $("noAdminView").hidden = false; return; }
  $("tabs").hidden = false;
  await purgeMenuFiles();
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
  try {
    const menus = await backend.listMenuUploads("pending");
    $("menuCount").textContent = menus.length ? menus.length + " offen" : "keine offen";
  } catch { $("menuCount").textContent = "nicht eingerichtet"; }
  try {
    const open = await backend.listNotices("open");
    $("noticeCount").textContent = open.length ? open.length + " offen" : "keine offen";
  } catch { $("noticeCount").textContent = "nicht eingerichtet"; }
  try {
    articles = await backend.listArticles({ all: true });
    const pub = articles.filter(a => a.status === "published").length;
    $("articleCount").textContent = articles.length ? pub + " veröffentlicht" : "noch keine";
  } catch { articles = null; $("articleCount").textContent = "nicht eingerichtet"; }
}

// Löschfrist: Dateien eingereichter Speisekarten nach Erledigen/Ablehnen löschen, spätestens nach 30 Tagen.
const MENU_FILE_DAYS = 30;
async function purgeMenuFiles() {
  const cutoff = Date.now() - MENU_FILE_DAYS * 24 * 3600 * 1000;
  let n = 0;
  for (const status of ["pending", "done", "rejected"]) {
    let list; try { list = await backend.listMenuUploads(status); } catch { return; }
    for (const m of list) {
      if (m.filesDeletedAt || !m.files.length) continue;
      if (status !== "pending" || m.createdAt < cutoff) { try { await backend.deleteMenuFiles(m); n++; } catch (e) { console.warn("Löschen fehlgeschlagen", m.id, e); } }
    }
  }
  if (n) toast(n === 1 ? "Dateien einer Speisekarte nach Löschfrist entfernt." : "Dateien von " + n + " Speisekarten nach Löschfrist entfernt.");
}

function showTab(t) {
  tab = t;
  document.querySelectorAll("#tabs .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.tab === t));
  $("reportsView").hidden = t !== "reports";
  $("venuesView").hidden = t !== "venues";
  $("menusView").hidden = t !== "menus";
  $("noticesView").hidden = t !== "notices";
  $("articlesView").hidden = t !== "articles";
  if (t === "reports") renderReports();
  else if (t === "menus") renderMenus();
  else if (t === "notices") renderNotices();
  else if (t === "articles") renderArticleList();
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

/* ---------- Speisekarten ---------- */
let menuStatus = "pending";
const objectUrls = [];
async function viewUrl(path) {
  const url = await backend.fileUrl(path);
  if (url && url.startsWith("data:")) { const u = URL.createObjectURL(await (await fetch(url)).blob()); objectUrls.push(u); return u; }
  return url;
}
async function renderMenus() {
  const box = $("menuCards");
  box.innerHTML = '<p class="muted">Lädt …</p>';
  let list;
  try { list = await backend.listMenuUploads(menuStatus); }
  catch (e) {
    box.innerHTML = '<p class="card">Speisekarten lassen sich noch nicht laden (' + esc(errText(e)) + "). Ist die Migration <code>supabase/migrations/2026-11-11_menu_uploads.sql</code> ausgeführt?</p>";
    return;
  }
  objectUrls.splice(0).forEach(u => URL.revokeObjectURL(u));
  $("menusEmpty").hidden = list.length > 0;
  box.innerHTML = list.map(m => {
    const known = m.venueId && venues.find(v => v.id === m.venueId);
    const title = known ? esc(known.name) : esc(m.venueName || m.venueId || "Unbekanntes Lokal") + '<span class="new-tag">neu</span>';
    const acts = menuStatus === "pending"
      ? '<button type="button" class="btn small ok" data-mstatus="done" data-id="' + m.id + '">Erledigt</button><button type="button" class="btn small bad" data-mstatus="rejected" data-id="' + m.id + '">Ablehnen</button>'
      : '<button type="button" class="btn small" data-mstatus="pending" data-id="' + m.id + '">Zurück zu offen</button>';
    const open = known ? '<button type="button" class="btn small" data-open="' + esc(m.venueId) + '">Preise eintragen</button>'
      : '<button type="button" class="btn small" data-create="' + m.id + '">Als Lokal anlegen</button>';
    return '<article class="card menu-card" data-id="' + m.id + '"><div><h3>' + title + '</h3><div class="meta">' +
      esc([fmtTs(m.createdAt), !known && m.venueAddress, m.stand && "Stand: " + m.stand].filter(Boolean).join(" · ")) + "</div></div>" +
      (m.note ? "<div>" + esc(m.note) + "</div>" : "") +
      (m.filesDeletedAt ? '<div class="muted">Dateien gelöscht am ' + fmtTs(m.filesDeletedAt) + " (Löschfrist).</div>" : "") +
      '<div class="menu-files">' + (m.filesDeletedAt ? [] : m.files).map((p, i) => '<a href="#" data-file="' + esc(p) + '" target="_blank" rel="noopener" title="' + esc(m.fileNames[i] || "") + '">' +
        (/\.pdf$/i.test(m.fileNames[i] || p) ? "PDF<br>" + (i + 1) : "Seite " + (i + 1)) + "</a>").join("") + "</div>" +
      '<div class="acts">' + open + acts + "</div></article>";
  }).join("");
  // Dateien: kurzlebige Links (Supabase) bzw. lokale Blob-Links nachladen; Bilder als Vorschau
  for (const a of box.querySelectorAll("a[data-file]")) {
    try {
      const url = await viewUrl(a.dataset.file);
      if (!url) { a.textContent = "fehlt"; continue; }
      a.href = url;
      if (!/^PDF/.test(a.textContent)) a.innerHTML = '<img src="' + esc(url) + '" alt="' + esc(a.title || "Speisekarte") + '" loading="lazy">';
    } catch { a.textContent = "Fehler"; }
  }
}
$("menuSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  menuStatus = b.dataset.status;
  document.querySelectorAll("#menuSeg button").forEach(x => x.setAttribute("aria-pressed", x === b));
  renderMenus();
});
$("menuCards").addEventListener("click", async e => {
  const a = e.target.closest("a[data-file]");
  if (a && a.getAttribute("href") === "#") { e.preventDefault(); return; }
  const st = e.target.closest("[data-mstatus]");
  if (st) {
    st.disabled = true;
    try {
      await backend.setMenuUploadStatus(st.dataset.id, st.dataset.mstatus);
      let gone = false;
      if (st.dataset.mstatus !== "pending") {
        const m = (await backend.listMenuUploads(st.dataset.mstatus)).find(x => x.id === st.dataset.id);
        if (m && !m.filesDeletedAt) { await backend.deleteMenuFiles(m); gone = true; }
      }
      toast((st.dataset.mstatus === "done" ? "Als erledigt markiert." : st.dataset.mstatus === "rejected" ? "Abgelehnt." : "Zurück in „Offen“.") + (gone ? " Dateien gelöscht." : ""));
      await reload(); renderMenus();
    } catch (err) { st.disabled = false; toast("Hat nicht geklappt: " + errText(err)); }
    return;
  }
  const op = e.target.closest("[data-open]");
  if (op) { showTab("venues"); openVenue(op.dataset.open); return; }
  const cr = e.target.closest("[data-create]");
  if (cr) {
    const m = (await backend.listMenuUploads(menuStatus)).find(x => x.id === cr.dataset.create);
    showTab("venues");
    isNew = true;
    editing = { id: "", name: m ? m.venueName || "" : "", type: "Restaurant", district: "", address: m ? m.venueAddress || "" : "", location: null, notes: {}, wanted: [], active: false };
    fillVenueForm(); renderVenueList(); $("vName").focus();
  }
});

/* ---------- Hinweise ---------- */
let noticeStatus = "open";
const KIND = { korrektur: "Preis/Angabe falsch", inhaber: "Vom Lokal", rechtsverletzung: "Rechtswidriger Inhalt", sonstiges: "Sonstiges" };
async function renderNotices() {
  const box = $("noticeCards");
  box.innerHTML = '<p class="muted">Lädt …</p>';
  let list;
  try { list = await backend.listNotices(noticeStatus); }
  catch (e) {
    box.innerHTML = '<p class="card">Hinweise lassen sich noch nicht laden (' + esc(errText(e)) + "). Ist die Migration <code>supabase/migrations/2026-11-11_hinweise_loeschfrist.sql</code> ausgeführt?</p>";
    return;
  }
  $("noticesEmpty").hidden = list.length > 0;
  box.innerHTML = list.map(n => {
    const v = n.venueId && venues.find(x => x.id === n.venueId);
    return '<article class="card menu-card"><div><h3>' + esc(KIND[n.kind] || n.kind) + (n.kind === "rechtsverletzung" ? '<span class="new-tag">DSA</span>' : "") + '</h3><div class="meta">' +
      esc([fmtTs(n.createdAt), v ? v.name : "kein Lokal"].join(" · ")) + "</div></div>" +
      '<div class="notice-msg">' + esc(n.message) + "</div>" +
      (n.name || n.email ? '<div class="meta">' + esc(n.name || "") + (n.email ? ' · <span class="sel">' + esc(n.email) + "</span>" : "") + "</div>" : "") +
      '<div class="acts">' + (v ? '<button type="button" class="btn small" data-open="' + esc(v.id) + '">Lokal öffnen</button>' : "") +
      (noticeStatus === "open" ? '<button type="button" class="btn small ok" data-nstatus="done" data-id="' + n.id + '">Erledigt</button>'
        : '<button type="button" class="btn small" data-nstatus="open" data-id="' + n.id + '">Zurück zu offen</button>') + "</div></article>";
  }).join("");
}
$("noticeSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  noticeStatus = b.dataset.status;
  document.querySelectorAll("#noticeSeg button").forEach(x => x.setAttribute("aria-pressed", x === b));
  renderNotices();
});
$("noticeCards").addEventListener("click", async e => {
  const st = e.target.closest("[data-nstatus]");
  if (st) {
    st.disabled = true;
    try { await backend.setNoticeStatus(st.dataset.id, st.dataset.nstatus); toast(st.dataset.nstatus === "done" ? "Erledigt." : "Zurück in „Offen“."); await reload(); renderNotices(); }
    catch (err) { st.disabled = false; toast("Hat nicht geklappt: " + errText(err)); }
    return;
  }
  const op = e.target.closest("[data-open]");
  if (op) { showTab("venues"); openVenue(op.dataset.open); }
});

/* ---------- Beiträge ---------- */
const toLocalInput = ms => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
function renderArticleList() {
  if (articles === null) {
    $("articleList").innerHTML = '<li class="muted">Beiträge lassen sich noch nicht laden. Ist die Migration <code>2026-11-12_redaktion.sql</code> ausgeführt?</li>';
    return;
  }
  $("articleList").innerHTML = articles.map(a => '<li data-id="' + a.id + '" class="' + (editingArticle && editingArticle.id === a.id ? "active" : "") + '" tabindex="0"><b>' + esc(a.title) +
    "</b><small>" + (a.status === "published" ? "Veröffentlicht " + (a.publishedAt ? fmtTs(a.publishedAt) : "") : "Entwurf") + "</small></li>").join("") ||
    '<li class="muted">Noch keine Beiträge.</li>';
}
function openArticle(a) {
  editingArticle = a;
  $("articleEmpty").hidden = true; $("articleForm").hidden = false; $("aPreview").hidden = true;
  $("aHead").textContent = a.id ? a.title : "Neuer Beitrag";
  delete $("aSlug").dataset.touched;
  $("aTitle").value = a.title || ""; $("aSlug").value = a.slug || ""; $("aSlugPreview").textContent = a.slug || "";
  $("aAuthor").value = a.author || ""; $("aTeaser").value = a.teaser || ""; $("aBody").value = a.body || "";
  $("aStatus").value = a.status || "draft"; $("aDate").value = a.publishedAt ? toLocalInput(a.publishedAt) : "";
  $("aCorrection").value = a.correction || "";
  setTimeout(updateDetect, 0);
  $("aVenues").innerHTML = venues.map(v => toggleBtn(v.id, v.name, (a.venueIds || []).includes(v.id))).join("");
  $("aLink").hidden = !(a.id && a.status === "published"); $("aLink").href = "beitraege.html#" + (a.slug || "");
  $("aDelete").hidden = !a.id; delete $("aDelete").dataset.confirm; $("aDelete").textContent = "Löschen";
  msg($("aMsg"), ""); renderArticleList();
}
$("newArticle").addEventListener("click", () => { openArticle({ status: "draft", venueIds: [] }); $("aTitle").focus(); });
$("articleList").addEventListener("click", e => { const li = e.target.closest("li[data-id]"); if (li) openArticle(articles.find(a => a.id === li.dataset.id)); });
$("aTitle").addEventListener("input", () => {
  if (!editingArticle.id && !$("aSlug").dataset.touched) { $("aSlug").value = slugify($("aTitle").value, 80); $("aSlugPreview").textContent = $("aSlug").value; }
});
$("aSlug").addEventListener("input", () => { $("aSlug").dataset.touched = "1"; $("aSlugPreview").textContent = $("aSlug").value; });
$("aStatus").addEventListener("change", () => { if ($("aStatus").value === "published" && !$("aDate").value) $("aDate").value = toLocalInput(Date.now()); });
// Lokale, die im Text stehen, aber noch nicht angehakt sind
function detectedMissing() {
  const text = [$("aTitle").value, $("aTeaser").value, $("aBody").value].join("\n");
  const checked = new Set(pressedValues("aVenues"));
  return venuesInText(text, venues).filter(v => !checked.has(v.id));
}
function updateDetect() {
  const miss = detectedMissing();
  $("aDetect").hidden = !miss.length;
  $("aDetectText").textContent = miss.length ? "Im Text erwähnt, aber nicht angehakt: " + miss.map(v => v.name).join(", ") : "";
}
let detectT;
["aTitle", "aTeaser", "aBody"].forEach(id => $(id).addEventListener("input", () => { clearTimeout(detectT); detectT = setTimeout(updateDetect, 300); }));
$("aVenues").addEventListener("toggle-change", updateDetect);
$("aDetectBtn").addEventListener("click", () => {
  const ids = new Set(detectedMissing().map(v => v.id));
  document.querySelectorAll("#aVenues .toggle").forEach(b => { if (ids.has(b.dataset.value)) b.setAttribute("aria-pressed", "true"); });
  updateDetect();
});

function readArticleForm() {
  return {
    ...editingArticle,
    title: $("aTitle").value.trim(), slug: $("aSlug").value.trim(), author: $("aAuthor").value.trim() || null,
    teaser: $("aTeaser").value.trim() || null, body: $("aBody").value, status: $("aStatus").value,
    publishedAt: $("aDate").value ? new Date($("aDate").value).getTime() : null,
    correction: $("aCorrection").value.trim() || null,
    venueIds: pressedValues("aVenues"),
  };
}
function articleHtml(a) {
  const vs = (a.venueIds || []).map(id => venues.find(v => v.id === id)).filter(Boolean);
  return "<h1>" + esc(a.title) + '</h1><p class="muted">' + esc([a.author, a.publishedAt && fmtTs(a.publishedAt)].filter(Boolean).join(" · ")) + "</p>" +
    (a.teaser ? "<p><strong>" + esc(a.teaser) + "</strong></p>" : "") + '<div class="body">' + renderBody(a.body) + "</div>" +
    (a.correction ? '<p class="muted"><b>Korrektur:</b> ' + esc(a.correction) + "</p>" : "") +
    (vs.length ? '<p class="muted">Erwähnte Lokale: ' + vs.map(v => esc(v.name)).join(", ") + "</p>" : "");
}
$("aPreviewBtn").addEventListener("click", () => { const p = $("aPreview"); p.innerHTML = articleHtml(readArticleForm()); p.hidden = false; p.scrollIntoView({ behavior: "smooth", block: "start" }); });
$("articleForm").addEventListener("submit", async e => {
  e.preventDefault();
  const a = readArticleForm();
  if (a.title.length < 3) { msg($("aMsg"), "Bitte einen Titel eingeben.", true); $("aTitle").focus(); return; }
  if (!/^[a-z0-9-]{3,80}$/.test(a.slug)) { msg($("aMsg"), "Die Adresse darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten (3–80 Zeichen).", true); $("aSlug").focus(); return; }
  if (a.status === "published" && !a.publishedAt) a.publishedAt = Date.now();
  // Im Text genannte Lokale automatisch mit verknüpfen
  const auto = detectedMissing().map(v => v.id);
  if (auto.length) a.venueIds = [...new Set([...(a.venueIds || []), ...auto])];
  $("aSave").disabled = true; msg($("aMsg"), "Speichert …");
  try {
    const saved = await backend.saveArticle(a);
    await reload(); openArticle(articles.find(x => x.id === saved.id) || saved);
    toast(saved.status === "published" ? "Gespeichert und veröffentlicht." : "Entwurf gespeichert.");
  } catch (err) {
    const t = err.userMessage || errText(err);
    msg($("aMsg"), /duplicate|unique/i.test(t) ? "Diese Adresse gibt es schon. Bitte eine andere wählen." : "Speichern fehlgeschlagen: " + t, true);
  } finally { $("aSave").disabled = false; }
});
$("aDelete").addEventListener("click", async () => {
  const b = $("aDelete");
  if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Wirklich löschen?"; return; }
  try { await backend.deleteArticle(editingArticle.id); editingArticle = null; await reload(); $("articleForm").hidden = true; $("aPreview").hidden = true; $("articleEmpty").hidden = false; renderArticleList(); toast("Beitrag gelöscht."); }
  catch (err) { toast("Löschen fehlgeschlagen: " + errText(err)); }
});

/* ---------- Lokale: Liste ---------- */
function renderVenueList() {
  const q = $("vSearch").value.trim().toLowerCase();
  $("venueList").innerHTML = venues
    .filter(v => !q || (v.name + " " + v.district + " " + v.type).toLowerCase().includes(q))
    .map(v => '<li data-id="' + esc(v.id) + '" class="' + (editing && editing.id === v.id ? "active " : "") + (v.active === false ? "inactive" : "") +
      '" tabindex="0"><b>' + esc(v.name) + "</b><small>" + esc(v.type) + " · " + esc(v.district || "–") + (v.location ? "" : " · ohne Standort") + (v.active === false ? " · noch nicht freigeschaltet" : "") + "</small></li>")
    .join("");
}
$("vSearch").addEventListener("input", renderVenueList);
$("venueList").addEventListener("click", e => { const li = e.target.closest("li"); if (li) openVenue(li.dataset.id); });
$("venueList").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset.id) openVenue(e.target.dataset.id); });
$("newVenue").addEventListener("click", () => {
  isNew = true;
  editing = { id: "", name: "", type: "Pizzeria", district: "", address: "", location: null, notes: {}, wanted: [], active: false };
  fillVenueForm(); renderVenueList(); $("vName").focus();
});

/* ---------- Lokale: Formular ---------- */
$("vType").innerHTML = VENUE_TYPES.map(t => "<option>" + t + "</option>").join("");
$("sources").innerHTML = SOURCE_LABELS.map(s => '<option value="' + esc(s) + '">').join("");
$("vWanted").innerHTML = ITEM_KEYS.filter(k => !isBeer(k) && k !== "wasser").map(k => toggleBtn(k, ITEMS[k].title, false)).join("");

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
  $("vActive").checked = v.active === true || (v.active !== false && !isNew);
  $("vStatement").value = v.statement || ""; $("vStatementDate").value = v.statementDate || "";
  document.querySelectorAll("#vWanted .toggle").forEach(b => b.setAttribute("aria-pressed", String((v.wanted || []).includes(b.dataset.value))));
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
  v.statement = $("vStatement").value.trim() || null;
  v.statementDate = v.statement ? ($("vStatementDate").value || today()) : null;
  v.wanted = pressedValues("vWanted");
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
    toast(wasNew ? (v.active ? "Lokal angelegt. Jetzt Preise eintragen." : "Lokal angelegt, aber noch ausgeblendet. Erst probieren, dann freischalten.") : "Gespeichert.");
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
        (p.correction ? ' <span class="corr">· Korrigiert: ' + esc(p.correction) + "</span>" : "") +
        '</span><button type="button" data-del="' + esc(p.id) + '" title="Nur für Tippfehler direkt nach dem Eintragen. Sonst neuen Preis mit Korrekturhinweis eintragen.">Löschen</button></li>').join("") + "</ul>" : "") +
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
    '<div class="field"><label>Korrektur (optional)</label><input name="correction" maxlength="300" placeholder="z. B. Preis war 9,90 € statt 9,50 € (Tippfehler)">' +
    '<span class="hint">Ausfüllen, wenn dieser Preis einen falschen ersetzt. Wird öffentlich angezeigt.</span></div>' +
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
    validFrom: f.validFrom.value, standLabel: f.standLabel.value.trim() || null, outdated: f.outdated.checked, correction: f.correction.value.trim() || null,
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
