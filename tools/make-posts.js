#!/usr/bin/env node
/* Instagram carousel generator (1080x1350 PNG) in the approved style of tools/ig-template.html:
   cover, one slide per card, closing question. Renders with the installed Chrome or Edge (headless).

   node tools/make-posts.js --topic Στωικισμός --title "Τρεις στωικές ιδέες για να *μη σε αγχώνει* ό,τι δεν ελέγχεις"
   node tools/make-posts.js --ids enchiridion-ti-exartatai-apo-sena,meditations-to-empodio-ginetai-dromos --title "..."

   --topic <όνομα ή slug>   κάρτες ενός θέματος (με --count, προεπιλογή 5, και --from, προεπιλογή 1)
   --ids a,b,c              συγκεκριμένες κάρτες, με αυτή τη σειρά
   --title "..."            κείμενο εξωφύλλου (υποχρεωτικό). *λέξεις* = έμφαση με το χρώμα του θέματος
   --subtitle "..."         γραμμή κάτω από τον τίτλο (προεπιλογή: τα βιβλία των καρτών). **λέξεις** = έντονα
   --question "..."         ερώτηση κλεισίματος (προεπιλογή: «Ποια από τις N *χρειαζόσουν* σήμερα;»)
   --cta "..."              κείμενο κάτω από την ερώτηση (προεπιλογή: «Γράψε 1, 2 ή 3 στα σχόλια.»)
   --theme <θέμα>           χρώμα του carousel (προεπιλογή: το θέμα της πρώτης κάρτας)
   --out <φάκελος>          όνομα φακέλου μέσα στο posts/ (προεπιλογή: <θέμα>-<ημερομηνία>)
   --browser <path>         Chrome/Edge, αν δεν βρίσκεται μόνο του */
const fs = require("fs"), path = require("path"), os = require("os"), { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const { THEMES, theme: themeOf } = require("../js/themes.js");

const ROOT = path.join(__dirname, ".."), CONTENT = path.join(ROOT, "content");
const MAX_CARDS = 18; // Instagram allows 20 slides: cover + cards + closing

/* ---------------- ARGS ---------------- */
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) die(`Άγνωστη παράμετρος: ${a}`);
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(`Η παράμετρος ${a} θέλει τιμή.`);
  args[a.slice(2)] = v; i++;
}
function die(m) { console.error(m + "\nΔες τις οδηγίες στην αρχή του tools/make-posts.js."); process.exit(1) }
if (!args.title) die("Λείπει το --title (το κείμενο του εξωφύλλου).");
if (!args.topic === !args.ids) die("Δώσε είτε --topic είτε --ids.");

/* ---------------- CONTENT ---------------- */
const index = JSON.parse(fs.readFileSync(path.join(CONTENT, "index.json"), "utf8"));
const cards = new Map(), topics = [];
for (const f of index.topics) {
  const d = JSON.parse(fs.readFileSync(path.join(CONTENT, f), "utf8"));
  topics.push(d.topic);
  for (const s of d.sources) for (const x of s.ideas) cards.set(x.id, { ...x, topic: d.topic, title: s.title, author: s.author || "" });
}
const findTopic = q => topics.find(t => t === q || (THEMES[t] && THEMES[t].slug === q) || norm(t) === norm(q));
const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

let list;
if (args.topic) {
  const t = findTopic(args.topic); if (!t) die(`Δεν υπάρχει θέμα «${args.topic}». Θέματα: ${topics.join(", ")}`);
  const from = Math.max(1, +(args.from || 1)), count = +(args.count || 5);
  list = [...cards.values()].filter(c => c.topic === t).slice(from - 1, from - 1 + count);
} else {
  const ids = args.ids.split(",").map(s => s.trim()).filter(Boolean);
  const missing = ids.filter(id => !cards.has(id)); if (missing.length) die(`Δεν υπάρχουν οι κάρτες: ${missing.join(", ")}`);
  list = ids.map(id => cards.get(id));
}
if (!list.length) die("Δεν βρέθηκαν κάρτες.");
if (list.length > MAX_CARDS) die(`Το Instagram δέχεται έως 20 εικόνες: έως ${MAX_CARDS} κάρτες μαζί με εξώφυλλο και κλείσιμο.`);

