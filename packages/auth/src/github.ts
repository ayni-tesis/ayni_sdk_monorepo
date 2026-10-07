import { hasAcceptedCurrentTerms } from "@ayni/env/terms";

const githubApiHeaders = (accessToken: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${accessToken}`,
  "User-Agent": "ayni",
  "X-GitHub-Api-Version": "2022-11-28",
});

export async function getGitHubUserInfo(
  accessToken: string | undefined,
  termsAcceptedVersion: unknown,
) {
  if (!accessToken || !hasAcceptedCurrentTerms(termsAcceptedVersion)) return null;

  try {
    const headers = githubApiHeaders(accessToken);
    const [profileResponse, emailsResponse] = await Promise.all([
      fetch("https://api.github.com/user", { headers }),
      fetch("https://api.github.com/user/emails", { headers }),
    ]);
    if (!profileResponse.ok) return null;

    const profile = await profileResponse.json();
    if (
      typeof profile !== "object" ||
      profile === null ||
      !("id" in profile) ||
      (typeof profile.id !== "string" && typeof profile.id !== "number") ||
      String(profile.id).length === 0
    ) {
      return null;
    }
    const githubProfile = profile as {
      id: string | number;
      avatar_url?: unknown;
      login?: unknown;
      name?: unknown;
    };

    const emails = emailsResponse.ok ? await emailsResponse.json() : [];
    const verifiedEmail = Array.isArray(emails)
      ? (emails.find(
          (email) =>
            typeof email === "object" &&
            email !== null &&
            email.verified === true &&
            email.primary === true &&
            typeof email.email === "string",
        ) ??
        emails.find(
          (email) =>
            typeof email === "object" &&
            email !== null &&
            email.verified === true &&
            typeof email.email === "string",
        ))
      : undefined;

    const name =
      typeof githubProfile.name === "string" && githubProfile.name.trim()
        ? githubProfile.name.trim()
        : typeof githubProfile.login === "string"
          ? githubProfile.login
          : "";
    if (!name) return null;

    return {
      user: {
        id: String(githubProfile.id),
        name,
        ...(verifiedEmail ? { email: verifiedEmail.email as string } : {}),
        emailVerified: Boolean(verifiedEmail),
        ...(typeof githubProfile.avatar_url === "string"
          ? { image: githubProfile.avatar_url }
          : {}),
      },
      data: profile,
    };
  } catch {
    return null;
  }
}
