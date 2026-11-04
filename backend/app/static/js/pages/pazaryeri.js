import { $, $$, esc, fmt, kpi, setKpi } from "../ui.js";

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g4">
      ${kpi("m-tek", "Açık teklif", "pazar")}${kpi("m-tal", "Açık talep", "pazar", "#fbbf24")}${kpi("m-soz", "Kurulan sözleşme", "rapor", "#34d399")}${kpi("m-tas", "Bölgede kalan değer", "para", "#c084fc")}</div>
    <div class="note mt">Bölgedeki tesisler atıl makine saatini, depo alanını, laboratuvarını ve boş parselleri birbirine sunar. Dışarıdan hizmet almaya göre fiyat düşük, taşıma kısa; para bölgede kalır.</div>
    <div class="card mt"><div class="card-h"><h3>Akıllı eşleşmeler</h3><span class="sub">teklif fiyatı ≤ talep tavanı · tasarruf: bölge dışı fiyata (+%25) göre</span></div><div class="list" id="mm"></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Teklifler</h3><span class="sub">atıl kapasite</span></div><div class="tbl-wrap" style="max-height:420px"><table class="tbl" id="off"></table></div></div>
      <div class="card"><div class="card-h"><h3>Talepler</h3><span class="sub">kapasite ihtiyacı</span></div><div class="tbl-wrap" style="max-height:420px"><table class="tbl" id="dem"></table></div></div></div>
    <div class="card mt"><div class="card-h"><h3>Sözleşmeler</h3></div><div class="tbl-wrap"><table class="tbl" id="con"></table></div></div>`;
    ctx.poll(async () => { this.paint(ctx, await ctx.api("/pazaryeri")); }, 5000);
  },
  paint(ctx, d) {
    setKpi("m-tek", d.teklifler.length, "", `${new Set(d.teklifler.map((o) => o.kaynak)).size} kaynak türü`);
    setKpi("m-tal", d.talepler.length, "", "");
    setKpi("m-soz", d.toplam.sozlesme, "", `hacim ${fmt.ktl(d.toplam.hacim_tl)}`);
    setKpi("m-tas", fmt.ktl(d.toplam.tasarruf_tl), "", "talep eden tesislerin tasarrufu");
    $("#mm").innerHTML = d.eslesmeler.slice(0, 6).map((m, i) => `<div class="item"><div class="ttl">🤝 ${esc(m.kaynak)} <span class="muted" style="font-weight:400">${fmt.n(m.miktar)} ${m.birim} · ${fmt.n(m.fiyat)} ₺/${m.birim}</span>
      <span class="num t-ok" style="margin-left:auto">${fmt.ktl(m.tasarruf_tl)} tasarruf</span></div>
      <div class="txt">${esc(m.veren_ad)} <span class="dim">sunuyor →</span> ${esc(m.isteyen_ad)} <span class="dim">ihtiyaç duyuyor</span> · sözleşme hacmi ${fmt.ktl(m.hacim_tl)}</div>
      <div class="row"><button class="btn sm pri" data-i="${i}">Sözleşmeyi kur</button></div></div>`).join("") || `<div class="empty">Şu an uyumlu teklif–talep yok; yeni ilanlar geldikçe eşleşme motoru tarar</div>`;
    $$("#mm [data-i]").forEach((b) => b.onclick = async () => {
      const m = d.eslesmeler[+b.dataset.i]; b.disabled = true;
      if (await ctx.runAction({ tip: "pazar", teklif: m.teklif, talep: m.talep })) this.paint(ctx, await ctx.api("/pazaryeri"));
    });
    $("#off").innerHTML = `<tr><th>Kaynak</th><th>Sunan</th><th class="r">Miktar</th><th class="r">Fiyat</th><th>Not</th></tr>` +
      d.teklifler.map((o) => `<tr><td><b>${esc(o.ad)}</b></td><td>${esc(o.veren_ad)}</td><td class="r num">${fmt.n(o.miktar)} ${o.birim}</td><td class="r num">${fmt.n(o.fiyat)} ₺</td><td class="muted">${esc(o.not)}</td></tr>`).join("");
    $("#dem").innerHTML = `<tr><th>Kaynak</th><th>İsteyen</th><th class="r">Miktar</th><th class="r">Tavan</th><th>Not</th></tr>` +
      d.talepler.map((o) => `<tr><td><b>${esc(o.ad)}</b></td><td>${esc(o.isteyen_ad)}</td><td class="r num">${fmt.n(o.miktar)} ${o.birim}</td><td class="r num">${fmt.n(o.azami_fiyat)} ₺</td><td class="muted">${esc(o.not)}</td></tr>`).join("");
    $("#con").innerHTML = `<tr><th>No</th><th>Zaman</th><th>Kaynak</th><th>Sunan → Alan</th><th class="r">Miktar</th><th class="r">Hacim</th><th class="r">Tasarruf</th></tr>` +
      (d.sozlesmeler.map((c) => `<tr><td class="num dim">${c.id}</td><td class="num">${fmt.t(c.zaman)}</td><td>${esc(c.kaynak)}</td><td>${esc(c.veren_ad)} → ${esc(c.isteyen_ad)}</td><td class="r num">${fmt.n(c.miktar)} ${c.birim}</td><td class="r num">${fmt.ktl(c.hacim_tl)}</td><td class="r num t-ok">${fmt.ktl(c.tasarruf_tl)}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">Henüz sözleşme yok</td></tr>`);
  },
};
