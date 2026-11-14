import { isInternalPage, resolveInput } from '../../shared/url';
import type { PageContextPayload, Settings } from '../../shared/types';
import { isWebTab } from '../../shared/types';
import { store } from './store';

/**
 * Every user intent from the Stage shell.
 *
 * Main owns the truth: actions send a request and the new state comes back
 * through an event. Nothing here writes on every keystroke of the page.
 */

let toastSeq = 0;

const api = () => window.stage;

function activeId(): string | null {
  return store.getState().activeTabId;
}

function activeTab() {
  const s = store.getState();
  return s.tabs.find((t) => t.id === s.activeTabId) ?? null;
}

function activeUrl(): string | null {
  const tab = activeTab();
  return tab && isWebTab(tab) ? tab.url : null;
}

function dismissLater(id: string): void {
  window.setTimeout(() => actions.dismissToast(id), 3800);
}

export const actions = {
  /* ------------------------------------------------------------------ *
   * Feedback
   * ------------------------------------------------------------------ */

  toast(message: string, tone: 'info' | 'error' = 'info'): void {
    const id = `t_${Date.now().toString(36)}_${++toastSeq}`;
    store.set((s) => ({ toasts: [...s.toasts, { id, message, tone, at: Date.now() }].slice(-3) }));
    dismissLater(id);
  },

  dismissToast(id: string): void {
    store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  /* ------------------------------------------------------------------ *
   * Tabs
   * ------------------------------------------------------------------ */

  async newTab(input?: string): Promise<string> {
    let url = 'stage://newtab';
    if (input && input.trim()) {
      const raw = input.trim();
      url = isInternalPage(raw) ? raw : resolveInput(raw) ?? 'stage://newtab';
    }
    return api().tabs.create({ url });
  },

  openInternal(page: 'newtab' | 'favorites' | 'history' | 'settings' | 'about'): void {
    void api().tabs.create({ url: `stage://${page}` });
  },

  closeTab(id?: string): void {
    const tabId = id ?? activeId();
    if (tabId) api().tabs.close(tabId);
  },

  closeOthers(id?: string): void {
    const tabId = id ?? activeId();
    if (tabId) api().tabs.closeOthers(tabId);
  },

  closeRight(id?: string): void {
    const tabId = id ?? activeId();
    if (tabId) api().tabs.closeRight(tabId);
  },

  activateTab(id: string): void {
    api().tabs.activate(id);
  },

  async reopenTab(): Promise<void> {
    const tab = await api().tabs.reopen();
    if (!tab) actions.toast('Nothing left to reopen');
  },

  reorderTab(from: number, to: number): void {
    if (from === to) return;
    api().tabs.reorder(from, to);
  },

  duplicateTab(id?: string): void {
    const tabId = id ?? activeId();
    if (tabId) api().tabs.duplicate(tabId);
  },

  pinTab(id: string, pinned: boolean): void {
    api().tabs.pin(id, pinned);
  },

  muteTab(id: string, muted: boolean): void {
    api().tabs.mute(id, muted);
  },

  cycleTab(delta: number): void {
    const s = store.getState();
    if (s.tabs.length < 2) return;
    const index = s.tabs.findIndex((t) => t.id === s.activeTabId);
    const next = (index + delta + s.tabs.length) % s.tabs.length;
    actions.activateTab(s.tabs[next].id);
  },

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */

  navigate(input: string, tabId?: string): void {
    const id = tabId ?? activeId();
    if (!id) {
      void actions.newTab(input);
      return;
    }
    void api().tabs.navigate(id, input);
  },

  back(): void {
    const id = activeId();
    if (id) api().tabs.back(id);
    void api().window.focusPage();
  },

  forward(): void {
    const id = activeId();
    if (id) api().tabs.forward(id);
    void api().window.focusPage();
  },

  reload(hard = false): void {
    const id = activeId();
    if (!id) return;
    if (hard) api().tabs.hardReload(id);
    else api().tabs.reload(id);
    void api().window.focusPage();
  },

  stop(): void {
    const id = activeId();
    if (id) api().tabs.stop(id);
  },

  openExternal(url: string): void {
    void api().openExternal(url);
  },

  copyText(text: string): void {
    if (!text) return;
    void api().clipboardWrite(text);
    actions.toast('Copied');
  },

  /* ------------------------------------------------------------------ *
   * Favorites + history
   * ------------------------------------------------------------------ */

  toggleFavorite(): void {
    const tab = activeTab();
    if (!tab || !isWebTab(tab) || isInternalPage(tab.url)) {
      actions.toast('Bookmark a website, not an internal page');
      return;
    }
    const existing = store.getState().favorites.find((f) => f.url === tab.url);
    if (existing) {
      void api().favorites.remove(existing.id);
      actions.toast('Removed from favorites');
    } else {
      void api().favorites.add({ url: tab.url, title: tab.title, favicon: tab.favicon });
      actions.toast('Added to favorites');
    }
  },

  removeFavorite(id: string): void {
    void api().favorites.remove(id);
  },

  renameFavorite(id: string, title: string): void {
    const clean = title.trim();
    if (clean) void api().favorites.rename(id, clean);
  },

  clearHistory(): void {
    void api().history.clear();
    actions.toast('History cleared');
  },

  removeHistory(id: string): void {
    void api().history.remove(id);
  },

  /* ------------------------------------------------------------------ *
   * Settings
   * ------------------------------------------------------------------ */

  async setSettings(patch: Partial<Settings>): Promise<void> {
    store.set((s) => ({ settings: { ...s.settings, ...patch } }));
    const next = await api().setSettings(patch);
    store.set({ settings: next });
  },

  setAppearance(appearance: 'dark' | 'light'): void {
    void actions.setSettings({ appearance });
  },

  toggleTheme(): void {
    const current = store.getState().settings.appearance;
    actions.setAppearance(current === 'light' ? 'dark' : 'light');
  },

  setReaderFontSize(size: number): void {
    void actions.setSettings({ readerFontSize: Math.min(32, Math.max(14, Math.round(size))) });
  },

  setVerticalTabs(on: boolean): void {
    void actions.setSettings({ verticalTabs: on });
  },

  /* ------------------------------------------------------------------ *
   * Chrome surfaces
   * ------------------------------------------------------------------ */

  focusAddress(): void {
    store.set((s) => ({ addressFocus: s.addressFocus + 1 }));
  },

  openPalette(): void {
    store.set({ paletteOpen: true, settingsOpen: false, tabSearchOpen: false, studyPanel: null, pageMenu: undefined });
  },

  closePalette(): void {
    store.set({ paletteOpen: false });
  },

  openSettings(): void {
    store.set({ settingsOpen: true, paletteOpen: false, tabSearchOpen: false, studyPanel: null, pageMenu: undefined });
  },

  closeSettings(): void {
    store.set({ settingsOpen: false });
  },

  openStudyPanel(panel: 'downloads' | 'reading' | 'extensions'): void {
    const current = store.getState().studyPanel;
    store.set({
      studyPanel: current === panel ? null : panel,
      paletteOpen: false,
      settingsOpen: false,
      tabSearchOpen: false,
      pageMenu: undefined,
    });
    if (panel === 'extensions' && current !== 'extensions') void actions.refreshExtensions();
  },

  closeStudyPanel(): void {
    store.set({ studyPanel: null });
  },

  openTabSearch(): void {
    store.set({ tabSearchOpen: true, paletteOpen: false, settingsOpen: false, studyPanel: null, pageMenu: undefined });
  },

  closeTabSearch(): void {
    store.set({ tabSearchOpen: false });
  },

  closePageMenu(): void {
    store.set({ pageMenu: undefined });
  },

  closeAllOverlays(): boolean {
    const s = store.getState();
    if (s.pageMenu) {
      store.set({ pageMenu: undefined });
      return true;
    }
    if (s.tabSearchOpen) {
      store.set({ tabSearchOpen: false });
      return true;
    }
    if (s.paletteOpen) {
      store.set({ paletteOpen: false });
      return true;
    }
    if (s.settingsOpen) {
      store.set({ settingsOpen: false });
      return true;
    }
    if (s.studyPanel) {
      store.set({ studyPanel: null });
      return true;
    }
    if (s.find.open) {
      actions.closeFind();
      return true;
    }
    return false;
  },

  /* ------------------------------------------------------------------ *
   * Find in page
   * ------------------------------------------------------------------ */

  openFind(): void {
    if (!activeTab() || !isWebTab(activeTab()) || isInternalPage(activeUrl() ?? '')) {
      actions.toast('Find works on websites');
      return;
    }
    store.set((s) => ({ find: { ...s.find, open: true, error: undefined }, paletteOpen: false, settingsOpen: false, tabSearchOpen: false }));
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('[data-stage-find]');
      input?.focus();
      input?.select();
    }, 20);
  },

  setFindQuery(query: string, caseSensitive = false): void {
    store.set((s) => ({ find: { ...s.find, open: true, query, caseSensitive, error: undefined } }));
    if (!query) {
      void api().study.findStop().then((find) => store.set({ find }));
      return;
    }
    void api().study.find({ query, findNext: false, forward: true, caseSensitive }).then((find) => {
      if (store.getState().find.open) store.set({ find });
    });
  },

  findNext(forward = true): void {
    const { find } = store.getState();
    if (!find.open || !find.query) return;
    void api().study.findStep({ forward, findNext: true }).then((next) => store.set({ find: next }));
  },

  closeFind(): void {
    void api().study.findStop().then((find) => {
      store.set({ find: { ...find, open: false, query: '', matches: 0, activeMatch: 0 } });
      void api().window.focusPage();
    });
  },

  /** Clear highlights without closing the find bar. */
  async clearFindQuery(): Promise<void> {
    await api().study.findStop();
    store.set((s) => ({ find: { ...s.find, open: true, query: '', matches: 0, activeMatch: 0 } }));
  },

  /* ------------------------------------------------------------------ *
   * Zoom
   * ------------------------------------------------------------------ */

  async setZoom(factor: number): Promise<void> {
    await api().study.setZoom(factor);
  },

  async resetZoom(): Promise<void> {
    await api().study.resetZoom();
  },

  zoomStep(delta: number): void {
    const current = store.getState().settings;
    let base = current.zoom ?? 1;
    try {
      const host = activeUrl() ? new URL(activeUrl() as string).host : '';
      if (host && current.siteZoom[host]) base = current.siteZoom[host];
    } catch {
      /* internal page */
    }
    void actions.setZoom(Math.min(3, Math.max(0.5, Math.round((base + delta) * 10) / 10)));
  },

  /* ------------------------------------------------------------------ *
   * Study: reading list, reader, downloads, extensions
   * ------------------------------------------------------------------ */

  async refreshStudy(): Promise<void> {
    const study = await api().study.state();
    store.set({
      downloads: study.downloads,
      readingList: study.readingList,
      extensions: study.extensions,
      find: study.find,
    });
  },

  async addReading(payload?: { url?: string; title?: string; favicon?: string }): Promise<void> {
    const list = await api().study.readingAdd(payload ?? {});
    store.set({ readingList: list });
    if (list.length) actions.toast('Saved to reading list');
  },

  async readingCmd(id: string, cmd: string, note?: string): Promise<void> {
    const list = await api().study.readingCmd({ id, cmd, note });
    store.set({ readingList: list });
  },

  async openReader(tabId?: string): Promise<void> {
    const article = await api().study.reader(tabId);
    if (article) {
      store.set({ paletteOpen: false, settingsOpen: false, tabSearchOpen: false, studyPanel: null });
    }
  },

  async downloadCmd(id: string, cmd: string): Promise<void> {
    await api().study.downloadCmd({ id, cmd });
    await actions.refreshStudy();
  },

  async clearDownloads(): Promise<void> {
    await api().study.clearDownloads();
    await actions.refreshStudy();
  },

  async refreshExtensions(): Promise<void> {
    const list = await api().study.extensions();
    store.set({ extensions: list });
  },

  async addExtension(): Promise<void> {
    const list = await api().study.extensionAdd();
    store.set({ extensions: list });
  },

  async extensionCmd(id: string, cmd: string): Promise<void> {
    const list = await api().study.extensionCmd({ id, cmd });
    store.set({ extensions: list });
  },

  async openExtension(id: string): Promise<void> {
    await api().study.extensionOpen(id);
  },

  async printPdf(): Promise<void> {
    const saved = await api().study.printPdf();
    if (saved) actions.toast('PDF saved');
  },

  async screenshot(save = true): Promise<void> {
    const result = await api().study.screenshot(save);
    if (result.ok) actions.toast(save ? 'Screenshot saved' : 'Page captured to clipboard');
  },

  /* ------------------------------------------------------------------ *
   * Page context menu
   * ------------------------------------------------------------------ */

  async pageAction(payload: PageContextPayload, action: string): Promise<void> {
    const ok = await api().study.pageAction({
      action,
      tabId: payload.tabId,
      linkURL: payload.linkURL,
      srcURL: payload.srcURL,
      selectionText: payload.selectionText,
      x: payload.x,
      y: payload.y,
    });
    if (action === 'copy-link' && ok) actions.toast('Link copied');
    if (action === 'copy-text' && ok) actions.toast('Text copied');
    if (action === 'copy-image' && ok) actions.toast('Image address copied');
    store.set({ pageMenu: undefined });
  },

  /* ------------------------------------------------------------------ *
   * Keyboard helpers
   * ------------------------------------------------------------------ */

  selectTabIndex(index: number): void {
    const tab = store.getState().tabs[index];
    if (tab) actions.activateTab(tab.id);
  },
};
