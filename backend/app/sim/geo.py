"""Zone map: road network, blocks, parcels and the routing engine.

Map coordinates: 1 unit = 10 m (default zone ≈ 10 km x 6.9 km).
"""
from ..i18n import L, LANG
import heapq
import math

UNIT_KM = 0.01
GATE_NAMES = {"dogu": L("East Gate · Motorway", "Doğu Kapısı · Otoyol"), "bati": L("West Gate · Port road", "Batı Kapısı · Liman yolu"), "kuzey": L("North Gate", "Kuzey Kapısı"), "guney": L("South Gate", "Güney Kapısı")}
CFG = {}
W, H, XS, YS, GATES, SUBSTATIONS, RESERVED_BLOCKS = 0, 0, [], [], {}, [], {}
COLS, ROWS = 4, 3


def configure(cfg=None):
    """Builds the zone layout from a config dict. Empty config = default 4x3-block demo zone.

    cfg keys: sutun (cols), satir (rows), ada_genislik, ada_yukseklik, enerji_ada [c,r], hizmet_ada [c,r],
    kapilar [{"yon": "dogu|bati|kuzey|guney", "yol": indeks, "ad": "..."}], trafolar [[xi, yi], ...]"""
    global CFG, W, H, XS, YS, GATES, SUBSTATIONS, RESERVED_BLOCKS, COLS, ROWS, GRAPH
    cfg = cfg or {}
    CFG = cfg
    COLS = max(2, min(8, int(cfg.get("sutun", 4))))
    ROWS = max(2, min(6, int(cfg.get("satir", 3))))
    bw = max(150, min(320, int(cfg.get("ada_genislik", 210))))
    bh = max(140, min(300, int(cfg.get("ada_yukseklik", 190))))
    XS = [60 + i * bw for i in range(COLS + 1)]
    YS = [60 + j * bh for j in range(ROWS + 1)]
    W, H = XS[-1] + 100, YS[-1] + 60
    en = tuple(cfg.get("enerji_ada", [COLS - 1, 1 if ROWS > 2 else 0]))
    hz = tuple(cfg.get("hizmet_ada", [COLS - 1, ROWS - 1]))
    if hz == en:
        hz = (max(0, en[0] - 1), en[1])
    RESERVED_BLOCKS = {en: "enerji", hz: "hizmet"}
    gates = cfg.get("kapilar") or [{"yon": "dogu", "yol": min(2, ROWS - 1)}, {"yon": "bati", "yol": 1}]
    GATES = {}
    for g in gates:
        yon, k = g.get("yon", "dogu"), int(g.get("yol", 1))
        if yon in ("dogu", "bati"):
            y = YS[max(0, min(ROWS, k))]
            x0 = XS[-1] if yon == "dogu" else XS[0]
            GATES[yon] = {"ad": g.get("ad") or GATE_NAMES[yon], "x": x0 + (85 if yon == "dogu" else -45), "y": y, "baglanti": (x0, y)}
        elif yon in ("kuzey", "guney"):
            x = XS[max(0, min(COLS, k))]
            y0 = YS[0] if yon == "kuzey" else YS[-1]
            GATES[yon] = {"ad": g.get("ad") or GATE_NAMES[yon], "x": x, "y": y0 + (-45 if yon == "kuzey" else 45), "baglanti": (x, y0)}
    tms = cfg.get("trafolar") or [[xi, yi] for yi in range(1, ROWS) for xi in range(1, COLS, 2)] or [[1, 1]]
    SUBSTATIONS = [{"id": f"TM-{i+1}", "x": XS[max(0, min(COLS, int(a)))], "y": YS[max(0, min(ROWS, int(b)))]} for i, (a, b) in enumerate(tms)]
    GRAPH = _build_graph()
    _route_cache.clear()


def block_rect(c, r, inset=12):
    return XS[c] + inset, YS[r] + inset, XS[c + 1] - XS[c] - 2 * inset, YS[r + 1] - YS[r] - 2 * inset


def parcels():
    """Returns all industrial parcels (2x2 per block)."""
    out = []
    gap = 6
    for r in range(ROWS):
        for c in range(COLS):
            if (c, r) in RESERVED_BLOCKS:
                continue
            bx, by, bw, bh = block_rect(c, r)
            pw, ph = (bw - gap) / 2, (bh - gap) / 2
            for j in range(2):
                for i in range(2):
                    out.append({"c": c, "r": r, "x": round(bx + i * (pw + gap), 1), "y": round(by + j * (ph + gap), 1),
                                "w": round(pw, 1), "h": round(ph, 1), "row": j, "slot": j * 2 + i})
    return out


