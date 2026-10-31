-- Carga inicial del catálogo (generado por dev/catalog-to-sql.py desde catalog.json).
-- Supabase → SQL Editor → New query → pegar → Run. Se puede repetir: actualiza lo que ya exista.
begin;

insert into public.catalog_games (id, name, developer, genre, tagline, emoji, color, url, domains, sort) values
  ('aeat', 'Agencia Tributaria', 'AEAT', 'Estrategia por turnos trimestrales', 'El clásico. Nunca pasa de moda (ni de plazo).', '🏛️', '#3987e5', 'https://sede.agenciatributaria.gob.es/', array['agenciatributaria.gob.es', 'agenciatributaria.es']::text[], 0),
  ('segsocial', 'Seguridad Social', 'TGSS · INSS', 'Gestión de recursos humanos', 'Altas, bajas y RED. Mucho RED.', '🛡️', '#d95926', 'https://sede.seg-social.gob.es/', array['seg-social.es', 'seg-social.gob.es']::text[], 1),
  ('dehu', 'DEHú', 'Secretaría General de Administración Digital', 'Terror psicológico', 'Ese pequeño escalofrío al abrir el buzón.', '📬', '#199e70', 'https://dehu.redsara.es/', array['dehu.redsara.es']::text[], 2),
  ('catastro', 'Catastro', 'Dirección General del Catastro', 'Exploración de mundo abierto', 'Referencias catastrales de 20 caracteres. Por diversión.', '🗺️', '#c98500', 'https://www.sedecatastro.gob.es/', array['sedecatastro.gob.es', 'catastro.hacienda.gob.es', 'catastro.minhap.es', 'catastro.meh.es']::text[], 3),
  ('registros', 'Registros', 'Colegio de Registradores', 'Puzle de lectura', 'Notas simples, cuentas anuales y paciencia infinita.', '📚', '#d55181', 'https://www.registradores.org/', array['registradores.org', 'rmc.es']::text[], 4),
  ('dgt', 'DGT', 'Dirección General de Tráfico', 'Conducción (de expedientes)', 'Transferencias, bajas y la cita previa imposible.', '🚗', '#008300', 'https://sede.dgt.gob.es/', array['dgt.gob.es', 'dgt.es']::text[], 5),
  ('boe', 'BOE', 'Agencia Estatal BOE', 'Novela visual', 'Lectura ligera para antes de dormir.', '📰', '#9085e9', 'https://www.boe.es/', array['boe.es']::text[], 6),
  ('sepe', 'SEPE', 'Servicio Público de Empleo Estatal', 'Supervivencia', 'Contrat@, Certific@2 y otras arrobas.', '💼', '#e66767', 'https://sede.sepe.gob.es/', array['sepe.gob.es', 'sepe.es']::text[], 7)
on conflict (id) do update set name = excluded.name, developer = excluded.developer, genre = excluded.genre, tagline = excluded.tagline, emoji = excluded.emoji, color = excluded.color, url = excluded.url, domains = excluded.domains, sort = excluded.sort;


