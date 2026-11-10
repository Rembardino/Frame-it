// Visual review of every retained motion on the actual game rig, plus skinning bounds checks.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const sport=process.argv.find(a=>a.startsWith('--sport='))?.split('=')[1]||'calcio';
const onlyRPG=process.argv.includes('--rpg-only');
const out=sport==='calcio'&&!onlyRPG?'artifacts/animation-review':`artifacts/rpg-asset-audit/review-${sport}`;await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,...(existsSync(chromium.executablePath())?{}:{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'})});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}});page.on('pageerror',e=>console.log(e.stack));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?debug&sport=${sport}`);await page.waitForFunction(()=>window.frameit?.views);
 const result=await page.evaluate(async({onlyRPG,sport})=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const manifest=(await import('/src/assets/characters/animations.json')).default;
  const {match,views,stage}=window.frameit;window.dispatchEvent(new Event('frameit:pause'));
  const actor=match.actors.find(a=>a.role!=='gk'&&(sport!=='pallavolo'||a.team===1))??match.actors[1];for(const a of [...match.actors,...match.extras])a.active=false;actor.active=true;actor.pos.set(0,0,0);actor.heading=0;actor.vel.set(0,0,0);
  const view=views.views.find(v=>v.actor===actor),scene=new T.Scene();scene.background=new T.Color(0x263646);scene.add(view.root);
  scene.add(new T.HemisphereLight(0xffffff,0x63778b,2.5));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(3,5,3);scene.add(sun);
  const camera=new T.PerspectiveCamera(35,1,0.01,100);camera.position.set(3.7,2.1,2.9);camera.lookAt(0,.95,0);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(220,220);
  const groups=Object.groupBy(manifest.clips.filter(c=>!onlyRPG||c.id.startsWith('quaternius_')),c=>c.groups[0]),sheets=[],bounds=[];
  for(const [group,clips]of Object.entries(groups)){
   const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=Math.ceil(clips.length*2/5)*250;const ctx=canvas.getContext('2d');ctx.fillStyle='#16212e';ctx.fillRect(0,0,canvas.width,canvas.height);let tile=0;
   for(const [index,clip]of clips.entries()){
    for(const u of [.3,.7]){
     const pool=manifest.clips.filter(c=>c.groups.includes(group)),variant=pool.findIndex(c=>c.id===clip.id);
     actor.pose='normal';actor.gesture=group;actor.gestureVariant=variant-actor.id-(actor.appearance??0)*31;actor.poseTime=clip.duration*u;actor.poseDur=clip.duration;actor.poseBlendTime=1;views.update(0);
     view.character.model.updateMatrixWorld(true);const box=new T.Box3();view.character.model.traverse(o=>{if(o.isSkinnedMesh){o.computeBoundingBox();box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
     bounds.push({source:clip.source,u,min:box.min.toArray(),max:box.max.toArray()});
     renderer.render(scene,camera);const x=tile%5*220,y=Math.floor(tile/5)*250;ctx.drawImage(renderer.domElement,x,y);ctx.fillStyle='white';ctx.font='11px Arial';ctx.fillText(clip.id.slice(0,31),x+4,y+232);ctx.fillText(`${clip.duration.toFixed(2)}s · ${u}`,x+4,y+246);tile++;
    }
   }
   sheets.push({group,url:canvas.toDataURL('image/png')});
  }
  renderer.dispose();stage.renderer.setAnimationLoop(null);return{sheets,bounds};
 },{onlyRPG,sport});
 for(const sheet of result.sheets)await writeFile(`${out}/${sheet.group}.png`,Buffer.from(sheet.url.split(',')[1],'base64'));
 for(const b of result.bounds){assert([...b.min,...b.max].every(Number.isFinite),`Invalid skinning: ${b.source}`);assert(Math.max(...b.max.map((n,i)=>Math.abs(n-b.min[i])))<6,`Exploded skeleton: ${b.source}`);}
 await writeFile(`${out}/bounds.json`,JSON.stringify(result.bounds,null,2));console.log(`${result.bounds.length/2} clips rendered at two points; ${result.sheets.length} contact sheets; all skeleton bounds finite.`);
}finally{await browser.close();await server.close();}
