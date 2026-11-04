// Measures every compiled clip on the footballer rig, exactly as the renderer retargets it, and records:
//  cycle    ground travel per loop of the planted feet (metres at the 1.92 m rig height) for in-place locomotion,
//  contact  strike frame for imported punches (the furthest forward reach of the punching hand), plus that hand,
//  derived  head/body recoil groups, catalog version and groups a clip leaves from catalog 4.
// Run after prepare-animations.mjs / prepare-rpg-animations.mjs (the latter calls it).
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { readCharacterGLTF } from './read-character-gltf.mjs';

export const CATALOG = 4;
const LOCOMOTION = ['run','walk','backward','stepLeft','stepRight','keeperStep','footballDribble','turn','boxingStep','boxingWalk','mascotWalk','keeperCarry'];
// In-place shuffles that barely cover ground: synchronised with the simulated speed they would loop several times a second.
const RETIRE_BELOW = .5, KEEP = ['boxingStep','boxingWalk','mascotWalk','keeperCarry'];
// Direction each locomotion group stands for (+z forward, +x left); a clip travelling more than ~37° off it slides sideways.
const HEADING = { run:[0,1], walk:[0,1], footballDribble:[0,1], backward:[0,-1], stepLeft:[1,0], stepRight:[-1,0] };
const BODY = /kidney|body|rib|chest/;
// Reviewed on the boxer: a relaxed stance with the hands at the hips, not a guard.
const MISFITS = { idle_1_: ['idle'], strike_foward_jog: ['run'] };
// A misfit that is right elsewhere: strike_foward_jog is a jog ending in a shot, a running shot.
const ADDED = { strike_foward_jog: ['footballShot'] };
// Catalog 4 picks locomotion by speed. Natural speed (rig m/s at 1.92 m) bands, overlapping so each has variety.
const BANDS = { run: [['runJog',0,3.3],['runMid',2.8,4.8],['runSprint',4.2,Infinity]] };
// Slow repositioning uses small in-place steps at their own cadence instead of a jog in slow motion.
const SLOW = { backward: 'backwardSlow', stepLeft: 'stepLeftSlow', stepRight: 'stepRightSlow' };
// Arrived at the celebration spot: real dances, looped at their own pace (no kisses or prayers in a loop).
const DANCE = /danc|capoeira/;

