import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import manifest from '../assets/characters/animations.json';
import animationURL from '../assets/characters/animations.bin.gz?url';
import { CONFIG, SPORT } from '../config';
import type { Actor } from '../sim/match';
import type { Athlete } from './athlete';
import { assetMotion, type AssetMotion } from '../animation/assetMotion';
import { netContactPoint } from '../animation/motion';
import { dressUniform, changeUniform } from './uniforms';
import { boxingBoot } from './boxingBoots';
import type { TeamKit } from '../teams';
import { styleSkin } from './skin';
import {CarolAppearance} from './carolAppearance';
import { riderKit } from './cyclingKit';

const urls = import.meta.glob('../assets/characters/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string,string>;
const loader = new GLTFLoader();
const templates = new Map<string,Promise<THREE.Group>>();
/** Written by scripts/annotate-clips.mjs: loop ground travel, striking hand, catalog where a clip enters or leaves a group. */
type Clip = typeof manifest.clips[number] & { cycle?: number; travel?: number[]; hand?: string; since?: number; retired?: Record<string,number>; added?: Record<string,number> };
const pools = new Map<string,Clip[]>();
for (const clip of manifest.clips as Clip[]) for (const group of clip.groups) pools.set(group,[...(pools.get(group) ?? []),clip]);
export function resolveAssetClip(m: AssetMotion | null) {
  if(!m)return undefined;
  // A saved replay keeps the pool of its own catalog, so the modulo below picks the same clip it did when recorded.
  const catalog=m.catalog??3,pool=(pools.get(m.group)??[]).filter(c=>Math.max(c.since??2,c.added?.[m.group]??0)<=catalog&&!((c.retired?.[m.group]??Infinity)<=catalog));
  return pool.length?pool[((m.variant%pool.length)+pool.length)%pool.length]:undefined;
}
/** Played at their own speed around the contact instead of squeezing the whole clip into the gesture. */
const STRIKES=['boxingJab','boxingHook','boxingBodyJab','footballShot','footballPass'];
const REACTIONS=['boxingRecoil','boxingRecoilHead','boxingRecoilBody','boxingBlock'];
/** Expressive gestures keep close to their own pace (at most 1.4× faster or 0.6× slower) instead of filling the pose exactly. */
const NATURAL=/^(celebration|golfVictory|dejected|golfBad|keeperDirect|officialYes|officialPoint|talk|phone|shove|refCount|trip|mascotReact|boxingEntry|entry|footballEntry|footballReceive|footballTrick|footballTurn)$/;
/** Groups whose feet stay on the floor: the root follows the lowest sole. */
const PLANTED=/^(golfDrive|golfChip|golfPutt|idle|sidelineIdle|talk|officialYes|shove|footballIdle|footballPass|footballShot|boxingJab|boxingBodyJab|boxingHook|boxingCombo|boxingRecoil|boxingRecoilHead|boxingRecoilBody|boxingBlock|walk|backward|stepLeft|stepRight|backwardSlow|stepLeftSlow|stepRightSlow|keeperIdle|keeperStep|keeperCarry)$/;
const live=new WeakMap<Actor,Character>();
export const isHumanModel=(name: string)=>['footballer','rpg-boxer','athlete-tee','athlete-polo','athlete-carol'].includes(name);
function modelForActor(a: Actor) {
  if(a.look==='mascot')return FANTASY[(a.appearance??a.id)%FANTASY.length];
  const athlete=!['ref','coach','fan','steward','spectator'].includes(a.role);
  if(athlete&&SPORT==='boxe')return 'rpg-boxer';
  // Women play tennis and golf (polo and skirt); basket and volleyball teams are men.
  if(athlete&&a.team===1&&['tennis','golf'].includes(SPORT))return 'athlete-carol';
  // Football kit only for football: T-shirt and shorts elsewhere, polo and trousers for golfers and officials.
  if(athlete&&SPORT==='golf')return 'athlete-polo';
  if(athlete&&SPORT!=='calcio')return 'athlete-tee';
  if(!athlete&&['coach','steward','spectator'].includes(a.role)&&a.id%2===1)return 'athlete-carol';
  if(a.role==='spectator'||a.role==='fan')return a.id%4===0?'athlete-polo':'athlete-tee';
  if(a.role==='coach'||a.role==='steward'||(a.role==='ref'&&SPORT!=='calcio'))return 'athlete-polo';
  return 'footballer';
}
let animationData: Int16Array;
let library: Promise<void> | undefined;
export function loadAnimations() {
  return library ??= (async () => {
    const response = await fetch(animationURL);
    if (!response.ok) throw new Error(`Animation assets: ${response.status}`);
    const bytes = await response.arrayBuffer(), header=new Uint8Array(bytes,0,2);
    // Static servers may already decompress Content-Encoding:gzip; embedded mobile data URLs do not.
    if(header[0]===0x1f&&header[1]===0x8b){
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      animationData = new Int16Array(await new Response(stream).arrayBuffer());
    } else animationData=new Int16Array(bytes);
  })();
}
export function characterTemplate(name: string) {
  let promise = templates.get(name);
  if (!promise) {
    const url = urls[`../assets/characters/${name}.glb`];
    if (!url) throw new Error(`Unknown character: ${name}`);
    promise = loader.loadAsync(url).then(g => g.scene); templates.set(name,promise);
  }
  return promise;
}

const SKIN = [0xffffff,0xdab392,0xa87958,0xe5b38c,0x78513d,0xf8d9bc,0x916345];
const HAIR = [0x281e19,0x553524,0x17191e,0x956236,0xc69c58,0x6b6461];
const SHOES = [0xf4efdb,0x20273a,0xff5a1f,0x3ddc84,0xffe14a,0x1fa7ff,0xff3b9a];
const FANTASY = Array.from({length:14},(_,i)=>`human-${i}`);
const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
const inverseFacing = facing.clone().invert();
const down = new THREE.Vector3(0,-1,0);
const hairGeometries=new Map<string,THREE.BufferGeometry>();
const physiques=new Map<string,THREE.BufferGeometry>();

interface Joint { bone: THREE.Bone; name: string; rest: THREE.Quaternion; world: THREE.Quaternion; parent: THREE.Quaternion;
  procedural: THREE.Quaternion; source?: THREE.Object3D; position: THREE.Vector3 }

export class Character {
  readonly root = new THREE.Group();
  readonly model: THREE.Group;
  readonly name: string;
  private joints: Joint[] = [];
  private norm: number;
  private q0=new THREE.Quaternion(); private q1=new THREE.Quaternion();
  private modelInverse=new THREE.Quaternion(); private driverInverse=new THREE.Quaternion();
  private poseQ: THREE.Quaternion[] = [];
  /** Procedural pose (with limbs fitted to its contact points) and the previous gesture, for cross-fades. */
  private procQ: THREE.Quaternion[] = [];
  private prevQ: THREE.Quaternion[] = [];
  private hip?: Joint;
  private hipHeight=0;
  private hipUp=new THREE.Vector3(0,1,0);
  private mappings=new Map<string,Map<string,number>>();
  private golfSocket?: THREE.Group;
  private golfClub?: THREE.Object3D;
  private defaultGrip?: THREE.Quaternion;
  private golfGrips=new Map<string,{rotation:THREE.Quaternion;length:number}>();
  private phone?: THREE.Mesh;
  private ankleHeight=0;
  private soles: { mesh:THREE.SkinnedMesh; indices:number[] }[]=[];
  private bootSoles: THREE.Mesh[]=[];
  private wardrobe: Promise<void>[]=[];
  private scale=1;
  private carol?: CarolAppearance;

  static async create(actor: Actor, driver: Athlete) {
    const name = modelForActor(actor);
    const [template] = await Promise.all([characterTemplate(name),loadAnimations()]);
    const character=new Character(template,name,actor,driver);
    await Promise.all(character.wardrobe);
    return character;
  }

  private constructor(template: THREE.Group, name: string, actor: Actor, driver: Athlete) {
    this.name=name; this.model=clone(template) as THREE.Group;
    this.model.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(this.model);
    const player=!['ref','coach','fan','steward','spectator'].includes(actor.role);
    const height=player&&['basket','pallavolo'].includes(SPORT)?[.96,1.035,1,1.065,.985,1.015][actor.id%6]:1;
    this.norm=1.92*height/(box.max.y-box.min.y);
    // Bone rotations remain in the source's +Z-forward space; only this outer group changes basis.
    this.root.quaternion.copy(facing);this.root.add(this.model);
    this.root.scale.setScalar(this.norm);this.model.position.y=-box.min.y;
    this.model.updateMatrixWorld(true);
    const rootInv=this.model.getWorldQuaternion(new THREE.Quaternion()).invert();
    const source: Record<string,THREE.Object3D> = {Hips:driver.body,Spine:driver.torso,Head:driver.head,
      LeftArm:driver.armR,LeftForeArm:driver.elbowR,LeftHand:driver.wristR,
      RightArm:driver.armL,RightForeArm:driver.elbowL,RightHand:driver.wristL,
      LeftUpLeg:driver.legR,LeftLeg:driver.kneeR,RightUpLeg:driver.legL,RightLeg:driver.kneeL};
    this.model.traverse(o=>{
      if((o as THREE.Bone).isBone){
        const world=o.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv);
        const parent=o.parent!.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv).invert();
        const joint={bone:o as THREE.Bone,name:o.name,rest:o.quaternion.clone(),world,parent,procedural:world.clone(),source:source[o.name],position:o.position.clone()};
        this.joints.push(joint);if(o.name==='Hips')this.hip=joint;
      }
    });
    for(const side of ['Left','Right']) {
      const upper=this.joints.find(j=>j.name===`${side}Arm`);
      if(!upper)continue;
      const direction=new THREE.Vector3(0,1,0).applyQuaternion(upper.world).normalize();
      const correction=new THREE.Quaternion().setFromUnitVectors(direction,down);
      for(const joint of this.joints.filter(j=>[`${side}Arm`,`${side}ForeArm`,`${side}Hand`].includes(j.name))) joint.procedural.premultiply(correction);
    }
    this.poseQ=this.joints.map(()=>new THREE.Quaternion());
    this.procQ=this.joints.map(()=>new THREE.Quaternion());
    this.prevQ=this.joints.map(()=>new THREE.Quaternion());
    if(this.hip){
      this.hipHeight=this.hip.bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(this.model.matrixWorld.clone().invert()).y;
      this.hipUp.applyQuaternion(this.hip.parent);
    }
    const ankle=this.joints.find(j=>j.name==='LeftFoot');
    if(ankle)this.ankleHeight=ankle.bone.getWorldPosition(new THREE.Vector3()).y;
    this.style(actor);
    if(name.startsWith('rpg-'))this.model.traverse(o=>{
      if(!(o as THREE.SkinnedMesh).isSkinnedMesh||!o.visible||!/Shoes/.test(o.name))return;
      const mesh=o as THREE.SkinnedMesh,positions=mesh.geometry.getAttribute('position');let lowest=Infinity;
      for(let i=0;i<positions.count;i++)lowest=Math.min(lowest,positions.getY(i));
      this.soles.push({mesh,indices:Array.from({length:positions.count},(_,i)=>i).filter(i=>positions.getY(i)<lowest+.04)});
    });
    this.socket('LeftHand',driver.wristR.children.slice());
    this.socket('RightHand',driver.wristL.children.slice());
    this.socket('Head',driver.head.children.slice());
    const torsoProps=driver.torso.children.filter(o=>!(o instanceof THREE.Group));
    for(const prop of torsoProps)prop.position.y-=.25;
    this.socket('Spine2',torsoProps);
    if(name==='athlete-carol'){
      this.carol=new CarolAppearance(this.model,this.norm);this.carol.apply(actor.appearance??actor.id);
    }
    driver.body.visible=false;
    this.root.userData.character=name;
    live.set(actor,this);
  }

  private socket(name: string, props: THREE.Object3D[]) {
    const joint=this.joints.find(j=>j.name===name);if(!joint||!props.length)return;
    const socket=new THREE.Group();
    socket.quaternion.copy(joint.procedural).invert().multiply(inverseFacing);
    socket.scale.setScalar(1/this.norm);joint.bone.add(socket);
    props.forEach(p=>socket.add(p));
    const club=props.find(p=>p.name==='golf-club');
    if(club){this.golfSocket=socket;this.golfClub=club;this.defaultGrip=socket.quaternion.clone();}
  }

  /** Accessories are authored in metres; source skeletons can be in metres, centimetres or hundredths of a metre. */
  private accessory(name: string, object: THREE.Object3D, align=false) {
    const joint=this.joints.find(j=>j.name===name);if(!joint)return;
    const frame=new THREE.Group();frame.name='metre-accessory';frame.scale.setScalar(1/this.norm);
    if(align)frame.quaternion.copy(joint.world).invert();
    joint.bone.add(frame);frame.add(object);
  }

  private physique(mesh: THREE.Mesh, id: number) {
    if(!/Body|Shirt|Shorts|Hair|Brow|Eyes|Eyelash/.test(mesh.name))return;
    const key=`${mesh.geometry.uuid}:${id%12}`;let geometry=physiques.get(key);
    if(!geometry){
      geometry=mesh.geometry.clone();
      const frame=new THREE.Matrix4().copy(this.model.matrixWorld).invert().multiply(mesh.matrixWorld),inverse=frame.clone().invert();
      const positions=geometry.getAttribute('position'),point=new THREE.Vector3();
      const breadth=[.90,1.08,.97,1.13,1.02,.94][id%6],face=[.91,1.07,1,.96,1.1,1.03][id%6];
      for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i).applyMatrix4(frame);
        const y=point.y*this.norm,head=THREE.MathUtils.smoothstep(y,1.48,1.66),torso=1-THREE.MathUtils.smoothstep(Math.abs(point.x*this.norm),.22,.48);
        point.x*=THREE.MathUtils.lerp(1+(breadth-1)*torso,face,head);
        point.z*=1+(breadth-1)*.32*(1-head);
        point.applyMatrix4(inverse);positions.setXYZ(i,point.x,point.y,point.z);
      }
      geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();physiques.set(key,geometry);
    }
    mesh.geometry=geometry;
  }

  async setKit(kit: TeamKit, actor: Actor) {
    kit=riderKit(actor,kit);
    const updates: Promise<void>[]=[];
    this.model.traverse(o=>{
      if(!(o as THREE.Mesh).isMesh)return;const mesh=o as THREE.Mesh,mat=mesh.material as THREE.MeshStandardMaterial;
      if(mat.userData.club)updates.push(changeUniform(mat,kit));
      if(mesh.name==='team-glove')mat.color.setHex(kit.shirt);
      if(/Socks/.test(mesh.name)&&actor.role!=='ref')mat.color.setHex(kit.socks);
    });
    await Promise.all(updates);
  }

  private style(a: Actor) {
    if(!isHumanModel(this.name))return;
    const kit=riderKit(a,CONFIG.teams[a.team]), id=a.id;
    const player=!['ref','coach','fan','steward','spectator'].includes(a.role);
    const costume=a.role==='spectator'&&a.look?({banana:0xffd83a,dino:0x3fa34d,clown:0xff3b3b,astronaut:0xeef0f2} as Record<string,number>)[a.look]:undefined;
    const shirt=a.role==='ref'?CONFIG.visuals.referee.shirt:a.role==='steward'?CONFIG.visuals.steward.shirt
      :a.role==='fan'?CONFIG.visuals.fan.shirt:a.role==='gk'?kit.keeper:a.role==='coach'?kit.socks
      :a.role==='spectator'?costume??[0xff3b5c,0xffd400,0x00c2ff,0xff7a00,0x39e639,0xff4fd8][id%6]:kit.shirt;
    this.model.traverse(o=>{
      if(!(o as THREE.Mesh).isMesh)return;const mesh=o as THREE.Mesh;
      const original=mesh.material as THREE.MeshStandardMaterial;const mat=original.clone();mesh.material=mat;
      mat.roughness=.85;mat.metalness=0;mesh.castShadow=true;
      if(player&&['basket','pallavolo'].includes(SPORT))this.physique(mesh,id);
      if(/Shirt/i.test(mesh.name))mat.color.setHex(shirt);
      else if(/Shorts|Pants|Skirt/i.test(mesh.name))mat.color.setHex(a.role==='ref'?CONFIG.visuals.referee.shorts:a.role==='coach'?0x202938:costume??kit.shorts);
      else if(/Socks/i.test(mesh.name))mat.color.setHex(a.role==='ref'?CONFIG.visuals.referee.socks:kit.socks);
      else if(/Shoes/i.test(mesh.name)){mat.color.setHex(SHOES[id%SHOES.length]);if(player&&SPORT==='boxe')mesh.visible=false;}
      else if(/Body/i.test(mesh.name))mat.color.setHex(['basket','pallavolo'].includes(SPORT)&&id%SKIN.length===0?0xe2b48e:SKIN[id%SKIN.length]);
      else if(/Brow/i.test(mesh.name))mat.color.setHex(HAIR[id%HAIR.length]);
      else if(/Beard/.test(mesh.name)){mat.color.setHex(HAIR[id%HAIR.length]);mat.alphaTest=.45;mat.transparent=false;mesh.visible=id%2===0;}
      else if(/Hair/i.test(mesh.name)) {
        mat.color.setHex(HAIR[id%HAIR.length]);mat.alphaTest=.45;mat.transparent=false;
        const varied=this.name==='footballer'||this.name==='athlete-tee';
        const style=varied?id%4:0,key=`${mesh.geometry.uuid}:${style}`;let geometry=hairGeometries.get(key);
        mesh.visible=!varied||id%6!==5;
        if(!geometry){
          geometry=mesh.geometry.clone();geometry.computeBoundingBox();const box=geometry.boundingBox!,center=box.getCenter(new THREE.Vector3());
          const vertices=geometry.getAttribute('position');
          for(let n=0;n<vertices.count;n++)vertices.setXYZ(n,center.x+(vertices.getX(n)-center.x)*(style===2?.62:1),
            box.min.y+(vertices.getY(n)-box.min.y)*[1,.7,1.08,1.18][style],center.z+(vertices.getZ(n)-center.z)*(style===3?1.08:1));
          geometry.computeVertexNormals();hairGeometries.set(key,geometry);
        }
        mesh.geometry=geometry;
        if(this.name.startsWith('rpg-')){
          mesh.visible=mesh.name.includes(id%2?'SimpleParted':'Buzzed');
        }
      }
      if(/Eyelashes/i.test(mesh.name)){mat.alphaTest=.4;mat.transparent=false;}
      if(player&&['basket','pallavolo'].includes(SPORT)&&/Body|Hair/.test(mesh.name))styleSkin(mat,mesh,this.model,this.norm,id,HAIR[id%HAIR.length]);
      if(player&&/Shirt/.test(mesh.name))this.wardrobe.push(dressUniform(mesh,this.model,kit,
        ['calcio','basket','pallavolo','ciclismo'].includes(SPORT)?id%99+1:0,['basket','pallavolo'].includes(SPORT),a.role==='gk'));
      if(player&&/Shorts/.test(mesh.name))this.wardrobe.push(dressUniform(mesh,this.model,kit,0,false,false,true));
      // A bounding box from the bind pose is invalid for a dive or a knockdown.
      mesh.frustumCulled=false;
    });
    const head=this.joints.find(j=>j.name==='Head')?.bone;
    if(head&&costume!==undefined){
      const hat=new THREE.Group();this.accessory('Head',hat);
      const part=(geometry:THREE.BufferGeometry,color:number,x:number,y:number,z:number)=>{
        const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.85}));mesh.position.set(x,y,z);hat.add(mesh);
      };
      if(a.look==='banana'){
        part(new THREE.ConeGeometry(.09,.4,10),costume,0,.33,0);part(new THREE.SphereGeometry(.025,8,6),0x5a3d1a,0,.53,0);
      }else if(a.look==='dino'){
        part(new THREE.SphereGeometry(.14,10,7),costume,0,.12,0);
        for(let n=0;n<3;n++)part(new THREE.ConeGeometry(.035,.09,4),0x246b30,0,.23-n*.035,-.03-n*.05);
      }else if(a.look==='clown'){
        for(const side of [-1,1])part(new THREE.SphereGeometry(.08,9,7),0xff8c1a,side*.12,.11,0);
        part(new THREE.SphereGeometry(.035,9,7),0xff2020,0,.04,.14);
      }else if(a.look==='astronaut'){
        const helmet=new THREE.Mesh(new THREE.SphereGeometry(.17,12,9),new THREE.MeshStandardMaterial({color:0xd8f0ff,transparent:true,opacity:.28,roughness:.15}));
        helmet.position.y=.08;hat.add(helmet);part(new THREE.TorusGeometry(.13,.025,7,14).rotateX(Math.PI/2),0xeef0f2,0,-.05,0);
      }
    }
    if(a.role==='coach'){
      this.phone=new THREE.Mesh(new THREE.BoxGeometry(.065,.12,.012),new THREE.MeshStandardMaterial({color:0x101827,roughness:.35}));
      this.phone.position.set(0,.07,.02);this.phone.visible=false;this.accessory('LeftHand',this.phone);
    }
    const visor=this.model.getObjectByName('Cap');
    if(visor)visor.visible=player||a.role==='spectator';
    // The flat golf cap fits only the footballer's skull; on the other heads it became a ring pierced by the hair.
    if(player&&!visor&&(SPORT==='ciclismo'||SPORT==='vela'||(SPORT==='golf'&&this.name==='footballer'))){
      const hat=new THREE.Mesh(new THREE.SphereGeometry(.126,12,7,0,Math.PI*2,0,Math.PI*.56),new THREE.MeshStandardMaterial({color:SPORT==='vela'?0xf6f2ea:kit.shirt,roughness:.7,side:THREE.DoubleSide}));
      hat.position.y=.13;hat.scale.set(1.05,SPORT==='golf'?.5:.85,1.1);this.accessory('Head',hat);
    }
    if((SPORT==='boxe'&&!['ref','coach','fan','steward','spectator'].includes(a.role))||a.role==='gk') {
      const boxing=SPORT==='boxe';
      const mat=new THREE.MeshStandardMaterial({color:boxing?kit.shirt:0xe4f349,roughness:.7});
      const wrap=new THREE.MeshStandardMaterial({color:0xf4f0dd,roughness:.9});
      for(const name of ['LeftHand','RightHand']) {
        const hand=this.joints.find(j=>j.name===name)?.bone;if(!hand)continue;
        const glove=new THREE.Mesh(new THREE.SphereGeometry(1,10,8).scale(boxing?.09:.065,boxing?.145:.11,boxing?.08:.04),mat);
        glove.name='team-glove';glove.position.y=.08;glove.castShadow=true;this.accessory(name,glove);
        const cuff=new THREE.Mesh(new THREE.CylinderGeometry(.045,.04,.05,10),wrap);cuff.position.y=-.015;this.accessory(name,cuff);
      }
    }
    if(player&&SPORT==='boxe')for(const side of ['Left','Right']){
      const boot=boxingBoot(id%2?0x252c3d:0x6c2630);this.accessory(`${side}Foot`,boot.group,true);this.bootSoles.push(boot.sole);
    }
  }

  private sample(m: AssetMotion | null, target: THREE.Quaternion[], weight=1): number | null {
    const clip=resolveAssetClip(m);if(!m||!clip)return null;
    const mirror=!!m.side&&(m.group==='keeperStep'?!!clip.travel&&Math.sign(clip.travel[0])!==m.side
      :!!clip.direction&&m.side!==clip.direction&&/keeper(Dive|Block)/.test(m.group));
    let u=m.loop?m.time%1:Math.min(1,Math.max(0,m.time/Math.max(.001,m.duration)));
    if(m.loop&&m.travel!==undefined&&clip.cycle)u=((m.travel/(clip.cycle*this.scale))%1+1)%1;
    else if(m.loop&&(m.group.endsWith('Slow')||m.group==='celebrationDance'))u=m.time/clip.duration%1;
    else if(STRIKES.includes(m.group)&&Number.isFinite(m.duration)){
      u=THREE.MathUtils.clamp((clip.contact+m.time-m.contact*m.duration)/clip.duration,0,1);
    }
    else if(REACTIONS.includes(m.group))u=Math.min(1,m.time*1.25/clip.duration);
    else if(!m.loop&&(m.natural||NATURAL.test(m.group))){
      const pace=m.natural||!Number.isFinite(m.duration)?1:THREE.MathUtils.clamp(clip.duration/Math.max(.001,m.duration),.6,1.4);
      u=Math.min(1,Math.max(0,m.time*pace/clip.duration));
    }
    else if(!m.loop&&['golfDrive','golfChip','golfPutt'].includes(m.group)) {
      const impact=clip.contact/clip.duration, split=THREE.MathUtils.clamp(m.contact,.05,.95);
      u=u<split?u/split*impact:impact+(u-split)/(1-split)*(1-impact);
    }
    const frame=u*(clip.frames-1), lo=Math.floor(frame),hi=Math.min(clip.frames-1,lo+1), mix=frame-lo;
    let indices=this.mappings.get(clip.id);
    if(!indices){indices=new Map(clip.bones.map((n,i)=>[n,i]));this.mappings.set(clip.id,indices);}
    for(let i=0;i<this.joints.length;i++) {
      const joint=this.joints[i], name=mirror?joint.name.replace(/Left|Right/,s=>s==='Left'?'Right':'Left'):joint.name;
      const index=indices.get(name);if(index===undefined)continue;
      this.q0.fromArray(animationData,clip.offset+lo*clip.stride+index*4).normalize();
      this.q1.fromArray(animationData,clip.offset+hi*clip.stride+index*4).normalize();
      this.q0.slerp(this.q1,mix);
      if(mirror)this.q0.set(this.q0.x,-this.q0.y,-this.q0.z,this.q0.w);
      this.q0.premultiply(joint.parent).multiply(joint.world);
      if(weight===1)target[i].copy(this.q0);else target[i].slerp(this.q0,weight);
    }
    const y=clip.bones.length*4;
    return THREE.MathUtils.lerp(animationData[clip.offset+lo*clip.stride+y],animationData[clip.offset+hi*clip.stride+y],mix)/manifest.hipScale;
  }

  private calibrateGolf(m: AssetMotion, actor: Actor, time: number, actorRoot: THREE.Group) {
    if(!this.golfSocket||!this.golfClub||!this.hip)return;
    const clip=resolveAssetClip(m);if(!clip)return;
    // A practice swing (natural pace) passes its clip's contact frame over the club head of the address; own entry, so strokes keep theirs.
    const key=m.natural?`${clip.id}:practice`:clip.id;
    let grip=this.golfGrips.get(key);
    if(!grip){
      const contact=this.joints.map(j=>j.rest.clone()), y=this.sample({...m,time:m.natural?clip.contact:m.duration*m.contact},contact), liveHip=this.hip.bone.position.clone();
      this.joints.forEach((j,i)=>j.bone.quaternion.copy(contact[i]));this.hip.bone.position.copy(this.hip.position).addScaledVector(this.hipUp,(y??0)*this.hipHeight);
      this.model.updateWorldMatrix(true,true);
      const hand=this.golfSocket.getWorldPosition(new THREE.Vector3());
      const target=netContactPoint(actor,time,m.natural?0:m.duration*m.contact), direction=target.sub(hand);
      const length=THREE.MathUtils.clamp(direction.length()/actorRoot.scale.y/.975,.7,1.4);
      const desired=new THREE.Quaternion().setFromUnitVectors(down,direction.normalize());
      const rotation=this.golfSocket.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired);
      grip={rotation,length};this.golfGrips.set(key,grip);
      this.joints.forEach((j,i)=>j.bone.quaternion.copy(this.poseQ[i]));this.hip.bone.position.copy(liveHip);
    }
    this.golfSocket.quaternion.copy(grip.rotation);this.golfClub.scale.y=grip.length;
  }

  /** Fit the imported limb lengths to the simulation's hand/foot contact points. */
  private reach(upperName: string, lowerName: string, endName: string, target: THREE.Vector3, endRotation?: THREE.Quaternion) {
    const upper=this.joints.find(j=>j.name===upperName)?.bone,lower=this.joints.find(j=>j.name===lowerName)?.bone,end=this.joints.find(j=>j.name===endName)?.bone;
    if(!upper||!lower||!end)return;
    this.model.updateWorldMatrix(true,true);
    const start=upper.getWorldPosition(new THREE.Vector3()),mid=lower.getWorldPosition(new THREE.Vector3()),tip=end.getWorldPosition(new THREE.Vector3());
    const keep=endRotation??end.getWorldQuaternion(new THREE.Quaternion());
    const l1=start.distanceTo(mid),l2=mid.distanceTo(tip),direction=target.clone().sub(start),distance=THREE.MathUtils.clamp(direction.length(),.001,l1+l2-.001);
    direction.normalize();
    const pole=mid.clone().sub(start).addScaledVector(direction,-mid.clone().sub(start).dot(direction));
    if(pole.lengthSq()<1e-6)pole.set(0,0,1).addScaledVector(direction,-direction.z);
    pole.normalize();const along=(l1*l1+distance*distance-l2*l2)/(2*distance);
    const bend=start.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
    const rotate=(bone: THREE.Bone,from: THREE.Vector3,to: THREE.Vector3)=>{
      const q=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
      this.model.updateWorldMatrix(true,true);
    };
    rotate(upper,mid.sub(start),bend.clone().sub(start));
    const elbow=lower.getWorldPosition(new THREE.Vector3());
    rotate(lower,end.getWorldPosition(new THREE.Vector3()).sub(elbow),target.clone().sub(elbow));
    end.quaternion.copy(end.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(keep));
  }

  /** Around the contact frame the punching glove meets the opponent's face (or body) instead of the clip's empty air. */
  private landPunch(m: AssetMotion, actor: Actor) {
    const clip=resolveAssetClip(m),target=actor.faceTarget,opponent=target&&live.get(target);
    if(!clip?.hand||!opponent||['crouch','fall','getUp'].includes(target.pose))return;
    const w=1-THREE.MathUtils.smoothstep(Math.abs(m.time-m.contact*m.duration),0,.16);if(w<=0)return;
    const side=clip.hand.startsWith('Left')?'Left':'Right',hand=this.joints.find(j=>j.name===`${side}Hand`)?.bone;
    const aim=opponent.joints.find(j=>j.name===(m.group==='boxingBodyJab'?'Spine1':'Head'))?.bone;if(!hand||!aim)return;
    this.model.updateWorldMatrix(true,true);
    const from=hand.getWorldPosition(new THREE.Vector3()),point=aim.getWorldPosition(new THREE.Vector3());
    if(m.group!=='boxingBodyJab')point.y+=.08*this.scale;
    // The glove is centred .08 along the hand bone and .145 long: stop its front, not the wrist, on the target.
    const glove=.225*this.scale;
    point.addScaledVector(point.clone().sub(from).normalize(),-glove);
    this.reach(`${side}Arm`,`${side}ForeArm`,`${side}Hand`,from.lerp(point,w));
  }

  /** Procedural pose: hands and feet on the choreography's contact points (ball, bike, racket). */
  private fitLimbs(actor: Actor, driver: Athlete, actorRoot: THREE.Group) {
    for(const [side,wrist,knee]of [['Left',driver.wristR,driver.kneeR],['Right',driver.wristL,driver.kneeL]] as const){
      const hand=driver.bike&&actor.pose!=='celebrate'?actorRoot.localToWorld(new THREE.Vector3(.62,1,side==='Left'?-.2:.2)):wrist.getWorldPosition(new THREE.Vector3());
      this.reach(`${side}Arm`,`${side}ForeArm`,`${side}Hand`,hand);
      const foot=this.joints.find(j=>j.name===`${side}Foot`);
      const rotation=driver.bike&&foot?actorRoot.getWorldQuaternion(new THREE.Quaternion()).multiply(facing).multiply(foot.world):undefined;
      this.reach(`${side}UpLeg`,`${side}Leg`,`${side}Foot`,knee.localToWorld(new THREE.Vector3(0,-.4,0)),rotation);
    }
  }

  update(actor: Actor, time: number, carrying: boolean, driver: Athlete, actorRoot: THREE.Group) {
    this.carol?.apply(actor.appearance??actor.id);
    this.root.position.y=0;this.scale=actorRoot.scale.y;
    actorRoot.updateWorldMatrix(true,true);
    actorRoot.getWorldQuaternion(this.driverInverse).invert();
    this.model.getWorldQuaternion(this.modelInverse).invert();
    // Procedural sport choreography still drives the imported skeleton where no supplied clip exists.
    for(const joint of this.joints){joint.bone.quaternion.copy(joint.rest);joint.bone.position.copy(joint.position);}
    for(const joint of this.joints){
      if(joint.source){
        joint.source.getWorldQuaternion(this.q0).premultiply(this.driverInverse);
        this.q0.premultiply(inverseFacing).multiply(facing).multiply(joint.procedural);
        joint.bone.parent!.getWorldQuaternion(this.q1).premultiply(this.modelInverse).invert();
        joint.bone.quaternion.copy(this.q0).premultiply(this.q1);joint.bone.updateWorldMatrix(false,false);
      }
    }
    const current=assetMotion(actor,time,carrying), previous=assetMotion(actor,time,carrying,true);
    // Strikes start already near contact: a long blend from the previous pose would land the boot or glove late.
    const blend=THREE.MathUtils.smoothstep(actor.poseBlendTime,0,current&&STRIKES.includes(current.group)?.08:CONFIG.visuals.poseBlendSec);
    const share=(m: AssetMotion|null)=>m?m.weight??1:0;
    // Every target is a cross-fade over the procedural pose: previous gesture -> current gesture, gait -> nearby gait.
    const procHip=(driver.body.position.y-.94)/this.norm;
    if(share(current)<1||(blend<1&&share(previous)<1)){
      if(this.hip)this.hip.bone.position.copy(this.hip.position).addScaledVector(this.hipUp,procHip);
      this.fitLimbs(actor,driver,actorRoot);
    }
    for(let i=0;i<this.joints.length;i++)this.procQ[i].copy(this.joints[i].bone.quaternion);
    const compose=(m: AssetMotion|null,target: THREE.Quaternion[])=>{
      target.forEach((q,i)=>q.copy(this.procQ[i]));
      let hip=procHip;const s=share(m);if(!m)return hip;
      const y=this.sample(m,target,s);if(y!==null)hip=THREE.MathUtils.lerp(hip,y*this.hipHeight,s);
      if(m.mix){const y2=this.sample(m.mix.motion,target,s*m.mix.weight);if(y2!==null)hip=THREE.MathUtils.lerp(hip,y2*this.hipHeight,s*m.mix.weight);}
      return hip;
    };
    const planted=(m: AssetMotion|null)=>m?share(m)*((PLANTED.test(m.group)?1:0)*(1-(m.mix?.weight??0))+(m.mix&&PLANTED.test(m.mix.motion.group)?m.mix.weight:0)):0;
    let hipOffset=compose(current,this.poseQ),floorWeight=planted(current);
    if(blend<1){
      const before=compose(previous,this.prevQ);
      for(let i=0;i<this.joints.length;i++)this.poseQ[i].copy(this.prevQ[i].slerp(this.poseQ[i],blend));
      hipOffset=THREE.MathUtils.lerp(before,hipOffset,blend);floorWeight=THREE.MathUtils.lerp(planted(previous),floorWeight,blend);
    }
    for(let i=0;i<this.joints.length;i++)this.joints[i].bone.quaternion.copy(this.poseQ[i]);
    if(this.hip)this.hip.bone.position.copy(this.hip.position).addScaledVector(this.hipUp,hipOffset);
    if(floorWeight>0){
      const feet=this.joints.filter(j=>j.name==='LeftFoot'||j.name==='RightFoot');
      const lowest=Math.min(...feet.map(j=>j.bone.getWorldPosition(new THREE.Vector3()).y));
      if(Number.isFinite(lowest))this.root.position.y=-(lowest-actorRoot.position.y-this.ankleHeight*actorRoot.scale.y)/actorRoot.scale.y;
      if(this.soles.length||this.bootSoles.length){
        // updateMatrixWorld also refreshes bindMatrixInverse; a stale one from the last render accumulated the previous offset every frame.
        this.root.position.y=0;this.root.updateMatrixWorld(true);let floor=Infinity;const point=new THREE.Vector3();
        for(const {mesh,indices}of this.soles){mesh.skeleton.update();for(const i of indices){mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);floor=Math.min(floor,point.y);}}
        for(const sole of this.bootSoles)floor=Math.min(floor,new THREE.Box3().setFromObject(sole).min.y);
        if(Number.isFinite(floor))this.root.position.y=-(floor-actorRoot.position.y)/actorRoot.scale.y;
      }
      // Partly planted (fading into a run or a procedural gesture): only that share of the correction.
      this.root.position.y*=floorWeight;
      this.root.updateWorldMatrix(true,true);
    }
    if(current&&/^boxing(Jab|BodyJab|Hook)$/.test(current.group))this.landPunch(current,actor);
    if(current&&/^golf(Drive|Chip|Putt)$/.test(current.group))this.calibrateGolf(current,actor,time,actorRoot);
    else if(!current&&this.golfSocket&&this.defaultGrip){this.golfSocket.quaternion.copy(this.defaultGrip);this.golfClub!.scale.y=1;}
    if(this.phone)this.phone.visible=actor.gesture==='phone';
    this.root.userData.motion=current?.group??'procedural';
    this.root.userData.clip=resolveAssetClip(current)?.id;
    this.root.userData.variant=actor.gestureVariant??0;
  }
}

