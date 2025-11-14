module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  extends: ['airbnb-base', 'plugin:unicorn/recommended', 'plugin:prettier/recommended'],
  plugins: ['@typescript-eslint', 'security'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.ts'],
      },
    },
  },
  overrides: [
    {
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      extends: ['airbnb-base', 'plugin:@typescript-eslint/recommended', 'plugin:unicorn/recommended', 'plugin:prettier/recommended'],
      rules: {
        'import/extensions': [
          'error',
          'ignorePackages',
          {
            js: 'always',
            ts: 'never',
          },
        ],
      },
    },
    {
      files: ['**/*.js'],
      rules: {
        'import/extensions': [
          'error',
          'ignorePackages',
          {
            js: 'always',
          },
        ],
      },
    },
  ],
  rules: {
    'no-console': 'off',
    'no-use-before-define': [
      'error',
      {
        functions: false,
        classes: false,
        variables: false,
      },
    ],
    'prefer-destructuring': 'off',
    'no-restricted-syntax': 'off',
    'no-continue': 'off',
    'no-return-await': 'off',
    'no-unneeded-ternary': 'off',
    'consistent-return': 'off',
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'always',
        ts: 'never',
      },
    ],
    'prettier/prettier': 'off',
    'security/detect-object-injection': 'off',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-unsafe-regex': 'error',
    'unicorn/no-null': 'off',
    'unicorn/no-array-for-each': 'off',
    'unicorn/no-array-callback-reference': 'off',
    'unicorn/prefer-logical-operator-over-ternary': 'off',
    'unicorn/no-typeof-undefined': 'off',
    'unicorn/catch-error-name': 'off',
    'unicorn/prefer-optional-catch-binding': 'off',
    'unicorn/prefer-string-replace-all': 'off',
    'unicorn/switch-case-braces': 'off',
    'unicorn/prevent-abbreviations': [
      'error',
      {
        allowList: {
          req: true,
          res: true,
          params: true,
          env: true,
          err: true,
          obj: true,
        },
      },
    ],
  },
  ignorePatterns: ['node_modules/', 'dist/', 'assets/', 'components/', '*.html', 'tests/fixtures/'],
};
