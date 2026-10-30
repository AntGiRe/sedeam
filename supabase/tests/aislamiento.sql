-- Sedeam · prueba de aislamiento entre usuarios
--
-- Cómo se usa: Supabase → SQL Editor → New query → pegar todo → Run.
-- Crea dos usuarios de prueba (A y B), intenta todo lo que un usuario NO debería poder hacer con los
-- datos del otro y, al final, DESHACE TODO (rollback): no deja nada en la base de datos.
--
-- Resultado esperado: una única fila «✅ Todas las pruebas de aislamiento pasan».
-- Si algo falla, se detiene con un error que empieza por «❌» y dice qué ha fallado.

begin;

-- Dos usuarios de prueba (solo existen dentro de esta transacción).
insert into auth.users (id, email, aud, role)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'prueba-a@sedeam.test', 'authenticated', 'authenticated'),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'prueba-b@sedeam.test', 'authenticated', 'authenticated');

-- Datos de B, creados por el sistema.
insert into public.devices (id, user_id, name) values ('bbbbbbbb-0000-4000-8000-0000000000db', 'bbbbbbbb-0000-4000-8000-00000000000b', 'PC de B');
insert into public.day_stats (user_id, device_id, day, game, ms) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-0000000000db', '2026-10-20', 'aeat', 3600000);
insert into public.day_extras (user_id, device_id, day, loading_ms) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-0000000000db', '2026-10-20', 60000);
insert into public.device_records (user_id, device_id, records) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-0000000000db', '{"tabs":{}}');
insert into public.profiles (user_id, display_name) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'B');
insert into public.achievements (user_id, achievement_id, unlocked_at) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'clave', now());
insert into public.challenges (user_id, week, challenge_id, completed_at, xp) values ('bbbbbbbb-0000-4000-8000-00000000000b', '2026-S44', 'intensiva', now(), 3);
insert into public.daily_bonus (user_id, day, xp) values ('bbbbbbbb-0000-4000-8000-00000000000b', '2026-10-20', 10);

-- ---------------------------------------------------------------------------
-- 1. Sin iniciar sesión (anon): no puede ni leer.
-- ---------------------------------------------------------------------------
set local role anon;
do $$
declare t text;
begin
  foreach t in array array['profiles', 'devices', 'day_stats', 'day_extras', 'device_records', 'achievements', 'challenges', 'daily_bonus'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception '❌ anon puede leer la tabla %', t;
    exception when insufficient_privilege then
      null; -- correcto: permiso denegado
    end;
  end loop;
  begin
    perform public.delete_my_account();
    raise exception '❌ anon puede llamar a delete_my_account';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Con sesión como A: no ve, no cambia y no borra nada de B; tampoco puede escribir como B.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare
  t text;
  n bigint;
begin
  if auth.uid() <> 'aaaaaaaa-0000-4000-8000-00000000000a' then
    raise exception '❌ la prueba no ha podido hacerse pasar por A';
  end if;

  -- Leer
  foreach t in array array['profiles', 'devices', 'day_stats', 'day_extras', 'device_records', 'achievements', 'challenges', 'daily_bonus'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception '❌ A ve % fila(s) de B en %', n, t; end if;
  end loop;

  -- Modificar y borrar
  update public.day_stats set ms = 0;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '❌ A ha modificado tiempo de B'; end if;
  update public.profiles set display_name = 'hackeado';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '❌ A ha cambiado el perfil de B'; end if;
  delete from public.devices;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '❌ A ha borrado dispositivos de B'; end if;
  delete from public.achievements;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '❌ A ha borrado logros de B'; end if;

  -- Escribir en nombre de B
  begin
    insert into public.devices (user_id, name) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'intruso');
    raise exception '❌ A ha creado un dispositivo a nombre de B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.achievements (user_id, achievement_id, unlocked_at) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'leyenda', now());
    raise exception '❌ A ha regalado un logro a B';
  exception when insufficient_privilege then null;
  end;
  -- Colar datos en el dispositivo de B usando su propio user_id
  begin
    insert into public.day_stats (device_id, day, game, ms) values ('bbbbbbbb-0000-4000-8000-0000000000db', '2026-10-21', 'aeat', 1000);
    raise exception '❌ A ha escrito en el dispositivo de B';
  exception when foreign_key_violation then null;
  end;

  -- Lo suyo sí puede hacerlo (y los valores por defecto ponen su user_id solos)
  insert into public.devices (id, name) values ('aaaaaaaa-0000-4000-8000-0000000000da', 'PC de A');
  insert into public.day_stats (device_id, day, game, ms) values ('aaaaaaaa-0000-4000-8000-0000000000da', '2026-10-20', 'aeat', 1800000);
  insert into public.achievements (achievement_id, unlocked_at) values ('clave', '2026-10-20 10:00+00');
  select count(*) into n from public.day_stats;
  if n <> 1 then raise exception '❌ A no ve su propio tiempo (ve % filas)', n; end if;

  -- El logro conserva la fecha más antigua
  insert into public.achievements (achievement_id, unlocked_at) values ('clave', '2026-10-25 10:00+00')
    on conflict (user_id, achievement_id) do update set unlocked_at = excluded.unlocked_at;
  if (select unlocked_at from public.achievements where achievement_id = 'clave') <> '2026-10-20 10:00+00' then
    raise exception '❌ El logro no conserva la fecha más antigua';
  end if;

  -- Datos absurdos rechazados
  begin
    insert into public.day_stats (device_id, day, game, ms) values ('aaaaaaaa-0000-4000-8000-0000000000da', '2026-10-21', 'aeat', 90000000);
    raise exception '❌ Se aceptan más de 24 h en un día';
  exception when check_violation then null;
  end;
  begin
    insert into public.profiles (display_name) values (repeat('x', 200));
    raise exception '❌ Se acepta un nombre de 200 caracteres';
  exception when check_violation then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A borra su cuenta: desaparece todo lo de A y nada de B.
-- ---------------------------------------------------------------------------
select public.delete_my_account();
reset role;

do $$
begin
  if exists (select 1 from auth.users where id = 'aaaaaaaa-0000-4000-8000-00000000000a') then
    raise exception '❌ La cuenta de A sigue existiendo';
  end if;
  if exists (select 1 from public.day_stats where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     or exists (select 1 from public.devices where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     or exists (select 1 from public.achievements where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a') then
    raise exception '❌ Quedan datos de A tras borrar la cuenta';
  end if;
  if (select count(*) from public.day_stats where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b') <> 1
     or (select count(*) from public.achievements where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b') <> 1 then
    raise exception '❌ Borrar la cuenta de A ha afectado a B';
  end if;
end;
$$;

select '✅ Todas las pruebas de aislamiento pasan' as resultado;

rollback;
