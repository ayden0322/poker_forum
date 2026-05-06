'use client';

/**
 * 世界盃專屬 tag 篩選列
 *
 * 與既有 BoardPageClient 的 tag 系統整合：透過 activeTag prop 讀寫
 * 點擊會 toggle 該 tag（再次點擊取消）
 */

const WORLD_CUP_TAGS = [
  { slug: '', label: '全部', icon: '📋' },
  { slug: 'match-thread', label: '戰報', icon: '⚽' },
  { slug: 'prediction', label: '預測', icon: '🎯' },
  { slug: 'player', label: '球員', icon: '👤' },
  { slug: 'lineup', label: '陣容', icon: '📋' },
  { slug: 'ticket', label: '票務', icon: '🎫' },
];

export function WorldCupTagFilter({
  activeTag,
  onChange,
}: {
  activeTag: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
      {WORLD_CUP_TAGS.map((t) => {
        const active = t.slug === activeTag || (t.slug === '' && !activeTag);
        return (
          <button
            key={t.slug || 'all'}
            onClick={() => onChange(t.slug)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              active
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
