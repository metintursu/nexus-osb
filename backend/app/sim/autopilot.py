"""Autopilot: applies the Zone Brain's recommendations without waiting for a human.

Every 10 simulated minutes it scans the zone, applies any rule that fires and writes the
decision with its reason to the decision log. Irreversible or investment-heavy decisions
(e.g. an expensive pipeline) above a threshold are left for human approval."""
from .agents import n as tn

RULES = {
    "trafo": "When a substation passes 95%, shift its flexible loads by 45 min",
    "sozlesme": "Zone-wide flexibility call when grid draw exceeds contracted capacity",
    "bess": "Keep the battery in auto mode (peak shaving + evening peak)",
    "puant": "Lower the battery reserve at 15:30–17:00 to prepare for the peak, then restore it",
    "havuz": "Open the shared fleet pool if the empty-km share exceeds 35%",
    "simbiyoz": "Set up symbiosis links worth over ₺50k/month with payback under 24 months (max 1 per hour)",
    "pazar": "Turn money-saving capacity matches into contracts (max 1 per hour)",
    "su": "Keep water reuse at 25% or more; if the plant exceeds 100%, flex high-COD sites",
    "kesinti": "During a grid outage, release the battery reserve to critical loads",
    "olay": "Start the response on open faults and dispatch a technician if none is assigned",
}


