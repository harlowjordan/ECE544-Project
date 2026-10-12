// build_slides.js - the full proposal presentation (16 slides): Jacob's introduction,
// related work and objectives (slides 1-7), Jordan's outcomes, preliminary results, risks
// and conclusion (slides 8-15), and the references (slide 16).
//
// Jacob's text comes from his original draft slides and his figures from jacob_figures/
// (cropped from that draft). Jordan's figures come from
// prelim/figures/ (prelim/array_design.py). Speaker notes live in jordan_slides.md, not the deck.
//
//   NODE_PATH=<folder with pptxgenjs> APPLY_THEME=<pptx skill>/scripts/apply_theme.js \
//     node build_slides.js [out.pptx]

const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.APPLY_THEME);

const HERE = __dirname;
const OUT = path.join(HERE, process.argv[2] || "Alfieri_Harlow_Proposal_Presentation.pptx");
const FIG = (name) => path.join(HERE, "prelim", "figures", name + ".png");
const CODE_URL = "https://github.com/harlowjordan/ECE544-Project/tree/main/ProjectProposalPresentation/prelim";
const JFIG = (name) => path.join(HERE, "jacob_figures", name + ".png");
const RESULTS = JSON.parse(fs.readFileSync(path.join(HERE, "prelim", "results.json"), "utf8"));

// Blue = optimized array, orange = uniform array, gray = random gaps (same as the figures).
const THEME = {
  name: "OPA Proposal",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B2333", lt1: "FFFFFF", dk2: "14213D", lt2: "FCFCFB",
    accent1: "2A78D6", accent2: "EB6834", accent3: "8A8883", accent4: "52514E",
    accent5: "E3E2DE", accent6: "CDE2FB", hlink: "2A78D6", folHlink: "184F95",
  },
};
const HAIRLINE = THEME.colors.accent5;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333" x 7.5"
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Low-Crosstalk Silicon Photonic Optical Phased Array for 1550 nm FMCW LiDAR";
pres.author = "Jacob Alfieri and Jordan Harlow";
const C = pres.SchemeColor;

// =============================================================================
// Layouts
// =============================================================================

const SW = 13.333;
const M = 0.6;                 // side margin
const W = SW - 2 * M;          // content width
const TOP = 1.6;               // content top
const BOTTOM = 6.75;           // content bottom (footer row sits at 6.95)

function frame(name, dark) {
  pres.defineSlideMaster({
    title: name,
    background: { color: dark ? C.text2 : C.background2 },
    objects: [
      { placeholder: { options: { name: "eyebrow", type: "body", x: M, y: 0.42, w: W, h: 0.32,
          fontSize: 13, bold: true, charSpacing: 2, color: C.accent2, margin: 0 }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: M, y: 0.74, w: W, h: 0.7,
          fontSize: 34, bold: true, color: dark ? C.background1 : C.text2, valign: "top",
          align: "left", margin: 0 }, text: "" } },
      { text: { text: "Alfieri & Harlow · ECE 544 Project Proposal",
          options: { x: M, y: 6.95, w: 6, h: 0.3, fontSize: 11, margin: 0, valign: "middle",
                     color: dark ? C.accent6 : C.accent4 } } },
    ],
    slideNumber: { x: SW - M - 0.8, y: 6.95, w: 0.8, h: 0.3, fontSize: 11, align: "right",
                   valign: "middle", margin: 0, color: dark ? C.accent6 : C.accent4 },
  });
}
frame("CONTENT", false);
frame("DARK", true);

pres.defineSlideMaster({
  title: "TITLE",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "eyebrow", type: "body", x: M, y: 1.2, w: W, h: 0.35,
        fontSize: 14, bold: true, charSpacing: 2, color: C.accent2, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: M, y: 1.65, w: W, h: 1.7,
        fontSize: 42, bold: true, color: C.background1, valign: "top", align: "left",
        margin: 0 }, text: "" } },
  ],
});

let lastSection = null;

function newSlide(section, eyebrow, title, layout = "CONTENT") {
  if (section !== lastSection) {
    pres.addSection({ title: section });
    lastSection = section;
  }
  const s = pres.addSlide({ masterName: layout, sectionTitle: section });
  s.addText(eyebrow, { placeholder: "eyebrow" });
  s.addText(title, { placeholder: "title" });
  return s;
}

// =============================================================================
// Text helpers
// =============================================================================

// Keep a number with its unit, and a sign or arrow with what follows ("1.5 µm", "< 5 %").
const NBSP = String.fromCharCode(0xa0);
const nb = (t) => typeof t !== "string" ? t.map((r) => ({ ...r, text: nb(r.text) }))
  : t.replace(/ (µm|dB|mW|%|rms|nm)(?![A-Za-z])/g, NBSP + "$1").replace(/([<≤≥≈→=]) /g, "$1" + NBSP).replace(/ =/g, NBSP + "=");

