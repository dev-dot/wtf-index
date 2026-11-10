-- WTF-Index: Besucher-Meldungen
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  venue_id    text not null check (venue_id ~ '^r[0-9]{2,4}$'),
  item        text not null check (item in ('wasser','bier3','bier','doener','pizza','spaetzle')),
  price       numeric(5,2) not null check (price between 0.5 and 60),
  tap         text check (tap in ('f','b')),
  note        text check (char_length(note) <= 120),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now()
);

create index if not exists reports_status_created_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- Alle dürfen freigegebene Meldungen lesen.
drop policy if exists "read approved" on public.reports;
create policy "read approved" on public.reports
  for select to anon, authenticated
  using (status = 'approved');

-- Alle dürfen neue Meldungen einreichen, aber nur als "pending".
drop policy if exists "submit pending" on public.reports;
create policy "submit pending" on public.reports
  for insert to anon, authenticated
  with check (status = 'pending');

-- Freigeben/Ablehnen geschieht im Supabase-Dashboard (Table Editor) oder später im Admin-Bereich
-- mit dem service_role-Schlüssel, der nie in den Browser-Code gehört.
