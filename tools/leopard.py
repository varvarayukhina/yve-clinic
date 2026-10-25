"""Бесшовный леопардовый паттерн (SVG-плитка) для темы «Леопард».

    python3 tools/leopard.py > site/assets/leopard.svg
"""
import math
import random

W = H = 420
random.seed(7)
BG, INNER, INK = "#d7ad78", "#b9773d", "#1b1410"


def ell(cx, cy, rx, ry, rot, a, k=1.0):
    x, y = rx * k * math.cos(a), ry * k * math.sin(a)
    return cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)


def ring_segment(cx, cy, rx, ry, rot, a0, a1, thick):
    """Разорванный сегмент кольца розетки: толще в середине, острые концы."""
    n = 14
    ph, ph2 = random.uniform(0, 6.3), random.uniform(0, 6.3)
    outer, inner = [], []
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n
        t = thick * math.sin(math.pi * k / n) ** 0.45 * (1 + 0.18 * math.sin(4 * a + ph2))
        r = (rx + ry) / 2
        w = 0.07 * math.sin(3 * a + ph)
        outer.append(ell(cx, cy, rx, ry, rot, a, 1 + w + t * 0.6 / r))
        inner.append(ell(cx, cy, rx, ry, rot, a, 1 + w - t * 0.4 / r))
    return "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in outer + inner[::-1]) + "Z"


def blob(cx, cy, rx, ry, rot=0.0):
    n = 11
    pts = [ell(cx, cy, rx, ry, rot, 2 * math.pi * k / n, random.uniform(0.8, 1.12)) for k in range(n)]
    return "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"


def copies(x, y, pad):
    for dx in (-W, 0, W):
        for dy in (-H, 0, H):
            if -pad < x + dx < W + pad and -pad < y + dy < H + pad:
                yield dx, dy


def wrap_dist(a, b):
    dx = abs(a[0] - b[0]); dy = abs(a[1] - b[1])
    return math.hypot(min(dx, W - dx), min(dy, H - dy))


# Плотная случайная раскладка на торе — паттерн бесшовный
spots = []
for _ in range(6000):
    c = (random.uniform(0, W), random.uniform(0, H))
    r = random.choice([random.uniform(9, 14), random.uniform(14, 22), random.uniform(20, 27)])
    if all(wrap_dist(c, s[0]) > (r + s[1]) * 1.18 + 6 for s in spots):
        spots.append((c, r))

inner_paths, ink_paths = [], []
for (cx, cy), r in spots:
    rx, ry = r * random.uniform(1.0, 1.35), r * random.uniform(0.7, 0.95)
    rot = random.uniform(0, math.pi)
    small = r < 12
    segs = [] 
    a = random.uniform(0, 2 * math.pi)
    total = 0.0
    while total < 2 * math.pi - 0.5:
        span = random.uniform(0.8, 1.7)
        gap = random.uniform(0.3, 0.6)
        if total + span > 2 * math.pi - 0.3:
            span = 2 * math.pi - 0.3 - total
        segs.append((a + total, a + total + span))
        total += span + gap
    for dx, dy in copies(cx, cy, 40):
        x, y = cx + dx, cy + dy
        if small and random.random() < 0.5:
            ink_paths.append(blob(x, y, rx * 0.55, ry * 0.5, rot))
            continue
        inner_paths.append(blob(x, y, rx * 0.66, ry * 0.62, rot))
        for a0, a1 in segs:
            if a1 - a0 > 0.25:
                ink_paths.append(ring_segment(x, y, rx, ry, rot, a0, a1, r * random.uniform(0.4, 0.58)))
for _ in range(40):
    cx, cy = random.uniform(0, W), random.uniform(0, H)
    s = random.uniform(1.8, 3.6)
    for dx, dy in copies(cx, cy, 6):
        ink_paths.append(blob(cx + dx, cy + dy, s * 1.3, s, random.uniform(0, 3)))

print(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
      f'<rect width="{W}" height="{H}" fill="{BG}"/>'
      f'<path fill="{INNER}" d="{"".join(inner_paths)}"/>'
      f'<path fill="{INK}" d="{"".join(ink_paths)}"/></svg>')
