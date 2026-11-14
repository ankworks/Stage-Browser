import React from 'react';
import { tabLabel, type TabState } from '../../shared/types';
import { actions } from '../state/actions';
import { sel, useSel } from '../state/store';
import { Icon } from './Icons';
import { Logo, StageWordmark } from './Logo';
import { FindBar, StudyDock } from '../study/StudyUI';

/* ------------------------------------------------------------------ *
 * Title bar
 * ------------------------------------------------------------------ */

export const TitleBar: React.FC = () => {
  const active = useSel(sel.activeTab);
  const maximized = useSel((s) => s.maximized);
  const count = useSel((s) => s.tabs.length);

  const title = active ? tabLabel(active) : 'New Tab';

  return (
    <header
      className="st-titlebar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button, .st-dock')) return;
        void window.stage.window.toggleMaximize();
      }}
    >
      <div className="st-titlebar__brand">
        <Logo size={21} />
        <StageWordmark />
      </div>

      <div className="st-titlebar__page">
        <TabIcon tab={active} size={14} />
        <span className="st-titlebar__title">{title}</span>
        {count > 1 && <span className="st-titlebar__count">{count} tabs</span>}
      </div>

      <div className="st-titlebar__right">
        <StudyDock />
        <button className="st-iconbtn" title="Settings" onClick={() => actions.openSettings()}>
          <Icon.sliders size={17} />
        </button>
        <WindowControls maximized={maximized} />
      </div>
    </header>
  );
};

const WindowControls: React.FC<{ maximized: boolean }> = ({ maximized }) => (
  <div className="st-wincontrols">
    <button className="st-winbtn" title="Minimize" onClick={() => window.stage.window.minimize()}>
      <Icon.minimize size={16} />
    </button>
    <button
      className="st-winbtn"
      title={maximized ? 'Restore' : 'Maximize'}
      onClick={() => void window.stage.window.toggleMaximize()}
    >
      {maximized ? <Icon.restore size={15} /> : <Icon.maximize size={14} />}
    </button>
    <button className="st-winbtn st-winbtn--close" title="Close" onClick={() => window.stage.window.close()}>
      <Icon.close size={16} />
    </button>
  </div>
);

/* ------------------------------------------------------------------ *
 * Tab icon
 * ------------------------------------------------------------------ */

export const TabIcon: React.FC<{ tab: TabState | null; size?: number }> = ({ tab, size = 15 }) => {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [tab?.kind === 'web' ? tab.favicon : '']);
  if (!tab) return <Icon.home size={size} />;
  if (tab.kind === 'web' && tab.loading) return <span className="st-spinner st-spinner--tiny" />;
  if (tab.kind === 'web' && tab.favicon && !broken) {
    return <img className="st-favicon" src={tab.favicon} width={size} height={size} alt="" onError={() => setBroken(true)} />;
  }
  if (tab.kind === 'web' && tab.url.startsWith('stage://reader')) return <Icon.reader size={size} />;
  if (tab.kind === 'web' && tab.url.startsWith('stage://')) return <Logo size={size} radius={4} />;
  return <Icon.globe size={size} />;
};

/* ------------------------------------------------------------------ *
 * Address bar
 * ------------------------------------------------------------------ */

