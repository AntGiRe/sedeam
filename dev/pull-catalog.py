# Descarga el catálogo publicado en Supabase y lo guarda como catalog.json (la copia de respaldo que
# va dentro de la extensión, para la primera instalación o si no hay conexión).
# Uso: python3 dev/pull-catalog.py   (antes de sacar una versión nueva de la extensión)
import json
import re
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
cfg = (root / 'config.js').read_text()
url = re.search(r"url: '([^']+)'", cfg.split('SUPABASE')[1]).group(1)
key = re.search(r"key: '([^']+)'", cfg.split('SUPABASE')[1]).group(1)
req = urllib.request.Request(f'{url}/rest/v1/rpc/get_catalog', data=b'{}', method='POST',
                             headers={'apikey': key, 'Content-Type': 'application/json'})
cat = json.loads(urllib.request.urlopen(req, timeout=20).read())
if not cat.get('games') or not cat.get('levels'):
    raise SystemExit('El catálogo de Supabase está vacío o incompleto: no se sobrescribe catalog.json')
(root / 'catalog.json').write_text(json.dumps(cat, ensure_ascii=False, indent=2) + '\n')
print('catalog.json actualizado:', len(cat['games']), 'sedes,', len(cat['achievements']), 'logros,', len(cat['deadlines']), 'plazos,', len(cat['news']), 'novedades · versión', cat['catalogVersion'])
