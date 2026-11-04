"""Industrial symbiosis: one plant's waste is another plant's raw material.

Continuously scans for opportunities, runs approved links by truck (or pipeline for heat),
and tracks money earned, CO2 avoided and tonnes diverted from landfill.
"""
from ..i18n import L, LANG
from . import geo
from .data import WASTE, BERTARAF_TL_T, TRUCK_LOAD_T, HEAT_PIPE_MAX_UNITS, DIESEL_TL_KM

PIPE_TL_PER_UNIT = 85000   # investment for 10 m of insulated pipeline (TRY)


class Symbiosis:
    def __init__(self, w):
        self.w = w
        self.links = []
        self.opps = []
        self._n = 0
        self.today = self._zero()
        self.total = self._zero()

    @staticmethod
    def _zero():
        return {"geri_t": 0.0, "isi_mwh": 0.0, "kazanc_tl": 0.0, "co2_t": 0.0, "bertaraf_t": 0.0,
                "bertaraf_tl": 0.0, "kayip_isi_mwh": 0.0}

    def _linked(self, fid, wt):
        return any(l["aktif"] and l["ureten"] == fid and l["atik"] == wt for l in self.links)

    def compute_opps(self):
        w = self.w
        out = []
        for f in w.factories:
            for wt, rate in f.s["atik"].items():
                if rate <= 0 or self._linked(f.id, wt):
                    continue
                lf = {1: 0.35, 2: 0.6, 3: 0.85}[f.vardiya]
                daily = rate * f.calisan / 100 * lf
                cands = []
                for g in w.factories:
                    if g is f or wt not in g.s["kabul"]:
                        continue
                    d = geo.manhattan((f.cx, f.cy), (g.cx, g.cy))
                    info = WASTE[wt]
                    if info["boru"] and d > HEAT_PIPE_MAX_UNITS:
                        continue
                    km = d * geo.UNIT_KM
                    monthly = daily * 30
                    if info["boru"]:
                        transport = 0.0
                        capex = d * PIPE_TL_PER_UNIT
                        value = monthly * info["deger"]
                    else:
                        transport = monthly / TRUCK_LOAD_T * km * 2 * DIESEL_TL_KM
                        capex = 0.0
                        value = monthly * (info["deger"] * 0.6 + BERTARAF_TL_T)
                    save = value - transport
                    payback = round(capex / save, 1) if capex and save > 0 else 0
                    cands.append({"id": f"{f.id}>{wt}>{g.id}", "ureten": f.id, "ureten_ad": f.ad, "alan": g.id, "alan_ad": g.ad,
                                  "atik": wt, "atik_ad": info["ad"], "birim": info["birim"], "mesafe_km": round(km, 2),
                                  "aylik_miktar": round(monthly, 1), "aylik_kazanc_tl": round(save),
                                  "aylik_co2_t": round(monthly * info["co2"], 1), "yatirim_tl": round(capex),
                                  "geri_odeme_ay": payback, "tasima": L("pipeline", "boru hattı") if info["boru"] else L("truck", "kamyon")})
                cands.sort(key=lambda c: -c["aylik_kazanc_tl"])
                out.extend(cands[:2])
        out.sort(key=lambda c: -c["aylik_kazanc_tl"])
        top = out[:36]
        seen = {c["atik"] for c in top}
        for c in out[36:]:
            if c["atik"] not in seen:
                top.append(c)
                seen.add(c["atik"])
        self.opps = top

    def approve(self, opp_id):
        o = next((x for x in self.opps if x["id"] == opp_id), None)
        if not o:
            return None
        if self._linked(o["ureten"], o["atik"]):
            return None
        self._n += 1
        link = {**o, "lid": f"SB{self._n:03d}", "aktif": True, "baslangic": self.w.minute, "aktarilan": 0.0,
                "kazanc_tl": 0.0, "co2_t": 0.0, "sefer": 0, "bekleyen": False}
        self.links.append(link)
        self.opps = [x for x in self.opps if not (x["ureten"] == o["ureten"] and x["atik"] == o["atik"])]
        self.w.log("simbiyoz", L(f"Symbiosis link created: {o['ureten_ad']} → {o['alan_ad']} ({o['atik_ad']})", f"Simbiyoz bağlantısı kuruldu: {o['ureten_ad']} → {o['alan_ad']} ({o['atik_ad']})"))
        return link

    def stop(self, lid):
        for l in self.links:
            if l["lid"] == lid and l["aktif"]:
                l["aktif"] = False
                self.w.log("simbiyoz", L(f"Symbiosis link stopped: {l['lid']}", f"Simbiyoz bağlantısı durduruldu: {l['lid']}"))
                return l
        return None

    def _credit(self, link, amt):
        w = self.w
        info = WASTE[link["atik"]]
        g = w.fmap[link["alan"]]
        if link["atik"] in g.input_stock:
            g.input_stock[link["atik"]] += amt
            g.received_total[link["atik"]] += amt
        if info["boru"]:
            gain = amt * info["deger"]
        else:
            gain = amt * (info["deger"] * 0.6 + BERTARAF_TL_T) - link["mesafe_km"] * 2 * DIESEL_TL_KM
        co2 = amt * info["co2"]
        link["aktarilan"] += amt
        link["kazanc_tl"] += gain
        link["co2_t"] += co2
        for acc in (self.today, self.total):
            if info["boru"]:
                acc["isi_mwh"] += amt
            else:
                acc["geri_t"] += amt
            acc["kazanc_tl"] += gain
            acc["co2_t"] += co2

    def tick(self):
        w = self.w
        for l in self.links:
            if not l["aktif"]:
                continue
            p = w.fmap[l["ureten"]]
            stock = p.waste_stock.get(l["atik"], 0.0)
            if WASTE[l["atik"]]["boru"]:
                if stock > 0 and w.fmap[l["alan"]].status == "calisiyor":
                    p.waste_stock[l["atik"]] = 0.0
                    self._credit(l, stock)
            elif stock >= TRUCK_LOAD_T and not l["bekleyen"]:
                p.waste_stock[l["atik"]] -= TRUCK_LOAD_T
                l["bekleyen"] = True
                w.logistics.create_order("simbiyoz", ("f", p.id), ("f", l["alan"]), TRUCK_LOAD_T, WASTE[l["atik"]]["ad"], l["lid"])

    def on_delivered(self, order):
        l = next((x for x in self.links if x["lid"] == order.link_id), None)
        if l:
            l["bekleyen"] = False
            l["sefer"] += 1
            self._credit(l, order.yuk)

    def daily_disposal(self):
        """End of day: stock without a link goes to disposal."""
        for f in self.w.factories:
            for wt, amt in f.waste_stock.items():
                if self._linked(f.id, wt) or amt <= 0:
                    continue
                for acc in (self.today, self.total):
                    if WASTE[wt]["boru"]:
                        acc["kayip_isi_mwh"] += amt
                    else:
                        acc["bertaraf_t"] += amt
                        acc["bertaraf_tl"] += amt * BERTARAF_TL_T
                f.waste_stock[wt] = 0.0

    def reset_day(self):
        self.today = self._zero()

    def detail(self):
        w = self.w
        gen = {}
        for f in w.factories:
            for wt, amt in f.waste_today.items():
                gen[wt] = gen.get(wt, 0.0) + amt
        reused_rate = 0.0
        tg = sum(v for k, v in gen.items() if not WASTE[k]["boru"])
        if tg:
            linked = sum(f.waste_today.get(l["atik"], 0) for l in self.links if l["aktif"] and not WASTE[l["atik"]]["boru"]
                         for f in [w.fmap[l["ureten"]]])
            reused_rate = min(1.0, linked / tg)
        return {"baglantilar": [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in l.items()} for l in self.links],
                "firsatlar": self.opps,
                "bugun": {k: round(v, 2) for k, v in self.today.items()},
                "toplam": {k: round(v, 2) for k, v in self.total.items()},
                "uretim_bugun": {k: {"ad": WASTE[k]["ad"], "miktar": round(v, 2), "birim": WASTE[k]["birim"], "renk": WASTE[k]["renk"]}
                                 for k, v in gen.items()},
                "geri_kazanim_orani": round(reused_rate, 3)}

    def live(self):
        return [[l["ureten"], l["alan"], l["atik"]] for l in self.links if l["aktif"]]
