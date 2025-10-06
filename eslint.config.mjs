import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  // {
  //   rules: {
  //     // Relax some rules for better developer experience
  //     "@typescript-eslint/no-explicit-any": "warn", // Warn instead of error
  //     "@typescript-eslint/no-unused-vars": [
  //       "warn",
  //       {
  //         "argsIgnorePattern": "^_", // Allow unused vars starting with _
  //         "varsIgnorePattern": "^_",
  //       }
  //     ],
  //     "react/no-unescaped-entities": "warn",
  //     "@typescript-eslint/no-require-imports": "warn",
  //   },
  // },
];

export default eslintConfig;
