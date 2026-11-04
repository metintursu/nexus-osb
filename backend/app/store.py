"""Kalıcı kayıt: olay akışı ve gün sonu raporları SQLite'a yazılır (/data/nexus.db)."""
import json
import os
import sqlite3
import threading

DATA_DIR = os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
os.makedirs(DATA_DIR, exist_ok=True)
DB = os.path.join(DATA_DIR, "nexus.db")
_lock = threading.Lock()
_conn = sqlite3.connect(DB, check_same_thread=False)
_conn.execute("""CREATE TABLE IF NOT EXISTS olaylar (id INTEGER PRIMARY KEY AUTOINCREMENT, oturum TEXT, gun INTEGER,
                 saat TEXT, dk INTEGER, tur TEXT, metin TEXT, veri TEXT)""")
_conn.execute("""CREATE TABLE IF NOT EXISTS gunler (id INTEGER PRIMARY KEY AUTOINCREMENT, oturum TEXT, gun INTEGER, veri TEXT)""")
_conn.commit()
SESSION = os.urandom(4).hex()
_enabled = {"on": False}


def enable(flag=True):
    _enabled["on"] = flag


def log_event(ev, data=None):
    if not _enabled["on"]:
        return
    with _lock:
        _conn.execute("INSERT INTO olaylar (oturum, gun, saat, dk, tur, metin, veri) VALUES (?,?,?,?,?,?,?)",
                      (SESSION, ev["gun"], ev["saat"], ev["t"], ev["tur"], ev["metin"],
                       json.dumps({k: v for k, v in (data or {}).items() if k in ("id", "seviye", "fabrika", "tip")},
                                  ensure_ascii=False)))
        _conn.commit()


def save_day(summary):
    if not _enabled["on"]:
        return
    with _lock:
        _conn.execute("INSERT INTO gunler (oturum, gun, veri) VALUES (?,?,?)", (SESSION, summary["gun"], json.dumps(summary)))
        _conn.commit()


def recent_events(limit=200, tur=None):
    with _lock:
        if tur:
            rows = _conn.execute("SELECT gun, saat, dk, tur, metin FROM olaylar WHERE tur=? ORDER BY id DESC LIMIT ?", (tur, limit))
        else:
            rows = _conn.execute("SELECT gun, saat, dk, tur, metin FROM olaylar ORDER BY id DESC LIMIT ?", (limit,))
        return [{"gun": r[0], "saat": r[1], "t": r[2], "tur": r[3], "metin": r[4]} for r in rows.fetchall()]


def count():
    with _lock:
        return _conn.execute("SELECT COUNT(*) FROM olaylar").fetchone()[0]
