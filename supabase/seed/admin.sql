-- Sedeam · darte de alta como CEO
--
-- Requiere haber ejecutado migrations/0004_admins.sql y haber entrado al menos una vez en Sedeam
-- con Google con ese email (la cuenta tiene que existir). Se puede repetir.
-- Para quitar a alguien: Table Editor → admins → borrar la fila.

insert into public.admins (user_id, note)
select id, email from auth.users
where lower(email) in ('antgire02@gmail.com', 'antgire@gmail.com')
on conflict (user_id) do nothing;

do $$
begin
  if not exists (select 1 from public.admins) then
    raise exception '❌ No hay ninguna cuenta con ese email. Entra primero en Sedeam con Google (Ajustes → Entrar con Google) y vuelve a ejecutar esto.';
  end if;
end;
$$;

select u.email, a.created_at as ceo_desde
from public.admins a join auth.users u on u.id = a.user_id
order by a.created_at;
