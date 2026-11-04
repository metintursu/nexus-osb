// NEXUS OSB — Presentation Mode: a self-narrating guided tour for investors / CTOs
import { h, $, esc } from "./ui.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (sel, tries = 15) => { for (let i = 0; i < tries; i++) { const el = $(sel); if (el) { el.click(); return el; } await wait(200); } };

const STEPS = [
  { p: "komuta", t: L("NEXUS OSB · Industrial Zone Operating System", "NEXUS OSB · Sanayi Bölgesi İşletim Sistemi"), s: 11,
    m: L("Not an operating system for one factory, but for a whole industrial zone with 30 sites. Energy, logistics, waste, carbon, water and safety on one screen. The ring on the left is the zone's live health score.", "Tek bir fabrikayı değil, 30 tesisli bütün bir organize sanayi bölgesini yöneten işletim sistemi. Enerji, lojistik, atık, karbon, su ve güvenlik tek ekranda. Soldaki halka bölgenin anlık sağlık skoru.") },
  { p: "harita", t: L("The zone, live", "Bölge canlı"), s: 10,
    m: L("Every site, truck, technician and substation in real time. Dashed lines are symbiosis links, where one site's waste flows to another as raw material; rings are open incidents.", "Her tesis, kamyon, usta ve trafo gerçek zamanlı. Kesikli çizgiler bir tesisin atığının diğerine hammadde olarak aktığı simbiyoz hatları; halkalar açık olaylar.") },
  { p: "ikiz3d", t: L("3D digital twin", "3D dijital ikiz"), s: 13, a: async () => { await wait(900); await click("#b-drone"); },
    m: L("The same zone in three dimensions. Building height shows installed power, stack smoke shows current emissions, and roof colour shows each site's status. At night the factory lights come on.", "Aynı bölge üç boyutta. Bina yüksekliği kurulu gücü, baca dumanı anlık emisyonu, çatı rengi tesisin durumunu gösteriyor. Gece olunca fabrika ışıkları yanıyor.") },
  { p: "enerji", t: L("Shared energy: solar, battery, hydrogen", "Ortak enerji: GES, batarya, hidrojen"), s: 11,
    m: L("18 MWp of solar, a 28 MWh battery, biogas and a green hydrogen valley. The battery discharges at peak hours, and when a substation is stretched, flexible loads are shifted automatically.", "18 MWp güneş, 28 MWh batarya, biyogaz ve yeşil hidrojen vadisi. Batarya puant saatlerinde deşarj olur, trafo sıkışınca esnek yükler otomatik kaydırılır.") },
  { p: "simbiyoz", t: L("Industrial symbiosis", "Endüstriyel simbiyoz"), s: 10,
    m: L("Every hour the opportunity engine scans 10 waste types and scores them by distance, value, transport and pipeline investment. Waste headed for disposal becomes raw material for a neighbour.", "Fırsat motoru her saat 10 atık türünü tarar: mesafe, değer, taşıma ve boru hattı yatırımıyla puanlar. Bertarafa gidecek atık, komşu tesise hammadde olur.") },
  { p: "muzakere", t: L("Factories that talk", "Konuşan fabrikalar"), s: 13,
    m: L("Every site has a software agent with its own personality. Agents bid in flexibility auctions, bargain over waste prices and merge half-empty trucks. Payments are made in Zone Credits.", "Her tesisin kişilikli bir yazılım ajanı var. Ajanlar esneklik ihalesinde teklif veriyor, atık fiyatında pazarlık ediyor, yarı boş kamyonları birleştiriyor. Ödemeler OSB Kredisi ile.") },
  { p: "otopilot", t: L("Autopilot on", "Otopilot devrede"), s: 11, a: async (ctx) => { await ctx.api("/otopilot", { aktif: true }); },
    m: L("Now we turn on the autopilot. The Zone Brain scans every 10 minutes and writes each decision here with its reason. Big decisions that need investment are left for human approval.", "Şimdi otopilotu açıyoruz. Bölge Beyni her 10 dakikada bir tarıyor ve kararlarını gerekçesiyle buraya yazıyor. Yatırım gerektiren büyük kararlar insan onayına kalıyor.") },
  { p: "evrenler", t: L("Parallel universes: the proof", "Paralel evrenler: kanıt"), s: 15, a: async () => { await wait(900); const g = $("#vg"); if (g) g.value = "1"; await click("#vrun"); },
    m: L("We split the same zone in two: a classic zone on the left, NEXUS autopilot on the right. We fast-forward one day with the same random events. The difference is the money and carbon the system saves the zone.", "Aynı bölgeyi ikiye ayırıyoruz: solda klasik OSB, sağda NEXUS otopilot. Aynı rastlantılarla bir gün ileri sarıyoruz. Aradaki fark, sistemin bölgeye kazandırdığı para ve karbon.") },
  { p: "tahmin", t: L("Seeing the future", "Geleceği görmek"), s: 11,
    m: L("The zone is copied 6 times and run 24 hours ahead. The risk calendar shows, as a percentage, at which hour each substation, the contract capacity or the wastewater plant will be under strain.", "Bölge 6 kez kopyalanıp 24 saat ileri koşturuluyor. Risk takvimi hangi saatte hangi trafonun, sözleşme gücünün veya arıtmanın zorlanacağını yüzde olarak gösteriyor.") },
  { p: "senaryolar", t: L("Stress test: earthquake", "Stres testi: deprem"), s: 9, a: async (ctx) => { await ctx.api("/senaryolar/deprem/baslat", {}); await ctx.api("/sim", { tps: 20, paused: false }); },
    m: L("Now we play out the hardest moment: an earthquake of magnitude 6 to 7. The simulation runs at 20 times speed.", "Şimdi en zor ânı canlandırıyoruz: büyüklüğü 6 ile 7 arasında bir deprem. Simülasyon 20 kat hızda.") },
  { p: "komuta", t: L("Crisis moment", "Kriz anı"), s: 12,
    m: L("The grid is down and the zone has switched to island mode: the battery and solar now feed only food, chemicals and wastewater treatment. Gas valves are closed, and technicians and the fire brigade are sent to damaged sites.", "Şebeke kesildi, bölge ada moduna geçti: batarya ve güneş yalnızca gıda, kimya ve arıtmayı besliyor. Doğalgaz vanaları kapandı, hasarlı tesislere ustalar ve itfaiye yönlendirildi.") },
  { p: "kriz", t: L("Crisis Center", "Kriz Merkezi"), s: 10,
    m: L("Recommended response steps and a minute-by-minute log for every incident live here. When a technician reaches the site, the Digital Master playbook shortens the downtime.", "Her olayın önerilen müdahale adımları ve dakika dakika kaydı burada. Usta olay yerine varınca Dijital Usta reçetesiyle duruşu kısaltıyor.") },
  { p: "karbon", t: L("Carbon and EU CBAM", "Karbon ve AB SKDM"), s: 10,
    m: L("Scope 1-2 and logistics emissions per site. The annual carbon cost risk for exporters covered by the EU Carbon Border Adjustment Mechanism is calculated in advance.", "Kapsam 1-2 ve lojistik emisyonu tesis bazında. AB Sınırda Karbon Düzenlemesi kapsamındaki ihracatçıların yıllık karbon bedeli riski önceden hesaplanıyor.") },
  { p: "beyin", t: L("Zone Brain", "Bölge Beyni"), s: 11,
    m: L("Local and free AI. It answers questions with live data and carries out commands. You can also talk to it with the microphone button: just say 'relieve TM-3'.", "Yerel ve ücretsiz yapay zekâ. Sorulara canlı veriyle cevap veriyor, komutları uyguluyor. Mikrofon tuşuyla sesli de konuşulabilir: 'TM-3'ü rahatlat' demek yeterli.") },
  { p: "komuta", t: "NEXUS OSB", s: 9, a: async (ctx) => { await ctx.api("/senaryolar/durdur", {}); await ctx.api("/sim", { tps: 1, paused: false }); },
    m: L("If Fabrika OS is the operating system of one factory, NEXUS OSB is the operating system of the city those factories live in. Thank you.", "Fabrika OS bir fabrikanın işletim sistemiyse, NEXUS OSB o fabrikaların yaşadığı şehrin işletim sistemi. Teşekkürler.") },
];

