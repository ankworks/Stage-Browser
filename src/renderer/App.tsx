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
 */

const App: React.FC = () => {
  const ready = useSel((s) => s.ready);
  const appearance = useSel((s) => s.settings.appearance);
  const background = useSel((s) => s.settings.newTabBackground);
  const customImage = useSel((s) => s.settings.customBackgroundImage);
  const customDim = useSel((s) => s.settings.customBackgroundDim ?? 0.35);
  const customBlur = useSel((s) => s.settings.customBackgroundBlur ?? 0);
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
    const rootStyle = document.documentElement.style;
    if (customImage) {
      rootStyle.setProperty('--newtab-custom-img', `url("${customImage}")`);
      rootStyle.setProperty('--newtab-custom-dim', String(customDim));
      rootStyle.setProperty('--newtab-custom-blur', `${customBlur}px`);
    } else {
      rootStyle.removeProperty('--newtab-custom-img');
      rootStyle.removeProperty('--newtab-custom-dim');
      rootStyle.removeProperty('--newtab-custom-blur');
    }
  }, [background, customImage, customDim, customBlur]);

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
