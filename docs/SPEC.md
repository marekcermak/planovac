# Domácí appka – potraviny, kuchařka, plánovač, návyky

Zadání pro Claude Code. Jazyk UI: čeština. Časová zóna: Europe/Prague.
Uživatelé: domácnost (Marek + Markéta, později případně další členové).

## 1. Cíl

Jedna mobilní webová aplikace (PWA), která:

1. hlídá zásoby v lednici, mrazáku a spíži tak, aby se nic nevyhazovalo a neprošlo,
2. vede rostoucí rodinnou kuchařku propojenou se zásobami,
3. nahrazuje současný osobní „Plánovač“ (Google Apps Script): úkoly, návyky, denní rituály, nálady, statistiky – nově pro oba,
4. posílá denní přehled na e-ink displej Živý obraz (zivyobraz.eu),
5. funguje **plně bez AI**. AI (Claude API) je volitelná vrstva, kterou lze zapnout přepínačem v Nastavení.

## 2. Technologie

- **Frontend:** Vite + React + TypeScript + Tailwind, `vite-plugin-pwa` (instalace na plochu, offline čtení posledních dat).
- **Backend:** Supabase – Postgres, Auth (přihlášení magic linkem e-mailem), Row Level Security, Storage (fotky), Realtime (živá synchronizace mezi telefony), Edge Functions (Deno), `pg_cron` + `pg_net` pro plánované úlohy.
- **Hosting frontendu:** Vercel (napojení na GitHub repo, auto-deploy z `main`).
- **Notifikace:** žádné push notifikace (viz kap. 6), přehled je jen v aplikaci.
- **Čárové kódy:** nativní `BarcodeDetector`, kde je k dispozici, jinak knihovna `@zxing/browser`. Data produktu z Open Food Facts (`https://world.openfoodfacts.org/api/v2/product/{kod}.json`), volat přes Edge Function a cachovat do vlastní tabulky.
- Žádné tajné klíče ve frontendu. Klient smí znát jen Supabase URL a anon key. Klíče pro Živý obraz a Claude API žijí jen v Supabase secrets.

## 3. Uživatelé, domácnost, soukromí

- `households` + `household_members` (user_id, household_id, display_name, barva).
- Sdílené v rámci domácnosti: zásoby, produkty, lokace, kuchařka, nákupní seznam, sdílené úkoly.
- **Soukromé** (vidí jen vlastník, vynuceno RLS, ne jen v UI): nálady, návyky, rituály, soukromé úkoly.
- Každá tabulka má RLS politiky. Napiš k nim testy (alespoň SQL skript, který ověří, že druhý člen domácnosti nevidí cizí náladu).

## 4. Datový model (návrh, upravit dle potřeby)

### Lokace – kde přesně potravina leží
- `zones`: id, household_id, name („Lednice“, „Mrazák“, „Spíž – regál A“), type (`fridge` | `freezer` | `pantry` | `other`), grid_rows, grid_cols, sort.
- `locations`: id, zone_id, label („Police 2 – vlevo“, „Šuplík zelenina“, „Dveře nahoře“), row, col, row_span, col_span.
- Každá zóna je mřížka, kterou si uživatel nakreslí v Nastavení (počet polic × sloupců, slučování buněk, popisky). Musí jít popsat lednici i regály ve spíži.

### Katalog a zásoby
- `categories`: name, default_shelf_life_days, opened_shelf_life_days, default_zone_type. Předvyplnit rozumnými výchozími hodnotami pro běžné české potraviny (maso, mléčné, pečivo, zelenina, ovoce, uzeniny, suché, konzervy, mražené…).
- `ingredients`: obecná surovina („kuřecí maso“, „mléko“, „rajčata“) + `ingredient_aliases` (synonyma). Slouží k párování s recepty.
- `products`: konkrétní kupovaná věc – name, ingredient_id, category_id, barcode, default_unit, default_qty, shelf_life_days (přebíjí kategorii), opened_shelf_life_days, default_location_id, is_quick_add, image_url, price (volitelné).
- `stock_items`: product_id, location_id, quantity, unit, purchased_at, expires_at, expiry_source (`label` | `estimated`), opened_at, status (`active` | `consumed` | `wasted`), added_by.
- `stock_events`: stock_item_id, type (`add` | `consume` | `open` | `waste` | `move` | `adjust`), quantity, at, by_user, note. Zdroj pro statistiky.