insert into public.catalog_achievements (id, emoji, name, description, game, secret, rule, sort) values
  ('bienvenida', '🎟️', 'Bienvenido al sistema', 'Tu primer minuto cronometrado en una sede.', null, false, '{"type": "time", "agg": "sum", "target": {"minutes": 1}}'::jsonb, 0),
  ('clave', '🔐', 'Cl@ve permanente', '1 hora en total. Ya no hay vuelta atrás.', null, false, '{"type": "time", "agg": "sum", "target": {"hours": 1}}'::jsonb, 1),
  ('habitual', '☕', 'Habitual de la sede', '10 horas acumuladas.', null, false, '{"type": "time", "agg": "sum", "target": {"hours": 10}}'::jsonb, 2),
  ('centenario', '💯', 'Centenario fiscal', '100 horas acumuladas.', null, false, '{"type": "time", "agg": "sum", "target": {"hours": 100}}'::jsonb, 3),
  ('mobiliario', '🪑', 'Parte del mobiliario', '500 horas acumuladas. Ya te saludan los funcionarios.', null, false, '{"type": "time", "agg": "sum", "target": {"hours": 500}}'::jsonb, 4),
  ('leyenda', '👑', 'Leyenda de la ventanilla', '1.000 horas acumuladas.', null, false, '{"type": "time", "agg": "sum", "target": {"hours": 1000}}'::jsonb, 5),
  ('maraton', '🏃', 'Maratón en la sede', '3 horas seguidas en la misma web sin pausas de más de 5 minutos.', null, false, '{"type": "time", "agg": "run", "target": {"hours": 3}}'::jsonb, 6),
  ('mañana', '🫠', 'Se me ha ido la mañana', '5 horas seguidas en la misma web.', null, false, '{"type": "time", "agg": "run", "target": {"hours": 5}}'::jsonb, 7),
  ('jornada', '⏰', 'Jornada completa (en Hacienda)', '8 horas en sedes en un solo día.', null, false, '{"type": "time", "agg": "day", "target": {"hours": 8}}'::jsonb, 8),
  ('racha5', '✅', 'Fichaje perfecto', '5 días laborables seguidos en alguna sede.', null, false, '{"type": "streak", "days": 5}'::jsonb, 9),
  ('racha20', '🔥', 'Más fijo que el 303', 'Racha de 20 días laborables seguidos.', null, false, '{"type": "streak", "days": 20}'::jsonb, 10),
  ('dias100', '📆', 'Cien días de soledad tributaria', '100 días distintos con actividad.', null, false, '{"type": "daysPlayed", "days": 100}'::jsonb, 11),
  ('doble', '🪟', 'Doble ventanilla', 'AEAT y Seguridad Social el mismo día (10 min en cada una).', null, false, '{"type": "sameDay", "games": ["aeat", "segsocial"], "minutes": 10}'::jsonb, 12),
  ('coleccionista', '🗂️', 'Coleccionista de sedes', 'Jugar al menos a 5 webs distintas.', null, false, '{"type": "gamesPlayed", "count": 5, "minutes": 5}'::jsonb, 13),
  ('noctambulo', '🌙', 'Noctámbulo fiscal', '10 minutos en una sede entre las 23:00 y las 6:00.', null, true, '{"type": "time", "agg": "sum", "hours": [23, 6], "target": {"minutes": 10}}'::jsonb, 14),
  ('madrugador', '🐓', 'Madrugador tributario', '10 minutos en una sede entre las 6:00 y las 7:00.', null, true, '{"type": "time", "agg": "sum", "hours": [6, 7], "target": {"minutes": 10}}'::jsonb, 15),
  ('viernes', '🍻', 'Viernes por la tarde', '1 hora en sedes un viernes después de las 17:00.', null, true, '{"type": "time", "agg": "day", "weekdays": [5], "hours": [17, 24], "target": {"hours": 1}}'::jsonb, 16),
  ('finde', '🛋️', 'Sin fin de semana', '30 minutos en sedes un sábado o domingo.', null, true, '{"type": "time", "agg": "sum", "weekdays": [0, 6], "target": {"minutes": 30}}'::jsonb, 17),
  ('agosto', '🏖️', 'Agosto no existe', '1 hora en sedes durante agosto.', null, true, '{"type": "time", "agg": "sum", "months": [8], "target": {"hours": 1}}'::jsonb, 18),
  ('navidad', '🎄', 'Espíritu navideño tributario', '10 minutos en una sede en Nochebuena, Navidad, Nochevieja, Año Nuevo o Reyes.', null, true, '{"type": "time", "agg": "sum", "dates": ["12-24", "12-25", "12-31", "01-01", "01-06"], "target": {"minutes": 10}}'::jsonb, 19),
  ('dia20', '📅', 'Superviviente del día 20', '2 horas en la AEAT un último día de trimestre (20 de abril, julio u octubre, o 30 de enero).', 'aeat', false, '{"type": "time", "agg": "day", "game": "aeat", "dates": ["04-20", "07-20", "10-20", "01-30"], "target": {"hours": 2}}'::jsonb, 20),
  ('renta', '🧾', 'Campaña de la Renta superada', '40 horas en la AEAT entre abril y junio del mismo año.', 'aeat', false, '{"type": "time", "agg": "year", "game": "aeat", "months": [4, 5, 6], "target": {"hours": 40}}'::jsonb, 21),
  ('enero', '🥶', 'Cuesta de enero', '20 horas en la AEAT en un mes de enero (390, 190, 180, 347…).', 'aeat', false, '{"type": "time", "agg": "year", "game": "aeat", "months": [1], "target": {"hours": 20}}'::jsonb, 22),
  ('aeat100', '🏛️', 'Socio de la Agencia', '100 horas en la Agencia Tributaria.', 'aeat', false, '{"type": "time", "agg": "sum", "game": "aeat", "target": {"hours": 100}}'::jsonb, 23),
  ('afiliado', '🛡️', 'Afiliado de honor', '20 horas en la Seguridad Social.', 'segsocial', false, '{"type": "time", "agg": "sum", "game": "segsocial", "target": {"hours": 20}}'::jsonb, 24),
  ('fin-de-mes', '🧮', 'Cierre de seguros sociales', '2 horas en la Seguridad Social en un mismo día de final de mes (del 25 al 31).', 'segsocial', false, '{"type": "time", "agg": "day", "game": "segsocial", "dates": ["*-25", "*-26", "*-27", "*-28", "*-29", "*-30", "*-31"], "target": {"hours": 2}}'::jsonb, 25),
  ('notificado', '📬', 'Notificado y comparecido', '1 hora en DEHú.', 'dehu', false, '{"type": "time", "agg": "sum", "game": "dehu", "target": {"hours": 1}}'::jsonb, 26),
  ('catastro', '🗺️', 'Topógrafo aficionado', '5 horas en el Catastro.', 'catastro', false, '{"type": "time", "agg": "sum", "game": "catastro", "target": {"hours": 5}}'::jsonb, 27),
  ('registros', '📚', 'Nota simple, vida compleja', '5 horas en Registros.', 'registros', false, '{"type": "time", "agg": "sum", "game": "registros", "target": {"hours": 5}}'::jsonb, 28),
  ('dgt', '🚗', 'Cita previa conseguida', '2 horas en la DGT.', 'dgt', false, '{"type": "time", "agg": "sum", "game": "dgt", "target": {"hours": 2}}'::jsonb, 29),
  ('boe', '📰', 'Lector del BOE', '5 horas leyendo el BOE. Por gusto.', 'boe', false, '{"type": "time", "agg": "sum", "game": "boe", "target": {"hours": 5}}'::jsonb, 30),
  ('sepe', '💼', 'Arroba de oro', '5 horas en el SEPE.', 'sepe', false, '{"type": "time", "agg": "sum", "game": "sepe", "target": {"hours": 5}}'::jsonb, 31),
  ('carga1', '🪪', 'Demostrando que eres tú', '1 hora en pantallas de identificación (Cl@ve).', null, false, '{"type": "loading", "agg": "sum", "target": {"hours": 1}}'::jsonb, 32),
  ('carga10', '🔑', 'La Cl@ve de la existencia', '10 horas identificándote. Ya deberían conocerte.', null, false, '{"type": "loading", "agg": "sum", "target": {"hours": 10}}'::jsonb, 33),
  ('carga-dia', '⏳', 'Cargando… por favor, espere', '20 minutos en pantallas de identificación en un mismo día.', null, true, '{"type": "loading", "agg": "day", "target": {"minutes": 20}}'::jsonb, 34),
  ('caida1', '💥', 'Error 500: ya somos amigos', 'Ver caerse una sede por primera vez.', null, false, '{"type": "outages", "agg": "sum", "count": 1}'::jsonb, 35),
  ('caida-dia', '🔁', 'Reintentar, reintentar, reintentar', '3 caídas de la sede en un mismo día.', null, false, '{"type": "outages", "agg": "day", "count": 3}'::jsonb, 36),
  ('caida25', '🧯', 'Superviviente de caídas', '25 caídas de sedes en total.', null, false, '{"type": "outages", "agg": "sum", "count": 25}'::jsonb, 37),
  ('caida-aeat', '🏚️', 'Mantenimiento no programado', '10 caídas de la Agencia Tributaria.', 'aeat', false, '{"type": "outages", "agg": "sum", "count": 10, "game": "aeat"}'::jsonb, 38),
  ('caida-ss', '🚧', 'Sistema RED… en rojo', '5 caídas de la Seguridad Social.', 'segsocial', false, '{"type": "outages", "agg": "sum", "count": 5, "game": "segsocial"}'::jsonb, 39),
  ('malabarista', '🤹', 'Malabarista', '5 pestañas de la misma sede abiertas a la vez.', null, false, '{"type": "tabs", "count": 5, "perGame": true}'::jsonb, 40),
  ('pulpo', '🐙', 'Pulpo administrativo', '10 pestañas de sedes abiertas a la vez.', null, false, '{"type": "tabs", "count": 10}'::jsonb, 41),
  ('caida-clave', '🫥', 'Hoy no eres nadie', 'Cl@ve se cae justo cuando intentas identificarte.', null, false, '{"type": "outages", "agg": "sum", "count": 1, "game": "clave"}'::jsonb, 42),
  ('caida-clave5', '👻', 'Identidad en paradero desconocido', '5 caídas de Cl@ve.', null, false, '{"type": "outages", "agg": "sum", "count": 5, "game": "clave"}'::jsonb, 43),
  ('caida-sara', '🌐', 'Red SARA en apuros', '3 caídas de Red SARA (REC, VALIDe, Notific@…).', null, false, '{"type": "outages", "agg": "sum", "count": 3, "game": "redsara"}'::jsonb, 44),
  ('caida-fnmt', '📜', 'Certificado en el limbo', 'La FNMT se cae mientras renuevas un certificado.', null, true, '{"type": "outages", "agg": "sum", "count": 1, "game": "fnmt"}'::jsonb, 45),
  ('apagon', '🕳️', 'Apagón administrativo', 'Caídas de 3 webs distintas (sedes, Cl@ve o Red SARA) en un mismo día.', null, false, '{"type": "outageSites", "count": 3}'::jsonb, 46),
  ('reto1', '🎯', 'Primer reto', 'Completa tu primer reto semanal.', null, false, '{"type": "challenges", "count": 1}'::jsonb, 47),
  ('reto25', '🏅', 'Retador profesional', 'Completa 25 retos semanales.', null, false, '{"type": "challenges", "count": 25}'::jsonb, 48),
  ('reto-pleno', '💯', 'Pleno semanal', 'Completa los 3 retos de una misma semana.', null, false, '{"type": "challengeWeek", "count": 3}'::jsonb, 49)
