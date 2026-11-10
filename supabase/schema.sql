-- WTF-Index: Datenbankschema für Supabase
-- Im Supabase-Dashboard unter "SQL Editor" ausführen, danach supabase/seed.sql.
-- Das Skript kann gefahrlos mehrfach ausgeführt werden.

-- ---------- Admins ----------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- Keine Policies: Die Tabelle ist nur über is_admin() und das Dashboard erreichbar.

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Lokale ----------
create table if not exists public.venues (
  id         text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name       text not null check (char_length(name) between 1 and 80),
  type       text not null,
  district   text,
  address    text,
  lat        double precision check (lat between 48.6 and 48.95),
  lon        double precision check (lon between 9.0 and 9.35),
  notes      jsonb not null default '{}'::jsonb,
  wanted     text[] not null default '{}',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.venues enable row level security;

drop policy if exists "venues read" on public.venues;
create policy "venues read" on public.venues for select to anon, authenticated
  using (active or public.is_admin());
drop policy if exists "venues admin write" on public.venues;
create policy "venues admin write" on public.venues for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Preise (mit Verlauf: jeder neue Preis ist eine neue Zeile) ----------
create table if not exists public.prices (
  id           uuid primary key default gen_random_uuid(),
  venue_id     text not null references public.venues (id) on delete cascade,
  item         text not null check (item in ('wasser','bier3','bier','doener','pizza','spaetzle','maultaschen')),
  price        numeric(5,2) not null check (price between 0.5 and 60),
  tap          text check (tap in ('f','b')),
  note         text check (char_length(note) <= 200),
  source_label text,
  source_url   text,
  valid_from   date not null default current_date,
  stand_label  text,
  outdated     boolean not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);
create index if not exists prices_venue_item_idx on public.prices (venue_id, item, valid_from desc);
alter table public.prices enable row level security;

drop policy if exists "prices read" on public.prices;
create policy "prices read" on public.prices for select to anon, authenticated using (true);
drop policy if exists "prices admin write" on public.prices;
create policy "prices admin write" on public.prices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Besucher-Meldungen ----------
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  venue_id    text not null references public.venues (id) on delete cascade,
  item        text not null check (item in ('wasser','bier3','bier','doener','pizza','spaetzle','maultaschen')),
  price       numeric(5,2) not null check (price between 0.5 and 60),
  tap         text check (tap in ('f','b')),
  note        text check (char_length(note) <= 120),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create index if not exists reports_status_created_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;

drop policy if exists "read approved" on public.reports;
drop policy if exists "reports read" on public.reports;
create policy "reports read" on public.reports for select to anon, authenticated
  using (status = 'approved' or public.is_admin());

drop policy if exists "submit pending" on public.reports;
create policy "submit pending" on public.reports for insert to anon, authenticated
  with check (status = 'pending' and reviewed_at is null and reviewed_by is null);

drop policy if exists "reports admin review" on public.reports;
create policy "reports admin review" on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Ersten Admin anlegen ----------
-- 1. Im Dashboard unter Authentication > Users einen Nutzer mit E-Mail und Passwort anlegen.
-- 2. Dann (E-Mail anpassen):
-- insert into public.admins (user_id) select id from auth.users where email = 'du@example.com' on conflict do nothing;
