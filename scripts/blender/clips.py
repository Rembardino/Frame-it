"""
Sport gestures keyed by hand in Blender on the game's own athlete rig, for the moves no supplied clip covers.

  blender --background --factory-startup --python scripts/blender/clips.py -- <athlete.glb> <out.json> [previewDir]

Each clip is a list of key poses in plain joint angles (degrees). Blender interpolates them with Bezier curves,
finds the hip height that keeps the lowest foot on the floor (or follows the jump), and the script samples the
result in the game's clip format: per bone, the rotation relative to its parent in rest-pose axes, plus the hip
height. scripts/prepare-blender-clips.mjs appends the output to src/assets/characters/animations.*.
"""
import json
import math
import os
import sys
import bpy
from mathutils import Quaternion, Vector

args = sys.argv[sys.argv.index('--') + 1:]
source, out, preview_dir = args[0], args[1], (args + [None])[2]
RATE = 48  # samples per second of gesture
# Character axes: x = its left, y = up, z = forward. In Blender the imported rig looks towards -Y, z up.
AXIS = {'x': Vector((1, 0, 0)), 'y': Vector((0, 0, 1)), 'z': Vector((0, -1, 0))}
BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
         'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']


def turn(*steps):
    """Rotations applied one after the other, each around a character axis: ('x', 20), ('y', -10)..."""
    q = Quaternion()
    for axis, degrees in steps:
        q = Quaternion(AXIS[axis], math.radians(degrees)) @ q
    return q


def pose(lean=0, twist=0, side=0, head=0, look=0, hips=0, thigh=(0, 0), knee=(0, 0), foot=(0, 0), spread=(3, 3),
         arm_l=(0, 8), elbow_l=10, wrist_l=0, arm_r=(0, 8), elbow_r=10, wrist_r=0):
    """
    One key pose. lean = trunk forwards, twist = trunk to its left, side = trunk tilted to its left, head = nod down, look = head to its left.
    thigh = knee raised forwards, knee = bend, foot = toes down (added to the angle that keeps the sole flat), spread = leg out to the side.
    arm = (raised forwards from hanging, away from the body), elbow = bend, wrist = bent palm-wards. Pairs are (left, right).
    """
    p = {'Hips': turn(('x', hips))}
    for bone in ('Spine', 'Spine1', 'Spine2'):
        p[bone] = turn(('x', lean / 3), ('y', twist / 3), ('z', -side / 3))
    for bone in ('Neck', 'Head'):
        p[bone] = turn(('x', head / 2), ('y', look / 2))
    for i, name in enumerate(('Left', 'Right')):
        s = 1 if i == 0 else -1
        p[name + 'UpLeg'] = turn(('z', s * spread[i]), ('x', -thigh[i] - hips))
        p[name + 'Leg'] = turn(('x', knee[i]))
        p[name + 'Foot'] = turn(('x', thigh[i] - knee[i] + foot[i]))
    for name, s, (flex, away), elbow, wrist in (('Left', 1, arm_l, elbow_l, wrist_l), ('Right', -1, arm_r, elbow_r, wrist_r)):
        # The rig rests in a T: first the arm hangs down (palm towards the thigh), then it opens and swings forwards.
        p[name + 'Arm'] = turn(('z', -90 * s), ('z', away * s), ('x', -flex))
        p[name + 'ForeArm'] = turn(('y', -elbow * s))
        p[name + 'Hand'] = turn(('z', -wrist * s))
    return p


def jump(height, land=0.09):
    """Hip path of a jump that fills the gesture (metres): the same arc the game gives the ball-handling hands."""
    def path(u):
        ease = max(0.0, min(1.0, (u - 0.6) / 0.4))
        return height * math.sin(math.pi * u) - land * ease * ease * (3 - 2 * ease)
    return path


