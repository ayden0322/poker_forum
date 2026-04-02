/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@betting-forum/types', 'antd', '@ant-design/icons'],
};

module.exports = nextConfig;
