import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // core/ не должен зависеть от движка и случайности вне rng.ts
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['phaser'] }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Используй core/rng.ts' },
      ],
    },
  },
);
