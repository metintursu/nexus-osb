"""Zone Brain: talks to a local Ollama model; if Ollama is not available, a rule-based analyst answers.

No cloud service is used. Ollama runs locally and free of charge on your own computer.
"""
import os
import re

import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "")

SYSTEM = """You are the "Zone Brain" of NEXUS OSB (including autopilot, talking plant agents, the technician pool,
the hydrogen valley and disaster mode): an AI operations manager running the energy, logistics, waste/symbiosis,
carbon, water and safety data of an organised industrial zone with about 30 plants.
Rules:
- Answer in English, briefly and clearly. No filler introductions.
- Rely only on the LIVE STATUS data below; if something is not in the data, do not make it up — say so.
- Give numbers whenever possible (MW, TRY, tCO2, %), suggest concrete actions and name the affected plants.
- Group recommendations by time: 'Now', 'Today', 'This week'.
"""

_state = {"model": None, "models": [], "ok": False, "error": None}

STATUS_EN = {"calisiyor": "running", "bosta": "off shift", "ariza": "fault", "bakim": "maintenance", "durdu": "stopped"}
PERIOD_EN = {"gece": "night", "gunduz": "day", "puant": "peak"}
SEV_EN = {"kritik": "critical", "uyari": "warning", "bilgi": "info", "firsat": "opportunity"}
PART_EN = {"enerji": "energy", "lojistik": "logistics", "dongusel": "circularity", "guvenlik": "safety", "su": "water",
           "verimlilik": "efficiency"}


async def status():
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f"{OLLAMA_URL}/api/tags")
            r.raise_for_status()
            models = [m["name"] for m in r.json().get("models", [])]
        _state["models"] = models
        _state["ok"] = bool(models)
        if _state["model"] not in models:
            pref = OLLAMA_MODEL if OLLAMA_MODEL in models else None
            if not pref and OLLAMA_MODEL:
                pref = next((m for m in models if m.startswith(OLLAMA_MODEL)), None)
            _state["model"] = pref or (models[0] if models else None)
        _state["error"] = None if models else "Ollama is running but no model is installed (ollama pull llama3.2)"
    except Exception:  # noqa: BLE001
        _state.update(ok=False, models=[], error=f"Could not reach Ollama ({OLLAMA_URL})")
    return {"url": OLLAMA_URL, **_state}


def set_model(name):
    if name in _state["models"]:
        _state["model"] = name
        return True
    return False


SCN_WORDS = {"earthquake": "deprem", "quake": "deprem", "deprem": "deprem", "leak": "kimyasal_sizinti", "chemical": "kimyasal_sizinti",
             "sızıntı": "kimyasal_sizinti", "outage": "sebeke_kesintisi", "blackout": "sebeke_kesintisi", "kesinti": "sebeke_kesintisi",
             "price": "enerji_zammi", "gas": "dogalgaz_kisinti", "doğalgaz": "dogalgaz_kisinti", "export": "ihracat_siparisi",
             "heat": "sicak_hava", "port": "liman_grevi", "liman": "liman_grevi"}


def command(w, msg):
    """Applies spoken/typed commands directly (English, Turkish also understood). Returns None if no command matched."""
    q = msg.lower()
    on = bool(re.search(r"\b(turn on|switch on|enable|engage|open|start|activate|run|aç|ac|başlat|devreye)\b", q))
    off = bool(re.search(r"\b(turn off|switch off|disable|disengage|close|stop|cancel|kapat|durdur|iptal)\b", q))
    done = []
    if re.search(r"auto ?pilot|otopilot", q) and (on or off):
        w.autopilot.set(on and not off)
        done.append(f"Autopilot {'engaged' if on and not off else 'disengaged'}.")
    if re.search(r"\bpool\b|fleet|havuz|filo", q) and (on or off):
        w.logistics.pool = on and not off
        w.log("lojistik", f"Shared fleet pool {'opened' if w.logistics.pool else 'closed'} (command)")
        done.append(f"Shared fleet pool {'opened' if w.logistics.pool else 'closed'}.")
    if re.search(r"hydrogen|hidrojen|\bh2\b", q) and (on or off):
        w.hydrogen.enabled = on and not off
        done.append(f"Hydrogen Valley {'online' if w.hydrogen.enabled else 'offline'}.")
    m = re.search(r"tm[- ]?([1-9])", q)
    if re.search(r"relieve|shift|flex|shed|reduce load|rahatlat|kaydır|esneklik", q):
        if m and int(m.group(1)) <= len(w.energy.tms):
            tm = w.energy.tms[int(m.group(1)) - 1]
            n = w.energy.demand_response(w, tm["fabrikalar"], 60)
            done.append(f"{tm['id']} relieved: 60-min load shift at {n} sites (load {tm['oran']*100:.0f}%).")
        else:
            n = w.energy.demand_response(w, None, 60)
            done.append(f"Zone-wide load shift: {n} sites for 60 min.")
    if re.search(r"battery|batarya", q) and re.search(r"auto|otomatik|on\b|aç", q):
        w.energy.mode = "otomatik"
        done.append("Battery set to auto mode.")
    mm = re.search(r"(?:reuse|recycl\w*|geri kazan\w*)\D*(\d{1,2})", q)
    if mm:
        w.water.reuse = max(0.0, min(0.45, int(mm.group(1)) / 100))
        done.append(f"Water reuse set to {w.water.reuse*100:.0f}%.")
    if re.search(r"scenario|senaryo|earthquake|quake|deprem|leak|sızıntı", q):
        if off and w.scenario:
            w.stop_scenario("Stopped by command")
            done.append("Active scenario stopped.")
        elif on or re.search(r"scenario|senaryo", q):
            for word, key in SCN_WORDS.items():
                if word in q:
                    sc = w.start_scenario(key)
                    done.append(f"Scenario started: {sc['ad']}.")
                    break
    if not done:
        return None
    return "✅ " + " ".join(done)


