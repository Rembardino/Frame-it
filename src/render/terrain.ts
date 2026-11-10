import * as THREE from 'three';

/** Subdivide long ground triangles before lifting them onto the same relief as the road. */
export function liftTerrain(geometry: THREE.BufferGeometry, height: (x: number, z: number) => number, offset = 0) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = source.getAttribute('position'), uv = source.getAttribute('uv');
  const positions: number[] = [], tex: number[] = [];
  type Vertex = [number, number, number, number];
  const middle = (a: Vertex, b: Vertex): Vertex => a.map((v, i) => (v + b[i]) / 2) as Vertex;
  const emit = (a: Vertex, b: Vertex, c: Vertex, depth: number) => {
    const edge = (a: Vertex, b: Vertex) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    if (depth < 7 && Math.max(edge(a, b), edge(b, c), edge(c, a)) > 100) {
      const ab = middle(a, b), bc = middle(b, c), ca = middle(c, a);
      emit(a, ab, ca, depth + 1); emit(ab, b, bc, depth + 1); emit(ca, bc, c, depth + 1); emit(ab, bc, ca, depth + 1);
    } else for (const v of [a, b, c]) { positions.push(v[0], height(v[0], v[1]) + offset, v[1]); tex.push(v[2], v[3]); }
  };
  const vertex = (i: number): Vertex => [p.getX(i), p.getZ(i), uv?.getX(i) ?? 0, uv?.getY(i) ?? 0];
  for (let i = 0; i < p.count; i += 3) emit(vertex(i), vertex(i + 1), vertex(i + 2), 0);
  const lifted = new THREE.BufferGeometry();
  lifted.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  lifted.setAttribute('uv', new THREE.Float32BufferAttribute(tex, 2)); lifted.computeVertexNormals();
  if (source !== geometry) source.dispose(); geometry.dispose();
  return lifted;
}
