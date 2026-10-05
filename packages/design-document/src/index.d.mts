export type OverflowPolicy = 'ERROR' | 'SHRINK_WITH_LIMIT' | 'USE_VARIANT' | 'AI_ASSIST_ALLOWED';
export type Ceremony = { name?: string | null; date?: string | null; time?: string | null; venue?: string | null; address?: string | null; reference?: string | null; dressCode?: string | null };
export type RenderSnapshot = {
  guest?: { name?: string | null; email?: string | null };
  table?: { name?: string | null };
  event?: { title?: string | null; coupleNames?: string | null; invitationText?: string | null; date?: string | null; venue?: string | null };
  ceremonies?: Ceremony[];
  contact?: { value?: string | null };
  qr?: { available?: boolean; url?: string | null };
  variables?: Record<string, string | null | undefined>;
};
export type DesignDocument = Record<string, any> & { schemaVersion: 1 | 2; canvas: { width: number; height: number; unit: 'px' }; elements: Array<Record<string, any>> };
export type ResolveIssue = { code: string; elementId?: string; message: string; assistanceEligible?: boolean };
export type ResolvedLayout = {
  schemaVersion: 1 | 2;
  variantId: string;
  canvas: { width: number; height: number; unit: 'px' };
  safeArea: { top: number; right: number; bottom: number; left: number };
  bleed: { top: number; right: number; bottom: number; left: number };
  elements: Array<Record<string, any> & { visible: boolean; resolvedText?: string; resolvedFont?: FontDefinition }>;
  groups: Array<{ id: string; layoutSlot: string; items: Array<{ index: number; ceremony: Ceremony; bounds: Bounds }> }>;
  warnings: ResolveIssue[];
  errors: ResolveIssue[];
};
export type Bounds = { x: number; y: number; width: number; height: number };
export type FontDefinition = { fontId: string; family: string; fallback: string; weights: number[]; styles: string[] };
export const ALLOWED_BINDINGS: ReadonlySet<string>;
export const FONT_REGISTRY: Readonly<Record<string, FontDefinition>>;
export function isAllowedBinding(binding: unknown): binding is string;
export function normalizeDesignDocumentV2(document: unknown): DesignDocument;
export function validateDesignDocumentV2(document: unknown): DesignDocument;
export type ImageRole = 'BACKGROUND' | 'FOREGROUND' | 'DECORATION' | 'TEXTURE' | 'PHOTO';
export function readPrivateImageDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number };
export type ImageOverlay = { type: 'solid'; color: string; opacity: number } | { type: 'linear-gradient'; angle: number; opacity: number; stops: Array<{ offset: number; color: string }> };
export type RenderTarget = { mode: 'web' | 'print'; widthMm?: number; heightMm?: number };
export const IMAGE_ROLES: readonly ImageRole[];
export const MASK_REGISTRY: Readonly<Record<string, Readonly<{ id: string; version: number; kind: string; path?: string }>>>;
export function assessImageResolution(layer: Record<string, any>, canvas: { width: number; height: number }, target?: RenderTarget): { status: 'OK' | 'WARNING' | 'ERROR'; effectiveDpi: number | null; target: string; code?: string };
export function renderVisualImageSvg(layer: Record<string, any>, href: string, options?: { rotation?: boolean }): string;
export function renderOverlaySvg(overlay: ImageOverlay, layer: Record<string, any>, prefix: string): string;
export function resolveDesignLayout(document: unknown, snapshot: RenderSnapshot, selectedVariantId?: string, assets?: Record<string, string>, target?: RenderTarget): ResolvedLayout;
export function logicalCanvasTransform(canvas: { width: number; height: number }, viewport: { width: number; height: number }): { scale: number; offsetX: number; offsetY: number };
export function imageRenderBounds(layer: Record<string, any>): Bounds;
export function renderResolvedLayoutSvg(layout: ResolvedLayout, options?: { assets?: Record<string, string>; qrHref?: string; fragment?: boolean }): string;
export function fitInvitationText(layer: Record<string, any>, text: string): { fontSize: number; lines: string[]; lineHeight: number; reduced: boolean; overflow: boolean };
export function scaleLogicalBounds(bounds: Bounds, canvas: { width: number; height: number }, viewport: { width: number; height: number }): Bounds;
export const PROFESSIONAL_TEMPLATE_IDS: readonly string[];
export function createProfessionalTemplate(id: string, photos?: Record<string, { assetId: string; width: number; height: number }>, privateAssets?: Record<string, { assetId: string; width: number; height: number }>): DesignDocument;
export function fillProfessionalPhotoSlot(document: unknown, slotId: string, photo: { assetId: string; width: number; height: number }): DesignDocument;
export function assertProfessionalPersonalization(previous: unknown, candidate: unknown): void;

