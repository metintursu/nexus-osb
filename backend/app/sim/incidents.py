"""Crisis and incident management: faults, fires, OHS near-misses and alarms raised by other modules."""

from ..i18n import L, LANG
FAULTS = [
    (L("Main drive motor excessive vibration", "Ana tahrik motoru aşırı titreşim"), "mekanik", [L("Measure bearing temperature; replace the bearing if vibration exceeds 7 mm/s", "Rulman sıcaklığını ölç; titreşim 7 mm/s üstündeyse rulmanı değiştir"),
                                          L("Laser-check coupling alignment", "Kaplin hizasını lazerle kontrol et"), L("Torque the motor anchor bolts", "Motor ankraj cıvatalarını torkla")]),
    (L("Hydraulic pressure drop", "Hidrolik basınç düşüşü"), "hidrolik", [L("Check filter differential pressure", "Filtre fark basıncını kontrol et"), L("Look for an air leak on the pump suction line", "Pompa emiş hattında hava kaçağı ara"),
                                L("Check oil level and temperature", "Yağ seviyesini ve sıcaklığını kontrol et")]),
    (L("Compressed-air line leak", "Kompresör hattında hava kaçağı"), "hidrolik", [L("Scan for leaks with an ultrasonic detector", "Ultrasonik dedektörle kaçak tara"), L("Isolate the leak and open the backup line", "Kaçak noktasını izole et, yedek hattı aç"),
                                        L("Rent a temporary compressor via the zone marketplace", "Bölge pazaryerinden geçici kompresör kirala")]),
    (L("Servo drive overcurrent fault", "Servo sürücü aşırı akım hatası"), "elektrik", [L("Read the drive fault history", "Sürücü hata geçmişini oku"), L("Insulation-test the motor cable", "Motor kablosunda izolasyon testi yap"),
                                        L("Check the axes by hand for mechanical binding", "Mekanik sıkışma için eksenleri elle kontrol et")]),
    (L("Cooling water temperature high", "Soğutma suyu sıcaklığı yüksek"), "sogutma", [L("Check cooling tower fans and pump flow", "Kule fanlarını ve pompa debisini kontrol et"), L("Inspect the heat exchanger for fouling", "Eşanjör kirlenmesine bak"),
                                       L("Temporarily cut line speed by 20%", "Üretim hızını geçici %20 düşür")]),
    (L("Conveyor belt slipping", "Konveyör bant kayması"), "mekanik", [L("Adjust belt tension", "Bant gerginliğini ayarla"), L("Check the drum lagging", "Tambur kaplamasını kontrol et"), L("Test the speed sensor", "Hız sensörünü test et")]),
    (L("Furnace burner flame-out", "Fırın brülörü alev sönmesi"), "yakma", [L("Clean the flame sensor", "Alev sensörünü temizle"), L("Check the gas pressure regulator", "Gaz basınç regülatörünü kontrol et"),
                                    L("Complete the purge cycle and re-ignite", "Purge döngüsünü tamamlayıp yeniden ateşle")]),
    (L("PLC communication loss", "PLC haberleşme kopması"), "otomasyon", [L("Check switch port status", "Switch port durumlarını kontrol et"), L("Read the PLC CPU status LEDs", "PLC CPU durum LED'lerini oku"),
                                L("Roll back the most recently changed program", "Son değişiklik yapılan programı geri al")]),
]


