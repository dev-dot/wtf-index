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
  // Selbst gehostet (vendor/supabase.js, UMD-Build), damit keine Daten an ein CDN gehen.
  if (!window.supabase) await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "vendor/supabase.js"; s.onload = res; s.onerror = () => rej(new Error("vendor/supabase.js nicht geladen"));
    document.head.appendChild(s);
  });
  const { createClient } = window.supabase;
  const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  const must = ({ data, error }) => { if (error) throw error; return data; };

  const venueFrom = r => ({
    id: r.id, name: r.name, type: r.type, district: r.district || "", address: r.address || "",
    location: r.lat != null && r.lon != null ? { lat: r.lat, lon: r.lon } : null,
    notes: r.notes || {}, wanted: r.wanted || [], active: r.active,
    statement: r.statement || null, statementDate: r.statement_date || null,
  });
  const venueTo = v => ({
    id: v.id, name: v.name, type: v.type, district: v.district, address: v.address,
    lat: v.location ? v.location.lat : null, lon: v.location ? v.location.lon : null,
    notes: v.notes || {}, wanted: v.wanted || [], active: v.active !== false, updated_at: new Date().toISOString(),
    ...(v.statement !== undefined ? { statement: v.statement || null, statement_date: v.statementDate || null } : {}),
  });
  const priceFrom = r => ({
    id: r.id, venueId: r.venue_id, item: r.item, price: Number(r.price), tap: r.tap, note: r.note,
    sourceLabel: r.source_label, sourceUrl: r.source_url, validFrom: r.valid_from, standLabel: r.stand_label,
    outdated: r.outdated, correction: r.correction || null, createdAt: Date.parse(r.created_at),
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
        ...(p.correction ? { correction: p.correction } : {}),
      }).select().single());
      return priceFrom(row);
    },
    async deletePrice(id) { must(await sb.from("prices").delete().eq("id", id)); },

    // --- Speisekarten ---
    async addMenuUpload(u) {
      const folder = uid(), paths = [];
      for (const [i, f] of u.files.entries()) {
        const path = "uploads/" + folder + "/" + (i + 1) + "." + fileExt(f);
        const { error } = await sb.storage.from("menus").upload(path, f, { contentType: f.type || undefined, upsert: false });
        if (error) { error.userMessage = "Hochladen hat nicht geklappt (" + (error.message || "Fehler") + "). Bitte noch einmal versuchen."; throw error; }
        paths.push(path);
      }
      must(await sb.from("menu_uploads").insert({
        venue_id: u.venueId, venue_name: u.venueName, venue_address: u.venueAddress, stand: u.stand, note: u.note,
        files: paths, file_names: u.files.map(f => f.name.slice(0, 120)),
      }));
    },
    async listMenuUploads(status) {
      return must(await sb.from("menu_uploads").select("*").eq("status", status).order("created_at", { ascending: false }).limit(200)).map(menuFrom);
    },
    async setMenuUploadStatus(id, status) {
      const user = await this.getUser();
      must(await sb.from("menu_uploads").update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user ? user.id : null }).eq("id", id));
    },
    async fileUrl(path) { return must(await sb.storage.from("menus").createSignedUrl(path, 600)).signedUrl; },
    async deleteMenuFiles(m) {
      if (m.files.length) {
        const { error } = await sb.storage.from("menus").remove(m.files);
        if (error) throw error;
      }
      must(await sb.from("menu_uploads").update({ files_deleted_at: new Date().toISOString() }).eq("id", m.id));
    },

    // --- Beiträge ---
    async listArticles({ all = false } = {}) {
      let q = sb.from("articles").select("*").order("published_at", { ascending: false, nullsFirst: true }).limit(200);
      if (!all) q = q.eq("status", "published");
      return must(await q).map(articleFrom);
    },
    async saveArticle(a) {
      const row = {
        slug: a.slug, title: a.title, teaser: a.teaser || null, body: a.body || "", author: a.author || null,
        venue_ids: a.venueIds || [], status: a.status, published_at: a.publishedAt ? new Date(a.publishedAt).toISOString() : null,
        correction: a.correction || null, updated_at: new Date().toISOString(),
      };
      const res = a.id ? await sb.from("articles").update(row).eq("id", a.id).select().single() : await sb.from("articles").insert(row).select().single();
      return articleFrom(must(res));
    },
    async deleteArticle(id) { must(await sb.from("articles").delete().eq("id", id)); },

    // --- Hinweise ---
    async addNotice(n) {
      must(await sb.from("notices").insert({
        kind: n.kind, venue_id: n.venueId, message: n.message, name: n.name, email: n.email, good_faith: !!n.goodFaith,
      }));
    },
    async listNotices(status) {
      return must(await sb.from("notices").select("*").eq("status", status).order("created_at", { ascending: false }).limit(200)).map(r => ({
        id: r.id, kind: r.kind, venueId: r.venue_id, message: r.message, name: r.name, email: r.email, goodFaith: r.good_faith,
        status: r.status, createdAt: Date.parse(r.created_at),
      }));
    },
    async setNoticeStatus(id, status) {
      const user = await this.getUser();
      must(await sb.from("notices").update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user ? user.id : null }).eq("id", id));
    },
  };
}

