"""Zone power grid: solar farm, battery (BESS), biogas, substations, contracted capacity, demand response."""
from ..i18n import L, LANG, TN
import math

from . import geo


def _zero():
    return {"yuk_kwh": 0.0, "ges_kwh": 0.0, "sebeke_kwh": 0.0, "ihracat_kwh": 0.0, "bess_sarj_kwh": 0.0,
            "bess_desarj_kwh": 0.0, "biyogaz_kwh": 0.0, "fatura_tl": 0.0, "asim_kwh": 0.0, "karsilanamayan_kwh": 0.0,
            "kacinilan_co2_kg": 0.0, "tasarruf_bess_tl": 0.0, "pik_kw": 0.0, "dr_olay": 0}


class Energy:
    def __init__(self, w):
        total_rated = sum(f.rated_kw for f in w.factories)
        cfg = w.cfg
        self.ges_kwp = float(cfg.get("ges_kwp", 18000))
        self.bess_kwh = float(cfg.get("bess_kwh", 28000))
        self.bess_kw = float(cfg.get("bess_kw", self.bess_kwh / 2))
        self.soc = self.bess_kwh * 0.6
        self.contract_kw = round(total_rated * 0.78 / 500) * 500
        self.mode = "otomatik"          # otomatik (auto) | puant (peak only) | kapali (off)
        self.dr_enabled = True
        self.reserve = 0.30             # resilience reserve held for outages
        self.cloud = 0.9
        self.critical_ok = True
        self.tms = []
        for tm in geo.SUBSTATIONS:
            fs = [f for f in w.factories if f.tm == tm["id"]]
            cap = sum(f.rated_kw for f in fs) * 0.97
            self.tms.append({**tm, "kapasite_kw": round(cap / 100) * 100, "yuk_kw": 0.0, "oran": 0.0, "asim": 0,
                             "fabrikalar": [f.id for f in fs]})
        self.load_kw = self.solar_kw = self.grid_kw = self.bess_flow = self.biogas_kw = self.facility_kw = 0.0
        self.unserved_kw = 0.0
        self.over_contract_ticks = 0
        self.today = _zero()
        self.total = _zero()

    def sun(self, h):
        if h < 6.2 or h > 19.3:
            return 0.0
        return max(0.0, math.sin(math.pi * (h - 6.2) / 13.1)) ** 1.25

    def pre_tick(self, w):
        if not w.outage:
            self.critical_ok = True
            return
        crit = sum(f.power_kw for f in w.factories if f.s["kritik"]) + self.facility_kw
        avail = self.solar_kw + self.biogas_kw + (self.bess_kw if self.soc > self.bess_kwh * 0.06 else 0)
        self.critical_ok = avail >= crit * 0.9

    def tick(self, w):
        rng = w.rng
        if not w.real_weather:
            self.cloud += (0.88 - self.cloud) * 0.01 + rng.gauss(0, 0.015)
            self.cloud = max(0.35, min(1.0, self.cloud))
        h = w.hour
        lights = 180.0 if (h < 6.5 or h > 19) else 25.0
        self.facility_kw = w.water.power_kw + lights + 95.0
        self.load_kw = sum(f.power_kw for f in w.factories) + self.facility_kw
        self.biogas_kw = sum(f.gen_kw for f in w.factories)
        self.solar_kw = self.ges_kwp * self.sun(h) * self.cloud * w.mods["panel"]
        net = self.load_kw - self.solar_kw - self.biogas_kw
        soc_min, soc_max = self.bess_kwh * 0.08, self.bess_kwh * 0.95
        charge = discharge = 0.0
        self.unserved_kw = 0.0

        if w.outage:
            if net > 0:
                discharge = min(self.bess_kw, net, (self.soc - soc_min) * 60)
                self.unserved_kw = max(0.0, net - discharge)
            else:
                charge = min(self.bess_kw, -net, (soc_max - self.soc) * 60)
            grid = 0.0
        else:
            soc_min = max(soc_min, self.bess_kwh * self.reserve)
            if self.mode != "kapali":
                if net < 0:
                    charge = min(self.bess_kw, -net, (soc_max - self.soc) * 60)
                elif w.period == "puant":
                    discharge = min(self.bess_kw, net, (self.soc - soc_min) * 60)
                elif self.mode == "otomatik" and net > self.contract_kw * 0.97:
                    discharge = min(self.bess_kw, net - self.contract_kw * 0.97, (self.soc - soc_min) * 60)
                elif w.period == "gece" and self.soc < soc_max * 0.92:
                    charge = min(self.bess_kw * 0.55, (soc_max - self.soc) * 60)
                elif w.period == "gunduz" and self.mode == "otomatik" and self.soc < self.bess_kwh * 0.5 and net < self.contract_kw * 0.85:
                    charge = min(self.bess_kw * 0.3, (soc_max - self.soc) * 60)
            grid = net + charge - discharge

        self.soc += (charge * 0.94 - discharge) / 60
        self.soc = max(0.0, min(self.bess_kwh, self.soc))
        self.bess_flow = discharge - charge          # + discharge, - charge
        self.grid_kw = grid

        # trafo merkezleri
        for tm in self.tms:
            tm["yuk_kw"] = sum(w.fmap[i].power_kw for i in tm["fabrikalar"])
            tm["oran"] = tm["yuk_kw"] / tm["kapasite_kw"] if tm["kapasite_kw"] else 0
            key = f"trafo:{tm['id']}"
            if tm["oran"] > 1.0:
                tm["asim"] += 1
                if tm["asim"] == 3:
                    w.incidents.raise_once(key, "trafo", L(f"{tm['id']} substation overloaded", f"{tm['id']} trafo merkezi aşırı yükte"),
                                           "kritik" if tm["oran"] > 1.08 else "uyari",
                                           detay=L(f"Load {tm['oran']*100:.0f}% — {tm['yuk_kw']/1000:.1f} MW / {tm['kapasite_kw']/1000:.1f} MW", f"Yüklenme %{TN(tm['oran']*100, 0)} — {TN(tm['yuk_kw']/1000, 1)} MW / {TN(tm['kapasite_kw']/1000, 1)} MW"),
                                           aksiyonlar=[L("Shift flexible loads (foundry, metal, plastics, building) by 60 min", "Esnek yükleri (döküm, metal, plastik, yapı) 60 dk kaydır"),
                                                       L("Increase battery discharge", "Batarya deşarjını artır"), L("Send the maintenance crew to the substation", "Bakım ekibini trafo sahasına yönlendir")])
                    if self.dr_enabled:
                        n = self.demand_response(w, tm["fabrikalar"], 60)
                        w.incidents.note(key, L(f"Automatic demand response: load shifted at {n} sites", f"Otomatik talep tarafı katılım: {n} tesiste yük kaydırıldı"))
            else:
                if tm["asim"] and tm["oran"] < 0.96:
                    w.incidents.resolve_key(key, L("Load back to normal", "Yüklenme normale döndü"))
                if tm["oran"] < 0.99:
                    tm["asim"] = 0

        # contracted capacity
        if grid > self.contract_kw:
            self.over_contract_ticks += 1
            self.today["asim_kwh"] += (grid - self.contract_kw) / 60
            self.total["asim_kwh"] += (grid - self.contract_kw) / 60
            if self.over_contract_ticks == 5:
                w.incidents.raise_once("sozlesme", "enerji", L("Contracted capacity exceeded", "Sözleşme gücü aşılıyor"), "uyari",
                                       detay=L(f"Grid draw {grid/1000:.1f} MW > contract {self.contract_kw/1000:.1f} MW", f"Şebekeden çekiş {TN(grid/1000, 1)} MW > sözleşme {TN(self.contract_kw/1000, 1)} MW"),
                                       aksiyonlar=[L("Send a demand-response call", "Talep tarafı katılım çağrısı gönder"), L("Set battery mode to 'auto'", "Batarya modunu 'otomatik' yap"),
                                                   L("Stagger shift starts by 15 min", "Vardiya başlangıçlarını 15 dk kaydır")])
                if self.dr_enabled:
                    n = self.demand_response(w, None, 45)
                    w.incidents.note("sozlesme", L(f"Zone-wide demand response: {n} sites", f"Bölge geneli talep tarafı katılım: {n} tesis"))
        else:
            if self.over_contract_ticks >= 5 and grid < self.contract_kw * 0.95:
                w.incidents.resolve_key("sozlesme", L("Grid draw back below contract limit", "Çekiş sözleşme sınırının altına indi"))
            if grid < self.contract_kw * 0.95:
                self.over_contract_ticks = 0

        if self.unserved_kw > 1 and w.outage:
            w.incidents.raise_once("karsilanamayan", "enerji", L("Critical loads cannot be fully supplied", "Kritik yükler tam beslenemiyor"), "kritik",
                                   detay=L("During the outage, battery + solar cannot cover the critical load", "Kesinti sırasında batarya + GES kritik yükü karşılamıyor"),
                                   aksiyonlar=[L("Switch off non-critical auxiliary loads", "Kritik olmayan yardımcı yükleri kapat"), L("Start the generators", "Jeneratörleri devreye al")])

        # muhasebe
        tariff = w.tariff
        export = max(0.0, -grid)
        imp = max(0.0, grid)
        bill = imp / 60 * tariff - export / 60 * 1.6 + max(0.0, grid - self.contract_kw) / 60 * 1.6
        for acc in (self.today, self.total):
            acc["yuk_kwh"] += self.load_kw / 60
            acc["ges_kwh"] += self.solar_kw / 60
            acc["sebeke_kwh"] += imp / 60
            acc["ihracat_kwh"] += export / 60
            acc["bess_sarj_kwh"] += charge / 60
            acc["bess_desarj_kwh"] += discharge / 60
            acc["biyogaz_kwh"] += self.biogas_kw / 60
            acc["fatura_tl"] += bill
            acc["karsilanamayan_kwh"] += self.unserved_kw / 60
            acc["kacinilan_co2_kg"] += (self.solar_kw + self.biogas_kw) / 60 * w.grid_co2
            acc["tasarruf_bess_tl"] += (discharge * tariff - charge * 2.05) / 60
            acc["pik_kw"] = max(acc["pik_kw"], imp)

    def demand_response(self, w, ids, minutes):
        n = 0
        pool = [w.fmap[i] for i in ids] if ids else w.factories
        for f in pool:
            if f.s["esnek"] > 0 and f.status == "calisiyor" and f.dr == 0:
                f.dr, f.dr_until = f.s["esnek"], w.minute + minutes
                n += 1
        if n:
            self.today["dr_olay"] += 1
            self.total["dr_olay"] += 1
        return n

    def reset_day(self):
        self.today = _zero()

    def live(self):
        return {"yuk": round(self.load_kw), "ges": round(self.solar_kw), "sebeke": round(self.grid_kw),
                "bess": round(self.bess_flow), "soc": round(self.soc / self.bess_kwh, 3), "bio": round(self.biogas_kw),
                "sozlesme": self.contract_kw, "tm": [round(t["oran"], 3) for t in self.tms],
                "karsilanamayan": round(self.unserved_kw)}

    def detail(self, w):
        return {**self.live(), "ges_kwp": self.ges_kwp, "bess_kwh": self.bess_kwh, "bess_kw": self.bess_kw,
                "mod": self.mode, "dr_aktif": self.dr_enabled, "rezerv": self.reserve, "bulut": round(self.cloud, 2),
                "tarife": w.period, "fiyat": round(w.tariff, 2), "sebeke_co2": w.grid_co2,
                "tesis_kw": round(self.facility_kw),
                "trafolar": [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in t.items()} for t in self.tms],
                "bugun": {k: round(v, 1) for k, v in self.today.items()},
                "toplam": {k: round(v, 1) for k, v in self.total.items()},
                "dr_tesisler": [f.id for f in w.factories if f.dr > 0]}
