// Supabase Edge Function "extract-menu"
// Liest eine hochgeladene Speisekarte (PDF/Fotos) mit Claude aus und speichert einen Entwurf
// (Lokal + Preise der WTF-Indizes) in menu_uploads.extraction. Übernommen wird erst,
// wenn jemand vom Team den Entwurf im Admin-Bereich bestätigt.
//
// Secrets (Supabase Dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   – API-Schlüssel von console.anthropic.com
// Von Supabase automatisch gesetzt: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const MODEL = "claude-opus-5-5";
const ITEMS = ["wasser", "bier3", "bier", "doener", "pizza", "spaetzle", "maultaschen"] as const;
const VENUE_TYPES = ["Pizzeria", "Döner", "Schwäbisch", "Kneipe", "Restaurant", "Bar", "Biergarten", "Besen", "Imbiss"];
const MAX_BASE64_BYTES = 28 * 1024 * 1024; // Anfrage-Limit der API ist 32 MB

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `Du liest Speisekarten Stuttgarter Lokale für den WTF-Index aus, einen Preisvergleich für sieben feste Gerichte und Getränke.
Gib für jeden Index genau den Preis an, der auf der Karte steht. Erfinde nichts, rechne nichts hoch und schätze nicht. Steht ein passendes Angebot nicht auf der Karte, setze found auf false und price auf 0.

Regeln je Index:
- wasser: Mineral- oder Tafelwasser in der Flasche mit 0,75 l. Andere Größen (0,25 l, 0,5 l, 1 l) zählen nicht; erwähne sie dann in note.
- bier3: Kleines Bier 0,3 l oder 0,33 l. Nur Pils, Helles oder Export (kein Weizen, kein Radler, kein alkoholfreies Bier). Vom Fass, wenn es das gibt, sonst Flasche. Bei mehreren passenden Bieren das günstigste.
- bier: Bier 0,5 l. Gleiche Regeln wie bier3.
- doener: Döner im Brot (Fladenbrot), normale Größe, ohne Extras. Kein Dürüm/Yufka, keine Box, kein Teller, kein XL. Gibt es mehrere Fleischsorten, die günstigste normale Variante; die anderen in note.
- pizza: Pizza Margherita in Standardgröße. Keine Sonderformen (Party-Pizza, Familienpizza, Pizza aus der Pfanne/„nel ruoto“).
- spaetzle: Käsespätzle als Hauptgericht (keine Kinder- oder Beilagenportion).
- maultaschen: Maultaschen als Hauptgericht, geschmälzt oder mit Zwiebelschmelze, mit Kartoffelsalat oder Salat. Nicht: Maultaschensuppe, Maultaschen in der Brühe allein, gratinierte oder vegetarische Sonderformen, wenn es die normale Variante gibt.

Für jeden gefundenen Preis: dish = Bezeichnung genau wie auf der Karte (gekürzt, wenn sehr lang), note = kurzer Hinweis auf Deutsch (z. B. Beilage, Marke, andere Größen; leer, wenn nichts), confidence = high, wenn eindeutig; medium, wenn die Zuordnung eine Auslegung braucht; low, wenn der Preis schwer lesbar ist. tap: f = vom Fass, b = Flasche, unbekannt = nicht angegeben oder kein Bier.

Zum Lokal: Name, Adresse und Art nur angeben, wenn sie auf der Karte erkennbar sind, sonst leerer Text bzw. „unbekannt“. stand = Datum oder Saison der Karte, falls aufgedruckt (z. B. „Herbst/Winter 2026/27“), sonst leer.
warnings: kurze Hinweise auf Unklarheiten, z. B. unleserliche Seiten oder Preise, die nicht in Euro sind.`;

