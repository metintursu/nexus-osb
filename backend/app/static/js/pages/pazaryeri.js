import { $, $$, esc, fmt, kpi, setKpi } from "../ui.js";

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g4">
      ${kpi("m-tek", "Open offers", "pazar")}${kpi("m-tal", "Open requests", "pazar", "#fbbf24")}${kpi("m-soz", "Contracts signed", "rapor", "#34d399")}${kpi("m-tas", "Value kept in the zone", "para", "#c084fc")}</div>
    <div class="note mt">Sites offer each other idle machine hours, warehouse space, lab capacity and empty plots. Prices are lower than outside suppliers, transport is short, and the money stays in the zone.</div>
    <div class="card mt"><div class="card-h"><h3>Smart matches</h3><span class="sub">offer price ≤ request ceiling · savings vs. outside price (+25%)</span></div><div class="list" id="mm"></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Offers</h3><span class="sub">idle capacity</span></div><div class="tbl-wrap" style="max-height:420px"><table class="tbl" id="off"></table></div></div>
      <div class="card"><div class="card-h"><h3>Requests</h3><span class="sub">capacity needed</span></div><div class="tbl-wrap" style="max-height:420px"><table class="tbl" id="dem"></table></div></div></div>
    <div class="card mt"><div class="card-h"><h3>Contracts</h3></div><div class="tbl-wrap"><table class="tbl" id="con"></table></div></div>`;
    ctx.poll(async () => { this.paint(ctx, await ctx.api("/pazaryeri")); }, 5000);
  },
  paint(ctx, d) {
    setKpi("m-tek", d.teklifler.length, "", `${new Set(d.teklifler.map((o) => o.kaynak)).size} resource types`);
    setKpi("m-tal", d.talepler.length, "", "");
    setKpi("m-soz", d.toplam.sozlesme, "", `volume ${fmt.ktl(d.toplam.hacim_tl)}`);
    setKpi("m-tas", fmt.ktl(d.toplam.tasarruf_tl), "", "savings for requesting sites");
    $("#mm").innerHTML = d.eslesmeler.slice(0, 6).map((m, i) => `<div class="item"><div class="ttl">🤝 ${esc(m.kaynak)} <span class="muted" style="font-weight:400">${fmt.n(m.miktar)} ${m.birim} · ₺${fmt.n(m.fiyat)}/${m.birim}</span>
      <span class="num t-ok" style="margin-left:auto">${fmt.ktl(m.tasarruf_tl)} saved</span></div>
      <div class="txt">${esc(m.veren_ad)} <span class="dim">offers →</span> ${esc(m.isteyen_ad)} <span class="dim">needs it</span> · contract volume ${fmt.ktl(m.hacim_tl)}</div>
      <div class="row"><button class="btn sm pri" data-i="${i}">Sign contract</button></div></div>`).join("") || `<div class="empty">No compatible offer/request right now; the matching engine scans as new listings arrive</div>`;
    $$("#mm [data-i]").forEach((b) => b.onclick = async () => {
      const m = d.eslesmeler[+b.dataset.i]; b.disabled = true;
      if (await ctx.runAction({ tip: "pazar", teklif: m.teklif, talep: m.talep })) this.paint(ctx, await ctx.api("/pazaryeri"));
    });
    $("#off").innerHTML = `<tr><th>Resource</th><th>Offered by</th><th class="r">Amount</th><th class="r">Price</th><th>Note</th></tr>` +
      d.teklifler.map((o) => `<tr><td><b>${esc(o.ad)}</b></td><td>${esc(o.veren_ad)}</td><td class="r num">${fmt.n(o.miktar)} ${o.birim}</td><td class="r num">₺${fmt.n(o.fiyat)}</td><td class="muted">${esc(o.not)}</td></tr>`).join("");
    $("#dem").innerHTML = `<tr><th>Resource</th><th>Requested by</th><th class="r">Amount</th><th class="r">Ceiling</th><th>Note</th></tr>` +
      d.talepler.map((o) => `<tr><td><b>${esc(o.ad)}</b></td><td>${esc(o.isteyen_ad)}</td><td class="r num">${fmt.n(o.miktar)} ${o.birim}</td><td class="r num">₺${fmt.n(o.azami_fiyat)}</td><td class="muted">${esc(o.not)}</td></tr>`).join("");
    $("#con").innerHTML = `<tr><th>No</th><th>Time</th><th>Resource</th><th>Provider → Buyer</th><th class="r">Amount</th><th class="r">Volume</th><th class="r">Savings</th></tr>` +
      (d.sozlesmeler.map((c) => `<tr><td class="num dim">${c.id}</td><td class="num">${fmt.t(c.zaman)}</td><td>${esc(c.kaynak)}</td><td>${esc(c.veren_ad)} → ${esc(c.isteyen_ad)}</td><td class="r num">${fmt.n(c.miktar)} ${c.birim}</td><td class="r num">${fmt.ktl(c.hacim_tl)}</td><td class="r num t-ok">${fmt.ktl(c.tasarruf_tl)}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">No contracts yet</td></tr>`);
  },
};
