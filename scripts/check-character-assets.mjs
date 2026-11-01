import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,...(existsSync(chromium.executablePath())?{}:{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'})});
const out='artifacts/characters';await mkdir(out,{recursive:true});
const sports=process.argv.slice(2).length?process.argv.slice(2):['calcio','basket','boxe','tennis','pallavolo','golf','ciclismo','vela'];
const reports=[];
try{
 for(const sport of sports){
  const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.stack);});
  page.on('requestfailed',r=>console.log('Request failed:',r.url(),r.failure()));
  page.on('console',m=>{if(m.type()==='error')console.log(m.text());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?debug&lang=it&sport=${sport}`);
  await page.waitForFunction(()=>window.frameit?.views);
  await page.evaluate(()=>window.frameit.views.ready.catch(e=>{console.error(e.stack);throw e;}));
  const result=await page.evaluate(async()=>{
   window.dispatchEvent(new Event('frameit:pause'));document.getElementById('start').style.display='none';
   document.querySelectorAll('.debug-canvas,.debug-panel,.hud,.tutorial').forEach(e=>e.style.display='none');
   const {match,views,stage,recorder}=window.frameit;
   for(const a of [...match.actors,...match.extras])a.active=false;
   const sport=new URLSearchParams(location.search).get('sport');
   const actor=match.actors.find(a=>a.role!=='gk'&&(!['basket','tennis','pallavolo','golf'].includes(sport)||a.team===1))??match.actors[0];actor.active=true;actor.vel.set(0,0,0);
   if(sport!=='golf')actor.heading=0;
   const action={calcio:['kick',.9,'footballShot'],basket:['shoot',.8],boxe:['combo',2.2,'boxingCombo'],tennis:['racket',.8],pallavolo:['spike',.8],golf:['swing',1.7,'golfDrive'],ciclismo:['sprint',1.5],vela:['grind',1.5]}[sport];
   match.setPose(actor,action[0],action[1],null,action[2]);actor.poseTime=action[1]*(sport==='golf'?.5:.32);actor.poseBlendTime=1;views.update(0);
   const view=views.views.find(v=>v.actor===actor);
   const snapshot=()=>{const result=[];view.character.model.traverse(o=>{if(o.isBone)result.push(...o.quaternion.toArray(),...o.position.toArray());});return result;};
   const before=snapshot(),cam={rx:0,ry:0,fov:40},world={excitement:0,hotX:0,hotLevel:0,lookUp:0},saved=recorder.capture(cam,world);
   match.setPose(actor,'celebrate',2);actor.poseTime=1;views.update(0);recorder.apply(saved,saved,0);views.update(0);
   const after=snapshot(),replayError=Math.max(...before.map((v,i)=>Math.abs(v-after[i])));
   const {Box3,Vector3}=await import('/node_modules/three/build/three.module.js');
   view.character.model.updateWorldMatrix(true,true);view.character.model.traverse(o=>{if(o.isSkinnedMesh)o.computeBoundingBox();});
   const center=new Box3().setFromObject(view.character.root).getCenter(new Vector3());
   stage.camera.position.copy(center).add({x:4,y:1.1,z:5});stage.camera.lookAt(center);stage.camera.fov=30;stage.camera.updateProjectionMatrix();
   stage.renderer.setAnimationLoop(()=>stage.renderer.render(stage.scene,stage.camera));stage.renderer.render(stage.scene,stage.camera);
   const characters=[];views.group.traverse(o=>{if(o.userData.character)characters.push({name:o.userData.character,motion:o.userData.motion,visible:o.visible});});
   const {isHumanModel,resolveAssetClip}=await import('/src/render/characters.ts');
   const allHumans=views.views.every(v=>v.actor.look==='mascot'||isHumanModel(v.character.name));
   const crowdParts=stage.scene.children.filter(o=>o.isInstancedMesh&&o.geometry.hasAttribute('fanState')&&o.geometry.hasAttribute('enterPosition')&&o.geometry.hasAttribute('talkingPosition')).length;
   const legacy=resolveAssetClip({group:'boxingJab',variant:10,time:0,duration:1,contact:.32,loop:false,catalog:2})?.id;
   const added=resolveAssetClip({group:'boxingJab',variant:10,time:0,duration:1,contact:.32,loop:false,catalog:3})?.id;
   if(sport==='boxe'){
    const originalCatalog=saved.actors[0].animationCatalog;delete saved.actors[0].animationCatalog;
    recorder.apply(saved,saved,0);if(match.actors[0].animationCatalog!==2)throw Error('Old clip did not retain its catalog');
    saved.actors[0].animationCatalog=originalCatalog;recorder.apply(saved,saved,0);views.update(0);
   }
   const {assetMotion}=await import('/src/animation/assetMotion.ts');
   const oldOfficial=assetMotion({...actor,role:'ref',pose:'argue',gesture:undefined,animationCatalog:2},0,false);
   if(oldOfficial!==null)throw Error('Old clips must preserve procedural gestures without an original asset');
   const {animationStats}=await import('/src/render/characters.ts');return{...animationStats(),characters,allHumans,crowdParts,replayError,legacy,added,selectedModel:view.character.name,geometries:stage.renderer.info.memory.geometries};
  });
  await page.screenshot({path:`${out}/${sport}.png`});assert.deepEqual(errors,[],`${sport}: browser errors`);assert(result.characters.length>0);assert(result.clips>=160);
  assert(result.allHumans,`${sport}: fantasy athlete`);assert(result.crowdParts>0,`${sport}: procedural crowd`);assert(result.replayError<1e-7,`${sport}: replay changed imported joint transforms`);
  assert.equal(result.selectedModel,sport==='boxe'?'rpg-boxer':['basket','tennis','pallavolo','golf'].includes(sport)?'rpg-athlete-female':'footballer',`${sport}: expected imported body`);
  assert.equal(result.legacy,'cross_punch','Old recordings must preserve the original animation pool');assert(result.added.startsWith('quaternius_'),'New recordings must reach the added variations');
  reports.push({sport,...result});console.log(`${sport}: ${result.characters.length} imported characters, ${result.clips} animation clips`);await page.close();
 }
 await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));
 const failure=await browser.newPage(),failureErrors=[];failure.on('pageerror',e=>failureErrors.push(e.message));
 await failure.route('**/animations.bin.gz',route=>route.fulfill({status:404,body:'Missing animation asset'}));
 await failure.goto(`http://127.0.0.1:${server.httpServer.address().port}/?lang=it`);
 await failure.waitForFunction(()=>document.getElementById('start-btn')?.textContent==='Riprova');
 assert.equal(await failure.locator('#start-btn').isEnabled(),true);assert.equal(await failure.locator('#tutorial-btn').isDisabled(),true);
 assert.deepEqual(failureErrors,[],'Asset failure should offer retry without an unhandled rejection');await failure.close();
 console.log('Missing animation asset: visible retry, match gated, no unhandled rejection');
}finally{await browser.close();await server.close();}
