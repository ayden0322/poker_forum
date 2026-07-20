// 作者戰績章：貼文/留言 feed 用的精簡戰績（讓榮譽不只活在個人頁）。
//
// 設計約束（沿用戰績頁「透明本身是防禦」原則）：
//   勝率一定跟場數一起顯示，且後端已擋掉場數不足者（AUTHOR_RECORD_MIN_SETTLED），
//   避免「3 戰 3 勝 = 100%」這種樣本太小卻最醒目的誤導出現在 feed。
// 未達門檻 / 競猜關閉時後端回 null → 這裡直接不渲染（新手不會掛 0 勝 0 負）。

export interface AuthorRecord {
  winRate: number;
  settled: number;
}

export default function RecordChip({ record, className = '' }: { record?: AuthorRecord | null; className?: string }) {
  if (!record) return null;
  // 勝率高低只影響顏色深淺，不做「神準/普通」這種評價字眼——評價交給讀者
  const strong = record.winRate >= 60;
  // whitespace-nowrap：留言區作者欄只有 100px 寬，不加會把「32場」折成兩行
  return (
    <span
      title={`已結算 ${record.settled} 場競猜，勝率 ${record.winRate}%`}
      className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums ${
        strong ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'
      } ${className}`}
    >
      <span className="font-bold">{record.winRate}%</span>
      <span className="opacity-60">·</span>
      <span>{record.settled}場</span>
    </span>
  );
}
