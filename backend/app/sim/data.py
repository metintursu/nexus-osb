"""NEXUS OSB — static zone data: sectors, waste types, shared resources, scenarios.

All figures are plausible assumptions for simulation; once a real plant is connected,
data arriving via the REST API or MQTT replaces this model.

Note: internal identifiers and JSON keys keep their original (Turkish) names for API stability.
"""

# Waste / by-product types — deger: value to the receiver when reused, TRY/t (or TRY/MWh),
# co2: tCO2 avoided per reused unit, boru: moved by pipeline instead of trucks.
WASTE = {
    "metal_talasi":     {"ad": "Metal Chips",        "birim": "t",   "deger": 9500,  "co2": 1.50, "boru": False, "renk": "#94a3b8"},
    "plastik_hurda":    {"ad": "Plastic Scrap",       "birim": "t",   "deger": 11000, "co2": 1.40, "boru": False, "renk": "#38bdf8"},
    "tekstil_kirpinti": {"ad": "Textile Offcuts",  "birim": "t",   "deger": 3800,  "co2": 2.00, "boru": False, "renk": "#f472b6"},
    "atik_isi":         {"ad": "Waste Heat",            "birim": "MWh", "deger": 950,   "co2": 0.20, "boru": True,  "renk": "#fb923c"},
    "organik":          {"ad": "Organic Waste",        "birim": "t",   "deger": 650,   "co2": 0.45, "boru": False, "renk": "#84cc16"},
    "karton":           {"ad": "Cardboard / Paper",      "birim": "t",   "deger": 3200,  "co2": 0.90, "boru": False, "renk": "#d6a76c"},
    "ahsap_talasi":     {"ad": "Wood Shavings",        "birim": "t",   "deger": 1400,  "co2": 0.60, "boru": False, "renk": "#a16207"},
    "dokum_kumu":       {"ad": "Foundry Sand",          "birim": "t",   "deger": 420,   "co2": 0.04, "boru": False, "renk": "#c4b5a0"},
    "atik_yag":         {"ad": "Waste Oil",            "birim": "t",   "deger": 6800,  "co2": 2.70, "boru": False, "renk": "#facc15"},
    "cozucu":           {"ad": "Waste Solvent",         "birim": "t",   "deger": 7600,  "co2": 1.80, "boru": False, "renk": "#a78bfa"},
}
BERTARAF_TL_T = 1150          # landfill / licensed disposal fee, TRY/t
TRUCK_LOAD_T = 8.0            # symbiosis truck capacity
HEAT_PIPE_MAX_UNITS = 330     # max distance for a waste-heat pipeline (map units; 1 unit = 10 m)

