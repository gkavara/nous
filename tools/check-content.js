#!/usr/bin/env node
/* Checks content/: every topic file listed in index.json, required fields, unique source ids,
   and that every journey points at an idea that exists. Usage: node tools/check-content.js */
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "content");
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const errors = [], ids = new Set(), srcIds = new Set();
const index = read("index.json");

const onDisk = fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "index.json" && f !== index.journeys);
for (const f of onDisk) if (!index.topics.includes(f)) errors.push(`${f} υπάρχει αλλά λείπει από το index.json`);

let ideas = 0;
for (const f of index.topics) {
  let data; try { data = read(f) } catch (e) { errors.push(`${f}: ${e.message}`); continue }
  if (!data.topic) errors.push(`${f}: λείπει το "topic"`);
  for (const s of data.sources || []) {
    if (!s.id || !s.title) errors.push(`${f}: πηγή χωρίς id ή title`);
    if (srcIds.has(s.id)) errors.push(`${f}: διπλό id πηγής "${s.id}"`);
    srcIds.add(s.id);
    (s.ideas || []).forEach((x, i) => {
      if (!x.h || !x.b) errors.push(`${f}: ${s.id}:${i} χωρίς τίτλο (h) ή κείμενο (b)`);
      ids.add(s.id + ":" + i); ideas++;
    });
  }
}
for (const j of read(index.journeys)) for (const id of j.ideas) if (!ids.has(id)) errors.push(`Διαδρομή "${j.id}": δεν υπάρχει η ιδέα ${id}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1) }
console.log(`OK: ${index.topics.length} θέματα, ${srcIds.size} πηγές, ${ideas} ιδέες.`);