### Kuchařka
- `recipe_categories`: household_id, name, icon, sort (kapitoly kuchařky) + `recipe_category_links` (recipe_id, category_id).
- `recipes`: title, servings, prep_minutes, steps (markdown), source_type (`manual` | `url` | `photo` | `ai`), source_url, photo_paths (text[], Storage), rating (1–5), tags (text[]), notes, created_by.
- `recipe_ingredients`: recipe_id, ingredient_id, quantity, unit, optional, note.
- `cook_log`: recipe_id, cooked_at, by_user, servings.

### Plánování a úkoly
- `shopping_items`: ingredient_id / product_id / free_text, quantity, unit, checked, added_by, source (`manual` | `recipe` | `low_stock`).
- `tasks`: title, notes, owner_id, assignee_id, visibility (`shared` | `private`), due_date, priority, is_top3_on (date, nullable), done_at, recurrence (RRULE text, nullable).
- `habits`: owner_id, name, schedule (dny v týdnu nebo „X× týdně“), show_on_display, sort, archived.
- `habit_logs`: habit_id, date, done.
- `rituals` (ranní / večerní) + `ritual_steps` + `ritual_logs`.
- `mood_logs`: owner_id, date, score 1–5, note. Vždy soukromé, nikdy na displej.

### Deník a poznámky
- `journal_chapters`: owner_id, name („Myšlenky“, „Z knih“, „Podcasty“, „Práce“…), icon, sort, visibility (`private` | `shared`), archived. Výchozí kapitoly „Myšlenky“ a „Deník“.
- `journal_entries`: owner_id, chapter_id, title (volitelný), body (markdown), entry_date, source_type (`vlastni` | `kniha` | `clanek` | `podcast` | `rozhovor` | `jine`), source_ref (název knihy, odkaz…), tags (text[]), pinned, photo_paths (text[]), created_at, updated_at. Viditelnost se dědí z kapitoly.
- Fulltextové hledání přes title + body + tags + source_ref (Postgres `tsvector`, česká konfigurace nebo `unaccent` + simple).

### Displej – ruční odeslání
- `display_pins`: household_id, owner_id, kind (`task` | `journal` | `recipe` | `habit` | `stock` | `text`), ref_id (nullable), text (zkrácený text pro displej), slot (1–3), until (`end_of_day` | `until_removed` | datum), created_at.

### Systém
- `settings` (na domácnost): expiry_warn_days (výchozí 2), notify_time (výchozí 07:30), zivyobraz_enabled, display_fields (jsonb), **ai_enabled** (bool, výchozí false), ai_monthly_limit_czk, ai_price_input_per_mtok, ai_price_output_per_mtok, ai_model.
- `ai_usage`: at, user_id, feature, model, input_tokens, output_tokens, est_cost_czk.
- `off_cache`: barcode, found, data (jsonb), fetched_at – mezipaměť Open Food Facts.

## 5. Obrazovky

Spodní navigace: **Dnes · Sklad · Kuchařka · Plánovač · Více**. Plánovač má záložky Nákup (nákupní seznam) a Úkoly (rozhodnuto 2026-11-06).

1. **Dnes**
   - „Zachraň dnes“: položky s expirací ≤ expiry_warn_days, seřazené od nejdřív procházejících, u každé rychlé akce (snědeno / otevřeno / vyhozeno / přesunout).
   - (Dnešní večeře z plánu jídel – vypuštěno s plánem jídel.)
   - Moje návyky a rituály na dnešek – odškrtávání jedním tapnutím.
   - Top 3 úkoly (moje + sdílené přiřazené mně).
   - Večer: zápis nálady (1–5 + poznámka).
2. **Sklad**
   - Seznam s filtry (zóna, kategorie, „prochází“, „otevřené“) a vyhledáváním.
   - **Mapa:** vizuální mřížka zóny, v buňkách položky barevně podle expirace (zelená / oranžová / červená). Tap na buňku = obsah. Hledání „kde je…“ zvýrazní buňku.
   - Přesun položky = přetažení nebo výběr buňky.
