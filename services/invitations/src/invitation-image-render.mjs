const number = (value, fallback, minimum, maximum) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};

export function renderInvitationImage(layer, source) {
  if (!layer || typeof layer !== 'object' || typeof source !== 'string' ||
      !/^data:image\/(?:webp|png);base64,[A-Za-z0-9+/]*={0,2}$/.test(source) ||
      typeof layer.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(layer.id)) {
    throw new TypeError('A validated WebP or PNG layer and data source are required');
  }
  const x = number(layer.x, 0, 0, 4000);
  const y = number(layer.y, 0, 0, 4000);
  const width = number(layer.width, 1, 1, 4000);
  const height = number(layer.height, 1, 1, 4000);
  const sourceWidth = number(layer.sourceWidth, 1, 1, 8192);
  const sourceHeight = number(layer.sourceHeight, 1, 1, 8192);
  const ratio = sourceWidth / sourceHeight;
  const boxRatio = width / height;
  const cover = layer.fit !== 'contain';
  const frameWidth = cover
    ? (ratio > boxRatio ? height * ratio : width)
    : (ratio > boxRatio ? width : height * ratio);
  const frameHeight = frameWidth / ratio;
  const cropScale = number(layer.cropScale, 1, 1, 3);
  const renderedWidth = frameWidth * cropScale;
  const renderedHeight = frameHeight * cropScale;
  const imageX = x + (width - renderedWidth) * number(layer.cropX, 50, 0, 100) / 100;
  const imageY = y + (height - renderedHeight) * number(layer.cropY, 50, 0, 100) / 100;
  const opacity = number(layer.opacity, 1, 0, 1);
  const clipId = 'clip-' + layer.id;
  const rotation = number(layer.rotation, 0, -360, 360);
  const transform = rotation ? ' transform="rotate(' + rotation + ' ' + (x + width / 2) + ' ' + (y + height / 2) + ')"' : '';
  return '<defs><clipPath id="' + clipId + '"><rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '"/></clipPath></defs><image href="' + source + '" x="' + imageX + '" y="' + imageY + '" width="' + renderedWidth + '" height="' + renderedHeight + '" preserveAspectRatio="none" opacity="' + opacity + '" clip-path="url(#' + clipId + ')"' + transform + '/>';
}
