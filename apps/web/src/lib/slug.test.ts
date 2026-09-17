import { describe, expect, it } from "vitest";
import { generateWorkspaceSlug } from "./slug";

describe("generateWorkspaceSlug", () => {
  it("converts name with spaces and special characters to kebab-case with a collision-resistant suffix", () => {
    const slug = generateWorkspaceSlug("Laboratorio Central");
    expect(slug).toMatch(/^laboratorio-central-[a-z0-9]{10,}$/);
  });

  it("removes accents and diacritics", () => {
    const slug = generateWorkspaceSlug("Café y Té");
    expect(slug).toMatch(/^cafe-y-te-[a-z0-9]+$/);
  });

  it("falls back to 'workspace' prefix when name has no alphanumeric characters", () => {
    const slug = generateWorkspaceSlug("   ");
    expect(slug).toMatch(/^workspace-[a-z0-9]+$/);
  });

  it("generates different slugs for the same name to prevent collisions", () => {
    const slug1 = generateWorkspaceSlug("Ayni");
    const slug2 = generateWorkspaceSlug("Ayni");
    expect(slug1).not.toBe(slug2);
  });
});
