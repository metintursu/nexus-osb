"""Central wastewater treatment plant and water reuse."""

LIMIT_KOI = 250.0   # discharge limit mg/L (simulated)


class Water:
    def __init__(self, w):
        peak = sum(f.s["su_kisi"] * f.calisan for f in w.factories) * 0.85 * 0.97
        self.capacity_m3h = round(peak * 1.06)
        self.reuse = 0.10
        self.cap_factor = 1.0
        self.inflow = self.koi_in = self.koi_out = self.util = self.power_kw = 0.0
        self.eff = 0.9
        self.over = 0
        self.today = self._zero()
        self.total = self._zero()
        self.hist = []

    @staticmethod
    def _zero():
        return {"giris_m3": 0.0, "geri_m3": 0.0, "temiz_m3": 0.0, "kirlilik_kg": 0.0, "tasarruf_tl": 0.0}

    def tick(self, w):
        tot_water = sum(f.water_m3h for f in w.factories)
        self.inflow = tot_water * 0.85
        load = sum(f.water_m3h * f.s["koi"] for f in w.factories)
        self.koi_in = load / tot_water if tot_water else 0
        self.util = self.inflow / (self.capacity_m3h * self.cap_factor)
        self.eff = max(0.45, min(0.94, 0.91 - max(0.0, self.util - 1.0) * 1.4 - (0.03 if w.mods["su"] > 1 else 0) + w.rng.gauss(0, 0.004)))
        self.koi_out = self.koi_in * (1 - self.eff)
        reused = self.inflow * self.reuse
        self.power_kw = self.inflow * 0.45 + reused * 0.6
        for acc in (self.today, self.total):
            acc["giris_m3"] += self.inflow / 60
            acc["geri_m3"] += reused / 60
            acc["temiz_m3"] += (tot_water - reused) / 60
            acc["kirlilik_kg"] += self.inflow / 60 * self.koi_out / 1000
            acc["tasarruf_tl"] += reused / 60 * (45.0 - 0.6 * w.tariff)
        if self.koi_out > LIMIT_KOI:
            self.over += 1
            if self.over == 10:
                w.incidents.raise_once("atiksu", "su", "COD limit exceeded at plant outlet", "uyari",
                                       detay=f"Outlet COD {self.koi_out:.0f} mg/L > {LIMIT_KOI:.0f} mg/L · load {self.util*100:.0f}%",
                                       aksiyonlar=["Divert high-COD sites (food, chemicals, textiles) to the equalisation basin",
                                                   "Run aeration blowers at 100%", "Take a sample and send it to the lab"])
        else:
            if self.over >= 10 and self.koi_out < LIMIT_KOI * 0.9:
                w.incidents.resolve_key("atiksu", "Outlet values back within limits")
            if self.koi_out < LIMIT_KOI * 0.9:
                self.over = 0
        if w.minute % 5 == 0:
            self.hist.append((w.minute, round(self.inflow), round(self.koi_out), round(self.util, 3)))
            if len(self.hist) > 288:
                del self.hist[0]

    def reset_day(self):
        self.today = self._zero()

    def live(self):
        return {"giris": round(self.inflow), "util": round(self.util, 3), "koi": round(self.koi_out), "geri": self.reuse}

    def detail(self, w):
        top = sorted(w.factories, key=lambda f: -f.water_m3h * f.s["koi"])[:6]
        return {**self.live(), "kapasite": self.capacity_m3h, "koi_giris": round(self.koi_in), "verim": round(self.eff, 3),
                "limit": LIMIT_KOI, "guc_kw": round(self.power_kw),
                "bugun": {k: round(v, 1) for k, v in self.today.items()},
                "toplam": {k: round(v, 1) for k, v in self.total.items()},
                "gecmis": self.hist[-144:],
                "kirletenler": [{"id": f.id, "ad": f.ad, "su": round(f.water_m3h, 1), "koi": f.s["koi"],
                                 "yuk_kg_h": round(f.water_m3h * 0.85 * f.s["koi"] / 1000, 1)} for f in top]}
