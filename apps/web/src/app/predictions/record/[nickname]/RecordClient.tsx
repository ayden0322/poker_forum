'use client';

// 公開戰績頁 /predictions/record/[nickname]。
// 內容抽成共用 <CompetitionRecord>（與個人主頁「競猜紀錄」tab 共用，隱私邏輯一致）。
// 本頁為獨立網址（跟單流程深連結、既有連結保留），embedded=false 顯示麵包屑與大標題。

import CompetitionRecord from '@/components/predictions/CompetitionRecord';

export default function RecordClient({ nickname }: { nickname: string }) {
  return <CompetitionRecord nickname={nickname} />;
}
