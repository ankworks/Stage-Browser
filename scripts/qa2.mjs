import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repo = path.resolve('.');
const profile = path.join(process.env.TEMP || repo, 'stage-qa2', 'profile');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'state'), { recursive: true });
fs.writeFileSync(path.join(profile, 'state', 'settings.json'), JSON.stringify({ firstRunDone: true, appearance: 'dark', newTabBackground: 'aurora' }));

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

const shell = async () => win.evaluate(() => ({
  sidebar: !!document.querySelector('.st-sidebar'),
  tabs: document.querySelectorAll('.st-vtab').length,
  bg: document.documentElement.dataset.newtab,
  ink: document.querySelector('.st-address-actions .is-on')?.getAttribute('title') ?? null,
  addr: document.querySelector('.st-omni__input')?.value ?? null,
}));
const views = async () => app.evaluate(async ({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  return w.contentView.children.map((c) => {
    try { return { url: c.webContents.getURL(), bounds: c.getBounds(), focused: c.webContents.isFocused() }; }
    catch { return null; }
  });
});
const pageLayer = async () => app.evaluate(async ({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const c = w.contentView.children.find((v) => { try { return v.webContents.getURL().includes('wikipedia'); } catch { return false; } });
  if (!c) return null;
  return c.webContents.executeJavaScript(`(() => { const h = document.getElementById('stage-ink-layer'); return { host: !!h, display: h?.style.display ?? null, pointer: h?.style.pointerEvents ?? null }; })()`);
});

console.log('boot', await shell(), await views());
await win.screenshot({ path: path.join(profile, '01-single.png') });

// Address bar from the internal newtab page.
await win.keyboard.press('Control+L');
await win.waitForTimeout(150);
await win.keyboard.type('https://en.wikipedia.org/wiki/Spaced_repetition');
await win.keyboard.press('Enter');
await win.waitForTimeout(6000);
console.log('wiki', await shell(), await views(), 'layer', await pageLayer());
await win.screenshot({ path: path.join(profile, '02-wiki.png') });

// Add a second tab via Settings -> Tabs, and confirm the rail appears.
await win.evaluate(() => window.stage.tabs.create({ url: 'stage://newtab' }));
await win.waitForTimeout(1200);
console.log('second', await shell(), await views());
await win.screenshot({ path: path.join(profile, '03-two-tabs.png') });

// Back to Wikipedia, then turn markup on with the IPC path used by the pen button.
const tabId = await win.evaluate(() => window.stage.getState().then((s) => s.activeTabId));
await win.evaluate(async () => {
  const s = await window.stage.getState();
  const wiki = s.tabs.find((t) => t.url.includes('wikipedia'));
  await window.stage.tabs.activate(wiki.id);
});
await win.waitForTimeout(1300);
await win.evaluate(() => window.stage.ink.set(true));
await win.waitForTimeout(600);
console.log('ink-on', await shell(), await pageLayer(), await views());

// Draw two gestures over the page, then capture the native page.
await app.evaluate(async ({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const c = w.contentView.children.find((v) => { try { return v.webContents.getURL().includes('wikipedia'); } catch { return false; } });
  c.webContents.sendInputEvent({ type: 'mouseMove', x: 420, y: 250 });
  c.webContents.sendInputEvent({ type: 'mouseDown', x: 420, y: 250, button: 'left', clickCount: 1 });
  for (let i = 0; i < 30; i += 1) c.webContents.sendInputEvent({ type: 'mouseMove', x: 420 + i * 7, y: 250 + Math.sin(i / 3) * 45, button: 'left' });
  c.webContents.sendInputEvent({ type: 'mouseUp', x: 630, y: 260, button: 'left', clickCount: 1 });
  c.webContents.sendInputEvent({ type: 'mouseMove', x: 360, y: 390 });
  c.webContents.sendInputEvent({ type: 'mouseDown', x: 360, y: 390, button: 'left', clickCount: 1 });
  for (let i = 0; i < 24; i += 1) c.webContents.sendInputEvent({ type: 'mouseMove', x: 360 + i * 9, y: 390 + i * 3, button: 'left' });
  c.webContents.sendInputEvent({ type: 'mouseUp', x: 576, y: 462, button: 'left', clickCount: 1 });
});
await win.waitForTimeout(500);
const shot = await app.evaluate(async ({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const c = w.contentView.children.find((v) => { try { return v.webContents.getURL().includes('wikipedia'); } catch { return false; } });
  const img = await c.webContents.capturePage();
  return img.toPNG().toString('base64');
});
fs.writeFileSync(path.join(profile, '04-ink.png'), Buffer.from(shot, 'base64'));

// Close the markup layer and confirm the page is clickable again.
await win.evaluate(() => window.stage.ink.set(false));
await win.waitForTimeout(300);
console.log('ink-off', await shell(), await pageLayer());

// Close the second tab; the rail should disappear and the view expand.
const extra = await win.evaluate(async () => { const s = await window.stage.getState(); return s.tabs.find((t) => t.url === 'stage://newtab' && t.id !== s.activeTabId)?.id ?? null; });
if (extra) await win.evaluate((id) => window.stage.tabs.close(id), extra);
await win.waitForTimeout(1200);
console.log('back-to-one', await shell(), await views());
await win.screenshot({ path: path.join(profile, '05-one-again.png') });

console.log('profile', profile);
await app.close();