# Sector templates
#  kw_kisi: full-load kW per employee | gaz_kisi: m3/h gas per employee | su_kisi: m3/h water per employee
#  uretim_kisi_saat: hourly output per employee | fiyat: unit sales price TRY
#  atik: daily waste per 100 employees (t or MWh) | kabul: waste types accepted as raw material
#  esnek: share of load that can be shifted in demand response | kritik: supplied first during outages
#  ihracat: export share of output | skdm: covered by EU CBAM | koi: wastewater COD (mg/L)
SECTORS = {
    "otomotiv": dict(ad="Automotive Supplier", kisa="AUT", renk="#38bdf8", urun="Part", birim="pcs",
                     kw_kisi=11, gaz_kisi=0.45, su_kisi=0.05, uretim_kisi_saat=1.4, fiyat=380,
                     atik={"metal_talasi": 1.8, "atik_yag": 0.12, "karton": 0.6}, kabul=["tekstil_kirpinti"],
                     esnek=0.10, kritik=False, ihracat=0.55, skdm=False, koi=450, vardiya=[2, 3], calisan=(250, 900)),
    "metal": dict(ad="Metalworking", kisa="MET", renk="#94a3b8", urun="Product", birim="kg",
                  kw_kisi=16, gaz_kisi=0.8, su_kisi=0.04, uretim_kisi_saat=22, fiyat=95,
                  atik={"metal_talasi": 3.2, "atik_isi": 2.5, "atik_yag": 0.2}, kabul=[],
                  esnek=0.20, kritik=False, ihracat=0.45, skdm=True, koi=380, vardiya=[2, 3], calisan=(120, 500)),
    "dokum": dict(ad="Foundry", kisa="FDY", renk="#f97316", urun="Casting", birim="kg",
                  kw_kisi=24, gaz_kisi=2.0, su_kisi=0.06, uretim_kisi_saat=30, fiyat=70,
                  atik={"dokum_kumu": 6.0, "atik_isi": 4.0}, kabul=["metal_talasi"],
                  esnek=0.25, kritik=False, ihracat=0.50, skdm=True, koi=300, vardiya=[3], calisan=(150, 450)),
    "plastik": dict(ad="Plastics & Rubber", kisa="PLS", renk="#22d3ee", urun="Pellet/part", birim="kg",
                    kw_kisi=18, gaz_kisi=0.25, su_kisi=0.04, uretim_kisi_saat=12, fiyat=110,
                    atik={"plastik_hurda": 1.4, "atik_isi": 1.2}, kabul=["plastik_hurda"],
                    esnek=0.20, kritik=False, ihracat=0.35, skdm=False, koi=500, vardiya=[2, 3], calisan=(80, 350)),
    "tekstil": dict(ad="Textile & Dyeing", kisa="TXT", renk="#f472b6", urun="Fabric", birim="m",
                    kw_kisi=6, gaz_kisi=1.0, su_kisi=0.22, uretim_kisi_saat=9, fiyat=85,
                    atik={"tekstil_kirpinti": 1.1, "karton": 0.4}, kabul=["atik_isi"],
                    esnek=0.08, kritik=False, ihracat=0.60, skdm=False, koi=1500, vardiya=[2, 3], calisan=(200, 800)),
    "gida": dict(ad="Food", kisa="FOD", renk="#84cc16", urun="Product", birim="kg",
                 kw_kisi=7, gaz_kisi=0.7, su_kisi=0.16, uretim_kisi_saat=35, fiyat=60,
                 atik={"organik": 4.5, "karton": 0.8, "plastik_hurda": 0.3}, kabul=["atik_isi"],
                 esnek=0.05, kritik=True, ihracat=0.25, skdm=False, koi=2200, vardiya=[3], calisan=(150, 600)),
    "kimya": dict(ad="Chemicals", kisa="CHM", renk="#a78bfa", urun="Chemical", birim="kg",
                  kw_kisi=13, gaz_kisi=1.2, su_kisi=0.18, uretim_kisi_saat=18, fiyat=140,
                  atik={"cozucu": 0.6, "atik_isi": 2.0}, kabul=["cozucu", "atik_yag"],
                  esnek=0.05, kritik=True, ihracat=0.40, skdm=False, koi=1800, vardiya=[3], calisan=(80, 300)),
    "mobilya": dict(ad="Furniture", kisa="FUR", renk="#d97706", urun="Furniture", birim="pcs",
                    kw_kisi=6, gaz_kisi=0.15, su_kisi=0.02, uretim_kisi_saat=0.5, fiyat=4200,
                    atik={"ahsap_talasi": 3.0, "karton": 0.5}, kabul=["tekstil_kirpinti"],
                    esnek=0.15, kritik=False, ihracat=0.30, skdm=False, koi=350, vardiya=[1, 2], calisan=(100, 400)),
    "elektronik": dict(ad="Electronics", kisa="ELC", renk="#60a5fa", urun="Module", birim="pcs",
                       kw_kisi=8, gaz_kisi=0.08, su_kisi=0.05, uretim_kisi_saat=3, fiyat=950,
                       atik={"plastik_hurda": 0.3, "karton": 0.7, "metal_talasi": 0.2}, kabul=[],
                       esnek=0.10, kritik=False, ihracat=0.50, skdm=False, koi=420, vardiya=[2], calisan=(150, 600)),
    "ambalaj": dict(ad="Packaging", kisa="PKG", renk="#eab308", urun="Package", birim="pcs",
                    kw_kisi=9, gaz_kisi=0.18, su_kisi=0.04, uretim_kisi_saat=60, fiyat=14,
                    atik={"karton": 2.5, "plastik_hurda": 0.6}, kabul=["karton"],
                    esnek=0.20, kritik=False, ihracat=0.20, skdm=False, koi=600, vardiya=[2, 3], calisan=(80, 300)),
    "yapi": dict(ad="Building Materials", kisa="BLD", renk="#a8a29e", urun="Precast", birim="kg",
                 kw_kisi=14, gaz_kisi=1.5, su_kisi=0.10, uretim_kisi_saat=120, fiyat=4,
                 atik={}, kabul=["dokum_kumu", "ahsap_talasi"],
                 esnek=0.30, kritik=False, ihracat=0.15, skdm=True, koi=250, vardiya=[2], calisan=(100, 300)),
    "biyogaz": dict(ad="Zone Biogas Plant", kisa="BIO", renk="#4ade80", urun="Electricity", birim="kWh",
                    kw_kisi=12, gaz_kisi=0.0, su_kisi=0.05, uretim_kisi_saat=0, fiyat=0,
                    atik={"atik_isi": 1.0}, kabul=["organik"],
                    esnek=0.0, kritik=True, ihracat=0.0, skdm=False, koi=900, vardiya=[3], calisan=(25, 25)),
}

SECTOR_COUNTS = {"otomotiv": 5, "metal": 4, "dokum": 2, "plastik": 3, "tekstil": 3, "gida": 3,
                 "kimya": 2, "mobilya": 2, "elektronik": 2, "ambalaj": 2, "yapi": 1, "biyogaz": 1}

