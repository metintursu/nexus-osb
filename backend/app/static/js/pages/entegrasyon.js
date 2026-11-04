import { $, esc, fmt } from "../ui.js";

const EP = [
  ["GET", "/api/canli", L("Live state of the whole zone (same data as the WebSocket)", "Tüm bölgenin anlık durumu (WebSocket ile aynı veri)")], ["GET", "/api/dunya", L("Map, sites, sectors, waste types", "Harita, tesisler, sektörler, atık türleri")],
  ["GET", "/api/fabrikalar/{id}", L("Site details, history, symbiosis, incidents", "Tesis ayrıntısı, geçmiş, simbiyoz, olaylar")], ["POST", "/api/veri/{id}", L("Push live data from a real site", "Gerçek tesisten canlı veri gönder")],
  ["GET", "/api/enerji", L("Grid, solar, battery, substations", "Şebeke, GES, batarya, trafolar")], ["POST", "/api/enerji/ayar", "{mod, dr_aktif, rezerv}"],
  ["GET", "/api/lojistik", L("Fleet, orders, gates", "Filo, siparişler, kapılar")], ["GET", "/api/simbiyoz", L("Links and opportunities", "Bağlantılar ve fırsatlar")], ["GET", "/api/karbon", L("Scope 1-2, CBAM", "Kapsam 1-2, SKDM")],
  ["GET", "/api/su", L("Wastewater plant", "Arıtma")], ["GET", "/api/olaylar", L("Incident log", "Olay kaydı")], ["POST", L("/api/senaryolar/{key}/baslat", "/api/senaryolar/{anahtar}/baslat"), L("Stress test", "Stres testi")],
  ["POST", "/api/beyin/sohbet", L("{mesaj} → Zone Brain reply or command", "{mesaj} → Bölge Beyni yanıtı veya komut")], ["POST", "/api/otopilot", L("{aktif} turn autopilot on/off", "{aktif} otopilotu aç/kapat")],
  ["GET", "/api/muzakere", L("Agent messages, tables, Zone Credits", "Ajan mesajları, masalar, OSB Kredisi")], ["GET", "/api/ustalar", L("Technician pool", "Usta havuzu")], ["GET", "/api/hidrojen", L("Hydrogen Valley", "Hidrojen Vadisi")],
  ["GET", "/api/tahmin", L("24-hour Monte Carlo forecast", "24 saat Monte Carlo tahmin")], ["POST", "/api/evrenler", L("{a, b, gun} parallel universe comparison", "{a, b, gun} paralel evren karşılaştırması")], ["GET", "/api/afet", L("Active disaster and wind", "Aktif afet ve rüzgâr")], ["GET", "/api/gercek", L("Price, weather, bridge, calibration status", "Fiyat, hava, köprü, kalibrasyon durumu")],
  ["POST", "/api/kopru", L("Add a bridge (url, factory, fields)", "Köprü ekle (url, fabrika, alanlar)")], ["POST", "/api/kalibrasyon/{id}?uygula=true", L("Calibrate with a history file (request body)", "Geçmiş veri dosyası (gövde) ile kalibrasyon")],
  ["POST", "/api/bolge", L("Apply a zone plan (JSON)", "Bölge planı (JSON) uygula")], ["POST", "/api/sim/esitle", L("Sync the simulation clock to real time", "Simülasyon saatini gerçek saate eşitle")], ["GET", "/api/raporlar", L("End-of-day reports", "Gün sonu raporları")], ["WS", "/ws", L("Live stream every second", "Saniyelik canlı yayın")],
];

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g2" style="margin-bottom:var(--gap)">
      <a class="card item click" href="#/veri" style="color:inherit"><h3>${L(`🌐 Real Data`, `🌐 Gerçek Veri`)}</h3><div class="muted mt" style="font-size:13px">${L(`EPİAŞ day-ahead electricity price (Turkey), real weather, site calibration from historical data and the`, `EPİAŞ PTF elektrik fiyatı, gerçek hava durumu, geçmiş veriyle tesis kalibrasyonu ve`)} <b>${L(`Fabrika OS bridge`, `Fabrika OS köprüsü`)}</b> ${L(`(with a field-mapping wizard, no code needed).`, `(alan eşleme sihirbazıyla, kod yazmadan).`)}</div></a>
      <a class="card item click" href="#/tasarim" style="color:inherit"><h3>${L(`📐 Zone Designer`, `📐 Bölge Tasarımcısı`)}</h3><div class="muted mt" style="font-size:13px">${L(`Draw your own zone's block grid, shared facilities and factories; save it as JSON, share it and build it with one click.`, `Kendi OSB'nin ada ızgarasını, ortak tesislerini ve fabrikalarını çiz; JSON olarak kaydet, paylaş, tek tıkla kur.`)}</div></a></div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h3>${L(`1 · Connect a site over REST`, `1 · REST ile tesis bağla`)}</h3><span class="sub">${L(`PLC gateway, SCADA, Fabrika OS`, `PLC ağ geçidi, SCADA, Fabrika OS`)}</span></div>
        <div class="muted" style="font-size:13px">${L(`Replace a site's simulated values with real measurements. Data stays valid for`, `Bir tesisin simüle edilen değerlerini gerçek ölçümle değiştir. Veri`)} <b>gecerlilik_dk</b> ${L(`minutes; if it is not refreshed, the site falls back to simulation. A red dot on the map = live data.`, `boyunca geçerlidir; yenilenmezse tesis simülasyona döner. Haritada kırmızı nokta = canlı veri.`)}</div>
        <div class="muted mt" style="font-size:12px">PowerShell</div>
        <div class="code">Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/veri/F01 \`
  -ContentType "application/json" \`
  -Body '{"power_kw": 1850, "durum": "calisiyor", "oee": 0.83, "uretim_dk": 9.5, "gecerlilik_dk": 15}'</div>
        <div class="muted mt" style="font-size:12px">${L(`Fields`, `Alanlar`)}</div>
        <div class="code">${L(`power_kw       current electrical power (kW)
