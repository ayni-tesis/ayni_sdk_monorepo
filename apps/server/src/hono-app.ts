import { createHash } from "node:crypto";
import { createOpenApiDocument } from "@ayni/api";
import type { SdkConsentReceipt } from "@ayni/api/sdk-consent";
import type { SdkWorkflowTrace } from "@ayni/api/sdk-trace";
import { auth } from "@ayni/auth";
import { db } from "@ayni/db";
import {
  application,
  invitationLink,
  member,
  organization,
  user,
  userTermsAcceptance,
} from "@ayni/db/schema/index";
import { env } from "@ayni/env/server";
import { hasAcceptedCurrentTerms } from "@ayni/env/terms";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { and, asc, eq, gt, inArray, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getApplicationTraceMetrics } from "./application-trace-metrics-store";
import { createApplicationTracesApp } from "./application-traces";
import { type Application, createApp, toApplication } from "./applications";
import { createCollectionPolicyApp } from "./collection-policy";
import { getCollectionPolicy, updateCollectionPolicy } from "./collection-policy-store";
import { r2EvidenceStorage } from "./evidence-storage";
import {
  type AcceptResult,
  type CreatedInvitation,
  createInvitationsApp,
  type InvitationPreview,
  type InvitationRole,
} from "./invitations";
import {
  createMembersApp,
  type MemberItem,
  type RemoveMemberResult,
  type UpdateMemberRoleResult,
} from "./members";
import { createModel, listModels } from "./model-store";
import { r2ModelVersionStorage } from "./model-version-storage";
import {
  createModelVersionWithArtifact,
  deleteModelVersion,
  getSdkModelVersionManifest,
  listModelVersions,
  setModelVersionContract,
} from "./model-version-store";
import { createModelVersionsApp } from "./model-versions";
import { createValidationDatasetsApp } from "./validation-datasets";
import { r2ValidationDatasetStorage } from "./validation-dataset-storage";
import { createValidationDatasetStore } from "./validation-dataset-store";
import { createModelsApp } from "./models";
import {
  createPrivacyRightsRequest,
  getPublicPrivacyRightsRequest,
  listPrivacyRightsRequests,
  updatePrivacyRightsRequest,
} from "./privacy-rights-request-store";
import { createPrivacyRightsRequestsApp } from "./privacy-rights-requests";
import { createPrivacyTreatmentMapApp } from "./privacy-treatment-map";
import {
  getPrivacyTreatmentMap,
  getPublishedPrivacyNotice,
  publishPrivacyNotice,
  updatePrivacyTreatmentMap,
} from "./privacy-treatment-map-store";
import { createSdkCollectionPolicyApp } from "./sdk-collection-policy";
import { recordSdkConsentReceipt } from "./sdk-consent-store";
import { createSdkConsentsApp } from "./sdk-consents";
import {
  createSdkCredential,
  listSdkCredentials,
  regenerateSdkCredential,
  revokeSdkCredential,
  useSdkCredential,
} from "./sdk-credential-store";
import { createSdkCredentialsApp } from "./sdk-credentials";
import { createSdkEvidenceApp } from "./sdk-evidence";
import { createSdkEvidenceService, drizzleSdkEvidenceRepository } from "./sdk-evidence-store";
import { createSdkModelVersionsApp } from "./sdk-model-versions";
import { createSdkSyncApp } from "./sdk-sync";
import { createSdkValidationDatasetsApp } from "./sdk-validation-datasets";
import { getSdkSyncManifest } from "./sdk-sync-manifest-store";
import { createSdkTelemetryPolicyApp } from "./sdk-telemetry-policy";
import {
  getApplicationTrace,
  listApplicationTraceRecords,
  listApplicationTraceSummaries,
  purgeExpiredSdkTraces,
  storeSdkTrace,
} from "./sdk-trace-store";
import { createSdkTracesApp } from "./sdk-traces";
import { createSdkWorkflowVersionsApp } from "./sdk-workflow-versions";
import { createTelemetryPolicyApp } from "./telemetry-policy";
import { getTelemetryPolicy, updateTelemetryPolicy } from "./telemetry-policy-store";
import { createTelemetryRetentionApp } from "./telemetry-retention";
import {
  addConditionNode,
  addDatasetCaptureNode,
  addImageInputNode,
  addModelNode,
  addOutputNode,
  addWorkflowConnection,
  archiveWorkflow,
  createWorkflow,
  deleteWorkflowNode,
  deleteWorkflowNodes,
  getWorkflow,
  listWorkflows,
  removeWorkflowConnection,
  renameWorkflow,
  updateWorkflowNode,
  updateWorkflowNodePositions,
} from "./workflow-store";
import { getSdkWorkflowVersionDefinition, publishWorkflowVersion } from "./workflow-version-store";
import { createWorkflowsApp } from "./workflows";
import { createWorkspacesApp, type WorkspaceItem } from "./workspaces";

