import {
  COLLECTION_IMAGE_QUALITY,
  COLLECTION_MAX_IMAGE_SIZE,
  COLLECTION_NETWORKS,
} from "@ayni/api/collection-policy";
import { Hono } from "hono";
import { z } from "zod";

import type { Application } from "./applications";
import type {
  CollectionPolicy,
  UpdateCollectionPolicyInput,
  UpdateCollectionPolicyResult,
} from "./collection-policy-store";

const NOT_FOUND_MESSAGE = "No encontramos esta aplicación.";
const INVALID_POLICY_MESSAGE = "La política de recolección no es válida.";
const ENABLED_MESSAGE = "Indica si se permite la captura de imágenes para datasets.";
const CONSENT_MESSAGE = "Indica si la recolección exige consentimiento.";
const CONSENT_REQUIRED_MESSAGE =
  "La recolección exige una configuración explícita de consentimiento.";
const NETWORK_MESSAGE = "Selecciona una red permitida válida.";
const SIZE_MESSAGE = `El tamaño máximo debe ser un número entero entre ${COLLECTION_MAX_IMAGE_SIZE.min} y ${COLLECTION_MAX_IMAGE_SIZE.max} píxeles.`;
const QUALITY_MESSAGE = `La calidad debe ser un número entero entre ${COLLECTION_IMAGE_QUALITY.min} y ${COLLECTION_IMAGE_QUALITY.max}.`;
const EXTRA_FIELD_MESSAGE =
  "La política de recolección solo define la habilitación, el consentimiento, la red permitida, el tamaño máximo y la calidad.";

// Strict: the policy defines only these fields, so any other one is refused.
// Collection can only be enabled together with an explicit consent configuration.
const collectionPolicySchema = z
  .strictObject({
    enabled: z.boolean({ error: ENABLED_MESSAGE }),
    consentRequired: z.boolean({ error: CONSENT_MESSAGE }),
    network: z.enum(COLLECTION_NETWORKS, { error: NETWORK_MESSAGE }),
    maxImageSize: z
      .int({ error: SIZE_MESSAGE })
      .min(COLLECTION_MAX_IMAGE_SIZE.min, { error: SIZE_MESSAGE })
      .max(COLLECTION_MAX_IMAGE_SIZE.max, { error: SIZE_MESSAGE }),
    imageQuality: z
      .int({ error: QUALITY_MESSAGE })
      .min(COLLECTION_IMAGE_QUALITY.min, { error: QUALITY_MESSAGE })
      .max(COLLECTION_IMAGE_QUALITY.max, { error: QUALITY_MESSAGE }),
  })
  .refine((policy) => !policy.enabled || policy.consentRequired, {
    error: CONSENT_REQUIRED_MESSAGE,
  });

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  collectionPolicies: {
    get: (applicationId: string) => Promise<CollectionPolicy>;
    update: (input: UpdateCollectionPolicyInput) => Promise<UpdateCollectionPolicyResult>;
  };
};

export function createCollectionPolicyApp({
  getSession,
  applications,
  collectionPolicies,
}: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/collection-policy", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    }

    return c.json({ policy: await collectionPolicies.get(application.id) });
  });

  app.patch("/applications/:applicationId/collection-policy", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    // Checked before the body so a non-member never learns the application exists.
    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ message: INVALID_POLICY_MESSAGE }, 400);
    }

    const parsed = collectionPolicySchema.safeParse(rawBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message =
        issue?.code === "unrecognized_keys"
          ? EXTRA_FIELD_MESSAGE
          : (issue?.message ?? INVALID_POLICY_MESSAGE);
      return c.json({ message }, 400);
    }

    const result = await collectionPolicies.update({
      applicationId: application.id,
      userId: session.user.id,
      ...parsed.data,
    });

    if (result.ok === true) return c.json({ policy: result.policy });
    if (result.reason === "forbidden") {
      return c.json({ message: "No tienes permiso para cambiar la política de recolección." }, 403);
    }
    if (result.reason === "archived") {
      return c.json(
        {
          message: "No puedes cambiar la política de recolección de una aplicación archivada.",
          code: "applicationArchived",
        },
        409,
      );
    }

    return c.json({ message: NOT_FOUND_MESSAGE }, 404);
  });

  return app;
}