# name -> group the game asks for, nominal seconds, contact (fraction), hip path (None = feet on the floor), key poses (u, pose)
CLIPS = {
    # Jump shot: push off the toes, ball released at the top with the shooting arm straight and the wrist snapped, guide hand falling away, soft landing.
    'blender_basket_shoot': dict(group='basketShoot', seconds=0.6, contact=0.32, hip=jump(0.42), keys=[
        (0.00, pose(lean=6, head=-6, thigh=(14, 12), knee=(24, 22), arm_r=(95, 6), elbow_r=95, wrist_r=-40, arm_l=(85, 12), elbow_l=100)),
        (0.12, pose(lean=2, head=-10, thigh=(4, 4), knee=(6, 6), foot=(30, 30), arm_r=(120, 6), elbow_r=70, wrist_r=-35, arm_l=(105, 12), elbow_l=80)),
        (0.32, pose(lean=-4, head=-14, thigh=(0, 2), knee=(4, 6), foot=(42, 42), arm_r=(160, 4), elbow_r=12, wrist_r=10, arm_l=(140, 14), elbow_l=45)),
        (0.42, pose(lean=-4, head=-14, thigh=(6, 10), knee=(14, 22), foot=(38, 38), arm_r=(166, 4), elbow_r=5, wrist_r=75, arm_l=(128, 16), elbow_l=42)),
        (0.62, pose(lean=-2, head=-10, thigh=(8, 13), knee=(16, 26), foot=(30, 30), arm_r=(160, 4), elbow_r=6, wrist_r=70, arm_l=(98, 14), elbow_l=45)),
        (0.85, pose(lean=3, head=-4, thigh=(12, 12), knee=(20, 20), foot=(10, 10), arm_r=(110, 8), elbow_r=25, wrist_r=35, arm_l=(60, 12), elbow_l=40)),
        (1.00, pose(lean=8, head=0, thigh=(26, 24), knee=(44, 42), arm_r=(45, 10), elbow_r=35, wrist_r=5, arm_l=(30, 10), elbow_l=35)),
    ]),
    # Volleyball spike (the game strikes with the rig's left hand): arms swing up, bow-and-arrow with the back arched and the heels up,
    # whip through the ball, follow-through across the body, landing on both feet.
    'blender_volley_spike': dict(group='volleySpike', seconds=0.72, contact=0.32, hip=jump(0.98, 0.1), keys=[
        (0.00, pose(lean=16, head=-12, thigh=(30, 26), knee=(48, 44), arm_l=(-40, 10), elbow_l=15, arm_r=(-40, 10), elbow_r=15)),
        (0.13, pose(lean=2, head=-16, thigh=(4, 2), knee=(10, 8), foot=(36, 36), arm_l=(115, 14), elbow_l=30, arm_r=(120, 12), elbow_r=20)),
        (0.23, pose(lean=-13, twist=24, head=-14, thigh=(-6, -2), knee=(58, 46), foot=(30, 30), arm_l=(150, 34), elbow_l=105, wrist_l=-25, arm_r=(150, 10), elbow_r=12)),
        (0.32, pose(lean=4, twist=-8, head=-6, thigh=(6, 10), knee=(34, 30), foot=(28, 28), arm_l=(166, 8), elbow_l=4, wrist_l=5, arm_r=(70, 14), elbow_r=30)),
        (0.44, pose(lean=16, twist=-26, head=2, thigh=(16, 18), knee=(26, 24), foot=(20, 20), arm_l=(64, -6), elbow_l=18, wrist_l=45, arm_r=(15, 14), elbow_r=40)),
        (0.70, pose(lean=9, twist=-8, head=0, thigh=(12, 12), knee=(18, 18), foot=(6, 6), arm_l=(28, 8), elbow_l=28, arm_r=(18, 10), elbow_r=30)),
        (1.00, pose(lean=12, head=2, thigh=(30, 28), knee=(50, 48), arm_l=(24, 10), elbow_l=34, arm_r=(22, 10), elbow_r=34)),
    ]),
}

# ---------------------------------------------------------------- the rig
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=source)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
scene = bpy.context.scene
scene.render.fps = RATE
names = [n for n in BONES if n in rig.data.bones]
rest = {n: rig.data.bones[n].matrix_local.to_quaternion() for n in names}  # armature space = world space (the object is not transformed)
feet = [rig.data.bones[n] for n in ('LeftFoot', 'LeftToeBase', 'LeftToe_End', 'RightFoot', 'RightToeBase', 'RightToe_End') if n in rig.data.bones]
height = max((rig.matrix_world @ rig.data.bones['HeadTop_End'].head_local).z, 1.0) * 1.03
hip_rest = rig.data.bones['Hips'].head_local.z
METRE = height / 1.92  # the game scales every athlete to 1.92 m
for name in names:
    rig.pose.bones[name].rotation_mode = 'QUATERNION'


def lowest():
    return min((rig.matrix_world @ rig.pose.bones[b.name].head).z for b in feet)


