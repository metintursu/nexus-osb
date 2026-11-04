"""NEXUS OSB — statik bölge verileri: sektörler, atık türleri, kaynak türleri, senaryolar.

Tüm rakamlar simülasyon amaçlı makul varsayımlardır; gerçek tesise bağlanınca
/api/ingest veya MQTT üzerinden gelen veriler bu modelin yerini alır.
"""

# Atık / yan ürün türleri — deger: yeniden kullanımda alıcı için TL/t (veya TL/MWh) değeri,
# co2: yeniden kullanılan her birim için kaçınılan tCO2, boru: boru hattıyla (kamyonsuz) taşınır.
WASTE = {
    "metal_talasi":     {"ad": "Metal Talaşı",        "birim": "t",   "deger": 9500,  "co2": 1.50, "boru": False, "renk": "#94a3b8"},
    "plastik_hurda":    {"ad": "Plastik Hurda",       "birim": "t",   "deger": 11000, "co2": 1.40, "boru": False, "renk": "#38bdf8"},
    "tekstil_kirpinti": {"ad": "Tekstil Kırpıntısı",  "birim": "t",   "deger": 3800,  "co2": 2.00, "boru": False, "renk": "#f472b6"},
    "atik_isi":         {"ad": "Atık Isı",            "birim": "MWh", "deger": 950,   "co2": 0.20, "boru": True,  "renk": "#fb923c"},
    "organik":          {"ad": "Organik Atık",        "birim": "t",   "deger": 650,   "co2": 0.45, "boru": False, "renk": "#84cc16"},
    "karton":           {"ad": "Karton / Kâğıt",      "birim": "t",   "deger": 3200,  "co2": 0.90, "boru": False, "renk": "#d6a76c"},
    "ahsap_talasi":     {"ad": "Ahşap Talaşı",        "birim": "t",   "deger": 1400,  "co2": 0.60, "boru": False, "renk": "#a16207"},
    "dokum_kumu":       {"ad": "Döküm Kumu",          "birim": "t",   "deger": 420,   "co2": 0.04, "boru": False, "renk": "#c4b5a0"},
    "atik_yag":         {"ad": "Atık Yağ",            "birim": "t",   "deger": 6800,  "co2": 2.70, "boru": False, "renk": "#facc15"},
    "cozucu":           {"ad": "Atık Çözücü",         "birim": "t",   "deger": 7600,  "co2": 1.80, "boru": False, "renk": "#a78bfa"},
}
BERTARAF_TL_T = 1150          # düzenli depolama / lisanslı bertaraf bedeli, TL/t
TRUCK_LOAD_T = 8.0            # simbiyoz kamyonu taşıma kapasitesi
HEAT_PIPE_MAX_UNITS = 330     # atık ısı boru hattı için en fazla mesafe (harita birimi; 1 birim = 10 m)

