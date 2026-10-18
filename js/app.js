/* Nous — Ideas worth keeping.
   Content lives in content/*.json (see content/index.json); progress lives in localStorage on this device. */

/* ---------------- CONTENT ---------------- */
let SRC = [], JOURNEYS = [], IDEA = {}, TOPICS = [];
async function loadContent() {
  const get = f => fetch("content/" + f).then(r => { if (!r.ok) throw new Error(f); return r.json() });
  const index = await get("index.json");
  const [files, journeys] = await Promise.all([Promise.all(index.topics.map(get)), get(index.journeys)]);
  SRC = []; IDEA = {};
  files.forEach(f => f.sources.forEach(s => {
    const src = { id: s.id, t: s.title, a: s.author || "", topic: f.topic };
    src.ideas = s.ideas.map((x, i) => ({ id: s.id + ":" + i, h: x.h, b: x.b, src }));
    src.ideas.forEach(x => IDEA[x.id] = x);
    SRC.push(src);
  }));
  TOPICS = [...new Set(SRC.map(s => s.topic))];
  JOURNEYS = journeys.map(j => ({ id: j.id, t: j.title, d: j.description, ids: j.ideas }));
}

/* ---------------- STATE ---------------- */
const MINE_SRC = { id: "mine", t: "Δικές μου σημειώσεις", a: "", topic: "Δικές μου" };
const DEF = { goal: 5, topics: [], vaults: [{ id: "v0", name: "Αγαπημένα", ids: [] }], read: {}, log: {}, mine: [], rate: 1,
  reminder: { on: false, time: "20:00" }, installHidden: false, updated: 0 };
const LS = "nous-state-v1";
let st = load();
function load() { try { const v = JSON.parse(localStorage.getItem(LS)); if (v) return Object.assign(structuredClone(DEF), v) } catch (e) {} return structuredClone(DEF) }
function changed() { st.updated = Date.now(); try { localStorage.setItem(LS, JSON.stringify(st)) } catch (e) {} mirror() }
function getIdea(id) { if (IDEA[id]) return IDEA[id]; const m = st.mine.find(m => m.id === id); return m ? { id: m.id, h: m.h, b: m.b, src: Object.assign({}, MINE_SRC, { t: m.src || MINE_SRC.t }) } : null }
function allIdeas() { return Object.values(IDEA).concat(st.mine.map(m => getIdea(m.id))) }
const isSaved = id => st.vaults.some(s => s.ids.includes(id));

/* ---------------- HELPERS ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dkey = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") };
const today = () => dkey(Date.now());
function rng(seed) { let a = 0; for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) | 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function shuffle(arr, seed) { const r = rng(seed), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
function streak() { let n = 0, t = Date.now(); if (!(st.log[today()] > 0)) t -= 864e5; while (st.log[dkey(t)] > 0) { n++; t -= 864e5 } return n }
function bestStreak() { const ks = Object.keys(st.log).filter(k => st.log[k] > 0).sort(); let best = 0, cur = 0, prev = null; ks.forEach(k => { const d = new Date(k + "T12:00:00").getTime(); cur = prev && Math.round((d - prev) / 864e5) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = d }); return best }
const readCount = () => Object.keys(st.read).length;
let toastT; function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2400) }
function markRead(id) { if (st.read[id]) return; st.read[id] = 1; const k = today(), before = st.log[k] || 0; st.log[k] = before + 1; changed(); header();
  if (before < st.goal && st.log[k] >= st.goal) toast("Πέτυχες τον στόχο της ημέρας. Σερί: " + streak() + (streak() === 1 ? " μέρα" : " μέρες")) }

/* ---------------- SPEECH ---------------- */
const synth = window.speechSynthesis || null; let voice = null, speakTok = 0, speakingId = null;
function pickVoice() { if (synth) voice = synth.getVoices().find(v => /^el/i.test(v.lang)) || null }
if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice }
function stopSpeak() { speakTok++; speakingId = null; if (synth) synth.cancel(); syncSpeakUI() }
function speak(x, onend) { if (!synth) { toast("Η ανάγνωση φωναχτά δεν υποστηρίζεται σε αυτόν τον browser."); return }
  synth.cancel(); const tok = ++speakTok; const u = new SpeechSynthesisUtterance(x.h + ". " + x.b); u.lang = "el-GR"; if (voice) u.voice = voice; u.rate = st.rate;
  u.onend = () => { if (tok !== speakTok) return; speakingId = null; syncSpeakUI(); if (onend) onend() }; speakingId = x.id; synth.speak(u); syncSpeakUI() }
