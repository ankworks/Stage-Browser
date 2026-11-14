import { _electron as electron } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url); const repo=path.resolve('.');
const profile=path.join(process.env.TEMP||repo,'stage-osclick','profile');
fs.rmSync(profile,{recursive:true,force:true}); fs.mkdirSync(path.join(profile,'state'),{recursive:true});
fs.writeFileSync(path.join(profile,'state','settings.json'),JSON.stringify({firstRunDone:true,appearance:'dark'}));
const app=await electron.launch({executablePath:require('electron'),args:['.'],cwd:repo,env:{...process.env,STAGE_USER_DATA:profile,ELECTRON_DISABLE_SECURITY_WARNINGS:'1'}});
const win=await app.firstWindow(); await win.waitForTimeout(1500);
await win.evaluate(async()=>{await window.stage.tabs.create({url:'https://en.wikipedia.org/wiki/Spaced_repetition'});});
await win.waitForTimeout(5000);
const info=async()=>app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const c=w.contentView.children.find(c=>{try{return c.webContents.getURL().includes('wikipedia')}catch{return false}});return c?{url:c.webContents.getURL(),title:c.webContents.getTitle(),loading:c.webContents.isLoading(),focus:c.webContents.isFocused()}:null;});
console.log('before',await info());
const data=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const c=w.contentView.children.find(c=>{try{return c.webContents.getURL().includes('wikipedia')}catch{return false}});
 const link=await c.webContents.executeJavaScript(`(() => { const a=document.querySelector('a[href="/wiki/Main_Page"]'); const r=a.getBoundingClientRect(); return {x:Math.round(r.left+20),y:Math.round(r.top+r.height/2)}; })()`);
 return {content:w.getContentBounds(), bounds:w.getBounds(), link};
});
console.log('data',data);
const x=data.content.x+236+data.link.x; const y=data.content.y+96+data.link.y;
console.log('screen coords',x,y);
const ps = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo); }'; [M]::SetCursorPos(${x}, ${y}) | Out-Null; Start-Sleep -Milliseconds 150; [M]::mouse_event(0x0002,0,0,0,0); Start-Sleep -Milliseconds 80; [M]::mouse_event(0x0004,0,0,0,0)`;
try { execFileSync('powershell.exe',['-NoProfile','-Command',ps],{stdio:'inherit'}); } catch(e) { console.log('ps fail',e.message); }
for(let i=0;i<15;i++){await win.waitForTimeout(300);console.log(i,await info());}
await app.close();
