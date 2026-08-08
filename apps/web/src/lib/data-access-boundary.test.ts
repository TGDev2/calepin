/**
 * CAL-023's second acceptance criterion, at the entry points of the application:
 * **a direct database call from a route or a server action is refused.**
 *
 * The refusal is a lint rule, and a lint rule that stops firing fails silently —
 * a config reorganised, a glob narrowed, an exemption widened, and every route
 * in the app can query whatever it likes again. So the rule is executed here
 * rather than trusted: ESLint runs over the real repository configuration, once
 * per file that exists in `apps/web/src`, with every spelling of a database
 * import a call site could reach for.
 *
 * The file list is discovered, never written down. A route handler or a server
 * action added by any later task is picked up the moment it exists, which is
 * what makes this suite an answer to "for each exposed entry point" and not a
 * snapshot of the four pages that happen to exist today.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SOURCE_ROOT = join(APP_ROOT, "src");

/**
 * The two files allowed to name the database, and the whole list.
 *
 * `lib/database.ts` composes the client; `instrumentation.ts` imports it at
 * boot. Everything else in the application reaches project data through
 * `@calepin/shared/repository`, which requires the owner id.
 */
const COMPOSITION_ROOT = ["src/instrumentation.ts", "src/lib/database.ts"];

/**
 * The route conventions of the App Router, plus the proxy. Not the file list —
 * the list is discovered below — but a floor: if none of these turns up, the
 * discovery is broken and the suite would be passing over nothing.
 */
const ROUTE_CONVENTIONS = ["page.tsx", "layout.tsx", "route.ts", "proxy.ts"];

/** Every spelling of "give me the database" a call site could reach for. */
const FORBIDDEN_IMPORTS = [
  'import { PrismaClient } from "@prisma/client";',
  'import { getDatabaseClient } from "@calepin/shared/database";',
  'import { database } from "@/lib/database";',
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);

    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** `apps/web`-relative, forward slashes, so the assertions read the same on any OS. */
function appPath(path: string): string {
  return relative(APP_ROOT, path).split(sep).join("/");
}

const files = sourceFiles(SOURCE_ROOT).map(appPath).sort();
const guarded = files.filter((path) => !COMPOSITION_ROOT.includes(path));

describe("the data-access boundary of apps/web", () => {
  let eslint: ESLint;

  beforeAll(() => {
    // The real configuration, resolved from the repository root exactly as
    // `pnpm lint` resolves it. A rule asserted against a hand-built config
    // would prove something about the test, not about the repository.
    eslint = new ESLint({ cwd: REPO_ROOT });
  });

  async function restrictedImportsIn(path: string): Promise<string[]> {
    const [result] = await eslint.lintText(`${FORBIDDEN_IMPORTS.join("\n")}\nexport {};\n`, {
      filePath: join(APP_ROOT, path),
    });

    return (result?.messages ?? [])
      .filter((message) => message.ruleId === "no-restricted-imports")
      .map((message) => message.message);
  }

  it("finds the application's entry points at all", () => {
    expect(guarded.length).toBeGreaterThan(0);

    const conventions = files.filter((path) =>
      ROUTE_CONVENTIONS.some((convention) => path.endsWith(`/${convention}`)),
    );
    expect(conventions.length).toBeGreaterThan(0);
  });

  it("names the composition root, and it is two files that exist", () => {
    for (const path of COMPOSITION_ROOT) expect(files).toContain(path);
    expect(COMPOSITION_ROOT).toHaveLength(2);
  });

  // The criterion, file by file. Every one of the three spellings is refused,
  // in every file of the application but the two that compose the client.
  it.each(guarded)("refuses a direct database import in %s", async (path) => {
    expect(await restrictedImportsIn(path)).toHaveLength(FORBIDDEN_IMPORTS.length);
  });

  it.each(COMPOSITION_ROOT)("lets %s hold the client", async (path) => {
    expect(await restrictedImportsIn(path)).toEqual([]);
  });

  // The repository is what a route is supposed to import, so the rule must not
  // have been written so broadly that it bans the replacement too.
  it("leaves the repository importable from a route", async () => {
    const [result] = await eslint.lintText(
      'import { listProjectsForOwner } from "@calepin/shared/repository";\nexport { listProjectsForOwner };\n',
      { filePath: join(APP_ROOT, "src/app/page.tsx") },
    );

    expect(
      (result?.messages ?? []).filter((message) => message.ruleId === "no-restricted-imports"),
    ).toEqual([]);
  });
});
