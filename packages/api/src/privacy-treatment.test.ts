import { describe, expect, it } from "vitest";
import {
  isPrivacyMapComplete,
  missingPrivacyTreatmentFields,
  type PrivacyTreatment,
  updatePrivacyMapSchema,
} from "./privacy-treatment";

const completeTreatment: PrivacyTreatment = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  purpose: "Enviar telemetría técnica",
  dataCategories: ["Versión del SDK"],
  dataContext: "ayniPlatform",
  source: "Dispositivo",
  requirement: "optional",
  legalBasis: "Confirmar con asesoría legal",
  legalBasisConfirmed: true,
  role: "processor",
  recipients: ["Proveedor de almacenamiento"],
  transfers: "No aplica",
  retention: "30 días",
  rightsChannel: "privacidad@example.test",
};

describe("privacy treatment map", () => {
  it("is ready only when every treatment has its role and required details", () => {
    expect(isPrivacyMapComplete([completeTreatment])).toBe(true);
    expect(isPrivacyMapComplete([{ ...completeTreatment, role: "undetermined" }])).toBe(false);
    expect(isPrivacyMapComplete([{ ...completeTreatment, legalBasisConfirmed: false }])).toBe(
      false,
    );
    expect(isPrivacyMapComplete([])).toBe(false);
  });

  it("returns the specific details that still need confirmation", () => {
    expect(
      missingPrivacyTreatmentFields({
        ...completeTreatment,
        role: "undetermined",
        legalBasisConfirmed: false,
      }),
    ).toEqual(["legalBasis", "role"]);
  });

  it("rejects duplicate identifiers and undeclared fields", () => {
    expect(
      updatePrivacyMapSchema.safeParse({
        treatments: [completeTreatment, completeTreatment],
      }).success,
    ).toBe(false);
    expect(
      updatePrivacyMapSchema.safeParse({
        treatments: [{ ...completeTreatment, secret: "unexpected" }],
      }).success,
    ).toBe(false);
  });
});
