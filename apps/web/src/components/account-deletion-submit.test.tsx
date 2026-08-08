import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccountDeletionSubmit } from "./account-deletion-submit";

describe("AccountDeletionSubmit", () => {
  // The screen has to work with JavaScript off, which means the form is a real
  // form and this is a real submit button — not a `type="button"` with an
  // `onClick`, which would leave a no-JS visitor unable to delete their
  // account at all.
  it("renders a real submit button with an accessible name", () => {
    const html = renderToStaticMarkup(<AccountDeletionSubmit />);

    expect(html).toContain('type="submit"');
    expect(html).toContain("Supprimer définitivement mon compte");
  });

  // `useFormStatus` reports no pending form during a static render, which is
  // also what a first server-rendered response should show.
  it("is enabled and idle before the form is submitted", () => {
    const html = renderToStaticMarkup(<AccountDeletionSubmit />);

    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain("Suppression…");
  });
});
