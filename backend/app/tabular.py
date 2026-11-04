"""Excel/CSV reader: understands both English and Turkish number/date formats (1,234.56 · 1.234,56 · 2026-11-04 13:00 · 04.11.2026 13:00)."""
import csv
import io
import re
from datetime import datetime, timedelta

TR = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "Ç": "c", "Ğ": "g", "İ": "i", "I": "i",
                    "Ö": "o", "Ş": "s", "Ü": "u", "³": "3", "²": "2"})


def norm(h):
    h = str(h or "").translate(TR).lower()
    return re.sub(r"[^a-z0-9]+", "_", h).strip("_")


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(" ", "").replace(" ", "")
    if not s or s in ("-", "—"):
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        # 1,234 / 12,345,678 → English thousands separators; 2,5 → Turkish decimal comma
        s = s.replace(",", "") if re.fullmatch(r"-?\d{1,3}(,\d{3})+", s) else s.replace(",", ".")
    s = re.sub(r"[^0-9.\-eE]", "", s)
    try:
        return float(s)
    except ValueError:
        return None


FMTS = ["%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M",
        "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M", "%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m.%Y", "%Y-%m"]


def dt(v, saat=None):
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        d = v.replace(tzinfo=None)
    else:
        s = str(v).strip()
        s = re.sub(r"([+-]\d\d:?\d\d|Z)$", "", s).replace("T", " ")
        d = None
        for f in FMTS:
            try:
                d = datetime.strptime(s.replace("T", " "), f.replace("T", " "))
                break
            except ValueError:
                continue
        if d is None:
            return None
    if saat is not None and saat != "":
        if isinstance(saat, datetime):
            d = d.replace(hour=saat.hour, minute=saat.minute)
        elif hasattr(saat, "hour"):
            d = d.replace(hour=saat.hour, minute=getattr(saat, "minute", 0))
        else:
            m = re.match(r"\s*(\d{1,2})(?::(\d{2}))?", str(saat))
            if m:
                d = d.replace(hour=int(m.group(1)) % 24, minute=int(m.group(2) or 0))
    return d


def read(name, raw):
    """Turns the file into rows of {normalised_header: value}."""
    name = (name or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        grid = [list(r) for r in ws.iter_rows(values_only=True)]
    elif name.endswith(".xls"):
        raise ValueError("The old .xls format is not supported; use 'Save As → .xlsx' in Excel and upload again")
    else:
        text = None
        for enc in ("utf-8-sig", "cp1254", "latin-1"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        sample = text[:4000]
        delim = max([";", ",", "\t", "|"], key=lambda d: sample.count(d))
        grid = list(csv.reader(io.StringIO(text), delimiter=delim))
    hi = None
    for i, r in enumerate(grid[:30]):
        cells = [c for c in r if c not in (None, "")]
        if len(cells) >= 2 and sum(1 for c in cells if isinstance(c, str) and num(c) is None) >= 2:
            hi = i
            break
    if hi is None:
        raise ValueError("No header row found (the first row must contain column names)")
    heads = [norm(h) for h in grid[hi]]
    rows = []
    for r in grid[hi + 1:]:
        if not any(c not in (None, "") for c in r):
            continue
        rows.append({heads[j]: r[j] for j in range(min(len(heads), len(r))) if heads[j]})
    if not rows:
        raise ValueError("The file has no data rows")
    return rows


def find(heads, *keys, avoid=()):
    for k in keys:
        for h in heads:
            if k in h and not any(a in h for a in avoid):
                return h
    return None


def stamps(rows):
    heads = list(rows[0].keys())
    tc = find(heads, "datetime", "timestamp", "tarih_saat", "zaman", "tarih", "date", "time", "period", "month", "donem", "ay")
    sc = find(heads, "saat", "hour", avoid=("tarih",)) if tc != find(heads, "saat") else None
    if not tc:
        raise ValueError("No date column found (e.g. 'Date' or 'Time')")
    out = []
    for r in rows:
        d = dt(r.get(tc), r.get(sc) if sc else None)
        out.append(d)
    return out, tc, sc


def price_days(rows):
    heads = list(rows[0].keys())
    pc = find(heads, "ptf_tl", "ptf", "fiyat", "price", "mcp", avoid=("usd", "eur", "dolar", "euro"))
    if not pc:
        return {}
    ts, _, _ = stamps(rows)
    days = {}
    for d, r in zip(ts, rows):
        p = num(r.get(pc))
        if d is None or p is None:
            continue
        days.setdefault(d.strftime("%Y-%m-%d"), [None] * 24)[d.hour] = p
    return {k: v for k, v in days.items() if all(x is not None for x in v)}


def template_csv():
    lines = ["date,hour,kwh,output,gas_m3,water_m3"]
    base = datetime(2026, 10, 6)
    for i in range(48):
        d = base + timedelta(hours=i)
        work = 6 <= d.hour < 22
        kwh = 1450 if work else 260
        lines.append(f"{d:%Y-%m-%d},{d:%H}:00,{kwh},{620 if work else 0},{140 if work else 15},{14 if work else 4}")
    return "\n".join(lines) + "\n"
