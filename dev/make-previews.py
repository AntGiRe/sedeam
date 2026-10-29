# Genera dev/app.preview.html y dev/popup.preview.html a partir de las páginas reales, con Chrome simulado.
# Uso: python3 dev/make-previews.py   (y luego: python3 -m http.server)
from pathlib import Path

root = Path(__file__).resolve().parent.parent
for page in ('popup', 'app', 'wrapped', 'report'):
    html = (root / f'{page}.html').read_text()
    for a, b in [
        ('href="ui.css"', 'href="../ui.css"'),
        ('src="theme-boot.js"', 'src="../theme-boot.js"'),
        ('src="icons/', 'src="../icons/'),
        ('href="icons/', 'href="../icons/'),
        (f'<script type="module" src="{page}.js">', f'<script src="mock-chrome.js"></script><script type="module" src="../{page}.js">'),
        ('href="app.html', 'href="app.preview.html'),
    ]:
        html = html.replace(a, b)
    (root / 'dev' / f'{page}.preview.html').write_text(html)
print('ok')
