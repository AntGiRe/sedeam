-- Sedeam · catálogo en la base de datos (sedes, logros, plazos, novedades, retos, recompensas…)
--
-- Cómo se usa: Supabase → SQL Editor → New query → pegar todo → Run. Se puede repetir sin romper nada.
-- Después, ejecuta una vez supabase/seed/catalogo.sql para cargar el catálogo actual.
--
-- Cómo se edita: Supabase → Table Editor → tablas catalog_*. Cualquier cambio (añadir una novedad,
-- un plazo, desactivar un logro con active = false…) llega a todas las extensiones en menos de una hora.
--
-- Seguridad: las tablas no se pueden leer ni escribir desde fuera. La extensión solo puede llamar a
-- get_catalog(), que devuelve el catálogo publicado (lo activo) ya montado. Escribir solo se puede
-- desde el panel de Supabase.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.catalog_games (
  id         text primary key check (char_length(id) between 1 and 40),
  name       text not null check (char_length(name) <= 60),
  developer  text,
  genre      text,
  tagline    text,
  emoji      text not null default '🎮',
  color      text not null default '#8f98a0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  url        text check (url ~ '^https://'),
  domains    text[] not null check (cardinality(domains) > 0),
  sort       integer not null default 0,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_achievements (
  id          text primary key check (char_length(id) between 1 and 40),
  emoji       text not null default '🏆',
  name        text not null check (char_length(name) <= 80),
  description text not null default '',
  game        text,
  secret      boolean not null default false,
  rule        jsonb not null,
  sort        integer not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- day: número del día (1-31) o 'last'. months: vacío = todos los meses. shift: 'after' (lunes) o 'before' (viernes).
create table if not exists public.catalog_deadlines (
  id         text primary key check (char_length(id) between 1 and 40),
  title      text not null check (char_length(title) <= 120),
  models     text not null default '',
  game       text,
  months     integer[],
  day        text not null check (day = 'last' or day ~ '^([1-9]|[12][0-9]|3[01])$'),
  shift      text not null default 'after' check (shift in ('after', 'before')),
  major      boolean not null default false,
  sort       integer not null default 0,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_news (
  id         bigint generated always as identity primary key,
  date       date not null default current_date,
  title      text not null check (char_length(title) <= 120),
  body       text not null default '',
  published  boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_challenges (
  id          text primary key check (char_length(id) between 1 and 40),
  emoji       text not null default '🎯',
  name        text not null check (char_length(name) <= 80),
  description text not null default '',
  xp          numeric(5, 2) not null default 2 check (xp > 0 and xp <= 20),
  mode        text not null default 'min' check (mode in ('min', 'max')),
  min_days    integer not null default 3,
  rule        jsonb not null,
  sort        integer not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.catalog_rewards (
  id          text primary key check (char_length(id) between 1 and 40),
  type        text not null check (type in ('theme', 'avatar', 'frame', 'title')),
  name        text not null check (char_length(name) <= 80),
  description text not null default '',
  emoji       text not null default '',
  unlock      jsonb not null,
  sort        integer not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.catalog_shortcuts (
  id         text primary key check (char_length(id) between 1 and 40),
  name       text not null check (char_length(name) <= 40),
  emoji      text not null default '🔗',
  url        text not null check (url ~ '^https://'),
  sort       integer not null default 0,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_infra (
  id         text primary key check (char_length(id) between 1 and 40),
  name       text not null check (char_length(name) <= 60),
  emoji      text not null default '🌐',
  domains    text[] not null check (cardinality(domains) > 0),
  sort       integer not null default 0,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.catalog_infra add column if not exists sort integer not null default 0;

-- Ajustes generales del catálogo: levels, seasons, loading, minAppVersion y changed_at (versión).
create table if not exists public.catalog_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Versión: cualquier cambio en cualquier tabla del catálogo la sube (también al borrar filas)
-- ---------------------------------------------------------------------------

create or replace function public.catalog_touch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and tg_level = 'ROW' then
    new.updated_at := now();
  end if;
  -- Al apuntar la versión se escribe en catalog_settings: que eso no vuelva a dispararse.
  if tg_level = 'STATEMENT' and tg_table_name = 'catalog_settings' and pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_level = 'STATEMENT' then
    insert into public.catalog_settings (key, value, updated_at) values ('changed_at', to_jsonb(now()), now())
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['catalog_games', 'catalog_achievements', 'catalog_deadlines', 'catalog_news', 'catalog_challenges', 'catalog_rewards', 'catalog_shortcuts', 'catalog_infra'] loop
    execute format('drop trigger if exists catalog_row_touch on public.%I', t);
    execute format('create trigger catalog_row_touch before update on public.%I for each row execute function public.catalog_touch()', t);
    execute format('drop trigger if exists catalog_version on public.%I', t);
    execute format('create trigger catalog_version after insert or update or delete on public.%I for each statement execute function public.catalog_touch()', t);
  end loop;
end;
$$;
drop trigger if exists catalog_row_touch on public.catalog_settings;
create trigger catalog_row_touch before update on public.catalog_settings for each row
  when (old.key <> 'changed_at') execute function public.catalog_touch();
drop trigger if exists catalog_version on public.catalog_settings;
create trigger catalog_version after insert or update or delete on public.catalog_settings
  for each statement execute function public.catalog_touch();

-- ---------------------------------------------------------------------------
-- Seguridad: nadie lee ni escribe las tablas desde fuera; solo get_catalog()
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['catalog_games', 'catalog_achievements', 'catalog_deadlines', 'catalog_news', 'catalog_challenges', 'catalog_rewards', 'catalog_shortcuts', 'catalog_infra', 'catalog_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated, public', t);
  end loop;
end;
$$;

-- El catálogo publicado, con la misma forma que catalog.json.
create or replace function public.get_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
  with ver as (
    select coalesce((select updated_at from public.catalog_settings where key = 'changed_at'), now()) as t
  )
  select jsonb_build_object(
    'catalogVersion', (select extract(epoch from t)::bigint from ver),
    'minAppVersion', coalesce((select value #>> '{}' from public.catalog_settings where key = 'minAppVersion'), '0.0.0'),
    'updated', (select to_char(t at time zone 'UTC', 'YYYY-MM-DD') from ver),
    'games', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', id, 'name', name, 'developer', developer, 'genre', genre, 'tagline', tagline, 'emoji', emoji,
        'color', color, 'url', url, 'domains', to_jsonb(domains))) order by sort, id)
      from public.catalog_games where active), '[]'::jsonb),
    'achievements', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', id, 'emoji', emoji, 'name', name, 'desc', description, 'game', game,
        'secret', case when secret then true end, 'rule', rule)) order by sort, id)
      from public.catalog_achievements where active), '[]'::jsonb),
    'deadlines', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', id, 'title', title, 'models', models, 'game', game,
        'months', case when months is null or cardinality(months) = 0 then null else to_jsonb(months) end,
        'day', case when day = 'last' then to_jsonb('last'::text) else to_jsonb(day::int) end,
        'shift', shift, 'major', major)) order by sort, id)
      from public.catalog_deadlines where active), '[]'::jsonb),
    'news', coalesce((select jsonb_agg(jsonb_build_object('date', to_char(date, 'YYYY-MM-DD'), 'title', title, 'body', body) order by date desc, id desc)
      from (select * from public.catalog_news where published and date <= current_date order by date desc, id desc limit 20) n), '[]'::jsonb),
    'challenges', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'emoji', emoji, 'name', name, 'desc', description, 'xp', xp, 'mode', mode,
        'minDays', min_days, 'rule', rule) order by sort, id)
      from public.catalog_challenges where active), '[]'::jsonb),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'type', type, 'name', name, 'desc', description, 'emoji', emoji, 'unlock', unlock) order by sort, id)
      from public.catalog_rewards where active), '[]'::jsonb),
    'shortcuts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'emoji', emoji, 'url', url) order by sort, id)
      from public.catalog_shortcuts where active), '[]'::jsonb),
    'infra', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'emoji', emoji, 'domains', to_jsonb(domains)) order by sort, id)
      from public.catalog_infra where active), '[]'::jsonb),
    'levels', (select value from public.catalog_settings where key = 'levels'),
    'seasons', (select value from public.catalog_settings where key = 'seasons'),
    'loading', (select value from public.catalog_settings where key = 'loading')
  );
$$;

revoke all on function public.get_catalog() from public;
grant execute on function public.get_catalog() to anon, authenticated;
revoke all on function public.catalog_touch() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ajustes del usuario sincronizados entre PCs (avisos, accesos directos…)
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists prefs jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_prefs_size') then
    alter table public.profiles add constraint profiles_prefs_size check (pg_column_size(prefs) <= 8192);
  end if;
end;
$$;
