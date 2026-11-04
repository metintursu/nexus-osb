# NEXUS OSB v2.1 — Sanayi Bölgesi İşletim Sistemi

> Tek bir fabrikayı değil, **bütün bir organize sanayi bölgesini** yöneten, kendi kararını veren ve
> geleceğini önceden koşturan işletim sistemi.

Fabrika OS bir fabrikanın işletim sistemiyse, NEXUS OSB o fabrikaların yaşadığı şehrin işletim sistemidir.
30 tesis, ortak enerji şebekesi, hidrojen vadisi, 48 araçlık filo, usta havuzu, merkezi arıtma, atık takası,
karbon defteri, kapasite pazaryeri ve kriz merkezi canlı olarak birlikte çalışır. Yerel yapay zekâ bölgeyi
**otopilotta** yönetir, tesis ajanları birbirleriyle **pazarlık eder**, sistem kendi kopyalarını ileri sararak
**geleceği tahmin eder** ve farklı kararların sonucunu **paralel evrenlerde** kanıtlar.

---

## Hızlı başlangıç (Windows · PowerShell)

Docker Desktop açıkken, zip'i açtığın klasörde:

```powershell
powershell -ExecutionPolicy Bypass -File .\baslat.ps1
```

veya elle:

```powershell
docker compose up -d --build
Start-Process http://localhost:8080
```

Durdurmak için `docker compose down` · Kayıtları da silmek için `docker compose down -v`.

**İlk deneme:** üst çubuktaki **▶ Sunum Modu** düğmesine bas. Sistem 15 adımda kendini anlatır: otopilotu açar,
paralel evrenleri koşturur, bir deprem canlandırır ve sonunda her şeyi eski hâline getirir. İstersen **🔊 Ses** ile
Türkçe sesli anlatım da açılır.

### Bölge Beyni için Ollama (isteğe bağlı, ücretsiz, yerel)

```powershell
ollama pull llama3.2
```

NEXUS, bilgisayarındaki Ollama'yı `host.docker.internal:11434` üzerinden otomatik bulur. Belirli bir model için
`docker-compose.yml` içinde `OLLAMA_MODEL: "qwen2.5"` yaz. Ollama yoksa yerleşik **yerel analist** gerçek
verilerle cevap verir ve komutları uygular. Hiçbir bulut servisi kullanılmaz.

---

## Ekranlar (22)

