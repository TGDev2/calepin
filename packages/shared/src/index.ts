/**
 * @calepin/shared — cross-cutting primitives shared by every domain.
 *
 * This package is the only one every other package is allowed to depend on.
 * It must never import a business domain: that would create a cycle and defeat
 * the boundary the workspace layout exists to enforce.
 */

export const APP_NAME = "Calepin";

/**
 * The seven business domains, in the order a manuscript actually travels
 * through them: a source text is analysed, a direction is chosen, the bible and
 * the outline are built from it, chapters are written, coherence is checked,
 * and the result is exported.
 *
 * `shared` is deliberately absent — it is a support package, not a domain.
 */
export const BUSINESS_DOMAINS = [
  "analysis",
  "direction",
  "bible",
  "outline",
  "manuscript",
  "coherence",
  "export",
] as const;

export type BusinessDomain = (typeof BUSINESS_DOMAINS)[number];
