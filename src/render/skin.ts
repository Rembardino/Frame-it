import * as THREE from 'three';

const skinReferences=new Map<string,THREE.Color>();
function skinReference(mesh: THREE.Mesh, texture: THREE.Texture | null) {
  if(!texture?.image)return new THREE.Color(.5,.3,.18);
  let reference=skinReferences.get(texture.uuid);
  if(!reference){
    const canvas=document.createElement('canvas'),image=texture.image as HTMLImageElement | ImageBitmap;
    canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    mesh.geometry.computeBoundingBox();
    const box=mesh.geometry.boundingBox!,positions=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');
    const samples: THREE.Color[]=[];
    if(uv)for(let i=0;i<positions.count;i++){
      if(positions.getY(i)<box.max.y-(box.max.y-box.min.y)*.16)continue;
      const x=Math.min(canvas.width-1,Math.max(0,Math.floor(uv.getX(i)*canvas.width)));
      const y=Math.min(canvas.height-1,Math.max(0,Math.floor(uv.getY(i)*canvas.height))),offset=(y*canvas.width+x)*4;
      const r=pixels[offset]/255,g=pixels[offset+1]/255,b=pixels[offset+2]/255;
      if(r>g&&g>b&&r>.18)samples.push(new THREE.Color().setRGB(r,g,b,THREE.SRGBColorSpace));
    }
    samples.sort((a,b)=>(a.r+a.g+a.b)-(b.r+b.g+b.b));
    const middle=samples.slice(Math.floor(samples.length*.25),Math.ceil(samples.length*.8));
    reference=middle.length?middle.reduce((sum,c)=>sum.add(c),new THREE.Color(0,0,0)).multiplyScalar(1/middle.length):new THREE.Color(.5,.3,.18);
    skinReferences.set(texture.uuid,reference);
  }
  return reference;
}

/** Keep the supplied face detail; make tattoos optional and give the imported hair a readable colour instead of multiplying black texels. */
export function styleSkin(material: THREE.MeshStandardMaterial, mesh: THREE.Mesh, model: THREE.Group, norm: number, id: number, hair: number, bald=false) {
  model.updateWorldMatrix(true,true);
  const frame=new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld);
  const isHair=/Hair/.test(mesh.name);
  const reference=isHair?new THREE.Color():skinReference(mesh,material.map);
  const beardColor=new THREE.Color(hair);material.userData.beardColor=beardColor;
  let scalpTop=0;
  if(bald){const positions=mesh.geometry.getAttribute('position'),point=new THREE.Vector3();for(let i=0;i<positions.count;i++)scalpTop=Math.max(scalpTop,point.fromBufferAttribute(positions,i).applyMatrix4(frame).y*norm);}
  material.onBeforeCompile=shader=>{
    shader.uniforms.skinFrame={value:frame};shader.uniforms.skinNorm={value:norm};shader.uniforms.beardColor={value:beardColor};
    shader.uniforms.sourceSkinColor={value:reference};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      uniform mat4 skinFrame;uniform float skinNorm;varying vec3 vSkinPosition;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
      vSkinPosition=(skinFrame*vec4(position,1.0)).xyz*skinNorm;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vSkinPosition;uniform vec3 beardColor;uniform vec3 sourceSkinColor;`)
      .replace('#include <map_fragment>',`#include <map_fragment>
      ${isHair?`#ifdef USE_MAP
        float strand=max(max(sampledDiffuseColor.r,sampledDiffuseColor.g),sampledDiffuseColor.b);
        diffuseColor.rgb=diffuse*mix(0.55,1.0,pow(max(strand,0.001),0.25));
      #endif`:`
        #ifdef USE_MAP
          diffuseColor.rgb=diffuse*clamp(sampledDiffuseColor.rgb/max(sourceSkinColor,vec3(0.01)),vec3(0.08),vec3(1.35));
        #endif
        ${id%4!==0?'diffuseColor.rgb=mix(diffuseColor.rgb,diffuse,1.0-smoothstep(1.45,1.62,vSkinPosition.y));':''}
        ${id%3===1?`float beard=(1.0-smoothstep(0.080,0.10,abs(vSkinPosition.x)))*smoothstep(0.06,0.085,vSkinPosition.z)
          *smoothstep(1.63,1.66,vSkinPosition.y)*(1.0-smoothstep(1.72,1.75,vSkinPosition.y));
          diffuseColor.rgb=mix(diffuseColor.rgb,beardColor,beard*0.8);`:''}
        ${bald?`diffuseColor.rgb=mix(diffuseColor.rgb,diffuse,smoothstep(${(scalpTop-.065).toFixed(5)},${(scalpTop-.035).toFixed(5)},vSkinPosition.y));`:''}
      `}`);
  };
  material.customProgramCacheKey=()=>`athlete-skin-v2-${isHair?'hair':id%12}-${bald?scalpTop.toFixed(5):'covered'}`;
  material.needsUpdate=true;
}