NAME_PREFIX = ["Kartal", "Atlas", "Yildiz", "Mavi", "Anatolia", "Taurus", "Simge", "Doruk", "Nehir", "Cinar",
               "Ekin", "Poyraz", "Kuzey", "Akin", "Meltem", "Sedef", "Tuna", "Ergin", "Altay", "Lale",
               "Vega", "Orion", "Aras", "Baris", "Ufuk", "Gokce", "Pinar", "Sarp", "Kaya", "Ilgaz", "Defne", "Alize"]
NAME_SUFFIX = {"otomotiv": "Automotive", "metal": "Metal", "dokum": "Foundry", "plastik": "Plastics", "tekstil": "Textiles",
               "gida": "Foods", "kimya": "Chemicals", "mobilya": "Furniture", "elektronik": "Electronics",
               "ambalaj": "Packaging", "yapi": "Building", "biyogaz": ""}

# In-zone supply chain: supplier sector -> customer sectors
SUPPLY_LINKS = {
    "dokum": ["otomotiv"], "metal": ["otomotiv", "mobilya"], "plastik": ["otomotiv", "elektronik"],
    "elektronik": ["otomotiv"], "ambalaj": ["gida", "elektronik", "kimya"], "kimya": ["plastik", "tekstil"],
    "tekstil": ["mobilya", "otomotiv"],
}

# Capacity marketplace resource types: key -> (name, unit, unit price TRY, sectors that can offer it)
RESOURCES = {
    "cnc":        ("CNC machining", "h", 1800, ["metal", "otomotiv"]),
    "boya":       ("Powder coating line", "h", 2600, ["metal", "mobilya"]),
    "depo":       ("Warehouse space", "m²·month", 180, ["gida", "ambalaj", "tekstil", "mobilya"]),
    "forklift":   ("Forklift + operator", "day", 4500, ["otomotiv", "ambalaj", "gida"]),
    "lab":        ("Quality lab", "test", 3200, ["kimya", "otomotiv", "gida"]),
    "lazer":      ("Laser cutting", "h", 2400, ["metal"]),
    "enjeksiyon": ("Injection press", "h", 1500, ["plastik"]),
    "soguk":      ("Cold storage", "pallet·month", 650, ["gida"]),
    "smt":        ("SMT assembly line", "h", 3800, ["elektronik"]),
}

TARIFF = {"gece": 2.05, "gunduz": 3.35, "puant": 5.10}       # TRY/kWh (simulated)
GRID_CO2 = {"gece": 0.47, "gunduz": 0.40, "puant": 0.50}     # kgCO2/kWh grid intensity (simulated)
GAS_PRICE = 14.5        # TRY/m3
GAS_CO2 = 1.93          # kgCO2/m3
WATER_PRICE = 45.0      # TRY/m3
DIESEL_TL_KM = 28.0
TRUCK_CO2_KM = 0.85     # kg/km
EU_CO2_EUR = 78.0       # €/tCO2 (EU ETS assumption)
EUR_TL = 49.0

SCENARIOS = {
    "sebeke_kesintisi": dict(ad="Zone-wide grid outage", sure=45, ikon="⚡",
                             aciklama="The national grid feed is lost for 45 min. Solar, biogas and battery supply only critical sites (food, chemicals, wastewater)."),
    "enerji_zammi": dict(ad="Electricity price +40%", sure=1440, ikon="₺",
                         aciklama="All tariff bands are 40% more expensive for 24 hours. Battery and load shifting become more valuable."),
    "dogalgaz_kisinti": dict(ad="Natural gas curtailment (50%)", sure=360, ikon="🔥",
                             aciklama="Gas supply is halved for 6 hours; output drops at gas-intensive sites."),
    "ihracat_siparisi": dict(ad="Large export order", sure=720, ikon="📦",
                             aciklama="Automotive, metal and foundry output is pushed +30% for 12 hours; substation and logistics load rises."),
    "sicak_hava": dict(ad="Heat wave", sure=600, ikon="☀",
                       aciklama="Cooling load +12%, water demand +25%, solar panel efficiency -8%."),
    "deprem": dict(ad="Earthquake (M6.0–6.9)", sure=720, ikon="🌍",
                   aciklama="Random epicentre. Damage by distance, 40-min grid outage, gas shut for 3 hours, wastewater plant at 60% capacity, aftershocks, fire; technicians and fire brigade are prioritised."),
    "kimyasal_sizinti": dict(ad="Chemical leak · toxic cloud", sure=180, ikon="☣",
                             aciklama="A tank leak at a chemical plant. The cloud grows downwind and turns with the wind; sites underneath are evacuated."),
    "liman_grevi": dict(ad="Port road closure", sure=480, ikon="⚓",
                        aciklama="The West Gate (port road) closes for 8 hours; shipments queue up."),
}
