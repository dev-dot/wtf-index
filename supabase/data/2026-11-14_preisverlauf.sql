-- Preisverlauf: ältere Preise aus früheren Speisekarten (speisekarte.de) als eigene Einträge.
-- Im Supabase-SQL-Editor einmal ausführen. Mehrfaches Ausführen schadet nicht.
insert into public.prices (venue_id, item, price, source_label, valid_from, stand_label)
select v.* from (values
  ('r02', 'pizza', 10.90::numeric, 'speisekarte.de', '2023-04-20'::date, '20.04.2023'),
  ('r03', 'pizza', 13.00::numeric, 'speisekarte.de', '2024-04-09'::date, '09.04.2024'),
  ('r11', 'spaetzle', 17.90::numeric, 'speisekarte.de', '2023-12-13'::date, '13.12.2023'),
  ('r11', 'maultaschen', 17.90::numeric, 'speisekarte.de', '2023-12-13'::date, '13.12.2023'),
  ('r12', 'spaetzle', 20.10::numeric, 'speisekarte.de', '2024-12-11'::date, '11.12.2024'),
  ('r12', 'maultaschen', 22.40::numeric, 'speisekarte.de', '2024-12-11'::date, '11.12.2024'),
  ('r14', 'spaetzle', 14.00::numeric, 'speisekarte.de', '2024-12-09'::date, '09.12.2024'),
  ('r14', 'maultaschen', 13.00::numeric, 'speisekarte.de', '2024-12-09'::date, '09.12.2024'),
  ('r15', 'spaetzle', 18.50::numeric, 'speisekarte.de', '2024-12-11'::date, '11.12.2024'),
  ('r15', 'maultaschen', 17.50::numeric, 'speisekarte.de', '2024-12-11'::date, '11.12.2024')
) as v(venue_id, item, price, source_label, valid_from, stand_label)
where not exists (
  select 1 from public.prices p where p.venue_id = v.venue_id and p.item = v.item and p.valid_from = v.valid_from
);

-- Die alten Preise standen bisher als Text im Hinweis ("Dez. 2024 noch …"); das zeigt jetzt der Verlauf.
update public.prices
set note = nullif(regexp_replace(note, '\s*·?\s*(seit\s+)?(Dez\.|April)\s+\d{4}\s+(noch|unverändert).*$', ''), '')
where note ~ '(Dez\.|April)\s+\d{4}\s+(noch|unverändert)';
