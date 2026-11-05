-- Změny nastavení domácnosti (např. expiry_warn_days) se živě promítnou všem členům.
alter publication supabase_realtime add table public.settings;