const sub = (t) => ({ text: t, options: { subscript: true } });

// "**bold**", "*italic*" and "[text](url)" inside a string become runs.
function rich(text, base = {}) {
  return nb(text).split(/(\[[^\]]+\]\(\S+?\)|\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean).map((part) => {
    const link = part.match(/^\[([^\]]+)\]\((\S+?)\)$/);
    if (link) return { text: link[1], options: { ...base, hyperlink: { url: link[2], tooltip: link[2] } } };
    if (part.startsWith("**")) return { text: part.slice(2, -2), options: { ...base, bold: true } };
    if (part.startsWith("*")) return { text: part.slice(1, -1), options: { ...base, italic: true } };
    return { text: part, options: { ...base } };
  });
}

// Paragraphs (each a rich string) as one text box; bullets optional.
function paragraphs(s, list, box, { fontSize = 16, bullet = false, space = 10, color = C.text1 } = {}) {
  const runs = [];
  list.forEach((p, i) => {
    const r = rich(p, { fontSize, color });
    r[0].options = { ...r[0].options, paraSpaceAfter: space, ...(bullet ? { bullet: { indent: 18 } } : {}) };
    if (i < list.length - 1) r[r.length - 1].options.breakLine = true;
    runs.push(...r);
  });
  s.addText(runs, { ...box, margin: 0, valign: "top", isTextBox: true });
}

// =============================================================================
// Building blocks
// =============================================================================

function card(s, x, y, w, h, name) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.08, objectName: name,
    fill: { color: C.background1 }, line: { color: HAIRLINE, width: 0.75 },
    shadow: { type: "outer", blur: 6, offset: 1.5, angle: 90, color: "000000", opacity: 0.08 },
  });
}

// Image scaled to fit the box (aspect kept); returns where it landed.
function fit(px, box) {
  const aspect = px[0] / px[1];
  let w = box.w, h = w / aspect;
  if (h > box.h) { h = box.h; w = h * aspect; }
  return { w, h };
}

function figure(s, file, px, box, alt) {
  const { w, h } = fit(px, box);
  s.addImage({ path: file, x: box.x, y: box.y + (box.h - h) / 2, w, h, altText: alt,
               objectName: path.basename(file) });
}

// Image with a one- or two-line caption under it, centered in the column.
function captioned(s, file, px, box, caption, alt, capH = 0.3) {
  const { w, h } = fit(px, { w: box.w, h: box.h - capH - 0.06 });
  const x = box.x + (box.w - w) / 2;
  s.addImage({ path: file, x, y: box.y, w, h, altText: alt, objectName: path.basename(file) });
  s.addText(rich(caption), { x: box.x, y: box.y + h + 0.06, w: box.w, h: capH, fontSize: 11,
    color: C.accent4, margin: 0, valign: "top", align: "center", isTextBox: true });
  return box.y + h + 0.06 + capH;
}

function pills(s, labels, x, y) {
  labels.forEach((t) => {
    const w = 0.095 * t.length + 0.32;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.34, rectRadius: 0.17,
      fill: { color: C.accent6 }, line: { type: "none" }, objectName: `tool ${t}` });
    s.addText(t, { x, y, w, h: 0.34, fontSize: 12, bold: true, color: C.text2, align: "center",
                   valign: "middle", margin: 0, isTextBox: true });
    x += w + 0.12;
  });
}

// Results layout: figure on the left, a caption and three stat cards on the right.
const FIG_W = 8.6;
const RX = M + FIG_W + 0.3;
const RW = SW - M - RX;

function resultSlide(s, fig, px, alt, caption, stats) {
  figure(s, FIG(fig), px, { x: M, y: TOP, w: FIG_W, h: BOTTOM - TOP }, alt);
  s.addText(nb(caption), { x: RX, y: TOP, w: RW, h: 0.45, fontSize: 12, color: C.accent4,
                           margin: 0, valign: "top", isTextBox: true });
  const h = 1.45, gap = 0.15;
  stats.forEach(([value, label, color], i) => {
    const y = TOP + 0.5 + i * (h + gap);
    card(s, RX, y, RW, h, `stat ${i + 1}`);
    s.addText(nb(value), { x: RX + 0.2, y: y + 0.12, w: RW - 0.4, h: 0.55, fontSize: 28,
                           bold: true, color, margin: 0, valign: "middle", isTextBox: true });
    s.addText(nb(label), { x: RX + 0.2, y: y + 0.68, w: RW - 0.4, h: 0.68, fontSize: 14,
                           color: C.text1, margin: 0, valign: "top", isTextBox: true });
  });
}

