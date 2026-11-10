import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { anatomicalName } from './character-skeleton.mjs';
import { splitSportUniform } from './split-sport-uniform.mjs';

const source=resolve(process.argv[2]||resolve(process.env.USERPROFILE??'.','OneDrive - Posti Oyj/Desktop/RPG 3D'));
const people=resolve(source,'assets/characters/humans/models');
const textures=resolve(source,'3D asset download/People/Universal Base Characters[Standard]/Universal Base Characters[Standard]/Base Characters/Textures');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);await MeshoptSimplifier.ready;
const donor=await io.read('src/assets/characters/footballer.glb');
const shoeNode=donor.getRoot().listNodes().find(n=>/Shoes/.test(n.getMesh()?.getName()??''));
await mkdir('artifacts/rpg-asset-audit/models',{recursive:true});
const audit=[];
async function fingerprint(path){const bytes=await readFile(path);return{file:relative(source,path).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
async function dependencies(path){
 const json=JSON.parse(await readFile(path,'utf8'));
 const refs=[...new Set([...(json.buffers??[]),...(json.images??[])].map(r=>r.uri).filter(uri=>uri&&!uri.startsWith('data:')))];
 return Promise.all(refs.map(uri=>fingerprint(resolve(dirname(path),decodeURIComponent(uri)))));
}
// The female body is no longer used: women wear Carol's tennis outfit (prepare-mixamo-athletes.mjs).
for(const sex of ['Male']){
 const input=resolve(people,`Superhero_${sex}_FullBody.gltf`),doc=await io.read(input),root=doc.getRoot(),buffer=root.listBuffers()[0];
 const bodyNode=root.listNodes().find(n=>n.getMesh()?.listPrimitives().some(p=>/Superhero/.test(p.getMaterial()?.getName()??'')));
 const bodyMesh=bodyNode.getMesh(),body=bodyMesh.listPrimitives()[0],skin=bodyNode.getSkin(),baseMat=body.getMaterial();
 const light=await readFile(resolve(textures,sex==='Male'?'T_Superhero_Male_Ligh.png':'T_Superhero_Female_Light_BaseColor.png'));
 baseMat.getBaseColorTexture().setImage(light).setMimeType('image/png');
 const baseMatrix=new THREE.Matrix4().fromArray(bodyNode.getWorldMatrix());
 const pieces=splitSportUniform(doc,body,baseMatrix,sex==='Female');
 bodyNode.setMesh(null);
 for(const {name:part,primitive:prim}of pieces){
  prim.setMaterial(part==='Body'?baseMat:doc.createMaterial(part).setBaseColorFactor([1,1,1,1]).setRoughnessFactor(.85));
  const mesh=doc.createMesh(part).addPrimitive(prim),node=doc.createNode(part).setMesh(mesh).setSkin(skin).setMatrix(bodyNode.getMatrix());
  bodyNode.getParentNode().addChild(node);
 }
 // Transfer the supplied football boots to the target rest skeleton; rigid foot weights avoid a second rig.
 const shoePrim=shoeNode.getMesh().listPrimitives()[0],shoePos=shoePrim.getAttribute('POSITION'),shoeNormal=shoePrim.getAttribute('NORMAL');
 const targetJoints=skin.listJoints(),newPositions=new Float32Array(shoePos.getCount()*3),newNormals=new Float32Array(newPositions.length);
 const newJoints=new Uint16Array(shoePos.getCount()*4),newWeights=new Float32Array(newJoints.length);
 const matrices={};
 for(const side of ['Left','Right']){
  const target=targetJoints.find(n=>anatomicalName(n.getName())===side+'Foot'),original=shoeNode.getSkin().listJoints().find(n=>n.getName()===side+'Foot');
  const originalToe=shoeNode.getSkin().listJoints().find(n=>n.getName()===side+'ToeBase');
  const targetToe=targetJoints.find(n=>anatomicalName(n.getName())===side+'ToeBase');
  const from=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(original.getWorldMatrix()));
  const to=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(target.getWorldMatrix()));
  const a=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(originalToe.getWorldMatrix())).sub(from);
  const b=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(targetToe.getWorldMatrix())).sub(to);
  const yaw=Math.atan2(b.x,b.z)-Math.atan2(a.x,a.z);
  matrices[side]={matrix:new THREE.Matrix4().makeTranslation(...to.toArray()).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeTranslation(-from.x,-from.y,-from.z)),index:targetJoints.indexOf(target)};
 }
 for(let i=0;i<shoePos.getCount();i++){
  const p=new THREE.Vector3().fromArray(shoePos.getElement(i,[])),data=matrices[p.x>=0?'Left':'Right'];
  p.applyMatrix4(data.matrix).toArray(newPositions,i*3);
  new THREE.Vector3().fromArray(shoeNormal.getElement(i,[])).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(data.matrix)).toArray(newNormals,i*3);
  newJoints[i*4]=data.index;newWeights[i*4]=1;
 }
 const attr=(type,array)=>doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
 const boots=doc.createPrimitive().setIndices(attr('SCALAR',new Uint32Array(shoePrim.getIndices().getArray())))
  .setAttribute('POSITION',attr('VEC3',newPositions)).setAttribute('NORMAL',attr('VEC3',newNormals))
  .setAttribute('JOINTS_0',attr('VEC4',newJoints)).setAttribute('WEIGHTS_0',attr('VEC4',newWeights))
  .setMaterial(doc.createMaterial('Shoes').setBaseColorFactor([1,1,1,1]).setRoughnessFactor(.8));
 bodyNode.getParentNode().addChild(doc.createNode('Shoes').setMesh(doc.createMesh('Shoes').addPrimitive(boots)).setSkin(skin));
 // Hair uses the target's existing Head joint, without importing duplicate skeletons.
 const hairNames=sex==='Male'?['Hair_Buzzed','Hair_SimpleParted','Hair_Beard']:['Hair_Long','Hair_Buns','Hair_BuzzedFemale'];
 for(const hairName of hairNames){
  const hairDoc=await io.read(resolve(people,hairName+'.gltf'));
  const hairNode=hairDoc.getRoot().listNodes().find(n=>n.getMesh()),hp=hairNode.getMesh().listPrimitives()[0];
  const fromHead=hairNode.getSkin().listJoints().find(n=>n.getName()==='Head'),head=targetJoints.find(n=>n.getName()==='Head');
  const transform=new THREE.Matrix4().fromArray(head.getWorldMatrix()).multiply(new THREE.Matrix4().fromArray(fromHead.getWorldMatrix()).invert());
  const position=hp.getAttribute('POSITION'),normal=hp.getAttribute('NORMAL'),points=new Float32Array(position.getCount()*3),normals=new Float32Array(points.length);
  const joints=new Uint16Array(position.getCount()*4),weights=new Float32Array(joints.length);
  for(let i=0;i<position.getCount();i++){
   new THREE.Vector3().fromArray(position.getElement(i,[])).applyMatrix4(transform).toArray(points,i*3);
   new THREE.Vector3().fromArray(normal.getElement(i,[])).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(transform)).toArray(normals,i*3);
   joints[i*4]=targetJoints.indexOf(head);weights[i*4]=1;
  }
  const texture=hp.getMaterial().getBaseColorTexture(),copy=doc.createTexture(hairName).setImage(texture.getImage()).setMimeType(texture.getMimeType());
  const material=doc.createMaterial(hairName).setBaseColorTexture(copy).setBaseColorFactor([1,1,1,1]).setRoughnessFactor(.9);
  const primitive=doc.createPrimitive().setIndices(attr('SCALAR',new Uint32Array(hp.getIndices().getArray())))
    .setAttribute('POSITION',attr('VEC3',points)).setAttribute('NORMAL',attr('VEC3',normals)).setAttribute('TEXCOORD_0',attr('VEC2',new Float32Array(hp.getAttribute('TEXCOORD_0').getArray())))
    .setAttribute('JOINTS_0',attr('VEC4',joints)).setAttribute('WEIGHTS_0',attr('VEC4',weights)).setMaterial(material);
  bodyNode.getParentNode().addChild(doc.createNode(hairName).setMesh(doc.createMesh(hairName).addPrimitive(primitive)).setSkin(skin));
 }
 for(const mesh of root.listMeshes())if(mesh!==bodyMesh&&!pieces.some(p=>p.name===mesh.getName())&&!/Shoes|Hair_/.test(mesh.getName())){
  const mat=mesh.listPrimitives()[0]?.getMaterial()?.getName()??'';mesh.setName(/Hair/.test(mat)?'Brows':/Eyes/.test(mat)?'Eyes':mesh.getName());
 }
 root.listNodes().forEach(n=>n.setName(anatomicalName(n.getName())));
 for(const mat of root.listMaterials())mat.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(.85);
 for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){p.setAttribute('TANGENT',null);p.setAttribute('COLOR_0',null);}
 await doc.transform(prune(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.3,error:.015}),dedup(),prune(),textureCompress({encoder:sharp,resize:[512,512],targetFormat:'webp',quality:85}));
 const id=sex==='Male'?'rpg-boxer':'rpg-athlete-female',bytes=await io.writeBinary(doc);
 await writeFile(`src/assets/characters/${id}.glb`,bytes);await writeFile(`artifacts/rpg-asset-audit/models/${id}.glb`,bytes);
 const original=await readFile(input),triangles=root.listMeshes().flatMap(m=>m.listPrimitives()).reduce((sum,p)=>sum+p.getIndices().getCount()/3,0);
  const lightPath=resolve(textures,sex==='Male'?'T_Superhero_Male_Ligh.png':'T_Superhero_Female_Light_BaseColor.png');
  audit.push({id,source:relative(source,input).replaceAll('\\','/'),bytes:original.length,sha256:createHash('sha256').update(original).digest('hex'),dependencies:await dependencies(input),
    usedSkinTexture:await fingerprint(lightPath),hair:await Promise.all(hairNames.map(async name=>({name,...await fingerprint(resolve(people,name+'.gltf')),dependencies:await dependencies(resolve(people,name+'.gltf'))}))),
    triangles,optimizedBytes:bytes.length,modifications:'Sporting materials with clipped seams, covered shorts/jersey, transferred existing football boots, canonical joint names, optimized geometry and textures'});
 console.log(`${id}: ${triangles} triangles, ${bytes.length} bytes`);
}
await writeFile('artifacts/rpg-asset-audit/models.json',JSON.stringify(audit,null,2));
