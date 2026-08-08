import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SignOutButton } from "./sign-out-button";

describe("SignOutButton", () => {
  it("renders a real button with an accessible name", () => {
    const html = renderToStaticMarkup(<SignOutButton />);

    expect(html).toContain("<button");
    expect(html).toContain("Se déconnecter");
  });

  it("is not disabled before it is clicked", () => {
    const html = renderToStaticMarkup(<SignOutButton />);

    expect(html).not.toContain('disabled=""');
  });
});