class Incidents:
    def __init__(self, w):
        self.w = w
        self.items = []
        self._n = 0
        self.keys = {}       # key -> open incident id

    def _new(self, tip, baslik, seviye, fabrika=None, detay="", aksiyonlar=None, key=None):
        self._n += 1
        f = self.w.fmap.get(fabrika) if fabrika else None
        inc = {"id": f"O{self._n:05d}", "tip": tip, "baslik": baslik, "seviye": seviye,
               "fabrika": fabrika, "fabrika_ad": f.ad if f else None, "x": f.cx if f else None, "y": f.cy if f else None,
               "zaman": self.w.minute, "durum": "acik", "detay": detay, "aksiyonlar": aksiyonlar or [],
               "kayit": [(self.w.minute, L("Incident opened", "Olay açıldı"))], "key": key, "kapanis": None}
        self.items.append(inc)
        if key:
            self.keys[key] = inc["id"]
        if len(self.items) > 400:
            self.items = [i for i in self.items if i["durum"] != "kapandi"][-200:] + []
        self.w.log("olay", L(f"[{dict(kritik='CRITICAL', uyari='WARNING', bilgi='INFO').get(seviye, seviye.upper())}] {baslik}", f"[{seviye.upper()}] {baslik}") + (f" — {f.ad}" if f else ""), inc)
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
            inc["kayit"].append((self.w.minute, L("Operator started the response", "Operatör müdahaleyi başlattı")))
        elif act == "kapat":
            self.close(inc, L("Closed by operator", "Operatör tarafından kapatıldı"))
        return inc

    # ---------------- incident generation ----------------
    def tick(self):
        w, rng = self.w, self.w.rng
        for f in w.factories:
            if f.status != "calisiyor" or f.fault or f.canli:
                continue
            if rng.random() < 1 / (1440 * 3.2):
                name, skill, steps = rng.choice(FAULTS)
                dur = rng.randint(25, 110)
                inc = self._new("ariza", name, "uyari", f.id, L(f"Estimated downtime {dur} min", f"Tahmini duruş {dur} dk"),
                                [L("Digital Master advice: ", "Dijital Usta önerisi: ") + steps[0]] + steps[1:], key=f"ariza:{f.id}")
                f.set_fault("ariza", w.minute + dur, name, inc["id"])
                w.masters.dispatch(f, skill, inc)
            elif rng.random() < 1 / (1440 * 9):
                dur = rng.randint(40, 120)
                inc = self._new("bakim", L("Planned predictive maintenance", "Planlı kestirimci bakım"), "bilgi", f.id,
                                L(f"Maintenance brought forward based on the vibration trend · {dur} min", f"Model titreşim trendine göre bakım öne çekildi · {dur} dk"),
                                [L("Prepare spare parts", "Yedek parçaları hazırla"), L("Trial run after maintenance", "Bakım sonrası deneme üretimi")], key=f"bakim:{f.id}")
                f.set_fault("bakim", w.minute + dur, L("Planned maintenance", "Planlı bakım"), inc["id"])
        if rng.random() < 1 / (1440 * 3.5):
            cand = [f for f in w.factories if f.status == "calisiyor" and not f.fault]
            if cand and w.logistics.emergency.state == "bos":
                f = rng.choice(cand)
                inc = self._new("yangin", L("Fire alarm", "Yangın alarmı"), "kritik", f.id, L("Confirmed by smoke detector + heat sensor", "Duman dedektörü + ısı sensörü teyitli"),
                                [L("Start the site evacuation plan", "Tesis tahliye planını başlat"), L("Zone fire brigade dispatched", "OSB itfaiyesi yönlendirildi"),
                                 L("Notify neighbouring sites, close the gas valve", "Komşu tesislere bilgi ver, doğalgaz vanasını kapat")], key=f"yangin:{f.id}")
                f.set_fault("durdu", w.minute + 600, L("Fire alarm — evacuation", "Yangın alarmı — tahliye"), inc["id"])
                w.logistics.dispatch_emergency(f, inc["id"])
                inc["kayit"].append((w.minute, L("Fire engine FIRE-1 dispatched", "İtfaiye aracı ITF-1 yola çıktı")))
        if rng.random() < 1 / (1440 * 1.2):
            cand = [f for f in w.factories if f.status == "calisiyor"]
            if cand:
                f = rng.choice(cand)
                inc = self._new("isg", L("OHS near-miss report", "İSG ramak kala bildirimi"), "bilgi", f.id,
                                rng.choice([L("Forklift hard braking at a pedestrian crossing", "Forklift yaya geçidinde ani fren"), L("Press operated with the guard open", "Pres koruma kapağı açık çalıştırma"),
                                            L("Missing chemical label", "Kimyasal etiket eksikliği"), L("Working at height without a harness", "Yüksekte çalışmada emniyet kemeri eksik")]),
                                [L("Root-cause analysis (5 Whys)", "Kök neden analizi (5 Neden)"), L("Share at the team briefing", "Ekip toplantısında paylaş")])
                inc["oto_kapat"] = w.minute + 45
        # automatic closures
        for inc in self.items:
            if inc["durum"] == "kapandi":
                continue
            if inc["tip"] in ("ariza", "bakim"):
                f = w.fmap.get(inc["fabrika"])
                if f and (not f.fault or f.fault[3] != inc["id"]):
                    self.close(inc, L("Equipment back in service", "Ekipman yeniden devrede"))
            elif inc.get("oto_kapat") and w.minute >= inc["oto_kapat"]:
                self.close(inc, L("Action record completed", "Aksiyon kaydı tamamlandı"))

    def on_emergency_arrival(self, iid, f):
        inc = self.get(iid)
        if inc:
            inc["durum"] = "mudahale"
            inc["kayit"].append((self.w.minute, L("Fire brigade on site, response under way", "İtfaiye olay yerinde, müdahale başladı")))

    def on_emergency_done(self, iid, f):
        inc = self.get(iid)
        if inc:
            self.close(inc, L("Fire under control; the site will restart gradually in 60 min", "Yangın kontrol altında; tesis 60 dk sonra kademeli devreye girecek"))
            if f.fault and f.fault[3] == iid:
                f.set_fault("durdu", self.w.minute + 60, L("Post-fire safety check", "Yangın sonrası güvenlik kontrolü"), None)

    # ---------------- output ----------------
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
