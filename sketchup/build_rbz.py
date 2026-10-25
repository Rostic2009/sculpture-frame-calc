#!/usr/bin/env python3
"""Збирає розширення SketchUp (dist/sculpture_frame.rbz).
Застосунок сайту копіюється без змін (index.html, css, js, vendor); у копію index.html додається лише міст bridge.js."""
import pathlib, shutil, zipfile, re
from PIL import Image, ImageDraw

here = pathlib.Path(__file__).parent
site = here.parent
src = here / 'src'
build = here / 'build'
shutil.rmtree(build, ignore_errors=True)
pkg = build / 'sculpture_frame'
shutil.copytree(src / 'sculpture_frame', pkg)
app = pkg / 'app'
app.mkdir()
for d in ('css', 'js', 'vendor'):
    shutil.copytree(site / d, app / d)
html = (site / 'index.html').read_text(encoding='utf-8')
assert '</body>' in html
html = html.replace('</body>', '<script src="../bridge.js"></script>\n</body>', 1)
(app / 'index.html').write_text(html, encoding='utf-8')
shutil.copy(src / 'sculpture_frame.rb', build / 'sculpture_frame.rb')

# іконки панелі інструментів (16 і 24 пкс)
icons = pkg / 'icons'
icons.mkdir(exist_ok=True)
def icon(name, draw):
    for n in (16, 24):
        im = Image.new('RGBA', (n * 4, n * 4), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        draw(d, n * 4)
        im.resize((n, n), Image.LANCZOS).save(icons / f'{name}_{n}.png')
C, A, G = (60, 72, 88, 255), (192, 86, 33, 255), (47, 133, 90, 255)
def frame_icon(d, s):  # ядро-ферма
    w = s // 10
    d.line([(s*.3, s*.95), (s*.35, s*.08)], fill=C, width=w); d.line([(s*.7, s*.95), (s*.65, s*.08)], fill=C, width=w)
    for y in (.08, .5, .95): d.line([(s*.3, s*y), (s*.7, s*y)], fill=C, width=w)
    d.line([(s*.3, s*.95), (s*.68, s*.5)], fill=A, width=w); d.line([(s*.33, s*.5), (s*.65, s*.08)], fill=A, width=w)
def open_icon(d, s):
    frame_icon(d, s); d.rectangle([s*.05, s*.05, s*.95, s*.95], outline=A, width=s//16)
def parts_icon(d, s):
    d.ellipse([s*.35, s*.05, s*.65, s*.32], fill=C); d.polygon([(s*.2, s*.95), (s*.35, s*.38), (s*.65, s*.38), (s*.8, s*.95)], fill=A)
def ridge_icon(d, s):
    d.line([(s*.1, s*.15), (s*.45, s*.45), (s*.7, s*.7), (s*.95, s*.85)], fill=A, width=s//8)
    for x in (.45, .95): d.line([(s*x, s*.5 if x < .9 else s*.85), (s*x, s*.98)], fill=C, width=s//12)
def build_icon(d, s):
    frame_icon(d, s); d.rectangle([s*.1, s*.88, s*.9, s*.99], fill=G)
icon('open', open_icon); icon('parts', parts_icon); icon('frame', frame_icon); icon('ridge', ridge_icon); icon('build', build_icon)

out = here.parent / 'dist' / 'sculpture_frame.rbz'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(build.rglob('*')):
        if f.is_file():
            z.write(f, f.relative_to(build).as_posix())
print(out, out.stat().st_size)
