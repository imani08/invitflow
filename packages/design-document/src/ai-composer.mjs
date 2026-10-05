import { assessImageResolution, resolveDesignLayout, validateDesignDocumentV2 } from './index.mjs';
import { createProfessionalTemplate, PROFESSIONAL_RECIPES, professionalCompositionManifest } from './professional-templates.mjs';

export const AI_COMPOSER_VERSION = 'AI_COMPOSER_V1';
const strategyTags = Object.freeze({ NO_PHOTO: ['no-photo', 'minimal'], SINGLE_PHOTO: ['photo', 'portrait'], BACKGROUND_PHOTO: ['photo', 'editorial', 'background'], FOREGROUND_PHOTO: ['photo', 'foreground'], MULTI_PHOTO: ['photo', 'multi-photo'] });
const paletteTags = Object.freeze({ signature: ['gold', 'ivory'], ivoryGold: ['gold', 'ivory', 'neutral'], emeraldIvory: ['green', 'emerald', 'ivory'], midnight: ['gold', 'dark', 'sombre'] });
const themeCategory = Object.freeze({ WEDDING: 'WEDDING', DOT: 'WEDDING', BIRTHDAY: 'BIRTHDAY', ANNIVERSARY: 'WEDDING', GRADUATION: 'GRADUATION', CORPORATE: 'GALA', RELIGIOUS: 'WEDDING', FUNERAL_OR_MEMORIAL: 'WEDDING', BABY_SHOWER: 'BABY_SHOWER', CONFERENCE: 'CONFERENCE', GALA: 'GALA', CUSTOM: 'WEDDING', BAPTISM: 'BAPTISM', DINNER: 'GALA', CEREMONY: 'WEDDING', OTHER: 'WEDDING' });
const dictionary = Object.freeze({
  botanical: ['botanical', 'floral', 'nature', 'floral'], classic: ['classic', 'traditional', 'classique'], luxury: ['luxury', 'luxueux', 'luxurious'], editorial: ['editorial', 'photo', 'photographie'], modern: ['modern', 'moderne', 'contemporary', 'contemporain'], african: ['african', 'africain', 'africaine'], minimal: ['minimal', 'minimalist', 'sobre', 'simple'], religious: ['religious', 'religieux', 'chrétien', 'christian'], formal: ['formal', 'formel', 'élégant', 'elegant'], romantic: ['romantic', 'romantique', 'warm', 'chaleureux'], geometric: ['geometric', 'géométrique'], gold: ['gold', 'or', 'doré', 'dorée'], ivory: ['ivory', 'ivoire', 'clair', 'light'], green: ['green', 'vert', 'verte', 'emerald', 'émeraude'], dark: ['dark', 'sombre', 'midnight'], noPhoto: ['sans photo', 'no photo', 'no-photo'], withPhoto: ['avec photo', 'with photo', 'photo'],
});

function tags(value) { return Array.isArray(value) ? value.filter(item => typeof item === 'string').map(item => item.toLocaleLowerCase('fr')) : typeof value === 'string' ? [value.toLocaleLowerCase('fr')] : []; }
function containsAny(text, values) { return values.some(value => text.includes(value)); }
export function interpretComposerPreferences(preferences = {}) {
  const text = [preferences.style, preferences.mood, preferences.description, ...(preferences.colors ?? [])].filter(value => typeof value === 'string').join(' ').toLocaleLowerCase('fr');
  const allTags = Object.entries(dictionary).filter(([, words]) => containsAny(text, words)).map(([tag]) => tag);
  const styles = [...new Set([...tags(preferences.style), ...tags(preferences.styleTags), ...allTags.filter(tag => ['botanical', 'classic', 'luxury', 'editorial', 'modern', 'african', 'minimal', 'geometric'].includes(tag))])];
  const moods = [...new Set([...tags(preferences.mood), ...tags(preferences.moodTags), ...allTags.filter(tag => ['religious', 'formal', 'romantic'].includes(tag))])];
  const colors = [...new Set([...(preferences.colors ?? []).flatMap(value => tags(value)), ...tags(preferences.paletteTags), ...allTags.filter(tag => ['gold', 'ivory', 'green', 'dark'].includes(tag))])];
  const media = preferences.media === 'WITHOUT_PHOTO' || allTags.includes('noPhoto') ? 'WITHOUT_PHOTO' : preferences.media === 'WITH_PHOTO' || allTags.includes('withPhoto') ? 'WITH_PHOTO' : 'ANY';
  return { styleTags: styles, moodTags: moods, paletteTags: colors, media, language: 'fr', count: Number.isInteger(preferences.count) ? preferences.count : 4, ...(Array.isArray(preferences.photoIds) ? { photoIds: [...preferences.photoIds] } : {}) };
}

