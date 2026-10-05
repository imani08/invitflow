export function canApplyEditorial(job, { dirty, currentVersion, manualText = null }) {
  if (dirty || (job && job.baseVersion !== currentVersion)) return false;
  if (manualText !== null) return typeof manualText === 'string' && !!manualText.trim();
  return job?.status === 'PROPOSED' && job.editorial?.fits === true && typeof job.editorial.proposedText === 'string';
}
export function editorialSelectionRequest(job, context) {
  if (!canApplyEditorial(job, context)) throw new Error('Proposition absente, obsolète ou invalide.');
  return context.manualText !== null && context.manualText !== undefined
    ? { editorialText: context.manualText, elementId: context.elementId, sourceText: context.sourceText, expectedVersion: context.currentVersion }
    : { editorialJobId: job.id, expectedVersion: context.currentVersion };
}
