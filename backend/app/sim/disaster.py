"""Disaster mode: earthquake and chemical leak.

Earthquake: per-site damage by epicentre distance and magnitude, 40-min grid outage,
gas valves shut for 3 hours, reduced wastewater capacity, aftershocks, fire and technician dispatch.
Chemical leak: a gas cloud that grows downwind from the source and turns with the wind;
sites under the cloud are evacuated."""
import math

from . import geo

DAMAGE = {"agir": ("Earthquake — severe structural damage, site evacuated", 900, "kritik"),
          "orta": ("Earthquake — damage assessment under way", 240, "uyari"),
          "hafif": ("Earthquake — automatic safety stop, equipment check", 60, "bilgi")}


def start_quake(w):
    rng = w.rng
    x, y = rng.uniform(80, geo.W - 80), rng.uniform(60, geo.H - 60)
    M = round(rng.uniform(6.0, 6.9), 1)
    hasar = []
    people = 0
    for f in w.factories:
        d = math.hypot(f.cx - x, f.cy - y)
        score = (M - 5.3) - d / 560 + rng.gauss(0, 0.25)
        lvl = "agir" if score > 1.15 else "orta" if score > 0.75 else "hafif" if score > 0.3 else None
        if not lvl:
            continue
        text, dur, sev = DAMAGE[lvl]
        hasar.append([f.id, lvl])
        if lvl != "hafif":
            people += f.calisan if f.status == "calisiyor" else 0
        inc = w.incidents._new("deprem", f"Earthquake damage · {dict(agir='severe', orta='moderate', hafif='light')[lvl]}", sev, f.id, text,
                               ["Staff to the assembly point, take a roll call", "Initial check by a structural engineer", "Isolate gas and power"],
                               key=f"deprem:{f.id}")
        f.set_fault("durdu" if lvl != "hafif" else "ariza", w.minute + dur + rng.randint(-20, 40), text, inc["id"])
        if lvl != "hafif":
            w.masters.dispatch(f, "mekanik", inc)
    w.disaster = {"tip": "deprem", "x": round(x), "y": round(y), "M": M, "t0": w.minute, "hasar": hasar, "artci": [],
                  "tahliye_kisi": people}
    w.outage = True
    w.mods["gaz"] = 0.0
    w.water.cap_factor = 0.6
    w.incidents.raise_once("deprem", "deprem", f"M{M} earthquake · {len(hasar)} sites affected", "kritik",
                           detay=f"Epicentre {math.hypot(x - geo.W/2, y - geo.H/2)*geo.UNIT_KM:.1f} km from the zone centre · {people} people evacuated",
                           aksiyonlar=["Emergency Operations Centre activated", "Grid lost — critical loads in island mode",
                                       "All gas valves shut for 3 hours", "Technicians and fire brigade prioritised to damaged sites",
                                       "Status report to AFAD (disaster authority) and the grid operator"])
    heavy = [h[0] for h in hasar if h[1] == "agir"]
    if heavy and w.logistics.emergency.state == "bos":
        f = w.fmap[heavy[0]]
        inc = w.incidents._new("yangin", "Post-earthquake fire", "kritik", f.id, "Ignition on a damaged gas line",
                               ["Fire brigade dispatched", "Warn neighbouring parcels"], key=f"yangin:{f.id}")
        w.logistics.dispatch_emergency(f, inc["id"])
    w.log("afet", f"M{M} earthquake: {len(hasar)} sites affected, {len(heavy)} severely damaged")


