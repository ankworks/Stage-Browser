import React from 'react';
import type { Favorite, HistoryEntry, ReadingEntry } from '../../shared/types';
import { hostOf } from '../../shared/url';
import { actions } from '../state/actions';
import { useSel } from '../state/store';
import { Icon } from './Icons';
import { Logo } from './Logo';

/* ------------------------------------------------------------------ *
 * Small shared bits
 * ------------------------------------------------------------------ */

const Favicon: React.FC<{ src?: string; size?: number }> = ({ src, size = 18 }) => {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [src]);
  if (!src || broken) {
    return (
      <span className="st-favfallback" style={{ width: size, height: size }}>
        <Icon.globe size={Math.round(size * 0.82)} />
      </span>
    );
  }
  return <img className="st-favicon" src={src} width={size} height={size} alt="" onError={() => setBroken(true)} />;
};

function siteOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return hostOf(url) || url;
  }
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ts >= start) return 'Today';
  if (ts >= start - 86_400_000) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ *
 * New tab
 * ------------------------------------------------------------------ */

const NewTabPage: React.FC = () => {
  const favorites = useSel((s) => s.favorites);
  const history = useSel((s) => s.history);
  const reading = useSel((s) => s.readingList);
  const [query, setQuery] = React.useState('');

  const queue = reading.filter((r) => !r.doneAt).slice(0, 3);
  const recent = history.slice(0, 6);
  const pinned = favorites.slice(0, 8);

  return (
    <div className="st-page st-newtab">
      <div className="st-newtab__wallpaper" aria-hidden="true" />
      <div className="st-newtab__glow" aria-hidden="true" />
      <section className="st-hero">
        <div className="st-hero__mark">
          <Logo size={46} radius={14} />
        </div>
        <p className="st-eyebrow">Stage Browser</p>
        <h1 className="st-hero__title">Study without the noise.</h1>
        <p className="st-hero__sub">Read, collect, and pick up exactly where you stopped.</p>

        <form
          className="st-search"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim()) actions.navigate(query.trim());
          }}
        >
          <Icon.search size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the web or type an address"
            spellCheck={false}
            aria-label="Search"
          />
          <kbd>Enter</kbd>
        </form>

        <div className="st-hero__actions">
          <button className="st-quick" onClick={() => actions.openStudyPanel('reading')}>
            <Icon.book size={17} />
            Reading list
            <span>{reading.filter((r) => !r.doneAt).length}</span>
          </button>
          <button className="st-quick" onClick={() => actions.openStudyPanel('downloads')}>
            <Icon.download size={17} />
            Downloads
          </button>
          <button className="st-quick" onClick={() => actions.openStudyPanel('extensions')}>
            <Icon.puzzle size={17} />
            Extensions
          </button>
          <button className="st-quick" onClick={() => actions.openPalette()}>
            <Icon.command size={17} />
            Commands
            <kbd>Ctrl K</kbd>
          </button>
        </div>
      </section>

      <div className="st-home-grid">
        <section className="st-card st-card--queue">
          <div className="st-card__head">
            <h2>
              <Icon.book size={16} /> Continue reading
            </h2>
            {queue.length > 0 && (
              <button className="st-link" onClick={() => actions.openStudyPanel('reading')}>
                View list
              </button>
            )}
          </div>
          {queue.length ? (
            <div className="st-queue">
              {queue.map((entry) => (
                <button key={entry.id} className="st-queue__item" onClick={() => actions.navigate(entry.url)}>
                  <Favicon src={entry.favicon} size={20} />
                  <span className="st-queue__text">
                    <span className="st-queue__title">{entry.title}</span>
                    <span className="st-queue__meta">
                      {siteOf(entry.url)} · {entry.minutes} min left
                    </span>
                  </span>
                  <Icon.arrowRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="st-empty st-empty--tight">
              <p>Nothing queued yet.</p>
              <span>
                Open an article and press <kbd>Ctrl Shift D</kbd>, or use the reading list button in the toolbar.
              </span>
            </div>
          )}
        </section>

        <section className="st-card">
          <div className="st-card__head">
            <h2>
              <Icon.star size={16} /> Favorites
            </h2>
            <button className="st-link" onClick={() => actions.openInternal('favorites')}>
              All
            </button>
          </div>
          {pinned.length ? (
            <div className="st-favgrid">
              {pinned.map((fav) => (
                <button key={fav.id} className="st-favtile" onClick={() => actions.navigate(fav.url)} title={fav.title}>
                  <Favicon src={fav.favicon} size={20} />
                  <span>{fav.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="st-empty st-empty--tight">
              <p>No favorites yet.</p>
              <span>
                Press <kbd>Ctrl D</kbd> on a page you want to keep.
              </span>
            </div>
          )}
        </section>

        <section className="st-card st-card--recent">
          <div className="st-card__head">
            <h2>
              <Icon.history size={16} /> Recent
            </h2>
            {recent.length > 0 && (
              <button className="st-link" onClick={() => actions.openInternal('history')}>
                History
              </button>
            )}
          </div>
          {recent.length ? (
            <div className="st-recent">
              {recent.map((entry) => (
                <button key={entry.id} className="st-recent__row" onClick={() => actions.navigate(entry.url)}>
                  <Favicon size={16} />
                  <span className="st-recent__title">{entry.title}</span>
                  <span className="st-recent__site">{siteOf(entry.url)}</span>
                  <span className="st-recent__time">{timeLabel(entry.visitedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="st-empty st-empty--tight">
              <p>Your history is empty.</p>
              <span>The pages you visit will show up here — locally, never synced.</span>
            </div>
          )}
        </section>
      </div>

      <footer className="st-newtab__foot">
        <span>
          <kbd>Ctrl K</kbd> commands
        </span>
        <span>
          <kbd>Ctrl L</kbd> address
        </span>
        <span>
          <kbd>Ctrl Shift A</kbd> tabs
        </span>
        <span>
          <kbd>Ctrl Alt R</kbd> reader
        </span>
      </footer>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Favorites
 * ------------------------------------------------------------------ */

const FavoritesPage: React.FC = () => {
  const favorites = useSel((s) => s.favorites);
  return (
    <div className="st-page st-listpage">
      <header className="st-pagehead">
        <div>
          <p className="st-eyebrow">Library</p>
          <h1>Favorites</h1>
          <p className="st-pagesub">{favorites.length} saved {favorites.length === 1 ? 'page' : 'pages'}</p>
        </div>
        <button className="st-btn" onClick={() => void actions.newTab()}>
          <Icon.plus size={15} /> New tab
        </button>
      </header>

      {favorites.length ? (
        <div className="st-favlist">
          {favorites.map((fav) => (
            <FavoriteRow key={fav.id} fav={fav} />
          ))}
        </div>
      ) : (
        <div className="st-empty">
          <Icon.star size={28} />
          <h2>Keep the good ones</h2>
          <p>Press Ctrl+D on any page to save it here.</p>
        </div>
      )}
    </div>
  );
};

const FavoriteRow: React.FC<{ fav: Favorite }> = ({ fav }) => {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(fav.title);
  const commit = () => {
    setEditing(false);
    if (value.trim() && value !== fav.title) actions.renameFavorite(fav.id, value);
  };
  return (
    <div className="st-favrow">
      <Favicon src={fav.favicon} size={20} />
      {editing ? (
        <input
          className="st-inlineinput"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') {
              setValue(fav.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button className="st-favrow__main" onClick={() => actions.navigate(fav.url)}>
          <span className="st-favrow__title">{fav.title}</span>
          <span className="st-favrow__url">{fav.url}</span>
        </button>
      )}
      <button className="st-iconbtn" title="Rename" onClick={() => setEditing(true)}>
        <Icon.text size={15} />
      </button>
      <button className="st-iconbtn" title="Remove" onClick={() => actions.removeFavorite(fav.id)}>
        <Icon.trash size={15} />
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

const HistoryPage: React.FC = () => {
  const history = useSel((s) => s.history);
  const [query, setQuery] = React.useState('');

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q));
  }, [history, query]);

  const groups = React.useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const entry of filtered) {
      const key = dayLabel(entry.visitedAt);
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="st-page st-listpage">
      <header className="st-pagehead">
        <div>
          <p className="st-eyebrow">Local only</p>
          <h1>History</h1>
          <p className="st-pagesub">{history.length} {history.length === 1 ? 'visit' : 'visits'} on this device</p>
        </div>
        <div className="st-pagehead__actions">
          <div className="st-filter">
            <Icon.search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter history" />
          </div>
          {history.length > 0 && (
            <button className="st-btn st-btn--ghost" onClick={() => actions.clearHistory()}>
              <Icon.trash size={15} /> Clear
            </button>
          )}
        </div>
      </header>

      {groups.length ? (
        <div className="st-history">
          {groups.map(([day, entries]) => (
            <section key={day} className="st-histgroup">
              <h2>{day}</h2>
              {entries.map((entry) => (
                <div key={entry.id} className="st-histrow">
                  <Favicon size={16} />
                  <button className="st-histrow__main" onClick={() => actions.navigate(entry.url)}>
                    <span className="st-histrow__title">{entry.title}</span>
                    <span className="st-histrow__url">{siteOf(entry.url)}</span>
                  </button>
                  <span className="st-histrow__time">{timeLabel(entry.visitedAt)}</span>
                  <button className="st-iconbtn" title="Remove" onClick={() => actions.removeHistory(entry.id)}>
                    <Icon.close size={13} />
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="st-empty">
          <Icon.history size={28} />
          <h2>{query ? 'No matches' : 'Nothing here yet'}</h2>
          <p>{query ? 'Try a different word.' : 'Pages you visit appear here, stored only on this machine.'}</p>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * About
 * ------------------------------------------------------------------ */

const AboutPage: React.FC = () => {
  const version = useSel((s) => s.version);
  const platform = useSel((s) => s.platform);
  return (
    <div className="st-page st-about">
      <div className="st-about__brand">
        <Logo size={56} radius={17} />
        <div>
          <h1>Stage Browser</h1>
          <p>A calm, study-first browser. Version {version} · {platform}</p>
        </div>
      </div>

      <div className="st-about__grid">
        <section className="st-card">
          <h2>Built for reading</h2>
          <p>
            Reader mode strips ads and chrome, the reading list remembers what you meant to finish, and per-site zoom
            keeps dense papers legible without breaking the rest of the web.
          </p>
        </section>
        <section className="st-card">
          <h2>Local by default</h2>
          <p>
            History, favorites, reading list and downloads stay in this app's profile. No account, no sync, no telemetry.
          </p>
        </section>
        <section className="st-card">
          <h2>Shortcuts</h2>
          <div className="st-keygrid">
            {[
              ['Ctrl T', 'New tab'],
              ['Ctrl K', 'Commands'],
              ['Ctrl L', 'Address bar'],
              ['Ctrl F', 'Find in page'],
              ['Ctrl D', 'Favorite'],
              ['Ctrl J', 'Downloads'],
              ['Ctrl Shift D', 'Reading list'],
              ['Ctrl Shift A', 'Search tabs'],
              ['Ctrl Alt R', 'Reader'],
              ['Ctrl P', 'Save as PDF'],
              ['Ctrl Shift S', 'Screenshot'],
            ].map(([keys, label]) => (
              <div key={keys} className="st-keyrow">
                <kbd>{keys}</kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="st-card">
          <h2>Extensions</h2>
          <p>
            Load unpacked Chromium extensions from the Extensions panel. They run inside the browser session, with the
            same isolation as any other page.
          </p>
          <button className="st-btn st-btn--ghost" onClick={() => actions.openStudyPanel('extensions')}>
            <Icon.puzzle size={15} /> Manage extensions
          </button>
        </section>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */

export const InternalPage: React.FC<{ url: string }> = ({ url }) => {
  const page = url.replace('stage://', '').split(/[/?#]/)[0];
  switch (page) {
    case 'favorites':
      return <FavoritesPage />;
    case 'history':
      return <HistoryPage />;
    case 'about':
      return <AboutPage />;
    default:
      return <NewTabPage />;
  }
};
