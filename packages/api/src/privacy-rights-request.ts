import { z } from "zod";

export const PRIVACY_RIGHTS_REQUEST_TYPES = [
  "access",
  "rectification",
  "cancellation",
  "opposition",
  "portability",
] as const;
export const PRIVACY_RIGHTS_REQUEST_STATUSES = [
  "received",
  "inReview",
  "answered",
  "notApplicable",
] as const;
export const privacyRightsRequestTypeSchema = z.enum(PRIVACY_RIGHTS_REQUEST_TYPES);
export const privacyRightsRequestStatusSchema = z.enum(PRIVACY_RIGHTS_REQUEST_STATUSES);

export const createPrivacyRightsRequestSchema = z.strictObject({
  treatmentId: z.uuid(),
  type: z.enum(PRIVACY_RIGHTS_REQUEST_TYPES),
  contactEmail: z.email().max(254),
  details: z.string().trim().max(2000).default(""),
});

export const updatePrivacyRightsRequestSchema = z
  .strictObject({
    status: z.enum(PRIVACY_RIGHTS_REQUEST_STATUSES),
    response: z.string().trim().max(4000).default(""),
    reason: z.string().trim().max(1000).default(""),
  })
  .refine(({ status, response, reason }) => {
    if (status === "answered") return response.length > 0;
    if (status === "notApplicable") return reason.length > 0;
    return response.length === 0 && reason.length === 0;
  });

export type CreatePrivacyRightsRequest = z.infer<typeof createPrivacyRightsRequestSchema>;
export type UpdatePrivacyRightsRequest = z.infer<typeof updatePrivacyRightsRequestSchema>;