def start_leak(w):
    rng = w.rng
    srcs = [f for f in w.factories if f.sektor == "kimya"] or w.factories
    f = rng.choice(srcs)
    # wind blows toward the zone centre (±35°) — worst-case scenario
    if not w.real_weather:      # with real weather on, the real wind is used
        w.wind["aci"] = math.atan2(geo.H / 2 - f.cy, geo.W / 2 - f.cx) + rng.uniform(-0.6, 0.6)
        w.wind["hiz"] = max(w.wind["hiz"], 4.0)
    inc = w.incidents._new("sizinti", "Chemical leak · toxic gas", "kritik", f.id, "Leak at a storage tank valve, the cloud is moving downwind",
                           ["HAZMAT team and fire brigade dispatched", "Evacuate downwind sites", "Shut down ventilation systems",
                            "Suppress the leak with foam / a water curtain"], key="sizinti")
    f.set_fault("durdu", w.minute + 240, "Chemical leak source", inc["id"])
    if w.logistics.emergency.state == "bos":
        w.logistics.dispatch_emergency(f, inc["id"])
    w.disaster = {"tip": "sizinti", "kaynak": f.id, "x": f.cx, "y": f.cy, "t0": w.minute, "uzunluk": 0, "genislik": 0,
                  "yon": w.wind["aci"], "etkilenen": [], "tahliye_kisi": 0}
    w.log("afet", f"Chemical leak: {f.ad}")


def tick(w):
    d = w.disaster
    if not d:
        return
    age = w.minute - d["t0"]
    rng = w.rng
    if d["tip"] == "deprem":
        if age == 40 and w.outage and not (w.scenario and w.scenario["key"] == "sebeke_kesintisi"):
            w.outage = False
            w.incidents.resolve_key("karsilanamayan", "Grid restored")
            w.log("afet", "Grid supply restored after the earthquake")
        if age == 180:
            w.mods["gaz"] = 1.0
            w.log("afet", "Gas valves reopened step by step")
        if age in (35, 110, 260):
            n = 0
            for f in rng.sample(w.factories, 4):
                if not f.fault and f.status == "calisiyor":
                    f.set_fault("ariza", w.minute + rng.randint(20, 50), "Aftershock — safety stop", None)
                    n += 1
            m = round(d["M"] - rng.uniform(1.2, 2.2), 1)
            d["artci"].append([w.minute, m])
            w.incidents.note("deprem", f"M{m} aftershock · safety stop at {n} sites")
    elif d["tip"] == "sizinti":
        grow = min(1.0, age / 40) if age < 120 else max(0.0, 1 - (age - 120) / 60)
        d["yon"] = w.wind["aci"]
        d["uzunluk"] = round(330 * grow * (0.7 + w.wind["hiz"] / 25), 1)
        d["genislik"] = round(d["uzunluk"] * 0.38, 1)
        ux, uy = math.cos(d["yon"]), math.sin(d["yon"])
        hit = []
        for f in w.factories:
            if f.id == d["kaynak"]:
                continue
            vx, vy = f.cx - d["x"], f.cy - d["y"]
            along = vx * ux + vy * uy
            perp = abs(-vx * uy + vy * ux)
            if 0 < along < d["uzunluk"] and perp < d["genislik"] * (along / max(d["uzunluk"], 1)) + 18:
                hit.append(f.id)
                if f.id not in d["etkilenen"]:
                    d["etkilenen"].append(f.id)
                    d["tahliye_kisi"] += f.calisan if f.status == "calisiyor" else 0
                    inc = w.incidents._new("sizinti", "Evacuation · under the chemical cloud", "uyari", f.id,
                                           f"Wind {w.wind['hiz']:.0f} m/s — cloud over the site",
                                           ["Move staff to the upwind assembly point", "Shut down ventilation"], key=f"tahliye:{f.id}")
                    f.set_fault("durdu", w.scenario["bitis"] + 20 if w.scenario else w.minute + 120, "Evacuation — chemical cloud", inc["id"])
        d["altinda"] = hit


def stop(w):
    d = w.disaster
    if not d:
        return
    if d["tip"] == "deprem":
        w.outage = False
        w.water.cap_factor = 1.0
        w.incidents.resolve_key("deprem", "Disaster mode closed; repairs continue at damaged sites")
    else:
        w.incidents.resolve_key("sizinti", "Cloud dispersed, readings normal")
        for fid in d["etkilenen"]:
            f = w.fmap[fid]
            if f.fault and "kimyasal" in f.fault[2]:
                f.fault = None
            w.incidents.resolve_key(f"tahliye:{fid}", "Evacuation ended")
        src = w.fmap[d["kaynak"]]
        if src.fault:
            src.set_fault("durdu", w.minute + 60, "Post-leak safety check", None)
    w.last_disaster = {**d, "bitis": w.minute}
    w.disaster = None
