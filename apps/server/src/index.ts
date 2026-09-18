import {
  createOpenApiDocument,
  HealthResponseSchema,
  PrivateDataResponseSchema,
  UnauthorizedResponseSchema,
} from "@ayni/api";
import { auth } from "@ayni/auth";
import { db } from "@ayni/db";
import { application, member, organization, user } from "@ayni/db/schema/index";
import { env } from "@ayni/env/server";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { and, asc, eq, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { type Application, createApp, toApplication } from "./applications";
import { createMembersApp, type MemberItem, type UpdateMemberRoleResult } from "./members";
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
  async updateRole(
    requesterUserId: string,
    organizationId: string,
    memberId: string,
    newRole: "admin" | "member",
  ): Promise<UpdateMemberRoleResult> {
    return await db.transaction(async (tx) => {
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
        .where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)))
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
