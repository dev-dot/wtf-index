-- Automatisches Auslesen von Speisekarten: Entwurf aus der Edge Function "extract-menu".
-- Im Supabase-SQL-Editor einmal ausführen. Mehrfaches Ausführen schadet nicht.
alter table public.menu_uploads add column if not exists extraction jsonb;
alter table public.menu_uploads add column if not exists extracted_at timestamptz;
