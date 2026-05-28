'use client';

import type { LiveHotZone } from './types';

interface Props {
  zones: LiveHotZone[];
  batterName?: string;
}

/**
 * 打者熱區
 *
 * MLB 提供 13 區資料：
 *   - zones 01~09：好球帶 3x3
 *   - zones 11~14：好球帶外圍（左上 / 右上 / 左下 / 右下 象限）
 *
 * 顯示成 5x5 視覺：
 *   ┌───┬───┬───┬───┬───┐
 *   │11 │ 11│   │ 12│ 12│
 *   ├───┼───┼───┼───┼───┤
 *   │11 │ 01│ 02│ 03│ 12│
 *   ├───┼───┼───┼───┼───┤
 *   │   │ 04│ 05│ 06│   │  ← 中間 row 沒外圍區
 *   ├───┼───┼───┼───┼───┤
 *   │13 │ 07│ 08│ 09│ 14│
 *   ├───┼───┼───┼───┼───┤
 *   │13 │ 13│   │ 14│ 14│
 *   └───┴───┴───┴───┴───┘
 *
 * 簡化做法：好球帶外圍 4 區用 L 型方塊呈現於四角。
 */
export function HotZoneGrid({ zones, batterName }: Props) {
  if (!zones || zones.length === 0) return null;

  const map = new Map(zones.map((z) => [z.zone, z]));

  const zone = (id: string) => map.get(id);

  const cell = (id: string, extraClass = '') => {
    const z = zone(id);
    return (
      <div
        className={`flex items-center justify-center text-[10px] font-bold text-gray-800 ${extraClass}`}
        style={{ backgroundColor: z?.color ?? '#f3f4f6' }}
        title={z ? `${id} · ${z.temp} · ${z.value}` : id}
      >
        {z?.value}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="text-xs text-gray-500 font-medium mb-3 flex items-center justify-between">
        <span>打者熱區（OPS）</span>
        {batterName && (
          <span className="text-[10px] text-gray-400">{batterName}</span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_3fr_1fr] gap-1 max-w-[260px] mx-auto">
        {/* 左外圍（11 / 13） */}
        <div className="grid grid-rows-3 gap-1">
          {cell('11', 'rounded-tl-lg')}
          <div className="bg-gray-50 rounded" />
          {cell('13', 'rounded-bl-lg')}
        </div>

        {/* 中間 3x3 好球帶 */}
        <div className="grid grid-cols-3 grid-rows-3 gap-1 border-2 border-gray-800 rounded">
          {cell('01')}
          {cell('02')}
          {cell('03')}
          {cell('04')}
          {cell('05')}
          {cell('06')}
          {cell('07')}
          {cell('08')}
          {cell('09')}
        </div>

        {/* 右外圍（12 / 14） */}
        <div className="grid grid-rows-3 gap-1">
          {cell('12', 'rounded-tr-lg')}
          <div className="bg-gray-50 rounded" />
          {cell('14', 'rounded-br-lg')}
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: 'rgba(214, 41, 52, 0.55)' }} />
          熱
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: 'rgba(234, 147, 153, 0.55)' }} />
          溫
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-white border border-gray-300" />
          普
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: 'rgba(150, 188, 255, 0.55)' }} />
          涼
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: 'rgba(6, 90, 238, 0.55)' }} />
          冷
        </span>
      </div>
    </div>
  );
}
