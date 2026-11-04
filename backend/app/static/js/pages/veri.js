import { $, $$, esc, fmt, lineChart, api } from "../ui.js";

let D = null, probe = null, calibPrev = null;
const hrs = (arr) => arr.map((v, h) => [h * 60, v]);
const MODE = { saatlik: "hourly", gunluk: "daily", aylik: "monthly" };
const DST = { calisiyor: "running", bosta: "idle", ariza: "fault", bakim: "maintenance", durdu: "stopped" };

async function upload(path, file) {
  const r = await fetch("/api" + path, { method: "POST", headers: { "x-dosya-adi": encodeURIComponent(file.name).replace(/%20/g, " ") }, body: file });
  if (!r.ok) { let d = r.statusText; try { d = (await r.json()).detail; } catch (_) {} throw new Error(d); }
  return r.json();
}

export default {
  async mount(root, ctx) {
    root.innerHTML = `<div class="note">This page moves NEXUS from simulation to reality. Each source is switched on and off independently; if a connection drops, the system quietly falls back to simulation. The <b>🌐</b> badge in the top bar shows which real data is active.</div>
    <div class="grid mt g2">
      <div class="card" id="c-price"></div>
      <div class="card" id="c-wx"></div></div>
    <div class="card mt" id="c-cal"></div>
    <div class="card mt" id="c-br"></div>
    <div class="card mt"><div class="card-h"><h3>⏱ Real time</h3><span class="sub">real prices and weather arrive hourly, so syncing the simulation to the real clock makes sense</span></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn pri" id="rt">Sync clock and switch to real time (1 s = 1 s)</button><button class="btn" id="rt5">Sync clock, stay at 1× speed</button><span class="muted" id="rtinfo"></span></div></div>`;
    $("#rt").onclick = async () => { await api("/sim/esitle", {}); await api("/sim", { tps: 1 / 60, paused: false }); ctx.toast("Real-time mode", "ok"); this.load(ctx); };
    $("#rt5").onclick = async () => { await api("/sim/esitle", {}); await api("/sim", { tps: 1, paused: false }); ctx.toast("Clock synced", "ok"); this.load(ctx); };
    await this.load(ctx);
    ctx.poll(() => this.load(ctx, true), 5000);
  },
  async load(ctx, soft) {
    D = await api("/gercek");
    if (!$("#c-price")) return;
    this.price(ctx, soft); this.wx(ctx, soft); if (!soft) { this.cal(ctx); this.bridge(ctx); } else { this.bridgeList(ctx); this.calList(ctx); }
    const ri = $("#rtinfo"); if (ri) ri.textContent = `Real clock ${D.simdi.slice(11, 16)} · simulation ${D.sim_saat} · speed ${D.tps < 0.5 ? "real time" : D.tps + "×"}`;
  },
  // ------------------------------------------------------------ price
  price(ctx, soft) {
    const p = D.fiyat, el = $("#c-price");
    if (soft && el.contains(document.activeElement)) return;
    const st = p.mod === "simule" ? `<span class="muted">simulated tariff (night ₺2.05 · day ₺3.35 · peak ₺5.10 per kWh)</span>`
      : p.durum === "ok" ? `<span class="st st-calisiyor">connected</span> <span class="muted">${p.gun || ""}${p.son ? " · last fetch " + esc(p.son.slice(11)) : ""}</span>`
      : `<span class="st st-ariza">${esc(p.hata || (p.durum === "hata" ? "error" : p.durum === "bekliyor" ? "waiting" : p.durum))}</span>`;
    el.innerHTML = `<div class="card-h"><h3>⚡ Electricity price</h3><span class="sub">EPİAŞ Day-Ahead Market (Turkey) · MCP</span></div>
      <div class="seg" id="pm">${[["simule", "Simulation"], ["epias", "EPİAŞ live"], ["dosya", "From file"]].map(([k, t]) => `<button data-m="${k}" class="${p.mod === k ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="mt" style="font-size:13px">${st}</div>
      <div class="mt" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px"><span class="muted">Fixed component added on top of MCP (distribution, YEKDEM, taxes)</span>
        <input class="inp" id="fee" type="number" step="0.05" value="${p.sabit_bilesen}" style="width:90px"> <span class="muted">₺/kWh</span><button class="btn sm" id="feesv">Save</button></div>
      ${p.mod === "epias" && !p.kimlik ? `<div class="item mt"><div class="ttl">EPİAŞ account required</div><div class="txt">Since 2024 the MCP service requires a login ticket (TGT). Connect with your Transparency Platform account:</div>
        <div class="row"><input class="inp" id="eu" placeholder="username / e-mail" style="flex:1;min-width:160px"><input class="inp" id="ep" type="password" placeholder="password" style="flex:1;min-width:120px"><button class="btn sm pri" id="elog">Connect for this session</button></div>
        <div class="txt" style="margin-top:8px">To make it permanent (the password is only stored in the .env file on your computer), run this in the project folder:</div>
        <div class="code mt">Set-Content .env "EPIAS_KULLANICI=you@example.com\`nEPIAS_SIFRE=yourpassword" -Encoding ASCII
docker compose up -d</div></div>` : ""}
      ${p.mod === "dosya" || p.mod === "simule" ? `<div class="mt" style="font-size:13px"><span class="muted">Upload an MCP file (EPİAŞ Transparency › Day-Ahead Market › MCP › download Excel/CSV):</span>
        <input type="file" id="pf" accept=".csv,.xlsx,.txt" class="mt" style="display:block">${p.dosya_ad ? `<div class="muted mt">Loaded: <b>${esc(p.dosya_ad)}</b> · ${p.dosya_gun_sayisi} days</div>` : ""}</div>` : ""}
      <div id="pch" class="mt"></div>
      <div class="muted" style="font-size:12px">With real prices on, the battery and demand shifting treat the 5 most expensive hours of the day as "peak" and the 8 cheapest as "night".</div>`;
    $$("#pm button").forEach((b) => b.onclick = async () => { try { await api("/gercek/fiyat", { mod: b.dataset.m }); } catch (e) { ctx.toast(esc(e.message), "uyari"); } this.load(ctx); });
    $("#feesv").onclick = async () => { await api("/gercek/fiyat", { sabit_bilesen: +$("#fee").value }); ctx.toast("Fixed component saved", "ok"); this.load(ctx); };
    const lg = $("#elog"); if (lg) lg.onclick = async () => { lg.disabled = true; try { const r = await api("/gercek/fiyat/giris", { kullanici: $("#eu").value, sifre: $("#ep").value }); ctx.toast(r.durum === "ok" ? "EPİAŞ connected" : "Could not connect: " + esc(r.hata), r.durum === "ok" ? "ok" : "uyari"); } catch (e) { ctx.toast(esc(e.message), "uyari"); } this.load(ctx); };
    const pf = $("#pf"); if (pf) pf.onchange = async () => { try { const r = await upload("/gercek/fiyat/dosya", pf.files[0]); ctx.toast(`MCP loaded: ${r.dosya_gun_sayisi} days`, "ok"); } catch (e) { ctx.toast(esc(e.message), "uyari"); } this.load(ctx); };
    if (p.ptf) lineChart($("#pch"), { height: 190, xFmt: fmt.hm, series: [{ label: "MCP (₺/MWh ÷ 1000)", color: "#a78bfa", data: hrs(p.ptf.map((v) => v / 1000)), area: true },
      { label: "Unit price paid ₺/kWh", color: "#f97316", data: hrs(p.birim_fiyat) }], yFmt: (v) => fmt.n(v, 2) });
    else $("#pch").innerHTML = p.mod === "simule" ? "" : `<div class="empty">No price data yet</div>`;
  },
  // ------------------------------------------------------------ weather
  wx(ctx, soft) {
    const w = D.hava, el = $("#c-wx");
    if (soft && el.contains(document.activeElement)) return;
    const st = !w.aktif ? `<span class="muted">off — cloud and wind come from the simulation</span>` : w.durum === "ok" ? `<span class="st st-calisiyor">connected</span> <span class="muted">${esc(w.ad)}${w.son ? " · " + esc(w.son.slice(11)) : ""}</span>` : `<span class="st st-ariza">${esc(w.hata || (w.durum === "hata" ? "error" : w.durum === "bekliyor" ? "waiting" : w.durum))}</span>`;
    const n = w.simdi;
    el.innerHTML = `<div class="card-h"><h3>🌤 Real weather</h3><span class="sub">Open-Meteo · free, no API key</span><span class="act"><label class="switch ${w.aktif ? "on" : ""}" id="wxs"><i></i><span>Active</span></label></span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select class="inp" id="wcity">${Object.keys(w.sehirler).map((c) => `<option ${c === w.ad ? "selected" : ""}>${c}</option>`).join("")}<option value="__ozel" ${w.sehirler[w.ad] ? "" : "selected"}>Enter coordinates…</option></select>
        <input class="inp" id="wlat" placeholder="latitude" value="${w.lat}" style="width:90px"><input class="inp" id="wlon" placeholder="longitude" value="${w.lon}" style="width:90px"><button class="btn sm" id="wsv">Save location</button></div>
      <div class="mt" style="font-size:13px">${st}</div>
      ${n ? `<div class="grid g4 mt" style="font-size:12.5px">${[["Temperature", n.temperature_2m + " °C"], ["Cloud", n.cloud_cover + "%"], ["Wind", n.wind_speed_10m + " m/s"], ["Direction", n.wind_direction_10m + "°"]].map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b class="num">${v}</b></div>`).join("")}</div>` : ""}
      <div id="wch" class="mt"></div>
      <div class="muted" style="font-size:12px">Effects: cloud → solar and hydrogen output · temperature → cooling load, heating gas, water demand · wind → direction of stack smoke and chemical leak clouds.</div>`;
    $("#wxs").onclick = async () => { await api("/gercek/hava", { aktif: !w.aktif }); this.load(ctx); };
    $("#wcity").onchange = (e) => { const c = w.sehirler[e.target.value]; if (c) { $("#wlat").value = c[0]; $("#wlon").value = c[1]; } };
    $("#wsv").onclick = async () => {
      const c = $("#wcity").value;
      const body = c !== "__ozel" && w.sehirler[c] && +$("#wlat").value === w.sehirler[c][0] ? { ad: c } : { ad: c === "__ozel" ? null : c, lat: +$("#wlat").value, lon: +$("#wlon").value };
      await api("/gercek/hava", body); ctx.toast("Location saved", "ok"); this.load(ctx);
    };
    if (w.saatler) lineChart($("#wch"), { height: 170, xFmt: fmt.hm, series: [{ label: "Temperature °C", color: "#f97316", data: hrs(w.saatler.map((x) => x.sicaklik)) },
      { label: "Cloud % ÷ 4", color: "#94a3b8", data: hrs(w.saatler.map((x) => x.bulut / 4)), area: true }, { label: "Wind m/s", color: "#22d3ee", data: hrs(w.saatler.map((x) => x.ruzgar)) }] });
  },
  // ------------------------------------------------------------ calibration
  cal(ctx) {
    const W = ctx.world;
    $("#c-cal").innerHTML = `<div class="card-h"><h3>📈 Site calibration from historical data</h3><span class="sub">upload a site's real electricity, output, gas and water records and the model is fitted to that site</span>
      <span class="act"><a class="btn sm" href="/api/kalibrasyon/sablon">Download CSV template</a></span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><select class="inp" id="cf">${W.fabrikalar.map((f) => `<option value="${f.id}">${esc(f.ad)} (${f.id})</option>`).join("")}</select>
        <input type="file" id="cfile" accept=".csv,.xlsx,.txt"><button class="btn" id="cprev">Preview</button><button class="btn pri" id="capp" disabled>Apply</button></div>
      <div class="muted mt" style="font-size:12px">From hourly (or 15-min) data it extracts a 24-hour load profile, installed power, output rate, and gas and water factors. With daily/monthly data (e.g. electricity bills) it adjusts average power and output and keeps the shift model. Column names are flexible: <i>date, hour, kwh or kw, output, gas, water</i> (Turkish names work too). Both 1,234.5 and Turkish 1.234,5 number formats are supported.</div>
      <div id="cres"></div><div class="hr"></div><div class="card-h"><h3 style="font-size:13px">Calibrated sites</h3></div><div id="clist"></div>`;
    $("#cprev").onclick = () => this.calRun(ctx, false);
    $("#capp").onclick = () => this.calRun(ctx, true);
    this.calList(ctx);
  },
  async calRun(ctx, apply) {
    const file = $("#cfile").files[0];
    if (!file) { ctx.toast("Choose a file first", "uyari"); return; }
    try {
      const r = await upload(`/kalibrasyon/${$("#cf").value}${apply ? "?uygula=true" : ""}`, file);
      calibPrev = r;
      $("#capp").disabled = false;
      const rows = [["Installed power (kW)", "kurulu_kw"], ["Output / hour (full load)", "uretim_saat"], ["Gas factor (m³/h/person)", "gaz_k"], ["Water factor (m³/h/person)", "su_k"]];
      $("#cres").innerHTML = `<div class="grid mt" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
        <div><div class="muted" style="font-size:12px">${esc(r.fabrika_ad)} · ${MODE[r.mod] || r.mod} data · ${r.satir} rows · ${esc(r.aralik)}</div>
          <table class="tbl mt"><tr><th>Parameter</th><th class="r">Model</th><th class="r">From real data</th></tr>${rows.map(([n, k]) => `<tr><td>${n}</td><td class="r num">${fmt.n(r.onceki[k], k.endsWith("_k") ? 3 : 0)}</td><td class="r num t-acc"><b>${fmt.n(r.yeni[k], k.endsWith("_k") ? 3 : 0)}</b></td></tr>`).join("")}</table>
          <div class="grid g2 mt" style="font-size:12.5px">${[["Average power", fmt.n(r.ozet.ort_kw) + " kW"], ["Peak power", r.ozet.pik_kw ? fmt.n(r.ozet.pik_kw) + " kW" : "—"], ["Daily consumption", fmt.n(r.ozet.gunluk_kwh) + " kWh"], ["Monthly consumption (≈)", fmt.n(r.ozet.aylik_kwh) + " kWh"]].map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b class="num">${v}</b></div>`).join("")}</div>
          ${r.uyarilar.map((u) => `<div class="item mt t-warn" style="font-size:12.5px">⚠ ${esc(u)}</div>`).join("")}
          <div class="muted mt" style="font-size:11.5px">Detected columns: ${Object.entries(r.sutunlar).filter(([, v]) => v).map(([k, v]) => `${k}=<b>${esc(v)}</b>`).join(" · ")}</div></div>
        <div><div class="muted" style="font-size:12px">24-hour load profile</div><div id="cprof"></div></div></div>
        ${apply ? `<div class="note mt">✅ Applied. The site now runs with this profile; the setting is saved.</div>` : `<div class="muted mt" style="font-size:12.5px">If it looks right, press <b>Apply</b>.</div>`}`;
      if (r.profil) lineChart($("#cprof"), { height: 190, xFmt: fmt.hm, min: 0, series: [{ label: "Load %", color: "#22d3ee", data: hrs(r.profil.map((v) => v * 100)), area: true }] });
      else $("#cprof").innerHTML = `<div class="empty">No hourly profile for daily/monthly data</div>`;
      if (apply) { ctx.toast(`${esc(r.fabrika_ad)} calibrated`, "ok"); this.load(ctx, true); }
    } catch (e) { $("#cres").innerHTML = `<div class="item mt t-crit">❌ ${esc(e.message)}</div>`; }
  },
  calList(ctx) {
    const el = $("#clist"); if (!el) return;
    el.innerHTML = D.kalibrasyon.length ? `<table class="tbl"><tr><th>Site</th><th>Data</th><th>Range</th><th class="r">Avg. power</th><th class="r">Monthly kWh</th><th></th></tr>${D.kalibrasyon.map((c) => `<tr><td><b>${esc(c.fabrika_ad)}</b></td><td>${MODE[c.mod] || c.mod} · ${c.satir} rows${c.dosya ? ` · ${esc(c.dosya)}` : ""}</td><td class="muted">${esc(c.aralik)}</td><td class="r num">${fmt.n(c.ozet.ort_kw)} kW</td><td class="r num">${fmt.n(c.ozet.aylik_kwh)}</td><td><button class="btn sm danger" data-cr="${c.fabrika}">Reset</button></td></tr>`).join("")}</table>` : `<div class="empty">No calibrated sites yet</div>`;
    $$("[data-cr]", el).forEach((b) => b.onclick = async () => { await api("/kalibrasyon/" + b.dataset.cr, {}, "DELETE"); ctx.toast("Calibration reset"); this.load(ctx, true); });
  },
  // ------------------------------------------------------------ bridge
  bridge(ctx) {
    const W = ctx.world;
    $("#c-br").innerHTML = `<div class="card-h"><h3>🔌 Fabrika OS / SCADA bridge</h3><span class="sub">reads any URL that returns JSON at regular intervals and feeds it into a NEXUS site</span></div>
      <div class="grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)">
        <div>
          <div class="muted" style="font-size:12.5px">1 · Enter the status URL of Fabrika OS (or a PLC gateway) and test it. Because NEXUS runs inside Docker, services on your computer are reached via <b>host.docker.internal</b>.</div>
          <div class="row" style="display:flex;gap:8px;margin-top:8px"><input class="inp" id="burl" style="flex:1" placeholder="http://host.docker.internal:8000/api/..."><button class="btn" id="bprobe">Test</button></div>
          <div class="muted mt" style="font-size:12px">To find the Fabrika OS port, in PowerShell:</div>
          <div class="code mt">docker ps --format "table {{.Names}}\`t{{.Ports}}"</div>
          <div id="bfields" class="mt"></div></div>
        <div id="bmap"><div class="empty">Fields are mapped here after you test the URL</div></div></div>
      <div class="hr"></div><div class="card-h"><h3 style="font-size:13px">Saved bridges</h3></div><div id="blist"></div>`;
    $("#bprobe").onclick = async () => {
      const url = $("#burl").value.trim(); if (!url) return;
      $("#bfields").innerHTML = `<div class="muted">Reading…</div>`;
      try { probe = await api("/kopru/dene", { url }); this.bridgeMap(ctx, url); }
      catch (e) { $("#bfields").innerHTML = `<div class="item t-crit">❌ ${esc(e.message)}</div>`; }
    };
    this.bridgeList(ctx);
  },
  bridgeMap(ctx, url) {
    const W = ctx.world, P = probe;
    $("#bfields").innerHTML = `<div class="muted" style="font-size:12px">${P.alanlar.length} fields found</div><div class="tbl-wrap" style="max-height:260px"><table class="tbl" style="font-size:12px"><tr><th>Path</th><th>Value</th></tr>${P.alanlar.slice(0, 120).map((a) => `<tr><td class="num">${esc(a.yol)}</td><td>${esc(String(a.deger)).slice(0, 40)}</td></tr>`).join("")}</table></div>`;
    const opt = (sel) => `<option value="">— none —</option>` + P.alanlar.map((a) => `<option ${a.yol === sel ? "selected" : ""}>${esc(a.yol)}</option>`).join("");
    const o = P.oneri || {};
    $("#bmap").innerHTML = `<div class="muted" style="font-size:12.5px">2 · Map the fields (suggestions pre-selected)</div>
      <div style="display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center;margin-top:8px;font-size:13px">
        <span>Power</span><div style="display:flex;gap:6px"><select class="inp" id="m-power" style="flex:1">${opt(o.power_kw)}</select><select class="inp" id="m-pk"><option value="1">kW</option><option value="0.001" ${/w$|watt/i.test(o.power_kw || "") && !/kw/i.test(o.power_kw || "") ? "selected" : ""}>W → kW</option><option value="1000">MW → kW</option></select></div>
        <span>Status</span><select class="inp" id="m-durum">${opt(o.durum)}</select>
        <span>OEE</span><select class="inp" id="m-oee">${opt(o.oee)}</select>
        <span>Output / min</span><select class="inp" id="m-uretim">${opt(o.uretim_dk)}</select>
        <span>Target site</span><select class="inp" id="m-f">${W.fabrikalar.map((f) => `<option value="${f.id}">${esc(f.ad)} (${f.id})</option>`).join("")}</select>
        <span>Read interval</span><div><input class="inp" id="m-int" type="number" value="10" style="width:80px"> s</div>
        <span>Bridge name</span><input class="inp" id="m-ad" value="Fabrika OS bridge"></div>
      <div class="muted mt" style="font-size:11.5px">Status values (RUN, STOP, FAULT, 1/0, running…) are converted automatically. OEE given as a percentage is converted to 0–1.</div>
      <button class="btn pri mt" id="bsave">3 · Save and start the bridge</button>`;
    $("#bsave").onclick = async () => {
      const b = { ad: $("#m-ad").value, url, fabrika: $("#m-f").value, aralik_sn: +$("#m-int").value,
        alanlar: { power_kw: $("#m-power").value, durum: $("#m-durum").value, oee: $("#m-oee").value, uretim_dk: $("#m-uretim").value },
        carpan: { power_kw: +$("#m-pk").value } };
      try { await api("/kopru", b); ctx.toast("Bridge saved — the site will show as 'live' with a red dot on the map", "ok"); this.load(ctx, true); }
      catch (e) { ctx.toast(esc(e.message), "uyari"); }
    };
  },
  bridgeList(ctx) {
    const el = $("#blist"); if (!el) return;
    const W = ctx.world;
    el.innerHTML = D.kopruler.length ? `<table class="tbl"><tr><th>Bridge</th><th>Site</th><th>Status</th><th>Last value</th><th class="r">Reads</th><th></th></tr>${D.kopruler.map((b) => {
      const f = W.fabrikalar.find((x) => x.id === b.fabrika);
      const v = b.son_deger || {};
      return `<tr><td><b>${esc(b.ad || "bridge")}</b><br><span class="dim" style="font-size:11.5px">${esc(b.url)}</span></td><td>${esc(f ? f.ad : b.fabrika)}</td>
        <td>${b.durum === "ok" ? `<span class="st st-calisiyor">connected</span> <span class="dim">${b.son}</span>` : b.durum === "hata" ? `<span class="st st-ariza">error</span><br><span class="dim" style="font-size:11.5px">${esc(b.hata)}</span>` : `<span class="muted">waiting</span>`}</td>
        <td class="num" style="font-size:12px">${v.power_kw != null ? fmt.n(v.power_kw) + " kW" : ""}${v.durum ? " · " + (DST[v.durum] || v.durum) : ""}${v.oee != null ? " · OEE " + fmt.pct(v.oee) : ""}</td><td class="r num">${b.mesaj}</td>
        <td><button class="btn sm danger" data-bd="${b.id}">Delete</button></td></tr>`;
    }).join("")}</table>` : `<div class="empty">No saved bridges</div>`;
    $$("[data-bd]", el).forEach((b) => b.onclick = async () => { await api("/kopru/" + b.dataset.bd, {}, "DELETE"); this.load(ctx, true); });
  },
};
