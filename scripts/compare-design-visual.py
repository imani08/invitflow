"""Compare the local Chromium preview screenshots and Poppler-rasterized PDFs.

Requires existing Pillow and pdfinfo on PATH. No production dependencies.
"""
import json
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageStat

root = Path(sys.argv[1]).resolve()
cases = json.loads((root / 'runtime-report.json').read_text(encoding='utf-8'))['cases']
sheet = Image.new('RGB', (1500, ((len(cases) + 4) // 5) * 265), 'white')
draw = ImageDraw.Draw(sheet)
report = []
for index, entry in enumerate(cases):
    key = entry['id']
    info = subprocess.check_output(['pdfinfo', str(root / (key + '.pdf'))], text=True)
    assert any(line.split(':', 1)[0] == 'Pages' and line.split(':', 1)[1].strip() == '1' for line in info.splitlines()), key
    preview = Image.open(root / (key + '-preview.png')).convert('RGB')
    pdf = Image.open(root / (key + '-pdf.png')).convert('RGB')
    assert preview.size == pdf.size, (key, preview.size, pdf.size)
    difference = ImageChops.difference(preview, pdf)
    mean = sum(ImageStat.Stat(difference).mean) / 3
    pixels = difference.get_flattened_data() if hasattr(difference, 'get_flattened_data') else difference.getdata()
    significant = sum(1 for pixel in pixels if max(pixel) > 24) / (preview.width * preview.height)
    # Bounded rasterization/anti-aliasing differences; catches crop, missing masks and visibility failures.
    accepted = mean <= 2 and significant <= 0.01
    if '--report-only' not in sys.argv:
        assert accepted, (key, mean, significant)
    report.append({'id': key, 'width': preview.width, 'height': preview.height, 'meanAbsoluteError': round(mean, 4), 'fractionPixelsOver24': significant, 'strictPixelThresholdPassed': accepted})
    x = index % 5 * 300
    y = index // 5 * 265
    draw.text((x + 4, y + 4), key, fill='black')
    draw.text((x + 4, y + 24), 'Preview / PDF', fill='black')
    for offset, image in [(3, preview), (151, pdf)]:
        image.thumbnail((145, 210))
        sheet.paste(image, (x + offset, y + 45))
sheet.save(root / 'comparison-sheet.png')
if (root / 'I-preview.png').exists():
    assert ImageChops.difference(Image.open(root / 'I-preview.png'), Image.open(root / 'J-preview.png')).getbbox(), 'Layer order has no visible effect'
if (root / 'mask-none-preview.png').exists():
    for mask in ['rounded-soft', 'organic-portrait-01', 'watercolor-soft-01', 'brush-edge-01']:
        assert ImageChops.difference(Image.open(root / 'mask-none-preview.png'), Image.open(root / ('mask-' + mask + '-preview.png'))).getbbox(), mask
(root / 'pixel-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'cases': len(report), 'maxMeanAbsoluteError': max(item['meanAbsoluteError'] for item in report), 'maxFractionPixelsOver24': max(item['fractionPixelsOver24'] for item in report)}))
