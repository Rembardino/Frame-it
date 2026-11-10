import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,simplify,resample,textureCompress} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';

const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);await MeshoptSimplifier.ready;
await mkdir('src/assets/animals',{recursive:true});
const audit=[];
const sources=[
  {id:'husky',path:'artifacts/animals/converted/pack.glb',archive:'ultimate-animal-pack-100-animals-50-off.zip',ratio:.4},
  {id:'eagle',path:'artifacts/animals/source/eagle/source/eagle sketchfab.glb',archive:'eagle.zip',ratio:.7},
  {id:'eagle-alternative',path:'artifacts/animals/converted/eagle-animated.glb',archive:'animated-eagle.zip',ratio:1,preview:true},
];
for(const spec of sources){
  const doc=await io.read(spec.path),root=doc.getRoot();
  if(spec.id==='husky'){
    const top=root.getDefaultScene().listChildren()[0];
    const remove=node=>{node.listChildren().slice().forEach(remove);node.dispose();};
    top.listChildren().filter(n=>!/^Wolf/.test(n.getName())).forEach(remove);
    const fur=doc.createTexture('Husky fur').setImage(await readFile('artifacts/animals/source/pack/Realistic Animated Pack/textures/T_Wolf.png')).setMimeType('image/png');
    const mesh=root.listNodes().find(n=>n.getMesh()&&/^Wolf/.test(n.getName())).getMesh();
    for(const prim of mesh.listPrimitives()){
      prim.getMaterial().setBaseColorTexture(fur).setBaseColorFactor([1,1,1,1]).setAlphaMode('OPAQUE');
      // Keep the supplied canine rig; shorten the wolf's long muzzle and tail for a compact husky-like trail dog.
      const p=prim.getAttribute('POSITION');
      for(let i=0;i<p.getCount();i++){
        const v=p.getElement(i,[]);
        if(v[0]>.7)v[0]=.7+(v[0]-.7)*.78;
        if(v[0]<-.65)v[0]=-.65+(v[0]+.65)*.8;
        p.setElement(i,v);
      }
    }
    root.listAnimations().forEach(a=>{if(!/WalkFast/.test(a.getName()))a.dispose();else a.setName('walk');});
  }
  for(const mat of root.listMaterials())mat.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(.82);
  // The pack's canine contains red/black vertex paint from the showcase; use the actual fur colour texture.
  for(const mesh of root.listMeshes())for(const prim of mesh.listPrimitives())prim.setAttribute('COLOR_0',null);
  await doc.transform(prune(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:spec.ratio,error:.006}),resample(),dedup(),prune(),
    textureCompress({encoder:sharp,resize:[512,512],targetFormat:'webp',quality:84}),prune());
  const bytes=await io.writeBinary(doc),triangles=root.listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0);
  const output=spec.preview?'artifacts/animals/eagle-alternative.glb':`src/assets/animals/${spec.id}.glb`;
  await writeFile(output,bytes);
  audit.push({id:spec.id,sourceArchive:spec.archive,source:spec.path,output,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),triangles,
    animations:root.listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length})),textures:root.listTextures().length,
    changes:spec.id==='husky'?'Selected the animated canine only; removed the static pack display and sales sign; restored fur texture; shortened muzzle and tail; optimized geometry, animation and textures.':'Removed heavy detail maps; optimized geometry, animation and base-colour texture.'});
  console.log(`${spec.id}: ${triangles} triangles, ${(bytes.length/1024).toFixed(0)} KiB, ${root.listAnimations().length} animations`);
}
await writeFile('docs/animal-asset-audit.json',JSON.stringify({sourceFolder:'Downloads/new_animals',assets:audit,
  otherAssets:[{archive:'animated-rhinoceros-walking-animal-loop.zip',decision:'Not used: no rhinoceros event in the current game.'},{archive:'ultimate-animal-pack-100-animals-50-off.zip',decision:'The other animals are part of a merged static display; only the canine has usable skeletal animation.'}],
  license:'No license or attribution file was included in the supplied archives; original downloads remain unchanged.'},null,2)+'\n');
