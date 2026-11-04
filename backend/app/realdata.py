"""Real-world data: EPİAŞ day-ahead electricity price (PTF/MCP), Open-Meteo weather and persistent settings.

Price sources
  simule — fixed night/day/peak tariff (default)
  epias  — EPİAŞ Transparency Platform (Turkish power exchange), day-ahead market clearing price (TRY/MWh).
           Since 2024 it requires a login ticket (TGT): username/password come from the .env file
           (EPIAS_KULLANICI, EPIAS_SIFRE) or are entered in the UI for the current session.
  dosya  — a PTF Excel/CSV file downloaded from the EPİAŞ website is uploaded.
Unit price paid by the consumer = PTF/1000 + a fixed component for network fees, levies and taxes (adjustable, ₺/kWh).

Weather: Open-Meteo (free, no API key) hourly cloud cover, temperature, wind speed and direction,
mapped onto the simulation clock by hour of day."""
from .i18n import L, LANG
import json
import os
import time
from datetime import datetime, timedelta

import httpx

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Europe/Istanbul")
except Exception:  # noqa: BLE001
    from datetime import timezone
    TZ = timezone(timedelta(hours=3))

from .store import DATA_DIR
from . import tabular

SETTINGS_PATH = os.path.join(DATA_DIR, "ayarlar.json")
EPIAS_LOGIN = os.getenv("EPIAS_LOGIN_URL", "https://giris.epias.com.tr/cas/v1/tickets")
EPIAS_MCP = os.getenv("EPIAS_MCP_URL", "https://seffaflik.epias.com.tr/electricity-service/v1/markets/dam/data/mcp")
OPEN_METEO = os.getenv("OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast")

CITIES = {
    "Ankara": (39.93, 32.86), "Istanbul": (41.01, 28.98), "Izmir": (38.42, 27.14), "Bursa": (40.19, 29.06),
    "Kocaeli": (40.77, 29.94), "Konya": (37.87, 32.48), "Kayseri": (38.73, 35.48), "Gaziantep": (37.07, 37.38),
    "Manisa": (38.61, 27.43), "Denizli": (37.78, 29.09), "Adana": (37.0, 35.32), "Eskisehir": (39.78, 30.52),
    "Sakarya": (40.76, 30.40), "Tekirdag": (40.98, 27.51), "Kahramanmaras": (37.58, 36.93), "Antalya": (36.90, 30.70),
}


def now():
    return datetime.now(TZ)


# ------------------------------------------------------------------ settings
def load_settings():
    try:
        with open(SETTINGS_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:  # noqa: BLE001
        return {}


def save_settings(data):
    tmp = SETTINGS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, SETTINGS_PATH)


# ------------------------------------------------------------------ price
class Pricing:
    def __init__(self, st):
        c = st.get("fiyat", {})
        self.mode = c.get("mod", "simule")
        self.fee = float(c.get("sabit_bilesen", 1.85))
        self.days = {k: v for k, v in c.get("dosya_gunler", {}).items()}   # "YYYY-MM-DD" -> [24 TL/MWh]
        self.dosya_ad = c.get("dosya_ad")
        self.user = os.getenv("EPIAS_KULLANICI") or None
        self.pw = os.getenv("EPIAS_SIFRE") or None
        self.session_cred = False
        self.tgt, self.tgt_t = None, 0
        self.live = {}            # days fetched from EPİAŞ
        self.status, self.error, self.last = "bekliyor", None, None

    def settings(self):
        return {"mod": self.mode, "sabit_bilesen": self.fee, "dosya_gunler": self.days, "dosya_ad": self.dosya_ad}

    def set_session_cred(self, user, pw):
        self.user, self.pw, self.session_cred = user, pw, True
        self.tgt = None

    async def _tgt(self, client):
        if self.tgt and time.time() - self.tgt_t < 100 * 60:
            return self.tgt
        if not (self.user and self.pw):
            raise RuntimeError(L("EPİAŞ username/password not set", "EPİAŞ kullanıcı adı/şifre tanımlı değil"))
        r = await client.post(EPIAS_LOGIN, data={"username": self.user, "password": self.pw},
                              headers={"Accept": "text/plain"})
        if r.status_code not in (200, 201) or not r.text.startswith("TGT-"):
            raise RuntimeError(L(f"EPİAŞ login failed (HTTP {r.status_code})", f"EPİAŞ girişi başarısız (HTTP {r.status_code})"))
        self.tgt, self.tgt_t = r.text.strip(), time.time()
        return self.tgt

    async def refresh(self):
        if self.mode != "epias":
            return
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                tgt = await self._tgt(c)
                d0 = now().replace(hour=0, minute=0, second=0, microsecond=0)
                for d in (d0, d0 + timedelta(days=1)):
                    stamp = d.strftime("%Y-%m-%dT00:00:00+03:00")
                    r = await c.post(EPIAS_MCP, json={"startDate": stamp, "endDate": stamp}, headers={"TGT": tgt})
                    if r.status_code == 401:
                        self.tgt = None
                        raise RuntimeError(L("EPİAŞ ticket rejected (401)", "EPİAŞ bileti reddedildi (401)"))
                    if r.status_code != 200:
                        if d != d0:
                            break           # tomorrow's PTF is not published before ~14:00
                        raise RuntimeError(L(f"Could not fetch PTF (HTTP {r.status_code})", f"PTF alınamadı (HTTP {r.status_code})"))
                    items = r.json().get("items") or []
                    arr = [None] * 24
                    for it in items:
                        hh = _hour_of(it)
                        price = it.get("price", it.get("ptf", it.get("mcp")))
                        if hh is not None and price is not None:
                            arr[hh] = float(price)
                    if all(v is not None for v in arr):
                        self.live[d.strftime("%Y-%m-%d")] = arr
            self.status, self.error, self.last = "ok", None, now().isoformat(timespec="minutes")
        except Exception as e:  # noqa: BLE001
            self.status, self.error = "hata", str(e)

    def load_file(self, name, raw):
        rows = tabular.read(name, raw)
        days = tabular.price_days(rows)
        if not days:
            raise ValueError(L("No date/hour and PTF (TRY/MWh) columns found in the file", "Dosyada tarih/saat ve PTF (TL/MWh) sütunları bulunamadı"))
        self.days, self.dosya_ad = days, name
        return days

    def today_ptf(self):
        """Today's 24-hour PTF (TRY/MWh). If today is missing, the most recent day is used."""
        src = self.live if self.mode == "epias" else self.days if self.mode == "dosya" else {}
        if not src:
            return None, None
        key = now().strftime("%Y-%m-%d")
        if key in src:
            return key, src[key]
        k = sorted(src)[-1]
        return k, src[k]

    def prices_kwh(self):
        if self.mode == "simule":
            return None
        _, ptf = self.today_ptf()
        if not ptf:
            return None
        return [round(p / 1000 + self.fee, 4) for p in ptf]

    def detail(self):
        day, ptf = self.today_ptf()
        return {"mod": self.mode, "sabit_bilesen": self.fee, "durum": self.status if self.mode == "epias" else ("ok" if ptf else L("no data", "veri yok")),
                "hata": self.error if self.mode == "epias" else None, "son": self.last, "gun": day, "ptf": ptf,
                "birim_fiyat": self.prices_kwh(), "kimlik": bool(self.user and self.pw), "oturum_kimlik": self.session_cred,
                "dosya_ad": self.dosya_ad, "dosya_gun_sayisi": len(self.days), "epias_gun_sayisi": len(self.live)}