function syncSpeakUI() { document.querySelectorAll('[data-act="listen"]').forEach(b => b.textContent = b.dataset.id === speakingId ? "Σταμάτα" : "Άκου");
  const r = $("#rlisten"); if (r && R.list.length) r.textContent = speakingId === R.list[R.i] ? "Σταμάτα" : "Άκου" }

/* ---------------- REMINDER ----------------
   No push server: the service worker checks on periodic background sync (installed app on Android/Chrome),
   and the open page keeps a timer for the chosen time. Both ask the worker, which decides whether to notify. */
function mirror() { KV.set("reminder", st.reminder); KV.set("day", { date: today(), count: st.log[today()] || 0, goal: st.goal, streak: streak() }) }
let remT = null;
function scheduleReminder() {
  clearTimeout(remT); if (!st.reminder.on) return;
  const [h, m] = st.reminder.time.split(":").map(Number), now = new Date(), at = new Date(now);
  at.setHours(h, m, 0, 0); if (at <= now) at.setDate(at.getDate() + 1);
  remT = setTimeout(() => { askWorker("check-reminder"); scheduleReminder() }, at - now + 500);
}
async function askWorker(type) { if (!("serviceWorker" in navigator)) return; const reg = await navigator.serviceWorker.ready; if (reg.active) reg.active.postMessage({ type }) }
async function registerPeriodic(on) {
  try { const reg = await navigator.serviceWorker.ready; if (!reg.periodicSync) return;
    if (!on) { await reg.periodicSync.unregister("nous-daily"); return }
    const p = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (p.state === "granted") await reg.periodicSync.register("nous-daily", { minInterval: 60 * 60 * 1000 });
  } catch (e) {}
}
async function setReminder(on) {
  if (on) {
    if (!("Notification" in window)) { toast("Αυτός ο browser δεν υποστηρίζει ειδοποιήσεις."); return render() }
    const p = await Notification.requestPermission();
    if (p !== "granted") { toast("Οι ειδοποιήσεις δεν επιτράπηκαν. Ενεργοποίησέ τες από τις ρυθμίσεις του browser."); return render() }
  }
  st.reminder.on = on; changed(); registerPeriodic(on); scheduleReminder(); render();
  if (on) toast("Υπενθύμιση κάθε μέρα στις " + st.reminder.time + ".");
}

/* ---------------- INSTALL ---------------- */
let installEvt = null;
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (tab === "today" || tab === "me") render() });
addEventListener("appinstalled", () => { installEvt = null; toast("Το Nous προστέθηκε στην αρχική οθόνη."); render() });
function installHTML(where) {
  if (standalone()) return where === "me" ? `<p class="hint">Το Nous τρέχει ως εφαρμογή από την αρχική οθόνη.</p>` : "";
  if (installEvt) return where === "today" && st.installHidden ? "" :
    `<section class="panel install"><p>Βάλε το Nous στην αρχική οθόνη για να ανοίγει σαν εφαρμογή και χωρίς internet.</p><div style="display:flex;gap:6px;flex:none">
     <button class="btn primary" data-act="install">Προσθήκη</button>${where === "today" ? `<button class="btn" data-act="hideinstall" aria-label="Απόκρυψη">✕</button>` : ""}</div></section>`;
  if (where === "me") return `<p class="hint">${isIOS ? "Στο iPhone: πάτα «Κοινοποίηση» και μετά «Προσθήκη στην οθόνη Αφετηρίας»." : "Στο Android: άνοιξε το μενού του Chrome (⋮) και διάλεξε «Προσθήκη στην αρχική οθόνη» ή «Εγκατάσταση εφαρμογής»."}</p>`;
  return "";
}

