import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { categories } from './asset-categories.mjs';
import { unzipSync } from 'three/addons/libs/fflate.module.js';

const source=resolve(process.argv[2]||resolve(process.env.USERPROFILE??process.env.HOME??'.','Downloads/new_asset'));
const pack=resolve('artifacts/asset-audit/soccer-pack');await mkdir(pack,{recursive:true});
for(const [name,bytes]of Object.entries(unzipSync(await readFile(resolve(source,'Soccer Game Pack.zip')))))
 if(name.toLowerCase().endsWith('.fbx'))await writeFile(resolve(pack,basename(name)),bytes);
const canonical=n=>n.replace(/^mixamorig\d*:?/,'');
THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};
const loader=new FBXLoader(), fps=24, chunks=[], clips=[], audit=[], seen=new Map();let offset=0;
await mkdir('src/assets/characters',{recursive:true});
for(const dir of [source,pack]) {
 for(const file of (await readdir(dir)).filter(n=>n.endsWith('.fbx')).sort()) {
  const path=resolve(dir,file), bytes=await readFile(path), original=dir===source?file:`Soccer Game Pack/${file}`;
  const warn=console.warn;console.warn=()=>{};let model;
  try{model=loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');}finally{console.warn=warn;}
  model.updateMatrixWorld(true);
  const bones=new Map();model.traverse(o=>{if(o.isBone&&!bones.has(canonical(o.name)))bones.set(canonical(o.name),o);});
  const group=categories(file);
  for(const [clipIndex,clip] of model.animations.entries()) {
   if(clip.duration<.05||!clip.tracks.length)continue;
   const tracks=clip.tracks.filter(t=>t.name.endsWith('.quaternion')&&bones.has(canonical(t.name.split('.')[0])));
   const names=tracks.map(t=>canonical(t.name.split('.')[0]));
   const samplers=tracks.map(t=>t.createInterpolant());
   const parentQ=names.map(n=>bones.get(n).parent.getWorldQuaternion(new THREE.Quaternion()));
   const invQ=names.map(n=>bones.get(n).getWorldQuaternion(new THREE.Quaternion()).invert());
   const hip=bones.get('Hips'), hipTrack=clip.tracks.find(t=>t.name.endsWith('Hips.position'));
   const hipSampler=hipTrack?.createInterpolant(), hipHeight=hip.position.y;
   const frames=Math.max(2,Math.ceil(clip.duration*fps)+1), stride=names.length*4+1, data=new Float32Array(frames*stride);
   const q=new THREE.Quaternion();
   for(let f=0;f<frames;f++) {
    const time=Math.min(clip.duration,f*clip.duration/(frames-1));
    for(let i=0;i<names.length;i++) {
     q.fromArray(samplers[i].evaluate(time)).premultiply(parentQ[i]).multiply(invQ[i]).normalize();
     if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);
     q.toArray(data,f*stride+i*4);
    }
    data[f*stride+names.length*4]=hipSampler?(hipSampler.evaluate(time)[1]-hipHeight)/hipHeight:0;
   }
   // Compare the actual animation, not names, embedded textures, or FBX file size.
   const rawHash=createHash('sha256').update(JSON.stringify(clip.tracks.map(t=>[t.name,[...t.times],[...t.values]]))).digest('hex');
   const id=original.replace(/\.fbx$/i,'').replaceAll(/[^a-zA-Z0-9]+/g,'_').toLowerCase()+(clipIndex?'_'+clipIndex:'');
   const duplicate=seen.get(rawHash);
   const entry={file:original,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),motionHash:rawHash,duration:clip.duration,categories:group,id,duplicateOf:duplicate||null};
   audit.push(entry);
   if(!group.length||duplicate)continue;
   seen.set(rawHash,id);
   // Detect the first forward extension of the striking limb for time warping at ball/punch contact.
   let contact=clip.duration*.45;
   if(group.some(g=>/^golf(Drive|Chip|Putt)$/.test(g))) {
    const mixer=new THREE.AnimationMixer(model);mixer.clipAction(clip).play();const samples=[];let minY=Infinity,best=-Infinity;
    for(let f=0;f<frames;f++){
     const time=f*clip.duration/(frames-1);mixer.setTime(time);model.updateMatrixWorld(true);
     const h=hip.getWorldPosition(new THREE.Vector3());
     const hands=['LeftHand','RightHand'].map(n=>bones.get(n)?.getWorldPosition(new THREE.Vector3())).filter(Boolean);
     if(hands.length<2)continue;const p=hands[0].add(hands[1]).multiplyScalar(.5).sub(h);
     samples.push({p,time});minY=Math.min(minY,p.y);
    }
    for(let f=1;f<samples.length-1;f++){
      const {p,time}=samples[f];if(p.y>minY+.08*hipHeight)continue;
      const score=p.distanceToSquared(samples[f-1].p);if(score>best){best=score;contact=time;}
    }
    mixer.stopAllAction();mixer.uncacheRoot(model);
   }
   if(group.some(g=>/footballShot|footballPass|boxingJab|boxingHook/.test(g))) {
    const mixer=new THREE.AnimationMixer(model);mixer.clipAction(clip).play();
    const foot=/football/.test(group[0]);const candidates=foot?['RightFoot','LeftFoot']:['RightHand','LeftHand'];
    let best=-Infinity;
    for(let f=1;f<frames-1;f++) {
     const time=f*clip.duration/(frames-1);mixer.setTime(time);model.updateMatrixWorld(true);
     const h=hip.getWorldPosition(new THREE.Vector3());
     for(const n of candidates){const b=bones.get(n);if(!b)continue;const p=b.getWorldPosition(new THREE.Vector3()).sub(h);
      const score=p.z-(foot?0:Math.abs(p.y)*.15);if(score>best){best=score;contact=time;}}
    }
    mixer.stopAllAction();mixer.uncacheRoot(model);
   }
   let first=0,last=frames-1;
   if(group.some(g=>/^golf(Drive|Chip|Putt)$/.test(g))){
    first=Math.max(0,Math.floor((contact-.8)/clip.duration*(frames-1)));
    last=Math.min(frames-1,Math.ceil((contact+1.1)/clip.duration*(frames-1)));
   }
   if(group.some(g=>['golfBad','golfVictory','golfFollow'].includes(g)))first=Math.max(0,frames-1-Math.ceil(fps*(group[0]==='golfFollow'?3:4.5)));
   if(group.some(g=>['phone','entry'].includes(g)))last=Math.min(frames-1,Math.ceil(fps*(group[0]==='phone'?6:3.5)));
   const start=first*clip.duration/(frames-1), end=last*clip.duration/(frames-1);
   const output=data.subarray(first*stride,(last+1)*stride);
   const hipX=hipTrack?.values.filter((_,i)=>i%3===0)??[];
   const displacement=hipX.length?hipX.reduce((v,x)=>Math.abs(x-hipX[0])>Math.abs(v)?x-hipX[0]:v,0):0;
   clips.push({id,source:original,groups:group,duration:end-start,sourceDuration:clip.duration,trim:[start,end],
    contact:Math.max(.05,Math.min(end-start-.05,contact-start)),direction:Math.sign(-displacement),frames:last-first+1,bones:names,offset,stride});
   const packed=new Int16Array(output.length);
   for(let i=0;i<output.length;i++){
    const scale=i%stride===stride-1?8192:32767;
    if(Math.abs(output[i]*scale)>32767)throw new Error(`Animation quantization range exceeded: ${original}`);
    packed[i]=Math.round(output[i]*scale);
   }
   chunks.push(Buffer.from(packed.buffer));offset+=output.length;
  }
  model.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
 }
}
const manifest={version:2,fps,quaternionScale:32767,hipScale:8192,clips};
await writeFile('src/assets/characters/animations.json',JSON.stringify(manifest));
await writeFile('src/assets/characters/animations.bin.gz',gzipSync(Buffer.concat(chunks),{level:9}));
await writeFile('artifacts/asset-audit/animations.json',JSON.stringify(audit,null,2));
const humanFiles=(await readdir(resolve(source,'human'))).filter(f=>f.endsWith('.fbx'));
const models=[];
for(const file of humanFiles){
 const bytes=await readFile(resolve(source,'human',file));
 const id=file==='giocatore.fbx'?'footballer':`human-${file.match(/\d+/)?.[0]||'0'}`;
 const converted=await readFile(resolve('artifacts/asset-audit/humans',id+'.glb'));
 const gltf=JSON.parse(converted.toString('utf8',20,20+converted.readUInt32LE(12)));
 models.push({source:'human/'+file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),fbxVersion:bytes.readUInt32LE(23),
  model:id,meshes:gltf.meshes.map(m=>m.name),use:id==='footballer'?'athletes, officials, staff, spectators':'mascots only'});
}
await writeFile('docs/asset-audit.json',JSON.stringify({models,motions:audit,retained:clips.map(c=>({id:c.id,source:c.source,trim:c.trim,duration:c.duration,contact:c.contact})),
 excludedArchive:{file:'kenney_modular-cave-kit_1.0.zip',reason:'Environment cave kit, unrelated to human models and sporting animations'}},null,2));
console.log(`${audit.length} clips inspected, ${clips.length} usable unique clips, ${offset*2} bytes unpacked`);
