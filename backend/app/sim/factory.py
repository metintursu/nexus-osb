"""Minute-by-minute model of a single plant: shifts, load, power, gas, water, output, waste, carbon."""
from ..i18n import L, LANG
import math

from .data import SECTORS, GAS_CO2, GAS_PRICE, WATER_PRICE
from . import geo


def _zero():
    return {"kwh": 0.0, "gaz_m3": 0.0, "su_m3": 0.0, "uretim": 0.0, "co2_kg": 0.0, "kapsam1_kg": 0.0,
            "kapsam2_kg": 0.0, "maliyet_tl": 0.0, "ciro_tl": 0.0, "dr_kwh": 0.0, "durus_dk": 0.0}


class Factory:
    def __init__(self, fid, ad, sektor, parcel, calisan, vardiya, rng):
        s = SECTORS[sektor]
        self.id, self.ad, self.sektor, self.s = fid, ad, sektor, s
        self.parcel = parcel
        self.gaz_k, self.su_k = s["gaz_kisi"], s["su_kisi"]
        self.profile = None          # 24-hour load profile calibrated from real data (0–1)
        self.kalibre = None
        self.x, self.y, self.w, self.h = parcel["x"], parcel["y"], parcel["w"], parcel["h"]
        self.cx, self.cy = round(self.x + self.w / 2, 1), round(self.y + self.h / 2, 1)
        self.block = (parcel["c"], parcel["r"])
        self.seg = geo.access_segment(self.cx, self.cy, *self.block)
        self.calisan, self.vardiya = calisan, vardiya
        self.rated_kw = s["kw_kisi"] * calisan
        self.rate_h = s["uretim_kisi_saat"] * calisan
        self.oee_base = rng.uniform(0.68, 0.86)
        self.oee = self.oee_base
        self.tm = None
        self.rng = rng
        self.phase = rng.uniform(0, 6.28)
        self.fault = None            # (status, end_minute, reason, incident_id)
        self.status, self.reason = "bosta", ""
        self.load = 0.15
        self.power_kw = self.prod_min = self.gas_m3h = self.water_m3h = self.co2_kgh = 0.0
        self.dr, self.dr_until = 0.0, 0
        self.today, self.total = _zero(), _zero()
        self.waste_stock = {w: 0.0 for w in s["atik"]}
        self.waste_today = {w: 0.0 for w in s["atik"]}
        self.input_stock = {w: 0.0 for w in s["kabul"]}
        self.received_total = {w: 0.0 for w in s["kabul"]}
        self.gen_kw = 0.0            # biogas plant output
        self.canli, self.canli_until, self.canli_data = False, 0, {}
        self.hist = []               # (dk, kW, oee)

    # ------------------------------------------------------------
    def in_shift(self, h):
        if self.profile:
            return self.profile[int(h) % 24] >= 0.3
        if self.vardiya == 1:
            return 8 <= h < 17
        if self.vardiya == 2:
            return 6 <= h < 22
        return True

    def set_fault(self, durum, bitis, neden, olay_id=None):
        self.fault = (durum, bitis, neden, olay_id)

    def tick(self, w):
        m, h, s, rng = w.minute, w.hour, self.s, self.rng
        if self.fault and self.fault[1] <= m:
            self.fault = None
        if m >= self.dr_until:
            self.dr = 0.0

        # status
        if self.fault:
            self.status, self.reason = self.fault[0], self.fault[2]
        elif w.outage and not (s["kritik"] and w.energy.critical_ok):
            self.status, self.reason = "durdu", L("Grid outage — load shed", "Şebeke kesintisi — yük atıldı")
        elif self.in_shift(h):
            self.status, self.reason = "calisiyor", ""
        else:
            self.status, self.reason = "bosta", L("Off shift", "Vardiya dışı")

        # target load
        if self.status == "calisiyor" and self.profile:
            tgt = self.profile[int(h) % 24] * (1 + 0.04 * math.sin(m / 37 + self.phase)) + rng.gauss(0, 0.015)
            tgt *= w.mods["talep"].get(self.sektor, 1.0)
        elif self.status == "bosta" and self.profile:
            tgt = self.profile[int(h) % 24]
        elif self.status == "calisiyor":
            tgt = 0.86 + 0.07 * math.sin(m / 37 + self.phase) + rng.gauss(0, 0.02)
            tgt *= w.mods["talep"].get(self.sektor, 1.0)
            if s["gaz_kisi"] >= 0.7 and w.mods["gaz"] < 1:
                tgt *= 0.55 + 0.45 * w.mods["gaz"]
        else:
            tgt = {"bosta": 0.14, "ariza": 0.28, "bakim": 0.22, "durdu": 0.03}[self.status]
        self.load += (max(0.0, min(1.15, tgt)) - self.load) * 0.25
        eff = self.load * (1 - self.dr)

        producing = self.status == "calisiyor"
        if producing:
            self.oee += (self.oee_base - self.oee) * 0.05 + rng.gauss(0, 0.004)
        else:
            self.oee += (self.oee_base * 0.6 - self.oee) * 0.05
        self.oee = max(0.3, min(0.95, self.oee))

        self.power_kw = self.rated_kw * eff * w.mods["sogutma"] * w.wx["sogutma"]
        # demand response mostly sheds auxiliary/deferrable loads (compressors, pre-heating, pumps);
        # its effect on output is ~25% of the curtailed power
        self.prod_min = self.rate_h / 60 * self.load * (1 - self.dr * 0.25) * self.oee if producing else 0.0
        self.gas_m3h = self.gaz_k * self.calisan * eff * w.mods["gaz"] * w.wx["isitma"]
        if self.sektor in ("dokum", "metal") and w.hydrogen.frac > 0:
            self.gas_m3h *= 1 - w.hydrogen.frac
        self.water_m3h = self.su_k * self.calisan * (0.3 + 0.7 * eff) * w.mods["su"] * w.wx["su"]

        # live data (REST/MQTT) overrides the model
        if self.canli and m < self.canli_until:
            d = self.canli_data
            if "power_kw" in d:
                self.power_kw = float(d["power_kw"])
            if "uretim_dk" in d:
                self.prod_min = float(d["uretim_dk"])
            if "durum" in d and d["durum"] in ("calisiyor", "bosta", "ariza", "bakim", "durdu"):
                self.status = d["durum"]
            if "oee" in d:
                self.oee = float(d["oee"])
        elif self.canli and m >= self.canli_until:
            self.canli = False

        # biogas plant: turns organic waste into electricity
        if self.sektor == "biyogaz":
            org = self.input_stock.get("organik", 0.0)
            used = min(org, 0.04)
            self.input_stock["organik"] = org - used
            self.gen_kw = used * 220 * 60       # 220 kWh/t
            self.prod_min = used * 220

        # waste generation
        if producing or eff > 0.2:
            k = self.calisan / 100 / 1440 * (eff / 0.9)
            for wt, amt in s["atik"].items():
                g = amt * k
                self.waste_stock[wt] += g
                self.waste_today[wt] += g

        # accounting (per minute)
        kwh = self.power_kw / 60
        gaz = self.gas_m3h / 60
        su = self.water_m3h / 60
        k1 = gaz * GAS_CO2
        k2 = kwh * w.grid_co2
        cost = kwh * w.tariff + gaz * GAS_PRICE * w.mods["gaz_fiyat"] + su * WATER_PRICE
        rev = self.prod_min * s["fiyat"]
        self.co2_kgh = (k1 + k2) * 60
        for acc in (self.today, self.total):
            acc["kwh"] += kwh
            acc["gaz_m3"] += gaz
            acc["su_m3"] += su
            acc["uretim"] += self.prod_min
            acc["kapsam1_kg"] += k1
            acc["kapsam2_kg"] += k2
            acc["co2_kg"] += k1 + k2
            acc["maliyet_tl"] += cost
            acc["ciro_tl"] += rev
            acc["dr_kwh"] += self.rated_kw * self.load * self.dr / 60
            if self.status in ("ariza", "durdu", "bakim"):
                acc["durus_dk"] += 1
        if m % 5 == 0:
            self.hist.append((m, round(self.power_kw), round(self.oee, 3)))
            if len(self.hist) > 288:
                del self.hist[0]

    # ------------------------------------------------------------
    def reset_day(self):
        self.today = _zero()
        self.waste_today = {w: 0.0 for w in self.s["atik"]}

    def static(self):
        return {"id": self.id, "ad": self.ad, "sektor": self.sektor, "sektor_ad": self.s["ad"], "renk": self.s["renk"],
                "kalibre": bool(self.kalibre), "ada": [self.parcel["c"], self.parcel["r"]], "parsel": self.parcel["slot"],
                "x": self.x, "y": self.y, "w": self.w, "h": self.h, "cx": self.cx, "cy": self.cy,
                "calisan": self.calisan, "vardiya": self.vardiya, "tm": self.tm, "kurulu_kw": round(self.rated_kw),
                "urun": self.s["urun"], "birim": self.s["birim"], "kritik": self.s["kritik"]}

    def live(self):
        return {"id": self.id, "d": self.status, "kw": round(self.power_kw), "oee": round(self.oee, 3),
                "co2": round(self.co2_kgh), "dr": self.dr > 0, "canli": self.canli}

    def detail(self, w):
        t = self.today
        ic = t["ciro_tl"] / 1000 if t["ciro_tl"] > 0 else 0
        return {**self.static(), **self.live(), "neden": self.reason, "yuk": round(self.load, 3),
                "gaz_m3h": round(self.gas_m3h, 1), "su_m3h": round(self.water_m3h, 1),
                "uretim_saat": round(self.prod_min * 60, 1),
                "bugun": {k: round(v, 1) for k, v in t.items()},
                "toplam": {k: round(v, 1) for k, v in self.total.items()},
                "co2_yogunluk": round(t["co2_kg"] / ic, 2) if ic else None,
                "atik_stok": {k: round(v, 2) for k, v in self.waste_stock.items()},
                "atik_bugun": {k: round(v, 2) for k, v in self.waste_today.items()},
                "alinan_girdi": {k: round(v, 2) for k, v in self.received_total.items()},
                "kabul": self.s["kabul"], "ihracat": self.s["ihracat"], "skdm": self.s["skdm"],
                "gecmis": self.hist[-144:]}
