import { expect, test } from "@playwright/test";

const BUSINESS_DOMAINS = [
  "analysis",
  "direction",
  "bible",
  "outline",
  "manuscript",
  "coherence",
  "export",
];

test("home page renders the app name and every business domain", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Calepin" })).toBeVisible();

  for (const domain of BUSINESS_DOMAINS) {
    await expect(page.getByText(domain)).toBeVisible();
  }
});
