-- Startdaten für den WTF-Index (erzeugt mit scripts/make-seed.mjs, Stand 2026-11-10)
-- Nach supabase/schema.sql ausführen. Bestehende Lokale werden aktualisiert, Preise nur ergänzt.

insert into public.venues (id, name, type, district, address, lat, lon, notes, wanted, active) values
  ('r01', 'Ragazzi', 'Pizzeria', 'West', 'Breitscheidstr. 22', 48.7772, 9.1668, '{"bier":"Nur Weissbier in 0,5 l (5,00 €, zählt nicht)","wasser":"Nur 0,5 l im Angebot"}'::jsonb, array[]::text[], true),
  ('r02', 'Italo Disco', 'Pizzeria', 'West', 'Augustenstr. 70', 48.7712, 9.1612, '{"wasser":"Getränkekarte ohne Wasser und Softdrinks","bier3":"Getränkekarte ohne Bier","bier":"Getränkekarte ohne Bier"}'::jsonb, array[]::text[], true),
  ('r20', 'L''Artista Mitte', 'Pizzeria', 'Mitte', 'Eberhardstr. 69–71', 48.7729, 9.1796, '{}'::jsonb, array[]::text[], true),
  ('r03', 'L''Artista Plieningen', 'Pizzeria', 'Plieningen', 'Filderhauptstr. 12', 48.7012, 9.2138, '{}'::jsonb, array[]::text[], true),
  ('r04', 'Ciao Amore Pizza', 'Pizzeria', 'Mitte', 'Eberhardstr. 10', 48.7744, 9.1762, '{}'::jsonb, array[]::text[], true),
  ('r19', 'Da Peppone (HTC)', 'Pizzeria', 'Degerloch', 'Bopseräcker 1 (HTC)', 48.7488, 9.1795, '{}'::jsonb, array[]::text[], true),
  ('r06', 'Alaturka', 'Döner', 'Mitte', 'Olgastr. 75', 48.7712, 9.1832, '{}'::jsonb, array[]::text[], true),
  ('r07', 'Kebaphaus am Feuersee', 'Döner', 'West', 'Silberburgstr. 149', 48.7728, 9.1668, '{}'::jsonb, array[]::text[], true),
  ('r18', 'Schwab Döner', 'Döner', 'West', 'Schwabstr. 57', 48.7745, 9.1552, '{"doener":"Noch kein Preis erfasst"}'::jsonb, array['doener']::text[], true),
  ('r16', 'Dilgelay', 'Döner', 'Ost', 'Neckarstr. 156 (Stöckach)', 48.7862, 9.1985, '{"wasser":"Nur 0,5 l: Mineralwasser 2,00 €","bier3":"Kein Bier auf der Karte","bier":"Kein Bier auf der Karte"}'::jsonb, array[]::text[], true),
  ('r17', 'Regenbogen Imbiss', 'Döner', 'Möhringen', 'Möhringen (Adresse folgt)', 48.7232, 9.1452, '{"doener":"Noch kein Preis erfasst · Standort ungefähr"}'::jsonb, array['doener']::text[], true),
  ('r21', 'Sutsche', 'Kneipe', 'West', 'Breitscheidstr. 38', 48.7768, 9.1648, '{}'::jsonb, array[]::text[], true),
  ('r11', 'Gasthaus zur Linde', 'Schwäbisch', 'Möhringen', 'Sigmaringer Str. 49', 48.7248, 9.1498, '{"bier":"Kein Pils oder Helles in 0,5 l (Hefeweizen 5,90 € zählt nicht)"}'::jsonb, array[]::text[], true),
  ('r12', 'Weinstube Fröhlich', 'Schwäbisch', 'Mitte', 'Leonhardstr. 5', 48.7741, 9.1812, '{"bier":"Kein 0,5 l im Angebot, nur 0,3 l vom Fass (siehe Bier 0,3)"}'::jsonb, array[]::text[], true),
  ('r13', 'Weinstube Zur Kiste', 'Schwäbisch', 'Mitte', 'Kanalstr. 2', 48.7747, 9.1826, '{"wasser":"Website zeigt nur Speisen und Wein, keine Wasserpreise","bier3":"Website zeigt nur Speisen und Wein, keine Bierpreise","bier":"Website zeigt nur Speisen und Wein, keine Bierpreise"}'::jsonb, array[]::text[], true),
  ('r14', 'Weinstube Moegle', 'Schwäbisch', 'Feuerbach', 'Dieterlestr. 32', 48.8127, 9.1598, '{"wasser":"Speisekarte ohne Kaltgetränke","bier3":"Speisekarte ohne Kaltgetränke","bier":"Speisekarte ohne Kaltgetränke"}'::jsonb, array[]::text[], true),
  ('r15', 'Weinstube Burg', 'Schwäbisch', 'Kaltental', 'Burgstr. 29', 48.7468, 9.1312, '{}'::jsonb, array[]::text[], true)
