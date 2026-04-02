export default function Loading() {
  return (
    <div className="w-full">
      {/* 頂部進度條動畫 */}
      <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-gray-200">
        <div className="h-full bg-blue-600 animate-loading-bar" />
      </div>

      {/* 骨架屏 — 模擬論壇列表載入 */}
      <div className="max-w-4xl mx-auto animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-100">
              <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
              <div className="h-4 bg-gray-100 rounded w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