/* ---------------- RENDER ---------------- */
const ICONS = { today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  explore: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  paths: '<svg viewBox="0 0 24 24"><path d="M5 19c4 0 3-7 7-7s3-7 7-7"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/></svg>',
  vaults: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V7M12 17v-1.5M7 20v1M17 20v1"/></svg>',
  me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>' };
const TABS = [["today", "Σήμερα"], ["explore", "Εξερεύνηση"], ["paths", "Διαδρομές"], ["vaults", "Vaults"], ["me", "Προφίλ"]];
let tab = "today", sub = null, feedN = 12, q = "", exTopic = "Όλα", ctx = [], confirmKey = null, ready = false;
function tabFromHash() { const h = location.hash.slice(1); if (TABS.some(t => t[0] === h)) tab = h }
tabFromHash();

function header() { const t = st.log[today()] || 0; $("#hstat").innerHTML = `<span class="pill"><b>${streak()}</b> σερί</span><span class="pill"><b>${Math.min(t, st.goal)}</b>/${st.goal} σήμερα</span>` }
function navHTML() { $("#tabs").innerHTML = TABS.map(([k, l]) => `<button data-act="tab" data-tab="${k}" ${k === tab ? 'aria-current="page"' : ""}>${ICONS[k]}<span>${l}</span></button>`).join("") }

function card(x, i, extra = "") { const read = !!st.read[x.id], sv = isSaved(x.id);
  return `<article class="idea ${extra}" data-id="${esc(x.id)}" data-i="${i}">
  <div class="src"><span class="tp">${esc(x.src.topic)}</span><span>${esc(x.src.t)}${x.src.a ? " · " + esc(x.src.a) : ""}</span></div>
  <h3 data-act="open" data-i="${i}">${esc(x.h)}</h3><p data-act="open" data-i="${i}">${esc(x.b)}</p>
  <div class="acts"><button data-act="save" data-id="${esc(x.id)}" aria-pressed="${sv}">${sv ? "Κρατημένη" : "Κράτα"}</button>
  <button data-act="listen" data-id="${esc(x.id)}">${speakingId === x.id ? "Σταμάτα" : "Άκου"}</button>
  <button data-act="copy" data-id="${esc(x.id)}">Αντιγραφή</button>
  ${x.src.id !== "mine" && !(sub && sub.type === "source") ? `<button data-act="source" data-sid="${x.src.id}">Πηγή</button>` : ""}
  <span class="chk">${read ? "✓ Διαβάστηκε" : ""}</span></div></article>` }
function cards(list, startIdx = 0) { return list.map((x, i) => card(x, i + startIdx)).join("") }

function feedList() { const pool = allIdeas().filter(x => !st.topics.length || st.topics.includes(x.src.topic) || x.src.id === "mine");
  const sh = shuffle(pool, today()); return sh.filter(x => !st.read[x.id]).concat(sh.filter(x => st.read[x.id])) }

function viewToday() { const t = st.log[today()] || 0; const list = feedList();
  const daily = list.find(x => !st.read[x.id]) || list[0]; const rest = list.filter(x => x !== daily); ctx = [daily, ...rest.slice(0, feedN)];
  return `${installHTML("today")}<section class="panel goal"><div class="row"><div><div class="big">${Math.min(t, st.goal)} από ${st.goal}</div><div class="hint">ιδέες σήμερα</div></div>
   <div style="text-align:right"><div class="big">${streak()}</div><div class="hint">${streak() === 1 ? "μέρα" : "μέρες"} σερί</div></div></div>
   <div class="segs">${Array.from({ length: st.goal }, (_, i) => `<i class="${i < t ? "on" : ""}"></i>`).join("")}</div>
   <p class="hint">${t >= st.goal ? "Πέτυχες τον στόχο σου. Ό,τι διαβάσεις από εδώ είναι μπόνους." : "Μια ιδέα μετράει όταν μείνει στην οθόνη λίγα δευτερόλεπτα ή την ανοίξεις."}</p></section>
   ${!st.topics.length ? `<p class="hint">Η ροή δείχνει όλα τα θέματα. Διάλεξε τα αγαπημένα σου στο <button class="btn" data-act="tab" data-tab="me" style="padding:4px 10px">Προφίλ</button></p>` : ""}
   <h2 class="sec">Η ιδέα της ημέρας</h2>${card(daily, 0, "featured")}
   <h2 class="sec">Για σένα</h2>${cards(rest.slice(0, feedN), 1)}
   ${rest.length > feedN ? `<button class="btn" data-act="more">Δείξε περισσότερες</button>` : ""}` }

function srcStats(s) { const ids = s.ideas.map(x => x.id); const r = ids.filter(i => st.read[i]).length; return { r, n: ids.length } }
function viewExplore() {
  if (sub && sub.type === "source") { const s = SRC.find(s => s.id === sub.id); ctx = s.ideas; const { r, n } = srcStats(s);
    return `<button class="btn back" data-act="back">← Εξερεύνηση</button>
    <section class="panel"><div class="hint" style="color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:.07em;font-size:.75rem">${esc(s.topic)}</div>
    <h2 class="sec" style="margin:4px 0 2px;font-size:1.4rem">${esc(s.t)}</h2><p class="hint">${esc(s.a)} · ${r}/${n} ιδέες διαβασμένες</p>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" data-act="readall">Διάβασε όλες</button><button class="btn" data-act="listenall">Άκου όλες</button></div></section>${cards(s.ideas)}` }
  const qn = norm(q.trim());
  let html = `<input type="search" id="search" placeholder="Αναζήτηση σε ${allIdeas().length} ιδέες και ${SRC.length} πηγές" value="${esc(q)}" autocomplete="off">
   <div class="chips">${["Όλα", ...TOPICS].map(t => `<button class="chip" data-act="extopic" data-t="${esc(t)}" aria-pressed="${t === exTopic}">${esc(t)}</button>`).join("")}</div>`;
  if (qn) { const res = allIdeas().filter(x => norm(x.h + " " + x.b + " " + x.src.t + " " + x.src.a + " " + x.src.topic).includes(qn)).slice(0, 40); ctx = res;
    const srcs = SRC.filter(s => norm(s.t + " " + s.a + " " + s.topic).includes(qn));
    html += srcs.length ? `<h2 class="sec">Πηγές</h2><div class="list">${srcs.map(srcRow).join("")}</div>` : "";
    html += `<h2 class="sec">Ιδέες (${res.length})</h2>` + (res.length ? cards(res) : `<p class="empty">Δεν βρέθηκε τίποτα για «${esc(q)}».</p>`); return html }
  const ss = SRC.filter(s => exTopic === "Όλα" || s.topic === exTopic); ctx = [];
  html += `<p class="hint">${ss.length} πηγές · ${ss.reduce((a, s) => a + s.ideas.length, 0)} ιδέες</p><div class="list">${ss.map(srcRow).join("")}</div>`; return html }
function srcRow(s) { const { r, n } = srcStats(s); return `<button class="row-item" data-act="source" data-sid="${s.id}"><span class="hint" style="font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;color:var(--accent)">${esc(s.topic)}</span><span class="t">${esc(s.t)}</span>
  <span class="m"><span>${esc(s.a)}</span><span>${r}/${n}</span></span><span class="bar"><i style="width:${r / n * 100}%"></i></span></button>` }

function viewPaths() { ctx = []; return `<p class="hint">Διαδρομές: ιδέες με σειρά, που χτίζουν η μία πάνω στην άλλη.</p><div class="list">${JOURNEYS.map(j => { const ids = j.ids.filter(getIdea); const r = ids.filter(i => st.read[i]).length;
  return `<button class="row-item" data-act="journey" data-j="${j.id}"><span class="t">${esc(j.t)}</span><span class="hint">${esc(j.d)}</span><span class="m"><span>${r === ids.length ? "Ολοκληρώθηκε" : r ? "Συνέχισε" : "Ξεκίνα"}</span><span>${r}/${ids.length}</span></span><span class="bar"><i style="width:${ids.length ? r / ids.length * 100 : 0}%"></i></span></button>` }).join("")}</div>` }

function viewVaults() {
  if (sub && sub.type === "vault") { const s = st.vaults.find(s => s.id === sub.id); if (!s) { sub = null; return viewVaults() } const list = s.ids.map(getIdea).filter(Boolean); ctx = list;
    return `<button class="btn back" data-act="back">← Vaults</button><section class="panel"><h2 class="sec" style="margin:0">${esc(s.name)}</h2><p class="hint">${list.length} ιδέες</p>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${list.length ? `<button class="btn primary" data-act="readall">Διάβασε</button><button class="btn" data-act="listenall">Άκου όλες</button>` : ""}
    ${s.id !== "v0" ? `<button class="btn danger" data-act="delvault" data-sid="${s.id}">${confirmKey === "del-" + s.id ? "Πάτα ξανά για διαγραφή" : "Διαγραφή vault"}</button>` : ""}</div></section>
    ${list.length ? cards(list) : `<p class="empty">Το vault είναι άδειο. Πάτα «Κράτα» σε μια ιδέα για να την προσθέσεις εδώ.</p>`}` }
  if (sub && sub.type === "mine") { const list = st.mine.map(m => getIdea(m.id)); ctx = list;
    return `<button class="btn back" data-act="back">← Vaults</button><section class="panel"><h2 class="sec" style="margin:0">Δικές μου ιδέες</h2><p class="hint">Σημειώσεις από βιβλία, podcasts ή δικές σου σκέψεις. Εμφανίζονται και στη ροή.</p>
    <div style="margin-top:12px"><button class="btn primary" data-act="newidea">Νέα ιδέα</button></div></section>
    ${list.length ? list.map((x, i) => card(x, i) + `<button class="btn danger" data-act="delmine" data-id="${x.id}" style="align-self:flex-end;margin-top:-8px">${confirmKey === "m-" + x.id ? "Πάτα ξανά για διαγραφή" : "Διαγραφή"}</button>`).join("") : `<p class="empty">Δεν έχεις γράψει ακόμα δική σου ιδέα.</p>`}` }
  ctx = []; return `<div class="list">${st.vaults.map(s => `<button class="row-item" data-act="openvault" data-sid="${s.id}"><span class="t">${esc(s.name)}</span><span class="m"><span>Vault</span><span>${s.ids.length} ιδέες</span></span></button>`).join("")}
   <button class="row-item" data-act="openmine"><span class="t">Δικές μου ιδέες</span><span class="m"><span>Γράφεις εσύ</span><span>${st.mine.length}</span></span></button></div>
   <div class="panel"><div class="field"><label for="newvault">Νέο vault</label><div class="inline"><input type="text" id="newvault" placeholder="π.χ. Για ξαναδιάβασμα" maxlength="40"><button class="btn primary" data-act="mkvault">Δημιουργία</button></div></div></div>` }

function viewMe() { ctx = []; const days = []; for (let i = 13; i >= 0; i--) { const k = dkey(Date.now() - i * 864e5); days.push(st.log[k] || 0) } const mx = Math.max(st.goal, ...days);
  const notif = "Notification" in window, denied = notif && Notification.permission === "denied";
  return `<div class="stats"><div class="stat"><b>${streak()}</b><span>τρέχον σερί</span></div><div class="stat"><b>${bestStreak()}</b><span>καλύτερο σερί</span></div><div class="stat"><b>${readCount()}</b><span>από ${allIdeas().length} ιδέες</span></div></div>
  <section class="panel"><h2 class="sec" style="margin:0 0 8px">Τελευταίες 14 μέρες</h2><div class="hist">${days.map(d => `<div class="${d >= st.goal ? "met" : ""}" style="height:${d / mx * 100}%" title="${d}"></div>`).join("")}</div>
  <div class="hist-l"><span>πριν 2 εβδομάδες</span><span>σήμερα</span></div><p class="hint" style="margin-top:8px">Οι χρωματιστές μπάρες είναι μέρες που έπιασες τον στόχο.</p></section>
  <section class="panel"><h2 class="sec" style="margin:0 0 8px">Ημερήσιος στόχος</h2><div class="chips">${[3, 5, 10, 15].map(n => `<button class="chip" data-act="goal" data-n="${n}" aria-pressed="${st.goal === n}">${n} ιδέες</button>`).join("")}</div></section>
  <section class="panel"><h2 class="sec" style="margin:0 0 8px">Ημερήσια υπενθύμιση</h2>
   <div class="time-row"><label class="switch"><input type="checkbox" id="remon" ${st.reminder.on ? "checked" : ""} ${notif ? "" : "disabled"}> Ειδοποίηση κάθε μέρα στις</label>
   <input type="time" id="remtime" value="${esc(st.reminder.time)}" aria-label="Ώρα υπενθύμισης">${st.reminder.on ? `<button class="btn" data-act="testnotif">Δοκιμή</button>` : ""}</div>
   <p class="hint" style="margin-top:8px">${!notif ? "Αυτός ο browser δεν υποστηρίζει ειδοποιήσεις." : denied ? "Οι ειδοποιήσεις είναι μπλοκαρισμένες για το Nous. Επέτρεψέ τες από τις ρυθμίσεις του browser." :
     "Η υπενθύμιση δεν έρχεται αν έχεις ήδη πιάσει τον στόχο της ημέρας. Στο Android δουλεύει πιο αξιόπιστα όταν το Nous είναι στην αρχική οθόνη· ο browser αποφασίζει πότε ακριβώς ξυπνά την εφαρμογή, οπότε μπορεί να αργήσει λίγο."}</p></section>
  <section class="panel"><h2 class="sec" style="margin:0 0 4px">Θέματα που σε ενδιαφέρουν</h2><p class="hint" style="margin-bottom:10px">Η ροή «Σήμερα» δείχνει μόνο αυτά. Χωρίς επιλογή δείχνει όλα.</p>
  <div class="chips wrapy">${TOPICS.map(t => `<button class="chip" data-act="topic" data-t="${esc(t)}" aria-pressed="${st.topics.includes(t)}">${esc(t)}</button>`).join("")}</div></section>
  <section class="panel"><h2 class="sec" style="margin:0 0 8px">Ταχύτητα ανάγνωσης φωναχτά</h2><div class="chips">${[[0.85, "Αργή"], [1, "Κανονική"], [1.2, "Γρήγορη"]].map(([r, l]) => `<button class="chip" data-act="rate" data-r="${r}" aria-pressed="${st.rate === r}">${l}</button>`).join("")}</div>
  ${synth && !voice ? `<p class="hint" style="margin-top:8px">Δεν βρέθηκε ελληνική φωνή στη συσκευή. Πρόσθεσέ τη από τις ρυθμίσεις φωνής/κειμένου σε ομιλία.</p>` : ""}</section>
  <section class="panel"><h2 class="sec" style="margin:0 0 8px">Αρχική οθόνη</h2>${installHTML("me")}</section>
  <section class="panel"><h2 class="sec" style="margin:0 0 4px">Δεδομένα</h2><p class="hint">Η πρόοδος, τα vaults και οι ιδέες σου αποθηκεύονται μόνο σε αυτή τη συσκευή. Κράτα αντίγραφο αν αλλάξεις κινητό.</p>
  <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" data-act="export">Εξαγωγή αντιγράφου</button><button class="btn" data-act="import">Εισαγωγή</button>
  <button class="btn danger" data-act="reset">${confirmKey === "reset" ? "Πάτα ξανά: σβήνει πρόοδο και σερί" : "Μηδενισμός προόδου"}</button></div>
  <input type="file" id="importfile" accept="application/json,.json" hidden></section>` }

function render() { header(); navHTML(); const v = $("#view"); if (!ready) return;
  v.innerHTML = tab === "today" ? viewToday() : tab === "explore" ? viewExplore() : tab === "paths" ? viewPaths() : tab === "vaults" ? viewVaults() : viewMe(); observe() }

/* read tracking: a card counts once it stays mostly visible for ~2s */
let io = null; const timers = {};
function observe() { if (io) io.disconnect(); if (!("IntersectionObserver" in window)) return;
  io = new IntersectionObserver(es => es.forEach(e => { const el = e.target, id = el.dataset.id;
    if (e.isIntersecting) { timers[id] = setTimeout(() => { markRead(id); const c = el.querySelector(".chk"); if (c) c.textContent = "✓ Διαβάστηκε" }, 2000) } else clearTimeout(timers[id]) }), { threshold: .6 });
  document.querySelectorAll("#view .idea").forEach(el => io.observe(el)) }

/* ---------------- READER ---------------- */
const R = { list: [], i: 0, auto: false };
function openReader(list, i = 0, auto = false) { if (!list.length) return; R.list = list.map(x => x.id); R.i = i; R.auto = auto; $("#reader").hidden = false; document.body.style.overflow = "hidden"; showR(); if (auto) speakR() }
function showR() { const x = getIdea(R.list[R.i]);
  $("#rbody").innerHTML = `<div class="wrap"><div class="src">${esc(x.src.topic)}</div><h2>${esc(x.h)}</h2><p>${esc(x.b)}</p><div class="au">${esc(x.src.t)}${x.src.a ? " · " + esc(x.src.a) : ""}</div></div>`;
  $("#rbody").scrollTop = 0; $("#rpos").textContent = (R.i + 1) + " / " + R.list.length; const sv = isSaved(x.id); $("#rsave").textContent = sv ? "Κρατημένη" : "Κράτα"; $("#rsave").setAttribute("aria-pressed", sv);
  $("#rauto").setAttribute("aria-pressed", R.auto); syncSpeakUI(); clearTimeout(R.t); R.t = setTimeout(() => markRead(x.id), 1500) }
function stepR(d) { const n = R.i + d; if (n < 0 || n >= R.list.length) { if (n >= R.list.length) { toast("Τέλος λίστας."); if (R.auto) { R.auto = false; $("#rauto").setAttribute("aria-pressed", false) } } return false } R.i = n; showR(); return true }
function speakR() { speak(getIdea(R.list[R.i]), () => { if (R.auto && stepR(1)) setTimeout(speakR, 500) }) }
function closeR() { $("#reader").hidden = true; document.body.style.overflow = ""; R.auto = false; stopSpeak(); clearTimeout(R.t); render() }
let x0 = null; $("#rbody").addEventListener("touchstart", e => x0 = e.touches[0].clientX, { passive: true });
$("#rbody").addEventListener("touchend", e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) { stopSpeak(); R.auto = false; stepR(dx < 0 ? 1 : -1) } x0 = null });
document.addEventListener("keydown", e => { if ($("#reader").hidden) return; if (e.key === "ArrowRight") stepR(1); if (e.key === "ArrowLeft") stepR(-1); if (e.key === "Escape") closeR() });

