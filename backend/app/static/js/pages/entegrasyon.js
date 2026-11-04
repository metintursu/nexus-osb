import { $, esc, fmt } from "../ui.js";

const EP = [
  ["GET", "/api/canli", "Live state of the whole zone (same data as the WebSocket)"], ["GET", "/api/dunya", "Map, sites, sectors, waste types"],
  ["GET", "/api/fabrikalar/{id}", "Site details, history, symbiosis, incidents"], ["POST", "/api/veri/{id}", "Push live data from a real site"],
  ["GET", "/api/enerji", "Grid, solar, battery, substations"], ["POST", "/api/enerji/ayar", "{mod, dr_aktif, rezerv}"],
  ["GET", "/api/lojistik", "Fleet, orders, gates"], ["GET", "/api/simbiyoz", "Links and opportunities"], ["GET", "/api/karbon", "Scope 1-2, CBAM"],
  ["GET", "/api/su", "Wastewater plant"], ["GET", "/api/olaylar", "Incident log"], ["POST", "/api/senaryolar/{key}/baslat", "Stress test"],
  ["POST", "/api/beyin/sohbet", "{mesaj} → Zone Brain reply or command"], ["POST", "/api/otopilot", "{aktif} turn autopilot on/off"],
  ["GET", "/api/muzakere", "Agent messages, tables, Zone Credits"], ["GET", "/api/ustalar", "Technician pool"], ["GET", "/api/hidrojen", "Hydrogen Valley"],
  ["GET", "/api/tahmin", "24-hour Monte Carlo forecast"], ["POST", "/api/evrenler", "{a, b, gun} parallel universe comparison"], ["GET", "/api/afet", "Active disaster and wind"], ["GET", "/api/gercek", "Price, weather, bridge, calibration status"],
  ["POST", "/api/kopru", "Add a bridge (url, factory, fields)"], ["POST", "/api/kalibrasyon/{id}?uygula=true", "Calibrate with a history file (request body)"],
  ["POST", "/api/bolge", "Apply a zone plan (JSON)"], ["POST", "/api/sim/esitle", "Sync the simulation clock to real time"], ["GET", "/api/raporlar", "End-of-day reports"], ["WS", "/ws", "Live stream every second"],
];

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g2" style="margin-bottom:var(--gap)">
      <a class="card item click" href="#/veri" style="color:inherit"><h3>🌐 Real Data</h3><div class="muted mt" style="font-size:13px">EPİAŞ day-ahead electricity price (Turkey), real weather, site calibration from historical data and the <b>Fabrika OS bridge</b> (with a field-mapping wizard, no code needed).</div></a>
      <a class="card item click" href="#/tasarim" style="color:inherit"><h3>📐 Zone Designer</h3><div class="muted mt" style="font-size:13px">Draw your own zone's block grid, shared facilities and factories; save it as JSON, share it and build it with one click.</div></a></div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h3>1 · Connect a site over REST</h3><span class="sub">PLC gateway, SCADA, Fabrika OS</span></div>
        <div class="muted" style="font-size:13px">Replace a site's simulated values with real measurements. Data stays valid for <b>gecerlilik_dk</b> minutes; if it is not refreshed, the site falls back to simulation. A red dot on the map = live data.</div>
        <div class="muted mt" style="font-size:12px">PowerShell</div>
        <div class="code">Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/veri/F01 \`
  -ContentType "application/json" \`
  -Body '{"power_kw": 1850, "durum": "calisiyor", "oee": 0.83, "uretim_dk": 9.5, "gecerlilik_dk": 15}'</div>
        <div class="muted mt" style="font-size:12px">Fields</div>
        <div class="code">power_kw       current electrical power (kW)
durum          status: calisiyor (running) | bosta (idle) | ariza (fault) | bakim (maintenance) | durdu (stopped)
oee            overall equipment effectiveness, 0–1
uretim_dk      output per minute (in the site's unit)
gecerlilik_dk  minutes the data stays valid (default 15)</div></div>
      <div class="card"><div class="card-h"><h3>2 · Stream over MQTT</h3><span class="sub" id="mq"></span></div>
        <div class="muted" style="font-size:13px">When the Mosquitto broker in docker-compose is running, NEXUS subscribes to this topic and publishes zone KPIs every 10 minutes:</div>
        <div class="code mt">subscribe:  nexus/fabrika/{id}/telemetri   → same JSON body
publish:    nexus/bolge/kpi                 → zone indicators</div>
        <div class="muted mt" style="font-size:12px">Try it (PowerShell, with the Mosquitto client)</div>
        <div class="code">docker exec nexus-mqtt mosquitto_pub -t nexus/fabrika/F02/telemetri \`
  -m '{\\"power_kw\\": 2400, \\"durum\\": \\"ariza\\"}'</div>
        <div class="hr"></div>
        <div class="card-h"><h3>3 · Fabrika OS bridge</h3></div>
        <div class="muted" style="font-size:13px">Every site running Fabrika OS joins the zone level by sending its own energy and status data to this endpoint. The single-factory operating system becomes one cell of the zone in NEXUS; Dijital Usta fault advice and Karbon Pasaportu data flow into the zone carbon ledger.</div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>API endpoints</h3><span class="sub"><a href="/docs" target="_blank">Interactive documentation (Swagger) →</a></span></div>
        <div class="tbl-wrap"><table class="tbl">${EP.map(([m, p, d]) => `<tr><td><span class="tag" style="color:${m === "GET" ? "#34d399" : m === "POST" ? "#fbbf24" : "#a78bfa"}">${m}</span></td><td class="num">${esc(p)}</td><td class="muted">${esc(d)}</td></tr>`).join("")}</table></div></div>
      <div class="card"><div class="card-h"><h3>System</h3></div><div id="sys" class="grid g2" style="font-size:13px"></div></div></div>`;
    ctx.poll(async () => {
      const s = await ctx.api("/sim");
      $("#mq").textContent = s.mqtt.host ? (s.mqtt.aktif ? `connected · ${s.mqtt.mesaj} messages` : "connecting…") : "off (MQTT_HOST not set)";
      $("#sys").innerHTML = [["Simulation time", `Day ${s.gun} · ${s.saat}`], ["Speed", s.duraklatildi ? "paused" : `${s.tps}× (min/s)`], ["Steps this session", fmt.n(s.adim)],
        ["Persistent event log", fmt.n(s.kayit) + " rows (SQLite)"], ["Sites", ctx.world.fabrikalar.length], ["Vehicles", `${ctx.world.filo} trucks + 1 fire engine + ${ctx.world.ustalar.length} technicians`]]
        .map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b>${v}</b></div>`).join("");
    }, 5000);
  },
};
