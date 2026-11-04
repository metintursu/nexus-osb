"""Disaster mode: earthquake and chemical leak.

Earthquake: per-site damage by epicentre distance and magnitude, 40-min grid outage,
gas valves shut for 3 hours, reduced wastewater capacity, aftershocks, fire and technician dispatch.
Chemical leak: a gas cloud that grows downwind from the source and turns with the wind;
sites under the cloud are evacuated."""
from ..i18n import L, LANG, TN
import math

from . import geo

DAMAGE = {"agir": (L("Earthquake — severe structural damage, site evacuated", "Deprem — ağır yapısal hasar, tesis tahliye edildi"), 900, "kritik"),
          "orta": (L("Earthquake — damage assessment under way", "Deprem — hasar tespiti yapılıyor"), 240, "uyari"),
          "hafif": (L("Earthquake — automatic safety stop, equipment check", "Deprem — otomatik emniyet duruşu, ekipman kontrolü"), 60, "bilgi")}


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
        inc = w.incidents._new("deprem", L(f"Earthquake damage · {dict(agir='severe', orta='moderate', hafif='light')[lvl]}", f"Deprem hasarı · {'ağır' if lvl == 'agir' else lvl}"), sev, f.id, text,
                               [L("Staff to the assembly point, take a roll call", "Personel toplanma alanına, yoklama al"), L("Initial check by a structural engineer", "Yapı mühendisi ön inceleme"), L("Isolate gas and power", "Doğalgaz ve enerji izolasyonu")],
                               key=f"deprem:{f.id}")
        f.set_fault("durdu" if lvl != "hafif" else "ariza", w.minute + dur + rng.randint(-20, 40), text, inc["id"])
        if lvl != "hafif":
            w.masters.dispatch(f, "mekanik", inc)
    w.disaster = {"tip": "deprem", "x": round(x), "y": round(y), "M": M, "t0": w.minute, "hasar": hasar, "artci": [],
                  "tahliye_kisi": people}
    w.outage = True
    w.mods["gaz"] = 0.0
    w.water.cap_factor = 0.6
    w.incidents.raise_once("deprem", "deprem", L(f"M{M} earthquake · {len(hasar)} sites affected", f"M{M} deprem · {len(hasar)} tesiste etki"), "kritik",
                           detay=L(f"Epicentre {math.hypot(x - geo.W/2, y - geo.H/2)*geo.UNIT_KM:.1f} km from the zone centre · {people} people evacuated", f"Merkez üssü bölge merkezine {TN(math.hypot(x - geo.W/2, y - geo.H/2)*geo.UNIT_KM, 1)} km · {people} kişi tahliye"),
                           aksiyonlar=[L("Emergency Operations Centre activated", "Acil Durum Merkezi aktive edildi"), L("Grid lost — critical loads in island mode", "Şebeke kesildi — kritik yükler ada modunda"),
                                       L("All gas valves shut for 3 hours", "Tüm doğalgaz vanaları 3 saat kapalı"), L("Technicians and fire brigade prioritised to damaged sites", "Hasarlı tesislere usta ve itfaiye önceliklendirmesi"),
                                       L("Status report to AFAD (disaster authority) and the grid operator", "AFAD ve dağıtım şirketine durum bildirimi")])
    heavy = [h[0] for h in hasar if h[1] == "agir"]
    if heavy and w.logistics.emergency.state == "bos":
        f = w.fmap[heavy[0]]
        inc = w.incidents._new("yangin", L("Post-earthquake fire", "Deprem sonrası yangın"), "kritik", f.id, L("Ignition on a damaged gas line", "Hasarlı gaz hattında tutuşma"),
                               [L("Fire brigade dispatched", "İtfaiye yönlendirildi"), L("Warn neighbouring parcels", "Komşu parselleri uyar")], key=f"yangin:{f.id}")
        w.logistics.dispatch_emergency(f, inc["id"])
    w.log("afet", L(f"M{M} earthquake: {len(hasar)} sites affected, {len(heavy)} severely damaged", f"M{M} deprem: {len(hasar)} tesis etkilendi, {len(heavy)} ağır hasar"))


