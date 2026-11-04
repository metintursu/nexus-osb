"""Talking Factories: every plant has a software agent with its own personality.

Agents negotiate with each other using Zone Credits:
  · Flexibility auction — when the grid/a substation is tight, the zone buys load reduction and plants bid.
  · Waste bargaining — producer and buyer converge on a symbiosis price through mutual concessions.
  · Truck sharing — two half-full shipments to the same gate are merged into one truck.
Messages are spread over simulated minutes so they flow "live"; the outcome is really applied to the simulation."""
from .data import WASTE
from . import geo

TRAITS = {
    "tutumlu":   {"ad": "Thrifty",   "taviz": 0.07, "fiyat": 1.22},
    "uzlasmaci": {"ad": "Cooperative", "taviz": 0.16, "fiyat": 1.00},
    "yesil":     {"ad": "Green",     "taviz": 0.20, "fiyat": 0.92},
    "aceleci":   {"ad": "Hasty",     "taviz": 0.24, "fiyat": 1.08},
}
CEIL = 4200      # flexibility price cap ₺/MWh


def n(x, d=0):
    """Number format: 12,345.6"""
    return f"{x:,.{d}f}"


class Agents:
    def __init__(self, w):
        self.w = w
        rng = w.rng
        self.trait = {f.id: rng.choice(list(TRAITS)) for f in w.factories}
        self.kredi = {f.id: 0.0 for f in w.factories}
        self.kredi["osb"] = 0.0
        self.ledger = []
        self.rooms = []
        self.msgs = []
        self.otonom = False
        self.enabled = True
        self._n = 0
        self._last = {"esneklik": -999, "atik": -999, "kamyon": -999}
        self.stats = {"oda": 0, "anlasma": 0, "basarisiz": 0, "esneklik_mwh": 0.0, "birlesen_sefer": 0}

    # ------------------------------------------------------------ helpers
    def _room(self, tur, konu, taraflar):
        self._n += 1
        r = {"id": f"M{self._n:04d}", "tur": tur, "konu": konu, "durum": "suruyor", "taraflar": taraflar,
             "baslangic": self.w.minute, "sonuc": None, "script": [], "veri": {}}
        self.rooms.append(r)
        self.stats["oda"] += 1
        if len(self.rooms) > 80:
            self.rooms = [x for x in self.rooms if x["durum"] == "suruyor"] + [x for x in self.rooms if x["durum"] != "suruyor"][-60:]
        return r

    def _say(self, r, dt, kim, metin, tip="mesaj", cb=None):
        r["script"].append({"at": self.w.minute + dt, "kim": kim, "metin": metin, "tip": tip, "cb": cb})

    def _name(self, kim):
        if kim == "osb":
            return "Zone Management"
        if kim == "beyin":
            return "Zone Brain"
        return self.w.fmap[kim].ad

    def _pay(self, frm, to, amt, why):
        self.kredi[frm] = self.kredi.get(frm, 0) - amt
        self.kredi[to] = self.kredi.get(to, 0) + amt
        self.ledger.append({"t": self.w.minute, "kimden": self._name(frm), "kime": self._name(to), "tutar": round(amt), "neden": why})
        if len(self.ledger) > 200:
            del self.ledger[0]

    def _active(self, tur):
        return any(r["tur"] == tur and r["durum"] == "suruyor" for r in self.rooms)

    # ------------------------------------------------------------ main loop
    def tick(self):
        w = self.w
        if not self.enabled:
            return
        for r in self.rooms:
            if r["durum"] != "suruyor":
                continue
            due = [s for s in r["script"] if s["at"] <= w.minute]
            for s in due:
                r["script"].remove(s)
                if s["metin"]:
                    self.msgs.append({"t": w.minute, "oda": r["id"], "tur": r["tur"], "kim": s["kim"], "ad": self._name(s["kim"]),
                                      "metin": s["metin"], "tip": s["tip"],
                                      "kisilik": TRAITS[self.trait[s["kim"]]]["ad"] if s["kim"] in self.trait else None})
                if s["cb"]:
                    s["cb"](r)
            if not r["script"] and r["durum"] == "suruyor":
                r["durum"] = "anlasma" if r["sonuc"] and r["sonuc"].get("ok") else "basarisiz"
                self.stats["anlasma" if r["durum"] == "anlasma" else "basarisiz"] += 1
        if len(self.msgs) > 400:
            self.msgs = self.msgs[-300:]
        e = w.energy
        if not w.outage and e.dr_enabled and not self._active("esneklik") and w.minute - self._last["esneklik"] > 90:
            worst = max(e.tms, key=lambda t: t["oran"])
            if e.grid_kw > e.contract_kw * 0.96 or worst["oran"] > 0.96:
                self._flex(worst)
        if not self._active("atik") and w.minute - self._last["atik"] > 180 and w.symbiosis.opps:
            self._waste()
        if not self._active("kamyon") and w.minute - self._last["kamyon"] > 120:
            self._trucks()

    # ------------------------------------------------------------ flexibility auction
    def _flex(self, worst):
        w, e, rng = self.w, self.w.energy, self.w.rng
        self._last["esneklik"] = w.minute
        need = max(2500.0, e.grid_kw - e.contract_kw * 0.92, (worst["oran"] - 0.92) * worst["kapasite_kw"])
        cand = [f for f in w.factories if f.s["esnek"] > 0 and f.status == "calisiyor" and f.dr == 0]
        rng.shuffle(cand)
        cand = cand[:7]
        if len(cand) < 2:
            return
        r = self._room("esneklik", f"{n(need/1000, 1)} MW flexibility auction", ["osb"] + [f.id for f in cand])
        self._say(r, 0, "osb", f"⚡ Flexibility auction open: I need {n(need/1000, 1)} MW of load reduction for the next 60 min. "
                               f"Cap ₺{n(CEIL)}/MWh, paid in Zone Credits. {worst['id']} is at {n(worst['oran']*100)}% right now.", "cagri")
        bids = []
        for i, f in enumerate(cand):
            tr = TRAITS[self.trait[f.id]]
            kw = f.rated_kw * f.s["esnek"] * f.load
            price = round(1900 * tr["fiyat"] * rng.uniform(0.85, 1.25) / 50) * 50
            bids.append([f, kw, price])
            line = rng.choice([
                f"I can give {n(kw/1000, 2)} MW at ₺{n(price)}/MWh.",
                f"I'll shift compressors and pre-heating: {n(kw/1000, 2)} MW, my price is ₺{n(price)}/MWh.",
                f"I can slow the line for half an hour. For {n(kw/1000, 2)} MW I want ₺{n(price)}/MWh.",
                f"{n(kw/1000, 2)} MW from us. I won't go below ₺{n(price)}/MWh.",
            ])
            self._say(r, 1 + i, f.id, line, "teklif")
        over = [b for b in bids if b[2] > CEIL]
        t = 2 + len(cand)
        for b in over[:2]:
            f = b[0]
            tr = TRAITS[self.trait[f.id]]
            self._say(r, t, "osb", f"{f.ad}, your bid is above the cap. Will you come down to ₺{n(CEIL)}/MWh?", "karsi")
            if tr["taviz"] >= 0.15:
                b[2] = CEIL
                self._say(r, t + 1, f.id, f"OK, ₺{n(CEIL)}/MWh accepted.", "kabul")
            else:
                b[2] = 10 ** 9
                self._say(r, t + 1, f.id, "I can't risk my production at that price, count me out.", "red")
            t += 2

        def clear(room):
            got, win = 0.0, []
            for f, kw, price in sorted(bids, key=lambda b: b[2]):
                if price > CEIL or got >= need:
                    continue
                if f.status != "calisiyor":
                    continue
                win.append((f, kw, price))
                got += kw
            if not win:
                room["sonuc"] = {"ok": False}
                return
            for f, kw, price in win:
                f.dr, f.dr_until = f.s["esnek"], w.minute + 60
                self._pay("osb", f.id, kw / 1000 * price, "Flexibility auction")
            e.today["dr_olay"] += 1
            mwh = got / 1000
            self.stats["esneklik_mwh"] += mwh
            avg = sum(p * k for _, k, p in win) / got
            room["sonuc"] = {"ok": True, "mw": round(mwh, 2), "ort_fiyat": round(avg), "kazanan": [f.ad for f, _, _ in win]}
            self.msgs.append({"t": w.minute, "oda": room["id"], "tur": "esneklik", "kim": "osb", "ad": "Zone Management", "tip": "sonuc", "kisilik": None,
                              "metin": f"✅ Auction closed: {len(win)} sites, {n(mwh, 2)} MW in total, average ₺{n(avg)}/MWh. "
                                       f"Winners: {', '.join(f.ad for f, _, _ in win)}. Load shifting has started."})
            w.log("muzakere", f"Flexibility auction: {len(win)} sites {n(mwh, 1)} MW")
        self._say(r, t + 1, "osb", "", "sonuc", clear)

    # ------------------------------------------------------------ waste bargaining
    def _waste(self):
        w, rng = self.w, self.w.rng
        self._last["atik"] = w.minute
        busy = {r["veri"].get("opp") for r in self.rooms[-20:]}
        opps = [o for o in w.symbiosis.opps[:8] if o["id"] not in busy]
        if not opps:
            return
        o = rng.choice(opps[:4])
        P, C = w.fmap[o["ureten"]], w.fmap[o["alan"]]
        tp, tc = TRAITS[self.trait[P.id]], TRAITS[self.trait[C.id]]
        v = WASTE[o["atik"]]["deger"]
        unit = WASTE[o["atik"]]["birim"]
        ask, bid = v * 0.85 * tp["fiyat"], v * 0.35 / tc["fiyat"]
        if self.trait[C.id] == "yesil":
            bid *= 1.15
        r = self._room("atik", f"{o['atik_ad']}: {P.ad} → {C.ad}", [P.id, C.id])
        r["veri"]["opp"] = o["id"]
        self._say(r, 0, P.id, rng.choice([
            f"I produce about {n(o['aylik_miktar'])} {unit} of {o['atik_ad'].lower()} a month. Rather than paying for disposal, I can sell it to you: ₺{n(ask)}/{unit}.",
            f"My {o['atik_ad'].lower()} stock keeps piling up. I'm {o['mesafe_km']} km away and can supply you regularly at ₺{n(ask)}/{unit}."]), "teklif")
        self._say(r, 2, C.id, rng.choice([
            f"It works for me as raw material, but {n(ask)} is too much. I can offer ₺{n(bid)}/{unit}.",
            f"Interested. I have pre-processing costs, so ₺{n(bid)}/{unit} would be fair."]), "karsi")
        t, ok = 4, False
        for rnd in range(5):
            gap = ask - bid
            if gap / ask < 0.08:
                ok = True
                break
            ask -= gap * tp["taviz"]
            bid += gap * tc["taviz"]
            if rnd % 2 == 0:
                self._say(r, t, P.id, f"₺{n(ask)}/{unit}. I'll organise the transport.", "karsi")
            else:
                self._say(r, t, C.id, f"I can go up to ₺{n(bid)}/{unit} with an annual contract.", "karsi")
            t += 2
        price = (ask + bid) / 2
        if not ok:
            self._say(r, t, C.id, "We can't agree this round, the price gap is too wide. Let's talk again next month.", "red")
            self._say(r, t + 1, "beyin", f"Note: the price gap is {n((ask-bid)/ask*100)}%. The disposal fee (₺1,150/t) is a loss for both sides.", "bilgi",
                      lambda room: room.update(sonuc={"ok": False}))
            return
        self._say(r, t, P.id, f"Deal: ₺{n(price)}/{unit}.", "kabul")

        def seal(room):
            room["sonuc"] = {"ok": True, "fiyat": round(price), "birim": unit, "opp": o["id"], "onay": False,
                             "aylik_tl": round(price * o["aylik_miktar"])}
            if self.otonom or w.autopilot.enabled:
                link = w.symbiosis.approve(o["id"])
                if link:
                    link["fiyat"] = round(price)
                    w.symbiosis.compute_opps()
                    room["sonuc"]["onay"] = True
                    text = f"🤝 Contract signed and link {link['lid']} is live. ≈₺{n(price*o['aylik_miktar'])} of trade per month."
                else:
                    text = "The opportunity is no longer valid."
            else:
                text = f"🤝 The parties agreed on ₺{n(price)}/{unit}. Awaiting zone approval (approve it in the Negotiation Room)."
            self.msgs.append({"t": w.minute, "oda": room["id"], "tur": "atik", "kim": "osb", "ad": "Zone Management", "tip": "sonuc", "kisilik": None, "metin": text})
            w.log("muzakere", f"Waste deal: {o['atik_ad']} {P.ad} → {C.ad} @ ₺{n(price)}/{unit}")
        self._say(r, t + 1, C.id, rng.choice(["Accepted, let's sign.", "Done, we have a deal."]), "kabul", seal)

    def approve(self, room_id):
        r = next((x for x in self.rooms if x["id"] == room_id), None)
        if not r or not r["sonuc"] or not r["sonuc"].get("ok") or r["sonuc"].get("onay") or r["tur"] != "atik":
            return None
        link = self.w.symbiosis.approve(r["sonuc"]["opp"])
        if link:
            link["fiyat"] = r["sonuc"]["fiyat"]
            r["sonuc"]["onay"] = True
            self.w.symbiosis.compute_opps()
            self.msgs.append({"t": self.w.minute, "oda": r["id"], "tur": "atik", "kim": "osb", "ad": "Zone Management", "tip": "sonuc", "kisilik": None,
                              "metin": f"✅ Approved by the zone, link {link['lid']} is live."})
        return link

    # ------------------------------------------------------------ truck sharing
    def _trucks(self):
        w = self.w
        self._last["kamyon"] = w.minute
        pend = [o for o in w.logistics.orders if o.durum == "bekliyor" and o.tip == "sevkiyat" and o.yuk <= 11]
        for i, a in enumerate(pend):
            for b in pend[i + 1:]:
                if a.dst == b.dst and a.src != b.src and a.yuk + b.yuk <= 20:
                    A, B = w.fmap[a.src[1]], w.fmap[b.src[1]]
                    km = geo.manhattan((A.cx, A.cy), (B.cx, B.cy)) * geo.UNIT_KM
                    gate = geo.GATES[a.dst[1]]["ad"]
                    r = self._room("kamyon", f"Load pooling · {gate}", [A.id, B.id])
                    self._say(r, 0, A.id, f"I have a {n(a.yuk, 1)} t shipment to {gate}; the truck will leave half empty. Anyone want to share it?", "cagri")
                    self._say(r, 1, B.id, f"We have {n(b.yuk, 1)} t for the same gate, {n(km, 1)} km away. Pick us up first and let's combine.", "teklif")

                    def merge(room, a=a, b=b, A=A, B=B):
                        if a.durum == "bekliyor" and b.durum == "bekliyor" and b in w.logistics.orders:
                            a.yuk += b.yuk
                            a.urun = f"{a.urun} + {b.urun}"
                            w.logistics.orders.remove(b)
                            self.stats["birlesen_sefer"] += 1
                            self._pay(B.id, A.id, 650, "Truck sharing")
                            room["sonuc"] = {"ok": True}
                            self.msgs.append({"t": w.minute, "oda": room["id"], "tur": "kamyon", "kim": "osb", "ad": "Zone Management", "tip": "sonuc", "kisilik": None,
                                              "metin": f"✅ Two shipments merged into one truck ({n(a.yuk, 1)} t). One trip saved, ≈{n(km*2+6)} km and fuel."})
                        else:
                            room["sonuc"] = {"ok": False}
                    self._say(r, 2, A.id, "Deal, just pay the sharing fee in credits.", "kabul", merge)
                    return

    # ------------------------------------------------------------ output
    def detail(self):
        w = self.w
        board = sorted(((k, v) for k, v in self.kredi.items() if k != "osb"), key=lambda x: -x[1])
        return {"mesajlar": self.msgs[-160:], "odalar": [{k: v for k, v in r.items() if k not in ("script",)} for r in self.rooms[::-1][:40]],
                "kredi": [{"id": k, "ad": w.fmap[k].ad, "kredi": round(v), "kisilik": TRAITS[self.trait[k]]["ad"]} for k, v in board],
                "osb_kredi": round(self.kredi["osb"]), "defter": self.ledger[::-1][:60], "otonom": self.otonom,
                "istatistik": {k: round(v, 2) for k, v in self.stats.items()},
                "kisilikler": {k: v["ad"] for k, v in TRAITS.items()}}

    def live_last(self):
        return self.msgs[-1] if self.msgs else None
