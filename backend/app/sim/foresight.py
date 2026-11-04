"""Foresight: fast-forwarding copies of the zone for forecasts and parallel-universe comparisons.

Forecast  — N copies of the current state run 24 hours ahead with different random seeds (Monte Carlo);
            yields hourly means, a p10/p90 band and substation overload probabilities.
Universes — two copies from the same starting point run for days under different policies; results side by side."""
import copy
import time

MARGIN = 0.12      # default gross margin used to turn revenue change into profit

POLICIES = {
    "mevcut": {"ad": "Current settings", "aciklama": "Today's settings as they are"},
    "klasik": {"ad": "Classic zone", "aciklama": "Battery off, no demand response, no agents, no shared fleet, no symbiosis, no H2, 0% water reuse, autopilot off",
               "bess": "kapali", "dr": False, "havuz": False, "su": 0.0, "otopilot": False, "simbiyoz_kapat": True, "h2": False, "ajan": False,
               "ajan_kapali": True},
    "otopilot": {"ad": "NEXUS Autopilot", "aciklama": "Autopilot with all rules on; agents autonomous",
                 "bess": "otomatik", "dr": True, "otopilot": True, "ajan": True, "h2": True},
    "yesil": {"ad": "Max green", "aciklama": "Autopilot + 40% water reuse + H2 + every viable symbiosis link set up from the start",
              "bess": "otomatik", "dr": True, "havuz": True, "su": 0.40, "otopilot": True, "ajan": True, "h2": True, "simbiyoz_hepsi": True},
    "tasarruf": {"ad": "Energy savings only", "aciklama": "Battery + demand response on; logistics and circularity untouched",
                 "bess": "otomatik", "dr": True, "otopilot": False},
}


def clone(w):
    hooks = (w.logger, w.on_day)
    w.logger = w.on_day = None
    try:
        c = copy.deepcopy(w)
    finally:
        w.logger, w.on_day = hooks
    c.events = []
    for r in c.agents.rooms:          # pending negotiation callbacks belong to the real world; cancel them in the copy
        if r["durum"] == "suruyor":
            r["script"], r["durum"] = [], "basarisiz"
    return c


def apply_policy(c, key):
    p = POLICIES[key]
    if "bess" in p:
        c.energy.mode = p["bess"]
    if "dr" in p:
        c.energy.dr_enabled = p["dr"]
    if "havuz" in p:
        c.logistics.pool = p["havuz"]
    if "su" in p:
        c.water.reuse = p["su"]
    if "otopilot" in p:
        c.autopilot.enabled = p["otopilot"]
    if "ajan" in p:
        c.agents.otonom = p["ajan"]
    if p.get("ajan_kapali"):
        c.agents.enabled = False
    if "h2" in p:
        c.hydrogen.enabled = p["h2"]
    if p.get("simbiyoz_kapat"):
        for l in c.symbiosis.links:
            l["aktif"] = False
    if p.get("simbiyoz_hepsi"):
        for _ in range(12):
            ok = [o for o in c.symbiosis.opps if not o["yatirim_tl"] or o["geri_odeme_ay"] <= 36]
            if not ok:
                break
            c.symbiosis.approve(ok[0]["id"])
            c.symbiosis.compute_opps()


def _totals(c, start):
    fs = c.factories
    return {"fatura_tl": c.energy.total["fatura_tl"] - start["fatura"],
            "co2_t": (sum(f.total["co2_kg"] for f in fs) + c.carbon_extra["lojistik_kg"]) / 1000 - start["co2"],
            "kacinilan_t": (c.energy.total["kacinilan_co2_kg"] + c.hydrogen.total["kacinilan_co2_kg"]) / 1000 + c.symbiosis.total["co2_t"] - start["kac"],
            "asim_mwh": (c.energy.total["asim_kwh"] - start["asim"]) / 1000,
            "simbiyoz_tl": c.symbiosis.total["kazanc_tl"] - start["sim"],
            "bertaraf_t": c.symbiosis.total["bertaraf_t"] - start["ber"],
            "bos_km": c.logistics.total["km_bos"] - start["bos"],
            "yakit_tl": c.logistics.total["yakit_tl"] - start["yakit"],
            "su_m3": c.water.total["temiz_m3"] - start["su"],
            "durus_dk": sum(f.total["durus_dk"] for f in fs) - start["durus"],
            "ciro_tl": sum(f.total["ciro_tl"] for f in fs) - start["ciro"]}


def _start(c):
    fs = c.factories
    return {"fatura": c.energy.total["fatura_tl"], "co2": (sum(f.total["co2_kg"] for f in fs) + c.carbon_extra["lojistik_kg"]) / 1000,
            "kac": (c.energy.total["kacinilan_co2_kg"] + c.hydrogen.total["kacinilan_co2_kg"]) / 1000 + c.symbiosis.total["co2_t"],
            "asim": c.energy.total["asim_kwh"], "sim": c.symbiosis.total["kazanc_tl"], "ber": c.symbiosis.total["bertaraf_t"],
            "bos": c.logistics.total["km_bos"], "yakit": c.logistics.total["yakit_tl"], "su": c.water.total["temiz_m3"],
            "durus": sum(f.total["durus_dk"] for f in fs), "ciro": sum(f.total["ciro_tl"] for f in fs)}


