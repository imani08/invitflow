import assert from 'node:assert/strict';
import test from 'node:test';
import { renderInvitationImage } from './invitation-image-render.mjs';

const source = 'data:image/webp;base64,' + Buffer.from('validated webp').toString('base64');

test('renders a cropped image inside its frame with its opacity and rotation', () => {
  const markup = renderInvitationImage({
    id: 'photo-1', x: 100, y: 200, width: 300, height: 200,
    sourceWidth: 600, sourceHeight: 400, fit: 'cover',
    cropX: 50, cropY: 50, cropScale: 1.5, opacity: 0.8, rotation: 15,
  }, source);
  assert.match(markup, /clipPath id="clip-photo-1"/);
  assert.match(markup, /x="25" y="150" width="450" height="300"/);
  assert.match(markup, /opacity="0.8"/);
  assert.match(markup, /rotate\(15 250 300\)/);
});

test('rejects untrusted image URLs and unsafe layer IDs', () => {
  assert.throws(() => renderInvitationImage({ id: 'photo-1' }, 'https://example.test/photo.webp'), /validated WebP/);
  assert.throws(() => renderInvitationImage({ id: '"><script>' }, source), /validated WebP/);
});
