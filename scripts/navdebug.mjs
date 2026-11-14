import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repo = path.resolve('.');
const profile = path.join(process.env.TEMP || repo, 'stage-navdebug', 'profile');
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
win.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
win.on('pageerror', (err) => console.log('[pageerror]', err.message));
await win.waitForTimeout(1800);

const snap = async (label) => {
  const info = await win.evaluate(() => ({
    active: document.activeElement?.className ?? document.activeElement?.tagName,
    value: document.querySelector('.st-omni__input')?.value ?? null,
    state: null,
  }));
  const boot = await win.evaluate(() => window.stage.getState());
  console.log(label, JSON.stringify({ ...info, activeTabId: boot.activeTabId, tabs: boot.tabs.map((t) => ({ id: t.id, url: t.url, title: t.title })) }));
};

await snap('boot');

await win.keyboard.press('Control+L');
await win.waitForTimeout(300);
await snap('after ctrl+l');

await win.keyboard.type('https://example.com');
await win.waitForTimeout(300);
await snap('after typing');

await win.keyboard.press('Enter');
await win.waitForTimeout(2500);
await snap('after enter');

// Direct IPC call should tell us whether the backend navigates.
const result = await win.evaluate(async () => {
  const b = await window.stage.getState();
  return { id: b.activeTabId, result: await window.stage.tabs.navigate(b.activeTabId, 'https://example.com') };
});
console.log('direct navigate', JSON.stringify(result));
await win.waitForTimeout(3000);
await snap('after direct');

await app.close();
console.log('done');
