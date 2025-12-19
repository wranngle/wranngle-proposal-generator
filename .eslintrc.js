module.exports = {
  env: {
    node: true,
    es2022: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // Error Prevention
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // CLI tool needs console output
    'no-undef': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': 'warn',

    // Code Quality
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'multi-line'],
    'no-throw-literal': 'error',

    // Import/Export
    'no-duplicate-imports': 'error',

    // Async/Promise
    'no-async-promise-executor': 'error',
    'require-await': 'warn',
    'no-return-await': 'warn',

    // Style (minimal - let formatting tools handle the rest)
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'comma-dangle': ['error', 'never'],
    'no-trailing-spaces': 'error',
    'eol-last': ['error', 'always'],
    'no-multiple-empty-lines': ['error', { max: 2 }]
  },
  overrides: [
    {
      // Test files
      files: ['test/**/*.js'],
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly'
      }
    },
    {
      // Config files (CommonJS)
      files: ['*.config.js', '.eslintrc.js'],
      parserOptions: {
        sourceType: 'script'
      },
      env: {
        commonjs: true
      }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'test_output/',
    'old/',
    '*.min.js'
  ]
};