function hash(value) { let result = 2166136261; for (const character of value) { result ^= character.codePointAt(0); result = Math.imul(result, 16777619); } return result >>> 0; }
function random(seed) { let value = seed >>> 0; return () => { value += 0x6D2B79F5; let next = value; next = Math.imul(next ^ next >>> 15, next | 1); next ^= next + Math.imul(next ^ next >>> 7, next | 61); return ((next ^ next >>> 14) >>> 0) / 4294967296; }; }
function orientation(photo) { return photo.width === photo.height ? 'SQUARE' : photo.width > photo.height ? 'LANDSCAPE' : 'PORTRAIT'; }
function photoFit(photo, strategy) {
  const sourceRatio = photo.width / photo.height;
  const targetRatio = strategy === 'BACKGROUND_PHOTO' ? 1480 / 2100 : strategy === 'MULTI_PHOTO' ? 1000 / 590 : 1180 / 590;
  return Math.max(0, 100 - Math.round(Math.abs(Math.log(sourceRatio / targetRatio)) * 34));
}
function densityScore(recipe, density) { return !recipe.supportedTextDensity.includes(density) ? 0 : density === 'HIGH' && recipe.styleTags.includes('minimal') ? 48 : 100; }
function styleScore(recipe, preferences) {
  const wanted = [...preferences.styleTags, ...preferences.moodTags];
  const offered = [...recipe.styleTags, ...recipe.moodTags];
  return wanted.length ? Math.round(100 * wanted.filter(tag => offered.includes(tag)).length / wanted.length) : 65;
}
function paletteScore(recipe, paletteId, wanted) {
  if (!wanted.length) return paletteId === 'signature' ? 78 : 62;
  return paletteTags[paletteId].some(tag => wanted.some(value => tag.includes(value) || value.includes(tag))) ? 100 : 28;
}
function similarities(first, second) {
  let penalty = 0;
  if (first.family === second.family) penalty += 55;
  if (first.strategy === second.strategy) penalty += 17;
  if (first.paletteId === second.paletteId) penalty += 17;
  if (first.recipeId === second.recipeId) penalty += 38;
  if (first.photoOrientation === second.photoOrientation && first.strategy !== 'NO_PHOTO') penalty += 8;
  return penalty;
}
function reasonFor(recipe, strategy, ceremonies, density, paletteId, language) {
  const style = recipe.styleTags.includes('botanical') ? 'botanique' : recipe.styleTags.includes('african-contemporary') ? 'africaine contemporaine' : recipe.styleTags.includes('luxury') ? 'éditoriale et élégante' : 'typographique';
  const media = strategy === 'NO_PHOTO' ? 'sans photo' : strategy === 'BACKGROUND_PHOTO' ? 'avec une photo en arrière-plan' : strategy === 'MULTI_PHOTO' ? 'avec deux photos' : 'avec une photo';
  const ceremony = ceremonies.length === 0 ? 'adaptée à votre événement' : `adaptée à vos ${ceremonies.length} ${ceremonies.length > 1 ? 'cérémonies' : 'cérémonie'}`;
  const content = density === 'HIGH' ? 'et à un programme dense' : '';
  const color = paletteId === 'emeraldIvory' ? 'aux tons émeraude et ivoire' : paletteId === 'ivoryGold' ? 'aux tons ivoire et or' : '';
  return `${style}, ${media}, ${ceremony} ${content} ${color}`.replace(/\s+/g, ' ').trim().replace(/\s+,/g, ',');
}
function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Composer input required');
  const allowed = ['eventType', 'eventTitle', 'coupleNames', 'invitationText', 'eventDate', 'venue', 'ceremonyTypes', 'ceremonies', 'textDensity', 'hasTable', 'hasQr', 'hasDressCode', 'photos', 'seed', 'preferences', 'previouslyShown'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new TypeError('Unexpected Composer input field');
  if (!['WEDDING', 'DOT', 'BIRTHDAY', 'ANNIVERSARY', 'GRADUATION', 'CORPORATE', 'RELIGIOUS', 'FUNERAL_OR_MEMORIAL', 'BABY_SHOWER', 'CONFERENCE', 'GALA', 'CUSTOM', 'BAPTISM', 'DINNER', 'CEREMONY', 'OTHER'].includes(input.eventType)) throw new TypeError('Unsupported composer event type');
  if (!Array.isArray(input.ceremonies) || input.ceremonies.length > 100 || input.ceremonies.some(ceremony => !ceremony || typeof ceremony !== 'object' || Object.values(ceremony).some(value => value !== undefined && value !== null && (typeof value !== 'string' || value.length > 1000))) || !['LOW', 'MEDIUM', 'HIGH'].includes(input.textDensity)) throw new TypeError('Invalid composer event profile');
  if (typeof input.seed !== 'string' || !input.seed.trim() || input.seed.length > 128) throw new TypeError('A reproducible composer seed is required');
  if (input.photos !== undefined && (!Array.isArray(input.photos) || input.photos.length > 2000 || input.photos.some(photo => !photo || !/^[0-9a-f-]{36}$/i.test(photo.id) || !Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width < 1 || photo.height < 1))) throw new TypeError('Invalid private photo inventory');
  for (const field of ['eventTitle', 'coupleNames', 'invitationText', 'eventDate', 'venue']) if (input[field] !== undefined && (typeof input[field] !== 'string' || input[field].length > 12000)) throw new TypeError(`Invalid composer event ${field}`);
  if (input.preferences !== undefined && (!input.preferences || typeof input.preferences !== 'object' || Array.isArray(input.preferences) || Object.keys(input.preferences).some(key => !['style', 'mood', 'colors', 'description', 'media', 'count', 'styleTags', 'moodTags', 'paletteTags', 'language', 'photoIds'].includes(key)) || ['style', 'mood', 'description'].some(key => input.preferences[key] !== undefined && (typeof input.preferences[key] !== 'string' || input.preferences[key].length > 240)) || ['styleTags', 'moodTags', 'paletteTags', 'colors'].some(key => input.preferences[key] !== undefined && (!Array.isArray(input.preferences[key]) || input.preferences[key].length > 12 || input.preferences[key].some(value => typeof value !== 'string' || value.length > 40))) || input.preferences.photoIds !== undefined && (!Array.isArray(input.preferences.photoIds) || input.preferences.photoIds.length > 200 || input.preferences.photoIds.some(value => typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value))) || input.preferences.media !== undefined && !['ANY', 'WITH_PHOTO', 'WITHOUT_PHOTO'].includes(input.preferences.media) || input.preferences.count !== undefined && (!Number.isInteger(input.preferences.count) || input.preferences.count < 3 || input.preferences.count > 6))) throw new TypeError('Invalid Composer preferences');
  if (input.previouslyShown !== undefined && (!Array.isArray(input.previouslyShown) || input.previouslyShown.length > 200 || input.previouslyShown.some(value => typeof value !== 'string' || value.length > 512))) throw new TypeError('Invalid proposal history');
  const count = input.preferences?.count ?? 4;
  if (!Number.isInteger(count) || count < 3 || count > 6) throw new TypeError('Proposal count must be between 3 and 6');
}

