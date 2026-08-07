import "./globals.css";

import { APP_NAME } from "@calepin/shared";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "Accompagnement de l'écriture d'un roman, du texte source au manuscrit exporté.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
