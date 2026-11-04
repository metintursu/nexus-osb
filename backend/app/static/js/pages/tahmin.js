import { $, esc, fmt, lineChart, sev } from "../ui.js";

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="note">${L(`The current state of the zone is copied 6 times and each copy is run 24 hours ahead with different random events (Monte Carlo). Instead of a single guess you get a`, `Bölgenin anlık durumu 6 kez kopyalanır ve her kopya farklı rastlantılarla 24 saat ileri koşturulur (Monte Carlo). Böylece tek bir tahmin yerine bir`)} <b>${L(`probability band`, `olasılık bandı`)}</b> ${L(`and risk percentages. The forecast is cached for 30 simulated minutes.`, `ve risk yüzdeleri elde edilir. Tahmin 30 simülasyon dakikası önbellekte kalır.`)}</div>
      <div class="card mt"><div class="card-h"><h3>${L(`Risk calendar`, `Risk takvimi`)}</h3><span class="sub" id="fmeta">${L(`calculating…`, `hesaplanıyor…`)}</span><span class="act"><button class="btn sm" id="fre">${L(`Recalculate`, `Yeniden hesapla`)}</button></span></div><div id="heat"></div><div class="list mt" id="falerts"></div></div>
      <div class="grid mt g2">
        <div class="card"><div class="card-h"><h3>${L(`Grid draw forecast`, `Şebeke çekişi tahmini`)}</h3><span class="sub">${L(`mean + p10–p90 · MW`, `ortalama + p10–p90 · MW`)}</span></div><div id="fc1"></div></div>
        <div class="card"><div class="card-h"><h3>${L(`Battery and health score`, `Batarya ve sağlık skoru`)}</h3><span class="sub">${L(`mean`, `ortalama`)}</span></div><div id="fc2"></div></div></div>`;
    $("#fre").onclick = () => this.load(ctx, true);
    this.load(ctx, false);
    ctx.poll(() => this.load(ctx, false), 20000);
  },
  async load(ctx, force) {
    const meta = $("#fmeta"); if (!meta) return;
    if (force) meta.textContent = L("Running 6 parallel futures…", "6 paralel gelecek koşturuluyor…");
    const d = await ctx.api("/tahmin" + (force ? "?yenile=true" : ""));
    if (!$("#heat")) return;
    if (!d.saatler) { meta.textContent = L("preparing…", "hazırlanıyor…"); return; }
    meta.textContent = `${d.kosu} ${L(`runs ×`, `koşu ×`)} ${d.saat} h${d.sure_sn ? ` · ${d.sure_sn} s` : ""}${d.yas_dk ? ` · ${d.yas_dk} ${L(`min ago`, `dk önce`)}` : ""}`;
    const H = d.saatler, contract = ctx.world.sozlesme_kw / 1000;
    const rows = [...H[0].tm_risk.map((_, i) => [`TM-${i + 1} ${L(`overload`, `aşırı yük`)}`, (r) => r.tm_risk[i]]), [L("Contract overrun", "Sözleşme aşımı"), (r) => r.asim_risk], [L("COD overrun", "KOİ aşımı"), (r) => r.koi_risk]];
    const cell = (p) => `background:rgba(248,113,113,${0.08 + p * 0.85});color:${p > 0.45 ? "#fff" : "#94a3b8"}`;
    $("#heat").innerHTML = `<div class="tbl-wrap"><table class="tbl" style="font-size:11.5px"><tr><th>Risk</th>${H.map((r) => `<th class="r" style="padding:6px 4px">${fmt.hm(r.t).slice(0, 2)}</th>`).join("")}</tr>
      ${rows.map(([n, f]) => `<tr><td>${n}</td>${H.map((r) => { const p = f(r); return `<td class="num" style="text-align:center;padding:6px 2px;${cell(p)}">${p ? Math.round(p * 100) : ""}</td>`; }).join("")}</tr>`).join("")}</table></div>`;
    $("#falerts").innerHTML = d.uyarilar.slice(0, 8).map((a) => `<div class="item" style="padding:8px 11px"><div class="ttl">${sev(a.seviye)} ${fmt.t(a.t)} · ${esc(a.metin)}</div></div>`).join("") || `<div class="empty">${L(`No significant risk in the next 24 hours`, `Önümüzdeki 24 saatte belirgin risk görünmüyor`)}</div>`;
    lineChart($("#fc1"), { height: 240, unit: "MW", series: [
      { label: "p90", color: "#f87171", data: H.map((r) => [r.t, r.sebeke.p90]), dash: "4 4", width: 1.2 },
      { label: L("Mean", "Ortalama"), color: "#a78bfa", data: H.map((r) => [r.t, r.sebeke.ort]), area: true },
      { label: "p10", color: "#60a5fa", data: H.map((r) => [r.t, r.sebeke.p10]), dash: "4 4", width: 1.2 }],
      refs: [{ y: contract, label: L("Contract", "Sözleşme"), color: "#f87171" }] });
    lineChart($("#fc2"), { height: 240, min: 0, max: 100, series: [
      { label: L("Battery %", "Batarya %"), color: "#34d399", data: H.map((r) => [r.t, r.soc.ort * 100]), area: true },
      { label: L("Health score", "Sağlık skoru"), color: "#fbbf24", data: H.map((r) => [r.t, r.saglik.ort]) }] });
  },
};
