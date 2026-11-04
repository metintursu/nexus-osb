// NEXUS OSB — Presentation Mode: a self-narrating guided tour for investors / CTOs
import { h, $, esc } from "./ui.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (sel, tries = 15) => { for (let i = 0; i < tries; i++) { const el = $(sel); if (el) { el.click(); return el; } await wait(200); } };

const STEPS = [
  { p: "komuta", t: "NEXUS OSB · Industrial Zone Operating System", s: 11,
    m: "Not an operating system for one factory, but for a whole industrial zone with 30 sites. Energy, logistics, waste, carbon, water and safety on one screen. The ring on the left is the zone's live health score." },
  { p: "harita", t: "The zone, live", s: 10,
    m: "Every site, truck, technician and substation in real time. Dashed lines are symbiosis links, where one site's waste flows to another as raw material; rings are open incidents." },
  { p: "ikiz3d", t: "3D digital twin", s: 13, a: async () => { await wait(900); await click("#b-drone"); },
    m: "The same zone in three dimensions. Building height shows installed power, stack smoke shows current emissions, and roof colour shows each site's status. At night the factory lights come on." },
  { p: "enerji", t: "Shared energy: solar, battery, hydrogen", s: 11,
    m: "18 MWp of solar, a 28 MWh battery, biogas and a green hydrogen valley. The battery discharges at peak hours, and when a substation is stretched, flexible loads are shifted automatically." },
  { p: "simbiyoz", t: "Industrial symbiosis", s: 10,
    m: "Every hour the opportunity engine scans 10 waste types and scores them by distance, value, transport and pipeline investment. Waste headed for disposal becomes raw material for a neighbour." },
  { p: "muzakere", t: "Factories that talk", s: 13,
    m: "Every site has a software agent with its own personality. Agents bid in flexibility auctions, bargain over waste prices and merge half-empty trucks. Payments are made in Zone Credits." },
  { p: "otopilot", t: "Autopilot on", s: 11, a: async (ctx) => { await ctx.api("/otopilot", { aktif: true }); },
    m: "Now we turn on the autopilot. The Zone Brain scans every 10 minutes and writes each decision here with its reason. Big decisions that need investment are left for human approval." },
  { p: "evrenler", t: "Parallel universes: the proof", s: 15, a: async () => { await wait(900); const g = $("#vg"); if (g) g.value = "1"; await click("#vrun"); },
    m: "We split the same zone in two: a classic zone on the left, NEXUS autopilot on the right. We fast-forward one day with the same random events. The difference is the money and carbon the system saves the zone." },
  { p: "tahmin", t: "Seeing the future", s: 11,
    m: "The zone is copied 6 times and run 24 hours ahead. The risk calendar shows, as a percentage, at which hour each substation, the contract capacity or the wastewater plant will be under strain." },
  { p: "senaryolar", t: "Stress test: earthquake", s: 9, a: async (ctx) => { await ctx.api("/senaryolar/deprem/baslat", {}); await ctx.api("/sim", { tps: 20, paused: false }); },
    m: "Now we play out the hardest moment: an earthquake of magnitude 6 to 7. The simulation runs at 20 times speed." },
  { p: "komuta", t: "Crisis moment", s: 12,
    m: "The grid is down and the zone has switched to island mode: the battery and solar now feed only food, chemicals and wastewater treatment. Gas valves are closed, and technicians and the fire brigade are sent to damaged sites." },
  { p: "kriz", t: "Crisis Center", s: 10,
    m: "Recommended response steps and a minute-by-minute log for every incident live here. When a technician reaches the site, the Digital Master playbook shortens the downtime." },
  { p: "karbon", t: "Carbon and EU CBAM", s: 10,
    m: "Scope 1-2 and logistics emissions per site. The annual carbon cost risk for exporters covered by the EU Carbon Border Adjustment Mechanism is calculated in advance." },
  { p: "beyin", t: "Zone Brain", s: 11,
    m: "Local and free AI. It answers questions with live data and carries out commands. You can also talk to it with the microphone button: just say 'relieve TM-3'." },
  { p: "komuta", t: "NEXUS OSB", s: 9, a: async (ctx) => { await ctx.api("/senaryolar/durdur", {}); await ctx.api("/sim", { tps: 1, paused: false }); },
    m: "If Fabrika OS is the operating system of one factory, NEXUS OSB is the operating system of the city those factories live in. Thank you." },
];

let box = null;
export default async function tour(ctx) {
  if (box) return;
  let i = 0, paused = false, stop = false, voice = false, started = performance.now(), elapsed = 0;
  box = h(`<div class="tour-box"><h3><span>🎬</span><span id="tt"></span></h3><p id="tm"></p>
    <div class="tour-prog"><i id="tp" style="width:0"></i></div>
    <div class="tb"><div class="dots">${STEPS.map(() => "<i></i>").join("")}</div>
      <button class="btn sm" id="tv" title="Voice narration">🔇 Voice</button><button class="btn sm" id="tb">◀</button><button class="btn sm" id="tpz">⏸</button><button class="btn sm" id="tn">▶</button><button class="btn sm danger" id="tx">End</button></div></div>`);
  document.body.appendChild(box);
  const speak = (txt) => {
    if (!voice || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt); u.lang = "en-US"; u.rate = 1.02;
    const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith("en")); if (v) u.voice = v;
    speechSynthesis.speak(u);
  };
  const show = async (k) => {
    i = Math.max(0, Math.min(STEPS.length - 1, k));
    const s = STEPS[i];
    box.querySelector("#tt").textContent = `${i + 1}/${STEPS.length} · ${s.t}`;
    box.querySelector("#tm").textContent = s.m;
    box.querySelectorAll(".dots i").forEach((d, j) => d.classList.toggle("on", j <= i));
    started = performance.now(); elapsed = 0;
    ctx.go(s.p);
    speak(s.m);
    if (s.a) { await wait(700); try { await s.a(ctx); } catch (e) { console.warn(e); } }
  };
  box.querySelector("#tn").onclick = () => show(i + 1);
  box.querySelector("#tb").onclick = () => show(i - 1);
  box.querySelector("#tpz").onclick = (e) => { paused = !paused; e.target.textContent = paused ? "▶ Resume" : "⏸"; if (!paused) started = performance.now() - elapsed; };
  box.querySelector("#tv").onclick = (e) => { voice = !voice; e.target.textContent = voice ? "🔊 Voice" : "🔇 Voice"; if (voice) speak(STEPS[i].m); else speechSynthesis && speechSynthesis.cancel(); };
  box.querySelector("#tx").onclick = () => { stop = true; };
  await show(0);
  while (!stop) {
    await wait(100);
    if (paused) continue;
    elapsed = performance.now() - started;
    const dur = STEPS[i].s * 1000;
    box.querySelector("#tp").style.width = Math.min(100, (elapsed / dur) * 100) + "%";
    if (elapsed >= dur) { if (i === STEPS.length - 1) break; await show(i + 1); }
  }
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (stop) { try { await ctx.api("/sim", { tps: 1, paused: false }); } catch (_) {} }
  box.remove(); box = null;
}
