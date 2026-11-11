"""Stadium props: the basketball backstop unit, the raised boxing ring with its lighting rig, benches and the scorer's table."""
import math
from mathutils import Vector
from kit import Prop, RY, RZ

STEEL, ALU, DARK = 0x7d8894, 0xc9d0d6, 0x23272e


def hoop():
    """Origin: middle of the baseline, on the floor. -x is the court, +x the run-off behind the basket."""
    p = Prop('hoop', ao=0.42, ao_distance=1.2)
    NAVY, PAD, ORANGE, WHITE = 0x1b2a4e, 0x2456b8, 0xf2581c, 0xf6f6f0
    # Wheeled base with the protective pad facing the court.
    p.box((2.35, 0.47, 0), (2.3, 0.82, 1.3), NAVY, bevel=0.05)
    p.box((2.35, 0.9, 0), (2.0, 0.05, 1.1), 0x2a3550)
    for x in (1.45, 3.25):
        for z in (-0.62, 0.62):
            p.cyl((x, 0.09, z - 0.05), (x, 0.09, z + 0.05), 0.09, DARK, n=10)
    p.box((1.12, 1.0, 0), (0.2, 1.9, 1.3), PAD, bevel=0.06, seg=3)
    # Mast, boom towards the board, lower strut and rear stays.
    p.box((1.95, 1.55, 0), (0.36, 1.3, 0.42), NAVY, bevel=0.03)
    a, b = Vector((2.0, 2.12, 0)), Vector((-1.0, 3.42, 0))
    d = b - a
    p.box(tuple((a + b) / 2), (d.length, 0.26, 0.3), NAVY, rot=RZ(math.atan2(d.y, d.x)), bevel=0.035)
    pad_a, pad_b = a.lerp(b, 0.42), a.lerp(b, 0.98)
    p.box(tuple((pad_a + pad_b) / 2 + Vector((-0.02, -0.1, 0))), ((pad_b - pad_a).length, 0.12, 0.34), PAD, rot=RZ(math.atan2(d.y, d.x)), bevel=0.04)
    p.cyl((1.8, 1.15, 0), (0.2, 2.76, 0), 0.055, STEEL)
    for z in (-1, 1):
        p.cyl((2.0, 2.1, z * 0.16), (3.3, 0.9, z * 0.45), 0.028, STEEL, n=8)
    # Board frame, glass, padding of the lower edge.
    p.box((-1.07, 3.42, 0), (0.1, 0.95, 0.6), STEEL)
    for z in (-1, 1):
        for y in (3.15, 3.72):
            p.cyl((-1.04, y, 0.25 * z), (-1.17, y, 0.84 * z), 0.02, STEEL, n=8)
    p.box((-1.19, 3.425, 0), (0.022, 1.05, 1.8), 0xdfeaf5, 'glass')
    p.box((-1.19, 3.972, 0), (0.05, 0.045, 1.89), ALU)
    p.box((-1.19, 2.872, 0), (0.075, 0.075, 1.92), PAD, bevel=0.02)
    for z in (-1, 1):
        p.box((-1.19, 3.425, z * 0.922), (0.05, 1.09, 0.045), ALU)
        p.box((-1.19, 3.08, z * 0.93), (0.075, 0.42, 0.065), PAD, bevel=0.02)
    # Painted lines on the glass: border and the small rectangle above the ring.
    x = -1.2035
    for y in (3.925, 2.925):
        p.box((x, y, 0), (0.005, 0.05, 1.8), WHITE, 'line')
    for z in (-0.875, 0.875):
        p.box((x, 3.425, z), (0.005, 1.05, 0.05), WHITE, 'line')
    for y in (3.045, 3.445):
        p.box((x, y, 0), (0.005, 0.05, 0.59), WHITE, 'line')
    for z in (-0.27, 0.27):
        p.box((x, 3.245, z), (0.005, 0.45, 0.05), WHITE, 'line')
    # Ring, mount, braces.
    cx, cy, rr = -1.575, 3.05, 0.236
    p.tube([(cx + math.cos(i / 24 * math.tau) * rr, cy, math.sin(i / 24 * math.tau) * rr) for i in range(24)], 0.011, ORANGE, n=6, closed=True)
    p.box((-1.217, 3.0, 0), (0.02, 0.17, 0.17), ORANGE)
    p.box((-1.285, 3.04, 0), (0.13, 0.022, 0.11), ORANGE)
    for z in (-1, 1):
        p.cyl((-1.225, 2.94, 0.06 * z), (-1.41, 3.04, 0.16 * z), 0.008, ORANGE, n=5)
    # Net: twelve cords in a diamond pattern, narrowing downwards.
    radii = (0.225, 0.2, 0.18, 0.165, 0.155)
    def knot(i, k):
        ang = (i + 0.5 * (k % 2)) / 12 * math.tau
        return (cx + math.cos(ang) * radii[k], cy - 0.105 * k, math.sin(ang) * radii[k])
    for k in range(4):
        for i in range(12):
            p.tube([knot(i, k), knot(i, k + 1)], 0.0055, WHITE, 'net', n=3)
            p.tube([knot(i + 1, k), knot(i, k + 1)] if k % 2 == 0 else [knot(i, k), knot(i + 1, k + 1)], 0.0055, WHITE, 'net', n=3)
    # Shot clock housing above the board.
    p.box((-1.12, 4.3, 0), (0.14, 0.44, 0.66), 0x15171c, bevel=0.02)
    p.box((-1.193, 4.3, 0), (0.004, 0.36, 0.58), 0x2b0d0d)
    for z in (-0.2, 0.2):
        p.cyl((-1.12, 3.99, z), (-1.12, 4.09, z), 0.02, STEEL, n=6)
    return p.build()


