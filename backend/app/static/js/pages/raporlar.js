import { $, esc, fmt, bars, scoreColor } from "../ui.js";

const COLS = [["gun", "Gün", (v) => v], ["enerji_mwh", "Enerji MWh", (v) => fmt.n(v, 1)], ["ges_mwh", "GES MWh", (v) => fmt.n(v, 1)], ["fatura_tl", "Fatura", fmt.ktl],
  ["pik_mw", "Pik MW", (v) => fmt.n(v, 1)], ["co2_t", "tCO₂", (v) => fmt.n(v, 1)], ["kacinilan_t", "Kaçınılan t", (v) => fmt.n(v, 1)], ["ciro_tl", "Ciro", fmt.ktl],
  ["su_m3", "Su m³", (v) => fmt.n(v)], ["teslim", "Teslimat", (v) => fmt.n(v)], ["bos_km_orani", "Boş km", (v) => fmt.pct(v)], ["simbiyoz_tl", "Simbiyoz", fmt.ktl],
  ["bertaraf_t", "Bertaraf t", (v) => fmt.n(v, 1)], ["durus_dk", "Duruş dk", (v) => fmt.n(v)], ["olay", "Olay", (v) => fmt.n(v)], ["saglik", "Sağlık", (v) => `<b style="color:${scoreColor(v)}">${v}</b>`]];

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="card"><div class="card-h"><h3>Bölge günlük performans raporu</h3><span class="sub">NEXUS OSB · otomatik gün sonu kapanışı (00:00)</span>
      <span class="act no-print"><button class="btn" id="csv">CSV indir</button><button class="btn pri" id="prn">Yazdır / PDF</button></span></div>
      <div class="tbl-wrap"><table class="tbl" id="rt"></table></div></div>
      <div class="grid mt g2"><div class="card"><div class="card-h"><h3>Günlük enerji</h3><span class="sub">MWh</span></div><div id="re"></div></div>
      <div class="card"><div class="card-h"><h3>Günlük emisyon</h3><span class="sub">tCO₂</span></div><div id="rc"></div></div></div>`;
    $("#prn").onclick = () => window.print();
    $("#csv").onclick = () => {
      const rows = [COLS.map((c) => c[1]).join(";"), ...this.rows.map((r) => COLS.map((c) => r[c[0]]).join(";"))];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" }));
      a.download = "nexus-osb-gunluk-rapor.csv"; a.click();
    };
    ctx.poll(async () => this.paint(await ctx.api("/raporlar")), 10000);
  },
  paint(d) {
    const rows = [{ ...d.bugun, _now: true }, ...d.gunler];
    this.rows = rows;
    $("#rt").innerHTML = `<tr>${COLS.map((c, i) => `<th class="${i ? "r" : ""}">${c[1]}</th>`).join("")}</tr>` +
      rows.map((r) => `<tr>${COLS.map((c, i) => `<td class="${i ? "r num" : ""}">${i === 0 ? `<b>Gün ${r.gun}</b>${r._now ? ' <span class="t-acc">(devam ediyor)</span>' : ""}` : c[2](r[c[0]])}</td>`).join("")}</tr>`).join("");
    const g = [...d.gunler].reverse();
    bars($("#re"), g.map((x) => ({ label: `Gün ${x.gun}`, value: x.enerji_mwh, color: "#22d3ee", text: fmt.n(x.enerji_mwh) })), { empty: "İlk gün kapanınca görünür" });
    bars($("#rc"), g.map((x) => ({ label: `Gün ${x.gun}`, value: x.co2_t, color: "#fb923c", text: fmt.n(x.co2_t) })), { empty: "İlk gün kapanınca görünür" });
  },
};
