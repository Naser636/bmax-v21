// Self-contained text->PPM renderer (no external fonts/tools). 5x7 bitmap font, row-major. Used to build
// clearly-labeled PLACEHOLDER cards + review corner-tags for the preview cut. €0, pure Node.
import { writeFileSync } from 'node:fs';

// 5x7 glyphs, row-major ('#'=on). Only the chars used by the preview are defined; others render blank.
const G = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
  ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
};
function glyph(ch) { return G[ch] || G[' ']; }

// draw a line of text into an RGB buffer (centered at cx, top at y), scale px per font-pixel, color [r,g,b]
function drawLine(buf, W, text, cx, y, scale, color) {
  const cw = 6 * scale; // 5px glyph + 1 space
  const tw = text.length * cw;
  let x0 = Math.round(cx - tw / 2);
  for (const ch of text.toUpperCase()) {
    const g = glyph(ch);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (g[r][c] === '#') {
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          const px = x0 + c * scale + dx, py = y + r * scale + dy;
          if (px >= 0 && px < W && py >= 0) { const i = (py * W + px) * 3; buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; }
        }
      }
    }
    x0 += cw;
  }
}

// Render a full-frame card (W x H) with centered lines [{text, scale, color, dy}] on bg color. Writes PPM (P6).
export function renderCardPPM(outPath, { W = 1920, H = 1080, bg = [10, 15, 20], lines = [] }) {
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { buf[i * 3] = bg[0]; buf[i * 3 + 1] = bg[1]; buf[i * 3 + 2] = bg[2]; }
  for (const ln of lines) drawLine(buf, W, ln.text, W / 2, Math.round(H / 2 + (ln.dy || 0)), ln.scale, ln.color);
  writeFileSync(outPath, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), buf]));
  return outPath;
}

// Render a small left-aligned label strip (for a corner review tag). Returns {path,w,h}.
export function renderTagPPM(outPath, text, { scale = 4, pad = 10, color = [208, 216, 220], bg = [0, 0, 0] } = {}) {
  const cw = 6 * scale; const W = text.length * cw + pad * 2; const H = 7 * scale + pad * 2;
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { buf[i * 3] = bg[0]; buf[i * 3 + 1] = bg[1]; buf[i * 3 + 2] = bg[2]; }
  // left-aligned
  let x0 = pad;
  for (const ch of text.toUpperCase()) {
    const g = glyph(ch);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '#')
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const px = x0 + c * scale + dx, py = pad + r * scale + dy; const i = (py * W + px) * 3; buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; }
    x0 += cw;
  }
  writeFileSync(outPath, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), buf]));
  return { path: outPath, w: W, h: H };
}
