import React from 'react';
import { tabLabel, type TabState } from '../../shared/types';
import { actions } from '../state/actions';
import { useSel } from '../state/store';
import { Icon } from './Icons';
import { MenuItem, TabIcon } from './Chrome';

/**
 * Vertical tab rail.
 *
 * The rail is the only visible way to add a tab: the footer opens Settings,
 * where the Tabs section owns "New tab". Keyboard shortcuts still work for
 * people who live on the keyboard.
 */
export const TabSidebar: React.FC = () => {
  const tabs = useSel((s) => s.tabs);
  const activeId = useSel((s) => s.activeTabId);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [menu, setMenu] = React.useState<{ tab: TabState; x: number; y: number } | null>(null);

  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-vtab="${activeId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId]);

  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  return (
    <aside className="st-sidebar">
      <header className="st-sidebar__head">
        <div className="st-sidebar__title">
          <Icon.tabs size={15} />
          <span>Tabs</span>
          <span className="st-sidebar__count">{tabs.length}</span>
        </div>
        <button className="st-sidebar__action" title="Search tabs (Ctrl+Shift+A)" onClick={() => actions.openTabSearch()}>
          <Icon.search size={15} />
        </button>
      </header>

      <div className="st-sidebar__list" ref={listRef}>
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              data-vtab={tab.id}
              className={`st-vtab${active ? ' is-active' : ''}${tab.pinned ? ' is-pinned' : ''}`}
              draggable
              onDragStart={(event) => {
                setDragFrom(index);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', tab.id);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFrom !== null) actions.reorderTab(dragFrom, index);
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  actions.closeTab(tab.id);
                }
              }}
              onClick={() => actions.activateTab(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ tab, x: event.clientX, y: event.clientY });
              }}
              title={tabLabel(tab)}
            >
              <span className="st-vtab__icon">
                <TabIcon tab={tab} />
              </span>
              <span className="st-vtab__text">
                <span className="st-vtab__title">{tabLabel(tab)}</span>
                <span className="st-vtab__sub">{tabSubtitle(tab)}</span>
              </span>
              {tab.kind === 'web' && tab.audible && (
                <span className="st-vtab__audio" title={tab.muted ? 'Muted' : 'Playing'}>
                  {tab.muted ? <Icon.muted size={13} /> : <Icon.sound size={13} />}
                </span>
              )}
              {tab.pinned && (
                <span className="st-vtab__pin" title="Pinned">
                  <Icon.pin size={12} />
                </span>
              )}
              <button
                className="st-vtab__close"
                title="Close tab"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.closeTab(tab.id);
                }}
              >
                <Icon.close size={12} />
              </button>
            </div>
          );
        })}

        {tabs.length === 0 && (
          <div className="st-sidebar__empty">
            <p>One quiet page.</p>
            <span>Open a tab from Settings whenever you need another.</span>
          </div>
        )}
      </div>

      <footer className="st-sidebar__foot">
        <button className="st-sidebar__add" onClick={() => actions.openSettings()} title="Add a tab in Settings">
          <Icon.plus size={15} />
          <span>Add tab</span>
          <span className="st-sidebar__hint">Settings</span>
        </button>
        <p className="st-sidebar__note">Start each session with one tab. Turn on session restore in Settings.</p>
      </footer>

      {menu && <TabMenu tab={menu.tab} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </aside>
  );
};

function tabSubtitle(tab: TabState): string {
  if (tab.kind !== 'web') return 'Board';
  let url = tab.url;
  if (url.startsWith('stage://')) {
    const page = url.replace('stage://', '').split(/[/?#]/)[0];
    return page === 'newtab' ? 'New tab' : 'Stage page';
  }
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const TabMenu: React.FC<{ tab: TabState; x: number; y: number; onClose: () => void }> = ({ tab, x, y, onClose }) => (
  <div
    className="st-popover st-tabmenu"
    style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - 220) }}
    onPointerDown={(event) => event.stopPropagation()}
  >
    <MenuItem icon={<Icon.copy size={15} />} label="Duplicate" onClick={() => { actions.duplicateTab(tab.id); onClose(); }} />
    <MenuItem
      icon={<Icon.pin size={15} />}
      label={tab.pinned ? 'Unpin tab' : 'Pin tab'}
      onClick={() => {
        actions.pinTab(tab.id, !tab.pinned);
        onClose();
      }}
    />
    {tab.kind === 'web' && (
      <MenuItem
        icon={<Icon.muted size={15} />}
        label={tab.muted ? 'Unmute tab' : 'Mute tab'}
        onClick={() => {
          actions.muteTab(tab.id, !tab.muted);
          onClose();
        }}
      />
    )}
    <div className="st-menu__sep" />
    <MenuItem icon={<Icon.close size={15} />} label="Close tab" shortcut="Ctrl+W" onClick={() => { actions.closeTab(tab.id); onClose(); }} />
    <MenuItem label="Close other tabs" onClick={() => { actions.closeOthers(tab.id); onClose(); }} />
    <MenuItem label="Close tabs below" onClick={() => { actions.closeRight(tab.id); onClose(); }} />
  </div>
);
