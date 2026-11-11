"""
Countryside props for the cycling stages (and the trees of every outdoor world).

Houses are modular: a ground floor (2.5 m), any number of upper storeys (2.8 m each) and a roof (starts with the
last 0.5 m of wall, shaded by the eaves). The game stacks them, stretches them to each footprint and tints the
groups: wall, roof, shutter (see src/render/cycling.ts). Footprint of every module: 9.5 x 8 m, facade along x.
"""
import math
from mathutils import Matrix, Vector
from kit import Prop, T, RX, RY, RZ, lin

W, D = 9.5, 8.0
WHITE, FRAME, SILL, WOOD = 0xffffff, 0xece5d3, 0xd8d0bc, 0x4a3426
FLOWERS = (0xd8344a, 0xf2a0b8, 0xf4f0e0, 0xe8b83a)


def grey(k):
    return (k, k, k, 1.0)


def faces(p, w, d, y0):
    """Puts the prop's origin on each wall in turn: local x along the wall, y up, +z out of the wall."""
    for yaw, dist, span in ((0, d / 2, w), (math.pi, d / 2, w), (math.pi / 2, w / 2, d), (-math.pi / 2, w / 2, d)):
        p.origin = T(0, y0, 0) @ RY(yaw) @ T(0, 0, dist)
        yield span, yaw in (0, math.pi)
    p.origin = T(0, y0, 0)


def window(p, x, y, w=1.0, h=1.3, shutters=True, glass=0x34404a, flowers=-1, sill=True):
    p.box((x, y, 0.02), (w + 0.16, h + 0.16, 0.06), FRAME)
    p.box((x, y, 0.045), (w, h, 0.03), glass)
    if sill:
        p.box((x, y - h / 2 - 0.1, 0.09), (w + 0.3, 0.07, 0.2), SILL)
    if shutters:
        for e in (-1, 1):
            p.box((x + e * (w / 2 + 0.28), y, 0.035), (0.46, h + 0.08, 0.05), WHITE, 'shutter')
    if flowers >= 0:
        p.box((x, y - h / 2 - 0.02, 0.2), (w * 0.9, 0.15, 0.17), 0xb5653a)
        p.box((x, y - h / 2 + 0.07, 0.2), (w * 0.86, 0.1, 0.2), 0x4f8a3a)
        for i in range(3):
            p.blob((x + (i - 1) * w * 0.3, y - h / 2 + 0.13, 0.22), 0.1, FLOWERS[(flowers + i) % len(FLOWERS)], sub=1, noise=0.0)


def door(p, x, w=1.1, h=2.15, color=WOOD):
    p.box((x, h / 2 + 0.05, 0.03), (w + 0.26, h + 0.22, 0.08), SILL)
    p.box((x, h / 2, 0.06), (w, h, 0.05), color)
    p.box((x + w * 0.32, h * 0.48, 0.095), (0.05, 0.05, 0.03), 0xc9a44a)
    p.box((x, 0.08, 0.3), (w + 0.6, 0.16, 0.55), 0xb5ad9c)


def balcony(p, x, y, w=2.4, depth=0.9, rail=0x2c2c30, slab=0xcfc8b6):
    p.box((x, y + 0.05, depth / 2), (w, 0.1, depth), slab)
    for e in (-1, 1):
        p.box((x + e * (w / 2 - 0.02), y + 0.55, depth / 2), (0.035, 0.9, depth), rail)
    p.box((x, y + 1.0, depth - 0.02), (w, 0.05, 0.05), rail)
    p.box((x, y + 0.2, depth - 0.02), (w, 0.04, 0.04), rail)
    n = max(4, round(w / 0.3))
    for i in range(1, n):
        p.box((x - w / 2 + w * i / n, y + 0.6, depth - 0.02), (0.03, 0.8, 0.03), rail)


def gable_roof(p, w, d, y, pitch, eave, gable, along_x=True, rows=6, thick=0.09, tones=(0.86, 1.0)):
    """Rows of overlapping tiles on both slopes, a ridge cap. along_x: ridge parallel to the facade. -> rise."""
    half = (d if along_x else w) / 2 + eave
    length = (w if along_x else d) + 2 * gable
    rise = (d if along_x else w) / 2 * math.tan(pitch)
    for s in (-1, 1):
        for i in range(rows):
            c = half * (i + 0.5) / rows
            tone = tones[0] + (tones[1] - tones[0]) * ((i * 7 + (3 if s > 0 else 0)) % 5) / 4
            size_slope = half / rows / math.cos(pitch) + 0.09
            height = y + rise - c * math.tan(pitch) + 0.05
            if along_x:
                p.box((0, height, s * c), (length, thick, size_slope), grey(tone), 'roof', rot=RX(s * (pitch - 0.06)))
            else:
                p.box((s * c, height, 0), (size_slope, thick, length), grey(tone), 'roof', rot=RZ(-s * (pitch - 0.06)))
    cap = y + rise + 0.07
    if along_x:
        p.cyl((-length / 2 - 0.03, cap, 0), (length / 2 + 0.03, cap, 0), 0.14, grey(0.78), 'roof', n=8)
    else:
        p.cyl((0, cap, -length / 2 - 0.03), (0, cap, length / 2 + 0.03), 0.14, grey(0.78), 'roof', n=8)
    return rise


