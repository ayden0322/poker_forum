/** @type {import('next').NextConfig} */
const nextConfig = {
  // 本機驗證 build 用 NEXT_DIST_DIR 隔離輸出目錄，避免蓋掉 dev 容器共用的 .next（弄壞 next dev 樣式的舊雷）
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  transpilePackages: ['@betting-forum/types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost', port: '9100' },
    ],
  },
};

module.exports = nextConfig;
