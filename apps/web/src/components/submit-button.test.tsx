import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SubmitButton } from "./submit-button";

describe("SubmitButton", () => {
  // The screen has to work with JavaScript off, which means this is a real
  // submit button — not a `type="button"` with an `onClick`.
  it("renders a real submit button with an accessible name", () => {
    const html = renderToStaticMarkup(
      <SubmitButton pendingLabel="En cours…">Valider</SubmitButton>,
    );

    expect(html).toContain('type="submit"');
    expect(html).toContain("Valider");
  });

  // `useFormStatus` reports no pending form during a static render, which is
  // also what a first server-rendered response should show.
  it("is enabled and idle before the form is submitted", () => {
    const html = renderToStaticMarkup(
      <SubmitButton pendingLabel="En cours…">Valider</SubmitButton>,
    );

    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain("En cours…");
  });

  it("renders the danger variant with its own accessible name", () => {
    const html = renderToStaticMarkup(
      <SubmitButton pendingLabel="Suppression…" variant="danger">
        Supprimer
      </SubmitButton>,
    );

    expect(html).toContain('type="submit"');
    expect(html).toContain("Supprimer");
  });
});
