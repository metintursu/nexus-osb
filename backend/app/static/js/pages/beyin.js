import { $, $$, esc, fmt, md, sev } from "../ui.js";

const hist = [];
let tts = false;
const CHIPS = ["Bölgenin şu anki durumunu özetle, en acil 3 aksiyon ne?", "TM-4'ü rahatlat", "Otopilotu aç", "Enerji faturasını bu hafta nasıl düşürürüz?",
  "SKDM riski en yüksek tesisler hangileri, ne yapmalı?", "Kamyonlar neden boş dolaşıyor?", "Hangi atık bağlantısını önce kurmalıyız?",
  "Arıtma tesisi sınırda mı?", "Açık arızalar ve önerilen müdahaleler", "Yarın sabah yönetim kuruluna 5 maddelik brifing hazırla"];

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1fr) 360px">
      <div class="card chat"><div class="card-h"><h3>Bölge Beyni ile konuş</h3><span class="sub" id="bst">durum kontrol ediliyor…</span></div>
        <div class="chips">${CHIPS.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
        <div class="chat-log" id="clog"></div>
        <div class="chat-in"><button class="mic" id="mic" title="Sesli komuta">🎙</button><textarea class="inp" id="cin" placeholder="Bölge hakkında bir şey sor ya da komut ver: 'TM-3'ü rahatlat', 'otopilotu aç', 'deprem senaryosu başlat'…"></textarea><button class="btn pri" id="csend">Gönder</button></div>
        <label class="switch mt" id="tts" style="font-size:12px"><i></i><span>Yanıtları sesli oku</span></label></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>Yapay zekâ motoru</h3></div><div id="aim" style="font-size:13px"></div></div>
        <div class="card"><div class="card-h"><h3>Canlı içgörüler</h3><span class="sub">her 30 dk yenilenir</span></div><div class="list" id="bins"></div></div></div></div>`;
    const send = async (q) => {
      q = (q || $("#cin").value).trim();
      if (!q) return;
      $("#cin").value = "";
      hist.push({ role: "user", content: q });
      this.renderLog();
      const log = $("#clog");
      log.insertAdjacentHTML("beforeend", `<div class="msg a" id="typing"><span class="typing"><span></span><span></span><span></span></span></div>`);
      log.scrollTop = log.scrollHeight;
      try {
        const r = await ctx.api("/beyin/sohbet", { mesaj: q, gecmis: hist.slice(0, -1) });
        hist.push({ role: "assistant", content: r.cevap, src: r.kaynak });
        if (tts && window.speechSynthesis) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(r.cevap.replace(/[*_•#]/g, "").slice(0, 600)); u.lang = "tr-TR"; speechSynthesis.speak(u); }
      } catch (e) { hist.push({ role: "assistant", content: "Yanıt alınamadı: " + e.message, src: "hata" }); }
      this.renderLog();
    };
    $("#csend").onclick = () => send();
    $("#cin").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
    $$(".chip").forEach((c) => c.onclick = () => send(c.textContent));
    $("#tts").onclick = () => { tts = !tts; $("#tts").classList.toggle("on", tts); };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { $("#mic").title = "Bu tarayıcı ses tanımayı desteklemiyor (Chrome/Edge önerilir)"; $("#mic").style.opacity = ".4"; }
    $("#mic").onclick = () => {
      if (!SR) { ctx.toast("Ses tanıma için Chrome veya Edge kullan", "uyari"); return; }
      const rec = new SR(); rec.lang = "tr-TR"; rec.interimResults = true;
      $("#mic").classList.add("on");
      rec.onresult = (e) => { const t = [...e.results].map((r) => r[0].transcript).join(" "); $("#cin").value = t; if (e.results[e.results.length - 1].isFinal) { rec.stop(); send(t); } };
      rec.onend = () => $("#mic").classList.remove("on");
      rec.onerror = () => { $("#mic").classList.remove("on"); ctx.toast("Mikrofon izni gerekli", "uyari"); };
      rec.start();
    };
    this.renderLog();
    this.engine(ctx);
    ctx.poll(async () => {
      const d = await ctx.api("/beyin/icgoruler");
      const ins = d.icgoruler;
      $("#bins").innerHTML = ins.map((i, n) => `<div class="item"><div class="ttl">${sev(i.seviye)} ${esc(i.baslik)}</div><div class="txt">${esc(i.metin)}</div>
        ${i.aksiyon ? `<div class="row"><button class="btn sm pri" data-n="${n}">${esc(i.aksiyon.etiket)}</button></div>` : ""}</div>`).join("");
      $$("#bins [data-n]").forEach((b) => b.onclick = () => { b.disabled = true; ctx.runAction(ins[+b.dataset.n].aksiyon); });
    }, 8000);
  },
  async engine(ctx) {
    const s = await ctx.api("/beyin/durum");
    $("#bst").textContent = s.ok ? `Ollama · ${s.model}` : "yerel analist modu";
    $("#aim").innerHTML = s.ok
      ? `<div><span class="st st-calisiyor">Ollama bağlı</span></div><div class="muted mt">${esc(s.url)}</div>
         <div class="mt"><select class="inp" id="msel" style="width:100%">${s.models.map((m) => `<option ${m === s.model ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>
         <div class="muted mt" style="font-size:12px">Tamamen yerel ve ücretsiz. Her soruya bölgenin canlı durum özeti eklenir.</div>`
      : `<div><span class="st st-ariza">Ollama bulunamadı</span></div><div class="muted mt" style="font-size:12.5px">${esc(s.error || "")}</div>
         <div class="muted mt" style="font-size:12.5px">Şu an <b>yerel analist</b> yanıt veriyor: enerji, karbon, lojistik, atık, su ve olay sorularını gerçek verilerle cevaplar. Serbest sohbet için bilgisayarında Ollama'yı çalıştır:</div>
         <div class="code mt">ollama pull llama3.2</div><button class="btn sm mt" id="rchk">Yeniden dene</button>`;
    const ms = $("#msel"); if (ms) ms.onchange = async () => { await ctx.api("/beyin/model", { model: ms.value }); this.engine(ctx); };
    const rc = $("#rchk"); if (rc) rc.onclick = () => this.engine(ctx);
  },
  renderLog() {
    const log = $("#clog");
    if (!log) return;
    log.innerHTML = hist.length ? hist.map((m) => `<div class="msg ${m.role === "user" ? "u" : "a"}">${m.role === "user" ? esc(m.content) : md(m.content)}${m.src ? `<span class="src">${esc(m.src)}</span>` : ""}</div>`).join("")
      : `<div class="msg a">Merhaba. Ben NEXUS OSB'nin Bölge Beyni'yim. 30 tesisin enerji, lojistik, atık, karbon, su ve güvenlik verisini anlık izliyorum. Bir soru sor ya da yukarıdaki önerilerden birini seç.</div>`;
    log.scrollTop = log.scrollHeight;
  },
};