async def chat(world, message, history=None):
    cmd = command(world, message)
    if cmd:
        return {"cevap": cmd + "\n\n" + analyst(world, message if re.search(r"status|summary|overview", message.lower()) else "summary").split("\n_Local")[0],
                "kaynak": "command", "komut": True}
    if not _state["ok"]:
        await status()
    if _state["ok"] and _state["model"]:
        msgs = [{"role": "system", "content": SYSTEM + "\n\nLIVE STATUS:\n" + world.context_text()}]
        for h in (history or [])[-8:]:
            if h.get("role") in ("user", "assistant") and h.get("content"):
                msgs.append({"role": h["role"], "content": str(h["content"])[:2000]})
        msgs.append({"role": "user", "content": message})
        try:
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.post(f"{OLLAMA_URL}/api/chat",
                                 json={"model": _state["model"], "messages": msgs, "stream": False,
                                       "options": {"temperature": 0.3, "num_ctx": 8192}})
                r.raise_for_status()
                text = r.json().get("message", {}).get("content", "").strip()
                if text:
                    return {"cevap": text, "kaynak": f"ollama:{_state['model']}"}
        except Exception as e:  # noqa: BLE001
            _state["ok"] = False
            _state["error"] = f"Ollama did not respond: {type(e).__name__}"
    return {"cevap": analyst(world, message), "kaynak": "local-analyst"}


# ---------------------------------------------------------------- rule-based analyst
def _n(x):
    return f"{x:,.0f}"


def _tl(x):
    return f"₺{x:,.0f}"


GENERIC = {"zone", "logistics", "battery", "main", "central", "the", "new", "site"}


