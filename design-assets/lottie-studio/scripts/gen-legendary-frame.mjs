// 傳說級原創金桂冠框（全向量、零授權）— 去 AI 感版（設計顧問藥方）
//   重點：金屬色階(非Tailwind amber) + 統一光源漸層 + 葉脈高光 + 尺寸自然漸變
//        + 流光單次斜掃(非持續旋轉) + 寶石金屬鑲座
// 輸出：public/projects/goboka-frames/legendary-1/lottie.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const W = 512, H = 512, CX = 256, CY = 256, FR = 60, OP = 150; // 2.5s loop
const R = 190;
const LEAVES = 18;
const D2R = Math.PI / 180;
const LIGHT = 225; // 統一光源：左上 135°→高光朝左上(225°方向)

// 金屬金色階（明度跨度大才有金屬感；非橘色 amber）
const G_DARK = [0.478, 0.353, 0.118]; // #7a5a1e 暗部
const G_MID  = [0.788, 0.588, 0.184]; // #c9962f
const G_MAIN = [0.957, 0.843, 0.478]; // #f4d77a 主色
const G_HI   = [1, 0.965, 0.835];     // #fff6d5 高光
const G_SPEC = [1, 1, 1];             // 鏡面白點

const tr = (p = [0, 0], r = 0, s = [100, 100]) => ({
  p: { a: 0, k: p }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: s }, r: { a: 0, k: r }, o: { a: 0, k: 100 },
});

// 尖葉 bezier path（local：base 在 (0,0)，tip 朝 -Y）
function leafPath(L, Wd) {
  const v = [[0, 0], [Wd / 2, -L * 0.45], [0, -L], [-Wd / 2, -L * 0.45]];
  const o = [[Wd * 0.12, 0], [0, -L * 0.24], [-Wd * 0.07, 0], [0, L * 0.24]];
  const i = [[-Wd * 0.12, 0], [0, L * 0.24], [Wd * 0.07, 0], [0, -L * 0.24]];
  return { a: 0, k: { i, o, v, c: true } };
}

// 金屬漸層：高光帶垂直於「葉朝向→全域光源」，每片葉自算(統一光源邏輯)
function goldGrad(L, Wd, rot) {
  const rad = (LIGHT - rot) * D2R;     // 全域光源在葉local座標的方向
  const mag = Wd * 0.95;
  const cx0 = 0, cy0 = -L * 0.5;
  const dx = Math.cos(rad) * mag, dy = Math.sin(rad) * mag;
  return {
    ty: 'gf', o: { a: 0, k: 100 }, t: 1, // linear
    s: { a: 0, k: [cx0 - dx, cy0 - dy] }, // 暗側
    e: { a: 0, k: [cx0 + dx, cy0 + dy] }, // 高光側
    g: { p: 5, k: { a: 0, k: [
      0,    ...G_DARK,
      0.35, ...G_MID,
      0.62, ...G_MAIN,
      0.86, ...G_HI,
      1,    ...G_SPEC,
    ] } },
  };
}

// 一片葉：金屬漸層 + 暗邊定義 + 亮葉脈高光
function leaf(pos, rot, L, Wd) {
  return {
    ty: 'gr', nm: 'leaf', it: [
      { ty: 'sh', ks: leafPath(L, Wd) },
      goldGrad(L, Wd, rot),
      { ty: 'st', c: { a: 0, k: G_DARK }, o: { a: 0, k: 60 }, w: { a: 0, k: 1 }, lc: 2, lj: 2 }, // 暗邊
      { ty: 'sh', ks: { a: 0, k: { i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]], v: [[0, -L * 0.1], [0, -L * 0.88]], c: false } } },
      { ty: 'st', c: { a: 0, k: G_HI }, o: { a: 0, k: 80 }, w: { a: 0, k: 1.3 }, lc: 2, lj: 2 }, // 亮葉脈
      { ty: 'tr', ...tr(pos, rot) },
    ],
  };
}

// 一條枝幹：sizeMul 由底(大)往頂(小)單調漸變(自然，非等大)
function branch(dir) {
  const aStart = 95, aEnd = 250;
  const items = [];
  for (let k = 0; k < LEAVES; k++) {
    const f = k / (LEAVES - 1);            // 0=底 1=頂
    const aL = aStart + (aEnd - aStart) * f;
    const a = dir > 0 ? aL : (180 - aL);
    const rad = a * D2R;
    const px = CX + R * Math.cos(rad), py = CY + R * Math.sin(rad);
    const rot = a + 90 + dir * 52;          // 沿環掃、交疊
    const sizeMul = 1.02 - 0.42 * f;        // 底 1.02 → 頂 0.60
    items.push(leaf([px, py], rot, 52 * sizeMul, 18 * sizeMul));
  }
  return items;
}

