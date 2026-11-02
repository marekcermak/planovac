-- RLS testy fáze 1. Spouští se: npm run db:test
-- Vše běží v jedné transakci a na konci se vrací (ROLLBACK) => v DB nic nezůstane.
-- Při chybě skript skončí výjimkou začínající „FAIL“.
--
-- Uživatelé: A = zakladatel (admin), B = pozvaný člen, C = cizí člověk.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'test-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'test-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000c', 'test-c@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;

-- ---------- A založí domácnost a pozvánku ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare v_hh uuid; v_token text;
begin
  v_hh := public.create_household('Testovací domácnost', 'A', '#2563eb');
  v_token := public.create_invite(v_hh);
  perform set_config('test.hh', v_hh::text, true);
  perform set_config('test.token', v_token, true);

  if (select count(*) from public.settings where household_id = v_hh) <> 1 then
    raise exception 'FAIL: A nevidí nastavení své domácnosti';
  end if;
  if (select role from public.household_members where user_id = auth.uid()) <> 'admin' then
    raise exception 'FAIL: zakladatel není admin';
  end if;

  begin
    perform public.create_household('Druhá', 'A', '#2563eb');
    raise exception 'FAIL: A založil druhou domácnost';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- ---------- C (cizí) nevidí nic a nic nesmí ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid; v_n int;
begin
  if (select count(*) from public.households) <> 0 then raise exception 'FAIL: C vidí cizí domácnost'; end if;
  if (select count(*) from public.household_members) <> 0 then raise exception 'FAIL: C vidí cizí členy'; end if;
  if (select count(*) from public.household_invites) <> 0 then raise exception 'FAIL: C vidí pozvánky'; end if;
  if (select count(*) from public.settings) <> 0 then raise exception 'FAIL: C vidí cizí nastavení'; end if;

  update public.households set name = 'hacknuto' where id = v_hh;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: C přejmenoval cizí domácnost'; end if;

  begin
    perform public.create_invite(v_hh);
    raise exception 'FAIL: C vytvořil pozvánku do cizí domácnosti';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.household_members (household_id, user_id, display_name)
      values (v_hh, auth.uid(), 'C');
    raise exception 'FAIL: C se vložil do cizí domácnosti';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- B přijme pozvánku ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid; v_n int;
begin
  if (select status from public.get_invite(current_setting('test.token'))) <> 'valid' then
    raise exception 'FAIL: platná pozvánka se nehlásí jako valid';
  end if;
  if public.accept_invite(current_setting('test.token'), 'B', '#db2777') <> v_hh then
    raise exception 'FAIL: accept_invite vrátil jinou domácnost';
  end if;

  if (select count(*) from public.households) <> 1 then raise exception 'FAIL: B nevidí domácnost'; end if;
  if (select count(*) from public.household_members) <> 2 then raise exception 'FAIL: B nevidí oba členy'; end if;
  if (select count(*) from public.settings) <> 1 then raise exception 'FAIL: B nevidí nastavení'; end if;
  if (select count(*) from public.household_invites) <> 0 then raise exception 'FAIL: člen (ne admin) vidí pozvánky'; end if;

  -- člen nesmí měnit nastavení domácnosti
  update public.settings set ai_enabled = true where household_id = v_hh;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: člen změnil nastavení (ai_enabled)'; end if;

  -- člen si nesmí zvýšit roli
  begin
    update public.household_members set role = 'admin' where user_id = auth.uid();
    raise exception 'FAIL: člen si změnil roli';
  exception when insufficient_privilege then null;
  end;

  -- člen může změnit své jméno, ne cizí
  update public.household_members set display_name = 'Béčko' where user_id = auth.uid();
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL: člen nemůže změnit své jméno'; end if;
  update public.household_members set display_name = 'X' where user_id <> auth.uid();
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: člen změnil jméno jinému členovi'; end if;

  -- člen nesmí odebrat admina
  delete from public.household_members where user_id <> auth.uid();
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: člen odebral jiného člena'; end if;
end $$;

-- ---------- Použitá pozvánka už nefunguje ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.accept_invite(current_setting('test.token'), 'C', '#000000');
    raise exception 'FAIL: použitá pozvánka šla přijmout znovu';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if (select count(*) from public.households) <> 0 then raise exception 'FAIL: C po pokusu vidí domácnost'; end if;
end $$;

-- ---------- A (admin) smí měnit nastavení ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare v_n int;
begin
  update public.settings set expiry_warn_days = 3 where household_id = current_setting('test.hh')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL: admin nemůže změnit nastavení'; end if;
end $$;

-- ---------- anon nemá přístup vůbec ----------
set local role anon;
do $$
begin
  begin
    perform count(*) from public.households;
    raise exception 'FAIL: anon čte households';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'RLS testy fáze 1: OK' as vysledek;

rollback;
