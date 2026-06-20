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

function Preview({ item, avatar, nickname }: { item: ShopItem; avatar: string | null; nickname: string }) {
  if (item.type === 'FRAME') return <AvatarWithFrame avatar={avatar} nickname={nickname} size={44} frame={{ rarity: item.rarity }} />;
  if (item.type === 'BADGE' && item.iconKey) return <BadgeIcon iconKey={item.iconKey} rarity={item.rarity} size={44} />;
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
  const savePins = () => pin.mutate({ pinnedIds, mainBadgeId: effectiveMain ?? undefined });

  const isEnabled = shopQ.data?.data.enabled !== false;
  if (!isEnabled) return null;
  if (shopQ.isLoading || invQ.isLoading) return <div className="text-sm text-gray-400">載入裝飾中…</div>;

  const frames = items.filter((i) => i.type === 'FRAME');
  const titles = items.filter((i) => i.type === 'TITLE');
  const shopBadges = items.filter((i) => i.type === 'BADGE');

  const renderShopRow = (list: ShopItem[]) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {list.map((it) => (
        <div key={it.id} className="flex flex-col items-center gap-2 rounded-lg border border-gray-100 p-3 text-center">
          <Preview item={it} avatar={user?.avatar ?? null} nickname={user?.nickname ?? '?'} />
          <div className="text-sm font-medium text-gray-900">{it.name}</div>
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${RARITY_BADGE[it.rarity]}`}>{RARITY_LABEL[it.rarity]}</span>
          {it.owned ? (
            it.type === 'BADGE' ? (
              <span className="text-xs text-gray-400">已擁有</span>
            ) : (
              (it.type === 'FRAME' ? equippedFrame?.itemId : equippedTitle?.itemId) === it.id ? (
                <button onClick={() => equip.mutate({ type: it.type as 'FRAME' | 'TITLE', itemId: null })} className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-500">卸下</button>
              ) : (
                <button onClick={() => equip.mutate({ type: it.type as 'FRAME' | 'TITLE', itemId: it.id })} className="rounded-full bg-[#39B8BE] px-3 py-1 text-xs font-semibold text-white">裝備</button>
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
      {/* 我的裝備 */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-gray-900">我的裝備</h2>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <AvatarWithFrame avatar={user?.avatar ?? null} nickname={user?.nickname ?? '?'} size={56} frame={equippedFrame ? { rarity: equippedFrame.rarity } : null} />
            <div className="mt-1 text-xs text-gray-400">頭像框</div>
          </div>
          <div className="text-center">
            {equippedTitle ? <span style={TITLE_TOKEN[equippedTitle.rarity]}>{equippedTitle.name}</span> : <span className="text-sm text-gray-300">未裝備</span>}
            <div className="mt-1 text-xs text-gray-400">稱號</div>
          </div>
          <div className="text-center">
            {ownedBadges.find((b) => b.isMainBadge)?.iconKey
              ? <BadgeIcon iconKey={ownedBadges.find((b) => b.isMainBadge)!.iconKey!} rarity={ownedBadges.find((b) => b.isMainBadge)!.rarity} size={40} />
              : <span className="text-sm text-gray-300">未設</span>}
            <div className="mt-1 text-xs text-gray-400">主勳章</div>
          </div>
        </div>
      </section>

      {/* 商店 */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-gray-900">裝飾商店 <span className="text-xs font-normal text-gray-400">餘額 {shopQ.data?.data.balanceG ?? 0} G</span></h2>
        {frames.length > 0 && <><div className="mb-2 mt-1 text-sm text-gray-500">頭像框</div>{renderShopRow(frames)}</>}
        {titles.length > 0 && <><div className="mb-2 mt-4 text-sm text-gray-500">稱號</div>{renderShopRow(titles)}</>}
        {shopBadges.length > 0 && <><div className="mb-2 mt-4 text-sm text-gray-500">勳章</div>{renderShopRow(shopBadges)}</>}
      </section>

      {/* 勳章牆（釘選 ≤3 + 主勳章） */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">勳章牆</h2>
          {pinned !== null && (
            <button onClick={savePins} disabled={pin.isPending} className="rounded-full bg-[#39B8BE] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">儲存釘選</button>
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