export const AddressBar: React.FC = () => {
  const active = useSel(sel.activeTab);
  const settings = useSel((s) => s.settings);
  const favorites = useSel((s) => s.favorites);
  const find = useSel((s) => s.find);
  const ink = useSel((s) => s.ink);
  const focusToken = useSel((s) => s.addressFocus);
  const loading = active?.kind === 'web' ? active.loading : false;
  const canBack = active?.kind === 'web' ? active.canGoBack : false;
  const canForward = active?.kind === 'web' ? active.canGoForward : false;
  const url = active?.kind === 'web' ? active.url : '';
  const internal = url.startsWith('stage://');
  const favorite = favorites.find((f) => f.url === url);
  const inkOn = !!active && ink.tabId === active.id && ink.on;
  const secure = /^https:\/\//i.test(url);
  const [value, setValue] = React.useState(url);
  const [focused, setFocused] = React.useState(false);
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const actionsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!focused) setValue(url);
  }, [url, focused]);

  React.useEffect(() => {
    if (focusToken > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusToken]);

  React.useEffect(() => {
    if (!zoomOpen && !moreOpen) return;
    const close = (event: PointerEvent) => {
      if (actionsRef.current?.contains(event.target as Node)) return;
      setZoomOpen(false);
      setMoreOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [zoomOpen, moreOpen]);

  const zoom = React.useMemo(() => {
    try {
      const host = new URL(url).host;
      return settings.siteZoom?.[host] ?? settings.zoom ?? 1;
    } catch {
      return settings.zoom ?? 1;
    }
  }, [url, settings.siteZoom, settings.zoom]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    actions.navigate(raw);
    inputRef.current?.blur();
    setFocused(false);
    void window.stage.window.focusPage();
  };

  return (
    <div className="st-addressbar">
      <div className="st-nav">
        <button className="st-iconbtn" title="Back (Alt+Left)" disabled={!canBack} onClick={() => actions.back()}>
          <Icon.arrowLeft size={18} />
        </button>
        <button className="st-iconbtn" title="Forward (Alt+Right)" disabled={!canForward} onClick={() => actions.forward()}>
          <Icon.arrowRight size={18} />
        </button>
        <button
          className="st-iconbtn"
          title={loading ? 'Stop' : 'Reload (Ctrl+R)'}
          onClick={() => (loading ? actions.stop() : actions.reload())}
        >
          {loading ? <Icon.close size={16} /> : <Icon.refresh size={17} />}
        </button>
        <button className="st-iconbtn" title="Home" onClick={() => actions.navigate('stage://newtab')}>
          <Icon.home size={17} />
        </button>
      </div>

      {find.open ? (
        <FindBar />
      ) : (
        <form className={`st-omni${focused ? ' is-focused' : ''}`} onSubmit={submit}>
          <span className="st-omni__security" title={internal ? 'Stage page' : secure ? 'Secure connection' : 'Site information'}>
            {internal ? <Logo size={15} radius={4} /> : secure ? <Icon.lock size={14} /> : <Icon.globe size={15} />}
          </span>
          <input
            ref={inputRef}
            className="st-omni__input"
            value={value}
            spellCheck={false}
            autoComplete="off"
            placeholder="Search the web or enter an address"
            onChange={(event) => setValue(event.target.value)}
            onFocus={(event) => {
              setFocused(true);
              event.currentTarget.select();
            }}
            onBlur={() => {
              setFocused(false);
              setValue(url);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setValue(url);
                event.currentTarget.blur();
              }
            }}
          />
          {!focused && url && (
            <span className="st-omni__hint" aria-hidden="true">
              {internal ? 'Stage' : secure ? 'Secure' : ''}
            </span>
          )}
        </form>
      )}

      <div className="st-address-actions" ref={actionsRef}>
        <button className="st-iconbtn st-zoomchip" title="Zoom" onClick={() => setZoomOpen((v) => !v)}>
          {Math.round(zoom * 100)}%
        </button>
        {zoomOpen && (
          <div className="st-popover st-zoompops">
            <div className="st-zoomrow">
              <button className="st-iconbtn" onClick={() => actions.zoomStep(-0.1)}>
                <Icon.minimize size={16} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button className="st-iconbtn" onClick={() => actions.zoomStep(0.1)}>
                <Icon.plus size={16} />
              </button>
            </div>
            <button
              className="st-menu__item"
              onClick={() => {
                void actions.resetZoom();
                setZoomOpen(false);
              }}
            >
              Reset for this site
            </button>
          </div>
        )}

        <button
          className={`st-iconbtn${inkOn ? ' is-on' : ''}`}
          title={inkOn ? 'Finish markup (Ctrl+Shift+M)' : 'Mark up this page (Ctrl+Shift+M)'}
          disabled={!url || internal}
          onClick={() => actions.toggleInk()}
        >
          <Icon.pen size={17} />
        </button>
        <button
          className="st-iconbtn"
          title="Reader view (Ctrl+Alt+R)"
          disabled={!url || internal}
          onClick={() => void actions.openReader()}
        >
          <Icon.reader size={17} />
        </button>
        <button
          className={`st-iconbtn${favorite ? ' is-on' : ''}`}
          title={favorite ? 'Remove favorite (Ctrl+D)' : 'Add favorite (Ctrl+D)'}
          disabled={!url || internal}
          onClick={() => actions.toggleFavorite()}
        >
          <Icon.star size={17} />
        </button>
        <button className="st-iconbtn" title="More" onClick={() => setMoreOpen((v) => !v)}>
          <Icon.more size={18} />
        </button>
        {moreOpen && (
          <div className="st-popover st-moremenu">
            <MenuItem icon={<Icon.download size={16} />} label="Downloads" shortcut="Ctrl+J" onClick={() => { actions.openStudyPanel('downloads'); setMoreOpen(false); }} />
            <MenuItem icon={<Icon.book size={16} />} label="Reading list" shortcut="Ctrl+Shift+D" onClick={() => { actions.openStudyPanel('reading'); setMoreOpen(false); }} />
            <MenuItem icon={<Icon.puzzle size={16} />} label="Extensions" shortcut="Ctrl+Shift+E" onClick={() => { actions.openStudyPanel('extensions'); setMoreOpen(false); }} />
            <div className="st-menu__sep" />
            <MenuItem icon={<Icon.print size={16} />} label="Save as PDF" shortcut="Ctrl+P" onClick={() => { void actions.printPdf(); setMoreOpen(false); }} />
            <MenuItem icon={<Icon.shot size={16} />} label="Screenshot" shortcut="Ctrl+Shift+S" onClick={() => { void actions.screenshot(true); setMoreOpen(false); }} />
            <MenuItem icon={<Icon.book size={16} />} label="Add to reading list" onClick={() => { void actions.addReading(); setMoreOpen(false); }} />
            <MenuItem icon={<Icon.pen size={16} />} label={inkOn ? 'Finish markup' : 'Mark up this page'} shortcut="Ctrl Shift M" onClick={() => { actions.toggleInk(); setMoreOpen(false); }} />
            <div className="st-menu__sep" />
            <MenuItem icon={<Icon.star size={16} />} label="Favorites" onClick={() => { actions.openInternal('favorites'); setMoreOpen(false); }} />
            <MenuItem icon={<Icon.history size={16} />} label="History" shortcut="Ctrl+H" onClick={() => { actions.openInternal('history'); setMoreOpen(false); }} />
            <MenuItem icon={<Icon.settings size={16} />} label="Settings" onClick={() => { actions.openSettings(); setMoreOpen(false); }} />
            <MenuItem icon={<Icon.command size={16} />} label="Command palette" shortcut="Ctrl+K" onClick={() => { actions.openPalette(); setMoreOpen(false); }} />
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Small menu item
 * ------------------------------------------------------------------ */

export const MenuItem: React.FC<{
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
}> = ({ icon, label, shortcut, danger, onClick }) => (
  <button className={`st-menu__item${danger ? ' is-danger' : ''}`} onClick={onClick}>
    <span className="st-menu__icon">{icon}</span>
    <span className="st-menu__label">{label}</span>
    {shortcut && <span className="st-menu__shortcut">{shortcut}</span>}
  </button>
);

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

export const Toasts: React.FC = () => {
  const toasts = useSel((s) => s.toasts);
  return (
    <div className="st-toasts" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`st-toast${toast.tone === 'error' ? ' is-error' : ''}`}
          onClick={() => actions.dismissToast(toast.id)}
        >
          <span className="st-toast__dot" />
          <span>{toast.message}</span>
        </button>
      ))}
    </div>
  );
};