export { toApplication };

const hasCurrentTermsAcceptance = async (userId: string, version: unknown) => {
  if (typeof version !== "string" || !hasAcceptedCurrentTerms(version)) return false;
  const [acceptance] = await db
    .select({ id: userTermsAcceptance.id })
    .from(userTermsAcceptance)
    .where(and(eq(userTermsAcceptance.userId, userId), eq(userTermsAcceptance.version, version)))
    .limit(1);
  return Boolean(acceptance);
};

const getCurrentTermsSession = async (headers: Headers) => {
  const session = await auth.api.getSession({ headers });
  return session &&
    (await hasCurrentTermsAcceptance(session.user.id, session.user.termsAcceptedVersion))
    ? session
    : null;
};

const applications = {
  async getMembership(userId: string, organizationId: string) {
    const [membership] = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
      .limit(1);
    return membership?.role;
  },
  async create({ organizationId, name }: Pick<Application, "organizationId" | "name">) {
    const [created] = await db
      .insert(application)
      .values({ id: crypto.randomUUID(), organizationId, name })
      .returning();
    if (!created) throw new Error("Application creation returned no record");
    return toApplication(created);
  },
  async list(organizationId: string) {
    return (
      await db
        .select()
        .from(application)
        .where(eq(application.organizationId, organizationId))
        .orderBy(asc(application.createdAt))
    ).map(toApplication);
  },
  async get(id: string) {
    const [found] = await db.select().from(application).where(eq(application.id, id)).limit(1);
    return found && toApplication(found);
  },
  async rename(id: string, name: string) {
    const [updated] = await db
      .update(application)
      .set({ name })
      .where(eq(application.id, id))
      .returning();
    return updated && toApplication(updated);
  },
  async archive(id: string) {
    const [updated] = await db
      .update(application)
      .set({ status: "archived" })
      .where(eq(application.id, id))
      .returning();
    return updated && toApplication(updated);
  },
};

const models = {
  create(input: {
    applicationId: string;
    userId: string;
    name: string;
    runtime: "tensorflow_lite";
  }) {
    return createModel(db, input);
  },
  list(applicationId: string) {
    return listModels(db, applicationId);
  },
};

const modelVersions = {
  create(input: {
    applicationId: string;
    modelId: string;
    userId: string;
    version: string;
    bytes: Uint8Array;
    maxBytes: number;
  }) {
    return createModelVersionWithArtifact(db, r2ModelVersionStorage, input);
  },
  createUploadUrl(key: string, expiresIn: number) {
    return r2ModelVersionStorage.createUploadUrl(key, expiresIn);
  },
  getArtifactSize(key: string) {
    return r2ModelVersionStorage.getArtifactSize(key);
  },
  getArtifact(key: string) {
    return r2ModelVersionStorage.getArtifact(key);
  },
  removeArtifact(key: string) {
    return r2ModelVersionStorage.removeArtifact(key);
  },
  list(applicationId: string, modelId: string) {
    return listModelVersions(db, applicationId, modelId);
  },
  remove(input: {
    applicationId: string;
    modelId: string;
    modelVersionId: string;
    userId: string;
  }) {
    return deleteModelVersion(db, r2ModelVersionStorage, input);
  },
  setContract(input: Parameters<typeof setModelVersionContract>[2]) {
    return setModelVersionContract(db, r2ModelVersionStorage, input);
  },
};

const validationDatasets = createValidationDatasetStore({
  db,
  storage: r2ValidationDatasetStorage,
});

