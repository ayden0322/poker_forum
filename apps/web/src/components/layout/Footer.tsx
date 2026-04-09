import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-400 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm">&copy; 2026 博客邦. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm justify-center">
            <Link href="/about" className="hover:text-white transition-colors">關於我們</Link>
            <Link href="/terms" className="hover:text-white transition-colors">服務條款</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">隱私政策</Link>
            <Link href="/data-deletion" className="hover:text-white transition-colors">資料刪除</Link>
            <Link href="/contact" className="hover:text-white transition-colors">聯絡我們</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
