// Preisverlauf: Vorher-Nachher-Diagramm je Index (früherer Preis → aktueller Preis pro Lokal)
import { createBackend } from "./backend.js";
import { ITEMS, esc, fmt, historyOf, changeOf, fmtMonth, fmtPct } from "./model.js";

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

  const vals = withC.flatMap(x => x.hist.map(p => p.price));
  const t = ticks(Math.min(...vals), Math.max(...vals));
  const pos = p => ((p - t.lo) / (t.hi - t.lo) * 100).toFixed(2) + "%";

  $("chart").innerHTML = withC.map(({ v, hist, c }) => {
    const dir = c.diff > 0.004 ? "up" : c.diff < -0.004 ? "down" : "flat";
    const lo = Math.min(c.from.price, c.to.price), hi = Math.max(c.from.price, c.to.price);
    const label = v.name + ": " + fmtMonth(c.from.validFrom) + " " + fmt(c.from.price) + " → " + fmtMonth(c.to.validFrom) + " " + fmt(c.to.price) + " (" + fmtPct(c.pct) + ")";
    const mids = hist.slice(1, -1).map(p => '<i class="dot-mid" style="left:' + pos(p.price) + '"></i>').join("");
    return '<div class="db-row" role="listitem" tabindex="0" data-tip="' + esc(label) + '">' +
      '<div class="db-name"><b>' + esc(v.name) + "</b><small>" + esc(v.district || "") + " · seit " + fmtMonth(c.from.validFrom) + "</small></div>" +
      '<div class="db-track">' +
        '<span class="db-line" style="left:' + pos(lo) + ";width:calc(" + pos(hi) + " - " + pos(lo) + ')"></span>' + mids +
        (dir === "flat" ? "" : '<i class="dot-old" style="left:' + pos(c.from.price) + '"></i>') + '<i class="dot-new" style="left:' + pos(c.to.price) + '"></i>' +
        (dir === "flat" ? "" : '<span class="db-val prev" style="left:' + pos(c.from.price) + '">' + fmt(c.from.price) + "</span>") +
        '<span class="db-val now" style="left:' + pos(c.to.price) + '">' + fmt(c.to.price) + "</span>" +
      "</div>" +
      '<div class="db-change ' + dir + '">' + { up: "↑", down: "↓", flat: "→" }[dir] + " " + (dir === "flat" ? "gleich" : fmtPct(c.pct)) + "</div>" +
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

(async () => {
  try {
    const backend = await createBackend();
    const data = await backend.loadAll();
    venues = data.venues; prices = data.prices;
    render();
  } catch (e) {
    console.error(e);
    $("chartEmpty").hidden = false; $("chartEmpty").textContent = "Die Daten sind gerade nicht erreichbar. Bitte später noch einmal versuchen.";
  }
})();