def chimney(p, x, y, z, h=1.5, color=0x9a7a66):
    p.box((x, y + h / 2, z), (0.62, h, 0.62), color)
    p.box((x, y + h + 0.05, z), (0.8, 0.1, 0.8), 0x7d6252)
    p.cyl((x, y + h + 0.1, z), (x, y + h + 0.42, z), 0.16, 0x8a5a44, n=8)


# ---------------------------------------------------------------- hill village (plaster, shutters, tiled roofs)

def village_ground(p, w=W, d=D, y0=0.0):
    p.origin = T(0, y0, 0)
    p.box((0, -0.8, 0), (w + 0.16, 2.6, d + 0.16), 0xa79c86)
    p.box((0, 1.25, 0), (w, 2.5, d), WHITE, 'wall', cell=1.25)
    for span, front in faces(p, w, d, y0):
        if front:
            door(p, 0)
            for e in (-1, 1):
                window(p, e * span / 3, 1.6, h=1.2)
        else:
            window(p, 0, 1.6, w=0.9, h=1.1)


def village_upper(p, w=W, d=D, y0=0.0, with_balcony=False, seed=0):
    p.origin = T(0, y0, 0)
    p.box((0, 1.4, 0), (w, 2.8, d), WHITE, 'wall', cell=1.4)
    k = 0
    for span, front in faces(p, w, d, y0):
        if front:
            for e in (-1, 0, 1):
                k += 1
                if e == 0 and with_balcony:
                    window(p, 0, 1.25, w=1.1, h=2.1, sill=False)
                    balcony(p, 0, 0.1)
                else:
                    window(p, e * span / 3, 1.45, flowers=(seed + k) if (seed + k) % 3 != 1 else -1)
        else:
            window(p, 0, 1.45, w=0.9)


def village_roof(p, w=W, d=D, y0=0.0):
    p.origin = T(0, y0, 0)
    p.box((0, 0.25, 0), (w, 0.5, d), WHITE, 'wall', cell=0.5)
    p.box((0, 0.5, 0), (w + 0.26, 0.1, d + 0.26), SILL)
    rise = gable_roof(p, w, d, 0.5, 0.47, 0.45, 0.35)
    p.prism([(-d / 2, 0.5), (d / 2, 0.5), (0, 0.5 + rise)], -w / 2, w / 2, WHITE, 'wall', axis='x')
    chimney(p, w * 0.26, 0.5 + rise * 0.55, d * 0.13)


# ---------------------------------------------------------------- alpine (stone ground floor, timber above, wide slate roof)

def alpine_ground(p, w=W, d=D, y0=0.0):
    p.origin = T(0, y0, 0)
    p.box((0, -0.8, 0), (w + 0.2, 2.6, d + 0.2), 0x666e69)
    p.box((0, 1.25, 0), (w, 2.5, d), 0xa9aaa2, cell=1.25)
    for span, front in faces(p, w, d, y0):
        if front:
            door(p, 0, color=0x5a3d26)
            for e in (-1, 1):
                window(p, e * span / 3, 1.6, w=0.85, h=0.95, shutters=False, glass=0x2e3a40)
        else:
            # Firewood stacked against the side wall.
            p.box((0.4, 0.6, 0.28), (span * 0.5, 1.2, 0.5), 0x8a6a46)
            for i in range(6):
                p.box((0.4, 0.1 + i * 0.2, 0.545), (span * 0.5, 0.03, 0.02), 0x5c452c)