const CELL = { fontSize: 14, color: C.text1, valign: "middle", margin: [0.06, 0.12, 0.06, 0.12] };
const HEAD = { ...CELL, bold: true, color: C.background1, fill: { color: C.text2 } };
const BORDER = { type: "solid", pt: 0.75, color: HAIRLINE };

function table(s, header, rows, colW, y, rowH) {
  const body = rows.map((r) => r.map((cell, j) => ({
    text: nb(cell), options: { ...CELL, bold: j === 0, fill: { color: C.background1 } },
  })));
  s.addTable([header.map((t) => ({ text: t, options: HEAD })), ...body],
             { x: M, y, w: W, colW, rowH, border: BORDER, autoPage: false });
}

// Objective card: heading, objective, methodology, tool pills.
function objectiveCard(s, x, w, heading, objective, method, tools, rows) {
  const y = TOP, h = BOTTOM - TOP, pad = 0.25, iw = w - 2 * pad;
  card(s, x, y, w, h, heading);
  s.addText(nb(heading), { x: x + pad, y: y + 0.2, w: iw, h: rows.head, fontSize: 18, bold: true,
    color: C.text2, margin: 0, valign: "top", isTextBox: true });
  let cy = y + 0.2 + rows.head + 0.08;
  paragraphs(s, [objective], { x: x + pad, y: cy, w: iw, h: rows.obj }, { fontSize: rows.objFont || 15, space: 0 });
  cy += rows.obj + 0.12;
  s.addText("METHODOLOGY", { x: x + pad, y: cy, w: iw, h: 0.28, fontSize: 12, bold: true,
    charSpacing: 1.5, color: C.accent2, margin: 0, isTextBox: true });
  paragraphs(s, [method], { x: x + pad, y: cy + 0.34, w: iw, h: rows.method }, { fontSize: 14, space: 0 });
  if (tools.length) pills(s, tools, x + pad, y + h - 0.6);
}

// =============================================================================
// 1 - Title
// =============================================================================
{
  const s = newSlide("Title", "PROJECT PROPOSAL PRESENTATION · ECE 544 SILICON PHOTONICS DESIGN",
    "Low-Crosstalk Silicon Photonic Optical Phased Array for 1550 nm FMCW LiDAR", "TITLE");
  s.addText("Jacob Alfieri & Jordan Harlow", { x: M, y: 3.55, w: W, h: 0.5, fontSize: 24,
    color: C.background1, margin: 0, isTextBox: true });
  s.addText("Department of Electrical and Computer Engineering, Colorado State University · Fall 2026",
    { x: M, y: 4.05, w: W, h: 0.4, fontSize: 16, color: C.accent6, margin: 0, isTextBox: true });
  // The 32 optimized emitter positions from the preliminary results, to scale.
  const pos = RESULTS.positions_um, span = pos[pos.length - 1];
  pos.forEach((p, i) => s.addShape(pres.shapes.RECTANGLE, {
    x: M + (p / span) * (W - 0.04), y: 5.55, w: 0.04, h: 0.6, objectName: `emitter ${i + 1}`,
    fill: { color: C.accent1 }, line: { type: "none" } }));
  s.addText(`32 optimized emitter positions, ${span.toFixed(0)} µm aperture (preliminary result)`,
    { x: M, y: 6.3, w: W, h: 0.3, fontSize: 12, color: C.accent6, margin: 0, isTextBox: true });
}

