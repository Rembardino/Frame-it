import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import sharp from 'sharp';

const out='artifacts/tennis-looks';await mkdir(out,{recursive:true});
const server=await createServer({cacheDir:'artifacts/vite-tennis-check',server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await server.listen();
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=await chromium.launch({headless:true,...(existsSync(edge)?{executablePath:edge}:{})});
try{
  const page=await browser.newPage({viewport:{width:420,height:540}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?debug&sport=tennis&lang=it`);await page.waitForFunction(()=>window.frameit);
  await page.evaluate(async()=>{
    window.dispatchEvent(new Event('frameit:pause'));
    const T=await import('/node_modules/three/build/three.module.js'),{match,stage,views}=frameit;
    const actor=match.actors.find(a=>a.team===1),view=views.views.find(v=>v.actor===actor);
    [...match.actors,...match.extras].forEach(a=>a.active=a===actor);
    actor.pos.set(0,0,0);actor.heading=Math.PI/2;actor.vel.set(0,0,0);actor.gaitVel?.set(0,0,0);match.setPose(actor,'normal',Infinity);actor.poseBlendTime=1;
    const scene=new T.Scene();scene.background=new T.Color(0xd3dfe4);scene.add(new T.HemisphereLight(0xffffff,0x64716e,2));
    const light=new T.DirectionalLight(0xfff2dc,2.4);light.position.set(2,4,3);scene.add(light);scene.add(view.root);
    const camera=new T.PerspectiveCamera(30,innerWidth/innerHeight,.01,100);camera.position.set(.8,1.85,2.55);camera.lookAt(0,1.55,0);
    document.querySelectorAll('body > :not(#app)').forEach(e=>e.style.display='none');
    stage.renderer.setAnimationLoop(()=>stage.renderer.render(scene,camera));views.update(0);
  });
  const reports=[],images=[];
  for(let style=0;style<6;style++){
    const result=await page.evaluate(async style=>{
      const {views,match}=frameit,a=match.actors.find(a=>a.team===1),view=views.views.find(v=>v.actor===a),model=view.character.model;
      const snapshot=()=>{const values=[];model.traverse(o=>{if(o.isBone)values.push(...o.quaternion.toArray(),...o.position.toArray());});return values;};
      const before=snapshot();view.character.carol.apply(style);const after=snapshot();
      const rigError=Math.max(...before.map((value,i)=>Math.abs(value-after[i])));
      a.appearance=style;views.update(0);const hair=model.getObjectByName('Hair');
      const bones=[];model.traverse(o=>{if(o.isBone)bones.push(...o.quaternion.toArray(),...o.position.toArray());});
      const {Box3,Vector3}=await import('/node_modules/three/build/three.module.js');
      hair.computeBoundingBox();const box=new Box3().setFromObject(hair);
      return{style,hairstyle:model.userData.hairstyle,hairSize:box.getSize(new Vector3()).toArray(),bones,rigError,
        complexion:model.getObjectByName('BodyHead').material.color.getHex(),cap:model.getObjectByName('Cap').visible};
    },style);
    assert(result.hairSize.every(x=>Number.isFinite(x)&&x<1),'Hair/accessory is out of scale');
    await page.screenshot({path:`${out}/style-${style}.png`});images.push({input:`${out}/style-${style}.png`,left:(style%3)*420,top:Math.floor(style/3)*540});reports.push(result);
  }
  assert.equal(new Set(reports.map(r=>r.hairstyle)).size,6,'Six different hairstyles required');
  assert.equal(new Set(reports.map(r=>r.complexion)).size,6,'Female complexion variation missing');
  for(const result of reports)assert(result.rigError<1e-7,'Appearance changed the animated skeleton');
  const replay=await page.evaluate(()=>{
    const {match,views,recorder}=frameit,a=match.actors.find(a=>a.team===1);a.appearance=2;views.update(0);
    const view=views.views.find(v=>v.actor===a),before=view.character.model.userData.hairstyle;
    const saved=recorder.capture({rx:0,ry:0,fov:40},{excitement:0,hotX:0,hotLevel:0,lookUp:0});
    a.appearance=4;views.update(0);const changed=view.character.model.userData.hairstyle;
    recorder.apply(saved,saved,0);views.update(0);return{before,changed,restored:view.character.model.userData.hairstyle};
  });
  assert.notEqual(replay.before,replay.changed);assert.equal(replay.restored,replay.before,'Saved replay lost the female hairstyle');
  assert.deepEqual(errors,[],'Female appearance browser/shader errors');
  await sharp({create:{width:1260,height:1080,channels:4,background:'#d3dfe4'}}).composite(images).png().toFile(`${out}/six-styles.png`);
  await writeFile(`${out}/report.json`,JSON.stringify({variants:reports.map(({bones,...rest})=>rest),replay},null,2));
  console.log('OK: six female hairstyles, complexion and shape variations, unchanged rig, replay appearance restored');
}finally{await browser.close();await server.close();}