const mainTopic = args.theme ? (findTopic(args.theme) || die(`Δεν υπάρχει θέμα «${args.theme}».`)) : list[0].topic;
const th = themeOf(mainTopic), n = list.length;

/* ---------------- TEXT ---------------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<em>$1</em>");
const pad = i => String(i).padStart(2, "0");
const WORDS = { 2: "δύο", 3: "τρεις", 4: "τέσσερις", 5: "πέντε", 6: "έξι", 7: "επτά", 8: "οκτώ", 9: "εννέα", 10: "δέκα" };
const books = [...new Map(list.map(c => [c.title, c])).values()];
const subtitle = args.subtitle ? rich(args.subtitle)
  : books.length <= 3 ? "Από " + books.map(c => `<b>${esc(c.title)}</b>${c.author ? " · " + esc(c.author) : ""}`).join(", ")
  : `Από ${books.length} βιβλία`;
const question = args.question ? rich(args.question)
  : n === 1 ? "Τη <em>χρειαζόσουν</em> σήμερα;" : `Ποια από τις ${WORDS[n] || n} <em>χρειαζόσουν</em> σήμερα;`;
const cta = esc(args.cta || (n === 1 ? "Γράψε ναι ή όχι στα σχόλια." : n <= 3 ? `Γράψε ${[...Array(n)].map((_, i) => i + 1).join(n === 2 ? " ή " : ", ").replace(/, (\d)$/, " ή $1")} στα σχόλια.` : `Γράψε τον αριθμό της (1–${n}) στα σχόλια.`));

/* ---------------- HTML (template CSS + slides in the template's markup) ---------------- */
const TEMPLATE = path.join(__dirname, "ig-template.html");
let css = fs.readFileSync(TEMPLATE, "utf8").match(/<style>([\s\S]*?)<\/style>/)[1];
// Template fonts: keep its local files if they exist, fall back to Google Fonts with the same families.
css = css.replace(/url\("(?!data:)([^"]+)"\)/g, (m, u) => `url("${pathToFileURL(path.resolve(__dirname, decodeURIComponent(u))).href}")`)
  .replace(/font-family:Lit\b/g, "font-family:Lit,Literata").replace(/font-family:Com\b/g, "font-family:Com,Commissioner");
const vars = `.th{--bg:${th.dark.bg};--fg:${th.dark.fg};--ac:${th.dark.ac};--mu:${th.dark.mu};--ln:${th.dark.ln}}`;

const slide = (top, count, big, mid, foot) => `<div class="s th grain"><div class="top"><span class="tp">${top}</span><span class="ct">${count}</span></div>
  ${big ? `<div class="big">${big}</div>` : ""}<div class="mid">${mid}</div>
  <div class="foot"><span class="mark">nous<i>.</i></span>${foot}</div></div>`;
