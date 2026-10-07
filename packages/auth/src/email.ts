import { env } from "@ayni/env/server";

export async function sendAyniEmail(to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY must be configured to send account email.");
  }
  if (!env.RESEND_FROM_EMAIL) {
    throw new Error("RESEND_FROM_EMAIL must be configured to send account email.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend email request failed with status ${response.status}.`);
  }
}
