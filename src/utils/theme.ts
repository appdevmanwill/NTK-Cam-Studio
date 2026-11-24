import type { ResolvedTheme, ThemePreference } from '../types/studio';

export const THEME_STORAGE_KEY = 'ntk-cam-studio-theme';
export const STUDIO_PREFS_STORAGE_KEY = 'ntk-cam-studio-prefs-v1';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export interface PersistedStudioPrefs {
  lowerThirdName?: string;
  lowerThirdTitle?: string;
  lowerThirdStyle?: 'minimal' | 'broadcast' | 'glass';
  lowerThirdAccent?: string;
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkSize?: number;
  teleprompterScript?: string;
  teleprompterFontSize?: number;
  teleprompterScrollSpeed?: number;
}

/**
 * Safely normalizes any stored value into a valid ThemePreference,
 * defaulting to 'system' (PC/mobile OS theme).
 */
export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  return DEFAULT_THEME_PREFERENCE;
}

/**
 * Resolves the concrete light/dark palette from user preference + OS preference.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Cycles theme preference deterministically: system -> light -> dark -> system.
 */
export function getNextThemePreference(current: ThemePreference): ThemePreference {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

/**
 * Returns the browser status-bar theme-color hex for mobile PWAs & browsers.
 */
export function getThemeMetaColor(resolved: ResolvedTheme): string {
  return resolved === 'dark' ? '#0B0C0F' : '#FFFFFF';
}

/**
 * Human-readable label for the current theme mode.
 */
export function getThemeDisplayLabel(
  preference: ThemePreference,
  resolved: ResolvedTheme
): string {
  if (preference === 'system') {
    return `Auto (${resolved === 'dark' ? 'Dark' : 'Light'})`;
  }
  return preference === 'dark' ? 'Dark' : 'Light';
}

/**
 * Parses persisted studio preferences defensively from JSON.
 */
export function parseStudioPrefs(raw: string | null | undefined): PersistedStudioPrefs {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    const out: PersistedStudioPrefs = {};
    if (typeof parsed.lowerThirdName === 'string') out.lowerThirdName = parsed.lowerThirdName;
    if (typeof parsed.lowerThirdTitle === 'string') out.lowerThirdTitle = parsed.lowerThirdTitle;
    if (
      parsed.lowerThirdStyle === 'minimal' ||
      parsed.lowerThirdStyle === 'broadcast' ||
      parsed.lowerThirdStyle === 'glass'
    ) {
      out.lowerThirdStyle = parsed.lowerThirdStyle;
    }
    if (typeof parsed.lowerThirdAccent === 'string') out.lowerThirdAccent = parsed.lowerThirdAccent;
    if (typeof parsed.watermarkText === 'string') out.watermarkText = parsed.watermarkText;
    if (
      typeof parsed.watermarkOpacity === 'number' &&
      Number.isFinite(parsed.watermarkOpacity)
    ) {
      out.watermarkOpacity = Math.max(0.2, Math.min(1, parsed.watermarkOpacity));
    }
    if (typeof parsed.watermarkSize === 'number' && Number.isFinite(parsed.watermarkSize)) {
      out.watermarkSize = Math.max(0.6, Math.min(2, parsed.watermarkSize));
    }
    if (typeof parsed.teleprompterScript === 'string') {
      out.teleprompterScript = parsed.teleprompterScript;
    }
    if (
      typeof parsed.teleprompterFontSize === 'number' &&
      Number.isFinite(parsed.teleprompterFontSize)
    ) {
      out.teleprompterFontSize = Math.max(14, Math.min(40, Math.round(parsed.teleprompterFontSize)));
    }
    if (
      typeof parsed.teleprompterScrollSpeed === 'number' &&
      Number.isFinite(parsed.teleprompterScrollSpeed)
    ) {
      out.teleprompterScrollSpeed = Math.max(
        10,
        Math.min(110, Math.round(parsed.teleprompterScrollSpeed))
      );
    }
    return out;
  } catch {
    return {};
  }
}

export function loadStudioPrefs(): PersistedStudioPrefs {
  if (typeof window === 'undefined') return {};
  try {
    return parseStudioPrefs(window.localStorage.getItem(STUDIO_PREFS_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveStudioPrefs(prefs: PersistedStudioPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STUDIO_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota / private-browsing errors cleanly
  }
}
