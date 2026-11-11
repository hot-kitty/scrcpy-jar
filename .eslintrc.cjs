/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  root: true,
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    '@vue/eslint-config-typescript',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  env: {
    browser: true,
    es2022: true,
  },
  ignorePatterns: [
    'dist',
    'dist-ssr',
    'coverage',
    'node_modules',
    'public/scrcpy-server*',
  ],
  rules: {
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
  overrides: [
    {
      files: ['plugins/**/*.{js,cjs,mjs}', 'vite.config.ts', 'vitest.config.*'],
      env: { node: true, browser: false },
    },
  ],
};
