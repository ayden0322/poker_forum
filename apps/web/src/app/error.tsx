'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto text-center py-20">
      <h1 className="text-6xl font-bold text-gray-300 mb-4">500</h1>
      <h2 className="text-xl font-semibold text-gray-700 mb-2">發生錯誤</h2>
      <p className="text-gray-500 mb-8">
        {error.message || '伺服器發生未預期的錯誤，請稍後再試。'}
      </p>
      <button
        onClick={reset}
        className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        重新嘗試
      </button>
    </div>
  );
}
