import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure-logic unit tests over server/ and app/ utils — no DOM or Nuxt runtime needed.
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
