"""Hidrojen Vadisi: kendi güneş sahasıyla beslenen elektrolizör, H2 deposu ve döküm/metal fırınlarına
doğalgaz yerine yeşil hidrojen karışımı (blend). Şebekeden elektrik çekmez; bu yüzden üretilen H2 yeşildir."""
import math

KWH_PER_KG = 53.0          # elektrolizör tüketimi (sistem dahil)
GAS_M3_PER_KG = 3.2        # 1 kg H2 ≈ 3,2 m³ doğalgazın ısıl değeri
MAX_BLEND = 0.30           # fırın brülörlerinde en fazla %30 hacimsel/enerji karışımı
USERS = ("dokum", "metal")


class Hydrogen:
    def __init__(self, w, parcel):
        self.p = parcel
        self.pv_kwp = 12000.0
        self.ely_kw = 6000.0
        self.store_kg, self.cap_kg = 400.0, 2500.0
        self.enabled = parcel is not None
        self.frac = 0.0             # bir önceki dakikada kullanıcılara verilen gaz ikame oranı
        self.pv_kw = self.ely_load = self.prod_kgh = self.use_kgh = 0.0
        self.today = self._zero()
        self.total = self._zero()

    @staticmethod
    def _zero():
        return {"uretim_kg": 0.0, "kullanim_kg": 0.0, "gaz_ikame_m3": 0.0, "kacinilan_co2_kg": 0.0, "tasarruf_tl": 0.0}

    def tick(self, w):
        if self.p is None:
            return
        e = w.energy
        self.pv_kw = self.pv_kwp * e.sun(w.hour) * e.cloud * w.mods["panel"] if self.enabled else 0.0
        self.ely_load = min(self.ely_kw, self.pv_kw)
        made = self.ely_load / 60 / KWH_PER_KG
        room = self.cap_kg - self.store_kg
        made = min(made, room)
        self.store_kg += made
        users = [f for f in w.factories if f.sektor in USERS and f.status == "calisiyor"]
        gas_m3_min = sum(f.gas_m3h for f in users) / 60 / max(1e-6, 1 - self.frac)   # ikame öncesi talep
        want_kg = gas_m3_min * MAX_BLEND / GAS_M3_PER_KG if self.enabled else 0.0
        used = min(self.store_kg, want_kg)
        self.store_kg -= used
        self.frac = (used * GAS_M3_PER_KG / gas_m3_min) if gas_m3_min > 0 else 0.0
        self.prod_kgh, self.use_kgh = made * 60, used * 60
        m3 = used * GAS_M3_PER_KG
        for acc in (self.today, self.total):
            acc["uretim_kg"] += made
            acc["kullanim_kg"] += used
            acc["gaz_ikame_m3"] += m3
            acc["kacinilan_co2_kg"] += m3 * 1.93
            acc["tasarruf_tl"] += m3 * 14.5 * w.mods["gaz_fiyat"]

    def reset_day(self):
        self.today = self._zero()

    def live(self):
        return {"pv": round(self.pv_kw), "stok": round(self.store_kg), "doluluk": round(self.store_kg / self.cap_kg, 3),
                "uretim": round(self.prod_kgh, 1), "kullanim": round(self.use_kgh, 1), "oran": round(self.frac, 3),
                "aktif": self.enabled}

    def detail(self):
        return {**self.live(), "pv_kwp": self.pv_kwp, "ely_kw": self.ely_kw, "kapasite_kg": self.cap_kg,
                "ely_yuk": round(self.ely_load), "max_karisim": MAX_BLEND,
                "bugun": {k: round(v, 1) for k, v in self.today.items()},
                "toplam": {k: round(v, 1) for k, v in self.total.items()}}