def alpine_upper(p, w=W, d=D, y0=0.0, seed=0):
    p.origin = T(0, y0, 0)
    for i in range(8):
        grow = 0.04 * (i % 2)
        p.box((0, 0.175 + i * 0.35, 0), (w + grow, 0.35, d + grow), grey(0.9 + 0.1 * ((i * 3) % 4) / 3), 'wall')
    for e in (-1, 1):
        for f in (-1, 1):
            p.box((e * (w / 2 - 0.02), 1.4, f * (d / 2 - 0.02)), (0.24, 2.8, 0.24), grey(0.72), 'wall')
    for span, front in faces(p, w, d, y0):
        if front:
            for e in (-1, 0, 1):
                window(p, e * span / 3, 1.5, w=0.95, h=1.2)
            # Balcony across the whole front, with a row of geraniums.
            depth = 1.05
            p.box((0, 0.05, depth / 2), (span + 0.5, 0.1, depth), 0x6b4a30)
            for i in range(5):
                p.box((-span / 2 + span * i / 4, -0.1, depth / 2), (0.14, 0.22, depth), 0x4c3422)
            p.box((0, 0.55, depth - 0.03), (span + 0.5, 0.72, 0.04), 0x7a5536)
            p.box((0, 1.0, depth - 0.03), (span + 0.5, 0.08, 0.09), 0x5a3d26)
            p.box((0, 1.02, depth + 0.1), (span * 0.86, 0.15, 0.18), 0x4c3422)
            n = 9
            for i in range(n):
                p.blob((-span * 0.4 + span * 0.8 * i / (n - 1), 1.15, depth + 0.1), 0.12, FLOWERS[0] if (i + seed) % 4 else FLOWERS[1], sub=1, noise=0.0)
        else:
            window(p, 0, 1.5, w=0.9, h=1.1)


def alpine_roof(p, w=W, d=D, y0=0.0):
    p.origin = T(0, y0, 0)
    p.box((0, 0.25, 0), (w + 0.04, 0.5, d + 0.04), grey(0.92), 'wall')
    rise = gable_roof(p, w, d, 0.5, 0.4, 1.25, 1.15, along_x=False, rows=7, thick=0.12, tones=(0.8, 1.0))
    p.prism([(-w / 2, 0.5), (w / 2, 0.5), (0, 0.5 + rise)], -d / 2, d / 2, grey(0.86), 'wall', axis='z')
    for s in (-1, 1):
        # Purlins showing under the gable overhang, snow-guard stones on the slopes.
        for x in (-w / 2 - 0.9, 0, w / 2 + 0.9):
            y = 0.5 + rise - abs(x) * math.tan(0.4) - 0.14
            p.box((x, y, s * (d / 2 + 0.55)), (0.2, 0.22, 1.2), 0x4c3422)
        for i in range(3):
            x = s * (w / 2) * (0.35 + 0.22 * i)
            p.box((x, 0.5 + rise - abs(x) * math.tan(0.4) + 0.2, (i - 1) * d * 0.3), (0.45, 0.2, 0.35), 0x8f9492, rot=RY(0.4 * i))
    chimney(p, w * 0.18, 0.5 + rise * 0.5, -d * 0.2, h=1.7, color=0x8c8f8a)
    for s in (-1, 1):
        p.origin = T(0, y0, 0) @ RY(0 if s > 0 else math.pi) @ T(0, 0, d / 2)
        window(p, 0, 0.5 + rise * 0.42, w=0.8, h=0.8, sill=False)
    p.origin = T(0, y0, 0)


# ---------------------------------------------------------------- seaside (pastel plaster, balconies, flat roofs with terraces)

def coastal_ground(p, w=W, d=D, y0=0.0):
    p.origin = T(0, y0, 0)
    p.box((0, -0.8, 0), (w + 0.16, 2.6, d + 0.16), 0xb8b0a0)
    p.box((0, 1.25, 0), (w, 2.5, d), WHITE, 'wall', cell=1.25)
    p.box((0, 0.45, 0), (w + 0.06, 0.9, d + 0.06), grey(0.8), 'wall')
    for span, front in faces(p, w, d, y0):
        if front:
            door(p, 0, color=0x2f5f7a)
            for e in (-1, 1):
                window(p, e * span / 3, 1.55, w=1.5, h=1.3, shutters=False, glass=0x2b7393)
        else:
            window(p, 0, 1.6, w=0.9, h=1.0, shutters=False, glass=0x2b7393)


