import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import sharp from 'sharp';

const out='artifacts/appearance';await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile('docs/team-logos.json','utf8'));
for(const {runtime} of manifest.assets){
  const meta=await sharp(runtime).metadata(),stats=await sharp(runtime).stats();
  assert(meta.hasAlpha&&stats.channels[3].min===0&&stats.channels[3].max===255,`${runtime}: real transparent crest required`);
}
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,...(existsSync(chromium.executablePath())?{}:{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'})});
const reports=[];
try{
  for(const sport of (process.argv.slice(2).length?process.argv.slice(2):['calcio','basket','pallavolo','boxe','tennis','golf','ciclismo','vela'])){
    const page=await browser.newPage({viewport:{width:1200,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?debug&lang=it&sport=${sport}`);
    await page.waitForFunction(()=>window.frameit?.views,null,{timeout:60000});
    const result=await page.evaluate(async sport=>{
      window.dispatchEvent(new Event('frameit:pause'));
      const {views,stage,match,recorder}=frameit;
      const {CONFIG}=await import('/src/config.ts'),{teamCatalog,selectTeams}=await import('/src/teams.ts');
      const catalog=teamCatalog(sport);
      for(const key of Object.keys(localStorage))if(key.startsWith(`frameit.teams.${sport}.`))localStorage.removeItem(key);
      const fixtures=Array.from({length:6},()=>selectTeams(sport));
      const players=views.views.filter(v=>match.actors.includes(v.actor)).map(v=>{
        const meshes=[];v.character.model.traverse(o=>{if(o.isMesh)meshes.push(o);});
        const shirt=meshes.find(m=>/Shirt/.test(m.name));
        return{id:v.actor.id,team:v.actor.team,height:v.character.root.scale.y,
          body:meshes.find(m=>m.name==='Body')?.geometry.uuid,
          complexion:meshes.find(m=>m.name==='Body')?.material.color.getHex(),
          hairstyle:v.character.model.userData.hairstyle,
          hair:meshes.filter(m=>/Hair/.test(m.name)).map(m=>[m.visible,m.material.color.getHex()]),
          shirt:shirt?.material.color.getHex(),legacyPrint:!!shirt?.material.map,
          markings:shirt?.material.userData.club?{number:shirt.material.userData.club.uniforms.clubNumber.value,front:shirt.material.userData.club.uniforms.clubFrontNumber.value}:null,
          cleats:meshes.filter(m=>/Shoes/.test(m.name)&&m.visible).length,
          boxingBoots:meshes.filter(m=>m.name==='boxing-flat-sole').length};
      });
      const {Vector3,Box3}=await import('/node_modules/three/build/three.module.js');
      const {Character}=await import('/src/render/characters.ts'),{createAthlete}=await import('/src/render/athlete.ts');
      let maxAccessory=0;
      if(sport==='pallavolo')for(const id of [20,21])for(const look of ['banana','dino','clown','astronaut']){
        const actor={...match.extras.find(a=>a.role==='spectator'),id,look};
        const character=await Character.create(actor,createAthlete(actor));
        character.root.updateMatrixWorld(true);
        character.model.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh){const size=new Box3().setFromObject(o).getSize(new Vector3());maxAccessory=Math.max(maxAccessory,size.x,size.y,size.z);}});
      }
      const saved=recorder.clip('Kit test',0,0,1);
      const crestCount=[...document.querySelectorAll('.team-crest')].filter(image=>image.complete&&image.naturalWidth>0).length;
      stage.renderer.compile(stage.scene,stage.camera);stage.renderer.render(stage.scene,stage.camera);
      return{sport,catalog:catalog.map(c=>({id:c.id,name:c.name,logo:!!c.logo})),fixtures:fixtures.map(pair=>pair.map(c=>c.id)),
        players,maxAccessory,crestCount,savedTeams:saved.teams,activeTeams:CONFIG.teams.map(c=>c.id)};
    },sport);
    assert.equal(new Set(result.catalog.map(c=>c.name)).size,12,`${sport}: 12 distinct names`);
    assert(result.catalog.every(c=>c.logo),`${sport}: missing team crest`);
    assert.equal(new Set(result.fixtures.flat()).size,12,`${sport}: clubs repeated before completing the rotation`);
    assert.equal(result.crestCount,sport==='ciclismo'?0:2,`${sport}: unexpected scoreboard crests`);
    if(sport==='ciclismo'){
      assert.equal(result.savedTeams,undefined,'Individual cycling clip still carries team identities');
      assert(new Set(result.players.map(p=>p.shirt)).size>=10,'Cyclists need individual jersey colours');
    }else assert.deepEqual(result.savedTeams.map(c=>c.id),result.activeTeams,`${sport}: clip lost club identities`);
    if(sport==='basket'||sport==='pallavolo')for(const team of [0,1]){
      const players=result.players.filter(p=>p.team===team);
      assert(new Set(players.map(p=>p.body)).size>=5,`${sport}: repeated body proportions`);
      assert(new Set(players.map(p=>p.height)).size>=5,`${sport}: repeated height`);
      assert(new Set(players.map(p=>p.hairstyle)).size>=3,`${sport}: insufficient natural haircut variety`);
    }
    if(sport==='calcio')assert(result.players.every(p=>!p.legacyPrint&&p.markings?.number&&!p.markings.front),'Football needs a single back number with no baked number or floating plane');
    if(sport==='boxe')assert(result.players.every(p=>p.cleats===0&&p.boxingBoots===2),'Boxers still have football boots');
    assert(result.maxAccessory<.8,`Accessory grew to ${result.maxAccessory} metres on a differently scaled skeleton`);
    assert.deepEqual(errors,[],`${sport}: browser/shader errors`);
    await page.screenshot({path:`${out}/${sport}-menu.png`});
    // Capture a row of different athletes from the same team, with their shared kit, for visual review.
    if(sport==='basket'||sport==='pallavolo'){
      await page.evaluate(async()=>{
        const {views,match,stage}=frameit;
        document.querySelectorAll('.overlay,#hud,.debug-canvas,.debug-panel').forEach(e=>e.style.display='none');
        [...match.actors,...match.extras].forEach(a=>a.active=match.actors.includes(a));
        for(const team of [0,1]){
          const row=match.actors.filter(a=>a.team===team);
          row.forEach((a,i)=>{a.pos.set((i-(row.length-1)/2)*1.35,0,team===0?1.1:-1.1);a.heading=Math.PI/2;a.vel.set(0,0,0);a.gaitVel?.set(0,0,0);match.setPose(a,'normal',Infinity);a.poseBlendTime=1;});
        }
        views.update(0);stage.camera.position.set(0,4.7,12.8);stage.camera.lookAt(0,1.2,0);stage.camera.fov=42;stage.camera.updateProjectionMatrix();stage.renderer.render(stage.scene,stage.camera);
      });
      await page.screenshot({path:`${out}/${sport}-roster.png`});
    }
    if(sport==='ciclismo'){
      const dog=await page.evaluate(async()=>{
        const T=await import('/node_modules/three/build/three.module.js');
        const {Fauna}=await import('/src/sim/fauna.ts'),{FaunaViews}=await import('/src/render/fauna.ts');
        const scene=new T.Scene();scene.background=new T.Color(0xd9e4df);
        scene.add(new T.HemisphereLight(0xffffff,0x6f7966,2.4));
        const light=new T.DirectionalLight(0xffeed9,3);light.position.set(2,4,3);scene.add(light);
        const floor=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshStandardMaterial({color:0xc1cdb4}));floor.rotation.x=-Math.PI/2;floor.position.y=-.01;scene.add(floor);
        const fauna=new Fauna();fauna.spawn('dog',[{p:new T.Vector3(0,0,0),t:0},{p:new T.Vector3(1,0,0),t:4}],0);
        const view=new FaunaViews(scene);await view.ready;view.update({fauna,time:1});
        const model=scene.getObjectByName('trail-dog');const size=new T.Box3().setFromObject(model).getSize(new T.Vector3());
        const camera=new T.PerspectiveCamera(33,innerWidth/innerHeight,.01,100);camera.position.set(1.8,1.04,1.7);camera.lookAt(.35,.3,0);
        document.querySelectorAll('body > :not(#app)').forEach(e=>e.style.display='none');
        frameit.stage.renderer.render(scene,camera);
        return{size:size.toArray(),model:model.userData.animal,animated:!!view.pools.get('dog')[0].asset};
      });
      assert.equal(dog.model,'husky');assert(dog.animated,'Imported canine animation missing');assert(dog.size.every(n=>n<1.3),'Dog is out of scale');
      result.dog=dog;await page.screenshot({path:`${out}/cycling-dog.png`});
    }
    reports.push(result);console.log(`${sport}: catalog, rotation, crests, uniforms and accessory scale OK`);await page.close();
  }
  await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));
}finally{await browser.close();await server.close();}
