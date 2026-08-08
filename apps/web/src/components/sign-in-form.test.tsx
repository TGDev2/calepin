import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SignInForm } from "./sign-in-form";

/** Pulls `htmlFor="x"` out of a label tag, for the association assertion below. */
function labelTargetId(html: string): string | null {
  const match = /<label[^>]*for="([^"]+)"/.exec(html);
  return match?.[1] ?? null;
}

describe("SignInForm", () => {
  it("associates the email label with the email input", () => {
    const html = renderToStaticMarkup(<SignInForm initialError={null} callbackUrl="/" />);

    const forId = labelTargetId(html);
    expect(forId).not.toBeNull();
    expect(html).toContain(`id="${forId}"`);
    expect(html).toContain("Adresse électronique");
  });

  it("marks the email field as required for assistive technology", () => {
    const html = renderToStaticMarkup(<SignInForm initialError={null} callbackUrl="/" />);

    expect(html).toContain('required=""');
    expect(html).toContain('aria-required="true"');
  });

  it("offers all three sign-in methods, each with a real accessible name", () => {
    const html = renderToStaticMarkup(<SignInForm initialError={null} callbackUrl="/" />);

    expect(html).toContain("Recevoir le lien de connexion");
    expect(html).toContain("Continuer avec Google");
    expect(html).toContain("Continuer avec GitHub");
  });

  it("renders no error banner when there is nothing to report", () => {
    const html = renderToStaticMarkup(<SignInForm initialError={null} callbackUrl="/" />);

    expect(html).not.toContain('role="alert"');
  });

  it("shows the given error, announced, when the page loads with one", () => {
    // No apostrophe in this one — React HTML-escapes it (`&#x27;`) in static
    // markup, which would make a literal `toContain` of the raw string fail.
    const message = "Ce lien de connexion a déjà été utilisé ou a expiré.";
    const html = renderToStaticMarkup(<SignInForm initialError={message} callbackUrl="/" />);

    expect(html).toContain('role="alert"');
    expect(html).toContain(message);
  });

  it("never renders color as the only signal on an error — text goes with it", () => {
    const message = "La connexion a échoué. Réessayez dans un instant.";
    const html = renderToStaticMarkup(<SignInForm initialError={message} callbackUrl="/" />);

    expect(html).toContain("Erreur");
    expect(html).toContain('aria-hidden="true"');
  });
});
