import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repo = path.resolve('.');
const profile = path.join(process.env.TEMP || repo, 'stage-clickqa', 'profile');
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
await win.waitForTimeout(1800);

await win.evaluate(async () => {
  await window.stage.tabs.create({ url: 'https://en.wikipedia.org/wiki/Spaced_repetition' });
});
await win.waitForTimeout(6000);

const childInfo = async () => app.evaluate(async ({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const child = w.contentView.children.find((c) => {
    try { return c.webContents.getURL().includes('wikipedia'); } catch { return false; }
  });
  if (!child) return null;
  return { url: child.webContents.getURL(), title: child.webContents.getTitle(), loading: child.webContents.isLoading(), bounds: child.getBounds() };
});
console.log('before', await childInfo());

const link = await app.evaluate(async ({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const child = w.contentView.children.find((c) => {
    try { return c.webContents.getURL().includes('wikipedia'); } catch { return false; }
  });
  return child.webContents.executeJavaScript(`(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/wiki/"]'))
      .map((a) => { const r = a.getBoundingClientRect(); return { a, r }; })
      .filter(({ a, r }) => r.width > 20 && r.height > 8 && r.top > 0 && r.top < innerHeight - 20 && r.left > 0 && r.left < innerWidth - 20);
    if (!links.length) return null;
    const { a, r } = links[0];
    return { href: a.href, text: a.textContent.trim().slice(0, 60), x: Math.round(r.left + Math.min(20, r.width / 2)), y: Math.round(r.top + r.height / 2) };
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
  for (let i = 0; i < 15; i += 1) {
    await win.waitForTimeout(250);
    console.log(i, await childInfo());
  }
  await win.screenshot({ path: path.join(profile, 'after.png') });
}

await app.close();
console.log('done');
