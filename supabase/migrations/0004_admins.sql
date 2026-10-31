-- Sedeam · cuentas de la casa (Modo CEO)
--
-- Supabase → SQL Editor → New query → pegar todo → Run. Se puede repetir sin romper nada.
-- Después, para darte de alta, ejecuta supabase/seed/admin.sql.
--
-- Qué hace: la extensión pregunta am_i_admin() al sincronizar y, si la respuesta es sí, enseña el
-- Modo CEO (todo desbloqueado a la vista, con interruptor para volver a la vista normal).
--
-- Seguridad: la tabla no se puede leer ni escribir desde fuera; solo se edita desde el panel de
-- Supabase. am_i_admin() solo responde por quien llama (auth.uid()): no deja saber quién más es
-- admin. Y ser admin no da ningún permiso extra en la base de datos: solo cambia lo que se ve.

create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on table public.admins from anon, authenticated, public;

create or replace function public.am_i_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;
