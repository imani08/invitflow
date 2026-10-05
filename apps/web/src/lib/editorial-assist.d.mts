type EditorialJob = { id: string; baseVersion: number; status: string; editorial?: { fits: boolean; proposedText: string } | null };
type SelectionContext = { dirty: boolean; currentVersion: number; manualText?: string | null; elementId?: string; sourceText?: string };
export function canApplyEditorial(job: EditorialJob | null, context: SelectionContext): boolean;
export function editorialSelectionRequest(job: EditorialJob | null, context: SelectionContext): Record<string, unknown>;