/* ---------------- SHEETS ---------------- */
let sheetId = null;
function openSheet(html) { $("#sheet").innerHTML = html; $("#scrim").hidden = false }
function closeSheet() { $("#scrim").hidden = true; sheetId = null }
$("#scrim").addEventListener("click", e => { if (e.target.id === "scrim") closeSheet() });
function saveSheet(id) { sheetId = id; const x = getIdea(id);
  openSheet(`<h3>Κράτα σε vault</h3><p class="hint">${esc(x.h)}</p>${st.vaults.map(s => `<button class="stash-opt" data-act="togvault" data-sid="${s.id}" aria-pressed="${s.ids.includes(id)}"><span>${esc(s.name)}</span><span>${s.ids.includes(id) ? "✓" : "+"}</span></button>`).join("")}
  <div class="inline"><input type="text" id="sheetnew" placeholder="Νέο vault" maxlength="40"><button class="btn" data-act="sheetmk">Προσθήκη</button></div><button class="btn primary" data-act="closesheet">Τέλος</button>`) }

/* ---------------- ACTIONS ---------------- */
function refreshSaved() { if (!$("#reader").hidden) showR(); document.querySelectorAll('[data-act="save"]').forEach(b => { const s = isSaved(b.dataset.id); b.setAttribute("aria-pressed", s); b.textContent = s ? "Κρατημένη" : "Κράτα" }) }
function go(t) { tab = t; try { history.replaceState(null, "", "#" + t) } catch (e) {} }
const A = {
  tab: b => { go(b.dataset.tab); sub = null; confirmKey = null; stopSpeak(); render(); scrollTo(0, 0) },
  more: () => { feedN += 12; render() },
  open: b => openReader(ctx, +b.dataset.i),
  save: b => saveSheet(b.dataset.id),
  rsave: () => saveSheet(R.list[R.i]),
  togvault: b => { const s = st.vaults.find(s => s.id === b.dataset.sid); const k = s.ids.indexOf(sheetId); k < 0 ? s.ids.unshift(sheetId) : s.ids.splice(k, 1); changed(); saveSheet(sheetId); refreshSaved() },
  sheetmk: () => { const v = $("#sheetnew").value.trim(); if (!v) return; st.vaults.push({ id: "v" + Date.now(), name: v, ids: [sheetId] }); changed(); saveSheet(sheetId); refreshSaved() },
  closesheet: () => { closeSheet(); if (tab === "vaults") render() },
  listen: b => { const x = getIdea(b.dataset.id); if (speakingId === x.id) stopSpeak(); else { speak(x); markRead(x.id) } },
  copy: async b => { const x = getIdea(b.dataset.id); const txt = x.h + "\n\n" + x.b + "\n\n— " + x.src.t + (x.src.a ? ", " + x.src.a : ""); try { await navigator.clipboard.writeText(txt); toast("Αντιγράφηκε.") } catch (e) { toast("Ο browser δεν επέτρεψε την αντιγραφή.") } },
  source: b => { go("explore"); sub = { type: "source", id: b.dataset.sid }; render(); scrollTo(0, 0) },
  back: () => { sub = null; confirmKey = null; render(); scrollTo(0, 0) },
  extopic: b => { exTopic = b.dataset.t; render() },
  readall: () => openReader(ctx, 0),
  listenall: () => openReader(ctx, 0, true),
  journey: b => { const j = JOURNEYS.find(j => j.id === b.dataset.j); const list = j.ids.map(getIdea).filter(Boolean); const f = list.findIndex(x => !st.read[x.id]); openReader(list, f < 0 ? 0 : f) },
  openvault: b => { sub = { type: "vault", id: b.dataset.sid }; render(); scrollTo(0, 0) },
  openmine: () => { sub = { type: "mine" }; render(); scrollTo(0, 0) },
  mkvault: () => { const v = $("#newvault").value.trim(); if (!v) { toast("Γράψε ένα όνομα για το vault."); return } st.vaults.push({ id: "v" + Date.now(), name: v, ids: [] }); changed(); render(); toast("Δημιουργήθηκε το vault «" + v + "».") },
  delvault: b => { const k = "del-" + b.dataset.sid; if (confirmKey !== k) { confirmKey = k; render(); return } st.vaults = st.vaults.filter(s => s.id !== b.dataset.sid); confirmKey = null; sub = null; changed(); render(); toast("Το vault διαγράφηκε.") },
  newidea: () => openSheet(`<h3>Νέα ιδέα</h3><div class="field"><label for="ni-h">Τίτλος</label><input type="text" id="ni-h" maxlength="90"></div>
   <div class="field"><label for="ni-b">Η ιδέα με δικά σου λόγια</label><textarea id="ni-b" maxlength="900"></textarea></div>
   <div class="field"><label for="ni-s">Πηγή (προαιρετικό)</label><input type="text" id="ni-s" maxlength="90" placeholder="Βιβλίο, podcast, άνθρωπος"></div>
   <div class="inline"><button class="btn" data-act="closesheet">Άκυρο</button><button class="btn primary" data-act="saveidea">Αποθήκευση</button></div>`),
  saveidea: () => { const h = $("#ni-h").value.trim(), b = $("#ni-b").value.trim(); if (!h || !b) { toast("Χρειάζονται τίτλος και κείμενο."); return }
    st.mine.unshift({ id: "u-" + Date.now(), h, b, src: $("#ni-s").value.trim() }); changed(); closeSheet(); render(); toast("Η ιδέα αποθηκεύτηκε.") },
  delmine: b => { const k = "m-" + b.dataset.id; if (confirmKey !== k) { confirmKey = k; render(); return } st.mine = st.mine.filter(m => m.id !== b.dataset.id); st.vaults.forEach(s => s.ids = s.ids.filter(i => i !== b.dataset.id)); confirmKey = null; changed(); render() },
  goal: b => { st.goal = +b.dataset.n; changed(); render() },
  topic: b => { const t = b.dataset.t, k = st.topics.indexOf(t); k < 0 ? st.topics.push(t) : st.topics.splice(k, 1); feedN = 12; changed(); render() },
  rate: b => { st.rate = +b.dataset.r; changed(); render() },
  testnotif: () => askWorker("test-notification"),
  install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; render() },
  hideinstall: () => { st.installHidden = true; changed(); render() },
  export: () => { const blob = new Blob([JSON.stringify(st, null, 2)], { type: "application/json" }); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "nous-" + today() + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) },
  import: () => $("#importfile").click(),
  reset: () => { if (confirmKey !== "reset") { confirmKey = "reset"; render(); return } st.read = {}; st.log = {}; confirmKey = null; changed(); render(); toast("Η πρόοδος μηδενίστηκε.") },
  rclose: closeR, rprev: () => { stopSpeak(); R.auto = false; stepR(-1) }, rnext: () => { stopSpeak(); R.auto = false; stepR(1) },
  rlisten: () => { if (speakingId === R.list[R.i]) { stopSpeak(); R.auto = false; $("#rauto").setAttribute("aria-pressed", false) } else speakR() },
  rauto: () => { R.auto = !R.auto; $("#rauto").setAttribute("aria-pressed", R.auto); if (R.auto) speakR(); else stopSpeak() },
};
document.addEventListener("click", e => { const b = e.target.closest("[data-act]"); if (!b) return; const f = A[b.dataset.act]; if (f) f(b) });
document.addEventListener("input", e => { if (e.target.id === "search") { q = e.target.value; const pos = e.target.selectionStart; render(); const s = $("#search"); s.focus(); try { s.setSelectionRange(pos, pos) } catch (_) {} } });
document.addEventListener("change", async e => {
  if (e.target.id === "remon") setReminder(e.target.checked);
  if (e.target.id === "remtime" && e.target.value) { st.reminder.time = e.target.value; changed(); scheduleReminder(); if (st.reminder.on) toast("Υπενθύμιση κάθε μέρα στις " + st.reminder.time + ".") }
  if (e.target.id === "importfile" && e.target.files[0]) {
    try { const v = JSON.parse(await e.target.files[0].text()); if (!v || typeof v.read !== "object" || !Array.isArray(v.vaults)) throw 0;
      st = Object.assign(structuredClone(DEF), v); changed(); scheduleReminder(); render(); toast("Το αντίγραφο φορτώθηκε.") } catch (_) { toast("Το αρχείο δεν είναι αντίγραφο του Nous.") }
  }
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "newvault") A.mkvault(); if (e.key === "Enter" && e.target.id === "sheetnew") A.sheetmk() });
addEventListener("hashchange", () => { tabFromHash(); sub = null; render() });

/* ---------------- START ---------------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
loadContent().then(() => { ready = true; mirror(); scheduleReminder(); if (st.reminder.on) registerPeriodic(true); render() })
  .catch(() => { $("#view").innerHTML = `<p class="empty">Δεν φορτώθηκαν οι ιδέες. Έλεγξε τη σύνδεση και άνοιξε ξανά την εφαρμογή.</p>` });
