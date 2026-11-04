"""NEXUS OSB world model — runs every subsystem together on each simulated minute."""
import math
import random

from . import geo
from .data import (SECTORS, SECTOR_COUNTS, NAME_PREFIX, NAME_SUFFIX, WASTE, SCENARIOS, TARIFF, GRID_CO2,
                   EU_CO2_EUR, EUR_TL)
from .factory import Factory
from .energy import Energy
from .water import Water
from .logistics import Logistics
from .symbiosis import Symbiosis
from .market import Market
from .incidents import Incidents
from .hydrogen import Hydrogen
from .masters import Masters
from .autopilot import Autopilot
from .agents import Agents
from . import disaster as afet

STATUS_EN = {"calisiyor": "running", "bosta": "off shift", "ariza": "fault", "bakim": "maintenance", "durdu": "stopped"}

DEFAULT_MODS = {"talep": {}, "gaz": 1.0, "gaz_fiyat": 1.0, "fiyat": 1.0, "sogutma": 1.0, "su": 1.0, "panel": 1.0,
                "lojistik": 1.0}


class World:
    def __init__(self, seed=42, logger=None, cfg=None):
        self.cfg = cfg or {}
        geo.configure(self.cfg)
        self.name = self.cfg.get("ad") or "NEXUS Demo Zone"
        self.rng = random.Random(seed)
        self.minute = 0
        self.logger = logger
        self.on_day = None
        self.events = []                       # recent event feed (UI)
        self.mods = {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULT_MODS.items()}
        self.outage = False
        self.scenario = None                   # {"key","bitis","baslangic"}
        self.scenario_log = []
        self.carbon_extra = {"lojistik_kg": 0.0}
        self.carbon_today_extra = {"lojistik_kg": 0.0}
        self.disaster = None
        self.last_disaster = None
        self.wind = {"aci": self.rng.uniform(0, 2 * math.pi), "hiz": 4.0}
        self.wx = {"sogutma": 1.0, "isitma": 1.0, "su": 1.0}    # real-weather multipliers
        self.real_prices = None      # 24-hour real electricity price ₺/kWh (incl. network fees) or None
        self.real_weather = None     # 24-hour real weather {bulut, sicaklik, ruzgar, ruzgar_yon} or None
        self._build()
        self.energy = Energy(self)
        self.water = Water(self)
        self.incidents = Incidents(self)
        self.logistics = Logistics(self)
        self.symbiosis = Symbiosis(self)
        self.market = Market(self)
        self.hydrogen = Hydrogen(self, self.h2_parcel)
        self.masters = Masters(self)
        self.autopilot = Autopilot(self)
        self.agents = Agents(self)
        self.history = []
        self.days = []
        self.insights = []
        self.symbiosis.compute_opps()
        # start with the three best links already running
        for pick in (lambda o: o["tasima"] == "pipeline", lambda o: o["atik"] == "organik",
                     lambda o: o["tasima"] == "truck"):
            cand = [o for o in self.symbiosis.opps if pick(o)]
            if cand:
                self.symbiosis.approve(cand[0]["id"])
        self.symbiosis.compute_opps()

    # ------------------------------------------------------------------ kurulum
    def _build(self):
        rng = self.rng
        parcels = geo.parcels()
        hq = parcels.pop(0)                    # Block 1-1, first parcel: zone management + fire station
        self.hq = {"ad": "Zone Management · Fire Station · Emergency Centre", **hq}
        hcx, hcy = hq["x"] + hq["w"] / 2, hq["y"] + hq["h"] / 2
        self.hq_seg = geo.access_segment(hcx, hcy, hq["c"], hq["r"])
        fac = geo.facilities()["aritma"]
        ax, ay = fac["x"] + fac["w"] / 2, fac["y"] + fac["h"] / 2
        bio_parcel = min(parcels, key=lambda p: abs(p["x"] - ax) + abs(p["y"] - ay))
        parcels.remove(bio_parcel)
        tesisler = self.cfg.get("tesisler")
        self.factories = []
        if tesisler:
            bio_used = False
            free = list(parcels) + [bio_parcel]
            pmap = {(p["c"], p["r"], p["slot"]): p for p in free}
            placed, pending = [], []
            for t in tesisler:
                sek = t.get("sektor") if t.get("sektor") in SECTORS else "otomotiv"
                key = (t.get("ada") or [None, None]) + [t.get("parsel")]
                p = pmap.pop(tuple(key), None) if key[0] is not None and key[2] is not None else None
                (placed if p else pending).append((t, sek, p))
            rest = [p for p in pmap.values()]
            rng.shuffle(rest)
            for i, (t, sek, p) in enumerate(placed + pending):
                if p is None:
                    if not rest:
                        break
                    p = rest.pop()
                lo, hi = SECTORS[sek]["calisan"]
                emp = int(t.get("calisan") or (int(rng.randint(lo, hi) / 10) * 10))
                vard = int(t.get("vardiya") or rng.choice(SECTORS[sek]["vardiya"]))
                ad = (t.get("ad") or f"Site {i+1}").strip()[:40]
                self.factories.append(Factory(f"F{i+1:02d}", ad, sek, p, max(10, emp), max(1, min(3, vard)), rng))
            used = {(f.parcel["c"], f.parcel["r"], f.parcel["slot"]) for f in self.factories}
            parcels = [p for p in rest if (p["c"], p["r"], p["slot"]) not in used]
        else:
            rng.shuffle(parcels)
            sectors = []
            for s, n in SECTOR_COUNTS.items():
                if s != "biyogaz":
                    sectors += [s] * n
            rng.shuffle(sectors)
            names = list(NAME_PREFIX)
            rng.shuffle(names)
            for i, s in enumerate(sectors):
                if not parcels:
                    break
                p = parcels.pop()
                lo, hi = SECTORS[s]["calisan"]
                emp = int(rng.randint(lo, hi) / 10) * 10
                ad = f"{names[i % len(names)]} {NAME_SUFFIX[s]}"
                self.factories.append(Factory(f"F{i+1:02d}", ad, s, p, emp, rng.choice(SECTORS[s]["vardiya"]), rng))
            bio = Factory(f"F{len(self.factories)+1:02d}", "Zone Biogas Plant", "biyogaz", bio_parcel, 25, 3, rng)
            self.factories.append(bio)
        doks = [f for f in self.factories if f.sektor in ("dokum", "metal")] or self.factories
        self.h2_parcel = None
        if parcels and self.cfg.get("hidrojen", True):
            self.h2_parcel = min(parcels, key=lambda p: min(abs(p["x"] - f.x) + abs(p["y"] - f.y) for f in doks))
            parcels.remove(self.h2_parcel)
        self.empty_parcels = parcels
        self.fmap = {f.id: f for f in self.factories}
        for f in self.factories:
            f.tm = min(geo.SUBSTATIONS, key=lambda t: geo.manhattan((t["x"], t["y"]), (f.cx, f.cy)))["id"]

    # ------------------------------------------------------------------ zaman
    @property
    def hour(self):
        return (self.minute % 1440) / 60

    @property
    def day(self):
        return self.minute // 1440 + 1

    @property
    def period(self):
        if self.real_prices:
            # with real prices the band comes from the day's price ranking: 5 most expensive hours = peak, 8 cheapest = night
            p = self.real_prices
            cur = p[int(self.hour) % 24]
            rank = sum(1 for x in p if x < cur)
            return "puant" if rank >= 19 else "gece" if rank < 8 else "gunduz"
        h = self.hour
        if h >= 22 or h < 6:
            return "gece"
        if 17 <= h < 22:
            return "puant"
        return "gunduz"

    @property
    def tariff(self):
        if self.real_prices:
            return self.real_prices[int(self.hour) % 24] * self.mods["fiyat"]
        return TARIFF[self.period] * self.mods["fiyat"]

    def _wx_at(self, key):
        rw = self.real_weather
        h = self.hour
        a, b = rw[int(h) % 24], rw[(int(h) + 1) % 24]
        if a.get(key) is None or b.get(key) is None:
            return a.get(key)
        f = h - int(h)
        return a[key] + (b[key] - a[key]) * f

    def _apply_weather(self):
        if not self.real_weather:
            self.wx = {"sogutma": 1.0, "isitma": 1.0, "su": 1.0}
            return
        cc, t, ws, wd = self._wx_at("bulut"), self._wx_at("sicaklik"), self._wx_at("ruzgar"), self._wx_at("ruzgar_yon")
        if cc is not None:
            self.energy.cloud = max(0.2, 1 - 0.75 * cc / 100)
        if t is not None:
            self.wx = {"sogutma": 1 + max(0.0, t - 24) * 0.011, "isitma": 1 + max(0.0, 12 - t) * 0.012, "su": 1 + max(0.0, t - 25) * 0.015}
        if ws is not None and wd is not None:
            b = math.radians(wd + 180)          # meteorological "coming from" → heading towards
            self.wind = {"aci": math.atan2(-math.cos(b), math.sin(b)), "hiz": max(0.5, ws)}

    @property
    def grid_co2(self):
        return GRID_CO2[self.period]

    def clock(self):
        m = self.minute % 1440
        return f"{m // 60:02d}:{m % 60:02d}"

    # ------------------------------------------------------------------ logging
    def log(self, kind, text, data=None):
        ev = {"t": self.minute, "saat": self.clock(), "gun": self.day, "tur": kind, "metin": text}
        self.events.append(ev)
        if len(self.events) > 200:
            del self.events[0]
        if self.logger:
            self.logger(ev, data)

    def place_name(self, place):
        kind, key = place
        if kind == "f":
            return self.fmap[key].ad
        if kind == "g":
            return geo.GATES[key]["ad"]
        return "Logistics Hub"

    def export_cfg(self):
        """Exports the current zone as a config dict the Zone Designer can read."""
        base = {k: v for k, v in self.cfg.items() if k != "tesisler"}
        base.setdefault("ad", self.name)
        base.setdefault("sutun", geo.COLS)
        base.setdefault("satir", geo.ROWS)
        base["tesisler"] = [{"ad": f.ad, "sektor": f.sektor, "calisan": f.calisan, "vardiya": f.vardiya,
                             "ada": [f.parcel["c"], f.parcel["r"]], "parsel": f.parcel["slot"]} for f in self.factories]
        return base

    def _port_gate(self):
        return "bati" if "bati" in geo.GATES else list(geo.GATES)[0]

    # ------------------------------------------------------------------ senaryolar
    def start_scenario(self, key):
        if key not in SCENARIOS:
            return None
        self.stop_scenario("New scenario started")
        sc = SCENARIOS[key]
        self.scenario = {"key": key, "ad": sc["ad"], "baslangic": self.minute, "bitis": self.minute + sc["sure"]}
        m = self.mods
        if key == "sebeke_kesintisi":
            self.outage = True
            self.incidents.raise_once("kesinti", "enerji", "National grid supply lost", "kritik",
                                      detay="No voltage at the main substation; island mode active",
                                      aksiyonlar=["Critical loads (food cold chain, chemicals, wastewater) running on solar + battery",
                                                  "Controlled-stop order sent to non-critical sites",
                                                  "Ask the grid operator for an estimated restoration time"])
        elif key == "enerji_zammi":
            m["fiyat"] = 1.4
        elif key == "dogalgaz_kisinti":
            m["gaz"] = 0.5
            m["gaz_fiyat"] = 1.6
        elif key == "ihracat_siparisi":
            m["talep"] = {"otomotiv": 1.12, "metal": 1.12, "dokum": 1.12}
            m["lojistik"] = 1.35
        elif key == "sicak_hava":
            m["sogutma"], m["su"], m["panel"] = 1.12, 1.25, 0.92
        elif key == "liman_grevi":
            self.logistics.gate_blocked[self._port_gate()] = True
        elif key == "deprem":
            afet.start_quake(self)
        elif key == "kimyasal_sizinti":
            afet.start_leak(self)
        self.log("senaryo", f"Scenario started: {sc['ad']}")
        return self.scenario

    def stop_scenario(self, why="Scenario time is up"):
        if not self.scenario:
            return
        key = self.scenario["key"]
        self.scenario_log.append({**self.scenario, "gercek_bitis": self.minute})
        self.mods = {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULT_MODS.items()}
        if key == "sebeke_kesintisi":
            self.outage = False
            self.incidents.resolve_key("kesinti", "Grid supply restored")
            self.incidents.resolve_key("karsilanamayan", "Grid supply restored")
        if key == "liman_grevi":
            self.logistics.gate_blocked[self._port_gate()] = False
        if key in ("deprem", "kimyasal_sizinti"):
            afet.stop(self)
        self.log("senaryo", f"Senaryo bitti: {self.scenario['ad']} ({why})")
        self.scenario = None

    # ------------------------------------------------------------------ main loop
    def tick(self):
        self.minute += 1
        if self.scenario and self.minute >= self.scenario["bitis"]:
            self.stop_scenario()
        if self.real_weather:
            self._apply_weather()
        else:
            self.wx = {"sogutma": 1.0, "isitma": 1.0, "su": 1.0}
            self.wind["aci"] += self.rng.gauss(0, 0.012)
            self.wind["hiz"] = max(1.0, min(11.0, self.wind["hiz"] + self.rng.gauss(0, 0.08)))
        afet.tick(self)
        self.energy.pre_tick(self)
        for f in self.factories:
            f.tick(self)
        self.hydrogen.tick(self)
        self.water.tick(self)
        self.energy.tick(self)
        self.logistics.tick()
        self.masters.tick()
        self.symbiosis.tick()
        self.market.tick()
        self.incidents.tick()
        self.agents.tick()
        self.autopilot.tick()
        if self.minute % 5 == 0:
            self._sample()
        if self.minute % 30 == 0:
            self.insights = self._insights()
        if self.minute % 60 == 0:
            self.symbiosis.compute_opps()
        if self.minute % 1440 == 0:
            self._day_rollover()

    def _sample(self):
        e = self.energy
        self.history.append({
            "t": self.minute, "yuk": round(e.load_kw / 1000, 2), "ges": round(e.solar_kw / 1000, 2),
            "sebeke": round(e.grid_kw / 1000, 2), "bess": round(e.bess_flow / 1000, 2), "soc": round(e.soc / e.bess_kwh, 3),
            "bio": round(e.biogas_kw / 1000, 2), "co2": round(sum(f.co2_kgh for f in self.factories) / 1000, 2),
            "uretim": round(sum(f.prod_min * f.s["fiyat"] for f in self.factories) * 60 / 1e6, 3),
            "su": round(self.water.inflow), "koi": round(self.water.koi_out),
            "kamyon": sum(1 for t in self.logistics.trucks if t.state != "bos"),
            "tm": [round(t["oran"], 3) for t in e.tms], "fiyat": round(self.tariff, 2),
            "oee": round(sum(f.oee for f in self.factories if f.sektor != "biyogaz") / (len(self.factories) - 1), 3),
        })
        if len(self.history) > 288 * 3:
            del self.history[0]

    def _day_rollover(self):
        self.symbiosis.daily_disposal()
        summary = self.day_summary(final=True)
        self.days.append(summary)
        if len(self.days) > 60:
            del self.days[0]
        if self.on_day:
            self.on_day(summary)
        self.log("rapor", f"Day {summary['gun']} closed · {summary['enerji_mwh']} MWh · {summary['co2_t']} tCO2 · health {summary['saglik']}")
        for f in self.factories:
            f.reset_day()
        self.energy.reset_day()
        self.water.reset_day()
        self.hydrogen.reset_day()
        self.logistics.today = self.logistics._zero()
        self.symbiosis.reset_day()
        self.carbon_today_extra = {"lojistik_kg": 0.0}
        self._log_start_extra = dict(self.carbon_extra)

    # ------------------------------------------------------------------ karbon
    def carbon(self):
        fs = [f for f in self.factories]
        k1 = sum(f.today["kapsam1_kg"] for f in fs)
        k2 = sum(f.today["kapsam2_kg"] for f in fs)
        start = getattr(self, "_log_start_extra", {"lojistik_kg": 0.0})
        lj = self.carbon_extra["lojistik_kg"] - start["lojistik_kg"]
        tesis = self.energy.facility_kw  # instantaneous
        avoided = (self.energy.today["kacinilan_co2_kg"] + self.hydrogen.today["kacinilan_co2_kg"]) / 1000 + self.symbiosis.today["co2_t"]
        rows = []
        for f in fs:
            ciro = f.today["ciro_tl"]
            exp_t_year = f.today["co2_kg"] / 1000 / max(self.hour / 24, 0.05) * 365 * f.s["ihracat"]
            rows.append({"id": f.id, "ad": f.ad, "sektor": f.s["ad"], "renk": f.s["renk"],
                         "co2_t": round(f.today["co2_kg"] / 1000, 2), "kapsam1_t": round(f.today["kapsam1_kg"] / 1000, 2),
                         "kapsam2_t": round(f.today["kapsam2_kg"] / 1000, 2),
                         "yogunluk": round(f.today["co2_kg"] / (ciro / 1000), 2) if ciro > 100 else None,
                         "anlik_kgh": round(f.co2_kgh), "skdm": f.s["skdm"],
                         "skdm_eur_yil": round(exp_t_year * EU_CO2_EUR) if f.s["skdm"] else 0})
        rows.sort(key=lambda r: -r["co2_t"])
        base = self.days[0]["co2_t"] if self.days else None
        hist = [{"gun": d["gun"], "co2_t": d["co2_t"], "kacinilan_t": d["kacinilan_t"]} for d in self.days[-14:]]
        sk = sum(r["skdm_eur_yil"] for r in rows)
        return {"bugun_t": round((k1 + k2) / 1000 + lj / 1000, 2), "kapsam1_t": round(k1 / 1000, 2),
                "kapsam2_t": round(k2 / 1000, 2), "lojistik_t": round(lj / 1000, 2), "kacinilan_t": round(avoided, 2),
                "anlik_th": round(sum(f.co2_kgh for f in fs) / 1000, 2), "sebeke_yogunluk": self.grid_co2,
                "fabrikalar": rows, "baz_gun_t": base, "gunluk": hist,
                "skdm_toplam_eur": sk, "skdm_toplam_tl": round(sk * EUR_TL), "ab_fiyat": EU_CO2_EUR,
                "hedef_2030": "-30% (vs. baseline day)"}

    # ------------------------------------------------------------------ skorlar
    def health(self):
        e, lg, sy = self.energy, self.logistics, self.symbiosis
        parts = {}
        over = sum(1 for t in e.tms if t["oran"] > 1.0)
        pen = e.today["asim_kwh"] / max(e.today["sebeke_kwh"], 1)
        parts["enerji"] = max(0, round(100 - over * 12 - min(35, pen * 600) - (30 if self.outage else 0)))
        parts["lojistik"] = max(0, round(100 - lg.empty_ratio() * 90 - min(25, lg.live()["bekleyen"] * 1.5)))
        rr = sy.detail()["geri_kazanim_orani"]
        parts["dongusel"] = max(0, min(100, round(35 + rr * 130 + len([l for l in sy.links if l["aktif"]]) * 4)))
        c = self.incidents.counts()
        parts["guvenlik"] = max(0, 100 - c["kritik"] * 22 - c["uyari"] * 6)
        parts["su"] = max(0, round(100 - max(0, self.water.koi_out - 150) * 0.4 - max(0, self.water.util - 0.9) * 120))
        oee = sum(f.oee for f in self.factories if f.sektor != "biyogaz") / (len(self.factories) - 1)
        parts["verimlilik"] = round(min(100, oee / 0.85 * 100))
        wts = {"enerji": 0.22, "lojistik": 0.14, "dongusel": 0.16, "guvenlik": 0.2, "su": 0.12, "verimlilik": 0.16}
        total = round(sum(parts[k] * v for k, v in wts.items()))
        return {"skor": total, "parcalar": parts}

    def kpis(self):
        fs = self.factories
        e = self.energy
        ftoday = lambda k: sum(f.today[k] for f in fs)
        st = {}
        for f in fs:
            st[f.status] = st.get(f.status, 0) + 1
        on_shift = sum(f.calisan for f in fs if f.status == "calisiyor")
        return {"guc_mw": round(e.load_kw / 1000, 2), "ges_mw": round(e.solar_kw / 1000, 2),
                "sebeke_mw": round(e.grid_kw / 1000, 2), "soc": round(e.soc / e.bess_kwh, 3),
                "enerji_mwh": round(e.today["yuk_kwh"] / 1000, 1), "fatura_tl": round(e.today["fatura_tl"]),
                "co2_t": round(ftoday("co2_kg") / 1000, 1), "co2_anlik": round(sum(f.co2_kgh for f in fs) / 1000, 2),
                "ciro_tl": round(ftoday("ciro_tl")), "uretim_saat_tl": round(sum(f.prod_min * f.s["fiyat"] for f in fs) * 60),
                "vardiyada": on_shift, "calisan": sum(f.calisan for f in fs), "durumlar": st,
                "su_m3h": round(self.water.inflow), "kamyon": sum(1 for t in self.logistics.trucks if t.state != "bos"),
                "simbiyoz_tl": round(self.symbiosis.total["kazanc_tl"]), "simbiyoz_bugun_tl": round(self.symbiosis.today["kazanc_tl"]),
                "kacinilan_t": round((self.energy.today["kacinilan_co2_kg"] + self.hydrogen.today["kacinilan_co2_kg"]) / 1000 + self.symbiosis.today["co2_t"], 1),
                "oee": round(sum(f.oee for f in fs if f.sektor != "biyogaz") / (len(fs) - 1), 3),
                "tarife": self.period, "fiyat": round(self.tariff, 2)}

    def day_summary(self, final=False):
        fs = self.factories
        e, lg, sy, wt = self.energy, self.logistics, self.symbiosis, self.water
        h = self.health()
        d = self.day - (1 if final else 0)
        co2 = sum(f.today["co2_kg"] for f in fs) / 1000
        return {"gun": d, "enerji_mwh": round(e.today["yuk_kwh"] / 1000, 1), "ges_mwh": round(e.today["ges_kwh"] / 1000, 1),
                "sebeke_mwh": round(e.today["sebeke_kwh"] / 1000, 1), "fatura_tl": round(e.today["fatura_tl"]),
                "pik_mw": round(e.today["pik_kw"] / 1000, 1), "asim_kwh": round(e.today["asim_kwh"]),
                "co2_t": round(co2, 1), "kacinilan_t": round(e.today["kacinilan_co2_kg"] / 1000 + sy.today["co2_t"], 1),
                "ciro_tl": round(sum(f.today["ciro_tl"] for f in fs)), "su_m3": round(wt.today["giris_m3"]),
                "geri_su_m3": round(wt.today["geri_m3"]), "teslim": lg.today["teslim"],
                "bos_km_orani": round(lg.empty_ratio(), 3), "lojistik_km": round(lg.today["km_yuklu"] + lg.today["km_bos"]),
                "simbiyoz_t": round(sy.today["geri_t"], 1), "simbiyoz_tl": round(sy.today["kazanc_tl"]),
                "bertaraf_t": round(sy.today["bertaraf_t"], 1), "durus_dk": round(sum(f.today["durus_dk"] for f in fs)),
                "olay": sum(1 for i in self.incidents.items if i["zaman"] >= (self.minute // 1440 - (1 if final else 0)) * 1440),
                "saglik": h["skor"]}

    # ------------------------------------------------------------------ Zone Brain (rule-based insights)
    def _insights(self):
        out = []
        e, lg, sy, wt = self.energy, self.logistics, self.symbiosis, self.water
        worst = max(e.tms, key=lambda t: t["oran"])
        if worst["oran"] > 0.93:
            out.append({"seviye": "uyari", "modul": "enerji", "baslik": f"{worst['id']} near its limit: {worst['oran']*100:.0f}%",
                        "metin": f"The {len(worst['fabrikalar'])} sites on {worst['id']} draw {worst['yuk_kw']/1000:.1f} MW. "
                                 "Shifting flexible loads by 30–60 min prevents an overload event.",
                        "aksiyon": {"tip": "dr", "etiket": "Start load shifting"}})
        if e.mode == "kapali":
            out.append({"seviye": "uyari", "modul": "enerji", "baslik": "Battery disabled",
                        "metin": "With the BESS off, the whole peak-hour load comes from the grid. Auto mode saves the peak price gap every day.",
                        "aksiyon": {"tip": "bess", "etiket": "Set battery to auto"}})
        if self.period == "gunduz" and e.solar_kw > 2000 and e.soc / e.bess_kwh < 0.55:
            out.append({"seviye": "bilgi", "modul": "enerji", "baslik": "Prepare for the peak",
                        "metin": f"Battery at {e.soc/e.bess_kwh*100:.0f}%. Charging it with surplus solar before the 17:00 peak band is recommended."})
        er = lg.empty_ratio()
        if not lg.pool and er > 0.3:
            out.append({"seviye": "uyari", "modul": "lojistik", "baslik": f"{er*100:.0f}% of truck km are driven empty",
                        "metin": "Trucks return to the depot after every delivery. With the shared fleet pool, they take the nearest next job instead; empty km, fuel and CO2 drop.",
                        "aksiyon": {"tip": "havuz", "etiket": "Open shared fleet pool"}})
        if sy.opps:
            o = sy.opps[0]
            out.append({"seviye": "firsat", "modul": "simbiyoz", "baslik": f"{o['atik_ad']}: ≈₺{o['aylik_kazanc_tl']/1000:,.0f}k per month",
                        "metin": f"{o['ureten_ad']} → {o['alan_ad']} ({o['mesafe_km']} km, {o['tasima']}). "
                                 f"{o['aylik_miktar']} {o['birim']} reused per month, {o['aylik_co2_t']} tCO2 avoided.",
                        "aksiyon": {"tip": "simbiyoz", "id": o["id"], "etiket": "Approve link"}})
        if wt.util > 0.97 or wt.koi_out > 220:
            out.append({"seviye": "uyari", "modul": "su", "baslik": f"Wastewater plant at {wt.util*100:.0f}%",
                        "metin": f"Outlet COD {wt.koi_out:.0f} mg/L. Food/chemical discharges should be diverted to the equalisation basin."})
        if wt.reuse < 0.2:
            out.append({"seviye": "firsat", "modul": "su", "baslik": "Water reuse can be increased",
                        "metin": f"Reuse is at {wt.reuse*100:.0f}%. Raising it to 25% saves ≈{wt.inflow*24*0.15:,.0f} m³ of fresh water per day.",
                        "aksiyon": {"tip": "su", "etiket": "Set reuse to 25%"}})
        m = self.market.matches()
        if m:
            x = m[0]
            out.append({"seviye": "firsat", "modul": "pazaryeri", "baslik": f"Capacity match: {x['kaynak']}",
                        "metin": f"Idle capacity at {x['veren_ad']} covers {x['isteyen_ad']}'s request · {x['miktar']} {x['birim']} · estimated saving ₺{x['tasarruf_tl']:,}",
                        "aksiyon": {"tip": "pazar", "teklif": x["teklif"], "talep": x["talep"], "etiket": "Create contract"}})
        low = sorted([f for f in self.factories if f.status == "calisiyor" and f.sektor != "biyogaz"], key=lambda f: f.oee)[:1]
        for f in low:
            if f.oee < 0.7:
                out.append({"seviye": "bilgi", "modul": "fabrika", "baslik": f"{f.ad}: OEE {f.oee*100:.0f}%",
                            "metin": "Lowest equipment effectiveness in the zone. Review downtime causes with the Digital Master records.",
                            "fabrika": f.id})
        crb = sorted(self.factories, key=lambda f: -f.co2_kgh)[0]
        out.append({"seviye": "bilgi", "modul": "karbon", "baslik": f"Highest current emissions: {crb.ad}",
                    "metin": f"{crb.co2_kgh/1000:.1f} tCO2/hour. {'Covered by EU CBAM — carbon cost risk on exports.' if crb.s['skdm'] else 'Waste-heat recovery and electrification are the top candidates.'}",
                    "fabrika": crb.id})
        return out

    # ------------------------------------------------------------------ outputs
    def static(self):
        fac = geo.facilities()
        return {"harita": {"w": geo.W, "h": geo.H, "xs": geo.XS, "ys": geo.YS, "yollar": geo.roads(), "olcek_km": geo.UNIT_KM},
                "kapilar": geo.GATES, "trafolar": geo.SUBSTATIONS, "tesisler": fac, "yonetim": self.hq,
                "bos_parseller": self.empty_parcels, "fabrikalar": [f.static() for f in self.factories],
                "sektorler": {k: {"ad": v["ad"], "renk": v["renk"], "kisa": v["kisa"]} for k, v in SECTORS.items()},
                "atiklar": WASTE, "senaryolar": SCENARIOS, "sozlesme_kw": self.energy.contract_kw,
                "hidrojen": {"ad": "Hydrogen Valley · electrolyser + 12 MWp solar", **self.h2_parcel} if self.h2_parcel else None,
                "bolge_ad": self.name, "ges_kwp": self.energy.ges_kwp, "bess_kwh": self.energy.bess_kwh,
                "ustalar": [{"id": m["id"], "ad": m["ad"]} for m in self.masters.items], "filo": len(self.logistics.trucks)}

    def live(self):
        sc = None
        if self.scenario:
            sc = {**self.scenario, "kalan": self.scenario["bitis"] - self.minute}
        return {"t": self.minute, "gun": self.day, "saat": self.clock(), "f": [f.live() for f in self.factories],
                "e": self.energy.live(), "l": self._lv(), "s": self.symbiosis.live(), "su": self.water.live(),
                "k": self.kpis(), "o": self.incidents.counts(), "sc": sc, "kesinti": self.outage,
                "saglik": self.health()["skor"], "olay_son": self.events[-1] if self.events else None,
                "oa": [[i["fabrika"], i["seviye"], i["tip"]] for i in self.incidents.open() if i["fabrika"]],
                "ap": self.autopilot.enabled, "h2": self.hydrogen.live(), "afet": self.disaster,
                "ruzgar": {"aci": round(self.wind["aci"], 3), "hiz": round(self.wind["hiz"], 1)},
                "gercek": {"fiyat": bool(self.real_prices), "hava": bool(self.real_weather),
                           "sicaklik": round(self._wx_at("sicaklik"), 1) if self.real_weather and self._wx_at("sicaklik") is not None else None,
                           "bulut": round(self._wx_at("bulut")) if self.real_weather and self._wx_at("bulut") is not None else None},
                "canli_tesis": sum(1 for f in self.factories if f.canli),
                "msg": self.agents.live_last(), "ap_son": self.autopilot.log[-1] if self.autopilot.log else None}

    def _lv(self):
        lv = self.logistics.live()
        lv["araclar"] = lv["araclar"] + self.masters.live()
        return lv

    def context_text(self):
        """Short status summary for the Zone Brain (LLM)."""
        k = self.kpis()
        e = self.energy
        h = self.health()
        lines = [f"Time: day {self.day} {self.clock()} · tariff band {dict(gece='night', gunduz='day', puant='peak')[self.period]} ({self.tariff:.2f} TRY/kWh)",
                 f"Zone health score {h['skor']}/100 · sub-scores {h['parcalar']} (enerji=energy, lojistik=logistics, dongusel=circularity, guvenlik=safety, su=water, verimlilik=efficiency)",
                 f"Load {k['guc_mw']} MW, solar {k['ges_mw']} MW, grid {k['sebeke_mw']} MW, battery {k['soc']*100:.0f}%, contract {e.contract_kw/1000:.1f} MW",
                 "Substations: " + ", ".join(f"{t['id']} {t['oran']*100:.0f}%" for t in e.tms),
                 f"Today: energy {k['enerji_mwh']} MWh, bill {k['fatura_tl']:,} TRY, CO2 {k['co2_t']} t, revenue {k['ciro_tl']:,} TRY, CO2 avoided {k['kacinilan_t']} t",
                 f"Logistics: {k['kamyon']} active trucks, empty-km share {self.logistics.empty_ratio()*100:.0f}%, shared pool {'on' if self.logistics.pool else 'off'}",
                 f"Wastewater: {self.water.inflow:.0f} m3/h, load {self.water.util*100:.0f}%, outlet COD {self.water.koi_out:.0f} mg/L, reuse {self.water.reuse*100:.0f}%",
                 f"Symbiosis: {sum(1 for l in self.symbiosis.links if l['aktif'])} active links, total gain {self.symbiosis.total['kazanc_tl']:,.0f} TRY",
                 f"Scenario: {self.scenario['ad'] if self.scenario else 'none'}" + (f" · disaster: {self.disaster['tip']}" if self.disaster else ""),
                 f"Autopilot: {'on' if self.autopilot.enabled else 'off'} ({self.autopilot.stats['karar']} decisions) · agent deals {self.agents.stats['anlasma']}",
                 f"Hydrogen: store {self.hydrogen.store_kg:.0f} kg, foundry/metal gas substitution {self.hydrogen.frac*100:.0f}%",
                 f"Technician pool: {sum(1 for m in self.masters.items if m['durum'] == 'musait')}/{len(self.masters.items)} available, downtime saved {self.masters.total['kazanilan_dk']:.0f} min",
                 "Open incidents: " + ("; ".join(f"[{i['seviye']}] {i['baslik']} {i['fabrika_ad'] or ''}" for i in self.incidents.open()[:8]) or "none"),
                 "Plants (name, sector, status, kW, OEE, tCO2/h): " + "; ".join(
                     f"{f.ad} ({f.s['kisa']}, {STATUS_EN.get(f.status, f.status)}, {f.power_kw:.0f}, {f.oee*100:.0f}%, {f.co2_kgh/1000:.2f})" for f in self.factories),
                 "Key insights: " + " | ".join(i["baslik"] for i in self.insights[:6])]
        return "\n".join(lines)
