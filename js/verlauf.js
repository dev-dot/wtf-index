// Preisverlauf: Vorher-Nachher-Diagramm je Index (früherer Preis → aktueller Preis pro Lokal)
import { createBackend } from "./backend.js";
import { ITEMS, esc, fmt, historyOf, changeOf, fmtMonth, fmtPct } from "./model.js";
import { VAT_PERIODS, VAT_FOOD_ITEMS, VAT_SOURCES, passThrough } from "./mwst.js";

const $ = id => document.getElementById(id);
let venues = [], prices = [];
let current = ITEMS[location.hash.slice(1)] ? location.hash.slice(1) : "maultaschen";

// „Schöne“ Achsenschritte für den Preisbereich
function ticks(min, max) {
  const span = Math.max(max - min, 0.5), maxTicks = innerWidth < 640 ? 4 : 6;
  const step = [0.5, 1, 2, 5, 10].find(s => span / s <= maxTicks) || 10;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = []; for (let v = lo; v <= hi + 1e-9; v += step) out.push(+v.toFixed(2));
  return { lo, hi, out };
}

function rowsFor(item) {
  return venues
    .filter(v => v.active !== false && !(item === "pizza" && v.type !== "Pizzeria"))
    .map(v => ({ v, hist: historyOf(prices, v.id, item) }))
    .map(x => ({ ...x, c: changeOf(x.hist) }));
}

function render() {
  document.querySelectorAll("#switch .chip").forEach(b => {
    b.setAttribute("aria-pressed", b.dataset.it === current);
    const n = rowsFor(b.dataset.it).filter(x => x.c).length;
    b.querySelector("small").textContent = n ? n + " mit Verlauf" : "noch keiner";
  });
  const all = rowsFor(current), withC = all.filter(x => x.c).sort((a, b) => b.c.pct - a.c.pct);
  const without = all.filter(x => !x.c && x.hist.length);
  $("chartTitle").textContent = ITEMS[current].title;
  $("noHistory").textContent = without.length ? "Noch kein Vergleich (nur eine Karte): " + without.map(x => x.v.name).join(", ") + "." : "";
  $("chartEmpty").hidden = withC.length > 0;
  $("chart").hidden = $("axis").hidden = !withC.length;
  if (!withC.length) { $("chartSub").textContent = ""; $("chart").innerHTML = ""; $("axis").innerHTML = ""; return; }

  const up = withC.filter(x => x.c.diff > 0.004).length;
  const avg = withC.reduce((s, x) => s + x.c.pct, 0) / withC.length;
  $("chartSub").textContent = up + " von " + withC.length + " Lokalen teurer geworden · im Schnitt " + fmtPct(avg);

  const isFood = VAT_FOOD_ITEMS.includes(current);
  withC.forEach(x => (x.pt = isFood ? passThrough(x.c.from, x.c.to) : null));
  $("legendExp").hidden = !withC.some(x => x.pt);
  const vals = withC.flatMap(x => x.hist.map(p => p.price).concat(x.pt ? [x.pt.expected] : []));
  const t = ticks(Math.min(...vals), Math.max(...vals));
  const pos = p => ((p - t.lo) / (t.hi - t.lo) * 100).toFixed(2) + "%";

  $("chart").innerHTML = withC.map(({ v, hist, c, pt }) => {
    const dir = c.diff > 0.004 ? "up" : c.diff < -0.004 ? "down" : "flat";
    const lo = Math.min(c.from.price, c.to.price), hi = Math.max(c.from.price, c.to.price);
    const label = v.name + ": " + fmtMonth(c.from.validFrom) + " " + fmt(c.from.price) + " → " + fmtMonth(c.to.validFrom) + " " + fmt(c.to.price) + " (" + fmtPct(c.pct) + ")" +
      (pt ? " · MwSt " + pt.r0 + " % → " + pt.r1 + " %, bei voller Weitergabe " + fmt(pt.expected) : "");
    const exp = pt ? '<i class="dot-exp" style="left:' + pos(pt.expected) + '"></i><span class="db-val exp" style="left:' + pos(pt.expected) + '">' + fmt(pt.expected) + "</span>" : "";
    const mids = hist.slice(1, -1).map(p => '<i class="dot-mid" style="left:' + pos(p.price) + '"></i>').join("");
    return '<div class="db-row" role="listitem" tabindex="0" data-tip="' + esc(label) + '">' +
      '<div class="db-name"><b>' + esc(v.name) + "</b><small>" + esc(v.district || "") + " · seit " + fmtMonth(c.from.validFrom) + "</small></div>" +
      '<div class="db-track">' +
        '<span class="db-line" style="left:' + pos(lo) + ";width:calc(" + pos(hi) + " - " + pos(lo) + ')"></span>' + mids +
        exp + (dir === "flat" ? "" : '<i class="dot-old" style="left:' + pos(c.from.price) + '"></i>') + '<i class="dot-new" style="left:' + pos(c.to.price) + '"></i>' +
        (dir === "flat" ? "" : '<span class="db-val prev" style="left:' + pos(c.from.price) + '">' + fmt(c.from.price) + "</span>") +
        '<span class="db-val now" style="left:' + pos(c.to.price) + '">' + fmt(c.to.price) + "</span>" +
      "</div>" +
      '<div class="db-change ' + dir + '">' + { up: "↑", down: "↓", flat: "→" }[dir] + " " + (dir === "flat" ? "gleich" : fmtPct(c.pct)) +
        (pt ? '<small class="pt pt-' + pt.verdict + '">MwSt ' + pt.r0 + " → " + pt.r1 + " %</small>" : "") + "</div>" +
      '<span class="sr-only">' + esc(label) + "</span></div>";
  }).join("");
  $("axis").innerHTML = '<div class="db-name"></div><div class="axis-track">' +
    t.out.map(v => '<span style="left:' + pos(v) + '">' + v.toFixed(v % 1 ? 2 : 0).replace(".", ",") + " €</span>").join("") + '</div><div class="db-change"></div>';
  // Rasterlinien auf jeder Spur
  const grid = t.out.map(v => '<i class="grid" style="left:' + pos(v) + '"></i>').join("");
  document.querySelectorAll(".db-track").forEach(tr => tr.insertAdjacentHTML("afterbegin", grid));
}

