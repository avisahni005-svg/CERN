"""Build one self-contained HTML file that runs the whole sketch: code, styles, all 55 photos and
(if scale/fonts/ has it) the Akkurat Mono font are embedded. Only hand tracking still loads from the web.

    python3 scale/build.py            -> cosmic-scale.html next to the scale/ folder

The output embeds the licensed font when it is present, so it is gitignored: share it, don't commit it.
"""
import base64, io, os, re
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'cosmic-scale.html')
FONT = os.path.join(HERE, 'fonts', 'AkkuratMonoLL-Regular.otf')
MAX_W = 900          # matches the largest size the page ever draws an image at
QUALITY = 80


def data_url(path, mime):
    with open(path, 'rb') as f:
        return f'data:{mime};base64,' + base64.b64encode(f.read()).decode()


def image_data(slug):
    for ext in ('jpg', 'png', 'jpeg', 'webp', 'avif'):
        p = os.path.join(HERE, 'images', f'{slug}.{ext}')
        if os.path.exists(p):
            im = Image.open(p).convert('RGB')
            if im.width > MAX_W:
                im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
            return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
    return None


def main():
    read = lambda name: open(os.path.join(HERE, name), encoding='utf-8').read()
    html = read('index.html')
    css = read('style.css')
    if os.path.exists(FONT):
        css = css.replace('url("fonts/AkkuratMonoLL-Regular.otf")', 'url("' + data_url(FONT, 'font/otf') + '")')
    else:
        css = re.sub(r'@font-face \{[^}]*Akkurat[^}]*\}\n', '', css)
    html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '</style>')

    slugs = re.findall(r"^\s*\['([a-z0-9-]+)',", read('data.js'), re.M)
    images = {s: image_data(s) for s in slugs}
    missing = [s for s, d in images.items() if not d]
    entries = ',\n'.join(f'"{s}": "{d}"' for s, d in images.items() if d)

    js = ''.join(read(f) + '\n' for f in ['data.js', 'hands.js', 'stack.js', 'main.js'])
    scripts = re.search(r'<script src="data.js"></script>.*?<script src="main.js"></script>', html, re.S).group(0)
    html = html.replace(scripts, '<script>window.IMAGE_DATA = {\n' + entries + '\n};</script>\n<script>\n' + js + '</script>')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'{OUT}: {os.path.getsize(OUT) / 1e6:.1f} MB, {len(slugs) - len(missing)} images, '
          f'font {"embedded" if os.path.exists(FONT) else "not found (IBM Plex Mono fallback)"}'
          + (f', missing: {missing}' if missing else ''))


if __name__ == '__main__':
    main()
