"""Build a closed Latin glyph catalogue from the bundled OFL Great Vibes font. No runtime font fetch."""
import json
from pathlib import Path
# Developer prerequisite: fontTools. Generated paths are bundled; builds do not run Python.
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
root = Path(__file__).resolve().parents[2]
font = TTFont(root / 'packages/design-document/assets/fonts/GreatVibes-Regular.ttf')
glyphs = font.getGlyphSet()
chars = list(range(32, 591)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026]
cmap = font.getBestCmap()
result = {}
for cp in chars:
    name = cmap.get(cp)
    if not name: continue
    pen = SVGPathPen(glyphs)
    glyphs[name].draw(pen)
    result[chr(cp)] = {'advance': font['hmtx'][name][0], 'path': pen.getCommands()}
data = {'units': font['head'].unitsPerEm, 'glyphs': result}
(root / 'packages/design-document/src/reference-script-glyphs.mjs').write_text('// Generated from Great Vibes (SIL OFL 1.1). See assets/fonts/OFL-GreatVibes.txt.\nexport default ' + json.dumps(data, ensure_ascii=True, separators=(',', ':')) + ';\n', encoding='utf8')
print('Bundled glyphs:', len(result))
