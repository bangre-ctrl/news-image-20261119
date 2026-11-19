// News in one image: Thursday 19 November 2026.
// A Node 22 program, standard library only. It draws a 1024x1024
// newspaper front page in code, with a small 5x7 bitmap font, and
// writes it as a PNG to /output/entry.png. No network, no clock,
// no randomness, so two runs write the same bytes.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;
const PAPER = [247, 243, 232];
const INK = [17, 17, 17];
const RED = [185, 28, 28];
const BLUE = [29, 78, 216];
const TEAL = [13, 116, 128];
const GOLD = [180, 120, 10];
const GREY = [90, 88, 80];
const WHITE = [255, 255, 255];
const LIGHT = [232, 226, 210];

// A 5x7 bitmap font. Each glyph is 7 rows; each row is a 5-bit
// number, bit 4 is the leftmost pixel. Only capitals, digits and
// the punctuation the page needs are stored; the renderer folds
// lower case to upper case before looking a glyph up.
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31], "3": [14, 17, 1, 6, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8], "-": [0, 0, 0, 14, 0, 0, 0],
  "'": [4, 4, 8, 0, 0, 0, 0], "/": [1, 1, 2, 4, 8, 16, 16],
  "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8],
  "%": [24, 25, 2, 4, 8, 19, 25], "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4], "+": [0, 4, 4, 14, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0], ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8], "&": [12, 18, 20, 8, 21, 18, 13],
};

// CRC32, the checksum every PNG chunk carries.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePng(rgb: Uint8Array, width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// The drawing surface: one RGB byte array, painted in code.
class Page {
  px = new Uint8Array(W * H * 3).fill(0);
  constructor() { this.rect(0, 0, W, H, PAPER); }
  set(x: number, y: number, c: number[]) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: number[]) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  outline(x: number, y: number, w: number, h: number, c: number[]) {
    this.rect(x, y, w, 2, c); this.rect(x, y + h - 2, w, 2, c);
    this.rect(x, y, 2, h, c); this.rect(x + w - 2, y, 2, h, c);
  }
  disc(cx: number, cy: number, r: number, c: number[]) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.set(x, y, c);
    }
  }
  text(s: string, x: number, y: number, scale: number, c: number[]): number {
    let cx = x;
    for (const raw of s.toUpperCase()) {
      const g = FONT[raw] ?? FONT["?"];
      for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
        if (g[row] & (16 >> col)) this.rect(cx + col * scale, y + row * scale, scale, scale, c);
      }
      cx += 6 * scale;
    }
    return cx - x;
  }
  // Wrap a paragraph to a width, in pixels, at the given scale.
  // Returns the y just below the last line.
  para(s: string, x: number, y: number, maxW: number, scale: number, c: number[], gap: number): number {
    const words = s.split(" ");
    const lineH = 7 * scale + gap;
    let line = "";
    let cy = y;
    for (const word of words) {
      const trial = line ? line + " " + word : word;
      if ((trial.length * 6 - 1) * scale > maxW && line) {
        this.text(line, x, cy, scale, c);
        cy += lineH; line = word;
      } else line = trial;
    }
    if (line) { this.text(line, x, cy, scale, c); cy += lineH; }
    return cy;
  }
  center(s: string, y: number, scale: number, c: number[]) {
    const w = (s.length * 6 - 1) * scale;
    this.text(s, Math.round((W - w) / 2), y, scale, c);
  }
}

// One panel: a coloured kicker, a headline, then wrapped body text.
// bodyScale 3 for the big middle stories, 2 for the smaller bottom ones.
function panel(p: Page, x: number, y: number, w: number, h: number,
  kicker: string, kickerColor: number[], headline: string, body: string, bodyScale = 3) {
  p.rect(x, y, w, h, WHITE);
  p.outline(x, y, w, h, INK);
  p.rect(x, y, w, 34, kickerColor);
  p.text(kicker, x + 12, y + 8, 2, WHITE);
  let cy = y + 46;
  cy = p.para(headline, x + 12, cy, w - 24, 3, INK, 5);
  p.para(body, x + 12, cy + 6, w - 24, bodyScale, [40, 40, 40], 4);
}

