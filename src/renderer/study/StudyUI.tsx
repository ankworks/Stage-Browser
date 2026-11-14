import React from 'react';
import type { DownloadEntry, ExtensionInfo, PageContextPayload, ReadingEntry, Rect } from '../../shared/types';
import { formatBytes, searchTabs } from '../../shared/study';
import { hostOf } from '../../shared/url';
import { Icon } from '../components/Icons';
import { actions } from '../state/actions';
import { store, useSel } from '../state/store';

/**
 * Study overlays: find, tab search, the library sheet and the page menu.
 *
 * All of them live in the browser DOM. The native page view would paint over
 * them, so App flips `win.obscure` while any scrim is open (main hides the view).
 * Find is the exception: it sits inside the address bar, so the page stays
 * visible and highlighting works as expected.
 */

export const StudyLayer: React.FC<{ rect: Rect }> = ({ rect }) => (
  <>
    <TabSearch />
    <StudySheet />
    <PageMenu rect={rect} />
  </>
);

/* ------------------------------------------------------------------ *
 * Find in page
 * ------------------------------------------------------------------ */

export const FindBar: React.FC = () => {
  const find = useSel((s) => s.find);
  const [query, setQuery] = React.useState(find.query);
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const hadQuery = React.useRef(false);
  const open = find.open;

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      hadQuery.current = false;
      return;
    }
    if (!query) {
      if (hadQuery.current) {
        hadQuery.current = false;
        void actions.clearFindQuery();
      }
      return;
    }
    hadQuery.current = true;
    const timer = window.setTimeout(() => {
      actions.setFindQuery(query, caseSensitive);
    }, 90);
    return () => window.clearTimeout(timer);
  }, [query, caseSensitive, open]);

  if (!open) return null;

  return (
    <div className="jz-find jz-find--inline" role="search">
      <Icon.search size={15} />
      <input
        ref={inputRef}
        data-stage-find
        value={query}
        placeholder="Find in page"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            actions.closeFind();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (query.trim()) actions.findNext(!e.shiftKey);
          }
        }}
      />
      <span className={`jz-find__count ${find.matches === 0 && query ? 'is-empty' : ''}`}>
        {query ? `${find.matches === 0 ? 0 : find.activeMatch + 1}/${find.matches}` : ''}
      </span>
      <button
        className={`jz-find__btn ${caseSensitive ? 'is-on' : ''}`}
        title="Match case"
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>
      <button className="jz-find__btn" title="Previous (Shift+Enter)" onClick={() => actions.findNext(false)}>
        <Icon.arrowLeft size={15} />
      </button>
      <button className="jz-find__btn" title="Next (Enter)" onClick={() => actions.findNext(true)}>
        <Icon.arrowRight size={15} />
      </button>
      <button className="jz-find__btn jz-find__btn--close" title="Close (Esc)" onClick={() => actions.closeFind()}>
        <Icon.close size={14} />
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Tab search (Ctrl+Shift+A)
 * ------------------------------------------------------------------ */