// Tooltip bei Hover und Tastaturfokus
const tip = $("tip");
function showTip(row, x, y) {
  tip.textContent = row.dataset.tip; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(Math.max(8, x - r.width / 2), innerWidth - r.width - 8) + "px";
  tip.style.top = Math.max(8, y - r.height - 12) + "px";
}
$("chart").addEventListener("mousemove", e => { const row = e.target.closest(".db-row"); if (row) showTip(row, e.clientX, e.clientY); else tip.hidden = true; });
$("chart").addEventListener("mouseleave", () => (tip.hidden = true));
$("chart").addEventListener("focusin", e => { const row = e.target.closest(".db-row"); if (!row) return; const r = row.getBoundingClientRect(); showTip(row, r.left + r.width / 2, r.top); });
$("chart").addEventListener("focusout", () => (tip.hidden = true));

$("switch").innerHTML = Object.entries(ITEMS).map(([k, v]) =>
  '<button type="button" class="chip" data-it="' + k + '" aria-pressed="false"><b>' + (v.emoji ? '<span class="emo" aria-hidden="true">' + v.emoji + "</span> " : "") + v.label + "</b><small></small></button>").join("");
$("switch").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  current = b.dataset.it; history.replaceState(null, "", "#" + current); render();
});
let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(render, 150); });
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (ITEMS[h]) { current = h; render(); } });

