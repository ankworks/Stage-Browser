import React from 'react';
import type { ReaderArticle, ReaderBlock } from '../../shared/types';
import { readerMeta } from '../../shared/study';
import { Icon } from '../components/Icons';
import { actions } from '../state/actions';
import { useSel } from '../state/store';

/**
 * Reader pages are internal (`stage://reader?id=…`).
 *
 * Main extracts structured text blocks from the page; this component renders
 * them as DOM — no raw HTML ever reaches the renderer, so a hostile article
 * cannot inject markup or scripts into the browser.
 */

export const ReaderView: React.FC<{ url: string }> = ({ url }) => {
  const id = React.useMemo(() => {
    const q = url.split('?')[1] ?? '';
    return new URLSearchParams(q).get('id') ?? '';
  }, [url]);
  const [article, setArticle] = React.useState<ReaderArticle | null>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'missing'>('loading');
  const [progress, setProgress] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fontSize = useSel((s) => s.settings.readerFontSize ?? 19);
  const wide = useSel((s) => s.settings.readerFontSize >= 24);

  React.useEffect(() => {
    let alive = true;
    setState('loading');
    void window.stage.study.getReader(id).then((next) => {
      if (!alive) return;
      setArticle(next);
      setState(next ? 'ready' : 'missing');
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const onScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / max) * 100)));
  }, []);

  const changeSize = (delta: number) => {
    const next = Math.min(32, Math.max(14, fontSize + delta));
    void actions.setSettings({ readerFontSize: next });
  };

  if (state === 'loading') {
    return (
      <div className="jz-reader jz-reader--state">
        <div className="jz-reader__spinner" />
        <p>Setting the page in a quieter type…</p>
      </div>
    );
  }

  if (state === 'missing' || !article) {
    return (
      <div className="jz-reader jz-reader--state">
        <Icon.reader size={32} />
        <h2>This article is no longer in memory</h2>
        <p>Reader pages live for the current session. Go back to the tab and open Reader again.</p>
        <button className="jz-btn" onClick={() => actions.selectTabIndex(0)}>
          Back to tabs
        </button>
      </div>
    );
  }

  return (
    <div className="jz-reader" ref={scrollRef} onScroll={onScroll}>
      <div className="jz-reader__progress" style={{ width: `${progress}%` }} />
      <div className="jz-reader__bar">
        <button className="jz-iconbtn" title="Open the original page" onClick={() => actions.navigate(article.url)}>
          <Icon.arrowLeft size={17} />
        </button>
        <div className="jz-reader__source">
          <span className="jz-reader__site">{article.siteName}</span>
          <div className="jz-reader__tools">
            <button className="jz-iconbtn" title="Smaller text" onClick={() => changeSize(-1)}>
              A−
            </button>
            <button className="jz-iconbtn" title="Larger text" onClick={() => changeSize(1)}>
              A+
            </button>
            <button
              className="jz-iconbtn"
              title={wide ? 'Narrow measure' : 'Wide measure'}
              onClick={() => void actions.setSettings({ readerFontSize: wide ? 19 : 25 })}
            >
              <Icon.tabs size={16} />
            </button>
          </div>
        </div>
        <div className="jz-reader__actions">
          <button
            className="jz-btn jz-btn--ghost"
            onClick={() => void actions.addReading({ url: article.url, title: article.title })}
          >
            <Icon.book size={16} /> Save
          </button>
          <button className="jz-btn jz-btn--ghost" onClick={() => actions.openExternal(article.url)}>
            <Icon.external size={15} /> Original
          </button>
        </div>
      </div>

      <article className="jz-reader__paper" style={{ '--reader-size': `${fontSize}px` } as React.CSSProperties}>
        <header className="jz-reader__head">
          <h1>{article.title}</h1>
          <p className="jz-reader__meta">{readerMeta(article)}</p>
        </header>
        <div className={`jz-reader__body ${wide ? 'is-wide' : ''}`}>
          {article.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>
        <footer className="jz-reader__foot">
          <span>{article.words.toLocaleString()} words</span>
          <span>{article.minutes} min</span>
          <span className="jz-reader__end">End of article</span>
        </footer>
      </article>
    </div>
  );
};

const Block: React.FC<{ block: ReaderBlock }> = ({ block }) => {
  switch (block.kind) {
    case 'h1':
      return <h1>{block.text}</h1>;
    case 'h2':
      return <h2>{block.text}</h2>;
    case 'h3':
      return <h3>{block.text}</h3>;
    case 'li':
      return <li>{block.text}</li>;
    case 'quote':
      return <blockquote>{block.text}</blockquote>;
    case 'code':
      return <pre>{block.text}</pre>;
    default:
      return <p>{block.text}</p>;
  }
};

/** Internal-page glue. */
export function readerIdFromUrl(url: string): string | null {
  if (!url.startsWith('stage://reader')) return null;
  const q = url.split('?')[1] ?? '';
  const id = new URLSearchParams(q).get('id');
  return id || null;
}
