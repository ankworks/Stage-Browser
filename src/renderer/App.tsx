import React from 'react';
import type { WebTab } from '../shared/types';
import { AddressBar, TitleBar, Toasts } from './components/Chrome';
import { TabSidebar } from './components/TabSidebar';
import { CommandPalette } from './components/Palette';
import { InternalPage } from './components/Pages';
import { SettingsSheet } from './components/SettingsSheet';
import { Logo } from './components/Logo';
import { useShortcuts } from './hooks/useShortcuts';
import { ReaderView } from './study/ReaderView';
import { StudyLayer } from './study/StudyUI';
import { sel, useSel } from './state/store';

/**
 * Stage Browser shell.
 *
 *   titlebar (46)
 *   ┌──────────────┬──────────────────────────────┐
 *   │ tab rail 236 │ address (50)                 │   only with 2+ tabs
 *   │              ├──────────────────────────────┤
 *   │              │ native page view             │
 *   └──────────────┴──────────────────────────────┘
 *
 * One tab is the default, and a single tab has no rail: the page gets the full
 * window. The rail appears as soon as a second tab exists. Main owns the native
 * view bounds, so its `contentRect()` uses the exact same rule.
 *
 * Overlays are DOM, so while one is open main hides the native view and sends a
 * snapshot of the page back: the scrim still sits on something that looks like
 * the page instead of a blank rectangle.
 */

const App: React.FC = () => {
  const ready = useSel((s) => s.ready);
  const appearance = useSel((s) => s.settings.appearance);
  const background = useSel((s) => s.settings.newTabBackground);
  const tabCount = useSel((s) => s.tabs.length);
  const active = useSel(sel.activeTab);
  const rect = useSel((s) => s.contentRect);
  const pageShot = useSel((s) => s.pageShot);
  const overlayOpen = useSel(
    (s) => s.paletteOpen || s.settingsOpen || !!s.studyPanel || s.tabSearchOpen || !!s.pageMenu,
  );

  useShortcuts(ready);

  React.useEffect(() => {
    document.documentElement.dataset.theme = appearance === 'light' ? 'light' : 'dark';
    document.documentElement.style.colorScheme = appearance === 'light' ? 'light' : 'dark';
  }, [appearance]);

  React.useEffect(() => {
    document.documentElement.dataset.newtab = background || 'ink';
  }, [background]);

  React.useEffect(() => {
    void window.stage.window.obscure(overlayOpen);
  }, [overlayOpen]);

  React.useEffect(() => {
    const label = active
      ? active.kind === 'web'
        ? active.title || 'New Tab'
        : active.name
      : 'New Tab';
    document.title = `${label} · Stage Browser`;
  }, [active]);

  if (!ready) return <Boot />;

  const internal = active?.kind === 'web' && active.url.startsWith('stage://') ? active.url : null;
  const reader = internal && internal.startsWith('stage://reader');

  return (
    <div className="st-app" data-overlay={overlayOpen ? 'open' : 'closed'}>
      <TitleBar />
      <div className="st-shell">
        {tabCount > 1 && <TabSidebar />}
        <div className="st-main">
          <AddressBar />

          <main className="st-content">
            {reader ? (
              <ReaderView url={internal as string} />
            ) : internal ? (
              <InternalPage url={internal} />
            ) : active && active.kind === 'web' ? (
              <WebHost tab={active} />
            ) : (
              <InternalPage url="stage://newtab" />
            )}

            {overlayOpen && pageShot && (
              <img className="st-pageshot" src={pageShot} alt="" draggable={false} />
            )}
          </main>
        </div>
      </div>

      <StudyLayer rect={rect} />
      <SettingsSheet />
      <CommandPalette />
      <Toasts />
    </div>
  );
};

/** Placeholder under a live website tab; the native view paints on top. */
const WebHost: React.FC<{ tab: WebTab }> = ({ tab }) => (
  <div className="st-webhost" aria-hidden="true">
    <div className="st-webhost__glow" />
    <div className="st-webhost__mark">
      <Logo size={30} radius={9} />
      <span>{tab.title || 'Loading page'}</span>
    </div>
  </div>
);

const Boot: React.FC = () => (
  <div className="st-boot">
    <div className="st-boot__mark">
      <Logo size={52} radius={16} />
    </div>
    <p className="st-boot__name">Stage Browser</p>
    <div className="st-boot__bar">
      <span />
    </div>
  </div>
);

export default App;
