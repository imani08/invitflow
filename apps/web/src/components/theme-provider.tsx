'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { resolveInitialTheme } from './resolve-theme.mjs';

type Theme = 'light' | 'dark';
type ThemeContextValue = { theme: Theme; toggleTheme: () => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem('invitaflow-theme'); } catch { /* Storage may be disabled by the browser. */ }
    const initial: Theme = resolveInitialTheme(stored);
    setTheme(initial);
    document.documentElement.dataset['theme'] = initial;
    document.documentElement.classList.toggle('dark', initial === 'dark');
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'invitaflow-theme' || (event.newValue !== 'light' && event.newValue !== 'dark')) return;
      setTheme(event.newValue);
      document.documentElement.dataset['theme'] = event.newValue;
      document.documentElement.classList.toggle('dark', event.newValue === 'dark');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset['theme'] = next;
      document.documentElement.classList.toggle('dark', next === 'dark');
      try { window.localStorage.setItem('invitaflow-theme', next); } catch { /* Keep the current-tab preference when storage is unavailable. */ }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
