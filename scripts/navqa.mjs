import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repo = path.resolve('.');
const profile = path.join(process.env.TEMP || repo, 'stage-navqa', 'profile');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'state'), { recursive: true });
fs.writeFileSync(path.join(profile, 'state', 'settings.json'), JSON.stringify({ firstRunDone: true, appearance: 'dark' }));

const app = await electron.launch({
  executablePath: require('electron'),
  args: ['.'],
  cwd: repo,
  env: { ...process.env, STAGE_USER_DATA: profile, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
});
const win = await app.firstWindow();
win.on('console', (msg) => { if (msg.type() === 'error') console.log('[console]', msg.text()); });
win.on('pageerror', (err) => console.log('[pageerror]', err.message));
win.on('requestfailed', (req) => console.log('[requestfailed]', req.url(), req.failure()?.errorText));
await win.waitForTimeout(1800);

const state = async (label) => {
  const dom = await win.evaluate(() => ({
    addr: document.querySelector('.st-omni__input')?.value ?? null,
    title: document.querySelector('.st-titlebar__title')?.textContent ?? null,
    tab: document.querySelector('.st-vtab.is-active .st-vtab__title')?.textContent ?? null,
    loading: !!document.querySelector('.st-vtab.is-active .st-spinner'),
    toast: document.querySelector('.st-toast')?.textContent ?? null,
  }));
  const pages = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return w.contentView.children.map((c) => {
      try {
        return { url: c.webContents.getURL(), title: c.webContents.getTitle(), loading: c.webContents.isLoading(), bounds: c.getBounds(), focused: c.webContents.isFocused() };
      } catch { return null; }
    });
  });
  console.log(label, JSON.stringify({ ...dom, pages }, null, 2));
};

await state('boot');

// Normal address-bar navigation: Ctrl+L, type, Enter.
await win.keyboard.press('Control+L');
await win.waitForTimeout(200);
await win.keyboard.type('https://example.com');
await win.keyboard.press('Enter');
await win.waitForTimeout(4500);
await state('example via address');

await win.keyboard.press('Control+L');
await win.waitForTimeout(200);
await win.keyboard.type('https://www.google.com');
await win.keyboard.press('Enter');
await win.waitForTimeout(6500);
await state('google via address');

await win.evaluate(async () => {
  await window.stage.tabs.create({ url: 'https://en.wikipedia.org/wiki/Spaced_repetition' });
});
await win.waitForTimeout(6000);
await state('wikipedia');

const link = await app.evaluate(async ({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const child = w.contentView.children.find((c) => {
    try { return c.webContents.getURL().includes('wikipedia'); } catch { return false; }
  });
  if (!child) return null;
  return child.webContents.executeJavaScript(`(() => {
    const a = Array.from(document.querySelectorAll('a')).find((x) => x.href.includes('/wiki/') && x.textContent.trim().length > 4);
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { href: a.href, text: a.textContent.trim().slice(0, 40), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
});
console.log('link', link);

if (link) {
  await app.evaluate(async ({ BrowserWindow }, link) => {
    const w = BrowserWindow.getAllWindows()[0];
    const child = w.contentView.children.find((c) => {
      try { return c.webContents.getURL().includes('wikipedia'); } catch { return false; }
    });
    child.webContents.focus();
    child.webContents.sendInputEvent({ type: 'mouseMove', x: link.x, y: link.y });
    child.webContents.sendInputEvent({ type: 'mouseDown', x: link.x, y: link.y, button: 'left', clickCount: 1 });
    child.webContents.sendInputEvent({ type: 'mouseUp', x: link.x, y: link.y, button: 'left', clickCount: 1 });
  }, link);
  await win.waitForTimeout(3500);
  await state('after page click');
}

await win.screenshot({ path: path.join(profile, 'state.png') });
await app.close();
console.log('done');