# Sektör şablonları
#  kw_kisi: çalışan başına tam yükte kW | gaz_kisi: çalışan başına m3/saat | su_kisi: çalışan başına m3/saat
#  uretim_kisi_saat: çalışan başına saatlik üretim | fiyat: birim satış fiyatı TL
#  atik: 100 çalışan başına günlük üretilen atık (t veya MWh) | kabul: hammadde olarak kabul ettiği atıklar
#  esnek: talep tarafı katılımda kaydırılabilir yük oranı | kritik: kesintide öncelikli beslenir
#  ihracat: üretimin ihracat payı | skdm: AB SKDM (CBAM) kapsamında mı | koi: atıksu KOİ (mg/L)
SECTORS = {
    "otomotiv": dict(ad="Otomotiv Yan Sanayi", kisa="OTO", renk="#38bdf8", urun="Parça", birim="adet",
                     kw_kisi=11, gaz_kisi=0.45, su_kisi=0.05, uretim_kisi_saat=1.4, fiyat=380,
                     atik={"metal_talasi": 1.8, "atik_yag": 0.12, "karton": 0.6}, kabul=["tekstil_kirpinti"],
                     esnek=0.10, kritik=False, ihracat=0.55, skdm=False, koi=450, vardiya=[2, 3], calisan=(250, 900)),
    "metal": dict(ad="Metal İşleme", kisa="MET", renk="#94a3b8", urun="Mamul", birim="kg",
                  kw_kisi=16, gaz_kisi=0.8, su_kisi=0.04, uretim_kisi_saat=22, fiyat=95,
                  atik={"metal_talasi": 3.2, "atik_isi": 2.5, "atik_yag": 0.2}, kabul=[],
                  esnek=0.20, kritik=False, ihracat=0.45, skdm=True, koi=380, vardiya=[2, 3], calisan=(120, 500)),
    "dokum": dict(ad="Döküm", kisa="DÖK", renk="#f97316", urun="Döküm parça", birim="kg",
                  kw_kisi=24, gaz_kisi=2.0, su_kisi=0.06, uretim_kisi_saat=30, fiyat=70,
                  atik={"dokum_kumu": 6.0, "atik_isi": 4.0}, kabul=["metal_talasi"],
                  esnek=0.25, kritik=False, ihracat=0.50, skdm=True, koi=300, vardiya=[3], calisan=(150, 450)),
    "plastik": dict(ad="Plastik & Kauçuk", kisa="PLS", renk="#22d3ee", urun="Granül/parça", birim="kg",
                    kw_kisi=18, gaz_kisi=0.25, su_kisi=0.04, uretim_kisi_saat=12, fiyat=110,
                    atik={"plastik_hurda": 1.4, "atik_isi": 1.2}, kabul=["plastik_hurda"],
                    esnek=0.20, kritik=False, ihracat=0.35, skdm=False, koi=500, vardiya=[2, 3], calisan=(80, 350)),
    "tekstil": dict(ad="Tekstil & Boyahane", kisa="TKS", renk="#f472b6", urun="Kumaş", birim="m",
                    kw_kisi=6, gaz_kisi=1.0, su_kisi=0.22, uretim_kisi_saat=9, fiyat=85,
                    atik={"tekstil_kirpinti": 1.1, "karton": 0.4}, kabul=["atik_isi"],
                    esnek=0.08, kritik=False, ihracat=0.60, skdm=False, koi=1500, vardiya=[2, 3], calisan=(200, 800)),
    "gida": dict(ad="Gıda", kisa="GDA", renk="#84cc16", urun="Ürün", birim="kg",
                 kw_kisi=7, gaz_kisi=0.7, su_kisi=0.16, uretim_kisi_saat=35, fiyat=60,
                 atik={"organik": 4.5, "karton": 0.8, "plastik_hurda": 0.3}, kabul=["atik_isi"],
                 esnek=0.05, kritik=True, ihracat=0.25, skdm=False, koi=2200, vardiya=[3], calisan=(150, 600)),
    "kimya": dict(ad="Kimya", kisa="KİM", renk="#a78bfa", urun="Kimyasal", birim="kg",
                  kw_kisi=13, gaz_kisi=1.2, su_kisi=0.18, uretim_kisi_saat=18, fiyat=140,
                  atik={"cozucu": 0.6, "atik_isi": 2.0}, kabul=["cozucu", "atik_yag"],
                  esnek=0.05, kritik=True, ihracat=0.40, skdm=False, koi=1800, vardiya=[3], calisan=(80, 300)),
    "mobilya": dict(ad="Mobilya", kisa="MOB", renk="#d97706", urun="Mobilya", birim="adet",
                    kw_kisi=6, gaz_kisi=0.15, su_kisi=0.02, uretim_kisi_saat=0.5, fiyat=4200,
                    atik={"ahsap_talasi": 3.0, "karton": 0.5}, kabul=["tekstil_kirpinti"],
                    esnek=0.15, kritik=False, ihracat=0.30, skdm=False, koi=350, vardiya=[1, 2], calisan=(100, 400)),
    "elektronik": dict(ad="Elektronik", kisa="ELK", renk="#60a5fa", urun="Modül", birim="adet",
                       kw_kisi=8, gaz_kisi=0.08, su_kisi=0.05, uretim_kisi_saat=3, fiyat=950,
                       atik={"plastik_hurda": 0.3, "karton": 0.7, "metal_talasi": 0.2}, kabul=[],
                       esnek=0.10, kritik=False, ihracat=0.50, skdm=False, koi=420, vardiya=[2], calisan=(150, 600)),
    "ambalaj": dict(ad="Ambalaj", kisa="AMB", renk="#eab308", urun="Ambalaj", birim="adet",
                    kw_kisi=9, gaz_kisi=0.18, su_kisi=0.04, uretim_kisi_saat=60, fiyat=14,
                    atik={"karton": 2.5, "plastik_hurda": 0.6}, kabul=["karton"],
                    esnek=0.20, kritik=False, ihracat=0.20, skdm=False, koi=600, vardiya=[2, 3], calisan=(80, 300)),
    "yapi": dict(ad="Yapı Malzemeleri", kisa="YAP", renk="#a8a29e", urun="Prefabrik", birim="kg",
                 kw_kisi=14, gaz_kisi=1.5, su_kisi=0.10, uretim_kisi_saat=120, fiyat=4,
                 atik={}, kabul=["dokum_kumu", "ahsap_talasi"],
                 esnek=0.30, kritik=False, ihracat=0.15, skdm=True, koi=250, vardiya=[2], calisan=(100, 300)),
    "biyogaz": dict(ad="OSB Biyogaz Tesisi", kisa="BİO", renk="#4ade80", urun="Elektrik", birim="kWh",
                    kw_kisi=12, gaz_kisi=0.0, su_kisi=0.05, uretim_kisi_saat=0, fiyat=0,
                    atik={"atik_isi": 1.0}, kabul=["organik"],
                    esnek=0.0, kritik=True, ihracat=0.0, skdm=False, koi=900, vardiya=[3], calisan=(25, 25)),
}

