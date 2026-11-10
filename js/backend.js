// Datenzugriff. Zwei Varianten mit gleicher Schnittstelle:
//  - "supabase": Lokale, Preise und Meldungen in Supabase, Admin-Login über Supabase Auth
//  - "local":    Startdaten aus data/venues.json, Änderungen im localStorage dieses Browsers
import { CONFIG } from "./config.js";
import { fromJson, toJson } from "./model.js";

export async function createBackend() {
  if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) return supabaseBackend();
  return localBackend();
}

/* ---------------- Supabase ---------------- */
async function supabaseBackend() {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm");
  const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  const must = ({ data, error }) => { if (error) throw error; return data; };

  const venueFrom = r => ({
    id: r.id, name: r.name, type: r.type, district: r.district || "", address: r.address || "",
    location: r.lat != null && r.lon != null ? { lat: r.lat, lon: r.lon } : null,
    notes: r.notes || {}, wanted: r.wanted || [], active: r.active,
  });
  const venueTo = v => ({
    id: v.id, name: v.name, type: v.type, district: v.district, address: v.address,
    lat: v.location ? v.location.lat : null, lon: v.location ? v.location.lon : null,
    notes: v.notes || {}, wanted: v.wanted || [], active: v.active !== false, updated_at: new Date().toISOString(),
  });
  const priceFrom = r => ({
    id: r.id, venueId: r.venue_id, item: r.item, price: Number(r.price), tap: r.tap, note: r.note,
    sourceLabel: r.source_label, sourceUrl: r.source_url, validFrom: r.valid_from, standLabel: r.stand_label,
    outdated: r.outdated, createdAt: Date.parse(r.created_at),
  });
  const reportFrom = r => ({
    id: r.id, venueId: r.venue_id, item: r.item, price: Number(r.price), tap: r.tap, note: r.note,
    status: r.status, createdAt: Date.parse(r.created_at),
  });

  return {
    mode: "supabase",
    async loadAll({ includeInactive = false } = {}) {
      let vq = sb.from("venues").select("*").order("name");
      if (!includeInactive) vq = vq.eq("active", true);
      const [venues, prices, reports] = await Promise.all([
        vq.then(must),
        sb.from("prices").select("*").order("valid_from", { ascending: false }).limit(5000).then(must),
        sb.from("reports").select("*").eq("status", "approved").order("created_at", { ascending: false }).limit(1000).then(must),
      ]);
      return { venues: venues.map(venueFrom), prices: prices.map(priceFrom), reports: reports.map(reportFrom) };
    },
    async addReport(r) {
      must(await sb.from("reports").insert({ venue_id: r.venueId, item: r.item, price: r.price, tap: r.tap ?? null, note: r.note ?? null }));
      return { pending: true };
    },

    // --- Admin ---
    async getUser() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user : null; },
    async signIn(email, password) { must(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { await sb.auth.signOut(); },
    async isAdmin() { return !!must(await sb.rpc("is_admin")); },
    async listReports(status) {
      return must(await sb.from("reports").select("*").eq("status", status).order("created_at", { ascending: false }).limit(300)).map(reportFrom);
    },
    async setReportStatus(id, status) {
      const user = await this.getUser();
      must(await sb.from("reports").update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user ? user.id : null }).eq("id", id));
    },
    async saveVenue(v) { must(await sb.from("venues").upsert(venueTo(v))); },
    async addPrice(p) {
      const row = must(await sb.from("prices").insert({
        venue_id: p.venueId, item: p.item, price: p.price, tap: p.tap, note: p.note, source_label: p.sourceLabel,
        source_url: p.sourceUrl, valid_from: p.validFrom, stand_label: p.standLabel, outdated: !!p.outdated,
      }).select().single());
      return priceFrom(row);
    },
    async deletePrice(id) { must(await sb.from("prices").delete().eq("id", id)); },
  };
}

/* ---------------- Lokal (ohne Server) ---------------- */
const LOCAL_KEY = "wtf-index:local-db";
function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); } catch { return null; } }
function writeLocal(db) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(db)); } catch { /* voll oder gesperrt */ } }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

async function localBackend() {
  const json = await fetch("data/venues.json").then(r => r.json());
  const base = fromJson(json);
  // Überlagerung: geänderte/neue Lokale, zusätzliche Preise, gelöschte Preis-IDs, Meldungen
  let db = readLocal() || { venues: {}, prices: [], deleted: [], reports: [] };
  const save = () => writeLocal(db);
  const all = () => {
    const venues = base.venues.filter(v => !db.venues[v.id]).concat(Object.values(db.venues));
    const prices = base.prices.concat(db.prices).filter(p => !db.deleted.includes(p.id));
    return { venues, prices };
  };

  return {
    mode: "local",
    async loadAll({ includeInactive = false } = {}) {
      const { venues, prices } = all();
      return {
        venues: includeInactive ? venues : venues.filter(v => v.active !== false),
        prices,
        reports: db.reports.filter(r => r.status === "approved"),
      };
    },
    async addReport(r) {
      // Wie im Betrieb: Meldungen warten auf Freigabe (lokal unter admin.html).
      db.reports.unshift({ ...r, id: uid(), status: "pending", createdAt: Date.now() });
      save();
      return { pending: true };
    },
    async getUser() { return { email: "lokal" }; },
    async signIn() {},
    async signOut() {},
    async isAdmin() { return true; },
    async listReports(status) { return db.reports.filter(r => r.status === status); },
    async setReportStatus(id, status) { const r = db.reports.find(x => x.id === id); if (r) { r.status = status; save(); } },
    async saveVenue(v) { db.venues[v.id] = JSON.parse(JSON.stringify(v)); save(); },
    async addPrice(p) { const row = { ...p, id: uid(), createdAt: Date.now() }; db.prices.push(row); save(); return row; },
    async deletePrice(id) {
      const i = db.prices.findIndex(p => p.id === id);
      if (i >= 0) db.prices.splice(i, 1); else db.deleted.push(id);
      save();
    },
    // Nur lokal: Stand als venues.json exportieren bzw. Änderungen verwerfen
    exportJson() { const { venues, prices } = all(); return toJson(venues, prices); },
    hasChanges() { return Object.keys(db.venues).length + db.prices.length + db.deleted.length > 0; },
    resetChanges() { db = { venues: {}, prices: [], deleted: [], reports: db.reports }; save(); },
  };
}
