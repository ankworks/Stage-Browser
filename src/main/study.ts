/**
 * Study surfaces owned by main.
 *
 * Everything a study browser needs:
 * find-in-page, downloads, per-site zoom, print-to-PDF, reader extraction,
 * the reading list, unpacked extensions, screenshots and the page context menu.
 *
 * The service is deliberately additive: it reads/writes the same persisted
 * stores as the app and never leaves this device.
 */

import {
  app,
  clipboard,
  dialog,
  globalShortcut,
  shell,
  type BrowserWindow,
  type DownloadItem,
  type Session,
  type WebContents,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { CH, EV } from '../shared/ipc';
import {
  clampZoom,
  countWords,
  formatBytes,
  readingEntry,
  readingMinutes,
  zoomKey,
} from '../shared/study';
import {
  DEFAULT_SETTINGS,
  type DownloadEntry,
  type DownloadState,
  type ExtensionInfo,
  type FindState,
  type PageContextPayload,
  type ReaderArticle,
  type ReaderBlock,
  type ReadingEntry,
  type Settings,
} from '../shared/types';
import { hostOf, isInternalPage, resolveInput } from '../shared/url';
import { loadState, setState } from './persistence';

export interface StudyDeps {
  session: () => Session | null;
  activeTabId: () => string | null;
  activeWebContents: () => WebContents | null;
  webContentsFor: (tabId: string) => WebContents | null;
  openTab(url: string, background?: boolean): string | null;
  activateTab: (tabId: string) => void;
  renameTab: (tabId: string, title: string) => void;
  shellWindow: () => BrowserWindow | null;
  send: (channel: string, payload?: unknown) => void;
  toast: (message: string, tone?: 'info' | 'error') => void;
  settings: () => Settings;
  patchSettings: (patch: Partial<Settings>) => Promise<Settings>;
}

const EMPTY_FIND: FindState = { open: false, query: '', matches: 0, activeMatch: 0, caseSensitive: false };

/**
 * Runs inside the page. Returns *structured text*, never HTML: the reader renders it
 * with React, so there is no raw markup to sanitise or inject.
 */
const READER_EXTRACT = `(() => {
  const drop = 'script,style,noscript,iframe,svg,canvas,video,audio,nav,aside,footer,header,form,button,[role="navigation"],[aria-hidden="true"]';
  const pick = () => {
    const candidates = Array.from(document.querySelectorAll('article, main, [role="main"], .post, .article, .content, #content'));
    let best = document.body;
    let bestScore = 0;
    for (const el of candidates) {
      const text = (el.innerText || '').trim();
      const score = text.length + el.querySelectorAll('p').length * 120;
      if (score > bestScore) { best = el; bestScore = score; }
    }
    return best || document.body;
  };
  const root = pick().cloneNode(true);
  root.querySelectorAll(drop).forEach((n) => n.remove());
  const blocks = [];
  const push = (kind, text) => {
    const clean = String(text || '').replace(/\\s+/g, ' ').trim();
    if (clean.length > 1) blocks.push({ kind, text: clean.slice(0, 4000) });
  };
  for (const el of root.querySelectorAll('h1,h2,h3,p,li,blockquote,pre')) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'p' && el.closest('blockquote,pre,li')) continue;
    if (tag === 'li' && el.querySelector('p')) continue;
    const kind = tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : tag === 'h3' ? 'h3'
      : tag === 'li' ? 'li' : tag === 'blockquote' ? 'quote' : tag === 'pre' ? 'code' : 'p';
    push(kind, kind === 'code' ? el.textContent : el.innerText);
    if (blocks.length >= 500) break;
  }
  const words = blocks.reduce((n, b) => n + (b.text.match(/[\\p{L}\\p{N}'’-]+/gu) || []).length, 0);
  return {
    title: (document.querySelector('h1') && document.querySelector('h1').innerText) || document.title || '',
    byline: (document.querySelector('[rel="author"], .byline, .author') || {}).innerText || '',
    siteName: location.hostname.replace(/^www\\./, ''),
    blocks,
    words,
  };
})()`;

export class StudyService {
  downloads: DownloadEntry[] = [];
  readingList: ReadingEntry[] = [];
  extensions: ExtensionInfo[] = [];
  find: FindState = { ...EMPTY_FIND };

  private deps: StudyDeps;
  private items = new Map<string, DownloadItem>();
  private articles = new Map<string, ReaderArticle>();
  private disabledExtensions = new Set<string>();
  private findTarget: WebContents | null = null;
  private attached = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(deps: StudyDeps) {
    this.deps = deps;
    this.readingList = loadState<ReadingEntry[]>('readingList', []);
    this.disabledExtensions = new Set(loadState<string[]>('extensionsDisabled', []));
    // Restore extensions that were enabled in the previous session.
    void this.restoreExtensions();
  }

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    const ses = this.deps.session();
    if (!ses) return;
    ses.on('will-download', (_event, item) => this.trackDownload(item));
    this.registerGlobalHotkey();
  }

  private registerGlobalHotkey(): void {
    // One focused hotkey only. Anything more and a browser starts stealing
    // keystrokes from the operating system.
    try {
      globalShortcut.register('CommandOrControl+Shift+K', () => {
        const win = this.deps.shellWindow();
        if (!win) return;
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        this.deps.send(EV.FOCUS_SEARCH);
      });
    } catch {
      /* another app owns it — not fatal */
    }
  }

  state(): {
    downloads: DownloadEntry[];
    readingList: ReadingEntry[];
    extensions: ExtensionInfo[];
    find: FindState;
  } {
    return {
      downloads: this.downloads,
      readingList: this.readingList,
      extensions: this.extensions,
      find: this.find,
    };
  }

  private emitStudy(): void {
    this.deps.send(EV.STUDY, this.state());
  }

  private emitFind(): void {
    this.deps.send(EV.FIND, this.find);
  }

  private saveDialog(opts: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
    const win = this.deps.shellWindow();
    return win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts);
  }

  private openDialog(opts: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
    const win = this.deps.shellWindow();
    return win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts);
  }

  /* ------------------------------------------------------------------ *
   * Downloads
   * ------------------------------------------------------------------ */

  private trackDownload(item: DownloadItem): void {
    const id = `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const entry: DownloadEntry = {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath: '',
      state: 'progressing',
      received: 0,
      total: item.getTotalBytes(),
      paused: false,
      startedAt: Date.now(),
      mime: item.getMimeType(),
    };
    this.downloads = [entry, ...this.downloads].slice(0, 100);
    this.items.set(id, item);

    item.setSaveDialogOptions({ title: 'Save file', defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    item.on('updated', (_e, state) => {
      const next: DownloadEntry = {
        ...entry,
        savePath: item.getSavePath() || entry.savePath,
        received: item.getReceivedBytes(),
        total: item.getTotalBytes() || entry.total,
        paused: item.isPaused(),
        state: state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing',
      };
      this.replaceDownload(next);
      this.queueFlush();
    });
    item.once('done', (_e, status) => {
      const map: Record<string, DownloadState> = {
        completed: 'completed',
        cancelled: 'cancelled',
        interrupted: 'interrupted',
      };
      this.replaceDownload({
        ...entry,
        savePath: item.getSavePath() || entry.savePath,
        received: item.getReceivedBytes(),
        total: item.getTotalBytes() || entry.total,
        state: map[status] ?? 'interrupted',
        endedAt: Date.now(),
        paused: false,
      });
      this.items.delete(id);
      this.queueFlush();
      if (status === 'completed') this.deps.toast(`Saved ${item.getFilename()}`);
      else if (status === 'interrupted') this.deps.toast(`Download interrupted: ${item.getFilename()}`, 'error');
    });
    this.queueFlush();
  }

  private replaceDownload(next: DownloadEntry): void {
    this.downloads = this.downloads.map((d) => (d.id === next.id ? next : d));
  }

  private queueFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.emitStudy();
    }, 200);
  }

  downloadCmd(payload: unknown): boolean {
    const p = (payload ?? {}) as { id?: string; cmd?: string };
    const id = typeof p.id === 'string' ? p.id : '';
    const entry = this.downloads.find((d) => d.id === id);
    if (!entry) return false;
    const item = this.items.get(id);
    switch (p.cmd) {
      case 'pause':
        item?.pause();
        return true;
      case 'resume':
        item?.resume();
        return true;
      case 'cancel':
        item?.cancel();
        return true;
      case 'open':
        if (entry.savePath && fs.existsSync(entry.savePath)) void shell.openPath(entry.savePath);
        return true;
      case 'reveal':
        if (entry.savePath) shell.showItemInFolder(entry.savePath);
        return true;
      case 'remove':
        this.downloads = this.downloads.filter((d) => d.id !== id);
        this.items.delete(id);
        this.queueFlush();
        return true;
      default:
        return false;
    }
  }

  clearDownloads(): boolean {
    this.downloads = this.downloads.filter((d) => d.state === 'progressing' || d.state === 'paused');
    this.queueFlush();
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Find in page
   * ------------------------------------------------------------------ */

  findInPage(payload: unknown): FindState {
    const p = (payload ?? {}) as { query?: string; forward?: boolean; caseSensitive?: boolean };
    const wc = this.deps.activeWebContents();
    const query = typeof p.query === 'string' ? p.query.slice(0, 200) : '';
    if (!wc || wc.isDestroyed() || !query) {
      this.stopFind();
      return this.find;
    }
    this.detachFind();
    this.find = { open: true, query, matches: 0, activeMatch: 0, caseSensitive: !!p.caseSensitive };
    this.findTarget = wc;
    wc.on('found-in-page', this.onFoundInPage);
    wc.on('destroyed', this.onFindTargetGone);
    const requestId = wc.findInPage(query, { forward: p.forward !== false, matchCase: !!p.caseSensitive });
    void requestId;
    this.emitFind();
    return this.find;
  }

  findStep(payload: unknown): FindState {
    const p = (payload ?? {}) as { forward?: boolean };
    const wc = this.findTarget;
    if (!wc || wc.isDestroyed() || !this.find.query) return this.find;
    wc.findInPage(this.find.query, {
      forward: p.forward !== false,
      findNext: true,
      matchCase: this.find.caseSensitive,
    });
    return this.find;
  }

  stopFind(): FindState {
    if (this.findTarget && !this.findTarget.isDestroyed()) this.findTarget.stopFindInPage('clearSelection');
    this.detachFind();
    this.find = { ...EMPTY_FIND };
    this.emitFind();
    return this.find;
  }

  private onFoundInPage = (_event: Electron.Event, result: Electron.FoundInPageResult): void => {
    this.find = { ...this.find, matches: result.matches, activeMatch: result.activeMatchOrdinal ? result.activeMatchOrdinal - 1 : 0, error: undefined };
    this.emitFind();
  };

  private onFindTargetGone = (): void => {
    this.find = { ...this.find, error: 'The page was closed' };
    this.emitFind();
  };

  private detachFind(): void {
    const wc = this.findTarget;
    this.findTarget = null;
    if (!wc || wc.isDestroyed()) return;
    wc.removeListener('found-in-page', this.onFoundInPage);
    wc.removeListener('destroyed', this.onFindTargetGone);
  }

  /** Called by the renderer when the active tab changes. */
  resetFind(): FindState {
    this.detachFind();
    this.find = { ...EMPTY_FIND };
    return this.find;
  }

  /* ------------------------------------------------------------------ *
   * Per-site zoom
   * ------------------------------------------------------------------ */

  zoomFor(url: string): number {
    const key = zoomKey(url);
    const settings = this.deps.settings();
    if (key && typeof settings.siteZoom[key] === 'number') return clampZoom(settings.siteZoom[key]);
    return clampZoom(settings.zoom ?? 1);
  }

  async setZoom(factor: number): Promise<number> {
    const settings = this.deps.settings();
    const wc = this.deps.activeWebContents();
    const next = clampZoom(factor);
    if (!wc || wc.isDestroyed()) return next;
    const url = wc.getURL();
    const key = zoomKey(url);
    wc.setZoomFactor(next);
    if (key) {
      const siteZoom = { ...(settings.siteZoom ?? {}), [key]: next };
      await this.deps.patchSettings({ siteZoom });
    }
    return next;
  }

  async resetZoom(): Promise<number> {
    const settings = this.deps.settings();
    const wc = this.deps.activeWebContents();
    const url = wc && !wc.isDestroyed() ? wc.getURL() : '';
    const key = zoomKey(url);
    if (wc && !wc.isDestroyed()) wc.setZoomFactor(clampZoom(settings.zoom ?? 1));
    if (key) {
      const siteZoom = { ...(settings.siteZoom ?? {}) };
      delete siteZoom[key];
      await this.deps.patchSettings({ siteZoom });
    }
    return clampZoom(settings.zoom ?? 1);
  }

  /* ------------------------------------------------------------------ *
   * Print / PDF
   * ------------------------------------------------------------------ */

  async printPdf(): Promise<string | null> {
    const wc = this.deps.activeWebContents();
    if (!wc || wc.isDestroyed()) {
      this.deps.toast('Nothing to print in this tab', 'error');
      return null;
    }
    const suggested = `${(wc.getTitle() || 'page').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) || 'page'}.pdf`;
    const picked = await this.saveDialog({
      title: 'Save page as PDF',
      defaultPath: path.join(app.getPath('documents'), suggested),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (picked.canceled || !picked.filePath) return null;
    try {
      const data = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(picked.filePath, data);
      this.deps.toast('Saved PDF');
      return picked.filePath;
    } catch (err) {
      this.deps.toast(`PDF failed: ${String(err)}`, 'error');
      return null;
    }
  }

  /* ------------------------------------------------------------------ *
   * Reader
   * ------------------------------------------------------------------ */

  async reader(tabId?: string): Promise<ReaderArticle | null> {
    const wc = tabId ? this.deps.webContentsFor(tabId) : this.deps.activeWebContents();
    if (!wc || wc.isDestroyed()) {
      this.deps.toast('Open a page first to use Reader', 'error');
      return null;
    }
    const url = wc.getURL();
    if (!url || isInternalPage(url)) {
      this.deps.toast('Reader works on websites, not internal pages', 'error');
      return null;
    }
    try {
      const raw = (await wc.executeJavaScript(READER_EXTRACT, true)) as {
        title?: string;
        byline?: string;
        siteName?: string;
        blocks?: ReaderBlock[];
        words?: number;
      };
      const blocks = Array.isArray(raw.blocks) ? raw.blocks.filter((b) => b && typeof b.text === 'string' && b.text.length > 1).slice(0, 500) : [];
      if (!blocks.length) {
        this.deps.toast('This page has no readable article text', 'error');
        return null;
      }
      const words = typeof raw.words === 'number' && raw.words > 0 ? raw.words : blocks.reduce((n, b) => n + countWords(b.text), 0);
      const id = `rd_${Date.now().toString(36)}`;
      const article: ReaderArticle = {
        id,
        url,
        title: (raw.title || wc.getTitle() || hostOf(url)).slice(0, 200),
        byline: raw.byline ? String(raw.byline).slice(0, 120) : undefined,
        siteName: raw.siteName ? String(raw.siteName).slice(0, 120) : hostOf(url),
        blocks,
        words,
        minutes: readingMinutes(words),
      };
      this.articles.set(id, article);
      if (this.articles.size > 24) {
        const oldest = this.articles.keys().next().value;
        if (oldest) this.articles.delete(oldest);
      }
      const readerTab = this.deps.openTab(`stage://reader?id=${id}`, false);
      if (readerTab) this.deps.renameTab(readerTab, article.title);
      return article;
    } catch (err) {
      this.deps.toast(`Reader failed: ${String(err)}`, 'error');
      return null;
    }
  }

  getReader(id: string): ReaderArticle | null {
    return this.articles.get(id) ?? null;
  }

  /* ------------------------------------------------------------------ *
   * Reading list
   * ------------------------------------------------------------------ */

  private saveReading(): void {
    setState('readingList', this.readingList);
    this.deps.send(EV.READING, this.readingList);
  }

  readingAll(): ReadingEntry[] {
    return this.readingList;
  }

  async addReading(payload?: unknown): Promise<ReadingEntry[]> {
    const p = (payload ?? {}) as { url?: string; title?: string; favicon?: string };
    const wc = this.deps.activeWebContents();
    const url = typeof p.url === 'string' && p.url ? p.url : wc && !wc.isDestroyed() ? wc.getURL() : '';
    if (!url || isInternalPage(url)) {
      this.deps.toast('Save a website, not an internal page', 'error');
      return this.readingList;
    }
    if (this.readingList.some((r) => r.url === url && !r.doneAt)) {
      this.deps.toast('Already in your reading list');
      return this.readingList;
    }
    let words = 0;
    try {
      if (wc && !wc.isDestroyed() && wc.getURL() === url) {
        const text = (await wc.executeJavaScript(`document.body ? document.body.innerText : ''`, true)) as string;
        words = countWords(String(text ?? ''));
      }
    } catch {
      words = 0;
    }
    const title = typeof p.title === 'string' && p.title ? p.title : wc && !wc.isDestroyed() ? wc.getTitle() : hostOf(url);
    const entry = readingEntry(`rl_${Date.now().toString(36)}`, url, title || hostOf(url), words, typeof p.favicon === 'string' ? p.favicon : undefined);
    this.readingList = [entry, ...this.readingList].slice(0, 300);
    this.saveReading();
    this.deps.toast(`Saved to reading list · ${entry.minutes} min`);
    return this.readingList;
  }

  readingCmd(payload: unknown): ReadingEntry[] {
    const p = (payload ?? {}) as { id?: string; cmd?: string; note?: string };
    const id = typeof p.id === 'string' ? p.id : '';
    switch (p.cmd) {
      case 'done':
        this.readingList = this.readingList.map((r) => (r.id === id ? { ...r, doneAt: r.doneAt ? undefined : Date.now() } : r));
        break;
      case 'remove':
        this.readingList = this.readingList.filter((r) => r.id !== id);
        break;
      case 'clearDone':
        this.readingList = this.readingList.filter((r) => !r.doneAt);
        break;
      case 'note':
        this.readingList = this.readingList.map((r) => (r.id === id ? { ...r, note: String(p.note ?? '').slice(0, 2000) } : r));
        break;
      default:
        break;
    }
    this.saveReading();
    return this.readingList;
  }

  /* ------------------------------------------------------------------ *
   * Extensions
   * ------------------------------------------------------------------ */

  private async restoreExtensions(): Promise<void> {
    const ses = this.deps.session();
    const paths = loadState<string[]>('extensionsEnabled', []);
    if (!ses || !paths.length) {
      this.refreshExtensions();
      return;
    }
    for (const dir of paths) {
      if (this.disabledExtensions.has(dir) || !fs.existsSync(dir)) continue;
      try {
        await ses.loadExtension(dir, { allowFileAccess: true });
      } catch (err) {
        this.deps.toast(`Extension failed to load: ${path.basename(dir)} (${String(err)})`, 'error');
      }
    }
    this.refreshExtensions();
  }

  refreshExtensions(): ExtensionInfo[] {
    const ses = this.deps.session();
    if (!ses) return this.extensions;
    const loaded = ses.getAllExtensions();
    const knownPaths = new Map<string, ExtensionInfo>();
    for (const ext of loaded) {
      knownPaths.set(ext.path, {
        id: ext.id,
        name: ext.name || path.basename(ext.path),
        version: ext.version,
        manifestVersion: ext.manifest?.manifest_version ?? 3,
        path: ext.path,
        enabled: true,
      });
    }
    this.extensions = Array.from(knownPaths.values()).sort((a, b) => a.name.localeCompare(b.name));
    this.deps.send(EV.EXTENSIONS, this.extensions);
    return this.extensions;
  }

  async addExtension(): Promise<ExtensionInfo[]> {
    const ses = this.deps.session();
    if (!ses) return this.extensions;
    const picked = await this.openDialog({
      title: 'Load unpacked extension',
      properties: ['openDirectory'],
      buttonLabel: 'Load extension',
    });
    if (picked.canceled || !picked.filePaths[0]) return this.extensions;
    return this.loadExtension(picked.filePaths[0]);
  }

  async loadExtension(dir: string): Promise<ExtensionInfo[]> {
    const ses = this.deps.session();
    if (!ses) return this.extensions;
    try {
      this.disabledExtensions.delete(dir);
      const enabled = new Set(loadState<string[]>('extensionsEnabled', []));
      enabled.add(dir);
      setState('extensionsEnabled', Array.from(enabled));
      setState('extensionsDisabled', Array.from(this.disabledExtensions));
      await ses.loadExtension(dir, { allowFileAccess: true });
      this.deps.toast(`Extension loaded: ${path.basename(dir)}`);
    } catch (err) {
      this.deps.toast(`Cannot load extension: ${String(err)}`, 'error');
    }
    return this.refreshExtensions();
  }

  async extensionCmd(payload: unknown): Promise<ExtensionInfo[]> {
    const p = (payload ?? {}) as { id?: string; cmd?: string; path?: string };
    const dir = typeof p.path === 'string' ? p.path : this.extensions.find((x) => x.id === p.id)?.path;
    if (!dir) return this.extensions;
    if (p.cmd === 'disable' || p.cmd === 'remove') {
      this.disabledExtensions.add(dir);
      const enabled = new Set(loadState<string[]>('extensionsEnabled', []));
      enabled.delete(dir);
      setState('extensionsEnabled', Array.from(enabled));
      setState('extensionsDisabled', Array.from(this.disabledExtensions));
      this.deps.toast(
        p.cmd === 'remove' ? 'Extension disabled · restarts take effect on next launch' : 'Extension disabled · restart to fully unload',
      );
      return this.extensions.map((x) => (x.path === dir ? { ...x, enabled: false } : x));
    }
    if (p.cmd === 'enable') return this.loadExtension(dir);
    return this.refreshExtensions();
  }

  /* ------------------------------------------------------------------ *
   * Screenshot / page menu
   * ------------------------------------------------------------------ */

  async screenshot(save: boolean): Promise<{ ok: boolean; path?: string }> {
    const wc = this.deps.activeWebContents();
    if (!wc || wc.isDestroyed()) {
      this.deps.toast('Nothing to capture', 'error');
      return { ok: false };
    }
    try {
      const image = await wc.capturePage();
      clipboard.writeImage(image);
      if (!save) {
        this.deps.toast('Page captured to clipboard');
        return { ok: true };
      }
      const picked = await this.saveDialog({
        title: 'Save screenshot',
        defaultPath: path.join(app.getPath('pictures'), `stage-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`),
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });
      if (picked.canceled || !picked.filePath) return { ok: true };
      fs.writeFileSync(picked.filePath, image.toPNG());
      this.deps.toast('Screenshot saved');
      return { ok: true, path: picked.filePath };
    } catch (err) {
      this.deps.toast(`Capture failed: ${String(err)}`, 'error');
      return { ok: false };
    }
  }

  pageAction(payload: unknown): boolean {
    const p = (payload ?? {}) as {
      action?: string;
      tabId?: string;
      linkURL?: string;
      srcURL?: string;
      selectionText?: string;
      x?: number;
      y?: number;
      url?: string;
    };
    const tabId = p.tabId || this.deps.activeTabId() || '';
    const wc = this.deps.webContentsFor(tabId);
    switch (p.action) {
      case 'open-link': {
        const url = typeof p.linkURL === 'string' ? resolveInput(p.linkURL, { search: false }) : null;
        if (!url) return false;
        this.deps.openTab(url, true);
        return true;
      }
      case 'open-link-foreground': {
        const url = typeof p.linkURL === 'string' ? resolveInput(p.linkURL, { search: false }) : null;
        if (!url) return false;
        this.deps.openTab(url, false);
        return true;
      }
      case 'copy-link':
        if (p.linkURL) clipboard.writeText(p.linkURL);
        return true;
      case 'copy-text':
        if (p.selectionText) clipboard.writeText(p.selectionText);
        return true;
      case 'copy-image':
        if (p.srcURL) clipboard.writeText(p.srcURL);
        return true;
      case 'save-image':
        if (p.srcURL && wc && !wc.isDestroyed()) {
          wc.downloadURL(p.srcURL);
          return true;
        }
        return false;
      case 'search-selection': {
        const q = p.selectionText?.trim();
        if (!q) return false;
        const url = resolveInput(q);
        if (url) this.deps.openTab(url, false);
        return true;
      }
      case 'reader':
        void this.reader(tabId);
        return true;
      case 'add-reading':
        void this.addReading();
        return true;
      case 'screenshot':
        void this.screenshot(false);
        return true;
      case 'print-pdf':
        void this.printPdf();
        return true;
      case 'reload':
        if (wc && !wc.isDestroyed()) wc.reload();
        return true;
      case 'inspect':
        if (wc && !wc.isDestroyed()) {
          wc.inspectElement(Math.round(p.x ?? 0), Math.round(p.y ?? 0));
          this.deps.shellWindow()?.webContents.openDevTools({ mode: 'detach' });
        }
        return true;
      case 'open-external':
        if (p.linkURL) {
          const url = resolveInput(p.linkURL, { search: false });
          if (url && /^https?:/i.test(url)) void shell.openExternal(url);
        }
        return true;
      default:
        return false;
    }
  }

  /** Called from TabManager's `context-menu` event with already-plucked fields. */
  pageMenu(payload: PageContextPayload): void {
    this.deps.send(EV.PAGE_MENU, payload);
  }

  /* ------------------------------------------------------------------ *
   * Misc
   * ------------------------------------------------------------------ */

  /** Human string used in toasts/tests. */
  describeDownload(entry: DownloadEntry): string {
    return `${entry.filename} · ${formatBytes(entry.received)}${entry.total ? ` / ${formatBytes(entry.total)}` : ''}`;
  }

  defaults(): Pick<Settings, 'appearance' | 'verticalTabs' | 'siteZoom' | 'readerFontSize'> {
    return {
      appearance: DEFAULT_SETTINGS.appearance,
      verticalTabs: DEFAULT_SETTINGS.verticalTabs,
      siteZoom: DEFAULT_SETTINGS.siteZoom,
      readerFontSize: DEFAULT_SETTINGS.readerFontSize,
    };
  }
}

export { EMPTY_FIND };
export const studyChannels = [CH.STUDY_FIND, CH.STUDY_FIND_STOP, CH.STUDY_FIND_STEP, CH.STUDY_STATE] as const;
