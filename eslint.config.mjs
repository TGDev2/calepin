import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

// The seven business domains from CLAUDE.md §3.2 — kept in sync by hand,
// same list as @calepin/shared's BUSINESS_DOMAINS.
const DOMAINS = [
  "analysis",
  "direction",
  "bible",
  "outline",
  "manuscript",
  "coherence",
  "export",
];

// packages/<domain> may depend on @calepin/shared and @calepin/ai only —
// never on another domain (CLAUDE.md §3.2, §5.3).
const domainBoundaryOverrides = DOMAINS.map((domain) => ({
  files: [`packages/${domain}/src/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: DOMAINS.filter((other) => other !== domain).map((other) => `@calepin/${other}`),
            message:
              "A domain package may only depend on @calepin/shared and @calepin/ai. Declare the dependency explicitly and reconsider whether the shared concept belongs in @calepin/shared instead.",
          },
        ],
      },
    ],
  },
}));

const eslintConfig = defineConfig([
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/dist/**",
    "**/next-env.d.ts",
  ]),

  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended, tseslint.configs.strict],
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "no-duplicate-imports": "error",
      // A package's public surface is its index (CLAUDE.md §3.4) — never
      // reach into another package's src/ directly.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@calepin/*/src/*", "@calepin/*/src"],
              message: "Import a package's public entry point, not a path inside its src/.",
            },
          ],
        },
      ],
    },
  },

  ...domainBoundaryOverrides,

  {
    // @calepin/shared is the package everything else depends on — it must
    // never import a domain or the AI layer (CLAUDE.md §3.2).
    files: ["packages/shared/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@calepin/*"],
              message: "@calepin/shared must depend on nothing.",
            },
          ],
        },
      ],
    },
  },

  {
    // process.env is read in exactly one place — the validated config module
    // (CLAUDE.md §4.2, §13 CAL-006). Everywhere else imports
    // @calepin/shared/config. The three ignored files are framework/test
    // wiring that runs before or outside that config: Next's own runtime
    // flag, Playwright's CI convention.
    files: ["apps/web/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    ignores: [
      "packages/shared/src/config/env.ts",
      "apps/web/src/instrumentation.ts",
      "apps/web/playwright.config.ts",
    ],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Do not read process.env directly — import the validated config from @calepin/shared/config instead.",
        },
      ],
    },
  },

  ...nextVitals.map((config) => ({
    ...config,
    files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
    settings: { ...config.settings, next: { rootDir: "apps/web/" } },
  })),
  ...nextTs.map((config) => ({
    ...config,
    files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
    settings: { ...config.settings, next: { rootDir: "apps/web/" } },
  })),

  prettierConfig,
]);

export default eslintConfig;
