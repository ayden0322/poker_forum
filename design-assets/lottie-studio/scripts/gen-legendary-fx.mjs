// 傳說框「特效層」Lottie（疊在 Codex 桂冠 PNG 上）— 浮誇感：
//   ✨ 4 芒星閃爍(沿冠分佈,錯相) + ⬆️ 上升金粒子(餘燼感)
//   相位「寫進關鍵影格時間」(標準寫法；不用負 ip/st，lottie-web 才吃得下)
// 全透明、原創。輸出 public/projects/goboka-frames/legendary-fx/lottie.json
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 512, H = 512, CX = 256, CY = 256, FR = 60, OP = 180; // 3s loop
const D2R = Math.PI / 180;
const GOLD_HI = [1, 0.965, 0.835];
const GOLD = [0.98, 0.83, 0.4];
const WHITE = [1, 1, 1];

const tr = (p = [0, 0], r = 0, s = [100, 100]) => ({
  p: { a: 0, k: p }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: s }, r: { a: 0, k: r }, o: { a: 0, k: 100 },
});
const E = { i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } };
const EV = { i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] }, o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] } };
const clampKf = (arr) => arr.filter((k) => k.t >= 0 && k.t <= OP);

// 4 芒星 path
function starPath(rO, rI) {
  const v = [];
  for (let k = 0; k < 8; k++) { const r = k % 2 === 0 ? rO : rI; const a = k * 45 * D2R; v.push([r * Math.cos(a), r * Math.sin(a)]); }
  return { a: 0, k: { i: v.map(() => [0, 0]), o: v.map(() => [0, 0]), v, c: true } };
}

// 閃爍星：脈衝中心在 t0(frames)，相位寫進關鍵影格
function sparkle(angleDeg, radius, sizeO, t0) {
  const a = angleDeg * D2R;
  const x = CX + radius * Math.cos(a), y = CY + radius * Math.sin(a);
  const dur = 64, rise = 22;
  const oKf = clampKf([
    { t: 0, s: [0], ...E }, { t: t0, s: [0], ...E }, { t: t0 + rise, s: [100], ...E },
    { t: t0 + dur, s: [0], ...E }, { t: OP, s: [0], ...E },
  ]);
  const sKf = clampKf([
    { t: 0, s: [0, 0, 100], ...EV }, { t: t0, s: [0, 0, 100], ...EV }, { t: t0 + rise + 4, s: [100, 100, 100], ...EV },
    { t: t0 + dur, s: [0, 0, 100], ...EV }, { t: OP, s: [0, 0, 100], ...EV },
  ]);
  return {
    ddd: 0, ty: 4, nm: `spark-${angleDeg}`, sr: 1, ip: 0, op: OP, st: 0, bm: 0,
    ks: { o: { a: 1, k: oKf }, r: { a: 1, k: [{ t: 0, s: [0], ...E }, { t: OP, s: [80], ...E }] },
      p: { a: 0, k: [x, y, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 1, k: sKf } },
    shapes: [
      { ty: 'gr', it: [ { ty: 'sh', ks: starPath(sizeO * 1.7, sizeO * 0.18) }, { ty: 'fl', c: { a: 0, k: GOLD_HI }, o: { a: 0, k: 55 } }, { ty: 'tr', ...tr() } ] },
      { ty: 'gr', it: [ { ty: 'sh', ks: starPath(sizeO, sizeO * 0.26) }, { ty: 'fl', c: { a: 0, k: WHITE }, o: { a: 0, k: 100 } }, { ty: 'tr', ...tr() } ] },
    ],
  };
}

// 上升金粒子：位置走完整 OP，opacity 視窗在 t0 處(不同 t0→不同高度可見=連續)
function ember(x0, startY, riseAmt, drift, sz, t0) {
  const oKf = clampKf([
    { t: 0, s: [0], ...E }, { t: t0, s: [0], ...E }, { t: t0 + 24, s: [85], ...E },
    { t: t0 + 96, s: [0], ...E }, { t: OP, s: [0], ...E },
  ]);
  return {
    ddd: 0, ty: 4, nm: 'ember', sr: 1, ip: 0, op: OP, st: 0, bm: 0,
    ks: { o: { a: 1, k: oKf }, r: { a: 0, k: 0 }, a: { a: 0, k: [0, 0, 0] },
      p: { a: 1, k: [{ t: 0, s: [x0, startY, 0], ...EV }, { t: OP, s: [x0 + drift, startY - riseAmt, 0], ...EV }] },
      s: { a: 1, k: [{ t: 0, s: [110, 110, 100], ...EV }, { t: OP, s: [50, 50, 100], ...EV }] } },
    shapes: [{ ty: 'gr', it: [ { ty: 'sh', ks: starPath(sz * 0.62, sz * 0.2) }, { ty: 'fl', c: { a: 0, k: GOLD }, o: { a: 0, k: 100 } }, { ty: 'tr', ...tr() } ] }],
  };
}

// 星芒(角度,半徑,大小,起始幀) — 加強：更多更大、錯相更密
const SPARKS = [
  sparkle(-90, 12, 60, 0),     // 頂(冠處)最大星
  sparkle(-145, 196, 40, 20),
  sparkle(-35, 196, 40, 70),
  sparkle(150, 205, 36, 40),
  sparkle(30, 205, 36, 100),
  sparkle(110, 210, 32, 60),
  sparkle(70, 210, 32, 130),
  sparkle(-110, 150, 30, 90),
  sparkle(-70, 150, 30, 150),
  sparkle(180, 175, 28, 30),
  sparkle(0, 175, 28, 115),
];
// 上升粒子(x,起Y,升幅,漂移,大小,起始幀) — 加倍
const eseed = [[150,360,170,8,26,0],[210,380,185,-6,20,24],[300,360,175,10,26,48],[360,380,155,-8,20,72],[256,408,195,4,30,12],[180,335,145,6,20,60],[330,335,160,-10,26,36],[120,308,135,12,20,96],[240,395,180,-5,24,84],[290,400,170,7,22,108],[160,400,165,-9,22,132],[350,405,150,5,24,18]];
const EMBERS = eseed.map((e) => ember(e[0], e[1], e[2], e[3], e[4], e[5]));

const doc = {
  v: '5.7.0', fr: FR, ip: 0, op: OP, w: W, h: H, nm: '傳說特效層 Legendary FX', assets: [],
  layers: [...SPARKS, ...EMBERS],
};

const dir = 'public/projects/goboka-frames/legendary-fx';
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/lottie.json`, JSON.stringify(doc));
console.log('written', `${dir}/lottie.json`, JSON.stringify(doc).length, 'bytes,', doc.layers.length, 'layers');
