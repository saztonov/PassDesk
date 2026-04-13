module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  extends: ["eslint:recommended"],
  ignorePatterns: [
    "node_modules/",
    "reports/",
    "migrations/",
    "client/",
  ],
  rules: {
    "no-console": "off",
    "no-undef": "off",
    "no-constant-condition": "off",
    "no-control-regex": "off",
    "no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
  },
};