SECTOR_COUNTS = {"otomotiv": 5, "metal": 4, "dokum": 2, "plastik": 3, "tekstil": 3, "gida": 3,
                 "kimya": 2, "mobilya": 2, "elektronik": 2, "ambalaj": 2, "yapi": 1, "biyogaz": 1}

NAME_PREFIX = ["Kartal", "Atlas", "Yıldız", "Mavi", "Anadolu", "Toros", "Simge", "Doruk", "Nehir", "Çınar",
               "Ekin", "Poyraz", "Kuzey", "Akın", "Meltem", "Sedef", "Tuna", "Ergin", "Altay", "Lale",
               "Vega", "Orion", "Aras", "Barış", "Ufuk", "Gökçe", "Pınar", "Sarp", "Kaya", "Ilgaz", "Defne", "Alize"]
NAME_SUFFIX = {"otomotiv": "Otomotiv", "metal": "Metal", "dokum": "Döküm", "plastik": "Plastik", "tekstil": "Tekstil",
               "gida": "Gıda", "kimya": "Kimya", "mobilya": "Mobilya", "elektronik": "Elektronik",
               "ambalaj": "Ambalaj", "yapi": "Yapı", "biyogaz": ""}

# Bölge içi tedarik zinciri: tedarikçi sektör -> müşteri sektörler
SUPPLY_LINKS = {
    "dokum": ["otomotiv"], "metal": ["otomotiv", "mobilya"], "plastik": ["otomotiv", "elektronik"],
    "elektronik": ["otomotiv"], "ambalaj": ["gida", "elektronik", "kimya"], "kimya": ["plastik", "tekstil"],
    "tekstil": ["mobilya", "otomotiv"],
}

