#!/usr/bin/env node
/* Instagram carousel generator (1080x1350 PNG) in the approved style of tools/ig-template.html:
   cover, one slide per card, closing question. Renders with the installed Chrome or Edge (headless),
   fully offline: the fonts come from fonts/.

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
   --browser <path>         Chrome/Edge, αν δεν βρίσκεται μόνο του
   --check                  μόνο έλεγχος ότι χωράει το κείμενο, χωρίς εικόνες. Χωρίς --topic/--ids ελέγχει όλες τις κάρτες.

   Αν το κείμενο δεν χωράει, μικραίνει μαζί με τον τίτλο μέχρι 36px. Αν πάλι δεν χωράει, σταματά και λέει ποια κάρτα. */
const fs = require("fs"), path = require("path"), os = require("os"), { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const { THEMES, theme: themeOf } = require("../js/themes.js");

const ROOT = path.join(__dirname, ".."), CONTENT = path.join(ROOT, "content");
const MAX_CARDS = 18; // Instagram allows 20 slides: cover + cards + closing
const MIN_TEXT = 36;  // px: body text never shrinks below this
const FLAGS = new Set(["check"]);

/* ---------------- ARGS ---------------- */
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) die(`Άγνωστη παράμετρος: ${a}`);
  if (FLAGS.has(a.slice(2))) { args[a.slice(2)] = true; continue }
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(`Η παράμετρος ${a} θέλει τιμή.`);
  args[a.slice(2)] = v; i++;
}
function die(m) { console.error(m + "\nΔες τις οδηγίες στην αρχή του tools/make-posts.js."); process.exit(1) }
const check = !!args.check;
if (!args.title && !check) die("Λείπει το --title (το κείμενο του εξωφύλλου).");
if (args.topic && args.ids) die("Δώσε είτε --topic είτε --ids, όχι και τα δύο.");
if (!args.topic && !args.ids && !check) die("Δώσε --topic ή --ids.");
args.title = args.title || "Έλεγχος";

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
  const from = Math.max(1, +(args.from || 1)), count = check && !args.count ? Infinity : +(args.count || 5);
  list = [...cards.values()].filter(c => c.topic === t).slice(from - 1, from - 1 + count);
} else if (!args.ids) {
  list = [...cards.values()];
} else {
  const ids = args.ids.split(",").map(s => s.trim()).filter(Boolean);
  const missing = ids.filter(id => !cards.has(id)); if (missing.length) die(`Δεν υπάρχουν οι κάρτες: ${missing.join(", ")}`);
  list = ids.map(id => cards.get(id));
}
if (!list.length) die("Δεν βρέθηκαν κάρτες.");
if (list.length > MAX_CARDS && !check) die(`Το Instagram δέχεται έως 20 εικόνες: έως ${MAX_CARDS} κάρτες μαζί με εξώφυλλο και κλείσιμο.`);

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
// The template's relative URLs (its @import of fonts/fonts.css) point next to tools/; make them absolute for the page in posts/.
css = css.replace(/url\("(?!data:)([^"]+)"\)/g, (m, u) => `url("${pathToFileURL(path.resolve(__dirname, decodeURIComponent(u))).href}")`);
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
<style>${css}\n${vars}\n.mid{min-height:0}</style></head><body>\n${slides.join("\n")}\n</body></html>`;

/* Shrink the title and text of a slide together until it fits, but never the body text below MIN_TEXT.
   Returns each slide's box and the slides that still overflow. */
const LAYOUT = `(async () => {
  await Promise.all(["700 100px Literata", "400 40px Commissioner", "600 40px Commissioner"].map(f => document.fonts.load(f, "Αβγ Abc 0123")));
  await document.fonts.ready;
  const loaded = new Set([...document.fonts].filter(f => f.status === "loaded").map(f => f.family.replace(/"/g, "")));
  const fonts = loaded.has("Literata") && loaded.has("Commissioner");
  const overflow = [], sizes = [];
  document.querySelectorAll(".s").forEach((s, i) => {
    const mid = s.querySelector(".mid"), els = [...mid.querySelectorAll("h1,h2,p")];
    const base = els.map(e => parseFloat(getComputedStyle(e).fontSize)), p = els.findIndex(e => e.tagName === "P");
    const kMin = ${MIN_TEXT} / (p < 0 ? 40 : base[p]);  // a slide without body text keeps the same proportion
    const over = () => mid.scrollHeight > mid.clientHeight + 1 || mid.scrollWidth > mid.clientWidth + 1;
    let k = 1;
    while (over() && k > kMin) { k = Math.max(kMin, k * .97); els.forEach((e, j) => e.style.fontSize = base[j] * k + "px") }
    sizes.push(p < 0 ? null : Math.round(base[p] * k));
    if (over()) overflow.push(i);
  });
  return { fonts, overflow, sizes, boxes: [...document.querySelectorAll(".s")].map(s => { const r = s.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } }) };
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
    "--hide-scrollbars", "--force-device-scale-factor=1", "--allow-file-access-from-files", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
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
    const { fonts, boxes, overflow, sizes } = r.result.value;
    if (!fonts) throw new Error("Δεν φορτώθηκαν οι γραμματοσειρές από το fonts/ (fonts/fonts.css και τα .woff2).");
    if (overflow.length) {
      const what = i => i === 0 ? "Το εξώφυλλο (μίκρυνε το --title ή το --subtitle)" : i === n + 1 ? "Το κλείσιμο (μίκρυνε το --question ή το --cta)"
        : `Η κάρτα «${list[i - 1].h}» (${list[i - 1].id}, ${list[i - 1].topic}, ${list[i - 1].b.length} χαρακτήρες)`;
      throw new Error(overflow.map(i => what(i) + ` δεν χωράει ούτε με κείμενο ${MIN_TEXT}px.`).join("\n") +
        `\n\n${overflow.length === 1 ? "1 εικόνα δεν χωράει" : overflow.length + " εικόνες δεν χωρούν"}. Συντόμευσε το κείμενο της κάρτας στο content/.`);
    }
    const shrunk = sizes.map((v, i) => [v, i]).filter(([v, i]) => v && v < 40 && i > 0 && i <= n);
    if (shrunk.length) console.log(shrunk.map(([v, i]) => `Μικρότερο κείμενο (${v}px): «${list[i - 1].h}» (${list[i - 1].id})`).join("\n"));
    if (check) { ws.close(); return [] }
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
  if (check) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nous-check-")), htmlFile = path.join(tmp, "check.html");
    fs.writeFileSync(htmlFile, html);
    try { await render(htmlFile, tmp) } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
    console.log(`OK: ${n === 1 ? "χωράει η κάρτα" : `χωράνε και οι ${n} κάρτες`} (κείμενο τουλάχιστον ${MIN_TEXT}px).`);
    return;
  }
  const name = args.out || `${th.slug}-${new Date().toISOString().slice(0, 10)}`;
  const outDir = path.join(ROOT, "posts", name.replace(/[^\p{L}\p{N}._-]+/gu, "-"));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const htmlFile = path.join(outDir, "carousel.html");
  fs.writeFileSync(htmlFile, html);
  let names;
  try { names = await render(htmlFile, outDir) } catch (e) { fs.rmSync(outDir, { recursive: true, force: true }); throw e }
  fs.writeFileSync(path.join(outDir, "caption.txt"), [args.title.replace(/\*+/g, ""), "",
    ...list.map((c, i) => `${i + 1}. ${c.h} (${c.title}${c.author ? ", " + c.author : ""})`), "", `#nous #${th.slug} #βιβλία #ιδέες`].join("\n") + "\n");
  console.log(`${names.length} εικόνες 1080x1350 στο ${path.relative(ROOT, outDir)}${path.sep}`);
})().catch(e => { console.error(e.message || e); process.exit(1) });
