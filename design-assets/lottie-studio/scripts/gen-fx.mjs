// 頭像特效層 Lottie(全透明、原創) — 形狀化版(非圓點粒子)：
//   🔥火舌flicker 🌸花瓣 💫明顯星環 ⚡純閃電
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 512, H = 512, CX = 256, CY = 256, FR = 60, OP = 180;
const D2R = Math.PI / 180;
const tr = (p = [0, 0], r = 0, s = [100, 100]) => ({ p: { a: 0, k: p }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: s }, r: { a: 0, k: r }, o: { a: 0, k: 100 } });
const trA = (p, anchor, r = 0, s = [100, 100]) => ({ p: { a: 0, k: p }, a: { a: 0, k: anchor }, s: { a: 0, k: s }, r: { a: 0, k: r }, o: { a: 0, k: 100 } });
const E = { i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } };
const EV = { i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] }, o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] } };
const clamp = (a) => a.filter((k) => k.t >= 0 && k.t <= OP);
const layer = (nm, ks, shapes, bm = 0) => ({ ddd: 0, ty: 4, nm, sr: 1, ip: 0, op: OP, st: 0, bm, ks, shapes });
const write = (name, doc) => { const dir = `public/projects/goboka-frames/${name}`; mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/lottie.json`, JSON.stringify(doc)); console.log('written', name, JSON.stringify(doc).length, 'bytes', doc.layers.length, 'layers'); };
const doc = (nm, layers) => ({ v: '5.7.0', fr: FR, ip: 0, op: OP, w: W, h: H, nm, assets: [], layers });

// 週期關鍵影格(c 個循環，hi/lo 交替)
const cycleScalar = (c, lo, hi, phase = 0) => { const n = 2 * c, p = []; for (let i = 0; i <= n; i++) p.push({ t: Math.round((i / n) * OP), s: [(i + phase) % 2 ? hi : lo], ...E }); return p; };
const cycleScale = (c, loY, hiY) => { const n = 2 * c, p = []; for (let i = 0; i <= n; i++) { const hi = i % 2; p.push({ t: Math.round((i / n) * OP), s: [hi ? 200 - hiY : 200 - loY, hi ? hiY : loY, 100], ...EV }); } return p; };

// 4 芒星
function starPath(rO, rI) { const v = []; for (let k = 0; k < 8; k++) { const r = k % 2 ? rI : rO; const a = k * 45 * D2R; v.push([r * Math.cos(a), r * Math.sin(a)]); } return { a: 0, k: { i: v.map(() => [0, 0]), o: v.map(() => [0, 0]), v, c: true } }; }
const glowStar = (sz, col, halo) => ({ ty: 'gr', it: [{ ty: 'sh', ks: starPath(sz * 1.9, sz * 0.2) }, { ty: 'fl', c: { a: 0, k: halo }, o: { a: 0, k: 45 } }, { ty: 'sh', ks: starPath(sz, sz * 0.28) }, { ty: 'fl', c: { a: 0, k: col }, o: { a: 0, k: 100 } }, { ty: 'tr', ...tr() }] });
function twinkle(shape, x, y, t0, spin = 80) {
  const dur = 60;
  return layer('twk', {
    o: { a: 1, k: clamp([{ t: 0, s: [0], ...E }, { t: t0, s: [0], ...E }, { t: t0 + 14, s: [100], ...E }, { t: t0 + dur, s: [0], ...E }, { t: OP, s: [0], ...E }]) },
    r: { a: 1, k: [{ t: 0, s: [0], ...E }, { t: OP, s: [spin], ...E }] }, p: { a: 0, k: [x, y, 0] }, a: { a: 0, k: [0, 0, 0] },
    s: { a: 1, k: clamp([{ t: 0, s: [0, 0, 100], ...EV }, { t: t0, s: [0, 0, 100], ...EV }, { t: t0 + 18, s: [120, 120, 100], ...EV }, { t: t0 + dur, s: [0, 0, 100], ...EV }, { t: OP, s: [0, 0, 100], ...EV }]) },
  }, [shape], 1);
}

// 🔥 火焰(顧問+Codex 規格)：由底部往上竄的不對稱火舌、多層(暗紅大→橙→亮黃白小)、
//   核心亮外緣暗、additive 疊亮、底部橙光暈、火舌不等高不等距、尖端飄動不同步。
const seedRand = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
// 不對稱「鐮刀」火舌：base 在(0,0)、尖端往 tipDir 側甩
function flamePath(L, Wd, tipDir) {
  const tx = tipDir * Wd * 0.45;
  const v = [[0, 0], [Wd / 2, -L * 0.4], [tx, -L], [-Wd / 2, -L * 0.36]];
  const o = [[Wd * 0.32, 0], [tipDir * Wd * 0.06, -L * 0.34], [-Wd * 0.04, 0], [0, L * 0.16]];
  const i = [[-Wd * 0.32, 0], [0, L * 0.16], [Wd * 0.04, 0], [tipDir * Wd * 0.06, -L * 0.3]];
  return { a: 0, k: { i, o, v, c: true } };
}
// 一根火舌：自底部生長(scaleY rise)+尖端搖曳+明滅，色為純色(層疊出空間分層與亮核)
function flame(x, y, L, Wd, col, c, lean, tipDir, o = 100) {
  return layer('flame', {
    o: { a: 1, k: cycleScalar(c, o * 0.78, o) },
    r: { a: 1, k: cycleScalar(c, lean - 9, lean + 9) },
    p: { a: 0, k: [x, y, 0] }, a: { a: 0, k: [0, 0] },
    s: { a: 1, k: cycleScale(c, 64, 122) }, // 抽長→塌陷 循環
  }, [{ ty: 'gr', it: [{ ty: 'sh', ks: flamePath(L, Wd, tipDir) }, { ty: 'fl', c: { a: 0, k: col }, o: { a: 0, k: 100 } }, { ty: 'tr', ...tr() }] }], 1);
}
// 沿頭像「下半圈」鋪一排火舌、全部朝上竄、下重上輕(底部最高最多)
function flameRow(col, hBase, wBase, count, cMin, opa) {
  const arr = []; const R = 120;
  for (let k = 0; k < count; k++) {
    const a = 22 + (k / (count - 1)) * 136 + (seedRand(k + count) - 0.5) * 8; // 不等距
    const rad = a * D2R; const x = CX + R * Math.cos(rad), y = CY + R * Math.sin(rad);
    const up = Math.sin(a * D2R);                       // 底部=1、兩側→0：下重上輕
    const h = hBase * (0.5 + 0.6 * up) * (0.8 + seedRand(k) * 0.6);
    const w = wBase * (0.85 + seedRand(k + 7) * 0.4);
    const lean = (a - 90) * 0.25;                       // 兩側微外傾、底部直立
    const tipDir = seedRand(k + 3) > 0.5 ? 1 : -1;
    arr.push(flame(x, y, h, w, col, cMin + (k % 3), lean, tipDir, opa));
  }
  return arr;
}
// 底部橙色光暈(additive，火源發光)
const fireGlow = layer('glow', {
  o: { a: 1, k: cycleScalar(3, 30, 55) }, r: { a: 0, k: 0 },
  p: { a: 0, k: [CX, CY + 96, 0] }, a: { a: 0, k: [CX, CY + 96] }, s: { a: 1, k: cycleScale(3, 92, 106) },
}, [{ ty: 'gr', it: [{ ty: 'el', p: { a: 0, k: [CX, CY + 96] }, s: { a: 0, k: [300, 200] } }, { ty: 'fl', c: { a: 0, k: [1, 0.5, 0.12] }, o: { a: 0, k: 100 } }, { ty: 'tr', ...tr() }] }], 1);
// 色階調亮(lottie-web 無 additive，靠純色+層疊；底層改橘紅不死黑、焰心白黃放大顯)
const C_BACK = [0.88, 0.24, 0.06], C_MID = [1, 0.46, 0.08], C_CORE = [1, 0.76, 0.18], C_HOT = [1, 0.95, 0.6];
// 注意：Lottie layers index 0 = 最上層 → 焰心最上、光暈最底
const flameLayers = [
  ...flameRow(C_HOT, 70, 26, 11, 5, 100),    // 焰心：白黃(最上、多、顯)
  ...flameRow(C_CORE, 104, 36, 13, 4, 100),  // 亮黃、中
  ...flameRow(C_MID, 132, 48, 13, 3, 98),    // 橙
  ...flameRow(C_BACK, 156, 62, 11, 2, 82),   // 底層：橘紅、大、慢
  fireGlow,                                   // 底部橙光暈(最底)
];
write('fx-flame', doc('烈焰風暴 FX', flameLayers));

// 🌸 櫻吹雪：花瓣(尖端凹口)旋轉飄落
const PINK = [[0.98, 0.74, 0.84], [0.96, 0.54, 0.69], [1, 0.88, 0.93]];
function petalPath() { return { a: 0, k: { i: [[-5, 4], [4, 3], [4, -3]], o: [[5, -4], [-4, -3], [-4, 3]], v: [[0, -12], [7, 4], [-7, 4]], c: true } }; }
const petal = (col) => ({ ty: 'gr', it: [{ ty: 'sh', ks: petalPath() }, { ty: 'fl', c: { a: 0, k: col }, o: { a: 0, k: 100 } }, { ty: 'tr', ...tr([0, 0], 0, [180, 180]) }] });
function fall(x0, vx, t0, col, spin) {
  return layer('petal', {
    o: { a: 1, k: clamp([{ t: 0, s: [0], ...E }, { t: t0, s: [0], ...E }, { t: t0 + 16, s: [100], ...E }, { t: t0 + 120, s: [0], ...E }, { t: OP, s: [0], ...E }]) },
    r: { a: 1, k: [{ t: 0, s: [0], ...E }, { t: OP, s: [spin], ...E }] }, a: { a: 0, k: [0, 0, 0] },
    p: { a: 1, k: [{ t: 0, s: [x0, -20, 0], ...EV }, { t: OP, s: [x0 + vx, 480, 0], ...EV }] }, s: { a: 0, k: [100, 100, 100] },
  }, [petal(col)], 1);
}
const sakura = [];
for (let k = 0; k < 16; k++) { const x = 70 + (k * 67) % 380; sakura.push(fall(x, ((k % 2) ? 1 : -1) * (30 + (k % 3) * 14), Math.round((k / 16) * OP * 0.95), PINK[k % 3], (k % 2 ? 260 : -260))); }
write('fx-sakura', doc('櫻吹雪 FX', sakura));

// 💫 星環環繞：明顯的雙環亮星繞行(整層旋轉)
const GOLDW = [1, 0.97, 0.84], GOLD = [0.99, 0.82, 0.36];
function starRing(radius, count, sz, dir, col) {
  return layer('ring', {
    o: { a: 0, k: 100 }, r: { a: 1, k: [{ t: 0, s: [0], ...E }, { t: OP, s: [dir * 360], ...E }] },
    p: { a: 0, k: [CX, CY, 0] }, a: { a: 0, k: [CX, CY, 0] }, s: { a: 0, k: [100, 100, 100] },
  }, Array.from({ length: count }, (_, k) => { const a = (k / count) * 360 * D2R; const x = CX + radius * Math.cos(a), y = CY + radius * Math.sin(a); const s = glowStar(sz, col, GOLDW); s.it[s.it.length - 1] = { ty: 'tr', ...tr([x, y]) }; return s; }), 1);
}
const orbit = [starRing(186, 8, 17, 1, GOLDW), starRing(150, 6, 12, -1, GOLD)];
write('fx-orbit', doc('星環環繞 FX', orbit));

// ⚡ 雷霆：純鋸齒閃電連環快閃(無圓點) + 電光星花
const CYAN = [0.0, 0.85, 1], CYANW = [0.78, 0.99, 1];
function bolt(verts, x, y, t0, scale = 1.4) {
  const flashes = [t0, t0 + 2, t0 + 9, t0 + 30, t0 + 32, t0 + 40];
  const vals = [0, 100, 0, 0, 95, 0];
  return layer('bolt', {
    o: { a: 1, k: clamp(flashes.map((t, idx) => ({ t, s: [vals[idx]], ...E })).concat([{ t: 0, s: [0], ...E }, { t: OP, s: [0], ...E }])) },
    r: { a: 0, k: 0 }, p: { a: 0, k: [x, y, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [scale * 100, scale * 100, 100] },
  }, [
    { ty: 'gr', it: [{ ty: 'sh', ks: { a: 0, k: { i: verts.map(() => [0, 0]), o: verts.map(() => [0, 0]), v: verts, c: false } } }, { ty: 'st', c: { a: 0, k: CYAN }, o: { a: 0, k: 55 }, w: { a: 0, k: 9 }, lc: 2, lj: 1 }, { ty: 'tr', ...tr() }] },
    { ty: 'gr', it: [{ ty: 'sh', ks: { a: 0, k: { i: verts.map(() => [0, 0]), o: verts.map(() => [0, 0]), v: verts, c: false } } }, { ty: 'st', c: { a: 0, k: CYANW }, o: { a: 0, k: 100 }, w: { a: 0, k: 3.5 }, lc: 2, lj: 1 }, { ty: 'tr', ...tr() }] },
  ], 1);
}
const Z1 = [[0, -40], [11, -12], [-8, 4], [10, 16], [-4, 40]];
const Z2 = [[0, -38], [-10, -10], [9, 6], [-7, 18], [5, 38]];
const thunder = [
  bolt(Z1, 150, 248, 5), bolt(Z2, 366, 252, 28), bolt(Z1, 256, 140, 70),
  bolt(Z2, 170, 360, 100), bolt(Z1, 344, 358, 128), bolt(Z2, 256, 372, 150),
];
[[160, 250], [360, 250], [256, 150], [150, 340], [372, 340], [256, 366]].forEach(([x, y], i) => thunder.push(twinkle(glowStar(15, CYANW, CYAN), x, y, Math.round((i / 6) * OP), 50)));
write('fx-thunder', doc('雷霆 FX', thunder));
