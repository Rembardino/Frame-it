import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { readCharacterGLTF } from './read-character-gltf.mjs';
import { anatomicalName } from './character-skeleton.mjs';
import { annotateClips } from './annotate-clips.mjs';

const source=resolve(process.argv[2]||resolve(process.env.USERPROFILE??'.','OneDrive - Posti Oyj/Desktop/RPG 3D'));
const libraries=[
 ['UAL1','3D asset download/animation/Universal Animation Library[Standard]/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb'],
 ['UAL2','3D asset download/animation/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb'],
];
const selected={
 UAL1:{Crouch_Idle_Loop:['boxingDodge'],Dance_Loop:['celebration'],Death01:['knockdown'],Hit_Chest:['boxingRecoil'],Hit_Head:['boxingRecoil'],Interact:['officialPoint'],
  Idle_Loop:['sidelineIdle'],Idle_Talking_Loop:['talk'],Jog_Fwd_Loop:['run'],PickUp_Table:['keeperCatch'],Punch_Cross:['boxingJab'],Punch_Jab:['boxingJab'],Push_Loop:['shove'],
  Sitting_Enter:['crowdSitIn'],Sitting_Exit:['crowdSitOut'],Sitting_Idle_Loop:['crowdSit'],Sitting_Talking_Loop:['crowdSitTalk'],Sprint_Loop:['run'],Walk_Formal_Loop:['walk'],Walk_Loop:['walk']},
 UAL2:{Hit_Knockback:['knockdown'],Idle_FoldArms_Loop:['sidelineIdle'],Idle_No_Loop:['dejected'],Idle_TalkingPhone_Loop:['phone'],LayToIdle:['getUp'],
  Melee_Hook:['boxingHook'],OverhandThrow:['keeperThrow'],Slide_Start:['footballTackle'],Walk_Carry_Loop:['keeperCarry'],Yes:['officialYes','celebration'],
  Zombie_Idle_Loop:['mascotIdle'],Zombie_Scratch:['mascotReact'],Zombie_Walk_Fwd_Loop:['mascotWalk']}
};
const joins={Melee_Hook:['Melee_Hook_Rec'],Slide_Start:['Slide_Loop','Slide_Exit']};
// Added after catalog 3 (second review): replays recorded earlier never see them.
const since4=['UAL1/Interact'];
const manifest=JSON.parse(await readFile('src/assets/characters/animations.json','utf8'));
const base=manifest.clips.filter(c=>!c.id.startsWith('quaternius_')),baseLength=Math.max(...base.map(c=>c.offset+c.frames*c.stride));
const old=gunzipSync(await readFile('src/assets/characters/animations.bin.gz'));
const chunks=[old.subarray(0,baseLength*2)],clips=[...base],audit=[],files=[];let offset=baseLength;
await mkdir('artifacts/rpg-asset-audit',{recursive:true});
for(const [library,file]of libraries){
 const input=resolve(source,file),bytes=await readFile(input),gltf=await readCharacterGLTF(input),model=gltf.scene;model.updateMatrixWorld(true);
 const bones=new Map();model.traverse(o=>{if(o.isBone)bones.set(anatomicalName(o.name),o);});
 const hip=bones.get('Hips'),hipWorld=hip.getWorldPosition(new THREE.Vector3()),hipParent=hip.parent.matrixWorld.clone();
 const rest=new Map([...bones].map(([name,bone])=>[name,{local:bone.quaternion.clone(),parent:bone.parent.getWorldQuaternion(new THREE.Quaternion()),inverse:bone.getWorldQuaternion(new THREE.Quaternion()).invert()}]));
 const rmBytes=await readFile(input.replace('.glb','_RM.glb'));
 files.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),animations:gltf.animations.length,
  rootMotionExport:{file:file.replace('.glb','_RM.glb'),bytes:rmBytes.length,sha256:createHash('sha256').update(rmBytes).digest('hex'),use:'Equivalent animation set with baked root motion; use the in-place export because gameplay controls movement'}});
 for(const clip of gltf.animations){
  const groups=selected[library][clip.name];
  const joinedInto=Object.entries(joins).find(([,parts])=>parts.includes(clip.name))?.[0];
  const decision=groups?'included':joinedInto?'joined recovery/exit':clip.name==='A_TPose'?'reference pose':/Sword|Shield|Spell|Pistol/.test(clip.name)?'weapon or spell choreography':/Torch|Lantern|Rail|Farm|Tree|Chest|Consume|Driving/.test(clip.name)?'requires a prop or activity absent from the sports game':'no matching sporting action';
  audit.push({file,clip:clip.name,duration:clip.duration,groups:groups??[],decision,joinedInto:joinedInto??null});
  if(!groups)continue;
  const parts=[clip,...(joins[clip.name]??[]).map(name=>gltf.animations.find(c=>c.name===name)).filter(Boolean)];
  const duration=parts.reduce((n,c)=>n+c.duration,0),names=[...new Set(parts.flatMap(c=>c.tracks.filter(t=>t.name.endsWith('.quaternion')).map(t=>anatomicalName(t.name.slice(0,-11)))))].filter(n=>rest.has(n)&&n!=='Root');
  const frames=Math.ceil(duration*24)+1,stride=names.length*4+1,values=new Int16Array(frames*stride);
  const samplers=parts.map(c=>new Map(c.tracks.map(t=>[anatomicalName(t.name.slice(0,t.name.lastIndexOf('.')))+t.name.slice(t.name.lastIndexOf('.')),t.createInterpolant()])));
  const q=new THREE.Quaternion(),p=new THREE.Vector3();
  for(let f=0;f<frames;f++){
   let t=f*duration/(frames-1),part=0;
   while(part<parts.length-1&&t>parts[part].duration){t-=parts[part].duration;part++;}
   for(let n=0;n<names.length;n++){
    const name=names[n],r=rest.get(name),sampler=samplers[part].get(name+'.quaternion');
    if(sampler)q.fromArray(sampler.evaluate(t));else q.copy(r.local);
    q.premultiply(r.parent).multiply(r.inverse).normalize();if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);
    for(let k=0;k<4;k++)values[f*stride+n*4+k]=Math.round(q.toArray()[k]*32767);
   }
   const sampler=samplers[part].get('Hips.position');
   if(sampler)p.fromArray(sampler.evaluate(t)).applyMatrix4(hipParent);else p.copy(hipWorld);
   const dy=(p.y-hipWorld.y)/hipWorld.y;
   if(Math.abs(dy*8192)>32767)throw new Error(`Root motion out of range: ${clip.name}`);
   values[f*stride+stride-1]=Math.round(dy*8192);
  }
  const motionHash=createHash('sha256').update(Buffer.from(values.buffer)).digest('hex');audit.at(-1).motionHash=motionHash;
  const id=`quaternius_${library.toLowerCase()}_${clip.name.toLowerCase()}`;
  clips.push({id,source:`RPG 3D/${library}/${clip.name}`,groups,duration,sourceDuration:duration,trim:[0,duration],contact:duration*.32,direction:0,frames,bones:names,offset,stride,
   ...(since4.includes(`${library}/${clip.name}`)?{since:4}:{})});
  chunks.push(Buffer.from(values.buffer));offset+=values.length;
 }
}
manifest.clips=clips;manifest.revision=3;
await writeFile('src/assets/characters/animations.json',JSON.stringify(manifest));
await writeFile('src/assets/characters/animations.bin.gz',gzipSync(Buffer.concat(chunks),{level:9}));
const models=JSON.parse(await readFile('artifacts/rpg-asset-audit/models.json','utf8'));
await writeFile('docs/rpg-asset-audit.json',JSON.stringify({sourceProject:'RPG 3D',author:'Quaternius',license:'CC0 1.0',files,models,animations:audit,addedClips:clips.length-base.length,
 alternatives:'Unity FBX and root-motion GLB are equivalent exports; game-ready RPG copies and medieval outfits were inspected, original clothing is unsuitable for sport.'},null,2));
await annotateClips();
console.log(`${audit.length} source clips reviewed; ${clips.length-base.length} sports/ambient clips added; ${clips.length} clips total.`);
