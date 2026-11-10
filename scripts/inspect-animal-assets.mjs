import {readFile,writeFile,mkdir} from 'node:fs/promises';
import * as T from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
T.TextureLoader.prototype.load=function(url){const texture=new T.Texture();texture.userData.source=url;return texture;};
const audit=[];
for(const path of ['artifacts/animals/source/pack/Realistic Animated Pack/Realistic Animated Pack.fbx','artifacts/animals/source/animated-eagle/source/EAGLE 2.fbx']){
  const bytes=await readFile(path),model=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  model.updateMatrixWorld(true);
  const entries=[];
  model.traverse(o=>{if(o.isMesh){const box=new T.Box3().setFromObject(o);entries.push({name:o.name,parent:o.parent?.name,type:o.type,triangles:(o.geometry.index?.count??o.geometry.attributes.position.count)/3,
    bounds:{min:box.min.toArray(),max:box.max.toArray()},skeleton:o.skeleton?.bones.map(b=>b.name),materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>({name:m.name,map:m.map?.userData.source}))});}});
  const item={path,children:model.children.map(o=>({name:o.name,type:o.type,children:o.children.length})),meshes:entries,animations:model.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.map(t=>t.name)}))};
  audit.push(item);console.log(path);console.log(JSON.stringify({children:item.children,meshes:entries.map(m=>({name:m.name,parent:m.parent,triangles:m.triangles,materials:m.materials})),animations:item.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length}))},null,2));
}
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
for(const path of ['artifacts/animals/source/eagle/source/eagle sketchfab.glb','artifacts/animals/source/rhino/source/Grey rhino.glb']){
  const doc=await io.read(path),root=doc.getRoot();
  const item={path,meshes:root.listMeshes().map(m=>({name:m.getName(),triangles:m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0)})),
    animations:root.listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length})),skins:root.listSkins().length};audit.push(item);console.log(JSON.stringify(item,null,2));
}
await mkdir('artifacts/animals',{recursive:true});await writeFile('artifacts/animals/inventory.json',JSON.stringify(audit,null,2));
