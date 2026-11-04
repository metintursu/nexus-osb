"""Bölge Beyni: yerel Ollama modeliyle konuşur; Ollama yoksa kural tabanlı analist devreye girer.

Hiçbir bulut servisi kullanılmaz. Ollama bilgisayarında ücretsiz ve yerel çalışır.
"""
import os
import re

import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "")

SYSTEM = """Sen NEXUS OSB'nin "Bölge Beyni"sin (otopilot, konuşan tesis ajanları, usta havuzu, hidrojen vadisi ve afet modu dahil): 30 tesisli bir organize sanayi bölgesinin enerji, lojistik,
atık/simbiyoz, karbon, su ve güvenlik verilerini yöneten bir yapay zekâ operasyon müdürüsün.
Kurallar:
- Türkçe, kısa ve net yaz. Gereksiz giriş yapma.
- Yalnızca aşağıdaki CANLI DURUM verisine dayan; veri yoksa uydurma, "veride yok" de.
- Mümkün olduğunda sayı ver (MW, TL, tCO2, %), somut aksiyon öner ve hangi tesisi etkilediğini söyle.
- Önerilerini 'Hemen', 'Bugün', 'Bu hafta' gibi zamanlara ayır.
"""

_state = {"model": None, "models": [], "ok": False, "error": None}


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
        _state["error"] = None if models else "Ollama çalışıyor ama yüklü model yok (ollama pull llama3.2)"
    except Exception as e:  # noqa: BLE001
        _state.update(ok=False, models=[], error=f"Ollama'ya ulaşılamadı ({OLLAMA_URL})")
    return {"url": OLLAMA_URL, **_state}


def set_model(name):
    if name in _state["models"]:
        _state["model"] = name
        return True
    return False


SCN_WORDS = {"deprem": "deprem", "sızıntı": "kimyasal_sizinti", "sizinti": "kimyasal_sizinti", "kesinti": "sebeke_kesintisi",
             "zam": "enerji_zammi", "doğalgaz": "dogalgaz_kisinti", "dogalgaz": "dogalgaz_kisinti", "ihracat": "ihracat_siparisi",
             "sıcak": "sicak_hava", "liman": "liman_grevi"}


def command(w, msg):
    """Sesli/yazılı komutları doğrudan uygular. Uygulanan komut yoksa None."""
    q = msg.lower()
    on = bool(re.search(r"\b(aç|ac|başlat|baslat|devreye|etkinleştir|çalıştır)", q))
    off = bool(re.search(r"\b(kapat|durdur|devre dışı|iptal)", q))
    done = []
    if "otopilot" in q and (on or off):
        w.autopilot.set(on and not off)
        done.append(f"Otopilot {'açıldı' if on and not off else 'kapatıldı'}.")
    if re.search(r"havuz|filo", q) and (on or off):
        w.logistics.pool = on and not off
        w.log("lojistik", f"Ortak filo havuzu {'açıldı' if w.logistics.pool else 'kapatıldı'} (komut)")
        done.append(f"Ortak filo havuzu {'açıldı' if w.logistics.pool else 'kapatıldı'}.")
    if "hidrojen" in q and (on or off):
        w.hydrogen.enabled = on and not off
        done.append(f"Hidrojen Vadisi {'devrede' if w.hydrogen.enabled else 'devre dışı'}.")
    m = re.search(r"tm[- ]?([1-4])", q)
    if re.search(r"rahatlat|kaydır|kaydir|esneklik|yük at", q):
        if m:
            tm = w.energy.tms[int(m.group(1)) - 1]
            n = w.energy.demand_response(w, tm["fabrikalar"], 60)
            done.append(f"{tm['id']} rahatlatıldı: {n} tesiste 60 dk yük kaydırma (yüklenme %{tm['oran']*100:.0f}).")
        else:
            n = w.energy.demand_response(w, None, 60)
            done.append(f"Bölge geneli talep kaydırma: {n} tesis, 60 dk.")
    if "batarya" in q and re.search(r"otomatik|aç", q):
        w.energy.mode = "otomatik"
        done.append("Batarya otomatik moda alındı.")
    mm = re.search(r"geri kazan\w*\D*(\d{1,2})", q)
    if mm:
        w.water.reuse = max(0.0, min(0.45, int(mm.group(1)) / 100))
        done.append(f"Su geri kazanımı %{w.water.reuse*100:.0f} yapıldı.")
    if "senaryo" in q or any(k in q for k in ("deprem", "sızıntı", "sizinti")):
        if off and w.scenario:
            w.stop_scenario("Komutla durduruldu")
            done.append("Aktif senaryo durduruldu.")
        elif on or "senaryo" in q:
            for word, key in SCN_WORDS.items():
                if word in q:
                    sc = w.start_scenario(key)
                    done.append(f"Senaryo başlatıldı: {sc['ad']}.")
                    break
    if not done:
        return None
    return "✅ " + " ".join(done)