on conflict (id) do update set name = excluded.name, type = excluded.type, district = excluded.district,
  address = excluded.address, lat = excluded.lat, lon = excluded.lon, notes = excluded.notes,
  wanted = excluded.wanted, active = excluded.active, updated_at = now();

insert into public.prices (venue_id, item, price, tap, note, source_label, source_url, valid_from, stand_label, outdated)
select * from (values
  ('r01', 'bier3', 4.7::numeric, 'b', 'Moretti oder Peroni, 0,33 l Flasche', 'Hauskarte (PDF)', null, '2026-10-01'::date, 'Lokal-Karte 10/2026', false),
  ('r01', 'pizza', 15.5::numeric, null, 'San Marzano, Fior di Latte aus Agerola · auf Wolt 16,50 €', 'Hauskarte (PDF)', null, '2026-10-01'::date, 'Lokal-Karte 10/2026', false),
  ('r02', 'pizza', 13.9::numeric, null, 'San Marzano, Fior di Latte · April 2023 noch 10,90 € (+28 %)', 'Hauskarte (PDF)', null, '2026-10-19'::date, '19.10.2026', false),
  ('r20', 'pizza', 13.5::numeric, null, 'gleicher Preis wie in Plieningen', 'Angabe WTF-Team', null, '2026-11-10'::date, '10.11.2026', false),
  ('r03', 'pizza', 13.5::numeric, null, 'April 2024 noch 13,00 € (+4 %)', 'Angabe WTF-Team', null, '2026-11-10'::date, '10.11.2026', false),
  ('r04', 'pizza', 14::numeric, null, 'auf Wolt 16,00 €', 'speisekarte.de', 'https://www.speisekarte.de/stuttgart/restaurant/ciao_amore_pizza/speisekarte', '2025-11-04'::date, '04.11.2025', false),
  ('r19', 'wasser', 6::numeric, null, 'San Pellegrino / Acqua Panna', 'Hauskarte (PDF)', null, '2026-05-15'::date, '15.05.2026', false),
  ('r19', 'bier3', 3.5::numeric, null, 'Cluss Kellerpils oder Dinkelacker Privat, Fass oder Flasche nicht angegeben', 'Hauskarte (PDF)', null, '2026-05-15'::date, '15.05.2026', false),
  ('r19', 'bier', 4::numeric, null, 'Cluss Kellerpils oder Dinkelacker Privat, Fass oder Flasche nicht angegeben', 'Hauskarte (PDF)', null, '2026-05-15'::date, '15.05.2026', false),
  ('r19', 'pizza', 10::numeric, null, 'Tomaten, Mozzarella, Basilikum', 'Hauskarte (PDF)', null, '2026-05-15'::date, '15.05.2026', false),
  ('r06', 'doener', 9.5::numeric, null, 'Steak im Brot mit Grillgemüse', 'speisekarte.de', 'https://www.speisekarte.de/stuttgart/restaurant/alaturka_das_stuttgarter_original/speisekarte', '2025-05-20'::date, '20.05.2025', false),
  ('r07', 'doener', 9.9::numeric, null, 'Döner Kebap · auf Lieferando zuvor 6,40 €', 'eigene Website (Screenshot)', null, '2026-11-10'::date, '10.11.2026', false),
  ('r16', 'doener', 8.5::numeric, null, 'Döner Kebap im Fladenbrot, Hack- oder Hähnchenfleisch · Scheibenfleisch 9,50 €', 'Tischkarte (PDF)', null, '2026-04-20'::date, '04/2026', false),
  ('r21', 'wasser', 5.5::numeric, null, 'Stilles Wasser oder Tafelwasser', 'Hauskarte (PDF)', null, '2026-11-10'::date, '10.11.2026', false),
  ('r21', 'bier3', 3.5::numeric, null, 'Export, Fass oder Flasche nicht angegeben · CD Pils 4,00 €', 'Hauskarte (PDF)', null, '2026-11-10'::date, '10.11.2026', false),
  ('r21', 'bier', 5::numeric, null, 'Export, Fass oder Flasche nicht angegeben · CD Pils 5,50 €', 'Hauskarte (PDF)', null, '2026-11-10'::date, '10.11.2026', false),
  ('r21', 'spaetzle', 14::numeric, null, 'hausgemacht, mit Salat', 'Hauskarte (PDF)', null, '2026-11-10'::date, '10.11.2026', false),
  ('r11', 'wasser', 8.5::numeric, null, 'Ensinger Bio Naturell / Medium', 'Hauskarte (PDF)', null, '2026-11-10'::date, '2026, Getränke 04/2025', false),
  ('r11', 'bier3', 4.7::numeric, 'f', 'Dinkelacker CD Pils vom Fass', 'Hauskarte (PDF)', null, '2026-11-10'::date, '2026, Getränke 04/2025', false),
  ('r11', 'spaetzle', 19.9::numeric, null, 'mit Röstzwiebeln & Feldsalat · Dez. 2023 noch 17,90 € (+11 %)', 'Hauskarte (PDF)', null, '2026-11-10'::date, '2026, Getränke 04/2025', false),
  ('r12', 'wasser', 7.2::numeric, null, 'Teinacher Medium / Still', 'Hauskarte (PDF)', null, '2026-11-10'::date, 'aktuell', false),
  ('r12', 'bier3', 5.1::numeric, 'f', 'Helles Export vom Fass · Pils 5,20 €', 'Hauskarte (PDF)', null, '2026-11-10'::date, 'aktuell', false),
  ('r12', 'spaetzle', 22.8::numeric, null, 'mit kleinem Salat · Dez. 2024 noch 20,10 € (+13 %)', 'Hauskarte (PDF)', null, '2026-11-10'::date, 'aktuell', false),
  ('r13', 'spaetzle', 16.9::numeric, null, 'mit gemischtem Salatteller', 'zur-kiste.de', 'https://www.zur-kiste.de/speisen-getraenke/', '2026-11-10'::date, '10.11.2026 geprüft', false),
  ('r14', 'spaetzle', 14::numeric, null, 'mit Butterzwiebeln & gemischtem Salat · seit Dez. 2024 unverändert', 'Hauskarte (PDF)', null, '2025-09-01'::date, '09/2025', false),
  ('r15', 'wasser', 5.8::numeric, null, 'Teinacher Mineralwasser', 'Hauskarte (PDF)', null, '2026-10-06'::date, 'Herbst/Winter 2026/27', false),
  ('r15', 'bier3', 3.8::numeric, 'f', '„Bier-chen vom Fass“', 'Hauskarte (PDF)', null, '2026-10-06'::date, 'Herbst/Winter 2026/27', false),
  ('r15', 'bier', 4.8::numeric, 'f', '„Halbe vom Fass“', 'Hauskarte (PDF)', null, '2026-10-06'::date, 'Herbst/Winter 2026/27', false),
  ('r15', 'spaetzle', 19.5::numeric, null, 'Burg-Kässpatzen mit Weisswein & Lauchzwiebel, Blattsalat · Dez. 2024 noch 18,50 € (+5 %)', 'Hauskarte (PDF)', null, '2026-10-06'::date, 'Herbst/Winter 2026/27', false)
) as v(venue_id, item, price, tap, note, source_label, source_url, valid_from, stand_label, outdated)
where not exists (
  select 1 from public.prices p
  where p.venue_id = v.venue_id and p.item = v.item and p.valid_from = v.valid_from and p.price = v.price
);