const TabSearch: React.FC = () => {
  const open = useSel((s) => s.tabSearchOpen);
  const tabs = useSel((s) => s.tabs, (a, b) => a === b);
  const activeId = useSel((s) => s.activeTabId);
  const [query, setQuery] = React.useState('');
  const [index, setIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setIndex(0);
      return;
    }
    // Start on the current tab, not on whatever sorts first.
    const initial = searchTabs(tabs, '', 9).findIndex((hit) => hit.id === activeId);
    setIndex(Math.max(0, initial));
    setQuery('');
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
    // Opening is the only event that should reset the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hits = React.useMemo(() => searchTabs(tabs, query.trim(), 9), [tabs, query]);
  const searchRow = query.trim().length > 0;

  React.useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!open) return null;

  const run = (i: number) => {
    if (i < hits.length) {
      const hit = hits[i];
      void actions.activateTab(hit.id);
    } else if (searchRow) {
      void actions.newTab(query.trim());
    }
    actions.closeTabSearch();
  };

  const total = hits.length + (searchRow ? 1 : 0);

  return (
    <div className="jz-scrim jz-scrim--search" onMouseDown={() => actions.closeTabSearch()}>
      <div className="jz-search" onMouseDown={(e) => e.stopPropagation()}>
        <div className="jz-search__field">
          <Icon.tabs size={20} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Jump to a tab, or type a new address"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') actions.closeTabSearch();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((v) => Math.min(total - 1, v + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((v) => Math.max(0, v - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(index);
              }
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div className="jz-search__list" role="listbox">
          {hits.length ? <div className="jz-search__section">Open tabs</div> : null}
          {hits.map((hit, i) => {
            const tab = tabs.find((t) => t.id === hit.id);
            const active = activeId === hit.id;
            return (
              <button
                key={hit.id}
                className={`jz-search__row ${i === index ? 'is-active' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => run(i)}
              >
                <span className="jz-search__icon">
                  {tab?.kind === 'whiteboard' ? (
                    <Icon.board size={17} />
                  ) : tab?.favicon ? (
                    <img src={tab.favicon} alt="" width={16} height={16} />
                  ) : (
                    <Icon.globe size={17} />
                  )}
                </span>
                <span className="jz-search__label">{hit.label}</span>
                {hit.url ? <span className="jz-search__url">{hostOf(hit.url)}</span> : null}
                {active ? <span className="jz-search__badge">Current</span> : null}
              </button>
            );
          })}

          {searchRow ? (
            <button
              className={`jz-search__row jz-search__row--go ${index === hits.length ? 'is-active' : ''}`}
              onMouseEnter={() => setIndex(hits.length)}
              onClick={() => run(hits.length)}
            >
              <span className="jz-search__icon">
                <Icon.search size={17} />
              </span>
              <span className="jz-search__label">
                Search the web for <strong>{query.trim()}</strong>
              </span>
              <span className="jz-search__url">↵</span>
            </button>
          ) : null}

          {!hits.length && !searchRow ? <div className="jz-search__empty">No open tabs yet.</div> : null}
        </div>

        <footer className="jz-search__foot">
          <span>
            <kbd>↑</kbd><kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> from anywhere
          </span>
        </footer>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Library sheet: downloads · reading list · extensions
 * ------------------------------------------------------------------ */

const StudySheet: React.FC = () => {
  const panel = useSel((s) => s.studyPanel);
  if (!panel) return null;
  return (
    <div className="jz-scrim jz-scrim--sheet" onMouseDown={() => actions.closeStudyPanel()}>
      <aside className="jz-sheet-panel" onMouseDown={(e) => e.stopPropagation()}>
        <header className="jz-sheet-panel__head">
          <div>
            <span className="jz-eyebrow">Study</span>
            <h2>{panel === 'downloads' ? 'Downloads' : panel === 'reading' ? 'Reading list' : 'Extensions'}</h2>
          </div>
          <button className="jz-iconbtn" title="Close" onClick={() => actions.closeStudyPanel()}>
            <Icon.close size={17} />
          </button>
        </header>

        <nav className="jz-sheet-panel__nav">
          {(
            [
              ['downloads', 'Downloads', Icon.download],
              ['reading', 'Reading', Icon.book],
              ['extensions', 'Extensions', Icon.puzzle],
            ] as const
          ).map(([id, label, glyph]) => {
            const Glyph = glyph;
            return (
              <button
                key={id}
                className={panel === id ? 'is-active' : ''}
                onClick={() => store.set({ studyPanel: id })}
              >
                <Glyph size={16} /> {label}
              </button>
            );
          })}
        </nav>

        <div className="jz-sheet-panel__body">
          {panel === 'downloads' ? <DownloadsPanel /> : panel === 'reading' ? <ReadingPanel /> : <ExtensionsPanel />}
        </div>
      </aside>
    </div>
  );
};

const DownloadsPanel: React.FC = () => {
  const downloads = useSel((s) => s.downloads, (a, b) => a === b);
  return (
    <div className="jz-downloads">
      <div className="jz-panel-tools">
        <span>{downloads.length ? `${downloads.length} this session` : 'Nothing downloaded yet'}</span>
        {downloads.length ? (
          <button className="jz-linkbtn" onClick={() => void actions.clearDownloads()}>
            Clear finished
          </button>
        ) : null}
      </div>

      {downloads.length === 0 ? (
        <Empty glyph={Icon.download} title="No downloads" body="Files you save from a page land here, with pause and reveal." />
      ) : (
        downloads.map((item) => <DownloadRow key={item.id} item={item} />)
      )}
    </div>
  );
};

const DownloadRow: React.FC<{ item: DownloadEntry }> = ({ item }) => {
  const pct = item.total > 0 ? Math.min(100, Math.round((item.received / item.total) * 100)) : item.state === 'completed' ? 100 : 0;
  const done = item.state === 'completed';
  const active = item.state === 'progressing' || item.state === 'paused';
  return (
    <div className={`jz-dl ${done ? 'is-done' : ''}`}>
      <div className="jz-dl__top">
        <span className="jz-dl__name" title={item.savePath || item.filename}>
          {item.filename}
        </span>
        <span className="jz-dl__size">
          {formatBytes(item.received)}
          {item.total ? ` / ${formatBytes(item.total)}` : ''}
        </span>
      </div>
      {active ? (
        <div className="jz-dl__bar">
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <div className="jz-dl__row">
        <span className={`jz-dl__state is-${item.state}`}>
          {item.state === 'completed' ? 'Saved' : item.state === 'cancelled' ? 'Cancelled' : item.state === 'interrupted' ? 'Interrupted' : item.paused ? 'Paused' : `${pct}%`}
        </span>
        <div className="jz-dl__actions">
          {active ? (
            <>
              <button className="jz-linkbtn" onClick={() => void actions.downloadCmd(item.id, item.paused ? 'resume' : 'pause')}>
                {item.paused ? 'Resume' : 'Pause'}
              </button>
              <button className="jz-linkbtn" onClick={() => void actions.downloadCmd(item.id, 'cancel')}>
                Cancel
              </button>
            </>
          ) : null}
          {done ? (
            <>
              <button className="jz-linkbtn" onClick={() => void actions.downloadCmd(item.id, 'open')}>
                Open
              </button>
              <button className="jz-linkbtn" onClick={() => void actions.downloadCmd(item.id, 'reveal')}>
                Show in folder
              </button>
            </>
          ) : null}
          {!active ? (
            <button className="jz-iconbtn jz-iconbtn--sm" title="Remove from list" onClick={() => void actions.downloadCmd(item.id, 'remove')}>
              <Icon.close size={13} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const ReadingPanel: React.FC = () => {
  const list = useSel((s) => s.readingList, (a, b) => a === b);
  const [filter, setFilter] = React.useState<'todo' | 'done' | 'all'>('todo');
  const visible = list.filter((r) => (filter === 'all' ? true : filter === 'done' ? !!r.doneAt : !r.doneAt));
  const doneCount = list.filter((r) => r.doneAt).length;
  const totalMinutes = list.filter((r) => !r.doneAt).reduce((n, r) => n + r.minutes, 0);

  return (
    <div className="jz-reading">
      <div className="jz-panel-tools">
        <span>{list.length ? `${list.length - doneCount} to read · ${totalMinutes} min` : 'Build a queue from any page'}</span>
        {doneCount ? (
          <button className="jz-linkbtn" onClick={() => void actions.readingCmd('', 'clearDone')}>
            Clear done
          </button>
        ) : null}
      </div>

      {list.length ? (
        <div className="jz-seg">
          {(['todo', 'done', 'all'] as const).map((id) => (
            <button key={id} className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>
              {id === 'todo' ? 'To read' : id === 'done' ? `Done ${doneCount}` : 'All'}
            </button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <Empty
          glyph={Icon.book}
          title={list.length ? 'Nothing here' : 'Your reading list is empty'}
          body={
            list.length
              ? 'Switch the filter above, or open a page and press Ctrl+Shift+D.'
              : 'Open a page, then Ctrl+Shift+D (or right-click → Add to reading list). Stage keeps the words, not just the link.'
          }
        />
      ) : (
        visible.map((entry) => <ReadingRow key={entry.id} entry={entry} />)
      )}
    </div>
  );
};

const ReadingRow: React.FC<{ entry: ReadingEntry }> = ({ entry }) => (
  <div className={`jz-reading__row ${entry.doneAt ? 'is-done' : ''}`}>
    <button
      className={`jz-check ${entry.doneAt ? 'is-on' : ''}`}
      title={entry.doneAt ? 'Mark unread' : 'Mark read'}
      onClick={() => void actions.readingCmd(entry.id, 'done')}
    >
      {entry.doneAt ? <Icon.check size={13} /> : null}
    </button>
    <div className="jz-reading__main">
      <button className="jz-reading__title" title={entry.url} onClick={() => void actions.newTab(entry.url)}>
        {entry.title}
      </button>
      <div className="jz-reading__meta">
        <span>{hostOf(entry.url)}</span>
        <span className="jz-dot" />
        <span>
          <Icon.clock size={12} /> {entry.minutes} min
        </span>
        {entry.words ? <span className="jz-reading__words">{entry.words.toLocaleString()} words</span> : null}
      </div>
    </div>
    <button className="jz-iconbtn jz-iconbtn--sm" title="Remove" onClick={() => void actions.readingCmd(entry.id, 'remove')}>
      <Icon.trash size={14} />
    </button>
  </div>
);

const ExtensionsPanel: React.FC = () => {
  const extensions = useSel((s) => s.extensions, (a, b) => a === b);
  const [busy, setBusy] = React.useState(false);

  const load = async () => {
    setBusy(true);
    try {
      await actions.addExtension();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="jz-extensions">
      <div className="jz-panel-tools">
        <span>{extensions.length ? `${extensions.length} loaded` : 'No extensions loaded'}</span>
        <button className="jz-btn jz-btn--primary jz-btn--sm" disabled={busy} onClick={() => void load()}>
          <Icon.plus size={15} /> {busy ? 'Loading…' : 'Load unpacked'}
        </button>
      </div>

      <div className="jz-note">
        Stage runs on Chromium, so unpacked Chrome extensions work here. Content blockers and reader tools are the sweet spot. Extensions run with page access — only load code you trust.
      </div>

      {extensions.length === 0 ? (
        <Empty glyph={Icon.puzzle} title="Bring your own tools" body="Load an unpacked extension folder (manifest.json inside). It stays in Stage across launches." />
      ) : (
        extensions.map((ext) => <ExtensionRow key={ext.id} ext={ext} />)
      )}
    </div>
  );
};

const ExtensionRow: React.FC<{ ext: ExtensionInfo }> = ({ ext }) => (
  <div className={`jz-ext ${ext.enabled ? '' : 'is-off'}`}>
    <div className="jz-ext__glyph">
      <Icon.puzzle size={18} />
    </div>
    <div className="jz-ext__main">
      <div className="jz-ext__name">
        {ext.name} <span className="jz-ext__ver">v{ext.version}</span>
      </div>
      <div className="jz-ext__path" title={ext.path}>
        {ext.path}
      </div>
    </div>
    <div className="jz-ext__actions">
      <span className={`jz-badge ${ext.enabled ? 'is-ok' : ''}`}>{ext.enabled ? `MV${ext.manifestVersion}` : 'off'}</span>
      {ext.enabled ? (
        <button className="jz-linkbtn" onClick={() => void actions.extensionCmd(ext.id, 'disable')}>
          Disable
        </button>
      ) : (
        <button className="jz-linkbtn" onClick={() => void actions.extensionCmd(ext.id, 'enable')}>
          Enable
        </button>
      )}
    </div>
  </div>
);

const Empty: React.FC<{ glyph: React.FC<{ size?: number }>; title: string; body: string }> = ({ glyph: Glyph, title, body }) => (
  <div className="jz-empty">
    <span className="jz-empty__glyph">
      <Glyph size={26} />
    </span>
    <strong>{title}</strong>
    <p>{body}</p>
  </div>
);

/* ------------------------------------------------------------------ *
 * Page context menu
 * ------------------------------------------------------------------ */

interface MenuItem {
  key: string;
  label: string;
  hint?: string;
  run: () => void;
  danger?: boolean;
  separator?: boolean;
}

const PageMenu: React.FC<{ rect: Rect }> = ({ rect }) => {
  const payload = useSel((s) => s.pageMenu);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    if (!payload) return;
    const width = 248;
    const height = 360;
    setPos({
      x: Math.min(Math.max(8, rect.x + payload.x), window.innerWidth - width - 8),
      y: Math.min(Math.max(8, rect.y + payload.y), window.innerHeight - height - 8),
    });
  }, [payload, rect]);

  React.useEffect(() => {
    if (!payload) return;
    const close = () => actions.closePageMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [payload]);

  if (!payload) return null;
  const items = pageMenuItems(payload);

  return (
    <div
      ref={menuRef}
      className="jz-pagemenu"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.key} className="jz-pagemenu__sep" />
        ) : (
          <button
            key={item.key}
            className={item.danger ? 'is-danger' : ''}
            onClick={() => {
              item.run();
              actions.closePageMenu();
            }}
          >
            <span>{item.label}</span>
            {item.hint ? <kbd>{item.hint}</kbd> : null}
          </button>
        ),
      )}
    </div>
  );
};

function pageMenuItems(p: PageContextPayload): MenuItem[] {
  const items: MenuItem[] = [];
  const act = (action: string) => () => void actions.pageAction(p, action);

  if (p.linkURL) {
    items.push({ key: 'open', label: 'Open link in background tab', run: act('open-link') });
    items.push({ key: 'open-fg', label: 'Open link in new tab', run: act('open-link-foreground') });
    items.push({ key: 'copy-link', label: 'Copy link address', run: act('copy-link') });
    items.push({ key: 'ext', label: 'Open in default browser', run: act('open-external') });
    items.push({ key: 'sep1', label: '', separator: true, run: () => undefined });
  }

  if (p.srcURL && p.mediaType === 'image') {
    items.push({ key: 'save-img', label: 'Save image', run: act('save-image') });
    items.push({ key: 'copy-img', label: 'Copy image address', run: act('copy-image') });
    items.push({ key: 'sep2', label: '', separator: true, run: () => undefined });
  }

  if (p.selectionText) {
    items.push({ key: 'copy-sel', label: 'Copy selection', hint: 'Ctrl+C', run: act('copy-text') });
    items.push({
      key: 'search-sel',
      label: `Search “${p.selectionText.trim().slice(0, 28)}${p.selectionText.trim().length > 28 ? '…' : ''}”`,
      run: act('search-selection'),
    });
    items.push({ key: 'sep3', label: '', separator: true, run: () => undefined });
  }

  items.push({ key: 'reader', label: 'Open in Reader', run: act('reader') });
  items.push({ key: 'reading', label: 'Add to reading list', run: act('add-reading') });
  items.push({ key: 'sep4', label: '', separator: true, run: () => undefined });
  items.push({ key: 'shot', label: 'Capture page', run: act('screenshot') });
  items.push({ key: 'pdf', label: 'Save page as PDF', run: act('print-pdf') });
  items.push({ key: 'sep5', label: '', separator: true, run: () => undefined });
  items.push({ key: 'reload', label: 'Reload', hint: 'Ctrl+R', run: act('reload') });
  items.push({ key: 'inspect', label: 'Inspect element', run: act('inspect') });

  return items;
}

/* ------------------------------------------------------------------ *
 * Titlebar quick actions
 * ------------------------------------------------------------------ */

export const StudyDock: React.FC = () => {
  const appearance = useSel((s) => s.settings.appearance ?? 'dark');
  const downloads = useSel((s) => s.downloads.length);
  const reading = useSel((s) => s.readingList.filter((r) => !r.doneAt).length);
  const panel = useSel((s) => s.studyPanel);

  return (
    <div className="jz-dock">
      <button className="jz-dock__btn" title="Search tabs (Ctrl+Shift+A)" onClick={() => actions.openTabSearch()}>
        <Icon.tabs size={17} />
      </button>
      <button
        className={`jz-dock__btn ${panel === 'reading' ? 'is-on' : ''}`}
        title="Reading list (Ctrl+Shift+D)"
        onClick={() => actions.openStudyPanel('reading')}
      >
        <Icon.book size={17} />
        {reading ? <span className="jz-dock__count">{reading > 99 ? '99+' : reading}</span> : null}
      </button>
      <button
        className={`jz-dock__btn ${panel === 'downloads' ? 'is-on' : ''}`}
        title="Downloads (Ctrl+J)"
        onClick={() => actions.openStudyPanel('downloads')}
      >
        <Icon.download size={17} />
        {downloads ? <span className="jz-dock__count">{downloads > 99 ? '99+' : downloads}</span> : null}
      </button>
      <button className="jz-dock__btn" title="Reader (Ctrl+Alt+R)" onClick={() => void actions.openReader()}>
        <Icon.reader size={17} />
      </button>
      <button
        className={`jz-dock__btn ${panel === 'extensions' ? 'is-on' : ''}`}
        title="Extensions"
        onClick={() => actions.openStudyPanel('extensions')}
      >
        <Icon.puzzle size={17} />
      </button>
      <button
        className="jz-dock__btn"
        title={appearance === 'dark' ? 'Switch to paper (light)' : 'Switch to ink (dark)'}
        onClick={() => actions.toggleTheme()}
      >
        {appearance === 'dark' ? <Icon.sun size={17} /> : <Icon.moon size={17} />}
      </button>
    </div>
  );
};
