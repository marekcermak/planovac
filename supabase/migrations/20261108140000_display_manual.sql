-- Displej: automaticky se neposílá nic (kromě data a času), vše jen ručně přes „📟 Na displej“
-- (rozhodnutí uživatele 2026-11-08). Automatická pole jde dál zapnout v Nastavení → Živý obraz.
alter table public.settings alter column display_fields
  set default '{"jidlo": false, "ukoly": false, "prochazi": false, "nakup": false}'::jsonb;
update public.settings
  set display_fields = '{"jidlo": false, "ukoly": false, "prochazi": false, "nakup": false}'::jsonb || display_fields
  where not (display_fields ? 'jidlo' and display_fields ? 'ukoly' and display_fields ? 'prochazi');
-- Pole bez hodnoty v nastavení = vypnuto.
update public.settings set display_fields = display_fields - 'navyky' - 'top3';
