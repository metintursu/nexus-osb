"""Technician Pool: the zone's master technicians are shared between plants.

When a fault opens, the nearest available technician with the right skill is dispatched; on arrival the
Digital Master playbook shortens the remaining downtime. Know-how is no longer locked inside one plant."""
from ..i18n import L, LANG, TN
from . import geo
from .logistics import Truck

SKILLS = {"mekanik": L("Mechanical", "Mekanik"), "hidrolik": L("Hydraulics/Pneumatics", "Hidrolik/Pnömatik"), "elektrik": L("Electrical/Drives", "Elektrik/Sürücü"),
          "otomasyon": L("Automation/PLC", "Otomasyon/PLC"), "yakma": L("Furnaces & Burners", "Fırın & Yakma"), "sogutma": L("Cooling", "Soğutma")}
MASTERS = [
    (L("Hasan Demir", "Hasan Usta"), ["mekanik", "hidrolik"], 31), (L("Ayse Kaya", "Ayşe Usta"), ["otomasyon", "elektrik"], 18),
    (L("Mehmet Celik", "Mehmet Usta"), ["yakma", "mekanik"], 27), (L("Zeynep Arslan", "Zeynep Usta"), ["elektrik", "otomasyon"], 12),
    (L("Ali Yildiz", "Ali Usta"), ["hidrolik", "mekanik"], 22), (L("Fatma Sahin", "Fatma Usta"), ["sogutma", "elektrik"], 15),
    (L("Mustafa Aydin", "Mustafa Usta"), ["mekanik"], 35), (L("Elif Ozturk", "Elif Usta"), ["otomasyon"], 9), (L("Ibrahim Koc", "İbrahim Usta"), ["yakma"], 29),
    (L("Emine Kurt", "Emine Usta"), ["sogutma", "hidrolik"], 16), (L("Osman Polat", "Osman Usta"), ["elektrik", "mekanik"], 24), (L("Derya Acar", "Derya Usta"), ["otomasyon", "hidrolik"], 11),
]
SPEED = 34.0
CUT = 0.45          # share of remaining downtime removed when the technician arrives


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
            inc["kayit"].append((self.w.minute, L(f"{m['ad']} ({SKILLS.get(skill, skill)}) dispatched · ETA ≈{eta:.0f} min", f"{m['ad']} ({SKILLS.get(skill, skill)}) yönlendirildi · varış ≈{TN(eta, 0)} dk")))
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
                            inc["kayit"].append((w.minute, L(f"{m['ad']} on site · Digital Master playbook applied · downtime cut by {cut:.0f} min", f"{m['ad']} olay yerinde · Dijital Usta reçetesi uygulandı · duruş {TN(cut, 0)} dk kısaldı")))
                            if inc["durum"] == "acik":
                                inc["durum"] = "mudahale"
            elif m["durum"] == "mudahalede":
                f = w.fmap[g["fabrika"]]
                if not f.fault:
                    m["mudahale"] += 1
                    m["durum"], m["gorev"] = "musait", None
                    t.state = "bos"
                    self._log(L(f"{m['ad']} finished the job at {f.ad}", f"{m['ad']} {f.ad} görevini tamamladı"))

    def live(self):
        return [[m["id"], round(m["t"].x, 1), round(m["t"].y, 1), m["durum"], 0, "usta"] for m in self.items if m["durum"] != "musait"]

    def detail(self):
        return {"ustalar": [{k: v for k, v in m.items() if k != "t"} | {"x": round(m["t"].x), "y": round(m["t"].y),
                             "ev_ad": self.w.fmap[m["ev"]].ad,
                             "gorev_ad": self.w.fmap[m["gorev"]["fabrika"]].ad if m["gorev"] else None} for m in self.items],
                "toplam": {k: round(v, 1) for k, v in self.total.items()}, "kayit": self.log[::-1][:40], "beceriler": SKILLS}
