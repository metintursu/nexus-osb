"""Kriz ve olay yönetimi: arıza, yangın, İSG ramak kala, modüllerden gelen alarmlar."""

FAULTS = [
    ("Ana tahrik motoru aşırı titreşim", "mekanik", ["Rulman sıcaklığını ölç; titreşim 7 mm/s üstündeyse rulmanı değiştir",
                                          "Kaplin hizasını lazerle kontrol et", "Motor ankraj cıvatalarını torkla"]),
    ("Hidrolik basınç düşüşü", "hidrolik", ["Filtre fark basıncını kontrol et", "Pompa emiş hattında hava kaçağı ara",
                                "Yağ seviyesini ve sıcaklığını kontrol et"]),
    ("Kompresör hattında hava kaçağı", "hidrolik", ["Ultrasonik dedektörle kaçak tara", "Kaçak noktasını izole et, yedek hattı aç",
                                        "Bölge pazaryerinden geçici kompresör kirala"]),
    ("Servo sürücü aşırı akım hatası", "elektrik", ["Sürücü hata geçmişini oku", "Motor kablosunda izolasyon testi yap",
                                        "Mekanik sıkışma için eksenleri elle kontrol et"]),
    ("Soğutma suyu sıcaklığı yüksek", "sogutma", ["Kule fanlarını ve pompa debisini kontrol et", "Eşanjör kirlenmesine bak",
                                       "Üretim hızını geçici %20 düşür"]),
    ("Konveyör bant kayması", "mekanik", ["Bant gerginliğini ayarla", "Tambur kaplamasını kontrol et", "Hız sensörünü test et"]),
    ("Fırın brülörü alev sönmesi", "yakma", ["Alev sensörünü temizle", "Gaz basınç regülatörünü kontrol et",
                                    "Purge döngüsünü tamamlayıp yeniden ateşle"]),
    ("PLC haberleşme kopması", "otomasyon", ["Switch port durumlarını kontrol et", "PLC CPU durum LED'lerini oku",
                                "Son değişiklik yapılan programı geri al"]),
]