const workflows = {
  create(input: { applicationId: string; userId: string; name: string }) {
    return createWorkflow(db, input);
  },
  list(applicationId: string) {
    return listWorkflows(db, applicationId);
  },
  get(applicationId: string, workflowId: string) {
    return getWorkflow(db, applicationId, workflowId);
  },
  rename(input: { applicationId: string; workflowId: string; userId: string; name: string }) {
    return renameWorkflow(db, input);
  },
  archive(input: Parameters<typeof archiveWorkflow>[1]) {
    return archiveWorkflow(db, input);
  },
  addImageInput(input: Parameters<typeof addImageInputNode>[1]) {
    return addImageInputNode(db, input);
  },
  addModelNode(input: Parameters<typeof addModelNode>[1]) {
    return addModelNode(db, input);
  },
  addConditionNode(input: Parameters<typeof addConditionNode>[1]) {
    return addConditionNode(db, input);
  },
  addOutputNode(input: Parameters<typeof addOutputNode>[1]) {
    return addOutputNode(db, input);
  },
  addDatasetCaptureNode(input: Parameters<typeof addDatasetCaptureNode>[1]) {
    return addDatasetCaptureNode(db, input);
  },
  addConnection(input: Parameters<typeof addWorkflowConnection>[1]) {
    return addWorkflowConnection(db, input);
  },
  removeConnection(input: Parameters<typeof removeWorkflowConnection>[1]) {
    return removeWorkflowConnection(db, input);
  },
  updateNodePositions(input: Parameters<typeof updateWorkflowNodePositions>[1]) {
    return updateWorkflowNodePositions(db, input);
  },
  deleteNode(input: Parameters<typeof deleteWorkflowNode>[1]) {
    return deleteWorkflowNode(db, input);
  },
  deleteNodes(input: Parameters<typeof deleteWorkflowNodes>[1]) {
    return deleteWorkflowNodes(db, input);
  },
  updateNode(input: Parameters<typeof updateWorkflowNode>[1]) {
    return updateWorkflowNode(db, input);
  },
  publishVersion(input: Parameters<typeof publishWorkflowVersion>[1]) {
    return publishWorkflowVersion(db, input);
  },
};

const sdkCredentials = {
  create(input: { applicationId: string; userId: string }) {
    return createSdkCredential(db, input);
  },
  list(input: { applicationId: string; userId: string }) {
    return listSdkCredentials(db, input);
  },
  revoke(input: { applicationId: string; credentialId: string; userId: string }) {
    return revokeSdkCredential(db, input);
  },
  regenerate(input: { applicationId: string; credentialId: string; userId: string }) {
    return regenerateSdkCredential(db, input);
  },
};

const telemetryPolicies = {
  get(applicationId: string) {
    return getTelemetryPolicy(db, applicationId);
  },
  update(input: Parameters<typeof updateTelemetryPolicy>[1]) {
    return updateTelemetryPolicy(db, input);
  },
};

const collectionPolicies = {
  get(applicationId: string) {
    return getCollectionPolicy(db, applicationId);
  },
  update(input: Parameters<typeof updateCollectionPolicy>[1]) {
    return updateCollectionPolicy(db, input);
  },
};

const sdkModelVersions = {
  verify(secret: string) {
    return useSdkCredential(db, secret);
  },
  getManifest(applicationId: string, modelVersionId: string) {
    return getSdkModelVersionManifest(db, r2ModelVersionStorage, applicationId, modelVersionId);
  },
};

const sdkValidationDatasetCredentials = {
  verify(secret: string) {
    return useSdkCredential(db, secret, { reportArchivedApplication: true });
  },
};

const sdkSync = {
  verify(secret: string) {
    return useSdkCredential(db, secret);
  },
  getManifest(applicationId: string) {
    return getSdkSyncManifest(db, applicationId);
  },
};

const sdkConsents = {
  verify(secret: string) {
    return useSdkCredential(db, secret);
  },
  record(applicationId: string, receipt: SdkConsentReceipt) {
    return recordSdkConsentReceipt(db, { applicationId, ...receipt });
  },
};

const sdkWorkflowVersions = {
  verify(secret: string) {
    return useSdkCredential(db, secret);
  },
  getDefinition(applicationId: string, workflowVersionId: string) {
    return getSdkWorkflowVersionDefinition(db, applicationId, workflowVersionId);
  },
};

const sdkTelemetryPolicies = {
  verify(secret: string) {
    return useSdkCredential(db, secret);
  },
  get(applicationId: string) {
    return getTelemetryPolicy(db, applicationId);
  },
};

const sdkCollectionPolicies = {
  verify(secret: string) {
    return useSdkCredential(db, secret);
  },
  get(applicationId: string) {
    return getCollectionPolicy(db, applicationId);
  },
};

