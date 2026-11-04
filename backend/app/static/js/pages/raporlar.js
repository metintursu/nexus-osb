import { $, esc, fmt, bars, scoreColor } from "../ui.js";

const COLS = [["gun", "Day", (v) => v], ["enerji_mwh", "Energy MWh", (v) => fmt.n(v, 1)], ["ges_mwh", "Solar MWh", (v) => fmt.n(v, 1)], ["fatura_tl", "Bill", fmt.ktl],
  ["pik_mw", "Peak MW", (v) => fmt.n(v, 1)], ["co2_t", "tCO₂", (v) => fmt.n(v, 1)], ["kacinilan_t", "Avoided t", (v) => fmt.n(v, 1)], ["ciro_tl", "Revenue", fmt.ktl],
  ["su_m3", "Water m³", (v) => fmt.n(v)], ["teslim", "Deliveries", (v) => fmt.n(v)], ["bos_km_orani", "Empty km", (v) => fmt.pct(v)], ["simbiyoz_tl", "Symbiosis", fmt.ktl],
  ["bertaraf_t", "Disposal t", (v) => fmt.n(v, 1)], ["durus_dk", "Downtime min", (v) => fmt.n(v)], ["olay", "Incidents", (v) => fmt.n(v)], ["saglik", "Health", (v) => `<b style="color:${scoreColor(v)}">${v}</b>`]];

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="card"><div class="card-h"><h3>Zone daily performance report</h3><span class="sub">NEXUS OSB · automatic end-of-day close (00:00)</span>
      <span class="act no-print"><button class="btn" id="csv">Download CSV</button><button class="btn pri" id="prn">Print / PDF</button></span></div>
      <div class="tbl-wrap"><table class="tbl" id="rt"></table></div></div>
      <div class="grid mt g2"><div class="card"><div class="card-h"><h3>Daily energy</h3><span class="sub">MWh</span></div><div id="re"></div></div>
      <div class="card"><div class="card-h"><h3>Daily emissions</h3><span class="sub">tCO₂</span></div><div id="rc"></div></div></div>`;
    $("#prn").onclick = () => window.print();
    $("#csv").onclick = () => {
      const rows = [COLS.map((c) => c[1]).join(","), ...this.rows.map((r) => COLS.map((c) => r[c[0]]).join(","))];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" }));
      a.download = "nexus-osb-daily-report.csv"; a.click();
    };
    ctx.poll(async () => this.paint(await ctx.api("/raporlar")), 10000);
  },
  paint(d) {
    const rows = [{ ...d.bugun, _now: true }, ...d.gunler];
    this.rows = rows;
    $("#rt").innerHTML = `<tr>${COLS.map((c, i) => `<th class="${i ? "r" : ""}">${c[1]}</th>`).join("")}</tr>` +
      rows.map((r) => `<tr>${COLS.map((c, i) => `<td class="${i ? "r num" : ""}">${i === 0 ? `<b>Day ${r.gun}</b>${r._now ? ' <span class="t-acc">(in progress)</span>' : ""}` : c[2](r[c[0]])}</td>`).join("")}</tr>`).join("");
    const g = [...d.gunler].reverse();
    bars($("#re"), g.map((x) => ({ label: `Day ${x.gun}`, value: x.enerji_mwh, color: "#22d3ee", text: fmt.n(x.enerji_mwh) })), { empty: "Appears once the first day closes" });
    bars($("#rc"), g.map((x) => ({ label: `Day ${x.gun}`, value: x.co2_t, color: "#fb923c", text: fmt.n(x.co2_t) })), { empty: "Appears once the first day closes" });
  },
};