// =============================================================================
// 2-3 - Introduction (Jacob)
// =============================================================================
{
  const s = newSlide("Introduction", "INTRODUCTION · BACKGROUND", "FMCW LiDAR and optical phased arrays");
  paragraphs(s, [
    "**LiDAR** (light detection and ranging) is a remote-sensing technique that measures the distance to objects by sending out laser light and analyzing the light reflected back.",
    "**Frequency-modulated continuous-wave (FMCW) LiDAR** sweeps the laser frequency and compares the returning light with the outgoing light, measuring both distance and velocity. It is largely immune to interference from sunlight and other LiDARs [1].",
    "To scan the beam without moving parts, an **optical phased array (OPA)** places a row of tiny light emitters on a silicon chip and gives each one an adjustable phase. Tilting the phase across the row steers the beam, much as a phased-array radar does [2–4].",
  ], { x: M, y: TOP, w: 6.9, h: BOTTOM - TOP }, { fontSize: 17, space: 14 });
  const box = { x: 7.85, y: TOP + 0.35, w: SW - M - 7.85, h: 4.5 };
  captioned(s, JFIG("fmcw_lidar"), [600, 463], box, "Figure 1: FMCW LiDAR [F1].",
    "FMCW LiDAR: a swept laser, reference and sample light, and beat frequencies for approaching, receding and vibrating targets");
}
{
  const s = newSlide("Introduction", "INTRODUCTION · IMPORTANCE & MOTIVATION",
    "Emitter spacing: crosstalk vs. grating lobes");
  paragraphs(s, [
    "**Importance:** solid-state LiDAR has no moving parts, so it is more reliable, smaller, cheaper at volume and faster at pointing to arbitrary angles. It is less bulky and less prone to wear than conventional mechanical scanners.",
    "**The trade-off:** packing emitters tightly avoids grating lobes but causes crosstalk. Spacing them out avoids crosstalk but brings back grating lobes, which cause ghost beams. This makes crosstalk a major open problem in literature reviews [4].",
    "**Motivation:** we will design a 1×32 OPA transmitter whose emitters stay at least 1.5 µm apart but are irregularly spaced to suppress grating lobes while steering across ±45° at 1550 nm.",
  ], { x: M, y: TOP, w: 6.95, h: BOTTOM - TOP }, { fontSize: 17, space: 14 });
  const col = { x: 7.85, w: SW - M - 7.85 };
  const y2 = captioned(s, JFIG("crosstalk_illustration"), [1688, 858],
    { ...col, y: TOP, h: 1.75 }, "Figure 2: Optical and thermal crosstalk [F2].",
    "Illustration of heat spreading from one heated element to its neighbors");
  captioned(s, JFIG("grating_lobes"), [968, 699], { ...col, y: y2 + 0.15, h: BOTTOM - y2 - 0.15 },
    "Figure 3: Grating lobes [F3].",
    "Array pattern with a main beam at 0 degrees and grating lobes near plus and minus 10 and 20 degrees");
}

// =============================================================================
// 4-5 - Related work (Jacob)
// =============================================================================
{
  const s = newSlide("Related work", "RELATED WORK", "Uniform and irregular silicon OPAs");
  const cw = (W - 0.3) / 2, ch = 2.75;
  [["Uniform silicon OPAs",
    "The first silicon OPA used 16 emitters at 2 µm spacing and steered only 2.3° [5]. That small range is exactly the spacing problem described above. Later work scaled the approach to 4096 emitters [2] and demonstrated FMCW ranging [3]. These arrays are compact and manufacturable in CMOS foundries, but **they still trade steering range against crosstalk, and each heater-based phase shifter draws about 25 mW** [6]."],
   ["Irregular (aperiodic) arrays",
    "Spacing emitters irregularly spreads the energy of the grating lobes into a low background of side lobes. This allows wide spacing with no strong duplicate beams, and the background falls as the number of emitters grows [7]. A 128-emitter irregular array demonstrated wide, high-resolution steering without grating lobes [8]. The drawbacks are that **side-lobe suppression is limited by the emitter count** and that it degrades if positions or phases are poorly chosen."],
  ].forEach(([head, body], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, TOP, cw, ch, head);
    s.addText(head, { x: x + 0.25, y: TOP + 0.18, w: cw - 0.5, h: 0.4, fontSize: 18, bold: true,
      color: C.text2, margin: 0, isTextBox: true });
    paragraphs(s, [body], { x: x + 0.25, y: TOP + 0.62, w: cw - 0.5, h: ch - 0.75 }, { fontSize: 14, space: 0 });
  });
  const fy = TOP + ch + 0.25, fh = BOTTOM - fy;
  const { w } = fit([1542, 416], { w: 8.6, h: fh });
  figure(s, JFIG("pso_vs_linear_arrays"), [1542, 416], { x: M, y: fy, w, h: fh },
    "Array directivity of linear and PSO-optimized arrays for 192 and 480 waveguides at 1.2 and 2.5 µm minimum pitch");
  s.addText(nb("Figure 4: Linear vs. PSO-optimized optical phased arrays with 192 and 480 waveguides [7]."),
    { x: M + w + 0.3, y: fy + fh - 0.7, w: W - w - 0.3, h: 0.7, fontSize: 11, color: C.accent4,
      margin: 0, valign: "bottom", isTextBox: true });
}
{
  const s = newSlide("Related work", "RELATED WORK", "Silicon nitride and crosstalk suppression");
  const cw = 7.2;
  [["Silicon nitride platforms", 2.25,
    "Silicon nitride handles much higher optical power than silicon [9], because silicon suffers two-photon absorption at high intensity [10]. **Nitride, however, needs larger bends and wider spacing, and its heaters are less efficient.** Hybrid designs use nitride only to distribute power and silicon for everything else [11], at the cost of an extra layer."],
   ["Crosstalk suppression", 2.65,
    "Varying the width of neighboring waveguides (“superlattices”) reduces their coupling enough to allow very tight spacing [12]. Engineered claddings made of sub-wavelength silicon strips achieve the same by shortening the evanescent field [13]. Both work well, but they need either **several waveguide designs or very small features**. Literature reviews list crosstalk, **phase errors and power handling** as the main open problems [4]."],
  ].reduce((y, [head, ch, body]) => {
    card(s, M, y, cw, ch, head);
    s.addText(head, { x: M + 0.25, y: y + 0.18, w: cw - 0.5, h: 0.4, fontSize: 18, bold: true,
      color: C.text2, margin: 0, isTextBox: true });
    paragraphs(s, [body], { x: M + 0.25, y: y + 0.62, w: cw - 0.5, h: ch - 0.75 }, { fontSize: 14, space: 0 });
    return y + ch + 0.2;
  }, TOP);
  const col = { x: M + cw + 0.4, w: SW - M - (M + cw + 0.4) };
  captioned(s, JFIG("evanescent_field_cladding"), [378, 301], { ...col, y: TOP + 0.3, h: 4.6 },
    "Figure 5: A multilayer cladding suppresses the evanescent field [13].",
    "Field profile Ex versus x for claddings of increasing anisotropy: the evanescent tails shorten", 0.5);
}

