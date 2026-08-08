/**
 * The Auth.js endpoints (CAL-024): `/api/auth/session`, `/api/auth/signout`,
 * `/api/auth/csrf`, and one callback per provider once E02 adds them.
 *
 * The whole file is a re-export. Everything it serves is decided in
 * `src/lib/auth.ts`; a handler with logic of its own would be a second place
 * authentication is configured.
 */

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
