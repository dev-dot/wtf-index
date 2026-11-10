-- Neuer Index "Maultaschen" für eine bestehende Datenbank.
-- Im Supabase-SQL-Editor einmal ausführen. Mehrfaches Ausführen schadet nicht.

alter table public.prices  drop constraint if exists prices_item_check;
alter table public.prices  add  constraint prices_item_check
  check (item in ('wasser','bier3','bier','doener','pizza','spaetzle','maultaschen'));
alter table public.reports drop constraint if exists reports_item_check;
alter table public.reports add  constraint reports_item_check
  check (item in ('wasser','bier3','bier','doener','pizza','spaetzle','maultaschen'));

-- Maultaschen-Preise aus denselben Speisekarten wie die Käsespätzle
-- (Quelle, Datum und Stand werden vom Käsespätzle-Preis des Lokals übernommen).
insert into public.prices (venue_id, item, price, note, source_label, source_url, valid_from, stand_label, outdated)
select v.venue_id, 'maultaschen', v.price, v.note, p.source_label, p.source_url, p.valid_from, p.stand_label, p.outdated
from (values
  ('r13', 16.90, 'geschmelzt mit Kartoffelsalat'),
  ('r21', 16.00, 'geschmelzt, mit Kartoffelsalat und Salatbeilage'),
  ('r14', 13.00, 'geschmälzt oder geröstet mit Ei, mit Salat'),
  ('r12', 24.90, 'geschmelzt mit Kartoffelsalat · Dez. 2024 noch 22,40 € (+11 %)'),
  ('r11', 20.90, 'mit Zwiebelschmelze & schwäbischem Kartoffelsalat · Dez. 2023 noch 17,90 € (+17 %)'),
  ('r15', 18.50, 'mit hausgemachtem Kartoffelsalat und Zwiebelsößle · Dez. 2024 noch 17,50 € (+6 %)')
) as v(venue_id, price, note)
join lateral (
  select * from public.prices s
  where s.venue_id = v.venue_id and s.item = 'spaetzle'
  order by s.valid_from desc, s.created_at desc limit 1
) p on true
where not exists (
  select 1 from public.prices x where x.venue_id = v.venue_id and x.item = 'maultaschen' and x.price = v.price
);
