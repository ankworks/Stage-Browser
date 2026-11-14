import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Browser state lives under `userData/state`; downloads and page files stay
 * wherever the user put them. Nothing is copied into a hidden media cache.
 */
export function userDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'state');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function stateFile(name: string): string {
  return path.join(userDataDir(), `${name}.json`);
}

export function isDev(): boolean {
  return !app.isPackaged;
}

export function devServerUrl(): string | null {
  const url = process.env.STAGE_DEV_SERVER;
  return url && /^https?:\/\//.test(url) ? url.replace(/\/$/, '') : null;
}
