import { $, $$, esc, fmt, md, sev } from "../ui.js";

const hist = [];
let tts = false;
const CHIPS = [L("Summarize the zone right now — what are the 3 most urgent actions?", "Bölgenin şu anki durumunu özetle, en acil 3 aksiyon ne?"), L("Relieve TM-4", "TM-4'ü rahatlat"), L("Turn on autopilot", "Otopilotu aç"), L("How do we cut the energy bill this week?", "Enerji faturasını bu hafta nasıl düşürürüz?"),
  L("Which sites have the highest CBAM risk, and what should they do?", "SKDM riski en yüksek tesisler hangileri, ne yapmalı?"), L("Why are trucks driving around empty?", "Kamyonlar neden boş dolaşıyor?"), L("Which waste link should we build first?", "Hangi atık bağlantısını önce kurmalıyız?"),
  L("Is the wastewater plant at its limit?", "Arıtma tesisi sınırda mı?"), L("Open faults and recommended responses", "Açık arızalar ve önerilen müdahaleler"), L("Prepare a 5-point briefing for tomorrow morning's board meeting", "Yarın sabah yönetim kuruluna 5 maddelik brifing hazırla")];

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1fr) 360px">
      <div class="card chat"><div class="card-h"><h3>${L(`Talk to the Zone Brain`, `Bölge Beyni ile konuş`)}</h3><span class="sub" id="bst">${L(`checking status…`, `durum kontrol ediliyor…`)}</span></div>
        <div class="chips">${CHIPS.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
        <div class="chat-log" id="clog"></div>
        <div class="chat-in"><button class="mic" id="mic" title="${L(`Voice command`, `Sesli komuta`)}">🎙</button><textarea class="inp" id="cin" placeholder="${L(`Ask about the zone or give a command: 'relieve TM-3', 'turn on autopilot', 'start earthquake scenario'…`, `Bölge hakkında bir şey sor ya da komut ver: 'TM-3'ü rahatlat', 'otopilotu aç', 'deprem senaryosu başlat'…`)}"></textarea><button class="btn pri" id="csend">${L(`Send`, `Gönder`)}</button></div>
        <label class="switch mt" id="tts" style="font-size:12px"><i></i><span>${L(`Read replies aloud`, `Yanıtları sesli oku`)}</span></label></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>${L(`AI engine`, `Yapay zekâ motoru`)}</h3></div><div id="aim" style="font-size:13px"></div></div>
        <div class="card"><div class="card-h"><h3>${L(`Live insights`, `Canlı içgörüler`)}</h3><span class="sub">${L(`refreshed every 30 min`, `her 30 dk yenilenir`)}</span></div><div class="list" id="bins"></div></div></div></div>`;
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
        if (tts && window.speechSynthesis) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(r.cevap.replace(/[*_•#]/g, "").slice(0, 600)); u.lang = L("en-US", "tr-TR"); speechSynthesis.speak(u); }
      } catch (e) { hist.push({ role: "assistant", content: L("No reply: ", "Yanıt alınamadı: ") + e.message, src: L("error", "hata") }); }
      this.renderLog();
    };
    $("#csend").onclick = () => send();
    $("#cin").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
    $$(".chip").forEach((c) => c.onclick = () => send(c.textContent));
    $("#tts").onclick = () => { tts = !tts; $("#tts").classList.toggle("on", tts); };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { $("#mic").title = L("This browser does not support speech recognition (Chrome/Edge recommended)", "Bu tarayıcı ses tanımayı desteklemiyor (Chrome/Edge önerilir)"); $("#mic").style.opacity = ".4"; }
    $("#mic").onclick = () => {
      if (!SR) { ctx.toast(L("Use Chrome or Edge for speech recognition", "Ses tanıma için Chrome veya Edge kullan"), "uyari"); return; }
      const rec = new SR(); rec.lang = L("en-US", "tr-TR"); rec.interimResults = true;
      $("#mic").classList.add("on");
      rec.onresult = (e) => { const t = [...e.results].map((r) => r[0].transcript).join(" "); $("#cin").value = t; if (e.results[e.results.length - 1].isFinal) { rec.stop(); send(t); } };
      rec.onend = () => $("#mic").classList.remove("on");
      rec.onerror = () => { $("#mic").classList.remove("on"); ctx.toast(L("Microphone permission required", "Mikrofon izni gerekli"), "uyari"); };
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
    $("#bst").textContent = s.ok ? `Ollama · ${s.model}` : L("local analyst mode", "yerel analist modu");
    $("#aim").innerHTML = s.ok
      ? `<div><span class="st st-calisiyor">${L(`Ollama connected`, `Ollama bağlı`)}</span></div><div class="muted mt">${esc(s.url)}</div>
         <div class="mt"><select class="inp" id="msel" style="width:100%">${s.models.map((m) => `<option ${m === s.model ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>
         <div class="muted mt" style="font-size:12px">${L(`Fully local and free. A live summary of the zone is attached to every question.`, `Tamamen yerel ve ücretsiz. Her soruya bölgenin canlı durum özeti eklenir.`)}</div>`
      : `<div><span class="st st-ariza">${L(`Ollama not found`, `Ollama bulunamadı`)}</span></div><div class="muted mt" style="font-size:12.5px">${esc(s.error || "")}</div>
         <div class="muted mt" style="font-size:12.5px">${L(`Right now the`, `Şu an`)} <b>${L(`local analyst`, `yerel analist`)}</b> ${L(`is answering: it handles energy, carbon, logistics, waste, water and incident questions with live data. For free-form chat, run Ollama on your computer:`, `yanıt veriyor: enerji, karbon, lojistik, atık, su ve olay sorularını gerçek verilerle cevaplar. Serbest sohbet için bilgisayarında Ollama'yı çalıştır:`)}</div>
         <div class="code mt">ollama pull llama3.2</div><button class="btn sm mt" id="rchk">${L(`Retry`, `Yeniden dene`)}</button>`;
    const ms = $("#msel"); if (ms) ms.onchange = async () => { await ctx.api("/beyin/model", { model: ms.value }); this.engine(ctx); };
    const rc = $("#rchk"); if (rc) rc.onclick = () => this.engine(ctx);
  },
  renderLog() {
    const log = $("#clog");
    if (!log) return;
    log.innerHTML = hist.length ? hist.map((m) => `<div class="msg ${m.role === "user" ? "u" : "a"}">${m.role === "user" ? esc(m.content) : md(m.content)}${m.src ? `<span class="src">${esc(m.src)}</span>` : ""}</div>`).join("")
      : `<div class="msg a">${L(`Hello. I am the Zone Brain of NEXUS OSB. I watch the energy, logistics, waste, carbon, water and safety data of 30 sites in real time. Ask a question or pick one of the suggestions above.`, `Merhaba. Ben NEXUS OSB'nin Bölge Beyni'yim. 30 tesisin enerji, lojistik, atık, karbon, su ve güvenlik verisini anlık izliyorum. Bir soru sor ya da yukarıdaki önerilerden birini seç.`)}</div>`;
    log.scrollTop = log.scrollHeight;
  },
};
