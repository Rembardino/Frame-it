import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { writeFile, readdir } from 'node:fs/promises';
const directory=process.argv[2]||'artifacts/asset-audit/humans',out=process.argv[3]||'artifacts/asset-audit';
const files = (await readdir(directory)).filter(n=>n.endsWith('.glb')).sort();
await writeFile(`${out}/preview.html`, `<!DOCTYPE html><html><style>body{margin:0;background:#1d2731;color:white;font:16px Arial}main{display:grid;grid-template-columns:repeat(5,320px)}figure{margin:0}p{margin:6px 12px;height:36px}canvas{display:block}</style><main></main><script type="module">
import * as T from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(320,300);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
const loader=new GLTFLoader();
for(const file of ${JSON.stringify(files)}){
 const gltf=await loader.loadAsync('/'+${JSON.stringify(directory)}+'/'+file);const scene=new T.Scene();scene.background=new T.Color(0x364554);scene.add(new T.HemisphereLight(0xffffff,0x758088,2.8));const light=new T.DirectionalLight(0xffffff,2.5);light.position.set(3,5,4);scene.add(light);scene.add(gltf.scene);
 const box=new T.Box3().setFromObject(gltf.scene),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());const camera=new T.PerspectiveCamera(35,320/300,0.01,100);camera.position.copy(center).add(new T.Vector3(size.y*.25,size.y*.08,size.y*1.9));camera.lookAt(center);renderer.render(scene,camera);
 const figure=document.createElement('figure'),img=document.createElement('img');img.src=renderer.domElement.toDataURL();figure.append(img);const p=document.createElement('p');p.textContent=file+' · '+gltf.scene.getObjectByProperty('isMesh',true)?.name;figure.append(p);document.querySelector('main').append(figure);
}
window.ready=true;</script>`);
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,...(existsSync(chromium.executablePath())?{}:{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'})});
try{const page=await browser.newPage({viewport:{width:1600,height:1100}});page.on('pageerror',e=>console.log(e));await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${out}/preview.html`);await page.waitForFunction(()=>window.ready,{},{timeout:180000});await page.screenshot({path:`${out}/humans.png`,fullPage:true});console.log('Human contact sheet ready');}finally{await browser.close();await server.close();}
