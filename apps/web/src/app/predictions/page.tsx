import type { Metadata } from 'next';
import PredictionsClient from './PredictionsClient';

export const metadata: Metadata = {
  title: '賽事競猜｜博客邦',
  description: '用 P 幣對世界盃、MLB 賽事競猜——賽前鎖定賠率、賽後自動結算，上排行榜證明你的眼光。',
};

export default function PredictionsPage() {
  return <PredictionsClient />;
}