// 底部緞帶結
function ribbon() {
  const y = CY + R + 8;
  const tail = (sx) => ({
    ty: 'gr', nm: 'tail', it: [
      { ty: 'sh', ks: { a: 0, k: {
        i: [[0, 0], [6, -2], [-4, 6], [0, 0]], o: [[0, 0], [-6, 2], [4, -6], [0, 0]],
        v: [[0, 0], [sx * 26, 14], [sx * 30, 40], [sx * 10, 30]], c: true } } },
      { ty: 'fl', c: { a: 0, k: G_MID }, o: { a: 0, k: 100 } },
      { ty: 'st', c: { a: 0, k: G_DARK }, o: { a: 0, k: 60 }, w: { a: 0, k: 1 } },
      { ty: 'tr', ...tr([CX, y]) },
    ],
  });
  const knot = { ty: 'gr', nm: 'knot', it: [
    { ty: 'el', p: { a: 0, k: [CX, y] }, s: { a: 0, k: [22, 18] } },
    { ty: 'fl', c: { a: 0, k: G_MAIN }, o: { a: 0, k: 100 } },
    { ty: 'st', c: { a: 0, k: G_DARK }, o: { a: 0, k: 60 }, w: { a: 0, k: 1.2 } },
    { ty: 'tr', ...tr() },
  ] };
  return [tail(-1), tail(1), knot];
}

const baseLayer = (nm, shapes, ks = {}, bm = 0) => ({
  ddd: 0, ty: 4, nm, sr: 1, ip: 0, op: OP, st: 0, bm,
  ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [CX, CY, 0] }, a: { a: 0, k: [CX, CY, 0] }, s: { a: 0, k: [100, 100, 100] }, ...ks },
  shapes,
});

// 微呼吸
const breathe = { s: { a: 1, k: [
  { t: 0, s: [100, 100, 100], i: { x: [0.4, 0.4, 0.4], y: [1, 1, 1] }, o: { x: [0.6, 0.6, 0.6], y: [0, 0, 0] } },
  { t: OP / 2, s: [101.6, 101.6, 100] }, { t: OP, s: [100, 100, 100] },
] } };

const wreath = baseLayer('wreath', [
  { ty: 'gr', nm: 'all', it: [...branch(1), ...branch(-1), ...ribbon(), { ty: 'tr', ...tr() }] },
], breathe);

// 徑向漸層(寶石光澤：左上亮 → 邊暗)
const radial = (cx, cy, r, hi, mid, edge) => ({
  ty: 'gf', t: 2, o: { a: 0, k: 100 },
  s: { a: 0, k: [cx - r * 0.3, cy - r * 0.3] },
  e: { a: 0, k: [cx + r * 0.95, cy + r * 0.95] },
  g: { p: 3, k: { a: 0, k: [0, ...hi, 0.5, ...mid, 1, ...edge] } },
});

// 寶石：細鑲邊 + 徑向漸層寶石 + 白色鏡面點
function jewel(cx, cy, r, hi, mid, edge) {
  return { ty: 'gr', nm: 'jewel', it: [
    // 細金鑲邊
    { ty: 'el', p: { a: 0, k: [cx, cy] }, s: { a: 0, k: [r * 2.3, r * 2.3] } },
    { ty: 'fl', c: { a: 0, k: G_MID }, o: { a: 0, k: 100 } },
    { ty: 'el', p: { a: 0, k: [cx, cy] }, s: { a: 0, k: [r * 2.0, r * 2.0] } },
    { ty: 'fl', c: { a: 0, k: G_DARK }, o: { a: 0, k: 100 } },
    // 寶石(徑向漸層)
    { ty: 'el', p: { a: 0, k: [cx, cy] }, s: { a: 0, k: [r * 1.7, r * 1.7] } },
    radial(cx, cy, r * 0.85, hi, mid, edge),
    // 鏡面星點(左上)
    { ty: 'el', p: { a: 0, k: [cx - r * 0.35, cy - r * 0.35] }, s: { a: 0, k: [r * 0.55, r * 0.4] } },
    { ty: 'fl', c: { a: 0, k: G_SPEC }, o: { a: 0, k: 95 } },
    { ty: 'tr', ...tr() },
  ] };
}
// 寶石色：紅寶石 / 金鉚釘
const RUBY = [[1, 0.45, 0.42], [0.757, 0.071, 0.122], [0.43, 0.04, 0.075]]; // hi/mid/edge
const GOLDGEM = [G_SPEC, G_MAIN, G_DARK];

// 頂部冠寶石(紅寶石菱形 + 金鑲座 + 脈衝)
const crestY = CY - R - 2;
const dia = (dy, dx, fill) => ({ ty: 'gr', it: [
  { ty: 'sh', ks: { a: 0, k: { i:[[0,0],[0,0],[0,0],[0,0]], o:[[0,0],[0,0],[0,0],[0,0]],
    v: [[CX, crestY-dy],[CX+dx, crestY],[CX, crestY+dy],[CX-dx, crestY]], c: true } } },
  fill, { ty: 'tr', ...tr() } ] });
