import * as THREE from 'three';
import {styleSkin} from './skin';

export const CAROL_STYLES=['long-visor','bob','cropped','bun','ponytail','side-part'] as const;
const hairColours=[0x2c211d,0x70482c,0x202329,0xa85c36,0xd2ac68,0x63544b];
const skinColours=[0xffffff,0xf0d1b4,0xbb8b69,0xe1b58f,0x916549,0xf8dfc5];
const variants=new Map<string,THREE.BufferGeometry>();
const bunGeometry=new THREE.SphereGeometry(.065,14,10).scale(1,.88,1.07);
const ponyCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.18,-.12),new THREE.Vector3(.015,.12,-.22),new THREE.Vector3(.02,-.015,-.25),new THREE.Vector3(.035,-.14,-.21)]);
const ponyGeometry=new THREE.TubeGeometry(ponyCurve,18,.041,8,false);
const ponyPosition=ponyGeometry.getAttribute('position'),ponyUV=ponyGeometry.getAttribute('uv'),at=new THREE.Vector3();
for(let i=0;i<ponyPosition.count;i++){
  const t=ponyUV.getX(i),center=ponyCurve.getPointAt(t);
  at.fromBufferAttribute(ponyPosition,i).sub(center).multiplyScalar(1-.72*t).add(center);ponyPosition.setXYZ(i,at.x,at.y,at.z);
}
ponyGeometry.computeVertexNormals();

interface Part {mesh: THREE.Mesh;source: THREE.BufferGeometry;frame: THREE.Matrix4;inverse: THREE.Matrix4}

/** Six fitted variants of the supplied body. Only geometry/materials change; the imported skeleton and its animation stay intact. */
export class CarolAppearance {
  private parts: Part[]=[];
  private current=-1;
  private ornaments=new THREE.Group();
  private bun: THREE.Mesh;
  private pony: THREE.Mesh;
  private ornamentMaterial=new THREE.MeshStandardMaterial({color:hairColours[0],roughness:.86});

  constructor(private model: THREE.Group,private norm: number) {
    model.updateWorldMatrix(true,true);
    const head=model.getObjectByName('Head')!;
    const inverseHead=head.matrixWorld.clone().invert();
    model.traverse(o=>{
      if(!(o as THREE.Mesh).isMesh)return;const mesh=o as THREE.Mesh;
      if(!/^(Hair|Body|BodyHead|Shirt|Skirt|Cap|Bands)$/.test(mesh.name))return;
      const frame=inverseHead.clone().multiply(mesh.matrixWorld);
      this.parts.push({mesh,source:mesh.geometry,frame,inverse:frame.clone().invert()});
      if(mesh.name==='Hair')styleSkin(mesh.material as THREE.MeshStandardMaterial,mesh,model,norm,0,hairColours[0]);
    });
    this.bun=new THREE.Mesh(bunGeometry,this.ornamentMaterial);this.bun.position.set(0,.255,-.11);
    this.pony=new THREE.Mesh(ponyGeometry,this.ornamentMaterial);this.bun.castShadow=this.pony.castShadow=true;
    this.ornaments.name='carol-hairstyle';this.ornaments.scale.setScalar(1/norm);this.ornaments.add(this.bun,this.pony);head.add(this.ornaments);
  }

  apply(appearance: number) {
    const style=((appearance%CAROL_STYLES.length)+CAROL_STYLES.length)%CAROL_STYLES.length;
    if(this.current===style)return;this.current=style;
    this.model.userData.hairstyle=CAROL_STYLES[style];
    const point=new THREE.Vector3();
    for(const {mesh,source,frame,inverse} of this.parts){
      const material=mesh.material as THREE.MeshStandardMaterial;
      if(/Body/.test(mesh.name))material.color.setHex(skinColours[style]);
      if(mesh.name==='Cap'){mesh.visible=style===0||style===4;material.map=null;material.color.setHex(0xf5efe5);material.needsUpdate=true;continue;}
      if(mesh.name==='Bands'){material.map=null;material.color.setHex(hairColours[style]);continue;}
      const key=`${source.uuid}:carol:${style}`;let geometry=variants.get(key);
      if(!geometry){
        geometry=source.clone();const vertices=geometry.getAttribute('position');
        for(let i=0;i<vertices.count;i++){
          point.fromBufferAttribute(vertices,i).applyMatrix4(frame).multiplyScalar(this.norm);
          if(mesh.name==='Hair'){
            // Compress the lower locks only: the scalp keeps its fit and the hair never shrinks into the face.
            const crop=[1,.42,.14,.14,.18,.60][style];
            if(point.y<.07)point.y=.07+(point.y-.07)*crop;
            if(point.z<-.085)point.z=-.085+(point.z+.085)*[1,.58,.20,.22,.25,.60][style];
            if(point.y>.21)point.y=.21+(point.y-.21)*(style===0?1:.48);
            if(style===5){if(point.x<0&&point.y<.13)point.y=.13+(point.y-.13)*.45;point.x+=.015*THREE.MathUtils.smoothstep(point.y,.10,.25);}
          }else{
            const head=THREE.MathUtils.smoothstep(point.y,-.04,.06);
            const face=[.96,1.04,.93,1.01,1.07,.98][style],body=[.98,1.02,.96,1.04,1,.97][style];
            const torso=(1-THREE.MathUtils.smoothstep(Math.abs(point.x),.20,.43))*(1-head);
            point.x*=1+(face-1)*head+(body-1)*torso;
          }
          point.multiplyScalar(1/this.norm).applyMatrix4(inverse);vertices.setXYZ(i,point.x,point.y,point.z);
        }
        geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();variants.set(key,geometry);
      }
      mesh.geometry=geometry;
      if(mesh.name==='Hair'){mesh.visible=true;material.color.setHex(hairColours[style]);}
    }
    this.bun.visible=style===3;this.pony.visible=style===4;this.ornamentMaterial.color.setHex(hairColours[style]);
  }
}
