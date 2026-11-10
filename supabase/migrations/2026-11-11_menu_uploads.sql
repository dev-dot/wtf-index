-- Besucher können ganze Speisekarten (PDF/Fotos) schicken.
-- Im Supabase-SQL-Editor einmal ausführen. Mehrfaches Ausführen schadet nicht.

-- ---------- Privater Speicher für die Dateien ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menus', 'menus', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Alle dürfen hochladen, aber nur in den Ordner uploads/ und nichts überschreiben.
drop policy if exists "menus upload" on storage.objects;
create policy "menus upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'menus' and (storage.foldername(name))[1] = 'uploads');

-- Ansehen und Löschen nur für Admins.
drop policy if exists "menus admin read" on storage.objects;
create policy "menus admin read" on storage.objects for select to authenticated
  using (bucket_id = 'menus' and public.is_admin());
drop policy if exists "menus admin delete" on storage.objects;
create policy "menus admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'menus' and public.is_admin());

-- ---------- Eingereichte Speisekarten ----------
create table if not exists public.menu_uploads (
  id            uuid primary key default gen_random_uuid(),
  venue_id      text references public.venues (id) on delete set null,
  venue_name    text check (char_length(venue_name) <= 80),
  venue_address text check (char_length(venue_address) <= 120),
  stand         text check (char_length(stand) <= 40),
  note          text check (char_length(note) <= 200),
  files         text[] not null check (cardinality(files) between 1 and 5),
  file_names    text[] not null default '{}',
  status        text not null default 'pending' check (status in ('pending','done','rejected')),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid,
  check (venue_id is not null or venue_name is not null)
);
create index if not exists menu_uploads_status_created_idx on public.menu_uploads (status, created_at desc);
alter table public.menu_uploads enable row level security;

drop policy if exists "menu uploads submit" on public.menu_uploads;
create policy "menu uploads submit" on public.menu_uploads for insert to anon, authenticated
  with check (
    status = 'pending' and reviewed_at is null and reviewed_by is null
    and (select bool_and(f like 'uploads/%') from unnest(files) as f)
  );

drop policy if exists "menu uploads admin" on public.menu_uploads;
create policy "menu uploads admin" on public.menu_uploads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
