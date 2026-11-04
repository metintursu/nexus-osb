"""Usta Havuzu: bölgedeki uzman teknisyenler tesisler arasında paylaşılır.

Arıza açıldığında doğru uzmanlıktaki en yakın müsait usta yönlendirilir; olay yerine varınca
Dijital Usta reçetesiyle kalan duruşu kısaltır. Usta bilgisi tek fabrikaya kilitli kalmaz."""
from . import geo
from .logistics import Truck

SKILLS = {"mekanik": "Mekanik", "hidrolik": "Hidrolik/Pnömatik", "elektrik": "Elektrik/Sürücü",
          "otomasyon": "Otomasyon/PLC", "yakma": "Fırın & Yakma", "sogutma": "Soğutma"}
MASTERS = [
    ("Hasan Usta", ["mekanik", "hidrolik"], 31), ("Ayşe Usta", ["otomasyon", "elektrik"], 18),
    ("Mehmet Usta", ["yakma", "mekanik"], 27), ("Zeynep Usta", ["elektrik", "otomasyon"], 12),
    ("Ali Usta", ["hidrolik", "mekanik"], 22), ("Fatma Usta", ["sogutma", "elektrik"], 15),
    ("Mustafa Usta", ["mekanik"], 35), ("Elif Usta", ["otomasyon"], 9), ("İbrahim Usta", ["yakma"], 29),
    ("Emine Usta", ["sogutma", "hidrolik"], 16), ("Osman Usta", ["elektrik", "mekanik"], 24), ("Derya Usta", ["otomasyon", "hidrolik"], 11),
]
SPEED = 34.0
CUT = 0.45          # usta varınca kalan duruşun kısalma oranı


class Masters:
    def __init__(self, w):
        self.w = w
        self.items = []
        homes = [f for f in w.factories if f.sektor != "biyogaz"]
        for i, (ad, sk, yil) in enumerate(MASTERS):
            home = homes[(i * 7) % len(homes)]
            t = Truck(f"U{i+1:02d}", ad, home.seg, "usta")
            self.items.append({"id": t.id, "ad": ad, "uzmanlik": sk, "kidem": yil, "ev": home.id, "t": t,
                               "durum": "musait", "gorev": None, "mudahale": 0, "kazanilan_dk": 0.0})
        self.total = {"gorev": 0, "kazanilan_dk": 0.0, "ulasilamayan": 0}
        self.log = []

    def dispatch(self, f, skill, inc):
        cand = [m for m in self.items if m["durum"] == "musait" and skill in m["uzmanlik"]]
        if not cand:
            cand = [m for m in self.items if m["durum"] == "musait"]
        if not cand:
            self.total["ulasilamayan"] += 1
            return None
        m = min(cand, key=lambda x: geo.manhattan((x["t"].x, x["t"].y), (f.cx, f.cy)) - x["kidem"] * 4)
        t = m["t"]
        t.go(geo.route(t.loc, f.seg))
        t.state = "gidiyor"
        m["durum"], m["gorev"] = "yolda", {"fabrika": f.id, "olay": inc["id"] if inc else None, "beceri": skill}
        self.total["gorev"] += 1
        eta = geo.path_length(t.path) / SPEED
        if inc:
            inc["kayit"].append((self.w.minute, f"{m['ad']} ({SKILLS.get(skill, skill)}) yönlendirildi · varış ≈{eta:.0f} dk"))
            inc["usta"] = m["ad"]
        self._log(f"{m['ad']} → {f.ad} ({SKILLS.get(skill, skill)})")
        return m

    def _log(self, text):
        self.log.append({"t": self.w.minute, "metin": text})
        if len(self.log) > 80:
            del self.log[0]

    def tick(self):
        w = self.w
        for m in self.items:
            t, g = m["t"], m["gorev"]
            if m["durum"] == "yolda":
                arrived, _ = t.advance(SPEED)
                if arrived:
                    f = w.fmap[g["fabrika"]]
                    t.loc = f.seg
                    m["durum"] = "mudahalede"
                    t.state = "mudahale"
                    if f.fault:
                        rem = f.fault[1] - w.minute
                        cut = rem * CUT
                        f.fault = (f.fault[0], int(f.fault[1] - cut), f.fault[2], f.fault[3])
                        m["kazanilan_dk"] += cut
                        self.total["kazanilan_dk"] += cut
                        inc = w.incidents.get(g["olay"]) if g["olay"] else None
                        if inc:
                            inc["kayit"].append((w.minute, f"{m['ad']} olay yerinde · Dijital Usta reçetesi uygulandı · duruş {cut:.0f} dk kısaldı"))
                            if inc["durum"] == "acik":
                                inc["durum"] = "mudahale"
            elif m["durum"] == "mudahalede":
                f = w.fmap[g["fabrika"]]
                if not f.fault:
                    m["mudahale"] += 1
                    m["durum"], m["gorev"] = "musait", None
                    t.state = "bos"
                    self._log(f"{m['ad']} {f.ad} görevini tamamladı")

    def live(self):
        return [[m["id"], round(m["t"].x, 1), round(m["t"].y, 1), m["durum"], 0, "usta"] for m in self.items if m["durum"] != "musait"]

    def detail(self):
        return {"ustalar": [{k: v for k, v in m.items() if k != "t"} | {"x": round(m["t"].x), "y": round(m["t"].y),
                             "ev_ad": self.w.fmap[m["ev"]].ad,
                             "gorev_ad": self.w.fmap[m["gorev"]["fabrika"]].ad if m["gorev"] else None} for m in self.items],
                "toplam": {k: round(v, 1) for k, v in self.total.items()}, "kayit": self.log[::-1][:40], "beceriler": SKILLS}
