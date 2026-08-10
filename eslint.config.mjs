import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

// The seven business domains from CLAUDE.md §3.2 — kept in sync by hand,
// same list as @calepin/shared's BUSINESS_DOMAINS.
const DOMAINS = ["analysis", "direction", "bible", "outline", "manuscript", "coherence", "export"];

// ESLint *replaces* a rule's options on every override, it never merges them
// (CLAUDE.md §12). Every override below that re-declares no-restricted-imports
// therefore re-lists the shared patterns it still wants — as named constants,
// so forgetting one is visible in review instead of silently reopening a
// boundary.

// A package's public surface is its index (CLAUDE.md §3.4) — never reach into
// another package's src/ directly.
const REACH_INTO_SRC_PATTERN = {
  group: ["@calepin/*/src/*", "@calepin/*/src"],
  message: "Import a package's public entry point, not a path inside its src/.",
};

// No provider SDK outside @calepin/ai's adapters (CLAUDE.md §5, ADR-001,
// CAL-048). The list names every SDK a call site could plausibly reach for —
// first-party clients, cloud gateways and meta-frameworks alike; extend it
// rather than argue a new one is unlikely.
const PROVIDER_SDK_MESSAGE =
  "A model provider SDK lives only in @calepin/ai's adapters (CLAUDE.md §5, CAL-048). Go through the provider port instead.";

const PROVIDER_SDK_PATTERN = {
  group: [
    "@anthropic-ai/*",
    "openai",
    "@openai/*",
    "@azure/openai",
    "@azure-rest/ai-inference",
    "@google/genai",
    "@google/generative-ai",
    "@google-cloud/vertexai",
    "@aws-sdk/client-bedrock*",
    "@mistralai/*",
    "cohere-ai",
    "@cohere-ai/*",
    "groq-sdk",
    "together-ai",
    "ollama",
    "@ai-sdk/*",
  ],
  message: PROVIDER_SDK_MESSAGE,
};

// The Vercel AI SDK is published as the bare name `ai`, and that one cannot go
// in the group above. ESLint matches a `group` entry with minimatch's
// `matchBase`, so a pattern containing no slash is compared against the
// *basename* of the specifier — and the basename of `@calepin/ai` is `ai`. The
// bare entry therefore banned this repository's own AI layer everywhere,
// including `apps/web`, which §3.2 explicitly allows to import it. It went
// unnoticed until CAL-055 made `@calepin/manuscript` the first domain package
// to declare the dependency §3.2 has always permitted; the symptom named the
// provider-SDK rule, which is the last rule anyone would suspect of matching a
// workspace package. An anchored regex is exact and has no basename fallback.
const VERCEL_AI_SDK_PATTERN = {
  regex: "^ai(/.*)?$",
  message: PROVIDER_SDK_MESSAGE,
};

// @calepin/ai owns mechanics, never narrative meaning (CLAUDE.md §5.7): it may
// depend on @calepin/shared only.
const AI_DOMAIN_PATTERN = {
  group: DOMAINS.map((domain) => `@calepin/${domain}`),
  message:
    "@calepin/ai knows nothing about narrative meaning — it depends on @calepin/shared only (CLAUDE.md §3.2, §5).",
};

// packages/<domain> may depend on @calepin/shared and @calepin/ai only —
// never on another domain (CLAUDE.md §3.2, §5.3).
const domainBoundaryOverrides = DOMAINS.map((domain) => ({
  files: [`packages/${domain}/src/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          REACH_INTO_SRC_PATTERN,
          PROVIDER_SDK_PATTERN,
          VERCEL_AI_SDK_PATTERN,
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
  globalIgnores(["**/.next/**", "**/out/**", "**/build/**", "**/dist/**", "**/next-env.d.ts"]),

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
      "no-restricted-imports": [
        "error",
        {
          patterns: [REACH_INTO_SRC_PATTERN, PROVIDER_SDK_PATTERN, VERCEL_AI_SDK_PATTERN],
        },
      ],
    },
  },

  ...domainBoundaryOverrides,

  {
    // The AI layer itself is provider-neutral: outside adapters/, the SDK ban
    // holds there too, and a domain import is refused everywhere in it.
    files: ["packages/ai/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            REACH_INTO_SRC_PATTERN,
            PROVIDER_SDK_PATTERN,
            VERCEL_AI_SDK_PATTERN,
            AI_DOMAIN_PATTERN,
          ],
        },
      ],
    },
  },

  {
    // The one place a provider SDK may be imported (CAL-049, CAL-050). Must
    // come after the packages/ai block above: the later object wins.
    files: ["packages/ai/src/adapters/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [REACH_INTO_SRC_PATTERN, AI_DOMAIN_PATTERN],
        },
      ],
    },
  },

  {
    // @calepin/shared is the package everything else depends on — it must
    // never import a domain or the AI layer (CLAUDE.md §3.2).
    files: ["packages/shared/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            REACH_INTO_SRC_PATTERN,
            PROVIDER_SDK_PATTERN,
            VERCEL_AI_SDK_PATTERN,
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
    files: ["apps/web/**/*.{ts,tsx}", "apps/worker/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
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

  {
    // The owner access policy (CLAUDE.md §3.5, CAL-023). Every read and write of
    // project data goes through @calepin/shared/repository, which requires the
    // owner id explicitly — so the interface layer never holds a database
    // client it could query directly. The two exceptions are the composition
    // root and the startup hook that imports it, named here the way the
    // process.env rule above names its own.
    files: ["apps/web/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/lib/database.ts", "apps/web/src/instrumentation.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            REACH_INTO_SRC_PATTERN,
            PROVIDER_SDK_PATTERN,
            VERCEL_AI_SDK_PATTERN,
            {
              group: [
                "@prisma/client",
                "@prisma/*",
                ".prisma/*",
                "@calepin/shared/database",
                "**/lib/database",
                "**/lib/database.js",
              ],
              message:
                "A route, a page or a server action never talks to the database. Read and write project data through @calepin/shared/repository, which requires the owner id (CLAUDE.md §3.5).",
            },
          ],
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
