"""
Shared modelling kit for the Frame It scenery props (run inside Blender, headless).

Everything is authored in GAME coordinates (metres, x right, y up, z towards the camera) and converted to
Blender's z-up space here. A prop is one mesh whose faces carry a flat colour; ambient occlusion is baked
with Cycles into the vertex colours, so the game needs no textures and no extra lights for the props.
Faces are grouped by material name (paint, wall, roof, glass, glow...): the game recolours or replaces
those materials (see src/render/props.ts).
"""
import math
import bpy
import bmesh
from mathutils import Matrix, Vector

R = Matrix.Rotation(math.pi / 2, 4, 'X')  # game (x, y, z) -> blender (x, -z, y)
RI = R.inverted()
UP = Vector((0, 1, 0))


def lin(c):
    """0xRRGGBB (sRGB) -> linear RGBA, the space of glTF vertex colours."""
    out = []
    for shift in (16, 8, 0):
        v = ((c >> shift) & 255) / 255
        out.append(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def T(x, y, z):
    return Matrix.Translation(Vector((x, y, z)))


def S(x, y, z):
    return Matrix.Diagonal(Vector((x, y, z, 1)))


def RY(a):
    return Matrix.Rotation(a, 4, 'Y')


def RX(a):
    return Matrix.Rotation(a, 4, 'X')


def RZ(a):
    return Matrix.Rotation(a, 4, 'Z')


class Prop:
    def __init__(self, name, ao=0.38, ground=True, ao_distance=1.6):
        self.name, self.ao, self.ground, self.ao_distance = name, ao, ground, ao_distance
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.groups = []
        self.origin = Matrix.Identity(4)  # extra game-space transform applied to every new part

    # ------------------------------------------------------------------ internals
    def _slot(self, group):
        if group not in self.groups:
            self.groups.append(group)
        return self.groups.index(group)

    def _commit(self, tmp, color, group, smooth=True, shade=None):
        """Paint a temporary bmesh and append it to the prop. shade(y) -> multiplier, for cheap gradients."""
        col = tmp.loops.layers.float_color.get('Col') or tmp.loops.layers.float_color.new('Col')
        c = lin(color) if isinstance(color, int) else color
        slot = self._slot(group)
        for f in tmp.faces:
            f.material_index = slot
            f.smooth = smooth
            for l in f.loops:
                k = shade(l.vert.co.z) if shade else 1.0
                l[col] = (c[0] * k, c[1] * k, c[2] * k, 1.0)
        mesh = bpy.data.meshes.new('tmp')
        tmp.to_mesh(mesh)
        tmp.free()
        self.bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)

    def _m(self, game_matrix):
        """For primitives made in Blender's local space."""
        return R @ self.origin @ game_matrix @ RI

    def _g(self, game_matrix=None):
        """For points given in game coordinates."""
        return R @ self.origin @ (game_matrix or Matrix.Identity(4))

    # ------------------------------------------------------------------ primitives (game coordinates)
    def box(self, c, s, color, group='paint', rot=None, bevel=0.0, seg=2, cell=0.0, smooth=True):
        """Box centred on c with size s. cell > 0 subdivides the faces (finer baked occlusion)."""
        tmp = bmesh.new()
        m = T(*c) @ (rot or Matrix.Identity(4))
        if cell > 0:
            sx, sy, sz = s
            def face(mat, w, h):
                # create_grid lies in blender XY = game XZ facing +y; RX turns it into the game XY plane facing +z.
                bmesh.ops.create_grid(tmp, x_segments=max(1, round(w / cell)), y_segments=max(1, round(h / cell)), size=0.5,
                                      matrix=self._m(m @ mat @ RX(math.pi / 2) @ S(w, 1, h)))
            face(T(0, 0, sz / 2), sx, sy)
            face(T(0, 0, -sz / 2) @ RY(math.pi), sx, sy)
            face(T(sx / 2, 0, 0) @ RY(math.pi / 2), sz, sy)
            face(T(-sx / 2, 0, 0) @ RY(-math.pi / 2), sz, sy)
            face(T(0, sy / 2, 0) @ RX(-math.pi / 2), sx, sz)
            face(T(0, -sy / 2, 0) @ RX(math.pi / 2), sx, sz)
            bmesh.ops.remove_doubles(tmp, verts=tmp.verts, dist=1e-4)
        else:
            bmesh.ops.create_cube(tmp, size=1, matrix=self._m(m @ S(*s)))
            if bevel > 0:
                bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=seg, affect='EDGES', profile=0.5)
        self._commit(tmp, color, group, smooth)

    def cyl(self, a, b, r, color, group='paint', n=12, r2=None, caps=True, smooth=True):
        """Cylinder (or cone, r2) from point a to point b."""
        a, b = Vector(a), Vector(b)
        d = b - a
        tmp = bmesh.new()
        q = UP.rotation_difference(d.normalized()).to_matrix().to_4x4()
        # Blender cones run along blender Z = game Y.
        bmesh.ops.create_cone(tmp, cap_ends=caps, cap_tris=False, segments=n, radius1=r, radius2=r if r2 is None else r2,
                              depth=d.length, matrix=self._m(T(*((a + b) / 2)) @ q))
        self._commit(tmp, color, group, smooth)

    def sphere(self, c, r, color, group='paint', u=12, v=8, rot=None, shade=None):
        r = (r, r, r) if isinstance(r, (int, float)) else r
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=u, v_segments=v, radius=1, matrix=self._m(T(*c) @ (rot or Matrix.Identity(4)) @ S(*r)))
        self._commit(tmp, color, group, shade=shade)

    def blob(self, c, r, color, group='paint', sub=2, noise=0.18, seed=0, shade=None):
        """Lumpy icosphere: tree crowns, bushes, hay."""
        r = (r, r, r) if isinstance(r, (int, float)) else r
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=sub, radius=1, matrix=Matrix.Identity(4))
        for vert in tmp.verts:
            p = vert.co
            k = 1 + noise * (math.sin(p.x * 3.1 + seed) * math.cos(p.y * 2.7 + seed * 1.3) + 0.5 * math.sin(p.z * 5.3 + seed * 2.1))
            vert.co = p * k
        bmesh.ops.transform(tmp, matrix=self._m(T(*c) @ S(*r)), verts=tmp.verts)
        self._commit(tmp, color, group, shade=shade)

    def tube(self, points, r, color, group='paint', n=6, closed=False, smooth=True):
        """Round bar through a list of points (ropes, rims, rails)."""
        pts = [Vector(p) for p in points]
        count = len(pts)
        tmp = bmesh.new()
        rings = []
        for i, p in enumerate(pts):
            prev = pts[(i - 1) % count] if (closed or i > 0) else p
            nxt = pts[(i + 1) % count] if (closed or i < count - 1) else p
            tangent = (nxt - prev).normalized()
            side = tangent.cross(UP)
            if side.length < 1e-4:
                side = tangent.cross(Vector((1, 0, 0)))
            side.normalize()
            up = side.cross(tangent).normalized()
            m = self._g()
            rings.append([tmp.verts.new(m @ (p + (side * math.cos(k / n * math.tau) + up * math.sin(k / n * math.tau)) * r)) for k in range(n)])
        for i in range(count if closed else count - 1):
            a, b = rings[i], rings[(i + 1) % count]
            for k in range(n):
                tmp.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
        if not closed:
            tmp.faces.new(list(reversed(rings[0])))
            tmp.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        self._commit(tmp, color, group, smooth)

    def poly(self, points, color, group='paint', smooth=False):
        """One flat face through the given points (counter-clockwise seen from outside)."""
        tmp = bmesh.new()
        m = self._g()
        tmp.faces.new([tmp.verts.new(m @ Vector(p)) for p in points])
        self._commit(tmp, color, group, smooth)

    def prism(self, profile, z0, z1, color, group='paint', axis='z', smooth=False):
        """Extrude a 2D profile [(a, b)...] along an axis: axis z -> points (a, b, z); axis x -> points (x, b, a)."""
        tmp = bmesh.new()
        m = self._g()
        def at(a, b, t):
            return m @ (Vector((a, b, t)) if axis == 'z' else Vector((t, b, a)))
        front = [tmp.verts.new(at(a, b, z1)) for a, b in profile]
        back = [tmp.verts.new(at(a, b, z0)) for a, b in profile]
        n = len(profile)
        tmp.faces.new(front)
        tmp.faces.new(list(reversed(back)))
        for i in range(n):
            tmp.faces.new((front[i], back[i], back[(i + 1) % n], front[(i + 1) % n]))
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        self._commit(tmp, color, group, smooth)

    def lathe(self, profile, color, group='paint', n=12, c=(0, 0, 0), shade=None, star=0.0, turn=0.0):
        """Revolve [(radius, height)...] around the vertical axis through c. star pulls every other meridian inwards (fir tiers)."""
        tmp = bmesh.new()
        m = self._g(T(*c))
        rings = [[tmp.verts.new(m @ Vector((math.cos(k / n * math.tau + turn) * r * (1 - star * (k % 2)), h, math.sin(k / n * math.tau + turn) * r * (1 - star * (k % 2))))) for k in range(n)] for r, h in profile]
        for a, b in zip(rings, rings[1:]):
            for k in range(n):
                tmp.faces.new((a[k], b[k], b[(k + 1) % n], a[(k + 1) % n]))
        bmesh.ops.remove_doubles(tmp, verts=tmp.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        self._commit(tmp, color, group, shade=shade)

    # ------------------------------------------------------------------ output
    def build(self):
        """-> Blender object with sharp edges marked and a material slot per group."""
        bm = self.bm
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        soft = {i for i, g in enumerate(self.groups) if g in ('leaf', 'net', 'truss')}  # crowns, cords, thin bars: no hard edges
        for e in bm.edges:
            if e.link_faces and all(f.material_index in soft for f in e.link_faces):
                e.smooth = True
                continue
            if len(e.link_faces) == 2:
                flat = e.calc_face_angle(0.0) > math.radians(38)
                e.smooth = not flat and all(f.smooth for f in e.link_faces) and e.link_faces[0].material_index == e.link_faces[1].material_index
            for f in e.link_faces:
                if not f.smooth:
                    e.smooth = False
        for f in bm.faces:
            f.smooth = True
        mesh = bpy.data.meshes.new(self.name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for group in self.groups:
            mesh.materials.append(material(group))
        obj['ao'], obj['ground'], obj['ao_distance'] = self.ao, self.ground, self.ao_distance
        return obj


def material(group):
    mat = bpy.data.materials.get(group)
    if mat:
        return mat
    mat = bpy.data.materials.new(group)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8
    if group == 'glass':
        bsdf.inputs['Alpha'].default_value = 0.3
        bsdf.inputs['Roughness'].default_value = 0.1
    return mat


def bake(objects, samples=48):
    """Cycles ambient occlusion into the vertex colours: final colour = flat colour x (floor + occlusion)."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    ground_mesh = bpy.data.meshes.new('ground')
    gb = bmesh.new()
    bmesh.ops.create_grid(gb, x_segments=1, y_segments=1, size=200)
    gb.to_mesh(ground_mesh)
    gb.free()
    ground = bpy.data.objects.new('ground', ground_mesh)
    scene.collection.objects.link(ground)
    for o in objects:
        o.hide_render = True
    for o in objects:
        mesh = o.data
        ao = mesh.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER')
        mesh.color_attributes.active_color = ao
        o.hide_render = False
        ground.hide_render = not o['ground']
        ground.location.z = o.get('floor', 0.0)
        if scene.world is None:
            scene.world = bpy.data.worlds.new('w')
        scene.world.light_settings.distance = o['ao_distance']
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        col = mesh.color_attributes['Col']
        ao = mesh.color_attributes['AO']
        floor = o['ao']
        skip = {i for i, m in enumerate(mesh.materials) if m.name in ('glass', 'glow', 'net', 'water', 'line')}
        tint = [tuple(col.data[li].color[:3]) for li in range(len(mesh.loops))]  # flat colours before shading
        for poly in mesh.polygons:
            if poly.material_index in skip:
                continue
            for li in poly.loop_indices:
                k = floor + (1 - floor) * min(1.0, ao.data[li].color[0] ** 0.8 * 1.08)
                c = col.data[li].color
                col.data[li].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
        # Corners that share a vertex, a normal and a flat colour get the same shade, so the exporter can weld them.
        normals = mesh.corner_normals
        base = {}
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                n = normals[li].vector
                base.setdefault((mesh.loops[li].vertex_index, poly.material_index, round(n.x, 2), round(n.y, 2), round(n.z, 2)), []).append(li)
        for loops in base.values():
            if len(loops) < 2:
                continue
            flat = {}
            for li in loops:
                flat.setdefault(tuple(round(v, 4) for v in tint[li]), []).append(li)
            for same in flat.values():
                mean = [sum(col.data[li].color[k] for li in same) / len(same) for k in range(3)]
                for li in same:
                    col.data[li].color = (*mean, 1.0)
        mesh.color_attributes.remove(mesh.color_attributes['AO'])
        mesh.color_attributes.active_color = mesh.color_attributes['Col']
        mesh.color_attributes.render_color_index = 0
        o.hide_render = True
        print('baked', o.name, len(mesh.polygons), 'faces')
    for o in objects:
        o.hide_render = False
    bpy.data.objects.remove(ground)


def export(objects, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    options = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_animations=False,
                   export_texcoords=False, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False)
    if 'export_vertex_color' in props:
        options.update(export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    if 'export_active_vertex_color_when_no_material' in props:
        options['export_active_vertex_color_when_no_material'] = True
    bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in props or k == 'filepath'})
    print('exported', path, sum(len(o.data.polygons) for o in objects), 'faces')


def preview(objects, path, columns=4, size=360):
    """Contact sheet of the props (Cycles, a sun and a sky), to judge them before they reach the game."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.film_transparent = False
    world = scene.world or bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.68, 0.85, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    for o in objects:
        o.hide_render = True
    files = []
    for o in objects:
        o.hide_render = False
        corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
        hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
        centre, radius = (lo + hi) / 2, (hi - lo).length / 2
        direction = Vector((0.75, -1.0, 0.55)).normalized()
        cam.location = centre + direction * radius * 2.6
        cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
        cam.data.lens = 50
        cam.data.clip_end = 2000
        scene.render.filepath = f'{path}/{o.name}.png'
        bpy.ops.render.render(write_still=True)
        files.append(scene.render.filepath)
        o.hide_render = True
    for o in objects:
        o.hide_render = False
    bpy.data.objects.remove(sun)
    bpy.data.objects.remove(cam)
    return files
