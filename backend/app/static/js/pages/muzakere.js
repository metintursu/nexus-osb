import { $, $$, esc, fmt, kpi, setKpi } from "../ui.js";

const TUR = { esneklik: ["⚡", L("Flexibility auction", "Esneklik ihalesi")], atik: ["♻", L("Waste bargaining", "Atık pazarlığı")], kamyon: ["🚚", L("Truck sharing", "Kamyon paylaşımı")] };
let filt = "hepsi";

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g5">${kpi("n-oda", L("Negotiations", "Müzakere"), "sohbet")}${kpi("n-ok", L("Deals", "Anlaşma"), "simbiyoz", "#34d399")}${kpi("n-mw", L("Flexibility bought", "Satın alınan esneklik"), "enerji", "#fbbf24")}
      ${kpi("n-km", L("Merged trips", "Birleşen sefer"), "lojistik", "#22d3ee")}${kpi("n-kr", L("Zone Credits paid out", "Dağıtılan OSB Kredisi"), "para", "#c084fc")}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)">
      <div class="card"><div class="card-h"><h3>${L(`Live negotiation feed`, `Canlı müzakere akışı`)}</h3><span class="sub">${L(`site agents talking to each other`, `tesis ajanları kendi aralarında konuşuyor`)}</span>
        <span class="act"><div class="seg" id="nf"><button data-f="hepsi" class="on">${L(`All`, `Hepsi`)}</button><button data-f="esneklik">⚡</button><button data-f="atik">♻</button><button data-f="kamyon">🚚</button></div></span></div>
        <div id="chat" style="max-height:calc(100vh - 320px);overflow:auto;padding-right:6px"></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>${L(`Agent authority`, `Ajan yetkisi`)}</h3></div><label class="switch" id="oto"><i></i><span>${L(`Autonomous: activate agreed waste contracts without waiting for zone approval`, `Otonom: anlaşılan atık sözleşmelerini OSB onayı beklemeden devreye al`)}</span></label>
          <div class="muted mt" style="font-size:12px">${L(`When off, deals stay as proposals and are approved below. With Autopilot on, agents are always autonomous.`, `Kapalıyken anlaşmalar öneri olarak kalır, aşağıdan onaylanır. Otopilot açıkken ajanlar her durumda otonomdur.`)}</div></div>
        <div class="card"><div class="card-h"><h3>${L(`Tables`, `Masalar`)}</h3></div><div class="list" id="rooms" style="max-height:330px;overflow:auto"></div></div>
        <div class="card"><div class="card-h"><h3>${L(`Zone Credit ranking`, `OSB Kredisi sıralaması`)}</h3><span class="sub">${L(`earned through flexibility and sharing`, `esneklik ve paylaşımla kazanılır`)}</span></div><div class="tbl-wrap" style="max-height:300px"><table class="tbl" id="kr"></table></div></div></div></div>`;
    $$("#nf button").forEach((b) => b.onclick = () => { filt = b.dataset.f; $$("#nf button").forEach((x) => x.classList.toggle("on", x === b)); this.paint(ctx, this.d); });
    $("#oto").onclick = async () => { await ctx.api("/muzakere/otonom", { aktif: !this.d.otonom }); this.paint(ctx, await ctx.api("/muzakere")); };
    ctx.poll(async () => this.paint(ctx, await ctx.api("/muzakere")), 2000);
  },
  paint(ctx, d) {
    if (!d) return;
    this.d = d;
    const W = ctx.world, s = d.istatistik;
    setKpi("n-oda", fmt.n(s.oda), "", `${fmt.n(s.basarisiz)} ${L(`failed`, `başarısız`)}`);
    setKpi("n-ok", fmt.n(s.anlasma), "", `${L("success", "başarı")} ${fmt.pct(s.oda ? s.anlasma / Math.max(1, s.anlasma + s.basarisiz) : 0)}`);
    setKpi("n-mw", fmt.n(s.esneklik_mwh, 1), "MWh", L("via auctions", "ihalelerle"));
    setKpi("n-km", fmt.n(s.birlesen_sefer), "", L("half-empty trucks avoided", "yarı boş kamyon önlendi"));
    setKpi("n-kr", fmt.n(-d.osb_kredi), L("cr", "kr"), L("zone → sites", "OSB'den tesislere"));
    $("#oto").classList.toggle("on", d.otonom);
    const box = $("#chat"), atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    const msgs = d.mesajlar.filter((m) => filt === "hepsi" || m.tur === filt);
    box.innerHTML = msgs.map((m) => {
      const f = W.fabrikalar.find((x) => x.id === m.kim);
      const av = m.kim === "osb" ? [L("ZN", "OSB"), "#a78bfa"] : m.kim === "beyin" ? ["AI", "#22d3ee"] : [W.sektorler[f.sektor].kisa, f.renk];
      return `<div class="chatline ${m.tip}"><div class="av" style="background:${av[1]}">${av[0]}</div><div><div class="who">${esc(m.ad)}<small>${TUR[m.tur][0]} ${fmt.t(m.t)}${m.kisilik ? " · " + m.kisilik : ""}</small></div><div class="bub">${esc(m.metin)}</div></div></div>`;
    }).join("") || `<div class="empty">${L(`Agents will start talking shortly — a flexibility auction opens when a substation or the grid is stretched, and a waste bargaining table every few hours`, `Ajanlar birazdan konuşmaya başlar — trafo/şebeke sıkışınca esneklik ihalesi, birkaç saatte bir atık pazarlığı açılır`)}</div>`;
    if (atBottom) box.scrollTop = box.scrollHeight;
    $("#rooms").innerHTML = d.odalar.slice(0, 20).map((r) => `<div class="item"><div class="ttl">${TUR[r.tur][0]} ${esc(r.konu)}<span class="muted" style="margin-left:auto;font-weight:400;font-size:12px">${r.durum === "suruyor" ? L("🟡 ongoing", "🟡 sürüyor") : r.durum === "anlasma" ? L("🟢 deal", "🟢 anlaşma") : L("⚪ no deal", "⚪ sonuçsuz")}</span></div>
      <div class="txt">${r.id} · ${fmt.t(r.baslangic)}${r.sonuc && r.sonuc.fiyat ? ` · ${fmt.price(r.sonuc.fiyat)}/${r.sonuc.birim} ${L(`· monthly ≈`, `· aylık ≈`)}${fmt.ktl(r.sonuc.aylik_tl)}` : ""}${r.sonuc && r.sonuc.mw ? ` · ${fmt.n(r.sonuc.mw, 2)} MW @ ${fmt.price(r.sonuc.ort_fiyat)}/MWh` : ""}</div>
      ${r.tur === "atik" && r.sonuc && r.sonuc.ok && !r.sonuc.onay ? `<div class="row"><button class="btn sm pri" data-r="${r.id}${L(`">Approve deal`, `">Anlaşmayı onayla`)}</button></div>` : ""}</div>`).join("") || `<div class="empty">${L(`No tables opened yet`, `Henüz masa açılmadı`)}</div>`;
    $$("#rooms [data-r]").forEach((b) => b.onclick = async () => { b.disabled = true; try { await ctx.api("/muzakere/onayla/" + b.dataset.r, {}); ctx.toast(L("Deal approved, symbiosis link is live", "Anlaşma onaylandı, simbiyoz bağlantısı devrede"), "ok"); } catch (e) { ctx.toast(esc(e.message), "uyari"); } });
    $("#kr").innerHTML = `<tr><th>${L(`Site`, `Tesis`)}</th><th>${L(`Personality`, `Kişilik`)}</th><th class="r">${L(`Credits`, `Kredi`)}</th></tr>` + d.kredi.slice(0, 15).map((k) => `<tr class="click" data-f="${k.id}"><td>${esc(k.ad)}</td><td class="muted">${k.kisilik}</td><td class="r num ${k.kredi > 0 ? "t-ok" : k.kredi < 0 ? "t-warn" : ""}">${fmt.n(k.kredi)}</td></tr>`).join("");
    $$("#kr [data-f]").forEach((tr) => tr.onclick = () => ctx.openFactory(tr.dataset.f));
  },
};
