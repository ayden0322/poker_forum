import { LotteryHub } from '@/components/lottery/LotteryHub';

export const metadata = {
  title: '彩券中心 — 大樂透 / 威力彩 / 今彩 539 累積與開獎',
  description: '即時掌握 7 種彩券累積頭獎、開獎倒數、號碼分析。每日隨機推薦組合、跨彩種比較、線上對獎工具一站搞定。',
  openGraph: {
    title: '彩券中心｜博客邦',
    description: '7 種彩券一站搞定 — 累積頭獎、開獎倒數、號碼分析',
  },
};

export default function LotteryHubPage() {
  return <LotteryHub />;
}