// =============================================================================
// 6-7 - Objectives and methodology (Jacob)
// =============================================================================
{
  const s = newSlide("Objectives & methodology", "PROJECT OBJECTIVES & METHODOLOGY",
    "O1 array design · O2 component design");
  const cw = (W - 0.3) / 2, rows = { head: 0.4, obj: 1.3, method: 2.0 };
  objectiveCard(s, M, cw, "O1 · Array design",
    "Choose 32 irregular emitter positions, at least 1.5 µm apart, that keep every side lobe at least 10 dB below the main beam across ±45° of steering.",
    "Use Python to compute the array factor, and an optimizer to search for positions that minimize the worst side lobe over the full steering range.",
    ["Python"], rows);
  objectiveCard(s, M + cw + 0.3, cw, "O2 · Component design",
    "Design the emitter (a grating antenna), a 1-to-2 power splitter and a heater-based phase shifter, with targets for neighbor crosstalk, splitter loss and phase-shifter power.",
    "Estimate coupling between neighboring waveguides with the EIM and Marcatili's approximation; confirm in Lumerical MODE. Tune the emitter in FDTD and export its emission pattern for O1. Design the splitter in MODE/EME and the phase shifter in HEAT, which sets how far apart the heaters must be.",
    ["MODE", "FDTD", "EME", "HEAT"], rows);
}
{
  const s = newSlide("Objectives & methodology", "PROJECT OBJECTIVES & METHODOLOGY",
    "O3 circuit · O4 LiDAR estimate · O5 layout");
  const cw = (W - 0.6) / 3, rows = { head: 0.4, obj: 1.3, objFont: 14, method: 2.0 };
  objectiveCard(s, M, cw, "O3 · Full-circuit simulation",
    "Connect the components into the complete 1×32 circuit and show that the beam steers smoothly across ±45°, including realistic manufacturing variation and a simple calibration.",
    "Build the circuit in INTERCONNECT. For each steering angle, Python sets the heater powers, reads the light leaving each emitter and computes the beam. Add random width and thickness variation, then calibrate the heaters to restore the beam.",
    ["INTERCONNECT", "Python"], rows);
  objectiveCard(s, M + cw + 0.3, cw, "O4 · LiDAR estimate",
    "Translate the simulated losses and beam quality into range resolution and maximum range.",
    "Use the circuit loss and beam quality from O1–O3 with standard FMCW LiDAR relations [1].",
    [], rows);
  objectiveCard(s, M + 2 * (cw + 0.3), cw, "O5 · Circuit layout (stretch goal)",
    "Place the emitters at the O1 positions and the heaters at the O2 spacing.",
    "Build the layout in KLayout, run the PDK's design-rule check (DRC) and fix all violations, then confirm the layout's connectivity matches the O3 circuit.",
    ["KLayout", "SiEPIC PDK"], rows);
}

// =============================================================================
// 8 - Tentative outcomes (Jordan)
// =============================================================================
{
  const s = newSlide("Tentative outcomes", "PROJECT TENTATIVE OUTCOME", "Deliverables, pass criteria and dates");
  table(s, ["Deliverable", "Pass criterion", "Done by"], [
    ["O1 · 32 emitter positions",
     "All gaps ≥ 1.5 µm; every side lobe ≤ −10 dB over ±45°, using the FDTD emitter pattern", "Oct. 25"],
    ["O2 · Component library (S-parameters)",
     [{ text: "Neighbor crosstalk < −20 dB · 1×2 MMI loss < 0.3 dB · heater P" }, sub("π"),
      { text: " ≤ 25 mW, < 5 % on neighbor" }], "Nov. 1 (M1)"],
    ["O3 · Full 1×32 circuit (INTERCONNECT)",
     "Smooth steering across ±45°; calibration recovers the beam under fabrication variation",
     "Nov. 8 / 15 (M2, M3)"],
    ["O4 · LiDAR estimate",
     "Range resolution and maximum range from simulated loss and beam quality", "Nov. 15 (M3)"],
    ["O5 · GDSII layout (stretch goal)",
     "Zero DRC errors in the SiEPIC EBeam PDK; connectivity matches the O3 circuit", "Nov. 15, if time allows"],
    ["Final IEEE paper", "Submitted", "Nov. 30 (M5)"],
  ], [3.75, 6.25, 2.133], TOP, 0.62);
  s.addText("Simulation and design only: fabrication is out of scope this semester.",
    { x: M, y: 6.2, w: W, h: 0.4, fontSize: 14, italic: true, color: C.accent4, margin: 0,
      isTextBox: true });
}

