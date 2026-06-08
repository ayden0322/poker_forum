/**
 * 目前僅守 economy 帳本的不變量（錢的邏輯最不可逆）。
 * 整合測試會連真實 postgres（用 DATABASE_URL），請在 Docker 內跑：
 *   docker compose run --rm api sh -c "cd apps/api && pnpm test"
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
  testTimeout: 30000,
};
