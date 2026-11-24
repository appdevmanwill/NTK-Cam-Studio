import React, { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  items: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Slides & Navigation',
    items: [
      { keys: ['←'], description: 'Previous slide' },
      { keys: ['→'], description: 'Next slide' },
    ],
  },
  {
    title: 'Stage Layouts',
    items: [
      { keys: ['1'], description: 'Picture-in-Picture (Slides + Bubble)' },
      { keys: ['2'], description: 'Side-by-Side Split View' },
      { keys: ['3'], description: 'Screen / Slides Only' },
      { keys: ['4'], description: 'Camera Only' },
    ],
  },
  {
    title: 'Live Annotation Tools',
    items: [
      { keys: ['V'], description: 'Select & drag stage elements' },
      { keys: ['P'], description: 'Pen tool' },
      { keys: ['H'], description: 'Highlighter tool' },
      { keys: ['A'], description: 'Arrow callout tool' },
      { keys: ['L'], description: 'Laser pointer' },
      { keys: ['Ctrl / ⌘', 'Z'], description: 'Undo last drawn stroke' },
    ],
  },
  {
    title: 'Studio & Panels',
    items: [
      { keys: ['?'], description: 'Open or close Keyboard Shortcuts' },
      { keys: ['Esc'], description: 'Close modal or return to Select tool' },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
      className="fixed inset-0 z-50 bg-slate-950/65 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        data-testid="keyboard-shortcuts-modal"
        className="w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#12151D] border border-slate-200 dark:border-[#272C38] shadow-2xl overflow-hidden flex flex-col max-h-[88dvh] pb-safe sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#222632] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-500/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="keyboard-shortcuts-title"
                className="text-sm font-semibold text-slate-900 dark:text-white"
              >
                Keyboard Shortcuts
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Press <kbd className="font-mono font-semibold text-slate-700 dark:text-slate-200">?</kbd> anytime to toggle this cheat sheet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="w-9 h-9 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcut Groups Grid */}
        <div className="p-5 overflow-y-auto studio-scroll grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SHORTCUT_GROUPS.map((group) => (
            <section
              key={group.title}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#171A23] border border-slate-200 dark:border-[#252A36] space-y-2.5"
            >
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {group.title}
              </h3>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li
                    key={item.description}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-slate-700 dark:text-slate-200 leading-snug">
                      {item.description}
                    </span>
                    <span className="inline-flex items-center gap-1 shrink-0">
                      {item.keys.map((keyLabel, idx) => (
                        <React.Fragment key={keyLabel}>
                          {idx > 0 && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">+</span>
                          )}
                          <kbd className="min-w-[24px] h-6 px-1.5 rounded-md bg-white dark:bg-[#101217] border border-slate-300 dark:border-[#323847] shadow-[0_1px_0_rgba(15,23,42,0.08)] dark:shadow-[0_1px_0_rgba(0,0,0,0.5)] text-[11px] font-mono font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center">
                            {keyLabel}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-[#222632] bg-slate-50 dark:bg-[#0F1117] flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Shortcuts pause automatically while typing in text fields.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