class Incidents:
    def __init__(self, w):
        self.w = w
        self.items = []
        self._n = 0
        self.keys = {}       # key -> açık olay id

    def _new(self, tip, baslik, seviye, fabrika=None, detay="", aksiyonlar=None, key=None):
        self._n += 1
        f = self.w.fmap.get(fabrika) if fabrika else None
        inc = {"id": f"O{self._n:05d}", "tip": tip, "baslik": baslik, "seviye": seviye,
               "fabrika": fabrika, "fabrika_ad": f.ad if f else None, "x": f.cx if f else None, "y": f.cy if f else None,
               "zaman": self.w.minute, "durum": "acik", "detay": detay, "aksiyonlar": aksiyonlar or [],
               "kayit": [(self.w.minute, "Olay açıldı")], "key": key, "kapanis": None}
        self.items.append(inc)
        if key:
            self.keys[key] = inc["id"]
        if len(self.items) > 400:
            self.items = [i for i in self.items if i["durum"] != "kapandi"][-200:] + []
        self.w.log("olay", f"[{seviye.upper()}] {baslik}" + (f" — {f.ad}" if f else ""), inc)
        return inc

    def get(self, iid):
        return next((i for i in self.items if i["id"] == iid), None)

    def raise_once(self, key, tip, baslik, seviye, fabrika=None, detay="", aksiyonlar=None):
        if key in self.keys:
            inc = self.get(self.keys[key])
            if inc and inc["durum"] != "kapandi":
                return inc
        return self._new(tip, baslik, seviye, fabrika, detay, aksiyonlar, key)

    def note(self, key, text):
        if key in self.keys:
            inc = self.get(self.keys[key])
            if inc:
                inc["kayit"].append((self.w.minute, text))

    def close(self, inc, text):
        if inc["durum"] == "kapandi":
            return
        inc["durum"] = "kapandi"
        inc["kapanis"] = self.w.minute
        inc["kayit"].append((self.w.minute, text))
        if inc["key"] and self.keys.get(inc["key"]) == inc["id"]:
            del self.keys[inc["key"]]

    def resolve_key(self, key, text):
        if key in self.keys:
            inc = self.get(self.keys[key])
            if inc:
                self.close(inc, text)

    def action(self, iid, act):
        inc = self.get(iid)
        if not inc:
            return None
        if act == "mudahale" and inc["durum"] == "acik":
            inc["durum"] = "mudahale"
            inc["kayit"].append((self.w.minute, "Operatör müdahaleyi başlattı"))
        elif act == "kapat":
            self.close(inc, "Operatör tarafından kapatıldı")
        return inc

    # ---------------- olay üretimi ----------------
    def tick(self):
        w, rng = self.w, self.w.rng
        for f in w.factories:
            if f.status != "calisiyor" or f.fault or f.canli:
                continue
            if rng.random() < 1 / (1440 * 3.2):
                name, skill, steps = rng.choice(FAULTS)
                dur = rng.randint(25, 110)
                inc = self._new("ariza", name, "uyari", f.id, f"Tahmini duruş {dur} dk",
                                ["Dijital Usta önerisi: " + steps[0]] + steps[1:], key=f"ariza:{f.id}")
                f.set_fault("ariza", w.minute + dur, name, inc["id"])
                w.masters.dispatch(f, skill, inc)
            elif rng.random() < 1 / (1440 * 9):
                dur = rng.randint(40, 120)
                inc = self._new("bakim", "Planlı kestirimci bakım", "bilgi", f.id,
                                f"Model titreşim trendine göre bakım öne çekildi · {dur} dk",
                                ["Yedek parçaları hazırla", "Bakım sonrası deneme üretimi"], key=f"bakim:{f.id}")
                f.set_fault("bakim", w.minute + dur, "Planlı bakım", inc["id"])
        if rng.random() < 1 / (1440 * 3.5):
            cand = [f for f in w.factories if f.status == "calisiyor" and not f.fault]
            if cand and w.logistics.emergency.state == "bos":
                f = rng.choice(cand)
                inc = self._new("yangin", "Yangın alarmı", "kritik", f.id, "Duman dedektörü + ısı sensörü teyitli",
                                ["Tesis tahliye planını başlat", "OSB itfaiyesi yönlendirildi",
                                 "Komşu tesislere bilgi ver, doğalgaz vanasını kapat"], key=f"yangin:{f.id}")
                f.set_fault("durdu", w.minute + 600, "Yangın alarmı — tahliye", inc["id"])
                w.logistics.dispatch_emergency(f, inc["id"])
                inc["kayit"].append((w.minute, "İtfaiye aracı ITF-1 yola çıktı"))
        if rng.random() < 1 / (1440 * 1.2):
            cand = [f for f in w.factories if f.status == "calisiyor"]
            if cand:
                f = rng.choice(cand)
                inc = self._new("isg", "İSG ramak kala bildirimi", "bilgi", f.id,
                                rng.choice(["Forklift yaya geçidinde ani fren", "Pres koruma kapağı açık çalıştırma",
                                            "Kimyasal etiket eksikliği", "Yüksekte çalışmada emniyet kemeri eksik"]),
                                ["Kök neden analizi (5 Neden)", "Ekip toplantısında paylaş"])
                inc["oto_kapat"] = w.minute + 45
        # otomatik kapanışlar
        for inc in self.items:
            if inc["durum"] == "kapandi":
                continue
            if inc["tip"] in ("ariza", "bakim"):
                f = w.fmap.get(inc["fabrika"])
                if f and (not f.fault or f.fault[3] != inc["id"]):
                    self.close(inc, "Ekipman yeniden devrede")
            elif inc.get("oto_kapat") and w.minute >= inc["oto_kapat"]:
                self.close(inc, "Aksiyon kaydı tamamlandı")

    def on_emergency_arrival(self, iid, f):
        inc = self.get(iid)
        if inc:
            inc["durum"] = "mudahale"
            inc["kayit"].append((self.w.minute, "İtfaiye olay yerinde, müdahale başladı"))

    def on_emergency_done(self, iid, f):
        inc = self.get(iid)
        if inc:
            self.close(inc, "Yangın kontrol altında; tesis 60 dk sonra kademeli devreye girecek")
            if f.fault and f.fault[3] == iid:
                f.set_fault("durdu", self.w.minute + 60, "Yangın sonrası güvenlik kontrolü", None)

    # ---------------- çıktı ----------------
    def open(self):
        return [i for i in self.items if i["durum"] != "kapandi"]

    def counts(self):
        o = self.open()
        return {"kritik": sum(1 for i in o if i["seviye"] == "kritik"),
                "uyari": sum(1 for i in o if i["seviye"] == "uyari"),
                "bilgi": sum(1 for i in o if i["seviye"] == "bilgi"), "toplam": len(o)}

    def detail(self, limit=120):
        items = sorted(self.items, key=lambda i: (i["durum"] == "kapandi", -i["zaman"]))[:limit]
        return {"olaylar": items, "sayilar": self.counts()}
