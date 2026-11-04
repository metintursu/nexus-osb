"""Site calibration from historical data.

A site's electricity (kWh or kW), output, natural gas and water records (hourly, daily or monthly) are uploaded;
the simulated installed power, 24-hour load profile, output rate and gas/water coefficients are fitted to them."""
from .i18n import L, LANG, TN
from statistics import median

from . import tabular


def _col(heads, *keys, avoid=()):
    return tabular.find(heads, *keys, avoid=avoid)


def _model_mean_load(f):
    hrs = {1: 9, 2: 16, 3: 24}[f.vardiya]
    return (hrs * 0.88 + (24 - hrs) * 0.14) / 24, hrs


def analyze(rows, f):
    heads = list(rows[0].keys())
    ts, tc, sc = tabular.stamps(rows)
    c_kwh = _col(heads, "kwh", "consumption", "energy", "tuketim", "enerji", "elektrik")
    c_kw = _col(heads, "power_kw", "guc_kw", "kw", "power", "guc", "demand", avoid=("kwh",)) if not c_kwh else None
    c_pr = _col(heads, "uretim", "adet", "miktar", "production", "output", "ton")
    c_gz = _col(heads, "dogalgaz", "gaz", "gas", "sm3", avoid=("su_",))
    c_su = next((h for h in heads if h == "su" or h.startswith("su_") or "water" in h), None)
    if not (c_kwh or c_kw):
        raise ValueError(L("No electricity column found: a column named 'kwh' (consumption) or 'kw' (power) is required", "Elektrik sütunu bulunamadı: 'kwh' (tüketim) veya 'kw' (güç) adlı bir sütun gerekli"))
    data = []
    for d, r in zip(ts, rows):
        if d is None:
            continue
        e = tabular.num(r.get(c_kwh or c_kw))
        if e is None:
            continue
        data.append((d, e, tabular.num(r.get(c_pr)) if c_pr else None, tabular.num(r.get(c_gz)) if c_gz else None,
                     tabular.num(r.get(c_su)) if c_su else None))
    if not data:
        raise ValueError(L("No readable data rows (check the date and electricity values)", "Okunabilir veri satırı yok (tarih ve elektrik değerlerini kontrol et)"))
    data.sort(key=lambda x: x[0])
    gaps = [(b[0] - a[0]).total_seconds() / 3600 for a, b in zip(data, data[1:]) if b[0] > a[0]]
    step = median(gaps) if gaps else 24 * 30
    warn = []
    before = {"kurulu_kw": round(f.rated_kw), "uretim_saat": round(f.rate_h, 2), "gaz_k": round(f.gaz_k, 4), "su_k": round(f.su_k, 4)}
    new = dict(before)
    profile = None
    oee = f.oee_base
    if step <= 1.5:
        mode = "saatlik"
        hourly = {}
        for d, e, p, g, s in data:
            key = d.replace(minute=0, second=0, microsecond=0)
            b = hourly.setdefault(key, [0.0, 0.0, 0.0, 0.0, 0, 0.0])
            b[0] += e
            b[1] += p or 0
            b[2] += g or 0
            b[3] += s or 0
            b[4] += 1
        kw_by = {}
        rows_h = []
        for key, (e, p, g, s, n) in [(k, v[:5]) for k, v in hourly.items()]:
            kw = e / n if c_kw else e          # kW: hourly mean · kWh: hourly sum = mean kW
            rows_h.append((key, kw, p, g, s))
            kw_by.setdefault(key.hour, []).append(kw)
        if len(rows_h) < 24:
            warn.append(L("Less than 24 hours of data; missing hours of the profile were filled from neighbouring hours", "24 saatten az veri var; profil eksik saatlerde komşu saatlerle dolduruldu"))
        allkw = sorted(x[1] for x in rows_h)
        peak = allkw[int(len(allkw) * 0.95) - 1] if len(allkw) > 1 else allkw[0]
        rated = max(10.0, peak / 0.93)
        prof = [None] * 24
        for h, v in kw_by.items():
            prof[h] = sum(v) / len(v)
        for h in range(24):
            if prof[h] is None:
                near = [prof[(h + k) % 24] for k in (1, -1, 2, -2, 3, -3) if prof[(h + k) % 24] is not None]
                prof[h] = near[0] if near else rated * 0.5
        profile = [round(min(1.1, v / rated), 3) for v in prof]
        active = [x for x in rows_h if x[1] >= rated * 0.3] or rows_h
        load_act = sum(x[1] for x in active) / len(active) / rated
        new["kurulu_kw"] = round(rated)
        if c_pr:
            new["uretim_saat"] = round(sum(x[2] or 0 for x in active) / len(active) / max(0.05, load_act * oee), 2)
        if c_gz:
            new["gaz_k"] = round(sum(x[3] or 0 for x in active) / len(active) / max(1, f.calisan * load_act), 4)
        if c_su:
            new["su_k"] = round(sum(x[4] or 0 for x in active) / len(active) / max(1, f.calisan * (0.3 + 0.7 * load_act)), 4)
        days = max(1.0, len(rows_h) / 24)
        tot_kwh = sum(x[1] for x in rows_h)
        summ = {"ort_kw": round(tot_kwh / len(rows_h)), "pik_kw": round(peak), "gunluk_kwh": round(tot_kwh / days),
                "aylik_kwh": round(tot_kwh / days * 30), "aktif_saat_gunde": sum(1 for v in profile if v >= 0.3)}
    else:
        mode = "gunluk" if step < 26 * 24 else "aylik"
        div = 24.0 if mode == "gunluk" else 24.0 * 30
        per = 1 if mode == "gunluk" else 30
        avg_kw = sum((e if c_kw else e / div) for _, e, *_ in data) / len(data)
        L, hrs = _model_mean_load(f)
        new["kurulu_kw"] = round(max(10.0, avg_kw / L))
        prods = [p for _, _, p, _, _ in data if p is not None]
        gases = [g for _, _, _, g, _ in data if g is not None]
        waters = [s for *_, s in data if s is not None]
        if prods:
            new["uretim_saat"] = round(sum(prods) / len(prods) / per / (hrs * 0.88 * oee), 2)
        if gases:
            new["gaz_k"] = round(sum(gases) / len(gases) / per / (f.calisan * L * 24), 4)
        if waters:
            new["su_k"] = round(sum(waters) / len(waters) / per / (f.calisan * (0.3 + 0.7 * L) * 24), 4)
        warn.append(L(f"{'Daily' if mode == 'gunluk' else 'Monthly'} data: no hourly profile can be derived, the site's shift model is kept", f"{'Günlük' if mode == 'gunluk' else 'Aylık'} veri: saatlik profil çıkarılamaz, tesisin vardiya modeli korunur"))
        summ = {"ort_kw": round(avg_kw), "pik_kw": None, "gunluk_kwh": round(avg_kw * 24), "aylik_kwh": round(avg_kw * 24 * 30),
                "aktif_saat_gunde": hrs}
    if c_pr:
        prs = [p for _, _, p, _, _ in data if p is not None]
        summ["toplam_uretim"] = round(sum(prs), 1)
    change = new["kurulu_kw"] / max(1, before["kurulu_kw"])
    if change > 3 or change < 0.33:
        warn.append(L(f"Installed power changes {change:.1f}x versus the model — check the units (kWh / MWh, kW / W)", f"Kurulu güç modele göre {TN(change, 1)} kat değişiyor — birimleri (kWh / MWh, kW / W) kontrol et"))
    return {"fabrika": f.id, "fabrika_ad": f.ad, "mod": mode, "satir": len(data),
            "aralik": f"{data[0][0]:%d.%m.%Y %H:%M} – {data[-1][0]:%d.%m.%Y %H:%M}",
            "sutunlar": {"zaman": tc, "saat": sc, "elektrik": c_kwh or c_kw, "elektrik_tur": "kWh" if c_kwh else "kW",
                         "uretim": c_pr, "gaz": c_gz, "su": c_su},
            "onceki": before, "yeni": new, "profil": profile, "ozet": summ, "uyarilar": warn}


def apply(f, res):
    n = res["yeni"]
    f.rated_kw = float(n["kurulu_kw"])
    f.rate_h = float(n["uretim_saat"])
    f.gaz_k = float(n["gaz_k"])
    f.su_k = float(n["su_k"])
    f.profile = res.get("profil")
    f.kalibre = {k: res[k] for k in ("mod", "satir", "aralik", "ozet")} | {"dosya": res.get("dosya")}
