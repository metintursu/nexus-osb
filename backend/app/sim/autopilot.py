"""Otopilot: Bölge Beyni'nin önerilerini insan beklemeden uygular.

Her 10 simülasyon dakikasında bölgeyi tarar, kurallar ateşlenirse aksiyonu uygular ve
gerekçesiyle birlikte karar günlüğüne yazar. Geri alınamaz/yatırım gerektiren kararlar
(ör. yatırım bedeli yüksek boru hattı) eşik üstündeyse insan onayına bırakılır."""
from .agents import n as tn

RULES = {
    "trafo": "Trafo %95 üstüne çıkınca bağlı esnek yükleri 45 dk kaydır",
    "sozlesme": "Şebeke çekişi sözleşme gücünü aşınca bölge geneli esneklik çağrısı",
    "bess": "Batarya her zaman otomatik (pik tıraşlama + puant) modda",
    "puant": "15:30–17:00 arası batarya rezervini düşürüp puanta hazırla, sonra geri al",
    "havuz": "Boş km oranı %35'i geçerse ortak filo havuzunu aç",
    "simbiyoz": "Aylık kazancı 50 bin ₺ üstü ve geri ödemesi 24 ayı geçmeyen simbiyozu kur (saatte en fazla 1)",
    "pazar": "Tasarrufu olan kapasite eşleşmesini sözleşmeye bağla (saatte en fazla 1)",
    "su": "Su geri kazanımı en az %25; arıtma %100'ü aşarsa yüksek KOİ'li tesislerde esneklik",
    "kesinti": "Şebeke kesintisinde batarya rezervini sıfırla, tüm kapasiteyi kritik yüklere aç",
    "olay": "Açık arıza olaylarını müdahaleye al, usta atanmamışsa usta yönlendir",
}


