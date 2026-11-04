"""Zone logistics: shared fleet, order generation, routing, loading/unloading, gate queues, emergency vehicle."""
from ..i18n import L, LANG
import math

from . import geo
from .data import SUPPLY_LINKS, DIESEL_TL_KM, TRUCK_CO2_KM

SPEED = 26.0          # map units / min  (≈13 km/h in-zone traffic + manoeuvring)
EMERGENCY_SPEED = 42.0
LOAD_MIN, UNLOAD_MIN = 8, 6


class Truck:
    def __init__(self, tid, plaka, seg, kind="kamyon"):
        self.id, self.plaka, self.kind = tid, plaka, kind
        self.loc = seg
        p = seg[0][0] if seg[0] else seg[1]
        self.x, self.y = p
        self.state = "bos"
        self.path, self.seg_i, self.prog = [], 0, 0.0
        self.order = None
        self.wait = 0
        self.km_yuklu = self.km_bos = 0.0
        self.fill = 0.0
        self.task = None

    def go(self, pts):
        self.path, self.seg_i, self.prog = pts, 0, 0.0
        if pts:
            self.x, self.y = pts[0]

    def advance(self, speed):
        """Advance along the path; returns (arrived, distance_moved)."""
        moved = 0.0
        while self.seg_i < len(self.path) - 1 and speed > 1e-6:
            a, b = self.path[self.seg_i], self.path[self.seg_i + 1]
            seg_len = math.hypot(b[0] - a[0], b[1] - a[1])
            rem = seg_len - self.prog
            if speed < rem:
                self.prog += speed
                moved += speed
                t = self.prog / seg_len
                self.x, self.y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
                return False, moved
            speed -= rem
            moved += rem
            self.seg_i += 1
            self.prog = 0.0
            self.x, self.y = b
        return True, moved


class Order:
    _n = 0

    def __init__(self, tip, src, dst, yuk, urun, created, link_id=None):
        Order._n += 1
        self.id = f"S{Order._n:05d}"
        self.tip, self.src, self.dst, self.yuk, self.urun = tip, src, dst, yuk, urun
        self.created, self.link_id = created, link_id
        self.truck = None
        self.durum = "bekliyor"
        self.teslim = None

    def to(self, w):
        return {"id": self.id, "tip": self.tip, "kaynak": w.place_name(self.src), "hedef": w.place_name(self.dst),
                "yuk_t": round(self.yuk, 1), "urun": self.urun, "durum": self.durum, "arac": self.truck,
                "bekleme_dk": (self.teslim or w.minute) - self.created}