| Bölüm | Ekran | Öne çıkan |
|---|---|---|
| Operasyon | **Komuta Merkezi** | Sağlık skoru, 8 canlı gösterge, harita, otopilot ve ajan şeridi, tek tıkla uygulanan öneriler |
| | **Canlı Harita** | 4 katman + araç, usta, simbiyoz, H₂ hattı, trafo, olay, deprem dalgası, gaz bulutu, rüzgâr pusulası |
| | **3D Dijital İkiz** 🆕 | three.js · bina yüksekliği = kurulu güç, baca dumanı = anlık emisyon (rüzgârla sürüklenir), gece ışıkları, simbiyoz tüpleri, drone turu, depremde kamera sarsıntısı |
| | **Tesisler** | Sıralanabilir tablo + tesis çekmecesi |
| | **Kriz Merkezi** | Müdahale adımları, olay kaydı, usta/itfaiye takibi |
| | **Usta Havuzu** 🆕 | 12 uzman usta tesisler arasında paylaşılır; arızaya doğru beceri + en yakın + en kıdemli usta gider, duruş ≈%45 kısalır |
| Altyapı | **Enerji & Hidrojen** | Akış şeması, GES, batarya stratejisi, trafolar, **Hidrojen Vadisi** 🆕 (12 MWp özel GES → elektrolizör → döküm/metal fırınlarına %30'a kadar yeşil H₂) |
| | **Lojistik & Filo** | Ortak filo havuzu, kapılar, siparişler |
| | **Su & Arıtma** | KOİ, kapasite, geri kazanım |
| Döngüsel ekonomi | **Endüstriyel Simbiyoz** | Fırsat motoru, bağlantılar |
| | **Müzakere Odası** 🆕 | Kişilikli tesis ajanları canlı pazarlık eder: **esneklik ihalesi**, **atık fiyat pazarlığı**, **kamyon paylaşımı** · OSB Kredisi defteri |
| | **Karbon Merkezi** | Kapsam 1/2/lojistik, kaçınılan (GES+biyogaz+H₂+simbiyoz), AB SKDM yükü |
| | **Kapasite Pazaryeri** | Atıl kapasite eşleşmeleri |
| Zekâ | **Otopilot** 🆕 | 10 kural, her 10 dk tarama, gerekçeli karar günlüğü, büyük yatırımlar için insan onayı |
| | **Bölge Beyni** | Ollama sohbeti + **komut yürütme** + **🎙 sesli komuta** + sesli yanıt |
| | **Gelecek Tahmini** 🆕 | Bölge 6 kez kopyalanıp 24 saat ileri koşar (Monte Carlo) · saatlik risk takvimi, p10–p90 bandı |
| | **Paralel Evrenler** 🆕 | Aynı bölge iki politikayla günlerce ileri sarılır · net ₺ etkisi, yıllıklaştırılmış kazanç, 14 gösterge |
| | **Senaryo & Afet Lab** | 8 senaryo: şebeke kesintisi, zam, doğalgaz, ihracat, sıcak hava, liman, **deprem** 🆕, **kimyasal sızıntı** 🆕 |
| | **Raporlar** | Gün sonu raporları, CSV, PDF |
| Sistem | **Gerçek Veri** 🆕 | EPİAŞ PTF, hava durumu, geçmiş veri kalibrasyonu, Fabrika OS köprüsü, gerçek zaman |
| | **Bölge Tasarımcısı** 🆕 | Kendi OSB planını çiz ve kur |
| | **Entegrasyon** | REST/MQTT, tüm API uçları |

### Sesli/yazılı komutlar (Bölge Beyni)

`TM-3'ü rahatlat` · `otopilotu aç` · `havuzu aç` · `batarya otomatik` · `su geri kazanımını %30 yap` ·
`hidrojeni kapat` · `deprem senaryosu başlat` · `senaryoyu durdur`

Mikrofon Chrome ve Edge'de çalışır. Ses tanımayı tarayıcının kendi servisi yapar.

---

## v2'de neler var?

- **Otopilot** — batarya, puant hazırlığı, trafo ve sözleşme aşımı, filo havuzu, simbiyoz, pazaryeri, su, kesinti ve olay kuralları. Her karar gerekçesi ve tahmini kazancıyla kaydedilir.
- **Konuşan fabrikalar** — her tesisin kişiliği var (tutumlu, uzlaşmacı, yeşil, aceleci). Teklifler, karşı teklifler ve tavizler dakikalara yayılarak akar. Sonuç gerçekten uygulanır: yük kaydırılır, simbiyoz bağlantısı kurulur, kamyon seferleri birleşir.
- **Usta Havuzu** — arıza türü becerisiyle eşleşir (mekanik, hidrolik, elektrik, otomasyon, yakma, soğutma). Ustalar haritada ve 3D'de hareket eder.
- **Hidrojen Vadisi** — şebekeden bağımsız yeşil H₂ üretilir; döküm ve metal fırınlarında doğalgaz ikame edilir, kapsam 1 düşer.
- **Afet modu** — deprem: merkez üssüne uzaklığa göre hasar, ada modu, gaz vanaları, arıtma kaybı, artçılar, yangın. Kimyasal sızıntı: rüzgâr yönünde büyüyen ve dönen bulut, tahliye.
- **Tahmin ve Paralel Evrenler** — dünya modeli kopyalanıp ayrı iş parçacığında koşar; canlı bölge etkilenmez.
- **Sunum Modu** — 15 adımlık otomatik anlatım; yatırımcı ve CTO toplantıları için.
- **3D Dijital İkiz** — three.js projeye gömülü; internet olmadan da çalışır.

Net etki hesabı: enerji faturası, simbiyoz, filo yakıtı, bertaraf bedeli (1.150 ₺/t), su (45 ₺/m³) ve üretim
marjı (ciro farkının %12'si). Rakamların tamamı simülasyon varsayımıdır; gerçek veri bağlandıkça modelin yerini ölçüm alır.

---

## v2.1 · Gerçeğe bağlanma (Gerçek Veri + Bölge Tasarımcısı ekranları)

| Özellik | Nasıl çalışır |
|---|---|
| **Gerçek elektrik fiyatı** | EPİAŞ Gün Öncesi Piyasası PTF'si saatlik çekilir; ödenen birim fiyat = PTF/1000 + sabit bileşen (dağıtım, YEKDEM, vergi; varsayılan 1,85 ₺/kWh, ekrandan değişir). Batarya ve talep kaydırma "puant"ı günün en pahalı 5 saati olarak alır. EPİAŞ hesabı yoksa Şeffaflık Platformu'ndan indirilen PTF Excel/CSV dosyası yüklenir. |
| **Gerçek hava** | Open-Meteo'dan (ücretsiz, anahtarsız) bulut, sıcaklık, rüzgâr. Bulut → GES ve H₂ üretimi; sıcaklık → soğutma, ısıtma gazı, su; rüzgâr → duman ve kimyasal bulut yönü. 16 sanayi şehri hazır, istenen koordinat girilebilir. |
| **Bölge Tasarımcısı** | Ada ızgarası (2–8 × 2–6), enerji ve hizmet adası, GES/batarya boyutu, tesisler (ad, sektör, çalışan, vardiya, parsel). Haritada tıklayarak yerleştir, JSON indir/yükle, tek tıkla bölgeyi yeniden kur. Plan `/data/bolge.json`'da kalıcıdır. |
| **Fabrika OS köprüsü** | JSON veren herhangi bir adres (Fabrika OS, SCADA, PLC ağ geçidi) düzenli okunur. Sihirbaz tüm alanları listeler, güç/durum/OEE/üretimi otomatik önerir; W→kW çarpanı, RUN/STOP/FAULT → durum çevirisi hazır. Bağlı tesis haritada "canlı" görünür. |
| **Geçmiş veriyle kalibrasyon** | Bir tesisin saatlik/15 dk/günlük/aylık kayıtları (CSV veya .xlsx; Türkçe sayı biçimi desteklenir) yüklenir; kurulu güç, 24 saatlik yük profili, üretim hızı, gaz ve su katsayıları o tesise oturtulur. Önce önizleme, sonra uygula. Şablon dosya ekrandan indirilir. |
| **Gerçek zaman** | Üst çubukta ⏱ Gerçek: simülasyon saati gerçek saate eşitlenir ve 1 sn = 1 sn akar. |

EPİAŞ hesabını kalıcı bağlamak için (şifre yalnızca bilgisayarındaki `.env` dosyasında durur):

```powershell
Set-Content .env "EPIAS_KULLANICI=kullanici@ornek.com`nEPIAS_SIFRE=sifren" -Encoding ASCII
docker compose up -d
```

Fabrika OS'un portunu bulmak için: `docker ps --format "table {{.Names}}`t{{.Ports}}"` — köprü adresinde `localhost` yerine `host.docker.internal` yaz.

Tüm ayarlar (`fiyat`, `hava`, `kopruler`, `kalibrasyon`) `/data/ayarlar.json`'da kalıcıdır; konteyner yeniden başlasa da korunur.

---

## Gerçek veri bağlama

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/veri/F01 `
  -ContentType "application/json" `
  -Body '{"power_kw": 1850, "durum": "calisiyor", "oee": 0.83, "uretim_dk": 9.5, "gecerlilik_dk": 15}'
```

MQTT (compose içindeki Mosquitto, port 1883): abone `nexus/fabrika/{id}/telemetri`, yayın `nexus/bolge/kpi`.
Swagger: http://localhost:8080/docs

---

## Proje yapısı

```
nexus-osb/
├─ docker-compose.yml · baslat.ps1 · mosquitto/
└─ backend/
   ├─ Dockerfile · requirements.txt · tests/test_sim.py (16 test)
   └─ app/
      ├─ main.py        FastAPI · WebSocket · MQTT · tahmin/evren işleri
      ├─ ai.py          Bölge Beyni: Ollama + yerel analist + komut yürütücü
      ├─ store.py       SQLite olay ve gün kaydı
      ├─ realdata.py    EPİAŞ PTF + Open-Meteo + kalıcı ayarlar
      ├─ bridge.py      Fabrika OS / SCADA JSON köprüsü
      ├─ calibrate.py   Geçmiş veriyle tesis kalibrasyonu
      ├─ tabular.py     Türkçe CSV/Excel okuyucu
      ├─ sim/           world · factory · energy · hydrogen · logistics · masters · symbiosis · market
      │                 water · incidents · disaster · autopilot · agents · foresight · geo · data
      └─ static/        app.js · ui.js · map.js · tour.js · pages/ (20 ekran) · vendor/three.module.min.js
```

Yerel geliştirme:

```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8080 --reload
python -m pytest -q
```

Ortam değişkenleri: `EPIAS_KULLANICI`, `EPIAS_SIFRE`, `OLLAMA_URL`, `OLLAMA_MODEL`, `MQTT_HOST`, `MQTT_PORT`, `NEXUS_SEED`, `NEXUS_PREWARM_MIN`, `DATA_DIR`.

---

### English summary

NEXUS OSB v2 is an operating system for an entire industrial zone: 30 simulated plants, a shared grid with solar,
battery, biogas and a green-hydrogen valley, a 48-truck fleet, a shared pool of master technicians, wastewater
treatment, industrial symbiosis, a carbon ledger with EU CBAM exposure, a capacity marketplace and a crisis center.
It runs itself on **autopilot**; plant **agents negotiate** flexibility, waste prices and shared trucks in credits;
it **forecasts** the next 24 hours by Monte Carlo and proves policies in **parallel universes**. It includes earthquake
and chemical-leak disaster modes, a three.js **3D digital twin**, voice commands, and a self-running **presentation
mode**. AI is local-only via Ollama with a rule-based fallback. Run `docker compose up -d --build` and open
http://localhost:8080.