3. **Přidat** (velké tlačítko „+“ dostupné odevšad)
   - Rychlé přidání: mřížka oblíbených produktů (is_quick_add), tap = přidat s výchozím množstvím, lokací a vypočtenou expirací.
   - Sken čárového kódu → nalezený produkt nebo založení nového s předvyplněním z Open Food Facts.
   - Ruční přidání.
   - Hromadný režim „vybaluju nákup“: přidávání za sebou bez zavírání formuláře, na konci souhrn.
   - Expirace = purchased_at + shelf_life (produkt → kategorie). U položky jde přepsat skutečným datem z obalu (expiry_source = label).
   - Při otevření: nové expires_at = min(původní, dnes + opened_shelf_life_days).
4. **Kuchařka** (upřesněno 2026-11-06: klasická kuchařka, kterou uživatel postupně plní)
   - **Kapitoly** (`recipe_categories`) jako v knize – Polévky, Těstoviny, Maso, Ryby, Sladké, Snídaně…; uživatel je zakládá, přejmenovává, řadí. Recept může být ve více kapitolách.
   - Všechny zdroje (fotka stránky ze staré kuchařky, odkaz na web, vložený text, ruční zadání) se převedou do **stejného formátu**: suroviny s množstvím, postup po krocích, porce, čas. K receptu jde přidat vlastní fotky a poznámky.
   - Seznam receptů po kapitolách, hledání, hodnocení, filtr **„Můžu uvařit hned“** a **„Chybí max. 2 věci“**.
   - Detail receptu: suroviny se stavem (mám / chybí / prochází), přepočet porcí, tlačítko „Chybějící do nákupu“, tlačítko „Uvařeno“ (odečte suroviny ze skladu – nejdřív nejdřív procházející kusy, zapíše cook_log).
   - Přidání receptu: ručně, **z URL** (Edge Function stáhne stránku a vytáhne schema.org/Recipe JSON-LD; když chybí, předvyplní aspoň titulek a odkaz), vložením textu (jednoduchý parser řádků surovin „200 g mouky“).
   - Při ukládání surovin nabídnout párování na existující `ingredients` (fulltext + aliasy). Nepárované suroviny lze založit jedním tapnutím.
5. **„Co uvařit?“** (bez AI)
   - Skóre receptu = podíl dostupných povinných surovin × 0,6 + bonus za spotřebování procházejících surovin (váha 1/(dny_do_expirace+1)) × 0,4 − penalizace za uvaření v posledních 7 dnech.
   - Výsledek: top 5 s vysvětlením („spotřebuje jogurt a kuřecí maso, chybí cibule“).
   - Vstup: volitelně kapitola / druh jídla („oběd na zítra“ → kapitoly bez Snídaní a Sladkého). Z výsledku: detail → „Co koupit“ → nákupní seznam.
6. ~~Plán jídel~~ – **vypuštěno** (rozhodnutí 2026-11-06). Plánování nahrazuje „Co uvařit?“ + nákupní seznam.
7. **Nákupní seznam** (v Plánovači) – sdílený, realtime, odškrtávání v obchodě. Plní se ručně („mléko 2 l“), z receptu („Chybějící do nákupu“) a ze skladu („Dokoupit“); stejná surovina se nezdvojí, množství se sečte. Odškrtnuté položky lze rovnou převést do skladu („vybaluju“).
8. **Úkoly** – sdílené a soukromé, přiřazení, termíny, opakování, top 3 na den.
9. **Návyky a rituály** – správa, historie, série.
9a. **Deník**
   - Kapitoly jako záložky / boční seznam, uživatel je zakládá, přejmenovává, řadí a archivuje.
   - **Rychlý zápis**: tlačítko „Myšlenka“ dostupné z obrazovky Dnes i z „+“. Otevře prázdné pole, uloží se do zvolené kapitoly (výchozí „Myšlenky“) jedním tapnutím. Cíl: zápis do 5 sekund.
   - Zápis: text (markdown), volitelně zdroj (kniha / článek / podcast / rozhovor + název nebo odkaz), štítky, fotky.
   - Časová osa v kapitole, hledání napříč kapitolami, filtr podle zdroje a štítku, připnuté zápisy nahoře.
   - Ze zápisu jde jedním tapnutím: převést řádek na úkol, odeslat na displej.
