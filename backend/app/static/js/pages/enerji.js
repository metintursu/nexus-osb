import { $, $$, esc, fmt, kpi, setKpi, lineChart, PERIOD, PERIOD_COLOR } from "../ui.js";

function flowSvg(e, fac) {
  const W = 760, H = 250;
  const src = [["Şebeke", Math.max(0, e.sebeke), "#a78bfa"], ["GES", e.ges, "#fbbf24"], ["Biyogaz", e.bio, "#4ade80"], ["Batarya", Math.max(0, e.bess), "#34d399"]];
  const fabrikalar = Math.max(0, e.yuk - fac);
  const dst = [["Fabrikalar", fabrikalar, "#22d3ee"], ["Ortak tesisler", fac, "#60a5fa"], ["Batarya şarjı", Math.max(0, -e.bess), "#34d399"], ["Şebekeye satış", Math.max(0, -e.sebeke), "#f472b6"]];
  const tot = Math.max(1, src.reduce((a, s) => a + s[1], 0));
  const bx = W / 2, by = H / 2;
  let out = `<rect x="${bx - 52}" y="${by - 34}" width="104" height="68" rx="12" fill="#0e1a30" stroke="#22d3ee" stroke-width="1.3"/>
    <text x="${bx}" y="${by - 6}" text-anchor="middle" style="font-weight:600;fill:#e0f2fe">OSB Barası</text>
    <text x="${bx}" y="${by + 14}" text-anchor="middle" style="font-family:var(--f-mono);fill:#22d3ee">${fmt.mw(e.yuk, 1)} MW</text>`;
  src.forEach((s, i) => {
    const y = 36 + i * 58, w = Math.max(1.5, (s[1] / tot) * 26);
    out += `<path class="fl" d="M150,${y} C 250,${y} 260,${by} ${bx - 54},${by}" stroke="${s[2]}" stroke-width="${w}" opacity="${s[1] > 1 ? 0.9 : 0.15}"/>
      <text x="12" y="${y - 4}">${s[0]}</text><text x="12" y="${y + 13}" style="font-family:var(--f-mono);fill:${s[2]}">${fmt.mw(s[1], 2)} MW</text>`;
  });
  dst.forEach((d, i) => {
    const y = 36 + i * 58, w = Math.max(1.5, (d[1] / tot) * 26);
    out += `<path class="fl" d="M${bx + 54},${by} C ${W - 260},${by} ${W - 250},${y} ${W - 150},${y}" stroke="${d[2]}" stroke-width="${w}" opacity="${d[1] > 1 ? 0.9 : 0.15}"/>
      <text x="${W - 12}" y="${y - 4}" text-anchor="end">${d[0]}</text><text x="${W - 12}" y="${y + 13}" text-anchor="end" style="font-family:var(--f-mono);fill:${d[2]}">${fmt.mw(d[1], 2)} MW</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${out}</svg>`;
}

function tariffBar(minute) {
  const seg = [];
  for (let hh = 0; hh < 24; hh++) seg.push(hh >= 22 || hh < 6 ? "gece" : hh >= 17 ? "puant" : "gunduz");
  const now = ((minute % 1440) / 1440) * 100;
  return `<div class="timeline">${seg.map((p) => `<div style="width:${100 / 24}%;background:${PERIOD_COLOR[p]};opacity:.55" title="${PERIOD[p]}"></div>`).join("")}<div class="now" style="left:${now}%"></div></div>
    <div style="display:flex;justify-content:space-between;font:10.5px var(--f-mono);color:var(--dim);margin-top:4px"><span>00</span><span>06</span><span>12</span><span>17</span><span>22</span><span>24</span></div>`;
}

let det = null;
export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g6">
      ${kpi("e-yuk", "Toplam yük", "enerji")}${kpi("e-ges", "GES üretimi", "gunes", "#fbbf24")}${kpi("e-seb", "Şebekeden çekiş", "enerji", "#a78bfa")}
      ${kpi("e-bes", "Batarya", "pil", "#34d399")}${kpi("e-fat", "Bugün fatura", "para", "#f472b6")}${kpi("e-tas", "Bugün kazanım", "simbiyoz", "#4ade80")}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)">
      <div class="card flow"><div class="card-h"><h3>Anlık güç akışı</h3><span class="sub">kaynaklar → OSB barası → tüketim</span></div><div id="flw"></div></div>
      <div class="card"><div class="card-h"><h3>Kontrol</h3><span class="sub">batarya stratejisi & talep yönetimi</span></div>
        <div style="display:grid;gap:14px">
          <div><div class="muted" style="font-size:12px;margin-bottom:6px">Batarya modu</div><div class="seg" id="bm"><button data-m="otomatik">Otomatik (pik tıraşlama + puant)</button><button data-m="puant">Yalnız puant</button><button data-m="kapali">Kapalı</button></div></div>
          <div><label class="switch" id="drs"><i></i><span>Otomatik talep tarafı katılım (trafo / sözleşme aşımında esnek yükleri kaydır)</span></label></div>
          <div><div class="muted" style="font-size:12px;display:flex;justify-content:space-between"><span>Kesintiye karşı dayanıklılık rezervi</span><b class="num" id="rzv">%30</b></div>
            <input type="range" min="0" max="60" step="5" id="rz"></div>
          <div><button class="btn pri" id="drnow">⇄ Şimdi 60 dk talep kaydır</button> <span class="muted" style="font-size:12px" id="drinfo"></span></div>
          <div><div class="muted" style="font-size:12px;margin-bottom:6px">Tarife dilimleri (bugün)</div><div id="tbar"></div></div>
        </div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Yük ve kaynaklar</h3><span class="sub">son 24 saat · MW</span></div><div id="ech"></div></div>
      <div class="card"><div class="card-h"><h3>Batarya doluluk & fiyat</h3><span class="sub">son 24 saat</span></div><div id="sch"></div></div></div>
    <div class="card mt"><div class="card-h"><h3>🟢 Hidrojen Vadisi</h3><span class="sub">12 MWp özel GES → 6 MW elektrolizör → H₂ deposu → döküm/metal fırınlarına doğalgaz yerine %30'a kadar karışım</span>
      <span class="act"><label class="switch" id="h2s"><i></i><span>Devrede</span></label></span></div><div class="grid g6" id="h2g" style="font-size:12.5px"></div></div>
    <div class="card mt"><div class="card-h"><h3>Trafo merkezleri</h3><span class="sub">%100 üstü aşırı yük olayı açar</span></div><div class="grid g4" id="tms"></div></div>
    <div class="card mt"><div class="card-h"><h3>Bugünün enerji defteri</h3></div><div class="grid g6" id="led" style="font-size:12.5px"></div></div>`;
    $$("#bm button").forEach((b) => b.onclick = async () => { det = await ctx.api("/enerji/ayar", { mod: b.dataset.m }); this.paint(ctx); ctx.toast(`Batarya modu: ${b.textContent}`, "ok"); });
    $("#drs").onclick = async () => { det = await ctx.api("/enerji/ayar", { dr_aktif: !det.dr_aktif }); this.paint(ctx); };
    $("#rz").onchange = async (e) => { det = await ctx.api("/enerji/ayar", { rezerv: +e.target.value / 100 }); this.paint(ctx); };
    $("#rz").oninput = (e) => { $("#rzv").textContent = "%" + e.target.value; };
    $("#drnow").onclick = () => ctx.runAction({ tip: "dr" });
    ctx.poll(async () => { det = await ctx.api("/enerji"); this.paint(ctx); }, 4000);
    $("#h2s").onclick = async () => { const h = await ctx.api("/hidrojen", { aktif: !this.h2.aktif }); this.h2paint(h); };
    ctx.poll(async () => this.h2paint(await ctx.api("/hidrojen")), 4000);
  },
  paint(ctx) {
    if (!det) return;
    const d = det, b = d.bugun;
    $$("#bm button").forEach((x) => x.classList.toggle("on", x.dataset.m === d.mod));
    $("#drs").classList.toggle("on", d.dr_aktif);
    if (document.activeElement !== $("#rz")) { $("#rz").value = Math.round(d.rezerv * 100); $("#rzv").textContent = "%" + Math.round(d.rezerv * 100); }
    $("#drinfo").textContent = d.dr_tesisler.length ? `${d.dr_tesisler.length} tesiste kaydırma aktif` : "";
    $("#tbar").innerHTML = tariffBar(ctx.live().t);
    if (d.gecmis) {
      const hst = d.gecmis;
      lineChart($("#ech"), { height: 230, unit: "MW", series: [
        { label: "Yük", color: "#e2e8f0", data: hst.map((p) => [p.t, p.yuk]) },
        { label: "Şebeke", color: "#a78bfa", data: hst.map((p) => [p.t, p.sebeke]), area: true },
        { label: "GES", color: "#fbbf24", data: hst.map((p) => [p.t, p.ges]), area: true },
        { label: "Biyogaz", color: "#4ade80", data: hst.map((p) => [p.t, p.bio]) }],
        refs: [{ y: d.sozlesme / 1000, label: `Sözleşme ${fmt.mw(d.sozlesme, 1)} MW`, color: "#f87171" }] });
      lineChart($("#sch"), { height: 230, series: [
        { label: "Batarya doluluk %", color: "#34d399", data: hst.map((p) => [p.t, p.soc * 100]), area: true, unit: "%" },
        { label: "Elektrik fiyatı ×10 (₺/kWh)", color: "#f97316", data: hst.map((p) => [p.t, p.fiyat * 10]), unit: "" }], min: 0 });
    }
    $("#tms").innerHTML = d.trafolar.map((t) => {
      const c = t.oran > 1 ? "#f87171" : t.oran > 0.9 ? "#fbbf24" : "#34d399";
      return `<div class="item"><div class="ttl">⚡ ${t.id}<span class="num" style="margin-left:auto;color:${c};font-size:18px">%${Math.round(t.oran * 100)}</span></div>
        <div class="mini-bar mt" style="height:8px"><i style="width:${Math.min(100, t.oran * 100)}%;background:${c}"></i></div>
        <div class="txt mt">${fmt.mw(t.yuk_kw, 1)} / ${fmt.mw(t.kapasite_kw, 1)} MW · ${t.fabrikalar.length} tesis</div>
        <div class="txt" style="font-size:11.5px">${t.fabrikalar.map((id) => `<a href="javascript:void 0" data-f="${id}">${id}</a>`).join(" · ")}</div></div>`;
    }).join("");
    $$("#tms [data-f]").forEach((a) => a.onclick = () => ctx.openFactory(a.dataset.f));
    const L = [["Toplam tüketim", fmt.n(b.yuk_kwh / 1000, 1) + " MWh"], ["GES üretimi", fmt.n(b.ges_kwh / 1000, 1) + " MWh"], ["Şebekeden alım", fmt.n(b.sebeke_kwh / 1000, 1) + " MWh"],
      ["Şebekeye satış", fmt.n(b.ihracat_kwh / 1000, 1) + " MWh"], ["Biyogaz", fmt.n(b.biyogaz_kwh / 1000, 2) + " MWh"], ["Pik çekiş", fmt.mw(b.pik_kw, 1) + " MW"],
      ["Batarya şarj", fmt.n(b.bess_sarj_kwh / 1000, 1) + " MWh"], ["Batarya deşarj", fmt.n(b.bess_desarj_kwh / 1000, 1) + " MWh"], ["Sözleşme aşımı", fmt.n(b.asim_kwh) + " kWh"],
      ["Karşılanamayan", fmt.n(b.karsilanamayan_kwh) + " kWh"], ["Talep kaydırma olayı", fmt.n(b.dr_olay)], ["Kaçınılan CO₂", fmt.n(b.kacinilan_co2_kg / 1000, 1) + " t"]];
    $("#led").innerHTML = L.map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b class="num" style="font-size:15px">${v}</b></div>`).join("");
    setKpi("e-fat", fmt.ktl(b.fatura_tl), "", `ort. ${fmt.n(b.fatura_tl / Math.max(1, b.sebeke_kwh), 2)} ₺/kWh`);
    setKpi("e-tas", fmt.ktl(b.tasarruf_bess_tl), "", "batarya arbitrajı + pik tıraşlama");
    this._fac = d.tesis_kw;
  },
  update(l, ctx) {
    if (!l) return;
    const e = l.e;
    setKpi("e-yuk", fmt.mw(e.yuk, 1), "MW", `sözleşme ${fmt.mw(e.sozlesme, 1)} MW`, e.yuk / e.sozlesme);
    setKpi("e-ges", fmt.mw(e.ges, 1), "MW", `${fmt.mw(ctx.world.ges_kwp, 0)} MWp · kapasite faktörü ${fmt.pct(e.ges / ctx.world.ges_kwp)}`, e.ges / ctx.world.ges_kwp);
    setKpi("e-seb", fmt.mw(e.sebeke, 1), "MW", l.kesinti ? `<span class="t-crit">ŞEBEKE KESİK</span>` : e.sebeke > e.sozlesme ? `<span class="t-crit">sözleşme aşımı</span>` : `sözleşmenin ${fmt.pct(e.sebeke / e.sozlesme)}'i`, e.sebeke / e.sozlesme);
    setKpi("e-bes", "%" + Math.round(e.soc * 100), "", e.bess > 50 ? `▼ deşarj ${fmt.mw(e.bess, 1)} MW` : e.bess < -50 ? `▲ şarj ${fmt.mw(-e.bess, 1)} MW` : "beklemede", e.soc);
    const now = performance.now();
    if (!this._ft || now - this._ft > 900) { this._ft = now; $("#flw").innerHTML = flowSvg(e, this._fac || 600); }
  },
  h2paint(h) {
    this.h2 = h;
    $("#h2s").classList.toggle("on", h.aktif);
    const b = h.bugun, T = h.toplam;
    $("#h2g").innerHTML = [["Özel GES", `${fmt.mw(h.pv, 2)} MW`], ["Elektrolizör", `${fmt.mw(h.ely_yuk, 2)} / ${fmt.mw(h.ely_kw, 0)} MW`], ["Depo", `${fmt.n(h.stok)} / ${fmt.n(h.kapasite_kg)} kg`],
      ["Üretim", `${fmt.n(h.uretim, 1)} kg/sa`], ["Fırınlara", `${fmt.n(h.kullanim, 1)} kg/sa · %${Math.round(h.oran * 100)}`], ["Bugün H₂", `${fmt.n(b.uretim_kg)} kg`],
      ["Bugün gaz ikamesi", `${fmt.n(b.gaz_ikame_m3)} m³`], ["Bugün kaçınılan", `${fmt.n(b.kacinilan_co2_kg / 1000, 2)} tCO₂`], ["Bugün tasarruf", fmt.ktl(b.tasarruf_tl)],
      ["Toplam H₂", `${fmt.n(T.uretim_kg)} kg`], ["Toplam kaçınılan", `${fmt.n(T.kacinilan_co2_kg / 1000, 1)} tCO₂`], ["Toplam tasarruf", fmt.ktl(T.tasarruf_tl)]]
      .map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b class="num" style="font-size:14px">${v}</b></div>`).join("");
  },
  unmount() { det = null; this._ft = 0; },
};
