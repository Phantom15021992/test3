import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Относительные пути, чтобы сборку можно было выложить в любую папку
  base: './',
  build: {
    // Phaser весит ~1.2 МБ — выносим в отдельный чанк, чтобы он кэшировался между релизами
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
