export function generateWorkspaceSlug(name: string): string {
  const normalized = name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const base = normalized.length > 0 ? normalized : "workspace";
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 10);
  return `${base}-${suffix}`;
}
