import { $, $$, esc, fmt, md, sev } from "../ui.js";

const hist = [];
let tts = false;
const CHIPS = ["Summarize the zone right now — what are the 3 most urgent actions?", "Relieve TM-4", "Turn on autopilot", "How do we cut the energy bill this week?",
  "Which sites have the highest CBAM risk, and what should they do?", "Why are trucks driving around empty?", "Which waste link should we build first?",
  "Is the wastewater plant at its limit?", "Open faults and recommended responses", "Prepare a 5-point briefing for tomorrow morning's board meeting"];

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1fr) 360px">
      <div class="card chat"><div class="card-h"><h3>Talk to the Zone Brain</h3><span class="sub" id="bst">checking status…</span></div>
        <div class="chips">${CHIPS.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
        <div class="chat-log" id="clog"></div>
        <div class="chat-in"><button class="mic" id="mic" title="Voice command">🎙</button><textarea class="inp" id="cin" placeholder="Ask about the zone or give a command: 'relieve TM-3', 'turn on autopilot', 'start earthquake scenario'…"></textarea><button class="btn pri" id="csend">Send</button></div>
        <label class="switch mt" id="tts" style="font-size:12px"><i></i><span>Read replies aloud</span></label></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>AI engine</h3></div><div id="aim" style="font-size:13px"></div></div>
        <div class="card"><div class="card-h"><h3>Live insights</h3><span class="sub">refreshed every 30 min</span></div><div class="list" id="bins"></div></div></div></div>`;
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
        if (tts && window.speechSynthesis) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(r.cevap.replace(/[*_•#]/g, "").slice(0, 600)); u.lang = "en-US"; speechSynthesis.speak(u); }
      } catch (e) { hist.push({ role: "assistant", content: "No reply: " + e.message, src: "error" }); }
      this.renderLog();
    };
    $("#csend").onclick = () => send();
    $("#cin").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
    $$(".chip").forEach((c) => c.onclick = () => send(c.textContent));
    $("#tts").onclick = () => { tts = !tts; $("#tts").classList.toggle("on", tts); };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { $("#mic").title = "This browser does not support speech recognition (Chrome/Edge recommended)"; $("#mic").style.opacity = ".4"; }
    $("#mic").onclick = () => {
      if (!SR) { ctx.toast("Use Chrome or Edge for speech recognition", "uyari"); return; }
      const rec = new SR(); rec.lang = "en-US"; rec.interimResults = true;
      $("#mic").classList.add("on");
      rec.onresult = (e) => { const t = [...e.results].map((r) => r[0].transcript).join(" "); $("#cin").value = t; if (e.results[e.results.length - 1].isFinal) { rec.stop(); send(t); } };
      rec.onend = () => $("#mic").classList.remove("on");
      rec.onerror = () => { $("#mic").classList.remove("on"); ctx.toast("Microphone permission required", "uyari"); };
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
    $("#bst").textContent = s.ok ? `Ollama · ${s.model}` : "local analyst mode";
    $("#aim").innerHTML = s.ok
      ? `<div><span class="st st-calisiyor">Ollama connected</span></div><div class="muted mt">${esc(s.url)}</div>
         <div class="mt"><select class="inp" id="msel" style="width:100%">${s.models.map((m) => `<option ${m === s.model ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>
         <div class="muted mt" style="font-size:12px">Fully local and free. A live summary of the zone is attached to every question.</div>`
      : `<div><span class="st st-ariza">Ollama not found</span></div><div class="muted mt" style="font-size:12.5px">${esc(s.error || "")}</div>
         <div class="muted mt" style="font-size:12.5px">Right now the <b>local analyst</b> is answering: it handles energy, carbon, logistics, waste, water and incident questions with live data. For free-form chat, run Ollama on your computer:</div>
         <div class="code mt">ollama pull llama3.2</div><button class="btn sm mt" id="rchk">Retry</button>`;
    const ms = $("#msel"); if (ms) ms.onchange = async () => { await ctx.api("/beyin/model", { model: ms.value }); this.engine(ctx); };
    const rc = $("#rchk"); if (rc) rc.onclick = () => this.engine(ctx);
  },
  renderLog() {
    const log = $("#clog");
    if (!log) return;
    log.innerHTML = hist.length ? hist.map((m) => `<div class="msg ${m.role === "user" ? "u" : "a"}">${m.role === "user" ? esc(m.content) : md(m.content)}${m.src ? `<span class="src">${esc(m.src)}</span>` : ""}</div>`).join("")
      : `<div class="msg a">Hello. I am the Zone Brain of NEXUS OSB. I watch the energy, logistics, waste, carbon, water and safety data of 30 sites in real time. Ask a question or pick one of the suggestions above.</div>`;
    log.scrollTop = log.scrollHeight;
  },
};
