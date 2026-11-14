import React from 'react';
import { actions } from '../state/actions';
import { store } from '../state/store';

/**
 * Browser-grade shortcuts.
 *
 * The chrome is ours, so every native menu accelerator has to exist here too.
 * Ctrl+Shift+R stays hard-reload; Reader lives on Ctrl+Alt+R.
 */
export function useShortcuts(enabled: boolean): void {
  React.useEffect(() => {
    if (!enabled) return;

    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (key === 'escape') {
        if (actions.closeAllOverlays()) event.preventDefault();
        else if (store.getState().ink.on) {
          event.preventDefault();
          actions.toggleInk();
        }
        return;
      }

      if (!mod) {
        if (event.altKey && key === 'arrowleft') {
          event.preventDefault();
          actions.back();
          return;
        }
        if (event.altKey && key === 'arrowright') {
          event.preventDefault();
          actions.forward();
          return;
        }
        if (key === 'f5') {
          event.preventDefault();
          actions.reload(event.shiftKey);
        }
        return;
      }

      if (key === 'k') {
        event.preventDefault();
        actions.openPalette();
        return;
      }
      if (key === 'l') {
        event.preventDefault();
        actions.focusAddress();
        return;
      }
      if (key === 't') {
        event.preventDefault();
        if (event.shiftKey) void actions.reopenTab();
        else void actions.newTab();
        return;
      }
      if (key === 'w') {
        event.preventDefault();
        actions.closeTab();
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        actions.openFind();
        return;
      }
      if (key === 'm' && event.shiftKey) {
        event.preventDefault();
        actions.toggleInk();
        return;
      }
      if (key === 'j') {
        event.preventDefault();
        actions.openStudyPanel('downloads');
        return;
      }
      if (key === 'h') {
        event.preventDefault();
        actions.openInternal('history');
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        if (event.altKey) void actions.openReader();
        else actions.reload(event.shiftKey);
        return;
      }
      if (key === 'p' && !event.shiftKey) {
        event.preventDefault();
        void actions.printPdf();
        return;
      }
      if (key === 's' && event.shiftKey) {
        event.preventDefault();
        void actions.screenshot(true);
        return;
      }
      if (key === 'a' && event.shiftKey) {
        event.preventDefault();
        actions.openTabSearch();
        return;
      }
      if (key === 'd' && event.shiftKey) {
        event.preventDefault();
        actions.openStudyPanel('reading');
        return;
      }
      if (key === 'd') {
        event.preventDefault();
        actions.toggleFavorite();
        return;
      }
      if (key === 'e' && event.shiftKey) {
        event.preventDefault();
        actions.openStudyPanel('extensions');
        return;
      }
      if (key === '=' || key === '+') {
        event.preventDefault();
        actions.zoomStep(0.1);
        return;
      }
      if (key === '-' || key === '_') {
        event.preventDefault();
        actions.zoomStep(-0.1);
        return;
      }
      if (key === '0') {
        event.preventDefault();
        void actions.resetZoom();
        return;
      }
      if (key === 'tab') {
        event.preventDefault();
        actions.cycleTab(event.shiftKey ? -1 : 1);
        return;
      }
      if (/^[1-9]$/.test(key)) {
        event.preventDefault();
        actions.selectTabIndex(Number(key) - 1);
      }
    };

    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const stale = store.getState().toasts.filter((t) => now - t.at > 4200);
      if (stale.length) {
        store.set((s) => ({ toasts: s.toasts.filter((t) => now - t.at <= 4200) }));
      }
    }, 1200);
    return () => window.clearInterval(interval);
  }, [enabled]);
}
