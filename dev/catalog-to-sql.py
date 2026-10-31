# Genera supabase/seed/catalogo.sql a partir de catalog.json (carga inicial del catálogo en Supabase).
# Uso: python3 dev/catalog-to-sql.py
# Después de la carga inicial, el catálogo se edita en Supabase; para traerlo de vuelta como copia
# de respaldo de la extensión: python3 dev/pull-catalog.py
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
c = json.loads((root / 'catalog.json').read_text())


def q(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def j(v):
    return q(json.dumps(v, ensure_ascii=False)) + '::jsonb'


def arr(v, typ='text'):
    if not v:
        return 'null'
    return f"array[{', '.join(q(x) for x in v)}]::{typ}[]"


def upsert(table, rows, cols):
    if not rows:
        return ''
    values = ',\n'.join('  (' + ', '.join(r) + ')' for r in rows)
    sets = ', '.join(f'{c} = excluded.{c}' for c in cols if c != 'id')
    return f"insert into public.{table} ({', '.join(cols)}) values\n{values}\non conflict (id) do update set {sets};\n\n"


out = ['-- Carga inicial del catálogo (generado por dev/catalog-to-sql.py desde catalog.json).',
       '-- Supabase → SQL Editor → New query → pegar → Run. Se puede repetir: actualiza lo que ya exista.',
       'begin;', '']

out.append(upsert('catalog_games', [
    [q(g['id']), q(g['name']), q(g.get('developer')), q(g.get('genre')), q(g.get('tagline')), q(g.get('emoji', '🎮')), q(g['color']), q(g.get('url')), arr(g['domains']), q(i)]
    for i, g in enumerate(c['games'])], ['id', 'name', 'developer', 'genre', 'tagline', 'emoji', 'color', 'url', 'domains', 'sort']))

out.append(upsert('catalog_achievements', [
    [q(a['id']), q(a.get('emoji', '🏆')), q(a['name']), q(a.get('desc', '')), q(a.get('game')), q(bool(a.get('secret'))), j(a['rule']), q(i)]
    for i, a in enumerate(c['achievements'])], ['id', 'emoji', 'name', 'description', 'game', 'secret', 'rule', 'sort']))

out.append(upsert('catalog_deadlines', [
    [q(d['id']), q(d['title']), q(d.get('models', '')), q(d.get('game')), arr(d.get('months'), 'integer'), q(str(d['day'])), q(d.get('shift', 'after')), q(bool(d.get('major'))), q(i)]
    for i, d in enumerate(c['deadlines'])], ['id', 'title', 'models', 'game', 'months', 'day', 'shift', 'major', 'sort']))

out.append(upsert('catalog_challenges', [
    [q(x['id']), q(x.get('emoji', '🎯')), q(x['name']), q(x.get('desc', '')), q(x.get('xp', 2)), q(x.get('mode', 'min')), q(x.get('minDays', 3)), j(x['rule']), q(i)]
    for i, x in enumerate(c['challenges'])], ['id', 'emoji', 'name', 'description', 'xp', 'mode', 'min_days', 'rule', 'sort']))

out.append(upsert('catalog_rewards', [
    [q(r['id']), q(r['type']), q(r['name']), q(r.get('desc', '')), q(r.get('emoji', '')), j(r['unlock']), q(i)]
    for i, r in enumerate(c['rewards'])], ['id', 'type', 'name', 'description', 'emoji', 'unlock', 'sort']))

out.append(upsert('catalog_shortcuts', [
    [q(s['id']), q(s['name']), q(s.get('emoji', '🔗')), q(s['url']), q(i)]
    for i, s in enumerate(c['shortcuts'])], ['id', 'name', 'emoji', 'url', 'sort']))

out.append(upsert('catalog_infra', [
    [q(x['id']), q(x['name']), q(x.get('emoji', '🌐')), arr(x['domains']), q(i)]
    for i, x in enumerate(c['infra'])], ['id', 'name', 'emoji', 'domains', 'sort']))

# Novedades: se cargan tal cual (sin id propio); la carga las reemplaza.
out.append('delete from public.catalog_news;\n')
out.append('insert into public.catalog_news (date, title, body) values\n' + ',\n'.join(
    f"  ({q(n['date'])}, {q(n['title'])}, {q(n.get('body', ''))})" for n in reversed(c['news'])) + ';\n\n')

for key in ('levels', 'seasons', 'loading', 'minAppVersion'):
    out.append(f"insert into public.catalog_settings (key, value) values ({q(key)}, {j(c[key])})\non conflict (key) do update set value = excluded.value;\n")

out += ['', 'commit;', '', "select jsonb_array_length(public.get_catalog() -> 'games') as sedes, jsonb_array_length(public.get_catalog() -> 'achievements') as logros, jsonb_array_length(public.get_catalog() -> 'deadlines') as plazos, jsonb_array_length(public.get_catalog() -> 'news') as novedades;", '']
(root / 'supabase' / 'seed' / 'catalogo.sql').write_text('\n'.join(out))
print('supabase/seed/catalogo.sql:', len(c['games']), 'sedes,', len(c['achievements']), 'logros,', len(c['deadlines']), 'plazos,', len(c['news']), 'novedades')