on conflict (id) do update set emoji = excluded.emoji, name = excluded.name, description = excluded.description, game = excluded.game, secret = excluded.secret, rule = excluded.rule, sort = excluded.sort;


insert into public.catalog_deadlines (id, title, models, game, months, day, shift, major, sort) values
  ('t4', 'Cierre del 4T y resúmenes anuales', '303 · 130 · 111 · 115 · 349 · 390 · 190 · 180', 'aeat', array[1]::integer[], '30', 'after', true, 0),
  ('t1', 'Declaraciones del 1T', '303 · 130 · 111 · 115 · 349', 'aeat', array[4]::integer[], '20', 'after', true, 1),
  ('t2', 'Declaraciones del 2T', '303 · 130 · 111 · 115 · 349', 'aeat', array[7]::integer[], '20', 'after', true, 2),
  ('t3', 'Declaraciones del 3T', '303 · 130 · 111 · 115 · 349', 'aeat', array[10]::integer[], '20', 'after', true, 3),
  ('dom-t4', 'Domiciliación del 4T', '303 · 130 · 111 · 115', 'aeat', array[1]::integer[], '25', 'after', false, 4),
  ('dom-tri', 'Domiciliación del trimestre', '303 · 130 · 111 · 115', 'aeat', array[4, 7, 10]::integer[], '15', 'after', false, 5),
  ('347', 'Operaciones con terceros', '347', 'aeat', array[2]::integer[], 'last', 'after', false, 6),
  ('renta-dom', 'Renta con domiciliación', '100 · 714', 'aeat', array[6]::integer[], '25', 'after', false, 7),
  ('renta', 'Fin de la campaña de la Renta', '100 · 714', 'aeat', array[6]::integer[], '30', 'after', true, 8),
  ('is', 'Impuesto sobre Sociedades', '200', 'aeat', array[7]::integer[], '25', 'after', false, 9),
  ('ss', 'Cotizaciones del mes', 'Sistema RED', 'segsocial', null, 'last', 'before', false, 10)
