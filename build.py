#!/usr/bin/env python3
"""Збирає одну HTML-сторінку (dist/app.html) з усіма скриптами й стилями всередині — для публікації як Artifact."""
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'css/style.css').read_text(encoding='utf-8')
scripts = re.findall(r'<script src="(js/[^"]+)"></script>', html)
js = '\n'.join((root / s).read_text(encoding='utf-8').replace('</script', '<\\/script') for s in scripts)
fonts = re.search(r'<link rel="stylesheet" href="(https://fonts[^"]+)">', html).group(1)
out = f'''<title>Каркас скульптури</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="{fonts}">
<style>
{css}
</style>
<script>
{js}
</script>
'''
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/app.html').write_text(out, encoding='utf-8')
print('dist/app.html', len(out))
