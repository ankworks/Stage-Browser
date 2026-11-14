import React, { useSyncExternalStore } from 'react';
import type {
  DownloadEntry,
  ExtensionInfo,
  Favorite,
  FindState,
  HistoryEntry,
  PageContextPayload,
  ReadingEntry,
  Settings,
  StudyState,
  TabState,
  ToastMessage,
} from '../../shared/types';
import { tabLabel, isWebTab } from '../../shared/types';
import type { StageBootstrap } from '../../shared/stage';

/** Stage PREP store: one snapshot, subscribers, a selector hook. */

export interface ContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiState {
  ready: boolean;
  appName: string;
  version: string;
  dev: boolean;
  platform: string;

  settings: Settings;
  tabs: TabState[];
  activeTabId: string | null;
  favorites: Favorite[];
  history: HistoryEntry[];

  toasts: ToastMessage[];

  paletteOpen: boolean;
  settingsOpen: boolean;
  studyPanel: 'downloads' | 'reading' | 'extensions' | null;
  tabSearchOpen: boolean;
  pageMenu?: PageContextPayload;

  downloads: DownloadEntry[];
  readingList: ReadingEntry[];
  extensions: ExtensionInfo[];
  find: FindState;

  contentRect: ContentRect;
  pageShot: string | null;
  maximized: boolean;
  addressFocus: number;
  ink: { tabId: string | null; on: boolean };
}

const EMPTY_FIND: FindState = { open: false, query: '', matches: 0, activeMatch: 0, caseSensitive: false };

const initialState: UiState = {
  ready: false,
  appName: 'Stage Browser',
  version: '1.0.0',
  dev: false,
  platform: 'win32',
  settings: {} as Settings,
  tabs: [],
  activeTabId: null,
  favorites: [],
  history: [],
  toasts: [],
  paletteOpen: false,
  settingsOpen: false,
  studyPanel: null,
  tabSearchOpen: false,
  downloads: [],
  readingList: [],
  extensions: [],
  find: EMPTY_FIND,
  // Single-tab mode has no rail, so the page starts at x=0. Main sends the
  // real rect as soon as the second tab appears.
  contentRect: { x: 0, y: 96, width: 1320, height: 704 },
  pageShot: null,
  maximized: false,
  addressFocus: 0,
  ink: { tabId: null, on: false },
};

class Store {
  private state: UiState = initialState;
  private listeners = new Set<() => void>();

  getState = (): UiState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(patch: Partial<UiState> | ((s: UiState) => Partial<UiState>)): void {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    let changed = false;
    for (const key of Object.keys(next) as (keyof UiState)[]) {
      if (this.state[key] !== next[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }

  hydrate(bootstrap: StageBootstrap): void {
    this.state = {
      ...this.state,
      ready: true,
      appName: bootstrap.appName,
      version: bootstrap.version,
      dev: bootstrap.dev,
      platform: bootstrap.platform,
      settings: bootstrap.settings,
      tabs: bootstrap.tabs,
      activeTabId: bootstrap.activeTabId,
      favorites: bootstrap.favorites,
      history: bootstrap.history,
      downloads: bootstrap.study.downloads,
      readingList: bootstrap.study.readingList,
      extensions: bootstrap.study.extensions,
      find: bootstrap.study.find,
    };
    this.listeners.forEach((l) => l());
  }
}

export const store = new Store();

export function useSel<T>(selector: (s: UiState) => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const cache = React.useRef<{ state: UiState | null; value: T }>({ state: null, value: undefined as unknown as T });
  const selectorRef = React.useRef(selector);
  const equalRef = React.useRef(equal);
  selectorRef.current = selector;
  equalRef.current = equal;

  const getSnapshot = React.useCallback((): T => {
    const state = store.getState();
    const cached = cache.current;
    if (cached.state === state) return cached.value;
    const next = selectorRef.current(state);
    if (cached.state !== null && equalRef.current(cached.value, next)) {
      cache.current = { state, value: cached.value };
      return cached.value;
    }
    cache.current = { state, value: next };
    return next;
  }, []);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const key of ka) if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  return true;
}

export const sel = {
  activeTab: (s: UiState): TabState | null => s.tabs.find((t) => t.id === s.activeTabId) ?? null,
  activeWeb: (s: UiState) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return isWebTab(tab) ? tab : null;
  },
  activeUrl: (s: UiState): string => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab && tab.kind === 'web' ? tab.url : '';
  },
  internalPage: (s: UiState): string | null => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!isWebTab(tab)) return null;
    return tab.url.startsWith('stage://') ? tab.url : null;
  },
  tabTitles: (s: UiState) => s.tabs.map((tab) => ({ id: tab.id, label: tabLabel(tab), favicon: tab.kind === 'web' ? tab.favicon : undefined, kind: tab.kind })),
  favoriteForActive: (s: UiState): Favorite | null => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!tab || tab.kind !== 'web') return null;
    return s.favorites.find((f) => f.url === tab.url) ?? null;
  },
};

export { EMPTY_FIND };
