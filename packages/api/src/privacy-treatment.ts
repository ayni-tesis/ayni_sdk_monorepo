import { z } from "zod";

export const PRIVACY_TREATMENT_ROLES = ["controller", "processor", "undetermined"] as const;
export const PRIVACY_TREATMENT_REQUIREMENTS = ["required", "optional", "undetermined"] as const;
export const MAX_PRIVACY_TREATMENTS = 50;
export const PRIVACY_TREATMENT_CONTEXTS = [
  "ayniPlatform",
  "clientApplication",
  "undetermined",
] as const;

export const privacyTreatmentSchema = z.strictObject({
  id: z.uuid(),
  purpose: z.string().trim().max(500),
  dataCategories: z.array(z.string().trim().min(1).max(200)).max(30),
  dataContext: z.enum(PRIVACY_TREATMENT_CONTEXTS),
  source: z.string().trim().max(500),
  requirement: z.enum(PRIVACY_TREATMENT_REQUIREMENTS),
  legalBasis: z.string().trim().max(500),
  legalBasisConfirmed: z.boolean(),
  role: z.enum(PRIVACY_TREATMENT_ROLES),
  recipients: z.array(z.string().trim().min(1).max(200)).max(30),
  transfers: z.string().trim().max(500),
  retention: z.string().trim().max(500),
  rightsChannel: z.string().trim().max(500),
});

export const updatePrivacyMapSchema = z
  .strictObject({ treatments: z.array(privacyTreatmentSchema).max(MAX_PRIVACY_TREATMENTS) })
  .refine(({ treatments }) => new Set(treatments.map(({ id }) => id)).size === treatments.length);

export type PrivacyTreatment = z.infer<typeof privacyTreatmentSchema>;
export type PrivacyTreatmentRole = (typeof PRIVACY_TREATMENT_ROLES)[number];
export type PrivacyTreatmentRequirement = (typeof PRIVACY_TREATMENT_REQUIREMENTS)[number];

export function isPrivacyTreatmentComplete(treatment: PrivacyTreatment): boolean {
  return (
    treatment.purpose.length > 0 &&
    treatment.dataCategories.length > 0 &&
    treatment.dataContext !== "undetermined" &&
    treatment.source.length > 0 &&
    treatment.requirement !== "undetermined" &&
    treatment.legalBasis.length > 0 &&
    treatment.legalBasisConfirmed &&
    treatment.role !== "undetermined" &&
    treatment.recipients.length > 0 &&
    treatment.transfers.length > 0 &&
    treatment.retention.length > 0 &&
    treatment.rightsChannel.length > 0
  );
}

export function isPrivacyMapComplete(treatments: PrivacyTreatment[]): boolean {
  return treatments.length > 0 && treatments.every(isPrivacyTreatmentComplete);
}