// =============================================================================
// 9-13 - Preliminary results (Jordan)
// =============================================================================
{
  const s = newSlide("Preliminary results", "PRELIMINARY RESULTS", "Array-factor model and search setup");
  const LW = 7.1, ch = 1.2;
  card(s, M, TOP, LW, ch, "array factor");
  s.addText("Far field of N emitters at positions xₙ", { x: M + 0.25, y: TOP + 0.14, w: LW - 0.5,
    h: 0.3, fontSize: 13, color: C.accent4, margin: 0, isTextBox: true });
  s.addText([
    { text: "AF(θ) = (1/N) Σ" }, sub("n"), { text: " exp[ j (2π/λ) x" }, sub("n"),
    { text: " (sin θ − sin θ" }, sub("0"), { text: ") ]" },
  ], { x: M + 0.25, y: TOP + 0.5, w: LW - 0.5, h: 0.55, fontFace: "Cambria", fontSize: 22,
       color: C.text2, margin: 0, isTextBox: true });

  const y2 = TOP + ch + 0.2;
  card(s, M, y2, LW, ch, "steering window");
  s.addText("Steering shifts the pattern, so one window covers all of ±45°:",
    { x: M + 0.25, y: y2 + 0.14, w: LW - 0.5, h: 0.3, fontSize: 13, color: C.accent4, margin: 0,
      isTextBox: true });
  s.addText([
    { text: "worst side lobe for |sin θ − sin θ" }, sub("0"), { text: "| ≤ 1 + sin 45°" },
  ], { x: M + 0.25, y: y2 + 0.5, w: LW - 0.5, h: 0.55, fontFace: "Cambria", fontSize: 22,
       color: C.text2, margin: 0, isTextBox: true });

  const RX2 = M + LW + 0.4, RW2 = SW - M - RX2;
  [["31 gaps", "each 1.5–4.0 µm: the design variables"],
   ["30 starts", "gradient-based search, about 1 min on a laptop"],
   ["Python", "our own NumPy/SciPy code; ideal emitters for now"]].forEach(([v, l], i) => {
    const y = TOP + i * 0.8;
    s.addText(v, { x: RX2, y, w: RW2, h: 0.42, fontSize: 24, bold: true, color: C.accent1,
                   margin: 0, isTextBox: true });
    s.addText(l, { x: RX2, y: y + 0.42, w: RW2, h: 0.36, fontSize: 14, color: C.text1,
                   margin: 0, isTextBox: true });
  });
  s.addText(rich(`Code: [github.com/harlowjordan/ECE544-Project](${CODE_URL})`,
    { fontSize: 14, color: C.text1 }), { x: RX2, y: TOP + 2.4, w: RW2, h: 0.3, margin: 0,
    objectName: "code link", isTextBox: true });

  figure(s, FIG("emitter_positions"), [2144, 510], { x: M, y: 4.3, w: 10.2, h: BOTTOM - 4.3 },
    "Emitter positions: 32 uniform emitters over 46 µm versus 32 irregular emitters over 88 µm");
}
{
  const s = newSlide("Preliminary results", "PRELIMINARY RESULTS · 1", "Far field at 30° steering, N = 32");
  resultSlide(s, "far_field_uniform_vs_irregular", [2149, 1210],
    "Far field steered to 30 degrees: the uniform array has a 0 dB grating lobe at -32 degrees; the optimized irregular array has one beam with side lobes below -10 dB",
    "Worst side lobe over ±45° · N = 32 · all gaps ≥ 1.5 µm", [
      ["0 dB", "Uniform, 1.5 µm pitch", C.accent2],
      ["−7.2 dB", "Random gaps (median of 300 arrays)", C.accent3],
      ["−12.6 dB", "Optimized gaps (target: −10 dB)", C.accent1],
    ]);
}
{
  const s = newSlide("Preliminary results", "PRELIMINARY RESULTS · 2", "Worst side lobe vs. steering angle");
  resultSlide(s, "psl_vs_steering", [2147, 950],
    "Worst side lobe versus steering angle: uniform is near 0 dB beyond about 2 degrees; optimized stays at -12.6 dB from -45 to +45 degrees",
    "Worst side lobe at each steering angle", [
      ["±0.5°", "Steering range where the uniform array is ≤ −10 dB", C.accent2],
      ["−12.6 dB", "Optimized array, every angle from −45° to +45°", C.accent1],
      ["0.86°", "Broadside beam width (uniform: 1.64°); aperture 88 vs. 46 µm", C.text2],
    ]);
}
{
  const s = newSlide("Preliminary results", "PRELIMINARY RESULTS · 3", "Worst side lobe vs. emitter count and gap");
  resultSlide(s, "psl_tradeoffs", [2349, 910],
    "Worst side lobe versus number of emitters (8 to 64) and versus minimum gap (1 to 3 µm), optimized and random",
    "Re-optimized at each point; gaps from the minimum up to minimum + 2.5 µm", [
      ["−9.8 dB", "N = 16, gaps ≥ 1.5 µm, optimized", C.accent1],
      ["−11.4 dB", "N = 32, gaps ≥ 3 µm, optimized", C.accent1],
      ["5.4 dB", "Optimized vs. random gaps (N = 32, gaps ≥ 1.5 µm)", C.text2],
    ]);
}
{
  const s = newSlide("Preliminary results", "PRELIMINARY RESULTS · 4", "Worst side lobe vs. random phase error");
  resultSlide(s, "phase_error_tolerance", [2148, 910],
    "Worst side lobe versus rms phase error per emitter: the median crosses -10 dB at about 15 degrees rms",
    "Gaussian phase error on every emitter · 300 trials per point", [
      ["≈ 15° rms", "Where the median crosses −10 dB", C.accent1],
      ["−11.0 dB", "Median at 10° rms", C.text2],
      ["−7.7 dB", "Median at 30° rms", C.text2],
    ]);
}