def _hour_of(item):
    for k in ("hour", "saat"):
        v = item.get(k)
        if isinstance(v, str) and ":" in v:
            return int(v.split(":")[0]) % 24
        if isinstance(v, (int, float)):
            return int(v) % 24
    d = item.get("date")
    if isinstance(d, str) and "T" in d:
        try:
            return int(d.split("T")[1][:2])
        except ValueError:
            return None
    return None


# ------------------------------------------------------------------ weather
class Weather:
    def __init__(self, st):
        c = st.get("hava", {})
        self.enabled = bool(c.get("aktif", False))
        self.name = c.get("ad", "Ankara")
        self.lat, self.lon = float(c.get("lat", CITIES["Ankara"][0])), float(c.get("lon", CITIES["Ankara"][1]))
        self.hours, self.now_vals = None, None
        self.status, self.error, self.last = "bekliyor", None, None

    def settings(self):
        return {"aktif": self.enabled, "ad": self.name, "lat": self.lat, "lon": self.lon}

    async def refresh(self):
        if not self.enabled:
            return
        try:
            params = {"latitude": self.lat, "longitude": self.lon, "timezone": "Europe/Istanbul", "forecast_days": 2,
                      "wind_speed_unit": "ms",
                      "hourly": "temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m,shortwave_radiation",
                      "current": "temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m"}
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(OPEN_METEO, params=params)
                r.raise_for_status()
                d = r.json()
            hr = d["hourly"]
            today = now().strftime("%Y-%m-%d")
            arr = [None] * 24
            for i, t in enumerate(hr["time"]):
                if t.startswith(today):
                    h = int(t[11:13])
                    arr[h] = {"bulut": hr["cloud_cover"][i], "sicaklik": hr["temperature_2m"][i], "ruzgar": hr["wind_speed_10m"][i],
                              "ruzgar_yon": hr["wind_direction_10m"][i], "isinim": hr["shortwave_radiation"][i]}
            if any(a is None for a in arr):
                raise RuntimeError(L("Hourly data came back incomplete", "Saatlik veri eksik geldi"))
            self.hours = arr
            self.now_vals = d.get("current")
            self.status, self.error, self.last = "ok", None, now().isoformat(timespec="minutes")
        except Exception as e:  # noqa: BLE001
            self.status, self.error = "hata", L(f"Could not reach Open-Meteo: {type(e).__name__}", f"Open-Meteo'ya ulaşılamadı: {type(e).__name__}")

    def detail(self):
        return {**self.settings(), "durum": self.status if self.enabled else L("off", "kapalı"), "hata": self.error, "son": self.last,
                "saatler": self.hours, "simdi": self.now_vals, "sehirler": {k: list(v) for k, v in CITIES.items()}}
