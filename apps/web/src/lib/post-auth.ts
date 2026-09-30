import type { Route } from "next";

export const DEFAULT_POST_AUTH_PATH: Route = "/dashboard";

export function getSafePostAuthRedirect(search: string): Route {
  const next = new URLSearchParams(search).get("next");
  if (next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
    return next as Route;
  }
  return DEFAULT_POST_AUTH_PATH;
}

export function getBrowserPostAuthRedirect(): Route {
  if (typeof window === "undefined") return DEFAULT_POST_AUTH_PATH;
  return getSafePostAuthRedirect(window.location.search);
}

export function joinSignInRedirect(token?: string): Route {
  const next = token ? `/join?token=${encodeURIComponent(token)}` : "/join";
  return `/sign-in?next=${encodeURIComponent(next)}` as Route;
}
