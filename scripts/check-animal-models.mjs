import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const out='artifacts/animals/review';await mkdir(out,{recursive:true});
const server=await createServer({cacheDir:'artifacts/vite-animal-check',server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await server.listen();
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=await chromium.launch({headless:true,...(existsSync(edge)?{executablePath:edge}:{})});
try{
  const page=await browser.newPage({viewport:{width:1000,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?debug&sport=ciclismo`);await page.waitForFunction(()=>window.frameit);
  const reports=[];
  for(const species of ['dog','eagle','duck','deer']){
    const report=await page.evaluate(async species=>{
      window.dispatchEvent(new Event('frameit:pause'));
      const T=await import('/node_modules/three/build/three.module.js');
      const {loadAnimalModels,importedAnimal}=await import('/src/render/animalModels.ts');await loadAnimalModels();
      const asset=importedAnimal(species),scene=new T.Scene();scene.background=new T.Color(0xc4d3db);
      scene.add(new T.HemisphereLight(0xffffff,0x657055,2));const light=new T.DirectionalLight(0xfff1da,3);light.position.set(2,5,3);scene.add(light);
      scene.add(asset.root);
      const state=()=>{const values=[];asset.root.traverse(o=>{if(o.isBone)values.push(...o.quaternion.toArray(),...o.position.toArray());});return values;};
      asset.sample(.7,.3,true);const first=state();asset.sample(1.7,.8,true);const second=state();asset.sample(.7,.3,true);const seek=state();
      const replayError=Math.max(...first.map((v,i)=>Math.abs(v-seek[i]))),motion=Math.max(...first.map((v,i)=>Math.abs(v-second[i])));
      // Seeking across water/flight or walking/idle must restore the original pose too.
      asset.sample(1.1,.4,false,false);const resting=state();asset.sample(2.7,.6,true,false);
      asset.sample(.7,.3,true);const switched=state();
      const switchError=Math.max(...first.map((v,i)=>Math.abs(v-switched[i])));
      const restMotion=Math.max(...first.map((v,i)=>Math.abs(v-resting[i])));
      asset.root.traverse(o=>{if(o.isSkinnedMesh)o.computeBoundingBox();});
      const box=new T.Box3().setFromObject(asset.root),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),heads=[];
      asset.root.traverse(o=>{if(o.isBone&&/head|pelvis/i.test(o.name))heads.push({name:o.name,at:o.getWorldPosition(new T.Vector3()).toArray()});});
      const camera=new T.PerspectiveCamera(35,innerWidth/innerHeight,.01,100);camera.position.copy(center).add({x:species==='dog'?1.7:1.9,y:species==='dog'?.7:1.1,z:species==='dog'?2.1:2.5});camera.lookAt(center);
      const floor=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshStandardMaterial({color:0x9dae92}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;if(species==='dog'||species==='deer')scene.add(floor);
      document.querySelectorAll('body > :not(#app)').forEach(e=>e.style.display='none');
      frameit.stage.renderer.setAnimationLoop(()=>frameit.stage.renderer.render(scene,camera));
      return{species,model:asset.root.userData.animal,bones:first.length/7,replayError,switchError,restMotion,motion,size:size.toArray(),min:box.min.toArray(),heads};
    },species);
    assert(report.bones>=10,`${species}: skeleton missing`);assert(report.motion>.01,`${species}: supplied animation did not play`);assert(report.replayError<1e-7,`${species}: replay seek changed pose`);
    assert(report.switchError<1e-7,`${species}: switching animation broke replay`);
    if(species==='duck'||species==='deer')assert(report.restMotion>.01,`${species}: water/idle pose missing`);
    assert(report.size.every(n=>Number.isFinite(n)&&n<2.6),`${species}: wrong scale`);
    if(species==='dog')assert(report.min[1]>-.12,`Dog paws below the road: ${report.min[1]}`);
    await page.screenshot({path:`${out}/${species}.png`});reports.push(report);console.log(JSON.stringify(report));
  }
  assert.deepEqual(errors,[],'Animal browser/shader errors');
  await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));
}finally{await browser.close();await server.close();}