// 金色切面寶石(由下到上堆疊；觀察到 player 後繪者在上→亮面放後面)
const tri = (verts, fill, o = 100) => ({ ty: 'gr', it: [
  { ty: 'sh', ks: { a: 0, k: { i: verts.map(() => [0,0]), o: verts.map(() => [0,0]), v: verts, c: true } } },
  { ty: 'fl', c: { a: 0, k: fill }, o: { a: 0, k: o } }, { ty: 'tr', ...tr() } ] });
const crest = baseLayer('crest', [
  { ty: 'gr', nm: 'glow', it: [
    { ty: 'el', p: { a: 0, k: [CX, crestY] }, s: { a: 0, k: [54, 54] } },
    { ty: 'fl', c: { a: 0, k: G_HI }, o: { a: 0, k: 28 } }, { ty: 'tr', ...tr() } ] },
  dia(21, 16, { ty: 'fl', c: { a: 0, k: G_DARK }, o: { a: 0, k: 100 } }),  // 暗底/外框
  dia(17, 12, { ty: 'fl', c: { a: 0, k: G_MID }, o: { a: 0, k: 100 } }),   // 中金
  // 上半亮切面(左上高光)
  tri([[CX, crestY-17],[CX+12, crestY],[CX-12, crestY]], G_MAIN),
  tri([[CX, crestY-17],[CX-12, crestY],[CX-3, crestY-3]], G_HI),
  // 左上白色星點
  { ty: 'gr', it: [
    { ty: 'sh', ks: { a: 0, k: { i:[[0,0],[0,0],[0,0]], o:[[0,0],[0,0],[0,0]],
      v: [[CX, crestY-12],[CX-6, crestY-3],[CX-1, crestY-1]], c: true } } },
    { ty: 'fl', c: { a: 0, k: G_SPEC }, o: { a: 0, k: 90 } }, { ty: 'tr', ...tr() } ] },
], { s: { a: 1, k: [
  { t: 0, s: [100,100,100], i:{x:[.4,.4,.4],y:[1,1,1]}, o:{x:[.6,.6,.6],y:[0,0,0]} },
  { t: OP/2, s: [111,111,100] }, { t: OP, s: [100,100,100] },
] } });

// 側邊金屬寶石(脈衝)
function sideGem(angleDeg, phase) {
  const a = angleDeg * D2R;
  const x = CX + (R + 2) * Math.cos(a), y = CY + (R + 2) * Math.sin(a);
  return {
    ddd:0, ty:4, nm:`sgem-${angleDeg}`, sr:1, ip:0, op:OP, st:0, bm:0,
    ks: {
      o:{a:0,k:100}, r:{a:0,k:0}, p:{a:0,k:[CX,CY,0]}, a:{a:0,k:[CX,CY,0]},
      s:{a:1,k:[
        {t:0,s:[100,100,100],i:{x:[.5,.5,.5],y:[1,1,1]},o:{x:[.5,.5,.5],y:[0,0,0]}},
        {t:Math.round(OP*(0.5+phase*0)/1),s:[114,114,100]},
        {t:OP,s:[100,100,100]}]},
    },
    shapes: [jewel(x, y, 8, ...GOLDGEM)],
  };
}

// 流光：單次斜向 sweep(非持續旋轉) — 弧只在前半段掃過並淡入淡出
const sheen = baseLayer('sheen', [{ ty: 'gr', nm: 's', it: [
  { ty: 'el', p: { a: 0, k: [CX, CY] }, s: { a: 0, k: [2 * R + 8, 2 * R + 8] } },
  { ty: 'st', c: { a: 0, k: G_SPEC }, o: { a: 0, k: 100 }, w: { a: 0, k: 14 }, lc: 2, lj: 2 },
  { ty: 'tm', s: { a: 0, k: 0 }, e: { a: 0, k: 10 }, o: { a: 0, k: 0 }, m: 1 },
  { ty: 'tr', ...tr() },
] }], {
  o: { a: 1, k: [
    { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
    { t: Math.round(OP * 0.12), s: [85] },
    { t: Math.round(OP * 0.40), s: [0] },
    { t: OP, s: [0] },
  ] },
  r: { a: 1, k: [
    { t: 0, s: [-140], i: { x: [0.25], y: [1] }, o: { x: [0.5], y: [0] } },
    { t: Math.round(OP * 0.5), s: [200] },
    { t: OP, s: [200] },
  ] },
}, 1);

// 無背景層 = 真透明(lottie-web 不認顏色 alpha)
const doc = {
  v: '5.7.0', fr: FR, ip: 0, op: OP, w: W, h: H, nm: '傳說金桂冠 Legendary Laurel', assets: [],
  layers: [sheen, crest, wreath],
};

const dir = 'public/projects/goboka-frames/legendary-1';
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/lottie.json`, JSON.stringify(doc));
console.log('written', `${dir}/lottie.json`, JSON.stringify(doc).length, 'bytes,', doc.layers.length, 'layers');
