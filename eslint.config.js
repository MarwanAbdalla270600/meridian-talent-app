// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.angular/**',
      '**/coverage/**',
      'apps/api/drizzle/**',
      'docs/reference/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    extends: [js.configs.recommended, ...tseslint.configs.strict, prettier],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['error', 'warn', 'log'] }],
      eqeqeq: ['error', 'always'],
      // `noUncheckedIndexedAccess` is on; `!` is used deliberately after single-row
      // `insert().returning()` and for context values guaranteed by middleware.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Tests: `any` for parsed JSON responses and non-null assertions are acceptable.
    files: ['**/test/**/*.ts', '**/*.spec.ts', '**/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['apps/web/src/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
    },
  },
  {
    files: ['apps/web/src/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: { '@angular-eslint/template/prefer-control-flow': 'error' },
  },
);