// =============================================================================
// 14 - Risk management (Jordan)
// =============================================================================
{
  const s = newSlide("Risk management", "RISK MANAGEMENT", "Risks, fallback plans and evidence");
  table(s, ["Risk", "Plan B", "Evidence"], [
    ["Real emitter pattern pushes side lobes above −10 dB",
     "Re-optimize with the FDTD pattern; otherwise report the level we reach", "2.6 dB margin today"],
    ["Crosstalk at 1.5 µm worse than −20 dB", "Widen the minimum gap", "3 µm gaps → −11.4 dB"],
    ["Fabrication variation scrambles phases", "Heater calibration in O3", "Need < 15° rms"],
    ["1×32 too big for the time left", "Fall back to 1×16, with a relaxed side-lobe spec",
     "1×16 ≈ −10 dB"],
    ["3-D FDTD too slow", "Simulate short sections; 2.5-D solvers", "—"],
    ["Schedule slip", "Technical work ends Nov. 15; week of Nov. 23 is buffer", "—"],
  ], [4.4, 5.13, 2.6], TOP, 0.62);
}

// =============================================================================
// 15 - Conclusion (Jordan)
// =============================================================================
{
  const s = newSlide("Conclusion", "CONCLUSION", "Summary and next steps",
    "DARK");
  [["Problem", "Wide steering needs < 0.9 µm emitter pitch, where crosstalk distorts the beam; at 1.5 µm, a uniform array steers only ±2°."],
   ["Approach", "Irregular 1×32 OPA with all gaps ≥ 1.5 µm on 220-nm SOI, simulated from components to the full circuit."],
   ["First result", "−12.6 dB worst side lobe over ±45° with ideal emitters (target −10 dB)."],
   ["Next", "FDTD emitter pattern → components → full circuit → LiDAR estimate; final paper Nov. 30."],
  ].forEach(([label, text], i) => {
    const y = TOP + 0.1 + i * 1.1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: y + 0.1, w: 2.1, h: 0.5, rectRadius: 0.08,
      fill: { color: C.accent1, transparency: 70 }, line: { type: "none" }, objectName: `label ${i + 1}` });
    s.addText(label, { x: M, y: y + 0.1, w: 2.1, h: 0.5, fontSize: 16, bold: true, align: "center",
                       valign: "middle", color: C.background1, margin: 0, isTextBox: true });
    s.addText(nb(text), { x: M + 2.4, y, w: W - 2.4, h: 0.7, fontSize: 18, color: C.background1,
                          valign: "middle", margin: 0, isTextBox: true });
  });
  s.addText("Thank you · Questions?", { x: M, y: 6.15, w: W, h: 0.45, fontFace: "Cambria",
    fontSize: 22, italic: true, color: C.accent6, margin: 0, isTextBox: true });
}

