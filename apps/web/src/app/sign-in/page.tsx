import { redirect } from "next/navigation";

import { SignInForm } from "@/components/sign-in-form";
import { sanitizeCallbackUrl } from "@/lib/callback-url";
import { getCurrentUser } from "@/lib/current-user";
import { signInErrorMessage } from "@/lib/sign-in-error-message";

import styles from "./page.module.css";

/**
 * The single sign-in / sign-up screen (CAL-028).
 *
 * A visitor already holding a session has no reason to see this page — the
 * same `getCurrentUser()` call `AccountBar` already reads server-side sends
 * them onward: to `callbackUrl` when `proxy.ts` sent them here from a
 * protected route (CAL-030), to the home page otherwise.
 *
 * `?error=` is how Auth.js reports a failed OAuth callback (a full-page
 * redirect, `apps/web/src/lib/auth.ts`'s `pages.error`). Reading and mapping
 * it here — rather than with `useSearchParams()` client-side — means the
 * message is part of the first server-rendered response, visible even with
 * JavaScript disabled.
 */
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl);

  const user = await getCurrentUser();
  if (user) redirect(callbackUrl);

  const errorParam = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <main className={styles.main}>
      <SignInForm initialError={signInErrorMessage(errorParam)} callbackUrl={callbackUrl} />
    </main>
  );
}
