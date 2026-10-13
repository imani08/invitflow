import script from './reference-script-glyphs.mjs';

export const REFERENCE_ORNAMENTS = Object.freeze(['reference-ivory-v1', 'reference-gold-v1', 'reference-table-v1', 'paper-ivory', 'paper-gold', 'palm-top', 'palm-bottom', 'palm-right', 'flower', 'leaf-outlines', 'gold-wash']);
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

/** Code-owned vector art only. No document-supplied markup, external URL or embedded original JPG. */
export function renderReferenceOrnament(layer, paperTexture = '') {
  if (!REFERENCE_ORNAMENTS.includes(layer.ornamentId)) throw new TypeError('Unknown reference ornament');
  const id = `ref-${String(layer.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const rotation = Number.isFinite(layer.rotation) ? layer.rotation : 0;
  const opacity = Number.isFinite(layer.opacity) ? Math.max(0, Math.min(1, layer.opacity)) : 1;
  const gold = ['reference-gold-v1', 'paper-gold', 'gold-wash'].includes(layer.ornamentId);
  if (layer.ornamentId === 'reference-table-v1') return `<svg x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" viewBox="0 0 240 180"><defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#e9e9e6"/></linearGradient></defs><rect x="6" y="9" width="230" height="167" fill="#000" opacity=".12"/><rect x="1" y="1" width="230" height="167" fill="url(#${id})"/><rect x="4" y="2" width="225" height="5" fill="#b5b5b1"/><path d="M28 2v-9m167 9v-9" stroke="#8b8b83" stroke-width="4"/></svg>`;
  const palm = (x, y, scale, angle, opacity = 1) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})" fill="#4b592e" opacity="${opacity}"><path d="M0 0Q90 170 12 390" fill="none" stroke="#667446" stroke-width="5"/>${Array.from({ length: 12 }, (_, i) => { const h = 22 + i * 28; return `<path d="M${22 + i} ${h} Q${130 - i * 3} ${h + 10} ${182 - i * 5} ${h - 32} Q${132 - i * 2} ${h + 22} ${25 + i} ${h + 5}Z"/><path d="M${22 + i} ${h} Q${-60 - i} ${h - 36} ${-100 - i * 4} ${h - 22} Q${-50 - i} ${h + 5} ${25 + i} ${h + 13}Z"/>`; }).join('')}</g>`;
  const outlines = `<g fill="none" stroke="#8c9270" stroke-width="1.3" opacity=".32">${Array.from({ length: 7 }, (_, i) => `<g transform="translate(${gold ? 1050 : 1120} ${700 + i * 180}) rotate(${i * 16})"><path d="M0 0Q-130 30-200 220Q-35 195 0 0Z"/>${Array.from({ length: 8 }, (_, n) => `<path d="M-15 ${n * 25}Q-120 ${50 + n * 21}-195 218"/>`).join('')}</g>`).join('')}</g>`;
  const flower = `<g transform="translate(1350 335)" fill="#fff0b8">${Array.from({ length: 5 }, (_, i) => `<ellipse cx="0" cy="-53" rx="32" ry="71" transform="rotate(${i * 72})" fill="url(#${id}-petal)"/>`).join('')}<circle r="16" fill="#e7c16d"/></g>`;
  const safePaper = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(paperTexture);
  const paper = `<rect width="1500" height="${gold ? 1500 : 2121}" fill="${esc(layer.fill && layer.fill !== 'transparent' ? layer.fill : gold ? '#e3d59a' : '#f5f2e5')}"/>${safePaper ? `<image width="1500" height="${gold ? 1500 : 2121}" href="${paperTexture}" preserveAspectRatio="none" opacity="${gold ? '.055' : '.08'}"/>` : `<rect width="1500" height="${gold ? 1500 : 2121}" filter="url(#${id}-paper)" opacity="${gold ? '.055' : '.08'}"/>`}`;
  const wash = `<g fill="${esc(layer.ornamentId === 'gold-wash' ? layer.fill ?? '#b9a866' : '#b9a866')}" opacity=".09">${Array.from({ length: 12 }, (_, i) => `<ellipse cx="${i * 145}" cy="${150 + (i % 4) * 310}" rx="250" ry="95" transform="rotate(-25 ${i * 145} ${150 + (i % 4) * 310})"/>`).join('')}</g>`;
  const pieces = { 'paper-ivory': paper, 'paper-gold': paper, 'palm-top': palm(1430,-30,1.2,25), 'palm-bottom': palm(30,2060,.68,-140), 'palm-right': palm(1430,920,.65,120), flower, 'leaf-outlines': outlines, 'gold-wash': wash };
  const boxes = { 'palm-top': '900 0 600 600', 'palm-bottom': '0 1700 450 421', 'palm-right': '1050 800 450 650', flower: '1180 120 300 400', 'leaf-outlines': '850 600 650 1521' };
  let content = pieces[layer.ornamentId] ?? `${paper}${outlines}${gold ? wash : `${pieces['palm-top']}${pieces['palm-bottom']}${pieces['palm-right']}${flower}`}`;
  if (['palm-top','palm-bottom','palm-right','leaf-outlines','flower'].includes(layer.ornamentId) && /^#[0-9a-f]{6}$/i.test(layer.fill ?? '')) content = content.replaceAll('#4b592e',layer.fill).replaceAll('#667446',/^#[0-9a-f]{6}$/i.test(layer.stroke ?? '') ? layer.stroke : layer.fill).replaceAll('#8c9270',layer.fill).replaceAll('#fff0b8',layer.fill).replaceAll('#f8d991',layer.fill).replaceAll('#fff5cc',layer.fill);
  const svg = `<svg x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" viewBox="${boxes[layer.ornamentId] ?? `0 0 1500 ${gold ? 1500 : 2121}`}" opacity="${opacity}"><defs><filter id="${id}-paper"><feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="3" seed="19"/><feColorMatrix type="saturate" values="0"/></filter><radialGradient id="${id}-petal"><stop stop-color="${esc(layer.ornamentId === 'flower' ? layer.fill ?? '#f8d991' : '#f8d991')}"/><stop offset="1" stop-color="#fff5cc"/></radialGradient></defs>${content}</svg>`;
  return rotation ? `<g transform="rotate(${rotation} ${layer.x+layer.width/2} ${layer.y+layer.height/2})">${svg}</g>` : svg;
}

/** Upgrade only the composite code-owned artwork; never alter user photos/text. */
export function splitReferenceArtwork(input) {
  const document = structuredClone(input);
  document.elements = document.elements.flatMap(layer => {
    if (!['reference-ivory-v1','reference-gold-v1'].includes(layer.ornamentId)) return [layer];
    const gold = layer.ornamentId === 'reference-gold-v1';
    const specs = gold ? [['paper-gold','Texture dorée',0,0,1500,1500,'#e3d59a'],['gold-wash','Nuances dorées',0,0,1500,1500,'#b9a866'],['leaf-outlines','Feuillage fin',850,600,650,900,'#8c9270']] : [['paper-ivory','Texture ivoire',0,0,1500,2121,'#f5f2e5'],['leaf-outlines','Feuillage fin',850,600,650,1521,'#8c9270'],['palm-top','Palme supérieure',900,0,600,600,'#4b592e'],['palm-bottom','Palme inférieure',0,1700,450,421,'#4b592e'],['palm-right','Palme latérale',1050,800,450,650,'#4b592e'],['flower','Fleur',1180,120,300,400,'#fff0b8']];
    const baseHeight = gold ? 1500 : 2121;
    return specs.map(([ornamentId,name,x,y,width,height,fill],index) => ({ ...layer, id: `${layer.id}-${ornamentId}`, name, ornamentId, x: layer.x+x/1500*layer.width, y: layer.y+y/baseHeight*layer.height, width: width/1500*layer.width, height: height/baseHeight*layer.height, fill, zIndex: layer.zIndex+index/10, locked: false, editable: true }));
  });
  return document;
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
