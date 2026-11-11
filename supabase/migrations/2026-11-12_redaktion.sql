-- Redaktion: Stellungnahmen der Lokale, sichtbare Korrekturen, redaktionelle Beiträge (WTF-Report).
-- Im Supabase-SQL-Editor einmal ausführen (nach den anderen Migrationen). Mehrfaches Ausführen schadet nicht.

-- "Das sagt das Lokal": Stellungnahme / Gegendarstellung (§ 20 MStV)
alter table public.venues add column if not exists statement text check (char_length(statement) <= 1500);
alter table public.venues add column if not exists statement_date date;

-- Korrekturhinweis an einem Preis, z. B. "Preis war 9,90 € statt 9,50 €"
alter table public.prices add column if not exists correction text check (char_length(correction) <= 300);

-- Beiträge
create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  title        text not null check (char_length(title) between 3 and 140),
  teaser       text check (char_length(teaser) <= 400),
  body         text not null default '' check (char_length(body) <= 40000),
  author       text check (char_length(author) <= 100),
  venue_ids    text[] not null default '{}',
  status       text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  correction   text check (char_length(correction) <= 600),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists articles_published_idx on public.articles (status, published_at desc);
alter table public.articles enable row level security;

drop policy if exists "articles read published" on public.articles;
create policy "articles read published" on public.articles for select to anon, authenticated
  using ((status = 'published' and published_at <= now()) or public.is_admin());

drop policy if exists "articles admin" on public.articles;
create policy "articles admin" on public.articles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
