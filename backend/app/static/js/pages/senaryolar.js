import { $, $$, esc, fmt } from "../ui.js";

let base = null, data = null;
const M = [["Bölge yükü", (l) => l.k.guc_mw, "MW", 1], ["Şebeke çekişi", (l) => l.k.sebeke_mw, "MW", 1], ["Batarya", (l) => l.e.soc * 100, "%", 0],
  ["Çalışan tesis", (l) => l.k.durumlar.calisiyor || 0, "", 0], ["Saatlik üretim", (l) => l.k.uretim_saat_tl / 1e6, "M ₺", 2], ["Anlık emisyon", (l) => l.k.co2_anlik, "t/sa", 1],
  ["Bekleyen iş", (l) => l.l.bekleyen, "", 0], ["Arıtma KOİ", (l) => l.su.koi, "mg/L", 0], ["Açık olay", (l) => l.o.toplam, "", 0], ["Sağlık skoru", (l) => l.saglik, "", 0]];

export default {
  async mount(root, ctx) {
    root.innerHTML = `<div class="note">Senaryo laboratuvarı bölgeyi canlı olarak strese sokar. Başlattığın anda temel değerler kaydedilir ve etki aşağıda karşılaştırılır. Hızlı izlemek için üst çubuktan <b>20×</b> veya <b>60×</b> seç.</div>
      <div class="card mt" id="act"></div>
      <div class="grid mt g3" id="sc"></div>
      <div class="card mt"><div class="card-h"><h3>Geçmiş senaryolar</h3></div><div class="tbl-wrap"><table class="tbl" id="sh"></table></div></div>`;
    ctx.poll(async () => { data = await ctx.api("/senaryolar"); this.paint(ctx); }, 4000);
  },
  paint(ctx) {
    $("#sc").innerHTML = Object.entries(data.liste).map(([k, s]) => `<div class="card scn-card"><div class="ico">${s.ikon}</div><h3>${esc(s.ad)}</h3>
      <div class="muted" style="font-size:12.5px;flex:1">${esc(s.aciklama)}</div><div class="row" style="display:flex;align-items:center;gap:8px"><span class="tag">${fmt.dur(s.sure)}</span>
      <button class="btn ${data.aktif && data.aktif.key === k ? "" : "pri"}" data-k="${k}" style="margin-left:auto" ${data.aktif && data.aktif.key === k ? "disabled" : ""}>${data.aktif && data.aktif.key === k ? "Çalışıyor" : "Başlat"}</button></div></div>`).join("");
    $$("#sc [data-k]").forEach((b) => b.onclick = async () => {
      base = { ...snapshot(ctx.live()), _t: ctx.live().t };
      await ctx.api(`/senaryolar/${b.dataset.k}/baslat`, {});
      ctx.toast(`Senaryo başladı: ${data.liste[b.dataset.k].ad}`, "uyari");
      data = await ctx.api("/senaryolar"); this.paint(ctx);
    });
    $("#sh").innerHTML = `<tr><th>Senaryo</th><th>Başlangıç</th><th>Bitiş</th><th class="r">Süre</th></tr>` +
      (data.gecmis.map((g) => `<tr><td>${esc(g.ad)}</td><td class="num">${fmt.t(g.baslangic)}</td><td class="num">${fmt.t(g.gercek_bitis)}</td><td class="r num">${fmt.dur(g.gercek_bitis - g.baslangic)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Henüz senaryo çalıştırılmadı</td></tr>`);
    this.update(ctx.live(), ctx);
  },
  update(l, ctx) {
    if (!data || !l) return;
    const a = l.sc, el = $("#act");
    if (!el) return;
    if (!a) { base = null; el.innerHTML = `<div class="card-h"><h3>Aktif senaryo yok</h3><span class="sub">bölge normal işletmede</span></div>`; return; }
    if (!base || base._key !== a.key) { if (!base) base = snapshot(l); base._key = a.key; }
    const tot = a.bitis - a.baslangic, done = tot - a.kalan;
    el.innerHTML = `<div class="card-h"><h3>⚠ ${esc(a.ad)}</h3><span class="sub">kalan ${fmt.dur(a.kalan)}</span><span class="act"><button class="btn danger sm" id="sstop">Senaryoyu durdur</button></span></div>
      <div class="prog"><i style="width:${(done / tot) * 100}%"></i></div>
      <div class="tbl-wrap mt"><table class="tbl"><tr><th>Gösterge</th><th class="r">Başlangıç</th><th class="r">Şimdi</th><th class="r">Değişim</th></tr>
      ${M.map(([n, f, u, d]) => { const b = base[n], v = f(l), dv = v - b; return `<tr><td>${n}</td><td class="r num">${fmt.n(b, d)} ${u}</td><td class="r num"><b>${fmt.n(v, d)} ${u}</b></td>
        <td class="r num" style="color:${Math.abs(dv) < 1e-6 ? "" : dv > 0 ? "#fbbf24" : "#60a5fa"}">${dv > 0 ? "+" : ""}${fmt.n(dv, d)}${b ? ` (${dv > 0 ? "+" : ""}${fmt.n((dv / Math.abs(b)) * 100)}%)` : ""}</td></tr>`; }).join("")}</table></div>`;
    $("#sstop").onclick = async () => { await ctx.api("/senaryolar/durdur", {}); base = null; };
  },
  unmount() { data = null; },
};
function snapshot(l) { return Object.fromEntries(M.map(([n, f]) => [n, f(l)])); }
