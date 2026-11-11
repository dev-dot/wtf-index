-- Hinweise/Korrekturen (Kontaktstelle und Meldeweg nach DSA) und Löschfrist für hochgeladene Speisekarten.
-- Im Supabase-SQL-Editor einmal ausführen (nach 2026-11-11_menu_uploads.sql). Mehrfaches Ausführen schadet nicht.

-- ---------- Hinweise ----------
create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('korrektur','inhaber','rechtsverletzung','sonstiges')),
  venue_id    text references public.venues (id) on delete set null,
  message     text not null check (char_length(message) between 10 and 2000),
  name        text check (char_length(name) <= 100),
  email       text check (char_length(email) <= 200),
  good_faith  boolean not null default false,
  status      text not null default 'open' check (status in ('open','done')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  -- Meldungen von Rechtsverletzungen brauchen Name, E-Mail und die Erklärung in gutem Glauben (Art. 16 DSA).
  check (kind <> 'rechtsverletzung' or (name is not null and email is not null and good_faith))
);
create index if not exists notices_status_created_idx on public.notices (status, created_at desc);
alter table public.notices enable row level security;

drop policy if exists "notices submit" on public.notices;
create policy "notices submit" on public.notices for insert to anon, authenticated
  with check (status = 'open' and reviewed_at is null and reviewed_by is null);

drop policy if exists "notices admin" on public.notices;
create policy "notices admin" on public.notices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Löschfrist für Speisekarten-Dateien ----------
-- Der Admin-Bereich löscht die Dateien, sobald eine Speisekarte erledigt oder abgelehnt ist,
-- und spätestens 30 Tage nach dem Hochladen. Der Eintrag bleibt ohne Dateien erhalten.
alter table public.menu_uploads add column if not exists files_deleted_at timestamptz;