# Kapasite pazaryeri kaynak türleri: anahtar -> (ad, birim, birim fiyat TL, sunabilen sektörler)
RESOURCES = {
    "cnc":        ("CNC işleme", "saat", 1800, ["metal", "otomotiv"]),
    "boya":       ("Toz boya hattı", "saat", 2600, ["metal", "mobilya"]),
    "depo":       ("Depo alanı", "m²·ay", 180, ["gida", "ambalaj", "tekstil", "mobilya"]),
    "forklift":   ("Forklift + operatör", "gün", 4500, ["otomotiv", "ambalaj", "gida"]),
    "lab":        ("Kalite laboratuvarı", "test", 3200, ["kimya", "otomotiv", "gida"]),
    "lazer":      ("Lazer kesim", "saat", 2400, ["metal"]),
    "enjeksiyon": ("Enjeksiyon presi", "saat", 1500, ["plastik"]),
    "soguk":      ("Soğuk oda", "palet·ay", 650, ["gida"]),
    "smt":        ("SMT dizgi hattı", "saat", 3800, ["elektronik"]),
}

TARIFF = {"gece": 2.05, "gunduz": 3.35, "puant": 5.10}       # TL/kWh (simüle)
GRID_CO2 = {"gece": 0.47, "gunduz": 0.40, "puant": 0.50}     # kgCO2/kWh şebeke yoğunluğu (simüle)
GAS_PRICE = 14.5        # TL/m3
GAS_CO2 = 1.93          # kgCO2/m3
WATER_PRICE = 45.0      # TL/m3
DIESEL_TL_KM = 28.0
TRUCK_CO2_KM = 0.85     # kg/km
EU_CO2_EUR = 78.0       # €/tCO2 (AB ETS varsayımı)
EUR_TL = 49.0

SCENARIOS = {
    "sebeke_kesintisi": dict(ad="Bölge geneli şebeke kesintisi", sure=45, ikon="⚡",
                             aciklama="Ulusal şebekeden besleme 45 dk kesilir. GES, biyogaz ve batarya yalnızca kritik tesisleri (gıda, kimya, arıtma) besler."),
    "enerji_zammi": dict(ad="Elektrik fiyatı %40 artış", sure=1440, ikon="₺",
                         aciklama="24 saat boyunca tüm tarife dilimleri %40 pahalanır. Batarya ve talep kaydırmanın değeri artar."),
    "dogalgaz_kisinti": dict(ad="Doğalgaz kısıntısı (%50)", sure=360, ikon="🔥",
                             aciklama="6 saat boyunca gaz arzı yarıya iner; gaz yoğun tesislerde üretim düşer."),
    "ihracat_siparisi": dict(ad="Büyük ihracat siparişi", sure=720, ikon="📦",
                             aciklama="12 saat boyunca otomotiv, metal ve döküm üretimi +%30 zorlanır; trafo ve lojistik yükü artar."),
    "sicak_hava": dict(ad="Sıcak hava dalgası", sure=600, ikon="☀",
                       aciklama="Soğutma yükü +%12, su ihtiyacı +%25, panel verimi -%8."),
    "deprem": dict(ad="Deprem (M6,0–6,9)", sure=720, ikon="🌍",
                   aciklama="Rastgele merkez üssü. Mesafeye göre tesis hasarı, 40 dk şebeke kesintisi, 3 saat doğalgaz kapalı, arıtma %60 kapasite, artçılar, yangın; ustalar ve itfaiye önceliklendirilir."),
    "kimyasal_sizinti": dict(ad="Kimyasal sızıntı · toksik bulut", sure=180, ikon="☣",
                             aciklama="Bir kimya tesisinde tank sızıntısı. Bulut rüzgâr yönünde büyür ve rüzgârla döner; altında kalan tesisler tahliye edilir."),
    "liman_grevi": dict(ad="Liman yolu kapanması", sure=480, ikon="⚓",
                        aciklama="Batı Kapısı (liman yolu) 8 saat kapanır; sevkiyatlar kuyrukta bekler."),
}
