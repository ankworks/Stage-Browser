/**
 * Stage Browser security invariants.
 *
 * The browser shell is the only renderer with a preload bridge. Website tabs
 * run sandboxed with no preload, and the presentation/audience surface that
 * used to exist is gone — these tests make sure it does not creep back in.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CH } from '../dist/test/shared/ipc.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('there is no audience/prep split left in the IPC registry', () => {
  const keys = Object.keys(CH);
  assert.equal(keys.some((key) => /^LIVE_/.test(key)), false);
  assert.equal(keys.some((key) => /^SCENE_/.test(key)), false);
  assert.equal(keys.some((key) => /^PERM_/.test(key)), false);
  assert.equal(keys.some((key) => /^BOARD_/.test(key)), false);
  assert.equal(keys.some((key) => /^BG_/.test(key)), false);
});

test('the shell renderer is isolated', () => {
  const app = read('src/main/app.ts');
  assert.match(app, /contextIsolation:\s*true/);
  assert.match(app, /nodeIntegration:\s*false/);
  assert.equal(/nodeIntegration:\s*true/.test(app), false);
  assert.equal(/contextIsolation:\s*false/.test(app), false);
  assert.match(app, /sandbox:\s*false/);
});

test('website tabs get a sandbox and no preload', () => {
  const tabs = read('src/main/tabs.ts');
  assert.match(tabs, /sandbox:\s*true/);
  assert.match(tabs, /contextIsolation:\s*true/);
  assert.match(tabs, /nodeIntegration:\s*false/);
  assert.match(tabs, /webSecurity:\s*true/);
  assert.equal(/preload:\s*path/.test(tabs), false);
});

test('only http(s) and internal pages can be opened from a window', () => {
  const app = read('src/main/app.ts');
  assert.match(app, /https\?:\\\/\\\//);
  assert.match(app, /action:\s*'deny'/);
});

test('external shell opens are restricted to http(s)', () => {
  const app = read('src/main/app.ts');
  assert.match(app, /SHELL_OPEN_EXTERNAL[\s\S]{0,260}\^https\?:/);
});

test('the reader never renders raw HTML', () => {
  const reader = read('src/renderer/study/ReaderView.tsx');
  assert.equal(/dangerouslySetInnerHTML/.test(reader), false);
  assert.equal(/innerHTML/.test(reader), false);
});