def coastal_upper(p, w=W, d=D, y0=0.0, seed=0):
    p.origin = T(0, y0, 0)
    p.box((0, 1.4, 0), (w, 2.8, d), WHITE, 'wall', cell=1.4)
    p.box((0, 0.04, 0), (w + 0.12, 0.08, d + 0.12), FRAME)
    for span, front in faces(p, w, d, y0):
        if front:
            for e in (-1, 1):
                window(p, e * span / 3, 1.45, glass=0x2b7393)
            window(p, 0, 1.25, w=1.2, h=2.1, shutters=False, glass=0x2b7393, sill=False)
            balcony(p, 0, 0.1, w=2.8, rail=0xf2f0ea, slab=0xe6e1d6)
        else:
            window(p, -span * 0.2, 1.45, w=0.9, glass=0x2b7393)
            # Air conditioner.
            p.box((span * 0.25, 0.9, 0.2), (0.8, 0.55, 0.36), 0xdcdcd6)
            p.cyl((span * 0.25, 0.9, 0.38), (span * 0.25, 0.9, 0.39), 0.2, 0x8a8f94, n=10)


def coastal_roof(p, w=W, d=D, y0=0.0):
    p.origin = T(0, y0, 0)
    p.box((0, 0.25, 0), (w, 0.5, d), WHITE, 'wall', cell=0.5)
    p.box((0, 0.56, 0), (w + 0.4, 0.14, d + 0.4), FRAME)
    p.box((0, 0.66, 0), (w - 0.3, 0.08, d - 0.3), grey(0.9), 'roof')
    for s in (-1, 1):
        p.box((0, 0.95, s * (d / 2 + 0.08)), (w + 0.36, 0.65, 0.16), WHITE, 'wall')
        p.box((s * (w / 2 + 0.08), 0.95, 0), (0.16, 0.65, d + 0.36), WHITE, 'wall')
    # Stair penthouse, water tank on legs, solar panel, aerial, a parasol-less terrace table.
    p.box((w * 0.2, 1.75, -d * 0.12), (w * 0.34, 2.1, d * 0.42), WHITE, 'wall', cell=1.0)
    p.box((w * 0.2, 2.84, -d * 0.12), (w * 0.34 + 0.3, 0.1, d * 0.42 + 0.3), FRAME)
    p.box((w * 0.2 - w * 0.17 - 0.03, 1.7, -d * 0.12), (0.05, 1.9, 0.9), 0x2f5f7a)
    p.cyl((-w * 0.28, 1.5, d * 0.2), (-w * 0.28, 2.7, d * 0.2), 0.62, 0xc9ced2, n=12)
    for a in range(3):
        ang = a / 3 * math.tau
        p.cyl((-w * 0.28 + math.cos(ang) * 0.5, 0.7, d * 0.2 + math.sin(ang) * 0.5), (-w * 0.28 + math.cos(ang) * 0.5, 1.5, d * 0.2 + math.sin(ang) * 0.5), 0.04, 0x8a8f94, n=5)
    p.box((-w * 0.05, 1.05, -d * 0.25), (1.8, 0.05, 1.1), 0x1f3a66, rot=RX(-0.45))
    p.cyl((w * 0.38, 0.7, d * 0.3), (w * 0.38, 3.4, d * 0.3), 0.025, 0x55595e, n=5)
    for i in range(3):
        p.box((w * 0.38, 3.0 + i * 0.16, d * 0.3), (0.7 - i * 0.16, 0.02, 0.02), 0x55595e)


# ---------------------------------------------------------------- composed buildings

def barn():
    """15 x 8 m timber barn on a stone base, doors on both long sides."""
    p = Prop('barn', ao=0.36, ao_distance=3.0)
    w, d, h = 15.0, 8.0, 3.4
    p.box((0, -0.8, 0), (w + 0.2, 2.2, d + 0.2), 0x7d7a70)
    n = 20
    for i in range(n):
        p.box((-w / 2 + w * (i + 0.5) / n, h / 2 + 0.1, 0), (w / n, h, d + 0.05 * (i % 2)), 0x9a6a4a if i % 3 else 0x8a5c3e)
    rise = gable_roof(p, w, d, h + 0.1, 0.5, 0.5, 0.5, rows=6, thick=0.1, tones=(0.82, 1.0))
    p.prism([(-d / 2, h + 0.1), (d / 2, h + 0.1), (0, h + 0.1 + rise)], -w / 2, w / 2, 0x8a5c3e, axis='x')
    for span, front in faces(p, w, d, 0):
        if front:
            p.box((0, 1.45, 0.05), (3.4, 2.9, 0.1), 0x6b4630)
            for e in (-1, 1):
                p.box((e * 0.85, 1.45, 0.11), (2.0, 0.12, 0.03), 0xd9cdb4, rot=RZ(e * 0.95))
            p.box((0, 2.95, 0.1), (3.7, 0.14, 0.12), 0xd9cdb4)
        else:
            p.box((0, h + 0.6, 0.04), (1.3, 1.1, 0.08), 0x2b2019)
    return p.build()


