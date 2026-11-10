// Besucher-Meldungen: Supabase, wenn konfiguriert, sonst Demo-Modus mit localStorage.
import { CONFIG } from "./config.js";

const LOCAL_KEY = "wtf-index:reports";

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}
function writeLocal(list) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* privat-Modus o. ä. */ }
}

export async function createStore() {
  if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
    return {
      mode: "supabase",
      // Nur freigegebene Meldungen sind öffentlich lesbar (siehe supabase/schema.sql).
      async list() {
        const { data, error } = await sb
          .from("reports")
          .select("venue_id,item,price,tap,note,created_at")
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return data.map(r => ({ venueId: r.venue_id, item: r.item, price: Number(r.price), tap: r.tap, note: r.note, createdAt: Date.parse(r.created_at) }));
      },
      // Neue Meldungen landen mit Status "pending" und erscheinen erst nach Freigabe.
      async add(r) {
        const { error } = await sb.from("reports").insert({ venue_id: r.venueId, item: r.item, price: r.price, tap: r.tap ?? null, note: r.note ?? null });
        if (error) throw error;
        return { pending: true };
      },
    };
  }
  return {
    mode: "local",
    async list() { return readLocal(); },
    async add(r) {
      const list = readLocal();
      list.unshift({ ...r, createdAt: Date.now() });
      writeLocal(list.slice(0, 500));
      return { pending: false };
    },
  };
}
