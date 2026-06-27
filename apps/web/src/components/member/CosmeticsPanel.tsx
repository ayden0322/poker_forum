'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/context/auth';
import {
  useShop, useInventory, useCosmeticActions, RARITY_LABEL, TITLE_TOKEN,
  type ShopItem, type InventoryItem, type Rarity,
} from '@/lib/cosmetics';
import AvatarWithFrame from './AvatarWithFrame';
import BadgeIcon from './BadgeIcon';

const RARITY_BADGE: Record<Rarity, string> = {
  COMMON: 'bg-gray-100 text-gray-500',
  RARE: 'bg-[#39B8BE]/10 text-[#2a8d92]',
  LEGENDARY: 'bg-amber-100 text-amber-700',
};

// 主勳章預覽（圖檔優先否則 lucide）
function MainBadgePreview({ badge }: { badge: InventoryItem }) {
  if (badge.assetUrl) return <img src={badge.assetUrl} alt={badge.name} width={22} height={22} style={{ objectFit: 'contain' }} />;
  if (badge.iconKey) return <BadgeIcon iconKey={badge.iconKey} rarity={badge.rarity} size={22} />;
  return null;
}

function Preview({ item }: { item: ShopItem }) {
  // 商店預覽：用乾淨頭貼(無字)，只秀「框/特效」本身
  if (item.type === 'FRAME') return <AvatarWithFrame avatar={null} nickname="" size={56} frame={{ rarity: item.rarity, assetUrl: item.assetUrl }} context="profile" />;
  // 特效：空頭貼 + 特效層疊上(展示動畫)
  if (item.type === 'EFFECT') return <AvatarWithFrame avatar={null} nickname="" size={56} frame={null} effectUrl={item.assetUrl} context="profile" />;
  // 勳章：圖檔優先，否則 lucide
  if (item.type === 'BADGE') {
    if (item.assetUrl) return <img src={item.assetUrl} alt={item.name} width={44} height={44} style={{ objectFit: 'contain' }} />;
    if (item.iconKey) return <BadgeIcon iconKey={item.iconKey} rarity={item.rarity} size={44} />;
  }
  return <span style={{ ...TITLE_TOKEN[item.rarity], fontSize: 15 }}>{item.name}</span>;
}