// =============================================================================
// 16 - References
// =============================================================================
{
  const s = newSlide("References", "REFERENCES", "References");
  const refs = [
    "[1] B. Behroozpour, P. A. M. Sandborn, M. C. Wu, and B. E. Boser, “Lidar system architectures and circuits,” *IEEE Commun. Mag.*, vol. 55, no. 10, pp. 135–142, 2017.",
    "[2] J. Sun, E. Timurdogan, A. Yaacobi, E. S. Hosseini, and M. R. Watts, “Large-scale nanophotonic phased array,” *Nature*, vol. 493, no. 7431, pp. 195–199, 2013.",
    "[3] C. V. Poulton, A. Yaacobi, D. B. Cole, M. J. Byrd, M. Raval, D. Vermeulen, and M. R. Watts, “Coherent solid-state LIDAR with silicon photonic optical phased arrays,” *Opt. Lett.*, vol. 42, no. 20, pp. 4091–4094, 2017.",
    "[4] M. Hu, Y. Pang, and L. Gao, “Advances in silicon-based integrated lidar,” *Sensors*, vol. 23, no. 13, p. 5920, 2023.",
    "[5] K. Van Acoleyen, W. Bogaerts, J. Jágerská, N. Le Thomas, R. Houdré, and R. Baets, “Off-chip beam steering with a one-dimensional optical phased array on silicon-on-insulator,” *Opt. Lett.*, vol. 34, no. 9, pp. 1477–1479, 2009.",
    "[6] N. C. Harris, Y. Ma, J. Mower, T. Baehr-Jones, D. Englund, M. Hochberg, and C. Galland, “Efficient, compact and low loss thermo-optic phase shifter in silicon,” *Opt. Express*, vol. 22, no. 9, pp. 10487–10493, 2014.",
    "[7] T. Komljenovic, R. Helkey, L. Coldren, and J. E. Bowers, “Sparse aperiodic arrays for optical beam forming and LIDAR,” *Opt. Express*, vol. 25, no. 3, pp. 2511–2528, 2017.",
  ];
  const refs2 = [
    "[8] D. N. Hutchison, J. Sun, J. K. Doylend, R. Kumar, J. Heck, W. Kim, C. T. Phare, A. Feshali, and H. Rong, “High-resolution aliasing-free optical beam steering,” *Optica*, vol. 3, no. 8, pp. 887–890, 2016.",
    "[9] C. V. Poulton, M. J. Byrd, M. Raval, Z. Su, N. Li, E. Timurdogan, D. Coolbaugh, D. Vermeulen, and M. R. Watts, “Large-scale silicon nitride nanophotonic phased arrays at infrared and visible wavelengths,” *Opt. Lett.*, vol. 42, no. 1, pp. 21–24, 2017.",
    "[10] H. K. Tsang and Y. Liu, “Nonlinear optical properties of silicon waveguides,” *Semicond. Sci. Technol.*, vol. 23, no. 6, p. 064007, 2008.",
    "[11] Q. Wang, S. Wang, L. Jia, Y. Cai, W. Yue, and M. Yu, “Silicon nitride assisted 1×64 optical phased array based on a SOI platform,” *Opt. Express*, vol. 29, no. 7, pp. 10509–10517, 2021.",
    "[12] W. Song, R. Gatdula, S. Abbaslou, M. Lu, A. Stein, W. Y.-C. Lai, J. Provine, R. F. W. Pease, D. N. Christodoulides, and W. Jiang, “High-density waveguide superlattices with low crosstalk,” *Nat. Commun.*, vol. 6, p. 7027, 2015.",
    "[13] S. Jahani, S. Kim, J. Atkinson, J. C. Wirth, F. Kalhor, A. A. Noman, W. D. Newman, P. Shekhar, K. Han, V. Van, R. G. DeCorby, L. Chrostowski, M. Qi, and Z. Jacob, “Controlling evanescent waves using silicon photonic all-dielectric metamaterials for dense integration,” *Nat. Commun.*, vol. 9, p. 1893, 2018.",
    "**Figure sources**",
    "[F1] designworldonline.com/faq-on-the-basics-of-fmcw-lidar-part-1",
    "[F2] optics.ansys.com/hc/en-us/articles/47617107334291",
    "[F3] en.wikipedia.org/wiki/Grating_lobes",
    `Preliminary-result figures (slides 9–13): our own Python code, [${CODE_URL.replace("https://", "")}](${CODE_URL})`,
  ];
  const cw = (W - 0.4) / 2;
  paragraphs(s, refs, { x: M, y: TOP, w: cw, h: BOTTOM - TOP }, { fontSize: 11, space: 5 });
  paragraphs(s, refs2, { x: M + cw + 0.4, y: TOP, w: cw, h: BOTTOM - TOP }, { fontSize: 11, space: 5 });
}

// =============================================================================
// Write
// =============================================================================

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("Wrote " + OUT);
})();
