import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {ignores: ['dist/**', 'node_modules/**', 'fixtures/**', 'coverage/**']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
    },
  },
  {
    files: ['bin/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {globals: {console: 'readonly', process: 'readonly', URL: 'readonly'}},
  },
  {
    files: ['ui/**/*.js'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'Blob',
          'URL',
          'URLSearchParams',
          'clearTimeout',
          'document',
          'fetch',
          'localStorage',
          'matchMedia',
          'navigator',
          'setTimeout',
        ].map((name) => [name, 'readonly']),
      ),
    },
  },
  prettier,
)
