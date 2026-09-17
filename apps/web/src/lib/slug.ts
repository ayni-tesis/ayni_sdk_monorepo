export function generateWorkspaceSlug(name: string): string {
  const normalized = name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const base = normalized.length > 0 ? normalized : "workspace";
  const suffix = Math.random().toString(36).substring(2, 7);
  return `${base}-${suffix}`;
}
