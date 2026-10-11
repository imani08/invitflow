import script from './reference-script-glyphs.mjs';

export const REFERENCE_ORNAMENTS = Object.freeze(['reference-ivory-v1', 'reference-gold-v1', 'reference-table-v1']);
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

/** Code-owned vector art only. No document-supplied markup, external URL or embedded original JPG. */
export function renderReferenceOrnament(layer) {
  if (!REFERENCE_ORNAMENTS.includes(layer.ornamentId)) throw new TypeError('Unknown reference ornament');
  const id = `ref-${layer.id}`;
  const gold = layer.ornamentId === 'reference-gold-v1';
  if (layer.ornamentId === 'reference-table-v1') return `<svg x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" viewBox="0 0 240 180"><defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#e9e9e6"/></linearGradient></defs><rect x="6" y="9" width="230" height="167" fill="#000" opacity=".12"/><rect x="1" y="1" width="230" height="167" fill="url(#${id})"/><rect x="4" y="2" width="225" height="5" fill="#b5b5b1"/><path d="M28 2v-9m167 9v-9" stroke="#8b8b83" stroke-width="4"/></svg>`;
  const palm = (x, y, scale, angle, opacity = 1) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})" fill="#4b592e" opacity="${opacity}"><path d="M0 0Q90 170 12 390" fill="none" stroke="#667446" stroke-width="5"/>${Array.from({ length: 12 }, (_, i) => { const h = 22 + i * 28; return `<path d="M${22 + i} ${h} Q${130 - i * 3} ${h + 10} ${182 - i * 5} ${h - 32} Q${132 - i * 2} ${h + 22} ${25 + i} ${h + 5}Z"/><path d="M${22 + i} ${h} Q${-60 - i} ${h - 36} ${-100 - i * 4} ${h - 22} Q${-50 - i} ${h + 5} ${25 + i} ${h + 13}Z"/>`; }).join('')}</g>`;
  const outlines = `<g fill="none" stroke="#8c9270" stroke-width="1.3" opacity=".32">${Array.from({ length: 7 }, (_, i) => `<g transform="translate(${gold ? 1050 : 1120} ${700 + i * 180}) rotate(${i * 16})"><path d="M0 0Q-130 30-200 220Q-35 195 0 0Z"/>${Array.from({ length: 8 }, (_, n) => `<path d="M-15 ${n * 25}Q-120 ${50 + n * 21}-195 218"/>`).join('')}</g>`).join('')}</g>`;
  const flower = `<g transform="translate(1350 335)" fill="#fff0b8">${Array.from({ length: 5 }, (_, i) => `<ellipse cx="0" cy="-53" rx="32" ry="71" transform="rotate(${i * 72})" fill="url(#${id}-petal)"/>`).join('')}<circle r="16" fill="#e7c16d"/></g>`;
  return `<svg x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" viewBox="0 0 ${gold ? '1500 1500' : '1500 2121'}"><defs><filter id="${id}-paper"><feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="3" seed="19"/><feColorMatrix type="saturate" values="0"/></filter><radialGradient id="${id}-petal"><stop stop-color="#f8d991"/><stop offset="1" stop-color="#fff5cc"/></radialGradient></defs><rect width="1500" height="${gold ? 1500 : 2121}" fill="${gold ? '#e3d59a' : '#f5f2e5'}"/><rect width="1500" height="${gold ? 1500 : 2121}" filter="url(#${id}-paper)" opacity="${gold ? '.055' : '.08'}"/>${outlines}${gold ? `<g fill="#b9a866" opacity=".09">${Array.from({ length: 12 }, (_, i) => `<ellipse cx="${i * 145}" cy="${150 + (i % 4) * 310}" rx="250" ry="95" transform="rotate(-25 ${i * 145} ${150 + (i % 4) * 310})"/>`).join('')}</g>` : `${palm(1430, -30, 1.2, 25)}${palm(30, 2060, .68, -140)}${palm(1430, 920, .65, 120)}${flower}`}</svg>`;
}

/** Editable source text, portable OFL glyph outlines at render time: no remote font or CSP exception. */
export function renderReferenceScript(layer, lines, size, lineHeight) {
  if (lines.some(line => [...line].some(char => !script.glyphs[char]))) return null;
  const scale = size / script.units;
  const y = layer.y + layer.height / 2 - (lines.length - 1) * size * lineHeight / 2 + size * .22;
  return `<g role="img" aria-label="${esc(lines.join(' '))}" fill="${esc(layer.color)}" opacity="${layer.opacity ?? 1}">${lines.map((line, index) => {
    const width = [...line].reduce((sum, char) => sum + script.glyphs[char].advance * scale, 0);
    let x = layer.align === 'left' ? layer.x : layer.align === 'right' ? layer.x + layer.width - width : layer.x + (layer.width - width) / 2;
    return [...line].map(char => { const glyph = script.glyphs[char]; const path = `<path d="${glyph.path}" transform="translate(${x} ${y + index * size * lineHeight}) scale(${scale} ${-scale})"/>`; x += glyph.advance * scale; return path; }).join('');
  }).join('')}</g>`;
}
