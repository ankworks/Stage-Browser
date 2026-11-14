import { app, BrowserWindow } from 'electron';
import { StageApp } from './app';
import { APP_NAME } from '../shared/types';

/**
 * Stage Browser entry point.
 *
 * The single-instance lock is taken before any window exists; a second launch
 * focuses the existing window instead of opening a competing profile.
 */

if (process.env.STAGE_USER_DATA) app.setPath('userData', process.env.STAGE_USER_DATA);
app.setName(APP_NAME);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  const stage = new StageApp();

  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(() => {
    void stage.start();
  });

  app.on('activate', () => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    win?.show();
  });

  app.on('before-quit', () => {
    stage.saveSession();
    stage.dispose();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  process.on('uncaughtException', (err) => {
    process.emitWarning(`Stage Browser uncaught exception: ${String(err)}`);
  });
}