on conflict (id) do update set title = excluded.title, models = excluded.models, game = excluded.game, months = excluded.months, day = excluded.day, shift = excluded.shift, major = excluded.major, sort = excluded.sort;


insert into public.catalog_challenges (id, emoji, name, description, xp, mode, min_days, rule, sort) values
  ('constante', '📆', 'Semana constante', 'Entra en alguna sede 5 días distintos.', 2, 'min', 3, '{"type": "daysPlayed", "days": 5}'::jsonb, 0),
  ('intensiva', '⚡', 'Jornada intensiva', 'Un día con 6 horas en sedes.', 3, 'min', 3, '{"type": "time", "agg": "day", "target": {"hours": 6}}'::jsonb, 1),
  ('maraton-sem', '🏃', 'Maratón semanal', '15 horas en sedes esta semana.', 4, 'min', 3, '{"type": "time", "agg": "sum", "target": {"hours": 15}}'::jsonb, 2),
  ('madrugon', '🌅', 'Madrugón', '30 minutos en sedes antes de las 9:00.', 2, 'min', 3, '{"type": "time", "agg": "sum", "hours": [5, 9], "target": {"minutes": 30}}'::jsonb, 3),
  ('turismo', '🧳', 'Turismo administrativo', 'Visita 4 sedes distintas (5 min en cada una).', 2, 'min', 3, '{"type": "gamesPlayed", "count": 4, "minutes": 5}'::jsonb, 4),
  ('doble-sem', '🪟', 'Doble ventanilla', 'AEAT y Seguridad Social el mismo día.', 2, 'min', 3, '{"type": "sameDay", "games": ["aeat", "segsocial"], "minutes": 10}'::jsonb, 5),
  ('boe-sem', '📰', 'Lectura obligatoria', '30 minutos en el BOE.', 2, 'min', 3, '{"type": "time", "agg": "sum", "game": "boe", "target": {"minutes": 30}}'::jsonb, 6),
  ('buzon', '📬', 'Buzón al día', 'Entra en DEHú 3 días distintos.', 2, 'min', 3, '{"type": "daysPlayed", "days": 3, "game": "dehu", "minutes": 1}'::jsonb, 7),
  ('catastro-sem', '🗺️', 'Explorador del Catastro', '20 minutos en el Catastro.', 2, 'min', 3, '{"type": "time", "agg": "sum", "game": "catastro", "target": {"minutes": 20}}'::jsonb, 8),
  ('aeat-sem', '🏛️', 'Semana tributaria', '8 horas en la Agencia Tributaria.', 3, 'min', 3, '{"type": "time", "agg": "sum", "game": "aeat", "target": {"hours": 8}}'::jsonb, 9),
  ('sin-dgt', '🚫', 'Sin pisar la DGT', 'Menos de 5 minutos en la DGT en toda la semana (jugando al menos 3 días).', 2, 'max', 3, '{"type": "time", "agg": "sum", "game": "dgt", "target": {"minutes": 5}}'::jsonb, 10),
  ('viernes-tranquilo', '🍹', 'Viernes tranquilo', 'Menos de 1 hora en sedes el viernes (jugando al menos 3 días).', 2, 'max', 3, '{"type": "time", "agg": "sum", "weekdays": [5], "target": {"hours": 1}}'::jsonb, 11),
  ('cero-noches', '😴', 'Cero noches', 'Nada de sedes después de las 21:00 en toda la semana (jugando al menos 3 días).', 3, 'max', 3, '{"type": "time", "agg": "sum", "hours": [21, 6], "target": {"minutes": 1}}'::jsonb, 12),
  ('finde-libre', '🛋️', 'Fin de semana libre', 'Ni un minuto en sedes el sábado ni el domingo (jugando al menos 3 días).', 2, 'max', 3, '{"type": "time", "agg": "sum", "weekdays": [0, 6], "target": {"minutes": 1}}'::jsonb, 13)