def truss(p, a, b, width=0.3, bay=0.62, color=0x30353d):
    """Triangular lighting truss between two points: three chords and a zigzag of braces."""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    side = axis.cross(Vector((0, 1, 0)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    up = side.cross(axis).normalized()
    offsets = [(side * math.cos(t) + up * math.sin(t)) * width * 0.58 for t in (math.pi / 2, math.pi * 7 / 6, math.pi * 11 / 6)]
    for o in offsets:
        p.cyl(tuple(a + o), tuple(b + o), 0.022, color, 'truss', n=4, caps=False)
    bays = max(1, round((b - a).length / bay))
    for i in range(bays):
        t0, t1 = a.lerp(b, i / bays), a.lerp(b, (i + 1) / bays)
        for k in range(3):
            p.cyl(tuple(t0 + offsets[k]), tuple(t1 + offsets[(k + 1) % 3]), 0.011, color, 'truss', n=3, caps=False)


def ring(H=1.0):
    """Origin: centre of the canvas (y = 0). The arena floor is H below. Ropes on the 6.1 m square the boxers move in."""
    p = Prop('ring', ao=0.4, ao_distance=1.5)
    A, Q, P = 3.6, 3.05, 3.34
    EDGE, SKIRT = 0x1c365b, 0x0f1830
    # Platform under the canvas (drawn by the game with the texture) and the skirt down to the floor.
    p.box((0, -0.085, 0), (2 * A, 0.14, 2 * A), EDGE, bevel=0.035, seg=3)
    for s in (-1, 1):
        p.box((s * (A - 0.04), -(H + 0.15) / 2, 0), (0.05, H - 0.15, 2 * A - 0.08), SKIRT, cell=0.45)
        p.box((0, -(H + 0.15) / 2, s * (A - 0.04)), (2 * A - 0.08, H - 0.15, 0.05), SKIRT, cell=0.45)
        p.box((s * (A - 0.035), -0.2, 0), (0.06, 0.035, 2 * A - 0.06), 0xd8b24a)
        p.box((0, -0.2, s * (A - 0.035)), (2 * A - 0.06, 0.035, 0.06), 0xd8b24a)
    ropes = ((0.45, 0xd53e50), (0.75, 0xf5f0e4), (1.05, 0x427fc4), (1.35, 0xf5f0e4))
    for sx in (-1, 1):
        for sz in (-1, 1):
            p.cyl((sx * P, -0.03, sz * P), (sx * P, 1.5, sz * P), 0.055, 0x9aa7b4, n=12)
            p.sphere((sx * P, 1.5, sz * P), 0.07, 0x9aa7b4, u=10, v=6)
            p.cyl((sx * P, -0.02, sz * P), (sx * P, 0.03, sz * P), 0.11, 0x6f7a86, n=12)
            for y, _ in ropes:
                p.cyl((sx * (P - 0.04), y, sz * (P - 0.04)), (sx * Q, y, sz * Q), 0.017, 0xb9c2ca, n=6)
            color = 0xcb3c4d if (sx < 0 and sz > 0) else 0x387cdc if (sx > 0 and sz < 0) else 0xe9e6dc
            p.box((sx * 2.915, 0.9, sz * 2.915), (0.5, 1.15, 0.13), color, rot=RY(math.atan2(-sx, -sz)), bevel=0.05, seg=3)
    # Four ropes, each a closed loop with a little sag between the corners.
    for y, color in ropes:
        pts = []
        corners = [(-Q, -Q), (Q, -Q), (Q, Q), (-Q, Q)]
        for i in range(4):
            (x0, z0), (x1, z1) = corners[i], corners[(i + 1) % 4]
            for k in range(8):
                t = k / 8
                pts.append((x0 + (x1 - x0) * t, y - 0.035 * 4 * t * (1 - t), z0 + (z1 - z0) * t))
        p.tube(pts, 0.024, color, n=8, closed=True)
    for s in (-1, 1):
        for o in (-1.02, 1.02):
            p.box((o, 0.9, s * Q), (0.036, 0.96, 0.036), 0xf6eee1)
            p.box((s * Q, 0.9, o), (0.036, 0.96, 0.036), 0xf6eee1)
    # Steps at the red and blue corners, a stool and a bucket beside each.
    for sx, sz in ((-1, 1), (1, -1)):
        z = sz * 2.45
        for k in range(3):
            top = -0.25 * (k + 1)
            x = sx * (A + 0.3 * k + 0.15)
            p.box((x, (top - H) / 2, z), (0.3, top + H, 0.95), 0x3b4452)
            p.box((x, top + 0.006, z), (0.3, 0.014, 0.95), 0x9aa7b4)
        p.cyl((sx * (A + 0.5), -H, sz * 3.35), (sx * (A + 0.5), -H + 0.44, sz * 3.35), 0.17, 0x2a2f38, n=12)
        p.cyl((sx * (A + 0.5), -H + 0.44, sz * 3.35), (sx * (A + 0.5), -H + 0.5, sz * 3.35), 0.19, 0xcb3c4d if sx < 0 else 0x387cdc, n=12)
        p.cyl((sx * (A + 1.0), -H, sz * 3.2), (sx * (A + 1.0), -H + 0.3, sz * 3.2), 0.13, 0xb9c2ca, n=10, r2=0.16)
    # Ringside tables on the two short sides: cloth to the floor, monitors, the bell.
    def table(cx, cz, along_x):
        size = (3.2, 0.72, 0.7) if along_x else (0.7, 0.72, 3.2)
        p.box((cx, -H + 0.36, cz), size, 0x141b2e, cell=0.4)
        p.box((cx, -H + 0.74, cz), (size[0] + 0.1, 0.04, size[2] + 0.1), 0x2a3144)
        for o in (-1.0, 0, 1.0):
            x, z = (cx + o, cz) if along_x else (cx, cz + o)
            inward = Vector((-cx, 0, -cz)).normalized()
            yaw = math.atan2(-inward.x, -inward.z)
            p.box((x, -H + 0.93, z), (0.44, 0.3, 0.04), 0x16181d, rot=RY(yaw))
            p.box((x - inward.x * 0.022, -H + 0.93, z - inward.z * 0.022), (0.4, 0.26, 0.004), 0x5db4e6, 'glow', rot=RY(yaw))
            p.box((x, -H + 0.77, z), (0.16, 0.03, 0.12), 0x16181d)
    # The far side stays free: the cornermen stand there.
    table(-4.95, 0, False)
    table(4.95, 0, False)
    p.sphere((-4.75, -H + 0.83, 1.45), (0.1, 0.07, 0.1), 0xd8b24a, u=10, v=6)
    p.cyl((-4.75, -H + 0.76, 1.45), (-4.75, -H + 0.8, 1.45), 0.07, 0x5a4a22, n=8)
    obj = p.build()
    obj['floor'] = -H
    return obj


def ring_rig(H=1.0):
    """Ground-supported lighting truss over the ring: four towers, a square of beams, two rows of spotlights."""
    p = Prop('ring_rig', ao=0.55, ao_distance=1.0)
    D, TOP = 5.4, 6.7
    for sx in (-1, 1):
        for sz in (-1, 1):
            truss(p, (sx * D, -H, sz * D), (sx * D, TOP + 0.3, sz * D))
            p.box((sx * D, -H + 0.04, sz * D), (0.7, 0.08, 0.7), 0x23272e)
    for s in (-1, 1):
        truss(p, (-D, TOP, s * D), (D, TOP, s * D))
        truss(p, (s * D, TOP, -D), (s * D, TOP, D))
        truss(p, (-D, TOP, s * 1.9), (D, TOP, s * 1.9))
    for z in (-1.9, 1.9):
        for x in (-2.6, -0.9, 0.9, 2.6):
            aim = Vector((x * 0.25, 0, z * 0.25)) - Vector((x, TOP - 0.35, z))
            aim.normalize()
            top = Vector((x, TOP - 0.3, z))
            p.cyl((x, TOP - 0.17, z), tuple(top), 0.02, 0x23272e, n=5)
            p.cyl(tuple(top), tuple(top + aim * 0.36), 0.15, 0x191c21, n=10, r2=0.17)
            p.cyl(tuple(top + aim * 0.36), tuple(top + aim * 0.375), 0.15, 0xfff1cf, 'glow', n=10)
    obj = p.build()
    obj['floor'] = -H
    return obj


def chair(p, x, z, facing, seat='tint'):
    """facing = +1: the chair looks towards +z."""
    p.box((x, 0.45, z), (0.48, 0.07, 0.46), 0xffffff if seat == 'tint' else 0x39414f, seat, bevel=0.02)
    p.box((x, 0.8, z - facing * 0.23), (0.48, 0.48, 0.06), 0xffffff if seat == 'tint' else 0x39414f, seat, bevel=0.02)
    for dx in (-0.2, 0.2):
        p.cyl((x + dx, 0, z + facing * 0.19), (x + dx, 0.43, z + facing * 0.19), 0.014, STEEL, n=5)
        p.cyl((x + dx, 0, z - facing * 0.2), (x + dx, 1.0, z - facing * 0.25), 0.014, STEEL, n=5)


def bench():
    """Team bench: a row of five padded chairs in the team colour. Looks towards +z."""
    p = Prop('bench', ao=0.4, ao_distance=0.7)
    for i in range(-2, 3):
        chair(p, i * 0.56, 0, 1)
    return p.build()


def scorer_table():
    """Scorer's table between the benches: lit front panel, monitors, three officials' chairs behind. Looks towards +z."""
    p = Prop('scorer_table', ao=0.4, ao_distance=0.8)
    p.box((0, 0.37, 0), (4.2, 0.74, 0.7), 0x10151f, cell=0.4)
    p.box((0, 0.76, 0), (4.3, 0.04, 0.82), 0x2b313c)
    p.box((0, 0.4, 0.356), (4.1, 0.5, 0.012), 0x2a7fd0, 'glow')
    for x in (-1.3, 0, 1.3):
        p.box((x, 0.95, -0.05), (0.44, 0.3, 0.04), 0x16181d)
        p.box((x, 0.95, -0.072), (0.4, 0.26, 0.004), 0x5db4e6, 'glow')
        p.box((x, 0.79, -0.05), (0.16, 0.03, 0.12), 0x16181d)
        chair(p, x, -0.75, 1, 'paint')
    return p.build()


def build():
    return [hoop(), ring(), ring_rig(), bench(), scorer_table()]
