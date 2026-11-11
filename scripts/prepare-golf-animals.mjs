// Extract duck-animation.zip and the nested deer source.zip into artifacts/golf-animals/{duck,deer} before running.
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,resample,textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{const page=await browser.newPage();page.on('console',m=>console.log(m.text()));await page.route('**/convert-empty',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/convert-empty`);
for(const id of ['duck','deer']){
const result=await page.evaluate(async id=>{
const T=await import('/node_modules/three/build/three.module.js');
const {FBXLoader}=await import('/node_modules/three/examples/jsm/loaders/FBXLoader.js');
const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
const manager=new T.LoadingManager();manager.setURLModifier(url=>(url.startsWith('blob:')||url.endsWith('.fbx'))?url:`/artifacts/golf-animals/${id}/textures/${url.split(/[\\/]/).pop()}`);
const path=`/artifacts/golf-animals/${id}/source/${id==='duck'?'Duck':'DEER_DEMO'}.fbx`;
const model=await new FBXLoader(manager).loadAsync(path);
// Explicit supplied textures also replace FBX embedded images consistently.
const meshes=[];model.traverse(o=>{if(o.isMesh)meshes.push(o);});for(const o of meshes){if(!o.isMesh)continue;for(const mat of Array.isArray(o.material)?o.material:[o.material]){mat.map=await new T.TextureLoader().loadAsync(`/artifacts/golf-animals/${id}/textures/${id==='duck'?'DUCK.png':/Antler/i.test(mat.name)?'T_Antler.png':'T_Deer.png'}`);mat.map.colorSpace=T.SRGBColorSpace;mat.metalness=0;mat.roughness=.85;}const convert=mat=>new T.MeshStandardMaterial({name:mat.name,map:mat.map,roughness:.85,side:mat.side,transparent:mat.transparent,opacity:mat.opacity});o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);}
const bytes=await new GLTFExporter().parseAsync(model,{binary:true,animations:model.animations});const data=new Uint8Array(bytes);let binary="";for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(binary);
},id);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);const doc=await io.readBinary(Buffer.from(result,'base64'));for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives())prim.setAttribute('COLOR_0',null);await doc.transform(resample(),dedup(),prune(),textureCompress({encoder:sharp,resize:[512,512],targetFormat:'webp',quality:85}));await io.write(`src/assets/animals/${id}.glb`,doc);console.log(id,doc.getRoot().listAnimations().map(a=>a.getName()));
}}finally{await browser.close();await server.close();}
