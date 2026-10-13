/** One in-flight save per page; coalesces edits and never acknowledges newer unsaved data. */
export function createDraftSaveQueue({ save, onStatus }) {
  let revision = 0, current = {}, saved = '{}', pending = null, loaded = false;
  return {
    initialize(record) { revision = record.revision; current = record.data; saved = JSON.stringify(current); loaded = true; },
    change(data) { current = data; onStatus(JSON.stringify(current) === saved ? 'saved' : 'pending'); },
    dirty() { return JSON.stringify(current) !== saved; },
    async flush() {
      if (!loaded) throw new Error('Le brouillon doit être chargé avant son enregistrement.');
      if (pending) { await pending; return this.flush(); }
      if (!this.dirty()) return;
      const snapshot = JSON.stringify(current);
      onStatus('saving');
      pending = (async () => {
        try {
          const next = await save(revision, JSON.parse(snapshot));
          revision = next.revision; saved = snapshot;
          onStatus(JSON.stringify(current) === saved ? 'saved' : 'pending');
        } catch (error) { onStatus('error', error instanceof Error ? error.message : 'Enregistrement impossible.'); throw error; }
        finally { pending = null; }
      })();
      await pending;
      if (this.dirty()) await this.flush();
    },
  };
}
