-- Macht 2026-11-12_auslesen.sql rückgängig (automatisches Auslesen wurde wieder entfernt).
-- Optional: Die beiden Spalten stören nicht, können aber so entfernt werden.
alter table public.menu_uploads drop column if exists extraction;
alter table public.menu_uploads drop column if exists extracted_at;
