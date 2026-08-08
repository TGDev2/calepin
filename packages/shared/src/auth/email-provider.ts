/**
 * The email sign-in link provider (CAL-025).
 *
 * Built as a plain `NodemailerConfig` object rather than through `@auth/core`'s
 * `Nodemailer()` factory: that factory requires a truthy `server` and merges
 * its defaults with the config it is given, neither of which this provider
 * needs — `sendVerificationRequest` is entirely our own, and the transporter
 * that sends through it is resolved once, at construction, from `options`
 * below.
 *
 * `apps/web` supplies only the SMTP settings it read from `env` (§4.2); it
 * never holds a `nodemailer` `Transporter` itself; building one is this
 * module's job, the same division `adapter.ts` draws for `@auth/prisma-adapter`.
 * A test imports `createEmailProvider` directly and passes `transport` to
 * replace the real SMTP connection with a capturing fake — matching
 * CLAUDE.md §8's "never call a real provider in a test", applied to email.
 */

import type { NodemailerConfig } from "@auth/core/providers/nodemailer";
import { createTransport, type Transporter } from "nodemailer";
import type * as SMTPTransport from "nodemailer/lib/smtp-transport/index.js";

import { getDatabaseClient } from "../database/client";
import { ProviderError } from "../errors/app-error";
import { assertEmailSignInAllowed } from "./rate-limit";

/** How long a link stays valid, in seconds — fifteen minutes. */
export const EMAIL_SIGN_IN_MAX_AGE_SECONDS = 15 * 60;

export interface EmailProviderOptions {
  /** The address the link appears to come from. */
  readonly from: string;
  /** The SMTP server to send through. */
  readonly server: SMTPTransport.Options;
  /**
   * A pre-built transporter, replacing `server`. For a test that must not
   * open a real SMTP connection — never set by `apps/web`.
   */
  readonly transport?: Transporter;
}

/** The sober French copy of the sign-in message — subject, text and HTML. */
export function buildSignInEmail(url: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "Connexion à Calepin";

  const text = [
    "Bonjour,",
    "",
    "Voici votre lien de connexion à Calepin :",
    url,
    "",
    "Ce lien est à usage unique et expire dans 15 minutes.",
    "",
    "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#ffffff;font-family:sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
      <tr>
        <td>
          <p style="font-size:16px;line-height:1.5;">Bonjour,</p>
          <p style="font-size:16px;line-height:1.5;">
            Voici votre lien de connexion à Calepin :
          </p>
          <p style="margin:24px 0;">
            <a href="${url}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:4px;font-size:16px;">
              Se connecter
            </a>
          </p>
          <p style="font-size:14px;line-height:1.5;color:#555555;">
            Ce lien est à usage unique et expire dans 15 minutes.
          </p>
          <p style="font-size:14px;line-height:1.5;color:#555555;">
            Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

/**
 * Builds the Auth.js email provider: the sober French template, a
 * fifteen-minute link, and the five-per-hour limit of `rate-limit.ts`.
 */
export function createEmailProvider(options: EmailProviderOptions): NodemailerConfig {
  const transporter = options.transport ?? createTransport(options.server);

  return {
    id: "email",
    type: "email",
    name: "Adresse électronique",
    from: options.from,
    maxAge: EMAIL_SIGN_IN_MAX_AGE_SECONDS,
    async sendVerificationRequest({ identifier, url }) {
      // The gate, before anything is sent — see this file's header comment
      // for why it cannot live in `adapter.createVerificationToken` instead.
      await assertEmailSignInAllowed(getDatabaseClient(), identifier);

      const message = buildSignInEmail(url);
      const result = await transporter.sendMail({
        to: identifier,
        from: options.from,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);

      if (failed.length > 0) {
        throw new ProviderError({
          message: "the email sign-in link could not be delivered",
        });
      }
    },
  };
}