const itemSchema = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    price: { type: "number" },
    dish: { type: "string" },
    tap: { type: "string", enum: ["f", "b", "unbekannt"] },
    note: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["found", "price", "dish", "tap", "note", "confidence"],
  additionalProperties: false,
};
const SCHEMA = {
  type: "object",
  properties: {
    venue: {
      type: "object",
      properties: {
        name: { type: "string" },
        address: { type: "string" },
        type: { type: "string", enum: [...VENUE_TYPES, "unbekannt"] },
        stand: { type: "string" },
      },
      required: ["name", "address", "type", "stand"],
      additionalProperties: false,
    },
    items: {
      type: "object",
      properties: Object.fromEntries(ITEMS.map((k) => [k, itemSchema])),
      required: [...ITEMS],
      additionalProperties: false,
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["venue", "items", "warnings"],
  additionalProperties: false,
};

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function mediaType(path: string, blobType: string): string {
  const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] || "").toLowerCase();
  if (ext === "pdf" || blobType === "application/pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return blobType || "application/octet-stream";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!url || !serviceKey) return json({ error: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen." }, 500);
  if (!apiKey) return json({ error: "Das Secret ANTHROPIC_API_KEY ist nicht gesetzt." }, 500);
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Nur angemeldete Admins
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Nicht angemeldet." }, 401);
  const { data: adminRow } = await db.from("admins").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (!adminRow) return json({ error: "Nur für Admins." }, 403);

  const { uploadId } = await req.json().catch(() => ({ uploadId: null }));
  if (!uploadId) return json({ error: "uploadId fehlt." }, 400);
  const { data: up, error: upErr } = await db.from("menu_uploads").select("*").eq("id", uploadId).single();
  if (upErr || !up) return json({ error: "Speisekarte nicht gefunden." }, 404);
  if (up.files_deleted_at) return json({ error: "Die Dateien dieser Speisekarte sind schon gelöscht." }, 410);

  // Dateien laden
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const warnings: string[] = [];
  let total = 0;
  for (const path of up.files as string[]) {
    const { data: blob, error } = await db.storage.from("menus").download(path);
    if (error || !blob) { warnings.push("Datei konnte nicht geladen werden: " + path); continue; }
    const type = mediaType(path, blob.type);
    if (type === "image/heic") { warnings.push("HEIC-Foto übersprungen (Format wird nicht unterstützt). Bitte als JPG schicken lassen."); continue; }
    const data = toBase64(await blob.arrayBuffer());
    total += data.length;
    if (total > MAX_BASE64_BYTES) { warnings.push("Dateien zu groß, Rest übersprungen."); break; }
    if (type === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    else if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) {
      content.push({ type: "image", source: { type: "base64", media_type: type as "image/jpeg", data } });
    } else warnings.push("Dateityp nicht unterstützt: " + path);
  }
  if (!content.length) return json({ error: "Keine lesbaren Dateien.", warnings }, 422);

  let hint = "";
  if (up.venue_id) {
    const { data: v } = await db.from("venues").select("name,type,address").eq("id", up.venue_id).maybeSingle();
    if (v) hint = `Die Karte gehört laut Einsendung zu: ${v.name} (${v.type}), ${v.address || ""}.`;
  } else if (up.venue_name) hint = `Laut Einsendung ein neues Lokal: ${up.venue_name}${up.venue_address ? ", " + up.venue_address : ""}.`;
  if (up.stand) hint += ` Angegebener Stand: ${up.stand}.`;
  content.push({ type: "text", text: `${hint}\nLies die Preise der sieben Indizes aus dieser Speisekarte aus.` });

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Claude ist gerade ausgelastet. Bitte in einer Minute noch einmal." }, 429);
    if (err instanceof Anthropic.BadRequestError) return json({ error: "Claude konnte die Dateien nicht verarbeiten: " + err.message }, 422);
    if (err instanceof Anthropic.APIError) return json({ error: `Claude-Fehler ${err.status}: ${err.message}` }, 502);
    return json({ error: "Verbindung zu Claude fehlgeschlagen." }, 502);
  }

  if (response.stop_reason === "refusal") return json({ error: "Claude hat die Anfrage abgelehnt." }, 422);
  if (response.stop_reason === "max_tokens") return json({ error: "Antwort wurde abgeschnitten. Bitte weniger Seiten auf einmal schicken." }, 422);
  const text = response.content.find((b) => b.type === "text");
  let extraction;
  try { extraction = JSON.parse(text && text.type === "text" ? text.text : ""); }
  catch { return json({ error: "Antwort von Claude war kein gültiges JSON." }, 502); }
  extraction.warnings = [...warnings, ...(extraction.warnings || [])];
  extraction.model = response.model;

  const { error: saveErr } = await db.from("menu_uploads")
    .update({ extraction, extracted_at: new Date().toISOString() }).eq("id", uploadId);
  if (saveErr) return json({ error: "Entwurf konnte nicht gespeichert werden: " + saveErr.message }, 500);
  return json({ extraction });
});
