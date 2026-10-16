import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type Mail from "nodemailer/lib/mailer/index.js";

/**
 * Compile a message to raw MIME. File and URL access are disabled so a
 * `{ path }` / `{ href }` value smuggled into any field can never make the
 * server read local files or fetch internal URLs.
 */
export function buildMime(options: Mail.Options): Promise<Buffer> {
  const mail = new MailComposer({
    ...options,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return new Promise((resolve, reject) => {
    mail.compile().build((err: Error | null, message: Buffer) => {
      if (err) reject(err);
      else resolve(message);
    });
  });
}
