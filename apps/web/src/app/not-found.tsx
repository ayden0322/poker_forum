import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto text-center py-20">
      <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
      <h2 className="text-xl font-semibold text-gray-700 mb-2">找不到頁面</h2>
      <p className="text-gray-500 mb-8">
        您要找的頁面不存在或已被移除。
      </p>
      <Link
        href="/"
        className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        回到首頁
      </Link>
    </div>
  );
}