def stacked(name, ground, upper, roof, floors, w, d, **kw):
    p = Prop(name, ao=0.36, ao_distance=3.0)
    ground(p, w, d, 0)
    for i in range(floors):
        upper(p, w, d, 2.5 + 2.8 * i, **kw)
    roof(p, w, d, 2.5 + 2.8 * floors)
    return p.build()


def church():
    """Origin: middle of the facade's foot is at (0, 0, -5). Nave along z, facade towards -z (the square), bell tower beside it."""
    p = Prop('church', ao=0.34, ao_distance=4.0)
    STONE, TRIM = 0xeadfc8, 0xd3c6a8
    w, h, z0, z1 = 10.0, 9.0, -5.0, 15.0
    length, zc = z1 - z0, (z0 + z1) / 2
    p.box((0, -0.8, zc), (w + 0.5, 2.4, length + 0.5), 0xa79c86)
    p.box((0, h / 2, zc), (w, h, length), STONE, cell=1.8)
    p.origin = T(0, 0, zc)
    rise = gable_roof(p, w, length, h, 0.6, 0.5, 0.4, along_x=False, rows=7, thick=0.12)
    p.origin = Matrix.Identity(4)
    p.prism([(-w / 2, h), (w / 2, h), (0, h + rise)], z0, z1, STONE, axis='z')
    p.box((0, h + 0.05, zc), (w + 0.3, 0.16, length + 0.3), TRIM)
    # Facade: pilasters, portal with a round arch, rose window, steps.
    for x in (-w / 2 + 0.35, w / 2 - 0.35):
        p.box((x, h / 2, z0 - 0.1), (0.7, h, 0.25), TRIM)
    p.box((0, 1.75, z0 - 0.08), (2.9, 3.5, 0.2), TRIM)
    p.box((0, 1.6, z0 - 0.16), (2.1, 3.2, 0.12), WOOD)
    p.cyl((0, 3.4, z0 - 0.02), (0, 3.4, z0 - 0.2), 1.45, TRIM, n=16)
    p.cyl((0, 3.4, z0 - 0.2), (0, 3.4, z0 - 0.24), 1.05, 0x3a2a1e, n=16)
    p.cyl((0, 6.7, z0 - 0.02), (0, 6.7, z0 - 0.16), 1.35, TRIM, n=16)
    p.cyl((0, 6.7, z0 - 0.16), (0, 6.7, z0 - 0.2), 1.05, 0x2f4a6b, n=16)
    for i in range(4):
        ang = i / 4 * math.pi
        p.box((0, 6.7, z0 - 0.21), (2.1, 0.07, 0.03), TRIM, rot=RZ(ang))
    for i in range(3):
        p.box((0, 0.3 - i * 0.2 + 0.0, z0 - 0.8 - i * 0.45), (4.6 + i * 0.5, 0.2, 0.9), 0xbfb6a2)
    p.box((0, h + rise + 0.6, z0 + 0.1), (0.12, 1.2, 0.12), 0x4a4a4a)
    p.box((0, h + rise + 0.85, z0 + 0.1), (0.6, 0.12, 0.12), 0x4a4a4a)
    # Side walls: tall arched windows between buttresses.
    for s in (-1, 1):
        for i in range(4):
            z = z0 + 3.2 + i * 4.3
            p.box((s * (w / 2 + 0.03), 4.6, z), (0.1, 3.2, 1.0), 0x2f4a6b)
            p.cyl((s * (w / 2 - 0.03), 6.2, z), (s * (w / 2 + 0.08), 6.2, z), 0.5, 0x2f4a6b, n=12)
            p.box((s * (w / 2 + 0.25), 3.6, z + 2.15), (0.5, 7.2, 0.7), TRIM)
    # Apse.
    p.cyl((0, 0, z1), (0, 7.0, z1), 3.6, STONE, n=14)
    p.cyl((0, 7.0, z1), (0, 9.3, z1), 3.85, grey(0.9), 'roof', n=14, r2=0.05)
    # Bell tower: shaft with string courses, clock, belfry, spire.
    tx, tz, ts, th = w / 2 + 2.6, z0 + 3.5, 4.4, 21.0
    p.box((tx, -0.8, tz), (ts + 0.4, 2.4, ts + 0.4), 0xa79c86)
    p.box((tx, th / 2, tz), (ts, th, ts), 0xe2d4b8, cell=2.2)
    for y in (6.5, 13.0, 16.2, th):
        p.box((tx, y, tz), (ts + 0.35, 0.3, ts + 0.35), TRIM)
    for yaw in (0, math.pi / 2, math.pi, -math.pi / 2):
        p.origin = T(tx, 0, tz) @ RY(yaw) @ T(0, 0, ts / 2)
        p.box((0, 18.3, 0.0), (1.3, 2.4, 0.12), 0x2a2420)
        p.cyl((0, 19.5, -0.06), (0, 19.5, 0.06), 0.65, 0x2a2420, n=12)
        p.cyl((0, 14.6, 0.0), (0, 14.6, 0.1), 0.95, 0xf4efe2, n=16)
        p.cyl((0, 14.6, 0.1), (0, 14.6, 0.13), 0.08, 0x2a2420, n=6)
        p.box((0, 14.85, 0.12), (0.06, 0.5, 0.02), 0x2a2420)
        p.box((0.2, 14.6, 0.12), (0.4, 0.06, 0.02), 0x2a2420)
        p.box((0, 3.0, 0.0), (0.5, 1.4, 0.1), 0x2a2420)
        p.box((0, 9.6, 0.0), (0.5, 1.4, 0.1), 0x2a2420)
    p.origin = Matrix.Identity(4)
    p.lathe([(0.0, th + 0.15), (ts * 0.74, th + 0.15), (0.12, th + 6.2), (0.0, th + 6.3)], grey(0.92), 'roof', n=4, c=(tx, 0, tz), turn=math.pi / 4)
    p.sphere((tx, th + 6.45, tz), 0.25, 0xd8b24a, u=8, v=6)
    p.box((tx, th + 7.2, tz), (0.1, 1.2, 0.1), 0x4a4a4a)
    p.box((tx, th + 7.4, tz), (0.55, 0.1, 0.1), 0x4a4a4a)
    return p.build()