durum          status: calisiyor (running) | bosta (idle) | ariza (fault) | bakim (maintenance) | durdu (stopped)
oee            overall equipment effectiveness, 0–1
uretim_dk      output per minute (in the site's unit)
gecerlilik_dk  minutes the data stays valid (default 15)`, `power_kw     anlık elektrik gücü (kW)
durum        calisiyor | bosta | ariza | bakim | durdu
oee          0–1 arası ekipman etkinliği
uretim_dk    dakikadaki üretim (tesis biriminde)
gecerlilik_dk  verinin geçerli kalacağı dakika (varsayılan 15)`)}</div></div>
      <div class="card"><div class="card-h"><h3>${L(`2 · Stream over MQTT`, `2 · MQTT ile akış`)}</h3><span class="sub" id="mq"></span></div>
        <div class="muted" style="font-size:13px">${L(`When the Mosquitto broker in docker-compose is running, NEXUS subscribes to this topic and publishes zone KPIs every 10 minutes:`, `docker-compose içindeki Mosquitto aracısı açıkken NEXUS şu konuyu dinler ve her 10 dakikada bölge KPI'larını yayınlar:`)}</div>
        <div class="code mt">${L(`subscribe:  nexus/fabrika/{id}/telemetri   → same JSON body
publish:    nexus/bolge/kpi                 → zone indicators`, `abone:  nexus/fabrika/{id}/telemetri   → aynı JSON gövdesi
yayın:  nexus/bolge/kpi                 → bölge göstergeleri`)}</div>
        <div class="muted mt" style="font-size:12px">${L(`Try it (PowerShell, with the Mosquitto client)`, `Deneme (PowerShell, Mosquitto istemcisi ile)`)}</div>
        <div class="code">docker exec nexus-mqtt mosquitto_pub -t nexus/fabrika/F02/telemetri \`
  -m '{\\"power_kw\\": 2400, \\"durum\\": \\"ariza\\"}'</div>
        <div class="hr"></div>
        <div class="card-h"><h3>${L(`3 · Fabrika OS bridge`, `3 · Fabrika OS köprüsü`)}</h3></div>
        <div class="muted" style="font-size:13px">${L(`Every site running Fabrika OS joins the zone level by sending its own energy and status data to this endpoint. The single-factory operating system becomes one cell of the zone in NEXUS; Dijital Usta fault advice and Karbon Pasaportu data flow into the zone carbon ledger.`, `Fabrika OS'ta çalışan her tesis, kendi enerji ve durum verisini bu uca göndererek bölge seviyesine katılır. Böylece tek fabrikanın işletim sistemi, NEXUS'ta bölgenin bir hücresi olur; Dijital Usta arıza önerileri ve Karbon Pasaportu verileri bölge karbon defterine akar.`)}</div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>${L(`API endpoints`, `API uçları`)}</h3><span class="sub"><a href="/docs" target="_blank">${L(`Interactive documentation (Swagger) →`, `Etkileşimli dokümantasyon (Swagger) →`)}</a></span></div>
        <div class="tbl-wrap"><table class="tbl">${EP.map(([m, p, d]) => `<tr><td><span class="tag" style="color:${m === "GET" ? "#34d399" : m === "POST" ? "#fbbf24" : "#a78bfa"}">${m}</span></td><td class="num">${esc(p)}</td><td class="muted">${esc(d)}</td></tr>`).join("")}</table></div></div>
      <div class="card"><div class="card-h"><h3>${L(`System`, `Sistem`)}</h3></div><div id="sys" class="grid g2" style="font-size:13px"></div></div></div>`;
    ctx.poll(async () => {
      const s = await ctx.api("/sim");
      $("#mq").textContent = s.mqtt.host ? (s.mqtt.aktif ? `${L(`connected ·`, `bağlı ·`)} ${s.mqtt.mesaj} ${L(`messages`, `mesaj`)}` : L("connecting…", "bağlanıyor…")) : L("off (MQTT_HOST not set)", "kapalı (MQTT_HOST tanımlı değil)");
      $("#sys").innerHTML = [[L("Simulation time", "Simülasyon zamanı"), `${L(`Day`, `Gün`)} ${s.gun} · ${s.saat}`], [L("Speed", "Hız"), s.duraklatildi ? L("paused", "duraklatıldı") : `${s.tps}${L(`× (min/s)`, `× (dk/sn)`)}`], [L("Steps this session", "Bu oturumda adım"), fmt.n(s.adim)],
        [L("Persistent event log", "Kalıcı olay kaydı"), fmt.n(s.kayit) + L(" rows (SQLite)", " satır (SQLite)")], [L("Sites", "Tesis"), ctx.world.fabrikalar.length], [L("Vehicles", "Araç"), `${ctx.world.filo} ${L(`trucks + 1 fire engine +`, `kamyon + 1 itfaiye +`)} ${ctx.world.ustalar.length} ${L(`technicians`, `usta`)}`]]
        .map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b>${v}</b></div>`).join("");
    }, 5000);
  },
};