9b. **Fotka ručně psaných poznámek**
   - V „+“ a v Deníku tlačítko „Vyfotit poznámky“.
   - S AI: fotka → přepis textu → návrh rozdělení na úkoly (s termínem, pokud je uveden), zápisy do deníku (s navrženou kapitolou) a položky nákupu. Uživatel na obrazovce návrhu u každé položky potvrdí, upraví nebo zahodí a teprve pak se zapíše.
   - Bez AI: fotka se uloží jako příloha nového zápisu v deníku a UI nabídne vložit text ručně (s tipem na kopírování textu z fotky přes Live Text / Google Lens).
   - Originální fotka zůstává vždy přiložená k zápisu.
10. **Statistiky** – návyky (plnění, série), nálady (graf, jen vlastní), potraviny (vyhozeno za měsíc: počet, kategorie, odhad v Kč, pokud je cena; top 5 nejčastěji vyhazovaných produktů).
11. **Nastavení** – členové domácnosti, editor zón a mřížek, kategorie a výchozí trvanlivosti, Živý obraz, **AI přepínač** (viz kap. 8), import z Plánovače.

### 5.1 Desktop (PC)

Stejná aplikace a URL, responzivní rozložení od šířky ~1024 px:
- **Boční menu** vlevo místo spodní navigace, tlačítko „+ Přidat“ nahoře v menu.
- **Dnes:** dashboard ve sloupcích (Zachraň dnes · Návyky a rituály · Top 3 úkoly a večeře).
- **Sklad:** mapa zóny a seznam vedle sebe. Klik na buňku filtruje seznam, výběr položky zvýrazní buňku. Přesun položky přetažením myší mezi buňkami.
- **Kuchařka:** seznam receptů vlevo, detail vpravo (master–detail). Editor receptu ve dvou sloupcích: suroviny vlevo, postup vpravo. Vložení receptu z URL nebo textu je hlavní scénář pro PC.
- ~~Plán jídel~~ – vypuštěno.
- **Úkoly:** seznam + detail, hromadné úpravy (výběr více úkolů, přiřazení, termín).
- **Statistiky:** grafy vedle sebe.
- **Nastavení zón:** editor mřížky lednice a spíže primárně pro myš (tažení pro slučování buněk).
- **Klávesové zkratky:** `N` přidat položku do skladu, `R` nový recept, `T` nový úkol, `/` hledání, `Esc` zavřít dialog. Nápověda zkratek přes `?`.
- Instalovatelné jako PWA i v Chrome/Edge na PC (vlastní okno).
- Skener čárových kódů na PC přes webkameru, ale UI má nabízet hlavně ruční zadání kódu.

## 6. Přehled v aplikaci (bez notifikací)

- **Žádné push notifikace do telefonu** (rozhodnutí uživatele 2026-11-05). Vše, co by připomínala notifikace, je vidět po otevření aplikace.
- Obrazovka Dnes nahoře ukazuje přehled: kolik položek je prošlých, prochází dnes, prochází do expiry_warn_days a kolik je otevřených. Ťuknutím se otevře Sklad s odpovídajícím filtrem. Pod tím „Zachraň dnes“.
- Ve fázi 5 přibude na Dnes stejným způsobem: nesplněné návyky a rituály, večer výzva k zápisu nálady.

## 7. Živý obraz (zivyobraz.eu)

- Edge Function `push-display` posílá hodnoty HTTP požadavkem na `https://in.zivyobraz.eu/?import_key=KLIC&nazev=hodnota&nazev2=hodnota2` (klíč v secrets `ZIVYOBRAZ_IMPORT_KEY`, hodnoty URL-enkódovat, držet krátké).
- Spouštět: `pg_cron` každých 10 minut + po relevantní změně (odškrtnutí návyku, úkolu, změna skladu) s debounce ~1 min.
- Hodnoty (názvy pevné, aby se na ně dalo navázat v editoru Živého obrazu):
  - `datum`, `vecere`, `prochazi` (max ~3 položky + „+N“), `prochazi_pocet`
  - `marek_navyky` (např. „✓ Běh  ○ Čtení  ✓ Voda“), `marek_navyky_hotovo` („2/3“), `marek_top3`
  - totéž pro další členy (`marketa_…`), podle display_fields
  - `nakup_pocet`, `aktualizace` (čas)
- Nálady se na displej nikdy neposílají. Co se posílá, určuje Nastavení → Živý obraz (náhled hodnot + tlačítko „Odeslat teď“).

