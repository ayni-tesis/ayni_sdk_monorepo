export const CURRENT_TERMS_VERSION = "1.0.0";

export function hasAcceptedCurrentTerms(version: unknown) {
  return version === CURRENT_TERMS_VERSION;
}