const slides = [
  slide(esc(mainTopic), `Carousel · ${n} ${n === 1 ? "ιδέα" : "ιδέες"}`, n, `<div class="rule"></div><h1>${rich(args.title)}</h1><div class="src">${subtitle}</div>`, `<span class="swipe">Σύρε →</span>`),
  ...list.map((c, i) => slide(esc(c.topic), `${pad(i + 1)} / ${pad(n)}`, pad(i + 1),
    `<h2>${esc(c.h)}</h2><p>${esc(c.b)}</p><div class="src"><b>${esc(c.title)}</b>${c.author ? " · " + esc(c.author) : ""}</div>`, `<span class="tip">Ideas worth keeping</span>`)),
  slide("nous", "", "", `<h1>${question}</h1><p>${cta}</p><div class="save"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>Κράτα το για αργότερα</div>`,
    `<span class="tip">${cards.size} ιδέες · link στο bio</span>`),
];
const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400..700&family=Commissioner:wght@400..700&display=block">
<style>${css}\n${vars}\n.mid{min-height:0}</style></head><body>\n${slides.join("\n")}\n</body></html>`;

/* Shrink text that would overflow a slide, then report each slide's box. */
const LAYOUT = `(async () => {
  await Promise.all(["700 100px Literata", "400 40px Commissioner", "600 40px Commissioner"].map(f => document.fonts.load(f, "Αβγ Abc 0123")));
  await document.fonts.ready;
  const fonts = document.fonts.check("700 100px Literata", "Α") && document.fonts.check("400 40px Commissioner", "Α");
  for (const s of document.querySelectorAll(".s")) {
    const mid = s.querySelector(".mid"), els = [...mid.querySelectorAll("h1,h2,p")];
    for (let k = 0; k < 30 && mid.scrollHeight > mid.clientHeight + 1; k++)
      els.forEach(e => e.style.fontSize = parseFloat(getComputedStyle(e).fontSize) * .96 + "px");
  }
  return { fonts, boxes: [...document.querySelectorAll(".s")].map(s => { const r = s.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } }) };
})()`;

/* ---------------- RENDER (Chrome DevTools Protocol) ---------------- */
function findBrowser() {
  const c = [args.browser, process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return c.find(p => p && fs.existsSync(p)) || die("Δεν βρέθηκε Chrome ή Edge. Δώσε τη διαδρομή με --browser.");
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function render(htmlFile, outDir) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nous-posts-"));
  const proc = spawn(findBrowser(), ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--hide-scrollbars", "--force-device-scale-factor=1", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  try {
    let port;
    for (let i = 0; i < 100 && !port; i++) { try { port = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0] } catch (e) { await sleep(100) } }
    if (!port) throw new Error("Ο browser δεν ξεκίνησε.");
    const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page");
    const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej });
    let seq = 0; const waiting = new Map(), events = [];
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id) } else if (d.method) events.push(d.method) };
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, d => d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result)); ws.send(JSON.stringify({ id, method, params })) });

    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 1500, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pathToFileURL(htmlFile).href });
    for (let i = 0; i < 300 && !events.includes("Page.loadEventFired"); i++) await sleep(50);
    const r = await send("Runtime.evaluate", { expression: LAYOUT, awaitPromise: true, returnByValue: true });
    const { fonts, boxes } = r.result.value;
    if (!fonts) console.warn("Προσοχή: δεν φορτώθηκαν οι γραμματοσειρές Literata/Commissioner (internet;). Οι εικόνες βγήκαν με εναλλακτική γραμματοσειρά.");
    const names = ["01-cover", ...list.map((_, i) => pad(i + 2)), pad(n + 2) + "-close"];
    for (let i = 0; i < boxes.length; i++) {
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...boxes[i], scale: 1 } });
      fs.writeFileSync(path.join(outDir, names[i] + ".png"), Buffer.from(shot.data, "base64"));
    }
    ws.close();
    return names;
  } finally {
    proc.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }) } catch (e) {}
  }
}

(async () => {
  const name = args.out || `${th.slug}-${new Date().toISOString().slice(0, 10)}`;
  const outDir = path.join(ROOT, "posts", name.replace(/[^\p{L}\p{N}._-]+/gu, "-"));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const htmlFile = path.join(outDir, "carousel.html");
  fs.writeFileSync(htmlFile, html);
  const names = await render(htmlFile, outDir);
  fs.writeFileSync(path.join(outDir, "caption.txt"), [args.title.replace(/\*+/g, ""), "",
    ...list.map((c, i) => `${i + 1}. ${c.h} (${c.title}${c.author ? ", " + c.author : ""})`), "", `#nous #${th.slug} #βιβλία #ιδέες`].join("\n") + "\n");
  console.log(`${names.length} εικόνες 1080x1350 στο ${path.relative(ROOT, outDir)}${path.sep}`);
})().catch(e => { console.error(e.message || e); process.exit(1) });
