import { $, esc, fmt } from "../ui.js";

const EP = [
  ["GET", "/api/canli", "Tüm bölgenin anlık durumu (WebSocket ile aynı veri)"], ["GET", "/api/dunya", "Harita, tesisler, sektörler, atık türleri"],
  ["GET", "/api/fabrikalar/{id}", "Tesis ayrıntısı, geçmiş, simbiyoz, olaylar"], ["POST", "/api/veri/{id}", "Gerçek tesisten canlı veri gönder"],
  ["GET", "/api/enerji", "Şebeke, GES, batarya, trafolar"], ["POST", "/api/enerji/ayar", "{mod, dr_aktif, rezerv}"],
  ["GET", "/api/lojistik", "Filo, siparişler, kapılar"], ["GET", "/api/simbiyoz", "Bağlantılar ve fırsatlar"], ["GET", "/api/karbon", "Kapsam 1-2, SKDM"],
  ["GET", "/api/su", "Arıtma"], ["GET", "/api/olaylar", "Olay kaydı"], ["POST", "/api/senaryolar/{anahtar}/baslat", "Stres testi"],
  ["POST", "/api/beyin/sohbet", "{mesaj} → Bölge Beyni yanıtı veya komut"], ["POST", "/api/otopilot", "{aktif} otopilotu aç/kapat"],
  ["GET", "/api/muzakere", "Ajan mesajları, masalar, OSB Kredisi"], ["GET", "/api/ustalar", "Usta havuzu"], ["GET", "/api/hidrojen", "Hidrojen Vadisi"],
  ["GET", "/api/tahmin", "24 saat Monte Carlo tahmin"], ["POST", "/api/evrenler", "{a, b, gun} paralel evren karşılaştırması"], ["GET", "/api/afet", "Aktif afet ve rüzgâr"], ["GET", "/api/gercek", "Fiyat, hava, köprü, kalibrasyon durumu"],
  ["POST", "/api/kopru", "Köprü ekle (url, fabrika, alanlar)"], ["POST", "/api/kalibrasyon/{id}?uygula=true", "Geçmiş veri dosyası (gövde) ile kalibrasyon"],
  ["POST", "/api/bolge", "Bölge planı (JSON) uygula"], ["POST", "/api/sim/esitle", "Simülasyon saatini gerçek saate eşitle"], ["GET", "/api/raporlar", "Gün sonu raporları"], ["WS", "/ws", "Saniyelik canlı yayın"],
];

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g2" style="margin-bottom:var(--gap)">
      <a class="card item click" href="#/veri" style="color:inherit"><h3>🌐 Gerçek Veri</h3><div class="muted mt" style="font-size:13px">EPİAŞ PTF elektrik fiyatı, gerçek hava durumu, geçmiş veriyle tesis kalibrasyonu ve <b>Fabrika OS köprüsü</b> (alan eşleme sihirbazıyla, kod yazmadan).</div></a>
      <a class="card item click" href="#/tasarim" style="color:inherit"><h3>📐 Bölge Tasarımcısı</h3><div class="muted mt" style="font-size:13px">Kendi OSB'nin ada ızgarasını, ortak tesislerini ve fabrikalarını çiz; JSON olarak kaydet, paylaş, tek tıkla kur.</div></a></div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h3>1 · REST ile tesis bağla</h3><span class="sub">PLC ağ geçidi, SCADA, Fabrika OS</span></div>
        <div class="muted" style="font-size:13px">Bir tesisin simüle edilen değerlerini gerçek ölçümle değiştir. Veri <b>gecerlilik_dk</b> boyunca geçerlidir; yenilenmezse tesis simülasyona döner. Haritada kırmızı nokta = canlı veri.</div>
        <div class="muted mt" style="font-size:12px">PowerShell</div>
        <div class="code">Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/veri/F01 \`
  -ContentType "application/json" \`
  -Body '{"power_kw": 1850, "durum": "calisiyor", "oee": 0.83, "uretim_dk": 9.5, "gecerlilik_dk": 15}'</div>
        <div class="muted mt" style="font-size:12px">Alanlar</div>
        <div class="code">power_kw     anlık elektrik gücü (kW)
durum        calisiyor | bosta | ariza | bakim | durdu
oee          0–1 arası ekipman etkinliği
uretim_dk    dakikadaki üretim (tesis biriminde)
gecerlilik_dk  verinin geçerli kalacağı dakika (varsayılan 15)</div></div>
      <div class="card"><div class="card-h"><h3>2 · MQTT ile akış</h3><span class="sub" id="mq"></span></div>
        <div class="muted" style="font-size:13px">docker-compose içindeki Mosquitto aracısı açıkken NEXUS şu konuyu dinler ve her 10 dakikada bölge KPI'larını yayınlar:</div>
        <div class="code mt">abone:  nexus/fabrika/{id}/telemetri   → aynı JSON gövdesi
yayın:  nexus/bolge/kpi                 → bölge göstergeleri</div>
        <div class="muted mt" style="font-size:12px">Deneme (PowerShell, Mosquitto istemcisi ile)</div>
        <div class="code">docker exec nexus-mqtt mosquitto_pub -t nexus/fabrika/F02/telemetri \`
  -m '{\\"power_kw\\": 2400, \\"durum\\": \\"ariza\\"}'</div>
        <div class="hr"></div>
        <div class="card-h"><h3>3 · Fabrika OS köprüsü</h3></div>
        <div class="muted" style="font-size:13px">Fabrika OS'ta çalışan her tesis, kendi enerji ve durum verisini bu uca göndererek bölge seviyesine katılır. Böylece tek fabrikanın işletim sistemi, NEXUS'ta bölgenin bir hücresi olur; Dijital Usta arıza önerileri ve Karbon Pasaportu verileri bölge karbon defterine akar.</div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>API uçları</h3><span class="sub"><a href="/docs" target="_blank">Etkileşimli dokümantasyon (Swagger) →</a></span></div>
        <div class="tbl-wrap"><table class="tbl">${EP.map(([m, p, d]) => `<tr><td><span class="tag" style="color:${m === "GET" ? "#34d399" : m === "POST" ? "#fbbf24" : "#a78bfa"}">${m}</span></td><td class="num">${esc(p)}</td><td class="muted">${esc(d)}</td></tr>`).join("")}</table></div></div>
      <div class="card"><div class="card-h"><h3>Sistem</h3></div><div id="sys" class="grid g2" style="font-size:13px"></div></div></div>`;
    ctx.poll(async () => {
      const s = await ctx.api("/sim");
      $("#mq").textContent = s.mqtt.host ? (s.mqtt.aktif ? `bağlı · ${s.mqtt.mesaj} mesaj` : "bağlanıyor…") : "kapalı (MQTT_HOST tanımlı değil)";
      $("#sys").innerHTML = [["Simülasyon zamanı", `Gün ${s.gun} · ${s.saat}`], ["Hız", s.duraklatildi ? "duraklatıldı" : `${s.tps}× (dk/sn)`], ["Bu oturumda adım", fmt.n(s.adim)],
        ["Kalıcı olay kaydı", fmt.n(s.kayit) + " satır (SQLite)"], ["Tesis", ctx.world.fabrikalar.length], ["Araç", `${ctx.world.filo} kamyon + 1 itfaiye + ${ctx.world.ustalar.length} usta`]]
        .map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b>${v}</b></div>`).join("");
    }, 5000);
  },
};