def fountain():
    p = Prop('fountain', ao=0.4, ao_distance=1.5)
    STONE = 0xb9b2a2
    p.lathe([(0.0, 0.0), (2.55, 0.0), (2.55, 0.12), (2.35, 0.12), (2.45, 0.62), (2.2, 0.7), (2.05, 0.66), (2.05, 0.2), (0.0, 0.2)], STONE, n=12)
    p.cyl((0, 0.44, 0), (0, 0.5, 0), 2.06, 0x5fa8c4, 'water', n=12)
    p.lathe([(0.0, 0.2), (0.5, 0.2), (0.34, 0.5), (0.26, 1.5), (0.4, 1.62), (1.05, 1.9), (1.1, 2.0), (0.9, 1.98), (0.0, 1.86)], STONE, n=12)
    p.cyl((0, 1.92, 0), (0, 1.96, 0), 0.92, 0x5fa8c4, 'water', n=12)
    p.lathe([(0.0, 1.86), (0.16, 1.86), (0.12, 2.5), (0.22, 2.58), (0.0, 2.8)], STONE, n=8)
    return p.build()


def awning():
    """Shop awning over a ground-floor door. Origin: on the wall, at the ground, under the middle; +z out of the wall."""
    p = Prop('awning', ao=0.5, ground=False, ao_distance=1.0)
    n, w = 8, 5.6
    for i in range(n):
        x = -w / 2 + w * (i + 0.5) / n
        group = 'awning' if i % 2 else 'paint'
        p.box((x, 2.62, 0.72), (w / n, 0.05, 1.5), WHITE if i % 2 else 0xf4efe2, group, rot=RX(0.3))
        p.box((x, 2.34, 1.44), (w / n, 0.22, 0.03), WHITE if i % 2 else 0xf4efe2, group)
    for e in (-1, 1):
        p.cyl((e * (w / 2 - 0.05), 2.42, 1.4), (e * (w / 2 - 0.05), 2.1, 0.05), 0.02, 0x3a3a3a, n=5)
    return p.build()


# ---------------------------------------------------------------- trees (1 unit tall: the game scales each one)

def crown_shade(lo, hi):
    return lambda y: 0.62 + 0.38 * max(0.0, min(1.0, (y - lo) / (hi - lo)))


