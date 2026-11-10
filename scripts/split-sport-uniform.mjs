import * as THREE from 'three';

/** Split at real cutting planes, interpolating skin weights, so sleeves and shorts have clean edges. */
export function splitSportUniform(doc, primitive, matrix, female) {
 const buffer=doc.getRoot().listBuffers()[0],position=primitive.getAttribute('POSITION');
 const semantics=primitive.listSemantics().filter(s=>s!=='TANGENT'&&s!=='COLOR_0');
 const vertices=Array.from({length:position.getCount()},(_,i)=>{
  const attributes=Object.fromEntries(semantics.map(s=>[s,primitive.getAttribute(s).getElement(i,[])]));
  return {attributes,world:new THREE.Vector3().fromArray(attributes.POSITION).applyMatrix4(matrix)};
 });
 const minY=Math.min(...vertices.map(v=>v.world.y)),height=Math.max(...vertices.map(v=>v.world.y))-minY;
 const mix=(a,b,t)=>{
  const attributes={};
  for(const s of semantics)if(!['JOINTS_0','WEIGHTS_0'].includes(s))attributes[s]=a.attributes[s].map((n,i)=>n+(b.attributes[s][i]-n)*t);
  const weights=new Map();
  for(const [v,amount]of [[a,1-t],[b,t]])for(let i=0;i<4;i++)weights.set(v.attributes.JOINTS_0[i],(weights.get(v.attributes.JOINTS_0[i])??0)+v.attributes.WEIGHTS_0[i]*amount);
  const best=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4);while(best.length<4)best.push([0,0]);const sum=best.reduce((n,p)=>n+p[1],0);
  attributes.JOINTS_0=best.map(p=>p[0]);attributes.WEIGHTS_0=best.map(p=>p[1]/sum);
  return {attributes,world:a.world.clone().lerp(b.world,t)};
 };
 const clip=(poly,axis,bound,above)=>{
  const out=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],da=a.world[axis]-bound,db=b.world[axis]-bound;
   if(above?da>=0:da<=0)out.push(a);
   if((da>0&&db<0)||(da<0&&db>0))out.push(mix(a,b,da/(da-db)));
  }
  return out;
 };
 const planes=[.06,.18,.36,.555,.825].map(h=>['y',minY+h*height]);if(female)planes.push(['x',-.39],['x',.39]);
 const parts=new Map(),indices=primitive.getIndices().getArray();
 for(let i=0;i<indices.length;i+=3){
  let polygons=[[vertices[indices[i]],vertices[indices[i+1]],vertices[indices[i+2]]]];
  for(const [axis,bound]of planes)polygons=polygons.flatMap(poly=>{
   const d=poly.map(v=>v.world[axis]-bound);
   return Math.min(...d)<-1e-8&&Math.max(...d)>1e-8?[clip(poly,axis,bound,false),clip(poly,axis,bound,true)].filter(p=>p.length>=3):[poly];
  });
  for(const poly of polygons){
   const h=(poly.reduce((n,v)=>n+v.world.y,0)/poly.length-minY)/height,x=Math.abs(poly.reduce((n,v)=>n+v.world.x,0)/poly.length);
   if(h<.06)continue;
   const part=h<.18?'Socks':h>.36&&h<.555?'Shorts':female&&h>=.555&&h<.825&&x<.39?'Shirt':'Body';
   if(!parts.has(part))parts.set(part,[]);
   for(let n=1;n<poly.length-1;n++)parts.get(part).push(poly[0],poly[n],poly[n+1]);
  }
 }
 return [...parts].map(([name,verts])=>{
  const prim=doc.createPrimitive().setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(verts,(_,i)=>i)).setBuffer(buffer));
  for(const s of semantics){
   const original=primitive.getAttribute(s),array=s==='JOINTS_0'?new Uint16Array(verts.length*4):new Float32Array(verts.length*original.getElementSize());
   verts.forEach((v,i)=>{
    const data=s==='NORMAL'?new THREE.Vector3().fromArray(v.attributes[s]).normalize().toArray():v.attributes[s];array.set(data,i*original.getElementSize());
   });
   prim.setAttribute(s,doc.createAccessor().setType(original.getType()).setArray(array).setBuffer(buffer));
  }
  return {name,primitive:prim};
 });
}