export async function annotateClips() {
  const manifest=JSON.parse(await readFile('src/assets/characters/animations.json','utf8'));
  const data=new Int16Array(gunzipSync(await readFile('src/assets/characters/animations.bin.gz')).buffer.slice(0));
  const model=(await readCharacterGLTF('src/assets/characters/footballer.glb')).scene;model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model),norm=1.92/(box.max.y-box.min.y);
  const rootInv=model.getWorldQuaternion(new THREE.Quaternion()).invert(),joints=new Map();
  model.traverse(o=>{if(o.isBone)joints.set(o.name,{bone:o,rest:o.quaternion.clone(),position:o.position.clone(),
    world:o.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv),parent:o.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv).invert()});});
  const hip=joints.get('Hips'),hipHeight=hip.bone.getWorldPosition(new THREE.Vector3()).y-box.min.y,hipUp=new THREE.Vector3(0,1,0).applyQuaternion(hip.parent);
  const q=new THREE.Quaternion(),point=n=>joints.get(n).bone.getWorldPosition(new THREE.Vector3()).multiplyScalar(norm);
  function pose(clip,frame){
    for(const j of joints.values()){j.bone.quaternion.copy(j.rest);j.bone.position.copy(j.position);}
    clip.bones.forEach((name,i)=>{const j=joints.get(name);if(!j)return;
      q.fromArray(data,clip.offset+frame*clip.stride+i*4).normalize();j.bone.quaternion.copy(q.premultiply(j.parent).multiply(j.world));});
    hip.bone.position.copy(hip.position).addScaledVector(hipUp,data[clip.offset+frame*clip.stride+clip.stride-1]/manifest.hipScale*hipHeight);
    model.updateMatrixWorld(true);
  }
  const report=[];
  for(const clip of manifest.clips){
    clip.groups=clip.groups.filter(g=>!/^(boxing(RecoilHead|RecoilBody|BodyJab)|run(Jog|Mid|Sprint)|(backward|stepLeft|stepRight)Slow|celebrationDance)$/.test(g)&&!(clip.added?.[g]));
    delete clip.cycle;delete clip.travel;delete clip.hand;delete clip.retired;delete clip.added;
    if(clip.groups.includes('boxingRecoil'))clip.groups.push(BODY.test(clip.id)?'boxingRecoilBody':'boxingRecoilHead');
    if(clip.groups.includes('boxingJab'))clip.groups.push('boxingBodyJab');
    if(clip.groups.includes('celebration')&&DANCE.test(clip.id))clip.groups.push('celebrationDance');
    const dt=clip.duration/(clip.frames-1);
    if(clip.groups.some(g=>LOCOMOTION.includes(g))){
      // The supporting foot (the lower one, near the floor) moves backwards at the speed the body would travel.
      const sides=[['LeftFoot','LeftToeBase'],['RightFoot','RightToeBase']],track=[];
      for(let f=0;f<clip.frames;f++){pose(clip,f);track.push(sides.map(names=>names.map(point).reduce((a,b)=>a.y<b.y?a:b)));}
      const floor=Math.min(...track.flat().map(p=>p.y));
      // Two passes: the lower foot gives the travel direction, then among feet near the floor the one pushing backwards along it.
      const measure=dir=>{let vx=0,vz=0,n=0;
        for(let f=1;f<clip.frames;f++){
          const steps=[0,1].map(k=>({a:track[f-1][k],x:-(track[f][k].x-track[f-1][k].x)/dt,z:-(track[f][k].z-track[f-1][k].z)/dt})).filter(s=>s.a.y<=floor+.05);
          if(!steps.length)continue;
          const s=dir?steps.reduce((p,q)=>p.x*dir[0]+p.z*dir[1]>q.x*dir[0]+q.z*dir[1]?p:q):steps.reduce((p,q)=>p.a.y<q.a.y?p:q);
          vx+=s.x;vz+=s.z;n++;}
        return [vx/Math.max(1,n),vz/Math.max(1,n)];};
      const first=measure(),[vx,vz]=measure(first.map(v=>v/Math.max(1e-6,Math.hypot(...first))));
      // Refine the loop length on what the game shows: the slowest near-floor foot, per metre travelled, should not move.
      const d=[vx,vz].map(v=>v/Math.max(1e-6,Math.hypot(vx,vz))),at=(k,u)=>{
        const x=u*(clip.frames-1),lo=Math.floor(x),hi=Math.min(clip.frames-1,lo+1),m=x-lo;return track[lo][k].clone().lerp(track[hi][k],m);};
      const slip=cycle=>{let total=0,count=0,previous;
        for(let i=0;i<=96;i++){const s=i*2*cycle/96,u=s/cycle%1,feet=[0,1].map(k=>{const p=at(k,u);p.x+=d[0]*s;p.z+=d[1]*s;return p;});
          if(previous){const moves=[0,1].filter(k=>previous[k].y<=floor+.05).map(k=>feet[k].distanceTo(previous[k]));if(moves.length){total+=Math.min(...moves)/(2*cycle/96);count++;}}
          previous=feet;}
        return count?total/count:Infinity;};
      let cycle=Math.hypot(vx,vz)*clip.duration;
      if(cycle>.05)for(const scale of Array.from({length:41},(_,i)=>.6+i*.025).sort((a,b)=>slip(cycle*a)-slip(cycle*b)).slice(0,1))cycle*=scale;
      clip.cycle=+cycle.toFixed(3);
      // Direction of travel in the clip: +z forward, +x to the character's left.
      clip.travel=[+(vx/Math.max(1e-6,Math.hypot(vx,vz))).toFixed(2),+(vz/Math.max(1e-6,Math.hypot(vx,vz))).toFixed(2)];
      const retired=clip.groups.filter(g=>LOCOMOTION.includes(g)&&!KEEP.includes(g)&&(clip.cycle<RETIRE_BELOW||HEADING[g]&&HEADING[g][0]*clip.travel[0]+HEADING[g][1]*clip.travel[1]<.8));
      if(retired.length)clip.retired=Object.fromEntries(retired.map(g=>[g,CATALOG]));
    }
    if(MISFITS[clip.id])clip.retired={...clip.retired,...Object.fromEntries(MISFITS[clip.id].map(g=>[g,CATALOG]))};
    if(ADDED[clip.id]){clip.added=Object.fromEntries(ADDED[clip.id].map(g=>[g,CATALOG]));clip.groups.push(...ADDED[clip.id]);}
    if(clip.cycle!==undefined){
      const natural=clip.cycle/clip.duration,kept=g=>clip.groups.includes(g)&&!clip.retired?.[g];
      for(const [group,bands] of Object.entries(BANDS))if(kept(group))for(const [name,lo,hi] of bands)if(natural>=lo&&natural<hi)clip.groups.push(name);
      for(const [group,name] of Object.entries(SLOW))if(clip.groups.includes(group)&&natural<1)clip.groups.push(name);
    }
    if(clip.groups.some(g=>/^boxing(Jab|Hook)$/.test(g))){
      let best=-Infinity,contact=clip.contact,hand='RightHand';
      for(let f=1;f<clip.frames-1;f++){
        pose(clip,f);const h=point('Hips');
        for(const name of ['LeftHand','RightHand']){const p=point(name).sub(h),score=p.z-Math.abs(p.y)*.15;if(score>best){best=score;hand=name;if(clip.id.startsWith('quaternius_'))contact=f*dt;}}
      }
      clip.contact=+contact.toFixed(3);clip.hand=hand;
    }
    clip.since=clip.since??(clip.id.startsWith('quaternius_')?3:2);
    report.push({id:clip.id,groups:clip.groups,cycle:clip.cycle,travel:clip.travel,contact:clip.contact,hand:clip.hand,retired:clip.retired});
  }
  manifest.catalog=CATALOG;
  await writeFile('src/assets/characters/animations.json',JSON.stringify(manifest));
  return report;
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await annotateClips();
  for(const r of report.filter(r=>r.cycle!==undefined||r.hand))console.log(r.id.padEnd(44),r.groups[0].padEnd(12),(r.cycle??'').toString().padEnd(6),JSON.stringify(r.travel??''),r.hand??'',r.hand?r.contact:'',r.retired?'retired '+Object.keys(r.retired):'');
}
