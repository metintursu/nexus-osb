import { $, $$, esc, fmt, lineChart } from "../ui.js";

const ROWS = [["fatura_tl", L("Energy bill", "Enerji faturası"), fmt.ktl, -1], ["co2_t", L("Emissions (t)", "Emisyon (t)"), (v) => fmt.n(v), -1], ["kacinilan_t", L("CO₂ avoided (t)", "Kaçınılan CO₂ (t)"), (v) => fmt.n(v), 1],
  ["asim_mwh", L("Contract overrun (MWh)", "Sözleşme aşımı (MWh)"), (v) => fmt.n(v, 1), -1], ["simbiyoz_tl", L("Symbiosis gains", "Simbiyoz kazancı"), fmt.ktl, 1], ["bertaraf_t", L("Sent to disposal (t)", "Bertarafa giden (t)"), (v) => fmt.n(v), -1],
  ["bos_km", L("Empty truck km", "Boş kamyon km"), (v) => fmt.n(v), -1], ["yakit_tl", L("Fleet fuel", "Filo yakıtı"), fmt.ktl, -1], ["su_m3", L("Mains water (m³)", "Şebeke suyu (m³)"), (v) => fmt.n(v), -1],
  ["durus_dk", L("Total downtime (min)", "Toplam duruş (dk)"), (v) => fmt.n(v), -1], ["ciro_tl", L("Revenue", "Ciro"), fmt.ktl, 1], ["saglik_ort", L("Average health", "Ortalama sağlık"), (v) => fmt.n(v, 1), 1],
  ["otopilot_karar", L("Autopilot decisions", "Otopilot kararı"), (v) => fmt.n(v), 0], ["ajan_anlasma", L("Agent deals", "Ajan anlaşması"), (v) => fmt.n(v), 0]];
const KAL = { enerji_faturasi: L("Energy bill", "Enerji faturası"), simbiyoz: L("Symbiosis", "Simbiyoz"), yakit: L("Fleet fuel", "Filo yakıtı"), bertaraf: L("Disposal cost", "Bertaraf bedeli"), su: L("Water", "Su"), uretim_marji: L("Production margin", "Üretim marjı") };

