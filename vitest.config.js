import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'test/**',
        'old/**',
        'test_output/**',
        'samples/**',
        'test_run/**',
        '.claude/**',
        'coverage/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    include: ['test/**/*.{test,spec}.js'],
    exclude: ['node_modules', 'test_run/**'],
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    reporters: ['verbose'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
});