async def chat(world, message, history=None):
    cmd = command(world, message)
    if cmd:
        return {"cevap": cmd + "\n\n" + analyst(world, message if re.search(r"durum|özet", message.lower()) else "özet").split("\n_Yerel")[0],
                "kaynak": "komut", "komut": True}
    if not _state["ok"]:
        await status()
    if _state["ok"] and _state["model"]:
        msgs = [{"role": "system", "content": SYSTEM + "\n\nCANLI DURUM:\n" + world.context_text()}]
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
            _state["error"] = f"Ollama yanıt vermedi: {type(e).__name__}"
    return {"cevap": analyst(world, message), "kaynak": "yerel-analist"}


# ---------------------------------------------------------------- kural tabanlı analist
def _n(x):
    return f"{x:,.0f}".replace(",", ".")


def _tl(x):
    return f"{x:,.0f}".replace(",", ".") + " TL"


def analyst(w, q):
    ql = q.lower()
    k = w.kpis()
    e = w.energy
    parts = []

    # tesis adı geçiyorsa
    for f in w.factories:
        first = f.ad.split()[0].lower()
        if first in ql or f.id.lower() in ql.split():
            d = f.detail(w)
            parts.append(f"**{f.ad}** ({f.s['ad']}, {f.calisan} çalışan, {f.vardiya} vardiya)\n"
                         f"- Durum: {f.status}{' — ' + f.reason if f.reason else ''}\n"
                         f"- Güç {f.power_kw/1000:.2f} MW · OEE %{f.oee*100:.0f} · emisyon {f.co2_kgh/1000:.2f} tCO2/saat\n"
                         f"- Bugün: {d['bugun']['kwh']/1000:.1f} MWh, {d['bugun']['co2_kg']/1000:.1f} tCO2, ciro {_tl(d['bugun']['ciro_tl'])}, duruş {d['bugun']['durus_dk']:.0f} dk")
            links = [l for l in w.symbiosis.links if l["aktif"] and f.id in (l["ureten"], l["alan"])]
            if links:
                parts.append("- Simbiyoz: " + ", ".join(f"{l['atik_ad']} ({l['ureten_ad']} → {l['alan_ad']})" for l in links))
            opp = [o for o in w.symbiosis.opps if o["ureten"] == f.id][:2]
            for o in opp:
                parts.append(f"- Fırsat: {o['atik_ad']} → {o['alan_ad']}, ayda ≈{_tl(o['aylik_kazanc_tl'])}")
            break

    if re.search(r"enerji|elektrik|trafo|batarya|bess|ges|güneş|fatura|puant|sözleşme", ql):
        worst = max(e.tms, key=lambda t: t["oran"])
        parts.append(f"**Enerji** — yük {k['guc_mw']} MW, GES {k['ges_mw']} MW, şebeke {k['sebeke_mw']} MW "
                     f"(sözleşme {e.contract_kw/1000:.1f} MW), batarya %{k['soc']*100:.0f}. Tarife: {w.period} {w.tariff:.2f} TL/kWh.\n"
                     f"- En yüklü trafo {worst['id']}: %{worst['oran']*100:.0f}\n"
                     f"- Bugün fatura {_tl(e.today['fatura_tl'])}, sözleşme aşımı {e.today['asim_kwh']:.0f} kWh, "
                     f"batarya tasarrufu {_tl(e.today['tasarruf_bess_tl'])}")
        tips = []
        if worst["oran"] > 0.93:
            tips.append(f"Hemen: {worst['id']}'deki esnek yükleri (döküm, metal, plastik) 30–60 dk kaydır.")
        if w.period == "gunduz" and e.soc / e.bess_kwh < 0.6:
            tips.append("Bugün: puant (17–22) öncesi bataryayı GES fazlasıyla doldur.")
        if e.mode != "otomatik":
            tips.append("Hemen: batarya modunu 'otomatik' yap.")
        tips.append("Bu hafta: 3 vardiyalı tesislerin kompresör ve fırın ön ısıtmalarını gece dilimine taşı.")
        parts.append("\n".join("- " + t for t in tips))

    if re.search(r"karbon|co2|emisyon|skdm|cbam|sera", ql):
        c = w.carbon()
        top = c["fabrikalar"][:3]
        parts.append(f"**Karbon** — bugün {c['bugun_t']} tCO2 (kapsam 1: {c['kapsam1_t']} t, kapsam 2: {c['kapsam2_t']} t, lojistik {c['lojistik_t']} t), "
                     f"kaçınılan {c['kacinilan_t']} t. Anlık {c['anlik_th']} tCO2/saat.\n"
                     "- En yüksek: " + ", ".join(f"{r['ad']} {r['co2_t']} t" for r in top) + "\n"
                     f"- SKDM (CBAM) yıllık tahmini yük: ≈{_n(c['skdm_toplam_eur'])} € (≈{_tl(c['skdm_toplam_tl'])})")
        parts.append("- Öneri: SKDM kapsamındaki döküm/metal tesislerinde atık ısıyı komşu tekstil ve gıdaya boru hattıyla ver; "
                     "gaz yoğun fırınlarda puant dışı elektrifikasyon pilotu başlat.")

    if re.search(r"lojistik|kamyon|filo|sevkiyat|araç|kuyruk|kapı", ql):
        d = w.logistics.detail()
        parts.append(f"**Lojistik** — {d['aktif']}/{d['filo']} kamyon aktif, {d['bekleyen']} bekleyen sipariş, "
                     f"bugün {d['bugun']['teslim']:.0f} teslimat, boş km oranı %{w.logistics.empty_ratio()*100:.0f}, "
                     f"ortalama teslim {d['ort_teslim_dk']} dk. Ortak havuz: {'açık' if w.logistics.pool else 'kapalı'}.")
        if not w.logistics.pool:
            parts.append("- Hemen: ortak filo havuzunu aç; araçlar depoya dönmeden en yakın işe geçer.")

    if re.search(r"atık|atik|simbiyoz|geri dönüş|hurda|talaş|döngüsel", ql):
        sd = w.symbiosis.detail()
        parts.append(f"**Endüstriyel simbiyoz** — {sum(1 for l in w.symbiosis.links if l['aktif'])} aktif bağlantı, "
                     f"toplam kazanç {_tl(sd['toplam']['kazanc_tl'])}, yeniden kullanılan {sd['toplam']['geri_t']:.0f} t + {sd['toplam']['isi_mwh']:.0f} MWh ısı, "
                     f"bertarafa giden {sd['toplam']['bertaraf_t']:.0f} t.")
        for o in w.symbiosis.opps[:3]:
            parts.append(f"- Fırsat: {o['ureten_ad']} → {o['alan_ad']} · {o['atik_ad']} · ayda ≈{_tl(o['aylik_kazanc_tl'])}, {o['aylik_co2_t']} tCO2")

    if re.search(r"\bsu\b|arıtma|aritma|koi|atıksu", ql):
        wt = w.water
        parts.append(f"**Su** — arıtmaya giriş {wt.inflow:.0f} m³/saat (kapasite {wt.capacity_m3h}), yüklenme %{wt.util*100:.0f}, "
                     f"çıkış KOİ {wt.koi_out:.0f} mg/L (sınır 250), geri kazanım %{wt.reuse*100:.0f}.")
        if wt.reuse < 0.25:
            parts.append("- Öneri: geri kazanımı %25'e çıkar; soğutma kulesi takviye suyu için uygundur.")

    if re.search(r"arıza|ariza|olay|alarm|kriz|yangın|acil|isg|güvenlik", ql):
        o = w.incidents.open()
        if o:
            parts.append("**Açık olaylar**\n" + "\n".join(f"- [{i['seviye']}] {i['baslik']} {('— ' + i['fabrika_ad']) if i['fabrika_ad'] else ''}: "
                                                         f"{i['aksiyonlar'][0] if i['aksiyonlar'] else ''}" for i in o[:6]))
        else:
            parts.append("**Olaylar** — şu an açık olay yok.")

    if not parts or re.search(r"özet|durum|ne yapmal|öneri|tavsiye|brifing|rapor|nasıl gidiyor", ql):
        h = w.health()
        parts.insert(0, f"**Bölge özeti · Gün {w.day} {w.clock()}** — sağlık skoru **{h['skor']}/100**. "
                        f"Yük {k['guc_mw']} MW, vardiyada {_n(k['vardiyada'])} kişi, saatlik üretim değeri ≈{_tl(k['uretim_saat_tl'])}, "
                        f"bugün {k['co2_t']} tCO2, {k['kamyon']} kamyon yolda.")
        weak = sorted(h["parcalar"].items(), key=lambda x: x[1])[:2]
        parts.append("- Zayıf alanlar: " + ", ".join(f"{a} {b}" for a, b in weak))
        for i in w.insights[:4]:
            parts.append(f"- {i['baslik']}: {i['metin']}")
    parts.append("\n_Yerel analist yanıtı — Ollama bağlandığında Bölge Beyni serbest sorulara da yanıt verir._")
    return "\n".join(parts)