def analyst(w, q):
    ql = q.lower()
    k = w.kpis()
    e = w.energy
    parts = []

    # a plant is mentioned by name or id
    for f in w.factories:
        first = f.ad.split()[0].lower()
        if (first not in GENERIC and re.search(r"\b" + re.escape(first) + r"\b", ql)) or f.id.lower() in re.findall(r"[a-z0-9-]+", ql):
            d = f.detail(w)
            parts.append(f"**{f.ad}** ({f.s['ad']}, {f.calisan} employees, {f.vardiya} shift(s))\n"
                         f"- Status: {STATUS_EN.get(f.status, f.status)}{' — ' + f.reason if f.reason else ''}\n"
                         f"- Power {f.power_kw/1000:.2f} MW · OEE {f.oee*100:.0f}% · emissions {f.co2_kgh/1000:.2f} tCO2/h\n"
                         f"- Today: {d['bugun']['kwh']/1000:.1f} MWh, {d['bugun']['co2_kg']/1000:.1f} tCO2, revenue {_tl(d['bugun']['ciro_tl'])}, downtime {d['bugun']['durus_dk']:.0f} min")
            links = [l for l in w.symbiosis.links if l["aktif"] and f.id in (l["ureten"], l["alan"])]
            if links:
                parts.append("- Symbiosis: " + ", ".join(f"{l['atik_ad']} ({l['ureten_ad']} → {l['alan_ad']})" for l in links))
            opp = [o for o in w.symbiosis.opps if o["ureten"] == f.id][:2]
            for o in opp:
                parts.append(f"- Opportunity: {o['atik_ad']} → {o['alan_ad']}, ≈{_tl(o['aylik_kazanc_tl'])}/month")
            break

    if re.search(r"energy|electric|power|substation|transformer|battery|bess|solar|bill|peak|contract", ql):
        worst = max(e.tms, key=lambda t: t["oran"])
        parts.append(f"**Energy** — load {k['guc_mw']} MW, solar {k['ges_mw']} MW, grid {k['sebeke_mw']} MW "
                     f"(contract {e.contract_kw/1000:.1f} MW), battery {k['soc']*100:.0f}%. Tariff: {PERIOD_EN[w.period]} {w.tariff:.2f} TRY/kWh.\n"
                     f"- Most loaded substation {worst['id']}: {worst['oran']*100:.0f}%\n"
                     f"- Today's bill {_tl(e.today['fatura_tl'])}, contract overrun {e.today['asim_kwh']:.0f} kWh, "
                     f"battery savings {_tl(e.today['tasarruf_bess_tl'])}")
        tips = []
        if worst["oran"] > 0.93:
            tips.append(f"Now: shift flexible loads on {worst['id']} (foundry, metal, plastics) by 30–60 min.")
        if w.period == "gunduz" and e.soc / e.bess_kwh < 0.6:
            tips.append("Today: charge the battery with surplus solar before the evening peak (17–22).")
        if e.mode != "otomatik":
            tips.append("Now: set the battery to 'auto'.")
        tips.append("This week: move compressor and furnace pre-heating at 3-shift plants into the night band.")
        parts.append("\n".join("- " + t for t in tips))

    if re.search(r"carbon|co2|emission|cbam|greenhouse|ghg", ql):
        c = w.carbon()
        top = c["fabrikalar"][:3]
        parts.append(f"**Carbon** — today {c['bugun_t']} tCO2 (scope 1: {c['kapsam1_t']} t, scope 2: {c['kapsam2_t']} t, logistics {c['lojistik_t']} t), "
                     f"avoided {c['kacinilan_t']} t. Current rate {c['anlik_th']} tCO2/h.\n"
                     "- Highest: " + ", ".join(f"{r['ad']} {r['co2_t']} t" for r in top) + "\n"
                     f"- Estimated annual EU CBAM exposure: ≈€{_n(c['skdm_toplam_eur'])} (≈{_tl(c['skdm_toplam_tl'])})")
        parts.append("- Recommendation: pipe waste heat from CBAM-exposed foundry/metal plants to neighbouring textile and food sites; "
                     "start an off-peak electrification pilot on gas-intensive furnaces.")

    if re.search(r"logistic|truck|fleet|shipment|delivery|vehicle|queue|gate", ql):
        d = w.logistics.detail()
        parts.append(f"**Logistics** — {d['aktif']}/{d['filo']} trucks active, {d['bekleyen']} orders waiting, "
                     f"{d['bugun']['teslim']:.0f} deliveries today, empty-km share {w.logistics.empty_ratio()*100:.0f}%, "
                     f"average lead time {d['ort_teslim_dk']} min. Shared pool: {'on' if w.logistics.pool else 'off'}.")
        if not w.logistics.pool:
            parts.append("- Now: open the shared fleet pool; trucks take the nearest next job instead of driving back to the depot.")

    if re.search(r"waste|symbiosis|recycl|scrap|chips|circular", ql):
        sd = w.symbiosis.detail()
        parts.append(f"**Industrial symbiosis** — {sum(1 for l in w.symbiosis.links if l['aktif'])} active links, "
                     f"total gain {_tl(sd['toplam']['kazanc_tl'])}, reused {sd['toplam']['geri_t']:.0f} t + {sd['toplam']['isi_mwh']:.0f} MWh of heat, "
                     f"sent to disposal {sd['toplam']['bertaraf_t']:.0f} t.")
        for o in w.symbiosis.opps[:3]:
            parts.append(f"- Opportunity: {o['ureten_ad']} → {o['alan_ad']} · {o['atik_ad']} · ≈{_tl(o['aylik_kazanc_tl'])}/month, {o['aylik_co2_t']} tCO2")

    if re.search(r"\bwater\b|wastewater|treatment|\bcod\b", ql):
        wt = w.water
        parts.append(f"**Water** — plant inflow {wt.inflow:.0f} m³/h (capacity {wt.capacity_m3h}), load {wt.util*100:.0f}%, "
                     f"outlet COD {wt.koi_out:.0f} mg/L (limit 250), reuse {wt.reuse*100:.0f}%.")
        if wt.reuse < 0.25:
            parts.append("- Recommendation: raise reuse to 25%; it is suitable as cooling-tower make-up water.")

    if re.search(r"fault|incident|alarm|crisis|fire|emergency|safety|ohs", ql):
        o = w.incidents.open()
        if o:
            parts.append("**Open incidents**\n" + "\n".join(f"- [{SEV_EN.get(i['seviye'], i['seviye'])}] {i['baslik']} {('— ' + i['fabrika_ad']) if i['fabrika_ad'] else ''}: "
                                                           f"{i['aksiyonlar'][0] if i['aksiyonlar'] else ''}" for i in o[:6]))
        else:
            parts.append("**Incidents** — no open incidents right now.")

    if not parts or re.search(r"summary|status|overview|what should|recommend|advice|brief|report|how is|how are", ql):
        h = w.health()
        parts.insert(0, f"**Zone summary · day {w.day} {w.clock()}** — health score **{h['skor']}/100**. "
                        f"Load {k['guc_mw']} MW, {_n(k['vardiyada'])} people on shift, hourly output value ≈{_tl(k['uretim_saat_tl'])}, "
                        f"{k['co2_t']} tCO2 today, {k['kamyon']} trucks on the road.")
        weak = sorted(h["parcalar"].items(), key=lambda x: x[1])[:2]
        parts.append("- Weakest areas: " + ", ".join(f"{PART_EN.get(a, a)} {b}" for a, b in weak))
        for i in w.insights[:4]:
            parts.append(f"- {i['baslik']}: {i['metin']}")
    parts.append("\n_Local analyst answer — once Ollama is connected, the Zone Brain also answers free-form questions._")
    return "\n".join(parts)
