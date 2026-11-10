// Erzeugt supabase/seed.sql aus data/venues.json.
// Aufruf im Projektordner:  node scripts/make-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fromJson } from "../js/model.js";

const json = JSON.parse(readFileSync(new URL("../data/venues.json", import.meta.url), "utf8"));
const { venues, prices } = fromJson(json);

const q = v => (v === null || v === undefined ? "null" : "'" + String(v).replace(/'/g, "''") + "'");
const num = v => (v === null || v === undefined ? "null" : String(v));
const arr = a => "array[" + a.map(q).join(",") + "]::text[]";

let sql = `-- Startdaten für den WTF-Index (erzeugt mit scripts/make-seed.mjs, Stand ${json.collected})
-- Nach supabase/schema.sql ausführen. Bestehende Lokale werden aktualisiert, Preise nur ergänzt.

insert into public.venues (id, name, type, district, address, lat, lon, notes, wanted, active) values
`;
sql += venues.map(v => `  (${q(v.id)}, ${q(v.name)}, ${q(v.type)}, ${q(v.district)}, ${q(v.address)}, ${num(v.location?.lat)}, ${num(v.location?.lon)}, ${q(JSON.stringify(v.notes))}::jsonb, ${arr(v.wanted)}, ${v.active})`).join(",\n");
sql += `
on conflict (id) do update set name = excluded.name, type = excluded.type, district = excluded.district,
  address = excluded.address, lat = excluded.lat, lon = excluded.lon, notes = excluded.notes,
  wanted = excluded.wanted, active = excluded.active, updated_at = now();

insert into public.prices (venue_id, item, price, tap, note, source_label, source_url, valid_from, stand_label, outdated)
select * from (values
`;
sql += prices.map(p => `  (${q(p.venueId)}, ${q(p.item)}, ${num(p.price)}::numeric, ${q(p.tap)}, ${q(p.note)}, ${q(p.sourceLabel)}, ${q(p.sourceUrl)}, ${q(p.validFrom)}::date, ${q(p.standLabel)}, ${p.outdated})`).join(",\n");
sql += `
) as v(venue_id, item, price, tap, note, source_label, source_url, valid_from, stand_label, outdated)
where not exists (
  select 1 from public.prices p
  where p.venue_id = v.venue_id and p.item = v.item and p.valid_from = v.valid_from and p.price = v.price
);
`;
writeFileSync(new URL("../supabase/seed.sql", import.meta.url), sql);
console.log(`seed.sql: ${venues.length} Lokale, ${prices.length} Preise`);