let box = null;
export default async function tour(ctx) {
  if (box) return;
  let i = 0, paused = false, stop = false, voice = false, started = performance.now(), elapsed = 0;
  box = h(`<div class="tour-box"><h3><span>🎬</span><span id="tt"></span></h3><p id="tm"></p>
    <div class="tour-prog"><i id="tp" style="width:0"></i></div>
    <div class="tb"><div class="dots">${STEPS.map(() => "<i></i>").join("")}</div>
      <button class="btn sm" id="tv" title="${L(`Voice narration`, `Sesli anlatım`)}">${L(`🔇 Voice`, `🔇 Ses`)}</button><button class="btn sm" id="tb">◀</button><button class="btn sm" id="tpz">⏸</button><button class="btn sm" id="tn">▶</button><button class="btn sm danger" id="tx">${L(`End`, `Bitir`)}</button></div></div>`);
  document.body.appendChild(box);
  const speak = (txt) => {
    if (!voice || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt); u.lang = L("en-US", "tr-TR"); u.rate = 1.02;
    const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith(L("en", "tr"))); if (v) u.voice = v;
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
  box.querySelector("#tpz").onclick = (e) => { paused = !paused; e.target.textContent = paused ? L("▶ Resume", "▶ Devam") : "⏸"; if (!paused) started = performance.now() - elapsed; };
  box.querySelector("#tv").onclick = (e) => { voice = !voice; e.target.textContent = voice ? L("🔊 Voice", "🔊 Ses") : L("🔇 Voice", "🔇 Ses"); if (voice) speak(STEPS[i].m); else speechSynthesis && speechSynthesis.cancel(); };
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
