import React from 'react';
import { NEW_TAB_BACKGROUNDS, tabLabel } from '../../shared/types';
import { actions } from '../state/actions';
import { useSel } from '../state/store';
import { Icon } from './Icons';
import { Logo } from './Logo';
import { TabIcon } from './Chrome';

export const SettingsSheet: React.FC = () => {
  const open = useSel((s) => s.settingsOpen);
  if (!open) return null;
  return (
    <div className="st-sheet-scrim" onPointerDown={() => actions.closeSettings()}>
      <div className="st-settings" onPointerDown={(event) => event.stopPropagation()} role="dialog" aria-label="Settings">
        <header className="st-settings__head">
          <div>
            <p className="st-eyebrow">Stage Browser</p>
            <h1>Settings</h1>
          </div>
          <button className="st-iconbtn" onClick={() => actions.closeSettings()} title="Close">
            <Icon.close size={18} />
          </button>
        </header>
        <div className="st-settings__body">
          <TabsSection />
          <AppearanceSection />
          <ReadingSection />
          <StudySection />
          <AboutSection />
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="st-setting">
    <div className="st-setting__head">
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
    </div>
    <div className="st-setting__body">{children}</div>
  </section>
);

const TabsSection: React.FC = () => {
  const tabs = useSel((s) => s.tabs);
  const activeId = useSel((s) => s.activeTabId);
  const restoreSession = useSel((s) => s.settings.restoreSession);

  return (
    <Section title="Tabs" hint="One tab by default. The left rail appears only when you add a second one.">
      {tabs.length === 1 && (
        <div className="st-hintcard">
          <Icon.tabs size={16} />
          <span>Single-tab mode — the page uses the full window. Add a tab to show the rail.</span>
        </div>
      )}
      <div className="st-tabsettings">
        {tabs.map((tab) => (
          <div key={tab.id} className={`st-tabsetting${tab.id === activeId ? ' is-active' : ''}`}>
            <button
              className="st-tabsetting__main"
              onClick={() => {
                actions.activateTab(tab.id);
                actions.closeSettings();
              }}
              title={tabLabel(tab)}
            >
              <span className="st-tabsetting__icon">
                <TabIcon tab={tab} size={15} />
              </span>
              <span className="st-tabsetting__title">{tabLabel(tab)}</span>
              {tab.pinned && (
                <span className="st-tabsetting__pin" title="Pinned">
                  <Icon.pin size={11} />
                </span>
              )}
            </button>
            <button
              className="st-tabsetting__close"
              title="Close tab"
              onClick={() => actions.closeTab(tab.id)}
            >
              <Icon.close size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="st-setting__actions">
        <button
          className="st-btn st-btn--ghost"
          onClick={() => {
            actions.closeSettings();
            void actions.newTab();
          }}
        >
          <Icon.plus size={15} /> New tab
        </button>
        <button
          className="st-btn st-btn--ghost"
          onClick={() => {
            actions.closeSettings();
            actions.openTabSearch();
          }}
        >
          <Icon.tabs size={15} /> Search tabs
        </button>
      </div>

      <label className="st-check">
        <input
          type="checkbox"
          checked={!!restoreSession}
          onChange={(event) => void actions.setSettings({ restoreSession: event.target.checked })}
        />
        <span>
          <strong>Restore tabs on launch</strong>
          <small>Off by default. Each launch starts with one fresh tab.</small>
        </span>
      </label>
    </Section>
  );
};

const AppearanceSection: React.FC = () => {
  const appearance = useSel((s) => s.settings.appearance);
  const background = useSel((s) => s.settings.newTabBackground);
  const customImage = useSel((s) => s.settings.customBackgroundImage);
  const customDim = useSel((s) => s.settings.customBackgroundDim ?? 0.35);
  const customBlur = useSel((s) => s.settings.customBackgroundBlur ?? 0);

  return (
    <Section title="Appearance" hint="The whole browser, including the reader and overlays.">
      <div className="st-theme-cards">
        {(['dark', 'light'] as const).map((mode) => (
          <button
            key={mode}
            className={`st-theme-card st-theme-card--${mode}${appearance === mode ? ' is-active' : ''}`}
            onClick={() => actions.setAppearance(mode)}
          >
            <span className="st-theme-preview">
              <span className="st-theme-preview__chrome" />
              <span className="st-theme-preview__page" />
              <span className="st-theme-preview__line" />
              <span className="st-theme-preview__line st-theme-preview__line--short" />
            </span>
            <span className="st-theme-name">
              {mode === 'dark' ? <Icon.moon size={15} /> : <Icon.sun size={15} />}
              {mode === 'dark' ? 'Ink' : 'Paper'}
            </span>
            <span className="st-theme-sub">{mode === 'dark' ? 'Low light, late nights' : 'Warm, print-like paper'}</span>
          </button>
        ))}
      </div>

      <div className="st-setting__subhead">
        <h3>New tab background</h3>
        <p>The backdrop behind the search page and its cards.</p>
      </div>
      <div className="st-bggrid">
        {NEW_TAB_BACKGROUNDS.map((preset) => (
          <button
            key={preset.id}
            className={`st-bgcard${background === preset.id ? ' is-active' : ''}`}
            data-bg={preset.id}
            onClick={() => actions.setNewTabBackground(preset.id)}
            title={preset.note}
          >
            <span className="st-bgcard__swatch" />
            <span className="st-bgcard__name">{preset.label}</span>
          </button>
        ))}
      </div>

      <div className="st-custombg">
        <div className="st-custombg__row">
          <button className="st-btn st-btn--ghost" onClick={() => void actions.pickCustomBackground()}>
            <Icon.plus size={15} /> {customImage ? 'Change custom image' : 'Choose custom image…'}
          </button>
          {customImage && (
            <>
              <button
                className={`st-btn st-btn--ghost${background === 'custom' ? ' is-active-pill' : ''}`}
                onClick={() => actions.setNewTabBackground('custom')}
              >
                Use custom
              </button>
              <button className="st-btn st-btn--ghost" onClick={() => actions.clearCustomBackground()}>
                <Icon.trash size={14} /> Remove
              </button>
            </>
          )}
        </div>

        {customImage && (
          <div className="st-custombg__controls">
            <button
              className={`st-custombg__preview${background === 'custom' ? ' is-active' : ''}`}
              onClick={() => actions.setNewTabBackground('custom')}
              title="Click to apply custom wallpaper"
              style={{ backgroundImage: `url("${customImage}")` }}
            />
            <div className="st-slider">
              <div className="st-slider__label">
                <span>Backdrop dim</span>
                <span className="st-slider__value">{Math.round(customDim * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={85}
                step={5}
                value={Math.round(customDim * 100)}
                onChange={(event) => actions.setCustomBackgroundDim(Number(event.target.value) / 100)}
              />
            </div>
            <div className="st-slider">
              <div className="st-slider__label">
                <span>Backdrop blur</span>
                <span className="st-slider__value">{customBlur}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={customBlur}
                onChange={(event) => actions.setCustomBackgroundBlur(Number(event.target.value))}
              />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
};

const ReadingSection: React.FC = () => {
  const size = useSel((s) => s.settings.readerFontSize);
  return (
    <Section title="Reading" hint="Reader typography is set per device, not per site.">
      <div className="st-slider">
        <div className="st-slider__label">
          <span>Reader text size</span>
          <span className="st-slider__value">{size}px</span>
        </div>
        <input
          type="range"
          min={15}
          max={30}
          step={1}
          value={size}
          onChange={(event) => actions.setReaderFontSize(Number(event.target.value))}
        />
        <div className="st-reader-sample" style={{ fontSize: size }}>
          A quiet place for long arguments and slow paragraphs.
        </div>
      </div>
    </Section>
  );
};

const StudySection: React.FC = () => {
  const reading = useSel((s) => s.readingList);
  const downloads = useSel((s) => s.downloads);
  const history = useSel((s) => s.history);
  const extensions = useSel((s) => s.extensions);

  return (
    <Section title="Study data" hint="Everything is stored in this app's local profile.">
      <div className="st-statgrid">
        <div className="st-stat">
          <span>{reading.filter((r) => !r.doneAt).length}</span>
          <p>in the queue</p>
        </div>
        <div className="st-stat">
          <span>{downloads.filter((d) => d.state === 'completed').length}</span>
          <p>downloads finished</p>
        </div>
        <div className="st-stat">
          <span>{history.length}</span>
          <p>history entries</p>
        </div>
        <div className="st-stat">
          <span>{extensions.length}</span>
          <p>extensions</p>
        </div>
      </div>
      <div className="st-setting__actions">
        <button className="st-btn st-btn--ghost" onClick={() => actions.openStudyPanel('reading')}>
          <Icon.book size={15} /> Open reading list
        </button>
        <button className="st-btn st-btn--ghost" onClick={() => actions.openStudyPanel('extensions')}>
          <Icon.puzzle size={15} /> Extensions
        </button>
        <button className="st-btn st-btn--ghost" onClick={() => actions.clearHistory()}>
          <Icon.trash size={15} /> Clear history
        </button>
      </div>
    </Section>
  );
};

const AboutSection: React.FC = () => {
  const version = useSel((s) => s.version);
  return (
    <Section title="About">
      <div className="st-aboutrow">
        <Logo size={40} radius={12} />
        <div>
          <strong>Stage Browser</strong>
          <p>Version {version} · MIT · local-first</p>
        </div>
        <button className="st-btn st-btn--ghost" onClick={() => window.stage.openExternal('https://github.com/ankworks/Stage-Browser')}>
          <Icon.external size={14} /> Repository
        </button>
      </div>
      <p className="st-fineprint">
        Stage Browser is a study-first Chromium shell. It does not create an account, sync your pages, or send usage
        data anywhere. Extensions you load run inside the same isolated session as ordinary web pages.
      </p>
    </Section>
  );
};
