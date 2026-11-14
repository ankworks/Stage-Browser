import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Favorite, HistoryEntry, PageContextPayload, Settings, TabState } from '../shared/types';
import type { StageBootstrap } from '../shared/stage';
import App from './App';
import { actions } from './state/actions';
import { store } from './state/store';
import './styles/global.css';
import './styles/study.css';

/**
 * Renderer entry.
 *
 * One `getState()` round trip for the first paint, then everything arrives as
 * events. No polling, no per-frame IPC, no timers that keep the CPU warm.
 */

const api = window.stage;

void boot().catch((error) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="font:14px system-ui;color:#cfd6e4;padding:28px">Stage Browser could not start: ${String(error)}</div>`;
  }
});

async function boot(): Promise<void> {
  api.on.bootstrapState((payload) => store.hydrate(payload as StageBootstrap));

  api.on.tabs(({ order, activeId, changed }) => {
    store.set((s) => {
      const byId = new Map(s.tabs.map((tab) => [tab.id, tab] as const));
      for (const tab of changed as TabState[]) byId.set(tab.id, { ...(byId.get(tab.id) ?? {}), ...tab } as TabState);
      const tabs = order.map((id) => byId.get(id)).filter((tab): tab is TabState => !!tab);
      return { tabs, activeTabId: activeId };
    });
  });

  api.on.settings((settings) => {
    store.set({ settings });
  });

  api.on.favorites((favorites: Favorite[]) => store.set({ favorites }));
  api.on.history((history: HistoryEntry[]) => store.set({ history }));

  api.on.toast((toast) => {
    store.set((s) => ({ toasts: [...s.toasts, toast].slice(-3) }));
  });

  api.on.study((study) => {
    store.set((s) => ({
      downloads: study.downloads,
      readingList: study.readingList,
      extensions: study.extensions,
      find: s.find.open ? s.find : study.find,
    }));
  });
  api.on.find((find) => store.set((s) => ({ find: s.find.open ? { ...find, open: true } : find })));
  api.on.reading((readingList) => store.set({ readingList }));
  api.on.extensions((extensions) => store.set({ extensions }));

  api.on.pageMenu((payload: PageContextPayload) => store.set({ pageMenu: payload }));
  api.on.focusSearch(() => actions.focusAddress());
  api.on.accel((input) => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: input.key,
        ctrlKey: input.control,
        shiftKey: input.shift,
        altKey: input.alt,
        metaKey: input.meta,
        bubbles: true,
        cancelable: true,
      }),
    );
  });

  api.on.geom(({ rect, maximized }) => {
    store.set({ contentRect: rect, maximized });
  });
  api.on.pageShot((pageShot) => store.set({ pageShot }));
  api.on.ink((ink) => store.set({ ink }));

  const state = await api.getState();
  store.hydrate(state);
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
