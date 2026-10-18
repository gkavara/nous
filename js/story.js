/* Instagram story (1080x1920 PNG) drawn on a canvas, following the ".s.story" slide of tools/ig-template.html:
   topic label, big glyph in the background, accent rule, title, text, source, and "nous." at the foot. */
const NousStory = (() => {
  const W = 1080, H = 1920, PADX = 92, TOP = 220, BOTTOM = 260;
  const TEXT = 44, MIN_TEXT = 36, TITLE = 96; // body text shrinks (with the title) from 44px down to 36px at most
  const SERIF = 'Literata, Georgia, serif', SANS = 'Commissioner, system-ui, sans-serif';
  let fontsReady = null;
  function loadFonts() {
    if (!fontsReady) fontsReady = Promise.all(["700 96px Literata", "400 44px Commissioner", "600 30px Commissioner"]
      .map(f => document.fonts.load(f, "Αβγ Abc"))).catch(() => {});
    return fontsReady;
  }

  // Greek capitals drop the accent (tonos) but keep the diaeresis, as CSS text-transform does for lang="el".
  const caps = s => s.normalize("NFD").replace(/[\u0300\u0301\u0342]/g, "").toUpperCase().normalize("NFC");
  function wrap(ctx, text, max) {
    const lines = []; let line = "";
    for (const w of text.split(/\s+/)) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > max && line) { lines.push(line); line = w } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function spaced(ctx, text, x, y, em, align) { // letter-spaced uppercase labels
    if ("letterSpacing" in ctx) { ctx.letterSpacing = em + "px"; ctx.textAlign = align; ctx.fillText(text, x, y); ctx.letterSpacing = "0px"; return }
    const chars = [...text], w = chars.reduce((s, c) => s + ctx.measureText(c).width + em, -em);
    let cx = align === "right" ? x - w : x; ctx.textAlign = "left";
    for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + em }
  }
  function grain(ctx) { // a light grain, like the template's noise overlay
    const n = document.createElement("canvas"); n.width = n.height = 240;
    const g = n.getContext("2d"), img = g.createImageData(240, 240);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 18 }
    g.putImageData(img, 0, 0);
    ctx.fillStyle = ctx.createPattern(n, "repeat"); ctx.fillRect(0, 0, W, H);
  }

  // Lay out title, text and source between the top row and the foot; null if it doesn't fit even at MIN_TEXT.
  function layout(ctx, o) {
    const maxW = W - PADX * 2, room = (H - BOTTOM - 110) - (TOP + 80), kMin = MIN_TEXT / TEXT;
    ctx.font = `600 30px ${SANS}`; const bw = ctx.measureText(o.book).width;
    ctx.font = `400 30px ${SANS}`; const srcSplit = !!o.author && bw + ctx.measureText(" · " + o.author).width > maxW; // author on its own line
    for (let k = 1; ; k = Math.max(kMin, k * .97)) {
      const hs = TITLE * k, ps = TEXT * k;
      ctx.font = `700 ${hs}px ${SERIF}`; const hl = wrap(ctx, o.title, maxW);
      ctx.font = `400 ${ps}px ${SANS}`; const pl = wrap(ctx, o.body, Math.min(maxW, 880));
      const height = 8 + 44 + hl.length * hs * 1.08 + 44 + pl.length * ps * 1.48 + 44 + 30 + (srcSplit ? 42 : 0);
      if (height <= room) return { hs, ps, hl, pl, height, srcSplit };
      if (k === kMin) return null;
    }
  }
  async function fits(o) { await loadFonts(); return !!layout(document.createElement("canvas").getContext("2d"), o) }

  async function render(o) {
    await loadFonts();
    const c = o.colors, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"); ctx.textBaseline = "alphabetic";
    ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);

    // Top row
    ctx.font = `600 26px ${SANS}`;
    ctx.fillStyle = c.ac; spaced(ctx, caps(o.topic), PADX, TOP + 26, 26 * .14, "left");
    ctx.fillStyle = c.mu; spaced(ctx, caps(o.label), W - PADX, TOP + 26, 26 * .08, "right");

    // Big glyph behind the text
    ctx.font = `700 430px ${SERIF}`; ctx.fillStyle = c.ln; ctx.textAlign = "right";
    ctx.fillText(o.glyph, W + 20, H - 340 - 430 * .1);

    // Middle block, shrunk until it fits between the top row and the foot
    const block = layout(ctx, o);
    if (!block) { const e = new Error("too long"); e.name = "TooLong"; throw e }
    const areaTop = TOP + 80, areaBottom = H - BOTTOM - 110;
    let y = areaTop + (areaBottom - areaTop - block.height) / 2;
    ctx.fillStyle = c.ac; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(PADX, y, 120, 8, 4) : ctx.rect(PADX, y, 120, 8); ctx.fill();
    y += 8 + 44;
    ctx.textAlign = "left"; ctx.fillStyle = c.fg; ctx.font = `700 ${block.hs}px ${SERIF}`;
    for (const l of block.hl) { y += block.hs * 1.08; ctx.fillText(l, PADX, y - block.hs * .22) }
    y += 44; ctx.font = `400 ${block.ps}px ${SANS}`;
    for (const l of block.pl) { y += block.ps * 1.48; ctx.fillText(l, PADX, y - block.ps * .4) }
    y += 44 + 30;
    ctx.font = `600 30px ${SANS}`; ctx.fillStyle = c.fg; ctx.fillText(o.book, PADX, y - 6);
    if (o.author) { const bw = ctx.measureText(o.book).width; ctx.font = `400 30px ${SANS}`; ctx.fillStyle = c.mu;
      if (block.srcSplit) ctx.fillText(o.author, PADX, y + 36); else ctx.fillText(" · " + o.author, PADX + bw, y - 6) }

    // Foot: rule, "nous." and the call to action
    const fy = H - BOTTOM;
    ctx.fillStyle = c.ln; ctx.fillRect(PADX, fy - 80, W - PADX * 2, 2);
    ctx.font = `700 44px ${SERIF}`; ctx.fillStyle = c.fg; ctx.textAlign = "left"; ctx.fillText("nous", PADX, fy);
    const mw = ctx.measureText("nous").width; ctx.fillStyle = c.ac; ctx.fillText(".", PADX + mw, fy);
    ctx.font = `400 30px ${SANS}`; ctx.fillStyle = c.mu; ctx.textAlign = "right"; ctx.fillText("Διάβασέ το στο Nous", W - PADX, fy);

    grain(ctx);
    return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("toBlob")), "image/png"));
  }
  return { render, fits, loadFonts, MIN_TEXT };
})();
