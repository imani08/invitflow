'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { journeyDestination } from '@/lib/journey-draft-policy.mjs';
import { createDraftSaveQueue } from '@/lib/draft-save-queue.mjs';
import JourneyCredits from './journey-credits';
type Context = { loaded: boolean; read(key: string): unknown; write(key: string, value: unknown): void; flush(): Promise<void> };
const DraftContext = createContext<Context | null>(null);
export function useJourneyDraft<T>(key: string, value: T, restore: (value: T) => void, ready = true) {
  const context = useContext(DraftContext), restored = useRef(false), restoreRef = useRef(restore), valueRef = useRef(value);
  restoreRef.current = restore; valueRef.current = value;
  useEffect(() => {
    if (!context?.loaded || !ready || restored.current) return;
    restored.current = true;
    const saved = context.read(key);
    if (saved !== undefined) restoreRef.current(saved as T);
    else context.write(key, valueRef.current);
    // Restoration is a separate effect cycle: never save stale initial props over it.
  }, [context, key, ready]);
  const previous = useRef(JSON.stringify(value));
  useEffect(() => {
    const serialized = JSON.stringify(value);
    if (context?.loaded && ready && restored.current && serialized !== previous.current) context.write(key, value);
    previous.current = serialized;
  }, [context, key, value, ready]);
  return { ready: !!context?.loaded && ready && restored.current, flush: context?.flush ?? (async () => undefined),
    save: async (next: T) => { if (context) { context.write(key, next); await context.flush(); } },
    clearForm: async (formKey: string) => { if (context) { context.write('form:' + formKey, null); await context.flush(); } } };
}
export function JourneyDrafts({ children }: { children: ReactNode }) {
  const pathname = usePathname(), params = useSearchParams();
  const destination = journeyDestination(pathname + (params.get('event') ? `?event=${encodeURIComponent(params.get('event')!)}` : ''));
  return <DraftPage key={destination?.scope ?? pathname} path={destination?.scope ?? '/events'}>{children}</DraftPage>;
}
function DraftPage({ path, children }: { path: string; children: ReactNode }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false), [status, setStatus] = useState('loading'), [error, setError] = useState('');
  const data = useRef<Record<string, unknown>>({}), root = useRef<HTMLDivElement>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useMemo(() => createDraftSaveQueue({
    onStatus: (next, message) => { setStatus(next); setError(message ?? ''); },
    save: async (revision, next) => {
      const response = await fetch(`/api/journey-draft?path=${encodeURIComponent(path)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision, data: next }), cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Enregistrement impossible.');
      return result;
    },
  }), [path]);
  const load = useCallback(async () => {
    try {
      setStatus('loading');
      const response = await fetch(`/api/journey-draft?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Chargement impossible.');
      data.current = result.data; queue.initialize(result); setLoaded(true); setStatus(result.savedAt ? 'saved' : 'empty'); setError('');
      data.current = { ...data.current, progress: path }; queue.change(data.current);
      timer.current = setTimeout(() => { void queue.flush().catch(() => undefined); }, 650);
    } catch (failure) { setStatus('error'); setError(failure instanceof Error ? failure.message : 'Chargement impossible.'); }
  }, [path, queue]);
  useEffect(() => { void load(); return () => clearTimeout(timer.current); }, [load]);
  const write = useCallback((key: string, value: unknown) => {
    data.current = { ...data.current, [key]: value }; queue.change(data.current);
    clearTimeout(timer.current); timer.current = setTimeout(() => { void queue.flush().catch(() => undefined); }, 650);
  }, [queue]);
  const context = useMemo<Context>(() => ({ loaded, read: key => data.current[key], write, flush: () => queue.flush() }), [loaded, write, queue]);
  const beforeLeave = async () => {
    if (root.current?.querySelector('[data-pending-import="true"]') || Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[type=file]') ?? []).some(input => input.files?.length)) throw new Error('Terminez l’import ou retirez le fichier sélectionné avant de quitter.');
    await queue.flush();
  };
  useEffect(() => {
    if (!loaded) return;
    const restored = new WeakSet<HTMLFormElement>();
    const forms = () => {
      root.current?.querySelectorAll<HTMLFormElement>('form[data-draft-key]').forEach(form => {
        if (restored.has(form) || form.dataset['draftReady'] === 'false') return; restored.add(form);
        const saved = data.current[`form:${form.dataset['draftKey']}`] as Record<string, string | boolean> | undefined;
        if (!saved) return;
        for (const element of Array.from(form.elements)) {
          if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.name || element.type === 'file' || element.type === 'password') continue;
          const checkedInput = element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type);
          const value = saved[checkedInput ? element.name + '::' + element.value : element.name];
          if (value === undefined) continue;
          if (checkedInput) Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set?.call(element, value === true);
          else {
            const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, String(value));
          }
          element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    };
    const input = (event: Event) => {
      const form = event.target instanceof Element ? event.target.closest<HTMLFormElement>('form[data-draft-key]') : null;
      if (!form) return;
      const values: Record<string, string | boolean> = {};
      for (const element of Array.from(form.elements)) {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.name || ['file', 'password', 'submit', 'button'].includes(element.type)) continue;
        const checkedInput = element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type);
        values[checkedInput ? element.name + '::' + element.value : element.name] = checkedInput ? element.checked : element.value;
      }
      write(`form:${form.dataset['draftKey']}`, values);
    };
    const reset = (event: Event) => { const form = event.target; if (form instanceof HTMLFormElement && form.dataset['draftKey']) write(`form:${form.dataset['draftKey']}`, null); };
    forms(); const observer = new MutationObserver(forms); if (root.current) observer.observe(root.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-draft-ready'] });
    document.addEventListener('input', input); document.addEventListener('change', input); document.addEventListener('reset', reset);
    return () => { observer.disconnect(); document.removeEventListener('input', input); document.removeEventListener('change', input); document.removeEventListener('reset', reset); };
  }, [loaded, write]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (queue.dirty()) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === location.pathname && url.search === location.search) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (root.current?.querySelector('[data-pending-import="true"]') || Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[type=file]') ?? []).some(input => input.files?.length)) {
        setError('Terminez l’import ou retirez le fichier sélectionné avant de quitter. Un fichier local ne peut pas être restauré.'); setStatus('error'); return;
      }
      void queue.flush().then(() => router.push(url.pathname + url.search + url.hash)).catch(() => undefined);
    };
    window.addEventListener('beforeunload', leave); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', leave); document.removeEventListener('click', navigate, true); };
  }, [queue, router]);
  return <DraftContext.Provider value={context}><div className="journey-draft-status" role="status" aria-live="polite">
    {status === 'loading' ? 'Chargement du brouillon…' : status === 'saving' || status === 'pending' ? 'Enregistrement…' : status === 'saved' ? 'Enregistré' : status === 'error' ? error : 'Brouillon prêt · sauvegarde automatique'}
    {status === 'error' && <><button type="button" onClick={() => void (loaded ? queue.flush() : load()).catch(() => undefined)}>Réessayer</button>{loaded && <button type="button" onClick={() => { if (window.confirm('Abandonner les modifications locales et recharger le brouillon enregistré sur le serveur ?')) location.reload(); }}>Recharger la version serveur</button>}</>}
  </div><JourneyCredits beforeLeave={beforeLeave} /><div ref={root}><fieldset className="journey-draft-fields" disabled={!loaded}>{children}</fieldset></div></DraftContext.Provider>;
}
