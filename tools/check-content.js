#!/usr/bin/env node
/* Checks content/: every topic file listed in index.json, required fields, unique source ids,
   a unique stable id on every card, and that journeys and the legacy map point at cards that exist.
   content/published-ids.json records every card id ever published: none may disappear from the content
   unless it is listed under "retired". When the check passes, new ids are added to that list.
   Every topic also needs a colour theme in js/themes.js with readable contrast in light and dark mode.
   Usage: node tools/check-content.js [--dry-run]   (--dry-run: check only, never write the list) */
const fs = require("fs"), path = require("path");
const { THEMES, contrast } = require("../js/themes.js");
const dir = path.join(__dirname, "..", "content");
const PUBLISHED = "published-ids.json";
const dryRun = process.argv.includes("--dry-run");
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const errors = [], ids = new Map(), srcIds = new Set();
const index = read("index.json");

const special = new Set(["index.json", index.journeys, index.legacy, PUBLISHED]);
const onDisk = fs.readdirSync(dir).filter(f => f.endsWith(".json") && !special.has(f));
for (const f of onDisk) if (!index.topics.includes(f)) errors.push(`${f} υπάρχει αλλά λείπει από το index.json`);

/* Text needs 7:1 against its background; accent and secondary text need 4.5:1 (WCAG AA/AAA). */
function checkTheme(f, topic) {
  const t = THEMES[topic];
  if (!t) { errors.push(`${f}: το θέμα «${topic}» δεν έχει χρώματα στο js/themes.js`); return }
  for (const mode of ["light", "dark"]) for (const [k, min] of [["fg", 7], ["ac", 4.5], ["mu", 4.5]]) {
    const c = contrast(t[mode][k], t[mode].bg);
    if (c < min) errors.push(`js/themes.js: «${topic}» (${mode}) ${k} έχει αντίθεση ${c.toFixed(2)}:1, χρειάζεται ${min}:1`);
  }
}

for (const f of index.topics) {
  let data; try { data = read(f) } catch (e) { errors.push(`${f}: ${e.message}`); continue }
  if (!data.topic) errors.push(`${f}: λείπει το "topic"`); else checkTheme(f, data.topic);
  for (const s of data.sources || []) {
    if (!s.id || !s.title) errors.push(`${f}: πηγή χωρίς id ή title`);
    if (srcIds.has(s.id)) errors.push(`${f}: διπλό id πηγής "${s.id}"`);
    srcIds.add(s.id);
    (s.ideas || []).forEach((x, i) => {
      const where = `${f}: πηγή "${s.id}", κάρτα #${i + 1}${x.h ? ` («${x.h}»)` : ""}`;
      if (typeof x.id !== "string" || !x.id.trim()) errors.push(`${where}: λείπει το id`);
      else if (!ID.test(x.id)) errors.push(`${where}: μη έγκυρο id "${x.id}" (μόνο πεζά λατινικά, αριθμοί και παύλες)`);
      else if (ids.has(x.id)) errors.push(`${where}: διπλό id "${x.id}" (υπάρχει ήδη στο ${ids.get(x.id)})`);
      else ids.set(x.id, f);
      if (!x.h || !x.b) errors.push(`${where}: λείπει τίτλος (h) ή κείμενο (b)`);
    });
  }
}

/* Published ids: each must still be in the content, or be retired on purpose. */
const firstRun = !fs.existsSync(path.join(dir, PUBLISHED));
let pub = { published: [], retired: {} };
if (!firstRun) {
  try { pub = read(PUBLISHED) } catch (e) { errors.push(`${PUBLISHED}: ${e.message}`) }
  if (!Array.isArray(pub.published)) { errors.push(`${PUBLISHED}: το "published" πρέπει να είναι λίστα`); pub.published = [] }
  if (!pub.retired || typeof pub.retired !== "object" || Array.isArray(pub.retired)) { errors.push(`${PUBLISHED}: το "retired" πρέπει να είναι αντικείμενο { "id": "λόγος" }`); pub.retired = {} }
}
const published = new Set(pub.published), retired = pub.retired;
for (const id of published) {
  if (!ids.has(id) && !(id in retired)) errors.push(`Λείπει η δημοσιευμένη κάρτα "${id}". Επανάφερέ τη ή κατάχωρισέ τη στο "retired" του ${PUBLISHED}.`);
}
for (const id of Object.keys(retired)) {
  if (!published.has(id)) errors.push(`${PUBLISHED}: το αποσυρμένο "${id}" δεν έχει δημοσιευτεί ποτέ (λάθος στο id;)`);
  else if (ids.has(id)) errors.push(`${ids.get(id)}: το "${id}" είναι αποσυρμένο και δεν ξαναχρησιμοποιείται. Δώσε στην κάρτα νέο id ή βγάλ' το από το "retired".`);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const exists = id => ids.has(id) || id in retired;
for (const j of read(index.journeys)) for (const id of j.ideas) if (!ids.has(id)) errors.push(`Διαδρομή "${j.id}": δεν υπάρχει κάρτα με id "${id}"${id in retired ? " (είναι αποσυρμένη)" : ""}`);
if (index.legacy) for (const [old, id] of Object.entries(read(index.legacy))) if (!exists(id) && !published.has(id)) errors.push(`${index.legacy}: το "${old}" δείχνει σε ανύπαρκτο id "${id}"`);

if (errors.length) { console.error(errors.join("\n")); console.error(`\n${plural(errors.length, "σφάλμα", "σφάλματα")}.`); process.exit(1) }
console.log(`OK: ${index.topics.length} θέματα, ${srcIds.size} πηγές, ${ids.size} κάρτες, ${plural(Object.keys(retired).length, "αποσυρμένη", "αποσυρμένες")}.`);

/* Record the new ids, keeping the existing order and appending the rest. */
const added = [...ids.keys()].filter(id => !published.has(id));
if (!added.length) process.exit(0);
if (dryRun) { console.log(`${plural(added.length, "νέο id δεν έχει", "νέα ids δεν έχουν")} καταγραφεί ακόμα στο ${PUBLISHED} (--dry-run).`); process.exit(0) }
const out = { published: [...pub.published, ...added], retired };
fs.writeFileSync(path.join(dir, PUBLISHED), JSON.stringify(out, null, 2) + "\n");
console.log(`${added.length === 1 ? "Προστέθηκε 1 νέο id" : `Προστέθηκαν ${added.length} νέα ids`} στο ${PUBLISHED}${firstRun ? " (νέο αρχείο)" : ""}.`);
