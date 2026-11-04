"""Kapasite pazaryeri: tesisler boş makine saati, depo, laboratuvar, parsel vb. paylaşır."""
from .data import RESOURCES


class Market:
    def __init__(self, w):
        self.w = w
        self.offers, self.demands, self.contracts = [], [], []
        self._n = 0
        self.total = {"sozlesme": 0, "hacim_tl": 0.0, "tasarruf_tl": 0.0}
        for _ in range(7):
            self._new_offer()
        for _ in range(6):
            self._new_demand()
        for p in w.empty_parcels[:3]:
            self._n += 1
            area = int(p["w"] * p["h"] * 100 * 0.6)
            self.offers.append({"id": f"T{self._n:04d}", "kaynak": "parsel", "ad": RESOURCES["parsel"][0] if "parsel" in RESOURCES else "Boş parsel",
                                "birim": "m²·ay", "miktar": area, "fiyat": 95, "veren": "osb", "veren_ad": "OSB Yönetimi",
                                "zaman": w.minute, "not": f"Ada {p['c']+1}-{p['r']+1} boş parsel, altyapı hazır"})

    def _qty(self, key):
        u = RESOURCES[key][1]
        rng = self.w.rng
        if u == "saat":
            return rng.choice([20, 40, 60, 80, 120])
        if u in ("m²·ay",):
            return rng.choice([300, 500, 800, 1200, 2000])
        if u == "palet·ay":
            return rng.choice([40, 80, 120, 200])
        if u == "gün":
            return rng.choice([5, 10, 20])
        return rng.choice([10, 20, 40])

    def _new_offer(self):
        w, rng = self.w, self.w.rng
        key = rng.choice(list(RESOURCES))
        ad, birim, fiyat, sectors = RESOURCES[key]
        cand = [f for f in w.factories if f.sektor in sectors]
        if not cand:
            return
        f = min(rng.sample(cand, min(3, len(cand))), key=lambda x: x.oee)
        self._n += 1
        self.offers.append({"id": f"T{self._n:04d}", "kaynak": key, "ad": ad, "birim": birim, "miktar": self._qty(key),
                            "fiyat": round(fiyat * rng.uniform(0.85, 1.05)), "veren": f.id, "veren_ad": f.ad,
                            "zaman": w.minute, "not": f"Atıl kapasite · OEE %{f.oee*100:.0f}"})

    def _new_demand(self):
        w, rng = self.w, self.w.rng
        key = rng.choice(list(RESOURCES))
        ad, birim, fiyat, sectors = RESOURCES[key]
        cand = [f for f in w.factories if f.sektor not in sectors and f.sektor != "biyogaz"]
        if not cand:
            return
        f = rng.choice(cand)
        self._n += 1
        self.demands.append({"id": f"I{self._n:04d}", "kaynak": key, "ad": ad, "birim": birim, "miktar": self._qty(key),
                             "azami_fiyat": round(fiyat * rng.uniform(1.0, 1.3)), "isteyen": f.id, "isteyen_ad": f.ad,
                             "zaman": w.minute, "not": rng.choice(["Acil sipariş", "Kapasite açığı", "Bakım dönemi yedeği",
                                                                    "Yeni müşteri projesi", "Sezonluk talep"])})

    def tick(self):
        w, rng = self.w, self.w.rng
        if rng.random() < 1 / 120:
            self._new_offer()
        if rng.random() < 1 / 130:
            self._new_demand()
        ttl = 1440 * 3
        self.offers = [o for o in self.offers if w.minute - o["zaman"] < ttl or o["veren"] == "osb"]
        self.demands = [d for d in self.demands if w.minute - d["zaman"] < ttl]

    def matches(self):
        out = []
        for d in self.demands:
            for o in self.offers:
                if o["kaynak"] != d["kaynak"] or o["veren"] == d["isteyen"] or o["fiyat"] > d["azami_fiyat"]:
                    continue
                q = min(o["miktar"], d["miktar"])
                out.append({"teklif": o["id"], "talep": d["id"], "kaynak": o["ad"], "veren_ad": o["veren_ad"],
                            "isteyen_ad": d["isteyen_ad"], "miktar": q, "birim": o["birim"], "fiyat": o["fiyat"],
                            "hacim_tl": q * o["fiyat"], "tasarruf_tl": round(q * (d["azami_fiyat"] * 1.25 - o["fiyat"]))})
        out.sort(key=lambda m: -m["tasarruf_tl"])
        return out

    def match(self, oid, did):
        o = next((x for x in self.offers if x["id"] == oid), None)
        d = next((x for x in self.demands if x["id"] == did), None)
        if not o or not d or o["kaynak"] != d["kaynak"]:
            return None
        q = min(o["miktar"], d["miktar"])
        self._n += 1
        c = {"id": f"K{self._n:04d}", "kaynak": o["ad"], "veren_ad": o["veren_ad"], "isteyen_ad": d["isteyen_ad"],
             "miktar": q, "birim": o["birim"], "fiyat": o["fiyat"], "hacim_tl": q * o["fiyat"],
             "tasarruf_tl": round(q * (d["azami_fiyat"] * 1.25 - o["fiyat"])), "zaman": self.w.minute}
        self.contracts.append(c)
        o["miktar"] -= q
        d["miktar"] -= q
        self.offers = [x for x in self.offers if x["miktar"] > 0]
        self.demands = [x for x in self.demands if x["miktar"] > 0]
        self.total["sozlesme"] += 1
        self.total["hacim_tl"] += c["hacim_tl"]
        self.total["tasarruf_tl"] += c["tasarruf_tl"]
        self.w.log("pazaryeri", f"Kapasite sözleşmesi: {c['veren_ad']} → {c['isteyen_ad']} · {c['kaynak']} {q} {c['birim']}")
        return c

    def detail(self):
        return {"teklifler": self.offers[::-1], "talepler": self.demands[::-1], "eslesmeler": self.matches()[:20],
                "sozlesmeler": self.contracts[::-1][:30], "toplam": {k: round(v) for k, v in self.total.items()},
                "kaynaklar": {k: {"ad": v[0], "birim": v[1], "fiyat": v[2]} for k, v in RESOURCES.items()}}
