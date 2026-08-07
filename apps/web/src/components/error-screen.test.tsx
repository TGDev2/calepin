import { GENERIC_ERROR_TITLE, NOT_FOUND_MESSAGE, USER_MESSAGES } from "@calepin/shared/errors";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorScreen } from "./error-screen";

/** Stands in for anything technical a boundary could let slip. */
const TECHNICAL_MARKER = "TECHNICAL-MARKER-7c31a9f5";

describe("ErrorScreen", () => {
  it("shows the French title and message it is given", () => {
    const html = renderToStaticMarkup(
      <ErrorScreen title={GENERIC_ERROR_TITLE} message={USER_MESSAGES.internal} />,
    );

    expect(html).toContain(GENERIC_ERROR_TITLE);
    expect(html).toContain("Votre projet est intact");
  });

  it("shows the reference when there is one, and nothing when there is not", () => {
    const withReference = renderToStaticMarkup(
      <ErrorScreen title="Erreur" message={USER_MESSAGES.provider} reference="3520148804" />,
    );
    const without = renderToStaticMarkup(
      <ErrorScreen title="Erreur" message={USER_MESSAGES.provider} />,
    );

    expect(withReference).toContain("3520148804");
    expect(withReference).toContain("Référence");
    expect(without).not.toContain("Référence");
  });

  it("renders the action it is handed", () => {
    const html = renderToStaticMarkup(
      <ErrorScreen
        title="Erreur"
        message={USER_MESSAGES.internal}
        action={<button type="button">Réessayer</button>}
      />,
    );

    expect(html).toContain("Réessayer");
  });

  it("serves a missing page as well as a failure", () => {
    const html = renderToStaticMarkup(
      <ErrorScreen title="Page introuvable" message={NOT_FOUND_MESSAGE} />,
    );

    expect(html).toContain("Page introuvable");
  });

  it("has no way to render an error, because it is never given one", () => {
    // The guarantee is structural: the props are a title, a message, a
    // reference and a node. There is no `error` prop to leak — in production,
    // where Next replaces the message, or in development, where it does not.
    const html = renderToStaticMarkup(
      <ErrorScreen
        title={GENERIC_ERROR_TITLE}
        message={USER_MESSAGES.internal}
        reference={undefined}
        // @ts-expect-error — accepting an error is the mistake this component
        // exists to make impossible. Widening the props would make this
        // directive unused and fail `pnpm typecheck`.
        error={new Error(TECHNICAL_MARKER)}
      />,
    );

    expect(html).not.toContain(TECHNICAL_MARKER);
  });
});
