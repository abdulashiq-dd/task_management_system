// Optional ESLint configuration (install ESLint separately when desired).
module.exports = [{ files: ["**/*.js"], ignores: ["node_modules/**", "exports/**"], languageOptions: { ecmaVersion: 2024, sourceType: "commonjs" }, rules: { "no-unreachable": "error", "no-dupe-keys": "error", "no-constant-condition": "error" } }];
