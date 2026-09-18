export const DEFAULT_POST_AUTH_PATH = "/dashboard";

export function getSafePostAuthRedirect(search: string): string {
  const next = new URLSearchParams(search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
    return next;
  }
  return DEFAULT_POST_AUTH_PATH;
}

export function getBrowserPostAuthRedirect(): string {
  if (typeof window === "undefined") return DEFAULT_POST_AUTH_PATH;
  return getSafePostAuthRedirect(window.location.search);
}

export function joinLoginRedirect(token?: string): string {
  const next = token ? `/join?token=${encodeURIComponent(token)}` : "/join";
  return `/login?next=${encodeURIComponent(next)}`;
}
