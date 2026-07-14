'use client';

import { FRAME_RING, framePlacement, frameShape, type Rarity } from '@/lib/cosmetics';
import LottieFrame from './LottieFrame';
import ShaderEffect from './ShaderEffect';

/** 稀有度底座光暈色（讓框與頭像共用一個光源、整合不貼紙）。 */
const GLOW: Record<Rarity, string | null> = {
  COMMON: null,
  RARE: 'rgba(57,184,190,0.55)',
  LEGENDARY: 'rgba(255,200,90,0.6)',
};

/**
 * 頭像 + 框 + (獨立)特效。
 *  - frame：圖檔配件(assetUrl .png) / Lottie 動畫框(.json) / CSS 環(看 rarity)
 *  - effectUrl：獨立特效槽(Lottie)，可疊在任何框上(或無框)，僅 profile 情境渲染(效能)
 * 整合層：底座光暈 + inset 鑲嵌陰影 + 深色低飽和 fallback。
 */
export default function AvatarWithFrame({
  avatar, nickname, size = 32, frame, effectUrl, context = 'list',
}: {
  avatar: string | null;
  nickname: string;
  size?: number;
  frame?: { rarity: Rarity; assetUrl?: string | null } | null;
  effectUrl?: string | null;
  context?: 'list' | 'profile';
}) {
  // 方形相框(如三球金框)：頭像裱成圓角方形填滿窗口；其餘框：維持圓形。
  const isSquare = frameShape(frame?.assetUrl) === 'square';
  const avatarRadius = isSquare ? Math.round(size * 0.12) : 9999;
  const insetShadow = 'inset 0 1px 3px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.12)';
  const inner = avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar} width={size} height={size} alt={nickname}
      style={{ borderRadius: avatarRadius, display: 'block', objectFit: 'cover', boxShadow: insetShadow }} />
  ) : (
    <span style={{
      width: size, height: size, borderRadius: avatarRadius, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(145deg, #60a5fa, #3b82f6)',
      color: '#fff', fontWeight: 700, fontSize: size * 0.45, boxShadow: insetShadow,
    }}>
      {nickname.charAt(0)}
    </span>
  );

  const glowColor = frame ? GLOW[frame.rarity] : null;
  const glowLayer = glowColor ? (
    <span aria-hidden style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      width: size * 1.25, height: size * 1.25, borderRadius: '9999px', pointerEvents: 'none',
      background: `radial-gradient(circle, ${glowColor} 0%, transparent 68%)`,
    }} />
  ) : null;

  // 獨立特效層：疊在最上、僅 profile 渲染。放大範圍讓特效能漫出頭像外、張力更強。
  // 三種來源：video:<name>(去背循環影片，擬真，如 shader 預算的火) / shader:<kind>(即時WebGL) / *.json(Lottie)
  const effectSize = Math.round(size * 2.4);
  const isVideo = !!effectUrl && effectUrl.startsWith('video:');
  const isShader = !!effectUrl && effectUrl.startsWith('shader:');
  const effectNode = effectUrl && context === 'profile' ? (
    <span aria-hidden style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      width: effectSize, height: effectSize, pointerEvents: 'none', zIndex: 2,
    }}>
      {isVideo
        // eslint-disable-next-line jsx-a11y/media-has-caption
        ? <video src={`/cosmetics/${effectUrl!.slice(6)}.webm`} autoPlay loop muted playsInline
            width={effectSize} height={effectSize}
            style={{ width: effectSize, height: effectSize, objectFit: 'cover', pointerEvents: 'none' }} />
        : isShader
        ? <ShaderEffect kind={effectUrl!.slice(7)} size={effectSize} />
        : <LottieFrame url={effectUrl} size={effectSize} />}
    </span>
  ) : null;

  const isLottie = !!frame?.assetUrl && frame.assetUrl.endsWith('.json');

  // 框本體(依模式) → frameBody；frameTop = 需蓋在特效「之上」的裝飾(角落徽章)
  let frameBody: React.ReactNode;
  let frameTop: React.ReactNode = null;

  if (isLottie && context === 'profile') {
    // Lottie 動畫框
    const scale = 1.5;
    const overlay = Math.round(size * scale);
    const offset = Math.round((overlay - size) / 2);
    frameBody = (
      <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, lineHeight: 0 }}>
        {glowLayer}
        <span style={{ position: 'relative' }}>{inner}</span>
        <span aria-hidden style={{ position: 'absolute', top: -offset, left: -offset, width: overlay, height: overlay, pointerEvents: 'none' }}>
          <LottieFrame url={frame!.assetUrl!} size={overlay} />
        </span>
      </span>
    );
  } else if (frame?.assetUrl && !isLottie) {
    // 圖檔配件(PNG) overlay（依定位表）：徽章抽成 frameTop 蓋在特效之上
    const { scale, dx, dy } = framePlacement(frame.assetUrl);
    const overlay = Math.round(size * scale);
    const baseOffset = (overlay - size) / 2;
    const top = Math.round(-baseOffset + dy * size);
    const left = Math.round(-baseOffset + dx * size);
    frameBody = (
      <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, lineHeight: 0 }}>
        {glowLayer}
        <span style={{ position: 'relative' }}>{inner}</span>
      </span>
    );
    frameTop = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={frame.assetUrl} alt="" aria-hidden width={overlay} height={overlay}
        style={{ position: 'absolute', top, left, width: overlay, height: overlay, zIndex: 3,
          maxWidth: 'none', maxHeight: 'none', // 覆蓋 Tailwind preflight img{max-width:100%}(會壓扁框)
          pointerEvents: 'none', objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }} />
    );
  } else if (frame?.rarity === 'LEGENDARY') {
    // 傳說 CSS conic 金環 + 掃光
    frameBody = (
      <span style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
        {glowLayer}
        <span className={`legend-frame${context === 'profile' ? ' is-profile' : ''}`}
          style={{ display: 'inline-block', borderRadius: '9999px', padding: 2, lineHeight: 0, position: 'relative',
            background: 'conic-gradient(from 0deg, #b45309, #d97706, #fbbf24, #fff8e1, #fbbf24, #d97706, #b45309)' }}>
          <span style={{ display: 'inline-block', borderRadius: '9999px', padding: 1.5, background: '#fff', lineHeight: 0 }}>{inner}</span>
          <span className="legend-sheen" aria-hidden />
        </span>
      </span>
    );
  } else {
    // 普通/稀有 CSS 環（稀有帶光暈）
    const ring = frame ? FRAME_RING[frame.rarity] : undefined;
    frameBody = (
      <span style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
        {glowLayer}
        <span style={{ display: 'inline-block', borderRadius: '9999px', lineHeight: 0, padding: frame ? 2 : 0, position: 'relative', ...(ring ?? {}) }}>
          {inner}
        </span>
      </span>
    );
  }

  if (!effectNode && !frameTop) return <>{frameBody}</>;
  // 層級(後=上):頭像底 → 特效 → 徽章(frameTop 最上)
  return (
    <span style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
      {frameBody}
      {effectNode}
      {frameTop}
    </span>
  );
}
