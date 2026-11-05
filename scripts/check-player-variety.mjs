import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = 'artifacts/player-variety'; await mkdir(out, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' }); await server.listen();
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }) });
const reports = [];
try {
  for (const sport of (process.argv.slice(2).length ? process.argv.slice(2) : ['calcio', 'basket', 'pallavolo', 'ciclismo'])) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?debug&sport=${sport}`);
    await page.waitForFunction(() => window.frameit?.views, null, { timeout: 60000 });
    const report = await page.evaluate(async sport => {
      window.dispatchEvent(new Event('frameit:pause'));
      const T = await import('/node_modules/three/build/three.module.js');
      const { views, match, stage, recorder } = frameit;
      const players = views.views.filter(v => match.actors.includes(v.actor) && v.character.name !== 'athlete-carol');
      const visible = o => { for (let at = o; at; at = at.parent) if (!at.visible) return false; return true; };
      const looks = players.map(v => ({ id: v.actor.id, team: v.actor.team, hairstyle: v.character.model.userData.hairstyle,
        height: v.character.root.scale.y, ...v.character.model.userData.appearance }));
      const hairSources=players.map(v=>{
        const visibleParts=[];let primitive=false;
        v.character.model.traverse(o=>{
          if(!o.isMesh||!/hair/i.test(o.name)||!visible(o))return;
          primitive ||= !o.isSkinnedMesh;
          visibleParts.push({name:o.name,skinned:!!o.isSkinnedMesh,uv:!!o.geometry.getAttribute('uv'),weights:!!o.geometry.getAttribute('skinWeight'),textured:!!o.material.map});
        });
        return{id:v.actor.id,style:v.character.model.userData.hairstyle,visibleParts,primitive};
      });
      const helmets = [];
      if (sport === 'ciclismo') for (const pose of ['normal', 'sprint', 'celebrate', 'fall']) {
        for (const v of players) { match.setPose(v.actor, pose, Infinity); v.actor.poseTime = .5; v.actor.poseBlendTime = 1; }
        views.update(0); stage.scene.updateMatrixWorld(true);
        for (const v of players) {
          const model = v.character.model, shell = model.getObjectByName('cycling-helmet-shell'), inverse = shell.matrixWorld.clone().invert();
          let visibleHair = 0, crown = 0;
          model.traverse(mesh => {
            if (!mesh.isMesh) return;
            if (/hair|beard/i.test(mesh.name) && visible(mesh)) visibleHair++;
            if (!mesh.isSkinnedMesh || !/Body/.test(mesh.name)) return;
            mesh.skeleton.update(); const transform = inverse.clone().multiply(mesh.matrixWorld), p = new T.Vector3();
            const headIndex=mesh.skeleton.bones.findIndex(b=>b.name==='Head'),joints=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
            for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
              let headWeight=0;for(let j=0;j<4;j++)if(joints.getComponent(i,j)===headIndex)headWeight+=weights.getComponent(i,j);
              if(headWeight<.6)continue;
              mesh.getVertexPosition(i, p).applyMatrix4(transform);
              if (p.y > .09 && Math.abs(p.x) < .2 && Math.abs(p.z) < .2) crown = Math.max(crown, (p.x / .124) ** 2 + (p.y / .151) ** 2 + (p.z / .141) ** 2);
            }
          });
          helmets.push({ id: v.actor.id, pose, visibleHair, crown, size: new T.Box3().setFromObject(shell).getSize(new T.Vector3()).toArray() });
        }
      }
      const actor = players[0].actor, model = players[0].character.model, before = structuredClone(model.userData.appearance);
      const saved = recorder.capture({ rx: 0, ry: 0, fov: 40 }, { excitement: 0, hotX: 0, hotLevel: 0, lookUp: 0 });
      let changed;
      for(let attempt=0;attempt<16;attempt++){
        actor.appearance++;views.update(0);changed=structuredClone(model.userData.appearance);
        if(JSON.stringify(changed)!==JSON.stringify(before))break;
      }
      recorder.apply(saved, saved, 0); views.update(0); const restored = structuredClone(model.userData.appearance);
      const scene = new T.Scene(); scene.background = new T.Color(0xdce3df);
      scene.add(new T.HemisphereLight(0xffffff, 0x6c6b65, 2.4));
      const sun = new T.DirectionalLight(0xffefd9, 3.5); sun.position.set(-3, 7, 8); scene.add(sun);
      const floor = new T.Mesh(new T.PlaneGeometry(70, 50).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0xb5c3b1 })); floor.position.y = -.01; scene.add(floor);
      const sample = players.slice(0, sport === 'ciclismo' ? 4 : 14);
      sample.forEach((v, i) => {
        v.actor.pos.set(((i % 7) - (Math.min(sample.length, 7) - 1) / 2) * (sport === 'ciclismo' ? 1.6 : 1.1), 0, i < 7 ? .8 : -1.4);
        v.actor.heading = sport === 'ciclismo' ? .65 : Math.PI / 2; v.actor.vel.set(0, 0, 0); v.actor.gaitVel?.set(0, 0, 0);
        match.setPose(v.actor, 'normal', Infinity); v.actor.poseBlendTime = 1; scene.add(v.root);
      });
      views.update(0);
      const camera = new T.PerspectiveCamera(sport === 'ciclismo' ? 29 : 35, innerWidth / innerHeight, .01, 100);
      camera.position.set(sport === 'ciclismo' ? 2 : 0, sport === 'ciclismo' ? 3.3 : 3.7, sport === 'ciclismo' ? 9 : 12.5); camera.lookAt(0, sport === 'ciclismo' ? 1.8 : 1.4, 0);
      document.querySelectorAll('body > :not(#app)').forEach(e => e.style.display = 'none');
      stage.renderer.setAnimationLoop(() => stage.renderer.render(scene, camera));
      return { sport, looks, hairSources, helmets, replay: { before, changed, restored } };
    }, sport);
    assert(new Set(report.looks.map(p => p.hairstyle)).size >= Math.min(4, report.looks.length), `${sport}: insufficient natural haircut variety`);
    assert.equal(new Set(report.looks.map(p => `${p.hairstyle}:${p.face}:${p.skin}:${p.hair}:${p.height}`)).size, report.looks.length, `${sport}: cloned players across the two teams`);
    for(const hair of report.hairSources){
      assert(!hair.primitive,'Procedural hair substituted for the original asset');
      if(sport!=='ciclismo')assert(hair.visibleParts.some(p=>!/Beard/.test(p.name)),'Original hair was not restored');
      assert(hair.visibleParts.every(p=>p.skinned&&p.uv&&p.weights&&p.textured),'Hair lost its original texture or skeleton');
    }
    for (const helmet of report.helmets) {
      assert.equal(helmet.visibleHair, 0, `Hair escapes cyclist ${helmet.id}'s helmet during ${helmet.pose}`);
      assert(helmet.crown <= 1.03, `Cyclist ${helmet.id}'s skull intersects helmet during ${helmet.pose}: ${helmet.crown}`);
      assert(helmet.size.every(n => n > .1 && n < .55), 'Cycling helmet out of scale');
    }
    assert.notDeepEqual(report.replay.changed, report.replay.before); assert.deepEqual(report.replay.restored, report.replay.before, 'Replay lost the player appearance');
    assert.deepEqual(errors, [], `${sport}: rendering error`);
    await page.screenshot({ path: `${out}/${sport}.png` }); reports.push(report);
    if(sport==='basket'){
      await page.setViewportSize({width:1440,height:560});
      await page.evaluate(async()=>{
        const T=await import('/node_modules/three/build/three.module.js'),{views,match,stage}=frameit;
        const scene=new T.Scene();scene.background=new T.Color(0xdce3df);scene.add(new T.HemisphereLight(0xffffff,0x74776d,2.1));
        const sun=new T.DirectionalLight(0xfff0dd,2.7);sun.position.set(-3,5,8);scene.add(sun);
        const selected=[0,1,2,4,5,6].map(id=>views.views.find(v=>v.actor.id===id));
        selected.forEach((v,i)=>{scene.add(v.root);v.actor.pos.set((i-2.5)*.45,0,0);v.actor.heading=Math.PI/2;match.setPose(v.actor,'normal',Infinity);v.actor.poseBlendTime=1;});
        views.update(0);scene.updateMatrixWorld(true);
        selected.forEach(v=>{v.root.position.y+=2-v.character.model.getObjectByName('Head').getWorldPosition(new T.Vector3()).y;});
        const camera=new T.PerspectiveCamera(18,innerWidth/innerHeight,.01,100);camera.position.set(0,2.15,3.5);camera.lookAt(0,2.15,0);
        stage.renderer.setSize(innerWidth,innerHeight);stage.renderer.setAnimationLoop(()=>stage.renderer.render(scene,camera));
      });
      await page.screenshot({path:`${out}/natural-hair-closeups.png`});
    }
    console.log(`${sport}: ${report.looks.length} distinct players, ${new Set(report.looks.map(p => p.hairstyle)).size} hair silhouettes, ${report.helmets.length} animated helmet checks and replay OK`);
    await page.close();
  }
  await writeFile(`${out}/report.json`, JSON.stringify(reports, null, 2));
} finally { await browser.close(); await server.close(); }
