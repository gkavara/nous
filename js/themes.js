/* Topic colours, shared by the app (js/app.js), the Instagram generator (tools/make-posts.js)
   and the content check (tools/check-content.js), which verifies contrast for every topic.
   Each topic sets its dark look (as in tools/ig-template.html): bg, fg, accent.
   The light look is derived: a pale tint of the topic's hue, the deep bg as text, and the accent darkened until it reads. */
(function (root) {
  const TOPICS = {
    "Συνήθειες":       { slug: "habits",        glyph: "1%", bg: "#44301a", fg: "#f6efe4", ac: "#f0aa62" },
    "Στωικισμός":      { slug: "stoicism",      glyph: "Σ",  bg: "#1d3354", fg: "#f3eee2", ac: "#e8a93e" },
    "Φιλοσοφία":       { slug: "philosophy",    glyph: "Φ",  bg: "#2c2a55", fg: "#f1eff8", ac: "#c4b5ff" },
    "Ψυχολογία":       { slug: "psychology",    glyph: "Ψ",  bg: "#3d1c43", fg: "#f7edf3", ac: "#ff9b73" },
    "Αποφάσεις":       { slug: "decisions",     glyph: "?",  bg: "#10424a", fg: "#eaf4f3", ac: "#7fd8ca" },
    "Χρήματα":         { slug: "money",         glyph: "€",  bg: "#1c4635", fg: "#eff1e6", ac: "#d9c25f" },
    "Επιχείρηση":      { slug: "business",      glyph: "%",  bg: "#4f1d1f", fg: "#f9ecea", ac: "#ffa48a" },
    "Παραγωγικότητα":  { slug: "productivity",  glyph: "Π",  bg: "#123f68", fg: "#ecf3fa", ac: "#9fd2ff" },
    "Μάθηση":          { slug: "learning",      glyph: "Μ",  bg: "#383812", fg: "#f4f2e2", ac: "#e2d46a" },
    "Σχέσεις":         { slug: "relationships", glyph: "&",  bg: "#55203f", fg: "#fbedf4", ac: "#ffa6c6" },
    "Υγεία":           { slug: "health",        glyph: "+",  bg: "#26421a", fg: "#f0f5e8", ac: "#b8e27c" },
    "Δημιουργικότητα": { slug: "creativity",    glyph: "Δ",  bg: "#5a2a12", fg: "#fbefe6", ac: "#ffb37a" },
    "Ηγεσία":          { slug: "leadership",    glyph: "Η",  bg: "#1c1c1f", fg: "#f2f0ea", ac: "#e6c068" },
  };
  // The reader's own notes ("Δικές μου ιδέες") and anything without a topic.
  const DEFAULT = { slug: "default", glyph: "N", bg: "#1d2a2a", fg: "#e6ece9", ac: "#e0a33c" };

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const toHex = c => "#" + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t)); // t=0 → a, t=1 → b
  function lum(h) { return hex(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0) }
  function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05) }

  function hsl(h) { // → [hue 0-360, saturation 0-1, lightness 0-1]
    const [r, g, b] = hex(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1)), hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(hue * 60 + 360) % 360, s, l];
  }
  function fromHsl(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return toHex([r, g, b].map(v => (v + m) * 255));
  }
  // Light background: the hue of the topic's deep colour (or of its accent, for near-greys), pale and softly saturated.
  function tint(t) { const b = hsl(t.bg), a = hsl(t.ac); return fromHsl(b[1] > .12 ? b[0] : a[0], .42, .92) }

  function palette(t) {
    // "mu" and "ln" are the template's 62% and 18% fg over bg, flattened to solid colours.
    const dark = { bg: t.bg, fg: t.fg, ac: t.ac, mu: mix(t.bg, t.fg, .62), ln: mix(t.bg, t.fg, .18) };
    const lbg = tint(t);
    let lac = t.ac, k = 0;
    while (contrast(lac, lbg) < 4.8 && k < 40) lac = mix(t.ac, t.bg, ++k / 40);
    const light = { bg: lbg, fg: t.bg, ac: lac, mu: mix(lbg, t.bg, .8), ln: mix(lbg, t.bg, .14) };
    return { slug: t.slug, glyph: t.glyph, dark, light };
  }
  const THEMES = {}; for (const k in TOPICS) THEMES[k] = palette(TOPICS[k]);
  const theme = topic => THEMES[topic] || palette(DEFAULT);

  const api = { THEMES, theme, contrast, DEFAULT_THEME: palette(DEFAULT) };
  if (typeof module !== "undefined") module.exports = api; else root.NousThemes = api;
})(this);