export const PROFESSIONAL_RECIPES: readonly { id: string; family: string; mediaStrategy: string; supportedMediaStrategies: readonly string[]; photoRequired: boolean; photoOrientation?: string; supportedEventTypes: readonly string[]; supportedCeremonyCounts: readonly string[]; supportedTextDensity: readonly string[]; supportsTable: boolean; supportsQr: boolean; supportsDressCode: boolean; styleTags: readonly string[]; moodTags: readonly string[]; paletteTags: readonly string[]; paletteIds: readonly string[] }[];
export function compatibleProfessionalRecipes(media?: { hasPhotos?: boolean; photoCount?: number; photoOrientation?: string }): typeof PROFESSIONAL_RECIPES;

export interface ProfessionalComposition {
  family: string; layoutRecipe: string; mediaStrategy: string; photoRequired: boolean;
  photoComposition: string; ceremonyLayout: string; guestHeaderLayout: string; tableLayout: string;
  palette: string[]; paletteId: string; fontSet: string[]; maskSet: string[]; decorationSet: string[]; backgroundTreatment: string;
}
export const PROFESSIONAL_GRAMMAR_FIELDS: readonly (keyof ProfessionalComposition)[];
export function validateProfessionalComposition(configuration: unknown): ProfessionalComposition;
export function professionalCompositionFingerprint(configuration: unknown): string;
export function professionalCompositionManifest(document: unknown, seed: string): {
  grammarVersion: number; recipeRelease: number; designVersion: number; seed: string;
  composition: ProfessionalComposition; fingerprint: string;
};
export type ComposerEventType = 'WEDDING' | 'DOT' | 'BIRTHDAY' | 'ANNIVERSARY' | 'GRADUATION' | 'CORPORATE' | 'RELIGIOUS' | 'FUNERAL_OR_MEMORIAL' | 'BABY_SHOWER' | 'CONFERENCE' | 'GALA' | 'CUSTOM' | 'BAPTISM' | 'DINNER' | 'CEREMONY' | 'OTHER';
export type ComposerPhoto = { id: string; width: number; height: number; purpose?: string; status?: string };
export type ComposerPreferences = { style?: string; mood?: string; colors?: string[]; description?: string; media?: 'ANY' | 'WITH_PHOTO' | 'WITHOUT_PHOTO'; count?: number; photoIds?: string[] };
export function interpretComposerPreferences(preferences?: ComposerPreferences): { styleTags: string[]; moodTags: string[]; paletteTags: string[]; media: string; language: string; photoIds?: string[] };
export function composeDesignProposals(input: { eventType: ComposerEventType; ceremonyTypes?: string[]; ceremonies: Ceremony[]; textDensity: 'LOW' | 'MEDIUM' | 'HIGH'; hasTable?: boolean; hasQr?: boolean; hasDressCode?: boolean; photos?: ComposerPhoto[]; preferences?: ComposerPreferences; seed: string; previouslyShown?: string[] }): { items: Array<{ document: DesignDocument; recipeId: string; reason: string; score: { compatibilityScore: number; styleScore: number; mediaScore: number; ceremonyScore: number; diversityScore: number; finalScore: number }; fingerprint: string }>; seed: string; composerVersion: string; eligibleRecipes: string[] };

export const EDITORIAL_BINDINGS: readonly string[];
export function editorialField(document: any, elementId: string): Record<string, any>;
export function editorialTarget(layer: Record<string, any>, text: string, level?: string): { overflow: boolean; maxCharacters: number; maxEstimatedLines: number; targetReductionRatio: number; layoutCapacity: number };
export function protectedEditorialTerms(text: string, supplied?: string[]): string[];
export function redactEditorial(text: string, terms: string[]): { text: string; fragments: { token: string; term: string; count: number }[]; order: string[] };
export function restoreEditorial(text: string, fragments: { token: string; term: string; count: number }[], expectedOrder: string[]): string;
export function validateEditorialProposal(source: string, proposal: string, terms: string[], target: { maxCharacters: number }): string;
export function applyEditorialSelection(document: any, elementId: string, text: string, provenance: Record<string, unknown>): DesignDocument;
