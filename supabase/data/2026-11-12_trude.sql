-- Bar Trude (Mitte) mit Bierpreisen aus der Getränkekarte der Website, Stand 12.11.2026.
-- Im Supabase-SQL-Editor einmal ausführen. Mehrfaches Ausführen schadet nicht.
insert into public.venues (id, name, type, district, address, lat, lon, notes, wanted, active) values
  ('trude', 'Trude', 'Bar', 'Mitte', 'Eberhardstr. 10 (Eingang Töpferstr./Nadlerstr.)', 48.7748, 9.1755,
   '{"wasser":"Nur 0,25 l und 0,7 l (Mineralwasser 0,7 l 5,50 €)"}'::jsonb, '{}', true)
on conflict (id) do nothing;

insert into public.prices (venue_id, item, price, tap, note, source_label, valid_from, stand_label)
select v.* from (values
  ('trude', 'bier3', 4.00::numeric, 'f', 'Export oder Meister Pils klar vom Fass', 'eigene Website (Screenshot)', '2026-11-12'::date, '12.11.2026'),
  ('trude', 'bier',  4.50::numeric, 'f', 'Export oder Meister Pils klar vom Fass', 'eigene Website (Screenshot)', '2026-11-12'::date, '12.11.2026')
) as v(venue_id, item, price, tap, note, source_label, valid_from, stand_label)
where not exists (select 1 from public.prices p where p.venue_id = v.venue_id and p.item = v.item and p.price = v.price);