export function composeDesignProposals(input) {
  validateInput(input);
  const preferences = interpretComposerPreferences(input.preferences);
  const requestedPhotoIds = input.preferences?.photoIds ? new Set(input.preferences.photoIds) : null;
  const photos = [...(input.photos ?? [])].filter(photo => (photo.status === undefined || photo.status === 'READY') && (photo.purpose === undefined || photo.purpose === 'PHOTO') && (!requestedPhotoIds || requestedPhotoIds.has(photo.id))).sort((a, b) => a.id.localeCompare(b.id));
  const ceremonyCount = input.ceremonies.length;
  const countTag = ceremonyCount >= 4 ? '4+' : String(ceremonyCount);
  const excluded = new Set(input.previouslyShown ?? []);
  const eventSnapshot = {
    guest: { name: 'Monsieur et Madame Jean-Baptiste Ilunga Kalumuna et famille' }, table: { name: 'Table 12' },
    event: { title: input.eventTitle ?? 'Événement', coupleNames: input.coupleNames ?? '', invitationText: input.invitationText ?? '', date: input.eventDate ?? '', venue: input.venue ?? '' },
    ceremonies: input.ceremonies, qr: { available: input.hasQr !== false, url: 'https://preview.invalid/invitation' },
    contact: { value: input.contact ?? '' },
  };
  const candidates = [];
  for (const recipe of PROFESSIONAL_RECIPES) {
    // Hard eligibility is settled before any interpretation or scoring can affect selection.
    if (!recipe.supportedEventTypes.includes(input.eventType) || !recipe.supportedCeremonyCounts.includes(countTag) || !recipe.supportedTextDensity.includes(input.textDensity)) continue;
    if (input.hasTable && !recipe.supportsTable || input.hasQr && !recipe.supportsQr || input.hasDressCode && !recipe.supportsDressCode) continue;
    const strategies = recipe.supportedMediaStrategies.filter(strategy => preferences.media === 'ANY' || preferences.media === 'WITH_PHOTO' && strategy !== 'NO_PHOTO' || preferences.media === 'WITHOUT_PHOTO' && strategy === 'NO_PHOTO');
    for (const strategy of strategies) {
      const needed = strategy === 'NO_PHOTO' ? 0 : strategy === 'MULTI_PHOTO' ? 2 : 1;
      if (photos.length < needed) continue;
      const photo = needed ? [...photos].sort((a, b) => photoFit(b, strategy) - photoFit(a, strategy) || a.id.localeCompare(b.id))[hash(`${input.seed}:${recipe.id}:${strategy}`) % Math.min(photos.length, 7)] : undefined;
      const second = strategy === 'MULTI_PHOTO' ? photos.find(item => item.id !== photo.id) : undefined;
      if (needed === 2 && !second) continue;
      const paletteIds = preferences.paletteTags.length ? recipe.paletteIds : recipe.paletteIds;
      for (const paletteId of paletteIds) {
        const photosBySlot = strategy === 'NO_PHOTO' ? {} : strategy === 'BACKGROUND_PHOTO' ? { backgroundPhoto: { ...photo, assetId: photo.id } } : strategy === 'MULTI_PHOTO' ? { mainPhoto: { ...photo, assetId: photo.id }, secondaryPhoto: { ...second, assetId: second.id } } : { mainPhoto: { ...photo, assetId: photo.id } };
        let document;
        let layout;
        try {
          document = createProfessionalTemplate(recipe.id, photosBySlot, {}, { paletteId, mediaStrategy: strategy });
          document.theme.category = themeCategory[input.eventType];
          layout = resolveDesignLayout(document, eventSnapshot, undefined, undefined, { mode: 'print', widthMm: 148, heightMm: 210 });
          if (layout.errors.length) continue;
          const images = layout.elements.filter(layer => layer.visible && layer.type === 'IMAGE');
          if (images.some(layer => assessImageResolution(layer, document.canvas).status === 'ERROR')) continue;
        } catch { continue; }
        const manifest = professionalCompositionManifest(document, input.seed);
        if (excluded.has(manifest.fingerprint)) continue;
        const photoOrientation = photo ? orientation(photo) : 'NONE';
        const scores = {
          compatibilityScore: densityScore(recipe, input.textDensity),
          styleScore: Math.round((styleScore(recipe, preferences) + paletteScore(recipe, paletteId, preferences.paletteTags)) / 2),
          mediaScore: strategy === 'NO_PHOTO' ? 75 : Math.max(35, photoFit(photo, strategy)),
          ceremonyScore: recipe.supportedCeremonyCounts.includes(countTag) ? 100 : 0,
          diversityScore: 100,
          finalScore: 0,
        };
        scores.finalScore = Math.round(scores.compatibilityScore * 0.25 + scores.styleScore * 0.28 + scores.mediaScore * 0.18 + scores.ceremonyScore * 0.19 + 50 * 0.1);
        const selectedIds = Object.values(photosBySlot).filter(Boolean).map(item => item.id);
        document.metadata.composer = { composerVersion: AI_COMPOSER_VERSION, seed: input.seed, recipeId: recipe.id, recipeVersion: 1, eventType: input.eventType, paletteId, mediaStrategy: strategy, variantId: layout.variantId, photoAssetIds: selectedIds, fingerprint: manifest.fingerprint, previouslyShown: [...excluded], interpretedPreferences: { ...preferences, count: input.preferences?.count ?? 4 }, score: scores };
        candidates.push({ document: validateDesignDocumentV2(document), family: recipe.family, strategy, paletteId, recipeId: recipe.id, photoOrientation, fingerprint: manifest.fingerprint, score: scores, reason: reasonFor(recipe, strategy, input.ceremonies, input.textDensity, paletteId, preferences.language) });
      }
    }
  }
  const rng = random(hash(input.seed));
  const selected = [];
  const remaining = [...candidates];
  const wantedCount = preferences.count;
  const diversityFamilyTarget = Math.min(3, wantedCount, new Set(candidates.map(candidate => candidate.family)).size);
  while (selected.length < wantedCount && remaining.length) {
    const chosenFamilies = new Set(selected.map(candidate => candidate.family));
    const newFamilyCandidates = remaining.filter(candidate => !chosenFamilies.has(candidate.family));
    const scoringPool = chosenFamilies.size < diversityFamilyTarget && newFamilyCandidates.length ? newFamilyCandidates : remaining;
    for (const candidate of scoringPool) {
      const penalty = selected.reduce((sum, prior) => sum + similarities(candidate, prior), 0);
      candidate.score.diversityScore = Math.max(0, 100 - Math.min(100, penalty));
      candidate.score.finalScore = Math.round(candidate.score.compatibilityScore * 0.22 + candidate.score.styleScore * 0.25 + candidate.score.mediaScore * 0.16 + candidate.score.ceremonyScore * 0.17 + candidate.score.diversityScore * 0.2);
      candidate.weight = Math.max(1, candidate.score.finalScore) ** 3;
    }
    const total = scoringPool.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = rng() * total;
    let candidateIndex = scoringPool.findIndex(candidate => (roll -= candidate.weight) <= 0);
    if (candidateIndex < 0) candidateIndex = scoringPool.length - 1;
    const candidate = scoringPool[candidateIndex];
    remaining.splice(remaining.indexOf(candidate), 1);
    candidate.document.metadata.composer.score = candidate.score;
    selected.push(candidate);
  }
  return {
    items: selected.map(({ document, recipeId, reason, score, fingerprint }) => ({ document, recipeId, reason, score, fingerprint })),
    seed: input.seed, composerVersion: AI_COMPOSER_VERSION, eligibleRecipes: [...new Set(candidates.map(candidate => candidate.recipeId))],
  };
}
