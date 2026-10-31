-- Sedeam · calendario de retos semanales
--
-- Cómo se usa: Supabase → SQL Editor → New query → pegar todo → Run. Se puede repetir.
-- Después, ejecuta supabase/seed/retos_temporada_4T_2026.sql para cargar el calendario.
--
-- Cómo funciona:
--   · catalog_challenge_weeks: una fila por semana ('2026-S45') con sus retos (ids de catalog_challenges)
--     y un lema opcional que se enseña en la pestaña Temporada ("🎁 Semana del Wrapped").
--   · Las semanas sin fila siguen con 3 retos al azar entre los que tienen in_pool = true.
--   · Los retos temáticos (in_pool = false) solo salen cuando el calendario los pone.
--   · No cambies los retos de una semana ya empezada: lo completado se conserva, pero el progreso
--     de los retos que quites deja de verse.

alter table public.catalog_challenges add column if not exists in_pool boolean not null default true;

create table if not exists public.catalog_challenge_weeks (
  week       text primary key check (week ~ '^\d{4}-S\d{2}$'),
  challenges text[] not null check (cardinality(challenges) between 1 and 5),
  note       text not null default '' check (char_length(note) <= 60),
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

drop trigger if exists catalog_row_touch on public.catalog_challenge_weeks;
create trigger catalog_row_touch before update on public.catalog_challenge_weeks for each row execute function public.catalog_touch();
drop trigger if exists catalog_version on public.catalog_challenge_weeks;
create trigger catalog_version after insert or update or delete on public.catalog_challenge_weeks for each statement execute function public.catalog_touch();

alter table public.catalog_challenge_weeks enable row level security;
revoke all on table public.catalog_challenge_weeks from anon, authenticated, public;

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
        'minDays', min_days, 'rule', rule, 'pool', in_pool) order by sort, id)
      from public.catalog_challenges where active), '[]'::jsonb),
    'challengeWeeks', coalesce((select jsonb_object_agg(week, jsonb_strip_nulls(jsonb_build_object('ids', to_jsonb(challenges), 'note', nullif(note, ''))))
      from public.catalog_challenge_weeks where active), '{}'::jsonb),
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