class Autopilot:
    def __init__(self, w):
        self.w = w
        self.enabled = False
        self.rules = {k: True for k in RULES}
        self.log = []
        self.pending = []           # insan onayı bekleyenler
        self.stats = {"karar": 0, "tahmini_kazanc_tl": 0.0}
        self._last = {}
        self._saved_reserve = None

    def _do(self, modul, karar, gerekce, kazanc=0.0):
        self.stats["karar"] += 1
        self.stats["tahmini_kazanc_tl"] += kazanc
        self.log.append({"t": self.w.minute, "modul": modul, "karar": karar, "gerekce": gerekce, "kazanc": round(kazanc)})
        if len(self.log) > 300:
            del self.log[0]
        self.w.log("otopilot", f"Otopilot · {karar}")

    def _cool(self, key, minutes):
        if self.w.minute - self._last.get(key, -10 ** 9) < minutes:
            return False
        self._last[key] = self.w.minute
        return True

    def set(self, on):
        self.enabled = on
        self.w.log("otopilot", f"Otopilot {'devreye alındı' if on else 'kapatıldı'}")

    def tick(self):
        w = self.w
        if not self.enabled or w.minute % 10:
            return
        e, lg, sy, wt, R = w.energy, w.logistics, w.symbiosis, w.water, self.rules
        if R["bess"] and e.mode != "otomatik":
            e.mode = "otomatik"
            self._do("enerji", "Batarya otomatik moda alındı", "Pik tıraşlama ve puant deşarjı kapalıydı")
        if R["kesinti"]:
            if w.outage and self._saved_reserve is None:
                self._saved_reserve = e.reserve
                e.reserve = 0.0
                self._do("enerji", "Batarya rezervi kritik yüklere açıldı", "Şebeke kesintisi — ada modu")
            elif not w.outage and self._saved_reserve is not None and not (15.5 <= w.hour < 22):
                e.reserve = self._saved_reserve
                self._saved_reserve = None
                self._do("enerji", f"Batarya rezervi %{e.reserve*100:.0f}'e geri alındı", "Şebeke normale döndü")
        if R["puant"] and not w.outage:
            if 15.5 <= w.hour < 17 and self._saved_reserve is None and e.reserve > 0.12:
                self._saved_reserve = e.reserve
                e.reserve = 0.10
                self._do("enerji", "Batarya puanta hazırlandı (rezerv %10)", "17:00 puant dilimi öncesi tüm kapasite pik tıraşlamaya")
        if R["trafo"]:
            for tm in e.tms:
                if tm["oran"] > 0.95 and self._cool("trafo" + tm["id"], 45):
                    n = e.demand_response(w, tm["fabrikalar"], 45)
                    if n:
                        self._do("enerji", f"{tm['id']}: {n} tesiste 45 dk yük kaydırma", f"Trafo yüklenmesi %{tm['oran']*100:.0f}",
                                 kazanc=tm["yuk_kw"] * 0.12 * 0.75 * 1.6)
        if R["sozlesme"] and e.grid_kw > e.contract_kw * 0.99 and self._cool("sozlesme", 45):
            n = e.demand_response(w, None, 45)
            if n:
                self._do("enerji", f"Bölge geneli esneklik: {n} tesis", f"Çekiş {e.grid_kw/1000:.1f} MW, sözleşme sınırı {e.contract_kw/1000:.1f} MW",
                         kazanc=(e.grid_kw - e.contract_kw * 0.95) * 0.75 * 1.6)
        if R["havuz"] and not lg.pool and lg.empty_ratio() > 0.35:
            lg.pool = True
            self._do("lojistik", "Ortak filo havuzu açıldı", f"Boş km oranı %{lg.empty_ratio()*100:.0f}",
                     kazanc=lg.today["km_bos"] * 0.4 * 28)
        if R["simbiyoz"] and self._cool("simbiyoz", 60):
            ok = [o for o in sy.opps if o["aylik_kazanc_tl"] > 50000 and (not o["yatirim_tl"] or o["geri_odeme_ay"] <= 24)]
            big = [o for o in sy.opps if o["yatirim_tl"] and o["geri_odeme_ay"] > 24 and o["id"] not in [p["id"] for p in self.pending]]
            if ok:
                o = ok[0]
                if sy.approve(o["id"]):
                    sy.compute_opps()
                    self._do("simbiyoz", f"Simbiyoz kuruldu: {o['ureten_ad']} → {o['alan_ad']} ({o['atik_ad']})",
                             f"Ayda ≈{tn(o['aylik_kazanc_tl'])} ₺ · {tn(o['aylik_co2_t'], 1)} tCO₂", kazanc=o["aylik_kazanc_tl"] / 30)
            elif big and len(self.pending) < 5:
                self.pending.append({**big[0], "neden": f"Yatırım {tn(big[0]['yatirim_tl'])} ₺ · geri ödeme {tn(big[0]['geri_odeme_ay'], 1)} ay — insan onayı gerekli"})
        if R["pazar"] and self._cool("pazar", 60):
            m = [x for x in w.market.matches() if x["tasarruf_tl"] > 0]
            if m and w.market.match(m[0]["teklif"], m[0]["talep"]):
                self._do("pazaryeri", f"Kapasite sözleşmesi: {m[0]['kaynak']} ({m[0]['veren_ad']} → {m[0]['isteyen_ad']})",
                         "Bölge içi atıl kapasite, dış fiyattan ucuz", kazanc=m[0]["tasarruf_tl"])
        if R["su"]:
            if wt.reuse < 0.25:
                wt.reuse = 0.25
                self._do("su", "Su geri kazanımı %25'e çıkarıldı", "Şebeke suyu tasarrufu")
            if wt.util > 1.0 and self._cool("su", 60):
                ids = [f.id for f in w.factories if f.s["koi"] >= 1500]
                n = e.demand_response(w, ids, 45)
                self._do("su", f"Arıtma yüklenmesi %{wt.util*100:.0f}: {n} yüksek KOİ'li tesiste kademeli yavaşlatma", "KOİ sınır aşımını önlemek")
        if R["olay"]:
            for inc in w.incidents.open():
                if inc["tip"] == "ariza" and inc["durum"] == "acik":
                    f = w.fmap.get(inc["fabrika"])
                    if f and not inc.get("usta"):
                        w.masters.dispatch(f, "mekanik", inc)
                    inc["durum"] = "mudahale"
                    inc["kayit"].append((w.minute, "Otopilot müdahaleyi başlattı"))
                    self._do("kriz", f"Müdahale başlatıldı: {inc['baslik']} — {inc['fabrika_ad']}", "Açık arıza olayı")

    def approve_pending(self, oid):
        o = next((p for p in self.pending if p["id"] == oid), None)
        if not o:
            return None
        self.pending = [p for p in self.pending if p["id"] != oid]
        link = self.w.symbiosis.approve(oid)
        if link:
            self._do("simbiyoz", f"İnsan onayıyla yatırım: {o['ureten_ad']} → {o['alan_ad']}", o["neden"], kazanc=0)
        return link

    def detail(self):
        return {"aktif": self.enabled, "kurallar": [{"k": k, "metin": v, "acik": self.rules[k]} for k, v in RULES.items()],
                "kayit": self.log[::-1][:120], "bekleyen": self.pending, "istatistik": {k: round(v) for k, v in self.stats.items()}}
