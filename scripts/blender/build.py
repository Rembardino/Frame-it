"""
Builds a pack of scenery props and writes it as one .glb.

  blender --background --factory-startup --python scripts/blender/build.py -- <arena|country> <out.glb> [previewDir]

Called by scripts/prepare-props.mjs, which then quantizes the result into src/assets/props/.
"""
import os
import sys
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

pack, out = sys.argv[sys.argv.index('--') + 1:][:2]
preview_dir = (sys.argv[sys.argv.index('--') + 1:] + [None, None, None])[2]

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
objects = __import__(pack).build()
kit.bake(objects)
kit.export(objects, out)
if preview_dir:
    os.makedirs(preview_dir, exist_ok=True)
    kit.preview(objects, preview_dir)