def start_leak(w):
    rng = w.rng
    srcs = [f for f in w.factories if f.sektor == "kimya"] or w.factories
    f = rng.choice(srcs)
    # wind blows toward the zone centre (±35°) — worst-case scenario
    if not w.real_weather:      # with real weather on, the real wind is used
        w.wind["aci"] = math.atan2(geo.H / 2 - f.cy, geo.W / 2 - f.cx) + rng.uniform(-0.6, 0.6)
        w.wind["hiz"] = max(w.wind["hiz"], 4.0)
    inc = w.incidents._new("sizinti", L("Chemical leak · toxic gas", "Kimyasal sızıntı · toksik gaz"), "kritik", f.id, L("Leak at a storage tank valve, the cloud is moving downwind", "Depolama tankı vanasında sızıntı, bulut rüzgâr yönünde ilerliyor"),
                           [L("HAZMAT team and fire brigade dispatched", "KBRN ekibi ve itfaiye yönlendirildi"), L("Evacuate downwind sites", "Rüzgâr altındaki tesisleri tahliye et"), L("Shut down ventilation systems", "Havalandırma sistemlerini kapat"),
                            L("Suppress the leak with foam / a water curtain", "Sızıntıyı köpük/su perdesiyle bastır")], key="sizinti")
    f.set_fault("durdu", w.minute + 240, L("Chemical leak source", "Kimyasal sızıntı kaynağı"), inc["id"])
    if w.logistics.emergency.state == "bos":
        w.logistics.dispatch_emergency(f, inc["id"])
    w.disaster = {"tip": "sizinti", "kaynak": f.id, "x": f.cx, "y": f.cy, "t0": w.minute, "uzunluk": 0, "genislik": 0,
                  "yon": w.wind["aci"], "etkilenen": [], "tahliye_kisi": 0}
    w.log("afet", L(f"Chemical leak: {f.ad}", f"Kimyasal sızıntı: {f.ad}"))


def tick(w):
    d = w.disaster
    if not d:
        return
    age = w.minute - d["t0"]
    rng = w.rng
    if d["tip"] == "deprem":
        if age == 40 and w.outage and not (w.scenario and w.scenario["key"] == "sebeke_kesintisi"):
            w.outage = False
            w.incidents.resolve_key("karsilanamayan", L("Grid restored", "Şebeke geri geldi"))
            w.log("afet", L("Grid supply restored after the earthquake", "Deprem sonrası şebeke beslemesi geri geldi"))
        if age == 180:
            w.mods["gaz"] = 1.0
            w.log("afet", L("Gas valves reopened step by step", "Doğalgaz vanaları kademeli açıldı"))
        if age in (35, 110, 260):
            n = 0
            for f in rng.sample(w.factories, 4):
                if not f.fault and f.status == "calisiyor":
                    f.set_fault("ariza", w.minute + rng.randint(20, 50), L("Aftershock — safety stop", "Artçı sarsıntı — emniyet duruşu"), None)
                    n += 1
            m = round(d["M"] - rng.uniform(1.2, 2.2), 1)
            d["artci"].append([w.minute, m])
            w.incidents.note("deprem", L(f"M{m} aftershock · safety stop at {n} sites", f"M{m} artçı · {n} tesiste emniyet duruşu"))
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
                    inc = w.incidents._new("sizinti", L("Evacuation · under the chemical cloud", "Tahliye · kimyasal bulut altında"), "uyari", f.id,
                                           L(f"Wind {w.wind['hiz']:.0f} m/s — cloud over the site", f"Rüzgâr {TN(w.wind['hiz'], 0)} m/s — bulut tesis üzerinde"),
                                           [L("Move staff to the upwind assembly point", "Personeli rüzgâr üstü toplanma alanına al"), L("Shut down ventilation", "Havalandırmayı kapat")], key=f"tahliye:{f.id}")
                    f.set_fault("durdu", w.scenario["bitis"] + 20 if w.scenario else w.minute + 120, L("Evacuation — chemical cloud", "Tahliye — kimyasal bulut"), inc["id"])
        d["altinda"] = hit


def stop(w):
    d = w.disaster
    if not d:
        return
    if d["tip"] == "deprem":
        w.outage = False
        w.water.cap_factor = 1.0
        w.incidents.resolve_key("deprem", L("Disaster mode closed; repairs continue at damaged sites", "Afet modu kapatıldı; hasarlı tesislerde onarım sürüyor"))
    else:
        w.incidents.resolve_key("sizinti", L("Cloud dispersed, readings normal", "Bulut dağıldı, ölçümler normal"))
        for fid in d["etkilenen"]:
            f = w.fmap[fid]
            if f.fault and "kimyasal" in f.fault[2]:
                f.fault = None
            w.incidents.resolve_key(f"tahliye:{fid}", L("Evacuation ended", "Tahliye sona erdi"))
        src = w.fmap[d["kaynak"]]
        if src.fault:
            src.set_fault("durdu", w.minute + 60, L("Post-leak safety check", "Sızıntı sonrası güvenlik kontrolü"), None)
    w.last_disaster = {**d, "bitis": w.minute}
    w.disaster = None