class Logistics:
    def __init__(self, w):
        self.w = w
        fac = geo.facilities()["lojistik"]
        dcx, dcy = fac["x"] + fac["w"] / 2, fac["y"] + fac["h"] / 2
        self.depot = geo.access_segment(dcx, dcy, *geo.service_block())
        self.depot_xy = (dcx, dcy)
        self.pool = False
        self.trucks = []
        for i in range(48):
            plaka = f"16 NX {100 + i * 7:03d}"
            self.trucks.append(Truck(f"K{i+1:02d}", plaka, self.depot))
        self.emergency = Truck(L("FIRE-1", "ITF-1"), L("Zone Fire Brigade", "OSB İtfaiye"), w.hq_seg, "itfaiye")
        self.orders = []          # waiting + active
        self.done = []            # son teslimler
        self.gate_blocked = {k: False for k in geo.GATES}
        self.today = self._zero()
        self.total = self._zero()
        self.lead_times = []

    @staticmethod
    def _zero():
        return {"teslim": 0, "km_yuklu": 0.0, "km_bos": 0.0, "co2_kg": 0.0, "yakit_tl": 0.0, "ton": 0.0,
                "simbiyoz_sefer": 0, "ic_tedarik": 0, "giris": 0, "sevkiyat": 0}

    # -------- helpers --------
    def seg_of(self, place):
        kind, key = place
        if kind == "f":
            return self.w.fmap[key].seg
        if kind == "g":
            return geo.gate_segment(key)
        return self.depot

    def xy_of(self, place):
        kind, key = place
        if kind == "f":
            f = self.w.fmap[key]
            return f.cx, f.cy
        if kind == "g":
            g = geo.GATES[key]
            return g["x"], g["y"]
        return self.depot_xy

    def create_order(self, tip, src, dst, yuk, urun, link_id=None):
        o = Order(tip, src, dst, yuk, urun, self.w.minute, link_id)
        self.orders.append(o)
        return o

    def _weighted_factory(self, sectors=None):
        rng = self.w.rng
        pool = [f for f in self.w.factories if f.sektor != "biyogaz" and (sectors is None or f.sektor in sectors)
                and f.status != "durdu"]
        if not pool:
            return None
        tot = sum(f.calisan for f in pool)
        r = rng.uniform(0, tot)
        for f in pool:
            r -= f.calisan
            if r <= 0:
                return f
        return pool[-1]

    def _generate(self):
        w, rng = self.w, self.w.rng
        h = w.hour
        rate = (26 if 6 <= h < 22 else 8) * w.mods["lojistik"]
        if rng.random() > rate / 60:
            return
        r = rng.random()
        keys = list(geo.GATES)
        gate = keys[0] if (len(keys) == 1 or rng.random() < 0.6) else rng.choice(keys[1:])
        if r < 0.38:
            f = self._weighted_factory()
            if f:
                self.create_order("giris", ("g", gate), ("f", f.id), rng.uniform(8, 20), L("Raw material", "Hammadde"))
        elif r < 0.76:
            f = self._weighted_factory()
            if f:
                self.create_order("sevkiyat", ("f", f.id), ("g", gate), rng.uniform(6, 18), f.s["urun"])
        else:
            sup = rng.choice(list(SUPPLY_LINKS))
            a = self._weighted_factory([sup])
            b = self._weighted_factory(SUPPLY_LINKS[sup])
            if a and b and a is not b:
                self.create_order("ic_tedarik", ("f", a.id), ("f", b.id), rng.uniform(4, 14), a.s["urun"])

    def _blocked(self, place):
        return place[0] == "g" and self.gate_blocked.get(place[1])

    def _assign(self):
        free = [t for t in self.trucks if t.state == "bos"]
        if not free:
            return
        for o in self.orders:
            if o.durum != "bekliyor" or not free:
                continue
            if self._blocked(o.src) or self._blocked(o.dst):
                continue
            px, py = self.xy_of(o.src)
            t = min(free, key=lambda tr: abs(tr.x - px) + abs(tr.y - py))
            free.remove(t)
            o.durum, o.truck = "atandi", t.id
            t.order = o
            t.state = "gidiyor"
            t.fill = 0.0
            t.go(geo.route(t.loc, self.seg_of(o.src)))

    # -------- main loop --------
    def tick(self):
        w = self.w
        self._generate()
        self._assign()
        for t in self.trucks:
            self._tick_truck(t)
        self._tick_emergency()
        # gate queues
        for g in geo.GATES:
            q = sum(1 for o in self.orders if o.durum == "bekliyor" and (o.src == ("g", g) or o.dst == ("g", g)))
            key = f"kapi:{g}"
            if q >= 8:
                w.incidents.raise_once(key, "lojistik", L(f"Shipment queue at {geo.GATES[g]['ad']}", f"{geo.GATES[g]['ad']} sevkiyat kuyruğu"), "uyari",
                                       detay=L(f"{q} orders waiting at the gate", f"{q} sipariş kapıda bekliyor"),
                                       aksiyonlar=[L("Reroute to the other gate", "Diğer kapıya yönlendir"), L("Open the shared fleet pool", "Ortak filo havuzunu aç"),
                                                   L("Offer temporary storage to sites (marketplace)", "Tesislere geçici depo alanı (pazaryeri) öner")])
            elif q <= 3:
                w.incidents.resolve_key(key, "Kuyruk eridi")
        # drop stale waiting orders (8 hours)
        self.orders = [o for o in self.orders if not (o.durum == "bekliyor" and w.minute - o.created > 480 and o.tip != "simbiyoz")]

    def _account(self, t, dist):
        km = dist * geo.UNIT_KM
        loaded = t.state == "yuklu"
        for acc in (self.today, self.total):
            if loaded:
                acc["km_yuklu"] += km
            else:
                acc["km_bos"] += km
            acc["co2_kg"] += km * TRUCK_CO2_KM * (1.0 if loaded else 0.85)
            acc["yakit_tl"] += km * DIESEL_TL_KM
        w = self.w
        w.carbon_extra["lojistik_kg"] += km * TRUCK_CO2_KM * (1.0 if loaded else 0.85)
        if loaded:
            t.km_yuklu += km
        else:
            t.km_bos += km

    def _tick_truck(self, t):
        w = self.w
        if t.state in ("gidiyor", "yuklu", "donus"):
            arrived, dist = t.advance(SPEED)
            self._account(t, dist)
            if not arrived:
                return
            o = t.order
            if t.state == "gidiyor":
                t.loc = self.seg_of(o.src)
                t.state, t.wait = "yukleniyor", LOAD_MIN
                o.durum = "yukleniyor"
            elif t.state == "yuklu":
                t.loc = self.seg_of(o.dst)
                if self._blocked(o.dst):
                    t.state = "kuyrukta"
                    o.durum = "kuyrukta"
                else:
                    t.state, t.wait = "bosaltiyor", UNLOAD_MIN
                    o.durum = "bosaltiyor"
            elif t.state == "donus":
                t.loc = self.depot
                t.state = "bos"
        elif t.state == "yukleniyor":
            t.wait -= 1
            t.fill = min(1.0, t.order.yuk / 20)
            if t.wait <= 0:
                o = t.order
                t.state = "yuklu"
                o.durum = "yolda"
                t.go(geo.route(t.loc, self.seg_of(o.dst)))
        elif t.state == "kuyrukta":
            if not self._blocked(t.order.dst):
                t.state, t.wait = "bosaltiyor", UNLOAD_MIN
        elif t.state == "bosaltiyor":
            t.wait -= 1
            if t.wait <= 0:
                self._deliver(t)
        elif t.state == "bos" and not self.pool and t.loc is not self.depot:
            t.state = "donus"
            t.go(geo.route(t.loc, self.depot))

    def _deliver(self, t):
        w, o = self.w, t.order
        o.durum, o.teslim = "teslim", w.minute
        self.orders.remove(o)
        self.done.append(o)
        if len(self.done) > 60:
            del self.done[0]
        self.lead_times.append(o.teslim - o.created)
        if len(self.lead_times) > 200:
            del self.lead_times[0]
        for acc in (self.today, self.total):
            acc["teslim"] += 1
            acc["ton"] += o.yuk
            k = {"simbiyoz": "simbiyoz_sefer", "ic_tedarik": "ic_tedarik", "giris": "giris", "sevkiyat": "sevkiyat"}[o.tip]
            acc[k] += 1
        if o.tip == "simbiyoz":
            w.symbiosis.on_delivered(o)
        t.order, t.fill = None, 0.0
        if self.pool:
            t.state = "bos"
        else:
            t.state = "donus"
            t.go(geo.route(t.loc, self.depot))

    # -------- emergency vehicle --------
    def dispatch_emergency(self, factory, incident_id):
        e = self.emergency
        e.task = {"fabrika": factory.id, "olay": incident_id, "asama": "gidiyor", "bekle": 0}
        e.state = "gidiyor"
        e.go(geo.route(e.loc, factory.seg))

    def _tick_emergency(self):
        e, w = self.emergency, self.w
        if e.state == "gidiyor":
            arrived, _ = e.advance(EMERGENCY_SPEED)
            if arrived:
                f = w.fmap[e.task["fabrika"]]
                e.loc = f.seg
                e.state = "mudahale"
                e.task["bekle"] = 25
                w.incidents.on_emergency_arrival(e.task["olay"], f)
        elif e.state == "mudahale":
            e.task["bekle"] -= 1
            if e.task["bekle"] <= 0:
                w.incidents.on_emergency_done(e.task["olay"], w.fmap[e.task["fabrika"]])
                e.state = "donus"
                e.go(geo.route(e.loc, w.hq_seg))
        elif e.state == "donus":
            arrived, _ = e.advance(EMERGENCY_SPEED)
            if arrived:
                e.loc, e.state, e.task = w.hq_seg, "bos", None

    # -------- outputs --------
    def empty_ratio(self, acc=None):
        acc = acc or self.today
        tot = acc["km_yuklu"] + acc["km_bos"]
        return acc["km_bos"] / tot if tot else 0.0

    def live(self):
        tr = []
        for t in self.trucks + [self.emergency]:
            if t.state == "bos" and t.kind == "kamyon" and t.loc is self.depot:
                continue
            tr.append([t.id, round(t.x, 1), round(t.y, 1), t.state, round(t.fill, 2),
                       t.order.tip if t.order else (t.kind if t.kind != "kamyon" else "")])
        return {"araclar": tr, "bekleyen": sum(1 for o in self.orders if o.durum == "bekliyor"),
                "aktif": sum(1 for t in self.trucks if t.state != "bos"), "havuz": self.pool,
                "bos_oran": round(self.empty_ratio(), 3)}

    def detail(self):
        w = self.w
        states = {}
        for t in self.trucks:
            states[t.state] = states.get(t.state, 0) + 1
        lt = sorted(self.lead_times)
        return {**self.live(), "filo": len(self.trucks), "durumlar": states,
                "ort_teslim_dk": round(sum(lt) / len(lt), 1) if lt else None,
                "medyan_teslim_dk": lt[len(lt) // 2] if lt else None,
                "kapilar": {k: {"ad": v["ad"], "kapali": self.gate_blocked[k],
                                "kuyruk": sum(1 for o in self.orders if o.durum in ("bekliyor", "kuyrukta") and (o.src == ("g", k) or o.dst == ("g", k)))}
                            for k, v in geo.GATES.items()},
                "bugun": {k: round(v, 1) for k, v in self.today.items()},
                "toplam": {k: round(v, 1) for k, v in self.total.items()},
                "siparisler": [o.to(w) for o in self.orders[-40:]][::-1],
                "teslimler": [o.to(w) for o in self.done[-20:]][::-1],
                "kamyonlar": [{"id": t.id, "plaka": t.plaka, "durum": t.state, "doluluk": round(t.fill, 2),
                               "km_yuklu": round(t.km_yuklu, 1), "km_bos": round(t.km_bos, 1),
                               "is": t.order.id if t.order else None} for t in self.trucks]}
