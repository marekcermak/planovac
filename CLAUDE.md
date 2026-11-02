# CLAUDE.md

Domácí PWA pro správu potravin (lednice, mrazák, spíž), kuchařku, plánovač, návyky a e-ink displej Živý obraz. Uživatelé: Marek a Markéta.

- Kompletní zadání: `docs/SPEC.md` – přečti před každou novou fází.
- Stack: Vite + React + TypeScript + Tailwind + vite-plugin-pwa, Supabase (Postgres, Auth, RLS, Storage, Realtime, Edge Functions, pg_cron), hosting Vercel.
- UI česky, časová zóna Europe/Prague, mobile-first, ale responzivní i pro PC (SPEC kap. 5.1).
- Aplikace musí fungovat bez AI. Claude API jen přes Edge Function `ai`, za přepínačem `ai_enabled`, s limitem útraty.
- Tajné klíče jen v Supabase secrets, nikdy ve frontendu ani v gitu.
- Soukromá data (nálady, návyky, rituály, soukromé úkoly) chrání RLS.
- Schéma měň jen migracemi v `supabase/migrations`.
- Pracuj po fázích ze SPEC kap. 10. Na začátku fáze navrhni plán, na konci shrň stav a commitni.

## Příkazy
- `npm run dev` / `npm run build` / `npm run lint`
- `npm run db:push` – migrace do cloudu (vývoj běží rovnou proti cloudu, bez Dockeru; před fází 5 zvážit lokální Supabase)
- `npm run db:test` – RLS testy (`supabase/tests/*.sql`, běží v transakci s ROLLBACK)
- `npm run db:types` – přegenerovat `src/lib/database.types.ts`
- Supabase CLI je devDependency (`npx supabase …`), u hosted příkazů nutné `--remote`.

## Aktuální stav
- Fáze 1 (rozpracováno): kostra, migrace + RLS testy, přihlášení (odkaz + OTP kód), domácnost, pozvánky, PWA – hotovo v kódu.
  Nasazeno: https://planovac-topaz.vercel.app (Vercel, auto-deploy z main).
  Zbývá: Auth URL + šablona e-mailu v Supabase, test na obou iPhonech.
<!-- Tuto sekci po každé fázi aktualizuj. -->
