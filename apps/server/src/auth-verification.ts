export function redirectAfterEmailVerificationFailure(
  request: Request,
  status: number,
  trustedOrigins: string[],
) {
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.pathname !== "/api/auth/verify-email") return null;
  const error = status >= 500 ? "FAILED_TO_VERIFY" : status >= 400 ? "INVALID_TOKEN" : null;
  if (!error) return null;

  const callbackURL = requestUrl.searchParams.get("callbackURL");
  if (!callbackURL) return null;

  let redirectURL: URL;
  try {
    redirectURL = new URL(callbackURL, requestUrl);
  } catch {
    return null;
  }
  const allowedOrigins = trustedOrigins.map((origin) => new URL(origin).origin);
  if (!allowedOrigins.includes(redirectURL.origin)) return null;

  redirectURL.searchParams.set("error", error);
  return Response.redirect(redirectURL.toString(), 302);
}

export function verificationSucceeded(response: Response, request: Request, claimCompleted = true) {
  if (!claimCompleted || response.status >= 400) return false;
  const location = response.headers.get("location");
  if (!location) return true;

  const callbackURL = new URL(request.url).searchParams.get("callbackURL");
  if (!callbackURL) return false;
  try {
    return new URL(location, request.url).href === new URL(callbackURL, request.url).href;
  } catch {
    return false;
  }
}
