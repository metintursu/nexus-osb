import { $, $$, esc, fmt } from "../ui.js";

let base = null, data = null;
const M = [[L("Zone load", "Bölge yükü"), (l) => l.k.guc_mw, "MW", 1], [L("Grid draw", "Şebeke çekişi"), (l) => l.k.sebeke_mw, "MW", 1], [L("Battery", "Batarya"), (l) => l.e.soc * 100, "%", 0],
  [L("Sites running", "Çalışan tesis"), (l) => l.k.durumlar.calisiyor || 0, "", 0], [L("Hourly output", "Saatlik üretim"), (l) => l.k.uretim_saat_tl / 1e6, "₺M", 2], [L("Current emissions", "Anlık emisyon"), (l) => l.k.co2_anlik, "t/h", 1],
  [L("Jobs waiting", "Bekleyen iş"), (l) => l.l.bekleyen, "", 0], [L("Plant COD", "Arıtma KOİ"), (l) => l.su.koi, "mg/L", 0], [L("Open incidents", "Açık olay"), (l) => l.o.toplam, "", 0], [L("Health score", "Sağlık skoru"), (l) => l.saglik, "", 0]];

export default {
  async mount(root, ctx) {
    root.innerHTML = `<div class="note">${L(`The scenario lab stress-tests the live zone. Baseline values are recorded the moment you start, and the impact is compared below. To watch faster, pick`, `Senaryo laboratuvarı bölgeyi canlı olarak strese sokar. Başlattığın anda temel değerler kaydedilir ve etki aşağıda karşılaştırılır. Hızlı izlemek için üst çubuktan`)} <b>20×</b> ${L(`or`, `veya`)} <b>60×</b> ${L(`in the top bar.`, `seç.`)}</div>
      <div class="card mt" id="act"></div>
      <div class="grid mt g3" id="sc"></div>
      <div class="card mt"><div class="card-h"><h3>${L(`Past scenarios`, `Geçmiş senaryolar`)}</h3></div><div class="tbl-wrap"><table class="tbl" id="sh"></table></div></div>`;
    ctx.poll(async () => { data = await ctx.api("/senaryolar"); this.paint(ctx); }, 4000);
  },
  paint(ctx) {
    $("#sc").innerHTML = Object.entries(data.liste).map(([k, s]) => `<div class="card scn-card"><div class="ico">${s.ikon}</div><h3>${esc(s.ad)}</h3>
      <div class="muted" style="font-size:12.5px;flex:1">${esc(s.aciklama)}</div><div class="row" style="display:flex;align-items:center;gap:8px"><span class="tag">${fmt.dur(s.sure)}</span>
      <button class="btn ${data.aktif && data.aktif.key === k ? "" : "pri"}" data-k="${k}" style="margin-left:auto" ${data.aktif && data.aktif.key === k ? "disabled" : ""}>${data.aktif && data.aktif.key === k ? L("Running", "Çalışıyor") : L("Start", "Başlat")}</button></div></div>`).join("");
    $$("#sc [data-k]").forEach((b) => b.onclick = async () => {
      base = { ...snapshot(ctx.live()), _t: ctx.live().t };
      await ctx.api(`/senaryolar/${b.dataset.k}/baslat`, {});
      ctx.toast(`${L(`Scenario started:`, `Senaryo başladı:`)} ${data.liste[b.dataset.k].ad}`, "uyari");
      data = await ctx.api("/senaryolar"); this.paint(ctx);
    });
    $("#sh").innerHTML = `<tr><th>${L(`Scenario`, `Senaryo`)}</th><th>${L(`Started`, `Başlangıç`)}</th><th>${L(`Ended`, `Bitiş`)}</th><th class="r">${L(`Duration`, `Süre`)}</th></tr>` +
      (data.gecmis.map((g) => `<tr><td>${esc(g.ad)}</td><td class="num">${fmt.t(g.baslangic)}</td><td class="num">${fmt.t(g.gercek_bitis)}</td><td class="r num">${fmt.dur(g.gercek_bitis - g.baslangic)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">${L(`No scenarios run yet`, `Henüz senaryo çalıştırılmadı`)}</td></tr>`);
    this.update(ctx.live(), ctx);
  },
  update(l, ctx) {
    if (!data || !l) return;
    const a = l.sc, el = $("#act");
    if (!el) return;
    if (!a) { base = null; el.innerHTML = `<div class="card-h"><h3>${L(`No active scenario`, `Aktif senaryo yok`)}</h3><span class="sub">${L(`zone in normal operation`, `bölge normal işletmede`)}</span></div>`; return; }
    if (!base || base._key !== a.key) { if (!base) base = snapshot(l); base._key = a.key; }
    const tot = a.bitis - a.baslangic, done = tot - a.kalan;
    el.innerHTML = `<div class="card-h"><h3>⚠ ${esc(a.ad)}</h3><span class="sub">${fmt.dur(a.kalan)} left</span><span class="act"><button class="btn danger sm" id="sstop">${L(`Stop scenario`, `Senaryoyu durdur`)}</button></span></div>
      <div class="prog"><i style="width:${(done / tot) * 100}%"></i></div>
      <div class="tbl-wrap mt"><table class="tbl"><tr><th>${L(`Indicator`, `Gösterge`)}</th><th class="r">${L(`Baseline`, `Başlangıç`)}</th><th class="r">${L(`Now`, `Şimdi`)}</th><th class="r">${L(`Change`, `Değişim`)}</th></tr>
      ${M.map(([n, f, u, d]) => { const b = base[n], v = f(l), dv = v - b; return `<tr><td>${n}</td><td class="r num">${fmt.n(b, d)} ${u}</td><td class="r num"><b>${fmt.n(v, d)} ${u}</b></td>
        <td class="r num" style="color:${Math.abs(dv) < 1e-6 ? "" : dv > 0 ? "#fbbf24" : "#60a5fa"}">${dv > 0 ? "+" : ""}${fmt.n(dv, d)}${b ? ` (${dv > 0 ? "+" : ""}${fmt.n((dv / Math.abs(b)) * 100)}%)` : ""}</td></tr>`; }).join("")}</table></div>`;
    $("#sstop").onclick = async () => { await ctx.api("/senaryolar/durdur", {}); base = null; };
  },
  unmount() { data = null; },
};
function snapshot(l) { return Object.fromEntries(M.map(([n, f]) => [n, f(l)])); }