export const animationStats = () => ({ clips:manifest.clips.length, groups:Object.fromEntries([...pools].map(([k,v])=>[k,v.length])) });

/** Bake six poses of the supplied human once. Thousands of spectators share these GPU buffers. */
export async function createCrowdHumans(count: number, shirts: number[]) {
  const [template]=await Promise.all([characterTemplate('crowd'),loadAnimations()]);
  const model=clone(template) as THREE.Group;
  const bones=new Map<string,THREE.Bone>();model.traverse(o=>{if((o as THREE.Bone).isBone)bones.set(o.name,o as THREE.Bone);});
  model.updateMatrixWorld(true);
  const rest=new Map([...bones].map(([n,b])=>[n,b.quaternion.clone()]));
  const importedRest=new Map([...bones].map(([name,bone])=>[name,{world:bone.getWorldQuaternion(new THREE.Quaternion()),parent:bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert(),position:bone.position.clone()}]));
  function importedPose(group: string, phase: number) {
    const clip=pools.get(group)?.[0];if(!clip)return false;
    const frame=Math.min(clip.frames-1,Math.round(phase*(clip.frames-1))),q=new THREE.Quaternion();
    clip.bones.forEach((name,i)=>{
      const bone=bones.get(name),r=importedRest.get(name);if(!bone||!r)return;
      q.fromArray(animationData,clip.offset+frame*clip.stride+i*4).normalize();bone.quaternion.copy(q.premultiply(r.parent).multiply(r.world));
    });
    const hip=bones.get('Hips'),p=importedRest.get('Hips')?.position;
    if(hip&&p)hip.position.copy(p).setY(p.y*(1+animationData[clip.offset+frame*clip.stride+clip.stride-1]/manifest.hipScale));
    return true;
  }
  function turn(name: string, axis: THREE.Vector3, angle: number) {
    const b=bones.get(name);if(!b)return;
    const parent=b.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    const world=b.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(axis,angle));
    b.quaternion.copy(parent).multiply(world);model.updateMatrixWorld(true);
  }
  const z=new THREE.Vector3(0,0,1), x=new THREE.Vector3(1,0,0);
  function pose(state: number) {
    for(const [name,b] of bones){b.quaternion.copy(rest.get(name)!);b.position.copy(importedRest.get(name)!.position);}
    model.updateMatrixWorld(true);
    const motion=state===0?['crowdSit',.35]:state===1?['sidelineIdle',.1]:state===3?['crowdSitTalk',.5]:state===4?['crowdSitIn',.5]:state===5?['crowdSitOut',.5]:null;
    const captured=motion?importedPose(motion[0] as string,motion[1] as number):false;
    if(!captured){
      turn('LeftArm',z,state===2?.9:-1.4);turn('RightArm',z,state===2?-.9:1.4);
      if(state===0){turn('LeftUpLeg',x,-1.35);turn('RightUpLeg',x,-1.35);turn('LeftLeg',x,1.5);turn('RightLeg',x,1.5);}
    }
    model.updateMatrixWorld(true);
    model.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)(o as THREE.SkinnedMesh).skeleton.update();});
  }
  const skinned: THREE.SkinnedMesh[]=[];model.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)skinned.push(o as THREE.SkinnedMesh);});
  const positions=skinned.map(()=>[] as Float32Array[]);
  const box=new THREE.Box3().setFromObject(model), scale=.85/(box.max.y-box.min.y), v=new THREE.Vector3();
  for(const state of [0,1,2,3,4,5]) {
    pose(state);
    skinned.forEach((mesh,i)=>{
      const attr=mesh.geometry.getAttribute('position'), points=new Float32Array(attr.count*3);
      for(let n=0;n<attr.count;n++){
        mesh.getVertexPosition(n,v);v.applyMatrix4(mesh.matrixWorld);v.y-=box.min.y;v.multiplyScalar(scale).applyQuaternion(facing);v.toArray(points,n*3);
      }
      positions[i][state]=points;
    });
  }
  const fanState=new THREE.InstancedBufferAttribute(new Float32Array(count*4),4);
  const meshes=skinned.map((source,i)=>{
    const geo=source.geometry.clone();geo.deleteAttribute('skinIndex');geo.deleteAttribute('skinWeight');
    geo.setAttribute('position',new THREE.BufferAttribute(positions[i][1],3));geo.computeVertexNormals();
    geo.setAttribute('seatedPosition',new THREE.BufferAttribute(positions[i][0],3));
    geo.setAttribute('cheeringPosition',new THREE.BufferAttribute(positions[i][2],3));geo.setAttribute('fanState',fanState);
    geo.setAttribute('talkingPosition',new THREE.BufferAttribute(positions[i][3],3));
    geo.setAttribute('enterPosition',new THREE.BufferAttribute(positions[i][4],3));
    geo.setAttribute('exitPosition',new THREE.BufferAttribute(positions[i][5],3));
    const mat=(source.material as THREE.MeshStandardMaterial).clone();
    mat.onBeforeCompile=shader=>{
      shader.vertexShader='attribute vec3 seatedPosition; attribute vec3 cheeringPosition; attribute vec3 talkingPosition; attribute vec3 enterPosition; attribute vec3 exitPosition; attribute vec4 fanState;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        'vec3 seated = mix(seatedPosition,talkingPosition,fanState.z); vec3 middle = fanState.w > 0.0 ? exitPosition : enterPosition; vec3 transformed = fanState.x < 0.5 ? mix(seated,middle,fanState.x*2.0) : mix(middle,position,(fanState.x-0.5)*2.0); transformed = mix(transformed, cheeringPosition, fanState.y);');
    };
    mat.customProgramCacheKey=()=> 'human-crowd-poses-v2';
    if(/Hair|Eyelash/.test(source.name)){mat.alphaTest=.45;mat.transparent=false;}
    const mesh=new THREE.InstancedMesh(geo,mat,count);mesh.frustumCulled=false;
    const color=new THREE.Color();
    for(let n=0;n<count;n++)mesh.setColorAt(n,color.setHex(/Shirt/.test(source.name)?shirts[n]:/Body/.test(source.name)?SKIN[n%SKIN.length]:/Hair/.test(source.name)?HAIR[n%HAIR.length]:/Shorts/.test(source.name)?0x334257:/Socks/.test(source.name)?0xcbd0cf:0x555966));
    return mesh;
  });
  return {meshes,fanState};
}
