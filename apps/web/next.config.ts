import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next regenerates `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` on every dev
   * run. This repository keeps its agent instructions in the root `CLAUDE.md`;
   * a second, machine-written copy one directory down would silently compete
   * with it.
   */
  agentRules: false,

  /**
   * The domain packages are consumed as TypeScript source rather than as build
   * artefacts, so there is no per-package build step to keep in sync. Next has
   * to compile them itself, which is what this list is for.
   *
   * Add a package here when you create it under `packages/`.
   */
  transpilePackages: [
    "@calepin/shared",
    "@calepin/analysis",
    "@calepin/direction",
    "@calepin/bible",
    "@calepin/outline",
    "@calepin/manuscript",
    "@calepin/coherence",
    "@calepin/export",
  ],
};

export default nextConfig;