class Autopilot:
    def __init__(self, w):
        self.w = w
        self.enabled = False
        self.rules = {k: True for k in RULES}
        self.log = []
        self.pending = []           # awaiting human approval
        self.stats = {"karar": 0, "tahmini_kazanc_tl": 0.0}
        self._last = {}
        self._saved_reserve = None

    def _do(self, modul, karar, gerekce, kazanc=0.0):
        self.stats["karar"] += 1
        self.stats["tahmini_kazanc_tl"] += kazanc
        self.log.append({"t": self.w.minute, "modul": modul, "karar": karar, "gerekce": gerekce, "kazanc": round(kazanc)})
        if len(self.log) > 300:
            del self.log[0]
        self.w.log("otopilot", f"Autopilot · {karar}")

    def _cool(self, key, minutes):
        if self.w.minute - self._last.get(key, -10 ** 9) < minutes:
            return False
        self._last[key] = self.w.minute
        return True

    def set(self, on):
        self.enabled = on
        self.w.log("otopilot", f"Autopilot {'engaged' if on else 'disengaged'}")

    def tick(self):
        w = self.w
        if not self.enabled or w.minute % 10:
            return
        e, lg, sy, wt, R = w.energy, w.logistics, w.symbiosis, w.water, self.rules
        if R["bess"] and e.mode != "otomatik":
            e.mode = "otomatik"
            self._do("enerji", "Battery set to auto mode", "Peak shaving and evening discharge were off")
        if R["kesinti"]:
            if w.outage and self._saved_reserve is None:
                self._saved_reserve = e.reserve
                e.reserve = 0.0
                self._do("enerji", "Battery reserve released to critical loads", "Grid outage — island mode")
            elif not w.outage and self._saved_reserve is not None and not (15.5 <= w.hour < 22):
                e.reserve = self._saved_reserve
                self._saved_reserve = None
                self._do("enerji", f"Battery reserve restored to {e.reserve*100:.0f}%", "Grid back to normal")
        if R["puant"] and not w.outage:
            if 15.5 <= w.hour < 17 and self._saved_reserve is None and e.reserve > 0.12:
                self._saved_reserve = e.reserve
                e.reserve = 0.10
                self._do("enerji", "Battery prepared for the peak (reserve 10%)", "Full capacity for peak shaving before the 17:00 peak band")
        if R["trafo"]:
            for tm in e.tms:
                if tm["oran"] > 0.95 and self._cool("trafo" + tm["id"], 45):
                    n = e.demand_response(w, tm["fabrikalar"], 45)
                    if n:
                        self._do("enerji", f"{tm['id']}: 45-min load shift at {n} sites", f"Substation load {tm['oran']*100:.0f}%",
                                 kazanc=tm["yuk_kw"] * 0.12 * 0.75 * 1.6)
        if R["sozlesme"] and e.grid_kw > e.contract_kw * 0.99 and self._cool("sozlesme", 45):
            n = e.demand_response(w, None, 45)
            if n:
                self._do("enerji", f"Zone-wide flexibility: {n} sites", f"Grid draw {e.grid_kw/1000:.1f} MW, contract limit {e.contract_kw/1000:.1f} MW",
                         kazanc=(e.grid_kw - e.contract_kw * 0.95) * 0.75 * 1.6)
        if R["havuz"] and not lg.pool and lg.empty_ratio() > 0.35:
            lg.pool = True
            self._do("lojistik", "Shared fleet pool opened", f"Empty-km share {lg.empty_ratio()*100:.0f}%",
                     kazanc=lg.today["km_bos"] * 0.4 * 28)
        if R["simbiyoz"] and self._cool("simbiyoz", 60):
            ok = [o for o in sy.opps if o["aylik_kazanc_tl"] > 50000 and (not o["yatirim_tl"] or o["geri_odeme_ay"] <= 24)]
            big = [o for o in sy.opps if o["yatirim_tl"] and o["geri_odeme_ay"] > 24 and o["id"] not in [p["id"] for p in self.pending]]
            if ok:
                o = ok[0]
                if sy.approve(o["id"]):
                    sy.compute_opps()
                    self._do("simbiyoz", f"Symbiosis link created: {o['ureten_ad']} → {o['alan_ad']} ({o['atik_ad']})",
                             f"≈₺{tn(o['aylik_kazanc_tl'])}/month · {tn(o['aylik_co2_t'], 1)} tCO₂", kazanc=o["aylik_kazanc_tl"] / 30)
            elif big and len(self.pending) < 5:
                self.pending.append({**big[0], "neden": f"Investment ₺{tn(big[0]['yatirim_tl'])} · payback {tn(big[0]['geri_odeme_ay'], 1)} months — human approval required"})
        if R["pazar"] and self._cool("pazar", 60):
            m = [x for x in w.market.matches() if x["tasarruf_tl"] > 0]
            if m and w.market.match(m[0]["teklif"], m[0]["talep"]):
                self._do("pazaryeri", f"Capacity contract: {m[0]['kaynak']} ({m[0]['veren_ad']} → {m[0]['isteyen_ad']})",
                         "Idle in-zone capacity, cheaper than outside suppliers", kazanc=m[0]["tasarruf_tl"])
        if R["su"]:
            if wt.reuse < 0.25:
                wt.reuse = 0.25
                self._do("su", "Water reuse raised to 25%", "Saves mains water")
            if wt.util > 1.0 and self._cool("su", 60):
                ids = [f.id for f in w.factories if f.s["koi"] >= 1500]
                n = e.demand_response(w, ids, 45)
                self._do("su", f"Wastewater plant at {wt.util*100:.0f}%: staged slowdown at {n} high-COD sites", "Prevent a COD limit breach")
        if R["olay"]:
            for inc in w.incidents.open():
                if inc["tip"] == "ariza" and inc["durum"] == "acik":
                    f = w.fmap.get(inc["fabrika"])
                    if f and not inc.get("usta"):
                        w.masters.dispatch(f, "mekanik", inc)
                    inc["durum"] = "mudahale"
                    inc["kayit"].append((w.minute, "Autopilot started the response"))
                    self._do("kriz", f"Response started: {inc['baslik']} — {inc['fabrika_ad']}", "Open fault incident")

    def approve_pending(self, oid):
        o = next((p for p in self.pending if p["id"] == oid), None)
        if not o:
            return None
        self.pending = [p for p in self.pending if p["id"] != oid]
        link = self.w.symbiosis.approve(oid)
        if link:
            self._do("simbiyoz", f"Investment approved by a human: {o['ureten_ad']} → {o['alan_ad']}", o["neden"], kazanc=0)
        return link

    def detail(self):
        return {"aktif": self.enabled, "kurallar": [{"k": k, "metin": v, "acik": self.rules[k]} for k, v in RULES.items()],
                "kayit": self.log[::-1][:120], "bekleyen": self.pending, "istatistik": {k: round(v) for k, v in self.stats.items()}}
