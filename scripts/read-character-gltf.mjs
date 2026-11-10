import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function readCharacterGLTF(file) {
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(file);
  for(const material of doc.getRoot().listMaterials()) {
    material.setBaseColorTexture(null).setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null);
  }
  const bytes=Buffer.from(await io.writeBinary(doc));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  return gltf;
}
