-- Prázdný klíč = smazat (klient posílá '' – generované typy neumí null).
create or replace function public.set_display_key(p_household_id uuid, p_key text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
begin
  if not public.is_household_admin(p_household_id) then
    raise exception 'Klíč může nastavit jen správce domácnosti.' using errcode = '42501';
  end if;
  if v_key is not null and (char_length(v_key) not between 8 and 200 or v_key ~ '\s') then
    raise exception 'Klíč nevypadá správně.' using errcode = '22023';
  end if;
  insert into public.display_config (household_id, import_key) values (p_household_id, v_key)
    on conflict (household_id) do update set import_key = excluded.import_key;
end;
$$;
