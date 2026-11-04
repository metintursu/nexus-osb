"""Crisis and incident management: faults, fires, OHS near-misses and alarms raised by other modules."""

FAULTS = [
    ("Main drive motor excessive vibration", "mekanik", ["Measure bearing temperature; replace the bearing if vibration exceeds 7 mm/s",
                                          "Laser-check coupling alignment", "Torque the motor anchor bolts"]),
    ("Hydraulic pressure drop", "hidrolik", ["Check filter differential pressure", "Look for an air leak on the pump suction line",
                                "Check oil level and temperature"]),
    ("Compressed-air line leak", "hidrolik", ["Scan for leaks with an ultrasonic detector", "Isolate the leak and open the backup line",
                                        "Rent a temporary compressor via the zone marketplace"]),
    ("Servo drive overcurrent fault", "elektrik", ["Read the drive fault history", "Insulation-test the motor cable",
                                        "Check the axes by hand for mechanical binding"]),
    ("Cooling water temperature high", "sogutma", ["Check cooling tower fans and pump flow", "Inspect the heat exchanger for fouling",
                                       "Temporarily cut line speed by 20%"]),
    ("Conveyor belt slipping", "mekanik", ["Adjust belt tension", "Check the drum lagging", "Test the speed sensor"]),
    ("Furnace burner flame-out", "yakma", ["Clean the flame sensor", "Check the gas pressure regulator",
                                    "Complete the purge cycle and re-ignite"]),
    ("PLC communication loss", "otomasyon", ["Check switch port status", "Read the PLC CPU status LEDs",
                                "Roll back the most recently changed program"]),
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
               "kayit": [(self.w.minute, "Incident opened")], "key": key, "kapanis": None}
        self.items.append(inc)
        if key:
            self.keys[key] = inc["id"]
        if len(self.items) > 400:
            self.items = [i for i in self.items if i["durum"] != "kapandi"][-200:] + []
        self.w.log("olay", f"[{dict(kritik='CRITICAL', uyari='WARNING', bilgi='INFO').get(seviye, seviye.upper())}] {baslik}" + (f" — {f.ad}" if f else ""), inc)
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
            inc["kayit"].append((self.w.minute, "Operator started the response"))
        elif act == "kapat":
            self.close(inc, "Closed by operator")
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
                inc = self._new("ariza", name, "uyari", f.id, f"Estimated downtime {dur} min",
                                ["Digital Master advice: " + steps[0]] + steps[1:], key=f"ariza:{f.id}")
                f.set_fault("ariza", w.minute + dur, name, inc["id"])
                w.masters.dispatch(f, skill, inc)
            elif rng.random() < 1 / (1440 * 9):
                dur = rng.randint(40, 120)
                inc = self._new("bakim", "Planned predictive maintenance", "bilgi", f.id,
                                f"Maintenance brought forward based on the vibration trend · {dur} min",
                                ["Prepare spare parts", "Trial run after maintenance"], key=f"bakim:{f.id}")
                f.set_fault("bakim", w.minute + dur, "Planned maintenance", inc["id"])
        if rng.random() < 1 / (1440 * 3.5):
            cand = [f for f in w.factories if f.status == "calisiyor" and not f.fault]
            if cand and w.logistics.emergency.state == "bos":
                f = rng.choice(cand)
                inc = self._new("yangin", "Fire alarm", "kritik", f.id, "Confirmed by smoke detector + heat sensor",
                                ["Start the site evacuation plan", "Zone fire brigade dispatched",
                                 "Notify neighbouring sites, close the gas valve"], key=f"yangin:{f.id}")
                f.set_fault("durdu", w.minute + 600, "Fire alarm — evacuation", inc["id"])
                w.logistics.dispatch_emergency(f, inc["id"])
                inc["kayit"].append((w.minute, "Fire engine FIRE-1 dispatched"))
        if rng.random() < 1 / (1440 * 1.2):
            cand = [f for f in w.factories if f.status == "calisiyor"]
            if cand:
                f = rng.choice(cand)
                inc = self._new("isg", "OHS near-miss report", "bilgi", f.id,
                                rng.choice(["Forklift hard braking at a pedestrian crossing", "Press operated with the guard open",
                                            "Missing chemical label", "Working at height without a harness"]),
                                ["Root-cause analysis (5 Whys)", "Share at the team briefing"])
                inc["oto_kapat"] = w.minute + 45
        # automatic closures
        for inc in self.items:
            if inc["durum"] == "kapandi":
                continue
            if inc["tip"] in ("ariza", "bakim"):
                f = w.fmap.get(inc["fabrika"])
                if f and (not f.fault or f.fault[3] != inc["id"]):
                    self.close(inc, "Equipment back in service")
            elif inc.get("oto_kapat") and w.minute >= inc["oto_kapat"]:
                self.close(inc, "Action record completed")

    def on_emergency_arrival(self, iid, f):
        inc = self.get(iid)
        if inc:
            inc["durum"] = "mudahale"
            inc["kayit"].append((self.w.minute, "Fire brigade on site, response under way"))

    def on_emergency_done(self, iid, f):
        inc = self.get(iid)
        if inc:
            self.close(inc, "Fire under control; the site will restart gradually in 60 min")
            if f.fault and f.fault[3] == iid:
                f.set_fault("durdu", self.w.minute + 60, "Post-fire safety check", None)

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
