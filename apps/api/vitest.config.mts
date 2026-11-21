import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/lifeledger_test',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-chars!!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars!',
    },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
