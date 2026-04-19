module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { project: './tsconfig.json', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'boundaries'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:boundaries/recommended',
  ],
  ignorePatterns: ['dist/**', 'web/**', 'node_modules/**', 'spike/**'],
  settings: {
    'boundaries/elements': [
      { type: 'config', pattern: 'src/config/**' },
      { type: 'db', pattern: 'src/db/**' },
      { type: 'logger', pattern: 'src/logger/**' },
      { type: 'errors', pattern: 'src/errors/**' },
      { type: 'events', pattern: 'src/events/**' },
      { type: 'mteam', pattern: 'src/mteam/**' },
      { type: 'qbt', pattern: 'src/qbt/**' },
      { type: 'rules', pattern: 'src/rules/**' },
      { type: 'workers', pattern: 'src/workers/**' },
      { type: 'auth', pattern: 'src/auth/**' },
      { type: 'services', pattern: 'src/services/**' },
      { type: 'observability', pattern: 'src/observability/**' },
      { type: 'util', pattern: 'src/util/**' },
      { type: 'http', pattern: 'src/http/**' },
      { type: 'shared', pattern: 'shared/**' },
    ],
    'boundaries/ignore': ['src/index.ts', 'src/appPaths.ts'],
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          {
            from: 'http',
            allow: [
              'services', 'db', 'logger', 'errors', 'events', 'shared',
              'util', 'auth', 'rules', 'mteam', 'qbt', 'config', 'observability',
            ],
          },
          {
            from: 'workers',
            allow: [
              'db', 'logger', 'errors', 'events', 'shared', 'util', 'rules',
              'mteam', 'qbt', 'services', 'config', 'observability',
            ],
          },
          {
            from: 'services',
            allow: [
              'db', 'logger', 'errors', 'events', 'shared', 'util',
              'config', 'rules', 'qbt', 'mteam', 'observability',
            ],
          },
          { from: 'rules', allow: ['shared', 'util', 'errors'] },
          { from: 'mteam', allow: ['logger', 'errors', 'shared', 'util', 'observability', 'config'] },
          { from: 'qbt', allow: ['logger', 'errors', 'shared', 'util', 'observability', 'config'] },
          { from: 'auth', allow: ['logger', 'errors', 'shared', 'util', 'config', 'observability'] },
          { from: 'db', allow: ['logger', 'errors', 'shared', 'util'] },
          { from: 'logger', allow: ['shared', 'util', 'errors'] },
          { from: 'errors', allow: ['shared'] },
          { from: 'events', allow: ['shared', 'logger'] },
          { from: 'config', allow: ['errors', 'shared', 'util', 'logger'] },
          { from: 'observability', allow: ['shared', 'util'] },
          { from: 'util', allow: ['shared'] },
        ],
      },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
