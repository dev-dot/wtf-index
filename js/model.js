// Gemeinsames Datenmodell für Karte und Admin-Bereich.
//
// Venue:  { id, name, type, district, address, location:{lat,lon}|null, notes:{item:text}, wanted:[item], active }
// Price:  { id, venueId, item, price, tap:'f'|'b'|null, note, sourceLabel, sourceUrl, validFrom:'YYYY-MM-DD',
//           standLabel, outdated, createdAt }
// Report: { id, venueId, item, price, tap, note, status:'pending'|'approved'|'rejected', createdAt (ms) }

export const ITEMS = {
  wasser:   { emoji: "💧", label: "Wasser",      chip: "0,75 l",     title: "Große Flasche Wasser", spec: "Mineral- oder Tafelwasser, Flasche 0,75 l" },
  bier3:    { emoji: "🍺", label: "Bier 0,3",    chip: "0,3 l",      title: "Kleines Bier 0,3 l",   spec: "Pils, Helles oder Export · 0,3 oder 0,33 l · vom Fass, sonst Flasche · kein Weizen" },
  bier:     { emoji: "🍺", label: "Bier 0,5",    chip: "0,5 l",      title: "Bier 0,5 l",           spec: "Pils, Helles oder Export · vom Fass, sonst Flasche · kein Weizen" },
  doener:   { emoji: "🥙", label: "Döner",       chip: "im Brot",    title: "Döner",                spec: "Döner im Brot, normal, ohne Extras" },
  pizza:    { emoji: "🍕", label: "Margherita",  chip: "Pizza",      title: "Pizza Margherita",     spec: "Standardgröße laut Karte, nur Pizzerien" },
  spaetzle: { label: "Käsespätzle", chip: "schwäbisch", title: "Käsespätzle",          spec: "Hauptgericht-Portion" },
};
export const ITEM_KEYS = Object.keys(ITEMS);
export const isBeer = it => it === "bier" || it === "bier3";
export const VENUE_TYPES = ["Pizzeria", "Döner", "Schwäbisch", "Kneipe", "Restaurant", "Bar", "Biergarten", "Besen", "Imbiss"];
export const SOURCE_LABELS = ["Hauskarte (PDF)", "Angabe WTF-Team", "eigene Website", "eigene Website (Screenshot)", "speisekarte.de", "Wolt", "Lieferando"];

export const priceOk = p => typeof p === "number" && p >= 0.5 && p <= 60;

// Neuester Preis pro Lokal und Index (validFrom, dann createdAt).
export function currentPrices(prices) {
  const map = {};
  for (const p of prices) {
    const k = p.venueId + "|" + p.item;
    const c = map[k];
    if (!c || p.validFrom > c.validFrom || (p.validFrom === c.validFrom && (p.createdAt || 0) > (c.createdAt || 0))) map[k] = p;
  }
  return map;
}

// data/venues.json -> { venues, prices }
export function fromJson(json) {
  const venues = [], prices = [];
  for (const v of json.venues) {
    venues.push({
      id: v.id, name: v.name, type: v.type, district: v.district || "", address: v.address || "",
      location: v.location || null, notes: { ...(v.notes || {}) }, wanted: v.wanted || [], active: v.active !== false,
    });
    const push = (item, p, src, i) => prices.push({
      id: p.id || `${v.id}-${item}-${src.date || "seed"}-${i}`, venueId: v.id, item, price: p.price, tap: p.tap || null,
      note: p.note ?? (v.notes || {})[item] ?? null,
      sourceLabel: p.sourceLabel ?? src.label ?? null, sourceUrl: p.sourceUrl ?? src.url ?? null,
      validFrom: p.validFrom ?? src.date ?? "2026-01-01", standLabel: p.standLabel ?? src.stand ?? null,
      outdated: p.outdated ?? !!src.outdated, createdAt: p.createdAt || 0,
    });
    for (const [item, p] of Object.entries(v.prices || {})) push(item, p, v.source || {}, 0);
    (v.history || []).forEach((p, i) => push(p.item, p, {}, i + 1));
  }
  // Hinweise, die zu einem Preis gehören, stehen am Preis; in venue.notes bleiben nur die übrigen.
  const cur = currentPrices(prices);
  for (const v of venues) for (const it of Object.keys(v.notes)) if (cur[v.id + "|" + it]) delete v.notes[it];
  return { venues, prices };
}

// { venues, prices } -> Format von data/venues.json (aktuelle Preise + Verlauf)
export function toJson(venues, prices, collected = new Date().toISOString().slice(0, 10)) {
  const cur = currentPrices(prices);
  return {
    collected,
    venues: venues.map(v => {
      const mine = prices.filter(p => p.venueId === v.id);
      const out = {
        id: v.id, name: v.name, type: v.type, district: v.district, address: v.address, location: v.location,
        prices: {}, notes: { ...v.notes },
      };
      if (!v.active) out.active = false;
      if (v.wanted && v.wanted.length) out.wanted = v.wanted;
      const history = [];
      for (const p of mine) {
        const slim = { price: p.price };
        if (p.tap) slim.tap = p.tap;
        if (p.note) slim.note = p.note;
        Object.assign(slim, { sourceLabel: p.sourceLabel, sourceUrl: p.sourceUrl, validFrom: p.validFrom, standLabel: p.standLabel });
        if (p.outdated) slim.outdated = true;
        if (cur[v.id + "|" + p.item] === p) out.prices[p.item] = slim;
        else history.push({ item: p.item, ...slim });
      }
      if (history.length) out.history = history.sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
      return out;
    }),
  };
}

export function slugify(name) {
  return name.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "lokal";
}

export const fmt = n => n.toFixed(2).replace(".", ",") + " €";
export const fmtShort = n => n.toFixed(2).replace(".", ",");
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
