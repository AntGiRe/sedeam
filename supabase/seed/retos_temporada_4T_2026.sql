-- Sedeam · retos de lo que queda de la temporada 4T 2026 «Cierre de año» (hasta el lunes 1-feb-2027)
--
-- Requiere haber ejecutado migrations/0003_calendario_retos.sql.
-- Supabase → SQL Editor → New query → pegar todo → Run. Se puede repetir (actualiza lo que ya exista).
--
-- La semana 44 (26-oct a 1-nov) no se toca: ya está en marcha con sus retos al azar.
-- xp va en horas de pase (como siempre): 2 = +120 XP, 3 = +180 XP, 4 = +240 XP.

begin;

-- ---------------------------------------------------------------------------
-- Retos temáticos (solo salen cuando el calendario los pone: in_pool = false)
-- ---------------------------------------------------------------------------
insert into public.catalog_challenges (id, emoji, name, description, xp, mode, min_days, rule, in_pool, sort) values
  ('cotizaciones', '🧮', 'Cierre de cotizaciones', '2 horas en la Seguridad Social esta semana.', 2, 'min', 3,
    '{"type":"time","agg":"sum","game":"segsocial","target":{"hours":2}}', false, 100),
  ('lectura-diciembre', '📰', 'Lectura de diciembre', '45 minutos en el BOE: fin de año, novedades normativas.', 2, 'min', 3,
    '{"type":"time","agg":"sum","game":"boe","target":{"minutes":45}}', false, 101),
  ('puente', '🌉', 'Puente sin sede', 'Ni un minuto en sedes el fin de semana del puente (jugando al menos 2 días).', 3, 'max', 2,
    '{"type":"time","agg":"sum","weekdays":[0,6],"target":{"minutes":1}}', false, 102),
  ('navidad-paz', '🎄', 'Navidad en paz', 'Menos de 3 horas en sedes en toda la semana de Navidad (jugando al menos 2 días).', 3, 'max', 2,
    '{"type":"time","agg":"sum","target":{"hours":3}}', false, 103),
  ('nochevieja', '🥂', 'Nochevieja tranquila', 'Nada de sedes después de las 21:00 en toda la semana (jugando al menos 2 días).', 3, 'max', 2,
    '{"type":"time","agg":"sum","hours":[21,6],"target":{"minutes":1}}', false, 104),
  ('cuesta-enero', '🥶', 'Cuesta de enero', '6 horas en la Agencia Tributaria esta semana.', 3, 'min', 3,
    '{"type":"time","agg":"sum","game":"aeat","target":{"hours":6}}', false, 105),
  ('calentando', '🔥', 'Calentando motores', '10 horas en la Agencia Tributaria antes de la semana del cierre.', 3, 'min', 3,
    '{"type":"time","agg":"sum","game":"aeat","target":{"hours":10}}', false, 106),
  ('superviviente-30', '🛡️', 'Superviviente del cierre', 'Un día con 7 horas en sedes en la semana del 4T y los resúmenes anuales.', 4, 'min', 3,
    '{"type":"time","agg":"day","target":{"hours":7}}', false, 107),
  ('maraton-cierre', '🏁', 'Maratón de cierre', '20 horas en sedes en la semana del cierre del 4T.', 4, 'min', 3,
    '{"type":"time","agg":"sum","target":{"hours":20}}', false, 108),
  ('ultimo-dia', '⏳', 'Último día de temporada', '3 horas en sedes el lunes 1 de febrero, día de cierre del 4T.', 3, 'min', 3,
    '{"type":"time","agg":"sum","weekdays":[1],"target":{"hours":3}}', false, 109),
  ('descanso', '🛌', 'Descanso merecido', 'Menos de 6 horas en sedes en la semana de después del cierre (jugando al menos 2 días).', 2, 'max', 2,
    '{"type":"time","agg":"sum","target":{"hours":6}}', false, 110)
on conflict (id) do update set
  emoji = excluded.emoji, name = excluded.name, description = excluded.description, xp = excluded.xp,
  mode = excluded.mode, min_days = excluded.min_days, rule = excluded.rule, in_pool = excluded.in_pool,
  sort = excluded.sort, active = true;

-- ---------------------------------------------------------------------------
-- Calendario: 3 retos por semana (como mucho uno de contención) y un lema
-- ---------------------------------------------------------------------------
insert into public.catalog_challenge_weeks (week, challenges, note) values
  ('2026-S45', array['constante', 'turismo', 'madrugon'],                    '🚀 Arranque de temporada'),
  ('2026-S46', array['aeat-sem', 'buzon', 'viernes-tranquilo'],              '📬 Buzón al día'),
  ('2026-S47', array['doble-sem', 'catastro-sem', 'cero-noches'],            '🪟 Semana de ventanillas'),
  ('2026-S48', array['cotizaciones', 'constante', 'sin-dgt'],                '🧮 Fin de mes'),
  ('2026-S49', array['lectura-diciembre', 'madrugon', 'puente'],             '🌉 Puente de diciembre'),
  ('2026-S50', array['constante', 'intensiva', 'turismo'],                   '🎁 Semana del Wrapped'),
  ('2026-S51', array['aeat-sem', 'doble-sem', 'cero-noches'],                '⛄ Antes de las fiestas'),
  ('2026-S52', array['buzon', 'catastro-sem', 'navidad-paz'],                '🎄 Navidad'),
  ('2026-S53', array['aeat-sem', 'lectura-diciembre', 'nochevieja'],        '🥂 Fin de año'),
  ('2027-S01', array['cuesta-enero', 'turismo', 'madrugon'],                 '👑 Reyes y cuesta de enero'),
  ('2027-S02', array['intensiva', 'doble-sem', 'sin-dgt'],                   '📈 Enero en serio'),
  ('2027-S03', array['calentando', 'constante', 'buzon'],                    '🔥 Calentando el cierre'),
  ('2027-S04', array['superviviente-30', 'maraton-cierre', 'cotizaciones'],  '🏁 Semana del cierre del 4T'),
  ('2027-S05', array['ultimo-dia', 'buzon', 'descanso'],                     '⏳ Último día de temporada')
on conflict (week) do update set challenges = excluded.challenges, note = excluded.note, active = true;

-- Comprobación: ningún día del calendario apunta a un reto que no exista o esté desactivado.
do $$
declare missing text;
begin
  select string_agg(distinct w.week || ':' || c, ', ') into missing
  from public.catalog_challenge_weeks w, unnest(w.challenges) as c
  where not exists (select 1 from public.catalog_challenges x where x.id = c and x.active);
  if missing is not null then
    raise exception '❌ El calendario usa retos que no existen o están desactivados: %', missing;
  end if;
end;
$$;

commit;

select week, array_to_string(challenges, ' · ') as retos, note as lema
from public.catalog_challenge_weeks order by week;