const articleFrom = r => ({
  id: r.id, slug: r.slug, title: r.title, teaser: r.teaser, body: r.body, author: r.author, venueIds: r.venue_ids || [],
  status: r.status, publishedAt: r.published_at ? Date.parse(r.published_at) : null, correction: r.correction,
  updatedAt: Date.parse(r.updated_at),
});
const menuFrom = r => ({
  id: r.id, venueId: r.venue_id, venueName: r.venue_name, venueAddress: r.venue_address, stand: r.stand, note: r.note,
  files: r.files || [], fileNames: r.file_names || [], status: r.status, createdAt: Date.parse(r.created_at),
  filesDeletedAt: r.files_deleted_at ? Date.parse(r.files_deleted_at) : null,
});
function fileExt(f) {
  const m = /\.([a-z0-9]{2,5})$/i.exec(f.name);
  if (m) return m[1].toLowerCase();
  return ({ "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" })[f.type] || "bin";
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
  db.menus = db.menus || []; db.files = db.files || {}; db.notices = db.notices || []; db.articles = db.articles || [];
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
    // Speisekarten: lokal als data:-URL gespeichert, daher nur kleine Dateien
    async addMenuUpload(u) {
      const total = u.files.reduce((s, f) => s + f.size, 0);
      if (total > 3 * 1024 * 1024) {
        const e = new Error("too large"); e.userMessage = "Im lokalen Modus gehen nur Dateien bis zusammen 3 MB. Mit Supabase sind es 10 MB pro Datei."; throw e;
      }
      const id = uid(), paths = [];
      for (const [i, f] of u.files.entries()) {
        const path = "local/" + id + "/" + (i + 1);
        db.files[path] = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
        paths.push(path);
      }
      const { files, ...rest } = u;
      db.menus.unshift({ ...rest, id, files: paths, fileNames: files.map(f => f.name), status: "pending", createdAt: Date.now() });
      save();
      if (!localStorage.getItem(LOCAL_KEY) || !localStorage.getItem(LOCAL_KEY).includes(id)) {
        const e = new Error("quota"); e.userMessage = "Der Browser-Speicher ist voll. Im lokalen Modus bitte kleinere Dateien wählen."; throw e;
      }
    },
    async listMenuUploads(status) { return db.menus.filter(m => m.status === status); },
    async setMenuUploadStatus(id, status) { const m = db.menus.find(x => x.id === id); if (m) { m.status = status; save(); } },
    async fileUrl(path) { return db.files[path] || null; },
    async deleteMenuFiles(m) {
      for (const p of m.files) delete db.files[p];
      const x = db.menus.find(y => y.id === m.id); if (x) x.filesDeletedAt = Date.now();
      save();
    },
    async listArticles({ all = false } = {}) {
      return db.articles.filter(a => all || (a.status === "published" && a.publishedAt <= Date.now()))
        .sort((a, b) => (b.publishedAt || Infinity) - (a.publishedAt || Infinity));
    },
    async saveArticle(a) {
      if (db.articles.some(x => x.slug === a.slug && x.id !== a.id)) { const e = new Error("duplicate slug"); e.userMessage = "Diese Adresse (Slug) gibt es schon."; throw e; }
      const row = { ...a, id: a.id || uid(), updatedAt: Date.now() };
      const i = db.articles.findIndex(x => x.id === row.id);
      if (i >= 0) db.articles[i] = row; else db.articles.unshift(row);
      save(); return row;
    },
    async deleteArticle(id) { db.articles = db.articles.filter(a => a.id !== id); save(); },
    async addNotice(n) { db.notices.unshift({ ...n, id: uid(), status: "open", createdAt: Date.now() }); save(); },
    async listNotices(status) { return db.notices.filter(n => n.status === status); },
    async setNoticeStatus(id, status) { const n = db.notices.find(x => x.id === id); if (n) { n.status = status; save(); } },
    // Nur lokal: Stand als venues.json exportieren bzw. Änderungen verwerfen
    exportJson() { const { venues, prices } = all(); return toJson(venues, prices); },
    hasChanges() { return Object.keys(db.venues).length + db.prices.length + db.deleted.length > 0; },
    resetChanges() { db = { venues: {}, prices: [], deleted: [], reports: db.reports, menus: db.menus, files: db.files, notices: db.notices, articles: db.articles }; save(); },
  };
}
