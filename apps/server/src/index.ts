import { createHash } from "node:crypto";
import {
  createOpenApiDocument,
  HealthResponseSchema,
  PrivateDataResponseSchema,
  UnauthorizedResponseSchema,
} from "@ayni/api";
import { auth } from "@ayni/auth";
import { db } from "@ayni/db";
import { application, invitationLink, member, organization, user } from "@ayni/db/schema/index";
import { env } from "@ayni/env/server";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { and, asc, eq, gt, ne } from "drizzle-orm";
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
import { createMembersApp, type MemberItem } from "./members";
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
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
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