export default {
  async mount(root, ctx) {
    const info = await ctx.api("/evrenler");
    const opts = (sel) => Object.entries(info.politikalar).map(([k, p]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(p.ad)}</option>`).join("");
    root.innerHTML = `<div class="card"><div class="card-h"><h3>${L(`Parallel universe experiment`, `Paralel evren deneyi`)}</h3><span class="sub">${L(`the current zone is copied twice and fast-forwarded with the same random events but different policies`, `bölgenin şu anki hâli iki kez kopyalanır, aynı rastlantılarla farklı politikalarla ileri sarılır`)}</span></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
        <div><div class="muted" style="font-size:12px">${L(`Universe A`, `Evren A`)}</div><select class="inp" id="va">${opts("klasik")}</select></div>
        <div style="font:700 20px var(--f-head);padding-bottom:6px">vs</div>
        <div><div class="muted" style="font-size:12px">${L(`Universe B`, `Evren B`)}</div><select class="inp" id="vb">${opts("otopilot")}</select></div>
        <div><div class="muted" style="font-size:12px">${L(`Duration`, `Süre`)}</div><select class="inp" id="vg"><option value="1">${L(`1 day`, `1 gün`)}</option><option value="3" selected>${L(`3 days`, `3 gün`)}</option><option value="7">${L(`7 days`, `7 gün`)}</option></select></div>
        <button class="btn pri" id="vrun" style="padding:9px 18px">${L(`🌌 Split and run universes`, `🌌 Evrenleri ayır ve koştur`)}</button><span class="muted" id="vst"></span></div>
      <div class="muted mt" style="font-size:12px" id="vdesc"></div></div>
      <div id="vres"></div>`;
    const desc = () => { $("#vdesc").innerHTML = `<b>A:</b> ${esc(info.politikalar[$("#va").value].aciklama)}<br><b>B:</b> ${esc(info.politikalar[$("#vb").value].aciklama)}`; };
    $("#va").onchange = desc; $("#vb").onchange = desc; desc();
    $("#vrun").onclick = async () => {
      $("#vrun").disabled = true; $("#vst").textContent = L("Running universes… (≈1 s per day)", "Evrenler koşturuluyor… (gün başına ≈1 sn)");
      try { this.show(await ctx.api("/evrenler", { a: $("#va").value, b: $("#vb").value, gun: +$("#vg").value })); $("#vst").textContent = ""; }
      catch (e) { $("#vst").textContent = e.message; }
      $("#vrun").disabled = false;
    };
    if (info.sonuc) this.show(info.sonuc);
  },
  show(r) {
    if (!$("#vres")) return;
    const A = r.a.toplam, B = r.b.toplam, net = r.net;
    const better = (k, dir) => { if (!dir) return ""; const d = (B[k] - A[k]) * dir; return d > 0 ? "t-ok" : d < 0 ? "t-crit" : ""; };
    $("#vres").innerHTML = L(`<div class="grid mt" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr)">
      <div class="card verse-col"><div class="muted" style="font-size:12px">UNIVERSE A</div><h3>${esc(r.a.ad)}</h3><div class="big-num">${fmt.n(A.saglik_ort, 0)}</div><div class="muted">average health</div></div>
      <div class="card verse-col" style="border-color:rgba(52,211,153,.5)"><div class="muted" style="font-size:12px">UNIVERSE B</div><h3>${esc(r.b.ad)}</h3><div class="big-num t-ok">${fmt.n(B.saglik_ort, 0)}</div><div class="muted">average health</div></div>
      <div class="card" style="background:linear-gradient(160deg,rgba(52,211,153,.16),var(--panel))"><div class="muted" style="font-size:12px">NET IMPACT OF B · ${r.gun} DAY${r.gun > 1 ? "S" : ""}</div>
        <div class="big-num ${net.toplam >= 0 ? "t-ok" : "t-crit"}">${net.toplam >= 0 ? "+" : ""}${fmt.ktl(net.toplam)}</div>
        <div class="muted">annualised ≈ <b>${fmt.ktl(net.yillik)}</b></div>
        <div class="mt" style="font-size:12px;display:grid;gap:3px">${Object.entries(net.kalemler).map(([k, v]) => `<div style="display:flex"><span class="muted">${KAL[k]}</span><span class="num ${v >= 0 ? "t-ok" : "t-crit"}" style="margin-left:auto">${v >= 0 ? "+" : ""}${fmt.ktl(v)}</span></div>`).join("")}</div>
        <div class="dim mt" style="font-size:11px">Production margin: ${Math.round(net.marj * 100)}% of the revenue difference. Calculated in ${r.sure_sn} s.</div></div></div>
      <div class="grid mt g2"><div class="card"><div class="card-h"><h3>Cumulative energy bill</h3><span class="sub">₺M</span></div><div id="vc1"></div></div>
        <div class="card"><div class="card-h"><h3>Health score</h3><span class="sub">hourly</span></div><div id="vc2"></div></div></div>
      <div class="card mt"><div class="card-h"><h3>Indicator comparison</h3></div><div class="tbl-wrap"><table class="tbl"><tr><th>Indicator</th><th class="r">A · ${esc(r.a.ad)}</th><th class="r">B · ${esc(r.b.ad)}</th><th class="r">Difference</th></tr>
        ${ROWS.map(([k, n, f, dir]) => `<tr><td>${n}</td><td class="r num">${f(A[k])}</td><td class="r num"><b>${f(B[k])}</b></td><td class="r num ${better(k, dir)}">${B[k] - A[k] >= 0 ? "+" : ""}${f(B[k] - A[k])}</td></tr>`).join("")}</table></div></div>`, `<div class="grid mt" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr)">
      <div class="card verse-col"><div class="muted" style="font-size:12px">EVREN A</div><h3>${esc(r.a.ad)}</h3><div class="big-num">${fmt.n(A.saglik_ort, 0)}</div><div class="muted">ortalama sağlık</div></div>
      <div class="card verse-col" style="border-color:rgba(52,211,153,.5)"><div class="muted" style="font-size:12px">EVREN B</div><h3>${esc(r.b.ad)}</h3><div class="big-num t-ok">${fmt.n(B.saglik_ort, 0)}</div><div class="muted">ortalama sağlık</div></div>
      <div class="card" style="background:linear-gradient(160deg,rgba(52,211,153,.16),var(--panel))"><div class="muted" style="font-size:12px">B'NİN NET ETKİSİ · ${r.gun} GÜN</div>
        <div class="big-num ${net.toplam >= 0 ? "t-ok" : "t-crit"}">${net.toplam >= 0 ? "+" : ""}${fmt.ktl(net.toplam)}</div>
        <div class="muted">yıllığa çevrilmiş ≈ <b>${fmt.ktl(net.yillik)}</b></div>
        <div class="mt" style="font-size:12px;display:grid;gap:3px">${Object.entries(net.kalemler).map(([k, v]) => `<div style="display:flex"><span class="muted">${KAL[k]}</span><span class="num ${v >= 0 ? "t-ok" : "t-crit"}" style="margin-left:auto">${v >= 0 ? "+" : ""}${fmt.ktl(v)}</span></div>`).join("")}</div>
        <div class="dim mt" style="font-size:11px">Üretim marjı: ciro farkının %${Math.round(net.marj * 100)}'si. ${r.sure_sn} sn'de hesaplandı.</div></div></div>
      <div class="grid mt g2"><div class="card"><div class="card-h"><h3>Kümülatif enerji faturası</h3><span class="sub">M ₺</span></div><div id="vc1"></div></div>
        <div class="card"><div class="card-h"><h3>Sağlık skoru</h3><span class="sub">saatlik</span></div><div id="vc2"></div></div></div>
      <div class="card mt"><div class="card-h"><h3>Gösterge karşılaştırması</h3></div><div class="tbl-wrap"><table class="tbl"><tr><th>Gösterge</th><th class="r">A · ${esc(r.a.ad)}</th><th class="r">B · ${esc(r.b.ad)}</th><th class="r">Fark</th></tr>
        ${ROWS.map(([k, n, f, dir]) => `<tr><td>${n}</td><td class="r num">${f(A[k])}</td><td class="r num"><b>${f(B[k])}</b></td><td class="r num ${better(k, dir)}">${B[k] - A[k] >= 0 ? "+" : ""}${f(B[k] - A[k])}</td></tr>`).join("")}</table></div></div>`);
    lineChart($("#vc1"), { height: 220, series: [{ label: r.a.ad, color: "#f87171", data: r.a.seri.map((p) => [p.t, p.fatura]) }, { label: r.b.ad, color: "#34d399", data: r.b.seri.map((p) => [p.t, p.fatura]), area: true }], yFmt: (v) => fmt.n(v, 1) });
    lineChart($("#vc2"), { height: 220, min: 0, max: 100, series: [{ label: r.a.ad, color: "#f87171", data: r.a.seri.map((p) => [p.t, p.saglik]) }, { label: r.b.ad, color: "#34d399", data: r.b.seri.map((p) => [p.t, p.saglik]) }] });
  },
};