def tree_oak():
    p = Prop('tree_oak', ao=0.22, ao_distance=0.5)
    p.lathe([(0.0, 0.0), (0.042, 0.0), (0.027, 0.12), (0.021, 0.5), (0.0, 0.5)], 0x5b4532, 'trunk', n=6)
    p.cyl((0, 0.36, 0), (0.12, 0.6, 0.05), 0.012, 0x5b4532, 'trunk', n=4)
    p.cyl((0, 0.4, 0), (-0.1, 0.62, -0.07), 0.011, 0x5b4532, 'trunk', n=4)
    shade = crown_shade(0.42, 0.95)
    for i, (c, r) in enumerate((((0, 0.68, 0), (0.27, 0.22, 0.27)), ((0.17, 0.72, 0.07), (0.2, 0.17, 0.2)), ((-0.16, 0.7, -0.1), (0.2, 0.17, 0.2)),
                                ((0.03, 0.85, -0.03), (0.18, 0.14, 0.18)), ((-0.05, 0.62, 0.18), (0.17, 0.14, 0.17)))):
        p.blob(c, r, WHITE, 'leaf', sub=1, noise=0.09, seed=i * 1.7, shade=shade)
    return p.build()


def tree_round():
    """A second broadleaf silhouette: taller trunk, one dense rounded crown (lime, plane tree)."""
    p = Prop('tree_round', ao=0.22, ao_distance=0.5)
    p.lathe([(0.0, 0.0), (0.036, 0.0), (0.024, 0.14), (0.02, 0.55), (0.0, 0.55)], 0x66503a, 'trunk', n=6)
    shade = crown_shade(0.4, 1.0)
    for i, (c, r) in enumerate((((0, 0.74, 0), (0.23, 0.25, 0.23)), ((0.11, 0.62, -0.1), 0.16), ((-0.12, 0.64, 0.08), 0.16), ((0.0, 0.6, 0.1), 0.14))):
        p.blob(c, r, WHITE, 'leaf', sub=2 if i == 0 else 1, noise=0.07, seed=3 + i * 2.3, shade=shade)
    return p.build()


def tree_pine():
    p = Prop('tree_pine', ao=0.24, ao_distance=0.4)
    p.lathe([(0.0, 0.0), (0.03, 0.0), (0.02, 0.15), (0.012, 0.6), (0.0, 0.6)], 0x4f3c2b, 'trunk', n=6)
    shade = crown_shade(0.15, 1.0)
    tiers = 4
    for k in range(tiers):
        base, radius, height = 0.16 + 0.19 * k, 0.3 - 0.062 * k, 0.36 - 0.03 * k
        p.lathe([(0.0, base + 0.05), (radius, base - 0.02), (0.0, base + height)], WHITE, 'leaf', n=8, star=0.26, turn=k * 0.7, shade=shade)
    return p.build()


def tree_cypress():
    p = Prop('tree_cypress', ao=0.3, ao_distance=0.4)
    p.lathe([(0.0, 0.0), (0.022, 0.0), (0.018, 0.12), (0.0, 0.12)], 0x4f3c2b, 'trunk', n=6)
    p.lathe([(0.0, 0.07), (0.075, 0.13), (0.105, 0.32), (0.1, 0.55), (0.07, 0.78), (0.03, 0.94), (0.0, 1.0)], WHITE, 'leaf', n=10, star=0.16, shade=crown_shade(0.05, 1.0))
    return p.build()


def bush():
    """Hedge bush, 1 unit tall: the game lines them up along the fields."""
    p = Prop('bush', ao=0.25, ao_distance=0.5)
    shade = crown_shade(0.0, 0.95)
    p.blob((0.05, 0.5, 0), (0.6, 0.5, 0.52), WHITE, 'leaf', sub=1, noise=0.1, seed=1.0, shade=shade)
    p.blob((-0.42, 0.36, 0.08), (0.42, 0.36, 0.4), WHITE, 'leaf', sub=1, noise=0.1, seed=4.0, shade=shade)
    return p.build()


# ---------------------------------------------------------------- street furniture and vehicles

def car():
    """Small hatchback, 4.1 m, pointing towards +x. The body is tinted by the game; a team car gets a roof rack."""
    p = Prop('car', ao=0.4, ao_distance=1.0)
    p.box((0, 0.56, 0), (4.1, 0.6, 1.72), WHITE, 'tint', bevel=0.13, seg=3)
    p.box((-0.3, 1.07, 0), (2.25, 0.5, 1.5), 0x1b2430, bevel=0.1, seg=2)
    p.box((-0.3, 1.33, 0), (1.95, 0.07, 1.42), WHITE, 'tint', bevel=0.03)
    for x in (-1.3, 1.3):
        for z in (-1, 1):
            p.cyl((x, 0.33, z * 0.74), (x, 0.33, z * 0.9), 0.33, 0x17181b, n=12)
            p.cyl((x, 0.33, z * 0.9), (x, 0.33, z * 0.91), 0.2, 0xb9c0c6, n=10)
    p.box((2.03, 0.42, 0), (0.1, 0.24, 1.6), 0x22252b)
    p.box((-2.03, 0.42, 0), (0.1, 0.24, 1.6), 0x22252b)
    for z in (-0.62, 0.62):
        p.box((2.04, 0.68, z), (0.05, 0.14, 0.36), 0xfff6d8, 'glow')
        p.box((-2.04, 0.7, z), (0.05, 0.14, 0.34), 0xb3201c)
    return p.build()


