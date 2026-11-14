/**
 * Stage Browser — main process.
 *
 * One frameless window, one native page view per active tab, and the study
 * service on the side. No audience window, no scenes, no presentation state:
 * the browser is the product.
 */

import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  session,
  shell,
  type IpcMainInvokeEvent,
  type Session,
} from 'electron';
import path from 'node:path';
import { CH, EV } from '../shared/ipc';
import type { Favorite, HistoryEntry, Settings, TabState } from '../shared/types';
import { APP_NAME, DEFAULT_SETTINGS, SCHEMA_VERSION } from '../shared/types';
import type { TabList } from '../shared/tabs';
import { isInternalPage } from '../shared/url';
import type { StageBootstrap } from '../shared/stage';
import { flushAllSync, loadState, setState } from './persistence';
import { devServerUrl } from './paths';
import { StudyService } from './study';
import { TabManager } from './tabs';

/** Width of the vertical tab rail on the left of the window. */
export const SIDEBAR_WIDTH = 236;
/** Height of the renderer chrome above the native page view (46 + 50). */
export const CHROME_TOP = 96;

interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

export class StageApp {
  private win: BrowserWindow | null = null;
  private tabs!: TabManager;
  private study!: StudyService;
  private appSession: Session | null = null;
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private favorites: Favorite[] = [];
  private history: HistoryEntry[] = [];
  private obscured = false;
  private focusKey: string | null = null;
  private restoredBounds: WindowBounds | null = null;

  async start(): Promise<void> {
    app.setName(APP_NAME);
    this.appSession = this.createSession();
    this.loadPersisted();
    this.createWindow();

    this.tabs = new TabManager(this.appSession, {
      onChanged: (changed, structure) => {
        void structure;
        this.send(EV.TABS, {
          order: this.tabs.tabs.map((t) => t.id),
          activeId: this.tabs.list.activeId,
          changed,
        });
        this.routeViews();
      },
      onVisited: (entry) => this.recordVisit(entry.url, entry.title),
      onViewsChanged: () => this.routeViews(),
      onToast: (message, tone) => this.toast(message, tone),
      onContextMenu: (payload) => this.study.pageMenu(payload),
      onAccelerator: (input) => {
        this.win?.webContents.focus();
        this.send(EV.ACCEL, input);
      },
    });

    this.study = new StudyService({
      session: () => this.appSession,
      activeTabId: () => this.tabs.list.activeId,
      activeWebContents: () => this.tabs.activeWebContents(),
      webContentsFor: (tabId) => this.tabs.webContentsOf(tabId),
      openTab: (url, background) => this.tabs.create({ url, background }).id,
      activateTab: (tabId) => this.tabs.activate(tabId),
      renameTab: (tabId, title) => this.tabs.renameTab(tabId, title),
      shellWindow: () => this.win,
      send: (channel, payload) => this.send(channel, payload),
      toast: (message, tone) => this.toast(message, tone),
      settings: () => this.settings,
      patchSettings: (patch) => this.setSettings(patch),
    });
    this.tabs.siteZoom = (url) => this.study.zoomFor(url);
    this.study.attach();

    this.registerIpc();
    this.wireWindow();
    // One quiet tab by default. Session restore is an explicit opt-in because
    // the product starts as a single-page study space, not a tab archive.
    const savedTabs = loadState<TabList>('tabs', { tabs: [], activeId: null, closed: [] });
    this.tabs.restore(this.settings.restoreSession ? savedTabs : { tabs: [], activeId: null, closed: [] });
    this.tabs.startSweeper(() => this.tabs.list.activeId);
    this.routeViews();
    this.sendBootstrap();
  }

  dispose(): void {
    this.saveSession();
    this.tabs?.dispose();
    flushAllSync();
  }

  /* ------------------------------------------------------------------ *
   * Session + window
   * ------------------------------------------------------------------ */

