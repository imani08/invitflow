const transitions: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  DRAFT: new Set(['PUBLISHED', 'CANCELLED', 'COMPLETED']),
  PUBLISHED: new Set(['CANCELLED', 'COMPLETED']),
  CANCELLED: new Set<string>(),
  COMPLETED: new Set(['ARCHIVED']),
  ARCHIVED: new Set(['COMPLETED']),
});

/** Lifecycle policy deliberately excludes invitation generation and downloads. */
export function canEventTransition(from: string, to: string) {
  return transitions[from]?.has(to) === true;
}

export function eventLifecycleAction(from: string, action: 'complete' | 'archive' | 'restore') {
  const to = ({ complete: 'COMPLETED', archive: 'ARCHIVED', restore: 'COMPLETED' })[action];
  return canEventTransition(from, to) ? to : null;
}