on conflict (id) do update set emoji = excluded.emoji, name = excluded.name, description = excluded.description, xp = excluded.xp, mode = excluded.mode, min_days = excluded.min_days, rule = excluded.rule, sort = excluded.sort;


insert into public.catalog_rewards (id, type, name, description, emoji, unlock, sort) values
  ('theme-sede', 'theme', 'Sede', 'El azul de siempre.', '', '{"default": true}'::jsonb, 0),
  ('theme-papel', 'theme', 'Papel timbrado', 'Tonos sepia, como un expediente de 1987.', '', '{"level": 3}'::jsonb, 1),
  ('theme-boe', 'theme', 'Modo BOE', 'Blanco y negro. Sin distracciones. Sin alegría.', '', '{"level": 5}'::jsonb, 2),
  ('theme-oro', 'theme', 'Inspector dorado', 'Negro y oro, para quien ya lo ha visto todo.', '', '{"level": 8}'::jsonb, 3),
  ('theme-cierre', 'theme', 'Noche de cierre', 'Rojo oscuro de día 20 a las 23:40.', '', '{"seasonTier": 10}'::jsonb, 4),
  ('theme-renta', 'theme', 'Campaña de la Renta', 'Verde borrador aceptado.', '', '{"seasonTier": 20}'::jsonb, 5),
  ('avatar-gestor', 'avatar', 'Gestor', '', '🧑‍💼', '{"default": true}'::jsonb, 6),
  ('avatar-gestora', 'avatar', 'Gestora', '', '👩‍💼', '{"default": true}'::jsonb, 7),
  ('avatar-gestor2', 'avatar', 'Gestor clásico', '', '👨‍💼', '{"default": true}'::jsonb, 8),
  ('avatar-abaco', 'avatar', 'Ábaco', '', '🧮', '{"level": 2}'::jsonb, 9),
  ('avatar-robot', 'avatar', 'Automatizado', '', '🤖', '{"level": 4}'::jsonb, 10),
  ('avatar-mago', 'avatar', 'Mago de los modelos', '', '🧙', '{"level": 7}'::jsonb, 11),
  ('avatar-cafe', 'avatar', 'Cafetera humana', '', '☕', '{"achievement": "habitual"}'::jsonb, 12),
  ('avatar-buho', 'avatar', 'Búho fiscal', '', '🦉', '{"achievement": "noctambulo"}'::jsonb, 13),
  ('avatar-gallo', 'avatar', 'Gallo madrugador', '', '🐓', '{"achievement": "madrugador"}'::jsonb, 14),
  ('avatar-playa', 'avatar', 'Vacaciones (en teoría)', '', '🏖️', '{"achievement": "agosto"}'::jsonb, 15),
  ('avatar-renta', 'avatar', 'Borrador confirmado', '', '🧾', '{"achievement": "renta"}'::jsonb, 16),
  ('avatar-fuego', 'avatar', 'En racha', '', '🔥', '{"achievement": "racha20"}'::jsonb, 17),
  ('avatar-corona', 'avatar', 'Realeza tributaria', '', '👑', '{"achievement": "leyenda"}'::jsonb, 18),
  ('avatar-heroe', 'avatar', 'Superhéroe del plazo', '', '🦸', '{"seasonTier": 25}'::jsonb, 19),
  ('frame-bronce', 'frame', 'Marco de bronce', '', '', '{"seasonTier": 5}'::jsonb, 20),
  ('frame-plata', 'frame', 'Marco de plata', '', '', '{"seasonTier": 15}'::jsonb, 21),
  ('frame-oro', 'frame', 'Marco de oro', '', '', '{"seasonTier": 30}'::jsonb, 22),
  ('frame-fuego', 'frame', 'Marco en llamas', '', '', '{"achievement": "racha20"}'::jsonb, 23),
  ('title-veterano', 'title', 'Veterano de temporada', '', '', '{"seasonTier": 15}'::jsonb, 24),
  ('title-leyenda', 'title', 'Leyenda de temporada', '', '', '{"seasonTier": 30}'::jsonb, 25),
  ('title-clave', 'title', 'Amigo íntimo de Cl@ve', '', '', '{"level": 2}'::jsonb, 26),
  ('title-honor', 'title', 'Funcionario honorífico', '', '', '{"level": 6}'::jsonb, 27)
