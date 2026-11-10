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
 for(const sport of (process.argv.slice(2).length?process.argv.slice(2):['calcio','boxe','golf'])){
  const context=await browser.newContext({offline:true,viewport:{width:960,height:540}}),page=await context.newPage(),errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.goto(pathToFileURL(path).href+`?debug&sport=${sport}`);
  await page.waitForFunction(()=>window.frameit?.views,{},{timeout:60000});
  const loaded=await page.evaluate(()=>{
    const {views,match,stage}=window.frameit;views.update(0);window.dispatchEvent(new Event('frameit:pause'));
    const vector=match.ball.pos.clone().set(0,0,0);
    match.fauna.spawn('dog',[{p:vector,t:0},{p:vector.clone().set(1,0,0),t:3}],match.time);
    match.fauna.spawn('eagle',[{p:vector.clone().set(0,2,0),t:0},{p:vector.clone().set(1,2,0),t:3}],match.time);
    stage.update?.(match);
    return{count:views.views.length,allImported:views.views.every(v=>v.character&&v.character.model),canStart:!document.getElementById('start-btn').disabled,actors:match.actors.length,
      animals:['trail-dog','animated-eagle'].map(name=>stage.scene.getObjectByName(name)?.userData.animal),
      femaleStyles:views.views.filter(v=>v.character.name==='athlete-carol').map(v=>v.character.model.userData.hairstyle)};
  });
  assert(loaded.count>=loaded.actors&&loaded.allImported&&loaded.canStart,`${sport}: offline models missing`);
  assert.deepEqual(loaded.animals,['husky','eagle'],`${sport}: imported animals were not embedded in the offline game`);
  assert(loaded.femaleStyles.every(Boolean),`${sport}: female hairstyle missing offline`);
  assert.deepEqual(network,[],`${sport}: external runtime asset`);assert.deepEqual(errors,[],`${sport}: offline browser errors`);
  await page.screenshot({path:resolve(out,`${sport}.png`)});console.log(`${sport}: ${loaded.count} characters and compressed animations loaded offline`);await context.close();
 }
}finally{await browser.close();}
