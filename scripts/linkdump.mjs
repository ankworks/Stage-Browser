import { _electron as electron } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const repo = path.resolve('.');
const profile = path.join(process.env.TEMP || repo, 'stage-linkdump', 'profile');
fs.rmSync(profile,{recursive:true,force:true}); fs.mkdirSync(path.join(profile,'state'),{recursive:true});
fs.writeFileSync(path.join(profile,'state','settings.json'), JSON.stringify({firstRunDone:true,appearance:'dark'}));
const app = await electron.launch({executablePath:require('electron'),args:['.'],cwd:repo,env:{...process.env,STAGE_USER_DATA:profile,ELECTRON_DISABLE_SECURITY_WARNINGS:'1'}});
const win = await app.firstWindow(); await win.waitForTimeout(1500);
await win.evaluate(async()=>{await window.stage.tabs.create({url:'https://en.wikipedia.org/wiki/Spaced_repetition'});});
await win.waitForTimeout(5000);
const out = await app.evaluate(async ({BrowserWindow}) => {
 const w=BrowserWindow.getAllWindows()[0];
 const child=w.contentView.children.find(c=>{try{return c.webContents.getURL().includes('wikipedia')}catch{return false}});
 return child.webContents.executeJavaScript(`(() => {
  const all=Array.from(document.querySelectorAll('a[href^="/wiki/"]'));
  return {inner:[innerWidth,innerHeight], count:all.length, samples:all.slice(0,20).map(a=>{const r=a.getBoundingClientRect();return {text:a.textContent.trim().slice(0,30),href:a.getAttribute('href'),r:{x:r.x,y:r.y,w:r.width,h:r.height}}})};
 })()`);
});
console.log(JSON.stringify(out,null,2)); await app.close();