on conflict (id) do update set type = excluded.type, name = excluded.name, description = excluded.description, emoji = excluded.emoji, unlock = excluded.unlock, sort = excluded.sort;


insert into public.catalog_shortcuts (id, name, emoji, url, sort) values
  ('sc-aeat', 'Sede AEAT', '🏛️', 'https://sede.agenciatributaria.gob.es/', 0),
  ('sc-ss', 'Sede Seg. Social', '🛡️', 'https://sede.seg-social.gob.es/', 1),
  ('sc-dehu', 'DEHú', '📬', 'https://dehu.redsara.es/', 2),
  ('sc-rec', 'Registro (REC)', '📨', 'https://rec.redsara.es/', 3),
  ('sc-catastro', 'Catastro', '🗺️', 'https://www.sedecatastro.gob.es/', 4),
  ('sc-boe', 'BOE', '📰', 'https://www.boe.es/', 5)
on conflict (id) do update set name = excluded.name, emoji = excluded.emoji, url = excluded.url, sort = excluded.sort;


insert into public.catalog_infra (id, name, emoji, domains, sort) values
  ('clave', 'Cl@ve', '🔑', array['clave.gob.es']::text[], 0),
  ('redsara', 'Red SARA', '🌐', array['redsara.es']::text[], 1),
  ('fnmt', 'FNMT (certificados)', '🪪', array['fnmt.gob.es', 'fnmt.es', 'cert.fnmt.es']::text[], 2)