### Automatické vs. ručně odeslané
- Každé automatické pole (prochází, večeře, návyky, top 3, nákup) má v Nastavení přepínač zap/vyp. Výchozí stav: zapnuto jen `prochazi` a `vecere`.
- **Ruční odeslání:** u úkolu, zápisu v deníku, receptu, návyku i položky skladu je akce **„📟 Na displej“** (v menu položky, na PC i klávesová zkratka `D`). Otevře mini dialog: zkrácený text (předvyplněný, editovatelný, max ~60 znaků), platnost („do konce dne“ / „dokud neodeberu“ / datum). Uloží se do `display_pins` a hned se odešle.
- Max. 3 připnuté položky na člověka. Při plném počtu dialog nabídne, kterou nahradit.
- Hodnoty: `marek_pripnuto_1` až `_3`, `marek_pripnuto` (vše spojené do jednoho řádku), totéž pro další členy.
- Na obrazovce Dnes karta „Na displeji teď“ se seznamem připnutých položek a odebráním jedním tapnutím. Prošlé piny se mažou automaticky při každém odeslání.
- Volné odeslání textu: v kartě „Na displeji teď“ pole „Poslat vlastní text“.

## 8. AI vrstva (volitelná, výchozí stav VYPNUTO)

### Princip
- Aplikace musí být kompletně použitelná bez AI. AI jen zrychluje zadávání a přidává nápady.
- Přepínač „AI funkce“ v Nastavení (jen pro roli admin domácnosti). AI tlačítka se v UI zobrazí, jen když je `ai_enabled = true` **a** server hlásí, že klíč je nakonfigurovaný.
- Všechna volání jdou přes jedinou Edge Function `ai` s parametrem `feature`. Funkce:
  1. ověří uživatele a členství v domácnosti,
  2. ověří `ai_enabled` na serveru (ne jen v klientu),
  3. ověří, že útrata za aktuální měsíc v `ai_usage` nepřekročila `ai_monthly_limit_czk`,
  4. zavolá Anthropic Messages API (klíč `ANTHROPIC_API_KEY` v secrets, model z `settings.ai_model`, výchozí `claude-haiku-5-5`),
  5. zapíše tokeny a odhad ceny do `ai_usage` (ceny za milion tokenů z nastavení, ne natvrdo v kódu),
  6. vrátí **návrh v JSON**, nikdy nezapisuje přímo do dat – uživatel vždy potvrdí.
- Nastavení zobrazuje útratu za tento měsíc, počet volání podle funkce a limit.

### Funkce (feature)
- `receipt_photo`: fotka nákupu / účtenky → seznam návrhů položek (název, množství, kategorie, navržená zóna, odhad trvanlivosti) → otevře se obrazovka „vybaluju nákup“ předvyplněná.
- `label_expiry`: fotka obalu → datum spotřeby.
- `recipe_extract`: fotka stránky nebo vložený text → strukturovaný recept (suroviny s množstvím, postup).
- `ingredient_match`: návrh párování nepárovaných surovin na `ingredients`.
- ~~`cook_ideas`~~ – vypuštěno (uživatel nápady mimo kuchařku nechce, 2026-11-06).
- `weekly_summary` (volitelné): krátké textové shrnutí návyků za týden, jen pro vlastníka.
- `handwriting_notes`: fotka ručně psaných poznámek → přepis + návrh rozdělení na úkoly, zápisy deníku (s kapitolou z existujících kapitol uživatele) a nákup. Vrací JSON návrh, nic nezapisuje.
- Používat structured output / tool use s JSON schématem, validovat odpověď (zod) před zobrazením.

## 9. Import z Plánovače (vypuštěno 2026-11-07, uživatel začne od nuly)

- Vstup: CSV exporty listů z Google Sheets ve složce `import/` (mimo git).
- Nejdřív CSV prozkoumej a navrhni mapování sloupců na tabulky (tasks, habits, habit_logs, rituals, ritual_logs, mood_logs). Mapování nech schválit, pak napiš idempotentní importní skript (`scripts/import-planovac.ts`).
- Importovaná data patří Markovi (owner_id), visibility `private`, pokud není jasné jinak.

## 10. Fáze a kritéria dokončení

Po každé fázi: funguje na telefonu přes nasazenou URL, commit, krátké shrnutí, co je hotové a co ne.

