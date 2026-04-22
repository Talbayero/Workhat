import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Allow 'any' types in test files (mocking Supabase clients)
  {
    files: ["**/__tests__/**/*.ts", "**/__tests__/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Allow require() in config files
  {
    files: ["jest.config.js", "next.config.js", "postcss.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
