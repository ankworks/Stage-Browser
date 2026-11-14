import { _electron as electron } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require=createRequire(import.meta.url); const repo=path.resolve('.');
const profile=path.join(process.env.TEMP||repo,'stage-jsclick','profile');
fs.rmSync(profile,{recursive:true,force:true}); fs.mkdirSync(path.join(profile,'state'),{recursive:true});
fs.writeFileSync(path.join(profile,'state','settings.json'),JSON.stringify({firstRunDone:true,appearance:'dark'}));
const app=await electron.launch({executablePath:require('electron'),args:['.'],cwd:repo,env:{...process.env,STAGE_USER_DATA:profile,ELECTRON_DISABLE_SECURITY_WARNINGS:'1'}});
const win=await app.firstWindow(); await win.waitForTimeout(1500);
await win.evaluate(async()=>{await window.stage.tabs.create({url:'https://en.wikipedia.org/wiki/Spaced_repetition'});});
await win.waitForTimeout(5000);
const info=async()=>app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const c=w.contentView.children.find(c=>{try{return c.webContents.getURL().includes('wikipedia')}catch{return false}});return c?{url:c.webContents.getURL(),title:c.webContents.getTitle(),loading:c.webContents.isLoading()}:null;});
console.log('before',await info());
const res=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const c=w.contentView.children.find(c=>{try{return c.webContents.getURL().includes('wikipedia')}catch{return false}});return c.webContents.executeJavaScript(`(() => { const a=document.querySelector('a[href="/wiki/Main_Page"]'); if(!a) return 'no link'; a.click(); return 'clicked'; })()`);});
console.log('js',res);
for(let i=0;i<12;i++){await win.waitForTimeout(300);console.log(i,await info());}
await app.close();
