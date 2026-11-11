import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import type {Species} from '../sim/fauna';

const urls=import.meta.glob('../assets/animals/*.glb',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const templates=new Map<string,GLTF>();
const specs={dog:{id:'husky',yaw:Math.PI/2,height:.62},eagle:{id:'eagle',yaw:Math.PI/2,span:2},deer:{id:'deer',yaw:Math.PI/2,height:1.8},duck:{id:'duck',yaw:Math.PI/2,height:.35}};
type ImportedSpecies = keyof typeof specs;
let loading: Promise<void> | undefined;

export function loadAnimalModels() {
  return loading??=Promise.all(Object.values(specs).map(async spec=>{
    const gltf=await new GLTFLoader().loadAsync(urls[`../assets/animals/${spec.id}.glb`]);
    templates.set(spec.id,gltf);
  })).then(()=>{});
}

export class AnimalModel {
  readonly root=new THREE.Group();
  readonly model: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private duration: number;
  private grounded: boolean;
  private clips: THREE.AnimationClip[];
  private species: ImportedSpecies;

  constructor(template: GLTF, species: ImportedSpecies) {
    const spec=specs[species];this.grounded=species==='dog'||species==='deer';this.species=species;
    this.model=clone(template.scene) as THREE.Group;
    this.mixer=new THREE.AnimationMixer(this.model);
    this.clips=template.animations;
    const clip=this.clips.find(c=>species==='deer'?/WalkFast/.test(c.name):species==='duck'?/idleWater1/.test(c.name):false)??this.clips[0];this.duration=clip.duration;
    this.mixer.clipAction(clip).setLoop(THREE.LoopRepeat,Infinity).play();this.mixer.setTime(0);
    this.model.updateMatrixWorld(true);
    this.model.traverse(o=>{
      if(!(o as THREE.Mesh).isMesh)return;
      const mesh=o as THREE.SkinnedMesh;mesh.castShadow=true;mesh.frustumCulled=false;
      if(mesh.isSkinnedMesh)mesh.computeBoundingBox();
    });
    const bounds=new THREE.Box3().setFromObject(this.model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale='height' in spec?spec.height/size.y:spec.span/Math.max(size.x,size.z);
    const fit=new THREE.Group();fit.scale.setScalar(scale);fit.rotation.y=spec.yaw;
    this.model.position.add(new THREE.Vector3(-center.x,this.grounded?-bounds.min.y:-center.y,-center.z));
    fit.add(this.model);this.root.add(fit);
    this.root.name=species==='dog'?'trail-dog':`animated-${species}`;
    this.root.userData.animal=spec.id;
    if(species==='dog'){
      // A collar distinguishes the adapted trail dog from the source wolf; its metre frame also follows the imported neck rig.
      this.root.updateMatrixWorld(true);
      const neck=this.model.getObjectByName('Neck2')??this.model.getObjectByName('Neck1'),head=this.model.getObjectByName('Head');
      if(neck&&head){
        const frame=new THREE.Group(),boneScale=neck.getWorldScale(new THREE.Vector3());
        frame.scale.set(1/boneScale.x,1/boneScale.y,1/boneScale.z);frame.quaternion.copy(neck.getWorldQuaternion(new THREE.Quaternion()).invert());
        const direction=head.getWorldPosition(new THREE.Vector3()).sub(neck.getWorldPosition(new THREE.Vector3())).normalize();
        const collar=new THREE.Mesh(new THREE.TorusGeometry(.105,.012,7,24),new THREE.MeshStandardMaterial({color:0x237d85,roughness:.75}));
        collar.name='trail-dog-collar';collar.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);collar.castShadow=true;
        const tag=new THREE.Mesh(new THREE.SphereGeometry(.018,10,6).scale(1,1.15,.35),new THREE.MeshStandardMaterial({color:0xd8ae48,roughness:.4,metalness:.4}));
        tag.position.set(.015,-.105,.04);frame.add(collar,tag);neck.add(frame);
      }
    }
  }

  sample(time: number, gait: number, moving: boolean, flying = true) {
    if(this.species==='deer'||this.species==='duck'){
      const name=this.species==='deer'?(moving?'WalkFast':'Idle'):(flying?'fly_loop':time>=2.5?'idleWaterGoToFly':'idleWater1');
      const clip=this.clips.find(c=>c.name.includes(name))??this.clips[0];
      this.mixer.stopAllAction();this.mixer.clipAction(clip).setLoop(THREE.LoopRepeat,Infinity).play();
      this.duration=clip.duration;
    }
    // Sample from absolute simulation time/distance, so replay seeks and repeated frames give exactly the same skeleton.
    const phase=this.grounded&&moving?gait*this.duration:this.species==='dog'?0:time;
    this.mixer.setTime(((phase%this.duration)+this.duration)%this.duration);
    this.root.updateMatrixWorld(true);
  }
}

export function importedAnimal(species: Species) {
  if(!(species in specs))return undefined;
  const imported=species as ImportedSpecies;
  const template=templates.get(specs[imported].id);
  return template?new AnimalModel(template,imported):undefined;
}
