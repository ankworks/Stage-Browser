import React from 'react';
import { searchTabs, scoreText } from '../../shared/study';
import { hostOf } from '../../shared/url';
import type { HistoryEntry, TabState } from '../../shared/types';
import { tabLabel } from '../../shared/types';
import { actions } from '../state/actions';
import { useSel } from '../state/store';
import { Icon } from './Icons';

type Row =
  | { kind: 'tab'; id: string; label: string; sub?: string; tab: TabState }
  | { kind: 'history'; id: string; label: string; sub: string; entry: HistoryEntry }
  | { kind: 'command'; id: string; label: string; sub?: string; icon: React.ReactNode; shortcut?: string; run: () => void };

const commands = (): Row[] => [
  {
    kind: 'command',
    id: 'new-tab',
    label: 'New tab',
    shortcut: 'Ctrl T',
    icon: <Icon.plus size={16} />,
    run: () => void actions.newTab(),
  },
  {
    kind: 'command',
    id: 'reader',
    label: 'Open reader view',
    sub: 'Strip the page to its article',
    shortcut: 'Ctrl Alt R',
    icon: <Icon.reader size={16} />,
    run: () => void actions.openReader(),
  },
  {
    kind: 'command',
    id: 'find',
    label: 'Find in page',
    shortcut: 'Ctrl F',
    icon: <Icon.search size={16} />,
    run: () => actions.openFind(),
  },
  {
    kind: 'command',
    id: 'reading',
    label: 'Reading list',
    shortcut: 'Ctrl Shift D',
    icon: <Icon.book size={16} />,
    run: () => actions.openStudyPanel('reading'),
  },
  {
    kind: 'command',
    id: 'downloads',
    label: 'Downloads',
    shortcut: 'Ctrl J',
    icon: <Icon.download size={16} />,
    run: () => actions.openStudyPanel('downloads'),
  },
  {
    kind: 'command',
    id: 'extensions',
    label: 'Extensions',
    shortcut: 'Ctrl Shift E',
    icon: <Icon.puzzle size={16} />,
    run: () => actions.openStudyPanel('extensions'),
  },
  {
    kind: 'command',
    id: 'favorites',
    label: 'Favorites',
    sub: 'Open the saved pages library',
    icon: <Icon.star size={16} />,
    run: () => actions.openInternal('favorites'),
  },
  {
    kind: 'command',
    id: 'history',
    label: 'History',
    shortcut: 'Ctrl H',
    icon: <Icon.history size={16} />,
    run: () => actions.openInternal('history'),
  },
  {
    kind: 'command',
    id: 'pdf',
    label: 'Save page as PDF',
    shortcut: 'Ctrl P',
    icon: <Icon.print size={16} />,
    run: () => void actions.printPdf(),
  },
  {
    kind: 'command',
    id: 'shot',
    label: 'Capture screenshot',
    shortcut: 'Ctrl Shift S',
    icon: <Icon.shot size={16} />,
    run: () => void actions.screenshot(true),
  },
  {
    kind: 'command',
    id: 'theme',
    label: 'Toggle light / dark',
    icon: <Icon.moon size={16} />,
    run: () => actions.toggleTheme(),
  },
  {
    kind: 'command',
    id: 'settings',
    label: 'Settings',
    icon: <Icon.settings size={16} />,
    run: () => actions.openSettings(),
  },
  {
    kind: 'command',
    id: 'about',
    label: 'About Stage Browser',
    icon: <Icon.home size={16} />,
    run: () => actions.openInternal('about'),
  },
];

export const CommandPalette: React.FC = () => {
  const open = useSel((s) => s.paletteOpen);
  const tabs = useSel((s) => s.tabs);
  const history = useSel((s) => s.history);
  const activeId = useSel((s) => s.activeTabId);
  const [query, setQuery] = React.useState('');
  const [cursor, setCursor] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const rows = React.useMemo<Row[]>(() => {
    const q = query.trim();
    const tabRows: Row[] = searchTabs(tabs, q, q ? 5 : 6).map((hit) => {
      const tab = tabs.find((t) => t.id === hit.id) as TabState;
      return {
        kind: 'tab',
        id: hit.id,
        label: hit.label,
        sub: hit.url ? hostOf(hit.url) : 'Internal page',
        tab,
      };
    });

    const cmdRows: Row[] = commands().filter((row) => {
      if (!q) return true;
      return !!scoreText(row.label, q) || !!scoreText(row.sub ?? '', q);
    });

    const histRows: Row[] = q
      ? history
          .filter((entry) => scoreText(entry.title, q) || scoreText(entry.url, q))
          .slice(0, 4)
          .map((entry) => ({ kind: 'history', id: entry.id, label: entry.title, sub: hostOf(entry.url) || entry.url, entry }))
      : [];

    return [...tabRows, ...cmdRows.slice(0, q ? 6 : 12), ...histRows];
  }, [query, tabs, history]);

  React.useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const run = (row: Row) => {
    if (row.kind === 'tab') {
      actions.activateTab(row.id);
      actions.closePalette();
      return;
    }
    if (row.kind === 'history') {
      actions.navigate(row.entry.url);
      actions.closePalette();
      return;
    }
    actions.closePalette();
    row.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (rows.length ? (c + 1) % rows.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (rows.length ? (c - 1 + rows.length) % rows.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[cursor];
      if (row) run(row);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      actions.closePalette();
    }
  };

  const sectionLabel = (row: Row, index: number): string | null => {
    const prev = rows[index - 1];
    if (prev && prev.kind === row.kind) return null;
    if (row.kind === 'tab') return 'Tabs';
    if (row.kind === 'command') return 'Commands';
    return 'History';
  };

  return (
    <div className="st-palette-scrim" onPointerDown={() => actions.closePalette()}>
      <div className="st-palette" onPointerDown={(event) => event.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="st-palette__search">
          <Icon.command size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a tab, page, or command"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="st-palette__list" ref={listRef}>
          {rows.length === 0 && (
            <div className="st-palette__empty">
              <p>No matches for “{query}”.</p>
              <span>Try a tab title, a command, or a page you visited.</span>
            </div>
          )}
          {rows.map((row, index) => {
            const section = sectionLabel(row, index);
            return (
              <React.Fragment key={`${row.kind}_${row.id}`}>
                {section && <div className="st-palette__section">{section}</div>}
                <button
                  data-row={index}
                  className={`st-palette__row${index === cursor ? ' is-active' : ''}`}
                  onPointerMove={() => setCursor(index)}
                  onClick={() => run(row)}
                >
                  <span className="st-palette__icon">
                    {row.kind === 'tab' ? (
                      row.tab.kind === 'web' && row.tab.favicon ? (
                        <img src={row.tab.favicon} width={16} height={16} alt="" className="st-favicon" />
                      ) : (
                        <Icon.globe size={16} />
                      )
                    ) : row.kind === 'history' ? (
                      <Icon.history size={16} />
                    ) : (
                      row.icon
                    )}
                  </span>
                  <span className="st-palette__text">
                    <span className="st-palette__label">{row.label}</span>
                    {row.sub && <span className="st-palette__sub">{row.sub}</span>}
                  </span>
                  {row.kind === 'tab' && row.id === activeId && <span className="st-palette__badge">current</span>}
                  {row.kind === 'command' && row.shortcut && <span className="st-palette__shortcut">{row.shortcut}</span>}
                  {row.kind === 'history' && <span className="st-palette__shortcut">open</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="st-palette__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> run</span>
          <span><kbd>Ctrl K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
};