export default function CosmeticsPanel() {
  const { user } = useAuth();
  const shopQ = useShop();
  const invQ = useInventory();
  const { purchase, equip, pin } = useCosmeticActions();

  const items = shopQ.data?.data.items ?? [];
  const inv = invQ.data?.data.items ?? [];
  const equippedFrame = inv.find((i) => i.equippedSlot === 'FRAME');
  const equippedTitle = inv.find((i) => i.equippedSlot === 'TITLE');
  const equippedEffect = inv.find((i) => i.equippedSlot === 'EFFECT');
  const ownedBadges = inv.filter((i) => i.type === 'BADGE');

  // 勳章釘選的本地暫存（≤3 + 1 主）
  const [pinned, setPinned] = useState<string[] | null>(null);
  const [mainId, setMainId] = useState<string | null>(null);
  const pinnedIds = pinned ?? ownedBadges.filter((b) => b.pinnedOrder != null).sort((a, b) => (a.pinnedOrder! - b.pinnedOrder!)).map((b) => b.itemId);
  const effectiveMain = mainId ?? ownedBadges.find((b) => b.isMainBadge)?.itemId ?? null;

  const togglePin = (id: string) => {
    const cur = [...pinnedIds];
    const idx = cur.indexOf(id);
    if (idx >= 0) cur.splice(idx, 1);
    else { if (cur.length >= 3) return; cur.push(id); }
    setPinned(cur);
    if (effectiveMain && !cur.includes(effectiveMain)) setMainId(cur[0] ?? null);
  };
  const savePins = () => pin.mutate(
    { pinnedIds, mainBadgeId: effectiveMain ?? undefined },
    { onSuccess: () => { setPinned(null); setMainId(null); } }, // 回到伺服器 canonical state，避免暫存與實際不符
  );

  const isEnabled = shopQ.data?.data.enabled !== false;
  if (!isEnabled) return null;
  if (shopQ.isLoading || invQ.isLoading) return <div className="text-sm text-gray-400">載入裝飾中…</div>;

  const frames = items.filter((i) => i.type === 'FRAME');
  const titles = items.filter((i) => i.type === 'TITLE');
  const shopBadges = items.filter((i) => i.type === 'BADGE');
  const effects = items.filter((i) => i.type === 'EFFECT');

  const renderShopRow = (list: ShopItem[]) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {list.map((it) => (
        <div key={it.id} className="flex flex-col items-center gap-2 rounded-lg border border-gray-100 p-3 text-center">
          <div className="flex h-[88px] w-[88px] items-center justify-center">
            <Preview item={it} />
          </div>
          <div className="text-sm font-medium text-gray-900">{it.name}</div>
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${RARITY_BADGE[it.rarity]}`}>{RARITY_LABEL[it.rarity]}</span>
          {it.owned ? (
            it.type === 'BADGE' ? (
              <span className="text-xs text-gray-400">已擁有</span>
            ) : (
              (it.type === 'FRAME' ? equippedFrame?.itemId : it.type === 'TITLE' ? equippedTitle?.itemId : equippedEffect?.itemId) === it.id ? (
                <button onClick={() => equip.mutate({ type: it.type as 'FRAME' | 'TITLE' | 'EFFECT', itemId: null })} className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-500">卸下</button>
              ) : (
                <button onClick={() => equip.mutate({ type: it.type as 'FRAME' | 'TITLE' | 'EFFECT', itemId: it.id })} className="rounded-full bg-[#39B8BE] px-3 py-1 text-xs font-semibold text-white">裝備</button>
              )
            )
          ) : (
            <button
              disabled={!it.affordable || purchase.isPending}
              onClick={() => purchase.mutate(it.id)}
              className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
            >
              {it.affordable ? `購買 ${it.priceG} G` : `需 ${it.priceG} G`}
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* 我的裝備（白底卡片 + 放大頭像） */}
      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="px-6 pb-6 pt-5">
          <h2 className="mb-4 text-base font-bold text-gray-900">我的裝備</h2>
          <div className="flex items-center gap-8">
            {/* 容器 180×180 = 桂冠實際大小(框溢出頭貼框 30px)，版面才會留對間距 */}
            <div className="flex shrink-0 items-center justify-center" style={{ width: 180, height: 180 }}>
              <AvatarWithFrame avatar={user?.avatar ?? null} nickname={user?.nickname ?? '?'} size={120}
                frame={equippedFrame ? { rarity: equippedFrame.rarity, assetUrl: equippedFrame.assetUrl } : null}
                effectUrl={equippedEffect?.assetUrl ?? null} context="profile" />
            </div>
            <div className="flex-1">
              <div className="text-lg font-bold text-gray-900">{user?.nickname}</div>
              <div className="mt-0.5 h-5">
                {equippedTitle
                  ? <span style={TITLE_TOKEN[equippedTitle.rarity]}>{equippedTitle.name}</span>
                  : <span className="text-sm text-gray-300">尚未裝備稱號</span>}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-2">主勳章
                  {ownedBadges.find((b) => b.isMainBadge)
                    ? <MainBadgePreview badge={ownedBadges.find((b) => b.isMainBadge)!} />
                    : <span className="text-gray-300">未設</span>}
                </span>
                <span className="flex items-center gap-1">特效
                  <span className={equippedEffect ? 'text-[#2a8d92]' : 'text-gray-300'}>{equippedEffect ? equippedEffect.name : '未裝'}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 商店 */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-gray-900">裝飾商店 <span className="text-xs font-normal text-gray-400">餘額 {shopQ.data?.data.balanceG ?? 0} G</span></h2>
        {frames.length > 0 && <><div className="mb-2 mt-1 text-sm text-gray-500">頭像裝飾</div>{renderShopRow(frames)}</>}
        {effects.length > 0 && <><div className="mb-2 mt-4 text-sm text-gray-500">頭像特效 <span className="text-xs text-gray-400">（可疊在任何頭像裝飾上）</span></div>{renderShopRow(effects)}</>}
        {titles.length > 0 && <><div className="mb-2 mt-4 text-sm text-gray-500">稱號</div>{renderShopRow(titles)}</>}
        {shopBadges.length > 0 && <><div className="mb-2 mt-4 text-sm text-gray-500">勳章</div>{renderShopRow(shopBadges)}</>}
      </section>

      {/* 勳章牆（釘選 ≤3 + 主勳章） */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">勳章牆</h2>
          {/* 釘選或主勳章任一有未存變更就顯示存檔（先前只看 pinned，導致「只改主勳章」無法儲存） */}
          {(pinned !== null || mainId !== null) && (
            <button onClick={savePins} disabled={pin.isPending} className="rounded-full bg-[#39B8BE] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">儲存變更</button>
          )}
        </div>
        {ownedBadges.length === 0 ? (
          <div className="text-sm text-gray-400">還沒有勳章，去商店買幾個吧</div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {ownedBadges.map((b) => {
              const isPinned = pinnedIds.includes(b.itemId);
              const isMain = effectiveMain === b.itemId;
              return (
                <div key={b.itemId} className="flex flex-col items-center gap-1">
                  <BadgeIcon iconKey={b.iconKey ?? 'award'} rarity={b.rarity} size={40} />
                  <div className="text-[11px] text-gray-500">{b.name}</div>
                  <button onClick={() => togglePin(b.itemId)} className={`rounded-full px-2 py-0.5 text-[11px] ${isPinned ? 'bg-[#39B8BE] text-white' : 'border border-gray-300 text-gray-500'}`}>
                    {isPinned ? '已釘選' : '釘選'}
                  </button>
                  {isPinned && (
                    <button onClick={() => setMainId(b.itemId)} className={`rounded-full px-2 py-0.5 text-[11px] ${isMain ? 'bg-amber-500 text-white' : 'border border-gray-300 text-gray-500'}`}>
                      {isMain ? '主勳章' : '設為主'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-400">釘選最多 3 枚於個人頁展示；主勳章 1 枚會顯示在文章/留言名字旁。</p>
      </section>
    </div>
  );
}
