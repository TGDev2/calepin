import "./globals.css";

import { APP_NAME } from "@calepin/shared";
import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";

import { AccountBar } from "@/components/account-bar";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Accompagnement de l'écriture d'un roman, du texte source au manuscrit exporté.",
};

/**
 * `SessionProvider` is what makes the session readable client-side (CAL-024):
 * it fetches `/api/auth/session` once and every `useSession` below it reads
 * that answer instead of its own request.
 *
 * The session is deliberately **not** passed to it from the server. Handing a
 * server-read session to the provider would make the two halves the same read,
 * and the point of `AccountBar` is that they are not — the client half proves
 * the endpoint answers, the server half proves `auth()` does.
 *
 * `AccountBar` calls `auth()`, which reads cookies, so every route below this
 * layout renders dynamically from here on. That is the cost of an
 * authenticated application, and it arrives with the session rather than later.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>
        <SessionProvider>
          <AccountBar />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