floor = lowest()
result = []
for clip_name, clip in CLIPS.items():
    frames = max(2, round(clip['seconds'] * RATE) + 1)
    action = bpy.data.actions.new(clip_name)
    rig.animation_data_create()
    rig.animation_data.action = action
    hips = rig.pose.bones['Hips']
    previous = {}
    # 1. Key poses. World rotation of a bone = (its parents' turns) x (its own turn) x rest; Blender wants it relative to the posed parent.
    for u, key in clip['keys']:
        frame = 1 + u * (frames - 1)
        world = {}
        for name in names:
            bone = rig.data.bones[name]
            parent = bone.parent.name if bone.parent else None
            world[name] = (world[parent] if parent in world else Quaternion()) @ key.get(name, Quaternion())
            posed_parent = (world[parent] @ rest[parent]) if parent in world else Quaternion()
            rest_parent = rest[parent] if parent in world else Quaternion()
            local_rest = rest_parent.inverted() @ rest[name]
            basis = local_rest.inverted() @ posed_parent.inverted() @ world[name] @ rest[name]
            if name in previous and previous[name].dot(basis) < 0:
                basis.negate()
            previous[name] = basis
            rig.pose.bones[name].rotation_quaternion = basis
            rig.pose.bones[name].keyframe_insert('rotation_quaternion', frame=frame)
    # 2. Hip height, frame by frame: on the floor, or along the jump when that is higher.
    hips.location = (0, 0, 0)
    heights = []
    for f in range(frames):
        scene.frame_set(1 + f)
        hips.location = (0, 0, 0)
        bpy.context.view_layer.update()
        grounded = floor - lowest()
        u = f / (frames - 1)
        lift = max(grounded, clip['hip'](u) * METRE) if clip['hip'] else grounded
        heights.append(lift)
    for f, lift in enumerate(heights):
        hips.location = rest['Hips'].inverted() @ Vector((0, 0, lift))
        hips.keyframe_insert('location', frame=1 + f)
    # 3. Sample in the game's format.
    quats, hip_track = [], []
    for f in range(frames):
        scene.frame_set(1 + f)
        bpy.context.view_layer.update()
        world = {}
        for name in names:
            bone = rig.data.bones[name]
            world[name] = rig.pose.bones[name].matrix.to_quaternion() @ rest[name].inverted()
            parent = bone.parent.name if bone.parent else None
            q = (world[parent].inverted() @ world[name]) if parent in world else world[name]
            q.normalize()
            if q.w < 0:
                q.negate()
            # Blender axes -> character axes (x, y up, z forward).
            quats += [round(q.x, 5), round(q.z, 5), round(-q.y, 5), round(q.w, 5)]
        hip_track.append(round(heights[f] / hip_rest, 5))
    result.append(dict(id=clip_name, group=clip['group'], duration=clip['seconds'], contact=clip['contact'] * clip['seconds'], frames=frames, bones=names, quats=quats, hip=hip_track))
    print('clip', clip_name, frames, 'frames, hip', round(min(heights), 3), '..', round(max(heights), 3))
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 12
        scene.render.resolution_x, scene.render.resolution_y = 300, 420
        if scene.world is None:
            scene.world = bpy.data.worlds.new('w')
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.8, 0.9, 1)
        if 'preview-cam' not in bpy.data.objects:
            cam = bpy.data.objects.new('preview-cam', bpy.data.cameras.new('preview-cam'))
            scene.collection.objects.link(cam)
            sun = bpy.data.objects.new('preview-sun', bpy.data.lights.new('preview-sun', 'SUN'))
            sun.data.energy = 2.5
            sun.rotation_euler = (math.radians(55), 0, math.radians(-40))
            scene.collection.objects.link(sun)
            ground = bpy.data.meshes.new('preview-ground')
            ground.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
            scene.collection.objects.link(bpy.data.objects.new('preview-ground', ground))
        cam = bpy.data.objects['preview-cam']
        scene.camera = cam
        direction = Vector((0.85, -0.6, 0.12)).normalized()  # from its front-left
        cam.location = Vector((0, 0, height * 0.62)) + direction * height * 3.1
        cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
        for i in range(8):
            scene.frame_set(1 + round(i / 7 * (frames - 1)))
            scene.render.filepath = f'{preview_dir}/{clip_name}-{i}.png'
            bpy.ops.render.render(write_still=True)

with open(out, 'w') as handle:
    json.dump(dict(rate=RATE, clips=result), handle)
print('written', out)
