import { $, $$, esc, fmt, lineChart, api } from "../ui.js";

let D = null, probe = null, calibPrev = null;
const hrs = (arr) => arr.map((v, h) => [h * 60, v]);
const MODE = { saatlik: L("hourly", "saatlik"), gunluk: L("daily", "günlük"), aylik: L("monthly", "aylık") };
const DST = { calisiyor: L("running", "çalışıyor"), bosta: L("idle", "boşta"), ariza: L("fault", "arıza"), bakim: L("maintenance", "bakım"), durdu: L("stopped", "durdu") };

async function upload(path, file) {
  const r = await fetch("/api" + path, { method: "POST", headers: { "x-dosya-adi": encodeURIComponent(file.name).replace(/%20/g, " ") }, body: file });
  if (!r.ok) { let d = r.statusText; try { d = (await r.json()).detail; } catch (_) {} throw new Error(d); }
  return r.json();
}

export default {
  async mount(root, ctx) {
    root.innerHTML = `<div class="note">${L(`This page moves NEXUS from simulation to reality. Each source is switched on and off independently; if a connection drops, the system quietly falls back to simulation. The`, `Bu sayfa NEXUS'u simülasyondan gerçeğe taşır. Her kaynak birbirinden bağımsız açılıp kapanır; bağlantı koparsa sistem sessizce simülasyona döner. Üst çubuktaki`)} <b>🌐</b> ${L(`badge in the top bar shows which real data is active.`, `rozeti hangi gerçek verinin aktif olduğunu gösterir.`)}</div>
    <div class="grid mt g2">
      <div class="card" id="c-price"></div>
      <div class="card" id="c-wx"></div></div>
    <div class="card mt" id="c-cal"></div>
    <div class="card mt" id="c-br"></div>
    <div class="card mt"><div class="card-h"><h3>${L(`⏱ Real time`, `⏱ Gerçek zaman`)}</h3><span class="sub">${L(`real prices and weather arrive hourly, so syncing the simulation to the real clock makes sense`, `gerçek fiyat ve hava saatlik gelir; simülasyonu gerçek saate eşitlemek anlamlı olur`)}</span></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn pri" id="rt">${L(`Sync clock and switch to real time (1 s = 1 s)`, `Saati eşitle ve gerçek zamana geç (1 sn = 1 sn)`)}</button><button class="btn" id="rt5">${L(`Sync clock, stay at 1× speed`, `Saati eşitle, 1× hızda kal`)}</button><span class="muted" id="rtinfo"></span></div></div>`;
    $("#rt").onclick = async () => { await api("/sim/esitle", {}); await api("/sim", { tps: 1 / 60, paused: false }); ctx.toast(L("Real-time mode", "Gerçek zaman modu"), "ok"); this.load(ctx); };
    $("#rt5").onclick = async () => { await api("/sim/esitle", {}); await api("/sim", { tps: 1, paused: false }); ctx.toast(L("Clock synced", "Saat eşitlendi"), "ok"); this.load(ctx); };
    await this.load(ctx);
    ctx.poll(() => this.load(ctx, true), 5000);
  },
  async load(ctx, soft) {
    D = await api("/gercek");
    if (!$("#c-price")) return;
    this.price(ctx, soft); this.wx(ctx, soft); if (!soft) { this.cal(ctx); this.bridge(ctx); } else { this.bridgeList(ctx); this.calList(ctx); }
    const ri = $("#rtinfo"); if (ri) ri.textContent = `${L(`Real clock`, `Gerçek saat`)} ${D.simdi.slice(11, 16)} ${L(`· simulation`, `· simülasyon`)} ${D.sim_saat} ${L(`· speed`, `· hız`)} ${D.tps < 0.5 ? L("real time", "gerçek zaman") : D.tps + "×"}`;
  },
  // ------------------------------------------------------------ price
  price(ctx, soft) {
    const p = D.fiyat, el = $("#c-price");
    if (soft && el.contains(document.activeElement)) return;
    const st = p.mod === "simule" ? `<span class="muted">${L(`simulated tariff (night ₺2.05 · day ₺3.35 · peak ₺5.10 per kWh)`, `simüle tarife (gece 2,05 · gündüz 3,35 · puant 5,10 ₺/kWh)`)}</span>`
      : p.durum === "ok" ? `<span class="st st-calisiyor">${L(`connected`, `bağlı`)}</span> <span class="muted">${p.gun || ""}${p.son ? L(" · last fetch ", " · son çekim ") + esc(p.son.slice(11)) : ""}</span>`
      : `<span class="st st-ariza">${esc(p.hata || (p.durum === "hata" ? L("error", "hata") : p.durum === "bekliyor" ? L("waiting", "bekliyor") : p.durum))}</span>`;
    el.innerHTML = `<div class="card-h"><h3>${L(`⚡ Electricity price`, `⚡ Elektrik fiyatı`)}</h3><span class="sub">${L(`EPİAŞ Day-Ahead Market (Turkey) · MCP`, `EPİAŞ Gün Öncesi Piyasası · PTF`)}</span></div>
      <div class="seg" id="pm">${[["simule", L("Simulation", "Simülasyon")], ["epias", L("EPİAŞ live", "EPİAŞ canlı")], ["dosya", L("From file", "Dosyadan")]].map(([k, t]) => `<button data-m="${k}" class="${p.mod === k ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="mt" style="font-size:13px">${st}</div>
      <div class="mt" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px"><span class="muted">${L(`Fixed component added on top of MCP (distribution, YEKDEM, taxes)`, `PTF üstüne eklenen sabit bileşen (dağıtım, YEKDEM, vergiler)`)}</span>
        <input class="inp" id="fee" type="number" step="0.05" value="${p.sabit_bilesen}" style="width:90px"> <span class="muted">₺/kWh</span><button class="btn sm" id="feesv">${L(`Save`, `Kaydet`)}</button></div>
      ${p.mod === "epias" && !p.kimlik ? `<div class="item mt"><div class="ttl">${L(`EPİAŞ account required`, `EPİAŞ hesabı gerekli`)}</div><div class="txt">${L(`Since 2024 the MCP service requires a login ticket (TGT). Connect with your Transparency Platform account:`, `PTF servisi 2024'ten beri giriş bileti (TGT) istiyor. Şeffaflık Platformu kaydınla bağlan:`)}</div>
        <div class="row"><input class="inp" id="eu" placeholder="${L(`username / e-mail`, `kullanıcı adı / e-posta`)}" style="flex:1;min-width:160px"><input class="inp" id="ep" type="password" placeholder="${L(`password`, `şifre`)}" style="flex:1;min-width:120px"><button class="btn sm pri" id="elog">${L(`Connect for this session`, `Bu oturum için bağlan`)}</button></div>
        <div class="txt" style="margin-top:8px">${L(`To make it permanent (the password is only stored in the .env file on your computer), run this in the project folder:`, `Kalıcı yapmak için (şifre yalnızca senin bilgisayarındaki .env dosyasında durur), proje klasöründe:`)}</div>
        <div class="code mt">${L(`Set-Content .env "EPIAS_KULLANICI=you@example.com\`nEPIAS_SIFRE=yourpassword" -Encoding ASCII
docker compose up -d`, `Set-Content .env "EPIAS_KULLANICI=kullanici@ornek.com\`nEPIAS_SIFRE=sifren" -Encoding ASCII
docker compose up -d`)}</div></div>` : ""}
      ${p.mod === "dosya" || p.mod === "simule" ? `<div class="mt" style="font-size:13px"><span class="muted">${L(`Upload an MCP file (EPİAŞ Transparency › Day-Ahead Market › MCP › download Excel/CSV):`, `PTF dosyası yükle (EPİAŞ Şeffaflık › GÖP › PTF › Excel/CSV indir):`)}</span>
        <input type="file" id="pf" accept=".csv,.xlsx,.txt" class="mt" style="display:block">${p.dosya_ad ? `<div class="muted mt">${L(`Loaded:`, `Yüklü:`)} <b>${esc(p.dosya_ad)}</b> · ${p.dosya_gun_sayisi} ${L(`days`, `gün`)}</div>` : ""}</div>` : ""}
      <div id="pch" class="mt"></div>
      <div class="muted" style="font-size:12px">${L(`With real prices on, the battery and demand shifting treat the 5 most expensive hours of the day as "peak" and the 8 cheapest as "night".`, `Gerçek fiyat açıkken batarya ve talep kaydırma "puant"ı günün en pahalı 5 saati, "gece"yi en ucuz 8 saati olarak alır.`)}</div>`;
    $$("#pm button").forEach((b) => b.onclick = async () => { try { await api("/gercek/fiyat", { mod: b.dataset.m }); } catch (e) { ctx.toast(esc(e.message), "uyari"); } this.load(ctx); });
    $("#feesv").onclick = async () => { await api("/gercek/fiyat", { sabit_bilesen: +$("#fee").value }); ctx.toast(L("Fixed component saved", "Sabit bileşen kaydedildi"), "ok"); this.load(ctx); };
    const lg = $("#elog"); if (lg) lg.onclick = async () => { lg.disabled = true; try { const r = await api("/gercek/fiyat/giris", { kullanici: $("#eu").value, sifre: $("#ep").value }); ctx.toast(r.durum === "ok" ? L("EPİAŞ connected", "EPİAŞ bağlandı") : L("Could not connect: ", "Bağlanamadı: ") + esc(r.hata), r.durum === "ok" ? "ok" : "uyari"); } catch (e) { ctx.toast(esc(e.message), "uyari"); } this.load(ctx); };
    const pf = $("#pf"); if (pf) pf.onchange = async () => { try { const r = await upload("/gercek/fiyat/dosya", pf.files[0]); ctx.toast(`${L(`MCP loaded:`, `PTF yüklendi:`)} ${r.dosya_gun_sayisi} ${L(`days`, `gün`)}`, "ok"); } catch (e) { ctx.toast(esc(e.message), "uyari"); } this.load(ctx); };
    if (p.ptf) lineChart($("#pch"), { height: 190, xFmt: fmt.hm, series: [{ label: L("MCP (₺/MWh ÷ 1000)", "PTF (₺/MWh ÷ 1000)"), color: "#a78bfa", data: hrs(p.ptf.map((v) => v / 1000)), area: true },
      { label: L("Unit price paid ₺/kWh", "Ödenen birim fiyat ₺/kWh"), color: "#f97316", data: hrs(p.birim_fiyat) }], yFmt: (v) => fmt.n(v, 2) });
    else $("#pch").innerHTML = p.mod === "simule" ? "" : `<div class="empty">${L(`No price data yet`, `Henüz fiyat verisi yok`)}</div>`;
  },
  // ------------------------------------------------------------ weather
  wx(ctx, soft) {
    const w = D.hava, el = $("#c-wx");
    if (soft && el.contains(document.activeElement)) return;
    const st = !w.aktif ? `<span class="muted">${L(`off — cloud and wind come from the simulation`, `kapalı — bulut ve rüzgâr simülasyondan`)}</span>` : w.durum === "ok" ? `<span class="st st-calisiyor">${L(`connected`, `bağlı`)}</span> <span class="muted">${esc(w.ad)}${w.son ? " · " + esc(w.son.slice(11)) : ""}</span>` : `<span class="st st-ariza">${esc(w.hata || (w.durum === "hata" ? L("error", "hata") : w.durum === "bekliyor" ? L("waiting", "bekliyor") : w.durum))}</span>`;
    const n = w.simdi;
    el.innerHTML = `<div class="card-h"><h3>${L(`🌤 Real weather`, `🌤 Gerçek hava durumu`)}</h3><span class="sub">${L(`Open-Meteo · free, no API key`, `Open-Meteo · ücretsiz, anahtarsız`)}</span><span class="act"><label class="switch ${w.aktif ? "on" : ""}" id="wxs"><i></i><span>${L(`Active`, `Aktif`)}</span></label></span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select class="inp" id="wcity">${Object.keys(w.sehirler).map((c) => `<option ${c === w.ad ? "selected" : ""}>${c}</option>`).join("")}<option value="__ozel" ${w.sehirler[w.ad] ? "" : "selected"}${L(`>Enter coordinates…`, `>Koordinat gir…`)}</option></select>
        ${L(`<input class="inp" id="wlat" placeholder="latitude" value="`, `<input class="inp" id="wlat" placeholder="enlem" value="`)}${w.lat}${L(`" style="width:90px"><input class="inp" id="wlon" placeholder="longitude" value="`, `" style="width:90px"><input class="inp" id="wlon" placeholder="boylam" value="`)}${w.lon}" style="width:90px"><button class="btn sm" id="wsv">${L(`Save location`, `Konumu kaydet`)}</button></div>
      <div class="mt" style="font-size:13px">${st}</div>
      ${n ? `<div class="grid g4 mt" style="font-size:12.5px">${[[L("Temperature", "Sıcaklık"), n.temperature_2m + " °C"], [L("Cloud", "Bulut"), n.cloud_cover + "%"], [L("Wind", "Rüzgâr"), n.wind_speed_10m + " m/s"], [L("Direction", "Yön"), n.wind_direction_10m + "°"]].map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b class="num">${v}</b></div>`).join("")}</div>` : ""}
      <div id="wch" class="mt"></div>
      <div class="muted" style="font-size:12px">${L(`Effects: cloud → solar and hydrogen output · temperature → cooling load, heating gas, water demand · wind → direction of stack smoke and chemical leak clouds.`, `Etkileri: bulut → GES ve hidrojen üretimi · sıcaklık → soğutma yükü, ısıtma gazı, su ihtiyacı · rüzgâr → baca dumanı ve kimyasal sızıntı bulutunun yönü.`)}</div>`;
    $("#wxs").onclick = async () => { await api("/gercek/hava", { aktif: !w.aktif }); this.load(ctx); };
    $("#wcity").onchange = (e) => { const c = w.sehirler[e.target.value]; if (c) { $("#wlat").value = c[0]; $("#wlon").value = c[1]; } };
    $("#wsv").onclick = async () => {
      const c = $("#wcity").value;
      const body = c !== "__ozel" && w.sehirler[c] && +$("#wlat").value === w.sehirler[c][0] ? { ad: c } : { ad: c === "__ozel" ? null : c, lat: +$("#wlat").value, lon: +$("#wlon").value };
      await api("/gercek/hava", body); ctx.toast(L("Location saved", "Konum kaydedildi"), "ok"); this.load(ctx);
    };
    if (w.saatler) lineChart($("#wch"), { height: 170, xFmt: fmt.hm, series: [{ label: L("Temperature °C", "Sıcaklık °C"), color: "#f97316", data: hrs(w.saatler.map((x) => x.sicaklik)) },
      { label: L("Cloud % ÷ 4", "Bulut % ÷ 4"), color: "#94a3b8", data: hrs(w.saatler.map((x) => x.bulut / 4)), area: true }, { label: L("Wind m/s", "Rüzgâr m/s"), color: "#22d3ee", data: hrs(w.saatler.map((x) => x.ruzgar)) }] });
  },
  // ------------------------------------------------------------ calibration
  cal(ctx) {
    const W = ctx.world;
    $("#c-cal").innerHTML = `<div class="card-h"><h3>${L(`📈 Site calibration from historical data`, `📈 Geçmiş veriyle tesis kalibrasyonu`)}</h3><span class="sub">${L(`upload a site's real electricity, output, gas and water records and the model is fitted to that site`, `bir tesisin gerçek elektrik, üretim, gaz ve su kayıtlarını yükle; model o tesise oturtulsun`)}</span>
      <span class="act"><a class="btn sm" href="/api/kalibrasyon/sablon">${L(`Download CSV template`, `Şablon CSV indir`)}</a></span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><select class="inp" id="cf">${W.fabrikalar.map((f) => `<option value="${f.id}">${esc(f.ad)} (${f.id})</option>`).join("")}</select>
        <input type="file" id="cfile" accept=".csv,.xlsx,.txt"><button class="btn" id="cprev">${L(`Preview`, `Önizle`)}</button><button class="btn pri" id="capp" disabled>${L(`Apply`, `Uygula`)}</button></div>
      <div class="muted mt" style="font-size:12px">${L(`From hourly (or 15-min) data it extracts a 24-hour load profile, installed power, output rate, and gas and water factors. With daily/monthly data (e.g. electricity bills) it adjusts average power and output and keeps the shift model. Column names are flexible:`, `Saatlik (veya 15 dk) veride 24 saatlik yük profili, kurulu güç, üretim hızı, gaz ve su katsayıları çıkarılır. Günlük/aylık veride (ör. elektrik faturası) ortalama güç ve üretim ayarlanır, vardiya modeli korunur. Sütun adları serbesttir:`)} <i>${L(`date, hour, kwh or kw, output, gas, water`, `tarih, saat, kwh veya kw, üretim, gaz, su`)}</i> ${L(`(Turkish names work too). Both 1,234.5 and Turkish 1.234,5 number formats are supported.`, `. Türkçe sayı biçimi (1.234,5) desteklenir.`)}</div>
      <div id="cres"></div><div class="hr"></div><div class="card-h"><h3 style="font-size:13px">${L(`Calibrated sites`, `Kalibre edilmiş tesisler`)}</h3></div><div id="clist"></div>`;
    $("#cprev").onclick = () => this.calRun(ctx, false);
    $("#capp").onclick = () => this.calRun(ctx, true);
    this.calList(ctx);
  },
  async calRun(ctx, apply) {
    const file = $("#cfile").files[0];
    if (!file) { ctx.toast(L("Choose a file first", "Önce bir dosya seç"), "uyari"); return; }
    try {
      const r = await upload(`/kalibrasyon/${$("#cf").value}${apply ? "?uygula=true" : ""}`, file);
      calibPrev = r;
      $("#capp").disabled = false;
      const rows = [[L("Installed power (kW)", "Kurulu güç (kW)"), "kurulu_kw"], [L("Output / hour (full load)", "Üretim / saat (tam yük)"), "uretim_saat"], [L("Gas factor (m³/h/person)", "Gaz katsayısı (m³/sa/kişi)"), "gaz_k"], [L("Water factor (m³/h/person)", "Su katsayısı (m³/sa/kişi)"), "su_k"]];
      $("#cres").innerHTML = `<div class="grid mt" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
        <div><div class="muted" style="font-size:12px">${esc(r.fabrika_ad)} · ${MODE[r.mod] || r.mod} ${L(`data ·`, `veri ·`)} ${r.satir} ${L(`rows ·`, `satır ·`)} ${esc(r.aralik)}</div>
          <table class="tbl mt"><tr><th>${L(`Parameter`, `Parametre`)}</th><th class="r">Model</th><th class="r">${L(`From real data`, `Gerçek veriden`)}</th></tr>${rows.map(([n, k]) => `<tr><td>${n}</td><td class="r num">${fmt.n(r.onceki[k], k.endsWith("_k") ? 3 : 0)}</td><td class="r num t-acc"><b>${fmt.n(r.yeni[k], k.endsWith("_k") ? 3 : 0)}</b></td></tr>`).join("")}</table>
          <div class="grid g2 mt" style="font-size:12.5px">${[[L("Average power", "Ortalama güç"), fmt.n(r.ozet.ort_kw) + " kW"], [L("Peak power", "Pik güç"), r.ozet.pik_kw ? fmt.n(r.ozet.pik_kw) + " kW" : "—"], [L("Daily consumption", "Günlük tüketim"), fmt.n(r.ozet.gunluk_kwh) + " kWh"], [L("Monthly consumption (≈)", "Aylık tüketim (≈)"), fmt.n(r.ozet.aylik_kwh) + " kWh"]].map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b class="num">${v}</b></div>`).join("")}</div>
          ${r.uyarilar.map((u) => `<div class="item mt t-warn" style="font-size:12.5px">⚠ ${esc(u)}</div>`).join("")}
          <div class="muted mt" style="font-size:11.5px">${L(`Detected columns:`, `Algılanan sütunlar:`)} ${Object.entries(r.sutunlar).filter(([, v]) => v).map(([k, v]) => `${k}=<b>${esc(v)}</b>`).join(" · ")}</div></div>
        <div><div class="muted" style="font-size:12px">${L(`24-hour load profile`, `24 saatlik yük profili`)}</div><div id="cprof"></div></div></div>
        ${apply ? `<div class="note mt">${L(`✅ Applied. The site now runs with this profile; the setting is saved.`, `✅ Uygulandı. Tesis bundan sonra bu profille çalışır; ayar kalıcıdır.`)}</div>` : `<div class="muted mt" style="font-size:12.5px">${L(`If it looks right, press`, `Doğruysa`)} <b>${L(`Apply`, `Uygula`)}</b>.</div>`}`;
      if (r.profil) lineChart($("#cprof"), { height: 190, xFmt: fmt.hm, min: 0, series: [{ label: L("Load %", "Yük oranı %"), color: "#22d3ee", data: hrs(r.profil.map((v) => v * 100)), area: true }] });
      else $("#cprof").innerHTML = `<div class="empty">${L(`No hourly profile for daily/monthly data`, `Günlük/aylık veride saatlik profil yok`)}</div>`;
      if (apply) { ctx.toast(`${esc(r.fabrika_ad)} ${L(`calibrated`, `kalibre edildi`)}`, "ok"); this.load(ctx, true); }
    } catch (e) { $("#cres").innerHTML = `<div class="item mt t-crit">❌ ${esc(e.message)}</div>`; }
  },
  calList(ctx) {
    const el = $("#clist"); if (!el) return;
    el.innerHTML = D.kalibrasyon.length ? `<table class="tbl"><tr><th>${L(`Site`, `Tesis`)}</th><th>${L(`Data`, `Veri`)}</th><th>${L(`Range`, `Aralık`)}</th><th class="r">${L(`Avg. power`, `Ort. güç`)}</th><th class="r">${L(`Monthly kWh`, `Aylık kWh`)}</th><th></th></tr>${D.kalibrasyon.map((c) => `<tr><td><b>${esc(c.fabrika_ad)}</b></td><td>${MODE[c.mod] || c.mod} · ${c.satir} ${L(`rows`, `satır`)}${c.dosya ? ` · ${esc(c.dosya)}` : ""}</td><td class="muted">${esc(c.aralik)}</td><td class="r num">${fmt.n(c.ozet.ort_kw)} kW</td><td class="r num">${fmt.n(c.ozet.aylik_kwh)}</td><td><button class="btn sm danger" data-cr="${c.fabrika}${L(`">Reset`, `">Sıfırla`)}</button></td></tr>`).join("")}</table>` : `<div class="empty">${L(`No calibrated sites yet`, `Henüz kalibre edilmiş tesis yok`)}</div>`;
    $$("[data-cr]", el).forEach((b) => b.onclick = async () => { await api("/kalibrasyon/" + b.dataset.cr, {}, "DELETE"); ctx.toast(L("Calibration reset", "Kalibrasyon sıfırlandı")); this.load(ctx, true); });
  },
  // ------------------------------------------------------------ bridge
  bridge(ctx) {
    const W = ctx.world;
    $("#c-br").innerHTML = `<div class="card-h"><h3>${L(`🔌 Fabrika OS / SCADA bridge`, `🔌 Fabrika OS / SCADA köprüsü`)}</h3><span class="sub">${L(`reads any URL that returns JSON at regular intervals and feeds it into a NEXUS site`, `JSON veren herhangi bir adresi düzenli okuyup bir NEXUS tesisine akıtır`)}</span></div>
      <div class="grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)">
        <div>
          <div class="muted" style="font-size:12.5px">${L(`1 · Enter the status URL of Fabrika OS (or a PLC gateway) and test it. Because NEXUS runs inside Docker, services on your computer are reached via`, `1 · Fabrika OS'un (veya PLC ağ geçidinin) durum adresini yaz ve dene. NEXUS Docker içinde çalıştığı için bilgisayarındaki servise`)} <b>host.docker.internal</b>.</div>
          <div class="row" style="display:flex;gap:8px;margin-top:8px"><input class="inp" id="burl" style="flex:1" placeholder="http://host.docker.internal:8000/api/..."><button class="btn" id="bprobe">${L(`Test`, `Dene`)}</button></div>
          <div class="muted mt" style="font-size:12px">${L(`To find the Fabrika OS port, in PowerShell:`, `Fabrika OS'un portunu bulmak için PowerShell:`)}</div>
          <div class="code mt">docker ps --format "table {{.Names}}\`t{{.Ports}}"</div>
          <div id="bfields" class="mt"></div></div>
        <div id="bmap"><div class="empty">${L(`Fields are mapped here after you test the URL`, `Adresi deneyince alanlar burada eşlenir`)}</div></div></div>
      <div class="hr"></div><div class="card-h"><h3 style="font-size:13px">${L(`Saved bridges`, `Kayıtlı köprüler`)}</h3></div><div id="blist"></div>`;
    $("#bprobe").onclick = async () => {
      const url = $("#burl").value.trim(); if (!url) return;
      $("#bfields").innerHTML = `<div class="muted">${L(`Reading…`, `Okunuyor…`)}</div>`;
      try { probe = await api("/kopru/dene", { url }); this.bridgeMap(ctx, url); }
      catch (e) { $("#bfields").innerHTML = `<div class="item t-crit">❌ ${esc(e.message)}</div>`; }
    };
    this.bridgeList(ctx);
  },
  bridgeMap(ctx, url) {
    const W = ctx.world, P = probe;
    $("#bfields").innerHTML = `<div class="muted" style="font-size:12px">${P.alanlar.length} ${L(`fields found`, `alan bulundu`)}</div><div class="tbl-wrap" style="max-height:260px"><table class="tbl" style="font-size:12px"><tr><th>${L(`Path`, `Yol`)}</th><th>${L(`Value`, `Değer`)}</th></tr>${P.alanlar.slice(0, 120).map((a) => `<tr><td class="num">${esc(a.yol)}</td><td>${esc(String(a.deger)).slice(0, 40)}</td></tr>`).join("")}</table></div>`;
    const opt = (sel) => `<option value="">${L(`— none —`, `— yok —`)}</option>` + P.alanlar.map((a) => `<option ${a.yol === sel ? "selected" : ""}>${esc(a.yol)}</option>`).join("");
    const o = P.oneri || {};
    $("#bmap").innerHTML = `<div class="muted" style="font-size:12.5px">${L(`2 · Map the fields (suggestions pre-selected)`, `2 · Alanları eşle (öneriler otomatik seçildi)`)}</div>
      <div style="display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center;margin-top:8px;font-size:13px">
        <span>${L(`Power`, `Güç`)}</span><div style="display:flex;gap:6px"><select class="inp" id="m-power" style="flex:1">${opt(o.power_kw)}</select><select class="inp" id="m-pk"><option value="1">kW</option><option value="0.001" ${/w$|watt/i.test(o.power_kw || "") && !/kw/i.test(o.power_kw || "") ? "selected" : ""}>W → kW</option><option value="1000">MW → kW</option></select></div>
        <span>${L(`Status`, `Durum`)}</span><select class="inp" id="m-durum">${opt(o.durum)}</select>
        <span>OEE</span><select class="inp" id="m-oee">${opt(o.oee)}</select>
        <span>${L(`Output / min`, `Üretim / dk`)}</span><select class="inp" id="m-uretim">${opt(o.uretim_dk)}</select>
        <span>${L(`Target site`, `Hedef tesis`)}</span><select class="inp" id="m-f">${W.fabrikalar.map((f) => `<option value="${f.id}">${esc(f.ad)} (${f.id})</option>`).join("")}</select>
        <span>${L(`Read interval`, `Okuma aralığı`)}</span><div><input class="inp" id="m-int" type="number" value="10" style="width:80px"> s</div>
        <span>${L(`Bridge name`, `Köprü adı`)}</span><input class="inp" id="m-ad" value="${L(`Fabrika OS bridge`, `Fabrika OS köprüsü`)}"></div>
      <div class="muted mt" style="font-size:11.5px">${L(`Status values (RUN, STOP, FAULT, 1/0, running…) are converted automatically. OEE given as a percentage is converted to 0–1.`, `Durum değerleri (RUN, STOP, FAULT, 1/0, çalışıyor…) otomatik çevrilir. OEE yüzde gelirse 0–1'e çevrilir.`)}</div>
      <button class="btn pri mt" id="bsave">${L(`3 · Save and start the bridge`, `3 · Köprüyü kaydet ve başlat`)}</button>`;
    $("#bsave").onclick = async () => {
      const b = { ad: $("#m-ad").value, url, fabrika: $("#m-f").value, aralik_sn: +$("#m-int").value,
        alanlar: { power_kw: $("#m-power").value, durum: $("#m-durum").value, oee: $("#m-oee").value, uretim_dk: $("#m-uretim").value },
        carpan: { power_kw: +$("#m-pk").value } };
      try { await api("/kopru", b); ctx.toast(L("Bridge saved — the site will show as 'live' with a red dot on the map", "Köprü kaydedildi — tesis haritada kırmızı noktayla 'canlı' görünecek"), "ok"); this.load(ctx, true); }
      catch (e) { ctx.toast(esc(e.message), "uyari"); }
    };
  },
  bridgeList(ctx) {
    const el = $("#blist"); if (!el) return;
    const W = ctx.world;
    el.innerHTML = D.kopruler.length ? `<table class="tbl"><tr><th>${L(`Bridge`, `Köprü`)}</th><th>${L(`Site`, `Tesis`)}</th><th>${L(`Status`, `Durum`)}</th><th>${L(`Last value`, `Son değer`)}</th><th class="r">${L(`Reads`, `Okuma`)}</th><th></th></tr>${D.kopruler.map((b) => {
      const f = W.fabrikalar.find((x) => x.id === b.fabrika);
      const v = b.son_deger || {};
      return `<tr><td><b>${esc(b.ad || L("bridge", "köprü"))}</b><br><span class="dim" style="font-size:11.5px">${esc(b.url)}</span></td><td>${esc(f ? f.ad : b.fabrika)}</td>
        <td>${b.durum === "ok" ? `<span class="st st-calisiyor">${L(`connected`, `bağlı`)}</span> <span class="dim">${b.son}</span>` : b.durum === "hata" ? `<span class="st st-ariza">${L(`error`, `hata`)}</span><br><span class="dim" style="font-size:11.5px">${esc(b.hata)}</span>` : `<span class="muted">${L(`waiting`, `bekliyor`)}</span>`}</td>
        <td class="num" style="font-size:12px">${v.power_kw != null ? fmt.n(v.power_kw) + " kW" : ""}${v.durum ? " · " + (DST[v.durum] || v.durum) : ""}${v.oee != null ? " · OEE " + fmt.pct(v.oee) : ""}</td><td class="r num">${b.mesaj}</td>
        <td><button class="btn sm danger" data-bd="${b.id}${L(`">Delete`, `">Sil`)}</button></td></tr>`;
    }).join("")}</table>` : `<div class="empty">${L(`No saved bridges`, `Kayıtlı köprü yok`)}</div>`;
    $$("[data-bd]", el).forEach((b) => b.onclick = async () => { await api("/kopru/" + b.dataset.bd, {}, "DELETE"); this.load(ctx, true); });
  },
};
