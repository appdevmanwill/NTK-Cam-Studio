import React, { useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import type { ResolvedTheme, ThemePreference } from '../types/studio';
import { getThemeDisplayLabel } from '../utils/theme';

interface ThemeSwitcherProps {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  systemPrefersDark: boolean;
  onChangePreference: (next: ThemePreference) => void;
}

const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  shortLabel: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'system',
    label: 'System (PC / Mobile)',
    shortLabel: 'Auto',
    desc: 'Matches device theme',
    icon: Monitor,
  },
  {
    id: 'light',
    label: 'Light',
    shortLabel: 'Light',
    desc: 'Bright studio workspace',
    icon: Sun,
  },
  {
    id: 'dark',
    label: 'Dark',
    shortLabel: 'Dark',
    desc: 'Low-glare dark studio',
    icon: Moon,
  },
];

/**
 * Compact header theme switcher button with a clean 3-option popover menu (System, Light, Dark).
 * Defaults to PC/mobile OS theme and fits cleanly on both 390px phones and desktop bars.
 */
export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  preference,
  resolvedTheme,
  systemPrefersDark,
  onChangePreference,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const ActiveIcon = preference === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;
  const displayLabel = getThemeDisplayLabel(preference, resolvedTheme);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Change theme (currently ${displayLabel})`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Theme: ${displayLabel}`}
        data-testid="theme-switcher-button"
        className="h-9 px-2.5 sm:px-3 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-[#171A22] dark:hover:bg-[#1F232E] border border-slate-200 dark:border-[#272B35] text-xs font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
      >
        <ActiveIcon
          className={`w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 ${
            preference === 'light'
              ? 'text-amber-500'
              : preference === 'dark'
                ? 'text-blue-400'
                : 'text-blue-600 dark:text-blue-400'
          }`}
        />
        <span className="hidden md:inline">
          {preference === 'system' ? 'Auto' : preference === 'dark' ? 'Dark' : 'Light'}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme options"
          data-testid="theme-switcher-menu"
          className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A303E] shadow-xl p-1.5 z-50"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Appearance
          </div>
          {THEME_OPTIONS.map(({ id, label, desc, icon: Icon }) => {
            const active = preference === id;
            const subtitle =
              id === 'system'
                ? `Matches PC / Mobile (${systemPrefersDark ? 'Dark' : 'Light'})`
                : desc;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChangePreference(id);
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center justify-between gap-2 transition-colors ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-100'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{label}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {subtitle}
                    </div>
                  </div>
                </div>
                {active && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface ThemeSegmentedControlProps {
  preference: ThemePreference;
  systemPrefersDark: boolean;
  onChangePreference: (next: ThemePreference) => void;
}

/**
 * 3-way segmented theme picker for mobile bottom sheets & settings sections.
 */
export const ThemeSegmentedControl: React.FC<ThemeSegmentedControlProps> = ({
  preference,
  systemPrefersDark,
  onChangePreference,
}) => {
  return (
    <div
      role="group"
      aria-label="App theme"
      className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#161922] border border-slate-200 dark:border-[#272C38]"
    >
      {THEME_OPTIONS.map(({ id, shortLabel, icon: Icon }) => {
        const active = preference === id;
        const ariaText =
          id === 'system'
            ? `System theme (${systemPrefersDark ? 'Dark' : 'Light'})`
            : `${shortLabel} theme`;
        return (
          <button
            key={id}
            type="button"
            aria-label={ariaText}
            aria-pressed={active}
            onClick={() => onChangePreference(id)}
            className={`min-h-[42px] px-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              active
                ? 'bg-white dark:bg-[#282D3A] text-slate-900 dark:text-white shadow-sm border border-slate-200/80 dark:border-transparent'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
};
