import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const {default:html}=await import('../mobile/generated/game.js');
const out=resolve('artifacts/offline-characters');await mkdir(out,{recursive:true});
const path=resolve(out,'game.html');await writeFile(path,html);
const browser=await chromium.launch({headless:true,...(existsSync(chromium.executablePath())?{}:{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'})});
try{
 for(const sport of ['calcio','boxe','golf']){
  const context=await browser.newContext({offline:true,viewport:{width:960,height:540}}),page=await context.newPage(),errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.goto(pathToFileURL(path).href+`?debug&sport=${sport}`);
  await page.waitForFunction(()=>window.frameit?.views,{},{timeout:60000});
  const loaded=await page.evaluate(()=>{
    const {views,match}=window.frameit;views.update(0);window.dispatchEvent(new Event('frameit:pause'));
    return{count:views.views.length,allImported:views.views.every(v=>v.character&&v.character.model),canStart:!document.getElementById('start-btn').disabled,actors:match.actors.length};
  });
  assert(loaded.count>=loaded.actors&&loaded.allImported&&loaded.canStart,`${sport}: offline models missing`);
  assert.deepEqual(network,[],`${sport}: external runtime asset`);assert.deepEqual(errors,[],`${sport}: offline browser errors`);
  await page.screenshot({path:resolve(out,`${sport}.png`)});console.log(`${sport}: ${loaded.count} characters and compressed animations loaded offline`);await context.close();
 }
}finally{await browser.close();}