  private createSession(): Session {
    const ses = session.fromPartition('persist:stage');
    const ua = ses.getUserAgent().replace(/\sElectron\/[\d.]+/, '');
    ses.setUserAgent(ua);
    ses.setSpellCheckerEnabled(true);
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      // A study browser does not need cameras or notifications to read a paper.
      const allowed = permission === 'fullscreen' || permission === 'clipboard-sanitized-write';
      callback(allowed);
    });
    ses.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');
    return ses;
  }

  private createWindow(): void {
    const bounds = loadState<WindowBounds>('window', { width: 1320, height: 860 });
    this.restoredBounds = bounds;
    this.win = new BrowserWindow({
      width: Math.max(900, bounds.width || 1320),
      height: Math.max(600, bounds.height || 860),
      x: bounds.x,
      y: bounds.y,
      minWidth: 900,
      minHeight: 600,
      frame: false,
      show: false,
      backgroundColor: '#0b0d12',
      title: APP_NAME,
      trafficLightPosition: { x: 12, y: 14 },
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
        spellcheck: false,
      },
    });
    this.win.setMenuBarVisibility(false);
    if (bounds.maximized) this.win.maximize();

    const dev = devServerUrl();
    if (dev) void this.win.loadURL(`${dev}/index.html`);
    else void this.win.loadFile(path.join(__dirname, '../renderer/index.html'));

    this.win.once('ready-to-show', () => this.win?.show());
    this.win.on('resize', () => this.routeViews());
    this.win.on('maximize', () => this.send(EV.GEOM, { rect: this.contentRect(), maximized: true }));
    this.win.on('unmaximize', () => this.send(EV.GEOM, { rect: this.contentRect(), maximized: false }));
    this.win.on('closed', () => {
      this.win = null;
    });

    const wc = this.win.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url) || isInternalPage(url)) {
        this.tabs.create({ url, background: true });
      }
      return { action: 'deny' };
    });
    wc.on('will-navigate', (event, url) => {
      if (url.startsWith('file:') || url.startsWith('http://localhost:5173')) return;
      event.preventDefault();
    });
  }

  private wireWindow(): void {
    // Re-send geometry once the renderer has mounted (the first send can land
    // before React subscribes).
    setTimeout(() => this.send(EV.GEOM, { rect: this.contentRect(), maximized: !!this.win?.isMaximized() }), 250);
  }

  private contentRect() {
    const [width, height] = this.win?.getContentSize() ?? [1280, 800];
    return {
      x: SIDEBAR_WIDTH,
      y: CHROME_TOP,
      width: Math.max(200, width - SIDEBAR_WIDTH),
      height: Math.max(150, height - CHROME_TOP),
    };
  }

  /** Place every native page view; only the active tab is visible. */
  private routeViews(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const active = this.tabs?.active();
    const rect = this.contentRect();
    for (const { tab, view } of this.tabs.webTabs()) {
      if (!view) continue;
      if (!win.contentView.children.includes(view)) win.contentView.addChildView(view);
      const visible = !this.obscured && !!active && tab.id === active.id;
      if (visible) view.setBounds(rect);
      view.setVisible(visible);
    }

    // Move keyboard focus with the active surface: a website takes typing, an
    // internal page leaves it with the shell. Keyed by id + kind so an address
    // change from web to `stage://` also moves focus.
    const domSurface = !active || active.kind === 'whiteboard' || (active.kind === 'web' && isInternalPage(active.url));
    const focusKey = active ? `${active.id}:${domSurface ? 'dom' : 'web'}` : 'none';
    if (!this.obscured && this.focusKey !== focusKey) {
      this.focusKey = focusKey;
      if (domSurface) win.webContents.focus();
      else if (active) this.tabs.view(active.id)?.webContents.focus();
    }

    this.send(EV.GEOM, { rect, maximized: win.isMaximized() });
  }

  /* ------------------------------------------------------------------ *
   * Persistence
   * ------------------------------------------------------------------ */

  private loadPersisted(): void {
    this.settings = sanitizeSettings(loadState<Partial<Settings>>('settings', {}));
    this.favorites = loadState<Favorite[]>('favorites', []);
    this.history = loadState<HistoryEntry[]>('history', []);
  }

  saveSession(): void {
    if (!this.win) return;
    setState('settings', this.settings);
    setState('favorites', this.favorites);
    setState('history', this.history.slice(0, 300));
    setState('tabs', this.tabs?.list ?? { tabs: [], activeId: null, closed: [] });
    const b = this.win.getBounds();
    setState<WindowBounds>('window', {
      width: b.width,
      height: b.height,
      x: b.x,
      y: b.y,
      maximized: this.win.isMaximized(),
    });
    flushAllSync();
  }

  /* ------------------------------------------------------------------ *
   * IPC plumbing
   * ------------------------------------------------------------------ */

  private send(channel: string, payload?: unknown): void {
    const wc = this.win?.webContents;
    if (wc && !wc.isDestroyed()) wc.send(channel, payload);
  }

  private toast(message: string, tone: 'info' | 'error' = 'info'): void {
    this.send(EV.TOAST, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, message, tone, at: Date.now() });
  }

  private trusted(event: IpcMainInvokeEvent): boolean {
    return !!this.win && !this.win.isDestroyed() && event.sender === this.win.webContents;
  }

  private ipc<T>(channel: string, fn: (...args: never[]) => T | Promise<T>): void {
    ipcMain.handle(channel, (event, ...args) => {
      if (!this.trusted(event)) return null;
      return fn(...(args as never[]));
    });
  }

  private registerIpc(): void {
    this.ipc(CH.APP_STATE, () => this.bootstrap());
    this.ipc(CH.APP_SET_SETTINGS, (patch: unknown) => this.setSettings((patch ?? {}) as Partial<Settings>));
    this.ipc(CH.APP_QUIT, () => {
      this.saveSession();
      app.quit();
    });
    this.ipc(CH.WIN_MINIMIZE, () => this.win?.minimize());
    this.ipc(CH.WIN_TOGGLE_MAXIMIZE, () => {
      if (!this.win) return false;
      if (this.win.isMaximized()) this.win.unmaximize();
      else this.win.maximize();
      return this.win.isMaximized();
    });
    this.ipc(CH.WIN_CLOSE, () => this.win?.close());
    this.ipc(CH.WIN_FOCUS_PAGE, () => {
      const active = this.tabs?.active();
      if (active?.kind === 'web' && !isInternalPage(active.url)) this.tabs.view(active.id)?.webContents.focus();
      return true;
    });

    this.ipc(CH.WIN_OBSCURE, (on: unknown) => {
      const next = !!on;
      if (next === this.obscured) return this.obscured;
      this.obscured = next;
      if (next) this.win?.webContents.focus();
      this.routeViews();
      if (next) this.captureOverlayBackdrop();
      else {
        this.focusKey = null;
        this.routeViews();
        this.send(EV.SHOT, null);
      }
      return this.obscured;
    });

    /* tabs */
    this.ipc(CH.TAB_NEW, (opts: unknown) => {
      const o = (opts ?? {}) as { url?: string; background?: boolean };
      const url = typeof o.url === 'string' && o.url ? o.url : 'stage://newtab';
      return this.tabs.create({ url, background: !!o.background }).id;
    });
    this.ipc(CH.TAB_CLOSE, (id: unknown) => this.tabs.close(String(id ?? '')));
    this.ipc(CH.TAB_CLOSE_OTHERS, (id: unknown) => this.tabs.closeOthers(String(id ?? '')));
    this.ipc(CH.TAB_CLOSE_RIGHT, (id: unknown) => this.tabs.closeRight(String(id ?? '')));
    this.ipc(CH.TAB_ACTIVATE, (id: unknown) => this.tabs.activate(String(id ?? '')));
    this.ipc(CH.TAB_REOPEN, () => {
      const tab = this.tabs.reopen();
      return tab ? { kind: tab.kind, id: tab.id } : null;
    });
    this.ipc(CH.TAB_REORDER, (from: unknown, to: unknown) => this.tabs.reorder(Number(from), Number(to)));
    this.ipc(CH.TAB_DUPLICATE, (id: unknown) => this.tabs.duplicate(String(id ?? '')));
    this.ipc(CH.TAB_PIN, (id: unknown, pinned: unknown) => this.tabs.pin(String(id ?? ''), !!pinned));
    this.ipc(CH.TAB_MUTE, (id: unknown, muted: unknown) => this.tabs.mute(String(id ?? ''), !!muted));
    this.ipc(CH.TAB_NAVIGATE, (id: unknown, url: unknown) => this.tabs.navigate(String(id ?? ''), String(url ?? '')));
    this.ipc(CH.TAB_BACK, (id: unknown) => this.tabs.back(String(id ?? '')));
    this.ipc(CH.TAB_FORWARD, (id: unknown) => this.tabs.forward(String(id ?? '')));
    this.ipc(CH.TAB_RELOAD, (id: unknown) => this.tabs.reload(String(id ?? ''), false));
    this.ipc(CH.TAB_HARD_RELOAD, (id: unknown) => this.tabs.reload(String(id ?? ''), true));
    this.ipc(CH.TAB_STOP, (id: unknown) => this.tabs.stop(String(id ?? '')));
    this.ipc(CH.TAB_ZOOM, (id: unknown, factor: unknown) => this.tabs.setZoom(String(id ?? ''), Number(factor)));

    /* favorites */
    this.ipc(CH.FAV_LIST, () => this.favorites);
    this.ipc(CH.FAV_ADD, (payload: unknown) => {
      const p = (payload ?? {}) as { url?: string; title?: string; favicon?: string };
      const url = typeof p.url === 'string' ? p.url : '';
      if (!url || isInternalPage(url)) return this.favorites;
      const favorite: Favorite = {
        id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        url,
        title: (p.title || url).slice(0, 140),
        favicon: typeof p.favicon === 'string' ? p.favicon : undefined,
        addedAt: Date.now(),
      };
      this.favorites = [favorite, ...this.favorites.filter((f) => f.url !== url)].slice(0, 300);
      setState('favorites', this.favorites);
      this.send(EV.FAVORITES, this.favorites);
      return this.favorites;
    });
    this.ipc(CH.FAV_REMOVE, (id: unknown) => {
      this.favorites = this.favorites.filter((f) => f.id !== String(id ?? ''));
      setState('favorites', this.favorites);
      this.send(EV.FAVORITES, this.favorites);
      return this.favorites;
    });
    this.ipc(CH.FAV_RENAME, (payload: unknown) => {
      const p = (payload ?? {}) as { id?: string; title?: string };
      this.favorites = this.favorites.map((f) => (f.id === p.id ? { ...f, title: String(p.title ?? f.title).slice(0, 140) } : f));
      setState('favorites', this.favorites);
      this.send(EV.FAVORITES, this.favorites);
      return this.favorites;
    });

    /* history */
    this.ipc(CH.HIST_LIST, () => this.history.slice(0, 400));
    this.ipc(CH.HIST_CLEAR, () => {
      this.history = [];
      setState('history', []);
      this.send(EV.HISTORY, []);
      return true;
    });
    this.ipc(CH.HIST_REMOVE, (id: unknown) => {
      this.history = this.history.filter((h) => h.id !== String(id ?? ''));
      setState('history', this.history.slice(0, 300));
      this.send(EV.HISTORY, this.history.slice(0, 300));
      return true;
    });

    /* shell */
    this.ipc(CH.CLIPBOARD_WRITE, (text: unknown) => {
      clipboard.writeText(String(text ?? '').slice(0, 500_000));
      return true;
    });
    this.ipc(CH.SHELL_OPEN_EXTERNAL, (url: unknown) => {
      const target = String(url ?? '');
      if (!/^https?:\/\//i.test(target)) return false;
      void shell.openExternal(target);
      return true;
    });

    /* study */
    this.ipc(CH.STUDY_STATE, () => this.study.state());
    this.ipc(CH.STUDY_FIND, (payload: unknown) => this.study.findInPage(payload));
    this.ipc(CH.STUDY_FIND_STEP, (payload: unknown) => this.study.findStep(payload));
    this.ipc(CH.STUDY_FIND_STOP, () => this.study.stopFind());
    this.ipc(CH.STUDY_DOWNLOADS, () => this.study.state().downloads);
    this.ipc(CH.STUDY_DOWNLOAD_CMD, (payload: unknown) => this.study.downloadCmd(payload));
    this.ipc(CH.STUDY_DOWNLOAD_CLEAR, () => this.study.clearDownloads());
    this.ipc(CH.STUDY_ZOOM_SET, (factor: unknown) => this.study.setZoom(Number(factor) || 1));
    this.ipc(CH.STUDY_ZOOM_RESET, () => this.study.resetZoom());
    this.ipc(CH.STUDY_PRINT_PDF, () => this.study.printPdf());
    this.ipc(CH.STUDY_READER, (tabId: unknown) => this.study.reader(typeof tabId === 'string' ? tabId : undefined));
    this.ipc(CH.STUDY_READER_GET, (id: unknown) => this.study.getReader(String(id ?? '')));
    this.ipc(CH.STUDY_READING_LIST, () => this.study.readingAll());
    this.ipc(CH.STUDY_READING_ADD, (payload: unknown) => this.study.addReading(payload));
    this.ipc(CH.STUDY_READING_CMD, (payload: unknown) => this.study.readingCmd(payload));
    this.ipc(CH.STUDY_EXTENSIONS, () => this.study.refreshExtensions());
    this.ipc(CH.STUDY_EXTENSION_ADD, () => this.study.addExtension());
    this.ipc(CH.STUDY_EXTENSION_CMD, (payload: unknown) => this.study.extensionCmd(payload));
    this.ipc(CH.STUDY_EXTENSION_OPEN, (id: unknown) => {
      const ext = this.study.extensions.find((x) => x.id === String(id ?? ''));
      if (!ext) return false;
      this.tabs.create({ url: `chrome-extension://${ext.id}/` });
      return true;
    });
    this.ipc(CH.STUDY_PAGE_ACTION, (payload: unknown) => this.study.pageAction(payload));
    this.ipc(CH.STUDY_SCREENSHOT, (save: unknown) => this.study.screenshot(!!save));
  }

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  private bootstrap(): StageBootstrap {
    return {
      appName: APP_NAME,
      version: app.getVersion(),
      dev: !app.isPackaged,
      platform: process.platform,
      settings: this.settings,
      tabs: this.tabs.tabs,
      activeTabId: this.tabs.list.activeId,
      favorites: this.favorites,
      history: this.history.slice(0, 400),
      study: this.study.state(),
    };
  }

  private sendBootstrap(): void {
    const ready = () => this.send(EV.STATE, this.bootstrap());
    const wc = this.win?.webContents;
    if (!wc) return;
    if (wc.isLoading()) wc.once('did-finish-load', ready);
    else ready();
  }

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    if (patch.zoom !== undefined) this.tabs.applyZoomAll(this.settings.zoom);
    if (patch.zoom !== undefined || patch.siteZoom !== undefined) this.tabs.applySiteZoom();
    setState('settings', this.settings);
    this.send(EV.SETTINGS, this.settings);
    return this.settings;
  }

  /** Snapshot the page so overlays keep the page visible while the native view is hidden. */
  private captureOverlayBackdrop(): void {
    const wc = this.tabs?.activeWebContents();
    if (!wc || wc.isDestroyed()) {
      this.send(EV.SHOT, null);
      return;
    }
    void wc
      .capturePage()
      .then((image) => {
        if (!this.obscured) return;
        this.send(EV.SHOT, image.isEmpty() ? null : image.toDataURL());
      })
      .catch(() => this.send(EV.SHOT, null));
  }

  private recordVisit(url: string, title: string): void {
    if (!url || isInternalPage(url)) return;
    const last = this.history[0];
    if (last && last.url === url && Date.now() - last.visitedAt < 3000) {
      last.title = title;
      last.visitedAt = Date.now();
    } else {
      this.history.unshift({
        id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        url,
        title: title || url,
        visitedAt: Date.now(),
      });
      if (this.history.length > 500) this.history.length = 500;
    }
    setState('history', this.history.slice(0, 300));
    this.send(EV.HISTORY, this.history.slice(0, 300));
  }
}

/* ------------------------------------------------------------------ *
 * Sanitizers
 * ------------------------------------------------------------------ */

function sanitizeSettings(raw: Partial<Settings>): Settings {
  const base: Settings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  return {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    appearance: base.appearance === 'light' ? 'light' : 'dark',
    verticalTabs: !!base.verticalTabs,
    restoreSession: base.restoreSession === true,
    zoom: clampNumber(base.zoom, 0.25, 5),
    siteZoom: sanitizeSiteZoom(base.siteZoom),
    readerFontSize: clampNumber(base.readerFontSize ?? 19, 14, 32),
    firstRunDone: true,
  };
}

function sanitizeSiteZoom(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= 500) break;
    if (!key || key.length > 200 || typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[key] = clampNumber(value, 0.25, 5);
    n += 1;
  }
  return out;
}

function clampNumber(value: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, n));
}