on conflict (id) do update set name = excluded.name, emoji = excluded.emoji, domains = excluded.domains, sort = excluded.sort;


delete from public.catalog_news;

insert into public.catalog_news (date, title, body) values
  ('2026-10-29', 'Horas en Sede ahora es Sedeam', 'Nueva biblioteca, logros con barra de progreso, ficha de cada juego y actualizaciones automáticas del catálogo.'),
  ('2026-10-29', 'Avisos de logro como en las consolas', 'Al desbloquear un logro aparece una tarjeta con sonido en la esquina de la sede que estés usando. Se puede probar y ajustar en Ajustes → Avisos.'),
  ('2026-10-29', 'Llegan las temporadas', 'Cada trimestre fiscal es una temporada con su pase de 30 niveles. Desbloquea temas de color, avatares, marcos y títulos, y personaliza tu perfil. Además: calendario de plazos con cuenta atrás.'),
  ('2026-10-29', 'Lo que no sale en la nómina', 'Sedeam cuenta ahora el tiempo que pasas identificándote con Cl@ve, las veces que se cae la sede y tu récord de pestañas abiertas. Con 10 logros nuevos.'),
  ('2026-10-29', 'Caídas de Cl@ve, Red SARA y FNMT', 'Ahora también se apuntan las caídas de las webs de las que dependen las sedes: Cl@ve, Red SARA (REC, VALIDe, Notific@…) y la FNMT. Con 5 logros nuevos, como «Hoy no eres nadie».'),
  ('2026-10-29', 'Retos semanales, lanzador y pausa activa', 'Cada lunes, 3 retos nuevos que dan puntos de temporada. Accesos directos a tus trámites desde el popup (añade la página que tengas abierta con un clic) y un recordatorio para estirar las piernas.'),
  ('2026-10-29', 'Ahora todo va en XP', '1 minuto en una sede = 1 XP. +10 XP por el primer fichaje del día y +120 a 240 XP por reto. Mientras trabajas, cada 15 minutos verás una píldora de +15 XP en la sede.');


insert into public.catalog_settings (key, value) values ('levels', '[[0, "Becario"], [5, "Auxiliar administrativo"], [25, "Oficial de 2ª"], [75, "Oficial de 1ª"], [150, "Gestor"], [300, "Gestor colegiado"], [600, "Gestor senior"], [1000, "Asesor fiscal"], [2000, "Leyenda de la sede"], [5000, "Inspector honorífico"]]'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.catalog_settings (key, value) values ('seasons', '{"hoursPerTier": 4, "tiers": 30, "ends": [{"quarter": "4T", "month": 1, "day": 30, "yearOffset": -1}, {"quarter": "1T", "month": 4, "day": 20, "yearOffset": 0}, {"quarter": "2T", "month": 7, "day": 20, "yearOffset": 0}, {"quarter": "3T", "month": 10, "day": 20, "yearOffset": 0}], "names": {"1T": {"name": "Primavera fiscal", "emoji": "🌱", "color": "#1baf7a"}, "2T": {"name": "La temporada de la Renta", "emoji": "🧾", "color": "#3987e5"}, "3T": {"name": "Verano (¿qué verano?)", "emoji": "🏖️", "color": "#c98500"}, "4T": {"name": "Cierre de año", "emoji": "🎆", "color": "#d55181"}}}'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.catalog_settings (key, value) values ('loading', '{"name": "Pantallas de carga", "domains": ["clave.gob.es"], "urlContains": []}'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.catalog_settings (key, value) values ('minAppVersion', '"0.6.0"'::jsonb)
on conflict (key) do update set value = excluded.value;


commit;

select jsonb_array_length(public.get_catalog() -> 'games') as sedes, jsonb_array_length(public.get_catalog() -> 'achievements') as logros, jsonb_array_length(public.get_catalog() -> 'deadlines') as plazos, jsonb_array_length(public.get_catalog() -> 'news') as novedades;
