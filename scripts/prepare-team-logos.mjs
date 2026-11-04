import { readFile, mkdir, copyFile } from 'node:fs/promises';
import sharp from 'sharp';

const files=JSON.parse(await readFile('artifacts/team-logos/source-files.json','utf8'));
await mkdir('artifacts/team-logos/originals',{recursive:true});
await mkdir('src/assets/teams',{recursive:true});
const previews=[];
for(const [i,{id,source}] of files.entries()){
  const original=`artifacts/team-logos/originals/${id}.png`;
  await copyFile(source,original);
  const meta=await sharp(original).metadata();
  if(!meta.hasAlpha)throw new Error(`${id}: missing transparency`);
  await sharp(original).resize(384,384,{fit:'contain',background:'#00000000'}).webp({quality:88,alphaQuality:100}).toFile(`src/assets/teams/${id}.webp`);
  const preview=await sharp(original).resize(220,220,{fit:'contain',background:'#00000000'}).png().toBuffer();
  previews.push({input:preview,left:(i%4)*250+15,top:Math.floor(i/4)*250+15});
}
await sharp({create:{width:1000,height:750,channels:4,background:'#e6ecf3'}}).composite(previews).png().toFile('artifacts/team-logos/preview.png');
console.log(`Prepared ${files.length} transparent crests; originals, WebP assets and preview saved.`);
