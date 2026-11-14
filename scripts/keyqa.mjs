import { _electron as electron } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require=createRequire(import.meta.url); const repo=path.resolve('.');
const profile=path.join(process.env.TEMP||repo,'stage-keyqa','profile');
fs.rmSync(profile,{recursive:true,force:true}); fs.mkdirSync(path.join(profile,'state'),{recursive:true});
fs.writeFileSync(path.join(profile,'state','settings.json'),JSON.stringify({firstRunDone:true,appearance:'dark'}));
const app=await electron.launch({executablePath:require('electron'),args:['.'],cwd:repo,env:{...process.env,STAGE_USER_DATA:profile,ELECTRON_DISABLE_SECURITY_WARNINGS:'1'}});
const win=await app.firstWindow(); await win.waitForTimeout(1400);
await win.keyboard.press('Control+L'); await win.keyboard.type('https://example.com'); await win.keyboard.press('Enter'); await win.waitForTimeout(3000);
const state=async()=>win.evaluate(()=>({pen:!!document.querySelector('.st-address-actions .is-on'), ink:null}));
const layer=async()=>app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const c=w.contentView.children.find(v=>{try{return v.webContents.getURL().includes('example')}catch{return false}});return c.webContents.executeJavaScript(`(()=>{const h=document.getElementById('stage-ink-layer');return h?.style.display??null})()`)});
console.log('before',await state(),await layer());
// Ctrl+Shift+M while the website (not the shell) has focus.
await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const c=w.contentView.children.find(v=>{try{return v.webContents.getURL().includes('example')}catch{return false}});c.webContents.focus();});
await win.keyboard.press('Control+Shift+M');
await win.waitForTimeout(700);
console.log('after accel',await state(),await layer());
// Escape is handled inside the page preload and must notify main.
await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const c=w.contentView.children.find(v=>{try{return v.webContents.getURL().includes('example')}catch{return false}});c.webContents.focus();});
await win.keyboard.press('Escape');
await win.waitForTimeout(500);
console.log('after esc',await state(),await layer());
await app.close();
