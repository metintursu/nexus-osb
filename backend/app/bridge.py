"""Köprü: başka bir sistemin (Fabrika OS, SCADA, PLC ağ geçidi) JSON API'sini düzenli okuyup bir NEXUS tesisine akıtır.

Her köprü: URL + hedef tesis + alan eşlemesi (noktalı yol: "makineler.0.guc_kw") + çarpan + durum eşlemesi.
Sihirbaz önce URL'yi deneyip tüm yaprak alanları listeler; kullanıcı hangisinin güç, durum, OEE, üretim olduğunu seçer."""
import time
import uuid

import httpx

FIELDS = ("power_kw", "durum", "oee", "uretim_dk")
DEFAULT_STATUS = {"run": "calisiyor", "running": "calisiyor", "calisiyor": "calisiyor", "çalışıyor": "calisiyor", "on": "calisiyor",
                  "auto": "calisiyor", "1": "calisiyor", "true": "calisiyor", "idle": "bosta", "bosta": "bosta", "boşta": "bosta",
                  "standby": "bosta", "stop": "durdu", "stopped": "durdu", "off": "durdu", "0": "durdu", "false": "durdu",
                  "durdu": "durdu", "fault": "ariza", "error": "ariza", "alarm": "ariza", "ariza": "ariza", "arıza": "ariza",
                  "maintenance": "bakim", "bakim": "bakim", "bakım": "bakim"}


def flatten(obj, prefix="", out=None, limit=400):
    out = {} if out is None else out
    if len(out) >= limit:
        return out
    if isinstance(obj, dict):
        for k, v in obj.items():
            flatten(v, f"{prefix}.{k}" if prefix else str(k), out, limit)
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:25]):
            flatten(v, f"{prefix}.{i}" if prefix else str(i), out, limit)
    else:
        out[prefix] = obj
    return out


def pick(obj, path):
    cur = obj
    for part in str(path).split("."):
        if part == "":
            continue
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
        if cur is None:
            return None
    return cur


def suggest(flat):
    """Alan adlarından güç/durum/OEE/üretim için tahmini eşleme önerir."""
    sug = {}
    for path, v in flat.items():
        p = path.lower()
        if "power_kw" not in sug and isinstance(v, (int, float)) and any(k in p for k in ("guc", "güç", "power", "kw", "watt", "aktif_guc")) and "kwh" not in p:
            sug["power_kw"] = path
        if "durum" not in sug and any(k in p for k in ("durum", "status", "state", "run")):
            sug["durum"] = path
        if "oee" not in sug and "oee" in p and isinstance(v, (int, float)):
            sug["oee"] = path
        if "uretim_dk" not in sug and any(k in p for k in ("uretim", "üretim", "production", "count", "adet", "parca")) and isinstance(v, (int, float)):
            sug["uretim_dk"] = path
    return sug


class Bridges:
    def __init__(self, st):
        self.items = []
        for b in st.get("kopruler", []):
            b.setdefault("id", uuid.uuid4().hex[:8])
            b.update({"durum": "bekliyor", "hata": None, "son": None, "son_deger": None, "mesaj": 0, "_next": 0})
            self.items.append(b)

    def settings(self):
        keep = ("id", "ad", "url", "fabrika", "alanlar", "carpan", "durum_esleme", "aralik_sn", "aktif", "basliklar")
        return [{k: b.get(k) for k in keep} for b in self.items]

    def upsert(self, b):
        b = {**b}
        b["id"] = b.get("id") or uuid.uuid4().hex[:8]
        b["aralik_sn"] = max(2, min(3600, int(b.get("aralik_sn") or 10)))
        b["alanlar"] = {k: v for k, v in (b.get("alanlar") or {}).items() if k in FIELDS and v}
        b["carpan"] = {k: float(v) for k, v in (b.get("carpan") or {}).items() if k in FIELDS and v not in (None, "")}
        b.setdefault("aktif", True)
        b.update({"durum": "bekliyor", "hata": None, "son": None, "son_deger": None, "mesaj": 0, "_next": 0})
        self.items = [x for x in self.items if x["id"] != b["id"]] + [b]
        return b

    def remove(self, bid):
        self.items = [x for x in self.items if x["id"] != bid]

    @staticmethod
    async def probe(url, headers=None):
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(url, headers=headers or {})
            r.raise_for_status()
            data = r.json()
        flat = flatten(data)
        return {"alanlar": [{"yol": k, "deger": v} for k, v in flat.items()], "oneri": suggest(flat)}

    def convert(self, b, data):
        out = {}
        for key, path in b["alanlar"].items():
            v = pick(data, path)
            if v is None:
                continue
            if key == "durum":
                m = {str(k).lower(): s for k, s in (b.get("durum_esleme") or {}).items()}
                sv = str(v).strip().lower()
                st = m.get(sv) or DEFAULT_STATUS.get(sv)
                if st:
                    out["durum"] = st
            else:
                try:
                    num = float(v) * b["carpan"].get(key, 1.0)
                except (TypeError, ValueError):
                    continue
                if key == "oee" and num > 1.5:
                    num /= 100          # %82 → 0,82
                out[key] = num
        out["gecerlilik_dk"] = max(5, int(b["aralik_sn"] / 60 * 3) + 5)
        return out

    async def tick(self, apply):
        now = time.time()
        due = [b for b in self.items if b.get("aktif") and now >= b["_next"]]
        if not due:
            return
        async with httpx.AsyncClient(timeout=6) as c:
            for b in due:
                b["_next"] = now + b["aralik_sn"]
                try:
                    r = await c.get(b["url"], headers=b.get("basliklar") or {})
                    r.raise_for_status()
                    vals = self.convert(b, r.json())
                    if not any(k in vals for k in FIELDS):
                        raise ValueError("Eşlenen alanlardan hiçbiri yanıtta bulunamadı")
                    if not apply(b["fabrika"], vals):
                        raise ValueError(f"NEXUS tesisi bulunamadı: {b['fabrika']}")
                    b.update(durum="ok", hata=None, son=time.strftime("%H:%M:%S"), son_deger=vals, mesaj=b["mesaj"] + 1)
                except Exception as e:  # noqa: BLE001
                    b.update(durum="hata", hata=f"{type(e).__name__}: {str(e)[:160]}")

    def detail(self):
        return [{k: v for k, v in b.items() if not k.startswith("_")} for b in self.items]
