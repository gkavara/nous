#!/usr/bin/env node
/* Checks content/: every topic file listed in index.json, required fields, unique source ids,
   a unique stable id on every card, and that journeys and the legacy map point at cards that exist.
   Usage: node tools/check-content.js */
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "content");
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const errors = [], ids = new Map(), srcIds = new Set();
const index = read("index.json");

const special = new Set(["index.json", index.journeys, index.legacy]);
const onDisk = fs.readdirSync(dir).filter(f => f.endsWith(".json") && !special.has(f));
for (const f of onDisk) if (!index.topics.includes(f)) errors.push(`${f} υπάρχει αλλά λείπει από το index.json`);

for (const f of index.topics) {
  let data; try { data = read(f) } catch (e) { errors.push(`${f}: ${e.message}`); continue }
  if (!data.topic) errors.push(`${f}: λείπει το "topic"`);
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
for (const j of read(index.journeys)) for (const id of j.ideas) if (!ids.has(id)) errors.push(`Διαδρομή "${j.id}": δεν υπάρχει κάρτα με id "${id}"`);
if (index.legacy) for (const [old, id] of Object.entries(read(index.legacy))) if (!ids.has(id)) errors.push(`${index.legacy}: το "${old}" δείχνει σε ανύπαρκτο id "${id}"`);

if (errors.length) { console.error(errors.join("\n")); console.error(`\n${errors.length} σφάλματα.`); process.exit(1) }
console.log(`OK: ${index.topics.length} θέματα, ${srcIds.size} πηγές, ${ids.size} κάρτες.`);
