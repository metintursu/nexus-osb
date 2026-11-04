import { $, $$, esc, fmt } from "../ui.js";

let base = null, data = null;
const M = [["Zone load", (l) => l.k.guc_mw, "MW", 1], ["Grid draw", (l) => l.k.sebeke_mw, "MW", 1], ["Battery", (l) => l.e.soc * 100, "%", 0],
  ["Sites running", (l) => l.k.durumlar.calisiyor || 0, "", 0], ["Hourly output", (l) => l.k.uretim_saat_tl / 1e6, "₺M", 2], ["Current emissions", (l) => l.k.co2_anlik, "t/h", 1],
  ["Jobs waiting", (l) => l.l.bekleyen, "", 0], ["Plant COD", (l) => l.su.koi, "mg/L", 0], ["Open incidents", (l) => l.o.toplam, "", 0], ["Health score", (l) => l.saglik, "", 0]];

export default {
  async mount(root, ctx) {
    root.innerHTML = `<div class="note">The scenario lab stress-tests the live zone. Baseline values are recorded the moment you start, and the impact is compared below. To watch faster, pick <b>20×</b> or <b>60×</b> in the top bar.</div>
      <div class="card mt" id="act"></div>
      <div class="grid mt g3" id="sc"></div>
      <div class="card mt"><div class="card-h"><h3>Past scenarios</h3></div><div class="tbl-wrap"><table class="tbl" id="sh"></table></div></div>`;
    ctx.poll(async () => { data = await ctx.api("/senaryolar"); this.paint(ctx); }, 4000);
  },
  paint(ctx) {
    $("#sc").innerHTML = Object.entries(data.liste).map(([k, s]) => `<div class="card scn-card"><div class="ico">${s.ikon}</div><h3>${esc(s.ad)}</h3>
      <div class="muted" style="font-size:12.5px;flex:1">${esc(s.aciklama)}</div><div class="row" style="display:flex;align-items:center;gap:8px"><span class="tag">${fmt.dur(s.sure)}</span>
      <button class="btn ${data.aktif && data.aktif.key === k ? "" : "pri"}" data-k="${k}" style="margin-left:auto" ${data.aktif && data.aktif.key === k ? "disabled" : ""}>${data.aktif && data.aktif.key === k ? "Running" : "Start"}</button></div></div>`).join("");
    $$("#sc [data-k]").forEach((b) => b.onclick = async () => {
      base = { ...snapshot(ctx.live()), _t: ctx.live().t };
      await ctx.api(`/senaryolar/${b.dataset.k}/baslat`, {});
      ctx.toast(`Scenario started: ${data.liste[b.dataset.k].ad}`, "uyari");
      data = await ctx.api("/senaryolar"); this.paint(ctx);
    });
    $("#sh").innerHTML = `<tr><th>Scenario</th><th>Started</th><th>Ended</th><th class="r">Duration</th></tr>` +
      (data.gecmis.map((g) => `<tr><td>${esc(g.ad)}</td><td class="num">${fmt.t(g.baslangic)}</td><td class="num">${fmt.t(g.gercek_bitis)}</td><td class="r num">${fmt.dur(g.gercek_bitis - g.baslangic)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No scenarios run yet</td></tr>`);
    this.update(ctx.live(), ctx);
  },
  update(l, ctx) {
    if (!data || !l) return;
    const a = l.sc, el = $("#act");
    if (!el) return;
    if (!a) { base = null; el.innerHTML = `<div class="card-h"><h3>No active scenario</h3><span class="sub">zone in normal operation</span></div>`; return; }
    if (!base || base._key !== a.key) { if (!base) base = snapshot(l); base._key = a.key; }
    const tot = a.bitis - a.baslangic, done = tot - a.kalan;
    el.innerHTML = `<div class="card-h"><h3>⚠ ${esc(a.ad)}</h3><span class="sub">${fmt.dur(a.kalan)} left</span><span class="act"><button class="btn danger sm" id="sstop">Stop scenario</button></span></div>
      <div class="prog"><i style="width:${(done / tot) * 100}%"></i></div>
      <div class="tbl-wrap mt"><table class="tbl"><tr><th>Indicator</th><th class="r">Baseline</th><th class="r">Now</th><th class="r">Change</th></tr>
      ${M.map(([n, f, u, d]) => { const b = base[n], v = f(l), dv = v - b; return `<tr><td>${n}</td><td class="r num">${fmt.n(b, d)} ${u}</td><td class="r num"><b>${fmt.n(v, d)} ${u}</b></td>
        <td class="r num" style="color:${Math.abs(dv) < 1e-6 ? "" : dv > 0 ? "#fbbf24" : "#60a5fa"}">${dv > 0 ? "+" : ""}${fmt.n(dv, d)}${b ? ` (${dv > 0 ? "+" : ""}${fmt.n((dv / Math.abs(b)) * 100)}%)` : ""}</td></tr>`; }).join("")}</table></div>`;
    $("#sstop").onclick = async () => { await ctx.api("/senaryolar/durdur", {}); base = null; };
  },
  unmount() { data = null; },
};
function snapshot(l) { return Object.fromEntries(M.map(([n, f]) => [n, f(l)])); }