def run_universe(c, key, days, seed):
    c.rng.seed(seed)
    apply_policy(c, key)
    st = _start(c)
    k0, a0 = c.autopilot.stats["karar"], c.agents.stats["anlasma"]
    series, health = [], []
    for i in range(int(days * 1440)):
        c.tick()
        if c.minute % 60 == 0:
            h = c.health()["skor"]
            health.append(h)
            series.append({"t": c.minute, "fatura": round((c.energy.total["fatura_tl"] - st["fatura"]) / 1e6, 3),
                           "co2": round(((sum(f.total["co2_kg"] for f in c.factories) + c.carbon_extra["lojistik_kg"]) / 1000 - st["co2"]), 1),
                           "saglik": h, "yuk": round(c.energy.load_kw / 1000, 1), "sebeke": round(c.energy.grid_kw / 1000, 1)})
    tot = _totals(c, st)
    tot["saglik_ort"] = round(sum(health) / len(health), 1) if health else None
    tot["otopilot_karar"] = c.autopilot.stats["karar"] - k0
    tot["ajan_anlasma"] = c.agents.stats["anlasma"] - a0
    return {"politika": key, "ad": POLICIES[key]["ad"], "aciklama": POLICIES[key]["aciklama"],
            "toplam": {k: round(v, 1) if isinstance(v, float) else v for k, v in tot.items()}, "seri": series}


def multiverse(snapshot_a, snapshot_b, a, b, days):
    t0 = time.time()
    seed = 1000 + snapshot_a.minute
    ra = run_universe(snapshot_a, a, days, seed)
    rb = run_universe(snapshot_b, b, days, seed)
    diff = {}
    for k, va in ra["toplam"].items():
        vb = rb["toplam"].get(k)
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
            diff[k] = round(vb - va, 1)
    A, B = ra["toplam"], rb["toplam"]
    parts = {"enerji_faturasi": A["fatura_tl"] - B["fatura_tl"], "simbiyoz": B["simbiyoz_tl"] - A["simbiyoz_tl"],
             "yakit": A["yakit_tl"] - B["yakit_tl"], "bertaraf": (A["bertaraf_t"] - B["bertaraf_t"]) * 1150,
             "su": (A["su_m3"] - B["su_m3"]) * 45, "uretim_marji": (B["ciro_tl"] - A["ciro_tl"]) * MARGIN}
    net = {"kalemler": {k: round(v) for k, v in parts.items()}, "toplam": round(sum(parts.values())),
           "yillik": round(sum(parts.values()) / days * 365), "marj": MARGIN}
    return {"a": ra, "b": rb, "fark": diff, "net": net, "gun": days, "sure_sn": round(time.time() - t0, 1)}


def forecast(snapshots, hours=24):
    runs = []
    for i, c in enumerate(snapshots):
        c.rng.seed(7000 + i * 31 + c.minute)
        rows = []
        for m in range(hours * 60):
            c.tick()
            if c.minute % 60 == 0:
                rows.append({"t": c.minute, "yuk": c.energy.load_kw / 1000, "sebeke": c.energy.grid_kw / 1000,
                             "ges": c.energy.solar_kw / 1000, "soc": c.energy.soc / c.energy.bess_kwh, "fiyat": c.tariff,
                             "tm": [t["oran"] for t in c.energy.tms], "koi": c.water.koi_out, "saglik": c.health()["skor"],
                             "kamyon": sum(1 for t in c.logistics.trucks if t.state != "bos")})
        runs.append(rows)
    out = []
    n = len(runs)
    for j in range(min(len(r) for r in runs)):
        col = [r[j] for r in runs]

        def stat(k):
            v = sorted(x[k] for x in col)
            return {"ort": round(sum(v) / n, 2), "p10": round(v[max(0, int(n * 0.1))], 2), "p90": round(v[min(n - 1, int(n * 0.9))], 2)}
        tm_risk = [round(sum(1 for x in col if x["tm"][k] > 1.0) / n, 2) for k in range(len(col[0]["tm"]))]
        contract = snapshots[0].energy.contract_kw / 1000
        out.append({"t": col[0]["t"], "yuk": stat("yuk"), "sebeke": stat("sebeke"), "ges": stat("ges"), "soc": stat("soc"),
                    "fiyat": round(col[0]["fiyat"], 2), "koi": stat("koi"), "saglik": stat("saglik"), "kamyon": stat("kamyon"),
                    "tm_risk": tm_risk, "asim_risk": round(sum(1 for x in col if x["sebeke"] > contract) / n, 2),
                    "koi_risk": round(sum(1 for x in col if x["koi"] > 250) / n, 2)})
    alerts = []
    for row in out:
        for k, p in enumerate(row["tm_risk"]):
            if p >= 0.3:
                alerts.append({"t": row["t"], "metin": f"TM-{k+1} overload probability {p*100:.0f}%", "seviye": "kritik" if p >= 0.6 else "uyari"})
        if row["asim_risk"] >= 0.5:
            alerts.append({"t": row["t"], "metin": f"Contract capacity breach probability {row['asim_risk']*100:.0f}%", "seviye": "uyari"})
        if row["koi_risk"] >= 0.3:
            alerts.append({"t": row["t"], "metin": f"Wastewater COD breach probability {row['koi_risk']*100:.0f}%", "seviye": "uyari"})
    return {"saatler": out, "uyarilar": alerts[:30], "kosu": n, "saat": hours}