**Fáze 1 – základ:** projekt, Supabase schéma + RLS, přihlášení, domácnost s pozvánkou druhého člena, PWA instalovatelná na plochu, deploy na Vercel.
→ Hotovo, když se oba přihlásí na svých telefonech a vidí stejnou domácnost.

**Fáze 2 – sklad:** zóny a mřížky, kategorie s výchozími trvanlivostmi, produkty, rychlé přidání, ruční přidání, akce snědeno/otevřeno/vyhozeno/přesunout, seznam i mapa, obrazovka Dnes se „Zachraň dnes“, realtime.
→ Hotovo, když položka přidaná na jednom telefonu se do 2 s objeví na druhém a ukáže se ve správné buňce mapy.

**Fáze 3 – sken a přehled:** čárové kódy + Open Food Facts (Edge Function `off-lookup` s mezipamětí), přehled „co prochází“ na obrazovce Dnes. Bez push notifikací.

**Fáze 4 – kuchařka + základ AI** (AI přesunuta sem z fáze 7, rozhodnutí 2026-11-06):
- 4a: AI základ (Edge Function `ai`, přepínač, limit, `ai_usage`), suroviny (seed ~150 + aliasy), kapitoly, recepty z fotky (`recipe_extract`), z odkazu (JSON-LD, jinak AI), z textu, fotky a poznámky, párování surovin, stav mám/chybí/prochází.
- 4b: „Co uvařit?“, „Můžu uvařit hned“, „Uvařeno“ s odečtem, nákupní seznam (z receptu, ze skladu, ručně; realtime).
- 4c: účtenka → sklad (`receipt_photo`, AI páruje řádky na katalog produktů), obrazovka „Vybalit nákup“ (/pridat/vybalit) i bez AI z odškrtnutého nákupního seznamu; po naskladnění zmizí koupené ze seznamu.
Plán jídel vypuštěn.

**Fáze 5 – plánovač a deník** (pořadí rozhodnuto 2026-11-07; 4c účtenka odložena na později):
- 5a: úkoly (sdílené / soukromé, přiřazení, termín, priorita, opakování daily/weekdays/weekly/monthly/yearly místo plného RRULE, Top 3 na Dnes, rychlé zadání termínu „zítra“, „v pátek“, „15. 11.“, „!“).
- 5b (upřesněno 2026-11-07): návyky nastavitelné v aplikaci (jen odškrtnout, nebo „druh + poznámka“ – hlavně sport; datum se doplní samo; každý den / vybrané dny / X× týdně), série a kalendář plnění, historie zápisů. Denní záznam = nálada 1–5 (smajlíci) + „Co mi dnes udělalo radost“ (`day_entries` místo `mood_logs`), historie s hledáním. Rituály vypuštěny (stačí návyky). Vše soukromé.
- 5c: deník s kapitolami (soukromé / sdílené), rychlý zápis myšlenky (Dnes, „+“, Deník), fotka poznámek bez AI (příloha + tip na Živý text), řádky zápisu → úkoly. Hledání zatím v klientu (bez tsvector – stačí pro objem jedné domácnosti). Deník je na PC v bočním menu, na mobilu ve „Více“ a na Dnes.
- ~~Import z Plánovače~~ – vypuštěn (uživatel začne od nuly, 2026-11-07).

**Fáze 6 – Živý obraz:** `push-display`, přepínače automatických polí, akce „📟 Na displej“ + `display_pins`, karta „Na displeji teď“, náhled.

**Fáze 7 – zbytek AI:** zbývající features (`label_expiry`, `ingredient_match`, `weekly_summary`, `handwriting_notes`); základ AI vzniká ve fázi 4.

## 11. Pravidla pro vývoj

- Migrace přes Supabase CLI (`supabase/migrations`), nikdy ruční změny v produkci bez migrace.
- Typy z databáze generovat (`supabase gen types`).
- Mobile-first, palcem ovladatelné (velké tap targety), světlý i tmavý režim. Od ~1024 px desktopové rozložení podle kap. 5.1 – navrhuj komponenty responzivně od začátku, ne až dodatečně.
- Datumy vždy počítat v Europe/Prague.
- Žádná osobní data (CSV z Plánovače, `.env*`) do gitu.
- Před větší změnou navrhni plán a zeptej se.
