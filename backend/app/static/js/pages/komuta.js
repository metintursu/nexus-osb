import { $, $$, esc, fmt, kpi, setKpi, lineChart, ring, scoreColor, sev } from "../ui.js";
import { createMap } from "../map.js";

const PART = { enerji: "Energy", lojistik: "Logistics", dongusel: "Circularity", guvenlik: "Safety", su: "Water", verimlilik: "Efficiency" };
let map;

export default {
  async mount(root, ctx) {
    root.innerHTML = `
    <div class="grid" style="grid-template-columns:300px 1fr;gap:var(--gap)">
      <div class="card" id="hero" style="display:flex;flex-direction:column;align-items:center;gap:10px"></div>
      <div class="grid g4">
        ${kpi("k-guc", "Current zone load", "enerji")}${kpi("k-enr", "Consumption today", "pil", "#a78bfa")}
        ${kpi("k-co2", "Emissions today", "karbon", "#fb923c")}${kpi("k-uret", "Output value", "para", "#34d399")}
        ${kpi("k-kisi", "Employees on shift", "kisi", "#60a5fa")}${kpi("k-kam", "Trucks on the road", "lojistik", "#fbbf24")}
        ${kpi("k-sim", "Symbiosis gains", "simbiyoz", "#c084fc")}${kpi("k-su", "Wastewater load", "su", "#38bdf8")}
      </div>
    </div>
    <div class="ztick mt"><a class="item click" href="#/otopilot" style="color:inherit"><b class="t-ok">✈ Autopilot</b><span class="txt2 muted" id="zt-ap">—</span></a>
      <a class="item click" href="#/muzakere" style="color:inherit"><b style="color:#c084fc">💬 Agents</b><span class="txt2 muted" id="zt-ag">—</span></a></div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 380px;align-items:start">
      <div class="card" style="padding:10px"><div id="kmap"></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>Open incidents</h3><span class="act"><a href="#/kriz" class="btn sm">Crisis Center →</a></span></div><div class="list" id="inc"></div></div>
        <div class="card"><div class="card-h"><h3>Zone Brain recommendations</h3><span class="act"><a href="#/beyin" class="btn sm">Ask →</a></span></div><div class="list" id="ins"></div></div>
      </div>
    </div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Energy balance</h3><span class="sub">last 24 hours · MW</span></div><div id="ech"></div></div>
      <div class="card"><div class="card-h"><h3>Event feed</h3><span class="sub">zone log</span></div><div class="feed" id="feed" style="max-height:290px;overflow:auto"></div></div>
    </div>`;
    map = createMap($("#kmap"), ctx, { height: 520 });
    this.update(ctx.live(), ctx);
    ctx.poll(async () => {
      const o = await ctx.api("/ozet");
      this.summary(o, ctx);
    }, 6000);
  },
  summary(o, ctx) {
    const hs = o.saglik;
    $("#hero").innerHTML = `<div class="muted" style="font-size:12px;letter-spacing:.12em;text-transform:uppercase">Zone health score</div>
      ${ring(hs.skor / 100, 168, scoreColor(hs.skor), "/ 100", hs.skor)}
      <div style="width:100%;display:grid;gap:7px">${Object.entries(hs.parcalar).map(([k, v]) => `<div style="display:grid;grid-template-columns:78px 1fr 30px;gap:8px;align-items:center;font-size:12px">
        <span class="muted">${PART[k]}</span><div class="mini-bar"><i style="width:${v}%;background:${scoreColor(v)}"></i></div><span class="num" style="text-align:right">${v}</span></div>`).join("")}</div>`;
    const ins = $("#ins");
    ins.innerHTML = (o.icgoruler || []).slice(0, 5).map((i, n) => `<div class="item"><div class="ttl">${sev(i.seviye)} <span>${esc(i.baslik)}</span></div><div class="txt">${esc(i.metin)}</div>
      ${i.aksiyon ? `<div class="row"><button class="btn sm pri" data-n="${n}">${esc(i.aksiyon.etiket)}</button></div>` : i.fabrika ? `<div class="row"><button class="btn sm" data-f="${i.fabrika}">Open site</button></div>` : ""}</div>`).join("") || `<div class="empty">No recommendations</div>`;
    $$("[data-n]", ins).forEach((b) => b.onclick = async () => { b.disabled = true; await ctx.runAction(o.icgoruler[+b.dataset.n].aksiyon); });
    $$("[data-f]", ins).forEach((b) => b.onclick = () => ctx.openFactory(b.dataset.f));
    $("#feed").innerHTML = (o.olaylar || []).map((e) => `<div><span class="t">D${e.gun} ${e.saat}</span><span>${esc(e.metin)}</span></div>`).join("") || `<div class="empty">—</div>`;
    const hst = o.gecmis || [];
    lineChart($("#ech"), {
      height: 240, unit: "MW",
      series: [{ label: "Total load", color: "#e2e8f0", data: hst.map((p) => [p.t, p.yuk]), width: 2 },
        { label: "Grid", color: "#a78bfa", data: hst.map((p) => [p.t, p.sebeke]), area: true },
        { label: "Solar", color: "#fbbf24", data: hst.map((p) => [p.t, p.ges]), area: true },
        { label: "Battery (+discharge)", color: "#34d399", data: hst.map((p) => [p.t, p.bess]) }],
      refs: [{ y: ctx.world.sozlesme_kw / 1000, label: "Contracted capacity", color: "#f87171" }],
    });
    this.incidents(ctx);
  },
  async incidents(ctx) {
    const d = await ctx.api("/olaylar");
    if (!$("#inc")) return;
    const open = d.olaylar.filter((i) => i.durum !== "kapandi").slice(0, 5);
    $("#inc").innerHTML = open.map((i) => `<div class="item click" data-f="${i.fabrika || ""}"><div class="ttl">${sev(i.seviye)} ${esc(i.baslik)}</div>
      <div class="txt">${i.fabrika_ad ? esc(i.fabrika_ad) + " · " : ""}${fmt.t(i.zaman)} · ${esc(i.detay)}</div></div>`).join("") || `<div class="empty">No open incidents — the zone is calm</div>`;
    $$("#inc [data-f]").forEach((b) => b.onclick = () => b.dataset.f ? ctx.openFactory(b.dataset.f) : ctx.go("kriz"));
  },
  update(l, ctx) {
    if (!l) return;
    map && map.update(l);
    const k = l.k, e = l.e;
    setKpi("k-guc", fmt.n(k.guc_mw, 1), "MW", `solar ${fmt.n(k.ges_mw, 1)} · grid ${fmt.n(k.sebeke_mw, 1)} MW`, k.guc_mw / (e.sozlesme / 1000));
    setKpi("k-enr", fmt.n(k.enerji_mwh, 0), "MWh", `bill ${fmt.ktl(k.fatura_tl)}`);
    setKpi("k-co2", fmt.n(k.co2_t, 0), "tCO₂", `now ${fmt.n(k.co2_anlik, 1)} t/h · avoided ${fmt.n(k.kacinilan_t, 0)} t`);
    setKpi("k-uret", fmt.ktl(k.uretim_saat_tl), "/h", `revenue today ${fmt.ktl(k.ciro_tl)}`);
    setKpi("k-kisi", fmt.n(k.vardiyada), "", `of ${fmt.n(k.calisan)} employees · OEE ${fmt.pct(k.oee)}`, k.vardiyada / k.calisan);
    const fl = ctx.world.filo || 48;
    setKpi("k-kam", k.kamyon, `/ ${fl}`, `empty km ${fmt.pct(l.l.bos_oran)} · pool ${l.l.havuz ? "on" : "off"}`, k.kamyon / fl);
    setKpi("k-sim", fmt.ktl(k.simbiyoz_tl), "", `today ${fmt.ktl(k.simbiyoz_bugun_tl)}`);
    const za = $("#zt-ap"), zg = $("#zt-ag");
    if (za) za.textContent = l.ap ? (l.ap_son ? `${fmt.hm(l.ap_son.t)} · ${l.ap_son.karar}` : "engaged, waiting for the first scan") : "off — engage it with one click in the top bar";
    if (zg) zg.textContent = l.msg ? `${l.msg.ad}: ${l.msg.metin}` : "agents are quiet";
    setKpi("k-su", fmt.pct(l.su.util), "", `${fmt.n(l.su.giris)} m³/h · COD ${l.su.koi} mg/L`, l.su.util);
  },
  unmount() { map && map.destroy(); map = null; },
};
