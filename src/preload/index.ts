import { contextBridge, ipcRenderer } from 'electron';
import { CH, EV } from '../shared/ipc';
import type { StageBootstrap } from '../shared/stage';
import type {
  DownloadEntry,
  ExtensionInfo,
  Favorite,
  FindState,
  HistoryEntry,
  PageContextPayload,
  ReaderArticle,
  ReadingEntry,
  Rect,
  Settings,
  AcceleratorInput,
  StudyState,
  ToastMessage,
} from '../shared/types';

/**
 * Stage Browser preload bridge.
 *
 * One role only: the browser shell. Website tabs get no preload, so a page can
 * never reach these channels.
 */

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>;

type Unsubscribe = () => void;

function on<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_event: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

export interface StageApi {
  getState: () => Promise<StageBootstrap>;
  setSettings: (patch: Partial<Settings>) => Promise<Settings>;
  pickBackground: () => Promise<Settings | null>;
  quit: () => void;
  clipboardWrite: (text: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;

  window: {
    minimize: () => void;
    toggleMaximize: () => Promise<boolean>;
    close: () => void;
    obscure: (on: boolean) => Promise<boolean>;
    focusPage: () => Promise<boolean>;
  };

  tabs: {
    create: (opts?: { url?: string; background?: boolean }) => Promise<string>;
    close: (id: string) => void;
    closeOthers: (id: string) => void;
    closeRight: (id: string) => void;
    activate: (id: string) => void;
    reopen: () => Promise<{ kind: string; id: string } | null>;
    reorder: (from: number, to: number) => void;
    duplicate: (id: string) => void;
    pin: (id: string, pinned: boolean) => void;
    mute: (id: string, muted: boolean) => void;
    navigate: (id: string, url: string) => Promise<boolean>;
    back: (id: string) => void;
    forward: (id: string) => void;
    reload: (id: string) => void;
    hardReload: (id: string) => void;
    stop: (id: string) => void;
    setZoom: (id: string, factor: number) => void;
  };

  ink: {
    set: (on: boolean) => Promise<boolean>;
    get: () => Promise<boolean>;
  };

  favorites: {
    list: () => Promise<Favorite[]>;
    add: (payload: { url: string; title?: string; favicon?: string }) => Promise<Favorite[]>;
    remove: (id: string) => Promise<Favorite[]>;
    rename: (id: string, title: string) => Promise<Favorite[]>;
  };

  history: {
    list: () => Promise<HistoryEntry[]>;
    clear: () => Promise<boolean>;
    remove: (id: string) => Promise<boolean>;
  };

  study: {
    state: () => Promise<StudyState>;
    find: (payload: { query: string; forward?: boolean; findNext?: boolean; caseSensitive?: boolean }) => Promise<FindState>;
    findStep: (payload: { forward?: boolean; findNext?: boolean }) => Promise<FindState>;
    findStop: () => Promise<FindState>;
    downloads: () => Promise<DownloadEntry[]>;
    downloadCmd: (payload: { id: string; cmd: string }) => Promise<boolean>;
    clearDownloads: () => Promise<boolean>;
    setZoom: (factor: number) => Promise<number>;
    resetZoom: () => Promise<number>;
    printPdf: () => Promise<string | null>;
    reader: (tabId?: string) => Promise<ReaderArticle | null>;
    getReader: (id: string) => Promise<ReaderArticle | null>;
    readingList: () => Promise<ReadingEntry[]>;
    readingAdd: (payload?: { url?: string; title?: string; favicon?: string }) => Promise<ReadingEntry[]>;
    readingCmd: (payload: { id: string; cmd: string; note?: string }) => Promise<ReadingEntry[]>;
    extensions: () => Promise<ExtensionInfo[]>;
    extensionAdd: () => Promise<ExtensionInfo[]>;
    extensionCmd: (payload: { id?: string; path?: string; cmd: string }) => Promise<ExtensionInfo[]>;
    extensionOpen: (id: string) => Promise<boolean>;
    pageAction: (payload: {
      action: string;
      tabId?: string;
      linkURL?: string;
      srcURL?: string;
      selectionText?: string;
      x?: number;
      y?: number;
    }) => Promise<boolean>;
    screenshot: (save?: boolean) => Promise<{ ok: boolean; path?: string }>;
  };

  on: {
    bootstrapState: (cb: (payload: StageBootstrap) => void) => Unsubscribe;
    tabs: (cb: (payload: { order: string[]; activeId: string | null; changed: unknown[] }) => void) => Unsubscribe;
    settings: (cb: (payload: Settings) => void) => Unsubscribe;
    favorites: (cb: (payload: Favorite[]) => void) => Unsubscribe;
    history: (cb: (payload: HistoryEntry[]) => void) => Unsubscribe;
    toast: (cb: (payload: ToastMessage) => void) => Unsubscribe;
    study: (cb: (payload: StudyState) => void) => Unsubscribe;
    find: (cb: (payload: FindState) => void) => Unsubscribe;
    reading: (cb: (payload: ReadingEntry[]) => void) => Unsubscribe;
    extensions: (cb: (payload: ExtensionInfo[]) => void) => Unsubscribe;
    pageMenu: (cb: (payload: PageContextPayload) => void) => Unsubscribe;
    focusSearch: (cb: () => void) => Unsubscribe;
    geom: (cb: (payload: { rect: Rect; maximized: boolean }) => void) => Unsubscribe;
    pageShot: (cb: (dataUrl: string | null) => void) => Unsubscribe;
    accel: (cb: (input: AcceleratorInput) => void) => Unsubscribe;
    ink: (cb: (payload: { tabId: string | null; on: boolean }) => void) => Unsubscribe;
  };
}

const api: StageApi = {
  getState: () => invoke<StageBootstrap>(CH.APP_STATE),
  setSettings: (patch) => invoke<Settings>(CH.APP_SET_SETTINGS, patch),
  pickBackground: () => invoke<Settings | null>(CH.APP_PICK_BACKGROUND),
  quit: () => void invoke<void>(CH.APP_QUIT),
  clipboardWrite: (text) => invoke<boolean>(CH.CLIPBOARD_WRITE, text),
  openExternal: (url) => invoke<boolean>(CH.SHELL_OPEN_EXTERNAL, url),

  window: {
    minimize: () => void invoke<void>(CH.WIN_MINIMIZE),
    toggleMaximize: () => invoke<boolean>(CH.WIN_TOGGLE_MAXIMIZE),
    close: () => void invoke<void>(CH.WIN_CLOSE),
    obscure: (state) => invoke<boolean>(CH.WIN_OBSCURE, state),
    focusPage: () => invoke<boolean>(CH.WIN_FOCUS_PAGE),
  },

  tabs: {
    create: (opts = {}) => invoke<string>(CH.TAB_NEW, opts),
    close: (id) => void invoke<void>(CH.TAB_CLOSE, id),
    closeOthers: (id) => void invoke<void>(CH.TAB_CLOSE_OTHERS, id),
    closeRight: (id) => void invoke<void>(CH.TAB_CLOSE_RIGHT, id),
    activate: (id) => void invoke<void>(CH.TAB_ACTIVATE, id),
    reopen: () => invoke<{ kind: string; id: string } | null>(CH.TAB_REOPEN),
    reorder: (from, to) => void invoke<void>(CH.TAB_REORDER, from, to),
    duplicate: (id) => void invoke<void>(CH.TAB_DUPLICATE, id),
    pin: (id, pinned) => void invoke<void>(CH.TAB_PIN, id, pinned),
    mute: (id, muted) => void invoke<void>(CH.TAB_MUTE, id, muted),
    navigate: (id, url) => invoke<boolean>(CH.TAB_NAVIGATE, id, url),
    back: (id) => void invoke<void>(CH.TAB_BACK, id),
    forward: (id) => void invoke<void>(CH.TAB_FORWARD, id),
    reload: (id) => void invoke<void>(CH.TAB_RELOAD, id),
    hardReload: (id) => void invoke<void>(CH.TAB_HARD_RELOAD, id),
    stop: (id) => void invoke<void>(CH.TAB_STOP, id),
    setZoom: (id, factor) => void invoke<void>(CH.TAB_ZOOM, id, factor),
  },

  ink: {
    set: (on) => invoke<boolean>(CH.INK_SET, on),
    get: () => invoke<boolean>(CH.INK_GET),
  },

  favorites: {
    list: () => invoke<Favorite[]>(CH.FAV_LIST),
    add: (payload) => invoke<Favorite[]>(CH.FAV_ADD, payload),
    remove: (id) => invoke<Favorite[]>(CH.FAV_REMOVE, id),
    rename: (id, title) => invoke<Favorite[]>(CH.FAV_RENAME, { id, title }),
  },

  history: {
    list: () => invoke<HistoryEntry[]>(CH.HIST_LIST),
    clear: () => invoke<boolean>(CH.HIST_CLEAR),
    remove: (id) => invoke<boolean>(CH.HIST_REMOVE, id),
  },

  study: {
    state: () => invoke<StudyState>(CH.STUDY_STATE),
    find: (payload) => invoke<FindState>(CH.STUDY_FIND, payload),
    findStep: (payload) => invoke<FindState>(CH.STUDY_FIND_STEP, payload),
    findStop: () => invoke<FindState>(CH.STUDY_FIND_STOP),
    downloads: () => invoke<DownloadEntry[]>(CH.STUDY_DOWNLOADS),
    downloadCmd: (payload) => invoke<boolean>(CH.STUDY_DOWNLOAD_CMD, payload),
    clearDownloads: () => invoke<boolean>(CH.STUDY_DOWNLOAD_CLEAR),
    setZoom: (factor) => invoke<number>(CH.STUDY_ZOOM_SET, factor),
    resetZoom: () => invoke<number>(CH.STUDY_ZOOM_RESET),
    printPdf: () => invoke<string | null>(CH.STUDY_PRINT_PDF),
    reader: (tabId) => invoke<ReaderArticle | null>(CH.STUDY_READER, tabId),
    getReader: (id) => invoke<ReaderArticle | null>(CH.STUDY_READER_GET, id),
    readingList: () => invoke<ReadingEntry[]>(CH.STUDY_READING_LIST),
    readingAdd: (payload = {}) => invoke<ReadingEntry[]>(CH.STUDY_READING_ADD, payload),
    readingCmd: (payload) => invoke<ReadingEntry[]>(CH.STUDY_READING_CMD, payload),
    extensions: () => invoke<ExtensionInfo[]>(CH.STUDY_EXTENSIONS),
    extensionAdd: () => invoke<ExtensionInfo[]>(CH.STUDY_EXTENSION_ADD),
    extensionCmd: (payload) => invoke<ExtensionInfo[]>(CH.STUDY_EXTENSION_CMD, payload),
    extensionOpen: (id) => invoke<boolean>(CH.STUDY_EXTENSION_OPEN, id),
    pageAction: (payload) => invoke<boolean>(CH.STUDY_PAGE_ACTION, payload),
    screenshot: (save = false) => invoke<{ ok: boolean; path?: string }>(CH.STUDY_SCREENSHOT, save),
  },

  on: {
    bootstrapState: (cb) => on<StageBootstrap>(EV.STATE, cb),
    tabs: (cb) => on(EV.TABS, cb),
    settings: (cb) => on<Settings>(EV.SETTINGS, cb),
    favorites: (cb) => on<Favorite[]>(EV.FAVORITES, cb),
    history: (cb) => on<HistoryEntry[]>(EV.HISTORY, cb),
    toast: (cb) => on<ToastMessage>(EV.TOAST, cb),
    study: (cb) => on<StudyState>(EV.STUDY, cb),
    find: (cb) => on<FindState>(EV.FIND, cb),
    reading: (cb) => on<ReadingEntry[]>(EV.READING, cb),
    extensions: (cb) => on<ExtensionInfo[]>(EV.EXTENSIONS, cb),
    pageMenu: (cb) => on<PageContextPayload>(EV.PAGE_MENU, cb),
    focusSearch: (cb) => on<void>(EV.FOCUS_SEARCH, () => cb()),
    geom: (cb) => on(EV.GEOM, cb),
    pageShot: (cb) => on<string | null>(EV.SHOT, cb),
    accel: (cb) => on<AcceleratorInput>(EV.ACCEL, cb),
    ink: (cb) => on<{ tabId: string | null; on: boolean }>(EV.INK, cb),
  },
};

contextBridge.exposeInMainWorld('stage', api);