function draw(): Buffer {
  const p = new Page();

  // Masthead.
  p.center("THE WORLD IN ONE DAY", 18, 6, INK);
  p.rect(24, 78, W - 48, 3, INK);
  p.center("THURSDAY 19 NOVEMBER 2026", 90, 3, RED);
  p.rect(24, 124, W - 48, 3, INK);
  p.center("THE DAY'S WORLD NEWS, IN ONE IMAGE", 134, 2, GREY);

  // Lead story: the Shenzhen summit, full width.
  p.rect(24, 164, W - 48, 220, WHITE);
  p.outline(24, 164, W - 48, 220, INK);
  p.rect(24, 164, W - 48, 34, RED);
  p.text("LEAD STORY - SHENZHEN, CHINA", 36, 172, 2, WHITE);
  p.para("THREE LEADERS, ONE TABLE", 36, 212, 620, 4, INK, 6);
  p.para("Trump, Xi and Putin meet at APEC in Shenzhen, the first trilateral summit. Nuclear arms top the agenda. No deal is expected.", 36, 262, 620, 3, [40, 40, 40], 4);
  // Three flags, left to right: US, China, Russia.
  const flags: [number[], string, string][] = [
    [BLUE, "USA", "TRUMP"], [RED, "CHINA", "XI"], [WHITE, "RUSSIA", "PUTIN"],
  ];
  flags.forEach(([col, name, leader], i) => {
    const fx = 700 + i * 100;
    p.rect(fx, 216, 84, 56, col);
    p.outline(fx, 216, 84, 56, INK);
    if (i === 2) { p.rect(fx, 216, 84, 18, WHITE); p.rect(fx, 234, 84, 18, BLUE); p.rect(fx, 252, 84, 20, RED); }
    if (i === 0) {
      p.rect(fx, 216, 84, 56, WHITE);
      for (let s = 0; s < 4; s++) p.rect(fx, 216 + s * 14, 84, 7, RED);
      p.rect(fx, 216, 36, 28, BLUE);
    }
    if (i === 1) { p.rect(fx + 8, 224, 8, 8, [255, 220, 0]); p.rect(fx + 26, 224, 5, 5, [255, 220, 0]); p.rect(fx + 26, 238, 5, 5, [255, 220, 0]); }
    p.text(name, fx + 6, 282, 2, INK);
    p.text(leader, fx + 6, 302, 2, RED);
  });
  p.text("APEC 2026 - 1 HOUR", 700, 332, 2, GREY);

  // Middle row: the Gulf, then Gaza.
  panel(p, 24, 400, 476, 280, "THE GULF ON EDGE", TEAL,
    "US STRIKES QESHM, IRAN HITS BACK",
    "US jets hit a missile site on Qeshm Island. Iran fired drones at US bases in the Gulf. Tanker hit in Hormuz: 1 missing, 11 hurt.");
  panel(p, 524, 400, 476, 280, "GAZA FLOODS", BLUE,
    "RAIN DROWNS THE TENT CAMPS",
    "Rain floods Gaza's tent camps as winter sets in. About 150,000 tents are held at the border. Four allies demand Israel let aid in at once.");

  // Bottom row: Europe, Asia, science and culture.
  panel(p, 24, 692, 314, 216, "EUROPE", GOLD,
    "BORDERS AND STREETS",
    "Estonia will shut its Russia border from 1 Dec after a sabotage bid. Huge crowds march in Prague for press freedom.", 2);
  panel(p, 354, 692, 316, 216, "ASIA", TEAL,
    "CYCLONE AKVAN NEARS INDIA",
    "Cyclone Akvan bears down on Odisha. India readies shelters and shuts schools as the storm nears the coast.", 2);
  panel(p, 686, 692, 314, 216, "SCIENCE + CULTURE", RED,
    "FAR OUT, AND AT HOME",
    "Voyager 1 reaches one light-day from Earth. GTA VI launches worldwide. Anthropic raises USD 81bn in the biggest IPO ever.", 2);

  // Footer: the rest of the day, in one line each.
  p.rect(24, 924, W - 48, 76, INK);
  p.text("ALSO TODAY", 36, 936, 2, [255, 210, 90]);
  p.text("JEFFRIES NOMINATED AS FIRST BLACK US HOUSE SPEAKER", 36, 960, 2, WHITE);
  p.text("EU PLANS EUR 45BN UKRAINE LOAN - ICJ TO RULE ON ROHINGYA CASE", 36, 978, 2, WHITE);

  return encodePng(p.px, W, H);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), draw());