def roof_rack():
    """Team-car roof rack with two bikes and spare wheels. Origin: same as the car."""
    p = Prop('roof_rack', ao=0.6, ground=False, ao_distance=0.5)
    for x in (-0.85, 0.3):
        p.box((x, 1.46, 0), (0.05, 0.05, 1.5), 0x2a2d33)
    for z, c in ((-0.42, 0xd92f3a), (0.42, 0x2f6fde)):
        for x in (-0.95, 0.35):
            pts = [(x + math.cos(i / 12 * math.tau) * 0.33, 1.82 + math.sin(i / 12 * math.tau) * 0.33, z) for i in range(12)]
            p.tube(pts, 0.014, 0x1b1c1f, n=3, closed=True)
        p.tube([(-0.95, 1.82, z), (-0.5, 2.2, z), (0.2, 2.25, z), (0.35, 1.82, z)], 0.02, c, n=4)
        p.tube([(-0.5, 2.2, z), (-0.25, 1.82, z), (0.2, 2.25, z)], 0.02, c, n=4)
        p.box((-0.55, 2.3, z), (0.24, 0.04, 0.1), 0x1b1c1f)
    return p.build()


def parasol():
    """Cafe table under a parasol (the canopy is tinted)."""
    p = Prop('parasol', ao=0.45, ao_distance=1.2)
    p.cyl((0, 0, 0), (0, 2.5, 0), 0.03, 0xcfc9bb, n=6)
    p.lathe([(0.0, 2.52), (0.7, 2.38), (1.48, 2.1), (1.5, 2.02), (1.46, 2.04), (0.7, 2.3), (0.0, 2.3)], WHITE, 'tint', n=8)
    p.cyl((0, 0.7, 0), (0, 0.74, 0), 0.5, 0xe8e2d2, n=12)
    p.cyl((0, 0, 0), (0, 0.05, 0), 0.26, 0x55595e, n=10)
    for a in range(3):
        ang = a / 3 * math.tau + 0.4
        x, z = math.cos(ang) * 0.85, math.sin(ang) * 0.85
        p.box((x, 0.44, z), (0.4, 0.05, 0.4), 0x6b4a30, rot=RY(-ang))
        p.box((x * 1.22, 0.7, z * 1.22), (0.05, 0.5, 0.4), 0x6b4a30, rot=RY(-ang))
        p.cyl((x, 0, z), (x, 0.44, z), 0.03, 0x3a3a3a, n=5)
    return p.build()


def lamp():
    p = Prop('lamp', ao=0.5, ao_distance=0.6)
    p.lathe([(0.0, 0.0), (0.11, 0.0), (0.07, 0.25), (0.045, 0.5), (0.04, 3.6), (0.06, 3.7), (0.0, 3.7)], 0x2c3136, n=8)
    p.tube([(0, 3.65, 0), (0, 3.9, 0.25), (0, 3.86, 0.6)], 0.025, 0x2c3136, n=5)
    p.lathe([(0.0, 3.84), (0.05, 3.84), (0.2, 3.62), (0.17, 3.6), (0.0, 3.66)], 0x2c3136, n=8, c=(0, 0, 0.6))
    p.sphere((0, 3.58, 0.6), (0.13, 0.1, 0.13), 0xfff1cf, 'glow', u=8, v=5)
    return p.build()


def build():
    return [
        stacked_module('village_ground', village_ground), stacked_module('village_upper', village_upper),
        stacked_module('village_upper_b', village_upper, with_balcony=True, seed=2), stacked_module('village_roof', village_roof),
        stacked_module('alpine_ground', alpine_ground), stacked_module('alpine_upper', alpine_upper), stacked_module('alpine_roof', alpine_roof),
        stacked_module('coastal_ground', coastal_ground), stacked_module('coastal_upper', coastal_upper), stacked_module('coastal_roof', coastal_roof),
        barn(), church(), fountain(), awning(),
        tree_oak(), tree_round(), tree_pine(), tree_cypress(), bush(), car(), roof_rack(), parasol(), lamp(),
    ]


def stacked_module(name, module, **kw):
    p = Prop(name, ao=0.36, ground=name.endswith('ground'), ao_distance=2.5)
    module(p, W, D, 0.0, **kw)
    return p.build()