const sdkEvidenceAccess = {
  verify(secret: string) {
    return useSdkCredential(db, secret);
  },
  get(applicationId: string) {
    return getCollectionPolicy(db, applicationId);
  },
};

const sdkEvidenceService = createSdkEvidenceService({
  repository: drizzleSdkEvidenceRepository(db),
  storage: r2EvidenceStorage,
});

const sdkTraces = {
  verify(secret: string) {
    return useSdkCredential(db, secret);
  },
  get: (applicationId: string) => getTelemetryPolicy(db, applicationId),
  store: (applicationId: string, trace: SdkWorkflowTrace, retentionDays: 7 | 30 | 90) =>
    storeSdkTrace(db, { applicationId, trace, retentionDays }),
};

const workspaces = {
  async listByUser(userId: string): Promise<WorkspaceItem[]> {
    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId))
      .orderBy(asc(organization.name));

    return rows;
  },
};

const members = {
  getMembership: applications.getMembership,
  async listOthers(userId: string, organizationId: string): Promise<MemberItem[]> {
    return db
      .select({
        id: member.id,
        name: user.name,
        email: user.email,
        role: member.role,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(and(eq(member.organizationId, organizationId), ne(member.userId, userId)))
      .orderBy(asc(member.createdAt));
  },
  async remove(
    requesterUserId: string,
    organizationId: string,
    memberId: string,
  ): Promise<RemoveMemberResult> {
    return db.transaction(async (tx) => {
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .for("update");

      const [requester] = await tx
        .select({ id: member.id, role: member.role })
        .from(member)
        .where(and(eq(member.organizationId, organizationId), eq(member.userId, requesterUserId)))
        .limit(1)
        .for("update");
      if (!requester || (requester.role !== "admin" && requester.role !== "owner")) {
        return { ok: false, reason: "forbidden" as const };
      }

      const [target] = await tx
        .select({ id: member.id, role: member.role })
        .from(member)
        .where(and(eq(member.organizationId, organizationId), eq(member.id, memberId)))
        .limit(1)
        .for("update");
      if (!target) return { ok: false, reason: "not-found" as const };
      if (target.role === "owner") return { ok: false, reason: "owner" as const };

      if (target.role === "admin") {
        const admins = await tx
          .select({ id: member.id })
          .from(member)
          .where(
            and(
              eq(member.organizationId, organizationId),
              inArray(member.role, ["admin", "owner"]),
            ),
          )
          .for("update");
        if (admins.length <= 1) return { ok: false, reason: "last-admin" as const };
      }

      await tx.delete(member).where(eq(member.id, target.id));
      return { ok: true } as const;
    });
  },
  async updateRole(
    requesterUserId: string,
    organizationId: string,
    memberId: string,
    newRole: "admin" | "member",
  ): Promise<UpdateMemberRoleResult> {
    return await db.transaction(async (tx) => {
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .for("update");

      const [requester] = await tx
        .select({ role: member.role })
        .from(member)
        .where(and(eq(member.userId, requesterUserId), eq(member.organizationId, organizationId)))
        .limit(1);

      if (!requester || (requester.role !== "admin" && requester.role !== "owner")) {
        return { success: false, error: "FORBIDDEN" };
      }

      const [targetMember] = await tx
        .select({
          id: member.id,
          userId: member.userId,
          role: member.role,
          organizationId: member.organizationId,
          name: user.name,
          email: user.email,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)))
        .limit(1);

      if (!targetMember) {
        return { success: false, error: "MEMBER_NOT_FOUND" };
      }

      if (targetMember.userId === requesterUserId) {
        return { success: false, error: "SELF_MODIFICATION_NOT_ALLOWED" };
      }

      if (targetMember.role === "owner") {
        return { success: false, error: "CANNOT_MODIFY_OWNER" };
      }

      if (targetMember.role === "admin" && newRole === "member") {
        const remainingAdmins = await tx
          .select({ id: member.id })
          .from(member)
          .where(
            and(
              eq(member.organizationId, organizationId),
              ne(member.id, memberId),
              or(eq(member.role, "admin"), eq(member.role, "owner")),
            ),
          );

        if (remainingAdmins.length === 0) {
          return { success: false, error: "AT_LEAST_ONE_ADMIN_REQUIRED" };
        }
      }

      const [updated] = await tx
        .update(member)
        .set({ role: newRole })
        .where(
          and(
            eq(member.id, memberId),
            eq(member.organizationId, organizationId),
            ne(member.role, "owner"),
          ),
        )
        .returning();

      if (!updated) {
        return { success: false, error: "MEMBER_NOT_FOUND" };
      }

      return {
        success: true,
        member: {
          id: targetMember.id,
          name: targetMember.name,
          email: targetMember.email,
          role: newRole,
        },
      };
    });
  },
};

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateInvitationToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const invitations = {
  getMembership: applications.getMembership,
  async create({
    organizationId,
    role,
    createdById,
  }: {
    organizationId: string;
    role: InvitationRole;
    createdById: string;
  }): Promise<CreatedInvitation> {
    const token = generateInvitationToken();
    const [created] = await db
      .insert(invitationLink)
      .values({
        id: crypto.randomUUID(),
        tokenHash: hashInvitationToken(token),
        organizationId,
        role,
        inviterId: createdById,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      })
      .returning();
    if (!created) throw new Error("Invitation creation returned no record");
    return {
      id: created.id,
      token,
      organizationId: created.organizationId,
      role: created.role,
      inviterId: created.inviterId,
      expiresAt: created.expiresAt.toISOString(),
    };
  },
  async getByToken(token: string): Promise<InvitationPreview | undefined> {
    const [found] = await db
      .select({
        id: invitationLink.id,
        organizationId: organization.id,
        organizationName: organization.name,
        role: invitationLink.role,
        expiresAt: invitationLink.expiresAt,
      })
      .from(invitationLink)
      .innerJoin(organization, eq(invitationLink.organizationId, organization.id))
      .where(
        and(
          eq(invitationLink.tokenHash, hashInvitationToken(token)),
          eq(invitationLink.status, "pending"),
          gt(invitationLink.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!found) return undefined;
    return { ...found, expiresAt: found.expiresAt.toISOString() };
  },
  async accept(token: string, userId: string): Promise<AcceptResult | undefined> {
    return db.transaction(async (tx) => {
      const [invitation] = await tx
        .select()
        .from(invitationLink)
        .where(eq(invitationLink.tokenHash, hashInvitationToken(token)))
        .limit(1)
        .for("update");
      if (invitation?.status !== "pending" || invitation.expiresAt.getTime() <= Date.now()) {
        return undefined;
      }

      const [organizationRow] = await tx
        .select({ id: organization.id, name: organization.name })
        .from(organization)
        .where(eq(organization.id, invitation.organizationId))
        .limit(1);
      if (!organizationRow) return undefined;

      const [existingMembership] = await tx
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.userId, userId), eq(member.organizationId, invitation.organizationId)))
        .limit(1);
      if (existingMembership) return "already-member";

      const [insertedMembership] = await tx
        .insert(member)
        .values({
          id: crypto.randomUUID(),
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
        })
        .onConflictDoNothing()
        .returning({ id: member.id });
      if (!insertedMembership) {
        return "already-member";
      }

      await tx
        .update(invitationLink)
        .set({ status: "accepted" })
        .where(eq(invitationLink.id, invitation.id));

      return {
        id: invitation.id,
        organizationId: organizationRow.id,
        organizationName: organizationRow.name,
        role: invitation.role,
      };
    });
  },
};

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use("/api/auth/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (
    (c.req.method === "GET" && path === "/api/auth/get-session") ||
    (c.req.method === "POST" &&
      ["/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/sign-out"].includes(path))
  ) {
    return next();
  }
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (
    session &&
    !(await hasCurrentTermsAcceptance(session.user.id, session.user.termsAcceptedVersion))
  ) {
    return c.json({ message: "Debes aceptar los términos vigentes para continuar." }, 401);
  }
  return next();
});
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route(
  "/",
  createApp({
    getSession: getCurrentTermsSession,
    applications,
  }),
);
app.route(
  "/",
  createWorkspacesApp({
    getSession: getCurrentTermsSession,
    workspaces,
  }),
);
app.route(
  "/",
  createMembersApp({
    getSession: getCurrentTermsSession,
    members,
  }),
);
app.route(
  "/",
  createInvitationsApp({
    getSession: getCurrentTermsSession,
    invitations,
  }),
);
app.route(
  "/",
  createSdkCredentialsApp({
    getSession: getCurrentTermsSession,
    applications,
    credentials: sdkCredentials,
  }),
);
app.route(
  "/",
  createTelemetryPolicyApp({
    getSession: getCurrentTermsSession,
    applications,
    telemetryPolicies,
  }),
);
app.route(
  "/",
  createPrivacyTreatmentMapApp({
    getSession: getCurrentTermsSession,
    applications,
    privacyMaps: {
      get: (applicationId) => getPrivacyTreatmentMap(db, applicationId),
      getPublished: (applicationId) => getPublishedPrivacyNotice(db, applicationId),
      update: (input) => updatePrivacyTreatmentMap(db, input),
      publish: (input) => publishPrivacyNotice(db, input),
    },
  }),
);
app.route(
  "/",
  createPrivacyRightsRequestsApp({
    getSession: getCurrentTermsSession,
    applications,
    privacyMaps: { getPublished: (applicationId) => getPublishedPrivacyNotice(db, applicationId) },
    requests: {
      create: createPrivacyRightsRequest,
      getPublic: getPublicPrivacyRightsRequest,
      list: listPrivacyRightsRequests,
      update: updatePrivacyRightsRequest,
    },
    database: db,
  }),
);
app.route(
  "/",
  createCollectionPolicyApp({
    getSession: getCurrentTermsSession,
    applications,
    collectionPolicies,
  }),
);
app.route(
  "/",
  createModelsApp({
    getSession: getCurrentTermsSession,
    applications,
    models,
  }),
);
app.route(
  "/",
  createModelVersionsApp({
    getSession: getCurrentTermsSession,
    applications,
    modelVersions,
  }),
);
app.route(
  "/",
  createValidationDatasetsApp({
    getSession: getCurrentTermsSession,
    applications,
    validationDatasets,
    storage: r2ValidationDatasetStorage,
  }),
);
app.route(
  "/",
  createWorkflowsApp({
    getSession: getCurrentTermsSession,
    applications,
    workflows,
  }),
);
app.route(
  "/",
  createSdkModelVersionsApp({
    credentials: sdkModelVersions,
    modelVersions: sdkModelVersions,
  }),
);
app.route(
  "/",
  createSdkValidationDatasetsApp({
    credentials: sdkValidationDatasetCredentials,
    datasets: validationDatasets,
    storage: r2ValidationDatasetStorage,
  }),
);
app.route("/", createSdkSyncApp({ credentials: sdkSync, sync: sdkSync }));
app.route(
  "/",
  createSdkConsentsApp({
    credentials: sdkConsents,
    consents: sdkConsents,
  }),
);
app.route(
  "/",
  createSdkWorkflowVersionsApp({
    credentials: sdkWorkflowVersions,
    workflowVersions: sdkWorkflowVersions,
  }),
);
app.route(
  "/",
  createSdkTelemetryPolicyApp({
    credentials: sdkTelemetryPolicies,
    policies: sdkTelemetryPolicies,
  }),
);
app.route(
  "/",
  createSdkCollectionPolicyApp({
    credentials: sdkCollectionPolicies,
    policies: sdkCollectionPolicies,
  }),
);
app.route(
  "/",
  createSdkEvidenceApp({
    credentials: sdkEvidenceAccess,
    policies: sdkEvidenceAccess,
    evidence: sdkEvidenceService,
  }),
);
app.route(
  "/",
  createSdkTracesApp({
    credentials: sdkTraces,
    policies: sdkTraces,
    traces: sdkTraces,
  }),
);
app.route(
  "/",
  createApplicationTracesApp({
    getSession: getCurrentTermsSession,
    applications,
    traces: {
      getMetrics: (query) => getApplicationTraceMetrics(db, query),
      list: (query) => listApplicationTraceSummaries(db, query),
      get: (applicationId, traceId) => getApplicationTrace(db, applicationId, traceId),
      listRecords: (query) => listApplicationTraceRecords(db, query),
    },
  }),
);
app.route(
  "/",
  createTelemetryRetentionApp({
    cronSecret: env.CRON_SECRET,
    traces: { purgeExpired: () => purgeExpiredSdkTraces(db) },
  }),
);

const openApiApp = new OpenAPIHono();

openApiApp.get("/health", (c) => {
  return c.json({ status: "ok" as const });
});

openApiApp.doc("/openapi.json", createOpenApiDocument());
openApiApp.get("/docs", apiReference({ spec: { url: "/openapi.json" } }));
app.route("/", openApiApp);

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
