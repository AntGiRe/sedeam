-- Sedeam · cuentas y sincronización entre PCs (fase 1)
--
-- Cómo se usa: Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede ejecutar más de una vez sin romper nada (crea lo que falte).
--
-- Idea: cada PC (dispositivo) sube SOLO sus propios totales. Tus cifras = suma de todos tus PCs.
-- Así dos PCs nunca se pisan. Lo que es único de la persona (perfil, logros, retos, bonus diario)
-- va por usuario y se fusiona (los logros conservan la fecha más antigua).
--
-- Seguridad:
--   · Todas las tablas con RLS: cada usuario solo puede leer y escribir filas con su user_id.
--   · El rol "anon" (sin iniciar sesión) no tiene ningún permiso sobre estas tablas.
--   · Restricciones que rechazan datos absurdos (más de 24 h en un día, textos enormes…).
--   · Borrar la cuenta elimina en cascada todo lo del usuario, y solo lo suyo.
--   · Nunca se guardan URLs ni contenido de páginas: solo totales.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

-- Perfil visible (nombre, avatar, tema, marco, título, vitrina). Gana el último cambio.
create table if not exists public.profiles (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 30),
  profile      jsonb not null default '{}'::jsonb check (pg_column_size(profile) <= 4096),
  updated_at   timestamptz not null default now()
);

-- Cada Chrome donde inicias sesión ("PC oficina", "Portátil"…).
create table if not exists public.devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  created_at   timestamptz not null default now(),
  last_sync_at timestamptz,
  unique (user_id, id)
);

-- Tiempo activo por dispositivo, día y sede (ms), con su reparto por horas.
create table if not exists public.day_stats (
  user_id    uuid not null default auth.uid(),
  device_id  uuid not null,
  day        date not null check (day between date '2020-01-01' and date '2100-01-01'),
  game       text not null check (char_length(game) between 1 and 40),
  ms         integer not null check (ms between 0 and 86400000),
  slots      jsonb not null default '{}'::jsonb check (pg_column_size(slots) <= 2048),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, day, game),
  foreign key (user_id, device_id) references public.devices (user_id, id) on delete cascade
);

-- Lo que no sale en la nómina, por dispositivo y día: tiempo en Cl@ve y caídas por web.
create table if not exists public.day_extras (
  user_id    uuid not null default auth.uid(),
  device_id  uuid not null,
  day        date not null check (day between date '2020-01-01' and date '2100-01-01'),
  loading_ms integer not null default 0 check (loading_ms between 0 and 86400000),
  outages    jsonb not null default '{}'::jsonb check (pg_column_size(outages) <= 2048),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, day),
  foreign key (user_id, device_id) references public.devices (user_id, id) on delete cascade
);

-- Récords de cada dispositivo (pestañas, sesiones más largas, primera y última partida…).
create table if not exists public.device_records (
  user_id    uuid not null default auth.uid(),
  device_id  uuid not null,
  records    jsonb not null default '{}'::jsonb check (pg_column_size(records) <= 16384),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id),
  foreign key (user_id, device_id) references public.devices (user_id, id) on delete cascade
);

-- Logros desbloqueados (de la persona, no del PC). Se queda la fecha más antigua.
create table if not exists public.achievements (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  achievement_id text not null check (char_length(achievement_id) between 1 and 40),
  unlocked_at    timestamptz not null,
  primary key (user_id, achievement_id)
);

-- Retos semanales completados. xp en horas de pase (como en la extensión).
create table if not exists public.challenges (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week         text not null check (week ~ '^\d{4}-S\d{2}$'),
  challenge_id text not null check (char_length(challenge_id) between 1 and 40),
  completed_at timestamptz not null,
  xp           numeric(5, 2) not null check (xp > 0 and xp <= 20),
  primary key (user_id, week, challenge_id)
);

-- Bonus diario (primer fichaje del día): uno por persona y día, lo dé el PC que lo dé.
create table if not exists public.daily_bonus (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day     date not null check (day between date '2020-01-01' and date '2100-01-01'),
  xp      integer not null check (xp between 0 and 100),
  primary key (user_id, day)
);

-- Para traer solo lo que ha cambiado desde la última sincronización.
create index if not exists day_stats_user_updated on public.day_stats (user_id, updated_at);
create index if not exists day_extras_user_updated on public.day_extras (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Disparadores
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'day_stats', 'day_extras', 'device_records'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;

-- Un logro desbloqueado en dos PCs conserva la fecha más antigua.
create or replace function public.keep_first_unlock() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.unlocked_at := least(old.unlocked_at, new.unlocked_at);
  return new;
end;
$$;

drop trigger if exists keep_first_unlock on public.achievements;
create trigger keep_first_unlock before update on public.achievements
  for each row execute function public.keep_first_unlock();

-- ---------------------------------------------------------------------------
-- Seguridad por fila (RLS)
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['profiles', 'devices', 'day_stats', 'day_extras', 'device_records', 'achievements', 'challenges', 'daily_bonus'] loop
    execute format('alter table public.%I enable row level security', t);
    -- Sin sesión, nada de nada.
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke all on table public.%I from public', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    -- Con sesión, solo tus filas: para leer, crear, modificar y borrar.
    execute format('drop policy if exists "solo lo mio" on public.%I', t);
    execute format(
      'create policy "solo lo mio" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Borrar mi cuenta (RGPD): elimina el usuario y, en cascada, todos sus datos.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Hay que iniciar sesión para borrar la cuenta' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Las funciones de los disparadores no se pueden llamar desde fuera.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.keep_first_unlock() from public, anon, authenticated;