def facilities():
    """Shared facilities: solar farm, battery, wastewater plant, logistics hub, management + fire station."""
    inv = {v: k for k, v in RESERVED_BLOCKS.items()}
    ex, ey, ew, eh = block_rect(*inv["enerji"])
    hx, hy, hw, hh = block_rect(*inv["hizmet"])
    return {
        "ges": {"ad": L("Zone Solar Farm (PV)", "OSB Güneş Santrali (GES)"), "x": ex, "y": ey, "w": ew, "h": eh * 0.66},
        "bess": {"ad": L("Battery Storage (BESS)", "Batarya Depolama (BESS)"), "x": ex, "y": ey + eh * 0.7, "w": ew * 0.48, "h": eh * 0.3},
        "aim": {"ad": L("Main Substation", "Ana İndirici Merkez"), "x": ex + ew * 0.52, "y": ey + eh * 0.7, "w": ew * 0.48, "h": eh * 0.3},
        "aritma": {"ad": L("Central Wastewater Plant", "Merkezi Atıksu Arıtma"), "x": hx, "y": hy, "w": hw * 0.48, "h": hh},
        "lojistik": {"ad": L("Logistics Hub · Shared Fleet", "Lojistik Merkezi · Ortak Filo"), "x": hx + hw * 0.52, "y": hy, "w": hw * 0.48, "h": hh},
    }


# ---------------- road graph ----------------
def _build_graph():
    nodes = {}
    for x in XS:
        for y in YS:
            nodes[(x, y)] = []
    for i, x in enumerate(XS):
        for j, y in enumerate(YS):
            if i + 1 < len(XS):
                nodes[(x, y)].append((XS[i + 1], y))
                nodes[(XS[i + 1], y)].append((x, y))
            if j + 1 < len(YS):
                nodes[(x, y)].append((x, YS[j + 1]))
                nodes[(x, YS[j + 1])].append((x, y))
    for g in GATES.values():
        p = (g["x"], g["y"])
        nodes[p] = [g["baglanti"]]
        nodes[g["baglanti"]].append(p)
    return nodes


_route_cache = {}
GRAPH = {}


def _dijkstra(a, b):
    if a == b:
        return [a]
    dist = {a: 0}
    prev = {}
    pq = [(0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == b:
            break
        if d > dist.get(u, 1e18):
            continue
        for v in GRAPH[u]:
            nd = d + abs(u[0] - v[0]) + abs(u[1] - v[1])
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    path = [b]
    while path[-1] != a:
        path.append(prev[path[-1]])
    return path[::-1]


def route(a_seg, b_seg):
    """a_seg / b_seg: (point list, road node). Points are given in entrance -> node order."""
    a_pts, a_node = a_seg
    b_pts, b_node = b_seg
    key = (a_node, b_node)
    if key not in _route_cache:
        _route_cache[key] = _dijkstra(a_node, b_node)
    mid = _route_cache[key]
    pts = list(a_pts) + list(mid) + list(reversed(b_pts))
    # drop consecutive duplicates
    clean = [pts[0]]
    for p in pts[1:]:
        if p != clean[-1]:
            clean.append(p)
    return clean


def access_segment(cx, cy, c, r):
    """Short path from a parcel centre to the nearest street and junction."""
    top, bot = YS[r], YS[r + 1]
    ry = top if abs(cy - top) <= abs(cy - bot) else bot
    left, right = XS[c], XS[c + 1]
    nx = left if abs(cx - left) <= abs(cx - right) else right
    return [(cx, cy), (cx, ry)], (nx, ry)


def service_block():
    return {v: k for k, v in RESERVED_BLOCKS.items()}["hizmet"]


def gate_segment(key):
    g = GATES[key]
    return [], (g["x"], g["y"])


def path_length(pts):
    return sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))


def manhattan(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def roads():
    segs = []
    for y in YS:
        segs.append([XS[0], y, XS[-1], y])
    for x in XS:
        segs.append([x, YS[0], x, YS[-1]])
    for g in GATES.values():
        segs.append([g["baglanti"][0], g["baglanti"][1], g["x"], g["y"]])
    return segs


configure({})
