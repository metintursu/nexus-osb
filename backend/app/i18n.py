"""Language (en / tr) for every server-side text: agents, autopilot, incidents, Zone Brain, names.

The choice is stored in DATA_DIR/dil.txt and read once at start-up; switching language restarts the
process (see /api/dil), so the whole simulation is rebuilt consistently in the new language.
"""
import os

DATA_DIR = os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
LANG_FILE = os.path.join(DATA_DIR, "dil.txt")
SUPPORTED = ("en", "tr")


def _read():
    try:
        with open(LANG_FILE, encoding="utf-8") as fh:
            v = fh.read().strip().lower()
            if v in SUPPORTED:
                return v
    except OSError:
        pass
    v = os.getenv("NEXUS_LANG", "en").strip().lower()
    return v if v in SUPPORTED else "en"


LANG = _read()


def L(en, tr):
    """Pick the text for the active language."""
    return tr if LANG == "tr" else en


def save(lang):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LANG_FILE, "w", encoding="utf-8") as fh:
        fh.write(lang)


def TN(x, d=0):
    """Turkish number format: 12.345,6"""
    return f"{x:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")
