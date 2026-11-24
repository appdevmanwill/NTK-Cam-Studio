import { useCallback, useEffect, useState } from 'react';
import type { ResolvedTheme, ThemePreference } from '../types/studio';
import {
  DEFAULT_THEME_PREFERENCE,
  getThemeMetaColor,
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from '../utils/theme';

function readSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return DEFAULT_THEME_PREFERENCE;
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

function applyResolvedThemeToDom(resolved: ResolvedTheme, preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = getThemeMetaColor(resolved);
  }

  if (typeof window !== 'undefined') {
    window.ntkDesktop?.setTheme?.(preference, resolved);
    window.NTKAndroidBridge?.setTheme?.(resolved);
  }
}

export interface UseThemeResult {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  systemPrefersDark: boolean;
  setPreference: (next: ThemePreference) => void;
}

/**
 * Manages NTK Cam Studio's Light / Dark / System (PC & Mobile default) theme.
 * Defaults to 'system' and reacts live whenever the device OS theme changes.
 */
export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredPreference());
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => readSystemPrefersDark());

  const resolvedTheme = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    applyResolvedThemeToDom(resolvedTheme, preference);
  }, [resolvedTheme, preference]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    setSystemPrefersDark(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === DEFAULT_THEME_PREFERENCE) {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Ignore private browsing storage restrictions
    }
  }, []);

  return {
    preference,
    resolvedTheme,
    systemPrefersDark,
    setPreference,
  };
}