// ---------- Mehrwertsteuer-Check (alle Speisen-Indizes) ----------
const VERDICT = { nein: "✕ nein", teilweise: "◐ teilweise", voll: "✓ ja" };
function renderVat() {
  const comps = [];
  for (const it of VAT_FOOD_ITEMS) for (const v of venues) {
    if (v.active === false || (it === "pizza" && v.type !== "Pizzeria")) continue;
    const c = changeOf(historyOf(prices, v.id, it)); if (!c) continue;
    const pt = passThrough(c.from, c.to); if (pt && pt.cut) comps.push({ v, it, c, pt });
  }
  comps.sort((a, b) => b.pt.netPct - a.pt.netPct);
  // Zeitleiste 2019–2026
  const t0 = Date.parse("2019-01-01"), t1 = Date.parse("2027-01-01"), w = d => (Math.min(Date.parse(d), t1) - t0) / (t1 - t0) * 100;
  $("vatTimeline").innerHTML = '<div class="vt-bar">' + VAT_PERIODS.map(p => {
    const left = w(p.from), width = w(p.to === "2099-12-31" ? "2027-01-01" : p.to) - left;
    return '<div class="vt-seg ' + (p.food < 19 ? "low" : "std") + '" style="left:' + left + "%;width:" + width + '%" title="' + esc(p.label) + '"><b>' + p.food + " %</b></div>";
  }).join("") + '</div><div class="vt-years">' + [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map(y => '<span style="left:' + w(y + "-01-01") + '%">' + y + "</span>").join("") + "</div>" +
    '<p class="vt-note">Mehrwertsteuer auf Speisen im Lokal. Getränke: 19 % (2. Hj. 2020: 16 %).</p>';
  if (!comps.length) { $("vatLead").textContent = "Noch keine Karten von vor und nach einer Steueränderung."; $("vatTable").innerHTML = ""; }
  else {
    const passed = comps.filter(x => x.pt.verdict !== "nein").length;
    const avg = comps.reduce((s, x) => s + (x.c.to.price - x.c.from.price) / x.c.from.price * 100, 0) / comps.length;
    $("vatLead").innerHTML = "Seit 1. Januar 2026 gilt auf Speisen im Lokal <b>7 % statt 19 %</b>. Bei voller Weitergabe wären die Preise um gut 10 % gefallen. " +
      "In unseren Daten ist das bei <b>" + passed + " von " + comps.length + "</b> Gerichten passiert. Im Schnitt stiegen die Preise sogar um <b>" + fmtPct(avg) + "</b>.";
    $("vatTable").innerHTML = "<thead><tr><th>Lokal · Gericht</th><th class='num'>vorher</th><th class='num'>erwartet bei voller Weitergabe</th><th class='num'>jetzt</th><th class='num'>Nettopreis</th><th>weitergegeben?</th></tr></thead><tbody>" +
      comps.map(({ v, it, c, pt }) => "<tr><td><b>" + esc(v.name) + "</b><br><small>" + esc(ITEMS[it].title) + "</small></td>" +
        "<td class='num'>" + fmt(c.from.price) + "<br><small>" + fmtMonth(c.from.validFrom) + " · " + pt.r0 + " %</small></td>" +
        "<td class='num'>" + fmt(pt.expected) + "<br><small>bei " + pt.r1 + " %</small></td>" +
        "<td class='num'><b>" + fmt(c.to.price) + "</b><br><small>" + fmtMonth(c.to.validFrom) + " · " + pt.r1 + " %</small></td>" +
        "<td class='num'>" + fmtPct(pt.netPct) + "</td>" +
        "<td><span class='verdict-pt pt-" + pt.verdict + "'>" + VERDICT[pt.verdict] + "</span></td></tr>").join("") + "</tbody>";
  }
  $("vatSources").innerHTML = "Quellen zu den Steuersätzen: " + VAT_SOURCES.map(s => '<a href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.label) + "</a>").join(" · ");
}

(async () => {
  try {
    const backend = await createBackend();
    const data = await backend.loadAll();
    venues = data.venues; prices = data.prices;
    renderVat();
    render();
  } catch (e) {
    console.error(e);
    $("chartEmpty").hidden = false; $("chartEmpty").textContent = "Die Daten sind gerade nicht erreichbar. Bitte später noch einmal versuchen.";
  }
})();
