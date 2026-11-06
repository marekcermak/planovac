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
- `npm run db:push` – migrace do cloudu (vývoj běží rovnou proti cloudu, bez Dockeru; testy běží v transakci s ROLLBACK, lokální Supabase zatím není potřeba)
- `npm run db:test` – RLS testy (`supabase/tests/*.sql`, běží v transakci s ROLLBACK)
- `npm run db:types` – přegenerovat `src/lib/database.types.ts`
- Supabase CLI je devDependency (`npx supabase …`), u hosted příkazů nutné `--remote`.

## Aktuální stav
- Fáze 1 (rozpracováno): kostra, migrace + RLS testy, přihlášení (odkaz + OTP kód), domácnost, pozvánky, PWA – hotovo v kódu.
  Nasazeno: https://planovac-topaz.vercel.app (Vercel, auto-deploy z main).
  Přihlášení (rozhodnuto 2026-11-03): bez vlastního SMTP, výchozí šablony e-mailů. Na iPhonu
  se odkaz z e-mailu zkopíruje a vloží do PWA (`src/lib/authLink.ts` → verifyOtp s token_hash);
  pole bere i 6místný kód, kdyby se později přidalo SMTP + {{ .Token }} v šablonách.
  Ověřeno na obou iPhonech (2026-11-04) – fáze 1 hotová.
- Fáze 2 hotová (ověřeno uživatelem 2026-11-05): Sklad (seznam + mapa, filtry, přesun přetažením na PC),
  Přidat (rychlé/ruční, dávkové přidávání), akce u položky, „Zachraň dnes“, Nastavení (editor zón,
  kategorie, produkty, dny varování), realtime (`src/stock/`).
  Zásoby se mění jen přes RPC (add/take/open/move/adjust_stock).
- Fáze 3 hotová (ověřeno 2026-11-06): sken (BarcodeDetector / @zxing/browser, ruční zadání),
  Edge Function `off-lookup` (nasazená, cache `off_cache`), předvyplnění produktu + odhad kategorie,
  přiřazení kódu k existujícímu produktu, přehled na Dnes (prošlé/dnes/brzy/otevřené → filtr Skladu).
  Push notifikace NE – uživatel je nechce, vše jen v aplikaci (SPEC kap. 6).
- Fáze 4a hotová (ověřeno 2026-11-06): kuchařka s kapitolami (`src/kitchen/`, `src/pages/kitchen/`), suroviny
  + aliasy (seed ~180) a párování (`kitchen/parse.ts`: parser řádků + kmenové párování), stav mám/prochází/chybí,
  recept z fotky/odkazu/textu, fotky v Storage `recipe-photos`, Edge Functions `recipe-import` (JSON-LD)
  a `ai` (status, recipe_extract; Claude přes `output_config.format` json_schema; útrata v `ai_usage`).
  Klíč `ANTHROPIC_API_KEY` je nastavený; funkce ho čistí (uvozovky/mezery) a hlásí špatný tvar.
- Fáze 4b (v kódu, čeká na test): nákupní seznam v záložce Plánovač (`src/shopping/`, `src/pages/planner/`,
  RPC `add_shopping_items` slučuje stejnou surovinu), „Uvařeno“ (`kitchen/CookSheet.tsx`, RPC `cook_recipe`
  odečte kusy + cook_log), „Co uvařit?“ (`kitchen/suggest.ts`, `/co-uvarit`, karta na Dnes), „Dokoupit“ u položky skladu.
  Další: 4c účtenka → sklad (+ odškrtnuté z nákupu). Plán jídel a AI nápady mimo kuchařku vypuštěny.
- Fáze 5a (v kódu, čeká na test): úkoly v Plánovači (`src/tasks/`, `pages/planner/TasksPage.tsx`), RLS: sdílené vidí
  domácnost, soukromé jen vlastník; RPC `set_task_done` (opakování → další výskyt, vrácení ho smaže), Top 3 na Dnes,
  klávesy N/R/T. Další: 5b návyky/rituály/nálady/statistiky, 5c deník. Import z Plánovače vypuštěn, 4c účtenka odložena.
- Fáze 5b (v kódu, čeká na test): návyky (`src/habits/`, Plánovač → Návyky, detail s historií), denní záznam
  nálada + radost (Plánovač → Radost, karty na Dnes). Tabulky habits / habit_logs / day_entries jsou jen pro vlastníka.
  Rituály vypuštěny.
- Fáze 5c (v kódu, čeká na test): deník (`src/journal/`, `src/pages/journal/`, /denik), kapitoly soukromé/sdílené
  (výchozí Myšlenky + Deník přes RPC `ensure_journal_defaults`), fotky v Storage `journal-photos`
  ({household}/{owner}/{entry}/…), rychlá Myšlenka, řádky → úkoly. Další: fáze 6 (Živý obraz).
- Fáze 6 (v kódu, čeká na test): Živý obraz v DB (migrace 20261108*: `display_pins`, `display_config`, pg_net + pg_cron job
  `push-display` každou minutu), Nastavení → Živý obraz (klíč, pole, náhled, Odeslat teď), „📟 Na displej“ (`src/display/`)
  u úkolu, zápisu a položky skladu, karta „Na displeji teď“ na Dnes. Klíč je nastavený, první odeslání 200 OK (2026-11-08).
  Změna 2026-11-08: jídelníček (`meal_plan`, `src/meals/`, Plánovač → Jídlo), displej posílá jídlo + společné úkoly
  (dnes / týden), návyky NIKDY; úkoly výchozí soukromé. Zbývá fáze 7 (zbytek AI).
- Fáze 4c (v kódu, čeká na test): `ai` feature `receipt_photo` (nasazeno), `pages/UnpackPage.tsx` „Vybalit nákup“
  z účtenky nebo z košíku nákupního seznamu; nové produkty se zakládají, cena se ukládá k produktu.
- Edge Functions: `npx supabase functions deploy <name> --use-api --yes` (bez Dockeru).
- SPEC rozšířen o Deník (fáze 5) a ruční odesílání na displej `display_pins` (fáze 6), `handwriting_notes` (fáze 7).
- PWA: HTML se načítá NetworkFirst (jinak Safari po odkazu z e-mailu spustilo starou verzi).
- Uživatel pushuje sám (Claude nemá přihlášení ke GitHubu).
<!-- Tuto sekci po každé fázi aktualizuj. -->
