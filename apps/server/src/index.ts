import { createHash } from "node:crypto";
import {
  createOpenApiDocument,
  HealthResponseSchema,
  PrivateDataResponseSchema,
  UnauthorizedResponseSchema,
} from "@ayni/api";
import { auth } from "@ayni/auth";
import { db } from "@ayni/db";
import {
  application,
  invitationLink,
  member,
  organization,
  sdkCredential,
  user,
} from "@ayni/db/schema/index";
import { env } from "@ayni/env/server";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { and, asc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { type Application, createApp, toApplication } from "./applications";
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
import {
  createSdkCredential,
  listSdkCredentials,
  revokeSdkCredential,
} from "./sdk-credential-store";
import { createSdkCredentialsApp } from "./sdk-credentials";
import { createWorkspacesApp, type WorkspaceItem } from "./workspaces";

export { toApplication };

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
  async authenticate(secret: string) {
    const secretHash = createHash("sha256").update(secret).digest("hex");
    const [candidate] = await db
      .select({ id: sdkCredential.id, applicationId: sdkCredential.applicationId })
      .from(sdkCredential)
      .where(eq(sdkCredential.secretHash, secretHash))
      .limit(1);
    if (!candidate) return false;

    return db.transaction(async (tx) => {
      const [foundApplication] = await tx
        .select({ status: application.status })
        .from(application)
        .where(eq(application.id, candidate.applicationId))
        .limit(1)
        .for("update");
      if (foundApplication?.status !== "active") return false;

      const [credential] = await tx
        .select({ id: sdkCredential.id, applicationId: sdkCredential.applicationId })
        .from(sdkCredential)
        .where(
          and(
            eq(sdkCredential.id, candidate.id),
            eq(sdkCredential.secretHash, secretHash),
            isNull(sdkCredential.revokedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!credential) return false;

      const [updated] = await tx
        .update(sdkCredential)
        .set({ lastUsedAt: new Date() })
        .where(and(eq(sdkCredential.id, credential.id), isNull(sdkCredential.revokedAt)))
        .returning({ id: sdkCredential.id });
      return Boolean(updated);
    });
  },
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
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route(
  "/",
  createApp({
    getSession: (headers) => auth.api.getSession({ headers }),
    applications,
  }),
);
app.route(
  "/",
  createWorkspacesApp({
    getSession: (headers) => auth.api.getSession({ headers }),
    workspaces,
  }),
);
app.route(
  "/",
  createMembersApp({
    getSession: (headers) => auth.api.getSession({ headers }),
    members,
  }),
);
app.route(
  "/",
  createInvitationsApp({
    getSession: (headers) => auth.api.getSession({ headers }),
    invitations,
  }),
);
app.route(
  "/",
  createSdkCredentialsApp({
    getSession: (headers) => auth.api.getSession({ headers }),
    applications,
    credentials: sdkCredentials,
  }),
);

const openApiApp = new OpenAPIHono();

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  responses: {
    200: {
      description: "Service health",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

openApiApp.openapi(healthRoute, (c) => {
  return c.json({ status: "ok" as const });
});

const privateRoute = createRoute({
  method: "get",
  path: "/private",
  tags: ["Example"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Private user data",
      content: {
        "application/json": {
          schema: PrivateDataResponseSchema,
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: UnauthorizedResponseSchema,
        },
      },
    },
  },
});

openApiApp.openapi(privateRoute, async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) {
    return c.json({ message: "Authentication required" }, 401);
  }

  return c.json({
    message: "This is private",
    user: session.user,
  });
});

openApiApp.doc("/openapi.json", createOpenApiDocument());
openApiApp.get("/docs", apiReference({ spec: { url: "/openapi.json" } }));
app.route("/", openApiApp);

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
